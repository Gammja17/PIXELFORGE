// 반복 플레이 콘텐츠: 위협 등급(하데스 Heat 식 난이도 조절), 파일럿, 업적
//  상태 저장과 보상 지급은 meta.js, 런 규칙 적용은 runhooks.js (game.mods)

import { PAINTS, LEGS, FRAMES, HEADS } from './parts.js';
import { WEAPONS } from './weapons.js';
import { PIX } from './icons.js';

// ---- 위협 등급 ----
//  첫 타이탄 격파 후 열린다. 단계마다 pts 만큼 위협 점수가 오르고, 점수 1마다 고철 +10%
export const THREATS = {
  armor:   { name: '강화 장갑', max: 3, pts: 1, icon: 'frame', desc: (n) => `적 체력 +${n * 25}%` },
  power:   { name: '과충전 화기', max: 3, pts: 1, icon: 'power', desc: (n) => `적 공격 피해 +${n * 20}%` },
  swarm:   { name: '대군세', max: 2, pts: 1, icon: 't_swarm', desc: (n) => `적 물량 +${n * 20}%` },
  mids:    { name: '중간 보스 증원', max: 2, pts: 2, icon: 'boss', desc: (n) => `전투 방마다 중간 보스 +${n}` },
  nokit:   { name: '보급 차단', max: 1, pts: 2, icon: 't_nokit', desc: () => '수리 키트가 떨어지지 않고, 모든 수리량 -40%' },
  long:    { name: '장기전', max: 2, pts: 1, icon: 't_clock', desc: (n) => `전투 시간 +${n * 25}%` },
  fragile: { name: '취약 프레임', max: 2, pts: 1, icon: 'repair', desc: (n) => `내 최대 체력 -${n * 20}%` },
  titan:   { name: '각성 거신', max: 2, pts: 1, icon: 'elite', desc: (n) => `수호자와 타이탄 체력 +${n * 40}%` },
};
export const THREAT_MAX = Object.values(THREATS).reduce((s, T) => s + T.max * T.pts, 0);
export const threatScore = (sel = {}) => Object.entries(THREATS).reduce((s, [id, T]) => s + Math.min(T.max, sel[id] || 0) * T.pts, 0);
export const threatScrapMul = (score) => 1 + score * 0.1;

// ---- 파일럿: 장점 하나 + 작은 단점 하나 ----
//  stats.mul / stats.add 는 플레이어 능력치(computeStats 결과)에 곱하고 더한다
export const PILOTS = {
  rookie:    { name: '레오', role: '신참', icon: 'p_rookie', perk: '특별한 장점은 없지만 단점도 없다', flaw: '', stats: {} },
  ace:       { name: '카이', role: '에이스', icon: 'p_ace', perk: '기동 +12%, 대시 충전 시간 -25%', flaw: '최대 체력 -15%', stats: { mul: { speed: 1.12, dashCd: 0.75, maxHp: 0.85 } } },
  engineer:  { name: '미나', role: '정비공', icon: 'p_engineer', perk: '출격 때 정비 포인트 +2, 회복량 +35%', flaw: '주는 피해 -8%', stats: { mul: { dmgMul: 0.92 } }, chips: 2, healMul: 1.35 },
  berserker: { name: '구로', role: '광전사', icon: 'p_berserker', perk: '주는 피해 +18%, 치명 +6%', flaw: '받는 피해 +20%', stats: { mul: { dmgMul: 1.18, dmgTaken: 1.2 }, add: { crit: 0.06 } } },
  scav:      { name: '도크', role: '고물상', icon: 'p_scav', perk: '고철 +30%, 회수 범위 +30%', flaw: '경험치 -12%', stats: { mul: { magnet: 1.3, xpMul: 0.88 } }, scrapMul: 1.3 },
};

// 이번 런의 규칙 (runhooks.js 가 읽는다). 위협 선택 + 파일럿 → 배율/플래그
export function runMods(threatSel = {}, pilotId = 'rookie') {
  const n = (id) => Math.min(THREATS[id].max, threatSel[id] || 0), P = PILOTS[pilotId] || PILOTS.rookie;
  const mul = { ...P.stats.mul }, add = { ...P.stats.add };
  if (n('fragile')) mul.maxHp = (mul.maxHp || 1) * (1 - n('fragile') * 0.2);
  const threat = threatScore(threatSel);
  return {
    threat, pilot: pilotId,
    enemyHp: 1 + n('armor') * 0.25, enemyDmg: 1 + n('power') * 0.2, density: 1 + n('swarm') * 0.2,
    bossHp: 1 + n('titan') * 0.4, extraMids: n('mids'), roomTime: 1 + n('long') * 0.25,
    noKits: n('nokit') > 0, healMul: (n('nokit') ? 0.6 : 1) * (P.healMul || 1),
    stats: { mul, add }, chips: P.chips || 0,
    scrapMul: threatScrapMul(threat) * (P.scrapMul || 1),
  };
}

