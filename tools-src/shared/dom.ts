export function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error('Missing element: ' + id);
  return found as T;
}
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}
export function action(text: string, handler: () => void, className = 'secondary') {
  const button = node('button', text, className);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}
export function trapDialogFocus(modal: HTMLDialogElement) {
  if (window.self !== window.top) {
    const observer = new MutationObserver(() => {
      if (modal.open) window.parent.postMessage('municipal-toolbox:demo-dialog-open', '*');
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
  }
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]')].filter(control => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
}
