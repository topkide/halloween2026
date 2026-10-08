export const SPECIES = [
  {id:'wisp',name:'길쭉이',color:'#ad9de4',points:120,width:64,height:102,habit:'위로 나타나 멈춘 뒤 사라짐'},
  {id:'pudge',name:'뚱보',color:'#bad18b',points:100,width:95,height:92,habit:'제자리에서 커졌다가 작아짐'},
  {id:'skitter',name:'납작이',color:'#f18f75',points:140,width:98,height:63,habit:'좌우로 곧게 이동'},
  {id:'stilt',name:'성큼이',color:'#86bfc8',points:130,width:70,height:110,habit:'위아래로 이동하거나 멈춘 뒤 돌아감'},
  {id:'grasp',name:'주렁이',color:'#d69fcb',points:110,width:103,height:96,habit:'옆에서 와서 멈춘 뒤 같은 길로 돌아감'},
];
export const SPECIALS = {
  gold:{id:'gold',name:'황금 유령',color:'#f5cc68',points:1200,width:83,height:91},
  clock:{id:'clock',name:'시간 유령',color:'#8ae4ce',points:100,width:77,height:94},
  ammo:{id:'ammo',name:'탄약 유령',color:'#8db9e8',points:0,width:83,height:94},
  bomb:{id:'bomb',name:'폭탄',color:'#ff736d',points:0,width:76,height:84},
  ink:{id:'ink',name:'먹물 유령',color:'#9390b6',points:0,width:88,height:83},
};
export const TYPES=Object.fromEntries([...SPECIES,...Object.values(SPECIALS)].map(s=>[s.id,s]));
export const DEFAULTS=Object.freeze({duration:60,reload:2.2,spawn:.5,bountyPeriod:8,capacity:5,ammoLimit:30,maxGhosts:8,motionSpeed:1.15});
export function settings(value={}) {
  if(!value||typeof value!=='object')value={};
  const bound=(key,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,value[key])):DEFAULTS[key];
  return {...DEFAULTS,duration:bound('duration',15,120),reload:bound('reload',.4,4),spawn:bound('spawn',.15,2)};
}
export function rollMultiplier(random=Math.random) {
  const n=random();return n<.38?2:n<.68?3:n<.88?5:n<.97?8:10;
}
export function rewardFor(type,bounty) {
  const base=TYPES[type]?.points??0;
  return {base,bonus:type===bounty.type?200*bounty.multiplier:0};
}
export const MOTIONS={
  rise:[2.4,2.8],horizontal:[2.8,3.3],vertical:[2.8,3.3],
  inflate:[2.5,2.9],returnX:[3,3.4],returnY:[3,3.4],
};
const patterns={wisp:['rise'],pudge:['inflate'],skitter:['horizontal'],stilt:['vertical','returnY'],grasp:['returnX'],gold:['horizontal','vertical'],clock:['rise','inflate'],ammo:['rise','horizontal'],bomb:['horizontal','rise'],ink:['rise','returnY']};
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function restoreSettings(value,revision=1){
  const next=settings(value);
  // Move old default rates to this balance without resetting custom settings or records.
  if((revision<2&&next.spawn===.8)||(revision<3&&next.spawn===.3)||(revision<4&&next.spawn===.85))next.spawn=DEFAULTS.spawn;
  if(revision<4&&next.duration===45)next.duration=DEFAULTS.duration;
  if(revision<4&&next.reload===1.35)next.reload=DEFAULTS.reload;
  return next;
}
export function pose(ghost,width,height) {
  const u=clamp(ghost.age/ghost.life),t=ghost.age,dir=ghost.direction;
  const motion=ghost.motion??patterns[ghost.type][0];
  const anchorX=clamp((ghost.anchor??.5)*width,75,width-75),anchorY=clamp(ghost.lane*height,75,height-75);
  let x=anchorX,y=anchorY,sx=1,sy=1,alpha=1;
  const startX=dir===1?-70:width+70,endX=dir===1?width+70:-70;
  const startY=dir===1?-80:height+80,endY=dir===1?height+80:-80;
  if(motion==='rise'){
    // A short upward entrance, a stable aiming window, then a fade in place.
    y=anchorY+Math.min(60,height*.15)*(1-smooth(u/.24));
    alpha=Math.min(clamp(u/.1),clamp((1-u)/.16));
  } else if(motion==='horizontal'){
    x=mix(startX,endX,u);
  } else if(motion==='vertical'){
    y=mix(startY,endY,u);
  } else if(motion==='inflate'){
    // Exactly one swell and shrink, with no shake, rotation or repeated pulsing.
    const scale=u<.25?1:u<.37?mix(1,1.4,smooth((u-.25)/.12)):u<.53?1.4:u<.72?mix(1.4,1,smooth((u-.53)/.19)):1;
    sx=sy=scale;alpha=Math.min(clamp(u/.08),clamp((1-u)/.14));
  } else if(motion==='returnX'||motion==='returnY'){
    // Travel to the middle, wait for about a second, and retrace the same axis.
    const progress=u<.3?smooth(u/.3):u<.62?1:1-smooth((u-.62)/.38);
    if(motion==='returnX')x=mix(startX,mix(width*.42,width*.58,ghost.anchor??.5),progress);
    else y=mix(startY,mix(height*.42,height*.58,ghost.lane),progress);
  }
  if(t<0||t>=ghost.life)alpha=0;
  return {x,y,angle:0,sx,sy,alpha:clamp(alpha),facing:dir};
}
export class Hunt {
  constructor({random=Math.random,config={}}={}) {this.random=random;this.config=settings(config);this.state='ready';this.ghosts=[];this.events=[];this.serial=0;}
  start() {
    Object.assign(this,{state:'playing',remaining:this.config.duration,elapsed:0,score:0,ammo:this.config.capacity,reserveAmmo:this.config.ammoLimit-this.config.capacity,reloadLeft:0,kills:0,shots:0,hits:0,bounties:0,gold:0,extraTime:0,inkLeft:0,spawnLeft:this.config.spawn,reason:null,ghosts:[],events:[]});
    this.changeBounty();
    for(let i=0;i<4;i++){const g=this.spawn(SPECIES[(SPECIES.findIndex(s=>s.id===this.bounty.type)+i)%5].id);g.age=g.life*(.26+i*.055);g.lane=.2+i*.2;g.anchor=.3+(i%2)*.4;}
  }
  changeBounty() {
    const previous=this.bounty?.type,choices=SPECIES.filter(s=>s.id!==previous);
    this.bounty={type:choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))].id,multiplier:rollMultiplier(this.random)};
    this.bountyLeft=this.config.bountyPeriod;this.events.push({kind:'bounty',...this.bounty});
  }
  spawn(forced) {
    const n=this.random();
    const type=forced??(n<.085?'gold':n<.17?'clock':n<.29?'bomb':n<.36?'ink':n<.48?'ammo':SPECIES[Math.floor(this.random()*5)].id);
    const options=patterns[type],motion=options[Math.floor(this.random()*options.length)],[min,max]=MOTIONS[motion];
    const ghost={id:++this.serial,type,motion,age:0,life:mix(min,max,this.random())/this.config.motionSpeed,direction:this.random()<.5?1:-1,lane:.2+this.random()*.6,anchor:.22+this.random()*.56,seed:this.random()*6.28};
    this.ghosts.push(ghost);return ghost;
  }
  tick(dt) {
    if(this.state!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,this.remaining);this.remaining-=dt;this.elapsed+=dt;
    if(this.remaining<=.000001){this.remaining=0;this.end('timeout');return;}
    if(this.reloadLeft>0){this.reloadLeft=Math.max(0,this.reloadLeft-dt);if(this.reloadLeft===0){this.ammo=Math.min(this.config.capacity,this.reserveAmmo);this.reserveAmmo-=this.ammo;this.events.push({kind:'loaded'});}}
    this.inkLeft=Math.max(0,this.inkLeft-dt);
    this.ghosts.forEach(g=>g.age+=dt);this.ghosts=this.ghosts.filter(g=>g.age<g.life);
    this.spawnLeft-=dt;
    if(this.spawnLeft<=.000001){
      if(this.ghosts.length<this.config.maxGhosts)this.spawn();
      this.spawnLeft=this.config.spawn;
    }
    this.bountyLeft-=dt;if(this.bountyLeft<=0)this.changeBounty();
  }
  shoot(id=null) {
    if(this.state!=='playing')return null;
    if(this.reloadLeft>0)return {kind:'loading'};
    if(this.ammo<=0)return null;
    const ghost=id===null?null:this.ghosts.find(g=>g.id===id);
    if(id!==null&&!ghost)return null;
    if(ghost&&pose(ghost,400,440).alpha<.3)return null;
    this.ammo--;this.shots++;
    const hit={kind:ghost?.type??'miss',ghost,points:0,bonus:0};
    if(ghost){
      this.ghosts=this.ghosts.filter(g=>g!==ghost);
      if(ghost.type==='bomb'){this.end('bomb');return hit;}
      if(ghost.type==='ink'){this.inkLeft=2.3;}
      else {
        this.hits++;this.kills++;
        const reward=rewardFor(ghost.type,this.bounty);hit.points=reward.base+reward.bonus;hit.bonus=reward.bonus;
        this.score+=hit.points;if(reward.bonus)this.bounties++;
        if(ghost.type==='gold')this.gold++;
        if(ghost.type==='clock'){this.remaining+=5;this.extraTime+=5;}
        if(ghost.type==='ammo'){
          hit.ammoAdded=Math.min(2,this.config.ammoLimit-this.ammo-this.reserveAmmo);
          this.reserveAmmo+=hit.ammoAdded;
        }
      }
    }
    if(this.ammo===0){if(this.reserveAmmo>0)this.reload();else this.end('ammo');}
    return hit;
  }
  reload() {if(this.state!=='playing'||this.reloadLeft>0||this.ammo!==0||this.reserveAmmo<=0)return false;this.reloadLeft=this.config.reload;this.events.push({kind:'reload'});return true;}
  pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
  resume(){if(this.state==='paused')this.state='playing';}
  end(reason){if(this.state!=='playing')return;this.state='ended';this.reason=reason;this.events.push({kind:'end',reason});}
  drain(){return this.events.splice(0);}
}
