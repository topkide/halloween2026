import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,DEFAULTS} from '../hunt-core.mjs';
import {BALANCE,UPGRADES,cleanEconomy,buyUpgrade,upgradeEffects,upgradeCost,runRewards,settleRun,waveReward} from '../upgrades.mjs';
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
  for(const level of [0,30]){
    const h=new Hunt({random:()=>.75,upgrades:{gold:level}});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);
    assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);h.tick(2.5);
    assert.equal(h.ghosts.filter(g=>g.type==='gold').length,level===30?1:0);assert.equal(h.goldSpawnLeft,2.5);
    h.random=()=>.1;h.tick(.1);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,level===30?1:0);
    h.tick(2.4);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
  }
  assert.equal(upgradeEffects({gold:15}).goldChance,.75);assert.equal(upgradeEffects({gold:30}).goldChance,1);
});

test('upgrades have a cap, charge only upgrade coins and reject insufficient funds or invalid keys',()=>{
  let economy=cleanEconomy({upgradeCoins:4950,eventCoins:123});const original=structuredClone(economy);
  for(let i=0;i<BALANCE.maxLevel;i++){
    const purchase=buyUpgrade(economy,'time');assert.equal(purchase.ok,true);assert.equal(purchase.cost,20+i*10);economy=purchase.economy;
  }
  assert.equal(economy.upgradeCoins,0);assert.equal(economy.eventCoins,123);assert.equal(economy.levels.time,30);assert.equal(original.upgradeCoins,4950);
  assert.equal(upgradeCost(30),null);assert.equal(buyUpgrade(economy,'time').reason,'max');assert.equal(buyUpgrade(economy,'gold').reason,'funds');
  assert.equal(buyUpgrade(economy,'__proto__').reason,'unknown');assert.equal(buyUpgrade(economy,'time').economy.eventCoins,123);
});

test('settlement credits already-earned coins once without score conversion or applying upgrades again',()=>{
  const result={runId:'run-1',score:999999,kills:9,earnedUpgradeCoins:27,earnedEventCoins:60};
  assert.deepEqual(runRewards(result,{}),{upgradeCoins:27,eventCoins:60});
  assert.deepEqual(runRewards(result,{reward:10,shop:10}),{upgradeCoins:27,eventCoins:60});
  const first=settleRun({},result,{reward:10});assert.equal(first.awarded,true);assert.equal(first.economy.upgradeCoins,27);assert.equal(first.economy.eventCoins,60);
  const reloaded=cleanEconomy(JSON.parse(JSON.stringify(first.economy))),again=settleRun(reloaded,result,{});
  assert.equal(again.awarded,false);assert.deepEqual(again.economy,reloaded);
  const second=settleRun(reloaded,{...result,runId:'run-2'},{});assert.equal(second.economy.upgradeCoins,54);assert.equal(second.economy.eventCoins,120);
  assert.equal(settleRun(second.economy,result,{}).awarded,false);
  assert.deepEqual(runRewards({score:999999,kills:99}),{upgradeCoins:0,eventCoins:0});
});

const load=value=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(value):null);
test('runs snapshot rewards and migrations retain score, paid runs and custom intervals',()=>{
  const levels={time:15,gold:3},h=playing(levels);levels.time=30;assert.equal(h.effects.timeRecoveryPercent,20);assert.equal(h.upgrades.time,15);
  const old={best:20000,lastResult:{score:20000,kills:100},config:{goldInterval:4},soundOn:false};
  const migrated=load(old);assert.equal(migrated.config.goldInterval,2.5);assert.equal(migrated.best,20000);assert.equal(migrated.economy.upgradeCoins,0);assert.equal(migrated.soundOn,false);
  assert.equal(load({...old,config:{goldInterval:6}}).config.goldInterval,6);
  for(const progressVersion of [2,PROGRESS_VERSION])assert.equal(load({...old,progressVersion}).config.goldInterval,4);
  const economy=cleanEconomy({upgradeCoins:42,eventCoins:78,levels:{gold:2,time:1},claimedRuns:['paid-run']});
  assert.deepEqual(load({...old,progressVersion:PROGRESS_VERSION,economy}).economy,economy);
  assert.deepEqual(cleanEconomy({upgradeCoins:-1,eventCoins:Infinity,levels:{reload:500,gold:NaN,reward:-1}}).levels,{time:0,gold:0,shop:0});
});

