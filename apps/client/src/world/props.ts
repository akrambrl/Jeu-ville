/** Mobilier urbain et végétation : arbres, lampadaires, bancs, voitures, abris… */
import * as THREE from 'three';
import { DECOR, type MapGrid } from '@jeu-ville/shared';
import { cloneModel, enableShadows, loadModel } from './assets.js';
import { groundTop } from './ground.js';
import { glowAtNight, showAtNight } from './night.js';
import { canvasTexture, signTexture } from './textures.js';

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.count = matrices.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export async function buildProps(grid: MapGrid): Promise<THREE.Group> {
  const group = new THREE.Group();
  const trees: Record<'tree-large' | 'tree-small', THREE.Matrix4[]> = { 'tree-large': [], 'tree-small': [] };
  const lamps: THREE.Matrix4[] = [];
  const benches: THREE.Matrix4[] = [];
  const cars: { x: number; y: number; police: boolean; h: number }[] = [];
  const rot = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const d = grid.decorAt(x, y);
      const h = (x * 31 + y * 17) % 997;
      const top = groundTop(grid.tileAt(x, y));
      if (d === DECOR.tree) {
        const s = 0.75 + (h % 5) * 0.08;
        rot.setFromAxisAngle(up, (h % 8) * 0.8);
        trees[h % 3 === 0 ? 'tree-small' : 'tree-large'].push(
          new THREE.Matrix4().compose(new THREE.Vector3(x + ((h % 3) - 1) * 0.12, top, y), rot.clone(), new THREE.Vector3(s, s, s)),
        );
      } else if (d === DECOR.lamp) {
        lamps.push(new THREE.Matrix4().makeTranslation(x - 0.38, top, y - 0.38));
      } else if (d === DECOR.bench) {
        benches.push(new THREE.Matrix4().makeTranslation(x, top, y));
      } else if (d === DECOR.car || d === DECOR.policeCar) {
        cars.push({ x, y, police: d === DECOR.policeCar, h });
      } else if (d === DECOR.shelter) {
        group.add(shelter(x, y, top));
      } else if (d === DECOR.hoop) {
        group.add(hoop(x, y, top));
      } else if (d === DECOR.busStop) {
        group.add(busStopPole(grid, x, y, top));
      } else if (d === DECOR.marketStall) {
        group.add(marketStall(x, y, top, h));
      } else if (d === DECOR.statue) {
        group.add(statue(x, y, top));
      } else if (d === DECOR.fountain) {
        group.add(fountain(x, y, top));
      } else if (d === DECOR.goal) {
        group.add(goal(x, y, top, x % 10 < 5 ? 1 : -1));
      }
    }
  }

  // Arbres Kenney (un seul maillage chacun → instanciables).
  for (const name of ['tree-large', 'tree-small'] as const) {
    const gltf = await loadModel('nature', name);
    let source: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !source) source = o as THREE.Mesh;
    });
    if (!source) continue;
    const mesh = source as THREE.Mesh;
    // Géométrie dans le repère du modèle, posée au sol, ~1,5 case de haut.
    gltf.scene.updateMatrixWorld(true);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const k = 1.5 / (bb.max.y - bb.min.y);
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2).scale(k, k, k);
    group.add(instanced(geo, mesh.material as THREE.Material, trees[name]));
  }

  // Lampadaires : mât + lanterne.
  const dark = new THREE.MeshStandardMaterial({ color: 0x343a44, roughness: 0.6 });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd36b });
  glowAtNight(light, 3, 0.35);
  const pole = new THREE.CylinderGeometry(0.025, 0.035, 1.1, 6).translate(0, 0.55, 0);
  const cap = new THREE.CylinderGeometry(0.03, 0.09, 0.07, 6).translate(0, 1.16, 0);
  const bulb = new THREE.CylinderGeometry(0.06, 0.04, 0.07, 6).translate(0, 1.09, 0);
  group.add(instanced(pole, dark, lamps), instanced(cap, dark, lamps), instanced(bulb, light, lamps));
  // La nuit : flaque de lumière chaude au pied de chaque lampadaire.
  const halo = new THREE.MeshBasicMaterial({ map: haloTexture(), color: 0xffc56b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  showAtNight(halo, 0.8);
  const haloMesh = instanced(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2).translate(0.15, 0.03, 0.15), halo, lamps);
  haloMesh.castShadow = false;
  haloMesh.receiveShadow = false;
  haloMesh.renderOrder = 1;
  group.add(haloMesh);

  // Bancs : assise + dossier en bois, pieds sombres.
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.8 });
  const seat = new THREE.BoxGeometry(0.6, 0.05, 0.2).translate(0, 0.2, 0);
  const back = new THREE.BoxGeometry(0.6, 0.18, 0.04).translate(0, 0.33, -0.09);
  const legs = new THREE.BoxGeometry(0.5, 0.18, 0.16).translate(0, 0.09, 0);
  group.add(instanced(seat, wood, benches), instanced(back, wood, benches), instanced(legs, dark, benches));

  // Voitures garées.
  const civil = ['sedan', 'suv', 'hatchback-sports', 'van', 'taxi'];
  for (const c of cars) {
    const model = cloneModel(await loadModel('cars', c.police ? 'police' : civil[c.h % civil.length]!));
    const box = new THREE.Box3().setFromObject(model);
    const s = 0.85 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    model.scale.setScalar(s);
    model.rotation.y = c.h % 2 ? 0 : Math.PI;
    model.position.set(c.x, groundTop(grid.tileAt(c.x, c.y)), c.y);
    enableShadows(model);
    group.add(model);
  }
  return group;
}

