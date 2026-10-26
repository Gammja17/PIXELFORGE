// PixelForge — GLSL 셰이더 모음
// 렌더 순서:  그림자맵 → 장면(저해상도, MRT: 색+법선+깊이) → 물 → 블룸 → 합성(외곽선/색보정/팔레트) → 업스케일

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

// ---------- 공통 조명 ----------
const LIGHTING = `
uniform sampler2D uShadowMap;
uniform mat4 uLightVP;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform float uShadowBias;
uniform float uTime;
uniform float uClouds;
#define MAX_POINT 8
uniform vec4 uPointPos[MAX_POINT];   // xyz 위치, w 반경
uniform vec4 uPointCol[MAX_POINT];   // rgb 색, a 세기
uniform int uPointCount;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}

float shadowAt(vec3 world, float ndl){
  vec4 lp = uLightVP * vec4(world, 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = uShadowBias * (1.0 + 3.0 * (1.0 - clamp(ndl, 0.0, 1.0)));
  return p.z - bias > texture(uShadowMap, p.xy).r ? 0.0 : 1.0;
}

// 구름 그림자: 땅 위를 천천히 흘러가는 큰 얼룩
float cloudShadow(vec3 world){
  if (uClouds < 0.5) return 1.0;
  vec2 q = world.xz * 0.06 + vec2(uTime * 0.025, uTime * 0.012);
  float n = vnoise(q) * 0.65 + vnoise(q * 2.3 + 7.0) * 0.35;
  return n > 0.58 ? 0.3 : 1.0;
}

// 툰 램프: 빛의 양을 3단계로 끊어서 "손으로 칠한" 명암을 만든다
float toonRamp(float l){ return l > 0.5 ? 1.0 : (l > 0.14 ? 0.6 : 0.0); }

// 점광원 (가로등, 마법 폭발 등) — 거리 감쇠도 3단계로 끊어서 픽셀아트스러운 동심원 빛
vec3 pointLights(vec3 n, vec3 world){
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_POINT; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointPos[i].xyz - world;
    float d = length(L);
    float att = clamp(1.0 - d / uPointPos[i].w, 0.0, 1.0);
    att *= att;
    float ndl = max(dot(n, L / max(d, 1e-4)), 0.0) * 0.7 + 0.3;
    float a = att * ndl;
    a = a > 0.45 ? 1.0 : (a > 0.18 ? 0.55 : (a > 0.04 ? 0.22 : 0.0));
    sum += uPointCol[i].rgb * uPointCol[i].a * a;
  }
  return sum;
}

vec3 shade(vec3 base, vec3 n, vec3 world){
  float ndl = dot(n, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(world, ndl) * cloudShadow(world) : 0.0;
  float r = toonRamp(max(ndl, 0.0) * sh);
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  return base * (amb + uSunColor * r + pointLights(n, world));
}

// 스크린도어 투명도용 4x4 베이어 임계값
float bayerL(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}

vec3 applyFog(vec3 c, float depth){ return mix(c, uFogColor, smoothstep(uFog.x, uFog.y, depth)); }

vec4 encodeNormal(vec3 worldN, mat4 view, float outline){
  return vec4(normalize(mat3(view) * worldN) * 0.5 + 0.5, outline);
}
`;

