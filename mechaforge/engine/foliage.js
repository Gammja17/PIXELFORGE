// PixelForge — 잔디(인스턴싱) & 물

import { rng as makeRng, hexColor } from './math.js';
import { Geometry } from './geometry.js';

const toColor = (c) => (typeof c === 'string' ? hexColor(c) : c);

/**
 * 수천 개의 잔디 잎을 GPU 인스턴싱으로 한 번에 그린다.
 * 잎은 항상 카메라를 향하고, 바람에 흔들리며, 플레이어 근처에서 옆으로 눕는다.
 *
 * place(x, z) → null(심지 않음) 또는 { y, color:[r,g,b] }
 */
export class GrassField {
  constructor({ count = 8000, bounds = [-20, 20, -20, 20], place, height = [0.25, 0.5], width = 0.14, seed = 7 } = {}) {
    const R = makeRng(seed);
    const inst = [];
    let tries = 0;
    while (inst.length / 8 < count && tries < count * 6) {
      tries++;
      const x = R.range(bounds[0], bounds[1]), z = R.range(bounds[2], bounds[3]);
      const p = place(x, z, R);
      if (!p) continue;
      const c = p.color, v = R.range(0.88, 1.12);
      inst.push(x, p.y, z, c[0] * v, c[1] * v, c[2] * v, R.range(height[0], height[1]) * (p.scale ?? 1), R() * 6.28);
    }
    this.instances = new Float32Array(inst);
    this.count = inst.length / 8;
    this.width = width;
    this.interactors = []; // 잔디를 눕힐 위치들 [[x,y,z], ...] (최대 4개)
    this._gpu = null;
  }
  upload(gl) {
    if (this._gpu) return this._gpu;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const blade = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, blade);
    // 잎 하나 = 삼각형 (x: 좌우, y: 높이 비율)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, this.instances, gl.STATIC_DRAW);
    const B = 32;
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, B, 0); gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, B, 12); gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 2, gl.FLOAT, false, B, 24); gl.vertexAttribDivisor(6, 1);
    gl.bindVertexArray(null);
    this._gpu = { vao, buffers: [blade, ib] };
    return this._gpu;
  }
}

/**
 * 툰 스타일 물. 장면의 깊이를 읽어서
 *  - 얕은 곳은 밝은 청록, 깊은 곳은 짙은 파랑
 *  - 물가에는 흰 거품 선
 *  - 물속 지형이 일렁이며 비쳐 보임
 */
export class Water {
  constructor({ size = 120, segments = 90, level = 0, shallow = '#5fd3c8', deep = '#1f4f8a', foam = '#eefcff', waveHeight = 0.06, geometry = null, radial = false, emissive = 0 } = {}) {
    this.level = level;
    this.radial = radial;     // 구형 바다 (geometry를 구로 넘겼을 때)
    this.emissive = emissive; // 용암처럼 스스로 빛나는 액체
    this.node = null;         // 지정하면 이 노드의 월드 행렬을 따라 움직임
    this.shallow = toColor(shallow);
    this.deep = toColor(deep);
    this.foam = toColor(foam);
    this.waveHeight = waveHeight;
    this.depthRange = 2.5; // 이 깊이에서 완전히 deep 색
    this.geometry = geometry || Geometry.grid(size, size, segments, segments, () => 0, null, { y0: level });
  }
}
