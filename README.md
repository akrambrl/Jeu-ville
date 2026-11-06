# Bac Bataille (titre provisoire)

Jeu de cartes multijoueur façon petit bac, jouable dans le navigateur sur mobile
et PC : en ligne contre de vrais joueurs, ou en solo contre des bots. Règles
complètes : [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).
Règles du projet : [`CLAUDE.md`](CLAUDE.md).

## Lancer le jeu en local

Prérequis : Node.js 22+, pnpm 10, Docker (ou un PostgreSQL 16).

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm dev
```

Puis ouvrir http://localhost:5173. Sur un téléphone du même réseau :
`http://<ip-de-ton-pc>:5173`.

## Jouer en ligne (Render)

Le fichier `render.yaml` décrit tout : un service web (le jeu et le serveur
temps réel sur **une seule adresse**) et une base PostgreSQL, en Europe.

1. Créer un compte sur https://render.com (connexion avec GitHub).
2. **New → Blueprint**, choisir ce dépôt et la branche qui contient `render.yaml`.
3. Valider : Render compile le jeu, crée la base, applique les migrations et
   démarre. L'adresse du jeu s'affiche (ex. `https://jeu-ville-93.onrender.com`).
4. Partager cette adresse : chacun choisit son pseudo et clique sur « Jouer en ligne ».

Offre gratuite : le serveur s'endort après 15 min sans visite (le premier
chargement prend alors environ une minute) et la base gratuite expire au bout de
30 jours. Pour un usage durable, passer le service et la base en offre payante.

## Version solo autonome

`pnpm --filter @jeu-ville/client build:demo` produit une seule page HTML
(`apps/client/dist-demo/bac-bataille.html`) jouable sans serveur, contre des bots.
