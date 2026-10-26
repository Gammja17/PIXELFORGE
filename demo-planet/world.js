// PixelForge Worlds — 픽셀 행성 샌드박스
//
//  - 노이즈로 만든 로우폴리 행성 (바다, 대륙, 산, 바이옴, 구름, 대기, 달)
//  - 멀리서는 지구본, 확대하면 지면으로 내려가며 3/4 시점으로 기울어지는 카메라
//  - 사람 하나하나가 일하고, 먹고, 자고, 가정을 꾸리는 생활 시뮬레이션 (life.js)

import {
  Engine, Node, Mesh, InstancedMesh, Material, Geometry, ParticleSystem, Water,
  fbm3, rng, v3, m4, clamp, lerp, smoothstep, damp, axisAngle, basisMatrix,
} from '../engine/index.js';
import { createLife, DAY } from './life.js';
import { createSpace, D_HOME } from './space.js';

export const R = 20; // 해수면 반지름

export const PRESETS = {
  earth: { name: '지구', oxygen: 21, temp: 15, liquid: 'water', sea: 0.0, land: 'earth', atmo: [0.45, 0.7, 1], atmoStrength: 1, clouds: 1, moon: true },
  mars: { name: '붉은 행성', oxygen: 0.2, temp: -55, liquid: 'none', sea: -0.35, land: 'mars', atmo: [1, 0.62, 0.42], atmoStrength: 0.5, clouds: 0.12, moon: true },
  ice: { name: '얼음 행성', oxygen: 19, temp: -42, liquid: 'water', sea: 0.06, land: 'earth', atmo: [0.72, 0.9, 1], atmoStrength: 0.9, clouds: 0.7, moon: false },
  lava: { name: '용암 행성', oxygen: 1, temp: 140, liquid: 'lava', sea: -0.02, land: 'lava', atmo: [1, 0.45, 0.25], atmoStrength: 0.75, clouds: 0.5, moon: false },
};

// 구 메시 데이터 (정이십면체 분할)
// ---------------------------------------------------------------------
function icoData(subdiv) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v3.norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const k = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (!cache.has(k)) { verts.push(v3.norm(v3.scale(v3.add(verts[a], verts[b]), 0.5))); cache.set(k, verts.length - 1); }
      return cache.get(k);
    };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  return { verts, faces };
}

// 접평면 기준 프레임: 위(법선), 동쪽, 북쪽
function tangentFrame(n) {
  let e = v3.cross([0, 1, 0], n);
  if (v3.len(e) < 1e-4) e = [1, 0, 0];
  e = v3.norm(e);
  return { n, e, u: v3.cross(n, e) };
}
const latOf = (d) => Math.asin(clamp(d[1], -1, 1)) * 180 / Math.PI;
const rotateAround = (v, axis, a) => {
  const c = Math.cos(a), s = Math.sin(a), k = axis, d = v3.dot(k, v);
  const cr = v3.cross(k, v);
  return [v[0] * c + cr[0] * s + k[0] * d * (1 - c), v[1] * c + cr[1] * s + k[1] * d * (1 - c), v[2] * c + cr[2] * s + k[2] * d * (1 - c)];
};

