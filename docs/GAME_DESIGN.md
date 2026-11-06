# Bac Bataille — cahier des charges

Jeu de cartes multijoueur façon **petit bac**, jouable dans le navigateur sur
mobile et PC. On joue **en ligne contre de vrais joueurs** (2 à 6 par table) ou
**en solo contre des bots** (1 à 5), comme sur Ludoking. Titre provisoire.

## But du jeu

Se débarrasser de toutes ses cartes. Le premier qui n'a plus aucune carte
(paquet et pile vides) gagne ; les autres sont classés au nombre de cartes restantes.

## Les cartes

- Chaque joueur reçoit le même nombre de cartes, face cachée (son **paquet**).
- Chaque carte a une **couleur** (rouge, bleu, vert, jaune) et **deux catégories**,
  par exemple « Prénom / Pays ou ville ».
- Le nombre de couleurs dépend du nombre de joueurs, pour que les duels ne se
  fassent pas attendre : **2 couleurs à 2 joueurs** (un duel une manche sur
  deux), **3 à 3 joueurs**, **4 à partir de 4**.
- Catégories : Prénom, Fruit ou légume, Métier, Pays ou ville, Animal,
  Célébrité, Marque, Sport, Objet de la maison, Plat ou dessert, Vêtement,
  Partie du corps.

## Une manche

1. Une **lettre** est tirée au hasard (les lettres trop dures — K, Q, U, W, X,
   Y, Z — sont exclues).
2. Tout le monde **retourne en même temps** la carte du dessus de son paquet et
   la pose sur sa **pile**, face visible. On ne choisit pas sa carte.
3. Si la carte du dessus de ma pile a **la même couleur** que celle d'un autre
   joueur : **duel** entre nous (à 3 ou plus si plusieurs ont la même couleur).
4. Pendant le duel, chacun choisit **une des deux catégories de sa propre carte**
   et écrit le plus vite possible un mot qui commence par la lettre.
5. Le **premier qui donne un mot valide gagne** : il se débarrasse de sa pile, et
   le perdant **récupère les deux piles** sous son paquet. À plusieurs perdants,
   chacun reprend sa pile et la pile du gagnant est partagée entre eux.
6. Sans bonne réponse dans le temps imparti, les piles restent sur la table.
   Sans couleur en commun, on passe directement à la manche suivante : les
   piles grossissent, et les duels suivants rapportent gros.

Un joueur dont le paquet est vide ne pose plus de carte, mais sa pile reste en
jeu : il doit gagner un duel pour s'en débarrasser et finir.

## Réponses

- Elles sont vérifiées avec la **liste de mots du jeu**
  (`packages/shared/src/cards/words.ts`).
- On ignore accents, majuscules, tirets, apostrophes, articles (« la banane »)
  et pluriels. Célébrité : le nom seul suffit (« Mbappé »), et la lettre peut
  être celle du prénom ou du nom.
- Mauvaise réponse : petit temps d'attente avant de réessayer.

## Modes

- **En ligne** : on choisit un pseudo, on rejoint une table qui attend des
  joueurs. La partie démarre seule quelques secondes après l'arrivée du
  deuxième joueur (tout de suite à 6). Un joueur qui part en cours de partie
  est remplacé par un bot. Après le classement, la table repart pour une
  nouvelle partie.
- **Solo** : contre 1 à 5 bots, sans serveur. Les bots répondent après un délai
  aléatoire et sèchent parfois.

## Chiffres

Tous les réglages (cartes par joueur, durées, lettres, bots) sont dans
`packages/shared/src/config/cards.ts`.

## Pistes (non faites)

- Saisie vocale des réponses, vote des joueurs pour les mots absents de la liste.
- Tables privées entre amis (code à partager), classement général, niveaux de bots.
- Cartes spéciales (joker, inversion…), thèmes de catégories.
