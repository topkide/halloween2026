import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,GOLD_DIRECTIONS,GOLD_APPEAR_DURATION,GOLD_MOVE_DURATION,pose,settings} from '../hunt-core.mjs';
import {STORAGE_KEY,readProgress} from '../progress.mjs';

function briefing(h){h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.drain();}
function playing(config={}){const h=new Hunt({random:()=>.4,config:{goldInterval:4,...config}});h.start();briefing(h);return h;}
function finishWave(h){while(h.state==='playing'){h.reloadLeft=0;const g=h.spawn('wisp');g.age=g.life*.3;h.shoot(g.id);}}

test('gold appears on a four-second clock rather than ordinary random rolls',()=>{
  const h=playing({spawn:2});const first=h.ghosts.find(g=>g.type==='gold');
  assert.ok(first);assert.equal(h.goldSpawnLeft,4);
  h.tick(3.99);assert.ok(h.ghosts.every(g=>g.type!=='gold'));assert.equal(h.waveGold,0);
  h.tick(.01);const second=h.ghosts.find(g=>g.type==='gold');assert.ok(second);assert.notEqual(second.id,first.id);assert.equal(h.goldSpawnLeft,4);
  const snapshots=[second.id];for(let i=0;i<10;i++){h.tick(.1);h.ghosts.filter(g=>g.type==='gold').forEach(g=>assert.ok(snapshots.includes(g.id)));}
});

test('wave changes and briefings cannot reset or accelerate the gold appearance clock',()=>{
  const h=playing();h.tick(1);assert.equal(h.goldSpawnLeft,3);
  finishWave(h);assert.equal(h.goldSpawnLeft,3);assert.equal(h.wave,2);
  briefing(h);assert.equal(h.goldSpawnLeft,3);assert.ok(h.ghosts.every(g=>g.type!=='gold'));
  h.pause();h.tick(20);assert.equal(h.goldSpawnLeft,3);h.resume();
  h.tick(2.99);assert.ok(h.ghosts.every(g=>g.type!=='gold'));h.tick(.01);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
  h.start();assert.equal(h.goldSpawnLeft,0);briefing(h);assert.equal(h.goldSpawnLeft,4);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
});

test('a full field defers one gold appearance and slow frames never release a catch-up burst',()=>{
  const h=playing();h.tick(3.9);
  while(h.ghosts.length<h.config.maxGhosts)h.spawn('wisp');
  for(const g of h.ghosts){g.life=100;g.age=30;}
  h.tick(.1);assert.ok(h.goldSpawnLeft<.000001);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,0);
  h.shoot(h.ghosts[0].id);h.tick(.01);assert.equal(h.ghosts.length,8);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);assert.equal(h.goldSpawnLeft,4);
  for(const g of h.ghosts)g.life=1;
  h.tick(10);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);assert.equal(h.goldSpawnLeft,4);
});

test('capture limit blocks scheduled gold until the next wave without spending escaped attempts',()=>{
  const h=playing({goldLimit:1});const g=h.ghosts.find(g=>g.type==='gold');g.age=g.life*.3;h.shoot(g.id);
  h.tick(8);assert.equal(h.goldSpawnLeft,0);assert.ok(h.ghosts.every(g=>g.type!=='gold'));assert.equal(h.waveGold,1);
  finishWave(h);briefing(h);assert.equal(h.waveGold,0);assert.equal(h.goldSpawnLeft,4);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
});

test('the selected interval controls the number of appearances with room and no captures',()=>{
  for(const goldInterval of [2,4,6]){
    const h=playing({spawn:2,goldInterval});const ids=new Set(h.ghosts.filter(g=>g.type==='gold').map(g=>g.id));
    for(let i=0;i<1200;i++){h.tick(.05);h.ghosts.filter(g=>g.type==='gold').forEach(g=>ids.add(g.id));}
    assert.equal(h.state,'ended');assert.equal(ids.size,60/goldInterval);assert.equal(h.gold,0);assert.equal(h.waveGold,0);
  }
});

