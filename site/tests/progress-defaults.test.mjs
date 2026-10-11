import test from 'node:test';
import assert from 'node:assert/strict';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';

const baseline={duration:90,waveRecoveryPercent:10,recoveryLimit:30,spawn:.23,goldInterval:2.5,goldLimit:2};
const custom={duration:75,waveRecoveryPercent:20,recoveryLimit:60,spawn:.4,goldInterval:6,goldLimit:4};
const visible=config=>Object.fromEntries(Object.keys(baseline).map(key=>[key,config[key]]));
const load=saved=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(saved):null);

test('every older browser profile adopts the six common defaults without losing progress or hidden tuning',()=>{
  const record={best:2300,bestWave:12,lastResult:{score:2300},soundOn:false,
    config:{...custom,baseGoal:10,missPenalty:3},
    economy:{upgradeCoins:123,eventCoins:77,levels:{time:15,gold:2,shop:1},claimedRuns:['paid'],doubledRuns:['paid']},
    eventState:{tickets:22,distance:100,owned:['badge'],shotgunReady:true,ghostsX2Ready:true},
    missions:{kills:{pudge:500,wisp:21,stilt:9,grasp:4,skitter:11,gold:100},rewardClaimed:true}};
  for(const progressVersion of [undefined,...Array.from({length:8},(_,i)=>i),null,'7',-1]){
    const state=load({...record,progressVersion});
    assert.deepEqual(visible(state.config),baseline);
    assert.equal(state.config.baseGoal,10);assert.equal(state.config.missPenalty,3);
    for(const key of ['best','bestWave','lastResult','soundOn','economy','eventState','missions'])assert.deepEqual(state[key],record[key]);
    assert.equal(state.resetBalanceDefaults,true);
  }
});

test('both legacy storage formats adopt all six defaults and retain their sound and hidden tuning preferences',()=>{
  for(const storageKey of ['catjump-wave-hunt-v1','catjump-bounty-hunt-v1']){
    const state=readProgress(key=>key===storageKey?JSON.stringify({config:{...custom,baseGoal:12,missPenalty:4},soundOn:false}):null);
    assert.deepEqual(visible(state.config),baseline);
    assert.equal(state.config.baseGoal,12);assert.equal(state.config.missPenalty,4);assert.equal(state.soundOn,false);
    assert.equal(state.resetBalanceDefaults,true);
  }
});

test('new, corrupt and storage-blocked browsers start with the same six defaults',()=>{
  for(const read of [()=>null,()=>'{broken',()=>{throw Error('Unavailable');}])assert.deepEqual(visible(readProgress(read).config),baseline);
  for(const config of [null,[],12,'invalid'])assert.deepEqual(visible(load({progressVersion:7,config}).config),baseline);
});

test('custom settings made after the baseline update survive reloads and later progress versions',()=>{
  for(const progressVersion of [PROGRESS_VERSION,PROGRESS_VERSION+1]){
    const state=load({progressVersion,config:custom});
    assert.deepEqual(visible(state.config),custom);assert.equal(state.resetBalanceDefaults,false);
  }
});
