// 역할이 뚜렷한 일반 적 (enemies.js 의 ENEMY_TYPES 에 합쳐진다)
//  ai(en, e, c): 매 프레임 이동/공격. c = { dx, dz, d, mx, mz, sp, dt, depth, p, g } 를 고쳐서 이동을 정한다.
//                true 를 돌려주면 이번 프레임에 죽었다는 뜻 (나머지 처리 생략).
//
//  저격 기체 (sniper): 멀리서 멈춰 조준선 (따라오다 고정) → 관통 레이저 한 방. 옆으로 빠지면 피한다
//  방패 기체 (shield): 정면 방패가 피해를 대부분 막는다. 천천히 돌므로 옆/뒤로 돌아가서 친다
//  그림자 암살기 (assassin): 사라졌다가 플레이어 등 뒤에 표식 → 나타나서 베기 돌진
//  분열 기체 (splitter): 부서지면 작은 조각 3개로 갈라진다
//  수리 드론 (medic): 다친 적에게 수리 빔. 플레이어를 피해 다닌다 (먼저 잡을 것)
//  지뢰 부설기 (miner): 맴돌며 지뢰를 깐다. 지뢰는 쏘면 터지고 (주변 적도 피해), 밟으면 플레이어가 다친다
//  돌격 기체 (charger): 바닥에 돌진 경로 예고 → 직선 돌진. 벽에 부딪히면 기절

import { Geometry } from '../engine/index.js';
import { laserHits } from './midbosses.js';

const TAU = Math.PI * 2, R = Math.random;
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
const cbox = (g, w, h, d, c, p, r) => add(g, Geometry.box(w, h, d, c), [p[0], p[1] - h / 2, p[2]], r);
const angDiff = (a, b) => ((a - b + Math.PI * 3) % TAU) - Math.PI;
const turnTo = (yaw, want, k) => yaw + Math.max(-k, Math.min(k, angDiff(want, yaw)));

const GUN = [0.2, 0.2, 0.24], DARK = [0.16, 0.15, 0.2], STEEL = [0.44, 0.45, 0.5], SLATE = [0.3, 0.34, 0.4];
const BONE = [0.72, 0.7, 0.64], MOSS = [0.34, 0.44, 0.3], OCHRE = [0.62, 0.46, 0.2], WINE = [0.42, 0.18, 0.26], NAVY = [0.22, 0.26, 0.4];

// 거리 유지 + 옆걸음 (가까우면 물러나고 멀면 다가간다)
function orbit(c, e, near, far, side = 0.6) {
  const s = Math.sin(c.g.time * 0.6 + e.seed * 3) > 0 ? 1 : -1, f = c.d > far ? 1 : c.d < near ? -1 : 0;
  c.mx = (c.dx / c.d) * f + (c.dz / c.d) * s * side; c.mz = (c.dz / c.d) * f - (c.dx / c.d) * s * side;
}
const puff = (fx, x, y, z, col) => { for (let i = 0; i < 8; i++) fx.trail.emit({ position: [x + (R() - 0.5) * 0.8, y + R(), z + (R() - 0.5) * 0.8], velocity: [(R() - 0.5) * 3, 1 + R() * 2, (R() - 0.5) * 3], life: 0.4, size: 3, sizeEnd: 0.5, color: col, colorEnd: [0.2, 0.1, 0.3], emissive: 1, gravity: 0 }); };

