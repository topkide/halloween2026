import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,DEFAULTS} from '../hunt-core.mjs';
import {BALANCE,cleanEconomy,buyUpgrade,upgradeEffects,upgradeCost,runRewards,settleRun} from '../upgrades.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';

function playing(upgrades={},random=()=>.2){const h=new Hunt({random,upgrades});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];return h;}
function target(h){const g=h.spawn('wisp');g.age=g.life*.3;return g;}

test('every accepted shot reloads; simultaneous shots, repeats and misses during reload do nothing',()=>{
  const h=playing(),a=target(h),b=target(h);assert.equal(h.shoot(a.id).points,200);assert.equal(h.reloadLeft,.6);
  const snapshot=JSON.stringify(h);
  for(let i=0;i<10;i++){assert.equal(h.shoot(b.id),null);assert.equal(h.shoot(a.id),null);assert.equal(h.shoot(),null);}
  assert.equal(JSON.stringify(h),snapshot);h.tick(.59);assert.equal(h.shoot(b.id),null);h.tick(.01);assert.equal(h.shoot(b.id).points,200);
  h.tick(.6);const before=h.remaining;assert.equal(h.shoot().kind,'miss');assert.equal(h.remaining,before-2);assert.equal(h.reloadLeft,.6);
  assert.equal(h.shoot(),null);assert.equal(h.remaining,before-2);assert.equal(h.misses,1);assert.equal(h.shots,3);
});

test('maximum reload upgrade remains locked for 80ms and pause freezes the countdown',()=>{
  const h=playing({reload:10}),a=target(h),b=target(h);h.shoot(a.id);assert.equal(h.reloadLeft,.08);
  h.tick(.079);assert.equal(h.shoot(b.id),null);h.pause();const left=h.reloadLeft;h.tick(20);assert.equal(h.reloadLeft,left);assert.equal(h.shoot(b.id),null);
  h.resume();h.tick(.001);assert.equal(h.shoot(b.id).kind,'wisp');
  h.start();assert.equal(h.reloadLeft,0);assert.equal(h.effects.reloadSeconds,.08);
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
    const purchase=buyUpgrade(economy,'reload');assert.equal(purchase.ok,true);assert.equal(purchase.cost,20+i*10);economy=purchase.economy;
  }
  assert.equal(economy.upgradeCoins,0);assert.equal(economy.eventCoins,123);assert.equal(economy.levels.reload,10);assert.equal(original.upgradeCoins,650);
  assert.equal(upgradeCost(10),null);assert.equal(buyUpgrade(economy,'reload').reason,'max');assert.equal(buyUpgrade(economy,'gold').reason,'funds');
  assert.equal(buyUpgrade(economy,'__proto__').reason,'unknown');assert.equal(buyUpgrade(economy,'reward').economy.eventCoins,123);
});

test('currency upgrades increase only score-based event coins and rewards are credited once per run',()=>{
  const result={runId:'run-1',score:1250,kills:9};
  assert.deepEqual(runRewards(result,{}),{upgradeCoins:9,eventBase:12,eventBonus:0,eventBonusPercent:0,eventCoins:12});
  assert.equal(runRewards(result,{reward:10}).eventCoins,24);assert.equal(runRewards(result,{reward:10}).upgradeCoins,9);
  assert.equal(runRewards(result,{reward:1}).eventBonus,1);
  const first=settleRun({},result,{reward:10});assert.equal(first.awarded,true);assert.equal(first.economy.upgradeCoins,9);assert.equal(first.economy.eventCoins,24);
  const reload=cleanEconomy(JSON.parse(JSON.stringify(first.economy))),again=settleRun(reload,result,{reward:10});
  assert.equal(again.awarded,false);assert.deepEqual(again.economy,reload);
  const second=settleRun(reload,{...result,runId:'run-2'},{});assert.equal(second.economy.upgradeCoins,18);assert.equal(second.economy.eventCoins,36);
  assert.equal(settleRun(second.economy,result,{}).awarded,false);
  assert.equal(runRewards({score:99,kills:0},{}).eventCoins,0);assert.equal(runRewards({score:0,kills:0},{}).upgradeCoins,0);
});

test('a run snapshots upgrades and old score records migrate without inventing rewards',()=>{
  const levels={reload:1,reward:2,gold:3},h=playing(levels);levels.reload=10;assert.equal(h.effects.reloadSeconds,.548);assert.equal(h.upgrades.reward,2);
  const old={best:20000,lastResult:{score:20000,kills:100},config:{goldInterval:4},soundOn:false};
  const load=value=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(value):null);
  const migrated=load(old);assert.equal(migrated.config.goldInterval,2.5);assert.equal(migrated.best,20000);assert.equal(migrated.economy.upgradeCoins,0);assert.equal(migrated.soundOn,false);
  assert.equal(load({...old,config:{goldInterval:6}}).config.goldInterval,6);
  assert.equal(load({...old,progressVersion:PROGRESS_VERSION}).config.goldInterval,4);
  const economy=cleanEconomy({upgradeCoins:42,eventCoins:78,levels:{reload:3,gold:2,reward:1},claimedRuns:['paid-run']});
  assert.deepEqual(load({...old,progressVersion:PROGRESS_VERSION,economy}).economy,economy);
  assert.deepEqual(cleanEconomy({upgradeCoins:-1,eventCoins:Infinity,levels:{reload:500,gold:NaN,reward:-1}}).levels,{reload:10,gold:0,reward:0});
});
