export const SPECIES = [
  {id:'wisp',name:'길쭉이',color:'#ad9de4',points:120,width:64,height:102,habit:'깜빡 사라지고 다른 곳에 출현'},
  {id:'pudge',name:'뚱보',color:'#bad18b',points:100,width:95,height:92,habit:'갑자기 부풀었다가 쪼그라듦'},
  {id:'skitter',name:'납작이',color:'#f18f75',points:140,width:98,height:63,habit:'급출현 후 순식간에 소멸'},
  {id:'stilt',name:'성큼이',color:'#86bfc8',points:130,width:70,height:110,habit:'높이 도약하거나 수직 낙하'},
  {id:'grasp',name:'주렁이',color:'#d69fcb',points:110,width:103,height:96,habit:'급정지·역주행·기습 출현'},
];
export const SPECIALS = {
  gold:{id:'gold',name:'황금 유령',color:'#f5cc68',points:1200,width:83,height:91},
  clock:{id:'clock',name:'시간 유령',color:'#8ae4ce',points:100,width:77,height:94},
  bomb:{id:'bomb',name:'폭탄',color:'#ff736d',points:0,width:76,height:84},
  ink:{id:'ink',name:'먹물 유령',color:'#9390b6',points:0,width:88,height:83},
};
export const TYPES=Object.fromEntries([...SPECIES,...Object.values(SPECIALS)].map(s=>[s.id,s]));
export const DEFAULTS=Object.freeze({duration:45,reload:1.35,spawn:.3,bountyPeriod:8,capacity:5,maxGhosts:7});
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
  blink:[1.45,2.05],inflate:[1.25,1.8],ambush:[1.0,1.45],
  dart:[1.1,1.6],leap:[1.3,1.9],dive:[1.25,1.85],swerve:[1.5,2.2],pop:[1.4,2.1],drift:[1.8,2.2],
};
const patterns={wisp:['blink','blink','ambush'],pudge:['inflate','inflate','pop'],skitter:['ambush','dart','blink'],stilt:['leap','dive'],grasp:['swerve','ambush','leap'],gold:['dart','leap'],clock:['inflate','blink'],bomb:['drift','pop'],ink:['ambush','pop']};
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const mix=(a,b,t)=>a+(b-a)*t;
const out=t=>1-(1-clamp(t))**3;
export function restoreSettings(value,revision=1){
  const next=settings(value);
  // Migrate the previous common spawn rate, retaining deliberately custom values.
  if(revision<2&&next.spawn===.8)next.spawn=DEFAULTS.spawn;
  return next;
}
export function pose(ghost,width,height) {
  const u=clamp(ghost.age/ghost.life),t=ghost.age,dir=ghost.direction,p=ghost.seed;
  const motion=ghost.motion??patterns[ghost.type][0];
  const anchorX=(ghost.anchor??.5)*width,anchorY=clamp(ghost.lane*height,65,height-65);
  let x=anchorX,y=anchorY,angle=0,sx=1,sy=1,alpha=1,facing=dir;
  const across=v=>dir===1?mix(-65,width+65,v):mix(width+65,-65,v);
  if(motion==='blink'){
    const section=u<.34?0:u<.68?1:2,local=u-section*.34;
    x=section===1?width-anchorX:anchorX;y=clamp(anchorY+(section===1?-1:1)*height*.18,65,height-65);
    alpha=local<.045||local>.235?0:1;
    sx=mix(.6,1.15,out((local-.045)/.08));sy=mix(1.5,1,out((local-.045)/.08));angle=Math.sin(t*14)*9;
  } else if(motion==='inflate'){
    // An abrupt swell followed by a rapid collapse, with no horizontal conveyor motion.
    const scale=u<.18?mix(.35,.7,u/.18):u<.30?mix(.7,1.9,out((u-.18)/.12)):u<.52?1.9:u<.72?mix(1.9,.22,out((u-.52)/.2)):.22;
    sx=scale*(1+Math.sin(t*22)*.05);sy=scale;alpha=u<.045||u>.78?0:1;angle=Math.sin(t*12)*9;
    x=clamp(x,Math.min(100,width/2),Math.max(100,width-100));y=clamp(y,Math.min(108,height/2),Math.max(height/2,height-108));
  } else if(motion==='ambush'){
    alpha=u<.08||u>.7?0:1;
    const entrance=out((u-.08)/.08),exit=out((u-.57)/.13);
    sx=mix(.35,1.18,entrance)*(1-exit*.75);sy=mix(1.8,1,entrance)*(1-exit*.75);
    x+=Math.sin(t*22+p)*7;y-=exit*45;angle=Math.sin(t*17)*12;
  } else if(motion==='leap'){
    x=across(u);y=height+65-Math.sin(Math.PI*u)*(height*.78+110);angle=(u-.5)*dir*75;sx=1;sy=1+Math.cos(u*Math.PI*2)*.18;
  } else if(motion==='dive'){
    y=mix(-85,height+85,u);x=anchorX+Math.sin(u*Math.PI*2)*width*.22;angle=Math.cos(u*Math.PI*2)*dir*32;sy=1.2;
  } else if(motion==='pop'){
    const up=out(u/.22),down=out((u-.53)/.3);
    y=mix(height+80,anchorY,up)+down*(height+100-anchorY);sx=1+Math.sin(u*Math.PI)*.2;sy=1.25-Math.sin(u*Math.PI)*.4;angle=Math.sin(t*9)*12;
  } else if(motion==='swerve'){
    const progress=u<.3?u/.3*.62:u<.48?.62-(u-.3)/.18*.3:.32+(u-.48)/.52*.8;
    x=across(progress);y+=Math.sin(u*Math.PI*3+p)*height*.16;facing=dir*(u>=.3&&u<.48?-1:1);angle=facing*Math.sin(t*12)*20;
  } else if(motion==='dart'){
    const progress=u<.25?u*1.7:u<.4?.425+(u-.25)*.2:.455+(u-.4)*1.05;
    x=across(progress);y+=Math.sin(u*Math.PI*2+p)*height*.2;angle=dir*Math.cos(u*Math.PI*2)*20;sx=1.12;sy=.86;
  } else {
    x=across(u);y+=Math.sin(t*5+p)*25;angle=Math.sin(t*4)*15;alpha=Math.min(1,t/.18,(ghost.life-t)/.12);
  }
  if(t<0||t>=ghost.life)alpha=0;
  alpha=clamp(alpha);
  return {x,y,angle,sx,sy,alpha,facing};
}
export class Hunt {
  constructor({random=Math.random,config={}}={}) {this.random=random;this.config=settings(config);this.state='ready';this.ghosts=[];this.events=[];this.serial=0;}
  start() {
    Object.assign(this,{state:'playing',remaining:this.config.duration,elapsed:0,score:0,ammo:5,reloadLeft:0,kills:0,shots:0,hits:0,bounties:0,gold:0,extraTime:0,inkLeft:0,spawnLeft:.16,reason:null,ghosts:[],events:[]});
    this.changeBounty();
    for(let i=0;i<4;i++){const g=this.spawn(SPECIES[(SPECIES.findIndex(s=>s.id===this.bounty.type)+i)%5].id);g.age=g.life*(.12+i*.025);g.lane=.2+i*.2;}
  }
  changeBounty() {
    const previous=this.bounty?.type,choices=SPECIES.filter(s=>s.id!==previous);
    this.bounty={type:choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))].id,multiplier:rollMultiplier(this.random)};
    this.bountyLeft=this.config.bountyPeriod;this.events.push({kind:'bounty',...this.bounty});
  }
  spawn(forced) {
    const n=this.random();
    const type=forced??(n<.085?'gold':n<.17?'clock':n<.29?'bomb':n<.36?'ink':SPECIES[Math.floor(this.random()*5)].id);
    const options=patterns[type],motion=options[Math.floor(this.random()*options.length)],[min,max]=MOTIONS[motion];
    const ghost={id:++this.serial,type,motion,age:0,life:mix(min,max,this.random()),direction:this.random()<.5?1:-1,lane:.2+this.random()*.6,anchor:.22+this.random()*.56,seed:this.random()*6.28};
    this.ghosts.push(ghost);return ghost;
  }
  tick(dt) {
    if(this.state!=='playing'||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,this.remaining);this.remaining-=dt;this.elapsed+=dt;
    if(this.remaining<=.000001){this.remaining=0;this.end('timeout');return;}
    if(this.reloadLeft>0){this.reloadLeft=Math.max(0,this.reloadLeft-dt);if(this.reloadLeft===0){this.ammo=5;this.events.push({kind:'loaded'});}}
    this.inkLeft=Math.max(0,this.inkLeft-dt);
    this.ghosts.forEach(g=>g.age+=dt);this.ghosts=this.ghosts.filter(g=>g.age<g.life);
    this.spawnLeft-=dt;
    if(this.spawnLeft<=0){
      const burst=this.random()<.4?2:1;
      for(let i=0;i<burst&&this.ghosts.length<this.config.maxGhosts;i++)this.spawn();
      this.spawnLeft=this.config.spawn*(.65+this.random()*.7);
    }
    this.bountyLeft-=dt;if(this.bountyLeft<=0)this.changeBounty();
  }
  shoot(id=null) {
    if(this.state!=='playing')return null;
    if(this.reloadLeft>0)return {kind:'loading'};
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
      }
    }
    if(this.ammo===0)this.reload();
    return hit;
  }
  reload() {if(this.state!=='playing'||this.reloadLeft>0||this.ammo===5)return false;this.reloadLeft=this.config.reload;this.events.push({kind:'reload'});return true;}
  pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
  resume(){if(this.state==='paused')this.state='playing';}
  end(reason){if(this.state!=='playing')return;this.state='ended';this.reason=reason;this.events.push({kind:'end',reason});}
  drain(){return this.events.splice(0);}
}
