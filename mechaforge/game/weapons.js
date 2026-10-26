// 무기 정의 + 발사 로직 + 투사체 관리 (모든 탄은 InstancedMesh로 한 번에 그림)
//
//  새 무기 추가:
//   1) parts.js WEAPON_MODELS 에 외형 함수 추가
//   2) 아래 WEAPONS 에 { name, prefer, levels:[...], fire(ctx) } 추가
//   3) upgrades.js 는 WEAPONS 를 자동으로 읽어서 카드에 넣는다

import { Geometry, InstancedMesh, Material, Mesh, m4 } from '../engine/index.js';
import { funnelBitGeo } from './parts.js';

const R = Math.random, rr = (a, b) => a + (b - a) * R();

// levels[i] = 레벨 i+1 의 수치. up = 그 레벨로 올릴 때 카드 설명
export const WEAPONS = {
  mg: {
    name: '머신건', tag: 'MG', prefer: 'arm', desc: '누르고 있으면 연사. 특수기: 부채꼴 탄막.',
    levels: [
      { dmg: 7, cd: 0.16, count: 1, pierce: 0 },
      { dmg: 9, cd: 0.15, count: 1, pierce: 0, up: '피해 +30%' },
      { dmg: 9, cd: 0.14, count: 2, pierce: 0, up: '총열 2개 (탄 2발)' },
      { dmg: 11, cd: 0.12, count: 2, pierce: 0, up: '피해, 연사 증가' },
      { dmg: 13, cd: 0.1, count: 3, pierce: 1, up: '탄 3발 + 관통' },
    ],
    range: 13,
  },
  shotgun: {
    name: '샷건', tag: 'SG', prefer: 'arm', desc: '근거리 산탄, 강한 넉백. 특수기: 슬러그 폭발.',
    levels: [
      { dmg: 6, cd: 0.95, pellets: 6 },
      { dmg: 7, cd: 0.9, pellets: 7, up: '산탄 +1, 피해 증가' },
      { dmg: 8, cd: 0.82, pellets: 8, up: '산탄 +1, 재장전 단축' },
      { dmg: 9, cd: 0.72, pellets: 10, up: '산탄 +2' },
      { dmg: 11, cd: 0.62, pellets: 12, up: '이중 장전 (산탄 12)' },
    ],
    range: 7.5,
  },
  missile: {
    name: '미사일 포드', tag: 'MSL', prefer: 'shoulder', desc: '어깨에 달려 자동으로 유도 미사일 발사.',
    levels: [
      { dmg: 16, cd: 1.7, count: 2, aoe: 1.8 },
      { dmg: 20, cd: 1.55, count: 2, aoe: 2.0, up: '피해, 폭발 범위 증가' },
      { dmg: 21, cd: 1.5, count: 3, aoe: 2.1, up: '미사일 +1' },
      { dmg: 25, cd: 1.4, count: 4, aoe: 2.3, up: '미사일 +1, 피해 증가' },
      { dmg: 28, cd: 1.3, count: 6, aoe: 2.7, up: '일제 사격 (6발)' },
    ],
    range: 17,
  },
  laser: {
    name: '빔 라이플', tag: 'BEAM', prefer: 'arm', desc: '모든 적을 관통하는 빔. 특수기: 메가 빔.',
    levels: [
      { dmg: 28, cd: 2.2, width: 0.55 },
      { dmg: 36, cd: 2.0, width: 0.65, up: '피해 증가, 빔 굵기 +' },
      { dmg: 44, cd: 1.8, width: 0.75, up: '충전 시간 단축' },
      { dmg: 54, cd: 1.6, width: 0.9, up: '피해 증가, 빔 굵기 +' },
      { dmg: 66, cd: 1.35, width: 1.1, up: '메가 빔 (최대 출력)' },
    ],
    range: 18,
  },
  saber: {
    name: '빔 사벨', tag: 'SABER', prefer: 'arm', desc: '3단 콤보 베기, 마지막 타격이 적을 띄운다. 특수기: 회전 베기.',
    levels: [
      { dmg: 26, cd: 1.1, radius: 2.7, arc: 2.6 },
      { dmg: 33, cd: 1.0, radius: 2.9, arc: 2.8, up: '피해 증가, 범위 +' },
      { dmg: 40, cd: 0.92, radius: 3.1, arc: 3.2, up: '휘두르는 각도 증가' },
      { dmg: 48, cd: 0.85, radius: 3.3, arc: 3.6, up: '피해, 범위 증가' },
      { dmg: 60, cd: 0.75, radius: 3.7, arc: 6.3, up: '회전 베기 (360°)' },
    ],
    range: 3.4,
  },
  // 노획 무기: 카드로는 안 나오고 적에게서 뜯어내야 얻는다
  cannon: {
    name: '전차 포신', tag: 'CANNON', prefer: 'shoulder', salvage: true, desc: '경전차에서 뜯어낸 포. 어깨에서 자동으로 폭발탄을 쏜다.',
    levels: [
      { dmg: 38, cd: 1.7, aoe: 1.8 },
      { dmg: 46, cd: 1.55, aoe: 2.0, up: '피해, 폭발 범위 증가' },
      { dmg: 54, cd: 1.4, aoe: 2.2, up: '장전 단축' },
      { dmg: 64, cd: 1.25, aoe: 2.5, up: '피해, 폭발 범위 증가' },
      { dmg: 80, cd: 1.05, aoe: 2.9, up: '중포탄 (최대 출력)' },
    ],
    range: 15,
  },
  funnel: {
    name: '판넬 비트', tag: 'BIT', prefer: 'back', desc: '등에서 나온 비트가 주위를 돌며 자동 사격.',
    levels: [
      { dmg: 8, cd: 0.95, bits: 2 },
      { dmg: 9, cd: 0.9, bits: 3, up: '비트 +1' },
      { dmg: 11, cd: 0.85, bits: 3, up: '피해, 연사 증가' },
      { dmg: 12, cd: 0.8, bits: 4, up: '비트 +1' },
      { dmg: 15, cd: 0.7, bits: 6, up: '비트 6기 편대' },
    ],
    range: 12,
  },
};
export const MAX_LEVEL = 5;

