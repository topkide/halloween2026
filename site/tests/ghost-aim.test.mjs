import test from 'node:test';
import assert from 'node:assert/strict';
import {pickGhost,spriteContains} from '../ghost-aim.mjs';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';

const rect={left:10,top:20,right:110,bottom:120,width:100,height:100};
const opaque={width:2,height:2,aspect:1,alpha:new Uint8Array([255,255,255,255])};
const leftOnly={...opaque,alpha:new Uint8Array([255,0,255,0])};
test('transparent padding on the front ghost does not consume a hit on the visible ghost behind it',()=>{
  const back={id:1,type:'back',rect,facing:1},front={id:2,type:'front',rect,facing:1};
  const masks=new Map([['back',opaque],['front',leftOnly]]);
  assert.equal(pickGhost([back,front],90,70,masks),1);
  assert.equal(pickGhost([back,front],30,70,masks),2);
  assert.equal(pickGhost([back,front],150,70,masks),null);
  assert.equal(pickGhost([front],90,70,masks),2,'unobstructed padding stays forgiving');
});
test('the sampler follows sprite mirroring, letterboxing and transformed target dimensions',()=>{
  assert.equal(spriteContains({rect,facing:-1},90,70,leftOnly),true);
  assert.equal(spriteContains({rect,facing:-1},30,70,leftOnly),false);
  const tall={...opaque,aspect:.5};
  assert.equal(spriteContains({rect,facing:1},20,70,tall),false);
  assert.equal(spriteContains({rect,facing:1},60,70,tall),true);
  const enlarged={left:0,top:0,right:200,bottom:200,width:200,height:200};
  assert.equal(spriteContains({rect:enlarged,facing:1},120,70,leftOnly),false);
  assert.equal(spriteContains({rect:enlarged,facing:1},80,70,leftOnly),true);
});
test('a shot removes the selected overlapping ghost, leaves the other intact and never rewards it twice',()=>{
  const hunt=new Hunt();hunt.start();hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);hunt.ghosts=[];
  const back=hunt.spawn('wisp'),front=hunt.spawn('pudge');
  for(const g of [back,front])Object.assign(g,{age:.5,life:2,motion:'rise'});
  const masks=new Map([['wisp',opaque],['pudge',leftOnly]]);
  const id=pickGhost([{id:back.id,type:back.type,rect,facing:1},{id:front.id,type:front.type,rect,facing:1}],90,70,masks);
  const hit=hunt.shoot(id);assert.equal(hit.ghost.id,back.id);
  assert.deepEqual(hunt.ghosts.map(g=>g.id),[front.id]);assert.equal(hunt.kills,1);
  assert.equal(hunt.shoot(id),null);assert.equal(hunt.kills,1);
});
