// 중간 보스: 일반 전투 방 중반에 강하하는 탄막 기체 (깊을수록 자주, 여럿)
//  수호자 부위처럼 enemies.list 에 들어가고 (e.ctrl, e.guard = 이 객체) 여기서 움직인다.
//  모든 패턴은 예고(충전 빛, 경고선, 바닥 표식) 뒤에 발사. 체력 50% 아래로 2페이즈 (탄이 늘고 빨라짐).
//
//  나선 포대 (warden): 회전 나선 + 엇갈린 고리 연사 + 조준 부채꼴
//  레이저 랜서 (lancer): 경고선 → 레이저 휩쓸기, 조준 부채꼴, (2페이즈) 회전 십자 레이저
//  하이브 캐리어 (hive): 꽃잎 고리 + 자폭 드론 사출 + 흔들리는 조준 연사
//  박격 포대 (mortar): 바닥 표식 포격 → 착탄 지점 고리탄, 십자 연사

import { Geometry, Mesh, Material } from '../engine/index.js';

const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
const R = Math.random, TAU = Math.PI * 2;
const STEEL = [0.4, 0.42, 0.48], DARK = [0.18, 0.18, 0.22], RED = [0.62, 0.2, 0.22], TEAL = [0.2, 0.5, 0.52], AMBER = [0.85, 0.55, 0.15], VIO = [0.42, 0.26, 0.55];

// ---- 모델 (enemies.js 의 ENEMY_TYPES 에 합쳐진다) ----
export const MIDBOSS_TYPES = {
  warden: {
    name: '나선 포대', hp: 1, speed: 0, r: 1.5, dmg: 16, xp: 30, mass: 50, fly: 0, cap: 3, boom: 2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(1.5, 1.7, 0.6, 8, DARK), [0, 0, 0]);
      add(g, Geometry.cylinder(1.2, 1.4, 0.9, 8, STEEL), [0, 0.6, 0]);
      add(g, Geometry.cylinder(0.9, 1.1, 0.5, 8, RED), [0, 1.5, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        add(g, Geometry.cylinder(0.16, 0.16, 1.1, 6, DARK), [Math.sin(a) * 1.05, 1.75, Math.cos(a) * 1.05], [Math.PI / 2, a, 0]);
        add(glow, Geometry.box(0.22, 0.12, 0.12, [1, 0.3, 0.6]), [Math.sin(a) * 1.55, 1.7, Math.cos(a) * 1.55], [0, a, 0]);
      }
      add(glow, Geometry.icosphere(0.42, 0, [1, 0.25, 0.55]), [0, 2.1, 0]);
      return { g, glow };
    },
  },
  lancer: {
    name: '레이저 랜서', hp: 1, speed: 0, r: 1.3, dmg: 14, xp: 30, mass: 40, fly: 0.6, cap: 3, boom: 2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(1.0, 1, TEAL, { squashY: 0.7 }), [0, 0.9, 0]);
      for (const s of [-1, 1]) {
        add(g, Geometry.box(1.6, 0.18, 0.9, DARK), [s * 1.3, 0.85, -0.2], [0, 0, s * 0.25]);
        add(g, Geometry.box(0.3, 0.3, 1.6, STEEL), [s * 0.75, 0.6, 0.6]);
        add(glow, Geometry.box(0.2, 0.2, 0.1, [0.4, 1, 1]), [s * 0.75, 0.75, 1.42]);
      }
      add(g, Geometry.cylinder(0.22, 0.3, 1.6, 6, STEEL), [0, 0.9, 1.0], [Math.PI / 2, 0, 0]);
      add(glow, Geometry.icosphere(0.3, 0, [0.5, 1, 1]), [0, 0.9, 1.85]);
      add(glow, Geometry.box(0.7, 0.14, 0.1, [0.5, 1, 1]), [0, 1.35, 0.85]);
      return { g, glow };
    },
  },
  hive: {
    name: '하이브 캐리어', hp: 1, speed: 0, r: 1.7, dmg: 16, xp: 30, mass: 60, fly: 0, cap: 3, boom: 2.2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(2.6, 1.0, 2.8, VIO), [0, 0.3, 0]);
      add(g, Geometry.box(2.0, 0.9, 2.0, DARK), [0, 1.3, -0.2]);
      for (const s of [-1, 1]) for (const z of [-1, 1]) add(g, Geometry.box(0.5, 0.5, 0.7, DARK), [s * 1.35, 0, z * 1.0]);
      for (let i = 0; i < 6; i++) {
        const x = -0.6 + (i % 3) * 0.6, z = -0.6 + Math.floor(i / 3) * 0.8;
        add(g, Geometry.cylinder(0.22, 0.22, 0.25, 6, STEEL), [x, 2.2, z]);
        add(glow, Geometry.cylinder(0.14, 0.14, 0.06, 6, [1, 0.4, 0.2]), [x, 2.45, z]);
      }
      add(glow, Geometry.box(1.4, 0.2, 0.08, [1, 0.45, 0.25]), [0, 1.0, 1.42]);
      return { g, glow };
    },
  },
  mortar: {
    name: '박격 포대', hp: 1, speed: 0, r: 1.5, dmg: 16, xp: 30, mass: 60, fly: 0, cap: 3, boom: 2.2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) add(g, Geometry.box(0.6, 0.7, 2.6, DARK), [s * 1.0, 0, 0]);
      add(g, Geometry.box(1.8, 0.8, 2.0, AMBER), [0, 0.6, 0]);
      add(g, Geometry.cylinder(0.75, 0.85, 0.6, 8, STEEL), [0, 1.4, 0]);
      for (const s of [-1, 1]) add(g, Geometry.cylinder(0.3, 0.36, 1.6, 6, DARK), [s * 0.4, 1.9, 0.2], [-0.5, 0, 0]);
      for (const s of [-1, 1]) add(glow, Geometry.cylinder(0.2, 0.2, 0.06, 6, [1, 0.6, 0.2]), [s * 0.4, 2.6, -0.2], [-0.5, 0, 0]);
      add(glow, Geometry.box(0.8, 0.12, 0.08, [1, 0.5, 0.2]), [0, 1.0, 1.02]);
      return { g, glow };
    },
  },
};

