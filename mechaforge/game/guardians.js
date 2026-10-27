// 구역 수호자 (중간 보스) + 부위 파괴
//  각 부위는 enemies.list 의 일반 적처럼 들어가서 조준, 피격, 연쇄 폭발이 그대로 적용된다.
//  e.ctrl = true 인 부위는 기본 AI 대신 여기서 움직인다.
//
//  샌드웜 (사막): 마디로 이어진 거대 기계 벌레. 땅속으로 파고들었다가 플레이어 밑에서 솟구친다.
//                 마디를 부술수록 몸이 짧아지고 머리가 받는 피해가 커진다.
//  크레인 워커 (공장): 양팔(미사일 포대, 집게)을 달고 걷는 거대 기계.
//                 팔이 붙어 있는 동안 몸통은 피해를 25%만 받는다. 팔을 뜯어내면 그 공격이 사라진다.
//  거미 전차 (아무 구역): 다리 4개로 걷다가 플레이어 위로 도약해 내려찍는다.
//                 다리가 남아 있을수록 몸통이 단단하다 (다리 하나에 20%). 다리를 잃으면 주저앉아 도약을 못 하고 포탑처럼 버틴다.
//  히드라 포대 (아무 구역): 목이 긴 머리 3개 (레이저, 산탄, 박격). 머리가 남아 있으면 몸통은 피해를 거의 안 받는다.
//                 머리를 하나씩 끊어 그 공격을 없애고, 다 끊으면 몸통이 노출된다.
//
//  수호자 방마다 어떤 수호자가 나올지는 런마다 다르다 (pickGuardian).

import { Geometry, rng } from '../engine/index.js';
import { laserHits } from './midbosses.js';

const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
const R = Math.random, TAU = Math.PI * 2;
const STEEL = [0.42, 0.43, 0.48], DARK = [0.2, 0.2, 0.24], RUST = [0.6, 0.36, 0.24], SAND = [0.72, 0.6, 0.4], YEL = [0.95, 0.72, 0.18], TEAL = [0.18, 0.42, 0.44];

// 이번 런의 n 번째 수호자 방에 나올 수호자 (첫 방: 샌드웜/거미 전차, 둘째 방: 크레인 워커/히드라 포대)
// zoneKind: 구역이 정한 수호자(worm/crane). 그 계열 안에서 원판/변종 중 하나를 고른다
export function pickGuardian(rooms, zoneKind = null) {
  if (rooms.game.debugGuardian) return rooms.game.debugGuardian;
  const n = Math.max(0, rooms.path.filter((r) => r.reward === 'guardian').length - 1);
  const crane = zoneKind ? zoneKind === 'crane' || zoneKind === 'hydra' : n % 2;
  const pair = crane ? ['crane', 'hydra'] : ['worm', 'spider'];
  return pair[(rng(rooms.seed + 977 + n * 31)() * 2) | 0];
}

