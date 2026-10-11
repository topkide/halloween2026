import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Hunt,TYPES,DEFAULTS,settings,pose,BOUNTY_TIMING} from '../hunt-core.mjs';
import {STORAGE_KEY as KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';
import {createBountyReel,reelOffset} from '../bounty-reel.mjs';
import {BALANCE,UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward} from '../upgrades.mjs';
import {EVENT,GOODS,eventState,addTickets,addDistance,useTicket,exchange,grantShotgun,grantGhostsX2} from '../event-core.mjs';
import {ghostPixel,coinPixel} from '../pixel-art.mjs';
import {GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN} from '../ghost-aim.mjs';
import {ShotEffects} from '../shot-effects.mjs';
import {CombatAudio} from '../combat-audio.mjs';
import {missionState,addMissionCaptures,missionSummary,claimMissionReward} from '../missions.mjs';

// Exercise actual button handlers and settlement timing without opening a browser.
function application(audio=null,saved=null,{storageFails=false,reducedMotion=false}={}){
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),nodes=new Map(),timers=new Map();let serial=0;
  const drawing=new Proxy({measureText:text=>({width:text.length*10}),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}});
  function node(id=''){
    const handlers=new Map();
    return {id,hidden:false,open:false,disabled:false,style:{},dataset:{},textContent:'',innerHTML:'',firstElementChild:{style:{}},
      classList:{add(){},remove(){}},setAttribute(){},getBoundingClientRect:()=>({width:400,height:440,left:0,top:0}),
      getContext:()=>drawing,append(){},remove(){},showModal(){this.open=true;},close(){this.open=false;},
      animate:()=>({cancel(){}}),reportValidity:()=>true,addEventListener(type,callback){handlers.set(type,callback);},
      click(){if(!this.disabled)handlers.get('click')?.({target:this});},
      dispatch(type,event){handlers.get(type)?.(event);},
      cancel(){handlers.get('cancel')?.({preventDefault(){}});}
    };
  }
  for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],node(match[1]));
  const document={hidden:false,querySelectorAll:selector=>selector==='[id]'?[...nodes.values()]:[],querySelector:()=>node(),createElement:()=>node(),addEventListener(){}};
  const window={devicePixelRatio:1,matchMedia:()=>({matches:reducedMotion}),addEventListener(){}};
  let Combat=CombatAudio;
  if(audio){
    const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
    const voice=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:param()});
    window.AudioContext=class{
      currentTime=0;state='running';destination={};
      createGain(){const gain={...voice(),gain:param()};audio.gains.push(gain);return gain;}
      createDynamicsCompressor(){return {...voice(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
      createOscillator(){return voice();}
    };
    Combat=class{play(kind){if(!['shot','shotgun','hit','gold-hit'].includes(kind))return false;audio.plays.push(kind);return true;}};
  }
  const storage=new Map();
  if(saved)storage.set(KEY,JSON.stringify(saved));
  globalThis.window=window;globalThis.document=document;globalThis.Image=class{complete=false;naturalWidth=0;};
  const context=vm.createContext({Hunt,TYPES,DEFAULTS,settings,pose,KEY,PROGRESS_VERSION,readProgress,createBountyReel,reelOffset,BALANCE,UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward,EVENT,GOODS,eventState,addTickets,addDistance,useTicket,exchange,grantShotgun,grantGhostsX2,ghostPixel,coinPixel,GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN,ShotEffects,CombatAudio:Combat,missionState,addMissionCaptures,missionSummary,claimMissionReward,document,window,
    performance:{now:()=>1000},crypto:{randomUUID:()=>String(++serial)},ResizeObserver:class{observe(){}},requestAnimationFrame(){},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(storageFails)throw new Error('Unavailable');storage.set(key,value);}},
    setTimeout:callback=>{const id=++serial;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  });
  const source=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8').replace(/^import .* from .*;\r?\n/gm,'');
  vm.runInContext(source+'\nthis.flow={get hunt(){return engine;},get coins(){return economy;},get tickets(){return eventData.tickets;},get runId(){return currentRunId;},get effects(){return shots;},get targets(){return entities;},get missions(){return missionData;},hitEffect,renderGhosts,renderBountyReel,flushEvents,fire,updateHud};',context);
  const flow=context.flow;
  const start=()=>{nodes.get('upgrade-open').click();nodes.get('upgrade-start').click();};
  const advance=()=>{flow.hunt.tick(BOUNTY_TIMING.spin);flow.hunt.tick(BOUNTY_TIMING.hold);flow.hunt.ghosts=[];flow.flushEvents();};
  const finishTimers=()=>{for(const [id,callback] of [...timers]){timers.delete(id);callback();}};
  const end=()=>{flow.hunt.end('timeout','clock');flow.flushEvents();finishTimers();};
  const catchOne=()=>{const ghost=flow.hunt.spawn('pudge');ghost.age=ghost.life*.3;flow.hunt.shoot(ghost.id);flow.flushEvents();};
  return {flow,nodes,start,advance,end,catchOne,finishTimers,stored:()=>JSON.parse(storage.get(KEY)??'null')};
}

