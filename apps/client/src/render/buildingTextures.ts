/**
 * Textures des bâtiments, case par case. Chaque case dessine sa « colonne » :
 * murs des deux faces visibles, fenêtres, portes, enseignes et toit, selon son
 * type (TILE) et sa forme (SHAPE). Les bâtiments de plusieurs cases (maison à
 * deux pans, mairie, église…) sont composés de ces colonnes.
 */
import Phaser from 'phaser';
import { SHAPE, TILE } from '@jeu-ville/shared';
import { BUILDING_COLORS, ROOF_COLORS, WINDOW_COLOR } from './palette.js';
import { LEVEL_PX, TILE_H, TILE_W, makeCanvas, polygon, project, shade } from './iso.js';

/** Place réservée au-dessus des murs (toits, clocher, fronton). */
const ROOF_SPACE = 44;
/** Montée d'un toit à deux pans. */
const PITCH_RISE = 12;
const CHURCH_RISE = 14;
const SPIRE_HEIGHT = 30;

type Face = 'L' | 'R';
type P2 = [number, number];

/** Côtés d'une case qui sont en façade (pas de case du même bâtiment à côté). */
export const EDGE = { north: 1, south: 2, west: 4, east: 8, all: 15 } as const;

/** Couleurs possibles des immeubles, variées d'un îlot à l'autre. */
const APARTMENT_COLORS = [0xd9dde4, 0xeadbc8, 0xf1e4cf, 0xdbe5d8, 0xead6d2];

export function buildingTextureKey(code: string, levels: number, shape: string, edges: number, variant: number): string {
  return `bld-${code}-${levels}-${shape}-${edges}-${variant}`;
}

function textureHeight(levels: number): number {
  return TILE_H + levels * LEVEL_PX + ROOF_SPACE + 2;
}

/** Décalage vertical de l'origine d'un bloc (pour `setOrigin`). */
export function buildingOriginY(levels: number): number {
  const h = textureHeight(levels);
  return (h - TILE_H / 2 - 1) / h;
}

/** Hauteur du sommet des murs d'une case (pour poser un drapeau sur le toit). */
export function roofTopPx(levels: number, shape: string): number {
  const walls = levels * LEVEL_PX;
  if (shape === SHAPE.townhallCenter) return walls + 10;
  return walls;
}

