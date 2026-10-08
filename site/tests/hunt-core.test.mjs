import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,SPECIES,TYPES,MOTIONS,pose,settings,restoreSettings,rollMultiplier,rewardFor} from '../hunt-core.mjs';
import {ghostSVG} from '../ghost-art.mjs';
function run(config={}){const h=new Hunt({random:()=>.5,config});h.start();h.drain();return h;}
function target(h,type){const g=h.spawn(type);Object.assign(g,{motion:'drift',life:2,age:.7});return g;}
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
 const h=new Hunt({random:rng(),config:{duration:120,spawn:.35}});h.start();const seen=new Set();for(let i=0;i<1100;i++){h.tick(.1);assert.ok(h.ghosts.length<=7);h.ghosts.forEach(g=>seen.add(g.type));}assert.equal(seen.size,9);
});
test('all motion paths remain finite at mobile and desktop sizes, and have short lifetimes',()=>{
 for(const height of [210,400,800])for(const motion of Object.keys(MOTIONS))for(let age=0;age<2.4;age+=.035){const p=pose({type:'wisp',motion,age,life:2,direction:1,lane:.5,seed:.9,anchor:.3},400,height);for(const n of Object.values(p))assert.ok(Number.isFinite(n));assert.ok(p.alpha>=0&&p.alpha<=1);assert.ok(p.sx>0&&p.sy>0);}
 const h=new Hunt({random:rng()});h.start();for(let i=0;i<100;i++){const g=h.spawn('wisp');assert.ok(g.life>=1&&g.life<=2.2);}
});
test('blink vanishes completely and reappears at a different location; invisible shots are rejected',()=>{
 const h=run(),g=target(h,'wisp');Object.assign(g,{motion:'blink',life:2,anchor:.25,age:.4});
 const a=pose(g,400,440);assert.equal(a.alpha,1);g.age=.6;assert.equal(pose(g,400,440).alpha,0);assert.equal(h.shoot(g.id),null);assert.equal(h.ammo,5);
 g.age=.88;const b=pose(g,400,440);assert.equal(b.alpha,1);assert.ok(Math.abs(b.x-a.x)>=180);assert.ok(h.shoot(g.id).points>0);
});
test('inflation produces a large sudden swell and collapse in place',()=>{
 const g={type:'pudge',motion:'inflate',life:1.6,direction:1,lane:.5,seed:.9,anchor:.5};
 const small=pose({...g,age:1.6*.17},400,440),big=pose({...g,age:1.6*.31},400,440),gone=pose({...g,age:1.6*.8},400,440);
 assert.ok(big.sx/small.sx>2.4);assert.equal(big.x,small.x);assert.equal(gone.alpha,0);
});
test('ambush has a brief stationary exposure, while dive crosses the screen vertically',()=>{
 const g={type:'skitter',motion:'ambush',life:1.2,direction:1,lane:.5,seed:.9,anchor:.5};
 assert.equal(pose({...g,age:.02},400,440).alpha,0);assert.equal(pose({...g,age:.3},400,440).alpha,1);assert.equal(pose({...g,age:.9},400,440).alpha,0);
 const top=pose({...g,motion:'dive',age:0},400,440),bottom=pose({...g,motion:'dive',age:1.1},400,440);assert.ok(bottom.y-top.y>500);
});
test('new pace has bursts and ghosts escape during a normal reload',()=>{
 const h=new Hunt({random:rng(34)});h.start();const initialIds=h.ghosts.map(g=>g.id);let largestBirths=0,previous=h.serial;
 for(let i=0;i<5;i++)h.shoot();for(let i=0;i<24;i++){h.tick(.05);largestBirths=Math.max(largestBirths,h.serial-previous);previous=h.serial;}
 assert.ok(h.reloadLeft>0);assert.ok(initialIds.some(id=>!h.ghosts.some(g=>g.id===id)));assert.equal(largestBirths,2);
 assert.ok(h.serial>=8);assert.ok(h.ghosts.length<=7);
});
test('only former default spawn settings are migrated; custom settings survive',()=>{
 assert.equal(restoreSettings({spawn:.8}).spawn,.3);assert.equal(restoreSettings({spawn:.5}).spawn,.5);assert.equal(restoreSettings({spawn:.8},2).spawn,.8);assert.equal(restoreSettings(null).spawn,.3);
});
test('settings tolerate corrupt or out-of-range numbers and art contains nine distinct puppets',()=>{
 assert.deepEqual(settings(null),{...DEFAULTS});assert.deepEqual(settings({duration:NaN,reload:Infinity}),{...DEFAULTS});assert.equal(settings({duration:1000}).duration,120);assert.equal(settings({spawn:-3}).spawn,.15);
 const art=Object.keys(TYPES).map(id=>ghostSVG(id,{color:TYPES[id].color}));assert.equal(new Set(art).size,9);art.forEach(svg=>{assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject/);});
});
test('different seeds produce different hunting opportunities',()=>{
 const histories=[1,2,3].map(seed=>{const h=new Hunt({random:rng(seed)});h.start();const out=[];for(let i=0;i<400;i++){h.tick(.1);out.push(h.bounty.type+':'+h.bounty.multiplier+':'+h.ghosts.map(g=>g.type).join(','));}return out.join('|');});assert.equal(new Set(histories).size,3);
});
