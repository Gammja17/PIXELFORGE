// 메카 부품 정의 + 조립 (엔진 기본 도형을 merge 해서 부품 하나 = 메시 하나)
//
//  좌표 규칙: 메카의 앞 = 로컬 +Z, 위 = +Y. 부품 원점은 장착 지점.
//  격납고 부품: HEADS(머리) / FRAMES(상체 프레임) / LEGS(다리) / PAINTS(도색)
//  레벨업 부품: MODULES(몸통 모듈), 무기 외형은 WEAPON_MODELS
//  새 부품은 표에 항목 + build 함수만 추가하면 격납고/썸네일에 자동으로 나온다.

import { Geometry, Mesh, Node, Material } from '../engine/index.js';
import { setGeo, transcendGeo } from './sets.js';

// ---- 도색 ----
export const PAINTS = {
  rx:       { name: '화이트 베이스', main: [0.9, 0.91, 0.95], sub: [0.2, 0.34, 0.8], trim: [0.86, 0.2, 0.2], acc: [1, 0.8, 0.18], eye: [0.4, 1, 0.55] },
  crimson:  { name: '붉은 혜성', main: [0.86, 0.3, 0.32], sub: [0.48, 0.12, 0.16], trim: [0.25, 0.22, 0.26], acc: [1, 0.75, 0.3], eye: [1, 0.35, 0.6] },
  olive:    { name: '양산형 그린', main: [0.42, 0.55, 0.36], sub: [0.24, 0.33, 0.24], trim: [0.68, 0.5, 0.3], acc: [0.85, 0.85, 0.75], eye: [1, 0.3, 0.45] },
  midnight: { name: '미드나이트', main: [0.2, 0.2, 0.27], sub: [0.36, 0.33, 0.48], trim: [0.92, 0.7, 0.25], acc: [0.98, 0.82, 0.35], eye: [0.4, 0.9, 1] },
  sakura:   { name: '사쿠라', main: [0.96, 0.87, 0.9], sub: [0.9, 0.42, 0.6], trim: [0.36, 0.3, 0.46], acc: [1, 0.95, 0.6], eye: [0.5, 1, 0.8] },
  transcend: { name: '초월', main: [0.95, 0.94, 0.9], sub: [0.85, 0.7, 0.3], trim: [0.3, 0.32, 0.5], acc: [1, 0.9, 0.5], eye: [0.6, 1, 1] },
  desert:   { name: '사막 위장', main: [0.8, 0.7, 0.5], sub: [0.56, 0.46, 0.3], trim: [0.34, 0.31, 0.26], acc: [0.92, 0.42, 0.2], eye: [1, 0.6, 0.2] },
  ace:      { name: '에이스 블루', main: [0.36, 0.56, 0.86], sub: [0.9, 0.92, 0.95], trim: [0.16, 0.2, 0.34], acc: [1, 0.84, 0.2], eye: [0.5, 1, 1] },
  stealth:  { name: '스텔스', main: [0.17, 0.18, 0.21], sub: [0.31, 0.33, 0.37], trim: [0.1, 0.1, 0.12], acc: [0.86, 0.16, 0.2], eye: [1, 0.2, 0.25] },
  toxic:    { name: '독성 네온', main: [0.26, 0.28, 0.26], sub: [0.56, 0.95, 0.2], trim: [0.68, 0.22, 0.84], acc: [0.95, 1, 0.3], eye: [0.7, 1, 0.2] },
  gold:     { name: '황금', main: [0.96, 0.76, 0.3], sub: [0.62, 0.42, 0.16], trim: [0.26, 0.21, 0.18], acc: [1, 0.95, 0.7], eye: [0.4, 1, 0.9] },
  boss:     { name: '타이탄', main: [0.3, 0.27, 0.36], sub: [0.55, 0.12, 0.2], trim: [0.16, 0.15, 0.19], acc: [0.95, 0.6, 0.2], eye: [1, 0.2, 0.3] },
};
export const HANGAR_PAINTS = ['rx', 'crimson', 'olive', 'midnight', 'sakura', 'desert', 'ace', 'stealth', 'toxic', 'gold'];
const DARK = [0.24, 0.25, 0.3], GREY = [0.55, 0.58, 0.63], STEEL = [0.36, 0.38, 0.44], GLASS = [0.26, 0.44, 0.64], BONE = [0.9, 0.87, 0.78];

// ---- 조립 헬퍼 ----
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => g.merge(part, { position, rotation, scale });
const box = (w, h, d, c) => Geometry.box(w, h, d, c);
const cbox = (g, w, h, d, c, p, r) => add(g, box(w, h, d, c), [p[0], p[1] - h / 2, p[2]], r);       // 중심 기준 상자
const zcyl = (g, r, len, c, p, seg = 6) => add(g, Geometry.cylinder(r, r, len, seg, c), p, [Math.PI / 2, 0, 0]);
const xcyl = (g, r, len, c, p, seg = 8) => add(g, Geometry.cylinder(r, r, len, seg, c), [p[0] - len / 2, p[1], p[2]], [0, 0, -Math.PI / 2]);
// a → b 를 잇는 막대 (관절 다리용)
function seg(g, a, b, w, d, c) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  add(g, box(w, len, d, c), a, [Math.atan2(dz, dy), 0, Math.asin(-dx / len)]);
}
// 얇은 판 (날개/꼬리날개): pts = XZ 평면 볼록 다각형, t = 두께, 원점 높이가 판 중심
function slab(pts, t, c) {
  const g = new Geometry(), n = pts.length;
  let a = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  const ps = a > 0 ? [...pts].reverse() : pts, U = (p) => [p[0], t / 2, p[1]], D = (p) => [p[0], -t / 2, p[1]];
  for (let i = 1; i < n - 1; i++) { g.tri(U(ps[0]), U(ps[i]), U(ps[i + 1]), c); g.tri(D(ps[0]), D(ps[i + 1]), D(ps[i]), c); }
  for (let i = 0; i < n; i++) { const p = ps[i], q = ps[(i + 1) % n]; g.quad(D(p), D(q), U(q), U(p), c); }
  return g;
}
const mirror = (pts, s) => pts.map(([x, z]) => [s * x, z]);

// ---- 다리 (이동 방식) ----  anim: 애니메이션 종류(walk 걷기 / roll 궤도 / wheel 바퀴 / hover / jet), upperY: 허리 위 상체 높이
//  walk 는 step(걸음 속도), swing(다리 흔들림), bob(몸 들썩임)
export const LEGS = {
  walker:  { name: '2족 보행', tag: 'BIPED', desc: '균형형. 대시 2회.', hip: 0.95, anim: 'walk', step: 6, swing: 0.65, bob: 0.07, stats: { maxHp: 100, speed: 6.6, accel: 22, dashCharges: 2, dashCd: 1.1, armor: 0 } },
  reverse: { name: '역관절', tag: 'RAPTOR', desc: '민첩. 대시 거리가 길다.', hip: 1.0, anim: 'walk', step: 8, swing: 0.65, bob: 0.07, stats: { maxHp: 85, speed: 7.4, accel: 26, dashCharges: 2, dashCd: 0.9, armor: 0, dashSpeed: 31 } },
  treads:  { name: '무한궤도', tag: 'TANK', desc: '튼튼. 대시로 들이받아 피해.', hip: 0.78, anim: 'roll', stats: { maxHp: 150, speed: 5.1, accel: 16, dashCharges: 1, dashCd: 1.3, armor: 2, ram: 30, dashSpeed: 19 } },
  quad:    { name: '4족 보행', tag: 'QUAD', desc: '안정적. 넉백을 덜 받는다.', hip: 0.85, anim: 'walk', step: 6, swing: 0.4, bob: 0.03, upperY: 0.18, stats: { maxHp: 130, speed: 5.9, accel: 20, dashCharges: 2, dashCd: 1.2, armor: 1, knockResist: 0.5 } },
  hover:   { name: '호버', tag: 'HOVER', desc: '빠르고 미끄러진다. 대시 3회.', hip: 0.82, anim: 'hover', stats: { maxHp: 75, speed: 8.2, accel: 7, dashCharges: 3, dashCd: 0.85, armor: 0 } },
  wheels:  { name: '바이크', tag: 'BIKE', desc: '빠르게 질주. 대시로 들이받아 피해.', hip: 0.86, anim: 'wheel', stats: { maxHp: 90, speed: 8.0, accel: 15, dashCharges: 2, dashCd: 1.0, armor: 0, ram: 18, dashSpeed: 30 } },
  stomper: { name: '중역관절', tag: 'STOMP', desc: '육중한 새 다리. 들이받기, 넉백 저항.', hip: 1.08, anim: 'walk', step: 4.5, swing: 0.5, bob: 0.1, stats: { maxHp: 140, speed: 5.6, accel: 18, dashCharges: 2, dashCd: 1.25, armor: 2, ram: 20, knockResist: 0.4, dashSpeed: 22 } },
  spider:  { name: '6족 거미', tag: 'SPIDER', desc: '방향 전환이 빠르다. 대시 3회.', hip: 0.78, anim: 'walk', step: 10, swing: 0.35, bob: 0.02, upperY: 0.2, stats: { maxHp: 115, speed: 6.3, accel: 32, dashCharges: 3, dashCd: 1.15, armor: 1, knockResist: 0.3 } },
  tankbase: { name: '중전차', tag: 'MBT', desc: '최고 내구. 넉백을 거의 안 받는다.', hip: 0.9, anim: 'roll', stats: { maxHp: 175, speed: 4.7, accel: 14, dashCharges: 1, dashCd: 1.4, armor: 3, ram: 45, dashSpeed: 18, knockResist: 0.7 } },
  jet:     { name: '제트 추진', tag: 'JET', desc: '가장 빠르다. 대시 3회, 멀리 돌진.', hip: 0.6, anim: 'jet', stats: { maxHp: 70, speed: 8.8, accel: 11, dashCharges: 3, dashCd: 0.8, armor: 0, dashSpeed: 34 } },
};

