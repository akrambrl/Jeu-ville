/** Catégories du jeu, comme au petit bac. Chaque carte en porte deux. */

export const CATEGORIES = {
  firstName: { label: 'Prénom', icon: '🧑' },
  fruitVeg: { label: 'Fruit ou légume', icon: '🍎' },
  job: { label: 'Métier', icon: '👷' },
  place: { label: 'Pays ou ville', icon: '🌍' },
  animal: { label: 'Animal', icon: '🐾' },
  celebrity: { label: 'Célébrité', icon: '⭐' },
  brand: { label: 'Marque', icon: '🏷️' },
  sport: { label: 'Sport', icon: '⚽' },
  houseObject: { label: 'Objet de la maison', icon: '🛋️' },
  dish: { label: 'Plat ou dessert', icon: '🍲' },
  clothing: { label: 'Vêtement', icon: '👕' },
  bodyPart: { label: 'Partie du corps', icon: '💪' },
} as const;

export type CategoryId = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];
