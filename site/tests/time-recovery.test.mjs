import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,BOUNTY_TIMING,settings} from '../hunt-core.mjs';
import {readProgress,STORAGE_KEY,PROGRESS_VERSION} from '../progress.mjs';

const advance=h=>{h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.drain();};
function playing(config={}){const h=new Hunt({config});h.start();advance(h);return h;}
function catchGhost(h,type='wisp'){h.ghosts=[];const g=h.spawn(type);g.age=g.type==='gold'?0:.5;return h.shoot(g.id);}
function clear(h,final='wisp'){while(h.waveKills<h.waveGoal-1)catchGhost(h);return catchGhost(h,final);}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('default starts at 90 seconds and only the final kill restores 10% of the current clock',()=>{
  assert.equal(DEFAULTS.duration,90);
  for(const remaining of [80,50,10,.35]){
    const h=playing();h.tick(90-remaining);
    catchGhost(h);near(h.remaining,remaining);assert.equal(h.recoveredTime,0);
    const hit=clear(h,'gold');near(h.remaining,remaining*1.1);near(h.lastTimeRecovery,remaining*.1);
    near(h.recoveredTime,remaining*.1);assert.equal(h.state,'briefing');
    const events=h.drain().filter(e=>e.kind==='wave-clear');assert.equal(events.length,1);near(events[0].timeRecovery,remaining*.1);
    const snapshot=JSON.stringify(h);assert.equal(h.shoot(hit.ghost.id),null);assert.equal(JSON.stringify(h),snapshot);
  }
});
test('recovery respects the remaining run budget, including a partial last grant',()=>{
  const h=playing({recoveryLimit:11});clear(h);near(h.remaining,99);near(h.recoveredTime,9);
  advance(h);clear(h);near(h.remaining,101);near(h.lastTimeRecovery,2);near(h.recoveredTime,11);
  advance(h);clear(h);near(h.remaining,101);assert.equal(h.lastTimeRecovery,0);near(h.recoveredTime,11);
});
test('briefings and pauses neither spend time nor repeat recovery, and a restart resets the budget',()=>{
  const h=playing();h.tick(20);clear(h);near(h.remaining,77);
  h.pause();h.tick(50);near(h.remaining,77);near(h.recoveredTime,7);h.resume();advance(h);
  near(h.remaining,77);near(h.recoveredTime,7);h.tick(1);near(h.remaining,76);
  h.start();assert.equal(h.remaining,90);assert.equal(h.recoveredTime,0);assert.equal(h.lastTimeRecovery,0);
});
test('misses are deducted before the recovery calculation; timeout and quit never grant recovery',()=>{
  const h=playing();h.tick(30);h.shoot();clear(h);near(h.lastTimeRecovery,5.8);near(h.remaining,63.8);
  for(const cause of ['clock','miss','quit']){
    const ended=playing();if(cause==='clock')ended.tick(100);else if(cause==='miss'){ended.tick(89);ended.shoot();}else ended.end('quit');
    assert.equal(ended.state,'ended');assert.equal(ended.recoveredTime,0);assert.equal(ended.shoot(),null);
  }
});
test('the recovery rate and budget are configurable, validated, and may be disabled',()=>{
  const h=playing({waveRecoveryPercent:20,recoveryLimit:50});h.tick(40);clear(h);near(h.remaining,60);
  for(const config of [{waveRecoveryPercent:0},{recoveryLimit:0}]){const off=playing(config);clear(off);assert.equal(off.remaining,90);assert.equal(off.recoveredTime,0);}
  assert.equal(settings({waveRecoveryPercent:99}).waveRecoveryPercent,30);
  assert.equal(settings({recoveryLimit:-1}).recoveryLimit,0);
  assert.equal(settings({recoveryLimit:NaN}).recoveryLimit,30);
});
test('old default duration migrates once while custom timing, active upgrades and owned badges survive with retired coins refunded',()=>{
  const economy={upgradeCoins:123,eventCoins:77,levels:{gold:2,reward:3,shop:1},claimedRuns:[]};
  const load=(version,duration)=>readProgress(k=>k===STORAGE_KEY?JSON.stringify({progressVersion:version,config:{duration,spawn:.31},economy,bestWave:7,eventState:{tickets:3,owned:['badge']}}):null);
  const migrated=load(4,60);assert.equal(migrated.config.duration,90);assert.equal(migrated.config.spawn,.31);assert.deepEqual(migrated.economy,{...economy,upgradeCoins:213,levels:{time:0,gold:2,shop:1}});assert.equal(migrated.bestWave,7);assert.deepEqual(migrated.eventState.owned,['badge']);
  assert.equal(load(4,90).config.duration,90);assert.equal(load(4,75).config.duration,75);
  assert.equal(load(PROGRESS_VERSION,60).config.duration,60);
});
