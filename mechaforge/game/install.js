// 장착 연출: 지원 드론이 날아와서 부품을 붙이거나 튜닝한다
//
//  'part'  : 드론이 새 부품을 매달고 화면 밖에서 날아옴 → 슬롯 위에서 놓음 → 철컥! (링·불꽃·빛) → 용접 → 떠남
//  'weld'  : 기존 무기 강화. 드론이 와서 해당 부위를 용접 (불꽃 + 깜빡이는 푸른 빛)
//  'tune'  : 능력치 업그레이드. 드론이 위에서 초록 스캔 빔을 쏜다
//  공격/대시/특수기/화면 터치로 건너뛸 수 있다. 진행 중엔 적이 멈춘다.

import { Geometry, Mesh, Node, Material, m4, v3 } from '../engine/index.js';

const ease = (t) => t * t * (3 - 2 * t);
const R = Math.random, rr = (a, b) => a + (b - a) * R();

function droneGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(0.7, 0.3, 0.7, [0.92, 0.75, 0.2]));
  g.merge(Geometry.box(0.5, 0.12, 0.5, [0.25, 0.26, 0.3]), { position: [0, 0.3, 0] });
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    g.merge(Geometry.box(0.5, 0.06, 0.08, [0.3, 0.3, 0.35]), { position: [x * 0.55, 0.22, z * 0.55], rotation: [0, Math.atan2(x, z), 0] });
    g.merge(Geometry.cylinder(0.28, 0.28, 0.03, 8, [0.6, 0.62, 0.7]), { position: [x, 0.28, z] });
  }
  return g;
}
function armGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(0.08, 0.5, 0.08, [0.35, 0.35, 0.4]), { position: [0, -0.5, 0] });
  g.merge(Geometry.box(0.16, 0.1, 0.06, [0.85, 0.85, 0.9]), { position: [0, -0.56, 0] });
  return g;
}

export class Installer {
  constructor(game) {
    this.game = game;
    const sc = game.scene;
    this.drone = sc.add(new Node('drone'));
    this.body = this.drone.add(new Mesh(droneGeo(), new Material({ castShadow: true })));
    this.eye = this.drone.add(new Mesh((() => { const g = new Geometry(); g.merge(Geometry.box(0.3, 0.1, 0.05, [0.4, 1, 0.9]), { position: [0, 0.08, 0.36] }); return g; })(), new Material({ emissive: 1, outline: false })));
    this.arms = [-1, 1].map((s) => { const n = this.drone.add(new Node('arm')); n.position = [s * 0.25, 0, 0.2]; n.add(new Mesh(armGeo(), new Material())); return n; });
    this.beamMesh = sc.add(new Mesh(Geometry.cylinder(0.12, 0.6, 1, 6, [0.4, 1, 0.6]), new Material({ emissive: 1, outline: false, castShadow: false, opacity: 0.6 })));
    this.drone.visible = false; this.beamMesh.visible = false;
    this.carry = null;
    this.active = false;
  }

  /**
   * kind: 'part' | 'weld' | 'tune'
   * key: 새 부품의 partKey ('w:armL', 'm:booster') — part/weld 에서 위치를 잡는 데 사용
   */
  // opts.from: 노획 부품이 떨어져 있던 위치. 드론 없이 부품이 거기서 날아와 붙는다
  start(kind, key, label = '', opts = {}) {
    const g = this.game, p = g.player;
    this.kind = kind; this.key = key; this.t = 0; this.active = true; this.snapped = false;
    this.salvage = opts.from || null;
    this.dur = this.salvage ? (kind === 'part' ? 0.85 : 0.7) : kind === 'part' ? 1.45 : kind === 'weld' ? 1.05 : 0.95;
    this.drone.visible = !this.salvage;
    this.label = label;
    // 부품의 현재 월드 위치 (숨겨진 메시들의 중심)
    p.mech.root.updateWorld();
    const parts = [...p.mech.meshes, ...p.mech.glows].filter((m) => m.partKey === key);
    this.parts = parts;
    this.target = parts.length ? centerOf(parts) : [p.x, 1.6, p.z];
    if (kind === 'weld' && !parts.length) this.target = [p.x, 1.5, p.z];
    // 화면 위쪽(카메라 반대편)에서 날아온다
    const cam = g.engine.camera, up = cam.up || [0, 1, 0], right = cam.right || [1, 0, 0];
    this.from = v3.add(this.target, v3.add(v3.scale(up, 9), v3.scale(right, rr(-4, 4))));
    this.from[1] = Math.max(this.from[1], 7);
    this.hover = v3.add(this.target, [0, kind === 'tune' ? 2.6 : 1.5, 0]);
    // 매달린 부품 사본 (진짜 부품은 숨겨 둔 상태)
    this.carry = null;
    if (kind === 'part' && parts.length) {
      this.carry = g.scene.add(new Node('carry'));
      this.carry.matrix = m4.identity();
      this.carryMeshes = parts.map((m) => { const c = this.carry.add(new Mesh(m.geometry, new Material({ emissive: m.material.emissive }))); c.matrix = new Float32Array(m.world); return c; });
    }
    g.fx.light(this.target, [0.6, 0.9, 1], 4, 0.6, 0.3);
    if (this.salvage) { g.sfx.play('dash', { pitch: 1.3 }); return; }
    g.sfx.play('drone');
    if (kind === 'weld') setTimeout(() => this.active && g.sfx.play('weld'), 380);
    if (kind === 'tune') setTimeout(() => this.active && g.sfx.play('tune'), 380);
  }

