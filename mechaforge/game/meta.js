// 메타 진행: 런마다 고철을 모아 격납고에서 부품 해금 + 영구 연구, 위협 등급, 파일럿, 업적
//  저장: localStorage 'mf-meta' {
//    v: 형식 버전 (META_VERSION, 없으면 0 = 버전 필드 이전 저장),
//    scrap, unlocked: { 'legs:quad': true, 'pilot:ace': true, ... }, research: { hp: 2, ... },
//    threat: { armor: 2, ... }  고른 위협 단계,  bestThreat: 격파한 최고 위협 점수 (-1 = 아직 승리 없음),
//    pilot, ach: { firstwin: 시각 }, life: { runs, wins, scrap, stationUps, pilotWins: { ace: 1 } } }

import { THREATS, PILOTS, ACHIEVEMENTS, REWARD_ONLY, threatScore, rewardText } from './progress.js';

const KEY = 'mf-meta';

// 해금 가격 (0 = 처음부터 열림)
export const PRICES = {
  legs: { walker: 0, reverse: 60, treads: 120, quad: 150, hover: 220, wheels: 140, stomper: 180, spider: 200, tankbase: 240, jet: 260 },
  frame: { standard: 0, light: 80, heavy: 120, sniper: 160, egg: 100, ninja: 140, tank: 180, fighter: 200, fortress: 240 },
  head: { vfin: 0, mono: 50, visor: 90, horned: 130, dome: 70, periscope: 80, canopy: 110, samurai: 150, skull: 170 },
  weapon: { saber: 0, mg: 0, shotgun: 90, laser: 150, missile: 180 },
  paint: { rx: 0, crimson: 0, olive: 30, midnight: 40, sakura: 50, desert: 40, ace: 60, stealth: 70, toxic: 60, gold: 120 },
};

// 연구 (영구 강화): 레벨마다 가격 상승
export const RESEARCH = {
  hp:     { name: '장갑 연구', desc: '시작 최대 체력 +12', max: 5, base: 40, icon: 'frame' },
  dmg:    { name: '출력 연구', desc: '모든 피해 +6%', max: 5, base: 50, icon: 'power' },
  xp:     { name: '데이터 분석', desc: '경험치 +8%', max: 5, base: 45, icon: 'xp' },
  magnet: { name: '회수 드론', desc: '회수 범위 +20%', max: 3, base: 35, icon: 'field' },
  od:     { name: '오버드라이브 코일', desc: '오버드라이브 게이지 충전 +15%', max: 3, base: 60, icon: 'servo' },
  revive: { name: '비상 재기동', desc: '런마다 1번, 쓰러지면 체력 40%로 재기동', max: 1, base: 300, icon: 'repair' },
};
export const researchCost = (id, lv) => Math.round(RESEARCH[id].base * Math.pow(1.6, lv));

const LIFE = { runs: 0, wins: 0, scrap: 0, stationUps: 0, pilotWins: {} };

// ---- 저장 형식 버전 + 이전 ----
// 형식을 바꾸면 META_VERSION 을 올리고 migrateMeta 에 단계를 하나 더 붙인다
export const META_VERSION = 1;
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const num = (n, d) => (Number.isFinite(n) ? n : d);
// 아무 버전의 mf-meta → 지금 버전. 모르는 칸은 그대로 둔다
export function migrateMeta(raw) {
  const d = { ...obj(raw) };
  const v = Number.isInteger(d.v) ? d.v : 0;
  if (v < 1) {
    // v0 (버전 필드 이전): 첫 판은 scrap/unlocked/research 만 있었다. 빠진 칸을 채우고 타입을 바로잡는다
    d.scrap = Math.max(0, Math.floor(num(Number(d.scrap), 0)));
    for (const k of ['unlocked', 'research', 'threat', 'ach']) d[k] = obj(d[k]);
    d.bestThreat = num(d.bestThreat, -1);
    if (typeof d.pilot !== 'string') d.pilot = 'rookie';
    const L = obj(d.life);
    d.life = { ...LIFE, ...L, pilotWins: obj(L.pilotWins) };
  }
  d.v = Math.max(v, META_VERSION);
  return d;
}