const settingFields=[['setting-duration','duration'],['setting-recovery-percent','waveRecoveryPercent'],['setting-recovery-limit','recoveryLimit'],['setting-spawn','spawn'],['setting-gold-interval','goldInterval'],['setting-gold-limit','goldLimit'],['setting-miss-penalty','missPenalty']];

test('opening an older browser saves the new baseline immediately, displays it in settings and starts gameplay with it',()=>{
  const saved={progressVersion:7,config:{duration:75,waveRecoveryPercent:20,recoveryLimit:60,spawn:.4,goldInterval:6,goldLimit:4},
    best:2300,bestWave:12,soundOn:false,economy:{upgradeCoins:123,eventCoins:77,levels:{time:15,gold:2,shop:1}},
    eventState:{tickets:22,shotgunReady:true,ghostsX2Ready:true},missions:{kills:{pudge:99},rewardClaimed:true}};
  const app=application(null,saved),stored=app.stored();
  assert.equal(stored.progressVersion,PROGRESS_VERSION);
  assert.equal(stored.best,2300);assert.equal(stored.bestWave,12);assert.equal(stored.soundOn,false);
  assert.equal(stored.economy.upgradeCoins,123);assert.equal(stored.economy.eventCoins,77);assert.equal(stored.economy.levels.time,15);
  assert.equal(stored.eventState.tickets,22);assert.equal(stored.missions.kills.pudge,99);assert.equal(stored.missions.rewardClaimed,true);
  app.nodes.get('settings-open').click();
  for(const [id,key] of settingFields){assert.equal(app.nodes.get(id).value,DEFAULTS[key]);assert.equal(stored.config[key],DEFAULTS[key]);}
  app.nodes.get('settings-dialog').close();app.start();
  for(const [,key] of settingFields)assert.equal(app.flow.hunt.config[key],DEFAULTS[key]);
  assert.equal(app.flow.hunt.weapon,'shotgun');assert.equal(app.flow.hunt.spawnMultiplier,2);
});

test('settings changed after the baseline migration are retained on the next browser opening',()=>{
  const app=application(null,{progressVersion:7,config:{spawn:.4}}),custom={duration:75,waveRecoveryPercent:20,recoveryLimit:60,spawn:.4,goldInterval:6,goldLimit:4,missPenalty:1.3};
  app.nodes.get('settings-open').click();
  for(const [id,key] of settingFields)app.nodes.get(id).value=String(custom[key]);
  app.nodes.get('settings-form').dispatch('submit',{preventDefault(){}});
  const reloaded=application(null,app.stored());reloaded.nodes.get('settings-open').click();
  for(const [id,key] of settingFields)assert.equal(reloaded.nodes.get(id).value,custom[key]);
  reloaded.nodes.get('settings-dialog').close();reloaded.start();
  for(const [,key] of settingFields)assert.equal(reloaded.flow.hunt.config[key],custom[key]);
});

