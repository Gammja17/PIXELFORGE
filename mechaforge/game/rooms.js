// 방 탐험: 구역(사막 폐허 / 폐공장 / 수정 협곡)별 방을 하나씩 생성하고,
// 적 웨이브 → 클리어 → 보상 → 출구 문(다음 방 보상 아이콘) 선택 → 다음 방… → 보스 방.
//
//  카메라가 -x,-z 쪽(화면 위)을 바라보므로 먼 벽(W: -x, S: -z)은 높게, 가까운 벽(E, N)은 낮게 만든다.
//  입구는 항상 가까운 쪽, 출구는 먼 쪽 → 플레이어는 화면 위로 전진한다 (하데스식).

import { Geometry, Mesh, Material, fbm, rng } from '../engine/index.js';
import { MIDBOSS_KINDS } from './midbosses.js';

export const ZONES = {
  desert: {
    name: '사막 폐허', sun: { dir: [0.55, 0.62, 0.35], color: [1, 0.78, 0.62], k: 0.72 }, sky: [0.22, 0.23, 0.38], gnd: [0.17, 0.13, 0.15], fog: [0.09, 0.08, 0.14],
    floor: [[0.62, 0.5, 0.41], [0.56, 0.43, 0.37], [0.5, 0.38, 0.34]], wall: [[0.5, 0.38, 0.34], [0.58, 0.44, 0.37], [0.44, 0.33, 0.32]], stone: [[0.62, 0.58, 0.55], [0.5, 0.47, 0.46]],
  },
  factory: {
    name: '폐공장', sun: { dir: [0.4, 0.75, 0.5], color: [0.85, 0.9, 1], k: 0.62 }, sky: [0.24, 0.27, 0.36], gnd: [0.16, 0.16, 0.18], fog: [0.06, 0.07, 0.1],
    floor: [[0.38, 0.4, 0.44], [0.33, 0.35, 0.39], [0.3, 0.31, 0.35]], wall: [[0.36, 0.38, 0.44], [0.3, 0.32, 0.37]], stone: [[0.2, 0.55, 0.55], [0.85, 0.45, 0.2]],
  },
  crystal: {
    name: '수정 협곡', sun: { dir: [0.3, 0.8, 0.5], color: [0.62, 0.72, 1], k: 0.5 }, sky: [0.22, 0.2, 0.42], gnd: [0.12, 0.1, 0.2], fog: [0.05, 0.04, 0.1],
    floor: [[0.3, 0.27, 0.42], [0.26, 0.24, 0.38], [0.22, 0.2, 0.33]], wall: [[0.24, 0.22, 0.34], [0.3, 0.27, 0.4]], stone: [[0.45, 0.95, 1], [1, 0.45, 0.9]],
  },
};
// 런 구성: 깊이별 구역 (마지막 = 보스)
export const RUN_ZONES = ['desert', 'desert', 'desert', 'factory', 'factory', 'factory', 'crystal', 'crystal', 'crystal'];
export const REWARDS = {
  part:     { name: '부품 캐시', icon: 'part', desc: '무기나 모듈 선택' },
  system:   { name: '시스템 튜닝', icon: 'system', desc: '능력치 선택' },
  supply:   { name: '보급 상자', icon: 'supply', desc: '수리 + 경험치' },
  xp:       { name: '데이터 코어', icon: 'xp', desc: '대량 경험치' },
  elite:    { name: '정예 부대', icon: 'elite', desc: '강적 + 부품' },
  guardian: { name: '구역 수호자', icon: 'boss', desc: '중간 보스 + 부품' },
  workshop: { name: '정비 드론 기지', icon: 'workshop', desc: '부품 강화, 분해, 수리' },
  boss:     { name: '타이탄', icon: 'boss', desc: '최종 보스' },
  start:    { name: '출격', icon: 'part', desc: '' },
};

const DOOR_HALF = 2.2;
const SIDE = { W: [-1, 0], S: [0, -1], E: [1, 0], N: [0, 1] }; // 방향 → (x, z) 부호

