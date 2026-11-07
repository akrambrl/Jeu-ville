/**
 * Pseudos refusés : insultes, grossièretés et propos haineux (les pseudos sont
 * visibles des autres joueurs). Comparés sans accents ni majuscules, en
 * déjouant les chiffres à la place des lettres (« c0nnard »). Les mots courts
 * ne sont refusés que seuls (pour ne pas bloquer « Constance ») ; les longs,
 * même collés à autre chose.
 */
export const BANNED_WORDS = [
  // Insultes et grossièretés
  'con', 'conne', 'connard', 'connasse', 'conasse', 'salaud', 'salope', 'salopard', 'pute', 'putain', 'pétasse', 'garce', 'enculé', 'enculer', 'encule',
  'batard', 'bâtard', 'merde', 'merdeux', 'chier', 'chiasse', 'couille', 'couilles', 'bite', 'zizi', 'teub', 'chatte', 'cul', 'trouduc', 'troudcul',
  'branleur', 'branlette', 'nique', 'niquer', 'ntm', 'fdp', 'tg', 'ptn', 'pd', 'pédé', 'tarlouze', 'tapette', 'gouine', 'enfoiré', 'abruti', 'débile',
  'mongol', 'gogol', 'triso', 'attardé', 'clochard', 'bouffon', 'pouffiasse', 'catin', 'trainée', 'baiser', 'baise', 'sodomie', 'porno', 'sexe', 'viol', 'violeur',
  // Haine, violence, extrémisme
  'nazi', 'hitler', 'naziste', 'facho', 'raciste', 'negre', 'nègre', 'bougnoule', 'bicot', 'youpin', 'feuj', 'chintok', 'niakoué', 'macaque', 'terroriste', 'daech', 'jihad',
  // Anglais courant
  'fuck', 'fucker', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'porn', 'sex', 'rape',
] as const;

/** Mots refusés même collés à d'autres lettres, à partir de cette longueur. */
export const BANNED_SUBSTRING_MIN_LENGTH = 5;
