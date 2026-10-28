# Open Realms of Stars 사운드(CC BY 3.0 / CC BY-SA 3.0 / CC0, 파일별 원작자는 assets/CREDITS.md)를 잘라서 assets/sfx/*.mp3 로 만든다
#  사용: python3 tools/make-sfx.py <원본 sounds 폴더>
import subprocess, sys, os
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
# 이름: (원본, 시작초, 길이초, 피치배율)
CUT = {
  'mg1': ('machinegun', 0.03, 0.14, 1), 'mg2': ('machinegun', 0.30, 0.14, 1), 'mg3': ('machinegun', 0.62, 0.14, 1),
  'shotgun': ('plasma_cannon', 0, 0.55, 1), 'shotgun2': ('ion_cannon', 0, 0.5, 1),
  'missile': ('missile', 0, 0.7, 1),
  'beam': ('beam', 0, 0.9, 1), 'beam2': ('railgun', 0, 0.5, 1),
  'swing1': ('whip', 0.17, 0.32, 1), 'swing2': ('whip', 0.17, 0.32, 1.15), 'swing3': ('teleport', 0, 0.32, 1.2),
  'hit1': ('whip', 1.10, 0.25, 1), 'hit2': ('spike', 0.21, 0.4, 1), 'hit3': ('explodemini', 0, 0.18, 1.1),
  'tink1': ('glitch', 0, 0.2, 1), 'tink2': ('cloak_overload', 0.1, 0.15, 1),
  'boom1': ('explodemini', 0, 0.7, 1), 'boom2': ('explode', 0, 0.9, 1), 'boom3': ('bomb', 0, 0.8, 1), 'boom4': ('emp_explode', 0, 0.7, 1),
  'pop': ('explodemini', 0, 0.3, 1.35),
  'bigboom': ('nuke', 0, 1.9, 1), 'bigboom2': ('explode', 0, 1.2, 0.85), 'boom5': ('rumble', 0, 0.8, 1),
  'hurt': ('remove_component', 0.35, 0.4, 1), 'shield': ('shield1', 0, 0.9, 1),
  'dash': ('teleport', 0, 0.45, 1),
  'gem': ('coins', 1.95, 0.2, 1.1), 'crate': ('shield3', 0, 0.9, 1),
  'levelup': ('colonized', 0.6, 0.8, 1), 'evolve': ('warp_engine_engage', 3.9, 1.5, 1),
  'clank': ('install_component', 0.35, 0.4, 1), 'clank2': ('remove_component', 0.4, 0.4, 1),
  'weld': ('repair', 0.6, 0.9, 1), 'tune': ('scanner', 1.7, 0.9, 1), 'drone': ('tractorbeam', 0, 0.85, 1),
  'door': ('starbase', 0, 1.0, 1), 'alarm': ('alarm', 0, 1.3, 1),
  'overdrive': ('gravity_ripper', 1.2, 1.4, 1), 'ready': ('shield2', 0, 0.9, 1),
  'eshot': ('torpedo', 0, 0.3, 1.2),
  'click': ('menu1', 0, 0.3, 1), 'hover': ('menu2', 0, 0.1, 1.2), 'select': ('menu4', 0, 0.35, 1),
  'clear': ('starbase', 0, 1.1, 0.9),
}
for name, (src, ss, dur, pitch) in CUT.items():
    fo = max(0.04, dur * 0.4)
    af = f"afade=t=in:d=0.004,afade=t=out:st={dur - fo:.3f}:d={fo:.3f}"
    if pitch != 1: af = f"asetrate=44100*{pitch},aresample=44100," + af
    tmp = f"/tmp/sfx_new/{name}.wav"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(ss), '-t', str(dur / pitch), '-i', f"{SRC}/{src}.wav", '-ac', '1', '-ar', '44100', '-af', af, tmp], check=True)
    # 피크 -1.5dB 로 맞추기
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mv = float([l for l in out.splitlines() if 'max_volume' in l][0].split(':')[1].split()[0])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f"volume={-1.5 - mv:.2f}dB", '-b:a', '96k', os.path.join(OUT, name + '.mp3')], check=True)
    print(name, src, f"{mv:.1f}dB")
