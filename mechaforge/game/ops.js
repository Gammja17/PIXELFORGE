// 방 작전: 같은 전투 방이라도 작전마다 규칙과 목표가 다르다 (rooms.js 가 부른다)
//
//  survive  방어선     제한 시간 버티기. 대규모 접근, 정예, 중간 보스 (예전 기본 방식). 특수 방(정전, 수축)은 여기만
//  horde    섬멸전     목표 수만큼 처치. 떼거리만 쏟아지고, 처치하면 연쇄 폭발 확률 +20%
//  control  거점 장악  거점 3곳을 차례로 점령. 원 안에 서 있으면 게이지가 찬다 (원 안에 적이 많으면 느려짐)
//  sabotage 파괴 공작  적을 불러내는 전송 비콘을 전부 부수면 끝. 비콘이 남아 있는 한 적이 계속 나온다
//  duel     정예 결투  떼거리 없이 정예 기체가 차례로 나온다. 깊으면 마지막에 중간 보스
//  raid     수송선 습격 황금 수송 드론이 도망 다닌다. 제한 시간 안에 잡은 만큼 보상
//
//  각 작전: begin(R) 시작, update(R, dt) → true 면 전투 끝, info(R) → [진행도 0~1, 문구]

import { Geometry } from '../engine/index.js';

const TAU = Math.PI * 2;
const add = (g, part, position = [0, 0, 0], rotation = [0, 0, 0]) => g.merge(part, { position, rotation });

export const OPS = {
  survive:  { name: '방어선', color: '#8fd3ff', short: '시간 동안 버티기', banner: '방어선! 시간이 다 될 때까지 버텨라' },
  horde:    { name: '섬멸전', color: '#ff8a4a', short: '떼거리 쓸어버리기', banner: '섬멸전! 몰려오는 떼거리를 전부 쓸어버려라' },
  control:  { name: '거점 장악', color: '#5effc8', short: '거점 3곳 점령', banner: '거점 장악! 빛나는 원 안에 서서 거점을 점령하라' },
  sabotage: { name: '파괴 공작', color: '#ff5ad2', short: '전송 비콘 파괴', banner: '파괴 공작! 적을 불러내는 비콘을 모두 부숴라' },
  duel:     { name: '정예 결투', color: '#ffd24a', short: '정예와 1:1', banner: '정예 결투! 강적이 하나씩 나온다' },
  raid:     { name: '수송선 습격', color: '#ffe066', short: '도망치는 황금 드론', banner: '수송선 습격! 황금 드론이 도망가기 전에 잡아라' },
};

// 문 뒤 방의 작전 고르기 (보상 → 작전). 같은 방에 두 문이 같은 작전이면 하나를 바꾼다
export function pickOp(reward, depth, R, avoid = []) {
  if (reward === 'elite') return 'duel';
  if (reward === 'cargo') return 'raid';
  if (!['part', 'system', 'supply', 'xp'].includes(reward)) return null;
  const pool = ['horde', 'horde', 'survive', 'control', 'control'];
  if (depth >= 2) pool.push('sabotage', 'sabotage');
  if (depth >= 4) pool.push('survive');
  const ok = pool.filter((o) => !avoid.includes(o));
  return R.pick(ok.length ? ok : pool);
}

