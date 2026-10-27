// 무기 정의 + 발사 로직 + 투사체 관리 (모든 탄은 InstancedMesh로 한 번에 그림)
//
//  새 무기 추가:
//   1) parts.js WEAPON_MODELS 에 외형 함수 추가
//   2) 아래 WEAPONS 에 { name, prefer, levels:[...] } 추가 + fire() 에 발사 분기
//   3) upgrades.js 는 WEAPONS 를 자동으로 읽어서 카드에 넣는다
//  starter: 격납고에서 고르는 시작 무기. 런 중 카드에는 내가 고른 시작 무기만 나온다 (강화/진화용)
//  prefer: arm(직접 조작) / shoulder / hip / back (자동 사격)

import { Geometry, InstancedMesh, Material, Mesh, m4 } from '../engine/index.js';
import { funnelBitGeo } from './parts.js';

const R = Math.random, rr = (a, b) => a + (b - a) * R();

// levels[i] = 레벨 i+1 의 수치. up = 그 레벨로 올릴 때 카드 설명
export const WEAPONS = {
  mg: {
    color: [1, 0.85, 0.3], name: '머신건', tag: 'MG', starter: true, prefer: 'arm', desc: '누르고 있으면 연사. 특수기: 부채꼴 탄막.',
    levels: [
      { dmg: 7, cd: 0.16, count: 1, pierce: 0 },
      { dmg: 9, cd: 0.15, count: 1, pierce: 0, up: '피해 +30%' },
      { dmg: 9, cd: 0.14, count: 2, pierce: 0, up: '총열 2개 (탄 2발)' },
      { dmg: 11, cd: 0.12, count: 2, pierce: 0, up: '피해, 연사 증가' },
      { dmg: 13, cd: 0.1, count: 3, pierce: 1, up: '탄 3발 + 관통' },
    ],
    range: 13,
  },
  shotgun: {
    color: [1, 0.55, 0.2], name: '샷건', tag: 'SG', starter: true, prefer: 'arm', desc: '근거리 산탄, 강한 넉백. 특수기: 슬러그 폭발.',
    levels: [
      { dmg: 6, cd: 0.95, pellets: 6 },
      { dmg: 7, cd: 0.9, pellets: 7, up: '산탄 +1, 피해 증가' },
      { dmg: 8, cd: 0.82, pellets: 8, up: '산탄 +1, 재장전 단축' },
      { dmg: 9, cd: 0.72, pellets: 10, up: '산탄 +2' },
      { dmg: 11, cd: 0.62, pellets: 12, up: '이중 장전 (산탄 12)' },
    ],
    range: 7.5,
  },
  missile: {
    color: [1, 0.42, 0.25], name: '미사일 포드', tag: 'MSL', starter: true, prefer: 'shoulder', desc: '어깨에 달려 자동으로 유도 미사일 발사.',
    levels: [
      { dmg: 16, cd: 1.7, count: 2, aoe: 1.8 },
      { dmg: 20, cd: 1.55, count: 2, aoe: 2.0, up: '피해, 폭발 범위 증가' },
      { dmg: 21, cd: 1.5, count: 3, aoe: 2.1, up: '미사일 +1' },
      { dmg: 25, cd: 1.4, count: 4, aoe: 2.3, up: '미사일 +1, 피해 증가' },
      { dmg: 28, cd: 1.3, count: 6, aoe: 2.7, up: '일제 사격 (6발)' },
    ],
    range: 17,
  },
  laser: {
    color: [0.45, 1, 1], name: '빔 라이플', tag: 'BEAM', starter: true, prefer: 'arm', desc: '모든 적을 관통하는 빔. 특수기: 메가 빔.',
    levels: [
      { dmg: 28, cd: 2.2, width: 0.55 },
      { dmg: 36, cd: 2.0, width: 0.65, up: '피해 증가, 빔 굵기 +' },
      { dmg: 44, cd: 1.8, width: 0.75, up: '충전 시간 단축' },
      { dmg: 54, cd: 1.6, width: 0.9, up: '피해 증가, 빔 굵기 +' },
      { dmg: 66, cd: 1.35, width: 1.1, up: '메가 빔 (최대 출력)' },
    ],
    range: 18,
  },
  saber: {
    color: [1, 0.4, 0.85], name: '빔 사벨', tag: 'SABER', starter: true, prefer: 'arm', desc: '3단 콤보 베기, 마지막 타격이 적을 띄운다. 특수기: 회전 베기.',
    levels: [
      { dmg: 26, cd: 1.1, radius: 2.7, arc: 2.6 },
      { dmg: 33, cd: 1.0, radius: 2.9, arc: 2.8, up: '피해 증가, 범위 +' },
      { dmg: 40, cd: 0.92, radius: 3.1, arc: 3.2, up: '휘두르는 각도 증가' },
      { dmg: 48, cd: 0.85, radius: 3.3, arc: 3.6, up: '피해, 범위 증가' },
      { dmg: 60, cd: 0.75, radius: 3.7, arc: 6.3, up: '회전 베기 (360°)' },
    ],
    range: 3.4,
  },
  flamer: {
    color: [1, 0.5, 0.12], name: '화염 방사기', tag: 'FLAME', starter: true, prefer: 'arm', desc: '누르고 있으면 부채꼴로 불길을 뿜는다. 불붙은 적은 계속 탄다. 특수기: 화염 폭풍.',
    levels: [
      { dmg: 5, cd: 0.1, cone: 0.75, burn: 6 },
      { dmg: 6, cd: 0.1, cone: 0.8, burn: 8, up: '피해, 화상 증가' },
      { dmg: 7, cd: 0.09, cone: 0.9, burn: 9, up: '불길 폭 +' },
      { dmg: 9, cd: 0.085, cone: 0.95, burn: 12, up: '피해, 화상 증가' },
      { dmg: 11, cd: 0.08, cone: 1.1, burn: 15, far: 1.2, up: '고압 노즐 (불길 폭, 사거리 +)' },
    ],
    range: 6,
  },
  rod: {
    color: [1, 0.65, 0.2], name: '히트 로드', tag: 'ROD', starter: true, prefer: 'arm', desc: '중거리를 휩쓰는 채찍. 맞은 적을 끌어당긴다. 특수기: 회전 채찍.',
    levels: [
      { dmg: 17, cd: 0.7, reach: 6, arc: 1.3 },
      { dmg: 21, cd: 0.65, reach: 6.4, arc: 1.4, up: '피해 증가, 길이 +' },
      { dmg: 25, cd: 0.6, reach: 6.8, arc: 1.6, up: '휘두르는 각도 증가' },
      { dmg: 30, cd: 0.55, reach: 7.2, arc: 1.8, up: '피해, 길이 증가' },
      { dmg: 36, cd: 0.5, reach: 7.8, arc: 2.1, double: true, up: '이중 채찍 (왕복 2회)' },
    ],
    range: 7,
  },

  // ===== 런 무기: 레벨업 카드로만 얻는다. 전부 자동 사격 =====
  //  passive: 쿨다운 없이 계속 도는 무기 (auto() 에서 건너뜀)
  saw: {
    color: [0.85, 0.9, 1], name: '회전 톱날', tag: 'SAW', prefer: 'hip', passive: true, desc: '톱날이 기체 주위를 돌며 닿는 적을 갈아버린다.',
    levels: [
      { dmg: 10, blades: 2, radius: 2.4, spin: 3.2 },
      { dmg: 13, blades: 2, radius: 2.6, spin: 3.4, up: '피해 증가, 회전 반경 +' },
      { dmg: 14, blades: 3, radius: 2.7, spin: 3.6, up: '톱날 +1' },
      { dmg: 18, blades: 4, radius: 2.9, spin: 3.9, up: '톱날 +1, 피해 증가' },
      { dmg: 22, blades: 5, radius: 3.2, spin: 4.3, up: '톱날 5개 (반경, 회전 증가)' },
    ],
    range: 4,
  },
  tesla: {
    color: [0.55, 0.85, 1], name: '테슬라 코일', tag: 'TESLA', prefer: 'shoulder', desc: '번개가 적에서 적으로 튀며 연쇄 감전시킨다.',
    levels: [
      { dmg: 18, cd: 1.4, chains: 3, jump: 4 },
      { dmg: 22, cd: 1.3, chains: 4, jump: 4.2, up: '피해 증가, 연쇄 +1' },
      { dmg: 26, cd: 1.2, chains: 5, jump: 4.5, up: '연쇄 +1, 충전 단축' },
      { dmg: 31, cd: 1.1, chains: 6, jump: 4.8, up: '피해 증가, 연쇄 +1' },
      { dmg: 38, cd: 0.9, chains: 8, jump: 5.2, up: '과부하 (연쇄 8회)' },
    ],
    range: 10,
  },
  mine: {
    color: [1, 0.3, 0.3], name: '지뢰 살포기', tag: 'MINE', prefer: 'hip', desc: '주위에 지뢰를 뿌린다. 적이 밟으면 폭발.',
    levels: [
      { dmg: 30, cd: 2.2, count: 1, aoe: 2.2 },
      { dmg: 36, cd: 2.0, count: 2, aoe: 2.3, up: '지뢰 +1' },
      { dmg: 44, cd: 1.9, count: 2, aoe: 2.6, up: '피해, 폭발 범위 증가' },
      { dmg: 50, cd: 1.7, count: 3, aoe: 2.8, up: '지뢰 +1' },
      { dmg: 62, cd: 1.5, count: 4, aoe: 3.2, up: '살포량 증가 (4개)' },
    ],
    range: 12,
  },
  disc: {
    color: [0.4, 1, 0.9], name: '부메랑 디스크', tag: 'DISC', prefer: 'shoulder', desc: '날아갔다 돌아오는 원반. 오가는 길의 적을 모두 벤다.',
    levels: [
      { dmg: 14, cd: 1.6, count: 1, size: 1 },
      { dmg: 18, cd: 1.5, count: 1, size: 1.15, up: '피해 증가, 크기 +' },
      { dmg: 20, cd: 1.4, count: 2, size: 1.15, up: '디스크 +1' },
      { dmg: 25, cd: 1.3, count: 2, size: 1.3, up: '피해 증가, 크기 +' },
      { dmg: 30, cd: 1.1, count: 3, size: 1.45, up: '디스크 3개' },
    ],
    range: 11,
  },
  stomp: {
    color: [1, 0.8, 0.45], name: '충격파 발생기', tag: 'QUAKE', prefer: 'hip', desc: '땅을 내려찍어 주위의 적을 날려 보낸다.',
    levels: [
      { dmg: 22, cd: 2.6, radius: 3.6, waves: 1 },
      { dmg: 28, cd: 2.4, radius: 3.9, waves: 1, up: '피해 증가, 범위 +' },
      { dmg: 34, cd: 2.2, radius: 4.3, waves: 1, up: '범위 +, 재충전 단축' },
      { dmg: 42, cd: 2.0, radius: 4.7, waves: 1, up: '피해, 범위 증가' },
      { dmg: 52, cd: 1.7, radius: 5.2, waves: 2, up: '이중 충격파' },
    ],
    range: 5,
  },
  gravity: {
    color: [0.75, 0.45, 1], name: '중력 우물', tag: 'GRAV', prefer: 'back', desc: '적이 몰린 곳에 중력장을 열어 빨아들이며 짓누른다.',
    levels: [
      { dmg: 14, cd: 5.5, radius: 3.2, dur: 2.5 },
      { dmg: 18, cd: 5.2, radius: 3.4, dur: 2.7, up: '피해 증가' },
      { dmg: 22, cd: 4.8, radius: 3.8, dur: 3.0, up: '범위, 지속 시간 증가' },
      { dmg: 27, cd: 4.4, radius: 4.1, dur: 3.2, up: '피해 증가, 재충전 단축' },
      { dmg: 34, cd: 3.8, radius: 4.6, dur: 3.6, pop: 4, up: '붕괴: 끝날 때 대폭발' },
    ],
    range: 13,
  },
  gauss: {
    color: [1, 0.88, 0.35], name: '가우스 캐논', tag: 'GAUSS', prefer: 'shoulder', desc: '가장 튼튼한 적을 노려 방 끝까지 꿰뚫는 탄을 쏜다.',
    levels: [
      { dmg: 42, cd: 3.2, width: 0.45 },
      { dmg: 52, cd: 3.0, width: 0.5, up: '피해 증가' },
      { dmg: 64, cd: 2.8, width: 0.55, up: '충전 단축, 피해 증가' },
      { dmg: 78, cd: 2.5, width: 0.65, up: '피해 증가, 탄 굵기 +' },
      { dmg: 100, cd: 2.2, width: 0.75, crit: 0.3, up: '치명타 확률 +30%' },
    ],
    range: 22,
  },
  turret: {
    color: [1, 0.35, 0.6], name: '회전 레이저 포탑', tag: 'TURRET', prefer: 'back', passive: true, desc: '등의 포탑이 빔을 켠 채 빙글빙글 돈다.',
    levels: [
      { dmg: 12, beams: 1, len: 5, spin: 3 },
      { dmg: 15, beams: 1, len: 5.5, spin: 3.2, up: '피해 증가, 길이 +' },
      { dmg: 16, beams: 2, len: 5.5, spin: 3.2, up: '빔 +1 (반대쪽)' },
      { dmg: 21, beams: 2, len: 6.2, spin: 3.4, up: '피해, 길이 증가' },
      { dmg: 26, beams: 3, len: 7, spin: 3.6, up: '빔 3줄' },
    ],
    range: 7,
  },
  cluster: {
    color: [1, 0.5, 0.3], name: '집속탄 박격포', tag: 'CLUSTER', prefer: 'shoulder', desc: '포탄을 높이 쏘아 올린다. 떨어지면 자탄이 흩어져 연달아 터진다.',
    levels: [
      { dmg: 24, cd: 2.6, bomblets: 4, aoe: 1.6, shells: 1 },
      { dmg: 30, cd: 2.4, bomblets: 5, aoe: 1.7, shells: 1, up: '피해 증가, 자탄 +1' },
      { dmg: 34, cd: 2.2, bomblets: 6, aoe: 1.9, shells: 1, up: '자탄 +1, 범위 증가' },
      { dmg: 40, cd: 2.0, bomblets: 8, aoe: 2.0, shells: 1, up: '자탄 +2' },
      { dmg: 48, cd: 1.7, bomblets: 9, aoe: 2.2, shells: 2, up: '이중 포격 (포탄 2발)' },
    ],
    range: 15,
  },
  ricochet: {
    color: [0.75, 1, 0.45], name: '도탄 리볼버', tag: 'BOUNCE', prefer: 'hip', desc: '맞으면 다음 적에게 튕겨 가는 탄. 튕길 때마다 강해진다.',
    levels: [
      { dmg: 12, cd: 0.9, count: 1, bounce: 3 },
      { dmg: 15, cd: 0.85, count: 1, bounce: 4, up: '피해 증가, 도탄 +1' },
      { dmg: 16, cd: 0.8, count: 2, bounce: 4, up: '탄 +1' },
      { dmg: 20, cd: 0.75, count: 2, bounce: 6, up: '도탄 +2, 피해 증가' },
      { dmg: 24, cd: 0.6, count: 3, bounce: 7, up: '탄 3발, 도탄 +1' },
    ],
    range: 11,
  },
  // 노획 무기: 카드로는 안 나오고 적에게서 뜯어내야 얻는다
  cannon: {
    color: [1, 0.62, 0.25], name: '전차 포신', tag: 'CANNON', prefer: 'shoulder', salvage: true, desc: '경전차에서 뜯어낸 포. 어깨에서 자동으로 폭발탄을 쏜다.',
    levels: [
      { dmg: 38, cd: 1.7, aoe: 1.8 },
      { dmg: 46, cd: 1.55, aoe: 2.0, up: '피해, 폭발 범위 증가' },
      { dmg: 54, cd: 1.4, aoe: 2.2, up: '장전 단축' },
      { dmg: 64, cd: 1.25, aoe: 2.5, up: '피해, 폭발 범위 증가' },
      { dmg: 80, cd: 1.05, aoe: 2.9, up: '중포탄 (최대 출력)' },
    ],
    range: 15,
  },
  funnel: {
    color: [0.45, 1, 0.95], name: '판넬 비트', tag: 'BIT', prefer: 'back', desc: '등에서 나온 비트가 주위를 돌며 자동 사격.',
    levels: [
      { dmg: 8, cd: 0.95, bits: 2 },
      { dmg: 9, cd: 0.9, bits: 3, up: '비트 +1' },
      { dmg: 11, cd: 0.85, bits: 3, up: '피해, 연사 증가' },
      { dmg: 12, cd: 0.8, bits: 4, up: '비트 +1' },
      { dmg: 15, cd: 0.7, bits: 6, up: '비트 6기 편대' },
    ],
    range: 12,
  },
};
export const MAX_LEVEL = 5;

