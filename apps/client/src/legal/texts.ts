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
  /** Hébergeurs : le jeu web et le temps réel du jeu en ligne. */
  host: '[À COMPLÉTER : ex. jeu web : GitHub Pages (GitHub, Inc., 88 Colin P. Kelly Jr St, San Francisco, États-Unis) ; jeu en ligne : Supabase (Supabase, Inc.), projet hébergé dans l’Union européenne (Francfort)]',
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
          'Bac Bataille ne te demande aucun compte et n’enregistre aucune donnée te concernant sur un serveur. Pas de publicité, pas de traceur, pas de revente de données. Le mode solo (contre des bots) n’envoie rien sur internet.',
        ],
      },
      {
        heading: 'Responsable du traitement',
        paragraphs: [`${I.publisher}, ${I.address}. Contact : ${I.email}.`],
      },
      {
        heading: 'Ce qui reste sur ton téléphone',
        paragraphs: [
          'Ton pseudo, un identifiant de joueur tiré au hasard (pour te retrouver à ta table si le réseau saute) et tes réglages (son, nombre de bots, tutoriel vu) sont gardés dans le stockage de l’appli, sur ton téléphone uniquement.',
        ],
      },
      {
        heading: 'Jeu en ligne',
        paragraphs: [
          'Quand tu joues en ligne, ton pseudo et ton identifiant de joueur sont transmis en direct aux autres joueurs de ta table, ainsi que tes réponses pendant les duels, pour que la partie fonctionne. Ces échanges passent par le service temps réel de Supabase : ils ne sont pas enregistrés et disparaissent à la fin de la partie.',
          'Comme pour tout service sur internet, ton adresse IP est vue techniquement par les hébergeurs le temps de la connexion. Nous ne la conservons pas.',
        ],
      },
      {
        heading: 'Pourquoi',
        paragraphs: [
          'Ces échanges servent uniquement à te faire jouer en ligne (afficher ton pseudo à ta table, faire circuler la partie). Base légale : l’exécution du service que tu demandes (article 6.1.b du RGPD).',
        ],
      },
      {
        heading: 'Hébergement',
        paragraphs: [`${I.host}. Aucune donnée n’est vendue ni transmise à des tiers.`],
      },
      {
        heading: 'Tes droits',
        paragraphs: [
          'Tu peux tout effacer à tout moment depuis l’appli : Réglages → « Effacer mes données de cet appareil ». Comme rien n’est enregistré sur nos serveurs, il n’y a pas de compte à supprimer.',
          `Pour toute question sur tes données, écris-nous à ${I.email}. Si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL (www.cnil.fr).`,
        ],
      },
      {
        heading: 'Mineurs',
        paragraphs: [
          'Le jeu est tout public. Il n’y a pas de messagerie entre joueurs et les pseudos sont filtrés. Les moins de 15 ans doivent avoir l’accord d’un parent pour jouer en ligne (le mode solo ne transmet rien).',
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
          'Bac Bataille est un jeu de mots gratuit, jouable seul contre des bots ou en ligne contre d’autres joueurs, sans compte. Il est fourni « en l’état » ; nous faisons de notre mieux pour qu’il fonctionne, sans garantie de disponibilité permanente du jeu en ligne.',
        ],
      },
      {
        heading: 'Ton pseudo',
        paragraphs: [
          'Ton pseudo est visible des autres joueurs de ta table : il doit rester correct (pas d’insulte, de contenu haineux ou sexuel, ni d’usurpation d’identité). Les pseudos inappropriés sont remplacés par « Joueur ».',
        ],
      },
      {
        heading: 'Bonne conduite',
        paragraphs: [
          'Il est interdit de tricher (programme automatique, appli modifiée, exploitation de bug) ou de perturber le jeu des autres. En ligne, la partie est arbitrée par le téléphone d’un des joueurs : joue franc-jeu !',
        ],
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
