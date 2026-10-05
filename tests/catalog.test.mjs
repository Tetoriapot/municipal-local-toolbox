import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTools, normalize } from '../src/lib/catalog.mjs';
import { tools } from '../src/data/tools.ts';
import { categories } from '../src/data/categories.ts';
const catalog = tools.map(tool => ({ ...tool, categoryName: categories.find(category => category.id === tool.category).name }));

test('no filters returns all eight tools in editorial order', () => assert.deepEqual(filterTools(catalog).map(tool => tool.id), tools.map(tool => tool.id)));
test('full-width text, case and whitespace normalize', () => {
  assert.equal(normalize(' ＣＳＶ '), 'csv');
  assert.deepEqual(filterTools(catalog, { query: ' ＣＳＶ ' }).map(tool => tool.id), ['equipment-manager', 'inquiry-log']);
});
test('search covers feature text and category names', () => {
  assert.equal(filterTools(catalog, { query: '返却予定' })[0].id, 'lending-manager');
  assert.equal(filterTools(catalog, { query: '日付・計算' })[0].id, 'annual-calendar');
});
test('all words must match and punctuation is literal', () => {
  assert.equal(filterTools(catalog, { query: '備品 CSV' }).length, 1);
  assert.equal(filterTools(catalog, { query: '.*' }).length, 0);
});
test('categories use OR and tags use AND', () => {
  assert.equal(filterTools(catalog, { categories: ['equipment', 'counter'] }).length, 4);
  assert.equal(filterTools(catalog, { tags: ['台帳', 'CSV'] })[0].id, 'equipment-manager');
  assert.equal(filterTools(catalog, { categories: ['handover'], tags: ['CSV'] }).length, 0);
});
test('sort uses dates and does not mutate the input', () => {
  const fixture = catalog.slice(0, 3).map((tool, i) => ({ ...tool, createdAt: '2026-10-0' + (i + 1), updatedAt: '2026-10-0' + (3 - i) }));
  assert.equal(filterTools(fixture, { sort: 'newest' })[0].id, 'lending-manager');
  assert.equal(filterTools(fixture, { sort: 'updated' })[0].id, 'handover-note');
  assert.deepEqual(fixture.map(tool => tool.order), [0, 1, 2]);
});
test('name sorting uses Japanese locale', () => assert.deepEqual(filterTools(catalog, { sort: 'name' }).map(tool => tool.name), catalog.map(tool => tool.name).sort((a, b) => a.localeCompare(b, 'ja'))));
