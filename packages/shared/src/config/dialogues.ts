/**
 * Ce que disent les bots quand on leur parle (boîte de dialogue « à la Pokémon »).
 * Chaque conversation est une suite de répliques affichées l'une après l'autre.
 */

export const DIALOGUE = {
  /** Distance (cases) à laquelle on peut parler à quelqu'un. */
  talkRange: 3,
  /** Le bot s'arrête et regarde le joueur pendant ce temps (ms). */
  pauseMs: 10_000,
  /** Vitesse d'affichage du texte (caractères par seconde). */
  typeCharsPerSecond: 45,
  /** Heures (réelles, locales) où l'on considère qu'il fait nuit pour les répliques. */
  nightFromHour: 22,
  nightUntilHour: 6,
} as const;

export const BOT_FIRST_NAMES = {
  male: ['Karim', 'Mamadou', 'Lucas', 'Yanis', 'Thomas', 'Moussa', 'Kevin', 'Rayan', 'Julien', 'Samir', 'Hugo', 'Ibrahim', 'Nicolas', 'Adam', 'Bilal', 'Maxime'],
  female: ['Fatou', 'Inès', 'Léa', 'Sarah', 'Aïcha', 'Camille', 'Nadia', 'Emma', 'Yasmine', 'Chloé', 'Mariam', 'Julie', 'Sofia', 'Lina', 'Amandine', 'Kenza'],
} as const;

export type DialogueContext = 'street' | 'boulevard' | 'dog' | 'night' | 'corn' | 'chestnut';

export const BOT_DIALOGUES: Record<DialogueContext, string[][]> = {
  street: [
    ["Salut ! Il fait bon aujourd'hui, hein ?", 'Moi je vais faire un tour au square, ça détend.'],
    ['Tu es nouveau dans le quartier ?', "Passe à l'agence pour l'emploi : ils cherchent toujours des livreurs et des serveurs."],
    ['Pense à manger un morceau de temps en temps.', "Ta faim baisse même quand tu n'es pas connecté !"],
    ['Le bus coûte 2 €…', "… mais qu'est-ce que ça fait gagner du temps !"],
    ['Tu connais le boulevard de la République ?', "C'est là que ça bouge : boucheries, kebabs, cafés… Il y a toujours du monde."],
    ['Avec un vélo, tu irais deux fois plus vite.', 'Le magasin de cycles en vend. Regarde dans « Aller à… ».'],
    ["Si tu as des économies, l'agence immobilière loue des locaux commerciaux.", 'Ouvrir son commerce, ça rapporte tous les jours !'],
    ['Une douche, des habits propres…', "Les patrons n'embauchent que les gens présentables !"],
    ['Je suis pressé, je vais rater mon RER !'],
    ['Bonne journée à toi !'],
    ['Tu as essayé la boulangerie près de la mairie ?', 'Leurs croissants sont incroyables.'],
    ['Le marché, le matin, il y a de ces odeurs…', 'Mon conseil : viens tôt.'],
  ],
  boulevard: [
    ['Wesh ! Tu viens manger un kebab ?', "Celui du boulevard, c'est le meilleur du 93, je te jure."],
    ['Je cherche un taxiphone pour appeler ma famille.', 'Ah, il y en a un juste là !'],
    ['La boucherie fait des promos aujourd’hui.', "Ma mère m'a envoyé chercher de la viande pour ce soir."],
    ['Il y a toujours un monde fou sur ce boulevard !', 'Le samedi, c’est encore pire.'],
    ['Je prends un café en terrasse.', 'Tu veux te joindre à moi ?'],
    ["Le coiffeur d'en face fait des dégradés de fou.", "Ça coûte rien et t'es frais pour la semaine."],
    ["J'ai cassé l'écran de mon téléphone…", 'Heureusement, la boutique de téléphonie répare en une heure.'],
    ['Pizzeria ou tacos ce soir ?', "Franchement, j'arrive pas à choisir."],
    ['Excuse-moi, tu sais où est le primeur ?', 'Ah oui, je le vois. Merci !'],
  ],
  dog: [
    ['Il est gentil, tu peux le caresser !', "Il adore qu'on s'occupe de lui."],
    ['Attention, il tire fort sur la laisse !'],
    ["Si tu veux un animal, va à l'animalerie.", "Mais attention : il faut le nourrir, sinon le refuge le récupère."],
    ['On fait notre balade, comme tous les jours.', 'Un chien, ça te fait sortir, même quand il pleut !'],
  ],
  night: [
    ['Il est tard… je rentre chez moi.', 'Toi aussi, va dormir : demain, il y a du boulot !'],
    ['La ville est calme, la nuit.', "J'aime bien marcher quand il n'y a personne."],
    ['Les lampadaires éclairent bien, ici.', 'On se sent en sécurité.'],
  ],
  corn: [
    ['Maïs chaud ! Maïs chaud !', 'Approche-toi du chariot pour en acheter un, ce n’est pas cher.'],
    ['Grillé au charbon, comme au pays !', 'Un épi, ça te cale pour un moment.'],
  ],
  chestnut: [
    ['Chauds les marrons !', 'Un cornet pour te réchauffer les mains ?'],
    ['Les marrons, c’est le goût de l’hiver.', 'Viens, je te sers un cornet tout chaud.'],
  ],
};
