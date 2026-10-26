// assets/sfx, assets/music 의 mp3 를 base64 로 묶어 game/audio-data.js 생성 (단일 HTML 에 포함되도록)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const pack = (dir) => Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort().map((f) => [f.replace('.mp3', ''), readFileSync(`${dir}/${f}`).toString('base64')]));
const sfx = pack('assets/sfx'), music = pack('assets/music');
writeFileSync('game/audio-data.js', `// 자동 생성 (tools/pack-audio.mjs). 출처: assets/CREDITS.md (모두 CC0)\nexport const SFX = ${JSON.stringify(sfx)};\nexport const MUSIC = ${JSON.stringify(music)};\n`);
console.log('audio-data.js', Object.keys(sfx).length, 'sfx', Object.keys(music).length, 'music');
