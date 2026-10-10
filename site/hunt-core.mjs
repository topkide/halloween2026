export const SPECIES = [
  {id:'wisp',name:'길쭉이',color:'#ad9de4',points:200,width:64,height:102,habit:'위로 나타나 멈춘 뒤 사라짐'},
  {id:'pudge',name:'뚱보',color:'#bad18b',points:100,width:104,height:100,habit:'크게 나타나 제자리에서 커졌다가 작아짐'},
  {id:'skitter',name:'납작이',color:'#f18f75',points:300,width:76,height:49,habit:'작은 몸으로 좌우로 곧게 이동'},
  {id:'stilt',name:'성큼이',color:'#86bfc8',points:250,width:70,height:110,habit:'위아래로 이동하거나 멈춘 뒤 돌아감'},
  {id:'grasp',name:'주렁이',color:'#d69fcb',points:150,width:103,height:96,habit:'옆에서 와서 멈춘 뒤 같은 길로 돌아감'},
];
export const SPECIALS={
  gold:{id:'gold',name:'황금 유령',color:'#f5cc68',points:500,width:83,height:91},
};
export const TYPES=Object.fromEntries([...SPECIES,...Object.values(SPECIALS)].map(s=>[s.id,s]));
export const DEFAULTS=Object.freeze({duration:60,spawn:.23,missPenalty:2,baseGoal:8,goalStep:2,maxGoal:24,maxGhosts:8,briefingDuration:2.4,goldBase:SPECIALS.gold.points,goldChance:.15});
export function settings(value={}){
  if(!value||typeof value!=='object')value={};
  const bound=(key,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,value[key])):DEFAULTS[key];
  return {...DEFAULTS,duration:bound('duration',15,120),spawn:bound('spawn',.15,2),missPenalty:bound('missPenalty',.5,5),baseGoal:Math.round(bound('baseGoal',4,20))};
}
export function rollMultiplier(random=Math.random,previous=null){
  const choices=[[2,38],[3,30],[5,20],[8,9],[10,3]].filter(([value])=>value!==previous);
  let draw=random()*choices.reduce((sum,[,weight])=>sum+weight,0);
  for(const [value,weight] of choices){draw-=weight;if(draw<0)return value;}
  return choices.at(-1)[0];
}
export const MOTIONS={rise:[1.4,1.8],horizontal:[1.8,2.3],vertical:[1.8,2.3],inflate:[1.6,2],returnX:[2,2.4],returnY:[2,2.4]};
export const GOLD_LIFETIME=Object.freeze([.7,.9]);
const patterns={wisp:['rise'],pudge:['inflate'],skitter:['horizontal'],stilt:['vertical','returnY'],grasp:['returnX'],gold:['rise']};
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function pose(ghost,width,height) {
  const u=clamp(ghost.age/ghost.life),t=ghost.age,dir=ghost.direction;
  const motion=ghost.motion??patterns[ghost.type][0];
  const anchorX=clamp((ghost.anchor??.5)*width,75,width-75),anchorY=clamp(ghost.lane*height,75,height-75);
  let x=anchorX,y=anchorY,sx=1,sy=1,alpha=1;
  const startX=dir===1?-70:width+70,endX=dir===1?width+70:-70;
  const startY=dir===1?-80:height+80,endY=dir===1?height+80:-80;
  if(motion==='rise'){
    // A short upward entrance, a stable aiming window, then a fade in place.
    const gold=ghost.type==='gold';
    y=anchorY+Math.min(gold?24:60,height*.15)*(1-smooth(u/(gold ? .12 : .24)));
    alpha=Math.min(clamp(u/(gold ? .04 : .1)),clamp((1-u)/(gold ? .1 : .16)));
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
  constructor({random=Math.random,config={}}={}){
    this.random=random;this.config=settings(config);this.state='ready';this.ghosts=[];this.events=[];this.serial=0;
  }
  start(){
    Object.assign(this,{remaining:this.config.duration,elapsed:0,score:0,normalScore:0,goldScore:0,kills:0,shots:0,hits:0,misses:0,gold:0,clearedWaves:0,wave:0,bounty:null,reason:null,endCause:null,pausedFrom:null,ghosts:[],events:[]});
    this.prepareWave();
  }
  prepareWave(){
    this.wave++;this.waveKills=0;this.waveGoal=Math.min(this.config.maxGoal,this.config.baseGoal+(this.wave-1)*this.config.goalStep);
    this.bounty={type:'gold',multiplier:rollMultiplier(this.random,this.bounty?.multiplier)};
    this.bounty.points=this.config.goldBase*this.bounty.multiplier;
    this.state='briefing';this.briefingLeft=this.config.briefingDuration;this.ghosts=[];
    this.events.push({kind:'wave',wave:this.wave,target:this.waveGoal,multiplier:this.bounty.multiplier,points:this.bounty.points});
  }
  beginWave(){
    if(this.state!=='briefing')return;
    this.state='playing';this.briefingLeft=0;this.spawnLeft=this.config.spawn;
    // Every wave offers a golden bounty immediately, then random extras can appear.
    for(let i=0;i<3;i++){
      const type=i===1?'gold':SPECIES[Math.floor(this.random()*SPECIES.length)].id;
      const g=this.spawn(type);
      if(type!=='gold'){g.age=g.life*.18;g.lane=.25+i*.25;g.anchor=.3;}
    }
    this.events.push({kind:'wave-start',wave:this.wave});
  }
  spawn(forced){
    if(this.ghosts.length>=this.config.maxGhosts)return null;
    const n=this.random();
    const type=forced??(n<this.config.goldChance?'gold':SPECIES[Math.floor(this.random()*SPECIES.length)].id);
    const options=patterns[type],motion=options[Math.floor(this.random()*options.length)],[min,max]=type==='gold'?GOLD_LIFETIME:MOTIONS[motion];
    const speed=1+Math.min(.4,(this.wave-1)*.04);
    const ghost={id:++this.serial,type,motion,age:0,life:mix(min,max,this.random())/speed,direction:this.random()<.5?1:-1,lane:.2+this.random()*.6,anchor:.22+this.random()*.56,seed:this.random()*6.28};
    this.ghosts.push(ghost);return ghost;
  }
  tick(dt){
    if(!Number.isFinite(dt)||dt<=0)return;
    if(this.state==='briefing'){
      this.briefingLeft=Math.max(0,this.briefingLeft-dt);if(this.briefingLeft===0)this.beginWave();return;
    }
    if(this.state!=='playing')return;
    dt=Math.min(dt,this.remaining);this.remaining-=dt;this.elapsed+=dt;
    if(this.remaining<=.000001){this.remaining=0;this.end('timeout','clock');return;}
    this.ghosts.forEach(g=>g.age+=dt);this.ghosts=this.ghosts.filter(g=>g.age<g.life);
    this.spawnLeft-=dt;
    // Preserve normal frame overshoot without releasing a burst after a slow frame.
    if(this.spawnLeft<=.000001){this.spawn();this.spawnLeft=this.config.spawn+Math.max(this.spawnLeft,-dt);if(this.spawnLeft<=0)this.spawnLeft=this.config.spawn;}
  }
  shoot(id=null){
    if(this.state!=='playing')return null;
    const ghost=id===null?null:this.ghosts.find(g=>g.id===id);
    // A repeated activation of an already consumed ghost is ignored.
    if(id!==null&&!ghost)return null;
    if(ghost&&pose(ghost,400,440).alpha<.3)return null;
    this.shots++;
    if(!ghost){
      this.misses++;const penalty=Math.min(this.remaining,this.config.missPenalty);this.remaining-=penalty;
      if(this.remaining<=.000001){this.remaining=0;this.end('timeout','miss');}
      return {kind:'miss',ghost:null,points:0,penalty};
    }
    this.ghosts=this.ghosts.filter(g=>g!==ghost);
    this.hits++;this.kills++;this.waveKills++;
    const points=ghost.type==='gold'?this.bounty.points:TYPES[ghost.type].points;
    this.score+=points;
    if(ghost.type==='gold'){this.gold++;this.goldScore+=points;}else this.normalScore+=points;
    const hit={kind:ghost.type,ghost,points,penalty:0};
    if(this.waveKills>=this.waveGoal){
      this.clearedWaves++;this.events.push({kind:'wave-clear',wave:this.wave});this.prepareWave();
    }
    return hit;
  }
  pause(){if(['playing','briefing'].includes(this.state)){this.pausedFrom=this.state;this.state='paused';return true;}return false;}
  resume(){if(this.state==='paused'){this.state=this.pausedFrom;this.pausedFrom=null;}}
  end(reason,cause=null){if(!['playing','briefing'].includes(this.state))return;this.state='ended';this.reason=reason;this.endCause=cause;this.events.push({kind:'end',reason,cause});}
  drain(){return this.events.splice(0);}
}
