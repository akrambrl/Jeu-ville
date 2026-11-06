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
- `apps/server` : **Node.js** + **Colyseus 0.16** (une room = une table) +
  **Fastify** (API REST : sessions par pseudo), sur le même serveur HTTP.
  Version majeure de Colyseus figée : ne pas la monter sans accord.
- `packages/shared` : catégories, listes de mots, vérification des réponses,
  moteur de partie (pur), protocole (validation **zod**) et **équilibrage**.
- Base : **PostgreSQL** via **Drizzle ORM** (migrations versionnées) — seulement
  les comptes ; les parties vivent en mémoire.
- Tests : **Vitest**. Dev local : **Docker Compose** (Postgres).

## Règles d'architecture

1. **Le serveur fait autorité** : il distribue, tire la lettre, retourne les
   cartes, détecte les duels et valide les réponses. Le client n'envoie que des
   **intentions** (`answer` : catégorie + mot), validées avec zod.
2. Les **paquets restent secrets** : seule la vue publique (nombres de cartes,
   carte du dessus de chaque pile, duels) est envoyée aux clients.
3. **Moteur pur** : `CardGame` (`packages/shared/src/cards/game.ts`), temps et
   hasard injectés, testé unitairement. Le serveur et le mode solo l'utilisent tel quel.
4. **Tous les chiffres d'équilibrage** dans `packages/shared/src/config/cards.ts`
   — aucun nombre magique dans la logique.
5. Accepter un mot = l'ajouter à `packages/shared/src/cards/words.ts`.
6. Secrets (base…) uniquement en variables d'environnement, jamais commités.

## Structure

```
apps/client/src      app.ts (navigation) · ui/ (accueil, table, cartes, règles)
                     net/ (API REST, lien table en ligne / solo) · demo/ (page solo)
apps/server/src      api/ (routes REST) · domain/ (sessions) · rooms/ (CardRoom)
                     db/ (schéma Drizzle, migrations) · drizzle/ (SQL généré)
packages/shared/src  config/ (ÉQUILIBRAGE) · cards/ (catégories, mots, réponses, partie)
                     protocol/ (messages client ↔ serveur)
```

## Commandes

```bash
pnpm install
docker compose up -d          # PostgreSQL local (ou tout Postgres 16 + DATABASE_URL)
cp .env.example .env
pnpm dev                      # serveur (2567, migrations auto) + client (5173)
pnpm test                     # tests ; ceux sur base réelle utilisent TEST_DATABASE_URL (vidée à chaque lancement)
pnpm typecheck
pnpm db:generate              # après modification de apps/server/src/db/schema.ts
```
