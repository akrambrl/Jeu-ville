/** Navigation : accueil → table (en ligne ou contre des bots) → accueil. */
import { Client } from 'colyseus.js';
import { ROOM_CARDS, type CardsJoinOptions } from '@jeu-ville/shared';
import { ApiError, SERVER_URL, api, tokenStore } from './net/api.js';
import { OnlineTableLink, SoloTableLink } from './net/tableLink.js';
import { showHome, type HomeChoice } from './ui/home.js';
import { showTable } from './ui/table.js';
import { showTutorial, tutorialSeen } from './ui/tutorial.js';

/** Session valide pour ce pseudo (on en crée une si besoin). */
async function sessionFor(pseudo: string): Promise<string> {
  const token = tokenStore.get();
  if (token) {
    try {
      const me = await api.me();
      if (me.pseudo.toLowerCase() === pseudo.toLowerCase()) return token;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
    }
  }
  const session = await api.createSession(pseudo);
  tokenStore.set(session.token);
  return session.token;
}

export function startApp(ui: HTMLElement, options: { online: boolean }): void {
  const home = () => showHome(ui, options, play);
  const play = async (choice: HomeChoice) => {
    // Toute première partie : le tutoriel d'abord.
    if (!tutorialSeen()) await new Promise<void>((done) => showTutorial(ui, done));
    if (choice.mode === 'solo') return showTable(ui, new SoloTableLink(choice.pseudo, choice.bots), home);
    const token = await sessionFor(choice.pseudo);
    const room = await new Client(SERVER_URL).joinOrCreate(ROOM_CARDS, { token } satisfies CardsJoinOptions).catch((err: Error) => {
      throw new Error(`Impossible de rejoindre une table : ${err.message}`);
    });
    showTable(ui, new OnlineTableLink(room), home);
  };
  home();
}