export class Rooms {
  constructor(game) {
    this.game = game;
    this.meshes = [];
    this.colliders = [];
    this.doors = [];
    this.hx = 12; this.hz = 12;
    // 문 차단막 / 보상 오브젝트 공용 지오메트리
    const bar = new Geometry();
    for (let i = -2; i <= 2; i++) bar.merge(Geometry.box(0.08, 2.2, 0.08), { position: [0, 0, i * 0.85] });
    bar.merge(Geometry.box(0.06, 0.08, 4.2), { position: [0, 0.7, 0] });
    bar.merge(Geometry.box(0.06, 0.08, 4.2), { position: [0, 1.5, 0] });
    this.barGeo = bar;
  }

  get last() { return RUN_ZONES.length - 1; }

  // ---- 난이도 ----
  // 플레이어 전력 지수 (시작 = 1): 레벨, 무기 수/레벨/진화, 화력 배율
  power() {
    const g = this.game, ws = g.weapons?.list || [];
    const wp = ws.reduce((s, w) => s + (w.level || 1) + (w.evo ? 4 : 0), 0);
    return Math.max(1, (1 + ((g.level || 1) - 1) * 0.05 + Math.max(0, wp - 1) * 0.08) * (g.player?.stats?.dmgMul || 1));
  }
  // 깊이 × 전력 → 적 체력/피해/물량 배율. 늦은 방에서 강해진 만큼 적도 따라온다 (떼거리는 덜 단단해지고 더 많아진다)
  scale() {
    const d = Math.max(0, this.depth), pw = this.power();
    return {
      pw,
      hp: (1 + d * 0.45) * Math.pow(pw, 0.65),
      swarmHp: (1 + d * 0.35) * Math.pow(pw, 0.3),
      dmg: 1 + d * 0.12 + (pw - 1) * 0.05,
      dens: Math.min(2.4, 0.9 + d * 0.06 + (pw - 1) * 0.15),
    };
  }

  newRun() { this.depth = -1; this.path = []; this.seed = (Math.random() * 1e9) | 0; }

  // 다음 방 후보 (문 2개까지)
  rollExits(depth) {
    const R = rng(this.seed + depth * 77);
    if (depth + 1 >= this.last) return ['boss'];
    if (depth + 1 === 2 || depth + 1 === 5) return ['guardian'];
    const pool = ['part', 'part', 'system', 'supply', 'xp', 'elite'];
    if (depth >= 1) pool.push('workshop');
    if (depth <= 1) pool.splice(pool.indexOf('elite'), 1);
    const n = depth === 0 ? 2 : R() < 0.75 ? 2 : 1;
    const out = [];
    if (depth === 3 || depth === 6) out.push('workshop');
    while (out.length < n) { const r = R.pick(pool); if (!out.includes(r)) out.push(r); }
    return out;
  }

  clear() {
    for (const m of this.meshes) { this.game.scene.remove(m); if (m.geometry !== this.barGeo) m.geometry.dispose(this.game.engine.gl); }
    this.meshes = []; this.colliders = []; this.doors = [];
  }
  addMesh(geo, mat) { const m = this.game.scene.add(new Mesh(geo, mat)); this.meshes.push(m); return m; }

