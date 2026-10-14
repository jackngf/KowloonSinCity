import * as THREE from 'three';

/** Axis-aligned collision box helpers */
export function makeBox(x, y, z, w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  return {
    min: new THREE.Vector3(x - hw, y - hh, z - hd),
    max: new THREE.Vector3(x + hw, y + hh, z + hd),
    center: new THREE.Vector3(x, y, z),
    size: new THREE.Vector3(w, h, d),
  };
}

export function pointInBox(p, box, radius = 0) {
  return (
    p.x + radius > box.min.x && p.x - radius < box.max.x &&
    p.y + radius > box.min.y && p.y - radius < box.max.y &&
    p.z + radius > box.min.z && p.z - radius < box.max.z
  );
}

/** Resolve horizontal capsule (xz) against AABB walls; y handled separately */
export function resolveXZ(pos, radius, boxes) {
  let x = pos.x, z = pos.z;
  for (const b of boxes) {
    if (pos.y + 0.2 > b.max.y || pos.y + 1.6 < b.min.y) continue;
    const nearestX = Math.max(b.min.x, Math.min(x, b.max.x));
    const nearestZ = Math.max(b.min.z, Math.min(z, b.max.z));
    let dx = x - nearestX;
    let dz = z - nearestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= radius * radius) continue;
    if (distSq < 1e-8) {
      // Center inside — push out along smallest penetration
      const penL = x - b.min.x + radius;
      const penR = b.max.x - x + radius;
      const penF = z - b.min.z + radius;
      const penB = b.max.z - z + radius;
      const m = Math.min(penL, penR, penF, penB);
      if (m === penL) x = b.min.x - radius;
      else if (m === penR) x = b.max.x + radius;
      else if (m === penF) z = b.min.z - radius;
      else z = b.max.z + radius;
    } else {
      const dist = Math.sqrt(distSq);
      const push = (radius - dist) / dist;
      x += dx * push;
      z += dz * push;
    }
  }
  pos.x = x;
  pos.z = z;
}

