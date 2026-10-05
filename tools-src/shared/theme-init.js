(() => {
  const key = 'municipal-toolbox:theme:v1';
  const media = matchMedia('(prefers-color-scheme: dark)');
  let choice = null;
  try { choice = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(choice)) choice = null;
  function render() {
    const dark = (choice || (media.matches ? 'dark' : 'light')) === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.textContent = dark ? 'ライトモード' : 'ダークモード';
      button.setAttribute('aria-label', dark ? 'ライトモードに切り替える' : 'ダークモードに切り替える');
      button.disabled = false;
    });
  }
  render();
  document.addEventListener('DOMContentLoaded', () => {
    render();
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
      choice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      render();
      try { localStorage.setItem(key, choice); }
      catch { document.querySelectorAll('[data-theme-notice]').forEach(node => { node.textContent = '配色はこの画面に適用しました。設定は保存できません。'; }); }
    }));
  });
  media.addEventListener('change', () => { if (!choice) render(); });
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) { choice = ['light','dark'].includes(event.newValue) ? event.newValue : null; render(); }
  });
})();
