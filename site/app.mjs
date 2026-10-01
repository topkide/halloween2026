import {GhostGame,getGhostLifetime} from './game-core.mjs';
import {DEFAULT_CONFIG,validateConfig} from './balance-config.mjs';
import {createBalanceEditor} from './balance-editor.mjs';
const $=id=>document.getElementById(id),fmt=n=>Number(n.toFixed(2)).toString();
const STORAGE_KEY='catjump-ghost-hunt-balance-v1';
const ITEM_STORAGE_KEY='catjump-ghost-hunt-items-v1',ITEM_NAMES={flashlight:'손전등',talisman:'부적'};
const itemStock={flashlight:0,talisman:0};
try{const saved=JSON.parse(localStorage.getItem(ITEM_STORAGE_KEY)||'null');for(const kind of Object.keys(itemStock))if(Number.isInteger(saved?.[kind])&&saved[kind]>=0&&saved[kind]<=99)itemStock[kind]=saved[kind];}catch{}
let roundLoadout={flashlight:0,talisman:0},flashUntil=0,escapeFeedbackUntil=0;
let pendingConfig=structuredClone(DEFAULT_CONFIG);
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)pendingConfig=validateConfig(JSON.parse(saved));}catch{}
const game=new GhostGame(Math.random,pendingConfig),nodes=new Map();
let counting=false,countLeft=0,lastFrame=performance.now(),lastCount=0,announcementTime=0,soundOn=true,audioContext=null,missPosition=null;
const el={arena:$('arena'),targets:$('targets'),effects:$('effects'),overlay:$('overlay'),score:$('score'),time:$('time'),bar:$('timebar'),health:$('health'),boss:$('boss-progress'),pause:$('pause'),status:$('status'),caught:$('caught-label'),combo:$('combo-label')};
function unlockAudio(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!audioContext)audioContext=new Audio();if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});}catch{}}
function tone(frequency=700,duration=.09,type='sine',volume=.05,delay=0){
  if(!soundOn||!audioContext||audioContext.state!=='running')return;
  try{const now=audioContext.currentTime+delay,oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,now);oscillator.frequency.exponentialRampToValueAtTime(frequency*.72,now+duration);gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.007);gain.gain.exponentialRampToValueAtTime(.001,now+duration);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(now);oscillator.stop(now+duration+.02);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}catch{}
}
function showPanel(panel){el.overlay.hidden=!panel;for(const id of ['intro','countdown','paused','result'])$(id).hidden=id!==panel;}
function lockSettings(){$('balance-open').disabled=counting;$('balance-open-top').disabled=counting;}
function announce(text,seconds=1.8){$('announcement').textContent=text;$('announcement').classList.add('visible');announcementTime=seconds;}
function makeEffect(className,x,y,text='',duration=800){const n=document.createElement('div');n.className=className;n.style.left=`${x*100}%`;n.style.top=`${y*100}%`;n.textContent=text;el.effects.append(n);setTimeout(()=>n.remove(),duration);return n;}
function burst(x,y,boss=false){makeEffect('ring',x,y,'',450);for(let i=0;i<7;i++){const n=makeEffect('spark',x,y,'',500),angle=i*Math.PI*2/7;n.style.setProperty('--dx',`${Math.cos(angle)*48}px`);n.style.setProperty('--dy',`${Math.sin(angle)*48}px`);if(boss)n.style.background='#ffd192';}}
function resetVisuals(){nodes.forEach(n=>n.remove());nodes.clear();el.effects.replaceChildren();$('announcement').classList.remove('visible');announcementTime=0;$('face-cue').hidden=true;$('face-layer').hidden=true;flashUntil=0;escapeFeedbackUntil=0;$('flashlight-wash').hidden=true;}
function displayConfig(){return ['running','paused'].includes(game.state)||counting?game.config:pendingConfig;}
function renderRules(){
  const c=displayConfig(),m=c.normal;
  $('intro-time').textContent=`${fmt(c.round.startTime)}초 시작`;$('intro-health').textContent=`체력 ${c.round.health}칸`;
  $('miss-penalty').textContent=c.round.missDamage?`체력 −${c.round.missDamage}`:'체력 감소 없음';
  $('normal-rule').textContent=`좌우·대각선으로 움직이는 유령을 잡아요.\n한 마리당 ${c.normal.points}점!\n오래 플레이할수록 더 빨리 사라져요.\n${c.normal.escapePenalty?`놓치면 마리당 시간 −${fmt(c.normal.escapePenalty)}초! (부적 사용 중 제외)`:'놓쳤을 때 시간 차감은 꺼져 있어요.'}`;
  $('boss-title').textContent=`보스를 잡으면 +${fmt(c.boss.bonus)}초`;
  const bossMotion=c.boss.speed>0?'좌우·대각선으로 움직여요.':'제자리에서 기다려요.',bossTeleports=[c.boss.teleportInterval>0?`${fmt(c.boss.teleportInterval)}초마다`:null,c.boss.teleportOnHit?'맞을 때마다':null].filter(Boolean);
  $('boss-rule').textContent=`일반 유령 ${c.boss.every}마리를 새로 잡으면 등장.\n${bossMotion}${bossTeleports.length?`\n${bossTeleports.join(' / ')} 순간이동!`:''}\n${c.boss.hp}회 명중 시 ${c.boss.points}점과 추가 시간!\n처치 후 최소 ${fmt(c.boss.cooldown)}초를 기다려요.${c.face.enabled?'\n살려두면 시야 가림을 반복해요.\n큰 얼굴 뒤의 보스 본체를 잡아 멈추세요.':''}`;
  $('miss-rule').textContent=`빈 공간을 누르면 ${c.round.missDamage?`체력 −${c.round.missDamage}`:'체력 감소 없이 헛발 처리'}.\n시간이나 체력이 다하면 종료돼요.`;
  $('mode-note').textContent=`${fmt(m.interval)}초마다 등장 · 체류 ${fmt(m.life)}초 → ${fmt(m.minLife)}초`;
  $('friend-rule').textContent=c.friend.enabled?`주황색 친구는 쏘지 마세요! 맞히면 체력 −${c.friend.damage}.\n그대로 두면 지나갑니다.`:'이번 설정에서는 친구가 등장하지 않아요.';
  $('ramp-note').textContent=`플레이 ${fmt(c.difficulty.startsAt)}초부터 체류 시간이 줄어들고, ${fmt(c.difficulty.maxAt)}초부터 최고 난이도를 유지해요.`;
  $('item-rule').textContent=`손전등 · 화면의 유령을 한 번에 포획!\n부적 · ${fmt(c.items.talisman.duration)}초 무적 + 유령 무리 등장.\n사용 중에는 놓친 유령의 시간 차감도 없어요.\n효과가 끝나면 추가 유령만 사라져요.`;
  $('prepare-flashlight-rule').textContent=`일반·부적 유령을 한 번에 잡아요.\n친구는 안전해요.${c.items.flashlight.bossDamage?` 보스에게 ${c.items.flashlight.bossDamage}회 명중분 피해!`:' 보스는 피해를 받지 않아요.'}`;
  $('prepare-talisman-rule').textContent=`${fmt(c.items.talisman.duration)}초 동안 무적! 유령이 몰려와요.\n추가 유령은 마리당 ${c.items.talisman.points}점.\n효과가 끝나면 남은 추가 유령은 사라져요.${c.normal.escapePenalty?'\n부적 사용 중에는 일반 유령을 놓쳐도 시간 차감이 없어요.':''}`;
}
function beginRound(){counting=false;roundLoadout={flashlight:Math.min(1,itemStock.flashlight),talisman:Math.min(1,itemStock.talisman)};game.start(game.config,roundLoadout);showPanel(null);lockSettings();tone(870,.15,'triangle',.05);announce('유령을 직접 눌러 잡으세요!',1.4);renderRules();}
function startGame(){
  if(game.state==='running'||game.state==='paused'||counting||$('items-dialog').open||$('balance-dialog').open)return {started:false};
  unlockAudio();resetVisuals();game.reset(pendingConfig);countLeft=game.config.round.countdown;lastFrame=performance.now();
  if(countLeft>0){counting=true;lastCount=Math.ceil(countLeft);$('countdown-number').textContent=String(lastCount);showPanel('countdown');el.status.textContent='사냥 준비';tone(430,.09);}
  else beginRound();
  lockSettings();renderRules();draw();return {started:true,mode:game.mode};
}
function goHome(){counting=false;game.reset(pendingConfig);roundLoadout={flashlight:0,talisman:0};resetVisuals();showPanel('intro');lockSettings();renderRules();draw();$('start').focus({preventScroll:true});}
function pauseGame(auto=false){if(game.state!=='running')return;game.pause();showPanel('paused');el.status.textContent=auto?'화면을 떠나 자동 일시정지':'일시정지';el.pause.setAttribute('aria-label','계속하기');$('resume').focus({preventScroll:true});draw();}
function resumeGame(){if(game.state!=='paused')return;game.resume();showPanel(null);lastFrame=performance.now();el.pause.setAttribute('aria-label','일시정지');draw();}
function showResults(){
  showPanel('result');$('result-reason').textContent=game.endReason==='health'?'체력 소진':game.endReason==='escape'?'유령을 놓쳐 시간 소진':'시간 종료';$('result-score').textContent=game.score.toLocaleString('ko-KR');$('result-caught').textContent=`${game.caught+game.bonusCaught}마리`;$('result-bosses').textContent=`${game.bosses}마리`;$('result-accuracy').textContent=`${game.shots?Math.round(game.hits/game.shots*100):0}%`;$('result-duration').textContent=`${game.elapsed.toFixed(1)}초`;
  $('result-escaped').hidden=!game.escaped;$('result-escaped').textContent=`놓친 유령 ${game.escaped}마리${game.escapeTimeLost?` · 시간 −${fmt(game.escapeTimeLost)}초`:''}`;
  $('result-bonus').hidden=!game.bonusCaught;$('result-bonus').textContent=`부적 유령 ${game.bonusCaught}마리 · +${game.bonusScore.toLocaleString('ko-KR')}점`;
  lockSettings();renderRules();tone(660,.18,'triangle',.04);tone(440,.22,'triangle',.03,.15);$('replay').focus({preventScroll:true});
}
function handleEvents(){
  let escapeSoundPlayed=false;
  for(const e of game.drainEvents()){
    if(e.type==='spawn'&&e.kind==='boss'){announce(`보스 등장! 잡으면 +${fmt(game.config.boss.bonus)}초`,1.5);tone(330,.12,'sine',.03);}
    else if(e.type==='caught'&&e.source!=='flashlight'){burst(e.x,e.y);makeEffect('floating',e.x,e.y,`+${e.points}`);tone(710+Math.min(game.streak,15)*23,.08,'sine',.045);}
    else if(e.type==='teleport'||e.type==='bossHit'){burst(e.x,e.y,true);makeEffect('floating bonus',e.x,e.y,`명중! ${e.hp}회 남음`);tone(400,.1,'triangle',.045);tone(1000,.09,'sine',.03,.04);}
    else if(e.type==='bossTeleport')makeEffect('floating bonus',e.x,e.y,'슝!',500);
    else if(e.type==='bossCaught'){burst(e.x,e.y,true);makeEffect('floating bonus',e.x,e.y,`+${e.points} · +${fmt(e.bonus)}초`);announce(`보스 포획! 사냥 시간 +${fmt(e.bonus)}초`,2);document.querySelector('.hud').classList.remove('time-bonus');requestAnimationFrame(()=>document.querySelector('.hud').classList.add('time-bonus'));[660,830,990].forEach((f,i)=>tone(f,.15,'sine',.045,i*.08));}
    else if(e.type==='escape'&&!e.protected){
      makeEffect('floating miss',e.x,e.y,e.timeLost?`놓침 −${fmt(e.timeLost)}초`:'놓쳤어요');
      if(e.timeLost>0){escapeFeedbackUntil=game.elapsed+.65;if(!escapeSoundPlayed){tone(240,.1,'sine',.025);escapeSoundPlayed=true;}}
    }
    else if(e.type==='miss'){const p=missPosition||{x:.5,y:.5};if(!e.protected)makeEffect('floating miss',p.x,p.y,e.damage?`체력 −${e.damage}`:'헛발!');makeEffect(e.protected?'ring protected-ring':'ring miss-ring',p.x,p.y,'',450);if(e.damage){el.arena.classList.remove('damage');requestAnimationFrame(()=>el.arena.classList.add('damage'));}if(!e.protected)tone(130,.12,'triangle',.06);}
    else if(e.type==='friendHit'){makeEffect(e.protected?'floating':'floating miss',e.x,e.y,e.protected?'부적이 지켜줬어요!':e.damage?`친구예요! 체력 −${e.damage}`:'친구예요!');makeEffect(e.protected?'ring protected-ring':'ring miss-ring',e.x,e.y,'',450);if(e.damage){el.arena.classList.remove('damage');requestAnimationFrame(()=>el.arena.classList.add('damage'));}if(!e.protected)tone(180,.12,'triangle',.04);}
    else if(e.type==='flashlight'){flashUntil=game.elapsed+.45;for(const p of e.targets)makeEffect('ring',p.x,p.y,'',450);makeEffect('floating bonus',.5,.48,`싹쓸이! +${e.points.toLocaleString('ko-KR')}`,1100);announce(`손전등! 유령 ${e.count}마리 포획`,1.5);tone(650,.17,'sine',.035);tone(980,.2,'sine',.03,.07);}
    else if(e.type==='talismanStart'){escapeFeedbackUntil=0;announce(`부적 발동! ${fmt(e.duration)}초 동안 마음껏 잡아요!`,1.6);[520,660,830].forEach((f,i)=>tone(f,.14,'sine',.025,i*.06));}
    else if(e.type==='talismanEnd'&&game.state==='running')announce(`부적 종료 · 추가 유령 +${e.points.toLocaleString('ko-KR')}점`,1.5);
    else if(e.type==='faceWarning'){$('announcement').classList.remove('visible');announcementTime=0;}
    else if(e.type==='end')showResults();
  }
}
function ghostNode(g){
  const n=document.createElement('button');n.type='button';n.className=`ghost${g.kind==='boss'?' boss':g.kind==='friend'?' friend':g.kind==='bonus'?' bonus':''}`;n.dataset.id=String(g.id);n.setAttribute('aria-label',g.kind==='boss'?`보스 유령, ${g.hp}회 명중 필요`:g.kind==='friend'?'친구 고양이, 쏘지 마세요':g.kind==='bonus'?'부적으로 추가된 유령 잡기':'유령 잡기');
  const image=document.createElement('img');image.src=g.kind==='friend'?'assets/friend-cat.png':'assets/ghost.png';image.alt='';image.draggable=false;n.append(image);
  if(g.kind==='boss'){
    const label=document.createElement('span');label.className='boss-name';label.textContent='BOSS';n.append(label);
    const hp=document.createElement('span');hp.className='boss-hp';
    if(game.config.boss.hp<=8)for(let i=0;i<game.config.boss.hp;i++)hp.append(document.createElement('i'));else hp.append(document.createElement('b'));
    n.append(hp);
  }else{const life=document.createElement('span');life.className='life';life.append(document.createElement('i'));n.append(life);if(g.kind==='friend'||g.kind==='bonus'){const label=document.createElement('span');label.className=g.kind==='friend'?'friend-label':'bonus-label';label.textContent=g.kind==='friend'?'쏘지 마!':'부적';n.append(label);}}
  n.addEventListener('click',e=>{if(e.detail===0){e.preventDefault();shoot(g.id);}});el.targets.append(n);nodes.set(g.id,n);return n;
}
function drawFace(){
  const f=game.face,c=game.config.face,active=['running','paused'].includes(game.state),large=active&&['approach','cover','retreat'].includes(f.phase);
  $('face-cue').hidden=!(active&&f.phase==='warning');$('face-layer').hidden=!large;
  if(large){
    const progress=Math.max(0,Math.min(1,(game.elapsed-f.startedAt)/(f.endsAt-f.startedAt)));
    let size=1;
    if(f.phase==='approach')size=.35+.65*Math.min(3,Math.floor(progress*4))/3;
    else if(f.phase==='retreat')size=1-.65*Math.min(3,Math.floor(progress*4))/3;
    const art=$('face-art');art.style.width=`${c.size*size}%`;art.style.opacity=String(c.opacity/100);
  }
}
function drawHealth(){
  const max=game.config.round.health;
  if(el.health.dataset.max!==String(max)){
    el.health.dataset.max=String(max);el.health.replaceChildren();el.health.classList.toggle('compact',max>7);
    if(max<=7)for(let i=0;i<max;i++){const heart=document.createElement('span');heart.textContent='♥';el.health.append(heart);}
  }
  if(max>7)el.health.textContent=`♥ ${game.health}/${max}`;else [...el.health.children].forEach((n,i)=>n.classList.toggle('lost',i>=game.health));
  el.health.setAttribute('aria-label',`체력 ${game.health}칸 / ${max}칸`);
}
function canPrepareItems(){return !counting&&['idle','ended'].includes(game.state);}
function saveItemStock(){try{localStorage.setItem(ITEM_STORAGE_KEY,JSON.stringify(itemStock));return true;}catch{return false;}}
function renderItems(){
  const active=game.isTalismanActive(),left=Math.max(0,game.talisman.endsAt-game.elapsed),inRound=counting||['running','paused'].includes(game.state);
  $('item-prepare').hidden=!canPrepareItems();$('item-bar').classList.toggle('active',active);$('item-bar').classList.toggle('ending',active&&left<=1);el.arena.classList.toggle('talisman-active',active);
  $('item-message').textContent=active?`무적 ${left.toFixed(1)}초 · 놓침 페널티 없음`:game.elapsed<game.talisman.graceUntil?'부적 종료 · 헛발 보호 중':'한 판에 각 1회 사용';
  $('item-timer-fill').style.width=active?`${left/game.config.items.talisman.duration*100}%`:'0%';
  for(const [kind,name] of Object.entries(ITEM_NAMES)){
    const button=$(`use-${kind}`),label=inRound?(counting?(itemStock[kind]?'1회 준비됨':'준비 안 됨'):game.items[kind]?(kind==='flashlight'&&!game.canUseItem(kind)&&game.state==='running'?'유령 등장 대기':'1회 사용 가능'):roundLoadout[kind]?'사용 완료':'준비 안 됨'):`보유 ${itemStock[kind]}개`;
    button.disabled=!game.canUseItem(kind);button.setAttribute('aria-label',`${name}, ${label}`);$(`${kind}-count`).textContent=label;$(`stock-${kind}`).textContent=`보유 ${itemStock[kind]}개`;$(`claim-${kind}`).disabled=!canPrepareItems()||itemStock[kind]>=99;
  }
  $('flashlight-wash').hidden=flashUntil<=game.elapsed||!['running','paused'].includes(game.state);$('flashlight-wash').style.opacity=String(Math.max(0,(flashUntil-game.elapsed)/.45)*.5);
  const c=displayConfig();$('miss-penalty').textContent=active?'부적이 보호해요':c.round.missDamage?`체력 −${c.round.missDamage}`:'체력 감소 없음';
}
function openItems(){if(!canPrepareItems())return;$('items-feedback').textContent='사용한 아이템만 차감돼요. 한 판에 각 1회 사용할 수 있어요.';renderRules();renderItems();$('items-dialog').showModal();}
function claimItem(kind){
  if(!Object.hasOwn(ITEM_NAMES,kind)||!canPrepareItems()||itemStock[kind]>=99)return {claimed:false};
  itemStock[kind]++;const persisted=saveItemStock();$('items-feedback').textContent=`${ITEM_NAMES[kind]} +1 준비 완료!${persisted?'':' 새로고침 전까지 사용할 수 있어요.'}`;renderItems();return {claimed:true,kind,stock:itemStock[kind],simulatedAd:true};
}
function useItem(kind){
  if(game.state!=='running'||$('balance-dialog').open||$('items-dialog').open)return {used:false};
  advance(performance.now());if(game.state!=='running'||!(itemStock[kind]>0))return {used:false};
  const result=game.useItem(kind);if(result.used){itemStock[kind]--;saveItemStock();}handleEvents();draw();return result;
}
function draw(){
  const c=game.config;el.score.textContent=game.score.toLocaleString('ko-KR');el.time.textContent=Math.max(0,game.time).toFixed(1);el.bar.style.width=`${Math.min(100,game.time/c.round.startTime*100)}%`;el.bar.style.background=game.time<=8||game.elapsed<escapeFeedbackUntil?'#ff8176':'#ffb35b';document.querySelector('.clock-block').classList.toggle('urgent',game.time<=8);document.querySelector('.clock-block').classList.toggle('time-penalty',game.elapsed<escapeFeedbackUntil);drawHealth();
  const boss=game.ghosts.find(g=>g.kind==='boss'),cooldown=Math.max(0,game.bossAvailableAt-game.elapsed),kills=Math.max(0,game.nextBoss-game.caught);
  el.boss.textContent=boss?`보스 ${boss.hp}회 명중 시 +${fmt(c.boss.bonus)}초`:cooldown>0?`보스 대기 ${Math.ceil(cooldown)}초 · ${kills}마리`:`${kills}마리 잡으면 보스 등장`;
  el.caught.textContent=`포획 ${game.caught+game.bonusCaught} · 보스 ${game.bosses}`;el.combo.textContent=game.streak>=2?`${game.streak}연속 명중!`:'정확하게 조준하세요';el.pause.disabled=counting||!['running','paused'].includes(game.state);
  if(!counting&&game.state!=='paused')el.status.textContent=({idle:'준비 완료',running:`체류 ${getGhostLifetime(game.elapsed,c).toFixed(1)}초${game.elapsed>=c.difficulty.maxAt?' · MAX':''}`,ended:'사냥 종료'})[game.state];
  drawFace();renderItems();const alive=new Set(game.ghosts.map(g=>g.id));
  for(const [id,n] of nodes)if(!alive.has(id)){n.remove();nodes.delete(id);}
  for(const g of game.ghosts){
    const n=nodes.get(g.id)||ghostNode(g);n.style.left=`${g.x*100}%`;n.style.top=`${g.y*100}%`;n.disabled=game.state!=='running';
    if(g.kind==='boss'){
      const hp=n.querySelector('.boss-hp');
      if(c.boss.hp<=8)[...hp.children].forEach((p,i)=>p.classList.toggle('empty',i>=g.hp));else hp.firstChild.textContent=`${g.hp} / ${c.boss.hp}`;
      n.setAttribute('aria-label',`보스 유령, ${g.hp}회 명중 필요`);
    }else{n.querySelector('.life i').style.width=`${Math.max(0,1-g.age/g.life)*100}%`;n.style.opacity=g.life-g.age<Math.min(.6,g.life*.2)?'.58':'1';}
  }
}
function advance(now){
  const dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(counting){countLeft-=dt;const value=Math.max(1,Math.ceil(countLeft));if(value!==lastCount){lastCount=value;$('countdown-number').textContent=String(value);tone(430,.09);}if(countLeft<=0)beginRound();}else game.tick(dt);
  if(announcementTime>0&&game.state==='running'){announcementTime-=dt;if(announcementTime<=0)$('announcement').classList.remove('visible');}
  handleEvents();draw();
}
function shoot(id,position=null){
  if(game.state!=='running')return;
  advance(performance.now());if(game.state!=='running')return;missPosition=position;
  game.shoot(id);
  handleEvents();draw();
}
el.arena.addEventListener('pointerdown',e=>{if(e.button!==0||game.state!=='running'||!el.overlay.hidden)return;e.preventDefault();const button=e.target.closest('.ghost'),rect=el.arena.getBoundingClientRect();shoot(button?Number(button.dataset.id):null,{x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height});});
$('start').addEventListener('click',startGame);$('replay').addEventListener('click',startGame);$('back').addEventListener('click',goHome);$('quit').addEventListener('click',goHome);$('resume').addEventListener('click',resumeGame);el.pause.addEventListener('click',()=>game.state==='paused'?resumeGame():pauseGame());
$('sound').addEventListener('click',()=>{soundOn=!soundOn;$('sound').textContent=soundOn?'♪ 소리 켬':'♪ 소리 끔';$('sound').setAttribute('aria-pressed',String(soundOn));if(soundOn){unlockAudio();tone(650);}});
function saveBalance(config){
  pendingConfig=validateConfig(config);let stored=true;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(pendingConfig));}catch{stored=false;}
  if(game.state==='idle'){game.reset(pendingConfig);draw();}
  renderRules();$('settings-notice').textContent=stored?'밸런스 적용됨 · 다른 웹에서는 저장한 DB 파일을 불러오세요.':'다음 판에 적용됩니다. 브라우저에 보관할 수 없어 DB 파일로 저장해 주세요.';
  return {saved:true,persisted:stored,applies:'next_round'};
}
const editor=createBalanceEditor({getConfig:()=>structuredClone(pendingConfig),onSave:saveBalance,onOpen:()=>{if(game.state==='running')pauseGame();}});
$('balance-open').addEventListener('click',()=>{if(!counting)editor.open();});
$('balance-open-top').addEventListener('click',()=>{if(!counting)editor.open();});
$('item-prepare').addEventListener('click',openItems);
$('items-close').addEventListener('click',()=>$('items-dialog').close());$('items-ready').addEventListener('click',()=>$('items-dialog').close());
for(const kind of Object.keys(ITEM_NAMES)){
  $(`claim-${kind}`).addEventListener('click',()=>claimItem(kind));
  const button=$(`use-${kind}`);button.addEventListener('pointerdown',event=>{if(event.button===0){event.preventDefault();useItem(kind);}});button.addEventListener('click',event=>{if(event.detail===0)useItem(kind);});
}
document.addEventListener('keydown',e=>{if($('balance-dialog').open||$('items-dialog').open||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){if(game.state==='running')pauseGame();else if(game.state==='paused')resumeGame();}else if(game.state==='running'&&(e.code==='Digit1'||e.code==='Digit2')){e.preventDefault();useItem(e.code==='Digit1'?'flashlight':'talisman');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game.state==='running')pauseGame(true);else if(counting)goHome();}lastFrame=performance.now();});
window.addEventListener('blur',()=>{if(game.state==='running')pauseGame(true);});
function frame(now){advance(now);requestAnimationFrame(frame);}renderRules();draw();requestAnimationFrame(frame);
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
  const tools=[
    {name:'read_ghost_hunt_state',title:'게임 상태 확인',description:'점수, 체력, 보스와 얼굴 장난, 아이템 보유량과 부적 상태를 읽습니다.',inputSchema:empty,annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({...game.snapshot(),itemStock:{...itemStock}})},
    {name:'prepare_ghost_item',title:'아이템 준비 테스트',description:'사냥 전 모의 광고 보상으로 선택한 아이템 1개를 준비합니다. 실제 광고는 재생하지 않습니다.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:Object.keys(ITEM_NAMES)}},required:['kind'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>claimItem(input?.kind)},
    {name:'use_ghost_item',title:'사냥 아이템 사용',description:'진행 중인 사냥에서 준비한 손전등 또는 부적을 사용합니다. 한 판에 각 1회 사용 가능합니다.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:Object.keys(ITEM_NAMES)}},required:['kind'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>useItem(input?.kind)},
    {name:'start_ghost_hunt',title:'사냥 시작',description:'저장된 설정으로 다음 판을 시작합니다.',inputSchema:empty,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>startGame()},
    {name:'read_ghost_balance',title:'밸런스 설정 읽기',description:'다음 판에 적용할 전체 밸런스 설정을 읽습니다.',inputSchema:empty,annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>structuredClone(pendingConfig)},
    {name:'save_ghost_balance',title:'밸런스 설정 저장',description:'전체 밸런스 DB를 검증하고 다음 판에 적용합니다. 이 브라우저에 적용되며, 다른 웹으로 옮기려면 밸런스 화면에서 DB 파일을 저장하세요.',inputSchema:{type:'object',properties:{config:{type:'object'}},required:['config'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>saveBalance(input?.config)}
  ];
  for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