export class Meta {
  constructor() {
    this.data = { v: META_VERSION, scrap: 0, unlocked: {}, research: {}, threat: {}, bestThreat: -1, pilot: 'rookie', ach: {} };
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* 저장 불가 */ }
    if (raw) Object.assign(this.data, migrateMeta(raw));
    this.data.life = { ...LIFE, ...this.data.life };
    if (!PILOTS[this.data.pilot] || !this.isUnlocked('pilot', this.data.pilot)) this.data.pilot = 'rookie';
    if (raw && raw.v !== this.data.v) this.save(); // 이전한 저장은 바로 새 형식으로 써 둔다
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 무시 */ } }
  get scrap() { return this.data.scrap; }
  // 업적 전용 (파일럿, 특별 도색)은 보상으로만 열린다
  isUnlocked(kind, id) { const k = `${kind}:${id}`; return REWARD_ONLY.has(k) ? !!this.data.unlocked[k] : !PRICES[kind]?.[id] || !!this.data.unlocked[k]; }
  price(kind, id) { return PRICES[kind]?.[id] || 0; }
  unlock(kind, id) {
    const p = this.price(kind, id);
    if (this.isUnlocked(kind, id) || REWARD_ONLY.has(`${kind}:${id}`) || this.data.scrap < p) return false;
    this.data.scrap -= p; this.data.unlocked[`${kind}:${id}`] = true; this.save();
    return true;
  }
  level(id) { return this.data.research[id] || 0; }
  research(id) {
    const lv = this.level(id), R = RESEARCH[id];
    if (lv >= R.max) return false;
    const c = researchCost(id, lv);
    if (this.data.scrap < c) return false;
    this.data.scrap -= c; this.data.research[id] = lv + 1; this.save();
    return true;
  }
  // 플레이어 능력치에 들어가는 연구 보너스
  ups() { return { _mhp: this.level('hp'), _mdmg: this.level('dmg'), _mxp: this.level('xp'), _mmag: this.level('magnet'), _mod: this.level('od') }; }

  // ---- 파일럿 ----
  get pilot() { return this.data.pilot; }
  setPilot(id) { if (!this.isUnlocked('pilot', id)) return false; this.data.pilot = id; this.save(); return true; }

  // ---- 위협 등급: 첫 승리 뒤에 열린다 ----
  get threatOpen() { return this.data.life.wins > 0; }
  threatRank(id) { return Math.min(THREATS[id].max, this.data.threat[id] || 0); }
  // 누를 때마다 0 → 1 → … → max → 0
  cycleThreat(id) { if (!this.threatOpen) return; this.data.threat[id] = (this.threatRank(id) + 1) % (THREATS[id].max + 1); this.save(); }
  get threatSel() { return this.threatOpen ? this.data.threat : {}; }
  get threat() { return threatScore(this.threatSel); }
  get bestThreat() { return this.data.bestThreat; }

  // ---- 업적 ----
  count(key, n = 1) { this.data.life[key] = (this.data.life[key] || 0) + n; this.save(); }
  achieved(id) { return !!this.data.ach[id]; }
  get achCount() { return ACHIEVEMENTS.filter((a) => this.achieved(a.id)).length; }
  grant(rw) {
    if (rw.kind === 'scrap') { this.data.scrap += rw.n; return rewardText(rw); }
    const k = `${rw.kind}:${rw.id}`;
    // 이미 고철로 산 부품이면 가격만큼 돌려준다
    if (!REWARD_ONLY.has(k) && this.isUnlocked(rw.kind, rw.id)) { const p = this.price(rw.kind, rw.id); this.data.scrap += p; return `${rewardText(rw)} (보유 중: 고철 +${p})`; }
    this.data.unlocked[k] = true;
    return rewardText(rw);
  }

  // 업적 기능 이전 저장(best2.win)에 승리 기록이 있으면 첫 승리로 쳐 준다
  migrateWin() {
    const d = this.data;
    if (d.life.wins) return;
    d.life.wins = 1; d.bestThreat = Math.max(0, d.bestThreat);
    const a = ACHIEVEMENTS.find((q) => q.id === 'firstwin');
    if (!d.ach[a.id]) { d.ach[a.id] = Date.now(); this.grant(a.reward); }
    this.save();
  }

  // ---- 런 종료: 고철 계산 + 기록 + 업적. r = main.js runSummary ----
  finishRun(r) {
    const d = this.data, L = d.life;
    const base = r.kills * 0.12 + r.depth * 14 + (r.win ? 150 : 0) + r.level * 2;
    const gain = Math.round(base * r.scrapMul);
    // 위협 신기록 보너스: 이전 최고보다 1점 높을 때마다 40
    const newBest = r.win && r.threat > d.bestThreat;
    const bonus = newBest ? Math.max(0, r.threat - Math.max(0, d.bestThreat)) * 40 : 0;
    if (newBest) d.bestThreat = r.threat;
    d.scrap += gain + bonus;
    L.runs++; L.scrap += gain + bonus;
    if (r.win) { L.wins++; L.pilotWins[r.pilot] = (L.pilotWins[r.pilot] || 0) + 1; }
    const got = [];
    for (const a of ACHIEVEMENTS) if (!d.ach[a.id] && a.test(r, L)) { d.ach[a.id] = Date.now(); got.push({ name: a.name, reward: this.grant(a.reward) }); }
    this.save();
    return { gain, bonus, newBest, achieved: got };
  }
}

