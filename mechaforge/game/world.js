// 방 지형: 구역별 벽/기둥/소품 모양, 방 배치(레이아웃), 적 길찾기 흐름장
//
//  레이아웃은 원형 충돌체 줄(간격 1, 반경 0.62)로 벽을 만든다. 적은 rooms.clamp() 에서
//  벽에 밀릴 때 흐름장(Flow) 방향으로 벽을 따라 미끄러져 틈으로 돌아 나온다.
//  문 앞(반경 4.5)과 방 중앙(보상 상자, 반경 3.4)은 항상 비워 둔다.

import { Geometry } from '../engine/index.js';

const TAU = Math.PI * 2;

// 방 종류별로 고를 수 있는 배치
export const LAYOUTS = {
  open:    { name: '개활지' },
  pillars: { name: '열주' },
  cross:   { name: '십자 회랑' },
  ring:    { name: '원형 투기장' },
  lanes:   { name: '삼중 통로' },
  bunkers: { name: '참호' },
  split:   { name: '전선' },
};

export function pickLayout(R, reward, prev) {
  if (reward === 'start' || reward === 'workshop') return 'open';
  if (reward === 'boss' || reward === 'guardian') return 'open'; // 수호자는 충돌체를 무시하고 움직인다
  const pool = ['open', 'pillars', 'cross', 'ring', 'lanes', 'bunkers', 'split'].filter((k) => k !== prev);
  return R.pick(pool);
}

