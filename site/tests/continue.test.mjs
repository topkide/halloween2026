import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';
import {settleRun,doubleRunReward} from '../upgrades.mjs';
const advance=h=>{h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];h.drain();};
function playing(options={}){const h=new Hunt({random:()=>.2,...options});h.start();advance(h);return h;}
function catchOne(h,type='pudge'){const g=h.spawn(type);g.age=g.life*.3;return h.weapon==='shotgun'?h.shootShotgun([g.id]):h.shoot(g.id);}
function clear(h){while(h.state==='playing')catchOne(h);}

test('continue restarts the unfinished wave, keeps its goal and bounty, and restores the clock',()=>{
  const h=playing({config:{duration:75}});clear(h);advance(h);catchOne(h);catchOne(h,'gold');
  h.remaining=1;h.shoot();h.drain();
  const wave=h.wave,goal=h.waveGoal,bounty={...h.bounty},coins=h.earnedUpgradeCoins;
  assert.equal(h.canContinue(),true);assert.ok(h.wavePendingBonus>0);
  assert.equal(h.continueRun(),true);
  assert.equal(h.wave,wave);assert.equal(h.waveGoal,goal);assert.deepEqual(h.bounty,bounty);
  assert.equal(h.remaining,75);assert.equal(h.waveKills,0);assert.equal(h.waveGold,0);assert.equal(h.wavePendingBonus,0);
  assert.equal(h.earnedUpgradeCoins,coins);assert.equal(h.earnedEventCoins,10);assert.equal(h.clearedWaves,1);
  assert.equal(h.state,'briefing');assert.equal(h.bountyRevealed,false);assert.equal(h.ghosts.length,0);
  assert.equal(h.drain().filter(e=>e.kind==='wave').length,1);
  h.tick(20);assert.equal(h.state,'briefing');assert.equal(h.remaining,75);
  h.tick(BOUNTY_TIMING.hold);assert.equal(h.state,'playing');assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
});

test('continue adds or retains both ad buffs without stacking their speed or requiring another ticket',()=>{
  for(const weapon of ['standard','shotgun'])for(const spawnMultiplier of [1,2]){
    const h=playing({weapon,spawnMultiplier,config:{spawn:.3},upgrades:{shop:15}});
    h.end('quit');assert.equal(h.continueRun(),true);
    assert.equal(h.weapon,'shotgun');assert.equal(h.spawnMultiplier,2);assert.equal(h.spawnInterval,.15);assert.equal(h.maxGhosts,16);
    assert.equal(h.upgrades.shop,15);assert.equal(h.waveBaseReward,20);
  }
});

test('continue is unavailable while active, can be used once after any ending, and resets only for a new run',()=>{
  const h=new Hunt();assert.equal(h.canContinue(),false);assert.equal(h.continueRun(),false);
  h.start();assert.equal(h.continueRun(),false);h.pause();assert.equal(h.continueRun(),false);h.resume();
  h.end('quit');assert.equal(h.continueRun(),true);assert.equal(h.continueRun(),false);
  advance(h);h.tick(120);assert.equal(h.state,'ended');assert.equal(h.canContinue(),false);assert.equal(h.continueRun(),false);
  h.start();assert.equal(h.continueUsed,false);h.end('quit');assert.equal(h.canContinue(),true);
});

test('continued rewards preserve completed waves and silver, discard only unfinished bounty, and settle once',()=>{
  const h=playing();clear(h);advance(h);catchOne(h);catchOne(h,'gold');h.end('quit');
  assert.equal(h.earnedUpgradeCoins,9);assert.equal(h.earnedEventCoins,10);
  h.continueRun();advance(h);clear(h);advance(h);h.end('quit');
  assert.equal(h.canContinue(),false);assert.equal(h.earnedUpgradeCoins,19);assert.equal(h.earnedEventCoins,25);
  assert.deepEqual(h.waveRewards.map(r=>r.wave),[1,2]);
  const result={runId:'one-continued-run',earnedUpgradeCoins:h.earnedUpgradeCoins,earnedEventCoins:h.earnedEventCoins};
  const settled=settleRun({upgradeCoins:100,eventCoins:200},result);
  assert.equal(settled.economy.upgradeCoins,119);assert.equal(settled.economy.eventCoins,225);
  assert.equal(settleRun(settled.economy,result).awarded,false);
  const doubled=doubleRunReward(settled.economy,result);
  assert.equal(doubled.economy.upgradeCoins,119);assert.equal(doubled.economy.eventCoins,250);
  assert.equal(doubleRunReward(doubled.economy,result).awarded,false);
});
