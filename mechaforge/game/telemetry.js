// 플레이테스트 계측. 외부 서버로는 아무것도 보내지 않는다 (기록은 이 브라우저 localStorage 'mechaforge.telemetry' 에만)
//
//  1. 플레이 기록  판 시작/끝, 결과(win / death / quit), 죽은 방(깊이, 구역, 방 종류, 작전), 판 길이, 레벨, 처치, 고른 카드/노획/정비,
//                  몇 번째 판, 튜토리얼 완료/건너뜀, 첫 레벨업까지 걸린 시간, 판마다 FPS 요약(평균, 하위 1%, 최저)과 최대 적/탄 수,
//                  JS 오류(메시지, 스택 앞부분, 그때 상태). 최근 50판, 오류 30건까지
//                  결과 화면 '테스트 기록 복사' → 요약 JSON 을 클립보드로 (테스터가 설문에 붙여넣기). 설문 주소는 SURVEY_URL
//  2. 성능         F3 또는 ?fps=1: FPS, 프레임 시간, 적/탄/파티클 수, 그리기 호출 수 오버레이
//                  ?bench=1: 마지막 구역 수준 물량을 30초 띄우고 FPS 요약을 화면과 document.title 에 (rAF 실측이라 창이 보여야 한다)
//  3. 자동 완주    ?autotest=1: 고정 프레임(1/60)으로 출격 → 방 진행 → 수호자 → 타이탄(MK-II) → 승리. rAF 대신 직접 engine.step,
//                  setTimeout 도 게임 시간으로 돌린다. 결과는 document.title 'AUTOTEST PASS ...' / 'AUTOTEST FAIL <이유>'
//                  (tools/autotest.ps1 이 headless 브라우저로 열어서 읽는다)
//  bench / autotest 는 메모리 저장소를 써서 실제 저장(고철, 업적, 이 기록)을 건드리지 않는다
//
//  main.js 생성자에서 installTelemetry(game, store) 한 줄로 건다. 다른 파일은 고치지 않고 인스턴스 메서드를 감싸기만 한다 (runhooks.js 와 같은 방식)
//  콘솔: game.telemetry.summary(), game.telemetry.db, game.telemetry.clear()

import { WEAPONS } from './weapons.js';

export const SURVEY_URL = ''; // 플레이테스트 설문 주소. 비어 있으면 결과 화면에 설문 버튼을 숨긴다
const KEEP_RUNS = 50, KEEP_ERRORS = 30;
const BENCH_SEC = 30;

const Q = new URLSearchParams(location.search);
const flag = (k) => Q.has(k) && Q.get(k) !== '0';
export const AUTOTEST = flag('autotest'), BENCH = flag('bench');

// ---- 테스트 모드: 메모리 저장소 (튜토리얼은 끝낸 것으로) ----
if (AUTOTEST || BENCH) {
  const mem = new Map([['mechaforge.tutorial', '1']]);
  const shim = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch { /* 못 바꾸면 실제 저장소를 쓴다 */ }
}

// ---- JS 오류: 게임이 뜨기 전 것도 모아 둔다 ----
const early = [];
let onError = (e) => early.push(e);
const errInfo = (msg, stack, src) => ({
  at: new Date().toISOString(), msg: String(msg ?? '').slice(0, 300),
  stack: String(stack || '').split('\n').slice(0, 6).map((s) => s.trim()).join('\n').slice(0, 900), src, n: 1,
});
addEventListener('error', (ev) => {
  if (ev.target && ev.target !== window) return; // 이미지/스크립트 불러오기 실패는 제외
  const er = ev.error;
  onError(errInfo(ev.message || er?.message, er?.stack, ev.filename ? `${ev.filename.split('/').pop().split('?')[0]}:${ev.lineno}:${ev.colno}` : ''));
});
addEventListener('unhandledrejection', (ev) => { const r = ev.reason; onError(errInfo(`(promise) ${r?.message ?? r}`, r?.stack, '')); });

// 렌더러가 안 뜨면 (WebGL2 없음) 게임 객체가 안 생긴다
if (AUTOTEST) setTimeout(() => { if (!window.game) document.title = `AUTOTEST FAIL boot: ${document.getElementById('error-msg')?.textContent || 'game 없음'}`; }, 8000);

const r1 = (v) => Math.round(v * 10) / 10;
const wrap = (obj, name, fn) => { const orig = obj[name].bind(obj); obj[name] = (...a) => fn(orig, ...a); };
const $ = (id) => document.getElementById(id);

