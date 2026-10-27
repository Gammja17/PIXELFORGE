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
import { pickGuardian } from './guardians.js';
import { OPS, pickOp } from './ops.js';
import { BESTIARY } from './bestiary.js';
import { FINAL_BOSSES } from './enemies.js';

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
  cargo:    { name: '황금 수송선', icon: 'cargo', desc: '경험치 + 정비 포인트' },
  guardian: { name: '구역 수호자', icon: 'boss', desc: '중간 보스 + 부품' },
  workshop: { name: '정비 드론 기지', icon: 'workshop', desc: '부품 강화, 분해, 수리' },
  boss:     { name: '타이탄', icon: 'boss', desc: '최종 보스' },
  start:    { name: '출격', icon: 'part', desc: '' },
};
// 특수 방: 일반 전투 방(깊이 2부터)에 가끔 붙는다. 버티면 정비 포인트 +1
export const SPECIALS = {
  dark:  { name: '정전 구역', desc: '정전! 기체 조명 밖은 어둠 속이다' },
  storm: { name: '수축 방어막', desc: '방어막 수축! 붉은 고리 밖은 피해를 입는다' },
  sandstorm: { name: '모래 폭풍', desc: '모래 폭풍! 돌풍이 나도 적도 한쪽으로 날린다. 벽 쪽으로 몰아넣어라' },
  press:     { name: '압착 라인', desc: '압착기 가동! 노란 표식에 내리꽂힌다. 적을 표식 위로 끌어들여라' },
  resonance: { name: '공명 수정', desc: '공명 수정! 적을 잡을수록 공명이 차고, 가득 차면 번개가 쏟아진다' },
  eruption:  { name: '분화 구역', desc: '분화! 붉은 표식에 용암 덩어리가 떨어진다' },
  blizzard:  { name: '눈보라', desc: '눈보라! 시야가 흐리다. 한파가 몰아치면 적이 잠깐 얼어붙는다' },
  lowgrav:   { name: '저중력 구역', desc: '저중력! 맞은 적이 훨씬 멀리 날아간다' },
};
// 구역마다 고유 기믹 방 (그 구역에서만 나온다)
export const ZONE_GIMMICK = {
  desert: { id: 'sandstorm', name: '모래 폭풍' }, factory: { id: 'press', name: '압착 라인' }, crystal: { id: 'resonance', name: '공명 수정' },
  foundry: { id: 'eruption', name: '분화 구역' }, tundra: { id: 'blizzard', name: '눈보라' }, orbital: { id: 'lowgrav', name: '저중력' },
};

