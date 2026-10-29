/**
 * Jour et nuit selon l'heure RÉELLE : position du soleil au-dessus de la ville
 * (calcul astronomique simplifié), d'où l'on tire couleurs du ciel, brume,
 * lumières. La nuit, fenêtres, vitrines et lampadaires s'allument (voir `night`).
 */
import * as THREE from 'three';

/** Latitude / longitude de référence (Noisy-le-Sec). */
const LAT = 48.89;
const LON = 2.45;
const DEG = Math.PI / 180;
/** Hauteur minimale (degrés) donnée à la lumière directionnelle, pour garder des ombres lisibles. */
const MIN_LIGHT_ELEVATION = 14;

export interface Daylight {
  /** Hauteur du soleil (degrés, négative la nuit). */
  elevation: number;
  /** 0 = plein jour, 1 = nuit noire. */
  night: number;
  /** Direction de la lumière principale (soleil, ou lune la nuit), vers la source. */
  lightDir: THREE.Vector3;
  lightColor: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  fog: THREE.Color;
  exposure: number;
}

/** Hauteur et azimut (depuis le nord, sens horaire) du soleil, en degrés. */
export function sunPosition(date: Date): { elevation: number; azimuth: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86_400_000;
  const decl = 23.44 * DEG * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const solarHours = date.getUTCHours() + date.getUTCMinutes() / 60 + LON / 15;
  const h = (solarHours - 12) * 15 * DEG;
  const lat = LAT * DEG;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h);
  const elevation = Math.asin(sinEl) / DEG;
  const azimuth = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / DEG + 180) % 360;
  return { elevation, azimuth };
}

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const c = (hex: number) => new THREE.Color(hex);

// Monde « jouet » : grand ciel bleu vif, horizon clair.
const DAY = { top: c(0x2ea8ff), bottom: c(0xbfeaff), fog: c(0xc9edff), sky: c(0xffffff), ground: c(0x8fe08f), sun: c(0xfffbe8) };
const DUSK = { top: c(0x7a7fd6), bottom: c(0xffb38f), fog: c(0xe8b4b8), sky: c(0xffd2b8), ground: c(0x8a8aa0), sun: c(0xffb07a) };
// Nuit de ville : ciel orangé en bas (éclairage public), ambiance bleutée mais lisible.
const NIGHT = { top: c(0x0d1630), bottom: c(0x3a3550), fog: c(0x2a2d45), sky: c(0x8a9cd0), ground: c(0x3a3a48), sun: c(0xb4c6ff) };

/** Mélange jour / crépuscule / nuit selon la hauteur du soleil. */
function blend(key: keyof typeof DAY, dusk: number, night: number): THREE.Color {
  return DAY[key].clone().lerp(DUSK[key], dusk).lerp(NIGHT[key], night);
}

export function daylightAt(date: Date): Daylight {
  const { elevation, azimuth } = sunPosition(date);
  // Nuit : soleil à plus de 6° sous l'horizon ; crépuscule autour de l'horizon.
  const night = 1 - smooth(-7, 1, elevation);
  const dusk = (1 - smooth(2, 14, elevation)) * (1 - night);
  const day = elevation > 0;

  // La nuit, la lumière vient de la lune, haute au sud.
  const el = (day ? Math.max(MIN_LIGHT_ELEVATION, elevation) : 50) * DEG;
  const az = (day ? azimuth : 200) * DEG;
  const lightDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

  return {
    elevation,
    night,
    lightDir,
    lightColor: day ? DAY.sun.clone().lerp(DUSK.sun, dusk) : NIGHT.sun.clone(),
    lightIntensity: day ? 0.6 + 1.7 * smooth(0, 20, elevation) : 0.7 * night + 0.3,
    hemiSky: blend('sky', dusk, night),
    hemiGround: blend('ground', dusk, night),
    hemiIntensity: THREE.MathUtils.lerp(0.95, 0.95, night),
    skyTop: blend('top', dusk, night),
    skyBottom: blend('bottom', dusk, night),
    fog: blend('fog', dusk, night),
    exposure: THREE.MathUtils.lerp(0.95, 1.35, night),
  };
}

/**
 * Heure affichée : l'heure réelle, sauf `?heure=22:30` dans l'adresse (pour
 * essayer la nuit en plein jour). Renvoie une fonction « maintenant ».
 */
export function clockFromUrl(search: string): () => Date {
  const m = /[?&]heure=(\d{1,2})(?::(\d{2}))?/.exec(search);
  if (!m) return () => new Date();
  const hours = Number(m[1]);
  const minutes = Number(m[2] ?? 0);
  return () => {
    // Heure de Paris approximée par l'heure locale du navigateur.
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  };
}
