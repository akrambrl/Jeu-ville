# CLAUDE.md — Jeu de simulation de vie multijoueur dans le 93

Le cahier des charges complet est dans `docs/GAME_DESIGN.md`. Ce fichier n'en
est que le résumé opérationnel : en cas de doute, le cahier des charges fait foi,
et on demande à l'utilisateur plutôt que d'inventer.

## Méthode de travail

- On avance **phase par phase** (feuille de route ci-dessous). Ne pas anticiper
  une phase suivante sans accord.
- **Pas de code sans validation** de l'architecture ou de la tâche par l'utilisateur.
- Poser les questions quand un point est ambigu, avant de coder.
- Langue : échanges, docs et textes du jeu en **français**. Code (identifiants,
  noms de fichiers) en **anglais** ; commentaires en français ou anglais, au choix,
  mais cohérents dans un même fichier.

## Stack

- Monorepo **pnpm workspaces**, **TypeScript strict** partout.
- `apps/client` : **Three.js 0.170** (3D façon Sims : caméra libre, ombres) + **Vite**,
  mobile + PC. Modèles 3D **Kenney** et persos **Quaternius** (CC0) dans `src/assets/models/` ; le reste
  (façades, enseignes, sols) est dessiné en code. Interface (menus, HUD) en DOM/CSS.
- `apps/server` : **Node.js** + **Colyseus 0.16** (temps réel) + **Fastify** (API REST :
  comptes, agence immobilière, achats, webhooks Stripe), sur le même serveur HTTP.
  Versions majeures de Three.js et Colyseus figées volontairement : ne pas monter
  de version sans accord. N'utiliser que des assets libres de droits (CC0 de préférence).
- `packages/shared` : types, schémas de messages (validation **zod**), formules
  de jeu pures et **configuration d'équilibrage**.
- Base : **PostgreSQL** via **Drizzle ORM** (migrations versionnées).
- Tests : **Vitest**. Dev local : **Docker Compose** (Postgres).
- Paiements : **Stripe** (phase 9 seulement).

## Règles d'architecture (non négociables)