  // ---- 방 만들기 ----
  enter(reward, entrySide = 'E') {
    const g = this.game, sc = g.scene;
    this.clear();
    this.depth++;
    const depth = this.depth;
    const zoneId = RUN_ZONES[Math.min(depth, this.last)];
    const Z = ZONES[zoneId];
    this.zone = zoneId; this.reward = reward;
    const R = rng(this.seed + depth * 131 + 7);
    const boss = reward === 'boss';
    const big = boss || reward === 'guardian';
    this.hx = big ? 16 : R.range(15, 18); this.hz = big ? 16 : R.range(15, 18);
    if (reward === 'workshop' || reward === 'start') { this.hx = 9; this.hz = 9; }
    const hx = this.hx, hz = this.hz;
    this.path.push({ reward, zone: zoneId });

    // 조명
    sc.sun.direction = Z.sun.dir; sc.sun.color = Z.sun.color; sc.sun.intensity = Z.sun.k;
    sc.ambientSky = Z.sky; sc.ambientGround = Z.gnd; sc.skyColor = sc.fog.color = Z.fog;
    this.lights = [];

    // 출구 문 (먼 벽: W, S), 입구 문 (가까운 벽)
    const exits = this.rollExits(depth);
    const farSides = exits.length === 1 ? [R() < 0.5 ? 'W' : 'S'] : ['W', 'S'];
    this.doors = exits.map((rw, i) => ({ side: farSides[i], reward: rw, open: false, fade: 0 }));
    this.entry = { side: entrySide, reward: null, open: false, entry: true, fade: 0 };

    // 바닥
    const S = Math.max(hx, hz) * 2 + 34;
    const floor = Geometry.grid(S, S, 30, 30, () => 0, (c) => {
      const inside = Math.abs(c[0]) < hx && Math.abs(c[2]) < hz;
      const n = fbm(c[0] * 0.09 + depth * 3.1, c[2] * 0.09, 3);
      let col;
      if (zoneId === 'factory') col = Z.floor[((Math.floor(c[0] / 2) + Math.floor(c[2] / 2)) & 1) ? 0 : 1].slice();
      else col = (n > 0.56 ? Z.floor[2] : n > 0.44 ? Z.floor[1] : Z.floor[0]).slice();
      if (zoneId === 'factory' && inside && (Math.abs(c[0]) > hx - 1.2 || Math.abs(c[2]) > hz - 1.2)) col = ((Math.floor((c[0] + c[2]) * 0.7) & 1) ? [0.85, 0.7, 0.2] : [0.18, 0.18, 0.2]);
      if (!inside) col = col.map((v) => v * 0.42);
      return col;
    });
    this.addMesh(floor, new Material());

    const geo = new Geometry(), glow = new Geometry();
    const pick = (a) => a[(R() * a.length) | 0];
    const rock = (x, z, r, solid, col) => {
      geo.merge(Geometry.icosphere(r, 0, col || pick(Z.wall), { jitter: 0.3, seed: (R() * 1e6) | 0, squashY: 0.8 }), { position: [x, r * 0.3, z], rotation: [0, R() * 6, 0] });
      if (solid) this.colliders.push({ x, z, r: r * 0.9 });
    };
    const crystal = (x, z, h, solid) => {
      const c = pick(Z.stone);
      for (let k = 0; k < 3; k++) glow.merge(Geometry.cone(0.18 + R() * 0.15, h * (0.6 + R() * 0.5), 5, c), { position: [x + R.range(-0.3, 0.3), 0, z + R.range(-0.3, 0.3)], rotation: [R.range(-0.4, 0.4), R() * 6, R.range(-0.4, 0.4)] });
      if (solid) this.colliders.push({ x, z, r: 0.6 });
      return c;
    };
    const doorAt = (side) => [...this.doors, this.entry].find((d) => d.side === side);

    // 벽: 문 자리를 비우고 한 줄로 채운다. far = 높게, near = 낮게
    const wallLine = (side) => {
      const [sx, sz] = SIDE[side], far = side === 'W' || side === 'S', len = sx ? hz : hx, door = doorAt(side);
      for (let t = -len - 1.5; t <= len + 1.5; t += far ? 1.6 : 2.2) {
        if (door && Math.abs(t) < DOOR_HALF + 0.6) continue;
        const x = sx ? sx * (hx + 0.8) : t, z = sz ? sz * (hz + 0.8) : t;
        if (zoneId === 'factory') {
          const h = far ? R.range(2.4, 3.2) : R.range(0.5, 0.8);
          geo.merge(Geometry.box(sx ? 1 : 1.7, h, sx ? 1.7 : 1, pick(Z.wall)), { position: [x, 0, z] });
          if (far && R() < 0.3) glow.merge(Geometry.box(0.25, 0.18, 0.25, [1, 0.55, 0.15]), { position: [x - sx * 0.55, h - 0.5, z - sz * 0.55] });
          if (far && R() < 0.4) geo.merge(Geometry.cylinder(0.12, 0.12, h + 0.6, 5, [0.25, 0.27, 0.3]), { position: [x - sx * 0.6, 0, z - sz * 0.6] });
        } else {
          rock(x, z, far ? R.range(1.2, 1.9) : R.range(0.5, 0.8), false);
          if (far && zoneId === 'crystal' && R() < 0.35) crystal(x - sx * 0.8, z - sz * 0.8, R.range(1.2, 2.4), false);
        }
      }
    };
    ['W', 'S', 'E', 'N'].forEach(wallLine);

    // 문틀
    for (const d of [...this.doors, this.entry]) {
      const [sx, sz] = SIDE[d.side], far = d.side === 'W' || d.side === 'S';
      const cx = sx * (hx + 0.6), cz = sz * (hz + 0.6);
      d.x = cx; d.z = cz;
      const ph = far ? 3 : 1.2;
      for (const s of [-1, 1]) {
        const px = sx ? cx : s * (DOOR_HALF + 0.3), pz = sz ? cz : s * (DOOR_HALF + 0.3);
        geo.merge(Geometry.box(0.7, ph, 0.7, [0.3, 0.3, 0.36]), { position: [px, 0, pz] });
        glow.merge(Geometry.box(0.74, 0.14, 0.74, [1, 0.8, 0.3]), { position: [px, ph - 0.4, pz] });
      }
      if (far) geo.merge(Geometry.box(sx ? 0.7 : DOOR_HALF * 2 + 1.3, 0.5, sx ? DOOR_HALF * 2 + 1.3 : 0.7, [0.3, 0.3, 0.36]), { position: [cx, ph, cz] });
      // 차단막
      d.barrier = this.addMesh(this.barGeo, new Material({ color: d.entry ? [1, 0.3, 0.3] : [0.5, 0.9, 1], emissive: 1, outline: false, castShadow: false, opacity: 0.85 }));
      d.barrier.position = [cx, 0, cz];
      d.barrier.rotation = [0, sx ? 0 : Math.PI / 2, 0];
    }

    // 내부 장애물
    const free = (x, z, d) => Math.hypot(x, z) > 3.5 && Math.abs(x) < hx - 2 && Math.abs(z) < hz - 2 && !this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + d)
      && Math.hypot(x - hx, z) > 4 && Math.hypot(x, z - hz) > 4 && Math.hypot(x + hx, z) > 4 && Math.hypot(x, z + hz) > 4;
    const spot = (d = 2.5) => { for (let k = 0; k < 30; k++) { const x = R.range(-hx + 2, hx - 2), z = R.range(-hz + 2, hz - 2); if (free(x, z, d)) return [x, z]; } return null; };
    const nProps = reward === 'workshop' ? 2 : boss ? 4 : 5 + ((R() * 4) | 0);
    for (let i = 0; i < nProps; i++) {
      const p = spot(); if (!p) continue;
      const [x, z] = p;
      if (zoneId === 'desert') {
        if (R() < 0.5) { geo.merge(Geometry.cylinder(0.42, 0.48, R.range(1.6, 3.2), 6, pick(Z.stone)), { position: [x, 0, z] }); this.colliders.push({ x, z, r: 0.55 }); }
        else { rock(x, z, R.range(0.8, 1.3), true); if (R() < 0.6) rock(x + 1, z + 0.6, 0.4, false); }
      } else if (zoneId === 'factory') {
        const t = R();
        if (t < 0.4) { const yaw = R() < 0.5 ? 0 : Math.PI / 2; geo.merge(Geometry.box(1.3, 1.3, 2.6, pick(Z.stone)), { position: [x, 0, z], rotation: [0, yaw, 0] }); this.colliders.push({ x, z, r: 0.9 }, { x: x + (yaw ? 0.8 : 0), z: z + (yaw ? 0 : 0.8), r: 0.8 }, { x: x - (yaw ? 0.8 : 0), z: z - (yaw ? 0 : 0.8), r: 0.8 }); }
        else if (t < 0.7) { for (let k = 0; k < 3; k++) geo.merge(Geometry.cylinder(0.32, 0.32, 0.9, 7, [0.75, 0.2, 0.18]), { position: [x + (k % 2) * 0.7, 0, z + (k > 1 ? 0.7 : 0)] }); this.colliders.push({ x: x + 0.35, z: z + 0.3, r: 0.85 }); }
        else { geo.merge(Geometry.box(1.6, 1.5, 1.6, [0.4, 0.42, 0.46]), { position: [x, 0, z] }); geo.merge(Geometry.cylinder(0.15, 0.15, 2.2, 5, [0.6, 0.6, 0.62]), { position: [x + 0.5, 1.5, z] }); glow.merge(Geometry.box(0.5, 0.3, 0.05, [0.3, 1, 0.6]), { position: [x, 0.8, z + 0.82] }); this.colliders.push({ x, z, r: 1.05 }); }
      } else {
        if (R() < 0.6) { const c = crystal(x, z, R.range(1.6, 3), true); if (this.lights.length < 3) this.lights.push({ position: [x, 1.5, z], color: c, radius: 5, intensity: 0.55 }); }
        else rock(x, z, R.range(0.8, 1.2), true);
      }
    }
    // 바닥 잔돌
    for (let i = 0; i < 40; i++) { const x = R.range(-hx, hx), z = R.range(-hz, hz); if (zoneId !== 'factory') rock(x, z, R.range(0.1, 0.2), false); }
    if (zoneId === 'crystal') for (let i = 0; i < 10; i++) glow.merge(Geometry.cone(0.08, 0.35, 4, pick(Z.stone)), { position: [R.range(-hx, hx), 0, R.range(-hz, hz)], rotation: [R.range(-0.5, 0.5), 0, R.range(-0.5, 0.5)] });

