// PixelForge — 입력 (키보드 + 마우스 + 터치 가상 조이스틱)
//
//  input.axis()        → {x, y}  이동 입력 (-1~1, y는 화면 위쪽이 +)
//  input.down('Space') → 키가 눌려 있는지
//  input.pressed('jump') → 이번 프레임에 눌렸는지 (키 'Space' 또는 trigger('jump'))
//  input.takeRotate()  → 누적된 카메라 회전량 (라디안)
//  input.takeZoom()    → 누적된 줌 배율 (1 = 변화 없음)

export class Input {
  /** opts.stick: false면 가상 조이스틱 없이 모든 터치를 드래그/핀치로 사용 */
  constructor(el, { stick = true } = {}) {
    this.el = el;
    this.useStick = stick;
    this.rotateV = 0;
    this.keys = new Set();
    this.justPressed = new Set();
    this.rotate = 0;
    this.zoom = 1;
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, radius: 56 };
    this.pointers = new Map();
    this.pinchDist = 0;
    this.taps = []; // 드래그 없이 짧게 누른 위치 (캔버스 기준 CSS 픽셀)

    const keyName = (e) => (e.code === 'Space' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key);
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
      const k = keyName(e);
      if (!this.keys.has(k)) this.justPressed.add(k === 'Space' ? 'jump' : k);
      this.keys.add(k);
      if (k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(keyName(e)));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const isTouch = e.pointerType !== 'mouse';
      const p = { x: e.clientX, y: e.clientY, sx: x, sy: y, t: performance.now(), moved: 0, role: 'rotate' };
      if (this.useStick && isTouch && x < rect.width * 0.5 && !this.stick.active) {
        p.role = 'stick';
        Object.assign(this.stick, { active: true, id: e.pointerId, ox: x, oy: y, x: 0, y: 0 });
      }
      this.pointers.set(e.pointerId, p);
      this._updatePinch();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      if (p.role === 'stick') {
        const rect = el.getBoundingClientRect();
        let sx = (e.clientX - rect.left - this.stick.ox) / this.stick.radius;
        let sy = -(e.clientY - rect.top - this.stick.oy) / this.stick.radius;
        const l = Math.hypot(sx, sy);
        if (l > 1) { sx /= l; sy /= l; }
        this.stick.x = sx; this.stick.y = sy;
      } else if (this._rotatePointers().length >= 2) {
        const d = this._pinch();
        if (this.pinchDist > 0 && d > 0) this.zoom *= this.pinchDist / d;
        this.pinchDist = d;
      } else {
        this.rotate += dx * 0.008;
        this.rotateV += dy * 0.008;
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (p.role === 'stick') Object.assign(this.stick, { active: false, id: null, x: 0, y: 0 });
      else if (e.type === 'pointerup' && p.moved < 8 && performance.now() - p.t < 350 && this.pointers.size === 1) this.taps.push({ x: p.sx, y: p.sy });
      this.pointers.delete(e.pointerId);
      this._updatePinch();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  _rotatePointers() { return [...this.pointers.values()].filter((p) => p.role === 'rotate'); }
  _pinch() { const r = this._rotatePointers(); return r.length >= 2 ? Math.hypot(r[0].x - r[1].x, r[0].y - r[1].y) : 0; }
  _updatePinch() { this.pinchDist = this._pinch(); }

  down(k) { return this.keys.has(k); }
  pressed(k) { return this.justPressed.has(k); }
  trigger(k) { this.justPressed.add(k); }

  axis() {
    let x = 0, y = 0;
    if (this.down('a') || this.down('ArrowLeft')) x -= 1;
    if (this.down('d') || this.down('ArrowRight')) x += 1;
    if (this.down('w') || this.down('ArrowUp')) y += 1;
    if (this.down('s') || this.down('ArrowDown')) y -= 1;
    if (this.stick.active) { x += this.stick.x; y += this.stick.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  takeRotate() {
    let r = this.rotate;
    this.rotate = 0;
    return r;
  }
  takeRotateV() { const r = this.rotateV; this.rotateV = 0; return r; }
  takeZoom() { const z = this.zoom; this.zoom = 1; return z; }
  takeTaps() { const t = this.taps; this.taps = []; return t; }
  endFrame() { this.justPressed.clear(); }
}
