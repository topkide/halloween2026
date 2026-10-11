import {Hunt,TYPES,DEFAULTS,settings,pose} from './hunt-core.mjs?v=20261011-impact-continue';
import {STORAGE_KEY as KEY,PROGRESS_VERSION,readProgress} from './progress.mjs?v=20261011-impact-continue';
import {createBountyReel,reelOffset} from './bounty-reel.mjs?v=20261011-impact-continue';
import {BALANCE,UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward} from './upgrades.mjs?v=20261011-impact-continue';
import {EVENT,GOODS,eventState,addTickets,addDistance,useTicket,exchange,grantShotgun,grantGhostsX2} from './event-core.mjs?v=20261011-impact-continue';
import {ghostPixel,coinPixel} from './pixel-art.mjs?v=20261011-impact-continue';

import {GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN} from './ghost-aim.mjs?v=20261011-impact-continue';
import {ShotEffects} from './shot-effects.mjs?v=20261011-impact-continue';

const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
const pointerInput=typeof window.PointerEvent==='function';
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const loaded=readProgress(key=>localStorage.getItem(key));
let {config,best,bestWave,soundOn,lastResult,economy}=loaded;
let eventData=eventState(loaded.eventState);
let engine=new Hunt({config,upgrades:economy.levels}),size={width:400,height:440,scale:1,left:0,top:0},currentRunId=null;
let lastFrame=performance.now(),hudAt=0,endingTimer=null,soundContext=null,mutedGain=null,shotNoise=null;
let reelRows=[],lastReelStep=-1,lastReelSoundAt=-Infinity,infoAction=null;
const entities=new Map();
const aim=new GhostAim();
const shots=new ShotEffects(ui['effect-layer'],{reducedMotion:()=>reducedMotion.matches});
let recoil=null,clockPulse=null,coinPulse=null;
const audioVoices=new Map();
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
  ui['ghosts-x2-ad'].disabled=eventData.ghostsX2Ready;
  ui['ghosts-x2-ad'].dataset.ready=String(eventData.ghostsX2Ready);
  setText(ui['ghosts-x2-label'],eventData.ghostsX2Ready?'적용 준비':'유령 X2');
  const buffs=[eventData.shotgunReady?'샷건':null,eventData.ghostsX2Ready?'유령 X2':null].filter(Boolean);
  setText(ui['upgrade-status'],eventData.tickets===0?'메인화면에서 플레이 기회를 충전해 주세요.':buffs.length?'다음 한 판 · '+buffs.join(' + ')+' 적용':'강화는 다음 사냥에도 유지돼요.');
}
function openUpgrades(){if(engine.state!=='ready')return;renderUpgrades();ui['upgrade-dialog'].showModal();}
function prepareBountyReel(){reelRows=createBountyReel(engine.bounty.multiplier,engine.wave);lastReelStep=-1;lastReelSoundAt=-Infinity;ui['brief-strip'].innerHTML=reelRows.map(value=>'<span>X'+value+'</span>').join('');ui['brief-strip'].style.transform='translate3d(0,0,0)';}
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
  ui['ghosts-x2-active'].hidden=engine.spawnMultiplier!==2||ready;
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
    setText(ui['brief-coins'],revealed?'+'+number(engine.bounty.coins):'+?');
    setText(ui['brief-wave'],'Wave '+engine.wave);
    setText(ui['brief-multiplier'],revealed?'X'+engine.bounty.multiplier:'X?');
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
function updateHitWallet(amount){
  if(!(amount>0))return;
  setText(ui['run-upgrade'],number(engine.earnedUpgradeCoins));
  const motion=reducedMotion.matches;
  coinPulse?.cancel();
  coinPulse=ui['run-upgrade'].animate(motion?[{color:'#e9ffbf'},{color:'#eee8ef'}]:[
    {color:'#e9ffbf',transform:'scale(1.13)'},{color:'#eee8ef',transform:'scale(1)'}
  ],{duration:220,easing:'ease-out'});
}
function hitEffect(hit,x,y,ghostBox,boxes){
  const now=performance.now(),miss=hit.kind==='miss',gold=hit.kind==='gold',shotgun=engine.weapon==='shotgun';
  if(shotgun)shots.shotgun(hit,x,y,SHOTGUN.radius*size.scale,boxes,now);else shots.shoot(hit,x,y,ghostBox,now);
  if(reducedMotion.matches)return;
  if(miss){clockPulse?.cancel();clockPulse=ui['time-label'].animate([{color:'#ff8c80',transform:'scale(1.16)'},{color:'#e1c191',transform:'scale(1)'}],{duration:220});}
  else{
    const kick=shotgun?5:gold?4:2.5;
    recoil?.cancel();recoil=document.querySelector('.arena-scenery').animate([
      {transform:'translate(0,0) scale(1)'},
      {transform:'translate(0,'+kick+'px) scale(1.018)',offset:.08},
      {transform:'translate('+(-kick*.45)+'px,'+(-kick*.5)+'px) scale(1.01)',offset:.28},
      {transform:'translate('+(kick*.2)+'px,1px) scale(1.004)',offset:.55},
      {transform:'translate(0,0) scale(1)'}
    ],{duration:shotgun?170:130,easing:'cubic-bezier(.16,1,.3,1)'});
  }
}
function clearVisuals({keepShots=false}={}){
  if(!keepShots){shots.clear();recoil?.cancel();clockPulse?.cancel();coinPulse?.cancel();}
  for(const node of entities.values())node.remove();entities.clear();ui.ending.hidden=true;
}
function flushEvents(){for(const event of engine.drain()){
  if(event.kind==='wave'){clearVisuals({keepShots:true});prepareBountyReel();updateHud();sound('reel-tick');}
  if(event.kind==='bounty-reveal'){sound(event.multiplier>=8?'gold':'bounty-stop');updateHud();}
  if(event.kind==='wave-start')sound('wave');
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
  updateHitWallet(hit.upgradeCoins);
  hitEffect(hit,x,y,ghostBox,boxes);sound(shotgun?'shotgun':'shot');sound(hit.kind==='gold'?'gold':hit.kind==='miss'?'miss':'hit',Math.min(1.35,1+Math.max(0,hit.hitCount-1)*.03));
  renderGhosts();flushEvents();updateHud();
}
if(pointerInput)ui.arena.addEventListener('pointerdown',fire);ui.arena.addEventListener('click',fire);
function start(){
  if(engine.state!=='ready')return;const entry=useTicket(eventData);if(!entry.ok)return;
  const previous=eventData;eventData=entry.state;if(!save()){eventData=previous;return;}
  ui['upgrade-dialog'].close();clearVisuals();showScreen('hunt-screen');
  currentRunId=crypto.randomUUID();engine=new Hunt({config,upgrades:economy.levels,weapon:entry.weapon,spawnMultiplier:entry.spawnMultiplier});engine.start();lastFrame=performance.now();measure();flushEvents();renderGhosts();updateHud();
}
function ready(){
  clearTimeout(endingTimer);endingTimer=null;ui['result-dialog'].close();ui['pause-dialog'].close();ui['continue-dialog'].close();clearVisuals();
  engine=new Hunt({config,upgrades:economy.levels});showScreen('lobby');updateWallet();updateHud();
}
function finish(reason,cause){
  if(endingTimer||lastResult?.runId===currentRunId)return;ui['pause-dialog'].close();ui.ending.hidden=false;
  setText(ui['ending-title'],reason==='quit'?'사냥 종료':'시간 초과!');setText(ui['ending-copy'],reason==='quit'?'오늘 밤의 보상을 정리하고 있어요.':cause==='miss'?'헛발로 남은 시간을 모두 썼어요.':'남은 시간이 모두 줄어들었어요.');if(reason==='timeout')sound('timeout');
  endingTimer=setTimeout(()=>{
    endingTimer=null;ui.ending.hidden=true;
    if(engine.canContinue())ui['continue-dialog'].showModal();else showFinalResult();
  },1200);
}
function showFinalResult(){
  if(engine.state!=='ended'||lastResult?.runId===currentRunId)return;
  ui['continue-dialog'].close();
  bestWave=Math.max(bestWave,engine.clearedWaves);
  lastResult={runId:currentRunId,clearedWaves:engine.clearedWaves,kills:engine.kills,gold:engine.gold,earnedUpgradeCoins:engine.earnedUpgradeCoins,earnedEventCoins:engine.earnedEventCoins,waveRewards:engine.waveRewards,reason:engine.reason};
  const settled=settleRun(economy,lastResult,engine.upgrades);economy=settled.economy;lastResult.rewards=settled.rewards;save();updateWallet();
  renderResult();ui['result-dialog'].showModal();
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
ui['continue-back'].addEventListener('click',showFinalResult);
ui['continue-ad'].addEventListener('click',()=>{
  if(!ui['continue-dialog'].open||!engine.canContinue())return;
  info('이어하기 · 한 판에 한 번','실제 광고 연결 전의 체험 기능이에요. 시간을 모두 회복하고 Wave '+engine.wave+'를 처음부터 다시 시작해요. 샷건과 유령 X2가 함께 적용되며 플레이 기회는 추가로 사용하지 않아요.','광고 보상 받고 이어하기',()=>{
    if(!ui['continue-dialog'].open||!engine.continueRun())return;
    ui['continue-dialog'].close();clearVisuals();showScreen('hunt-screen');lastFrame=performance.now();measure();flushEvents();renderGhosts();updateHud();sound('bounty-stop');
  });
});
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
    renderUpgrades();sound('bounty-stop');
  });
});
ui['ghosts-x2-ad'].addEventListener('click',()=>{
  if(engine.state!=='ready'||eventData.ghostsX2Ready)return;
  info('유령 X2 · 다음 사냥 한 판','실제 광고 연결 전의 체험 기능이에요. 다음 판 동안 일반 유령이 2배 더 자주 등장하고, 동시에 최대 16마리까지 나타나요. 샷건과 함께 사용할 수 있어요.','유령 X2 받기 체험',()=>{
    if(engine.state!=='ready'||eventData.ghostsX2Ready)return;
    const previous=eventData;eventData=grantGhostsX2(eventData);if(!save()){eventData=previous;return;}
    renderUpgrades();sound('bounty-stop');
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
ui['continue-dialog'].addEventListener('cancel',event=>{event.preventDefault();showFinalResult();});
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
  if(now-hudAt>80){updateHud();hudAt=now;}requestAnimationFrame(frame);
}
for(const node of document.querySelectorAll('[data-coin]'))node.innerHTML=coinPixel(node.dataset.coin);
ui['wanted-art'].innerHTML=ghostPixel('gold');ui['brief-art'].innerHTML=ghostPixel('gold');
if(loaded.refundedReloadCoins>0||loaded.refundedRewardCoins>0)save();
updateSound();ready();requestAnimationFrame(frame);
function updateSound(){ui.sound.textContent=soundOn?'♪':'♪̸';ui.sound.setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');ui.sound.setAttribute('aria-pressed',String(soundOn));if(mutedGain)mutedGain.gain.value=soundOn?.2:0;}
function playAudioVoice(source,nodes,at,duration){
  const release=()=>{for(const node of nodes)node.disconnect();audioVoices.delete(source);};
  while(audioVoices.size>=32){const [old,cleanup]=audioVoices.entries().next().value;old.stop();cleanup();}
  audioVoices.set(source,release);source.onended=release;source.start(at);source.stop(at+duration);
}
function sound(kind,power=1){
  if(!soundOn)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!soundContext){
      soundContext=new Audio();mutedGain=soundContext.createGain();mutedGain.gain.value=.2;
      // A shared limiter keeps rapid shotgun hits full-bodied without clipping.
      const limiter=soundContext.createDynamicsCompressor();
      limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.002;limiter.release.value=.08;
      mutedGain.connect(limiter);limiter.connect(soundContext.destination);
      shotNoise=soundContext.createBuffer(1,Math.ceil(soundContext.sampleRate*.16),soundContext.sampleRate);
      const samples=shotNoise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length)**1.5;
    }
    if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    const impact=['shot','shotgun','hit','gold'].includes(kind);
    if(impact){
      const at=soundContext.currentTime,noise=soundContext.createBufferSource(),filter=soundContext.createBiquadFilter(),gain=soundContext.createGain();
      const duration=kind==='shotgun'?.145:kind==='shot'?.085:.075,level=kind==='shotgun'?1.55:kind==='shot'?1.05:.7;
      noise.buffer=shotNoise;filter.type='lowpass';filter.frequency.setValueAtTime(kind==='shotgun'?2700:kind==='shot'?3400:1800,at);
      gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(level*power,at+.002);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      noise.connect(filter);filter.connect(gain);gain.connect(mutedGain);playAudioVoice(noise,[noise,filter,gain],at,duration);
    }
    const sounds={
      'reel-tick':[[900,620,.028,0,'sine']],
      'bounty-stop':[[523,784,.12,0,'triangle'],[784,1046,.24,.09,'sine']],
      shot:[[155,45,.12,0,'sine',.9]],
      shotgun:[[100,28,.16,0,'sine',1.15],[240,65,.07,0,'triangle',.15]],
      hit:[[145,52,.10,.004,'sine',.55]],
      gold:[[155,55,.12,0,'sine',.6],[1900,1350,.06,.012,'sine',.1],[2550,1700,.08,.035,'sine',.06]],
      miss:[[130,50,.08,0,'triangle']],
      wave:[[440,660,.12,0,'triangle'],[660,880,.16,.1,'sine']],
      timeout:[[440,330,.18,0,'triangle'],[330,165,.3,.2,'triangle']]
    };
    for(const [from,to,duration,delay,wave,level=.32] of sounds[kind]??[]){
      const at=soundContext.currentTime+delay,osc=soundContext.createOscillator(),gain=soundContext.createGain();
      osc.type=wave;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(to,at+duration);
      gain.gain.setValueAtTime(.001,at);gain.gain.exponentialRampToValueAtTime(level*power,at+.003);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      osc.connect(gain);gain.connect(mutedGain);playAudioVoice(osc,[osc,gain],at,duration);
    }
  }catch{}
}
