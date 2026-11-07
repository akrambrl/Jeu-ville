import { describe, expect, it } from 'vitest';
import { containsBannedWord } from './moderation.js';

describe('pseudos', () => {
  it('refuse insultes et grossièretés, même déguisées', () => {
    for (const p of ['connard', 'Connard93', 'c0nnard', 'gros_con', 'SALOPE', 'fdp', 'xX-encule-Xx', 'Hitler']) {
      expect(containsBannedWord(p), p).toBe(true);
    }
  });
  it('laisse passer les pseudos normaux qui contiennent un mot court', () => {
    for (const p of ['Constance', 'Bitcoin', 'Marcon', 'Cultiver', 'Akram', 'Tgv93', 'Sexton']) {
      expect(containsBannedWord(p), p).toBe(false);
    }
  });
});
