# Cahier des charges — Jeu de simulation de vie multijoueur dans le 93

> **Note pour Claude Code** : ce document décrit le concept complet du jeu. Commence par lire l'ensemble, propose une architecture technique, puis développe par phases en suivant la feuille de route (section 20). Les chiffres (prix, revenus, délais) sont des valeurs de départ : centralise-les dans un fichier de configuration pour pouvoir les ajuster facilement en test. Pose-moi tes questions avant de démarrer si un point est ambigu.

Nom du jeu : **à définir** (piste en cours : autour de « Bloc », ex. Blocville, Bloc Life, Mon Bloc).

---

## 1. Vision

Un jeu de simulation de vie **en ligne et multijoueur**, dans l'esprit des Sims, mais ancré dans les **vraies villes de Seine-Saint-Denis (93)**. Chaque joueur fait vivre un personnage : il travaille, gère son argent, nourrit sa famille, ouvre des commerces, investit, et participe à la **compétition entre villes**.

Le but : **réussir sa vie (jauge de bonheur) et faire de sa ville la meilleure du 93**, avec la possibilité d'en devenir **maire**.

Priorité absolue de conception : un jeu **addictif et cohérent**, qui donne envie de revenir **chaque jour**, et pas d'abandonner au bout de deux semaines.

## 2. Plateformes et technique

- **Jeu dans le navigateur**, jouable sur **mobile et PC** (pas d'application Apple/Google pour l'instant).
- Interface pensée pour les deux dès le départ : tactile avec gros boutons sur mobile, souris et plus d'infos affichées sur PC.
- Stack suggérée (à confirmer par Claude Code) :
  - Front : **TypeScript + Phaser 3** (rendu isométrique 2D, léger sur mobile).
  - Temps réel multijoueur : **Node.js + Colyseus** (ou WebSockets).
  - Base de données : **PostgreSQL**.
  - Paiements : **Stripe** (monnaie premium).
- **Le serveur fait autorité** sur tout : économie, achats, salaires, simulation. Le client n'affiche que ce qui se passe autour du joueur.
- **Achats concurrents** : quand deux joueurs achètent le même local ou la même parcelle en même temps, le serveur traite les demandes une par une via des **transactions en base** avec verrouillage. Le premier gagne, le second reçoit « ce bien vient d'être acheté ». Aucun doublon possible.
- Le monde **tourne en permanence**, même quand le joueur est hors ligne (simulation côté serveur par cycles réguliers).

## 3. Style visuel

- **Vue isométrique** de haut, façon **Habbo** / **Les Sims**.
- Style **voxel** : petits blocs colorés et arrondis, entre Habbo et Minecraft, moderne sans excès, agréable à regarder (référence : Crossy Road).
- Packs d'assets gratuits possibles pour démarrer (ex. Kenney).
- Plans des villes basés sur **OpenStreetMap** (grandes rues, lieux connus), **simplifiés** en blocs isométriques. Citer la source OSM dans le jeu.
- L'**état visuel de la ville** reflète sa gestion : propre et belle si bien gérée ; tags, murs sales, déchets et bots mécontents si délaissée.

## 4. Temps de jeu

- **1 an de jeu = 1 semaine réelle.**
- Tous les personnages démarrent à **25 ans**. De 25 à 70 ans : 45 semaines réelles (environ 10 mois).
- Mandat de maire : **4 semaines réelles** (= 4 ans de jeu).

## 5. Inscription et création du personnage

- Choix **homme ou femme**.
- Choix parmi **5-6 apparences de base**, avec réglage de la **couleur de peau**, de la **couleur de cheveux** et de la **corpulence**. Pas de modelage libre.
- Ensuite, le joueur se démarque par ses vêtements, sa coupe de cheveux et sa barbe (qui poussent avec le temps).
- Le joueur **choisit sa ville de départ** (ex. sa vraie ville). Si elle n'est pas encore débloquée : il commence dans une ville ouverte et s'inscrit comme **supporter** de sa ville, ce qui contribue à son déblocage.
- Chaque ville a une **zone d'appartements de départ** : tout le monde commence avec un appartement simple.
- Capital de départ : **20 000 €** (monnaie du jeu), dépensable librement (voiture, vêtements, ou local + loyer + travaux pour ouvrir un commerce). 20 000 € suffisent pour un petit commerce, mais sans marge.
- Petit tutoriel au démarrage.

## 6. Jauges du personnage

