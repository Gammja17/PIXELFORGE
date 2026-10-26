// 방 탐험: 구역별 방을 하나씩 생성하고,
// 적 웨이브 → 클리어 → 보상 → 출구 문(다음 방 보상 아이콘) 선택 → 다음 방… → 보스 방.
//
//  런마다 6개 구역 중 3개를 골라 순서를 섞는다 (지난 런의 첫 구역은 피하고, 안 나온 구역을 우선).
//  방마다 레이아웃(world.js)과 구역 위험 요소(hazards.js), 가끔 특수 규칙(정전, 수축 방어막)이 붙는다.
//
//  카메라가 -x,-z 쪽(화면 위)을 바라보므로 먼 벽(W: -x, S: -z)은 높게, 가까운 벽(E, N)은 낮게 만든다.
//  입구는 항상 가까운 쪽, 출구는 먼 쪽 → 플레이어는 화면 위로 전진한다 (하데스식).

import { Geometry, Mesh, Material, fbm, rng } from '../engine/index.js';
import { MIDBOSS_KINDS } from './midbosses.js';
import { buildLayout, pickLayout, Flow } from './world.js';
import { RoomHazards } from './hazards.js';

//  floor: 바닥 무늬, edge: 테두리 벽 (rock | box), music: [곡, 재생 속도], guardian: 수호자 종류
//  cover: 부서지는 엄폐물, haz: 위험 요소별 기본 개수 (깊이에 따라 늘어난다)
export const ZONES = {
  desert: {
    name: '사막 폐허', sun: { dir: [0.55, 0.62, 0.35], color: [1, 0.78, 0.62], k: 0.72 }, sky: [0.22, 0.23, 0.38], gnd: [0.17, 0.13, 0.15], fog: [0.09, 0.08, 0.14],
    floor: [[0.62, 0.5, 0.41], [0.56, 0.43, 0.37], [0.5, 0.38, 0.34]], wall: [[0.5, 0.38, 0.34], [0.58, 0.44, 0.37], [0.44, 0.33, 0.32]], stone: [[0.62, 0.58, 0.55], [0.5, 0.47, 0.46]],
    pattern: 'noise', edge: 'rock', music: ['level1', 1], guardian: 'worm', cover: 'sandbag', haz: { mine: 4, barrel: 3 },
  },
  factory: {
    name: '폐공장', sun: { dir: [0.4, 0.75, 0.5], color: [0.85, 0.9, 1], k: 0.62 }, sky: [0.24, 0.27, 0.36], gnd: [0.16, 0.16, 0.18], fog: [0.06, 0.07, 0.1],
    floor: [[0.38, 0.4, 0.44], [0.33, 0.35, 0.39], [0.3, 0.31, 0.35]], wall: [[0.36, 0.38, 0.44], [0.3, 0.32, 0.37]], stone: [[0.2, 0.55, 0.55], [0.85, 0.45, 0.2]],
    pattern: 'checker', edge: 'box', lamp: [1, 0.55, 0.15], music: ['level2', 1], guardian: 'crane', cover: 'crate', haz: { belt: 2, barrel: 3, elec: 1 },
  },
  crystal: {
    name: '수정 협곡', sun: { dir: [0.3, 0.8, 0.5], color: [0.62, 0.72, 1], k: 0.5 }, sky: [0.22, 0.2, 0.42], gnd: [0.12, 0.1, 0.2], fog: [0.05, 0.04, 0.1],
    floor: [[0.3, 0.27, 0.42], [0.26, 0.24, 0.38], [0.22, 0.2, 0.33]], wall: [[0.24, 0.22, 0.34], [0.3, 0.27, 0.4]], stone: [[0.45, 0.95, 1], [1, 0.45, 0.9]],
    pattern: 'noise', edge: 'rock', shards: true, music: ['level3', 1], guardian: 'crane', cover: 'crystal', haz: { pylon: 2.5, mine: 1 },
  },
  foundry: {
    name: '용암 주조소', sun: { dir: [0.5, 0.6, 0.4], color: [1, 0.6, 0.42], k: 0.55 }, sky: [0.3, 0.17, 0.15], gnd: [0.2, 0.1, 0.08], fog: [0.1, 0.04, 0.03],
    floor: [[0.27, 0.22, 0.22], [0.23, 0.19, 0.19], [0.36, 0.2, 0.14]], wall: [[0.2, 0.17, 0.18], [0.26, 0.21, 0.2]], stone: [[1, 0.45, 0.12], [1, 0.7, 0.2]],
    pattern: 'basalt', edge: 'rock', embers: true, music: ['level2', 0.92], guardian: 'crane', cover: 'slag', haz: { lava: 4, belt: 1, barrel: 2 },
  },
  tundra: {
    name: '동토 설원', sun: { dir: [0.35, 0.7, 0.6], color: [0.85, 0.92, 1], k: 0.7 }, sky: [0.32, 0.36, 0.48], gnd: [0.24, 0.26, 0.32], fog: [0.12, 0.14, 0.2],
    floor: [[0.74, 0.78, 0.85], [0.68, 0.72, 0.8], [0.6, 0.65, 0.75]], wall: [[0.45, 0.52, 0.62], [0.55, 0.62, 0.72], [0.38, 0.42, 0.5]], stone: [[0.6, 0.8, 0.95], [0.75, 0.88, 0.98]],
    pattern: 'snow', edge: 'rock', music: ['level3', 0.9], guardian: 'worm', cover: 'iceblock', haz: { ice: 3, cryo: 2, barrel: 1 },
  },
  orbital: {
    name: '궤도 정거장', sun: { dir: [0.2, 0.9, 0.3], color: [0.8, 0.85, 1], k: 0.48 }, sky: [0.2, 0.22, 0.32], gnd: [0.1, 0.11, 0.16], fog: [0.02, 0.02, 0.05],
    floor: [[0.34, 0.36, 0.42], [0.29, 0.31, 0.37], [0.24, 0.26, 0.31]], wall: [[0.38, 0.4, 0.48], [0.32, 0.34, 0.42]], stone: [[0.3, 0.9, 1], [0.9, 0.35, 1]],
    pattern: 'plates', edge: 'box', lamp: [0.3, 0.9, 1], space: true, music: ['level1', 1.1], guardian: 'crane', cover: 'panel', haz: { elec: 2, belt: 1.5, plasma: 3 },
  },
};
// 런 구성: 깊이 9칸 (0 출격, 2·5 수호자, 8 타이탄). 구역은 3칸씩 (newRun 에서 순서를 고른다)
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
// 특수 방: 일반 전투 방(깊이 2부터)에 가끔 붙는다. 버티면 정비 포인트 +1
export const SPECIALS = {
  dark:  { name: '정전 구역', desc: '정전! 기체 조명 밖은 어둠 속이다' },
  storm: { name: '수축 방어막', desc: '방어막 수축! 붉은 고리 밖은 피해를 입는다' },
};

