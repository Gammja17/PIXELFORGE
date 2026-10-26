// PixelForge — 픽셀 스냅 직교 카메라
//
// 핵심 아이디어:
//  1) 카메라 위치를 "저해상도 픽셀 1칸" 단위로만 움직여서 렌더한다 → 정적인 물체의 픽셀이 절대 지글거리지 않음
//  2) 스냅하면서 버린 소수점 이하 오프셋(subpixel)을 기억해 두었다가,
//     마지막 업스케일 단계에서 저해상도 이미지를 그만큼 화면 픽셀 단위로 밀어준다 → 스크롤은 부드러움

import { m4, v3 } from './math.js';

export class PixelCamera {
  constructor({ yaw = Math.PI / 4, pitch = Math.PI / 6, viewHeight = 16, distance = 60 } = {}) {
    this.target = [0, 0, 0];
    this.yaw = yaw;           // Y축 회전
    this.pitch = pitch;       // 내려다보는 각도
    this.viewHeight = viewHeight; // 화면 세로에 보이는 월드 크기 (줌)
    this.distance = distance;
    this.snap = true;

    this.view = m4.identity();
    this.proj = m4.identity();
    this.viewProj = m4.identity();
    this.subpixel = [0, 0];
    this.pixelWorld = 0.1;
    this.near = 1; this.far = 200;
    this.forward = [0, 0, -1]; this.right = [1, 0, 0]; this.up = [0, 1, 0];
  }

  /** lowW/lowH: 렌더 타깃 크기, visibleH: 실제 화면에 보이는 저해상도 세로 픽셀 수 */
  update(lowW, lowH, visibleH) {
    const pw = (this.pixelWorld = this.viewHeight / visibleH);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fwd = (this.forward = [-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp]);
    const right = (this.right = v3.norm(v3.cross(fwd, [0, 1, 0])));
    const up = (this.up = v3.cross(right, fwd));
    let eye = v3.sub(this.target, v3.scale(fwd, this.distance));

    if (this.snap) {
      const pr = v3.dot(eye, right) / pw, pu = v3.dot(eye, up) / pw;
      const fr = pr - Math.round(pr), fu = pu - Math.round(pu);
      this.subpixel = [fr, fu];
      eye = v3.sub(eye, v3.add(v3.scale(right, fr * pw), v3.scale(up, fu * pw)));
    } else {
      this.subpixel = [0, 0];
    }
    this.eye = eye;
    this.far = this.distance * 2 + 40;
    this.view = m4.lookDir(eye, fwd);
    const hw = (lowW / 2) * pw, hh = (lowH / 2) * pw;
    this.proj = m4.ortho(-hw, hw, -hh, hh, this.near, this.far);
    m4.multiply(this.proj, this.view, this.viewProj);
  }

  /**
   * 화면 좌표(캔버스 기준 CSS 픽셀) → 월드 광선 { origin, dir }
   * 직교 카메라라 모든 광선의 방향이 같다. scale: 저해상도 1칸당 화면 픽셀(디바이스 픽셀), dpr: 기기 배율
   */
  screenRay(cssX, cssY, cssW, cssH, scale, dpr = 1) {
    const pw = this.pixelWorld;
    const ox = ((cssX - cssW / 2) * dpr) / scale * pw;
    const oy = ((cssH / 2 - cssY) * dpr) / scale * pw;
    const origin = v3.add(this.eye, v3.add(v3.scale(this.right, ox), v3.scale(this.up, oy)));
    return { origin, dir: this.forward };
  }

  /** 화면 기준 입력(x: 오른쪽, y: 위쪽)을 지면 위 이동 방향으로 변환 */
  groundDirection(x, y) {
    const f = v3.norm([this.forward[0], 0, this.forward[2]]);
    const r = v3.norm([this.right[0], 0, this.right[2]]);
    return v3.add(v3.scale(r, x), v3.scale(f, y));
  }
}