    this.addMesh(geo, new Material());
    if (glow.vertexCount) this.addMesh(glow, new Material({ emissive: 0.9, castShadow: false }));
    g.fx.extraLights = this.lights;

    // 보상 오브젝트 (클리어 후 등장)
    this.prize = null;
    this.phase = 'fight';
    this.waves = boss ? [{ boss: true }] : [];
    this.waveT = 1.2;
    // 물량전: 제한 시간 동안 버티며 쓸어버리기
    this.duration = boss ? 0 : (reward === 'elite' ? 60 : 34 + depth * 5);
    this.roomT = 0; this.acc = 0; this.marks = new Set(); this.bossOn = false; this.guardOn = false; this.waitMid = false;
    this.midAt = ['part', 'system', 'supply', 'xp', 'elite'].includes(reward) ? this.planMids() : [];
    if (reward === 'guardian') { this.duration = 0; this.waveT = 1.5; }
    if (reward === 'workshop' || reward === 'start') { this.phase = 'clear'; this.waves = []; }
    if (reward === 'workshop') this.spawnPrize();

    // 플레이어를 입구에 배치
    const [esx, esz] = SIDE[entrySide];
    const p = g.player;
    p.x = esx * (hx - 2); p.z = esz * (hz - 2);
    p.vx = p.vz = p.ex = p.ez = 0;
    p.yaw = p.aimYaw = p.aimGoal = Math.atan2(-esx, -esz);
    p.place();
    g.ui.roomInfo(this);
  }

  // 적 흐름: 초당 예산만큼 무리를 방 가장자리에 소환
  stream(dt, mul) {
    const en = this.game.enemies, d = this.depth, K = en.k;
    if (en.list.length > 400) return;
    this.acc += dt * (3.8 + d * 1.4) * mul * K.dens;
    const R = Math.random;
    while (this.acc > 0) {
      const r = R();
      const pt = this.spawnSpot(9);
      if (!pt) { this.acc = 0; break; }
      if (d >= 3 && r < 0.06) { en.queue('brute', pt[0], pt[1], false, 0); this.acc -= 7; }
      else if (d >= 3 && r < 0.12) { const n = d >= 6 ? 2 : 1; en.pack('spinner', pt[0], pt[1], n, 1.2); this.acc -= n * 3.5; }
      else if (d >= 1 && r < 0.22) { const n = d >= 5 ? 2 : 1; en.pack('tank', pt[0], pt[1], n, 1.4); this.acc -= n * 3; }
      else if (d >= 1 && r < 0.36) { const n = 2 + ((R() * (2 + d * 0.3)) | 0); en.pack('bomber', pt[0], pt[1], n, 1.2); this.acc -= n * 1.2; }
      else if (r < 0.54) { const n = 3 + ((R() * 3) | 0) + (d >> 1); en.pack('drone', pt[0], pt[1], n, 1.4); this.acc -= n; }
      else { const n = 8 + ((R() * 6) | 0) + d * 1.5; en.pack('mite', pt[0], pt[1], n | 0, 2); this.acc -= n * 0.4; }
    }
  }
  surge() {
    const g = this.game, en = g.enemies, p = g.player, d = this.depth;
    g.ui.banner('대규모 접근!', true);
    g.sfx.play('alarm');
    const packs = 10 + Math.min(6, d), n = Math.round((5 + d * 1.1) * Math.min(1.6, en.k.dens));
    for (let i = 0; i < packs; i++) {
      const a = (i / packs) * Math.PI * 2 + Math.random() * 0.3;
      const x = Math.max(-this.hx + 1, Math.min(this.hx - 1, p.x + Math.cos(a) * 9)), z = Math.max(-this.hz + 1, Math.min(this.hz - 1, p.z + Math.sin(a) * 9));
      // 깊은 방: 포위망 사이사이에 포격 기체
      if (d >= 3 && i % 4 === 2) en.pack(d >= 5 && i % 8 === 2 ? 'spinner' : 'tank', x, z, 1, 0.5, i * 0.05);
      else en.pack(d >= 2 && i % 3 === 0 ? 'bomber' : 'mite', x, z, n, 1.4, i * 0.05);
    }
  }
  spawnElite() {
    const en = this.game.enemies, d = this.depth;
    const pt = this.spawnSpot(8);
    if (!pt) return;
    const r = Math.random();
    const type = d >= 4 && r < 0.25 ? 'spinner' : d >= 3 && r < 0.6 ? 'brute' : d >= 1 && r < 0.8 ? 'tank' : 'drone';
    en.queue(type, pt[0], pt[1], true, 0);
  }
  // 중간 보스: 방 중반에 강하. 깊을수록 확률 ↑, 깊은 방은 둘
  planMids() {
    const d = this.depth, r = this.reward, R = rng(this.seed + d * 913);
    const out = [];
    if (r === 'elite') out.push(0.3, 0.65);
    else if (d >= 6) out.push(0.35, 0.7);
    else if (d >= 3) out.push(0.45);
    else if (d >= 1 && R() < 0.6) out.push(0.5);
    if (d >= 4 && r !== 'elite' && R() < 0.35 && out.length < 2) out.push(0.75);
    return out;
  }
  spawnMid() {
    const en = this.game.enemies, p = this.game.player;
    const kinds = this.depth >= 3 ? MIDBOSS_KINDS : ['warden', 'hive', 'mortar'];
    const pool = kinds.filter((k) => !en.mids.some((m) => m.kind === k)), kind = pool[(Math.random() * pool.length) | 0] || kinds[0];
    // 플레이어 반대편 쪽, 적당히 떨어진 곳
    let x = -Math.sign(p.x || 1) * this.hx * 0.45, z = -Math.sign(p.z || 1) * this.hz * 0.45;
    const pt = this.spawnSpot(8);
    if (Math.hypot(x - p.x, z - p.z) < 7 && pt) [x, z] = pt;
    en.spawnMid(kind, x, z);
  }

  spawnPrize() {
    const g = this.game, kind = this.reward;
    const geo = new Geometry(), glowG = new Geometry();
    let col = [1, 0.8, 0.3];
    if (kind === 'workshop') {
      geo.merge(Geometry.box(1.2, 1.4, 0.8, [0.35, 0.37, 0.42]));
      geo.merge(Geometry.box(1.4, 0.15, 1.0, [0.95, 0.75, 0.2]));
      glowG.merge(Geometry.box(0.9, 0.6, 0.05, [0.4, 1, 0.9]), { position: [0, 0.7, 0.42] });
      col = [0.4, 1, 0.9];
    } else if (kind === 'supply') {
      geo.merge(Geometry.box(1.1, 0.8, 0.8, [0.75, 0.5, 0.25]));
      geo.merge(Geometry.box(1.15, 0.12, 0.85, [0.4, 0.3, 0.2]), { position: [0, 0.6, 0] });
      glowG.merge(Geometry.box(0.3, 0.3, 0.05, [0.4, 1, 0.5]), { position: [0, 0.3, 0.42] });
      col = [0.4, 1, 0.5];
    } else if (kind === 'xp') {
      glowG.merge(Geometry.icosphere(0.5, 0, [0.4, 1, 0.5], { squashY: 1.5 }), { position: [0, 1.0, 0] });
      geo.merge(Geometry.cylinder(0.6, 0.7, 0.3, 6, [0.3, 0.3, 0.36]));
      col = [0.4, 1, 0.5];
    } else {
      // 부품 캐시 / 시스템 / 정예 / 보스: 빛나는 컨테이너
      geo.merge(Geometry.box(1.2, 0.9, 0.9, [0.3, 0.32, 0.4]));
      geo.merge(Geometry.box(1.26, 0.1, 0.96, [0.95, 0.75, 0.2]), { position: [0, 0.45, 0] });
      const c = kind === 'system' ? [0.4, 1, 0.5] : [1, 0.8, 0.3];
      glowG.merge(Geometry.box(0.5, 0.5, 0.05, c), { position: [0, 0.2, 0.46] });
      glowG.merge(Geometry.box(0.05, 0.5, 0.5, c), { position: [0.61, 0.2, 0] });
      col = c;
    }
    const m = this.addMesh(geo, new Material());
    const gl = this.addMesh(glowG, new Material({ emissive: 1, castShadow: false }));
    this.prize = { mesh: m, glow: gl, x: 0, z: 0, y: 8, vy: 0, t: 0, col, taken: false };
    this.colliders.push({ x: 0, z: 0, r: 0.75, prize: true });
  }

  openDoors() {
    this.phase = 'exits';
    for (const d of this.doors) d.open = true;
    const g = this.game;
    g.ui.banner('출구 개방! 다음 보상을 고르세요');
    g.sfx.play('door');
    for (const d of this.doors) { g.fx.light([d.x, 1.5, d.z], [0.5, 0.9, 1], 5, 0.9, 0.6); g.fx.ring(d.x, 0.15, d.z, 3, [0.5, 0.9, 1], 0.4); }
  }

  update(dt) {
    const g = this.game, en = g.enemies, p = g.player;
    // 웨이브 진행
    if (this.phase === 'fight') {
      if (this.reward === 'guardian') {
        this.waveT -= dt;
        if (!this.guardOn && this.waveT <= 0) { this.guardOn = true; en.spawnGuardian(this.zone === 'desert' ? 'worm' : 'crane'); }
        if (en.guardian && !en.guardian.dead) this.stream(dt, 0.25);
        if (this.guardOn && en.guardian?.done) {
          this.guardOn = false; en.guardian = null;
          en.detonateAll();
          this.phase = 'reward';
          g.ui.banner('구역 제압!'); g.sfx.play('clear'); g.addChips(3, '수호자 격파');
          this.spawnPrize();
        }
      } else if (this.reward === 'boss') {
        this.waveT -= dt;
        if (this.waves.length && this.waveT <= 0) { this.waves.shift(); en.spawnBoss(0, -2); this.bossOn = true; }
        if (en.boss) this.stream(dt, 0.35);
        if (this.bossOn && !en.boss && !this.waves.length) {
          this.bossOn = false;
          en.detonateAll();
          this.phase = 'reward';
          g.victory(); return;
        }
      } else {
        this.roomT += dt;
        const k = Math.min(1, this.roomT / this.duration), d = this.depth, midOn = en.mids.length > 0;
        this.stream(dt, (0.6 + 0.95 * k) * (midOn ? 0.5 : 1)); // 중간 보스가 있으면 물량은 절반 (탄막에 집중)
        // 대규모 접근: 사방에서 벌레 떼가 원형으로 몰려온다
        for (const m of d >= 4 ? [0.3, 0.58, 0.85] : [0.38, 0.78]) if (k >= m && !this.marks.has(m)) { this.marks.add(m); this.surge(); }
        // 정예 기체 (처치하면 부품 상자)
        const eliteAt = this.reward === 'elite' ? [0.15, 0.35, 0.55, 0.75] : d >= 6 ? [0.2, 0.5, 0.8] : d >= 3 ? [0.3, 0.65] : [0.5];
        for (const m of eliteAt) if (k >= m && !this.marks.has('e' + m)) { this.marks.add('e' + m); this.spawnElite(); }
        for (const m of this.midAt) if (k >= m && !this.marks.has('m' + m)) { this.marks.add('m' + m); this.spawnMid(); }
        // 시간이 끝나도 중간 보스가 남아 있으면 쓰러뜨릴 때까지 계속
        if (k >= 1 && midOn) { if (!this.waitMid) { this.waitMid = true; g.ui.banner('중간 보스를 격파하라!', true); } }
        else if (k >= 1) {
          this.phase = 'reward';
          en.detonateAll();
          g.ui.banner('구역 제압!');
          g.addChips(1);
          g.sfx.play('clear');
          g.fx.addTrauma(0.3);
          this.spawnPrize();
        }
      }
    }
    // 보상 오브젝트: 떨어져서 착지 → 닿으면 획득
    const P = this.prize;
    if (P && !P.taken) {
      P.t += dt;
      if (P.y > 0) { P.vy -= 40 * dt; P.y = Math.max(0, P.y + P.vy * dt); if (P.y === 0) { g.fx.ring(0, 0.15, 0, 2.5, P.col, 0.35); g.fx.dust(0, 0, 6); g.fx.addTrauma(0.15); } }
      const bob = P.y === 0 ? Math.sin(P.t * 3) * 0.05 : 0;
      P.mesh.position = [0, P.y, 0]; P.glow.position = [0, P.y + bob, 0];
      P.glow.material.color = [1, 1, 1].map(() => 0.8 + 0.2 * Math.sin(P.t * 5));
      if (P.y === 0 && Math.hypot(p.x, p.z) < 1.9) { P.taken = true; this.claimPrize(); }
    }
    if (this.phase === 'reward' && P && P.taken && g.state === 'play') this.openDoors();
    if (this.phase === 'clear' && (this.reward === 'start' || (P && P.taken && g.state === 'play'))) this.openDoors();
    // 문 차단막 페이드 (디더링)
    for (const d of [...this.doors, this.entry]) {
      d.fade = Math.min(1, d.fade + (d.open ? dt * 2 : 0));
      d.barrier.visible = d.fade < 1;
      d.barrier.material.opacity = 0.85 * (1 - d.fade);
    }
    // 문 통과
    if (this.phase === 'exits') for (const d of this.doors) {
      const [sx, sz] = SIDE[d.side];
      if ((sx && p.x * sx > this.hx + 0.6) || (sz && p.z * sz > this.hz + 0.6)) { g.nextRoom(d.reward, d.side === 'W' ? 'E' : 'N'); break; }
    }
  }

  claimPrize() {
    const g = this.game, P = this.prize, r = this.reward;
    g.fx.explosion(0, 0.8, 0, 0.6, { color: P.col, ring: true, scorch: false, debris: [0.4, 0.4, 0.45] });
    P.mesh.visible = false; P.glow.visible = false;
    this.colliders = this.colliders.filter((c) => !c.prize);
    if (r === 'supply') { g.player.heal(g.player.stats.maxHp * 0.4); g.addXp(g.xpNeed * 0.4); g.ui.toast('보급: 수리 40% + 경험치'); }
    else if (r === 'xp') { g.addXp(g.xpNeed * 1.05); g.ui.toast('데이터 코어: 경험치 대량 획득'); }
    else if (r === 'part' || r === 'elite') g.offerCards('part', '부품 캐시');
    else if (r === 'guardian') { g.player.heal(g.player.stats.maxHp * 0.5); g.offerCards('part', '수호자 잔해'); }
    else if (r === 'system') g.offerCards('system', '시스템 튜닝');
    else if (r === 'workshop') { g.player.heal(g.player.stats.maxHp * 0.3); g.addChips(2, '정비 기지'); g.openStation(); }
  }

  spawnSpot(minD = 6) {
    const p = this.game.player;
    for (let k = 0; k < 20; k++) {
      const x = (Math.random() * 2 - 1) * (this.hx - 1.8), z = (Math.random() * 2 - 1) * (this.hz - 1.8);
      if (Math.hypot(x - p.x, z - p.z) < minD) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) continue;
      return [x, z];
    }
    return null;
  }

  // 방 경계 + 장애물 충돌. 열린 출구 문 앞에서는 벽 밖으로 나갈 수 있다
  clamp(o, r, isPlayer = false) {
    for (const c of this.colliders) {
      const dx = o.x - c.x, dz = o.z - c.z, rr = r + c.r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4) { o.x = c.x + (dx / d) * rr; o.z = c.z + (dz / d) * rr; }
    }
    const lx = this.hx - 0.3 - r, lz = this.hz - 0.3 - r;
    const open = (side) => isPlayer && this.phase === 'exits' && this.doors.some((d) => d.side === side);
    const inGapZ = Math.abs(o.z) < DOOR_HALF - r * 0.5, inGapX = Math.abs(o.x) < DOOR_HALF - r * 0.5;
    if (o.x < -lx && !(open('W') && inGapZ)) o.x = -lx;
    if (o.x > lx) o.x = lx;
    if (o.z < -lz && !(open('S') && inGapX)) o.z = -lz;
    if (o.z > lz) o.z = lz;
    // 문 통로 안에서는 옆 벽에 막힘
    if (o.x < -lx) o.z = Math.max(-DOOR_HALF + r, Math.min(DOOR_HALF - r, o.z));
    if (o.z < -lz) o.x = Math.max(-DOOR_HALF + r, Math.min(DOOR_HALF - r, o.x));
  }
}
