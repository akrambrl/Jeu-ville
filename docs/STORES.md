# Sortir Bac Bataille sur l'App Store et Google Play

Ce guide liste ce qui est **déjà prêt dans le code**, ce qui **reste à faire de
ton côté**, et contient les **textes des fiches** et les **réponses aux
questionnaires** des stores.

Hébergement **100 % gratuit** : le jeu web et la page légale sur **GitHub
Pages**, le jeu en ligne sur **Supabase Realtime** (offre gratuite). Il n'y a
**ni serveur à nous, ni base de données, ni compte** : le téléphone de l'hôte
arbitre chaque table, et si l'hôte part, un autre joueur reprend la partie.

---

## 1. Déjà prêt dans le code

| Exigence | Où |
| --- | --- |
| Appli native Android et iOS (Capacitor 8) | `apps/client/android`, `apps/client/ios`, `apps/client/capacitor.config.ts` |
| Icône et écran de démarrage, toutes tailles | sources dans `apps/client/assets/`, régénérer : `pnpm --filter @jeu-ville/client app:icons` |
| Jeu en portrait, iPhone uniquement (pas de captures iPad à fournir) | `AndroidManifest.xml`, `Info.plist`, projet Xcode |
| Fonctionne hors ligne en solo, polices embarquées | `src/ui/fonts.ts` (aucun appel à Google Fonts) |
| Vibrations natives (iPhone compris), barre d'état, bouton retour Android | `src/native.ts` |
| Jeu en ligne sans serveur (Supabase Realtime) : partie rapide, tables entre amis, reprise si l'hôte part | `packages/shared/src/online/`, `src/net/transports.ts` |
| Aucun compte, aucune donnée stockée sur un serveur ; effacement des données de l'appareil | Réglages ⚙️ → « Effacer mes données de cet appareil » |
| Politique de confidentialité, mentions légales, conditions d'utilisation | dans l'appli (Réglages) et sur la page web **`legal.html`** |
| Pseudos filtrés (insultes, haine) | `packages/shared/src/config/moderation.ts` |
| Publication automatique du jeu web | `.github/workflows/pages.yml` (GitHub Pages) |
| Captures d'écran et bannière | `docs/store/ios/` (1290×2796), `docs/store/android/` (1080×1920, bannière 1024×500, icône 512×512) |
| Export : seulement du chiffrement standard (pas de question à chaque envoi Apple) | `ITSAppUsesNonExemptEncryption = false` dans `Info.plist` |

Sans pseudo enregistré ni compte, **la suppression de compte exigée par
Apple et Google ne s'applique pas** : il n'y a rien à supprimer côté serveur.

---

## 2. À faire de ton côté

### 2.1 Avant tout

1. **Compléter les textes légaux** : renseigner `LEGAL_INFO` en haut de
   `apps/client/src/legal/texts.ts` (éditeur, adresse, e-mail, hébergeurs, date).
   Si tu publies en ton nom, mets « Particulier » pour la forme juridique.
2. **Choisir l'identifiant définitif de l'appli** (impossible à changer ensuite) :
   `appId` dans `apps/client/capacitor.config.ts`, actuellement
   `fr.bacbataille.app`. Si tu le changes : `npx cap sync`, puis mets à jour
   l'identifiant dans Android Studio (`applicationId`) et Xcode (Bundle Identifier).
