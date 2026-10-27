/** Démo solo jouable sans serveur (publiée comme page autonome). */
import {
  DEFAULT_DISTRICT_KEY,
  createSessionSchema,
  getDistrictMap,
  type CharacterSelf,
} from '@jeu-ville/shared';
import { startGame } from '../app/startGame.js';
import { showCreationScreen } from '../ui/creationScreen.js';
import { el } from '../ui/dom.js';
import { showLoginScreen } from '../ui/loginScreen.js';
import { LocalDistrict, createDemoSave, demoSelf, demoStore, type DemoSave } from './localDistrict.js';
import '../ui/styles.css';

const ui = document.getElementById('ui')!;
const map = getDistrictMap(DEFAULT_DISTRICT_KEY)!;

async function newGame(): Promise<DemoSave> {
  let pseudo = '';
  await showLoginScreen(ui, async (raw) => {
    const parsed = createSessionSchema.safeParse({ pseudo: raw });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Pseudo invalide.');
    pseudo = parsed.data.pseudo;
  });
  let save: DemoSave | null = null;
  await showCreationScreen(ui, pseudo, async (input): Promise<CharacterSelf> => {
    save = createDemoSave(map, pseudo, input);
    demoStore.save(save);
    return demoSelf(map, save, DEFAULT_DISTRICT_KEY);
  });
  return save!;
}

function showDemoBadge(): void {
  const restart = el('button', { class: 'link-button', text: 'Recommencer' });
  const badge = el('div', { class: 'demo-badge' }, [el('span', { text: 'Démo solo' }), restart]);
  restart.addEventListener('click', () => {
    const yes = el('button', { class: 'primary danger', text: 'Effacer et recommencer' });
    const no = el('button', { text: 'Annuler' });
    const overlay = el('div', { class: 'overlay' }, [
      el('div', { class: 'card' }, [
        el('h1', { text: 'Recommencer ?' }),
        el('p', { text: 'Ton personnage, ton argent et tes jauges seront effacés de ce téléphone.' }),
        el('div', { class: 'actions two' }, [no, yes]),
      ]),
    ]);
    no.addEventListener('click', () => overlay.remove());
    yes.addEventListener('click', () => {
      demoStore.clear();
      location.reload();
    });
    ui.append(overlay);
  });
  ui.append(badge);
}

async function start(): Promise<void> {
  const save = demoStore.load() ?? (await newGame());
  const link = new LocalDistrict(map, DEFAULT_DISTRICT_KEY, save);
  startGame(ui, link.self(), link);
  showDemoBadge();
}

void start();