test('miss penalty settings, including zero, affect actual empty taps and survive reopening the browser',()=>{
  for(const penalty of [1.3,0]){
    const app=application();app.nodes.get('settings-open').click();
    app.nodes.get('setting-miss-penalty').value=String(penalty);
    app.nodes.get('settings-form').dispatch('submit',{preventDefault(){}});
    assert.equal(app.stored().config.missPenalty,penalty);
    const reloaded=application(null,app.stored());reloaded.nodes.get('settings-open').click();
    assert.equal(reloaded.nodes.get('setting-miss-penalty').value,penalty);
    reloaded.nodes.get('settings-dialog').close();
    for(const current of [app,reloaded]){
      current.start();current.advance();const before=current.flow.hunt.remaining;
      current.flow.fire({type:'click',detail:0,clientX:200,clientY:200,preventDefault(){},target:{closest:()=>null}});
      assert.equal(current.flow.hunt.misses,1);
      assert.ok(Math.abs(current.flow.hunt.remaining-(before-penalty))<1e-8);
      assert.equal(current.flow.hunt.state,'playing');
    }
  }
});

test('quitting from a paused briefing or hunt immediately settles once without ending or continue screens',()=>{
  for(const phase of ['briefing','playing']){
    const app=application();app.start();app.advance();
    for(let i=0;i<8;i++)app.catchOne();
    if(phase==='playing'){app.advance();app.catchOne();}
    const h=app.flow.hunt,upgradeCoins=h.earnedUpgradeCoins,eventCoins=h.earnedEventCoins,runId=app.flow.runId;
    assert.equal(h.state,phase);app.nodes.get('pause').click();
    assert.equal(h.state,'paused');assert.equal(app.nodes.get('pause-dialog').open,true);
    app.nodes.get('quit').click();
    assert.equal(h.state,'ended');assert.equal(h.reason,'quit');assert.equal(h.canContinue(),false);
    assert.equal(app.nodes.get('pause-dialog').open,false);assert.equal(app.nodes.get('ending').hidden,true);
    assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.nodes.get('result-dialog').open,true);
    assert.equal(app.flow.coins.upgradeCoins,upgradeCoins);assert.equal(app.flow.coins.eventCoins,eventCoins);
    assert.equal(app.stored().lastResult.reason,'quit');
    app.nodes.get('quit').click();app.nodes.get('continue-back').click();app.finishTimers();
    assert.equal(app.flow.coins.upgradeCoins,upgradeCoins);assert.equal(app.flow.coins.eventCoins,eventCoins);
    assert.equal(app.flow.coins.claimedRuns.filter(id=>id===runId).length,1);
    assert.equal(app.nodes.get('continue-dialog').open,false);
  }
});

test('first ending offers continue without settlement; ad resumes the same run and second ending settles once',()=>{
  const app=application();app.start();app.advance();
  for(let i=0;i<8;i++)app.catchOne();app.advance();
  const runId=app.flow.runId;app.end();
  assert.equal(app.nodes.get('continue-dialog').open,true);assert.equal(app.nodes.get('result-dialog').open,false);
  assert.equal(app.flow.coins.upgradeCoins,0);assert.equal(app.flow.coins.eventCoins,0);
  app.nodes.get('continue-ad').click();assert.equal(app.nodes.get('info-dialog').open,false);
  assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.flow.runId,runId);assert.equal(app.flow.tickets,4);
  assert.equal(app.flow.hunt.wave,2);assert.equal(app.flow.hunt.waveKills,0);assert.equal(app.flow.hunt.remaining,90);
  assert.equal(app.flow.hunt.weapon,'shotgun');assert.equal(app.flow.hunt.spawnMultiplier,2);
  app.advance();app.end();
  assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.nodes.get('result-dialog').open,true);
  assert.equal(app.flow.coins.upgradeCoins,8);assert.equal(app.flow.coins.eventCoins,10);
  app.nodes.get('continue-back').click();assert.equal(app.flow.coins.eventCoins,10);
  app.nodes.get('result-double').click();assert.equal(app.nodes.get('info-dialog').open,false);assert.equal(app.flow.coins.eventCoins,20);
  assert.equal(app.nodes.get('result-double-label').textContent,'적용 중');assert.equal(app.nodes.get('result-double').disabled,true);
  app.nodes.get('result-double').click();assert.equal(app.flow.coins.eventCoins,20);
});