// ---- 무기 진화: 최대 레벨 무기 + 특정 몸통 부품 → 상위 무기 ----
export const EVOLUTIONS = {
  mg:      { need: 'reactor', name: '개틀링 포대', tag: 'GATLING', desc: '총열 4개가 쉬지 않고 돈다. 관통 2.', stats: { dmg: 15, cd: 0.055, count: 4, pierce: 2 } },
  shotgun: { need: 'armor', name: '드래곤 브레스', tag: 'DRAGON', desc: '산탄 하나하나가 작은 폭발을 일으킨다.', stats: { dmg: 13, cd: 0.5, pellets: 14, boom: 1.1 } },
  missile: { need: 'antenna', name: '스웜 미사일', tag: 'SWARM', desc: '미사일 10발 일제 사격, 폭발 범위 대폭 증가.', stats: { dmg: 32, cd: 1.0, count: 10, aoe: 3.1 } },
  laser:   { need: 'booster', name: '하이퍼 메가 빔', tag: 'HYPER', desc: '빔 3줄을 부채꼴로 쏜다.', stats: { dmg: 95, cd: 1.05, width: 1.5, fan: 3 } },
  saber:   { need: 'shield', name: '광자 대검', tag: 'PHOTON', desc: '거대한 칼날, 휘두를 때마다 참격파가 날아간다.', stats: { dmg: 88, cd: 0.6, radius: 5.0, arc: 6.3, wave: true } },
  funnel:  { need: 'reactor', name: '판넬 폭풍', tag: 'STORM', desc: '비트 8기가 폭풍처럼 쏟아붓는다.', stats: { dmg: 19, cd: 0.32, bits: 8 } },
  flamer:  { need: 'reactor', name: '지옥불', tag: 'INFERNO', desc: '푸른 불길이 두 배 멀리 뻗고, 화상이 훨씬 오래 탄다.', stats: { dmg: 17, cd: 0.065, cone: 1.3, burn: 26, far: 1.7 } },
  rod:     { need: 'antenna', name: '뇌룡 채찍', tag: 'THUNDER', desc: '길이 10, 왕복 2회. 맞은 적을 감전시켜 멈춘다.', stats: { dmg: 60, cd: 0.42, reach: 10, arc: 2.5, double: true, stun: 0.7 } },
  saw:     { need: 'armor', name: '분쇄 톱니', tag: 'GRINDER', desc: '거대한 톱날 8개가 두 겹으로 돈다.', stats: { dmg: 34, blades: 8, radius: 3.8, spin: 5, big: 1.5, ring2: true } },
  tesla:   { need: 'antenna', name: '뇌신 코일', tag: 'ZEUS', desc: '번개 두 줄기가 14번씩 튀며 적을 굳힌다.', stats: { dmg: 52, cd: 0.7, chains: 14, jump: 6, forks: 2, stun: 0.6 } },
  mine:    { need: 'booster', name: '연쇄 지뢰원', tag: 'FIELD', desc: '지뢰 6개씩 살포. 하나가 터지면 주변 지뢰도 따라 터진다.', stats: { dmg: 85, cd: 1.1, count: 6, aoe: 3.4, chain: true } },
  disc:    { need: 'shield', name: '광륜', tag: 'HALO', desc: '빛나는 대형 원반 4개를 던진다.', stats: { dmg: 46, cd: 0.8, count: 4, size: 1.9 } },
  stomp:   { need: 'armor', name: '지진 발생기', tag: 'TREMOR', desc: '충격파 3겹이 연달아 퍼지며 적을 띄운다.', stats: { dmg: 80, cd: 1.4, radius: 6.2, waves: 3 } },
  gravity: { need: 'reactor', name: '블랙홀', tag: 'HOLE', desc: '거대한 블랙홀이 모든 걸 빨아들인 뒤 터진다.', stats: { dmg: 52, cd: 3.2, radius: 6.2, dur: 4, pop: 6 } },
  gauss:   { need: 'antenna', name: '초전자포', tag: 'RAILGUN', desc: '굵은 탄 3발을 부채꼴로. 치명타 확률 +40%.', stats: { dmg: 150, cd: 1.6, width: 1.2, crit: 0.4, fan: 3 } },
  turret:  { need: 'shield', name: '광자 등대', tag: 'LIGHTHOUSE', desc: '긴 빔 4줄이 빠르게 돈다.', stats: { dmg: 40, beams: 4, len: 9.5, spin: 4.2 } },
  cluster: { need: 'booster', name: '융단 폭격', tag: 'CARPET', desc: '포탄 3발, 자탄 14개가 방을 덮는다.', stats: { dmg: 62, cd: 1.3, bomblets: 14, aoe: 2.4, shells: 3 } },
  ricochet: { need: 'reactor', name: '무한 도탄', tag: 'PINBALL', desc: '탄 4발이 12번씩 튕겨 다닌다.', stats: { dmg: 34, cd: 0.45, count: 4, bounce: 12 } },
};
export const lvOf = (w) => (w.evo ? EVOLUTIONS[w.id].stats : WEAPONS[w.id].levels[w.level - 1]);
export const weaponName = (w) => (w.evo ? EVOLUTIONS[w.id].name : WEAPONS[w.id].name);

// 상자를 원점 중심 +Z 방향으로 늘린 단위 막대 (탄/빔에 사용)
function rodGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(1, 1, 1), { position: [0, -0.5, 0] });
  return g;
}
function beamGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(1, 1, 1), { position: [0, -0.5, 0.5] }); // z 0~1
  return g;
}
// ---- 필드 오브젝트 외형 (톱날, 지뢰, 원반, 중력 우물, 박격포탄) ----
const ring = (g, n, r, fn) => { for (let i = 0; i < n; i++) fn((i / n) * Math.PI * 2, r); };
function sawGeo() {
  const g = new Geometry();
  g.merge(Geometry.cylinder(0.42, 0.42, 0.06, 10, [0.75, 0.77, 0.8]));
  ring(g, 8, 0.42, (a, r) => g.merge(Geometry.box(0.16, 0.06, 0.2, [0.9, 0.92, 0.95]), { position: [Math.sin(a) * r, 0, Math.cos(a) * r], rotation: [0, a + 0.5, 0] }));
  g.merge(Geometry.cylinder(0.14, 0.14, 0.12, 6, [0.95, 0.6, 0.2]), { position: [0, -0.03, 0] });
  return g;
}
function mineGeo() {
  const g = new Geometry();
  g.merge(Geometry.cylinder(0.3, 0.34, 0.12, 8, [0.32, 0.34, 0.3]));
  g.merge(Geometry.cylinder(0.18, 0.2, 0.06, 6, [0.5, 0.5, 0.45]), { position: [0, 0.12, 0] });
  g.merge(Geometry.box(0.1, 0.06, 0.1, [1, 0.25, 0.2]), { position: [0, 0.18, 0] });
  return g;
}
function discGeo() {
  const g = new Geometry();
  g.merge(Geometry.cylinder(0.5, 0.5, 0.05, 10, [0.55, 0.95, 1]));
  ring(g, 3, 0.5, (a, r) => g.merge(Geometry.box(0.12, 0.07, 0.36, [1, 1, 1]), { position: [Math.sin(a) * r, -0.01, Math.cos(a) * r], rotation: [0, a + 1.2, 0] }));
  g.merge(Geometry.cylinder(0.16, 0.16, 0.08, 6, [0.25, 0.3, 0.4]), { position: [0, -0.015, 0] });
  return g;
}
function shellGeo() {
  const g = new Geometry();
  g.merge(Geometry.icosphere(0.22, 1, [0.35, 0.36, 0.32], { squashY: 1.3 }));
  g.merge(Geometry.cylinder(0.23, 0.23, 0.08, 8, [1, 0.75, 0.25]), { position: [0, -0.04, 0] });
  return g;
}

export class Shots {
  constructor(game) {
    this.game = game;
    const sc = game.scene;
    this.list = [];
    this.enemyList = [];
    this.bulletMesh = sc.add(new InstancedMesh(rodGeo(), new Material({ emissive: 1.4, castShadow: false }), 500));
    const mg = new Geometry();
    mg.merge(Geometry.cylinder(0.07, 0.07, 0.4, 5, [0.9, 0.9, 0.92]), { position: [0, 0, -0.2], rotation: [Math.PI / 2, 0, 0] });
    mg.merge(Geometry.cone(0.07, 0.16, 5, [0.9, 0.25, 0.2]), { position: [0, 0, 0.2], rotation: [Math.PI / 2, 0, 0] });
    this.missileMesh = sc.add(new InstancedMesh(mg, new Material({ castShadow: false, emissive: 0.3 }), 120));
    // 적 탄: 흰 심 + 디더링된 색 껍질 + 바닥 그림자 (어디로 오는지 잘 보이게)
    this.enemyCore = sc.add(new InstancedMesh(Geometry.icosphere(0.17, 1), new Material({ emissive: 1, castShadow: false, outline: false }), 300));
    this.enemyMesh = sc.add(new InstancedMesh(Geometry.icosphere(0.32, 1), new Material({ emissive: 1, castShadow: false }), 300));
    const disc = new Geometry();
    for (let i = 0; i < 10; i++) { const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2; disc.quad([0, 0, 0], [0, 0, 0], [Math.cos(a1) * 0.3, 0, Math.sin(a1) * 0.3], [Math.cos(a0) * 0.3, 0, Math.sin(a0) * 0.3], [0, 0, 0], null, [0, 1, 0]); }
    this.enemyShadow = sc.add(new InstancedMesh(disc, new Material({ color: [0.05, 0.02, 0.06], castShadow: false, outline: false }), 300));
    // 빔 풀
    this.beams = [];
    const bg = beamGeo();
    for (let i = 0; i < 6; i++) {
      const m = sc.add(new Mesh(bg, new Material({ color: [0.5, 1, 1], emissive: 1, outline: false, castShadow: false })));
      const core = sc.add(new Mesh(bg, new Material({ color: [1, 1, 1], emissive: 1, outline: false, castShadow: false })));
      m.visible = core.visible = false;
      this.beams.push({ m, core, t: 0, life: 0 });
    }
    // 필드 오브젝트: 지뢰 / 부메랑 원반 / 중력 우물 / 박격포탄 (방을 옮기면 clear 로 사라짐)
    this.mines = []; this.discs = []; this.wells = []; this.lobs = [];
    this.mineMesh = sc.add(new InstancedMesh(mineGeo(), new Material(), 40));
    this.discMesh = sc.add(new InstancedMesh(discGeo(), new Material({ emissive: 0.6, castShadow: false }), 16));
    this.wellMesh = sc.add(new InstancedMesh(Geometry.icosphere(0.5, 1, [1, 1, 1]), new Material({ emissive: 1, castShadow: false, rim: 0.8 }), 8));
    this.wellCore = sc.add(new InstancedMesh(Geometry.icosphere(0.32, 1, [0.04, 0.02, 0.08]), new Material({ castShadow: false, outline: false }), 8));
    this.lobMesh = sc.add(new InstancedMesh(shellGeo(), new Material({ castShadow: false }), 16));
  }
  // src: 쏜 무기 id (런 통계용, runhooks.js 의 game.dmgSrc). 나중에 맞힐 때 다시 dmgSrc 로 돌려놓는다
  mine(o) { if (this.mines.length >= 36) this.mines.shift(); this.mines.push({ t: 0, life: 14, fuse: -1, src: this.game.dmgSrc, ...o }); }
  disc(o) { if (this.discs.length < 16) this.discs.push({ t: 0, back: false, hits: new Map(), src: this.game.dmgSrc, ...o }); }
  well(o) { if (this.wells.length < 8) this.wells.push({ t: 0, tick: 0, src: this.game.dmgSrc, ...o }); }
  lob(o) { if (this.lobs.length < 16) this.lobs.push({ t: 0, src: this.game.dmgSrc, ...o }); }

