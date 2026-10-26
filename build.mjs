// 빌드 (의존성 없음): ES 모듈을 한 파일로 묶는다.
//   dist/island.html, dist/worlds.html      — 더블클릭으로 열리는 단일 HTML
//   dist/island.artifact.html 등            — claude.ai 아티팩트용 (문서 껍데기 없음)
//   island-dev.html, worlds.html                 — 로컬 개발용 (모듈 그대로 로드, `npm run dev`)
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
emit({ entry: 'demo/ui.js', page: 'demo/page.html', out: 'island', dev: 'island-dev.html' });
emit({ entry: 'demo-planet/ui.js', page: 'demo-planet/page.html', out: 'worlds', dev: 'worlds.html' });
