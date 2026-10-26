// PixelForge — 픽셀 렌더 파이프라인
//
//  [그림자맵] → [장면: 저해상도 MRT(색, 법선, 깊이)] → [복사] → [물] → [파티클]
//            → [블룸 추출/블러] → [합성: 외곽선·하이라이트·색보정·팔레트] → [업스케일: 정수배율+서브픽셀]

import { createProgram, createTarget, createTexture } from './gl.js';
import { m4, v3 } from './math.js';
import { Mesh, Sprite, InstancedMesh } from './scene.js';
import * as S from './shaders.js';

export const DEFAULT_SETTINGS = {
  outline: true,
  depthThreshold: 0.45, // 월드 단위. 이보다 깊이 차이가 크면 외곽선
  outlineDarkness: 0.5,  // 외곽선 픽셀 밝기 배율
  highlight: 0.28,       // 볼록 모서리 하이라이트 세기
  bloom: true,
  bloomStrength: 1.3,
  saturation: 1.12,
  contrast: 1.04,
  vignette: 0.22,
  grade: [1, 1, 1],
  palette: null,         // [[r,g,b], ...] 최대 32색. null이면 자유 색
  dither: 0,             // 0~0.15 정도
  clouds: true,
  shadowSize: 22,        // 그림자맵이 덮는 반경 (월드 단위)
  shadowResolution: 2048,
  windStrength: 1,
  history: 0,            // 0~0.6: 직전 프레임을 섞는 양. 회전처럼 화면 전체가 바뀔 때 도트 깜빡임을 줄여줌
};

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.settings = { ...DEFAULT_SETTINGS };
    this.p = {
      scene: createProgram(gl, S.sceneVS, S.sceneFS, 'scene'),
      sceneInst: createProgram(gl, S.sceneInstVS, S.sceneFS, 'sceneInst'),
      shadow: createProgram(gl, S.shadowVS, S.shadowFS, 'shadow'),
      shadowInst: createProgram(gl, S.shadowInstVS, S.shadowFS, 'shadowInst'),
      grass: createProgram(gl, S.grassVS, S.grassFS, 'grass'),
      water: createProgram(gl, S.waterVS, S.waterFS, 'water'),
      particle: createProgram(gl, S.particleVS, S.particleFS, 'particle'),
      bloomExtract: createProgram(gl, S.fullscreenVS, S.bloomExtractFS, 'bloomExtract'),
      blur: createProgram(gl, S.fullscreenVS, S.blurFS, 'blur'),
      composite: createProgram(gl, S.fullscreenVS, S.compositeFS, 'composite'),
      upscale: createProgram(gl, S.fullscreenVS, S.upscaleFS, 'upscale'),
    };
    this.emptyVAO = gl.createVertexArray();
    this.identity = m4.identity();
    this.white = createTexture(gl, 1, 1, { data: new Uint8Array([255, 255, 255, 255]) });
    const res = Math.min(this.settings.shadowResolution, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.shadowTarget = createTarget(gl, res, res, { colors: 0, depth: true });
    this.targets = null;
    this.lowSize = [0, 0];
    this.stats = { drawCalls: 0, lowW: 0, lowH: 0, scale: 1 };
  }

  _ensureTargets(w, h) {
    if (this.targets && this.lowSize[0] === w && this.lowSize[1] === h) return;
    const gl = this.gl;
    if (this.targets) Object.values(this.targets).forEach((t) => t.dispose());
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    this.targets = {
      scene: createTarget(gl, w, h, { colors: 2, depth: true }),
      copy: createTarget(gl, w, h, { colors: 1, depth: true }),
      bloomA: createTarget(gl, bw, bh, { colors: 1, filter: gl.LINEAR }),
      bloomB: createTarget(gl, bw, bh, { colors: 1, filter: gl.LINEAR }),
      final: createTarget(gl, w, h, { colors: 1 }),
      prev: createTarget(gl, w, h, { colors: 1 }),
    };
    this._prevValid = false;
    this.lowSize = [w, h];
  }

  _lightUniforms(prog, scene, time) {
    const sun = scene.sun, st = this.settings;
    prog.set('uShadowMap', this.shadowTarget.depth)
      .set('uLightVP', this.lightVP)
      .set('uSunDir', this.sunDir)
      .set('uSunColor', v3.scale(sun.color, sun.intensity))
      .set('uSkyAmb', scene.ambientSky)
      .set('uGroundAmb', scene.ambientGround)
      .set('uFogColor', scene.fog.color)
      .set('uFog', [scene.fog.near, scene.fog.far])
      .set('uShadowBias', 0.0012)
      .set('uTime', time)
      .set('uClouds', st.clouds ? 1 : 0)
      .set('uPointPos', this._pointPos).set('uPointCol', this._pointCol).set('uPointCount', this._pointCount);
  }

  /**
   * @param scene  Scene
   * @param camera PixelCamera
   * @param canvasW, canvasH  실제 캔버스 픽셀 크기
   * @param scale  저해상도 픽셀 1칸 = 화면 픽셀 몇 칸 (정수)
   */
  render(scene, camera, canvasW, canvasH, scale, time) {
    const gl = this.gl, st = this.settings;
    const lowW = Math.ceil(canvasW / scale) + 2, lowH = Math.ceil(canvasH / scale) + 2;
    this._ensureTargets(lowW, lowH);
    this.stats = { drawCalls: 0, lowW, lowH, scale };
    camera.update(lowW, lowH, canvasH / scale);

    // ---- 씬 그래프 갱신 (스프라이트는 카메라를 바라보게) ----
    const meshes = [], instanced = [];
    scene.traverse((n) => {
      if (!n.visible) return false;
      if (n instanceof InstancedMesh) { if (n.count > 0) instanced.push(n); return; }
      if (n instanceof Sprite) {
        if (n.billboard) n.rotation[1] = camera.yaw;
        // 픽셀 퍼펙트: 텍스처 1칸이 항상 저해상도 화면 1칸이 되도록 크기 보정
        if (n.pixelPerfect && n.unitsPerPixel) { const k = camera.pixelWorld / n.unitsPerPixel; n.scale = [k, k, k]; }
      }
      if (n instanceof Mesh) meshes.push(n);
    });
    scene.updateWorld();

    // ---- 점광원 패킹 (세기 순으로 최대 8개) ----
    this._pointPos = new Float32Array(32); this._pointCol = new Float32Array(32);
    const lights = scene.lights.filter((l) => l.intensity > 0.01).sort((a, b) => b.intensity - a.intensity).slice(0, 8);
    lights.forEach((l, i) => { this._pointPos.set([...l.position, l.radius], i * 4); this._pointCol.set([...l.color, l.intensity], i * 4); });
    this._pointCount = lights.length;

    // ---- 태양 빛 행렬 (그림자맵 텍셀 단위로 스냅해서 그림자 가장자리 지글거림 방지) ----
    this.sunDir = v3.norm(scene.sun.direction);
    const S2 = st.shadowSize, res = this.shadowTarget.w;
    const lightDir = v3.scale(this.sunDir, -1);
    const lv0 = m4.lookDir([0, 0, 0], lightDir);
    const c = m4.transformPoint(lv0, camera.target);
    const texel = (S2 * 2) / res;
    const cx = Math.round(c[0] / texel) * texel, cy = Math.round(c[1] / texel) * texel;
    // 스냅된 중심을 다시 월드로: lv0의 역회전(전치) 사용
    const right = [lv0[0], lv0[4], lv0[8]], up = [lv0[1], lv0[5], lv0[9]];
    const along = v3.dot(camera.target, this.sunDir);
    const center = v3.add(v3.add(v3.scale(right, cx), v3.scale(up, cy)), v3.scale(this.sunDir, along));
    const lightEye = v3.add(center, v3.scale(this.sunDir, 70));
    const lightView = m4.lookDir(lightEye, lightDir);
    const lightProj = m4.ortho(-S2, S2, -S2, S2, 1, 160);
    this.lightVP = m4.multiply(lightProj, lightView);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);

    // ---- 1. 그림자맵 ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowTarget.fb);
    gl.viewport(0, 0, res, res);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const sp = this.p.shadow.use();
    sp.set('uLightVP', this.lightVP).set('uTime', time);
    for (const m of meshes) {
      if (!m.material.castShadow || m.material.emissive >= 1 || m.material.opacity < 0.5) continue;
      const g = m.geometry.upload(gl);
      const tex = m.material.texture;
      sp.set('uModel', m.world).set('uWind', m.material.wind * st.windStrength)
        .set('uUseTex', tex ? 1 : 0).set('uTex', tex || this.white);
      gl.bindVertexArray(g.vao);
      gl.drawArrays(gl.TRIANGLES, 0, g.count);
      this.stats.drawCalls++;
    }

    const spi = this.p.shadowInst.use();
    spi.set('uLightVP', this.lightVP).set('uTime', time);
    for (const m of instanced) {
      if (!m.material.castShadow || m.material.opacity < 0.5) continue;
      const g = m.upload(gl), tex = m.material.texture;
      spi.set('uModel', m.world).set('uWind', m.material.wind * st.windStrength)
        .set('uUseTex', tex ? 1 : 0).set('uTex', tex || this.white);
      gl.bindVertexArray(g.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, g.count, m.count);
      this.stats.drawCalls++;
    }

    // ---- 2. 장면 (저해상도) ----
    const T = this.targets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);
    gl.viewport(0, 0, lowW, lowH);
    gl.clearBufferfv(gl.COLOR, 0, [...scene.fog.color, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 1, 0]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);

    const prog = this.p.scene.use();
    this._lightUniforms(prog, scene, time);
    prog.set('uView', camera.view).set('uViewProj', camera.viewProj).set('uWind', 0).set('uViewDir', v3.scale(camera.forward, -1));
    for (const m of meshes) {
      const g = m.geometry.upload(gl), mat = m.material;
      prog.set('uModel', m.world)
        .set('uNormalMat', m4.normalMatrix(m.world))
        .set('uMatColor', mat.color)
        .set('uEmissive', mat.emissive)
        .set('uOutline', mat.outline ? 1 : 0)
        .set('uWind', mat.wind * st.windStrength)
        .set('uUseTex', mat.texture ? 1 : 0)
        .set('uTex', mat.texture || this.white)
        .set('uOpacity', mat.opacity ?? 1)
        .set('uRim', mat.rim || 0);
      gl.bindVertexArray(g.vao);
      gl.drawArrays(gl.TRIANGLES, 0, g.count);
      this.stats.drawCalls++;
    }

    // 인스턴스 메시
    if (instanced.length) {
      const ip = this.p.sceneInst.use();
      this._lightUniforms(ip, scene, time);
      ip.set('uView', camera.view).set('uViewProj', camera.viewProj).set('uViewDir', v3.scale(camera.forward, -1));
      for (const m of instanced) {
        const g = m.upload(gl), mat = m.material;
        ip.set('uModel', m.world)
          .set('uMatColor', mat.color).set('uEmissive', mat.emissive).set('uOutline', mat.outline ? 1 : 0)
          .set('uWind', mat.wind * st.windStrength).set('uUseTex', mat.texture ? 1 : 0).set('uTex', mat.texture || this.white)
          .set('uOpacity', mat.opacity ?? 1).set('uRim', mat.rim || 0);
        gl.bindVertexArray(g.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, g.count, m.count);
        this.stats.drawCalls++;
      }
    }

    // 잔디
    if (scene.grass.length) {
      const gp = this.p.grass.use();
      this._lightUniforms(gp, scene, time);
      gp.set('uView', camera.view).set('uViewProj', camera.viewProj)
        .set('uCamRight', camera.right).set('uWindStrength', st.windStrength);
      for (const field of scene.grass) {
        const push = new Float32Array(16);
        field.interactors.slice(0, 4).forEach((it, i) => { push.set([it[0], it[1], it[2], it[3] ?? 0.9], i * 4); });
        gp.set('uPushers', push).set('uWidth', field.width);
        gl.bindVertexArray(field.upload(gl).vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, field.count);
        this.stats.drawCalls++;
      }
    }

    // ---- 3. 물 (장면 색/깊이 복사본을 읽어서 깊이·거품·굴절 계산) ----
    if (scene.water.length) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.scene.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.copy.fb);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.blitFramebuffer(0, 0, lowW, lowH, 0, 0, lowW, lowH, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);

      const wp = this.p.water.use();
      this._lightUniforms(wp, scene, time);
      const sunVis = Math.min(1, scene.sun.intensity * Math.max(0, this.sunDir[1]) * 3);
      wp.set('uView', camera.view).set('uViewProj', camera.viewProj)
        .set('uSceneColor', T.copy.textures[0]).set('uSceneDepth', T.copy.depth)
        .set('uInvRes', [1 / lowW, 1 / lowH]).set('uNear', camera.near).set('uFar', camera.far)
        .set('uViewDir', v3.scale(camera.forward, -1)).set('uSunVis', sunVis);
      for (const w of scene.water) {
        wp.set('uShallow', w.shallow).set('uDeep', w.deep).set('uFoam', w.foam)
          .set('uDepthRange', w.depthRange).set('uWave', w.waveHeight)
          .set('uModel', w.node ? w.node.world : this.identity).set('uRadial', w.radial ? 1 : 0).set('uWaterEmissive', w.emissive || 0);
        const g = w.geometry.upload(gl);
        gl.bindVertexArray(g.vao);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
        this.stats.drawCalls++;
      }
    }

    // ---- 4. 파티클 ----
    if (scene.particles.length) {
      const pp = this.p.particle.use();
      const sun = scene.sun;
      const light = v3.add(v3.scale(v3.add(scene.ambientSky, scene.ambientGround), 0.5), v3.scale(sun.color, sun.intensity * Math.max(0, this.sunDir[1]) * 0.8));
      pp.set('uView', camera.view).set('uViewProj', camera.viewProj).set('uLight', light)
        .set('uFogColor', scene.fog.color).set('uFog', [scene.fog.near, scene.fog.far]);
      for (const ps of scene.particles) {
        const n = ps.upload(gl);
        if (!n) continue;
        pp.set('uModel', ps.node ? ps.node.world : this.identity);
        gl.bindVertexArray(ps._gpu.vao);
        gl.drawArrays(gl.POINTS, 0, n);
        this.stats.drawCalls++;
      }
    }

    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.emptyVAO);
    const fullscreen = () => { gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.drawCalls++; };

    // ---- 5. 블룸 ----
    const bw = T.bloomA.w, bh = T.bloomA.h;
    if (st.bloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.bloomA.fb);
      gl.viewport(0, 0, bw, bh);
      this.p.bloomExtract.use().set('uColor', T.scene.textures[0]).set('uInvRes', [1 / bw, 1 / bh]);
      fullscreen();
      const blur = this.p.blur.use().set('uInvRes', [1 / bw, 1 / bh]);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bloomB.fb);
        blur.set('uImage', T.bloomA.textures[0]).set('uDir', [1, 0]); fullscreen();
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.bloomA.fb);
        blur.set('uImage', T.bloomB.textures[0]).set('uDir', [0, 1]); fullscreen();
      }
    }

    // ---- 6. 합성 (저해상도) ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.final.fb);
    gl.viewport(0, 0, lowW, lowH);
    const pal = st.palette || [];
    const palData = new Float32Array(96);
    pal.slice(0, 32).forEach((c, i) => palData.set(c, i * 3));
    this.p.composite.use()
      .set('uColor', T.scene.textures[0]).set('uNormal', T.scene.textures[1]).set('uDepth', T.scene.depth)
      .set('uBloom', T.bloomA.textures[0])
      .set('uInvRes', [1 / lowW, 1 / lowH]).set('uNear', camera.near).set('uFar', camera.far)
      .set('uOutline', st.outline ? 1 : 0).set('uDepthThresh', st.depthThreshold)
      .set('uOutlineDark', st.outlineDarkness).set('uHighlight', st.highlight)
      .set('uBloomStrength', st.bloom ? st.bloomStrength : 0)
      .set('uSaturation', st.saturation).set('uContrast', st.contrast).set('uVignette', st.vignette)
      .set('uGrade', st.grade)
      .set('uPalette', palData).set('uPaletteSize', Math.min(32, pal.length)).set('uDither', st.dither)
      .set('uStars', scene.stars ? 1 : 0).set('uStarOffset', scene.starOffset).set('uTimeC', time);
    fullscreen();

    // ---- 7. 업스케일 (화면) ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasW, canvasH);
    const offset = [1 + camera.subpixel[0], 1 + camera.subpixel[1]];
    const history = this._prevValid ? st.history : 0;
    this.p.upscale.use()
      .set('uImage', T.final.textures[0]).set('uPrev', T.prev.textures[0])
      .set('uLowSize', [lowW, lowH]).set('uScale', scale)
      .set('uOffset', offset).set('uPrevOffset', this._prevOffset || offset).set('uHistory', history);
    fullscreen();
    gl.bindVertexArray(null);

    // 이번 프레임을 다음 프레임의 "직전 프레임"으로 보관 (사용할 때만)
    if (st.history > 0) {
      [T.final, T.prev] = [T.prev, T.final];
      this._prevOffset = offset;
      this._prevValid = true;
    } else this._prevValid = false;
  }
}