// ---- 업적 ----
//  test(r, life): r = 이번 런 요약 (main.js runSummary), life = 누적 기록 (meta.data.life)
//  reward: pilot / paint (업적 전용) 또는 격납고 부품(이미 샀으면 가격만큼 고철 환급) 또는 고철
export const ACHIEVEMENTS = [
  { id: 'firstwin', name: '타이탄 격파', desc: '처음으로 타이탄 쓰러뜨리기 (위협 등급 해금)', test: (r) => r.win, reward: { kind: 'pilot', id: 'ace' } },
  { id: 'deep5', name: '전선 돌파', desc: '한 번에 방 5개 돌파', test: (r) => r.rooms >= 5, reward: { kind: 'legs', id: 'hover' } },
  { id: 'mid5', name: '중간 보스 사냥꾼', desc: '한 런에서 중간 보스 5기 격파', test: (r) => r.mids >= 5, reward: { kind: 'pilot', id: 'berserker' } },
  { id: 'combo300', name: '연쇄 반응', desc: '300 연속 처치', test: (r) => r.combo >= 300, reward: { kind: 'head', id: 'skull' } },
  { id: 'kills2k', name: '고철 폭풍', desc: '한 런에서 2000기 처치', test: (r) => r.kills >= 2000, reward: { kind: 'legs', id: 'spider' } },
  { id: 'evolve', name: '진화', desc: '무기 진화시키기', test: (r) => r.evolved, reward: { kind: 'head', id: 'samurai' } },
  { id: 'transcend', name: '초월자', desc: '세트 3개로 초월 달성', test: (r) => r.transcend, reward: { kind: 'paint', id: 'transcend' } },
  { id: 'jetwin', name: '제트 에이스', desc: '제트 다리로 승리', test: (r) => r.win && r.sel.legs === 'jet', reward: { kind: 'paint', id: 'skyace' } },
  { id: 'saberwin', name: '검의 길', desc: '빔 사벨을 주무장으로 승리', test: (r) => r.win && r.sel.weapon === 'saber', reward: { kind: 'paint', id: 'blade' } },
  { id: 'station10', name: '정비의 달인', desc: '정비 기지에서 강화/진화 누적 10회', test: (r, L) => L.stationUps >= 10, reward: { kind: 'pilot', id: 'engineer' } },
  { id: 'scrap1500', name: '고철 부자', desc: '고철 누적 1500 획득', test: (r, L) => L.scrap >= 1500, reward: { kind: 'pilot', id: 'scav' } },
  { id: 'runs10', name: '베테랑', desc: '출격 10회', test: (r, L) => L.runs >= 10, reward: { kind: 'paint', id: 'veteran' } },
  { id: 'nokit', name: '보급 없이', desc: '보급 차단을 켜고 승리', test: (r) => r.win && r.noKits, reward: { kind: 'scrap', n: 300 } },
  { id: 'threat5', name: '위협 5', desc: '위협 등급 5 이상으로 승리', test: (r) => r.win && r.threat >= 5, reward: { kind: 'paint', id: 'inferno' } },
  { id: 'threat10', name: '위협 10', desc: '위협 등급 10 이상으로 승리', test: (r) => r.win && r.threat >= 10, reward: { kind: 'paint', id: 'boss' } },
  { id: 'threat15', name: '위협 15', desc: '위협 등급 15 이상으로 승리', test: (r) => r.win && r.threat >= 15, reward: { kind: 'paint', id: 'void' } },
  { id: 'win_striker', name: '강습의 길', desc: '강습 계열로 승리', test: (r) => r.win && (r.sel.arch || 'striker') === 'striker', reward: { kind: 'scrap', n: 200 } },
  { id: 'win_siege', name: '포격의 길', desc: '포격 계열로 승리', test: (r) => r.win && r.sel.arch === 'siege', reward: { kind: 'scrap', n: 250 } },
  { id: 'win_carrier', name: '모함의 길', desc: '모함 계열로 승리', test: (r) => r.win && r.sel.arch === 'carrier', reward: { kind: 'scrap', n: 300 } },
  { id: 'win_bulwark', name: '중장의 길', desc: '중장 계열로 승리', test: (r) => r.win && r.sel.arch === 'bulwark', reward: { kind: 'scrap', n: 300 } },
  { id: 'boss_bastion', name: '요새 함락', desc: '요새 바스티온 격파', test: (r) => r.win && r.boss === 'bastion', reward: { kind: 'scrap', n: 300 } },
  { id: 'boss_ren', name: '그림자 사냥', desc: '그림자 렌 격파', test: (r) => r.win && r.boss === 'ren', reward: { kind: 'scrap', n: 300 } },
  { id: 'squad', name: '편대장', desc: '서로 다른 파일럿 3명으로 승리', test: (r, L) => Object.keys(L.pilotWins).length >= 3, reward: { kind: 'scrap', n: 400 } },
];