// ---- 작전 전용 적 ----
export const OP_TYPES = {
  // 전송 비콘: 움직이지 않고, 주기적으로 주변에 적을 불러낸다
  beacon: {
    name: '전송 비콘', hp: 520, speed: 0, r: 1.1, dmg: 0, xp: 12, mass: 999, fly: 0, cap: 8, boom: 2.2, anchor: true, calm: true,
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.cylinder(1.0, 1.15, 0.35, 6, [0.22, 0.2, 0.28]), [0, 0, 0]);
      add(g, Geometry.cylinder(0.55, 0.75, 0.5, 6, [0.36, 0.3, 0.44]), [0, 0.35, 0]);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(g, Geometry.box(0.18, 2.2, 0.3, [0.3, 0.27, 0.36]), [Math.sin(a) * 0.62, 0.3, Math.cos(a) * 0.62], [Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18]); }
      add(glow, Geometry.icosphere(0.42, 0, [1, 0.3, 0.85], { squashY: 1.6 }), [0, 1.7, 0]);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 1; add(glow, Geometry.box(0.08, 0.6, 0.08, [1, 0.4, 0.9]), [Math.sin(a) * 0.68, 1.1, Math.cos(a) * 0.68]); }
      return { g, glow };
    },
    ai(en, e, c) {
      c.sp = 0; e.kx = e.kz = 0;
      const g = c.g, d = Math.max(0, g.rooms.depth);
      e.cd -= c.dt;
      e.charging = e.cd < 0.8;
      if (e.charging && (g.frame & 3) === 0) g.fx.flare([e.x, 1.7, e.z], 'star4', [1, 0.4, 0.9], 1.2 + Math.random(), 0.12);
      if (e.cd <= 0) {
        e.cd = Math.max(2.8, 5.2 - d * 0.3);
        const a = Math.random() * TAU, x = e.x + Math.sin(a) * 2, z = e.z + Math.cos(a) * 2;
        const r = Math.random();
        if (d >= 3 && r < 0.25) en.pack('tank', x, z, 1, 0.5);
        else if (r < 0.5) en.pack('drone', x, z, 3 + (d >> 1), 1.2);
        else en.pack('mite', x, z, 8 + d * 2, 1.6);
        g.fx.flare([e.x, 1.7, e.z], 'hex', [1, 0.4, 0.9], 3, 0.35, { grow: true, rot: 0 });
        g.fx.ring(e.x, 0.15, e.z, 2.6, [1, 0.4, 0.9], 0.35);
      }
      return false;
    },
  },
  // 황금 수송 드론: 플레이어를 피해 도망 다닌다. 잡으면 경험치와 정비 포인트가 쏟아진다
  cargo: {
    name: '황금 수송 드론', hp: 90, speed: 4.6, r: 0.7, dmg: 0, xp: 8, mass: 2.5, fly: 1.1, cap: 12, boom: 1.2, calm: true,
    loot(g, e) {
      for (let i = 0; i < 6; i++) g.pickups.gem(e.x + (Math.random() - 0.5) * 2, e.z + (Math.random() - 0.5) * 2, 3 * (g.enemies.k.xp || 1));
      g.rooms.caught = (g.rooms.caught || 0) + 1;
      g.fx.flare([e.x, 1.2, e.z], 'star8', [1, 0.9, 0.3], 3.5, 0.35, { spin: 4 });
      g.sfx.play('gem', { vol: 0.8 });
    },
    model() {
      const g = new Geometry(), glow = new Geometry();
      add(g, Geometry.box(0.9, 0.45, 1.1, [0.85, 0.65, 0.2]), [0, -0.2, 0]);
      add(g, Geometry.box(0.95, 0.08, 1.15, [0.4, 0.3, 0.12]), [0, 0.05, 0]);
      for (const s of [-1, 1]) for (const z of [-0.45, 0.45]) { add(g, Geometry.cylinder(0.04, 0.04, 0.3, 4, [0.3, 0.3, 0.34]), [s * 0.55, 0.1, z]); add(glow, Geometry.cylinder(0.28, 0.28, 0.04, 8, [1, 0.95, 0.6]), [s * 0.55, 0.26, z]); }
      add(glow, Geometry.box(0.4, 0.2, 0.05, [1, 0.9, 0.3]), [0, -0.15, 0.56]);
      return { g, glow };
    },
    ai(en, e, c) {
      // 도망: 플레이어 반대쪽 + 벽에 가까우면 벽을 따라 미끄러진다
      const R = c.g.rooms, near = c.d < 7;
      let mx = -c.dx / c.d, mz = -c.dz / c.d;
      if (!near) { const a = e.seed * 7 + c.g.time * 0.4; mx = Math.sin(a); mz = Math.cos(a); }
      const ex = R.hx - 2.5, ez = R.hz - 2.5;
      if (Math.abs(e.x) > ex) mx -= Math.sign(e.x) * 1.6;
      if (Math.abs(e.z) > ez) mz -= Math.sign(e.z) * 1.6;
      const l = Math.hypot(mx, mz) || 1;
      c.mx = mx / l; c.mz = mz / l; c.sp = e.speed * (near ? 1 : 0.45);
      e.yaw = Math.atan2(c.mx, c.mz);
      return false;
    },
  },
};

// ---- 공통 ----
// 플레이어에게서 떨어진 빈 자리 n 곳 (서로도 떨어지게)
function spots(R, n, minP, minE) {
  const out = [];
  for (let k = 0; k < 200 && out.length < n; k++) {
    const pt = R.spawnSpot(minP);
    if (pt && out.every((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) > minE)) out.push(pt);
  }
  return out;
}
const kills = (R) => R.game.stats.kills - R.k0;

