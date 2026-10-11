import test from 'node:test';
import assert from 'node:assert/strict';
import {ShotEffects,SHOT_LIMITS} from '../shot-effects.mjs';

function context(){
  const text=[],geometry=[];
  const check=(...args)=>{for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg),'non-finite canvas coordinate');geometry.push(args);};
  return new Proxy({text,geometry,measureText:value=>({width:value.length*13}),createRadialGradient:(...args)=>{check(...args);return {addColorStop:()=>{}};},fillText:(value,...args)=>{check(...args);text.push(value);},strokeText:check},{get:(target,key)=>key in target?target[key]:check});
}
const canvas=()=>{const ctx=context();return {width:400,height:440,ctx,getContext:()=>ctx};};
globalThis.window={devicePixelRatio:3};
globalThis.Image=class{complete=true;naturalWidth=1536;};
globalThis.document={createElement:()=>canvas()};
function effects(still=false){const c=canvas(),effects=new ShotEffects(c,{reducedMotion:()=>still});effects.resize(400,440);return {effects,ctx:c.ctx};}
const box=(x=100,y=150)=>({x,y,width:75,height:90,facing:1});
const hit=(kind='pudge',coins=1)=>({kind,upgradeCoins:kind==='gold'?0:coins,bonusCoins:kind==='gold'?coins:0,penalty:0});

test('payout text is numeric only at the captured target, including a gold bonus and no empty-shot text',()=>{
  const {effects:e,ctx}=effects();e.shoot(hit(),8,8,box(),0);e.shoot(hit('gold',50),390,390,box(230,210),1);
  assert.deepEqual(e.labels.map(l=>[l.text,l.x,l.y]),[['+1',100,150],['+50',230,210]]);
  e.shoot({...hit(),kind:'miss',penalty:2},320,100,null,2);
  assert.equal(e.labels.length,2);assert.ok(ctx.text.every(value=>/^\+\d[\d,]*$/.test(value)));
});
test('custom payouts retain their fractional amount and sign while zero and non-finite amounts have no label',()=>{
  for(const [amount,text] of [[12.5,'+12.5'],[-1.25,'-1.25'],[1234.56789,'+1,234.56789'],[.00001,'+0.00001'],[1e-21,'+0.000000000000000000001'],[0,null],[-0,null],[NaN,null],[Infinity,null],[-Infinity,null]]){
    const {effects:e,ctx}=effects();e.shoot(hit('wisp',amount),8,8,box(120,180),0);
    assert.equal(e.bursts.length,1);
    assert.deepEqual(e.labels.map(l=>[l.text,l.x,l.y]),text===null?[]:[[text,120,180]]);
    assert.deepEqual(ctx.text,text===null?[]:[text]);
  }
});

test('a 16-target shotgun blast gives every captured ghost its own payout without aggregate hit wording',()=>{
  const {effects:e,ctx}=effects(),targets=Array.from({length:16},(_,id)=>({...hit('pudge',id%5+1),ghost:{id}}));
  const boxes=new Map(targets.map((t,i)=>[t.ghost.id,box(30+i%4*100,80+Math.floor(i/4)*90)]));
  e.shotgun({targets,hitCount:16,kind:'pudge'},150,180,72,boxes,0);
  assert.equal(e.bursts.length,16);assert.equal(e.labels.length,16);
  assert.deepEqual(e.labels.map(l=>l.text),targets.map(t=>'+'+t.upgradeCoins));
  assert.equal(ctx.text.length,16);assert.ok(ctx.text.every(value=>/^\+\d$/.test(value)));
});
test('a shotgun preserves each target payout and location even when signed fractional amounts cancel',()=>{
  const {effects:e,ctx}=effects(),targets=[hit('wisp',12.5),hit('grasp',-12.5),hit('pudge',0),hit('stilt',.125)].map((t,id)=>({...t,ghost:{id}}));
  const boxes=new Map(targets.map((t,i)=>[t.ghost.id,box(50+i*90,100+i*70)]));
  e.shotgun({targets,hitCount:4,kind:'wisp',upgradeCoins:.125},180,180,72,boxes,0);
  assert.equal(e.bursts.length,4);
  assert.deepEqual(e.labels.map(l=>[l.text,l.x,l.y]),[['+12.5',50,100],['-12.5',140,170],['+0.125',320,310]]);
  assert.deepEqual(ctx.text,['+12.5','-12.5','+0.125']);
});

test('loaded sprite breakup and fast continuous effects stay finite, bounded and clear after their lifetime',()=>{
  const {effects:e}=effects();
  for(let i=0;i<80;i++)e.shoot(hit(i%2?'gold':'pudge',5),100,120,box(200,180),0,{renderNow:false});
  assert.equal(e.bursts.length,SHOT_LIMITS.bursts);assert.equal(e.labels.length,SHOT_LIMITS.labels);
  assert.ok(e.bursts.every(b=>b.particles.length<=SHOT_LIMITS.particles));
  for(const ms of [0,25,55,90,180,250,550,740,800])e.render(ms);
  assert.equal(e.bursts.length,0);assert.equal(e.labels.length,0);assert.equal(e.dirty,false);
  e.shoot(hit(),20,30,box(),900);e.clear();assert.equal(e.labels.length,0);assert.equal(e.bursts.length,0);
});

test('reduced motion leaves stationary numeric payouts without shards or particle travel',()=>{
  const {effects:e}=effects(true);e.shoot(hit(),10,10,box(),0);
  assert.equal(e.bursts[0].particles.length,0);assert.equal(e.bursts[0].shards.length,0);assert.equal(e.labels[0].still,true);
  for(const ms of [0,40,120,600,800])e.render(ms);
  assert.equal(e.labels.length,0);
});

test('disabled effects clear existing numbers and cannot enqueue or redraw delayed shot feedback',()=>{
  let enabled=true;const c=canvas(),e=new ShotEffects(c,{enabled:()=>enabled});e.resize(400,440);
  e.shoot(hit(),100,150,box(),0);assert.equal(e.labels.length,1);
  const drawn=c.ctx.text.length;enabled=false;e.render(1);
  assert.equal(e.labels.length,0);assert.equal(e.bursts.length,0);assert.equal(e.dirty,false);
  e.shoot(hit(),100,150,box(),2);
  e.shotgun({kind:'pudge',targets:[{...hit(),ghost:{id:1}}],hitCount:1},100,150,72,new Map([[1,box()]]),3);
  e.render(4);assert.equal(c.ctx.text.length,drawn);assert.equal(e.labels.length,0);assert.equal(e.spreads.length,0);
  enabled=true;e.shoot(hit(),100,150,box(),5);assert.equal(e.labels.length,1);
});
