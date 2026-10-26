// PixelForge Worlds — 생활 시뮬레이션
//
// 사람 하나하나가 이름·성별·나이·외모·직업·가족을 갖고 하루를 산다.
//   낮: 나무 베기 → 통나무 나르기, 돌 캐기, 밭 갈기 → 씨 뿌리기 → 물 주기 → 수확,
//       물 길어 오기, 사냥, 양 치기, 집·우물·우리 짓기
//   밤: 집에 들어가 잠 (창문에 불이 켜짐), 부부는 아이를 가짐
//   아기는 엄마 품에 안겨 다니고, 아이는 집 근처에서 놀다가 어른이 되면 일을 시작
//   늙으면 불가에서 쉬다가 죽고, 마을 밖에 무덤이 생김
// 마을 창고(통나무 더미·돌 더미·식량 자루·물통)는 실제 양만큼 눈에 보인다.

import { Geometry, InstancedMesh, Material, v3, m4, clamp, lerp, smoothstep, basisMatrix, rng } from '../engine/index.js';

export const DAY = 80;             // 하루(=1년) 길이, 시뮬레이션 초
const WALK = 0.28, RUN = 0.5;      // 사람 걷기/달리기 속도 (월드 단위/초)
const CAP = { human: 700, sheep: 360, wolf: 90 };

const SYL = ['아', '라', '미', '도', '하', '준', '서', '윤', '지', '호', '린', '수', '연', '민', '태', '은', '솔', '결', '별', '나', '루', '온', '새', '빛', '다', '로', '시', '우', '진', '해'];
const SKIN = [[0.98, 0.84, 0.7], [0.93, 0.76, 0.6], [0.8, 0.6, 0.44], [0.62, 0.44, 0.3], [0.45, 0.31, 0.22]];
const HAIR = [[0.12, 0.1, 0.1], [0.3, 0.2, 0.13], [0.55, 0.35, 0.18], [0.85, 0.7, 0.38], [0.7, 0.28, 0.15]];
const PANTS = [[0.32, 0.3, 0.42], [0.42, 0.33, 0.25], [0.25, 0.32, 0.3], [0.5, 0.45, 0.38]];

// 문명 시대: 기술 점수가 쌓이면 다음 시대로 (옷·도구·집 모양이 바뀜)
export const ERAS = [
  { name: '석기 시대', tech: 0, tool: [0.55, 0.5, 0.45], yield: 1 },
  { name: '청동기 시대', tech: 50, tool: [0.85, 0.55, 0.25], yield: 1.15 },
  { name: '철기 시대', tech: 140, tool: [0.62, 0.64, 0.7], yield: 1.3 },
  { name: '중세', tech: 300, tool: [0.86, 0.88, 0.94], yield: 1.5 },
  { name: '산업 시대', tech: 520, tool: [0.32, 0.32, 0.36], yield: 1.9 },
  { name: '우주 시대', tech: 820, tool: [0.4, 0.95, 1], yield: 2.4 },
];
const VSYL = ['한', '솔', '바', '람', '누', '리', '가', '온', '새', '터', '하', '늘', '푸', '른', '달', '빛', '물', '골', '들', '숲', '노', '을', '비', '단'];

export const JOB_NAMES = {
  wood: '나무꾼', stone: '석공', farm: '농부', water: '물지기', hunt: '사냥꾼', herd: '양치기', build: '목수', warrior: '전사', elder: '어르신', child: '아이', baby: '아기', none: '떠돌이',
};

// 받침에 맞는 조사 (이/가, 을/를, 은/는)
export function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + b;
  return word + ((c - 0xac00) % 28 ? a : b);
}