test('back or Escape from the continue dialog opens results and preserves earned coins',()=>{
  for(const action of ['click','cancel']){
    const app=application();app.start();app.advance();app.catchOne();app.end();
    if(action==='click')app.nodes.get('continue-back').click();else app.nodes.get('continue-dialog').cancel();
    assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.nodes.get('result-dialog').open,true);
    assert.equal(app.flow.coins.upgradeCoins,1);assert.equal(app.flow.tickets,4);
  }
});

test('retry opens upgrades without a ticket charge and a new entry restores its one continue allowance',()=>{
  const app=application();app.start();app.advance();app.end();app.nodes.get('continue-back').click();
  app.nodes.get('result-retry').click();assert.equal(app.nodes.get('upgrade-dialog').open,true);assert.equal(app.flow.tickets,4);
  app.nodes.get('upgrade-start').click();assert.equal(app.flow.tickets,3);assert.equal(app.flow.hunt.continueUsed,false);
  app.advance();app.end();assert.equal(app.nodes.get('continue-dialog').open,true);
});

for(const reducedMotion of [false,true])test(`bounty reel visibly changes before revealing its fixed result with reduced motion ${reducedMotion}`,()=>{
  const app=application(null,null,{reducedMotion});app.start();
  const h=app.flow.hunt,reel=app.nodes.get('brief-reel'),strip=app.nodes.get('brief-strip'),result=app.nodes.get('brief-multiplier');
  const bounty={...h.bounty},rows=(strip.innerHTML.match(/<span>/g)??[]).length,originalRandom=h.random;
  let draws=0,elapsed=0,previous=strip.style.transform,previousOffset=0;
  h.random=()=>{draws++;return originalRandom();};
  assert.equal(reel.hidden,false);assert.equal(result.hidden,true);assert.ok(rows>1);
  for(const dt of [.17,.29,.31]){
    elapsed+=dt;h.tick(dt);app.flow.renderBountyReel(elapsed*1000);app.flow.updateHud();
    assert.equal(reel.hidden,false);assert.equal(result.hidden,true);
    assert.notEqual(strip.style.transform,previous);previous=strip.style.transform;
    const offset=-Number(strip.style.transform.match(/translate3d\(0,([^%]+)%/)[1])*rows/100;
    const fractional=Math.abs(offset-Math.round(offset));
    assert.ok(fractional>1e-4,'both modes scroll continuously between rows');
    assert.ok(offset>previousOffset,'increasing row offsets move the strip upward');previousOffset=offset;
  }
  h.tick(BOUNTY_TIMING.spin-elapsed);app.flow.flushEvents();app.flow.renderBountyReel(2000);
  assert.equal(h.bountyRevealed,true);assert.equal(reel.hidden,true);assert.equal(result.hidden,false);
  assert.equal(result.textContent,'X'+bounty.multiplier);
  const stopped=strip.style.transform;
  h.tick(.2);app.flow.renderBountyReel(2200);app.flow.updateHud();
  assert.equal(strip.style.transform,stopped);assert.deepEqual(h.bounty,bounty);assert.equal(draws,0);
  assert.equal(result.hidden,false);assert.equal(result.textContent,'X'+bounty.multiplier);
});

test('a new bounty briefing immediately clears old targets, impact fragments, shotgun marks and payout numbers',()=>{
  const app=application();app.start();app.advance();
  for(let i=0;i<7;i++)app.catchOne();
  const h=app.flow.hunt,ghost=h.spawn('pudge');ghost.age=ghost.life*.3;
  app.flow.renderGhosts();assert.ok(app.flow.targets.size>0);
  const box={x:150,y:170,width:75,height:90,facing:1},earlier={kind:'pudge',upgradeCoins:1,bonusCoins:0,ghost};
  app.flow.effects.shoot(earlier,150,170,box,1000);
  app.flow.effects.shotgun({kind:'pudge',targets:[earlier],hitCount:1},150,170,72,new Map([[ghost.id,box]]),1000);
  assert.ok(app.flow.effects.bursts.length>0);assert.ok(app.flow.effects.spreads.length>0);assert.ok(app.flow.effects.labels.length>0);
  const hit=h.shoot(ghost.id);
  // Actual hit feedback can run after the engine has already changed to briefing.
  app.flow.hitEffect(hit,150,170,box,new Map([[ghost.id,box]]));
  app.flow.flushEvents();
  assert.equal(h.state,'briefing');assert.equal(app.nodes.get('wave-intro').hidden,false);
  assert.equal(app.nodes.get('effect-layer').hidden,true);
  assert.equal(app.flow.targets.size,0);assert.equal(app.flow.effects.bursts.length,0);assert.equal(app.flow.effects.spreads.length,0);assert.equal(app.flow.effects.labels.length,0);
  assert.equal(app.flow.effects.dirty,false);
  app.flow.effects.render(1001);assert.equal(app.flow.effects.dirty,false);
  app.flow.effects.shoot(earlier,150,170,box,1002);assert.equal(app.flow.effects.labels.length,0);
  app.advance();assert.equal(app.nodes.get('effect-layer').hidden,false);
});

test('shotgun and X2 rewards apply with one click and active labels, then enter the next run together',()=>{
  const app=application();app.nodes.get('upgrade-open').click();
  assert.doesNotMatch(app.nodes.get('upgrade-cards').innerHTML,/다음|<small>/);
  for(const [button,label] of [['shotgun-ad','shotgun-label'],['ghosts-x2-ad','ghosts-x2-label']]){
    app.nodes.get(button).click();assert.equal(app.nodes.get('info-dialog').open,false);
    assert.equal(app.nodes.get(label).textContent,'적용 중');assert.equal(app.nodes.get(button).disabled,true);
    app.nodes.get(button).click();assert.equal(app.flow.tickets,5);
  }
  app.nodes.get('upgrade-start').click();assert.equal(app.flow.hunt.weapon,'shotgun');assert.equal(app.flow.hunt.spawnMultiplier,2);assert.equal(app.flow.tickets,4);
});

test('ticket ad grants immediately without a popup and stops at the existing 30-ticket cap',()=>{
  const app=application();app.nodes.get('ad-open').click();assert.equal(app.flow.tickets,8);assert.equal(app.nodes.get('info-dialog').open,false);
  for(let i=0;i<10;i++)app.nodes.get('ad-open').click();
  assert.equal(app.flow.tickets,30);assert.equal(app.nodes.get('ad-open').disabled,true);assert.equal(app.nodes.get('info-dialog').open,false);
});

test('actual firing selects the equipped gun, adds impact only on hits, and respects the sound button',()=>{
  const audio={plays:[],gains:[]},app=application(audio);app.start();app.advance();
  const shoot=(type=null)=>{
    const ghost=type?app.flow.hunt.spawn(type):null;
    if(ghost){ghost.age=ghost.life*.3;app.flow.renderGhosts();}
    app.flow.fire({type:'click',detail:0,clientX:200,clientY:200,preventDefault(){},target:{closest:selector=>selector==='[data-ghost]'&&ghost?{dataset:{ghost:String(ghost.id)}}:null}});
  };
  shoot('pudge');assert.deepEqual(audio.plays,['shot','hit']);
  audio.plays=[];shoot();assert.deepEqual(audio.plays,['shot']);
  app.nodes.get('sound').click();assert.equal(audio.gains[0].gain.value,0);
  audio.plays=[];shoot('pudge');assert.deepEqual(audio.plays,[]);
  app.nodes.get('sound').click();assert.equal(audio.gains[0].gain.value,.2);
  shoot('gold');assert.deepEqual(audio.plays,['shot','gold-hit']);
  app.flow.hunt.weapon='shotgun';audio.plays=[];shoot('pudge');
  assert.equal(audio.plays[0],'shotgun');assert.equal(audio.plays.filter(kind=>kind==='shotgun').length,1);
  assert.equal(audio.plays[1],'hit');
});

test('game over clears the field and precedes continue or results; continuing and retrying hide it',()=>{
  const app=application();app.start();app.advance();
  const ghost=app.flow.hunt.spawn('pudge');ghost.age=ghost.life*.3;app.flow.renderGhosts();
  const hit={kind:'pudge',upgradeCoins:1,bonusCoins:0,ghost};
  app.flow.effects.shoot(hit,180,200,{x:180,y:200,width:70,height:80,facing:1},1000);
  assert.ok(app.flow.targets.size>0);assert.ok(app.flow.effects.labels.length>0);
  app.flow.hunt.remaining=.01;app.flow.hunt.tick(.02);app.flow.flushEvents();
  assert.equal(app.nodes.get('ending').hidden,false);
  assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.nodes.get('result-dialog').open,false);
  assert.equal(app.flow.targets.size,0);assert.equal(app.flow.effects.labels.length,0);
  assert.equal(app.nodes.get('effect-layer').hidden,true);assert.equal(app.nodes.get('hunt-screen').dataset.urgent,'false');
  app.flow.renderGhosts();assert.equal(app.flow.targets.size,0);
  app.finishTimers();assert.equal(app.nodes.get('ending').hidden,true);assert.equal(app.nodes.get('continue-dialog').open,true);
  app.nodes.get('continue-ad').click();assert.equal(app.nodes.get('ending').hidden,true);
  app.advance();app.flow.hunt.end('timeout','clock');app.flow.flushEvents();
  assert.equal(app.nodes.get('ending').hidden,false);assert.equal(app.nodes.get('result-dialog').open,false);
  app.finishTimers();assert.equal(app.nodes.get('ending').hidden,true);assert.equal(app.nodes.get('result-dialog').open,true);
  app.nodes.get('result-retry').click();assert.equal(app.nodes.get('ending').hidden,true);
});

