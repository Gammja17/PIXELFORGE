// 드롭 아이템: 경험치 결정(XP), 수리 키트, 자석, 보스 코어

import { Geometry, InstancedMesh, Material, Mesh, m4 } from '../engine/index.js';
import { partPreview, MODULES } from './parts.js';
import { WEAPONS } from './weapons.js';

const GEM_TIERS = [ // 값이 클수록 큰 결정
  { min: 25, color: [1, 0.35, 0.9], s: 1.6 },
  { min: 5, color: [0.35, 0.6, 1], s: 1.25 },
  { min: 0, color: [0.4, 1, 0.5], s: 1 },
];
const ITEM_COLORS = { kit: [0.4, 1, 0.45], magnet: [1, 0.85, 0.25], core: [1, 0.4, 0.9], crate: [1, 0.7, 0.2] };

export class Pickups {
  constructor(game) {
    this.game = game;
    this.gems = [];
    this.items = [];
    this.parts = [];
    const gg = Geometry.icosphere(0.16, 0, [1, 1, 1], { squashY: 1.4 });
    this.gemMesh = game.scene.add(new InstancedMesh(gg, new Material({ emissive: 0.75, castShadow: false }), 450));
    const ig = new Geometry();
    ig.merge(Geometry.box(0.42, 0.42, 0.42, [0.9, 0.9, 0.9]), { position: [0, -0.21, 0] });
    ig.merge(Geometry.box(0.46, 0.12, 0.12, [1, 1, 1]), { position: [0, -0.06, 0] });
    ig.merge(Geometry.box(0.12, 0.12, 0.46, [1, 1, 1]), { position: [0, -0.06, 0] });
    this.itemMesh = game.scene.add(new InstancedMesh(ig, new Material({ emissive: 0.55 }), 40));
  }

  gem(x, z, value) {
    if (this.gems.length >= this.gemMesh.capacity - 5) {
      // 너무 많으면 가장 오래된 결정에 값을 합친다
      const o = this.gems[(Math.random() * 50) | 0];
      o.value += value;
      return;
    }
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2;
    this.gems.push({ x, z, y: 0.6, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4, value, t: Math.random() * 6, pull: false });
  }
  drop(kind, x, z) { this.items.push({ kind, x, z, y: 1.5, vy: 5, t: 0 }); }

