/**
 * Types échangés entre l'écran et la partie. Le jeu en ligne n'a plus de
 * serveur à nous : les messages entre téléphones (et leur validation zod) sont
 * dans online/table.ts.
 */
import { z } from 'zod';

// Messages de validation en français.
z.config(z.locales.fr());

/** Message d'information ou d'erreur à montrer à un joueur. */
export interface Notice {
  level: 'info' | 'error';
  text: string;
}
