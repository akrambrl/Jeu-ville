import {
  BASE_LOOKS,
  BODY_TYPES,
  ECONOMY,
  TIME,
  type CharacterSelf,
  type CreateCharacterRequest,
} from '@jeu-ville/shared';
import { CharacterPreview } from './characterPreview.js';
import { el, formatMoney } from './dom.js';

const PREVIEW_W = 260;
const PREVIEW_H = 200;

/**
 * Création du personnage : sexe, style (un modèle 3D par style) et corpulence.
 * La couleur de peau et de cheveux reviendra avec la personnalisation des persos 3D.
 */
export function showCreationScreen(
  root: HTMLElement,
  pseudo: string,
  create: (input: CreateCharacterRequest) => Promise<CharacterSelf>,
): Promise<CharacterSelf> {
  return new Promise((resolve) => {
    const choice: CreateCharacterRequest = { sex: 'male', baseLook: 0, skinTone: 2, hairColor: 0, bodyType: 1 };

    const preview = new CharacterPreview(PREVIEW_W, PREVIEW_H);
    const redraw = () => void preview.show(choice);

    /** Groupe de boutons à sélection unique. */
    const group = <K extends keyof CreateCharacterRequest>(
      key: K,
      options: { value: CreateCharacterRequest[K]; label: string }[],
    ) => {
      const container = el('div', { class: 'choices' });
      const buttons = options.map((opt) => {
        const b = el('button', { type: 'button', text: opt.label });
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
      el('div', { class: 'preview' }, [preview.canvas]),
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
        preview.dispose();
        screen.remove();
        resolve(character);
      } catch (err) {
        error.textContent = (err as Error).message;
        submit.disabled = false;
      }
    });
  });
}