class Painter {
  readonly p: (x: number, y: number, z: number) => P2;

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    readonly edges: number,
  ) {
    this.p = (x, y, z) => project(ox, oy, x, y, z);
  }

  /** Point d'une face : u le long de la face (de -16 à 16), z la hauteur. */
  fp(face: Face, u: number, z: number, depth = 0): P2 {
    return face === 'L' ? this.p(u, 16 + depth, z) : this.p(16 + depth, u, z);
  }

  quad(face: Face, u0: number, u1: number, z0: number, z1: number, fill: string, depth = 0): void {
    polygon(
      this.ctx,
      [this.fp(face, u0, z0, depth), this.fp(face, u1, z0, depth), this.fp(face, u1, z1, depth), this.fp(face, u0, z1, depth)],
      fill,
    );
  }

  /** Fenêtre avec encadrement clair. */
  window(face: Face, u: number, z: number, w: number, h: number, glass: string, frame = 'rgba(255,255,255,0.55)'): void {
    this.quad(face, u - 1, u + w + 1, z - 1, z + h + 1, frame);
    this.quad(face, u, u + w, z, z + h, glass);
    // Reflet
    this.quad(face, u + 1, u + 2.5, z + 1, z + h - 1, 'rgba(255,255,255,0.25)');
  }

  /** Fenêtre cintrée (haut arrondi approximé). */
  archedWindow(face: Face, u: number, z: number, w: number, h: number, glass: string): void {
    this.window(face, u, z, w, h, glass);
    const steps = 6;
    const pts: P2[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = Math.PI - (k / steps) * Math.PI;
      pts.push(this.fp(face, u + w / 2 + Math.cos(a) * (w / 2), z + h + Math.sin(a) * (w / 2)));
    }
    polygon(this.ctx, pts, glass);
  }

  /** Texte peint sur une face, lisible de gauche à droite. */
  text(face: Face, uCenter: number, z: number, label: string, color: string, size: number, bold = true): void {
    const ctx = this.ctx;
    const [x, y] = this.fp(face, face === 'L' ? uCenter : uCenter, z);
    ctx.save();
    // Face L : u → (1, 0.5) à l'écran. Face R : on lit dans le sens -u → (1, -0.5).
    ctx.setTransform(1, face === 'L' ? 0.5 : -0.5, 0, 1, x, y);
    ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  /** Dessus plat, avec un rebord (acrotère) seulement sur les côtés en façade. */
  flatRoof(z: number, color: number, rim = true): void {
    const p = this.p;
    polygon(this.ctx, [p(-16, -16, z), p(16, -16, z), p(16, 16, z), p(-16, 16, z)], shade(color, 1.05));
    if (!rim) return;
    const e = this.edges;
    const band = (x0: number, y0: number, x1: number, y1: number) =>
      polygon(this.ctx, [p(x0, y0, z + 1.5), p(x1, y0, z + 1.5), p(x1, y1, z + 1.5), p(x0, y1, z + 1.5)], shade(color, 1.18));
    if (e & EDGE.north) band(-16, -16, 16, -13);
    if (e & EDGE.west) band(-16, -16, -13, 16);
    if (e & EDGE.south) {
      band(-16, 13, 16, 16);
      polygon(this.ctx, [p(-16, 16, z), p(16, 16, z), p(16, 16, z + 1.5), p(-16, 16, z + 1.5)], shade(color, 0.95));
    }
    if (e & EDGE.east) {
      band(13, -16, 16, 16);
      polygon(this.ctx, [p(16, -16, z), p(16, 16, z), p(16, 16, z + 1.5), p(16, -16, z + 1.5)], shade(color, 0.8));
    }
  }

  /** Toit à brisis (mairie, gare) : pentes seulement sur les côtés en façade. */
  mansard(z: number, rise: number, color: number, overhang = 0): void {
    const p = this.p;
    const e = this.edges;
    const o = 16 + overhang;
    const inset = 6;
    const x0 = e & EDGE.west ? -o + inset : -o;
    const x1 = e & EDGE.east ? o - inset : o;
    const y0 = e & EDGE.north ? -o + inset : -o;
    const y1 = e & EDGE.south ? o - inset : o;
    const ctx = this.ctx;
    if (e & EDGE.north) polygon(ctx, [p(-o, -o, z), p(o, -o, z), p(x1, y0, z + rise), p(x0, y0, z + rise)], shade(color, 1.2));
    if (e & EDGE.west) polygon(ctx, [p(-o, -o, z), p(x0, y0, z + rise), p(x0, y1, z + rise), p(-o, o, z)], shade(color, 1.1));
    polygon(ctx, [p(x0, y0, z + rise), p(x1, y0, z + rise), p(x1, y1, z + rise), p(x0, y1, z + rise)], shade(color, 1.12));
    if (e & EDGE.south) polygon(ctx, [p(x0, y1, z + rise), p(x1, y1, z + rise), p(o, o, z), p(-o, o, z)], shade(color, 0.95));
    else polygon(ctx, [p(x0, y1, z + rise), p(x1, y1, z + rise), p(x1, o, z + rise), p(x0, o, z + rise)], shade(color, 1.12));
    if (e & EDGE.east) polygon(ctx, [p(x1, y0, z + rise), p(x1, y1, z + rise), p(o, o, z), p(o, -o, z)], shade(color, 0.8));
  }
}

const GLASS = shade(WINDOW_COLOR, 1.05);
const GLASS_DARK = shade(WINDOW_COLOR, 0.85);

