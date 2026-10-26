// PixelForge 데모 — "작은 섬"
// 로우폴리 도형만으로 만든 섬을 픽셀 파이프라인으로 렌더한다.

import {
  Engine, Node, Mesh, Material, Geometry, ParticleSystem, GrassField, Water,
  PALETTES, rng, fbm, noise2, smoothstep, clamp, lerp, damp, dampAngle, v3,
} from '../engine/index.js';

export function boot(canvas, ui) {
  const engine = new Engine(canvas, { pixelSize: 3 });
  const { scene, camera, input, renderer } = engine;
  const R = rng(20261026);

  // ------------------------------------------------------------------
  // 지형
  // ------------------------------------------------------------------
  const W = 60, N = 75; // 지형 크기 / 격자 수
  const HOUSE = [-6, -5];
  const DOCK = [5, 15.5];
  const PATH = [[5, 14.5], [4, 10], [0.5, 5.5], [-2.5, 1], [-4.5, -2.4]];

  function distToPath(x, z) {
    let best = 1e9;
    for (let i = 0; i < PATH.length - 1; i++) {
      const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }

  function baseHeight(x, z) {
    const d = Math.hypot(x, z * 1.12) / 19;
    const n = fbm(x * 0.07 + 3.1, z * 0.07 + 7.3, 4);
    let h = (1 - d * d) * 3.2 + (n - 0.5) * 2.6 - 0.5;
    h -= smoothstep(0.85, 1.3, d) * 3;
    // 계단식 지형 (절벽이 생겨서 외곽선이 예쁘게 나옴)
    if (h > 0.45) {
      const step = 0.75, t = Math.floor(h / step) * step;
      const terr = t + smoothstep(0.55, 0.95, (h - t) / step) * step;
      h = lerp(h, terr, smoothstep(0.45, 0.9, h));
    }
    // 집터 평탄화
    const dh = Math.hypot(x - HOUSE[0], z - HOUSE[1]);
    h = lerp(h, 2.25, smoothstep(4.8, 2.8, dh));
    // 길은 살짝 다져서 평평하게
    const dp = distToPath(x, z);
    if (h > 0.3) h = lerp(h, Math.max(0.5, h * 0.97), smoothstep(1.4, 0.4, dp));
    return Math.max(h, -2.5);
  }

  // 격자 높이 캐시 + 렌더되는 삼각형과 정확히 같은 높이 보간
  const cell = W / N;
  const gridH = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) gridH[j * (N + 1) + i] = baseHeight((i / N - 0.5) * W, (j / N - 0.5) * W);
  const gh = (i, j) => gridH[clamp(j, 0, N) * (N + 1) + clamp(i, 0, N)];
  function heightAt(x, z) {
    const fx = (x / W + 0.5) * N, fz = (z / W + 0.5) * N;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    if (i < 0 || j < 0 || i >= N || j >= N) return -2.5;
    const h00 = gh(i, j), h10 = gh(i + 1, j), h01 = gh(i, j + 1), h11 = gh(i + 1, j + 1);
    if ((i + j) % 2) {
      return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    }
    return u >= v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h01 - h00) * v + (h11 - h01) * u;
  }
  function slopeAt(x, z) {
    const e = 0.4;
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  const GRASS_A = [0.34, 0.6, 0.27], GRASS_B = [0.5, 0.72, 0.3], GRASS_C = [0.66, 0.74, 0.32];
  function grassColor(x, z) {
    const n = noise2(x * 0.18, z * 0.18), m = noise2(x * 0.05 + 40, z * 0.05);
    const c = v3.lerp(GRASS_A, GRASS_B, smoothstep(0.35, 0.65, n));
    return v3.lerp(c, GRASS_C, smoothstep(0.62, 0.8, m) * 0.7);
  }
  const PATH_COL = [0.8, 0.66, 0.44];

  const terrainGeo = Geometry.grid(W, W, N, N, (x, z) => baseHeight(x, z), ([x, y, z], n) => {
    if (y < -0.1) return v3.lerp([0.74, 0.66, 0.48], [0.5, 0.48, 0.42], smoothstep(-0.1, -1.6, y));
    if (y < 0.42) return [0.95, 0.85, 0.6];
    if (n[1] < 0.74) return y > 1.8 ? [0.56, 0.5, 0.48] : [0.62, 0.47, 0.36];
    if (distToPath(x, z) < 0.85) return PATH_COL;
    return grassColor(x, z);
  });
  scene.add(new Mesh(terrainGeo, new Material(), 'terrain'));

  const water = new Water({ size: 140, segments: 100, level: 0, shallow: '#62d9cf', deep: '#22508f' });
  scene.water.push(water);

  const colliders = []; // {x, z, r}
  const blocked = (x, z, pad = 0) => colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad);

  // ------------------------------------------------------------------
  // 집
  // ------------------------------------------------------------------
  const nightMats = []; // 밤에 빛나는 머티리얼
  {
    const [hx, hz] = HOUSE, y = heightAt(hx, hz);
    const house = scene.add(new Node('house'));
    house.position = [hx, y, hz];
    house.rotation[1] = 0.35;
    house.add(new Mesh(Geometry.box(3.2, 2.1, 2.6), { color: '#efe3c8' }));
    house.add(new Mesh(Geometry.box(3.4, 0.25, 2.8), { color: '#9a7b5c' }));
    const roof = house.add(new Mesh(Geometry.prism(3.9, 1.5, 3.1), { color: '#d0574a' }));
    roof.position[1] = 2.1;
    const door = house.add(new Mesh(Geometry.box(0.7, 1.25, 0.12), { color: '#6b4a34' }));
    door.position = [0.6, 0.15, 1.31];
    const winMat = new Material({ color: '#ffd77a' });
    nightMats.push(winMat);
    const win = house.add(new Mesh(Geometry.box(0.6, 0.55, 0.12), winMat));
    win.position = [-0.75, 0.95, 1.31];
    const chimney = house.add(new Mesh(Geometry.box(0.45, 1.2, 0.45), { color: '#8b7f7a' }));
    chimney.position = [-0.9, 2.5, -0.4];
    house.chimneyTop = [-0.9, 3.8, -0.4];
    scene.house = house;
    colliders.push({ x: hx, z: hz, r: 2.2 });
  }

  // ------------------------------------------------------------------
  // 선착장 + 배
  // ------------------------------------------------------------------
  {
    const dock = scene.add(new Node('dock'));
    dock.position = [DOCK[0], 0, DOCK[1]];
    for (let i = 0; i < 9; i++) {
      const plank = dock.add(new Mesh(Geometry.box(1.6, 0.12, 0.5), { color: i % 2 ? '#a77c52' : '#b98b5c' }));
      plank.position = [0, 0.38, i * 0.55];
    }
    for (const sx of [-0.7, 0.7]) for (const z of [0.6, 2.8, 4.6]) {
      const post = dock.add(new Mesh(Geometry.cylinder(0.1, 0.1, 1.6, 5), { color: '#6e5038' }));
      post.position = [sx, -1.1, z];
    }
  }
  const boat = scene.add(new Node('boat'));
  {
    boat.position = [8.2, 0, 19];
    boat.rotation[1] = 0.4;
    const hull = boat.add(new Mesh(Geometry.box(1.2, 0.45, 2.6), { color: '#7a4f36' }));
    hull.position[1] = -0.15;
    const rim = boat.add(new Mesh(Geometry.box(1.3, 0.1, 2.7), { color: '#e9dcc0' }));
    rim.position[1] = 0.3;
    const mast = boat.add(new Mesh(Geometry.cylinder(0.06, 0.06, 2.4, 5), { color: '#5c4030' }));
    mast.position = [0, 0.3, 0.2];
    const sail = boat.add(new Mesh(Geometry.box(0.05, 1.6, 1.1), { color: '#f6f1e6' }));
    sail.position = [0, 0.9, -0.35];
    colliders.push({ x: 8.2, z: 19, r: 1.3 });
  }

  // ------------------------------------------------------------------
  // 가로등
  // ------------------------------------------------------------------
  const lampMat = new Material({ color: '#ffcf6b' });
  nightMats.push(lampMat);
  const lamps = [];
  for (const [x, z] of [[3.2, 11.6], [-0.6, 4.2], [-3.8, -0.4]]) {
    const y = heightAt(x, z);
    const lamp = scene.add(new Node('lamp'));
    lamp.position = [x, y, z];
    lamp.add(new Mesh(Geometry.box(0.14, 1.7, 0.14), { color: '#3d3a46' }));
    const cap = lamp.add(new Mesh(Geometry.box(0.42, 0.08, 0.42), { color: '#3d3a46' }));
    cap.position[1] = 2.15;
    const glass = lamp.add(new Mesh(Geometry.box(0.3, 0.42, 0.3), lampMat));
    glass.position[1] = 1.7;
    lamps.push([x, y + 1.9, z]);
    scene.lights.push({ position: [x, y + 1.7, z], color: [1, 0.78, 0.45], radius: 5.5, intensity: 0, lamp: true });
    colliders.push({ x, z, r: 0.3 });
  }

  // ------------------------------------------------------------------
  // 나무 / 바위
  // ------------------------------------------------------------------
  const trees = [];
  const okSpot = (x, z, minH = 0.6) => {
    const h = heightAt(x, z);
    return h > minH && slopeAt(x, z) < 0.45 && distToPath(x, z) > 1.6 &&
      Math.hypot(x - HOUSE[0], z - HOUSE[1]) > 3.6 && Math.hypot(x - DOCK[0], z - DOCK[1]) > 2.5;
  };
  const FOLIAGE = ['#3f8a3a', '#4f9c3c', '#5aa845', '#367a3a'];
  const AUTUMN = ['#e0873a', '#d3613b', '#e8b04a'];
  for (let tries = 0; trees.length < 30 && tries < 2000; tries++) {
    const x = R.range(-20, 20), z = R.range(-19, 19);
    if (!okSpot(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue;
    const y = heightAt(x, z), s = R.range(0.85, 1.25);
    const tree = scene.add(new Node('tree'));
    tree.position = [x, y - 0.05, z];
    tree.rotation[1] = R() * 6.28;
    tree.setScale(s);
    const pine = R() < 0.35;
    const autumn = !pine && R() < 0.18;
    if (pine) {
      tree.add(new Mesh(Geometry.cylinder(0.14, 0.2, 0.9, 5), { color: '#6e4b33' }));
      const g = new Geometry(), col = [0.2 + R() * 0.06, 0.48 + R() * 0.08, 0.32];
      [[1.0, 1.4, 0.6], [0.78, 1.2, 1.3], [0.55, 1.0, 1.95]].forEach(([r, h, y0]) => g.merge(Geometry.cone(r, h, 7, col), { position: [0, y0, 0] }));
      tree.add(new Mesh(g, { color: [1, 1, 1], wind: 0.018 }));
    } else {
      tree.add(new Mesh(Geometry.cylinder(0.13, 0.22, 1.5, 5), { color: '#7a5236' }));
      const g = new Geometry();
      const pal = autumn ? AUTUMN : FOLIAGE;
      const blobs = 2 + Math.floor(R() * 2);
      for (let b = 0; b < blobs; b++) {
        const r = R.range(0.65, 0.95);
        g.merge(Geometry.icosphere(r, 1, [1, 1, 1], { jitter: 0.12, seed: Math.floor(R() * 1e6), squashY: 0.85 }), {
          position: [R.range(-0.45, 0.45), 1.75 + b * 0.38 + R.range(-0.1, 0.1), R.range(-0.45, 0.45)],
          color: (() => { const c = pal[Math.floor(R() * pal.length)]; const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; })(),
        });
      }
      tree.add(new Mesh(g, { wind: 0.025 }));
    }
    trees.push({ x, z, y, s, autumn, pine, node: tree, shake: 0, sdir: [0, 0] });
    colliders.push({ x, z, r: 0.45 * s });
  }

  for (let i = 0, tries = 0; i < 16 && tries < 1000; tries++) {
    const x = R.range(-21, 21), z = R.range(-20, 20);
    const h = heightAt(x, z);
    if (h < -0.6 || h > 3.5 || distToPath(x, z) < 1.4 || blocked(x, z, 1)) continue;
    const r = R.range(0.35, 0.9);
    const rock = scene.add(new Mesh(Geometry.icosphere(r, 0, [1, 1, 1], { jitter: 0.25, seed: i + 3, squashY: 0.7 }), { color: R() < 0.5 ? '#9a9aa6' : '#8a8f99' }));
    rock.position = [x, h + r * 0.15, z];
    rock.rotation = [R() * 0.5, R() * 6.28, 0];
    colliders.push({ x, z, r: r * 0.85 });
    i++;
  }

  // ------------------------------------------------------------------
  // 2D 스프라이트: 꽃과 고양이 (도트 그림을 문자열로)
  // ------------------------------------------------------------------
  const FLOWERS = [
    { rows: ['.p.p.', 'ppypp', '.ppp.', '..g..', '.gg..', '..g.g', '..gg.'], pal: { p: '#f28ab2', y: '#ffe066', g: '#3f8a3a' } },
    { rows: ['.r.r.', '.rrr.', '.rrr.', '..g..', 'g.g..', '.gg.g', '..gg.'], pal: { r: '#e5484d', g: '#3f8a3a' } },
    { rows: ['.w.w.', 'wwyww', '.www.', '..g..', '..gg.', '.gg..', '..g..'], pal: { w: '#fbfbf2', y: '#f5b83d', g: '#3f8a3a' } },
    { rows: ['..b..', '.bbb.', '..b..', '..g..', '.gg.g', '..gg.', '..g..'], pal: { b: '#7aa7ff', g: '#3f8a3a' } },
  ];
  for (let i = 0, tries = 0; i < 46 && tries < 3000; tries++) {
    const x = R.range(-18, 18), z = R.range(-17, 17);
    if (!okSpot(x, z, 0.7) || blocked(x, z, 0.4)) continue;
    const f = FLOWERS[Math.floor(R() * FLOWERS.length)];
    const s = engine.sprite(f.rows, f.pal, { unitsPerPixel: 0.06 });
    s.position = [x, heightAt(x, z) - 0.02, z];
    scene.add(s);
    i++;
  }

  const CAT_PAL = { o: '#ec9a45', d: '#c9742e', w: '#fff3dd', k: '#1b1b26', p: '#f08aa0' };
  const catBase = ['.o......o...', '.oo....oo...', '.oooooooo...', '.owkoowko...', '.oooppooo...', '..oooooo....'];
  const catFrames = [
    [...catBase, '..oowwoo..o.', '.odowwodo.o.', '.ooowwooooo.', '.oooooooo...', '..ww..ww....'],
    [...catBase, '..oowwoo...o', '.odowwodo.o.', '.ooowwoooo..', '.oooooooo...', '..ww..ww....'],
    [...catBase.slice(0, 3), '.okkookko...', ...catBase.slice(4), '..oowwoo..o.', '.odowwodo.o.', '.ooowwooooo.', '.oooooooo...', '..ww..ww....'],
  ].map((rows) => engine.texture(rows, CAT_PAL));
  const cat = engine.sprite(['o'], { o: '#000000' }, { unitsPerPixel: 0.06 });
  cat.geometry = Geometry.spriteQuad(12 * 0.06, 11 * 0.06);
  cat.material.texture = catFrames[0];
  {
    const cx = HOUSE[0] + 2.4, cz = HOUSE[1] + 2.4;
    cat.position = [cx, heightAt(cx, cz), cz];
    scene.add(cat);
    colliders.push({ x: cx, z: cz, r: 0.35 });
  }

  // ------------------------------------------------------------------
  // 잔디 (인스턴싱)
  // ------------------------------------------------------------------
  const grass = new GrassField({
    count: 16000, bounds: [-21, 21, -20, 20], height: [0.28, 0.55], width: 0.13,
    place: (x, z) => {
      const y = heightAt(x, z);
      if (y < 0.5 || slopeAt(x, z) > 0.55 || distToPath(x, z) < 0.95) return null;
      if (Math.hypot(x - HOUSE[0], z - HOUSE[1]) < 2.3) return null;
      return { y: y - 0.02, color: v3.scale(grassColor(x, z), 1.06) };
    },
  });
  scene.grass.push(grass);

  // ------------------------------------------------------------------
  // 플레이어 (도형 조립)
  // ------------------------------------------------------------------
  const player = scene.add(new Node('player'));
  const rig = player.add(new Node('rig'));
  const mk = (geo, color, parent = rig) => parent.add(new Mesh(geo, { color }));
  const legL = rig.add(new Node()), legR = rig.add(new Node());
  legL.position = [-0.12, 0.32, 0]; legR.position = [0.12, 0.32, 0];
  mk(Geometry.box(0.14, 0.32, 0.16), '#3b3550', legL).position[1] = -0.32;
  mk(Geometry.box(0.14, 0.32, 0.16), '#3b3550', legR).position[1] = -0.32;
  const body = mk(Geometry.cylinder(0.2, 0.3, 0.55, 6), '#4a78c2');
  body.position[1] = 0.28;
  const scarf = mk(Geometry.cylinder(0.25, 0.25, 0.1, 6), '#ffcf4a');
  scarf.position[1] = 0.76;
  const head = mk(Geometry.icosphere(0.27, 1, [1, 1, 1]), '#f6d2b0');
  head.position[1] = 1.04;
  for (const sx of [-0.1, 0.1]) {
    const eye = mk(Geometry.box(0.06, 0.09, 0.04), '#1b1b26');
    eye.position = [sx, 1.03, 0.25];
  }
  const brim = mk(Geometry.cylinder(0.42, 0.42, 0.05, 8), '#c94a4a');
  brim.position[1] = 1.2;
  const hat = mk(Geometry.cone(0.27, 0.55, 7), '#c94a4a');
  hat.position[1] = 1.22; hat.rotation = [-0.22, 0, 0.1];
  const armL = rig.add(new Node()), armR = rig.add(new Node());
  armL.position = [-0.27, 0.68, 0]; armR.position = [0.27, 0.68, 0];
  mk(Geometry.box(0.1, 0.34, 0.12), '#4a78c2', armL).position[1] = -0.34;
  mk(Geometry.box(0.1, 0.34, 0.12), '#4a78c2', armR).position[1] = -0.34;

  const P = { x: 2.5, z: 8.5, y: 0, vy: 0, vx: 0, vz: 0, facing: Math.PI, grounded: true, walk: 0, dustT: 0 };
  P.y = heightAt(P.x, P.z);

  // ------------------------------------------------------------------
  // 파티클
  // ------------------------------------------------------------------
  const fx = new ParticleSystem({ max: 1600, gravity: [0, -6, 0], drag: 1.2 });
  scene.particles.push(fx);
  const dust = (x, y, z, n, col = [0.86, 0.78, 0.6]) => {
    for (let i = 0; i < n; i++) fx.emit({
      position: [x + R.range(-0.15, 0.15), y + 0.05, z + R.range(-0.15, 0.15)],
      velocity: [R.range(-0.8, 0.8), R.range(0.6, 1.4), R.range(-0.8, 0.8)],
      life: R.range(0.35, 0.6), size: 2, sizeEnd: 1, color: col, gravity: 0.25,
    });
  };


  // ------------------------------------------------------------------
  // 마법 공격: 빛나는 구체 → 폭발 (점광원 + 충격파 + 바닥 고리 + 파티클 + 화면 흔들림)
  // ------------------------------------------------------------------
  const orbGeo = Geometry.icosphere(0.2, 1, [1, 1, 1]);
  const blastGeo = Geometry.icosphere(1, 1, [1, 1, 1]);
  const ringGeo = (() => {
    const g = new Geometry(), seg = 28, r0 = 0.82, r1 = 1;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const P0 = (r, a) => [Math.cos(a) * r, 0, Math.sin(a) * r];
      g.quad(P0(r0, a0), P0(r0, a1), P0(r1, a1), P0(r1, a0), [1, 1, 1], null, [0, 1, 0]);
    }
    return g;
  })();
  const MAGIC = { core: [1, 0.95, 1], hot: [0.86, 0.6, 1], deep: [0.48, 0.28, 0.95], cyan: [0.55, 0.92, 1] };
  const spells = [], blasts = [];
  let castCooldown = 0, castAnim = 0, hitstop = 0;

  function groundPointFromScreen(x, y) {
    const ray = camera.screenRay(x, y, canvas.clientWidth, canvas.clientHeight, engine.scale, engine.dpr);
    for (let t = 0; t < 220; t += 0.2) {
      const q = v3.add(ray.origin, v3.scale(ray.dir, t));
      if (q[1] <= Math.max(heightAt(q[0], q[2]), 0)) return q;
    }
    return null;
  }

  function cast(target = null) {
    if (castCooldown > 0) return;
    castCooldown = 0.35;
    castAnim = 0.35;
    const fwd = [Math.sin(P.facing), 0, Math.cos(P.facing)];
    if (target) {
      const d = [target[0] - P.x, 0, target[2] - P.z];
      if (Math.hypot(d[0], d[2]) > 0.3) { P.facing = Math.atan2(d[0], d[2]); fwd[0] = Math.sin(P.facing); fwd[2] = Math.cos(P.facing); }
    }
    const from = [P.x + fwd[0] * 0.45, P.y + 0.95, P.z + fwd[2] * 0.45];
    if (!target) target = [P.x + fwd[0] * 6, heightAt(P.x + fwd[0] * 6, P.z + fwd[2] * 6) + 0.4, P.z + fwd[2] * 6];
    const dir = v3.norm(v3.sub(target, from));
    const mesh = scene.add(new Mesh(orbGeo, new Material({ color: MAGIC.hot, emissive: 1, outline: false, castShadow: false })));
    mesh.position = [...from];
    const light = { position: [...from], color: MAGIC.hot, radius: 3.2, intensity: 0.8 };
    scene.lights.push(light);
    spells.push({ mesh, light, pos: [...from], vel: v3.scale(dir, 15), dist: v3.len(v3.sub(target, from)) + 0.3, travelled: 0 });
    // 손끝에서 튀는 불꽃
    for (let i = 0; i < 10; i++) fx.emit({ position: from, velocity: [R.range(-2, 2), R.range(-1, 2.5), R.range(-2, 2)], life: R.range(0.2, 0.4), size: 1, color: MAGIC.core, colorEnd: MAGIC.hot, emissive: 1, gravity: 0 });
  }

  function explode(pos, onWater) {
    hitstop = 0.05;
    shake.amp = 0.14;
    const gy = onWater ? 0.02 : heightAt(pos[0], pos[2]) + 0.04;
    const ring = scene.add(new Mesh(ringGeo, new Material({ color: MAGIC.hot, emissive: 1, outline: false, castShadow: false })));
    ring.position = [pos[0], gy, pos[2]];
    const ball = scene.add(new Mesh(blastGeo, new Material({ color: MAGIC.core, emissive: 1, outline: false, castShadow: false })));
    ball.position = [...pos];
    const light = { position: [pos[0], pos[1] + 0.8, pos[2]], color: [0.9, 0.7, 1], radius: 7.5, intensity: 1.3 };
    scene.lights.push(light);
    blasts.push({ t: 0, pos: [...pos], ring, ball, light });

    // 불꽃 파편
    for (let i = 0; i < 110; i++) {
      const d = v3.norm([R.range(-1, 1), R.range(-0.2, 1), R.range(-1, 1)]), sp = R.range(4, 12);
      fx.emit({ position: pos, velocity: v3.scale(d, sp), life: R.range(0.5, 1.1), size: R() < 0.4 ? 3 : 2, sizeEnd: 1, color: MAGIC.core, colorEnd: MAGIC.deep, emissive: 1, gravity: 0.9 });
    }
    // 떠오르는 잔불
    for (let i = 0; i < 24; i++) fx.emit({
      position: v3.add(pos, [R.range(-1, 1), R.range(0, 0.8), R.range(-1, 1)]), velocity: [R.range(-0.6, 0.6), R.range(0.5, 1.6), R.range(-0.6, 0.6)],
      life: R.range(1, 2), size: 1, color: MAGIC.cyan, colorEnd: MAGIC.hot, emissive: 1, gravity: -0.05, fadeIn: 0.1,
    });
    // 연기
    for (let i = 0; i < 14; i++) fx.emit({
      position: v3.add(pos, [R.range(-0.5, 0.5), 0.2, R.range(-0.5, 0.5)]), velocity: [R.range(-1.6, 1.6), R.range(0.8, 2), R.range(-1.6, 1.6)],
      life: R.range(1, 1.7), size: 3, sizeEnd: 6, color: [0.42, 0.36, 0.55], colorEnd: [0.3, 0.28, 0.36], gravity: -0.03, fadeIn: 0.15,
    });
    // 튀어오르는 흙/물
    const debris = onWater ? [0.85, 0.97, 1] : distToPath(pos[0], pos[2]) < 0.9 ? PATH_COL : gy < 0.45 ? [0.95, 0.85, 0.6] : grassColor(pos[0], pos[2]);
    for (let i = 0; i < (onWater ? 40 : 16); i++) fx.emit({
      position: [pos[0] + R.range(-0.4, 0.4), gy + 0.1, pos[2] + R.range(-0.4, 0.4)],
      velocity: [R.range(-2.5, 2.5), R.range(onWater ? 6 : 4, onWater ? 10 : 7), R.range(-2.5, 2.5)],
      life: R.range(0.6, 1.1), size: 2, sizeEnd: 1, color: debris, gravity: 1.4,
    });
    // 주변 나무 흔들기
    for (const t of trees) {
      const dx = t.x - pos[0], dz = t.z - pos[2], d = Math.hypot(dx, dz);
      if (d < 5.5) { t.shake = Math.max(t.shake, 1 - d / 5.5); t.sdir = [dx / (d || 1), dz / (d || 1)]; }
    }
  }

  function updateMagic(dt, time) {
    castCooldown = Math.max(0, castCooldown - dt);
    castAnim = Math.max(0, castAnim - dt);

    for (let i = spells.length - 1; i >= 0; i--) {
      const sp = spells[i];
      const step = v3.scale(sp.vel, dt);
      sp.pos = v3.add(sp.pos, step);
      sp.travelled += v3.len(step);
      sp.mesh.position = [...sp.pos];
      sp.mesh.rotation = [time * 9, time * 7, 0];
      sp.light.position = [...sp.pos];
      for (let k = 0; k < 3; k++) fx.emit({ position: v3.add(sp.pos, [R.range(-0.08, 0.08), R.range(-0.08, 0.08), R.range(-0.08, 0.08)]), velocity: [R.range(-0.4, 0.4), R.range(-0.2, 0.6), R.range(-0.4, 0.4)], life: R.range(0.2, 0.45), size: 2, sizeEnd: 1, color: MAGIC.hot, colorEnd: MAGIC.deep, emissive: 1, gravity: 0 });
      const g = heightAt(sp.pos[0], sp.pos[2]);
      const onWater = g < 0 && sp.pos[1] <= 0.05;
      const hitGround = sp.pos[1] <= g + 0.05;
      const hitThing = blocked(sp.pos[0], sp.pos[2], 0) && sp.pos[1] < g + 3;
      if (onWater || hitGround || hitThing || sp.travelled >= sp.dist) {
        scene.remove(sp.mesh);
        scene.lights.splice(scene.lights.indexOf(sp.light), 1);
        spells.splice(i, 1);
        explode(sp.pos, onWater || (g < 0 && sp.pos[1] < 0.6));
      }
    }

    const pushers = [];
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.t += dt;
      const t = b.t;
      // 충격파 구: 빠르게 커지며 디더링으로 사라짐
      const k = Math.min(1, t / 0.28);
      b.ball.setScale(0.3 + (1 - Math.pow(1 - k, 3)) * 1.5);
      b.ball.material.opacity = 1 - smoothstep(0.12, 0.45, t);
      b.ball.material.color = k < 0.35 ? MAGIC.core : v3.lerp(MAGIC.hot, MAGIC.deep, (k - 0.35) / 0.65);
      b.ball.material.emissive = 0.75 - k * 0.35;
      b.ball.visible = t < 0.46;
      // 바닥 고리
      const kr = Math.min(1, t / 0.55);
      b.ring.setScale([0.4 + (1 - Math.pow(1 - kr, 2)) * 4.6, 1, 0.4 + (1 - Math.pow(1 - kr, 2)) * 4.6]);
      b.ring.material.opacity = 1 - smoothstep(0.2, 0.6, t);
      b.ring.visible = t < 0.62;
      // 빛
      b.light.intensity = 1.3 * Math.exp(-t * 5.5);
      b.light.color = v3.lerp([0.95, 0.8, 1], MAGIC.hot, Math.min(1, t * 4));
      // 잔디가 바깥으로 눕는다
      if (t < 1.2) pushers.push([b.pos[0], b.pos[1], b.pos[2], Math.min(1, t / 0.25) * 3.6 * (1 - smoothstep(0.5, 1.2, t)) + 0.01]);
      if (t > 1.3) {
        scene.remove(b.ring); scene.remove(b.ball);
        scene.lights.splice(scene.lights.indexOf(b.light), 1);
        blasts.splice(i, 1);
      }
    }
    grass.interactors = [[P.x, P.y, P.z, 0.85], ...pushers.slice(-3)];

    for (const t of trees) {
      if (t.shake <= 0.001) { t.node.rotation[0] = 0; t.node.rotation[2] = 0; continue; }
      t.shake = Math.max(0, t.shake - dt * 1.6);
      const a = Math.sin(time * 16) * t.shake * 0.14;
      t.node.rotation[0] = t.sdir[1] * a;
      t.node.rotation[2] = -t.sdir[0] * a;
    }
  }

  // ------------------------------------------------------------------
  // 시간 / 조명
  // ------------------------------------------------------------------
  const KEYS = [
    { h: 0, sun: [0.45, 0.55, 0.95], i: 0.55, sky: [0.13, 0.16, 0.33], gr: [0.08, 0.08, 0.16], fog: [0.07, 0.09, 0.2], grade: [0.9, 0.95, 1.1] },
    { h: 4.6, sun: [0.45, 0.55, 0.95], i: 0.55, sky: [0.13, 0.16, 0.33], gr: [0.08, 0.08, 0.16], fog: [0.07, 0.09, 0.2], grade: [0.9, 0.95, 1.1] },
    { h: 5.5, sun: [0.8, 0.5, 0.5], i: 0.0, sky: [0.3, 0.27, 0.45], gr: [0.16, 0.13, 0.2], fog: [0.38, 0.32, 0.5], grade: [1, 0.97, 1.03] },
    { h: 6.6, sun: [1.0, 0.62, 0.45], i: 0.85, sky: [0.48, 0.4, 0.52], gr: [0.3, 0.22, 0.25], fog: [0.92, 0.68, 0.62], grade: [1.04, 0.98, 0.96] },
    { h: 8.5, sun: [1.0, 0.95, 0.85], i: 0.78, sky: [0.46, 0.5, 0.64], gr: [0.33, 0.3, 0.28], fog: [0.56, 0.78, 0.92], grade: [1, 1, 1] },
    { h: 15.5, sun: [1.0, 0.93, 0.8], i: 0.85, sky: [0.45, 0.48, 0.62], gr: [0.32, 0.28, 0.26], fog: [0.6, 0.78, 0.9], grade: [1, 1, 1] },
    { h: 17.8, sun: [1.0, 0.64, 0.36], i: 1.0, sky: [0.5, 0.38, 0.5], gr: [0.32, 0.22, 0.2], fog: [0.98, 0.68, 0.5], grade: [1.06, 0.98, 0.92] },
    { h: 19.2, sun: [0.85, 0.38, 0.38], i: 0.55, sky: [0.32, 0.26, 0.46], gr: [0.18, 0.13, 0.2], fog: [0.46, 0.32, 0.52], grade: [1.02, 0.95, 1.02] },
    { h: 19.6, sun: [0.6, 0.35, 0.45], i: 0.0, sky: [0.24, 0.22, 0.42], gr: [0.12, 0.1, 0.18], fog: [0.25, 0.2, 0.38], grade: [0.95, 0.95, 1.05] },
    { h: 20.6, sun: [0.45, 0.55, 0.95], i: 0.55, sky: [0.13, 0.16, 0.33], gr: [0.08, 0.08, 0.16], fog: [0.07, 0.09, 0.2], grade: [0.9, 0.95, 1.1] },
    { h: 24, sun: [0.45, 0.55, 0.95], i: 0.55, sky: [0.13, 0.16, 0.33], gr: [0.08, 0.08, 0.16], fog: [0.07, 0.09, 0.2], grade: [0.9, 0.95, 1.1] },
  ];
  let hour = 16.6;
  let nightness = 0;
  function applyTime(h) {
    let k = 0;
    while (k < KEYS.length - 2 && KEYS[k + 1].h <= h) k++;
    const a = KEYS[k], b = KEYS[k + 1], t = smoothstep(a.h, b.h, h);
    scene.sun.color = v3.lerp(a.sun, b.sun, t);
    scene.sun.intensity = lerp(a.i, b.i, t);
    scene.ambientSky = v3.lerp(a.sky, b.sky, t);
    scene.ambientGround = v3.lerp(a.gr, b.gr, t);
    scene.fog.color = v3.lerp(a.fog, b.fog, t);
    renderer.settings.grade = v3.lerp(a.grade, b.grade, t);
    const sunUp = h >= 5.5 && h < 19.6;
    let ang;
    if (sunUp) ang = ((h - 5.5) / 14.1) * Math.PI;
    else ang = ((((h - 19.6) + 24) % 24) / 9.9) * Math.PI;
    const elev = Math.max(Math.sin(ang), 0.22);
    scene.sun.direction = sunUp ? [Math.cos(ang) * 0.9, elev, 0.42] : [Math.cos(ang) * 0.7, Math.max(elev, 0.45), -0.35];
    nightness = Math.max(smoothstep(18.6, 19.9, h), 1 - smoothstep(5.2, 6.6, h));
    for (const m of nightMats) m.emissive = nightness;
    for (const l of scene.lights) if (l.lamp) l.intensity = nightness * 0.9;
  }

  // ------------------------------------------------------------------
  // 게임 루프
  // ------------------------------------------------------------------
  camera.target = [P.x, P.y + 0.6, P.z];
  camera.yaw = 0.55; camera.pitch = 0.6;
  let yawGoal = camera.yaw, zoom = 15, zoomGoal = 15;
  // 회전: 기본은 45° 단위로 짧게 넘어가기 (도트 깜빡임을 최소화)
  const STEP = Math.PI / 4, TURN_TIME = 0.32;
  const rot = { from: camera.yaw, to: camera.yaw, t: 1, acc: 0 };
  let freeRotate = false;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const turn = (dir) => { rot.from = camera.yaw; rot.to += dir * STEP; rot.t = 0; };
  const shake = { amp: 0, t: 0 };
  let autoTime = false, catT = 0, catFrame = 0, smokeT = 0, leafT = 0;
  const camOffset = [0, 0.6, 0];

  engine.onUpdate = (dt, time) => {
    // 히트스톱: 폭발 순간 아주 잠깐 멈칫
    if (hitstop > 0) { hitstop -= dt; dt *= 0.15; }
    // 시간
    if (autoTime) { hour = (hour + dt * 0.18) % 24; ui?.onHour?.(hour); }
    applyTime(hour);

    // 카메라 입력
    const dragRot = input.takeRotate();
    if (freeRotate) {
      yawGoal += dragRot;
      if (input.down('q')) yawGoal -= dt * 1.6;
      if (input.down('e')) yawGoal += dt * 1.6;
    } else {
      rot.acc += dragRot;
      if (rot.acc > 0.38) { turn(1); rot.acc = 0; } else if (rot.acc < -0.38) { turn(-1); rot.acc = 0; }
      if (input.pressed('q')) turn(-1);
      if (input.pressed('e')) turn(1);
    }
    zoomGoal = clamp(zoomGoal * input.takeZoom(), 7, 30);

    // 이동
    const ax = input.axis();
    const dir = camera.groundDirection(ax.x, ax.y);
    const speed = 4.6, mag = Math.hypot(ax.x, ax.y);
    P.vx = damp(P.vx, dir[0] * speed, 12, dt);
    P.vz = damp(P.vz, dir[2] * speed, 12, dt);
    const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
    const onDock = (x, z) => Math.abs(x - DOCK[0]) < 0.8 && z > DOCK[1] - 0.3 && z < DOCK[1] + 4.6;
    const walkable = (x, z) => (heightAt(x, z) > -0.35 || onDock(x, z)) && !blocked(x, z, 0.25) && Math.hypot(x, z) < 28;
    if (walkable(nx, P.z)) P.x = nx; else P.vx = 0;
    if (walkable(P.x, nz)) P.z = nz; else P.vz = 0;
    const ground = onDock(P.x, P.z) ? Math.max(0.5, heightAt(P.x, P.z)) : heightAt(P.x, P.z);
    const moving = Math.hypot(P.vx, P.vz) > 0.4;

    if (input.pressed('jump') && P.grounded) { P.vy = 6.2; P.grounded = false; }
    P.vy -= 18 * dt;
    P.y += P.vy * dt;
    if (P.y <= ground) {
      if (!P.grounded && P.vy < -4) dust(P.x, ground, P.z, 10);
      P.y = ground; P.vy = 0; P.grounded = true;
    } else if (P.grounded && P.y - ground < 0.3) {
      P.y = ground; // 내리막 붙어가기
    } else P.grounded = false;

    if (mag > 0.1) P.facing = dampAngle(P.facing, Math.atan2(dir[0], dir[2]), 14, dt);
    P.walk += dt * (moving ? Math.hypot(P.vx, P.vz) * 2.6 : 0);
    const swing = moving && P.grounded ? Math.sin(P.walk) * 0.7 : 0;
    legL.rotation[0] = damp(legL.rotation[0], swing, 20, dt);
    legR.rotation[0] = damp(legR.rotation[0], -swing, 20, dt);
    armL.rotation[0] = damp(armL.rotation[0], -swing * 0.8, 20, dt);
    armR.rotation[0] = damp(armR.rotation[0], swing * 0.8, 20, dt);
    rig.position[1] = moving && P.grounded ? Math.abs(Math.sin(P.walk)) * 0.07 : Math.sin(time * 2.2) * 0.012;
    rig.rotation[0] = damp(rig.rotation[0], moving ? 0.12 : 0, 8, dt);
    const inWater = ground < 0.02 && !onDock(P.x, P.z);
    player.position = [P.x, P.y - (inWater && P.grounded ? Math.min(0.3, -ground + 0.05) : 0), P.z];
    player.rotation[1] = P.facing;

    // 발자국 먼지 / 물보라
    P.dustT -= dt;
    if (moving && P.grounded && P.dustT <= 0) {
      P.dustT = 0.13;
      if (inWater) {
        for (let i = 0; i < 3; i++) fx.emit({ position: [P.x + R.range(-0.2, 0.2), 0.05, P.z + R.range(-0.2, 0.2)], velocity: [R.range(-1, 1), R.range(1.5, 2.6), R.range(-1, 1)], life: 0.45, size: 2, sizeEnd: 1, color: [0.92, 0.99, 1], gravity: 1 });
      } else dust(P.x, ground, P.z, 2, onDock(P.x, P.z) ? [0.75, 0.6, 0.45] : distToPath(P.x, P.z) < 0.9 ? [0.86, 0.74, 0.54] : [0.62, 0.78, 0.45]);
    }
    // 공격 입력: F 키 / 마법 버튼 / 땅을 탭(클릭)하면 그쪽으로
    if (input.pressed('f') || input.pressed('cast')) cast();
    for (const tap of input.takeTaps()) { const q = groundPointFromScreen(tap.x, tap.y); if (q) cast([q[0], q[1] + 0.5, q[2]]); }
    updateMagic(dt, time);
    if (castAnim > 0) { armR.rotation[0] = -2.3; armR.rotation[2] = 0.2; } else armR.rotation[2] = 0;

    // 굴뚝 연기
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.16;
      const top = scene.house.world;
      const c = [top[0] * -0.9 + top[8] * -0.4 + top[12], top[13] + 3.8, top[2] * -0.9 + top[10] * -0.4 + top[14]];
      fx.emit({ position: c, velocity: [R.range(0.1, 0.4), R.range(0.8, 1.2), R.range(-0.1, 0.2)], life: R.range(2.2, 3.2), size: 2, sizeEnd: 4, color: [0.9, 0.9, 0.92], colorEnd: [0.7, 0.72, 0.8], gravity: -0.02, fadeIn: 0.1 });
    }
    // 떨어지는 나뭇잎
    leafT -= dt;
    if (leafT <= 0 && trees.length) {
      leafT = 0.35;
      const t = trees[Math.floor(R() * trees.length)];
      if (!t.pine) {
        const col = t.autumn ? R.pick([[0.9, 0.55, 0.22], [0.85, 0.38, 0.23]]) : [0.38, 0.66, 0.3];
        fx.emit({
          position: [t.x + R.range(-0.8, 0.8), t.y + 2.2 * t.s, t.z + R.range(-0.8, 0.8)], velocity: [0, -0.4, 0], life: 4.5, size: 1, color: col, gravity: 0.03,
          update: (p) => { p.v[0] = Math.sin(p.age * 3 + p.seed) * 0.7 + 0.3; p.v[2] = Math.cos(p.age * 2.3 + p.seed) * 0.3; if (p.p[1] < heightAt(p.p[0], p.p[2]) + 0.05) { p.v[1] = 0; p.v[0] = p.v[2] = 0; } },
        });
      }
    }
    // 반딧불이 (밤)
    if (nightness > 0.3 && R() < dt * 14 * nightness) {
      const x = P.x + R.range(-12, 12), z = P.z + R.range(-10, 10), h = heightAt(x, z);
      if (h > 0.4) fx.emit({
        position: [x, h + R.range(0.3, 1.4), z], life: R.range(3, 6), size: 2, color: [0.85, 1, 0.45], emissive: 1, gravity: 0, fadeIn: 0.25,
        update: (p, d) => { p.v[0] += Math.sin(p.age * 1.7 + p.seed) * d * 1.2; p.v[2] += Math.cos(p.age * 1.3 + p.seed) * d * 1.2; p.v[1] += Math.sin(p.age * 2.1 + p.seed * 2) * d * 0.8; },
      });
    }
    // 가로등 주변 불빛 가루
    if (nightness > 0.5 && R() < dt * 6) {
      const L = lamps[Math.floor(R() * lamps.length)];
      fx.emit({ position: [L[0] + R.range(-0.3, 0.3), L[1] - 0.2, L[2] + R.range(-0.3, 0.3)], velocity: [R.range(-0.3, 0.3), R.range(0.1, 0.4), R.range(-0.3, 0.3)], life: 1.6, size: 1, color: [1, 0.85, 0.5], emissive: 1, gravity: 0 });
    }

    // 고양이 (2D 스프라이트 애니메이션)
    catT += dt;
    if (catT > 0.45) { catT = 0; catFrame = (catFrame + 1) % 8; cat.material.texture = catFrames[catFrame === 5 ? 2 : catFrame % 2]; }

    // 배 흔들림
    boat.position[1] = Math.sin(time * 1.3) * 0.08 - 0.02;
    boat.rotation[2] = Math.sin(time * 1.1) * 0.06;
    boat.rotation[0] = Math.sin(time * 0.9 + 1) * 0.04;

    // 카메라 회전
    let turning;
    if (freeRotate) {
      const before = camera.yaw;
      camera.yaw = dampAngle(camera.yaw, yawGoal, 10, dt);
      turning = Math.abs(camera.yaw - before) > 1e-4;
      rot.to = rot.from = camera.yaw;
    } else {
      rot.t = Math.min(1, rot.t + dt / TURN_TIME);
      camera.yaw = rot.from + (rot.to - rot.from) * easeInOut(rot.t);
      turning = rot.t < 1;
      yawGoal = rot.to;
    }
    // 회전 중에만 직전 프레임을 섞어서 도트 깜빡임을 눌러준다
    renderer.settings.history = turning ? 0.45 : 0;
    zoom = damp(zoom, zoomGoal, 8, dt);
    const aspect = canvas.clientHeight / Math.max(1, canvas.clientWidth);
    camera.viewHeight = zoom * Math.max(1, aspect * 0.8);
    const goal = [P.x + camOffset[0], P.y + camOffset[1], P.z + camOffset[2]];
    scene.fog.near = camera.distance + 8; scene.fog.far = camera.distance + 40;
    // 땅 위 방향(x,z)은 캐릭터에 딱 붙여서 따라간다.
    // 카메라가 늦게 따라가면 캐릭터가 화면에서 1픽셀씩 앞뒤로 떨려 보이기 때문.
    // 점프/언덕 같은 높이 변화만 부드럽게.
    shake.amp = Math.max(0, shake.amp - dt * 2.2); shake.t += dt;
    const sx = Math.sin(shake.t * 53) * shake.amp, sz = Math.cos(shake.t * 47) * shake.amp;
    camera.target = [goal[0] + sx, damp(camera.target[1], goal[1], 6, dt), goal[2] + sz];

    ui?.onFrame?.(engine);
  };

  applyTime(hour);

  // UI에서 쓰는 조작 함수
  return {
    engine,
    setHour(h) { hour = h; },
    getHour() { return hour; },
    setAutoTime(v) { autoTime = v; },
    setRaw(v) {
      engine.raw = v;
    },
    setPalette(name) { renderer.settings.palette = name && PALETTES[name] ? PALETTES[name] : null; },
    jump() { input.trigger('jump'); },
    // 테스트/스크린샷용: 플레이어 순간이동
    teleport(x, z) { P.x = x; P.z = z; P.y = heightAt(x, z); camera.target = [x, P.y + 0.6, z]; },
    setYaw(y) { yawGoal = camera.yaw = rot.from = rot.to = y; rot.t = 1; },
    setFreeRotate(v) { freeRotate = v; rot.from = rot.to = yawGoal = camera.yaw; rot.t = 1; },
    turn,
    cast() { input.trigger('cast'); },
  };
}
