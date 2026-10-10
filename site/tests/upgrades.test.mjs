import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,DEFAULTS} from '../hunt-core.mjs';
import {BALANCE,cleanEconomy,buyUpgrade,upgradeEffects,upgradeCost,runRewards,settleRun} from '../upgrades.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';

function playing(upgrades={},random=()=>.2){const h=new Hunt({random,upgrades});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];return h;}
function target(h){const g=h.spawn('wisp');g.age=g.life*.3;return g;}

test('shots have no cooldown while duplicate targets and inactive states stay protected',()=>{
  const h=playing(),a=target(h),b=target(h);
  assert.equal(h.shoot(a.id).points,200);
  assert.equal(h.shoot(a.id),null);
  assert.equal(h.shoot(b.id).points,200); // Same frame, no tick or artificial timer reset.
  const before=h.remaining;
  assert.equal(h.shoot().kind,'miss');assert.equal(h.shoot().kind,'miss');
  assert.equal(h.remaining,before-4);assert.equal(h.shots,4);assert.equal(h.kills,2);
  const c=target(h);h.pause();assert.equal(h.shoot(c.id),null);assert.equal(h.shoot(),null);
  h.resume();assert.equal(h.shoot(c.id).points,200);
  assert.equal('reloadLeft' in h,false);assert.equal('reloadSeconds' in h.effects,false);
  h.end('quit');assert.equal(h.shoot(),null);
});

test('gold probability is rolled once per 2.5-second cycle, rises with upgrades, and first gold is guaranteed',()=>{
  assert.equal(DEFAULTS.goldInterval,2.5);
  for(const level of [0,10]){
    const h=new Hunt({random:()=>.75,upgrades:{gold:level}});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);
    assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);h.tick(2.5);
    assert.equal(h.ghosts.filter(g=>g.type==='gold').length,level===10?1:0);assert.equal(h.goldSpawnLeft,2.5);
    h.random=()=>.1;h.tick(.1);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,level===10?1:0);
    h.tick(2.4);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
  }
  assert.equal(upgradeEffects({gold:1}).goldChance,.55);assert.equal(upgradeEffects({gold:10}).goldChance,1);
});

test('upgrades have a cap, charge only upgrade coins and reject insufficient funds or invalid keys',()=>{
  let economy=cleanEconomy({upgradeCoins:650,eventCoins:123});const original=structuredClone(economy);
  for(let i=0;i<BALANCE.maxLevel;i++){
    const purchase=buyUpgrade(economy,'reward');assert.equal(purchase.ok,true);assert.equal(purchase.cost,20+i*10);economy=purchase.economy;
  }
  assert.equal(economy.upgradeCoins,0);assert.equal(economy.eventCoins,123);assert.equal(economy.levels.reward,10);assert.equal(original.upgradeCoins,650);
  assert.equal(upgradeCost(10),null);assert.equal(buyUpgrade(economy,'reward').reason,'max');assert.equal(buyUpgrade(economy,'gold').reason,'funds');
  assert.equal(buyUpgrade(economy,'__proto__').reason,'unknown');assert.equal(buyUpgrade(economy,'reward').economy.eventCoins,123);
});

test('reward upgrades grant integer coins per kill, leave event coins alone and settle each run once',()=>{
  const result={runId:'run-1',score:1250,kills:9};
  assert.deepEqual(runRewards(result,{}),{coinsPerKill:1,upgradeCoins:9,eventCoins:12});
  assert.deepEqual(runRewards(result,{reward:1}),{coinsPerKill:2,upgradeCoins:18,eventCoins:12});
  assert.deepEqual(runRewards(result,{reward:10}),{coinsPerKill:11,upgradeCoins:99,eventCoins:12});
  assert.equal(runRewards({score:0,kills:1},{reward:10}).upgradeCoins,11);
  const first=settleRun({},result,{reward:10});assert.equal(first.awarded,true);assert.equal(first.economy.upgradeCoins,99);assert.equal(first.economy.eventCoins,12);
  const reloaded=cleanEconomy(JSON.parse(JSON.stringify(first.economy))),again=settleRun(reloaded,result,{reward:10});
  assert.equal(again.awarded,false);assert.deepEqual(again.economy,reloaded);
  const second=settleRun(reloaded,{...result,runId:'run-2'},{});assert.equal(second.economy.upgradeCoins,108);assert.equal(second.economy.eventCoins,24);
  assert.equal(settleRun(second.economy,result,{}).awarded,false);
  assert.equal(runRewards({score:99,kills:0},{reward:10}).eventCoins,0);assert.equal(runRewards({score:0,kills:0},{reward:10}).upgradeCoins,0);
});

const load=value=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(value):null);
test('runs snapshot rewards and migrations retain score, paid runs and custom intervals',()=>{
  const levels={reward:2,gold:3},h=playing(levels);levels.reward=10;assert.equal(h.effects.coinsPerKill,3);assert.equal(h.upgrades.reward,2);
  const old={best:20000,lastResult:{score:20000,kills:100},config:{goldInterval:4},soundOn:false};
  const migrated=load(old);assert.equal(migrated.config.goldInterval,2.5);assert.equal(migrated.best,20000);assert.equal(migrated.economy.upgradeCoins,0);assert.equal(migrated.soundOn,false);
  assert.equal(load({...old,config:{goldInterval:6}}).config.goldInterval,6);
  for(const progressVersion of [2,PROGRESS_VERSION])assert.equal(load({...old,progressVersion}).config.goldInterval,4);
  const economy=cleanEconomy({upgradeCoins:42,eventCoins:78,levels:{gold:2,reward:1},claimedRuns:['paid-run']});
  assert.deepEqual(load({...old,progressVersion:PROGRESS_VERSION,economy}).economy,economy);
  assert.deepEqual(cleanEconomy({upgradeCoins:-1,eventCoins:Infinity,levels:{reload:500,gold:NaN,reward:-1}}).levels,{gold:0,reward:0});
});

test('retired reload costs are refunded once and the other upgrade levels and currencies survive',()=>{
  for(const [level,refund] of [[0,0],[1,20],[3,90],[10,650],[-1,0],[1.5,0]]){
    const old={progressVersion:2,config:{goldInterval:4},best:14000,economy:{upgradeCoins:2,eventCoins:140,levels:{reload:level,gold:2,reward:3},claimedRuns:['paid-run']}};
    const migrated=load(old);
    assert.equal(migrated.refundedReloadCoins,refund);assert.equal(migrated.economy.upgradeCoins,2+refund);
    assert.equal(migrated.economy.eventCoins,140);assert.deepEqual(migrated.economy.levels,{gold:2,reward:3});
    assert.equal(buyUpgrade(migrated.economy,'reload').reason,'unknown');
    const reloaded=load({...migrated,progressVersion:PROGRESS_VERSION});
    assert.equal(reloaded.refundedReloadCoins,0);assert.deepEqual(reloaded.economy,migrated.economy);
    assert.equal(settleRun(reloaded.economy,{runId:'paid-run',score:14000,kills:22},{}).awarded,false);
  }
});