/** Une case de bâtiment (colonne de murs + toit). */
export function ensureBuildingTexture(
  textures: Phaser.Textures.TextureManager,
  code: string,
  levels: number,
  shape: string,
  edges: number = EDGE.all,
  variant = 0,
): string {
  const key = buildingTextureKey(code, levels, shape, edges, variant);
  if (textures.exists(key)) return key;

  const H = levels * LEVEL_PX;
  const w = TILE_W + 8;
  const h = textureHeight(levels);
  const { canvas, ctx } = makeCanvas(w, h);
  const g = new Painter(ctx, w / 2, h - TILE_H / 2 - 1, edges);
  const base =
    code === TILE.apartments
      ? APARTMENT_COLORS[variant % APARTMENT_COLORS.length]!
      : (BUILDING_COLORS[code] ?? BUILDING_COLORS[TILE.building]!);
  const wallL = shade(base, 0.97);
  const wallR = shade(base, 0.8);
  const wall = (face: Face) => (face === 'L' ? wallL : wallR);
  const faces: Face[] = ['L', 'R'];

  // Murs
  for (const f of faces) g.quad(f, -16, 16, 0, H, wall(f));

  switch (code) {
    case TILE.house:
      drawHouse(g, shape, H, wall);
      break;
    case TILE.apartments:
    case TILE.starter:
    case TILE.building:
    case TILE.industrial:
      drawApartments(g, code, shape, levels, H, base);
      break;
    case TILE.commercial:
      drawShop(g, shape, levels, H, base);
      break;
    case TILE.townhall:
      drawTownhall(g, shape, levels, H, base, wall);
      break;
    case TILE.worship:
      drawChurch(g, shape, levels, H, base, wall);
      break;
    case TILE.civic:
      drawSchool(g, shape, levels, H, base);
      break;
    case TILE.station:
      drawStation(g, shape, levels, H, base);
      break;
    default:
      for (let lv = 0; lv < levels; lv++) for (const f of faces) for (const u of [-11, 4]) g.window(f, u, lv * LEVEL_PX + 2, 7, 5, GLASS);
      g.flatRoof(H, base);
  }

  // Arête verticale avant, pour l'effet « bloc ».
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.beginPath();
  ctx.moveTo(...g.p(16, 16, 0));
  ctx.lineTo(...g.p(16, 16, H));
  ctx.stroke();

  textures.addCanvas(key, canvas);
  return key;
}

// ---------- Pavillon : volets, porte, toit à deux pans (faîtage selon x) ----------

