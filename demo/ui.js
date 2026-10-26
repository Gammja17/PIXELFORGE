// 데모 UI 연결 (설정 패널, 모바일 조이스틱, HUD)
import { boot } from './main.js';

const $ = (id) => document.getElementById(id);
const fmtHour = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function start() {
  const canvas = $('view');
  let game;
  const stats = $('stats'), stick = $('stick'), knob = $('knob');
  let statT = 0;
  try {
    game = boot(canvas, {
      onHour: (h) => { $('hour').value = h.toFixed(1); $('hour-label').textContent = fmtHour(h); },
      onFrame: (engine) => {
        const s = engine.input.stick;
        stick.hidden = !s.active;
        if (s.active) {
          stick.style.transform = `translate(${s.ox - 56}px, ${s.oy - 56}px)`;
          knob.style.transform = `translate(${s.x * 40}px, ${-s.y * 40}px)`;
        }
        statT += 1;
        if (statT % 15 === 0) {
          const st = engine.renderer.stats;
          stats.textContent = `${st.lowW - 2}×${st.lowH - 2} · ×${st.scale} · ${Math.round(engine.fps)} FPS`;
        }
      },
    });
  } catch (e) {
    $('error').hidden = false;
    $('error-msg').textContent = e.message;
    console.error(e);
    return;
  }
  window.game = game; // 콘솔에서 만져보기용
  const { engine } = game;
  const st = engine.renderer.settings;

  // 픽셀 / 원본 비교
  const modeBtns = document.querySelectorAll('[data-mode]');
  let saved = null;
  const setMode = (raw) => {
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'raw') === raw)));
    if (raw && !saved) {
      saved = { outline: st.outline, palette: st.palette, dither: st.dither };
      Object.assign(st, { outline: false, palette: null, dither: 0 });
    } else if (!raw && saved) { Object.assign(st, saved); saved = null; }
    game.setRaw(raw);
  };
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode === 'raw')));

  // 설정 패널
  const panel = $('panel'), gear = $('gear');
  const openPanel = (v) => { panel.hidden = !v; gear.setAttribute('aria-expanded', String(v)); };
  gear.addEventListener('click', () => openPanel(panel.hidden));
  $('panel-close').addEventListener('click', () => openPanel(false));
  if (matchMedia('(min-width: 900px)').matches) openPanel(true);

  // 도트 크기: 저해상도 1칸 = 화면(디바이스) 픽셀 몇 칸. 바로 반영됨
  engine.pixelScale = 4;
  const showDots = () => { $('dot-val').textContent = `×${engine.pixelScale}`; };
  const setDots = (v) => { engine.pixelScale = Math.max(1, Math.min(16, v)); showDots(); };
  $('dot-minus').addEventListener('click', () => setDots(engine.pixelScale - 1));
  $('dot-plus').addEventListener('click', () => setDots(engine.pixelScale + 1));
  addEventListener('keydown', (e) => { if (e.key === '[') setDots(engine.pixelScale - 1); if (e.key === ']') setDots(engine.pixelScale + 1); });
  showDots();
  $('free-rot').addEventListener('change', (e) => game.setFreeRotate(e.target.checked));
  const hour = $('hour');
  hour.value = game.getHour().toFixed(1);
  $('hour-label').textContent = fmtHour(game.getHour());
  hour.addEventListener('input', () => { game.setHour(Number(hour.value)); $('hour-label').textContent = fmtHour(Number(hour.value)); });
  $('auto').addEventListener('change', (e) => game.setAutoTime(e.target.checked));
  $('outline').addEventListener('change', (e) => { if (saved) saved.outline = e.target.checked; else st.outline = e.target.checked; });
  $('bloom').addEventListener('change', (e) => { st.bloom = e.target.checked; });
  $('clouds').addEventListener('change', (e) => { st.clouds = e.target.checked; });
  $('dither').addEventListener('change', (e) => { const v = e.target.checked ? 0.09 : 0; if (saved) saved.dither = v; else st.dither = v; });
  $('palette').addEventListener('change', (e) => {
    game.setPalette(e.target.value);
    if (saved) { saved.palette = st.palette; st.palette = null; }
  });

  // 터치 기기: 점프 버튼과 안내 문구
  const coarse = matchMedia('(pointer: coarse)').matches;
  $('jump').hidden = !coarse;
  $('magic').hidden = !coarse;
  $('magic').addEventListener('pointerdown', (e) => { e.preventDefault(); game.cast(); });
  $('hint').textContent = coarse
    ? '왼쪽 드래그 이동 · 오른쪽 탭 마법 · 오른쪽 밀기 회전 · 두 손가락 줌'
    : 'WASD 이동 · Space 점프 · F/클릭 마법 · 드래그 또는 Q/E 회전 · 휠 줌 · [ ] 도트 크기';
  $('jump').addEventListener('pointerdown', (e) => { e.preventDefault(); game.jump(); });

  engine.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