// ---- 부위 모델 (enemies.js 의 ENEMY_TYPES 에 합쳐진다) ----
export const GUARDIAN_PARTS = {
  wormHead: {
    name: '샌드웜 머리', hp: 1, speed: 0, r: 1.5, dmg: 8, xp: 20, mass: 60, fly: 0, cap: 1, boom: 2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(1.25, 1, STEEL, { squashY: 0.85 }), [0, 0.6, 0]);
      add(g, Geometry.cylinder(1.1, 1.3, 0.5, 8, DARK), [0, 0.6, -0.4], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, Geometry.cone(0.18, 0.9, 4, SAND), [Math.cos(a) * 0.8, 0.6 + Math.sin(a) * 0.8, 1.1], [Math.PI / 2 - Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]); }
      add(glow, Geometry.icosphere(0.45, 0, [1, 0.35, 0.2]), [0, 0.6, 1.0]);
      return { g, glow };
    },
  },
  wormSeg: {
    name: '샌드웜 마디', hp: 1, speed: 0, r: 1.0, dmg: 4, xp: 4, mass: 30, fly: 0, cap: 20, boom: 1.2, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.95, 0.95, 0.9, 8, STEEL), [0, 0.6, 0], [Math.PI / 2, 0, 0]);
      add(g, Geometry.cylinder(1.02, 1.02, 0.2, 8, RUST), [0, 0.6, 0.3], [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) add(g, Geometry.box(0.3, 0.5, 0.5, DARK), [s * 0.95, 0.3, 0]);
      add(g, Geometry.box(0.25, 0.4, 0.5, SAND), [0, 1.55, 0]);
      add(glow, Geometry.box(0.3, 0.12, 0.3, [1, 0.5, 0.2]), [0, 1.62, 0.1]);
      return { g, glow };
    },
  },
  craneCore: {
    name: '크레인 워커', hp: 1, speed: 0, r: 2.0, dmg: 20, xp: 30, mass: 80, fly: 0, cap: 1, boom: 2.4, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(3.0, 1.4, 2.6, DARK), [0, 1.6, 0]);
      add(g, Geometry.box(2.6, 0.6, 2.2, YEL), [0, 2.6, 0]);
      add(g, Geometry.box(1.2, 0.8, 1.0, STEEL), [0, 3.2, 0.3]);
      for (const [x, z] of [[-1.4, -1.2], [1.4, -1.2], [-1.4, 1.2], [1.4, 1.2]]) {
        add(g, Geometry.box(0.4, 1.4, 0.4, STEEL), [x * 1.25, 0.7, z * 1.25], [z * 0.3, 0, -x * 0.25]);
        add(g, Geometry.box(0.7, 0.2, 0.7, DARK), [x * 1.45, 0.1, z * 1.45]);
      }
      for (let i = -2; i <= 2; i++) add(g, Geometry.box(0.2, 0.08, 0.05, [0.1, 0.1, 0.1]), [i * 0.5, 2.62, 1.12]);
      add(glow, Geometry.box(0.8, 0.25, 0.1, [1, 0.3, 0.25]), [0, 3.3, 0.82]);
      return { g, glow };
    },
  },
  craneGun: {
    name: '미사일 팔', hp: 1, speed: 0, r: 1.1, dmg: 12, xp: 10, mass: 40, fly: 0, cap: 1, boom: 1.6, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(0.5, 0.5, 1.6, STEEL), [0, 2.4, -0.2]);
      add(g, Geometry.box(1.2, 1.0, 1.2, YEL), [0, 2.8, 0.6]);
      for (let i = 0; i < 4; i++) add(g, Geometry.cylinder(0.14, 0.14, 0.3, 6, DARK), [-0.3 + (i % 2) * 0.6, 2.6 + Math.floor(i / 2) * 0.45, 1.25], [Math.PI / 2, 0, 0]);
      add(glow, Geometry.box(0.9, 0.08, 0.06, [1, 0.4, 0.2]), [0, 3.25, 1.22]);
      return { g, glow };
    },
  },
  craneClaw: {
    name: '집게 팔', hp: 1, speed: 0, r: 1.2, dmg: 22, xp: 10, mass: 40, fly: 0, cap: 1, boom: 1.6, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(0.5, 0.5, 1.8, STEEL), [0, 2.2, 0.2]);
      add(g, Geometry.box(0.8, 0.6, 0.6, YEL), [0, 2.0, 1.1]);
      for (const s of [-1, 1]) add(g, Geometry.box(0.18, 0.25, 1.1, DARK), [s * 0.35, 1.5, 1.4], [0.6, 0, 0]);
      add(glow, Geometry.box(0.2, 0.1, 0.06, [1, 0.3, 0.3]), [0, 2.2, 1.42]);
      return { g, glow };
    },
  },
  spiderBody: {
    name: '거미 전차', hp: 1, speed: 0, r: 1.9, dmg: 18, xp: 30, mass: 80, fly: 0, cap: 1, boom: 2.4, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(1.1, 1.1, 0.35, 8, DARK), [0, 1.45, 0.1]);
      add(g, Geometry.box(1.8, 0.9, 1.7, STEEL), [0, 1.75, 0.25]);
      add(g, Geometry.box(1.2, 0.35, 1.2, RUST), [0, 2.65, 0.3]);
      add(g, Geometry.icosphere(1.35, 1, DARK, { squashY: 0.78 }), [0, 2.35, -1.35]);       // 배 (알 주머니)
      add(glow, Geometry.box(0.35, 0.1, 0.9, [1, 0.2, 0.25]), [0, 3.38, -1.35]);
      for (const s of [-1, 1]) {
        add(g, Geometry.cylinder(0.13, 0.13, 1.3, 6, DARK), [s * 0.38, 2.2, 0.9], [Math.PI / 2, 0, 0]);
        add(glow, Geometry.box(0.1, 0.1, 0.06, [1, 0.5, 0.2]), [s * 0.38, 2.2, 2.22]);
      }
      for (const [x, y] of [[-0.42, 1.95], [0.42, 1.95], [-0.2, 2.15], [0.2, 2.15]]) add(glow, Geometry.box(0.14, 0.12, 0.06, [1, 0.15, 0.2]), [x, y, 1.12]);
      return { g, glow };
    },
  },
  spiderLeg: {
    // 발끝이 원점, 몸통 쪽이 -z (yaw = 몸통에서 바깥쪽 방향)
    name: '거미 다리', hp: 1, speed: 0, r: 0.85, dmg: 10, xp: 10, mass: 40, fly: 0, cap: 4, boom: 1.4, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cone(0.24, 0.55, 4, DARK), [0, 0.55, 0], [Math.PI, 0, 0]);
      add(g, Geometry.box(0.32, 2.6, 0.32, STEEL), [0, 0.4, -0.25], [-0.2, 0, 0]);
      add(g, Geometry.icosphere(0.34, 0, DARK), [0, 2.95, -0.8]);
      add(g, Geometry.box(0.28, 0.28, 1.4, RUST), [0, 2.45, -1.45], [-0.75, 0, 0]);
      add(g, Geometry.cylinder(0.08, 0.08, 0.5, 5, DARK), [0, 2.95, -0.55], [Math.PI / 2, 0, 0]);
      add(glow, Geometry.box(0.14, 0.14, 0.14, [1, 0.3, 0.2]), [0, 3.22, -0.8]);
      return { g, glow };
    },
  },
  hydraCore: {
    name: '히드라 포대', hp: 1, speed: 0, r: 2.1, dmg: 20, xp: 30, mass: 90, fly: 0, cap: 1, boom: 2.6, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(2.0, 2.3, 1.0, 8, DARK), [0, 0, 0]);
      add(g, Geometry.icosphere(1.65, 1, TEAL, { squashY: 0.6 }), [0, 1.1, 0]);
      add(g, Geometry.cylinder(0.9, 1.1, 0.4, 8, STEEL), [0, 1.8, 0]);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; add(g, Geometry.box(0.3, 0.6, 0.3, YEL), [Math.sin(a) * 2.1, 0.2, Math.cos(a) * 2.1], [0, a, 0]); }
      for (let i = 0; i < 3; i++) { const a = (i - 1) * 1.0; add(g, Geometry.cylinder(0.45, 0.55, 0.5, 6, STEEL), [Math.sin(a) * 1.0, 1.75, Math.cos(a) * 1.0]); }
      add(glow, Geometry.cylinder(0.6, 0.6, 0.1, 8, [0.4, 1, 0.9]), [0, 2.2, 0]);
      return { g, glow };
    },
  },
  hydraHead: {
    name: '히드라 머리', hp: 1, speed: 0, r: 1.0, dmg: 14, xp: 12, mass: 40, fly: 0, cap: 3, boom: 1.6, part: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(0.9, 0.7, 1.4, STEEL), [0, -0.3, -0.2]);
      add(g, Geometry.box(0.8, 0.22, 1.1, DARK), [0, -0.55, 0.25], [0.25, 0, 0]);               // 아래턱
      add(g, Geometry.prism(0.95, 0.35, 1.2, TEAL), [0, 0.4, -0.25]);
      for (const s of [-1, 1]) add(g, Geometry.cone(0.1, 0.55, 4, YEL), [s * 0.3, 0.45, -0.6], [-1.2, 0, s * 0.3]);
      add(g, Geometry.cylinder(0.2, 0.22, 0.4, 6, DARK), [0, -0.15, 0.55], [Math.PI / 2, 0, 0]);
      for (const s of [-1, 1]) add(glow, Geometry.box(0.16, 0.1, 0.05, [1, 0.3, 0.25]), [s * 0.3, 0.15, 0.51]);
      add(glow, Geometry.cylinder(0.12, 0.12, 0.05, 6, [1, 0.7, 0.3]), [0, -0.15, 0.96], [Math.PI / 2, 0, 0]);
      return { g, glow };
    },
  },
  hydraNeck: {
    // 장식 (맞지 않는다)
    name: '히드라 목', hp: 1, speed: 0, r: 0.1, dmg: 0, xp: 0, mass: 99, fly: 0, cap: 15, boom: 0.5, part: true, inert: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.42, 0, STEEL), [0, 0, 0]);
      add(g, Geometry.cylinder(0.46, 0.46, 0.14, 6, DARK), [0, -0.07, 0]);
      add(glow, Geometry.box(0.1, 0.1, 0.1, [0.4, 1, 0.9]), [0, 0.38, 0]);
      return { g, glow };
    },
  },
};

