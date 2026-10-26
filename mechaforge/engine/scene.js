// PixelForge — 씬 그래프 (노드 / 메시 / 스프라이트 / 머티리얼 / 씬)

import { m4, hexColor } from './math.js';

const toColor = (c) => (typeof c === 'string' ? hexColor(c) : c);

export class Material {
  /**
   * @param {object} o
   *  color     기본색 (정점색과 곱해짐) '#rrggbb' 또는 [r,g,b]
   *  emissive  0~1, 빛을 받지 않고 스스로 빛남 + 블룸
   *  outline   외곽선/하이라이트 대상 여부
   *  wind      바람 흔들림 세기 (나뭇잎 등, 로컬 y가 높을수록 많이 흔들림)
   *  texture   픽셀아트 텍스처 (알파 0.5 미만은 버림)
   *  castShadow 그림자 드리우기
   *  opacity   0~1, 베이어 디더링으로 표현하는 반투명 (이펙트 페이드에 사용)
   *  rim       0~1, 행성 대기처럼 실루엣 가장자리만 빛나는 껍질
   */
  constructor({ color = [1, 1, 1], emissive = 0, outline = true, wind = 0, texture = null, castShadow = true, opacity = 1, rim = 0 } = {}) {
    this.color = toColor(color);
    this.emissive = emissive;
    this.outline = outline;
    this.wind = wind;
    this.texture = texture;
    this.castShadow = castShadow;
    this.opacity = opacity; // 1 미만이면 디더링으로 반투명
    this.rim = rim;         // 대기 껍질용: 가장자리만 보이게
  }
}

export class Node {
  constructor(name = '') {
    this.name = name;
    this.position = [0, 0, 0];
    this.rotation = [0, 0, 0]; // 오일러 (x, y, z) 라디안
    this.scale = [1, 1, 1];
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.world = m4.identity();
    this.matrix = null; // 지정하면 position/rotation/scale 대신 이 로컬 행렬을 사용 (예: 지구본 회전)
  }
  add(...nodes) {
    for (const n of nodes) { if (n.parent) n.parent.remove(n); n.parent = this; this.children.push(n); }
    return nodes[0];
  }
  remove(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) { this.children.splice(i, 1); n.parent = null; }
  }
  setScale(s) { this.scale = typeof s === 'number' ? [s, s, s] : s; return this; }
  updateWorld(parentWorld = null) {
    const local = this.matrix || m4.fromTRS(this.position, this.rotation, this.scale);
    this.world = parentWorld ? m4.multiply(parentWorld, local) : local;
    for (const c of this.children) c.updateWorld(this.world);
  }
  worldPosition() { return [this.world[12], this.world[13], this.world[14]]; }
  traverse(fn) { if (fn(this) === false) return; for (const c of this.children) c.traverse(fn); }
}

export class Mesh extends Node {
  constructor(geometry, material = new Material(), name = '') {
    super(name);
    this.geometry = geometry;
    this.material = material instanceof Material ? material : new Material(material);
  }
}

// 카메라를 향해 Y축으로 회전하는 2D 스프라이트.
// pixelsPerUnit을 주면 텍스처 1픽셀 = 화면 1 저해상도 픽셀이 되도록 크기를 맞출 수 있음 (Engine.pixelSprite 참고)
export class Sprite extends Mesh {
  constructor(geometry, material, { billboard = true, unitsPerPixel = 0, pixelPerfect = true } = {}) {
    super(geometry, material);
    this.billboard = billboard;
    this.unitsPerPixel = unitsPerPixel; // 텍스처 1칸의 월드 크기 (지오메트리를 만들 때 쓴 값)
    this.pixelPerfect = pixelPerfect;
  }
}

/**
 * 같은 모양을 수백~수천 개 한 번에 그리는 메시 (생물, 나무, 집 등).
 *   const trees = new InstancedMesh(geo, mat, 5000);
 *   trees.setAt(i, matrix, [r,g,b], emissive); trees.count = n;
 * 인스턴스 행렬은 이 노드 기준 로컬 좌표.
 */
export class InstancedMesh extends Node {
  constructor(geometry, material = new Material(), capacity = 1000, name = '') {
    super(name);
    this.geometry = geometry;
    this.material = material instanceof Material ? material : new Material(material);
    this.capacity = capacity;
    this.count = 0;
    this.matrices = new Float32Array(capacity * 16);
    this.colors = new Float32Array(capacity * 4).fill(1);
    for (let i = 0; i < capacity; i++) this.colors[i * 4 + 3] = 0;
    this.dirty = true;
    this._gpu = null;
  }
  setAt(i, matrix, color = null, emissive = null) {
    this.matrices.set(matrix, i * 16);
    if (color) { this.colors[i * 4] = color[0]; this.colors[i * 4 + 1] = color[1]; this.colors[i * 4 + 2] = color[2]; }
    if (emissive !== null) this.colors[i * 4 + 3] = emissive;
    this.dirty = true;
  }
  upload(gl) {
    const g = this.geometry.upload(gl);
    if (!this._gpu) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const [bp, bn, bc, bu] = g.buffers;
      const bind = (buf, loc, size) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
      bind(bp, 0, 3); bind(bn, 1, 3); bind(bc, 2, 3); bind(bu, 3, 2);
      const mb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mb);
      gl.bufferData(gl.ARRAY_BUFFER, this.matrices.byteLength, gl.DYNAMIC_DRAW);
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(4 + k);
        gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, 64, k * 16);
        gl.vertexAttribDivisor(4 + k, 1);
      }
      const cb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(8, 1);
      gl.bindVertexArray(null);
      this._gpu = { vao, mb, cb, count: g.count };
      this.dirty = true;
    }
    if (this.dirty && this.count > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.mb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.matrices, 0, this.count * 16);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._gpu.cb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors, 0, this.count * 4);
      this.dirty = false;
    }
    return this._gpu;
  }
}

export class Scene extends Node {
  constructor() {
    super('scene');
    this.sun = {
      direction: [0.5, 0.8, 0.3], // 빛이 오는 방향(표면→태양)
      color: [1.0, 0.95, 0.85],
      intensity: 1.0,
    };
    this.ambientSky = [0.42, 0.48, 0.62];
    this.ambientGround = [0.30, 0.26, 0.24];
    this.skyColor = [0.55, 0.75, 0.9];
    this.fog = { color: [0.55, 0.75, 0.9], near: 40, far: 90 };
    this.particles = []; // ParticleSystem 목록
    this.grass = [];     // GrassField 목록
    this.water = [];     // Water 목록
    this.stars = false;  // 배경에 별 (우주 장면)
    this.starOffset = [0, 0];
    this.lights = [];    // 점광원 { position:[x,y,z], color:[r,g,b], radius, intensity } (최대 8개)
  }
}