// ---- 상체 프레임 ----  mods: 능력치 보정, slots: 무기 장착 위치, headY: 목 높이
export const FRAMES = {
  standard: { name: '스탠다드', tag: 'STD', desc: '기본형.', mods: {}, headY: 0.92,
    slots: { armR: [0.62, 0.2, 0.08], armL: [-0.62, 0.2, 0.08], shR: [0.6, 0.98, -0.04], shL: [-0.6, 0.98, -0.04], back: [0, 0.75, -0.4] } },
  light: { name: '경량', tag: 'LIGHT', desc: '속도 +10%, 대시 재충전 -10%, 체력 -15', mods: { hp: -15, speedMul: 1.1, dashCdMul: 0.9 }, headY: 0.86,
    slots: { armR: [0.5, 0.24, 0.08], armL: [-0.5, 0.24, 0.08], shR: [0.48, 0.9, -0.04], shL: [-0.48, 0.9, -0.04], back: [0, 0.7, -0.34] } },
  heavy: { name: '중장갑', tag: 'HEAVY', desc: '체력 +40, 방어 +1, 속도 -10%', mods: { hp: 40, armor: 1, speedMul: 0.9 }, headY: 1.0,
    slots: { armR: [0.8, 0.16, 0.08], armL: [-0.8, 0.16, 0.08], shR: [0.78, 1.06, -0.04], shL: [-0.78, 1.06, -0.04], back: [0, 0.8, -0.48] } },
  sniper: { name: '저격형', tag: 'SNIPE', desc: '피해 +8%, 치명타 +8%, 체력 -10', mods: { hp: -10, dmgMul: 0.08, crit: 0.08 }, headY: 0.94,
    slots: { armR: [0.58, 0.2, 0.08], armL: [-0.58, 0.2, 0.08], shR: [0.56, 0.98, -0.04], shL: [-0.56, 0.98, -0.04], back: [0, 0.75, -0.38] } },
  // fist: 빈 팔 슬롯에 붙는 모양 (기본 주먹 / pylon 날개 아래 미사일 / sponson 측면 기관총)
  egg: { name: '에그', tag: 'EGG', desc: '체력 +20, 대시 재충전 -5%', mods: { hp: 20, dashCdMul: 0.95 }, headY: 1.06,
    slots: { armR: [0.6, 0.24, 0.08], armL: [-0.6, 0.24, 0.08], shR: [0.54, 1.02, -0.04], shL: [-0.54, 1.02, -0.04], back: [0, 0.7, -0.46] } },
  ninja: { name: '닌자', tag: 'NINJA', desc: '속도 +15%, 치명타 +6%, 체력 -25', mods: { hp: -25, speedMul: 1.15, crit: 0.06 }, headY: 0.86,
    slots: { armR: [0.44, 0.26, 0.08], armL: [-0.44, 0.26, 0.08], shR: [0.42, 0.9, -0.04], shL: [-0.42, 0.9, -0.04], back: [0, 0.72, -0.3] } },
  tank: { name: '전차 포탑', tag: 'TURRET', desc: '체력 +30, 방어 +1, 피해 +5%, 속도 -8%', mods: { hp: 30, armor: 1, dmgMul: 0.05, speedMul: 0.92 }, headY: 0.82, fist: 'sponson',
    slots: { armR: [0.66, 0.34, 0.1], armL: [-0.66, 0.34, 0.1], shR: [0.36, 0.84, -0.14], shL: [-0.36, 0.84, -0.14], back: [0, 0.62, -0.84] } },
  fighter: { name: '전투기', tag: 'JET', desc: '속도 +12%, 대시 재충전 -15%, 체력 -20', mods: { hp: -20, speedMul: 1.12, dashCdMul: 0.85 }, headY: 0.68, fist: 'pylon',
    slots: { armR: [0.62, 0.3, 0.0], armL: [-0.62, 0.3, 0.0], shR: [0.82, 0.5, -0.3], shL: [-0.82, 0.5, -0.3], back: [0, 0.74, -0.55] } },
  fortress: { name: '요새', tag: 'FORT', desc: '체력 +70, 방어 +2, 속도 -20%', mods: { hp: 70, armor: 2, speedMul: 0.8 }, headY: 1.06,
    slots: { armR: [0.92, 0.12, 0.1], armL: [-0.92, 0.12, 0.1], shR: [0.92, 1.28, -0.04], shL: [-0.92, 1.28, -0.04], back: [0, 0.9, -0.62] } },
};

// ---- 머리 ----
export const HEADS = {
  vfin:   { name: 'V 안테나', tag: 'V-FIN', desc: '대시 재충전 -10%', mods: { dashCdMul: 0.9 } },
  mono:   { name: '모노아이', tag: 'MONO', desc: '치명타 +5%', mods: { crit: 0.05 } },
  visor:  { name: '고글 바이저', tag: 'VISOR', desc: '회수 범위 +30%', mods: { magnetMul: 1.3 } },
  horned: { name: '뿔', tag: 'HORN', desc: '피해 +8%', mods: { dmgMul: 0.08 } },
  dome:   { name: '돔 센서', tag: 'DOME', desc: '회수 범위 +50%', mods: { magnetMul: 1.5 } },
  periscope: { name: '잠망경', tag: 'SCOPE', desc: '치명타 +8%', mods: { crit: 0.08 } },
  canopy: { name: '캐노피', tag: 'CANOPY', desc: '치명타 +3%, 대시 재충전 -6%', mods: { crit: 0.03, dashCdMul: 0.94 } },
  samurai: { name: '투구', tag: 'KABUTO', desc: '피해 +5%, 치명타 +3%', mods: { dmgMul: 0.05, crit: 0.03 } },
  skull:  { name: '해골', tag: 'SKULL', desc: '피해 +10%', mods: { dmgMul: 0.1 } },
};

// ---- 몸통 모듈 (레벨업으로 장착) ----
export const MODULES = {
  armor:   { name: '복합 장갑판', tag: 'ARMOR', max: 3, desc: () => '최대 체력 +25, 방어 +1' },
  booster: { name: '백팩 부스터', tag: 'BOOST', max: 3, desc: () => '이동 속도 +10%, 대시 재충전 -15%' },
  reactor: { name: '리액터 코어', tag: 'CORE', max: 3, desc: () => '모든 무기 발사 속도 +12%, 특수기 재충전 -12%' },
  antenna: { name: '레이더 안테나', tag: 'RADAR', max: 3, desc: () => '회수 범위 +45%, 경험치 +10%' },
  shield:  { name: '실드 발생기', tag: 'SHIELD', max: 3, desc: (l) => `피격 1회 무효 (재충전 ${[12, 9, 6][l - 1] ?? 6}초)` },
  spike:   { name: '스파이크 견갑', tag: 'SPIKE', max: 3, salvage: true, desc: (l) => `중장 메카에서 뜯어낸 어깨 장갑. 방어 +${l}, 대시로 들이받으면 피해 ${l * 30}` },
};

