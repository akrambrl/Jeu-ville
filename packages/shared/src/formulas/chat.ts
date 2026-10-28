/** Chat : nettoyage du texte, mots interdits masqués, anti-flood. Même règles partout. */
import { CHAT } from '../config/chat.js';
import { BANNED_WORDS } from '../config/moderation.js';
import type { ChatLine, ChatReply } from '../protocol/index.js';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const BANNED = new Set(BANNED_WORDS.map(norm));

/** Texte prêt à être publié : sans caractères de contrôle, espaces resserrés, longueur bornée ('' = rien à envoyer). */
export function cleanChatText(text: string): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT.maxLength);
}

/** Remplace les mots interdits par des étoiles (le reste du message passe). */
export function maskBannedWords(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (BANNED.has(norm(word)) ? '*'.repeat(word.length) : word));
}

/** Peut-on envoyer un message maintenant ? `sentAt` = instants (ms) des messages récents du joueur. */
export function canSendChat(sentAt: readonly number[], nowMs: number): boolean {
  const last = sentAt[sentAt.length - 1];
  if (last !== undefined && nowMs - last < CHAT.minIntervalMs) return false;
  return sentAt.filter((t) => nowMs - t < CHAT.burstWindowMs).length < CHAT.burstMessages;
}

/** Citation d'un message auquel on répond : son auteur et le début du texte. */
export function replyExcerpt(line: ChatLine): ChatReply {
  const max = CHAT.replyExcerptLength;
  const text = line.text.length > max ? `${line.text.slice(0, max - 1).trimEnd()}…` : line.text;
  return { id: line.id, name: line.name, text };
}
