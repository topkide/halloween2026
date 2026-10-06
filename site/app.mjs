import {GhostGame} from './game-core.mjs';
import {DEFAULT_CONFIG,validateConfig,COLLECTIONS} from './balance-config.mjs';
import {createBalanceEditor} from './balance-editor.mjs';
const $=id=>document.getElementById(id),fmt=n=>Number(n.toFixed(2)).toString();
const STORAGE_KEY='catjump-ghost-hunt-balance-v6',ITEM_KEY='catjump-ghost-hunt-items-v1',COLLECTION_KEY='catjump-ghost-hunt-collection-v1';
const ITEM_NAMES={flashlight:'손전등',talisman:'부적'};
let pendingConfig=structuredClone(DEFAULT_CONFIG),itemStock={flashlight:0,talisman:0},owned=[],storageOK=true;
try{const raw=localStorage.getItem(STORAGE_KEY);if(raw)pendingConfig=validateConfig(JSON.parse(raw));}catch{}
try{const v=JSON.parse(localStorage.getItem(ITEM_KEY)||'{}');for(const k of Object.keys(itemStock))itemStock[k]=v[k]>0?1:0;const ids=JSON.parse(localStorage.getItem(COLLECTION_KEY)||'[]');if(Array.isArray(ids))owned=[...new Set(ids.filter(id=>COLLECTIONS.some(c=>c.id===id)))];}catch{}
function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{storageOK=false;$('collection-save-note').textContent='브라우저 저장이 제한되어 이번 방문 동안만 유지됩니다.';return false;}}
const game=new GhostGame(Math.random,pendingConfig),nodes=new Map();
let counting=false,countLeft=0,lastFrame=performance.now(),lastCount=0,announcementTime=0,soundOn=true,audioContext=null,missPosition=null;
const el={arena:$('arena'),targets:$('targets'),effects:$('effects'),overlay:$('overlay'),score:$('score'),time:$('time'),bar:$('timebar'),health:$('health'),boss:$('boss-progress'),pause:$('pause'),status:$('status')};
function unlockAudio(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;if(!audioContext)audioContext=new A();if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});}catch{}}
function tone(f=700,d=.09,type='sine',volume=.04,delay=0){if(!soundOn||!audioContext||audioContext.state!=='running')return;try{const now=audioContext.currentTime+delay,o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*.75,now+d);g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(volume,now+.007);g.gain.exponentialRampToValueAtTime(.001,now+d);o.connect(g);g.connect(audioContext.destination);o.start(now);o.stop(now+d+.02);o.onended=()=>{o.disconnect();g.disconnect();};}catch{}}
function showPanel(panel){el.overlay.hidden=!panel;for(const id of ['intro','countdown','paused','continue-panel','result'])$(id).hidden=id!==panel;}
function announce(text,seconds=1.5){$('announcement').textContent=text;$('announcement').classList.add('visible');announcementTime=seconds;}
function makeEffect(className,x,y,text='',duration=800){const n=document.createElement('div');n.className=className;n.style.left=`${x*100}%`;n.style.top=`${y*100}%`;n.textContent=text;el.effects.append(n);setTimeout(()=>n.remove(),duration);}
function burst(x,y){makeEffect('ring',x,y,'',450);}
function resetVisuals(){nodes.forEach(n=>n.remove());nodes.clear();el.effects.replaceChildren();announcementTime=0;$('announcement').classList.remove('visible');}
function displayConfig(){return game.state==='idle'||game.state==='finished'?pendingConfig:game.config;}
function lockSettings(){$('balance-open').disabled=counting;$('balance-open-top').disabled=counting;}
function renderRules(){
  const c=displayConfig(),first=c.normalTable[0],last=c.normalTable.at(-1);
  $('intro-time').textContent=`${fmt(c.round.startTime)}초 시작`;$('intro-health').textContent=`체력 ${c.round.health}칸`;
  $('normal-rule').textContent=`사라지기 전에 터치! 시간대에 따라 등장 간격·체류 시간·점수·놓침 페널티가 달라져요.\n처치 ${first.points} → ${last.points}점`;
  $('boss-title').textContent=`보스 처치 +${fmt(c.boss.timeBonus)}초`;
  $('boss-rule').textContent=`첫 ${fmt(c.boss.firstAt)}초에 등장, 처치 후 ${fmt(c.boss.respawn)}초 대기.\n${c.boss.hp}회 명중해야 잡혀요. 맞으면 순간이동!\n얼굴 방해 ${fmt(c.boss.warning)}초 전에 알려줘요. 가려져도 뒤의 유령을 잡을 수 있어요.`;
  $('miss-rule').textContent=`허공 터치 시 체력 −${c.round.missDamage}.\n시간·체력 소진 시 광고 이어하기 한 번!`;
  $('bomb-rule').textContent='빨간 테두리의 폭탄은 터치하면 체력 −1!\n그냥 사라지면 일반 유령과 같은 점수를 받아요.';
  $('mode-note').textContent=`체류 ${fmt(first.life)}초 → ${fmt(last.life)}초 · 시간대 ${c.normalTable.length}구간`;
  $('ramp-note').textContent='마지막 구간 이후 난이도는 유지돼요. 이어하기 시 플레이 타임을 되돌려 난이도를 낮춰요.';
  $('item-rule').textContent=`손전등 · ${fmt(c.items.flashlight.duration)}초간 새 유령까지 자동 처치.\n부적 · ${fmt(c.items.talisman.duration)}초간 일반 유령이 빠르게 등장.\n폭탄과 보스 능력은 쉬고, 놓침·헛발 페널티는 없어요.\n두 아이템을 함께 사용할 수 있어요.`;
  $('prepare-flashlight-rule').textContent=`${fmt(c.items.flashlight.duration)}초 동안 모든 유령을 자동 처치해요.\n보스도 즉시 처치! 폭탄도 점수를 줘요.`;
  $('prepare-talisman-rule').textContent=`${fmt(c.items.talisman.duration)}초간 빠른 소환 + 헛발·놓침 보호.\n종료 시 보스 외 유령 정리, 이후 ${fmt(c.items.talisman.grace)}초간 헛발 보호.\n보스 능력은 부적이 끝난 뒤 새로 시간을 재요.`;
  $('continue-description').textContent=`체력·남은 시간 완전 회복\n플레이 타임 ${fmt(game.config.continue.rewind)}초 되감기 + 무료 부적 발동`;
}
function renderCollection(){
  $('collection-count').textContent=`${owned.length} / 9`;
  $('collection-grid').replaceChildren(...COLLECTIONS.map(c=>{const card=document.createElement('div');card.className=`collection-card ${owned.includes(c.id)?'owned':'locked'}`;const im=document.createElement('img');im.src=`assets/${c.id}.png`;im.alt=c.name;im.loading='lazy';const name=document.createElement('span');name.textContent=c.name;const status=document.createElement('small');status.textContent=owned.includes(c.id)?'획득 완료':'미획득';card.append(im,name,status);return card;}));
}
function beginRound(){counting=false;game.start(game.config,itemStock);showPanel(null);lockSettings();tone(870,.15,'triangle');announce('폭탄은 건드리지 마세요!',1.5);renderRules();}
function startGame(){if(counting||!['idle','finished'].includes(game.state)||$('items-dialog').open||$('balance-dialog').open)return {started:false};unlockAudio();resetVisuals();game.reset(pendingConfig);countLeft=game.config.round.countdown;lastFrame=performance.now();if(countLeft>0){counting=true;lastCount=Math.ceil(countLeft);$('countdown-number').textContent=String(lastCount);showPanel('countdown');tone(430);}else beginRound();lockSettings();renderRules();draw();return {started:true};}
function goHome(){counting=false;game.reset(pendingConfig);resetVisuals();showPanel('intro');lockSettings();renderRules();draw();}
function pauseGame(){if(game.state!=='running')return;game.pause();el.effects.replaceChildren();showPanel('paused');el.pause.setAttribute('aria-label','계속하기');draw();}
function resumeGame(){if(game.state!=='paused')return;game.resume();showPanel(null);lastFrame=performance.now();el.pause.setAttribute('aria-label','일시정지');draw();}
function finalResults(){
  const result=game.finish(owned);if(result===null)return;
  owned=[...new Set([...owned,...result])];persist(COLLECTION_KEY,owned);renderCollection();
  showPanel('result');$('result-reason').textContent=game.endReason==='health'?'체력 소진':game.endReason==='quit'?'사냥 종료':'제한 시간 종료';
  $('result-score').textContent=game.score.toLocaleString('ko-KR');$('result-caught').textContent=`${game.caught}마리`;$('result-bosses').textContent=`${game.bosses}마리`;$('result-accuracy').textContent=`${game.shots?Math.round(game.hits/game.shots*100):0}%`;$('result-duration').textContent=`${game.peakTime.toFixed(1)}초`;
  $('result-escaped').hidden=false;$('result-escaped').textContent=`놓침 ${game.escaped}마리 · 시간 −${fmt(game.escapeTimeLost)}초`;
  $('result-bonus').hidden=false;$('result-bonus').textContent=`폭탄 회피·자동 처치 ${game.bombsAvoided}마리 · 이어하기 ${game.continues}/1`;
  const box=$('result-collections');box.replaceChildren();if(!result.length){const p=document.createElement('p');p.textContent=owned.length===9?'9종을 모두 모았어요!':'이번에는 발견한 분실물이 없어요.';box.append(p);}else for(const id of result){const c=COLLECTIONS.find(x=>x.id===id),card=document.createElement('div');card.className='result-collection';const im=document.createElement('img');im.src=`assets/${id}.png`;im.alt='';const name=document.createElement('span');name.textContent=c.name;card.append(im,name);box.append(card);}
  renderRules();lockSettings();draw();
}
function offerContinue(){resetVisuals();if(game.canContinue()){showPanel('continue-panel');$('continue-reason').textContent=game.endReason==='health'?'체력을 모두 썼어요':'제한 시간이 끝났어요';$('continue-score').textContent=`${game.score.toLocaleString('ko-KR')}점`;renderRules();}else finalResults();tone(440,.2,'triangle');}
function continueWithAd(){if(!game.canContinue())return {continued:false};const ok=game.continueRound();if(ok){resetVisuals();showPanel(null);lastFrame=performance.now();handleEvents();draw();}return {continued:ok,simulatedAd:true};}
function handleEvents(){
  for(const e of game.drainEvents()){
    if(e.type==='spawn'&&e.kind==='boss'){announce('보스 등장! 잡으면 시간이 늘어요.');tone(330,.12);}
    else if(e.type==='caught'||e.type==='bombReward'){if(e.source!=='flashlight'||el.effects.childElementCount<16)makeEffect(e.type==='bombReward'?'floating bonus':'floating',e.x,e.y,`+${e.points}`);if(e.source==='shot'){burst(e.x,e.y);tone(780,.06);}}
    else if(e.type==='bossCaught'){burst(e.x,e.y);makeEffect('floating bonus',e.x,e.y,`+${e.points} · +${fmt(e.bonus)}초`);announce(`보스 처치! 시간 +${fmt(e.bonus)}초`);tone(990,.15);}
    else if(e.type==='teleport'){burst(e.x,e.y);makeEffect('floating bonus',e.x,e.y,`${e.hp}회 남음`);tone(420,.08);}
    else if(e.type==='escape'&&!e.protected&&e.timeLost>0){makeEffect('floating miss',e.x,e.y,`−${fmt(e.timeLost)}초`);tone(240,.05,'sine',.012);}
    else if(e.type==='miss'){const p=missPosition||{x:.5,y:.5};makeEffect(e.protected?'ring protected-ring':'ring miss-ring',p.x,p.y,'',400);if(e.damage){makeEffect('floating miss',p.x,p.y,`체력 −${e.damage}`);tone(130,.10,'triangle');}}
    else if(e.type==='bombHit'){makeEffect('floating miss',e.x,e.y,'폭발! 체력 −1');makeEffect('ring miss-ring',e.x,e.y,'',450);tone(120,.18,'triangle');}
    else if(e.type==='flashlight'){announce(`손전등! ${fmt(e.duration)}초 자동 사냥`);tone(980,.2);}
    else if(e.type==='talismanStart'){announce(e.automatic?'이어하기 보너스! 무료 부적 발동':'부적 발동! 마음껏 잡아요.');tone(830,.16);}
    else if(e.type==='talismanEnd'){announce('부적 종료 · 잠시 헛발을 보호해요.');tone(540,.12);}
    else if(e.type==='faceWarning'){announcementTime=0;$('announcement').classList.remove('visible');}
    else if(e.type==='end')offerContinue();
  }
}
function ghostNode(g){
  const n=document.createElement('button');n.type='button';n.className=`ghost ${g.kind}`;n.dataset.id=g.id;
  const im=document.createElement('img');im.src=g.kind==='bomb'?'assets/bomb.png':'assets/ghost.png';im.alt='';im.draggable=false;n.append(im);
  if(g.kind==='boss'){const label=document.createElement('span');label.className='boss-name';label.textContent='BOSS';const hp=document.createElement('span');hp.className='boss-hp';n.append(label,hp);}else{const life=document.createElement('span');life.className='life';life.append(document.createElement('i'));n.append(life);}
  n.addEventListener('click',e=>{if(e.detail===0){e.preventDefault();shoot(g.id);}});el.targets.append(n);nodes.set(g.id,n);return n;
}
function drawFace(){const active=['running','paused'].includes(game.state),f=game.face;$('face-cue').hidden=!(active&&f.phase==='warning');$('face-layer').hidden=!(active&&f.phase==='cover');if(f.phase==='warning')$('face-warning-text').textContent=`${Math.max(1,Math.ceil(f.endsAt-game.clock))}초 뒤 시야를 가려요!`;$('face-art').style.width=`${game.config.boss.size}%`;$('face-art').style.opacity=String(game.config.boss.opacity/100);}
function drawHealth(){const max=game.config.round.health;if(el.health.dataset.max!==String(max)){el.health.dataset.max=String(max);el.health.replaceChildren();if(max<=7)for(let i=0;i<max;i++){const n=document.createElement('span');n.textContent='♥';el.health.append(n);}}if(max>7)el.health.textContent=`♥ ${game.health}/${max}`;else [...el.health.children].forEach((n,i)=>n.classList.toggle('lost',i>=game.health));el.health.setAttribute('aria-label',`체력 ${game.health}/${max}`);}
function canPrepare(){return !counting&&['idle','finished'].includes(game.state);}
function renderItems(){
  const playing=['running','paused'].includes(game.state),tal=playing&&game.isTalismanActive(),flash=playing&&game.isFlashActive(),left=Math.max(0,game.talisman.endsAt-game.clock),flashLeft=Math.max(0,game.flashUntil-game.clock),grace=playing&&game.clock<game.talisman.graceUntil;
  $('item-prepare').hidden=!canPrepare();$('item-bar').classList.toggle('active',tal);$('item-bar').classList.toggle('ending',tal&&left<=1);el.arena.classList.toggle('talisman-active',tal);
  const states=[];if(flash)states.push(`손전등 ${flashLeft.toFixed(1)}초`);if(tal)states.push(`부적 ${left.toFixed(1)}초`);else if(grace)states.push(`헛발 보호 ${(game.talisman.graceUntil-game.clock).toFixed(1)}초`);
  $('item-message').textContent=states.join(' · ')||'각각 1개 보유 · 한 판에 각 1회';$('item-timer-fill').style.width=tal?`${left/game.config.items.talisman.duration*100}%`:'0%';
  for(const [k,name] of Object.entries(ITEM_NAMES)){const button=$(`use-${k}`);button.disabled=!game.canUseItem(k);const label=playing&&game.used[k]?'이번 판 사용 완료':`보유 ${itemStock[k]}/1`;$(`${k}-count`).textContent=label;button.setAttribute('aria-label',`${name}, ${label}`);$(`stock-${k}`).textContent=`보유 ${itemStock[k]}/1`;$(`claim-${k}`).disabled=!canPrepare()||itemStock[k]>=1;}
  $('flashlight-wash').hidden=!flash;$('flashlight-wash').style.opacity='.35';$('miss-penalty').textContent=tal||grace?'보호 중':`체력 −${displayConfig().round.missDamage}`;
}
function draw(){
  el.score.textContent=game.score.toLocaleString('ko-KR');el.time.textContent=game.time.toFixed(1);el.bar.style.width=`${Math.min(100,game.time/game.config.round.startTime*100)}%`;document.querySelector('.clock-block').classList.toggle('urgent',game.time<=8);drawHealth();
  const boss=game.ghosts.find(g=>g.kind==='boss');el.boss.textContent=boss?`보스 ${boss.hp}회 남음`:`보스까지 ${Math.max(0,Math.ceil(game.bossAt-game.clock))}초`;
  $('caught-label').textContent=`포획 ${game.caught} · 보스 ${game.bosses}`;$('combo-label').textContent=`플레이 ${game.elapsed.toFixed(1)}초`;
  el.pause.disabled=counting||!['running','paused'].includes(game.state);const row=game.normalRow();el.status.textContent=counting?'준비 중':game.state==='running'?`체류 ${fmt(row.life)}초 · ${row.points}점`:game.state==='paused'?'일시정지':game.state==='idle'?'준비 완료':'사냥 종료';
  drawFace();renderItems();const alive=new Set(game.ghosts.map(g=>g.id));for(const [id,n] of nodes)if(!alive.has(id)){n.remove();nodes.delete(id);}
  for(const g of game.ghosts){const n=nodes.get(g.id)||ghostNode(g);n.style.left=`${g.x*100}%`;n.style.top=`${g.y*100}%`;n.disabled=game.state!=='running';n.setAttribute('aria-label',g.kind==='boss'?`보스 유령 ${g.hp}회 남음`:g.kind==='bomb'?'폭탄 유령, 터치 금지':'일반 유령 잡기');if(g.kind==='boss')n.querySelector('.boss-hp').textContent=`${g.hp} / ${game.config.boss.hp}`;else n.querySelector('.life i').style.width=`${Math.max(0,1-g.age/g.life)*100}%`;}
}
function advance(now){const dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;if(counting){countLeft-=dt;const n=Math.max(1,Math.ceil(countLeft));if(n!==lastCount){lastCount=n;$('countdown-number').textContent=n;tone(430);}if(countLeft<=0)beginRound();}else game.tick(dt);if(announcementTime>0&&game.state==='running'){announcementTime-=dt;if(announcementTime<=0)$('announcement').classList.remove('visible');}handleEvents();draw();}
function shoot(id,position=null){if(game.state!=='running')return;advance(performance.now());if(game.state!=='running')return;missPosition=position;game.shoot(id);handleEvents();draw();}
function claimItem(kind){if(!Object.hasOwn(ITEM_NAMES,kind)||!canPrepare()||itemStock[kind]>=1)return {claimed:false};itemStock[kind]=1;const saved=persist(ITEM_KEY,itemStock);$('items-feedback').textContent=`${ITEM_NAMES[kind]} 준비 완료!${saved?'':' 이번 방문 동안만 유지돼요.'}`;renderItems();return {claimed:true,simulatedAd:true};}
function useItem(kind){if(game.state!=='running'||$('balance-dialog').open||$('items-dialog').open)return {used:false};advance(performance.now());if(!itemStock[kind])return {used:false};const r=game.useItem(kind);if(r.used){itemStock[kind]=0;persist(ITEM_KEY,itemStock);}handleEvents();draw();return r;}
function saveBalance(value){pendingConfig=validateConfig(value);const saved=persist(STORAGE_KEY,pendingConfig);if(game.state==='idle')game.reset(pendingConfig);renderRules();draw();$('settings-notice').textContent=saved?'최신 밸런스 저장됨 · 다음 판부터 적용됩니다.':'DB 파일을 저장해 보관해 주세요.';return {saved:true,persisted:saved};}
const editor=createBalanceEditor({getConfig:()=>structuredClone(pendingConfig),onSave:saveBalance,onOpen:()=>{if(game.state==='running')pauseGame();}});
for(const id of ['balance-open','balance-open-top'])$(id).onclick=()=>{if(!counting)editor.open();};
$('start').onclick=startGame;$('replay').onclick=startGame;$('back').onclick=goHome;$('resume').onclick=resumeGame;
$('quit').onclick=()=>{game.resume();game.end('quit');handleEvents();};el.pause.onclick=()=>game.state==='paused'?resumeGame():pauseGame();
$('continue-ad').onclick=continueWithAd;$('finish-round').onclick=finalResults;
$('item-prepare').onclick=()=>{if(canPrepare()){renderRules();renderItems();$('items-dialog').showModal();}};
$('items-close').onclick=$('items-ready').onclick=()=>$('items-dialog').close();
for(const k of Object.keys(ITEM_NAMES)){$(`claim-${k}`).onclick=()=>claimItem(k);$(`use-${k}`).onclick=()=>useItem(k);}
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent=soundOn?'♪ 소리 켬':'♪ 소리 끔';$('sound').setAttribute('aria-pressed',String(soundOn));if(soundOn){unlockAudio();tone();}};
el.arena.addEventListener('pointerdown',e=>{if(e.button!==0||game.state!=='running'||!el.overlay.hidden)return;e.preventDefault();const target=e.target.closest('.ghost'),r=el.arena.getBoundingClientRect();shoot(target?Number(target.dataset.id):null,{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height});});
document.addEventListener('keydown',e=>{if($('balance-dialog').open||$('items-dialog').open||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){if(game.state==='running')pauseGame();else if(game.state==='paused')resumeGame();}else if(game.state==='running'&&['Digit1','Digit2'].includes(e.code)){e.preventDefault();useItem(e.code==='Digit1'?'flashlight':'talisman');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(game.state==='running')pauseGame();else if(counting)goHome();}lastFrame=performance.now();});window.addEventListener('blur',()=>{if(game.state==='running')pauseGame();});
renderRules();renderCollection();draw();function frame(now){advance(now);requestAnimationFrame(frame);}requestAnimationFrame(frame);
if(document.modelContext?.registerTool){const life=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
 const actions=[
  {name:'read_ghost_hunt_state',title:'게임 상태',description:'시간대, 보스, 아이템, 컬렉션과 이어하기 상태를 확인합니다.',inputSchema:empty,annotations:{readOnlyHint:true},execute:()=>({...game.snapshot(),itemStock:{...itemStock},owned:[...owned]})},
  {name:'read_ghost_balance',title:'밸런스 테이블',description:'다음 판의 v6 밸런스를 확인합니다.',inputSchema:empty,annotations:{readOnlyHint:true},execute:()=>structuredClone(pendingConfig)},
  {name:'save_ghost_balance',title:'밸런스 저장',description:'검증 후 다음 판에 적용합니다.',inputSchema:{type:'object',properties:{config:{type:'object'}},required:['config'],additionalProperties:false},execute:i=>saveBalance(i.config)},
  {name:'start_ghost_hunt',title:'사냥 시작',description:'준비된 설정과 아이템으로 시작합니다.',inputSchema:empty,execute:startGame},
  ...['prepare','use'].map(action=>({name:`${action}_ghost_item`,title:action==='prepare'?'아이템 준비 테스트':'아이템 사용',description:action==='prepare'?'광고 완료를 모의하여 아이템을 지급합니다.':'한 판에 1회 아이템 사용.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['flashlight','talisman']}},required:['kind'],additionalProperties:false},execute:i=>action==='prepare'?claimItem(i.kind):useItem(i.kind)})),
  {name:'continue_ghost_hunt',title:'광고 이어하기 테스트',description:'실제 광고 없이 완료 보상을 모의합니다.',inputSchema:empty,execute:continueWithAd}
 ];for(const action of actions)try{Promise.resolve(document.modelContext.registerTool(action,{signal:life.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>life.abort(),{once:true});
}
