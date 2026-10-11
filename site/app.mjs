import {Hunt,TYPES,DEFAULTS,settings,pose} from './hunt-core.mjs?v=20261011-event-ui';
import {STORAGE_KEY as KEY,PROGRESS_VERSION,readProgress} from './progress.mjs?v=20261011-event-ui';
import {createBountyReel,reelOffset} from './bounty-reel.mjs?v=20261011-event-ui';
import {BALANCE,UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward} from './upgrades.mjs?v=20261011-event-ui';
import {EVENT,GOODS,eventState,addTickets,addDistance,useTicket,exchange,grantShotgun} from './event-core.mjs?v=20261011-event-ui';
import {ghostPixel,coinPixel} from './pixel-art.mjs?v=20261011-event-ui';

import {GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN} from './ghost-aim.mjs?v=20261011-event-ui';
import {ShotEffects} from './shot-effects.mjs?v=20261011-event-ui';

const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
const pointerInput=typeof window.PointerEvent==='function';
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const loaded=readProgress(key=>localStorage.getItem(key));
let {config,best,bestWave,soundOn,lastResult,economy}=loaded;
let eventData=eventState(loaded.eventState);
let engine=new Hunt({config,upgrades:economy.levels}),size={width:400,height:440,scale:1,left:0,top:0},currentRunId=null;
let lastFrame=performance.now(),hudAt=0,toastUntil=0,endingTimer=null,soundContext=null,mutedGain=null,shotNoise=null;
let reelRows=[],lastReelStep=-1,lastReelSoundAt=-Infinity,infoAction=null;
const entities=new Map();
const aim=new GhostAim();
const shots=new ShotEffects(ui['effect-layer'],{reducedMotion:()=>reducedMotion.matches});
let feedbackUntil=0,recoil=null,clockPulse=null;
const coinGains=new Set();
let coinPulse=null,coinGainSerial=0;
const number=n=>Math.round(n).toLocaleString('ko-KR');
function setText(node,text){if(node.textContent!==String(text))node.textContent=String(text);}
function save(){try{localStorage.setItem(KEY,JSON.stringify({progressVersion:PROGRESS_VERSION,best,bestWave,soundOn,config,lastResult,economy,eventState:eventData}));return true;}catch{setText(ui['storage-note'],'이 브라우저에서는 기록을 저장할 수 없어요. 브라우저 저장 설정을 확인해 주세요.');return false;}}
function showScreen(id){for(const name of ['lobby','hunt-screen','closed-screen'])ui[name].hidden=name!==id;}
function measure(){const r=ui.arena.getBoundingClientRect();if(r.width>0)size={width:400,height:Math.max(180,r.height/r.width*400),scale:r.width/400,left:r.left,top:r.top};if(r.width>0)shots.resize(r.width,r.height);}
new ResizeObserver(measure).observe(ui.arena);window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{passive:true});
function updateWallet(){
  for(const id of ['wallet-upgrade','upgrade-balance'])setText(ui[id],number(economy.upgradeCoins));
  for(const id of ['wallet-event','shop-balance'])setText(ui[id],number(economy.eventCoins));
  setText(ui['ticket-count'],eventData.tickets+' / '+EVENT.maxTickets);
  setText(ui['distance-count'],eventData.distance+' / '+EVENT.distancePerTicket+'m');
  ui['distance-fill'].style.transform='scaleX('+eventData.distance/EVENT.distancePerTicket+')';
  ui['owned-decor'].innerHTML=eventData.owned.filter(id=>id!=='badge').map(id=>id==='friend'?'<span class="owned-friend">'+ghostPixel('wisp')+'</span>':'<span class="owned-lantern">'+coinPixel('pumpkin')+'</span>').join('');
}
function effectLabel(key,levels){
  const e=upgradeEffects(levels,{recoveryBasePercent:config.waveRecoveryPercent});
  const percent=value=>Number(value.toFixed(1)).toLocaleString('ko-KR')+'%';
  return key==='time'?percent(e.timeRecoveryPercent):key==='gold'?percent(e.goldChance*100):'+'+percent(e.shopBonusPercent);
}
function renderUpgrades(){
  updateWallet();
  const names={time:'시간 회복',gold:'황금 유령 확률',shop:'웨이브 보상 증가'};
  const descriptions={time:'웨이브 완료 시 남은 시간 회복',gold:'황금 유령 등장 확률',shop:'클리어 및 황금 유령 보상'};
  ui['upgrade-cards'].innerHTML=Object.entries(UPGRADES).map(([key,definition])=>{
    const level=economy.levels[key],cost=upgradeCost(level),max=cost===null,next={...economy.levels,[key]:level+1};
    const label=max?definition.name+' 최대 레벨':definition.name+' 강화 · '+number(cost)+' 코인 · 다음 효과 '+effectLabel(key,next);
    return '<article class="upgrade-card"><div class="upgrade-art"><img src="assets/upgrade-'+key+'.png" alt="" width="80" height="80"></div><div class="upgrade-copy"><h3>'+names[key]+' <span>Lv.'+level+'</span></h3><p>'+descriptions[key]+' <strong>'+effectLabel(key,economy.levels)+'</strong></p><small>'+(max?'최대 강화 완료':'다음 '+effectLabel(key,next)+' · 최대 Lv.'+BALANCE.maxLevel)+'</small></div><button type="button" class="upgrade-buy" data-upgrade="'+key+'" aria-label="'+label+'" '+(max||economy.upgradeCoins<cost?'disabled':'')+'>'+coinPixel('ghost')+'<b>'+(max?'MAX':number(cost))+'</b></button></article>';
  }).join('');
  ui['upgrade-start'].disabled=eventData.tickets===0;
  setText(ui['upgrade-tickets'],'('+eventData.tickets+'/'+EVENT.maxTickets+')');
  ui['shotgun-ad'].disabled=eventData.shotgunReady;
  ui['shotgun-ad'].dataset.ready=String(eventData.shotgunReady);
  setText(ui['shotgun-label'],eventData.shotgunReady?'장착 완료':'샷건 장착');
  setText(ui['upgrade-status'],eventData.tickets===0?'메인화면에서 플레이 기회를 충전해 주세요.':eventData.shotgunReady?'다음 한 판은 샷건으로 시작해요.':'강화는 다음 사냥에도 유지돼요.');
}
function openUpgrades(){if(engine.state!=='ready')return;renderUpgrades();ui['upgrade-dialog'].showModal();}
function toast(text,ms=1700){setText(ui['field-toast'],text);ui['field-toast'].classList.add('visible');toastUntil=performance.now()+ms;}
function prepareBountyReel(){reelRows=createBountyReel(engine.bounty.multiplier,engine.wave);lastReelStep=-1;lastReelSoundAt=-Infinity;ui['brief-strip'].innerHTML=reelRows.map(value=>'<span>×'+value+'</span>').join('');ui['brief-strip'].style.transform='translate3d(0,0,0)';}
function renderBountyReel(now){
  if(engine.state!=='briefing'||engine.bountyRevealed||!reelRows.length)return;
  const offset=reelOffset(config.briefingDuration-engine.briefingLeft,reelRows.length-1),step=Math.floor(offset);
  if(!reducedMotion.matches)ui['brief-strip'].style.transform='translate3d(0,'+(-offset/reelRows.length*100)+'%,0)';
  if(step!==lastReelStep){lastReelStep=step;if(now-lastReelSoundAt>=65){sound('reel-tick');lastReelSoundAt=now;}}
}
function updateHud(){
  const ready=engine.state==='ready',briefing=engine.state==='briefing'||engine.state==='paused'&&engine.pausedFrom==='briefing';
  ui['hunt-screen'].dataset.state=engine.state;
  ui['shotgun-active'].hidden=engine.weapon!=='shotgun'||ready;
  const remaining=engine.remaining??config.duration;
  const seconds=Math.ceil(remaining);setText(ui['time-label'],Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));ui['time-fill'].style.transform='scaleX('+Math.min(1,Math.max(0,remaining/config.duration))+')';
  ui['hunt-screen'].dataset.urgent=String(remaining<=10&&!ready);
  setText(ui['wave-number'],engine.wave??1);setText(ui['wave-count'],engine.waveKills??0);setText(ui['wave-goal'],engine.waveGoal??config.baseGoal);
  setText(ui['run-upgrade'],number(engine.earnedUpgradeCoins??0));
  const revealed=engine.bountyRevealed;
  setText(ui.multiplier,revealed?'×'+engine.bounty.multiplier:'×?');
  ui.pause.disabled=!['playing','briefing'].includes(engine.state);ui['settings-open'].disabled=!ready;ui['wave-intro'].hidden=!briefing;
  ui['time-recovery'].hidden=!briefing||!(engine.lastTimeRecovery>0);
  if(briefing){
    const recovered=engine.lastTimeRecovery??0;
    setText(ui['time-recovery'],recovered>0?'시간 +'+(recovered<.1?'0.1초 미만':Number(recovered.toFixed(1))+'초')+' 회복':'');
    ui['wave-intro'].dataset.reveal=revealed?'revealed':'rolling';
    ui['brief-reel'].hidden=revealed||reducedMotion.matches;ui['brief-multiplier'].hidden=!revealed&&!reducedMotion.matches;
    setText(ui['brief-status'],revealed?(engine.bounty.multiplier>=8?'대박! 현상금 확정':'이번 웨이브 현상금 확정'):'이번 현상금은 몇 배일까요?');
    setText(ui['brief-wave'],'Wave '+engine.wave);
    setText(ui['brief-multiplier'],revealed?'×'+engine.bounty.multiplier:'×?');
  }
}
function renderGhosts(){
  const alive=new Set(engine.ghosts.map(g=>g.id));for(const [id,node] of entities)if(!alive.has(id)){node.remove();entities.delete(id);}
  for(const ghost of engine.ghosts){
    const def=TYPES[ghost.type],p=pose(ghost,size.width,size.height);let node=entities.get(ghost.id);
    if(!node){node=document.createElement('button');node.type='button';node.className='ghost-target type-'+ghost.type;node.dataset.ghost=String(ghost.id);node.setAttribute('aria-label',def.name+' 사격');node.innerHTML=ghostPixel(ghost.type);entities.set(ghost.id,node);ui['ghost-layer'].append(node);}
    const w=def.width*size.scale,h=def.height*size.scale;
    node.style.width=w+'px';node.style.height=h+'px';node.style.transform=`translate(${p.x*size.scale-w/2}px,${p.y*size.scale-h/2}px) scale(${p.sx},${p.sy})`;
    node.style.opacity=p.alpha;node.style.pointerEvents=p.alpha<.3||engine.state!=='playing'?'none':'auto';node.disabled=engine.state!=='playing'||p.alpha<.3;node.firstElementChild.style.transform='scaleX('+p.facing+')';
  }
}
function showCoinGain(amount){
  if(!(amount>0))return;
  // The total updates on the same hit; short, bounded labels keep rapid catches readable.
  setText(ui['run-upgrade'],number(engine.earnedUpgradeCoins));
  const label=document.createElement('span');label.className='coin-gain';label.textContent='+'+number(amount);
  label.style.left=[50,26,74][coinGainSerial++%3]+'%';
  ui['coin-gains'].append(label);coinGains.add(label);
  if(coinGains.size>4){const oldest=coinGains.values().next().value;oldest.remove();coinGains.delete(oldest);}
  const motion=reducedMotion.matches;
  const animation=label.animate(motion?[
    {opacity:1},{opacity:1,offset:.7},{opacity:0}
  ]:[
    {opacity:0,transform:'translate(-50%, 5px) scale(.85)'},
    {opacity:1,transform:'translate(-50%, 0) scale(1.08)',offset:.14},
    {opacity:1,transform:'translate(-50%, -6px) scale(1)',offset:.65},
    {opacity:0,transform:'translate(-50%, -13px) scale(1)'}
  ],{duration:850,easing:'ease-out',fill:'forwards'});
  animation.onfinish=()=>{label.remove();coinGains.delete(label);};
  coinPulse?.cancel();
  coinPulse=ui['run-upgrade'].animate(motion?[{color:'#e9ffbf'},{color:'#eee8ef'}]:[
    {color:'#e9ffbf',transform:'scale(1.13)'},{color:'#eee8ef',transform:'scale(1)'}
  ],{duration:220,easing:'ease-out'});
}
function hitEffect(hit,x,y,ghostBox,boxes){
  const now=performance.now(),miss=hit.kind==='miss',gold=hit.kind==='gold',shotgun=engine.weapon==='shotgun';
  if(shotgun)shots.shotgun(hit,x,y,SHOTGUN.radius*size.scale,boxes,now);else shots.shoot(hit,x,y,ghostBox,now);
  ui['shot-feedback'].dataset.kind=miss?'miss':gold?'gold':'hit';ui['shot-feedback'].classList.add('visible');
  setText(ui['shot-feedback-title'],miss?'빗나감':shotgun?'샷건 '+hit.hitCount+'마리 명중!':gold?'황금 명중!':'명중!');
  setText(ui['shot-feedback-detail'],miss?'−'+hit.penalty+'초':[hit.upgradeCoins?'강화 코인 +'+hit.upgradeCoins:'',hit.bonusCoins?'클리어 시 호박 +'+hit.bonusCoins:''].filter(Boolean).join(' · '));feedbackUntil=now+650;
  if(reducedMotion.matches)return;
  if(miss){clockPulse?.cancel();clockPulse=ui['time-label'].animate([{color:'#ff8c80',transform:'scale(1.16)'},{color:'#e1c191',transform:'scale(1)'}],{duration:220});}
  else{recoil?.cancel();recoil=document.querySelector('.arena-scenery').animate([{transform:'translate(0,0)'},{transform:'translate(0,2px)',offset:.2},{transform:'translate(1px,-1px)',offset:.5},{transform:'translate(0,0)'}],{duration:130});}
}
function clearVisuals({keepShots=false}={}){
  if(!keepShots){shots.clear();feedbackUntil=0;ui['shot-feedback'].classList.remove('visible');recoil?.cancel();clockPulse?.cancel();coinPulse?.cancel();for(const label of coinGains){label.getAnimations().forEach(a=>a.cancel());label.remove();}coinGains.clear();coinGainSerial=0;}
  for(const node of entities.values())node.remove();entities.clear();toastUntil=0;ui['field-toast'].classList.remove('visible');setText(ui['field-toast'],'');ui.ending.hidden=true;
}
function flushEvents(){for(const event of engine.drain()){
  if(event.kind==='wave'){clearVisuals({keepShots:true});prepareBountyReel();updateHud();sound('reel-tick');}
  if(event.kind==='bounty-reveal'){sound(event.multiplier>=8?'gold':'bounty-stop');updateHud();}
  if(event.kind==='wave-start')sound('wave');
  if(event.kind==='gold-limit')toast('황금 사냥 완료! 다음 웨이브를 열어보세요.',1700);
  if(event.kind==='end')finish(event.reason,event.cause);
}}
function fire(event){
  if(engine.state!=='playing'||event.target.closest('#wave-intro, #ending'))return;
  if(event.type==='pointerdown'&&(event.button!==0||event.isPrimary===false))return;
  if(event.type==='click'&&pointerInput&&(event.detail>0||event.pointerType))return;
  event.preventDefault();
  // Match the visible sprite first, so transparent padding cannot steal a shot
  // from a ghost behind it. Keyboard activation still addresses its own button.
  const keyboard=event.type==='click'&&!event.detail&&!event.pointerType;
  const target=keyboard?event.target.closest('[data-ghost]'):null;
  const candidates=engine.ghosts.flatMap(g=>{
    const node=entities.get(g.id);if(!node||node.disabled)return [];
    const rect=node.getBoundingClientRect();
    return [{id:g.id,type:g.type,rect,clip:{left:size.left,top:size.top,right:size.left+size.width*size.scale,bottom:size.top+size.height*size.scale},facing:pose(g,size.width,size.height).facing,layer:g.type==='gold'?2:0}];
  });
  candidates.sort((a,b)=>a.layer-b.layer);
  const id=keyboard?(target?Number(target.dataset.ghost):null):pickGhost(candidates,event.clientX,event.clientY,aim.masks);
  const g=id===null?null:engine.ghosts.find(g=>g.id===id),p=g?pose(g,size.width,size.height):null;
  const x=keyboard&&p?p.x*size.scale:event.clientX-size.left,y=keyboard&&p?p.y*size.scale:event.clientY-size.top;
  const ghostBox=g&&p?{x:p.x*size.scale,y:p.y*size.scale,width:TYPES[g.type].width*size.scale*p.sx,height:TYPES[g.type].height*size.scale*p.sy,facing:p.facing}:null;
  const shotgun=engine.weapon==='shotgun',boxes=new Map();
  if(shotgun)for(const ghost of engine.ghosts){const q=pose(ghost,size.width,size.height);boxes.set(ghost.id,{x:q.x*size.scale,y:q.y*size.scale,width:TYPES[ghost.type].width*size.scale*q.sx,height:TYPES[ghost.type].height*size.scale*q.sy,facing:q.facing});}
  const ids=shotgun?pickShotgunGhosts(candidates,x+size.left,y+size.top,SHOTGUN.radius*size.scale,aim.masks):null;
  const hit=shotgun?engine.shootShotgun(ids):engine.shoot(id);if(!hit)return;
  // Remove the consumed target before any optional visual or audio work.
  for(const target of hit.targets){entities.get(target.ghost.id)?.remove();entities.delete(target.ghost.id);}
  showCoinGain(hit.upgradeCoins);
  hitEffect(hit,x,y,ghostBox,boxes);sound(shotgun?'shotgun':'shot');sound(hit.kind==='gold'?'gold':hit.kind==='miss'?'miss':'hit');
  renderGhosts();flushEvents();updateHud();
}
if(pointerInput)ui.arena.addEventListener('pointerdown',fire);ui.arena.addEventListener('click',fire);
function start(){
  if(engine.state!=='ready')return;const entry=useTicket(eventData);if(!entry.ok)return;
  const previous=eventData;eventData=entry.state;if(!save()){eventData=previous;return;}
  ui['upgrade-dialog'].close();clearVisuals();showScreen('hunt-screen');
  currentRunId=crypto.randomUUID();engine=new Hunt({config,upgrades:economy.levels,weapon:entry.weapon});engine.start();lastFrame=performance.now();measure();flushEvents();renderGhosts();updateHud();
}
function ready(){
  clearTimeout(endingTimer);endingTimer=null;ui['result-dialog'].close();ui['pause-dialog'].close();clearVisuals();
  engine=new Hunt({config,upgrades:economy.levels});showScreen('lobby');updateWallet();updateHud();
}
function finish(reason,cause){
  if(endingTimer||lastResult?.runId===currentRunId)return;ui['pause-dialog'].close();ui.ending.hidden=false;
  setText(ui['ending-title'],reason==='quit'?'사냥 종료':'시간 초과!');setText(ui['ending-copy'],reason==='quit'?'오늘 밤의 보상을 정리하고 있어요.':cause==='miss'?'헛발로 남은 시간을 모두 썼어요.':'남은 시간이 모두 줄어들었어요.');if(reason==='timeout')sound('timeout');
  bestWave=Math.max(bestWave,engine.clearedWaves);
  lastResult={runId:currentRunId,clearedWaves:engine.clearedWaves,kills:engine.kills,gold:engine.gold,earnedUpgradeCoins:engine.earnedUpgradeCoins,earnedEventCoins:engine.earnedEventCoins,waveRewards:engine.waveRewards,reason};
  const settled=settleRun(economy,lastResult,engine.upgrades);economy=settled.economy;lastResult.rewards=settled.rewards;save();updateWallet();
  renderResult();
  endingTimer=setTimeout(()=>{endingTimer=null;ui.ending.hidden=true;ui['result-dialog'].showModal();},1200);
}
function renderResult(){
  if(!lastResult)return;
  const rewards=lastResult.rewards,doubled=economy.doubledRuns.includes(lastResult.runId);
  setText(ui['result-upgrade-coins'],'+'+number(rewards.upgradeCoins));
  setText(ui['result-event-coins'],'+'+number(rewards.eventCoins*(doubled?2:1)));
  setText(ui['result-waves'],lastResult.clearedWaves);
  setText(ui['result-tickets'],'('+eventData.tickets+'/'+EVENT.maxTickets+')');
  ui['result-double'].disabled=doubled||rewards.eventCoins===0;
  ui['result-double'].dataset.claimed=String(doubled);
  setText(ui['result-double-label'],doubled?'2배 받기 완료':'보상 2배');
  setText(ui['result-status'],doubled?'호박 코인 보상을 2배로 받았어요!':rewards.eventCoins===0?'웨이브를 완료하면 호박 코인을 받아요.':'광고 체험으로 호박 코인만 2배');
}
function pause(){if(engine.pause()){ui['pause-dialog'].showModal();updateHud();}}
function resume(){ui['pause-dialog'].close();engine.resume();lastFrame=performance.now();updateHud();}
ui.pause.addEventListener('click',pause);ui.resume.addEventListener('click',resume);
ui.quit.addEventListener('click',()=>{resume();engine.end('quit');flushEvents();updateHud();});
ui['result-home'].addEventListener('click',ready);
ui['result-retry'].addEventListener('click',()=>{ready();openUpgrades();});ui['upgrade-open'].addEventListener('click',openUpgrades);ui['upgrade-start'].addEventListener('click',start);
ui['upgrade-cards'].addEventListener('click',event=>{
  const button=event.target.closest('[data-upgrade]');if(!button||button.disabled||engine.state!=='ready')return;
  const key=button.dataset.upgrade,purchase=buyUpgrade(economy,key);if(!purchase.ok)return;
  const previous=economy;economy=purchase.economy;if(!save()){economy=previous;return;}
  renderUpgrades();sound('bounty-stop');setText(ui['upgrade-status'],UPGRADES[key].name+' Lv. '+economy.levels[key]+' 강화 완료');
});
function renderShop(){
  updateWallet();ui['shop-items'].innerHTML=GOODS.map(item=>{
    const owned=eventData.owned.includes(item.id);
    return '<article class="shop-item"><div class="shop-item-art">'+(item.icon==='ghost'?ghostPixel('wisp'):coinPixel('pumpkin'))+'</div><div><h3>'+item.name+'</h3><p>'+item.copy+'</p><button data-good="'+item.id+'" '+(owned||economy.eventCoins<item.price?'disabled':'')+'>'+(owned?'교환 완료':coinPixel('pumpkin')+item.price+' · 교환')+'</button></div></article>';
  }).join('');
}
ui['shop-open'].addEventListener('click',()=>{if(engine.state!=='ready')return;renderShop();setText(ui['shop-status'],'');ui['shop-dialog'].showModal();});
ui['shop-items'].addEventListener('click',event=>{
  const button=event.target.closest('[data-good]');if(!button||button.disabled)return;const purchase=exchange(eventData,economy,button.dataset.good);if(!purchase.ok)return;
  const prevEconomy=economy,prevEvent=eventData;economy=purchase.economy;eventData=purchase.state;if(!save()){economy=prevEconomy;eventData=prevEvent;return;}
  renderShop();setText(ui['shop-status'],'교환 완료! 메인화면에서 장식을 확인하세요.');sound('gold');
});
function info(title,copy,label,action){setText(ui['info-title'],title);setText(ui['info-copy'],copy);ui['info-action'].hidden=!action;setText(ui['info-action'],label??'');infoAction=action;ui['info-dialog'].showModal();}
ui['info-action'].addEventListener('click',()=>{const action=infoAction;infoAction=null;if(action)action();ui['info-dialog'].close();});
function changeTickets(next){const previous=eventData;eventData=next;if(!save())eventData=previous;updateWallet();}
ui['package-open'].addEventListener('click',()=>info('특별 패키지','할로윈 특별 패키지 구성은 준비 중이에요. 현재 프로토타입에서는 결제하지 않아요.'));
ui['ad-open'].addEventListener('click',()=>info('플레이 기회 +3',eventData.tickets>=30?'플레이 기회가 가득 찼어요. 사냥을 시작해 보세요.':'실제 광고가 연결되기 전의 체험 기능이에요. 버튼을 누르면 플레이 기회 3개를 받아요. 최대 30개까지 보유할 수 있어요.','기회 +3 체험',eventData.tickets>=30?null:()=>changeTickets(addTickets(eventData,3))));
ui['shotgun-ad'].addEventListener('click',()=>{
  if(engine.state!=='ready'||eventData.shotgunReady)return;
  info('샷건 · 다음 사냥 한 판','실제 광고 연결 전의 체험 기능이에요. 샷건을 받으면 다음 판 내내 터치한 곳과 주변 유령을 함께 잡아요. 한 마리라도 맞히면 시간 감소가 없어요.','샷건 받기 체험',()=>{
    if(engine.state!=='ready'||eventData.shotgunReady)return;
    const previous=eventData;eventData=grantShotgun(eventData);if(!save()){eventData=previous;return;}
    renderUpgrades();sound('bounty-stop');setText(ui['upgrade-status'],'샷건 장착 완료! 사냥을 시작해 보세요.');
  });
});
ui['result-double'].addEventListener('click',()=>{
  if(!ui['result-dialog'].open||!lastResult||ui['result-double'].disabled)return;
  const result=lastResult;
  info('획득 보상 2배','실제 광고 연결 전의 체험 기능이에요. 이번 판 호박 코인 '+number(result.rewards.eventCoins)+'개를 추가로 받아 총 '+number(result.rewards.eventCoins*2)+'개가 돼요. 강화 코인은 그대로 유지돼요.','보상 2배 체험',()=>{
    if(lastResult?.runId!==result.runId||!ui['result-dialog'].open)return;
    const bonus=doubleRunReward(economy,result);if(!bonus.awarded)return;
    const previous=economy;economy=bonus.economy;if(!save()){economy=previous;return;}
    updateWallet();renderResult();sound('gold');
  });
});
ui['distance-open'].addEventListener('click',()=>info('일반게임에서 기회 모으기','일반게임에서 누적 300m마다 플레이 기회 1개를 얻어요. 지금은 연동 전이므로 300m 달성을 체험할 수 있어요. 최대 30개일 때는 추가 적립되지 않아요.','일반게임 +300m 체험',()=>changeTickets(addDistance(eventData,300))));
ui['close-event'].addEventListener('click',()=>showScreen('closed-screen'));ui.reopen.addEventListener('click',()=>showScreen('lobby'));
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>ui[button.dataset.close].close());
ui['pause-dialog'].addEventListener('cancel',event=>{event.preventDefault();resume();});ui['result-dialog'].addEventListener('cancel',event=>{event.preventDefault();ready();});
ui.sound.addEventListener('click',()=>{soundOn=!soundOn;updateSound();save();});
document.addEventListener('keydown',event=>{if(!event.repeat&&event.key==='Escape'&&['playing','briefing'].includes(engine.state)){event.preventDefault();pause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','briefing'].includes(engine.state))pause();lastFrame=performance.now();});
function fillSettings(){for(const [id,key] of [['setting-duration','duration'],['setting-recovery-percent','waveRecoveryPercent'],['setting-recovery-limit','recoveryLimit'],['setting-spawn','spawn'],['setting-gold-interval','goldInterval'],['setting-gold-limit','goldLimit']])ui[id].value=config[key];}
ui['settings-open'].addEventListener('click',()=>{if(engine.state!=='ready')return;fillSettings();setText(ui['settings-status'],'');ui['settings-dialog'].showModal();});
ui['settings-form'].addEventListener('submit',event=>{event.preventDefault();if(!ui['settings-form'].reportValidity())return;config=settings({...config,duration:Number(ui['setting-duration'].value),waveRecoveryPercent:Number(ui['setting-recovery-percent'].value),recoveryLimit:Number(ui['setting-recovery-limit'].value),spawn:Number(ui['setting-spawn'].value),goldInterval:Number(ui['setting-gold-interval'].value),goldLimit:Number(ui['setting-gold-limit'].value)});save();ui['settings-dialog'].close();ready();});
ui['reset-records'].addEventListener('click',()=>info('최고 기록을 초기화할까요?','최고 웨이브 기록만 0으로 돌아가요. 보유 코인, 강화, 교환한 장식과 플레이 기회는 유지돼요.','최고 기록 초기화',()=>{const previous=bestWave;bestWave=0;if(!save())bestWave=previous;updateWallet();setText(ui['settings-status'],'최고 웨이브 기록을 초기화했어요.');}));
ui.defaults.addEventListener('click',()=>{config={...DEFAULTS};fillSettings();save();setText(ui['settings-status'],'기본값을 복원했어요.');});
ui['demo-credit'].addEventListener('click',()=>{const previous=economy;economy={...economy,upgradeCoins:Math.min(1e9,economy.upgradeCoins+100),eventCoins:Math.min(1e9,economy.eventCoins+100)};if(!save()){economy=previous;return;}updateWallet();setText(ui['settings-status'],'체험용 강화 코인과 호박 코인을 각각 100개 받았어요.');});
function frame(now){
  const dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(['playing','briefing'].includes(engine.state)){engine.tick(dt);flushEvents();renderGhosts();renderBountyReel(now);}
  shots.render(now);
  if(feedbackUntil&&now>feedbackUntil){feedbackUntil=0;ui['shot-feedback'].classList.remove('visible');}
  if(toastUntil&&now>toastUntil){ui['field-toast'].classList.remove('visible');toastUntil=0;}
  if(now-hudAt>80){updateHud();hudAt=now;}requestAnimationFrame(frame);
}
for(const node of document.querySelectorAll('[data-coin]'))node.innerHTML=coinPixel(node.dataset.coin);
ui['wanted-art'].innerHTML=ghostPixel('gold');ui['brief-art'].innerHTML=ghostPixel('gold');
if(loaded.refundedReloadCoins>0||loaded.refundedRewardCoins>0)save();
updateSound();ready();requestAnimationFrame(frame);
function updateSound(){ui.sound.textContent=soundOn?'♪':'♪̸';ui.sound.setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');ui.sound.setAttribute('aria-pressed',String(soundOn));if(mutedGain)mutedGain.gain.value=soundOn?.2:0;}
function sound(kind){
  if(!soundOn)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!soundContext){soundContext=new Audio();mutedGain=soundContext.createGain();mutedGain.gain.value=.2;mutedGain.connect(soundContext.destination);
      shotNoise=soundContext.createBuffer(1,Math.ceil(soundContext.sampleRate*.085),soundContext.sampleRate);
      const samples=shotNoise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length)**2;
    }
    if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    if(kind==='shot'||kind==='shotgun'){
      const noise=soundContext.createBufferSource(),gain=soundContext.createGain(),at=soundContext.currentTime;
      noise.buffer=shotNoise;gain.gain.setValueAtTime(kind==='shotgun'?1.7:1.3,at);gain.gain.exponentialRampToValueAtTime(.001,at+.085);
      noise.connect(gain);gain.connect(mutedGain);noise.onended=()=>{noise.disconnect();gain.disconnect();};noise.start(at);noise.stop(at+.085);
    }
    const sounds={'reel-tick':[[900,620,.028,0,'sine']],'bounty-stop':[[523,784,.12,0,'triangle'],[784,1046,.24,.09,'sine']],shotgun:[[100,28,.16,0,'sine'],[650,70,.05,0,'sawtooth']],shot:[[145,38,.12,0,'sine'],[920,140,.035,0,'sawtooth']],miss:[[130,50,.08,0,'triangle']],hit:[[320,120,.08,.025,'triangle'],[1100,700,.035,.03,'sine']],gold:[[784,990,.15,0,'triangle'],[988,1320,.18,.08,'triangle'],[1318,1760,.25,.16,'sine']],wave:[[440,660,.12,0,'triangle'],[660,880,.16,.1,'sine']],timeout:[[440,330,.18,0,'triangle'],[330,165,.3,.2,'triangle']]};
    for(const [from,to,duration,delay,wave] of sounds[kind]??sounds.hit){const at=soundContext.currentTime+delay,osc=soundContext.createOscillator(),gain=soundContext.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(to,at+duration);gain.gain.setValueAtTime(.32,at);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(mutedGain);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration);}
  }catch{}
}
