# Bac Bataille — cahier des charges

Jeu de cartes multijoueur façon **petit bac**, jouable dans le navigateur sur
mobile et PC. On joue **en ligne contre de vrais joueurs** (2 à 6 par table) ou
**en solo contre des bots** (1 à 5), comme sur Ludoking. Titre provisoire.

## But du jeu

Se débarrasser de toutes ses cartes. Le premier qui n'a plus aucune carte
(paquet et pile vides) gagne ; les autres sont classés au nombre de cartes restantes.

## Les cartes

- Chaque joueur reçoit le même nombre de cartes, face cachée (son **paquet**).
- Chaque carte porte **deux catégories**, par exemple « Prénom / Pays ou ville ».
- **Chaque catégorie a sa couleur** (Prénom rose, Fruit ou légume vert, Métier
  orange, Pays ou ville bleu, Animal marron, Célébrité or, Marque violet, Sport
  rouge, Objet de la maison turquoise, Plat ou dessert magenta, Vêtement bleu
  ciel, Partie du corps pêche) : chaque moitié de carte prend la couleur de sa
  catégorie. Deux cartes qui ont une couleur en commun ont donc une catégorie en
  commun. Couleurs dans `packages/shared/src/cards/categories.ts`.
- Le nombre de catégories en jeu dépend du nombre de joueurs (tirées au hasard à
  chaque partie), pour que les duels ne se fassent pas attendre : **7 à
  2 joueurs** (un duel environ une manche sur deux), **9 à 3**, **10 à 4**,
  toutes (12) à 5 ou 6.
- Catégories : Prénom, Fruit ou légume, Métier, Pays ou ville, Animal,
  Célébrité, Marque, Sport, Objet de la maison, Plat ou dessert, Vêtement,
  Partie du corps.

## Une manche

1. Une **lettre** est tirée au hasard (les lettres trop dures — K, Q, U, W, X,
   Y, Z — sont exclues).
   Elle reste **la même tant qu'il n'y a pas de duel** ; une nouvelle lettre est
   tirée après chaque manche avec duel (gagné ou non).
2. Tout le monde **retourne en même temps** la carte du dessus de son paquet et
   la pose sur sa **pile**, face visible. On ne choisit pas sa carte.
3. Si la carte du dessus de ma pile a **au moins une catégorie en commun** avec
   celle d'un autre joueur : **duel** entre nous (à 3 ou plus si plusieurs ont
   cette catégorie). Chaque joueur ne fait qu'un duel par manche : on forme
   d'abord le plus grand groupe autour d'une même catégorie.
4. Pendant le duel, chacun écrit le plus vite possible un mot qui commence par
   la lettre, **dans la catégorie commune** (si les cartes ont leurs deux
   catégories en commun, l'une ou l'autre). Pas besoin de choisir la catégorie :
   le mot est accepté dans n'importe quelle catégorie commune. Le champ de
   réponse commence déjà par la lettre.
5. Le **premier qui donne un mot valide gagne** : il se débarrasse de sa pile, et
   le perdant **récupère les deux piles** sous son paquet. À plusieurs perdants,
   chacun reprend sa pile et la pile du gagnant est partagée entre eux.
6. Sans bonne réponse dans le temps imparti, les piles restent sur la table.
   Sans catégorie en commun, on passe directement à la manche suivante : les
   piles grossissent, et les duels suivants rapportent gros.

Un joueur dont le paquet est vide ne pose plus de carte, mais sa pile reste en
jeu : il doit gagner un duel pour s'en débarrasser et finir.

## À l'écran

La table occupe **tout l'écran, sans défilement**. Comme à la bataille, les
**tas de tous les joueurs sont au milieu**, sur le tapis : la taille des cartes
est calculée pour remplir la place libre (tas côte à côte de préférence), donc
les catégories sont écrites en gros. La lettre de la manche est en badge dans la
barre du haut ; les adversaires sont en bandeau, son paquet en bas.

Cinématiques :
- **tirage de la lettre** : grande roue en plein écran, puis la lettre file dans
  son badge ;
- **cartes posées** : une carte vole de chaque paquet vers son tas et se retourne ;
- **duel** : face-à-face « VS », les deux cartes en grand et la catégorie
  commune en énorme, puis le panneau de réponse ;
- **fin de duel** : les tas volent vers le paquet du perdant, confettis si on gagne.

