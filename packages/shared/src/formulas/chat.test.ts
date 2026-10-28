import { describe, expect, it } from 'vitest';
import { CHAT } from '../config/chat.js';
import { canSendChat, cleanChatText, maskBannedWords, replyExcerpt } from './chat.js';

describe('chat', () => {
  it('nettoie le texte', () => {
    expect(cleanChatText('  salut \n\t tout   le monde ')).toBe('salut tout le monde');
    expect(cleanChatText('a'.repeat(500))).toHaveLength(CHAT.maxLength);
    expect(cleanChatText('   ')).toBe('');
  });

  it('masque les insultes, accents et majuscules compris', () => {
    expect(maskBannedWords('Espèce de CONNARD !')).toBe('Espèce de ******* !');
    expect(maskBannedWords('Bonjour à tous')).toBe('Bonjour à tous');
  });

  it('limite le flood', () => {
    expect(canSendChat([], 0)).toBe(true);
    expect(canSendChat([1000], 1000 + CHAT.minIntervalMs - 1)).toBe(false);
    const burst = Array.from({ length: CHAT.burstMessages }, (_, i) => i * CHAT.minIntervalMs);
    expect(canSendChat(burst, burst.at(-1)! + CHAT.minIntervalMs)).toBe(false);
    expect(canSendChat(burst, burst[0]! + CHAT.burstWindowMs + 1)).toBe(true);
  });

  it('cite le début du message auquel on répond', () => {
    const line = { id: 'm1', characterId: 'c', name: 'Inès', districtId: 'd', text: 'x'.repeat(200), at: 0 };
    const reply = replyExcerpt(line);
    expect(reply).toMatchObject({ id: 'm1', name: 'Inès' });
    expect(reply.text).toHaveLength(CHAT.replyExcerptLength);
    expect(reply.text.endsWith('…')).toBe(true);
    expect(replyExcerpt({ ...line, text: 'court' }).text).toBe('court');
  });
});