// ---- 구역별 벽 조각 ----
//  piece(x, z, yaw, len, h): 길이 len 짜리 벽 한 칸, pillar(x, z, h): 기둥
function styleFor(ctx) {
  const { zone, Z, R, geo, glow, colliders, lights } = ctx;
  const pick = (a) => a[(R() * a.length) | 0];
  const rockAt = (x, z, r, col) => geo.merge(Geometry.icosphere(r, 0, col || pick(Z.wall), { jitter: 0.3, seed: (R() * 1e6) | 0, squashY: 0.8 }), { position: [x, r * 0.3, z], rotation: [0, R() * 6, 0] });
  const S = {
    desert: {
      // 무너진 사암 벽: 칸마다 높이가 다르고 가끔 이가 빠져 있다
      piece(x, z, yaw, len, h) {
        const hh = h * R.range(0.55, 1.05);
        geo.merge(Geometry.box(0.95, hh, len, pick(Z.stone)), { position: [x, 0, z], rotation: [0, yaw, R.range(-0.04, 0.04)] });
        if (R() < 0.3) rockAt(x + R.range(-0.5, 0.5), z + R.range(-0.5, 0.5), 0.3);
      },
      pillar(x, z, h) {
        geo.merge(Geometry.cylinder(0.5, 0.58, h, 6, pick(Z.stone)), { position: [x, 0, z] });
        geo.merge(Geometry.box(1.2, 0.3, 1.2, pick(Z.stone)), { position: [x, h, z] });
      },
      prop(x, z) {
        if (R() < 0.5) { geo.merge(Geometry.cylinder(0.42, 0.48, R.range(1.6, 3.2), 6, pick(Z.stone)), { position: [x, 0, z] }); colliders.push({ x, z, r: 0.55, block: true }); }
        else { rockAt(x, z, R.range(0.8, 1.3)); colliders.push({ x, z, r: 0.95 }); if (R() < 0.6) rockAt(x + 1, z + 0.6, 0.4); }
      },
    },
    factory: {
      // 강철 방벽: 위에 노랑/검정 경고 줄
      piece(x, z, yaw, len, h) {
        geo.merge(Geometry.box(0.9, h, len, pick(Z.wall)), { position: [x, 0, z], rotation: [0, yaw, 0] });
        geo.merge(Geometry.box(0.96, 0.14, len * 0.5, [0.85, 0.7, 0.2]), { position: [x - Math.sin(yaw) * len * 0.25, h, z - Math.cos(yaw) * len * 0.25], rotation: [0, yaw, 0] });
        geo.merge(Geometry.box(0.96, 0.14, len * 0.5, [0.16, 0.16, 0.18]), { position: [x + Math.sin(yaw) * len * 0.25, h, z + Math.cos(yaw) * len * 0.25], rotation: [0, yaw, 0] });
      },
      pillar(x, z, h) {
        geo.merge(Geometry.box(0.9, h, 0.9, [0.3, 0.32, 0.36]), { position: [x, 0, z] });
        geo.merge(Geometry.box(1.3, 0.2, 1.3, [0.85, 0.7, 0.2]), { position: [x, 0, z] });
        glow.merge(Geometry.box(0.2, 0.2, 0.94, [1, 0.55, 0.15]), { position: [x, h - 0.4, z] });
      },
      prop(x, z) {
        const t = R();
        if (t < 0.4) { const yaw = R() < 0.5 ? 0 : Math.PI / 2; geo.merge(Geometry.box(1.3, 1.3, 2.6, pick(Z.stone)), { position: [x, 0, z], rotation: [0, yaw, 0] }); colliders.push({ x, z, r: 0.9, block: true }, { x: x + (yaw ? 0.8 : 0), z: z + (yaw ? 0 : 0.8), r: 0.8, block: true }, { x: x - (yaw ? 0.8 : 0), z: z - (yaw ? 0 : 0.8), r: 0.8, block: true }); }
        else if (t < 0.7) { for (let k = 0; k < 3; k++) geo.merge(Geometry.cylinder(0.3, 0.3, 2.2, 7, [0.4, 0.42, 0.46]), { position: [x - 1.1, 0.3 + (k > 1 ? 0.5 : 0), z + (k % 2) * 0.62 - (k > 1 ? -0.31 : 0)], rotation: [0, 0, Math.PI / 2] }); colliders.push({ x, z: z + 0.3, r: 0.85 }); } // 파이프 더미
        else { geo.merge(Geometry.box(1.6, 1.5, 1.6, [0.4, 0.42, 0.46]), { position: [x, 0, z] }); geo.merge(Geometry.cylinder(0.15, 0.15, 2.2, 5, [0.6, 0.6, 0.62]), { position: [x + 0.5, 1.5, z] }); glow.merge(Geometry.box(0.5, 0.3, 0.05, [0.3, 1, 0.6]), { position: [x, 0.8, z + 0.82] }); colliders.push({ x, z, r: 1.05, block: true }); }
      },
    },
    crystal: {
      // 수정 능선: 바위 + 빛나는 수정 가시
      piece(x, z, yaw, len, h) {
        rockAt(x, z, R.range(0.6, 0.8));
        if (R() < 0.6) for (let k = 0; k < 2; k++) glow.merge(Geometry.cone(0.16 + R() * 0.12, h * R.range(0.8, 1.5), 5, pick(Z.stone)), { position: [x + R.range(-0.3, 0.3), 0, z + R.range(-0.3, 0.3)], rotation: [R.range(-0.4, 0.4), R() * 6, R.range(-0.4, 0.4)] });
      },
      pillar(x, z, h) {
        const c = pick(Z.stone);
        for (let k = 0; k < 4; k++) glow.merge(Geometry.cone(0.3 + R() * 0.15, h * R.range(0.7, 1.2), 5, c), { position: [x + R.range(-0.25, 0.25), 0, z + R.range(-0.25, 0.25)], rotation: [R.range(-0.3, 0.3), R() * 6, R.range(-0.3, 0.3)] });
        rockAt(x, z, 0.6);
      },
      prop(x, z) {
        if (R() < 0.6) { const c = pick(Z.stone); for (let k = 0; k < 3; k++) glow.merge(Geometry.cone(0.18 + R() * 0.15, R.range(1.6, 3) * (0.6 + R() * 0.5), 5, c), { position: [x + R.range(-0.3, 0.3), 0, z + R.range(-0.3, 0.3)], rotation: [R.range(-0.4, 0.4), R() * 6, R.range(-0.4, 0.4)] }); colliders.push({ x, z, r: 0.6, block: true }); if (lights.length < 3) lights.push({ position: [x, 1.5, z], color: c, radius: 5, intensity: 0.55 }); }
        else { rockAt(x, z, R.range(0.8, 1.2)); colliders.push({ x, z, r: 0.9 }); }
      },
    },
    foundry: {
      // 현무암 벽 + 갈라진 틈 사이로 새어 나오는 쇳물 빛
      piece(x, z, yaw, len, h) {
        const hh = h * R.range(0.8, 1.05);
        geo.merge(Geometry.box(1, hh, len, pick(Z.wall)), { position: [x, 0, z], rotation: [0, yaw, 0] });
        if (R() < 0.55) glow.merge(Geometry.box(1.04, 0.08, len * R.range(0.3, 0.8), pick(Z.stone)), { position: [x, hh * R.range(0.3, 0.7), z], rotation: [0, yaw, 0] });
      },
      pillar(x, z, h) {
        geo.merge(Geometry.cylinder(0.55, 0.7, h, 7, pick(Z.wall)), { position: [x, 0, z] });
        glow.merge(Geometry.cylinder(0.5, 0.5, 0.22, 7, [1, 0.55, 0.15]), { position: [x, h, z] }); // 도가니 쇳물
      },
      prop(x, z) {
        const t = R();
        if (t < 0.4) { // 쇳물 도가니
          geo.merge(Geometry.cylinder(0.85, 0.7, 1.1, 8, [0.3, 0.27, 0.27]), { position: [x, 0, z] });
          glow.merge(Geometry.cylinder(0.72, 0.72, 0.06, 8, [1, 0.6, 0.2]), { position: [x, 1.08, z] });
          colliders.push({ x, z, r: 0.95, block: true });
          if (lights.length < 3) lights.push({ position: [x, 1.8, z], color: [1, 0.5, 0.2], radius: 5, intensity: 0.6 });
        } else if (t < 0.7) { rockAt(x, z, R.range(0.8, 1.2)); colliders.push({ x, z, r: 0.95 }); }
        else { geo.merge(Geometry.box(2.2, 0.5, 1, [0.36, 0.3, 0.28]), { position: [x, 0, z], rotation: [0, R() * 3, 0] }); geo.merge(Geometry.box(0.9, 0.4, 0.6, [0.42, 0.36, 0.3]), { position: [x, 0.5, z], rotation: [0, R() * 3, 0] }); colliders.push({ x, z, r: 1 }); } // 주괴 더미
      },
    },
    tundra: {
      // 얼음 벽 + 눈 덮인 윗면
      piece(x, z, yaw, len, h) {
        const hh = h * R.range(0.75, 1.05);
        geo.merge(Geometry.box(0.95, hh, len, pick(Z.wall)), { position: [x, 0, z], rotation: [0, yaw, R.range(-0.05, 0.05)] });
        geo.merge(Geometry.box(1.05, 0.16, len + 0.05, [0.9, 0.93, 0.97]), { position: [x, hh, z], rotation: [0, yaw, 0] });
      },
      pillar(x, z, h) {
        for (let k = 0; k < 3; k++) geo.merge(Geometry.cone(0.42 + R() * 0.15, h * R.range(0.7, 1.1), 5, pick(Z.wall)), { position: [x + R.range(-0.2, 0.2), 0, z + R.range(-0.2, 0.2)], rotation: [R.range(-0.2, 0.2), R() * 6, R.range(-0.2, 0.2)] });
        geo.merge(Geometry.cylinder(0.75, 0.85, 0.2, 7, [0.9, 0.93, 0.97]), { position: [x, 0, z] });
      },
      prop(x, z) {
        const t = R();
        if (t < 0.45) { rockAt(x, z, R.range(0.8, 1.2), pick(Z.wall)); geo.merge(Geometry.icosphere(0.7, 0, [0.92, 0.95, 0.98], { squashY: 0.35, seed: (R() * 1e6) | 0 }), { position: [x, 0.7, z] }); colliders.push({ x, z, r: 0.95 }); }
        else if (t < 0.75) { // 얼어붙은 메카 잔해
          const y = R() * 6;
          geo.merge(Geometry.box(1.4, 0.9, 1.1, [0.36, 0.38, 0.44]), { position: [x, -0.1, z], rotation: [0.25, y, 0.2] });
          geo.merge(Geometry.box(1.5, 0.15, 1.2, [0.92, 0.95, 0.98]), { position: [x, 0.75, z], rotation: [0.25, y, 0.2] });
          geo.merge(Geometry.cylinder(0.12, 0.12, 1.6, 5, [0.3, 0.32, 0.38]), { position: [x - 0.4, 0.4, z], rotation: [0.2, y, 1.2] });
          colliders.push({ x, z, r: 0.95, block: true });
        } else { for (let k = 0; k < 3; k++) geo.merge(Geometry.cone(0.35, R.range(1.2, 2.2), 5, pick(Z.stone)), { position: [x + R.range(-0.4, 0.4), 0, z + R.range(-0.4, 0.4)], rotation: [R.range(-0.3, 0.3), 0, R.range(-0.3, 0.3)] }); colliders.push({ x, z, r: 0.7, block: true }); }
      },
    },
    orbital: {
      // 격벽 판넬: 위쪽에 청록 표시등 띠
      piece(x, z, yaw, len, h) {
        geo.merge(Geometry.box(0.8, h, len, pick(Z.wall)), { position: [x, 0, z], rotation: [0, yaw, 0] });
        geo.merge(Geometry.box(0.9, 0.12, len, [0.22, 0.24, 0.3]), { position: [x, 0, z], rotation: [0, yaw, 0] });
        glow.merge(Geometry.box(0.84, 0.08, len * 0.9, pick(Z.stone)), { position: [x, h - 0.25, z], rotation: [0, yaw, 0] });
      },
      pillar(x, z, h) {
        geo.merge(Geometry.cylinder(0.5, 0.5, h, 8, [0.4, 0.42, 0.5]), { position: [x, 0, z] });
        for (const y of [0.6, h - 0.5]) glow.merge(Geometry.cylinder(0.53, 0.53, 0.12, 8, [0.3, 0.9, 1]), { position: [x, y, z] });
      },
      prop(x, z) {
        const t = R();
        if (t < 0.4) { // 제어 콘솔
          geo.merge(Geometry.box(1.6, 1, 0.9, [0.36, 0.38, 0.46]), { position: [x, 0, z] });
          glow.merge(Geometry.box(1.2, 0.45, 0.05, pick(Z.stone)), { position: [x, 0.6, z + 0.46] });
          glow.merge(Geometry.box(0.05, 0.45, 0.6, pick(Z.stone)), { position: [x + 0.81, 0.6, z] });
          colliders.push({ x, z, r: 0.95, block: true });
        } else if (t < 0.7) { // 누운 화물 포드
          const yaw = R() * 3;
          geo.merge(Geometry.cylinder(0.6, 0.6, 2.2, 8, [0.62, 0.64, 0.7]), { position: [x - Math.sin(yaw) * 1.1, 0.6, z - Math.cos(yaw) * 1.1], rotation: [Math.PI / 2, yaw, 0] });
          glow.merge(Geometry.cylinder(0.62, 0.62, 0.15, 8, [1, 0.6, 0.2]), { position: [x, 0.6, z], rotation: [Math.PI / 2, yaw, 0] });
          colliders.push({ x: x + Math.sin(yaw) * 0.5, z: z + Math.cos(yaw) * 0.5, r: 0.75 }, { x: x - Math.sin(yaw) * 0.5, z: z - Math.cos(yaw) * 0.5, r: 0.75 });
        } else { geo.merge(Geometry.cylinder(0.12, 0.2, 3.4, 5, [0.5, 0.52, 0.58]), { position: [x, 0, z] }); geo.merge(Geometry.box(1.2, 0.08, 0.08, [0.5, 0.52, 0.58]), { position: [x, 2.8, z] }); glow.merge(Geometry.icosphere(0.14, 0, [1, 0.3, 0.3]), { position: [x, 3.45, z] }); colliders.push({ x, z, r: 0.4, block: true }); } // 안테나
      },
    },
  };
  return { ...S[zone], rock: rockAt };
}

