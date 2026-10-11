import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,MISSION_REWARD,missionState,addMissionCaptures,missionSummary,claimMissionReward} from '../missions.mjs';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';

const full=()=>missionState({kills:{pudge:500,wisp:500,stilt:500,grasp:500,skitter:500,gold:100}});
const maxLevels={time:30,gold:30,shop:30};
const target=(id,type)=>({ghost:{id,type}});
function playing(weapon='standard'){
  const hunt=new Hunt({weapon,random:()=>.2});hunt.start();hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);hunt.ghosts=[];hunt.drain();return hunt;
}
function spawn(hunt,type){const ghost=hunt.spawn(type);ghost.age=ghost.life*.3;return ghost;}

test('the requested six capture goals and three level-30 goals form nine distinct missions',()=>{
  assert.equal(MISSIONS.length,9);assert.equal(new Set(MISSIONS.map(m=>m.id)).size,9);
  assert.deepEqual(MISSIONS.filter(m=>m.kind==='capture').map(m=>[m.id,m.goal]),[['pudge',500],['wisp',500],['stilt',500],['grasp',500],['skitter',500],['gold',100]]);
  assert.ok(MISSIONS.filter(m=>m.kind==='upgrade').every(m=>m.goal===30));
  const summary=missionSummary();assert.equal(summary.total,9);assert.equal(summary.completed,0);assert.equal(summary.canClaim,false);
  assert.ok(summary.rows.every(row=>row.current===0&&row.ratio===0));assert.equal(MISSION_REWARD.name,'특별 고양이');
});

test('capture progress counts each successful shotgun target once and clamps at each goal',()=>{
  const before=missionState({kills:{pudge:499,gold:99}});
  const next=addMissionCaptures(before,[target(1,'pudge'),target(2,'pudge'),target(3,'gold'),target(3,'gold'),target(4,'wisp'),target(5,'unknown'),null]);
  assert.equal(next.kills.pudge,500);assert.equal(next.kills.gold,100);assert.equal(next.kills.wisp,1);
  assert.equal(before.kills.pudge,499);assert.equal(before.kills.gold,99);
  assert.deepEqual(addMissionCaptures(next,[]),next);assert.deepEqual(addMissionCaptures(next,null),next);
});

test('actual final-blast captures count across waves, continue and new runs; invalid shots add nothing',()=>{
  const hunt=playing('shotgun');let progress=missionState();
  for(let i=0;i<7;i++){const hit=hunt.shootShotgun([spawn(hunt,'pudge').id]);progress=addMissionCaptures(progress,hit.targets);}
  const a=spawn(hunt,'wisp'),b=spawn(hunt,'gold'),c=spawn(hunt,'skitter');
  const hit=hunt.shootShotgun([a.id,b.id,c.id,a.id]);progress=addMissionCaptures(progress,hit.targets);
  assert.equal(hunt.wave,2);assert.equal(progress.kills.pudge,7);assert.equal(progress.kills.wisp,1);assert.equal(progress.kills.gold,1);assert.equal(progress.kills.skitter,1);
  assert.equal(hunt.shootShotgun([a.id,b.id]),null);
  hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);hunt.ghosts=[];
  const g=spawn(hunt,'grasp');hunt.pause();assert.equal(hunt.shootShotgun([g.id]),null);hunt.resume();
  progress=addMissionCaptures(progress,hunt.shootShotgun([g.id]).targets);
  const miss=hunt.shootShotgun([]);assert.deepEqual(addMissionCaptures(progress,miss.targets),progress);
  hunt.tick(hunt.remaining);assert.equal(hunt.continueRun(),true);assert.equal(progress.kills.grasp,1);
  hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);hunt.ghosts=[];
  progress=addMissionCaptures(progress,hunt.shootShotgun([spawn(hunt,'grasp').id]).targets);
  const nextRun=playing();progress=addMissionCaptures(progress,nextRun.shoot(spawn(nextRun,'grasp').id).targets);
  assert.equal(progress.kills.grasp,3);
});

test('corrupt saved counters cannot produce negative, fractional or overflowing progress',()=>{
  const state=missionState({kills:{pudge:-1,wisp:NaN,stilt:Infinity,grasp:2.5,skitter:'500',gold:9999,extra:500},rewardClaimed:'true'});
  assert.deepEqual(state,{kills:{pudge:0,wisp:0,stilt:0,grasp:0,skitter:0,gold:100},rewardClaimed:false});
  for(const value of [null,undefined,5,'broken',[]])assert.equal(missionSummary(value).completed,0);
  assert.ok(missionSummary(state,{time:300,gold:-1,shop:'30'}).rows.every(row=>Number.isFinite(row.ratio)&&row.ratio>=0&&row.ratio<=1));
});

test('existing upgrade levels contribute immediately; the reward unlocks only at all nine and claims once',()=>{
  assert.equal(missionSummary(null,maxLevels).completed,3);
  assert.equal(missionSummary(full(),{...maxLevels,time:29}).completed,8);
  assert.equal(claimMissionReward(full(),{...maxLevels,time:29}).awarded,false);
  const before=full(),claimed=claimMissionReward(before,maxLevels);
  assert.equal(claimed.awarded,true);assert.equal(claimed.reward.id,'halloween-special-cat');assert.equal(before.rewardClaimed,false);
  assert.equal(missionSummary(claimed.state,maxLevels).canClaim,false);assert.equal(claimMissionReward(claimed.state,maxLevels).awarded,false);
});

test('old saves keep currency, tickets and levels without inventing per-species history; new progress and reward survive reload',()=>{
  const old={progressVersion:6,bestWave:12,economy:{upgradeCoins:700,eventCoins:900,levels:maxLevels},eventState:{tickets:22,distance:87,shotgunReady:true},lastResult:{kills:9000,gold:300}};
  const load=value=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(value):null);
  const migrated=load(old);assert.equal(migrated.bestWave,12);assert.equal(migrated.economy.upgradeCoins,700);assert.equal(migrated.economy.eventCoins,900);
  assert.equal(migrated.eventState.tickets,22);assert.deepEqual(migrated.economy.levels,maxLevels);
  assert.deepEqual(migrated.missions,missionState());assert.equal(missionSummary(migrated.missions,migrated.economy.levels).completed,3);
  const claimed=claimMissionReward(full(),maxLevels);
  const loaded=load({...old,progressVersion:PROGRESS_VERSION,missions:claimed.state});
  assert.deepEqual(loaded.missions,claimed.state);assert.equal(claimMissionReward(loaded.missions,loaded.economy.levels).awarded,false);
});
