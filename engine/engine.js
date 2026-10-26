// PixelForge — 엔진 본체 (캔버스, 게임 루프, 편의 함수)

import { Renderer } from './renderer.js';
import { Scene, Sprite, Material } from './scene.js';
import { PixelCamera } from './camera.js';
import { Input } from './input.js';
import { Geometry } from './geometry.js';
import { textureFromPixels } from './gl.js';

export class Engine {
  /**
   * @param canvas HTMLCanvasElement
   * @param opts.pixelSize  저해상도 픽셀 1칸의 크기 (CSS 픽셀). 클수록 더 도트스러움
   */
  constructor(canvas, { pixelSize = 3, pixelScale = 0, stick = true } = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('이 브라우저는 WebGL2를 지원하지 않습니다.');
    this.canvas = canvas;
    this.gl = gl;
    this.renderer = new Renderer(gl);
    this.scene = new Scene();
    this.camera = new PixelCamera();
    this.input = new Input(canvas, { stick });
    this.pixelSize = pixelSize;
    this.pixelScale = pixelScale; // 0이면 pixelSize × dpr 사용
    this.raw = false; // true면 픽셀화 없이 원본 3D로 렌더 (비교용)
    this.time = 0;
    this.fps = 60;
    this.onUpdate = null; // (dt, time) => {}
    this._running = false;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  get dpr() { return Math.min(window.devicePixelRatio || 1, 3); }
  // 저해상도 1칸 = 디바이스 픽셀 몇 칸. pixelScale(정수)을 직접 지정하면 그 값을 쓴다
  get scale() {
    if (this.raw) return 1;
    if (this.pixelScale) return Math.max(1, Math.round(this.pixelScale));
    return Math.max(1, Math.round(this.pixelSize * this.dpr));
  }

  resize() {
    const c = this.canvas, d = this.dpr;
    const w = Math.max(1, Math.floor(c.clientWidth * d)), h = Math.max(1, Math.floor(c.clientHeight * d));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  start() {
    if (this._running) return;
    this._running = true;
    let last = performance.now();
    const frame = (now) => {
      if (!this._running) return;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // rAF 타임스탬프가 거꾸로 올 때 대비
      last = now;
      this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  stop() { this._running = false; }

  // 한 프레임 진행 (테스트나 녹화할 때 직접 호출해도 됨)
  step(dt) {
    this.time += dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.resize();
    if (this.onUpdate) this.onUpdate(dt, this.time);
    for (const ps of this.scene.particles) ps.update(dt);
    this.camera.snap = !this.raw;
    this.renderer.render(this.scene, this.camera, this.canvas.width, this.canvas.height, this.scale, this.time);
    this.input.endFrame();
  }

  /** 문자열 도트 그림 → 텍스처 */
  texture(rows, palette) { return textureFromPixels(this.gl, rows, palette); }

  /**
   * 도트 그림으로 2D 스프라이트 만들기 (카메라를 향해 서 있는 판)
   * unitsPerPixel: 도트 한 칸의 월드 크기
   */
  sprite(rows, palette, { unitsPerPixel = 1 / 12, billboard = true, emissive = 0, castShadow = true } = {}) {
    const tex = this.texture(rows, palette);
    const geo = Geometry.spriteQuad(tex.width * unitsPerPixel, tex.height * unitsPerPixel);
    return new Sprite(geo, new Material({ texture: tex, emissive, castShadow, outline: true }), { billboard, unitsPerPixel });
  }
}
