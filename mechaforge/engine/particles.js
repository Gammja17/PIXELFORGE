// PixelForge — 픽셀 파티클 시스템
// 파티클 하나 = 저해상도 화면의 정사각형 점(GL_POINTS). 크기는 "저해상도 픽셀" 단위라 항상 또렷하다.
// 투명도는 반투명 블렌딩 대신 베이어 디더링(스크린도어)으로 표현 → 픽셀아트스러운 페이드

import { lerp } from './math.js';

const STRIDE = 9; // pos3, rgb3, emissive1, alpha1, size1

export class ParticleSystem {
  /**
   * node: 지정하면 파티클 좌표가 이 노드 기준 로컬 (행성 위 이펙트 등)
   * radialGravity: true면 중력이 원점(행성 중심) 방향
   */
  constructor({ max = 1000, gravity = [0, -4, 0], drag = 1.5, node = null, radialGravity = false } = {}) {
    this.max = max;
    this.node = node;
    this.radialGravity = radialGravity;
    this.gravity = gravity;
    this.drag = drag;
    this.list = [];
    this.data = new Float32Array(max * STRIDE);
    this._gpu = null;
  }

  /**
   * position, velocity: [x,y,z]
   * life: 초, size: 시작 크기(픽셀), sizeEnd: 끝 크기
   * color / colorEnd: [r,g,b], emissive: 0~1 (블룸)
   * fadeIn: 0~1 수명 비율만큼 서서히 나타남
   * ramp: [[r,g,b], ...] 수명에 따라 계단식으로 바뀌는 색 (도트 그림 같은 단계 색. color/colorEnd 대신)
   * hard: true 면 끝까지 또렷하다가 수명이 다하면 바로 사라짐 (디더 페이드 없음)
   * update(p, dt): 개별 움직임을 덮어쓰고 싶을 때
   */
  emit(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      p: [...o.position], v: [...(o.velocity || [0, 0, 0])],
      life: o.life ?? 1, age: 0,
      size: o.size ?? 2, sizeEnd: o.sizeEnd ?? o.size ?? 2,
      color: o.color || [1, 1, 1], colorEnd: o.colorEnd || o.color || [1, 1, 1],
      emissive: o.emissive ?? 0, fadeIn: o.fadeIn ?? 0, ramp: o.ramp || null, hard: !!o.hard,
      gravity: o.gravity ?? 1, update: o.update || null, seed: Math.random() * 100,
    });
  }

  update(dt) {
    const g = this.gravity, k = Math.exp(-this.drag * dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) { this.list.splice(i, 1); continue; }
      if (p.update) p.update(p, dt);
      let gx = g[0], gy = g[1], gz = g[2];
      if (this.radialGravity) {
        const l = Math.hypot(p.p[0], p.p[1], p.p[2]) || 1, gm = Math.hypot(g[0], g[1], g[2]);
        gx = (-p.p[0] / l) * gm; gy = (-p.p[1] / l) * gm; gz = (-p.p[2] / l) * gm;
      }
      p.v[0] = p.v[0] * k + gx * p.gravity * dt;
      p.v[1] = p.v[1] * k + gy * p.gravity * dt;
      p.v[2] = p.v[2] * k + gz * p.gravity * dt;
      p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] += p.v[2] * dt;
    }
  }

  // GPU 버퍼로 패킹, 그릴 개수 반환
  pack() {
    const d = this.data;
    let n = 0;
    for (const p of this.list) {
      const t = p.age / p.life, o = n * STRIDE;
      d[o] = p.p[0]; d[o + 1] = p.p[1]; d[o + 2] = p.p[2];
      if (p.ramp) { const c = p.ramp[Math.min(p.ramp.length - 1, (t * p.ramp.length) | 0)]; d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; }
      else {
        d[o + 3] = lerp(p.color[0], p.colorEnd[0], t);
        d[o + 4] = lerp(p.color[1], p.colorEnd[1], t);
        d[o + 5] = lerp(p.color[2], p.colorEnd[2], t);
      }
      d[o + 6] = p.emissive;
      const fadeOut = Math.min(1, (1 - t) * 3);
      const fadeIn = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) : 1;
      d[o + 7] = p.hard ? 1 : fadeOut * fadeIn;
      d[o + 8] = lerp(p.size, p.sizeEnd, t);
      n++;
    }
    return n;
  }

  upload(gl) {
    if (!this._gpu) {
      const vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      const B = STRIDE * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, B, 28);
      gl.bindVertexArray(null);
      this._gpu = { vao, buf };
    }
    const n = this.pack();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, n * STRIDE);
    return n;
  }
}
