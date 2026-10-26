// 게임 본체: 상태 머신, 방 진행, 카메라, 히트스톱, 장착 연출, 오버레이
//
//  hangar → play ⇄ (levelup → install) → transition(다음 방) … → boss → victory
//                      ↘ dying → over

import { Engine, Geometry, Mesh, Material, clamp, damp, v3 } from '../engine/index.js';
import { Fx } from './fx.js';
import { Shots, WeaponSystem, WEAPONS, weaponName } from './weapons.js';
import { Enemies } from './enemies.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { rollChoices, applyChoice, freeSlot, cardImage } from './upgrades.js';
import { MODULES, LEGS, FRAMES, HEADS } from './parts.js';
import { Rooms, RUN_ZONES, ZONES } from './rooms.js';
import { Installer } from './install.js';
import { Thumbs } from './icons.js';
import { Sound } from './sound.js';
import { Meta, PRICES } from './meta.js';
import { activeSets, canTranscend, SETS, TRANSCEND } from './sets.js';
import { EVOLUTIONS, MAX_LEVEL } from './weapons.js';

const store = {
  get(k, d) { try { const v = localStorage.getItem('mechaforge.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mechaforge.' + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};
const xpNeedFor = (L) => Math.floor(10 + (L - 1) * 9 + Math.pow(L - 1, 1.95));

export class Game {
  constructor(canvas, overlay, ui) {
    this.ui = ui;
    this.engine = new Engine(canvas, { pixelScale: 4, stick: true });
    this.scene = this.engine.scene;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.touch = matchMedia('(pointer: coarse)').matches;
    const st = this.engine.renderer.settings;
    Object.assign(st, { bloomStrength: 1.25, vignette: 0.32, clouds: false, shadowSize: 22, saturation: 1.15 });
    const cam = this.engine.camera;
    cam.yaw = Math.PI / 4; cam.pitch = 0.78; cam.distance = 60; cam.viewHeight = 9;
    this.scene.fog.near = cam.distance + 10; this.scene.fog.far = cam.distance + 45;

    this.fx = new Fx(this.scene);
    this.shots = new Shots(this);
    this.weapons = new WeaponSystem(this);
    this.rooms = new Rooms(this);
    this.enemies = new Enemies(this);
    this.pickups = new Pickups(this);
    this.player = new Player(this);
    this.installer = new Installer(this);
    this.sfx = new Sound();
    this.sfx.music('title');
    this.thumbs = new Thumbs(this.engine);
    this.buildHangarProps();

    this.time = 0;
    this.state = 'hangar';
    this.hitStopT = 0; this.slowT = 0;
    this.view = { hw: 10, hh: 10 };
    this.pendingLevels = 0;
    this.ctl = { attack: false, attackPressed: false, special: false, dash: false };
    this.btn = { attack: false, attackPressed: false, special: false, dash: false };
    this.meta = new Meta();
    this.selection = { legs: 'walker', frame: 'standard', head: 'vfin', weapon: 'saber', paint: 'rx', ...store.get('loadout2', {}) };
    // 잠긴 부품이 선택돼 있으면 기본값으로
    for (const k of Object.keys(PRICES)) if (!this.meta.isUnlocked(k, this.selection[k])) this.selection[k] = Object.keys(PRICES[k])[0];
    for (const [k, T] of [['legs', LEGS], ['frame', FRAMES], ['head', HEADS], ['weapon', WEAPONS]]) if (!T[this.selection[k]]) this.selection[k] = Object.keys(T)[0];
    this.best = store.get('best2', { depth: 0, win: false });
    this.setSelection(this.selection);
    this.hangarLighting();
    this.engine.onUpdate = (dt) => this.update(dt);
  }

  // ---- 격납고 ----
  buildHangarProps() {
    const g = new Geometry();
    g.merge(Geometry.grid(40, 40, 20, 20, () => -0.02, (c) => ((Math.floor(c[0] / 2) + Math.floor(c[2] / 2)) & 1 ? [0.2, 0.2, 0.25] : [0.17, 0.17, 0.21])));
    g.merge(Geometry.cylinder(1.9, 2.1, 0.16, 8, [0.3, 0.31, 0.36]));
    g.merge(Geometry.cylinder(1.65, 1.65, 0.03, 8, [0.4, 0.42, 0.48]), { position: [0, 0.16, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      g.merge(Geometry.box(0.24, 2.6, 0.24, [0.36, 0.36, 0.42]), { position: [Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2] });
      g.merge(Geometry.box(0.3, 0.12, 0.3, [0.95, 0.75, 0.2]), { position: [Math.cos(a) * 3.2, 2.6, Math.sin(a) * 3.2] });
      g.merge(Geometry.box(1.2, 0.1, 0.1, [0.4, 0.4, 0.46]), { position: [Math.cos(a) * 2.6, 2.4, Math.sin(a) * 2.6], rotation: [0, -a, 0] });
    }
    for (let i = 0; i < 6; i++) g.merge(Geometry.box(1, 0.7, 0.8, [0.75, 0.55, 0.2]), { position: [-6 + (i % 3) * 1.1, 0, -5 - Math.floor(i / 3) * 0.9] });
    this.hangar = this.scene.add(new Mesh(g, new Material()));
    const ring = new Geometry();
    ring.merge(Geometry.cylinder(2.02, 2.02, 0.05, 8, [0.4, 0.9, 1], { caps: false }), { position: [0, 0.07, 0] });
    this.hangarGlow = this.scene.add(new Mesh(ring, new Material({ emissive: 1, outline: false, castShadow: false })));
    this.hangarLights = [
      { position: [2.5, 3.5, 2.5], color: [1, 0.85, 0.65], radius: 7, intensity: 0.7 },
      { position: [-2.5, 2, -1], color: [0.4, 0.7, 1], radius: 6, intensity: 0.6 },
    ];
  }
  hangarLighting() {
    const sc = this.scene;
    sc.sun.direction = [0.4, 0.8, 0.5]; sc.sun.color = [1, 0.92, 0.85]; sc.sun.intensity = 0.65;
    sc.ambientSky = [0.3, 0.32, 0.45]; sc.ambientGround = [0.18, 0.16, 0.2]; sc.skyColor = sc.fog.color = [0.07, 0.07, 0.1];
  }

  // 격납고 선택 → 미리보기 메카
  setSelection(sel) {
    this.selection = { ...sel };
    store.set('loadout2', this.selection);
    const W = WEAPONS[sel.weapon];
    this.loadout = { legs: sel.legs, frame: sel.frame, head: sel.head, paint: sel.paint, weapons: [{ id: sel.weapon, slot: freeSlot([], W.prefer) }], modules: {} };
    this.weapons.list = this.loadout.weapons.map((w) => ({ ...w, level: 1, cd: 0.4 }));
    this.player.reset(this.loadout);
    this.player.buildFlash = 0.3;
    this.player.yaw = this.player.aimYaw = this.turn || 0.6;
  }

  startRun() {
    this.setSelection(this.selection);
    this.weapons.reset(); this.weapons.list = this.loadout.weapons.map((w) => ({ ...w, level: 1, cd: 0.4 }));
    this.time = 0;
    this.stats = { kills: 0, dealt: 0, taken: 0, bestCombo: 0 };
    this.combo = 0; this.comboT = 0;
    this.level = 1; this.xp = 0; this.xpNeed = xpNeedFor(1); this.pendingLevels = 0; this.pendingCrates = 0; this.chips = 1;
    this.enemies.clear(); this.shots.clear(); this.pickups.clear();
    this.hangar.visible = this.hangarGlow.visible = false;
    this.player.mech.root.visible = true;
    this.rooms.newRun();
    this.rooms.enter('start', 'E');
    this.zoneMusic();
    this.player.invuln = 1.2;
    this.state = 'play';
    this.fx.ring(this.player.x, 0.15, this.player.z, 4, [0.5, 0.9, 1], 0.5);
    this.ui.onStart();
  }

  toHangar() {
    this.state = 'hangar';
    this.enemies.clear(); this.shots.clear(); this.pickups.clear();
    this.rooms.clear();
    this.fx.extraLights = this.hangarLights;
    this.hangar.visible = this.hangarGlow.visible = true;
    this.hangarLighting();
    this.player.mech.root.visible = true;
    this.setSelection(this.selection);
    this.sfx.music('title');
    this.ui.onHangar();
  }

  // ---- 방 이동 ----
  nextRoom(reward, entry) {
    if (this.state !== 'play') return;
    this.state = 'transition';
    // 남은 경험치 결정은 자동 회수
    for (const q of this.pickups.gems) this.addXp(q.value);
    this.ui.fade(true);
    setTimeout(() => {
      this.enemies.clear(); this.shots.clear(); this.pickups.clear();
      this.rooms.enter(reward, entry);
      this.zoneMusic();
      this.player.invuln = 0.8;
      this.state = 'play';
      this.ui.fade(false);
      const Z = ZONES[this.rooms.zone];
      this.ui.banner(this.rooms.reward === 'boss' ? '경고: 타이탄의 방' : `${Z.name} ${this.rooms.depth}/${this.rooms.last}`, this.rooms.reward === 'boss');
    }, 260);
  }

  zoneMusic() { const R = this.rooms; if (R.reward === 'boss') this.sfx.music('level2', 1.08); else this.sfx.music({ desert: 'level1', factory: 'level2', crystal: 'level3' }[R.zone] || 'level1'); }

  // ---- 진행 ----
  addXp(v) {
    this.xp += v * this.player.stats.xpMul;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.pendingLevels++;
      this.xpNeed = xpNeedFor(this.level);
      this.player.ups._lv = this.level - 1; this.player.refreshStats();
    }
  }
  // 카드 3장 제시 (레벨업 / 부품 캐시 / 시스템 튜닝 / 작업장)
  offerCards(kind = 'any', title = null) {
    this.state = 'levelup';
    this.cardKind = kind;
    this.choices = rollChoices(this, kind);
    for (const c of this.choices) c.img = cardImage(this, c);
    this.fx.light([this.player.x, 2, this.player.z], [0.6, 0.9, 1], 5, 0.8, 0.5);
    this.sfx.play(kind === 'part' && title !== '레벨 업!' ? 'crate' : 'levelup'); this.sfx.duck(true);
    this.ui.levelUp(this.choices, title || `레벨 업! LV ${this.level - this.pendingLevels + 1}`);
  }
  pick(i) {
    if (this.state !== 'levelup' || !this.choices[i]) return;
    const c = this.choices[i];
    if (this.cardKind === 'level') this.pendingLevels--;
    this.ui.closeLevelUp();
    this.sfx.play(c.kind === 'evolve' ? 'evolve' : 'select'); this.sfx.duck(false);
    if (c.kind === 'evolve') this.ui.cutin('EVOLUTION', c.name, c.img, 'evo');
    const r = applyChoice(this, c);
    this.state = 'install';
    this.installer.start(r.mode, r.key, c.name);
  }
  // ---- 세트 각성 / 초월 검사 (부품 구성이 바뀔 때마다) ----
  refreshSets() {
    const p = this.player, lo = p.loadout, ws = this.weapons.list;
    const sets = activeSets(lo, ws), before = lo.sets || [];
    const gained = sets.filter((s) => !before.includes(s)), lost = before.filter((s) => !sets.includes(s));
    const tr = !lo.transcend && canTranscend(lo, ws);
    if (!gained.length && !lost.length && !tr) return;
    lo.sets = sets;
    if (tr) lo.transcend = true;
    p.rebuild(true);
    for (const s of gained) this.ui.cutin('SET AWAKEN', `세트 각성: ${SETS[s].name}`, null, 'evo');
    if (gained.length) { this.ui.banner(SETS[gained[0]].desc); this.sfx.play('evolve'); }
    if (lost.length) this.ui.toast(`세트 해제: ${lost.map((s) => SETS[s].name).join(', ')}`);
    if (tr) {
      this.ui.cutin('TRANSCEND', TRANSCEND.name, null, 'od');
      setTimeout(() => this.ui.banner(TRANSCEND.desc), gained.length * 1350 + 200);
      this.sfx.play('overdrive'); this.sfx.play('bigboom');
      this.slowMo(1.2);
      this.enemies.blast(p.x, p.z, 8, 200 * p.stats.dmgMul, false, 0.1);
      this.fx.ring(p.x, 0.15, p.z, 10, [1, 0.9, 0.5], 0.8);
      this.fx.light([p.x, 3, p.z], [1, 0.9, 0.6], 12, 2.5, 0.8);
    }
  }

  // ---- 정비 드론 기지 (덱 관리): 부품 강화, 진화, 분해, 수리 ----
  openStation() {
    this.state = 'station';
    this.sfx.play('drone'); this.sfx.duck(true);
    this.ui.station(true);
  }
  closeStation() {
    if (this.state !== 'station') return;
    this.state = 'play'; this.sfx.duck(false);
    this.ui.station(false);
    this.refreshSets();
    this.player.invuln = Math.max(this.player.invuln, 0.8);
  }
  addChips(n, why) { this.chips = (this.chips || 0) + n; if (why) this.ui.toast(`정비 포인트 +${n} (${why})`); }
  // 기지에서 할 수 있는 일 목록
  stationParts() {
    const lo = this.player.loadout, out = [];
    for (const w of this.weapons.list) {
      const W = WEAPONS[w.id], E = EVOLUTIONS[w.id];
      out.push({ kind: 'weapon', id: w.id, level: w.level, max: W.levels.length, evo: !!w.evo, name: w.evo ? E.name : W.name,
        canEvolve: !w.evo && E && w.level >= MAX_LEVEL && !!lo.modules[E.need], need: E?.need });
    }
    for (const [id, lv] of Object.entries(lo.modules)) if (lv) out.push({ kind: 'module', id, level: lv, max: MODULES[id].max, name: MODULES[id].name });
    return out;
  }
  stationAct(act, kind, id) {
    const p = this.player, lo = p.loadout;
    const cost = act === 'up' ? 1 : act === 'evo' ? 2 : act === 'repair' ? 1 : 0;
    if ((this.chips || 0) < cost) { this.sfx.play('hurt', { vol: 0.4 }); this.ui.toast('정비 포인트가 부족해요'); return false; }
    this.chips -= cost;
    if (act === 'repair') { p.heal(p.stats.maxHp * 0.4); this.sfx.play('tune'); return true; }
    if (kind === 'weapon') {
      const w = this.weapons.get(id);
      if (act === 'up') w.level = Math.min(WEAPONS[id].levels.length, w.level + 1);
      else if (act === 'evo') w.evo = true;
      else if (act === 'scrap') { this.weapons.list = this.weapons.list.filter((q) => q !== w); this.addChips(w.level + (w.evo ? 2 : 0)); }
      lo.weapons = this.weapons.list.map((q) => ({ id: q.id, slot: q.slot, evo: q.evo }));
    } else {
      if (act === 'up') lo.modules[id] = Math.min(MODULES[id].max, lo.modules[id] + 1);
      else if (act === 'scrap') { this.addChips(lo.modules[id]); delete lo.modules[id]; }
    }
    p.rebuild(true); this.weapons.syncBits(); p.refreshStats();
    this.sfx.play(act === 'scrap' ? 'boom' : act === 'evo' ? 'evolve' : 'clank');
    this.fx.ring(p.x, 0.15, p.z, 2.4, act === 'scrap' ? [1, 0.5, 0.3] : [0.5, 0.9, 1], 0.3);
    return true;
  }

  // 노획 부품 줍기 → 무기/모듈로 장착 (이미 있으면 레벨 업, 못 달면 경험치로 분해)
  // 노획 부품을 장착할 수 있으면 카드 정보, 꽉 찼으면 null. pending: 바닥에 이미 떨어져 있는 같은 부품 수
  salvageChoice(kind, id, pending = 0) {
    const p = this.player, ws = this.weapons.list;
    if (kind === 'weapon') {
      const W = WEAPONS[id], own = ws.find((w) => w.id === id);
      if (own) return !own.evo && own.level + pending < W.levels.length ? { kind: 'weapon', id, level: own.level + 1, name: W.name } : null;
      const slot = freeSlot(ws, W.prefer);
      return !pending && slot && ws.filter((w) => w.id !== 'funnel').length < 5 ? { kind: 'weapon', id, level: 1, isNew: true, slot, name: W.name } : null;
    }
    const M = MODULES[id], lv = p.loadout.modules[id] || 0;
    return lv + pending < M.max ? { kind: 'module', id, level: lv + 1, isNew: !lv, name: M.name } : null;
  }
  salvageInstall(kind, id, from) {
    const p = this.player;
    const c = this.salvageChoice(kind, id);
    if (!c) { this.addXp(this.xpNeed * 0.35); p.heal(p.stats.maxHp * 0.15); this.ui.toast('장착할 자리가 없어 분해: 경험치 + 수리'); this.sfx.play('crate'); return; }
    const r = applyChoice(this, c);
    this.state = 'install';
    this.installer.start(r.mode, r.key, `${c.name}${c.isNew ? '' : ` Lv${c.level}`}`, { from });
    this.ui.toast(`노획: ${c.name}`);
  }

  endInstall() {
    this.state = 'play';
    this.refreshSets();
    const p = this.player;
    // 숨 돌릴 틈: 주변 적을 밀어내고 잠깐 무적
    this.enemies.each(p.x, p.z, 4.5, (e) => { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; e.kx += (dx / d) * 14; e.kz += (dz / d) * 14; });
    p.invuln = Math.max(p.invuln, 0.8);
  }
  // 짧은 멈춤: 자잘한 건 0.5초에 한 번만 (계속 끊기는 느낌 방지)
  hitStop(t, force = false) {
    const now = this.engine.time;
    if (!force && t < 0.1 && now - (this.lastStop || -9) < 0.5) return;
    this.lastStop = now;
    this.hitStopT = Math.max(this.hitStopT, Math.min(t, 0.18));
  }
  slowMo(t) { this.slowT = Math.max(this.slowT, t); }

  // ---- 연속 처치 ----
  //  1.6초 안에 다음 처치가 이어지면 콤보 유지. 짧은 순간 대량 처치 → 잠깐 슬로모션
  onKill() {
    if (this.state !== 'play') return;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.6;
    this.burst = (this.burst || 0) + 1;
    if (this.combo > (this.stats.bestCombo || 0)) this.stats.bestCombo = this.combo;
    for (const m of [50, 100, 200, 300, 500]) if (this.combo === m) { this.ui.comboMilestone(m); this.sfx.play('ready'); }
  }
  updateCombo(dt) {
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) { this.ui.comboEnd(this.combo); this.combo = 0; }
    this.burstT = (this.burstT || 0) + dt;
    if (this.burstT > 0.3) {
      if (this.burst >= 25 && (this.slowCd || 0) <= 0) { this.slowMo(0.45); this.slowCd = 12; }
      this.burst = 0; this.burstT = 0;
    }
    this.slowCd = (this.slowCd || 0) - dt;
  }

  pause(v) {
    if (v && this.state === 'play') { this.state = 'paused'; this.ui.pause(true); }
    else if (!v && this.state === 'paused') { this.state = 'play'; this.ui.pause(false); }
  }

  gameOver() {
    if (this.state !== 'play') return;
    this.sfx.play('bigboom'); this.sfx.stopMusic(); setTimeout(() => this.sfx.play('lose'), 900);
    const p = this.player;
    this.state = 'dying';
    this.dyingT = 0;
    this.fx.explosion(p.x, 1.2, p.z, 2.4, { color: [0.6, 0.85, 1] });
    for (let i = 0; i < 10; i++) this.fx.chunk(p.x, 1.2, p.z, p.mech.paint.main, 9);
    p.mech.root.visible = false;
    for (const b of this.weapons.bits) b.mesh.visible = false;
    this.slowMo(1.6);
    this.saveBest(false);
  }
  victory() {
    this.state = 'victoryWait';
    this.sfx.play('win'); this.sfx.music('ending');
    this.slowMo(1.4);
    this.saveBest(true);
    setTimeout(() => { this.state = 'victory'; this.ui.result(this.resultData(true)); }, 1600);
  }
  saveBest(win) {
    const d = this.rooms.depth;
    if (win || d > this.best.depth) { this.best = { depth: Math.max(d, this.best.depth), win: win || this.best.win }; store.set('best2', this.best); }
  }
  resultData(win) {
    const lo = this.player.loadout;
    const scrap = this.meta.reward({ kills: this.stats.kills, depth: this.rooms.depth, win, level: this.level });
    return {
      scrap, total: this.meta.scrap,
      win, combo: this.stats.bestCombo || 0, time: this.time, depth: this.rooms.depth, last: this.rooms.last, kills: this.stats.kills, level: this.level, dealt: this.stats.dealt, taken: this.stats.taken,
      zone: ZONES[this.rooms.zone]?.name || '',
      weapons: this.weapons.list.map((w) => w.evo ? weaponName(w) : `${weaponName(w)} Lv${w.level}`),
      modules: Object.entries(lo.modules).map(([k, v]) => `${MODULES[k].name} Lv${v}`),
    };
  }
  restart() { this.player.mech.root.visible = true; this.startRun(); }

  // ---- 매 프레임 ----
  update(dt) {
    const input = this.engine.input, p = this.player;
    // 조작 모으기 (키보드 + 마우스 + 화면 버튼)
    const b = this.btn;
    const ctl = this.ctl = {
      attack: input.down('j') || b.attack,
      attackPressed: input.pressed('j') || b.attackPressed,
      special: input.pressed('k') || b.special,
      dash: input.pressed('jump') || input.pressed('Shift') || b.dash,
      overdrive: input.pressed('l') || input.pressed('q') || b.overdrive,
      mode: input.pressed('e') || input.pressed('Tab') || b.mode,
    };
    b.attackPressed = b.special = b.dash = b.overdrive = b.mode = false;
    if (this.state === 'play' && ctl.mode) p.switchMode();
    this.frame = (this.frame || 0) + 1;
    if (this.state === 'play' && ctl.overdrive && p.overdrive()) { this.sfx.play('overdrive'); this.sfx.play('bigboom'); this.ui.cutin('OVERDRIVE', '오버드라이브', null, 'od'); }

    if (input.pressed('Escape') || input.pressed('p')) this.pause(this.state === 'play');
    if (this.state === 'levelup') { for (const k of ['1', '2', '3']) if (input.pressed(k)) this.pick(Number(k) - 1); }
    if (this.state === 'hangar' && input.pressed('Enter')) this.ui.launch?.();
    if (this.state === 'install' && this.installer.t > 0.25 && (ctl.attackPressed || ctl.special || ctl.dash || input.pressed('Enter'))) this.installer.skip();

    let simDt = 0;
    if (this.state === 'play' || this.state === 'dying' || this.state === 'victoryWait') {
      if (this.hitStopT > 0) { this.hitStopT -= dt; simDt = 0; }
      else {
        let s = 1;
        if (this.slowT > 0) { this.slowT -= dt; s = this.slowT > 0.4 ? 0.3 : 0.3 + (0.4 - this.slowT) * 1.75; }
        simDt = dt * s;
      }
    }
    this.fx.timeScale = this.state === 'hangar' || this.state === 'install' ? 1 : dt > 0 ? simDt / dt : 0;

    if (simDt > 0) {
      if (this.state === 'play') { this.updateCombo(simDt); this.time += simDt; p.update(simDt, input, ctl); this.weapons.update(simDt, ctl); this.rooms.update(simDt); }
      this.enemies.update(simDt);
      this.shots.update(simDt);
      this.pickups.update(simDt);
    }
    if (this.state === 'install') { this.installer.update(dt); p.animate(dt, 0); this.weapons.updateBits(dt); }
    if (this.state === 'dying') { this.dyingT += dt; if (this.dyingT > 1.8) { this.state = 'over'; this.ui.bossBar(0); this.ui.result(this.resultData(false)); } }
    if (this.state === 'play' && this.pendingCrates > 0 && this.hitStopT <= 0) { this.pendingCrates--; this.offerCards('part', '정예 부품 노획'); this.cardKind = 'crate'; }
    if (this.state === 'play' && this.pendingLevels > 0 && this.hitStopT <= 0) { this.cardKind = 'level'; this.offerCards('any'); this.cardKind = 'level'; }

    if (this.state === 'hangar') {
      // 직접 돌려 보기: 드래그(ui) 또는 ←/→, A/D. 손을 떼면 관성으로 조금 돌다 멈춘다
      if (this.turn == null) { this.turn = 0.6; this.turnVel = 0; }
      const kx = (input.down('ArrowRight') || input.down('d') ? 1 : 0) - (input.down('ArrowLeft') || input.down('a') ? 1 : 0);
      if (kx) this.turnVel = kx * 2.6;
      else if (!this.turnDrag) this.turnVel *= Math.pow(0.03, dt);
      if (!this.turnDrag) this.turn += this.turnVel * dt;
      p.x = 0; p.z = 0; p.yaw = this.turn; p.aimYaw = this.turn;
      p.buildFlash = Math.max(0, p.buildFlash - dt);
      p.animate(dt, 0);
      this.fx.extraLights = this.hangarLights;
      this.hangarGlow.material.color = [1, 1, 1].map((v) => v * (0.75 + 0.25 * Math.sin(this.engine.time * 3)));
    }
    this.fx.update(simDt, dt);
    this.updateCamera(dt);
    this.drawOverlay();
    this.ui.frame(this);
  }

  updateCamera(dt) {
    const cam = this.engine.camera, c = this.engine.canvas, p = this.player;
    const w = c.clientWidth || 1, h = c.clientHeight || 1, short = Math.min(w, h);
    const hangar = this.state === 'hangar';
    const install = this.state === 'install';
    // 줌: 장착 연출이나 오버드라이브로는 바뀌지 않고, 레벨 성장에 따라 아주 천천히만 물러난다
    const worldShort = hangar ? (h > w ? 4.6 : 7) : clamp(short / 34, 13, 17) * (1 + (p.baseSize - 1) * 0.35);
    const goal = worldShort * (h / short);
    cam.viewHeight = Math.abs(cam.viewHeight - goal) < 0.01 ? goal : damp(cam.viewHeight, goal, hangar ? 5 : 1.2, dt);
    const sinP = Math.sin(cam.pitch);
    this.view = { hw: (cam.viewHeight * (w / h)) / 2, hh: cam.viewHeight / 2 / sinP };
    const tr = this.fx.trauma * this.fx.trauma, amp = tr * 0.4;
    const ox = (Math.random() * 2 - 1) * amp, oy = (Math.random() * 2 - 1) * amp;
    const r = cam.right || [1, 0, 0], u = cam.up || [0, 1, 0];
    // 격납고: 메카를 패널 반대편으로
    const lift = hangar ? (h > w ? -cam.viewHeight * 0.3 : 0) : 0;
    const side = hangar && w > h ? cam.viewHeight * (w / h) * 0.16 : 0;
    const ty = damp(cam.target[1], hangar ? 1.4 : install ? 1.2 : 0.8, 4, dt);
    cam.target = [p.x + r[0] * (ox - side) + u[0] * (oy + lift), ty + u[1] * oy, p.z + r[2] * (ox - side) + u[2] * (oy + lift)];
  }

  // 월드 좌표 → 오버레이 캔버스 디바이스 픽셀
  project(pt) {
    const cam = this.engine.camera, c = this.engine.canvas;
    if (!cam.right || !cam.pixelWorld) return null;
    const d = v3.sub(pt, cam.target), s = this.engine.scale / cam.pixelWorld;
    const x = c.width / 2 + v3.dot(d, cam.right) * s, y = c.height / 2 - v3.dot(d, cam.up) * s;
    return [x, y];
  }
  drawOverlay() {
    const o = this.overlay, c = this.engine.canvas, ctx = this.octx;
    if (o.width !== c.width || o.height !== c.height) { o.width = c.width; o.height = c.height; }
    ctx.clearRect(0, 0, o.width, o.height);
    const px = Math.max(2, Math.round(2 * this.engine.dpr));
    this.pickups.drawLabels(ctx, (q) => this.project(q), px);
    this.fx.drawNumbers(ctx, (q) => { const s = this.project(q); return s && s[0] > -50 && s[1] > -50 && s[0] < c.width + 50 && s[1] < c.height + 50 ? s : null; }, px);
  }

  // 테스트/디버그용
  get debug() {
    const g = this;
    return {
      spawn(type, n = 10, d = 6) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const e = g.enemies.spawn(type, g.player.x + Math.cos(a) * d, g.player.z + Math.sin(a) * d); if (e) e.spawnT = 1; } },
      xp(v) { g.addXp(v); },
      cards(kind = 'part') { g.offerCards(kind, '테스트'); },
      room(reward = 'part') { g.nextRoom(reward, 'E'); },
      clear() { for (const e of g.enemies.list) e.hp = 0, g.enemies.kill(e); g.enemies.list = []; g.enemies.pending = []; g.rooms.roomT = g.rooms.duration; },
      od() { g.player.od = 1; },
      level(n) { for (let i = 0; i < n; i++) g.addXp(g.xpNeed - g.xp + 0.01); },
      boss() { g.rooms.depth = g.rooms.last - 1; g.nextRoom('boss', 'E'); },
      guardian(depth = 1) { g.rooms.depth = depth; g.nextRoom('guardian', 'E'); },
    };
  }
}

export function boot(canvas, overlay, ui) { return new Game(canvas, overlay, ui); }
