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

## État d'avancement

**Phase 1 — Prototype** ✅
- Noisy-le-Sec, quartier Centre-Ville - Mairie, en **plan schématisé** généré depuis
  OpenStreetMap : rues droites aux vrais noms, îlots (pavillons, immeubles, cité,
  commerces, squares), mairie, églises et écoles à leur place approximative.
- Vraies architectures : pavillons à toit à deux pans, immeubles à balcons,
  mairie (toit à la Mansart, horloge, fronton, drapeau), églises à clocher,
  écoles avec cour (enfants qui jouent), boulangeries, gare RER E,
  pharmacies, fast-foods, commissariat (voitures de police), supermarchés avec
  parking. Pas de marques déposées : les enseignes de chaînes ont un nom générique.
- Faisceau ferré avec RER animés et tram T1 animé jusqu'à son terminus de la gare.
- Bouton « Aller à… » : chez moi et tous les lieux du quartier.
- Pseudo + création de personnage (sexe, 6 styles, peau, cheveux, corpulence).
- Déplacement au clic/toucher (A* côté serveur), plusieurs joueurs visibles.
- Jauges faim, hygiène, apparence, santé, bonheur, qui baissent même hors ligne.
- Appart de départ (zone de 6 immeubles près de la mairie) : manger, se doucher, se changer.
- 20 000 € de départ, chaque mouvement d'argent tracé dans un journal.

Carte : © les contributeurs d’OpenStreetMap (ODbL).
