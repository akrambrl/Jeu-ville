/** Version autonome (une seule page, sans serveur) : on joue contre des bots. */
import { startApp } from '../app.js';
import '../ui/fonts.js';
import '../ui/styles.css';

startApp(document.getElementById('ui')!, { transport: null });
