/**
 * Intégration avec l'appli native (Capacitor, Android et iOS) : vibrations,
 * barre d'état, écran de démarrage et bouton « retour » d'Android. Dans un
 * navigateur, tout se replie sur le web (navigator.vibrate) ou ne fait rien.
 */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = (): boolean => Capacitor.isNativePlatform();

/** Couleur de la barre d'état (le haut de l'écran, comme le fond du jeu). */
const STATUS_BAR_COLOR = '#241656';

/**
 * Vibrations du jeu. Navigateur : motifs en ms (vibre, pause, vibre…) ;
 * appli native : retours haptiques du téléphone (iPhone compris).
 */
const WEB_PATTERNS = {
  duel: [200],
  right: [60, 60, 60],
  wrong: [400],
} as const;

export type HapticKind = keyof typeof WEB_PATTERNS;

export function haptic(kind: HapticKind): void {
  try {
    if (!isNative()) {
      navigator.vibrate?.([...WEB_PATTERNS[kind]]);
      return;
    }
    if (kind === 'duel') void Haptics.impact({ style: ImpactStyle.Heavy });
    else void Haptics.notification({ type: kind === 'right' ? NotificationType.Success : NotificationType.Error });
  } catch {
    /* vibration indisponible */
  }
}

/** Réglages de l'appli native au démarrage : barre d'état, écran de démarrage, bouton retour. */
export function setupNative(): void {
  if (!isNative()) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  if (Capacitor.getPlatform() === 'android') void StatusBar.setBackgroundColor({ color: STATUS_BAR_COLOR }).catch(() => {});
  void SplashScreen.hide().catch(() => {});
  // Android : « retour » ferme la fenêtre ouverte, sinon quitte la table, sinon quitte l'appli.
  void App.addListener('backButton', () => {
    const overlays = document.querySelectorAll<HTMLElement>('.overlay:not([hidden])');
    const top = overlays[overlays.length - 1];
    const closeButton = top?.querySelector<HTMLButtonElement>('button.link, button:not(.primary):not(.danger)');
    if (top && !top.classList.contains('table-overlay') && closeButton) return closeButton.click();
    const quit = document.querySelector<HTMLButtonElement>('.table-screen .topbar .icon-button');
    if (quit) return quit.click();
    void App.exitApp();
  });
}
