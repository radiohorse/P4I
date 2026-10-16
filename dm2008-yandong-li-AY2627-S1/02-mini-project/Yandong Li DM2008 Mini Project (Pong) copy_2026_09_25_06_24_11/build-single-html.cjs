const fs = require('node:fs');
const path = require('node:path');

// Run `node build-single-html.cjs` to rebuild the offline HTML after editing.
const root = __dirname;
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const scriptText = (source) => source.replace(/<\/script/gi, '<\\/script');
const audioFile = 'Luminous_Dance_cprsd.mp3';
const audioUrl = 'data:audio/mpeg;base64,' +
  fs.readFileSync(path.join(root, audioFile)).toString('base64');

let sketch = read('sketch.js');
const audioReference = `loadSound("${audioFile}")`;
if (!sketch.includes(audioReference)) {
  throw new Error('The music reference changed; update audioFile or audioReference.');
}
sketch = sketch.replace(audioReference, `loadSound(${JSON.stringify(audioUrl)})`);

let html = read('index.html');
const scripts = new Map([
  ['https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.js', 'p5.js'],
  ['https://cdn.jsdelivr.net/npm/p5.sound@0.4.1/dist/p5.sound.min.js', 'p5.sound.min.js'],
  ['p5.js', 'p5.js'],
  ['p5.sound.min.js', 'p5.sound.min.js'],
  ['sketch.js', 'sketch.js'],
]);
let scriptCount = 0;
html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi,
  (_, src) => {
    const name = scripts.get(src);
    if (!name) throw new Error(`Unknown script: ${src}`);
    scriptCount++;
    return `<script>\n${scriptText(name === 'sketch.js' ? sketch : read(name))}\n</script>`;
  });
if (scriptCount !== 3) throw new Error(`Expected 3 scripts, found ${scriptCount}.`);

const stylesheet = /<link\b[^>]*\bhref=["']style\.css["'][^>]*>/i;
if (!stylesheet.test(html)) throw new Error('Could not find style.css.');
html = html.replace(stylesheet, () =>
  `<style>\n${read('style.css').replace(/<\/style/gi, '<\\/style')}\n</style>`);
html = html.replace(/<meta charset="utf-8">/i, '');
html = html.replace(/<head>/i,
  '<head>\n<meta charset="utf-8">\n<title>PONG by Dong</title>\n' +
  '<!-- Standalone offline build. Rebuild with node build-single-html.cjs. -->');

const output = path.join(root, 'pong-standalone.html');
fs.writeFileSync(output, html, 'utf8');
console.log(`Created ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
