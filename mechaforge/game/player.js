// 플레이어 메카: 능력치 계산, 이동/대시(무적), 조준 보조, 피격, 외형 재조립, 대시 잔상

import { Mesh, Material, Geometry, dampAngle } from '../engine/index.js';
import { LEGS, FRAMES, HEADS, buildMech, animateMech } from './parts.js';
import { WEAPONS, lvOf } from './weapons.js';

// 스탯 업그레이드 (외형 변화 없음 → 드론 튜닝 연출)
export const STAT_UPS = {
  power:   { name: '출력 증폭기', tag: 'POWER', max: 5, desc: '모든 무기 피해 +12%' },
  cooling: { name: '냉각 장치', tag: 'COOL', max: 5, desc: '발사, 휘두르기 속도 +8%' },
  servo:   { name: '고속 서보', tag: 'SERVO', max: 3, desc: '이동 속도 +7%' },
  frame:   { name: '강화 프레임', tag: 'FRAME', max: 5, desc: '최대 체력 +20, 즉시 회복 20' },
  focus:   { name: '조준 보정기', tag: 'CRIT', max: 3, desc: '치명타 확률 +6% (피해 2배)' },
  field:   { name: '확산 필드', tag: 'AREA', max: 3, desc: '폭발, 빔, 베기 범위 +12%' },
  chain:   { name: '연쇄 기폭 장치', tag: 'CHAIN', max: 4, desc: '처치한 적이 15% 확률로 폭발해 주변 적까지 날린다' },
};

// 변형 모드 (E / Tab 또는 모드 버튼으로 순환)
export const MODES = {
  walk:  { name: '보행 모드', tag: 'WALK', desc: '균형 잡힌 기본 형태' },
  fly:   { name: '비행 모드', tag: 'FLY', desc: '떠올라 빠르게 이동. 지상 적과 부딪혀도 다치지 않음. 피해 -15%' },
  snipe: { name: '저격 모드', tag: 'SNIPE', desc: '자세를 낮추고 정밀 사격. 피해 +60%, 치명 +20%, 사거리 +60%, 관통 +2. 이동 느림' },
  storm: { name: '섬멸 모드', tag: 'STORM', desc: '모든 무기 자동 난사. 연사 +50%, 범위 +25%. 받는 피해 +30%' },
};
export const MODE_ORDER = ['walk', 'fly', 'snipe', 'storm'];

export const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

