# PixelForge

로우폴리 3D 장면을 "픽셀 카메라로 찍은 것처럼" 렌더하는 WebGL2 게임 엔진입니다.
외부 라이브러리 없이 순수 JavaScript + GLSL로만 되어 있어요.

## 바로 실행하기

- `dist/island.html` 을 더블클릭하면 데모가 열립니다. (인터넷 없어도 됨). 웹에서 바로 하려면 https://gammja17.github.io/PIXELFORGE/
- 코드를 고치면서 보려면:
  ```bash
  npm run dev      # http://localhost:3000/island-dev.html 열기 (ES 모듈 그대로 로드)
  npm run build    # dist/ 에 한 파일짜리 HTML 다시 만들기
  ```

조작: WASD 이동 · Space 점프 · 마우스 드래그/Q·E 카메라 회전 · 휠 줌
모바일: 왼쪽 드래그 이동 · 오른쪽 드래그 회전 · 두 손가락 줌

## 폴더 구조

```
engine/
  engine.js     캔버스, 게임 루프, 스프라이트 편의 함수
  renderer.js   ★ 픽셀 렌더 파이프라인 전체
  shaders.js    ★ 모든 GLSL (툰 셰이딩, 외곽선, 물, 잔디, 팔레트…)
  camera.js     ★ 픽셀 스냅 + 서브픽셀 보정 직교 카메라
  scene.js      Node / Mesh / Sprite / Material / Scene
  geometry.js   로우폴리 도형 빌더 (상자, 원기둥, 울퉁불퉁 구, 격자 지형…)
  foliage.js    인스턴싱 잔디, 툰 물
  particles.js  픽셀 파티클 (디더링 페이드)
  input.js      키보드/마우스/터치 조이스틱
  palettes.js   제한 팔레트
  gl.js, math.js
demo/
  main.js       데모 게임 "작은 섬" (지형, 나무, 집, 캐릭터, 낮/밤)
  ui.js, page.html
```

## 파이프라인 (renderer.js)

1. **그림자맵** – 태양 방향 직교 투영. 텍셀 단위로 스냅해서 그림자 경계가 떨리지 않음
2. **장면 렌더 (저해상도)** – 화면 크기 ÷ 픽셀크기 해상도로 그린다. MRT로 `색 + 법선 + 깊이`를 동시에 기록
   - 툰 램프 3단계 조명, 반구 환경광, 구름 그림자, 바람에 흔들리는 나뭇잎
   - 색 버퍼의 알파 채널 = 발광량 (블룸에 사용)
3. **물** – 장면 깊이를 복사해 읽어서 얕은/깊은 색, 물가 거품, 굴절, 반짝임
4. **파티클** – GL_POINTS. 크기가 픽셀 단위라 항상 또렷함. 투명도는 베이어 디더링
5. **블룸** – 발광 성분만 뽑아서 흐림
6. **합성** – 깊이 경계는 어두운 외곽선, 법선 경계는 1픽셀 하이라이트, 색보정, 팔레트+디더링
7. **업스케일** – 정수 배율 최근접 확대 + 카메라 서브픽셀 오프셋 → 픽셀은 고정, 스크롤은 부드럽게

## 최소 예제

```js
import { Engine, Mesh, Geometry } from './engine/index.js';

const engine = new Engine(document.querySelector('canvas'), { pixelSize: 3 });
const { scene, camera } = engine;

const ground = scene.add(new Mesh(Geometry.box(20, 0.5, 20), { color: '#6aa84f' }));
ground.position[1] = -0.5;
const rock = scene.add(new Mesh(Geometry.icosphere(1, 1, [1, 1, 1], { jitter: 0.2 }), { color: '#9a9aa6' }));

// 2D 도트 스프라이트 ('.'은 투명)
const flower = engine.sprite(['.p.', 'pyp', '.g.', '.g.'], { p: '#f28ab2', y: '#ffe066', g: '#3f8a3a' });
flower.position = [2, 0, 1];
scene.add(flower);

engine.onUpdate = (dt, t) => {
  rock.rotation[1] = t;
  camera.target = [0, 0, 0];
};
engine.start();
```

## 튜닝 포인트 (`engine.renderer.settings`)

| 이름 | 기본값 | 효과 |
|---|---|---|
| `outline` | true | 외곽선 + 모서리 하이라이트 |
| `depthThreshold` | 0.45 | 외곽선이 생기는 깊이 차 (월드 단위) |
| `outlineDarkness` | 0.5 | 외곽선 밝기 배율 |
| `highlight` | 0.28 | 볼록 모서리 하이라이트 세기 |
| `bloom`, `bloomStrength` | true, 1.3 | 발광 번짐 |
| `palette` | null | `PALETTES.meadow` 등 최대 32색 |
| `dither` | 0 | 0.05~0.12 추천 |
| `clouds` | true | 흘러가는 구름 그림자 |
| `shadowSize` | 22 | 그림자맵이 덮는 반경 |

그 외: `engine.pixelSize` (도트 크기), `camera.viewHeight` (줌), `camera.yaw/pitch`.
`Material`의 `emissive`(발광), `wind`(흔들림), `outline`(외곽선 대상), `castShadow`.

## 다음에 해볼 만한 것

- glTF/OBJ 모델 로더 (Blender 로우폴리 모델 가져오기)
- 스프라이트 시트 애니메이션 클래스
- 포인트 라이트 (가로등이 주변을 실제로 비추게)
- 간단한 물리/충돌 (지금은 데모에 원형 충돌만 있음)
- 오디오, 씬 저장/불러오기, 에디터
