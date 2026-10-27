// 아이콘: (1) 엔진으로 부품을 오프스크린 렌더한 3D 픽셀 썸네일, (2) 캔버스에 찍는 도트 아이콘
//
//  thumbs.get(key, () => node) → dataURL. 메인 캔버스 왼쪽 아래 구석에 작게 렌더한 뒤 즉시 2D 캔버스로 복사한다
//  (같은 프레임 안에서 메인 화면이 다시 그려지므로 보이지 않음).

import { Scene, PixelCamera } from '../engine/index.js';

export class Thumbs {
  constructor(engine) {
    this.engine = engine;
    this.cache = new Map();
    this.scene = new Scene();
    const s = this.scene;
    s.sun.direction = [0.4, 0.8, 0.6]; s.sun.intensity = 1.0; s.sun.color = [1, 0.96, 0.9];
    s.ambientSky = [0.5, 0.52, 0.66]; s.ambientGround = [0.3, 0.27, 0.3];
    s.fog = { color: [0.13, 0.12, 0.18], near: 500, far: 600 };
    this.cam = new PixelCamera({ yaw: Math.PI / 4 + 0.5, pitch: 0.42, distance: 30 });
  }

  // size: CSS 픽셀 크기, dots: 저해상도 도트 개수(세로)
  get(key, build, { size = 64, dots = 34, yaw = null } = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    const url = this.render(build(), size, dots, yaw);
    this.cache.set(key, url);
    return url;
  }

  render(node, size, dots, yaw) {
    const { engine } = this, r = engine.renderer, st = r.settings, gl = engine.gl;
    const dpr = Math.min(2, engine.dpr);
    const px = Math.round(size * dpr), scale = Math.max(1, Math.round(px / dots));
    const W = Math.min(px, engine.canvas.width), H = Math.min(px, engine.canvas.height);
    // 노드 경계 상자로 화면 맞추기
    node.updateWorld();
    // 화면에 보이는 모양 기준으로 꽉 차게 맞춘다 (길쭉한 총도 작게 남지 않게)
    const cam = this.cam;
    cam.yaw = yaw ?? Math.PI / 4 + 0.5;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fwd = [-Math.sin(cam.yaw) * cp, -sp, -Math.cos(cam.yaw) * cp];
    const rl = Math.hypot(fwd[2], fwd[0]) || 1, right = [-fwd[2] / rl, 0, fwd[0] / rl];
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], r0 = 1e9, r1 = -1e9, u0 = 1e9, u1 = -1e9;
    node.traverse((n) => {
      if (!n.geometry || !n.visible) return n.visible === false ? false : undefined;
      const p = n.geometry.pos, m = n.world;
      for (let i = 0; i < p.length; i += 3) {
        const x = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12], y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13], z = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
        lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)];
        const pr = x * right[0] + y * right[1] + z * right[2], pu = x * up[0] + y * up[1] + z * up[2];
        r0 = Math.min(r0, pr); r1 = Math.max(r1, pr); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu);
      }
    });
    if (lo[0] > hi[0]) { lo = [-0.5, 0, -0.5]; hi = [0.5, 1, 0.5]; r0 = u0 = -0.5; r1 = u1 = 0.5; }
    const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const c3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const dr = (r0 + r1) / 2 - (c3[0] * right[0] + c3[1] * right[1] + c3[2] * right[2]), du = (u0 + u1) / 2 - (c3[0] * up[0] + c3[1] * up[1] + c3[2] * up[2]);
    cam.target = [c3[0] + right[0] * dr + up[0] * du, c3[1] + right[1] * dr + up[1] * du, c3[2] + right[2] * dr + up[2] * du];
    cam.viewHeight = Math.max(r1 - r0, u1 - u0) * 1.12 + 0.05;
    cam.snap = false;
    this.scene.children = [];
    this.scene.add(node);
    const saved = { vignette: st.vignette, history: st.history, shadowSize: st.shadowSize };
    Object.assign(st, { vignette: 0, history: 0, shadowSize: Math.max(2, ext * 1.5) });
    r.render(this.scene, cam, W, H, scale, 0);
    Object.assign(st, saved);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(engine.canvas, 0, engine.canvas.height - H, W, H, 0, 0, W, H);
    this.scene.remove(node);
    void gl;
    return c.toDataURL();
  }
}