test('all four golden dashes begin identically then move straight in only the selected direction',()=>{
  for(const width of [240,400,560])for(const height of [180,440,900])for(const dashDirection of GOLD_DIRECTIONS){
    const ghost={type:'gold',motion:'goldDash',dashDirection,direction:1,age:0,life:.8,anchor:.61,lane:.37};
    const at=u=>pose({...ghost,age:u*ghost.life},width,height),origin=at(.1),still=at(.14),a=at(.35),b=at(.55),c=at(.75),end=at(1);
    assert.deepEqual(still,origin);assert.equal(origin.alpha,1);assert.equal(origin.facing,1);assert.equal(end.alpha,0);
    assert.ok(origin.x>=75&&origin.x<=width-75&&origin.y>=75&&origin.y<=height-75);
    const horizontal=['east','west'].includes(dashDirection),axis=horizontal?'x':'y',fixed=horizontal?'y':'x',sign=['east','south'].includes(dashDirection)?1:-1;
    for(const p of [a,b,c,end]){assert.equal(p[fixed],origin[fixed]);assert.equal(p.angle,0);assert.equal(p.sx,1);assert.equal(p.sy,1);Object.values(p).forEach(n=>assert.ok(Number.isFinite(n)));}
    assert.ok((a[axis]-origin[axis])*sign>0);assert.ok((b[axis]-a[axis])*sign>0);assert.ok((c[axis]-b[axis])*sign>0);
    assert.ok(Math.abs((b[axis]-a[axis])-(c[axis]-b[axis]))<1e-8);
    assert.ok(sign<0?end[axis]<0:end[axis]>(horizontal?width:height));
  }
});

test('gold direction is uniform over the RNG range and independent of its starting pose',()=>{
  for(const [i,n] of [.1,.3,.6,.9].entries()){
    const h=new Hunt({random:()=>n});h.start();briefing(h);const g=h.ghosts.find(g=>g.type==='gold');
    assert.equal(g.dashDirection,GOLD_DIRECTIONS[i]);assert.equal(g.direction,1);assert.equal(g.motion,'goldDash');
    assert.ok(g.anchor>=.12&&g.anchor<=.88&&g.lane>=.12&&g.lane<=.88);
  }
});

test('gold is fully visible and stationary from its first frame before any directional movement',()=>{
  for(const wave of [1,20])for(const dashDirection of GOLD_DIRECTIONS){
    const h=playing();h.ghosts=[];h.wave=wave;
    const g=h.spawn('gold');g.dashDirection=dashDirection;
    assert.ok(g.life>=GOLD_APPEAR_DURATION+GOLD_MOVE_DURATION[0]/1.4);
    const at=t=>pose({...g,age:t},400,440),appearance=at(0);
    assert.equal(appearance.alpha,1);
    for(const t of [.016,.08,.16,GOLD_APPEAR_DURATION]){
      const p=at(t);assert.equal(p.alpha,1);assert.equal(p.x,appearance.x);assert.equal(p.y,appearance.y);
    }
    const moving=at(GOLD_APPEAR_DURATION+.01);
    assert.equal(moving.alpha,1);assert.ok(moving.x!==appearance.x||moving.y!==appearance.y);
    // The fully visible appearance is also immediately shootable.
    assert.equal(h.shoot(g.id)?.kind,'gold');
  }
});

test('appearance interval defaults, bounds and saved preferences remain valid',()=>{
  assert.equal(settings().goldInterval,2.5);assert.equal(settings({goldInterval:0}).goldInterval,1);assert.equal(settings({goldInterval:40}).goldInterval,30);assert.equal(settings({goldInterval:NaN}).goldInterval,2.5);
  const config={goldLimit:3,goldInterval:6.5,spawn:.4};
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify({best:4200,config}):null);
  assert.equal(loaded.config.goldInterval,6.5);assert.equal(loaded.config.goldLimit,3);assert.equal(loaded.best,4200);
  assert.equal(readProgress(key=>key===STORAGE_KEY?JSON.stringify({config:{goldLimit:1}}):null).config.goldInterval,2.5);
  assert.equal('goldChance' in settings(),false);
});