  skip() { if (this.active) { this.t = this.dur; this.finish(); } }

  // 노획 부품: 바닥에서 튀어 올라 포물선을 그리며 날아와 철컥
  updateSalvage(dt) {
    const g = this.game, fx = g.fx, t = this.t, fly = 0.45;
    const e = ease(Math.min(1, t / fly));
    const pos = v3.add(v3.lerp(this.salvage, this.target, e), [0, Math.sin(Math.PI * e) * 2.2, 0]);
    if (this.carry && t < fly) {
      const k = 1.4 - 0.4 * e;
      this.carry.matrix = m4.multiply(m4.fromTRS(pos, [0, (1 - e) * 9, 0], [k, k, k]), m4.fromTRS(v3.scale(this.target, -1), [0, 0, 0], [1, 1, 1]));
    }
    if (t < fly) for (let i = 0; i < 2; i++) fx.trail.emit({ position: pos, velocity: [rr(-1, 1), rr(0, 1), rr(-1, 1)], life: 0.25, size: 3, sizeEnd: 1, color: [1, 0.9, 0.5], colorEnd: [1, 0.5, 0.1], emissive: 1, gravity: 0 });
    if (!this.snapped && t >= fly) {
      if (this.kind === 'part') this.snap();
      else { this.snapped = true; g.player.buildFlash = 0.35; fx.ring(g.player.x, 0.15, g.player.z, 2.6, [1, 0.8, 0.3], 0.3); fx.hitSpark(this.target, [1, 0.8, 0.3], 14); g.sfx.play('clank'); }
    }
    if (this.snapped && Math.random() < 0.6) { const sp = v3.add(this.target, [rr(-0.25, 0.25), rr(-0.15, 0.15), rr(-0.25, 0.25)]); fx.sparks.emit({ position: sp, velocity: [rr(-3, 3), rr(1, 5), rr(-3, 3)], life: rr(0.15, 0.3), size: 2, sizeEnd: 1, color: [1, 1, 0.8], colorEnd: [1, 0.55, 0.2], emissive: 1, gravity: 1 }); }
    if (t >= this.dur) this.finish();
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game, fx = g.fx, p = g.player;
    this.t += dt;
    if (this.salvage) { this.updateSalvage(dt); return; }
    const t = this.t, T = this.dur;
    let pos;
    const inEnd = 0.38, outStart = T - 0.3;
    if (t < inEnd) pos = v3.lerp(this.from, this.hover, ease(t / inEnd));
    else if (t < outStart) pos = v3.add(this.hover, [Math.sin(t * 9) * 0.06, Math.sin(t * 13) * 0.05, 0]);
    else pos = v3.lerp(this.hover, v3.add(this.from, [0, 3, 0]), ease((t - outStart) / 0.3));
    this.drone.position = pos;
    this.drone.rotation = [t < inEnd ? 0.35 : 0, t * 0.6, 0];
    // 팔 움직임
    const working = t > inEnd && t < outStart;
    this.arms.forEach((a, i) => { a.rotation = [working ? -0.6 + Math.sin(t * 22 + i * 2) * 0.4 : -0.2, 0, (i ? -1 : 1) * 0.25]; });
    this.eye.material.color = [1, 1, 1].map(() => (working ? 0.7 + R() * 0.5 : 1));

    if (this.kind === 'part' && this.carry) {
      // 드론에 매달려 오다가 → 내려 꽂힘
      const drop0 = inEnd, drop1 = inEnd + 0.16;
      const off = t < drop0 ? v3.sub(pos, this.target) : t < drop1 ? v3.scale(v3.sub(this.hover, this.target), 1 - ease((t - drop0) / (drop1 - drop0))) : [0, 0, 0];
      const spin = t < drop0 ? (1 - t / drop0) * 2.5 : 0;
      const k = t < drop0 ? 1.6 : 1.6 - 0.6 * ease(Math.min(1, (t - drop0) / (drop1 - drop0)));
      this.carry.matrix = m4.multiply(m4.fromTRS(v3.add(this.target, v3.add(off, [0, -0.75 * (t < drop0 ? 1 : 0), 0])), [0, spin, 0], [k, k, k]), m4.fromTRS(v3.scale(this.target, -1), [0, 0, 0], [1, 1, 1]));
      if (t < drop1 && R() < 0.6) fx.trail.emit({ position: v3.add(this.target, off), velocity: [0, 0.4, 0], life: 0.25, size: 2, sizeEnd: 1, color: [0.6, 0.9, 1], colorEnd: [0.3, 0.5, 1], emissive: 1, gravity: 0 });
      if (!this.snapped && t >= drop1) this.snap();
    }
    if ((this.kind === 'weld' || this.kind === 'part') && working && (this.kind === 'weld' || this.snapped)) {
      // 용접 불꽃 + 깜빡이는 빛
      if (R() < 0.7) {
        const sp = v3.add(this.target, [rr(-0.25, 0.25), rr(-0.15, 0.15), rr(-0.25, 0.25)]);
        for (let i = 0; i < 3; i++) fx.sparks.emit({ position: sp, velocity: [rr(-3, 3), rr(1, 5), rr(-3, 3)], life: rr(0.15, 0.35), size: 2, sizeEnd: 1, color: [1, 1, 0.8], colorEnd: [1, 0.55, 0.2], emissive: 1, gravity: 1 });
      }
      if (R() < 0.5) fx.light(this.target, [0.6, 0.85, 1], 3, 0.6 + R() * 0.6, 0.06);
      if (this.kind === 'weld') p.buildFlash = 0.15;
    }
    if (this.kind === 'tune') {
      const on = working;
      this.beamMesh.visible = on;
      if (on) {
        const top = v3.add(pos, [0, -0.2, 0]), h = Math.max(0.5, top[1]);
        this.beamMesh.position = [top[0], 0, top[2]];
        this.beamMesh.scale = [1 + Math.sin(t * 20) * 0.1, h, 1 + Math.sin(t * 20) * 0.1];
        this.beamMesh.material.opacity = 0.35 + 0.25 * Math.sin(t * 30);
        const ry = (Math.sin(t * 6) * 0.5 + 0.5) * 2.2;
        if (R() < 0.8) for (let i = 0; i < 3; i++) { const a = R() * 6.28; fx.trail.emit({ position: [p.x + Math.cos(a) * 0.9, ry, p.z + Math.sin(a) * 0.9], velocity: [0, 0.5, 0], life: 0.3, size: 2, sizeEnd: 1, color: [0.6, 1, 0.7], colorEnd: [0.2, 1, 0.5], emissive: 1, gravity: 0 }); }
        p.buildFlash = 0.1;
      }
    }
    if (t >= T) this.finish();
  }

