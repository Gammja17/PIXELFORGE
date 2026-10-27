// 첫 실행 튜토리얼 + 처음 겪는 일마다 한 번만 뜨는 팁. DOM/CSS 는 여기서 직접 만든다 (page.html 은 고치지 않음)
//
//  첫 출격(또는 격납고 '튜토리얼' 버튼): 출격 지점 방에서 문을 닫아 두고 단계별 훈련
//    이동 → 조준+공격 → 대시 → 경험치 → 카드 → 특수기 → 변형 → 오버드라이브 → 문 개방
//    단계 중에는 고철 벌레만 천천히 나오고, 체력은 절반 밑으로 안 떨어진다
//  평소 플레이: 노획 부품, 부품 상자, 중간 보스, 출구 문, 진화 카드, 오버드라이브 충전을 처음 볼 때 팁
//
//  rooms / pickups / enemies / player / weapons 파일은 고치지 않고 인스턴스 메서드를 감싸기만 한다 (runhooks.js 와 같은 방식)
//  저장: store 'tutorial' (끝냈거나 건너뜀), store 'tips' ({ id: 1 })

const wrap = (obj, name, fn) => { const orig = obj[name].bind(obj); obj[name] = (...a) => fn(orig, ...a); };
const $ = (id) => document.getElementById(id);

// keys: 키보드/마우스, touch: 폰 버튼, btn: 반짝일 터치 버튼 id
const STEPS = [
  { id: 'move', title: '이동', text: '기체를 움직여 보세요', keys: ['W', 'A', 'S', 'D'], touch: '왼쪽 화면 드래그', need: 10 },
  { id: 'attack', title: '조준 + 공격', text: '고철 벌레 5마리 처치', keys: ['J'], mouse: '마우스로 조준 + 왼쪽 클릭', touch: '공격 버튼 (자동 조준)', btn: 'atkbtn', need: 5 },
  { id: 'dash', title: '대시', text: '대시하는 순간은 무적! 2번 대시', keys: ['Space', 'Shift'], touch: '대시 버튼', btn: 'dashbtn', need: 2 },
  { id: 'xp', title: '경험치', text: '초록 결정에 다가가서 줍기', keys: [], touch: '', need: 5 },
  { id: 'card', title: '레벨 업', text: '카드 1장을 골라 기체 강화', keys: ['1', '2', '3'], mouse: '카드 클릭', touch: '카드 터치' },
  { id: 'special', title: '특수기', text: '한 방 큰 기술! 써 보세요', keys: ['K'], mouse: '오른쪽 클릭', touch: '특수 버튼', btn: 'spbtn' },
  { id: 'mode', title: '변형', text: '보행 · 비행 · 저격 · 섬멸 모드 전환', keys: ['E', 'Tab'], touch: '초록 변형 버튼', btn: 'modebtn' },
  { id: 'od', title: '오버드라이브', text: '게이지 가득! 8초간 거대화 + 피해 감소', keys: ['Q', 'L'], touch: 'OD 버튼', btn: 'odbtn' },
];
const TIPS = {
  salvage: { title: '부품 노획!', text: '빛기둥 속 부품에 다가가면 바로 장착' },
  crate: { title: '부품 상자!', text: '주우면 부품 카드 3장 중 하나 선택' },
  mid: { title: '중간 보스 등장!', text: '쓰러뜨려야 방이 끝나요', warn: true },
  door: { title: '출구 선택', text: '문 위 표지 = 다음 방 보상. 원하는 문으로 들어가세요' },
  evo: { title: '진화 카드!', text: '최대 레벨 무기 + 맞는 부품 = 진화. 강력해요' },
  od: { title: '오버드라이브 준비!', text: '8초간 거대화 + 피해 감소', keys: ['Q', 'L'], touch: 'OD 버튼' },
};

