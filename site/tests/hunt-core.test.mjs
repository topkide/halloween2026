import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,SPECIES,TYPES,MOTIONS,pose,settings,restoreSettings,rollMultiplier,rewardFor} from '../hunt-core.mjs';
import {ghostSVG} from '../ghost-art.mjs';
function run(config={}){const h=new Hunt({random:()=>.5,config});h.start();h.drain();return h;}
function target(h,type){const g=h.spawn(type);Object.assign(g,{motion:'horizontal',life:2,age:.7});return g;}
function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

test('new run has five rounds, configured time, a bounty, and an immediately visible cast',()=>{
 const h=run();assert.equal(h.ammo,5);assert.equal(h.remaining,45);assert.equal(h.ghosts.length,2);assert.equal(h.state,'playing');assert.equal(h.bounty.multiplier,3);
 for(const g of h.ghosts)assert.ok(pose(g,400,500).alpha>.3);
});
test('five shots start exactly one reload; shots during reload spend nothing',()=>{
 const h=run();for(let i=0;i<5;i++)assert.equal(h.shoot().kind,'miss');assert.equal(h.ammo,0);assert.equal(h.reloadLeft,1.35);assert.equal(h.shots,5);
 assert.equal(h.shoot().kind,'loading');assert.equal(h.shots,5);assert.equal(h.reload(),false);h.tick(1.34);assert.equal(h.ammo,0);h.tick(.02);assert.equal(h.ammo,5);assert.equal(h.reloadLeft,0);
 assert.deepEqual(h.drain().map(e=>e.kind),['reload','loaded']);
});
test('manual reload discards partial magazine time and cannot restart an active reload',()=>{
 const h=run();assert.equal(h.reload(),false);h.shoot();assert.equal(h.reload(),true);h.tick(.5);const remaining=h.reloadLeft;assert.equal(h.reload(),false);assert.equal(h.reloadLeft,remaining);h.tick(1);assert.equal(h.ammo,5);
});
test('wanted ghost pays base plus the visible bounty multiplier',()=>{
 const h=run(),g=target(h,h.bounty.type),base=TYPES[g.type].points;
 const hit=h.shoot(g.id);assert.equal(hit.bonus,600);assert.equal(hit.points,base+600);assert.equal(h.score,base+600);assert.equal(h.bounties,1);assert.equal(h.kills,1);
 const ammo=h.ammo;assert.equal(h.shoot(g.id),null);assert.equal(h.ammo,ammo);assert.equal(h.bounties,1);
});
test('gold and clock rewards are distinct from wanted multipliers',()=>{
 const h=run();h.shoot(target(h,'gold').id);assert.equal(h.score,1200);assert.equal(h.gold,1);
 h.shoot(target(h,'clock').id);assert.equal(h.remaining,50);assert.equal(h.extraTime,5);assert.equal(h.score,1300);assert.equal(h.bounties,0);
});
test('bomb ends immediately; later shots, reloads and ticks cannot change the result',()=>{
 const h=run();h.shoot(target(h,'bomb').id);assert.equal(h.reason,'bomb');assert.equal(h.state,'ended');const snapshot=JSON.stringify(h);assert.equal(h.shoot(),null);assert.equal(h.reload(),false);h.tick(20);assert.equal(JSON.stringify(h),snapshot);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('ink spends a bullet and obscures briefly without ending the game or awarding points',()=>{
 const h=run();h.shoot(target(h,'ink').id);assert.equal(h.ammo,4);assert.equal(h.score,0);assert.equal(h.kills,0);assert.equal(h.inkLeft,2.3);h.tick(2.4);assert.equal(h.inkLeft,0);assert.equal(h.state,'playing');
});
test('timeout produces exactly one end event and locks all rewards',()=>{
 const h=run();h.tick(100);assert.equal(h.remaining,0);assert.equal(h.elapsed,45);assert.equal(h.reason,'timeout');assert.equal(h.shoot(),null);h.tick(1);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('pause freezes the clock, movement, contracts and reload; resume continues',()=>{
 const h=run();h.shoot();h.reload();h.tick(.2);assert.equal(h.pause(),true);const s=JSON.stringify(h);h.tick(30);assert.equal(h.shoot(),null);assert.equal(JSON.stringify(h),s);h.resume();h.tick(.5);assert.equal(h.remaining,44.3);assert.ok(h.reloadLeft<1);
});
test('new run clears reload, ink, score and shot counts without supply mechanics',()=>{
 const h=run();h.shoot(target(h,'ink').id);h.reload();h.start();assert.equal(h.score,0);assert.equal(h.remaining,45);assert.equal(h.reloadLeft,0);assert.equal(h.ammo,5);assert.equal(h.inkLeft,0);assert.equal(h.shots,0);assert.equal('boost' in h,false);
});
test('contracts change every eight active seconds and never repeat the same species immediately',()=>{
 const h=run(),old=h.bounty.type;h.tick(7.99);assert.equal(h.bounty.type,old);h.tick(.02);assert.notEqual(h.bounty.type,old);assert.equal(h.bountyLeft,8);assert.equal(h.drain().filter(e=>e.kind==='bounty').length,1);
});
test('weighted multipliers have explicit reachable boundaries',()=>{
 assert.deepEqual([0,.379,.38,.679,.68,.879,.88,.969,.97,.999].map(x=>rollMultiplier(()=>x)),[2,2,3,3,5,5,8,8,10,10]);
 assert.deepEqual(rewardFor('pudge',{type:'wisp',multiplier:10}),{base:100,bonus:0});
});
test('all nine spawn types are reachable, and long play keeps a bounded live population',()=>{
 const h=new Hunt({random:rng(),config:{duration:120,spawn:.35}});h.start();const seen=new Set();for(let i=0;i<1100;i++){h.tick(.1);assert.ok(h.ghosts.length<=3);h.ghosts.forEach(g=>seen.add(g.type));}assert.equal(seen.size,9);
});
test('the six patterns stay finite, upright and within the intended lifetime range',()=>{
 assert.deepEqual(Object.keys(MOTIONS),['rise','horizontal','vertical','inflate','returnX','returnY']);
 for(const height of [210,400,800])for(const direction of [-1,1])for(const motion of Object.keys(MOTIONS))for(let age=0;age<3.4;age+=.035){
  const p=pose({type:'wisp',motion,age,life:3,direction,lane:.5,seed:.9,anchor:.3},400,height);
  for(const n of Object.values(p))assert.ok(Number.isFinite(n));assert.ok(p.alpha>=0&&p.alpha<=1);assert.equal(p.angle,0);assert.ok(p.sx>=1&&p.sx<=1.4);assert.equal(p.sx,p.sy);
 }
 const h=new Hunt({random:rng()});h.start();for(const type of Object.keys(TYPES))for(let i=0;i<20;i++){const g=h.spawn(type);assert.ok(g.motion in MOTIONS);assert.ok(g.life>=2.4&&g.life<=3.4);}
});
const sample=(motion,u,direction=1,height=440)=>pose({type:'wisp',motion,age:u*3,life:3,direction,lane:.5,anchor:.4,seed:.9},400,height);
test('rise moves up, then holds still before fading in place',()=>{
 const entrance=sample('rise',.1),held=sample('rise',.35),later=sample('rise',.75),fade=sample('rise',.98);
 assert.ok(entrance.y>held.y);assert.equal(entrance.x,held.x);assert.equal(held.y,later.y);assert.equal(held.y,fade.y);assert.equal(later.alpha,1);assert.ok(fade.alpha<.3);
 const h=run(),g=target(h,'wisp');Object.assign(g,{motion:'rise',life:3,age:2.98});assert.equal(h.shoot(g.id),null);assert.equal(h.ammo,5);
});
test('horizontal and vertical paths travel in both directions without cross-axis drift',()=>{
 for(const direction of [-1,1])for(const motion of ['horizontal','vertical']){
  const a=sample(motion,.15,direction),b=sample(motion,.5,direction),c=sample(motion,.85,direction);
  const axis=motion==='horizontal'?'x':'y',fixed=motion==='horizontal'?'y':'x';
  assert.equal(a[fixed],b[fixed]);assert.equal(b[fixed],c[fixed]);assert.ok((b[axis]-a[axis])*direction>0);assert.ok((c[axis]-b[axis])*direction>0);
  assert.ok(Math.abs((b[axis]-a[axis])-(c[axis]-b[axis]))<1e-8);
 }
});
test('inflate swells once to 1.4x, shrinks to normal, and never changes position',()=>{
 const phases=[.15,.37,.53,.72,.85].map(u=>sample('inflate',u));
 assert.deepEqual(phases.map(p=>p.sx),[1,1.4,1.4,1,1]);
 phases.forEach(p=>{assert.equal(p.x,phases[0].x);assert.equal(p.y,phases[0].y);});
});
test('return paths stop in the middle for about one second and leave by the same edge',()=>{
 for(const motion of ['returnX','returnY'])for(const direction of [-1,1]){
  const axis=motion==='returnX'?'x':'y',fixed=motion==='returnX'?'y':'x';
  const start=sample(motion,0,direction),incoming=sample(motion,.15,direction),stop=sample(motion,.31,direction),held=sample(motion,.61,direction),outgoing=sample(motion,.81,direction),end=sample(motion,1,direction);
  assert.equal(stop[axis],held[axis]);assert.equal(start[axis],end[axis]);assert.ok(Math.abs(incoming[axis]-outgoing[axis])<1e-8);
  assert.ok((stop[axis]-start[axis])*direction>0);assert.ok((end[axis]-held[axis])*direction<0);
  for(const p of [incoming,stop,held,outgoing,end])assert.equal(p[fixed],start[fixed]);
 }
});
test('spawns are staggered one at a time with no more than three live ghosts',()=>{
 const h=new Hunt({random:rng(34)});h.start();let previous=h.serial,lastBirth=0,births=0;assert.equal(previous,2);
 for(let i=0;i<1200;i++){h.tick(1/60);const added=h.serial-previous;assert.ok(added<=1);assert.ok(h.ghosts.length<=3);if(added){assert.ok(h.elapsed-lastBirth>=.76);births++;lastBirth=h.elapsed;}previous=h.serial;}
 assert.ok(births>10);assert.ok(births<26);
});
test('only old default spawn rates migrate; custom settings and other adjustments survive',()=>{
 assert.equal(restoreSettings({spawn:.8}).spawn,.85);assert.equal(restoreSettings({spawn:.3},2).spawn,.85);assert.equal(restoreSettings({spawn:.5}).spawn,.5);assert.equal(restoreSettings({spawn:.8},2).spawn,.8);assert.equal(restoreSettings({spawn:.3},3).spawn,.3);assert.equal(restoreSettings(null).spawn,.85);
 const custom=restoreSettings({duration:60,reload:2,spawn:.3},2);assert.equal(custom.duration,60);assert.equal(custom.reload,2);
});
test('settings tolerate corrupt or out-of-range numbers and art contains nine distinct puppets',()=>{
 assert.deepEqual(settings(null),{...DEFAULTS});assert.deepEqual(settings({duration:NaN,reload:Infinity}),{...DEFAULTS});assert.equal(settings({duration:1000}).duration,120);assert.equal(settings({spawn:-3}).spawn,.15);
 const art=Object.keys(TYPES).map(id=>ghostSVG(id,{color:TYPES[id].color}));assert.equal(new Set(art).size,9);art.forEach(svg=>{assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject/);});
});
test('different seeds produce different hunting opportunities',()=>{
 const histories=[1,2,3].map(seed=>{const h=new Hunt({random:rng(seed)});h.start();const out=[];for(let i=0;i<400;i++){h.tick(.1);out.push(h.bounty.type+':'+h.bounty.multiplier+':'+h.ghosts.map(g=>g.type).join(','));}return out.join('|');});assert.equal(new Set(histories).size,3);
});