// 방어선 (예전 방식): 시간 흐름에 따라 물량 증가, 대규모 접근, 정예, 중간 보스
OPS.survive.begin = (R) => { R.midAt = R.planMids(); };
OPS.survive.update = (R, dt) => {
  const g = R.game, en = g.enemies, d = R.depth;
  const k = Math.min(1, R.roomT / R.duration), midOn = en.mids.length > 0;
  R.stream(dt, (0.6 + 0.95 * k) * (midOn ? 0.5 : 1)); // 중간 보스가 있으면 물량은 절반 (탄막에 집중)
  for (const m of d >= 6 ? [0.3, 0.58, 0.85] : [0.38, 0.78]) if (k >= m && !R.marks.has(m)) { R.marks.add(m); R.surge(); }
  for (const m of d >= 6 ? [0.2, 0.5, 0.8] : d >= 3 ? [0.3, 0.65] : [0.5]) if (k >= m && !R.marks.has('e' + m)) { R.marks.add('e' + m); R.spawnElite(); }
  for (const m of R.midAt) if (k >= m && !R.marks.has('m' + m)) { R.marks.add('m' + m); R.spawnMid(); }
  if (k >= 1 && midOn) { if (!R.waitMid) { R.waitMid = true; g.ui.banner('중간 보스를 격파하라!', true); } return false; }
  return k >= 1;
};
OPS.survive.info = (R) => [Math.min(1, R.roomT / R.duration), `남은 시간 ${Math.max(0, Math.ceil(R.duration - R.roomT))}초`];

// 섬멸전: 떼거리만, 목표 처치 수. 25% 마다 포위 접근
OPS.horde.begin = (R) => { R.target = Math.round(300 + R.depth * 110); R.duration = 0; };
OPS.horde.update = (R, dt) => {
  const k = Math.min(1, kills(R) / R.target);
  R.stream(dt, 1.7 + k * 0.8, true);
  for (const m of [0.2, 0.45, 0.7]) if (k >= m && !R.marks.has(m)) { R.marks.add(m); R.surge(); }
  if (k >= 0.55 && !R.marks.has('e')) { R.marks.add('e'); R.spawnElite(); }
  return k >= 1;
};
OPS.horde.info = (R) => [Math.min(1, kills(R) / R.target), `처치 ${Math.min(R.target, kills(R))} / ${R.target}`];

