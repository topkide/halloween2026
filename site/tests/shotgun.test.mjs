import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';
import {eventState,grantShotgun,useTicket,addTickets,addDistance} from '../event-core.mjs';
import {pickGhost,pickShotgunGhosts,spriteTouchesCircle,SHOTGUN} from '../ghost-aim.mjs';
import {STORAGE_KEY,readProgress} from '../progress.mjs';

function playing(weapon='shotgun'){
  const h=new Hunt({weapon,random:()=>.2});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];h.drain();return h;
}
function target(h,type='pudge'){const g=h.spawn(type);g.age=g.life*.3;return g;}
const candidate=(id,left,top=0,width=20,height=20,facing=1)=>({id,type:'pudge',facing,rect:{left,top,width,height,right:left+width,bottom:top+height}});

test('one captured target is a shotgun hit and an entirely empty blast costs time only once',()=>{
  const h=playing(),g=target(h),before=h.remaining;
  const hit=h.shootShotgun([g.id]);assert.equal(hit.hitCount,1);assert.equal(hit.penalty,0);assert.equal(h.remaining,before);assert.equal(h.misses,0);assert.equal(h.shots,1);
  assert.equal(h.shootShotgun([g.id]),null);assert.equal(h.shots,1);
  const miss=h.shootShotgun([]);assert.equal(miss.kind,'miss');assert.equal(miss.penalty,5);assert.equal(h.remaining,before-5);assert.equal(h.shots,2);assert.equal(h.misses,1);
});
test('one blast removes all unique targets and adds each species and gold reward exactly once',()=>{
  const h=playing(),a=target(h),b=target(h,'skitter'),g=target(h,'gold'),outside=target(h,'wisp');
  const bounty=h.bounty.coins,before=h.remaining,hit=h.shootShotgun([a.id,b.id,g.id,a.id,999]);
  assert.equal(hit.hitCount,3);assert.equal(hit.upgradeCoins,16);assert.equal(hit.bonusCoins,bounty);
  assert.equal(h.earnedUpgradeCoins,16);assert.equal(h.wavePendingBonus,bounty);assert.equal(h.earnedEventCoins,0);
  assert.equal(h.shots,1);assert.equal(h.hits,1);assert.equal(h.kills,3);assert.equal(h.waveKills,3);assert.equal(h.gold,1);assert.equal(h.remaining,before);assert.deepEqual(h.ghosts,[outside]);
});
test('a final multi-hit blast settles every target at the old bounty and advances and heals once',()=>{
  const h=playing();h.remaining=40;
  for(let i=0;i<7;i++)h.shoot(target(h).id);
  const a=target(h),g1=target(h,'gold'),g2=target(h,'gold'),b=target(h,'skitter'),bounty=h.bounty.coins;
  const hit=h.shootShotgun([a.id,g1.id,g2.id,b.id]);
  assert.equal(hit.hitCount,4);assert.equal(h.earnedUpgradeCoins,23);assert.equal(h.earnedEventCoins,10+2*bounty);
  assert.deepEqual(h.waveRewards,[{wave:1,base:10,bonus:2*bounty,total:10+2*bounty}]);
  assert.equal(h.kills,11);assert.equal(h.clearedWaves,1);assert.equal(h.wave,2);assert.equal(h.waveKills,0);assert.equal(h.waveGold,0);
  assert.equal(h.remaining,44);assert.equal(h.recoveredTime,4);assert.equal(h.drain().filter(e=>e.kind==='wave-clear').length,1);
  assert.equal(h.shootShotgun([a.id,g1.id]),null);assert.equal(h.remaining,44);
});
test('ordinary weapons stay single-target and paused, hidden, and ended targets are protected',()=>{
  const normal=playing('standard'),a=target(normal),b=target(normal);
  assert.equal(normal.shootShotgun([a.id,b.id]),null);assert.equal(normal.shoot(a.id).hitCount,1);assert.deepEqual(normal.ghosts,[b]);
  const h=playing(),g=target(h,'wisp');g.age=0;assert.equal(h.shootShotgun([g.id]),null);assert.equal(h.shots,0);
  g.age=g.life*.3;h.pause();assert.equal(h.shootShotgun([g.id]),null);h.resume();assert.equal(h.shootShotgun([g.id]).hitCount,1);
  h.remaining=1;assert.equal(h.shootShotgun([]).penalty,1);assert.equal(h.state,'ended');assert.equal(h.shootShotgun([]),null);
});
test('circle hit detection includes the touch and nearby edges but excludes outside targets',()=>{
  const c=[candidate(1,0),candidate(2,70),candidate(3,85),candidate(4,65,65)];
  assert.equal(pickGhost(c,10,10,new Map()),1);
  assert.deepEqual(pickShotgunGhosts(c,10,10,SHOTGUN.radius,new Map()),[1,2]);
  assert.deepEqual(pickShotgunGhosts([candidate(5,70)],10,10,60,new Map()),[5]);
  assert.deepEqual(pickShotgunGhosts(c.map(a=>({...a,rect:Object.fromEntries(Object.entries(a.rect).map(([k,v])=>[k,v*.5]))})),5,5,SHOTGUN.radius*.5,new Map()),[1,2]);
});
test('spread respects transparent padding, SVG letterboxing and mirrored sprite pixels',()=>{
  const mask={width:2,height:2,aspect:1,alpha:Uint8Array.from([255,0,255,0])};
  assert.equal(spriteTouchesCircle(candidate(1,0),24,10,3,mask),false);
  assert.equal(spriteTouchesCircle(candidate(1,0,0,20,20,-1),24,10,5,mask),true);
  assert.equal(spriteTouchesCircle(candidate(1,0,0,40,20),2,10,4,mask),false);
  assert.equal(spriteTouchesCircle(candidate(1,0),5,5,-1,mask),false);
  assert.deepEqual(pickShotgunGhosts([candidate(1,0)],15,10,1,new Map([['pudge',mask]])),[1]); // Center keeps forgiving normal aim.
});
test('ad reward survives closing/reloading and ticket failure, then applies to one run only',()=>{
  assert.equal(eventState().shotgunReady,false);assert.equal(eventState({shotgunReady:'true'}).shotgunReady,false);
  let s=grantShotgun({tickets:0});assert.deepEqual(grantShotgun(s),s);assert.equal(useTicket(s).ok,false);assert.equal(useTicket(s).state.shotgunReady,true);
  s=addTickets(s,2);s=addDistance(s,300);
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify({progressVersion:6,eventState:s}):null);
  const entry=useTicket(loaded.eventState);assert.equal(entry.ok,true);assert.equal(entry.weapon,'shotgun');assert.equal(entry.state.shotgunReady,false);
  assert.equal(useTicket(entry.state).weapon,'standard');assert.equal(entry.state.tickets,s.tickets-1);
});

test('spread never catches an invisible off-arena target or sprite pixels outside the field',()=>{
  const clip={left:0,top:0,right:100,bottom:100};
  assert.equal(spriteTouchesCircle({...candidate(1,-30),clip},5,10,72),false);
  assert.equal(spriteTouchesCircle({...candidate(1,-10),clip},5,10,72),true);
  const mask={width:2,height:2,aspect:1,alpha:Uint8Array.from([255,0,255,0])};
  assert.equal(spriteTouchesCircle({...candidate(1,-10),clip},5,10,72,mask),false);
});