const cache = new Map();
const cached = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ===== 다리 지오메트리 =====
function walkerLeg(P, hip) {
  const g = new Geometry();
  cbox(g, 0.3, 0.42, 0.34, P.main, [0, -0.06, 0]);
  cbox(g, 0.32, 0.2, 0.36, STEEL, [0, -0.48, 0.02]);
  cbox(g, 0.36, 0.42, 0.42, P.main, [0, -0.62, 0.0]);
  cbox(g, 0.3, 0.16, 0.12, P.sub, [0, -0.5, 0.22]);
  cbox(g, 0.4, 0.14, 0.62, P.sub, [0, -hip + 0.14, 0.07]);
  cbox(g, 0.22, 0.08, 0.2, P.trim, [0, -hip + 0.2, 0.3]);
  return g;
}
// 역관절: 무릎이 앞으로, 발목이 뒤로 꺾인 새 다리
function reverseLeg(P, hip) {
  const g = new Geometry();
  const knee = [0, -0.4, 0.3], ankle = [0, -hip + 0.18, -0.16];
  seg(g, [0, 0.05, -0.02], knee, 0.26, 0.3, P.main);
  add(g, Geometry.icosphere(0.15, 0, STEEL), knee);
  seg(g, knee, ankle, 0.2, 0.22, P.sub);
  cbox(g, 0.22, 0.12, 0.14, P.acc, [0, knee[1] + 0.02, knee[2] + 0.12]);
  for (const s of [-1, 1]) add(g, box(0.1, 0.08, 0.42, P.main), [s * 0.1, -hip, ankle[2] + 0.1], [0, s * 0.25, 0]); // 발가락
  add(g, box(0.08, 0.08, 0.2, P.trim), [0, -hip, ankle[2] - 0.12], [0, Math.PI, 0]);
  return g;
}
// 4족: 바깥으로 벌어진 거미 다리 한 개 (sx, sz = 방향)
function quadLeg(P, hip, sx, sz) {
  const g = new Geometry();
  const knee = [sx * 0.42, 0.22, sz * 0.32], foot = [sx * 0.6, -hip + 0.12, sz * 0.48];
  seg(g, [0, 0, 0], knee, 0.2, 0.22, P.main);
  add(g, Geometry.icosphere(0.13, 0, STEEL), knee);
  seg(g, knee, foot, 0.17, 0.19, P.sub);
  cbox(g, 0.26, 0.12, 0.3, P.trim, [foot[0], foot[1] - 0.06, foot[2]]);
  return g;
}
function treadGeo(P) {
  const g = new Geometry();
  for (const s of [-1, 1]) {
    cbox(g, 0.36, 0.46, 1.35, DARK, [s * 0.5, 0.5, 0]);
    for (let i = -1; i <= 1; i++) xcyl(g, 0.17, 0.4, GREY, [s * 0.5, 0.2, i * 0.42]);
    cbox(g, 0.4, 0.08, 1.2, P.acc, [s * 0.5, 0.56, 0]);
    cbox(g, 0.38, 0.12, 0.3, P.sub, [s * 0.5, 0.5, 0.64], [0.5, 0, 0]);
  }
  cbox(g, 0.66, 0.28, 0.95, P.main, [0, 0.74, 0]);
  cbox(g, 0.5, 0.1, 0.3, P.trim, [0, 0.62, 0.5]);
  return g;
}
function hoverGeo(P) {
  const g = new Geometry();
  add(g, Geometry.cylinder(0.72, 0.6, 0.26, 8, P.main), [0, 0.28, 0]);
  add(g, Geometry.cylinder(0.78, 0.74, 0.08, 8, P.sub), [0, 0.42, 0]);
  for (const s of [-1, 1]) { cbox(g, 0.2, 0.3, 0.7, P.sub, [s * 0.66, 0.64, -0.05]); cbox(g, 0.16, 0.12, 0.2, P.trim, [s * 0.66, 0.42, 0.32]); }
  cbox(g, 0.5, 0.2, 0.5, STEEL, [0, 0.76, 0]);
  return g;
}
function hipsGeo(P, big) {
  const g = new Geometry();
  if (!big) { cbox(g, 0.6, 0.22, 0.42, STEEL, [0, 0.08, 0]); cbox(g, 0.24, 0.2, 0.12, P.trim, [0, 0.06, 0.22]); return g; }
  cbox(g, 0.78, 0.28, 0.5, STEEL, [0, 0.08, 0]);
  cbox(g, 0.3, 0.22, 0.14, P.trim, [0, 0.06, 0.26]);
  for (const s of [-1, 1]) cbox(g, 0.14, 0.3, 0.42, P.sub, [s * 0.5, 0.06, 0]);
  return g;
}
// 중역관절: 굵은 허벅지 + 뒤쪽 피스톤 + 세 발가락
function stomperLeg(P, hip) {
  const g = new Geometry();
  const knee = [0, -0.42, 0.36], ankle = [0, -hip + 0.28, -0.22];
  seg(g, [0, 0.08, -0.02], knee, 0.36, 0.4, P.main);
  add(g, Geometry.icosphere(0.2, 0, STEEL), knee);
  seg(g, knee, ankle, 0.26, 0.28, P.sub);
  seg(g, [0, -0.06, -0.2], [0, ankle[1] + 0.1, ankle[2] - 0.1], 0.08, 0.08, GREY);
  cbox(g, 0.3, 0.2, 0.16, P.acc, [0, knee[1] + 0.04, knee[2] + 0.16]);
  add(g, Geometry.icosphere(0.14, 0, STEEL), ankle);
  seg(g, ankle, [0, -hip + 0.1, ankle[2] + 0.06], 0.2, 0.2, P.main);
  for (const s of [-1, 0, 1]) add(g, box(0.12, 0.12, 0.46, P.trim), [s * 0.13, -hip, ankle[2] + 0.18], [0, s * 0.35, 0]);
  add(g, box(0.12, 0.1, 0.26, DARK), [0, -hip, ankle[2] - 0.16], [0, Math.PI, 0]);
  return g;
}
// 6족: 높이 솟은 무릎 + 뾰족한 발끝
function spiderLeg(P, hip, sx, sz) {
  const g = new Geometry();
  const knee = [sx * 0.5, 0.36, sz * 0.3], foot = [sx * 0.82, -hip + 0.04, sz * 0.5];
  seg(g, [0, 0, 0], knee, 0.14, 0.16, P.main);
  add(g, Geometry.icosphere(0.1, 0, P.acc), knee);
  seg(g, knee, foot, 0.11, 0.12, P.sub);
  cbox(g, 0.1, 0.1, 0.1, DARK, [foot[0], foot[1] + 0.02, foot[2]]);
  return g;
}
function spiderBodyGeo(P) {
  const g = new Geometry();
  cbox(g, 0.66, 0.28, 0.76, STEEL, [0, 0.04, 0]);
  cbox(g, 0.5, 0.1, 0.6, P.sub, [0, 0.22, 0]);
  add(g, Geometry.icosphere(0.36, 1, P.main), [0, 0.12, -0.62], [0.2, 0, 0], [1, 0.8, 1.1]);
  cbox(g, 0.12, 0.06, 0.24, P.acc, [0, 0.42, -0.62]);
  for (const s of [-1, 1]) add(g, Geometry.cone(0.05, 0.22, 4, P.trim), [s * 0.12, -0.04, 0.38], [Math.PI / 2 + 0.6, 0, 0]);
  return g;
}
// 바이크: 앞뒤 바퀴는 따로 돌아가는 다리 노드, 차체는 몸통에
function wheelGeo(P, rear) {
  const g = new Geometry(), w = rear ? 0.3 : 0.2;
  xcyl(g, 0.34, w, DARK, [0, 0, 0], 10);
  xcyl(g, 0.21, w + 0.04, GREY, [0, 0, 0], 8);
  for (let i = 0; i < 2; i++) add(g, box(w + 0.06, 0.06, 0.4, P.sub), [0, -0.03, 0], [i * Math.PI / 2, 0, 0]);
  xcyl(g, 0.07, w + 0.1, P.acc, [0, 0, 0], 6);
  return g;
}
function bikeGeo(P) {
  const g = new Geometry();
  cbox(g, 0.36, 0.3, 0.9, P.main, [0, 0.7, -0.02]);
  add(g, box(0.42, 0.34, 0.3, P.sub), [0, 0.52, 0.42], [-0.5, 0, 0]);         // 앞 카울
  cbox(g, 0.14, 0.1, 0.06, P.acc, [0, 0.76, 0.6]);                              // 전조등
  cbox(g, 0.4, 0.2, 0.36, STEEL, [0, 0.9, 0]);                                  // 상체 연결
  for (const s of [-1, 1]) {
    seg(g, [s * 0.14, 0.72, 0.4], [s * 0.14, 0.34, 0.62], 0.06, 0.06, STEEL);  // 앞 포크
    seg(g, [s * 0.18, 0.6, -0.2], [s * 0.18, 0.34, -0.6], 0.07, 0.1, GREY);   // 뒤 스윙암
    zcyl(g, 0.05, 0.5, DARK, [s * 0.24, 0.5, -0.82]);                           // 배기관
  }
  cbox(g, 0.26, 0.05, 0.4, P.sub, [0, 0.72, 0.64]);
  cbox(g, 0.36, 0.05, 0.44, P.sub, [0, 0.74, -0.6]);
  cbox(g, 0.3, 0.08, 0.06, P.trim, [0, 0.66, -0.84]);
  return g;
}
// 중전차 차체: 넓은 궤도 + 측면 스커트 + 경사 장갑
function tankBaseGeo(P) {
  const g = new Geometry();
  for (const s of [-1, 1]) {
    cbox(g, 0.4, 0.62, 1.8, DARK, [s * 0.6, 0.38, 0]);
    for (let i = -2; i <= 2; i++) xcyl(g, 0.16, 0.46, GREY, [s * 0.6, 0.22, i * 0.36]);
    xcyl(g, 0.13, 0.46, STEEL, [s * 0.6, 0.5, 0.86]);
    cbox(g, 0.08, 0.32, 1.7, P.sub, [s * 0.84, 0.6, 0]);
    cbox(g, 0.09, 0.06, 1.5, P.acc, [s * 0.85, 0.56, 0]);
  }
  cbox(g, 0.86, 0.36, 1.5, P.main, [0, 0.74, -0.04]);
  add(g, box(0.86, 0.42, 0.12, P.main), [0, 0.5, 0.82], [-1.0, 0, 0]);
  cbox(g, 0.6, 0.06, 0.5, DARK, [0, 0.94, -0.5]);
  for (const s of [-1, 1]) cbox(g, 0.1, 0.08, 0.06, P.acc, [s * 0.32, 0.82, 0.72]);
  return g;
}
// 제트 추진: 다리 대신 배 밑 추진 포드 + 아래로 뿜는 노즐 2개
function jetGeo(P) {
  const g = new Geometry();
  cbox(g, 0.44, 0.26, 0.9, P.sub, [0, 0.5, -0.05]);
  add(g, Geometry.cone(0.16, 0.3, 6, P.sub), [0, 0.5, 0.4], [Math.PI / 2, 0, 0]);
  cbox(g, 0.3, 0.16, 0.3, STEEL, [0, 0.7, 0]);
  for (const s of [-1, 1]) {
    cbox(g, 0.14, 0.1, 0.46, STEEL, [s * 0.3, 0.56, -0.12]);
    add(g, Geometry.cylinder(0.1, 0.15, 0.3, 8, DARK), [s * 0.3, 0.22, -0.12]);
    cbox(g, 0.32, 0.05, 0.08, P.acc, [s * 0.3, 0.5, 0.1]);
    add(g, slab([[0, -0.1], [0.28, -0.3], [0.28, -0.48], [0, -0.5]], 0.05, P.trim), [s * 0.16, 0.4, 0], [0, 0, -Math.PI / 2 + s * 0.4]);
  }
  return g;
}
function jetGlowGeo() {
  const g = new Geometry(), c = [1, 0.66, 0.26];
  for (const s of [-1, 1]) add(g, Geometry.cone(0.12, 0.34, 6, c), [s * 0.3, 0.21, -0.12], [Math.PI, 0, 0]);
  add(g, Geometry.cone(0.1, 0.3, 6, c), [0, 0.5, -0.5], [-Math.PI / 2, 0, 0]);
  return g;
}

