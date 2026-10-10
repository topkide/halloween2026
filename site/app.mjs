import {Hunt,SPECIES,TYPES,DEFAULTS,settings,pose} from './hunt-core.mjs?v=20261011-goldappear1';
import {STORAGE_KEY as KEY,readProgress} from './progress.mjs?v=20261011-goldappear1';
import {ghostSVG} from './ghost-art.mjs?v=20261011-goldappear1';
import {createBountyReel,reelOffset,visibleBounty} from './bounty-reel.mjs?v=20261011-goldappear1';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
const pointerInput=typeof window.PointerEvent==='function';
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let {config,best,soundOn,lastResult}=readProgress(key=>localStorage.getItem(key));
let engine=new Hunt({config}),size={width:400,height:440,scale:1,left:0,top:0};
let lastFrame=performance.now(),hudAt=0,toastUntil=0,endingTimer=null,lastBounty='',soundContext=null,mutedGain=null,shotNoise=null;
const entities=new Map(),impacts=[];
let reelRows=[],lastReelStep=-1,lastReelSoundAt=-Infinity;
const number=n=>Math.round(n).toLocaleString('ko-KR');
function save(){try{localStorage.setItem(KEY,JSON.stringify({best,soundOn,config,lastResult}));}catch{$('storage-note').textContent='이 브라우저에서는 기록을 저장할 수 없어요.';}}
function updateSound(){ui.sound.textContent=soundOn?'♪':'♪̸';ui.sound.setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');ui.sound.setAttribute('aria-pressed',String(soundOn));if(mutedGain)mutedGain.gain.value=soundOn?.2:0;}
function sound(kind){
  if(!soundOn)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    if(!soundContext){soundContext=new Audio();mutedGain=soundContext.createGain();mutedGain.gain.value=.2;mutedGain.connect(soundContext.destination);
      shotNoise=soundContext.createBuffer(1,Math.ceil(soundContext.sampleRate*.085),soundContext.sampleRate);
      const samples=shotNoise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length)**2;
    }
    if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    if(kind==='shot'){
      const noise=soundContext.createBufferSource(),gain=soundContext.createGain(),at=soundContext.currentTime;
      noise.buffer=shotNoise;gain.gain.setValueAtTime(1.3,at);gain.gain.exponentialRampToValueAtTime(.001,at+.085);
      noise.connect(gain);gain.connect(mutedGain);noise.onended=()=>{noise.disconnect();gain.disconnect();};noise.start(at);noise.stop(at+.085);
    }
    const sounds={'reel-tick':[[900,620,.028,0,'sine']],'bounty-stop':[[523,784,.12,0,'triangle'],[784,1046,.24,.09,'sine']],shot:[[145,38,.12,0,'sine'],[920,140,.035,0,'sawtooth']],miss:[[130,50,.08,0,'triangle']],hit:[[650,400,.1,0,'sine']],gold:[[784,990,.15,0,'triangle'],[988,1320,.18,.08,'triangle'],[1318,1760,.25,.16,'sine']],wave:[[440,660,.12,0,'triangle'],[660,880,.16,.1,'sine']],timeout:[[440,330,.18,0,'triangle'],[330,165,.3,.2,'triangle']]};
    for(const [from,to,duration,delay,wave] of sounds[kind]??sounds.hit){const at=soundContext.currentTime+delay,osc=soundContext.createOscillator(),gain=soundContext.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(to,at+duration);gain.gain.setValueAtTime(.32,at);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(mutedGain);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration);}
  }catch{}
}
function measure(){const r=ui.arena.getBoundingClientRect();size={width:400,height:Math.max(180,r.height/r.width*400),scale:r.width/400,left:r.left,top:r.top};}
new ResizeObserver(measure).observe(ui.arena);window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{passive:true});
function setText(node,text){if(node.textContent!==String(text))node.textContent=text;}
function toast(text,ms=1700){setText(ui['field-toast'],text);ui['field-toast'].classList.add('visible');toastUntil=performance.now()+ms;}
function updateContract(){
  const bounty=visibleBounty(engine),multiplier=bounty.multiplier,key=(engine.wave??0)+':'+multiplier;if(key===lastBounty)return;lastBounty=key;
  setText(ui['wanted-reward'],multiplier?'+'+number(bounty.points)+'점':engine.bounty?'배수 추첨 중':number(config.goldBase)+'점 × 배수');setText(ui.multiplier,multiplier?'×'+multiplier:'×?');
  ui.wanted.classList.toggle('jackpot',multiplier>=8);
}
function prepareBountyReel(){
  reelRows=createBountyReel(engine.bounty.multiplier,engine.wave);lastReelStep=-1;lastReelSoundAt=-Infinity;
  ui['brief-strip'].innerHTML=reelRows.map(value=>'<span>×'+value+'</span>').join('');
  ui['brief-strip'].style.transform='translate3d(0,0,0)';
}
function renderBountyReel(now){
  if(engine.state!=='briefing'||engine.bountyRevealed||!reelRows.length)return;
  const offset=reelOffset(config.briefingDuration-engine.briefingLeft,reelRows.length-1),step=Math.floor(offset);
  if(!reducedMotion.matches)ui['brief-strip'].style.transform='translate3d(0,'+(-offset/reelRows.length*100)+'%,0)';
  if(step!==lastReelStep){lastReelStep=step;if(now-lastReelSoundAt>=65){sound('reel-tick');lastReelSoundAt=now;}}
}
function updateHud(){
  const ready=engine.state==='ready',briefing=engine.state==='briefing'||(engine.state==='paused'&&engine.pausedFrom==='briefing');
  ui.game.dataset.state=engine.state;setText(ui.score,number(engine.score??0));setText(ui.best,number(best));
  const remaining=engine.remaining??config.duration,time=Math.ceil(remaining);
  if(ui['time-label'].dataset.value!==String(time)){ui['time-label'].innerHTML=time+'<span>s</span>';ui['time-label'].dataset.value=String(time);}
  ui['time-fill'].style.transform='scaleX('+Math.max(0,remaining/config.duration)+')';ui.game.dataset.urgent=String(remaining<=10&&!ready);
  setText(ui['wave-number'],engine.wave??1);setText(ui['wave-count'],engine.waveKills??0);setText(ui['wave-goal'],engine.waveGoal??config.baseGoal);
  ui['wave-fill'].style.transform='scaleX('+((engine.waveKills??0)/(engine.waveGoal??config.baseGoal))+')';
  setText(ui['miss-cost'],config.missPenalty);setText(ui['intro-time'],config.duration);setText(ui['intro-penalty'],config.missPenalty);
  setText(ui['intro-gold-limit'],config.goldLimit);
  const waveGold=engine.waveGold??0;
  setText(ui['wanted-limit'],'황금 '+waveGold+'/'+config.goldLimit+(waveGold>=config.goldLimit?' · 완료':' 처치'));
  ui.pause.disabled=!['playing','briefing'].includes(engine.state);ui['settings-open'].disabled=!ready;
  ui['wave-intro'].hidden=!briefing;
  if(briefing){
    const revealed=engine.bountyRevealed,bounty=visibleBounty(engine);
    ui['wave-intro'].dataset.reveal=revealed?'revealed':'rolling';ui['wave-intro'].classList.toggle('big-bounty',revealed&&bounty.multiplier>=8);
    ui['brief-reel'].hidden=revealed||reducedMotion.matches;ui['brief-multiplier'].hidden=!revealed&&!reducedMotion.matches;
    setText(ui['brief-status'],revealed?(bounty.multiplier>=8?'대박! 황금 현상금 확정':'이번 웨이브 현상금 확정'):'이번 현상금은 몇 배일까요?');
    setText(ui['brief-cleared'],engine.clearedWaves?engine.clearedWaves+' WAVE CLEAR · 새로운 현상금':'오늘 밤의 첫 현상금');
    setText(ui['brief-wave'],'WAVE '+engine.wave);setText(ui['brief-base'],config.goldBase);setText(ui['brief-multiplier'],revealed?'×'+bounty.multiplier:'×?');setText(ui['brief-reward'],revealed?number(bounty.points):'?');setText(ui['brief-goal'],engine.waveGoal);
    setText(ui['brief-countdown'],revealed?'곧 사냥을 시작해요':'배수를 추첨하고 있어요');
  }
  updateContract();
}
function renderGhosts(){
  const alive=new Set(engine.ghosts.map(g=>g.id));
  for(const [id,node] of entities)if(!alive.has(id)){node.remove();entities.delete(id);}
  for(const ghost of engine.ghosts){
    const def=TYPES[ghost.type],p=pose(ghost,size.width,size.height);let node=entities.get(ghost.id);
    if(!node){node=document.createElement('button');node.type='button';node.className='ghost-target type-'+ghost.type;node.dataset.ghost=String(ghost.id);node.style.setProperty('--phase',-ghost.seed+'s');node.setAttribute('aria-label',def.name+' 사격');node.innerHTML=ghostSVG(ghost.type,{color:def.color});entities.set(ghost.id,node);ui['ghost-layer'].append(node);}
    const w=def.width*size.scale,h=def.height*size.scale;
    node.style.width=w+'px';node.style.height=h+'px';node.style.transform=`translate(${p.x*size.scale-w/2}px,${p.y*size.scale-h/2}px) rotate(${p.angle}deg) scale(${p.sx},${p.sy})`;
    node.style.opacity=p.alpha;node.style.pointerEvents=p.alpha<.3||engine.state!=='playing'?'none':'auto';node.disabled=engine.state!=='playing'||p.alpha<.3;
    const art=node.firstElementChild;art.style.transform='scaleX('+p.facing+')';
  }
}
function hitEffect(hit,x,y){
  const effect=document.createElement('div');effect.className='shot-effect'+(hit.kind==='miss'?' miss':'');effect.style.left=x+'px';effect.style.top=y+'px';
  const color=hit.kind==='gold'?'#ffe094':hit.kind==='miss'?'#f6aa96':'#dce8c7';effect.style.setProperty('--hit',color);
  const art=hit.ghost?ghostSVG(hit.kind,{color:TYPES[hit.kind].color,staticPose:true}):'';
  const small=hit.kind==='gold'?'황금 보너스':hit.kind==='miss'?'헛발!':'';
  const text=hit.kind==='miss'?'-'+config.missPenalty+'초':'+'+number(hit.points)+'점';
  const muzzleX=size.width*size.scale*.53,muzzleY=size.height*size.scale+16;
  const shotX=muzzleX-x,shotY=muzzleY-y,length=Math.hypot(shotX,shotY),rotation=Math.atan2(shotY,shotX)*180/Math.PI;
  const sparks=Array.from({length:3},(_,i)=>{const angle=i*Math.PI*2/3+.2;return '<i class="shot-spark" style="--dx:'+Math.cos(angle)*28+'px;--dy:'+Math.sin(angle)*28+'px;--angle:'+angle+'rad"></i>';}).join('');
  effect.innerHTML='<i class="shot-tracer" style="--length:'+length+'px;--rotation:'+rotation+'deg"></i><i class="shot-flash"></i>'+sparks+'<i class="shot-hole"></i>'+art+'<i class="shot-ring"></i><span class="shot-text"><small>'+small+'</small>'+text+'</span>';
  ui['effect-layer'].append(effect);impacts.push({node:effect,until:performance.now()+650});
  const casing=document.createElement('i');casing.className='shell-casing';casing.style.left=muzzleX+'px';casing.style.top=(muzzleY-25)+'px';ui['effect-layer'].append(casing);impacts.push({node:casing,until:performance.now()+430});
  while(impacts.length>12)impacts.shift().node.remove();
}
function flushEvents(){for(const event of engine.drain()){
  if(event.kind==='wave'){clearVisuals();prepareBountyReel();updateContract();updateHud();sound('reel-tick');lastReelSoundAt=performance.now();}
  if(event.kind==='bounty-reveal'){sound(event.multiplier>=8?'gold':'bounty-stop');updateContract();updateHud();}
  if(event.kind==='wave-start')sound('wave');
  if(event.kind==='gold-limit')toast('황금 사냥 완료! 일반 유령을 잡아 다음 웨이브로',2000);
  if(event.kind==='end')finish(event.reason,event.cause);
}}
function fire(event){
  if(engine.state!=='playing'||event.target.closest('#intro, #wave-intro, #ending'))return;
  if(event.type==='pointerdown'&&event.button!==0)return;
  if(event.type==='click'&&pointerInput&&(event.detail>0||event.pointerType))return;
  event.preventDefault();
  const target=event.target.closest('[data-ghost]'),id=target?Number(target.dataset.ghost):null;
  const g=id===null?null:engine.ghosts.find(g=>g.id===id),p=g?pose(g,size.width,size.height):null;
  const x=event.type==='click'&&p?p.x*size.scale:event.clientX-size.left,y=event.type==='click'&&p?p.y*size.scale:event.clientY-size.top;
  const result=engine.shoot(id);if(!result)return;
  hitEffect(result,x,y);sound('shot');sound(['miss','gold'].includes(result.kind)?result.kind:'hit');
  if(result.kind==='miss')toast('헛발! 남은 시간 -'+config.missPenalty+'초',650);
  renderGhosts();flushEvents();updateHud();
}
if(pointerInput)ui.arena.addEventListener('pointerdown',fire);
ui.arena.addEventListener('click',fire);
function clearVisuals(){for(const x of impacts)x.node.remove();impacts.length=0;for(const node of entities.values())node.remove();entities.clear();toastUntil=0;ui['field-toast'].classList.remove('visible');setText(ui['field-toast'],'');ui.ending.hidden=true;}
function start(){
  clearTimeout(endingTimer);endingTimer=null;for(const id of ['result-dialog','pause-dialog'])ui[id].close();clearVisuals();
  engine=new Hunt({config});engine.start();ui.intro.hidden=true;lastBounty='';lastFrame=performance.now();measure();flushEvents();renderGhosts();updateHud();
}
function ready(){
  clearTimeout(endingTimer);endingTimer=null;ui['result-dialog'].close();clearVisuals();engine=new Hunt({config});ui.intro.hidden=false;lastBounty='';renderGhosts();updateHud();
}
function finish(reason,cause){
  if(endingTimer)return;ui['pause-dialog'].close();ui.ending.hidden=false;
  const data=reason==='quit'?['☾','사냥 종료','오늘 밤은 여기까지.']:['◷','시간 초과!',cause==='miss'?'헛발 사격으로 남은 시간을 모두 썼어요.':'남은 시간이 모두 줄어들었어요.'];
  setText(ui['ending-icon'],data[0]);setText(ui['ending-title'],data[1]);setText(ui['ending-copy'],data[2]);if(reason==='timeout')sound('timeout');
  const isBest=engine.score>best;best=Math.max(best,engine.score);lastResult={score:engine.score,normalScore:engine.normalScore,goldScore:engine.goldScore,wave:engine.wave,clearedWaves:engine.clearedWaves,kills:engine.kills,gold:engine.gold,shots:engine.shots,hits:engine.hits,misses:engine.misses,reason};save();
  endingTimer=setTimeout(()=>{
    endingTimer=null;ui.ending.hidden=true;setText(ui['result-reason'],reason==='timeout'?"TIME’S UP":'HUNT COMPLETE');setText(ui['result-score'],number(engine.score));setText(ui['result-normal-score'],number(engine.normalScore)+'점');setText(ui['result-gold-score'],number(engine.goldScore)+'점');setText(ui['result-kills'],engine.kills);setText(ui['result-waves'],engine.clearedWaves);setText(ui['result-gold'],engine.gold);setText(ui['result-accuracy'],engine.shots?Math.round(engine.hits/engine.shots*100)+'%':'0%');ui['new-best'].hidden=!isBest;ui['result-dialog'].showModal();
  },1200);
}
function pause(){if(engine.pause()){ui['pause-dialog'].showModal();updateHud();}}
function resume(){ui['pause-dialog'].close();engine.resume();lastFrame=performance.now();updateHud();}
ui.start.addEventListener('click',start);ui.retry.addEventListener('click',start);ui.home.addEventListener('click',ready);ui.pause.addEventListener('click',pause);ui.resume.addEventListener('click',resume);
ui.quit.addEventListener('click',()=>{resume();engine.end('quit');flushEvents();updateHud();});
ui['pause-dialog'].addEventListener('cancel',event=>{event.preventDefault();resume();});ui['result-dialog'].addEventListener('cancel',event=>{event.preventDefault();ready();});
ui.sound.addEventListener('click',()=>{soundOn=!soundOn;updateSound();save();});
document.addEventListener('keydown',event=>{if(event.repeat||event.target.matches('input'))return;if(event.key==='Escape'&&['playing','briefing'].includes(engine.state)){event.preventDefault();pause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&['playing','briefing'].includes(engine.state))pause();lastFrame=performance.now();});
function fillSettings(){ui['setting-duration'].value=config.duration;ui['setting-penalty'].value=config.missPenalty;ui['setting-goal'].value=config.baseGoal;ui['setting-spawn'].value=config.spawn;ui['setting-gold-limit'].value=config.goldLimit;ui['setting-gold-interval'].value=config.goldInterval;}
ui['settings-open'].addEventListener('click',()=>{if(engine.state!=='ready')return;fillSettings();setText(ui['settings-status'],'');ui['settings-dialog'].showModal();});
ui['settings-close'].addEventListener('click',()=>ui['settings-dialog'].close());
ui['settings-form'].addEventListener('submit',event=>{event.preventDefault();if(!ui['settings-form'].reportValidity())return;config=settings({duration:Number(ui['setting-duration'].value),missPenalty:Number(ui['setting-penalty'].value),baseGoal:Number(ui['setting-goal'].value),spawn:Number(ui['setting-spawn'].value),goldLimit:Number(ui['setting-gold-limit'].value),goldInterval:Number(ui['setting-gold-interval'].value)});save();ui['settings-dialog'].close();ready();});
ui.defaults.addEventListener('click',()=>{config={...DEFAULTS};fillSettings();save();ready();setText(ui['settings-status'],'기본값을 복원했어요.');});
ui['reset-open'].addEventListener('click',()=>{if(ui['settings-dialog'].open)ui['reset-dialog'].showModal();});ui['reset-cancel'].addEventListener('click',()=>ui['reset-dialog'].close());
ui['reset-confirm'].addEventListener('click',()=>{if(!ui['reset-dialog'].open||engine.state!=='ready')return;best=0;lastResult=null;save();ui['reset-dialog'].close();updateHud();setText(ui['settings-status'],'사냥 기록을 초기화했어요.');});
function frame(now){
  const dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(['playing','briefing'].includes(engine.state)){engine.tick(dt);flushEvents();renderGhosts();renderBountyReel(now);}
  while(impacts.length&&impacts[0].until<=now)impacts.shift().node.remove();
  if(toastUntil&&now>toastUntil){ui['field-toast'].classList.remove('visible');toastUntil=0;}
  if(now-hudAt>80){updateHud();hudAt=now;}
  requestAnimationFrame(frame);
}
ui.cast.innerHTML=[...SPECIES].sort((a,b)=>a.points-b.points).map(s=>'<div title="'+s.habit+' · '+s.points+'점">'+ghostSVG(s.id,{color:s.color})+'<small>'+s.name+'</small><strong>'+s.points+'점</strong></div>').join('');
ui['wanted-art'].innerHTML=ghostSVG('gold',{color:TYPES.gold.color,staticPose:true});ui['brief-art'].innerHTML=ghostSVG('gold',{color:TYPES.gold.color,staticPose:true});
measure();updateSound();ready();requestAnimationFrame(frame);