- **Bonheur** (jauge principale, boussole du jeu).
- **Faim** : se nourrir est obligatoire, sinon le personnage peut mourir.
- **Hygiène** : se laver.
- **Apparence** : vêtements (porter les mêmes habits tous les jours = paraître sale ou peu professionnel), cheveux et barbe qui poussent → coiffeur/barbier. L'apparence influence les chances d'embauche et la fidélité des clients.
- **Santé** : salle de sport, bilans médicaux avec l'âge.
- **Relations / famille**.
- **Argent**.

Pour éviter la corvée, prévoir des **raccourcis** : remplir son frigo pour la semaine, abonnement de croquettes pour le chien, aide à domicile bot pour les joueurs aisés.

## 7. Vie quotidienne et famille

- Dépenses : loyer, nourriture, vêtements, coiffeur, salle de sport, soins médicaux, carburant, entretien.
- **Mariage et enfants** : **choix libre** du joueur, jamais automatique, et **uniquement avec des personnages bots** (pas entre vrais joueurs).
- Enfants à nourrir et à **faire sortir** (parc, cinéma, fast-food) : fait monter leur bonheur et celui du joueur, et fait dépenser de l'argent dans les commerces des autres joueurs.
- Négliger sa famille (ne pas nourrir, pas de temps passé) → disputes, puis divorce possible.
- **Animaux de compagnie** à nourrir.

## 8. Événements automatiques et aléatoires

Un moteur d'événements adapté au profil du joueur :

- Riche avec plusieurs biens → frais d'entretien, dégât des eaux.
- Parent → rentrée scolaire.
- Âge avancé → bilans de santé.
- Commerce dans une ville peu sûre → cambriolage par un bot (protection : alarme, assurance).
- Événements de ville **fictifs ou positifs** : fête de quartier, match, ouverture d'une ligne, panne, grève.

**Interdit** : utiliser des faits divers réels (attentats, meurtres, etc.).

## 9. Économie

### Deux monnaies