  // ---- 플레이어 탄 ----
  add(o) { if (this.list.length < 480) this.list.push({ pierce: 0, knock: 2, r: 0.25, life: 1, hit: null, src: this.game.dmgSrc, ...o }); }

  enemyShot(x, y, z, vx, vz, dmg, kind = 'shell') {
    if (this.enemyList.length >= 290) return;
    this.enemyList.push({ x, y, z, vx, vz, dmg, kind, life: 4, t: 0 });
    this.game.sfx.play('eshot');
  }

  beam(from, yaw, len, width, color) {
    const b = this.beams.find((q) => !q.m.visible) || this.beams[0];
    const vk = this.game.weapons?.vk(this.game.dmgSrc) || 1;
    width *= 1.25 * Math.sqrt(vk);
    Object.assign(b, { t: 0, life: 0.3, from: [...from], yaw, len, width });
    b.m.material.color = color;
    b.m.visible = b.core.visible = true;
    this.updateBeam(b);
    // 빔 줄기를 따라 점이 튄다 + 끝에 섬광
    const fx = this.game.fx, dx = Math.sin(yaw), dz = Math.cos(yaw), ramp = [[1, 1, 1], color, color.map((v) => v * 0.55)];
    for (let d = 0.6; d < len; d += 0.45) { const sp = rr(1.5, 4) * vk, a = rr(-1, 1) > 0 ? 1 : -1; fx.pxr.emit({ position: [from[0] + dx * d, from[1] + rr(-0.15, 0.15) * width, from[2] + dz * d], velocity: [dz * sp * a, rr(-1, 2), -dx * sp * a], life: rr(0.12, 0.26), size: Math.round(rr(1, 3)), sizeEnd: 1, ramp, emissive: 0.7, hard: true }); }
    fx.starPx(from, 8, color, 0.9 * vk, 0.14, Math.random());
    fx.starPx([from[0] + dx * len, from[1], from[2] + dz * len], 4, color, 0.7 * vk, 0.14, Math.random());
  }
  updateBeam(b) {
    const k = b.t / b.life, w = b.width * (1 - k * k) + 0.02;
    b.m.position = b.core.position = b.from;
    b.m.rotation = b.core.rotation = [0, b.yaw, 0];
    b.m.scale = [w, w, b.len];
    b.core.scale = [w * 0.45, w * 0.45, b.len];
  }

  update(dt) {
    const g = this.game, en = g.enemies, fx = g.fx, p = g.player;
    let nb = 0, nm = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      g.dmgSrc = s.src;
      s.life -= dt;
      if (s.homing) {
        if (!s.target || s.target.dead || s.target.hp <= 0) s.target = en.nearest(s.x, s.z, 14);
        if (s.target && s.age > 0.12) {
          const dx = s.target.x - s.x, dz = s.target.z - s.z, a = Math.atan2(dx, dz), cur = Math.atan2(s.vx, s.vz);
          let da = ((a - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const turn = Math.max(-1, Math.min(1, da)) * 7 * dt, na = cur + turn, sp = Math.min(s.maxSpeed, Math.hypot(s.vx, s.vz) + 30 * dt);
          s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp;
        }
        s.age += dt;
        s.y += (1.0 - s.y) * Math.min(1, dt * 4);
        if (R() < 0.8) fx.trail.emit({ position: [s.x, s.y, s.z], velocity: [rr(-0.3, 0.3), rr(0, 0.4), rr(-0.3, 0.3)], life: rr(0.18, 0.32), size: 2, sizeEnd: 1, color: [1, 0.85, 0.5], colorEnd: [0.9, 0.3, 0.15], emissive: 1 });
        if (R() < 0.35) fx.smoke.emit({ position: [s.x, s.y, s.z], velocity: [0, 0.3, 0], life: 0.5, size: 2, sizeEnd: 3, color: [0.5, 0.48, 0.5], colorEnd: [0.25, 0.24, 0.27] });
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const RM = g.rooms;
      let dead = s.life <= 0 || Math.abs(s.x) > RM.hx + 4 || Math.abs(s.z) > RM.hz + 4;
      if (!dead) {
        let bounced = false;
        en.each(s.x, s.z, s.r, (e) => {
          if (dead || bounced || (s.hit && s.hit.has(e))) return;
          if (s.aoe) { dead = true; return; }
          const len = Math.hypot(s.vx, s.vz) || 1;
          en.hit(e, s.dmg, s.vx / len, s.vz / len, s.knock, { crit: s.crit, quiet: s.quiet });
          fx.hitSpark([s.x, s.y, s.z], s.color, 3);
          g.sfx.play('tink');
          // 도탄: 아직 안 맞은 가장 가까운 적에게 튕겨 간다 (튕길 때마다 피해 +10%)
          if (s.bounce > 0) {
            (s.hit ||= new Set()).add(e);
            let nx = null, bd = 49;
            en.each(e.x, e.z, 7, (o) => { if (s.hit.has(o)) return; const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2; if (d < bd) { bd = d; nx = o; } });
            if (nx) {
              const dx = nx.x - s.x, dz = nx.z - s.z, d = Math.hypot(dx, dz) || 1;
              s.vx = (dx / d) * len; s.vz = (dz / d) * len; s.life = 0.6; s.bounce--; s.dmg *= 1.1; bounced = true;
              fx.sparks.emit({ position: [s.x, s.y, s.z], velocity: [rr(-2, 2), rr(1, 3), rr(-2, 2)], life: 0.2, size: 2, sizeEnd: 1, color: [1, 1, 0.8], colorEnd: s.color, emissive: 1, gravity: 0.3 });
              return;
            }
          }
          if (s.pierce-- > 0) { (s.hit ||= new Set()).add(e); } else dead = true;
        });
        if (dead && s.aoe) this.explodeAt(s);
      } else if (s.aoe) this.explodeAt(s);
      if (dead) { this.list.splice(i, 1); continue; }
      const yaw = Math.atan2(s.vx, s.vz);
      if (s.homing) {
        this.missileMesh.setAt(nm++, m4.fromTRS([s.x, s.y, s.z], [0, yaw, 0], [1.7, 1.7, 1.7]), [1, 1, 1], 0);
        if (dt > 0) { const bx = s.x - Math.sin(yaw) * 0.4, bz = s.z - Math.cos(yaw) * 0.4; g.fx.pxr.emit({ position: [bx, s.y, bz], velocity: [0, 0, 0], life: 0.08, size: 3, sizeEnd: 2, ramp: [[1, 1, 0.7], [1, 0.6, 0.2]], emissive: 0.8, hard: true }); if (Math.random() < 0.5) g.fx.px.emit({ position: [bx, s.y, bz], velocity: [0, 0.8, 0], life: 0.45, size: 3, sizeEnd: 1, ramp: [[0.55, 0.52, 0.55], [0.38, 0.36, 0.4], [0.25, 0.24, 0.28]], emissive: 0, gravity: -0.05, hard: true }); }
      }
      else {
        const sc = s.scale || [0.16, 0.16, 0.8], vk = s.vk || (s.vk = g.weapons?.vk(s.src) || 1);
        this.bulletMesh.setAt(nb++, m4.fromTRS([s.x, s.y, s.z], [0, yaw, 0], [sc[0] * 1.4 * vk, sc[1] * 1.4 * vk, sc[2] * 1.25 * Math.sqrt(vk)]), s.color, 1);
        // 꼬리: 지나간 자리에 탄 색 점이 잠깐 남는다 (내 탄이 어디로 가는지 또렷하게)
        if (dt > 0 && (s.trailK = (s.trailK || 0) + 1) % (this.list.length > 160 ? 3 : 1) === 0) g.fx.pxr.emit({ position: [s.x, s.y, s.z], velocity: [0, 0, 0], life: 0.08 + 0.03 * vk, size: Math.round((sc[0] > 0.22 ? 3 : 2) * Math.min(1.6, vk)), sizeEnd: 1, ramp: [s.color || [1, 0.85, 0.3], (s.color || [1, 0.85, 0.3]).map((v) => v * 0.55)], emissive: 0.5, hard: true });
      }
    }
    this.bulletMesh.count = nb; this.missileMesh.count = nm;
    this.bulletMesh.dirty = this.missileMesh.dirty = true;

    // ---- 적 탄 ----
    let ne = 0;
    for (let i = this.enemyList.length - 1; i >= 0; i--) {
      const s = this.enemyList[i];
      s.life -= dt; s.t += dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      const dx = p.x - s.x, dz = p.z - s.z;
      let dead = s.life <= 0;
      const d2 = dx * dx + dz * dz;
      if (d2 < 16) this.danger = Math.max(this.danger || 0, 1 - Math.sqrt(d2) / 4); // 근처에 적 탄: 판정 코어 표시
      if (d2 < ((p.hit || 0.3) + 0.22) ** 2) {
        if (p.hurt(s.dmg, s.vx * 0.1, s.vz * 0.1)) { dead = true; fx.hitSpark([s.x, s.y, s.z], [1, 0.5, 0.3], 6); }
      }
      if (dead) { this.enemyList.splice(i, 1); continue; }
      const pulse = 1 + Math.sin(s.t * 18) * 0.18;
      const sc = (s.kind === 'orb' ? 1.15 : 1) * pulse;
      const col = s.kind === 'orb' ? [1, 0.15, 0.6] : [1, 0.4, 0.1];
      this.enemyMesh.setAt(ne, m4.fromTRS([s.x, s.y, s.z], [0, s.t * 4, 0], [sc, sc, sc]), col, 1);
      this.enemyCore.setAt(ne, m4.fromTRS([s.x, s.y, s.z], [0, 0, 0], [1, 1, 1]), [1, 0.95, 0.9], 1);
      this.enemyShadow.setAt(ne, m4.fromTRS([s.x, 0.04, s.z], [0, 0, 0], [sc, 1, sc]), [1, 1, 1], 0);
      ne++;
    }
    this.enemyMesh.count = this.enemyCore.count = this.enemyShadow.count = ne;
    this.enemyMesh.dirty = this.enemyCore.dirty = this.enemyShadow.dirty = true;

    for (const b of this.beams) {
      if (!b.m.visible) continue;
      b.t += dt;
      if (b.t >= b.life) { b.m.visible = b.core.visible = false; continue; }
      this.updateBeam(b);
    }
    this.updateField(dt);
  }

  // ---- 필드 오브젝트 ----
  updateField(dt) {
    const g = this.game, en = g.enemies, fx = g.fx, p = g.player;
    // 지뢰: 던져져 날아가 박힌 뒤(0.5초) 적이 밟으면 폭발. chain 이면 주변 지뢰도 따라 터진다
    let n = 0;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      g.dmgSrc = m.src;
      m.t += dt; m.life -= dt;
      const k = Math.min(1, m.t / 0.35), x = m.x0 + (m.x - m.x0) * k, z = m.z0 + (m.z - m.z0) * k, y = k < 1 ? m.y0 * (1 - k) + Math.sin(k * Math.PI) * 1.4 : 0.02;
      if (m.t > 0.5 && m.fuse < 0) en.each(m.x, m.z, 0.9, () => { m.fuse = 0.05; });
      if (m.fuse >= 0 && (m.fuse -= dt) < 0) {
        en.blast(m.x, m.z, m.aoe, m.dmg, false, 0);
        if (m.chain) for (const o of this.mines) if (o !== m && o.fuse < 0 && o.t > 0.5 && (o.x - m.x) ** 2 + (o.z - m.z) ** 2 < 16) o.fuse = 0.12;
        this.mines.splice(i, 1); continue;
      }
      if (m.life <= 0) { fx.pop(m.x, 0.2, m.z, [0.6, 0.6, 0.55]); this.mines.splice(i, 1); continue; }
      const armed = m.t > 0.5, blink = armed && Math.floor(m.t * (m.fuse >= 0 ? 30 : 3)) % 2 === 0;
      const mvk = m.vk || (m.vk = g.weapons?.vk(m.src) || 1), ms = 1.5 * Math.sqrt(mvk);
      this.mineMesh.setAt(n++, m4.fromTRS([x, y, z], [0, m.t * (k < 1 ? 14 : 0), 0], [ms, ms, ms]), blink ? [1.8, 0.6, 0.5] : [1.1, 1.1, 1.1], blink ? 0.8 : 0.1);
      // 깔린 지뢰: 붉은 점이 깜빡여 위치를 알린다
      if (k >= 1 && dt > 0 && (g.frame & 15) === 0) fx.pxr.emit({ position: [x, y + 0.35, z], velocity: [0, 0, 0], life: 0.12, size: 3, sizeEnd: 2, ramp: [[1, 0.35, 0.3]], emissive: 0.9, hard: true });
    }
    this.mineMesh.count = n; this.mineMesh.dirty = true;

    // 부메랑 원반: 감속하며 날아갔다가 기체로 돌아온다. 같은 적은 0.3초에 한 번만
    n = 0;
    for (let i = this.discs.length - 1; i >= 0; i--) {
      const d = this.discs[i];
      g.dmgSrc = d.src;
      d.t += dt;
      if (!d.back) { const k = Math.exp(-2.6 * dt); d.vx *= k; d.vz *= k; if (d.t > 0.55) d.back = true; }
      else {
        const dx = p.x - d.x, dz = p.z - d.z, l = Math.hypot(dx, dz) || 1, sp = Math.min(24, Math.hypot(d.vx, d.vz) + 40 * dt);
        d.vx += ((dx / l) * sp - d.vx) * Math.min(1, dt * 8); d.vz += ((dz / l) * sp - d.vz) * Math.min(1, dt * 8);
        if (l < 1 || d.t > 3.5) { this.discs.splice(i, 1); continue; }
      }
      d.x += d.vx * dt; d.z += d.vz * dt;
      en.each(d.x, d.z, 0.5 * d.size, (e) => {
        if ((d.hits.get(e) || 0) > d.t) return;
        d.hits.set(e, d.t + 0.3);
        const c = Math.random() < p.stats.crit, l = Math.hypot(d.vx, d.vz) || 1;
        en.hit(e, c ? d.dmg * 2 : d.dmg, d.vx / l, d.vz / l, 3, { crit: c, quiet: !c });
        fx.hitSpark([e.x, 1, e.z], [0.6, 1, 1], 3);
        g.sfx.play('tink', { pitch: 1.4 });
      });
      if (Math.random() < 0.5) fx.trail.emit({ position: [d.x + rr(-0.3, 0.3) * d.size, 1, d.z + rr(-0.3, 0.3) * d.size], velocity: [0, 0, 0], life: 0.15, size: 2, sizeEnd: 1, color: [0.8, 1, 1], colorEnd: [0.3, 0.7, 1], emissive: 1, gravity: 0 });
      const ds = d.size * 1.3;
      this.discMesh.setAt(n++, m4.fromTRS([d.x, 1, d.z], [0, d.t * 22, 0], [ds, 1, ds]), d.evo ? [1.2, 1, 0.6] : [1.1, 1.1, 1.1], 0.7);
      if (dt > 0) for (const s of [-1, 1]) fx.pxr.emit({ position: [d.x + Math.sin(d.t * 22) * 0.45 * ds * s, 1, d.z + Math.cos(d.t * 22) * 0.45 * ds * s], velocity: [0, 0, 0], life: 0.14, size: 2, sizeEnd: 1, ramp: d.evo ? [[1, 0.9, 0.5], [0.7, 0.5, 0.2]] : [[0.6, 1, 0.95], [0.25, 0.6, 0.55]], emissive: 0.6, hard: true });
    }
    this.discMesh.count = n; this.discMesh.dirty = true;

    // 중력 우물: 반경 안의 적을 끌어당기고 0.25초마다 피해. pop 이 있으면 끝에 폭발
    n = 0;
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i];
      g.dmgSrc = w.src;
      w.t += dt; w.tick -= dt;
      const tick = w.tick <= 0;
      if (tick) w.tick = 0.25;
      en.each(w.x, w.z, w.r, (e) => {
        const dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz) || 1;
        if (!e.boss && !e.ctrl && !e.guard && d > 0.4) { const f = 42 * (1 - (d / w.r) * 0.5) * dt; e.kx += (dx / d) * f; e.kz += (dz / d) * f; }
        if (tick) en.hit(e, w.dps * 0.25, 0, 0, 0, { quiet: true });
      });
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2, r = w.r * rr(0.6, 1);
        fx.pxr.emit({ position: [w.x + Math.cos(a) * r, rr(0.2, 1.2), w.z + Math.sin(a) * r], velocity: [-Math.cos(a) * r * 2.2 - Math.sin(a) * 3, 0.3, -Math.sin(a) * r * 2.2 + Math.cos(a) * 3], life: 0.4, size: 2, sizeEnd: 1, ramp: [[1, 0.85, 1], [0.8, 0.5, 1], [0.5, 0.25, 0.9], [0.3, 0.1, 0.6]], emissive: 1, hard: true });
      }
      if (w.t >= w.dur) {
        if (w.pop) { en.blast(w.x, w.z, w.r * 0.85, w.dps * w.pop, false, 0); fx.light([w.x, 2, w.z], [0.8, 0.5, 1], w.r + 3, 2, 0.3); fx.addTrauma(0.2); }
        else fx.pop(w.x, 1, w.z, [0.7, 0.4, 1]);
        fx.ring(w.x, 0.12, w.z, w.r, [0.7, 0.45, 1], 0.3);
        this.wells.splice(i, 1); continue;
      }
      const grow = Math.min(1, w.t * 4) * (1 - Math.max(0, (w.t - w.dur + 0.2) * 5)), s = (0.7 + w.r * 0.14) * grow * (1 + Math.sin(w.t * 20) * 0.06);
      this.wellMesh.setAt(n, m4.fromTRS([w.x, 1, w.z], [0, w.t * 3, 0], [s, s, s]), [0.6, 0.3, 1], 1);
      this.wellCore.setAt(n++, m4.fromTRS([w.x, 1, w.z], [0, 0, 0], [s, s, s]), [1, 1, 1], 0);
      if (Math.random() < 0.15) fx.light([w.x, 1.4, w.z], [0.7, 0.4, 1], w.r + 1, 0.8, 0.2);
      // 범위 테두리: 보라 점이 원을 따라 돈다
      if (dt > 0) for (let k = 0; k < 4; k++) { const a = w.t * 2.5 + (k / 4) * Math.PI * 2 + R() * 0.3; fx.pxr.emit({ position: [w.x + Math.cos(a) * w.r, 0.15, w.z + Math.sin(a) * w.r], velocity: [0, 0, 0], life: 0.25, size: 2, sizeEnd: 1, ramp: [[0.9, 0.7, 1], [0.6, 0.35, 1], [0.35, 0.15, 0.6]], emissive: 0.7, hard: true }); }
    }
    this.wellMesh.count = this.wellCore.count = n; this.wellMesh.dirty = this.wellCore.dirty = true;

    // 박격포탄: 포물선으로 날아가 떨어지면 본탄 + 자탄이 흩어져 연달아 폭발
    n = 0;
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const L = this.lobs[i];
      g.dmgSrc = L.src;
      L.t += dt;
      const k = Math.min(1, L.t / L.T);
      const x = L.x + (L.tx - L.x) * k, z = L.z + (L.tz - L.z) * k, y = L.y + (0.3 - L.y) * k + Math.sin(k * Math.PI) * 5.5;
      if (k >= 1) {
        en.blast(L.tx, L.tz, L.aoe * 1.3, L.dmg * 1.4, false, 0);
        for (let j = 0; j < L.bomblets; j++) {
          const a = Math.random() * Math.PI * 2, r = rr(1, 3.2) * L.spread;
          en.blast(L.tx + Math.cos(a) * r, L.tz + Math.sin(a) * r, L.aoe, L.dmg, false, rr(0.15, 0.5));
          fx.sparks.emit({ position: [L.tx, 0.6, L.tz], velocity: [Math.cos(a) * r * 2.5, rr(5, 8), Math.sin(a) * r * 2.5], life: 0.45, size: 2, sizeEnd: 1, color: [1, 0.9, 0.5], colorEnd: [1, 0.4, 0.15], emissive: 1, gravity: 1.4 });
        }
        fx.addTrauma(0.08);
        this.lobs.splice(i, 1); continue;
      }
      if (Math.random() < 0.6) fx.smoke.emit({ position: [x, y, z], velocity: [0, 0.2, 0], life: 0.4, size: 2, sizeEnd: 3, color: [0.6, 0.58, 0.6], colorEnd: [0.3, 0.3, 0.33] });
      this.lobMesh.setAt(n++, m4.fromTRS([x, y, z], [L.t * 7, L.t * 5, 0], [1.5, 1.5, 1.5]), [1.1, 1.1, 1.1], 0.2);
      if (dt > 0) { fx.pxr.emit({ position: [x, y, z], velocity: [0, 0, 0], life: 0.1, size: 3, sizeEnd: 2, ramp: [[1, 0.95, 0.6], [1, 0.55, 0.2]], emissive: 0.8, hard: true }); if (Math.random() < 0.6) fx.px.emit({ position: [x, y, z], velocity: [0, 0.4, 0], life: 0.5, size: 3, sizeEnd: 1, ramp: [[0.55, 0.52, 0.55], [0.38, 0.36, 0.4], [0.25, 0.24, 0.28]], emissive: 0, gravity: -0.03, hard: true }); }
    }
    this.lobMesh.count = n; this.lobMesh.dirty = true;
  }

  explodeAt(s) {
    const g = this.game;
    let n = 0;
    g.enemies.each(s.x, s.z, s.aoe, (e) => {
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1;
      g.enemies.hit(e, s.dmg, dx / d, dz / d, 7, { noNum: true });
      n++;
    });
    // 폭발 하나당 숫자 하나만 (화면이 숫자로 덮이지 않게)
    if (s.small) { g.fx.pop(s.x, 0.5, s.z, [1, 0.45, 0.15]); g.sfx.play('pop'); return; }
    g.sfx.play('boom', { vol: 0.8 });
    if (n) g.fx.number([s.x, 0.6, s.z], s.dmg, { color: s.crit ? [1, 0.85, 0.2] : [1, 0.75, 0.5], big: s.crit });
    g.fx.explosion(s.x, 0.6, s.z, 0.75 * (s.aoe / 2), { scorch: true });
  }

  clear() { this.list = []; this.enemyList = []; this.mines = []; this.discs = []; this.wells = []; this.lobs = []; for (const b of this.beams) b.m.visible = b.core.visible = false; this.update(0); }
}

