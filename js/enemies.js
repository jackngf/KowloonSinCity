import * as THREE from 'three';
import { resolveXZ } from './level.js';

class EnemyBase {
  constructor(scene, level, spawn) {
    this.level = level;
    this.id = spawn.id;
    this.spawnPos = spawn.pos.clone();
    this.type = spawn.type;
    this.alive = true;
    this.hp = 40;
    this.maxHp = 40;
    this.posture = 0;
    this.maxPosture = 50;
    this.postureBroken = false;
    this.postureBreakTimer = 0;
    this.radius = 0.4;
    this.aggroRange = 8;
    this.attackRange = 1.6;
    this.speed = 2.8;
    this.state = 'idle';
    this.stateTime = 0;
    this.attackCd = 0;
    this.hitFlash = 0;
    this.facing = new THREE.Vector3(0, 0, 1);
    this.soulValue = 20;
    this.damage = 12;
    this.windup = 0.35;
    this.recover = 0.4;
    this.mesh = new THREE.Group();
    scene.add(this.mesh);
    this.mesh.position.copy(this.spawnPos);
    this._buildMesh();
  }

  get position() { return this.mesh.position; }

  _buildMesh() {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.7, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a7080, roughness: 0.85 }),
    );
    body.position.y = 0.75;
    body.castShadow = true;
    this.body = body;
    this.mesh.add(body);
  }

  reset() {
    if (this.type === 'boss' && this.level.bossDefeated) return;
    this.alive = true;
    this.hp = this.maxHp;
    this.posture = 0;
    this.postureBroken = false;
    this.state = 'idle';
    this.stateTime = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.spawnPos);
    this.mesh.position.y = 0;
  }

  applyHit(dmg, posture, riposte = false) {
    if (!this.alive) return;
    if (riposte || this.postureBroken) {
      this.hp -= dmg;
      this.postureBroken = false;
      this.posture = 0;
      this.state = 'hitstun';
      this.stateTime = 0.5;
    } else {
      this.hp -= dmg;
      this.posture = Math.min(this.maxPosture, this.posture + posture);
      this.state = 'hitstun';
      this.stateTime = 0.25;
      if (this.posture >= this.maxPosture) {
        this.postureBroken = true;
        this.postureBreakTimer = 2.2;
        this.state = 'broken';
        this.stateTime = 2.2;
      }
    }
    this.hitFlash = 0.15;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.mesh.visible = false;
    this.state = 'dead';
  }

  update(dt, player) {
    if (!this.alive) return null;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateTime = Math.max(0, this.stateTime - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.body) {
      this.body.material.emissive = this.body.material.emissive || new THREE.Color(0);
      this.body.material.emissive.set(this.hitFlash > 0 ? 0x442222 : 0x000000);
    }

    if (this.postureBroken) {
      this.postureBreakTimer -= dt;
      if (this.postureBreakTimer <= 0) {
        this.postureBroken = false;
        this.posture = this.maxPosture * 0.3;
        this.state = 'idle';
      }
      return null;
    }

    if (this.state === 'hitstun') {
      if (this.stateTime <= 0) this.state = 'idle';
      return null;
    }

    const toP = player.position.clone().sub(this.position);
    toP.y = 0;
    const dist = toP.length();
    let event = null;

    if (this.state === 'windup') {
      if (this.stateTime <= 0) {
        this.state = 'strike';
        this.stateTime = 0.18;
        event = this._strikeEvent(player, dist);
      }
      return event;
    }
    if (this.state === 'strike') {
      if (this.stateTime <= 0) {
        this.state = 'recover';
        this.stateTime = this.recover;
      }
      return null;
    }
    if (this.state === 'recover') {
      if (this.stateTime <= 0) this.state = 'idle';
      return null;
    }

    // Chase / attack
    if (dist < this.aggroRange && player.isAlive()) {
      if (dist > this.attackRange) {
        const dir = toP.normalize();
        this.facing.copy(dir);
        this.position.x += dir.x * this.speed * dt;
        this.position.z += dir.z * this.speed * dt;
        resolveXZ(this.position, this.radius, this.level.colliders);
        const gy = this.level.getGroundY(this.position.x, this.position.z);
        if (gy !== null) this.position.y = gy;
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      } else if (this.attackCd <= 0) {
        this.state = 'windup';
        this.stateTime = this.windup;
        this.attackCd = 1.4 + Math.random() * 0.6;
        this.facing.copy(toP.normalize());
        this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);
      }
    } else {
      // idle wander lightly toward spawn
      const home = this.spawnPos.clone().sub(this.position);
      home.y = 0;
      if (home.length() > 1.5) {
        home.normalize();
        this.position.x += home.x * this.speed * 0.4 * dt;
        this.position.z += home.z * this.speed * 0.4 * dt;
        resolveXZ(this.position, this.radius, this.level.colliders);
      }
    }
    return null;
  }

  _strikeEvent(player, dist) {
    if (dist < this.attackRange + 0.4 && player.isAlive()) {
      return { type: 'damage', amount: this.damage, unblockable: false, source: this };
    }
    return null;
  }
}

