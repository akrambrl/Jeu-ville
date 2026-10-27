/** Mobilier urbain et végétation : arbres, lampadaires, bancs, voitures, abris… */
import * as THREE from 'three';
import { DECOR, type MapGrid } from '@jeu-ville/shared';
import { cloneModel, enableShadows, loadModel } from './assets.js';
import { groundTop } from './ground.js';

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
  const light = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd36b, emissiveIntensity: 0.35 });
  const pole = new THREE.CylinderGeometry(0.025, 0.035, 1.1, 6).translate(0, 0.55, 0);
  const cap = new THREE.CylinderGeometry(0.03, 0.09, 0.07, 6).translate(0, 1.16, 0);
  const bulb = new THREE.CylinderGeometry(0.06, 0.04, 0.07, 6).translate(0, 1.09, 0);
  group.add(instanced(pole, dark, lamps), instanced(cap, dark, lamps), instanced(bulb, light, lamps));

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
