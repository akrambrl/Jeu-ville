# Sortir Bac Bataille sur l'App Store et Google Play

Ce guide liste ce qui est **déjà prêt dans le code**, ce qui **reste à faire de
ton côté** (comptes, paiements, signature, envoi), et contient les **textes des
fiches** et les **réponses aux questionnaires** des stores.

---

## 1. Déjà prêt dans le code

| Exigence | Où |
| --- | --- |
| Appli native Android et iOS (Capacitor 8) | `apps/client/android`, `apps/client/ios`, `apps/client/capacitor.config.ts` |
| Icône et écran de démarrage, toutes tailles | sources dans `apps/client/assets/`, régénérer : `pnpm --filter @jeu-ville/client app:icons` |
| Jeu en portrait, iPhone uniquement (pas de captures iPad à fournir) | `AndroidManifest.xml`, `Info.plist`, projet Xcode |
| Fonctionne hors ligne en solo, polices embarquées | `src/ui/fonts.ts` (aucun appel à Google Fonts) |
| Vibrations natives (iPhone compris), barre d'état, bouton retour Android | `src/native.ts` |
| Suppression du compte depuis l'appli (exigée par Apple et Google) | Réglages ⚙️ → « Supprimer mon compte en ligne » (`DELETE /api/me`) |
| Effacement des données de l'appareil | Réglages → « Effacer les données de cet appareil » |
| Politique de confidentialité, mentions légales, conditions d'utilisation | dans l'appli (Réglages) et sur la page web **`/legal.html`** |
| Pseudos filtrés (insultes, haine) | `packages/shared/src/config/moderation.ts` |
| Reconnexion automatique, tables entre amis avec code | voir `docs/GAME_DESIGN.md` |
| Rapports de plantage anonymes | `POST /api/errors`, visibles dans les journaux du serveur |
| Captures d'écran et bannière | `docs/store/ios/` (1290×2796), `docs/store/android/` (1080×1920 + bannière 1024×500) |
| Export : seulement du HTTPS standard (pas de question à chaque envoi Apple) | `ITSAppUsesNonExemptEncryption = false` dans `Info.plist` |

---

## 2. À faire de ton côté

### 2.1 Avant tout

1. **Compléter les textes légaux** : renseigner `LEGAL_INFO` en haut de
   `apps/client/src/legal/texts.ts` (éditeur, adresse, e-mail, hébergeur, date).
   Si tu publies en ton nom, mets « Particulier » pour la forme juridique (les
   stores afficheront ton nom et, pour Google, ton adresse).
2. **Choisir l'identifiant définitif de l'appli** (impossible à changer ensuite) :
   `appId` dans `apps/client/capacitor.config.ts`, actuellement
   `fr.bacbataille.app`. Idéalement un domaine que tu possèdes, à l'envers.
   Si tu le changes : `npx cap sync`, puis mets à jour l'identifiant dans
   Android Studio (`applicationId`) et Xcode (Bundle Identifier).
3. **Vérifier le nom** « Bac Bataille » : recherche sur
   [data.inpi.fr](https://data.inpi.fr) (marques) et dans les deux stores.
4. **Créer une adresse e-mail de support** (demandée par les deux stores).

### 2.2 Mettre le serveur en ligne pour de bon

L'offre gratuite de Render s'endort après 15 min et sa base expire au bout de
30 jours : prends un **plan payant** (service web « Starter » + base « Basic »,
environ 15 à 25 $/mois), ou tout hébergeur Node.js + PostgreSQL en Europe.

- Variables d'environnement : `DATABASE_URL`, `PORT`, `CLIENT_DIST=../client/dist`,
  et `CLIENT_ORIGIN` = l'adresse publique du jeu web (plusieurs adresses
  possibles, séparées par des virgules). L'appli native est déjà autorisée.
- `render.yaml` est prêt (pense à le pointer vers la branche à déployer et à
  passer `plan: free` en plan payant).
- Une fois en ligne, l'adresse de la page légale à donner aux stores est
  **`https://<ton-serveur>/legal.html`**.

### 2.3 Compiler l'appli

Toujours avec l'adresse du serveur, sinon l'appli ne propose que le mode solo :

```bash
cd apps/client
VITE_SERVER_URL=https://<ton-serveur> VITE_APP_VERSION=1.0.0 pnpm build:app
```

