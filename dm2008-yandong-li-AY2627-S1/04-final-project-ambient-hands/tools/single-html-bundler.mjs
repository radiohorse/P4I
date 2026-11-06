// Single-file HTML builder for Ambient Hands.
//
// It reads the original page (index.html), its stylesheets, classic scripts,
// local fonts and ES modules, then writes ONE self-contained .html file.
// The originals are opened read-only and are never written to.
//
// The bundled app is an IIFE assembled from src/*.js: relative imports and
// exports are resolved offline, so the result runs as a classic script and
// therefore works when the HTML is opened directly (file://) without a server.
//
// Usage (see tools/build-single-html.mjs):
//   node tools/build-single-html.mjs
//   node tools/build-single-html.mjs --entry index.html --out ambient-hands.html

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_BUILD_NOTE =
  "The ml5.js hand model is still downloaded from its CDN on first use, so hand tracking needs network access; everything else is embedded.";

const MIME_BY_EXT = {
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
};

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function attrOf(attributeText, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = attributeText.match(re);
  return match ? (match[1] ?? match[2]) : null;
}

function isExternalUrl(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

// Replace regex matches with async replacement results, preserving everything
// between matches (keeps the source page's order and formatting).
async function replaceMatchesAsync(html, regex, replacer) {
  const matches = [...html.matchAll(regex)];
  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += html.slice(cursor, match.index);
    output += await replacer(match);
    cursor = match.index + match[0].length;
  }
  return output + html.slice(cursor);
}

// ---------------------------------------------------------------------------
// Minimal ES-module bundler (supports only what this project uses)
// ---------------------------------------------------------------------------

const IMPORT_RE = /^[ \t]*import[ \t]+([\s\S]*?)[ \t]+from[ \t]*["']([^"']+)["'];?[ \t]*$/gm;
const REEXPORT_RE = /^[ \t]*export[ \t]*\{([\s\S]*?)\}[ \t]*from[ \t]*["']([^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^[ \t]*export[ \t]+(async[ \t]+function|function|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^[ \t]*export[ \t]*\{([\s\S]*?)\}[ \t]*;?[ \t]*$/gm;

function splitNameList(list) {
  return list
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item.split(/\s+as\s+/).map((part) => part.trim());
      if (parts.length > 2 || !parts[0]) {
        throw new Error(`Unsupported import/export entry: "${item}"`);
      }
      return { source: parts[0], local: parts[1] || parts[0] };
    });
}

function parseModule(rel, source) {
  const dependencies = []; // { specifier, resolved, names: [{ source, local }] }
  const reexports = []; // { specifier, resolved, imported, exported }
  const exportEntries = []; // { exported, local }
  let body = source;

  // 1) export { A, B as C } from "./other.js";
  body = body.replace(REEXPORT_RE, (_match, list, specifier) => {
    for (const entry of splitNameList(list)) {
      reexports.push({ specifier, imported: entry.source, exported: entry.local });
    }
    return "";
  });

  // 2) import { A, B } from "./other.js"; (single-line or multi-line)
  body = body.replace(IMPORT_RE, (_match, clause, specifier) => {
    const trimmed = clause.trim();
    if (trimmed.startsWith("*")) {
      throw new Error(`Namespace imports are not supported (${rel})`);
    }
    const brace = trimmed.match(/\{([\s\S]*)\}/);
    if (!brace) {
      throw new Error(`Default imports are not supported (${rel}: "${trimmed}")`);
    }
    const before = trimmed.slice(0, trimmed.indexOf("{")).trim();
    const after = trimmed.slice(trimmed.lastIndexOf("}") + 1).trim();
    if (before || after) {
      throw new Error(`Unsupported import form (${rel}: "${trimmed}")`);
    }
    dependencies.push({
      specifier,
      names: splitNameList(brace[1]),
    });
    return "";
  });

  // 3) export const/let/var/function/class
  body = body.replace(EXPORT_DECL_RE, (_match, kind, name) => {
    exportEntries.push({ exported: name, local: name });
    return `${kind} ${name}`;
  });

  // 4) export { A, B as C }; (local export list)
  body = body.replace(EXPORT_LIST_RE, (_match, list) => {
    for (const entry of splitNameList(list)) {
      exportEntries.push({ exported: entry.local, local: entry.source });
    }
    return "";
  });

  const leftover = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^export\b/.test(line));
  if (leftover.length > 0) {
    throw new Error(`Unsupported export statement in ${rel}: ${leftover[0]}`);
  }
  const leftoverImports = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^import\b/.test(line));
  if (leftoverImports.length > 0) {
    throw new Error(`Unsupported import statement in ${rel}: ${leftoverImports[0]}`);
  }

  return { rel, body, dependencies, reexports, exportEntries };
}

