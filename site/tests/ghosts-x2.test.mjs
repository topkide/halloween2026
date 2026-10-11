import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,BOUNTY_TIMING} from '../hunt-core.mjs';
import {eventState,grantShotgun,grantGhostsX2,useTicket,addTickets,addDistance} from '../event-core.mjs';
import {readProgress,STORAGE_KEY} from '../progress.mjs';

function playing(options={}){
  const hunt=new Hunt({random:()=>.2,...options});
  hunt.start();hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);hunt.drain();
  return hunt;
}

test('either ad works independently, both combine, and the next run consumes them once',()=>{
  assert.equal(eventState({ghostsX2Ready:'true'}).ghostsX2Ready,false);
  for(const shotgun of [false,true])for(const ghostsX2 of [false,true]){
    let state=eventState({tickets:2});
    if(shotgun)state=grantShotgun(state);
    if(ghostsX2)state=grantGhostsX2(state);
    const entry=useTicket(state);
    assert.equal(entry.weapon,shotgun?'shotgun':'standard');
    assert.equal(entry.spawnMultiplier,ghostsX2?2:1);
    assert.equal(entry.state.tickets,1);
    assert.equal(entry.state.shotgunReady,false);
    assert.equal(entry.state.ghostsX2Ready,false);
    const next=useTicket(entry.state);
    assert.equal(next.weapon,'standard');assert.equal(next.spawnMultiplier,1);
  }
});

test('both rewards survive reload, granting in either order, other lobby actions and failed entry',()=>{
  const state=grantGhostsX2(grantShotgun({tickets:0}));
  assert.deepEqual(grantShotgun(grantGhostsX2({tickets:0})),state);
  assert.deepEqual(grantGhostsX2(state),state);
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify({progressVersion:6,eventState:state}):null);
  assert.deepEqual(useTicket(loaded.eventState),{ok:false,state});
  const filled=addDistance(addTickets(state,1),300),entry=useTicket(filled);
  assert.equal(entry.weapon,'shotgun');assert.equal(entry.spawnMultiplier,2);
  assert.equal(entry.state.tickets,1);
  assert.equal(eventState({shotgunReady:true}).ghostsX2Ready,false);
});

test('X2 actually creates twice as many ordinary ghosts in the same time without changing saved settings',()=>{
  const base=playing(),boosted=playing({spawnMultiplier:2,weapon:'shotgun'});
  for(const hunt of [base,boosted]){
    hunt.ghosts=[];hunt.goldSpawnLeft=10;
    for(let i=0;i<46;i++)hunt.tick(.01);
  }
  assert.equal(base.ghosts.length,2);assert.equal(boosted.ghosts.length,4);
  assert.equal(base.spawnInterval,.23);assert.equal(boosted.spawnInterval,.115);
  assert.equal(boosted.config.spawn,DEFAULTS.spawn);
  assert.equal(boosted.weapon,'shotgun');
  const custom=playing({spawnMultiplier:2,config:{spawn:.15}});
  assert.equal(custom.spawnInterval,.075);
  assert.equal(new Hunt({spawnMultiplier:3}).spawnMultiplier,1);
});

test('X2 allows more simultaneous ghosts, keeps gold cadence and limits, and pauses its timers',()=>{
  for(const multiplier of [1,2]){
    const hunt=playing({spawnMultiplier:multiplier});hunt.ghosts=[];
    for(let i=0;i<8*multiplier;i++)assert.ok(hunt.spawn('pudge'));
    assert.equal(hunt.spawn('pudge'),null);
    hunt.ghosts=[];hunt.goldSpawnLeft=0;
    assert.ok(hunt.spawnGoldIfReady());
    assert.equal(hunt.goldSpawnLeft,DEFAULTS.goldInterval);
    hunt.waveGold=DEFAULTS.goldLimit;hunt.ghosts=[];hunt.goldSpawnLeft=0;
    assert.equal(hunt.spawnGoldIfReady(),null);
    const left=hunt.spawnLeft,remaining=hunt.remaining;
    hunt.pause();hunt.tick(10);
    assert.equal(hunt.spawnLeft,left);assert.equal(hunt.remaining,remaining);
    hunt.resume();
  }
});

test('the faster interval persists across wave transitions and a new ordinary run restores defaults',()=>{
  const hunt=playing({spawnMultiplier:2,weapon:'shotgun'});
  hunt.ghosts=[];
  for(let i=0;i<8;i++){
    const ghost=hunt.spawn('pudge');ghost.age=ghost.life*.3;hunt.shootShotgun([ghost.id]);
  }
  assert.equal(hunt.clearedWaves,1);assert.equal(hunt.earnedEventCoins,10);
  hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);
  assert.equal(hunt.spawnLeft,.115);assert.equal(hunt.maxGhosts,16);
  const normal=playing({config:hunt.config});
  assert.equal(normal.spawnInterval,.23);assert.equal(normal.maxGhosts,8);
});

test('shotgun plus X2 keeps growing goals past the old cap after loading an existing save',()=>{
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify({progressVersion:6,config:{duration:100,spawn:.3,baseGoal:10,maxGoal:24}}):null);
  const hunt=playing({config:loaded.config,spawnMultiplier:2,weapon:'shotgun'});
  assert.equal(hunt.config.duration,90);assert.equal(hunt.spawnInterval,.115);
  for(let wave=1;wave<=12;wave++){
    assert.equal(hunt.waveGoal,10+(wave-1)*2);
    hunt.ghosts=[];
    while(hunt.state==='playing'){
      const targets=Array.from({length:Math.min(3,hunt.waveGoal-hunt.waveKills)},()=>{
        const ghost=hunt.spawn('pudge');ghost.age=ghost.life*.3;return ghost.id;
      });
      hunt.shootShotgun(targets);
    }
    assert.equal(hunt.clearedWaves,wave);
    assert.equal(hunt.waveKills,0);
    hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);
  }
  assert.equal(hunt.wave,13);assert.equal(hunt.waveGoal,34);
  assert.equal(hunt.weapon,'shotgun');assert.equal(hunt.spawnMultiplier,2);
});
