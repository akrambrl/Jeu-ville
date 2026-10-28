# Jeu de ville 93 (titre provisoire)

Simulation de vie multijoueur dans les villes de Seine-Saint-Denis, jouable dans le
navigateur sur mobile et PC. Concept complet : [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).
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
4. Partager cette adresse : chacun choisit son pseudo et joue dans la même ville.

Offre gratuite : le serveur s'endort après 15 min sans visite (le premier
chargement prend alors environ une minute) et la base gratuite expire au bout de
30 jours. Pour un usage durable, passer le service et la base en offre payante.

## État d'avancement

**Phase 1 — Prototype** ✅
- **Vue 3D façon Sims** (Three.js) : soleil et ombres, caméra libre (glisser,
  tourner, zoomer), persos 3D animés. Modèles 3D : Kenney (CC0).
- Noisy-le-Sec, quartier Centre-Ville - Mairie, en **plan schématisé** généré depuis
  OpenStreetMap : rues droites aux vrais noms, îlots (pavillons, immeubles, cité,
  commerces, squares), mairie, églises et écoles à leur place approximative.
- Vraies architectures : pavillons à toit à deux pans, immeubles à balcons,
  mairie (toit à la Mansart, horloge, fronton, drapeau), églises à clocher,
  écoles avec cour (enfants qui jouent), boulangeries, gare RER E,
  pharmacies, fast-foods, commissariat (voitures de police), supermarchés avec
  parking. Pas de marques déposées : les enseignes de chaînes ont un nom générique.
- Carte étendue de la rue du Parc à la cité du Londeau : toutes les écoles
  (maternelles, élémentaires, collèges, lycées), gymnase et stade, place du marché,
  places (Jeanne-d'Arc et sa statue…), pistes cyclables.
- Faisceau ferré avec RER animés, tram T1, 7 lignes de bus et leurs arrêts ;
  des voyageurs attendent, montent et descendent.
- Manger dehors : marchands de maïs et de marrons, boulangeries, fast-foods,
  grandes surfaces (menus dans la config, achat validé par le serveur).
- Jour et nuit selon l'heure réelle (fenêtres et lampadaires allumés la nuit ;
  `?heure=22:30` dans l'adresse pour essayer).
- Une seule personne par case : on attend, on contourne, ou on s'arrête à côté.
- Agence immobilière (1 par ville) : louer ou acheter un appartement, une maison ou un
  local commercial (premier arrivé, transactions verrouillées), loyers prélevés chaque
  jour même hors ligne, déménagement toutes les 2 semaines au plus ; ouvrir un commerce
  (snack, coffee shop, barbier, laverie, boutique) qui rapporte grâce aux clients bots.
- Agence pour l'emploi : offres des commerces bots (livreur·se dans les fast-foods,
  vendeur·se au comptoir des boulangeries et supermarchés), services de missions vérifiées
  par le serveur (livrer à temps, servir la bonne commande), salaire et pourboires au
  journal, expérience et niveaux qui augmentent la paie ; tenue correcte exigée.
- Magasin de cycles (vélo, trottinette électrique à recharger) et animalerie (chien, chat
  à nourrir et promener, sinon recueilli par un refuge). Bus à 2 € avec arrivée en bus.
- Bouton « Aller à… » : chez moi et tous les lieux du quartier.
- Pseudo + création de personnage (sexe, 6 styles, peau, cheveux, corpulence).
- Déplacement au clic/toucher (A* côté serveur), case visée affichée, plusieurs joueurs visibles.
- Jauges faim, hygiène, apparence, santé, bonheur, qui baissent même hors ligne.
- Appart de départ (zone de 6 immeubles près de la mairie) : manger, se doucher, se changer.
- 20 000 € de départ, chaque mouvement d'argent tracé dans un journal.

Carte : © les contributeurs d’OpenStreetMap (ODbL). Modèles 3D : Kenney (www.kenney.nl, CC0).
