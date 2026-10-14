import * as THREE from 'three';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { createEnemy } from './enemies.js';

const canvas = document.getElementById('game');
const startScreen = document.getElementById('start-screen');
const btnStart = document.getElementById('btn-start');

let started = false;
let renderer, scene, level, player, input, ui, enemies;
let soulOrb = null; // { mesh, souls, pos }
let clock = new THREE.Clock();
let deathPending = false;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  scene = new THREE.Scene();
  level = new Level(scene);
  player = new Player(scene, level);
  input = new Input(canvas);
  ui = new UI();

  enemies = level.enemySpawns.map((s) => createEnemy(scene, level, s));

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  if (player) {
    player.camera.aspect = w / h;
    player.camera.updateProjectionMatrix();
  }
}

function dropSoulOrb(pos, amount) {
  clearSoulOrb();
  if (amount <= 0) return;
  const geo = new THREE.SphereGeometry(0.35, 12, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.5,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.position.y = 0.6;
  scene.add(mesh);
  const light = new THREE.PointLight(0xffcc44, 1.2, 5);
  light.position.copy(mesh.position);
  scene.add(light);
  soulOrb = { mesh, light, souls: amount, pos: pos.clone() };
}

function clearSoulOrb() {
  if (!soulOrb) return;
  scene.remove(soulOrb.mesh);
  scene.remove(soulOrb.light);
  soulOrb = null;
}

function respawnEnemies() {
  for (const e of enemies) {
    if (e.type === 'boss') {
      if (!level.bossDefeated) {
        // Boss stays dead only if defeated; otherwise reset if player rested? GDD: Boss 唔刷新（除非休息）
        // On bonfire rest, boss DOES reset if not defeated... actually "Boss 唔刷新（除非休息）" means boss doesn't refresh on death respawn, only on rest.
        // On player death respawn: don't reset boss HP if still alive / mid fight — actually typical souls: boss resets on death if not killed.
        // Souls-like: dying mid-boss resets the boss. Bonfire rest also resets. Once killed, stays dead.
        if (!e.alive && level.bossDefeated) continue;
        e.reset();
        e.engaged = false;
        e.phase2 = false;
        level.deepenBossWater(false);
      }
      continue;
    }
    e.reset();
  }
}

function onPlayerDeathRespawnOnly() {
  // Soft respawn: refresh trash, reset boss if not defeated
  for (const e of enemies) {
    if (e.type === 'boss') {
      if (!level.bossDefeated) {
        e.reset();
        e.engaged = false;
        e.phase2 = false;
        level.deepenBossWater(false);
      }
      continue;
    }
    e.reset();
  }
}

function handleInteract() {
  if (!player.pendingInteract) return;
  const p = player.position;

  // Soul orb
  if (soulOrb && p.distanceTo(soulOrb.pos) < 1.8) {
    player.souls += soulOrb.souls;
    ui.toastMsg(`取回魂火 ×${soulOrb.souls}`);
    clearSoulOrb();
    return;
  }

  for (const it of level.interactables) {
    if (p.distanceTo(it.pos) > it.radius) continue;

    if (it.type === 'loot' && !it.taken) {
      it.taken = true;
      player.souls += it.souls || 0;
      player.wicks = Math.min(player.maxWicks, player.wicks + (it.wicks || 0));
      ui.toastMsg(`拾取：魂火＋${it.souls}、燈芯＋${it.wicks}`);
      return;
    }
    if (it.type === 'shortcut') {
      if (!level.shortcutOpen) {
        level.openShortcut();
        ui.toastMsg('消防喉蓋已開 — 捷徑接通茶檔同渠口');
      } else {
        ui.toastMsg(it.doneLabel);
      }
      return;
    }
    if (it.type === 'shortcut_use') {
      if (level.shortcutOpen) {
        player.position.copy(level.spawnPoints.A);
        ui.toastMsg('沿捷徑返到渠口');
      } else {
        ui.toastMsg('要先打開消防喉蓋（E1）');
      }
      return;
    }
    if (it.type === 'bonfire') {
      player.restAtBonfire(level.spawnPoints.G);
      respawnEnemies();
      ui.toastMsg('阿婆：飲啖茶先……燈芯滿晒。雜兵又返嚟啦。');
      return;
    }
    if (it.type === 'gate') {
      if (level.bossDefeated) {
        ui.toastMsg('鐵閘牙已到手，但藥材街——即將開放');
      } else {
        ui.toastMsg(it.label);
      }
      return;
    }
  }
}

function updatePrompt() {
  const p = player.position;
  if (soulOrb && p.distanceTo(soulOrb.pos) < 1.8) {
    ui.setPrompt('按 E 撿返魂火');
    return;
  }
  for (const it of level.interactables) {
    if (p.distanceTo(it.pos) > it.radius) continue;
    if (it.type === 'loot' && it.taken) continue;
    if (it.type === 'shortcut' && level.shortcutOpen) {
      ui.setPrompt(it.doneLabel);
      return;
    }
    if (it.type === 'shortcut_use' && !level.shortcutOpen) continue;
    ui.setPrompt(it.label);
    return;
  }
  ui.setPrompt('');
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!started) {
    renderer.render(scene, player.camera);
    return;
  }

  level.update(dt, time);

  if (deathPending) {
    // wait for overlay then respawn
    player.stateTime -= dt;
    if (player.stateTime <= 0) {
      deathPending = false;
      ui.showDeath(false);
      player.respawn();
      onPlayerDeathRespawnOnly();
    }
    ui.updatePlayer(player);
    renderer.render(scene, player.camera);
    return;
  }

  const result = player.update(dt, input, enemies);

  // Apply player hits to enemies
  if (result.hits) {
    for (const h of result.hits) {
      h.enemy.applyHit(h.dmg, h.posture, h.riposte);
      if (h.riposte) ui.toastMsg('斬名！');
      if (!h.enemy.alive) {
        player.souls += h.enemy.soulValue;
        if (h.enemy.type === 'boss') {
          ui.toastMsg('……閘……唔可以開……寨要食……名……\n獲得：鐵閘牙、鏽鐵鏈鞭、魂火大份');
          player.souls += 150;
          player.equipChainWhip();
        }
      }
    }
  }

  // Enemy updates & damage to player
  let boss = null;
  for (const e of enemies) {
    if (e.type === 'boss') boss = e;
    const ev = e.update(dt, player);
    if (ev && ev.type === 'damage' && player.isAlive()) {
      // Prevent multi-hit same frame spam with short i-frame from block result
      const res = player.takeDamage(ev.amount, { unblockable: ev.unblockable });
      if (res.blocked && res.perfect && ev.source) {
        ev.source.applyHit(0, res.postureDmg || 20);
        ui.toastMsg('完美架擋！');
      }
      if (ev.unblockable && res.dmg > 0) {
        ui.toastMsg('鎖喉抓取！唔可以擋——要滾走');
      }
      if (player.hp <= 0 && player.state !== 'dead') {
        player.kill();
        result.justDied = true;
      }
    }
    if (ev && ev.type === 'bossTelegraph' && ev.move === 'grab') {
      ui.toastMsg('小心：抓取（唔能擋）');
    }
  }

  if (result.justDied) {
    dropSoulOrb(player.position.clone(), player.deathSoulsDropped);
    ui.showDeath(true);
    deathPending = true;
    player.stateTime = 2.0;
  }

  handleInteract();
  updatePrompt();

  // Boss HUD
  if (boss && boss.engaged && boss.alive) {
    ui.showBoss(true, boss.hp / boss.maxHp, boss.posture / boss.maxPosture);
  } else if (boss && !boss.alive && level.bossDefeated) {
    ui.showBoss(false);
  } else {
    ui.showBoss(false);
  }

  // Soul orb spin
  if (soulOrb) {
    soulOrb.mesh.position.y = 0.55 + Math.sin(time * 3) * 0.1;
    soulOrb.mesh.rotation.y += dt * 2;
  }

  ui.updatePlayer(player);
  renderer.render(scene, player.camera);
}

btnStart.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  started = true;
  canvas.requestPointerLock?.();
  ui.toastMsg('渠底巷——由鐵梯爬上去。耐力即命。');
});

init();
loop();
