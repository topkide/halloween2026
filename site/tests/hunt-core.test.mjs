import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,SPECIES,TYPES,MOTIONS,pose,settings,restoreSettings,rollMultiplier,rewardFor} from '../hunt-core.mjs';
import {ghostSVG} from '../ghost-art.mjs';
function run(config={}){const h=new Hunt({random:()=>.5,config});h.start();h.drain();return h;}
function target(h,type){const g=h.spawn(type);Object.assign(g,{motion:'horizontal',life:2,age:.7});return g;}
function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

test('new run has five rounds, configured time, a bounty, and an immediately visible cast',()=>{
 const h=run();assert.equal(h.ammo,5);assert.equal(h.reserveAmmo,25);assert.equal(h.remaining,60);assert.equal(h.ghosts.length,4);assert.equal(h.state,'playing');assert.equal(h.bounty.multiplier,3);
 for(const g of h.ghosts)assert.ok(pose(g,400,500).alpha>.3);
});
test('five shots start exactly one reload; shots during reload spend nothing',()=>{
 const h=run();for(let i=0;i<5;i++)assert.equal(h.shoot().kind,'miss');assert.equal(h.ammo,0);assert.equal(h.reloadLeft,2.2);assert.equal(h.shots,5);
 assert.equal(h.shoot().kind,'loading');assert.equal(h.shots,5);assert.equal(h.reload(),false);h.tick(2.19);assert.equal(h.ammo,0);h.tick(.02);assert.equal(h.ammo,5);assert.equal(h.reloadLeft,0);
 assert.deepEqual(h.drain().map(e=>e.kind),['reload','loaded']);assert.equal(h.reserveAmmo,20);assert.equal(h.ammo+h.reserveAmmo,25);
});
test('reload is automatic only after an empty magazine and never creates ammunition',()=>{
 const h=run();assert.equal(h.reload(),false);h.shoot();assert.equal(h.reload(),false);assert.equal(h.reloadLeft,0);
 for(let i=0;i<4;i++)h.shoot();h.tick(.5);const remaining=h.reloadLeft;assert.equal(h.reload(),false);assert.equal(h.reloadLeft,remaining);
 h.tick(1.8);assert.equal(h.ammo,5);assert.equal(h.reserveAmmo,20);
});
test('thirty unreplenished shots exhaust ammunition and end once without a free reload',()=>{
 const h=run();let reloads=0;
 for(let i=0;i<30;i++){
  assert.equal(h.shoot().kind,'miss');assert.equal(h.ammo+h.reserveAmmo,29-i);
  if(h.reloadLeft>0){reloads++;h.tick(h.config.reload);assert.equal(h.ammo+h.reserveAmmo,29-i);}
 }
 assert.equal(reloads,5);assert.equal(h.reason,'ammo');assert.equal(h.state,'ended');assert.equal(h.reloadLeft,0);assert.equal(h.ammo,0);assert.equal(h.reserveAmmo,0);assert.equal(h.shots,30);
 const snapshot=JSON.stringify(h);assert.equal(h.shoot(),null);assert.equal(h.reload(),false);h.tick(2);assert.equal(JSON.stringify(h),snapshot);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('ammo ghost costs one round and grants two reserve rounds without score or instant reload',()=>{
 const h=run();for(let i=0;i<3;i++)h.shoot();const total=h.ammo+h.reserveAmmo,hit=h.shoot(target(h,'ammo').id);
 assert.equal(hit.ammoAdded,2);assert.equal(h.ammo,1);assert.equal(h.reserveAmmo,27);assert.equal(h.ammo+h.reserveAmmo,total+1);assert.equal(h.reloadLeft,0);assert.equal(hit.points,0);assert.equal(h.score,0);assert.equal(h.hits,1);
});
test('ammo pickup respects the thirty-round carrying limit',()=>{
 const h=run(),hit=h.shoot(target(h,'ammo').id);assert.equal(hit.ammoAdded,1);assert.equal(h.ammo,4);assert.equal(h.reserveAmmo,26);assert.equal(h.ammo+h.reserveAmmo,30);
});
test('last-round ammo pickup prevents exhaustion and loads only the two recovered rounds',()=>{
 const h=run();for(let i=0;i<29;i++){h.shoot();if(h.reloadLeft>0)h.tick(h.config.reload);}
 assert.equal(h.ammo,1);assert.equal(h.reserveAmmo,0);const hit=h.shoot(target(h,'ammo').id);
 assert.equal(hit.ammoAdded,2);assert.equal(h.state,'playing');assert.equal(h.ammo,0);assert.equal(h.reserveAmmo,2);assert.equal(h.reloadLeft,2.2);
 h.tick(2.2);assert.equal(h.ammo,2);assert.equal(h.reserveAmmo,0);h.shoot();h.shoot();assert.equal(h.reason,'ammo');
});
test('ordinary non-bounty ghosts consume the same scarce round as bounty targets',()=>{
 const h=run(),other=SPECIES.find(s=>s.id!==h.bounty.type).id;
 const ordinary=h.shoot(target(h,other).id);assert.equal(ordinary.bonus,0);assert.equal(ordinary.points,TYPES[other].points);assert.equal(h.ammo+h.reserveAmmo,29);
 const wanted=h.shoot(target(h,h.bounty.type).id);assert.equal(wanted.bonus,600);assert.equal(h.ammo+h.reserveAmmo,28);
});
test('wanted ghost pays base plus the visible bounty multiplier',()=>{
 const h=run(),g=target(h,h.bounty.type),base=TYPES[g.type].points;
 const hit=h.shoot(g.id);assert.equal(hit.bonus,600);assert.equal(hit.points,base+600);assert.equal(h.score,base+600);assert.equal(h.bounties,1);assert.equal(h.kills,1);
 const ammo=h.ammo;assert.equal(h.shoot(g.id),null);assert.equal(h.ammo,ammo);assert.equal(h.bounties,1);
});
test('gold and clock rewards are distinct from wanted multipliers',()=>{
 const h=run();h.shoot(target(h,'gold').id);assert.equal(h.score,1200);assert.equal(h.gold,1);
 h.shoot(target(h,'clock').id);assert.equal(h.remaining,65);assert.equal(h.extraTime,5);assert.equal(h.score,1300);assert.equal(h.bounties,0);
});
test('bomb ends immediately; later shots, reloads and ticks cannot change the result',()=>{
 const h=run();h.shoot(target(h,'bomb').id);assert.equal(h.reason,'bomb');assert.equal(h.state,'ended');const snapshot=JSON.stringify(h);assert.equal(h.shoot(),null);assert.equal(h.reload(),false);h.tick(20);assert.equal(JSON.stringify(h),snapshot);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('ink spends a bullet and obscures briefly without ending the game or awarding points',()=>{
 const h=run();h.shoot(target(h,'ink').id);assert.equal(h.ammo,4);assert.equal(h.score,0);assert.equal(h.kills,0);assert.equal(h.inkLeft,2.3);h.tick(2.4);assert.equal(h.inkLeft,0);assert.equal(h.state,'playing');
});
test('timeout produces exactly one end event and locks all rewards',()=>{
 const h=run();h.tick(100);assert.equal(h.remaining,0);assert.equal(h.elapsed,60);assert.equal(h.reason,'timeout');assert.equal(h.shoot(),null);h.tick(1);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('pause freezes the clock, movement, contracts and reload; resume continues',()=>{
 const h=run();for(let i=0;i<5;i++)h.shoot();h.tick(.2);assert.equal(h.pause(),true);const s=JSON.stringify(h);h.tick(30);assert.equal(h.shoot(),null);assert.equal(JSON.stringify(h),s);h.resume();h.tick(.5);assert.equal(h.remaining,59.3);assert.ok(h.reloadLeft<2);
});
test('new run restores thirty rounds and clears previous reload, ink and score',()=>{
 const h=run();h.shoot(target(h,'ink').id);for(let i=0;i<4;i++)h.shoot();h.start();assert.equal(h.score,0);assert.equal(h.remaining,60);assert.equal(h.reloadLeft,0);assert.equal(h.ammo,5);assert.equal(h.inkLeft,0);assert.equal(h.shots,0);assert.equal(h.reserveAmmo,25);assert.equal('boost' in h,false);
});
test('contracts change every eight active seconds and never repeat the same species immediately',()=>{
 const h=run(),old=h.bounty.type;h.tick(7.99);assert.equal(h.bounty.type,old);h.tick(.02);assert.notEqual(h.bounty.type,old);assert.equal(h.bountyLeft,8);assert.equal(h.drain().filter(e=>e.kind==='bounty').length,1);
});
test('weighted multipliers have explicit reachable boundaries',()=>{
 assert.deepEqual([0,.379,.38,.679,.68,.879,.88,.969,.97,.999].map(x=>rollMultiplier(()=>x)),[2,2,3,3,5,5,8,8,10,10]);
 assert.deepEqual(rewardFor('pudge',{type:'wisp',multiplier:10}),{base:100,bonus:0});
});
test('all ten spawn types are reachable, and long play keeps a bounded live population',()=>{
 const h=new Hunt({random:rng(),config:{duration:120,spawn:.35}});h.start();const seen=new Set();for(let i=0;i<1100;i++){h.tick(.1);assert.ok(h.ghosts.length<=8);h.ghosts.forEach(g=>seen.add(g.type));}assert.equal(seen.size,10);
});
test('the six patterns stay finite, upright and within the intended lifetime range',()=>{
 assert.deepEqual(Object.keys(MOTIONS),['rise','horizontal','vertical','inflate','returnX','returnY']);
 for(const height of [210,400,800])for(const direction of [-1,1])for(const motion of Object.keys(MOTIONS))for(let age=0;age<3.4;age+=.035){
  const p=pose({type:'wisp',motion,age,life:3,direction,lane:.5,seed:.9,anchor:.3},400,height);
  for(const n of Object.values(p))assert.ok(Number.isFinite(n));assert.ok(p.alpha>=0&&p.alpha<=1);assert.equal(p.angle,0);assert.ok(p.sx>=1&&p.sx<=1.4);assert.equal(p.sx,p.sy);
 }
 const h=new Hunt({random:rng()});h.start();for(const type of Object.keys(TYPES))for(let i=0;i<20;i++){const g=h.spawn(type);assert.ok(g.motion in MOTIONS);assert.ok(g.life>=2.4/1.15&&g.life<=3.4/1.15);}
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
test('one ghost spawns every half second and the live cap is eight',()=>{
 const h=new Hunt({random:rng(34)});h.start();let previous=h.serial;assert.equal(previous,4);
 h.tick(.49);assert.equal(h.serial,previous);h.tick(.01);assert.equal(h.serial,previous+1);
 const crowded=new Hunt({random:rng(19),config:{spawn:.15}});crowded.start();let peak=0;
 for(let i=0;i<1200;i++){const before=crowded.serial;crowded.tick(1/60);assert.ok(crowded.serial-before<=1);assert.ok(crowded.ghosts.length<=8);peak=Math.max(peak,crowded.ghosts.length);}
 assert.equal(peak,8);
});
test('previous default timing settings migrate while custom values survive',()=>{
 for(const [spawn,revision] of [[.8,1],[.3,2],[.85,3]])assert.equal(restoreSettings({spawn},revision).spawn,.5);
 assert.equal(restoreSettings({spawn:.8},2).spawn,.8);assert.equal(restoreSettings({spawn:.3},3).spawn,.3);assert.equal(restoreSettings({spawn:.85},4).spawn,.85);
 assert.deepEqual(restoreSettings({duration:45,reload:1.35,spawn:.85},3),{...DEFAULTS});
 const custom=restoreSettings({duration:75,reload:2,spawn:.4},3);assert.equal(custom.duration,75);assert.equal(custom.reload,2);assert.equal(custom.spawn,.4);
 assert.equal(restoreSettings({duration:45,reload:1.35},4).duration,45);assert.equal(restoreSettings({reload:1.35},4).reload,1.35);
});
test('settings tolerate corrupt or out-of-range numbers and art contains ten distinct puppets',()=>{
 assert.deepEqual(settings(null),{...DEFAULTS});assert.deepEqual(settings({duration:NaN,reload:Infinity}),{...DEFAULTS});assert.equal(settings({duration:1000}).duration,120);assert.equal(settings({spawn:-3}).spawn,.15);
 const art=Object.keys(TYPES).map(id=>ghostSVG(id,{color:TYPES[id].color}));assert.equal(new Set(art).size,10);art.forEach(svg=>{assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject/);});
});
test('different seeds produce different hunting opportunities',()=>{
 const histories=[1,2,3].map(seed=>{const h=new Hunt({random:rng(seed)});h.start();const out=[];for(let i=0;i<400;i++){h.tick(.1);out.push(h.bounty.type+':'+h.bounty.multiplier+':'+h.ghosts.map(g=>g.type).join(','));}return out.join('|');});assert.equal(new Set(histories).size,3);
});
