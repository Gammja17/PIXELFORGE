// 빌드 (의존성 없음): ES 모듈을 한 파일로 묶는다.
//   dist/mecha.html           — 더블클릭으로 열리는 단일 HTML
//   dist/mecha.artifact.html  — claude.ai 아티팩트용 (문서 껍데기 없음: <title>, <style>, 마크업, <script>)
//   index.html                — 로컬 개발용 (모듈 그대로 로드)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

function bundle(entry) {
  const mods = new Map(), order = [];
  function load(path) {
    path = normalize(path);
    if (mods.has(path)) return;
    mods.set(path, null);
    let src = readFileSync(path, 'utf8');
    const deps = [], exportsList = [];
    const rel = (p) => normalize(join(dirname(path), p));
    const key = (p) => JSON.stringify(rel(p));
    src = src.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';/gm, (_, n, p) => { deps.push(rel(p)); return `const ${n} = __m[${key(p)}];`; });
    src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm, (_, names, p) => { deps.push(rel(p)); return `const {${names.replace(/(\w+)\s+as\s+(\w+)/g, '$1: $2')}} = __m[${key(p)}];`; });
    src = src.replace(/^export\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm, (_, names, p) => {
      deps.push(rel(p));
      names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exportsList.push(`${n}: __m[${key(p)}].${n}`));
      return '';
    });
    src = src.replace(/^export\s*\*\s*from\s*'([^']+)';/gm, (_, p) => { deps.push(rel(p)); exportsList.push(`...__m[${key(p)}]`); return ''; });
    src = src.replace(/^export\s+(const|let|class|function)\s+(\w+)/gm, (_, kw, n) => { exportsList.push(n); return `${kw} ${n}`; });
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${path}: 번들러가 처리하지 못한 import/export 구문이 있습니다`);
    deps.forEach(load);
    order.push(path);
    mods.set(path, `__m[${JSON.stringify(path)}] = (() => {\n${src}\nreturn { ${exportsList.join(', ')} };\n})();\n`);
  }
  load(entry);
  return `(() => {\n'use strict';\nconst __m = {};\n${order.map((p) => mods.get(p)).join('\n')}})();\n`.replace(/<\/script/g, '<\\/script');
}

function emit({ entry, page, out, dev }) {
  const html = readFileSync(page, 'utf8');
  const js = bundle(entry);
  const head = html.match(/^[\s\S]*?<\/style>/)[0];
  const body = html.slice(head.length);
  const doc = (script) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="메카를 조립해 떼거리를 쓸어버리는 도트 로그라이트. 방마다 보상을 고르고, 적 정예의 부품을 뜯어 내 기체에 단다.">
<meta name="theme-color" content="#0b0b12">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' shape-rendering='crispEdges'%3E%3Crect width='10' height='10' fill='%230b0b12'/%3E%3Crect x='2' y='2' width='6' height='5' fill='%23e8e4f0'/%3E%3Crect x='3' y='4' width='4' height='1' fill='%2338e0ff'/%3E%3Crect x='4' y='0' width='2' height='2' fill='%23ffb21e'/%3E%3Crect x='1' y='7' width='8' height='2' fill='%235a8dff'/%3E%3C/svg%3E">
${head}
</head>
<body>
${body}
${script}
</body>
</html>
`;
  writeFileSync(`dist/${out}.html`, doc(`<script>\n${js}</script>`));
  writeFileSync(`dist/${out}.artifact.html`, `${html}\n<script>\n${js}</script>\n`);
  writeFileSync(dev, doc(`<script type="module" src="./${entry}"></script>`));
  console.log(`${out}: ${(js.length / 1024).toFixed(1)}KB`);
}

mkdirSync('dist', { recursive: true });
emit({ entry: 'game/ui.js', page: 'game/page.html', out: 'mecha', dev: 'index.html' });