1. **Le serveur fait autorité** sur tout : économie, achats, salaires, jauges,
   simulation. Le client envoie des **intentions** (« acheter le local X »),
   jamais des résultats (« j'ai 500 € »). Toute entrée client est validée (zod).
2. **Achats concurrents** : toute opération sur un bien rare (local, parcelle,
   véhicule rare, part) se fait dans une **transaction SQL** avec verrouillage
   (`SELECT … FOR UPDATE`) + contraintes d'unicité en base. Le premier gagne, le
   second reçoit « ce bien vient d'être acheté ». Jamais de doublon.
3. **Argent** : montants en **entiers** (centimes, `bigint`), jamais de flottants.
   Chaque mouvement d'argent passe par un **journal de transactions** (ledger)
   avec motif ; les soldes doivent pouvoir être recalculés depuis le journal.
   Opérations idempotentes (clé d'idempotence pour les achats et paiements).
4. **Tous les chiffres d'équilibrage** (prix, revenus, délais, taux de décroissance
   des jauges, seuils de déblocage…) vivent dans
   `packages/shared/src/config/` — **aucun nombre magique** dans la logique.
5. **Le monde tourne hors ligne** : la simulation est côté serveur.
   - Jauges du joueur (faim, hygiène…) : calcul **paresseux** à partir de
     `valeur + taux × temps écoulé` (pas de tick par joueur).
   - Économie (revenus des commerces, salaires, loyers, bots) : **ticks
     périodiques** en lot, rejouables et idempotents (un tick manqué se rattrape).
6. **Formules de jeu = fonctions pures** dans `packages/shared`, testées
   unitairement. Le serveur les applique, le client peut les utiliser pour
   l'affichage prédictif uniquement.
7. **Découpage spatial** : ville → **quartiers** dès le départ. Une room
   Colyseus par quartier ; le client ne reçoit que ce qui est autour du joueur.
8. Plans des villes : générés **hors ligne** depuis **OpenStreetMap** par un
   script (`tools/osm-import`), simplifiés en grille isométrique, sortie JSON
   versionnée. **Citer « © les contributeurs d'OpenStreetMap »** dans le jeu (ODbL).

## Temps de jeu

- **1 an de jeu = 1 semaine réelle** (≈ 27,6 min réelles = 1 jour de jeu).
- Départ à **25 ans**, fin à 70 ans (≈ 45 semaines réelles).
- Mandat de maire : **4 semaines réelles**.
- Toute conversion temps réel ↔ temps de jeu passe par un **module unique**
  (`shared/src/time`).

## Règles de game design à respecter

- Priorité : un jeu **addictif et cohérent**, qui donne envie de revenir chaque jour.
- Capital de départ : **20 000 €** (monnaie du jeu).
- **Monnaie premium** : uniquement cosmétiques et maison. **Interdit** en premium :
  commerces, parcelles, compagnies de transport, parts de grosses structures.
- Échanges entre joueurs **uniquement en monnaie du jeu**.
- Mariage/enfants : **choix libre**, **uniquement avec des bots**.
- Parcelles : **2 max par joueur et par ville**, premier arrivé.
- Déménagement : **1 fois toutes les 2 semaines** max.
- Commerces bots uniquement : médecins, pharmacies, agence immobilière (1/ville),
  commissariat.
- Inactivité : alerte à **7 jours**, mise en vente à **30 jours**, mode vacances.
- Vote maire : joueurs habitants **actifs depuis ≥ 1 semaine** dans la ville.
- Pas de vraies reproductions de billets en euros (pièces/billets stylisés).

## Interdits (hors périmètre)

Pas de : prêts bancaires, associations, mariage entre vrais joueurs, vol/agression
entre joueurs, prison, drogue, **faits divers réels**, matchs de foot joués par les
joueurs, stationnement payant, transport payant entre villes, revente contre de
l'argent réel, stores Apple/Google.

## Légal / sécurité

- Chat : filtre d'insultes, **signaler**, **bloquer**, outils de modération.
- RGPD : ne collecter que le nécessaire ; prévoir export et suppression de compte.
- Mineurs : accord parental < 15 ans, chat restreint.
- Secrets (clés Stripe, DB) : uniquement en variables d'environnement, jamais commités.

## Feuille de route

1. Prototype : une ville iso, déplacement, création de perso, jauges, appart de départ.
2. Économie de base : monnaie, catalogue, 3-4 commerces niv. 1, clients bots,
   agence immobilière, simulation serveur.
3. Multijoueur : comptes, plusieurs joueurs, achats concurrents, chat modéré.
4. Métiers et emploi : mini-missions, salaires, offres.
5. Villes multiples : carte du 93, téléportation, déblocage, classements.
6. Maire, élections, propreté, sécurité, commissariat.
7. Parcelles, immeubles, parts, transports.
8. Famille, vieillissement, événements aléatoires, club de foot.
9. Monnaie premium (Stripe) et pages légales.

## Structure

```
apps/client/src      world/ (vue 3D : sol, bâtiments, props, persos, tram/RER)
                     ui/ (écrans DOM, HUD) · net/ (API REST, lien serveur/démo)
                     demo/ (démo solo sans serveur) · assets/models/ (Kenney, Quaternius, CC0)
apps/server/src      api/ (routes REST) · domain/ (logique métier) · rooms/ (Colyseus)
                     db/ (schéma Drizzle, migrations, seed) · drizzle/ (SQL généré)
packages/shared/src  config/ (ÉQUILIBRAGE) · time/ · formulas/ · map/ · protocol/
packages/shared/maps cartes de quartier JSON générées depuis OSM
tools/osm-import     OSM → grille isométrique
tools/character-import  personnages Quaternius (CC0) → GLB allégés (assets/models/people)
```

- Identifiant de quartier = clé globale `<ville>:<quartier>` (ex. `noisy-le-sec:centre-ville-mairie`).
- Tout mouvement d'argent passe par `recordLedgerEntry` (`apps/server/src/domain/ledger.ts`).

## Commandes

```bash
pnpm install
docker compose up -d          # PostgreSQL local (ou tout Postgres 16 + DATABASE_URL)
cp .env.example .env
pnpm dev                      # serveur (2567, migrations + seed auto) + client (5173)
pnpm test                     # tests ; ceux sur base réelle utilisent TEST_DATABASE_URL (vidée à chaque lancement)
pnpm typecheck
pnpm db:generate              # après modification de apps/server/src/db/schema.ts
pnpm map:fetch && pnpm map:build   # re-télécharger / régénérer les cartes OSM
pnpm characters:fetch && pnpm characters:build   # re-télécharger / régénérer les personnages 3D
```