export const MIDBOSS_KINDS = Object.keys(MIDBOSS_TYPES);
const HP = { warden: 1, lancer: 0.85, hive: 1.05, mortar: 0.95 };

// ---- 경고선 / 바닥 표식 / 레이저: 매 프레임 그리는 즉시 모드 풀 (titan 도 같이 씀) ----
export class Hazards {
  constructor(scene) {
    const lg = new Geometry();
    lg.merge(Geometry.box(1, 1, 1), { position: [0, 0, 0.5] }); // z 0~1, y 0~1
    const rg = new Geometry();
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU, p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      rg.quad(p(a0, 0.82), p(a1, 0.82), p(a1, 1), p(a0, 1), [1, 1, 1], null, [0, 1, 0]);
    }
    const mk = (geo) => { const m = scene.add(new Mesh(geo, new Material({ color: [1, 0.2, 0.3], emissive: 1, outline: false, castShadow: false, opacity: 0.6 }))); m.visible = false; return m; };
    this.lines = Array.from({ length: 24 }, () => mk(lg));
    this.rings = Array.from({ length: 16 }, () => mk(rg));
    this.nl = this.nr = 0;
  }
  // 선: (x,z) 에서 yaw 방향으로 len 만큼. h>0.2 면 레이저 기둥처럼 보인다
  line(x, z, yaw, len, w, color, opacity = 0.6, y = 0.06, h = 0.04) {
    const m = this.lines[this.nl++];
    if (!m) return;
    m.visible = true; m.position = [x, y, z]; m.rotation = [0, yaw, 0]; m.scale = [w, h, len];
    m.material.color = color; m.material.opacity = opacity;
  }
  ring(x, z, r, color, opacity = 0.6) {
    const m = this.rings[this.nr++];
    if (!m) return;
    m.visible = true; m.position = [x, 0.05, z]; m.scale = [r, 1, r];
    m.material.color = color; m.material.opacity = opacity;
  }
  // 레이저 = 경고(얇고 깜빡) 또는 실제 빔(굵은 기둥 + 흰 심)
  laser(x, z, yaw, len, w, live, t) {
    if (!live) { this.line(x, z, yaw, len, 0.12, [1, 0.25, 0.3], 0.35 + 0.35 * Math.sin(t * 40)); return; }
    this.line(x, z, yaw, len, w, [1, 0.3, 0.55], 0.8, 0.5, 0.9);
    this.line(x, z, yaw, len, w * 0.4, [1, 1, 1], 1, 0.6, 0.7);
  }
  // 프레임 끝: 이번 프레임에 안 그린 것 숨기기
  flush() {
    for (let i = this.nl; i < this.lines.length; i++) this.lines[i].visible = false;
    for (let i = this.nr; i < this.rings.length; i++) this.rings[i].visible = false;
    this.nl = this.nr = 0;
  }
}

