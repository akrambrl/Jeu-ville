import { startApp } from './app.js';
import { isNative, setupNative } from './native.js';
import { installErrorReporting } from './net/api.js';
import './ui/fonts.js';
import './ui/styles.css';

setupNative();
// Appli native : le jeu en ligne a besoin de l'adresse du serveur, fixée à la compilation.
const online = !isNative() || !!import.meta.env.VITE_SERVER_URL;
if (online) installErrorReporting();
startApp(document.getElementById('ui')!, { online });
