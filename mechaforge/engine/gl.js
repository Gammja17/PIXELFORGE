// PixelForge — WebGL2 저수준 헬퍼 (셰이더, 텍스처, 프레임버퍼)

export function createProgram(gl, vsSrc, fsSrc, name = 'program') {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`[${name}] 셰이더 컴파일 실패:\n${log}\n${numbered}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${name}] 링크 실패: ${gl.getProgramInfoLog(p)}`);

  // 유니폼 위치를 캐시하고 타입에 맞게 세팅하는 래퍼
  // 샘플러마다 고정된 텍스처 유닛을 배정한다
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  let samplers = 0;
  gl.useProgram(p);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const key = info.name.replace(/\[0\]$/, '');
    const u = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    if (info.type === gl.SAMPLER_2D) { u.unit = samplers++; gl.uniform1i(u.loc, u.unit); }
    uniforms[key] = u;
  }
  return {
    handle: p,
    use() { gl.useProgram(p); return this; },
    has(name) { return !!uniforms[name]; },
    set(name, v) {
      const u = uniforms[name];
      if (!u) return this;
      const L = u.loc;
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(L, v) : gl.uniform1f(L, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(L, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(L, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(L, v); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(L, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(L, false, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(L, false, v); break;
        case gl.SAMPLER_2D:
          gl.activeTexture(gl.TEXTURE0 + u.unit);
          gl.bindTexture(gl.TEXTURE_2D, v);
          break;
        default: throw new Error('지원하지 않는 유니폼 타입: ' + name);
      }
      return this;
    },
  };
}

export function createTexture(gl, w, h, { internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, filter = gl.NEAREST, data = null } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function createDepthTexture(gl, w, h) {
  return createTexture(gl, w, h, { internal: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });
}

// 여러 컬러 어태치먼트(MRT) + 선택적 깊이 텍스처를 갖는 프레임버퍼
export function createTarget(gl, w, h, { colors = 1, depth = false, filter = gl.NEAREST } = {}) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const textures = [];
  const bufs = [];
  for (let i = 0; i < colors; i++) {
    const t = createTexture(gl, w, h, { filter });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    textures.push(t);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  }
  let depthTex = null;
  if (depth) {
    depthTex = createDepthTexture(gl, w, h);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  }
  if (colors > 0) gl.drawBuffers(bufs); else { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('프레임버퍼 생성 실패: 0x' + status.toString(16));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {
    fb, w, h, textures, depth: depthTex,
    dispose() {
      gl.deleteFramebuffer(fb);
      textures.forEach((t) => gl.deleteTexture(t));
      if (depthTex) gl.deleteTexture(depthTex);
    },
  };
}

// 픽셀아트 텍스처: 문자열 배열 + 팔레트로 정의 ('.'는 투명)
//   Texture.fromPixels(gl, ['.aa.', 'abba'], { a: '#ff0000', b: '#ffffff' })
export function textureFromPixels(gl, rows, palette) {
  const h = rows.length, w = rows[0].length;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[h - 1 - y][x]; // GL 텍스처는 아래에서 위로
      const i = (y * w + x) * 4;
      if (ch === '.' || ch === ' ' || !palette[ch]) { data[i + 3] = 0; continue; }
      const n = parseInt(palette[ch].replace('#', ''), 16);
      data[i] = (n >> 16) & 255; data[i + 1] = (n >> 8) & 255; data[i + 2] = n & 255; data[i + 3] = 255;
    }
  }
  const t = createTexture(gl, w, h, { data });
  t.width = w; t.height = h;
  return t;
}
