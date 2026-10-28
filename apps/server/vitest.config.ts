import { defineConfig } from 'vitest/config';

// Les tests d'intégration utilisent une base DÉDIÉE (TEST_DATABASE_URL), vidée à
// chaque lancement. Sans elle, ils sont simplement ignorés.
try {
  process.loadEnvFile('../../.env');
} catch {
  /* pas de .env */
}

export default defineConfig({
  test: {
    // Les tests sur base réelle partagent la même base : un fichier à la fois.
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
  },
});