export class StreetGhost extends EnemyBase {
  constructor(scene, level, spawn) {
    super(scene, level, spawn);
    this.hp = this.maxHp = 35;
    this.damage = 10;
    this.speed = 3.2;
    this.soulValue = 18;
    this.body.material.color.set(0x7a8088);
    // stool weapon
    const stool = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.15, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x5a4030 }),
    );
    stool.position.set(0.4, 0.9, 0.3);
    this.mesh.add(stool);
  }
}

export class PatrolSweeper extends EnemyBase {
  constructor(scene, level, spawn) {
    super(scene, level, spawn);
    this.hp = this.maxHp = 55;
    this.damage = 18;
    this.speed = 2.2;
    this.windup = 0.5;
    this.recover = 0.55;
    this.attackRange = 1.9;
    this.soulValue = 28;
    this.maxPosture = 60;
    this.body.material.color.set(0x4a5560);
    this.body.scale.set(1.1, 1.15, 1.1);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x333840, metalness: 0.4 }),
    );
    stick.rotation.z = Math.PI / 4;
    stick.position.set(0.45, 1.0, 0.2);
    this.mesh.add(stick);
  }
}

export class WaterGhost extends EnemyBase {
  constructor(scene, level, spawn) {
    super(scene, level, spawn);
    this.hp = this.maxHp = 40;
    this.damage = 16;
    this.speed = 3.6;
    this.aggroRange = 6;
    this.attackRange = 2.0;
    this.windup = 0.28;
    this.soulValue = 25;
    this.lurking = true;
    this.body.material.color.set(0x2a4050);
    this.body.material.transparent = true;
    this.body.material.opacity = 0.55;
    this.mesh.position.y = -0.3;
  }

  update(dt, player) {
    if (!this.alive) return null;
    const inW = this.level.inWater(this.position.x, this.position.z);
    if (this.lurking) {
      const dist = player.position.distanceTo(this.position);
      this.mesh.position.y = -0.35 + Math.sin(performance.now() * 0.003) * 0.05;
      if (dist < 4.5 && player.isAlive()) {
        this.lurking = false;
        this.body.material.opacity = 1;
        this.mesh.position.y = 0;
        // lunge telegraph
        this.state = 'windup';
        this.stateTime = 0.25;
        this.attackCd = 0.5;
      }
      return null;
    }
    return super.update(dt, player);
  }

  reset() {
    super.reset();
    this.lurking = true;
    this.body.material.opacity = 0.55;
  }
}

export class Lockthroat extends EnemyBase {
  constructor(scene, level, spawn) {
    super(scene, level, spawn);
    this.hp = this.maxHp = 280;
    this.damage = 22;
    this.speed = 2.4;
    this.aggroRange = 16;
    this.attackRange = 2.8;
    this.soulValue = 200;
    this.maxPosture = 100;
    this.radius = 0.65;
    this.phase2 = false;
    this.moveName = '';
    this.engaged = false;
    this.chargeDir = new THREE.Vector3();
    this.spinHits = 0;
  }

