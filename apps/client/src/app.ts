/** Navigation : accueil → table (en ligne ou contre des bots) → accueil. */
import { Client } from 'colyseus.js';
import { ONLINE, ROOM_CARDS, type CardsJoinOptions } from '@jeu-ville/shared';
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

/** Code de table reçu dans un lien d'invitation (?table=CODE). */
function inviteFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('table')?.trim().toUpperCase() ?? '';
  return new RegExp(`^[${ONLINE.codeAlphabet}]{${ONLINE.codeLength}}$`).test(code) ? code : null;
}

export function startApp(ui: HTMLElement, options: { online: boolean }): void {
  let inviteCode = options.online ? inviteFromUrl() : null;
  const home = () => showHome(ui, { ...options, inviteCode }, play);
  const play = async (choice: HomeChoice) => {
    // Toute première partie : le tutoriel d'abord.
    if (!tutorialSeen()) await new Promise<void>((done) => showTutorial(ui, done));
    if (choice.mode === 'solo') return showTable(ui, new SoloTableLink(choice.pseudo, choice.bots), home);
    const token = await sessionFor(choice.pseudo);
    const client = new Client(SERVER_URL);
    const { table } = choice;
    const room = await (
      table.kind === 'quick'
        ? client.joinOrCreate(ROOM_CARDS, { token } satisfies CardsJoinOptions)
        : table.kind === 'create'
          ? client.create(ROOM_CARDS, { token, private: true } satisfies CardsJoinOptions)
          : client.joinById(table.code, { token } satisfies CardsJoinOptions)
    ).catch((err: Error) => {
      if (table.kind === 'join') throw new Error(`Aucune table ouverte avec le code ${table.code} (ou elle est déjà complète).`);
      throw new Error(`Impossible de rejoindre une table : ${err.message}`);
    });
    inviteCode = null;
    showTable(ui, new OnlineTableLink(client, room, table.kind === 'quick' ? null : room.roomId), home);
  };
  home();
}
