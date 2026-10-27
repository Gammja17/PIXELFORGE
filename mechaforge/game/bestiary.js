// 적 도감: 적마다 컨셉 한 줄, 공략 한 줄, 대표 색, 뜯어낼 수 있는 부품
//  처음 만나면 오른쪽에 소개 카드가 뜨고 (ui.enemyIntro), 정예/보스를 잡으면 그 부품이 떨어진다 (노획)
//  tint: 몸 색 배율 (역할이 한눈에 구분되게). drop: [종류, id] 그 적의 컨셉 무기

export const BESTIARY = {
  // ---- 일반 적 ----
  bomber:   { name: '자폭 드론', role: '자폭', what: '붙으면 깜빡이다 터진다. 주변 적도 같이 날린다', how: '떼 한가운데로 끌어들여 터뜨려라', drop: ['weapon', 'missile'], tint: [1.5, 0.9, 0.7] },
  tank:     { name: '경전차', role: '포격', what: '거리를 두고 포탄을 쏜다. 주황 조준선이 예고', how: '조준선 옆으로 비켜서 다가가라', drop: ['weapon', 'cannon'] },
  spinner:  { name: '회전 포대 드론', role: '탄막', what: '맴돌며 회전하는 고리탄을 뿌린다', how: '고리 사이 틈으로 파고들어라', drop: ['weapon', 'turret'], tint: [1.4, 0.9, 1.3] },
  brute:    { name: '중장 메카', role: '돌진', what: '느리지만 붉은 길을 따라 들이받는다', how: '돌진 길에서 옆으로 빠져라', drop: ['weapon', 'stomp'], tint: [1.2, 1.05, 1.35] },
  sniper:   { name: '저격 기체', role: '저격', what: '멀리서 조준선이 고정되면 관통 레이저', how: '선이 고정되는 순간 옆으로', drop: ['weapon', 'gauss'], tint: [0.85, 1.15, 1.5] },
  shield:   { name: '방패 기체', role: '방패', what: '정면 공격을 거의 다 막는다', how: '옆이나 뒤로 돌아가서 쳐라', drop: ['module', 'shield'], tint: [1.5, 1.3, 0.7] },
  assassin: { name: '그림자 암살기', role: '암살', what: '사라졌다가 등 뒤에 표식, 곧 베기', how: '표식이 뜨면 대시로 빠져라', drop: ['weapon', 'saw'], tint: [0.75, 0.65, 1.05] },
  splitter: { name: '분열 기체', role: '분열', what: '부서지면 작은 조각 3개로 갈라진다', how: '범위 공격으로 한꺼번에', drop: ['weapon', 'cluster'], tint: [1.5, 1.05, 0.6] },
  medic:    { name: '수리 드론', role: '수리', what: '다친 적을 수리 빔으로 고친다', how: '이놈부터 잡아라', drop: ['module', 'reactor'], tint: [0.8, 1.5, 0.9] },
  miner:    { name: '지뢰 부설기', role: '지뢰', what: '맴돌며 지뢰를 깐다', how: '지뢰는 쏘면 터진다. 적 근처에서 터뜨려라', drop: ['weapon', 'mine'], tint: [1.5, 1.4, 0.55] },
  charger:  { name: '돌격 기체', role: '돌격', what: '바닥에 경로를 그리고 직진 돌격', how: '옆으로 피하면 벽에 박혀 기절', drop: ['module', 'booster'], tint: [1.55, 0.75, 0.65] },
  drone:    { name: '정찰 드론', role: '기본', what: '무리 지어 날아와 몸으로 부딪친다', how: '모아서 한 번에', drop: ['weapon', 'funnel'] },
  // ---- 중간 보스 ----
  warden: { name: '나선 포대', role: '중간 보스', what: '회전 나선과 고리 연사', how: '나선의 빈 줄을 타고 접근', drop: ['weapon', 'ricochet'] },
  lancer: { name: '레이저 랜서', role: '중간 보스', what: '경고선을 긋고 레이저로 휩쓴다', how: '선이 그어지면 선 밖으로', drop: ['weapon', 'laser'] },
  hive:   { name: '하이브 캐리어', role: '중간 보스', what: '자폭 드론을 계속 사출한다', how: '드론부터 정리하고 본체를', drop: ['weapon', 'funnel'] },
  mortar: { name: '박격 포대', role: '중간 보스', what: '바닥 표식에 포탄이 떨어진다', how: '표식에서 벗어나 계속 움직여라', drop: ['weapon', 'cluster'] },
  prism:  { name: '분광 수정체', role: '중간 보스', what: '멈췄다 터지는 탄, 휘는 나선', how: '멈춘 탄 근처에 있지 마라', drop: ['weapon', 'tesla'] },
  reaper: { name: '추적 돌격기', role: '중간 보스', what: '돌진하며 탄을 깔고 지나간다', how: '돌진 경로 옆으로 피하고 뒤를 쳐라', drop: ['weapon', 'disc'] },
  // ---- 최종 보스 ----
  titan: { name: '타이탄', role: '최종 보스', what: '내려찍기, 탄막, 돌진을 번갈아 쓴다. 쓰러뜨리면 MK-II 로 다시 일어난다', how: '붉은 원과 예고선을 보고 움직이고, 오버드라이브는 MK-II 에 아껴라' },
  // ---- 구역 수호자 ----
  worm:   { name: '샌드웜', role: '수호자', what: '땅속으로 파고들었다가 발밑에서 솟구친다', how: '마디를 부술수록 머리가 약해진다', drop: ['module', 'armor'] },
  crane:  { name: '크레인 워커', role: '수호자', what: '미사일 팔과 집게 팔이 붙어 있으면 몸통이 단단하다', how: '팔부터 뜯어라. 뜯은 팔은 내 것', drop: ['weapon', 'missile'] },
  spider: { name: '거미 전차', role: '수호자', what: '다리 4개로 걷다가 위로 도약해 내려찍는다', how: '다리를 부수면 주저앉아 도약을 못 한다', drop: ['weapon', 'stomp'] },
  hydra:  { name: '히드라 포대', role: '수호자', what: '레이저, 산탄, 박격 머리 3개', how: '머리를 하나씩 끊어야 몸통이 드러난다. 끊은 머리는 내 것', drop: ['weapon', 'laser'] },
};