3. **Vérifier le nom** « Bac Bataille » : [data.inpi.fr](https://data.inpi.fr) et les deux stores.
4. **Créer une adresse e-mail de support** (demandée par les deux stores).

### 2.2 Le jeu en ligne : un projet Supabase gratuit

1. Sur [supabase.com](https://supabase.com), crée un **nouveau projet** (tu peux
   utiliser ton compte de GOAT FC), région **Europe (Frankfurt)**.
2. *Project Settings → API* : copie l'**URL du projet** et la clé **`anon` public**.
3. *Realtime → Settings* : laisse **l'accès public aux canaux** activé (le jeu
   n'utilise que le temps réel : aucune table, rien à configurer dans la base).
4. Crée `apps/client/.env.local` (jamais commité) à partir de `.env.example` :
   `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`.

La clé `anon` est publique par nature (elle est dans l'appli) : comme le jeu
ne stocke rien chez Supabase, elle ne donne accès à aucune donnée.

**Limites de l'offre gratuite** (à vérifier sur le site de Supabase) : environ
200 connexions simultanées et 2 millions de messages par mois — de l'ordre de
plusieurs centaines de parties par mois. **Un projet gratuit est mis en pause
après une semaine sans activité** : si personne ne joue en ligne pendant une
semaine, réactive-le depuis le tableau de bord (le mode solo, lui, marche
toujours).

### 2.3 Le jeu web gratuit sur GitHub Pages

Déjà en ligne : **`https://akrambrl.github.io/Jeu-ville/`** (servi depuis la
branche `gh-pages`), et la page légale à
**`https://akrambrl.github.io/Jeu-ville/legal.html`** (l'adresse à donner aux stores).

- Mise à jour automatique : à chaque envoi sur la branche du jeu (ou `main`),
  le workflow `.github/workflows/pages.yml` recompile et republie le site.
- Pour activer le jeu en ligne sur ce lien : *Settings → Secrets and variables
  → Actions → Variables* → ajoute `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
- Sur iPhone : ouvrir le lien dans Safari → Partager → « Sur l'écran
  d'accueil » : le jeu s'installe avec son icône et s'ouvre en plein écran.

### 2.4 Compiler l'appli

Avec `apps/client/.env.local` rempli (voir 2.2) :

```bash
cd apps/client
pnpm build:app          # compile le jeu et le copie dans les projets Android et iOS
```

**Android** (n'importe quel ordinateur, avec [Android Studio](https://developer.android.com/studio)) :

1. `npx cap open android` (ou ouvrir `apps/client/android` dans Android Studio).
2. Dans `android/app/build.gradle` : `versionCode` (1, 2, 3… à chaque envoi) et
   `versionName` (« 1.0.0 »).
3. *Build → Generate Signed App Bundle* → créer une **clé de signature**
   (fichier `.jks`). **Garde-la précieusement, avec son mot de passe, hors du
   dépôt Git** (ou active la signature par Google Play, conseillée).
4. Récupérer le fichier `.aab` (release) à envoyer sur Google Play.

**iOS** (il faut **un Mac** avec [Xcode](https://developer.apple.com/xcode/), ou un service de build en ligne comme Codemagic) :

1. `npx cap open ios` (ou ouvrir `apps/client/ios/App/App.xcodeproj`).
2. *Signing & Capabilities* : choisir ton équipe (compte développeur Apple),
   vérifier le Bundle Identifier.
3. *General* : Version « 1.0.0 », Build 1 (à augmenter à chaque envoi).
4. *Product → Archive*, puis *Distribute App → App Store Connect*.
5. Tester avec **TestFlight** avant de soumettre.

### 2.5 Comptes développeur

| | Google Play | App Store |
| --- | --- | --- |
| Inscription | [play.google.com/console](https://play.google.com/console) — 25 $ une fois | [developer.apple.com](https://developer.apple.com/programs/) — 99 $/an |
| Vérification | pièce d'identité, et adresse publiée sur la fiche | identité (ou numéro D-U-N-S pour une société) |
| Test obligatoire | **compte personnel récent : 12 testeurs inscrits pendant 14 jours d'affilée** (test fermé) avant de pouvoir publier | aucun (TestFlight conseillé) |

### 2.6 Avant d'envoyer : tester sur de vrais téléphones

- un petit Android (écran ~5,5"), un récent, un iPhone SE et un iPhone récent ;
- partie solo complète ; partie rapide à 2 téléphones ; table entre amis (code) ;
- l'hôte quitte la table (ou coupe son réseau) en pleine partie : un autre
  joueur doit reprendre en quelques secondes ;
- clavier pendant un duel, bouton retour Android, son coupé/remis ;
- Réglages → effacer les données.

---

## 3. Fiche du store (textes prêts à copier)

**Nom** : Bac Bataille
**Sous-titre Apple (30 car. max)** : Le petit bac en cartes
**Description courte Google (80 car. max)** : Le petit bac en cartes : trouve un mot plus vite que tes adversaires !
**Catégorie** : Jeux → Mots (secondaire : Cartes)
**Mots-clés Apple (100 car. max)** : petit bac,baccalauréat,mots,cartes,bataille,lettre,catégories,quiz,famille,amis,duel

**Description longue** :

> Le petit bac rencontre la bataille ! 🃏
>
> Une lettre est tirée au hasard, tout le monde retourne sa carte en même temps…
> Ta carte a une catégorie en commun avec celle d'un adversaire ? C'est le DUEL !
> Trouve le premier un prénom, un pays, un animal, une marque, un métier… qui
> commence par la bonne lettre. Le plus rapide se débarrasse de ses cartes, le
> perdant ramasse tout. Le premier qui vide son paquet gagne !
>
> ⚡ Des parties rapides et pleines de rebondissements
> 🤖 En solo contre 1 à 5 bots, même sans connexion
> 🌍 En ligne contre de vrais joueurs
> 🔒 Entre amis : crée une table et partage son code
> 🎨 12 catégories : prénoms, pays et villes, animaux, célébrités, marques,
> sports, métiers, fruits et légumes, plats, vêtements, objets, parties du corps
> ✅ Des milliers de mots reconnus, accents et pluriels compris
>
> Sans pub, sans achat, sans inscription.

**Visuels** :
- iPhone 6,7"/6,9" : `docs/store/ios/1.png` à `5.png` (1290×2796)
- Google Play téléphone : `docs/store/android/1.png` à `5.png` (1080×1920)
- Bannière Google Play : `docs/store/android/feature-graphic.png` (1024×500)
- Icône 512×512 (Google) : `docs/store/android/icon-512.png`

**Liens** : politique de confidentialité = `https://akrambrl.github.io/Jeu-ville/legal.html#confidentialite`,
e-mail de support, site (facultatif).

---

---

## 4. Réponses aux questionnaires

### Classification par âge
- **Apple** : aucune violence, aucun contenu sexuel, pas de langage grossier
  (pseudos filtrés), pas de jeux d'argent, pas de navigation web libre, pas de
  messagerie ; seul contenu venant des joueurs : le pseudo (filtré) → **4+**.
- **Google (IARC)** : catégorie « Jeu » ; violence : non ; langage : non ;
  interactions entre utilisateurs : **oui, limitées** (pseudos visibles, pas de
  chat) ; partage de position : non ; achats : non → attendu **PEGI 3**.
- **Public cible Google** : 13 ans et plus (viser les enfants ajoute les
  contraintes de la politique « Familles »).

### Confidentialité Apple (« App Privacy »)
**« Aucune donnée collectée »** : Apple ne compte comme « collectées » que les
données conservées au-delà du traitement en temps réel. Ici le pseudo et les
réponses ne font que transiter entre les joueurs d'une table, sans être
enregistrés. Pas de suivi publicitaire (pas de demande ATT).

### Sécurité des données Google (« Data safety »)
- Le pseudo transite vers les autres joueurs **sans être conservé** (traitement
  éphémère) : tu peux déclarer **aucune donnée collectée ni partagée**.
  Variante prudente : déclarer *Informations personnelles → Nom d'utilisateur*,
  collecté, **traité de façon éphémère**, non partagé, facultatif, finalité
  *Fonctionnement de l'appli*.
- Chiffrées en transit : **oui**. Suppression : **sans objet** (rien n'est
  conservé ; « Effacer mes données de cet appareil » dans les Réglages).

### Autres déclarations
- **Publicité** : non. **Achats intégrés** : non.
- **Accès pour la vérification** : aucun compte nécessaire (le mode solo marche
  tout de suite ; pour le mode en ligne, une table entre amis à 2 téléphones).
- **Export (Apple)** : déjà réglé (chiffrement standard uniquement).

---

## 5. Et ensuite

- Mises à jour : changer `versionCode`/Build, `pnpm build:app`, renvoyer.
- Si le jeu en ligne grossit (au-delà de l'offre gratuite de Supabase, ou s'il
  faut empêcher la triche en partie rapide), on pourra revenir à un serveur qui
  arbitre les tables (plan payant).
- Si tu ajoutes un jour des achats : ils devront passer par les paiements
  d'Apple et de Google. Une messagerie entre joueurs imposerait signalement,
  blocage et modération.
