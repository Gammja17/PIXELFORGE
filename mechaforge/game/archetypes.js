// 기체 계열: 격납고에서 고르는 시작 성향. 계열마다 시작 장비 하나와 고유 규칙 하나가 있다.
//  규칙은 다른 모듈을 고치지 않고 감싸서 붙인다 (runhooks.js 와 같은 방식)
//   striker 강습: 대시로 적을 꿰뚫어 베고, 대시 중 처치하면 대시가 바로 찬다
//   siege   포격: 멈춰 서면 거치 모드. 자동 무기 연사와 사거리가 오른다
//   carrier 모함: 처치할수록 호위 드론이 늘고, 드론이 대신 맞아 준다
//   bulwark 중장: 맞을 때마다 반격 충격파, 체력이 낮을수록 화력이 오른다

import { Geometry, Material, InstancedMesh, m4 } from '../engine/index.js';
import { PIX } from './icons.js';

export const ARCHETYPES = {
  striker: {
    name: '강습', tag: 'STRIKER', icon: 'a_striker', color: [0.45, 0.85, 1],
    rule: '돌파 대시', ruleDesc: '대시로 적을 꿰뚫고 베어 낸다. 대시 중에 처치하면 대시가 바로 다시 찬다',
    kitText: '대시 +1회', kit: [], stats: { mul: { dashCd: 0.85, maxHp: 0.9 }, add: { dashCharges: 1 } },
    flaw: '최대 체력 -10%',
  },
  siege: {
    name: '포격', tag: 'SIEGE', icon: 'a_siege', color: [1, 0.62, 0.25],
    rule: '거치 포격', ruleDesc: '멈춰 서면 다리를 박고 거치 모드: 자동 무기 연사 +50%, 사거리 +20%, 방어 +2. 움직이면 풀린다',
    kitText: '전차 포신 장착', kit: [['weapon', 'cannon']], stats: { mul: { speed: 0.92 }, add: {} },
    flaw: '기동 -8%',
  },
  carrier: {
    name: '모함', tag: 'CARRIER', icon: 'a_carrier', color: [0.45, 1, 0.8],
    rule: '호위 편대', ruleDesc: '적 18기를 처치할 때마다 호위 드론 1기 (최대 5). 드론은 알아서 쏘고, 내가 맞으면 하나가 몸으로 막아 피해를 60% 줄인다',
    kitText: '판넬 비트 장착, 드론 1기로 시작', kit: [['weapon', 'funnel']], stats: { mul: { maxHp: 0.92 }, add: {} },
    flaw: '최대 체력 -8%', unlock: { text: '출격 2회', chip: '출격 2회', test: (g) => (g.meta.data.life?.runs || 0) >= 2 },
  },
  bulwark: {
    name: '중장', tag: 'BULWARK', icon: 'a_bulwark', color: [1, 0.4, 0.35],
    rule: '반격 장갑', ruleDesc: '맞을 때마다 주변으로 반격 충격파. 체력이 낮을수록 화력이 오른다 (최대 +50%)',
    kitText: '복합 장갑판 Lv1', kit: [['module', 'armor']], stats: { mul: { speed: 0.9, dmgTaken: 0.88 }, add: {} },
    flaw: '기동 -10%', unlock: { text: '방 6개 돌파', chip: '깊이 6', test: (g) => (g.best?.depth || 0) >= 6 },
  },
};
export const ARCH_IDS = Object.keys(ARCHETYPES);
export const archUnlocked = (g, id) => !ARCHETYPES[id]?.unlock || ARCHETYPES[id].unlock.test(g);

Object.assign(PIX, {
  a_striker: ['....cc....', '...cccc...', '..c.cc.c..', '....cc....', '.c..cc..c.', 'cc..cc..cc', '.c..cc..c.', '....cc....', '...c..c...', '..c....c..'],
  a_siege:   ['......oo..', '.....oo...', '....oo....', '..#oo#....', '.######...', '.#dddd#...', '.######...', '..#..#....', '.##..##...', '..........'],
  a_carrier: ['g......g..', '.g....g...', '..gggg....', '..g##g....', '.g####g...', '..g##g....', '..gggg....', '.g....g...', 'g......g..', '..........'],
  a_bulwark: ['.rrrrrrr..', '.r#####r..', '.r#rrr#r..', '.r#r#r#r..', '.r#rrr#r..', '.r#####r..', '..r###r...', '...r#r....', '....r.....', '..........'],
});