// ---- 베기 잔상 (초승달 모양 칼날 궤적) ----
//  꼬리(뒤)는 가늘고 칼끝(앞)은 두꺼운 혜성 모양. 안쪽은 흰색, 바깥은 무기 색.
//  휘두르는 동안 매 프레임 하나씩 찍고 빠르게 사라지게 해서 부드러운 궤적이 된다.
const smearGeoCache = new Map();
function smearGeo(span, col, thick) {
  const key = `${span.toFixed(2)}|${col.join(',')}|${thick}`;
  if (smearGeoCache.has(key)) return smearGeoCache.get(key);
  const g = new Geometry(), N = 14;
  const pt = (a, r, y = 0) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a0 = -span * (1 - t0), a1 = -span * (1 - t1);
    const w0 = Math.pow(t0, 1.4) * thick, w1 = Math.pow(t1, 1.4) * thick;
    const c0 = [col[0] + (1 - col[0]) * t0 * 0.35, col[1] + (1 - col[1]) * t0 * 0.35, col[2] + (1 - col[2]) * t0 * 0.35];
    // 바깥 띠 (무기 색) + 안쪽 심 (흰색)
    g.quad(pt(a0, 1 - w0), pt(a1, 1 - w1), pt(a1, 1 + w1 * 0.15), pt(a0, 1 + w0 * 0.15), c0, null, [0, 1, 0]);
    g.quad(pt(a0, 1 - w0 * 0.22, 0.01), pt(a1, 1 - w1 * 0.22, 0.01), pt(a1, 1, 0.01), pt(a0, 1, 0.01), [0.8 + col[0] * 0.2, 0.8 + col[1] * 0.2, 0.8 + col[2] * 0.2], null, [0, 1, 0]);
  }
  smearGeoCache.set(key, g);
  return g;
}

