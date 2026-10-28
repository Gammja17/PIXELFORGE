# 에셋 출처와 라이선스

게임 안에서는 격납고 오른쪽 위 `크레딧` 버튼(일시정지 메뉴에도 있음)으로 같은 내용을 볼 수 있어요.
이 파일을 고치면 `game/page.html` 의 `#credits` 모달도 같이 고쳐 주세요.

# 효과음

효과음 45개는 오픈소스 게임 Open Realms of Stars(https://github.com/tuomount/Open-Realms-of-Stars)의
`src/main/resources/resources/sounds/*.wav` 원본을 `tools/make-sfx.py` 로 잘라(구간, 피치, 음량 조절) mp3 로 만든 것이고,
승리/패배 징글 2개는 Kenney 에셋이에요. 원작자와 라이선스는 그 레포의 AUTHORS.md "Sounds by" 절을 기준으로 했고,
어느 원본 파일이 어느 항목인지는 그 레포의 `SoundPlayer.java` 주석과 파일을 추가한 커밋으로 확인했어요 (2026-10-29 확인).

CC BY 3.0 / CC BY-SA 3.0 효과음은 우리가 잘라 낸 변형본이에요 (원본에서 구간 자르기, 피치, 페이드, 음량).

## CC BY 3.0 (저작자 표시 의무) — https://creativecommons.org/licenses/by/3.0/

| 원작자 | 원본 (ORoS 항목) | 게임 효과음 |
|---|---|---|
| Michel Baradari, apollo-music.de | beam, railgun, missile, torpedo ("Space combat weapons sounds") | beam, beam2, missile, eshot |
| Michel Baradari, apollo-music.de | explode, explodemini, rumble ("Space combat explosions sounds") | boom1, boom2, bigboom2, boom5, hit3, pop |
| Michel Baradari | teleport ("Teleport sound") | dash, swing3 |
| Tuomo Untinen 편집, 원본 Lee Barkovich, Michel Baradari (archive.org/details/Berklee44Barkovich, opengameart.org/content/robotic-mechanic-step-sounds, opengameart.org/content/9-sci-fi-computer-sounds-and-beeps) | starbase ("Starbase deploy sound") | door, clear |
| Tuomo Untinen 편집, 원본 Lee Barkovich (archive.org/details/Berklee44Barkovich, opengameart.org/content/robotic-mechanic-step-sounds) | repair, install_component, remove_component ("Ship repair sound/install/remove component") | weld, clank, clank2, hurt |
| colmmullally (freesound.org/people/colmmullally/sounds/462220/) | ion_cannon ("Ion Cannon Sound") | shotgun2 |
| Erokia | plasma_cannon ("Plasma Cannon Sound Effects") | shotgun |
| Tim Mortimer (archive.org/details/TimMortimer) | menu1, menu2, menu4 ("Menu click sounds") | click, hover, select |
| Little Robot Sound Factory (www.littlerobotsoundfactory.com) | emp_explode ("Laser_07 as EMP explosion") | boom4 |
| Little Robot Sound Factory | alarm ("Alarm loop") | alarm |
| Little Robot Sound Factory | colonized ("SpaceEngine_Start_00 as colonized") | levelup |
| Tuomo Untinen | whip ("Whipping sound") | swing1, swing2, hit1 |
| Tuomo Untinen | coins ("Coins sound") | gem |
| Tuomo Untinen | spike ("Bite, tentacle and spike sounds") | hit2 |
| Tuomo Untinen | scanner ("Scanner overload sound") | tune |
| Tuomo Untinen | gravity_ripper ("Gravity Ripper sound") | overdrive |

## CC BY-SA 3.0 (저작자 표시 + 동일 조건 변경 허락) — https://creativecommons.org/licenses/by-sa/3.0/

| 원작자 | 원본 (ORoS 항목) | 게임 효과음 |
|---|---|---|
| Michael Klier, "Futuristic Weapons / Assault Rifle" | machinegun | mg1, mg2, mg3 |

주의: 이 셋은 CC BY-SA 라서 잘라 낸 효과음(mg1~3) 자체도 CC BY-SA 3.0 으로만 다시 배포할 수 있어요.
게임 전체가 BY-SA 가 되는 건 아니지만(효과음을 묶어 넣은 것), 출시 전에 CC0/CC BY 기관총 소리로 바꾸는 게 깔끔해요.

## CC0 (퍼블릭 도메인) — https://creativecommons.org/publicdomain/zero/1.0/

| 원작자 | 원본 (ORoS 항목) | 게임 효과음 |
|---|---|---|
| NenadSimic, "Muffled Distant Explosion" | bomb | boom3 |
| Joth, "Chunky Explosion" (Tuomo Untinen 편집) | nuke ("Nuke Sound") | bigboom |
| Bart | shield1, shield2, shield3 ("Shield sounds") | shield, ready, crate |
| Bart | warp_engine_engage ("Warp engine engage") | evolve |
| BLACK LODGE GAMES, LLC | tractorbeam ("Tractor beam sound") | drone |
| Rubberduck, "50 CC0 SFX #2" | cloak_overload | tink2 |
| Tuomo Untinen | glitch ("Glitch sound") | tink1 |
| Kenney, "Music Jingles" (https://kenney.nl/assets/music-jingles) | (Kenney 원본) | win, lose |

# 음악 (CC0)

- Juhani Junkala (SubspaceAudio), "5 Chiptunes (Action)" — https://opengameart.org/content/5-chiptunes-action
  - title, level1, level2, level3, ending

# 글꼴

- Galmuri11 Bold: quiple (https://github.com/quiple/galmuri), SIL Open Font License 1.1 (전문: `assets/fonts/Galmuri-OFL.txt`)

# 엔진 / 제작

- PixelForge 엔진(`engine/`)과 게임 코드, 도트 그래픽(코드로 생성)은 이 프로젝트에서 직접 만들었어요.
