import test from 'node:test';
import assert from 'node:assert/strict';
import {GhostGame} from '../game-core.mjs';
import {DEFAULT_CONFIG,rowAt,validateConfig,serializeBalanceDB,parseBalanceDB} from '../balance-config.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.035,`${a} != ${b}`);
// Rule tests pin the PLAY TEST 10 tuning so retuning DEFAULT_CONFIG (e.g. from a balance DB) does not break them.
const BASE=validateConfig({...DEFAULT_CONFIG,movement:{normal:11.5,bomb:8,boss:8.3},
 normalTable:[{at:0,interval:.85,life:2.6,points:100,penalty:1},{at:30,interval:.70,life:2.1,points:120,penalty:1},{at:60,interval:.58,life:1.6,points:140,penalty:1.2},{at:90,interval:.48,life:1.15,points:160,penalty:1.5}],
 bombTable:[{at:0,interval:7,life:2.5},{at:30,interval:6,life:2.2},{at:60,interval:5,life:1.8},{at:90,interval:4,life:1.5}],
 boss:{...DEFAULT_CONFIG.boss,firstAt:20,respawn:15,timeBonus:15,abilityInterval:10},
 talismanTable:[{at:0,interval:.15},{at:30,interval:.13},{at:60,interval:.11},{at:90,interval:.10}]});
function setup(edit=()=>{},rng=()=>.4){const c=structuredClone(BASE);c.round.startTime=300;edit(c);const g=new GhostGame(rng,c);g.start(c,{flashlight:1,talisman:1});g.nextNormal=9999;g.nextBomb=9999;g.bossAt=9999;return g;}

