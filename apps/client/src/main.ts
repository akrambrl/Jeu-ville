import { startApp } from './app.js';
import { setupNative } from './native.js';
import { onlineTransport } from './net/transports.js';
import './ui/fonts.js';
import './ui/styles.css';

setupNative();
// Jeu en ligne : Supabase Realtime (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), sinon solo seulement.
startApp(document.getElementById('ui')!, { transport: onlineTransport() });