export const TROOP_TYPES = {
  sniper: {
    name: '저격 기체', hp: 30, speed: 2.7, r: 0.55, dmg: 20, xp: 3, mass: 1.4, fly: 0, cap: 6, boom: 0.8, shoots: true, calm: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI; add(g, Geometry.box(0.08, 0.75, 0.08, GUN), [Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32], [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45]); }
      cbox(g, 0.5, 0.32, 0.62, NAVY, [0, 0.78, -0.05]);
      cbox(g, 0.34, 0.12, 0.4, SLATE, [0, 0.98, -0.15]);
      add(g, Geometry.cylinder(0.06, 0.06, 1.35, 5, GUN), [0, 0.82, 0.2], [Math.PI / 2, 0, 0]);
      add(g, Geometry.cylinder(0.1, 0.1, 0.18, 5, DARK), [0, 0.82, 1.45], [Math.PI / 2, 0, 0]);
      add(g, Geometry.cylinder(0.08, 0.08, 0.36, 5, DARK), [0.16, 1.02, -0.05], [Math.PI / 2, 0, 0]);
      add(glow, Geometry.box(0.08, 0.08, 0.05, [0.4, 1, 1]), [0.16, 1.02, 0.33]);
      add(glow, Geometry.box(0.1, 0.1, 0.04, [1, 0.25, 0.3]), [0, 0.82, 1.64]);
      return { g, glow };
    },
    ai(en, e, c) {
      const H = en.hazards, p = c.p, L = 22, toP = Math.atan2(c.dx, c.dz);
      if (e.state === 'walk') {
        orbit(c, e, 10, 15, 0.5);
        e.yaw = turnTo(e.yaw, toP, 4 * c.dt);
        e.cd -= c.dt;
        if (e.cd <= 0 && c.d < 20 && e.spawnT > 1) { e.state = 'aim'; e.st = 0; }
      } else if (e.state === 'aim') {
        // 조준선: 0.95초까지 천천히 따라오다 고정 → 깜빡임 → 발사
        c.sp = 0; e.charging = true;
        const lock = e.st > 0.95, k = Math.min(1, e.st / 1.35);
        if (!lock) e.yaw = turnTo(e.yaw, toP, 2.4 * c.dt);
        H.line(e.x, e.z, e.yaw, L, 0.05 + k * 0.12, lock ? [1, 1, 1] : [1, 0.2, 0.3], lock ? 0.5 + 0.4 * Math.sin(e.st * 50) : 0.2 + 0.35 * k, 0.82, 0.05);
        if (e.st > 1.35) {
          e.state = 'fire'; e.st = 0;
          const sx = Math.sin(e.yaw), sz = Math.cos(e.yaw);
          if (laserHits(p.x, p.z, e.x, e.z, e.yaw, L, 0.3 + p.r * 0.6)) p.hurt(e.T.dmg * (e.elite ? 1.5 : 1) * en.k.dmg, sx, sz);
          c.g.fx.muzzle([e.x + sx * 1.6, 0.82, e.z + sz * 1.6], [sx, 0, sz], [1, 0.4, 0.5], 2);
          c.g.sfx.play('beam', { vol: 0.5 });
          e.kx -= sx * 4; e.kz -= sz * 4;
        }
      } else {
        c.sp = 0;
        H.laser(e.x, e.z, e.yaw, L, 0.45, true, e.st);
        if (e.st > 0.18) { e.state = 'walk'; e.st = 0; e.cd = 3.4 + R() * 1.6; e.charging = false; }
      }
    },
  },
  shield: {
    name: '방패 기체', hp: 70, speed: 2.1, r: 0.75, dmg: 12, xp: 4, mass: 4, fly: 0, cap: 24, boom: 1.0, shield: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) cbox(g, 0.28, 0.5, 0.42, GUN, [s * 0.3, 0.25, -0.1]);
      cbox(g, 0.75, 0.6, 0.6, SLATE, [0, 0.8, -0.15]);
      add(g, Geometry.icosphere(0.2, 0, DARK), [0, 1.22, -0.15]);
      // 방패: 넓은 판 + 가장자리 보강 + 창
      cbox(g, 1.5, 1.35, 0.14, STEEL, [0, 0.82, 0.42]);
      cbox(g, 1.6, 0.12, 0.2, DARK, [0, 1.48, 0.44]);
      cbox(g, 1.6, 0.12, 0.2, DARK, [0, 0.18, 0.44]);
      for (const s of [-1, 1]) cbox(g, 0.12, 1.4, 0.2, DARK, [s * 0.76, 0.82, 0.44]);
      cbox(g, 0.5, 0.5, 0.06, [0.6, 0.45, 0.2], [0, 0.9, 0.5]);
      add(glow, Geometry.box(1.3, 0.06, 0.04, [0.4, 0.9, 1]), [0, 1.3, 0.5]);
      add(glow, Geometry.box(0.18, 0.06, 0.04, [1, 0.3, 0.3]), [0, 1.08, 0.5]);
      return { g, glow };
    },
    ai(en, e, c) {
      const toP = Math.atan2(c.dx, c.dz);
      if (e.state === 'walk') {
        // 천천히 돈다 → 옆으로 돌아가면 방패가 못 따라온다
        e.yaw = turnTo(e.yaw, toP, 1.5 * c.dt);
        c.mx = Math.sin(e.yaw); c.mz = Math.cos(e.yaw);
        e.cd -= c.dt;
        if (e.cd <= 0 && c.d < 3.6) { e.state = 'wind'; e.st = 0; }
      } else if (e.state === 'wind') { c.sp = 0; if (e.st > 0.45) { e.state = 'charge'; e.st = 0; e.cx = Math.sin(e.yaw); e.cz = Math.cos(e.yaw); } }
      else if (e.state === 'charge') { c.mx = e.cx; c.mz = e.cz; c.sp = 10; if (e.st > 0.22) { e.state = 'rest'; e.st = 0; } }
      else { c.sp = 0; if (e.st > 0.5) { e.state = 'walk'; e.cd = 2 + R(); } }
    },
  },
  assassin: {
    name: '그림자 암살기', hp: 40, speed: 4.6, r: 0.5, dmg: 16, xp: 4, mass: 1.2, fly: 0, cap: 8, boom: 0.8,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) { add(g, Geometry.box(0.12, 0.62, 0.14, DARK), [s * 0.16, 0, 0], [0.25, 0, 0]); }
      cbox(g, 0.42, 0.42, 0.34, WINE, [0, 0.82, 0]);
      add(g, Geometry.cone(0.24, 0.4, 4, DARK), [0, 1.03, -0.02]);
      for (const s of [-1, 1]) {
        cbox(g, 0.12, 0.38, 0.14, DARK, [s * 0.3, 0.8, 0.08]);
        add(g, Geometry.box(0.04, 0.08, 0.9, BONE), [s * 0.34, 0.6, 0.15], [0.15, s * 0.08, 0]); // 팔 칼날
      }
      for (const s of [-1, 1]) add(g, Geometry.box(0.06, 0.3, 0.42, WINE), [s * 0.16, 0.72, -0.32], [-0.6, 0, s * 0.3]); // 등 지느러미
      add(glow, Geometry.box(0.28, 0.05, 0.04, [1, 0.2, 0.7]), [0, 1.02, 0.17]);
      return { g, glow };
    },
    ai(en, e, c) {
      const g = c.g, p = c.p, fx = g.fx;
      if (e.state === 'walk') {
        orbit(c, e, 5, 8, 0.9);
        e.yaw = Math.atan2(c.mx, c.mz);
        e.cd -= c.dt;
        if (e.cd <= 0 && c.d < 16 && e.spawnT > 1) { e.state = 'vanish'; e.st = 0; puff(fx, e.x, 0.3, e.z, [0.9, 0.2, 0.8]); g.sfx.play('dash', { vol: 0.5 }); }
      } else if (e.state === 'vanish') {
        c.sp = 0; e.under = true; e.vis = Math.max(0, 1 - e.st / 0.35);
        if (e.st > 0.35) {
          // 등 뒤(조준 반대편)에 표식
          const back = (p.aimYaw ?? p.yaw) + Math.PI + (R() - 0.5) * 0.8, spot = { x: p.x + Math.sin(back) * 2.8, z: p.z + Math.cos(back) * 2.8 };
          g.rooms.clamp(spot, 0.6);
          e.x = spot.x; e.z = spot.z; e.kx = e.kz = 0; e.state = 'marked'; e.st = 0; e.vis = 0;
        }
      } else if (e.state === 'marked') {
        c.sp = 0;
        en.hazards.ring(e.x, e.z, 1.1, [1, 0.2, 0.7], 0.3 + 0.4 * Math.sin(e.st * 30));
        if (e.st > 0.55) { e.under = false; e.vis = 1; e.state = 'wind'; e.st = 0; e.yaw = Math.atan2(c.dx, c.dz); puff(fx, e.x, 0.3, e.z, [0.9, 0.2, 0.8]); }
      } else if (e.state === 'wind') {
        c.sp = 0; e.yaw = Math.atan2(c.dx, c.dz);
        if (e.st > 0.2) { e.state = 'charge'; e.st = 0; e.cx = c.dx / c.d; e.cz = c.dz / c.d; g.sfx.play('swing', { vol: 0.6 }); }
      } else if (e.state === 'charge') {
        c.mx = e.cx; c.mz = e.cz; c.sp = 15;
        if (R() < 0.6) fx.trail.emit({ position: [e.x, 0.7, e.z], velocity: [0, 0, 0], life: 0.25, size: 2.5, sizeEnd: 0.5, color: [1, 0.3, 0.8], colorEnd: [0.3, 0.1, 0.4], emissive: 1, gravity: 0 });
        if (e.st > 0.28) { e.state = 'rest'; e.st = 0; }
      } else { c.sp = 0; if (e.st > 0.8) { e.state = 'walk'; e.cd = 2.8 + R() * 2; } }
    },
  },
  splitter: {
    name: '분열 기체', hp: 60, speed: 2.5, r: 0.8, dmg: 10, xp: 2, mass: 2.4, fly: 0, cap: 30, boom: 0.9, split: 'splitling',
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        add(g, Geometry.icosphere(0.42, 0, MOSS, { squashY: 0.8 }), [Math.sin(a) * 0.3, 0.45, Math.cos(a) * 0.3]);
        add(glow, Geometry.box(0.08, 0.5, 0.08, [0.8, 1, 0.3]), [Math.sin(a + 1.05) * 0.36, 0.3, Math.cos(a + 1.05) * 0.36]); // 이음매 (갈라질 자리)
      }
      add(g, Geometry.icosphere(0.3, 0, OCHRE), [0, 0.85, 0]);
      add(glow, Geometry.box(0.22, 0.07, 0.05, [1, 0.3, 0.25]), [0, 0.9, 0.28]);
      return { g, glow };
    },
    ai(en, e, c) {
      const w = Math.sin(c.g.time * 2.2 + e.seed) * 0.4, cs = Math.cos(w), sn = Math.sin(w);
      [c.mx, c.mz] = [c.mx * cs - c.mz * sn, c.mx * sn + c.mz * cs];
      e.yaw = Math.atan2(c.mx, c.mz);
    },
  },
  splitling: {
    name: '분열 조각', hp: 12, speed: 4.3, r: 0.4, dmg: 6, xp: 1, mass: 0.7, fly: 0, cap: 140, boom: 0.4, swarm: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.3, 0, MOSS, { squashY: 0.75 }), [0, 0.24, 0]);
      add(glow, Geometry.box(0.16, 0.06, 0.05, [0.8, 1, 0.3]), [0, 0.3, 0.26]);
      return { g, glow };
    },
  },
  medic: {
    name: '수리 드론', hp: 38, speed: 3.4, r: 0.5, dmg: 5, xp: 4, mass: 1, fly: 1.1, cap: 6, boom: 0.7, calm: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.32, 0, BONE, { squashY: 0.75 }), [0, 0, 0]);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; add(g, Geometry.box(0.4, 0.05, 0.12, SLATE), [Math.sin(a) * 0.38, 0.05, Math.cos(a) * 0.38], [0, a + Math.PI / 2, 0]); add(g, Geometry.cylinder(0.13, 0.13, 0.04, 6, DARK), [Math.sin(a) * 0.58, 0.04, Math.cos(a) * 0.58]); }
      add(glow, Geometry.box(0.3, 0.06, 0.09, [0.3, 1, 0.45]), [0, 0.22, 0]); // 십자
      add(glow, Geometry.box(0.09, 0.06, 0.3, [0.3, 1, 0.45]), [0, 0.22, 0]);
      add(glow, Geometry.cone(0.1, 0.18, 5, [0.3, 1, 0.45]), [0, -0.38, 0], [Math.PI, 0, 0]);
      return { g, glow };
    },
    ai(en, e, c) {
      const g = c.g, fx = g.fx, dt = c.dt;
      // 0.5초마다 수리할 아군 찾기 (가장 많이 다친 것)
      if ((e.scan = (e.scan ?? 0) - dt) <= 0) {
        e.scan = 0.5; let best = null, bk = 0.97;
        en.grid.query(e.x, e.z, 12, (o) => { if (o === e || o.dead || o.under || o.T.part || o.T.mine || o.type === 'medic') return; const k = o.hp / o.maxHp; if (k < bk) { bk = k; best = o; } });
        e.ally = best;
      }
      const A = e.ally && !e.ally.dead ? e.ally : null;
      const ax = A ? A.x - e.x : 0, az = A ? A.z - e.z : 0, ad = Math.hypot(ax, az) || 1;
      if (c.d < 6.5) { c.mx = -c.dx / c.d; c.mz = -c.dz / c.d; }      // 플레이어를 피한다
      else if (A && ad > 2.6) { c.mx = ax / ad; c.mz = az / ad; }
      else if (A) c.sp = 0;
      else orbit(c, e, 8, 11, 0.7);
      e.yaw = A ? Math.atan2(ax, az) : Math.atan2(c.mx, c.mz);
      if (e.state === 'walk') {
        e.cd -= dt; e.charging = e.cd < 0.4 && !!A;
        if (e.cd <= 0 && A && ad < 6) { e.state = 'beam'; e.st = 0; fx.ring(A.x, 0.15, A.z, 1.6, [0.3, 1, 0.45], 0.4); }
      } else {
        c.sp *= 0.4; e.charging = true;
        if (!A || ad > 7 || e.st > 1.1) { e.state = 'walk'; e.cd = 2.6 + R(); e.charging = false; }
        else {
          // 수리 빔: 1초 동안 대상 22% + 주변 아군 조금
          en.hazards.line(e.x, e.z, e.yaw, ad, 0.14, [0.3, 1, 0.45], 0.55 + 0.3 * Math.sin(e.st * 30), 0.95, 0.06);
          A.hp = Math.min(A.maxHp, A.hp + A.maxHp * 0.22 * dt);
          en.grid.query(A.x, A.z, 3, (o) => { if (o !== A && !o.dead && !o.T.part && !o.T.mine && Math.hypot(o.x - A.x, o.z - A.z) < 3) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.08 * dt); });
          if (R() < 0.4) fx.trail.emit({ position: [A.x + (R() - 0.5) * 1.2, 0.3 + R(), A.z + (R() - 0.5) * 1.2], velocity: [0, 2, 0], life: 0.5, size: 2, sizeEnd: 0.5, color: [0.4, 1, 0.5], colorEnd: [0.1, 0.5, 0.2], emissive: 1, gravity: 0 });
        }
      }
    },
  },
  miner: {
    name: '지뢰 부설기', hp: 50, speed: 2.9, r: 0.65, dmg: 8, xp: 3, mass: 2, fly: 0, cap: 8, boom: 0.9,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const s of [-1, 1]) cbox(g, 0.22, 0.26, 1.0, GUN, [s * 0.4, 0.13, 0]);
      cbox(g, 0.7, 0.3, 0.9, OCHRE, [0, 0.38, 0]);
      cbox(g, 0.6, 0.4, 0.45, DARK, [0, 0.72, -0.18]);                      // 지뢰 호퍼
      for (let i = 0; i < 3; i++) add(g, Geometry.cylinder(0.2, 0.2, 0.08, 6, STEEL), [0, 0.92 + i * 0.1, -0.18]);
      cbox(g, 0.5, 0.08, 0.2, DARK, [0, 0.26, -0.52]);                      // 배출구
      add(glow, Geometry.box(0.3, 0.06, 0.05, [1, 0.6, 0.15]), [0, 0.48, 0.46]);
      add(glow, Geometry.cylinder(0.06, 0.06, 0.05, 5, [1, 0.25, 0.2]), [0, 1.2, -0.18]);
      return { g, glow };
    },
    ai(en, e, c) {
      orbit(c, e, 6, 10, 1);
      e.yaw = Math.atan2(c.mx, c.mz);
      e.cd -= c.dt; e.charging = e.cd < 0.3;
      if (e.cd <= 0) {
        e.cd = (1.5 + R() * 0.6) * (c.depth >= 6 ? 0.75 : 1);
        const m = en.spawn('mine', e.x - Math.sin(e.yaw) * 0.9, e.z - Math.cos(e.yaw) * 0.9);
        if (m) { m.spawnT = 0.25; m.yaw = R() * TAU; c.g.sfx.play('clank', { vol: 0.25 }); }
      }
    },
  },
  mine: {
    name: '지뢰', hp: 6, speed: 0, r: 0.35, dmg: 24, xp: 0, mass: 99, fly: 0, cap: 48, boom: 0.5, mine: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.32, 0.36, 0.12, 6, GUN), [0, 0, 0]);
      add(g, Geometry.cylinder(0.2, 0.24, 0.08, 6, OCHRE), [0, 0.12, 0]);
      add(glow, Geometry.cylinder(0.08, 0.08, 0.06, 5, [1, 0.2, 0.15]), [0, 0.2, 0]);
      return { g, glow };
    },
    ai(en, e, c) {
      c.sp = 0;
      // 1초 뒤 무장. 밟을 거리면 0.4초 깜빡이고 폭발. 20초가 지나면 스스로 꺼진다
      if (e.st > 20) { e.fizzle = true; e.hp = 0; en.kill(e); return true; }
      if (e.state === 'walk') {
        e.charging = e.st > 1 && Math.sin(e.st * 4 + e.seed) > 0.6;
        if (c.d < 4.5 && e.st > 1) en.hazards.ring(e.x, e.z, 1.9, [1, 0.35, 0.2], 0.18);
        if (e.st > 1 && c.d < 1.7 && !c.p.stats.flying) { e.state = 'fuse'; e.st = 0; c.g.sfx.play('tink', { vol: 0.6 }); }
      } else {
        e.charging = Math.sin(e.st * 40) > 0;
        en.hazards.ring(e.x, e.z, 1.9, [1, 0.3, 0.2], 0.5 + 0.3 * Math.sin(e.st * 40));
        if (e.st > 0.4) { e.trip = true; e.hp = 0; en.kill(e); return true; }
      }
    },
  },
  charger: {
    name: '돌격 기체', hp: 55, speed: 2.7, r: 0.7, dmg: 16, xp: 4, mass: 3, fly: 0, cap: 14, boom: 1.0,
    model() {
      const g = new Geometry(), glow = new Geometry();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(g, 0.2, 0.36, 0.24, GUN, [sx * 0.36, 0.18, sz * 0.32]);
      cbox(g, 0.8, 0.42, 1.1, WINE, [0, 0.55, -0.05]);
      add(g, Geometry.prism(0.82, 0.3, 0.9, [0.55, 0.24, 0.3]), [0, 0.76, -0.1]);
      cbox(g, 0.6, 0.36, 0.3, DARK, [0, 0.55, 0.6]);
      add(g, Geometry.cone(0.16, 0.7, 4, BONE), [0, 0.6, 0.72], [Math.PI / 2 - 0.25, 0, 0]);   // 충각
      for (const s of [-1, 1]) add(g, Geometry.cone(0.08, 0.36, 4, BONE), [s * 0.28, 0.72, 0.68], [Math.PI / 2 - 0.6, 0, s * 0.3]);
      for (const s of [-1, 1]) add(glow, Geometry.box(0.08, 0.06, 0.04, [1, 0.6, 0.15]), [s * 0.17, 0.66, 0.76]);
      add(glow, Geometry.box(0.4, 0.06, 0.05, [1, 0.45, 0.15]), [0, 0.5, -0.61]);
      return { g, glow };
    },
    ai(en, e, c) {
      const g = c.g, fx = g.fx, toP = Math.atan2(c.dx, c.dz), RUN = 17, LEN = 11;
      if (e.state === 'walk') {
        e.yaw = toP;
        e.cd -= c.dt;
        if (e.cd <= 0 && c.d < 12 && e.spawnT > 1) { e.state = 'wind'; e.st = 0; }
      } else if (e.state === 'wind') {
        // 바닥에 돌진 경로 예고 (처음 0.6초는 조준을 따라온다)
        c.sp = 0;
        if (e.st < 0.6) e.yaw = turnTo(e.yaw, toP, 5 * c.dt);
        const k = Math.min(1, e.st / 0.95);
        en.hazards.line(e.x, e.z, e.yaw, LEN * k, e.r * 1.8, [1, 0.45, 0.15], 0.2 + 0.4 * k);
        if (R() < 0.3) fx.dust(e.x - Math.sin(e.yaw) * 0.6, e.z - Math.cos(e.yaw) * 0.6, 1);
        if (e.st > 0.95) { e.state = 'charge'; e.st = 0; e.cx = Math.sin(e.yaw); e.cz = Math.cos(e.yaw); e.lx = e.x; e.lz = e.z; g.sfx.play('dash', { vol: 0.6 }); }
      } else if (e.state === 'charge') {
        c.mx = e.cx; c.mz = e.cz; c.sp = RUN;
        if (R() < 0.6) fx.dust(e.x, e.z, 1);
        // 벽/장애물에 막혔다 → 쾅, 기절
        const moved = Math.hypot(e.x - e.lx, e.z - e.lz); e.lx = e.x; e.lz = e.z;
        if (e.st > 0.12 && moved < RUN * c.dt * 0.3) {
          e.state = 'rest'; e.st = 0; e.stun = 1.3;
          fx.explosion(e.x + e.cx * 0.6, 0.5, e.z + e.cz * 0.6, 0.6, { color: [1, 0.7, 0.4], scorch: false }); fx.addTrauma(0.12); g.sfx.play('clank', { vol: 0.7 });
        } else if (e.st > LEN / RUN) { e.state = 'rest'; e.st = 0; }
      } else { c.sp = 0; if (e.st > 0.9) { e.state = 'walk'; e.cd = 2.8 + R() * 1.5; } }
    },
  },
};
