#!/usr/bin/env node
// Build the single-file distribution of Ambient Hands.
//
//   node tools/build-single-html.mjs
//   node tools/build-single-html.mjs --entry index.html --out ambient-hands.html
//
// Reads the original project files; writes only the one output HTML.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSingleHtml, DEFAULT_BUILD_NOTE } from "./single-html-bundler.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = { entry: "index.html", out: "ambient-hands.html" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--entry") options.entry = argv[++i];
    else if (flag === "--out") options.out = argv[++i];
    else if (flag === "--help" || flag === "-h") {
      console.log("Usage: node tools/build-single-html.mjs [--entry index.html] [--out ambient-hands.html]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

const note = DEFAULT_BUILD_NOTE;

const options = parseArgs(process.argv.slice(2));
const result = await buildSingleHtml({
  root: ROOT,
  entryHtml: options.entry,
  outFile: options.out,
  note,
  log: (message) => console.log(`  ${message}`),
});

console.log("");
console.log(`Built ${result.output}`);
console.log(`  size:             ${result.stats.megabytes} MB (${result.stats.totalBytes} bytes)`);
console.log(`  styles inlined:   ${result.stats.styleCount}`);
console.log(`  scripts inlined:  ${result.stats.scriptCount} classic + 1 bundle`);
console.log(`  bundle modules:   ${result.stats.bundle.modules.length} (${result.stats.bundle.modules.join(", ")})`);
console.log(`  embedded assets:  ${result.stats.embeddedFonts}`);
