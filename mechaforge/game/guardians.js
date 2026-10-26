// 구역 수호자 (중간 보스) + 부위 파괴
//  각 부위는 enemies.list 의 일반 적처럼 들어가서 조준, 피격, 연쇄 폭발이 그대로 적용된다.
//  e.ctrl = true 인 부위는 기본 AI 대신 여기서 움직인다.
//
//  샌드웜 (사막): 마디로 이어진 거대 기계 벌레. 땅속으로 파고들었다가 플레이어 밑에서 솟구친다.
//                 마디를 부술수록 몸이 짧아지고 머리가 받는 피해가 커진다.
//  크레인 워커 (공장): 양팔(미사일 포대, 집게)을 달고 걷는 거대 기계.
//                 팔이 붙어 있는 동안 몸통은 피해를 25%만 받는다. 팔을 뜯어내면 그 공격이 사라진다.

import { Geometry } from '../engine/index.js';

const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
const R = Math.random;
const STEEL = [0.42, 0.43, 0.48], DARK = [0.2, 0.2, 0.24], RUST = [0.6, 0.36, 0.24], SAND = [0.72, 0.6, 0.4], YEL = [0.95, 0.72, 0.18];

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
};

export class Guardian {
  constructor(game, kind) {
    this.game = game; this.kind = kind; this.t = 0; this.state = 'intro'; this.st = 0; this.dead = false;
    const en = game.enemies, d = Math.max(1, game.rooms.depth);
    const pw = (0.6 + game.level * 0.1) * Math.pow(en.k.pw, 0.55); // 플레이어 성장(레벨 + 무기 전력)에 맞춰 체력 보정
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
    } else {
      this.name = '크레인 워커';
      this.core = mk('craneCore', (4200 + d * 520) * pw, 0, -5);
      this.gun = mk('craneGun', (950 + d * 110) * pw, -2.4, -5);
      this.claw = mk('craneClaw', (1000 + d * 110) * pw, 2.4, -5);
      this.x = 0; this.z = -5; this.yaw = 0; this.y = 18; this.vy = 0;
      this.state = 'drop';
      game.enemies.warn.visible = true; game.enemies.warn.position = [0, 0.05, -5]; game.enemies.warn.scale = [3.5, 1, 3.5];
    }
    game.ui.bossBar(1, this.name);
    game.ui.banner(`경고: 구역 수호자 ${this.name}`, true);
    game.sfx.play('alarm');
  }

  // 부위 피해 보정 (부위 파괴 규칙)
  dmgMul(e) {
    if (this.kind === 'worm' && e === this.head) return 0.5 + 0.5 * (1 - this.segs.filter((s) => !s.dead).length / this.total);
    if (this.kind === 'crane' && e === this.core) return (!this.gun.dead || !this.claw.dead) ? 0.25 : 1;
    return 1;
  }
  onKill(e) {
    const g = this.game;
    if (this.kind === 'worm') {
      if (e === this.head) return this.die();
      g.ui.toast('마디 파괴! 머리 장갑이 약해진다');
      if (this.segs.filter((s) => s.dead).length % 4 === 1) g.pickups.salvage('module', 'armor', e.x, e.z);
      g.hitStop(0.05); g.fx.addTrauma(0.3);
    } else {
      if (e === this.core) return this.die();
      g.ui.toast(e === this.gun ? '미사일 팔 파괴!' : '집게 팔 파괴!');
      g.pickups.salvage(e === this.gun ? 'weapon' : 'module', e === this.gun ? 'missile' : 'spike', e.x, e.z);
      g.hitStop(0.08); g.fx.addTrauma(0.45); g.sfx.play('bigboom');
      if (this.gun.dead && this.claw.dead) g.ui.banner('몸통 노출! 지금이다');
    }
  }
  die() {
    const g = this.game;
    this.dead = true;
    const parts = this.kind === 'worm' ? [this.head, ...this.segs] : [this.core, this.gun, this.claw];
    parts.forEach((p, i) => { if (!p.dead) p.doomT = 0.1 + i * 0.08; });
    g.ui.bossBar(0); g.ui.banner(`${this.name} 격파!`);
    g.sfx.play('bigboom'); g.hitStop(0.15); g.slowMo(1.0); g.fx.addTrauma(1);
    const c = this.kind === 'worm' ? this.head : this.core;
    for (let i = 0; i < 18; i++) g.pickups.gem(c.x + (R() - 0.5) * 4, c.z + (R() - 0.5) * 4, 5);
    g.pickups.salvage('weapon', 'cannon', c.x, c.z);
    g.pickups.drop('crate', c.x + 1, c.z);
    g.enemies.warn.visible = false;
  }

  update(dt) {
    if (this.dead) return;
    this.t += dt; this.st -= dt;
    if (this.kind === 'worm') this.updateWorm(dt); else this.updateCrane(dt);
    const c = this.kind === 'worm' ? this.head : this.core;
    this.game.ui.bossBar(Math.max(0.001, c.hp / c.maxHp), this.name);
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