const CONCRETE = 0x7a8088;
const DARK = 0x4a5058;
const NEON_MAGENTA = 0xff2d6a;
const NEON_CYAN = 0x2de0ff;
const WATER = 0x1a3040;
const WOOD = 0x5a4030;
const YELLOW = 0xffaa44;

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.floors = []; // {y, minX, maxX, minZ, maxZ}
    this.waterZones = []; // slow zones
    this.interactables = [];
    this.spawnPoints = {};
    this.enemySpawns = [];
    this.shortcutOpen = false;
    this.bossDefeated = false;
    this.group = new THREE.Group();
    scene.add(this.group);

    this._mat = {
      wall: new THREE.MeshLambertMaterial({ color: CONCRETE }),
      floor: new THREE.MeshLambertMaterial({ color: 0x8a9098 }),
      dark: new THREE.MeshLambertMaterial({ color: DARK }),
      water: new THREE.MeshStandardMaterial({
        color: WATER, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.55,
      }),
      neonM: new THREE.MeshStandardMaterial({ color: NEON_MAGENTA, emissive: NEON_MAGENTA, emissiveIntensity: 0.9 }),
      neonC: new THREE.MeshStandardMaterial({ color: NEON_CYAN, emissive: NEON_CYAN, emissiveIntensity: 0.8 }),
      wood: new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 }),
      glow: new THREE.MeshStandardMaterial({ color: YELLOW, emissive: YELLOW, emissiveIntensity: 1.2 }),
      crate: new THREE.MeshLambertMaterial({ color: 0x9a7a5a }),
      gate: new THREE.MeshLambertMaterial({ color: 0x6a7078 }),
    };

    this._build();
  }

  _boxMesh(x, y, z, w, h, d, mat, collide = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (collide) this.colliders.push(makeBox(x, y, z, w, h, d));
    return mesh;
  }

  _floor(x, z, w, d, y = 0) {
    this._boxMesh(x, y - 0.15, z, w, 0.3, d, this._mat.floor, false);
    this.floors.push({
      y,
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
    });
  }

  _wall(x, y, z, w, h, d) {
    return this._boxMesh(x, y, z, w, h, d, this._mat.wall, true);
  }

  _ceiling(x, z, w, d, y = 3.2) {
    this._boxMesh(x, y, z, w, 0.25, d, this._mat.dark, true);
  }

  _neonStrip(x, y, z, w, d, magenta = true) {
    const m = magenta ? this._mat.neonM : this._mat.neonC;
    const mesh = this._boxMesh(x, y, z, w, 0.08, d, m, false);
    const light = new THREE.PointLight(magenta ? NEON_MAGENTA : NEON_CYAN, 3.5, 18, 1.5);
    light.position.set(x, y - 0.2, z);
    this.group.add(light);
    return mesh;
  }

  _addWater(x, z, w, d, y = 0.15) {
    this._boxMesh(x, y, z, w, 0.05, d, this._mat.water, false);
    this.waterZones.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      slow: 0.55,
    });
  }

  _build() {
    // Bright readable graybox lighting (atmosphere can dim later)
    const amb = new THREE.AmbientLight(0xffffff, 1.6);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(8, 25, 5);
    this.scene.add(key);
    const fill = new THREE.HemisphereLight(0xb0c4de, 0x445055, 0.9);
    this.scene.add(fill);
    this.scene.background = new THREE.Color(0x2a3038);
    this.scene.fog = null;

    // ——— A: Spawn canal ladder ———
    // Corridor runs +Z deeper into the city
    this._floor(0, 0, 4, 8);
    this._wall(-2.2, 1.6, 0, 0.4, 3.2, 8);
    this._wall(2.2, 1.6, 0, 0.4, 3.2, 8);
    this._ceiling(0, 0, 4.8, 8);
    this._neonStrip(0, 2.9, -2, 2, 0.1, true);
    // Ladder visual
    this._boxMesh(-1.5, 1, -3, 0.1, 2, 0.1, this._mat.gate, false);
    this._boxMesh(-1.2, 1, -3, 0.1, 2, 0.1, this._mat.gate, false);
    for (let i = 0; i < 5; i++) {
      this._boxMesh(-1.35, 0.3 + i * 0.35, -3, 0.4, 0.05, 0.05, this._mat.gate, false);
    }
    // Tutorial crates
    this._boxMesh(1.2, 0.4, 1, 0.7, 0.8, 0.7, this._mat.crate, true);
    this._boxMesh(1.2, 0.4, 2.2, 0.6, 0.8, 0.6, this._mat.crate, true);
    // Water puddle
    this._addWater(0, 2.5, 3, 2);
    this.spawnPoints.A = new THREE.Vector3(0, 0, -2.5);

    // Bridges / connectors so floors don't gap
    this._floor(0, 5, 4, 4);           // A→B
    this._ceiling(0, 5, 4.8, 4);
    this._wall(-2.2, 1.6, 5, 0.4, 3.2, 4);
    this._wall(2.2, 1.6, 5, 0.4, 3.2, 4);

    // ——— B: Straight alley ———
    this._floor(0, 12, 3.6, 12);
    // Left wall with gap toward B1 (around z=10)
    this._wall(-2.0, 1.6, 7.5, 0.4, 3.2, 3);
    this._wall(-2.0, 1.6, 14.5, 0.4, 3.2, 7);
    this._wall(2.0, 1.6, 12, 0.4, 3.2, 12);
    this._ceiling(0, 12, 4.4, 12);
    this._neonStrip(-1.7, 2.5, 10, 0.1, 3, false);
    this._neonStrip(1.7, 2.5, 14, 0.1, 2, true);
    this.enemySpawns.push(
      { type: 'street', pos: new THREE.Vector3(-0.5, 0, 10), id: 'B1' },
      { type: 'street', pos: new THREE.Vector3(0.6, 0, 14), id: 'B2' },
    );

    // ——— B1: Dead-end storage (left) ———
    this._floor(-5, 10, 6, 4);
    this._wall(-8.2, 1.6, 10, 0.4, 3.2, 4);
    this._wall(-5, 1.6, 8.2, 6.4, 3.2, 0.4);
    this._wall(-5, 1.6, 11.8, 6.4, 3.2, 0.4);
    this._ceiling(-5, 10, 6.8, 4.4);
    // Opening from B: remove wall section conceptually — gap at x=-2
    // Side corridor connector
    this._floor(-3.2, 10, 2.5, 3.2);
    this._ceiling(-3.2, 10, 2.5, 3.2);
    this._boxMesh(-6.5, 0.35, 10, 0.5, 0.7, 0.5, this._mat.crate, true);
    this.interactables.push({
      id: 'loot_b1',
      type: 'loot',
      pos: new THREE.Vector3(-6.5, 0.5, 10),
      radius: 1.4,
      taken: false,
      label: '按 E 拾取 · 魂火＋燈芯',
      souls: 30,
      wicks: 1,
    });

    // ——— C: Crossroads ———
    this._floor(0, 22, 10, 8);
    this._wall(-5.2, 1.6, 22, 0.4, 3.2, 8);
    // Right wall with gap toward C1 (z≈24)
    this._wall(5.2, 1.6, 20.0, 0.4, 3.2, 3.5);
    this._wall(5.2, 1.6, 25.5, 0.4, 3.2, 2.5);
    // Back wall with gap for B
    this._wall(-3.5, 1.6, 18.2, 3.5, 3.2, 0.4);
    this._wall(3.5, 1.6, 18.2, 3.5, 3.2, 0.4);
    // Front wall with gap toward D (x≈0)
    this._wall(-3.5, 1.6, 25.8, 3.5, 3.2, 0.4);
    this._wall(3.5, 1.6, 25.8, 3.5, 3.2, 0.4);
    this._ceiling(0, 22, 10.8, 8.4);
    this._neonStrip(0, 3.0, 22, 4, 0.12, true);
    // Blocked "up" shortcut drop point marker (ceiling hole visual later)
    this.spawnPoints.shortcutDrop = new THREE.Vector3(0, 0, 20);

    // ——— C1: Flooded bend (right) → toward E ———
    this._floor(8, 24, 8, 5);
    this._wall(12.2, 1.6, 24, 0.4, 3.2, 5);
    this._wall(8, 1.6, 21.7, 8, 3.2, 0.4);
    this._wall(8, 1.6, 26.3, 5, 3.2, 0.4);
    this._ceiling(8, 24, 8.4, 5.4);
    this._addWater(8, 24, 7, 4);
    this.enemySpawns.push({ type: 'water', pos: new THREE.Vector3(9, 0, 24), id: 'C1w' });

    // Corridor C1 → E (along +Z from right side)
    this._floor(10, 30, 4, 8);
    this._wall(8.0, 1.6, 30, 0.4, 3.2, 8);
    this._wall(12.0, 1.6, 30, 0.4, 3.2, 8);
    this._ceiling(10, 30, 4.4, 8);
    this._addWater(10, 30, 3.5, 6);
    this._floor(10, 35, 4, 4); // C1→E
    this._ceiling(10, 35, 4.4, 4);
    this._wall(8.0, 1.6, 35, 0.4, 3.2, 4);
    this._wall(12.0, 1.6, 35, 0.4, 3.2, 4);

    // ——— D: Lamp room (forward from C) ———
    this._floor(0, 30, 5, 8);
    this._wall(-2.7, 1.6, 30, 0.4, 3.2, 8);
    this._wall(2.7, 1.6, 30, 0.4, 3.2, 8);
    this._ceiling(0, 30, 5.8, 8);
    // Broken lamp
    this._boxMesh(0, 2.6, 28, 0.3, 0.4, 0.3, this._mat.dark, false);
    const flicker = new THREE.PointLight(0xffaa66, 0.6, 8, 2);
    flicker.position.set(0, 2.4, 28);
    this.group.add(flicker);
    this._flickerLight = flicker;
    this.enemySpawns.push({ type: 'patrol', pos: new THREE.Vector3(0, 0, 32), id: 'D1' });

    // ——— Merge D + C1 into E antechamber ———
    this._floor(5, 38, 14, 10);
    // Left wall with gap to E1 shortcut room (z≈38)
    this._wall(-2.2, 1.6, 34.5, 0.4, 3.2, 3);
    this._wall(-2.2, 1.6, 41.5, 0.4, 3.2, 3);
    this._wall(12.2, 1.6, 38, 0.4, 3.2, 10);
    // Back wall with openings toward D (x≈0) and C1 corridor (x≈10)
    this._wall(-0.5, 1.6, 33.2, 3.5, 3.2, 0.4);
    this._wall(6.5, 1.6, 33.2, 4, 3.2, 0.4);
    this._wall(11, 1.6, 33.2, 2.5, 3.2, 0.4);

    this._ceiling(5, 38, 14.8, 10.4);
    this._neonStrip(2, 2.9, 38, 0.15, 5, false);
    this._neonStrip(8, 2.9, 40, 0.15, 4, true);
    this.enemySpawns.push(
      { type: 'street', pos: new THREE.Vector3(2, 0, 36), id: 'E1e' },
      { type: 'patrol', pos: new THREE.Vector3(6, 0, 39), id: 'E2e' },
      { type: 'street', pos: new THREE.Vector3(9, 0, 37), id: 'E3e' },
    );

    // ——— E1: Fire-hose shortcut switch (side room) ———
    this._floor(-5, 38, 5, 5);
    this._wall(-7.7, 1.6, 38, 0.4, 3.2, 5);
    this._wall(-5, 1.6, 35.7, 5.4, 3.2, 0.4);
    this._wall(-5, 1.6, 40.3, 5.4, 3.2, 0.4);
    this._ceiling(-5, 38, 5.8, 5.4);
    // Connector from E
    this._floor(-2.5, 38, 3, 3);
    this._ceiling(-2.5, 38, 3, 3);
    const hose = this._boxMesh(-5.5, 1.2, 38, 0.4, 1.5, 0.4, this._mat.gate, false);
    hose.userData.isHose = true;
    this.interactables.push({
      id: 'shortcut',
      type: 'shortcut',
      pos: new THREE.Vector3(-5.5, 1, 38),
      radius: 1.8,
      label: '按 E 打開消防喉蓋（捷徑）',
      doneLabel: '捷徑已開啟 — 可從茶檔跳返渠口',
      mesh: hose,
    });

    // ——— F: Boss porch ———
    this._floor(5, 48, 6, 8);
    this._wall(1.8, 1.6, 48, 0.4, 3.2, 8);
    this._wall(8.2, 1.6, 48, 0.4, 3.2, 8);
    this._ceiling(5, 48, 6.8, 8);
    // Fire brazier hint
    this._boxMesh(3, 0.5, 46, 0.6, 1, 0.6, this._mat.crate, true);
    const braze = new THREE.PointLight(0xff6622, 1.5, 9, 2);
    braze.position.set(3, 1.2, 46);
    this.group.add(braze);
    this._boxMesh(3, 1.1, 46, 0.35, 0.2, 0.35, this._mat.glow, false);
    this._addWater(5, 50, 5, 4);

    // ——— H: Boss arena ———
    this._floor(5, 58, 14, 14);
    this._wall(-2.2, 1.6, 58, 0.4, 3.4, 14);
    this._wall(12.2, 1.6, 58, 0.4, 3.4, 14);
    // Boss arena entrance opening
    this._wall(1, 1.6, 51.2, 6, 3.4, 0.4);
    this._wall(10, 1.6, 51.2, 4.5, 3.4, 0.4);
    this._wall(5, 1.6, 64.8, 14.8, 3.4, 0.4);
    this._ceiling(5, 58, 14.8, 14.4, 3.6);
    // Pillars
    for (const [px, pz] of [[0, 54], [10, 54], [0, 62], [10, 62]]) {
      this._boxMesh(px, 1.5, pz, 1.2, 3, 1.2, this._mat.wall, true);
    }
    this._addWater(5, 58, 10, 10);
    this.spawnPoints.boss = new THREE.Vector3(5, 0, 58);
    this.enemySpawns.push({ type: 'boss', pos: new THREE.Vector3(5, 0, 60), id: 'boss' });
    // Arena trigger zone
    this.bossTrigger = {
      minX: -1, maxX: 11, minZ: 52, maxZ: 64,
    };

    // ——— G: Tea stall (after boss, +Z past arena) ———
    this._floor(5, 70, 8, 8);
    this._wall(0.8, 1.6, 70, 0.4, 3.2, 8);
    this._wall(9.2, 1.6, 70, 0.4, 3.2, 8);
    this._ceiling(5, 70, 8.8, 8);
    // Opening from H
    this._wall(2, 1.6, 66.2, 4, 3.2, 0.4);
    this._wall(8.5, 1.6, 66.2, 3, 3.2, 0.4);
    // Tea stall furniture
    this._boxMesh(5, 0.55, 71, 2.5, 1.1, 1.2, this._mat.wood, true);
    this._boxMesh(5, 1.4, 71, 0.3, 0.5, 0.3, this._mat.glow, false);
    const teaLight = new THREE.PointLight(0xffcc66, 2.2, 12, 2);
    teaLight.position.set(5, 2.2, 71);
    this.group.add(teaLight);
    // Lantern / 阿婆 marker
    this._boxMesh(3.5, 0.9, 72.5, 0.5, 1.8, 0.5, this._mat.wood, true);
    this.interactables.push({
      id: 'bonfire',
      type: 'bonfire',
      pos: new THREE.Vector3(5, 1, 71),
      radius: 2.2,
      label: '按 E 休息 · 阿婆茶檔',
    });
    this.spawnPoints.G = new THREE.Vector3(5, 0, 69);

    // Shortcut drop shaft from G area to A (when open)
    // Vertical shaft near tea stall left
    this._floor(-2, 70, 4, 4);
    this._wall(-4.2, 4, 70, 0.4, 8, 4);
    this._wall(0, 4, 68.2, 4.4, 8, 0.4);
    this._wall(0, 4, 71.8, 4.4, 8, 0.4);
    // Hole in floor when shortcut open — use a platform we remove
    this.shortcutPlatform = this._boxMesh(-2, -0.05, 70, 3.5, 0.2, 3.5, this._mat.floor, false);
    this.shortcutFloor = {
      y: 0,
      minX: -3.75, maxX: -0.25,
      minZ: 68.25, maxZ: 71.75,
    };
    this.floors.push(this.shortcutFloor);
    // Landing near A — open shaft visual at C "up"
    this.interactables.push({
      id: 'shortcut_jump',
      type: 'shortcut_use',
      pos: new THREE.Vector3(-2, 0.5, 70),
      radius: 2.0,
      label: '按 E 沿捷徑跳返渠口',
    });

    // ——— I: Gate placeholder ———
    this._floor(5, 78, 6, 6);
    this._wall(1.8, 1.6, 78, 0.4, 3.2, 6);
    this._wall(8.2, 1.6, 78, 0.4, 3.2, 6);
    this._wall(5, 1.6, 80.8, 6.8, 3.2, 0.4);
    this._ceiling(5, 78, 6.8, 6);
    this._boxMesh(5, 1.5, 80.5, 4, 3, 0.3, this._mat.gate, true);
    this.interactables.push({
      id: 'gate',
      type: 'gate',
      pos: new THREE.Vector3(5, 1, 79),
      radius: 2.5,
      label: '鐵閘 · 即將開放（藥材街）',
    });

    // Connect C forward to D — ensure floor bridge
    this._floor(0, 26, 4, 4);

    // Connect E forward to F
    this._floor(5, 44, 6, 4);
    this._wall(1.8, 1.6, 44, 0.4, 3.2, 4);
    this._wall(8.2, 1.6, 44, 0.4, 3.2, 4);
    this._ceiling(5, 44, 6.8, 4);

    // Block back of A
    this._wall(0, 1.6, -4.2, 4.8, 3.2, 0.4);
  }

  getGroundY(x, z) {
    let best = null;
    for (const f of this.floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) {
        if (best === null || f.y > best) best = f.y;
      }
    }
    return best;
  }

  inWater(x, z) {
    for (const w of this.waterZones) {
      if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) return w;
    }
    return null;
  }

  deepenBossWater(active) {
    // Visual: already have water; gameplay slow factor bumped in main when boss P2
    this.bossWaterDeep = active;
  }

  openShortcut() {
    if (this.shortcutOpen) return false;
    this.shortcutOpen = true;
    // Remove platform so player can "fall" via interact teleport (safer for prototype)
    if (this.shortcutPlatform) {
      this.shortcutPlatform.visible = false;
    }
    // Remove shortcut floor from walkable so it's a hole (optional)
    const idx = this.floors.indexOf(this.shortcutFloor);
    if (idx >= 0) this.floors.splice(idx, 1);
    return true;
  }

  update(dt, time) {
    if (this._flickerLight) {
      this._flickerLight.intensity = 0.35 + Math.sin(time * 7) * 0.25 + Math.random() * 0.1;
    }
  }
}