const CSS = `
#tut, #tuttip { position: fixed; left: var(--tut-x, 50%); transform: translateX(-50%); z-index: 40; pointer-events: none; color: var(--paper, #ece8df);
  font-family: var(--font-body, sans-serif); text-align: center; width: max-content; max-width: var(--tut-w, min(560px, calc(100vw - 32px))); box-sizing: border-box; }
#tut { top: var(--tut-top, calc(var(--sat, 0px) + 112px)); padding: 4px 14px 6px; display: grid; gap: 4px; justify-items: center; }
#tut.low { top: auto; bottom: calc(var(--sab, 0px) + 10px); left: 50%; max-width: min(560px, calc(100vw - 32px)); }
#tut .th { display: flex; align-items: center; gap: 12px; width: 100%; justify-content: space-between; }
#tut .ts { font-family: var(--font-tech, monospace); font-size: 12px; font-weight: 700; letter-spacing: .16em; color: var(--cyan, #5fe0ff); white-space: nowrap; }
#tut .tx { pointer-events: auto; font: 700 13px var(--font-body, sans-serif); color: var(--paper, #ece8df); min-height: 30px; padding: 0 6px; white-space: nowrap; }
#tut b.tt { font-family: var(--font-tech, monospace), var(--font-body, sans-serif); font-size: 24px; font-weight: 800; line-height: 1.1; color: var(--accent, #ffc93d); text-shadow: 0 2px 0 #000; letter-spacing: .02em; }
#tut p, #tuttip p { margin: 0; font-size: 12px; font-weight: 700; line-height: 1.3; text-shadow: 0 2px 0 #000; }
#tut .tk, #tuttip .tk { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; font-size: 12px; font-weight: 700; }
#tut .tk span, #tuttip .tk span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
#tut .tk em, #tuttip .tk em { font-style: normal; font: 700 11px var(--font-tech, monospace); letter-spacing: .12em; color: var(--muted, #9a978f); margin-right: 2px; }
#tut kbd, #tuttip kbd { font: 800 15px var(--font-tech, monospace); color: #15161b; background: var(--accent, #ffc93d); box-shadow: inset 0 -3px 0 #a87a10, 0 0 0 2px #000; padding: 1px 7px 3px; min-width: 14px; }
#tut .tb { display: block; width: 100%; max-width: 260px; height: 6px; background: #000; box-shadow: 0 0 0 1px #4a4c57; }
#tut .tb i { display: block; height: 100%; width: 0; background: var(--cyan, #5fe0ff); transition: width .15s steps(4); }
#tut.done b.tt { color: var(--cyan, #5fe0ff); }
#tut.pop { animation: tutpop .32s steps(4); }
@keyframes tutpop { 0% { transform: translateX(-50%) scale(.8); opacity: 0; } 100% { transform: translateX(-50%) scale(1); opacity: 1; } }
#tuttip { bottom: calc(var(--sab, 0px) + 150px); padding: 2px 16px 6px; display: grid; gap: 3px; justify-items: center; animation: tutpop .32s steps(4); }
#tuttip.low { top: auto !important; bottom: calc(var(--sab, 0px) + 10px); left: 50%; max-width: min(560px, calc(100vw - 32px)); }
#tuttip .tg { font: 800 12px var(--font-tech, monospace); letter-spacing: .2em; color: #15161b; background: var(--cyan, #5fe0ff); padding: 0 8px; }
#tuttip.warn .tg { background: var(--hp, #ff4d5e); }
#tuttip b { font-family: var(--font-tech, monospace), var(--font-body, sans-serif); font-size: 24px; font-weight: 800; color: var(--accent, #ffc93d); text-shadow: 0 2px 0 #000; }
#tuttip.warn b { color: var(--hp, #ff4d5e); }
#tutbtn { white-space: nowrap; }
#pad button.tut-glow { animation: tutglow .5s steps(2) infinite; }
@keyframes tutglow { 50% { box-shadow: 0 0 0 4px var(--accent, #ffc93d), 0 0 18px 6px var(--accent, #ffc93d); } }
@media (pointer: coarse) { #tuttip { bottom: auto; top: var(--tut-top, calc(var(--sat, 0px) + 84px)); } }
/* 낮은 화면 (폰 가로): 맨 위 HUD 사이 빈칸에 한 덩어리로. 제목 줄에 단계와 건너뛰기 */
#tut.compact { grid-template-columns: auto 1fr auto; grid-template-areas: "s t x" "p p p" "k k k" "b b b"; gap: 1px 8px; padding: 0 8px 3px; align-items: center; }
#tut.compact .th { display: contents; }
#tut.compact .ts { grid-area: s; font-size: 12px; letter-spacing: .08em; }
#tut.compact b.tt { grid-area: t; font-size: 24px; }
#tut.compact .tx { grid-area: x; min-height: 0; font-size: 12px; padding: 0 2px; border-image-width: 8px; border-width: 8px; }
#tut.compact p { grid-area: p; font-size: 12px; }
#tut.compact .tk { grid-area: k; font-size: 12px; gap: 2px 10px; }
#tut.compact kbd, #tuttip.compact kbd { font-size: 12px; padding: 0 5px 2px; }
#tut.compact .tb { grid-area: b; height: 4px; }
#tut.compact.low { top: calc(var(--sat, 0px) + 2px); bottom: auto; grid-template-columns: auto auto auto; grid-template-areas: "t p x"; }
#tut.compact.low .ts, #tut.compact.low .tk, #tut.compact.low .tb { display: none; }
#tuttip.compact { padding: 0 10px 3px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 10px; }
#tuttip.compact.low { top: calc(var(--sat, 0px) + 2px) !important; bottom: auto; }
#tuttip.compact.low .tk { display: none; }
#tuttip.compact b { font-size: 12px; } #tuttip.compact p { font-size: 12px; } #tuttip.compact .tk { font-size: 12px; }

`;