// 업적으로만 얻는 것 (고철로 못 산다)
export const REWARD_PAINTS = ['transcend', 'skyace', 'blade', 'veteran', 'inferno', 'boss', 'void'];
export const REWARD_ONLY = new Set([...REWARD_PAINTS.map((id) => `paint:${id}`), ...Object.keys(PILOTS).filter((id) => id !== 'rookie').map((id) => `pilot:${id}`)]);

const KIND_KO = { legs: '다리', frame: '프레임', head: '머리', weapon: '주무장', paint: '도색', pilot: '파일럿' };
const TABLES = { legs: LEGS, frame: FRAMES, head: HEADS, weapon: WEAPONS, paint: PAINTS, pilot: PILOTS };
export function rewardText(rw) {
  if (rw.kind === 'scrap') return `고철 +${rw.n}`;
  return `${KIND_KO[rw.kind]} ${TABLES[rw.kind][rw.id]?.name || rw.id}`;
}

// 업적 전용 도색 (parts.js 의 PAINTS 에 등록. transcend / boss 는 원래 있는 것)
Object.assign(PAINTS, {
  skyace:  { name: '스카이 에이스', main: [0.92, 0.94, 0.98], sub: [0.3, 0.62, 0.95], trim: [0.12, 0.15, 0.25], acc: [1, 0.3, 0.25], eye: [0.5, 1, 1] },
  blade:   { name: '검성', main: [0.95, 0.93, 0.9], sub: [0.85, 0.2, 0.4], trim: [0.15, 0.13, 0.18], acc: [0.95, 0.8, 0.4], eye: [1, 0.4, 0.8] },
  veteran: { name: '베테랑', main: [0.5, 0.52, 0.46], sub: [0.3, 0.31, 0.29], trim: [0.92, 0.5, 0.15], acc: [0.95, 0.85, 0.5], eye: [1, 0.55, 0.2] },
  inferno: { name: '인페르노', main: [0.2, 0.17, 0.17], sub: [0.95, 0.35, 0.12], trim: [0.1, 0.09, 0.1], acc: [1, 0.8, 0.25], eye: [1, 0.5, 0.15] },
  void:    { name: '보이드', main: [0.12, 0.1, 0.18], sub: [0.5, 0.25, 0.9], trim: [0.05, 0.05, 0.08], acc: [0.4, 1, 0.9], eye: [0.9, 0.4, 1] },
});

// 파일럿 얼굴, 위협/업적 아이콘 (icons.js 의 도트 아이콘 표에 등록)
Object.assign(PIX, {
  p_rookie:    ['..bbbbbb..', '.bbbbbbbb.', '.bccccccb.', '.bccccccb.', '.b######b.', '..#d##d#..', '..######..', '...#dd#...', '.wwwwwwww.', 'wwwbwwbwww'],
  p_ace:       ['..rrrrrr..', '.rrryyrrr.', '.rrryyrrr.', '.r######r.', '.rddddddr.', '..######..', '..##dd##..', '...####...', '.oooooooo.', 'ooyooooyoo'],
  p_engineer:  ['...oooo...', '..oooooo..', '.occoocco.', 'pp######pp', 'p##d##d##p', 'p########p', '.p##pp##p.', '...####...', '.yyyyyyyy.', 'yywyyyywyy'],
  p_berserker: ['w........w', 'ww.dddd.ww', '.wddddddw.', '.dddddddd.', '.drrddrrd.', '.dddddddd.', '..d#ww#d..', '...dddd...', '.rrrrrrrr.', 'rrdrrrrdrr'],
  p_scav:      ['...wwww...', '..wwwwww..', '.ww####ww.', '.wgg##ggw.', '.wgg##ggw.', '.w######w.', '.w##dd##w.', '.ww####ww.', 'oowwwwwwoo', 'owwwwwwwwo'],
  t_swarm:     ['..........', '.r.r..r.r.', '.rrr..rrr.', '.r.r..r.r.', '..........', '...r.r....', '...rrr....', '...r.r....', '..........', '..........'],
  t_nokit:     ['r........r', '.r..gg..r.', '..r.gg.r..', '.ggrggrgg.', '.gggrrggg.', '....rr....', '...rggr...', '..r.gg.r..', '.r......r.', 'r........r'],
  t_clock:     ['...####...', '..#....#..', '.#..y...#.', '.#..y...#.', '.#..yyy.#.', '.#......#.', '..#....#..', '...####...', '..........', '..........'],
  trophy:      ['.yyyyyyy..', 'yy.yyy.yy.', 'y..yyy..y.', '.y.yyy.y..', '..yyyyy...', '...yyy....', '....y.....', '...yyy....', '..ooooo...', '..........'],
  lock:        ['...www....', '..w...w...', '..w...w...', '.wwwwwww..', '.wdddddw..', '.wddwddw..', '.wddwddw..', '.wdddddw..', '.wwwwwww..', '..........'],
});
