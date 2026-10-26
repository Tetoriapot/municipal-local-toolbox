/** Pure catalog logic shared by the browser and tests. */
export function normalize(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ja').trim();
}
/**
 * @param {Array<import('../data/tools').Tool & {categoryName?: string}>} tools
 * @param {{query?: string, categories?: string[], tags?: string[], sort?: string, readyOnly?: boolean}} state
 */
export function filterTools(tools, { query = '', categories = [], tags = [], sort = 'recommended', readyOnly = false } = {}) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const result = tools.filter(tool => {
    const haystack = normalize([tool.name, tool.description, tool.summary, tool.categoryName, ...(tool.tags || []), ...(tool.features || [])].join(' '));
    return (!readyOnly || tool.status === 'ready') && words.every(word => haystack.includes(word)) && (!categories.length || categories.includes(tool.category)) && tags.every(tag => tool.tags.includes(tag));
  });
  return result.sort((a, b) => {
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt) || a.order - b.order;
    if (sort === 'updated') return b.updatedAt.localeCompare(a.updatedAt) || a.order - b.order;
    if (sort === 'name') return a.name.localeCompare(b.name, 'ja') || a.order - b.order;
    return a.order - b.order;
  });
}