test('ten-second warning turns on at the threshold and stops after recovery, pause or ending',()=>{
  const app=application();app.start();app.advance();const screen=app.nodes.get('hunt-screen');
  const refresh=()=>app.flow.updateHud();
  app.flow.hunt.remaining=10.01;refresh();assert.equal(screen.dataset.urgent,'false');
  app.flow.hunt.remaining=10;refresh();assert.equal(screen.dataset.urgent,'true');assert.equal(screen.dataset.state,'playing');
  app.nodes.get('pause').click();assert.equal(screen.dataset.state,'paused');assert.equal(screen.dataset.urgent,'true');
  app.nodes.get('resume').click();assert.equal(screen.dataset.state,'playing');
  // A wave-clear heal carries the clock back above the warning threshold.
  app.flow.hunt.remaining=9.9;
  for(let i=0;i<8;i++)app.catchOne();
  assert.ok(app.flow.hunt.remaining>10);assert.equal(screen.dataset.urgent,'false');assert.equal(screen.dataset.state,'briefing');
  app.advance();app.flow.hunt.remaining=1;app.end();assert.equal(screen.dataset.urgent,'false');assert.equal(screen.dataset.state,'ended');
  app.nodes.get('continue-ad').click();assert.equal(screen.dataset.urgent,'false');
});