// 점 (px,pz) 가 레이저 선분에 닿았는가
export function laserHits(px, pz, x, z, yaw, len, w) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), rx = px - x, rz = pz - z, t = rx * dx + rz * dz;
  if (t < 0 || t > len) return false;
  return Math.abs(rx * dz - rz * dx) < w;
}

export class MidBoss {
  constructor(game, kind, x, z) {
    this.game = game; this.kind = kind; this.t = 0; this.dead = false;
    const en = game.enemies, K = en.k, d = Math.max(1, game.rooms.depth);
    this.name = MIDBOSS_TYPES[kind].name;
    const hp = 1500 * HP[kind] * (1 + d * 0.45) * Math.pow(K.pw, 0.6); // 일반 적보다 전력 보정이 약하다 (방이 늘어지지 않게)
    const e = this.e = en.spawn(kind, x, z, { force: true });
    e.ctrl = true; e.guard = this; e.hp = e.maxHp = hp; e.spawnT = 1; e.y = 16; e.under = true;
    this.vy = 0; this.state = 'drop'; this.st = 0; this.pat = (R() * 3) | 0; this.yaw = 0; this.spin = 0; this.lasers = [];
    this.marks = [];
    game.ui.banner(`중간 보스 강하: ${this.name}`, true);
    game.sfx.play('alarm');
  }
  get phase2() { return this.e.hp < this.e.maxHp * 0.5; }

  dmgMul() { return this.state === 'drop' ? 0 : 1; }
  onKill() {
    const g = this.game, e = this.e;
    this.dead = true;
    g.ui.banner(`${this.name} 격파!`);
    g.sfx.play('bigboom'); g.hitStop(0.12); g.slowMo(0.6); g.fx.addTrauma(0.8);
    g.fx.explosion(e.x, 1.2, e.z, 2.4, { color: [1, 0.5, 0.4] });
    for (let i = 0; i < 12; i++) g.pickups.gem(e.x + (R() - 0.5) * 3, e.z + (R() - 0.5) * 3, 4);
    g.pickups.drop('crate', e.x, e.z);
    if (R() < 0.5) g.pickups.drop('kit', e.x + 1, e.z);
    g.addChips(1, '중간 보스');
    g.shots.enemyList.length = 0; // 격파 순간 탄막 해제
  }

  // 공통: 예고 빛 (충전 중 눈이 밝아짐 + 빛)
  charge(on) { this.e.charging = on; if (on && R() < 0.3) this.game.fx.light([this.e.x, 2, this.e.z], [1, 0.4, 0.6], 4, 0.6, 0.1); }
  next(states) { this.state = states[this.pat++ % states.length]; this.st = 0; this.n = 0; }

