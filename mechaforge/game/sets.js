// 세트 각성 + 초월 기체
//  부품 3개를 모두 달면 세트 각성 (효과 + 외형 추가).
//  세트 2개 각성 + 진화 무기 2개 → 초월 기체: 완전히 다른 모습(백금 도장, 날개, 광륜)으로 변신.

import { Geometry } from '../engine/index.js';

export const SETS = {
  artillery: {
    name: '요새 포격', tag: 'ARTILLERY', color: [1, 0.6, 0.2],
    parts: [['weapon', 'cannon'], ['weapon', 'missile'], ['module', 'spike']],
    desc: '포신과 미사일 재장전 40% 단축, 폭발 범위 +40%. 4초마다 주변에 포격이 쏟아진다.',
  },
  blade: {
    name: '검귀', tag: 'BLADE', color: [1, 0.35, 0.8],
    parts: [['weapon', 'saber'], ['module', 'shield'], ['module', 'booster']],
    desc: '베기 범위 +30%. 대시로 지나간 적을 베고, 3타째에 참격파 3줄이 날아간다.',
  },
  railgun: {
    name: '레일건', tag: 'RAILGUN', color: [1, 0.25, 0.25],
    parts: [['weapon', 'laser'], ['module', 'antenna'], ['module', 'armor']],
    desc: '빔 굵기 +50%, 치명타 +30%. 빔을 두 번 연속으로 쏜다.',
  },
  hive: {
    name: '벌집', tag: 'HIVE', color: [0.4, 1, 0.8],
    parts: [['weapon', 'funnel'], ['weapon', 'mg'], ['module', 'reactor']],
    desc: '판넬 비트 +4기, 비트 연사 +50%, 머신건 관통 +2.',
  },
};

export const TRANSCEND = { name: '초월 기체', desc: '세트 2개 각성 + 진화 무기 2개. 모든 능력 +30%, 몸집 커짐, 공격마다 번개가 친다.' };

const has = (loadout, weapons, [kind, id]) => kind === 'weapon' ? weapons.some((w) => w.id === id) : !!(loadout.modules || {})[id];

// 지금 각성한 세트 목록
export function activeSets(loadout, weapons) {
  return Object.keys(SETS).filter((k) => SETS[k].parts.every((p) => has(loadout, weapons, p)));
}
// 세트별 진행도 (UI 용)
export function setProgress(loadout, weapons) {
  return Object.fromEntries(Object.entries(SETS).map(([k, S]) => [k, S.parts.map((p) => has(loadout, weapons, p))]));
}
// 부품이 속한 세트
export function setOf(kind, id) {
  for (const [k, S] of Object.entries(SETS)) if (S.parts.some(([a, b]) => a === kind && b === id)) return k;
  return null;
}
export function canTranscend(loadout, weapons) {
  return activeSets(loadout, weapons).length >= 2 && weapons.filter((w) => w.evo).length >= 2;
}

// ---- 외형 추가 ----
//  세트마다 기체에 붙는 장식 (몸통 노드 기준 좌표)
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });
export function setGeo(id, P, top = 0.9) {
  const g = new Geometry(), glow = new Geometry();
  if (id === 'artillery') {
    // 등에 짊어진 거대 포
    add(g, Geometry.box(0.5, 0.45, 0.7, [0.3, 0.32, 0.28]), [0, top + 0.2, -0.45]);
    add(g, Geometry.cylinder(0.12, 0.12, 1.6, 6, [0.22, 0.22, 0.26]), [0, top + 0.5, -0.1], [Math.PI / 2 - 0.35, 0, 0]);
    add(glow, Geometry.cylinder(0.08, 0.08, 0.1, 6, [1, 0.6, 0.2]), [0, top + 0.75, 0.6], [Math.PI / 2 - 0.35, 0, 0]);
  } else if (id === 'blade') {
    // 등 뒤로 펼쳐진 칼날 날개
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const len = 1.2 - i * 0.18, ang = s * (0.5 + i * 0.32); add(glow, Geometry.box(0.08, len, 0.06, [1, 0.4, 0.85]), [s * 0.3 + Math.sin(ang) * len * 0.5, top + Math.cos(ang) * len * 0.5, -0.42], [0.3, 0, -ang]); }
  } else if (id === 'railgun') {
    // 머리 위 조준 장치 + 붉은 렌즈
    add(g, Geometry.box(0.14, 0.14, 0.6, [0.3, 0.3, 0.36]), [0.22, top + 0.42, 0.05]);
    add(glow, Geometry.box(0.1, 0.1, 0.05, [1, 0.2, 0.2]), [0.22, top + 0.42, 0.37]);
  } else if (id === 'hive') {
    // 등의 육각 비트 격납고
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, Geometry.cylinder(0.12, 0.12, 0.2, 6, P.sub), [Math.cos(a) * 0.24, top + 0.15 + Math.sin(a) * 0.24, -0.45], [Math.PI / 2, 0, 0]); }
    add(glow, Geometry.icosphere(0.1, 0, [0.4, 1, 0.8]), [0, top + 0.15, -0.5]);
  }
  return { geo: g, glow };
}
// 초월: 광륜 + 큰 빛의 날개 + 왕관
export function transcendGeo(top = 0.9) {
  const g = new Geometry(), glow = new Geometry();
  for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2, r = 0.55, y = top + 0.95; const p = (a, rr) => [Math.cos(a) * rr, y, Math.sin(a) * rr - 0.15]; glow.quad(p(a0, r * 0.85), p(a1, r * 0.85), p(a1, r), p(a0, r), [1, 0.9, 0.5], null, [0, 1, 0]); }
  // 큰 빛의 날개 (깃털 6장씩, 위로 크게 펼침)
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const len = 1.9 - i * 0.2, ang = s * (0.25 + i * 0.26);
    add(glow, Geometry.box(0.1, len, 0.05, [1, 0.95 - i * 0.04, 0.7 - i * 0.06]), [s * 0.3 + Math.sin(ang) * len * 0.5, top + 0.2 + Math.cos(ang) * len * 0.5, -0.5 - i * 0.03], [0.2, 0, -ang]);
  }
  // 어깨 위 금빛 뿔 장식 + 가슴 코어
  for (const s of [-1, 1]) add(g, Geometry.cone(0.1, 0.55, 4, [1, 0.85, 0.35]), [s * 0.5, top + 0.15, 0], [0, 0, -s * 0.5]);
  add(glow, Geometry.icosphere(0.13, 0, [0.6, 1, 1]), [0, top - 0.25, 0.36]);
  for (let i = -1; i <= 1; i++) add(g, Geometry.cone(0.06, 0.3 - Math.abs(i) * 0.08, 4, [1, 0.85, 0.35]), [i * 0.12, top + 0.42, 0.08]);
  return { geo: g, glow };
}