test('mission opens the nine-row panel with loaded progress and closes through back or Escape',()=>{
  const saved={progressVersion:PROGRESS_VERSION,economy:{levels:{gold:30}},missions:{kills:{wisp:499,gold:100}}};
  const app=application(null,saved);app.nodes.get('mission-open').click();
  assert.equal(app.nodes.get('mission-dialog').open,true);
  const html=app.nodes.get('mission-list').innerHTML;
  assert.equal((html.match(/class="mission-card"/g)??[]).length,9);
  assert.match(html,/황금 유령 100마리 잡기/);assert.match(html,/499 \/ 500/);assert.doesNotMatch(html,/황금 유령 50마리/);
  assert.equal(app.nodes.get('mission-total-count').textContent,'2 / 9');assert.equal(app.nodes.get('mission-claim').disabled,true);
  app.nodes.get('mission-back').click();assert.equal(app.nodes.get('mission-dialog').open,false);
  app.nodes.get('mission-open').click();app.nodes.get('mission-dialog').cancel();assert.equal(app.nodes.get('mission-dialog').open,false);
  assert.equal(app.flow.tickets,5);assert.equal(app.nodes.has('shop-dialog'),false);app.nodes.get('shop-open').click();
  assert.equal(app.nodes.get('mission-dialog').open,false);
});