  // 철컥! 부품이 제자리에 붙는 순간
  snap() {
    const g = this.game, fx = g.fx, p = g.player;
    this.snapped = true;
    if (this.carry) { g.scene.remove(this.carry); this.carry = null; }
    p.revealHidden();
    p.buildFlash = 0.22;
    fx.ring(p.x, 0.15, p.z, 3, [0.5, 0.9, 1], 0.35);
    fx.light(this.target, [0.7, 0.9, 1], 4, 0.7, 0.15);
    fx.hitSpark(this.target, [0.6, 0.9, 1], 14);
    fx.addTrauma(0.25);
    g.sfx.play('clank');
    g.ui.toast(`장착 완료: ${this.label}`);
  }

  finish() {
    const g = this.game, p = g.player;
    if (this.kind === 'part' && !this.snapped) this.snap();
    p.revealHidden();
    if (this.carry) { g.scene.remove(this.carry); this.carry = null; }
    this.drone.visible = false; this.beamMesh.visible = false;
    this.active = false;
    if (this.kind === 'tune' || this.kind === 'weld') {
      g.fx.ring(p.x, 0.15, p.z, 2.6, this.kind === 'tune' ? [0.4, 1, 0.6] : [0.6, 0.9, 1], 0.3);
      g.ui.toast(`${this.kind === 'tune' ? '튜닝 완료' : '강화 완료'}: ${this.label}`);
    }
    g.endInstall();
  }
}

function centerOf(meshes) {
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const m of meshes) {
    const pp = m.geometry.pos, w = m.world;
    for (let i = 0; i < pp.length; i += 9) {
      const x = w[0] * pp[i] + w[4] * pp[i + 1] + w[8] * pp[i + 2] + w[12], y = w[1] * pp[i] + w[5] * pp[i + 1] + w[9] * pp[i + 2] + w[13], z = w[2] * pp[i] + w[6] * pp[i + 1] + w[10] * pp[i + 2] + w[14];
      lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)];
    }
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}
