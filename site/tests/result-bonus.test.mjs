import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanEconomy,settleRun,doubleRunReward,buyUpgrade} from '../upgrades.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';
const result={runId:'finished-run',earnedUpgradeCoins:50,earnedEventCoins:250};
test('result ad adds exactly one pumpkin reward and never doubles silver or existing savings',()=>{
  const settled=settleRun({upgradeCoins:100,eventCoins:300},result);
  const doubled=doubleRunReward(settled.economy,result);
  assert.equal(doubled.awarded,true);
  assert.equal(doubled.economy.upgradeCoins,150);
  assert.equal(doubled.economy.eventCoins,800);
  assert.equal(settled.economy.eventCoins,550);
  assert.equal(doubleRunReward(doubled.economy,result).awarded,false);
  assert.equal(settleRun(doubled.economy,result).awarded,false);
});
test('double reward stays claimed after save / reload and upgrade purchase',()=>{
  const doubled=doubleRunReward(settleRun({},result).economy,result);
  const saved={progressVersion:PROGRESS_VERSION,economy:doubled.economy,lastResult:result};
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify(saved):null);
  const purchase=buyUpgrade(loaded.economy,'time');
  assert.equal(purchase.ok,true);
  assert.equal(doubleRunReward(purchase.economy,loaded.lastResult).awarded,false);
  assert.equal(purchase.economy.eventCoins,500);
});
test('result ad cannot claim an uncompleted settlement, zero reward, or invalid result',()=>{
  for(const r of [null,{},result,{...result,earnedEventCoins:0}])assert.equal(doubleRunReward({},r).awarded,false);
  const zero={...result,earnedEventCoins:0};
  assert.equal(doubleRunReward(settleRun({},zero).economy,zero).awarded,false);
});
test('each new run gets one bonus and old saves default to no claimed ad bonuses',()=>{
  let economy=cleanEconomy({claimedRuns:['older-run']});
  assert.deepEqual(economy.doubledRuns,[]);
  for(let i=0;i<40;i++){
    const run={...result,runId:'run-'+i};
    economy=doubleRunReward(settleRun(economy,run).economy,run).economy;
  }
  assert.equal(economy.eventCoins,20_000);
  assert.equal(economy.upgradeCoins,2_000);
  assert.equal(economy.doubledRuns.length,32);
  assert.equal(doubleRunReward(economy,{...result,runId:'run-0'}).awarded,false);
});
