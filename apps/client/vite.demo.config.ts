import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Build de la démo solo : un seul JS et un seul CSS, assemblés ensuite en une page. */
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist-demo',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'demo.html'),
      output: { inlineDynamicImports: true },
    },
  },
});
