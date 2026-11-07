import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Appli native (Android et iOS) : le jeu compilé (dist/) dans une coquille native.
 * Voir docs/STORES.md pour compiler et publier.
 */
const config: CapacitorConfig = {
  // ⚠️ Identifiant définitif sur les stores (impossible à changer après la 1re publication) :
  // à adapter à un nom de domaine que tu possèdes, ex. « fr.tondomaine.bacbataille ».
  appId: 'fr.bacbataille.app',
  appName: 'Bac Bataille',
  webDir: 'dist',
  backgroundColor: '#241656',
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: {
      // L'appli cache l'écran de démarrage dès qu'elle est prête (voir native.ts).
      launchAutoHide: false,
      backgroundColor: '#241656',
      showSpinner: false,
    },
  },
};

export default config;