function shelter(x: number, y: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x5b6470 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbcd6e6, transparent: true, opacity: 0.5 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x2f6fb5 });
  for (const dx of [-0.35, 0.35]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.04), frame);
    p.position.set(dx, 0.35, -0.2);
    g.add(p);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.02), glass);
  back.position.set(0, 0.38, -0.22);
  const top2 = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.4), roof);
  top2.position.set(0, 0.72, -0.08);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.03), roof);
  sign.position.set(0.45, 0.85, -0.2);
  g.add(back, top2, sign);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

function hoop(x: number, y: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x5b6470 }));
  pole.position.y = 0.55;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.03), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  board.position.set(0, 1.05, 0.05);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16), new THREE.MeshStandardMaterial({ color: 0xf07a2a }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.95, 0.16);
  g.add(pole, board, ring);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

/** Poteau d'arrêt de bus : mât, drapeau « BUS » avec les numéros de lignes, tourné vers la chaussée. */
function busStopPole(grid: MapGrid, x: number, y: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const stop = grid.map.transit.busStops.find((s) => s.x === x && s.y === y);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6), new THREE.MeshStandardMaterial({ color: 0x5b6470 }));
  pole.position.y = 0.52;
  const tex = signTexture(`BUS ${stop?.lines.join(' · ') ?? ''}`.trim(), '#2aa58a', '#ffffff');
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.02), [
    ...Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: 0x2aa58a })),
    new THREE.MeshStandardMaterial({ map: tex }),
    new THREE.MeshStandardMaterial({ map: tex }),
  ]);
  flag.position.set(0.25, 0.95, 0);
  const timetable = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), new THREE.MeshStandardMaterial({ color: 0xf3f2ec }));
  timetable.position.set(0, 0.6, 0.02);
  g.add(pole, flag, timetable);
  // Le drapeau pointe vers la chaussée (case de bordure de l'arrêt).
  if (stop) g.rotation.y = -Math.atan2(stop.curb.y - y, stop.curb.x - x) + (stop.curb.x === x ? 0 : Math.PI / 2);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

const STALL_COLORS = [0xd9483b, 0x2f6fb5, 0xf2b631, 0x3f9a5b, 0xe07a2f];
const PRODUCE_COLORS = [0xe0402f, 0xf2c230, 0x6dbb3a, 0xf08a24, 0x8e3fa0];

/** Étal de marché : tréteaux, bâche rayée, cagettes de fruits et légumes. */
function marketStall(x: number, y: number, top: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.8 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.05, 0.45), wood);
  table.position.y = 0.32;
  g.add(table);
  for (const [dx, dz] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.75, 0.03), wood);
    post.position.set(dx, 0.375, dz);
    g.add(post);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: STALL_COLORS[h % STALL_COLORS.length] }));
  canopy.position.y = 0.77;
  canopy.rotation.x = 0.12;
  g.add(canopy);
  for (let k = 0; k < 4; k++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: PRODUCE_COLORS[(h + k) % PRODUCE_COLORS.length] }));
    crate.position.set(-0.3 + k * 0.2, 0.38, 0.05);
    g.add(crate);
  }
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

/** Statue dorée sur un socle de pierre (Jeanne d'Arc brandissant son étendard). */
function statue(x: number, y: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a537, metalness: 0.7, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), stone);
  base.position.y = 0.09;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), stone);
  plinth.position.y = 0.45;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.45, 8), gold);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), gold);
  head.position.y = 1.24;
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), gold);
  staff.position.set(0.14, 1.15, 0);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.01), gold);
  banner.position.set(0.25, 1.45, 0);
  g.add(base, plinth, body, head, staff, banner);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

function fountain(x: number, y: number, top: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.9 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.48, 0.16, 20), stone);
  basin.position.y = 0.08;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6fb6d9, roughness: 0.15 }));
  water.position.y = 0.15;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.45, 10), stone);
  column.position.y = 0.35;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.06, 14), stone);
  bowl.position.y = 0.58;
  g.add(basin, water, column, bowl);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

/** Cage de foot, ouverte vers le centre du terrain (`side` : +1 = vers +x). */
function goal(x: number, y: number, top: number, side: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (const dz of [-0.45, 0.45]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), white);
    post.position.set(0, 0.2, dz);
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.92, 6).rotateX(Math.PI / 2), white);
  bar.position.y = 0.4;
  const net = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  net.position.set(-side * 0.1, 0.19, 0);
  g.add(bar, net);
  g.position.set(x, top, y);
  enableShadows(g);
  return g;
}

function haloTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}