test('time rows, fixed spawn values, DB roundtrip and invalid schema',()=>{
 const g=setup();const first=g.spawn();g.elapsed=60;assert.equal(g.normalRow().points,140);assert.equal(first.points,100);assert.equal(g.spawn().points,140);assert.equal(rowAt(g.config.normalTable,10000).life,1.15);
 assert.deepEqual(parseBalanceDB(serializeBalanceDB(DEFAULT_CONFIG)),DEFAULT_CONFIG);
 const bad=structuredClone(DEFAULT_CONFIG);bad.normalTable[0].interval=0;assert.throws(()=>validateConfig(bad));bad.version=5;assert.throws(()=>validateConfig(bad));
});
test('normal escape loses time, bomb expiry scores and bomb tap costs exactly one HP',()=>{
 const g=setup();const n=g.spawn();g.tick(n.life+.03);near(g.escapeTimeLost,1);assert.equal(g.score,0);
 const bomb=g.spawn('bomb');g.tick(bomb.life+.03);assert.equal(g.score,100);assert.equal(g.bombsAvoided,1);
 const b=g.spawn('bomb');g.shoot(b.id);assert.equal(g.health,4);assert.equal(g.score,100);assert.equal(g.bombHits,1);
});
test('boss max one, nonlethal teleport and post-kill respawn delay',()=>{
 const g=setup();const b=g.spawn('boss');assert.equal(g.spawn('boss'),null);const old={x:b.x,y:b.y};g.shoot(b.id);assert.ok(Math.hypot(old.x-b.x,old.y-b.y)>=.3);assert.equal(b.hp,4);
 const time=g.time;while(g.ghosts.includes(b))g.shoot(b.id);assert.equal(g.time,time+15);assert.equal(g.score,500);
 g.tick(14.9);assert.equal(g.ghosts.length,0);g.tick(.2);assert.equal(g.ghosts.filter(x=>x.kind==='boss').length,1);
});
test('warning precedes translucent face, hits do not dismiss face',()=>{
 const g=setup();const b=g.spawn('boss');g.tick(7.05);assert.equal(g.face.phase,'warning');g.tick(3);assert.equal(g.face.phase,'cover');g.shoot(b.id);assert.equal(g.face.phase,'cover');g.tick(2.05);assert.equal(g.face.phase,'idle');
});
test('flashlight kills current and newly spawned normal, bomb and boss until duration ends',()=>{
 const g=setup();g.spawn();g.spawn('bomb');g.spawn('boss');assert.ok(g.useItem('flashlight').used);assert.equal(g.ghosts.length,0);assert.equal(g.score,700);assert.equal(g.time,315);
 g.spawn();g.spawn('bomb');g.spawn('boss');assert.equal(g.ghosts.length,0);assert.equal(g.score,1400);g.tick(3.05);g.spawn();assert.equal(g.ghosts.length,1);assert.equal(g.items.flashlight,0);assert.ok(!g.useItem('flashlight').used);
});
test('talisman protects existing normals, removes bombs, suppresses boss ability and resets it',()=>{
 const g=setup();g.spawn('bomb');const boss=g.spawn('boss');g.tick(10.05);assert.equal(g.face.phase,'cover');const n=g.spawn();g.useItem('talisman');assert.equal(g.face.phase,'idle');assert.ok(!g.ghosts.some(x=>x.kind==='bomb'));assert.equal(g.spawn('bomb'),null);
 const points=g.score,hp=g.health;g.shoot(null);assert.equal(g.health,hp);g.tick(2.7);assert.equal(g.escapeTimeLost,0);assert.equal(g.score,points);assert.ok(!g.ghosts.includes(n));assert.equal(g.face.phase,'idle');g.tick(2.4);
 assert.equal(g.ghosts.length,1);assert.equal(g.ghosts[0],boss);near(boss.abilityAt-g.clock,9.9);g.shoot(null);assert.equal(g.health,hp);g.tick(.51);g.shoot(null);assert.equal(g.health,hp-1);
});
test('talisman and flashlight coexist and cleanup awards neither points nor penalties',()=>{
 const g=setup();g.useItem('talisman');assert.ok(g.useItem('flashlight').used);assert.ok(g.isTalismanActive()&&g.isFlashActive());g.tick(.6);assert.ok(g.score>=300);g.tick(2.5);const score=g.score;g.tick(2);assert.equal(g.ghosts.length,0);assert.equal(g.score,score);assert.equal(g.escapeTimeLost,0);
});
test('revive once: rewind, full recovery, preserve items and peak, free bonus talisman',()=>{
 const g=setup();g.elapsed=65;g.peakTime=65;g.score=500;g.health=1;g.time=2;g.end('health');assert.equal(g.collectionResult,null);assert.ok(g.continueRound());assert.equal(g.elapsed,35);assert.equal(g.peakTime,65);assert.equal(g.score,500);assert.equal(g.time,300);assert.equal(g.health,5);assert.equal(g.items.talisman,1);assert.equal(g.used.talisman,false);assert.ok(g.isTalismanActive());g.tick(5.05);assert.ok(g.useItem('talisman').used);g.end('time');assert.ok(!g.continueRound());
 const short=setup();short.elapsed=10;short.end('time');short.continueRound();assert.equal(short.elapsed,0);
});
test('collection rolled only once at final result, highest time, unowned only and max two',()=>{
 let calls=0;const g=setup(c=>{c.collectionTable.forEach(x=>{x.chance=100;x.at=30;});},()=>{calls++;return .3;});g.elapsed=10;g.peakTime=40;
 assert.equal(g.finish(),null);g.end('time');const won=g.finish(['textbook']);assert.equal(won.length,2);assert.ok(!won.includes('textbook'));const count=calls;assert.deepEqual(g.finish([]),won);assert.equal(calls,count);assert.ok(!g.continueRound());
 const low=setup(c=>c.collectionTable.forEach(x=>x.chance=100));low.peakTime=14;low.end('time');assert.deepEqual(low.finish(),[]);
});
test('pause freezes item, spawn, ability and round clocks',()=>{
 const g=setup();g.useItem('talisman');const before=g.snapshot();g.pause();g.tick(40);g.resume();assert.deepEqual(g.snapshot(),before);
});
test('perfect player can reach late table with provisional boss time bonuses',()=>{
 const g=new GhostGame(()=>.4);g.start();for(let i=0;i<2400&&g.state==='running';i++){g.tick(.05);for(const x of [...g.ghosts])if(x.kind!=='bomb')while(g.ghosts.includes(x))g.shoot(x.id);g.drainEvents();}assert.equal(g.state,'running');assert.ok(g.peakTime>119);assert.equal(g.normalRow().points,160);
});
