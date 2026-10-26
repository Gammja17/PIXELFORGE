// UI 스킨: 강철 판을 도트로 직접 그려서 CSS 변수(9-slice border-image)로 넣는다.
//  한 도트 = 2px. 판 가장자리 6도트(= --sl 12px), 오목 화면 가장자리 2도트(= --isl 4px).

const D = 2;
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// 도트 격자(n×n)를 그려서 dataURL 로
function grid(n, draw) {
  const c = document.createElement('canvas'); c.width = c.height = n * D;
  const ctx = c.getContext('2d');
  draw((x, y, col) => { ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; ctx.fillRect(x * D, y * D, D, D); });
  return `url(${c.toDataURL()})`;
}

const OUT = [6, 6, 9];

/**
 * 철판 (16×16 도트, 가장자리 6도트)
 *  metal: 테두리 금속, fill: 안쪽, groove: 안쪽 테두리 선, pressed: 베벨 반전, rivets, hazard(노랑/검정 줄무늬 띠)
 */
function plate({ metal = '#4b4d5a', fill = '#181a21', groove = '#0a0b0f', pressed = false, rivets = false, hazard = false, seed = 1 } = {}) {
  const M = hex(metal), F = hex(fill), G = hex(groove), N = 16;
  return grid(N, (put) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = x, t = y, r = N - 1 - x, b = N - 1 - y, d = Math.min(l, t, r, b);
      const cx = Math.min(l, r), cy = Math.min(t, b);
      if (cx + cy < 1) continue; // 모서리 한 도트 깎기
      if (d === 0 || cx + cy === 1) { put(x, y, OUT); continue; }
      const topLeft = (t <= l && t <= r && t <= b) || (l <= t && l <= r && l <= b);
      const n = hash(x, y, seed);
      if (d === 1) { put(x, y, shade(M, topLeft !== pressed ? 1.6 : 0.55)); continue; }
      if (d <= 3) {
        let col = shade(M, 0.9 + n * 0.14 + (d === 2 && topLeft !== pressed ? 0.12 : 0));
        if (hazard) col = (((x + y) >> 1) & 1) ? [26, 22, 14] : hex('#f2bd2c');
        if (rivets && cx === 2 && cy === 2) col = shade(M, 1.75);
        else if (rivets && ((cx === 3 && cy === 2) || (cx === 2 && cy === 3))) col = shade(M, 1.2);
        else if (rivets && cx === 3 && cy === 3) col = shade(M, 0.45);
        put(x, y, col); continue;
      }
      if (d === 4) { put(x, y, G); continue; }
      if (d === 5) { put(x, y, topLeft !== pressed ? shade(F, 0.6) : shade(F, 1.35)); continue; } // 오목한 안쪽 그림자
      put(x, y, F);
    }
  });
}

// 오목한 화면 (6×6 도트, 가장자리 2도트): 게이지 홈, 선택 칸
function inset({ fill = '#0b0c10', lit = null } = {}) {
  const F = hex(fill), N = 6;
  return grid(N, (put) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const l = x, t = y, r = N - 1 - x, b = N - 1 - y, d = Math.min(l, t, r, b);
      const topLeft = (t <= l && t <= r && t <= b) || (l <= t && l <= r && l <= b);
      if (d === 0) put(x, y, lit ? hex(lit) : topLeft ? [4, 4, 6] : [92, 95, 108]);
      else if (d === 1) put(x, y, topLeft ? shade(F, 0.5) : shade(F, 1.6));
      else put(x, y, F);
    }
  });
}

// 둥근 버튼 (금속 링 + 색 캡)
function round(color, pressed = false, n = 40) {
  const C = hex(color), M = hex('#4b4d5a'), c = (n - 1) / 2, R = n / 2;
  return grid(n, (put) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > R - 0.3) continue;
      const lit = -(dx + dy) / (d * 1.414 || 1);
      if (d > R - 1.5) put(x, y, OUT);
      else if (d > R - 4.5) put(x, y, shade(M, 1 + lit * 0.45 + hash(x, y, 5) * 0.12));
      else if (d > R - 5.5) put(x, y, OUT);
      else {
        let col = shade(C, pressed ? 0.7 - lit * 0.12 : 0.88 + lit * 0.22);
        if (!pressed && Math.hypot(dx + R * 0.3, dy + R * 0.3) < R * 0.16) col = mix(col, [255, 255, 255], 0.5);
        if (!pressed && d > R - 7 && lit < -0.3) col = shade(C, 0.6);
        put(x, y, col);
      }
    }
  });
}

export function applySkin() {
  const st = document.documentElement.style, set = (k, v) => st.setProperty(k, v);
  set('--plate-flat', plate({ seed: 1 }));
  set('--plate', plate({ rivets: true, seed: 2 }));
  set('--plate-dark', plate({ metal: '#363844', fill: '#101116', rivets: true, seed: 3 }));
  set('--plate-press', plate({ fill: '#22242d', groove: '#ffc93d', pressed: true, seed: 4 }));
  set('--plate-gold', plate({ metal: '#565865', fill: '#f2bd2c', groove: '#6b4a08', hazard: true, seed: 5 }));
  set('--inset', inset({}));
  set('--inset-lit', inset({ fill: '#1d1a10', lit: '#ffc93d' }));
  set('--btn-atk', round('#ffc93d')); set('--btn-atk-on', round('#ffc93d', true));
  set('--btn-sp', round('#ff6bc8')); set('--btn-sp-on', round('#ff6bc8', true));
  set('--btn-od', round('#ff8a2a')); set('--btn-od-on', round('#ff8a2a', true));
  set('--btn-mode', round('#6dff9a')); set('--btn-mode-on', round('#6dff9a', true));
  set('--btn-dash', round('#5fe0ff')); set('--btn-dash-on', round('#5fe0ff', true));
}
