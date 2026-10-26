// 업그레이드 카드: 무기 / 몸통 모듈 / 시스템(스탯) 중에서 뽑기 + 적용
//  kind 필터: 'part'(무기·모듈) / 'system'(스탯) / 'any'
//  각 카드에는 그림이 붙는다: 무기·모듈 = 엔진으로 렌더한 3D 픽셀 썸네일, 스탯 = 도트 아이콘

import { WEAPONS, MAX_LEVEL, EVOLUTIONS } from './weapons.js';
import { MODULES, SLOT_IDS, partPreview } from './parts.js';
import { STAT_UPS } from './player.js';
import { pixURL } from './icons.js';

export const MAX_WEAPONS = 5;

// 무기를 놓을 빈 슬롯 (선호 슬롯 우선)
export function freeSlot(weapons, prefer) {
  const used = new Set(weapons.map((w) => w.slot));
  const order = prefer === 'back' ? ['back'] : prefer === 'shoulder' ? ['shR', 'shL', 'armL'] : ['armR', 'armL', 'shR', 'shL'];
  return order.find((s) => !used.has(s) && SLOT_IDS.includes(s)) || null;
}
const SLOT_NAMES = { armR: '오른팔', armL: '왼팔', shR: '오른 어깨', shL: '왼 어깨', back: '등' };

export function rollChoices(game, kind = 'any', n = 3) {
  const p = game.player, ws = game.weapons.list, mods = p.loadout.modules, ups = p.ups;
  const pool = [];
  const armed = ws.filter((w) => w.id !== 'funnel').length;
  if (kind !== 'system') {
    for (const [id, W] of Object.entries(WEAPONS)) {
      const own = ws.find((w) => w.id === id);
      if (own) { if (own.level < MAX_LEVEL) pool.push({ kind: 'weapon', id, level: own.level + 1, w: 5, name: W.name, tag: W.tag, desc: W.levels[own.level].up, slot: own.slot }); }
      else {
        if (W.salvage) continue; // 노획 무기는 적에게서만
        const slot = freeSlot(ws, W.prefer);
        if ((id === 'funnel' ? !ws.some((w) => w.slot === 'back') : armed < MAX_WEAPONS) && slot) pool.push({ kind: 'weapon', id, level: 1, w: 3.2, name: W.name, tag: W.tag, desc: W.desc, isNew: true, slot });
      }
    }
    for (const [id, M] of Object.entries(MODULES)) {
      const lv = mods[id] || 0;
      if (M.salvage && !lv) continue;
      if (lv < M.max) pool.push({ kind: 'module', id, level: lv + 1, w: lv ? 2.5 : 3, name: M.name, tag: M.tag, desc: M.desc(lv + 1), isNew: !lv });
    }
  }
  if (kind !== 'part') {
    for (const [id, U] of Object.entries(STAT_UPS)) {
      const lv = ups[id] || 0;
      if (lv < U.max) pool.push({ kind: 'stat', id, level: lv + 1, w: kind === 'system' ? 3 : 1.6, name: U.name, tag: U.tag, desc: U.desc });
    }
  }
  // 진화: 최대 레벨 + 필요한 몸통 부품 → 거의 확정으로 등장
  const evo = [];
  if (kind !== 'system') for (const w of ws) {
    const E = EVOLUTIONS[w.id];
    if (E && !w.evo && w.level >= MAX_LEVEL && mods[E.need]) evo.push({ kind: 'evolve', id: w.id, level: 0, name: E.name, tag: E.tag, desc: `${WEAPONS[w.id].name} 진화. ${E.desc}`, slot: w.slot, isEvo: true });
  }
  const out = evo.slice(0, 1);
  while (out.length < n && pool.length) {
    const sum = pool.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * sum, i = 0;
    while ((r -= pool[i].w) > 0) i++;
    out.push(pool.splice(i, 1)[0]);
  }
  while (out.length < n) out.push({ kind: 'heal', id: 'repair', level: 0, name: '긴급 수리', tag: 'REPAIR', desc: '체력 50% 회복' });
  for (const c of out) {
    if (c.kind === 'evolve') { c.where = '무기 진화'; continue; }
    c.where = c.kind === 'weapon' ? `${SLOT_NAMES[c.slot] || ''}${c.slot?.startsWith('arm') ? ', 직접 조작' : ', 자동 사격'}` : c.kind === 'module' ? '몸통 부품' : c.kind === 'stat' ? '시스템 튜닝' : '정비';
  }
  return out;
}

// 카드 그림 (dataURL). 썸네일은 엔진으로 한 번 렌더한 뒤 캐시
export function cardImage(game, c) {
  const paint = game.player.loadout.paint;
  if (c.kind === 'evolve') return game.thumbs.get(`e-${c.id}-${paint}`, () => partPreview('weapon', c.id, paint), { size: 72, dots: 24 });
  if (c.kind === 'weapon') return game.thumbs.get(`w-${c.id}-${paint}`, () => partPreview('weapon', c.id, paint), { size: 72, dots: 30 });
  if (c.kind === 'module') return game.thumbs.get(`m-${c.id}-${paint}`, () => partPreview('module', c.id, paint), { size: 72, dots: 30 });
  if (c.kind === 'stat') return pixURL(c.id, 6);
  return pixURL('repair', 6);
}

// 적용 → 장착 연출 정보 반환 { mode: 'part'|'weld'|'tune', key }
export function applyChoice(game, c) {
  const p = game.player, lo = p.loadout;
  if (c.kind === 'evolve') {
    const w = game.weapons.get(c.id);
    w.evo = true; w.cd = 0.2;
    lo.weapons = game.weapons.list.map((q) => ({ id: q.id, slot: q.slot, evo: q.evo }));
    p.rebuild(false, 'w:' + w.slot);
    game.weapons.syncBits();
    return { mode: 'part', key: 'w:' + w.slot };
  }
  if (c.kind === 'weapon') {
    let w = game.weapons.get(c.id);
    if (w) { w.level = c.level; game.weapons.syncBits(); return { mode: 'weld', key: 'w:' + w.slot }; }
    const slot = freeSlot(game.weapons.list, WEAPONS[c.id].prefer);
    w = { id: c.id, level: 1, slot, cd: 0.3 };
    game.weapons.list.push(w);
    lo.weapons = game.weapons.list.map((q) => ({ id: q.id, slot: q.slot, evo: q.evo }));
    p.rebuild(false, 'w:' + slot);
    return { mode: 'part', key: 'w:' + slot };
  }
  if (c.kind === 'module') {
    const first = !lo.modules[c.id];
    lo.modules[c.id] = c.level;
    p.rebuild(false, 'm:' + c.id);
    return { mode: first ? 'part' : 'part', key: 'm:' + c.id };
  }
  if (c.kind === 'stat') {
    p.ups[c.id] = c.level;
    p.refreshStats();
    if (c.id === 'frame') p.heal(20);
    return { mode: 'tune' };
  }
  p.heal(p.stats.maxHp * 0.5);
  return { mode: 'weld', key: null };
}
