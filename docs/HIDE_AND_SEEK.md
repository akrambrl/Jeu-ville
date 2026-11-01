# Cache-cache géant multijoueur

Mode de jeu actuel. Il remplace la boucle de la simulation de vie (le code de la
ville reste dans le dépôt mais n'est plus lancé par le client). On garde la base
technique : carte OSM en grille, déplacements A* « une personne par case »,
rooms Colyseus avec serveur qui fait autorité, vue 3D, bots.

## Règles (version 1)

1. **Carte** : un seul quartier, découpé dans la carte OSM de Noisy-le-Sec
   (Centre-ville – Mairie, 52 × 48 cases autour de la place Jeanne-d'Arc).
2. **Rôles** : des cachés et des chercheurs. Les rôles sont tirés au sort parmi
   les joueurs connectés (environ 1 chercheur pour 4 joueurs, et toujours au
   moins un caché). Des **bots chercheurs** complètent pour avoir au moins
   2 chercheurs ; un joueur seul se cache contre 2 bots.
3. **Partie de 5 minutes** : 1 minute pour se cacher (les chercheurs ont les yeux
   bandés, ne bougent pas et ne voient personne), puis 4 minutes de recherche.
   Tout le monde part de la place Jeanne-d'Arc.
4. **Cachettes** : poubelles, voitures garées, halls d'immeubles, cages
   d'escalier, parkings souterrains. Elles sont déduites de la carte, de façon
   déterministe. Une seule personne par cachette. Un caché dans une cachette
   n'est plus visible (ni affiché, ni envoyé aux chercheurs).
5. **Fouille** : le chercheur touche une cachette proche pour la fouiller. Il
   doit ensuite attendre quelques secondes avant de pouvoir en fouiller une autre.
   S'il y a quelqu'un dedans, ce caché est éliminé.
6. **À découvert** : un caché dans la rue, dans le champ de vision d'un chercheur
   (portée limitée, les immeubles bloquent la vue), est éliminé dès que le
   chercheur le touche. Pas de course-poursuite.
7. **Indice** : chaque minute de recherche, un bip est émis près d'un caché
   encore en jeu (pas exactement sur lui), avec un cercle orange sur la carte.
8. **Élimination** : jusqu'à la partie suivante ; on regarde la fin en spectateur
   (on voit alors tous les cachés).
9. **Victoire** : les cachés gagnent si au moins un tient jusqu'au bout ; les
   chercheurs gagnent s'ils trouvent tout le monde avant.
10. **Hors périmètre** : déguisement, cachettes à risque.

Entre deux parties : écran des résultats (12 s), puis salon (15 s) où l'on peut
se promener. Un joueur qui arrive en cours de partie regarde en spectateur.
Un chercheur qui quitte la partie est remplacé par un bot.

Tous les chiffres (durées, portées, temps d'attente, bots, cachettes, quartier)
sont dans `packages/shared/src/config/hideSeek.ts`.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `packages/shared/src/config/hideSeek.ts` | Équilibrage du mode |
| `packages/shared/src/hideseek/arena.ts` | Découpe du quartier (sous-carte recalée) |
| `packages/shared/src/hideseek/spots.ts` | Génération des cachettes depuis la carte |
| `packages/shared/src/hideseek/sight.ts` | Portée et ligne de vue |
| `packages/shared/src/hideseek/roles.ts` | Répartition joueurs / bots |
| `packages/shared/src/hideseek/match.ts` | La partie : phases, intentions, élimination, indices, victoire |
| `packages/shared/src/hideseek/bots.ts` | Choix de la prochaine cachette d'un bot |
| `apps/server/src/rooms/HideSeekRoom.ts` | Room Colyseus `hideSeek` |
| `apps/client/src/net/hideSeekLink.ts` | Lien serveur (Colyseus) et démo locale |
| `apps/client/src/world/hidingSpots.ts` | Cachettes, indices et champ de vision en 3D |
| `apps/client/src/ui/hideSeekHud.ts` | Minuteur, rôle, fouille, salon, résultats |
| `apps/client/src/app/startHideSeek.ts` | Assemble vue, cachettes, HUD et lien |

- **Le serveur fait autorité** : le client n'envoie que des intentions validées
  par zod (`move`, `hide`, `leaveSpot`, `search`, `tag`). La partie vérifie la
  phase, le rôle, la distance, le temps d'attente et la ligne de vue.
- **Anti-triche** : la position d'un caché n'est jamais dans l'état Colyseus
  commun. Chaque client reçoit à part (`sight`) les seuls cachés qu'il a le
  droit de voir : un chercheur, ceux qui sont à découvert dans son champ de vision
  (et personne pendant la minute de cache) ; un caché, ses coéquipiers ; un
  spectateur, tout le monde.
- La même classe `HideSeekMatch` tourne sur le serveur et dans la démo solo
  (`demo.html`), où le joueur se cache contre les bots.
- Pas de base de données pour les parties (pas de classement pour l'instant) :
  le compte et le personnage servent de pseudo et d'avatar.

## Pistes pour la suite (non faites)

- Déguisement, cachettes à risque (exclus de la v1).
- Choisir son rôle, ou faire tourner les chercheurs d'une partie à l'autre.
- Plusieurs quartiers au choix, statistiques et classements.
- Supprimer le code de la simulation de ville s'il n'est plus utile.