- **Monnaie du jeu** (« euros »), gagnée **uniquement en jouant**. Pas de reproduction de vrais billets en euros : pièces et billets stylisés.
- **Monnaie premium** (nom différent, à définir), achetée en argent réel via Stripe. Sert aux **cosmétiques** (tenues rares, voitures exclusives, déco) et peut servir à **acheter une maison** (pour rattraper ses amis).
- **Interdit en premium** : commerces, parcelles, compagnies de transport, parts de grosses structures. Ceux-ci s'obtiennent **seulement en jouant**, pour garder un classement juste.
- Les ventes entre joueurs se font **uniquement en monnaie du jeu** (pas de revente contre de l'argent réel).

### Sorties d'argent (pour éviter l'accumulation inutile)

- Charges qui augmentent avec la richesse : loyers, salaires, entretien, impôts plus élevés sur les gros patrimoines.
- Amélioration des commerces : agrandir, rénover, décorer.
- Usure : voitures et commerces à entretenir.
- **Projets collectifs de ville** financés par les joueurs (parc, stade, gare) pour faire monter la ville au classement.
- **Objets de prestige limités** mis aux enchères (villa unique, voiture en série limitée).
- Catalogue d'achats : vêtements, voitures, maisons, déco.

## 10. Commerces

### Échelle des commerces (valeurs de départ à ajuster)

| Niveau | Exemples | Prix d'achat | Revenu brut / jour réel | Retour sur investissement |
|---|---|---|---|---|
| 1. Petits | coffee shop, laverie, salon de coiffure / barbier, boulangerie, snack, kebab, boutique de vêtements | 15 000 – 20 000 € | quelques centaines € | 2 à 3 semaines |
| 2. Moyens | restaurant, pizzeria, garage, station-service, salle de sport, société de taxis | 50 000 – 100 000 € | 1 000 – 2 000 € | quelques semaines |
| 3. Grosses affaires | hôtel, supermarché, concession automobile | 250 000 – 500 000 € | 5 000 – 10 000 € | plusieurs mois |
| 4. Prestige | concessionnaire de luxe, centre commercial, tram/métro/RER, aéroport du Bourget | 1 000 000 € + | très élevé | long terme, souvent en parts |

Plus un commerce est cher, plus il rapporte, mais plus il a de charges (salaires, entretien).

### Liste des commerces à prévoir

- Alimentation : boulangerie, coffee shop, snack, kebab, fast-food, pizzeria, restaurant, supérette, boucherie, primeur, supermarché.
- Services : laverie, pressing, salon de coiffure, barbier, garage, station-service et bornes de recharge, auto-école.
- Mode : boutique de vêtements, baskets.
- Loisirs : salle de sport, cinéma, salle de jeux, foot en salle, bar à chicha.
- Enfants : crèche, magasin de jouets.
- Hébergement : hôtel.
- Automobile : concession, concessionnaire de luxe.

### Commerces tenus par des bots uniquement

- **Médecins et pharmacies** (pas de métier de joueur, jugé peu amusant) : services pour la santé des persos.
- **Agence immobilière** (une par ville, gérée par un bot) : lieu central où l'on voit tout ce qui est à vendre ou à louer (logements, locaux, commerces de bots), avec prix, chiffre d'affaires et emplacement. Le prix est fixé selon ce que rapporte le bien.
- **Commissariat** (voir section 14).
- Pas de prison.

### Règles de fonctionnement

- Au lancement, les villes sont **déjà remplies de commerces et logements tenus par des bots**, pour qu'elles paraissent vivantes. Un joueur peut **racheter un commerce de bot via l'agence immobilière** (plus cher, mais déjà rentable), ou prendre un **local vide** (moins cher, tout à construire).
- **Clients bots** : ils fréquentent les commerces. Le chiffre d'affaires dépend de l'**emplacement** (centre-ville = loyer cher mais beaucoup de clients ; excentré = loyer bas mais peu de clients), de la ville, de l'attractivité, de la propreté et de la sécurité.
- **Commerces complémentaires** : un garage booste un lavage auto, une boulangerie booste un coffee shop, etc. → incite les joueurs à s'installer côte à côte.
- Les locaux libres affichent le **nombre de clients attendus**.
- **Limites par ville** pour les commerces rares (ex. 2 pharmacies, 2 médecins) ; concurrence libre pour les commerces de base.
- **Gestion connectée** : le perso est dans sa boutique, avec un écran de gestion (commandes, stock, prix, employés) et des petites actions qui boostent (accueillir un client, lancer une promo).
- **Hors ligne** : le commerce tourne avec le personnel embauché, mais un peu moins bien.
- **Livreurs bots** visibles qui circulent dans la ville (ex. scooters de la pizzeria). Plus de livreurs = plus de commandes, mais plus de salaires et de carburant.
- Avoir travaillé dans un métier donne un **bonus de qualité** quand on ouvre ce type de commerce.

### Inactivité

- Après **7 jours** sans connexion : le commerce perd progressivement des clients et le joueur reçoit un **mail d'alerte**.
- Après **30 jours** : le commerce est mis en vente, une partie de sa valeur est reversée au joueur.
- **Mode vacances** pour s'absenter sans tout perdre.

## 11. Grosses structures en parts

- Les très grosses affaires (compagnie de transport, aéroport du Bourget, centre commercial) sont découpées en **parts** (ex. 100 parts).
- Chaque actionnaire touche chaque jour une part des bénéfices selon son pourcentage.
- Le **plus gros actionnaire** est le patron et prend les décisions.
- Permet à un joueur moyen d'investir dans ces projets.

## 12. Immobilier et parcelles

- Des **emplacements vides** sont laissés dans chaque ville au départ.
- **Parcelles de terrain** achetables par le **premier arrivé**, limitées à **2 par joueur et par ville**.
- Sur une parcelle : construire ce que l'on veut, avec des travaux de quelques jours réels.
- Possibilité de construire un **immeuble mixte** : local commercial en bas, logements au-dessus → revenus du commerce + **loyers** (locataires bots ou joueurs). Loyer selon le quartier et l'état de l'immeuble. Plus c'est grand, plus c'est cher, long et coûteux à entretenir.
- **Logement du joueur** : appart de départ, puis plus bel appart ou maison selon ses revenus (signe de réussite, fait monter le bonheur, mais loyer plus lourd).
- **Déménagement** possible via l'agence immobilière, au maximum **une fois toutes les deux semaines**. Les commerces dans l'ancienne ville restent au joueur. La ville de rattachement (vote, mandat de maire) est celle où il habite.
- Petit **bonus** quand on dépense dans sa propre ville (réduction ou bonheur).

## 13. Villes et carte

- Démarrage avec **quelques villes** du 93 visibles sur la carte (pour le prototype : une seule ville).
- **Déblocage progressif** selon le nombre de joueurs (ex. nouvelle ville à 200 joueurs, une autre à 300, etc.), puis ouverture d'**autres départements**. Chaque ouverture est un événement ; loyers bas pour les premiers arrivés.
- Chaque ville a sa propre valeur : **loyers et pouvoir d'achat des clients différents**, basés sur des données réelles de loyers (pas sur la réputation). Ex. Sevran moins cher que Montreuil ou Le Pré-Saint-Gervais.
- La valeur d'une ville **évolue** avec les investissements des joueurs.
- Les villes sont **découpées en quartiers dès le départ** (ex. Montreuil Centre, Croix-de-Chavaux), même si le passage est invisible au début, pour répartir la charge serveur si la ville grossit.
- Pas de limite stricte de joueurs par ville : la rareté des logements et des locaux régule naturellement.
- Villes délaissées : bonus temporaires (ex. « terrains à moitié prix cette semaine »).

### Population de bots

- Base : environ **200 bots par ville**.
- Croissance : environ **+10 bots par joueur actif**, **+5 par commerce**, + apparts construits, le tout **multiplié par l'attractivité** (propreté, sécurité).
- Si la ville est sale ou désertée, les bots déménagent progressivement : une ville peut décliner.
- **Plafond par ville** pour tenir la charge serveur.

## 14. Maire, élections et gestion de la ville

- Le maire est **élu par les joueurs habitants** de la ville (pas le plus riche ni le plus gros investisseur).
- **Mandat de 4 semaines réelles**.
- Vote réservé aux joueurs **actifs dans la ville depuis au moins une semaine** (anti-triche, faux comptes).
- Pouvoirs du maire :
  - Fixer les **taxes locales** et le **salaire minimum**.
  - Lancer les **grands projets** (stade, gare, parc).
  - Organiser des **événements** (fête de quartier, etc.).
  - Attirer des joueurs (loyers réduits).
  - **Sécurité** : budget du commissariat, nombre de patrouilles de police (bots visibles à pied ou en voiture), caméras, éclairage.
  - **Propreté** de la ville.
- Jauges de ville : **propreté** et **insécurité**. L'insécurité se manifeste par des incivilités, vols ou tags par des bots, et fait fuir les clients. Pas de drogue dans le jeu.
- Bilan visible dans la rue avant les élections.

## 15. Compétition entre villes

- Fiche de chaque ville avec des chiffres en direct : joueurs habitants, bots, commerces, richesse totale, bonheur moyen, attractivité, propreté, sécurité.
- **Classement hebdomadaire** ; la ville gagnante obtient un bonus la semaine suivante (clients bots en plus, loyers réduits).
- **Club de foot par ville**, avec des **équipes de bots** (les joueurs ne jouent pas les matchs) :
  - Championnat hebdomadaire entre les villes, matchs **simulés par le serveur** selon le budget et le niveau du club, résumé et score affichés.
  - Les joueurs peuvent **investir** dans le club, le **sponsoriser** avec leur commerce, en devenir **président**.
  - Jours de match : les bars et snacks vendent plus ; une victoire fait monter le bonheur des habitants.

## 16. Métiers salariés

- On peut être **salarié** au lieu d'être indépendant (revenu stable, peu de risque) ; beaucoup commenceront salariés pour économiser avant de se lancer.
- On peut travailler **pour un bot ou pour un autre joueur**, qui fixe le salaire (au-dessus du salaire minimum).
- **Mini-missions** par métier, en sessions (ex. 15 minutes réelles), payées selon la performance :
  - Livreur : récupérer et livrer à temps, pourboire si rapide.
  - Serveur / barista : prendre et servir les commandes dans le bon ordre.
  - Coiffeur / barbier : reproduire la coupe demandée (petit jeu rapide).
  - Mécanicien : trouver la panne et réparer.
  - Chauffeur VTC / taxi : aller chercher les clients et les déposer.
- **Niveaux et expérience** par métier (ex. commis → chef pizzaïolo), avec hausse de salaire.
- **Tableau d'offres d'emploi** dans chaque ville.
- Absent à son service → le patron peut **licencier**.

## 17. Déplacements et véhicules

- **Entre villes** : on dézoome la carte du 93 et on clique sur une ville pour s'y **téléporter instantanément** (façon Habbo). Pas de transport payant ni long.
- **Dans la ville** : déplacement à pied ou en voiture (plus rapide). Les véhicules roulent sur le réseau de rues (**pathfinding A***), sprites en 4 ou 8 directions.
- **Véhicules limités** : 4-5 modèles (citadine, berline, SUV, utilitaire, scooter) + **2 modèles extra rares** en quantité limitée sur le serveur (sportive, luxe). Personnalisation : couleur et jantes.
- Utilité des véhicules : métiers (VTC, taxi, livreur), rapidité en ville, image et réputation (attire des clients), bonheur, livraisons.
- **Carburant / recharge** : sans carburant ou batterie, le véhicule ne roule plus. Thermique moins cher à l'achat, plus cher à l'usage ; électrique l'inverse.
- **Transports en commun** : bus, tram, métro, RER, taxis, VTC, exploitables par des joueurs et utilisés par les **bots**. Revenus à chaque trajet de bot ; plus la ville a de commerces, plus il y a de passagers. Progression : chauffeur VTC → société de taxis → tram / métro / RER (en parts, couvrant plusieurs villes). Compagnie de transport rare : une par ville.
- Pas de stationnement payant (mis de côté).

## 18. Multijoueur et social

- Les joueurs se croisent dans les villes.
- Liens entre joueurs : patron / employé, voisins de commerce, actionnaires communs, élections, club de foot.
- **Pas de vol ni d'agression entre joueurs.**
- **Chat** entre joueurs, avec :
  - Filtre d'insultes.
  - Boutons **signaler** et **bloquer**.
  - Outils de modération pour l'administrateur.

## 19. Rétention (faire revenir chaque jour)

- Le monde tourne hors ligne : faim, loyer, commerce, employés.
- Obligations quotidiennes : service de travail, enfants, approvisionnement.
- Dépendance entre joueurs : salaires, employés, actionnaires.
- Événements du jour et saisonniers (fêtes, Ramadan, Noël, objets à durée limitée).
- Progression longue : appart → maison ; commerce → chaîne → grosses structures → maire.
- Statut visible : classements des plus riches, du commerce le plus fréquenté, de la ville la plus attractive.
- Concours avec lots réels possibles (ex. meilleur commerçant de la saison).

## 20. Feuille de route proposée

1. **Prototype** : une ville en isométrique, déplacement du personnage, création de personnage, jauges de base, un appartement de départ.
2. **Économie de base** : monnaie du jeu, catalogue, 3-4 commerces de niveau 1, clients bots, agence immobilière bot, simulation serveur.
3. **Multijoueur** : comptes, plusieurs joueurs dans la même ville, achats concurrents sécurisés, chat modéré.
4. **Métiers et emploi** : mini-missions, salaires, offres d'emploi.
5. **Villes multiples** : carte du 93, téléportation, déblocage, classements.
6. **Maire et élections**, propreté, sécurité, commissariat.
7. **Parcelles, immeubles, parts de grosses structures, transports.**
8. **Famille, vieillissement, événements aléatoires, club de foot.**
9. **Monnaie premium** (Stripe) et pages légales.

## 21. Obligations légales (France / UE)

- **Mentions légales** (éditeur, contact, hébergeur).
- **CGU** à accepter par case à cocher (règles du jeu et du chat, sanctions, bannissement).
- **Politique de confidentialité** conforme au **RGPD** (données collectées, finalités, durée, droits d'accès et de suppression) ; conservation des données de connexion selon la loi française.
- **Bandeau cookies** conforme CNIL.
- **Âge** : accord parental pour les moins de 15 ans ; protection renforcée ou restriction du chat pour les mineurs.
- **DSA** : traitement rapide des signalements de contenus illégaux.
- **Conditions générales de vente** pour la monnaie premium, avec droit de rétractation de 14 jours (et renonciation pour un achat utilisé immédiatement).
- Faire relire les textes finaux par un avocat ou partir de modèles validés.

## 22. Hors périmètre (décisions prises)

- Pas de prêts bancaires ni d'associations au démarrage (trop compliqué).
- Pas de mariage entre vrais joueurs.
- Pas de vol / agression entre joueurs, pas de prison.
- Pas de drogue.
- Pas de faits divers réels.
- Pas de matchs de foot joués par les joueurs.
- Pas de stationnement payant.
- Pas de transports payants pour les joueurs entre villes.
- Pas de revente de biens contre de l'argent réel.
- Pas de stores Apple / Google pour l'instant.

## 23. Questions encore ouvertes

- Nom du jeu et nom de domaine (vérifier aussi la marque à l'INPI).
- Nom de la monnaie premium.
- Hébergeur.
- Âge minimum des joueurs.
- Villes du 93 ouvertes au lancement.
- Éditeur légal du jeu (personne physique ou société).