async function collectModules(root, entryRel) {
  const modules = new Map();
  const order = [];
  const states = new Map();

  async function visit(rel) {
    const state = states.get(rel);
    if (state === "done") return;
    if (state === "visiting") {
      throw new Error(`Circular module dependency detected at ${rel}`);
    }
    states.set(rel, "visiting");

    const abs = path.resolve(root, rel);
    if (!existsSync(abs)) {
      throw new Error(`Module not found: ${rel}`);
    }
    const parsed = parseModule(rel, await readFile(abs, "utf8"));

    const resolve = (specifier) => {
      if (!specifier.startsWith(".")) {
        throw new Error(`Only relative imports are supported (${rel} -> "${specifier}")`);
      }
      const target = toPosix(path.relative(root, path.resolve(root, path.dirname(rel), specifier)));
      if (!existsSync(path.resolve(root, target))) {
        throw new Error(`Missing imported module: ${rel} -> ${specifier}`);
      }
      return target;
    };
    parsed.dependencies.forEach((dependency) => {
      dependency.resolved = resolve(dependency.specifier);
    });
    parsed.reexports.forEach((reexport) => {
      reexport.resolved = resolve(reexport.specifier);
    });

    for (const dependency of parsed.dependencies) await visit(dependency.resolved);
    for (const reexport of parsed.reexports) await visit(reexport.resolved);

    modules.set(rel, parsed);
    order.push(rel);
    states.set(rel, "done");
  }

  await visit(entryRel);

  // Every re-export must point at a real export of its target module.
  for (const module of modules.values()) {
    for (const reexport of module.reexports) {
      const target = modules.get(reexport.resolved);
      const available = new Set([
        ...target.exportEntries.map((entry) => entry.exported),
        ...target.reexports.map((entry) => entry.exported),
      ]);
      if (!available.has(reexport.imported)) {
        throw new Error(
          `${module.rel} re-exports "${reexport.imported}" from ${target.rel}, but it is not exported there`,
        );
      }
    }
  }

  return order.map((rel) => modules.get(rel));
}

function emitBundle(modules, entryRel) {
  const ids = new Map(modules.map((module, index) => [module.rel, `__ambientModule${index}`]));
  const chunks = [];

  for (const module of modules) {
    const id = ids.get(module.rel);
    const importedBindings = [];
    const localNames = new Map();
    for (const dependency of module.dependencies) {
      for (const name of dependency.names) {
        if (localNames.has(name.local)) {
          throw new Error(`Duplicate imported binding "${name.local}" in ${module.rel}`);
        }
        localNames.set(name.local, true);
        importedBindings.push({
          local: name.local,
          imported: name.source,
          resolved: dependency.resolved,
        });
      }
    }

    const selfDeclared = new Set(module.exportEntries.map((entry) => entry.local));
    for (const binding of importedBindings) {
      if (selfDeclared.has(binding.local)) {
        throw new Error(`Import "${binding.local}" collides with a declaration in ${module.rel}`);
      }
    }

    const returnEntries = [];
    const exportedNames = new Set();
    for (const entry of module.exportEntries) {
      if (exportedNames.has(entry.exported)) {
        throw new Error(`Duplicate export "${entry.exported}" in ${module.rel}`);
      }
      exportedNames.add(entry.exported);
      returnEntries.push(
        entry.exported === entry.local ? entry.exported : `${entry.exported}: ${entry.local}`,
      );
    }
    for (const reexport of module.reexports) {
      if (exportedNames.has(reexport.exported)) {
        throw new Error(`Duplicate export "${reexport.exported}" in ${module.rel}`);
      }
      exportedNames.add(reexport.exported);
      returnEntries.push(
        `${reexport.exported}: ${ids.get(reexport.resolved)}.${reexport.imported}`,
      );
    }

    chunks.push(`/* ---- ${module.rel} ---- */`);
    chunks.push(`const ${id} = (() => {`);
    for (const binding of importedBindings) {
      chunks.push(`const ${binding.local} = ${ids.get(binding.resolved)}.${binding.imported};`);
    }
    chunks.push("");
    chunks.push(module.body.trimEnd());
    chunks.push("");
    chunks.push(`return { ${returnEntries.join(", ")} };`);
    chunks.push(`})();`);
    chunks.push("");
  }

  return {
    code: `(function () {\n"use strict";\n// Generated app bundle: ${modules.length} modules, entry ${entryRel}.\n\n${chunks.join("\n")}})();\n`,
    moduleOrder: modules.map((module) => module.rel),
  };
}

