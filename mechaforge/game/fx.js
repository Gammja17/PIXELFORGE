// 이펙트: 파티클, 점광원 폭발, 충격파 고리, 그을음, 파편, 데미지 숫자, 화면 흔들림

import { Geometry, Mesh, Material, InstancedMesh, ParticleSystem, m4 } from '../engine/index.js';

// 게임 시간 배율(히트스톱/슬로모션)을 따르는 파티클
class GameParticles extends ParticleSystem {
  constructor(fx, o) { super(o); this.fx = fx; }
  update(dt) { super.update(dt * this.fx.timeScale); }
}

const R = Math.random;
const rr = (a, b) => a + (b - a) * R();

// 도트 팔레트: 수명 따라 계단식으로 바뀌는 색 (흰 섬광 → 밝은색 → 본색 → 어두운색)
const FIRE = [[1, 1, 1], [1, 0.95, 0.55], [1, 0.72, 0.22], [1, 0.42, 0.12], [0.72, 0.18, 0.1], [0.32, 0.24, 0.24]];
const SMOKE = [[0.42, 0.38, 0.4], [0.3, 0.27, 0.3], [0.2, 0.18, 0.21]];
const rampOf = (c) => [[1, 1, 1], [(1 + c[0]) / 2, (1 + c[1]) / 2, (1 + c[2]) / 2], c, c.map((v) => v * 0.6), c.map((v) => v * 0.35)];
const isFire = (c) => c[0] > 0.8 && c[1] < 0.8 && c[2] < 0.45;

