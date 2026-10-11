import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,BOUNTY_TIMING,settings} from '../hunt-core.mjs';
import {GHOST_COINS,cleanEconomy,runRewards,settleRun,buyUpgrade,doubleRunReward} from '../upgrades.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';

const load=saved=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(saved):null);
const advance=h=>{h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];};
const spawn=(h,type)=>{const g=h.spawn(type);g.age=type==='gold'?0:g.life*.3;return g;};

test('ordinary coin defaults span one to fifty and existing saves retain all other settings and balances',()=>{
  assert.deepEqual(GHOST_COINS,{pudge:1,wisp:10,stilt:20,grasp:35,skitter:50});
  assert.deepEqual(DEFAULTS.ghostCoins,GHOST_COINS);
  const saved={progressVersion:PROGRESS_VERSION,config:{duration:73.5,spawn:.09,missPenalty:0},economy:{upgradeCoins:123.5,eventCoins:77,levels:{time:2,gold:3,shop:4}},bestWave:9};
  const loaded=load(saved);
  assert.deepEqual(loaded.config.ghostCoins,GHOST_COINS);
  for(const [key,value] of Object.entries(saved.config))assert.equal(loaded.config[key],value);
  assert.equal(loaded.economy.upgradeCoins,123.5);assert.equal(loaded.economy.eventCoins,77);
  assert.deepEqual(loaded.economy.levels,saved.economy.levels);assert.equal(loaded.bestWave,9);
  assert.deepEqual(readProgress(()=>null).config.ghostCoins,GHOST_COINS);
});

test('each custom species amount accepts finite values, defaults independently, and uses a fresh settings object',()=>{
  const custom={pudge:0,wisp:.25,stilt:-2.5,grasp:35.5,skitter:1e12+.5};
  const first=settings({ghostCoins:custom}),second=settings(first);
  assert.deepEqual(first.ghostCoins,custom);assert.deepEqual(second.ghostCoins,custom);
  assert.notEqual(first.ghostCoins,custom);assert.notEqual(second.ghostCoins,first.ghostCoins);
  first.ghostCoins.wisp=100;assert.equal(custom.wisp,.25);assert.equal(second.ghostCoins.wisp,.25);
  assert.deepEqual(settings({ghostCoins:{pudge:8,gold:999}}).ghostCoins,{...GHOST_COINS,pudge:8});
  for(const value of [undefined,null,false,[],{},NaN,Infinity,-Infinity,'10']){
    const ghostCoins=Object.fromEntries(Object.keys(GHOST_COINS).map(type=>[type,value]));
    assert.deepEqual(settings({ghostCoins}).ghostCoins,GHOST_COINS);
  }
  assert.deepEqual(load({progressVersion:PROGRESS_VERSION,config:{ghostCoins:custom}}).config.ghostCoins,custom);
});

test('shotgun pays each custom target once, leaves gold unchanged, and continues with the same copied coin settings',()=>{
  const ghostCoins={pudge:0,wisp:.25,stilt:-2.5,grasp:35.5,skitter:1e12+.5},expected={...ghostCoins};
  const h=new Hunt({random:()=>.2,weapon:'shotgun',config:{ghostCoins}});h.start();advance(h);
  ghostCoins.wisp=999;
  const targets=[...Object.keys(expected),'gold'].map(type=>spawn(h,type)),bounty=h.bounty.coins;
  const hit=h.shootShotgun([...targets.map(g=>g.id),targets[1].id]);
  assert.equal(hit.hitCount,6);assert.equal(hit.upgradeCoins,1e12+33.75);assert.equal(hit.bonusCoins,bounty);
  for(const target of hit.targets)assert.equal(target.upgradeCoins,target.kind==='gold'?0:expected[target.kind]);
  assert.equal(h.earnedUpgradeCoins,hit.upgradeCoins);assert.equal(h.wavePendingBonus,bounty);
  assert.equal(h.shootShotgun(targets.map(g=>g.id)),null);
  h.tick(h.remaining);assert.equal(h.continueRun(),true);advance(h);
  assert.equal(h.shootShotgun([spawn(h,'wisp').id]).upgradeCoins,.25);
  assert.equal(h.earnedUpgradeCoins,1e12+34);assert.deepEqual(h.config.ghostCoins,expected);
  h.end('quit');
  const result={runId:'custom-continued-run',earnedUpgradeCoins:h.earnedUpgradeCoins,earnedEventCoins:h.earnedEventCoins};
  const settled=settleRun({upgradeCoins:100.5},result);
  assert.equal(settled.economy.upgradeCoins,1e12+134.5);
  const restored=load({progressVersion:PROGRESS_VERSION,config:h.config,economy:settled.economy});
  assert.equal(restored.economy.upgradeCoins,settled.economy.upgradeCoins);
  assert.equal(settleRun(restored.economy,result).awarded,false);
});

test('fractional, negative, zero and large upgrade balances survive settlement and purchases without changing pumpkin rules',()=>{
  for(const amount of [0,-2.5,.25,1e12+.5]){
    const result={runId:'custom-'+amount,earnedUpgradeCoins:amount,earnedEventCoins:10};
    const settled=settleRun({upgradeCoins:10.25,eventCoins:20},result);
    assert.equal(settled.economy.upgradeCoins,10.25+amount);
    assert.equal(cleanEconomy(settled.economy).upgradeCoins,10.25+amount);
    assert.equal(doubleRunReward(settled.economy,result).economy.upgradeCoins,10.25+amount);
    assert.equal(doubleRunReward(settled.economy,result).economy.eventCoins,40);
    const restored=load({progressVersion:PROGRESS_VERSION,economy:settled.economy});
    assert.equal(restored.economy.upgradeCoins,10.25+amount);
    assert.equal(settleRun(restored.economy,result).awarded,false);
  }
  const purchase=buyUpgrade({upgradeCoins:1e12+.5,eventCoins:7},'time');
  assert.equal(purchase.ok,true);assert.equal(purchase.economy.upgradeCoins,1e12-19.5);
  assert.equal(buyUpgrade({upgradeCoins:-2.5},'time').reason,'funds');
  for(const value of [NaN,Infinity,-Infinity,null,'10',false,{},[]]){
    assert.equal(cleanEconomy({upgradeCoins:value}).upgradeCoins,0);
    assert.equal(runRewards({earnedUpgradeCoins:value}).upgradeCoins,0);
  }
  assert.equal(cleanEconomy({eventCoins:.5}).eventCoins,0);
  assert.equal(cleanEconomy({eventCoins:2e9}).eventCoins,1e9);
  assert.deepEqual(cleanEconomy({levels:{time:.5,gold:50,shop:-1}}).levels,{time:0,gold:30,shop:0});
});