export function installTutorial(game, store) {
  const g = game, p = g.player, en = g.enemies, rooms = g.rooms;
  const tips = store.get('tips', {});
  let tut = null;        // 진행 중인 튜토리얼 { i, t, n, ... }
  let replay = false;    // 격납고 버튼으로 다시 보기
  let tipQ = [], tipT = 0, tipNow = null, frameN = 0;

  // ---- DOM ----
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const panel = document.createElement('div'); panel.id = 'tut'; panel.className = 'pix dark'; panel.hidden = true;
  panel.innerHTML = '<div class="th"><span class="ts"></span><button type="button" class="tx btn">건너뛰기 ✕</button></div><b class="tt"></b><p></p><div class="tk"></div><span class="tb"><i></i></span>';
  const tipEl = document.createElement('div'); tipEl.id = 'tuttip'; tipEl.className = 'pix dark'; tipEl.hidden = true;
  document.body.append(panel, tipEl);
  const q = (s) => panel.querySelector(s);
  q('.tx').addEventListener('click', (e) => { e.stopPropagation(); finish(true); });

  const kbd = (k) => `<kbd>${k}</kbd>`;
  const keyLine = (S) => {
    const keys = S.keys?.length || S.mouse ? `<span><em>키보드</em>${(S.keys || []).map(kbd).join('')}${S.mouse ? ` ${S.keys?.length ? '/ ' : ''}${S.mouse}` : ''}</span>` : '';
    const touch = S.touch ? `<span><em>터치</em>${S.touch}</span>` : '';
    return g.touch ? touch + keys : keys + touch;
  };

  // 격납고: 출격 버튼 줄에 '튜토리얼' 버튼 (없으면 격납고 화면 아래에)
  const replayBtn = document.createElement('button');
  replayBtn.type = 'button'; replayBtn.className = 'btn'; replayBtn.id = 'tutbtn'; replayBtn.textContent = '튜토리얼';
  replayBtn.addEventListener('click', () => { if (g.state === 'hangar') { replay = true; g.startRun(); } });
  const ach = $('achbtn');
  if (ach) ach.before(replayBtn);
  else { Object.assign(replayBtn.style, { position: 'fixed', left: '12px', bottom: '12px', zIndex: 30 }); ($('hangar') || document.body).appendChild(replayBtn); }

  // ---- 튜토리얼 진행 ----
  const glow = (id) => { for (const b of document.querySelectorAll('#pad .tut-glow')) b.classList.remove('tut-glow'); if (id) $(id)?.classList.add('tut-glow'); };
  function show(S, i) {
    panel.classList.remove('done', 'low', 'pop'); void panel.offsetWidth; panel.classList.add('pop');
    q('.ts').textContent = `훈련 ${i + 1}/${STEPS.length}`;
    q('.tt').textContent = S.title; q('p').textContent = S.text;
    q('.tk').innerHTML = keyLine(S);
    q('.tb').hidden = !S.need; q('.tb i').style.width = '0%';
    glow(g.touch ? S.btn : null);
  }
  function begin() {
    tut = { i: -1, t: 0, n: 0, spawnT: 0, cardDone: false, lastX: p.x, lastZ: p.z };
    rooms.phase = 'tut'; // 'clear' 가 아니면 출격 지점 문이 열리지 않는다
    layout();
    next();
  }
  function next() {
    tut.i++; tut.t = 0; tut.n = 0;
    const S = STEPS[tut.i];
    if (!S) { finish(false); return; }
    if (S.id === 'card' && tut.cardDone) { next(); return; } // 이미 레벨 업으로 카드를 골랐으면 넘어감
    tut.kills = g.stats.kills; tut.dash = p.dashId; tut.mode = p.mode; tut.special = false;
    if (S.id === 'xp') dropGems(6);
    if (S.id === 'card' && g.pendingLevels <= 0) g.addXp(g.xpNeed - g.xp + 0.01);
    if (S.id === 'od') p.od = 1;
    show(S, tut.i);
    g.sfx.play('ready');
  }
  function finish(skipped) {
    if (!tut) return;
    tut = null; replay = false;
    store.set('tutorial', 1);
    glow(null);
    if (g.state === 'hangar') { panel.hidden = true; return; }
    if (rooms.phase === 'tut') { rooms.phase = 'clear'; en.detonateAll(); }
    if (skipped) { panel.hidden = true; return; }
    tips.od = 1; store.set('tips', tips); // 훈련에서 이미 배움
    panel.classList.remove('pop'); void panel.offsetWidth; panel.classList.add('done', 'pop');
    q('.ts').textContent = 'TRAINING CLEAR'; q('.tt').textContent = '훈련 완료!'; q('p').textContent = '살아남아 고철을 모으고 기체를 키우세요';
    q('.tk').innerHTML = ''; q('.tb').hidden = true; q('.tx').hidden = true;
    g.sfx.play('clear');
    setTimeout(() => { if (!tut) panel.hidden = true; q('.tx').hidden = false; }, 2600);
  }
  function dropGems(n) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, r = 3.6 + Math.random() * 1.2;
      const x = Math.max(-rooms.hx + 1.5, Math.min(rooms.hx - 1.5, p.x + Math.cos(a) * r)), z = Math.max(-rooms.hz + 1.5, Math.min(rooms.hz - 1.5, p.z + Math.sin(a) * r));
      g.pickups.gem(x, z, 1);
    }
  }
  // 연습 상대: 고철 벌레를 천천히, 몇 마리만
  function spawnMites(dt, keep) {
    tut.spawnT -= dt;
    if (tut.spawnT > 0 || en.list.length + en.pending.length >= keep) return;
    tut.spawnT = 1.4;
    const pt = rooms.spawnSpot(5);
    if (pt) en.pack('mite', pt[0], pt[1], 2 + (Math.random() < 0.5 ? 1 : 0), 1.2);
  }
  function step(dt) {
    const S = STEPS[tut.i];
    if (!S) return;
    tut.t += dt;
    // 안전 장치: 체력 절반 밑으로 안 떨어짐
    if (p.hp < p.stats.maxHp * 0.5) p.hp = p.stats.maxHp * 0.5;
    let k = 0;
    if (S.id === 'move') {
      tut.n += Math.hypot(p.x - tut.lastX, p.z - tut.lastZ);
      k = tut.n / S.need;
    } else if (S.id === 'attack') {
      spawnMites(dt, 5);
      k = (g.stats.kills - tut.kills) / S.need;
    } else if (S.id === 'dash') {
      k = (p.dashId - tut.dash) / S.need;
    } else if (S.id === 'xp') {
      k = tut.n / S.need;
      if (!g.pickups.gems.length && k < 1) dropGems(S.need - tut.n);
      if (tut.t > 8) for (const gem of g.pickups.gems) gem.pull = true; // 못 찾으면 끌어당겨 줌
    } else if (S.id === 'card') {
      k = tut.cardDone ? 1 : 0;
    } else if (S.id === 'special') {
      spawnMites(dt, 4);
      k = tut.special ? 1 : 0;
    } else if (S.id === 'mode') {
      spawnMites(dt, 4);
      k = p.mode !== tut.mode ? 1 : 0;
    } else if (S.id === 'od') {
      spawnMites(dt, 6);
      if (p.od < 1 && p.odT <= 0) p.od = 1;
      k = p.odT > 0 ? 1 : 0;
    }
    tut.lastX = p.x; tut.lastZ = p.z;
    q('.tb i').style.width = `${Math.min(1, k) * 100}%`;
    if (k >= 1) { if ((tut.doneT = (tut.doneT || 0) + dt) > (S.id === 'mode' || S.id === 'od' ? 1.2 : 0.5)) { tut.doneT = 0; next(); } }
  }

  // ---- 팁 (처음 한 번만) ----
  function tip(id) {
    if (tips[id] || tut) return; // 훈련 중에는 팁 대신 훈련 안내
    tips[id] = 1; store.set('tips', tips);
    tipQ.push(id);
  }
  function showTip(id) {
    const T = TIPS[id];
    tipNow = id; tipT = 4.5;
    tipEl.className = 'pix dark' + (T.warn ? ' warn' : '') + (g.state === 'levelup' ? ' low' : '') + (panel.classList.contains('compact') ? ' compact' : '');
    tipEl.innerHTML = `<span class="tg">TIP</span><b>${T.title}</b><p>${T.text}</p>${T.keys || T.touch ? `<div class="tk">${keyLine(T)}</div>` : ''}`;
    tipEl.hidden = false;
    tipEl.style.animation = 'none'; void tipEl.offsetWidth; tipEl.style.animation = '';
  }

  // 자리 잡기: 보통은 HUD 가운데 방 정보(와 보스 체력) 바로 밑.
  //  낮은 화면(폰 가로)은 기체를 가리지 않게 맨 위 체력 상자와 처치 수 사이 빈칸에 작게
  function layout() {
    const box = (id) => { const el = $(id); return el && !el.hidden && el.offsetParent ? el.getBoundingClientRect() : null; };
    const st = document.body.style, compact = innerHeight < 520;
    panel.classList.toggle('compact', compact); tipEl.classList.toggle('compact', compact);
    const hp = box('hpbox'), side = box('side'), xp = box('xprow');
    if (compact && hp && side && side.left - hp.right > 280) {
      st.setProperty('--tut-top', `${Math.round((xp?.bottom || 0) + 4)}px`);
      st.setProperty('--tut-x', `${Math.round((hp.right + side.left) / 2)}px`);
      st.setProperty('--tut-w', `${Math.round(side.left - hp.right - 12)}px`);
      return;
    }
    let top = 0;
    for (const id of ['roombox', 'boss']) { const r = box(id); if (r) top = Math.max(top, r.bottom); }
    for (const k of ['--tut-x', '--tut-w']) st.removeProperty(k);
    if (top) st.setProperty('--tut-top', `${Math.round(top + 10)}px`); else st.removeProperty('--tut-top');
  }

  // ---- 게임에 걸기 ----
  wrap(g, 'startRun', (orig, ...a) => {
    orig(...a);
    tipQ = []; tipNow = null; tipEl.hidden = true; panel.hidden = true;
    if (replay || !store.get('tutorial', 0)) begin();
  });
  wrap(g, 'toHangar', (orig, ...a) => { tut = null; replay = false; glow(null); panel.hidden = tipEl.hidden = true; tipQ = []; tipNow = null; orig(...a); });
  wrap(rooms, 'update', (orig, dt) => { orig(dt); if (tut && g.state === 'play') step(dt); });
  wrap(g, 'addXp', (orig, v) => { orig(v); if (tut && STEPS[tut.i]?.id === 'xp') tut.n++; });
  wrap(g, 'pick', (orig, i) => { const ok = g.state === 'levelup' && g.choices?.[i]; orig(i); if (tut && ok) tut.cardDone = true; });
  wrap(g.weapons, 'special', (orig, ...a) => { const r = orig(...a); if (tut) tut.special = true; return r; });
  wrap(g, 'offerCards', (orig, ...a) => { orig(...a); if (g.choices?.some((c) => c.kind === 'evolve' || c.isEvo)) tip('evo'); });
  wrap(g.pickups, 'salvage', (orig, ...a) => { const n = g.pickups.parts.length; orig(...a); if (g.pickups.parts.length > n) tip('salvage'); });
  wrap(g.pickups, 'drop', (orig, kind, ...a) => { orig(kind, ...a); if (kind === 'crate') tip('crate'); });
  wrap(en, 'spawnMid', (orig, ...a) => { const m = orig(...a); tip('mid'); return m; });
  wrap(rooms, 'openDoors', (orig, ...a) => { orig(...a); tip('door'); });
  wrap(p, 'addOd', (orig, ...a) => { const was = p.od >= 1; orig(...a); if (!was && p.od >= 1) tip('od'); });

  // 매 프레임: 보일지 말지, 팁 시간
  wrap(g, 'update', (orig, dt) => {
    orig(dt);
    const live = g.state === 'play' || g.state === 'levelup' || g.state === 'install' || g.state === 'transition';
    if (tut) {
      panel.hidden = !live;
      // 레벨 업 카드가 떠 있으면 카드 안내로 바꾸고 아래로 내림
      const card = g.state === 'levelup';
      if (card !== panel.classList.contains('low')) {
        panel.classList.toggle('low', card);
        if (card) { const ci = STEPS.findIndex((s) => s.id === 'card'), S = STEPS[ci]; q('.ts').textContent = `훈련 ${ci + 1}/${STEPS.length}`; q('.tt').textContent = S.title; q('p').textContent = S.text; q('.tk').innerHTML = keyLine(S); q('.tb').hidden = true; glow(null); }
        else show(STEPS[tut.i], tut.i);
      }
    }
    replayBtn.hidden = g.state !== 'hangar';
    if (live && ++frameN % 20 === 1) layout();
    if (!live) { tipEl.hidden = true; if (!tut) panel.hidden = true; return; }
    // 팁은 한 번에 하나, 훈련 안내(완료 표시 포함)가 떠 있으면 기다린다
    //  카드 화면에서는 진화 팁만 (카드 아래에), 나머지는 카드를 고른 뒤로 미룬다
    const cards = g.state === 'levelup';
    tipEl.classList.toggle('low', cards);
    if (cards) {
      if (tipNow !== 'evo' && tipQ.includes('evo')) { if (tipNow) tipQ.unshift(tipNow); tipQ = tipQ.filter((t) => t !== 'evo'); showTip('evo'); }
      tipEl.hidden = tipNow !== 'evo';
      if (tipNow === 'evo' && (tipT -= dt) <= 0) tipNow = null;
      return;
    }
    if (tipNow && (tipT -= dt) <= 0) tipNow = null;
    if (!tipNow && tipQ.length && panel.hidden) showTip(tipQ.shift());
    tipEl.hidden = !tipNow;
  });

  // 테스트용: game.tutorial.reset() 후 출격하면 처음부터
  g.tutorial = {
    get active() { return !!tut; },
    get step() { return tut ? STEPS[tut.i]?.id : null; },
    reset() { store.set('tutorial', 0); store.set('tips', {}); for (const k in tips) delete tips[k]; },
    skip() { finish(true); },
  };
}
