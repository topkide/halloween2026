import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,SPECIES,TYPES,pose,settings,rollMultiplier,rewardFor} from '../hunt-core.mjs';
import {ghostSVG} from '../ghost-art.mjs';
function run(config={}){const h=new Hunt({random:()=>.5,config});h.start();h.drain();return h;}
function target(h,type){const g=h.spawn(type);g.age=1;return g;}
function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}

test('new run has five rounds, configured time, a bounty, and an immediately visible cast',()=>{
 const h=run();assert.equal(h.ammo,5);assert.equal(h.remaining,45);assert.equal(h.ghosts.length,4);assert.equal(h.state,'playing');assert.equal(h.bounty.multiplier,3);
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
 const h=run();h.tick(100);assert.equal(h.remaining,0);assert.equal(h.elapsed,45);assert.equal(h.reason,'timeout');assert.equal(h.boost('time'),false);h.tick(1);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('pause freezes the clock, movement, contracts and reload; resume continues',()=>{
 const h=run();h.shoot();h.reload();h.tick(.2);assert.equal(h.pause(),true);const s=JSON.stringify(h);h.tick(30);assert.equal(h.shoot(),null);assert.equal(JSON.stringify(h),s);h.resume();h.tick(.5);assert.equal(h.remaining,44.3);assert.ok(h.reloadLeft<1);
});
test('each supply is once per run and a fresh run clears its usage',()=>{
 const h=run();assert.equal(h.boost('time'),true);assert.equal(h.remaining,55);assert.equal(h.boost('time'),false);assert.equal(h.boost('unknown'),false);
 for(let i=0;i<5;i++)h.shoot();assert.ok(h.reloadLeft);assert.equal(h.boost('ammo'),true);assert.equal(h.ammo,5);assert.equal(h.reloadLeft,0);assert.equal(h.boost('ammo'),false);h.start();assert.equal(h.score,0);assert.equal(h.remaining,45);assert.equal(h.used.time,false);
});
test('contracts change every eight active seconds and never repeat the same species immediately',()=>{
 const h=run(),old=h.bounty.type;h.tick(7.99);assert.equal(h.bounty.type,old);h.tick(.02);assert.notEqual(h.bounty.type,old);assert.equal(h.bountyLeft,8);assert.equal(h.drain().filter(e=>e.kind==='bounty').length,1);
});
test('weighted multipliers have explicit reachable boundaries',()=>{
 assert.deepEqual([0,.379,.38,.679,.68,.879,.88,.969,.97,.999].map(x=>rollMultiplier(()=>x)),[2,2,3,3,5,5,8,8,10,10]);
 assert.deepEqual(rewardFor('pudge',{type:'wisp',multiplier:10}),{base:100,bonus:0});
});
test('all nine spawn types are reachable, and long play keeps a bounded live population',()=>{
 const h=new Hunt({random:rng(),config:{duration:120,spawn:.35}});h.start();const seen=new Set();for(let i=0;i<1100;i++){h.tick(.1);assert.ok(h.ghosts.length<=7);h.ghosts.forEach(g=>seen.add(g.type));}assert.equal(seen.size,9);
});
test('motions are distinct, finite, and inside vertical bounds on short and tall screens',()=>{
 for(const height of [210,400,800])for(const type of Object.keys(TYPES))for(let age=.1;age<6;age+=.2){const p=pose({type,age,life:7,direction:1,lane:.5,seed:.9},400,height);for(const n of Object.values(p))assert.ok(Number.isFinite(n));assert.ok(p.y>=54&&p.y<=height-54);assert.ok(p.alpha>=0&&p.alpha<=1);}
 const poses=SPECIES.map(s=>JSON.stringify(pose({type:s.id,age:2,life:7,direction:1,lane:.5,seed:.9},400,440)));assert.equal(new Set(poses).size,5);
});
test('disappearing skitter cannot be shot during its invisible window',()=>{
 const h=run(),g=target(h,'skitter');g.seed=0;g.age=2;assert.ok(pose(g,400,440).alpha<.3);assert.equal(h.shoot(g.id),null);assert.equal(h.ammo,5);g.age=2.5;assert.equal(h.shoot(g.id).kind,'skitter');
});
test('settings tolerate corrupt or out-of-range numbers and art contains nine distinct puppets',()=>{
 assert.deepEqual(settings(null),{...DEFAULTS});assert.deepEqual(settings({duration:NaN,reload:Infinity}),{...DEFAULTS});assert.equal(settings({duration:1000}).duration,120);assert.equal(settings({spawn:-3}).spawn,.35);
 const art=Object.keys(TYPES).map(id=>ghostSVG(id,{color:TYPES[id].color}));assert.equal(new Set(art).size,9);art.forEach(svg=>{assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject/);});
});
test('different seeds produce different hunting opportunities',()=>{
 const histories=[1,2,3].map(seed=>{const h=new Hunt({random:rng(seed)});h.start();const out=[];for(let i=0;i<400;i++){h.tick(.1);out.push(h.bounty.type+':'+h.bounty.multiplier+':'+h.ghosts.map(g=>g.type).join(','));}return out.join('|');});assert.equal(new Set(histories).size,3);
});
