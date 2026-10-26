// PixelForge — 제한 팔레트 (합성 단계에서 가장 가까운 색으로 치환)
import { hexColor } from './math.js';

const P = (s) => s.trim().split(/\s+/).map(hexColor);

export const PALETTES = {
  // 따뜻한 들판 32색
  meadow: P(`
    #1a1c2c #2b2a45 #3b4a6b #45628f #4d8bb0 #6cc4d6 #a6eef0 #f4f4f4
    #20352b #2e5a3a #3f7d3c #64a33f #9bc94b #d3e57a #f1f2b5 #c6b38a
    #7a5a3a #9c7246 #c49a5a #e6c27a #f6e3a4 #8a3b3b #c4523f #ee8a4f
    #f7b267 #6b3f6b #a35a8a #e08ab0 #5a5e6e #8a8f9e #b9bcc6 #0f0f17`),
  // DawnBringer 16 (픽셀아트 커뮤니티에서 널리 쓰이는 공개 팔레트)
  db16: P(`
    #140c1c #442434 #30346d #4e4a4e #854c30 #346524 #d04648 #757161
    #597dce #d27d2c #8595a1 #6daa2c #d2aa99 #6dc2ca #dad45e #deeed6`),
  // 4톤 녹색 휴대용 게임기 느낌
  handheld: P(`#0f2a1d #2f5a32 #7aa04a #cfe39a`),
};
