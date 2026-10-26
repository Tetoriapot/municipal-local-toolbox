import { filterTools } from '../lib/catalog.mjs';
import type { Tool } from '../data/tools';

const root = document.querySelector<HTMLElement>('[data-catalog]');
if (root) {
  const tools = JSON.parse(document.querySelector('#catalog-data')!.textContent!) as (Tool & { categoryName: string })[];
  const search = root.querySelector<HTMLInputElement>('#catalog-search')!;
  const sort = root.querySelector<HTMLSelectElement>('#sort')!;
  const ready = root.querySelector<HTMLInputElement>('input[name="ready"]')!;
  const categoryInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="category"]')];
  const tagInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="tag"]')];
  const grid = root.querySelector<HTMLElement>('[data-results]')!;
  const cards = new Map([...grid.querySelectorAll<HTMLElement>('[data-card-id]')].map(card => [card.dataset.cardId!, card]));
  const checked = (inputs: HTMLInputElement[]) => inputs.filter(input => input.checked).map(input => input.value);

  function render(updateUrl = true) {
    const state = { query: search.value.slice(0, 200), categories: checked(categoryInputs), tags: checked(tagInputs), sort: sort.value, readyOnly: ready.checked };
    const matches = filterTools(tools, state);
    cards.forEach(card => { card.hidden = true; });
    matches.forEach((tool: Tool) => { const card = cards.get(tool.id)!; card.hidden = false; grid.append(card); });
    root!.querySelector('[data-result-count]')!.textContent = String(matches.length);
    root!.querySelector('[data-query-label]')!.textContent = state.query.trim() ? `： 「${state.query.trim()}」の検索結果` : '';
    root!.querySelector<HTMLElement>('[data-empty]')!.hidden = matches.length > 0;
    if (updateUrl) {
      const params = new URLSearchParams();
      if (state.query.trim()) params.set('q', state.query.trim());
      state.categories.forEach(value => params.append('category', value));
      // An explicit empty category overrides the category route's initial selection.
      if (root!.dataset.initialCategory && !state.categories.length) params.set('category', '');
      state.tags.forEach(value => params.append('tag', value));
      if (state.sort !== 'recommended') params.set('sort', state.sort);
      if (state.readyOnly) params.set('status', 'ready');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    search.value = (params.get('q') || '').slice(0, 200);
    ready.checked = params.get('status') === 'ready';
    const selectedCategories = params.has('category') ? params.getAll('category') : [root!.dataset.initialCategory];
    categoryInputs.forEach(input => { input.checked = selectedCategories.includes(input.value); });
    tagInputs.forEach(input => { input.checked = params.getAll('tag').includes(input.value); });
    sort.value = ['recommended', 'newest', 'updated', 'name'].includes(params.get('sort') || '') ? params.get('sort')! : 'recommended';
    render(false);
  }
  search.addEventListener('input', () => render());
  search.closest('form')!.addEventListener('submit', event => { event.preventDefault(); render(); });
  [...categoryInputs, ...tagInputs, sort, ready].forEach(input => input.addEventListener('change', () => render()));
  root.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
    search.value = ''; sort.value = 'recommended'; ready.checked = false; [...categoryInputs, ...tagInputs].forEach(input => { input.checked = false; }); render(); search.focus();
  }));
  addEventListener('popstate', restore);
  restore();
}
