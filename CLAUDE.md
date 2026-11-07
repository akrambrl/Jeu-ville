# CLAUDE.md — Bac Bataille (jeu de cartes multijoueur façon petit bac)

Le cahier des charges est dans `docs/GAME_DESIGN.md`. Ce fichier n'en est que le
résumé opérationnel : en cas de doute, le cahier des charges fait foi, et on
demande à l'utilisateur plutôt que d'inventer.

## Méthode de travail

- **Pas de code sans validation** de la tâche par l'utilisateur ; poser les
  questions quand un point de règle est ambigu, avant de coder.
- Langue : échanges, docs et textes du jeu en **français**. Code (identifiants,
  noms de fichiers) en **anglais** ; commentaires en français.

## Stack

- Monorepo **pnpm workspaces**, **TypeScript strict** partout.
- `apps/client` : **Vite**, interface en **DOM/CSS** (pas de framework, pas de 3D),
  mobile d'abord. `main.ts` = jeu complet (en ligne + solo) ;
  `demo/main.ts` = page autonome solo (`pnpm --filter @jeu-ville/client build:demo`).
- **Pas de serveur à nous, pas de base de données, pas de compte** (hébergement
  gratuit) : jeu en ligne via **Supabase Realtime** (canaux broadcast + presence),
  jeu web et page légale sur **GitHub Pages** (`.github/workflows/pages.yml`).
- `packages/shared` : catégories, listes de mots, vérification des réponses,
  moteur de partie (pur), **table en ligne** (`online/` : hôte, reprise, salon),
  messages entre téléphones validés avec **zod**, et **équilibrage**.
- Tests : **Vitest** (le jeu en ligne est testé avec un transport en mémoire).

## Règles d'architecture

1. **Le téléphone de l'hôte arbitre la table** (choix validé par l'utilisateur
   pour l'hébergement gratuit) : il fait tourner `CardGame`, distribue, tire la
   lettre, détecte les duels et valide les réponses. Les autres n'envoient que
   des **intentions** (`answer` : mot), vérifiées avec zod par l'hôte. Tout
   message reçu d'un autre téléphone est validé.
2. **Si l'hôte part**, le joueur arrivé le plus tôt reprend la partie à partir
   de la dernière sauvegarde (`CardGame.snapshot/restore`, « époque » suivante).
   Limite assumée : la sauvegarde diffusée contient les paquets, et un hôte
   pourrait tricher en modifiant son appli.
3. **Moteur pur** : `CardGame` (`packages/shared/src/cards/game.ts`), temps et
   hasard injectés, testé unitairement. L'hôte en ligne et le mode solo l'utilisent tel quel.
4. **Tous les chiffres d'équilibrage** dans `packages/shared/src/config/cards.ts`
   — aucun nombre magique dans la logique.
5. Accepter un mot = l'ajouter à `packages/shared/src/cards/words.ts`.
6. Stores : ne rien stocker sur un serveur (sinon il faudrait des comptes et leur
   suppression dans l'appli), garder les textes légaux à
   jour (`apps/client/src/legal/texts.ts`) et ne rien charger depuis Internet en
   mode solo (polices embarquées). Après un changement web : `pnpm build:app`.
7. Secrets (clé de signature des applis…) uniquement en variables d'environnement
   ou hors du dépôt, jamais commités.

## Structure

```
apps/client/src      app.ts (navigation) · ui/ (accueil, table, cartes, règles, réglages, tuto)
                     net/ (lien table en ligne / solo, transports) · demo/ (page solo)
                     native.ts (Capacitor : vibrations, barre d'état, bouton retour)
                     legal/ (confidentialité, mentions, CGU : appli + page legal.html)
apps/client/android, apps/client/ios   projets natifs Capacitor (publication : docs/STORES.md)
                     net/transports.ts (Supabase Realtime, ou local entre onglets)
packages/shared/src  config/ (ÉQUILIBRAGE) · cards/ (catégories, mots, réponses, partie)
                     online/ (table en ligne : transport, hôte, reprise, salon)
```

## Commandes

```bash
pnpm install
cp .env.example apps/client/.env.local   # clés Supabase (ou VITE_ONLINE=local)
pnpm dev                      # jeu sur http://localhost:5173 (?online=local : en ligne entre onglets)
pnpm test
pnpm typecheck
pnpm --filter @jeu-ville/client build:app   # appli native (puis npx cap open android|ios)
```
