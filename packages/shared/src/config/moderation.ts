/**
 * Mots interdits dans ce que tout le monde voit (noms de commerces ; plus tard le chat).
 * Liste volontairement courte : la modération complète arrive avec le chat (phase 3).
 */
export const BANNED_WORDS = ['connard', 'connasse', 'salope', 'pute', 'encule', 'enculé', 'nique', 'fdp', 'pd', 'negro', 'bougnoule', 'nazi'];

/** true si le texte contient un mot interdit (insensible à la casse et aux accents). */
export function containsBannedWord(text: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const words = norm(text).split(/[^a-z0-9]+/);
  const banned = new Set(BANNED_WORDS.map(norm));
  return words.some((w) => banned.has(w));
}
