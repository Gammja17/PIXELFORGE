// 환경 위험 요소, 부서지는 소품, 특수 방 규칙
//
//  위험 요소는 적도 똑같이 다치게 한다 (적을 끌어들이는 게 공략). 바닥 위험은 비행 모드/비행 적에게는 무해.
//    lava   용암 균열: 어둡게 식어 있다가 → 점점 빨리 맥동(예고) → 분출 (틱 피해, 드럼통 점화)
//    elec   전기 바닥: 체크무늬 두 조가 번갈아 깜빡임(예고) → 방전 (피해 + 경직)
//    belt   컨베이어: 위에 선 지상 유닛을 화살표 방향으로 민다
//    cryo   냉각 분출구: 바닥 고리가 깜빡임(예고) → 냉기 폭발 (피해 + 적 동결, 플레이어 감속)
//    ice    빙판: 플레이어는 미끄러지고, 적은 넉백이 멀리 밀린다
//    pylon  공명 수정탑: 빛이 차오름(예고) → 원형 충격파
//  소품은 enemies.grid 에 들어가서 무기/폭발에 맞는다 (enemies.hit → hitProp). 조준 대상(nearest)은 아니다.
//    barrel / plasma  폭발 드럼통: 맞으면 짧게 깜빡이다 enemies.blast 로 터짐 → 다른 드럼통에 연쇄
//    mine   지뢰: 지상 유닛이 밟으면 삑삑 → 폭발
//    엄폐물 (sandbag, crate, crystal, slag, iceblock, panel): 적 탄을 막고, 맞으면 부서진다
//  특수 방: dark (정전, 기체 주변만 밝음), storm (수축하는 방어막 고리 밖은 피해)

import { Geometry, InstancedMesh, Material, m4 } from '../engine/index.js';

const TAU = Math.PI * 2;
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });

// 바닥에 눕힌 고리 (반경 1)
function flatRing(inner = 0.86, seg = 28, color = [1, 1, 1]) {
  const g = new Geometry();
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    g.quad(p(a0, inner), p(a1, inner), p(a1, 1), p(a0, 1), color, null, [0, 1, 0]);
  }
  return g;
}

// ---- 소품 ----
export const PROPS = {
  barrel: {
    name: '연료 드럼통', hp: 18, r: 0.55, boom: { r: 3.4, dmg: 60, pDmg: 20, col: [1, 0.55, 0.2] },
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.42, 0.42, 1.0, 8, [0.72, 0.2, 0.16]));
      for (const y of [0.22, 0.72]) add(g, Geometry.cylinder(0.445, 0.445, 0.08, 8, [0.22, 0.2, 0.22]), [0, y, 0]);
      add(g, Geometry.cylinder(0.36, 0.36, 0.05, 8, [0.3, 0.3, 0.32]), [0, 1.0, 0]);
      // 경고 표식: 카메라 쪽(+x, +z) 두 면
      add(glow, Geometry.box(0.3, 0.26, 0.04, [1, 0.8, 0.2]), [0, 0.35, 0.42]);
      add(glow, Geometry.box(0.04, 0.26, 0.3, [1, 0.8, 0.2]), [0.42, 0.35, 0]);
      return { g, glow };
    },
  },
  plasma: {
    name: '플라스마 탱크', hp: 18, r: 0.55, boom: { r: 3.8, dmg: 60, pDmg: 20, col: [0.4, 0.9, 1] },
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.4, 0.44, 1.05, 8, [0.5, 0.52, 0.6]));
      add(g, Geometry.cylinder(0.3, 0.38, 0.12, 8, [0.3, 0.32, 0.38]), [0, 1.05, 0]);
      add(glow, Geometry.cylinder(0.45, 0.45, 0.26, 8, [0.3, 0.9, 1]), [0, 0.4, 0]);
      add(glow, Geometry.icosphere(0.14, 0, [0.6, 1, 1]), [0, 1.2, 0]);
      return { g, glow };
    },
  },
  mine: {
    name: '지뢰', hp: 1, r: 0.4, walk: true, boom: { r: 2.7, dmg: 45, pDmg: 16, col: [1, 0.4, 0.25] },
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(0.3, 0.36, 0.12, 7, [0.26, 0.25, 0.22]));
      add(g, Geometry.cylinder(0.12, 0.12, 0.06, 6, [0.4, 0.38, 0.34]), [0, 0.12, 0]);
      add(glow, Geometry.box(0.1, 0.06, 0.1, [1, 0.2, 0.2]), [0, 0.18, 0]);
      add(glow, flatRing(0.9, 20, [0.9, 0.15, 0.15]), [0, 0.03, 0]);   // 밟으면 터지는 범위
      return { g, glow };
    },
  },
  sandbag: {
    name: '모래주머니', hp: 150, r: 0.85, cover: true,
    model() {
      const g = new Geometry();
      for (let i = 0; i < 3; i++) add(g, Geometry.icosphere(0.42, 0, [0.62, 0.55, 0.4], { squashY: 0.55, seed: i + 3 }), [(i - 1) * 0.6, 0.22, 0]);
      for (let i = 0; i < 2; i++) add(g, Geometry.icosphere(0.4, 0, [0.56, 0.5, 0.36], { squashY: 0.55, seed: i + 9 }), [(i - 0.5) * 0.6, 0.6, 0]);
      return { g };
    },
  },
  crate: {
    name: '화물 상자', hp: 130, r: 0.8, cover: true,
    model() {
      const g = new Geometry();
      add(g, Geometry.box(1.15, 1.0, 1.15, [0.6, 0.44, 0.25]));
      for (const s of [-1, 1]) { add(g, Geometry.box(1.2, 0.12, 0.12, [0.36, 0.26, 0.16]), [0, 0.5, s * 0.55]); add(g, Geometry.box(0.12, 0.12, 1.2, [0.36, 0.26, 0.16]), [s * 0.55, 0.5, 0]); }
      add(g, Geometry.box(0.6, 0.5, 0.6, [0.55, 0.5, 0.32]), [0.15, 1.0, -0.1], [0, 0.4, 0]);
      return { g };
    },
  },
  crystal: {
    name: '수정 덩어리', hp: 120, r: 0.75, cover: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.6, 0, [0.24, 0.22, 0.34], { jitter: 0.3, seed: 5, squashY: 0.6 }), [0, 0.15, 0]);
      for (let k = 0; k < 5; k++) { const a = k * 1.3; add(glow, Geometry.cone(0.2, 1.0 + (k % 3) * 0.35, 5, k % 2 ? [0.45, 0.95, 1] : [0.75, 0.6, 1]), [Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25], [Math.cos(a) * 0.35, a, Math.sin(a) * 0.35]); }
      return { g, glow };
    },
  },
  slag: {
    name: '슬래그 덩어리', hp: 190, r: 0.85, cover: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.icosphere(0.75, 0, [0.22, 0.18, 0.18], { jitter: 0.25, seed: 11, squashY: 0.8 }), [0, 0.45, 0]);
      add(glow, Geometry.box(0.7, 0.07, 0.08, [1, 0.5, 0.15]), [0.1, 0.5, 0.62], [0, 0, 0.3]);
      add(glow, Geometry.box(0.08, 0.07, 0.6, [1, 0.5, 0.15]), [0.64, 0.6, 0], [0.4, 0, 0]);
      return { g, glow };
    },
  },
  iceblock: {
    name: '얼음 덩어리', hp: 110, r: 0.8, cover: true,
    model() {
      const g = new Geometry();
      add(g, Geometry.box(1.15, 1.05, 1.15, [0.58, 0.76, 0.9]), [0, 0, 0], [0, 0.3, 0]);
      add(g, Geometry.box(1.2, 0.15, 1.2, [0.92, 0.95, 0.98]), [0, 1.05, 0], [0, 0.3, 0]);
      add(g, Geometry.cone(0.3, 0.8, 5, [0.66, 0.84, 0.96]), [0.45, 0, 0.35]);
      return { g };
    },
  },
  panel: {
    name: '방호 판넬', hp: 140, r: 0.8, cover: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(1.5, 1.05, 0.4, [0.42, 0.45, 0.52]));
      for (const s of [-1, 1]) add(g, Geometry.box(0.2, 0.2, 0.9, [0.28, 0.3, 0.36]), [s * 0.6, 0, 0]);
      add(glow, Geometry.box(1.2, 0.08, 0.42, [0.3, 0.9, 1]), [0, 0.8, 0]);
      return { g, glow };
    },
  },
};