// ===== 상체 프레임 지오메트리 (원점 = 허리) =====
function frameGeo(id, P) {
  const g = new Geometry();
  const arms = (x, y, sw, sh, sd) => {
    for (const s of [-1, 1]) {
      cbox(g, sw, sh, sd, P.sub, [s * x, y, 0]);
      cbox(g, sw + 0.02, 0.06, sd + 0.02, P.acc, [s * x, y - sh / 2 - 0.02, 0]);
      cbox(g, 0.2, 0.3, 0.22, GREY, [s * x, y - sh / 2 - 0.2, 0]);
    }
  };
  if (id === 'light') {
    cbox(g, 0.36, 0.2, 0.32, STEEL, [0, 0.12, 0]);
    cbox(g, 0.66, 0.42, 0.48, P.main, [0, 0.62, 0]);
    cbox(g, 0.5, 0.2, 0.06, P.sub, [0, 0.66, 0.26]);
    cbox(g, 0.3, 0.14, 0.36, P.trim, [0, 0.3, 0]);
    arms(0.48, 0.76, 0.26, 0.24, 0.32);
    for (const s of [-1, 1]) add(g, box(0.06, 0.34, 0.2, P.acc), [s * 0.48, 0.84, -0.06], [0, 0, -s * 0.5]); // 어깨 날개
  } else if (id === 'heavy') {
    cbox(g, 0.58, 0.22, 0.46, STEEL, [0, 0.12, 0]);
    cbox(g, 1.06, 0.6, 0.74, P.main, [0, 0.68, 0]);
    cbox(g, 0.86, 0.32, 0.1, P.sub, [0, 0.64, 0.4]);
    cbox(g, 0.5, 0.18, 0.5, P.trim, [0, 0.3, 0.02]);
    for (const s of [-1, 1]) cbox(g, 0.2, 0.12, 0.08, P.acc, [s * 0.26, 0.5, 0.45]);
    arms(0.78, 0.82, 0.5, 0.44, 0.6);
    for (const s of [-1, 1]) cbox(g, 0.54, 0.1, 0.18, P.trim, [s * 0.78, 1.0, 0]);
  } else if (id === 'sniper') {
    cbox(g, 0.44, 0.2, 0.38, STEEL, [0, 0.12, 0]);
    cbox(g, 0.74, 0.5, 0.56, P.main, [0, 0.66, 0]);
    cbox(g, 0.18, 0.4, 0.08, P.sub, [0.18, 0.64, 0.3]);
    cbox(g, 0.4, 0.15, 0.4, P.trim, [0, 0.3, 0.02]);
    arms(0.56, 0.78, 0.3, 0.3, 0.38);
    // 오른쪽 어깨 위 거리 측정 센서 + 허리 망토판
    cbox(g, 0.12, 0.12, 0.6, DARK, [0.56, 0.98, 0.1]);
    cbox(g, 0.14, 0.14, 0.06, P.acc, [0.56, 0.98, 0.42]);
    for (const s of [-1, 1]) add(g, box(0.3, 0.5, 0.06, P.sub), [s * 0.2, -0.25, -0.24], [0.25, 0, 0]);
  } else if (id === 'fighter') {
    // 전투기: 앞뒤로 긴 동체 + 후퇴익 + 카나드 + 흡입구 + 쌍수직꼬리날개 (머리 자리 = 조종석)
    cbox(g, 0.3, 0.3, 0.3, STEEL, [0, 0.15, 0]);
    cbox(g, 0.5, 0.36, 1.3, P.main, [0, 0.5, -0.05]);
    add(g, Geometry.cone(0.22, 0.55, 6, P.main), [0, 0.5, 0.6], [Math.PI / 2, 0, 0]);
    add(g, Geometry.cone(0.09, 0.2, 6, P.trim), [0, 0.5, 1.06], [Math.PI / 2, 0, 0]);
    cbox(g, 0.22, 0.1, 1.0, P.sub, [0, 0.72, -0.3]);
    for (const s of [-1, 1]) {
      add(g, slab(mirror([[0.2, 0.3], [1.15, -0.38], [1.15, -0.6], [0.2, -0.58]], s), 0.07, P.main), [0, 0.46, 0]);
      add(g, slab(mirror([[0.6, -0.04], [1.15, -0.42], [1.15, -0.48], [0.6, -0.12]], s), 0.08, P.sub), [0, 0.47, 0]);
      cbox(g, 0.06, 0.1, 0.4, P.acc, [s * 1.16, 0.5, -0.46]);
      add(g, slab(mirror([[0.2, 0.62], [0.5, 0.42], [0.5, 0.34], [0.2, 0.38]], s), 0.05, P.sub), [0, 0.54, 0]);
      cbox(g, 0.16, 0.24, 0.42, DARK, [s * 0.33, 0.44, 0.22]);
      cbox(g, 0.18, 0.05, 0.08, P.trim, [s * 0.33, 0.58, 0.44]);
      add(g, slab([[0, -0.5], [0.46, -0.82], [0.46, -0.98], [0, -0.98]], 0.06, P.sub), [s * 0.16, 0.66, 0], [0, 0, Math.PI / 2 - s * 0.35]);
      zcyl(g, 0.12, 0.32, DARK, [s * 0.13, 0.48, -0.98]);
      cbox(g, 0.12, 0.04, 0.04, P.acc, [s * 0.13, 0.5, -0.99]);
    }
  } else if (id === 'tank') {
    // 전차 포탑: 낮고 넓은 포탑 + 경사 장갑 + 긴 주포 (조준 방향으로 포탑이 돈다)
    cbox(g, 0.6, 0.2, 0.5, STEEL, [0, 0.12, 0]);
    add(g, Geometry.cylinder(0.5, 0.52, 0.12, 8, P.trim), [0, 0.2, 0]);
    cbox(g, 1.0, 0.4, 0.9, P.main, [0, 0.52, -0.05]);
    add(g, box(0.9, 0.45, 0.12, P.main), [0, 0.3, 0.52], [-0.85, 0, 0]);
    cbox(g, 0.72, 0.1, 0.62, P.sub, [0, 0.77, -0.08]);
    cbox(g, 0.84, 0.3, 0.32, P.trim, [0, 0.5, -0.64]);
    cbox(g, 0.36, 0.3, 0.2, STEEL, [0, 0.5, 0.5]);
    zcyl(g, 0.08, 1.1, DARK, [0, 0.5, 0.55]);
    zcyl(g, 0.12, 0.18, STEEL, [0, 0.5, 1.5]);
    for (const s of [-1, 1]) {
      cbox(g, 0.1, 0.36, 0.86, P.sub, [s * 0.53, 0.5, -0.05]);
      for (let i = 0; i < 3; i++) zcyl(g, 0.035, 0.14, P.acc, [s * (0.26 + i * 0.07), 0.66, 0.34], 4);
    }
  } else if (id === 'egg') {
    // 에그: 달걀 모양 몸통 + 공 관절
    cbox(g, 0.4, 0.2, 0.36, STEEL, [0, 0.12, 0]);
    add(g, Geometry.icosphere(0.5, 1, P.main), [0, 0.62, 0], [0, 0, 0], [1, 1.12, 0.92]);
    add(g, Geometry.cylinder(0.51, 0.51, 0.1, 10, P.sub), [0, 0.5, 0]);
    add(g, Geometry.icosphere(0.12, 0, P.acc), [0, 0.72, 0.42]);
    for (const s of [-1, 1]) {
      add(g, Geometry.icosphere(0.2, 1, P.sub), [s * 0.52, 0.86, 0]);
      add(g, Geometry.icosphere(0.14, 0, STEEL), [s * 0.58, 0.45, 0.04]);
    }
  } else if (id === 'ninja') {
    // 곤충 닌자: 가는 허리 + 뒤로 뻗은 배 + 잠자리 날개 + 목도리
    add(g, Geometry.cylinder(0.09, 0.14, 0.4, 6, STEEL), [0, 0.02, 0]);
    add(g, Geometry.icosphere(0.3, 1, P.main), [0, 0.62, 0.02], [0, 0, 0], [1, 0.95, 0.8]);
    cbox(g, 0.34, 0.12, 0.08, P.sub, [0, 0.58, 0.25]);
    add(g, Geometry.icosphere(0.26, 1, P.sub), [0, 0.38, -0.42], [-0.4, 0, 0], [0.9, 0.8, 1.5]);
    add(g, Geometry.cone(0.06, 0.26, 4, P.trim), [0, 0.24, -0.76], [-Math.PI / 2 - 0.4, 0, 0]);
    cbox(g, 0.32, 0.1, 0.3, P.trim, [0, 0.86, 0]);
    add(g, box(0.16, 0.04, 0.6, P.trim), [0.1, 0.84, -0.3], [0.35, 0.3, 0]);
    arms(0.42, 0.74, 0.18, 0.2, 0.24);
    const WING = [0.78, 0.9, 0.96];
    for (const s of [-1, 1]) {
      add(g, Geometry.cone(0.05, 0.35, 4, P.acc), [s * 0.42, 0.84, -0.06], [-0.6, 0, -s * 0.5]);
      add(g, slab(mirror([[0.05, 0.05], [0.9, -0.1], [0.95, -0.22], [0.1, -0.12]], s), 0.03, WING), [0, 0.8, -0.24], [0, 0, s * 0.5]);
      add(g, slab(mirror([[0.05, -0.05], [0.75, -0.3], [0.78, -0.42], [0.08, -0.18]], s), 0.03, WING), [0, 0.74, -0.26], [0, 0, s * 0.2]);
    }
  } else if (id === 'fortress') {
    // 요새: 성벽 같은 몸통 + 총안 + 성가퀴 + 굴뚝
    cbox(g, 0.7, 0.24, 0.56, STEEL, [0, 0.12, 0]);
    cbox(g, 0.6, 0.2, 0.6, P.trim, [0, 0.34, 0.02]);
    cbox(g, 1.3, 0.72, 0.92, P.main, [0, 0.7, 0]);
    cbox(g, 1.0, 0.36, 0.1, P.sub, [0, 0.64, 0.48]);
    for (let i = -1; i <= 1; i++) cbox(g, 0.14, 0.1, 0.06, DARK, [i * 0.3, 0.68, 0.54]);
    for (let i = -2; i <= 2; i++) cbox(g, 0.16, 0.14, 0.16, P.trim, [i * 0.28, 1.12, 0.38]);
    arms(0.92, 0.88, 0.56, 0.52, 0.72);
    for (const s of [-1, 1]) {
      for (let i = -1; i <= 1; i++) cbox(g, 0.14, 0.12, 0.14, P.trim, [s * 0.92, 1.2, i * 0.24]);
      add(g, Geometry.cylinder(0.09, 0.1, 0.5, 6, DARK), [s * 0.36, 0.95, -0.38]);
      add(g, Geometry.cylinder(0.12, 0.12, 0.06, 6, P.acc), [s * 0.36, 1.45, -0.38]);
    }
  } else {
    cbox(g, 0.46, 0.2, 0.4, STEEL, [0, 0.12, 0]);
    cbox(g, 0.42, 0.16, 0.44, P.trim, [0, 0.26, 0.02]);
    cbox(g, 0.86, 0.5, 0.6, P.main, [0, 0.66, 0]);
    cbox(g, 0.72, 0.28, 0.08, P.sub, [0, 0.62, 0.32]);
    for (const s of [-1, 1]) cbox(g, 0.16, 0.1, 0.06, P.acc, [s * 0.2, 0.56, 0.37]);
    arms(0.6, 0.78, 0.36, 0.34, 0.44);
  }
  return g;
}

