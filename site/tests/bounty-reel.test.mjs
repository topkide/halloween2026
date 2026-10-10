import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';
import {createBountyReel,reelOffset,visibleBounty} from '../bounty-reel.mjs';

test('a bounty stays concealed until the spin ends, then has a full reveal before play',()=>{
 const h=new Hunt();h.start();const result={...h.bounty};h.drain();
 assert.deepEqual(visibleBounty(h),{multiplier:null,points:null});
 h.tick(BOUNTY_TIMING.spin-.01);assert.equal(h.bountyRevealed,false);assert.equal(h.remaining,60);assert.equal(h.shoot(),null);assert.equal(h.ghosts.length,0);
 h.tick(.01);assert.equal(h.bountyRevealed,true);assert.deepEqual(visibleBounty(h),result);assert.equal(h.briefingLeft,BOUNTY_TIMING.hold);assert.equal(h.drain().filter(e=>e.kind==='bounty-reveal').length,1);
 h.tick(BOUNTY_TIMING.hold-.01);assert.equal(h.state,'briefing');assert.equal(h.shoot(),null);assert.equal(h.remaining,60);
 h.tick(.01);assert.equal(h.state,'playing');assert.equal(h.remaining,60);assert.deepEqual(h.bounty,result);assert.equal(h.drain().filter(e=>e.kind==='bounty-reveal').length,0);
});
test('a stalled frame cannot skip the final multiplier display or spend gameplay time',()=>{
 const h=new Hunt();h.start();h.tick(10);assert.equal(h.state,'briefing');assert.equal(h.bountyRevealed,true);assert.equal(h.briefingLeft,BOUNTY_TIMING.hold);assert.equal(h.remaining,60);
 h.tick(.5);assert.equal(h.state,'briefing');h.tick(2);assert.equal(h.state,'playing');assert.equal(h.remaining,60);
});
test('pausing freezes the spin and reveal; restarting or changing wave resets visibility',()=>{
 const h=new Hunt();h.start();h.tick(.8);let before=h.briefingLeft,hidden=visibleBounty(h);
 h.pause();h.tick(10);assert.equal(h.briefingLeft,before);assert.deepEqual(visibleBounty(h),hidden);h.resume();h.tick(1);assert.equal(h.bountyRevealed,true);
 h.pause();before=h.briefingLeft;h.tick(10);assert.equal(h.briefingLeft,before);h.resume();h.tick(BOUNTY_TIMING.hold);
 h.prepareWave();assert.equal(h.bountyRevealed,false);assert.deepEqual(visibleBounty(h),hidden);h.tick(BOUNTY_TIMING.spin);h.start();assert.equal(h.bountyRevealed,false);assert.equal(h.wave,1);
});
test('decorative reels decelerate and land on the actual weighted result without rerolling',()=>{
 for(const multiplier of [2,3,5,8,10]){
   const rows=createBountyReel(multiplier,3),steps=rows.length-1;
   assert.equal(rows.at(-1),multiplier);assert.notEqual(rows.at(-2),multiplier);assert.ok(rows.every(n=>[2,3,5,8,10].includes(n)));
   assert.equal(reelOffset(0,steps),0);assert.equal(reelOffset(BOUNTY_TIMING.spin,steps),steps);assert.equal(reelOffset(10,steps),steps);
   let previousDelta=Infinity;for(let i=1;i<=18;i++){const delta=reelOffset(i*.1,steps)-reelOffset((i-1)*.1,steps);assert.ok(delta>=0&&delta<previousDelta);previousDelta=delta;}
 }
 let draws=0;const h=new Hunt({random:()=>{draws++;return .8;}});h.start();const before=draws,bounty={...h.bounty};createBountyReel(h.bounty.multiplier,h.wave);
 for(let i=0;i<30;i++){reelOffset(i*.05,24);visibleBounty(h);}assert.equal(draws,before);h.tick(BOUNTY_TIMING.spin);assert.equal(draws,before);assert.deepEqual(h.bounty,bounty);
});