// ---- 저장 내보내기 / 가져오기 ----
// 게임이 쓰는 localStorage 키는 모두 'mf-' 나 'mechaforge.' 로 시작한다:
//  mf-meta (고철·해금·연구·업적·누적 기록), mf-mute, mf-shake (설정),
//  mechaforge.tutorial / .tips (튜토리얼·팁), .loadout2 (고른 부품), .best2 (최고 기록),
//  .archSeen (본 기체 계열), .zones / .boss (지난 런 구역·보스, 겹치지 않게 고를 때 씀)
// 새 키도 같은 접두어면 저절로 들어간다
export const SAVE_FORMAT = 1;
const isOurs = (k) => k.startsWith('mf-') || k.startsWith('mechaforge.');
const ourKeys = () => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isOurs(k)) out.push(k); } return out; };

// 지금 저장 → 파일에 쓸 묶음. 값은 localStorage 문자열 그대로
export function exportSave() {
  const keys = {};
  for (const k of ourKeys().sort()) keys[k] = localStorage.getItem(k);
  return { game: 'mechaforge', format: SAVE_FORMAT, metaVersion: META_VERSION, saved: new Date().toISOString(), keys };
}

// 확인 창에 보여 줄 요약
export function saveSummary(meta) {
  const m = migrateMeta(meta);
  return {
    scrap: m.scrap,
    unlocks: Object.values(m.unlocked).filter(Boolean).length,
    research: Object.values(m.research).reduce((s, n) => s + (Number(n) || 0), 0),
    ach: ACHIEVEMENTS.filter((a) => m.ach[a.id]).length, achTotal: ACHIEVEMENTS.length,
    runs: m.life.runs, wins: m.life.wins,
  };
}

// 붙여넣거나 파일에서 읽은 글 → 검증·이전된 묶음. 틀리면 Error (메시지는 화면에 그대로 띄운다)
export function parseSave(text) {
  let s;
  try { s = JSON.parse(String(text).trim()); } catch { throw new Error('JSON 형식이 아니에요. 내보낸 글 전체를 그대로 붙여 넣어 주세요.'); }
  if (!s || typeof s !== 'object' || s.game !== 'mechaforge') throw new Error('MechaForge 저장 데이터가 아니에요.');
  if (!Number.isInteger(s.format) || s.format < 1) throw new Error('저장 형식 버전(format)이 없거나 잘못됐어요.');
  if (s.format > SAVE_FORMAT) throw new Error(`더 새 버전 게임에서 만든 저장이에요 (형식 ${s.format}). 게임을 새로 고친 뒤 다시 해 보세요.`);
  if (!s.keys || typeof s.keys !== 'object' || Array.isArray(s.keys)) throw new Error('저장 내용(keys)이 없어요.');
  const keys = {};
  for (const [k, v] of Object.entries(s.keys)) {
    if (!isOurs(k)) continue; // 다른 게임 키는 버린다
    if (typeof v !== 'string') throw new Error(`'${k}' 값 형식이 잘못됐어요.`);
    keys[k] = v;
  }
  if (keys[KEY] === undefined) throw new Error('메타 진행(mf-meta)이 들어 있지 않아요.');
  let meta;
  try { meta = JSON.parse(keys[KEY]); } catch { throw new Error('메타 진행(mf-meta) 데이터가 깨졌어요.'); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('메타 진행(mf-meta) 데이터가 깨졌어요.');
  if (Number.isInteger(meta.v) && meta.v > META_VERSION) throw new Error(`더 새 버전 게임의 진행 데이터예요 (v${meta.v}). 게임을 새로 고친 뒤 다시 해 보세요.`);
  meta = migrateMeta(meta);
  keys[KEY] = JSON.stringify(meta);
  return { saved: typeof s.saved === 'string' ? s.saved : '', keys, summary: saveSummary(meta) };
}

// 덮어쓰기: 지금 키를 모두 지우고 묶음을 쓴다. 쓰다 실패하면 원래대로 돌린다.
// 메모리에 든 게임 상태가 다시 쓰지 않게 부른 쪽이 바로 새로 고침한다
export function applySave(save) {
  const before = {};
  for (const k of ourKeys()) before[k] = localStorage.getItem(k);
  try {
    for (const k in before) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(save.keys)) localStorage.setItem(k, v);
  } catch (e) {
    for (const k of ourKeys()) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(before)) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } }
    throw new Error(`저장 공간에 쓰지 못했어요 (${e.message || e}).`);
  }
}
