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
  vm.runInContext(source+'\nthis.flow={get hunt(){return engine;},get coins(){return economy;},get tickets(){return eventData.tickets;},get runId(){return currentRunId;},flushEvents};',context);
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
  app.nodes.get('continue-ad').click();app.nodes.get('info-action').click();
  assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.flow.runId,runId);assert.equal(app.flow.tickets,4);
  assert.equal(app.flow.hunt.wave,2);assert.equal(app.flow.hunt.waveKills,0);assert.equal(app.flow.hunt.remaining,90);
  assert.equal(app.flow.hunt.weapon,'shotgun');assert.equal(app.flow.hunt.spawnMultiplier,2);
  app.advance();app.end();
  assert.equal(app.nodes.get('continue-dialog').open,false);assert.equal(app.nodes.get('result-dialog').open,true);
  assert.equal(app.flow.coins.upgradeCoins,8);assert.equal(app.flow.coins.eventCoins,10);
  app.nodes.get('continue-back').click();assert.equal(app.flow.coins.eventCoins,10);
  app.nodes.get('result-double').click();app.nodes.get('info-action').click();assert.equal(app.flow.coins.eventCoins,20);
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
