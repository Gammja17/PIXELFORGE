// PixelForge — 수학 유틸 (vec3 / mat4 / 노이즈 / 난수)
// 행렬은 WebGL과 같은 column-major Float32Array(16)

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 프레임레이트와 무관한 지수 감쇠 보간 (부드러운 카메라/회전에 사용)
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
};

export const m4 = {
  identity() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  multiply(a, b, out = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
    return m;
  },
  perspective(fovy, aspect, n, f) {
    const m = new Float32Array(16), t = 1 / Math.tan(fovy / 2);
    m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
    return m;
  },
  // 카메라 위치(eye)에서 forward 방향을 보는 view 행렬
  lookDir(eye, fwd, upHint = [0, 1, 0]) {
    const z = v3.norm(v3.scale(fwd, -1));
    let x = v3.cross(upHint, z);
    if (v3.len(x) < 1e-5) x = [1, 0, 0];
    x = v3.norm(x);
    const y = v3.cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -v3.dot(x, eye); m[13] = -v3.dot(y, eye); m[14] = -v3.dot(z, eye); m[15] = 1;
    return m;
  },
  // 위치/회전(오일러 XYZ, 라디안)/스케일 → 모델 행렬
  fromTRS(p, r, s) {
    const [cx, cy, cz] = [Math.cos(r[0]), Math.cos(r[1]), Math.cos(r[2])];
    const [sx, sy, sz] = [Math.sin(r[0]), Math.sin(r[1]), Math.sin(r[2])];
    // R = Ry * Rx * Rz  (yaw → pitch → roll, 게임에서 다루기 쉬운 순서)
    const m00 = cy * cz + sy * sx * sz, m01 = -cy * sz + sy * sx * cz, m02 = sy * cx;
    const m10 = cx * sz, m11 = cx * cz, m12 = -sx;
    const m20 = -sy * cz + cy * sx * sz, m21 = sy * sz + cy * sx * cz, m22 = cy * cx;
    const m = new Float32Array(16);
    m[0] = m00 * s[0]; m[1] = m10 * s[0]; m[2] = m20 * s[0];
    m[4] = m01 * s[1]; m[5] = m11 * s[1]; m[6] = m21 * s[1];
    m[8] = m02 * s[2]; m[9] = m12 * s[2]; m[10] = m22 * s[2];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
    return m;
  },
  transformPoint(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  },
  transformDir(m, d) {
    return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
  },
  // 법선 행렬: 모델 행렬 3x3의 역전치 (비균등 스케일에서도 법선이 맞도록)
  normalMatrix(m, out = new Float32Array(9)) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a10 = m[4], a11 = m[5], a12 = m[6], a20 = m[8], a21 = m[9], a22 = m[10];
    const b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20;
    let det = a00 * b01 + a01 * b11 + a02 * b21;
    det = det ? 1 / det : 0;
    out[0] = b01 * det; out[3] = (-a22 * a01 + a02 * a21) * det; out[6] = (a12 * a01 - a02 * a11) * det;
    out[1] = b11 * det; out[4] = (a22 * a00 - a02 * a20) * det; out[7] = (-a12 * a00 + a02 * a10) * det;
    out[2] = b21 * det; out[5] = (-a21 * a00 + a01 * a20) * det; out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
  },
};

// ---- 시드 난수 / 값 노이즈 ----
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const f = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  f.range = (a, b) => a + (b - a) * f();
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise3(x * f + i * 17.3, y * f, z * f) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}
// 축(axis) 기준 회전 행렬 (로드리게스)
export function axisAngle(axis, ang) {
  const [x, y, z] = v3.norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const m = new Float32Array(16);
  m[0] = t * x * x + c; m[1] = t * x * y + s * z; m[2] = t * x * z - s * y;
  m[4] = t * x * y - s * z; m[5] = t * y * y + c; m[6] = t * y * z + s * x;
  m[8] = t * x * z + s * y; m[9] = t * y * z - s * x; m[10] = t * z * z + c;
  m[15] = 1;
  return m;
}
// 기저 벡터(오른쪽, 위, 앞)와 위치로 모델 행렬 만들기
export function basisMatrix(right, up, fwd, pos, scale = 1) {
  const m = new Float32Array(16);
  m[0] = right[0] * scale; m[1] = right[1] * scale; m[2] = right[2] * scale;
  m[4] = up[0] * scale; m[5] = up[1] * scale; m[6] = up[2] * scale;
  m[8] = fwd[0] * scale; m[9] = fwd[1] * scale; m[10] = fwd[2] * scale;
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2]; m[15] = 1;
  return m;
}

export const hexColor = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
