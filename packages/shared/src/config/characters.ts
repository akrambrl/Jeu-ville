/** Options de création de personnage (pas de modelage libre). */

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

/**
 * 6 tenues de départ par sexe : chacune correspond à un modèle 3D
 * (apps/client/src/assets/models/people/<model>.glb).
 */
export const BASE_LOOKS = [
  { male: { label: 'Décontracté', model: 'male-casual' }, female: { label: 'Décontractée', model: 'female-casual' } },
  { male: { label: 'Sweat', model: 'male-hoodie' }, female: { label: 'Rando', model: 'female-adventurer' } },
  { male: { label: 'Costume', model: 'male-suit' }, female: { label: 'Tailleur', model: 'female-suit' } },
  { male: { label: 'Rock', model: 'male-punk' }, female: { label: 'Rock', model: 'female-punk' } },
  { male: { label: 'Été', model: 'male-beach' }, female: { label: 'Robe', model: 'female-formal' } },
  { male: { label: 'Bleu de travail', model: 'male-worker' }, female: { label: 'Bleu de travail', model: 'female-worker' } },
] as const;

export const SKIN_TONES = [0xf6d7c3, 0xeab894, 0xd29a6c, 0xb07a4f, 0x8a5a3b, 0x5e3b26] as const;

export const HAIR_COLORS = [0x1c1a19, 0x4a2f1f, 0x8b5a2b, 0xd8b26a, 0xa8402c, 0x9a9a9a] as const;

export const BODY_TYPES = [
  { label: 'Mince', width: 0.85 },
  { label: 'Moyenne', width: 1 },
  { label: 'Large', width: 1.2 },
] as const;

export const PSEUDO_RULES = {
  minLength: 3,
  maxLength: 20,
  /** Lettres (accents compris), chiffres, tiret, underscore. */
  pattern: /^[\p{L}\p{N}_-]+$/u,
} as const;