export function computeStats(loadout, ups) {
  const L = LEGS[loadout.legs].stats, M = loadout.modules || {}, U = ups || {};
  const F = (FRAMES[loadout.frame] || FRAMES.standard).mods, H = (HEADS[loadout.head] || HEADS.vfin).mods;
  const lv = (k) => M[k] || 0, u = (k) => U[k] || 0;
  const mode = U._mode || 'walk', MF = mode === 'fly', MS = mode === 'snipe', MX = mode === 'storm';
  const SETS = new Set(loadout.sets || []), TR = loadout.transcend ? 1.3 : 1;
  return {
    maxHp: Math.round((L.maxHp + (F.hp || 0) + lv('armor') * 25 + u('frame') * 20 + u('_lv') * 4 + u('_mhp') * 12) * TR),
    speed: L.speed * (F.speedMul || 1) * (1 + lv('booster') * 0.1) * (1 + u('servo') * 0.07) * (u('_od') ? 1.15 : 1) * (MF ? 1.45 : MS ? 0.5 : MX ? 0.85 : 1) * (TR > 1 ? 1.15 : 1),
    accel: L.accel,
    armor: L.armor + (F.armor || 0) + lv('armor') + lv('spike'),
    dashCharges: L.dashCharges,
    dashCd: L.dashCd * (F.dashCdMul || 1) * (H.dashCdMul || 1) * (1 - lv('booster') * 0.15) * (MF ? 0.75 : 1),
    dashSpeed: L.dashSpeed || 25,
    knockResist: L.knockResist || 0,
    ram: (L.ram || 0) + lv('spike') * 30,
    dmgMul: (1 + (F.dmgMul || 0) + (H.dmgMul || 0) + u('power') * 0.12 + u('_lv') * 0.03 + u('_mdmg') * 0.06) * (u('_od') ? 1.5 : 1) * (MF ? 0.85 : MS ? 1.6 : 1) * TR,
    rateMul: (1 + lv('reactor') * 0.12) * (1 + u('cooling') * 0.08) * (u('_od') ? 1.8 : 1) * (MX ? 1.5 : 1) * TR,
    sets: SETS, transcend: TR > 1,
    rangeMul: MS ? 1.6 : 1, pierce: MS ? 2 : 0, dmgTaken: MX ? 1.3 : 1, autoFire: MX, flying: MF,
    chain: u('chain') * 0.15,
    areaMul: (1 + u('field') * 0.12) * (MX ? 1.25 : 1),
    crit: 0.08 + (F.crit || 0) + (H.crit || 0) + u('focus') * 0.06 + (MS ? 0.2 : 0) + (SETS.has('railgun') ? 0.3 : 0),
    magnet: 2.4 * (H.magnetMul || 1) * (1 + lv('antenna') * 0.45) * (1 + u('_mmag') * 0.2),
    xpMul: 1 + lv('antenna') * 0.1 + u('_mxp') * 0.08,
    shieldCd: lv('shield') ? [12, 9, 6][lv('shield') - 1] : 0,
    specialCd: 6.5 * (1 - lv('reactor') * 0.12) * (1 - u('cooling') * 0.04),
  };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.r = 0.65;
    this.ghosts = [];
    this.mech = null;
    this.mouseYaw = 0; this.mouseActive = false;
  }

  reset(loadout) {
    Object.assign(this, { x: 0, z: 0, vx: 0, vz: 0, ex: 0, ez: 0, yaw: Math.PI * 0.25, aimYaw: Math.PI * 0.25, aimGoal: Math.PI * 0.25, aimHold: 0, moveYaw: Math.PI * 0.25, moveMag: 0, attackSlow: 0 });
    this.loadout = loadout;
    this.ups = this.game.meta ? this.game.meta.ups() : {};
    this.revived = false;
    this.stats = computeStats(loadout, this.ups);
    this.hp = this.stats.maxHp;
    this.charges = this.stats.dashCharges; this.chargeT = 0;
    this.dashT = 0; this.dashId = 0; this.invuln = 0; this.hitFlash = 0; this.buildFlash = 0;
    this.shieldReady = !!this.stats.shieldCd; this.shieldT = 0;
    this.size = 1; this.od = 0; this.odT = 0; this.stompT = 0;
    this.anim = { phase: 0 };
    this.ghostT = 0;
    this.rebuild();
  }

  // 로드아웃이 바뀌면 다시 조립. hideKey: 장착 연출 동안 숨겨 둘 부품 (partKey)
  rebuild(flash = false, hideKey = null) {
    const sc = this.game.scene;
    const visible = this.mech ? this.mech.root.visible : true;
    if (this.mech) sc.remove(this.mech.root);
    this.mech = buildMech(this.loadout);
    this.upperY = this.mech.upper.position[1]; // 변형 움찔이 누적되지 않게 기준 높이 기억
    this.mech.root.visible = visible;
    sc.add(this.mech.root);
    this.hidden = [];
    if (hideKey) for (const m of [...this.mech.meshes, ...this.mech.glows]) if (m.partKey === hideKey) { m.visible = false; this.hidden.push(m); }
    this.place();
    for (const gh of this.ghosts) for (const m of gh.meshes) sc.remove(m);
    this.ghosts = [];
    const src = [...this.mech.meshes, ...this.mech.glows].filter((m) => !m.material.rim);
    for (let i = 0; i < 4; i++) {
      const meshes = src.map((s) => { const m = sc.add(new Mesh(s.geometry, new Material({ color: [0.35, 0.85, 1], emissive: 0.85, outline: false, castShadow: false, opacity: 0.5 }))); m.visible = false; m.matrix = new Float32Array(16); return m; });
      this.ghosts.push({ meshes, src, t: 1 });
    }
    if (flash) this.buildFlash = 0.45;
    this.refreshStats();
    this.game.weapons.syncBits();
    this.mech.root.updateWorld();
  }
  revealHidden() { for (const m of this.hidden || []) m.visible = true; this.hidden = []; }

  refreshStats() {
    const prevMax = this.stats.maxHp;
    this.stats = computeStats(this.loadout, this.ups);
    if (this.stats.maxHp > prevMax) this.hp += this.stats.maxHp - prevMax;
    this.hp = Math.min(this.hp, this.stats.maxHp);
    if (this.charges > this.stats.dashCharges) this.charges = this.stats.dashCharges;
    if (this.stats.shieldCd && !this.shieldReady && !this.shieldT) this.shieldReady = true;
  }

  place() {
    const k = this.size || 1;
    this.mech.root.position = [this.x, 0, this.z];
    this.mech.root.rotation = [0, this.yaw, 0];
    this.mech.root.scale = [k, k, k];
    this.r = 0.65 * Math.pow(k, 0.6);
    // 탄 판정은 몸집과 따로: 가운데 작은 코어만 (탄막 사이로 빠져나갈 수 있게)
    this.hit = 0.3 * Math.pow(k, 0.25);
  }

  // ---- 성장: 레벨이 오를수록 기체가 커진다 ----
  get baseSize() { return 1 + Math.min(0.85, (this.game.level - 1) * 0.04) + (this.loadout?.transcend ? 0.3 : 0); }
  get sizeGoal() { return this.baseSize + (this.odT > 0 ? 0.55 : 0); }

  // ---- 변형 모드 ----
  get mode() { return this.ups._mode || 'walk'; }
  switchMode(next) {
    const g = this.game, fx = g.fx;
    if (this.modeCd > 0 || g.state !== 'play') return;
    next = next || MODE_ORDER[(MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length];
    this.ups._mode = next; this.refreshStats();
    this.modeCd = 0.6; this.buildFlash = 0.3; this.transformT = 0.35;
    const col = { walk: [0.6, 0.9, 1], fly: [0.5, 0.8, 1], snipe: [1, 0.35, 0.35], storm: [1, 0.55, 0.15] }[next];
    fx.ring(this.x, 0.15, this.z, 2.8, col, 0.3);
    fx.light([this.x, 1.5, this.z], col, 5, 1, 0.25);
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28; fx.sparks.emit({ position: [this.x, 1.2 * this.size, this.z], velocity: [Math.cos(a) * 4, Math.random() * 4, Math.sin(a) * 4], life: 0.3, size: 2, sizeEnd: 1, color: [1, 1, 1], colorEnd: col, emissive: 1, gravity: 1 }); }
    g.sfx.play('clank'); g.sfx.play('tune', { vol: 0.6 });
    g.ui.toast(MODES[next].name);
  }
  // 모드별 자세 (애니메이션 뒤에 덧씌움)
  applyModePose(dt) {
    const m = this.mech, g = this.game, fx = g.fx, mode = this.mode, k = 1 - Math.exp(-10 * dt);
    this.mk = this.mk || { fly: 0, snipe: 0, storm: 0 };
    for (const key of ['fly', 'snipe', 'storm']) this.mk[key] += ((mode === key ? 1 : 0) - this.mk[key]) * k;
    this.modeCd = Math.max(0, (this.modeCd || 0) - dt);
    const F = this.mk.fly, S = this.mk.snipe, X = this.mk.storm;
    if (this.transformT > 0) this.transformT -= dt;
    // 비행: 떠오르고 다리를 접는다, 아래로 추진 화염
    if (F > 0.01) {
      m.body.position[1] += F * (1.1 + Math.sin(g.time * 3) * 0.08);
      for (const n of m.legNodes) n.rotation[0] = n.rotation[0] * (1 - F) - 0.85 * F;
      if (F > 0.5 && Math.random() < 0.8) fx.trail.emit({ position: [this.x + (Math.random() - 0.5) * 0.4, (0.9 + F * 0.3) * this.size, this.z + (Math.random() - 0.5) * 0.4], velocity: [0, -5, 0], life: 0.15, size: 3, sizeEnd: 1, color: [0.8, 1, 1], colorEnd: [0.2, 0.5, 1], emissive: 1, gravity: 0 });
    }
    // 저격: 자세를 낮추고 다리를 벌림 + 조준선
    m.legNodes.forEach((n, i) => { n.rotation[2] = (i % 2 ? -1 : 1) * 0.25 * S; });
    if (S > 0.01) m.body.position[1] -= S * 0.16;
    if (!this.sight) {
      this.sight = g.scene.add(new Mesh(Geometry.box(1, 1, 1, [1, 0.25, 0.25]), new Material({ emissive: 1, outline: false, castShadow: false, opacity: 0.6 })));
      this.sight.visible = false;
    }
    this.sight.visible = S > 0.6 && g.state === 'play';
    if (this.sight.visible) {
      const mz = m.muzzle('armR'), len = 18 * this.stats.rangeMul, yaw = this.attackYaw(len);
      this.sight.position = [mz[0] + Math.sin(yaw) * len / 2, mz[1] - 0.02, mz[2] + Math.cos(yaw) * len / 2];
      this.sight.rotation = [0, yaw, 0]; this.sight.scale = [0.04, 0.04, len];
      this.sight.material.opacity = 0.35 + 0.2 * Math.sin(g.time * 10);
    }
    // 섬멸: 등에서 붉은 열기
    if (X > 0.5 && Math.random() < 0.5) fx.sparks.emit({ position: [this.x - Math.sin(this.yaw) * 0.4 * this.size, 1.5 * this.size, this.z - Math.cos(this.yaw) * 0.4 * this.size], velocity: [(Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2], life: 0.35, size: 2, sizeEnd: 1, color: [1, 0.8, 0.3], colorEnd: [1, 0.2, 0.1], emissive: 1, gravity: -0.3 });
    // 변형 순간: 몸이 살짝 움찔
    if (this.transformT > 0) { const t = this.transformT / 0.35; m.upper.position[1] += Math.sin(t * Math.PI) * 0.12; }
  }

  // ---- 조준 가이드: 주무장이 실제로 닿는 범위를 바닥에 그린다 ----
  //  부채꼴 무기(화염, 베기, 채찍) = 양쪽 테두리 + 끝 호, 총/빔 = 화살표 한 줄. 쏘는 중엔 더 밝게
  updateAimGuide() {
    const g = this.game, st = this.stats;
    if (!this.guide) {
      this.guide = [];
      for (let i = 0; i < 14; i++) { const m = g.scene.add(new Mesh(Geometry.box(1, 1, 1, [1, 1, 1]), new Material({ emissive: 1, outline: false, castShadow: false }))); m.visible = false; this.guide.push(m); }
    }
    let n = 0;
    const bar = (x0, z0, x1, z1, w, col, op) => {
      const m = this.guide[n++]; if (!m) return;
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
      m.position = [(x0 + x1) / 2, 0.08, (z0 + z1) / 2]; m.rotation = [0, Math.atan2(dx, dz), 0]; m.scale = [w, 0.03, len];
      m.material.color = col.map((c) => c * op); m.visible = true; // 반투명은 디더링으로 점선이 돼서 밝기로 조절
    };
    const show = g.state === 'play' && this.mode !== 'snipe'; // 저격 모드는 자체 조준선
    const w = g.weapons.primary;
    if (show) {
      const L = w ? lvOf(w) : null, W = w ? WEAPONS[w.id] : null;
      const yaw = this.attackYaw(W ? W.range * st.rangeMul : 4);
      const firing = g.ctl?.attack || g.weapons.swingLock > 0;
      const col = this.mouseActive ? [1, 0.6, 0.15] : [0.5, 0.9, 1], op = firing ? 1.1 : 0.6;
      const x = this.x, z = this.z, r0 = this.r + 0.3;
      let reach, half;
      if (!w) { reach = 1.9 * st.areaMul; half = 0.95; }                                       // 주먹
      else if (L.cone) { reach = W.range * st.rangeMul * (L.far || 1); half = (L.cone * st.areaMul) / 2; } // 화염
      else if (L.arc && L.reach) { reach = L.reach * st.rangeMul; half = L.arc / 2; }          // 채찍
      else if (L.arc) { reach = L.radius * st.areaMul; half = Math.min(3.1, L.arc / 2); }      // 사벨
      if (reach) {
        const pt = (a, r) => [x + Math.sin(a) * r, z + Math.cos(a) * r];
        for (const s of [-1, 1]) { const a = pt(yaw + s * half, r0), b = pt(yaw + s * half, reach); bar(a[0], a[1], b[0], b[1], 0.16, col, op); }
        const seg = Math.max(3, Math.min(10, Math.round(half * 4)));
        for (let i = 0; i < seg; i++) { const a = pt(yaw - half + (2 * half * i) / seg, reach), b = pt(yaw - half + (2 * half * (i + 1)) / seg, reach); bar(a[0], a[1], b[0], b[1], 0.16, col, op); }
      } else {
        // 총/빔: 6칸까지 가는 화살표
        const len = Math.min(6, W.range * st.rangeMul), [ex, ez] = [x + Math.sin(yaw) * len, z + Math.cos(yaw) * len];
        bar(x + Math.sin(yaw) * r0, z + Math.cos(yaw) * r0, ex, ez, 0.12, col, op);
        for (const s of [-1, 1]) bar(ex, ez, ex - Math.sin(yaw + s * 0.5) * 0.7, ez - Math.cos(yaw + s * 0.5) * 0.7, 0.16, col, op);
      }
    }
    for (let i = n; i < this.guide.length; i++) this.guide[i].visible = false;
  }

  // ---- 오버드라이브 ----
  addOd(v) { if (this.odT > 0) return; const was = this.od >= 1; this.od = Math.min(1, this.od + v * (1 + (this.ups._mod || 0) * 0.15)); if (!was && this.od >= 1) { this.game.ui.toast('오버드라이브 준비 완료!'); this.game.sfx.play('ready'); } }
  overdrive() {
    const g = this.game, fx = g.fx;
    if (this.od < 1 || this.odT > 0) return false;
    this.od = 0; this.odT = 8;
    this.ups._od = 1; this.refreshStats();
    this.invuln = Math.max(this.invuln, 0.8);
    g.enemies.blast(this.x, this.z, 6.5 * this.stats.areaMul, 60 * this.stats.dmgMul, false, 0.12);
    fx.light([this.x, 2, this.z], [1, 0.6, 0.25], 5, 1, 0.22);
    fx.addTrauma(0.5); g.hitStop(0.12);
    return true;
  }
  updateOverdrive(dt) {
    const g = this.game, fx = g.fx;
    if (this.odT <= 0) return;
    this.odT -= dt;
    // 발 구르기: 주변을 주기적으로 날린다
    this.stompT -= dt;
    if (this.stompT <= 0) {
      this.stompT = 0.45;
      const R = 3.2 * this.size * this.stats.areaMul;
      g.enemies.each(this.x, this.z, R, (e) => { const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz) || 1; g.enemies.hit(e, 22 * this.stats.dmgMul, dx / d, dz / d, 10, { noNum: true, launch: 4 }); });
      fx.ring(this.x, 0.12, this.z, R, [1, 0.55, 0.2], 0.25);
      fx.dust(this.x, this.z, 3);
      fx.addTrauma(0.04);
    }
    if (Math.random() < 0.8) fx.trail.emit({ position: [this.x + (Math.random() - 0.5) * 1.6 * this.size, Math.random() * 2.5 * this.size, this.z + (Math.random() - 0.5) * 1.6 * this.size], velocity: [0, 3, 0], life: 0.4, size: 3, sizeEnd: 1, color: [1, 0.85, 0.4], colorEnd: [1, 0.3, 0.1], emissive: 1, gravity: 0 });
    if (this.odT <= 0) { this.odT = 0; this.ups._od = 0; this.refreshStats(); g.ui.toast('오버드라이브 종료'); }
  }

  lookAt(yaw, hold = 0.45) { this.aimGoal = yaw; this.aimHold = hold; }
  kick(x, z) { this.ex += x; this.ez += z; }
  // 공격하며 앞으로 내딛기 (하데스식 전진 베기)
  lunge(yaw, power) { this.ex += Math.sin(yaw) * power; this.ez += Math.cos(yaw) * power; this.yaw = yaw; }
  heal(v) {
    const before = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + v);
    if (this.hp - before >= 1) this.game.fx.number([this.x, 2.2, this.z], this.hp - before, { color: [0.4, 1, 0.5] });
  }

  // 공격 방향: 마우스 > 조준 보조(앞쪽 부채꼴 안의 적) > 바라보는 방향
  attackYaw(range = 12) {
    const g = this.game;
    if (this.mouseActive) return this.mouseYaw;
    const base = this.moveMag > 0.2 ? this.moveYaw : this.yaw;
    const cone = 1.25;
    let best = null, bs = 1e9;
    const consider = (e, r) => {
      const dx = e.x - this.x, dz = e.z - this.z, d = Math.hypot(dx, dz) - r;
      if (d > range) return;
      const a = Math.atan2(dx, dz), da = Math.abs(angDiff(a, base));
      if (da > cone && d > 4.5) return;
      const s = d * (1 + da * 1.5);
      if (s < bs) { bs = s; best = a; }
    };
    for (const e of g.enemies.list) if (e.spawnT > 0.2 && !e.dead) consider(e, e.r);
    const B = g.enemies.boss;
    if (B && B.y < 3) consider(B, B.r);
    return best ?? base;
  }

  hurt(dmg, dx, dz) {
    const g = this.game;
    if (this.invuln > 0 || this.dashT > 0 || g.state !== 'play') return false;
    const fx = g.fx;
    if (this.shieldReady) {
      this.shieldReady = false; this.shieldT = this.stats.shieldCd;
      this.invuln = 0.6;
      fx.ring(this.x, 1.2, this.z, 2.6, [0.5, 0.9, 1], 0.3);
      fx.light([this.x, 1.5, this.z], [0.5, 0.9, 1], 5, 1, 0.3);
      fx.hitSpark([this.x, 1.4, this.z], [0.5, 0.9, 1], 10);
      g.ui.toast('실드가 공격을 막았다'); g.sfx.play('shield');
      return true;
    }
    const d = Math.max(1, Math.round((dmg - this.stats.armor) * (this.odT > 0 ? 0.35 : 1) * (this.stats.dmgTaken || 1)));
    g.stats.taken += Math.min(d, this.hp);
    this.hp -= d;
    this.invuln = 1.0; this.hitFlash = 0.18;
    const l = Math.hypot(dx, dz) || 1, kr = 1 - this.stats.knockResist;
    this.kick((dx / l) * 9 * kr, (dz / l) * 9 * kr);
    fx.number([this.x, 2.4, this.z], d, { color: [1, 0.3, 0.3], big: true });
    g.sfx.play('hurt');
    fx.hitSpark([this.x, 1.3, this.z], [1, 0.4, 0.3], 8);
    // 내가 맞은 건 확실하게: 붉은 8갈래 섬광 + 충격 고리
    fx.flare([this.x, 1.3 * (this.size || 1), this.z], 'star8', [1, 0.25, 0.2], 3.2, 0.25, { spin: 3 });
    fx.ring(this.x, 0.15, this.z, 2.2, [1, 0.3, 0.25], 0.25);
    fx.addTrauma(0.45);
    g.hitStop(0.07);
    g.ui.hurtFlash();
    if (this.hp <= 0 && !this.revived && g.meta.level('revive')) {
      // 비상 재기동: 런마다 한 번
      this.revived = true; this.hp = Math.round(this.stats.maxHp * 0.4); this.invuln = 2.5;
      g.enemies.blast(this.x, this.z, 6, 80 * this.stats.dmgMul, false, 0.05);
      g.ui.banner('비상 재기동!'); g.sfx.play('overdrive'); g.slowMo(0.8);
    }
    if (this.hp <= 0) { this.hp = 0; g.gameOver(); }
    return true;
  }

  update(dt, input, ctl) {
    const g = this.game, st = this.stats, fx = g.fx, cam = g.engine.camera;
    const ax = input.axis();
    const dir = g.botAxis ? [g.botAxis.x, 0, g.botAxis.z] : cam.groundDirection(ax.x, ax.y); // botAxis: 밸런스 시뮬용
    const mag = Math.hypot(dir[0], dir[2]);
    this.moveMag = mag;
    if (mag > 0.2) this.moveYaw = Math.atan2(dir[0], dir[2]);
    const legs = this.loadout.legs, anim = LEGS[legs]?.anim || 'walk'; // walk/roll/hover/wheel/jet

    // ---- 대시 ----
    if (ctl.dash && this.charges > 0 && this.dashT <= 0) {
      let dx = dir[0], dz = dir[2];
      if (mag < 0.2) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); }
      const l = Math.hypot(dx, dz) || 1;
      this.dashDir = [dx / l, dz / l];
      this.dashT = 0.17; this.dashId++; this.game.sfx.play('dash');
      this.invuln = Math.max(this.invuln, 0.3);
      this.charges--;
      this.yaw = Math.atan2(dx, dz);
      fx.ring(this.x, 0.12, this.z, 1.6, [0.5, 0.9, 1], 0.22);
      for (let i = 0; i < 5; i++) fx.dust(this.x, this.z, 1);
      fx.light([this.x, 0.8, this.z], [0.4, 0.8, 1], 3.5, 0.7, 0.15);
      // 출발: 뒤쪽으로 추진 화염이 확 터진다
      const sz0 = this.size || 1;
      for (let i = 0; i < 16; i++) { const sp = 6 + Math.random() * 8, sx = (Math.random() - 0.5) * 3; fx.trail.emit({ position: [this.x - this.dashDir[0] * 0.5 * sz0, 0.9 * sz0, this.z - this.dashDir[1] * 0.5 * sz0], velocity: [-this.dashDir[0] * sp + this.dashDir[1] * sx, Math.random() * 2, -this.dashDir[1] * sp - this.dashDir[0] * sx], life: 0.18 + Math.random() * 0.15, size: 3 + Math.random() * 3, sizeEnd: 1, color: [1, 0.95, 0.7], colorEnd: [1, 0.4, 0.1], emissive: 1, gravity: 0 }); }
      // 속도선: 진행 반대 방향으로 가는 줄기 + 출발점 십자 섬광
      fx.flare([this.x, 0.9 * sz0, this.z], 'star4', [0.6, 0.95, 1], 1.6 * sz0, 0.14);
      fx.streaks([this.x, 0.9 * sz0, this.z], 8, [0.55, 0.9, 1], { dir: [-this.dashDir[0], -this.dashDir[1]], spread: 0.7, speed: [14, 24], len: 0.9, life: 0.2, up: 0.15, width: 0.8 });
      this.dashLean = 1;
      this.ghostT = 0;
      g.weapons.cancelCombo?.();
    }
    if (this.charges < st.dashCharges) { this.chargeT += dt; if (this.chargeT >= st.dashCd) { this.charges++; this.chargeT = 0; } }
    else this.chargeT = 0;

    this.attackSlow = Math.max(0, this.attackSlow - dt);
    const speed = st.speed * (this.attackSlow > 0 ? 0.45 : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = st.dashSpeed;
      this.vx = this.dashDir[0] * sp; this.vz = this.dashDir[1] * sp;
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.035; this.snapGhost(); }
      const szd = this.size || 1;
      for (let i = 0; i < 3; i++) fx.trail.emit({ position: [this.x - this.dashDir[0] * 0.45 * szd + (Math.random() - 0.5) * 0.3, (1.1 + Math.random() * 0.3) * szd, this.z - this.dashDir[1] * 0.45 * szd + (Math.random() - 0.5) * 0.3], velocity: [-this.dashDir[0] * 7, 0.3, -this.dashDir[1] * 7], life: 0.16, size: 4, sizeEnd: 1, color: [0.8, 1, 1], colorEnd: [0.2, 0.5, 1], emissive: 1, gravity: 0 });
      if (this.dashT <= 0) {
        this.vx = this.dashDir[0] * st.speed * 0.6; this.vz = this.dashDir[1] * st.speed * 0.6;
        for (let i = 0; i < 6; i++) fx.dust(this.x + this.dashDir[0] * 0.4, this.z + this.dashDir[1] * 0.4, 1); // 브레이크 먼지
      }
    } else {
      const k = 1 - Math.exp(-st.accel * dt);
      this.vx += (dir[0] * speed - this.vx) * k;
      this.vz += (dir[2] * speed - this.vz) * k;
    }
    this.x += (this.vx + this.ex) * dt; this.z += (this.vz + this.ez) * dt;
    const ek = Math.exp(-9 * dt);
    this.ex *= ek; this.ez *= ek;
    g.rooms.clamp(this, this.r, true);

    // ---- 방향: 하체는 이동 방향, 상체는 조준 방향 ----
    const spd = Math.hypot(this.vx, this.vz);
    if (mag > 0.2 && this.dashT <= 0 && this.attackSlow <= 0) this.yaw = dampAngle(this.yaw, this.moveYaw, anim === 'roll' ? 7 : anim === 'wheel' ? 10 : 16, dt);
    this.aimHold -= dt;
    if (this.aimHold <= 0) {
      if (this.mouseActive) this.aimGoal = this.mouseYaw;
      else if (mag > 0.2) this.aimGoal = this.moveYaw;
      else this.aimGoal = this.yaw;
    }
    this.aimYaw = dampAngle(this.aimYaw, this.aimGoal, 24, dt);

    // ---- 타이머 ----
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.buildFlash = Math.max(0, this.buildFlash - dt);
    if (st.shieldCd && !this.shieldReady) { this.shieldT -= dt; if (this.shieldT <= 0) { this.shieldReady = true; this.shieldT = 0; fx.ring(this.x, 1.2, this.z, 1.8, [0.5, 0.9, 1], 0.25); } }

    // ---- 이동 이펙트 ----
    const moveK = Math.min(1, spd / st.speed);
    // 제트: 등 아래로 추진 화염
    if (anim === 'jet' && Math.random() < 0.7) fx.trail.emit({ position: [this.x - Math.sin(this.yaw) * 0.5 * this.size + (Math.random() - 0.5) * 0.3, 0.5 * this.size, this.z - Math.cos(this.yaw) * 0.5 * this.size + (Math.random() - 0.5) * 0.3], velocity: [-Math.sin(this.yaw) * 4, -1.5, -Math.cos(this.yaw) * 4], life: 0.18, size: 3, sizeEnd: 1, color: [1, 0.9, 0.6], colorEnd: [1, 0.4, 0.15], emissive: 1, gravity: 0 });
    if (anim === 'hover' && Math.random() < 0.6) fx.trail.emit({ position: [this.x + (Math.random() - 0.5) * 0.8, 0.15, this.z + (Math.random() - 0.5) * 0.8], velocity: [-this.vx * 0.2, 0.2, -this.vz * 0.2], life: 0.25, size: 2, sizeEnd: 1, color: [0.6, 0.95, 1], colorEnd: [0.2, 0.5, 1], emissive: 1, gravity: 0 });
    if ((anim === 'roll' || anim === 'wheel') && moveK > 0.3 && Math.random() < 0.35) fx.dust(this.x - Math.sin(this.yaw) * 0.7, this.z - Math.cos(this.yaw) * 0.7, 1);
    const prevPhase = this.anim.phase;
    this.animate(dt, moveK);
    if (anim === 'walk' && Math.floor(prevPhase / Math.PI) !== Math.floor(this.anim.phase / Math.PI) && moveK > 0.3) fx.dust(this.x, this.z, 2);
    this.updateOverdrive(dt);
    this.updateGhosts(dt);
  }

  animate(dt, moveK) {
    const m = this.mech, g = this.game;
    if (g.state !== 'hangar') this.size += (this.sizeGoal - this.size) * Math.min(1, dt * 3); else this.size = 1;
    this.place();
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fwd = (this.vx * s + this.vz * c) / 10, side = (this.vx * c - this.vz * s) / 10;
    animateMech(m, this.anim, { move: moveK, dt, t: g.time, legs: this.loadout.legs, aimRel: this.aimYaw - this.yaw, lean: [fwd * 0.25, side * 0.25] });
    // 대시: 앞으로 확 숙였다가 복귀 / 사격 반동: 상체가 뒤로 젖혀짐
    this.dashLean = Math.max(0, (this.dashLean || 0) - dt * 4);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 5);
    m.body.rotation[0] += this.dashLean * 0.55;
    m.upper.rotation[0] = -this.recoil * 0.5;
    m.upper.position[1] = this.upperY;
    m.upper.position[2] = -this.recoil * 0.12;
    this.applyModePose?.(dt);
    this.updateAimGuide();
    for (const w of g.weapons.list) {
      const si = m.slotInfo[w.slot];
      if (!si) continue;
      if (w.id !== 'saber') si.inner.position[2] = -(w.kick || 0) * 0.5;
      // 쏜 순간: 그 무기의 발광 부분이 번쩍 + 살짝 커졌다 돌아온다 (어느 무기가 쐈는지 기체에서 보이게)
      const ft = g.time - (w.fireT ?? -9), fl = ft < 0.1;
      if (si.blade && w.id !== 'saber') si.blade.material.color = fl ? [2.2, 2.2, 2.2] : [1, 1, 1];
      if (w.id !== 'saber' && w.id !== 'rod' && w.swing === undefined && si.base) { const b = si.base * (1 + Math.max(0, 0.12 - ft) * 1.6); si.inner.scale = [b, b, b]; }
    }
    const blink = this.invuln > 0 && this.hitFlash <= 0 && Math.floor(g.engine.time * 20) % 2 === 0;
    const hf = this.hitFlash > 0, bf = this.buildFlash > 0;
    for (const mesh of m.meshes) {
      const od = this.odT > 0 ? 0.1 + 0.08 * Math.sin(g.engine.time * 12) : 0;
      const hw = this.hitFlash > 0.11;
      mesh.material.color = hw ? [2.4, 2.4, 2.4] : hf ? [2.2, 0.45, 0.4] : bf ? [0.9 + this.buildFlash * 3, 1.2 + this.buildFlash * 3, 2 + this.buildFlash * 2] : od ? [1 + od * 2, 1 + od, 1 - od] : [1, 1, 1];
      mesh.material.emissive = hf ? 1 : bf ? this.buildFlash * 1.5 : od;
      mesh.material.opacity = blink ? 0.3 : 1;
    }
    for (const gl of m.glows) gl.material.color = [1, 1, 1].map((v) => v * (0.85 + Math.random() * 0.3));
    if (m.bubble) {
      m.bubble.visible = this.shieldReady;
      m.bubble.material.rim = 0.7 + Math.sin(g.engine.time * 4) * 0.2;
    }
    m.root.updateWorld();
  }

  snapGhost() {
    const gh = this.ghosts.reduce((a, b) => (a.t > b.t ? a : b));
    gh.t = 0;
    gh.meshes.forEach((m, i) => { m.matrix.set(gh.src[i].world); m.visible = gh.src[i].visible; });
  }
  updateGhosts(dt) {
    for (const gh of this.ghosts) {
      if (gh.t >= 1) continue;
      gh.t += dt / 0.28;
      const vis = gh.t < 1;
      for (const m of gh.meshes) { if (!vis) m.visible = false; m.material.opacity = 0.55 * (1 - gh.t); }
    }
  }
}