test('real taps persist captured species before ending, ignore misses and duplicate targets, and survive continuing and reload',()=>{
  const app=application();app.start();app.advance();
  const shoot=(type,previous=null)=>{
    const ghost=previous??(type?app.flow.hunt.spawn(type):null);
    if(ghost&&!previous){ghost.age=ghost.life*.3;app.flow.renderGhosts();}
    app.flow.fire({type:'click',detail:0,clientX:200,clientY:200,preventDefault(){},target:{closest:selector=>selector==='[data-ghost]'&&ghost?{dataset:{ghost:String(ghost.id)}}:null}});
    return ghost;
  };
  const wisp=shoot('wisp');shoot(null,wisp);shoot('pudge');shoot('gold');shoot(null);
  assert.equal(app.flow.missions.kills.wisp,1);assert.equal(app.flow.missions.kills.pudge,1);assert.equal(app.flow.missions.kills.gold,1);
  assert.deepEqual(app.stored().missions,app.flow.missions);
  app.end();app.nodes.get('continue-ad').click();app.advance();shoot('pudge');
  assert.equal(app.flow.missions.kills.pudge,2);
  const reloaded=application(null,app.stored());reloaded.nodes.get('mission-open').click();
  assert.equal(reloaded.flow.missions.kills.pudge,2);assert.match(reloaded.nodes.get('mission-list').innerHTML,/2 \/ 500/);
});

test('one actual shotgun tap saves all its captured species, including multiple captures of the same type',()=>{
  const app=application(null,{progressVersion:PROGRESS_VERSION,eventState:{shotgunReady:true}});app.start();app.advance();
  const ghosts=['pudge','pudge','wisp','gold'].map(type=>{const ghost=app.flow.hunt.spawn(type);ghost.age=ghost.life*.3;return ghost;});
  app.flow.renderGhosts();
  app.flow.fire({type:'click',detail:0,clientX:200,clientY:200,preventDefault(){},target:{closest:selector=>selector==='[data-ghost]'?{dataset:{ghost:String(ghosts[0].id)}}:null}});
  assert.equal(app.flow.missions.kills.pudge,2);assert.equal(app.flow.missions.kills.wisp,1);assert.equal(app.flow.missions.kills.gold,1);
  assert.deepEqual(app.stored().missions,app.flow.missions);
});

test('the final upgrade immediately unlocks the special cat, claiming once without an extra popup and surviving reload',()=>{
  const saved={progressVersion:PROGRESS_VERSION,economy:{upgradeCoins:500,levels:{time:29,gold:30,shop:30}},missions:{kills:{pudge:500,wisp:500,stilt:500,grasp:500,skitter:500,gold:100}}};
  const app=application(null,saved);app.nodes.get('mission-open').click();assert.equal(app.nodes.get('mission-total-count').textContent,'8 / 9');
  app.nodes.get('mission-back').click();app.nodes.get('upgrade-open').click();
  app.nodes.get('upgrade-cards').dispatch('click',{target:{closest:()=>({disabled:false,dataset:{upgrade:'time'}})}});
  assert.equal(app.flow.coins.levels.time,30);app.nodes.get('upgrade-dialog').close();app.nodes.get('mission-open').click();
  assert.equal(app.nodes.get('mission-total-count').textContent,'9 / 9');assert.equal(app.nodes.get('mission-claim').disabled,false);
  const balance=app.flow.coins.upgradeCoins;app.nodes.get('mission-claim').click();
  assert.equal(app.nodes.get('info-dialog').open,false);assert.equal(app.flow.missions.rewardClaimed,true);assert.equal(app.nodes.get('mission-claim').textContent,'획득 완료');
  assert.equal(app.nodes.get('mission-claim').disabled,true);app.nodes.get('mission-claim').click();assert.equal(app.flow.coins.upgradeCoins,balance);
  const reloaded=application(null,app.stored());reloaded.nodes.get('mission-open').click();assert.equal(reloaded.nodes.get('mission-claim').textContent,'획득 완료');assert.equal(reloaded.nodes.get('mission-claim').disabled,true);
  const failed=application(null,{...saved,economy:{...saved.economy,levels:{time:30,gold:30,shop:30}}},{storageFails:true});
  failed.nodes.get('mission-open').click();failed.nodes.get('mission-claim').click();assert.equal(failed.flow.missions.rewardClaimed,false);
  assert.equal(failed.nodes.get('mission-claim').textContent,'받기');assert.equal(failed.stored().missions.rewardClaimed,undefined);
});
