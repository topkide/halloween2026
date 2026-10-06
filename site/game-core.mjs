import {DEFAULT_CONFIG,FIXED_MODE,validateConfig,rowAt} from './balance-config.mjs';
export const DIRECTIONS=[[-1,0],[1,0],[-.7071,-.7071],[.7071,-.7071],[-.7071,.7071],[.7071,.7071]];
export const getGhostLifetime=(elapsed,c=DEFAULT_CONFIG)=>rowAt(c.normalTable,elapsed).life;
export class GhostGame{
  constructor(random=Math.random,config=DEFAULT_CONFIG){this.random=random;this.reset(config);}
  reset(config=this.config){
    this.config=validateConfig(config);this.mode=FIXED_MODE;this.state='idle';this.elapsed=0;this.clock=0;this.peakTime=0;
    this.time=this.config.round.startTime;this.health=this.config.round.health;this.score=0;this.caught=0;this.bosses=0;this.bombsAvoided=0;this.bombHits=0;this.escaped=0;this.escapeTimeLost=0;this.shots=0;this.hits=0;this.streak=0;this.bestStreak=0;
    this.ghosts=[];this.events=[];this.sequence=0;this.nextNormal=.15;this.nextBomb=rowAt(this.config.bombTable,0).interval;this.bossAt=this.config.boss.firstAt;
    this.face={phase:'idle',endsAt:0};this.items={flashlight:0,talisman:0};this.used={flashlight:false,talisman:false};this.flashUntil=0;
    this.talisman={endsAt:0,graceUntil:0};this.continues=0;this.endReason=null;this.collectionResult=null;
  }
  start(config=this.config,stock={}){this.reset(config);for(const k of Object.keys(this.items))this.items[k]=stock[k]>0?1:0;this.state='running';}
  emit(e){this.events.push(e);return e;}
  normalRow(){return rowAt(this.config.normalTable,this.elapsed);}
  bombRow(){return rowAt(this.config.bombTable,this.elapsed);}
  normalInterval(){return this.isTalismanActive()?rowAt(this.config.talismanTable,this.elapsed).interval:this.normalRow().interval;}
  isTalismanActive(){return this.talisman.endsAt>this.clock;}
  isFlashActive(){return this.flashUntil>this.clock;}
  isProtected(){return this.isTalismanActive()||this.clock<this.talisman.graceUntil;}
  pause(){if(this.state==='running')this.state='paused';}
  resume(){if(this.state==='paused')this.state='running';}
  clearFace(){if(this.face.phase!=='idle')this.emit({type:'faceEnd'});this.face={phase:'idle',endsAt:0};}
  end(reason){if(this.state!=='running')return;this.state='ended';this.endReason=reason;this.clearFace();this.emit({type:'end',reason});}
  canContinue(){return this.state==='ended'&&this.continues===0&&this.endReason!=='quit'&&this.collectionResult===null;}
  continueRound(){
    if(!this.canContinue())return false;
    this.continues++;this.elapsed=Math.max(0,this.elapsed-this.config.continue.rewind);this.time=this.config.round.startTime;this.health=this.config.round.health;
    this.ghosts=[];this.flashUntil=0;this.talisman={endsAt:0,graceUntil:0};this.clearFace();this.bossAt=this.clock+this.config.boss.respawn;this.nextBomb=this.clock+this.bombRow().interval;this.state='running';this.endReason=null;this.streak=0;
    this.activateTalisman(true);this.emit({type:'continued'});return true;
  }
  finish(owned=[]){
    if(this.state!=='ended'&&this.state!=='finished')return null;
    if(this.collectionResult!==null)return [...this.collectionResult];
    const have=new Set(owned),won=[];
    for(const row of this.config.collectionTable)if(!have.has(row.id)&&this.peakTime+1e-7>=row.at&&this.random()*100<row.chance)won.push(row.id);
    for(let i=won.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[won[i],won[j]]=[won[j],won[i]];}
    this.collectionResult=won.slice(0,2);this.state='finished';this.flashUntil=0;this.talisman.endsAt=0;return [...this.collectionResult];
  }
  place(previous=null){
    let best={x:.5,y:.5},score=-1;
    for(let i=0;i<35;i++){
      const p={x:.14+this.random()*.72,y:.22+this.random()*.56};
      if(previous&&Math.hypot(p.x-previous.x,p.y-previous.y)<.3)continue;
      const gap=Math.min(1,...this.ghosts.filter(g=>g!==previous).map(g=>Math.hypot(p.x-g.x,(p.y-g.y)*1.3)));
      if(gap>score){best=p;score=gap;}if(gap>.23)break;
    }
    if(score<0&&previous){best=[{x:.14,y:.22},{x:.86,y:.22},{x:.14,y:.78},{x:.86,y:.78}].sort((a,b)=>Math.hypot(b.x-previous.x,b.y-previous.y)-Math.hypot(a.x-previous.x,a.y-previous.y))[0];}
    return best;
  }
  spawn(kind='normal'){
    if(kind==='boss'&&this.ghosts.some(g=>g.kind==='boss'))return null;
    if(kind==='bomb'&&this.isTalismanActive())return null;
    const row=kind==='bomb'?this.bombRow():this.normalRow(),direction=DIRECTIONS[Math.floor(this.random()*DIRECTIONS.length)],speed=this.config.movement[kind]/100;
    const g={id:++this.sequence,kind,...this.place(),age:0,life:kind==='boss'?Infinity:row.life,points:kind==='boss'?this.config.boss.points:this.normalRow().points,penalty:kind==='normal'?row.penalty:0,vx:direction[0]*speed,vy:direction[1]*speed,hp:kind==='boss'?this.config.boss.hp:1};
    if(kind==='boss')g.abilityAt=this.clock+this.config.boss.abilityInterval;
    this.ghosts.push(g);this.emit({type:'spawn',id:g.id,kind});
    if(this.isFlashActive())this.kill(g,'flashlight');return g;
  }
  remove(g){this.ghosts=this.ghosts.filter(x=>x!==g);}
  kill(g,source='shot'){
    if(!this.ghosts.includes(g))return null;this.remove(g);this.score+=g.points;
    let bonus=0;if(g.kind==='boss'){this.bosses++;bonus=this.config.boss.timeBonus;this.time+=bonus;this.bossAt=this.clock+this.config.boss.respawn;this.clearFace();}
    else if(g.kind==='bomb')this.bombsAvoided++;else this.caught++;
    return this.emit({type:g.kind==='boss'?'bossCaught':g.kind==='bomb'?'bombReward':'caught',id:g.id,kind:g.kind,x:g.x,y:g.y,points:g.points,source,bonus});
  }
  shoot(id=null){
    if(this.state!=='running')return null;this.shots++;const g=this.ghosts.find(x=>x.id===id);
    if(!g){const damage=this.isProtected()?0:this.config.round.missDamage;this.health=Math.max(0,this.health-damage);this.streak=0;const e=this.emit({type:'miss',damage,protected:!damage});if(this.health===0)this.end('health');return e;}
    if(g.kind==='bomb'){this.remove(g);this.health=Math.max(0,this.health-1);this.streak=0;this.bombHits++;const e=this.emit({type:'bombHit',x:g.x,y:g.y,damage:1});if(!this.health)this.end('health');return e;}
    this.hits++;this.streak++;this.bestStreak=Math.max(this.bestStreak,this.streak);g.hp--;
    if(g.kind==='boss'&&g.hp>0){const old={x:g.x,y:g.y};Object.assign(g,this.place(g));return this.emit({type:'teleport',id:g.id,...old,hp:g.hp});}
    return this.kill(g);
  }
  canUseItem(kind){return this.state==='running'&&this.items[kind]>0&&!this.used[kind]&&(kind==='flashlight'?!this.isFlashActive():kind==='talisman'&&!this.isTalismanActive());}
  useItem(kind){
    if(!this.canUseItem(kind))return {used:false};this.items[kind]=0;this.used[kind]=true;
    if(kind==='talisman')this.activateTalisman();else{this.flashUntil=this.clock+this.config.items.flashlight.duration;for(const g of [...this.ghosts])this.kill(g,'flashlight');this.emit({type:'flashlight',duration:this.config.items.flashlight.duration});}
    return {used:true,kind};
  }
  activateTalisman(automatic=false){
    this.talisman={endsAt:this.clock+this.config.items.talisman.duration,graceUntil:0};
    // Activation cleanup is not natural expiry and grants no bomb reward.
    this.ghosts=this.ghosts.filter(g=>g.kind!=='bomb');this.clearFace();
    this.nextNormal=this.clock+this.normalInterval();this.emit({type:'talismanStart',automatic,duration:this.config.items.talisman.duration});
  }
  endTalisman(){
    this.ghosts=this.ghosts.filter(g=>g.kind==='boss');this.talisman.endsAt=0;this.talisman.graceUntil=this.clock+this.config.items.talisman.grace;
    this.nextNormal=this.clock+this.normalInterval();this.nextBomb=this.clock+this.bombRow().interval;this.clearFace();
    for(const g of this.ghosts)g.abilityAt=this.clock+this.config.boss.abilityInterval;
    this.emit({type:'talismanEnd'});
  }
  updateFace(){
    const boss=this.ghosts.find(g=>g.kind==='boss');if(!boss||this.isTalismanActive()){this.clearFace();return;}
    const c=this.config.boss;
    if(this.face.phase==='cover'){if(this.clock>=this.face.endsAt){this.clearFace();boss.abilityAt=this.clock+c.abilityInterval;}return;}
    if(this.clock>=boss.abilityAt){this.face={phase:'cover',endsAt:this.clock+c.abilityDuration};this.emit({type:'faceStart'});}
    else if(this.clock>=boss.abilityAt-c.warning&&this.face.phase==='idle'){this.face={phase:'warning',endsAt:boss.abilityAt};this.emit({type:'faceWarning'});}
  }
  tick(dt){
    if(this.state!=='running'||!Number.isFinite(dt)||dt<=0)return;
    // Short substeps preserve expiry/item boundaries and avoid missed spawn intervals.
    let remaining=dt;while(remaining>1e-8&&this.state==='running'){const step=Math.min(.025,remaining,this.time);remaining-=step;this.step(step);}
  }
  step(dt){
    const talismanWasActive=this.isTalismanActive();this.clock+=dt;this.elapsed+=dt;this.peakTime=Math.max(this.peakTime,this.elapsed);this.time=Math.max(0,this.time-dt);
    if(this.time<=1e-8){this.time=0;this.end('time');return;}
    if(talismanWasActive&&!this.isTalismanActive())this.endTalisman();
    for(const g of [...this.ghosts]){
      g.age+=dt;
      if(g.age>=g.life){
        if(g.kind==='bomb')this.kill(g,'expiry');
        else{this.remove(g);this.escaped++;const lost=this.isTalismanActive()?0:Math.min(this.time,g.penalty);this.time-=lost;this.escapeTimeLost+=lost;this.emit({type:'escape',x:g.x,y:g.y,timeLost:lost,protected:this.isTalismanActive()});}
        if(this.time<=0){this.end('escape');return;}continue;
      }
      g.x+=g.vx*dt;g.y+=g.vy*dt;
      if(g.x<.12||g.x>.88){g.x=Math.max(.12,Math.min(.88,g.x));g.vx*=-1;}
      if(g.y<.20||g.y>.82){g.y=Math.max(.20,Math.min(.82,g.y));g.vy*=-1;}
    }
    if(this.clock+1e-8>=this.nextNormal){this.spawn('normal');this.nextNormal=this.clock+this.normalInterval();}
    if(!this.isTalismanActive()&&this.clock+1e-8>=this.nextBomb){this.spawn('bomb');this.nextBomb=this.clock+this.bombRow().interval;}
    if(!this.ghosts.some(g=>g.kind==='boss')&&this.clock+1e-8>=this.bossAt)this.spawn('boss');
    this.updateFace();
  }
  drainEvents(){const e=this.events;this.events=[];return e;}
  snapshot(){return {state:this.state,time:this.time,elapsed:this.elapsed,actualPlayTime:this.clock,peakTime:this.peakTime,score:this.score,health:this.health,caught:this.caught,bosses:this.bosses,bombsAvoided:this.bombsAvoided,escaped:this.escaped,continues:this.continues,items:{...this.items},used:{...this.used},normal:{...this.normalRow()},flashRemaining:Math.max(0,this.flashUntil-this.clock),talismanRemaining:Math.max(0,this.talisman.endsAt-this.clock),graceRemaining:Math.max(0,this.talisman.graceUntil-this.clock),face:{...this.face},collectionResult:this.collectionResult,ghosts:this.ghosts.map(g=>({...g}))};}
}