// ---- 레이아웃 만들기 ----
//  ctx: { R, hx, hz, zone, Z, geo, glow, colliders, cover(x, z) }
export function buildLayout(kind, ctx) {
  const { R, hx, hz, colliders } = ctx;
  const st = styleFor(ctx);
  const a = Math.min(hx, hz);
  const doors = [[hx, 0], [-hx, 0], [0, hz], [0, -hz]];
  const ok = (x, z, m = 0.6) => Math.abs(x) < hx - 1.6 && Math.abs(z) < hz - 1.6 && Math.hypot(x, z) > 3.4 + m
    && doors.every(([dx, dz]) => Math.hypot(x - dx, z - dz) > 4.5 + m);
  const H = 1.25; // 벽 높이 (카메라가 기체를 가리지 않게 낮게)
  // 벽: (x0,z0)→(x1,z1) 을 1 간격 칸으로. gaps = [[t0,t1], ...] (0~1 비율) 는 비운다
  const wall = (x0, z0, x1, z1, gaps = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len)), yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (gaps.some(([g0, g1]) => t > g0 && t < g1)) continue;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (!ok(x, z)) continue;
      st.piece(x, z, yaw, len / n + 0.05, H);
      colliders.push({ x, z, r: 0.62, block: true });
    }
  };
  const pillar = (x, z) => { if (!ok(x, z, 0.9)) return; st.pillar(x, z, R.range(2.2, 3)); colliders.push({ x, z, r: 0.8, block: true }); };
  const covers = (n) => { for (let i = 0; i < n; i++) { const p = spot(ctx, ok, 2.2); if (p) ctx.cover(p[0], p[1]); } };

  if (kind === 'pillars') {
    // 바둑판 열주: 축(문으로 가는 길)은 비워 둔다
    const s = R.pick([4.6, 5.4]);
    for (let x = s / 2; x < hx - 2; x += s) for (let z = s / 2; z < hz - 2; z += s) for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) pillar(sx * x, sz * z);
    covers(2 + ((R() * 2) | 0));
  } else if (kind === 'cross') {
    // 대각선 X 벽: 방이 문마다 하나씩 쐐기 넷으로 나뉘고, 중앙과 팔 끝의 틈으로만 오간다
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const r0 = 4.4, r1 = a * 1.15, k = Math.SQRT1_2, g = R.range(0.35, 0.65);
      wall(sx * r0 * k, sz * r0 * k, sx * r1 * k, sz * r1 * k, R() < 0.6 ? [[g - 0.12, g + 0.12]] : []);
    }
    covers(2);
  } else if (kind === 'ring') {
    // 원형 벽: 문 방향 4곳 + 가끔 대각선이 뚫려 있다
    const rr = a * 0.55, gapA = 1.7 / rr, diag = R() < 0.5;
    const n = Math.round(TAU * rr);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      const off = (q) => Math.abs(((ang - q + Math.PI * 3) % TAU) - Math.PI);
      if ([0, 1, 2, 3].some((q) => off(q * Math.PI / 2) < gapA)) continue;
      if (diag && [1, 3, 5, 7].some((q) => off(q * Math.PI / 4) < gapA * 0.8)) continue;
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
      st.piece(x, z, -ang, TAU * rr / n + 0.05, H); // 접선 방향
      colliders.push({ x, z, r: 0.62, block: true });
    }
    // 바깥 고리에 기둥 몇 개
    for (let i = 0; i < 4; i++) { const ang = Math.PI / 4 + i * Math.PI / 2, r = a * 0.85; pillar(Math.cos(ang) * r, Math.sin(ang) * r); }
    covers(2);
  } else if (kind === 'lanes') {
    // 평행 벽 두 줄: 가운데 + 한쪽에 틈 → 세 통로
    const alongX = R() < 0.5, L = alongX ? hx : hz, c = (alongX ? hz : hx) * 0.42;
    for (const s of [-1, 1]) {
      const g = R() < 0.5 ? [0.12, 0.24] : [0.76, 0.88];
      const gaps = [[0.44, 0.56], g];
      if (alongX) wall(-L + 2, s * c, L - 2, s * c, gaps); else wall(s * c, -L + 2, s * c, L - 2, gaps);
    }
    covers(3);
  } else if (kind === 'bunkers') {
    // ㄱ자 참호 벽 여러 개 + 부서지는 엄폐물
    const n = 5 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const p = spot(ctx, ok, 3.5); if (!p) continue;
      const [x, z] = p, yaw = ((R() * 4) | 0) * (Math.PI / 2), l1 = R.range(2.2, 3.4), l2 = R.range(1.6, 2.6);
      const ux = Math.sin(yaw), uz = Math.cos(yaw);
      wall(x, z, x + ux * l1, z + uz * l1);
      wall(x, z, x + uz * l2, z - ux * l2);
    }
    covers(4 + ((R() * 3) | 0));
  } else if (kind === 'split') {
    // 전선: 입구 쪽(E,N)과 출구 쪽(W,S)을 가르는 대각 방벽. 중앙 + 두 곳만 뚫려 있다
    const g1 = R.range(0.14, 0.26), g2 = R.range(0.74, 0.86);
    wall(-(hx - 2), hz - 2, hx - 2, -(hz - 2), [[g1 - 0.06, g1 + 0.06], [0.43, 0.57], [g2 - 0.06, g2 + 0.06]]);
    covers(3);
  } else {
    covers(R() < 0.5 ? 2 : 0);
  }
  // 구역 소품 (개활지는 많이, 구조물이 있는 방은 조금)
  const nProps = ctx.nProps ?? (kind === 'open' ? 5 + ((R() * 4) | 0) : 1 + ((R() * 3) | 0));
  for (let i = 0; i < nProps; i++) { const p = spot(ctx, ok, 2.5); if (p) st.prop(p[0], p[1]); }
  ctx.ok = ok;
  return st;
}