// ---------- 일반 메시 ----------
const SCENE_VS = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec2 aUV;
#ifdef INSTANCED
layout(location=4) in mat4 aInst;      // 인스턴스 변환 (4~7)
layout(location=8) in vec4 aInstColor; // rgb 색, a 발광
#endif
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uViewProj;
uniform mat3 uNormalMat;
uniform float uTime;
uniform float uWind;
uniform float uEmissive;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUV;
out float vDepth;
out float vEmis;
void main(){
#ifdef INSTANCED
  mat4 M = uModel * aInst;
  vec4 w = M * vec4(aPos, 1.0);
  vNormal = normalize(mat3(M) * aNormal);
  vColor = aColor * aInstColor.rgb;
  vEmis = max(uEmissive, aInstColor.a);
  vec3 up = normalize(mat3(M) * vec3(0.0, 1.0, 0.0));
#else
  vec4 w = uModel * vec4(aPos, 1.0);
  vNormal = normalize(uNormalMat * aNormal);
  vColor = aColor;
  vEmis = uEmissive;
  vec3 up = vec3(0.0, 1.0, 0.0);
#endif
  if (uWind > 0.0) {
    float h = max(aPos.y, 0.0);
    vec3 side = normalize(cross(up, vec3(0.3, 0.1, 0.9)) + 1e-4);
    w.xyz += side * sin(uTime * 1.7 + w.x * 0.5 + w.z * 0.3) * uWind * h;
  }
  vWorld = w.xyz;
  vUV = aUV;
  vDepth = -(uView * w).z;
  gl_Position = uViewProj * w;
}`;
export const sceneVS = HEADER + SCENE_VS;
export const sceneInstVS = HEADER + '#define INSTANCED\n' + SCENE_VS;

export const sceneFS = HEADER + LIGHTING + `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUV;
in float vDepth;
in float vEmis;
uniform mat4 uView;
uniform vec3 uMatColor;
uniform float uOutline;
uniform float uRim;       // 1이면 대기 껍질: 가장자리만 디더링으로 보임
uniform vec3 uViewDir;
uniform float uUseTex;
uniform sampler2D uTex;
uniform float uOpacity;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oNormal;
void main(){
  if (uOpacity < 1.0 && uOpacity < bayerL(gl_FragCoord.xy)) discard; // 디더링 투명
  vec3 base = uMatColor * vColor;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  if (uRim > 0.0) {
    float edge = 1.0 - abs(dot(n, uViewDir));
    float a = pow(edge, 4.5) * 1.8 * uRim;
    if (a < bayerL(gl_FragCoord.xy)) discard;
    float day = clamp(dot(n, uSunDir) * 1.4 + 0.35, 0.08, 1.0);
    oColor = vec4(base * day, 0.25 * day);
    oNormal = encodeNormal(n, uView, 0.0);
    return;
  }
  if (uUseTex > 0.5) {
    vec4 t = texture(uTex, vUV);
    if (t.a < 0.5) discard;
    base *= t.rgb;
    n = normalize(vec3(0.0, 1.0, 0.0) + n * 0.6); // 스프라이트는 위쪽을 보는 것처럼 조명
  }
  vec3 lit = shade(base, n, vWorld);
  lit = mix(lit, base * 1.15, vEmis);
  oColor = vec4(applyFog(lit, vDepth), vEmis);
  oNormal = encodeNormal(n, uView, uOutline);
}`;

// ---------- 그림자맵 (깊이만) ----------
const SHADOW_VS = `
layout(location=0) in vec3 aPos;
layout(location=3) in vec2 aUV;
#ifdef INSTANCED
layout(location=4) in mat4 aInst;
#endif
uniform mat4 uModel;
uniform mat4 uLightVP;
uniform float uTime;
uniform float uWind;
out vec2 vUV;
void main(){
#ifdef INSTANCED
  vec4 w = uModel * aInst * vec4(aPos, 1.0);
#else
  vec4 w = uModel * vec4(aPos, 1.0);
#endif
  if (uWind > 0.0) {
    float h = max(aPos.y, 0.0);
    w.x += sin(uTime * 1.7 + w.x * 0.5 + w.z * 0.3) * uWind * h;
  }
  vUV = aUV;
  gl_Position = uLightVP * w;
}`;
export const shadowVS = HEADER + SHADOW_VS;
export const shadowInstVS = HEADER + '#define INSTANCED\n' + SHADOW_VS;

export const shadowFS = HEADER + `
in vec2 vUV;
uniform float uUseTex;
uniform sampler2D uTex;
void main(){
  if (uUseTex > 0.5 && texture(uTex, vUV).a < 0.5) discard;
}`;

// ---------- 잔디 (인스턴싱) ----------
export const grassVS = HEADER + `
layout(location=0) in vec3 aBlade;
layout(location=4) in vec3 aOffset;
layout(location=5) in vec3 aColor;
layout(location=6) in vec2 aParams; // 높이, 위상
uniform mat4 uView;
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform float uTime;
uniform float uWidth;
uniform float uWindStrength;
uniform vec4 uPushers[4]; // xyz 위치, w 반경
out vec3 vColor;
out vec3 vWorld;
out float vDepth;
void main(){
  float h = aParams.x;
  float t = aBlade.y;
  vec3 p = aOffset + uCamRight * aBlade.x * uWidth;
  // 바람: 들판을 가로질러 지나가는 큰 물결 + 잎마다의 작은 떨림
  float gust = sin(uTime * 1.3 + aOffset.x * 0.35 + aOffset.z * 0.22) * 0.5 + 0.5;
  vec2 bend = vec2(sin(uTime * 2.1 + aParams.y), cos(uTime * 1.7 + aParams.y)) * 0.08;
  bend += vec2(0.3, 0.12) * gust * uWindStrength;
  // 플레이어 근처의 잎은 밀려서 눕는다
  for (int i = 0; i < 4; i++) {
    if (uPushers[i].w > 0.0) {
      vec3 d = aOffset - uPushers[i].xyz;
      float dist = length(d.xz);
      float k = (1.0 - smoothstep(0.0, uPushers[i].w, dist)) * step(abs(d.y), 1.5);
      bend += normalize(d.xz + 1e-4) * k * 1.1;
    }
  }
  p.xz += bend * t * h;
  p.y += t * h * (1.0 - 0.4 * clamp(length(bend), 0.0, 1.0));
  vWorld = p;
  vColor = aColor * mix(0.8, 1.15, t);
  vDepth = -(uView * vec4(p, 1.0)).z;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

export const grassFS = HEADER + LIGHTING + `
in vec3 vColor;
in vec3 vWorld;
in float vDepth;
uniform mat4 uView;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oNormal;
void main(){
  vec3 n = vec3(0.0, 1.0, 0.0);
  oColor = vec4(applyFog(shade(vColor, n, vWorld), vDepth), 0.0);
  oNormal = encodeNormal(n, uView, 0.0);
}`;

// ---------- 물 ----------
export const waterVS = HEADER + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uViewProj;
uniform float uTime;
uniform float uWave;
uniform float uRadial;   // 1이면 구형 바다 (원점 기준 바깥쪽으로 물결)
out vec3 vWorld;
out vec3 vNormal;
out float vDepth;
void main(){
  vec3 p = aPos;
  float w = sin(p.x * 0.6 + uTime * 1.2) * cos(p.z * 0.5 + uTime * 0.9) + 0.5 * sin((p.x + p.y + p.z) * 1.1 - uTime * 1.6);
  vec3 up = uRadial > 0.5 ? normalize(aPos) : vec3(0.0, 1.0, 0.0);
  p += up * w * uWave;
  vec4 wp = uModel * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(uModel) * (uRadial > 0.5 ? aNormal : vec3(0.0, 1.0, 0.0)));
  vDepth = -(uView * wp).z;
  gl_Position = uViewProj * wp;
}`;

export const waterFS = HEADER + LIGHTING + `
in vec3 vWorld;
in vec3 vNormal;
in float vDepth;
uniform mat4 uView;
uniform vec3 uViewDir;
uniform float uWaterEmissive;
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uInvRes;
uniform float uNear;
uniform float uFar;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform float uDepthRange;
uniform float uSunVis;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oNormal;
float linD(vec2 uv){ return uNear + texture(uSceneDepth, uv).r * (uFar - uNear); }
void main(){
  vec2 suv = gl_FragCoord.xy * uInvRes;
  vec3 N = normalize(vNormal);
  float thick = (linD(suv) - vDepth) * abs(dot(N, uViewDir));

  // 물속 굴절: 살짝 일렁이게 (물보다 앞에 있는 물체는 샘플하지 않음)
  vec2 wob = vec2(sin(vWorld.z * 2.0 + uTime * 2.0), cos(vWorld.x * 2.0 + uTime * 1.7)) * uInvRes * 1.5;
  vec2 ruv = linD(suv + wob) > vDepth ? suv + wob : suv;
  vec3 under = texture(uSceneColor, ruv).rgb;

  // 깊이를 4단계로 끊어서 툰 스타일 그라데이션
  float k = clamp(thick / uDepthRange, 0.0, 1.0);
  k = floor(k * 4.0 + 0.5) / 4.0;
  vec3 water = mix(uShallow, uDeep, k);
  vec3 col = mix(under * mix(vec3(1.0), uShallow, 0.6), water, clamp(0.35 + k * 0.9, 0.0, 1.0));

  float ndl = dot(N, uSunDir);
  float sh = ndl > 0.0 ? shadowAt(vWorld, 1.0) * cloudShadow(vWorld) : 0.0;
  float sunVis = clamp(uSunVis, 0.0, 1.0) * (ndl > 0.1 ? 1.0 : (ndl > -0.05 ? 0.5 : 0.0));
  col *= mix(0.7, 1.0, sh);
  col *= mix(uSkyAmb * 1.1, vec3(1.0), sunVis);
  col += uShallow * pointLights(N, vWorld) * 0.8;

  // 반짝임
  float s = sin(vWorld.x * 5.3 + uTime * 1.5) * sin(vWorld.z * 4.7 - uTime * 1.2) * sin((vWorld.x - vWorld.z) * 2.9 + uTime * 0.8);
  float sparkle = step(0.8, s) * sh * sunVis;

  // 물가 거품: 얕은 곳 + 바깥쪽 물결선
  float wave = 0.12 * sin(uTime * 2.0 + vWorld.x * 3.0 + vWorld.z * 2.0);
  float foam = step(thick, 0.22 + wave);
  float ring = 0.62 + 0.18 * sin(uTime * 0.9 + vWorld.x * 0.7 + vWorld.z * 0.5);
  foam = max(foam, step(abs(thick - ring), 0.035) * 0.8);
  col = mix(col, uFoam * mix(0.7, 1.0, max(sh, uWaterEmissive)), max(foam, sparkle));
  // 용암처럼 스스로 빛나는 액체
  float glow = uWaterEmissive * (0.55 + 0.45 * k);
  col = mix(col, mix(uShallow, uFoam, foam) * 1.1, uWaterEmissive);

  oColor = vec4(applyFog(col, vDepth), max(sparkle * 0.8, glow * 0.6));
  oNormal = encodeNormal(N, uView, 0.0);
}`;

// ---------- 파티클 ----------
const BAYER = `
float bayer4(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}`;

export const particleVS = HEADER + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;   // rgb, emissive
layout(location=2) in vec2 aAlphaSize;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uViewProj;
out vec4 vColor;
out float vAlpha;
out float vDepth;
flat out float vSize;
void main(){
  vColor = aColor;
  vAlpha = aAlphaSize.x;
  vec4 w = uModel * vec4(aPos, 1.0);
  vDepth = -(uView * w).z;
  gl_Position = uViewProj * w;
  gl_PointSize = max(1.0, floor(aAlphaSize.y + 0.5));
  vSize = gl_PointSize;
}`;

