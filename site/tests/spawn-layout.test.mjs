import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,pose,TYPES} from '../hunt-core.mjs';
import {pickShotgunGhosts,SHOTGUN} from '../ghost-aim.mjs';

function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function playing(options={}){
  const hunt=new Hunt({random:rng(),...options});hunt.start();
  hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);return hunt;
}
const distance=(a,b)=>Math.hypot(a.anchor-b.anchor,a.lane-b.lane);

test('returning ghosts stop at their own area and retreat through the nearby edge',()=>{
  for(const [motion,type,axis,size] of [['returnX','grasp','x',400],['returnY','stilt','y',440]]){
    const stops=[];
    for(const position of [.2,.8]){
      const ghost={type,motion,life:2,age:0,direction:position<.5?1:-1,anchor:position,lane:position};
      const entrance=pose({...ghost,age:.1},400,440),held=pose({...ghost,age:1},400,440),exit=pose({...ghost,age:1.9},400,440);
      assert.equal(held[axis],position*size);
      if(position<.5){assert.ok(entrance[axis]<held[axis]);assert.ok(exit[axis]<held[axis]);}
      else{assert.ok(entrance[axis]>held[axis]);assert.ok(exit[axis]>held[axis]);}
      stops.push(held[axis]);
    }
    assert.ok(stops[1]-stops[0]>size*.5);
  }
  const hunt=new Hunt({random:rng(63)});hunt.start();let checked=0;
  for(let i=0;i<90;i++){
    hunt.ghosts=[];const g=hunt.spawn(i%2?'grasp':'stilt');
    if(!['returnX','returnY'].includes(g.motion))continue;
    const axis=g.motion==='returnX'?'x':'y',anchor=axis==='x'?g.anchor:g.lane,size=axis==='x'?400:440;
    if(anchor>.3&&anchor<.7)continue;
    for(const u of [.1,.3,.5,.75]){
      const p=pose({...g,age:g.life*u},400,440);
      assert.ok(anchor<.3?p[axis]<size/2:p[axis]>size/2,'outer return paths never cross the center');
    }
    checked++;
  }
  assert.ok(checked>20);
});

test('natural spawn groups stay close, then move far enough to require a new aim',()=>{
  for(const spawnMultiplier of [1,2]){
    const hunt=new Hunt({random:rng(73),spawnMultiplier});hunt.start();
    const groupSize=3*spawnMultiplier,areas=new Set();let previous=null;
    for(let group=0;group<36;group++){
      const ghosts=[];
      for(let i=0;i<groupSize;i++){
        hunt.ghosts=[];ghosts.push(hunt.spawn('pudge'));
      }
      const mean={anchor:ghosts.reduce((sum,g)=>sum+g.anchor,0)/groupSize,lane:ghosts.reduce((sum,g)=>sum+g.lane,0)/groupSize};
      assert.ok(ghosts.every(g=>distance(g,mean)<.11),'one group remains within a comfortable spread');
      if(previous)assert.ok(distance(mean,previous)>.35,'the next group moves away');
      areas.add(`${Math.floor(mean.anchor*3)},${Math.floor(mean.lane*3)}`);previous=mean;
    }
    assert.ok(areas.size>=8,'groups use the arena instead of a fixed center corridor');
  }
});

test('wave openings keep their group and change area across successive waves',()=>{
  const hunt=playing({random:rng(91)}),openings=[];
  for(let wave=0;wave<12;wave++){
    const ghosts=hunt.ghosts.filter(g=>g.type!=='gold'),first=ghosts[0];
    assert.ok(ghosts.every(g=>distance(first,g)<.11));
    if(openings.length)assert.ok(distance(first,openings.at(-1))>.35);
    openings.push(first);hunt.prepareWave();hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);
  }
  assert.ok(openings.some(g=>g.anchor<.25));assert.ok(openings.some(g=>g.anchor>.75));
  assert.ok(openings.some(g=>g.lane<.25));assert.ok(openings.some(g=>g.lane>.75));
});

test('a shotgun still clears a corner group while a center shot misses it',()=>{
  for(const spawnMultiplier of [1,2]){
    const hunt=new Hunt({random:()=>0,weapon:'shotgun',spawnMultiplier});hunt.start();
    const ghosts=Array.from({length:3*spawnMultiplier},()=>hunt.spawn('pudge'));
    const candidates=ghosts.map(g=>{
      const p=pose({...g,age:g.life*.42},400,440),w=TYPES[g.type].width*p.sx,h=TYPES[g.type].height*p.sy;
      return {id:g.id,type:g.type,facing:p.facing,rect:{left:p.x-w/2,right:p.x+w/2,top:p.y-h/2,bottom:p.y+h/2,width:w,height:h},clip:{left:0,top:0,right:400,bottom:440}};
    });
    const p=pose({...ghosts[0],age:ghosts[0].life*.42},400,440),masks=new Map();
    assert.equal(pickShotgunGhosts(candidates,p.x,p.y,SHOTGUN.radius,masks).length,ghosts.length);
    assert.equal(pickShotgunGhosts(candidates,200,220,SHOTGUN.radius,masks).length,0);
  }
});