// 비어 있는 자리 하나 (다른 충돌체와 d 이상 떨어진 곳)
export function spot(ctx, ok, d = 2.5) {
  const { R, hx, hz, colliders } = ctx;
  for (let k = 0; k < 40; k++) {
    const x = R.range(-hx + 2, hx - 2), z = R.range(-hz + 2, hz - 2);
    if (ok(x, z) && !colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + d)) return [x, z];
  }
  return null;
}

// ---- 길찾기 흐름장 ----
//  1칸 격자에서 플레이어 칸까지의 거리(다익스트라). 적은 막혔을 때만 이 방향을 따라 미끄러진다
export class Flow {
  build(hx, hz, colliders) {
    this.hx = hx; this.hz = hz;
    this.nx = Math.ceil(hx * 2) + 1; this.nz = Math.ceil(hz * 2) + 1;
    const N = this.nx * this.nz;
    this.solid = new Uint8Array(N);
    this.dist = new Float64Array(N).fill(1e9); // Float32 면 꺼낸 거리와 저장된 거리가 반올림으로 달라져 칸을 건너뛴다
    for (const c of colliders) {
      if (c.prize) continue;
      const rr = c.r + 0.3;
      for (let i = Math.max(0, Math.floor(c.x + hx - rr)); i <= Math.min(this.nx - 1, Math.ceil(c.x + hx + rr)); i++)
        for (let j = Math.max(0, Math.floor(c.z + hz - rr)); j <= Math.min(this.nz - 1, Math.ceil(c.z + hz + rr)); j++)
          if (Math.hypot(i + 0.5 - hx - c.x, j + 0.5 - hz - c.z) < rr) this.solid[i + j * this.nx] = 1;
    }
    this.ready = false; this.t = 0;
  }
  // 부서진 엄폐물 자리를 다시 길로
  unblock(x, z, r) {
    if (!this.solid) return;
    for (let i = Math.floor(x + this.hx - r - 1); i <= x + this.hx + r + 1; i++) for (let j = Math.floor(z + this.hz - r - 1); j <= z + this.hz + r + 1; j++)
      if (i >= 0 && j >= 0 && i < this.nx && j < this.nz && Math.hypot(i + 0.5 - this.hx - x, j + 0.5 - this.hz - z) < r + 0.3) this.solid[i + j * this.nx] = 0;
  }
  cell(x, z) {
    const i = Math.floor(x + this.hx), j = Math.floor(z + this.hz);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : i + j * this.nx;
  }
  update(dt, px, pz) {
    if (!this.solid || (this.t -= dt) > 0) return;
    this.t = 0.2;
    const { nx, nz, solid, dist } = this;
    dist.fill(1e9);
    const s = this.cell(px, pz);
    if (s < 0) return;
    // 이진 힙 다익스트라 (직선 1, 대각 1.41, 모서리 깎기 금지)
    const heap = [[0, s]]; dist[s] = 0;
    const push = (d, k) => { heap.push([d, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      const i = k % nx, j = (k / nx) | 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const q = a + b * nx;
        if (solid[q] || (di && dj && (solid[a + j * nx] || solid[i + b * nx]))) continue;
        const nd = d + (di && dj ? 1.414 : 1);
        if (nd < dist[q]) { dist[q] = nd; push(nd, q); }
      }
    }
    this.ready = true;
  }
  // (x,z) 에서 플레이어로 가는 다음 칸 방향 (단위 벡터) 또는 null
  dir(x, z) {
    if (!this.ready) return null;
    const k = this.cell(x, z);
    if (k < 0) return null;
    const { nx, nz, dist } = this, i = k % nx, j = (k / nx) | 0;
    let best = dist[k], bx = 0, bz = 0;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj;
      if ((!di && !dj) || a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const d = dist[a + b * nx] + (di && dj ? 0.414 : 0);
      if (d < best) { best = d; bx = di; bz = dj; }
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return [bx / l, bz / l];
  }
}
