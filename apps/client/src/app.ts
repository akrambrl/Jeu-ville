/** Navigation : accueil → table (en ligne ou contre des bots) → accueil. */
import { ONLINE, findPublicTable, newTableCode, realScheduler, type Transport } from '@jeu-ville/shared';
import { OnlineTableLink, SoloTableLink } from './net/tableLink.js';
import { showHome, type HomeChoice } from './ui/home.js';
import { showTable } from './ui/table.js';
import { showTutorial, tutorialSeen } from './ui/tutorial.js';

const PLAYER_ID_KEY = 'bac-bataille.player-id';

/** Identifiant de ce téléphone à une table en ligne (pas un compte : rien n'est stocké ailleurs). */
function playerId(): string {
  try {
    const id = localStorage.getItem(PLAYER_ID_KEY) ?? crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Code de table reçu dans un lien d'invitation (?table=CODE). */
function inviteFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('table')?.trim().toUpperCase() ?? '';
  return new RegExp(`^[${ONLINE.codeAlphabet}]{${ONLINE.codeLength}}$`).test(code) ? code : null;
}

export function startApp(ui: HTMLElement, options: { transport: Transport | null }): void {
  const online = options.transport !== null;
  let inviteCode = online ? inviteFromUrl() : null;
  const home = () => showHome(ui, { online, inviteCode }, play);

  /** Ouvre une table en ligne : on la crée (hôte) ou on la rejoint. */
  const openTable = async (transport: Transport, code: string, pseudo: string, isPublic: boolean, mode: 'create' | 'join') => {
    const link = new OnlineTableLink(transport, code, playerId(), pseudo, isPublic);
    return (await link.table.open(mode)) === 'ok' ? link : null;
  };

  const play = async (choice: HomeChoice) => {
    // Toute première partie : le tutoriel d'abord.
    if (!tutorialSeen()) await new Promise<void>((done) => showTutorial(ui, done));
    if (choice.mode === 'solo') return showTable(ui, new SoloTableLink(choice.pseudo, choice.bots), home);
    const transport = options.transport;
    if (!transport) throw new Error('Le jeu en ligne n’est pas disponible ici.');
    const { table, pseudo } = choice;
    let link: OnlineTableLink | null = null;
    try {
      if (table.kind === 'join') {
        link = await openTable(transport, table.code, pseudo, false, 'join');
        if (!link) throw new Error(`Aucune table ouverte avec le code ${table.code}.`);
      } else if (table.kind === 'create') {
        link = await openTable(transport, newTableCode(), pseudo, false, 'create');
      } else {
        // Partie rapide : une table publique qui attend, sinon on en ouvre une.
        const code = await findPublicTable(transport, realScheduler);
        link = (code ? await openTable(transport, code, pseudo, true, 'join') : null) ?? (await openTable(transport, newTableCode(), pseudo, true, 'create'));
      }
    } catch (err) {
      throw new Error((err as Error).message || 'Connexion au jeu en ligne impossible.');
    }
    if (!link) throw new Error('Connexion au jeu en ligne impossible.');
    inviteCode = null;
    showTable(ui, link, home);
  };
  home();
}