// ---- 플레이어 무기 운용 ----
//  팔(armR/armL)에 단 무기 = 직접 조작 (공격 버튼), 어깨/등 무기 = 자동 사격
//  팔에 무기가 없으면 주먹 콤보. 특수기(K)는 주무장(armR)에 따라 달라진다.
const FIST = { radius: 1.9, arc: 1.9, dmg: 12 };
const SPECIAL_NAMES = { mg: '탄막 사격', shotgun: '슬러그 폭발', laser: '메가 빔', saber: '회전 베기', flamer: '화염 폭풍', rod: '회전 채찍', fist: '로켓 펀치' };
// 직접 조작 무기 = 팔에 단 arm 무기. 나머지는 팔에 달려도 자동 사격
const isManual = (w) => w.slot.startsWith('arm') && WEAPONS[w.id].prefer === 'arm';
const wrapA = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export class WeaponSystem {
  constructor(game) {
    this.game = game; this.list = []; this.bits = []; this.bitT = 0; this.combo = 0; this.comboT = 0; this.swingLock = 0; this.specialT = 0; this.barrage = 0;
    this.smears = [];
    for (let i = 0; i < 14; i++) { const m = game.scene.add(new Mesh(smearGeo(1, [1, 1, 1], 0.4), new Material({ emissive: 0.85, outline: false, castShadow: false }))); m.visible = false; this.smears.push({ m, t: 1, life: 0.1 }); }
    // 회전 톱날 + 회전 포탑 빔 (기체를 따라다니는 무기)
    this.sawMesh = game.scene.add(new InstancedMesh(sawGeo(), new Material({ emissive: 0.15 }), 16));
    this.turretBeams = [];
    const bg = beamGeo();
    for (let i = 0; i < 4; i++) {
      const m = game.scene.add(new Mesh(bg, new Material({ color: [1, 0.35, 0.5], emissive: 1, outline: false, castShadow: false })));
      const core = game.scene.add(new Mesh(bg, new Material({ color: [1, 1, 1], emissive: 1, outline: false, castShadow: false })));
      m.visible = core.visible = false;
      this.turretBeams.push({ m, core });
    }
    this.burns = new Map(); this.waves = [];
  }
  // 칼날 궤적 하나 찍기
  smear(x, y, z, yaw, radius, span, dir, col, thick, life = 0.12) {
    const s = this.smears.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    s.m.geometry = smearGeo(span, col, thick);
    s.m.position = [x, y, z]; s.m.rotation = [0, yaw, 0]; s.m.scale = [radius * dir, 1, radius];
    s.m.visible = true; s.t = 0; s.life = life;
  }
  updateSmears(dt) {
    for (const s of this.smears) {
      if (!s.m.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.m.visible = false; continue; }
      s.m.material.opacity = 1 - k * k;
      s.m.scale = [s.m.scale[0] * (1 + dt * 0.8), 1, s.m.scale[2] * (1 + dt * 0.8)];
    }
  }

  reset() { this.list = []; this.combo = 0; this.comboT = 0; this.swingLock = 0; this.specialT = 0; this.barrage = 0; this.burns.clear(); this.waves = []; this.syncBits(); }
  get(id) { return this.list.find((w) => w.id === id); }
  // 연출 배율: 레벨이 오를수록, 진화하면 더 크게 보인다 (Lv1 1.0 → Lv5 1.7, 진화 +0.5)
  vk(id) { const w = id && this.get(id); return w ? 1 + ((w.level || 1) - 1) * 0.18 + (w.evo ? 0.5 : 0) : 1; }
  get primary() { return this.list.find((w) => w.slot === 'armR') || null; }
  get primaryKind() { const p = this.primary; return p ? p.id : 'fist'; }
  get specialName() { return SPECIAL_NAMES[this.primaryKind] || '특수기'; }
  cancelCombo() { this.combo = 0; this.comboT = 0; }

  update(dt, ctl) {
    const g = this.game, p = g.player, st = p.stats;
    for (const w of this.list) {
      w.kick = Math.max(0, (w.kick || 0) - dt * 3);
      if (w.pump > 0) { w.pump = Math.max(0, w.pump - dt); const si = this.game.player.mech.slotInfo[w.slot]; if (si) si.inner.rotation[0] = -Math.sin((1 - w.pump / 0.35) * Math.PI) * 0.6; }
      w.cd -= dt * st.rateMul;
      if (w.swing !== undefined) this.animSwing(w, dt);
      if (w.again > 0 && (w.again -= dt) <= 0) this.whip(w, w.swingYaw, lvOf(w), w.againD, -w.dir);
    }
    if (this.fistSwing) this.animSwing(this.fistSwing, dt);
    this.comboT -= dt;
    this.swingLock = Math.max(0, this.swingLock - dt * st.rateMul);
    this.specialT = Math.max(0, this.specialT - dt);

    this.updateSmears(dt);
    this.manual(dt, ctl);
    if (ctl.special && this.specialT <= 0 && p.dashT <= 0) this.special();
    if (this.barrage > 0) this.updateBarrage(dt);
    this.auto(dt);
    this.updateSetFx(dt);
    this.updateBurns(dt);
    this.updateWaves(dt);
    this.updateBits(dt);
    this.updateOrbitals(dt);
  }

  // ---------- 직접 조작 ----------
  manual(dt, ctl) {
    const g = this.game, p = g.player;
    const arms = this.list.filter(isManual);
    const melee = !arms.length || arms[0].id === 'saber';
    // 섬멸 모드: 공격 버튼 없이도 근처에 적이 있으면 자동으로 쏘고 벤다
    const auto = p.stats.autoFire && g.enemies.nearest(p.x, p.z, 11);
    const firing = ctl.attack || ctl.attackPressed || !!auto;
    if (melee) {
      // 누르고 있으면 콤보가 이어진다 (버튼 연타도 OK)
      if (firing && this.swingLock <= 0 && p.dashT <= 0 && (!auto || ctl.attack || ctl.attackPressed || g.enemies.nearest(p.x, p.z, 4))) {
        const w = arms[0] || null;
        this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
        this.slash(w, this.combo);
      }
    }
    // 원거리 팔 무기 (사벨이 아닌 것). 사벨+총 조합이면 총은 같이 쏜다
    for (const w of arms) {
      if (w.id === 'saber' || w.cd > 0) continue;
      if (!firing) continue;
      if (p.dashT > 0) continue;
      const W = WEAPONS[w.id];
      const yaw = p.attackYaw(W.range * p.stats.rangeMul);
      this.fire(w, yaw);
    }
  }

  // 베기 (사벨 또는 주먹). k = 콤보 단계 1~3
  slash(w, k) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const L = w ? lvOf(w) : FIST;
    const fin = k === 3;
    const blade = st.sets?.has('blade');
    const radius = L.radius * st.areaMul * (fin ? 1.2 : 1) * (blade && w ? 1.3 : 1);
    const arc = Math.min(6.2, (w ? L.arc : FIST.arc) * (fin ? 1.35 : 1));
    const D = L.dmg * st.dmgMul * (fin ? 1.8 : 1) * (w ? 1 : 1 + (g.level - 1) * 0.08);
    const yaw = p.attackYaw(radius + 3);
    p.lookAt(yaw, 0.35);
    p.lunge(yaw, fin ? 9 : 5);
    p.attackSlow = 0.18;
    this.swingLock = fin ? 0.42 : 0.2;
    this.comboT = 0.55;
    let n = 0;
    en.each(p.x + Math.sin(yaw) * 0.6, p.z + Math.cos(yaw) * 0.6, radius, (e) => {
      const a = Math.atan2(e.x - p.x, e.z - p.z);
      const da = Math.abs(((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > arc / 2 + 0.25 && Math.hypot(e.x - p.x, e.z - p.z) > e.r + 0.9) return;
      const d = Math.hypot(e.x - p.x, e.z - p.z) || 1, c = Math.random() < st.crit;
      en.hit(e, c ? D * 2 : D, (e.x - p.x) / d, (e.z - p.z) / d, fin ? 16 : 7, { crit: c, launch: fin ? 9 : 0, stun: fin ? 0.5 : 0.25 });
      fx.hitSpark([e.x, 1, e.z], w ? [1, 0.45, 0.85] : [1, 0.8, 0.4], 4);
      // 베인 자국: 칼이 지나가는 방향으로 흰 불꽃이 길게 튄다
      const tx = Math.sin(yaw + (k === 2 ? -1.57 : 1.57)), tz = Math.cos(yaw + (k === 2 ? -1.57 : 1.57));
      for (let j = 0; j < 5; j++) fx.sparks.emit({ position: [e.x, 1 + (e.y || 0), e.z], velocity: [tx * rr(6, 12) + rr(-1, 1), rr(0.5, 2.5), tz * rr(6, 12) + rr(-1, 1)], life: rr(0.12, 0.22), size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: w ? [1, 0.4, 0.8] : [1, 0.7, 0.3], emissive: 1, gravity: 0.2 });
      n++;
    });
    if (blade && w && fin && !L.wave) for (let j = -1; j <= 1; j++) { const a = yaw + j * 0.3; g.shots.add({ x: p.x + Math.sin(a), y: 1, z: p.z + Math.cos(a), vx: Math.sin(a) * 18, vz: Math.cos(a) * 18, dmg: D * 0.5, life: 0.5, pierce: 99, r: 0.8, color: [1, 0.4, 0.9], scale: [0.9, 0.12, 0.25], knock: 6, quiet: true }); }
    if (L.wave) for (let j = -2; j <= 2; j++) { const a = yaw + j * 0.28; g.shots.add({ x: p.x + Math.sin(a), y: 1, z: p.z + Math.cos(a), vx: Math.sin(a) * 18, vz: Math.cos(a) * 18, dmg: D * 0.6, life: 0.55, pierce: 99, r: 0.8, color: [1, 0.5, 0.95], scale: [0.9, 0.12, 0.25], knock: 6, quiet: true }); }
    const sw = { swing: 0, swingYaw: yaw, swingArc: arc, swingR: radius, dir: k === 2 ? -1 : 1, slot: w ? w.slot : 'armR', fist: !w, fin };
    if (w) Object.assign(w, sw); else this.fistSwing = sw;
    g.sfx.play('swing', { pitch: fin ? 0.85 : 1 });
    if (n) { g.hitStop(fin ? 0.07 : 0.035, true); fx.addTrauma(fin ? 0.18 : 0.04); g.sfx.play('hit', { pitch: fin ? 0.8 : 1 }); }
    fx.light([p.x + Math.sin(yaw), 1.4, p.z + Math.cos(yaw)], w ? [1, 0.45, 0.85] : [1, 0.75, 0.4], radius + 1, fin ? 1 : 0.6, 0.15);
    if (fin) fx.ring(p.x + Math.sin(yaw) * 1.4, 0.12, p.z + Math.cos(yaw) * 1.4, radius, w ? [1, 0.5, 0.85] : [1, 0.8, 0.4], 0.25);
  }

  // 원거리 발사 (팔 무기 직접 사격, 자동 무기 공용)
  fire(w, yaw, mul = 1) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const W = WEAPONS[w.id], L = lvOf(w);
    const mz = p.mech.muzzle(w.slot);
    const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
    const crit = () => Math.random() < st.crit;
    const D = L.dmg * st.dmgMul * mul;
    const SS = st.sets || new Set(), art = SS.has('artillery') && (w.id === 'cannon' || w.id === 'missile');
    w.cd = L.cd * (art ? 0.6 : 1);
    w.kick = 0.25;
    if (isManual(w)) p.lookAt(yaw, 0.35);
    if (w.id === 'mg') {
      for (let k = 0; k < L.count; k++) {
        const off = (k - (L.count - 1) / 2) * 0.22, a = yaw + rr(-0.04, 0.04), c = crit();
        g.shots.add({ x: mz[0] + Math.cos(yaw) * off, y: mz[1], z: mz[2] - Math.sin(yaw) * off, vx: Math.sin(a) * 32, vz: Math.cos(a) * 32, dmg: c ? D * 2 : D, crit: c, pierce: L.pierce + st.pierce + (SS.has('hive') ? 2 : 0), life: 0.5 * st.rangeMul, color: w.evo ? [1, 1, 0.6] : [1, 0.85, 0.3], scale: [0.16, 0.16, w.evo ? 1.1 : 0.9], knock: 2.5, quiet: !c });
      }
      fx.muzzle(mz, dir, [1, 0.8, 0.3], 1);
      g.sfx.play('mg', { vol: w.slot.startsWith('arm') ? 1 : 0.6, pitch: w.evo ? 1.25 : 1 });
      if (w.slot.startsWith('arm')) p.recoil = Math.max(p.recoil || 0, 0.18);
      if (Math.random() < 0.35) this.casing(mz, yaw, w.slot === 'armL' ? -1 : 1);
      fx.light(mz, [1, 0.8, 0.4], 2.5, 0.6, 0.05);
    } else if (w.id === 'shotgun') {
      for (let k = 0; k < L.pellets; k++) {
        const a = yaw + rr(-0.38, 0.38), sp = rr(20, 27), c = crit();
        g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg: c ? D * 2 : D, crit: c, pierce: st.pierce, life: 0.3 * st.rangeMul, color: L.boom ? [1, 0.4, 0.15] : [1, 0.6, 0.25], scale: L.boom ? [0.26, 0.26, 0.5] : [0.18, 0.18, 0.45], knock: 7, r: 0.3, quiet: !c, aoe: L.boom ? L.boom * st.areaMul : 0, small: !!L.boom });
      }
      fx.muzzle(mz, dir, [1, 0.6, 0.25], 3);
      g.sfx.play('shotgun', { pitch: L.boom ? 0.8 : 1 });
      p.recoil = Math.max(p.recoil || 0, 0.9); w.pump = 0.35;
      this.casing(mz, yaw, 1, true);
      fx.light(mz, [1, 0.6, 0.25], 4, 1.2, 0.08);
      for (let k = 0; k < 6; k++) fx.smoke.emit({ position: mz, velocity: [Math.sin(yaw) * 2 + rr(-0.5, 0.5), rr(0.3, 1), Math.cos(yaw) * 2 + rr(-0.5, 0.5)], life: 0.6, size: 3, sizeEnd: 5, color: [0.55, 0.52, 0.5], colorEnd: [0.3, 0.3, 0.32] });
      fx.addTrauma(0.06);
      p.kick(-dir[0] * 2, -dir[2] * 2);
    } else if (w.id === 'missile') {
      const target = en.nearest(p.x, p.z, 17);
      for (let k = 0; k < L.count; k++) {
        const a = yaw + (k - (L.count - 1) / 2) * 0.5 + rr(-0.1, 0.1) + Math.PI * (Math.random() < 0.5 ? 0.15 : -0.15), c = crit();
        g.shots.add({ x: mz[0], y: mz[1] + 0.2, z: mz[2], vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, maxSpeed: 17, homing: true, age: 0, target, dmg: c ? D * 2 : D, crit: c, aoe: L.aoe * st.areaMul * (art ? 1.4 : 1), life: 2.6, r: 0.35, color: [1, 0.6, 0.3] });
        for (let j = 0; j < 3; j++) fx.smoke.emit({ position: mz, velocity: [rr(-1, 1), rr(1, 2), rr(-1, 1)], life: 0.5, size: 3, sizeEnd: 1, color: [0.6, 0.58, 0.6], colorEnd: [0.3, 0.3, 0.33] });
      }
      fx.light(mz, [1, 0.6, 0.3], 3, 1, 0.1);
      g.sfx.play('missile');
    } else if (w.id === 'cannon') {
      const c = crit();
      g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: dir[0] * 19, vz: dir[2] * 19, dmg: c ? D * 2 : D, crit: c, aoe: L.aoe * st.areaMul * (art ? 1.4 : 1), life: 0.85 * st.rangeMul, r: 0.35, color: [1, 0.55, 0.2], scale: [0.3, 0.3, 0.7], knock: 8 });
      fx.muzzle(mz, dir, [1, 0.6, 0.2], 3);
      fx.light(mz, [1, 0.6, 0.25], 4, 1.2, 0.1);
      for (let k = 0; k < 5; k++) fx.smoke.emit({ position: mz, velocity: [dir[0] * 2 + rr(-0.6, 0.6), rr(0.3, 1.2), dir[2] * 2 + rr(-0.6, 0.6)], life: 0.7, size: 3, sizeEnd: 5, color: [0.55, 0.52, 0.5], colorEnd: [0.3, 0.3, 0.32] });
      p.kick(-dir[0] * 2.5, -dir[2] * 2.5); w.kick = 0.6;
      g.sfx.play('shotgun', { pitch: 0.6, vol: 0.8 });
    } else if (w.id === 'laser') {
      const fan = L.fan || 1;
      const rail = SS.has('railgun');
      if (rail && !w.echoing) { w.echo = 0.14; w.echoYaw = yaw; }
      for (let k = 0; k < fan; k++) this.beam(mz, yaw + (k - (fan - 1) / 2) * 0.22, W.range * st.rangeMul, L.width * st.areaMul * (rail ? 1.5 : 1), D, fan > 1 ? [1, 0.55, 1] : [0.45, 1, 1]);
      p.kick(-dir[0] * 4, -dir[2] * 4);
      p.recoil = Math.max(p.recoil || 0, 1);
    } else if (w.id === 'flamer') this.flame(w, yaw, L, D, mz);
    else if (w.id === 'rod') { this.whip(w, yaw, L, D, w.dir === 1 ? -1 : 1); if (L.double) { w.again = 0.17; w.againD = D; } }
    else if (w.id === 'tesla') {
      // 가까운 적부터 연쇄. forks 면 서로 다른 적에서 번개 여러 줄기
      const starts = [], R0 = W.range * st.rangeMul;
      for (let k = 0; k < (L.forks || 1); k++) { const t = en.nearest(mz[0], mz[2], R0, starts[0]); if (t && !starts.includes(t)) starts.push(t); }
      for (const t of starts) this.zap(mz, t, L, D);
      fx.light(mz, [0.6, 0.85, 1], 4, 1.2, 0.12);
      g.sfx.play('beam', { vol: 0.4, pitch: 1.7 });
    } else if (w.id === 'mine') {
      for (let k = 0; k < L.count; k++) {
        const a = Math.random() * Math.PI * 2, d = rr(1.4, 3.8) * Math.sqrt(st.areaMul), c = crit();
        g.shots.mine({ x0: mz[0], z0: mz[2], y0: mz[1], x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d, dmg: c ? D * 2 : D, aoe: L.aoe * st.areaMul, chain: !!L.chain });
      }
      g.sfx.play('clank', { vol: 0.35, pitch: 1.5 });
    } else if (w.id === 'disc') {
      for (let k = 0; k < L.count; k++) {
        const a = yaw + (k - (L.count - 1) / 2) * 0.45;
        g.shots.disc({ x: mz[0], z: mz[2], vx: Math.sin(a) * 21 * st.rangeMul, vz: Math.cos(a) * 21 * st.rangeMul, dmg: D, size: L.size * st.areaMul, evo: w.evo });
      }
      g.sfx.play('swing', { pitch: 1.4, vol: 0.6 });
    } else if (w.id === 'stomp') {
      this.quake(L.radius * st.areaMul, D);
      for (let k = 1; k < L.waves; k++) this.waves.push({ t: k * 0.28, r: L.radius * st.areaMul * (1 + k * 0.3), D });
    } else if (w.id === 'gravity') {
      // 적이 가장 많이 몰린 곳 (무작위 후보 10개 중)
      let best = this.autoTarget, bn = 0;
      for (let k = 0; k < 10 && en.list.length; k++) {
        const e = en.list[(Math.random() * en.list.length) | 0];
        if (e.dead || e.spawnT < 0.3 || Math.hypot(e.x - p.x, e.z - p.z) > W.range * st.rangeMul) continue;
        let c = 0; en.each(e.x, e.z, 3, () => c++);
        if (c > bn) { bn = c; best = e; }
      }
      if (!best) return;
      g.shots.well({ x: best.x, z: best.z, r: L.radius * st.areaMul, dps: D, dur: L.dur, pop: L.pop || 0 });
      fx.ring(best.x, 0.12, best.z, L.radius * st.areaMul, [0.7, 0.45, 1], 0.35);
      g.sfx.play('beam', { vol: 0.5, pitch: 0.5 });
    } else if (w.id === 'gauss') {
      // 사거리 안에서 체력이 가장 많은 적 (정예, 수호자 우선)
      let t = this.autoTarget, hp = 0;
      en.each(p.x, p.z, W.range * st.rangeMul, (e) => { if (e.hp > hp) { hp = e.hp; t = e; } });
      const a0 = t ? Math.atan2(t.x - mz[0], t.z - mz[2]) : yaw, fan = L.fan || 1;
      for (let k = 0; k < fan; k++) this.beam(mz, a0 + (k - (fan - 1) / 2) * 0.12, 30 * st.rangeMul, L.width * st.areaMul, D, w.evo ? [1, 0.5, 0.3] : [1, 0.85, 0.35], 2, L.crit || 0);
      p.kick(-Math.sin(a0) * 3, -Math.cos(a0) * 3);
      w.kick = 0.8;
    } else if (w.id === 'cluster') {
      const t = this.autoTarget;
      for (let k = 0; k < L.shells; k++) {
        const tx = (t ? t.x : p.x) + (k ? rr(-3, 3) : 0), tz = (t ? t.z : p.z) + (k ? rr(-3, 3) : 0);
        g.shots.lob({ x: mz[0], y: mz[1], z: mz[2], tx, tz, T: 0.75 + k * 0.12, dmg: D, aoe: L.aoe * st.areaMul, bomblets: L.bomblets, spread: Math.sqrt(st.areaMul) });
        fx.ring(tx, 0.1, tz, L.aoe * 1.3 * st.areaMul, [1, 0.45, 0.25], 0.75 + k * 0.12);
      }
      for (let k = 0; k < 4; k++) fx.smoke.emit({ position: mz, velocity: [rr(-1, 1), rr(2, 3), rr(-1, 1)], life: 0.6, size: 3, sizeEnd: 5, color: [0.6, 0.58, 0.6], colorEnd: [0.3, 0.3, 0.33] });
      fx.muzzle(mz, [0, 1, 0], [1, 0.6, 0.25], 2);
      g.sfx.play('shotgun', { pitch: 0.5, vol: 0.6 });
    } else if (w.id === 'ricochet') {
      for (let k = 0; k < L.count; k++) {
        const a = yaw + (k - (L.count - 1) / 2) * 0.14, c = crit();
        g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: Math.sin(a) * 28, vz: Math.cos(a) * 28, dmg: c ? D * 2 : D, crit: c, bounce: L.bounce, life: 0.6 * st.rangeMul, color: w.evo ? [1, 0.5, 1] : [0.75, 1, 0.45], scale: [0.2, 0.2, 0.75], knock: 2.5, quiet: !c });
      }
      fx.muzzle(mz, dir, [0.8, 1, 0.5], 1);
      g.sfx.play('mg', { pitch: 0.8, vol: 0.5 });
    }
  }

  // ---- 새 무기 공용 동작 ----
  // 화염: 부채꼴 안의 적에게 짧은 피해 + 화상
  flame(w, yaw, L, D, mz) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const reach = WEAPONS.flamer.range * st.rangeMul * (L.far || 1), half = (L.cone * st.areaMul) / 2;
    en.each(p.x, p.z, reach, (e) => {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (Math.abs(wrapA(Math.atan2(dx, dz) - yaw)) > half + e.r / d) return;
      const c = Math.random() < st.crit;
      en.hit(e, c ? D * 2 : D, dx / d, dz / d, 1.2, { crit: c, quiet: !c });
      this.ignite(e, L.burn * st.dmgMul);
    });
    // 불길: 굵은 도트 불꽃이 부채꼴로 쏟아져 사거리 끝까지 간다 (레벨이 오를수록 많고 굵게)
    const blue = w.evo, vk = this.vk('flamer');
    const ramp = blue ? [[1, 1, 1], [0.8, 0.95, 1], [0.5, 0.75, 1], [0.3, 0.45, 1], [0.18, 0.22, 0.65], [0.24, 0.24, 0.3]]
      : [[1, 1, 0.85], [1, 0.95, 0.5], [1, 0.75, 0.2], [1, 0.52, 0.1], [0.88, 0.28, 0.08], [0.5, 0.16, 0.1], [0.28, 0.22, 0.22]];
    const n = Math.round(24 * vk);
    for (let k = 0; k < n; k++) {
      const a = yaw + rr(-half, half) * Math.sqrt(R()), life = rr(0.1, 0.46), sp = (reach * rr(0.8, 1.08) * 2.6) / (1 - Math.exp(-2.6 * life));
      fx.px.emit({ position: [mz[0] + rr(-0.1, 0.1), mz[1] + rr(-0.1, 0.1), mz[2] + rr(-0.1, 0.1)], velocity: [Math.sin(a) * sp, rr(-0.5, 1.8), Math.cos(a) * sp], life, size: Math.round(rr(2, 3)), sizeEnd: Math.round(rr(6, 10) * Math.sqrt(vk)), ramp, emissive: 0.85, gravity: -0.08, hard: true });
    }
    fx.pxr.emit({ position: [...mz], velocity: [0, 0, 0], life: 0.05, size: Math.round(4 * vk), sizeEnd: 3, ramp: [ramp[0], ramp[1]], emissive: 0.8, hard: true });
    // 바닥 불씨 + 끝자락 연기
    for (let k = 0; k < 2; k++) { const a = yaw + rr(-half, half), d = reach * rr(0.4, 1); fx.px.emit({ position: [p.x + Math.sin(a) * d, 0.15, p.z + Math.cos(a) * d], velocity: [rr(-0.5, 0.5), rr(1, 2.5), rr(-0.5, 0.5)], life: rr(0.3, 0.6), size: Math.round(rr(1, 2)), sizeEnd: 1, ramp: ramp.slice(2, 6), emissive: 0.8, gravity: 0.15, hard: true }); }
    if (Math.random() < 0.5) { const d = reach * rr(0.8, 1.1); fx.px.emit({ position: [mz[0] + Math.sin(yaw) * d, 1.2, mz[2] + Math.cos(yaw) * d], velocity: [rr(-0.5, 0.5), 1.6, rr(-0.5, 0.5)], life: 0.8, size: 4, sizeEnd: 2, ramp: [[0.42, 0.38, 0.4], [0.3, 0.28, 0.31], [0.2, 0.19, 0.22]], emissive: 0, gravity: -0.05, hard: true }); }
    fx.light([mz[0] + Math.sin(yaw) * 2, 1, mz[2] + Math.cos(yaw) * 2], blue ? [0.5, 0.7, 1] : [1, 0.55, 0.2], 5, 0.9, 0.1);
    g.sfx.play('missile', { vol: 0.3, pitch: 0.55 });
  }
  ignite(e, dps) { const b = this.burns.get(e); if (b) { b.t = 2; b.dps = Math.max(b.dps, dps); } else this.burns.set(e, { t: 2, dps, tick: 0.3 }); }
  updateBurns(dt) {
    const en = this.game.enemies, fx = this.game.fx;
    for (const [e, b] of this.burns) {
      if (e.dead || (b.t -= dt) <= 0) { this.burns.delete(e); continue; }
      if ((b.tick -= dt) <= 0) { b.tick = 0.3; en.hit(e, b.dps * 0.3, 0, 0, 0, { quiet: true }); }
      if (Math.random() < 0.3) fx.trail.emit({ position: [e.x + rr(-0.3, 0.3), 0.6 + (e.y || 0), e.z + rr(-0.3, 0.3)], velocity: [0, rr(1, 2), 0], life: 0.3, size: 2, sizeEnd: 3, color: [1, 0.8, 0.3], colorEnd: [1, 0.2, 0.05], emissive: 1, gravity: 0 });
    }
  }
  // 채찍: 중거리 부채꼴을 휩쓸고 맞은 적을 끌어당긴다
  whip(w, yaw, L, D, dir) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const reach = L.reach * st.areaMul, arc = L.arc;
    let n = 0;
    en.each(p.x, p.z, reach, (e) => {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (Math.abs(wrapA(Math.atan2(dx, dz) - yaw)) > arc / 2 + e.r / d) return;
      const c = Math.random() < st.crit;
      en.hit(e, c ? D * 2 : D, -dx / d, -dz / d, Math.min(9, d * 1.5), { crit: c, stun: L.stun || 0.2 });
      fx.hitSpark([e.x, 1, e.z], w.evo ? [0.6, 0.8, 1] : [1, 0.6, 0.2], 4);
      n++;
    });
    p.lookAt(yaw, 0.35);
    Object.assign(w, { swing: 0, swingYaw: yaw, swingArc: arc, swingR: reach, dir, fist: false, fin: false, T: 0.13, col: w.evo ? [0.5, 0.75, 1] : [1, 0.5, 0.12], thick: 0.13 });
    g.sfx.play('swing', { pitch: 1.25 });
    if (n) { g.sfx.play('hit', { pitch: 1.15 }); fx.addTrauma(0.05); if (n >= 4) g.hitStop(0.03); }
  }
  // 번개 연쇄: 맞은 적에서 아직 안 맞은 가장 가까운 적으로 튄다 (튈 때마다 피해 -10%)
  zap(from, start, L, D) {
    const g = this.game, en = g.enemies, st = g.player.stats, hit = new Set();
    let cur = start, dmg = D;
    for (let i = 0; i < L.chains && cur; i++) {
      hit.add(cur);
      const c = Math.random() < st.crit;
      en.hit(cur, c ? dmg * 2 : dmg, 0, 0, 2, { crit: c, stun: L.stun || 0.25, quiet: !c && i > 0 });
      const to = [cur.x, 1 + (cur.y || 0), cur.z];
      this.bolt(from, to, L.forks ? [0.85, 0.6, 1] : [0.55, 0.85, 1]);
      from = to; dmg *= 0.9;
      const J = L.jump * st.areaMul, c0 = cur;
      let bd = J * J; cur = null;
      en.each(c0.x, c0.z, J, (e) => { if (hit.has(e)) return; const d = (e.x - c0.x) ** 2 + (e.z - c0.z) ** 2; if (d < bd) { bd = d; cur = e; } });
    }
  }
  // 번개: 꺾인 지그재그 선을 점으로 촘촘히 (흰 심 + 색 테두리), 끝에 작은 점 섬광
  bolt(a, b, col) {
    const fx = this.game.fx, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, segs = Math.max(2, Math.round(L / 0.7));
    const pts = [a];
    for (let i = 1; i < segs; i++) { const k = i / segs, j = 0.45; pts.push([a[0] + (b[0] - a[0]) * k + rr(-j, j), a[1] + (b[1] - a[1]) * k + rr(-j, j) * 0.6, a[2] + (b[2] - a[2]) * k + rr(-j, j)]); }
    pts.push(b);
    const core = [[1, 1, 1], [1, 1, 1], col], glow = [col, col.map((v) => v * 0.6)];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.11));
      for (let k = 0; k < n; k++) {
        const t = k / n, pos = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        const vk = this.vk(this.game.dmgSrc);
        fx.pxr.emit({ position: pos, velocity: [0, 0, 0], life: 0.22, size: Math.round(3 * Math.min(1.5, vk)), sizeEnd: 2, ramp: core, emissive: 1, hard: true });
        if (k % 2 === 0) fx.pxr.emit({ position: pos, velocity: [0, 0, 0], life: 0.16, size: Math.round(6 * Math.min(1.5, vk)), sizeEnd: 3, ramp: glow, emissive: 0.7, hard: true });
      }
    }
    fx.starPx(b, 4, col, 0.7, 0.12, Math.random());
    fx.shrapnel(b, 3, [[1, 1, 1], col], { speed: [3, 7], life: [0.1, 0.2] });
    fx.light(b, col, 3, 0.8, 0.1);
  }
  // 충격파: 기체 주위를 쳐서 날려 보낸다
  quake(r, D) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    en.each(p.x, p.z, r, (e) => {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1, c = Math.random() < st.crit;
      en.hit(e, c ? D * 2 : D, dx / d, dz / d, 13, { crit: c, quiet: !c, launch: 5, stun: 0.4 });
    });
    fx.ring(p.x, 0.12, p.z, r, [1, 0.8, 0.45], 0.4);
    fx.ring(p.x, 0.14, p.z, r * 0.6, [1, 0.95, 0.8], 0.25);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; fx.dust(p.x + Math.cos(a) * r * 0.8, p.z + Math.sin(a) * r * 0.8, 1); }
    fx.addTrauma(0.14);
    p.recoil = Math.max(p.recoil || 0, 0.5);
    g.sfx.play('bigboom', { vol: 0.45, pitch: 1.3 });
  }
  updateWaves(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) { const q = this.waves[i]; if ((q.t -= dt) <= 0) { this.quake(q.r, q.D); this.waves.splice(i, 1); } }
  }

  // ---- 세트 각성 / 초월 효과 ----
  updateSetFx(dt) {
    const g = this.game, p = g.player, st = p.stats, en = g.enemies, fx = g.fx, SS = st.sets || new Set();
    // 레일건: 빔 두 번째 발사
    for (const w of this.list) if (w.echo > 0 && (w.echo -= dt) <= 0) { w.echoing = true; this.fire(w, w.echoYaw); w.echoing = false; w.cd = lvOf(w).cd; }
    // 요새 포격: 4초마다 주변에 포탄 6발
    if (SS.has('artillery') && (this.artT = (this.artT ?? 2) - dt) <= 0) {
      this.artT = 4;
      for (let i = 0; i < 6; i++) {
        const t = en.list[(Math.random() * en.list.length) | 0];
        const x = t ? t.x : p.x + rr(-8, 8), z = t ? t.z : p.z + rr(-8, 8);
        en.blast(x, z, 2.2 * st.areaMul, 45 * st.dmgMul, false, 0.25 + i * 0.12);
        fx.light([x, 3, z], [1, 0.6, 0.2], 3, 0.6, 0.25);
      }
      g.sfx.play('missile', { pitch: 0.7 });
    }
    // 검귀: 대시로 지나간 적을 벤다
    if (SS.has('blade') && p.dashT > 0) en.each(p.x, p.z, p.r + 1.4, (e) => {
      if (e.bladeId === p.dashId) return;
      e.bladeId = p.dashId;
      en.hit(e, 40 * st.dmgMul, p.dashDir[0], p.dashDir[1], 6, { stun: 0.3 });
      fx.hitSpark([e.x, 1, e.z], [1, 0.4, 0.85], 6);
      g.sfx.play('hit');
    });
    // 초월: 0.5초마다 근처 적에게 번개
    if (st.transcend && (this.zapT = (this.zapT ?? 0.5) - dt) <= 0) {
      this.zapT = 0.5;
      const near = []; en.each(p.x, p.z, 11, (e) => near.push(e));
      const t = near[(Math.random() * near.length) | 0];
      if (t) {
        en.hit(t, 50 * st.dmgMul, 0, 0, 3, { stun: 0.4 });
        // 하늘에서 지그재그로 떨어지는 번개
        this.bolt([t.x + rr(-1.5, 1.5), 9, t.z + rr(-1.5, 1.5)], [t.x, 0.3, t.z], [0.55, 0.85, 1]);
        fx.light([t.x, 2, t.z], [0.6, 0.85, 1], 5, 1.4, 0.12);
        fx.ring(t.x, 0.12, t.z, 1.6, [0.6, 0.85, 1], 0.2);
        g.sfx.play('beam', { vol: 0.35, pitch: 1.6 });
      }
    }
  }

  // 탄피: 옆으로 튀어 바닥에 떨어진다
  casing(mz, yaw, side = 1, big = false) {
    const fx = this.game.fx, sx = Math.cos(yaw) * side, sz = -Math.sin(yaw) * side;
    fx.sparks.emit({ position: [mz[0] - Math.sin(yaw) * 0.4, mz[1] + 0.05, mz[2] - Math.cos(yaw) * 0.4], velocity: [sx * rr(2, 4) - Math.sin(yaw), rr(2.5, 4), sz * rr(2, 4) - Math.cos(yaw)], life: rr(0.35, 0.55), size: big ? 3 : 2, sizeEnd: big ? 2 : 1, color: big ? [0.9, 0.25, 0.2] : [0.8, 0.65, 0.35], colorEnd: big ? [0.6, 0.15, 0.1] : [0.5, 0.4, 0.2], emissive: 0, gravity: 2.2 });
  }

  beam(mz, yaw, len, width, D, color, launch = 0, critAdd = 0) {
    const g = this.game, en = g.enemies, fx = g.fx, st = g.player.stats;
    const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
    const hitList = [];
    en.each(mz[0] + dir[0] * len / 2, mz[2] + dir[2] * len / 2, len / 2 + 1, (e) => {
      const rx = e.x - mz[0], rz = e.z - mz[2], t = rx * dir[0] + rz * dir[2];
      if (t < -0.5 || t > len) return;
      if (Math.abs(rx * dir[2] - rz * dir[0]) < width / 2 + e.r) hitList.push(e);
    });
    for (const e of hitList) { const c = Math.random() < st.crit + critAdd; en.hit(e, c ? D * 2 : D, dir[0], dir[2], 6 + launch, { crit: c, launch }); }
    g.shots.beam(mz, yaw, len, width, color);
    g.sfx.play('beam', { pitch: width > 2 ? 0.7 : 1 });
    fx.light(mz, color, 5, 1.3, 0.25);
    fx.light([mz[0] + dir[0] * len * 0.5, 1, mz[2] + dir[2] * len * 0.5], color, 6, 0.9, 0.25);
    for (let k = 0; k < 18; k++) {
      const t = Math.random() * len;
      fx.sparks.emit({ position: [mz[0] + dir[0] * t, mz[1], mz[2] + dir[2] * t], velocity: [rr(-2, 2), rr(1, 4), rr(-2, 2)], life: rr(0.2, 0.45), size: 2, sizeEnd: 1, color: [0.9, 1, 1], colorEnd: [0.3, 0.7, 1], emissive: 1, gravity: 0.3 });
    }
    fx.addTrauma(0.15);
    if (hitList.length >= 3) g.hitStop(0.035);
  }

  // ---------- 특수기 ----------
  special() {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const kind = this.primaryKind, w = this.primary;
    this.specialT = st.specialCd;
    const yaw = p.attackYaw(14);
    p.lookAt(yaw, 0.6);
    fx.light([p.x, 1.6, p.z], [1, 0.9, 0.6], 4, 1, 0.2);
    const C = [p.x, 1.2, p.z], F = [Math.sin(yaw), Math.cos(yaw)];
    fx.flare(C, 'star8', [1, 1, 0.9], 1.6, 0.14, { spin: 4 });
    if (kind === 'mg') {
      fx.flare(C, 'hex', [1, 0.85, 0.3], 2.2, 0.3, { grow: true, rot: 0 });
      this.barrage = 1.1; this.barrageYaw = yaw; this.barrageT = 0;
    } else if (kind === 'shotgun') {
      const L = lvOf(w), D = L.dmg * 4 * st.dmgMul;
      const mz = p.mech.muzzle('armR');
      en.each(p.x + Math.sin(yaw) * 3, p.z + Math.cos(yaw) * 3, 4.2 * st.areaMul, (e) => {
        const a = Math.atan2(e.x - p.x, e.z - p.z);
        if (Math.abs(((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.9) return;
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, (e.x - p.x) / d, (e.z - p.z) / d, 22, { launch: 8, stun: 0.6 });
      });
      fx.explosion(mz[0] + Math.sin(yaw) * 2, 0.8, mz[2] + Math.cos(yaw) * 2, 1.2, { scorch: false, color: [1, 0.6, 0.25] });
      fx.streaks(mz, 26, [1, 0.8, 0.35], { dir: F, spread: 1.8, speed: [16, 30], len: 0.9, life: 0.28, up: 0.15 });
      for (let k = 1; k <= 3; k++) { const q = [mz[0] + F[0] * k * 1.5, 0.9, mz[2] + F[1] * k * 1.5]; fx.flare(q, 'burst', k === 1 ? [1, 0.95, 0.7] : [1, 0.55, 0.2], 1.4 + k * 0.7, 0.18 + k * 0.05, { spin: rr(-4, 4) }); }
      fx.flare([mz[0] + F[0] * 3, 0.9, mz[2] + F[1] * 3], 'hex', [1, 0.7, 0.3], 4.5, 0.35, { grow: true, rot: 0 });
      p.kick(-Math.sin(yaw) * 12, -Math.cos(yaw) * 12);
      g.hitStop(0.08);
      g.sfx.play('bigboom', { vol: 0.7 });
    } else if (kind === 'laser') {
      const L = lvOf(w);
      const bm = p.mech.muzzle('armR');
      this.beam(bm, yaw, 26, 2.4 * st.areaMul, L.dmg * 3 * st.dmgMul, [1, 0.5, 1], 5);
      fx.flare(bm, 'star8', [1, 0.85, 1], 3.4, 0.3, { spin: 8 });
      fx.flare(bm, 'star4', [1, 1, 1], 4.2, 0.22, { rot: 0 });
      for (let k = 1; k <= 7; k++) { const q = [bm[0] + F[0] * k * 3.4, bm[1], bm[2] + F[1] * k * 3.4]; setTimeout(() => { fx.flare(q, k % 2 ? 'star4' : 'hex', [1, 0.5, 1], 2.2, 0.22, { grow: k % 2 === 0, rot: 0 }); fx.streaks(q, 3, [1, 0.7, 1], { speed: [6, 12], len: 0.5 }); }, k * 25); }
      p.kick(-Math.sin(yaw) * 10, -Math.cos(yaw) * 10);
      fx.addTrauma(0.5); g.hitStop(0.1);
    } else if (kind === 'flamer') {
      // 화염 폭풍: 360° 로 불길이 터져 나가 주위를 모두 태운다
      const L = lvOf(w), r = 5.2 * st.areaMul * (L.far || 1), D = L.dmg * 9 * st.dmgMul;
      en.each(p.x, p.z, r, (e) => {
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, (e.x - p.x) / d, (e.z - p.z) / d, 12, { stun: 0.4 });
        this.ignite(e, L.burn * 2 * st.dmgMul);
      });
      for (let k = 0; k < 70; k++) {
        const a = (k / 70) * Math.PI * 2 + rr(-0.05, 0.05), sp = r * rr(2.6, 3.4);
        fx.trail.emit({ position: [p.x, 1, p.z], velocity: [Math.sin(a) * sp, rr(0, 1.5), Math.cos(a) * sp], life: rr(0.35, 0.5), size: 4, sizeEnd: 8, color: w.evo ? [0.8, 0.95, 1] : [1, 0.95, 0.55], colorEnd: w.evo ? [0.2, 0.4, 1] : [1, 0.25, 0.05], emissive: 1, gravity: -0.6 });
      }
      fx.ring(p.x, 0.15, p.z, r, [1, 0.55, 0.2], 0.35);
      fx.light([p.x, 1.5, p.z], [1, 0.55, 0.2], r + 3, 2, 0.3);
      const fc = w.evo ? [0.5, 0.75, 1] : [1, 0.5, 0.15];
      fx.flare(C, 'burst', [1, 0.95, 0.6], 3.5, 0.25, { spin: 3 });
      fx.flare(C, 'burst', fc, r * 1.6, 0.4, { spin: -2, grow: true });
      for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28, q = [p.x + Math.sin(a) * r * 0.75, 0.8, p.z + Math.cos(a) * r * 0.75]; setTimeout(() => fx.flare(q, 'burst', fc, 1.6, 0.25, { spin: rr(-5, 5) }), 40 + k * 15); }
      g.sfx.play('bigboom', { vol: 0.6 }); fx.addTrauma(0.3); g.hitStop(0.06);
    } else if (kind === 'rod') {
      // 회전 채찍: 360° 로 휘둘러 주위 적을 끌어당기며 굳힌다
      const L = lvOf(w), r = L.reach * 1.15 * st.areaMul, D = L.dmg * 2.4 * st.dmgMul;
      en.each(p.x, p.z, r, (e) => {
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, -(e.x - p.x) / d, -(e.z - p.z) / d, Math.min(14, d * 2), { stun: 0.8 });
      });
      Object.assign(w, { swing: 0, swingYaw: yaw + Math.PI, swingArc: 6.28, swingR: r, dir: 1, fist: false, fin: true, T: 0.3, col: w.evo ? [0.5, 0.75, 1] : [1, 0.5, 0.12], thick: 0.16 });
      fx.ring(p.x, 0.15, p.z, r, [1, 0.6, 0.2], 0.35);
      fx.flare(C, 'hex', w.evo ? [0.5, 0.75, 1] : [1, 0.6, 0.2], r * 1.8, 0.35, { grow: true, rot: 0, spin: -3 });
      for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28; fx.streaks([p.x + Math.sin(a) * r * 0.8, 0.9, p.z + Math.cos(a) * r * 0.8], 1, [1, 0.75, 0.35], { dir: [-Math.sin(a), -Math.cos(a)], spread: 0.2, speed: [10, 16], len: 0.8, life: 0.2, up: 0.1 }); }
      g.sfx.play('swing', { pitch: 0.8 }); g.sfx.play('hit', { pitch: 0.8 });
      fx.addTrauma(0.3); g.hitStop(0.07);
    } else {
      // 회전 베기 / 로켓 펀치: 주변 360° 를 크게 쓸어 띄운다
      const L = w ? lvOf(w) : FIST;
      const radius = (L.radius + 1.6) * st.areaMul, D = L.dmg * 2.6 * st.dmgMul;
      en.each(p.x, p.z, radius, (e) => {
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, (e.x - p.x) / d, (e.z - p.z) / d, 18, { launch: 10, stun: 0.7 });
      });
      const sw = { swing: 0, swingYaw: yaw + Math.PI, swingArc: 6.28, swingR: radius, dir: 1, slot: 'armR', fist: !w, fin: true, T: 0.3 };
      if (w) Object.assign(w, sw); else this.fistSwing = sw;
      fx.ring(p.x, 0.15, p.z, radius, w ? [1, 0.5, 0.85] : [1, 0.75, 0.4], 0.35);
      const sc = w ? [1, 0.45, 0.85] : [1, 0.75, 0.35];
      // 원 둘레로 십자 섬광이 차례로 터지고, 접선 방향으로 칼바람 줄기
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * 6.28, q = [p.x + Math.sin(a) * radius * 0.85, 1, p.z + Math.cos(a) * radius * 0.85];
        setTimeout(() => { fx.flare(q, 'star4', k % 3 ? sc : [1, 1, 1], 1.5, 0.18); fx.streaks(q, 2, sc, { dir: [Math.cos(a), -Math.sin(a)], spread: 0.3, speed: [12, 20], len: 0.8, life: 0.18, up: 0.1 }); }, k * 18);
      }
      fx.flare(C, w ? 'star8' : 'burst', sc, radius * 1.3, 0.3, { spin: 6 });
      g.sfx.play('swing', { pitch: 0.7 }); g.sfx.play('hit', { pitch: 0.7 });
      fx.addTrauma(0.35); g.hitStop(0.09);
    }
  }
  updateBarrage(dt) {
    const g = this.game, p = g.player, w = this.primary;
    this.barrage -= dt; this.barrageT -= dt;
    if (!w) { this.barrage = 0; return; }
    p.attackSlow = 0.1;
    if (this.barrageT <= 0) {
      this.barrageT = 0.05;
      const L = lvOf(w);
      const mz = p.mech.muzzle('armR');
      for (let k = -2; k <= 2; k++) {
        const a = this.barrageYaw + k * 0.16 + rr(-0.05, 0.05);
        g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: Math.sin(a) * 30, vz: Math.cos(a) * 30, dmg: L.dmg * 1.2 * p.stats.dmgMul, life: 0.6, pierce: 1, color: [1, 0.9, 0.4], scale: [0.16, 0.16, 0.9], knock: 3, quiet: true });
      }
      g.fx.muzzle(mz, [Math.sin(this.barrageYaw), 0, Math.cos(this.barrageYaw)], [1, 0.8, 0.3], 2);
      g.fx.flare(mz, Math.random() < 0.5 ? 'star8' : 'burst', [1, 0.85, 0.35], 1.6, 0.08, { spin: 10 });
      p.lookAt(this.barrageYaw, 0.2);
    }
  }

  // 베기 연출: 팔을 휘두르고 호를 따라 발광 점을 뿌린다
  animSwing(w, dt) {
    const g = this.game, p = g.player, fx = g.fx;
    const T = w.T || (w.fin ? 0.2 : 0.14);
    const k0 = w.swing / T;
    w.swing += dt;
    const k1 = Math.min(1, w.swing / T);
    const si = p.mech.slotInfo[w.slot];
    if (k0 >= 1) { if (si) { const b = si.base || (w.evo ? 1.45 : 1); si.inner.rotation[1] = 0; si.inner.scale = [b, b, b]; } w.swing = undefined; if (w.fist) this.fistSwing = null; return; }
    // 처음엔 빠르게, 끝에서 감속 (휘두르는 손맛)
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    const a0 = w.swingYaw - (w.swingArc / 2) * w.dir;
    const aNow = a0 + w.swingArc * w.dir * ease(k1);
    const moved = Math.abs(ease(k1) - ease(Math.max(0, k0))) * w.swingArc;
    // 칼날 궤적: 현재 칼끝까지의 꼬리 (최대 1.7rad)
    const span = Math.min(w.swingArc * ease(k1), w.fist ? 1.1 : 1.7) + 0.05;
    const col = w.col || (w.fist ? [1, 0.6, 0.2] : w.evo ? [0.7, 0.4, 1] : [1, 0.3, 0.75]);
    const sz = p.size || 1;
    if (moved > 0.01 || k0 <= 0) this.smear(p.x, 1.05 * sz, p.z, aNow, w.swingR * (w.fist ? 0.85 : 1), span, w.dir, col, w.thick || (w.fin ? 0.55 : w.fist ? 0.35 : 0.42), w.fin ? 0.16 : 0.11);
    // 칼끝 불꽃 몇 개
    if (!w.fist && Math.random() < 0.7) fx.sparks.emit({ position: [p.x + Math.sin(aNow) * w.swingR, 1.05 * sz, p.z + Math.cos(aNow) * w.swingR], velocity: [Math.sin(aNow + w.dir * 1.57) * 4, 1.5, Math.cos(aNow + w.dir * 1.57) * 4], life: 0.2, size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: col, emissive: 1, gravity: 0.5 });
    // 상체가 칼을 따라 비틀림
    p.aimYaw = aNow; p.aimGoal = aNow; p.aimHold = 0.12;
    if (si && !w.fist) {
      si.inner.rotation[1] = aNow - p.mech.upper.rotation[1] - p.yaw;
      const b = si.base || (w.evo ? 1.45 : 1); si.inner.scale = [b, b, w.id === 'saber' ? b * 1.6 : b];
    }
  }

  // ---------- 자동 무기 (어깨/등) ----------
  auto(dt) {
    const g = this.game, p = g.player, en = g.enemies;
    for (const w of this.list) {
      const W = WEAPONS[w.id];
      if (isManual(w) || w.id === 'funnel' || W.passive || w.cd > 0) continue;
      const mz = p.mech.muzzle(w.slot);
      const target = en.nearest(p.x, p.z, W.range * p.stats.rangeMul);
      if (!target) continue;
      if (w.id === 'saber' || w.id === 'rod') { w.cd = 0.5; continue; }
      // 팔 무기를 어깨에 달면 85% 위력, 원래 자동 무기는 그대로
      this.autoTarget = target;
      this.fire(w, Math.atan2(target.x - mz[0], target.z - mz[2]), W.prefer === 'arm' ? 0.85 : 1);
    }
    this.autoTarget = null;
  }

  // ---- 기체를 따라다니는 무기: 회전 톱날, 회전 포탑 ----
  //  update 와 장착 연출 중에 매 프레임, 격납고에선 syncBits 로 한 번 (가진 무기가 없으면 숨김)
  updateOrbitals(dt, live = true) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats, now = g.time;
    if (!p.mech) return;
    const saw = this.get('saw'), tur = this.get('turret');
    let n = 0;
    if (saw && p.mech.root.visible) {
      g.dmgSrc = 'saw';
      const L = lvOf(saw), R0 = L.radius * st.areaMul, big = L.big || 1;
      saw.ang = (saw.ang || 0) + L.spin * Math.sqrt(st.rateMul) * dt;
      const rings = L.ring2 ? [[L.blades / 2, R0, 1], [L.blades / 2, R0 * 0.55, -1.4]] : [[L.blades, R0, 1]];
      for (const [cnt, r, sp] of rings) for (let i = 0; i < cnt; i++) {
        const a = saw.ang * sp + (i / cnt) * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        if (live) en.each(x, z, 0.45 * big, (e) => {
          if ((e._saw || 0) > now) return;
          e._saw = now + 0.3;
          const c = Math.random() < st.crit, D = L.dmg * st.dmgMul;
          en.hit(e, c ? D * 2 : D, Math.sin(a + 1.57 * sp), Math.cos(a + 1.57 * sp), 4, { crit: c, quiet: !c });
          fx.shrapnel([x, 1, z], 5, [[1, 1, 0.8], [1, 0.8, 0.3], [1, 0.5, 0.15]], { dir: [Math.sin(a + 1.57 * sp), Math.cos(a + 1.57 * sp)], spread: 1.2, speed: [4, 9], life: [0.12, 0.25], up: [1, 3] });
          g.sfx.play('tink', { pitch: 0.7 });
        });
        const vk = this.vk('saw'), bs = big * 1.35 * vk;
        if (n < this.sawMesh.capacity) this.sawMesh.setAt(n++, m4.fromTRS([x, 1, z], [0, now * 18 * sp, 0], [bs, 1, bs]), saw.evo ? [1.3, 1.05, 0.7] : [1.15, 1.15, 1.15], 0.35);
        if (live && dt > 0) fx.pxr.emit({ position: [x, 1, z], velocity: [0, 0, 0], life: 0.12, size: Math.round(2 * Math.min(1.6, vk)), sizeEnd: 1, ramp: saw.evo ? [[1, 0.9, 0.5], [0.8, 0.5, 0.2]] : [[0.85, 0.92, 1], [0.45, 0.5, 0.65]], emissive: 0.5, hard: true });
      }
    }
    this.sawMesh.count = n; this.sawMesh.dirty = true;

    const nb = tur && p.mech.root.visible ? lvOf(tur).beams : 0;
    if (nb) {
      g.dmgSrc = 'turret';
      const L = lvOf(tur), len = L.len * st.rangeMul, vk = this.vk('turret'), mz = [p.x, 1.0 * (p.size || 1), p.z];
      tur.ang = (tur.ang || 0) + L.spin * Math.sqrt(st.rateMul) * dt;
      if (live) en.each(p.x, p.z, len, (e) => {
        if ((e._tur || 0) > now) return;
        const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1, ea = Math.atan2(dx, dz);
        for (let i = 0; i < nb; i++) {
          if (Math.abs(wrapA(ea - tur.ang - (i / nb) * Math.PI * 2)) * d > 0.35 + e.r) continue;
          e._tur = now + 0.22;
          const c = Math.random() < st.crit, D = L.dmg * st.dmgMul;
          en.hit(e, c ? D * 2 : D, dx / d, dz / d, 2, { crit: c, quiet: !c });
          fx.hitSpark([e.x, 1, e.z], [1, 0.4, 0.55], 3);
          break;
        }
      });
      if (live && Math.random() < 0.15) g.sfx.play('beam', { vol: 0.12, pitch: 2 });
      this.turretBeams.forEach((b, i) => {
        const on = i < nb;
        b.m.visible = b.core.visible = on;
        if (!on) return;
        const a = tur.ang + (i / nb) * Math.PI * 2, w = (0.46 + Math.sin(now * 40 + i) * 0.05) * vk, sa = Math.sin(a), ca = Math.cos(a), col = tur.evo ? [0.6, 0.85, 1] : [1, 0.35, 0.55];
        const o = [mz[0] + sa * 0.6, mz[1], mz[2] + ca * 0.6];
        b.m.position = b.core.position = o;
        b.m.rotation = b.core.rotation = [0, a, 0];
        b.m.scale = [w, w, len]; b.core.scale = [w * 0.45, w * 0.45, len];
        b.m.material.color = col;
        if (live && dt > 0) {
          // 빔이 지나간 바닥에 그을린 불씨, 끝에서 튀는 불꽃, 줄기를 따라 반짝이는 점
          const ramp = [[1, 1, 1], col, col.map((v) => v * 0.55), [0.3, 0.12, 0.18]];
          for (let k = 0; k < 2; k++) { const d = rr(1, len); fx.px.emit({ position: [o[0] + sa * d, 0.1, o[2] + ca * d], velocity: [rr(-0.6, 0.6), rr(0.5, 2), rr(-0.6, 0.6)], life: rr(0.25, 0.5), size: Math.round(rr(1, 2.5)), sizeEnd: 1, ramp: ramp.slice(1), emissive: 0.7, gravity: 0.2, hard: true }); }
          fx.shrapnel([o[0] + sa * len, o[1], o[2] + ca * len], 2, ramp, { speed: [3, 7], life: [0.12, 0.25], up: [1, 4] });
          const d = rr(0.5, len); fx.pxr.emit({ position: [o[0] + sa * d, o[1] + rr(-0.2, 0.2) * w, o[2] + ca * d], velocity: [0, rr(0.5, 1.5), 0], life: 0.15, size: 2, sizeEnd: 1, ramp, emissive: 0.8, hard: true });
        }
      });
      if (live && Math.random() < 0.3) fx.light([mz[0], 1.5, mz[2]], tur.evo ? [0.6, 0.85, 1] : [1, 0.35, 0.5], len, 0.5, 0.1);
    } else for (const b of this.turretBeams) b.m.visible = b.core.visible = false;
  }
  hideOrbitals() { this.sawMesh.count = 0; this.sawMesh.dirty = true; for (const b of this.turretBeams) b.m.visible = b.core.visible = false; }

  // 판넬 비트
  syncBits() {
    const g = this.game, w = this.get('funnel');
    const n = w ? lvOf(w).bits + (g.player.stats?.sets?.has('hive') ? 4 : 0) : 0;
    while (this.bits.length > n) g.scene.remove(this.bits.pop().mesh);
    const P = g.player.mech?.paint;
    while (this.bits.length < n && P) {
      const mesh = g.scene.add(new Mesh(funnelBitGeo(P), new Material()));
      this.bits.push({ mesh, cd: R(), x: g.player.x, y: 2, z: g.player.z });
    }
    this.updateOrbitals(0, false);
  }
  updateBits(dt) {
    const g = this.game, p = g.player, fx = g.fx, w = this.get('funnel');
    if (!w || !this.bits.length) return;
    const L = lvOf(w);
    this.bitT += dt;
    this.bits.forEach((b, i) => {
      const a = this.bitT * 1.6 + (i / this.bits.length) * Math.PI * 2;
      const tx = p.x + Math.sin(a) * 1.9, tz = p.z + Math.cos(a) * 1.9, ty = 2.3 + Math.sin(this.bitT * 3 + i) * 0.2;
      const k = 1 - Math.exp(-14 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z += (tz - b.z) * k;
      b.cd -= dt * p.stats.rateMul;
      let yaw = a + Math.PI / 2;
      const t = g.enemies.nearest(b.x, b.z, WEAPONS.funnel.range);
      if (t) yaw = Math.atan2(t.x - b.x, t.z - b.z);
      if (t && b.cd <= 0) {
        b.cd = L.cd * rr(0.9, 1.1) * (p.stats.sets?.has('hive') ? 0.67 : 1);
        const c = R() < p.stats.crit, D = L.dmg * p.stats.dmgMul;
        const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
        g.shots.add({ x: b.x, y: b.y - 0.5, z: b.z, vx: (dx / d) * 34, vz: (dz / d) * 34, dmg: c ? D * 2 : D, crit: c, life: 0.5, color: [0.45, 1, 0.95], scale: [0.15, 0.15, 0.9], knock: 1.5, quiet: !c });
        fx.muzzle([b.x, b.y, b.z], [dx / d, 0, dz / d], [0.5, 1, 0.9], 1);
        g.sfx.play('mg', { vol: 0.35, pitch: 1.5 });
      }
      b.mesh.position = [b.x, b.y, b.z];
      b.mesh.rotation = [0.5, yaw, 0];
      const vk = this.vk('funnel'); b.mesh.scale = [1.4 * vk, 1.4 * vk, 1.4 * vk];
      if (dt > 0) fx.pxr.emit({ position: [b.x, b.y, b.z], velocity: [0, 0, 0], life: 0.12, size: 2, sizeEnd: 1, ramp: [[0.6, 1, 0.95], [0.3, 0.6, 0.6]], emissive: 0.6, hard: true });
    });
  }
}
