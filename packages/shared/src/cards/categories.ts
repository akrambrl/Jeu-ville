/**
 * Catégories du jeu, comme au petit bac. Chaque carte en porte deux, et chaque
 * catégorie a sa couleur (la même partout : cartes, duel, règles).
 */

export const CATEGORIES = {
  firstName: { label: 'Prénom', icon: '🧑', color: '#ff5d8f' },
  fruitVeg: { label: 'Fruit ou légume', icon: '🍎', color: '#43c464' },
  job: { label: 'Métier', icon: '👷', color: '#ff9f1c' },
  place: { label: 'Pays ou ville', icon: '🌍', color: '#3a86ff' },
  animal: { label: 'Animal', icon: '🐾', color: '#b07a4f' },
  celebrity: { label: 'Célébrité', icon: '⭐', color: '#ffc93c' },
  brand: { label: 'Marque', icon: '🏷️', color: '#8f5bff' },
  sport: { label: 'Sport', icon: '⚽', color: '#ef3b3b' },
  houseObject: { label: 'Objet de la maison', icon: '🛋️', color: '#20c4b5' },
  dish: { label: 'Plat ou dessert', icon: '🍲', color: '#c2187a' },
  clothing: { label: 'Vêtement', icon: '👕', color: '#7cc8ff' },
  bodyPart: { label: 'Partie du corps', icon: '💪', color: '#ffad91' },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];