// ===== 머리 지오메트리 (원점 = 목) =====
function headGeo(id, P) {
  const g = new Geometry(), glow = new Geometry();
  let glowColor = P.eye;
  if (id === 'mono') {
    add(g, Geometry.icosphere(0.21, 1, P.sub, { squashY: 0.85 }), [0, 0.16, 0]);
    cbox(g, 0.36, 0.08, 0.2, DARK, [0, 0.16, 0.08]);
    add(g, Geometry.cylinder(0.04, 0.04, 0.34, 5, GREY), [-0.12, 0.08, 0.14], [0.9, 0, 0.5]);
    add(g, Geometry.cylinder(0.025, 0.04, 0.36, 4, P.acc), [0.08, 0.3, -0.02], [-0.5, 0, 0]);
    glowColor = [1, 0.3, 0.6];
    cbox(glow, 0.08, 0.08, 0.05, glowColor, [0.04, 0.16, 0.19]);
  } else if (id === 'visor') {
    cbox(g, 0.34, 0.26, 0.34, P.main, [0, 0.13, 0]);
    cbox(g, 0.12, 0.06, 0.3, P.sub, [0, 0.28, -0.02]);
    for (const s of [-1, 1]) cbox(g, 0.06, 0.16, 0.16, P.sub, [s * 0.19, 0.13, -0.02]);
    cbox(g, 0.2, 0.06, 0.06, P.trim, [0, 0.02, 0.17]);
    glowColor = [0.4, 1, 1];
    cbox(glow, 0.3, 0.07, 0.04, glowColor, [0, 0.15, 0.18]);
  } else if (id === 'horned') {
    cbox(g, 0.28, 0.24, 0.3, P.main, [0, 0.12, 0]);
    add(g, Geometry.cone(0.06, 0.55, 5, P.acc), [0, 0.22, 0.12], [-0.45, 0, 0]);          // 이마 뿔
    for (const s of [-1, 1]) add(g, Geometry.cone(0.05, 0.3, 4, P.trim), [s * 0.14, 0.2, -0.04], [-0.3, 0, -s * 1.05]);
    cbox(g, 0.14, 0.08, 0.06, P.trim, [0, 0.02, 0.16]);
    glowColor = [1, 0.3, 0.3];
    for (const s of [-1, 1]) cbox(glow, 0.08, 0.04, 0.04, glowColor, [s * 0.07, 0.14, 0.16]);
  } else if (id === 'canopy') {
    // 전투기 조종석: 길쭉한 유리 덮개 + 틀
    cbox(g, 0.3, 0.08, 0.66, P.main, [0, 0.04, 0.08]);
    add(g, Geometry.icosphere(0.17, 1, GLASS), [0, 0.08, 0.1], [0, 0, 0], [0.95, 0.95, 2]);
    cbox(g, 0.28, 0.05, 0.05, P.trim, [0, 0.2, -0.02]);
    cbox(g, 0.1, 0.08, 0.2, P.sub, [0, 0.06, -0.3]);
    glowColor = [0.7, 1, 1];
    cbox(glow, 0.07, 0.04, 0.14, glowColor, [0.04, 0.24, 0.14]);
  } else if (id === 'periscope') {
    // 전차장 큐폴라: 둥근 해치 + 잠망경 + 기관총
    add(g, Geometry.cylinder(0.2, 0.22, 0.16, 8, P.main), [0, 0, 0]);
    add(g, Geometry.cylinder(0.14, 0.2, 0.06, 8, P.sub), [0, 0.16, 0]);
    cbox(g, 0.08, 0.32, 0.08, DARK, [0.06, 0.36, -0.04]);
    cbox(g, 0.14, 0.12, 0.2, STEEL, [0.06, 0.54, 0]);
    zcyl(g, 0.03, 0.34, DARK, [-0.12, 0.24, -0.02], 4);
    glowColor = [0.5, 1, 0.6];
    cbox(glow, 0.1, 0.06, 0.03, glowColor, [0.06, 0.55, 0.11]);
    cbox(glow, 0.2, 0.04, 0.03, glowColor, [0, 0.1, 0.215]);
  } else if (id === 'samurai') {
    // 사무라이 투구: 정수리 + 목가리개 + 볼가리개 + 금색 초승달 장식
    cbox(g, 0.3, 0.26, 0.3, P.main, [0, 0.13, 0.02]);
    add(g, Geometry.cylinder(0.12, 0.2, 0.12, 8, P.sub), [0, 0.22, 0]);
    add(g, box(0.5, 0.06, 0.26, P.sub), [0, 0.06, -0.16], [-0.5, 0, 0]);
    for (const s of [-1, 1]) add(g, box(0.06, 0.2, 0.3, P.sub), [s * 0.2, 0.06, 0.0], [0, 0, -s * 0.6]);
    cbox(g, 0.2, 0.1, 0.05, DARK, [0, 0.06, 0.18]);
    for (const s of [-1, 1]) add(g, box(0.05, 0.44, 0.04, P.acc), [s * 0.03, 0.24, 0.17], [0, 0, -s * 0.8]);
    add(g, Geometry.icosphere(0.05, 0, P.trim), [0, 0.25, 0.19]);
    glowColor = [1, 0.85, 0.35];
    for (const s of [-1, 1]) cbox(glow, 0.08, 0.04, 0.04, glowColor, [s * 0.07, 0.15, 0.17]);
  } else if (id === 'dome') {
    // 돔 센서: 반구 + 빙 둘러 빛나는 감지띠 + 작은 접시
    add(g, Geometry.cylinder(0.24, 0.26, 0.1, 10, P.main), [0, 0, 0]);
    add(g, Geometry.icosphere(0.24, 1, P.sub, { squashY: 0.8 }), [0, 0.14, 0]);
    add(g, Geometry.cylinder(0.02, 0.02, 0.2, 4, GREY), [0.1, 0.28, -0.06]);
    add(g, Geometry.cylinder(0.08, 0.02, 0.04, 6, P.acc), [0.1, 0.46, -0.06], [0.5, 0, 0]);
    add(glow, Geometry.cylinder(0.25, 0.25, 0.05, 10, glowColor, { caps: false }), [0, 0.11, 0]);
  } else if (id === 'skull') {
    // 해골: 뼈색 두개골 + 이빨 + 붉게 빛나는 눈구멍
    add(g, Geometry.icosphere(0.2, 1, BONE), [0, 0.2, -0.01], [0, 0, 0], [1, 0.95, 1.1]);
    cbox(g, 0.24, 0.1, 0.2, BONE, [0, 0.06, 0.06]);
    for (let i = -2; i <= 2; i++) cbox(g, 0.035, 0.05, 0.03, [1, 0.97, 0.9], [i * 0.045, 0.06, 0.17]);
    for (const s of [-1, 1]) cbox(g, 0.08, 0.07, 0.04, DARK, [s * 0.07, 0.19, 0.2]);
    cbox(g, 0.04, 0.05, 0.03, DARK, [0, 0.12, 0.2]);
    glowColor = [1, 0.25, 0.2];
    for (const s of [-1, 1]) cbox(glow, 0.04, 0.04, 0.02, glowColor, [s * 0.07, 0.19, 0.225]);
  } else {
    cbox(g, 0.3, 0.26, 0.32, P.main, [0, 0.13, 0.02]);
    cbox(g, 0.14, 0.08, 0.06, P.trim, [0, 0.0, 0.18]);
    for (const s of [-1, 1]) add(g, box(0.05, 0.3, 0.05, P.acc), [s * 0.04, 0.1, 0.19], [0, 0, -s * 0.95]);
    cbox(glow, 0.22, 0.06, 0.04, glowColor, [0, 0.15, 0.18]);
  }
  return { geo: g, glow, glowColor };
}
// 빈 팔 슬롯: 주먹 / 날개 아래 미사일(pylon) / 측면 기관총 포대(sponson)
function fistGeo(P, kind) {
  const g = new Geometry();
  if (kind === 'pylon') {
    cbox(g, 0.08, 0.16, 0.3, STEEL, [0, 0.1, 0]);
    zcyl(g, 0.06, 0.6, P.sub, [0, -0.02, -0.28]);
    add(g, Geometry.cone(0.06, 0.16, 6, P.acc), [0, -0.02, 0.32], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) cbox(g, 0.18, 0.02, 0.1, P.trim, [0, -0.02, -0.24], [0, 0, s * 0.8]);
  } else if (kind === 'sponson') {
    cbox(g, 0.22, 0.24, 0.34, STEEL, [0, 0, 0.04]);
    zcyl(g, 0.04, 0.3, DARK, [0, 0, 0.2], 4);
    cbox(g, 0.24, 0.05, 0.36, P.sub, [0, 0.14, 0.04]);
  } else { cbox(g, 0.26, 0.34, 0.32, P.main, [0, 0.1, 0.02]); cbox(g, 0.2, 0.14, 0.2, STEEL, [0, -0.1, 0.05]); }
  return g;
}