  update(dt) {
    if (this.dead) return;
    const g = this.game, p = g.player, fx = g.fx, en = g.enemies, e = this.e, H = en.hazards;
    if (e.dead) { this.dead = true; return; }
    this.t += dt; this.st += dt;
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1, toP = Math.atan2(dx, dz), P2 = this.phase2;
    let sp = 0;
    if (this.state === 'drop') {
      this.vy -= 45 * dt; e.y += this.vy * dt;
      H.ring(e.x, e.z, 3, [1, 0.25, 0.35], 0.35 + 0.35 * Math.sin(this.t * 30));
      if (e.y <= e.T.fly) {
        e.y = e.T.fly; e.under = false; this.state = 'walk'; this.st = 0;
        fx.explosion(e.x, 0.3, e.z, 2.2, { color: [1, 0.5, 0.4] }); fx.ring(e.x, 0.15, e.z, 5, [1, 0.35, 0.5], 0.45);
        fx.addTrauma(0.6); g.sfx.play('bigboom');
        if (d < 3) p.hurt(e.T.dmg * en.k.dmg, dx, dz);
        en.ring(e.x, e.z, 12, 4.5, 10, 'orb', R());
      }
      this.place(); return;
    }
    this[this.kind](dt, { dx, dz, d, toP, P2 });
    sp = this.sp || 0;
    // 이동: 거리를 유지하며 맴돈다
    const keep = this.keep || 7, side = Math.sin(this.t * 0.6 + e.seed) > 0 ? 1 : -1;
    const fwd = d > keep + 1.5 ? 1 : d < keep - 1.5 ? -0.8 : 0;
    const mx = (dx / d) * fwd + (dz / d) * side * 0.6, mz = (dz / d) * fwd - (dx / d) * side * 0.6;
    e.x += mx * sp * dt; e.z += mz * sp * dt;
    g.rooms.clamp(e, e.r * 0.8);
    // 접촉 피해
    if (d < e.r + p.r && !(p.stats.flying && !e.T.fly)) p.hurt(e.T.dmg * en.k.dmg, dx, dz);
    this.place();
  }
  place() { const e = this.e; e.yaw = this.yaw; if (this.kind === 'lancer' && this.state !== 'drop') e.y = e.T.fly + Math.sin(this.t * 3) * 0.15; }

  // ---- 나선 포대 ----
  warden(dt, { toP, P2 }) {
    const e = this.e, en = this.game.enemies, fx = this.game.fx;
    this.keep = 6; this.sp = this.state === 'walk' ? 1.6 : 0.4;
    this.yaw += dt * (this.state === 'spiral' ? (P2 ? 3.4 : 2.6) : 0.5);
    if (this.state === 'walk') { if (this.st > (P2 ? 1.0 : 1.6)) this.next(['spiral', 'rings', 'aimed']); return; }
    const pre = 0.8, live = this.st > pre;
    this.charge(!live);
    if (this.state === 'spiral') {
      // 회전 나선: 팔 2개(2페이즈 3개), 반대로 도는 느린 나선 한 줄
      if (live && (this.acc = (this.acc || 0) + dt) > 0.11) {
        this.acc = 0;
        const arms = P2 ? 3 : 2;
        for (let k = 0; k < arms; k++) en.shoot(e.x, e.z, this.yaw + (k / arms) * TAU, 5, 10, 'orb', 1.6);
        if (P2 && this.n++ % 3 === 0) en.shoot(e.x, e.z, -this.yaw * 1.3, 3.6, 10, 'shell', 1.6);
      }
      if (this.st > pre + 3.2) this.toWalk();
    } else if (this.state === 'rings') {
      // 엇갈린 고리: 틈을 찾아 지나가기
      if (live && this.st > pre + this.n * 0.42 && this.n < (P2 ? 5 : 4)) { en.ring(e.x, e.z, P2 ? 18 : 14, 4.8, 10, 'orb', (this.n % 2) * (Math.PI / (P2 ? 18 : 14)), 1.4); this.n++; e.flash = 0.06; fx.addTrauma(0.08); }
      if (this.st > pre + 2.4) this.toWalk();
    } else if (this.state === 'aimed') {
      if (live && this.st > pre + this.n * 0.3 && this.n < 4) { en.fan(e.x, e.z, toP, P2 ? 7 : 5, 0.2, 7.5, 12, 'shell', 1.4); this.n++; }
      if (this.st > pre + 1.6) this.toWalk();
    }
  }
  toWalk() { this.state = 'walk'; this.st = 0; this.e.charging = false; this.lasers = []; }

