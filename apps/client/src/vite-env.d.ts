/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Projet Supabase du jeu en ligne (adresse et clé publique « anon »). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** « local » : jeu en ligne entre onglets d'un même navigateur (développement). */
  readonly VITE_ONLINE?: string;
  /** Adresse publique du jeu web (liens d'invitation envoyés depuis l'appli). */
  readonly VITE_PUBLIC_URL?: string;
}