export function createLife(ctx) {
  const { R, globe, fx, env, cellInfo, elevation, disp, surfaceR, tangentFrame, rotateAround, trees, markTrees, say } = ctx;
  const Rn = rng(12345);
  const rand = () => Rn();
  const pick = (a) => a[Math.floor(rand() * a.length)];

  // ------------------------------------------------------------------
  // 좌표 도우미 (모든 위치는 행성 중심 기준 단위 방향 벡터 d)
  // ------------------------------------------------------------------
  const distU = (a, b) => v3.len(v3.sub(a, b)) * R;
  const offsetDir = (d, x, y) => { const f = tangentFrame(d); return v3.norm(v3.add(d, v3.add(v3.scale(f.e, x / R), v3.scale(f.u, y / R)))); };
  const jitterDir = (d, r) => offsetDir(d, (rand() - 0.5) * 2 * r, (rand() - 0.5) * 2 * r);
  const surf = (d, lift = 0) => v3.scale(d, surfaceR(d) + lift);
  const srOf = (d) => R + disp(elevation(d));
  const isWater = (d) => env.liquid !== 'none' && !(env.liquid === 'water' && env.temp <= -30) && elevation(d) < 0.02;
  let sunDir = [1, 0, 0];
  const isNight = (d) => v3.dot(d, sunDir) < -0.12;

  // 방향 벡터 공간 해시 (가까운 것 찾기)
  class DirHash {
    constructor(cell) { this.G = Math.ceil(2 * R / cell); this.map = new Map(); }
    key(d) { const G = this.G; return (Math.floor((d[0] + 1) * G / 2) * 512 + Math.floor((d[1] + 1) * G / 2)) * 512 + Math.floor((d[2] + 1) * G / 2); }
    rebuild(list, ok = () => true) { this.map.clear(); for (const o of list) if (ok(o)) { const k = this.key(o.d); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(o); } }
    query(d, radius, filter) {
      const G = this.G, r = radius / R, out = [];
      const lo = (x) => Math.floor((x - r + 1) * G / 2), hi = (x) => Math.floor((x + r + 1) * G / 2);
      for (let x = lo(d[0]); x <= hi(d[0]); x++) for (let y = lo(d[1]); y <= hi(d[1]); y++) for (let z = lo(d[2]); z <= hi(d[2]); z++) {
        const a = this.map.get((x * 512 + y) * 512 + z);
        if (!a) continue;
        for (const o of a) if ((!filter || filter(o)) && v3.len(v3.sub(o.d, d)) <= r) out.push(o);
      }
      return out;
    }
    nearest(d, radius, filter) {
      let best = null, bd = 1e9;
      for (const o of this.query(d, radius, filter)) { const dd = v3.len(v3.sub(o.d, d)); if (dd < bd) { bd = dd; best = o; } }
      return best;
    }
  }
  const peopleHash = new DirHash(1.5), animalHash = new DirHash(1.5), treeHash = new DirHash(1.5), rockHash = new DirHash(1.5);

  // ------------------------------------------------------------------
  // 상태
  // ------------------------------------------------------------------
  let nextId = 1, simTime = 0;
  const people = [], animals = [], villages = [], tribes = [], rocks = [], graves = [];
  const deathLog = {};
  let tribeCounter = 0, aggression = 1;
  const TRIBES = [
    { name: '붉은', c: [0.86, 0.26, 0.24] }, { name: '푸른', c: [0.25, 0.45, 0.9] }, { name: '노란', c: [0.95, 0.76, 0.2] },
    { name: '보라', c: [0.6, 0.32, 0.82] }, { name: '하얀', c: [0.92, 0.92, 0.88] }, { name: '초록', c: [0.25, 0.68, 0.35] },
    { name: '주황', c: [0.95, 0.52, 0.18] }, { name: '분홍', c: [0.95, 0.5, 0.7] },
  ];
  let selected = null;
  const rockets = []; // 발사 중인 로켓 (지표 → 궤도까지만, 우주 구간은 world가 처리)

  // 로그 (같은 종류가 쏟아지지 않게 조절)
  const lastSay = {};
  const sayT = (key, text, kind, gap = 4) => { if (simTime - (lastSay[key] ?? -99) < gap) return; lastSay[key] = simTime; say(text, kind); };

  // ------------------------------------------------------------------
  // 바위 (돌 자원)
  // ------------------------------------------------------------------
  function seedRocks() {
    rocks.length = 0;
    const Rr = rng(env.seed * 13 + 7);
    for (let i = 0; i < 2400 && rocks.length < 700; i++) {
      const d = v3.norm([Rr.range(-1, 1), Rr.range(-1, 1), Rr.range(-1, 1)]);
      const info = cellInfo(d);
      if (info.e < 0.04) continue;
      const hilly = info.e > 0.35 || info.biome === 'rock' || info.biome === 'tundra';
      if (!hilly && Rr() > 0.25) continue;
      rocks.push({ d, sr: R + disp(info.e), amt: 6 + Math.floor(Rr() * 6), max: 12, rot: Rr() * 6.28, s: Rr.range(0.8, 1.3), reserved: null });
    }
    rockHash.rebuild(rocks);
  }

  // ------------------------------------------------------------------
  // 생성
  // ------------------------------------------------------------------
  function newTribe() {
    const t = TRIBES[tribeCounter++ % TRIBES.length];
    const tribe = { id: tribeCounter, name: `${t.name} 부족`, color: t.c, war: new Set(), alive: true, villages: [], tech: 0, era: 0 };
    tribes.push(tribe);
    return tribe;
  }
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  function makePerson(o) {
    const sex = o.sex || (rand() < 0.5 ? 'm' : 'f');
    const mom = o.mother, dad = o.father;
    const skin = mom && dad ? v3.lerp(mom.skin, dad.skin, rand()) : (o.tribe?.skin || pick(SKIN));
    const p = {
      id: nextId++, kind: 'human', name: pick(SYL) + pick(SYL), sex,
      age: o.age ?? 20, life: 58 + rand() * 24,
      d: [...o.d], h: v3.norm(tangentFrame(o.d).e), sr: srOf(o.d), goal: null, speed: WALK * (0.85 + rand() * 0.3), running: false,
      tribe: o.tribe, village: o.village || null, home: null, partner: null, mother: mom || null, father: dad || null, kids: [],
      pregnant: 0, lastBirth: -99, hunger: rand() * 0.3, thirst: rand() * 0.3, hp: 1,
      job: 'none', task: null, carry: null, inside: false, state: '', work: 0,
      skin, hair: rand() < 0.3 && mom ? mom.hair : pick(HAIR), longHair: sex === 'f' ? rand() < 0.8 : rand() < 0.1,
      shirt: shade(o.tribe.color, 0.75 + rand() * 0.35), pants: pick(PANTS), phase: rand() * 10, alive: true, stuck: 0,
    };
    people.push(p);
    return p;
  }
  function makeAnimal(type, d, extra = {}) {
    const a = Object.assign({
      id: nextId++, kind: type, d: [...d], h: v3.norm(tangentFrame(d).e), sr: srOf(d), goal: null,
      speed: type === 'sheep' ? 0.11 : 0.22, running: false, energy: 0.7, age: rand() * 3, life: type === 'sheep' ? 10 + rand() * 6 : 12 + rand() * 6,
      cool: 1 + rand() * 2, alive: true, owner: null, hp: 1, phase: rand() * 10, stuck: 0,
    }, extra);
    animals.push(a);
    return a;
  }
  const countKind = (k) => (k === 'human' ? people.length : animals.reduce((n, a) => n + (a.kind === k ? 1 : 0), 0));

  function findSpot(v, rMin, rMax, size, tries = 30) {
    for (let i = 0; i < tries; i++) {
      const a = rand() * 6.28, r = lerp(rMin, rMax, rand());
      const d = offsetDir(v.d, Math.cos(a) * r, Math.sin(a) * r);
      const info = cellInfo(d);
      if (!info.land || info.e < 0.04) continue;
      if (Math.abs(disp(info.e) - disp(cellInfo(v.d).e)) > 0.45) continue; // 너무 가파른 곳 제외
      if (v.structs.some((s) => distU(s.d, d) < s.size + size)) continue;
      if (villages.some((o) => o !== v && distU(o.d, d) < 2.5)) continue;
      return d;
    }
    return null;
  }

  function foundVillage(tribe, d, { quiet = false, stock = {} } = {}) {
    const v = {
      id: nextId++, tribe, d: [...d], sr: srOf(d), name: pick(VSYL) + pick(VSYL) + ' 마을',
      store: { wood: 0, stone: 0, food: 6, water: 4, ...stock },
      houses: [], sites: [], fields: [], well: null, pen: null, structs: [], planT: 0, waterSpot: null, waterCheckT: 0, founded: simTime,
    };
    v.structs.push({ d: v.d, size: 0.55 }); // 모닥불 + 창고 자리
    villages.push(v);
    tribe.villages.push(v);
    if (!quiet) sayT('found' + tribe.id, `${tribe.name}이 ${v.name}을 세웠어요`, 'civ', 2);
    return v;
  }

  // 건물 (집 / 우물 / 우리)
  const BUILD = {
    house: { wood: 4, stone: 1, time: 10, size: 0.32, name: '집' },
    well: { wood: 2, stone: 2, time: 8, size: 0.2, name: '우물' },
    pen: { wood: 4, stone: 0, time: 8, size: 0.45, name: '양 우리' },
    upgrade: { wood: 3, stone: 2, time: 8, size: 0, name: '집 개축' },
    pad: { wood: 3, stone: 4, time: 12, size: 0.42, name: '로켓 발사대' },
  };
  function addUpgrade(v, h) {
    const era = v.tribe.era;
    const s = { type: 'upgrade', house: h, d: h.d, sr: h.sr, rot: h.rot, need: { wood: 2 + era, stone: era >= 2 ? 3 : 1 }, got: { wood: 0, stone: 0 }, progress: 0, done: false, village: v, size: 0 };
    h.upgrading = s;
    v.sites.push(s);
  }
  function addSite(v, type, d = null) {
    const spec = BUILD[type];
    d = d || (type === 'house' ? findSpot(v, 0.7, 0.9 + Math.sqrt(v.houses.length + v.sites.length) * 0.42, spec.size)
      : findSpot(v, type === 'pad' ? 1.6 : 0.6, type === 'pad' ? 2.6 : 1.6, spec.size));
    if (!d && type === 'well') d = offsetDir(v.d, 0.45, -0.45); // 우물은 꼭 필요하니 자리가 없으면 광장 옆에
    if (!d) return null;
    const s = { type, d, sr: srOf(d), rot: Math.atan2(...(() => { const f = tangentFrame(d); const to = v3.sub(v.d, d); return [v3.dot(to, f.e), v3.dot(to, f.u)]; })()), need: { wood: spec.wood, stone: spec.stone }, got: { wood: 0, stone: 0 }, progress: 0, done: false, hp: 1, family: [], village: v, size: spec.size };
    v.sites.push(s);
    v.structs.push({ d, size: spec.size });
    return s;
  }
  function addTech(tribe, n) {
    tribe.tech += n;
    const next = ERAS[tribe.era + 1];
    if (next && tribe.tech >= next.tech) {
      tribe.era++;
      say(`${tribe.name}이 ${next.name}에 들어섰어요!`, 'era');
      if (tribe.era === 5) say(`${tribe.name}이 하늘을 올려다보기 시작했어요. 곧 로켓 발사대를 지을 거예요`, 'era');
      for (const v of tribe.villages) sparkle(v.d, [1, 0.9, 0.5], 0.6);
    }
  }
  function completeSite(s) {
    const v = s.village;
    addTech(v.tribe, s.type === 'upgrade' ? 6 : 5);
    if (s.type === 'upgrade') {
      s.house.era = v.tribe.era; s.house.upgrading = null;
      v.sites = v.sites.filter((o) => o !== s);
      puff(s.d, [0.85, 0.8, 0.7], 10, 0.2);
      sayT('upg' + v.id, `${v.name}의 집이 ${ERAS[s.house.era].name} 양식으로 새로 지어졌어요`, 'civ', 8);
      return;
    }
    s.era = v.tribe.era;
    s.done = true; s.progress = 1;
    v.sites = v.sites.filter((o) => o !== s);
    if (s.type === 'house') v.houses.push(s);
    else if (s.type === 'well') v.well = s;
    else if (s.type === 'pen') v.pen = s;
    else if (s.type === 'pad') { v.pad = s; v.nextLaunch = simTime + DAY * 0.3; say(`${v.name}에 로켓 발사대가 세워졌어요!`, 'era'); }
    puff(s.d, [0.85, 0.8, 0.7], 10, 0.2);
    sparkle(s.d, v.tribe.color, 0.4);
    sayT('built' + v.id + s.type, `${v.name}에 새 ${josa(BUILD[s.type].name, '이', '가')} 완성됐어요`, 'civ', 3);
  }
  function addField(v) {
    const d = findSpot(v, 1.3, 2.2 + v.fields.length * 0.12, 0.3);
    if (!d) return null;
    const f = tangentFrame(d), to = v3.sub(v.d, d);
    const fld = { d, sr: srOf(d), rot: Math.atan2(v3.dot(to, f.e), v3.dot(to, f.u)), stage: 0, growth: 0, wet: 0, worker: null, village: v };
    v.fields.push(fld);
    v.structs.push({ d, size: 0.3 });
    return fld;
  }

  // ------------------------------------------------------------------
  // 이펙트
  // ------------------------------------------------------------------
  function puff(d, color, n = 8, lift = 0.08, spread = 0.6) {
    const p = surf(d, lift), f = tangentFrame(d);
    for (let i = 0; i < n; i++) {
      const vel = v3.add(v3.scale(d, rand() * 0.6 + 0.2), v3.add(v3.scale(f.e, (rand() - 0.5) * spread), v3.scale(f.u, (rand() - 0.5) * spread)));
      fx.emit({ position: p, velocity: vel, life: 0.4 + rand() * 0.4, size: 1, color, gravity: 0.15 });
    }
  }
  function sparkle(d, color, lift = 0.25) {
    const p = surf(d, lift);
    for (let i = 0; i < 10; i++) fx.emit({ position: p, velocity: v3.add(v3.scale(d, 0.5 + rand()), [(rand() - 0.5), (rand() - 0.5), (rand() - 0.5)]), life: 0.7, size: 2, sizeEnd: 1, color, emissive: 0.9, gravity: 0.3 });
  }
  function emote(p, color) { fx.emit({ position: surf(p.d, 0.36), velocity: v3.scale(p.d, 0.25), life: 1.1, size: 2, color, emissive: 0.8, gravity: 0, fadeIn: 0.1 }); }

  // ------------------------------------------------------------------
  // 죽음
  // ------------------------------------------------------------------
  const deaths = {};
  function killPerson(p, why) {
    if (!p.alive) return;
    p.alive = false;
    deathLog['human:' + why] = (deathLog['human:' + why] || 0) + 1;
    deaths[why] = (deaths[why] || 0) + 1;
    release(p);
    if (p.partner) { p.partner.partner = null; }
    if (p.home) p.home.family = p.home.family.filter((o) => o !== p);
    if (p === selected) say(`${josa(p.name, '이', '가')} 세상을 떠났어요`, 'death');
    if (why === 'age' && p.village) {
      const gd = findSpot(p.village, 2.2, 3.2, 0.08, 12);
      if (gd) graves.push({ d: gd, sr: srOf(gd), rot: rand() * 6.28 });
      if (graves.length > 400) graves.shift();
      sayT('age' + p.village.id, `${p.name} 어르신이 ${Math.floor(p.age)}세로 세상을 떠났어요`, 'death', 6);
    }
    fx.emit({ position: surf(p.d, 0.2), velocity: v3.scale(p.d, 0.4), life: 1.6, size: 1, color: [0.9, 0.95, 1], emissive: 0.8, gravity: 0, fadeIn: 0.1 });
    if (why !== 'age') puff(p.d, why === 'war' || why === 'eaten' ? [0.7, 0.15, 0.15] : [0.6, 0.58, 0.62], 6);
  }
  function killAnimal(a, why) {
    if (!a.alive) return;
    a.alive = false;
    deathLog[a.kind + ':' + why] = (deathLog[a.kind + ':' + why] || 0) + 1;
    if (why !== 'butcher' && why !== 'hunted') puff(a.d, why === 'eaten' ? [0.7, 0.15, 0.15] : [0.6, 0.58, 0.62], 5);
  }
  function release(p) {
    const t = p.task;
    if (t?.tree && t.tree.reserved === p) t.tree.reserved = null;
    if (t?.rock && t.rock.reserved === p) t.rock.reserved = null;
    if (t?.field && t.field.worker === p) t.field.worker = null;
    p.task = null;
  }

  // ------------------------------------------------------------------
  // 이동
  // ------------------------------------------------------------------
  // 목표까지 걸어가고, 도착하면 true
  function goTo(p, d, near = 0.12, run = false) {
    if (distU(p.d, d) <= near) { p.goal = null; return true; }
    p.goal = d; p.running = run;
    return false;
  }
  function moveAll(sdt) {
    for (const list of [people, animals]) {
      for (const c of list) {
        if (!c.alive || c.inside || c.carriedBy) continue;
        const speed = (c.running ? (c.kind === 'human' ? RUN : c.speed * 2.2) : c.speed) * (c.kind === 'human' ? (c.age < 14 ? 0.75 : c.age > 60 ? 0.7 : 1) : 1);
        let dir = null;
        if (c.goal) {
          const to = v3.sub(c.goal, c.d);
          const tan = v3.sub(to, v3.scale(c.d, v3.dot(to, c.d)));
          const l = v3.len(tan);
          if (l * R < speed * sdt) { c.d = [...c.goal]; c.goal = null; continue; }
          if (l > 1e-7) dir = v3.scale(tan, 1 / l);
        } else if (c.wander) dir = c.h;
        if (!dir) continue;
        let nd = v3.norm(v3.add(c.d, v3.scale(dir, speed * sdt / R)));
        if (isWater(nd)) {
          // 물을 만나면 옆으로 돌아간다
          const alt = [rotateAround(dir, c.d, 0.9), rotateAround(dir, c.d, -0.9), rotateAround(dir, c.d, 1.8), rotateAround(dir, c.d, -1.8)];
          let ok = false;
          for (const a of alt) { const t = v3.norm(v3.add(c.d, v3.scale(a, speed * sdt / R))); if (!isWater(t)) { nd = t; dir = a; ok = true; break; } }
          if (!ok) { c.stuck += sdt; continue; }
        }
        c.d = nd;
        c.h = v3.norm(v3.lerp(c.h, dir, Math.min(1, sdt * 8)));
        c.h = v3.norm(v3.sub(c.h, v3.scale(c.d, v3.dot(c.h, c.d))));
        c.moving = true;
      }
    }
  }

  // ------------------------------------------------------------------
  // 사람 하루
  // ------------------------------------------------------------------
  const storeSpot = (v, which) => {
    const off = { wood: [0.32, 0.12], stone: [-0.32, 0.12], food: [0.18, -0.3], water: [-0.18, -0.3] }[which] || [0, 0];
    v._spots = v._spots || {};
    if (!v._spots[which]) v._spots[which] = offsetDir(v.d, off[0], off[1]);
    return v._spots[which];
  };
  function waterSource(v, p) {
    if (v.well) return { d: v.well.d, well: true };
    if (!v.waterSpot || v.waterCheckT < simTime - 30) {
      v.waterCheckT = simTime;
      v.waterSpot = null;
      for (let r = 0.5; r < 7 && !v.waterSpot; r += 0.3) {
        for (let a = 0; a < 6.28; a += 0.35) {
          const d = offsetDir(v.d, Math.cos(a) * r, Math.sin(a) * r);
          if (elevation(d) < 0) {
            // 물가: 한 걸음 안쪽 땅
            const back = offsetDir(v.d, Math.cos(a) * (r - 0.25), Math.sin(a) * (r - 0.25));
            if (!isWater(back)) { v.waterSpot = back; break; }
          }
        }
      }
    }
    return v.waterSpot ? { d: v.waterSpot, well: false } : null;
  }

  function deliver(p, v) {
    const c = p.carry;
    if (!c) return true;
    const kind = c.type === 'log' ? 'wood' : c.type === 'rock' ? 'stone' : c.type === 'water' ? 'water' : 'food';
    if (!goTo(p, storeSpot(v, kind), 0.1)) { p.state = { log: '통나무를 나르는 중', rock: '돌을 나르는 중', wheat: '곡식을 나르는 중', meat: '고기를 나르는 중', water: '물을 길어 오는 중' }[c.type]; return false; }
    v.store[kind] += c.amt;
    p.carry = null;
    return true;
  }

  function doWork(p, secs, state, color = null) {
    // 같은 자리에서 일하기: 타이머가 끝나면 true
    p.goal = null;
    p.work = (p.work || 0) + 0.1;
    p.state = state;
    p.working = true;
    if (color && rand() < 0.25) puff(p.d, color, 2, 0.12, 0.8);
    if (p.work >= secs) { p.work = 0; return true; }
    return false;
  }

  function tickPerson(p, dt) {
    const v = p.village && villages.includes(p.village) ? p.village : null;
    if (!v && p.village) p.village = null;
    p.working = false;
    p.age += dt / DAY;
    const info = cellInfo(p.d);
    p.sr = R + disp(info.e);

    // 환경
    let harm = 0, why = null;
    if (env.oxygen < 12) { harm += (1 - env.oxygen / 12) * 0.6; why = 'oxygen'; }
    if (info.T < -25 && !p.inside) { harm += (-25 - info.T) * 0.02; why = why || 'cold'; }
    if (info.T > 45) { harm += (info.T - 45) * 0.02; why = why || 'heat'; }
    if (env.liquid === 'lava' && info.e < 0) { harm += 3; why = 'burn'; }
    // 배고픔 / 목마름
    p.hunger += dt / DAY * 0.7;
    p.thirst += dt / DAY * 0.7;
    if (p.hunger > 1.6) { harm += 0.012; why = why || 'hunger'; }
    if (p.thirst > 1.6) { harm += 0.018; why = why || 'thirst'; }
    p.stress = harm;
    if (harm > 0) { p.hp -= harm * dt; if (p.hp <= 0) return killPerson(p, why); }
    else p.hp = Math.min(1, p.hp + dt * 0.02);
    if (p.age > p.life) return killPerson(p, 'age');

    // 아기: 엄마 품
    if (p.age < 2.5) {
      const carer = (p.mother?.alive && p.mother) || people.find((o) => o.alive && o.village === v && o.sex === 'f' && o.age > 16);
      if (!carer) return killPerson(p, 'hunger');
      p.carriedBy = carer; p.d = carer.d; p.inside = carer.inside; p.job = 'baby';
      p.state = carer.inside ? '엄마 품에서 자는 중' : '엄마 품에 안겨 있는 중';
      p.hunger = Math.min(p.hunger, 0.5); p.thirst = Math.min(p.thirst, 0.5);
      return;
    }
    p.carriedBy = null;

    // 출산
    if (p.pregnant > 0) {
      p.pregnant += dt / (DAY * 0.7);
      if (p.pregnant >= 1) giveBirth(p);
    }

    // 밤: 집에 가서 잔다
    const night = isNight(p.d);
    const home = p.home && !p.home.dead ? p.home : null;
    if (night && home && p.job !== 'warrior') {
      release(p);
      if (p.inside) { p.state = '자는 중'; tryConceive(p); return; }
      if (goTo(p, home.d, 0.1)) { p.inside = true; p.goal = null; p.state = '자는 중'; return; }
      p.state = '집에 돌아가는 중';
      return;
    }
    if (p.inside) { p.inside = false; p.d = offsetDir(home ? home.d : p.d, 0.12, 0.12); emote(p, [1, 0.95, 0.6]); }
    if (night && !home) {
      // 집이 없으면 모닥불 곁에서 잔다
      if (v && goTo(p, offsetDir(v.d, Math.cos(p.id) * 0.25, Math.sin(p.id) * 0.25), 0.08)) { p.state = '모닥불 곁에서 자는 중'; p.goal = null; return; }
      if (v) { p.state = '잘 곳을 찾는 중'; return; }
    }

    if (!v) return tickHomeless(p, dt, info);

    // 먹고 마시기
    if (p.task?.k === 'eat' || (p.hunger > 0.6 && v.store.food >= 1)) {
      p.task = p.task?.k === 'eat' ? p.task : (release(p), { k: 'eat' });
      if (!goTo(p, storeSpot(v, 'food'), 0.12)) { p.state = '밥 먹으러 가는 중'; return; }
      if (!doWork(p, 1.5, '밥 먹는 중')) return;
      if (v.store.food >= 1) { v.store.food -= 1; p.hunger = Math.max(0, p.hunger - 0.8); }
      p.task = null; return;
    }
    // 창고가 비었으면 들에서 열매를 따 먹는다
    if (p.task?.k === 'forage' || (p.hunger > 0.75 && p.age >= 6)) {
      if (p.task?.k !== 'forage') {
        release(p);
        let spot = null;
        for (let i = 0; i < 8 && !spot; i++) { const d = jitterDir(v.d, 2.2); const inf = cellInfo(d); if (inf.land && inf.fert > 0.3) spot = d; }
        if (!spot) { p.hunger = Math.min(p.hunger, 1.5); return; }
        p.task = { k: 'forage', d: spot };
      }
      if (!goTo(p, p.task.d, 0.1)) { p.state = '열매를 찾으러 가는 중'; return; }
      if (!doWork(p, 3, '열매를 따 먹는 중', [0.85, 0.25, 0.4])) return;
      p.hunger = Math.max(0, p.hunger - 0.65 * Math.max(0.35, cellInfo(p.d).fert));
      p.task = null; return;
    }
    if (p.task?.k === 'drink' || (p.thirst > 0.6 && simTime > (p.noWater || 0))) {
      if (p.task?.k !== 'drink') { release(p); p.task = { k: 'drink' }; }
      let spot;
      if (v.store.water >= 1) spot = storeSpot(v, 'water');
      else { const src = waterSource(v, p); spot = src?.d; }
      if (!spot) { p.task = null; p.noWater = simTime + 12; p.thirst = Math.min(p.thirst, 1.3); return; } // 물이 없으면 잠시 참는다
      if (!goTo(p, spot, 0.12)) { p.state = '물 마시러 가는 중'; return; }
      if (!doWork(p, 1.2, '물 마시는 중')) return;
      if (distU(p.d, storeSpot(v, 'water')) < 0.2 && v.store.water >= 1) v.store.water -= 1;
      p.thirst = 0; p.task = null; return;
    }

    // 아이: 놀기
    if (p.age < 14) {
      p.job = 'child';
      const center = home ? home.d : v.d;
      if (!p.goal || rand() < 0.02) {
        const parent = rand() < 0.4 && (p.mother?.alive ? p.mother : p.father?.alive ? p.father : null);
        p.goal = parent ? jitterDir(parent.d, 0.15) : jitterDir(center, 0.5);
      }
      p.state = pick(['노는 중', '뛰어노는 중', '엄마 따라가는 중', '나비 쫓는 중']);
      p.state = p.task?.st || (p.task = { k: 'play', st: p.state }).st;
      if (rand() < 0.01) p.task = null;
      p.running = rand() < 0.5;
      return;
    }
    // 어르신
    if (p.age > 60) {
      p.job = 'elder';
      if (goTo(p, offsetDir(v.d, Math.cos(p.id * 2) * 0.28, Math.sin(p.id * 2) * 0.28), 0.06)) p.state = '불가에서 쉬는 중';
      else p.state = '천천히 걷는 중';
      return;
    }

    switch (p.job) {
      case 'wood': return jobWood(p, v);
      case 'stone': return jobStone(p, v);
      case 'farm': return jobFarm(p, v);
      case 'water': return jobWater(p, v);
      case 'hunt': return jobHunt(p, v);
      case 'herd': return jobHerd(p, v);
      case 'build': return jobBuild(p, v);
      case 'warrior': return jobWar(p, v);
      default: p.state = '빈둥대는 중'; if (!p.goal) p.goal = jitterDir(v.d, 0.8);
    }
  }

  function tickHomeless(p, dt, info) {
    p.job = 'none';
    if (p.settleTo) {
      if (goTo(p, p.settleTo, 0.3) || p.stuck > 6) {
        p.settleTo = null;
        const near = villages.find((o) => o.tribe === p.tribe && distU(o.d, p.d) < 2.5);
        const v = near || (info.land && info.e > 0.04 ? foundVillage(p.tribe, p.d, { stock: p.stock || {} }) : null);
        if (v) for (const o of people) if (o.alive && o.party === p.party && !o.village) { o.village = v; o.settleTo = null; }
      } else p.state = '새 땅을 찾아 걷는 중';
      return;
    }
    p.wanderT = (p.wanderT || 0) + dt;
    p.state = '살 곳을 찾는 중';
    if (p.wanderT > 4 && info.land && info.fert > 0.15) {
      const near = villages.find((o) => o.tribe === p.tribe && distU(o.d, p.d) < 4);
      const v = near || foundVillage(p.tribe, p.d, { stock: { food: 8, water: 6, wood: 2 } });
      for (const o of people) if (o.alive && !o.village && o.tribe === p.tribe && distU(o.d, p.d) < 2) o.village = v;
      return;
    }
    if (!p.goal || rand() < 0.03) p.goal = jitterDir(p.d, 1.2);
    // 들고 있는 식량으로 버티기
    if (info.fert > 0) p.hunger = Math.max(0, p.hunger - dt / DAY * info.fert * 0.8);
    if (elevation(p.d) < 0.05) p.thirst = 0;
  }

  // ---- 직업 ----
  function jobWood(p, v) {
    if (p.carry) { if (deliver(p, v)) p.task = null; return; }
    let t = p.task?.tree;
    if (!t || t.stump || !t.alive) {
      release(p);
      t = treeHash.nearest(p.d, 7, (o) => o.alive && !o.stump && (o.grow ?? 1) >= 0.9 && (!o.reserved || o.reserved === p));
      if (!t) { p.state = '베어 낼 나무를 찾는 중'; if (!p.goal) p.goal = jitterDir(v.d, 2); return; }
      t.reserved = p; p.task = { k: 'chop', tree: t };
    }
    if (!goTo(p, t.d, 0.13)) { p.state = '나무를 베러 가는 중'; return; }
    p.h = v3.norm(v3.sub(t.d, p.d));
    t.shake = 1;
    if (!doWork(p, 4.5, '도끼로 나무를 베는 중', [0.72, 0.55, 0.35])) return;
    // 쓰러뜨림 → 그루터기, 나중에 다시 자람
    t.stump = true; t.reserved = null; t.regrow = simTime + DAY * (1.2 + rand());
    markTrees();
    puff(t.d, [0.35, 0.6, 0.3], 10, 0.3, 1);
    p.carry = { type: 'log', amt: 3 };
    p.task = null;
  }
  function jobStone(p, v) {
    if (p.carry) { if (deliver(p, v)) p.task = null; return; }
    let r = p.task?.rock;
    if (!r || r.amt <= 0) {
      release(p);
      r = rockHash.nearest(p.d, 12, (o) => o.amt > 0 && (!o.reserved || o.reserved === p));
      if (!r) { p.state = '캘 돌을 찾는 중'; if (!p.goal) p.goal = jitterDir(v.d, 2.5); return; }
      r.reserved = p; p.task = { k: 'mine', rock: r };
    }
    if (!goTo(p, r.d, 0.14)) { p.state = '돌 캐러 가는 중'; return; }
    p.h = v3.norm(v3.sub(r.d, p.d));
    if (!doWork(p, 5, '곡괭이로 돌을 캐는 중', [0.7, 0.7, 0.72])) return;
    r.amt -= 2; r.reserved = null; rocksDirty = true;
    if (r.amt <= 0) puff(r.d, [0.6, 0.6, 0.62], 8, 0.1);
    p.carry = { type: 'rock', amt: 2 };
    p.task = null;
  }
  function jobFarm(p, v) {
    if (p.carry && p.carry.type !== 'water') { if (deliver(p, v)) p.task = null; return; }
    let f = p.task?.field;
    if (!f || !v.fields.includes(f)) {
      release(p);
      f = v.fields.find((o) => !o.worker) || null;
      if (!f) { p.state = '밭이 생기길 기다리는 중'; return; }
      f.worker = p; p.task = { k: 'farm', field: f };
    }
    if (f.stage === 2 && f.wet < 0.25 && !p.carry && v.store.water >= 1) {
      // 물동이 채우러
      if (!goTo(p, storeSpot(v, 'water'), 0.12)) { p.state = '밭에 줄 물을 뜨러 가는 중'; return; }
      v.store.water -= 1; p.carry = { type: 'water', amt: 1, forField: true };
      return;
    }
    if (!goTo(p, f.d, 0.12)) { p.state = f.stage === 3 ? '수확하러 가는 중' : '밭으로 가는 중'; return; }
    if (p.carry?.forField) {
      if (!doWork(p, 2, '밭에 물을 주는 중', [0.5, 0.75, 1])) return;
      f.wet = 1; p.carry = null; return;
    }
    if (f.stage === 0) { if (doWork(p, 3, '괭이로 밭을 가는 중', [0.45, 0.32, 0.22])) f.stage = 1; return; }
    if (f.stage === 1) { if (doWork(p, 2, '씨를 뿌리는 중', [0.9, 0.85, 0.5])) { f.stage = 2; f.growth = 0; f.wet = 0.6; } return; }
    if (f.stage === 3) {
      if (!doWork(p, 4, '곡식을 거두는 중', [0.95, 0.82, 0.35])) return;
      f.stage = 0; f.growth = 0;
      p.carry = { type: 'wheat', amt: Math.round(10 * ERAS[v.tribe.era].yield) };
      addTech(v.tribe, 1);
      return;
    }
    // 자라는 중: 근처에서 김매기
    p.state = '밭을 돌보는 중';
    p.working = rand() < 0.5;
    if (!p.goal && rand() < 0.05) p.goal = jitterDir(f.d, 0.12);
  }
  function jobWater(p, v) {
    if (p.carry) { if (deliver(p, v)) p.task = null; return; }
    const src = waterSource(v, p);
    if (!src) { p.state = '근처에 물이 없어요'; return; }
    if (!goTo(p, src.d, 0.1)) { p.state = src.well ? '우물로 가는 중' : '물가로 가는 중'; return; }
    if (!doWork(p, src.well ? 1.5 : 2.5, src.well ? '우물에서 물을 긷는 중' : '물을 뜨는 중', [0.55, 0.8, 1])) return;
    p.carry = { type: 'water', amt: src.well ? 4 : 3 };
  }
  function jobHunt(p, v) {
    if (p.carry) { if (deliver(p, v)) p.task = null; return; }
    let a = p.task?.prey;
    if (!a || !a.alive) {
      a = animalHash.nearest(p.d, 9, (o) => o.alive && !o.owner && (o.kind === 'sheep' || (o.kind === 'wolf' && distU(o.d, v.d) < 4)));
      if (!a) { p.state = '사냥감을 찾는 중'; if (!p.goal || rand() < 0.02) p.goal = jitterDir(v.d, 3); return; }
      p.task = { k: 'hunt', prey: a };
    }
    if (!goTo(p, a.d, 0.14, true)) { p.state = a.kind === 'wolf' ? '늑대를 쫓는 중' : '양을 사냥하는 중'; a.scared = 1; return; }
    if (!doWork(p, 1, '사냥하는 중', [0.7, 0.2, 0.2])) return;
    killAnimal(a, 'hunted');
    p.carry = { type: 'meat', amt: a.kind === 'wolf' ? 2 : 4 };
  }
  function jobHerd(p, v) {
    if (p.carry) { if (deliver(p, v)) p.task = null; return; }
    const pen = v.pen;
    if (!pen) { p.job = 'wood'; return; }
    const tame = animals.filter((a) => a.alive && a.owner === v);
    // 식량이 모자라면 양을 잡는다
    if (v.store.food < people.length * 0 + 3 && tame.length > 4) {
      const a = tame[0];
      if (!goTo(p, a.d, 0.14)) { p.state = '잡을 양에게 가는 중'; return; }
      if (!doWork(p, 1.5, '양을 잡는 중', [0.7, 0.2, 0.2])) return;
      killAnimal(a, 'butcher'); p.carry = { type: 'meat', amt: 4 }; return;
    }
    // 들판의 양을 데려온다
    if (tame.length < 10) {
      let a = p.task?.lead;
      if (!a || !a.alive || a.owner) {
        a = animalHash.nearest(p.d, 8, (o) => o.alive && o.kind === 'sheep' && !o.owner);
        p.task = a ? { k: 'lead', lead: a } : null;
      }
      if (a) {
        if (!goTo(p, a.d, 0.15)) { p.state = '들판의 양을 데리러 가는 중'; return; }
        a.owner = v; a.goal = jitterDir(pen.d, 0.12);
        p.task = null; emote(p, [1, 1, 1]); return;
      }
    }
    p.state = '양을 돌보는 중';
    if (!p.goal || rand() < 0.03) p.goal = jitterDir(pen.d, 0.35);
  }
  function jobBuild(p, v) {
    const s = v.sites.find((o) => !o.done && o.type === 'pad') || v.sites.find((o) => !o.done);
    if (!s) { p.state = '지을 것이 없어요'; return; }
    // 재료 나르기
    const needW = s.need.wood - s.got.wood, needS = s.need.stone - s.got.stone;
    if (p.carry) {
      if (!goTo(p, s.d, 0.16)) { p.state = `${BUILD[s.type].name} 지을 재료를 나르는 중`; return; }
      if (p.carry.type === 'log') s.got.wood += p.carry.amt; else if (p.carry.type === 'rock') s.got.stone += p.carry.amt;
      p.carry = null; return;
    }
    if (needW > 0 || needS > 0) {
      const kind = needW > 0 && v.store.wood >= 1 ? 'wood' : needS > 0 && v.store.stone >= 1 ? 'stone' : null;
      if (!kind) { p.state = needW > 0 ? '나무가 모이길 기다리는 중' : '돌이 모이길 기다리는 중'; if (!p.goal) p.goal = jitterDir(s.d, 0.3); return; }
      if (!goTo(p, storeSpot(v, kind), 0.1)) { p.state = '창고로 재료를 가지러 가는 중'; return; }
      const amt = Math.min(2, v.store[kind], kind === 'wood' ? needW : needS);
      v.store[kind] -= amt;
      p.carry = { type: kind === 'wood' ? 'log' : 'rock', amt };
      return;
    }
    if (!goTo(p, s.d, 0.18)) { p.state = `${BUILD[s.type].name} 지으러 가는 중`; return; }
    p.h = v3.norm(v3.sub(s.d, p.d));
    doWork(p, 999, `${BUILD[s.type].name}을 짓는 중`, [0.8, 0.65, 0.45]);
    s.progress += 0.1 / BUILD[s.type].time * (1 + v.tribe.era * 0.2);
    if (s.progress >= 1) completeSite(s);
  }
  function jobWar(p, v) {
    const tribe = p.tribe;
    const foe = peopleHash.nearest(p.d, 4, (o) => o.alive && !o.inside && o.age >= 14 && o.tribe !== tribe && tribe.war.has(o.tribe));
    if (foe) {
      if (!goTo(p, foe.d, 0.14, true)) { p.state = `${foe.tribe.name}과 싸우러 달려가는 중`; return; }
      p.working = true; p.state = '싸우는 중';
      foe.hp -= (0.25 + rand() * 0.35) * 0.3;
      if (rand() < 0.3) fx.emit({ position: surf(foe.d, 0.15), velocity: v3.scale(foe.d, 1.2), life: 0.25, size: 1, color: [1, 0.9, 0.6], emissive: 1, gravity: 0.5 });
      if (foe.hp <= 0) killPerson(foe, 'war');
      return;
    }
    for (const ov of villages) {
      if (ov.tribe === tribe || !tribe.war.has(ov.tribe) || distU(ov.d, p.d) > 16) continue;
      const h = ov.houses.find((hh) => hh.hp > 0);
      if (!h) continue;
      if (!goTo(p, h.d, 0.2, true)) { p.state = `${ov.tribe.name} 마을로 쳐들어가는 중`; return; }
      p.working = true; p.state = '집에 불을 지르는 중';
      h.hp -= 0.012; h.burning = true;
      return;
    }
    p.state = '마을을 지키는 중';
    if (!p.goal || rand() < 0.03) p.goal = jitterDir(v.d, 1.2);
  }

  // ---- 가족 ----
  function tryConceive(p) {
    if (p.sex !== 'f' || p.pregnant > 0 || !p.partner || !p.partner.inside || p.partner.home !== p.home) return;
    if (p.age < 18 || p.age > 42 || p.kids.filter((k) => k.alive).length >= 4 || simTime - p.lastBirth < DAY * 1.5) return;
    const v = p.village;
    if (!v || v.store.food < 3 || people.length >= CAP.human) return;
    if (rand() < 0.012) { p.pregnant = 0.001; sparkle(p.home.d, [1, 0.5, 0.7], 0.35); }
  }
  function giveBirth(p) {
    p.pregnant = 0; p.lastBirth = simTime;
    const baby = makePerson({ d: p.d, tribe: p.tribe, village: p.village, mother: p, father: p.partner, age: 0 });
    baby.home = p.home;
    if (p.home) p.home.family.push(baby);
    p.kids.push(baby); if (p.partner) p.partner.kids.push(baby);
    sparkle(p.d, [1, 0.85, 0.95], 0.3);
    sayT('birth' + (p.village?.id || 0), `${p.name}의 아기 ${josa(baby.name, '이', '가')} 태어났어요`, 'life', 5);
  }

  // ------------------------------------------------------------------
  // 마을 운영 (1초마다)
  // ------------------------------------------------------------------
  function planVillage(v) {
    const pop = people.filter((p) => p.alive && p.village === v);
    const adults = pop.filter((p) => p.age >= 14 && p.age <= 60);
    v.pop = pop.length;
    if (pop.length === 0) return;
    const S = v.store;

    // 짝 맺기
    const singles = adults.filter((p) => !p.partner && p.age >= 16);
    for (const m of singles) {
      if (m.sex !== 'm' || m.partner) continue;
      const f = singles.find((o) => o.sex === 'f' && !o.partner && Math.abs(o.age - m.age) < 12 && o.mother !== m.mother);
      if (f) { m.partner = f; f.partner = m; emote(m, [1, 0.4, 0.55]); emote(f, [1, 0.4, 0.55]); }
    }
    // 집 배정: 집 하나 = 한 가족
    for (const h of v.houses) h.family = h.family.filter((o) => o.alive && o.village === v);
    const homeless = adults.filter((p) => !p.home || p.home.dead);
    for (const p of homeless) {
      const h = (p.partner?.home && !p.partner.home.dead && p.partner.home) || v.houses.find((o) => o.family.filter((x) => x.age >= 14).length === 0);
      if (h) { p.home = h; h.family.push(p); for (const k of p.kids) if (k.alive && k.age < 14) { k.home = h; if (!h.family.includes(k)) h.family.push(k); } }
    }
    for (const p of pop) if (p.age < 14 && (!p.home || p.home.dead)) p.home = p.mother?.home || p.father?.home || null;

    // 지을 것 정하기
    const stillHomeless = adults.filter((p) => !p.home || p.home.dead).length;
    const activeHouses = v.sites.filter((s) => s.type === 'house').length;
    if (stillHomeless > 0 && activeHouses < (pop.length > 20 ? 2 : 1) && v.houses.length < 24) addSite(v, 'house');
    if (!v.well && !v.sites.some((s) => s.type === 'well') && v.houses.length >= 2) { waterSource(v); if (!v.waterSpot || distU(v.waterSpot, v.d) > 1.6) addSite(v, 'well'); }
    if (!v.pen && !v.sites.some((s) => s.type === 'pen') && v.houses.length >= 3 && animalHash.query(v.d, 8, (a) => a.kind === 'sheep' && !a.owner).length >= 3) addSite(v, 'pen');
    // 시대가 바뀌면 옛날 집을 하나씩 새 양식으로 고쳐 짓는다
    if (!v.sites.some((s) => s.type === 'upgrade') && v.sites.length < 2) {
      const old = v.houses.find((h) => (h.era ?? 0) < v.tribe.era && !h.upgrading);
      if (old) addUpgrade(v, old);
    }
    // 우주 시대: 발사대를 짓고 로켓을 쏜다
    if (v.tribe.era >= 5 && !v.pad && !v.sites.some((s) => s.type === 'pad') && v.houses.length >= 3) addSite(v, 'pad');
    if (v.pad && v.tribe.era >= 5 && simTime > (v.nextLaunch || 0) && !rockets.some((r) => r.v === v)) {
      if (S.stone < 3) S.stone += 1; // 연료가 모자라면 조금씩 정제
      else {
        S.stone -= 3;
        const foes = [...v.tribe.war].filter((t) => t.alive && t.era >= 5);
        const sats = ctx.space?.satellites(v.tribe) ?? 9;
        const kind = foes.length && rand() < 0.6 ? 'warship' : sats < 3 ? 'satellite' : 'colony';
        rockets.push({ v, pad: v.pad, kind, t: 0, alt: 0, vel: 0, tribe: v.tribe, foe: foes.length ? pick(foes) : null });
        v.nextLaunch = simTime + DAY * (0.5 + rand() * 0.5);
        sayT('launch' + v.id, `${v.name}에서 ${kind === 'warship' ? '전함' : kind === 'satellite' ? '인공위성' : '식민선'}이 발사돼요!`, kind === 'warship' ? 'war' : 'era', 2);
      }
    }
    const wantFields = Math.min(10, Math.ceil(pop.length / 3));
    if (v.fields.length < wantFields && S.wood >= 1) { if (addField(v)) S.wood -= 1; }

    // 일자리 나누기 (지금 하던 일은 되도록 유지)
    const atWar = v.tribe.war.size > 0 && villages.some((o) => v.tribe.war.has(o.tribe) && distU(o.d, v.d) < 16);
    const quota = {};
    const n = adults.length;
    if (atWar) quota.warrior = Math.ceil(n * 0.5);
    quota.wood = S.wood > 30 && !v.sites.length ? 0 : 1 + (S.wood < 8 && n >= 5 ? 1 : 0);
    quota.water = S.water < pop.length * 1.2 ? 1 + (!v.well && pop.length > 10 ? 1 : 0) : 0;
    quota.farm = Math.min(v.fields.length, Math.max(1, Math.round(n * 0.35)));
    quota.hunt = S.food < pop.length * 2 && n >= 4 ? 1 : 0;
    quota.build = v.sites.length ? (n >= 6 ? 2 : 1) : 0;
    quota.stone = (v.sites.some((s) => s.need.stone > s.got.stone) || S.stone < 4 ? 1 : 0) + (v.tribe.era >= 4 && n >= 6 ? 1 : 0);
    quota.herd = v.pen ? 1 : 0;
    const order = ['warrior', 'wood', 'water', 'farm', 'hunt', 'build', 'stone', 'herd'];
    const used = {};
    for (const p of adults) if (quota[p.job] && (used[p.job] || 0) < quota[p.job]) used[p.job] = (used[p.job] || 0) + 1; else if (p.job !== 'none') p._free = true;
    for (const p of adults) {
      if (!p._free && quota[p.job] && p.job !== 'none') continue;
      p._free = false;
      const job = order.find((j) => (used[j] || 0) < (quota[j] || 0)) || (v.fields.some((f) => !f.worker) ? 'farm' : 'wood');
      used[job] = (used[job] || 0) + 1;
      if (p.job !== job) { release(p); p.job = job; p.work = 0; }
    }

    // 이주: 마을이 커지면 한 가족이 새 땅으로
    if (pop.length > 26 && v.houses.length >= 8 && rand() < 0.04 && v.tribe.villages.length < 10) {
      const fam = adults.find((p) => p.partner && p.partner.alive && p.age < 40);
      if (fam) {
        let target = null;
        for (let i = 0; i < 20 && !target; i++) {
          const a = rand() * 6.28, r = 7 + rand() * 6;
          const d = offsetDir(v.d, Math.cos(a) * r, Math.sin(a) * r);
          const inf = cellInfo(d);
          if (inf.land && inf.fert > 0.3 && villages.every((o) => distU(o.d, d) > 5)) target = d;
        }
        if (target) {
          const party = nextId++;
          const go = [fam, fam.partner, ...fam.kids.filter((k) => k.alive && k.age < 14)];
          for (const o of go) { release(o); o.village = null; o.home = null; o.settleTo = target; o.party = party; o.job = 'none'; }
          fam.stock = { food: Math.min(6, S.food), wood: Math.min(3, S.wood), water: 4 };
          S.food -= fam.stock.food; S.wood -= fam.stock.wood;
          sayT('mig' + v.id, `${fam.name}네 가족이 새 땅을 찾아 ${v.tribe.name} 마을을 떠났어요`, 'civ', 3);
        }
      }
    }
  }

  // 로켓: 카운트다운(연기) → 상승(불꽃) → 고도 26에서 우주로 넘김
  function updateRockets(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      if (!villages.includes(r.v) || r.pad.dead) { rockets.splice(i, 1); continue; }
      r.t += dt;
      const base = surf(r.pad.d, 0.05);
      if (r.t < 3) {
        if (rand() < 0.5) fx.emit({ position: base, velocity: v3.add(v3.scale(r.pad.d, 0.3), [(rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8]), life: 1.2, size: 3, sizeEnd: 5, color: [0.85, 0.85, 0.88], colorEnd: [0.6, 0.6, 0.65], gravity: -0.05, fadeIn: 0.1 });
        continue;
      }
      r.vel += dt * (2 + r.vel * 0.9);
      r.alt += r.vel * dt;
      const p = v3.scale(r.pad.d, r.pad.sr + r.alt + 0.1);
      for (let k = 0; k < 3; k++) fx.emit({ position: v3.add(p, v3.scale(r.pad.d, -0.15)), velocity: v3.add(v3.scale(r.pad.d, -2 - rand() * 2), [(rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6]), life: 0.5 + rand() * 0.5, size: 2, sizeEnd: 4, color: [1, 0.9, 0.5], colorEnd: [0.7, 0.7, 0.72], emissive: 1, gravity: 0 });
      if (r.alt < 1.5 && rand() < 0.6) puff(r.pad.d, [0.85, 0.85, 0.88], 3, 0.1, 2.5);
      if (r.alt > 26) { rockets.splice(i, 1); ctx.space?.toOrbit(r); }
    }
  }

  function tickWorld(dt) {
    // 밭 자라기
    for (const v of villages) {
      // 사람이 모여 살면 지식이 조금씩 쌓인다
      addTech(v.tribe, dt / DAY * (2 + (v.pop || 0) * 0.35));
      // 빗물 받기 (습한 곳일수록 많이)
      v.store.water += dt / DAY * 3 * cellInfo(v.d).m * (env.liquid === 'water' && env.temp > -5 ? 1 : 0);
      for (const f of v.fields) {
        if (f.stage !== 2) continue;
        const day = !isNight(f.d);
        f.wet = Math.max(0, f.wet - dt / (DAY * 0.6));
        if (day) f.growth += dt / (DAY * 0.6) * (f.wet > 0 ? 1 : 0.35) * (env.temp > -5 ? 1 : 0.2);
        if (f.growth >= 1) f.stage = 3;
      }
      // 불타는 집
      for (let i = v.houses.length - 1; i >= 0; i--) {
        const h = v.houses[i];
        if (h.burning && rand() < 0.3) fx.emit({ position: surf(h.d, 0.2), velocity: v3.scale(h.d, 0.8), life: 0.9, size: 2, sizeEnd: 3, color: [1, 0.6, 0.2], colorEnd: [0.3, 0.28, 0.3], emissive: 0.7, gravity: -0.1 });
        if (h.hp <= 0) destroyHouse(v, h);
      }
      // 마을 소멸
      if (!people.some((p) => p.alive && (p.village === v || p.carriedBy?.village === v))) {
        villages.splice(villages.indexOf(v), 1);
        v.tribe.villages = v.tribe.villages.filter((o) => o !== v);
        sayT('gone' + v.id, `${v.tribe.name}의 ${v.name}이 사라졌어요`, 'death', 0);
      }
    }
    // 나무 다시 자라기
    let changed = false;
    for (const t of trees) {
      if (t.stump && simTime > t.regrow) { t.stump = false; t.grow = 0.15; changed = true; }
      else if ((t.grow ?? 1) < 1 && !t.stump) { t.grow = Math.min(1, t.grow + dt / (DAY * 2)); if (Math.floor(t.grow * 10) !== Math.floor((t.grow - dt / (DAY * 2)) * 10)) changed = true; }
    }
    if (changed) markTrees();
    // 전쟁/평화
    for (const t of tribes) {
      if (!t.alive) continue;
      if (t.villages.length === 0 && !people.some((p) => p.alive && p.tribe === t)) { t.alive = false; say(`${t.name}이 멸망했어요`, 'death'); for (const o of tribes) o.war.delete(t); continue; }
      for (const o of tribes) {
        if (o === t || !o.alive || t.id > o.id) continue;
        const close = t.villages.some((a) => o.villages.some((b) => distU(a.d, b.d) < 14));
        if (!t.war.has(o) && close && rand() < dt * 0.008 * aggression) declareWar(t, o);
        else if (t.war.has(o) && rand() < dt * 0.008) { t.war.delete(o); o.war.delete(t); say(`${t.name}과 ${o.name}이 평화 조약을 맺었어요`, 'peace'); for (const p of people) if (p.job === 'warrior') p.job = 'none'; }
      }
    }
  }
  function destroyHouse(v, h) {
    v.houses = v.houses.filter((o) => o !== h);
    v.structs = v.structs.filter((s) => distU(s.d, h.d) > 0.05);
    h.dead = true;
    v.sites = v.sites.filter((s) => s.house !== h);
    for (const p of h.family) if (p.home === h) { p.home = null; p.inside = false; }
    puff(h.d, [0.35, 0.3, 0.3], 14, 0.15, 1.2);
  }
  function declareWar(a, b) {
    if (a === b || a.war.has(b) || !a.alive || !b.alive) return;
    a.war.add(b); b.war.add(a);
    say(`${a.name}과 ${b.name}의 전쟁이 시작됐어요!`, 'war');
  }

  // ------------------------------------------------------------------
  // 동물
  // ------------------------------------------------------------------
  function tickAnimal(a, dt) {
    a.age += dt / DAY;
    const info = cellInfo(a.d);
    a.sr = R + disp(info.e);
    let harm = 0;
    if (env.oxygen < 10) harm += (1 - env.oxygen / 10) * 0.6;
    if (info.T < (a.kind === 'wolf' ? -35 : -20)) harm += 0.3;
    if (info.T > 42) harm += 0.3;
    if (env.liquid === 'lava' && info.e < 0) harm += 3;
    if (harm) { a.hp -= harm * dt; if (a.hp <= 0) return killAnimal(a, 'env'); }
    if (a.age > a.life) return killAnimal(a, 'age');
    a.cool -= dt;
    a.wander = false;
    if (a.kind === 'sheep') {
      a.energy += (info.fert * 0.12 - 0.025) * dt;
      if (a.energy <= 0) return killAnimal(a, 'hunger');
      const pen = a.owner?.pen;
      if (a.owner && (!pen || !villages.includes(a.owner))) a.owner = null;
      const wolf = animalHash.nearest(a.d, 1.4, (o) => o.kind === 'wolf' && o.alive);
      if (wolf || a.scared > 0) {
        a.scared = Math.max(0, (a.scared || 0) - dt);
        const from = wolf ? wolf.d : a.d;
        a.goal = offsetDir(a.d, ...(() => { const f = tangentFrame(a.d); const d = v3.sub(a.d, from); return [v3.dot(d, f.e) * R * 3 + (rand() - 0.5), v3.dot(d, f.u) * R * 3 + (rand() - 0.5)]; })());
        a.running = true;
      } else if (pen) {
        a.running = false;
        if (distU(a.d, pen.d) > 0.3 || !a.goal && rand() < 0.04) a.goal = jitterDir(pen.d, 0.18);
      } else {
        a.running = false;
        // 풀 뜯으며 무리 지어 천천히
        if (!a.goal && rand() < 0.04) {
          const mate = animalHash.nearest(a.d, 1.2, (o) => o !== a && o.kind === 'sheep' && !o.owner);
          a.goal = mate ? jitterDir(mate.d, 0.3) : jitterDir(a.d, 0.5);
        }
        a.grazing = !a.goal;
      }
      if (a.energy > 0.95 && a.cool <= 0 && a.age > 1.5) {
        a.energy *= 0.55; a.cool = DAY * (0.6 + rand() * 0.4);
        const crowd = animalHash.query(a.d, 1.2, (o) => o.kind === 'sheep').length;
        if (crowd < (pen ? 12 : 7) && countKind('sheep') < CAP.sheep) makeAnimal('sheep', jitterDir(a.d, 0.1), { owner: a.owner, age: 0, energy: 0.5 });
      }
    } else {
      a.energy -= 0.02 * dt;
      if (a.energy <= 0) return killAnimal(a, 'hunger');
      const man = peopleHash.nearest(a.d, 1.1, (o) => o.alive && !o.inside && o.age >= 14);
      if (man && a.energy > 0.2) {
        const f = tangentFrame(a.d), d = v3.sub(a.d, man.d);
        a.goal = offsetDir(a.d, v3.dot(d, f.e) * R * 4, v3.dot(d, f.u) * R * 4); a.running = true; return;
      }
      let prey = a.prey?.alive ? a.prey : null;
      if (!prey && a.energy < 0.8) prey = a.prey = animalHash.nearest(a.d, 5, (o) => o.kind === 'sheep' && o.alive && !o.owner) || (a.energy < 0.2 ? peopleHash.nearest(a.d, 3, (o) => o.alive && !o.inside && !o.village) : null);
      if (prey) {
        a.running = true;
        if (goTo(a, prey.d, 0.1, true)) {
          if (prey.kind === 'human') killPerson(prey, 'eaten'); else killAnimal(prey, 'eaten');
          a.energy = Math.min(1.2, a.energy + 0.6); a.prey = null;
        }
      } else { a.running = false; if (!a.goal || rand() < 0.03) a.goal = jitterDir(a.d, 1.2); }
      if (a.energy > 0.95 && a.cool <= 0 && a.age > 2) {
        a.energy *= 0.55; a.cool = DAY * (0.7 + rand() * 0.5);
        if (animalHash.query(a.d, 3, (o) => o.kind === 'wolf').length < 4 && countKind('wolf') < CAP.wolf) makeAnimal('wolf', jitterDir(a.d, 0.15), { age: 0, energy: 0.5 });
      }
    }
  }

  // ------------------------------------------------------------------
  // 틱
  // ------------------------------------------------------------------
  let planT = 0, rocksDirty = true;
  function tick(dt) {
    simTime += dt;
    peopleHash.rebuild(people, (p) => p.alive);
    animalHash.rebuild(animals, (a) => a.alive);
    treeHash.rebuild(trees, (t) => t.alive !== false && !t.burnt);
    for (const p of people) if (p.alive) tickPerson(p, dt);
    for (const a of animals) if (a.alive) tickAnimal(a, dt);
    updateRockets(dt);
    planT += dt;
    if (planT >= 1) { planT = 0; for (const v of villages.slice()) planVillage(v); tickWorld(1); reportDeaths(); }
    for (let i = people.length - 1; i >= 0; i--) if (!people[i].alive) people.splice(i, 1);
    for (let i = animals.length - 1; i >= 0; i--) if (!animals[i].alive) animals.splice(i, 1);
    if (rocksDirty) { for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].amt <= 0) rocks.splice(i, 1); rockHash.rebuild(rocks); }
  }
  let deathT = 0;
  function reportDeaths() {
    deathT += 1;
    if (deathT < 4) return;
    deathT = 0;
    const L = { oxygen: '숨이 막혀', cold: '얼어서', heat: '더위로', burn: '용암에', hunger: '굶주려', thirst: '목말라', war: '전쟁으로', meteor: '운석에', eaten: '늑대에게' };
    for (const k in L) if (deaths[k] >= 2) say(`${L[k]} ${deaths[k]}명이 죽었어요`, 'death');
    for (const k in deaths) deaths[k] = 0;
  }

  // ------------------------------------------------------------------
  // 렌더링 (인스턴스)
  // ------------------------------------------------------------------
  const W = [1, 1, 1];
  const G = {
    leg: (() => { const g = new Geometry(); g.merge(Geometry.box(0.028, 0.07, 0.034, W), { position: [0, -0.07, 0] }); g.merge(Geometry.box(0.03, 0.014, 0.042, [0.35, 0.3, 0.3]), { position: [0, -0.084, 0.005] }); return g; })(),
    torso: (() => { const g = new Geometry(); g.merge(Geometry.box(0.072, 0.095, 0.048, W)); g.merge(Geometry.box(0.075, 0.016, 0.05, [0.7, 0.62, 0.5]), { position: [0, 0, 0] }); return g; })(),
    arm: (() => { const g = new Geometry(); g.merge(Geometry.box(0.022, 0.075, 0.026, W), { position: [0, -0.075, 0] }); return g; })(),
    head: (() => { const g = new Geometry(); g.merge(Geometry.box(0.062, 0.058, 0.058, W), { position: [0, 0.029, 0] }); g.merge(Geometry.box(0.01, 0.012, 0.004, [0.08, 0.08, 0.1]), { position: [-0.014, 0.034, 0.03] }); g.merge(Geometry.box(0.01, 0.012, 0.004, [0.08, 0.08, 0.1]), { position: [0.014, 0.034, 0.03] }); return g; })(),
    hairS: (() => { const g = new Geometry(); g.merge(Geometry.box(0.068, 0.02, 0.066, W), { position: [0, 0.062, -0.002] }); g.merge(Geometry.box(0.068, 0.04, 0.014, W), { position: [0, 0.04, -0.028] }); return g; })(),
    hairL: (() => { const g = new Geometry(); g.merge(Geometry.box(0.068, 0.02, 0.066, W), { position: [0, 0.062, -0.002] }); g.merge(Geometry.box(0.07, 0.09, 0.016, W), { position: [0, 0.02, -0.03] }); g.merge(Geometry.box(0.012, 0.06, 0.05, W), { position: [-0.034, 0.03, -0.004] }); g.merge(Geometry.box(0.012, 0.06, 0.05, W), { position: [0.034, 0.03, -0.004] }); return g; })(),
    log: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.022, 0.022, 0.2, 6, [0.6, 0.42, 0.26]), { rotation: [0, 0, Math.PI / 2], position: [0.1, 0, 0] }); return g; })(),
    rock: Geometry.icosphere(0.04, 0, [0.62, 0.62, 0.66], { jitter: 0.2, seed: 3 }),
    wheat: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.028, 0.02, 0.07, 6, [0.95, 0.8, 0.35])); g.merge(Geometry.box(0.06, 0.012, 0.012, [0.7, 0.5, 0.25]), { position: [0, 0.03, 0] }); return g; })(),
    meat: (() => { const g = new Geometry(); g.merge(Geometry.icosphere(0.032, 0, [0.75, 0.25, 0.22], { squashY: 0.7 })); g.merge(Geometry.box(0.01, 0.01, 0.05, [0.95, 0.92, 0.85]), { position: [0, 0, 0.03] }); return g; })(),
    bucket: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.026, 0.02, 0.04, 6, [0.55, 0.42, 0.3])); g.merge(Geometry.cylinder(0.022, 0.022, 0.005, 6, [0.4, 0.7, 1]), { position: [0, 0.037, 0] }); return g; })(),
    tool: (() => { const g = new Geometry(); g.merge(Geometry.box(0.01, 0.1, 0.01, [0.55, 0.4, 0.25]), { position: [0, -0.12, 0.02] }); return g; })(),
    sheep: (() => { const g = new Geometry(); g.merge(Geometry.icosphere(0.06, 1, [0.97, 0.96, 0.92], { jitter: 0.1, squashY: 0.8 }), { position: [0, 0.075, 0] }); g.merge(Geometry.box(0.038, 0.04, 0.042, [0.22, 0.2, 0.22]), { position: [0, 0.09, 0.06] }); for (const [x, z] of [[-0.03, -0.03], [0.03, -0.03], [-0.03, 0.03], [0.03, 0.03]]) g.merge(Geometry.box(0.016, 0.04, 0.016, [0.22, 0.2, 0.22]), { position: [x, 0, z] }); return g; })(),
    wolf: (() => { const g = new Geometry(), c = [0.5, 0.49, 0.54], d = [0.32, 0.31, 0.36]; g.merge(Geometry.box(0.055, 0.05, 0.12, c), { position: [0, 0.045, 0] }); g.merge(Geometry.box(0.048, 0.048, 0.055, c), { position: [0, 0.075, 0.07] }); g.merge(Geometry.box(0.024, 0.02, 0.032, d), { position: [0, 0.068, 0.11] }); g.merge(Geometry.cone(0.012, 0.028, 4, d), { position: [-0.014, 0.1, 0.07] }); g.merge(Geometry.cone(0.012, 0.028, 4, d), { position: [0.014, 0.1, 0.07] }); g.merge(Geometry.box(0.016, 0.016, 0.065, d), { position: [0, 0.06, -0.08], rotation: [0.5, 0, 0] }); for (const [x, z] of [[-0.02, -0.04], [0.02, -0.04], [-0.02, 0.04], [0.02, 0.04]]) g.merge(Geometry.box(0.014, 0.04, 0.014, d), { position: [x, 0, z] }); return g; })(),
    // 석기: 움집 (둥근 벽 + 짚 원뿔 지붕)
    wall0: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.15, 0.16, 0.09, 7, [0.6, 0.48, 0.34])); g.merge(Geometry.box(0.06, 0.07, 0.03, [0.2, 0.15, 0.12]), { position: [0, 0, 0.145] }); return g; })(),
    roof0: (() => { const g = new Geometry(); g.merge(Geometry.cone(0.2, 0.22, 7, [0.86, 0.72, 0.4]), { position: [0, 0.08, 0] }); return g; })(),
    win0: (() => { const g = new Geometry(); g.merge(Geometry.box(0.05, 0.05, 0.02, [1, 0.75, 0.4]), { position: [0, 0.035, 0.155] }); return g; })(),
    // 청동기: 통나무집 (짚 지붕)
    wall1: (() => { const g = new Geometry(); for (let i = 0; i < 4; i++) g.merge(Geometry.box(0.28, 0.045, 0.24, i % 2 ? [0.55, 0.38, 0.24] : [0.62, 0.44, 0.28]), { position: [0, i * 0.045, 0] }); g.merge(Geometry.box(0.06, 0.1, 0.012, [0.3, 0.2, 0.14]), { position: [0, 0, 0.122] }); return g; })(),
    roof1: (() => { const g = new Geometry(); g.merge(Geometry.prism(0.36, 0.16, 0.3, [0.88, 0.74, 0.42]), { position: [0, 0.18, 0] }); return g; })(),
    win1: (() => { const g = new Geometry(); g.merge(Geometry.box(0.045, 0.045, 0.012, [1, 0.8, 0.45]), { position: [0.08, 0.09, 0.123] }); return g; })(),
    // 중세: 돌집 (굴뚝, 큰 지붕)
    wall3: (() => { const g = new Geometry(); g.merge(Geometry.box(0.36, 0.28, 0.3, [0.72, 0.72, 0.74])); g.merge(Geometry.box(0.37, 0.03, 0.31, [0.55, 0.55, 0.58]), { position: [0, 0.13, 0] }); g.merge(Geometry.box(0.07, 0.12, 0.012, [0.42, 0.28, 0.18]), { position: [0, 0, 0.152] }); g.merge(Geometry.box(0.06, 0.16, 0.06, [0.6, 0.6, 0.62]), { position: [0.11, 0.3, -0.06] }); return g; })(),
    roof3: (() => { const g = new Geometry(); g.merge(Geometry.prism(0.44, 0.2, 0.36, W), { position: [0, 0.28, 0] }); return g; })(),
    win3: (() => { const g = new Geometry(); for (const x of [-0.1, 0.1]) { g.merge(Geometry.box(0.05, 0.06, 0.012, [1, 0.82, 0.45]), { position: [x, 0.17, 0.152] }); g.merge(Geometry.box(0.05, 0.06, 0.012, [1, 0.82, 0.45]), { position: [x, 0.17, -0.152] }); } g.merge(Geometry.box(0.05, 0.05, 0.012, [1, 0.82, 0.45]), { position: [0.1, 0.05, 0.152] }); return g; })(),
    // 산업: 벽돌집 + 공장 굴뚝
    wall4: (() => { const g = new Geometry(); g.merge(Geometry.box(0.36, 0.32, 0.3, [0.66, 0.34, 0.26])); for (let y = 0; y < 3; y++) g.merge(Geometry.box(0.37, 0.012, 0.31, [0.5, 0.26, 0.2]), { position: [0, 0.08 + y * 0.09, 0] }); g.merge(Geometry.box(0.07, 0.12, 0.012, [0.25, 0.22, 0.22]), { position: [0, 0, 0.152] }); g.merge(Geometry.cylinder(0.035, 0.045, 0.32, 6, [0.45, 0.25, 0.2]), { position: [0.12, 0.3, -0.08] }); return g; })(),
    roof4: (() => { const g = new Geometry(); g.merge(Geometry.box(0.38, 0.03, 0.32, [0.3, 0.3, 0.34]), { position: [0, 0.32, 0] }); g.merge(Geometry.box(0.38, 0.015, 0.05, W), { position: [0, 0.35, 0.13] }); return g; })(),
    win4: (() => { const g = new Geometry(); for (const x of [-0.12, 0, 0.12]) for (const y of [0.06, 0.18]) { if (x === 0 && y === 0.06) continue; g.merge(Geometry.box(0.05, 0.06, 0.012, [1, 0.85, 0.5]), { position: [x, y, 0.152] }); g.merge(Geometry.box(0.05, 0.06, 0.012, [1, 0.85, 0.5]), { position: [x, y, -0.152] }); } return g; })(),
    // 우주: 하얀 돔 + 유리 탑
    wall5: (() => { const g = new Geometry(); g.merge(Geometry.icosphere(0.2, 1, [0.92, 0.94, 0.97], { squashY: 0.75 })); g.merge(Geometry.cylinder(0.06, 0.07, 0.42, 6, [0.8, 0.84, 0.9]), { position: [0.14, 0, -0.08] }); g.merge(Geometry.box(0.07, 0.1, 0.03, [0.3, 0.35, 0.45]), { position: [0, 0, 0.19] }); return g; })(),
    roof5: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.205, 0.205, 0.03, 10, W), { position: [0, 0.03, 0] }); g.merge(Geometry.box(0.012, 0.16, 0.012, [0.7, 0.72, 0.78]), { position: [0.14, 0.42, -0.08] }); return g; })(),
    win5: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.072, 0.072, 0.03, 6, [0.4, 0.9, 1]), { position: [0.14, 0.3, -0.08] }); g.merge(Geometry.cylinder(0.072, 0.072, 0.03, 6, [0.4, 0.9, 1]), { position: [0.14, 0.18, -0.08] }); g.merge(Geometry.box(0.12, 0.03, 0.02, [0.4, 0.9, 1]), { position: [0, 0.1, 0.17] }); return g; })(),
    pad: (() => { const g = new Geometry(), c = [0.6, 0.6, 0.64]; g.merge(Geometry.box(0.5, 0.04, 0.5, c)); g.merge(Geometry.box(0.42, 0.012, 0.06, [0.95, 0.8, 0.2]), { position: [0, 0.04, 0.16] }); for (const [x, z] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.14], [0.14, -0.14]]) g.merge(Geometry.box(0.04, 0.04, 0.04, [0.3, 0.3, 0.34]), { position: [x, 0.04, z] }); for (let y = 0; y < 6; y++) g.merge(Geometry.box(0.07, 0.08, 0.07, y % 2 ? [0.85, 0.3, 0.25] : [0.75, 0.75, 0.78]), { position: [-0.19, 0.04 + y * 0.08, -0.19] }); g.merge(Geometry.box(0.16, 0.02, 0.02, [0.5, 0.5, 0.55]), { position: [-0.11, 0.4, -0.19] }); return g; })(),
    rocket: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.045, 0.05, 0.3, 8, [0.95, 0.95, 0.97])); g.merge(Geometry.cone(0.045, 0.1, 8, W), { position: [0, 0.3, 0] }); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.merge(Geometry.box(0.012, 0.08, 0.05, [0.3, 0.3, 0.35]), { position: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], rotation: [0, -a, 0] }); } g.merge(Geometry.cylinder(0.047, 0.047, 0.02, 8, [0.2, 0.2, 0.24]), { position: [0, 0.16, 0] }); return g; })(),
    cape: (() => { const g = new Geometry(); g.merge(Geometry.box(0.07, 0.1, 0.01, W), { position: [0, -0.005, -0.03], rotation: [0.12, 0, 0] }); return g; })(),
    hat: (() => { const g = new Geometry(); g.merge(Geometry.box(0.08, 0.012, 0.08, W), { position: [0, 0.07, 0] }); g.merge(Geometry.box(0.05, 0.03, 0.05, W), { position: [0, 0.085, 0] }); return g; })(),
    belt: (() => { const g = new Geometry(); g.merge(Geometry.box(0.076, 0.014, 0.052, [0.35, 0.24, 0.16])); g.merge(Geometry.box(0.016, 0.012, 0.004, [0.9, 0.78, 0.3]), { position: [0, 0, 0.027] }); return g; })(),
    toolHead: (() => { const g = new Geometry(); g.merge(Geometry.box(0.038, 0.02, 0.014, W), { position: [0.012, -0.17, 0.02] }); return g; })(),
    marker: (() => { const g = new Geometry(); g.merge(Geometry.box(0.14, 0.012, 0.035, W)); return g; })(),
    wall: (() => { const g = new Geometry(); g.merge(Geometry.box(0.3, 0.2, 0.26, [0.92, 0.86, 0.74])); g.merge(Geometry.box(0.06, 0.1, 0.012, [0.45, 0.3, 0.2]), { position: [0, 0, 0.13] }); return g; })(),
    roof: (() => { const g = new Geometry(); g.merge(Geometry.prism(0.36, 0.15, 0.32, W), { position: [0, 0.2, 0] }); return g; })(),
    win: (() => { const g = new Geometry(); g.merge(Geometry.box(0.05, 0.05, 0.012, [1, 0.82, 0.45]), { position: [0.08, 0.09, 0.131] }); g.merge(Geometry.box(0.05, 0.05, 0.012, [1, 0.82, 0.45]), { position: [-0.08, 0.09, -0.131] }); return g; })(),
    frame: (() => { const g = new Geometry(), c = [0.62, 0.46, 0.3]; for (const [x, z] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) g.merge(Geometry.box(0.02, 0.22, 0.02, c), { position: [x, 0, z] }); g.merge(Geometry.box(0.3, 0.02, 0.02, c), { position: [0, 0.2, 0.12] }); g.merge(Geometry.box(0.3, 0.02, 0.02, c), { position: [0, 0.2, -0.12] }); g.merge(Geometry.box(0.32, 0.02, 0.28, [0.55, 0.5, 0.45])); return g; })(),
    well: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.09, 0.09, 0.08, 8, [0.6, 0.6, 0.64])); g.merge(Geometry.cylinder(0.07, 0.07, 0.004, 8, [0.3, 0.55, 0.9]), { position: [0, 0.07, 0] }); g.merge(Geometry.box(0.015, 0.16, 0.015, [0.5, 0.36, 0.24]), { position: [-0.08, 0.06, 0] }); g.merge(Geometry.box(0.015, 0.16, 0.015, [0.5, 0.36, 0.24]), { position: [0.08, 0.06, 0] }); g.merge(Geometry.prism(0.22, 0.06, 0.12, [0.7, 0.32, 0.25]), { position: [0, 0.2, 0] }); return g; })(),
    pen: (() => { const g = new Geometry(), c = [0.62, 0.46, 0.3]; const n = 14; for (let i = 0; i < n; i++) { const a = i / n * 6.28, a2 = (i + 1) / n * 6.28, r = 0.38; g.merge(Geometry.box(0.016, 0.07, 0.016, c), { position: [Math.cos(a) * r, 0, Math.sin(a) * r] }); const mx = (Math.cos(a) + Math.cos(a2)) / 2 * r, mz = (Math.sin(a) + Math.sin(a2)) / 2 * r; g.merge(Geometry.box(0.17, 0.012, 0.008, c), { position: [mx, 0.05, mz], rotation: [0, -(a + a2) / 2 + Math.PI / 2, 0] }); } return g; })(),
    soil: (() => { const g = new Geometry(); g.merge(Geometry.box(0.46, 0.025, 0.36, W), { position: [0, -0.005, 0] }); for (let i = -2; i <= 2; i++) g.merge(Geometry.box(0.44, 0.01, 0.025, [0.82, 0.82, 0.82]), { position: [0, 0.02, i * 0.07] }); return g; })(),
    crop: (() => { const g = new Geometry(); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) g.merge(Geometry.cone(0.022, 0.08, 4, W), { position: [i * 0.085 + (j % 2) * 0.02, 0.01, j * 0.07] }); return g; })(),
    fire: (() => { const g = new Geometry(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; g.merge(Geometry.icosphere(0.025, 0, [0.55, 0.55, 0.58]), { position: [Math.cos(a) * 0.07, 0.01, Math.sin(a) * 0.07] }); } g.merge(Geometry.box(0.12, 0.02, 0.02, [0.4, 0.28, 0.18]), { position: [0, 0.015, 0], rotation: [0, 0.6, 0] }); g.merge(Geometry.box(0.12, 0.02, 0.02, [0.4, 0.28, 0.18]), { position: [0, 0.015, 0], rotation: [0, -0.6, 0] }); return g; })(),
    flame: (() => { const g = new Geometry(); g.merge(Geometry.cone(0.04, 0.1, 5, [1, 0.6, 0.2]), { position: [0, 0.02, 0] }); g.merge(Geometry.cone(0.022, 0.07, 5, [1, 0.9, 0.5]), { position: [0, 0.02, 0] }); return g; })(),
    pileLog: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.02, 0.02, 0.16, 6, [0.6, 0.42, 0.26]), { rotation: [Math.PI / 2, 0, 0], position: [0, 0.02, -0.08] }); return g; })(),
    pileRock: Geometry.icosphere(0.035, 0, [0.62, 0.62, 0.66], { jitter: 0.25, seed: 5 }),
    sack: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.035, 0.03, 0.06, 6, [0.85, 0.75, 0.5])); g.merge(Geometry.cone(0.02, 0.02, 5, [0.75, 0.62, 0.38]), { position: [0, 0.06, 0] }); return g; })(),
    barrel: (() => { const g = new Geometry(); g.merge(Geometry.cylinder(0.03, 0.03, 0.07, 7, [0.55, 0.4, 0.26])); g.merge(Geometry.cylinder(0.027, 0.027, 0.004, 7, [0.35, 0.6, 0.95]), { position: [0, 0.07, 0] }); return g; })(),
    grave: (() => { const g = new Geometry(); g.merge(Geometry.box(0.05, 0.07, 0.02, [0.6, 0.6, 0.64])); g.merge(Geometry.box(0.06, 0.012, 0.09, [0.4, 0.32, 0.25]), { position: [0, 0, 0.04] }); return g; })(),
    boulder: Geometry.icosphere(0.09, 1, [0.6, 0.6, 0.64], { jitter: 0.22, seed: 8, squashY: 0.75 }),
  };
  const M = {};
  const mk = (name, cap, mat = {}) => (M[name] = globe.add(new InstancedMesh(G[name], new Material(mat), cap)));
  const PC = CAP.human + 20;
  mk('leg', PC * 2); mk('torso', PC); mk('arm', PC * 2); mk('head', PC); mk('hairS', PC); mk('hairL', PC); mk('tool', PC);
  for (const k of ['log', 'rock', 'wheat', 'meat', 'bucket']) mk(k, PC);
  mk('sheep', CAP.sheep + 20); mk('wolf', CAP.wolf + 20);
  mk('wall', 800); mk('roof', 800); mk('win', 800, { outline: false });
  for (const e of [0, 1, 3, 4, 5]) { mk('wall' + e, 800); mk('roof' + e, 800); mk('win' + e, 800, { outline: false }); }
  mk('pad', 60); mk('rocket', 60);
  mk('cape', PC); mk('hat', PC); mk('belt', PC); mk('toolHead', PC); mk('marker', 3000, { outline: false, castShadow: false }); mk('frame', 100); mk('well', 100); mk('pen', 100);
  mk('soil', 1200); mk('crop', 1200); mk('fire', 120); mk('flame', 120, { outline: false, castShadow: false });
  mk('pileLog', 120 * 12); mk('pileRock', 120 * 12); mk('sack', 120 * 10); mk('barrel', 120 * 8);
  mk('grave', 420); mk('boulder', 800);

  const tmp = new Float32Array(16);
  const counts = {};
  const put = (name, mat, color = W, em = 0) => { const i = counts[name]++; if (i < M[name].capacity) M[name].setAt(i, mat, color, em); };
  const frameAt = (d, h, sr, scale = 1, lift = 0) => {
    const up = d, fw = v3.norm(v3.sub(h, v3.scale(up, v3.dot(h, up)))), rt = v3.cross(up, fw);
    return basisMatrix(rt, up, fw, v3.scale(d, sr + lift), scale);
  };
  const frameRot = (d, rot, sr, scale = 1) => {
    const f = tangentFrame(d);
    const fw = v3.add(v3.scale(f.u, Math.cos(rot)), v3.scale(f.e, Math.sin(rot)));
    return frameAt(d, fw, sr, scale);
  };
  const local = (base, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => m4.multiply(base, m4.fromTRS([x, y, z], [rx, ry, rz], [s, s, s]));

  function drawPerson(p, time, big) {
    const child = p.age < 14, baby = p.age < 2.5;
    let base;
    const scale = (baby ? 0.42 : child ? lerp(0.55, 0.92, (p.age - 2.5) / 11.5) : 1) * big;
    if (baby) {
      const m = p.carriedBy;
      if (!m || m.inside) return;
      const mb = frameAt(m.d, m.h, m.sr, big);
      base = m4.multiply(mb, m4.fromTRS([0.0, 0.12, 0.05], [0, 0, 0], [scale / big, scale / big, scale / big]));
    } else {
      const bob = p.moving ? Math.abs(Math.sin(p.phase * 2)) * 0.01 : 0;
      base = frameAt(p.d, p.h, p.sr - 0.01, scale, bob * scale);
      if (p.age > 62) base = local(base, 0, 0, 0, 0.18);
    }
    const sick = p.stress > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(time * 6)) : 1;
    const era = p.tribe?.era ?? 0;
    // 석기: 가죽옷, 청동기: 물들인 삼베, 철기: 부족색 옷 + 허리띠, 중세: 밝은 옷 + 망토 + 모자
    const hide = [0.55 + (p.id % 3) * 0.05, 0.4, 0.27];
    const clothes = era === 0 ? v3.lerp(hide, p.shirt, 0.12) : era === 1 ? v3.lerp([0.72, 0.64, 0.5], p.shirt, 0.45) : era === 2 ? p.shirt
      : era === 3 ? v3.lerp(p.shirt, [1, 1, 1], 0.12) : era === 4 ? v3.lerp([0.28, 0.28, 0.32], p.shirt, 0.35) : v3.lerp([0.93, 0.95, 0.98], p.shirt, 0.18);
    const pants = era === 0 ? shade(p.skin, 0.92) : era === 1 ? [0.5, 0.4, 0.3] : era === 4 ? [0.22, 0.22, 0.26] : era === 5 ? [0.85, 0.87, 0.92] : p.pants;
    const skin = shade(p.skin, sick), shirt = shade(clothes, sick);
    const hair = p.age > 55 ? [0.85, 0.85, 0.88] : p.hair;
    // 걷기/일하기 애니메이션
    const walk = p.moving ? Math.sin(p.phase) * 0.7 : 0;
    const carrying = !!p.carry || p.kids.some((k) => k.alive && k.age < 2.5 && k.carriedBy === p);
    const working = p.working;
    const swing = working ? Math.sin(time * 9 + p.id) : 0;
    const bend = working && (p.job === 'farm' || p.job === 'water') ? 0.35 + swing * 0.1 : 0;
    const body = bend ? local(base, 0, 0.09, 0, bend) : local(base, 0, 0.09, 0);
    if (!baby) {
      put('leg', local(base, -0.018, 0.09, 0, walk), pants);
      put('leg', local(base, 0.018, 0.09, 0, -walk), pants);
    }
    put('torso', local(body, 0, 0.047, 0), shirt);
    if (era >= 2 && !baby) put('belt', local(body, 0, 0.012, 0));
    if (era === 3 && p.age >= 14) put('cape', local(body, 0, 0.06, 0, p.moving ? 0.25 : 0.05), shade(p.tribe.color, 0.6));
    let armL = -walk * 0.8, armR = walk * 0.8;
    if (carrying) { armL = armR = -1.2; }
    if (working && !carrying) {
      if (p.job === 'wood' || p.job === 'stone' || p.job === 'build' || p.job === 'warrior') { armR = -2.4 + swing * 1.1; armL = -0.5 + swing * 0.4; }
      else { armR = -0.9 + swing * 0.5; armL = -0.7 - swing * 0.4; }
    }
    put('arm', local(body, -0.047, 0.09, 0, armL), shirt);
    const rArm = local(body, 0.047, 0.09, 0, armR);
    put('arm', rArm, shirt);
    if (working && !carrying && (p.job === 'wood' || p.job === 'stone' || p.job === 'farm' || p.job === 'build' || p.job === 'warrior')) {
      put('tool', rArm);
      put('toolHead', era >= 3 ? m4.multiply(rArm, m4.fromTRS([0, -0.02, 0], [0, 0, 0], [1.3, 1.3, 1.3])) : rArm, ERAS[era].tool, era === 5 ? 0.9 : era === 3 ? 0.15 : 0);
    }
    const head = local(body, 0, 0.096, 0);
    put('head', head, skin);
    put(p.longHair ? 'hairL' : 'hairS', head, hair);
    if (era === 4 && p.age >= 14 && p.id % 2 === 0) put('hat', head, [0.2, 0.2, 0.24]);
    if (era === 3 && p.age >= 14 && (p.job === 'warrior' || p.job === 'farm' || p.id % 3 === 0)) put('hat', head, p.job === 'warrior' ? [0.75, 0.76, 0.8] : p.job === 'farm' ? [0.9, 0.78, 0.45] : shade(p.tribe.color, 0.8));
    if (p.carry) {
      const c = p.carry, t = c.type === 'water' ? 'bucket' : c.type;
      if (t === 'log') put('log', local(body, -0.1, 0.1, 0.02, 0, 0, 0.15));
      else put(t, local(body, 0, 0.05, 0.07));
    }
  }

  function sync(time, view) {
    for (const k in M) counts[k] = 0;
    const far = 1 - smoothstep(0.1, 0.75, view.zoom);
    const bigP = 1 + far * 2.4, bigB = 1 + far * 2;
    for (const p of people) {
      if (!p.alive || (p.inside && p.age >= 2.5)) continue;
      if (p.moving) p.phase += 0.16 * (p.running ? 1.6 : 1);
      p.moving = false;
      drawPerson(p, time, bigP);
    }
    for (const a of animals) {
      if (!a.alive) continue;
      const bob = a.moving ? Math.abs(Math.sin(time * 12 + a.phase)) * 0.008 : a.grazing ? 0 : 0;
      const s = (a.age < 1 ? 0.6 : 1) * bigP;
      let m = frameAt(a.d, a.h, a.sr - 0.01, s, bob);
      if (a.grazing && a.kind === 'sheep') m = local(m, 0, 0, 0, 0.12 + Math.sin(time * 3 + a.phase) * 0.05);
      put(a.kind, m);
      a.moving = false;
    }
    for (const v of villages) {
      const c = v.tribe.color;
      const night = isNight(v.d);
      for (const h of v.houses) {
        const m = frameRot(h.d, h.rot, h.sr - 0.02, bigB);
        const burnt = h.hp < 1 ? 0.4 + h.hp * 0.6 : 1;
        const e = h.era ?? 0, B = [burnt, burnt, burnt];
        const lit = night && h.family.some((p) => p.inside) ? 1 : 0;
        const wcol = lit ? [1, 1, 1] : [0.35, 0.3, 0.28];
        if (e === 0) { put('wall0', local(m, 0, 0.045, 0), B); put('roof0', m, B); put('win0', m, wcol, lit * 0.9); }
        else if (e === 1) { put('wall1', local(m, 0, 0.022, 0), B); put('roof1', m, v3.lerp(B, shade(c, burnt), 0.15)); put('win1', m, wcol, lit * 0.9); }
        else if (e === 2) { put('wall', local(m, 0, 0.1, 0), B); put('roof', m, shade(c, burnt)); put('win', m, wcol, lit * 0.95); }
        else if (e === 4) { put('wall4', local(m, 0, 0.16, 0), B); put('roof4', m, shade(c, burnt)); put('win4', m, lit ? [1, 1, 1] : [0.4, 0.42, 0.48], lit * 0.95); if (rand() < 0.06) fx.emit({ position: m4.transformPoint(m, [0.12, 0.62, -0.08]), velocity: v3.scale(h.d, 0.4), life: 2, size: 2, sizeEnd: 4, color: [0.45, 0.43, 0.45], colorEnd: [0.3, 0.3, 0.32], gravity: -0.05, fadeIn: 0.1 }); }
        else if (e === 5) { put('wall5', m, B); put('roof5', m, shade(c, burnt)); put('win5', m, [1, 1, 1], night ? 1 : 0.5); }
        else { put('wall3', local(m, 0, 0.14, 0), B); put('roof3', m, shade(c, burnt * 0.85)); put('win3', m, wcol, lit * 0.95); if (lit && rand() < 0.05) fx.emit({ position: m4.transformPoint(m, [0.11, 0.48, -0.06]), velocity: v3.scale(h.d, 0.3), life: 1.5, size: 2, sizeEnd: 3, color: [0.75, 0.75, 0.78], gravity: -0.05, fadeIn: 0.1 }); }
        if (h.upgrading) put('frame', local(m, 0, 0.11, 0));
      }
      for (const s of v.sites) {
        const m = frameRot(s.d, s.rot, s.sr - 0.02, bigB);
        if (s.type === 'upgrade') { /* 기존 집 위에 뼈대만 (위에서 그림) */ }
        else if (s.type === 'house') {
          const e = v.tribe.era, wn = e === 2 ? 'wall' : 'wall' + e, rn = e === 2 ? 'roof' : 'roof' + e;
          const wy = e === 0 ? 0.045 : e === 1 ? 0.022 : e === 2 ? 0.1 : e === 3 ? 0.14 : e === 4 ? 0.16 : 0;
          put('frame', local(m, 0, 0.11, 0));
          if (s.progress > 0.05) put(wn, m4.multiply(m, m4.fromTRS([0, wy * s.progress, 0], [0, 0, 0], [1, s.progress, 1])), [0.9, 0.9, 0.9]);
          if (s.progress > 0.8) put(rn, local(m, 0, 0, 0), e >= 2 ? shade(c, 0.7) : [0.8, 0.8, 0.8]);
        } else if (s.type === 'pad') put('pad', m4.multiply(m, m4.fromTRS([0, 0, 0], [0, 0, 0], [1, Math.max(0.2, s.progress), 1])));
        else if (s.type === 'well') put('well', m4.multiply(m, m4.fromTRS([0, 0, 0], [0, 0, 0], [1, Math.max(0.15, s.progress), 1])));
        else put('pen', m4.multiply(m, m4.fromTRS([0, 0, 0], [0, 0, 0], [1, Math.max(0.15, s.progress), 1])));
        // 쌓인 재료
        for (let i = 0; i < Math.min(4, s.got.wood - Math.floor(s.progress * s.need.wood)); i++) put('pileLog', local(m, 0.2, 0.01 + i * 0.03, -0.1));
      }
      if (v.well) put('well', frameRot(v.well.d, v.well.rot, v.well.sr - 0.02, bigB));
      if (v.pen) put('pen', frameRot(v.pen.d, 0, v.pen.sr - 0.02, bigB));
      if (v.pad) {
        const pm = frameRot(v.pad.d, v.pad.rot, v.pad.sr - 0.02, bigB);
        put('pad', pm);
        const flying = rockets.find((r) => r.pad === v.pad);
        if (flying) put('rocket', m4.multiply(frameRot(v.pad.d, v.pad.rot, v.pad.sr + 0.02 + flying.alt, bigB * (1 + Math.min(1, flying.alt / 6) * 3)), m4.fromTRS([0, 0.03, 0], [0, 0, 0], [1, 1, 1])), shade(c, 1), 0);
        else if (simTime > (v.nextLaunch || 0) - DAY * 0.25) put('rocket', local(pm, 0, 0.05, 0), c); // 다음 발사 대기
      }
      for (const f of v.fields) {
        const m = frameRot(f.d, f.rot, f.sr - 0.015, bigB);
        const soil = f.stage === 0 ? [0.55, 0.45, 0.3] : f.wet > 0 ? [0.36, 0.25, 0.17] : [0.48, 0.34, 0.22];
        put('soil', m, soil);
        if (f.stage >= 2) {
          const g = f.stage === 3 ? 1 : f.growth;
          const col = f.stage === 3 ? [0.98, 0.82, 0.3] : v3.lerp([0.45, 0.8, 0.3], [0.78, 0.82, 0.3], smoothstep(0.6, 1, g));
          put('crop', m4.multiply(m, m4.fromTRS([0, 0, 0], [0, 0, 0], [1, 0.2 + g * 1.4, 1])), col);
        }
      }
      // 마을 경계: 부족색 점선 고리
      const rad = villageRadius(v);
      if (!v.ring || Math.abs(v.ring.r - rad) > 0.15) {
        const n = Math.max(16, Math.round(rad * 9)), pts = [];
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          const d = offsetDir(v.d, Math.cos(a) * rad, Math.sin(a) * rad);
          if (isWater(d)) continue;
          pts.push({ d, sr: srOf(d), rot: a });
        }
        v.ring = { r: rad, pts };
      }
      for (const q of v.ring.pts) put('marker', frameRot(q.d, q.rot, q.sr - 0.004, bigB), c, 0.35);
      // 모닥불 + 창고
      const vm = frameRot(v.d, 0, v.sr - 0.02, bigB);
      put('fire', vm);
      const fl = 0.8 + Math.sin(time * 13 + v.id) * 0.2;
      put('flame', m4.multiply(vm, m4.fromTRS([0, 0, 0], [0, time * 2, 0], [fl, 0.7 + fl * 0.5, fl])), [1, 1, 1], night ? 1 : 0.6);
      if (rand() < 0.08) fx.emit({ position: surf(v.d, 0.1 * bigB), velocity: v3.scale(v.d, 0.5 + rand() * 0.4), life: 0.6, size: 1, color: [1, 0.7, 0.3], colorEnd: [1, 0.3, 0.1], emissive: 1, gravity: -0.1 });
      const piles = [['wood', 'pileLog', 2], ['stone', 'pileRock', 2], ['food', 'sack', 3], ['water', 'barrel', 3]];
      for (const [kind, mesh, per] of piles) {
        const n = Math.min(12, Math.ceil(v.store[kind] / per));
        const pm = frameRot(storeSpot(v, kind), 0, v.sr - 0.02, bigB);
        for (let i = 0; i < n; i++) {
          if (mesh === 'pileLog') put(mesh, local(pm, (i % 3) * 0.045 - 0.045, Math.floor(i / 3) * 0.038, 0));
          else if (mesh === 'pileRock') put(mesh, local(pm, ((i % 4) - 1.5) * 0.045, Math.floor(i / 4) * 0.04, ((i * 7) % 3 - 1) * 0.03));
          else put(mesh, local(pm, ((i % 3) - 1) * 0.07, 0, (Math.floor(i / 3) - 1) * 0.07));
        }
      }
    }
    for (const g of graves) put('grave', frameRot(g.d, g.rot, g.sr - 0.01, bigB));
    for (const r of rocks) { const s = (0.5 + 0.5 * r.amt / r.max) * r.s; put('boulder', frameRot(r.d, r.rot, r.sr - 0.02, s)); }
    for (const k in M) M[k].count = Math.min(counts[k], M[k].capacity);
  }

  // ------------------------------------------------------------------
  // 공개 함수
  // ------------------------------------------------------------------
  function seedTribe(d, { adults = 6, kids = 2, stock = {}, houses = 2 } = {}) {
    const tribe = newTribe();
    tribe.skin = pick(SKIN);
    const v = foundVillage(tribe, d, { quiet: true, stock: { food: 30, water: 16, wood: 4, stone: 1, ...stock } });
    for (let i = 0; i < houses; i++) { const s = addSite(v, 'house'); if (s) completeSite(s); }
    const list = [];
    for (let i = 0; i < adults; i++) list.push(makePerson({ d: jitterDir(d, 0.5), tribe, village: v, sex: i % 2 ? 'f' : 'm', age: 18 + rand() * 18 }));
    for (let i = 0; i + 1 < list.length; i += 2) { list[i].partner = list[i + 1]; list[i + 1].partner = list[i]; }
    for (let i = 0; i < kids; i++) {
      const mom = list[1 + 2 * (i % Math.floor(adults / 2))];
      const k = makePerson({ d: jitterDir(d, 0.4), tribe, village: v, mother: mom, father: mom.partner, age: 3 + rand() * 8 });
      mom.kids.push(k); mom.partner.kids.push(k);
    }
    addField(v); addField(v);
    waterSource(v);
    if (!v.waterSpot || distU(v.waterSpot, v.d) > 1.8) { const w = addSite(v, 'well'); if (w) completeSite(w); }
    // 마을 근처 바위 몇 개
    for (let i = 0; i < 4; i++) { const rd = findSpot(v, 1.8, 3.2, 0.12); if (rd) rocks.push({ d: rd, sr: srOf(rd), amt: 10, max: 12, rot: rand() * 6.28, s: 1.1, reserved: null }); }
    rockHash.rebuild(rocks);
    return v;
  }
  function dropPeople(d, n = 4) {
    const near = villages.find((v) => distU(v.d, d) < 4);
    const tribe = near ? near.tribe : newTribe();
    if (!near) tribe.skin = pick(SKIN);
    for (let i = 0; i < n; i++) makePerson({ d: jitterDir(d, 0.3), tribe, village: near || null, sex: i % 2 ? 'f' : 'm', age: 18 + rand() * 14 });
    if (!near) say(`${tribe.name}이 나타났어요`, 'civ');
    sparkle(d, tribe.color);
    return tribe;
  }
  function dropAnimals(kind, d, n) { for (let i = 0; i < n; i++) if (countKind(kind) < CAP[kind]) makeAnimal(kind, jitterDir(d, 0.4)); }
  function damage(d, r) {
    for (const p of peopleHash.query(d, r)) killPerson(p, 'meteor');
    for (const p of people) if (p.inside && p.home && distU(p.home.d, d) < r) killPerson(p, 'meteor');
    for (const a of animalHash.query(d, r)) killAnimal(a, 'meteor');
    for (const v of villages) {
      for (const h of v.houses.slice()) if (distU(h.d, d) < r) destroyHouse(v, h);
      v.sites = v.sites.filter((s) => distU(s.d, d) >= r || (s.type === 'upgrade' && !s.house.dead));
      v.fields = v.fields.filter((f) => distU(f.d, d) >= r);
      if (v.well && distU(v.well.d, d) < r) v.well = null;
      if (v.pen && distU(v.pen.d, d) < r) v.pen = null;
      if (distU(v.d, d) < r) { v.store.wood = v.store.stone = 0; v.store.food *= 0.2; v.store.water *= 0.2; }
    }
    for (let i = rocks.length - 1; i >= 0; i--) if (distU(rocks[i].d, d) < r * 0.7) rocks.splice(i, 1);
    rockHash.rebuild(rocks);
  }
  function pickAt(d) {
    const p = peopleHash.nearest(d, 0.45, (o) => o.alive && !o.inside) || people.find((o) => o.alive && o.age < 2.5 && o.carriedBy && distU(o.carriedBy.d, d) < 0.3);
    if (p) return { person: p };
    const v = villages.slice().sort((a, b) => distU(a.d, d) - distU(b.d, d))[0];
    if (v && distU(v.d, d) < 3) return { village: v };
    return null;
  }
  function describePerson(p) {
    const age = Math.floor(p.age);
    const sex = p.sex === 'f' ? '여' : '남';
    const fam = [];
    if (p.partner?.alive) fam.push(`${p.sex === 'f' ? '남편' : '아내'} ${p.partner.name}`);
    const kids = p.kids.filter((k) => k.alive);
    if (kids.length) fam.push(`아이 ${kids.length}명`);
    if (p.pregnant > 0) fam.push('임신 중');
    const bar = (x) => (x > 1 ? '매우 ' : x > 0.6 ? '' : null);
    const needs = [];
    if (bar(p.hunger) !== null) needs.push(`${bar(p.hunger)}배고픔`);
    if (bar(p.thirst) !== null) needs.push(`${bar(p.thirst)}목마름`);
    return {
      title: `${p.name} (${sex}, ${age}세) · ${JOB_NAMES[p.job] || ''}`,
      sub: [p.state, p.village ? `${p.tribe.name}` : '마을 없음', ...fam, ...needs].filter(Boolean).join(' · '),
    };
  }
  function villageRadius(v) {
    let r = 1.2;
    for (const s of [...v.houses, ...v.fields, ...v.sites]) r = Math.max(r, distU(s.d, v.d) + 0.45);
    if (v.pen) r = Math.max(r, distU(v.pen.d, v.d) + 0.6);
    return Math.min(r, 4.5);
  }
  function describeVillage(v) {
    const s = v.store, f = (x) => Math.floor(x);
    return {
      title: `${v.name} (${v.tribe.name}, ${ERAS[v.tribe.era].name}) · 인구 ${v.pop || 0} · 집 ${v.houses.length}${v.well ? ' · 우물' : ''}${v.pen ? ' · 양 우리' : ''}`,
      sub: `나무 ${f(s.wood)} · 돌 ${f(s.stone)} · 식량 ${f(s.food)} · 물 ${f(s.water)} · 밭 ${v.fields.length}${v.sites.length ? ` · 짓는 중 ${v.sites.map((x) => BUILD[x.type].name).join(', ')}` : ''}${v.tribe.war.size ? ' · 전쟁 중' : ''}`,
    };
  }

  return {
    tick, moveAll, sync, seedTribe, seedRocks, dropPeople, dropAnimals, damage, declareWar, pickAt, describePerson, describeVillage,
    setSun(s) { sunDir = s; },
    setAggression(a) { aggression = a; },
    allWar() { const live = tribes.filter((t) => t.alive); for (const a of live) for (const b of live) if (a.id < b.id) declareWar(a, b); },
    peace() { for (const t of tribes) t.war.clear(); for (const p of people) if (p.job === 'warrior') p.job = 'none'; say('모든 부족이 평화 조약을 맺었어요', 'peace'); },
    warNear(d) {
      const v = villages.slice().sort((a, b) => distU(a.d, d) - distU(b.d, d))[0];
      if (!v || distU(v.d, d) > 4) return say('마을 근처를 눌러 주세요', 'warn');
      let any = false;
      for (const o of tribes) if (o !== v.tribe && o.alive && o.villages.some((ov) => v.tribe.villages.some((tv) => distU(ov.d, tv.d) < 25))) { declareWar(v.tribe, o); any = true; }
      if (!any) say(`${v.tribe.name} 근처에 싸울 상대가 없어요`, 'warn');
    },
    reset() { people.length = 0; animals.length = 0; villages.length = 0; tribes.length = 0; graves.length = 0; tribeCounter = 0; selected = null; },
    drownCheck() { for (const p of people) if (isWater(p.d)) killPerson(p, 'drown'); for (const a of animals) if (isWater(a.d)) killAnimal(a, 'drown'); },
    select(p) { selected = p; },
    get selected() { return selected?.alive ? selected : null; },
    stats() {
      let sheep = 0, wolves = 0;
      for (const a of animals) if (a.kind === 'sheep') sheep++; else wolves++;
      return { humans: people.length, sheep, wolves, villages: villages.length, tribes: tribes.filter((t) => t.alive).length, wars: tribes.reduce((n, t) => n + t.war.size, 0) / 2, year: Math.floor(simTime / DAY) };
    },
    deathLog, people, villages, animals, tribes, villageRadius, rockets, addTech, ERAS,
    killAt(d, r) { damage(d, r); },
    eraName: (t) => ERAS[t.era].name,
  };
}
