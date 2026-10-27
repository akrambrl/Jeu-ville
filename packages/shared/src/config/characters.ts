/** Options de création de personnage (pas de modelage libre). */

export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];

/** 6 apparences de base : coupe + couleur de tenue de départ. */
export const BASE_LOOKS = [
  { label: 'Classique', hairStyle: 'short', outfitColor: 0x3b6ea8 },
  { label: 'Sport', hairStyle: 'buzz', outfitColor: 0xd94f3d },
  { label: 'Chic', hairStyle: 'side', outfitColor: 0x2f2f38 },
  { label: 'Street', hairStyle: 'curly', outfitColor: 0x4e9a5b },
  { label: 'Cool', hairStyle: 'long', outfitColor: 0xe0a530 },
  { label: 'Créatif', hairStyle: 'bun', outfitColor: 0x8a5cc2 },
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
