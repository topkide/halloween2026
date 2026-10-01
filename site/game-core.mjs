import {DEFAULT_CONFIG,FIXED_MODE,validateConfig} from './balance-config.mjs';
export function getGhostLifetime(elapsed,config=DEFAULT_CONFIG){
  const m=config.normal,r=config.difficulty;
  if(elapsed<=r.startsAt)return m.life;
  if(elapsed>=r.maxAt)return m.minLife;
  return m.life+(m.minLife-m.life)*(elapsed-r.startsAt)/(r.maxAt-r.startsAt);
}
export const DIRECTIONS=Object.freeze([{x:-1,y:0},{x:1,y:0},{x:-Math.SQRT1_2,y:-Math.SQRT1_2},{x:Math.SQRT1_2,y:-Math.SQRT1_2},{x:-Math.SQRT1_2,y:Math.SQRT1_2},{x:Math.SQRT1_2,y:Math.SQRT1_2}].map(Object.freeze));
export const BOSS_SPOTS=Object.freeze([{x:.2,y:.24},{x:.5,y:.24},{x:.8,y:.24},{x:.2,y:.5},{x:.5,y:.5},{x:.8,y:.5},{x:.2,y:.76},{x:.5,y:.76},{x:.8,y:.76}].map(Object.freeze));
export class GhostGame{
  constructor(random=Math.random,config=DEFAULT_CONFIG){this.random=random;this.reset(config);}
  reset(config=this.config){
    const next=validateConfig(config);
    this.config=next;this.mode=FIXED_MODE;this.state='idle';this.time=next.round.startTime;this.elapsed=0;this.health=next.round.health;
    this.score=0;this.caught=0;this.bosses=0;this.escaped=0;this.escapeTimeLost=0;this.hits=0;this.shots=0;this.streak=0;this.bestStreak=0;this.friendHits=0;
    this.nextBoss=next.boss.every;this.bossAvailableAt=0;this.ghosts=[];this.events=[];this.nextSpawn=.12;this.sequence=0;this.endReason=null;
    this.face={phase:'idle',bossId:null,startedAt:0,endsAt:0};this.faceNextAt=Infinity;
    this.nextFriend=next.friend.interval;
    this.items={flashlight:0,talisman:0};this.bonusCaught=0;this.bonusScore=0;
    this.talisman={startedAt:0,endsAt:0,graceUntil:0,nextSpawnAt:Infinity};
  }
  start(config=this.config,loadout={}){this.reset(config);for(const kind of ['flashlight','talisman'])this.items[kind]=Number.isFinite(loadout[kind])&&loadout[kind]>=1?1:0;this.state='running';}
  pause(){if(this.state==='running')this.state='paused';}
  resume(){if(this.state==='paused')this.state='running';}
  end(reason){if(this.state!=='running')return;this.state='ended';this.endReason=reason;this.clearFace(false);this.endTalisman(false);this.events.push({type:'end',reason});}
  place(){let best=null,bestScore=-1;for(let i=0;i<48;i++){const p={x:.16+this.random()*.68,y:.19+this.random()*.62};let distance=1;for(const other of this.ghosts)distance=Math.min(distance,Math.hypot(p.x-other.x,(p.y-other.y)*1.25));if(distance>bestScore){bestScore=distance;best=p;}if(distance>.24)return p;}return best;}
  bossSpot(previous=null){
    const candidates=BOSS_SPOTS.filter(p=>!previous||Math.hypot(p.x-previous.x,p.y-previous.y)>=.35);
    const scored=candidates.map(p=>({p,distance:Math.min(1,...this.ghosts.filter(g=>g!==previous).map(g=>Math.hypot(p.x-g.x,(p.y-g.y)*1.25)))}));
    const open=scored.filter(p=>p.distance>=.22),choices=open.length?open:scored.filter(p=>p.distance>=Math.max(...scored.map(s=>s.distance))-.001);
    return {...choices[Math.floor(this.random()*choices.length)].p};
  }
  spawn(kind='normal'){
    const boss=kind==='boss',friend=kind==='friend',bonus=kind==='bonus',p=boss?this.bossSpot():this.place(),m=boss?this.config.boss:friend?this.config.friend:bonus?this.config.items.talisman:this.config.normal;
    const direction=DIRECTIONS[Math.floor(this.random()*DIRECTIONS.length)];
    const ghost={id:++this.sequence,kind,...p,age:0,life:boss?Infinity:friend||bonus?m.life:getGhostLifetime(this.elapsed,this.config),vx:direction.x*m.speed/100,vy:direction.y*m.speed/100,hp:boss?this.config.boss.hp:1,teleports:0};
    this.ghosts.push(ghost);
    if(boss){ghost.nextTeleportAt=m.teleportInterval>0?this.elapsed+m.teleportInterval:Infinity;this.faceNextAt=this.config.face.enabled?this.elapsed+this.config.face.firstDelay:Infinity;}
    this.events.push({type:'spawn',id:ghost.id,kind});return ghost;
  }
  teleportBoss(g,onHit=false){
    const position={x:g.x,y:g.y},c=this.config.boss,direction=DIRECTIONS[Math.floor(this.random()*DIRECTIONS.length)];
    Object.assign(g,this.bossSpot(g),{vx:direction.x*c.speed/100,vy:direction.y*c.speed/100});
    g.teleports++;g.nextTeleportAt=c.teleportInterval>0?this.elapsed+c.teleportInterval:Infinity;
    const result={type:onHit?'teleport':'bossTeleport',id:g.id,...position,hp:g.hp};this.events.push(result);return result;
  }
  ensureBoss(){if(this.caught>=this.nextBoss&&this.elapsed>=this.bossAvailableAt&&!this.ghosts.some(g=>g.kind==='boss'))this.spawn('boss');}
  clearFace(schedule=true){
    const wasActive=this.face.phase!=='idle';this.face={phase:'idle',bossId:null,startedAt:0,endsAt:0};
    this.faceNextAt=schedule&&this.config.face.enabled?this.elapsed+this.config.face.interval:Infinity;
    if(wasActive)this.events.push({type:'faceEnd'});
  }
  updateFace(){
    const boss=this.ghosts.find(g=>g.kind==='boss'),f=this.config.face;
    if(!boss||!f.enabled){if(this.face.phase!=='idle')this.clearFace(false);return;}
    if(this.face.phase==='idle'&&this.elapsed>=this.faceNextAt){this.face={phase:'warning',bossId:boss.id,startedAt:this.faceNextAt,endsAt:this.faceNextAt+f.warning};this.events.push({type:'faceWarning'});}
    for(let i=0;i<4&&this.face.phase!=='idle'&&this.elapsed>=this.face.endsAt;i++){
      const at=this.face.endsAt;
      if(this.face.phase==='warning'){this.face={phase:'approach',bossId:boss.id,startedAt:at,endsAt:at+f.approach};this.events.push({type:'faceStart'});}
      else if(this.face.phase==='approach')this.face={phase:'cover',bossId:boss.id,startedAt:at,endsAt:at+f.duration};
      else if(this.face.phase==='cover')this.face={phase:'retreat',bossId:boss.id,startedAt:at,endsAt:at+f.approach};
      else this.clearFace(true);
    }
  }
  isTalismanActive(){return this.talisman.endsAt>this.elapsed;}
  canUseItem(kind){
    if(this.state!=='running'||!this.items[kind])return false;
    if(kind==='talisman')return !this.isTalismanActive();
    return kind==='flashlight'&&this.ghosts.some(g=>g.kind==='normal'||g.kind==='bonus'||(g.kind==='boss'&&this.config.items.flashlight.bossDamage>0));
  }
  useItem(kind){
    if(!this.canUseItem(kind))return {used:false,kind};
    this.items[kind]--;
    if(kind==='talisman'){
      const c=this.config.items.talisman;
      this.talisman={startedAt:this.elapsed,endsAt:this.elapsed+c.duration,graceUntil:0,nextSpawnAt:this.elapsed+c.interval};
      for(let i=0;i<c.initialCount;i++)this.spawn('bonus');
      const result={type:'talismanStart',used:true,kind,duration:c.duration};this.events.push(result);return result;
    }
    const before=this.score,boss=this.ghosts.find(g=>g.kind==='boss'),targets=this.ghosts.filter(g=>g.kind==='normal'||g.kind==='bonus');
    // Resolve the complete wave before spawning a new boss, so the same flash cannot hit that new boss.
    for(const g of targets)this.hitGhost(g,1,'flashlight');
    if(boss&&this.config.items.flashlight.bossDamage>0)this.hitGhost(boss,this.config.items.flashlight.bossDamage,'flashlight');
    this.ensureBoss();
    const result={type:'flashlight',used:true,kind,count:targets.length,points:this.score-before,targets:targets.map(g=>({x:g.x,y:g.y}))};this.events.push(result);return result;
  }
  endTalisman(protect=true){
    if(!this.talisman.endsAt)return;
    const deadline=this.talisman.endsAt,removed=this.ghosts.filter(g=>g.kind==='bonus').length;
    this.ghosts=this.ghosts.filter(g=>g.kind!=='bonus');
    this.talisman.endsAt=0;this.talisman.nextSpawnAt=Infinity;this.talisman.graceUntil=protect?deadline+this.config.items.talisman.grace:0;
    this.events.push({type:'talismanEnd',removed,points:this.bonusScore});
  }
  updateTalisman(){
    if(!this.talisman.endsAt)return;
    if(!this.isTalismanActive()){this.endTalisman();return;}
    const c=this.config.items.talisman;
    while(this.elapsed>=this.talisman.nextSpawnAt){
      if(this.ghosts.filter(g=>g.kind==='bonus').length>=c.max){this.talisman.nextSpawnAt=this.elapsed+c.interval;break;}
      this.spawn('bonus');this.talisman.nextSpawnAt+=c.interval;
    }
  }
  tick(dt){
    if(this.state!=='running'||!Number.isFinite(dt)||dt<=0)return;
    const active=Math.min(dt,this.time);this.elapsed+=active;this.time=Math.max(0,this.time-active);
    if(this.time<=0){this.end('time');return;}
    const talismanStart=this.talisman.startedAt,talismanEnd=this.talisman.endsAt;
    if(this.talisman.endsAt&&!this.isTalismanActive())this.endTalisman();
    for(const g of [...this.ghosts]){
      g.age+=active;
      if(g.age>=g.life){
        this.ghosts=this.ghosts.filter(x=>x.id!==g.id);
        if(g.kind==='normal'){
          // Use the actual expiry time when a frame crosses the end of the talisman.
          const expiredAt=this.elapsed-(g.age-g.life);
          const protectedEscape=talismanEnd>0&&expiredAt>=talismanStart&&expiredAt<talismanEnd;
          const timeLost=protectedEscape?0:Math.min(this.time,this.config.normal.escapePenalty);
          this.time=Math.max(0,this.time-timeLost);this.escaped++;this.escapeTimeLost+=timeLost;
          this.events.push({type:'escape',id:g.id,x:g.x,y:g.y,timeLost,protected:protectedEscape});
        }
        continue;
      }
      g.x+=g.vx*active;g.y+=g.vy*active;
      while(g.x<.14||g.x>.86){if(g.x<.14){g.x=.28-g.x;g.vx=Math.abs(g.vx);}else{g.x=1.72-g.x;g.vx=-Math.abs(g.vx);}}
      while(g.y<.19||g.y>.81){if(g.y<.19){g.y=.38-g.y;g.vy=Math.abs(g.vy);}else{g.y=1.62-g.y;g.vy=-Math.abs(g.vy);}}
      if(g.kind==='boss'&&this.elapsed>=g.nextTeleportAt)this.teleportBoss(g);
    }
    if(this.time<=0){this.end('escape');return;}
    this.nextSpawn-=active;
    if(this.nextSpawn<=0){const m=this.config.normal;if(this.ghosts.filter(g=>g.kind==='normal').length<m.max)this.spawn();const jitter=m.spawnJitter/100;this.nextSpawn=m.interval*(1-jitter+this.random()*jitter*2);}
    if(this.config.friend.enabled){this.nextFriend-=active;if(this.nextFriend<=0){if(!this.ghosts.some(g=>g.kind==='friend'))this.spawn('friend');this.nextFriend=this.config.friend.interval;}}
    this.ensureBoss();this.updateFace();this.updateTalisman();
  }
  shoot(id=null){
    if(this.state!=='running')return null;
    this.shots++;const g=this.ghosts.find(g=>g.id===id);
    if(!g){const protectedShot=this.isTalismanActive()||this.elapsed<this.talisman.graceUntil,damage=protectedShot?0:this.config.round.missDamage;this.health=Math.max(0,this.health-damage);this.streak=0;const result={type:'miss',health:this.health,damage,protected:protectedShot};this.events.push(result);if(this.health===0)this.end('health');return result;}
    if(g.kind==='friend'){
      const protectedShot=this.isTalismanActive(),damage=protectedShot?0:this.config.friend.damage;this.health=Math.max(0,this.health-damage);this.streak=0;this.friendHits++;
      this.ghosts=this.ghosts.filter(x=>x.id!==g.id);
      const result={type:'friendHit',id:g.id,x:g.x,y:g.y,damage,health:this.health,protected:protectedShot};this.events.push(result);if(this.health===0)this.end('health');return result;
    }
    this.hits++;this.streak++;this.bestStreak=Math.max(this.streak,this.bestStreak);
    const result=this.hitGhost(g);this.ensureBoss();return result;
  }
  hitGhost(g,damage=1,source='shot'){
    g.hp=Math.max(0,g.hp-damage);const position={x:g.x,y:g.y};
    if(g.kind==='boss'&&g.hp>0){
      if(this.config.boss.teleportOnHit){const result=this.teleportBoss(g,true);result.source=source;return result;}
      const result={type:'bossHit',id:g.id,...position,hp:g.hp,source};this.events.push(result);return result;
    }
    this.ghosts=this.ghosts.filter(x=>x.id!==g.id);const boss=g.kind==='boss',bonus=g.kind==='bonus',points=boss?this.config.boss.points:bonus?this.config.items.talisman.points:this.config.normal.points;this.score+=points;
    if(boss){this.bosses++;this.time+=this.config.boss.bonus;this.nextBoss=this.caught+this.config.boss.every;this.bossAvailableAt=this.elapsed+this.config.boss.cooldown;this.clearFace(false);}else if(bonus){this.bonusCaught++;this.bonusScore+=points;}else this.caught++;
    const result={type:boss?'bossCaught':'caught',id:g.id,kind:g.kind,...position,points,source,bonus:boss?this.config.boss.bonus:0};this.events.push(result);return result;
  }
  drainEvents(){const e=this.events;this.events=[];return e;}
  snapshot(){return{state:this.state,mode:this.mode,time:Number(this.time.toFixed(1)),health:this.health,score:this.score,caught:this.caught,bonusCaught:this.bonusCaught,bonusScore:this.bonusScore,bosses:this.bosses,escaped:this.escaped,escapeTimeLost:Number(this.escapeTimeLost.toFixed(2)),friendHits:this.friendHits,shots:this.shots,hits:this.hits,elapsed:Number(this.elapsed.toFixed(1)),ghostLifetime:Number(getGhostLifetime(this.elapsed,this.config).toFixed(2)),maxDifficulty:this.elapsed>=this.config.difficulty.maxAt,bossCooldown:Number(Math.max(0,this.bossAvailableAt-this.elapsed).toFixed(1)),nextBossInKills:Math.max(0,this.nextBoss-this.caught),items:{...this.items},talisman:{active:this.isTalismanActive(),remaining:Number(Math.max(0,this.talisman.endsAt-this.elapsed).toFixed(2)),graceRemaining:Number(Math.max(0,this.talisman.graceUntil-this.elapsed).toFixed(2))},face:{...this.face},endReason:this.endReason,ghosts:this.ghosts.map(g=>({id:g.id,kind:g.kind,x:g.x,y:g.y,hp:g.hp}))};}
}
