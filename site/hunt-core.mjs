export const SPECIES = [
  {id:'wisp',name:'길쭉이',color:'#ad9de4',points:120,width:64,height:102,habit:'몸을 늘이며 지그재그'},
  {id:'pudge',name:'뚱보',color:'#bad18b',points:100,width:95,height:92,habit:'배를 출렁이며 통통'},
  {id:'skitter',name:'납작이',color:'#f18f75',points:140,width:98,height:63,habit:'숨었다가 쌩! 미끄러짐'},
  {id:'stilt',name:'성큼이',color:'#86bfc8',points:130,width:70,height:110,habit:'긴 다리로 성큼성큼'},
  {id:'grasp',name:'주렁이',color:'#d69fcb',points:110,width:103,height:96,habit:'팔을 휘두르며 방향 전환'},
];
export const SPECIALS = {
  gold:{id:'gold',name:'황금 유령',color:'#f5cc68',points:1200,width:83,height:91},
  clock:{id:'clock',name:'시간 유령',color:'#8ae4ce',points:100,width:77,height:94},
  bomb:{id:'bomb',name:'폭탄',color:'#ff736d',points:0,width:76,height:84},
  ink:{id:'ink',name:'먹물 유령',color:'#9390b6',points:0,width:88,height:83},
};
export const TYPES=Object.fromEntries([...SPECIES,...Object.values(SPECIALS)].map(s=>[s.id,s]));
export const DEFAULTS=Object.freeze({duration:45,reload:1.35,spawn:.8,bountyPeriod:8,capacity:5,maxGhosts:7});
export function settings(value={}) {
  if(!value||typeof value!=='object')value={};
  const bound=(key,min,max)=>Number.isFinite(value[key])?Math.max(min,Math.min(max,value[key])):DEFAULTS[key];
  return {...DEFAULTS,duration:bound('duration',15,120),reload:bound('reload',.4,4),spawn:bound('spawn',.35,2)};
}
export function rollMultiplier(random=Math.random) {
  const n=random();return n<.38?2:n<.68?3:n<.88?5:n<.97?8:10;
}
export function rewardFor(type,bounty) {
  const base=TYPES[type]?.points??0;
  return {base,bonus:type===bounty.type?200*bounty.multiplier:0};
}
export function pose(ghost,width,height) {
  const u=ghost.age/ghost.life,t=ghost.age,p=ghost.seed,dir=ghost.direction;
  const turn=ghost.type==='grasp'&&u>.5 ? .5-(u-.5)*.82 : u;
  let x=dir===1?-55+(width+110)*turn:width+55-(width+110)*turn;
  let y=ghost.lane*height,angle=0,sx=1,sy=1,alpha=Math.min(1,t*5,(ghost.life-t)*4);
  if(ghost.type==='wisp'){y+=Math.sin(t*2.7+p)*36;angle=Math.sin(t*2.7+p)*12;sy=1+Math.sin(t*4)*.09;}
  if(ghost.type==='pudge'){y-=Math.abs(Math.sin(t*3.4+p))*36; sx=1+Math.cos(t*6.8)*.06;sy=1-Math.cos(t*6.8)*.07;angle=Math.sin(t*2)*7;}
  if(ghost.type==='skitter'){y+=Math.sin(t*5+p)*13;angle=Math.sin(t*4)*8;const blink=(t+p)%2.8;if(blink>1.8&&blink<2.3)alpha*=.13;}
  if(ghost.type==='stilt'){y+=(u-.5)*height*.25+Math.sin(t*9)*6;angle=Math.sin(t*4.5)*7;}
  if(ghost.type==='grasp'){y+=Math.sin(t*2+p)*28;angle=Math.sin(t*3)*14;}
  if(ghost.type==='gold'){y+=Math.sin(t*4+p)*30;angle=Math.sin(t*3)*12;}
  if(ghost.type==='clock'){y+=Math.cos(t*2+p)*25;sx=sy=1+Math.sin(t*2.5)*.1;}
  if(ghost.type==='bomb'){y+=Math.sin(t*2+p)*18;angle=Math.sin(t*2)*12;}
  if(ghost.type==='ink'){y+=Math.sin(t*3+p)*28;sx=sy=1+Math.sin(t*4)*.07;}
  y=Math.max(58,Math.min(height-54,y));
  return {x,y,angle,sx,sy,alpha:Math.max(0,alpha),facing:dir*(ghost.type==='grasp'&&u>.5?-1:1)};
}
export class Hunt {
  constructor({random=Math.random,config={}}={}) {this.random=random;this.config=settings(config);this.state='ready';this.ghosts=[];this.events=[];this.serial=0;}
  start() {
    Object.assign(this,{state:'playing',remaining:this.config.duration,elapsed:0,score:0,ammo:5,reloadLeft:0,kills:0,shots:0,hits:0,bounties:0,gold:0,extraTime:0,inkLeft:0,spawnLeft:.55,reason:null,ghosts:[],events:[],used:{time:false,ammo:false}});
    this.changeBounty();
    for(let i=0;i<4;i++){const g=this.spawn(SPECIES[(SPECIES.findIndex(s=>s.id===this.bounty.type)+i)%5].id);g.age=g.life*(.18+i*.17);g.lane=.18+i*.2;}
  }
  changeBounty() {
    const previous=this.bounty?.type,choices=SPECIES.filter(s=>s.id!==previous);
    this.bounty={type:choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))].id,multiplier:rollMultiplier(this.random)};
    this.bountyLeft=this.config.bountyPeriod;this.events.push({kind:'bounty',...this.bounty});
  }
  spawn(forced) {
    const n=this.random();
    const type=forced??(n<.085?'gold':n<.17?'clock':n<.29?'bomb':n<.36?'ink':SPECIES[Math.floor(this.random()*5)].id);
    const ghost={id:++this.serial,type,age:0,life:5.5+this.random()*3,direction:this.random()<.5?1:-1,lane:.18+this.random()*.62,seed:this.random()*6.28};
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
    if(this.spawnLeft<=0){if(this.ghosts.length<this.config.maxGhosts)this.spawn();this.spawnLeft=this.config.spawn*(.7+this.random()*.6);}
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
  boost(kind){if(this.state!=='playing'||!['time','ammo'].includes(kind)||this.used[kind])return false;this.used[kind]=true;if(kind==='time'){this.remaining+=10;this.extraTime+=10;}else{this.reloadLeft=0;this.ammo=5;}return true;}
  end(reason){if(this.state!=='playing')return;this.state='ended';this.reason=reason;this.events.push({kind:'end',reason});}
  drain(){return this.events.splice(0);}
}
