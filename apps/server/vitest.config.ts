import { defineConfig } from 'vitest/config';

// DATABASE_URL pour les tests d'intégration ; sans .env, ils sont simplement ignorés.
try {
  process.loadEnvFile('../../.env');
} catch {
  /* pas de .env */
}

export default defineConfig({});
