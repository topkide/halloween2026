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

// Exercise actual button handlers and settlement timing without opening a browser.
function application(){
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),nodes=new Map(),timers=new Map();let serial=0;
  const drawing=new Proxy({measureText:text=>({width:text.length*10}),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}});
  function node(id=''){
    const handlers=new Map();
    return {id,hidden:false,open:false,disabled:false,style:{},dataset:{},textContent:'',innerHTML:'',firstElementChild:{style:{}},
      classList:{add(){},remove(){}},setAttribute(){},getBoundingClientRect:()=>({width:400,height:440,left:0,top:0}),
      getContext:()=>drawing,append(){},remove(){},showModal(){this.open=true;},close(){this.open=false;},
      animate:()=>({cancel(){}}),addEventListener(type,callback){handlers.set(type,callback);},
      click(){if(!this.disabled)handlers.get('click')?.({target:this});},
      cancel(){handlers.get('cancel')?.({preventDefault(){}});}
    };
  }
  for(const match of html.matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],node(match[1]));
  const document={hidden:false,querySelectorAll:selector=>selector==='[id]'?[...nodes.values()]:[],querySelector:()=>node(),createElement:()=>node(),addEventListener(){}};
  const window={devicePixelRatio:1,matchMedia:()=>({matches:false}),addEventListener(){}};
  const storage=new Map();
  globalThis.window=window;globalThis.document=document;globalThis.Image=class{complete=false;naturalWidth=0;};
  const context=vm.createContext({Hunt,TYPES,DEFAULTS,settings,pose,KEY,PROGRESS_VERSION,readProgress,createBountyReel,reelOffset,BALANCE,UPGRADES,upgradeEffects,upgradeCost,buyUpgrade,settleRun,doubleRunReward,EVENT,GOODS,eventState,addTickets,addDistance,useTicket,exchange,grantShotgun,grantGhostsX2,ghostPixel,coinPixel,GhostAim,pickGhost,pickShotgunGhosts,SHOTGUN,ShotEffects,document,window,
    performance:{now:()=>1000},crypto:{randomUUID:()=>String(++serial)},ResizeObserver:class{observe(){}},requestAnimationFrame(){},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:callback=>{const id=++serial;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  });
  const source=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8').replace(/^import .* from .*;\r?\n/gm,'');
  vm.runInContext(source+'\nthis.flow={get hunt(){return engine;},get coins(){return economy;},get tickets(){return eventData.tickets;},get runId(){return currentRunId;},get effects(){return shots;},get targets(){return entities;},hitEffect,renderGhosts,flushEvents};',context);
  const flow=context.flow;
  const start=()=>{nodes.get('upgrade-open').click();nodes.get('upgrade-start').click();};
  const advance=()=>{flow.hunt.tick(BOUNTY_TIMING.spin);flow.hunt.tick(BOUNTY_TIMING.hold);flow.hunt.ghosts=[];flow.flushEvents();};
  const end=()=>{flow.hunt.end('quit');flow.flushEvents();for(const [id,callback] of [...timers]){timers.delete(id);callback();}};
  const catchOne=()=>{const ghost=flow.hunt.spawn('pudge');ghost.age=ghost.life*.3;flow.hunt.shoot(ghost.id);flow.flushEvents();};
  return {flow,nodes,start,advance,end,catchOne};
}

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