// 적이 위험 요소에 받는 피해: 최대 체력 비율 (정예/보스급은 훨씬 적게)
function enemyDmg(e, frac) {
  const big = e.boss || e.T?.part;
  return e.maxHp * frac * (big ? 0.04 : e.elite ? 0.3 : 1);
}
const onFloor = (e) => e.prop || (e.boss ? e.y < 0.5 : !(e.T.fly > 0.05) && e.y < 0.5);
// 점과 선분 거리
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

export class RoomHazards {
  constructor(game, rooms) {
    this.game = game; this.rooms = rooms;
    const sc = game.scene;
    this.inst = {};
    for (const [id, P] of Object.entries(PROPS)) {
      const { g, glow } = P.model();
      this.inst[id] = {
        body: sc.add(new InstancedMesh(g, new Material(), 24)),
        glow: glow && sc.add(new InstancedMesh(glow, new Material({ emissive: 1, castShadow: false, outline: false }), 24)),
      };
    }
    // 컨베이어 화살표 (^ 모양, +z 를 가리킴)
    const chev = new Geometry();
    for (const s of [-1, 1]) add(chev, Geometry.box(0.14, 0.03, 0.7, [1, 0.7, 0.2]), [s * 0.22, 0, 0], [0, -s * 0.75, 0]);
    this.chev = sc.add(new InstancedMesh(chev, new Material({ emissive: 1, castShadow: false, outline: false }), 200));
    // 수축 방어막 (벽 띠 + 바닥 선)
    const band = new Geometry();
    band.merge(Geometry.cylinder(1, 1, 1.6, 48, [1, 0.35, 0.25], { caps: false }));
    band.merge(flatRing(0.985, 48, [1, 0.6, 0.3]), { position: [0, 0.04, 0] });
    this.band = sc.add(new InstancedMesh(band, new Material({ emissive: 1, castShadow: false, outline: false, opacity: 0.55 }), 1));
    this.clear();
  }

  clear() {
    this.list = []; this.props = []; this.areas = []; this.special = null; this.t = 0;
    for (const k in this.inst) { this.inst[k].body.count = 0; if (this.inst[k].glow) this.inst[k].glow.count = 0; }
    this.chev.count = 0; this.band.count = 0;
  }

