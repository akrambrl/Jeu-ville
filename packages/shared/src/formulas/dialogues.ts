/** Conversations avec les bots : qui parle, et ce qu'il dit selon l'endroit et l'heure. */
import { BOT_DIALOGUES, BOT_FIRST_NAMES, DIALOGUE, type DialogueContext } from '../config/dialogues.js';

/** Hachage stable d'une chaîne (FNV-1a), pour des choix reproductibles. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Prénom d'un bot, toujours le même pour un identifiant donné. */
export function botName(botId: string, sex: string): string {
  const names = sex === 'female' ? BOT_FIRST_NAMES.female : BOT_FIRST_NAMES.male;
  return names[hashString(botId) % names.length]!;
}

export function isNightHour(hour: number): boolean {
  return hour >= DIALOGUE.nightFromHour || hour < DIALOGUE.nightUntilHour;
}

/**
 * Conversation d'un bot. `visit` = combien de fois on lui a déjà parlé : on
 * passe à une autre conversation à chaque fois.
 */
export function botDialogue(botId: string, context: DialogueContext, visit: number): string[] {
  const list = BOT_DIALOGUES[context];
  return list[(hashString(botId) + visit) % list.length]!;
}
