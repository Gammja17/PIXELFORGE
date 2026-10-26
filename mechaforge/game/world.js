// 전장: 황혼의 사막 폐허. 바닥 + 바위/폐허/분화구를 한 지오메트리로 합쳐 드로우콜 1~2개

import { Geometry, Mesh, Material, fbm, rng } from '../engine/index.js';

export const ARENA = 46; // 반경 (정사각형 한 변의 절반)

export function buildArena(scene, seed = 7) {
  const R = rng(seed);
  // 조명: 해 질 녘 → 폭발 점광원이 잘 보이게 어둡고 따뜻하게
  scene.sun.direction = [0.55, 0.62, 0.35];
  scene.sun.color = [1.0, 0.78, 0.62];
  scene.sun.intensity = 0.72;
  scene.ambientSky = [0.22, 0.23, 0.38];
  scene.ambientGround = [0.17, 0.13, 0.15];
  scene.skyColor = scene.fog.color = [0.09, 0.08, 0.14];

  const S = ARENA * 2 + 30;
  const ground = Geometry.grid(S, S, 56, 56, () => 0, (c) => {
    const n = fbm(c[0] * 0.05 + 3, c[2] * 0.05, 3), m = fbm(c[0] * 0.21, c[2] * 0.21 + 9, 2);
    const out = Math.max(Math.abs(c[0]), Math.abs(c[2])) > ARENA;
    let col = n > 0.56 ? [0.5, 0.38, 0.34] : n > 0.44 ? [0.56, 0.43, 0.37] : [0.62, 0.5, 0.41];
    if (m > 0.68) col = col.map((v) => v * 0.88);
    if (out) col = col.map((v) => v * 0.6);
    return col;
  });
  scene.add(new Mesh(ground, new Material({ outline: true }), 'ground'));

  const g = new Geometry(), colliders = [];
  const ROCK = [[0.5, 0.38, 0.34], [0.58, 0.44, 0.37], [0.44, 0.33, 0.32]];
  const STONE = [0.62, 0.58, 0.55], STONE2 = [0.5, 0.47, 0.46];
  const rock = (x, z, r, solid = true) => {
    g.merge(Geometry.icosphere(r, 0, R.pick(ROCK), { jitter: 0.3, seed: (R() * 1e6) | 0, squashY: 0.75 }), { position: [x, r * 0.35, z], rotation: [0, R() * 6, 0] });
    if (solid) colliders.push({ x, z, r: r * 0.95 });
  };
  const near = (x, z, d) => Math.hypot(x, z) < d || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 2.5);

  // 테두리 절벽 (밖으로 못 나가게 보이는 벽)
  for (let side = 0; side < 4; side++) {
    for (let t = -ARENA - 4; t <= ARENA + 4; t += R.range(2.2, 3.4)) {
      const d = ARENA + R.range(1, 3.5);
      const [x, z] = side === 0 ? [t, d] : side === 1 ? [t, -d] : side === 2 ? [d, t] : [-d, t];
      rock(x, z, R.range(1.6, 3.2), false);
    }
  }
  // 폐허: 부서진 벽 + 기둥
  for (let i = 0; i < 9; i++) {
    let x, z, k = 0;
    do { x = R.range(-ARENA + 6, ARENA - 6); z = R.range(-ARENA + 6, ARENA - 6); } while (near(x, z, 9) && ++k < 30);
    const yaw = R() * Math.PI, len = R.range(3, 6), c = Math.cos(yaw), s = Math.sin(yaw);
    for (let t = -len / 2; t < len / 2; t += 1) {
      const h = R.range(0.5, 2.4);
      if (R() < 0.2) continue;
      g.merge(Geometry.box(1.05, h, 0.7, R() < 0.5 ? STONE : STONE2), { position: [x + c * t, 0, z - s * t], rotation: [0, yaw, R.range(-0.06, 0.06)] });
      colliders.push({ x: x + c * t, z: z - s * t, r: 0.6 });
    }
    // 무너진 기둥
    g.merge(Geometry.cylinder(0.4, 0.45, R.range(2.5, 4), 6, STONE), { position: [x - s * 2.5, 0, z - c * 2.5] });
    colliders.push({ x: x - s * 2.5, z: z - c * 2.5, r: 0.5 });
    g.merge(Geometry.cylinder(0.4, 0.4, 2.6, 6, STONE2), { position: [x + s * 2, 0.4, z + c * 2], rotation: [0, R() * 3, Math.PI / 2] });
  }
  // 분화구: 둥근 테두리 돌 + 어두운 바닥
  for (let i = 0; i < 7; i++) {
    let x, z, k = 0;
    do { x = R.range(-ARENA + 6, ARENA - 6); z = R.range(-ARENA + 6, ARENA - 6); } while (near(x, z, 8) && ++k < 30);
    const rad = R.range(2, 3.5);
    g.merge(Geometry.cylinder(rad * 0.9, rad, 0.03, 9, [0.42, 0.3, 0.27]), { position: [x, 0.005, z] });
    for (let a = 0; a < Math.PI * 2; a += R.range(0.5, 0.8)) rock(x + Math.cos(a) * rad, z + Math.sin(a) * rad, R.range(0.25, 0.5), false);
  }
  // 큰 바위
  for (let i = 0; i < 22; i++) {
    let x, z, k = 0;
    do { x = R.range(-ARENA + 3, ARENA - 3); z = R.range(-ARENA + 3, ARENA - 3); } while (near(x, z, 7) && ++k < 30);
    rock(x, z, R.range(0.8, 1.7));
    if (R() < 0.6) rock(x + R.range(-1.4, 1.4), z + R.range(-1.4, 1.4), R.range(0.3, 0.6), false);
  }
  // 자갈
  for (let i = 0; i < 140; i++) rock(R.range(-ARENA, ARENA), R.range(-ARENA, ARENA), R.range(0.1, 0.22), false);
  // 부서진 메카 잔해 (분위기)
  for (let i = 0; i < 5; i++) {
    let x, z, k = 0;
    do { x = R.range(-ARENA + 6, ARENA - 6); z = R.range(-ARENA + 6, ARENA - 6); } while (near(x, z, 8) && ++k < 30);
    const y = R() * 6;
    g.merge(Geometry.box(1.4, 0.9, 1.1, [0.32, 0.33, 0.38]), { position: [x, -0.15, z], rotation: [0.3, y, 0.25] });
    g.merge(Geometry.box(0.5, 0.45, 0.5, [0.28, 0.3, 0.34]), { position: [x + 0.9, 0, z + 0.4], rotation: [0.6, y, 0.9] });
    g.merge(Geometry.cylinder(0.12, 0.12, 1.6, 5, [0.25, 0.26, 0.3]), { position: [x - 0.4, 0.4, z], rotation: [0.2, y, 1.2] });
    colliders.push({ x, z, r: 0.9 });
  }
  scene.add(new Mesh(g, new Material(), 'scenery'));
  return { colliders };
}

// 원형 충돌체 밀어내기
export function pushOut(o, r, colliders) {
  for (const c of colliders) {
    const dx = o.x - c.x, dz = o.z - c.z, rr = r + c.r;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
    const d = Math.hypot(dx, dz);
    if (d < rr && d > 1e-4) { o.x = c.x + (dx / d) * rr; o.z = c.z + (dz / d) * rr; }
  }
  const lim = ARENA - 1.2;
  o.x = Math.max(-lim, Math.min(lim, o.x));
  o.z = Math.max(-lim, Math.min(lim, o.z));
}