// ---- 무기 진화: 최대 레벨 무기 + 특정 몸통 부품 → 상위 무기 ----
export const EVOLUTIONS = {
  mg:      { need: 'reactor', name: '개틀링 포대', tag: 'GATLING', desc: '총열 4개가 쉬지 않고 돈다. 관통 2.', stats: { dmg: 15, cd: 0.055, count: 4, pierce: 2 } },
  shotgun: { need: 'armor', name: '드래곤 브레스', tag: 'DRAGON', desc: '산탄 하나하나가 작은 폭발을 일으킨다.', stats: { dmg: 13, cd: 0.5, pellets: 14, boom: 1.1 } },
  missile: { need: 'antenna', name: '스웜 미사일', tag: 'SWARM', desc: '미사일 10발 일제 사격, 폭발 범위 대폭 증가.', stats: { dmg: 32, cd: 1.0, count: 10, aoe: 3.1 } },
  laser:   { need: 'booster', name: '하이퍼 메가 빔', tag: 'HYPER', desc: '빔 3줄을 부채꼴로 쏜다.', stats: { dmg: 95, cd: 1.05, width: 1.5, fan: 3 } },
  saber:   { need: 'shield', name: '광자 대검', tag: 'PHOTON', desc: '거대한 칼날, 휘두를 때마다 참격파가 날아간다.', stats: { dmg: 88, cd: 0.6, radius: 5.0, arc: 6.3, wave: true } },
  funnel:  { need: 'reactor', name: '판넬 폭풍', tag: 'STORM', desc: '비트 8기가 폭풍처럼 쏟아붓는다.', stats: { dmg: 19, cd: 0.32, bits: 8 } },
};
export const lvOf = (w) => (w.evo ? EVOLUTIONS[w.id].stats : WEAPONS[w.id].levels[w.level - 1]);
export const weaponName = (w) => (w.evo ? EVOLUTIONS[w.id].name : WEAPONS[w.id].name);

// 상자를 원점 중심 +Z 방향으로 늘린 단위 막대 (탄/빔에 사용)
function rodGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(1, 1, 1), { position: [0, -0.5, 0] });
  return g;
}
function beamGeo() {
  const g = new Geometry();
  g.merge(Geometry.box(1, 1, 1), { position: [0, -0.5, 0.5] }); // z 0~1
  return g;
}

export class Shots {
  constructor(game) {
    this.game = game;
    const sc = game.scene;
    this.list = [];
    this.enemyList = [];
    this.bulletMesh = sc.add(new InstancedMesh(rodGeo(), new Material({ emissive: 1.4, castShadow: false }), 500));
    const mg = new Geometry();
    mg.merge(Geometry.cylinder(0.07, 0.07, 0.4, 5, [0.9, 0.9, 0.92]), { position: [0, 0, -0.2], rotation: [Math.PI / 2, 0, 0] });
    mg.merge(Geometry.cone(0.07, 0.16, 5, [0.9, 0.25, 0.2]), { position: [0, 0, 0.2], rotation: [Math.PI / 2, 0, 0] });
    this.missileMesh = sc.add(new InstancedMesh(mg, new Material({ castShadow: false, emissive: 0.3 }), 120));
    // 적 탄: 흰 심 + 디더링된 색 껍질 + 바닥 그림자 (어디로 오는지 잘 보이게)
    this.enemyCore = sc.add(new InstancedMesh(Geometry.icosphere(0.17, 1), new Material({ emissive: 1, castShadow: false, outline: false }), 300));
    this.enemyMesh = sc.add(new InstancedMesh(Geometry.icosphere(0.32, 1), new Material({ emissive: 1, castShadow: false, opacity: 0.55 }), 300));
    const disc = new Geometry();
    for (let i = 0; i < 10; i++) { const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2; disc.quad([0, 0, 0], [0, 0, 0], [Math.cos(a1) * 0.3, 0, Math.sin(a1) * 0.3], [Math.cos(a0) * 0.3, 0, Math.sin(a0) * 0.3], [0, 0, 0], null, [0, 1, 0]); }
    this.enemyShadow = sc.add(new InstancedMesh(disc, new Material({ color: [0.05, 0.02, 0.06], castShadow: false, outline: false, opacity: 0.5 }), 300));
    // 빔 풀
    this.beams = [];
    const bg = beamGeo();
    for (let i = 0; i < 6; i++) {
      const m = sc.add(new Mesh(bg, new Material({ color: [0.5, 1, 1], emissive: 1, outline: false, castShadow: false })));
      const core = sc.add(new Mesh(bg, new Material({ color: [1, 1, 1], emissive: 1, outline: false, castShadow: false })));
      m.visible = core.visible = false;
      this.beams.push({ m, core, t: 0, life: 0 });
    }
  }

  // ---- 플레이어 탄 ----
  add(o) { if (this.list.length < 480) this.list.push({ pierce: 0, knock: 2, r: 0.25, life: 1, hit: null, ...o }); }

  enemyShot(x, y, z, vx, vz, dmg, kind = 'shell') {
    if (this.enemyList.length >= 290) return;
    this.enemyList.push({ x, y, z, vx, vz, dmg, kind, life: 4, t: 0 });
    this.game.sfx.play('eshot');
  }

  beam(from, yaw, len, width, color) {
    const b = this.beams.find((q) => !q.m.visible) || this.beams[0];
    Object.assign(b, { t: 0, life: 0.3, from: [...from], yaw, len, width });
    b.m.material.color = color;
    b.m.visible = b.core.visible = true;
    this.updateBeam(b);
  }
  updateBeam(b) {
    const k = b.t / b.life, w = b.width * (1 - k * k) + 0.02;
    b.m.position = b.core.position = b.from;
    b.m.rotation = b.core.rotation = [0, b.yaw, 0];
    b.m.scale = [w, w, b.len];
    b.core.scale = [w * 0.45, w * 0.45, b.len];
    b.m.material.opacity = 1 - k * 0.6;
  }