## Direction artistique

Ambiance **jeu télé / stickers** : fond nuit violet éclairé de projecteurs,
accents néon (rose `#ff3d7f`, or `#ffc93c`, cyan `#2ee6d6`), contours épais
encre (`#1b1340`) et ombres dures façon cartoon. Typo **Lilita One** (titres,
boutons, lettre) et **Nunito** (texte). Cartes en deux moitiés aux couleurs de leurs
catégories, avec médaillons et pastille « ou » ; dos de carte nuit à monogramme doré « BB ».
Animations : roue de la lettre à rayons, tampon « DUEL ! », barre de temps,
confettis quand on gagne. Petits sons synthétisés (coupables avec 🔊).
Tout est dans `apps/client/src/ui/styles.css` (variables en tête de fichier) et
`apps/client/src/ui/fx.ts` (sons, confettis).

## Prise en main

- **Tutoriel illustré en 4 étapes**, montré automatiquement avant la toute
  première partie (but du jeu, lettre et cartes posées, duel sur une catégorie
  commune, réponse la plus rapide) ; on peut le revoir depuis « Comment on joue ? ».
- Pendant un duel, la **moitié de carte de la catégorie commune brille** sur le
  tapis et dans le « VS » (l'autre moitié s'estompe) : on voit pourquoi il y a duel.
- Messages explicites : « Tu te débarrasses de tes cartes : Chloé ramasse
  4 cartes ! », « Tu ramasses 3 cartes… », duel entre les autres joueurs signalé.

## Réponses

- Elles sont vérifiées avec la **liste de mots du jeu**
  (`packages/shared/src/cards/words.ts`).
- On ignore accents, majuscules, tirets, apostrophes, articles (« la banane »)
  et pluriels. Métiers : le féminin est reconnu tout seul (boulangère,
  coiffeuse, actrice). Célébrité : vraies personnes et personnages célèbres (Garfield,
  Pikachu…) ; le nom seul suffit (« Mbappé »), et la lettre peut être celle du
  prénom ou du nom.
- Mauvaise réponse : petit temps d'attente avant de réessayer.
- **Vibrations** (téléphones Android) : un coup au début d'un duel, deux petits
  coups rapides pour une bonne réponse gagnante, un long « bzzz » pour une
  mauvaise réponse. Les iPhone ne permettent pas aux pages web de vibrer.

## Modes

- **En ligne** (gratuit, sans serveur à nous : Supabase Realtime) : on choisit
  un pseudo, puis
  - **Partie rapide** : on rejoint une table publique qui attend des joueurs
    (annoncée dans un salon commun), sinon on en ouvre une ;
  - **Table entre amis** : on crée une table privée et on partage son **code**
    (5 caractères) ou un lien d'invitation (`?table=CODE`).
  Le téléphone de **l'hôte** (celui qui a ouvert la table) arbitre la partie.
  La partie démarre seule 10 s après l'arrivée du deuxième joueur (tout de suite
  à 6) ; qui arrive en cours de partie la regarde et joue à la suivante. Un
  joueur qui perd le réseau **garde sa place 30 s** ; s'il ne revient pas (ou
  quitte), un bot le remplace. **Si l'hôte part, un autre joueur reprend la
  partie** là où elle en était, en quelques secondes. Après le classement, la
  table repart pour une nouvelle partie.
- **Solo** : contre 1 à 5 bots, sans serveur. Les bots répondent entre 6 et
  13 s après la cinématique « VS » (qui ne compte pas dans les 15 s de réponse),
  et sèchent environ une fois sur trois.

## Chiffres

Tous les réglages (cartes par joueur, durées, lettres, bots) sont dans
`packages/shared/src/config/cards.ts`.

## Pistes (non faites)

- Saisie vocale des réponses, vote des joueurs pour les mots absents de la liste.
- Tables privées entre amis (code à partager), classement général, niveaux de bots.
- Cartes spéciales (joker, inversion…), thèmes de catégories.

## Applis mobiles et stores

Le jeu sort aussi en appli Android et iOS (Capacitor). Pas de compte : rien
n'est stocké ailleurs que sur le téléphone. Réglages ⚙️ : son, tuto, textes
légaux, effacement des données de l'appareil. Pseudos filtrés (insultes, haine).
Publication et hébergement gratuit : voir `docs/STORES.md`.

