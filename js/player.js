import * as THREE from 'three';
import { resolveXZ } from './level.js';

export class Player {
  constructor(scene, level) {
    this.level = level;
    this.maxHp = 100;
    this.hp = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.stamRegen = 28;
    this.stamRegenDelay = 0;
    this.wicks = 3;
    this.maxWicks = 3;
    this.souls = 0;
    this.weaponName = '鏽廚刀';
    this.hasChainWhip = false;

    this.radius = 0.35;
    this.height = 1.7;
    this.speed = 4.2;
    this.sprintMul = 1.55;
    this.yaw = 0;
    this.pitch = 0.15;

    this.state = 'idle'; // idle, attack, heavy, dodge, block, hitstun, dead, riposte
    this.stateTime = 0;
    this.iFrames = 0;
    this.blocking = false;
    this.perfectBlockWindow = 0;
    this.attackHit = false;
    this.facing = new THREE.Vector3(0, 0, 1);
    this.vel = new THREE.Vector3();
    this.deathSoulsDropped = 0;
    this.pendingInteract = false;

    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.7 }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    this.mesh.add(body);
    // Simple weapon
    this.weaponMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x666870, metalness: 0.5, roughness: 0.4 }),
    );
    this.weaponMesh.position.set(0.35, 0.9, 0.35);
    this.mesh.add(this.weaponMesh);
    scene.add(this.mesh);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
    this.camDist = 5.5;
    this.camHeight = 2.0;

    const sp = level.spawnPoints.A.clone();
    this.mesh.position.copy(sp);
    this.respawnPos = sp.clone();
  }

  equipChainWhip() {
    this.hasChainWhip = true;
    this.weaponName = '鏽鐵鏈鞭';
    this.weaponMesh.scale.set(1, 1, 1.4);
    this.weaponMesh.material.color.set(0x445566);
  }

  get position() { return this.mesh.position; }

  isAlive() { return this.state !== 'dead'; }

  takeDamage(amount, opts = {}) {
    if (this.iFrames > 0 || this.state === 'dead') return { blocked: false, dmg: 0 };
    if (opts.unblockable) {
      this.hp -= amount;
      this.iFrames = 0.55;
      this._enterHitstun(0.45);
      return { blocked: false, dmg: amount };
    }
    if (this.blocking && this.stamina > 0) {
      const perfect = this.perfectBlockWindow > 0;
      const drain = perfect ? amount * 0.15 : amount * 0.45;
      this.stamina = Math.max(0, this.stamina - drain);
      const dmg = perfect ? amount * 0.05 : amount * 0.35;
      this.hp -= dmg;
      if (this.stamina <= 0) {
        this.blocking = false;
        this._enterHitstun(0.5);
      }
      this.iFrames = perfect ? 0.25 : 0.12;
      return { blocked: true, perfect, dmg, postureDmg: perfect ? 35 : 12 };
    }
    this.hp -= amount;
    this.iFrames = 0.4;
    this._enterHitstun(0.35);
    return { blocked: false, dmg: amount };
  }

  _enterHitstun(t) {
    if (this.state === 'dead') return;
    this.state = 'hitstun';
    this.stateTime = t;
    this.blocking = false;
  }

  kill() {
    this.state = 'dead';
    this.stateTime = 2.2;
    this.hp = 0;
    this.deathSoulsDropped = this.souls;
    this.souls = 0;
  }

  respawn() {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.state = 'idle';
    this.stateTime = 0;
    this.iFrames = 1.0;
    this.mesh.position.copy(this.respawnPos);
    this.mesh.position.y = 0;
  }

  restAtBonfire(pos) {
    this.respawnPos.copy(pos);
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.wicks = this.maxWicks;
  }

  useWick() {
    if (this.wicks <= 0 || this.state === 'dead' || this.hp >= this.maxHp) return false;
    if (this.state === 'attack' || this.state === 'heavy' || this.state === 'dodge') return false;
    this.wicks -= 1;
    this.hp = Math.min(this.maxHp, this.hp + 45);
    this.stamRegenDelay = 0.3;
    return true;
  }

  update(dt, input, enemies) {
    if (this.state === 'dead') {
      this.stateTime -= dt;
      return { justDied: false, deathFinished: this.stateTime <= 0 };
    }

    let justDied = false;
    this.stateTime = Math.max(0, this.stateTime - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.perfectBlockWindow = Math.max(0, this.perfectBlockWindow - dt);
    this.stamRegenDelay = Math.max(0, this.stamRegenDelay - dt);

    // Camera look
    const md = input.consumeMouseDelta();
    this.yaw -= md.x * 0.0022;
    this.pitch -= md.y * 0.0022;
    this.pitch = Math.max(-0.5, Math.min(0.85, this.pitch));

    // Edge keys
    if (!this._edges) this._edges = {};
    const dodgePressed = input.edge(this._edges, 'Space');
    const heavyPressed = input.edge(this._edges, 'KeyF');
    const interactPressed = input.edge(this._edges, 'KeyE');
    const wickPressed = input.edge(this._edges, 'KeyR');
    const lightPressed = input.consumeClick('left');
    this.pendingInteract = interactPressed;

    if (wickPressed) this.useWick();

    // State machine exits
    if ((this.state === 'attack' || this.state === 'heavy' || this.state === 'dodge' || this.state === 'hitstun' || this.state === 'riposte') && this.stateTime <= 0) {
      this.state = 'idle';
      this.attackHit = false;
    }

    // Block
    const wantBlock = input.mouse.right && this.stamina > 5;
    if (wantBlock && (this.state === 'idle' || this.state === 'block')) {
      if (!this.blocking) this.perfectBlockWindow = 0.22;
      this.blocking = true;
      this.state = 'block';
      this.stamina -= 8 * dt;
      this.stamRegenDelay = 0.15;
    } else if (this.state === 'block') {
      this.blocking = false;
      this.state = 'idle';
    } else {
      this.blocking = false;
    }

    // Attacks / dodge from idle/block
    if ((this.state === 'idle' || this.state === 'block') && dodgePressed && this.stamina >= 22) {
      this.state = 'dodge';
      this.stateTime = 0.42;
      this.iFrames = 0.28;
      this.stamina -= 22;
      this.stamRegenDelay = 0.35;
      this.blocking = false;
      // Dodge direction from move or facing
      const move = this._moveVec(input);
      if (move.lengthSq() > 0.01) this._dodgeDir = move.normalize();
      else this._dodgeDir = this.facing.clone();
    } else if ((this.state === 'idle' || this.state === 'block') && heavyPressed && this.stamina >= 28) {
      this.state = 'heavy';
      this.stateTime = 0.72;
      this.attackHit = false;
      this.stamina -= 28;
      this.stamRegenDelay = 0.4;
      this.blocking = false;
    } else if ((this.state === 'idle' || this.state === 'block') && lightPressed && this.stamina >= 14) {
      this.state = 'attack';
      this.stateTime = 0.38;
      this.attackHit = false;
      this.stamina -= 14;
      this.stamRegenDelay = 0.28;
      this.blocking = false;
    }

    // Movement
    const inWater = this.level.inWater(this.position.x, this.position.z);
    let slow = inWater ? inWater.slow : 1;
    if (this.level.bossWaterDeep && inWater) slow *= 0.7;

    const sprinting = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    let move = this._moveVec(input);

    if (this.state === 'dodge') {
      const sp = 9 * dt;
      this.position.x += this._dodgeDir.x * sp;
      this.position.z += this._dodgeDir.z * sp;
    } else if (this.state === 'hitstun' || this.state === 'riposte') {
      // little movement
    } else if (this.state === 'attack' || this.state === 'heavy') {
      // slight commit forward
      const commit = this.state === 'heavy' ? 1.2 : 2.0;
      this.position.x += this.facing.x * commit * dt;
      this.position.z += this.facing.z * commit * dt;
    } else if (this.state !== 'block' || move.lengthSq() > 0.01) {
      if (move.lengthSq() > 0.01) {
        move.normalize();
        let spd = this.speed * slow;
        if (sprinting && this.stamina > 0 && this.state === 'idle') {
          spd *= this.sprintMul;
          this.stamina -= 18 * dt;
          this.stamRegenDelay = 0.2;
        }
        if (this.blocking) spd *= 0.45;
        this.position.x += move.x * spd * dt;
        this.position.z += move.z * spd * dt;
        this.facing.lerp(move, 0.25).normalize();
      }
    }

    // Collision
    resolveXZ(this.position, this.radius, this.level.colliders);

    // Ground
    const gy = this.level.getGroundY(this.position.x, this.position.z);
    if (gy === null) {
      // Fell in hole — if shortcut, teleport to A
      if (this.level.shortcutOpen) {
        this.position.copy(this.level.spawnPoints.A);
      } else {
        this.position.y = 0;
        // pull back
        this.position.x = THREE.MathUtils.clamp(this.position.x, -2, 12);
      }
    } else {
      this.position.y = gy;
    }

    // Facing yaw from camera when moving with WASD relative
    this.mesh.rotation.y = Math.atan2(this.facing.x, this.facing.z);

    // Weapon swing anim
    if (this.state === 'attack') {
      const t = 1 - this.stateTime / 0.38;
      this.weaponMesh.rotation.x = -Math.sin(t * Math.PI) * 1.2;
    } else if (this.state === 'heavy') {
      const t = 1 - this.stateTime / 0.72;
      this.weaponMesh.rotation.x = -Math.sin(t * Math.PI) * 1.8;
    } else {
      this.weaponMesh.rotation.x *= 0.8;
    }

    // Attack hit detection
    const hits = [];
    if ((this.state === 'attack' || this.state === 'heavy') && !this.attackHit) {
      const windup = this.state === 'heavy' ? 0.35 : 0.12;
      const elapsed = (this.state === 'heavy' ? 0.72 : 0.38) - this.stateTime;
      if (elapsed >= windup) {
        const range = this.hasChainWhip ? (this.state === 'heavy' ? 3.2 : 2.6) : (this.state === 'heavy' ? 2.2 : 1.7);
        const origin = this.position.clone().add(new THREE.Vector3(0, 1, 0));
        for (const e of enemies) {
          if (!e.alive) continue;
          const to = e.position.clone().sub(this.position);
          to.y = 0;
          const dist = to.length();
          if (dist > range + e.radius) continue;
          const dir = to.clone().normalize();
          if (dir.dot(this.facing) < 0.25 && dist > 0.8) continue;
          const dmg = this.state === 'heavy' ? (this.hasChainWhip ? 38 : 32) : (this.hasChainWhip ? 16 : 14);
          const posture = this.state === 'heavy' ? 28 : 10;
          hits.push({ enemy: e, dmg, posture });
        }
        if (hits.length) this.attackHit = true;
      }
    }

    // Riposte
    if (this.state === 'idle' && lightPressed) {
      for (const e of enemies) {
        if (e.alive && e.postureBroken && e.position.distanceTo(this.position) < 2.2) {
          this.state = 'riposte';
          this.stateTime = 0.55;
          hits.push({ enemy: e, dmg: 55, posture: 0, riposte: true });
          break;
        }
      }
    }

    // Stamina regen
    if (this.stamRegenDelay <= 0 && this.state !== 'block' && this.state !== 'dodge') {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.stamRegen * dt);
    }
    this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina));

    if (this.hp <= 0 && this.state !== 'dead') {
      this.kill();
      justDied = true;
    }

    this._updateCamera();
    return { justDied, hits, deathFinished: false };
  }

  _moveVec(input) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (input.pressed('KeyW')) move.add(forward);
    if (input.pressed('KeyS')) move.sub(forward);
    if (input.pressed('KeyD')) move.add(right);
    if (input.pressed('KeyA')) move.sub(right);
    return move;
  }

  _updateCamera() {
    const ox = Math.sin(this.yaw) * this.camDist;
    const oz = Math.cos(this.yaw) * this.camDist;
    const oy = this.camHeight + Math.sin(this.pitch) * 2.5;
    const target = this.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const desired = target.clone().add(new THREE.Vector3(ox, oy - 1.2, oz));
    // Soft follow
    this.camera.position.lerp(desired, 0.15);
    this.camera.lookAt(target);
  }
}
