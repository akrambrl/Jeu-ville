/** Petit utilitaire de création d'éléments DOM. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function formatMoney(cents: number): string {
  // Les centimes ne s'affichent que s'il y en a (1,50 € mais 20 000 €).
  const digits = cents % 100 === 0 ? 0 : 2;
  return `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
}

let toastTimer: number | undefined;

export function showToast(root: HTMLElement, text: string, level: 'info' | 'error' = 'info'): void {
  root.querySelector('.toast')?.remove();
  const t = el('div', { class: `toast ${level}`, text });
  root.append(t);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    t.style.opacity = '0';
    window.setTimeout(() => t.remove(), 300);
  }, 2200);
}
