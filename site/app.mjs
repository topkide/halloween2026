import {Hunt,TYPES,DEFAULTS,settings,pose} from './hunt-core.mjs?v=20261011-missions';
import {STORAGE_KEY as KEY,PROGRESS_VERSION,readProgress} from './progress.mjs?v=20261011-missions';
import {createBountyReel,reelOffset} from './bounty-reel.mjs?v=20261011-missions';
import {UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward} from './upgrades.mjs?v=20261011-missions';
import {EVENT,eventState,addTickets,addDistance,useTicket,grantShotgun,grantGhostsX2} from './event-core.mjs?v=20261011-missions';
import {ghostPixel,coinPixel} from './pixel-art.mjs?v=20261011-missions';

import {GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN} from './ghost-aim.mjs?v=20261011-missions';
import {ShotEffects} from './shot-effects.mjs?v=20261011-missions';
import {CombatAudio} from './combat-audio.mjs?v=20261011-missions';
import {missionState,addMissionCaptures,missionSummary,claimMissionReward} from './missions.mjs?v=20261011-missions';

const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
const pointerInput=typeof window.PointerEvent==='function';
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const loaded=readProgress(key=>localStorage.getItem(key));
let {config,best,bestWave,soundOn,lastResult,economy}=loaded;
let eventData=eventState(loaded.eventState);
let missionData=missionState(loaded.missions);
let engine=new Hunt({config,upgrades:economy.levels}),size={width:400,height:440,scale:1,left:0,top:0},currentRunId=null;
let lastFrame=performance.now(),hudAt=0,endingTimer=null,soundContext=null,mutedGain=null,combatAudio=null;
let reelRows=[],lastReelStep=-1,lastReelSoundAt=-Infinity,infoAction=null;
const entities=new Map();
const aim=new GhostAim();
const shots=new ShotEffects(ui['effect-layer'],{reducedMotion:()=>reducedMotion.matches,enabled:()=>engine.state==='playing'});
let clockPulse=null,coinPulse=null;
const audioVoices=new Map();
const number=n=>Math.round(n).toLocaleString('ko-KR');
function setText(node,text){if(node.textContent!==String(text))node.textContent=String(text);}
function save(){try{localStorage.setItem(KEY,JSON.stringify({progressVersion:PROGRESS_VERSION,best,bestWave,soundOn,config,lastResult,economy,eventState:eventData,missions:missionData}));return true;}catch{setText(ui['storage-note'],'이 브라우저에서는 기록을 저장할 수 없어요. 브라우저 저장 설정을 확인해 주세요.');return false;}}
function showScreen(id){for(const name of ['lobby','hunt-screen','closed-screen'])ui[name].hidden=name!==id;}
function measure(){const r=ui.arena.getBoundingClientRect();if(r.width>0)size={width:400,height:Math.max(180,r.height/r.width*400),scale:r.width/400,left:r.left,top:r.top};if(r.width>0)shots.resize(r.width,r.height);}
new ResizeObserver(measure).observe(ui.arena);window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{passive:true});
function updateWallet(){
  for(const id of ['wallet-upgrade','upgrade-balance'])setText(ui[id],number(economy.upgradeCoins));
  setText(ui['wallet-event'],number(economy.eventCoins));
  setText(ui['ticket-count'],eventData.tickets+' / '+EVENT.maxTickets);
  ui['ad-open'].disabled=eventData.tickets>=EVENT.maxTickets;
  setText(ui['distance-count'],eventData.distance+' / '+EVENT.distancePerTicket+'m');
  ui['distance-fill'].style.transform='scaleX('+eventData.distance/EVENT.distancePerTicket+')';
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
    const level=economy.levels[key],cost=upgradeCost(level),max=cost===null;
    const label=max?definition.name+' 최대 레벨':definition.name+' 강화 · '+number(cost)+' 코인';
    return '<article class="upgrade-card"><div class="upgrade-art"><img src="assets/upgrade-'+key+'.png" alt="" width="80" height="80"></div><div class="upgrade-copy"><h3>'+names[key]+' <span>Lv.'+level+'</span></h3><p>'+descriptions[key]+' <strong>'+effectLabel(key,economy.levels)+'</strong></p></div><button type="button" class="upgrade-buy" data-upgrade="'+key+'" aria-label="'+label+'" '+(max||economy.upgradeCoins<cost?'disabled':'')+'>'+coinPixel('ghost')+'<b>'+(max?'MAX':number(cost))+'</b></button></article>';
  }).join('');
  ui['upgrade-start'].disabled=eventData.tickets===0;
  setText(ui['upgrade-tickets'],'('+eventData.tickets+'/'+EVENT.maxTickets+')');
  ui['shotgun-ad'].disabled=eventData.shotgunReady;
  ui['shotgun-ad'].dataset.ready=String(eventData.shotgunReady);
  setText(ui['shotgun-label'],eventData.shotgunReady?'적용 중':'샷건 장착');
  ui['shotgun-ad'].setAttribute('aria-label',eventData.shotgunReady?'샷건 적용 중':'광고 보상으로 샷건 장착');
  ui['ghosts-x2-ad'].disabled=eventData.ghostsX2Ready;
  ui['ghosts-x2-ad'].dataset.ready=String(eventData.ghostsX2Ready);
  setText(ui['ghosts-x2-label'],eventData.ghostsX2Ready?'적용 중':'유령 X2');
  ui['ghosts-x2-ad'].setAttribute('aria-label',eventData.ghostsX2Ready?'유령 X2 적용 중':'광고 보상으로 유령 X2 적용');
}
function openUpgrades(){if(engine.state!=='ready')return;renderUpgrades();ui['upgrade-dialog'].showModal();}
function renderMissions(){
  const summary=missionSummary(missionData,economy.levels);
  ui['mission-list'].innerHTML=summary.rows.map(row=>{
    const art=row.kind==='capture'?ghostPixel(row.id):'<img src="assets/upgrade-'+(row.key??row.id)+'.png" alt="" width="80" height="80">';
    return '<article class="mission-card" data-complete="'+row.complete+'"><div class="mission-art">'+art+'</div><div class="mission-copy"><h3>'+row.title+'</h3><div class="mission-track" role="progressbar" aria-label="'+row.title+'" aria-valuemin="0" aria-valuemax="'+row.goal+'" aria-valuenow="'+row.current+'"><i style="transform:scaleX('+row.ratio+')"></i><span>'+row.current+' / '+row.goal+'</span></div></div><span class="mission-status">'+(row.complete?'완료':'진행 중')+'</span></article>';
  }).join('');
  setText(ui['mission-total-count'],summary.completed+' / '+summary.total);
  ui['mission-total-fill'].style.transform='scaleX('+summary.completed/summary.total+')';
  ui['mission-total-track'].setAttribute('aria-valuenow',String(summary.completed));
  ui['mission-claim'].disabled=!summary.canClaim;
  ui['mission-claim'].dataset.claimed=String(summary.rewardClaimed);
  setText(ui['mission-claim'],summary.rewardClaimed?'획득 완료':'받기');
}
ui['mission-open'].addEventListener('click',()=>{if(engine.state!=='ready')return;renderMissions();ui['mission-dialog'].showModal();});
ui['mission-back'].addEventListener('click',()=>ui['mission-dialog'].close());
ui['mission-dialog'].addEventListener('cancel',event=>{event.preventDefault();ui['mission-dialog'].close();});
ui['mission-claim'].addEventListener('click',()=>{
  if(!ui['mission-dialog'].open||engine.state!=='ready')return;
  const reward=claimMissionReward(missionData,economy.levels);if(!reward.awarded)return;
  const previous=missionData;missionData=reward.state;if(!save()){missionData=previous;return;}
  renderMissions();sound('gold');
});
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
  ui['effect-layer'].hidden=engine.state!=='playing';
  ui['shotgun-active'].hidden=engine.weapon!=='shotgun'||ready;
  ui['ghosts-x2-active'].hidden=engine.spawnMultiplier!==2||ready;
  const remaining=engine.remaining??config.duration;
  const seconds=Math.ceil(remaining);setText(ui['time-label'],Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));ui['time-fill'].style.transform='scaleX('+Math.min(1,Math.max(0,remaining/config.duration))+')';
  ui['hunt-screen'].dataset.urgent=String(remaining>0&&remaining<=10&&!ready&&engine.state!=='ended');
  setText(ui['wave-number'],engine.wave??1);setText(ui['wave-count'],engine.waveKills??0);setText(ui['wave-goal'],engine.waveGoal??config.baseGoal);
  setText(ui['run-upgrade'],number(engine.earnedUpgradeCoins??0));
  const revealed=engine.bountyRevealed;
  setText(ui.multiplier,revealed?'×'+engine.bounty.multiplier:'×?');
  ui.pause.disabled=!['playing','briefing'].includes(engine.state);ui['settings-open'].disabled=!ready;ui['wave-intro'].hidden=!briefing;
  if(briefing){
    ui['wave-intro'].dataset.reveal=revealed?'revealed':'rolling';
    ui['brief-reel'].hidden=revealed||reducedMotion.matches;ui['brief-multiplier'].hidden=!revealed&&!reducedMotion.matches;
    setText(ui['brief-coins'],revealed?'+'+number(engine.bounty.coins):'+?');
    setText(ui['brief-wave'],'Wave '+engine.wave);
    setText(ui['brief-multiplier'],revealed?'X'+engine.bounty.multiplier:'X?');
  }
}
function renderGhosts(){
  const ghosts=engine.state==='ended'?[]:engine.ghosts;
  const alive=new Set(ghosts.map(g=>g.id));for(const [id,node] of entities)if(!alive.has(id)){node.remove();entities.delete(id);}
  for(const ghost of ghosts){
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
  coinPulse?.cancel();
  coinPulse=ui['run-upgrade'].animate([{color:'#e9ffbf'},{color:'#eee8ef'}],{duration:220,easing:'ease-out'});
}
function hitEffect(hit,x,y,ghostBox,boxes){
  const now=performance.now(),miss=hit.kind==='miss',shotgun=engine.weapon==='shotgun';
  if(shotgun)shots.shotgun(hit,x,y,SHOTGUN.radius*size.scale,boxes,now);else shots.shoot(hit,x,y,ghostBox,now);
  if(reducedMotion.matches)return;
  if(miss){clockPulse?.cancel();clockPulse=ui['time-label'].animate([{color:'#ff8c80'},{color:'#e1c191'}],{duration:220});}
}
function clearVisuals(){
  shots.clear();clockPulse?.cancel();coinPulse?.cancel();
  for(const node of entities.values())node.remove();entities.clear();ui.ending.hidden=true;
}
function flushEvents(){for(const event of engine.drain()){
  if(event.kind==='wave'){clearVisuals();prepareBountyReel();updateHud();sound('reel-tick');}
  if(event.kind==='bounty-reveal'){sound(event.multiplier>=8?'gold':'bounty-stop');updateHud();}
  if(event.kind==='wave-start'){updateHud();sound('wave');}
  if(event.kind==='end')finish(event.reason);
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
  if(hit.targets.length){missionData=addMissionCaptures(missionData,hit.targets);save();}
  // Remove the consumed target before any optional visual or audio work.
  for(const target of hit.targets){entities.get(target.ghost.id)?.remove();entities.delete(target.ghost.id);}
  updateHitWallet(hit.upgradeCoins);
  hitEffect(hit,x,y,ghostBox,boxes);sound(shotgun?'shotgun':'shot');if(hit.kind!=='miss')sound(hit.kind==='gold'?'gold-hit':'hit',Math.min(1.25,1+Math.max(0,hit.hitCount-1)*.03));
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
  clearTimeout(endingTimer);endingTimer=null;ui['result-dialog'].close();ui['pause-dialog'].close();ui['continue-dialog'].close();ui['mission-dialog'].close();clearVisuals();
  engine=new Hunt({config,upgrades:economy.levels});showScreen('lobby');updateWallet();updateHud();
}
function finish(reason){
  if(endingTimer||lastResult?.runId===currentRunId)return;
  ui['pause-dialog'].close();clearVisuals();updateHud();ui.ending.hidden=false;
  if(reason==='timeout')sound('timeout');
  endingTimer=setTimeout(()=>{
    endingTimer=null;ui.ending.hidden=true;
    if(engine.canContinue())ui['continue-dialog'].showModal();else showFinalResult();
  },1800);
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
  setText(ui['result-double-label'],doubled?'적용 중':'보상 2배');
}
function pause(){if(engine.pause()){ui['pause-dialog'].showModal();updateHud();}}
function resume(){ui['pause-dialog'].close();engine.resume();lastFrame=performance.now();updateHud();}
ui.pause.addEventListener('click',pause);ui.resume.addEventListener('click',resume);
ui.quit.addEventListener('click',()=>{resume();engine.end('quit');flushEvents();updateHud();});
ui['result-home'].addEventListener('click',ready);
ui['continue-back'].addEventListener('click',showFinalResult);
ui['continue-ad'].addEventListener('click',()=>{
  if(!ui['continue-dialog'].open||!engine.continueRun())return;
  ui['continue-dialog'].close();clearVisuals();showScreen('hunt-screen');lastFrame=performance.now();measure();flushEvents();renderGhosts();updateHud();sound('bounty-stop');
});
ui['result-retry'].addEventListener('click',()=>{ready();openUpgrades();});ui['upgrade-open'].addEventListener('click',openUpgrades);ui['upgrade-start'].addEventListener('click',start);
ui['upgrade-cards'].addEventListener('click',event=>{
  const button=event.target.closest('[data-upgrade]');if(!button||button.disabled||engine.state!=='ready')return;
  const key=button.dataset.upgrade,purchase=buyUpgrade(economy,key);if(!purchase.ok)return;
  const previous=economy;economy=purchase.economy;if(!save()){economy=previous;return;}
  renderUpgrades();sound('bounty-stop');
});
function info(title,copy,label,action){setText(ui['info-title'],title);setText(ui['info-copy'],copy);ui['info-action'].hidden=!action;setText(ui['info-action'],label??'');infoAction=action;ui['info-dialog'].showModal();}
ui['info-action'].addEventListener('click',()=>{const action=infoAction;infoAction=null;if(action)action();ui['info-dialog'].close();});
function changeTickets(next){const previous=eventData;eventData=next;if(!save())eventData=previous;updateWallet();}
ui['package-open'].addEventListener('click',()=>info('특별 패키지','할로윈 특별 패키지 구성은 준비 중이에요. 현재 프로토타입에서는 결제하지 않아요.'));
ui['ad-open'].addEventListener('click',()=>{if(engine.state!=='ready'||eventData.tickets>=EVENT.maxTickets)return;changeTickets(addTickets(eventData,3));});
ui['shotgun-ad'].addEventListener('click',()=>{
  if(engine.state!=='ready'||eventData.shotgunReady)return;
  const previous=eventData;eventData=grantShotgun(eventData);if(!save()){eventData=previous;return;}
  renderUpgrades();sound('bounty-stop');
});
ui['ghosts-x2-ad'].addEventListener('click',()=>{
  if(engine.state!=='ready'||eventData.ghostsX2Ready)return;
  const previous=eventData;eventData=grantGhostsX2(eventData);if(!save()){eventData=previous;return;}
  renderUpgrades();sound('bounty-stop');
});
ui['result-double'].addEventListener('click',()=>{
  if(!ui['result-dialog'].open||!lastResult||ui['result-double'].disabled)return;
  const bonus=doubleRunReward(economy,lastResult);if(!bonus.awarded)return;
  const previous=economy;economy=bonus.economy;if(!save()){economy=previous;return;}
  updateWallet();renderResult();sound('gold');
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
  if(engine.state==='playing')shots.render(now);else shots.clear();
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
      // One shared compressor controls the gunshot and hit mix during rapid fire.
      const limiter=soundContext.createDynamicsCompressor();
      limiter.threshold.value=-16;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.002;limiter.release.value=.08;
      mutedGain.connect(limiter);limiter.connect(soundContext.destination);
      combatAudio=new CombatAudio(soundContext,mutedGain);
    }
    if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    if(combatAudio.play(kind,power))return;
    const sounds={
      'reel-tick':[[900,620,.028,0,'sine']],
      'bounty-stop':[[523,784,.12,0,'triangle'],[784,1046,.24,.09,'sine']],
      gold:[[1046,1568,.12,0,'sine',.23],[1568,2093,.16,.07,'sine',.16]],
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