// 거점 장악: 거점 3곳 (방 바닥에 빛나는 원). 점령하면 주변 적이 날아간다
const CP_R = 3.2;
OPS.control.begin = (R) => {
  R.duration = 0;
  const h = Math.min(R.hx, R.hz) * 0.55, a0 = Math.random() * TAU;
  R.points = [0, 1, 2].map((i) => {
    for (let k = 0; k < 30; k++) {
      const a = a0 + i * 2.1 + (Math.random() - 0.5) * 0.6, r = h * (0.7 + Math.random() * 0.5);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!R.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.2) && !R.hazards.outside(x, z, 1.5)) return { x, z, fill: 0 };
    }
    return { x: Math.sin(a0 + i * 2.1) * 3, z: Math.cos(a0 + i * 2.1) * 3, fill: 0 };
  });
  R.cp = 0;
  // 바닥 원(고리 + 차오르는 원판) + 빛기둥
  const ring = new Geometry(), disc = new Geometry(), beam = new Geometry();
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * TAU, a1 = ((i + 1) / 40) * TAU, p = (a, r) => [Math.sin(a) * r, 0.06, Math.cos(a) * r];
    ring.quad(p(a0, 0.9), p(a1, 0.9), p(a1, 1), p(a0, 1), [1, 1, 1], null, [0, 1, 0]);
    if (i % 4 < 2) ring.quad(p(a0, 1.08), p(a1, 1.08), p(a1, 1.14), p(a0, 1.14), [1, 1, 1], null, [0, 1, 0]);
    disc.quad([0, 0.05, 0], p(a0, 1), p(a1, 1), [0, 0.05, 0], [1, 1, 1], null, [0, 1, 0]);
  }
  add(beam, Geometry.box(0.35, 9, 0.35, [1, 1, 1]), [0, 0, 0]);
  R.cpMesh = R.points.map((P) => {
    const m = { ring: R.addMesh(ring, R.glowMat()), disc: R.addMesh(disc, R.glowMat(0.55)), beam: R.addMesh(beam, R.glowMat(0.35)) };
    for (const k in m) m[k].position = [P.x, 0, P.z];
    m.ring.scale = [CP_R, 1, CP_R];
    return m;
  });
};
OPS.control.update = (R, dt) => {
  const g = R.game, en = g.enemies, p = g.player, P = R.points[R.cp];
  R.stream(dt, P ? 1.0 : 0.4);
  if (!P) return en.mids.length === 0; // 거점은 다 먹었고 중간 보스만 남음
  // 거점이 바뀌면 그 둘레로 적이 몰려온다
  if (!R.marks.has('cp' + R.cp)) {
    R.marks.add('cp' + R.cp);
    if (R.cp > 0) R.surgeAt(P.x, P.z, 7);
    if (R.cp === 1) R.spawnElite();
    if (R.cp === 2 && R.depth >= 3) R.spawnMid();
  }
  const inside = Math.hypot(p.x - P.x, p.z - P.z) < CP_R;
  let crowd = 0;
  en.each(P.x, P.z, CP_R, (e) => { crowd += e.T.swarm ? 0.5 : 1; });
  const slow = crowd > 4 ? 0.35 : 1;
  R.cpSlow = inside && slow < 1;
  if (inside) P.fill += (dt / (7 + R.depth * 0.35)) * slow;
  else P.fill = Math.max(0, P.fill - dt * 0.03);
  if ((g.frame & 7) === 0 && inside) g.fx.streaks([P.x + (Math.random() - 0.5) * CP_R, 0.2, P.z + (Math.random() - 0.5) * CP_R], 1, [0.4, 1, 0.8], { speed: [3, 5], len: 0.5, life: 0.4, up: 4 });
  if (P.fill >= 1) {
    P.fill = 1;
    // 점령: 충격파로 원 주변 적을 날린다
    en.blast(P.x, P.z, CP_R * 2, 80 * p.stats.dmgMul, false, 0.05);
    g.fx.flare([P.x, 1, P.z], 'star8', [0.5, 1, 0.85], 6, 0.45, { spin: 2 });
    g.fx.flare([P.x, 0.5, P.z], 'hex', [0.4, 1, 0.8], CP_R * 2.5, 0.5, { grow: true, rot: 0 });
    g.fx.ring(P.x, 0.15, P.z, CP_R * 2, [0.4, 1, 0.8], 0.5);
    g.sfx.play('levelup'); g.sfx.play('boom');
    R.cp++;
    if (R.cp < 3) g.ui.banner(`거점 점령! (${R.cp}/3) 다음 거점으로`);
  }
  // 거점 연출: 지금 거점은 밝게 깜빡, 끝난 거점은 초록, 남은 거점은 흐리게
  R.cpMesh.forEach((m, i) => {
    const Q = R.points[i], on = i === R.cp, done = i < R.cp, t = g.time;
    const c = done ? [0.25, 0.7, 0.4] : on ? [0.4, 1, 0.8].map((v) => v * (0.75 + 0.25 * Math.sin(t * 6))) : [0.35, 0.4, 0.45];
    m.ring.material.color = c; m.disc.material.color = R.cpSlow && on ? [1, 0.4, 0.3] : c;
    m.disc.visible = Q.fill > 0.01; m.disc.scale = [CP_R * Q.fill, 1, CP_R * Q.fill];
    m.beam.visible = on; m.beam.material.color = c;
  });
  return R.cp >= 3 && en.mids.length === 0;
};
OPS.control.info = (R) => {
  if (R.cp >= 3) return [1, '중간 보스를 격파하라'];
  const P = R.points[R.cp];
  return [(R.cp + P.fill) / 3, `거점 ${R.cp + 1}/3  ${Math.floor(P.fill * 100)}%${R.cpSlow ? '  적이 막는 중!' : ''}`];
};
OPS.control.pins = (R) => (R.cp < 3 ? [{ x: R.points[R.cp].x, y: 1.5, z: R.points[R.cp].z, label: '거점', color: '#5effc8' }] : []);

// 파괴 공작: 비콘 3~4개
OPS.sabotage.begin = (R) => {
  R.duration = 0;
  const en = R.game.enemies, n = R.depth >= 5 ? 4 : 3;
  R.beacons = spots(R, n, 9, 7).map(([x, z]) => {
    const e = en.spawn('beacon', x, z, { force: true });
    if (e) { e.cd = 2 + Math.random() * 2; e.spawnT = 1; }
    return e;
  }).filter(Boolean);
  R.bDead = 0;
};
OPS.sabotage.update = (R, dt) => {
  const g = R.game, left = R.beacons.filter((e) => !e.dead).length, dead = R.beacons.length - left;
  R.stream(dt, 0.45 + dead * 0.1);
  if (dead > R.bDead) {
    R.bDead = dead;
    if (left) g.ui.banner(`비콘 파괴! (${dead}/${R.beacons.length})`);
    if (dead === 1) R.spawnElite();
    if (dead === Math.ceil(R.beacons.length / 2) && R.depth >= 3) R.spawnMid();
  }
  return left === 0 && g.enemies.mids.length === 0;
};
OPS.sabotage.info = (R) => {
  const left = R.beacons.filter((e) => !e.dead).length;
  return [(R.beacons.length - left) / Math.max(1, R.beacons.length), left ? `비콘 ${R.beacons.length - left} / ${R.beacons.length} 파괴` : '중간 보스를 격파하라'];
};
OPS.sabotage.pins = (R) => R.beacons.filter((e) => !e.dead).map((e) => ({ x: e.x, y: 2.6, z: e.z, label: '비콘', color: '#ff5ad2' }));

