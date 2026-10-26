import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { tools } from '../src/data/tools.ts';

const source = new URL('../tools-src/shared/', import.meta.url);
const output = new URL('../public/downloads/', import.meta.url);
const [template, css, runtime, helpers] = await Promise.all(['template.html', 'style.css', 'runtime.js', 'backup.mjs'].map(name => readFile(new URL(name, source), 'utf8')));
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await mkdir(output, { recursive: true });
const manifest = [];
const commonModules = await Promise.all(['fields.ts', 'dom.ts', 'local-store.ts', 'shell.ts', 'drafts.ts', 'experience.ts', 'import-comparison.mjs', 'recovery.ts'].map(name => readFile(new URL(name, source), 'utf8')));
const [themeInit, shellCss] = await Promise.all(['theme-init.js', 'shell.css'].map(name => readFile(new URL(name, source), 'utf8')));
async function inlineCss(text, directory) {
  const imports = [...text.matchAll(/@import\s+["']([^"']+)["'];/g)];
  for (const match of imports) {
    const path = new URL(match[1], directory);
    if (path.protocol !== 'file:' || !path.href.startsWith(new URL('../tools-src/', import.meta.url).href)) throw new Error('CSS imports must stay in tools-src');
    text = text.replace(match[0], await readFile(path, 'utf8'));
  }
  return text;
}
for (const tool of tools) {
  let toolTemplate = template;
  let toolCss = css;
  let script = runtime.replace('/* CONFIG */ {}', JSON.stringify({ id: tool.id, name: tool.name }).replaceAll('<', '\\u003c')).replace('/* BACKUP_HELPERS */', (helpers + '\n' + commonModules[6]).replace(/^export /gm, ''));
  if (tool.status === 'ready') {
    const directory = new URL('../tools-src/' + tool.id + '/', import.meta.url);
    const sources = await Promise.all(['template.html', 'style.css', 'model.ts', 'runtime.ts', 'sample.json'].map(name => readFile(new URL(name, directory), 'utf8')));
    [toolTemplate, toolCss] = sources;
    toolCss = await inlineCss(toolCss, directory);
    const extensions = await Promise.all((tool.id === 'equipment-manager' ? ['csv.ts','csv-runtime.ts'] : tool.id === 'handover-note' ? ['examples.ts'] : []).map(name => readFile(new URL(name,directory),'utf8')));
    const combined = ['const sample = ' + JSON.stringify(JSON.parse(sources[4])).replaceAll('<','\\u003c') + ';', helpers, ...commonModules.filter((_,index)=>index !== 3), sources[2], ...extensions, sources[3]].map(source => source.replace(/^(?:import .*?;|export (?:type )?\{.*?\} from .*?;)\r?$/gm, '').replace(/^export /gm, '')).join('\n');
    const compiled = ts.transpileModule('(() => {\n' + combined + '\n})();', {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
      reportDiagnostics: true,
    });
    const errors = compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) throw new Error(tool.id + ': ' + errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'));
    script = compiled.outputText;
  }
  const shellSource = [commonModules[1], commonModules[3]].map(text => text.replace(/^import .*?;\r?$/gm, '').replace(/^export /gm, '')).join('\n');
  script += ts.transpileModule('(() => {\n' + shellSource + '\nsetupToolShell(' + JSON.stringify({ id:tool.id, name:tool.name, version:tool.version, ready:tool.status === 'ready' }).replaceAll('<','\\u003c') + ');\n})();', { compilerOptions: { target:ts.ScriptTarget.ES2022 } }).outputText;
  toolCss += '\n' + shellCss;
  toolTemplate = toolTemplate.replace('</head>', '<script>' + themeInit + '</script></head>');
  if (tool.status === 'ready') toolTemplate = toolTemplate.replace('<body>', '<body><span id="sample" hidden></span>');
  const replacements = { NAME: escapeHtml(tool.name), VERSION: tool.version, CSS: toolCss, SCRIPT: script };
  const html = toolTemplate.replace(/\{\{(NAME|VERSION|CSS|SCRIPT)\}\}/g, (_, key) => replacements[key]);
  if (/\{\{\w+\}\}/.test(html)) throw new Error('Unresolved template token: ' + tool.id);
  const bytes = Buffer.from(html, 'utf8');
  await writeFile(new URL(tool.id + '.html', output), bytes);
  await writeFile(new URL(tool.id + '.txt', output), bytes);
  manifest.push({ id: tool.id, version: tool.version, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(new URL('manifest.json', output), JSON.stringify(manifest, null, 2) + '\n');
console.log('Generated ' + manifest.length + ' identical HTML/TXT pairs.');
