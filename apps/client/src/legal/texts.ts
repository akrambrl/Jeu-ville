/**
 * Textes légaux du jeu : politique de confidentialité, mentions légales et
 * conditions d'utilisation. Affichés dans l'appli (Réglages) et sur la page
 * web legal.html (adresse à donner aux stores).
 *
 * ⚠️ À COMPLÉTER avant la sortie : les informations de l'éditeur ci-dessous.
 * Ces textes sont des modèles de départ, pas un avis juridique.
 */

export const LEGAL_INFO = {
  /** Nom de l'éditeur (toi ou ta société). */
  publisher: '[À COMPLÉTER : nom de l’éditeur ou de la société]',
  /** Adresse postale de l'éditeur. */
  address: '[À COMPLÉTER : adresse]',
  /** Pour une société : forme, capital, RCS/SIREN. */
  company: '[À COMPLÉTER : forme juridique, SIREN — ou « Particulier »]',
  /** E-mail de contact (support et demandes RGPD). */
  email: '[À COMPLÉTER : e-mail de contact]',
  /** Directeur de la publication. */
  director: '[À COMPLÉTER : nom du directeur de la publication]',
  /** Hébergeur du serveur de jeu (nom, adresse, pays). */
  host: '[À COMPLÉTER : hébergeur, ex. Render Services, Inc. — serveurs à Francfort (UE)]',
  /** Date de dernière mise à jour des textes. */
  updated: '[À COMPLÉTER : date]',
} as const;

export interface LegalDoc {
  id: 'confidentialite' | 'mentions' | 'conditions';
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
}

const I = LEGAL_INFO;

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'confidentialite',
    title: 'Politique de confidentialité',
    sections: [
      {
        heading: 'En bref',
        paragraphs: [
          'Bac Bataille collecte le strict minimum : ton pseudo, pour jouer en ligne. Pas de publicité, pas de traceur, pas de revente de données. Le mode solo (contre des bots) n’envoie rien sur internet.',
        ],
      },
      {
        heading: 'Responsable du traitement',
        paragraphs: [`${I.publisher}, ${I.address}. Contact : ${I.email}.`],
      },
      {
        heading: 'Données collectées',
        paragraphs: [
          'Jeu en ligne : ton pseudo, un jeton de connexion (conservé chiffré sur nos serveurs), la date de création du compte et de dernière connexion. Les parties elles-mêmes (cartes, réponses) ne sont pas enregistrées : elles disparaissent à la fin de la partie.',
          'Sur ton appareil : ton pseudo, ton jeton de connexion et tes réglages (son, nombre de bots, tutoriel vu) sont gardés dans le stockage local de l’appli.',
          'Rapports d’erreurs : si le jeu plante, un rapport technique (message d’erreur, écran concerné, version) est envoyé à notre serveur pour corriger le bug. Il ne contient ni ton pseudo ni aucune donnée personnelle.',
        ],
      },
      {
        heading: 'Pourquoi',
        paragraphs: [
          'Ces données servent uniquement à te faire jouer en ligne (t’identifier à une table et afficher ton pseudo aux autres joueurs) et à corriger les bugs. Base légale : l’exécution du service que tu demandes (article 6.1.b du RGPD).',
        ],
      },
      {
        heading: 'Destinataires et hébergement',
        paragraphs: [
          `Les données sont hébergées chez ${I.host}. Elles ne sont ni vendues ni transmises à des tiers. Seuls les autres joueurs de ta table voient ton pseudo.`,
        ],
      },
      {
        heading: 'Durée de conservation',
        paragraphs: ['Ton compte est conservé tant que tu ne le supprimes pas. Les rapports d’erreurs sont conservés au plus 30 jours.'],
      },
      {
        heading: 'Tes droits',
        paragraphs: [
          'Tu peux supprimer ton compte à tout moment depuis l’appli : Réglages → « Supprimer mon compte en ligne ». Toutes tes données sont alors effacées de nos serveurs.',
          `Tu disposes aussi d’un droit d’accès, de rectification, d’opposition et de portabilité : écris-nous à ${I.email}. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (www.cnil.fr).`,
        ],
      },
      {
        heading: 'Mineurs',
        paragraphs: [
          'Le jeu est tout public. Il n’y a pas de messagerie entre joueurs et les pseudos sont filtrés. Les moins de 15 ans doivent avoir l’accord d’un parent pour créer un compte en ligne (le mode solo ne demande aucun compte).',
        ],
      },
      { heading: 'Mise à jour', paragraphs: [`Dernière mise à jour : ${I.updated}.`] },
    ],
  },
  {
    id: 'mentions',
    title: 'Mentions légales',
    sections: [
      { heading: 'Éditeur', paragraphs: [`${I.publisher} — ${I.company} — ${I.address} — ${I.email}`] },
      { heading: 'Directeur de la publication', paragraphs: [I.director] },
      { heading: 'Hébergement', paragraphs: [I.host] },
      {
        heading: 'Crédits',
        paragraphs: ['Polices : Lilita One et Nunito (SIL Open Font License). Sons et graphismes : créés pour le jeu.'],
      },
    ],
  },
  {
    id: 'conditions',
    title: 'Conditions d’utilisation',
    sections: [
      {
        heading: 'Le service',
        paragraphs: [
          'Bac Bataille est un jeu de cartes et de mots gratuit, jouable seul contre des bots ou en ligne contre d’autres joueurs. Il est fourni « en l’état » ; nous faisons de notre mieux pour qu’il fonctionne, sans garantie de disponibilité permanente du jeu en ligne.',
        ],
      },
      {
        heading: 'Ton compte et ton pseudo',
        paragraphs: [
          'Ton pseudo est visible des autres joueurs : il doit rester correct (pas d’insulte, de contenu haineux ou sexuel, ni d’usurpation d’identité). Nous pouvons supprimer un compte qui ne respecte pas ces règles.',
        ],
      },
      {
        heading: 'Bonne conduite',
        paragraphs: ['Il est interdit de tricher (programme automatique, exploitation de bug) ou de perturber le jeu des autres.'],
      },
      {
        heading: 'Propriété',
        paragraphs: [`Le jeu, son nom, ses textes et ses graphismes appartiennent à ${I.publisher}.`],
      },
      {
        heading: 'Droit applicable',
        paragraphs: ['Ces conditions sont soumises au droit français. Pour toute question : ' + I.email + '.'],
      },
    ],
  },
];
