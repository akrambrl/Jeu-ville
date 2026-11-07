# Bac Bataille (titre provisoire)

Jeu de cartes multijoueur façon petit bac, jouable dans le navigateur sur mobile
et PC : en ligne contre de vrais joueurs, ou en solo contre des bots. Règles
complètes : [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).
Règles du projet : [`CLAUDE.md`](CLAUDE.md).

## Lancer le jeu en local

Prérequis : Node.js 22+, pnpm 10. Pas de serveur ni de base de données.

```bash
pnpm install
pnpm dev
```

Puis ouvrir http://localhost:5173 (sur un téléphone du même réseau :
`http://<ip-de-ton-pc>:5173`). Pour essayer le jeu en ligne sans Supabase,
ouvrir plusieurs onglets sur http://localhost:5173/?online=local.

## Jouer

**https://akrambrl.github.io/Jeu-ville/** — sur iPhone, dans Safari : Partager →
« Sur l'écran d'accueil » pour l'installer comme une appli.

## Jouer en ligne (gratuit)

Le jeu en ligne passe par **Supabase Realtime** (offre gratuite) : le téléphone
de l'hôte arbitre chaque table, et si l'hôte part, un autre joueur reprend la
partie. Le jeu web est publié gratuitement sur **GitHub Pages**. Mise en place
(5 minutes) : voir [`docs/STORES.md`](docs/STORES.md), sections 2.2 et 2.3.

## Version solo autonome

`pnpm --filter @jeu-ville/client build:demo` produit une seule page HTML
(`apps/client/dist-demo/bac-bataille.html`) jouable sans connexion, contre des bots.

## Applis mobiles (Android et iOS)

Le jeu est aussi emballé en appli native avec Capacitor (`apps/client/android`,
`apps/client/ios`). Tout ce qu'il faut pour publier sur Google Play et l'App
Store — compilation, comptes, textes des fiches, réponses aux questionnaires,
captures d'écran — est dans [`docs/STORES.md`](docs/STORES.md).

```bash
cd apps/client
pnpm build:app          # compile le jeu (clés Supabase dans .env.local) et le copie dans les projets natifs
npx cap open android                                   # ou : npx cap open ios (sur Mac)
```

