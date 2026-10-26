// 메타 진행: 런마다 고철을 모아 격납고에서 부품 해금 + 영구 연구
//  저장: localStorage 'mf-meta' { scrap, unlocked: { 'legs:quad': true, ... }, research: { hp: 2, ... } }

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

export class Meta {
  constructor() {
    this.data = { scrap: 0, unlocked: {}, research: {} };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 저장 불가 */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 무시 */ } }
  get scrap() { return this.data.scrap; }
  isUnlocked(kind, id) { return !PRICES[kind]?.[id] || !!this.data.unlocked[`${kind}:${id}`]; }
  price(kind, id) { return PRICES[kind]?.[id] || 0; }
  unlock(kind, id) {
    const p = this.price(kind, id);
    if (this.isUnlocked(kind, id) || this.data.scrap < p) return false;
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

  // 런 결과로 고철 계산 + 적립
  reward(r) {
    const gain = Math.round(r.kills * 0.12 + r.depth * 14 + (r.win ? 150 : 0) + r.level * 2);
    this.data.scrap += gain; this.save();
    return gain;
  }
}