// 3x5 도트 숫자 (데미지 표시용, 폰트 로딩과 무관하게 또렷함)
const GLYPHS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  '+': '000010111010000', '!': '010010010000010',
};

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.timeScale = 1;
    this.sparks = new GameParticles(this, { max: 1600, gravity: [0, -9, 0], drag: 2.2 });
    this.smoke = new GameParticles(this, { max: 500, gravity: [0, 1.6, 0], drag: 2.6 });
    this.trail = new GameParticles(this, { max: 1400, gravity: [0, 0.4, 0], drag: 3 });
    // 도트 이펙트: px = 흩뿌려지는 점 (중력, 공기 저항), pxr = 일정한 속도로 퍼지는 점 (고리, 섬광 갈래, 번개)
    this.px = new GameParticles(this, { max: 3200, gravity: [0, -16, 0], drag: 2.6 });
    this.pxr = new GameParticles(this, { max: 2400, gravity: [0, 0, 0], drag: 0 });
    scene.particles.push(this.trail, this.smoke, this.sparks, this.px, this.pxr);

    this.lights = [];
    this.trauma = 0;
    this.numbers = [];

    // 그을음 자국 (바닥 원판, 오래된 것부터 덮어씀)
    this.scorch = scene.add(new InstancedMesh(Geometry.cylinder(0.5, 0.5, 0.02, 7, [1, 1, 1]), new Material({ outline: false, castShadow: false }), 48));
    this.scorchN = 0;
    // 파편 (튀는 작은 상자)
    this.debrisMesh = scene.add(new InstancedMesh(Geometry.box(0.2, 0.2, 0.2), new Material({ castShadow: true }), 160));
    this.debris = [];
  }

  // 화면 흔들림: 설정 배율(shakeScale) 적용 + 이미 흔들리는 중이면 덜 쌓이게 (물량전에서 계속 흔들리지 않도록)
  addTrauma(v) { this.trauma = Math.min(0.7, this.trauma + v * (this.shakeScale ?? 0.45) * (1 - this.trauma)); }

  light(position, color, radius, intensity, life) {
    // 가까운 곳에 이미 빛이 있으면 합치기 (겹쳐서 하얗게 타는 것 방지)
    for (const l of this.lights) {
      const dx = l.position[0] - position[0], dz = l.position[2] - position[2];
      if (dx * dx + dz * dz < 2.5) {
        // 더 센 빛이 오면 교체, 약한 빛은 무시 (약한 머즐 플래시가 큰 빛을 연장하지 않게)
        if (intensity >= l.intensity) Object.assign(l, { position: [...position], color, radius, intensity, base: intensity, age: 0, life });
        return;
      }
    }
    if (this.lights.length > 20) this.lights.shift();
    this.lights.push({ position: [...position], color, radius, intensity, base: intensity, age: 0, life });
  }

  // 충격파 고리: 점들이 원으로 퍼져 나간다 (바닥 평면)
  ring(x, y, z, radius, color, life = 0.35) {
    life = Math.max(0.16, life);
    const n = Math.max(12, Math.min(80, Math.round(radius * 11))), ramp = rampOf(color).slice(1), a0 = R() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), r0 = radius * 0.12, sp = (radius - r0) / life * rr(0.92, 1.04);
      this.pxr.emit({ position: [x + c * r0, y + 0.05, z + s * r0], velocity: [c * sp, 0, s * sp], life, size: i % 3 ? 2 : 3, sizeEnd: 1, ramp, emissive: 0.45, hard: true });
    }
  }

  scorchMark(x, z, size) {
    const i = this.scorchN++ % this.scorch.capacity;
    const s = size * rr(0.9, 1.2);
    const c = rr(0.2, 0.26);
    this.scorch.setAt(i, m4.fromTRS([x, 0.015 + (i % 7) * 0.002, z], [0, R() * 6, 0], [s, 1, s]), [c, c * 0.82, c * 0.85], 0);
    this.scorch.count = Math.min(this.scorchN, this.scorch.capacity);
  }

  chunk(x, y, z, color, power = 6) {
    if (this.debris.length >= this.debrisMesh.capacity) this.debris.shift();
    const a = R() * Math.PI * 2, sp = rr(0.4, 1) * power;
    this.debris.push({ p: [x, y, z], v: [Math.cos(a) * sp * 0.6, rr(4, 8), Math.sin(a) * sp * 0.6], r: [R() * 6, R() * 6, 0], w: [rr(-12, 12), rr(-12, 12)], s: rr(0.6, 1.3), life: rr(1.2, 2.2), age: 0, color });
  }

  // ---- 도트 이펙트 기본 재료 ----
  // 파편 점: 사방(또는 dir 부채꼴)으로 튀고 중력에 떨어진다
  shrapnel(p, n, ramp, { speed = [4, 10], size = [1, 2], life = [0.18, 0.4], dir = null, spread = 6.28, up = [0.5, 4], gravity = 1, em = 0.6 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = dir ? Math.atan2(dir[0], dir[1]) + rr(-spread, spread) / 2 : R() * 6.28, sp = rr(speed[0], speed[1]);
      this.px.emit({ position: [p[0], p[1], p[2]], velocity: [Math.sin(a) * sp, rr(up[0], up[1]), Math.cos(a) * sp], life: rr(life[0], life[1]), size: Math.round(rr(size[0], size[1])), sizeEnd: 1, ramp, emissive: em, gravity, hard: true });
    }
  }
  // 불덩이: 큰 점들이 뭉쳐서 부풀었다가 색이 바뀌며 사라진다
  fireball(p, size, ramp = FIRE) {
    const n = Math.round(8 + size * 18), big = Math.min(1.8, 0.7 + size * 0.45);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, e = rr(-0.3, 1.2), r = Math.sqrt(R()) * 0.5 * size, ox = Math.cos(a) * Math.cos(e), oz = Math.sin(a) * Math.cos(e), oy = Math.sin(e);
      const sp = rr(1, 3.2) * Math.sqrt(size);
      this.px.emit({ position: [p[0] + ox * r, p[1] + oy * r * 0.7, p[2] + oz * r], velocity: [ox * sp, oy * sp + 1.2, oz * sp], life: rr(0.22, 0.5) * (0.8 + size * 0.15), size: Math.round(rr(4, 7) * big), sizeEnd: 2, ramp, emissive: 0.7, gravity: -0.12, hard: true });
    }
  }
  // 화면을 향한 갈래 섬광: 점들이 arms 갈래 직선으로 뻗어 나간다
  starPx(p, arms, color, size = 1, life = 0.16, rot = 0) {
    const cam = this.camera; if (!cam?.right) return;
    const r = cam.right, u = cam.up, k = Math.max(2, Math.round(2 + size * 2)), ramp = [[1, 1, 1], ...rampOf(color).slice(1, 4)];
    for (let i = 0; i < arms; i++) {
      const a = rot + (i / arms) * Math.PI * 2, long = arms === 8 && i % 2 ? 0.6 : 1, c = Math.cos(a), s = Math.sin(a);
      const d = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      for (let j = 1; j <= k; j++) {
        const sp = (size * long * 2.2 * j) / k / life;
        this.pxr.emit({ position: [...p], velocity: [d[0] * sp, d[1] * sp, d[2] * sp], life: life * (1 - j / (k + 2)), size: j < k / 2 ? 2 : 1, sizeEnd: 1, ramp, emissive: 0.6, hard: true });
      }
    }
    this.pxr.emit({ position: [...p], velocity: [0, 0, 0], life: life * 0.5, size: Math.round(2 + size), sizeEnd: 1, ramp, emissive: 0.9, hard: true });
  }

  // 폭발: size 0.5(작은 드론) ~ 3(보스). 흰 핵 → 불덩이 점 뭉치 → 파편 점 → 바닥 고리 → 연기 점
  explosion(x, y, z, size = 1, { color = [1, 0.6, 0.2], debris = [0.3, 0.3, 0.34], ring = true, scorch = true } = {}) {
    const P = [x, y + 0.2, z], ramp = isFire(color) ? FIRE : [...rampOf(color), [0.3, 0.24, 0.3]];
    this.pxr.emit({ position: P, velocity: [0, 0, 0], life: 0.05, size: Math.round(4 + size * 2), sizeEnd: 3, ramp: [[1, 1, 0.85]], emissive: 0.4, hard: true });
    this.fireball(P, size, ramp);
    this.shrapnel(P, Math.round(6 + size * 10), [[1, 1, 0.8], ramp[1], ramp[2], ramp[3]], { speed: [5, 11 + size * 4], size: [1, 2.4], life: [0.25, 0.55], up: [2, 7], gravity: 1 });
    for (let i = 0; i < Math.round(2 + size * 3); i++) {
      this.px.emit({ position: [x + rr(-0.4, 0.4) * size, y + 0.3 + rr(0, 0.4) * size, z + rr(-0.4, 0.4) * size], velocity: [rr(-1, 1), rr(1, 2.5), rr(-1, 1)], life: rr(0.6, 1.1), size: Math.round(rr(3, 5) * Math.min(1.6, 0.6 + size * 0.4)), sizeEnd: 1, ramp: SMOKE, emissive: 0, gravity: -0.12, hard: true });
    }
    for (let i = 0; i < Math.round(size * 3); i++) this.chunk(x, y, z, debris, 5 + size * 2);
    this.light([x, y + 1, z], color, 3 + size * 2.2, 1.1 + size * 0.25, 0.22 + size * 0.1);
    if (ring) this.ring(x, 0.12, z, 1.4 + size * 1.6, isFire(color) ? [1, 0.7, 0.3] : color, 0.24 + size * 0.06);
    if (scorch && size >= 0.8) this.scorchMark(x, z, 1 + size * 0.7);
    if (size >= 1) this.addTrauma((size - 0.7) * 0.12);
  }

  // 작은 펑 (떼거리 적 처치용): 작은 불덩이 + 파편 몇 점
  pop(x, y, z, color = [1, 0.6, 0.25]) {
    const P = [x, y + 0.1, z];
    this.fireball(P, 0.3, isFire(color) ? FIRE : [...rampOf(color), [0.3, 0.24, 0.3]]);
    this.shrapnel(P, 4, [[1, 1, 0.8], ...rampOf(color).slice(2)], { speed: [3, 7], life: [0.15, 0.35], up: [2, 5] });
    if (R() < 0.3) this.chunk(x, y, z, [0.35, 0.25, 0.2], 4);
  }

  muzzle(p, dir, color = [1, 0.85, 0.4], power = 1) {
    this.light(p, color, 2 + power, 0.6 + 0.25 * power, 0.07);
    // 총구: 흰 점 하나 번쩍 + 쏘는 방향으로 짧게 뻗는 점
    this.pxr.emit({ position: [...p], velocity: [0, 0, 0], life: 0.05, size: 2 + power, sizeEnd: 2, ramp: [[1, 1, 0.9], (color)], emissive: 0.9, hard: true });
    for (let j = 1; j <= 2 + power; j++) { const sp = 6 + j * 4; this.pxr.emit({ position: [...p], velocity: [dir[0] * sp, 0, dir[2] * sp], life: 0.06, size: j < 2 ? 2 : 1, sizeEnd: 1, ramp: [[1, 1, 0.85], color], emissive: 0.9, hard: true }); }
    this.shrapnel(p, power, [[1, 1, 0.8], color], { dir: [dir[0], dir[2]], spread: 0.9, speed: [6, 12], life: [0.06, 0.14], up: [0, 1.5], size: [1, 1] });
  }

  // ---- 예전 '모양 이펙트' 호출을 도트로 ----
  //  star4 / star8: 갈래 섬광, burst: 불덩이, hex: 바닥 고리, streak: 파편 점
  flare(p, shape, color, size = 1, life = 0.18, { rot = R() * 6.28 } = {}) {
    if (shape === 'star4') this.starPx(p, 4, color, size, life, rot);
    else if (shape === 'star8') this.starPx(p, 8, color, size, life, rot);
    else if (shape === 'burst') this.fireball(p, size * 0.4, isFire(color) || color[0] + color[1] + color[2] > 2.5 ? FIRE : [...rampOf(color), [0.3, 0.24, 0.3]]);
    else if (shape === 'hex') this.ring(p[0], 0.12, p[2], size * 0.75, color, life);
    else this.shrapnel(p, 1, rampOf(color));
  }
  // 줄기: 머리 점 + 뒤따르는 꼬리 점 (빠른 파편)
  streaks(p, n, color, { dir = null, spread = Math.PI, speed = [6, 14], life = 0.2, up = 0.4 } = {}) {
    const ramp = [[1, 1, 1], ...rampOf(color).slice(1, 4)], tail = rampOf(color).slice(2);
    for (let i = 0; i < n; i++) {
      const a = dir ? Math.atan2(dir[0], dir[1]) + rr(-spread, spread) / 2 : R() * 6.28, sp = rr(speed[0], speed[1]);
      const v = [Math.sin(a) * sp, rr(-0.1, 1) * sp * up, Math.cos(a) * sp], L = life * rr(0.8, 1.2);
      this.px.emit({ position: [...p], velocity: v, life: L, size: 2, sizeEnd: 1, ramp, emissive: 0.6, gravity: 0.6, hard: true });
      this.px.emit({ position: [...p], velocity: v.map((q) => q * 0.82), life: L * 0.9, size: 1, sizeEnd: 1, ramp: tail, emissive: 0.6, gravity: 0.6, hard: true });
    }
  }

  // 맞은 자리: 흰 점 번쩍 + 맞은 방향으로 튀는 점 몇 개
  hitSpark(p, color = [1, 0.9, 0.6], n = 4, dir = null) {
    this.pxr.emit({ position: [...p], velocity: [0, 0, 0], life: 0.05, size: 2, sizeEnd: 2, ramp: [[1, 0.95, 0.8]], emissive: 0.35, hard: true });
    this.shrapnel(p, Math.min(6, 1 + (n >> 1)), rampOf(color).slice(1, 4), { dir, spread: dir ? 1.6 : 6.28, speed: [3, 8], life: [0.1, 0.24], up: [0.5, 3.5] });
  }

  dust(x, z, n = 1, color = [0.5, 0.42, 0.36]) {
    for (let i = 0; i < n; i++) this.smoke.emit({ position: [x + rr(-0.3, 0.3), 0.1, z + rr(-0.3, 0.3)], velocity: [rr(-0.6, 0.6), rr(0.2, 0.8), rr(-0.6, 0.6)], life: rr(0.4, 0.8), size: rr(2, 3), sizeEnd: 1, color, colorEnd: color.map((c) => c * 0.7), fadeIn: 0.15 });
  }

  number(p, value, { color = [1, 1, 1], big = false } = {}) {
    if (this.numbers.length > 40) this.numbers.shift();
    this.numbers.push({ p: [p[0] + rr(-0.3, 0.3), p[1] + 0.6, p[2] + rr(-0.3, 0.3)], text: String(Math.round(value)), color, big, t: 0, life: big ? 0.9 : 0.6, vx: rr(-0.8, 0.8) });
  }

  update(dt, realDt) {
    const sdt = dt;
    // 점광원 감쇠
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.age += sdt;
      const k = 1 - l.age / l.life;
      if (k <= 0) { this.lights.splice(i, 1); continue; }
      l.intensity = l.base * k * k;
    }
    // 파편 물리 (바닥에 튕김)
    let n = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += sdt;
      if (d.age > d.life) { this.debris.splice(i, 1); continue; }
      d.v[1] -= 22 * sdt;
      for (let k = 0; k < 3; k++) d.p[k] += d.v[k] * sdt;
      if (d.p[1] < 0.08) { d.p[1] = 0.08; d.v[1] *= -0.35; d.v[0] *= 0.6; d.v[2] *= 0.6; d.w[0] *= 0.5; d.w[1] *= 0.5; }
      d.r[0] += d.w[0] * sdt; d.r[1] += d.w[1] * sdt;
      const s = d.s * Math.min(1, (d.life - d.age) * 3);
      this.debrisMesh.setAt(n++, m4.fromTRS(d.p, d.r, [s, s, s]), d.color, 0);
    }
    this.debrisMesh.count = n;
    this.debrisMesh.dirty = true;
    // 데미지 숫자는 실제 시간으로 (히트스톱 중에도 보이게)
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const q = this.numbers[i];
      q.t += realDt;
      if (q.t > q.life) { this.numbers.splice(i, 1); continue; }
      q.p[1] += realDt * (2.2 - q.t * 3);
      q.p[0] += q.vx * realDt;
    }
    this.trauma = Math.max(0, this.trauma - realDt * 2.4);
    this.scene.lights = this.extraLights ? [...this.lights, ...this.extraLights] : this.lights;
  }

  // 오버레이 캔버스에 데미지 숫자 그리기. project(p) → [디바이스 x, y] 또는 null, px: 도트 1칸 크기(디바이스 픽셀)
  drawNumbers(ctx, project, px) {
    for (const q of this.numbers) {
      const s = project(q.p);
      if (!s) continue;
      const k = q.big ? 2 : 1;
      const pop = q.t < 0.08 ? 1.5 : 1;
      const u = Math.max(1, Math.round(px * k * pop));
      const alpha = Math.min(1, (q.life - q.t) * 5);
      const w = q.text.length * 4 * u - u;
      let x0 = Math.round(s[0] - w / 2), y0 = Math.round(s[1] - 2.5 * u);
      ctx.globalAlpha = alpha;
      // 테두리 → 본색 2번 그림
      for (const pass of [0, 1]) {
        ctx.fillStyle = pass ? `rgb(${q.color.map((c) => Math.round(c * 255)).join(',')})` : '#120f18';
        let x = x0;
        for (const ch of q.text) {
          const g = GLYPHS[ch];
          if (g) for (let j = 0; j < 15; j++) {
            if (g[j] !== '1') continue;
            const gx = x + (j % 3) * u, gy = y0 + Math.floor(j / 3) * u;
            if (pass) ctx.fillRect(gx, gy, u, u); else ctx.fillRect(gx - u, gy - u, u * 3, u * 3);
          }
          x += 4 * u;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