const LEG_ANG = [0.75, -0.75, 2.3, -2.3]; // 거미 다리 방향 (몸통 기준): 앞 왼/오, 뒤 왼/오
const HEAD_KIND = ['laser', 'flak', 'mortar'], HEAD_TINT = { laser: [0.7, 1.15, 1.4], flak: [1.45, 0.85, 0.6], mortar: [1.3, 1.25, 0.55] };

export class Guardian {
  constructor(game, kind) {
    this.game = game; this.kind = kind; this.t = 0; this.state = 'intro'; this.st = 0; this.dead = false;
    const en = game.enemies, d = Math.max(1, game.rooms.depth);
    const pw = (0.6 + game.level * 0.1) * Math.pow(en.k.pw, 0.55) * game.rooms.guardHp(); // 플레이어 성장(레벨 + 무기 전력)에 맞춰 체력 보정. 깊이별 배율 (rooms.js CURVE guard: 첫 수호자 ×0.6, 둘째 ×0.75)
    const mk = (type, hp, x, z) => { const e = en.spawn(type, x, z, { force: true }); e.ctrl = true; e.hp = e.maxHp = hp; e.guard = this; e.spawnT = 1; return e; };
    if (kind === 'worm') {
      this.name = '샌드웜';
      this.head = mk('wormHead', (2000 + d * 300) * pw, 0, -6);
      this.head.y = -3;
      this.segs = [];
      for (let i = 0; i < 12; i++) { const s = mk('wormSeg', (190 + d * 30) * pw, 0, -6 - i); s.y = -3; this.segs.push(s); }
      this.total = this.segs.length;
      this.trail = []; // 머리가 지나간 자리 (마디가 따라감)
      this.hx = 0; this.hz = -6; this.hy = -3; this.hyaw = 0;
      this.state = 'under'; this.st = 0.4; this.tx = 0; this.tz = 0;
    } else if (kind === 'crane') {
      this.name = '크레인 워커';
      this.core = mk('craneCore', (4200 + d * 520) * pw, 0, -5);
      this.gun = mk('craneGun', (950 + d * 110) * pw, -2.4, -5);
      this.claw = mk('craneClaw', (1000 + d * 110) * pw, 2.4, -5);
      this.x = 0; this.z = -5; this.yaw = 0; this.y = 18; this.vy = 0;
      this.state = 'drop';
      game.enemies.warn.visible = true; game.enemies.warn.position = [0, 0.05, -5]; game.enemies.warn.scale = [3.5, 1, 3.5];
    } else if (kind === 'spider') {
      this.name = '거미 전차';
      this.body = mk('spiderBody', (3800 + d * 480) * pw, 0, -5);
      this.legs = LEG_ANG.map((a) => { const l = mk('spiderLeg', (800 + d * 100) * pw, Math.sin(a) * 2.6, -5 + Math.cos(a) * 2.6); l.a = a; l.fx = l.x; l.fz = l.z; l.lift = 0; return l; });
      this.x = 0; this.z = -5; this.yaw = 0; this.y = 16; this.vy = 0;
      this.state = 'drop';
      game.enemies.warn.visible = true; game.enemies.warn.position = [0, 0.05, -5]; game.enemies.warn.scale = [3.5, 1, 3.5];
    } else {
      this.name = '히드라 포대';
      this.core = mk('hydraCore', (4400 + d * 520) * pw, 0, -5);
      this.core.y = -3;
      this.heads = HEAD_KIND.map((k, i) => { const h = mk('hydraHead', (900 + d * 105) * pw, (i - 1) * 3, -2); h.kind = k; h.tint = HEAD_TINT[k]; h.i = i; h.cd = 2 + i * 1.2; h.y = -3; return h; });
      this.necks = this.heads.map(() => Array.from({ length: 5 }, () => { const n = mk('hydraNeck', 1, 0, -5); n.under = true; n.y = -3; return n; }));
      this.x = 0; this.z = -5; this.yaw = 0; this.rise = 0;
      this.state = 'rise'; this.st = 1.6;
      game.sfx.play('door');
    }
    game.ui.bossBar(1, this.name);
    game.ui.banner(`경고: 구역 수호자 ${this.name}`, true);
    game.ui.enemyIntro?.(this.kind, true);
    game.sfx.play('alarm');
  }

