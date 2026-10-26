// 적: 종류 정의, 웨이브 스폰, AI, 공간 격자, 피격/처치, 보스
//
//  새 적 추가: ENEMY_TYPES 에 { hp, speed, r, dmg, xp, model(), ai } 를 넣고
//  Spawner.pick() 의 시간대 표에 등장 조건을 추가하면 된다.

import { Geometry, InstancedMesh, Material, Mesh, m4 } from '../engine/index.js';
import { buildMech, animateMech } from './parts.js';
import { GUARDIAN_PARTS, Guardian } from './guardians.js';
import { MIDBOSS_TYPES, MidBoss, Hazards, laserHits } from './midbosses.js';
import { TROOP_TYPES } from './troops.js';

const TAU = Math.PI * 2;
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
const cbox = (g, w, h, d, c, p, r) => add(g, Geometry.box(w, h, d, c), [p[0], p[1] - h / 2, p[2]], r);

const PURPLE = [0.36, 0.3, 0.44], DPURP = [0.22, 0.2, 0.28], RUST = [0.55, 0.32, 0.26], GUN = [0.2, 0.2, 0.24], OLIVE = [0.38, 0.42, 0.36];

export const ENEMY_TYPES = {
  // 떼거리: 작고 빠르고 약하다. 수백 마리 몰려온다
  mite: {
    name: '고철 벌레', hp: 7, speed: 4.4, r: 0.34, dmg: 4, xp: 1, mass: 0.6, fly: 0, cap: 360, boom: 0.3, swarm: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.26, 0, [0.3, 0.32, 0.42], { squashY: 0.6 }), [0, 0.2, 0]);
      add(g, Geometry.box(0.34, 0.08, 0.3, [0.5, 0.52, 0.6]), [0, 0.28, -0.02]);
      for (const s of [-1, 1]) for (const z of [-0.12, 0.12]) add(g, Geometry.box(0.32, 0.05, 0.05, GUN), [s * 0.2, 0.1, z], [0, 0, s * 0.5]);
      cbox(glow, 0.2, 0.07, 0.06, [1, 0.25, 0.3], [0, 0.27, 0.24]);
      return { g, glow };
    },
  },
  // 자폭 드론: 다가와서 번쩍이다 터진다. 폭발은 주변 적도 같이 날린다
  bomber: {
    name: '자폭 드론', hp: 12, speed: 5.2, r: 0.42, dmg: 14, xp: 1, mass: 0.9, fly: 0.7, cap: 70, boom: 0.9, bomb: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.32, 0, GUN), [0, 0, 0]);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; add(g, Geometry.cone(0.08, 0.24, 4, RUST), [Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3], [Math.PI / 2, a, 0]); }
      add(glow, Geometry.icosphere(0.16, 0, [1, 0.3, 0.2]), [0, 0.18, 0.12]);
      return { g, glow };
    },
  },
  drone: {
    name: '정찰 드론', hp: 14, speed: 3.7, r: 0.45, dmg: 7, xp: 1, mass: 1, fly: 0.9, cap: 220, boom: 0.5,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.34, 0, PURPLE, { squashY: 0.7 }), [0, 0, 0]);
      for (const s of [-1, 1]) add(g, Geometry.box(0.42, 0.06, 0.24, DPURP), [s * 0.4, -0.02, -0.05], [0, 0, s * 0.3]);
      add(g, Geometry.cone(0.1, 0.3, 4, DPURP), [0, -0.2, 0], [Math.PI, 0, 0]);
      cbox(glow, 0.2, 0.08, 0.06, [1, 0.25, 0.3], [0, 0.04, 0.3]);
      return { g, glow };
    },
  },
  tank: {
    name: '경전차', hp: 46, speed: 2.3, r: 0.75, dmg: 11, xp: 3, mass: 3, fly: 0, cap: 80, boom: 0.9, shoots: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) cbox(g, 0.34, 0.36, 1.25, GUN, [s * 0.45, 0.36, 0]);
      cbox(g, 0.7, 0.3, 1.05, OLIVE, [0, 0.6, 0]);
      cbox(g, 0.5, 0.26, 0.55, OLIVE, [0, 0.86, -0.05]);
      add(g, Geometry.cylinder(0.07, 0.07, 0.8, 5, GUN), [0, 0.74, 0.2], [Math.PI / 2, 0, 0]);
      cbox(g, 0.72, 0.06, 0.2, RUST, [0, 0.66, 0.5]);
      cbox(glow, 0.14, 0.08, 0.08, [1, 0.35, 0.2], [0.16, 0.92, 0.22]);
      return { g, glow };
    },
  },
  // 회전 포대 드론: 거리를 두고 맴돌며 회전 고리탄을 뿌린다 (방 3부터)
  spinner: {
    name: '회전 포대 드론', hp: 55, speed: 2.9, r: 0.6, dmg: 9, xp: 4, mass: 2, fly: 1.0, cap: 12, boom: 0.9, shoots: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.5, 0.42, 0.3, 8, DPURP), [0, -0.15, 0]);
      add(g, Geometry.icosphere(0.3, 0, PURPLE, { squashY: 0.8 }), [0, 0.15, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        add(g, Geometry.cylinder(0.06, 0.06, 0.45, 4, GUN), [Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55], [Math.PI / 2, a, 0]);
        add(glow, Geometry.box(0.1, 0.1, 0.06, [1, 0.25, 0.7]), [Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78], [0, a, 0]);
      }
      add(glow, Geometry.icosphere(0.12, 0, [1, 0.3, 0.7]), [0, 0.42, 0]);
      return { g, glow };
    },
  },
  brute: {
    name: '중장 메카', hp: 190, speed: 1.9, r: 1.05, dmg: 18, xp: 10, mass: 8, fly: 0, cap: 30, boom: 1.5,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) {
        cbox(g, 0.5, 0.9, 0.6, DPURP, [s * 0.42, 0.9, 0]);
        cbox(g, 0.6, 0.2, 0.8, GUN, [s * 0.42, 0.2, 0.08]);
        cbox(g, 0.6, 0.55, 0.7, PURPLE, [s * 0.9, 2.0, 0]);              // 어깨
        add(g, Geometry.cone(0.14, 0.45, 4, RUST), [s * 1.02, 2.2, 0], [0, 0, -s * 0.5]);
        cbox(g, 0.36, 0.8, 0.4, DPURP, [s * 0.95, 1.45, 0.05]);          // 팔
      }
      cbox(g, 1.3, 0.95, 0.9, PURPLE, [0, 1.75, 0]);
      cbox(g, 0.9, 0.3, 0.2, RUST, [0, 1.55, 0.46]);
      add(g, Geometry.icosphere(0.32, 0, DPURP), [0, 2.35, 0.1]);       // 둥근 머리
      add(g, Geometry.cylinder(0.05, 0.05, 0.4, 4, GUN), [0.15, 2.45, -0.05], [-0.4, 0, 0]);
      cbox(glow, 0.14, 0.14, 0.08, [1, 0.3, 0.6], [0, 2.4, 0.4]);     // 모노아이
      return { g, glow };
    },
  },
};

Object.assign(ENEMY_TYPES, TROOP_TYPES, GUARDIAN_PARTS, MIDBOSS_TYPES);

// 정예 특성: 깊이 3 이후 정예에 붙는다 (깊은 방은 2개). 몸 색 + 발밑 회전 고리(aura) 색으로 구분
export const AFFIXES = {
  swift:    { name: '질풍', tint: [0.7, 1.35, 1.6], aura: [0.7, 1, 1] },       // 빠름
  armored:  { name: '중장갑', tint: [0.75, 0.85, 1.25], aura: [0.45, 0.55, 1] }, // 체력 ↑, 넉백 저항
  volatile: { name: '폭주', tint: [1.7, 0.55, 0.4], aura: [1, 0.35, 0.15] },    // 죽으면 폭발 + 고리탄
  gunner:   { name: '탄막', tint: [1.5, 0.6, 1.6], aura: [1, 0.3, 0.85] },     // 주기적으로 고리탄
  shielded: { name: '보호막', tint: [0.8, 1.2, 1.7], aura: [0.35, 0.8, 1] },    // 체력 50% 보호막 (안 맞으면 다시 찬다)
  regen:    { name: '재생', tint: [0.7, 1.5, 0.8], aura: [0.3, 1, 0.4] },      // 2초 안 맞으면 초당 5% 회복
  blink:    { name: '점멸', tint: [1.3, 0.8, 1.7], aura: [0.7, 0.4, 1] },      // 표식 뒤 플레이어 옆으로 순간이동
  brood:    { name: '번식', tint: [1.4, 1.3, 0.5], aura: [1, 0.85, 0.2] },     // 죽으면 벌레 떼가 쏟아진다
};
const NO_BLINK = new Set(['assassin', 'mine', 'splitling']);

