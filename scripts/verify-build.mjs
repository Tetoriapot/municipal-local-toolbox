import { readdir, readFile, access } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { tools } from '../src/data/tools.ts';

const root = resolve(process.env.BUILD_DIR || 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(join(dir, entry.name)) : join(dir, entry.name)))).flat();
}
const files = await filesIn(root);
let links = 0, pages = 0;
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  pages++;
  assert.match(html, /<html[^>]+lang="ja"/, file + ': lang');
  assert.match(html, /<title>[^<]+<\/title>/, file + ': title');
  assert.match(html, /name="viewport"/, file + ': viewport');
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const raw = match[1].replaceAll('&amp;', '&');
    if (/^(?:https?:|data:|blob:|mailto:|tel:)/.test(raw)) continue;
    const [withoutHash, fragment] = raw.split('#');
    const pathname = decodeURIComponent(withoutHash.split('?')[0]);
    let path;
    if (!pathname) path = file;
    else if (pathname.startsWith('/')) {
      assert.ok(!base || pathname.startsWith(base + '/'), 'Link ignores BASE_PATH: ' + raw);
      path = join(root, pathname.slice(base.length));
    } else path = resolve(dirname(file), pathname);
    if (pathname.endsWith('/')) path = join(path, 'index.html');
    assert.ok(!relative(root, path).startsWith('..'), 'Link leaves output directory');
    await access(path).catch(() => { throw new Error('Broken link from ' + relative(root, file) + ': ' + raw); });
    if (fragment && path.endsWith('.html')) {
      const target = await readFile(path, 'utf8');
      assert.ok(target.includes('id="' + decodeURIComponent(fragment) + '"'), 'Missing fragment: ' + raw);
    }
    links++;
  }
}
const manifest = JSON.parse(await readFile(join(root, 'downloads/manifest.json'), 'utf8'));
for (const tool of tools) {
  const html = await readFile(join(root, 'downloads', tool.id + '.html'));
  const txt = await readFile(join(root, 'downloads', tool.id + '.txt'));
  assert.ok(html.equals(txt), tool.id + ': HTML and TXT differ');
  const text = html.toString('utf8');
  assert.doesNotMatch(text, /<(?:script|link|img|iframe)\b[^>]*(?:src|href)=["'](?:https?:|\/\/)/i);
  assert.doesNotMatch(text, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(text, /@import|url\s*\(\s*["']?https?:/);
  assert.match(text, /connect-src 'none'/);
  assert.match(text, /バックアップ/);
  if (tool.status === 'preview') assert.match(text, /配布確認版/);
  const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2, tool.id + ': theme and runtime scripts');
  for (const [index, script] of scripts.entries()) new Script(script[1], { filename: tool.id + '-' + index + '.html' });
  assert.equal(createHash('sha256').update(html).digest('hex'), manifest.find(item => item.id === tool.id).sha256);
}
console.log('Verified ' + pages + ' HTML files, ' + links + ' local links, and 8 identical offline distribution pairs.');
