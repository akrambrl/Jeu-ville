/**
 * Vérification d'une réponse de duel : elle doit commencer par la lettre tirée
 * et figurer dans la liste de mots de la catégorie. On ignore accents,
 * majuscules, tirets, apostrophes, articles (« la banane ») et pluriels.
 */
import { CARD_GAME } from '../config/cards.js';
import type { CategoryId } from './categories.js';
import { WORDS } from './words.js';

const ARTICLES = /^(?:le|la|les|l|un|une|des|du|de la|de l|d)\s+/;

/** Forme comparable d'un mot : minuscules, sans accents ni ponctuation. */
export function normalizeWord(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    // i sans point (turc) : « Aslı » s'écrit aussi « Asli ».
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Noms propres : pas de « pluriel » à retirer (« Alix » n'est pas le pluriel
 * d'« Ali », ni « Paris » celui de « Pari »).
 */
const PROPER_NOUNS: ReadonlySet<CategoryId> = new Set(['firstName', 'celebrity', 'place', 'brand']);

/** Variantes acceptées d'un mot : tel quel, sans article, et au singulier (noms communs). */
function variants(normalized: string, category: CategoryId): string[] {
  const out = new Set<string>([normalized]);
  const bare = normalized.replace(ARTICLES, '');
  out.add(bare);
  if (!PROPER_NOUNS.has(category)) for (const w of [...out]) if (/[sx]$/.test(w) && w.length > 3) out.add(w.slice(0, -1));
  return [...out].filter(Boolean);
}

/** Terminaisons masculin → féminin des noms de métier (sur la forme sans accents). */
const FEMININE_ENDINGS: [string, string][] = [
  ['teur', 'trice'],
  ['eur', 'euse'],
  ['eur', 'eure'],
  ['ier', 'iere'],
  ['ien', 'ienne'],
  ['er', 'ere'],
  ['on', 'onne'],
  ['if', 'ive'],
  ['el', 'elle'],
  ['et', 'ette'],
  ['an', 'anne'],
];

/**
 * Formes au féminin d'un métier (boulanger → boulangère, coiffeur → coiffeuse,
 * acteur → actrice, avocat → avocate) : on transforme le premier mot
 * (« agent de sécurité » → « agente de sécurité »). Quelques formes inventées
 * passent aussi (« docteuse ») : on préfère accepter large que refuser un vrai mot.
 */
export function feminineForms(normalized: string): string[] {
  const [first = '', ...rest] = normalized.split(' ');
  const tail = rest.length > 0 ? ` ${rest.join(' ')}` : '';
  const out = new Set<string>();
  for (const [masc, fem] of FEMININE_ENDINGS) if (first.endsWith(masc)) out.add(first.slice(0, -masc.length) + fem);
  // Terminaison en consonne : on ajoute un « e » (avocat → avocate, marchand → marchande).
  if (/[^aeiouy]$/.test(first)) out.add(`${first}e`);
  return [...out].map((f) => f + tail);
}

/** Célébrités : on accepte aussi le nom seul (« Mbappé » pour « Kylian Mbappé »). */
function entryForms(category: CategoryId, word: string): string[] {
  const n = normalizeWord(word);
  const forms = variants(n, category);
  if (category === 'job') for (const f of feminineForms(n)) forms.push(...variants(f, category));
  if (category === 'celebrity') {
    const parts = n.split(' ');
    if (parts.length > 1) forms.push(parts.slice(1).join(' '));
  }
  return forms;
}

let index: Map<CategoryId, Map<string, string>> | null = null;

/** Index forme comparable → mot de la liste, construit une seule fois. */
function wordIndex(): Map<CategoryId, Map<string, string>> {
  if (index) return index;
  index = new Map();
  for (const [category, words] of Object.entries(WORDS) as [CategoryId, readonly string[]][]) {
    const m = new Map<string, string>();
    // D'abord les mots tels quels : « Ali » reste Ali, même si une forme dérivée d'un autre mot s'écrit pareil.
    for (const w of words) {
      const exact = normalizeWord(w);
      if (!m.has(exact)) m.set(exact, w);
    }
    for (const w of words) for (const f of entryForms(category, w)) if (!m.has(f)) m.set(f, w);
    index.set(category, m);
  }
  return index;
}

export type AnswerCheck = { ok: true; word: string } | { ok: false; reason: string };

/** La réponse `text` est-elle bonne pour `category` avec la lettre `letter` ? */
export function checkAnswer(category: CategoryId, letter: string, text: string): AnswerCheck {
  const n = normalizeWord(text);
  if (!n) return { ok: false, reason: 'Écris un mot.' };
  const l = letter.toLowerCase();
  const known = wordIndex().get(category)!;
  let wrongLetter = false;
  for (const v of variants(n, category)) {
    const word = known.get(v);
    if (!word) continue;
    // Célébrité : la lettre peut être celle du prénom ou du nom.
    const starts = category === 'celebrity' ? v.split(' ').some((p) => p.startsWith(l)) : v.startsWith(l);
    if (starts) return { ok: true, word };
    wrongLetter = true;
  }
  if (wrongLetter) return { ok: false, reason: `Ça ne commence pas par ${letter.toUpperCase()} !` };
  const startsWith = (v: string) => (category === 'celebrity' ? v.split(' ').some((p) => p.startsWith(l)) : v.startsWith(l));
  if (!variants(n, category).some(startsWith)) return { ok: false, reason: `Ça ne commence pas par ${letter.toUpperCase()} !` };
  // Faute de frappe : le mot le plus proche de la liste, s'il commence aussi par la lettre.
  const close = closestWord(known, variants(n, category).filter(startsWith), startsWith);
  if (close) return { ok: true, word: close };
  return { ok: false, reason: 'Ce mot n’est pas dans la liste du jeu.' };
}

/**
 * Distance d'édition (Damerau restreinte) entre deux mots, plafonnée : au-delà
 * de `max`, renvoie `max + 1`. Une lettre en trop, en moins, remplacée, ou deux
 * lettres voisines inversées comptent chacune pour une faute.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1]![j]! + 1, row[j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2]![j - 2]! + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

/** Mot de la liste le plus proche (fautes de frappe tolérées, voir CARD_GAME.answer.typos), ou null. */
function closestWord(known: Map<string, string>, typed: string[], startsWith: (v: string) => boolean): string | null {
  const { maxEdits, minLength } = CARD_GAME.answer.typos;
  let best: { word: string; d: number } | null = null;
  for (const t of typed) {
    if (t.replace(/ /g, '').length < minLength) continue;
    for (const [form, word] of known) {
      if (form.replace(/ /g, '').length < minLength || !startsWith(form)) continue;
      const d = editDistance(t, form, maxEdits);
      if (d <= maxEdits && (!best || d < best.d)) best = { word, d };
    }
  }
  return best?.word ?? null;
}

/** Mots de la liste qui commencent par `letter` (pour les bots). */
export function wordsStartingWith(category: CategoryId, letter: string): string[] {
  const l = letter.toLowerCase();
  return WORDS[category].filter((w) => {
    const n = normalizeWord(w);
    return category === 'celebrity' ? n.split(' ').some((p) => p.startsWith(l)) : n.replace(ARTICLES, '').startsWith(l) || n.startsWith(l);
  });
}