export const particleFS = HEADER + BAYER + `
in vec4 vColor;
in float vAlpha;
in float vDepth;
flat in float vSize;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec2 uFog;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oNormal;
void main(){
  if (vAlpha < bayer4(gl_FragCoord.xy)) discard;
  if (vSize >= 3.0) { vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.2) discard; }
  vec3 col = mix(vColor.rgb * uLight, vColor.rgb * 1.2, vColor.a);
  col = mix(col, uFogColor, smoothstep(uFog.x, uFog.y, vDepth));
  oColor = vec4(col, vColor.a);
  oNormal = vec4(0.5, 0.5, 1.0, 0.0);
}`;

// ---------- 후처리 공통 ----------
export const fullscreenVS = HEADER + `
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main(){ gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

// 발광 성분 추출 (색 * 알파채널=발광량)
export const bloomExtractFS = HEADER + `
uniform sampler2D uColor;
uniform vec2 uInvRes;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy * uInvRes;
  vec4 c = texture(uColor, uv);
  o = vec4(c.rgb * c.a, 1.0);
}`;

export const blurFS = HEADER + `
uniform sampler2D uImage;
uniform vec2 uInvRes;
uniform vec2 uDir;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy * uInvRes;
  const float w[5] = float[5](0.227, 0.194, 0.122, 0.054, 0.016);
  vec3 s = texture(uImage, uv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o2 = uDir * uInvRes * float(i) * 1.5;
    s += (texture(uImage, uv + o2).rgb + texture(uImage, uv - o2).rgb) * w[i];
  }
  o = vec4(s, 1.0);
}`;

// 합성: 외곽선 + 하이라이트 + 블룸 + 색보정 + 팔레트/디더링
export const compositeFS = HEADER + BAYER + `
uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform sampler2D uDepth;
uniform sampler2D uBloom;
uniform vec2 uInvRes;
uniform float uNear;
uniform float uFar;
uniform float uOutline;
uniform float uDepthThresh;
uniform float uOutlineDark;
uniform float uHighlight;
uniform float uBloomStrength;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform vec3 uGrade;
uniform vec3 uPalette[32];
uniform int uPaletteSize;
uniform float uDither;
uniform float uStars;      // 1이면 배경(깊이 최대)에 별
uniform vec2 uStarOffset;  // 별 스크롤 (저해상도 픽셀)
uniform float uTimeC;
out vec4 o;