const DOOR_HALF = 2.2;
const SIDE = { W: [-1, 0], S: [0, -1], E: [1, 0], N: [0, 1] }; // 방향 → (x, z) 부호

// 런 구역 순서: 지난 런의 첫 구역은 피하고, 지난 런에 안 나온 구역에 가중치 3
export function pickZones(seed) {
  const R = rng(seed ^ 0x2545f491), ids = Object.keys(ZONES);
  let last = [];
  try { last = JSON.parse(localStorage.getItem('mechaforge.zones') || '[]'); } catch { /* 저장 불가 환경 */ }
  const out = [];
  while (out.length < 3) {
    const pool = ids.filter((z) => !out.includes(z) && !(out.length === 0 && z === last[0]));
    const w = pool.map((z) => (last.includes(z) ? 1 : 3));
    let r = R() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < pool.length - 1 && r > w[i]) r -= w[i++];
    out.push(pool[i]);
  }
  try { localStorage.setItem('mechaforge.zones', JSON.stringify(out)); } catch { /* 무시 */ }
  return out;
}

export class Rooms {
  constructor(game) {
    this.game = game;
    this.meshes = [];
    this.colliders = [];
    this.doors = [];
    this.lights = [];
    this.hx = 12; this.hz = 12;
    this.zones = RUN_ZONES.filter((z, i) => i % 3 === 0);
    this.flow = new Flow();
    this.hazards = new RoomHazards(game, this);
    // 디버그: game.rooms.force = { zone: 'tundra', layout: 'ring', special: 'dark' }
    this.force = {};
    // 문 차단막 / 보상 오브젝트 공용 지오메트리
    const bar = new Geometry();
    for (let i = -2; i <= 2; i++) bar.merge(Geometry.box(0.08, 2.2, 0.08), { position: [0, 0, i * 0.85] });
    bar.merge(Geometry.box(0.06, 0.08, 4.2), { position: [0, 0.7, 0] });
    bar.merge(Geometry.box(0.06, 0.08, 4.2), { position: [0, 1.5, 0] });
    this.barGeo = bar;
  }