  update(dt) {
    const g = this.game, en = g.enemies, fx = g.fx, p = g.player;
    let nb = 0, nm = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life -= dt;
      if (s.homing) {
        if (!s.target || s.target.dead || s.target.hp <= 0) s.target = en.nearest(s.x, s.z, 14);
        if (s.target && s.age > 0.12) {
          const dx = s.target.x - s.x, dz = s.target.z - s.z, a = Math.atan2(dx, dz), cur = Math.atan2(s.vx, s.vz);
          let da = ((a - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const turn = Math.max(-1, Math.min(1, da)) * 7 * dt, na = cur + turn, sp = Math.min(s.maxSpeed, Math.hypot(s.vx, s.vz) + 30 * dt);
          s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp;
        }
        s.age += dt;
        s.y += (1.0 - s.y) * Math.min(1, dt * 4);
        if (R() < 0.8) fx.trail.emit({ position: [s.x, s.y, s.z], velocity: [rr(-0.3, 0.3), rr(0, 0.4), rr(-0.3, 0.3)], life: rr(0.18, 0.32), size: 2, sizeEnd: 1, color: [1, 0.85, 0.5], colorEnd: [0.9, 0.3, 0.15], emissive: 1 });
        if (R() < 0.35) fx.smoke.emit({ position: [s.x, s.y, s.z], velocity: [0, 0.3, 0], life: 0.5, size: 2, sizeEnd: 3, color: [0.5, 0.48, 0.5], colorEnd: [0.25, 0.24, 0.27] });
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      const RM = g.rooms;
      let dead = s.life <= 0 || Math.abs(s.x) > RM.hx + 4 || Math.abs(s.z) > RM.hz + 4;
      if (!dead) {
        en.each(s.x, s.z, s.r, (e) => {
          if (dead || (s.hit && s.hit.has(e))) return;
          if (s.aoe) { dead = true; return; }
          const len = Math.hypot(s.vx, s.vz) || 1;
          en.hit(e, s.dmg, s.vx / len, s.vz / len, s.knock, { crit: s.crit, quiet: s.quiet });
          fx.hitSpark([s.x, s.y, s.z], s.color, 3);
          g.sfx.play('tink');
          if (s.pierce-- > 0) { (s.hit ||= new Set()).add(e); } else dead = true;
        });
        if (dead && s.aoe) this.explodeAt(s);
      } else if (s.aoe) this.explodeAt(s);
      if (dead) { this.list.splice(i, 1); continue; }
      const yaw = Math.atan2(s.vx, s.vz);
      if (s.homing) this.missileMesh.setAt(nm++, m4.fromTRS([s.x, s.y, s.z], [0, yaw, 0], [1.4, 1.4, 1.4]), [1, 1, 1], 0);
      else this.bulletMesh.setAt(nb++, m4.fromTRS([s.x, s.y, s.z], [0, yaw, 0], s.scale), s.color, 1);
    }
    this.bulletMesh.count = nb; this.missileMesh.count = nm;
    this.bulletMesh.dirty = this.missileMesh.dirty = true;

    // ---- 적 탄 ----
    let ne = 0;
    for (let i = this.enemyList.length - 1; i >= 0; i--) {
      const s = this.enemyList[i];
      s.life -= dt; s.t += dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      const dx = p.x - s.x, dz = p.z - s.z;
      let dead = s.life <= 0;
      if (dx * dx + dz * dz < (p.r + 0.25) ** 2) {
        if (p.hurt(s.dmg, s.vx * 0.1, s.vz * 0.1)) { dead = true; fx.hitSpark([s.x, s.y, s.z], [1, 0.5, 0.3], 6); }
      }
      if (dead) { this.enemyList.splice(i, 1); continue; }
      const pulse = 1 + Math.sin(s.t * 18) * 0.18;
      const sc = (s.kind === 'orb' ? 1.15 : 1) * pulse;
      const col = s.kind === 'orb' ? [1, 0.15, 0.6] : [1, 0.4, 0.1];
      this.enemyMesh.setAt(ne, m4.fromTRS([s.x, s.y, s.z], [0, s.t * 4, 0], [sc, sc, sc]), col, 1);
      this.enemyCore.setAt(ne, m4.fromTRS([s.x, s.y, s.z], [0, 0, 0], [1, 1, 1]), [1, 0.95, 0.9], 1);
      this.enemyShadow.setAt(ne, m4.fromTRS([s.x, 0.04, s.z], [0, 0, 0], [sc, 1, sc]), [1, 1, 1], 0);
      ne++;
    }
    this.enemyMesh.count = this.enemyCore.count = this.enemyShadow.count = ne;
    this.enemyMesh.dirty = this.enemyCore.dirty = this.enemyShadow.dirty = true;

    for (const b of this.beams) {
      if (!b.m.visible) continue;
      b.t += dt;
      if (b.t >= b.life) { b.m.visible = b.core.visible = false; continue; }
      this.updateBeam(b);
    }
  }

  explodeAt(s) {
    const g = this.game;
    let n = 0;
    g.enemies.each(s.x, s.z, s.aoe, (e) => {
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz) || 1;
      g.enemies.hit(e, s.dmg, dx / d, dz / d, 7, { noNum: true });
      n++;
    });
    // 폭발 하나당 숫자 하나만 (화면이 숫자로 덮이지 않게)
    if (s.small) { g.fx.pop(s.x, 0.5, s.z, [1, 0.45, 0.15]); g.sfx.play('pop'); return; }
    g.sfx.play('boom', { vol: 0.8 });
    if (n) g.fx.number([s.x, 0.6, s.z], s.dmg, { color: s.crit ? [1, 0.85, 0.2] : [1, 0.75, 0.5], big: s.crit });
    g.fx.explosion(s.x, 0.6, s.z, 0.75 * (s.aoe / 2), { scorch: true });
  }

  clear() { this.list = []; this.enemyList = []; for (const b of this.beams) b.m.visible = b.core.visible = false; this.update(0); }
}

// ---- 베기 잔상 (초승달 모양 칼날 궤적) ----
//  꼬리(뒤)는 가늘고 칼끝(앞)은 두꺼운 혜성 모양. 안쪽은 흰색, 바깥은 무기 색.
//  휘두르는 동안 매 프레임 하나씩 찍고 빠르게 사라지게 해서 부드러운 궤적이 된다.
const smearGeoCache = new Map();
function smearGeo(span, col, thick) {
  const key = `${span.toFixed(2)}|${col.join(',')}|${thick}`;
  if (smearGeoCache.has(key)) return smearGeoCache.get(key);
  const g = new Geometry(), N = 14;
  const pt = (a, r, y = 0) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a0 = -span * (1 - t0), a1 = -span * (1 - t1);
    const w0 = Math.pow(t0, 1.4) * thick, w1 = Math.pow(t1, 1.4) * thick;
    const c0 = [col[0] + (1 - col[0]) * t0 * 0.35, col[1] + (1 - col[1]) * t0 * 0.35, col[2] + (1 - col[2]) * t0 * 0.35];
    // 바깥 띠 (무기 색) + 안쪽 심 (흰색)
    g.quad(pt(a0, 1 - w0), pt(a1, 1 - w1), pt(a1, 1 + w1 * 0.15), pt(a0, 1 + w0 * 0.15), c0, null, [0, 1, 0]);
    g.quad(pt(a0, 1 - w0 * 0.22, 0.01), pt(a1, 1 - w1 * 0.22, 0.01), pt(a1, 1, 0.01), pt(a0, 1, 0.01), [0.8 + col[0] * 0.2, 0.8 + col[1] * 0.2, 0.8 + col[2] * 0.2], null, [0, 1, 0]);
  }
  smearGeoCache.set(key, g);
  return g;
}