**Android** (n'importe quel ordinateur, avec [Android Studio](https://developer.android.com/studio)) :

1. `npx cap open android` (ou ouvrir `apps/client/android` dans Android Studio).
2. Dans `android/app/build.gradle` : `versionCode` (1, 2, 3… à chaque envoi) et
   `versionName` (« 1.0.0 »).
3. *Build → Generate Signed App Bundle* → créer une **clé de signature**
   (fichier `.jks`). **Garde-la précieusement, avec son mot de passe, hors du
   dépôt Git** : sans elle, plus de mise à jour possible (ou active la signature
   par Google Play, conseillée).
4. Récupérer le fichier `.aab` (release) à envoyer sur Google Play.

**iOS** (il faut **un Mac** avec [Xcode](https://developer.apple.com/xcode/), ou un service de build en ligne comme Ionic Appflow / Codemagic) :

1. `npx cap open ios` (ou ouvrir `apps/client/ios/App/App.xcodeproj`).
2. *Signing & Capabilities* : choisir ton équipe (compte développeur Apple),
   vérifier le Bundle Identifier.
3. *General* : Version « 1.0.0 », Build 1 (à augmenter à chaque envoi).
4. *Product → Archive*, puis *Distribute App → App Store Connect*.
5. Tester avec **TestFlight** avant de soumettre.

### 2.4 Comptes développeur

| | Google Play | App Store |
| --- | --- | --- |
| Inscription | [play.google.com/console](https://play.google.com/console) — 25 $ une fois | [developer.apple.com](https://developer.apple.com/programs/) — 99 $/an |
| Vérification | pièce d'identité, et adresse publiée sur la fiche | identité (ou numéro D-U-N-S pour une société) |
| Test obligatoire | **compte personnel récent : 12 testeurs inscrits pendant 14 jours d'affilée** (test fermé) avant de pouvoir publier | aucun (TestFlight conseillé) |

Pour les 12 testeurs Google : crée un **test fermé**, ajoute leurs adresses
Gmail, envoie-leur le lien d'inscription, et attends 14 jours.

### 2.5 Avant d'envoyer : tester sur de vrais téléphones

- un petit Android (écran ~5,5"), un récent, un iPhone SE et un iPhone récent ;
- partie solo complète, partie en ligne à 2 téléphones, table entre amis
  (code), coupure du Wi-Fi en pleine partie (reconnexion) ;
- clavier pendant un duel, bouton retour Android, son coupé/remis ;
- suppression du compte dans les Réglages.

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
> Sans pub, sans achat, sans inscription obligatoire.

**Visuels** :
- iPhone 6,7"/6,9" : `docs/store/ios/1.png` à `5.png` (1290×2796)
- Google Play téléphone : `docs/store/android/1.png` à `5.png` (1080×1920)
- Bannière Google Play : `docs/store/android/feature-graphic.png` (1024×500)
- Icône 512×512 (Google) : `docs/store/android/icon-512.png`

**Liens** : politique de confidentialité = `https://<ton-serveur>/legal.html#confidentialite`,
e-mail de support, site (facultatif).

---

## 4. Réponses aux questionnaires

### Classification par âge
- **Apple** (questionnaire d'âge) : aucune violence, aucun contenu sexuel, pas de
  langage grossier (pseudos filtrés), pas de jeux d'argent, pas de navigation web
  libre, **pas de contenu généré par les utilisateurs autre que le pseudo**
  (filtré), pas de messagerie → **4+**.
- **Google (IARC)** : catégorie « Jeu » ; violence : non ; langage : non ;
  interactions entre utilisateurs : **oui, mais limitées** (les pseudos sont
  visibles, pas de chat) ; partage de position : non ; achats : non →
  attendu **PEGI 3 / Tout public**.
- **Public cible Google** : 13 ans et plus (ou « tout âge » si tu veux viser les
  enfants : la politique « Familles » de Google ajoute alors des contraintes).

### Confidentialité Apple (« App Privacy »)
- **Identifiants → Nom d'utilisateur / ID utilisateur** : collecté (le pseudo),
  **lié à l'utilisateur**, **pas utilisé pour le suivi**, finalité :
  *Fonctionnalité de l'app*.
- **Diagnostics → Données de plantage** : collecté, **non lié à l'utilisateur**,
  pas de suivi, finalité : *Fonctionnalité de l'app*.
- Tout le reste : **non collecté**. Pas de suivi publicitaire (pas de demande ATT).

### Sécurité des données Google (« Data safety »)
- Données collectées : **Infos personnelles → Nom d'utilisateur** (pseudo) ;
  **Infos et performances de l'appli → Journaux de plantage**.
- Partagées avec des tiers : **non**. Chiffrées en transit : **oui** (HTTPS).
- Suppression possible : **oui**, depuis l'appli (Réglages), et par e-mail.
- Collecte obligatoire : non (le mode solo ne collecte rien).

### Autres déclarations
- **Publicité** : non. **Achats intégrés** : non.
- **Accès à l'appli pour la vérification** : aucun compte nécessaire (le mode
  solo marche tout de suite ; pour le mode en ligne, n'importe quel pseudo).
- **Export (Apple)** : déjà réglé (HTTPS standard uniquement).

---

## 5. Et ensuite

- Mises à jour : changer `versionCode`/Build, `pnpm build:app`, renvoyer.
- Si tu ajoutes un jour des achats (cosmétiques…) : ils devront passer par les
  paiements d'Apple et de Google (commission de 15 % sous 1 M$/an).
- Si tu ajoutes une messagerie entre joueurs : il faudra signalement, blocage
  et modération (exigés par les deux stores).