// ---- 프레임 시간 → FPS 요약. 0.5ms 칸 히스토그램 (100ms 넘는 프레임은 마지막 칸) ----
const HB = 0.5, HN = 200;
const newFps = () => ({ n: 0, sum: 0, max: 0, h: new Uint32Array(HN + 1) });
function addFrame(f, ms) { f.n++; f.sum += ms; if (ms > f.max) f.max = ms; f.h[Math.min(HN, Math.floor(ms / HB))]++; }
// avg: 평균 FPS, low1: 느린 쪽 1% 경계 프레임의 FPS (99 퍼센타일 프레임 시간), min: 가장 느린 프레임
function fpsSummary(f) {
  if (!f || !f.n) return null;
  let k = Math.max(1, Math.ceil(f.n * 0.01)), i = HN;
  for (; i > 0; i--) if ((k -= f.h[i]) <= 0) break;
  const p99 = Math.min(f.max, (i + 0.5) * HB);
  return { avg: r1((1000 * f.n) / f.sum), low1: r1(1000 / p99), min: r1(1000 / f.max), ms: r1(f.sum / f.n), frames: f.n };
}

const LIVE = new Set(['play', 'levelup', 'install', 'transition', 'station', 'dying', 'victoryWait']);

export function installTelemetry(game, store) {
  const g = game, R = g.rooms, en = g.enemies, p = g.player, eng = g.engine, shots = g.shots;
  const mode = AUTOTEST ? 'autotest' : BENCH ? 'bench' : null;

  // ---- 저장 ----
  const db = store.get('telemetry', null) || {};
  db.v = 1; db.id ||= Math.random().toString(36).slice(2, 10); db.since ||= new Date().toISOString();
  db.total ||= 0; db.runs ||= []; db.errors ||= [];
  for (const r of db.runs) if (!r.result) { r.result = 'quit'; r.closed = true; } // 지난번에 창을 닫아 끝을 못 적은 판
  const save = () => {
    if (db.runs.length > KEEP_RUNS) db.runs.splice(0, db.runs.length - KEEP_RUNS);
    if (db.errors.length > KEEP_ERRORS) db.errors.splice(0, db.errors.length - KEEP_ERRORS);
    store.set('telemetry', db);
  };

  let cur = null, fps = null, lastHurt = null;
  const snap = () => ({ state: g.state, depth: R.depth, room: R.reward, op: R.op || null, zone: R.zone, t: r1(g.time || 0), lv: g.level, enemies: en.list.length, run: cur && !cur.result ? cur.n : null });

  // ---- 오류 ----
  const errListeners = [];
  onError = (e) => {
    e.state = snap();
    const last = db.errors[db.errors.length - 1];
    if (last && last.msg === e.msg && last.src === e.src) { last.n++; last.state = e.state; } else db.errors.push(e);
    if (cur && !cur.result) cur.errors++;
    save();
    for (const f of errListeners) f(e);
  };
  for (const e of early.splice(0)) onError(e);

  // ---- 판 시작 / 끝 ----
  function begin() {
    const s = g.selection, m = g.mods;
    db.total++;
    cur = {
      n: db.total, at: new Date().toISOString(), result: null, mode: mode || undefined,
      build: { arch: g.arch, legs: s.legs, frame: s.frame, head: s.head, weapon: s.weapon, paint: s.paint, pilot: m.pilot ?? null, threat: m.threat || 0 },
      boss: R.bossKind, last: R.last, time: 0, wall: 0, firstLv: null, tut: null, cards: [], path: [], errors: 0, maxEnemies: 0, maxShots: 0,
    };
    cur.wall0 = performance.now();
    fps = newFps();
    db.runs.push(cur);
    if (g.tutorial?.active) cur.tut = 'on';
    save();
    if ($('rescopytext')) $('rescopytext').hidden = true;
    if ($('rescopy')) $('rescopy').textContent = '테스트 기록 복사';
  }
  function end(result, extra = {}) {
    if (!cur || cur.result) return;
    const lo = p.loadout;
    Object.assign(cur, {
      result, time: r1(g.time || 0), wall: Math.round((performance.now() - cur.wall0) / 1000),
      depth: R.depth, zone: R.zone, room: R.reward, op: R.op || null, special: R.special || null, phase: R.phase,
      level: g.level, kills: g.stats?.kills || 0, combo: g.stats?.bestCombo || 0, chips: g.chips || 0,
      weapons: g.weapons.list.map((w) => `${w.id}${w.evo ? '*' : ''}:${w.level}`), modules: Object.entries(lo.modules || {}).map(([k, v]) => `${k}:${v}`),
      fps: fpsSummary(fps),
    }, extra);
    if (cur.tut === 'on') cur.tut = `quit:${g.tutorial?.step || '?'}`;
    if (result === 'death' && lastHurt) cur.killedBy = lastHurt;
    delete cur.wall0;
    save();
  }

  wrap(g, 'startRun', (orig, ...a) => { end('quit'); orig(...a); begin(); });
  wrap(g, 'toHangar', (orig, ...a) => { end('quit'); orig(...a); });
  wrap(g, 'gameOver', (orig, ...a) => { const was = g.state; orig(...a); if (was === 'play' && g.state === 'dying') end('death'); });
  wrap(g, 'victory', (orig, ...a) => { orig(...a); end('win'); });
  addEventListener('pagehide', () => end('quit', { closed: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && cur && !cur.result) { cur.time = r1(g.time || 0); cur.depth = R.depth; save(); } });

  // 방 이동 경로: [깊이, 방 종류, 작전, 구역, 들어간 시각(초)]
  wrap(R, 'enter', (orig, ...a) => { orig(...a); if (cur && !cur.result) { cur.path.push([R.depth, R.reward, R.op || '', R.zone, r1(g.time || 0)]); cur.depth = R.depth; save(); } });
  // 고른 카드 / 노획 / 정비
  wrap(g, 'pick', (orig, i) => {
    const c = g.state === 'levelup' && g.choices?.[i];
    if (c && cur && !cur.result) cur.cards.push({ t: r1(g.time), lv: g.level, src: g.cardKind, kind: c.kind, id: c.id, to: c.level, name: c.name });
    orig(i);
  });
  wrap(g, 'salvageInstall', (orig, kind, id, ...a) => { if (cur && !cur.result) cur.cards.push({ t: r1(g.time), lv: g.level, src: 'salvage', kind, id }); orig(kind, id, ...a); });
  wrap(g, 'stationAct', (orig, act, kind, id) => { const ok = orig(act, kind, id); if (ok && cur && !cur.result) cur.cards.push({ t: r1(g.time), lv: g.level, src: 'station', kind, id, act }); return ok; });
  // 첫 레벨업 (게임 시간, 일시정지/카드 화면 제외)
  wrap(g, 'addXp', (orig, v) => {
    const L = g.level;
    orig(v);
    if (cur && !cur.result && cur.firstLv == null && g.level > L) { cur.firstLv = r1(g.time); if (db.firstLv == null) db.firstLv = cur.firstLv; }
  });
  // 죽인 것: 치명타가 들어오는 순간 가장 가까운 적
  wrap(p, 'hurt', (orig, dmg, ...a) => {
    if (cur && !cur.result && p.hp > 0 && dmg >= p.hp * 0.5) {
      let best = null, bd = 1e9;
      for (const e of en.list) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.z - p.z) - (e.r || 0); if (d < bd) { bd = d; best = e; } }
      lastHurt = { dmg: Math.round(dmg), near: best ? (best.boss ? `boss:${R.bossKind}` : best.guard ? 'guardian' : best.type) : null, dist: best ? r1(bd) : null, shots: shots.enemyList.length };
    }
    return orig(dmg, ...a);
  });

  // ---- 매 프레임: 프레임 시간, 최대 물량, 튜토리얼 ----
  const particles = () => { let n = 0; for (const ps of g.scene.particles) n += ps.list.length; return n; };
  const hud = { on: flag('fps'), el: null, n: 0, sum: 0, max: 0, work: 0, t0: performance.now() };
  let lastNow = 0, driving = false; // driving: 자동 테스트가 직접 step 을 부르는 중 (프레임 시간 의미 없음)
  let bench = null;
  wrap(eng, 'step', (orig, dt) => {
    const now = performance.now(), ms = lastNow ? now - lastNow : 0;
    lastNow = now;
    orig(dt);
    const work = performance.now() - now;
    if (cur && !cur.result) {
      if (en.list.length > cur.maxEnemies) cur.maxEnemies = en.list.length;
      const ns = shots.enemyList.length + shots.list.length;
      if (ns > cur.maxShots) cur.maxShots = ns;
    }
    if (driving) return;
    const real = ms > 0 && ms < 250 && !document.hidden;
    if (cur && !cur.result) {
      if (real && LIVE.has(g.state)) addFrame(fps, ms);
      if (g.tutorial?.active) cur.tut = 'on';
      else if (cur.tut === 'on') { cur.tut = $('tut')?.classList.contains('done') ? 'done' : 'skipped'; db.tutorial = cur.tut; save(); }
    }
    if (bench?.on && real) { addFrame(bench.f, ms); bench.maxE = Math.max(bench.maxE, en.list.length); bench.sumE += en.list.length; bench.maxP = Math.max(bench.maxP, particles()); bench.draws += eng.renderer.stats.drawCalls; }
    if (bench?.on && document.hidden) bench.hidden = true;
    if (hud.on && real) { hud.n++; hud.sum += ms; hud.max = Math.max(hud.max, ms); hud.work += work; }
    if (hud.on && now - hud.t0 > 250) drawHud(now);
  });

  // ---- F3 성능 오버레이 ----
  function drawHud(now) {
    if (!hud.el) {
      hud.el = document.createElement('div'); hud.el.id = 'perfhud';
      Object.assign(hud.el.style, { position: 'fixed', right: '6px', top: '38%', zIndex: 95, pointerEvents: 'none', whiteSpace: 'pre', font: '12px/1.4 ui-monospace, Consolas, monospace',
        color: '#9dffb0', background: 'rgba(5,6,10,.78)', padding: '4px 8px', boxShadow: '0 0 0 1px #2c3a33' });
      document.body.appendChild(hud.el);
    }
    hud.el.hidden = !hud.on;
    const n = hud.n || 1, st = eng.renderer.stats;
    hud.el.textContent = [
      `FPS ${((1000 * hud.n) / Math.max(1, now - hud.t0)).toFixed(1)}`,
      `프레임 ${(hud.sum / n).toFixed(1)}ms  최대 ${hud.max.toFixed(1)}`,
      `CPU   ${(hud.work / n).toFixed(1)}ms`,
      `적    ${en.list.length}`,
      `탄    ${shots.list.length} / 적탄 ${shots.enemyList.length}`,
      `파티클 ${particles()}`,
      `그리기 ${st.drawCalls}  ${st.lowW}x${st.lowH}×${st.scale}`,
      `${g.state}  d${R.depth ?? '-'} ${R.reward || ''}${R.op ? ` ${R.op}` : ''}`,
    ].join('\n');
    hud.n = hud.sum = hud.max = hud.work = 0; hud.t0 = now;
  }
  addEventListener('keydown', (e) => {
    if (e.key !== 'F3') return;
    e.preventDefault();
    hud.on = !hud.on; hud.t0 = performance.now(); hud.n = hud.sum = hud.max = hud.work = 0;
    if (hud.el) hud.el.hidden = !hud.on;
  });

  // ---- 요약 JSON (설문 붙여넣기용) ----
  function summary() {
    const runs = db.runs, fin = runs.filter((r) => r.result && !r.mode), cnt = (k) => fin.filter((r) => r.result === k).length;
    const fpsAll = fin.map((r) => r.fps).filter(Boolean);
    return {
      game: 'MechaForge', v: 1, tester: db.id, since: db.since, at: new Date().toISOString(), page: location.host + location.pathname,
      ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${r1(devicePixelRatio || 1)}`, view: `${innerWidth}x${innerHeight}`, touch: !!g.touch,
      runs: db.total, wins: cnt('win'), deaths: cnt('death'), quits: cnt('quit'), secondRun: db.total >= 2,
      tutorial: db.tutorial || null, firstLevelUpSec: db.firstLv ?? null,
      bestDepth: fin.reduce((m, r) => Math.max(m, r.depth ?? -1), -1),
      fps: fpsAll.length ? { avg: r1(fpsAll.reduce((s, f) => s + f.avg, 0) / fpsAll.length), low1: Math.min(...fpsAll.map((f) => f.low1)), min: Math.min(...fpsAll.map((f) => f.min)) } : null,
      last: runs.slice(-10).map((r) => ({
        n: r.n, res: r.result || 'playing', d: r.depth, room: r.room, op: r.op, zone: r.zone, t: r.time, lv: r.level, k: r.kills, lv1: r.firstLv, tut: r.tut,
        boss: r.boss, by: r.killedBy?.near, build: `${r.build?.arch}/${r.build?.weapon}`, threat: r.build?.threat,
        cards: r.cards.filter((c) => c.src !== 'station').map((c) => c.id).join(','),
        fps: r.fps ? [r.fps.avg, r.fps.low1, r.fps.min] : null, maxE: r.maxEnemies, err: r.errors, closed: r.closed || undefined, mode: r.mode,
      })),
      errors: db.errors.slice(-5).map((e) => ({ msg: e.msg, src: e.src, n: e.n, top: e.stack.split('\n')[1] || e.stack.split('\n')[0] || '', state: e.state && `${e.state.state} d${e.state.depth} ${e.state.room || ''} ${e.state.op || ''}`.trim() })),
    };
  }

  // ---- 결과 화면: 테스트 기록 복사 + 설문 ----
  const copyBtn = $('rescopy'), survey = $('ressurvey');
  if (survey) { survey.hidden = !SURVEY_URL; if (SURVEY_URL) survey.href = SURVEY_URL; }
  copyBtn?.addEventListener('click', async () => {
    const text = JSON.stringify(summary());
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { /* iframe 등에서 막히면 아래 방법 */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; Object.assign(ta.style, { position: 'fixed', left: '-9999px', top: '0' });
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) {
      // 클립보드가 막힌 환경: 결과 창 안에 선택된 글 상자로 보여 주고 직접 복사하게
      let box = $('rescopytext');
      if (!box) {
        box = document.createElement('textarea'); box.id = 'rescopytext'; box.readOnly = true; box.rows = 4;
        Object.assign(box.style, { width: '100%', boxSizing: 'border-box', font: '11px/1.3 ui-monospace, Consolas, monospace', background: '#05060a', color: '#cfd3dc', border: '1px solid #3b4357' });
        ($('restest') || copyBtn.parentElement).after(box);
      }
      box.value = text; box.hidden = false; box.focus(); box.select();
      copyBtn.textContent = '자동 복사가 막혔어요. 아래 글을 Ctrl+C';
      return;
    }
    const was = copyBtn.textContent;
    copyBtn.textContent = '복사됨! 설문에 붙여넣어 주세요';
    setTimeout(() => { copyBtn.textContent = was; }, 2200);
  });

  g.telemetry = {
    db, summary, save,
    get run() { return cur; },
    clear() { db.runs = []; db.errors = []; db.total = 0; db.tutorial = null; db.firstLv = null; cur = null; save(); },
    get hud() { return hud.on; }, set hud(v) { hud.on = !!v; if (hud.el) hud.el.hidden = !hud.on; },
  };

  // ---- 자동 조종 (벤치, 자동 완주 공용) ----
  const bot = { door: null, room: -2, t: 0, tick: 0, spT: 0 };
  function botFrame(dt) {
    if (g.state === 'levelup' && g.choices?.length) { g.pick((Math.random() * g.choices.length) | 0); return; }
    if (g.state === 'install') { if (g.installer.t > 0.3) g.installer.skip(); return; }
    if (g.state === 'station') { g.closeStation(); return; }
    if (g.state === 'paused') g.pause(false);
    if (g.state !== 'play') { g.botAxis = { x: 0, z: 0 }; return; }
    if (bot.room !== R.depth) Object.assign(bot, { room: R.depth, door: null, t: 0, tick: 0 });
    bot.t += dt;
    let tx = null, tz = null, near = false;
    const P = R.prize;
    if (R.phase === 'exits' && R.doors.length) {
      bot.door ||= R.doors[(Math.random() * R.doors.length) | 0];
      tx = bot.door.x * 1.4; tz = bot.door.z * 1.4; // 문 너머까지
    } else if (P && !P.taken && P.y === 0) { tx = P.x; tz = P.z; }
    else if (R.phase === 'fight' && R.op === 'control' && R.points?.[R.cp]) { tx = R.points[R.cp].x; tz = R.points[R.cp].z; }
    else {
      let best = null, bd = 1e9;
      for (const e of en.list) { if (e.dead || e.under) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (best) { tx = best.x; tz = best.z; near = true; }
    }
    let x = 0, z = 0;
    if (tx != null) {
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1;
      if (near) {
        // 적과는 4~6칸 거리를 두고 옆으로 돈다
        const k = d > 6 ? 1 : d < 4 ? -1 : 0;
        x = (dx / d) * k + (-dz / d) * 0.8; z = (dz / d) * k + (dx / d) * 0.8;
      } else if (d > 0.4) { x = dx / d; z = dz / d; }
    }
    // 엄폐물에 걸려 1.5초 동안 거의 못 움직였으면 1초 동안 옆으로 비켜 간다
    if ((bot.chkT = (bot.chkT || 0) + dt) > 1.5) {
      if (tx != null && !near && Math.hypot(p.x - (bot.px ?? 1e9), p.z - (bot.pz ?? 1e9)) < 0.8) { bot.sideT = 1; bot.side = Math.random() < 0.5 ? 1 : -1; }
      bot.chkT = 0; bot.px = p.x; bot.pz = p.z;
    }
    if ((bot.sideT = (bot.sideT || 0) - dt) > 0) { const ox = x; x = -z * bot.side + x * 0.3; z = ox * bot.side + z * 0.3; }
    const l = Math.hypot(x, z);
    g.botAxis = l > 0.01 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
    g.btn.attack = true;
    g.btn.attackPressed = (g.frame % 12) === 0;
    if ((bot.spT -= dt) <= 0) { bot.spT = 2.5; g.btn.special = true; }
    if (p.od >= 1) g.btn.overdrive = true;
  }
  const keepAlive = () => { p.hp = p.stats.maxHp; p.invuln = Math.max(p.invuln, 0.2); };
  // 벤치 중: 자동 조종 + 방 시간을 85% 에 붙잡아 물량 유지 + 4초마다 포위 접근
  wrap(g, 'update', (orig, dt) => {
    if (bench?.on) {
      botFrame(dt); keepAlive();
      if (R.phase === 'fight' && R.duration > 0) R.roomT = Math.min(R.roomT, R.duration * 0.85);
      if (g.state === 'play' && (bench.surgeT -= dt) <= 0) { bench.surgeT = 4; R.surge(); }
    }
    orig(dt);
  });

  // ---- ?bench=1 ----
  async function runBench() {
    const realWait = (ms) => new Promise((r) => setTimeout(r, ms));
    await realWait(1200);
    g.startRun();
    if (g.tutorial?.active) g.tutorial.skip();
    for (const id of ['missile', 'laser', 'shotgun', 'saw', 'mg', 'funnel', 'flamer']) if (WEAPONS[id] && g.weapons.list.length < 3) g.debug.weapon(id, 'evo');
    R.depth = R.last - 2; // 다음 방 = 마지막 구역의 전투 방
    g.nextRoom('part', 'E', 'survive');
    for (let i = 0; i < 100 && !(g.state === 'play' && R.depth === R.last - 1); i++) await realWait(50);
    bench = { on: true, f: newFps(), maxE: 0, sumE: 0, maxP: 0, draws: 0, hidden: document.hidden, t0: performance.now(), surgeT: 4 };
    const label = document.createElement('div');
    Object.assign(label.style, { position: 'fixed', left: '50%', top: '12px', transform: 'translateX(-50%)', zIndex: 96, font: '700 14px/1.5 ui-monospace, Consolas, monospace',
      color: '#ffd86a', background: 'rgba(5,6,10,.85)', padding: '6px 12px', whiteSpace: 'pre', textAlign: 'center', pointerEvents: 'none' });
    document.body.appendChild(label);
    hud.on = true;
    // rAF 실측. 처음 1.5초에 프레임이 거의 안 오면 (창이 숨겨졌거나 가려짐) 직접 구동으로 바꾼다
    const stalled = await new Promise((done) => {
      const tick = () => {
        const sec = (performance.now() - bench.t0) / 1000;
        label.textContent = `BENCH ${Math.max(0, BENCH_SEC - sec).toFixed(0)}s  (창을 가리지 마세요)`;
        if (sec > 1.5 && bench.f.n < 20) return done(true);
        if (sec >= BENCH_SEC) return done(false);
        setTimeout(tick, 200);
      };
      tick();
    });
    if (stalled) {
      // 숨겨진 창은 rAF 가 멈추거나 1초에 1번으로 느려진다 → 직접 프레임을 돌리고 1픽셀 readPixels 로 GPU 를 기다려 프레임 비용을 잰다
      //  (vsync 상한이 없는 '처리 한계' 값이라 rAF 실측과는 다르다. 결과에 driven: true)
      Object.assign(bench, { driven: true, hidden: true, f: newFps(), maxE: 0, sumE: 0, maxP: 0, draws: 0, t0: performance.now() });
      eng.stop();
      const gl = eng.gl, px = new Uint8Array(4), mc = new MessageChannel(), wake = [];
      mc.port1.onmessage = () => wake.shift()?.();
      while ((performance.now() - bench.t0) / 1000 < BENCH_SEC) {
        const t = performance.now();
        driving = true; eng.step(1 / 60); driving = false;
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        addFrame(bench.f, performance.now() - t);
        bench.maxE = Math.max(bench.maxE, en.list.length); bench.sumE += en.list.length; bench.maxP = Math.max(bench.maxP, particles()); bench.draws += eng.renderer.stats.drawCalls;
        label.textContent = `BENCH ${Math.max(0, BENCH_SEC - (performance.now() - bench.t0) / 1000).toFixed(0)}s  (창 숨김: 직접 구동)`;
        await new Promise((r) => { wake.push(r); mc.port2.postMessage(0); });
      }
      eng.start();
    }
    bench.on = false;
    g.botAxis = null; g.btn.attack = false;
    const s = fpsSummary(bench.f), st = eng.renderer.stats, n = bench.f.n || 1;
    const res = {
      ...s, seconds: BENCH_SEC, enemiesMax: bench.maxE, enemiesAvg: Math.round(bench.sumE / n), particlesMax: bench.maxP, drawsAvg: Math.round(bench.draws / n),
      canvas: `${eng.canvas.width}x${eng.canvas.height}`, low: `${st.lowW}x${st.lowH}`, dpr: r1(devicePixelRatio || 1), zone: R.zone, depth: R.depth, hidden: bench.hidden, driven: !!bench.driven, ua: navigator.userAgent,
    };
    window.benchResult = res;
    console.log('BENCH', JSON.stringify(res));
    const line = !s ? 'BENCH FAIL 프레임 0 (창이 숨겨져 rAF 가 돌지 않음)' : `BENCH avg ${res.avg} | 1% ${res.low1} | min ${res.min} fps | 적 최대 ${res.enemiesMax} 평균 ${res.enemiesAvg} | ${res.canvas}${res.driven ? ' | 창 숨김: rAF 대신 직접 구동(vsync 없음, 처리 한계)' : res.hidden ? ' | 도중에 창 숨김(rAF 느려짐)' : ''}`;
    document.title = line;
    label.textContent = `${line}\n파티클 최대 ${res.particlesMax}, 그리기 평균 ${res.drawsAvg}, 저해상도 ${res.low}`;
    label.style.pointerEvents = 'auto';
  }

  // ---- ?autotest=1 ----
  async function runAutotest() {
    const realST = window.setTimeout.bind(window);
    // 잠깐 양보: MessageChannel 은 창이 숨겨져 있어도 setTimeout 처럼 1초로 묶이지 않는다
    const mc = new MessageChannel(), wake = [];
    mc.port1.onmessage = () => wake.shift()?.();
    const yieldReal = () => new Promise((r) => { wake.push(r); mc.port2.postMessage(0); });
    // 처음 2.5초는 마우스 조준이 켜진 것으로 치므로 (ui.js mouseT) 그 뒤에, 격납고 한 프레임을 그려 카메라를 잡고 시작
    await new Promise((r) => realST(r, Math.max(600, 2700 - performance.now())));
    eng.step(1 / 60);
    const errs = [];
    errListeners.push((e) => errs.push(e));
    // setTimeout 을 게임 시간으로: 방 전환(0.26초), 승리 화면(1.6초) 같은 지연이 고정 프레임과 같이 흐른다
    let vNow = 0, vSeq = 0;
    const vq = new Map(), realCT = window.clearTimeout.bind(window);
    window.setTimeout = (fn, ms = 0, ...a) => { const id = 1e7 + ++vSeq; vq.set(id, { at: vNow + Math.max(0, Number(ms) || 0) / 1000, fn, a }); return id; };
    window.clearTimeout = (id) => { if (!vq.delete(id)) realCT(id); };
    const runTimers = () => {
      for (let guard = 0; guard < 500; guard++) {
        let id = null, q = null;
        for (const [k, v] of vq) if (v.at <= vNow && (!q || v.at < q.at)) { id = k; q = v; }
        if (!q) return;
        vq.delete(id);
        try { if (typeof q.fn === 'function') q.fn(...q.a); } catch (e) { onError(errInfo(e.message, e.stack, 'timer')); }
      }
    };
    // 렌더는 30프레임에 한 번만 (headless 소프트웨어 렌더러는 느리다)
    let draw = true;
    wrap(eng.renderer, 'render', (orig, ...a) => { if (draw) orig(...a); });
    eng.stop();
    driving = true;

    const DT = 1 / 60, wall0 = performance.now();
    const T = { rooms: [], guardians: 0, mk2: false, forced: 0, frames: 0 };
    let fail = null, roomT = 0, roomD = -2, phase0 = null, exitT = 0, stallD = -2, stallT = 0;
    const done = (title) => { document.title = title; window.autotestResult = { title, ...T, errors: errs }; console.log(title, JSON.stringify(window.autotestResult)); driving = false; };

    g.startRun();
    if (g.tutorial?.active) g.tutorial.skip();
    R.bossKind = 'titan';
    const where = () => `d${R.depth} ${R.reward}${R.op ? `/${R.op}` : ''} ${g.state}/${R.phase}`;
    while (!fail) {
      for (let i = 0; i < 120 && !fail; i++) {
        try {
          botFrame(DT); keepAlive();
          // 막히지 않게 돕기: 전투가 길어지면 적에게 일정 피해, 너무 길면 방을 끝낸 것으로
          if (g.state === 'play' && R.phase === 'fight') {
            if (roomD !== R.depth) { roomD = R.depth; roomT = 0; T.rooms.push(`${R.depth}:${R.reward}${R.op ? `/${R.op}` : ''}`); }
            roomT += DT;
            const big = R.reward === 'boss' || R.reward === 'guardian';
            if (roomT > (big ? 6 : R.op === 'horde' ? 8 : 18) && (bot.tick -= DT) <= 0) {
              bot.tick = 0.5; g.dmgSrc = 'autotest';
              for (const e of [...en.list]) if (!e.dead && !e.prop) en.hit(e, e.maxHp * (e.boss ? 0.07 : e.guard ? 0.1 : 0.45) + 1, 0, 0, 0, { quiet: true, noNum: true });
              g.dmgSrc = null;
            }
            if (!big && roomT > 120) { T.forced++; roomT = -1e9; R.phase = 'reward'; en.detonateAll(); R.spawnPrize(); }
            if (roomT > 240) fail = `stuck ${where()}`;
          }
          // 문으로 못 걸어가면 12초 뒤 문을 지난 것으로 (rooms.update 문 통과와 같은 호출)
          if (g.state === 'play' && R.phase === 'exits') {
            if ((exitT += DT) > 12 && bot.door) { T.forced++; exitT = 0; const d = bot.door; g.nextRoom(d.reward, d.side === 'W' ? 'E' : 'N', d.op, d.zone); }
          } else exitT = 0;
          if (R.depth !== stallD) { stallD = R.depth; stallT = g.time; }
          if (g.time - stallT > 400) fail = `stall ${where()}`;
          if (R.reward === 'guardian' && phase0 === 'fight' && R.phase === 'reward') T.guardians++;
          if (en.boss?.reborn && !en.boss.inv) T.mk2 = true;
          phase0 = R.phase;
          draw = T.frames % 30 === 0;
          eng.step(DT);
          vNow += DT; runTimers();
          T.frames++;
        } catch (e) { onError(errInfo(e.message, e.stack, 'autotest')); }
        if (errs.length) { const e = errs[0]; fail = `error: ${e.msg} @ ${e.src || e.stack.split('\n')[1] || ''} (${where()})`; }
        else if (g.state === 'over') fail = `died ${where()}`;
        else if (g.state === 'victory') break;
      }
      if (fail || g.state === 'victory') break;
      if ((performance.now() - wall0) / 1000 > 240) fail = `timeout ${where()}`;
      if (g.time > 3600) fail = `sim timeout ${where()}`;
      await yieldReal();
    }
    const run = db.runs[db.runs.length - 1];
    if (!fail && !T.mk2) fail = 'MK-II 를 못 봄';
    if (!fail && T.guardians < 2) fail = `수호자 ${T.guardians}/2`;
    if (!fail && run?.result !== 'win') fail = `기록 결과 ${run?.result}`;
    const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    if (fail) done(`AUTOTEST FAIL ${fail}`);
    else done(`AUTOTEST PASS rooms ${R.last + 1}/${R.last + 1}, guardians ${T.guardians}, ${R.bossKind}+MK-II, lv ${g.level}, kills ${g.stats.kills}, sim ${mmss(g.time)}, wall ${Math.round((performance.now() - wall0) / 1000)}s, frames ${T.frames}, forced ${T.forced}, errors 0`);
  }

  if (AUTOTEST) runAutotest().catch((e) => { document.title = `AUTOTEST FAIL crash: ${e.message}`; });
  else if (BENCH) runBench();
}
