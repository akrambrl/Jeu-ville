import { BANNED_SUBSTRING_MIN_LENGTH, BANNED_WORDS } from '../config/moderation.js';
import { normalizeWord } from '../cards/answers.js';

/** Chiffres et symboles utilisés à la place des lettres (« c0nnard », « s@lope »). */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' };

const BANNED = BANNED_WORDS.map((w) => normalizeWord(w));

/** Le texte contient-il un mot refusé (insulte, grossièreté, haine) ? */
export function containsBannedWord(text: string): boolean {
  const deleet = [...text.toLowerCase()].map((c) => LEET[c] ?? c).join('');
  // Les tirets, points et underscores séparent les mots ; « c_o_n » est aussi recollé.
  const words = normalizeWord(deleet.replace(/[_.-]/g, ' ')).split(' ').filter(Boolean);
  const glued = words.join('');
  return BANNED.some((w) => words.includes(w) || (w.length >= BANNED_SUBSTRING_MIN_LENGTH && glued.includes(w)) || glued === w);
}