float hashS(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float linD(vec2 uv){ return uNear + texture(uDepth, uv).r * (uFar - uNear); }

void main(){
  vec2 uv = gl_FragCoord.xy * uInvRes;
  vec3 col = texture(uColor, uv).rgb;
  vec4 nm = texture(uNormal, uv);

  if (uOutline > 0.5 && nm.a > 0.5) {
    float d = linD(uv);
    vec3 n = nm.xyz * 2.0 - 1.0;
    float dEdge = 0.0, nEdge = 0.0;
    vec2 offs[4] = vec2[4](vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1));
    for (int i = 0; i < 4; i++) {
      vec2 u2 = uv + offs[i] * uInvRes;
      float dd = linD(u2) - d;
      vec4 nm2 = texture(uNormal, u2);
      vec3 n2 = nm2.xyz * 2.0 - 1.0;
      // 1) 깊이 경계: 이웃이 훨씬 뒤에 있으면 나는 물체의 실루엣 → 어둡게
      dEdge = max(dEdge, step(uDepthThresh, dd));
      // 2) 법선 경계: 볼록한 모서리 한쪽에만 1픽셀 하이라이트 (이웃이 앞에 있으면 무시)
      float side = smoothstep(-0.01, 0.01, dot(n - n2, vec3(1.0)));
      nEdge += (1.0 - dot(n, n2)) * side * step(-0.1, dd) * nm2.a;
    }
    if (dEdge > 0.0) col *= uOutlineDark;
    else col *= 1.0 + uHighlight * step(0.32, nEdge);
  }

  if (uStars > 0.5 && texture(uDepth, uv).r >= 0.99999) {
    vec2 sp = floor(gl_FragCoord.xy + uStarOffset);
    float h = hashS(sp);
    if (h > 0.9965) {
      float tw = 0.6 + 0.4 * sin(uTimeC * (2.0 + h * 40.0) + h * 100.0);
      col += vec3(0.85, 0.9, 1.0) * tw * (h > 0.9992 ? 1.0 : 0.55);
    }
    // 은하수 같은 흐릿한 띠
    float band = exp(-pow((sp.y - sp.x * 0.35 - 40.0) / 70.0, 2.0)) * (0.5 + 0.5 * hashS(floor(sp / 3.0)));
    col += vec3(0.16, 0.12, 0.28) * band * 0.35;
  }
  col += texture(uBloom, uv).rgb * uBloomStrength;

  // 색보정
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uGrade;
  vec2 q = uv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 1.6;
  col = clamp(col, 0.0, 1.0);

  // 제한 팔레트 + 베이어 디더링
  if (uPaletteSize > 0) {
    col += (bayer4(gl_FragCoord.xy) - 0.5) * uDither;
    float best = 1e9; vec3 pick = col;
    for (int i = 0; i < 32; i++) {
      if (i >= uPaletteSize) break;
      vec3 d = uPalette[i] - col;
      float e = dot(d * d, vec3(0.3, 0.59, 0.11));
      if (e < best) { best = e; pick = uPalette[i]; }
    }
    col = pick;
  } else if (uDither > 0.0) {
    // 팔레트 없이 디더링만: 채널당 24단계 양자화
    col = floor(col * 24.0 + bayer4(gl_FragCoord.xy)) / 24.0;
  }
  o = vec4(col, 1.0);
}`;

// 최종 업스케일: 저해상도 이미지를 정수 배율 + 서브픽셀 오프셋으로 화면에 그린다
export const upscaleFS = HEADER + `
uniform sampler2D uImage;
uniform sampler2D uPrev;     // 직전 프레임 (회전 중 깜빡임 완화용)
uniform vec2 uLowSize;
uniform float uScale;
uniform vec2 uOffset;        // 여백 + 서브픽셀
uniform vec2 uPrevOffset;
uniform float uHistory;      // 0이면 끔
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy / uScale;
  vec4 c = texture(uImage, (p + uOffset) / uLowSize);
  if (uHistory > 0.0) c = mix(c, texture(uPrev, (p + uPrevOffset) / uLowSize), uHistory);
  o = c;
}`;
