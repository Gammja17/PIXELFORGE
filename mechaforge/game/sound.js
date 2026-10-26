// 사운드: CC0 에셋(assets/CREDITS.md)을 WebAudio 로 재생
//  play(name, { vol, pitch, jitter })  같은 소리가 너무 겹치지 않게 이름별 최소 간격/동시 재생 수를 제한
//  music(track)  구역별 배경음 (교차 페이드)
//  브라우저 정책상 첫 터치/클릭/키 입력 뒤에 소리가 켜진다.

import { SFX, MUSIC } from './audio-data.js';

// 이름 → [파일 후보들, 기본 볼륨, 최소 간격(초), 최대 동시 재생]
const DEF = {
  mg: [['mg1', 'mg2', 'mg3'], 0.32, 0.05, 4],
  shotgun: [['shotgun', 'shotgun2'], 0.6, 0.08, 2],
  missile: [['missile'], 0.35, 0.12, 3],
  beam: [['beam', 'beam2'], 0.55, 0.08, 3],
  swing: [['swing1', 'swing2', 'swing3'], 0.55, 0.05, 3],
  hit: [['hit1', 'hit2', 'hit3'], 0.45, 0.04, 4],
  tink: [['tink1', 'tink2'], 0.18, 0.05, 3],
  boom: [['boom1', 'boom2', 'boom3', 'boom4'], 0.42, 0.05, 5],
  pop: [['pop'], 0.22, 0.03, 6],
  bigboom: [['bigboom', 'bigboom2', 'boom5'], 0.8, 0.15, 2],
  hurt: [['hurt'], 0.7, 0.1, 1],
  shield: [['shield'], 0.6, 0.2, 1],
  dash: [['dash'], 0.45, 0.08, 2],
  gem: [['gem'], 0.12, 0.045, 3],
  levelup: [['levelup'], 0.6, 0.2, 1],
  evolve: [['evolve'], 0.8, 0.3, 1],
  clank: [['clank', 'clank2'], 0.75, 0.1, 2],
  weld: [['weld'], 0.35, 0.3, 1],
  tune: [['tune'], 0.45, 0.3, 1],
  drone: [['drone'], 0.4, 0.3, 1],
  door: [['door'], 0.6, 0.3, 1],
  alarm: [['alarm'], 0.45, 1, 1],
  overdrive: [['overdrive'], 0.8, 0.5, 1],
  ready: [['ready'], 0.6, 0.5, 1],
  eshot: [['eshot'], 0.14, 0.08, 3],
  click: [['click'], 0.5, 0.03, 2],
  hover: [['hover'], 0.25, 0.03, 2],
  select: [['select'], 0.55, 0.05, 2],
  crate: [['crate'], 0.6, 0.2, 1],
  win: [['win'], 0.7, 1, 1],
  lose: [['lose'], 0.7, 1, 1],
  clear: [['clear'], 0.6, 1, 1],
};
const MUSIC_VOL = 0.32;

function b64ToBuf(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.last = {};
    this.voices = {};
    this.muted = false;
    try { this.muted = localStorage.getItem('mf-mute') === '1'; } catch { /* 저장 불가 환경 */ }
    this.track = null; this.wantTrack = null;
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { capture: true, passive: true });
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(this.ctx.destination);
    // 폭발이 겹쳐도 귀가 아프지 않게 컴프레서
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
    this.comp.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.comp);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = MUSIC_VOL; this.musicBus.connect(this.master);
    // 효과음 먼저, 음악은 필요할 때 디코딩
    for (const [k, b] of Object.entries(SFX)) this.ctx.decodeAudioData(b64ToBuf(b)).then((buf) => { this.buffers[k] = buf; }).catch(() => {});
    if (this.wantTrack) this.music(this.wantTrack);
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('mf-mute', m ? '1' : '0'); } catch { /* 무시 */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  play(name, { vol = 1, pitch = 1, jitter = 0.06 } = {}) {
    const c = this.ctx, D = DEF[name];
    if (!c || !D || this.muted) return;
    const now = c.currentTime;
    if (now - (this.last[name] || -1) < D[2]) return;
    if ((this.voices[name] || 0) >= D[3]) return;
    const key = D[0][(Math.random() * D[0].length) | 0], buf = this.buffers[key];
    if (!buf) return;
    this.last[name] = now;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf;
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * jitter);
    g.gain.value = D[1] * vol;
    src.connect(g).connect(this.sfxBus);
    this.voices[name] = (this.voices[name] || 0) + 1;
    src.onended = () => { this.voices[name]--; };
    src.start();
  }

  // 배경음: 같은 곡이면 그대로, 다르면 교차 페이드
  async music(name, rate = 1) {
    this.wantTrack = name;
    const c = this.ctx;
    if (!c) return;
    if (this.track && this.track.name === name) { this.track.src.playbackRate.value = rate; return; }
    let buf = this.buffers['m:' + name];
    if (!buf && MUSIC[name]) {
      try { buf = this.buffers['m:' + name] = await c.decodeAudioData(b64ToBuf(MUSIC[name])); } catch { return; }
    }
    if (this.wantTrack !== name) return;
    const old = this.track;
    if (old) { old.g.gain.setTargetAtTime(0, c.currentTime, 0.3); old.src.stop(c.currentTime + 1.5); }
    this.track = null;
    if (!buf) return;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; src.loop = name !== 'ending'; src.playbackRate.value = rate;
    g.gain.value = 0; g.gain.setTargetAtTime(1, c.currentTime, 0.4);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.track = { name, src, g };
  }
  stopMusic() {
    this.wantTrack = null;
    if (this.track && this.ctx) { this.track.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); this.track.src.stop(this.ctx.currentTime + 1.5); this.track = null; }
  }
  // 레벨업 카드 같은 순간에 음악을 살짝 줄임
  duck(on) { if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? MUSIC_VOL * 0.35 : MUSIC_VOL, this.ctx.currentTime, 0.15); }
}