function drawHouse(g: Painter, shape: string, H: number, wall: (f: Face) => string): void {
  const roof = ROOF_COLORS[TILE.house]!;
  const levels = Math.round(H / LEVEL_PX);
  for (let lv = 0; lv < levels; lv++) {
    const z = lv * LEVEL_PX + 2;
    for (const f of ['L', 'R'] as Face[]) {
      if (f === 'L' && shape === SHAPE.roofSouthDoor && lv === 0) continue;
      g.window(f, -3, z, 6, 5, GLASS);
      g.quad(f, -6, -4, z, z + 5, '#4f7f6a');
      g.quad(f, 4, 6, z, z + 5, '#4f7f6a');
    }
  }
  if (shape === SHAPE.roofSouthDoor) {
    g.quad('L', -4, 4, 0, 7, '#7a4b2e');
    g.quad('L', -5, 5, 7, 8.5, shade(0x7a4b2e, 0.8));
    g.quad('L', 1.5, 2.5, 3, 4, '#e8c860');
  }
  const R = PITCH_RISE;
  const p = g.p;
  const ctx = g.ctx;
  const north = shape === SHAPE.roofNorth;
  // Pignon (triangle) sur la face +x.
  polygon(ctx, north ? [p(16, -16, H), p(16, 16, H + R), p(16, 16, H)] : [p(16, -16, H), p(16, -16, H + R), p(16, 16, H)], wall('R'));
  // Pan de toit, avec débord.
  const tileLine = (t: number) => {
    // Lignes de tuiles parallèles au faîtage.
    const y = -16 + t * 32;
    const z = north ? H + R * t : H + R * (1 - t);
    ctx.strokeStyle = shade(roof, 0.85);
    ctx.beginPath();
    ctx.moveTo(...p(-17, y, z));
    ctx.lineTo(...p(18, y, z));
    ctx.stroke();
  };
  if (north) {
    polygon(ctx, [p(-17, -18, H - 1), p(18, -18, H - 1), p(18, 16, H + R), p(-17, 16, H + R)], shade(roof, 1.05));
    for (const t of [0.33, 0.66]) tileLine(t);
    // Cheminée
    const chimney = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      polygon(ctx, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], '#b5654b');
      polygon(ctx, [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], '#94503b');
      polygon(ctx, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], '#c97a5f');
    };
    chimney(4, -2, H + R * 0.4, 9, 3, H + R + 6);
  } else {
    polygon(ctx, [p(-17, -16, H + R), p(18, -16, H + R), p(18, 19, H - 1.5), p(-17, 19, H - 1.5)], shade(roof, 0.92));
    for (const t of [0.33, 0.66]) tileLine(t);
    // Faîtage
    ctx.strokeStyle = shade(roof, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(...p(-17, -16, H + R));
    ctx.lineTo(...p(18, -16, H + R));
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

// ---------- Immeuble : soubassement, balcons, halls, boulangerie ----------

function drawApartments(g: Painter, code: string, shape: string, levels: number, H: number, base: number): void {
  const faces: Face[] = ['L', 'R'];
  // Soubassement plus sombre.
  for (const f of faces) g.quad(f, -16, 16, 0, LEVEL_PX - 1, shade(base, f === 'L' ? 0.82 : 0.68));
  for (let lv = 1; lv < levels; lv++) {
    const z = lv * LEVEL_PX + 1.5;
    for (const f of faces) {
      for (const u of [-12, 3]) g.window(f, u, z, 8, 5, GLASS);
      // Balcon avec garde-corps sur la face avant, un étage sur deux.
      if (f === 'L' && lv % 2 === 1) {
        g.quad('L', -13, -2, z - 1.5, z - 0.5, shade(base, 0.6), 2.5);
        g.quad('L', -13, -2, z - 0.5, z + 2, 'rgba(60,70,80,0.55)', 3);
      }
    }
  }
  if (shape === SHAPE.bakery) {
    drawBakeryFront(g);
  } else {
    for (const f of faces) {
      if (shape === SHAPE.entrance) {
        // Hall vitré et marquise.
        g.quad(f, -6, 6, 0, 6.5, GLASS_DARK);
        g.quad(f, -0.4, 0.4, 0, 6.5, 'rgba(255,255,255,0.5)');
        g.quad(f, -8, 8, 6.5, 7.5, shade(base, 0.5), 3);
      } else {
        for (const u of [-12, 3]) g.window(f, u, 1.5, 8, 4, GLASS_DARK);
      }
    }
  }
  g.flatRoof(H, base);
}

function drawBakeryFront(g: Painter): void {
  for (const f of ['L', 'R'] as Face[]) {
    // Devanture en bois, vitrine dorée (pains), store rayé et grande enseigne.
    g.quad(f, -16, 16, 0, LEVEL_PX + 7, '#6e3f22');
    g.quad(f, -13, 13, 1, 6, '#f3c97a');
    for (const u of [-10, -4, 2, 8]) g.quad(f, u, u + 4, 1.5, 3, '#c98a3a');
    g.quad(f, -1, 1, 0, 6, '#6e3f22');
    for (let k = 0; k < 4; k++) {
      g.quad(f, -16 + k * 8, -8 + k * 8, LEVEL_PX - 2, LEVEL_PX, k % 2 ? '#f6ecd8' : '#b5763a', 4);
    }
    g.quad(f, -15.5, 15.5, LEVEL_PX + 0.5, LEVEL_PX + 6.5, '#4a2614', 0.5);
    g.text(f, 0, LEVEL_PX + 3.5, 'BOULANGERIE', '#ffd98a', 5.4);
  }
}

// ---------- Commerces ----------

function drawShop(g: Painter, shape: string, levels: number, H: number, base: number): void {
  const faces: Face[] = ['L', 'R'];
  if (shape === SHAPE.bakery) {
    drawBakeryFront(g);
  } else {
    const awning = [0xd94f3d, 0x3b6ea8, 0x4e9a5b, 0xe0a530][levels % 4]!;
    for (const f of faces) {
      g.quad(f, -16, 16, 0, LEVEL_PX - 0.5, shade(base, 0.6));
      g.quad(f, -14, 14, 1, 6, GLASS_DARK);
      g.quad(f, -14, 14, 4.5, 6, 'rgba(255,255,255,0.2)');
      for (let k = 0; k < 4; k++) {
        g.quad(f, -16 + k * 8, -8 + k * 8, LEVEL_PX - 2, LEVEL_PX + 1, k % 2 ? '#f4efe6' : shade(awning, 1), 2.5);
      }
    }
  }
  for (let lv = 1; lv < levels; lv++) {
    for (const f of faces) for (const u of [-11, 4]) g.window(f, u, lv * LEVEL_PX + 2, 7, 5, GLASS);
  }
  g.flatRoof(H, base);
}

// ---------- Mairie ----------

function drawTownhall(g: Painter, shape: string, levels: number, H: number, base: number, wall: (f: Face) => string): void {
  const faces: Face[] = ['L', 'R'];
  const stone = shade(base, 1.08);
  const slate = ROOF_COLORS[TILE.townhall]!;
  for (let lv = 0; lv < levels; lv++) {
    const z = lv * LEVEL_PX;
    for (const f of faces) {
      // Corniche entre les étages.
      g.quad(f, -16, 16, z + LEVEL_PX - 1, z + LEVEL_PX, stone, 0.8);
      if (shape === SHAPE.townhallCenter && f === 'L') continue;
      for (const u of [-11, 5]) g.archedWindow(f, u, z + 1.5, 6, 3.5, GLASS);
    }
  }
  // Toit d'ardoise à la Mansart.
  g.mansard(H, 6, slate, 0.5);
  if (shape === SHAPE.townhallCenter) {
    // Colonnes, porte, horloge, fronton « MAIRIE ».
    g.quad('L', -6, 6, 0, 6, '#5b3b2a');
    for (const u of [-14, -9, 8, 13]) g.quad('L', u, u + 2.5, 0, LEVEL_PX * 2 - 1, '#fbf7ee', 1.5);
    g.quad('L', -16, 16, LEVEL_PX * 2 - 1, LEVEL_PX * 2 + 1, stone, 1.5);
    g.text('L', 0, LEVEL_PX * 2 + 3.5, 'MAIRIE', '#3b4a5c', 5.5);
    // Horloge
    const [cx, cy] = g.fp('L', 0, H - 4);
    const ctx = g.ctx;
    ctx.save();
    ctx.setTransform(1, 0.5, 0, 1, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d3a4a';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -2.6);
    ctx.moveTo(0, 0);
    ctx.lineTo(1.8, 0.6);
    ctx.stroke();
    ctx.restore();
    // Fronton triangulaire au-dessus de la façade.
    polygon(g.ctx, [g.fp('L', -16, H), g.fp('L', 16, H), g.fp('L', 0, H + 10)], wall('L'));
    polygon(g.ctx, [g.fp('L', -12, H + 1), g.fp('L', 12, H + 1), g.fp('L', 0, H + 7.5)], stone);
  }
  // Lucarne
  if (shape !== SHAPE.townhallCenter && g.edges & EDGE.south) g.window('L', -2, H + 0.5, 4, 3, GLASS, '#e9e2d0');
}

// ---------- Église ----------

function drawChurch(g: Painter, shape: string, levels: number, H: number, base: number, wall: (f: Face) => string): void {
  const ctx = g.ctx;
  const p = g.p;
  const roof = ROOF_COLORS[TILE.worship]!;
  const stained = ['#5a7bd0', '#c9504a', '#e5b84a'];
  if (shape === SHAPE.belfry) {
    // Clocher : abat-sons en haut, flèche et croix.
    for (const f of ['L', 'R'] as Face[]) {
      g.archedWindow(f, -3, LEVEL_PX, 6, 6, stained[0]!);
      g.archedWindow(f, -3, H - 9, 6, 4, '#3a3f4a');
      g.quad(f, -16, 16, H - 1, H, shade(base, 1.1), 0.8);
    }
    const top = H + SPIRE_HEIGHT;
    polygon(ctx, [p(-14, 14, H), p(14, 14, H), p(0, 0, top)], shade(roof, 1.0));
    polygon(ctx, [p(14, -14, H), p(14, 14, H), p(0, 0, top)], shade(roof, 0.8));
    const [tx, ty] = p(0, 0, top);
    ctx.fillStyle = '#d9b44a';
    ctx.fillRect(tx - 0.6, ty - 7, 1.2, 7);
    ctx.fillRect(tx - 2.5, ty - 5, 5, 1.2);
    return;
  }
  if (shape === SHAPE.entrance) {
    // Porche
    g.quad('L', -6, 6, 0, 6, '#5b3b2a');
    polygon(ctx, [g.fp('L', -8, 6), g.fp('L', 8, 6), g.fp('L', 0, 10)], shade(base, 1.05));
    g.flatRoof(H, base, false);
    return;
  }
  // Nef : vitraux et toit à deux pans (faîtage selon y).
  for (const f of ['L', 'R'] as Face[]) {
    for (let lv = 0; lv < levels; lv += 2) g.archedWindow(f, -4, lv * LEVEL_PX + 3, 7, 7, stained[lv % 3]!);
  }
  const R = CHURCH_RISE;
  const west = shape === SHAPE.roofWest;
  // Pignon sur la face avant (+y).
  polygon(ctx, west ? [p(-16, 16, H), p(16, 16, H + R), p(16, 16, H)] : [p(-16, 16, H), p(-16, 16, H + R), p(16, 16, H)], wall('L'));
  if (west) {
    polygon(ctx, [p(-18, -16, H - 1), p(16, -16, H + R), p(16, 17, H + R), p(-18, 17, H - 1)], shade(roof, 1.05));
  } else {
    polygon(ctx, [p(-16, -16, H + R), p(19, -16, H - 1.5), p(19, 17, H - 1.5), p(-16, 17, H + R)], shade(roof, 0.85));
  }
}

// ---------- École ----------

function drawSchool(g: Painter, shape: string, levels: number, H: number, base: number): void {
  const faces: Face[] = ['L', 'R'];
  for (let lv = 0; lv < levels; lv++) {
    for (const f of faces) {
      // Grandes baies de salles de classe.
      g.window(f, -13, lv * LEVEL_PX + 1.5, 11, 5, GLASS);
      g.window(f, 2, lv * LEVEL_PX + 1.5, 11, 5, GLASS);
    }
  }
  for (const f of faces) g.quad(f, -16, 16, LEVEL_PX - 1, LEVEL_PX, '#f2a33a', 0.6);
  if (shape === SHAPE.schoolSign) {
    g.quad('L', -15, 15, H - 1, H + 5, '#1f4e8c', 0.6);
    g.text('L', 0, H + 2, 'ÉCOLE', '#ffffff', 5.5);
  }
  g.flatRoof(H, base);
}

// ---------- Gare ----------

function drawStation(g: Painter, shape: string, levels: number, H: number, base: number): void {
  const faces: Face[] = ['L', 'R'];
  for (let lv = 0; lv < levels; lv++) {
    for (const f of faces) {
      if (lv === 0 && f === 'L' && (shape === SHAPE.entrance || shape === SHAPE.stationCenter)) continue;
      g.archedWindow(f, -10, lv * LEVEL_PX + 1.5, 7, 3.5, GLASS);
      g.archedWindow(f, 3, lv * LEVEL_PX + 1.5, 7, 3.5, GLASS);
    }
  }
  if (shape === SHAPE.entrance || shape === SHAPE.stationCenter) {
    // Grande verrière d'entrée.
    g.quad('L', -13, 13, 0, LEVEL_PX - 1, GLASS_DARK);
    for (const u of [-6, 0, 6]) g.quad('L', u - 0.4, u + 0.4, 0, LEVEL_PX - 1, 'rgba(255,255,255,0.5)');
  }
  // Toiture en zinc.
  g.mansard(H, 5, 0x7d8794, 1);
  if (shape === SHAPE.stationCenter) {
    // Fronton avec horloge, enseigne GARE et pastilles RER E.
    polygon(g.ctx, [g.fp('L', -16, H), g.fp('L', 16, H), g.fp('L', 0, H + 11)], shade(base, 0.97));
    const ctx = g.ctx;
    const [cx, cy] = g.fp('L', 0, H + 4);
    ctx.save();
    ctx.setTransform(1, 0.5, 0, 1, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d3a4a';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
    g.quad('L', -15, 15, H - 6.5, H - 1, '#24324a', 0.6);
    g.text('L', -3, H - 3.7, 'GARE', '#ffffff', 4.5);
    // Pastilles RER (bleu) et ligne E (rose).
    g.quad('L', 6, 10, H - 6, H - 1.5, '#1d4f9c', 0.8);
    g.text('L', 8, H - 3.7, 'RER', '#ffffff', 2.4);
    g.quad('L', 11, 14, H - 6, H - 1.5, '#ce81b4', 0.8);
    g.text('L', 12.5, H - 3.7, 'E', '#ffffff', 3);
  }
}
