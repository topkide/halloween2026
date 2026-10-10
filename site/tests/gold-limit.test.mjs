import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,DEFAULTS,settings} from '../hunt-core.mjs';
import {STORAGE_KEY,readProgress} from '../progress.mjs';

function advanceBriefing(h){h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.drain();}
function playing(config={}){
  // Every random spawn attempts gold, exercising the limit at its highest pressure.
  const h=new Hunt({random:()=>.01,config});h.start();advanceBriefing(h);return h;
}
function hit(h,g){g.age=g.life*.3;return h.shoot(g.id);}

test('only two successful golden captures are possible, including simultaneous targets',()=>{
  const h=playing(),first=h.ghosts.find(g=>g.type==='gold'),second=h.spawn('gold');
  assert.ok(second);assert.equal(h.waveGold,0);assert.equal(h.spawn('gold'),null);
  const reward=h.bounty.points;
  hit(h,first);assert.equal(h.waveGold,1);assert.equal(h.spawn('gold'),null);
  hit(h,second);assert.equal(h.waveGold,2);assert.equal(h.gold,2);assert.equal(h.goldScore,2*reward);
  const snapshot=JSON.stringify(h);assert.equal(h.shoot(second.id),null);assert.equal(JSON.stringify(h),snapshot);
  assert.equal(h.spawn('gold'),null);assert.notEqual(h.spawn().type,'gold');
  for(let i=0;i<600;i++){h.tick(.05);assert.ok(h.ghosts.every(g=>g.type!=='gold'));}
  assert.equal(h.wave,1);assert.equal(h.waveKills,2);assert.equal(h.waveGold,2);
  assert.equal(h.drain().filter(e=>e.kind==='gold-limit').length,1);
});

test('escaping gold releases its slot without consuming a capture, reward, or miss',()=>{
  const h=playing({goldLimit:1}),escaped=h.ghosts.find(g=>g.type==='gold');
  assert.equal(h.spawn('gold'),null);
  h.tick(escaped.life+.01);
  assert.ok(!h.ghosts.includes(escaped));assert.equal(h.shoot(escaped.id),null);
  assert.equal(h.waveGold,0);assert.equal(h.goldScore,0);assert.equal(h.waveKills,0);assert.equal(h.misses,0);
  const retry=h.ghosts.find(g=>g.type==='gold');assert.ok(retry);assert.notEqual(retry.id,escaped.id);
  hit(h,retry);assert.equal(h.waveGold,1);assert.equal(h.goldScore,h.bounty.points);
  for(let i=0;i<100;i++){h.tick(.05);assert.ok(h.ghosts.every(g=>g.type!=='gold'));}
});

test('an escape after one capture preserves the remaining opportunity',()=>{
  const h=playing(),first=h.ghosts.find(g=>g.type==='gold'),escaped=h.spawn('gold');
  hit(h,first);h.tick(escaped.life+.01);
  assert.equal(h.waveGold,1);assert.equal(h.gold,1);
  const retry=h.ghosts.find(g=>g.type==='gold');assert.ok(retry);hit(h,retry);
  assert.equal(h.waveGold,2);assert.equal(h.gold,2);assert.equal(h.goldScore,2*h.bounty.points);
});

test('ordinary captures unlock a new quota and a new wave bounty; restart clears counts',()=>{
  const h=playing(),first=h.ghosts.find(g=>g.type==='gold');hit(h,first);hit(h,h.spawn('gold'));
  const reward=h.goldScore,previous=h.bounty.multiplier;
  while(h.state==='playing')hit(h,h.spawn('wisp'));
  assert.equal(h.wave,2);assert.equal(h.waveGold,0);assert.equal(h.gold,2);assert.equal(h.goldScore,reward);
  assert.notEqual(h.bounty.multiplier,previous);advanceBriefing(h);
  hit(h,h.ghosts.find(g=>g.type==='gold'));assert.equal(h.waveGold,1);assert.equal(h.gold,3);
  h.pause();h.tick(10);assert.equal(h.waveGold,1);h.resume();assert.equal(h.waveGold,1);
  h.start();assert.equal(h.waveGold,0);assert.equal(h.gold,0);assert.equal(h.wave,1);assert.equal(h.score,0);
});

test('custom limits are enforced and existing saves adopt the default without losing records',()=>{
  assert.equal(DEFAULTS.goldLimit,2);
  for(const limit of [1,3,10]){
    const h=playing({goldLimit:limit,baseGoal:20});
    hit(h,h.ghosts.find(g=>g.type==='gold'));
    for(let i=1;i<limit;i++)hit(h,h.spawn('gold'));
    assert.equal(h.waveGold,limit);assert.equal(h.gold,limit);assert.equal(h.spawn('gold'),null);assert.notEqual(h.spawn().type,'gold');
  }
  const saved={best:8900,lastResult:{score:8900},soundOn:false,config:{duration:90,spawn:.31}};
  const read=()=>readProgress(key=>key===STORAGE_KEY?JSON.stringify(saved):null);
  assert.equal(read().config.goldLimit,2);assert.equal(read().best,8900);assert.equal(read().config.spawn,.31);assert.equal(read().soundOn,false);
  saved.config.goldLimit=4;assert.equal(read().config.goldLimit,4);
  assert.equal(settings({goldLimit:0}).goldLimit,1);assert.equal(settings({goldLimit:100}).goldLimit,10);
  assert.equal(settings({goldLimit:2.8}).goldLimit,3);assert.equal(settings({goldLimit:NaN}).goldLimit,2);
});