  // 부위 피해 보정 (부위 파괴 규칙)
  dmgMul(e) {
    if (this.kind === 'worm' && e === this.head) return 0.5 + 0.5 * (1 - this.segs.filter((s) => !s.dead).length / this.total);
    if (this.kind === 'crane' && e === this.core) return (!this.gun.dead || !this.claw.dead) ? 0.25 : 1;
    if ((this.kind === 'spider' && this.state === 'drop') || (this.kind === 'hydra' && this.state === 'rise')) return 0; // 등장 중
    if (this.kind === 'spider' && e === this.body) return 0.2 + 0.2 * this.legs.filter((l) => l.dead).length;
    if (this.kind === 'hydra' && e === this.core) return [1, 0.7, 0.4, 0.1][this.heads.filter((h) => !h.dead).length];
    return 1;
  }
  get main() { return { worm: this.head, crane: this.core, spider: this.body, hydra: this.core }[this.kind]; }
  get parts() { return { worm: () => [this.head, ...this.segs], crane: () => [this.core, this.gun, this.claw], spider: () => [this.body, ...this.legs], hydra: () => [this.core, ...this.heads, ...this.necks.flat()] }[this.kind](); }
  onKill(e) {
    const g = this.game;
    if (e === this.main) return this.die();
    if (this.kind === 'worm') {
      g.ui.toast('마디 파괴! 머리 장갑이 약해진다');
      if (this.segs.filter((s) => s.dead).length % 4 === 1) g.pickups.salvage('module', 'armor', e.x, e.z);
      g.hitStop(0.05); g.fx.addTrauma(0.3);
    } else if (this.kind === 'spider') {
      const left = this.legs.filter((l) => !l.dead).length;
      g.ui.toast(left ? `다리 파괴! 몸통 장갑 약화 (남은 다리 ${left})` : '다리 전부 파괴!');
      if (left === 3 || left === 1) g.pickups.salvage('module', left === 3 ? 'booster' : 'armor', e.x, e.z);
      g.hitStop(0.08); g.fx.addTrauma(0.45); g.sfx.play('bigboom');
      if (left === 1) g.ui.banner('거미 전차 주저앉음! 도약 불가', true);
      if (!left) g.ui.banner('몸통 노출! 지금이다');
    } else if (this.kind === 'hydra') {
      const left = this.heads.filter((h) => !h.dead).length;
      g.ui.toast(`${{ laser: '레이저', flak: '산탄', mortar: '박격' }[e.kind]} 머리 절단!`);
      this.necks[e.i].forEach((n, i) => { n.doomT = 0.05 + i * 0.07; });
      if (e.kind === 'laser') g.pickups.salvage('weapon', 'laser', e.x, e.z);
      else if (e.kind === 'flak') g.pickups.salvage('weapon', 'shotgun', e.x, e.z);
      g.hitStop(0.08); g.fx.addTrauma(0.45); g.sfx.play('bigboom');
      if (!left) g.ui.banner('몸통 노출! 지금이다');
    } else {
      g.ui.toast(e === this.gun ? '미사일 팔 파괴!' : '집게 팔 파괴!');
      g.pickups.salvage(e === this.gun ? 'weapon' : 'module', e === this.gun ? 'missile' : 'spike', e.x, e.z);
      g.hitStop(0.08); g.fx.addTrauma(0.45); g.sfx.play('bigboom');
      if (this.gun.dead && this.claw.dead) g.ui.banner('몸통 노출! 지금이다');
    }
  }
  die() {
    const g = this.game;
    this.dead = true;
    this.parts.forEach((p, i) => { if (!p.dead) p.doomT = 0.1 + i * 0.08; });
    g.ui.bossBar(0); g.ui.banner(`${this.name} 격파!`);
    g.sfx.play('bigboom'); g.hitStop(0.15); g.slowMo(1.0); g.fx.addTrauma(1);
    const c = this.main;
    for (let i = 0; i < 18; i++) g.pickups.gem(c.x + (R() - 0.5) * 4, c.z + (R() - 0.5) * 4, 5);
    g.pickups.salvage('weapon', 'cannon', c.x, c.z);
    g.pickups.drop('crate', c.x + 1, c.z);
    g.enemies.warn.visible = false;
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt; this.st -= dt;
    ({ worm: this.updateWorm, crane: this.updateCrane, spider: this.updateSpider, hydra: this.updateHydra })[this.kind].call(this, dt);
    const c = this.main;
    this.game.ui.bossBar(Math.max(0.001, c.hp / c.maxHp), this.name);
  }

