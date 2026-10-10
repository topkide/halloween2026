import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,DEFAULTS,SPECIES,TYPES,MOTIONS,GOLD_LIFETIME,pose,settings,rollMultiplier} from '../hunt-core.mjs';
import {ghostSVG} from '../ghost-art.mjs';
import {STORAGE_KEY,readProgress} from '../progress.mjs';
function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function briefing(config={}){const h=new Hunt({random:rng(),config});h.start();h.drain();return h;}
function playing(config={}){const h=briefing(config);h.tick(h.config.briefingDuration);h.drain();return h;}
function target(h,type='wisp'){
 if(h.ghosts.length===h.config.maxGhosts)h.ghosts.pop();
 const g=h.spawn(type);Object.assign(g,{motion:'rise',life:2,age:.6});return g;
}
function finishWave(h,lastType='wisp'){
 while(h.state==='playing')h.shoot(target(h,h.waveKills===h.waveGoal-1?lastType:'wisp').id);
}

test('a run starts with a golden-bounty briefing, eight targets and a frozen sixty-second clock',()=>{
 const h=briefing();assert.equal(h.state,'briefing');assert.equal(h.wave,1);assert.equal(h.waveGoal,8);assert.equal(h.remaining,60);assert.equal(h.score,0);assert.equal(h.ghosts.length,0);assert.equal(h.bounty.type,'gold');assert.equal(h.bounty.points,500*h.bounty.multiplier);
 assert.equal(h.shoot(),null);h.tick(1);assert.equal(h.remaining,60);assert.equal(h.state,'briefing');h.tick(2);assert.equal(h.state,'playing');assert.equal(h.remaining,60);
 assert.equal(h.ghosts.length,3);assert.equal(h.ghosts.filter(g=>g.type==='gold').length,1);
});
test('each miss costs two seconds and no progress or score; elapsed time also counts down',()=>{
 const h=playing();h.tick(.5);const hit=h.shoot();assert.equal(hit.kind,'miss');assert.equal(hit.penalty,2);assert.equal(h.remaining,57.5);assert.equal(h.misses,1);assert.equal(h.waveKills,0);assert.equal(h.score,0);
 h.tick(1);assert.equal(h.remaining,56.5);assert.equal(h.shots,1);assert.equal(h.hits,0);
});
test('ordinary ghosts advance the wave and golden ghosts pay the wave multiplier',()=>{
 const h=playing();const regular=h.shoot(target(h).id);assert.equal(regular.points,200);assert.equal(h.waveKills,1);assert.equal(h.score,200);
 const reward=h.bounty.points,gold=h.shoot(target(h,'gold').id);assert.equal(gold.points,reward);assert.equal(h.score,200+reward);assert.equal(h.normalScore,200);assert.equal(h.goldScore,reward);assert.equal(h.waveKills,2);assert.equal(h.gold,1);assert.equal(h.remaining,60);
});
test('ordinary species award distinct difficulty points and gold alone uses the wave multiplier',()=>{
 const h=playing({baseGoal:20}),expected={pudge:100,grasp:150,wisp:200,stilt:250,skitter:300};
 for(const [type,points] of Object.entries(expected))assert.equal(h.shoot(target(h,type).id).points,points);
 assert.equal(h.normalScore,1000);assert.equal(h.score,1000);assert.equal(h.goldScore,0);
 assert.ok(TYPES.pudge.width>TYPES.skitter.width&&TYPES.pudge.height>TYPES.skitter.height);
 h.bounty={type:'gold',multiplier:10,points:5000};assert.equal(h.shoot(target(h,'gold').id).points,5000);
 assert.equal(h.shoot(target(h,'pudge').id).points,100);assert.equal(h.score,6100);assert.equal(h.normalScore,1100);assert.equal(h.goldScore,5000);assert.equal('coins' in h,false);
 const before=h.score;assert.equal(h.shoot().points,0);assert.equal(h.score,before);
});
test('equal kill counts can earn different total scores through species and golden bounties',()=>{
 const easy=playing(),hard=playing(),golden=playing();
 easy.shoot(target(easy,'pudge').id);hard.shoot(target(hard,'skitter').id);golden.shoot(target(golden,'gold').id);
 assert.equal(easy.kills,hard.kills);assert.equal(hard.kills,golden.kills);assert.ok(easy.score<hard.score&&hard.score<golden.score);
});
test('default spawning runs every 0.23 seconds without accumulating frame rounding or exceeding the cap',()=>{
 const h=playing();assert.equal(h.config.spawn,.23);const before=h.serial;
 for(let i=0;i<60;i++){h.ghosts=[];h.tick(1/60);}
 assert.equal(h.serial-before,4);
 h.ghosts=[];h.tick(.15);assert.equal(h.serial-before,5);
});
test('old coin records migrate only preferences and always adopt the new 0.23-second interval',()=>{
 const old={best:90000,lastResult:{coins:5000},soundOn:false,config:{duration:90,spawn:.5,baseGoal:10,missPenalty:3}};
 const state=readProgress(key=>key==='catjump-wave-hunt-v1'?JSON.stringify(old):null);
 assert.equal(state.best,0);assert.equal(state.lastResult,null);assert.equal(state.soundOn,false);assert.equal(state.config.spawn,.23);assert.equal(state.config.duration,90);assert.equal(state.config.baseGoal,10);assert.equal(state.config.missPenalty,3);assert.equal(old.best,90000);
});
test('current score records and custom settings survive reload while malformed storage falls back safely',()=>{
 const saved={best:2300,lastResult:{score:2300,normalScore:800,goldScore:1500},soundOn:false,config:{spawn:.31}};
 const state=readProgress(key=>key===STORAGE_KEY?JSON.stringify(saved):null);
 assert.equal(state.best,2300);assert.deepEqual(state.lastResult,saved.lastResult);assert.equal(state.config.spawn,.31);assert.equal(state.soundOn,false);
 for(const raw of ['broken','[]','null','12']){const fallback=readProgress(()=>raw);assert.equal(fallback.config.spawn,.23);assert.equal(fallback.best,0);}
 assert.equal(readProgress(()=>{throw Error('storage unavailable');}).config.spawn,.23);
});
test('bounty remains fixed throughout a wave instead of changing on an eight-second timer',()=>{
 const h=playing(),before={...h.bounty};h.tick(9);assert.deepEqual(h.bounty,before);assert.equal(h.wave,1);assert.equal(h.remaining,51);
});
test('clearing a wave opens the next briefing, increases the goal, and preserves score and time',()=>{
 const h=playing();h.tick(3);h.shoot();const remaining=h.remaining,previous=h.bounty.multiplier,payout=h.bounty.points;
 finishWave(h,'gold');assert.equal(h.state,'briefing');assert.equal(h.clearedWaves,1);assert.equal(h.wave,2);assert.equal(h.waveGoal,10);assert.equal(h.waveKills,0);assert.equal(h.kills,8);assert.equal(h.score,7*200+payout);assert.equal(h.normalScore,7*200);assert.equal(h.goldScore,payout);assert.equal(h.remaining,remaining);assert.notEqual(h.bounty.multiplier,previous);assert.equal(h.ghosts.length,0);
 assert.equal(h.drain().filter(e=>e.kind==='wave-clear').length,1);assert.equal(h.shoot(),null);h.tick(2.4);assert.equal(h.state,'playing');assert.equal(h.remaining,remaining);
});
test('unlimited consecutive hits never require ammunition or reload',()=>{
 const h=playing();for(let i=0;i<65;i++){if(h.state==='briefing')h.tick(2.4);assert.notEqual(h.shoot(target(h).id),null);}
 assert.equal(h.shots,65);assert.equal(h.hits,65);assert.equal(h.remaining,60);assert.ok(h.clearedWaves>=4);
 for(const key of ['ammo','reserveAmmo','reloadLeft','reload','boost'])assert.equal(key in h,false);
});
test('a repeated hit cannot add progress, score, a miss penalty, or another wave transition',()=>{
 const h=playing(),g=target(h,'gold');h.shoot(g.id);const snapshot=JSON.stringify(h);assert.equal(h.shoot(g.id),null);assert.equal(JSON.stringify(h),snapshot);
});
test('gold appears quickly, holds briefly, then expires before ordinary ghosts without a penalty',()=>{
 const h=playing(),g=h.ghosts.find(g=>g.type==='gold'),ordinary=h.ghosts.filter(g=>g.type!=='gold');
 assert.equal(g.age,0);assert.ok(g.life>=GOLD_LIFETIME[0]&&g.life<=GOLD_LIFETIME[1]);assert.equal(g.motion,'rise');
 const at=u=>pose({...g,age:g.life*u},400,440),held=at(.12);
 assert.equal(at(.04).alpha,1);assert.equal(held.y,at(.85).y);assert.equal(at(.85).alpha,1);assert.ok(at(.98).alpha<.3);assert.equal(at(1).alpha,0);
 h.tick(g.life+.01);assert.ok(!h.ghosts.includes(g));assert.ok(ordinary.every(ghost=>h.ghosts.includes(ghost)));assert.equal(h.waveKills,0);assert.equal(h.misses,0);assert.ok(Math.abs(h.remaining-(60-g.life-.01))<1e-9);
 assert.equal(h.shoot(g.id),null);assert.equal(h.shots,0);
});
test('every available ghost advances the wave; every species awards its score and no hazard state remains',()=>{
 const h=playing({baseGoal:20});assert.deepEqual(Object.keys(TYPES),[...SPECIES.map(s=>s.id),'gold']);
 for(const type of Object.keys(TYPES)){const before=h.waveKills,hit=h.shoot(target(h,type).id);assert.equal(h.waveKills,before+1);assert.equal(hit.points,type==='gold'?h.bounty.points:TYPES[type].points);assert.equal(h.state,'playing');}
 assert.equal('inkLeft' in h,false);assert.equal(h.misses,0);assert.equal(h.remaining,60);
});
test('a lethal miss clamps the clock at zero and ends exactly once with a clear cause',()=>{
 const h=playing();h.tick(59.5);const hit=h.shoot();assert.equal(hit.penalty,.5);assert.equal(h.remaining,0);assert.equal(h.reason,'timeout');assert.equal(h.endCause,'miss');assert.equal(h.state,'ended');
 const snapshot=JSON.stringify(h);h.tick(20);assert.equal(h.shoot(),null);assert.equal(JSON.stringify(h),snapshot);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('natural timeout also ends once and locks all rewards',()=>{
 const h=playing();h.tick(200);assert.equal(h.remaining,0);assert.equal(h.elapsed,60);assert.equal(h.endCause,'clock');assert.equal(h.state,'ended');assert.equal(h.shoot(),null);h.tick(1);assert.equal(h.drain().filter(e=>e.kind==='end').length,1);
});
test('pause freezes both gameplay and pre-wave briefings, then resumes the same phase',()=>{
 for(const h of [briefing(),playing()]){const phase=h.state,remaining=h.remaining;h.tick(.4);const before=h.state==='briefing'?h.briefingLeft:h.remaining;assert.equal(h.pause(),true);const snapshot=JSON.stringify(h);h.tick(30);assert.equal(h.shoot(),null);assert.equal(JSON.stringify(h),snapshot);h.resume();assert.equal(h.state,phase);h.tick(.2);assert.ok((phase==='briefing'?h.briefingLeft:h.remaining)<before);assert.ok(h.remaining<=remaining);}
});
test('retry resets waves, score, misses and clock without reviving old targets',()=>{
 const h=playing();h.shoot(target(h,'gold').id);h.shoot();const id=target(h).id;h.start();assert.equal(h.state,'briefing');assert.equal(h.score,0);assert.equal(h.normalScore,0);assert.equal(h.goldScore,0);assert.equal(h.wave,1);assert.equal(h.clearedWaves,0);assert.equal(h.shots,0);assert.equal(h.misses,0);assert.equal(h.remaining,60);h.tick(2.4);assert.equal(h.shoot(id),null);
});
test('only ordinary and golden ghosts spawn with a strict eight-ghost cap',()=>{
 const h=playing({duration:120,spawn:.15}),seen=new Set();let peak=0;
 for(let i=0;i<1000;i++){const serial=h.serial;h.tick(.05);assert.ok(h.serial-serial<=1);peak=Math.max(peak,h.ghosts.length);assert.ok(h.ghosts.length<=8);h.ghosts.forEach(g=>seen.add(g.type));}
 assert.equal(peak,8);assert.deepEqual([...seen].sort(),[...Object.keys(TYPES)].sort());assert.equal(seen.size,6);
 const standard=playing();const before=standard.serial;standard.tick(.22);assert.equal(standard.serial,before);standard.tick(.01);assert.equal(standard.serial,before+1);
});
test('wave difficulty is bounded and no goal can exceed twenty-four',()=>{
 const h=playing();for(let i=0;i<20;i++){finishWave(h);assert.ok(h.waveGoal<=24);h.tick(2.4);for(const g of h.ghosts)assert.ok(g.type==='gold'?g.life>=.5&&g.life<=.9:g.life>=1&&g.life<=2.4);}
 assert.equal(h.waveGoal,24);
});
test('multiplier weighting retains all outcomes and excludes the previous wave value',()=>{
 assert.deepEqual([0,.379,.38,.679,.68,.879,.88,.969,.97,.999].map(n=>rollMultiplier(()=>n)),[2,2,3,3,5,5,8,8,10,10]);
 for(const previous of [2,3,5,8,10])for(const n of [0,.2,.5,.8,.999])assert.notEqual(rollMultiplier(()=>n,previous),previous);
});
test('settings tolerate corrupt data and the current art contains six distinct puppets',()=>{
 assert.deepEqual(settings(null),{...DEFAULTS});assert.deepEqual(settings({duration:NaN}),{...DEFAULTS});assert.equal(settings({baseGoal:6.8}).baseGoal,7);assert.equal(settings({missPenalty:0}).missPenalty,.5);assert.equal(settings({duration:500}).duration,120);
 const art=Object.keys(TYPES).map(id=>ghostSVG(id,{color:TYPES[id].color}));assert.equal(new Set(art).size,6);art.forEach(svg=>{assert.match(svg,/<svg/);assert.doesNotMatch(svg,/<script|<foreignObject/);});
});
test('all six quick motion paths remain finite and upright at short and tall screen sizes',()=>{
 assert.deepEqual(Object.keys(MOTIONS),['rise','horizontal','vertical','inflate','returnX','returnY']);
 for(const height of [210,400,800])for(const direction of [-1,1])for(const motion of Object.keys(MOTIONS))for(let age=0;age<2.5;age+=.035){const p=pose({type:'wisp',motion,age,life:2,direction,lane:.5,anchor:.3},400,height);for(const n of Object.values(p))assert.ok(Number.isFinite(n));assert.equal(p.angle,0);assert.ok(p.alpha>=0&&p.alpha<=1);assert.ok(p.sx>=1&&p.sx<=1.4);}
});
const sample=(motion,u,direction=1,height=440)=>pose({type:'wisp',motion,age:u*3,life:3,direction,lane:.5,anchor:.4,seed:.9},400,height);
test('rise moves up, then holds still before fading in place',()=>{
 const entrance=sample('rise',.1),held=sample('rise',.35),later=sample('rise',.75),fade=sample('rise',.98);
 assert.ok(entrance.y>held.y);assert.equal(entrance.x,held.x);assert.equal(held.y,later.y);assert.equal(held.y,fade.y);assert.equal(later.alpha,1);assert.ok(fade.alpha<.3);
 const h=playing(),g=target(h,'wisp');Object.assign(g,{motion:'rise',life:3,age:2.98});assert.equal(h.shoot(g.id),null);assert.equal(h.shots,0);
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
