// PixelForge Worlds — 태양계 + 우주 활동
//
// 좌표계: 고향 행성 중심 기준(P). 모든 우주 물체는 globe 노드의 자식이라
// 지구본을 돌리면 태양계도 같이 돈다. 하루(=1년)마다 고향 행성이 태양을 한 바퀴 돈다.
//   - 태양, 행성 4개(용암·붉은·얼음·가스), 궤도 점선
//   - 인공위성: 고향 궤도를 돈다 (지구본에서도 보임)
//   - 식민선: 다른 행성에 돔 식민지를 세움
//   - 전함: 적 식민지를 부수거나 적 마을에 궤도 폭격, 마주치면 우주전

import { Mesh, Node, InstancedMesh, Material, Geometry, ParticleSystem, v3, m4, rng, smoothstep, basisMatrix, axisAngle, fbm3 } from '../engine/index.js';

export const D_HOME = 300;

export function createSpace(ctx) {
  const { R, globe, life, say, scene } = ctx;
  const Rn = rng(777);
  const rand = () => Rn();
  const W = [1, 1, 1];

  // ------------------------------------------------------------------
  // 천체
  // ------------------------------------------------------------------
  const paintSphere = (r, sub, colorFn, seed) => {
    const g = Geometry.icosphere(r, sub, W, { jitter: 0.03, seed });
    g.paint((c) => colorFn(v3.norm(c)));
    return g;
  };
  const BODIES = [
    { id: 'lava', name: '용암 행성 이그니스', dist: 170, r: 9, phase: 2.1, color: (d) => fbm3(d[0] * 3, d[1] * 3, d[2] * 3, 3) > 0.55 ? [1, 0.5, 0.15] : [0.28, 0.22, 0.24], glow: 0.35 },
    { id: 'mars', name: '붉은 행성 루베르', dist: 420, r: 12, phase: 4.0, color: (d) => Math.abs(d[1]) > 0.85 ? [0.95, 0.93, 0.9] : fbm3(d[0] * 2.5, d[1] * 2.5, d[2] * 2.5, 3) > 0.5 ? [0.78, 0.42, 0.26] : [0.6, 0.3, 0.2] },
    { id: 'ice', name: '얼음 행성 글라시아', dist: 560, r: 16, phase: 0.9, color: (d) => fbm3(d[0] * 2 + 9, d[1] * 2, d[2] * 2, 3) > 0.52 ? [0.92, 0.96, 1] : [0.62, 0.78, 0.92] },
    { id: 'gas', name: '가스 행성 템페스트', dist: 760, r: 30, phase: 5.3, rings: true, color: (d) => { const b = Math.sin(d[1] * 14 + fbm3(d[0] * 2, d[1] * 2, d[2] * 2, 2) * 4); return b > 0.4 ? [0.92, 0.78, 0.55] : b > -0.3 ? [0.8, 0.58, 0.4] : [0.66, 0.44, 0.34]; } },
  ];
  // 지구본과 같은 회전을 쓰지만 크기는 따로 (태양계 화면에서 고향 행성만 키우기 위해)
  const spaceRoot = scene.add(new Node('space'));
  spaceRoot.matrix = m4.identity();
  const fx = new ParticleSystem({ max: 1500, gravity: [0, 0, 0], drag: 0.6, node: spaceRoot });
  scene.particles.push(fx);
  const sun = spaceRoot.add(new Mesh(Geometry.icosphere(42, 2, [1, 0.86, 0.45]), new Material({ emissive: 1, outline: false, castShadow: false })));
  const corona = spaceRoot.add(new Mesh(Geometry.icosphere(58, 2, [1, 0.6, 0.25]), new Material({ rim: 1, emissive: 1, outline: false, castShadow: false })));
  for (const b of BODIES) {
    b.node = spaceRoot.add(new Node(b.id));
    b.mesh = b.node.add(new Mesh(paintSphere(b.r, 2, b.color, b.r), new Material({ emissive: b.glow || 0, castShadow: false })));
    if (b.rings) {
      const g = new Geometry(), seg = 40;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * 6.283, a1 = ((i + 1) / seg) * 6.283;
        const P = (a, r) => [Math.cos(a) * r, 0, Math.sin(a) * r];
        g.quad(P(a0, 40), P(a1, 40), P(a1, 58), P(a0, 58), i % 3 ? [0.85, 0.75, 0.6] : [0.7, 0.6, 0.5], null, [0, 1, 0]);
      }
      const ring = b.node.add(new Mesh(g, new Material({ castShadow: false })));
      ring.rotation = [0.35, 0, 0.15];
    }
    b.colonies = []; // { tribe, d }
    b.domes = b.node.add(new InstancedMesh((() => { const g = new Geometry(); g.merge(Geometry.icosphere(1, 1, W, { squashY: 0.6 })); g.merge(Geometry.box(0.25, 1.4, 0.25, [0.8, 0.8, 0.85])); return g; })(), new Material({ emissive: 0.25, castShadow: false }), 60));
    b.pos = [0, 0, 0];
  }
  const sunLight = { position: [0, 0, 0], color: [1, 0.92, 0.75], radius: 1700, intensity: 0, space: true };
  scene.lights.push(sunLight);

  // 궤도 점선
  const orbitDots = spaceRoot.add(new InstancedMesh(Geometry.box(1, 1, 1, W), new Material({ emissive: 0.6, outline: false, castShadow: false }), 600));
  // 위성 / 우주선
  const satGeo = (() => { const g = new Geometry(); g.merge(Geometry.box(0.25, 0.25, 0.35, [0.85, 0.85, 0.9])); g.merge(Geometry.box(1.1, 0.03, 0.3, [0.3, 0.4, 0.85]), { position: [0, 0.11, 0] }); return g; })();
  const sats = globe.add(new InstancedMesh(satGeo, new Material({ castShadow: false }), 120));
  const shipGeo = (() => {
    const g = new Geometry();
    g.merge(Geometry.cylinder(0.25, 0.3, 1.4, 6, [0.92, 0.92, 0.95]), { rotation: [Math.PI / 2, 0, 0], position: [0, 0, -0.7] });
    g.merge(Geometry.cone(0.25, 0.6, 6, W), { rotation: [Math.PI / 2, 0, 0], position: [0, 0, 0.7] });
    for (const s of [-1, 1]) g.merge(Geometry.box(0.7, 0.06, 0.4, [0.35, 0.35, 0.4]), { position: [s * 0.3, -0.03, -0.5] });
    return g;
  })();
  const ships = spaceRoot.add(new InstancedMesh(shipGeo, new Material({ castShadow: false }), 80));

  const satellites = [];   // { tribe, axis, r, phase, speed }
  const fleet = [];        // { kind, tribe, foe, p:[P], from, target, t, dur }
  let dayAngle = 0, sunPos = [0, 0, 0], H = [0, 0, 0], curBig = 1, homeBig = 1;

  // 행성 위치 (P 좌표)
  function bodyPos(b) {
    const a = b.phase + dayAngle * Math.pow(D_HOME / b.dist, 1.5);
    return v3.add(sunPos, [Math.cos(a) * b.dist, 0, Math.sin(a) * b.dist]);
  }
  const HOME = { id: 'home', name: '고향 행성', r: R, pos: [0, 0, 0], colonies: [] };

  // ------------------------------------------------------------------
  // 로켓이 궤도에 올라옴 (life.js가 호출)
  // ------------------------------------------------------------------
  function toOrbit(r) {
    const start = v3.scale(r.pad.d, R + 26);
    if (r.kind === 'satellite') {
      const axis = v3.norm(v3.cross(r.pad.d, [rand() - 0.5, rand() - 0.5, rand() - 0.5]));
      satellites.push({ tribe: r.tribe, axis, ref: r.pad.d, r: R + 5 + rand() * 4, phase: 0, speed: 0.35 + rand() * 0.25 });
      say(`${r.tribe.name}의 인공위성이 궤도에 올랐어요`, 'era');
      return;
    }
    let target;
    if (r.kind === 'warship') {
      const foe = r.foe;
      const colonyBodies = BODIES.filter((b) => b.colonies.some((c) => c.tribe === foe));
      target = colonyBodies.length && rand() < 0.6 ? colonyBodies[Math.floor(rand() * colonyBodies.length)] : HOME;
    } else {
      // 아직 내 식민지가 적은 행성으로
      const sorted = BODIES.slice().sort((a, b) => a.colonies.filter((c) => c.tribe === r.tribe).length - b.colonies.filter((c) => c.tribe === r.tribe).length + (rand() - 0.5));
      target = sorted[0];
    }
    fleet.push({ kind: r.kind, tribe: r.tribe, foe: r.foe, start, p: [...start], target, t: 0, dur: target === HOME ? 6 : 10 + target.dist / 80, hp: 1 });
  }

  function arrive(s) {
    const b = s.target;
    if (s.kind === 'colony') {
      const d = v3.norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
      b.colonies.push({ tribe: s.tribe, d });
      say(`${s.tribe.name}이 ${b.name.split(' ')[0]}에 식민지를 세웠어요!`, 'era');
      burst(b.pos, s.tribe.color, 20, 6);
      return;
    }
    // 전함
    if (b === HOME) {
      const vs = life.villages.filter((v) => v.tribe === s.foe);
      if (!vs.length) return;
      const v = vs[Math.floor(rand() * vs.length)];
      // 마을 한가운데가 아니라 근처를 노린다 (한 방에 전멸하지 않게)
      const f = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      ctx.orbitalStrike(v3.norm(v3.add(v.d, v3.scale(f, 2.4 / R))), s.tribe);
      say(`${s.tribe.name}이 ${v.name}에 궤도 폭격을 퍼부었어요!`, 'war');
      return;
    }
    const i = b.colonies.findIndex((c) => c.tribe === s.foe);
    if (i >= 0) {
      const c = b.colonies.splice(i, 1)[0];
      burst(v3.add(b.pos, v3.scale(c.d, b.r)), [1, 0.6, 0.2], 40, 10);
      say(`${s.tribe.name} 전함이 ${b.name.split(' ')[0]}의 ${s.foe.name} 식민지를 파괴했어요!`, 'war');
    }
  }
  function burst(p, color, n, sp) {
    for (let i = 0; i < n; i++) fx.emit({ position: p, velocity: v3.scale(v3.norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]), sp * (0.4 + rand())), life: 0.8 + rand() * 0.6, size: 3, sizeEnd: 1, color: [1, 0.95, 0.7], colorEnd: color, emissive: 1, gravity: 0 });
  }

  // ------------------------------------------------------------------
  // 매 프레임
  // ------------------------------------------------------------------
  function update(dt, sdt, da, sunPlanet, view, vh, time, rot) {
    dayAngle = da;
    spaceRoot.matrix = rot;
    sunPos = v3.scale(sunPlanet, D_HOME);
    const sys = smoothstep(0, -0.35, view.zoom); // 0: 지구본, 1: 태양계
    spaceRoot.visible = sys > 0.01;
    sunLight.intensity = 1.15 * sys;
    sunLight.position = m4.transformPoint(rot, sunPos);
    sun.position = corona.position = sunPos;
    const big = 1 + sys * 2.6; // 태양계 화면에서는 천체를 과장해서 크게
    sun.setScale(1 + sys * 1.2); corona.setScale(1 + sys * 1.2);
    sun.rotation = [0, time * 0.05, 0];
    corona.material.rim = 0.9;
    curBig = big;
    for (const b of BODIES) {
      b.pos = bodyPos(b);
      b.node.position = b.pos;
      b.node.setScale(big);
      b.mesh.rotation = [0.2, time * 0.15, 0];
      b.colonies = b.colonies.filter((c) => c.tribe.alive);
      b.domes.count = Math.min(b.colonies.length, 60);
      b.colonies.slice(0, 60).forEach((c, i) => {
        const f = { n: c.d };
        let e = v3.cross([0, 1, 0], c.d); if (v3.len(e) < 1e-3) e = [1, 0, 0]; e = v3.norm(e);
        const u = v3.cross(c.d, e);
        b.domes.setAt(i, basisMatrix(e, c.d, u, v3.scale(c.d, b.r * 0.97), Math.max(1.4, vh / 260)), c.tribe.color, 0.3);
      });
    }
    // 궤도 점선 (태양계 화면에서만)
    let n = 0;
    if (sys > 0.01) {
      const dot = Math.max(1.2, vh / 160);
      for (const orbit of [D_HOME, ...BODIES.map((b) => b.dist)]) {
        const N = Math.round(orbit / 8);
        for (let i = 0; i < N && n < orbitDots.capacity; i += 2) {
          const a = (i / N) * 6.283;
          orbitDots.setAt(n++, m4.fromTRS(v3.add(sunPos, [Math.cos(a) * orbit, 0, Math.sin(a) * orbit]), [0, 0, 0], [dot, dot * 0.3, dot]), orbit === D_HOME ? [0.55, 0.85, 1] : [0.6, 0.56, 0.72], 0.8);
        }
      }
    }
    orbitDots.count = n;

    // 위성
    sats.count = 0;
    satellites.forEach((s, i) => {
      if (!s.tribe.alive || i >= sats.capacity) return;
      s.phase += sdt * s.speed;
      const ref = v3.norm(v3.sub(s.ref, v3.scale(s.axis, v3.dot(s.ref, s.axis))));
      const c = Math.cos(s.phase), sn = Math.sin(s.phase), bx = v3.cross(s.axis, ref);
      const pos = v3.scale(v3.add(v3.scale(ref, c), v3.scale(bx, sn)), s.r);
      const fw = v3.norm(v3.add(v3.scale(ref, -sn), v3.scale(bx, c)));
      const sc = 1 + smoothstep(0.6, 0, view.zoom) * 2.5;
      sats.setAt(sats.count++, basisMatrix(v3.cross(s.axis, fw), s.axis, fw, pos, sc), v3.lerp([1, 1, 1], s.tribe.color, 0.5), 0.15);
    });
    for (let i = satellites.length - 1; i >= 0; i--) if (!satellites[i].tribe.alive) satellites.splice(i, 1);

    // 우주선
    let k = 0;
    for (let i = fleet.length - 1; i >= 0; i--) {
      const s = fleet[i];
      s.t += sdt;
      const tp = s.target === HOME ? v3.scale(v3.norm(s.start), R + 30) : v3.add(s.target.pos, v3.scale(v3.norm(v3.sub(s.start, s.target.pos)), s.target.r + 6));
      const u = Math.min(1, s.t / s.dur), e = u * u * (3 - 2 * u);
      // 살짝 휘는 궤적
      const mid = v3.add(v3.lerp(s.start, tp, 0.5), v3.scale([0, 1, 0], v3.len(v3.sub(tp, s.start)) * 0.15));
      const a1 = v3.lerp(s.start, mid, e), a2 = v3.lerp(mid, tp, e);
      const np = v3.lerp(a1, a2, e);
      const vel = v3.sub(np, s.p);
      s.p = np;
      if (u >= 1) { fleet.splice(i, 1); arrive(s); continue; }
      if (rand() < 0.7) fx.emit({ position: s.p, velocity: v3.scale(v3.norm(vel.some((x) => x) ? vel : [0, 1, 0]), -2), life: 0.8, size: 2, sizeEnd: 1, color: s.kind === 'warship' ? [1, 0.4, 0.3] : [0.6, 0.9, 1], colorEnd: [0.4, 0.4, 0.5], emissive: 1, gravity: 0 });
      // 우주전: 서로 전쟁 중인 전함이 가까우면 레이저를 주고받는다
      if (s.kind === 'warship') {
        for (const o of fleet) {
          if (o === s || !s.tribe.war.has(o.tribe) || v3.len(v3.sub(o.p, s.p)) > 60) continue;
          if (rand() < sdt * 2) {
            for (let j = 0; j < 8; j++) fx.emit({ position: v3.lerp(s.p, o.p, j / 8), velocity: [0, 0, 0], life: 0.25, size: 2, color: [1, 0.3, 0.3], emissive: 1, gravity: 0 });
            o.hp -= 0.35;
            if (o.hp <= 0) { burst(o.p, [1, 0.5, 0.2], 30, 8); o.dead = true; say(`우주전! ${s.tribe.name}이 ${o.tribe.name}의 우주선을 격추했어요`, 'war'); }
          }
        }
      }
      if (k < ships.capacity) {
        const f = v3.norm(vel.some((x) => x) ? vel : [0, 0, 1]);
        let rt = v3.cross([0, 1, 0], f); if (v3.len(rt) < 1e-3) rt = [1, 0, 0]; rt = v3.norm(rt);
        ships.setAt(k++, basisMatrix(rt, v3.cross(f, rt), f, s.p, Math.max(1, vh / 90) * (s.kind === 'warship' ? 1.3 : 1)), v3.lerp([1, 1, 1], s.tribe.color, 0.6), 0.3);
      }
    }
    for (let i = fleet.length - 1; i >= 0; i--) if (fleet[i].dead) fleet.splice(i, 1);
    ships.count = k;
  }

  // 태양계 화면의 이름표
  function labels() {
    const out = [{ id: 'sun', p: sunPos, name: '태양', sub: '' }];
    out.push({ id: 'home', p: [0, 0, 0], name: '고향 행성', sub: `인구 ${life.people.length} · 위성 ${satellites.length}`, r: R * homeBig });
    for (const b of BODIES) {
      const by = {};
      for (const c of b.colonies) by[c.tribe.name] = (by[c.tribe.name] || 0) + 1;
      const s = Object.entries(by).map(([t, n]) => `${t} ${n}`).join(' · ');
      out.push({ id: b.id, p: b.pos, name: b.name, sub: s ? `식민지: ${s}` : '아직 아무도 없어요', r: b.r * curBig });
    }
    return out;
  }

  function reset() { satellites.length = 0; fleet.length = 0; for (const b of BODIES) b.colonies = []; }

  return {
    update, labels, toOrbit, reset, BODIES,
    satellites: (tribe) => satellites.filter((s) => s.tribe === tribe).length,
    setHomeBig(k) { homeBig = k; },
    stats: () => ({ satellites: satellites.length, colonies: BODIES.reduce((n, b) => n + b.colonies.length, 0), ships: fleet.length }),
    sunPos: () => sunPos,
  };
}
