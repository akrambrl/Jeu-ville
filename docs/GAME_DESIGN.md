# Bac Bataille — cahier des charges

Jeu multijoueur façon **petit bac**, avec des **pièces d'or** à miser, jouable
dans le navigateur sur mobile et PC. On joue **en ligne contre de vrais joueurs**
(2 à 6 par table) ou **en solo contre des bots** (1 à 5), comme sur Ludoking.
Titre provisoire.

## But du jeu

Ruiner les autres. Chacun commence avec **10 pièces d'or** ; qui n'a plus de
pièce au moment de miser est **éliminé**. Le **dernier qui a encore des pièces
gagne** ; les autres sont classés dans l'ordre inverse de leur élimination.

## Une manche

1. **Mise** : chacun pose sa mise au milieu de la table, ça fait un **tas**. La
   mise est de **1 pièce, puis monte de 1 toutes les 5 manches** (2, 3…) pour que
   les parties ne traînent pas. Un joueur qui n'a plus assez pose ce qui lui reste.
2. **Tirage de la lettre** : une grande roue tourne au milieu de la table, s'arrête
   sur la lettre, qui file ensuite dans son badge en haut de l'écran.
3. **Les catégories défilent** devant chaque joueur (un rouleau chacun) et
   s'arrêtent l'une après l'autre… **toutes sur la même : MATCH !** Il y a donc
   une réponse à chaque manche, sans attendre.
   - Chaque lettre sort une fois avant qu'une lettre ne revienne ; les lettres
     trop dures (K, Q, U, W, X, Y, Z) sont exclues.
   - Chaque catégorie sort une fois avant de revenir, jamais deux fois de suite,
     et seulement avec une lettre pour laquelle la liste du jeu a au moins 5 mots.
4. **Le premier qui écrit un mot valide** (bonne lettre, bonne catégorie) **rafle
   tout le tas**. Le champ de réponse commence déjà par la lettre.
5. **Personne ne trouve** dans le temps (15 s) : le tas **reste au milieu** et
   s'ajoute à la mise suivante (**cagnotte**).
6. **Mauvaise réponse** : petit temps d'attente (1,5 s) avant de réessayer, sans
   perdre de pièce.

Cas particulier : si plus personne n'a de pièce (tout est dans la cagnotte), la
manche se joue sans mise et personne n'est éliminé.

## Les catégories

Prénom, Fruit ou légume, Métier, Pays ou ville, Animal, Célébrité, Marque,
Sport, Objet de la maison, Plat ou dessert, Vêtement, Partie du corps. **Chaque
catégorie a sa couleur** (Prénom rose, Fruit ou légume vert, Métier orange, Pays
ou ville bleu, Animal marron, Célébrité or, Marque violet, Sport rouge, Objet de
la maison turquoise, Plat ou dessert magenta, Vêtement bleu ciel, Partie du corps
pêche) : `packages/shared/src/cards/categories.ts`.

## À l'écran

La table occupe **tout l'écran, sans défilement**. Comme autour d'une vraie
table, **on est toujours en bas** et les adversaires sont placés autour du tapis,
dans l'ordre de la table : à 2 joueurs, l'adversaire **en face** (en haut) ; à 3,
un **à gauche** et un **à droite** ; à 4, **un de chaque côté** (gauche, face,
droite) ; à 5 et 6, gauche, deux ou trois en face, droite. Chacun a son **rouleau
de catégories**, son nom dessous et sa **bourse** en pastille sur le coin ; le
**tas de pièces** est au milieu. Sa propre bourse est en bas de l'écran, la
lettre en badge dans la barre du haut. La taille des rouleaux est calculée pour
remplir la place libre ; un joueur éliminé garde sa place, grisé (💀).

Cinématiques :
- **mise** : une pièce vole de la bourse de chacun vers le tas ;
- **tirage de la lettre** : grande roue à rayons au milieu de l'écran, puis la
  lettre file dans son badge ;