  get last() { return RUN_ZONES.length - 1; }
  zoneAt(depth) { return this.zones[Math.min(this.zones.length - 1, Math.floor(Math.max(0, depth) / 3))]; }

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

  newRun() { this.depth = -1; this.path = []; this.seed = (Math.random() * 1e9) | 0; this.zones = pickZones(this.seed); this.lastLayout = null; this.lastSpecial = null; }

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
    this.hazards.clear();
    this.flow.solid = null; this.flow.ready = false;
  }
  addMesh(geo, mat) { const m = this.game.scene.add(new Mesh(geo, mat)); this.meshes.push(m); return m; }

  // ---- 방 만들기 ----
  enter(reward, entrySide = 'E') {
    const g = this.game, sc = g.scene;
    this.clear();
    this.depth++;
    const depth = this.depth;
    const zoneId = this.force.zone || this.zoneAt(depth);
    const Z = ZONES[zoneId];
    this.zone = zoneId; this.reward = reward;
    const R = rng(this.seed + depth * 131 + 7);
    const boss = reward === 'boss';
    const big = boss || reward === 'guardian';
    const combat = ['part', 'system', 'supply', 'xp', 'elite'].includes(reward);
    this.hx = big ? 16 : R.range(15, 18); this.hz = big ? 16 : R.range(15, 18);
    if (reward === 'workshop' || reward === 'start') { this.hx = 9; this.hz = 9; }
    const hx = this.hx, hz = this.hz;
    // 특수 방 (연속으로는 안 나온다). 수축 방어막은 막힌 구조물이 없는 방에서만
    let special = this.force.special ?? null; // force.special: undefined = 무작위, null = 없음
    if (this.force.special === undefined && combat && depth >= 2 && !this.lastSpecial && R() < 0.3) special = R() < 0.5 ? 'dark' : 'storm';
    this.special = special; this.lastSpecial = special;
    let layout = this.force.layout || pickLayout(R, reward, this.lastLayout);
    if (special === 'storm' && !['open', 'pillars'].includes(layout)) layout = R() < 0.5 ? 'open' : 'pillars';
    this.layout = this.lastLayout = layout;
    this.path.push({ reward, zone: zoneId, layout, special });

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
    const floor = Geometry.grid(S, S, 48, 48, () => 0, (c) => this.floorColor(Z, c, depth, S / 48));
    this.addMesh(floor, new Material());

    const geo = new Geometry(), glow = new Geometry();
    const pick = (a) => a[(R() * a.length) | 0];
    const rock = (x, z, r, col) => geo.merge(Geometry.icosphere(r, 0, col || pick(Z.wall), { jitter: 0.3, seed: (R() * 1e6) | 0, squashY: 0.8 }), { position: [x, r * 0.3, z], rotation: [0, R() * 6, 0] });
    const doorAt = (side) => [...this.doors, this.entry].find((d) => d.side === side);

    // 테두리 벽: 문 자리를 비우고 한 줄로 채운다. far = 높게, near = 낮게
    const wallLine = (side) => {
      const [sx, sz] = SIDE[side], far = side === 'W' || side === 'S', len = sx ? hz : hx, door = doorAt(side);
      for (let t = -len - 1.5; t <= len + 1.5; t += far ? 1.6 : 2.2) {
        if (door && Math.abs(t) < DOOR_HALF + 0.6) continue;
        const x = sx ? sx * (hx + 0.8) : t, z = sz ? sz * (hz + 0.8) : t;
        if (Z.edge === 'box') {
          const h = far ? R.range(2.4, 3.2) : R.range(0.5, 0.8);
          geo.merge(Geometry.box(sx ? 1 : 1.7, h, sx ? 1.7 : 1, pick(Z.wall)), { position: [x, 0, z] });
          if (far && R() < 0.3) glow.merge(Geometry.box(0.25, 0.18, 0.25, Z.lamp), { position: [x - sx * 0.55, h - 0.5, z - sz * 0.55] });
          if (far && R() < 0.4) geo.merge(Geometry.cylinder(0.12, 0.12, h + 0.6, 5, [0.25, 0.27, 0.3]), { position: [x - sx * 0.6, 0, z - sz * 0.6] });
          if (Z.space && far && R() < 0.25) glow.merge(Geometry.box(sx ? 0.06 : 1.2, 0.5, sx ? 1.2 : 0.06, [0.5, 0.7, 1]), { position: [x - sx * 0.52, h * 0.55, z - sz * 0.52] }); // 창문 너머 별빛
        } else {
          rock(x, z, far ? R.range(1.2, 1.9) : R.range(0.5, 0.8));
          if (far && Z.shards && R() < 0.35) for (let k = 0; k < 3; k++) glow.merge(Geometry.cone(0.18 + R() * 0.15, R.range(1.2, 2.4) * (0.6 + R() * 0.5), 5, pick(Z.stone)), { position: [x - sx * 0.8 + R.range(-0.3, 0.3), 0, z - sz * 0.8 + R.range(-0.3, 0.3)], rotation: [R.range(-0.4, 0.4), R() * 6, R.range(-0.4, 0.4)] });
          if (far && Z.embers && R() < 0.3) glow.merge(Geometry.box(0.9, 0.06, 0.12, pick(Z.stone)), { position: [x - sx * 0.9, R.range(0.3, 1.2), z - sz * 0.9], rotation: [0, sx ? Math.PI / 2 : 0, R.range(-0.5, 0.5)] });
          if (far && zoneId === 'tundra') geo.merge(Geometry.icosphere(R.range(0.8, 1.2), 0, [0.9, 0.93, 0.97], { squashY: 0.4, seed: (R() * 1e6) | 0 }), { position: [x, R.range(1.2, 1.6), z] });
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

    // 내부: 레이아웃(벽, 기둥, 엄폐물, 소품) → 구역 위험 요소
    const H = this.hazards;
    const ctx = { R, hx, hz, zone: zoneId, Z, depth, reward, geo, glow, colliders: this.colliders, lights: this.lights, nProps: reward === 'workshop' ? 2 : boss ? 4 : undefined, cover: (x, z) => H.addProp(Z.cover, x, z) };
    H.begin(ctx);
    buildLayout(layout, ctx);
    H.populate(ctx);
    // 바닥 잔돌
    for (let i = 0; i < 40; i++) { const x = R.range(-hx, hx), z = R.range(-hz, hz); if (Z.edge === 'rock') rock(x, z, R.range(0.1, 0.2), zoneId === 'tundra' ? [0.86, 0.9, 0.95] : null); }
    if (Z.shards) for (let i = 0; i < 10; i++) glow.merge(Geometry.cone(0.08, 0.35, 4, pick(Z.stone)), { position: [R.range(-hx, hx), 0, R.range(-hz, hz)], rotation: [R.range(-0.5, 0.5), 0, R.range(-0.5, 0.5)] });
    if (Z.embers) for (let i = 0; i < 14; i++) glow.merge(Geometry.box(R.range(0.2, 0.5), 0.03, 0.08, pick(Z.stone)), { position: [R.range(-hx, hx), 0.01, R.range(-hz, hz)], rotation: [0, R() * 3, 0] });

    this.addMesh(geo, new Material());
    if (glow.vertexCount) this.addMesh(glow, new Material({ emissive: 0.9, castShadow: false }));
    g.fx.extraLights = this.lights;
    this.flow.build(hx, hz, this.colliders);
    if (special) H.setupSpecial(special);

    // 보상 오브젝트 (클리어 후 등장)
    this.prize = null;
    this.phase = 'fight';
    this.waves = boss ? [{ boss: true }] : [];
    this.waveT = 1.2;
    // 물량전: 제한 시간 동안 버티며 쓸어버리기
    this.duration = boss ? 0 : (reward === 'elite' ? 60 : 34 + depth * 5);
    this.roomT = 0; this.acc = 0; this.marks = new Set(); this.bossOn = false; this.guardOn = false; this.waitMid = false; this.told = false;
    this.midAt = combat ? this.planMids() : [];
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

  // 바닥 색 (구역 무늬). 방 밖은 어둡게
  floorColor(Z, c, depth, cs) {
    // 무늬 바닥은 칸(삼각형 둘) 단위로 칠해서 삼각형 얼룩이 생기지 않게
    const snap = (v) => (Z.pattern === 'plates' || Z.pattern === 'checker' ? (Math.floor(v / cs + 24) - 23.5) * cs : v);
    const hx = this.hx, hz = this.hz, x = snap(c[0]), z = snap(c[2]);
    const inside = Math.abs(x) < hx && Math.abs(z) < hz, border = inside && (Math.abs(x) > hx - 1.2 || Math.abs(z) > hz - 1.2);
    const n = fbm(x * 0.09 + depth * 3.1, z * 0.09, 3);
    const tone = (n > 0.56 ? Z.floor[2] : n > 0.44 ? Z.floor[1] : Z.floor[0]).slice();
    let col = tone;
    if (Z.pattern === 'checker') {
      col = Z.floor[(((Math.floor(x / cs + 24) >> 1) + (Math.floor(z / cs + 24) >> 1)) & 1) ? 0 : 1].slice();
      if (border) col = (Math.floor((x + z) * 0.7) & 1) ? [0.85, 0.7, 0.2] : [0.18, 0.18, 0.2];
    } else if (Z.pattern === 'plates') {
      // 2×2 칸 철판, 판마다 톤이 조금씩 다르고 한 귀퉁이는 어두운 볼트 자리
      const ci = Math.floor(x / cs + 24), cj = Math.floor(z / cs + 24);
      col = (ci & 1) && (cj & 1) ? [0.2, 0.21, 0.26] : Z.floor[((ci >> 1) * 7 + (cj >> 1) * 3) % 3].slice();
      if (border) col = (Math.floor((x + z) * 0.6) & 1) ? [0.25, 0.6, 0.7] : [0.16, 0.17, 0.22];
    } else if (Z.pattern === 'basalt') {
      const m = fbm(x * 0.23 + 5, z * 0.23 - depth, 2);
      col = m > 0.62 ? Z.floor[2].slice() : n > 0.5 ? Z.floor[1].slice() : Z.floor[0].slice(); // 붉게 달군 바위 줄기
    } else if (Z.pattern === 'snow') {
      const m = fbm(x * 0.05 - 2, z * 0.05 + depth, 2);
      col = m > 0.6 ? [0.84, 0.87, 0.92] : tone; // 눈 더미
    }
    if (!inside) {
      if (Z.space) return fbm(x * 1.7, z * 1.7, 1) > 0.84 ? [0.3, 0.32, 0.45] : [0.02, 0.02, 0.05]; // 정거장 밖 = 우주
      col = col.map((v) => v * 0.42);
    }
    return col;
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
    // 지형: 위험 요소, 소품, 적 길찾기
    this.hazards.update(dt);
    this.flow.update(dt, p.x, p.z);
    if (this.special && !this.told && this.phase === 'fight') { this.told = true; g.ui.toast(SPECIALS[this.special].desc); }
    // 웨이브 진행
    if (this.phase === 'fight') {
      if (this.reward === 'guardian') {
        this.waveT -= dt;
        if (!this.guardOn && this.waveT <= 0) { this.guardOn = true; en.spawnGuardian(ZONES[this.zone].guardian); }
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
          if (this.special) g.addChips(1, `${SPECIALS[this.special].name} 돌파`);
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
      if (this.hazards.outside(x, z, 1.5)) continue;
      if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.8)) continue;
      return [x, z];
    }
    return null;
  }

  // 방 경계 + 장애물 충돌. 열린 출구 문 앞에서는 벽 밖으로 나갈 수 있다
  //  적은 장애물에 밀리면 흐름장 방향으로 벽을 따라 미끄러져서 틈으로 돌아 나온다
  clamp(o, r, isPlayer = false) {
    let px = 0, pz = 0;
    for (const c of this.colliders) {
      const dx = o.x - c.x, dz = o.z - c.z, rr = r + c.r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-4) { const k = (rr - d) / d; o.x += dx * k; o.z += dz * k; px += dx * k; pz += dz * k; }
    }
    if (!isPlayer && (px || pz)) {
      const f = this.flow.dir(o.x, o.z);
      if (f) {
        const pl = Math.hypot(px, pz), nx = px / pl, nz = pz / pl, dot = f[0] * nx + f[1] * nz, s = Math.min(pl, 0.3);
        if (dot > 0) { o.x += f[0] * s; o.z += f[1] * s; } // 길이 벽 반대쪽: 그쪽으로 빠져나간다
        else {
          const tx = f[0] - dot * nx, tz = f[1] - dot * nz, tl = Math.hypot(tx, tz);
          if (tl > 0.15) { o.x += (tx / tl) * s; o.z += (tz / tl) * s; }
        }
      }
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