// ---- 플레이어 무기 운용 ----
//  팔(armR/armL)에 단 무기 = 직접 조작 (공격 버튼), 어깨/등 무기 = 자동 사격
//  팔에 무기가 없으면 주먹 콤보. 특수기(K)는 주무장(armR)에 따라 달라진다.
const FIST = { radius: 1.9, arc: 1.9, dmg: 12 };
const SPECIAL_NAMES = { mg: '탄막 사격', shotgun: '슬러그 폭발', laser: '메가 빔', saber: '회전 베기', fist: '로켓 펀치' };

export class WeaponSystem {
  constructor(game) {
    this.game = game; this.list = []; this.bits = []; this.bitT = 0; this.combo = 0; this.comboT = 0; this.swingLock = 0; this.specialT = 0; this.barrage = 0;
    this.smears = [];
    for (let i = 0; i < 14; i++) { const m = game.scene.add(new Mesh(smearGeo(1, [1, 1, 1], 0.4), new Material({ emissive: 0.85, outline: false, castShadow: false }))); m.visible = false; this.smears.push({ m, t: 1, life: 0.1 }); }
  }
  // 칼날 궤적 하나 찍기
  smear(x, y, z, yaw, radius, span, dir, col, thick, life = 0.12) {
    const s = this.smears.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    s.m.geometry = smearGeo(span, col, thick);
    s.m.position = [x, y, z]; s.m.rotation = [0, yaw, 0]; s.m.scale = [radius * dir, 1, radius];
    s.m.visible = true; s.t = 0; s.life = life;
  }
  updateSmears(dt) {
    for (const s of this.smears) {
      if (!s.m.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.m.visible = false; continue; }
      s.m.material.opacity = 1 - k * k;
      s.m.scale = [s.m.scale[0] * (1 + dt * 0.8), 1, s.m.scale[2] * (1 + dt * 0.8)];
    }
  }

  reset() { this.list = []; this.combo = 0; this.comboT = 0; this.swingLock = 0; this.specialT = 0; this.barrage = 0; this.syncBits(); }
  get(id) { return this.list.find((w) => w.id === id); }
  get primary() { return this.list.find((w) => w.slot === 'armR') || null; }
  get primaryKind() { const p = this.primary; return p ? p.id : 'fist'; }
  get specialName() { return SPECIAL_NAMES[this.primaryKind] || '특수기'; }
  cancelCombo() { this.combo = 0; this.comboT = 0; }

  update(dt, ctl) {
    const g = this.game, p = g.player, st = p.stats;
    for (const w of this.list) {
      w.kick = Math.max(0, (w.kick || 0) - dt * 3);
      if (w.pump > 0) { w.pump = Math.max(0, w.pump - dt); const si = this.game.player.mech.slotInfo[w.slot]; if (si) si.inner.rotation[0] = -Math.sin((1 - w.pump / 0.35) * Math.PI) * 0.6; }
      w.cd -= dt * st.rateMul;
      if (w.swing !== undefined) this.animSwing(w, dt);
    }
    if (this.fistSwing) this.animSwing(this.fistSwing, dt);
    this.comboT -= dt;
    this.swingLock = Math.max(0, this.swingLock - dt * st.rateMul);
    this.specialT = Math.max(0, this.specialT - dt);

    this.updateSmears(dt);
    this.manual(dt, ctl);
    if (ctl.special && this.specialT <= 0 && p.dashT <= 0) this.special();
    if (this.barrage > 0) this.updateBarrage(dt);
    this.auto(dt);
    this.updateSetFx(dt);
    this.updateBits(dt);
  }

  // ---------- 직접 조작 ----------
  manual(dt, ctl) {
    const g = this.game, p = g.player;
    const arms = this.list.filter((w) => w.slot.startsWith('arm'));
    const melee = !arms.length || arms[0].id === 'saber';
    // 섬멸 모드: 공격 버튼 없이도 근처에 적이 있으면 자동으로 쏘고 벤다
    const auto = p.stats.autoFire && g.enemies.nearest(p.x, p.z, 11);
    const firing = ctl.attack || ctl.attackPressed || !!auto;
    if (melee) {
      // 누르고 있으면 콤보가 이어진다 (버튼 연타도 OK)
      if (firing && this.swingLock <= 0 && p.dashT <= 0 && (!auto || ctl.attack || ctl.attackPressed || g.enemies.nearest(p.x, p.z, 4))) {
        const w = arms[0] || null;
        this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
        this.slash(w, this.combo);
      }
    }
    // 원거리 팔 무기 (사벨이 아닌 것). 사벨+총 조합이면 총은 같이 쏜다
    for (const w of arms) {
      if (w.id === 'saber' || w.cd > 0) continue;
      if (!firing) continue;
      if (p.dashT > 0) continue;
      const W = WEAPONS[w.id];
      const yaw = p.attackYaw(W.range * p.stats.rangeMul);
      this.fire(w, yaw);
    }
  }

