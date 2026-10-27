// UI 연결: HUD, 방 정보/문 표지, 격납고(부품 썸네일), 업그레이드 카드(그림), 결과 화면, 터치 버튼 (진입점)

import { boot } from './main.js';
import { LEGS, FRAMES, HEADS, PAINTS, HANGAR_PAINTS, MODULES, partPreview } from './parts.js';
import { WEAPONS, weaponName, MAX_LEVEL } from './weapons.js';
import { computeStats, MODES, STAT_UPS } from './player.js';
import { ZONES, REWARDS } from './rooms.js';
import { pixURL } from './icons.js';
import { RESEARCH, researchCost } from './meta.js';
import { THREATS, PILOTS, ACHIEVEMENTS, REWARD_PAINTS, runMods, threatScrapMul, rewardText } from './progress.js';
import { SETS, setProgress, setOf } from './sets.js';
import { applySkin } from './skin.js';
import { applyStatMods } from './runhooks.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const css = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const KIND_KO = { weapon: '무기', module: '몸통 부품', stat: '시스템', heal: '정비' };
// 격납고 주무장 = 시작 무기 (런 중에는 고른 것만 강화 카드로 나온다)
const HANGAR_WEAPONS = ['saber', 'mg', 'shotgun', 'laser', 'missile', 'flamer', 'rod'];

// 잠김 자물쇠 (격납고 가격표)
const LOCK_SVG = '<svg viewBox="0 0 9 10" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 0h5v1h1v3h1v6H0V4h1V1h1zm1 2v2h3V2z"/></svg>';