export function createWorld(canvas, ui = {}) {
  const engine = new Engine(canvas, { pixelScale: 4, stick: false });
  const { scene, camera, input, renderer, gl } = engine;
  const st = renderer.settings;
  st.clouds = false;          // 평면용 구름 그림자는 끔 (행성은 진짜 구름이 그림자를 드리움)
  st.depthThreshold = 0.35;
  st.saturation = 1.08;
  st.vignette = 0.3;
  scene.stars = true;
  scene.fog = { color: [0.02, 0.02, 0.05], near: 1e5, far: 2e5 };
  scene.ambientSky = [0.27, 0.29, 0.42];
  scene.ambientGround = [0.22, 0.22, 0.32];

  const globe = scene.add(new Node('globe'));
  globe.matrix = m4.identity();

  const env = { preset: 'earth', oxygen: 21, temp: 15, liquid: 'water', sea: 0, land: 'earth', seed: 7 };
  const log = [];
  const say = (text, kind = '') => { log.push({ text, kind, t: performance.now() }); if (log.length > 40) log.shift(); ui.onLog?.(log); };

  // =====================================================================
  // 지형
  // =====================================================================
  let seedOff = [0, 0, 0];
  function elevation(d) {
    const [x, y, z] = [d[0] + seedOff[0], d[1] + seedOff[1], d[2] + seedOff[2]];
    const c = fbm3(x * 1.15, y * 1.15, z * 1.15, 5);
    const ridge = 1 - Math.abs(fbm3(x * 3.1 + 9, y * 3.1, z * 3.1, 3) * 2 - 1);
    return (c - 0.5) * 3.4 + (ridge - 0.55) * 0.42 - env.sea;
  }
  const moisture = (d) => fbm3(d[0] * 2.2 + 40 + seedOff[0], d[1] * 2.2, d[2] * 2.2, 3);
  // 고도 → 반지름 방향 변위 (육지는 계단식 → 픽셀 절벽)
  function disp(e) {
    if (e < 0) return Math.max(e * 2.2, -2.6);
    const step = 0.13, t = Math.floor(e / step) * step;
    const ter = t + smoothstep(0.6, 1, (e - t) / step) * step;
    return 0.05 + ter * 2.4;
  }
  const surfaceR = (d) => R + disp(elevation(d));
  function temperature(d, e = elevation(d)) {
    const lat = Math.abs(latOf(d)) / 90;
    return env.temp + 12 - Math.pow(lat, 1.4) * 60 - Math.max(e, 0) * 26;
  }
  const hasWater = () => env.liquid === 'water' && env.temp > -60;
  function vegetation(T) {
    if (env.land !== 'earth') return 0;
    return smoothstep(5, 14, env.oxygen) * smoothstep(-14, 2, T) * (1 - smoothstep(40, 58, T)) * (hasWater() ? 1 : 0.1);
  }
  // 위치의 생태 정보
  function cellInfo(d) {
    const e = elevation(d), T = temperature(d, e), m = moisture(d), veg = vegetation(T);
    let biome = 'grass';
    if (e < 0) biome = 'sea';
    else if (T < -10) biome = 'snow';
    else if (e > 0.62) biome = 'rock';
    else if (e < 0.05) biome = 'beach';
    else if (T > 22 && m < 0.44) biome = 'desert';
    else if (T < 3) biome = 'tundra';
    else if (T > 20 && m > 0.58) biome = 'jungle';
    else if (m > 0.5) biome = 'forest';
    const fertBy = { grass: 1, forest: 0.75, jungle: 0.8, tundra: 0.35, beach: 0.2, desert: 0.06, rock: 0.05, snow: 0, sea: 0 };
    return { e, T, m, veg, biome, fert: fertBy[biome] * veg, land: e >= 0 || env.liquid === 'none' || (env.liquid === 'water' && T < -8) };
  }

  function landColor(d, e, T, m) {
    const n = fbm3(d[0] * 9, d[1] * 9, d[2] * 9, 2);
    if (env.land === 'mars') {
      if (Math.abs(latOf(d)) > 74) return [0.92, 0.9, 0.88];
      const a = [0.76, 0.42, 0.26], b = [0.6, 0.31, 0.2], c = [0.48, 0.3, 0.26];
      return v3.lerp(v3.lerp(a, b, smoothstep(0.4, 0.6, n)), c, smoothstep(0.35, 0.8, e));
    }
    if (env.land === 'lava') {
      const a = [0.2, 0.17, 0.2], b = [0.3, 0.22, 0.22];
      return v3.lerp(a, b, smoothstep(0.35, 0.65, n));
    }
    if (e < 0) return v3.lerp([0.72, 0.65, 0.48], [0.38, 0.4, 0.42], smoothstep(0, -0.6, e));
    if (T < -10 || e > 0.8) return [0.93, 0.95, 1];
    if (e > 0.62) return v3.lerp([0.56, 0.53, 0.52], [0.45, 0.43, 0.46], n);
    if (e < 0.05) return [0.94, 0.85, 0.6];
    const veg = vegetation(T);
    let green;
    if (T > 20 && m > 0.58) green = [0.18, 0.48, 0.22];
    else if (m > 0.5) green = [0.27, 0.55, 0.25];
    else green = [0.46, 0.68, 0.3];
    green = v3.lerp(green, v3.scale(green, 1.12), n);
    let bare = [0.6, 0.53, 0.44];
    if (T > 22 && m < 0.44) bare = [0.91, 0.75, 0.46];
    else if (T < 3) bare = [0.58, 0.6, 0.52];
    const c = v3.lerp(bare, green, (T > 22 && m < 0.44) ? veg * 0.15 : T < 3 ? veg * 0.4 : veg);
    return c;
  }

  // 행성 메시 만들기
  const ico = icoData(5);
  let terrain = null, terrainFaces = null;
  function buildTerrain() {
    const vR = ico.verts.map((d) => v3.scale(d, surfaceR(d)));
    const g = new Geometry();
    terrainFaces = [];
    for (const [a, b, c] of ico.faces) {
      const d = v3.norm(v3.add(v3.add(ico.verts[a], ico.verts[b]), ico.verts[c]));
      const e = elevation(d), T = temperature(d, e), m = moisture(d);
      terrainFaces.push({ d, e, T, m });
      g.tri(vR[a], vR[b], vR[c], landColor(d, e, T, m));
    }
    if (terrain) { terrain.geometry.dispose(gl); terrain.geometry = g; }
    else terrain = globe.add(new Mesh(g, new Material({ outline: true }), 'terrain'));
  }
  function repaintTerrain() {
    terrain.geometry.paint((c, n, i) => { const f = terrainFaces[i]; f.T = temperature(f.d, f.e); return landColor(f.d, f.e, f.T, f.m); });
    terrain.geometry.dispose(gl);
  }

  // 바다 (물 / 얼음 / 용암)
  const oceanGeo = (() => {
    const { verts, faces } = icoData(4);
    const g = new Geometry();
    for (const [a, b, c] of faces) g.tri(v3.scale(verts[a], R), v3.scale(verts[b], R), v3.scale(verts[c], R));
    return g;
  })();
  const ocean = new Water({ geometry: oceanGeo, radial: true, waveHeight: 0.035 });
  ocean.node = globe;
  ocean.depthRange = 1.4;
  const iceShell = globe.add(new Mesh(oceanGeo, new Material({ color: [0.82, 0.92, 1] })));
  function applyLiquid() {
    scene.water.length = 0;
    iceShell.visible = false;
    if (env.liquid === 'water' && env.temp <= -30) { iceShell.visible = true; return; }
    if (env.liquid === 'water') {
      Object.assign(ocean, { shallow: [0.36, 0.82, 0.8], deep: [0.1, 0.27, 0.6], foam: [0.93, 0.99, 1], emissive: 0, waveHeight: 0.035 });
      scene.water.push(ocean);
    } else if (env.liquid === 'lava') {
      Object.assign(ocean, { shallow: [1, 0.55, 0.12], deep: [0.75, 0.16, 0.06], foam: [1, 0.92, 0.5], emissive: 1, waveHeight: 0.05 });
      scene.water.push(ocean);
    }
  }

  // 대기
  const atmoGeo = (() => { const { verts, faces } = icoData(3); const g = new Geometry(); for (const [a, b, c] of faces) g.tri(v3.scale(verts[a], R + 3.6), v3.scale(verts[b], R + 3.6), v3.scale(verts[c], R + 3.6)); return g; })();
  const atmo = globe.add(new Mesh(atmoGeo, new Material({ color: [0.45, 0.7, 1], rim: 1, outline: false, castShadow: false })));

  // 구름
  const cloudGeo = (() => {
    const g = new Geometry(), Rn = rng(3);
    for (let i = 0; i < 4; i++) g.merge(Geometry.icosphere(Rn.range(0.5, 0.85), 1, [1, 1, 1], { jitter: 0.1, seed: i + 1, squashY: 0.55 }), { position: [Rn.range(-0.9, 0.9), Rn.range(0, 0.2), Rn.range(-0.6, 0.6)] });
    return g;
  })();
  const cloudNode = globe.add(new Node('clouds'));
  cloudNode.matrix = m4.identity();
  const clouds = cloudNode.add(new InstancedMesh(cloudGeo, new Material({ color: [1, 1, 1], outline: true }), 120));
  const cloudData = [];
  function buildClouds(amount) {
    const Rn = rng(env.seed * 31 + 5);
    cloudData.length = 0;
    const n = Math.round(90 * amount);
    for (let i = 0; i < n; i++) {
      const d = v3.norm([Rn.range(-1, 1), Rn.range(-0.85, 0.85), Rn.range(-1, 1)]);
      cloudData.push({ d, s: Rn.range(0.7, 1.5), rot: Rn() * 6.28 });
    }
    clouds.count = cloudData.length;
    cloudData.forEach((c, i) => {
      const f = tangentFrame(c.d);
      const fw = rotateAround(f.u, c.d, c.rot), rt = v3.cross(c.d, fw);
      clouds.setAt(i, basisMatrix(rt, c.d, fw, v3.scale(c.d, R + 3.0 + (i % 3) * 0.25), c.s), [1, 1, 1], 0);
    });
  }

  // 달
  const moonPivot = scene.add(new Node('moonPivot'));
  const moon = moonPivot.add(new Mesh(Geometry.icosphere(2.6, 1, [1, 1, 1], { jitter: 0.12, seed: 9 }), new Material({ color: [0.72, 0.72, 0.76] })));
  moon.position = [34, 4, 0];


  // =====================================================================
  // 나무 (베이면 그루터기 → 묘목 → 다시 자람)
  // =====================================================================
  const treeGeos = {
    round: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.035, 0.05, 0.22, 5, [0.45, 0.3, 0.2])); g.merge(Geometry.icosphere(0.15, 1, [0.3, 0.6, 0.27], { jitter: 0.12, seed: 2, squashY: 0.9 }), { position: [0, 0.3, 0] }); return g; })(),
    pine: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.03, 0.04, 0.1, 5, [0.42, 0.28, 0.2])); g.merge(Geometry.cone(0.14, 0.24, 6, [0.2, 0.45, 0.32]), { position: [0, 0.08, 0] }); g.merge(Geometry.cone(0.1, 0.2, 6, [0.22, 0.5, 0.34]), { position: [0, 0.22, 0] }); return g; })(),
    palm: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.03, 0.04, 0.32, 5, [0.55, 0.42, 0.28])); for (let i = 0; i < 5; i++) g.merge(Geometry.box(0.05, 0.02, 0.2, [0.3, 0.62, 0.25]), { position: [Math.sin(i * 1.26) * 0.08, 0.32, Math.cos(i * 1.26) * 0.08], rotation: [0.4, i * 1.26, 0] }); return g; })(),
    stump: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.045, 0.055, 0.04, 6, [0.5, 0.36, 0.24])); g.merge(Geometry.cylinder(0.04, 0.04, 0.004, 6, [0.85, 0.72, 0.5]), { position: [0, 0.04, 0] }); return g; })(),
  };
  const treeMeshes = {};
  for (const k of Object.keys(treeGeos)) treeMeshes[k] = globe.add(new InstancedMesh(treeGeos[k], new Material({ wind: k === 'stump' ? 0 : 0.04 }), 6000));
  const trees = []; // { d, type, s, alive, burnt, stump, grow }
  function placeTreeAt(d, type, s, grow = 1) { trees.push({ d, type, s, alive: true, grow }); }
  function seedTrees() {
    trees.length = 0;
    const Rn = rng(env.seed * 7 + 1);
    for (const f of terrainFaces) {
      if (f.e < 0.06 || f.e > 0.6) continue;
      const veg = vegetation(f.T);
      const density = (f.m > 0.5 ? 0.55 : 0.12) * (f.T > 20 && f.m > 0.58 ? 1.4 : 1);
      if (veg < 0.3 || Rn() > density) continue;
      const type = f.T < 6 ? 'pine' : (f.T > 22 && f.m < 0.5 ? 'palm' : 'round');
      for (let k = 0; k < 2; k++) {
        const jit = v3.norm(v3.add(f.d, [Rn.range(-0.012, 0.012), Rn.range(-0.012, 0.012), Rn.range(-0.012, 0.012)]));
        if (k === 0 || Rn() < 0.4) placeTreeAt(jit, type, Rn.range(0.8, 1.3));
      }
    }
    refreshTrees();
  }
  let treesDirty = false;
  function refreshTrees() {
    treesDirty = false;
    const counts = { round: 0, pine: 0, palm: 0, stump: 0 };
    for (const t of trees) {
      if (t.e === undefined) { t.e = elevation(t.d); t.sr = R + disp(t.e); }
      const T = temperature(t.d, t.e);
      t.alive = !t.burnt && vegetation(T) > 0.25;
      const kind = t.stump || t.burnt ? 'stump' : t.type;
      const m = treeMeshes[kind];
      if (counts[kind] >= m.capacity) continue;
      const f = tangentFrame(t.d);
      const up = t.d, fw = rotateAround(f.u, up, t.s * 10), rt = v3.cross(up, fw);
      const pos = v3.scale(t.d, t.sr - 0.02);
      const scale = kind === 'stump' ? t.s : (t.alive ? t.s : t.s * 0.75) * (t.grow ?? 1);
      const col = t.burnt ? [0.3, 0.26, 0.24] : t.alive ? [1, 1, 1] : [0.62, 0.5, 0.4];
      m.setAt(counts[kind]++, basisMatrix(rt, up, fw, pos, scale), col, 0);
    }
    for (const k in counts) treeMeshes[k].count = counts[k];
  }

  // =====================================================================
  // 생활 시뮬레이션
  // =====================================================================
  const fx = new ParticleSystem({ max: 4000, gravity: [0, -3.5, 0], drag: 1.4, node: globe, radialGravity: true });
  scene.particles.push(fx);
  const surf = (d, lift = 0) => v3.scale(d, surfaceR(d) + lift);
  const distU = (a, b) => v3.len(v3.sub(a, b)) * R;
  const jitterDir = (d, r) => { const f = tangentFrame(d); return v3.norm(v3.add(d, v3.add(v3.scale(f.e, (Math.random() - 0.5) * 2 * r / R), v3.scale(f.u, (Math.random() - 0.5) * 2 * r / R)))); };
  const lifeCtx = { R, globe, fx, env, cellInfo, elevation, disp, surfaceR, tangentFrame, rotateAround, trees, markTrees: () => { treesDirty = true; }, say };
  const life = createLife(lifeCtx);
  const space = createSpace({ R, globe, fx, life, say, scene, orbitalStrike: (d) => meteor(d, true) });
  lifeCtx.space = space;

  // ---- 폭발 (운석) ----
  const blasts = [];
  const blastGeo = Geometry.icosphere(1, 1, [1, 1, 1]);
  function explosion(d, power = 1) {
    const p = surf(d, 0.05), f = tangentFrame(d);
    const ball = globe.add(new Mesh(blastGeo, new Material({ color: [1, 0.85, 0.5], emissive: 0.8, outline: false, castShadow: false })));
    ball.position = p;
    const light = { position: [0, 0, 0], local: p, color: [1, 0.7, 0.4], radius: 6 * power, intensity: 1.4 };
    scene.lights.push(light);
    blasts.push({ t: 0, ball, light, power });
    for (let i = 0; i < 90 * power; i++) {
      const dir = v3.norm(v3.add(v3.scale(d, Math.random() * 1.2), v3.add(v3.scale(f.e, Math.random() * 2 - 1), v3.scale(f.u, Math.random() * 2 - 1))));
      fx.emit({ position: p, velocity: v3.scale(dir, (3 + Math.random() * 7) * power), life: 0.5 + Math.random() * 0.8, size: Math.random() < 0.3 ? 3 : 2, sizeEnd: 1, color: [1, 0.95, 0.7], colorEnd: [0.9, 0.3, 0.1], emissive: 1, gravity: 0.8 });
    }
    for (let i = 0; i < 18 * power; i++) {
      fx.emit({ position: v3.add(p, v3.scale(d, 0.2)), velocity: v3.add(v3.scale(d, 0.8 + Math.random() * 1.5), v3.add(v3.scale(f.e, (Math.random() - 0.5) * 2.5), v3.scale(f.u, (Math.random() - 0.5) * 2.5))), life: 1.4 + Math.random(), size: 3, sizeEnd: 6, color: [0.4, 0.36, 0.38], colorEnd: [0.22, 0.2, 0.24], gravity: -0.05, fadeIn: 0.1 });
    }
    shake = Math.max(shake, 0.25 * power);
  }
  const meteors = [];
  const meteorGeo = Geometry.icosphere(0.35, 1, [1, 1, 1], { jitter: 0.25, seed: 4 });
  function meteor(d, strike = false) {
    const f = tangentFrame(d);
    const start = v3.add(v3.scale(d, R + 16), v3.scale(f.e, 6));
    const mesh = globe.add(new Mesh(meteorGeo, new Material({ color: [1, 0.55, 0.2], emissive: 0.9, outline: false, castShadow: false })));
    const light = { position: [0, 0, 0], local: start, color: [1, 0.6, 0.3], radius: 4, intensity: 1 };
    scene.lights.push(light);
    if (strike) { mesh.material.color = [1, 0.3, 0.3]; mesh.setScale(0.6); }
    meteors.push({ d, start, end: surf(d), t: 0, mesh, light, strike });
  }
  function impact(d, power = 1.6, strike = false) {
    explosion(d, power);
    const r = 2.4 * power;
    life.damage(d, r);
    for (const t of trees) if (distU(t.d, d) < r * 0.8) t.burnt = true;
    refreshTrees();
    if (!strike) say('운석이 떨어졌어요!', 'boom');
  }

  // =====================================================================
  // 카메라: 지구본 ↔ 지면
  // =====================================================================
  camera.yaw = 0; camera.pitch = 0; camera.distance = 60;
  const view = { lon: 0.6, lat: 0.35, zoom: 0, zoomGoal: 0.08 };
  let shake = 0, homeBig = 1;
  const VH_FAR = R * 3.1, VH_NEAR = 1.9, VH_SYS = 1750;
  let globeRot = m4.identity();
  function updateCamera(dt, time) {
    const dx = input.takeRotate(), dy = input.takeRotateV();
    const z = Math.max(0, view.zoom);
    const k = lerp(0.62, 0.035, Math.pow(z, 0.7));
    view.lon -= dx * k;
    view.lat = clamp(view.lat + dy * k, -1.35, 1.35);
    view.zoomGoal = clamp(view.zoomGoal - Math.log(input.takeZoom()) * 0.55, -1, 1);
    view.zoom = clamp(damp(view.zoom, view.zoomGoal, view.zoom < 0 || view.zoomGoal < 0 ? 5 : 9, dt), -1, 1);

    // 줌: 1(지면) … 0(지구본) … -1(태양계 전체)
    const aspect = canvas.clientHeight / Math.max(1, canvas.clientWidth);
    const vhGlobe = VH_FAR * Math.max(1, aspect * 0.85);
    const sysK = clamp(-view.zoom, 0, 1);
    const vh = view.zoom >= 0 ? lerp(vhGlobe, VH_NEAR, Math.pow(view.zoom, 0.55)) : vhGlobe * Math.pow(VH_SYS * Math.max(1, aspect * 0.7) / vhGlobe, smoothstep(0, 1, sysK));
    camera.viewHeight = vh;
    camera.distance = 60 + 3200 * smoothstep(0, 0.12, sysK);

    const n = [Math.cos(view.lat) * Math.sin(view.lon), Math.sin(view.lat), Math.cos(view.lat) * Math.cos(view.lon)];
    const f = tangentFrame(n);
    // 행성 좌표 → 카메라 좌표: 동쪽→오른쪽, 북쪽→위, 법선→카메라 쪽
    let E = f.e, U = f.u, Nn = n;
    // 태양계 화면: 공전면을 비스듬히 내려다보는 시점으로 부드럽게 바뀜 (드래그로 공전면을 돌림)
    const sb = smoothstep(0.04, 0.4, sysK);
    if (sb > 0) {
      const el = 0.95, h = [Math.sin(view.lon), 0, Math.cos(view.lon)];
      const e2 = [Math.cos(view.lon), 0, -Math.sin(view.lon)];
      const n2 = v3.norm(v3.add(v3.scale(h, Math.cos(el)), [0, Math.sin(el), 0]));
      Nn = v3.norm(v3.lerp(Nn, n2, sb));
      E = v3.norm(v3.sub(v3.lerp(E, e2, sb), v3.scale(Nn, v3.dot(v3.lerp(E, e2, sb), Nn))));
      U = v3.cross(Nn, E);
    }
    const A = new Float32Array(16);
    for (let c = 0; c < 3; c++) { A[c * 4] = E[c]; A[c * 4 + 1] = U[c]; A[c * 4 + 2] = Nn[c]; }
    A[15] = 1;
    const tilt = smoothstep(0.3, 1, view.zoom) * 0.95; // 확대할수록 3/4 시점으로 기울어짐
    globeRot = m4.multiply(axisAngle([1, 0, 0], -tilt), A);
    // 태양계 화면에서는 고향 행성도 과장해서 크게
    homeBig = 1 + sb * 2.2;
    globe.matrix = homeBig > 1.001 ? m4.multiply(globeRot, m4.fromTRS([0, 0, 0], [0, 0, 0], [homeBig, homeBig, homeBig])) : globeRot;
    space.setHomeBig(homeBig);

    const poi = m4.transformPoint(globeRot, v3.scale(n, surfaceR(n)));
    const follow = smoothstep(0, 0.55, view.zoom);
    shake = Math.max(0, shake - dt * 0.8);
    const s = shake * shake * 0.6;
    // 태양계로 빠질수록 화면 중심이 태양 쪽으로 이동
    const sunW = m4.transformPoint(globeRot, space.sunPos());
    const toSun = smoothstep(0.15, 0.6, sysK);
    camera.target = [poi[0] * follow + sunW[0] * toSun + Math.sin(time * 61) * s, poi[1] * follow + sunW[1] * toSun + Math.cos(time * 53) * s, poi[2] * follow + sunW[2] * toSun];

    // 그림자맵은 보이는 범위만큼만 (가까울수록 선명)
    st.shadowSize = clamp(vh * 0.7, 4, R * 1.35);
    // 별이 행성 회전을 따라 살짝 흐름
    scene.starOffset = [view.lon * 90, view.lat * 90];
    moon.visible = PRESETS[env.preset].moon && view.zoom < 0.45;
    atmo.visible = view.zoom < 0.85;
    // 가까이 가면 구름이 시야를 가리지 않게 디더링으로 사라짐
    clouds.material.opacity = 1 - smoothstep(0.42, 0.68, view.zoom);
    clouds.visible = clouds.material.opacity > 0.02;
  }

  // 화면 탭 → 행성 표면 좌표 (행성 기준 방향 벡터)
  function pickSurface(x, y) {
    const ray = camera.screenRay(x, y, canvas.clientWidth, canvas.clientHeight, engine.scale, engine.dpr);
    // 월드 → 행성 좌표 (회전만 있으므로 전치)
    const inv = (v) => [v3.dot(v, [globeRot[0], globeRot[1], globeRot[2]]), v3.dot(v, [globeRot[4], globeRot[5], globeRot[6]]), v3.dot(v, [globeRot[8], globeRot[9], globeRot[10]])];
    const o = inv(ray.origin), dir = inv(ray.dir);
    // 대기권 구(R+3)와 만나는 지점부터 행진
    const b = v3.dot(o, dir), c = v3.dot(o, o) - (R + 3) * (R + 3), disc = b * b - c;
    if (disc < 0) return null;
    const t0 = Math.max(0, -b - Math.sqrt(disc));
    for (let t = t0; t < t0 + 2 * (R + 3); t += 0.04) {
      const p = v3.add(o, v3.scale(dir, t));
      const l = v3.len(p);
      if (l > R + 3) continue;
      const d = v3.scale(p, 1 / l);
      if (l <= Math.max(surfaceR(d), R)) return d;
    }
    return null;
  }

  // =====================================================================
  // 신의 도구
  // =====================================================================
  let tool = 'look';
  const NEED = { human: { oxy: 12, tMin: -25, tMax: 45 }, sheep: { oxy: 10, tMin: -20, tMax: 42 }, wolf: { oxy: 10, tMin: -35, tMax: 40 } };
  function sparkle(d, color) { const p = surf(d, 0.2); for (let i = 0; i < 14; i++) fx.emit({ position: p, velocity: v3.add(v3.scale(d, 1 + Math.random() * 1.5), [(Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5]), life: 0.7, size: 2, sizeEnd: 1, color, emissive: 0.9, gravity: 0.4 }); }
  function warnEnv(info, type) {
    const n = NEED[type];
    if (env.oxygen < n.oxy) say('산소가 거의 없어요. 곧 숨이 막힐 거예요…', 'warn');
    else if (info.T < n.tMin) say('너무 추워요!', 'warn');
    else if (info.T > n.tMax) say('너무 더워요!', 'warn');
    else if (!info.land) say('물 위에 떨어뜨렸어요', 'warn');
  }
  function useTool(d) {
    const info = cellInfo(d);
    if (tool === 'human') { life.dropPeople(d, 4); warnEnv(info, 'human'); }
    else if (tool === 'sheep') { life.dropAnimals('sheep', d, 6); sparkle(d, [1, 1, 1]); warnEnv(info, 'sheep'); }
    else if (tool === 'wolf') { life.dropAnimals('wolf', d, 3); sparkle(d, [0.7, 0.7, 0.8]); warnEnv(info, 'wolf'); }
    else if (tool === 'tree') {
      for (let i = 0; i < 10; i++) { const td = jitterDir(d, 0.8); const ti = cellInfo(td); if (ti.e >= 0.05) placeTreeAt(td, ti.T < 6 ? 'pine' : ti.T > 22 && ti.m < 0.5 ? 'palm' : 'round', 0.8 + Math.random() * 0.5, 0.3); }
      refreshTrees(); sparkle(d, [0.5, 1, 0.5]);
      if (vegetation(info.T) < 0.25) say('여긴 식물이 살 수 없는 환경이라 나무가 시들어요', 'warn');
    } else if (tool === 'meteor') meteor(d);
    else if (tool === 'inspire') {
      const v = life.villages.slice().sort((a, b) => distU(a.d, d) - distU(b.d, d))[0];
      if (!v || distU(v.d, d) > 5) { say('마을 근처를 눌러 주세요', 'warn'); return; }
      const before = v.tribe.era;
      life.addTech(v.tribe, 90);
      for (let i = 0; i < 3; i++) sparkle(jitterDir(v.d, 0.6), [1, 0.9, 0.5]);
      if (v.tribe.era === before) say(`${v.tribe.name}에게 지식을 내려줬어요 (${life.eraName(v.tribe)})`, 'era');
    }
    else if (tool === 'war') life.warNear(d);
    else {
      const hit = life.pickAt(d);
      if (hit?.person) { life.select(hit.person); view.zoomGoal = Math.max(view.zoomGoal, 0.88); return; }
      life.select(null);
      if (hit?.village) { const t = life.describeVillage(hit.village); ui.onInspect?.(t.title, t.sub); return; }
      const bnames = { grass: '초원', forest: '숲', jungle: '밀림', tundra: '툰드라', beach: '해변', desert: '사막', rock: '산', snow: '설원', sea: '바다' };
      ui.onInspect?.(`${bnames[info.biome]} · ${Math.round(info.T)}°C`, env.land === 'earth' ? `식물 ${Math.round(info.veg * 100)}%` : '생명체가 살기 어려운 땅');
    }
  }

  // =====================================================================
  // 행성 설정
  // =====================================================================
  function setPreset(name) {
    const p = PRESETS[name];
    env.preset = name;
    Object.assign(env, { oxygen: p.oxygen, temp: p.temp, liquid: p.liquid, sea: p.sea, land: p.land });
    regenerate(false);
    ui.onEnv?.(env);
  }
  function regenerate(keepLife = true) {
    const Rn = rng(env.seed);
    seedOff = [Rn.range(-50, 50), Rn.range(-50, 50), Rn.range(-50, 50)];
    buildTerrain();
    applyLiquid();
    const p = PRESETS[env.preset];
    atmo.material.color = p.atmo;
    atmo.material.rim = p.atmoStrength * smoothstep(0, 10, env.oxygen + (env.land !== 'earth' ? 6 : 0));
    buildClouds(p.clouds * (env.liquid === 'water' ? 1 : 0.6));
    clouds.material.color = env.land === 'lava' ? [0.4, 0.36, 0.38] : env.land === 'mars' ? [0.95, 0.82, 0.7] : [1, 1, 1];
    seedTrees();
    life.seedRocks();
    if (!keepLife) { life.reset(); space?.reset(); } else life.drownCheck();
  }
  let envTimer = 0;
  function setEnv(o) {
    Object.assign(env, o);
    if (env.preset === 'earth' || env.preset === 'ice') env.liquid = 'water';
    clearTimeout(envTimer);
    envTimer = setTimeout(() => {
      repaintTerrain(); applyLiquid(); refreshTrees();
      const p = PRESETS[env.preset];
      atmo.material.rim = p.atmoStrength * smoothstep(0, 10, env.oxygen + (env.land !== 'earth' ? 6 : 0));
    }, 120);
  }

  // =====================================================================
  // 메인 루프
  // =====================================================================
  let speed = 1, acc = 0, dayAngle = 0.4, treeT = 0;
  function simulateStep(sdt) {
    acc += sdt;
    let n = 0;
    while (acc >= 0.1 && n < 6) { const step = Math.min(0.4, acc); life.tick(step); acc -= step; n++; }
    if (n === 6) acc = 0;
    life.moveAll(sdt);
  }
  engine.onUpdate = (dt, time) => {
    for (const t of input.takeTaps()) {
      if (view.zoom < -0.12) {
        // 태양계에서는 행성을 누르면 정보, 고향 행성을 누르면 돌아가기
        let best = null, bd = 60;
        for (const b of space.labels()) { const [x, y] = toScreen(b.p); const dd = Math.hypot(x - t.x, y - t.y); if (dd < bd) { bd = dd; best = b; } }
        if (best?.id === 'home') view.zoomGoal = 0.1;
        else if (best) ui.onInspect?.(best.name, best.sub);
        continue;
      }
      const d = pickSurface(t.x, t.y); if (d) useTool(d);
    }
    // 선택한 사람 따라가기
    const sel = life.selected;
    if (sel) {
      const d = sel.carriedBy ? sel.carriedBy.d : sel.d;
      const lat = Math.asin(clamp(d[1], -1, 1)), lon = Math.atan2(d[0], d[2]);
      let dl = lon - view.lon; dl = ((dl + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      view.lon += dl * Math.min(1, dt * 4); view.lat += (lat - view.lat) * Math.min(1, dt * 4);
      const info = life.describePerson(sel);
      ui.onInspect?.(info.title, info.sub, true);
    } else if (selWas) ui.onInspect?.(null);
    selWas = !!sel;
    updateCamera(dt, time);

    const sdt = dt * speed;
    dayAngle += sdt * (Math.PI * 2) / DAY;
    sunPlanet = v3.norm([Math.cos(dayAngle), 0.25, Math.sin(dayAngle)]);
    life.setSun(sunPlanet);
    scene.sun.direction = m4.transformDir(globeRot, sunPlanet);
    scene.sun.color = env.land === 'lava' ? [1, 0.8, 0.65] : [1, 0.96, 0.88];
    scene.sun.intensity = 1.05;
    moonPivot.matrix = m4.multiply(globe.matrix, axisAngle([0.15, 1, 0.1], time * 0.03 + 1));
    cloudNode.matrix = axisAngle([0, 1, 0], time * 0.006);

    if (speed > 0) simulateStep(sdt);
    treeT += dt;
    if (treesDirty && treeT > 0.4) { treeT = 0; refreshTrees(); }

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t += dt * 0.9;
      const p = v3.lerp(m.start, m.end, m.t * m.t);
      m.mesh.position = p; m.mesh.rotation = [time * 5, time * 3, 0];
      m.light.local = p;
      fx.emit({ position: p, velocity: [0, 0, 0], life: 0.5, size: 3, sizeEnd: 1, color: [1, 0.85, 0.4], colorEnd: [0.6, 0.2, 0.1], emissive: 1, gravity: 0 });
      if (m.t >= 1) { globe.remove(m.mesh); scene.lights.splice(scene.lights.indexOf(m.light), 1); meteors.splice(i, 1); impact(m.d, m.strike ? 0.55 : 1.6, m.strike); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.t += dt;
      const k = Math.min(1, b.t / 0.3);
      b.ball.setScale((0.2 + (1 - Math.pow(1 - k, 3)) * 1.4) * b.power);
      b.ball.material.opacity = 1 - smoothstep(0.1, 0.45, b.t);
      b.ball.material.color = v3.lerp([1, 0.95, 0.75], [0.9, 0.3, 0.1], k);
      b.light.intensity = 1.4 * Math.exp(-b.t * 4);
      if (b.t > 1) { globe.remove(b.ball); scene.lights.splice(scene.lights.indexOf(b.light), 1); blasts.splice(i, 1); }
    }
    for (const l of scene.lights) if (l.local) l.position = m4.transformPoint(globeRot, l.local);

    life.sync(time, view);
    space.update(dt, speed > 0 ? sdt : 0, dayAngle, sunPlanet, view, camera.viewHeight, time, globeRot);
    ui.onStats?.({ ...life.stats(), ...space.stats(), era: topEra() });
    ui.onLabels?.(villageLabels());
  };
  // 마을 이름표: 마을 위 지점을 화면 좌표(CSS 픽셀)로 투영
  // 행성 좌표 → 화면(CSS 픽셀)
  function toScreen(pLocal) {
    const st2 = renderer.stats, dpr = engine.dpr, sc = st2.scale;
    const w = m4.transformPoint(globeRot, pLocal);
    const P = camera.viewProj;
    const cx = P[0] * w[0] + P[4] * w[1] + P[8] * w[2] + P[12];
    const cy = P[1] * w[0] + P[5] * w[1] + P[9] * w[2] + P[13];
    const cw = P[3] * w[0] + P[7] * w[1] + P[11] * w[2] + P[15];
    const lx = (cx / cw * 0.5 + 0.5) * st2.lowW, ly = (cy / cw * 0.5 + 0.5) * st2.lowH;
    return [(lx - 1 - camera.subpixel[0]) * sc / dpr, canvas.clientHeight - (ly - 1 - camera.subpixel[1]) * sc / dpr];
  }
  function villageLabels() {
    const out = [];
    const st2 = renderer.stats, dpr = engine.dpr, sc = st2.scale;
    if (!st2.lowW) return out;
    const cssH = canvas.clientHeight;
    const far = 1 - smoothstep(0.1, 0.75, view.zoom);
    const back = v3.scale(camera.forward, -1);
    if (view.zoom < -0.12) {
      // 태양계: 천체 이름표
      const pxPerUnit = canvas.clientHeight / camera.viewHeight;
      for (const b of space.labels()) {
        const [x, y] = toScreen(b.p);
        const rr = b.id === 'sun' ? 42 : b.r || R;
        out.push({ id: 'b-' + b.id, x, y: y - rr * pxPerUnit - 6, name: b.name, sub: b.sub, color: b.id === 'sun' ? [1, 0.8, 0.3] : b.id === 'home' ? [0.45, 0.75, 1] : [0.75, 0.7, 0.85], alpha: smoothstep(0.12, 0.35, -view.zoom), small: true });
      }
      return out;
    }
    for (const v of life.villages) {
      const n = m4.transformDir(globeRot, v.d);
      const facing = v3.dot(n, back);
      if (facing < 0.12) continue;
      const w = m4.transformPoint(globeRot, v3.scale(v.d, v.sr + 0.55 * (1 + far * 2)));
      const P = camera.viewProj;
      const cx = P[0] * w[0] + P[4] * w[1] + P[8] * w[2] + P[12];
      const cy = P[1] * w[0] + P[5] * w[1] + P[9] * w[2] + P[13];
      const cw = P[3] * w[0] + P[7] * w[1] + P[11] * w[2] + P[15];
      const lx = (cx / cw * 0.5 + 0.5) * st2.lowW, ly = (cy / cw * 0.5 + 0.5) * st2.lowH;
      const x = (lx - 1 - camera.subpixel[0]) * sc / dpr, y = cssH - (ly - 1 - camera.subpixel[1]) * sc / dpr;
      out.push({ id: v.id, x, y, name: v.name, sub: `${v.tribe.name} · ${life.eraName(v.tribe)} · ${v.pop || 0}명${v.tribe.war.size ? ' · 전쟁 중' : ''}`, color: v.tribe.color, alpha: smoothstep(0.12, 0.35, facing), small: far > 0.5 });
    }
    return out;
  }
  function topEra() { let best = null; for (const t of life.tribes) if (t.alive && (!best || t.tech > best.tech)) best = t; return best ? `${best.name} · ${life.eraName(best)}` : ''; }
  let selWas = false;
  let sunPlanet = [1, 0.3, 0.3];
  function setTool(t) { tool = t; ui.onTool?.(t); }

  // ---- 초기 상태: 지구 + 세 부족 ----
  setPreset('earth');
  (function seedLife() {
    const Rn = rng(99);
    const spots = [];
    for (let tries = 0; spots.length < 3 && tries < 4000; tries++) {
      const d = v3.norm([Rn.range(-1, 1), Rn.range(-0.6, 0.6), Rn.range(-1, 1)]);
      const i = cellInfo(d);
      if (!(i.land && i.e > 0.08 && i.fert > 0.55 && spots.every((s) => distU(s, d) > 9))) continue;
      // 물가에서 너무 멀지 않은 곳 (1.5~3.5)
      let wet = false;
      for (let a = 0; a < 6.28 && !wet; a += 0.4) for (const r of [1.5, 2.5, 3.5]) { const f = tangentFrame(d); if (elevation(v3.norm(v3.add(d, v3.add(v3.scale(f.e, Math.cos(a) * r / R), v3.scale(f.u, Math.sin(a) * r / R))))) < 0) { wet = true; break; } }
      if (wet) spots.push(d);
    }
    for (const d of spots) {
      life.seedTribe(d, { adults: 6, kids: 2 });
      life.dropAnimals('sheep', jitterDir(d, 3), 10);
      life.dropAnimals('wolf', jitterDir(d, 5), 2);
    }
    if (spots[0]) {
      view.lat = Math.asin(spots[0][1]); view.lon = Math.atan2(spots[0][0], spots[0][2]);
      view.zoom = view.zoomGoal = 0.82;
      dayAngle = Math.atan2(spots[0][2], spots[0][0]) - 0.6; // 첫 화면은 아침
    }
    say('세 부족이 지구에 자리를 잡았어요. 사람을 눌러 하루를 따라가 보세요', 'civ');
  })();

  return {
    engine, env, PRESETS, life,
    setTool, setPreset, setEnv,
    newPlanet() { env.seed = Math.floor(Math.random() * 1e6); regenerate(false); say('새 행성을 만들었어요', 'civ'); },
    setSpeed(s) { speed = s; },
    allWar: () => life.allWar(),
    peace: () => life.peace(),
    zoomTo(z) { view.zoomGoal = z; },
    zoomBy(dz) { view.zoomGoal = clamp(view.zoomGoal + dz, -1, 1); },
    toggleSystem() { view.zoomGoal = view.zoomGoal < -0.1 ? 0.1 : -1; },
    space,
    look(lat, lon) { view.lat = lat; view.lon = lon; },
    useAt(x, y) { const d = pickSurface(x, y); if (d) useTool(d); return !!d; },
    stats: () => life.stats(),
    setDayAngle(a) { dayAngle = a; },
    focus(v) { view.lat = Math.asin(v.d[1]); view.lon = Math.atan2(v.d[0], v.d[2]); },
    // 렌더 없이 시뮬레이션만 빨리 돌리기 (테스트용)
    simulate(seconds) {
      for (let t = 0; t < seconds; t += 0.2) { dayAngle += 0.2 * (Math.PI * 2) / DAY; sunPlanet = v3.norm([Math.cos(dayAngle), 0.25, Math.sin(dayAngle)]); life.setSun(sunPlanet); life.tick(0.2); life.moveAll(0.2); }
      if (treesDirty) refreshTrees();
      fx.list.length = 0;
      return life.stats();
    },
  };
}
