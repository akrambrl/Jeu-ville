/** Page web publique des textes légaux (legal.html) : l'adresse à donner aux stores. */
import { el } from '../ui/dom.js';
import '../ui/styles.css';
import { LEGAL_DOCS } from './texts.js';

const root = document.getElementById('ui')!;
root.append(
  el('div', { class: 'legal-page' }, [
    el('h1', { class: 'title', text: 'Bac Bataille' }),
    el('nav', {}, LEGAL_DOCS.map((d) => el('a', { href: `#${d.id}`, text: d.title }))),
    ...LEGAL_DOCS.map((d) =>
      el('section', { id: d.id, class: 'panel legal' }, [
        el('h2', { class: 'title', text: d.title }),
        ...d.sections.flatMap((s) => [el('h3', { text: s.heading }), ...s.paragraphs.map((p) => el('p', { text: p }))]),
      ]),
    ),
  ]),
);