// ---- 도트 아이콘 (10x10). 문자 → 색 ----
const PAL = { '#': '#f3ead8', y: '#ffcf4a', c: '#6fe3ff', r: '#ff5d5d', g: '#6dff8f', p: '#ff6fc4', o: '#ff9a3c', d: '#3a3550', b: '#5a8dff', w: '#a9a2b8' };
export const PIX = {
  power:   ['....yy....', '...yy.....', '..yy......', '.yyyyyy...', '....yy....', '...yy.....', '..yy......', '.yy.......', '..........', '..........'],
  cooling: ['....c.....', '.c..c..c..', '..c.c.c...', '...ccc....', 'ccccccccc.', '...ccc....', '..c.c.c...', '.c..c..c..', '....c.....', '..........'],
  servo:   ['...ww.....', '.w.ww.w...', '..wwwww...', 'www..www..', 'ww....ww..', 'www..www..', '..wwwww...', '.w.ww.w...', '...ww.....', '..........'],
  frame:   ['.#######..', '.#bbbbb#..', '.#bbbbb#..', '.#bb#bb#..', '.#b###b#..', '..#b#b#...', '..#bbb#...', '...#b#....', '....#.....', '..........'],
  focus:   ['....r.....', '..rrrrr...', '.r..r..r..', '.r.....r..', 'rrr.r.rrr.', '.r.....r..', '.r..r..r..', '..rrrrr...', '....r.....', '..........'],
  field:   ['..pppp....', '.p....p...', 'p..pp..p..', 'p.p..p.p..', 'p.p..p.p..', 'p..pp..p..', '.p....p...', '..pppp....', '..........', '..........'],
  repair:  ['.....##...', '....#..#..', '.....#.#..', '....###...', '...###....', '..###.....', '.###......', '.##.......', '..........', '..........'],
  part:    ['...yy.....', '.y.yy.y...', '..yyyyy...', 'yyy..yyy..', 'yy....yy..', 'yyy..yyy..', '..yyyyy...', '.y.yy.y...', '...yy.....', '..........'],
  supply:  ['.oooooooo.', '.o#oooo#o.', '.oo#oo#oo.', '.ooo##ooo.', '.ooo##ooo.', '.oo#oo#oo.', '.o#oooo#o.', '.oooooooo.', '..........', '..........'],
  workshop:['..cccccc..', '..c....c..', '..c.cc.c..', '..c....c..', '..cccccc..', '....cc....', '..cccccc..', '.cccccccc.', '..........', '..........'],
  system:  ['.gggggggg.', '.g......g.', '.g.g.gg.g.', '.g......g.', '.g.gg.g.g.', '.g......g.', '.gggggggg.', '...gggg...', '..........', '..........'],
  elite:   ['..rrrrr...', '.rrrrrrr..', '.r..r..r..', '.r..r..r..', '.rrrrrrr..', '..rr.rr...', '..r.r.r...', '..........', '..........', '..........'],
  boss:    ['p.p.p.p.p.', 'ppppppppp.', 'p#ppppp#p.', 'ppppppppp.', '.ppp.ppp..', '.p.p.p.p..', '..........', '..........', '..........', '..........'],
  cargo:   ['..........', '.y.yyyy.y.', 'yyyyyyyyyy', '.y.yyyy.y.', '..oooooo..', '..o#oo#o..', '..oooooo..', '...o..o...', '..........', '..........'],
  magnet:  ['..........', '.rr...rr..', '.rr...rr..', '.rr...rr..', '.rr...rr..', '.rrr.rrr..', '..rrrrr...', '...rrr....', '.##...##..', '..........'],
  heal:    ['....gg....', '....gg....', '..gggggg..', '..gggggg..', '....gg....', '....gg....', '..........', '..........', '..........', '..........'],
  xp:      ['....g.....', '...ggg....', '..ggggg...', '.ggg#ggg..', '..ggggg...', '...ggg....', '....g.....', '..........', '..........', '..........'],
  heart:   ['.rr...rr..', 'r#rr.rrrr.', 'r#rrrrrrr.', 'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....', '..........', '..........'],
};
const pixCache = new Map();
export function pixIcon(name, u = 4) {
  const k = name + u;
  if (pixCache.has(k)) return pixCache.get(k);
  const rows = PIX[name] || PIX.part;
  const c = document.createElement('canvas');
  c.width = c.height = 10 * u;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) { ctx.fillStyle = PAL[ch]; ctx.fillRect(x * u, y * u, u, u); } }));
  pixCache.set(k, c);
  return c;
}
export const pixURL = (name, u = 4) => pixIcon(name, u).toDataURL();