// 능력치 덧씌우기 (계열 고정치 + 거치/분노 같은 상태)
export function archStatMods(id, p = null) {
  const A = ARCHETYPES[id] || ARCHETYPES.striker, mul = { ...A.stats.mul }, add = { ...A.stats.add };
  if (p && id === 'siege' && p.siege) { mul.rateMul = (mul.rateMul || 1) * 1.5; mul.rangeMul = (mul.rangeMul || 1) * 1.2; add.armor = (add.armor || 0) + 2; }
  if (p && id === 'bulwark' && p.stats?.maxHp) { const k = 1 - Math.max(0, p.hp) / p.stats.maxHp; mul.dmgMul = (mul.dmgMul || 1) * (1 + 0.5 * Math.max(0, k)); }
  return { mul, add };
}

const wrap = (obj, name, fn) => { const orig = obj[name].bind(obj); obj[name] = (...a) => fn(orig, ...a); };
const rr = (a, b) => a + (b - a) * Math.random();

export function installArchetypes(game) {
  const { player: p, enemies: en, fx } = game;
  const arch = () => (game.state === 'hangar' ? null : game.arch || 'striker');

  // 능력치: 계열 배율
  wrap(p, 'refreshStats', (orig) => {
    orig();
    const id = game.arch || 'striker', { mul, add } = archStatMods(id, p);
    for (const k in mul) p.stats[k] *= mul[k];
    for (const k in add) p.stats[k] += add[k];
    p.stats.maxHp = Math.max(1, Math.round(p.stats.maxHp));
    p.hp = Math.min(p.hp, p.stats.maxHp);
  });

  // ---- 호위 드론 (모함) ----
  const dg = new Geometry();
  dg.merge(Geometry.box(0.34, 0.16, 0.34, [0.85, 0.9, 0.95]));
  dg.merge(Geometry.box(0.7, 0.06, 0.14, [0.3, 0.32, 0.4]), { position: [0, 0.02, 0] });
  dg.merge(Geometry.box(0.16, 0.08, 0.16, [0.45, 1, 0.8]), { position: [0, 0.1, 0.06] });
  const droneMesh = game.scene.add(new InstancedMesh(dg, new Material({ outline: true, castShadow: true }), 6));
  game.escorts = [];

  wrap(en, 'kill', (orig, e) => {
    const was = e.dead || e._killed;
    orig(e);
    if (was || game.state !== 'play') return;
    const a = arch();
    if (a === 'striker' && (p.dashT > 0 || p.dashGrace > 0) && p._refund !== p.dashId && p.charges < p.stats.dashCharges) {
      p._refund = p.dashId; p.charges++;
      fx.ring(p.x, 0.12, p.z, 1.2, [0.45, 0.85, 1], 0.16);
      game.sfx.play('ready', { vol: 0.35, pitch: 1.6 });
    }
    if (a === 'carrier') {
      game.escortKills = (game.escortKills || 0) + 1;
      if (game.escortKills >= 18) { game.escortKills = 0; addEscort(); }
    }
  });
  const addEscort = () => {
    if (game.escorts.length >= 5) return;
    const d = { a: Math.random() * 6.28, cd: 0.3, x: p.x, z: p.z, y: 1.6, t: 0 };
    game.escorts.push(d);
    fx.rise(p.x, p.z, 0.8, [0.45, 1, 0.8], 12);
    game.sfx.play('drone', { vol: 0.5 });
  };

  // 피격: 모함은 드론이 막고, 중장은 반격
  wrap(p, 'hurt', (orig, dmg, dx, dz) => {
    const a = arch();
    let saved = null;
    if (a === 'carrier' && game.escorts.length && p.invuln <= 0 && p.dashT <= 0) { saved = game.escorts.pop(); dmg *= 0.4; }
    const hit = orig(dmg, dx, dz);
    if (saved) {
      if (hit) { fx.explosion(saved.x, saved.y, saved.z, 0.6, { color: [0.45, 1, 0.8], scorch: false }); game.ui.toast('호위 드론이 대신 맞았다'); }
      else game.escorts.push(saved);
    }
    if (hit && a === 'bulwark' && game.state === 'play') {
      const r = 3.8 * p.stats.areaMul;
      const prev = game.dmgSrc; game.dmgSrc = 'counter';
      en.blast(p.x, p.z, r, (30 + game.level * 4) * p.stats.dmgMul * (1 + Math.max(0, game.rooms.depth) * 0.2), false, 0.08);
      game.dmgSrc = prev;
      fx.after(0.08, () => { fx.ring(p.x, 0.12, p.z, r, [1, 0.4, 0.35], 0.22); fx.impact([p.x, 1.2, p.z], [1, 0.45, 0.35], 1.2); });
    }
    if (hit && a === 'bulwark') p.refreshStats();
    return hit;
  });
  wrap(p, 'heal', (orig, v) => { orig(v); if (arch() === 'bulwark') p.refreshStats(); });

  // 매 프레임 규칙
  game.archUpdate = (dt) => {
    const a = arch();
    // 강습: 대시로 꿰뚫기
    p.dashGrace = Math.max(0, (p.dashGrace || 0) - dt);
    if (a === 'striker' && p.dashT > 0) {
      p.dashGrace = 0.2;
      en.each(p.x, p.z, 1.3 * (p.size || 1), (e) => {
        if (e._dashCut === p.dashId || e.dead || e.spawnT < 0.2) return;
        e._dashCut = p.dashId;
        const prev = game.dmgSrc; game.dmgSrc = 'dash';
        en.hit(e, (16 + game.level * 2.5) * p.stats.dmgMul * (1 + Math.max(0, game.rooms.depth) * 0.2), p.dashDir[0], p.dashDir[1], 8, { stun: 0.35 });
        game.dmgSrc = prev;
        fx.slashArc(e.x, 1, e.z, 0.7, Math.atan2(p.dashDir[0], p.dashDir[1]) - 2.4, 1.6, [0.45, 0.85, 1], 0.12, 1, 1);
        game.sfx.play('hit', { pitch: 1.3, vol: 0.5 });
      });
    }
    // 포격: 멈춰 서면 거치
    if (a === 'siege') {
      const still = p.moveMag < 0.2 && p.dashT <= 0;
      p.stillT = still ? (p.stillT || 0) + dt : 0;
      const want = p.stillT > 0.35;
      if (want !== !!p.siege) {
        p.siege = want; p.refreshStats();
        if (want) { game.sfx.play('clank', { pitch: 0.7 }); fx.ring(p.x, 0.12, p.z, 1.6, [1, 0.62, 0.25], 0.18); for (let i = 0; i < 4; i++) fx.dust(p.x, p.z, 2); }
      }
      if (p.siege && (game.frame & 3) === 0) for (let i = 0; i < 4; i++) { const q = (i / 4) * 6.28 + 0.78 + p.yaw; fx.pxr.emit({ position: [p.x + Math.sin(q) * 1.1, 0.08, p.z + Math.cos(q) * 1.1], velocity: [0, 0, 0], life: 0.07, size: 2, sizeEnd: 2, ramp: [[1, 0.62, 0.25]], emissive: 0.6, hard: true }); }
    } else if (p.siege) { p.siege = false; p.refreshStats(); }
    // 모함: 드론 비행과 사격
    let n = 0;
    if (a === 'carrier' && game.state === 'play') {
      const N = game.escorts.length;
      game.escorts.forEach((d, i) => {
        d.t += dt; d.a += dt * 1.6;
        const ang = d.a * 0 + game.time * 1.6 + (i / N) * 6.28, tx = p.x + Math.sin(ang) * 1.9, tz = p.z + Math.cos(ang) * 1.9;
        d.x += (tx - d.x) * Math.min(1, dt * 8); d.z += (tz - d.z) * Math.min(1, dt * 8); d.y = 1.7 + Math.sin(game.time * 4 + i) * 0.12;
        d.cd -= dt * p.stats.rateMul;
        if (d.cd <= 0) {
          const t = en.nearest(d.x, d.z, 9);
          if (t) {
            d.cd = 0.55;
            const yaw = Math.atan2(t.x - d.x, t.z - d.z);
            game.shots.add({ x: d.x, y: d.y - 0.3, z: d.z, vx: Math.sin(yaw) * 26, vz: Math.cos(yaw) * 26, dmg: (6 + game.level * 0.8) * p.stats.dmgMul * (1 + Math.max(0, game.rooms.depth) * 0.15), life: 0.45, pierce: 0, color: [0.45, 1, 0.8], scale: [0.1, 0.1, 0.5], knock: 1.5, quiet: true, src: 'escort' });
            fx.muzzle([d.x, d.y - 0.3, d.z], [Math.sin(yaw), 0, Math.cos(yaw)], [0.45, 1, 0.8], 0);
            d.yaw = yaw;
          } else d.cd = 0.2;
        }
        droneMesh.setAt(n++, m4.fromTRS([d.x, d.y, d.z], [0, d.yaw || ang, 0], [1, 1, 1]), [1, 1, 1], 0.15);
        if ((game.frame & 1) === 0) fx.pxr.emit({ position: [d.x, d.y - 0.12, d.z], velocity: [0, -1.5, 0], life: 0.08, size: 1, sizeEnd: 1, ramp: [[0.45, 1, 0.8]], emissive: 0.6, hard: true });
      });
    }
    droneMesh.count = n; droneMesh.dirty = true;
  };

  // 런 시작: 계열 적용
  game.archStart = () => {
    game.arch = game.selection.arch || 'striker';
    game.escorts = []; game.escortKills = 0; p.siege = false; p.stillT = 0;
    if (game.arch === 'carrier') addEscort();
    p.refreshStats(); p.hp = p.stats.maxHp; p.charges = p.stats.dashCharges;
  };
}
