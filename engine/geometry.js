// PixelForge — 로우폴리 지오메트리 빌더
// 모든 도형은 "플랫 셰이딩"(면마다 법선 하나)으로 만든다. 픽셀화했을 때 면이 또렷한 색 덩어리로 보이게.

import { m4, v3, rng as makeRng } from './math.js';

export class Geometry {
  constructor() {
    this.pos = []; this.nrm = []; this.col = []; this.uv = [];
    this._gpu = null;
  }
  get vertexCount() { return this.pos.length / 3; }

  // 삼각형 하나 추가 (반시계 방향이 앞면). 법선은 면 법선으로 자동 계산
  tri(a, b, c, color = [1, 1, 1], uvs = null, normal = null) {
    const n = normal || v3.norm(v3.cross(v3.sub(b, a), v3.sub(c, a)));
    for (const p of [a, b, c]) { this.pos.push(...p); this.nrm.push(...n); this.col.push(...color); }
    if (uvs) this.uv.push(...uvs[0], ...uvs[1], ...uvs[2]); else this.uv.push(0, 0, 0, 0, 0, 0);
    return this;
  }
  quad(a, b, c, d, color, uvs = null, normal = null) {
    this.tri(a, b, c, color, uvs && [uvs[0], uvs[1], uvs[2]], normal);
    this.tri(a, c, d, color, uvs && [uvs[0], uvs[2], uvs[3]], normal);
    return this;
  }

