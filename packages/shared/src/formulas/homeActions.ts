/**
 * Règles des actions « chez soi », indépendantes du stockage.
 * Le serveur les applique dans une transaction ; la démo solo dans la page.
 */
import { HOME_ACTIONS } from '../config/balance.js';
import { applyGaugeEffects, decayGauges, type StoredGauges } from './gauges.js';

export type HomeActionId = keyof typeof HOME_ACTIONS;

export type HomeActionResult =
  | { ok: true; gauges: StoredGauges; moneyDeltaCents: number }
  | { ok: false; error: string };

export function resolveHomeAction(
  actionId: HomeActionId,
  stored: StoredGauges,
  gaugesUpdatedAtMs: number,
  moneyCents: number,
  nowMs: number,
): HomeActionResult {
  const action = HOME_ACTIONS[actionId];
  if (moneyCents < action.costCents) return { ok: false, error: "Pas assez d'argent." };
  const current = decayGauges(stored, nowMs - gaugesUpdatedAtMs);
  return { ok: true, gauges: applyGaugeEffects(current, action.effects), moneyDeltaCents: -action.costCents };
}
