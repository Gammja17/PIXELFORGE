// 런 규칙(위협 등급, 파일럿)과 런 통계(무기별 피해, 중간 보스 처치)를 다른 모듈 위에 덧씌운다.
//  rooms / enemies / pickups / player 파일은 고치지 않고 인스턴스 메서드를 감싸기만 한다.
//
//  game.mods (startRun 에서 progress.runMods 로 만든다. 격납고에서는 파일럿만 반영):
//    enemyHp, enemyDmg, density  rooms.scale() 결과에 곱함 → enemies.k 로 모든 적 체력/피해/물량에 반영
//    bossHp                      중간 보스/수호자/타이탄은 자기 체력 공식을 써서 따로 곱함 (enemyHp × bossHp)
//    extraMids                   전투 방마다 중간 보스 추가 수 (planMids)
//    roomTime                    전투 방 제한 시간 배율
//    noKits, healMul             수리 키트 드롭 금지, 모든 회복량 배율
//    stats { mul, add }          플레이어 능력치에 곱하고 더하는 값 (파일럿, 취약 프레임)
//  rooms.js / enemies.js 가 나중에 game.mods 를 직접 읽게 되면 여기서 해당 감싸기를 지우면 된다.
//
//  game.dmgSrc: 지금 피해를 주는 무기 id. 무기 호출을 감싸서 정하고, 남아서 나중에 터지는 것
//  (탄, 지뢰, 원반, 폭발)은 weapons.js / 여기서 src 를 찍어 둔다 → game.stats.byWeapon

import { MIDBOSS_TYPES } from './midbosses.js';

export const NO_MODS = {
  threat: 0, enemyHp: 1, enemyDmg: 1, density: 1, bossHp: 1, extraMids: 0, roomTime: 1,
  noKits: false, healMul: 1, stats: { mul: {}, add: {} }, chips: 0, scrapMul: 1,
};

// 능력치에 파일럿/위협 배율 덧씌우기 (격납고 능력치 막대도 같이 쓴다)
export function applyStatMods(st, { mul, add }) {
  for (const k in mul) st[k] *= mul[k];
  for (const k in add) st[k] += add[k];
  st.maxHp = Math.max(1, Math.round(st.maxHp));
  return st;
}

// obj.name 을 fn(원래 함수, ...인자) 로 바꾼다
const wrap = (obj, name, fn) => { const orig = obj[name].bind(obj); obj[name] = (...a) => fn(orig, ...a); };

export function installRunHooks(game) {
  const { rooms, enemies: en, pickups, player: p, weapons: ws, shots } = game;
  const M = () => game.mods || NO_MODS;
  const scaleHp = (e, k) => { if (e && k !== 1) { e.hp *= k; e.maxHp *= k; } };

  // ---- 위협 등급 ----
  wrap(rooms, 'scale', (orig) => {
    const s = orig(), m = M();
    return { ...s, hp: s.hp * m.enemyHp, swarmHp: s.swarmHp * m.enemyHp, dmg: s.dmg * m.enemyDmg, dens: s.dens * m.density };
  });
  wrap(rooms, 'planMids', (orig) => {
    const out = orig(), n = M().extraMids;
    if (n && rooms.depth >= 1) out.push(...[0.22, 0.58].slice(0, n));
    return out;
  });
  wrap(rooms, 'enter', (orig, ...a) => { orig(...a); if (rooms.duration > 0) rooms.duration *= M().roomTime; });
  wrap(en, 'spawnMid', (orig, ...a) => { const m = orig(...a); scaleHp(m?.e, M().enemyHp); return m; });
  wrap(en, 'spawnGuardian', (orig, ...a) => {
    orig(...a);
    const k = M().enemyHp * M().bossHp;
    for (const e of en.list) if (e.guard && e.guard === en.guardian) scaleHp(e, k);
  });
  wrap(en, 'spawnBoss', (orig, ...a) => { orig(...a); scaleHp(en.boss, M().enemyHp * M().bossHp); });
  wrap(pickups, 'drop', (orig, kind, ...a) => { if (!(kind === 'kit' && M().noKits)) orig(kind, ...a); });
  wrap(p, 'heal', (orig, v) => orig(v * M().healMul));

  // ---- 파일럿 / 취약 프레임: 능력치를 다시 계산할 때마다 덧씌운다 ----
  wrap(p, 'refreshStats', (orig) => {
    const prevMax = p.stats?.maxHp, prevHp = p.hp;
    orig();
    const st = applyStatMods(p.stats, M().stats);
    if (prevMax !== undefined && prevHp !== undefined) p.hp = Math.min(st.maxHp, st.maxHp > prevMax ? prevHp + st.maxHp - prevMax : prevHp);
  });

  // ---- 런 통계: 실제로 깎은 체력을 무기별로 ----
  wrap(en, 'hit', (orig, e, ...a) => {
    const before = e.hp;
    orig(e, ...a);
    const done = before - Math.max(0, e.hp), S = game.stats;
    if (done > 0 && S?.byWeapon) { const k = game.dmgSrc || 'other'; S.byWeapon[k] = (S.byWeapon[k] || 0) + done; }
  });
  wrap(en, 'kill', (orig, e) => { if (!e.dead && MIDBOSS_TYPES[e.type] && game.stats) game.stats.mids = (game.stats.mids || 0) + 1; orig(e); });

  // 피해 출처 정하기
  const as = (src, fn) => { const prev = game.dmgSrc; game.dmgSrc = src; try { return fn(); } finally { game.dmgSrc = prev; } };
  for (const name of ['fire', 'slash', 'flame', 'whip']) wrap(ws, name, (orig, w, ...a) => as(w ? w.id : 'fist', () => orig(w, ...a)));
  wrap(ws, 'special', (orig) => as(ws.primaryKind, orig));
  wrap(ws, 'updateBarrage', (orig, dt) => as(ws.primaryKind, () => orig(dt)));
  wrap(ws, 'updateBits', (orig, dt) => as('funnel', () => orig(dt)));
  wrap(ws, 'updateBurns', (orig, dt) => as('flamer', () => orig(dt)));
  wrap(ws, 'updateWaves', (orig, dt) => as('stomp', () => orig(dt)));
  // updateOrbitals / Shots.update 는 안에서 대상마다 dmgSrc 를 바꾸므로 끝나면 되돌린다
  wrap(ws, 'updateOrbitals', (orig, ...a) => as(null, () => orig(...a)));
  wrap(shots, 'update', (orig, dt) => as(null, () => orig(dt)));
  // 연쇄 폭발: 터뜨린 무기 이름을 폭발에 찍어 두고, 터질 때 출처별로 나눠서 처리
  wrap(en, 'blast', (orig, ...a) => { const n = en.blasts.length; orig(...a); if (en.blasts.length > n) en.blasts[en.blasts.length - 1].src = game.dmgSrc || null; });
  wrap(en, 'updateBlasts', (orig, dt) => {
    const all = en.blasts, srcs = new Set(all.map((b) => b.src ?? null));
    if (srcs.size <= 1) { as(all[0]?.src ?? null, () => orig(dt)); return; }
    const rest = [];
    for (const s of srcs) { en.blasts = all.filter((b) => (b.src ?? null) === s); as(s, () => orig(dt)); rest.push(...en.blasts); }
    en.blasts = rest;
  });
}