  // ---- 레이저 랜서 ----
  lancer(dt, { toP, P2, d }) {
    const e = this.e, g = this.game, en = g.enemies, H = en.hazards, p = g.player;
    this.keep = 8; this.sp = this.state === 'walk' ? 3.2 : 0;
    const turn = (want, k) => { this.yaw += Math.max(-k * dt, Math.min(k * dt, angDiff(want, this.yaw))); };
    if (this.state === 'walk') { turn(toP, 3); if (this.st > (P2 ? 0.9 : 1.4)) this.next(P2 ? ['sweep', 'cross', 'fan', 'sweep'] : ['sweep', 'fan']); return; }
    const L = 22, W = 0.55, dmg = 18 * en.k.dmg;
    if (this.state === 'sweep') {
      // 경고선 (시작 각 + 끝 각) 0.9초 → 빔이 부채꼴로 휩쓴다
      if (!this.n) { this.n = 1; const s = R() < 0.5 ? 1 : -1, arc = P2 ? 2.4 : 1.7; this.a0 = toP - s * arc / 2; this.a1 = toP + s * arc / 2; }
      const pre = 0.9, dur = P2 ? 1.2 : 1.5;
      this.charge(this.st < pre);
      if (this.st < pre) { H.laser(e.x, e.z, this.a0, L, W, false, this.t); H.line(e.x, e.z, this.a1, L, 0.06, [1, 0.3, 0.3], 0.3); this.yaw = this.a0; }
      else {
        const k = Math.min(1, (this.st - pre) / dur), a = this.a0 + (this.a1 - this.a0) * k;
        this.yaw = a; H.laser(e.x, e.z, a, L, W, true, this.t);
        if (R() < 0.5) g.fx.hitSpark([e.x + Math.sin(a) * 1.8, 0.9, e.z + Math.cos(a) * 1.8], [0.5, 1, 1], 2);
        if (laserHits(p.x, p.z, e.x, e.z, a, L, W * 0.5 + p.r * 0.6)) p.hurt(dmg, Math.cos(a), -Math.sin(a));
        if (k >= 1) this.toWalk();
      }
    } else if (this.state === 'cross') {
      // 회전 십자 레이저 (2페이즈)
      const pre = 1.1;
      this.charge(this.st < pre);
      if (!this.n) { this.n = 1; this.dir = R() < 0.5 ? 1 : -1; this.base = toP + Math.PI / 4; }
      const a = this.base + (this.st > pre ? (this.st - pre) * 0.75 * this.dir : 0);
      for (let k = 0; k < 4; k++) {
        const ak = a + (k * Math.PI) / 2;
        H.laser(e.x, e.z, ak, L, W, this.st > pre, this.t);
        if (this.st > pre && laserHits(p.x, p.z, e.x, e.z, ak, L, W * 0.5 + p.r * 0.6)) p.hurt(dmg, Math.cos(ak), -Math.sin(ak));
      }
      this.yaw = a;
      if (this.st > pre + 2.6) this.toWalk();
    } else if (this.state === 'fan') {
      // 조준 부채꼴 3연발 (중앙 경고선)
      turn(toP, 6);
      const pre = 0.5;
      if (this.st < pre) H.line(e.x, e.z, this.yaw, Math.min(d, 14), 0.08, [1, 0.3, 0.3], 0.5);
      this.charge(this.st < pre);
      if (this.st > pre + this.n * 0.35 && this.n < 3) { en.fan(e.x, e.z, this.yaw, P2 ? 9 : 7, 0.16, 8.5, 12, 'shell', 1); this.n++; g.fx.muzzle([e.x + Math.sin(this.yaw) * 1.8, 0.9, e.z + Math.cos(this.yaw) * 1.8], [Math.sin(this.yaw), 0, Math.cos(this.yaw)], [0.5, 1, 1], 2); }
      if (this.st > pre + 1.3) this.toWalk();
    }
  }

