/**
 * Walks the generated site and reports any relative link or asset reference
 * that doesn't resolve to a file on disk.
 *
 *   node scripts/check-links.mjs
 *
 * Exits non-zero if anything is broken, so it works as a pre-deploy gate.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve('docs');

const pages = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.html')) pages.push(path);
  }
})(ROOT);

const problems = [];
const attr = /(?:href|src)="([^"]+)"/g;

for (const file of pages) {
  const source = readFileSync(file, 'utf8');
  let match;
  while ((match = attr.exec(source))) {
    const raw = match[1];
    // Absolute and non-navigational references are out of scope. The single
    // root-relative href is 404.html's fallback, which its own inline script
    // rewrites at runtime from the URL.
    if (/^(https?:|mailto:|#|data:|\/)/.test(raw)) continue;
    const [path] = raw.split('#');
    if (!path) continue;
    let target = resolve(dirname(file), path);
    if (path.endsWith('/')) target = join(target, 'index.html');
    if (!existsSync(target)) problems.push(`${relative(ROOT, file)} -> ${raw}`);
    else if (!target.startsWith(ROOT))
      problems.push(`${relative(ROOT, file)} escapes docs/: ${raw}`);
  }
}

console.log(`checked ${pages.length} pages`);
if (problems.length) {
  console.log(`\n${problems.length} broken:\n` + [...new Set(problems)].join('\n'));
  process.exit(1);
}
console.log('no broken links or missing assets');