  // ---- 방 배치 ----
  //  ctx: { R, hx, hz, zone, Z, depth, reward, geo, glow, colliders, ok(x, z, margin) }
  //  begin → (레이아웃이 엄폐물 addProp) → populate 로 구역 위험 요소를 채운다
  begin(ctx) { this.clear(); this.ctx = ctx; }
  populate(ctx) {
    const { R, Z, reward, depth } = ctx;
    if (reward === 'start' || reward === 'workshop') return;
    const big = reward === 'boss' || reward === 'guardian';
    const mul = ctx.hazMul ?? (big ? 0.6 : 0.75 + depth * 0.07); // 깊이별 개수 배율 (rooms.js CURVE haz: 방 1 은 적게, 깊을수록 많이)
    for (const [kind, n0] of Object.entries(Z.haz || {})) {
      const n = Math.max(0, Math.round(n0 * mul + R.range(-0.6, 0.6)));
      for (let i = 0; i < n; i++) this.place(kind, ctx);
    }
  }

  // 겹치지 않는 자리 (반경 r 원 + 충돌체 여유)
  room(ctx, r, tries = 60) {
    const { R, hx, hz, colliders, ok } = ctx;
    for (let k = 0; k < tries; k++) {
      const x = R.range(-hx + 2 + r * 0.5, hx - 2 - r * 0.5), z = R.range(-hz + 2 + r * 0.5, hz - 2 - r * 0.5);
      if (!ok(x, z, r * 0.6)) continue;
      if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r * 0.8 + 0.3)) continue;
      if (this.areas.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + r)) continue;
      return [x, z];
    }
    return null;
  }

  place(kind, ctx) {
    const { R, geo, colliders } = ctx;
    const glowMat = () => new Material({ emissive: 1, castShadow: false, outline: false });
    if (PROPS[kind]) {
      const p = this.room(ctx, kind === 'mine' ? 1.4 : 1.1); if (!p) return;
      this.addProp(kind, p[0], p[1]);
      this.areas.push({ x: p[0], z: p[1], r: 1.2 });
      return;
    }
    const h = { kind, t: R() * 5, on: false };
    if (kind === 'lava') {
      // 지그재그 균열 (가지 하나)
      const L = R.range(4.5, 7.5), c = this.room(ctx, L * 0.55); if (!c) return;
      const yaw = R() * Math.PI, ux = Math.sin(yaw), uz = Math.cos(yaw), w = R.range(0.55, 0.75);
      const pts = [];
      for (let i = 0; i <= 5; i++) { const t = (i / 5 - 0.5) * L, j = i % 5 ? R.range(-0.6, 0.6) : 0; pts.push([c[0] + ux * t + uz * j, c[1] + uz * t - ux * j]); }
      const segs = [];
      for (let i = 0; i < 5; i++) segs.push([...pts[i], ...pts[i + 1], w]);
      const m = pts[2 + ((R() * 2) | 0)], by = yaw + (R() < 0.5 ? 1 : -1) * R.range(0.8, 1.3), bl = R.range(1.4, 2.4);
      segs.push([m[0], m[1], m[0] + Math.sin(by) * bl, m[1] + Math.cos(by) * bl, w * 0.6]);
      const gl = new Geometry();
      for (const [ax, az, bx, bz, ww] of segs) {
        const len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
        geo.merge(Geometry.box(ww + 0.55, 0.035, len + 0.4, [0.12, 0.08, 0.08]), { position: [mx, 0, mz], rotation: [0, a, 0] }); // 그을린 테두리
        gl.merge(Geometry.box(ww, 0.05, len + 0.1, [1, 0.42, 0.1]), { position: [mx, 0, mz], rotation: [0, a, 0] });
        gl.merge(Geometry.box(ww * 0.35, 0.06, len * 0.8, [1, 0.85, 0.35]), { position: [mx, 0, mz], rotation: [0, a, 0] }); // 밝은 심
      }
      Object.assign(h, { segs, x: c[0], z: c[1], r: L * 0.55 + 1, period: R.range(5.5, 8), warn: 1.4, live: 0.9, tickT: 0.3, mesh: this.rooms.addMesh(gl, glowMat()) });
      this.areas.push({ x: c[0], z: c[1], r: L * 0.5 });
    } else if (kind === 'elec') {
      // 전기 바닥 판: 2~3 × 2~3 칸, 체크무늬 두 조
      const nx = 2 + ((R() * 2) | 0), nz = 2 + ((R() * 2) | 0), S = 1.8, rr = Math.hypot(nx, nz) * S * 0.5;
      const c = this.room(ctx, rr); if (!c) return;
      const groups = [[], []], gls = [new Geometry(), new Geometry()];
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = c[0] + (i - (nx - 1) / 2) * S, z = c[1] + (j - (nz - 1) / 2) * S, gi = (i + j) & 1;
        groups[gi].push([x, z]);
        geo.merge(Geometry.box(S - 0.08, 0.04, S - 0.08, [0.15, 0.16, 0.21]), { position: [x, 0, z] });
        const gl = gls[gi], col = [0.35, 0.8, 1], q = S * 0.5 - 0.18;
        for (const s of [-1, 1]) { gl.merge(Geometry.box(S - 0.36, 0.06, 0.09, col), { position: [x, 0, z + s * q] }); gl.merge(Geometry.box(0.09, 0.06, S - 0.36, col), { position: [x + s * q, 0, z] }); }
        gl.merge(Geometry.box(0.5, 0.065, 0.08, col), { position: [x, 0, z], rotation: [0, 0.8, 0] });
        gl.merge(Geometry.box(0.5, 0.065, 0.08, col), { position: [x, 0, z], rotation: [0, -0.8, 0] });
      }
      const period = R.range(4.2, 5.2);
      for (const gi of [0, 1]) {
        if (!groups[gi].length) continue;
        this.list.push({ kind, tiles: groups[gi], half: S * 0.5, x: c[0], z: c[1], r: rr + 1, period, t: gi * period * 0.5 + R() * 0.3, warn: 1.0, live: 1.1, tickT: 0.35, mesh: this.rooms.addMesh(gls[gi], glowMat()) });
      }
      this.areas.push({ x: c[0], z: c[1], r: rr });
      return;
    } else if (kind === 'belt') {
      // 컨베이어: 축 방향, 길이 6~9
      const L = R.range(6, 9), W = 2.1, c = this.room(ctx, L * 0.5); if (!c) return;
      const yaw = (R() < 0.5 ? 0 : Math.PI / 2) + (R() < 0.5 ? Math.PI : 0), ux = Math.round(Math.sin(yaw)), uz = Math.round(Math.cos(yaw));
      // 벽과 겹치면 포기
      for (let t = -L / 2; t <= L / 2; t += 1) if (colliders.some((q) => Math.hypot(q.x - c[0] - ux * t, q.z - c[1] - uz * t) < q.r + 1.3)) return;
      geo.merge(Geometry.box(W, 0.05, L, [0.12, 0.12, 0.14]), { position: [c[0], 0, c[1]], rotation: [0, yaw, 0] });
      for (const s of [-1, 1]) {
        for (let t = -L / 2; t < L / 2 - 0.1; t += 0.8) geo.merge(Geometry.box(0.2, 0.12, 0.4, ((t * 1.25 + 9) | 0) & 1 ? [0.85, 0.7, 0.2] : [0.15, 0.15, 0.17]), { position: [c[0] + uz * s * W * 0.55 + ux * (t + 0.2), 0, c[1] - ux * s * W * 0.55 + uz * (t + 0.2)], rotation: [0, yaw, 0] });
        geo.merge(Geometry.cylinder(0.2, 0.2, W, 6, [0.3, 0.3, 0.34]), { position: [c[0] + ux * s * L * 0.5 - uz * W * 0.5, 0.2, c[1] + uz * s * L * 0.5 + ux * W * 0.5], rotation: [0, yaw, Math.PI / 2] });
      }
      Object.assign(h, { x: c[0], z: c[1], ux, uz, L, W, yaw, speed: 3.4, r: L * 0.5 + 1, off: 0 });
      this.areas.push({ x: c[0], z: c[1], r: L * 0.5 });
    } else if (kind === 'cryo') {
      const r = 2.7, c = this.room(ctx, r); if (!c) return;
      geo.merge(Geometry.cylinder(0.85, 0.95, 0.1, 8, [0.3, 0.34, 0.4]), { position: [c[0], 0, c[1]] });
      for (let k = -1; k <= 1; k++) geo.merge(Geometry.box(1.3, 0.14, 0.12, [0.18, 0.2, 0.26]), { position: [c[0], 0.02, c[1] + k * 0.32] });
      const gl = new Geometry();
      gl.merge(flatRing(0.9, 28, [0.6, 0.9, 1]), { position: [c[0], 0.05, c[1]], scale: [r, 1, r] });
      gl.merge(Geometry.cylinder(0.6, 0.6, 0.05, 8, [0.6, 0.9, 1]), { position: [c[0], 0.06, c[1]] });
      Object.assign(h, { x: c[0], z: c[1], r, period: R.range(5, 7), warn: 1.3, live: 0.45, mesh: this.rooms.addMesh(gl, glowMat()) });
      this.areas.push({ x: c[0], z: c[1], r });
    } else if (kind === 'ice') {
      const r = R.range(2.2, 3.4), c = this.room(ctx, r); if (!c) return;
      const n = 9, pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = r * R.range(0.8, 1.1); pts.push([c[0] + Math.cos(a) * k, 0.03, c[1] + Math.sin(a) * k]); }
      for (let i = 0; i < n; i++) geo.tri([c[0], 0.03, c[1]], pts[(i + 1) % n], pts[i], [0.55, 0.74, 0.9], null, [0, 1, 0]);
      for (let k = 0; k < 3; k++) { const a = R() * TAU; geo.merge(Geometry.box(0.06, 0.04, r * 1.2, [0.88, 0.95, 1]), { position: [c[0], 0.02, c[1]], rotation: [0, a, 0] }); }
      Object.assign(h, { x: c[0], z: c[1], r });
      this.areas.push({ x: c[0], z: c[1], r });
    } else if (kind === 'pylon') {
      const r = 3.3, c = this.room(ctx, r); if (!c) return;
      const col = R.pick(ctx.Z.stone), gl = new Geometry();
      for (let k = 0; k < 4; k++) gl.merge(Geometry.cone(0.3 + R() * 0.12, R.range(1.8, 2.8), 5, col), { position: [c[0] + R.range(-0.25, 0.25), 0, c[1] + R.range(-0.25, 0.25)], rotation: [R.range(-0.25, 0.25), R() * 6, R.range(-0.25, 0.25)] });
      gl.merge(flatRing(0.93, 32, col), { position: [c[0], 0.05, c[1]], scale: [r, 1, r] });
      geo.merge(Geometry.cylinder(0.85, 1, 0.3, 7, [0.24, 0.22, 0.34]), { position: [c[0], 0, c[1]] });
      colliders.push({ x: c[0], z: c[1], r: 0.75, block: true });
      Object.assign(h, { x: c[0], z: c[1], r, col, period: R.range(6, 8), warn: 1.5, live: 0.4, mesh: this.rooms.addMesh(gl, glowMat()) });
      this.areas.push({ x: c[0], z: c[1], r: r * 0.7 });
    } else return;
    this.list.push(h);
  }

  addProp(kind, x, z) {
    const P = PROPS[kind], K = this.game.enemies.k, d = Math.max(0, this.rooms.depth);
    const hp = P.cover ? P.hp * (1 + d * 0.25) * Math.pow(K.hp, 0.55) : P.hp * Math.pow(K.hp, 0.5);
    const e = { prop: true, kind, P, x, z, y: 0, r: P.r, hp, maxHp: hp, flash: 0, yaw: this.ctx.R() * TAU, T: { mass: 1e4, fly: 0, dmg: 0, xp: 0 }, mass: 1e4, kx: 0, kz: 0, spawnT: 9, fuse: -1 };
    if (!P.walk) { e.col = { x, z, r: P.r, block: true, prop: e }; this.rooms.colliders.push(e.col); }
    this.props.push(e);
    return e;
  }

  // enemies.update 에서: 소품을 적 격자에 넣는다 (무기/폭발 판정에 걸리게)
  insertProps(grid) { for (const e of this.props) if (!e.dead && e.fuse < 0) grid.insert(e); }

  // enemies.hit 에서 소품이 맞았을 때
  hitProp(e, dmg) {
    if (e.dead || e.fuse >= 0) return;
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp > 0) return;
    if (e.P.boom) { e.fuse = e.kind === 'mine' ? 0.12 : 0.16 + Math.random() * 0.14; return; }
    this.breakProp(e);
  }
  breakProp(e) {
    const g = this.game, fx = g.fx;
    e.dead = true;
    if (e.col) { this.rooms.colliders = this.rooms.colliders.filter((c) => c !== e.col); this.rooms.flow.unblock(e.x, e.z, e.r); }
    fx.explosion(e.x, 0.6, e.z, 0.7, { color: [1, 0.8, 0.5], scorch: false, debris: e.kind === 'iceblock' ? [0.7, 0.85, 0.95] : e.kind === 'crate' ? [0.55, 0.4, 0.25] : [0.35, 0.33, 0.35] });
    for (let i = 0; i < 4; i++) fx.chunk(e.x, 0.6, e.z, e.kind === 'iceblock' ? [0.7, 0.85, 0.95] : [0.4, 0.36, 0.34], 5);
    g.sfx.play('clank', { vol: 0.5 });
  }
  explode(e) {
    const g = this.game, en = g.enemies, K = en.k, p = g.player, B = e.P.boom, fx = g.fx;
    e.dead = true;
    if (e.col) { this.rooms.colliders = this.rooms.colliders.filter((c) => c !== e.col); this.rooms.flow.unblock(e.x, e.z, e.r); }
    en.blast(e.x, e.z, B.r, B.dmg * K.hp, false, 0);
    const dx = p.x - e.x, dz = p.z - e.z;
    if (Math.hypot(dx, dz) < B.r + p.r * 0.4) p.hurt(B.pDmg * K.dmg, dx, dz);
    fx.explosion(e.x, 0.7, e.z, e.kind === 'mine' ? 1.2 : 1.7, { color: B.col });
    fx.ring(e.x, 0.15, e.z, B.r, B.col, 0.35);
    fx.light([e.x, 1.2, e.z], B.col, B.r * 2.2, 1.4, 0.35);
    g.sfx.play('bigboom', { vol: 0.7 });
    fx.addTrauma(0.25);
  }

  // ---- 특수 방 ----
  setupSpecial(kind) {
    this.special = kind;
    const g = this.game, sc = g.scene, R = this.rooms;
    if (kind === 'dark') {
      this.base = { sun: sc.sun.intensity, sky: [...sc.ambientSky], gnd: [...sc.ambientGround], fog: [...sc.skyColor] };
      sc.sun.intensity *= 0.1; sc.ambientSky = sc.ambientSky.map((v) => v * 0.22); sc.ambientGround = sc.ambientGround.map((v) => v * 0.22);
      sc.skyColor = sc.fog.color = sc.skyColor.map((v) => v * 0.4);
      this.lamp = { position: [0, 2.5, 0], color: [1, 0.92, 0.8], radius: 8.5, intensity: 1.5 };
      R.lights.push(this.lamp);
      this.dark = 1;
    } else if (kind === 'storm') {
      this.rMax = Math.hypot(R.hx, R.hz) + 1; this.rMin = 5.5; this.ringR = this.rMax; this.ringT = 0;
    }
  }
  // 고리 밖인가 (적 소환 위치 거르기)
  outside(x, z, m = 0) { return this.special === 'storm' && Math.hypot(x, z) > this.ringR - m; }

  // ---- 매 프레임 ----
  update(dt) {
    const g = this.game, R = this.rooms, en = g.enemies, p = g.player, fx = g.fx, K = en.k;
    const fight = R.phase === 'fight';
    this.t += dt;
    const pFloor = !p.stats.flying;
    const near = (x, z) => Math.hypot(p.x - x, p.z - z) < 15;

    for (const h of this.list) {
      // 상태: idle → warn → live. 방을 제압하면 꺼진다
      let st = 'idle', k = 0;
      if (h.period) {
        if (fight) h.t += dt;
        const ph = h.t % h.period, w0 = h.period - h.warn - h.live, l0 = h.period - h.live;
        if (fight && ph >= l0) { st = 'live'; k = (ph - l0) / h.live; } else if (fight && ph >= w0) { st = 'warn'; k = (ph - w0) / h.warn; }
        if (st === 'live' && !h.on) { h.on = true; h.tick = 0; h.burst = true; } else h.burst = false;
        if (st !== 'live') h.on = false;
      }
      const M = h.mesh?.material;
      if (h.kind === 'lava') {
        const cool = fight ? 1 : 0.4;
        if (st === 'idle') M.color = [0.32 * cool, 0.3 * cool, 0.3 * cool];
        else if (st === 'warn') { const f = 0.45 + 0.55 * Math.abs(Math.sin(this.t * (6 + k * 14))); M.color = [f, f * 0.85, f * 0.7]; if (Math.random() < 0.4) this.alongCrack(h, (x, z) => fx.sparks.emit({ position: [x, 0.1, z], velocity: [0, 1.5 + Math.random() * 2, 0], life: 0.35, size: 2, sizeEnd: 1, color: [1, 0.7, 0.2], colorEnd: [0.8, 0.2, 0.05], emissive: 1, gravity: 0.6 })); }
        else {
          M.color = [1.9, 1.6, 1.2];
          for (let i = 0; i < 3; i++) this.alongCrack(h, (x, z) => fx.trail.emit({ position: [x, 0.1, z], velocity: [(Math.random() - 0.5) * 0.8, 3 + Math.random() * 4, (Math.random() - 0.5) * 0.8], life: 0.3 + Math.random() * 0.25, size: 3 + Math.random() * 2, sizeEnd: 1, color: [1, 0.85, 0.4], colorEnd: [1, 0.25, 0.05], emissive: 1, gravity: 0 }));
          if (h.burst) { fx.light([h.x, 1, h.z], [1, 0.5, 0.15], 7, 1.2, h.live); if (near(h.x, h.z)) g.sfx.play('boom', { vol: 0.45 }); }
          if ((h.tick -= dt) <= 0) {
            h.tick = h.tickT;
            const w = (e) => h.segs.some(([ax, az, bx, bz, ww]) => segDist(e.x, e.z, ax, az, bx, bz) < ww * 0.5 + e.r * 0.5);
            en.each(h.x, h.z, h.r, (e) => { if (onFloor(e) && w(e)) this.harm(e, 0.45, 0, 0, { launch: 2.5 }); });
            if (pFloor && w(p)) p.hurt(15 * K.dmg, p.x - h.x, p.z - h.z);
          }
        }
      } else if (h.kind === 'elec') {
        if (st === 'idle') M.color = fight ? [0.28, 0.28, 0.32] : [0.12, 0.12, 0.14];
        else if (st === 'warn') { const on = Math.sin(this.t * (24 + k * 30)) > 0; M.color = on ? [1.5, 1.5, 1.5] : [0.25, 0.25, 0.3]; }
        else {
          const f = 1.8 + Math.random() * 0.8; M.color = [f, f, f];
          if (Math.random() < 0.7) { const [x, z] = h.tiles[(Math.random() * h.tiles.length) | 0]; fx.sparks.emit({ position: [x + (Math.random() - 0.5) * 1.6, 0.15, z + (Math.random() - 0.5) * 1.6], velocity: [(Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4], life: 0.18, size: 2, sizeEnd: 1, color: [0.9, 1, 1], colorEnd: [0.3, 0.7, 1], emissive: 1, gravity: 0.4 }); }
          if (h.burst) { fx.light([h.x, 1, h.z], [0.4, 0.8, 1], 6, 1.1, h.live); if (near(h.x, h.z)) g.sfx.play('beam', { vol: 0.3 }); }
          if ((h.tick -= dt) <= 0) {
            h.tick = h.tickT;
            const w = (e) => h.tiles.some(([x, z]) => Math.abs(e.x - x) < h.half + e.r * 0.3 && Math.abs(e.z - z) < h.half + e.r * 0.3);
            en.each(h.x, h.z, h.r, (e) => { if (onFloor(e) && w(e)) { this.harm(e, 0.32, 0, 0, { stun: 0.7 }); fx.hitSpark([e.x, 0.6, e.z], [0.5, 0.9, 1], 2); } });
            if (pFloor && w(p)) p.hurt(13 * K.dmg, p.vx, p.vz);
          }
        }
      } else if (h.kind === 'belt') {
        // 화살표가 흐르고, 위에 선 지상 유닛을 민다
        if (fight) h.off = (h.off + dt * h.speed) % 1.3;
        const inside = (e, m = 0) => { const rx = e.x - h.x, rz = e.z - h.z, u = rx * h.ux + rz * h.uz, v = rx * h.uz - rz * h.ux; return Math.abs(u) < h.L / 2 + m && Math.abs(v) < h.W / 2 + m; };
        if (fight) {
          const v = h.speed * dt;
          en.each(h.x, h.z, h.r, (e) => { if (!e.prop && onFloor(e) && !e.T.part && inside(e)) { e.x += h.ux * v; e.z += h.uz * v; } });
          if (pFloor && p.dashT <= 0 && inside(p)) { p.x += h.ux * v; p.z += h.uz * v; R.clamp(p, p.r, true); }
        }
      } else if (h.kind === 'cryo') {
        if (st === 'idle') M.color = fight ? [0.3, 0.3, 0.32] : [0.15, 0.15, 0.16];
        else if (st === 'warn') {
          const on = Math.sin(this.t * (14 + k * 26)) > 0; M.color = on ? [1.4, 1.4, 1.4] : [0.35, 0.35, 0.4];
          if (Math.random() < 0.5) fx.smoke.emit({ position: [h.x + (Math.random() - 0.5), 0.2, h.z + (Math.random() - 0.5)], velocity: [0, 1 + Math.random(), 0], life: 0.6, size: 2, sizeEnd: 4, color: [0.85, 0.95, 1], colorEnd: [0.6, 0.75, 0.9] });
        } else {
          M.color = [2 - k * 1.5, 2 - k * 1.5, 2 - k * 1.5];
          if (h.burst) {
            fx.ring(h.x, 0.2, h.z, h.r, [0.7, 0.95, 1], 0.4); fx.light([h.x, 1, h.z], [0.6, 0.9, 1], 7, 1.2, 0.4);
            for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, s = 3 + Math.random() * 4; fx.smoke.emit({ position: [h.x, 0.3, h.z], velocity: [Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s], life: 0.5, size: 3, sizeEnd: 5, color: [0.9, 0.97, 1], colorEnd: [0.6, 0.8, 1] }); }
            if (near(h.x, h.z)) g.sfx.play('shield', { vol: 0.45 });
            en.each(h.x, h.z, h.r, (e) => { const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz) || 1; this.harm(e, 0.4, dx / d, dz / d, { stun: 1.6, knock: 6 }); });
            if (Math.hypot(p.x - h.x, p.z - h.z) < h.r + p.r * 0.4 && p.hurt(11 * K.dmg, p.x - h.x, p.z - h.z)) p.attackSlow = Math.max(p.attackSlow || 0, 1.1);
          }
        }
      } else if (h.kind === 'ice') {
        if (Math.hypot(p.x - h.x, p.z - h.z) < h.r * 0.92 && pFloor && p.dashT <= 0) { p.ex += p.vx * 4.5 * dt; p.ez += p.vz * 4.5 * dt; }
        en.each(h.x, h.z, h.r, (e) => { if (!e.prop && onFloor(e) && Math.hypot(e.x - h.x, e.z - h.z) < h.r * 0.92) { const f = 1 + 4.5 * dt; e.kx *= f; e.kz *= f; } });
      } else if (h.kind === 'pylon') {
        if (st === 'idle') M.color = fight ? [0.55, 0.55, 0.55] : [0.35, 0.35, 0.35];
        else if (st === 'warn') { const f = 0.6 + k * 1.4 + (Math.random() < 0.2 ? 0.4 : 0); M.color = [f, f, f]; if (Math.random() < 0.3) fx.sparks.emit({ position: [h.x + (Math.random() - 0.5), 0.5 + Math.random() * 2, h.z + (Math.random() - 0.5)], velocity: [0, 1, 0], life: 0.3, size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: h.col, emissive: 1, gravity: 0 }); }
        else {
          M.color = [2.4 - k * 1.6, 2.4 - k * 1.6, 2.4 - k * 1.6];
          if (h.burst) {
            fx.ring(h.x, 0.3, h.z, h.r, h.col, 0.35); fx.ring(h.x, 1.2, h.z, h.r * 0.8, h.col, 0.3); fx.light([h.x, 2, h.z], h.col, 8, 1.4, 0.35);
            if (near(h.x, h.z)) g.sfx.play('beam', { vol: 0.4 });
            en.each(h.x, h.z, h.r, (e) => { const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz) || 1; this.harm(e, 0.5, dx / d, dz / d, { knock: 10 }); });
            if (Math.hypot(p.x - h.x, p.z - h.z) < h.r + p.r * 0.4) p.hurt(14 * K.dmg, p.x - h.x, p.z - h.z);
          }
        }
      }
    }

    this.updateProps(dt, fight);
    this.blockShots();
    this.updateSpecial(dt, fight);
    this.render();
  }

  alongCrack(h, fn) { const s = h.segs[(Math.random() * h.segs.length) | 0], t = Math.random(); fn(s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t); }

  // 위험 요소 → 유닛. 소품은 드럼통/지뢰 점화, 엄폐물은 조금 깎임
  harm(e, frac, dx, dz, { stun = 0, launch = 0, knock = 0 } = {}) {
    if (e.prop) { this.hitProp(e, e.P.boom ? 1e9 : e.maxHp * 0.15); return; }
    this.game.enemies.hit(e, enemyDmg(e, frac), dx, dz, knock, { noNum: true, stun, launch });
  }

  updateProps(dt, fight) {
    const g = this.game, en = g.enemies, p = g.player, fx = g.fx;
    for (const e of this.props) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.fuse >= 0) {
        e.fuse -= dt;
        if (Math.random() < 0.6) fx.sparks.emit({ position: [e.x, 0.9, e.z], velocity: [(Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3], life: 0.2, size: 2, sizeEnd: 1, color: [1, 0.9, 0.5], colorEnd: [1, 0.3, 0.1], emissive: 1, gravity: 0.5 });
        if (e.fuse < 0) this.explode(e);
        continue;
      }
      // 지뢰: 지상 유닛이 밟으면 0.55초 뒤 폭발
      if (e.kind === 'mine' && fight) {
        if (e.armT === undefined) {
          let hit = pFloorNear(p, e);
          if (!hit) en.each(e.x, e.z, 0.9, (o) => { if (!o.prop && onFloor(o)) hit = true; });
          if (hit) { e.armT = 0.55; g.sfx.play('click', { vol: 0.8 }); }
        } else if ((e.armT -= dt) <= 0) { e.hp = 0; e.fuse = 0; }
      }
    }
    if (this.props.some((e) => e.dead)) this.props = this.props.filter((e) => !e.dead);
  }

  // 적 탄은 벽/엄폐물에 막힌다. 엄폐물은 조금씩 깎이고, 드럼통은 터진다
  blockShots() {
    const S = this.game.shots.enemyList, C = this.rooms.colliders;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i];
      for (const c of C) {
        if (!c.block || Math.abs(s.x - c.x) > c.r || Math.abs(s.z - c.z) > c.r || (s.x - c.x) ** 2 + (s.z - c.z) ** 2 > c.r * c.r * 0.8) continue;
        S.splice(i, 1);
        this.game.fx.hitSpark([s.x, s.y, s.z], [1, 0.6, 0.35], 2);
        if (c.prop) this.hitProp(c.prop, c.prop.P.boom ? 1e9 : c.prop.maxHp * 0.035);
        break;
      }
    }
  }

  updateSpecial(dt, fight) {
    const g = this.game, sc = g.scene, p = g.player, en = g.enemies;
    if (this.special === 'dark') {
      // 제압하면 불이 다시 들어온다
      if (!fight) this.dark = Math.max(0, this.dark - dt * 0.8);
      const B = this.base, k = this.dark, mix = (lo, hi) => hi * (1 - k) + lo * k;
      sc.sun.intensity = mix(B.sun * 0.1, B.sun);
      sc.ambientSky = B.sky.map((v) => mix(v * 0.22, v)); sc.ambientGround = B.gnd.map((v) => mix(v * 0.22, v));
      sc.skyColor = sc.fog.color = B.fog.map((v) => mix(v * 0.4, v));
      this.lamp.position = [p.x, 2.6 * (p.size || 1), p.z];
      this.lamp.intensity = 1.5 * k + 0.2;
    } else if (this.special === 'storm') {
      const R = this.rooms;
      if (fight) { const k = Math.max(0, Math.min(1, R.roomT / (R.duration * 0.8))), s = k * k * (3 - 2 * k); this.ringR = this.rMax + (this.rMin - this.rMax) * s; }
      else this.ringR += dt * 12;
      if (fight && (this.ringT -= dt) <= 0) {
        this.ringT = 0.5;
        if (Math.hypot(p.x, p.z) > this.ringR - p.r * 0.5) p.hurt(8 * en.k.dmg, -p.x, -p.z);
        for (const e of en.list) if (e.spawnT > 0.5 && Math.hypot(e.x, e.z) > this.ringR) en.hit(e, enemyDmg(e, 0.15), -e.x, -e.z, 2, { noNum: true });
      }
    }
  }

  render() {
    const t = this.t, counts = {};
    for (const k in this.inst) counts[k] = 0;
    for (const e of this.props) {
      const I = this.inst[e.kind], i = counts[e.kind]++;
      if (i >= 24) continue;
      const hurt = e.P.cover ? 0.82 + 0.18 * Math.max(0, e.hp / e.maxHp) : 1;
      const fusing = e.fuse >= 0 || e.armT !== undefined, blink = fusing && Math.sin(t * 50) > 0;
      const m = m4.fromTRS([e.x, 0, e.z], [0, e.yaw, 0], [1, hurt, 1]);
      const f = e.flash > 0 || blink;
      I.body.setAt(i, m, f ? [2.4, 2.4, 2.4] : e.P.cover ? [hurt, hurt, hurt] : [1, 1, 1], f ? 0.6 : 0);
      const gk = e.kind === 'mine' && !fusing ? 0.45 + 0.4 * (Math.sin(t * 3 + e.yaw * 5) > 0.6 ? 1 : 0) : blink ? 2.5 : 1;
      if (I.glow) I.glow.setAt(i, m, [gk, gk, gk], 1);
    }
    for (const k in this.inst) { const I = this.inst[k]; I.body.count = Math.min(24, counts[k]); if (I.glow) I.glow.count = I.body.count; }
    // 컨베이어 화살표
    let n = 0;
    for (const h of this.list) {
      if (h.kind !== 'belt') continue;
      for (let s = -h.L / 2 + 0.6 + h.off; s < h.L / 2 - 0.5 && n < 200; s += 1.3) {
        this.chev.setAt(n++, m4.fromTRS([h.x + h.ux * s, 0.06, h.z + h.uz * s], [0, h.yaw, 0], [1, 1, 1]), this.rooms.phase === 'fight' ? [1, 1, 1] : [0.4, 0.4, 0.4], 1);
      }
    }
    this.chev.count = n;
    // 수축 방어막
    if (this.special === 'storm' && this.ringR < this.rMax + 4) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 6);
      this.band.setAt(0, m4.fromTRS([0, 0, 0], [0, t * 0.3, 0], [this.ringR, 1, this.ringR]), [pulse, pulse, pulse], 1);
      this.band.count = 1;
    } else this.band.count = 0;
  }
}

function pFloorNear(p, e) { return !p.stats.flying && p.dashT <= 0 && Math.hypot(p.x - e.x, p.z - e.z) < 0.9 + p.r * 0.3; }