  // ---------- 거미 전차 ----------
  updateSpider(dt) {
    const g = this.game, p = g.player, fx = g.fx, en = g.enemies, B = this.body, H = en.hazards;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1, toP = Math.atan2(dx, dz);
    const alive = this.legs.filter((l) => !l.dead), n = alive.length;
    const rage = n <= 2 || B.hp < B.maxHp * 0.5;
    if (rage && !this.rage) { this.rage = true; g.ui.banner('거미 전차 분노!', true); g.sfx.play('alarm'); }
    let sp = 0, bodyY = -0.28 * (4 - n); // 다리를 잃을수록 주저앉는다
    if (this.state === 'drop' || this.state === 'fall') {
      this.vy -= 50 * dt; this.y += this.vy * dt;
      if (this.state === 'fall') { const k = Math.min(1, this.air / 0.9); this.air += dt; this.x = this.sx + (this.tx - this.sx) * k; this.z = this.sz + (this.tz - this.sz) * k; }
      en.warn.material.opacity = 0.35 + 0.35 * Math.sin(this.t * 30);
      if (this.y <= 0 && this.vy < 0) {
        this.y = 0; en.warn.visible = false;
        fx.explosion(this.x, 0.3, this.z, 2.4, { color: [1, 0.6, 0.3] }); fx.addTrauma(0.7); g.sfx.play('bigboom'); g.hitStop(0.08);
        for (let i = 0; i < 10; i++) fx.dust(this.x + (R() - 0.5) * 5, this.z + (R() - 0.5) * 5, 1);
        if (Math.hypot(p.x - this.x, p.z - this.z) < 3.8) p.hurt(B.T.dmg * 1.3 * en.k.dmg, p.x - this.x, p.z - this.z);
        if (this.state === 'fall') en.ring(this.x, this.z, rage ? 24 : 16, 4.6, 10, 'shell', R(), 0.8);
        for (const l of alive) { l.fx = this.x + Math.sin(this.yaw + l.a) * 2.6; l.fz = this.z + Math.cos(this.yaw + l.a) * 2.6; }
        this.state = 'walk'; this.st = 1.4;
      }
    } else if (this.state === 'walk') {
      this.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, angDiff(toP, this.yaw)));
      sp = d > 5 ? 2.6 * Math.max(0.3, n / 4) * (rage ? 1.2 : 1) : 0;
      if (this.st <= 0) {
        const opts = ['web'];
        if (n >= 2) opts.push('leap', 'leap');
        if (n) opts.push('legfire');
        if (this.brood !== true) opts.push('brood');
        if (rage) opts.push('spiral');
        this.state = opts[(R() * opts.length) | 0]; this.st = 0; this.shots = 0;
        if (this.state === 'brood') this.brood = true; else if (this.state === 'leap') this.brood = false;
      }
    } else {
      this.st += dt * 2; // update() 가 매 프레임 dt 를 빼므로 순증가 dt
      if (this.state === 'leap') {
        // 웅크림 (깜빡) → 플레이어 예측 위치로 도약
        bodyY -= Math.min(0.5, this.st);
        B.flash = Math.sin(this.st * 30) > 0 ? 0.04 : 0;
        if (this.st > 0.7) {
          this.state = 'fall'; this.vy = 22; this.air = 0; this.sx = this.x; this.sz = this.z;
          this.tx = p.x + p.vx * 0.5; this.tz = p.z + p.vz * 0.5;
          const RM = g.rooms; this.tx = Math.max(-RM.hx + 3, Math.min(RM.hx - 3, this.tx)); this.tz = Math.max(-RM.hz + 3, Math.min(RM.hz - 3, this.tz));
          en.warn.visible = true; en.warn.position = [this.tx, 0.05, this.tz]; en.warn.scale = [3.8, 1, 3.8];
          g.sfx.play('dash');
        }
      } else if (this.state === 'legfire') {
        // 남은 다리마다 무릎 포에서 부채꼴 3번 (다리를 부수면 줄어든다)
        if (this.st > 0.5 + this.shots * 0.45 && this.shots < 3) {
          for (const l of alive) { en.fan(l.x, l.z, Math.atan2(p.x - l.x, p.z - l.z), 3, 0.22, 7, 10, 'shell', 2.6); fx.muzzle([l.x, 2.9, l.z], [0, 0, 1], [1, 0.5, 0.2], 1); }
          this.shots++; g.sfx.play('shotgun', { vol: 0.5 });
        }
        for (const l of alive) l.charging = this.st < 0.5;
        if (this.st > 2) { this.state = 'walk'; this.st = 1.5; for (const l of alive) l.charging = false; }
      } else if (this.state === 'web') {
        // 거미줄: 플레이어 둘레 표식 → 틈 하나 남긴 고리가 조여 온다 (분노: 두 겹)
        if (!this.shots) { this.shots = 1; this.cx = p.x; this.cz = p.z; }
        if (this.st < 0.8) H.ring(this.cx, this.cz, 7.5, [1, 0.3, 0.4], 0.3 + 0.4 * Math.sin(this.st * 30));
        else if (this.shots === 1) { this.shots = 2; en.converge(this.cx, this.cz, 7.5, 30, 3, 10, 3); if (rage) en.converge(this.cx, this.cz, 9.5, 30, 3, 10, 3); B.flash = 0.06; }
        if (this.st > 1.6) { this.state = 'walk'; this.st = 1.3; }
      } else if (this.state === 'brood') {
        // 알 주머니: 분열 기체 + 벌레 떼를 뒤로 쏟는다
        if (this.st > 0.6 && !this.shots) {
          this.shots = 1;
          const bx = this.x - Math.sin(this.yaw) * 2.2, bz = this.z - Math.cos(this.yaw) * 2.2;
          en.spill('splitter', bx, bz, rage ? 3 : 2, 6);
          en.pack('mite', bx, bz, 10, 2);
          fx.explosion(bx, 2, bz, 1, { color: [0.6, 1, 0.4], scorch: false }); g.sfx.play('pop');
        }
        if (this.st > 1.4) { this.state = 'walk'; this.st = 1.6; }
      } else if (this.state === 'spiral') {
        if (this.st < 0.6) B.flash = Math.sin(this.st * 30) > 0 ? 0.04 : 0;
        else if ((this.acc = (this.acc || 0) + dt) > 0.1) { this.acc = 0; this.spin = (this.spin || 0) + 0.25; for (let k = 0; k < 3; k++) en.shoot(this.x, this.z, this.spin + (k / 3) * TAU, 5, 11, 'orb', 2.4); }
        if (this.st > 3.2) { this.state = 'walk'; this.st = 1.4; }
      }
    }
    if (this.state === 'fall' || this.state === 'drop') bodyY = 0;
    this.x += Math.sin(this.yaw) * sp * dt; this.z += Math.cos(this.yaw) * sp * dt;
    const RM = g.rooms;
    this.x = Math.max(-RM.hx + 2.5, Math.min(RM.hx - 2.5, this.x)); this.z = Math.max(-RM.hz + 2.5, Math.min(RM.hz - 2.5, this.z));
    this.by = (this.by ?? 0) + (bodyY - (this.by ?? 0)) * Math.min(1, dt * 6);
    B.x = this.x; B.z = this.z; B.y = this.y + this.by; B.yaw = this.yaw;
    B.exposed = !n;
    // 다리: 발을 디딘 자리를 유지하다 너무 멀어지면 한 걸음 (대각선 짝끼리 번갈아)
    const airborne = this.state === 'fall' || this.state === 'drop';
    for (const l of alive) {
      const ix = this.x + Math.sin(this.yaw + l.a) * 2.6, iz = this.z + Math.cos(this.yaw + l.a) * 2.6;
      if (airborne) { l.fx = ix; l.fz = iz; l.lift = 0; l.x = ix; l.z = iz; l.y = this.y; }
      else {
        if (l.step === undefined && Math.hypot(ix - l.fx, iz - l.fz) > 1.2 && !alive.some((o) => o.step !== undefined && (o.a > 0) === (l.a > 0))) l.step = 0;
        if (l.step !== undefined) {
          l.step += dt / 0.22;
          const k = Math.min(1, l.step);
          l.x = l.fx + (ix + (ix - l.fx) * 0.3 - l.fx) * k; l.z = l.fz + (iz + (iz - l.fz) * 0.3 - l.fz) * k; l.y = Math.sin(k * Math.PI) * 0.8;
          if (k >= 1) { l.fx = l.x; l.fz = l.z; l.step = undefined; l.y = 0; if (R() < 0.5) fx.dust(l.x, l.z, 1); }
        } else { l.x = l.fx; l.z = l.fz; l.y = 0; }
      }
      l.yaw = Math.atan2(l.x - this.x, l.z - this.z);
    }
    if (!n && R() < 0.3) fx.sparks.emit({ position: [this.x + (R() - 0.5) * 2, 2, this.z + (R() - 0.5) * 2], velocity: [0, 3, 0], life: 0.3, size: 2, sizeEnd: 1, color: [1, 0.8, 0.3], colorEnd: [1, 0.3, 0.1], emissive: 1, gravity: 1 });
    // 접촉 피해 (공중에서는 없음)
    if (this.y < 1 && d < B.r + p.r) p.hurt(B.T.dmg * en.k.dmg, dx, dz);
    for (const l of alive) if (this.y < 1 && l.y < 0.5 && Math.hypot(p.x - l.x, p.z - l.z) < l.r * 0.7 + p.r) p.hurt(l.T.dmg * en.k.dmg, p.x - l.x, p.z - l.z);
  }

  // ---------- 히드라 포대 ----------
  updateHydra(dt) {
    const g = this.game, p = g.player, fx = g.fx, en = g.enemies, C = this.core, H = en.hazards;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1, toP = Math.atan2(dx, dz);
    const alive = this.heads.filter((h) => !h.dead), exposed = !alive.length, rage = alive.length <= 1;
    if (this.state === 'rise') {
      // 바닥을 뚫고 솟아오른다
      this.rise = Math.min(1, this.rise + dt / 1.4);
      if (R() < 0.6) fx.dust(this.x + (R() - 0.5) * 4, this.z + (R() - 0.5) * 4, 1);
      fx.addTrauma(0.02);
      if (this.rise >= 1) { this.state = 'walk'; this.st = 2; fx.addTrauma(0.6); g.sfx.play('bigboom'); en.ring(this.x, this.z, 16, 4.5, 10, 'orb', R(), 1.2); }
    } else {
      this.yaw += Math.max(-0.6 * dt, Math.min(0.6 * dt, angDiff(toP, this.yaw)));
      const sp = d > 6 ? (exposed ? 1.8 : 0.9) : 0;
      this.x += Math.sin(this.yaw) * sp * dt; this.z += Math.cos(this.yaw) * sp * dt;
      const RM = g.rooms;
      this.x = Math.max(-RM.hx + 3, Math.min(RM.hx - 3, this.x)); this.z = Math.max(-RM.hz + 3, Math.min(RM.hz - 3, this.z));
      // 몸통: 주기적으로 고리탄. 노출되면 나선 + 조여 오는 고리
      if (this.st <= 0) {
        if (!exposed) { en.ring(this.x, this.z, rage ? 20 : 14, 4.4, 10, 'orb', R(), 1.4); this.st = rage ? 3 : 4.5; C.flash = 0.06; }
        else if (!this.spinT) { this.spinT = 2.6; this.st = 4; }
        else { en.converge(p.x, p.z, 8, 30, 3.4, 10, 3); this.st = 3; }
      }
      if (this.spinT > 0) { this.spinT -= dt; if ((this.acc = (this.acc || 0) + dt) > 0.1) { this.acc = 0; this.spin = (this.spin || 0) + 0.23; for (let k = 0; k < 3; k++) en.shoot(this.x, this.z, this.spin + (k / 3) * TAU, 5, 11, 'orb', 1.6); } if (this.spinT <= 0) this.spinT = 0; }
      // 머리마다 따로 공격
      for (const h of alive) this.hydraHead(h, dt, rage);
    }
    // 배치: 몸통 + 머리 (몸통 앞쪽 부채꼴, 흔들림) + 목 마디 (위로 휜 곡선)
    const lift = -3 + 3 * this.rise;
    C.x = this.x; C.z = this.z; C.y = lift; C.yaw = this.yaw; C.exposed = exposed;
    for (const h of this.heads) {
      if (h.dead) continue;
      const a = this.yaw + (h.i - 1) * 1.0 + Math.sin(this.t * 0.9 + h.i * 2) * 0.25, r = 3.6 + Math.sin(this.t * 1.3 + h.i) * 0.4 + (h.lunge || 0);
      h.x = this.x + Math.sin(a) * r; h.z = this.z + Math.cos(a) * r; h.y = lift + 2.6 + Math.sin(this.t * 2 + h.i * 1.7) * 0.3;
      if (h.aim === undefined) h.yaw = Math.atan2(p.x - h.x, p.z - h.z); else h.yaw = h.aim;
      h.under = this.state === 'rise';
      const ns = this.necks[h.i];
      ns.forEach((nk, j) => {
        if (nk.dead) return;
        const k = (j + 1) / (ns.length + 1);
        nk.x = this.x + (h.x - this.x) * k; nk.z = this.z + (h.z - this.z) * k;
        nk.y = lift + 1.9 + (h.y - lift - 1.9) * k + Math.sin(k * Math.PI) * 1.1 - 0.42;
      });
    }
    if (exposed && R() < 0.3) fx.sparks.emit({ position: [this.x + (R() - 0.5) * 2, 2.2, this.z + (R() - 0.5) * 2], velocity: [0, 3, 0], life: 0.3, size: 2, sizeEnd: 1, color: [0.5, 1, 0.9], colorEnd: [0.2, 0.4, 1], emissive: 1, gravity: 1 });
    if (this.rise >= 1 && d < C.r + p.r) p.hurt(C.T.dmg * en.k.dmg, dx, dz);
  }
  hydraHead(h, dt, rage) {
    const g = this.game, p = g.player, en = g.enemies, H = en.hazards, fx = g.fx;
    const toP = Math.atan2(p.x - h.x, p.z - h.z);
    if (!h.mode) {
      h.cd -= dt * (rage ? 1.5 : 1);
      h.charging = h.cd < 0.4;
      if (h.cd <= 0) { h.mode = h.kind; h.t = 0; h.n = 0; }
      return;
    }
    h.t += dt;
    const done = (cd) => { h.mode = null; h.cd = cd; h.aim = undefined; h.charging = false; h.lunge = 0; };
    if (h.mode === 'laser') {
      // 경고선 0.9초 → 1초 동안 부채꼴로 휩쓸기
      const L = 16, W = 0.55, pre = 0.9;
      if (!h.n) { h.n = 1; const s = R() < 0.5 ? 1 : -1; h.a0 = toP - s * 0.7; h.a1 = toP + s * 0.7; }
      const k = Math.max(0, Math.min(1, (h.t - pre) / 1.0)), a = h.a0 + (h.a1 - h.a0) * k;
      h.aim = a; h.charging = h.t < pre;
      if (h.t < pre) { H.laser(h.x, h.z, h.a0, L, W, false, h.t); H.line(h.x, h.z, h.a1, L, 0.06, [1, 0.3, 0.3], 0.3); }
      else {
        H.laser(h.x, h.z, a, L, W, true, h.t);
        if (laserHits(p.x, p.z, h.x, h.z, a, L, W * 0.5 + p.r * 0.6)) p.hurt(16 * en.k.dmg, Math.cos(a), -Math.sin(a));
      }
      if (h.t > pre + 1.0) done(3.6);
    } else if (h.mode === 'flak') {
      // 고개를 뒤로 젖혔다가 (예고) 부채꼴 산탄 3번
      h.lunge = h.t < 0.45 ? -0.6 * (h.t / 0.45) : 0; h.charging = h.t < 0.45;
      if (h.t > 0.45 + h.n * 0.3 && h.n < 3) { en.fan(h.x, h.z, toP, rage ? 7 : 5, 0.18, 8, 11, 'shell', h.y); h.n++; fx.muzzle([h.x, h.y, h.z], [Math.sin(toP), 0, Math.cos(toP)], [1, 0.6, 0.2], 2); g.sfx.play('shotgun', { vol: 0.5 }); }
      if (h.t > 1.5) done(3.2);
    } else {
      // 박격: 하늘로 포탄 → 플레이어 근처 바닥 표식 4개
      h.aim = Math.atan2(p.x - h.x, p.z - h.z); h.charging = h.t < 0.4;
      if (h.t > 0.4 + h.n * 0.2 && h.n < (rage ? 6 : 4)) {
        const lead = h.n === 0 ? 0 : 0.5, j = h.n < 2 ? 0 : 3;
        en.strike(p.x + p.vx * lead + (R() - 0.5) * j, p.z + p.vz * lead + (R() - 0.5) * j, 1.6, 1.1, 14, 6);
        h.n++; g.sfx.play('missile', { vol: 0.5 }); fx.muzzle([h.x, h.y + 0.5, h.z], [0, 1, 0], [1, 0.7, 0.3], 2);
      }
      if (h.t > 1.8) done(3.8);
    }
  }

  // ---------- 샌드웜 ----------
  updateWorm(dt) {
    const g = this.game, p = g.player, fx = g.fx, en = g.enemies, H = this.head;
    const dx = p.x - this.hx, dz = p.z - this.hz, d = Math.hypot(dx, dz) || 1;
    if (!this.rage && (this.segs.filter((s) => s.dead).length >= this.total / 2 || H.hp < H.maxHp * 0.5)) { this.rage = true; g.ui.banner('샌드웜 분노!', true); g.sfx.play('alarm'); }
    let speed = this.rage ? 5.2 : 4.4, targetY = 0;
    if (this.state === 'swim') {
      // 지그재그로 다가오며 마디에서 탄을 뿌린다
      const want = Math.atan2(dx, dz) + Math.sin(this.t * 1.3) * 0.9;
      this.hyaw += Math.max(-2.2 * dt, Math.min(2.2 * dt, angDiff(want, this.hyaw)));
      if (this.st <= 0) { this.state = 'dive'; this.st = 0.9; g.sfx.play('door'); }
      if ((this.shotT = (this.shotT || 2.5) - dt) <= 0) {
        this.shotT = this.rage ? 2.2 : 3;
        for (const s of this.segs) if (!s.dead && R() < 0.35) en.ring(s.x, s.z, 4, 5.5, 8, 'orb', this.t, 1.2);
      }
      // 머리: 조준 부채꼴 (반 이상 부서지면 더 넓게)
      if ((this.fanT = (this.fanT ?? 1.5) - dt) <= 0) {
        this.fanT = this.rage ? 1.4 : 2.2;
        en.fan(this.hx, this.hz, Math.atan2(dx, dz), this.rage ? 7 : 5, 0.2, 7, 10, 'shell', 1);
        fx.muzzle([this.hx, 1, this.hz], [Math.sin(this.hyaw), 0, Math.cos(this.hyaw)], [1, 0.5, 0.2], 2);
      }
    } else if (this.state === 'dive') {
      targetY = -3.2; speed = 7;
      if (this.st <= 0) { this.state = 'under'; this.st = 1.5; }
    } else if (this.state === 'under') {
      // 땅속에서 플레이어 위치로 이동, 바닥에 경고 표시
      targetY = -3.2; speed = 11;
      this.hyaw = Math.atan2(dx, dz);
      if (d < 1.5 || this.st < 0.65) speed = 0; // 마지막 0.65초는 위치 고정 (피할 시간)
      this.tx = p.x; this.tz = p.z;
      en.warn.visible = true; en.warn.position = [this.hx, 0.05, this.hz]; en.warn.scale = [2.8, 1, 2.8];
      en.warn.material.opacity = 0.35 + 0.35 * Math.sin(this.t * (this.st < 0.65 ? 60 : 20));
      if (R() < 0.5) fx.dust(this.hx + (R() - 0.5) * 2, this.hz + (R() - 0.5) * 2, 1);
      if (this.st <= 0) { this.state = 'erupt'; this.st = 1.1; this.vy = 16; this.hy = -1; en.warn.visible = false; this.erupted = false; }
    } else if (this.state === 'erupt') {
      speed = 2;
      this.vy -= 30 * dt; this.hy += this.vy * dt;
      if (!this.erupted) {
        this.erupted = true;
        fx.explosion(this.hx, 0.5, this.hz, 2.2, { color: [1, 0.7, 0.4], debris: [0.6, 0.5, 0.35] });
        g.sfx.play('bigboom'); fx.addTrauma(0.6);
        if (Math.hypot(p.x - this.hx, p.z - this.hz) < 3.2) p.hurt(H.T.dmg * 1.3 * en.k.dmg, p.x - this.hx, p.z - this.hz);
        // 솟구칠 때 모래 파편 고리 (분노 상태는 두 겹)
        en.ring(this.hx, this.hz, 16, 4.5, 9, 'shell', R(), 0.8);
        if (this.rage) en.ring(this.hx, this.hz, 16, 3, 9, 'orb', R(), 0.8);
      }
      if (this.hy <= 0 && this.vy < 0) { this.hy = 0; this.state = 'swim'; this.st = 4 + R() * 2; fx.dust(this.hx, this.hz, 6); }
    }
    if (this.state !== 'erupt') this.hy += (targetY - this.hy) * Math.min(1, dt * 3);
    if (this.state === 'swim') this.hy = Math.sin(this.t * 4) * 0.25;
    this.hx += Math.sin(this.hyaw) * speed * dt; this.hz += Math.cos(this.hyaw) * speed * dt;
    const RM = g.rooms;
    this.hx = Math.max(-RM.hx + 1.5, Math.min(RM.hx - 1.5, this.hx)); this.hz = Math.max(-RM.hz + 1.5, Math.min(RM.hz - 1.5, this.hz));
    // 머리 배치
    H.x = this.hx; H.z = this.hz; H.y = this.hy; H.yaw = this.hyaw; H.under = this.hy < -1;
    H.rx = this.state === 'erupt' ? -Math.max(-0.9, Math.min(0.9, this.vy * 0.06)) : 0;
    // 지나간 자리 기록 → 마디가 간격 1.25 로 따라감
    this.trail.unshift([this.hx, this.hy, this.hz]);
    if (this.trail.length > 600) this.trail.pop();
    let ti = 0, acc = 0, prev = this.trail[0];
    const alive = this.segs.filter((s) => !s.dead);
    for (let i = 0; i < alive.length; i++) {
      const need = 1.25 * (i + 1) + 0.4;
      while (ti < this.trail.length - 1 && acc < need) { const a = this.trail[ti], b = this.trail[ti + 1]; acc += Math.hypot(a[0] - b[0], a[2] - b[2], (a[1] - b[1]) * 0.5); ti++; }
      const q = this.trail[ti] || prev, s = alive[i];
      const ahead = i === 0 ? [this.hx, this.hz] : [alive[i - 1].x, alive[i - 1].z];
      s.x = q[0]; s.z = q[2]; s.y = q[1] + Math.sin(this.t * 4 - i * 0.6) * 0.15;
      s.yaw = Math.atan2(ahead[0] - s.x, ahead[1] - s.z);
      s.under = s.y < -1;
      prev = q;
    }
    // 접촉 피해
    for (const s of [H, ...alive]) if (!s.under && s.y < 1.5 && Math.hypot(p.x - s.x, p.z - s.z) < s.r + p.r) p.hurt(s.T.dmg * en.k.dmg, p.x - s.x, p.z - s.z);
  }

  // ---------- 크레인 워커 ----------
  updateCrane(dt) {
    const g = this.game, p = g.player, fx = g.fx, en = g.enemies;
    const C = this.core, dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1;
    const exposed = this.gun.dead && this.claw.dead;
    this.rage = this.gun.dead || this.claw.dead || C.hp < C.maxHp * 0.6; // 팔 하나를 잃으면 남은 팔이 사나워진다
    if (this.state === 'drop') {
      this.vy -= 50 * dt; this.y += this.vy * dt;
      en.warn.material.opacity = 0.35 + 0.35 * Math.sin(this.t * 30);
      if (this.y <= 0) {
        this.y = 0; en.warn.visible = false; this.state = 'walk'; this.st = 2;
        fx.explosion(this.x, 0.3, this.z, 2.6, { color: [1, 0.6, 0.3] }); fx.addTrauma(0.8); g.sfx.play('bigboom'); g.hitStop(0.1);
        if (d < 4.5) p.hurt(C.T.dmg * en.k.dmg, dx, dz);
      }
    } else {
      // 천천히 플레이어 쪽으로 돌고 걷는다
      const want = Math.atan2(dx, dz);
      this.yaw += Math.max(-0.8 * dt, Math.min(0.8 * dt, angDiff(want, this.yaw)));
      const sp = this.state === 'walk' ? (exposed ? 2.6 : 1.7) : 0;
      if (d > 4) { this.x += Math.sin(this.yaw) * sp * dt; this.z += Math.cos(this.yaw) * sp * dt; }
      const RM = g.rooms;
      this.x = Math.max(-RM.hx + 2.5, Math.min(RM.hx - 2.5, this.x)); this.z = Math.max(-RM.hz + 2.5, Math.min(RM.hz - 2.5, this.z));
      if (this.state === 'walk' && this.st <= 0) {
        const opts = [];
        if (!this.gun.dead) opts.push('volley');
        if (!this.claw.dead && d < 9) opts.push('slam');
        if (exposed) opts.push('ring', 'spiral');
        else if (R() < 0.4) opts.push('ring'); // 팔이 있어도 가끔 몸통 고리탄
        if (!opts.length) opts.push('ring');
        this.state = opts[(R() * opts.length) | 0]; this.st = 0; this.shots = 0;
      }
      if (this.state === 'volley') {
        // 미사일 팔: 부채꼴 일제 사격 3번
        this.st += dt * 2;
        if (this.st > 0.5 + this.shots * 0.45 && this.shots < 3) {
          const m = [this.gun.x + Math.sin(this.yaw) * 1.3, 2.8, this.gun.z + Math.cos(this.yaw) * 1.3], a0 = Math.atan2(p.x - m[0], p.z - m[2]);
          en.fan(m[0], m[2], a0, this.rage ? 11 : 7, 0.15, 9, 12, 'shell', 1.3);
          fx.muzzle(m, [Math.sin(a0), 0, Math.cos(a0)], [1, 0.5, 0.2], 3); this.shots++;
        }
        if (this.st > 3) { this.state = 'walk'; this.st = 2.2; }
      } else if (this.state === 'slam') {
        // 집게 팔: 예고 고리 → 내려찍기
        this.st += dt * 2;
        if (!this.slamAt) { this.slamAt = [p.x, p.z]; en.warn.visible = true; en.warn.position = [p.x, 0.05, p.z]; en.warn.scale = [3, 1, 3]; }
        en.warn.material.opacity = 0.35 + 0.35 * Math.sin(this.t * 30);
        if (this.st > 1.6 && this.slamAt) {
          const [sx, sz] = this.slamAt;
          fx.explosion(sx, 0.3, sz, 1.8, { color: [1, 0.55, 0.3], debris: [0.4, 0.4, 0.45] }); g.sfx.play('bigboom'); fx.addTrauma(0.5);
          if (Math.hypot(p.x - sx, p.z - sz) < 3.1) p.hurt(this.claw.T.dmg * en.k.dmg, p.x - sx, p.z - sz);
          this.slamAt = null; en.warn.visible = false;
        }
        if (this.st > 2.4) { this.state = 'walk'; this.st = 2; this.slamAt = null; en.warn.visible = false; }
      } else if (this.state === 'ring') {
        this.st += dt * 2;
        if (this.st > 0.4 + this.shots * 0.5 && this.shots < (exposed ? 4 : 3)) { const n = exposed ? 22 : 18; en.ring(this.x, this.z, n, 6.5, 12, 'orb', (this.shots % 2) * (Math.PI / n), 1.5); this.shots++; C.flash = 0.08; }
        if (this.st > 2.6) { this.state = 'walk'; this.st = 1.6; }
      } else if (this.state === 'spiral') {
        // 몸통 노출: 깜빡이며 예고 → 회전 나선 3팔 (불꽃이 튀는 원자로)
        this.st += dt * 2; // update() 가 매 프레임 dt 를 빼므로 순증가 dt
        if (this.st < 0.7) C.flash = Math.sin(this.st * 30) > 0 ? 0.04 : 0;
        else if ((this.acc = (this.acc || 0) + dt) > 0.1) { this.acc = 0; this.spin = (this.spin || 0) + 0.22; for (let k = 0; k < 3; k++) en.shoot(this.x, this.z, this.spin + (k / 3) * Math.PI * 2, 5, 12, 'orb', 1.5); }
        if (this.st > 3.4) { this.state = 'walk'; this.st = 1.4; }
      }
    }
    // 부위 배치 (팔은 몸통 옆에 붙어서 같이 돈다)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const place = (e, ox) => { e.x = this.x + c * ox; e.z = this.z - s * ox; e.y = this.y; e.yaw = this.yaw; };
    C.x = this.x; C.z = this.z; C.y = this.y; C.yaw = this.yaw;
    if (!this.gun.dead) place(this.gun, 2.3);
    if (!this.claw.dead) place(this.claw, -2.3);
    C.exposed = exposed;
    if (exposed && R() < 0.3) fx.sparks.emit({ position: [this.x + (R() - 0.5) * 2, 2.5, this.z + (R() - 0.5) * 2], velocity: [0, 3, 0], life: 0.3, size: 2, sizeEnd: 1, color: [1, 0.8, 0.3], colorEnd: [1, 0.3, 0.1], emissive: 1, gravity: 1 });
    if (this.y < 1 && d < C.r + p.r) p.hurt(C.T.dmg * en.k.dmg, dx, dz);
  }
}

const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
