import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Hébergement dans un sous-dossier (GitHub Pages : /Jeu-ville/) ; « / » pour l'appli native.
  base: process.env.BASE_PATH ?? '/',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Le jeu, et la page publique des textes légaux (adresse à donner aux stores).
      input: { main: resolve(import.meta.dirname, 'index.html'), legal: resolve(import.meta.dirname, 'legal.html') },
    },
  },
});
