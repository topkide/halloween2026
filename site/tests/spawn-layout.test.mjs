import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING,pose,TYPES} from '../hunt-core.mjs';
import {pickShotgunGhosts,SHOTGUN} from '../ghost-aim.mjs';

function rng(seed=19){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function samples(type,count=300,spawnMultiplier=1){
  const hunt=new Hunt({random:rng(),spawnMultiplier});hunt.start();
  return Array.from({length:count},()=>{hunt.ghosts=[];return hunt.spawn(type);});
}
const distance=(a,b)=>Math.hypot((a.x-b.x)/400,(a.y-b.y)/440);

test('ordinary ghosts use continuous independent positions instead of fixed slots or consecutive groups',()=>{
  for(const multiplier of [1,2]){
    const points=samples('pudge',300,multiplier).map(g=>pose({...g,age:g.life*.5},400,440));
    const nearSlots=points.filter(p=>[.16,.5,.84].some(x=>[.16,.5,.84].some(y=>Math.hypot(p.x/400-x,p.y/440-y)<.06))).length;
    const nearPrevious=points.slice(1).filter((p,i)=>distance(p,points[i])<.1).length;
    assert.ok(nearSlots<points.length*.4,'positions must not fall back onto nine known slots');
    assert.ok(nearPrevious<points.length*.2,'successive ghosts must not be assigned to a shared location');
    assert.ok(points.some(p=>p.x<120)&&points.some(p=>p.x>280));
    assert.ok(points.some(p=>p.y<130)&&points.some(p=>p.y>310));
  }
  const positions=multiplier=>samples('wisp',40,multiplier).map(g=>pose({...g,age:g.life*.5},400,440));
  assert.deepEqual(positions(1),positions(2),'X2 changes quantity, not coordination between targets');
});

test('crossing ghosts move only horizontally or vertically from entry through exit',()=>{
  for(const [type,motion,axis,cross] of [['skitter','horizontal','x','y'],['stilt','vertical','y','x']]){
    const directions=new Set();
    for(const g of samples(type)){
      if(g.motion!==motion)continue;
      directions.add(g.direction);
      for(const height of [180,440,800]){
        const points=[0,.1,.3,.5,.7,.9,1].map(u=>pose({...g,age:g.life*u},400,height));
        assert.ok((points.at(-1)[axis]-points[0][axis])*g.direction>0);
        const half=(cross==='x'?TYPES[type].width:TYPES[type].height)/2,limit=cross==='x'?400:height;
        for(const p of points){
          assert.equal(p[cross],points[0][cross],'perpendicular coordinate stays fixed throughout the path');
          assert.ok(p[cross]-half>=0&&p[cross]+half<=limit);
        }
      }
    }
    assert.equal(directions.size,2);
  }
});

test('returning ghosts pause at individual points and retrace an axis-aligned path from either edge',()=>{
  for(const [type,motion,axis,cross] of [['grasp','returnX','x','y'],['stilt','returnY','y','x']]){
    const ghosts=samples(type).filter(g=>g.motion===motion),seen=new Set();
    for(const g of ghosts)for(const height of [180,440,800]){
      const at=u=>pose({...g,age:g.life*u},400,height);
      const start=at(0),incoming=at(.15),stop=at(.4),outgoing=at(.81),end=at(1);
      assert.equal(start.x,end.x);assert.equal(start.y,end.y);
      assert.ok(Math.abs(incoming.x-outgoing.x)<1e-8&&Math.abs(incoming.y-outgoing.y)<1e-8);
      assert.ok((stop[axis]-start[axis])*g.direction>0);
      for(const u of [0,.1,.15,.3,.4,.5,.62,.7,.81,.9,1]){
        assert.equal(at(u)[cross],start[cross],'entry, hold and return keep the perpendicular coordinate fixed');
      }
      assert.equal(at(.3)[axis],stop[axis]);assert.equal(at(.5)[axis],stop[axis]);
      seen.add(`${g.direction}:${stop[axis]<(axis==='x'?200:height/2)?'low':'high'}`);
    }
    assert.equal(seen.size,4,'entry edge is independent of the destination');
  }
});

test('wave openings and continued runs retain independent positions and upright visible resting targets',()=>{
  const hunt=new Hunt({random:rng(91)});hunt.start();
  const openings=[];
  for(let wave=0;wave<20;wave++){
    hunt.tick(BOUNTY_TIMING.spin);hunt.tick(BOUNTY_TIMING.hold);
    const ghosts=hunt.ghosts.filter(g=>g.type!=='gold');
    openings.push(ghosts.map(g=>pose({...g,age:g.life*.5},400,440)));
    if(wave===0){hunt.tick(hunt.remaining);assert.equal(hunt.continueRun(),true);}
    else hunt.prepareWave();
  }
  assert.ok(openings.filter(points=>distance(points[0],points[1])>.2).length>10);
  for(const type of ['wisp','pudge','grasp','stilt'])for(const g of samples(type,50))for(const height of [180,440,800]){
    if(g.motion==='vertical')continue;
    const p=pose({...g,age:g.life*.45},400,height),halfX=TYPES[type].width*p.sx/2,halfY=TYPES[type].height*p.sy/2;
    assert.equal(p.angle,0);
    assert.ok(p.x-halfX>=0&&p.x+halfX<=400&&p.y-halfY>=0&&p.y+halfY<=height);
  }
});

test('independent ghosts still support multi-target shotgun hits when their paths overlap',()=>{
  const ghosts=samples('pudge'),masks=new Map();let opportunities=0;
  for(let i=0;i<ghosts.length-7;i+=8){
    const candidates=ghosts.slice(i,i+8).map(g=>{
      const p=pose({...g,age:g.life*.45},400,440),w=TYPES[g.type].width*p.sx,h=TYPES[g.type].height*p.sy;
      return {id:g.id,type:g.type,facing:p.facing,x:p.x,y:p.y,rect:{left:p.x-w/2,right:p.x+w/2,top:p.y-h/2,bottom:p.y+h/2,width:w,height:h},clip:{left:0,top:0,right:400,bottom:440}};
    });
    if(candidates.some(p=>pickShotgunGhosts(candidates,p.x,p.y,SHOTGUN.radius,masks).length>=2))opportunities++;
  }
  assert.ok(opportunities>20);
});
