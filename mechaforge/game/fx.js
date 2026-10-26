// 이펙트: 파티클, 점광원 폭발, 충격파 고리, 그을음, 파편, 데미지 숫자, 화면 흔들림

import { Geometry, Mesh, Material, InstancedMesh, ParticleSystem, m4 } from '../engine/index.js';

// 게임 시간 배율(히트스톱/슬로모션)을 따르는 파티클
class GameParticles extends ParticleSystem {
  constructor(fx, o) { super(o); this.fx = fx; }
  update(dt) { super.update(dt * this.fx.timeScale); }
}

const R = Math.random;
const rr = (a, b) => a + (b - a) * R();

// 납작한 고리 (충격파)
function ringGeo(seg = 20, inner = 0.82) {
  const g = new Geometry();
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    g.quad(p(a0, inner), p(a1, inner), p(a1, 1), p(a0, 1), [1, 1, 1], null, [0, 1, 0]);
  }
  return g;
}

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
    scene.particles.push(this.trail, this.smoke, this.sparks);

    this.lights = [];
    this.trauma = 0;
    this.numbers = [];

    // 충격파 고리 풀
    const rg = ringGeo();
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new Mesh(rg, new Material({ emissive: 1, outline: false, castShadow: false }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, life: 0 });
    }
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

  ring(x, y, z, radius, color, life = 0.35) {
    const r = this.rings.find((q) => !q.mesh.visible) || this.rings.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    Object.assign(r, { t: 0, life, radius });
    r.mesh.visible = true;
    r.mesh.position = [x, y, z];
    r.mesh.material.color = color;
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

  // 폭발: size 0.5(작은 드론) ~ 3(보스)
  explosion(x, y, z, size = 1, { color = [1, 0.6, 0.2], debris = [0.3, 0.3, 0.34], ring = true, scorch = true } = {}) {
    const n = Math.round(10 + size * 14);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, e = rr(-0.2, 1), sp = rr(3, 9) * Math.sqrt(size);
      this.sparks.emit({
        position: [x, y, z], velocity: [Math.cos(a) * sp * Math.cos(e), Math.abs(Math.sin(e)) * sp + 2, Math.sin(a) * sp * Math.cos(e)],
        life: rr(0.25, 0.6), size: rr(2, 3.5), sizeEnd: 1, color: [1, 0.95, 0.6], colorEnd: color, emissive: 1, gravity: 0.6,
      });
    }
    for (let i = 0; i < Math.round(3 + size * 4); i++) {
      this.smoke.emit({
        position: [x + rr(-0.4, 0.4) * size, y + 0.2, z + rr(-0.4, 0.4) * size], velocity: [rr(-1, 1), rr(0.5, 2), rr(-1, 1)],
        life: rr(0.7, 1.4), size: rr(3, 5) * Math.min(2, 0.6 + size * 0.5), sizeEnd: 1, color: [0.32, 0.28, 0.3], colorEnd: [0.15, 0.14, 0.17], fadeIn: 0.1,
      });
    }
    // 화염 덩어리 (큰 발광 점)
    for (let i = 0; i < Math.round(2 + size * 3); i++) {
      this.trail.emit({ position: [x + rr(-0.3, 0.3) * size, y + rr(0, 0.4), z + rr(-0.3, 0.3) * size], velocity: [rr(-1.5, 1.5), rr(1, 3), rr(-1.5, 1.5)], life: rr(0.2, 0.4), size: rr(5, 8) * Math.min(1.8, 0.5 + size * 0.5), sizeEnd: 2, color: [1, 0.9, 0.5], colorEnd: [1, 0.3, 0.1], emissive: 1 });
    }
    for (let i = 0; i < Math.round(size * 3); i++) this.chunk(x, y, z, debris, 5 + size * 2);
    this.light([x, y + 1, z], color, 3 + size * 2.2, 1.1 + size * 0.25, 0.22 + size * 0.1);
    if (ring) this.ring(x, 0.12, z, 1.4 + size * 1.6, [1, 0.75, 0.4], 0.28 + size * 0.06);
    if (scorch && size >= 0.8) this.scorchMark(x, z, 1 + size * 0.7);
    if (size >= 1) this.addTrauma((size - 0.7) * 0.12);
  }

  // 작은 펑 (떼거리 적 처치용: 빛, 연기, 흔들림 없이 가볍게)
  pop(x, y, z, color = [1, 0.6, 0.25]) {
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2, sp = rr(2, 5);
      this.sparks.emit({ position: [x, y, z], velocity: [Math.cos(a) * sp, rr(2, 5), Math.sin(a) * sp], life: rr(0.18, 0.4), size: rr(2, 3), sizeEnd: 1, color: [1, 0.95, 0.6], colorEnd: color, emissive: 1, gravity: 0.8 });
    }
    this.trail.emit({ position: [x, y + 0.1, z], velocity: [0, 1, 0], life: 0.16, size: 6, sizeEnd: 2, color: [1, 0.9, 0.55], colorEnd: [1, 0.35, 0.1], emissive: 1 });
    if (R() < 0.3) this.chunk(x, y, z, [0.35, 0.25, 0.2], 4);
  }

  muzzle(p, dir, color = [1, 0.85, 0.4], power = 1) {
    this.light(p, color, 2 + power, 0.6 + 0.25 * power, 0.07);
    for (let i = 0; i < 2 + power; i++) {
      const sp = rr(4, 9);
      this.sparks.emit({ position: p, velocity: [dir[0] * sp + rr(-1.5, 1.5), rr(0, 1.5), dir[2] * sp + rr(-1.5, 1.5)], life: rr(0.06, 0.14), size: 2, sizeEnd: 1, color: [1, 1, 0.8], colorEnd: color, emissive: 1, gravity: 0 });
    }
  }

  hitSpark(p, color = [1, 0.9, 0.6], n = 4) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, sp = rr(3, 7);
      this.sparks.emit({ position: p, velocity: [Math.cos(a) * sp, rr(1, 5), Math.sin(a) * sp], life: rr(0.12, 0.28), size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: color, emissive: 1 });
    }
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
    // 고리
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += sdt;
      const k = r.t / r.life;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = r.radius * (0.3 + 0.7 * (1 - (1 - k) * (1 - k)));
      r.mesh.scale = [s, 1, s];
      r.mesh.material.opacity = 1 - k;
      r.mesh.material.emissive = 0.5 * (1 - k); // 겹쳐도 블룸이 하얗게 타지 않게
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
