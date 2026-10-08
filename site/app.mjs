import {Hunt,SPECIES,TYPES,DEFAULTS,settings,restoreSettings,pose} from './hunt-core.mjs?v=20261008-bounty2';
import {ghostSVG} from './ghost-art.mjs?v=20261008-bounty2';

const $=id=>document.getElementById(id);
const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(node=>[node.id,node]));
const KEY='catjump-bounty-hunt-v1';
const pointerInput=typeof window.PointerEvent==='function';
let stored={};try{stored=JSON.parse(localStorage.getItem(KEY))||{};}catch{}
let config=restoreSettings(stored.config,stored.balanceRevision??1),best=Number.isSafeInteger(stored.best)&&stored.best>=0?stored.best:0,soundOn=stored.soundOn!==false;
let engine=new Hunt({config}),size={width:400,height:440,scale:1,left:0,top:0};
let lastFrame=performance.now(),hudAt=0,toastUntil=0,endingTimer=null,lastBounty='',soundContext=null,mutedGain=null,shotNoise=null;
const entities=new Map(),impacts=[];let lastResult=stored.lastResult??null;
const number=n=>Math.round(n).toLocaleString('ko-KR');
function save(){try{localStorage.setItem(KEY,JSON.stringify({best,soundOn,config,lastResult,balanceRevision:2}));}catch{$('storage-note').textContent='이 브라우저에서는 기록을 저장할 수 없어요.';}}
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
    const sounds={shot:[[145,38,.12,0,'sine'],[920,140,.035,0,'sawtooth']],miss:[[130,50,.08,0,'triangle']],hit:[[650,400,.1,0,'sine'],[950,650,.13,.04,'triangle']],bounty:[[680,920,.12,0,'triangle'],[1050,1500,.2,.08,'sine']],gold:[[784,990,.15,0,'triangle'],[988,1320,.18,.08,'triangle'],[1318,1760,.25,.16,'sine']],clock:[[550,800,.16,0,'sine'],[850,1100,.2,.12,'sine']],reload:[[160,110,.08,0,'square']],loaded:[[400,800,.1,0,'triangle']],bomb:[[110,35,.6,0,'sawtooth']],ink:[[220,60,.28,0,'sawtooth']],timeout:[[440,330,.18,0,'triangle'],[330,165,.3,.2,'triangle']]};
    for(const [from,to,duration,delay,wave] of sounds[kind]??sounds.hit){const at=soundContext.currentTime+delay,osc=soundContext.createOscillator(),gain=soundContext.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,at);osc.frequency.exponentialRampToValueAtTime(to,at+duration);gain.gain.setValueAtTime(.32,at);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(mutedGain);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration);}
  }catch{}
}
function measure(){const r=ui.arena.getBoundingClientRect();size={width:400,height:Math.max(180,r.height/r.width*400),scale:r.width/400,left:r.left,top:r.top};}
new ResizeObserver(measure).observe(ui.arena);window.addEventListener('resize',measure,{passive:true});window.addEventListener('scroll',measure,{passive:true});
function setText(node,text){if(node.textContent!==String(text))node.textContent=text;}
function toast(text,ms=1700){setText(ui['field-toast'],text);ui['field-toast'].classList.add('visible');toastUntil=performance.now()+ms;}
function updateContract(){
  if(!engine.bounty)return;
  const {type,multiplier}=engine.bounty,key=type+':'+multiplier;if(key===lastBounty)return;lastBounty=key;
  ui['wanted-art'].innerHTML=ghostSVG(type,{color:TYPES[type].color});setText(ui['wanted-name'],TYPES[type].name);setText(ui['wanted-reward'],'+'+number(200*multiplier));setText(ui.multiplier,'×'+multiplier);
  ui.wanted.classList.remove('changed');requestAnimationFrame(()=>ui.wanted.classList.add('changed'));ui.wanted.classList.toggle('jackpot',multiplier>=8);
}
function updateHud(){
  ui.game.dataset.state=engine.state;const active=engine.state==='playing',ready=engine.state==='ready';
  setText(ui.score,number(engine.score??0));setText(ui.best,number(best));
  const remaining=engine.remaining??config.duration,time=Math.ceil(remaining);
  if(ui['time-label'].dataset.value!==String(time)){ui['time-label'].innerHTML=time+'<span>s</span>';ui['time-label'].dataset.value=String(time);}
  ui['time-fill'].style.transform='scaleX('+Math.min(1,remaining/config.duration)+')';ui.game.dataset.urgent=String(remaining<=10&&!ready);
  const ammo=engine.ammo??5;setText(ui['ammo-count'],ammo);ui.cartridges.setAttribute('aria-label','남은 탄약 '+ammo+'발');
  [...ui.cartridges.children].forEach((el,i)=>el.classList.toggle('spent',i>=ammo));
  const reloading=engine.reloadLeft>0;setText(ui['reload-label'],reloading?'장전 중…':'↻ 장전');setText(ui['reload-hint'],reloading?engine.reloadLeft.toFixed(1)+'초':'자동 장전 · R');
  ui['reload-fill'].style.transform='scaleX('+(reloading?1-engine.reloadLeft/config.reload:0)+')';ui.reload.disabled=!active||reloading||ammo===5;
  ui.pause.disabled=!active;ui['settings-open'].disabled=!ready;
  ui['ink-splash'].hidden=!(engine.inkLeft>0&&['playing','paused'].includes(engine.state));setText(ui['bounty-time'],Math.ceil(engine.bountyLeft??8));ui['contract-fill'].style.transform='scaleX('+Math.max(0,(engine.bountyLeft??8)/config.bountyPeriod)+')';updateContract();
}
function renderGhosts(){
  const alive=new Set(engine.ghosts.map(g=>g.id));
  for(const [id,node] of entities)if(!alive.has(id)){node.remove();entities.delete(id);}
  for(const ghost of engine.ghosts){
    const def=TYPES[ghost.type],p=pose(ghost,size.width,size.height);let node=entities.get(ghost.id);
    if(!node){node=document.createElement('button');node.type='button';node.className='ghost-target type-'+ghost.type;node.dataset.ghost=String(ghost.id);node.style.setProperty('--phase',-ghost.seed+'s');node.setAttribute('aria-label',def.name+' 사격');node.innerHTML=ghostSVG(ghost.type,{color:def.color})+'<span class="target-tag" hidden></span>';entities.set(ghost.id,node);ui['ghost-layer'].append(node);}
    const w=def.width*size.scale,h=def.height*size.scale;
    node.style.width=w+'px';node.style.height=h+'px';node.style.transform=`translate(${p.x*size.scale-w/2}px,${p.y*size.scale-h/2}px) rotate(${p.angle}deg) scale(${p.sx},${p.sy})`;
    node.style.opacity=p.alpha;node.style.pointerEvents=p.alpha<.3||engine.state!=='playing'?'none':'auto';node.disabled=engine.state!=='playing'||p.alpha<.3;
    const art=node.firstElementChild;art.style.transform='scaleX('+p.facing+')';
    const label=node.lastElementChild,text=({gold:'+1,200',clock:'+5 SEC',bomb:'DANGER',ink:'먹물 주의'})[ghost.type]??'';
    label.hidden=!text;setText(label,text);
  }
}
function hitEffect(hit,x,y){
  const effect=document.createElement('div');effect.className='shot-effect'+(hit.kind==='miss'?' miss':'');effect.style.left=x+'px';effect.style.top=y+'px';
  const color=hit.kind==='gold'?'#ffe094':hit.bonus?'#edf5bb':hit.kind==='clock'?'#9bebd8':hit.kind==='bomb'?'#ffad98':'#dce8c7';effect.style.setProperty('--hit',color);
  const art=hit.ghost?ghostSVG(hit.kind,{color:TYPES[hit.kind].color,staticPose:true}):'';
  const small=hit.bonus?'현상금 명중!':hit.kind==='gold'?'GOLDEN GHOST!':hit.kind==='clock'?'+5초':hit.kind==='ink'?'먹물!':'';
  const text=hit.kind==='miss'?'MISS':hit.kind==='bomb'?'BOOM!':hit.kind==='ink'?'앗!':'+'+number(hit.points);
  const muzzleX=size.width*size.scale*.53,muzzleY=size.height*size.scale+16;
  const shotX=muzzleX-x,shotY=muzzleY-y,length=Math.hypot(shotX,shotY),rotation=Math.atan2(shotY,shotX)*180/Math.PI;
  const sparks=Array.from({length:6},(_,i)=>{const angle=i*Math.PI/3+.2;return '<i class="shot-spark" style="--dx:'+Math.cos(angle)*45+'px;--dy:'+Math.sin(angle)*45+'px;--angle:'+angle+'rad"></i>';}).join('');
  effect.innerHTML='<i class="shot-tracer" style="--length:'+length+'px;--rotation:'+rotation+'deg"></i><i class="shot-flash"></i>'+sparks+'<i class="shot-hole"></i>'+art+'<i class="shot-ring"></i><span class="shot-text"><small>'+small+'</small>'+text+'</span>';
  ui['effect-layer'].append(effect);impacts.push({node:effect,until:performance.now()+650});
  const casing=document.createElement('i');casing.className='shell-casing';casing.style.left=muzzleX+'px';casing.style.top=(muzzleY-25)+'px';ui['effect-layer'].append(casing);impacts.push({node:casing,until:performance.now()+430});
  while(impacts.length>12)impacts.shift().node.remove();
}
function flushEvents(){for(const event of engine.drain()){
  if(event.kind==='bounty'){updateContract();if(engine.elapsed>0)toast('현상금이 바뀌었어요 · 위 수배서를 확인하세요',1000);}
  if(event.kind==='reload')sound('reload');
  if(event.kind==='loaded')sound('loaded');
  if(event.kind==='end')finish(event.reason);
}}
function fire(event){
  if(engine.state!=='playing'||event.target.closest('#intro'))return;
  if(event.type==='pointerdown'&&event.button!==0)return;
  if(event.type==='click'&&pointerInput&&(event.detail>0||event.pointerType))return;
  event.preventDefault();
  const target=event.target.closest('[data-ghost]'),id=target?Number(target.dataset.ghost):null;
  const g=id===null?null:engine.ghosts.find(g=>g.id===id),p=g?pose(g,size.width,size.height):null;
  const x=event.type==='click'&&p?p.x*size.scale:event.clientX-size.left,y=event.type==='click'&&p?p.y*size.scale:event.clientY-size.top;
  const result=engine.shoot(id);if(!result)return;
  if(result.kind==='loading'){toast('장전 중! 잠깐만 기다려요.',500);return;}
  hitEffect(result,x,y);sound('shot');sound(result.kind==='miss'?'miss':result.bonus?'bounty':['gold','clock','bomb','ink'].includes(result.kind)?result.kind:'hit');
  if(result.kind==='clock')toast('시간 유령! 사냥 시간 +5초');
  if(result.kind==='gold')toast('황금 유령! +1,200',1200);
  renderGhosts();flushEvents();updateHud();
}
if(pointerInput)ui.arena.addEventListener('pointerdown',fire);
ui.arena.addEventListener('click',fire);
function clearVisuals(){for(const x of impacts)x.node.remove();impacts.length=0;for(const node of entities.values())node.remove();entities.clear();toastUntil=0;ui['field-toast'].classList.remove('visible');setText(ui['field-toast'],'');ui.ending.hidden=true;}
function start(){clearTimeout(endingTimer);for(const id of ['result-dialog','pause-dialog'])ui[id].close();clearVisuals();engine=new Hunt({config});engine.start();ui.intro.hidden=true;lastBounty='';lastFrame=performance.now();measure();sound('loaded');flushEvents();renderGhosts();updateHud();toast('위 수배서의 얼굴을 찾으세요!',1100);}
function ready(){clearTimeout(endingTimer);ui['result-dialog'].close();clearVisuals();engine=new Hunt({config});engine.start();engine.state='ready';engine.drain();ui.intro.hidden=false;lastBounty='';renderGhosts();updateHud();}
function finish(reason){
  if(endingTimer)return;ui['pause-dialog'].close();ui.ending.hidden=false;ui['ink-splash'].hidden=true;
  const data=reason==='bomb'?['✹','폭탄을 건드렸어요!','위험한 한 발… 사냥이 끝났어요.']:reason==='quit'?['☾','사냥 종료','오늘 밤은 여기까지.']:['◷','시간 초과!','오늘 밤의 사냥이 끝났어요.'];
  setText(ui['ending-icon'],data[0]);setText(ui['ending-title'],data[1]);setText(ui['ending-copy'],data[2]);if(reason==='timeout')sound('timeout');
  const isBest=engine.score>best;best=Math.max(best,engine.score);lastResult={score:engine.score,kills:engine.kills,bounties:engine.bounties,gold:engine.gold,shots:engine.shots,hits:engine.hits,reason};save();
  endingTimer=setTimeout(()=>{endingTimer=null;ui.ending.hidden=true;setText(ui['result-reason'],reason==='bomb'?'BOMB HIT':reason==='timeout'?"TIME’S UP":'HUNT COMPLETE');setText(ui['result-score'],number(engine.score));setText(ui['result-kills'],engine.kills);setText(ui['result-bounties'],engine.bounties);setText(ui['result-gold'],engine.gold);setText(ui['result-accuracy'],engine.shots?Math.round(engine.hits/engine.shots*100)+'%':'0%');ui['new-best'].hidden=!isBest;ui['result-dialog'].showModal();},1200);
}
function pause(){if(engine.pause()){ui['pause-dialog'].showModal();updateHud();}}
function resume(){ui['pause-dialog'].close();engine.resume();lastFrame=performance.now();updateHud();}
ui.start.addEventListener('click',start);ui.retry.addEventListener('click',start);ui.home.addEventListener('click',ready);ui.pause.addEventListener('click',pause);ui.resume.addEventListener('click',resume);
ui.quit.addEventListener('click',()=>{resume();engine.end('quit');flushEvents();updateHud();});
ui['pause-dialog'].addEventListener('cancel',event=>{event.preventDefault();resume();});ui['result-dialog'].addEventListener('cancel',event=>{event.preventDefault();ready();});
ui.reload.addEventListener('click',()=>{engine.reload();flushEvents();updateHud();});
ui.sound.addEventListener('click',()=>{soundOn=!soundOn;updateSound();save();});
document.addEventListener('keydown',event=>{if(event.repeat||event.target.matches('input'))return;if((event.code==='KeyR'||event.key.toLowerCase()==='r')&&engine.state==='playing'){event.preventDefault();engine.reload();flushEvents();updateHud();}if(event.key==='Escape'&&engine.state==='playing'){event.preventDefault();pause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&engine.state==='playing')pause();lastFrame=performance.now();});
function fillSettings(){ui['setting-duration'].value=config.duration;ui['setting-reload'].value=config.reload;ui['setting-spawn'].value=config.spawn;}
ui['settings-open'].addEventListener('click',()=>{if(engine.state!=='ready')return;fillSettings();setText(ui['settings-status'],'');ui['settings-dialog'].showModal();});
ui['settings-close'].addEventListener('click',()=>ui['settings-dialog'].close());
ui['settings-form'].addEventListener('submit',event=>{event.preventDefault();if(!ui['settings-form'].reportValidity())return;config=settings({duration:Number(ui['setting-duration'].value),reload:Number(ui['setting-reload'].value),spawn:Number(ui['setting-spawn'].value)});save();ui['settings-dialog'].close();ready();});
ui.defaults.addEventListener('click',()=>{config={...DEFAULTS};fillSettings();save();ready();setText(ui['settings-status'],'기본값을 복원했어요.');});
ui['reset-open'].addEventListener('click',()=>{if(ui['settings-dialog'].open)ui['reset-dialog'].showModal();});ui['reset-cancel'].addEventListener('click',()=>ui['reset-dialog'].close());
ui['reset-confirm'].addEventListener('click',()=>{if(!ui['reset-dialog'].open||engine.state!=='ready')return;best=0;lastResult=null;save();ui['reset-dialog'].close();updateHud();setText(ui['settings-status'],'사냥 기록을 초기화했어요.');});
function frame(now){
  const dt=Math.max(0,(now-lastFrame)/1000);lastFrame=now;
  if(engine.state==='playing'){engine.tick(dt);flushEvents();renderGhosts();}
  while(impacts.length&&impacts[0].until<=now)impacts.shift().node.remove();
  if(toastUntil&&now>toastUntil){ui['field-toast'].classList.remove('visible');toastUntil=0;}
  if(now-hudAt>80){updateHud();hudAt=now;}
  requestAnimationFrame(frame);
}
ui.cast.innerHTML=SPECIES.map(s=>'<div title="'+s.habit+'">'+ghostSVG(s.id,{color:s.color})+'<small>'+s.name+'</small></div>').join('');
measure();updateSound();ready();requestAnimationFrame(frame);