export async function bundleEsModules({ root, entry }) {
  const entryRel = toPosix(entry);
  const modules = await collectModules(root, entryRel);
  return emitBundle(modules, entryRel);
}

// ---------------------------------------------------------------------------
// Asset inlining
// ---------------------------------------------------------------------------

function embedCssUrls(css, cssAbsoluteDir) {
  let embedded = 0;
  const output = css.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/g,
    (match, doubleQuoted, singleQuoted, bare) => {
      const url = (doubleQuoted ?? singleQuoted ?? bare ?? "").trim();
      if (!url || /^(?:data:|#)/i.test(url)) return match;
      if (/^(?:https?:)?\/\//i.test(url)) return match; // remote assets stay remote
      const clean = url.split(/[?#]/)[0];
      const absolute = path.resolve(cssAbsoluteDir, clean);
      if (!existsSync(absolute)) {
        throw new Error(`CSS asset not found: ${url} (from ${cssAbsoluteDir})`);
      }
      const extension = path.extname(clean).toLowerCase();
      const mime = MIME_BY_EXT[extension] || "application/octet-stream";
      const base64 = readFileSync(absolute).toString("base64");
      embedded += 1;
      return `url("data:${mime};base64,${base64}")`;
    },
  );
  return { css: output, embedded };
}

function escapeInlineScript(code) {
  if (!/<\/script/i.test(code)) return code;
  return code.replace(/<\/script/gi, "<\\/script");
}

function assertNoInlineClose(text, closingTag, source) {
  if (new RegExp(`</${closingTag}`, "i").test(text)) {
    throw new Error(`Inlined ${source} contains a literal </${closingTag} sequence; cannot inline safely`);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Single-file HTML build
// ---------------------------------------------------------------------------

export async function buildSingleHtml({
  root,
  entryHtml = "index.html",
  outFile,
  note,
  log = () => {},
}) {
  const projectRoot = path.resolve(root);
  const entryHtmlRel = toPosix(entryHtml);
  const entryHtmlAbs = path.resolve(projectRoot, entryHtmlRel);
  if (!existsSync(entryHtmlAbs)) {
    throw new Error(`Entry HTML not found: ${entryHtmlAbs}`);
  }
  const baseDir = path.dirname(entryHtmlRel);

  const resolveUrl = (url) => {
    const clean = url.split(/[?#]/)[0];
    if (clean.startsWith("/")) return path.resolve(projectRoot, `.${clean}`);
    return path.resolve(projectRoot, baseDir, clean);
  };
  const relOf = (absolute) => toPosix(path.relative(projectRoot, absolute));

  let html = await readFile(entryHtmlAbs, "utf8");
  const stats = {
    entryHtml: entryHtmlRel,
    styles: [],
    scripts: [],
    bundle: null,
    embeddedFonts: 0,
    fontBytes: 0,
  };

  // Drop source-page comments: the build note replaces them, and the old
  // "run this through a local server" instructions no longer apply.
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // 1) Inline local stylesheets (fonts become data: URIs).
  html = await replaceMatchesAsync(html, /<link\b[^>]*>/gi, async (match) => {
    const tag = match[0];
    const rel = attrOf(tag, "rel") || "";
    if (!/\bstylesheet\b/i.test(rel)) return tag;
    const href = attrOf(tag, "href");
    if (!href) return tag;
    if (isExternalUrl(href)) {
      throw new Error(`External stylesheet cannot be embedded: ${href}`);
    }
    const absolute = resolveUrl(href);
    if (!existsSync(absolute)) {
      throw new Error(`Stylesheet not found: ${href}`);
    }
    const relPath = relOf(absolute);
    const css = readFileSync(absolute, "utf8");
    const { css: embeddedCss, embedded } = embedCssUrls(css, path.dirname(absolute));
    assertNoInlineClose(embeddedCss, "style", relPath);
    stats.styles.push({ source: relPath, bytes: Buffer.byteLength(embeddedCss) });
    stats.embeddedFonts += embedded;
    log(`inlined <style> ${relPath} (${embedded} embedded asset(s))`);
    return `<style data-source="${relPath}">\n${embeddedCss}\n</style>`;
  });

  // 2) Inline local classic scripts; bundle the ES module entry.
  html = await replaceMatchesAsync(html, /<script\b([^>]*)><\/script>/gi, async (match) => {
    const attributes = match[1] || "";
    const src = attrOf(attributes, "src");
    if (!src) return match[0]; // inline script: leave exactly as it is
    if (isExternalUrl(src)) return match[0]; // remote script: leave remote
    const absolute = resolveUrl(src);
    if (!existsSync(absolute)) {
      throw new Error(`Script not found: ${src}`);
    }
    const relPath = relOf(absolute);
    const isModule = /\btype\s*=\s*["']module["']/i.test(attributes);
    if (isModule) {
      const bundle = await bundleEsModules({ root: projectRoot, entry: relPath });
      if (stats.bundle) throw new Error("The page has more than one ES-module script entry");
      stats.bundle = { entry: relPath, modules: bundle.moduleOrder, bytes: Buffer.byteLength(bundle.code) };
      log(`bundled ES modules from ${relPath} (${bundle.moduleOrder.length} modules)`);
      return `<script data-source="bundle:${relPath}">\n${escapeInlineScript(bundle.code, relPath)}\n</script>`;
    }
    const code = readFileSync(absolute, "utf8");
    stats.scripts.push({ source: relPath, bytes: Buffer.byteLength(code) });
    log(`inlined <script> ${relPath}`);
    return `<script data-source="${relPath}">\n${escapeInlineScript(code, relPath)}\n</script>`;
  });

  // 3) Add a short build note right after <head>.
  if (!/<head[\s>]/i.test(html)) {
    throw new Error(`Entry HTML has no <head>: ${entryHtmlRel}`);
  }
  const buildNote = [
    "Single-file build of Ambient Hands.",
    "Generated by tools/build-single-html.mjs from index.html, css/, js/, src/ and assets/fonts/.",
    "Edit those source files, not this file. The original source files are unchanged.",
    note ? note.replace(/--/g, "-") : "",
  ]
    .filter(Boolean)
    .join(" ");
  html = html.replace(/<head[^>]*>/i, (match) => `${match}\n    <!-- ${buildNote} -->`);

  // 4) Validate: no local references may survive outside the inlined blocks.
  const skeleton = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const externalReference = skeleton.match(
    /\b(?:src|href)\s*=\s*["'](?!data:|https?:|#|mailto:|javascript:)[^"']+["']/i,
  );
  if (externalReference) {
    throw new Error(`Unresolved external reference in output: ${externalReference[0]}`);
  }
  if (/\btype\s*=\s*["']module["']/i.test(skeleton)) {
    throw new Error("A module script remains in the output");
  }

  // 5) Syntax-check the assembled app bundle (compile only, do not run).
  if (!stats.bundle) {
    throw new Error("The page has no ES-module entry to bundle");
  }
  const bundleMatch = html.match(/<script data-source="bundle:([^"]+)">([\s\S]*?)<\/script>/);
  if (!bundleMatch) throw new Error("Bundled script missing from output");
  try {
    // eslint-disable-next-line no-new-func
    new Function(bundleMatch[2]);
  } catch (error) {
    throw new Error(`Bundled app script has a syntax error: ${error.message}`);
  }

  const outputPath = path.resolve(projectRoot, outFile);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");

  const bytes = Buffer.byteLength(html);
  return {
    output: relOf(outputPath),
    absoluteOutput: outputPath,
    bytes,
    stats: {
      ...stats,
      totalBytes: bytes,
      megabytes: Number((bytes / (1024 * 1024)).toFixed(2)),
      styleCount: stats.styles.length,
      scriptCount: stats.scripts.length,
    },
  };
}