  // ---- 하이브 캐리어 ----
  hive(dt, { toP, P2 }) {
    const e = this.e, g = this.game, en = g.enemies, fx = g.fx;
    this.keep = 7; this.sp = this.state === 'walk' ? 1.8 : 0.5;
    this.yaw += angDiff(toP, this.yaw) * Math.min(1, dt * 2);
    if (this.state === 'walk') { if (this.st > (P2 ? 1.0 : 1.5)) this.next(['flower', 'launch', 'stream']); return; }
    const pre = 0.7, live = this.st > pre;
    this.charge(!live);
    if (this.state === 'flower') {
      // 꽃잎: 빠른 고리 / 느린 고리를 반 칸씩 돌려 겹친다
      if (live && this.st > pre + this.n * 0.28 && this.n < (P2 ? 8 : 6)) { const n = 10, sp = this.n % 2 ? 3.4 : 5.6; en.ring(e.x, e.z, n, sp, 10, 'orb', this.n * (Math.PI / n) * 0.5, 1.2); this.n++; }
      if (this.st > pre + 2.4) this.toWalk();
    } else if (this.state === 'launch') {
      // 자폭 드론 사출 (등 뒤 발사구)
      if (live && !this.n) {
        this.n = 1;
        const c = P2 ? 8 : 5;
        for (let i = 0; i < c; i++) { const a = (i / c) * TAU; const b = en.spawn('bomber', e.x + Math.sin(a) * 2.2, e.z + Math.cos(a) * 2.2); if (b) { b.spawnT = 0; b.vy = 6; b.y = 1.5; } }
        fx.ring(e.x, 0.2, e.z, 3.5, [1, 0.45, 0.25], 0.4); g.sfx.play('missile');
        en.ring(e.x, e.z, 8, 4, 10, 'orb', R(), 1.2);
      }
      if (this.st > pre + 1.2) this.toWalk();
    } else if (this.state === 'stream') {
      // 흔들리며 쏟아지는 조준 연사
      if (live && (this.acc = (this.acc || 0) + dt) > (P2 ? 0.07 : 0.1)) {
        this.acc = 0; this.n++;
        const a = toP + Math.sin(this.st * 7) * 0.45;
        en.shoot(e.x, e.z, a, 7, 10, 'shell', 1.2);
        if (P2) en.shoot(e.x, e.z, a + Math.PI, 4.5, 10, 'orb', 1.2);
      }
      if (this.st > pre + 2.2) this.toWalk();
    }
  }

  // ---- 박격 포대 ----
  mortar(dt, { toP, P2 }) {
    const e = this.e, g = this.game, en = g.enemies, fx = g.fx, H = en.hazards, p = g.player;
    this.keep = 9; this.sp = this.state === 'walk' ? 1.5 : 0;
    this.yaw += angDiff(toP, this.yaw) * Math.min(1, dt * 1.5);
    // 떨어지는 포탄 (바닥 표식이 차오르면 착탄)
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.life);
      H.ring(m.x, m.z, m.r * (0.3 + 0.7 * k), [1, 0.45, 0.2], 0.4 + 0.4 * Math.sin(m.t * (k > 0.7 ? 50 : 18)));
      H.ring(m.x, m.z, m.r, [1, 0.25, 0.2], 0.25);
      if (k >= 1) {
        this.marks.splice(i, 1);
        fx.explosion(m.x, 0.4, m.z, 1.4, { color: [1, 0.55, 0.3] }); g.sfx.play('boom'); fx.addTrauma(0.15);
        if (Math.hypot(p.x - m.x, p.z - m.z) < m.r + p.r * 0.5) p.hurt(16 * en.k.dmg, p.x - m.x, p.z - m.z);
        en.ring(m.x, m.z, P2 ? 8 : 6, 3.6, 9, 'orb', R(), 0.8);
      }
    }
    if (this.state === 'walk') { if (this.st > (P2 ? 0.9 : 1.4)) this.next(['barrage', 'cross', 'barrage', 'walk2']); return; }
    const pre = 0.6, live = this.st > pre;
    this.charge(!live);
    if (this.state === 'barrage') {
      // 플레이어 위치 + 예측 위치 + 주변에 포탄
      if (live && this.st > pre + this.n * 0.22 && this.n < (P2 ? 7 : 5)) {
        const lead = this.n === 0 ? 0 : this.n === 1 ? 0.6 : 0, j = this.n < 2 ? 0 : 3.5;
        this.marks.push({ x: p.x + p.vx * lead + (R() - 0.5) * j, z: p.z + p.vz * lead + (R() - 0.5) * j, r: 1.7, t: 0, life: 1.15 });
        this.n++; g.sfx.play('missile'); fx.muzzle([e.x, 2.6, e.z], [0, 1, 0], [1, 0.6, 0.2], 2);
      }
      if (this.st > pre + 1.8) this.toWalk();
    } else if (this.state === 'cross') {
      // 십자 → 엑스자 연사
      if (live && this.st > pre + this.n * 0.16 && this.n < 10) { const off = (Math.floor(this.n / 5) % 2) * Math.PI / 4 + this.yaw; en.ring(e.x, e.z, P2 ? 8 : 4, 6.5, 11, 'shell', off, 1.2); this.n++; }
      if (this.st > pre + 1.9) this.toWalk();
    } else this.toWalk();
  }
}

const angDiff = (a, b) => ((a - b + Math.PI * 3) % TAU) - Math.PI;