  _buildMesh() {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45, 1.1, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a3540, roughness: 0.75 }),
    );
    body.position.y = 1.15;
    body.castShadow = true;
    this.body = body;
    this.mesh.add(body);
    // Mask
    const mask = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.45, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.3 }),
    );
    mask.position.set(0, 1.55, 0.35);
    this.mesh.add(mask);
    // Chain arm
    this.chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x555860, metalness: 0.7, roughness: 0.35 }),
    );
    this.chain.rotation.z = Math.PI / 2;
    this.chain.position.set(0.9, 1.2, 0.3);
    this.mesh.add(this.chain);
  }

  die() {
    super.die();
    this.level.bossDefeated = true;
  }

  update(dt, player) {
    if (!this.alive) return null;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateTime = Math.max(0, this.stateTime - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.body) {
      this.body.material.emissive.set(this.hitFlash > 0 ? 0x551010 : 0x000000);
    }

    if (!this.phase2 && this.hp / this.maxHp < 0.4) {
      this.phase2 = true;
      this.level.deepenBossWater(true);
      this.speed = 2.8;
    }

    if (this.postureBroken) {
      this.postureBreakTimer -= dt;
      if (this.postureBreakTimer <= 0) {
        this.postureBroken = false;
        this.posture = this.maxPosture * 0.25;
        this.state = 'idle';
      }
      return null;
    }

    if (this.state === 'hitstun') {
      if (this.stateTime <= 0) this.state = 'idle';
      return null;
    }

    const toP = player.position.clone().sub(this.position);
    toP.y = 0;
    const dist = toP.length();

    // Engage when player in arena
    if (!this.engaged) {
      const t = this.level.bossTrigger;
      const p = player.position;
      if (p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ) {
        this.engaged = true;
      } else {
        return null;
      }
    }

    // Special states
    if (this.state === 'windup') {
      // Telegraph: raise chain
      this.chain.rotation.y += dt * 2;
      if (this.stateTime <= 0) {
        this.state = 'strike';
        this.stateTime = this._strikeDuration();
        this.spinHits = 0;
        this.strikeHit = false;
        return this._beginStrike(player);
      }
      return null;
    }

    if (this.state === 'strike') {
      const ev = this._duringStrike(dt, player, dist, toP);
      if (this.stateTime <= 0) {
        if (this.moveName === 'charge' && this._hitWall()) {
          this.state = 'stunned';
          this.stateTime = 1.1;
        } else {
          this.state = 'recover';
          this.stateTime = this.moveName === 'spin' ? 1.0 : 0.55;
        }
      }
      return ev;
    }

    if (this.state === 'stunned' || this.state === 'recover') {
      if (this.stateTime <= 0) this.state = 'idle';
      return null;
    }

    // Approach & pick move
    if (dist > 2.5) {
      const dir = toP.clone().normalize();
      this.facing.copy(dir);
      this.position.x += dir.x * this.speed * dt;
      this.position.z += dir.z * this.speed * dt;
      resolveXZ(this.position, this.radius, this.level.colliders);
      const gy = this.level.getGroundY(this.position.x, this.position.z);
      if (gy !== null) this.position.y = gy;
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }

    if (this.attackCd <= 0 && dist < 9 && player.isAlive()) {
      this.moveName = this._pickMove(dist);
      this.state = 'windup';
      this.stateTime = this._windupTime();
      this.attackCd = this.phase2 ? 1.1 : 1.6;
      this.facing.copy(toP.normalize());
      this.chargeDir.copy(this.facing);
      this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);
    }
    return null;
  }

  _pickMove(dist) {
    const r = Math.random();
    if (this.phase2 && r < 0.28) return 'spin';
    if (dist < 2.0 && r < 0.35) return 'grab';
    if (dist > 3.5 && r < 0.45) return 'charge';
    if (r < 0.55) return 'sweep';
    return 'slam';
  }

  _windupTime() {
    switch (this.moveName) {
      case 'sweep': return 0.45;
      case 'slam': return 0.3;
      case 'charge': return 0.65;
      case 'grab': return 0.4;
      case 'spin': return 0.7;
      default: return 0.4;
    }
  }

  _strikeDuration() {
    switch (this.moveName) {
      case 'sweep': return 0.35;
      case 'slam': return 0.25;
      case 'charge': return 0.55;
      case 'grab': return 0.3;
      case 'spin': return 1.1;
      default: return 0.3;
    }
  }

  _beginStrike(player) {
    return { type: 'bossTelegraph', move: this.moveName };
  }

  _duringStrike(dt, player, dist, toP) {
    if (this.moveName === 'charge') {
      this.position.x += this.chargeDir.x * 14 * dt;
      this.position.z += this.chargeDir.z * 14 * dt;
      resolveXZ(this.position, this.radius, this.level.colliders);
      if (!this.strikeHit && dist < 1.5) {
        this.strikeHit = true;
        return { type: 'damage', amount: 28, unblockable: false, source: this, move: 'charge' };
      }
      return null;
    }
    if (this.moveName === 'spin') {
      this.mesh.rotation.y += dt * 10;
      this.chain.rotation.y += dt * 14;
      // hit twice max during spin
      if (dist < 3.2 && this.spinHits < 2 && this.stateTime < 0.9 && this.stateTime > 0.2) {
        this.spinHits += 1;
        return { type: 'damage', amount: 20, unblockable: false, source: this, move: 'spin' };
      }
      return null;
    }
    // One-shot hits for sweep/slam/grab at start of strike
    if (!this.strikeHit && this.stateTime > this._strikeDuration() - 0.12) {
      if (this.moveName === 'grab' && dist < 2.2) {
        this.strikeHit = true;
        return { type: 'damage', amount: 35, unblockable: true, source: this, move: 'grab' };
      }
      if (this.moveName === 'sweep' && dist < 3.0) {
        this.strikeHit = true;
        return { type: 'damage', amount: 22, unblockable: false, source: this, move: 'sweep' };
      }
      if (this.moveName === 'slam' && dist < 2.4) {
        this.strikeHit = true;
        return { type: 'damage', amount: 24, unblockable: false, source: this, move: 'slam' };
      }
    }
    return null;
  }

  _hitWall() {
    // Check if near arena walls
    const p = this.position;
    return p.x < -1.2 || p.x > 11.2 || p.z < 52.5 || p.z > 64.2;
  }
}

export function createEnemy(scene, level, spawn) {
  switch (spawn.type) {
    case 'street': return new StreetGhost(scene, level, spawn);
    case 'patrol': return new PatrolSweeper(scene, level, spawn);
    case 'water': return new WaterGhost(scene, level, spawn);
    case 'boss': return new Lockthroat(scene, level, spawn);
    default: return new StreetGhost(scene, level, spawn);
  }
}