- **défilement** : les rouleaux font défiler des catégories au hasard, s'arrêtent
  l'un après l'autre sur la même (soi en dernier), tampon « MATCH ! », puis le
  panneau de réponse ;
- **fin de manche** : les pièces du tas glissent une à une vers la bourse du
  gagnant, qui sautille et compte chaque pièce à son arrivée (« RAFLÉ ! »,
  confettis, tintement de chaque pièce qui arrive puis « ka-ching ! »), ou tampon « CAGNOTTE ! » ; « MISE ×2 » quand la mise monte.

## Direction artistique

Ambiance **jeu télé / stickers** : fond nuit violet éclairé de projecteurs,
accents néon (rose `#ff3d7f`, or `#ffc93c`, cyan `#2ee6d6`), contours épais
encre (`#1b1340`) et ombres dures façon cartoon. Typo **Lilita One** (titres,
boutons, lettre) et **Nunito** (texte). Tuiles de catégorie aux couleurs de leur
catégorie, avec médaillon ; pièces d'or dessinées en CSS. Animations : rouleaux,
pièces qui volent, tampons « MATCH ! » / « RAFLÉ ! », barre de temps, confettis
quand on gagne. Petits sons synthétisés (coupables avec 🔊).
Tout est dans `apps/client/src/ui/styles.css` (variables en tête de fichier) et
`apps/client/src/ui/fx.ts` (sons, confettis).

## Prise en main

- **Tutoriel illustré en 4 étapes**, montré automatiquement avant la toute
  première partie (but du jeu, mise, défilement et match, réponse la plus rapide) ;
  on peut le revoir depuis « Comment on joue ? ».
- Le panneau de réponse rappelle ce qu'on peut gagner (« Rafle 6 pièces ! »),
  la catégorie et la lettre.
- Messages explicites : « Yanis rafle 3 pièces avec « rectum » ! », « Personne
  n'a trouvé : les 4 pièces restent au milieu. Cagnotte ! », « La mise monte :
  2 pièces par manche ! », éliminations.

## Réponses

- Elles sont vérifiées avec la **liste de mots du jeu**
  (`packages/shared/src/cards/words.ts`).
- On ignore accents, majuscules, tirets, apostrophes, articles (« la banane »)
  et pluriels. Métiers : le féminin est reconnu tout seul (boulangère,
  coiffeuse, actrice). Célébrité : vraies personnes et personnages célèbres (Garfield,
  Pikachu…) ; le nom seul suffit (« Mbappé »), et la lettre peut être celle du
  prénom ou du nom.
- **Une faute de frappe est tolérée** pour les mots d'au moins 5 lettres (lettre
  en trop, en moins, remplacée, ou deux lettres inversées) : « mamouth » compte
  pour « mammouth ». La première lettre doit rester la bonne.
- Mauvaise réponse : petit temps d'attente avant de réessayer.
- **Vibrations** (téléphones Android) : un coup au « MATCH ! », deux petits
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
  13 s après le défilement des catégories (qui ne compte pas dans les 15 s de
  réponse), et sèchent environ une fois sur trois.

## Chiffres

Tous les réglages (pièces de départ, mise et sa montée, durées, lettres, bots)
sont dans `packages/shared/src/config/cards.ts`. Durée d'une partie (simulée
entre bots) : environ 15 manches à 2 joueurs, 30 à 4, 40 à 6 (une manche ≈ 20 s).

## Pistes (non faites)

- Saisie vocale des réponses, vote des joueurs pour les mots absents de la liste.
- Tables privées entre amis (code à partager), classement général, niveaux de bots.
- Bonus (pièce double, vol de pièces…), thèmes de catégories.

## Applis mobiles et stores

Le jeu sort aussi en appli Android et iOS (Capacitor). Pas de compte : rien
n'est stocké ailleurs que sur le téléphone. Réglages ⚙️ : son, tuto, textes
légaux, effacement des données de l'appareil. Pseudos filtrés (insultes, haine).
Publication et hébergement gratuit : voir `docs/STORES.md`.

