import { startApp } from './app.js';
import { installErrorReporting } from './net/api.js';
import './ui/styles.css';

installErrorReporting();
startApp(document.getElementById('ui')!, { online: true });
