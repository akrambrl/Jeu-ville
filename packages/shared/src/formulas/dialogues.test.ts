import { describe, expect, it } from 'vitest';
import { BOT_DIALOGUES } from '../config/dialogues.js';
import { botDialogue, botName, isNightHour } from './dialogues.js';

describe('dialogues des bots', () => {
  it('un bot garde toujours le même prénom', () => {
    expect(botName('bot-3', 'female')).toBe(botName('bot-3', 'female'));
  });

  it('on change de conversation à chaque fois', () => {
    const a = botDialogue('bot-1', 'street', 0);
    const b = botDialogue('bot-1', 'street', 1);
    expect(a).not.toEqual(b);
    expect(BOT_DIALOGUES.street).toContainEqual(a);
  });

  it('la nuit commence tard et finit au petit matin', () => {
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(3)).toBe(true);
    expect(isNightHour(12)).toBe(false);
  });
});
