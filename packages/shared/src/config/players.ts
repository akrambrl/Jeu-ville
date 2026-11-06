/** Règles des pseudos (visibles de tous, donc encadrés). */
export const PSEUDO_RULES = {
  minLength: 3,
  maxLength: 20,
  /** Lettres (accents compris), chiffres, tiret, underscore. */
  pattern: /^[\p{L}\p{N}_-]+$/u,
} as const;
