// PixelForge Worlds — UI 연결
import { createWorld } from './world.js';

const $ = (id) => document.getElementById(id);

// 8x8 도트 아이콘
const ICONS = {
  look: ['..###...', '.#...#..', '#.....#.', '#.....#.', '#.....#.', '.#...#..', '..###.#.', '.......#'],
  human: ['...##...', '...##...', '..####..', '.#.##.#.', '...##...', '..#..#..', '..#..#..', '.##..##.'],
  sheep: ['........', '..####..', '.######.', '########', '.######.', '..#..#..', '..#..#..', '........'],
  wolf: ['#....#..', '##..##..', '.####...', '.#.#.#..', '.####..#', '..####.#', '..#..#..', '..#..#..'],
  tree: ['...##...', '..####..', '.######.', '########', '.######.', '..####..', '...##...', '..####..'],
  meteor: ['#.......', '.#......', '..#.##..', '...####.', '..######', '..######', '...####.', '....##..'],
  inspire: ['...#....', '..###...', '.#####..', '...#....', '.#.#.#..', '#..#..#.', '...#....', '..###...'],
  war: ['#......#', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '##....##', '#......#'],
};
const TOOLS = [
  ['look', '보기'], ['human', '사람'], ['sheep', '양'], ['wolf', '늑대'], ['tree', '나무'], ['inspire', '지식'], ['meteor', '운석'], ['war', '전쟁'],
];
const icon = (rows) => {
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">${rects}</svg>`;
};

function start() {
  let world;
  const logEl = $('log');
  let inspectT = 0;
  const labelEls = new Map();
  try {
    world = createWorld($('view'), {
      onStats: (s) => {
        $('s-year').textContent = s.year;
        $('s-humans').textContent = s.humans;
        $('s-sheep').textContent = s.sheep;
        $('s-wolves').textContent = s.wolves;
        $('s-villages').textContent = s.villages;
        $('s-tribes').textContent = s.tribes;
        $('s-wars').textContent = s.wars;
        $('s-wars').classList.toggle('hot', s.wars > 0);
        $('s-space').textContent = `${s.satellites} / ${s.colonies}`;
        if ($('s-era').textContent !== s.era) $('s-era').textContent = s.era;
        if (inspectT && performance.now() > inspectT) { $('inspect').hidden = true; inspectT = 0; document.body.classList.remove('inspecting'); }
      },
      onLog: (log) => {
        logEl.innerHTML = '';
        for (const e of log.slice(-4)) {
          const p = document.createElement('p');
          p.className = e.kind;
          p.textContent = e.text;
          logEl.appendChild(p);
        }
      },
      onInspect: (main, sub, live = false) => {
        if (main === null) { $('inspect').hidden = true; inspectT = 0; document.body.classList.remove('inspecting'); return; }
        document.body.classList.add('inspecting');
        $('inspect-main').textContent = main;
        $('inspect-sub').textContent = sub || '';
        $('inspect').hidden = false;
        $('inspect').classList.toggle('live', live);
        inspectT = live ? 0 : performance.now() + 5000;
      },
      onLabels: (list) => {
        const box = $('labels'), seen = new Set();
        for (const l of list) {
          seen.add(String(l.id));
          let el = labelEls.get(l.id);
          if (!el) {
            el = document.createElement('div');
            el.className = 'vlabel';
            el.innerHTML = '<b></b><small></small>';
            box.appendChild(el); labelEls.set(l.id, el);
          }
          const col = `rgb(${l.color.map((c) => Math.round(c * 255)).join(',')})`;
          if (el._name !== l.name) { el.querySelector('b').textContent = l.name; el._name = l.name; }
          if (el._sub !== l.sub) { el.querySelector('small').textContent = l.sub; el._sub = l.sub; }
          el.style.setProperty('--tc', col);
          el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, -100%)`;
          el.style.opacity = l.alpha;
          el.classList.toggle('small', l.small);
        }
        for (const [id, el] of labelEls) if (!seen.has(String(id))) { el.remove(); labelEls.delete(id); }
      },
      onTool: (t) => document.querySelectorAll('#tool-bar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t))),
      onEnv: (env) => {
        $('oxygen').value = env.oxygen; $('oxygen-val').textContent = `${env.oxygen}%`;
        $('temp').value = env.temp; $('temp-val').textContent = `${env.temp}°C`;
        $('s-planet').textContent = world ? world.PRESETS[env.preset].name : '지구';
        document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === env.preset)));
      },
    });
  } catch (e) {
    $('error').hidden = false;
    $('error-msg').textContent = e.message;
    console.error(e);
    return;
  }
  window.world = world;
  const { engine } = world;

  // 도구 바
  const bar = $('tool-bar');
  for (const [id, label] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = id;
    if (id === 'meteor' || id === 'war') b.classList.add('danger');
    b.setAttribute('aria-pressed', String(id === 'look'));
    b.innerHTML = `${icon(ICONS[id])}<span>${label}</span>`;
    b.addEventListener('click', () => world.setTool(id));
    bar.appendChild(b);
  }
  addEventListener('keydown', (e) => {
    const i = Number(e.key);
    if (i >= 1 && i <= TOOLS.length) world.setTool(TOOLS[i - 1][0]);
  });

  // 속도
  const speedBtns = document.querySelectorAll('[data-speed]');
  speedBtns.forEach((b) => b.addEventListener('click', () => {
    world.setSpeed(Number(b.dataset.speed));
    speedBtns.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }));

  // 확대
  $('zoom-in').addEventListener('click', () => world.zoomBy(0.18));
  $('zoom-out').addEventListener('click', () => world.zoomBy(-0.18));
  $('system').addEventListener('click', () => world.toggleSystem());

  // 행성 패널
  const panel = $('panel'), gear = $('gear');
  const openPanel = (v) => { panel.hidden = !v; gear.setAttribute('aria-expanded', String(v)); };
  gear.addEventListener('click', () => openPanel(panel.hidden));
  $('panel-close').addEventListener('click', () => openPanel(false));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => world.setPreset(b.dataset.preset)));
  $('oxygen').addEventListener('input', (e) => { const v = Number(e.target.value); $('oxygen-val').textContent = `${v}%`; world.setEnv({ oxygen: v }); });
  $('temp').addEventListener('input', (e) => { const v = Number(e.target.value); $('temp-val').textContent = `${v}°C`; world.setEnv({ temp: v }); });
  $('all-war').addEventListener('click', () => world.allWar());
  $('peace').addEventListener('click', () => world.peace());
  $('new-planet').addEventListener('click', () => world.newPlanet());

  // 도트 크기: 화면 왼쪽 위 칩 + 키보드 [ ]
  const showDots = () => { $('dot-val').textContent = `×${engine.pixelScale}`; $('dot-range').value = engine.pixelScale; };
  const setDots = (v) => { engine.pixelScale = Math.max(1, Math.min(12, v)); showDots(); };
  $('dot-minus').addEventListener('click', () => setDots(engine.pixelScale - 1));
  $('dot-plus').addEventListener('click', () => setDots(engine.pixelScale + 1));
  $('dot-range').addEventListener('input', (e) => setDots(Number(e.target.value)));
  addEventListener('keydown', (e) => { if (e.key === '[') setDots(engine.pixelScale - 1); if (e.key === ']') setDots(engine.pixelScale + 1); });
  showDots();
  $('inspect-close').addEventListener('click', () => { world.life.select(null); $('inspect').hidden = true; document.body.classList.remove('inspecting'); });

  engine.start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