test('retired reload costs are refunded once and the other upgrade levels and currencies survive',()=>{
  for(const [level,refund] of [[0,0],[1,20],[3,90],[10,650],[-1,0],[1.5,0]]){
    const old={progressVersion:2,config:{goldInterval:4},best:14000,economy:{upgradeCoins:2,eventCoins:140,levels:{reload:level,gold:2,reward:3},claimedRuns:['paid-run']}};
    const migrated=load(old);
    assert.equal(migrated.refundedReloadCoins,refund);assert.equal(migrated.economy.upgradeCoins,2+refund+90);
    assert.equal(migrated.economy.eventCoins,140);assert.deepEqual(migrated.economy.levels,{time:0,gold:2,shop:0});
    assert.equal(buyUpgrade(migrated.economy,'reload').reason,'unknown');
    const reloaded=load({...migrated,progressVersion:PROGRESS_VERSION});
    assert.equal(reloaded.refundedReloadCoins,0);assert.deepEqual(reloaded.economy,migrated.economy);
    assert.equal(settleRun(reloaded.economy,{runId:'paid-run',score:14000,kills:22},{}).awarded,false);
  }
});

test('all three upgrades span 30 purchases and stop at the requested effect caps',()=>{
  assert.deepEqual(Object.keys(UPGRADES),['time','gold','shop']);
  assert.deepEqual(upgradeEffects(),{timeRecoveryPercent:10,goldChance:.5,shopBonusPercent:0});
  assert.deepEqual(upgradeEffects({time:15,gold:15,shop:15}),{timeRecoveryPercent:20,goldChance:.75,shopBonusPercent:100});
  assert.deepEqual(upgradeEffects({time:30,gold:30,shop:30}),{timeRecoveryPercent:30,goldChance:1,shopBonusPercent:200});
  assert.deepEqual(upgradeEffects({time:999,gold:999,shop:999}),upgradeEffects({time:30,gold:30,shop:30}));
  for(const key of Object.keys(UPGRADES)){
    let e=cleanEconomy({upgradeCoins:5000,eventCoins:41});
    for(let i=0;i<30;i++){const bought=buyUpgrade(e,key);assert.equal(bought.ok,true);e=bought.economy;}
    assert.equal(e.levels[key],30);assert.equal(e.upgradeCoins,50);assert.equal(e.eventCoins,41);
    const rejected=buyUpgrade(e,key);assert.equal(rejected.reason,'max');assert.deepEqual(rejected.economy,e);
  }
  assert.equal(buyUpgrade({upgradeCoins:100},'reward').reason,'unknown');
});

test('time upgrades affect actual wave-clear recovery and still obey the per-run budget',()=>{
  for(const [level,expected] of [[0,5],[15,10],[30,15]]){
    const h=playing({time:level});h.tick(40); // 50 seconds remain.
    while(h.state==='playing'){h.ghosts=[];h.shoot(target(h).id);}
    assert.equal(h.lastTimeRecovery,expected);assert.equal(h.remaining,50+expected);
    h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);
    while(h.state==='playing'){h.ghosts=[];h.shoot(target(h).id);}
    assert.ok(h.recoveredTime<=30);
  }
  assert.equal(upgradeEffects({time:30},{recoveryBasePercent:20}).timeRecoveryPercent,30);
});

test('200 percent bonus means triple payout and fractional levels do not lose an exact coin',()=>{
  assert.equal(waveReward(1,{shop:30}),30);
  assert.equal(waveReward(2,{shop:30}),45);
  assert.equal(waveReward(5,{shop:1}),32); // 30 × (1 + 200% / 30).
  assert.equal(waveReward(2,{shop:15}),30);
});

test('retired coin-gain upgrades refund their original purchase costs exactly once',()=>{
  for(const [level,refund] of [[0,0],[1,20],[5,200],[10,650],[-1,0],[1.5,0]]){
    const old={progressVersion:5,economy:{upgradeCoins:7,eventCoins:88,levels:{reward:level,gold:10,shop:7},claimedRuns:['old-paid']}};
    const migrated=load(old);assert.equal(migrated.refundedRewardCoins,refund);
    assert.equal(migrated.economy.upgradeCoins,7+refund);assert.equal(migrated.economy.eventCoins,88);
    assert.deepEqual(migrated.economy.levels,{time:0,gold:10,shop:7});
    const reloaded=load({...migrated,progressVersion:PROGRESS_VERSION});
    assert.equal(reloaded.refundedRewardCoins,0);assert.deepEqual(reloaded.economy,migrated.economy);
    assert.equal(settleRun(reloaded.economy,{runId:'old-paid',earnedUpgradeCoins:10},{}).awarded,false);
  }
});
