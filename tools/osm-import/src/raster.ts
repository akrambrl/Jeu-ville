/** Outils de rastérisation : projection géo → grille, polygones, lignes épaisses. */

export interface Pt {
  x: number;
  y: number;
}

/** Projection équirectangulaire locale : lat/lon → coordonnées en cases. */
export function makeProjection(bbox: [number, number, number, number], cellSizeMeters: number) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const mPerDegLon = 111_320 * Math.cos(midLat);
  const mPerDegLat = 110_574;
  const project = (lat: number, lon: number): Pt => ({
    x: ((lon - minLon) * mPerDegLon) / cellSizeMeters,
    // y vers le sud, pour que le nord soit en haut de la carte.
    y: ((maxLat - lat) * mPerDegLat) / cellSizeMeters,
  });
  const width = Math.ceil(((maxLon - minLon) * mPerDegLon) / cellSizeMeters);
  const height = Math.ceil(((maxLat - minLat) * mPerDegLat) / cellSizeMeters);
  return { project, width, height };
}

/**
 * Remplissage pair-impair d'un ensemble d'anneaux (les trous sont gérés),
 * en testant le centre de chaque case.
 */
export function fillRings(
  rings: Pt[][],
  width: number,
  height: number,
  plot: (x: number, y: number) => void,
): number {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.y > cy !== b.y > cy) {
          xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = from; x <= to; x++) {
        plot(x, y);
        count++;
      }
    }
  }
  return count;
}

/** Trace une polyligne d'épaisseur `widthCells` (en cases). */
export function strokeLine(
  points: Pt[],
  widthCells: number,
  width: number,
  height: number,
  plot: (x: number, y: number) => void,
): void {
  // Rayon mini 0,75 : les lignes fines restent connexes en 4 directions.
  const r = Math.max(0.75, widthCells / 2);
  const r2 = r * r;
  const stamp = (px: number, py: number) => {
    const xa = Math.max(0, Math.floor(px - r));
    const xb = Math.min(width - 1, Math.ceil(px + r));
    const ya = Math.max(0, Math.floor(py - r));
    const yb = Math.min(height - 1, Math.ceil(py + r));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - px;
        const dy = y + 0.5 - py;
        if (dx * dx + dy * dy <= r2) plot(x, y);
      }
    }
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    }
  }
}

/** Assemble des morceaux de chemins (listes d'ids de nœuds) en anneaux fermés. */
export function assembleRings(segments: string[][]): string[][] {
  const pending = segments.filter((s) => s.length >= 2).map((s) => [...s]);
  const rings: string[][] = [];
  while (pending.length > 0) {
    const ring = pending.shift()!;
    let progress = true;
    while (ring[0] !== ring[ring.length - 1] && progress) {
      progress = false;
      for (let i = 0; i < pending.length; i++) {
        const seg = pending[i]!;
        const end = ring[ring.length - 1];
        if (seg[0] === end) ring.push(...seg.slice(1));
        else if (seg[seg.length - 1] === end) ring.push(...seg.slice(0, -1).reverse());
        else continue;
        pending.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) rings.push(ring);
  }
  return rings;
}
