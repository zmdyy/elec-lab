import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceCommit = process.env.GITHUB_SHA || '1b720661430bd9373398c9d7ae5e611e8d864138';
const sourceBranch = process.env.GITHUB_REF_NAME || 'main';
const input = path.join(root, 'index.html');
const outputDir = path.join(root, 'dist');
const output = path.join(outputDir, 'elec-lab-offline.html');
let html = await readFile(input, 'utf8');
const stats = { stylesheets: [], scripts: [] };

function attr(tag, name) {
  const re = new RegExp('\\\\b' + name + '\\\\s*=\\\\s*(?:"([^"]*)"|\\'([^\\']*)\\'|([^\\\\s>]+))', 'i');
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}
function localPath(url, kind) {
  const clean = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  if (!clean || /^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(clean) || clean.startsWith('/')) {
    throw new Error(`External or absolute ${kind} dependency is not allowed in offline export: ${url}`);
  }
  const resolved = path.resolve(root, clean);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Dependency escapes repository root: ${url}`);
  }
  return resolved;
}
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

for (const tag of [...html.matchAll(/<link\\b[^>]*>/gi)].map(m => m[0])) {
  const rel = (attr(tag, 'rel') || '').toLowerCase().split(/\\s+/);
  const href = attr(tag, 'href');
  if (!href) continue;
  if (rel.includes('stylesheet')) {
    const file = localPath(href, 'stylesheet');
    const css = await readFile(file, 'utf8');
    if (/\\@import\\s+(?:url\\()?\\s*["']?https?:/i.test(css)) {
      throw new Error(`Remote CSS import found in ${href}`);
    }
    const styleTag = `<style data-offline-source="${escAttr(href)}">\\n${css}\\n</style>`;
    html = html.replace(tag, styleTag);
    stats.stylesheets.push({ file: href, bytes: Buffer.byteLength(css) });
  } else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
    html = html.replace(tag, '');
  }
}

const scriptTags = [...html.matchAll(/<script\\b[^>]*\\bsrc\\s*=\\s*(?:"[^"]*"|'[^']*')[^>]*>\\s*<\\/script\\s*>/gi)].map(m => m[0]);
for (const tag of scriptTags) {
  const src = attr(tag, 'src');
  if (!src) continue;
  const file = localPath(src, 'script');
  const js = await readFile(file, 'utf8');
  const openEnd = tag.indexOf('>');
  const attrs = tag.slice('<script'.length, openEnd)
    .replace(/\\s+src\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)/i, '');
  const inline = js.replace(/<\\/script/gi, '<\\\\/script');
  const replacement = `<script${attrs} data-offline-source="${escAttr(src)}">\\n${inline}\\n</script>`;
  html = html.replace(tag, replacement);
  stats.scripts.push({ file: src, bytes: Buffer.byteLength(js) });
}

// Ensure that no executable or stylesheet dependency remains external.
if (/<script\\b[^>]*\\bsrc\\s*=/i.test(html)) throw new Error('A script src dependency remains after bundling.');
if (/<link\\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=/i.test(html)) throw new Error('A stylesheet link remains after bundling.');
const resourceTags = [...html.matchAll(/<(?:img|iframe|audio|video|source|object|embed)\\b[^>]*>/gi)].map(m => m[0]);
for (const tag of resourceTags) {
  for (const name of ['src', 'data', 'poster']) {
    const value = attr(tag, name);
    if (value && !/^(?:data:|blob:|#)/i.test(value)) {
      throw new Error(`Unbundled media dependency found: ${tag}`);
    }
  }
}
const externalCssUrls = [...html.matchAll(/url\\(\\s*["']?(https?:|\\/\\/)[^)]*\\)/gi)];
if (externalCssUrls.length) throw new Error('Remote CSS asset URLs remain in the exported document.');

html = html.replace('<head>', `<head>\\n<meta name="offline-export" content="single-file; source=zmdyy/elec-lab; branch=${escAttr(sourceBranch)}; commit=${escAttr(sourceCommit)}">`);
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\\n<!-- Single-file offline build from zmdyy/elec-lab @ ${sourceCommit}. All local CSS/JS assets are embedded below. -->`);
await mkdir(outputDir, { recursive: true });
await writeFile(output, html, 'utf8');
const bytes = Buffer.byteLength(html);
console.log(JSON.stringify({ output: 'dist/elec-lab-offline.html', bytes, ...stats }, null, 2));