// ===== 무기 외형 (원점 = 손/어깨 장착점, 앞 = +Z) =====
export const WEAPON_MODELS = {
  // 경전차 포탑을 통째로 뜯어 붙인 모양
  cannon: (P) => {
    const g = new Geometry();
    cbox(g, 0.5, 0.3, 0.6, [0.38, 0.42, 0.36], [0, 0.2, -0.05]);
    cbox(g, 0.36, 0.2, 0.4, [0.3, 0.34, 0.28], [0, 0.4, -0.08]);
    zcyl(g, 0.08, 0.9, DARK, [0, 0.26, 0.55], 6);
    zcyl(g, 0.11, 0.14, [0.55, 0.32, 0.26], [0, 0.26, 0.98], 6);
    cbox(g, 0.52, 0.06, 0.16, P.acc, [0, 0.36, 0.2]);
    return { geo: g, muzzle: [0, 0.26, 1.1] };
  },
  mg: (P) => {
    const g = new Geometry();
    cbox(g, 0.24, 0.26, 0.62, DARK, [0, 0, 0.12]);
    cbox(g, 0.1, 0.1, 0.5, STEEL, [0, 0.03, 0.66]);
    xcyl(g, 0.14, 0.14, P.sub, [-0.16, -0.06, 0.1]);
    cbox(g, 0.26, 0.06, 0.3, P.acc, [0, 0.16, 0.05]);
    return { geo: g, muzzle: [0, 0, 1.0] };
  },
  shotgun: (P) => {
    const g = new Geometry();
    cbox(g, 0.32, 0.26, 0.6, STEEL, [0, 0, 0.1]);
    for (const s of [-1, 1]) zcyl(g, 0.07, 0.5, DARK, [s * 0.08, 0.02, 0.38]);
    cbox(g, 0.34, 0.08, 0.2, P.trim, [0, 0.16, 0.0]);
    return { geo: g, muzzle: [0, 0, 0.9] };
  },
  missile: (P) => {
    const g = new Geometry();
    cbox(g, 0.44, 0.38, 0.5, P.sub, [0, 0.22, -0.04]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) cbox(g, 0.1, 0.1, 0.04, P.trim, [-0.13 + i * 0.13, 0.12 + j * 0.15, 0.22]);
    cbox(g, 0.46, 0.06, 0.52, P.acc, [0, 0.44, -0.04]);
    return { geo: g, muzzle: [0, 0.22, 0.3] };
  },
  laser: (P) => {
    const g = new Geometry();
    zcyl(g, 0.13, 1.05, P.main, [0, 0, -0.1], 6);
    for (let i = 0; i < 3; i++) zcyl(g, 0.17, 0.08, DARK, [0, 0, 0.1 + i * 0.22], 6);
    cbox(g, 0.12, 0.2, 0.3, STEEL, [0, -0.18, 0.05]);
    const glow = new Geometry();
    zcyl(glow, 0.09, 0.08, [0.5, 1, 1], [0, 0, 0.95], 6);
    return { geo: g, glow, muzzle: [0, 0, 1.05] };
  },
  saber: (P) => {
    const g = new Geometry();
    cbox(g, 0.26, 0.32, 0.32, P.main, [0, 0.08, 0.02]);
    zcyl(g, 0.06, 0.32, GREY, [0, 0, 0.14]);
    const glow = new Geometry();
    cbox(glow, 0.1, 0.1, 1.5, [1, 0.45, 0.85], [0, 0.05, 1.18]);
    return { geo: g, glow, muzzle: [0, 0, 0.6], blade: true };
  },
  funnel: (P) => {
    const g = new Geometry();
    for (const s of [-1, 1]) add(g, Geometry.cone(0.14, 0.7, 4, P.sub), [s * 0.22, 0.1, 0], [0.25, 0, s * 0.2]);
    cbox(g, 0.5, 0.36, 0.2, STEEL, [0, 0.2, 0]);
    return { geo: g, muzzle: [0, 0.5, 0] };
  },
};
export const funnelBitGeo = (P) => cached('bit' + P.name, () => {
  const g = new Geometry();
  add(g, Geometry.cone(0.13, 0.5, 4, P.sub), [0, 0, -0.2], [Math.PI / 2, 0, 0]);
  cbox(g, 0.12, 0.12, 0.12, P.acc, [0, 0.06, -0.2]);
  return g;
});