// ---- 난이도 곡선 ----
//  초반은 무쌍(적고 약하고, 빨리 크는 만큼 적이 따라 크지 않는다) → 깊이 3부터 새 위협을 하나씩 → 6부터 전부, 탄막 최대치.
//  깊이 0 = 출격 방(전투 없음), 2·5 = 수호자, 8 = 타이탄. 위협 등급/파일럿(runhooks.js)은 이 결과 위에 곱한다.
//  pw = 전력 지수 power() (시작 1, 방 1 끝 ~2, 깊이 4 ~4-6, 타이탄 ~8-14). pw' = pw - 1
//
//  깊이 | 물량 dens       | 피해 dmg        | 체력 hp      | 중간 보스 / 보스 탄 | 새로 나오는 적 / 규칙
//   1   | 0.70 + 0.03·pw' | 0.55            | 1.0 · pw^.30 | 없음                | 벌레, 정찰 드론, 자폭 드론(1~2기씩). 정예 1기(특성 없음). 경험치 ×1.5, 위험 요소 적게
//   2   | 수호자 + 벌레   | 0.60            | 1.3 · pw^.35 | 수호자 탄 45%       | 첫 수호자: 체력 ×0.6. 경험치 ×1.3
//   3   | 0.95 + 0.07·pw' | 1.00 + 0.01·pw' | 1.6 · pw^.45 | 1 (탄 75%)          | 첫 중간 보스(나선/하이브/박격), 경전차(단발), 돌격, 분열. 정예 특성 1개. 경험치 ×1.4
//   4   | 1.05 + 0.09·pw' | 1.10 + 0.02·pw' | 2.0 · pw^.55 | 1 (+35% 둘째, 90%)  | 방패, 저격, 중장 메카, 회전 포대, 총 든 드론, 중간 보스 6종 전부. 특수 방. 경험치 ×1.35
//   5   | 수호자 + 물량   | 1.10 + 0.03·pw' | 2.4 · pw^.62 | 수호자 탄 60%       | 두 번째 수호자: 체력 ×0.75. 경험치 ×1.15
//   6   | 1.30 + 0.13·pw' | 1.50 + 0.04·pw' | 2.9 · pw^.70 | 2                   | 암살, 지뢰 부설, 수리 드론. 정예 특성 2개, 포격 부채꼴 최대, 대규모 접근 3회. 경험치 ×1.1
//   7   | 1.50 + 0.15·pw' | 1.70 + 0.05·pw' | 3.4 · pw^.76 | 2 (+35% 셋째)       | 전부, 위험 요소 최대
//   8   | 타이탄 + 물량   | 2.00 + 0.05·pw' | 타이탄 공식  | -                   | 타이탄 → MK-II (가장 높은 벽)
//  물량 상한 2.4. 떼거리 체력 = swarm · pw^(e/2). 중간 보스 체력 = 1500 · mid[0] · pw^mid[1].
//  bul = 수호자/중간 보스 탄을 고르게 솎아 내고 남기는 비율 (틈이 넓어진다, enemies.shoot)
export const CURVE = [
  //      dens  dPw   dmg   mPw   hp   hpE   swarm mid         haz   troop xp    guard bul
  /* 0 */ [0.7, 0.03, 0.55, 0, 1.0, 0.3, 1.0, [1.2, 0.4], 0, 0, 1.5, 1, 1],
  /* 1 */ [0.7, 0.03, 0.55, 0, 1.0, 0.3, 1.0, [1.2, 0.4], 0.35, 0.1, 1.5, 1, 1],
  /* 2 */ [0.8, 0.04, 0.6, 0, 1.3, 0.35, 1.25, [1.5, 0.4], 0.3, 0.12, 1.3, 0.6, 0.45],
  /* 3 */ [0.95, 0.07, 1.0, 0.01, 1.6, 0.45, 1.5, [1.8, 0.45], 0.65, 0.16, 1.4, 1, 0.75],
  /* 4 */ [1.05, 0.09, 1.1, 0.02, 2.0, 0.55, 1.8, [2.5, 0.55], 0.85, 0.2, 1.35, 1, 0.9],
  /* 5 */ [1.2, 0.11, 1.1, 0.03, 2.4, 0.62, 2.1, [3.0, 0.6], 0.6, 0.2, 1.15, 0.75, 0.6],
  /* 6 */ [1.3, 0.13, 1.5, 0.04, 2.9, 0.7, 2.4, [3.6, 0.65], 1.05, 0.25, 1.1, 1, 1],
  /* 7 */ [1.5, 0.15, 1.7, 0.05, 3.4, 0.76, 2.7, [4.1, 0.7], 1.2, 0.3, 1, 1, 1],
  /* 8 */ [1.6, 0.15, 2.0, 0.05, 3.8, 0.8, 3.0, [4.5, 0.7], 0.6, 0.3, 1, 1, 1],
].map(([dens, densPw, dmg, dmgPw, hp, hpExp, swarm, mid, haz, troop, xp, guard, bul]) => ({ dens, densPw, dmg, dmgPw, hp, hpExp, swarm, mid, haz, troop, xp, guard, bul }));
export const curveAt = (depth) => CURVE[Math.max(0, Math.min(CURVE.length - 1, depth | 0))];

// 처음 나오는 깊이 (스폰 조건). 위 표의 '새로 나오는 적' 칸과 같다
// 역할 있는 적은 초반부터 하나씩 섞어서 컨셉을 보여준다 (처음 만나면 소개 카드)
export const FIRST = { tank: 1, charger: 1, splitter: 2, shield: 2, leech: 2, sniper: 3, brute: 3, spinner: 3, grappler: 3, gunDrone: 4, assassin: 4, miner: 3, medic: 4, amp: 4 };