// 정예 결투: 정예가 하나씩 (둘까지 동시에), 깊으면 마지막에 중간 보스
OPS.duel.begin = (R) => {
  R.duration = 0;
  R.total = Math.min(5, 2 + (R.depth >> 1)); R.spawned = 0; R.nextT = 1.5;
  R.mids = R.depth >= 6 ? 2 : R.depth >= 3 ? 1 : 0; R.midDone = 0;
};
OPS.duel.update = (R, dt) => {
  const g = R.game, en = g.enemies;
  R.stream(dt, 0.15);
  const alive = en.list.filter((e) => e.elite && !e.dead).length + en.pending.filter((q) => q.elite).length;
  R.nextT -= dt;
  if (R.spawned < R.total && (alive === 0 || (alive < 2 && R.nextT <= 0))) {
    if (alive === 0) R.nextT = Math.min(R.nextT, 1.2);
    if (R.nextT <= 0) { R.spawnElite(); R.spawned++; R.nextT = 12; if (R.spawned > 1) g.ui.toast(`정예 ${R.spawned} / ${R.total}`); }
  }
  if (R.spawned >= R.total && alive === 0 && R.midDone < R.mids && en.mids.length === 0) {
    R.midDone++; R.spawnMid(); g.ui.banner('마지막 상대! 중간 보스', true);
  }
  R.alive = alive;
  return R.spawned >= R.total && alive === 0 && R.midDone >= R.mids && en.mids.length === 0;
};
OPS.duel.info = (R) => {
  const done = Math.max(0, R.spawned - (R.alive || 0));
  return [(done + R.midDone * 0.5) / (R.total + R.mids * 0.5), done >= R.total && R.mids ? '중간 보스를 격파하라' : `정예 ${done} / ${R.total} 격파`];
};

// 수송선 습격: 24초. 황금 드론이 세 번에 나눠 들어온다
OPS.raid.begin = (R) => { R.duration = 24; R.caught = 0; R.cargoTotal = 0; R.cargoes = []; };
OPS.raid.update = (R, dt) => {
  const g = R.game, en = g.enemies, k = R.roomT / R.duration;
  R.stream(dt, 0.35, true);
  for (const [m, n] of [[0, 3], [0.3, 2 + (R.depth >= 4)], [0.6, 2]]) if (k >= m && !R.marks.has('c' + m)) {
    R.marks.add('c' + m);
    for (const [x, z] of spots(R, n, 8, 4)) { const e = en.spawn('cargo', x, z, { force: true }); if (e) { R.cargoes.push(e); R.cargoTotal++; } }
    if (m > 0) g.ui.toast('황금 드론 추가 출현!');
  }
  if (k >= 1) {
    // 못 잡은 드론은 순간이동으로 도망
    for (const e of R.cargoes) if (!e.dead) { e.dead = true; g.fx.flare([e.x, 1.2, e.z], 'star4', [1, 0.95, 0.6], 2.5, 0.3, { rot: 0 }); g.fx.streaks([e.x, 1.2, e.z], 6, [1, 0.9, 0.4], { speed: [8, 14] }); }
    const bonus = Math.floor(R.caught / 2);
    if (bonus) g.addChips(bonus, `수송선 ${R.caught}대 격추`);
    else g.ui.toast(`수송선 ${R.caught}대 격추`);
    return true;
  }
  return false;
};
OPS.raid.info = (R) => [Math.min(1, R.roomT / R.duration), `격추 ${R.caught || 0} / ${R.cargoTotal || 0}  ${Math.max(0, Math.ceil(R.duration - R.roomT))}초`];
OPS.raid.pins = (R) => R.cargoes.filter((e) => !e.dead).map((e) => ({ x: e.x, y: 2, z: e.z, label: '', color: '#ffe066' }));