function start() {
  applySkin();
  let game;
  const coarse = matchMedia('(pointer: coarse)').matches;
  // UI 크기: 800x450 을 기준으로 큰 화면은 zoom 으로 키운다. 분기 클래스는 zoom 을 뺀 논리 크기 기준
  let uiz = 1;
  const layout = () => {
    const W = innerWidth, H = innerHeight;
    uiz = Math.round(Math.max(1, Math.min(2.4, W / 800, H / 450)) * 10) / 10;
    const lw = W / uiz, lh = H / uiz, cl = document.documentElement.classList;
    document.documentElement.style.setProperty('--uiz', uiz);
    cl.toggle('ui-short', lh <= 520); cl.toggle('ui-vshort', lh <= 410);
    cl.toggle('ui-narrow', lw <= 760); cl.toggle('ui-tiny', lw <= 520);
    cl.toggle('ui-portrait', H > W); cl.toggle('ui-touch', coarse);
  };
  layout();
  addEventListener('resize', layout);
  let bannerT = 0, toastT = 0, frameN = 0, cutT = 0, cutBusy = 0, lowOn = false;
  $('hpicon').src = pixURL('heart', 2);
  const cutQueue = [];
  const doorEls = new Map();

  const ui = {
    banner(text, warn = false) { const b = $('banner'); b.textContent = text; b.hidden = false; b.classList.toggle('warn', warn); bannerT = warn ? 2.4 : 1.8; },
    toast(text) { const t = $('toast'); t.textContent = text; t.hidden = false; toastT = 1.6; },
    hurtFlash() { const h = $('hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 90); },
    fade(on) { $('fade').classList.toggle('on', on); },
    bossBar(k, name) {
      $('boss').hidden = k <= 0;
      if (name) $('bossname').textContent = name;
      $('bossfill').style.width = `${Math.max(0, k) * 100}%`;
    },
    roomInfo(rooms) {
      const Z = ZONES[rooms.zone];
      $('roomname').innerHTML = `${Z.name} <span style="color:var(--accent)">${rooms.reward === 'start' ? '출격 지점' : REWARDS[rooms.reward]?.name || ''}</span>`;
      const path = $('roompath');
      path.innerHTML = '';
      for (let i = 0; i <= rooms.last; i++) {
        const el = document.createElement('i');
        if (i < rooms.depth) el.className = 'done';
        else if (i === rooms.depth) el.className = 'now';
        else if (i === rooms.last) el.className = 'boss';
        path.appendChild(el);
      }
      for (const el of doorEls.values()) el.remove();
      doorEls.clear();
    },
    onStart() {
      for (const id of ['hangar', 'result', 'paused', 'levelup', 'achv']) $(id).hidden = true;
      $('hud').hidden = false; $('boss').hidden = true;
      $('pad').hidden = !coarse; $('hint').hidden = coarse; $('dots').hidden = coarse; $('dots').classList.add('play');
      $('view').focus();
    },
    onHangar() {
      for (const id of ['hud', 'result', 'paused', 'levelup', 'pad', 'hint', 'banner', 'skip', 'combo', 'cutin', 'station']) $(id).hidden = true;
      $('hangar').hidden = false; $('dots').hidden = coarse; $('dots').classList.remove('play');
      for (const el of doorEls.values()) el.remove();
      doorEls.clear();
      renderHangar();
    },
    levelUp(choices, title) {
      $('luttl').textContent = title;
      const box = $('cards');
      box.innerHTML = '';
      choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'card pix'; b.dataset.kind = c.kind;
        // 이름 → 종류/자리 → 하는 일 → 레벨 (Lv 2 → 3 + 칸)
        const max = c.kind === 'weapon' ? MAX_LEVEL : c.kind === 'module' ? MODULES[c.id]?.max : c.kind === 'stat' ? STAT_UPS[c.id]?.max : 0;
        const badge = c.isEvo ? '<span class="badge evo">EVOLVE</span>' : c.isNew ? '<span class="badge">NEW</span>' : max && c.level >= max ? '<span class="badge max">MAX</span>' : '';
        const pipsHtml = max ? `<span class="lvpips">${Array.from({ length: max }, (_, k) => `<i class="${k < c.level - 1 ? 'on' : k === c.level - 1 ? 'up' : ''}"></i>`).join('')}</span>` : '';
        const lvRow = c.isEvo ? '<div class="lvrow"><em>최대 레벨 → 진화</em></div>'
          : max ? `<div class="lvrow">${c.isNew || c.level === 1 ? '<em>Lv 1</em>' :`Lv ${c.level - 1} → <em>${c.level}</em>`}${pipsHtml}</div>` : '';
        b.setAttribute('aria-label', `${i + 1}번: ${c.name}. ${c.desc}`);
        b.innerHTML = `<div class="art"><img class="px-img" alt="" src="${c.img}">${coarse ? '' : `<kbd class="ckey">${i + 1}</kbd>`}<span class="tag">${c.tag}</span>${badge}</div>`
          + `<div class="cbody"><b class="cname">${c.name}</b><span class="kind">${c.kind === 'weapon' ? `무기 · ${c.where}` : c.where}</span><p>${c.desc}</p>${lvRow}${setLine(c)}</div>`;
        b.addEventListener('click', () => game.pick(i));
        box.appendChild(b);
      });
      $('levelup').hidden = false; $('pad').hidden = true; $('banner').hidden = true; $('toast').hidden = true;
      setTimeout(() => box.firstChild?.focus({ preventScroll: true }), 50);
    },
    closeLevelUp() { $('levelup').hidden = true; $('pad').hidden = !coarse; $('view').focus(); },
    pause(v) {
      $('paused').hidden = !v;
      if (!v) $('view').focus();
      if (v) renderSets($('pausesets'));
      if (v) $('pausebuild').textContent = `장착: ${game.weapons.list.map((w) => w.evo ? weaponName(w) : `${weaponName(w)} Lv${w.level}`).join(', ')}`;
    },
    result(s) {
      $('restitle').textContent = s.win ? '작전 성공! 타이탄 격파' : `기체 대파 (${s.zone})`;
      $('restitle').classList.toggle('win', s.win); $('result').firstElementChild.classList.toggle('win', s.win);
      const rows = [['고철 획득', `+${s.scrap + s.bonus}`], ['위협 등급', s.newBest && s.threat ? `${s.threat} 신기록` : s.threat], ['돌파한 방', `${s.win ? s.last + 1 : s.depth}/${s.last + 1}`], ['중간 보스 격파', s.mids], ['처치', s.kills], ['최대 연속 처치', s.combo], ['시간', fmt(s.time)], ['레벨', s.level], ['준 피해', Math.round(s.dealt)], ['받은 피해', Math.round(s.taken)]];
      $('resstats').innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
      // 무기별 초당 피해 (상위 6개)
      const top = s.dps.slice(0, 6), max = top[0]?.dps || 1;
      $('resdps').innerHTML = top.length ? `<span class="lbl">무기별 초당 피해</span>${top.map((q) => `<div class="dpsrow"><span>${q.name}</span><i><em style="width:${(q.dps / max) * 100}%"></em></i><b>${Math.round(q.dps)}</b><small>${Math.round(q.share * 100)}%</small></div>`).join('')}` : '';
      $('resach').innerHTML = s.achieved.map((a) => `<div class="achnew"><img class="px-img" alt="" src="${pixURL('trophy', 3)}"><div><b>업적: ${a.name}</b><small>보상: ${a.reward}</small></div></div>`).join('');
      const P = PILOTS[s.pilot];
      $('resparts').textContent = `파일럿 ${P.role} ${P.name} · 고철 ×${s.scrapMul.toFixed(1)}${s.bonus ? ` · 위협 신기록 보너스 +${s.bonus}` : ''}\n보유 고철 ${s.total}. 격납고에서 새 부품과 연구를 해금할 수 있어요.\n무장: ${s.weapons.join(', ')}${s.modules.length ? `\n부품: ${s.modules.join(', ')}` : ''}`;
      $('result').hidden = false;
      $('pad').hidden = true; $('banner').hidden = true;
      setTimeout(() => $('retry').focus(), 50);
    },
    // Enter 출격: 업적 창이 열려 있거나 방금 Enter 로 닫았으면 무시
    launch() { if ($('achv').hidden && performance.now() - achClosedAt > 300) game.startRun(); },
    comboMilestone(m) { const c = $('combo'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop', 'big'); setTimeout(() => c.classList.remove('big'), 600); ui.toast(`${m} 연속 처치!`); },
    comboEnd() { $('combo').classList.add('fade'); },
    // 컷인: 화면을 가로지르는 띠 + 큰 글자 (진화, 오버드라이브)
    // 정비 드론 기지
    station(open) {
      $('station').hidden = !open;
      $('pad').hidden = open || !coarse;
      if (open) renderStation();
    },
    cutin(eng, ko, img, kind) {
      // 여러 개가 겹치면 순서대로 보여 준다
      if (performance.now() < cutBusy) { cutQueue.push([eng, ko, img, kind]); return; }
      cutBusy = performance.now() + 1350;
      setTimeout(() => { cutBusy = 0; const n = cutQueue.shift(); if (n) ui.cutin(...n); }, 1350);
      const el = $('cutin');
      el.className = kind; el.hidden = false;
      el.innerHTML = `${img ? `<img class="px-img" alt="" src="${img}">` : ''}<div><span class="px">${eng}</span><b>${ko}</b></div>`;
      void el.offsetWidth; el.classList.add('go');
      clearTimeout(cutT); cutT = setTimeout(() => { el.hidden = true; }, 1300);
    },
    frame(g) {
      const dt = 1 / 60;
      if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').hidden = true;
      // 배너는 HUD(보스 체력 막대 포함) 밑으로. banner 는 zoom 이 걸려 있어서 px 를 uiz 로 나눈다
      if (bannerT > 0) { const hb = $('hud').hidden ? 0 : $('hud').getBoundingClientRect().bottom; $('banner').style.top = `${Math.max(innerHeight * 0.36, hb + 10) / uiz}px`; }
      if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
      $('skip').hidden = g.state !== 'install';
      const s = g.engine.input.stick;
      $('stick').hidden = !s.active || g.state !== 'play';
      if (s.active) {
        $('stick').style.transform = `translate(${s.ox - 56}px, ${s.oy - 56}px)`;
        $('knob').style.transform = `translate(${s.x * 40}px, ${-s.y * 40}px)`;
      }
      $('callouts').hidden = g.state !== 'hangar';
      $('view').classList.toggle('grab', g.state === 'hangar');
      const p = g.player;
      // 체력 30% 미만: 체력 막대 깜빡임 + 화면 가장자리 붉게
      const low = (g.state === 'play' || g.state === 'install') && p.hp > 0 && p.hp < p.stats.maxHp * 0.3;
      if (low !== lowOn) { lowOn = low; $('hpbox').classList.toggle('low', low); $('lowhp').classList.toggle('on', low); }
      if (g.state === 'hangar') { $('odcall').hidden = true; drawCallouts(g); return; }
      drawDoors(g);
      const cb = $('combo');
      if (g.combo >= 5 && g.comboT > 0) {
        cb.hidden = false; cb.classList.remove('fade');
        if (cb.dataset.n !== String(g.combo)) { cb.dataset.n = g.combo; cb.firstChild.textContent = g.combo; cb.classList.remove('pop'); void cb.offsetWidth; cb.classList.add('pop'); }
        cb.lastChild.style.width = `${(g.comboT / 1.6) * 100}%`;
        cb.style.setProperty('--heat', Math.min(1, g.combo / 150));
      } else if (!cb.classList.contains('fade')) cb.hidden = true;
      const hpW = `${Math.max(0, p.hp / p.stats.maxHp) * 100}%`;
      $('hpfill').style.width = hpW; $('hplag').style.width = hpW;
      $('xpfill').style.width = `${Math.min(1, g.xp / g.xpNeed) * 100}%`;
      const sp = g.weapons.specialT / p.stats.specialCd;
      $('sppip').firstChild.style.width = `${(1 - sp) * 100}%`;
      $('spline').classList.toggle('ready', sp <= 0);
      $('spbtn').querySelector('i').style.height = `${sp * 100}%`;
      const md = p.mode;
      if ($('modeline').dataset.m !== md) { $('modeline').dataset.m = md; $('modeline').className = 'hrow ' + md; $('modename').textContent = MODES[md].name; $('modebtnlbl').textContent = MODES[md].name.split(' ')[0]; }
      const odOn = p.odT > 0, odFull = p.od >= 1 && !odOn;
      $('odpip').firstChild.style.width = `${(odOn ? p.odT / 8 : p.od) * 100}%`;
      $('odline').classList.toggle('full', odFull); $('odline').classList.toggle('on', odOn);
      $('odbtn').hidden = !coarse || !odFull || g.state !== 'play';
      $('odcall').hidden = coarse || !odFull || g.state !== 'play';
      const R = g.rooms, timed = R.phase === 'fight' && R.duration > 0;
      $('roomtime').hidden = !timed;
      if (timed) $('roomtime').firstChild.style.width = `${Math.min(1, R.roomT / R.duration) * 100}%`;
      if (++frameN % 6) return;
      $('chipline').textContent = `정비 포인트 ${g.chips || 0}`;
      $('hptext').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.stats.maxHp)}`;
      $('odkey').textContent = odOn ? `${Math.ceil(p.odT)}초` : odFull ? '준비!' : `${Math.floor(p.od * 100)}%`;
      $('xplv').textContent = `LV ${g.level}`;
      $('kills').firstChild.textContent = g.stats.kills;
      $('spname').textContent = g.weapons.specialName;
      $('spbtn').querySelector('span').textContent = g.weapons.specialName.split(' ').pop();
      const wrap = $('pipwrap');
      if (wrap.children.length !== p.stats.dashCharges) wrap.innerHTML = '<span class="pip"><i></i></span>'.repeat(p.stats.dashCharges);
      [...wrap.children].forEach((el, i) => { el.firstChild.style.width = i < p.charges ? '100%' : i === p.charges ? `${(p.chargeT / p.stats.dashCd) * 100}%` : '0%'; el.classList.toggle('full', i < p.charges); });
      $('shieldpip').hidden = !p.stats.shieldCd;
      $('shieldpip').style.opacity = p.shieldReady ? 1 : 0.3;
    },
  };

  // ---- 세트 표시 ----
  function setLine(c) {
    const s = setOf(c.kind === 'module' ? 'module' : c.kind === 'weapon' || c.kind === 'evolve' ? 'weapon' : '', c.id);
    if (!s) return '';
    const prog = setProgress(game.player.loadout, game.weapons.list)[s];
    return `<span class="setline">세트 ${SETS[s].name} ${prog.filter(Boolean).length}/3</span>`;
  }
  function renderSets(box) {
    const prog = setProgress(game.player.loadout, game.weapons.list), on = game.player.loadout.sets || [];
    const nameOf = ([k, id]) => (k === 'weapon' ? WEAPONS[id].name : MODULES[id].name);
    box.className = 'sets';
    box.innerHTML = Object.entries(SETS).map(([k, S]) => `<div class="set${on.includes(k) ? ' on' : ''}"><b>${S.name}${on.includes(k) ? ' (각성)' : ''}</b>${S.parts.map((p, i) => `<i class="${prog[k][i] ? 'got' : ''}">${nameOf(p)}</i>`).join('')}</div>`).join('');
  }
  // ---- 정비 기지 화면 ----
  function renderStation() {
    const g = game;
    $('stchips').textContent = `정비 포인트 ${g.chips || 0}`;
    const box = $('stparts'); box.innerHTML = '';
    const paint = g.player.loadout.paint;
    for (const q of g.stationParts()) {
      const row = document.createElement('div'); row.className = 'strow';
      const img = g.thumbs.get(`st-${q.kind}-${q.id}-${paint}`, () => partPreview(q.kind, q.id, paint), { size: 44, dots: 22 });
      const s = setOf(q.kind, q.id);
      row.innerHTML = `<img class="px-img" alt="" src="${img}"><div><b>${q.name}</b><small>${q.kind === 'weapon' ? '무기' : '몸통 부품'} Lv ${q.evo ? '진화' : `${q.level}/${q.max}`}${s ? ` <em>세트 ${SETS[s].name}</em>` : ''}${q.kind === 'weapon' && !q.evo && q.need && q.level >= q.max && !q.canEvolve ? ` (진화하려면 ${MODULES[q.need].name} 필요)` : ''}</small></div><div class="acts"></div>`;
      const acts = row.querySelector('.acts');
      const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', fn); acts.appendChild(b); };
      if (q.canEvolve) btn('진화 (2P)', 'evo', () => { if (g.stationAct('evo', q.kind, q.id)) ui.cutin('EVOLUTION', q.name, img, 'evo'); renderStation(); });
      else if (!q.evo && q.level < q.max) btn('강화 (1P)', '', () => { g.stationAct('up', q.kind, q.id); renderStation(); });
      btn(`분해 (+${q.level + (q.evo ? 2 : 0)}P)`, 'scrap', () => {
        if (confirmScrap !== q.kind + q.id) { confirmScrap = q.kind + q.id; ui.toast('한 번 더 누르면 분해해요'); return; }
        confirmScrap = null; g.stationAct('scrap', q.kind, q.id); renderStation();
      });
      box.appendChild(row);
    }
    if (!box.children.length) box.innerHTML = '<p class="note">장착된 부품이 없어요.</p>';
    renderSets($('stsets'));
  }
  let confirmScrap = null;

  // 출구 문 위의 보상 표지 (하데스처럼 다음 방 보상을 미리 보여줌)
  function drawDoors(g) {
    const R = g.rooms, dpr = g.engine.dpr;
    const show = (g.state === 'play' || g.state === 'install' || g.state === 'levelup') && R.doors?.length && R.phase !== 'fight';
    const seen = new Set();
    // 표지가 HUD(위쪽 패널) 밑으로만 오게: HUD 아래 끝을 위쪽 한계로
    const hudB = show && !$('hud').hidden ? $('hud').getBoundingClientRect().bottom : 0;
    if (show) for (const d of R.doors) {
      const far = d.side === 'W' || d.side === 'S';
      const s = g.project([d.x, far ? 3.8 : 1.8, d.z]);
      if (!s) continue;
      const key = R.depth + d.side;
      seen.add(key);
      let el = doorEls.get(key);
      if (!el) {
        const rw = REWARDS[d.reward];
        el = document.createElement('div');
        el.className = 'door pix dark' + (d.reward === 'boss' ? ' boss' : '');
        el.innerHTML = `<img class="px-img" alt="" src="${pixURL(rw.icon, 3)}"><b>${rw.name}</b><small>${rw.desc}</small>`;
        $('doors').appendChild(el);
        doorEls.set(key, el);
      }
      // 화면 밖이면 가장자리에 붙여서 방향을 알려준다
      const W = innerWidth, H = innerHeight, hw = (el.offsetWidth * uiz) / 2 + 6, top = hudB + el.offsetHeight * uiz + 8;
      let x = s[0] / dpr, y = s[1] / dpr;
      const cx = Math.min(W - hw, Math.max(hw, x)), cy = Math.min(H - 8, Math.max(top, y));
      const edge = cx !== x || cy !== y;
      el.classList.toggle('edge', edge);
      el.dataset.dir = edge ? (Math.abs(cy - y) > Math.abs(cx - x) ? (y < cy ? '▲' : '▼') : (x < cx ? '◀' : '▶')) : '';
      el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px) scale(${uiz}) translate(-50%, -100%)`;
      el.style.opacity = d.open ? 1 : 0.55;
    }
    for (const [k, el] of doorEls) if (!seen.has(k)) { el.remove(); doorEls.delete(k); }
  }

  try {
    game = boot($('view'), $('fx'), ui);
  } catch (e) {
    $('error').hidden = false; $('hangar').hidden = true;
    $('error-msg').textContent = e.message;
    console.error(e);
    return;
  }
  window.game = game;
  const { engine } = game;

  // ---- 격납고: 부품마다 3D 썸네일 ----
  const thumb = (kind, id) => game.thumbs.get(`h-${kind}-${id}-${game.selection.paint}`, () => partPreview(kind, id, game.selection.paint), { size: 52, dots: 26, yaw: kind === 'weapon' ? Math.PI / 2 + 0.4 : null });
  const swatch = (id) => { const P = PAINTS[id]; return `linear-gradient(135deg, ${css(P.main)} 50%, ${css(P.sub)} 50%)`; };
  // 부품 칸: 그림 + 이름(두 줄까지). chip = 그림 위 왼쪽 위 표시 (잠김 가격, 업적)
  const opt = (name, pressed, onClick, img, sw, onHover, chip = '') => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt';
    b.setAttribute('aria-pressed', String(pressed));
    b.innerHTML = `${img ? `<img class="px-img" alt="" src="${img}">` : `<i class="sw" style="background:${sw}"></i>`}<b>${name}</b>${chip}`;
    b.addEventListener('click', onClick);
    if (onHover) { b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') onHover(true); }); b.addEventListener('pointerleave', () => onHover(false)); }
    return b;
  };
  // 부위 탭 (부품이 많아져서 머리/프레임도 5열)
  const TABS = [
    { key: 'head', label: '머리', table: HEADS, ids: Object.keys(HEADS) },
    { key: 'frame', label: '프레임', table: FRAMES, ids: Object.keys(FRAMES) },
    { key: 'legs', label: '다리', table: LEGS, ids: Object.keys(LEGS) },
    { key: 'weapon', label: '주무장', table: WEAPONS, ids: HANGAR_WEAPONS },
    { key: 'paint', label: '도색', table: PAINTS, ids: [...HANGAR_PAINTS, ...REWARD_PAINTS] },
    { key: 'pilot', label: '파일럿', table: PILOTS, ids: Object.keys(PILOTS), pilot: true },
    { key: 'threat', label: '위협', table: THREATS, ids: Object.keys(THREATS), threat: true },
    { key: 'research', label: '연구', table: RESEARCH, ids: Object.keys(RESEARCH), research: true },
  ];
  let tab = 'legs', confirmKey = null;
  // 업적 보상으로만 열리는 것: 어느 업적인지
  const achFor = (kind, id) => ACHIEVEMENTS.find((a) => a.reward.kind === kind && a.reward.id === id);
  const pips = (max, lv) => Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
  const descOf = (T, id) => T.key === 'weapon' ? (id === 'missile' ? '어깨 자동 사격 + 주먹 3단 콤보' : WEAPONS[id].desc) : T.key === 'paint' ? '기체 색상' : T.table[id].desc;
  // 능력치 막대: 모든 조합의 최소~최대 기준
  const STAT_DEFS = [
    ['내구', (s) => s.maxHp, (v) => v],
    ['기동', (s) => s.speed, (v) => v.toFixed(1)],
    ['장갑', (s) => s.armor, (v) => v],
    ['화력', (s) => s.dmgMul, (v) => `×${v.toFixed(2)}`],
    ['치명', (s) => s.crit, (v) => `${Math.round(v * 100)}%`],
    ['대시', (s) => s.dashCharges + 1 / s.dashCd, (v, s) => `×${s.dashCharges}`],
  ];
  const range = STAT_DEFS.map(() => [Infinity, -Infinity]);
  for (const l of Object.keys(LEGS)) for (const f of Object.keys(FRAMES)) for (const h of Object.keys(HEADS)) {
    const st = computeStats({ legs: l, frame: f, head: h, modules: {} }, {});
    STAT_DEFS.forEach(([, get], i) => { const v = get(st); range[i][0] = Math.min(range[i][0], v); range[i][1] = Math.max(range[i][1], v); });
  }
  // 파일럿과 위협(취약 프레임)까지 반영한 출격 능력치
  const statsOf = (sel, pilot = game.meta.pilot) => applyStatMods(computeStats({ legs: sel.legs, frame: sel.frame, head: sel.head, modules: {} }, {}), runMods(game.meta.threatSel, pilot).stats);
  function renderStats(preview, previewPilot = null) {
    const cur = statsOf(game.selection), pv = preview || previewPilot ? statsOf(preview || game.selection, previewPilot || game.meta.pilot) : null;
    $('statline').innerHTML = STAT_DEFS.map(([name, get, fmtv], i) => {
      const [lo, hi] = range[i], k = (v) => Math.max(4, Math.min(100, 15 + 85 * ((v - lo) / (hi - lo || 1))));
      const v = get(cur), w = pv ? get(pv) : v;
      const cls = pv && w > v + 1e-6 ? 'up' : pv && w < v - 1e-6 ? 'down' : '';
      return `<div class="sbar"><span>${name}</span><i><em class="${cls}" style="width:${k(w)}%"></em></i><b class="${cls}">${fmtv(w, pv || cur)}</b></div>`;
    }).join('');
  }
  // ---- 부위 이름표: 기체 오른쪽에 세로로 늘어놓고 선으로 연결 ----
  const CALL = [
    { key: 'head', lbl: '머리', side: 1, at: (m) => m.head.worldPosition() },
    { key: 'weapon', lbl: '주무장', side: 1, at: (m, p) => m.slotNodes[p.loadout.weapons[0]?.slot || 'armR'].worldPosition() },
    { key: 'frame', lbl: '몸통', side: -1, at: (m) => v3add(m.upper.worldPosition(), [0, 0.25, 0]) },
    { key: 'legs', lbl: '다리', side: -1, at: (m) => { const r = m.root.worldPosition(); return [r[0], r[1] + m.hip * 0.45, r[2]]; } },
  ];
  const v3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const callEls = {};
  function drawCallouts(g) {
    const m = g.player.mech, dpr = g.engine.dpr;
    if (!m) return;
    const P = (pt) => { const s = g.project(pt); return s ? [s[0] / dpr, s[1] / dpr] : null; };
    const c0 = P([0, 0, 0]), c1 = P([0, 1, 0]);
    if (!c0 || !c1) return;
    const unit = Math.abs(c0[1] - c1[1]);
    const th = $('turnhint'); th.style.left = `${Math.round(c0[0])}px`; th.style.top = `${Math.round(c0[1] - unit * 2.5)}px`;
  }
  function setTab(key) { tab = key; renderHangar(); }

  // ---- 격납고에서 드래그로 기체 돌리기 ----
  {
    const cv = $('view');
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (game.state !== 'hangar') return;
      drag = { id: e.pointerId, x: e.clientX, turn: game.turn ?? 0.6, lx: e.clientX, lt: performance.now(), v: 0 };
      game.turnDrag = true; game.turnVel = 0; $('turnhint').hidden = true;
      cv.setPointerCapture?.(e.pointerId); cv.classList.add('grabbing');
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      game.turn = drag.turn + (e.clientX - drag.x) * 0.012;
      const now = performance.now(), dtm = Math.max(1, now - drag.lt);
      drag.v = drag.v * 0.6 + ((e.clientX - drag.lx) * 0.012 / (dtm / 1000)) * 0.4;
      drag.lx = e.clientX; drag.lt = now;
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      game.turnDrag = false; game.turnVel = performance.now() - drag.lt < 80 ? Math.max(-8, Math.min(8, drag.v)) : 0;
      drag = null; cv.classList.remove('grabbing');
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  function renderHangar() {
    const sel = game.selection;
    renderRecord();
    const set = (k, v) => { game.setSelection({ ...game.selection, [k]: v }); renderHangar(); };
    // 탭: 지금 장착한 부품 그림 + 부위 이름 (장착 부품 이름은 아래 설명 칸에)
    const tabs = $('tabs'); tabs.innerHTML = '';
    for (const T of TABS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(T.key === tab));
      const id = sel[T.key], M = game.meta;
      const face = (img, text) => { b.innerHTML = `${img}<span>${T.label}</span>`; b.setAttribute('aria-label', `${T.label}: ${text}`); b.title = `${T.label}: ${text}`; };
      const im = (src) => `<img class="px-img" alt="" src="${src}">`;
      if (T.research) face(im(pixURL('power', 4)), `고철 ${M.scrap}`);
      else if (T.pilot) face(im(pixURL(PILOTS[M.pilot].icon, 4)), PILOTS[M.pilot].name);
      else if (T.threat) face(im(pixURL(M.threatOpen ? 'elite' : 'lock', 4)), M.threatOpen ? `${M.threat}점` : '잠김');
      else if (T.key === 'paint') face(`<i class="sw" style="background:${swatch(id)}"></i>`, PAINTS[id].name);
      else face(im(thumb(T.key, id)), T.table[id].name);
      b.addEventListener('click', () => setTab(T.key));
      tabs.appendChild(b);
    }
    const T = TABS.find((t) => t.key === tab), box = $('opts');
    box.className = 'opts' + (T.four ? ' four' : '');
    box.innerHTML = '';
    const M = game.meta;
    $('scrapline').textContent = `고철 ${M.scrap}`;
    const desc = (title, text) => { $('tabdesc').firstChild.textContent = title; $('tabdesc').lastChild.textContent = text; };
    const lockText = (kind, id) => { const a = achFor(kind, id); return a ? `잠김: 업적 '${a.name}' (${a.desc}) 보상.` : `잠김: 고철 ${M.price(kind, id)}으로 해금.`; };
    const showDesc = (id) => {
      if (T.research) { const lv = M.level(id), R = RESEARCH[id]; desc(R.name, `${R.desc}. ${lv >= R.max ? '완료' : `다음 단계 고철 ${researchCost(id, lv)}`}`); return; }
      if (T.pilot) { const P = PILOTS[id]; desc(`${P.role} ${P.name}`, `${M.isUnlocked('pilot', id) ? '' : `${lockText('pilot', id)} `}장점: ${P.perk}${P.flaw ? `. 단점: ${P.flaw}` : ''}`); return; }
      if (T.threat) {
        const best = M.bestThreat >= 0 ? `최고 격파 ${M.bestThreat}점` : '아직 격파 기록 없음';
        if (!M.threatOpen) { desc('위협 등급', '타이탄을 한 번 격파하면 열려요. 적을 강하게 만들수록 고철 보상이 늘어나요.'); return; }
        if (!id) { desc(`위협 ${M.threat}점`, `누를 때마다 단계가 올라가요. 1점마다 고철 +10% (지금 ×${threatScrapMul(M.threat).toFixed(1)}). ${best}`); return; }
        const H = THREATS[id], lv = M.threatRank(id);
        desc(`위협 ${M.threat}점`, `${H.name} ${lv}/${H.max}: ${H.desc(Math.max(1, lv))} (단계마다 +${H.pts}점). 고철 ×${threatScrapMul(M.threat).toFixed(1)}. ${best}`);
        return;
      }
      desc(T.table[id].name, M.isUnlocked(T.key, id) ? descOf(T, id) : `${lockText(T.key, id)} ${descOf(T, id)}`);
    };
    if (T.pilot) {
      for (const id of T.ids) {
        const P = PILOTS[id], locked = !M.isUnlocked('pilot', id);
        const el = opt(P.name, M.pilot === id, () => {
          if (locked) { showDesc(id); ui.toast(`업적 '${achFor('pilot', id).name}'을 달성하면 합류해요`); return; }
          M.setPilot(id); renderHangar();
        }, pixURL(P.icon, 5), null, (on) => { renderStats(null, on ? id : null); showDesc(on ? id : M.pilot); }, locked ? `<span class="chip">${LOCK_SVG}업적</span>` : '');
        if (locked) el.classList.add('locked', 'reward');
        box.appendChild(el);
      }
      showDesc(M.pilot);
      renderStats(null);
      return;
    }
    if (T.threat) {
      for (const id of T.ids) {
        const H = THREATS[id], lv = M.threatRank(id);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'opt lv' + (M.threatOpen ? '' : ' locked cant');
        b.setAttribute('aria-pressed', String(lv > 0));
        b.innerHTML = `<img class="px-img" alt="" src="${pixURL(H.icon, 4)}"><span class="rlv">${pips(H.max, lv)}</span><b>${H.name}</b><span class="chip${lv ? ' on' : ''}">${M.threatOpen ? (lv ? `+${lv * H.pts}점` : '끔') : LOCK_SVG}</span>`;
        b.addEventListener('click', () => {
          if (!M.threatOpen) { showDesc(id); ui.toast('타이탄을 한 번 격파하면 열려요'); return; }
          M.cycleThreat(id); game.sfx.play('clank'); renderHangar(); showDesc(id);
        });
        b.addEventListener('pointerenter', () => showDesc(id));
        box.appendChild(b);
      }
      showDesc(null);
      renderStats(null);
      return;
    }
    if (T.research) {
      box.className = 'opts';
      for (const id of T.ids) {
        const R = RESEARCH[id], lv = M.level(id), done = lv >= R.max, cost = researchCost(id, lv);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'opt lv' + (done ? '' : M.scrap < cost ? ' cant' : '');
        b.setAttribute('aria-pressed', String(done));
        b.innerHTML = `<img class="px-img" alt="" src="${pixURL(R.icon, 4)}"><span class="rlv">${pips(R.max, lv)}</span><b>${R.name}</b><span class="chip${done ? ' on' : ''}">${done ? '완료' : cost}</span>`;
        b.addEventListener('click', () => {
          if (!done && confirmKey !== 'r' + id) { confirmKey = 'r' + id; showDesc(id); ui.toast(M.scrap >= cost ? `한 번 더 누르면 연구 (고철 ${cost})` : `고철이 부족해요 (${cost} 필요)`); return; }
          confirmKey = null;
          if (M.research(id)) { game.sfx.play('clank'); game.setSelection(game.selection); } else game.sfx.play('hurt', { vol: 0.4 }); renderHangar(); showDesc(id); });
        b.addEventListener('pointerenter', () => showDesc(id));
        box.appendChild(b);
      }
      showDesc(T.ids[0]);
      renderStats(null);
      return;
    }
    // 잠긴 부품: 회색 + 가격. 누르면 고철로 해금
    const pick = (id) => () => {
      const ach = !M.price(T.key, id) && achFor(T.key, id);
      if (!M.isUnlocked(T.key, id) && ach) { showDesc(id); ui.toast(`업적 '${ach.name}'을 달성하면 열려요`); return; }
      if (!M.isUnlocked(T.key, id)) {
        // 실수로 쓰지 않게: 처음 누르면 안내, 한 번 더 누르면 해금
        if (confirmKey !== T.key + id) { confirmKey = T.key + id; showDesc(id); ui.toast(M.scrap >= M.price(T.key, id) ? `한 번 더 누르면 해금 (고철 ${M.price(T.key, id)})` : `고철이 부족해요 (${M.price(T.key, id)} 필요)`); return; }
        confirmKey = null;
        if (!M.unlock(T.key, id)) { game.sfx.play('hurt', { vol: 0.4 }); ui.toast(`고철이 부족해요 (${M.price(T.key, id)} 필요)`); return; }
        game.sfx.play('clank'); ui.toast(`${T.table[id].name} 해금!`);
      }
      set(T.key, id);
    };
    for (const id of T.ids) {
      const hover = (on) => { renderStats(on ? { ...sel, [T.key]: id } : null); showDesc(on ? id : sel[T.key]); };
      const locked = !M.isUnlocked(T.key, id), price = M.price(T.key, id), chip = locked ? `<span class="chip">${LOCK_SVG}${price || '업적'}</span>` : '';
      const el = T.key === 'paint'
        ? opt(PAINTS[id].name, sel.paint === id, pick(id), null, swatch(id), (on) => showDesc(on ? id : sel.paint), chip)
        : opt(T.table[id].name, sel[T.key] === id, pick(id), thumb(T.key, id), null, T.key === 'weapon' ? (on) => showDesc(on ? id : sel.weapon) : hover, chip);
      if (locked) { el.classList.add('locked', price ? 'buy' : 'reward'); if (M.scrap < price) el.classList.add('cant'); el.title = `${T.table[id].name}: ${price ? `고철 ${price}으로 해금` : '업적 보상'}`; }
      box.appendChild(el);
    }
    // 폰 가로(한 줄 스크롤)일 때 고른 부품이 보이게 가운데로
    const on = box.querySelector('[aria-pressed="true"]');
    if (on && box.scrollWidth > box.clientWidth) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
    showDesc(sel[T.key]);
    renderStats(null);
  }
  // 격납고 아랫줄: 최고 기록 + 업적 버튼 + 출격 버튼의 위협 표시
  function renderRecord() {
    const b = game.best, M = game.meta;
    const best = M.bestThreat > 0 ? `최고 위협 ${M.bestThreat}점 격파. ` : b.win ? '타이탄 격파 기록 있음. ' : b.depth ? `최고 기록: 방 ${b.depth}개 돌파. ` : '';
    $('besttext').textContent = `${best}${coarse ? '폰을 가로로 들고: 왼쪽 드래그로 이동, 오른쪽 버튼으로 공격, 특수기, 대시' : 'Enter 키로 출격, 마우스로 조준'}`;
    $('achbtn').textContent = `업적 ${M.achCount}/${ACHIEVEMENTS.length}`;
    $('launch').innerHTML = M.threat ? `출격 ▶<small>위협 ${M.threat}</small>` : '출격 ▶';
  }
  // ---- 업적 목록 ----
  function renderAch() {
    const M = game.meta;
    $('achcount').textContent = `${M.achCount}/${ACHIEVEMENTS.length}`;
    $('achlist').innerHTML = ACHIEVEMENTS.map((a) => {
      const done = M.achieved(a.id);
      return `<div class="achrow${done ? ' done' : ''}"><img class="px-img" alt="" src="${pixURL(done ? 'trophy' : 'lock', 3)}"><div><b>${a.name}</b><small>${a.desc}</small></div><em>${rewardText(a.reward)}</em></div>`;
    }).join('');
  }
  let achClosedAt = 0;
  const showAch = (v) => { $('achv').hidden = !v; if (!v) achClosedAt = performance.now(); if (v) { renderAch(); setTimeout(() => $('achclose').focus({ preventScroll: true }), 30); } };
  $('achbtn').addEventListener('click', () => showAch(true));
  $('achclose').addEventListener('click', () => showAch(false));
  renderHangar();
  $('dots').hidden = coarse;
  $('launch').addEventListener('click', () => game.startRun());
  // 한 줄 부품 목록: 마우스 휠을 가로 스크롤로
  $('opts').addEventListener('wheel', (e) => {
    const box = $('opts');
    if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault(); box.scrollLeft += e.deltaY;
  }, { passive: false });
  $('odcall').addEventListener('click', () => { game.btn.overdrive = true; $('view').focus(); });

  // ---- 소리 ----
  const sndLabel = () => { for (const id of ['sndhangar', 'sndpause']) $(id).textContent = game.sfx.muted ? '소리 꺼짐' : '소리 켜짐'; };
  for (const id of ['sndhangar', 'sndpause']) $(id).addEventListener('click', () => { game.sfx.setMuted(!game.sfx.muted); sndLabel(); });
  sndLabel();
  // 화면 흔들림 설정: 약하게(기본) → 끔 → 강하게
  const SHAKE = [['약하게', 0.45], ['끔', 0], ['강하게', 1]];
  let shakeI = 0;
  try { shakeI = Math.max(0, SHAKE.findIndex((s) => s[0] === localStorage.getItem('mf-shake'))); } catch { /* 무시 */ }
  const applyShake = () => { game.fx.shakeScale = SHAKE[shakeI][1]; for (const id of ['shakehangar', 'shakepause']) $(id).textContent = `흔들림 ${SHAKE[shakeI][0]}`; try { localStorage.setItem('mf-shake', SHAKE[shakeI][0]); } catch { /* 무시 */ } };
  for (const id of ['shakehangar', 'shakepause']) $(id).addEventListener('click', () => { shakeI = (shakeI + 1) % SHAKE.length; applyShake(); });
  applyShake();
  let lastHover = null;
  document.addEventListener('click', (e) => { const b = e.target.closest?.('button'); if (b && !b.closest('#pad') && !b.classList.contains('card')) game.sfx.play(b.id === 'launch' ? 'select' : 'click'); }, true);
  document.addEventListener('pointerover', (e) => { const b = e.target.closest?.('.opt, .tab, .card'); if (b && e.pointerType === 'mouse' && b !== lastHover) { lastHover = b; game.sfx.play('hover'); } });

  // ---- 버튼 ----
  $('strepair').addEventListener('click', () => { game.stationAct('repair'); renderStation(); });
  $('stleave').addEventListener('click', () => game.closeStation());
  $('pausebtn').addEventListener('click', () => game.pause(true));
  $('resume').addEventListener('click', () => game.pause(false));
  $('quit').addEventListener('click', () => game.toHangar());
  $('retry').addEventListener('click', () => game.restart());
  $('tohangar').addEventListener('click', () => game.toHangar());
  addEventListener('keydown', (e) => {
    if (game.state === 'levelup' && /^[1-3]$/.test(e.key) && document.activeElement?.tagName === 'BUTTON') game.pick(Number(e.key) - 1);
    if (game.state === 'paused' && (e.key === 'Escape' || e.key === 'p') && document.activeElement?.tagName === 'BUTTON') game.pause(false);
    if (!$('achv').hidden && e.key === 'Escape') showAch(false);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(true); });

  // ---- 터치 버튼 (누르고 있으면 계속 공격) ----
  const hold = (el, down, up) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); down(); });
    const end = () => { el.classList.remove('on'); up?.(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  };
  hold($('atkbtn'), () => { game.btn.attack = true; game.btn.attackPressed = true; }, () => { game.btn.attack = false; });
  hold($('spbtn'), () => { game.btn.special = true; });
  hold($('dashbtn'), () => { game.btn.dash = true; });
  hold($('odbtn'), () => { game.btn.overdrive = true; });
  hold($('modebtn'), () => { game.btn.mode = true; });

  // ---- 마우스: 커서 방향 조준, 왼쪽 버튼 공격, 오른쪽 버튼 특수기 ----
  const canvas = $('view');
  let mx = 0, my = 0, mouseT = -10, mouseMode = false, inside = false, lastCur = null;
  // 게임 중 커서: 어느 배경에서도 보이는 굵은 조준경 (흰 테 + 검은 외곽 + 주황 중심)
  const CROSS = (() => {
    const ring = (c, w) => `<circle cx="16" cy="16" r="9" fill="none" stroke="${c}" stroke-width="${w}"/><path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="${c}" stroke-width="${w}"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" shape-rendering="crispEdges">${ring('#000', 5)}${ring('#fff', 2)}<rect x="14" y="14" width="4" height="4" fill="#ff8a1e" stroke="#000"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
  })();
  const updateAim = () => {
    const cam = engine.camera, p = game.player;
    const ray = cam.screenRay(mx, my, canvas.clientWidth, canvas.clientHeight, engine.scale, engine.dpr);
    const t = (1 - ray.origin[1]) / ray.dir[1];
    const hx = ray.origin[0] + ray.dir[0] * t, hz = ray.origin[2] + ray.dir[2] * t;
    p.mouseYaw = Math.atan2(hx - p.x, hz - p.z);
  };
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mx = e.offsetX; my = e.offsetY; mouseT = performance.now(); inside = true; } });
  canvas.addEventListener('pointerdown', (e) => {
    if (game.state === 'install') { game.installer.skip(); return; }
    if (e.pointerType !== 'mouse') return;
    mx = e.offsetX; my = e.offsetY; mouseT = performance.now(); inside = true; mouseMode = true;
    if (e.button === 0) { game.btn.attack = true; game.btn.attackPressed = true; }
    if (e.button === 2) game.btn.special = true;
  });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) game.btn.attack = false; });
  canvas.addEventListener('pointerleave', () => { mouseT = -10; inside = false; });
  const prevUpdate = engine.onUpdate;
  engine.onUpdate = (dt, t) => {
    const p = game.player, inp = engine.input;
    // 마우스로 공격하면 커서가 화면 안에 있는 동안 계속 마우스 조준 (가만히 쏘고 있어도 방향이 안 튐).
    // 키보드(J/K)로 공격하면 자동 조준으로 돌아가고, 그때는 최근에 마우스를 움직였을 때만 마우스 조준
    if (inp.pressed('j') || inp.pressed('k')) mouseMode = false;
    p.mouseActive = !coarse && game.state === 'play' && (mouseMode ? inside : performance.now() - mouseT < 2500);
    const cur = !coarse && (game.state === 'play' || game.state === 'install') ? CROSS : '';
    if (cur !== lastCur) { canvas.style.cursor = lastCur = cur; } // 격납고(grab)는 CSS 커서 그대로
    if (p.mouseActive) updateAim();
    prevUpdate(dt, t);
  };

  // ---- 도트 크기 ----
  const showDots = () => { $('dot-val').textContent = `×${engine.pixelScale}`; };
  const setDots = (v) => { engine.pixelScale = Math.max(2, Math.min(12, v)); showDots(); };
  $('dot-minus').addEventListener('click', () => setDots(engine.pixelScale - 1));
  $('dot-plus').addEventListener('click', () => setDots(engine.pixelScale + 1));
  addEventListener('keydown', (e) => { if (e.key === '[' || e.key === '-') setDots(engine.pixelScale - 1); if (e.key === ']' || e.key === '=') setDots(engine.pixelScale + 1); });
  showDots();

  engine.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