  // 베기 (사벨 또는 주먹). k = 콤보 단계 1~3
  slash(w, k) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const L = w ? lvOf(w) : FIST;
    const fin = k === 3;
    const blade = st.sets?.has('blade');
    const radius = L.radius * st.areaMul * (fin ? 1.2 : 1) * (blade && w ? 1.3 : 1);
    const arc = Math.min(6.2, (w ? L.arc : FIST.arc) * (fin ? 1.35 : 1));
    const D = L.dmg * st.dmgMul * (fin ? 1.8 : 1) * (w ? 1 : 1 + (g.level - 1) * 0.08);
    const yaw = p.attackYaw(radius + 3);
    p.lookAt(yaw, 0.35);
    p.lunge(yaw, fin ? 9 : 5);
    p.attackSlow = 0.18;
    this.swingLock = fin ? 0.42 : 0.2;
    this.comboT = 0.55;
    let n = 0;
    en.each(p.x + Math.sin(yaw) * 0.6, p.z + Math.cos(yaw) * 0.6, radius, (e) => {
      const a = Math.atan2(e.x - p.x, e.z - p.z);
      const da = Math.abs(((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > arc / 2 + 0.25 && Math.hypot(e.x - p.x, e.z - p.z) > e.r + 0.9) return;
      const d = Math.hypot(e.x - p.x, e.z - p.z) || 1, c = Math.random() < st.crit;
      en.hit(e, c ? D * 2 : D, (e.x - p.x) / d, (e.z - p.z) / d, fin ? 16 : 7, { crit: c, launch: fin ? 9 : 0, stun: fin ? 0.5 : 0.25 });
      fx.hitSpark([e.x, 1, e.z], w ? [1, 0.45, 0.85] : [1, 0.8, 0.4], 4);
      // 베인 자국: 칼이 지나가는 방향으로 흰 불꽃이 길게 튄다
      const tx = Math.sin(yaw + (k === 2 ? -1.57 : 1.57)), tz = Math.cos(yaw + (k === 2 ? -1.57 : 1.57));
      for (let j = 0; j < 5; j++) fx.sparks.emit({ position: [e.x, 1 + (e.y || 0), e.z], velocity: [tx * rr(6, 12) + rr(-1, 1), rr(0.5, 2.5), tz * rr(6, 12) + rr(-1, 1)], life: rr(0.12, 0.22), size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: w ? [1, 0.4, 0.8] : [1, 0.7, 0.3], emissive: 1, gravity: 0.2 });
      n++;
    });
    if (blade && w && fin && !L.wave) for (let j = -1; j <= 1; j++) { const a = yaw + j * 0.3; g.shots.add({ x: p.x + Math.sin(a), y: 1, z: p.z + Math.cos(a), vx: Math.sin(a) * 18, vz: Math.cos(a) * 18, dmg: D * 0.5, life: 0.5, pierce: 99, r: 0.8, color: [1, 0.4, 0.9], scale: [0.9, 0.12, 0.25], knock: 6, quiet: true }); }
    if (L.wave) for (let j = -2; j <= 2; j++) { const a = yaw + j * 0.28; g.shots.add({ x: p.x + Math.sin(a), y: 1, z: p.z + Math.cos(a), vx: Math.sin(a) * 18, vz: Math.cos(a) * 18, dmg: D * 0.6, life: 0.55, pierce: 99, r: 0.8, color: [1, 0.5, 0.95], scale: [0.9, 0.12, 0.25], knock: 6, quiet: true }); }
    const sw = { swing: 0, swingYaw: yaw, swingArc: arc, swingR: radius, dir: k === 2 ? -1 : 1, slot: w ? w.slot : 'armR', fist: !w, fin };
    if (w) Object.assign(w, sw); else this.fistSwing = sw;
    g.sfx.play('swing', { pitch: fin ? 0.85 : 1 });
    if (n) { g.hitStop(fin ? 0.07 : 0.035, true); fx.addTrauma(fin ? 0.18 : 0.04); g.sfx.play('hit', { pitch: fin ? 0.8 : 1 }); }
    fx.light([p.x + Math.sin(yaw), 1.4, p.z + Math.cos(yaw)], w ? [1, 0.45, 0.85] : [1, 0.75, 0.4], radius + 1, fin ? 1 : 0.6, 0.15);
    if (fin) fx.ring(p.x + Math.sin(yaw) * 1.4, 0.12, p.z + Math.cos(yaw) * 1.4, radius, w ? [1, 0.5, 0.85] : [1, 0.8, 0.4], 0.25);
  }

  // 원거리 발사 (팔 무기 직접 사격, 자동 무기 공용)
  fire(w, yaw, mul = 1) {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const W = WEAPONS[w.id], L = lvOf(w);
    const mz = p.mech.muzzle(w.slot);
    const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
    const crit = () => Math.random() < st.crit;
    const D = L.dmg * st.dmgMul * mul;
    const SS = st.sets || new Set(), art = SS.has('artillery') && (w.id === 'cannon' || w.id === 'missile');
    w.cd = L.cd * (art ? 0.6 : 1);
    w.kick = 0.25;
    if (w.slot.startsWith('arm')) p.lookAt(yaw, 0.35);
    if (w.id === 'mg') {
      for (let k = 0; k < L.count; k++) {
        const off = (k - (L.count - 1) / 2) * 0.22, a = yaw + rr(-0.04, 0.04), c = crit();
        g.shots.add({ x: mz[0] + Math.cos(yaw) * off, y: mz[1], z: mz[2] - Math.sin(yaw) * off, vx: Math.sin(a) * 32, vz: Math.cos(a) * 32, dmg: c ? D * 2 : D, crit: c, pierce: L.pierce + st.pierce + (SS.has('hive') ? 2 : 0), life: 0.5 * st.rangeMul, color: w.evo ? [1, 1, 0.6] : [1, 0.85, 0.3], scale: [0.16, 0.16, w.evo ? 1.1 : 0.9], knock: 2.5, quiet: !c });
      }
      fx.muzzle(mz, dir, [1, 0.8, 0.3], 1);
      g.sfx.play('mg', { vol: w.slot.startsWith('arm') ? 1 : 0.6, pitch: w.evo ? 1.25 : 1 });
      if (w.slot.startsWith('arm')) p.recoil = Math.max(p.recoil || 0, 0.18);
      this.casing(mz, yaw, w.slot === 'armL' ? -1 : 1);
      fx.light(mz, [1, 0.8, 0.4], 2.5, 0.6, 0.05);
    } else if (w.id === 'shotgun') {
      for (let k = 0; k < L.pellets; k++) {
        const a = yaw + rr(-0.38, 0.38), sp = rr(20, 27), c = crit();
        g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, dmg: c ? D * 2 : D, crit: c, pierce: st.pierce, life: 0.3 * st.rangeMul, color: L.boom ? [1, 0.4, 0.15] : [1, 0.6, 0.25], scale: L.boom ? [0.26, 0.26, 0.5] : [0.18, 0.18, 0.45], knock: 7, r: 0.3, quiet: !c, aoe: L.boom ? L.boom * st.areaMul : 0, small: !!L.boom });
      }
      fx.muzzle(mz, dir, [1, 0.6, 0.25], 3);
      g.sfx.play('shotgun', { pitch: L.boom ? 0.8 : 1 });
      p.recoil = Math.max(p.recoil || 0, 0.9); w.pump = 0.35;
      this.casing(mz, yaw, 1, true);
      fx.light(mz, [1, 0.6, 0.25], 4, 1.2, 0.08);
      for (let k = 0; k < 6; k++) fx.smoke.emit({ position: mz, velocity: [Math.sin(yaw) * 2 + rr(-0.5, 0.5), rr(0.3, 1), Math.cos(yaw) * 2 + rr(-0.5, 0.5)], life: 0.6, size: 3, sizeEnd: 5, color: [0.55, 0.52, 0.5], colorEnd: [0.3, 0.3, 0.32] });
      fx.addTrauma(0.06);
      p.kick(-dir[0] * 2, -dir[2] * 2);
    } else if (w.id === 'missile') {
      const target = en.nearest(p.x, p.z, 17);
      for (let k = 0; k < L.count; k++) {
        const a = yaw + (k - (L.count - 1) / 2) * 0.5 + rr(-0.1, 0.1) + Math.PI * (Math.random() < 0.5 ? 0.15 : -0.15), c = crit();
        g.shots.add({ x: mz[0], y: mz[1] + 0.2, z: mz[2], vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, maxSpeed: 17, homing: true, age: 0, target, dmg: c ? D * 2 : D, crit: c, aoe: L.aoe * st.areaMul * (art ? 1.4 : 1), life: 2.6, r: 0.35, color: [1, 0.6, 0.3] });
        for (let j = 0; j < 3; j++) fx.smoke.emit({ position: mz, velocity: [rr(-1, 1), rr(1, 2), rr(-1, 1)], life: 0.5, size: 3, sizeEnd: 1, color: [0.6, 0.58, 0.6], colorEnd: [0.3, 0.3, 0.33] });
      }
      fx.light(mz, [1, 0.6, 0.3], 3, 1, 0.1);
      g.sfx.play('missile');
    } else if (w.id === 'cannon') {
      const c = crit();
      g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: dir[0] * 19, vz: dir[2] * 19, dmg: c ? D * 2 : D, crit: c, aoe: L.aoe * st.areaMul * (art ? 1.4 : 1), life: 0.85 * st.rangeMul, r: 0.35, color: [1, 0.55, 0.2], scale: [0.3, 0.3, 0.7], knock: 8 });
      fx.muzzle(mz, dir, [1, 0.6, 0.2], 3);
      fx.light(mz, [1, 0.6, 0.25], 4, 1.2, 0.1);
      for (let k = 0; k < 5; k++) fx.smoke.emit({ position: mz, velocity: [dir[0] * 2 + rr(-0.6, 0.6), rr(0.3, 1.2), dir[2] * 2 + rr(-0.6, 0.6)], life: 0.7, size: 3, sizeEnd: 5, color: [0.55, 0.52, 0.5], colorEnd: [0.3, 0.3, 0.32] });
      p.kick(-dir[0] * 2.5, -dir[2] * 2.5); w.kick = 0.6;
      g.sfx.play('shotgun', { pitch: 0.6, vol: 0.8 });
    } else if (w.id === 'laser') {
      const fan = L.fan || 1;
      const rail = SS.has('railgun');
      if (rail && !w.echoing) { w.echo = 0.14; w.echoYaw = yaw; }
      for (let k = 0; k < fan; k++) this.beam(mz, yaw + (k - (fan - 1) / 2) * 0.22, W.range * st.rangeMul, L.width * st.areaMul * (rail ? 1.5 : 1), D, fan > 1 ? [1, 0.55, 1] : [0.45, 1, 1]);
      p.kick(-dir[0] * 4, -dir[2] * 4);
      p.recoil = Math.max(p.recoil || 0, 1);
    }
  }

  // ---- 세트 각성 / 초월 효과 ----
  updateSetFx(dt) {
    const g = this.game, p = g.player, st = p.stats, en = g.enemies, fx = g.fx, SS = st.sets || new Set();
    // 레일건: 빔 두 번째 발사
    for (const w of this.list) if (w.echo > 0 && (w.echo -= dt) <= 0) { w.echoing = true; this.fire(w, w.echoYaw); w.echoing = false; w.cd = lvOf(w).cd; }
    // 요새 포격: 4초마다 주변에 포탄 6발
    if (SS.has('artillery') && (this.artT = (this.artT ?? 2) - dt) <= 0) {
      this.artT = 4;
      for (let i = 0; i < 6; i++) {
        const t = en.list[(Math.random() * en.list.length) | 0];
        const x = t ? t.x : p.x + rr(-8, 8), z = t ? t.z : p.z + rr(-8, 8);
        en.blast(x, z, 2.2 * st.areaMul, 45 * st.dmgMul, false, 0.25 + i * 0.12);
        fx.light([x, 3, z], [1, 0.6, 0.2], 3, 0.6, 0.25);
      }
      g.sfx.play('missile', { pitch: 0.7 });
    }
    // 검귀: 대시로 지나간 적을 벤다
    if (SS.has('blade') && p.dashT > 0) en.each(p.x, p.z, p.r + 1.4, (e) => {
      if (e.bladeId === p.dashId) return;
      e.bladeId = p.dashId;
      en.hit(e, 40 * st.dmgMul, p.dashDir[0], p.dashDir[1], 6, { stun: 0.3 });
      fx.hitSpark([e.x, 1, e.z], [1, 0.4, 0.85], 6);
      g.sfx.play('hit');
    });
    // 초월: 0.5초마다 근처 적에게 번개
    if (st.transcend && (this.zapT = (this.zapT ?? 0.5) - dt) <= 0) {
      this.zapT = 0.5;
      const near = []; en.each(p.x, p.z, 11, (e) => near.push(e));
      const t = near[(Math.random() * near.length) | 0];
      if (t) {
        en.hit(t, 50 * st.dmgMul, 0, 0, 3, { stun: 0.4 });
        // 하늘에서 지그재그로 떨어지는 번개
        let x = t.x + rr(-0.6, 0.6), z = t.z + rr(-0.6, 0.6);
        for (let y = 9; y > 0; y -= 0.45) { x += rr(-0.35, 0.35); z += rr(-0.35, 0.35); fx.trail.emit({ position: [x, y, z], velocity: [0, 0, 0], life: 0.14, size: 3, sizeEnd: 2, color: [1, 1, 1], colorEnd: [0.5, 0.8, 1], emissive: 1, gravity: 0 }); }
        fx.light([t.x, 2, t.z], [0.6, 0.85, 1], 5, 1.4, 0.12);
        fx.ring(t.x, 0.12, t.z, 1.6, [0.6, 0.85, 1], 0.2);
        g.sfx.play('beam', { vol: 0.35, pitch: 1.6 });
      }
    }
  }

  // 탄피: 옆으로 튀어 바닥에 떨어진다
  casing(mz, yaw, side = 1, big = false) {
    const fx = this.game.fx, sx = Math.cos(yaw) * side, sz = -Math.sin(yaw) * side;
    fx.sparks.emit({ position: [mz[0] - Math.sin(yaw) * 0.4, mz[1] + 0.05, mz[2] - Math.cos(yaw) * 0.4], velocity: [sx * rr(2, 4) - Math.sin(yaw), rr(2.5, 4), sz * rr(2, 4) - Math.cos(yaw)], life: rr(0.35, 0.55), size: big ? 3 : 2, sizeEnd: big ? 2 : 1, color: big ? [0.9, 0.25, 0.2] : [1, 0.85, 0.4], colorEnd: big ? [0.6, 0.15, 0.1] : [0.8, 0.6, 0.2], emissive: 0.4, gravity: 2.2 });
  }

  beam(mz, yaw, len, width, D, color, launch = 0) {
    const g = this.game, en = g.enemies, fx = g.fx, st = g.player.stats;
    const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
    const hitList = [];
    en.each(mz[0] + dir[0] * len / 2, mz[2] + dir[2] * len / 2, len / 2 + 1, (e) => {
      const rx = e.x - mz[0], rz = e.z - mz[2], t = rx * dir[0] + rz * dir[2];
      if (t < -0.5 || t > len) return;
      if (Math.abs(rx * dir[2] - rz * dir[0]) < width / 2 + e.r) hitList.push(e);
    });
    for (const e of hitList) { const c = Math.random() < st.crit; en.hit(e, c ? D * 2 : D, dir[0], dir[2], 6 + launch, { crit: c, launch }); }
    g.shots.beam(mz, yaw, len, width, color);
    g.sfx.play('beam', { pitch: width > 2 ? 0.7 : 1 });
    fx.light(mz, color, 5, 1.3, 0.25);
    fx.light([mz[0] + dir[0] * len * 0.5, 1, mz[2] + dir[2] * len * 0.5], color, 6, 0.9, 0.25);
    for (let k = 0; k < 18; k++) {
      const t = Math.random() * len;
      fx.sparks.emit({ position: [mz[0] + dir[0] * t, mz[1], mz[2] + dir[2] * t], velocity: [rr(-2, 2), rr(1, 4), rr(-2, 2)], life: rr(0.2, 0.45), size: 2, sizeEnd: 1, color: [0.9, 1, 1], colorEnd: [0.3, 0.7, 1], emissive: 1, gravity: 0.3 });
    }
    fx.addTrauma(0.15);
    if (hitList.length >= 3) g.hitStop(0.035);
  }

  // ---------- 특수기 ----------
  special() {
    const g = this.game, p = g.player, en = g.enemies, fx = g.fx, st = p.stats;
    const kind = this.primaryKind, w = this.primary;
    this.specialT = st.specialCd;
    const yaw = p.attackYaw(14);
    p.lookAt(yaw, 0.6);
    fx.light([p.x, 1.6, p.z], [1, 0.9, 0.6], 4, 1, 0.2);
    if (kind === 'mg') {
      this.barrage = 1.1; this.barrageYaw = yaw; this.barrageT = 0;
    } else if (kind === 'shotgun') {
      const L = lvOf(w), D = L.dmg * 4 * st.dmgMul;
      const mz = p.mech.muzzle('armR');
      en.each(p.x + Math.sin(yaw) * 3, p.z + Math.cos(yaw) * 3, 4.2 * st.areaMul, (e) => {
        const a = Math.atan2(e.x - p.x, e.z - p.z);
        if (Math.abs(((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.9) return;
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, (e.x - p.x) / d, (e.z - p.z) / d, 22, { launch: 8, stun: 0.6 });
      });
      fx.explosion(mz[0] + Math.sin(yaw) * 2, 0.8, mz[2] + Math.cos(yaw) * 2, 1.2, { scorch: false, color: [1, 0.6, 0.25] });
      p.kick(-Math.sin(yaw) * 12, -Math.cos(yaw) * 12);
      g.hitStop(0.08);
      g.sfx.play('bigboom', { vol: 0.7 });
    } else if (kind === 'laser') {
      const L = lvOf(w);
      this.beam(p.mech.muzzle('armR'), yaw, 26, 2.4 * st.areaMul, L.dmg * 3 * st.dmgMul, [1, 0.5, 1], 5);
      p.kick(-Math.sin(yaw) * 10, -Math.cos(yaw) * 10);
      fx.addTrauma(0.5); g.hitStop(0.1);
    } else {
      // 회전 베기 / 로켓 펀치: 주변 360° 를 크게 쓸어 띄운다
      const L = w ? lvOf(w) : FIST;
      const radius = (L.radius + 1.6) * st.areaMul, D = L.dmg * 2.6 * st.dmgMul;
      en.each(p.x, p.z, radius, (e) => {
        const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
        en.hit(e, D, (e.x - p.x) / d, (e.z - p.z) / d, 18, { launch: 10, stun: 0.7 });
      });
      const sw = { swing: 0, swingYaw: yaw + Math.PI, swingArc: 6.28, swingR: radius, dir: 1, slot: 'armR', fist: !w, fin: true, T: 0.3 };
      if (w) Object.assign(w, sw); else this.fistSwing = sw;
      fx.ring(p.x, 0.15, p.z, radius, w ? [1, 0.5, 0.85] : [1, 0.75, 0.4], 0.35);
      g.sfx.play('swing', { pitch: 0.7 }); g.sfx.play('hit', { pitch: 0.7 });
      fx.addTrauma(0.35); g.hitStop(0.09);
    }
  }
  updateBarrage(dt) {
    const g = this.game, p = g.player, w = this.primary;
    this.barrage -= dt; this.barrageT -= dt;
    if (!w) { this.barrage = 0; return; }
    p.attackSlow = 0.1;
    if (this.barrageT <= 0) {
      this.barrageT = 0.05;
      const L = lvOf(w);
      const mz = p.mech.muzzle('armR');
      for (let k = -2; k <= 2; k++) {
        const a = this.barrageYaw + k * 0.16 + rr(-0.05, 0.05);
        g.shots.add({ x: mz[0], y: mz[1], z: mz[2], vx: Math.sin(a) * 30, vz: Math.cos(a) * 30, dmg: L.dmg * 1.2 * p.stats.dmgMul, life: 0.6, pierce: 1, color: [1, 0.9, 0.4], scale: [0.16, 0.16, 0.9], knock: 3, quiet: true });
      }
      g.fx.muzzle(mz, [Math.sin(this.barrageYaw), 0, Math.cos(this.barrageYaw)], [1, 0.8, 0.3], 2);
      p.lookAt(this.barrageYaw, 0.2);
    }
  }

  // 베기 연출: 팔을 휘두르고 호를 따라 발광 점을 뿌린다
  animSwing(w, dt) {
    const g = this.game, p = g.player, fx = g.fx;
    const T = w.T || (w.fin ? 0.2 : 0.14);
    const k0 = w.swing / T;
    w.swing += dt;
    const k1 = Math.min(1, w.swing / T);
    const si = p.mech.slotInfo[w.slot];
    if (k0 >= 1) { if (si) { const b = w.evo ? 1.45 : 1; si.inner.rotation[1] = 0; si.inner.scale = [b, b, b]; } w.swing = undefined; if (w.fist) this.fistSwing = null; return; }
    // 처음엔 빠르게, 끝에서 감속 (휘두르는 손맛)
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    const a0 = w.swingYaw - (w.swingArc / 2) * w.dir;
    const aNow = a0 + w.swingArc * w.dir * ease(k1);
    const moved = Math.abs(ease(k1) - ease(Math.max(0, k0))) * w.swingArc;
    // 칼날 궤적: 현재 칼끝까지의 꼬리 (최대 1.7rad)
    const span = Math.min(w.swingArc * ease(k1), w.fist ? 1.1 : 1.7) + 0.05;
    const col = w.fist ? [1, 0.6, 0.2] : w.evo ? [0.7, 0.4, 1] : [1, 0.3, 0.75];
    const sz = p.size || 1;
    if (moved > 0.01 || k0 <= 0) this.smear(p.x, 1.05 * sz, p.z, aNow, w.swingR * (w.fist ? 0.85 : 1), span, w.dir, col, w.fin ? 0.55 : w.fist ? 0.35 : 0.42, w.fin ? 0.16 : 0.11);
    // 칼끝 불꽃 몇 개
    if (!w.fist && Math.random() < 0.7) fx.sparks.emit({ position: [p.x + Math.sin(aNow) * w.swingR, 1.05 * sz, p.z + Math.cos(aNow) * w.swingR], velocity: [Math.sin(aNow + w.dir * 1.57) * 4, 1.5, Math.cos(aNow + w.dir * 1.57) * 4], life: 0.2, size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: col, emissive: 1, gravity: 0.5 });
    // 상체가 칼을 따라 비틀림
    p.aimYaw = aNow; p.aimGoal = aNow; p.aimHold = 0.12;
    if (si && !w.fist) {
      si.inner.rotation[1] = aNow - p.mech.upper.rotation[1] - p.yaw;
      const b = w.evo ? 1.45 : 1; si.inner.scale = [b, b, b * 1.6];
    }
  }

  // ---------- 자동 무기 (어깨/등) ----------
  auto(dt) {
    const g = this.game, p = g.player, en = g.enemies;
    for (const w of this.list) {
      if (w.slot.startsWith('arm') || w.id === 'funnel' || w.cd > 0) continue;
      const W = WEAPONS[w.id];
      const mz = p.mech.muzzle(w.slot);
      const target = en.nearest(p.x, p.z, W.range * p.stats.rangeMul);
      if (!target) continue;
      if (w.id === 'saber') { w.cd = 0.5; continue; }
      this.fire(w, Math.atan2(target.x - mz[0], target.z - mz[2]), 0.85);
    }
  }

  // 판넬 비트
  syncBits() {
    const g = this.game, w = this.get('funnel');
    const n = w ? lvOf(w).bits + (g.player.stats?.sets?.has('hive') ? 4 : 0) : 0;
    while (this.bits.length > n) g.scene.remove(this.bits.pop().mesh);
    const P = g.player.mech?.paint;
    while (this.bits.length < n && P) {
      const mesh = g.scene.add(new Mesh(funnelBitGeo(P), new Material()));
      this.bits.push({ mesh, cd: R(), x: g.player.x, y: 2, z: g.player.z });
    }
  }
  updateBits(dt) {
    const g = this.game, p = g.player, fx = g.fx, w = this.get('funnel');
    if (!w || !this.bits.length) return;
    const L = lvOf(w);
    this.bitT += dt;
    this.bits.forEach((b, i) => {
      const a = this.bitT * 1.6 + (i / this.bits.length) * Math.PI * 2;
      const tx = p.x + Math.sin(a) * 1.9, tz = p.z + Math.cos(a) * 1.9, ty = 2.3 + Math.sin(this.bitT * 3 + i) * 0.2;
      const k = 1 - Math.exp(-14 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.z += (tz - b.z) * k;
      b.cd -= dt * p.stats.rateMul;
      let yaw = a + Math.PI / 2;
      const t = g.enemies.nearest(b.x, b.z, WEAPONS.funnel.range);
      if (t) yaw = Math.atan2(t.x - b.x, t.z - b.z);
      if (t && b.cd <= 0) {
        b.cd = L.cd * rr(0.9, 1.1) * (p.stats.sets?.has('hive') ? 0.67 : 1);
        const c = R() < p.stats.crit, D = L.dmg * p.stats.dmgMul;
        const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
        g.shots.add({ x: b.x, y: b.y - 0.5, z: b.z, vx: (dx / d) * 34, vz: (dz / d) * 34, dmg: c ? D * 2 : D, crit: c, life: 0.5, color: [0.45, 1, 0.95], scale: [0.15, 0.15, 0.9], knock: 1.5, quiet: !c });
        fx.muzzle([b.x, b.y, b.z], [dx / d, 0, dz / d], [0.5, 1, 0.9], 1);
        g.sfx.play('mg', { vol: 0.35, pitch: 1.5 });
      }
      b.mesh.position = [b.x, b.y, b.z];
      b.mesh.rotation = [0.5, yaw, 0];
    });
  }
}