// ===== 모듈 외형 (상체 기준, 프레임 크기에 맞춰 sx 배율) =====
export function moduleGeo(id, level, P, F = FRAMES.standard) {
  const g = new Geometry(); let glow = null, glowColor = null;
  const sx = F.slots.shR[0], top = F.headY;
  if (id === 'armor') {
    cbox(g, sx * 1.5, 0.2, 0.14, P.sub, [0, top - 0.1, 0.32]);
    for (const s of [-1, 1]) {
      cbox(g, 0.42, 0.1, 0.5, P.trim, [s * sx, top + 0.06, 0]);
      add(g, box(0.16, 0.46, 0.4, P.main), [s * 0.36, 0.0, 0.05], [0, 0, s * 0.18]);
      if (level >= 2) add(g, Geometry.cone(0.1, 0.32, 4, P.acc), [s * (sx + 0.06), top + 0.06, 0], [0, 0, -s * 0.3]);
    }
    if (level >= 3) cbox(g, 0.5, 0.3, 0.12, P.sub, [0, 0.5, 0.36]);
  } else if (id === 'booster') {
    cbox(g, 0.62, 0.5, 0.26, STEEL, [0, 0.82, -0.38]);
    const n = level >= 2 ? 4 : 2;
    glow = new Geometry(); glowColor = [1, 0.6, 0.2];
    for (let i = 0; i < n; i++) {
      const x = n === 2 ? (i ? 0.18 : -0.18) : -0.24 + i * 0.16;
      add(g, Geometry.cylinder(0.08, 0.11, 0.24, 6, DARK), [x, 0.42, -0.46]);
      add(glow, Geometry.cone(0.08, 0.3, 5, [1, 0.7, 0.3]), [x, 0.43, -0.46], [Math.PI, 0, 0]);
    }
    if (level >= 3) for (const s of [-1, 1]) add(g, box(0.1, 0.5, 0.36, P.sub), [s * 0.42, 0.6, -0.44], [0.3, 0, 0]);
  } else if (id === 'reactor') {
    glow = new Geometry(); glowColor = [0.4, 0.95, 1];
    add(glow, Geometry.icosphere(0.12 + level * 0.025, 0, [0.5, 1, 1]), [0, 0.66, 0.38]);
    cbox(g, 0.34, 0.06, 0.1, P.acc, [0, 0.82, 0.36]);
    if (level >= 2) for (const s of [-1, 1]) add(glow, box(0.06, 0.06, 0.06, [0.5, 1, 1]), [s * sx, top - 0.06, 0.22]);
  } else if (id === 'antenna') {
    add(g, Geometry.cylinder(0.025, 0.04, 0.7 + level * 0.15, 4, GREY), [0.14, top + 0.08, -0.08]);
    add(g, Geometry.cylinder(0.18, 0.04, 0.06, 6, P.main), [-0.22, top + 0.16, -0.06], [0.4, 0, 0.3]);
    glow = new Geometry(); glowColor = [1, 0.3, 0.3];
    add(glow, box(0.06, 0.06, 0.06, [1, 0.3, 0.3]), [0.14, top + 0.8 + level * 0.15, -0.08]);
  } else if (id === 'spike') {
    // 중장 메카의 보라색 어깨 장갑 + 가시
    for (const s of [-1, 1]) {
      cbox(g, 0.5, 0.36, 0.56, [0.36, 0.3, 0.44], [s * (sx + 0.08), top + 0.12, 0]);
      for (let i = 0; i < Math.min(3, level + 1); i++) add(g, Geometry.cone(0.08, 0.36, 4, [0.55, 0.32, 0.26]), [s * (sx + 0.12), top + 0.3, -0.16 + i * 0.16], [0, 0, -s * 0.45]);
    }
  } else if (id === 'shield') {
    const x = F.slots.armL[0] - 0.24;
    add(g, box(0.1, 0.8, 0.5, P.trim), [x, 0.04, 0.1], [0, 0, 0.08]);
    add(g, box(0.12, 0.5, 0.3, P.main), [x - 0.02, 0.18, 0.1], [0, 0, 0.08]);
    add(g, box(0.13, 0.12, 0.12, P.acc), [x - 0.03, 0.58, 0.12]);
  }
  return { geo: g, glow, glowColor };
}

export const SLOT_IDS = ['armR', 'armL', 'shR', 'shL', 'back'];
export const SLOT_KIND = { armR: 'arm', armL: 'arm', shR: 'shoulder', shL: 'shoulder', back: 'back' };

/**
 * 로드아웃으로 메카를 조립한다.
 * loadout: { legs, frame, head, paint, weapons:[{id, slot}], modules:{id: level} }
 * 메시마다 partKey('w:슬롯', 'm:모듈') 를 달아 둔다 → 장착 연출에서 새 부품만 숨겼다가 날려 보냄
 */