  // 정점 색을 함수로 다시 칠하기: fn(위치, 법선, 면인덱스) → [r,g,b]
  paint(fn) {
    for (let i = 0; i < this.vertexCount; i += 3) {
      const face = i / 3;
      const cx = (this.pos[i * 3] + this.pos[i * 3 + 3] + this.pos[i * 3 + 6]) / 3;
      const cy = (this.pos[i * 3 + 1] + this.pos[i * 3 + 4] + this.pos[i * 3 + 7]) / 3;
      const cz = (this.pos[i * 3 + 2] + this.pos[i * 3 + 5] + this.pos[i * 3 + 8]) / 3;
      const n = [this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]];
      const c = fn([cx, cy, cz], n, face);
      for (let k = 0; k < 3; k++) { const o = (i + k) * 3; this.col[o] = c[0]; this.col[o + 1] = c[1]; this.col[o + 2] = c[2]; }
    }
    return this;
  }

  // 다른 지오메트리를 변환해서 합치기 (드로우콜 줄이기)
  merge(other, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], color = null } = {}) {
    const m = m4.fromTRS(position, rotation, typeof scale === 'number' ? [scale, scale, scale] : scale);
    const nm = m4.normalMatrix(m);
    for (let i = 0; i < other.vertexCount; i++) {
      const p = m4.transformPoint(m, [other.pos[i * 3], other.pos[i * 3 + 1], other.pos[i * 3 + 2]]);
      const n = other.nrm.slice(i * 3, i * 3 + 3);
      const nn = v3.norm([nm[0] * n[0] + nm[3] * n[1] + nm[6] * n[2], nm[1] * n[0] + nm[4] * n[1] + nm[7] * n[2], nm[2] * n[0] + nm[5] * n[1] + nm[8] * n[2]]);
      this.pos.push(...p); this.nrm.push(...nn);
      this.col.push(...(color || other.col.slice(i * 3, i * 3 + 3)));
      this.uv.push(other.uv[i * 2], other.uv[i * 2 + 1]);
    }
    return this;
  }

  upload(gl) {
    if (this._gpu) return this._gpu;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const attrib = (loc, data, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const buffers = [attrib(0, this.pos, 3), attrib(1, this.nrm, 3), attrib(2, this.col, 3), attrib(3, this.uv, 2)];
    gl.bindVertexArray(null);
    this._gpu = { vao, count: this.vertexCount, buffers };
    return this._gpu;
  }
  dispose(gl) {
    if (!this._gpu) return;
    gl.deleteVertexArray(this._gpu.vao);
    this._gpu.buffers.forEach((b) => gl.deleteBuffer(b));
    this._gpu = null;
  }

  // ---------- 기본 도형 ----------

  // 바닥 중앙이 원점인 상자
  static box(w = 1, h = 1, d = 1, color = [1, 1, 1]) {
    const g = new Geometry(), x = w / 2, z = d / 2;
    const P = (a, b, c) => [a, b, c];
    g.quad(P(-x, 0, z), P(x, 0, z), P(x, h, z), P(-x, h, z), color);     // 앞
    g.quad(P(x, 0, -z), P(-x, 0, -z), P(-x, h, -z), P(x, h, -z), color); // 뒤
    g.quad(P(x, 0, z), P(x, 0, -z), P(x, h, -z), P(x, h, z), color);     // 오른쪽
    g.quad(P(-x, 0, -z), P(-x, 0, z), P(-x, h, z), P(-x, h, -z), color); // 왼쪽
    g.quad(P(-x, h, z), P(x, h, z), P(x, h, -z), P(-x, h, -z), color);   // 위
    g.quad(P(-x, 0, -z), P(x, 0, -z), P(x, 0, z), P(-x, 0, z), color);   // 아래
    return g;
  }

  // y=0 ~ h 원기둥 (rTop=0이면 원뿔)
  static cylinder(rTop = 0.5, rBottom = 0.5, h = 1, seg = 6, color = [1, 1, 1], { caps = true } = {}) {
    const g = new Geometry();
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const b0 = [Math.cos(a0) * rBottom, 0, Math.sin(a0) * rBottom], b1 = [Math.cos(a1) * rBottom, 0, Math.sin(a1) * rBottom];
      const t0 = [Math.cos(a0) * rTop, h, Math.sin(a0) * rTop], t1 = [Math.cos(a1) * rTop, h, Math.sin(a1) * rTop];
      if (rTop > 0) g.quad(b1, b0, t0, t1, color); else g.tri(b1, b0, [0, h, 0], color);
      if (caps) {
        g.tri([0, 0, 0], b0, b1, color);
        if (rTop > 0) g.tri([0, h, 0], t1, t0, color);
      }
    }
    return g;
  }
  static cone(r = 0.5, h = 1, seg = 6, color) { return Geometry.cylinder(0, r, h, seg, color); }

  // 울퉁불퉁한 로우폴리 구 (jitter로 바위/나뭇잎 덩어리)
  static icosphere(r = 0.5, subdiv = 1, color = [1, 1, 1], { jitter = 0, seed = 1, squashY = 1 } = {}) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v3.norm);
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < subdiv; s++) {
      const cache = new Map(), nf = [];
      const mid = (a, b) => {
        const k = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!cache.has(k)) { verts.push(v3.norm(v3.scale(v3.add(verts[a], verts[b]), 0.5))); cache.set(k, verts.length - 1); }
        return cache.get(k);
      };
      for (const [a, b, c] of faces) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = nf;
    }
    const R = makeRng(seed);
    verts = verts.map((v) => { const k = r * (1 + (R() - 0.5) * 2 * jitter); return [v[0] * k, v[1] * k * squashY, v[2] * k]; });
    const g = new Geometry();
    for (const [a, b, c] of faces) g.tri(verts[a], verts[b], verts[c], color);
    return g;
  }

  // 격자 평면 (지형/물). heightFn(x,z) → y, colorFn(중심, 법선) → 색
  static grid(w, d, nx, nz, heightFn = () => 0, colorFn = null, { y0 = 0 } = {}) {
    const g = new Geometry();
    const P = (i, j) => { const x = (i / nx - 0.5) * w, z = (j / nz - 0.5) * d; return [x, y0 + heightFn(x, z), z]; };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = P(i, j + 1), b = P(i + 1, j + 1), c = P(i + 1, j), e = P(i, j);
        // 대각선 방향을 번갈아 바꿔서 줄무늬 없이 자연스럽게
        if ((i + j) % 2) { g.tri(a, b, c); g.tri(a, c, e); } else { g.tri(a, b, e); g.tri(b, c, e); }
      }
    }
    if (colorFn) g.paint(colorFn);
    return g;
  }

  // 스프라이트용 사각형: 바닥 중앙 기준, +Z를 바라봄
  static spriteQuad(w = 1, h = 1) {
    const g = new Geometry(), x = w / 2;
    g.quad([-x, 0, 0], [x, 0, 0], [x, h, 0], [-x, h, 0], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return g;
  }

  // 삼각 지붕 (집 만들 때)
  static prism(w = 1, h = 0.6, d = 1, color = [1, 1, 1]) {
    const g = new Geometry(), x = w / 2, z = d / 2;
    g.tri([-x, 0, z], [x, 0, z], [0, h, z], color);
    g.tri([x, 0, -z], [-x, 0, -z], [0, h, -z], color);
    g.quad([x, 0, z], [x, 0, -z], [0, h, -z], [0, h, z], color);
    g.quad([-x, 0, -z], [-x, 0, z], [0, h, z], [0, h, -z], color);
    g.quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], color);
    return g;
  }
}
