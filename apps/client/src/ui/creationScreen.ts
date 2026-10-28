import {
  BASE_LOOKS,
  BODY_TYPES,
  ECONOMY,
  HAIR_COLORS,
  SKIN_TONES,
  TIME,
  type CharacterSelf,
  type CreateCharacterRequest,
} from '@jeu-ville/shared';
import { CharacterPreview } from './characterPreview.js';
import { el, formatMoney } from './dom.js';

const PREVIEW_W = 260;
const PREVIEW_H = 200;

const SKIN_LABELS = ['Très claire', 'Claire', 'Mate', 'Hâlée', 'Foncée', 'Très foncée'];
const HAIR_LABELS = ['Noirs', 'Bruns', 'Châtains', 'Blonds', 'Roux', 'Gris'];

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Création du personnage : sexe, tenue (un modèle 3D par tenue), peau, cheveux et corpulence. */
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
      options: { value: CreateCharacterRequest[K]; label: string; color?: number }[],
      onPick?: () => void,
    ) => {
      const swatch = options.some((o) => o.color !== undefined);
      const container = el('div', { class: swatch ? 'swatches' : 'choices' });
      const buttons = options.map((opt) => {
        const b = el('button', { type: 'button', text: swatch ? '' : opt.label });
        if (opt.color !== undefined) {
          b.style.background = hex(opt.color);
          b.setAttribute('aria-label', opt.label);
          b.title = opt.label;
        }
        b.addEventListener('click', () => {
          choice[key] = opt.value;
          buttons.forEach((x) => x.classList.toggle('selected', x === b));
          onPick?.();
          redraw();
        });
        if (choice[key] === opt.value) b.classList.add('selected');
        return b;
      });
      container.append(...buttons);
      return container;
    };

    // Les noms des tenues dépendent du sexe choisi.
    const outfitGroup = () =>
      group(
        'baseLook',
        BASE_LOOKS.map((l, i) => ({ value: i, label: l[choice.sex].label })),
      );
    const outfits = el('div', {}, [outfitGroup()]);

    const error = el('div', { class: 'error' });
    const submit = el('button', { class: 'primary', type: 'button', text: 'Créer mon perso' });

    const card = el('div', { class: 'card' }, [
      el('h1', { text: `Salut ${pseudo} !` }),
      el('p', {
        text: `Crée ton personnage. Tu démarres à ${TIME.startingAge} ans avec ${formatMoney(ECONOMY.startingMoneyCents)} et un appart simple.`,
      }),
      el('div', { class: 'preview' }, [preview.canvas]),
      el('label', { text: 'Sexe' }),
      group(
        'sex',
        [
          { value: 'male', label: 'Homme' },
          { value: 'female', label: 'Femme' },
        ],
        () => outfits.replaceChildren(outfitGroup()),
      ),
      el('label', { text: 'Tenue' }),
      outfits,
      el('label', { text: 'Peau' }),
      group(
        'skinTone',
        SKIN_TONES.map((color, i) => ({ value: i, label: SKIN_LABELS[i] ?? '', color })),
      ),
      el('label', { text: 'Cheveux' }),
      group(
        'hairColor',
        HAIR_COLORS.map((color, i) => ({ value: i, label: HAIR_LABELS[i] ?? '', color })),
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