export function buildMech(loadout) {
  const P = PAINTS[loadout.transcend ? 'transcend' : loadout.paint] || PAINTS.rx;
  const L = LEGS[loadout.legs] || LEGS.walker;
  const F = FRAMES[loadout.frame] || FRAMES.standard;
  const headId = HEADS[loadout.head] ? loadout.head : 'vfin';
  const key = (k) => `${k}|${loadout.transcend ? 'transcend' : loadout.paint}`;
  const root = new Node('mech');
  const body = root.add(new Node('body'));
  const meshes = [], glows = [];
  const mk = (parent, geo, emissive = 0, partKey = null) => {
    const m = parent.add(new Mesh(geo, new Material({ emissive })));
    m.partKey = partKey;
    (emissive > 0 ? glows : meshes).push(m);
    return m;
  };

  // 다리
  // 다리 노드(legNodes)는 animateMech 가 매 프레임 rotation[0] 을 새로 정한다 (걷기 = 흔들기, 바퀴 = 굴리기)
  const legNodes = [];
  const hip = L.hip, lid = LEGS[loadout.legs] ? loadout.legs : 'walker';
  const leg = (pos, k, fn) => { const n = body.add(new Node('leg')); n.position = pos; mk(n, cached(key(k), fn)); legNodes.push(n); };
  if (lid === 'walker' || lid === 'reverse' || lid === 'stomper') {
    const big = lid === 'stomper';
    for (const s of [-1, 1]) leg([s * (big ? 0.36 : 0.26), hip, 0], lid + 'leg', () => (lid === 'walker' ? walkerLeg(P, hip) : big ? stomperLeg(P, hip) : reverseLeg(P, hip)));
    mk(body, cached(key(big ? 'hips-big' : 'hips'), () => hipsGeo(P, big))).position = [0, hip, 0];
  } else if (lid === 'quad') {
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) leg([sx * 0.34, hip, sz * 0.3], `quad${sx}${sz}`, () => quadLeg(P, hip, sx, sz));
    mk(body, cached(key('quadbody'), () => { const g = new Geometry(); cbox(g, 0.8, 0.32, 0.9, STEEL, [0, 0.04, 0]); cbox(g, 0.6, 0.12, 0.7, P.sub, [0, 0.24, 0]); cbox(g, 0.3, 0.14, 0.12, P.trim, [0, 0.02, 0.48]); return g; })).position = [0, hip, 0];
  } else if (lid === 'spider') {
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) leg([sx * 0.3, hip, sz * 0.3], `spider${sx}${sz}`, () => spiderLeg(P, hip, sx, sz));
    mk(body, cached(key('spiderbody'), () => spiderBodyGeo(P))).position = [0, hip, 0];
  } else if (lid === 'wheels') {
    for (const z of [0.62, -0.6]) leg([0, 0.34, z], 'wheel' + (z > 0 ? 'F' : 'R'), () => wheelGeo(P, z < 0));
    mk(body, cached(key('bike'), () => bikeGeo(P)));
  } else if (lid === 'treads') {
    mk(body, cached(key('treads'), () => treadGeo(P)));
  } else if (lid === 'tankbase') {
    mk(body, cached(key('tankbase'), () => tankBaseGeo(P)));
  } else if (lid === 'jet') {
    mk(body, cached(key('jet'), () => jetGeo(P)));
    mk(body, cached('jetglow', jetGlowGeo), 0.95);
  } else {
    mk(body, cached(key('hover'), () => hoverGeo(P)));
    mk(body, cached('hoverglow', () => { const g = new Geometry(); add(g, Geometry.cylinder(0.5, 0.5, 0.05, 8, [0.5, 0.9, 1]), [0, 0.12, 0]); return g; }), 0.9);
  }

  // 상체 (조준 방향으로 따로 회전)
  const upper = body.add(new Node('upper'));
  upper.position = [0, hip + (L.upperY ?? 0.1), 0];
  mk(upper, cached(key('frame-' + (loadout.frame || 'standard')), () => frameGeo(loadout.frame, P)));
  const head = upper.add(new Node('head'));
  head.position = [0, F.headY, 0];
  const hg = cached(key('head-' + headId), () => headGeo(headId, P));
  mk(head, hg.geo);
  mk(head, hg.glow, 1);

  // 모듈
  for (const [id, lv] of Object.entries(loadout.modules || {})) {
    if (!lv) continue;
    const m = cached(key(`mod-${id}-${lv}-${loadout.frame}`), () => moduleGeo(id, lv, P, F));
    if (m.geo.vertexCount) mk(upper, m.geo, 0, 'm:' + id);
    if (m.glow) mk(upper, m.glow, 0.95, 'm:' + id);
  }

  // 무기 슬롯
  const slotNodes = {}, slotInfo = {};
  for (const s of SLOT_IDS) { const n = upper.add(new Node(s)); n.position = [...F.slots[s]]; slotNodes[s] = n; }
  const used = new Set();
  for (const w of loadout.weapons || []) {
    const model = cached(key('w-' + w.id), () => WEAPON_MODELS[w.id](P));
    const n = slotNodes[w.slot];
    if (!n) continue;
    used.add(w.slot);
    const inner = n.add(new Node('weapon'));
    if (w.slot.startsWith('sh') && w.id !== 'missile') inner.position = [0, 0.16, 0];
    if (w.evo) inner.scale = [1.45, 1.45, 1.45];
    mk(inner, model.geo, 0, 'w:' + w.slot);
    const blade = model.glow ? mk(inner, model.glow, 0.9, 'w:' + w.slot) : null;
    slotInfo[w.slot] = { node: n, inner, muzzle: model.muzzle, blade };
  }
  for (const s of ['armR', 'armL']) if (!used.has(s)) mk(slotNodes[s], cached(key('fist-' + (F.fist || '')), () => fistGeo(P, F.fist)));

  // 세트 각성 / 초월 장식
  for (const sid of loadout.sets || []) {
    const s = cached(key(`set-${sid}-${loadout.frame}`), () => setGeo(sid, P, F.headY));
    if (s.geo.vertexCount) mk(upper, s.geo, 0, 'set:' + sid);
    if (s.glow.vertexCount) mk(upper, s.glow, 0.95, 'set:' + sid);
  }
  if (loadout.transcend) {
    const t = cached(`transcend-${loadout.frame}`, () => transcendGeo(F.headY));
    mk(upper, t.geo, 0, 'transcend'); mk(upper, t.glow, 1, 'transcend');
  }

  let bubble = null;
  if (loadout.modules?.shield) {
    bubble = root.add(new Mesh(cached('bubble', () => Geometry.icosphere(1.5, 1, [0.5, 0.9, 1])), new Material({ emissive: 0.8, rim: 0.9, castShadow: false, outline: false })));
    bubble.position = [0, 1.1, 0];
  }

  return {
    root, body, upper, head, legNodes, slotNodes, slotInfo, meshes, glows, bubble, hip, paint: P, legs: loadout.legs,
    muzzle(slot) {
      const si = slotInfo[slot];
      if (!si) return upper.worldPosition();
      const m = si.inner.world, p = si.muzzle;
      return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
    },
  };
}

// 격납고/카드 썸네일용: 부품 하나만 담은 노드
export function partPreview(kind, id, paint = 'rx') {
  const P = PAINTS[paint] || PAINTS.rx;
  const root = new Node('preview');
  const put = (geo, emissive = 0) => { if (geo && geo.vertexCount) root.add(new Mesh(geo, new Material({ emissive }))); };
  if (kind === 'head') { const h = headGeo(id, P); put(h.geo); put(h.glow, 1); }
  else if (kind === 'frame') put(frameGeo(id, P));
  else if (kind === 'legs') {
    const m = buildMech({ legs: id, paint, frame: 'standard', weapons: [], modules: {} });
    m.upper.visible = false;
    return m.root;
  } else if (kind === 'weapon') { const w = WEAPON_MODELS[id](P); put(w.geo); put(w.glow, 0.9); }
  else if (kind === 'module') { const m = moduleGeo(id, Math.min(2, MODULES[id].max), P); put(m.geo); put(m.glow, 0.95); if (id === 'reactor' || id === 'antenna') put(frameGeo('standard', P)); }
  return root;
}

/**
 * 메카 애니메이션 (플레이어/보스 공용)
 * st: { phase }, o: { move(0~1), dt, t, legs, aimRel, lean:[x,z] }
 */
export function animateMech(m, st, o) {
  const k = o.move, L = LEGS[o.legs] || LEGS.walker, ln = o.lean || [0, 0];
  const lim = (v, a) => Math.max(-a, Math.min(a, v));
  // 몸 기울기는 매 프레임 새로 정한다 (대시 숙임이 += 로 더해지므로 누적 방지)
  m.body.rotation[0] = m.body.rotation[2] = 0;
  if (L.anim === 'walk') {
    st.phase = (st.phase || 0) + o.dt * (4 + L.step * k) * (k > 0.05 ? 1 : 0);
    const sw = Math.sin(st.phase) * L.swing * k, n = m.legNodes;
    // 2족: 좌우 번갈아 / 4족: 대각선 짝 / 6족: 삼각 보행
    const grp = n.length === 2 ? [1, -1] : n.length === 4 ? [1, -1, -1, 1] : [1, -1, -1, 1, 1, -1];
    n.forEach((l, i) => { l.rotation[0] = sw * grp[i]; });
    m.body.position[1] = Math.abs(Math.cos(st.phase)) * L.bob * k;
  } else if (L.anim === 'roll') {
    m.body.position[1] = Math.sin(o.t * 30) * 0.015 * k;
  } else if (L.anim === 'wheel') {
    st.roll = ((st.roll || 0) + o.dt * k * 22) % (Math.PI * 2);
    for (const l of m.legNodes) l.rotation[0] = st.roll;
    m.body.position[1] = Math.sin(o.t * 24) * 0.01 * k;
    m.body.rotation[2] = lim(ln[1] * 1.8, 0.35);
  } else if (L.anim === 'jet') {
    // 떠서 기수를 숙이고 옆으로 뱅크
    m.body.position[1] = 0.24 + Math.sin(o.t * 4) * 0.05;
    m.body.rotation[0] = lim(ln[0] * 1.2, 0.4); m.body.rotation[2] = lim(ln[1] * 2.4, 0.6);
  } else {
    m.body.position[1] = 0.12 + Math.sin(o.t * 3) * 0.06;
    m.body.rotation[0] = ln[0]; m.body.rotation[2] = ln[1];
  }
  m.upper.rotation[1] = o.aimRel || 0;
}
