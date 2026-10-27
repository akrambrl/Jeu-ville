import {
  BASE_LOOKS,
  ECONOMY,
  TIME,
  BODY_TYPES,
  HAIR_COLORS,
  SKIN_TONES,
  type CharacterSelf,
  type CreateCharacterRequest,
} from '@jeu-ville/shared';
import { AVATAR_H, AVATAR_W, drawAvatar } from '../render/avatar.js';
import { hex } from '../render/iso.js';
import { el, formatMoney } from './dom.js';

const PREVIEW_SCALE = 3;

/** Création du personnage : sexe, apparence de base, peau, cheveux, corpulence. */
export function showCreationScreen(
  root: HTMLElement,
  pseudo: string,
  create: (input: CreateCharacterRequest) => Promise<CharacterSelf>,
): Promise<CharacterSelf> {
  return new Promise((resolve) => {
    const choice: CreateCharacterRequest = { sex: 'male', baseLook: 0, skinTone: 2, hairColor: 0, bodyType: 1 };

    const canvas = el('canvas');
    canvas.width = AVATAR_W * PREVIEW_SCALE * 2;
    canvas.height = AVATAR_H * PREVIEW_SCALE;
    const ctx = canvas.getContext('2d')!;
    const redraw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const feetY = (AVATAR_H - 6) * PREVIEW_SCALE;
      drawAvatar(ctx, choice, 'xy', canvas.width * 0.3, feetY, PREVIEW_SCALE);
      drawAvatar(ctx, choice, 'back', canvas.width * 0.72, feetY, PREVIEW_SCALE);
    };

    /** Groupe de boutons à sélection unique. */
    const group = <K extends keyof CreateCharacterRequest>(
      key: K,
      options: { value: CreateCharacterRequest[K]; label?: string; color?: number }[],
      swatch = false,
    ) => {
      const container = el('div', { class: swatch ? 'swatches' : 'choices' });
      const buttons = options.map((opt) => {
        const b = el('button', { type: 'button', text: swatch ? '' : (opt.label ?? '') });
        if (opt.color !== undefined) b.style.background = hex(opt.color);
        if (swatch) b.setAttribute('aria-label', opt.label ?? String(opt.value));
        b.addEventListener('click', () => {
          choice[key] = opt.value;
          buttons.forEach((x) => x.classList.toggle('selected', x === b));
          redraw();
        });
        if (choice[key] === opt.value) b.classList.add('selected');
        return b;
      });
      container.append(...buttons);
      return container;
    };

    const error = el('div', { class: 'error' });
    const submit = el('button', { class: 'primary', type: 'button', text: 'Créer mon perso' });

    const card = el('div', { class: 'card' }, [
      el('h1', { text: `Salut ${pseudo} !` }),
      el('p', {
        text: `Crée ton personnage. Tu démarres à ${TIME.startingAge} ans avec ${formatMoney(ECONOMY.startingMoneyCents)} et un appart simple.`,
      }),
      el('div', { class: 'preview' }, [canvas]),
      el('label', { text: 'Sexe' }),
      group('sex', [
        { value: 'male', label: 'Homme' },
        { value: 'female', label: 'Femme' },
      ]),
      el('label', { text: 'Style' }),
      group(
        'baseLook',
        BASE_LOOKS.map((l, i) => ({ value: i, label: l.label })),
      ),
      el('label', { text: 'Couleur de peau' }),
      group(
        'skinTone',
        SKIN_TONES.map((c, i) => ({ value: i, color: c, label: `Teinte ${i + 1}` })),
        true,
      ),
      el('label', { text: 'Cheveux' }),
      group(
        'hairColor',
        HAIR_COLORS.map((c, i) => ({ value: i, color: c, label: `Couleur ${i + 1}` })),
        true,
      ),
      el('label', { text: 'Corpulence' }),
      group(
        'bodyType',
        BODY_TYPES.map((b, i) => ({ value: i, label: b.label })),
      ),
      error,
      el('div', { class: 'actions' }, [submit]),
    ]);
    const screen = el('div', { class: 'screen' }, [card]);
    root.append(screen);
    redraw();

    submit.addEventListener('click', async () => {
      submit.disabled = true;
      error.textContent = '';
      try {
        const character = await create(choice);
        screen.remove();
        resolve(character);
      } catch (err) {
        error.textContent = (err as Error).message;
        submit.disabled = false;
      }
    });
  });
}