  // ---- 노획 부품: 적에게서 뜯겨 나온 실제 부품이 바닥에 떨어진다 ----
  //  kind: 'weapon' | 'module', id: 무기/모듈 id
  salvage(kind, id, x, z) {
    const g = this.game;
    if (this.parts.length >= 6) return;
    const node = g.scene.add(partPreview(kind, id, g.player.loadout.paint));
    const beam = g.scene.add(new Mesh(Geometry.cylinder(0.05, 0.05, 1, 5, [1, 0.8, 0.3]), new Material({ emissive: 1, outline: false, castShadow: false, opacity: 0.5 })));
    const a = Math.random() * 6.28;
    this.parts.push({ kind, id, x, z, y: 1.2, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 7, t: 0, node, beam, spin: (Math.random() - 0.5) * 14 });
    const name = kind === 'weapon' ? WEAPONS[id].name : MODULES[id].name;
    g.ui.toast(`${name} 떨어짐! 가까이 가서 줍기`);
    g.sfx.play('clank', { vol: 0.6 });
    g.fx.ring(x, 0.15, z, 2, [1, 0.8, 0.3], 0.3);
  }
  updateParts(dt) {
    const g = this.game, p = g.player, fx = g.fx;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.t += dt;
      // 튕겨 나와 떨어진 뒤 제자리에서 빙글빙글
      if (q.y > 0.45 || q.vy > 0) { q.vy -= 22 * dt; q.y = Math.max(0.45, q.y + q.vy * dt); q.x += q.vx * dt; q.z += q.vz * dt; if (q.y <= 0.45 && q.vy < 0) { q.vy = Math.abs(q.vy) > 4 ? -q.vy * 0.35 : 0; q.vx *= 0.5; q.vz *= 0.5; fx.dust(q.x, q.z, 1); } }
      q.spin *= Math.exp(-2 * dt);
      q.node.position = [q.x, q.y + Math.sin(q.t * 3) * 0.08, q.z];
      q.node.rotation = [0.3, q.t * (1.2 + Math.abs(q.spin)), 0];
      q.node.scale = [1.5, 1.5, 1.5];
      q.beam.position = [q.x, 0, q.z]; q.beam.scale = [1, 4 + Math.sin(q.t * 6) * 0.3, 1];
      q.beam.material.opacity = 0.35 + 0.2 * Math.sin(q.t * 8);
      if (Math.random() < 0.15) fx.sparks.emit({ position: [q.x, q.y + 0.3, q.z], velocity: [0, 2, 0], life: 0.4, size: 2, sizeEnd: 1, color: [1, 0.9, 0.5], colorEnd: [1, 0.5, 0.1], emissive: 1, gravity: -0.2 });
      const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (q.t > 0.6 && d < p.r + 0.9 && g.state === 'play') {
        this.parts.splice(i, 1);
        g.scene.remove(q.node); g.scene.remove(q.beam);
        g.salvageInstall(q.kind, q.id, [q.x, q.y + 0.3, q.z]);
        return; // 장착 연출이 시작되므로 이번 프레임은 여기까지
      }
    }
  }

  update(dt) {
    this.updateParts(dt);
    const g = this.game, p = g.player, fx = g.fx;
    const mr = p.stats.magnet;
    let n = 0;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const q = this.gems[i];
      q.t += dt;
      const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (d < mr || q.pull) q.pull = true;
      if (q.pull) {
        // 자석: 가까울수록 빨라짐
        const sp = 9 + q.t * 4;
        q.vx += ((dx / (d || 1)) * sp - q.vx) * Math.min(1, dt * 8);
        q.vz += ((dz / (d || 1)) * sp - q.vz) * Math.min(1, dt * 8);
      } else { q.vx *= Math.exp(-5 * dt); q.vz *= Math.exp(-5 * dt); }
      q.x += q.vx * dt; q.z += q.vz * dt;
      q.vy -= 20 * dt; q.y = Math.max(0.35, q.y + q.vy * dt); if (q.y <= 0.35) q.vy = 0;
      if (d < p.r + 0.35) {
        g.addXp(q.value); g.sfx.play('gem', { pitch: 1 + Math.min(0.6, q.value * 0.05) });
        fx.sparks.emit({ position: [q.x, 1, q.z], velocity: [0, 3, 0], life: 0.2, size: 2, sizeEnd: 1, color: [0.8, 1, 0.8], colorEnd: [0.3, 1, 0.5], emissive: 1, gravity: 0 });
        this.gems.splice(i, 1);
        continue;
      }
      const T = GEM_TIERS.find((t) => q.value >= t.min);
      const s = T.s;
      this.gemMesh.setAt(n++, m4.fromTRS([q.x, q.y + Math.sin(q.t * 4) * 0.08, q.z], [0, q.t * 2, 0], [s, s, s]), T.color, 0.75);
    }
    this.gemMesh.count = n;
    this.gemMesh.dirty = true;

    let m = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.vy -= 20 * dt; it.y = Math.max(0.5, it.y + it.vy * dt);
      const dx = p.x - it.x, dz = p.z - it.z, d = Math.hypot(dx, dz);
      if (d < (it.kind === 'crate' ? 3.5 : 2.2)) { it.x += (dx / d) * 10 * dt; it.z += (dz / d) * 10 * dt; }
      if (d < p.r + 0.5) {
        this.items.splice(i, 1);
        if (it.kind === 'kit') { p.heal(p.stats.maxHp * 0.3); g.ui.toast('수리 키트 +30%'); }
        else if (it.kind === 'magnet') { for (const q of this.gems) q.pull = true; g.ui.toast('자석: 모든 결정 회수'); }
        else if (it.kind === 'crate') { g.pendingCrates = (g.pendingCrates || 0) + 1; g.ui.toast('정예 기체 부품 노획!'); }
        else if (it.kind === 'core') { p.heal(p.stats.maxHp); g.addXp(g.xpNeed - g.xp + 1); g.ui.toast('보스 코어: 완전 수리 + 레벨 업'); }
        fx.ring(p.x, 0.15, p.z, 2.5, ITEM_COLORS[it.kind], 0.3);
        fx.light([p.x, 1.5, p.z], ITEM_COLORS[it.kind], 4, 0.8, 0.3);
        continue;
      }
      if (it.t > 30 && it.kind !== 'core' && it.kind !== 'crate') { this.items.splice(i, 1); continue; }
      const blink = it.t > 25 && Math.sin(it.t * 20) < 0;
      const s = it.kind === 'core' ? 1.8 : it.kind === 'crate' ? 1.7 + Math.sin(it.t * 6) * 0.1 : 1;
      if (it.kind === 'crate' && Math.random() < 0.3) fx.trail.emit({ position: [it.x, it.y + 0.3, it.z], velocity: [0, 2, 0], life: 0.4, size: 2, sizeEnd: 1, color: [1, 0.85, 0.4], colorEnd: [1, 0.5, 0.1], emissive: 1, gravity: 0 });
      this.itemMesh.setAt(m++, m4.fromTRS([it.x, it.y + Math.sin(it.t * 3) * 0.1, it.z], [0, it.t * 1.5, 0], blink ? [0, 0, 0] : [s, s, s]), ITEM_COLORS[it.kind], 0.55);
    }
    this.itemMesh.count = m;
    this.itemMesh.dirty = true;
  }

  clear() { for (const q of this.parts || []) { this.game.scene.remove(q.node); this.game.scene.remove(q.beam); } this.parts = []; this.gems = []; this.items = []; this.gemMesh.count = 0; this.itemMesh.count = 0; }
}