// 공간 격자: 근처 적만 빠르게 찾기
class Grid {
  constructor(cell = 2.5) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return (ix + 512) * 4096 + (iz + 512); }
  clear() { this.map.clear(); }
  insert(e) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.z / this.cell));
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(e);
  }
  query(x, z, r, fn) {
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const a = this.map.get(this.key(i, j));
      if (a) for (const e of a) fn(e);
    }
  }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.grid = new Grid();
    this.meshes = {};
    for (const [id, T] of Object.entries(ENEMY_TYPES)) {
      const { g, glow } = T.model();
      this.meshes[id] = {
        body: game.scene.add(new InstancedMesh(g, new Material(), T.cap)),
        glow: game.scene.add(new InstancedMesh(glow, new Material({ emissive: 1, castShadow: false }), T.cap)),
      };
    }
    this.boss = null;
    this.mids = [];
    this.hazards = new Hazards(game.scene);
    this.k = { hp: 1, swarmHp: 1, dmg: 1, dens: 1, pw: 1 }; // 난이도 배율 (rooms.scale(), 매 프레임 갱신)
    this.keep = 1; this.keepAcc = 0; // 탄 솎기: 초반 수호자/중간 보스는 쏘는 탄 중 이 비율만 고르게 남긴다 (rooms CURVE bul)
    this.pending = [];
    this.blasts = [];
    this.bossCount = 0;
    // 보스 착지 경고 고리
    const ring = new Geometry();
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2, p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      ring.quad(p(a0, 0.88), p(a1, 0.88), p(a1, 1), p(a0, 1), [1, 1, 1], null, [0, 1, 0]);
    }
    this.warn = game.scene.add(new Mesh(ring, new Material({ color: [1, 0.2, 0.25], emissive: 1, outline: false, castShadow: false, opacity: 0.6 })));
    this.warn.visible = false;
    // 정예 특성 표시: 발밑에서 도는 점선 고리 (특성마다 하나) + 보호막 거품
    const dash = new Geometry();
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1.3) / 16) * TAU, p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      dash.quad(p(a0, 0.84), p(a1, 0.84), p(a1, 1), p(a0, 1), [1, 1, 1], null, [0, 1, 0]);
    }
    this.aura = game.scene.add(new InstancedMesh(dash, new Material({ emissive: 1, outline: false, castShadow: false, opacity: 0.8 }), 96));
    this.bubble = game.scene.add(new InstancedMesh(Geometry.icosphere(1, 1, [1, 1, 1]), new Material({ emissive: 1, outline: false, castShadow: false, opacity: 0.3 }), 48));
    this.tracks = [];  // 움직임을 나중에 바꾸는 적 탄 (휘는 탄, 멈췄다 터지는 탄)
    this.strikes = []; // 바닥 표식 포격
  }

  get alive() { return this.list.length + (this.boss ? 1 : 0); }

  // ---- 스폰 ----
  spawn(type, x, z, { elite = false, force = false, affix = null } = {}) {
    const T = ENEMY_TYPES[type];
    const count = this.list.reduce((n, e) => n + (e.type === type), 0);
    if (!force && (count >= T.cap || this.list.length >= 440)) return null;
    const depth = Math.max(0, this.game.rooms.depth), t = depth * 50, K = this.k, hpMul = (T.swarm ? K.swarmHp : K.hp) * (elite ? 6 : 1);
    const e = {
      type, T, x, z, y: T.fly, vx: 0, vz: 0, vy: 0, stun: 0, kx: 0, kz: 0, yaw: 0, r: T.r * (elite ? 1.3 : 1),
      hp: T.hp * hpMul, maxHp: T.hp * hpMul, flash: 0, spawnT: 0, cd: 1 + Math.random() * 2.5, state: 'walk', st: 0,
      speed: T.speed * (0.9 + Math.random() * 0.2) * (1 + Math.min(0.35, t / 600)), elite, seed: Math.random() * 10,
    };
    // 깊은 방: 정찰 드론 일부가 총을 든다
    if (type === 'drone' && depth >= 4 && Math.random() < 0.08 + (depth - 4) * 0.03 && this.list.reduce((n, o) => n + !!o.gun, 0) < 14) e.gun = true; // 깊이 4 부터 (rooms.js FIRST.gunDrone)
    if (elite && (depth >= 3 || affix) && !T.part) {
      const keys = affix || Object.keys(AFFIXES).filter((k) => !(k === 'blink' && NO_BLINK.has(type))).sort(() => Math.random() - 0.5).slice(0, depth >= 6 ? 2 : 1);
      e.affix = {}; for (const k of keys) e.affix[k] = true;
      e.affixes = keys;
      e.tint = AFFIXES[keys[0]].tint;
      if (e.affix.swift) e.speed *= 1.6;
      if (e.affix.armored) { e.hp = e.maxHp *= 1.7; e.mass = T.mass * 4; }
      if (e.affix.shielded) e.shield = e.shieldMax = e.maxHp * 0.5;
      this.game.ui.toast(`정예 기체 출현 [${keys.map((k) => AFFIXES[k].name).join('·')}]! 처치하면 부품 획득`);
    } else if (elite) this.game.ui.toast('정예 기체 출현! 처치하면 부품 획득');
    this.list.push(e);
    return e;
  }

  // ---- 적 탄 (깊이/전력에 맞춰 피해 보정). 각도 a: atan2(dx, dz) ----
  shoot(x, z, a, sp, dmg, kind = 'orb', y = 1) { if (this.keep < 1 && (this.keepAcc += this.keep) < 1) return; if (this.keep < 1) this.keepAcc -= 1; this.game.shots.enemyShot(x, y, z, Math.sin(a) * sp, Math.cos(a) * sp, dmg * this.k.dmg, kind); }
  ring(x, z, n, sp, dmg, kind = 'orb', off = 0, y = 1) { for (let i = 0; i < n; i++) this.shoot(x, z, off + (i / n) * TAU, sp, dmg, kind, y); }
  fan(x, z, a, n, step, sp, dmg, kind = 'shell', y = 1) { for (let i = 0; i < n; i++) this.shoot(x, z, a + (i - (n - 1) / 2) * step, sp, dmg, kind, y); }

  // ---- 움직임이 바뀌는 탄: fn(s, t, dt) 가 true 를 돌려주면 추적 끝 ----
  //  탄이 플레이어에 맞아 사라졌으면 (목록에 없음) 더 건드리지 않는다
  track(x, z, a, sp, dmg, kind, y, fn) {
    const L = this.game.shots.enemyList, n = L.length;
    this.shoot(x, z, a, sp, dmg, kind, y);
    if (L.length > n && this.tracks.length < 260) this.tracks.push({ s: L[L.length - 1], t: 0, fn });
  }
  // 깔리는 탄: 제자리에 멈춰 있다가 wait 초 뒤 a 방향으로 출발
  lay(x, z, a, wait, sp, dmg, kind = 'shell', y = 1) {
    this.track(x, z, 0, 0, dmg, kind, y, (s, t) => { if (t < wait) return false; s.vx = Math.sin(a) * sp; s.vz = Math.cos(a) * sp; return true; });
  }
  // 휘는 탄: dur 초 동안 초당 w 라디안씩 진행 방향이 돈다
  curve(x, z, a, sp, dmg, w, dur, kind = 'orb', y = 1) {
    this.track(x, z, a, sp, dmg, kind, y, (s, t, dt) => { const c = Math.cos(w * dt), si = Math.sin(w * dt); [s.vx, s.vz] = [s.vx * c + s.vz * si, -s.vx * si + s.vz * c]; return t > dur; });
  }
  // 멈췄다 터지는 탄: go 초 날아가 멈춤 → pop 초에 n 갈래 고리로 터진다 (aim 이면 플레이어 쪽 부채꼴)
  burst(x, z, a, sp, dmg, go, pop, n, sp2, { kind = 'orb', y = 1, aim = false, step = 0.22 } = {}) {
    this.track(x, z, a, sp, dmg, kind, y, (s, t) => {
      if (t > go && !s.stop) { s.stop = true; s.vx = s.vz = 0; s.life = Math.max(s.life, pop - t + 0.2); }
      if (t < pop) return false;
      if (!this.game.shots.enemyList.includes(s)) return true;
      s.life = 0;
      const p = this.game.player;
      if (aim) this.fan(s.x, s.z, Math.atan2(p.x - s.x, p.z - s.z), n, step, sp2, dmg, 'shell', s.y);
      else this.ring(s.x, s.z, n, sp2, dmg, 'orb', Math.random(), s.y);
      this.game.fx.hitSpark([s.x, s.y, s.z], [1, 0.5, 0.9], 3);
      return true;
    });
  }
  // 조여 오는 고리: (cx,cz) 둘레 반지름 r 에서 안쪽으로. gap 개 칸을 비워 빠져나갈 틈을 준다
  converge(cx, cz, r, n, sp, dmg, gap = 2, off = Math.random() * TAU, kind = 'orb') {
    const skip = (Math.random() * n) | 0;
    for (let i = 0; i < n; i++) {
      if (((i - skip + n) % n) < gap) continue;
      const a = off + (i / n) * TAU;
      this.shoot(cx + Math.sin(a) * r, cz + Math.cos(a) * r, a + Math.PI, sp, dmg, kind, 0.9);
    }
  }
  // 바닥 표식 포격: 표식이 차오르면 착탄 (반지름 r) + n 갈래 고리
  strike(x, z, r, life, dmg, n = 0) { if (this.strikes.length < 40) this.strikes.push({ x, z, r, life, dmg, n, t: 0 }); }
  updateStrikes(dt) {
    const g = this.game, p = g.player, fx = g.fx, H = this.hazards;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const m = this.strikes[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.life);
      H.ring(m.x, m.z, m.r * (0.3 + 0.7 * k), [1, 0.45, 0.2], 0.4 + 0.4 * Math.sin(m.t * (k > 0.7 ? 50 : 18)));
      H.ring(m.x, m.z, m.r, [1, 0.25, 0.2], 0.25);
      if (k < 1) continue;
      this.strikes.splice(i, 1);
      fx.explosion(m.x, 0.4, m.z, m.r * 0.8, { color: [1, 0.55, 0.3] }); g.sfx.play('boom', { vol: 0.7 }); fx.addTrauma(0.12);
      if (Math.hypot(p.x - m.x, p.z - m.z) < m.r + p.r * 0.5) p.hurt(m.dmg * this.k.dmg, p.x - m.x, p.z - m.z);
      if (m.n) this.ring(m.x, m.z, m.n, 3.6, 9, 'orb', Math.random(), 0.8);
    }
  }
  updateTracks(dt) {
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const q = this.tracks[i];
      q.t += dt;
      if (q.s.life <= 0 || q.fn(q.s, q.t, dt)) this.tracks.splice(i, 1);
    }
  }

  spawnMid(kind, x, z) { const m = new MidBoss(this.game, kind, x, z); this.mids.push(m); return m; }

  // 무리 스폰: 한 지점에 고리 하나로 예고하고 n 마리를 흩뿌린다
  pack(type, x, z, n, spread = 1.6, delay = 0) { this.pending.push({ type, x, z, n, spread, t: -delay }); }

  // 예고 후 등장: 바닥에 붉은 표식 + 빛 기둥 → delay 뒤에 실제 스폰
  queue(type, x, z, elite = false, delay = 0) { this.pending.push({ type, x, z, elite, t: -delay }); }
  updatePending(dt) {
    const fx = this.game.fx;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      q.t += dt;
      if (q.t < 0) continue;
      if (Math.random() < (this.pending.length > 12 ? 0.15 : 0.5)) fx.trail.emit({ position: [q.x + (Math.random() - 0.5) * 0.8, 0.1, q.z + (Math.random() - 0.5) * 0.8], velocity: [0, 3 + Math.random() * 3, 0], life: 0.3, size: 2, sizeEnd: 1, color: [1, 0.4, 0.5], colorEnd: [0.6, 0.2, 0.8], emissive: 1, gravity: 0 });
      if (q.t >= 0.7) {
        this.pending.splice(i, 1);
        if (q.n) for (let k = 0; k < q.n; k++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * q.spread; const e = this.spawn(q.type, q.x + Math.cos(a) * r, q.z + Math.sin(a) * r); if (e) e.spawnT = Math.random() * 0.2; }
        else this.spawn(q.type, q.x, q.z, { elite: q.elite });
        fx.ring(q.x, 0.12, q.z, 1.6, [1, 0.35, 0.6], 0.25);
        fx.light([q.x, 1, q.z], [1, 0.35, 0.6], 3, 0.6, 0.2);
      }
    }
  }

  spawnGuardian(kind) { this.guardian = new Guardian(this.game, kind); }

  // ---- 보스: 거대한 적 메카 (플레이어와 같은 부품 시스템으로 조립) ----
  spawnBoss(x = 0, z = 0) {
    const g = this.game;
    this.bossCount++;
    const mech = buildMech({ legs: 'walker', paint: 'boss', weapons: [{ id: 'laser', slot: 'armR' }, { id: 'shotgun', slot: 'armL' }, { id: 'missile', slot: 'shR' }, { id: 'missile', slot: 'shL' }], modules: { armor: 3, booster: 2, antenna: 1 } });
    const S = 2.2;
    mech.root.scale = [S, S, S];
    g.scene.add(mech.root);
    const hp = 16000 * (1 + g.level * 0.06) * Math.pow(this.k.pw, 0.6);
    this.boss = { mech, x, z, y: 22, vy: 0, r: 2.0, hp, maxHp: hp, flash: 0, yaw: 0, aim: 0, state: 'drop', st: 0, pattern: 0, anim: { phase: 0 }, boss: true, mass: 40, kx: 0, kz: 0, T: { dmg: 22, xp: 0 } };
    this.warn.visible = true;
    this.warn.position = [x, 0.05, z];
    this.warn.scale = [3.2, 1, 3.2];
    g.ui.banner('경고: 대형 기체 강하!', true);
    g.sfx.play('alarm');
    g.ui.bossBar(1, '타이탄 MK-I');
  }

  // 타이탄이 처음 쓰러지면: 다리가 터져 나가고 비행 코어 MK-II 로 재기동 (체력 55% 로 다시)
  rebirth(B) {
    const g = this.game, fx = g.fx;
    B.reborn = true; B.inv = true; B.hp = 1; B.state = 'reborn'; B.st = 0; B.kx = B.kz = 0; B.vy = 0; B.y = 0;
    this.warn.visible = false;
    g.shots.enemyList.length = 0; this.tracks = []; this.strikes = [];
    g.ui.banner('타이탄 다리 붕괴… 코어가 살아 있다!', true); g.sfx.play('alarm');
    g.hitStop(0.15); g.slowMo(1.0); fx.addTrauma(0.9);
    fx.explosion(B.x, 1.5, B.z, 2.6, { color: [1, 0.55, 0.3] }); g.sfx.play('bigboom');
  }
  updateReborn(B, dt) {
    const g = this.game, fx = g.fx;
    B.flash = Math.sin(B.st * 25) > 0 ? 0.05 : 0;
    if (Math.random() < 0.25) { fx.explosion(B.x + (Math.random() - 0.5) * 4, Math.random() * 2, B.z + (Math.random() - 0.5) * 4, 0.9, { color: [1, 0.6, 0.3] }); g.sfx.play('boom', { vol: 0.5 }); }
    if (B.st > 1.2 && !B.swapped) {
      // 다리 대신 추진기를 단 상체로 갈아 끼운다
      B.swapped = true;
      g.scene.remove(B.mech.root);
      B.mech = buildMech({ legs: 'jet', frame: 'fortress', paint: 'boss', weapons: [{ id: 'laser', slot: 'armR' }, { id: 'laser', slot: 'armL' }, { id: 'missile', slot: 'shR' }, { id: 'missile', slot: 'shL' }, { id: 'missile', slot: 'back' }], modules: { armor: 3, booster: 3, reactor: 2 } });
      B.mech.root.scale = [2.4, 2.4, 2.4]; B.legs = 'jet';
      g.scene.add(B.mech.root);
      fx.explosion(B.x, 2, B.z, 3, { color: [1, 0.5, 0.3] }); fx.ring(B.x, 0.2, B.z, 9, [1, 0.4, 0.3], 0.6); fx.addTrauma(0.8); g.sfx.play('bigboom');
      this.ring(B.x, B.z, 24, 4, 12, 'orb', 0, 1.4);
    }
    if (B.swapped) B.y += (1.4 - B.y) * Math.min(1, dt * 3);
    if (B.st > 2.6) {
      B.inv = false; B.maxHp *= 0.55; B.hp = B.maxHp; B.state = 'walk'; B.st = 0; B.pattern = 0; B.flash = 0;
      g.ui.bossBar(1, '타이탄 MK-II'); g.ui.banner('타이탄 MK-II 기동!', true); g.sfx.play('overdrive');
    }
  }

  // MK-II: 떠다니며 회전 레이저 우리, 미사일 비, 조여 오는 고리, 탄을 까는 돌진, 휘는 은하 나선
  updateMk2(B, dt, { d, toP }) {
    const g = this.game, p = g.player, fx = g.fx, H = this.hazards, P2 = B.hp < B.maxHp * 0.5;
    B.y = 1.4 + Math.sin(g.time * 2) * 0.2;
    let move = 0;
    if (B.state === 'walk') {
      move = 1;
      const sp = d > 5 ? 3.2 : 0;
      B.x += Math.sin(toP) * sp * dt; B.z += Math.cos(toP) * sp * dt;
      B.yaw = toP;
      if (B.st > (P2 ? 0.8 : 1.2)) { const L = ['halo', 'rain', 'charge', 'galaxy', 'cage']; B.state = L[B.pattern++ % L.length]; B.st = 0; B.shots = 0; B.acc = 0; }
    } else if (B.state === 'halo') {
      // 회전 레이저 우리: 짧은 빔 5(2페이즈 6)개가 몸을 중심으로 돈다. 경고 1초 → 3초
      const n = P2 ? 6 : 5, L = 10, W = 0.8, live = B.st > 1;
      if (!B.shots) { B.shots = 1; B.spin = toP + Math.PI / n; B.dir = Math.random() < 0.5 ? 1 : -1; }
      if (live) B.spin += B.dir * (P2 ? 1.1 : 0.85) * dt;
      B.x += Math.sin(toP) * 1.4 * dt; B.z += Math.cos(toP) * 1.4 * dt; move = 0.5;
      for (let k = 0; k < n; k++) {
        const a = B.spin + (k / n) * TAU;
        H.laser(B.x, B.z, a, L, W, live, B.st);
        if (live && laserHits(p.x, p.z, B.x, B.z, a, L, W * 0.5 + p.r * 0.6)) p.hurt(22 * this.k.dmg, Math.sin(a), Math.cos(a));
      }
      if (B.st > 4) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'rain') {
      // 미사일 비: 플레이어 자리 + 예측 자리 + 주변에 바닥 표식
      B.yaw = toP;
      if (B.st > 0.4 + B.shots * 0.18 && B.shots < (P2 ? 14 : 10)) {
        const lead = B.shots % 3 === 1 ? 0.6 : 0, j = B.shots % 3 === 2 ? 4 : 0;
        this.strike(p.x + p.vx * lead + (Math.random() - 0.5) * j, p.z + p.vz * lead + (Math.random() - 0.5) * j, 1.8, 1.1, 18, P2 ? 6 : 0);
        const m = B.mech.muzzle(['shR', 'shL', 'back'][B.shots % 3]);
        fx.muzzle(m, [0, 1, 0], [1, 0.5, 0.3], 2); g.sfx.play('missile', { vol: 0.6 });
        B.shots++;
      }
      if (B.st > 3.4) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'charge') {
      // 경고선 → 저공 돌진, 지나간 자리에 탄을 깔아 양옆으로 퍼뜨린다 (2번, 2페이즈 3번)
      const pre = B.shots ? 0.45 : 0.75;
      if (B.st < pre) {
        if (B.st < pre * 0.6) { B.da = toP; B.dl = Math.min(20, d + 6); }
        B.yaw = B.da; B.flash = Math.sin(B.st * 30) > 0 ? 0.04 : 0; B.drops = 0;
        H.line(B.x, B.z, B.da, B.dl, 2.6, [1, 0.25, 0.3], 0.2 + 0.45 * (B.st / pre));
      } else {
        if (!B.drops) { B.ox = B.x; B.oz = B.z; g.sfx.play('dash'); }
        B.x += Math.sin(B.da) * 26 * dt; B.z += Math.cos(B.da) * 26 * dt; move = 1;
        if ((B.acc += dt) > 0.05) { B.acc = 0; B.drops++; for (const s of [1, -1]) this.lay(B.x, B.z, B.da + s * Math.PI / 2, 0.7, 4.4, 12, B.drops % 2 ? 'shell' : 'orb', 1.2); }
        if (laserHits(p.x, p.z, B.x - Math.sin(B.da) * 2, B.z - Math.cos(B.da) * 2, B.da, 4, 1.6 + p.r)) p.hurt(B.T.dmg * this.k.dmg, Math.sin(B.da), Math.cos(B.da));
        const RM = g.rooms, out = Math.abs(B.x) > RM.hx - 2.2 || Math.abs(B.z) > RM.hz - 2.2;
        if (Math.hypot(B.x - B.ox, B.z - B.oz) >= B.dl || out) {
          fx.addTrauma(0.3); for (let i = 0; i < 6; i++) fx.dust(B.x + (Math.random() - 0.5) * 3, B.z + (Math.random() - 0.5) * 3, 1);
          if (++B.shots < (P2 ? 3 : 2)) B.st = 0; else { B.state = 'walk'; B.st = 0; }
        }
      }
    } else if (B.state === 'galaxy') {
      // 은하 나선: 팔 6개, 번갈아 반대로 휜다
      if (B.st < 0.7) { B.flash = Math.sin(B.st * 30) > 0 ? 0.04 : 0; B.spin = toP; }
      else if ((B.acc += dt) > 0.15) {
        B.acc = 0; B.spin += 0.13;
        const arms = P2 ? 7 : 6;
        for (let k = 0; k < arms; k++) this.curve(B.x, B.z, B.spin + (k / arms) * TAU, 5, 12, (k % 2 ? 1 : -1) * 0.8, 1.8, 'orb', 1.6);
      }
      if (B.st > 3.6) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'cage') {
      // 조여 오는 고리 두 겹 + 몸에서 조준 부채꼴
      if (!B.shots) { B.shots = 1; B.cx = p.x; B.cz = p.z; }
      if (B.st < 0.8) H.ring(B.cx, B.cz, 8, [1, 0.3, 0.4], 0.3 + 0.4 * Math.sin(B.st * 30));
      else if (B.shots === 1) { B.shots = 2; this.converge(B.cx, B.cz, 8, 34, 3.2, 12, 3); this.converge(B.cx, B.cz, 10.5, 34, 3.2, 12, 3); }
      if (B.shots >= 2 && B.st > 1.1 + (B.shots - 2) * 0.5 && B.shots < 5) { B.shots++; const m = B.mech.muzzle(B.shots % 2 ? 'armR' : 'armL'); this.fan(m[0], m[2], Math.atan2(p.x - m[0], p.z - m[2]), P2 ? 7 : 5, 0.18, 9, 12, 'shell', 1.4); }
      if (B.st > 2.8) { B.state = 'walk'; B.st = 0; }
    }
    return move;
  }

  updateBoss(dt) {
    const B = this.boss, g = this.game, p = g.player, fx = g.fx;
    if (!B) return;
    B.st += dt;
    B.flash = Math.max(0, B.flash - dt);
    const dx = p.x - B.x, dz = p.z - B.z, d = Math.hypot(dx, dz) || 1;
    const toP = Math.atan2(dx, dz);
    let move = 0;
    if (B.state === 'reborn') this.updateReborn(B, dt);
    else if (B.reborn) move = this.updateMk2(B, dt, { dx, dz, d, toP });
    const P2 = B.hp < B.maxHp * 0.5; // 2페이즈: 패턴 간격이 짧아지고 탄이 늘어난다
    if (P2 && !B.p2 && !B.reborn) { B.p2 = true; g.ui.banner('타이탄 출력 상승!', true); g.sfx.play('alarm'); fx.ring(B.x, 0.2, B.z, 8, [1, 0.3, 0.4], 0.6); this.ring(B.x, B.z, 32, 5, 12, 'orb', 0, 1.4); }
    const fireRing = (n, speed, off = 0) => this.ring(B.x, B.z, n, speed, 12, 'orb', off, 1.4);
    if (B.reborn) { /* MK-II: updateReborn / updateMk2 */ } else if (B.state === 'drop' || B.state === 'stompFall') {
      B.vy -= 60 * dt; B.y += B.vy * dt;
      this.warn.material.opacity = 0.35 + 0.35 * Math.sin(B.st * 30);
      if (B.y <= 0) {
        B.y = 0; B.vy = 0; this.warn.visible = false;
        fx.explosion(B.x, 0.3, B.z, 2.6, { color: [1, 0.5, 0.3] });
        fx.ring(B.x, 0.15, B.z, 7, [1, 0.4, 0.4], 0.5);
        g.sfx.play('bigboom');
        fx.addTrauma(0.8);
        g.hitStop(0.12);
        if (d < 5) p.hurt(B.T.dmg * this.k.dmg, -dx / d, -dz / d);
        if (B.state === 'stompFall') this.ring(B.x, B.z, P2 ? 24 : 14, 4.5, 12, 'shell', Math.random(), 0.8); // 착지 충격파
        for (let i = 0; i < 14; i++) fx.dust(B.x + (Math.random() - 0.5) * 5, B.z + (Math.random() - 0.5) * 5, 1);
        B.state = 'walk'; B.st = 0;
      }
    } else if (B.state === 'walk') {
      move = 1;
      const sp = 2.2 + this.bossCount * 0.3;
      B.x += (dx / d) * sp * dt; B.z += (dz / d) * sp * dt;
      B.yaw = toP;
      if (B.st > (P2 ? 1.3 : 2.0)) { const L = ['ring', 'volley', 'spiral', 'summon', 'sweep', 'stomp']; B.state = L[B.pattern++ % L.length]; B.st = 0; B.shots = 0; B.acc = 0; }
    } else if (B.state === 'ring') {
      // 원형 탄막 (엇갈린 고리, 2페이즈 5파)
      B.yaw = toP;
      const n = 16 + this.bossCount * 2 + (P2 ? 6 : 0);
      if (B.st > 0.5 + B.shots * 0.5 && B.shots < (P2 ? 5 : 3)) { fireRing(n, 6, (B.shots % 2) * (Math.PI / n)); B.shots++; B.flash = 0.08; fx.light([B.x, 3, B.z], [1, 0.4, 0.3], 8, 1.1, 0.2); fx.addTrauma(0.15); }
      if (B.st > (P2 ? 3.2 : 2.4)) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'volley') {
      // 플레이어 쪽 부채꼴 사격
      B.yaw = toP;
      if (B.st > 0.6 + B.shots * 0.32 && B.shots < (P2 ? 7 : 5)) {
        const m = B.mech.muzzle(B.shots % 2 ? 'shR' : 'shL');
        this.fan(m[0], m[2], Math.atan2(p.x - m[0], p.z - m[2]), P2 ? 7 : 5, 0.16, 10, 12, 'orb', 1.4);
        fx.muzzle(m, [Math.sin(toP), 0, Math.cos(toP)], [1, 0.4, 0.3], 2);
        B.shots++;
      }
      if (B.st > (P2 ? 3.2 : 2.6)) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'spiral') {
      // 회전 나선 (예고: 깜빡임). 2페이즈는 팔 4개 + 역회전 포탄
      if (B.st < 0.7) { B.flash = Math.sin(B.st * 30) > 0 ? 0.04 : 0; B.spin = toP; }
      else if ((B.acc += dt) > 0.1) {
        B.acc = 0; B.shots++;
        const arms = P2 ? 4 : 3;
        B.spin += 0.2;
        for (let k = 0; k < arms; k++) this.shoot(B.x, B.z, B.spin + (k / arms) * TAU, 5.2, 12, 'orb', 1.6);
        if (P2 && B.shots % 2) this.shoot(B.x, B.z, -B.spin * 1.4, 3.8, 12, 'shell', 1.6);
      }
      if (B.st > 3.9) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'sweep') {
      // 레이저 휩쓸기: 경고선 1초 → 부채꼴로 쓸기 (2페이즈는 반대쪽 빔 추가)
      const H = this.hazards, L = 26, W = 0.9, pre = 1.0, dur = 1.7;
      if (!B.shots) { B.shots = 1; const s = Math.random() < 0.5 ? 1 : -1; B.a0 = toP - s * 1.1; B.a1 = toP + s * 1.1; }
      const k = Math.max(0, Math.min(1, (B.st - pre) / dur)), a = B.a0 + (B.a1 - B.a0) * k, live = B.st > pre;
      B.yaw = a;
      for (const off of P2 ? [0, Math.PI] : [0]) {
        H.laser(B.x, B.z, a + off, L, W, live, B.st);
        if (!live) H.line(B.x, B.z, B.a1 + off, L, 0.06, [1, 0.3, 0.3], 0.3);
        else if (laserHits(p.x, p.z, B.x, B.z, a + off, L, W * 0.5 + p.r * 0.6)) p.hurt(24 * this.k.dmg, Math.cos(a), -Math.sin(a));
      }
      if (B.st > pre + dur) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'summon') {
      if (B.st > 0.4 && !B.shots) {
        B.shots = 1;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const e = this.spawn(P2 && i % 2 ? 'spinner' : 'drone', B.x + Math.cos(a) * 3, B.z + Math.sin(a) * 3); if (e) e.spawnT = 0; }
        fx.ring(B.x, 0.2, B.z, 4, [1, 0.3, 0.6], 0.4);
      }
      if (B.st > 1.4) { B.state = 'walk'; B.st = 0; }
    } else if (B.state === 'stomp') {
      // 웅크림 → 플레이어 위치로 점프
      if (B.st < 0.6) { B.flash = Math.sin(B.st * 40) > 0 ? 0.05 : 0; }
      else {
        B.state = 'stompAir'; B.st = 0; B.vy = 26; B.tx = p.x + p.vx * 0.5; B.tz = p.z + p.vz * 0.5; B.sx = B.x; B.sz = B.z;
        this.warn.visible = true; this.warn.position = [B.tx, 0.05, B.tz]; this.warn.scale = [4.5, 1, 4.5];
      }
    } else if (B.state === 'stompAir') {
      const k = Math.min(1, B.st / 0.85);
      B.x = B.sx + (B.tx - B.sx) * k; B.z = B.sz + (B.tz - B.sz) * k;
      B.vy -= 60 * dt; B.y = Math.max(0.01, B.y + B.vy * dt);
      this.warn.material.opacity = 0.35 + 0.35 * Math.sin(B.st * 30);
      if (B.vy < 0 && B.st > 0.5) { B.state = 'stompFall'; }
    }
    // 넉백 감쇠 + 지형
    B.x += B.kx * dt; B.z += B.kz * dt; B.kx *= Math.exp(-6 * dt); B.kz *= Math.exp(-6 * dt);
    g.rooms.clamp(B, B.r * 0.7);
    // 접촉 피해
    if (B.y < 1 && d < B.r + p.r) p.hurt(B.T.dmg * this.k.dmg, dx / d, dz / d);
    // 애니메이션
    B.aim = B.yaw;
    const m = B.mech;
    m.root.position = [B.x, B.y, B.z];
    m.root.rotation[1] = B.yaw;
    animateMech(m, B.anim, { move, dt, t: g.time, legs: B.legs || 'walker', aimRel: 0 });
    const f = B.flash > 0;
    for (const mesh of m.meshes) { mesh.material.emissive = f ? 0.7 : 0; mesh.material.color = f ? [2.2, 2.2, 2.2] : [1, 1, 1]; }
  }

  // ---- 피격 ----
  hit(e, dmg, dirX, dirZ, knock, { crit = false, quiet = false, noNum = false, launch = 0, stun = 0 } = {}) {
    const g = this.game;
    if (e.dead || e.under || e.inv) return;
    if (e.prop) return g.rooms.hazards.hitProp(e, dmg); // 환경 소품 (hazards.js)
    if (e.guard) { dmg *= e.guard.dmgMul(e); launch = 0; stun = 0; knock = 0; }
    e.hitT = g.time;
    let col = crit ? [1, 0.85, 0.2] : [1, 1, 1];
    // 방패 기체: 정면에서 날아온 공격은 대부분 막힌다 (방향 없는 공격은 플레이어 쪽에서 온 것으로)
    if (e.T.shield && !(e.stun > 0)) {
      let ax = dirX, az = dirZ;
      if (!ax && !az) { ax = e.x - g.player.x; az = e.z - g.player.z; }
      if ((ax * Math.sin(e.yaw) + az * Math.cos(e.yaw)) / (Math.hypot(ax, az) || 1) < -0.35) {
        dmg *= 0.12; knock *= 0.25; launch = 0; col = [0.5, 0.8, 1];
        if (Math.random() < 0.35) { g.fx.hitSpark([e.x + Math.sin(e.yaw) * 0.6, 0.9, e.z + Math.cos(e.yaw) * 0.6], [0.5, 0.9, 1], 3); g.sfx.play('tink', { vol: 0.3 }); }
      }
    }
    // 보호막 특성: 보호막이 먼저 깎인다
    if (e.shield > 0) {
      const a = Math.min(e.shield, dmg);
      e.shield -= a; dmg -= a; col = [0.5, 0.8, 1];
      if (e.shield <= 0) { g.fx.ring(e.x, (e.y || 0) + 0.8, e.z, e.r * 2.4, [0.4, 0.85, 1], 0.35); g.fx.hitSpark([e.x, (e.y || 0) + 0.8, e.z], [0.5, 0.9, 1], 10); g.sfx.play('tink'); }
      if (dmg <= 0) { e.flash = 0.04; return; }
    }
    e.hp -= dmg;
    e.flash = 0.09;
    const k = knock / (e.mass || e.T.mass);
    e.kx += dirX * k; e.kz += dirZ * k;
    if (!e.boss) {
      if (launch) e.vy = Math.max(e.vy || 0, launch / Math.sqrt(e.T.mass));   // 띄우기
      if (stun) e.stun = Math.max(e.stun || 0, stun);
    }
    g.stats.dealt += dmg;
    if (!noNum && (!quiet || crit)) g.fx.number([e.x, (e.y || 0) + (e.boss ? 4 : 1), e.z], dmg, { color: col, big: crit });
    if (e.boss) { g.ui.bossBar(Math.max(0, e.hp / e.maxHp)); if (crit) g.hitStop(0.03); }
    if (e.hp <= 0 && e.boss && !e.reborn) return this.rebirth(e);
    if (e.hp <= 0) this.kill(e);
  }

  kill(e) {
    const g = this.game, fx = g.fx;
    e.dead = true;
    if (e.T.inert) { fx.explosion(e.x, e.y, e.z, 0.6, { scorch: false }); return; } // 장식 부위 (히드라 목)
    if (e.T.mine) {
      // 지뢰: 밟아서 터지면 플레이어도 다치고, 쏴서 터뜨리면 주변 적만 다친다. 처치 수/경험치 없음
      if (e.fizzle || e.doomT !== undefined) { fx.pop(e.x, 0.2, e.z, [1, 0.5, 0.2]); return; }
      this.blast(e.x, e.z, 1.9, e.trip ? e.T.dmg * 2 * this.k.dmg : 18 * g.player.stats.dmgMul, !!e.trip, 0.02);
      fx.ring(e.x, 0.15, e.z, 1.9, [1, 0.4, 0.2], 0.3);
      return;
    }
    g.stats.kills++;
    g.onKill?.();
    if (e.boss) {
      const B = e;
      for (let i = 0; i < 6; i++) setTimeout(() => fx.explosion(B.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, B.z + (Math.random() - 0.5) * 3, 1.6), i * 120);
      fx.explosion(B.x, 2, B.z, 3.2, { color: [1, 0.55, 0.3] });
      g.sfx.play('bigboom'); setTimeout(() => g.sfx.play('bigboom'), 300);
      fx.addTrauma(1);
      g.hitStop(0.2);
      g.slowMo(1.4);
      g.scene.remove(B.mech.root);
      this.boss = null;
      this.warn.visible = false;
      g.ui.bossBar(0);
      g.ui.banner('타이탄 격파!');
      for (let i = 0; i < 30; i++) g.pickups.gem(B.x + (Math.random() - 0.5) * 5, B.z + (Math.random() - 0.5) * 5, 5);
      return;
    }
    const T = e.T;
    if (T.swarm && !e.elite) { fx.pop(e.x, 0.3, e.z, [1, 0.6, 0.25]); g.sfx.play('pop'); }
    else {
      g.sfx.play(e.elite || e.type === 'brute' ? 'bigboom' : 'boom', { vol: e.elite ? 0.8 : 1 });
      fx.explosion(e.x, e.y + 0.4, e.z, T.boom * (e.elite ? 1.4 : 1), { debris: e.type === 'drone' ? [0.3, 0.27, 0.36] : [0.3, 0.32, 0.28], scorch: e.type !== 'drone' && !T.bomb });
    }
    // 연쇄 폭발: 자폭 드론은 항상, 나머지는 '연쇄 기폭' 능력치 확률로
    g.player.addOd(T.xp * 0.0045 * (e.elite ? 6 : 1));
    const chain = g.player.stats.chain || 0;
    if (e.affix?.volatile && e.doomT === undefined) { this.blast(e.x, e.z, 2.8, T.dmg * 2.5 * this.k.dmg, true, 0.35); this.ring(e.x, e.z, 12, 4.2, T.dmg, 'orb', Math.random()); fx.ring(e.x, 0.15, e.z, 2.8, [1, 0.3, 0.2], 0.4); }
    if (e.doomT === undefined) {
      if (T.split) this.spill(T.split, e.x, e.z, e.elite ? 6 : 3, 7);  // 분열: 조각이 튀어나온다
      if (e.affix?.brood) this.spill('mite', e.x, e.z, 8, 9);
    }
    if (T.bomb) this.blast(e.x, e.z, 2.2, 26 * this.k.dmg, true, 0.04);
    else if (chain && Math.random() < chain) this.blast(e.x, e.z, 1.6 + (e.elite ? 1 : 0) + T.r, (8 + e.maxHp * 0.6) * g.player.stats.dmgMul, false, 0.07);
    // 부품 노획: 적의 부위가 뜯겨 나와 떨어진다
    const sal = e.type === 'tank' ? (e.elite || Math.random() < 0.06 ? ['weapon', 'cannon'] : null)
      : e.type === 'brute' ? (e.elite || Math.random() < 0.2 ? ['module', 'spike'] : null)
      : e.type === 'drone' && e.elite ? ['weapon', 'funnel'] : null;
    if (e.elite) g.addChips(1);
    if (sal) g.pickups.salvage(sal[0], sal[1], e.x, e.z);
    else if (e.elite) g.pickups.drop('crate', e.x, e.z);
    if (e.guard) e.guard.onKill(e);
    if (e.type === 'brute') { g.hitStop(0.05); }
    const xp = T.xp * (e.elite ? 5 : 1) * (this.k.xp || 1); // 초반 방은 경험치 보너스 (rooms CURVE)
    g.pickups.gem(e.x, e.z, xp);
    const r = Math.random();
    if ((!T.swarm && e.type !== 'drone' && r < 0.03) || r < 0.003) g.pickups.drop('kit', e.x + 0.5, e.z);
    else if (r > 0.9985) g.pickups.drop('magnet', e.x + 0.5, e.z);
  }

  // 정예 특성: 재생 / 보호막 재충전 / 점멸
  affixTick(e, dt, d) {
    const g = this.game, fx = g.fx, A = e.affix, quiet = g.time - (e.hitT || 0);
    if (A.regen && quiet > 2 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * dt);
      if (Math.random() < 0.15) fx.trail.emit({ position: [e.x + (Math.random() - 0.5) * e.r * 2, e.y + 0.3, e.z + (Math.random() - 0.5) * e.r * 2], velocity: [0, 2.5, 0], life: 0.5, size: 2, sizeEnd: 0.5, color: [0.4, 1, 0.5], colorEnd: [0.1, 0.5, 0.2], emissive: 1, gravity: 0 });
    }
    if (A.shielded && quiet > 4 && e.shield < e.shieldMax) {
      if (e.shield <= 0) g.sfx.play('tune', { vol: 0.3 });
      e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.4 * dt);
    }
    if (A.blink && e.spawnT > 1 && e.state === 'walk') {
      // 도착 지점에 0.45초 표식 → 순간이동 (플레이어 옆쪽, 너무 가깝지 않게)
      if (e.blinkTo) {
        e.blinkT -= dt;
        this.hazards.ring(e.blinkTo[0], e.blinkTo[1], e.r * 1.8, [0.75, 0.4, 1], 0.35 + 0.35 * Math.sin(e.blinkT * 40));
        if (e.blinkT <= 0) {
          fx.ring(e.x, 0.15, e.z, 1.5, [0.75, 0.4, 1], 0.25);
          [e.x, e.z] = e.blinkTo; e.blinkTo = null; e.kx = e.kz = 0;
          fx.ring(e.x, 0.15, e.z, 1.5, [0.75, 0.4, 1], 0.25); fx.light([e.x, 1, e.z], [0.75, 0.4, 1], 3, 0.8, 0.2);
        }
      } else if ((e.bcd = (e.bcd ?? 2 + Math.random() * 2) - dt) <= 0 && d < 16) {
        e.bcd = 3.5 + Math.random() * 2;
        const p = g.player, a = Math.atan2(e.x - p.x, e.z - p.z) + (Math.random() < 0.5 ? 1 : -1) * (1.1 + Math.random() * 0.8), r = Math.max(4, Math.min(8, d));
        const spot = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
        g.rooms.clamp(spot, e.r);
        e.blinkTo = [spot.x, spot.z]; e.blinkT = 0.45;
      }
    }
  }

  // 죽은 자리에서 작은 적이 사방으로 튀어나온다
  spill(type, x, z, n, power) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5, s = this.spawn(type, x + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3);
      if (s) { s.spawnT = 0.15; s.kx = Math.sin(a) * power; s.kz = Math.cos(a) * power; s.y = 0.2; s.vy = 5 + Math.random() * 2; }
    }
  }

  // ---- 폭발 (연쇄) ----
  //  hurtsPlayer: 자폭 드론 폭발은 플레이어도 다친다. 약간의 지연 뒤에 터져서 연쇄가 눈에 보인다
  blast(x, z, r, dmg, hurtsPlayer = false, delay = 0.06) { if (this.blasts.length < 160) this.blasts.push({ x, z, r, dmg, hurtsPlayer, t: -delay }); }
  updateBlasts(dt) {
    const g = this.game, fx = g.fx, p = g.player;
    let n = 0;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      if (b.t < 0) continue;
      this.blasts.splice(i, 1);
      if (++n > 14) { this.blasts.push(b); b.t = -0.02; continue; } // 한 프레임에 너무 많이 터지지 않게
      g.sfx.play('boom');
      fx.explosion(b.x, 0.5, b.z, Math.min(1.4, b.r * 0.45), { color: b.hurtsPlayer ? [1, 0.35, 0.2] : [1, 0.65, 0.25], scorch: b.r > 2 });
      this.each(b.x, b.z, b.r, (e) => {
        if (e.boss) { this.hit(e, b.dmg * 0.5, 0, 0, 0, { noNum: true }); return; }
        const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz) || 1;
        this.hit(e, b.dmg, dx / d, dz / d, 9, { noNum: true, launch: 3 });
      });
      if (b.hurtsPlayer && Math.hypot(p.x - b.x, p.z - b.z) < b.r + p.r * 0.5) p.hurt(b.dmg * 0.5, (p.x - b.x), (p.z - b.z));
    }
  }
  // 방 클리어: 남은 적이 플레이어 가까운 순서로 줄줄이 터진다
  detonateAll() {
    const p = this.game.player;
    const list = [...this.list].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    list.forEach((e, i) => { e.doomT = 0.15 + i * Math.min(0.03, 1.6 / list.length); });
    this.pending = [];
  }

  // 가장 가까운 적 (보스 포함)
  nearest(x, z, maxR = 1e9, skip = null) {
    let best = null, bd = maxR * maxR;
    for (const e of this.list) {
      if (e === skip || e.spawnT < 0.2 || e.under || e.T.mine) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    const B = this.boss;
    if (B && B !== skip && B.y < 3) { const d = Math.max(0, Math.hypot(B.x - x, B.z - z) - B.r) ** 2; if (d < bd) best = B; }
    return best;
  }

  // 반경 안의 모든 적 (보스 포함)
  each(x, z, r, fn) {
    this.grid.query(x, z, r + 2.1, (e) => { if (!e.dead && !e.under && (e.x - x) ** 2 + (e.z - z) ** 2 < (r + e.r) ** 2) fn(e); });
    const B = this.boss;
    if (B && B.y < 3 && Math.hypot(B.x - x, B.z - z) < r + B.r) fn(B);
  }

  update(dt) {
    const g = this.game, p = g.player, fx = g.fx, depth = Math.max(0, g.rooms.depth);
    if ((g.frame & 15) === 0 || !this.k.ok) this.k = { ...g.rooms.scale(), ok: true };
    this.updatePending(dt);
    this.grid.clear();
    for (const e of this.list) this.grid.insert(e);
    g.rooms.hazards.insertProps(this.grid); // 드럼통, 엄폐물도 무기/폭발에 맞는다 (hazards.js)

    for (const e of this.list) {
      const T = e.T;
      if (e.doomT !== undefined && (e.doomT -= dt) <= 0) { if (!e.dead) { e.hp = 0; this.kill(e); } continue; }
      if (e.dead) continue;
      e.spawnT += dt; e.st += dt;
      if (e.ctrl) { e.flash = Math.max(0, e.flash - dt); continue; } // 수호자 부위: guardians.js 가 움직임
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
      let mx = dx / d, mz = dz / d, sp = e.speed;
      // 탄막 특성 정예: 주기적으로 고리탄
      if (e.affix?.gunner && e.spawnT > 1) { e.gcd = (e.gcd ?? 2) - dt; if (e.gcd < 0.5) e.charging = true; if (e.gcd <= 0) { e.gcd = 3; e.charging = false; this.ring(e.x, e.z, 12, 4.6, T.dmg, 'orb', e.st, 0.9); } }
      if (e.affixes) this.affixTick(e, dt, d);
      if (T.ai) {
        // troops.js 의 적: 각자 ai 가 이동/공격을 정한다
        const c = { dx, dz, d, mx, mz, sp, dt, depth, p, g };
        if (T.ai(this, e, c)) continue;
        ({ mx, mz, sp } = c);
      } else if (e.type === 'tank') {
        // 사거리 안이면 거리 유지 + 포격 (0.5초 예고). 깊을수록 부채꼴 / 연발
        if (d < 8) { sp *= -0.3; }
        else if (d < 11) { sp *= 0.25; }
        e.cd -= dt;
        if (e.cd < 0.5 && d < 14) e.charging = true;
        if (e.cd <= 0) {
          e.charging = false;
          e.shots = (e.shots || 0) + 1;
          e.cd = (3 + Math.random() * 1.5) * (depth >= 5 ? 0.75 : 1);
          if (depth >= 6 && e.shots % 2) e.cd = 0.3; // 빠른 2연발
          if (d < 14) {
            const a = Math.atan2(dx, dz), mx2 = e.x + Math.sin(a) * 0.9, mz2 = e.z + Math.cos(a) * 0.9;
            this.fan(mx2, mz2, a, depth >= 6 ? 5 : depth >= 4 ? 3 : 1, 0.22, 7.5, T.dmg, 'shell', 0.75);
            fx.muzzle([mx2, 0.75, mz2], [Math.sin(a), 0, Math.cos(a)], [1, 0.5, 0.2], 1);
            e.kx -= Math.sin(a) * 2; e.kz -= Math.cos(a) * 2;
          }
        }
        e.yaw = Math.atan2(dx, dz);
      } else if (e.type === 'spinner') {
        // 회전 포대: 거리 유지하며 옆으로 돌고, 예고 후 회전 고리 3파
        const side = Math.sin(g.time * 0.7 + e.seed * 3) > 0 ? 1 : -1, f = d > 9 ? 1 : d < 6 ? -1 : 0;
        mx = (dx / d) * f + (dz / d) * side * 0.8; mz = (dz / d) * f - (dx / d) * side * 0.8;
        e.yaw += dt * (e.state === 'burst' ? 9 : 2);
        if (e.state === 'walk') { e.cd -= dt; e.charging = e.cd < 0.6; if (e.cd <= 0 && d < 15) { e.state = 'burst'; e.st = 0; e.n = 0; e.dir = Math.random() < 0.5 ? 1 : -1; } }
        else {
          sp *= 0.3;
          const n = Math.min(10, 6 + (depth >> 1));
          if (e.st > e.n * 0.2 && e.n < 3) { this.ring(e.x, e.z, n, 4.4, T.dmg, 'orb', e.dir * e.n * 0.22 + e.seed, 1); e.n++; }
          if (e.n >= 3) { e.state = 'walk'; e.cd = 3.2 + Math.random() * 1.5; e.charging = false; }
        }
      } else if (e.type === 'brute') {
        // 걷기 → 예고(번쩍임) → 돌진 → 경직
        if (e.state === 'walk') { e.cd -= dt; if (e.cd <= 0 && d < 10) { e.state = 'wind'; e.st = 0; e.cx = mx; e.cz = mz; } e.yaw = Math.atan2(dx, dz); }
        else if (e.state === 'wind') { sp = 0; e.yaw = Math.atan2(e.cx, e.cz); if (e.st > 0.7) { e.state = 'charge'; e.st = 0; } }
        else if (e.state === 'charge') {
          mx = e.cx; mz = e.cz; sp = 13; if (Math.random() < 0.5) fx.dust(e.x, e.z, 1);
          if (e.st > 0.55) { e.state = 'rest'; e.st = 0; if (depth >= 4) this.ring(e.x, e.z, depth >= 7 ? 12 : 8, 4.2, T.dmg * 0.6, 'shell', Math.random(), 0.6); } // 깊은 방: 돌진 끝 충격파
        }
        else { sp = 0; if (e.st > 0.7) { e.state = 'walk'; e.cd = 2.5 + Math.random() * 2; } }
      } else if (T.swarm) {
        // 벌레: 곧장 달려든다 (개체마다 살짝 다른 각도)
        const w = Math.sin(g.time * 3 + e.seed) * 0.5;
        const c = Math.cos(w), s = Math.sin(w);
        [mx, mz] = [mx * c - mz * s, mx * s + mz * c];
        e.yaw = Math.atan2(mx, mz);
      } else if (T.bomb) {
        // 자폭 드론: 가까이 오면 멈춰서 번쩍이다 터진다
        if (e.state === 'walk' && d < 1.9) { e.state = 'fuse'; e.st = 0; }
        if (e.state === 'fuse') { sp = 0; e.charging = Math.sin(e.st * 40) > 0; if (e.st > 0.55) { e.hp = 0; this.kill(e); continue; } }
        e.yaw = Math.atan2(dx, dz);
      } else {
        // 드론: 살짝 흔들리며 추적. 총 든 드론은 예고 후 조준탄 (깊으면 3갈래)
        const w = Math.sin(g.time * 2 + e.seed) * 0.35;
        const c = Math.cos(w), s = Math.sin(w);
        [mx, mz] = [mx * c - mz * s, mx * s + mz * c];
        e.yaw = Math.atan2(mx, mz);
        if (e.gun) {
          if (d < 5) sp *= 0.4;
          e.cd -= dt; e.charging = e.cd < 0.5 && d < 12;
          if (e.cd <= 0) { e.cd = 3.5 + Math.random() * 2; if (d < 12) this.fan(e.x, e.z, Math.atan2(dx, dz), depth >= 6 ? 3 : 1, 0.28, 5.5, T.dmg, 'orb', 0.9); }
        }
      }
      // 띄워짐 / 경직: 공중에서는 움직이지 못한다
      const air = e.y > T.fly + 0.01 || (e.vy || 0) > 0;
      if (air) {
        e.vy = (e.vy || 0) - 28 * dt; e.y += e.vy * dt;
        if (e.y <= T.fly) { e.y = T.fly; e.vy = 0; e.stun = Math.max(e.stun || 0, 0.3); if (!T.fly) { fx.dust(e.x, e.z, 3); fx.addTrauma(0.03); } }
      }
      if (air || e.stun > 0) {
        sp = 0; e.charging = false; e.cd = Math.max(e.cd, 0.6);
        if (e.stun > 0) e.stun -= dt;
        if (e.state === 'charge' || e.state === 'wind') { e.state = 'rest'; e.st = 0; }
        else if (T.calm && e.state !== 'walk') { e.state = 'walk'; e.st = 0; e.cd = Math.max(e.cd, 1); } // 조준/수리 빔 끊김
      }
      if (e.spawnT < 0.35) sp *= 0.2;
      e.x += (mx * sp + e.kx) * dt;
      e.z += (mz * sp + e.kz) * dt;
      const kd = Math.exp(-7 * dt);
      e.kx *= kd; e.kz *= kd;

      // 서로 밀어내기
      if (!T.swarm || ((e.seed * 1000 + g.frame) & 1)) this.grid.query(e.x, e.z, e.r + 1.1, (o) => {
        if (o === e) return;
        const ox = e.x - o.x, oz = e.z - o.z, rr = e.r + o.r, dd = ox * ox + oz * oz;
        if (dd < rr * rr && dd > 1e-6) {
          const dl = Math.sqrt(dd), push = ((rr - dl) / dl) * 0.5 * (o.T.mass / (o.T.mass + T.mass)) * 1.6;
          e.x += ox * push * 0.5; e.z += oz * push * 0.5;
        }
      });
      if (!T.fly) g.rooms.clamp(e, e.r); else g.rooms.clamp(e, 0.3);

      // 접촉 피해
      if (e.spawnT > 0.3 && !e.under && !T.mine && d < e.r + p.r && e.y < T.fly + 0.6 && !(p.stats.flying && !T.fly)) { // 비행 모드: 지상 적과 부딪혀도 안전
        const dmg = e.state === 'charge' ? T.dmg * 1.5 : T.dmg;
        if (p.hurt(dmg * (e.elite ? 1.5 : 1) * this.k.dmg, dx / d, dz / d)) { e.kx -= mx * 6; e.kz -= mz * 6; }
        // 탱크 다리로 대시 들이받기
        if (p.dashT > 0 && p.stats.ram && e.ramId !== p.dashId) { e.ramId = p.dashId; this.hit(e, p.stats.ram * p.stats.dmgMul, mx, mz, 16); g.hitStop(0.03); }
      }
    }
    // 중간 보스 (체력 바: 가장 먼저 나온 것)
    if (this.mids.length) {
      this.keep = this.k.bul ?? 1;
      for (const m of this.mids) m.update(dt);
      this.keep = 1;
      this.mids = this.mids.filter((m) => !m.dead);
      const m = this.mids[0];
      g.ui.bossBar(m ? Math.max(0.001, m.e.hp / m.e.maxHp) : 0, m && (this.mids.length > 1 ? `${m.name} 외 ${this.mids.length - 1}` : m.name));
    }
    this.updateBoss(dt);
    if (this.guardian) { this.keep = this.k.bul ?? 1; this.guardian.update(dt); this.keep = 1; if (this.guardian.dead && !this.list.some((e) => e.guard === this.guardian)) this.guardian.done = true; }
    this.updateTracks(dt);
    this.updateStrikes(dt);
    this.hazards.flush();
    this.updateBlasts(dt);
    // 처치된 적 정리
    if (this.list.some((e) => e.dead)) this.list = this.list.filter((e) => !e.dead);
    this.render(g.time);
  }

  render(time) {
    const counts = {};
    for (const id in this.meshes) counts[id] = 0;
    let na = 0, nb = 0;
    for (const e of this.list) {
      const M = this.meshes[e.type], i = counts[e.type]++;
      const pop = Math.min(1, e.spawnT / 0.25);
      const s = (e.elite ? 1.35 : 1) * (pop < 1 ? pop * (1.3 - 0.3 * pop) : 1) * (e.vis ?? 1);
      // 정예 특성 고리 (특성마다 하나, 바깥 고리는 반대로 돈다) + 보호막 거품
      if (e.affixes && s > 0.01) {
        e.affixes.forEach((k, j) => {
          if (na >= this.aura.capacity) return;
          const r = e.r * (1.45 + j * 0.4) * (1 + Math.sin(time * 5 + j) * 0.05);
          this.aura.setAt(na++, m4.fromTRS([e.x, e.y + 0.07 + j * 0.02, e.z], [0, (j ? -1 : 1) * time * 2.2 + e.seed, 0], [r, 1, r]), AFFIXES[k].aura, 1);
        });
        if (e.shield > 0 && nb < this.bubble.capacity) {
          const k = e.shield / e.shieldMax, r = e.r * 1.55;
          this.bubble.setAt(nb++, m4.fromTRS([e.x, e.y + e.r * 0.9, e.z], [0, time, 0], [r, r, r]), [0.3 + 0.2 * k, 0.6 + 0.3 * k, 1], 1);
        }
      }
      let y = e.y, roll = (e.y > e.T.fly + 0.05) ? e.vy * 0.08 : 0;
      if (e.T.fly) { y += Math.sin(time * 4 + e.seed) * 0.12; roll = Math.sin(time * 3 + e.seed) * 0.15; }
      if (e.type === 'brute' && e.state === 'wind') y += Math.abs(Math.sin(e.st * 30)) * 0.05;
      const mat = m4.fromTRS([e.x, y, e.z], [e.rx || 0, e.yaw, roll], [s, s, s]);
      const f = e.flash > 0 || (e.state === 'wind' && Math.sin(e.st * 28) > 0);
      const tint = f ? [2.6, 2.6, 2.6] : e.elite ? (e.tint || [1.25, 1.1, 0.7]) : (e.tint || [1, 1, 1]);
      M.body.setAt(i, mat, tint, f ? 0.65 : 0);
      const glowK = e.charging || e.state === 'wind' ? 2.2 : 1;
      const gk = e.exposed ? 1.6 + Math.sin(time * 14) * 0.6 : glowK;
      M.glow.setAt(i, mat, e.elite ? [1.6 * glowK, 1.3 * glowK, 0.4] : [gk, gk, gk], 1);
    }
    for (const id in this.meshes) { this.meshes[id].body.count = counts[id]; this.meshes[id].glow.count = counts[id]; }
    this.aura.count = na; this.bubble.count = nb;
  }

  clear() {
    this.list = []; this.pending = []; this.blasts = []; this.guardian = null; this.mids = []; this.tracks = []; this.strikes = [];
    this.hazards.flush();
    if (this.boss) { this.game.scene.remove(this.boss.mech.root); this.boss = null; }
    this.warn.visible = false;
    this.render(0);
  }
}