// 역할 기체 스폰 표: [종류, 물량 비용, 마리 수, 이 깊이부터 +1]. 등장 깊이는 FIRST
const TROOPS = [
  ['charger', 3, 1, 6], ['splitter', 2.5, 2, 6], ['shield', 3, 1, 6], ['sniper', 3.5, 1, 7],
  ['miner', 3, 1, 9], ['assassin', 3.5, 1, 7], ['medic', 4, 1, 9],
  ['grappler', 3.5, 1, 7], ['leech', 1.2, 3, 6], ['amp', 4.5, 1, 99],
];
// 구역 세력: 구역마다 자주 나오는 역할 적 (같은 적 구성이 반복되지 않고 구역마다 성격이 다르게)
export const FACTIONS = {
  desert:  { name: '고철 약탈단', troops: ['splitter', 'miner', 'grappler'] },
  factory: { name: '공장 경비대', troops: ['shield', 'amp', 'charger'] },
  crystal: { name: '수정 공명체', troops: ['sniper', 'assassin', 'leech'] },
  foundry: { name: '주조소 중장대', troops: ['charger', 'shield', 'grappler'] },
  tundra:  { name: '설원 저격대', troops: ['sniper', 'medic', 'leech'] },
  orbital: { name: '궤도 방위군', troops: ['assassin', 'amp', 'leech'] },
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
  // 깊이 × 전력 → 적 체력/피해/물량 배율 (위 CURVE 표). 전력 보정은 초반엔 거의 없고 깊을수록 세진다
  //  (떼거리는 덜 단단해지고 더 많아진다). xp: 적 경험치 배율 (초반 빠른 성장)
  scale() {
    const d = Math.max(0, this.depth), pw = this.power(), C = curveAt(d), p1 = pw - 1;
    return {
      pw,
      hp: C.hp * Math.pow(pw, C.hpExp),
      swarmHp: C.swarm * Math.pow(pw, C.hpExp * 0.5),
      dmg: C.dmg + p1 * C.dmgPw,
      dens: Math.min(2.4, C.dens + p1 * C.densPw),
      xp: C.xp, bul: C.bul,
    };
  }
  // 중간 보스 체력 배율 (midbosses.js), 수호자 체력 배율 (guardians.js)
  midHp(pw) { const [b, e] = curveAt(this.depth).mid; return b * Math.pow(pw, e); }
  guardHp() { return curveAt(this.depth).guard; }

  newRun() {
    this.depth = -1; this.path = []; this.seed = (Math.random() * 1e9) | 0; this.zones = pickZones(this.seed); this.lastLayout = null; this.lastSpecial = null;
    // 최종 보스: 첫 출격은 타이탄, 그다음부터 지난번과 다른 보스 (enemies.js FINAL_BOSSES)
    let last = null; try { last = localStorage.getItem('mechaforge.boss'); } catch { /* 무시 */ }
    const runs = this.game.meta?.data?.life?.runs || 0, ids = Object.keys(FINAL_BOSSES).filter((k) => k !== last);
    this.bossKind = runs < 1 ? 'titan' : ids[(Math.random() * ids.length) | 0];
    try { localStorage.setItem('mechaforge.boss', this.bossKind); } catch { /* 무시 */ }
  }

  // 다음 방 후보 (문 2개까지)
  rollExits(depth) {
    const R = rng(this.seed + depth * 77);
    if (depth + 1 >= this.last) return ['boss'];
    if (depth + 1 === 2 || depth + 1 === 5) return ['guardian'];
    const pool = ['part', 'part', 'system', 'supply', 'xp', 'elite'];
    if (depth >= 1) pool.push('workshop', 'cargo');
    if (depth <= 1) pool.splice(pool.indexOf('elite'), 1);
    const n = depth === 0 || (depth + 1) % 3 === 0 ? 2 : R() < 0.75 ? 2 : 1; // 구역 경계에서는 갈림길 2개
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
  enter(reward, entrySide = 'E', op = null, zone = null) {
    const g = this.game, sc = g.scene;
    this.clear();
    this.depth++;
    const depth = this.depth;
    if (zone && ZONES[zone]) this.zones[Math.floor(depth / 3)] = zone; // 갈림길에서 고른 다음 구역
    const zoneId = this.force.zone || this.zoneAt(depth);
    const Z = ZONES[zoneId];
    this.zone = zoneId; this.reward = reward;
    const R = rng(this.seed + depth * 131 + 7);
    const boss = reward === 'boss';
    const big = boss || reward === 'guardian';
    const combat = ['part', 'system', 'supply', 'xp', 'elite', 'cargo'].includes(reward);
    // 작전 (ops.js): 문에서 정해 온 것, 없으면 여기서 고른다
    this.op = combat ? (this.force.op || op || pickOp(reward, depth, R, [this.lastOp])) : null;
    this.lastOp = this.op;
    this.hx = big ? 16 : R.range(15, 18); this.hz = big ? 16 : R.range(15, 18);
    if (reward === 'workshop' || reward === 'start') { this.hx = 9; this.hz = 9; }
    const hx = this.hx, hz = this.hz;
    // 특수 방 (연속으로는 안 나온다). 수축 방어막은 막힌 구조물이 없는 방에서만
    let special = this.force.special ?? null; // force.special: undefined = 무작위, null = 없음
    if (this.force.special === undefined && this.op === 'survive' && depth >= 4 && !this.lastSpecial && R() < 0.45) special = R() < 0.5 ? 'dark' : 'storm';
    // 구역 기믹: 전투 방이면 구역마다 한 번은 꼭 (구역 둘째 방), 그 밖에도 가끔
    else if (this.force.special === undefined && combat && depth >= 1 && !this.lastSpecial && ZONE_GIMMICK[zoneId] && this.op !== 'duel' && (depth >= 3 && depth % 3 === 1 || R() < 0.25)) special = ZONE_GIMMICK[zoneId].id;
    this.special = special; this.lastSpecial = special;
    let layout = this.force.layout || pickLayout(R, reward, this.lastLayout);
    if (special === 'storm' && !['open', 'pillars'].includes(layout)) layout = R() < 0.5 ? 'open' : 'pillars';
    this.layout = this.lastLayout = layout;
    this.path.push({ reward, zone: zoneId, layout, special, op: this.op });

    // 조명
    sc.sun.direction = Z.sun.dir; sc.sun.color = Z.sun.color; sc.sun.intensity = Z.sun.k;
    sc.ambientSky = Z.sky; sc.ambientGround = Z.gnd; sc.skyColor = sc.fog.color = Z.fog;
    this.lights = [];

    // 출구 문 (먼 벽: W, S), 입구 문 (가까운 벽)
    const exits = this.rollExits(depth);
    const farSides = exits.length === 1 ? [R() < 0.5 ? 'W' : 'S'] : ['W', 'S'];
    const taken = [this.op];
    this.doors = exits.map((rw, i) => { const o = pickOp(rw, depth + 1, R, taken); taken.push(o); return { side: farSides[i], reward: rw, op: o, open: false, fade: 0 }; });
    // 구역 경계: 문마다 다른 구역으로 이어진다 (경로 분기). 정해 둔 다음 구역 + 아직 안 간 구역 하나
    if ((depth + 1) % 3 === 0 && depth + 1 < this.last && this.doors.length >= 2) {
      const idx = (depth + 1) / 3, used = this.zones.slice(0, idx);
      const plan = this.zones[idx] && !used.includes(this.zones[idx]) ? this.zones[idx] : null;
      const pool = Object.keys(ZONES).filter((z) => !used.includes(z) && z !== plan);
      const a = plan || R.pick(pool), rest = pool.filter((z) => z !== a), cand = [a, rest.length ? R.pick(rest) : a];
      if (R() < 0.5) cand.reverse();
      this.doors.forEach((d, i) => { d.zone = cand[i % 2]; });
    }
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
    const ctx = { R, hx, hz, zone: zoneId, Z, depth, reward, geo, glow, colliders: this.colliders, lights: this.lights, nProps: reward === 'workshop' ? 2 : boss ? 4 : undefined, hazMul: curveAt(depth).haz, cover: (x, z) => H.addProp(Z.cover, x, z) };
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
    this.duration = boss ? 0 : 34 + depth * 5;
    this.roomT = 0; this.acc = 0; this.marks = new Set(); this.bossOn = false; this.guardOn = false; this.waitMid = false; this.told = false;
    this.midAt = [];
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
    // 작전 시작 (플레이어 위치가 정해진 뒤: 비콘, 거점은 플레이어에게서 떨어진 곳에)
    this.k0 = g.stats.kills;
    this.dmg0 = { ...(g.stats.byWeapon || {}) };
    if (this.op) { OPS[this.op].begin(this); setTimeout(() => g.ui.banner(OPS[this.op]?.banner || ''), 700); }
    // 새 구역에 들어서면 그 구역 세력 알림
    if (zoneId !== this.lastZone && FACTIONS[zoneId] && depth > 0) { const F = FACTIONS[zoneId]; setTimeout(() => g.ui.toast(`이 구역 세력: ${F.name} (${F.troops.map((t) => BESTIARY[t]?.role).join(', ')})`), 2200); }
    this.lastZone = zoneId;
    g.ui.roomInfo(this);
  }
  // 이번 방에서 어떤 무기가 일했는지 (상위 3개 비중)
  dmgReport() {
    const g = this.game, B = g.stats.byWeapon || {}, d = Object.entries(B).map(([k, v]) => [k, v - (this.dmg0?.[k] || 0)]).filter(([k, v]) => v > 0 && k !== 'other');
    const tot = d.reduce((a, [, v]) => a + v, 0);
    if (!tot) return;
    const top = d.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${g.srcName ? g.srcName(k) : k} ${Math.round((v / tot) * 100)}%`);
    setTimeout(() => g.ui.toast(`이번 방 피해  ${top.join('   ')}`), 900);
  }
  glowMat(opacity = 1) { return new Material({ emissive: 1, outline: false, castShadow: false, opacity }); }
  // 작전 진행도 [0~1, 문구], 화면 표지
  opInfo() { return this.op && this.phase === 'fight' ? OPS[this.op].info(this) : null; }
  pins() { return this.op && this.phase === 'fight' && OPS[this.op].pins ? OPS[this.op].pins(this) : []; }

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
  stream(dt, mul, swarmOnly = false) {
    const en = this.game.enemies, d = this.depth, K = en.k;
    if (en.list.length > 400) return;
    this.acc += dt * (3.8 + d * 1.4) * mul * K.dens;
    const R = Math.random;
    while (this.acc > 0) {
      const r = R();
      const pt = this.spawnSpot(9);
      if (!pt) { this.acc = 0; break; }
      // 역할 기체 (troops.js): 깊이 3부터, 깊을수록 비중 ↑ (CURVE troop: 10% → 30%)
      const pool = TROOPS.filter((q) => d >= FIRST[q[0]]);
      if (swarmOnly) {
        if (r < 0.2) { const n = 2 + ((R() * 3) | 0) + (d >> 1); en.pack('bomber', pt[0], pt[1], n, 1.2); this.acc -= n * 1.2; }
        else if (r < 0.4) { const n = 4 + ((R() * 3) | 0) + (d >> 1); en.pack('drone', pt[0], pt[1], n, 1.4); this.acc -= n; }
        else { const n = 12 + ((R() * 8) | 0) + d * 2; en.pack('mite', pt[0], pt[1], n | 0, 2.2); this.acc -= n * 0.4; }
        continue;
      }
      if (pool.length && R() < curveAt(d).troop) {
        // 70% 는 이 구역 세력의 적 중에서 (나온 깊이가 된 것만)
        const fac = FACTIONS[this.zone]?.troops, fpool = fac ? pool.filter((t) => fac.includes(t[0])) : [];
        const src = fpool.length && R() < 0.7 ? fpool : pool;
        const q = src[(R() * src.length) | 0], n = q[2] + (d >= q[3] ? 1 : 0);
        en.pack(q[0], pt[0], pt[1], n, 1.2); this.acc -= n * q[1];
        continue;
      }
      // 아직 안 나오는 종류의 몫은 벌레 떼로
      const slot = r < 0.06 ? 'brute' : r < 0.12 ? 'spinner' : r < 0.22 ? 'tank' : null;
      if (slot && d < FIRST[slot]) { const n = 8 + ((R() * 6) | 0) + d * 1.5; en.pack('mite', pt[0], pt[1], n | 0, 2); this.acc -= n * 0.4; }
      else if (slot === 'brute') { en.queue('brute', pt[0], pt[1], false, 0); this.acc -= 7; }
      else if (slot === 'spinner') { const n = d >= 6 ? 2 : 1; en.pack('spinner', pt[0], pt[1], n, 1.2); this.acc -= n * 3.5; }
      else if (slot === 'tank') { const n = d >= 5 ? 2 : 1; en.pack('tank', pt[0], pt[1], n, 1.4); this.acc -= n * 3; }
      else if (r < 0.32) { const n = d <= 2 ? 1 + ((R() * 2) | 0) : 2 + ((R() * (2 + d * 0.3)) | 0); en.pack('bomber', pt[0], pt[1], n, 1.2); this.acc -= n * 1.2; } // 초반 자폭 드론은 1~2기씩
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
      else if (d >= 4 && i % 4 === 0) en.pack('shield', x, z, 1, 0.5, i * 0.05); // 방패 기체가 포위망 앞을 막는다
      else en.pack(d >= 3 && i % 3 === 0 ? 'bomber' : 'mite', x, z, n, 1.4, i * 0.05); // 초반 포위망은 벌레만 (쓸어 담는 맛)
    }
  }
  // 한 지점을 둘러싸고 몰려오는 무리 (거점 장악)
  surgeAt(cx, cz, rad) {
    const g = this.game, en = g.enemies, d = this.depth, packs = 6 + Math.min(4, d);
    g.sfx.play('alarm');
    for (let i = 0; i < packs; i++) {
      const a = (i / packs) * Math.PI * 2 + Math.random() * 0.4;
      const x = Math.max(-this.hx + 1, Math.min(this.hx - 1, cx + Math.cos(a) * rad)), z = Math.max(-this.hz + 1, Math.min(this.hz - 1, cz + Math.sin(a) * rad));
      if (d >= 3 && i % 3 === 1) en.pack('tank', x, z, 1, 0.5, i * 0.05);
      else en.pack(i % 2 ? 'drone' : 'mite', x, z, i % 2 ? 3 + (d >> 1) : 6 + d, 1.4, i * 0.05);
    }
  }
  spawnElite() {
    const en = this.game.enemies, d = this.depth;
    const pt = this.spawnSpot(8);
    if (!pt) return;
    const r = Math.random();
    // 이미 나온 종류 중에서 고른다. 방 1 은 정찰 드론 정예뿐 (특성 없음)
    const troop = ['charger', 'shield', 'splitter', 'sniper', 'assassin'].filter((t) => d >= FIRST[t]);
    const type = troop.length && Math.random() < 0.3 ? troop[(Math.random() * troop.length) | 0]
      : d >= FIRST.spinner && r < 0.25 ? 'spinner' : d >= FIRST.brute && r < 0.6 ? 'brute' : d >= FIRST.tank && r < 0.8 ? 'tank' : 'drone';
    en.queue(type, pt[0], pt[1], true, 0);
  }
  // 중간 보스: 방 1 은 없음. 깊이 3 에 첫 중간 보스, 4 는 35% 로 둘, 6 부터 둘, 7 은 35% 로 셋.
  //  정예 방은 하나 더 (최대 둘, 깊이 3 은 하나)
  planMids() {
    const d = this.depth, r = this.reward, R = rng(this.seed + d * 913);
    const out = [];
    if (d < 3) return out;
    if (r === 'elite') out.push(...(d <= 3 ? [0.45] : [0.3, 0.65]));
    else if (d >= 6) out.push(0.35, 0.7);
    else out.push(0.45);
    if (r !== 'elite' && (d === 4 || d >= 7) && R() < 0.35) out.push(d >= 7 ? 0.85 : 0.75);
    return out;
  }
  spawnMid() {
    const en = this.game.enemies, p = this.game.player;
    const kinds = this.depth >= 4 ? MIDBOSS_KINDS : ['warden', 'hive', 'mortar']; // 첫 중간 보스(깊이 3)는 읽기 쉬운 3종
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
    // 떨어질 자리: 가운데부터 바깥으로 돌며 구조물, 위험 지대가 없는 첫 빈자리 (가운데가 막힌 배치에서도 주울 수 있게)
    let px = 0, pz = 0;
    const free = (x, z) => !this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.6) && !this.hazards.outside(x, z, 1.5);
    search: for (let r = 0; r < Math.min(this.hx, this.hz) - 2; r += 1.2) for (let k = 0; k < Math.max(1, Math.round(r * 4)); k++) { const a = (k / Math.max(1, Math.round(r * 4))) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r; if (free(x, z)) { px = x; pz = z; break search; } }
    this.prize = { mesh: m, glow: gl, x: px, z: pz, y: 8, vy: 0, t: 0, col, taken: false };
    this.colliders.push({ x: px, z: pz, r: 0.75, prize: true });
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
        if (!this.guardOn && this.waveT <= 0) { this.guardOn = true; en.spawnGuardian(pickGuardian(this, ZONES[this.zone].guardian)); }
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
        if (OPS[this.op].update(this, dt)) {
          this.phase = 'reward';
          en.detonateAll();
          g.ui.banner('작전 완료!');
          this.dmgReport();
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
      if (P.y > 0) { P.vy -= 40 * dt; P.y = Math.max(0, P.y + P.vy * dt); if (P.y === 0) { g.fx.ring(P.x, 0.15, P.z, 2.5, P.col, 0.35); g.fx.dust(P.x, P.z, 6); g.fx.addTrauma(0.15); } }
      const bob = P.y === 0 ? Math.sin(P.t * 3) * 0.05 : 0;
      P.mesh.position = [P.x, P.y, P.z]; P.glow.position = [P.x, P.y + bob, P.z];
      P.glow.material.color = [1, 1, 1].map(() => 0.8 + 0.2 * Math.sin(P.t * 5));
      if (P.y === 0 && Math.hypot(p.x - P.x, p.z - P.z) < 1.9) { P.taken = true; this.claimPrize(); }
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
      if ((sx && p.x * sx > this.hx + 0.6) || (sz && p.z * sz > this.hz + 0.6)) { g.nextRoom(d.reward, d.side === 'W' ? 'E' : 'N', d.op, d.zone); break; }
    }
  }

  claimPrize() {
    const g = this.game, P = this.prize, r = this.reward;
    g.fx.explosion(P.x, 0.8, P.z, 0.6, { color: P.col, ring: true, scorch: false, debris: [0.4, 0.4, 0.45] });
    P.mesh.visible = false; P.glow.visible = false;
    this.colliders = this.colliders.filter((c) => !c.prize);
    if (r === 'supply') { g.player.heal(g.player.stats.maxHp * 0.4); g.addXp(g.xpNeed * 0.4); g.ui.toast('보급: 수리 40% + 경험치'); }
    else if (r === 'xp') { g.addXp(g.xpNeed * 1.05); g.ui.toast('데이터 코어: 경험치 대량 획득'); }
    else if (r === 'part' || r === 'elite') g.offerCards('part', '부품 캐시');
    else if (r === 'cargo') { g.player.heal(g.player.stats.maxHp * 0.25); g.ui.toast('수송선 화물: 수리 25%'); }
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
