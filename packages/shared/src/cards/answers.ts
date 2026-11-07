/**
 * Vérification d'une réponse de duel : elle doit commencer par la lettre tirée
 * et figurer dans la liste de mots de la catégorie. On ignore accents,
 * majuscules, tirets, apostrophes, articles (« la banane ») et pluriels.
 */
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

/** Variantes acceptées d'un mot : tel quel, sans article, au singulier. */
function variants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  const bare = normalized.replace(ARTICLES, '');
  out.add(bare);
  for (const w of [...out]) if (/[sx]$/.test(w) && w.length > 3) out.add(w.slice(0, -1));
  return [...out].filter(Boolean);
}

/** Célébrités : on accepte aussi le nom seul (« Mbappé » pour « Kylian Mbappé »). */
function entryForms(category: CategoryId, word: string): string[] {
  const n = normalizeWord(word);
  const forms = variants(n);
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
  for (const v of variants(n)) {
    const word = known.get(v);
    if (!word) continue;
    // Célébrité : la lettre peut être celle du prénom ou du nom.
    const starts = category === 'celebrity' ? v.split(' ').some((p) => p.startsWith(l)) : v.startsWith(l);
    if (starts) return { ok: true, word };
    wrongLetter = true;
  }
  if (wrongLetter) return { ok: false, reason: `Ça ne commence pas par ${letter.toUpperCase()} !` };
  if (!variants(n).some((v) => (category === 'celebrity' ? v.split(' ').some((p) => p.startsWith(l)) : v.startsWith(l)))) {
    return { ok: false, reason: `Ça ne commence pas par ${letter.toUpperCase()} !` };
  }
  return { ok: false, reason: 'Ce mot n’est pas dans la liste du jeu.' };
}

/** Mots de la liste qui commencent par `letter` (pour les bots). */
export function wordsStartingWith(category: CategoryId, letter: string): string[] {
  const l = letter.toLowerCase();
  return WORDS[category].filter((w) => {
    const n = normalizeWord(w);
    return category === 'celebrity' ? n.split(' ').some((p) => p.startsWith(l)) : n.replace(ARTICLES, '').startsWith(l) || n.startsWith(l);
  });
}
