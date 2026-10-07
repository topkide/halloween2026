import {DEFAULT_CONFIG,validateConfig} from './balance-config.mjs';
import {createBalanceEditor} from './balance-editor.mjs';
import {difficultyAt,comboBonus} from './game-core.mjs';

(() => {
  const root = document.getElementById('cj-ghost-room');
  const find = id => root.querySelector('#cj-' + id);
  const room = find('room'), spots = find('spots'), action = find('action'), effects = find('effects'), haunts=find('haunts');
  const STATE_KEY='catjump-memory-room-state-v1', BALANCE_KEY='catjump-memory-room-balance-v1';
  const balanceButton=document.getElementById('balance-open'), balanceDialog=document.getElementById('balance-dialog');
  const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
  function writeStorage(key,value) {
    try { if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value)); }
    catch { find('storage-note').textContent='브라우저 저장이 제한되어 새로고침하면 기록과 설정이 사라져요.'; }
  }
  let pendingConfig=structuredClone(DEFAULT_CONFIG);
  try { const saved=readStorage(BALANCE_KEY);if(saved)pendingConfig=validateConfig(saved); } catch { /* Ignore obsolete or invalid local settings. */ }
  let config=structuredClone(pendingConfig);
  const ghost = type => '<span class="cj-ghost '+type+'" aria-hidden="true"></span>';
  const buttons = Array.from({length:12},(_,i) => {
    const button = document.createElement('button');
    button.type='button'; button.className='cj-spot cursor-interaction';
    button.addEventListener('click',event=>{ event.stopPropagation(); choose(i,event); }); spots.append(button); return button;
  });
  let phase='ready', cycle=0, score=0, current=difficultyAt(config,0,0), spooked=null, runStarted=0, board=['target','empty','decoy','empty','target','empty','empty','decoy','empty','target','empty','empty'];
  let caught=new Set(), tried=new Set(), timer=null, phaseTimer=null, deadline=0, duration=0, best=0;
  let soundOn=true, audio=null, audioMaster=null, lastSummary=null, shotNoise=null;
  let combo=0, lastHit=-Infinity, hauntSerial=0, lastPulse=-Infinity;
  const hauntTimers=new Set();
  const voices=new Set();
  function applySaved(snapshot) {
    const saved = snapshot;
    if (Number.isSafeInteger(saved?.best) && saved.best>=0) best=Math.max(best,saved.best);
    if (typeof saved?.soundOn==='boolean') soundOn=saved.soundOn;
    if (saved?.result) lastSummary=saved.result;
    updateSoundButton();
    find('best').textContent='최고 '+Math.max(best,score);
  }
  applySaved(readStorage(STATE_KEY));
  function saveResult(reason) {
    best=Math.max(best,score);
    lastSummary={game:'캣점프 유령이 숨은 밤',mode:'무한 사냥 · 한 번의 오발로 종료',result:'게임 종료',reason:({empty:'허공 사격',decoy:'금지 유령 명중',timeout:'시간 초과'})[reason],caught:score,best};
    saveState();
  }
  function saveState() {
    writeStorage(STATE_KEY,{best,soundOn,result:lastSummary});
  }
  function updateSoundButton() {
    find('sound').textContent=soundOn?'♪ ON':'♪ OFF';
    find('sound').setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');
    find('sound').setAttribute('aria-pressed',String(soundOn));
    if(audioMaster) audioMaster.gain.value=soundOn ? 0.28 : 0;
  }
  function enableAudio() {
    if(!soundOn) return;
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!audio&&Audio) {
        audio=new Audio(); audioMaster=audio.createGain(); audioMaster.gain.value=.28; audioMaster.connect(audio.destination);
        shotNoise=audio.createBuffer(1,Math.ceil(audio.sampleRate*.075),audio.sampleRate);
        const samples=shotNoise.getChannelData(0);
        for(let i=0;i<samples.length;i++) samples[i]=(Math.random()*2-1)*(1-i/samples.length);
      }
      if(audio?.state==='suspended') audio.resume().catch(()=>{});
    } catch { audio=null; }
  }
  function shotSound(type,chain=1) {
    enableAudio();
    if(!soundOn||!audio||audio.state!=='running') return;
    const now=audio.currentTime;
    const tone=(frequency,end,at,length,volume,wave='square',vocal=false)=>{
      const oscillator=audio.createOscillator(), gain=audio.createGain();
      oscillator.type=wave; oscillator.frequency.setValueAtTime(frequency,now+at);
      oscillator.frequency.exponentialRampToValueAtTime(end,now+at+length);
      gain.gain.setValueAtTime(volume,now+at); gain.gain.exponentialRampToValueAtTime(.001,now+at+length);
      let vowel=null;
      if(vocal&&audio.createBiquadFilter) { vowel=audio.createBiquadFilter();vowel.type='bandpass';vowel.frequency.value=typeof vocal==='number'?vocal:850;vowel.Q.value=1.3;oscillator.connect(vowel);vowel.connect(gain); }
      else oscillator.connect(gain);
      gain.connect(audioMaster); voices.add(oscillator);
      oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();if(vowel)vowel.disconnect();};
      oscillator.start(now+at); oscillator.stop(now+at+length);
    };
    if(type==='reveal') { tone(880,1760,0,.08,.18); return; }
    if(type==='haunt') { tone(440,180,0,.18,.16,'triangle');tone(740,320,.035,.13,.07,'sawtooth',1500);return; }
    if(type==='pulse') { tone(90,48,0,.06,.20,'sine');return; }
    if(type==='snicker') {
      [430,490,405].forEach((f,n)=>{
        tone(f*1.2,f,n*.16,.035,.32,'sawtooth',2200);
        tone(f,f*.72,n*.16+.035,.10,.48,'sawtooth',1750);
      });
      return;
    }
    if(type==='laugh') {
      tone(160,210,0,.16,.35,'sawtooth',true);
      [285,260,230,195].forEach((f,n)=>{
        tone(f,f*.72,.16+n*.17,.14,.55,'sawtooth',true);
        tone(f*3.2,f*2.4,.175+n*.17,.11,.08,'triangle');
      });
      return;
    }
    if(type==='boo') { tone(240,620,0,.17,.26,'triangle');tone(620,250,.17,.28,.24,'triangle');tone(900,560,.24,.18,.08);return; }
    if(type==='shiver') {
      tone(660,880,0,.06,.15,'triangle');tone(880,1320,.05,.08,.12,'triangle');
      [360,310,345,295,325].forEach((f,n)=>tone(f,f*.86,.075+n*.034,.035,.09,'square'));
      return;
    }
    const crack=audio.createBufferSource(), crackGain=audio.createGain();
    crack.buffer=shotNoise; crackGain.gain.setValueAtTime(type==='repeat' ? .18 : .65,now);
    crackGain.gain.exponentialRampToValueAtTime(.001,now+.075);
    crack.connect(crackGain); crackGain.connect(audioMaster); voices.add(crack);
    crack.onended=()=>{voices.delete(crack);crack.disconnect();crackGain.disconnect();};
    crack.start(now); crack.stop(now+.075);
    tone(170,38,0,.13,.75,'sine');
    tone(720,110,0,.055,.36,'sawtooth');
    if(type==='target') {
      const pitch=1+Math.min(chain-1,4)*.13;
      tone(880*pitch,520*pitch,.025,.09,.34);
      tone(1320*pitch,990*pitch,.075,.15,.22);
      tone(1760*pitch,1320*pitch,.12,.19,.13,'triangle');
    } else if(type==='decoy') { tone(210,65,.02,.26,.45); tone(160,55,.07,.18,.28); }
    else tone(95,48,.02,.08,.3,'triangle');
  }
  function fire(i,event,type,bonus=0) {
    const bounds=room.getBoundingClientRect(), cell=i===null?bounds:buttons[i].getBoundingClientRect();
    const pointer=event&&event.detail>0&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY);
    const x=pointer?event.clientX-bounds.left:cell.left-bounds.left+cell.width/2;
    const y=pointer?event.clientY-bounds.top:cell.top-bounds.top+cell.height/2;
    const effect=document.createElement('div'); effect.className='cj-impact '+type;
    effect.style.left=(x/bounds.width*100)+'%'; effect.style.top=(y/bounds.height*100)+'%';
    let markup='<i class="cj-burst"></i><i class="cj-hit-cross"></i>';
    if(type==='target') {
      markup+='<i class="cj-pixel-ring"></i><i class="cj-impact-star"></i><span class="cj-hit-spirit" style="--gx:'+(cell.left-bounds.left+cell.width/2-32-x)+'px;--gy:'+(cell.top-bounds.top+cell.height/2-36-y)+'px">'+ghost(type)+'</span>';
      for(let n=0;n<22;n++) {
        const angle=n*Math.PI/11, distance=75+Math.random()*110;
        markup+='<i class="cj-fragment" style="--dx:'+Math.round(Math.cos(angle)*distance)+'px;--dy:'+Math.round(Math.sin(angle)*distance)+'px"></i>';
      }
      for(let n=0;n<7;n++) {
        const angle=n*Math.PI*2/7;
        markup+='<i class="cj-smoke" style="--dx:'+Math.round(Math.cos(angle)*94)+'px;--dy:'+Math.round(Math.sin(angle)*80-18)+'px"></i>';
      }
      markup+='<span class="cj-hit-text">'+(combo>1?combo+' COMBO!':'PERFECT!')+(bonus?'<small>+'+(bonus/1000).toFixed(2)+'초</small>':'')+'</span>';
    } else {
      markup+='<span class="cj-hit-text">'+(type==='decoy'?'앗!':'MISS')+'</span>';
    }
    effect.innerHTML=markup; effects.append(effect);
    effect.addEventListener('animationend',e=>{if(e.target===effect)effect.remove();});
    while(effects.children.length>16) effects.firstElementChild.remove();
    shotSound(type,combo);
  }
  function clearEffects() {
    effects.replaceChildren();
    clearHaunts();
    voices.forEach(voice=>{try{voice.stop();}catch{}});
    voices.clear();
  }
  function clearHaunts() {
    hauntTimers.forEach(id=>clearTimeout(id));hauntTimers.clear();haunts.replaceChildren();
  }
  function summonHaunt() {
    if(phase!=='hunt'||!config.haunt.enabled) return;
    const limit=combo>=config.haunt.extraAtCombo||current.pressure>=config.haunt.extraAtProgress?config.haunt.max:1;
    if(haunts.children.length>=limit) return;
    const occupied=new Set(Array.from(haunts.children,node=>Number(node.dataset.row)));
    const rows=Array.from(new Set(board.flatMap((type,i)=>type==='target'&&!caught.has(i)?[Math.floor(i/3)]:[]))).filter(row=>!occupied.has(row));
    if(!rows.length) return;
    const row=rows[Math.floor(Math.random()*rows.length)],bounds=room.getBoundingClientRect(),cell=buttons[row*3].getBoundingClientRect();
    const lane=document.createElement('div');lane.className='cj-haunt';lane.dataset.row=String(row);
    const reverse=hauntSerial++%2===1,travel=Math.round((config.haunt.travelStart-(config.haunt.travelStart-config.haunt.travelMin)*current.pressure)*1000);
    lane.style.setProperty('--warning',config.haunt.warning*1000+'ms');
    lane.dataset.direction=reverse?'left':'right';lane.style.top=(cell.top-bounds.top+cell.height/2)+'px';
    lane.style.setProperty('--from',(reverse?bounds.width+70:-70)+'px');
    lane.style.setProperty('--to',(reverse?-70:bounds.width+70)+'px');lane.style.setProperty('--travel',travel+'ms');
    const warning=document.createElement('span');warning.className='cj-haunt-warning';warning.textContent='!';warning.setAttribute('aria-hidden','true');
    const runner=document.createElement('button');runner.type='button';runner.className='cj-haunt-runner cursor-interaction';runner.setAttribute('aria-label','돌진하는 뿔 유령 · 누르면 게임 종료');runner.innerHTML=ghost('decoy');
    runner.addEventListener('click',event=>{
      event.stopPropagation();if(phase!=='hunt')return;
      if(performance.now()>=deadline){endRun('timeout');return;}
      const r=runner.getBoundingClientRect(),b=room.getBoundingClientRect();
      const point={x:event.detail>0?event.clientX-b.left:r.left-b.left+r.width/2,y:event.detail>0?event.clientY-b.top:r.top-b.top+r.height/2};
      shotSound('decoy');endRun('decoy',null,point);
    });
    lane.append(warning);lane.append(runner);haunts.append(lane);shotSound('haunt');
    const cleanup=setTimeout(()=>{hauntTimers.delete(cleanup);lane.remove();summonHaunt();},config.haunt.warning*1000+travel);
    hauntTimers.add(cleanup);
  }
  function curse() {
    if(!config.effects.fogEnabled) return;
    const veil=document.createElement('div');veil.className='cj-curse';veil.dataset.side=caught.size%2?'left':'right';
    veil.style.setProperty('--fog',config.effects.fogDuration+'s');
    effects.append(veil);veil.addEventListener('animationend',event=>{if(event.target===veil)veil.remove();});
  }
  find('sound').addEventListener('click',()=>{soundOn=!soundOn;updateSoundButton();if(soundOn)enableAudio();saveState();});
  room.addEventListener('click',event=>choose(null,event));
  function stopTimer() { clearInterval(timer);clearTimeout(phaseTimer);timer=null;phaseTimer=null; }
  function after(ms,callback) {
    stopTimer(); deadline=performance.now()+ms;
    phaseTimer=setTimeout(()=>{phaseTimer=null;callback();},ms);
  }
  function setMessage(message) { find('feedback').textContent=message; }
  function paint() {
    room.dataset.phase=phase;
    balanceButton.disabled=!['ready','over'].includes(phase);
    if(phase!=='hunt') { root.dataset.urgent='false';action.dataset.combo=''; }
    find('score').textContent='명중 '+score;
    find('best').textContent='최고 '+Math.max(best,score);
    const revealed=['ready','memory','laugh','scare-reveal','scare-pop','over'].includes(phase);
    buttons.forEach((button,i)=>{
      const show=phase==='tremble'?board[i]==='decoy':revealed;
      const wrong=tried.has(i)&&!caught.has(i);
      button.disabled=phase!=='hunt';
      button.className='cj-spot cursor-interaction'+(caught.has(i)?' is-caught':wrong?' is-mistake':'')+(i===spooked?' is-spooked':'');
      button.innerHTML=(show&&board[i]!=='empty'?ghost(board[i]):'')+(caught.has(i)?'<span class="cj-mark" aria-hidden="true">✓</span>':wrong?'<span class="cj-mark" aria-hidden="true">×</span>':'')+(phase==='laugh'&&board[i]!=='empty'?'<span class="cj-ha" aria-hidden="true">'+(i%2?'하하핫!':'으하하!')+'</span>':'')+(phase==='tremble'&&board[i]==='decoy'?'<span class="cj-fear" aria-hidden="true">덜덜…</span><i class="cj-sweat" aria-hidden="true"></i>':'');
      const visibleName=caught.has(i)?'명중 완료':wrong?'이미 확인한 자리':show?({target:'하얀 고양이 유령',decoy:'보라색 뿔 유령',empty:'빈자리'}[board[i]]):'숨겨진 자리';
      button.setAttribute('aria-label',(Math.floor(i/3)+1)+'행 '+(i%3+1)+'열, '+visibleName);
    });
    find('banner').hidden=phase!=='over';
    find('ready').hidden=phase!=='prepare';
  }
  function clockValue(remaining) {
    find('clock').textContent=remaining.toFixed(2)+'초';
    find('time-fill').style.width=Math.min(100,Math.max(0,remaining/duration*100))+'%';
    root.dataset.urgent=String(phase==='hunt'&&remaining<=1);
    if(phase==='hunt'&&combo>0) {
      const gap=performance.now()-lastHit;
      action.style.setProperty('--chain',Math.max(0,1-gap/(config.combo.window*1000))*100+'%');
      if(gap>config.combo.window*1000) {
        combo=0;lastHit=-Infinity;action.dataset.combo='';
        action.textContent='다시 2연속 → 시간 회복';
        setMessage('콤보 끊김! 빠르게 이어 맞혀요.');
      }
    }
    if(phase==='hunt'&&remaining>0&&remaining<=config.effects.heartbeatBelow&&performance.now()-lastPulse>=config.effects.heartbeatInterval*1000) { lastPulse=performance.now();shotSound('pulse'); }
  }
  function armExpiry(onEnd) {
    clearTimeout(phaseTimer);
    phaseTimer=setTimeout(()=>{stopTimer();clockValue(0);onEnd();},Math.max(0,deadline-performance.now()));
  }
  function startClock(seconds,onEnd) {
    stopTimer(); duration=seconds; deadline=performance.now()+seconds*1000;
    clockValue(seconds);
    timer=setInterval(()=>{
      const remaining=Math.max(0,(deadline-performance.now())/1000);
      clockValue(remaining);
    },25);
    armExpiry(onEnd);
  }
  function beginCycle() {
    stopTimer(); clearEffects(); caught=new Set(); tried=new Set(); combo=0;lastHit=-Infinity;hauntSerial=0;lastPulse=-Infinity;
    spooked=null;find('fail-splash').replaceChildren();room.dataset.failure='';
    const elapsed=Math.max(0,performance.now()-runStarted);
    current=difficultyAt(config,elapsed,cycle);
    const ramp=current.pressure;
    room.dataset.pace=ramp===1?'max':'rising';
    find('rules').textContent='노출 '+current.memory.toFixed(2)+'초 · 기본 '+current.hunt.toFixed(2)+'초 · '+(ramp===1?'난이도 고정':Math.floor(elapsed/1000)+'/'+config.difficulty.rampSeconds+'초');
    const order=Array.from({length:12},(_,i)=>i);
    for(let i=order.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
    board=Array(12).fill('empty');
    order.slice(0,current.targets).forEach(i=>board[i]='target');
    order.slice(current.targets,current.targets+current.decoys).forEach(i=>board[i]='decoy');
    phase='prepare'; paint();
    find('phase').textContent='집중 · 하얀 유령 '+current.targets+'마리';
    find('clock').textContent=current.memory.toFixed(2)+'초 노출';
    find('time-fill').style.width='100%';
    find('room-caption').textContent='찰나를 놓치지 마세요';
    find('ready-time').textContent=current.memory.toFixed(2)+'초만 보여요';
    setMessage('눈 깜짝할 사이! 하얀 유령만 기억하세요.');
    action.disabled=true; action.textContent='집중! 곧 나타나요';
    after((cycle===0?config.transition.firstPrepare:config.transition.prepare)*1000,()=>{
      phase='memory';paint();shotSound('reveal');
      find('phase').textContent='지금! '+current.targets+'마리 기억';
      action.textContent='기억해!';
      startClock(current.memory,()=>{
        phase='hide';paint();find('phase').textContent='암전!';find('clock').textContent='';
        after(config.transition.blackout*1000,beginHunt);
      });
    });
  }
  function beginHunt() {
    phase='hunt'; paint();
    find('phase').textContent='찾아봐요 · '+caught.size+' / '+current.targets+'마리';
    find('room-caption').textContent=config.haunt.enabled?'돌진하는 뿔 유령도 쏘면 안 돼요!':'기억한 하얀 유령만 쏘세요!';
    setMessage((config.haunt.enabled?'분신을 피하고 ':'')+config.combo.window.toFixed(2)+'초 안에 연속 명중!');
    action.textContent='빠르게 2연속 → 시간 회복';
    startClock(current.hunt,()=>endRun('timeout'));
    summonHaunt();
  }
  function choose(i,event) {
    if(phase!=='hunt') return;
    const now=performance.now();
    if(now>=deadline) { endRun('timeout'); return; }
    const type=i===null||tried.has(i)?'empty':board[i];
    let bonus=0;
    if(type==='target') {
      combo=now-lastHit<=config.combo.window*1000?combo+1:1;lastHit=now;
      if(combo>=2) {
        bonus=comboBonus(config,combo);
        deadline+=bonus;armExpiry(()=>endRun('timeout'));
      }
      action.dataset.combo='active';action.style.setProperty('--chain','100%');
      clockValue((deadline-now)/1000);
    } else combo=0;
    fire(i,event,type,bonus);
    if(i!==null) tried.add(i);
    if(type==='target') {
      caught.add(i);
      score++;
      setMessage(bonus?combo+' COMBO! +'+(bonus/1000).toFixed(2)+'초 회복!':'명중! '+config.combo.window.toFixed(2)+'초 안에 다음 유령!');
    } else { endRun(type,i);return; }
    paint();
    find('phase').textContent='찾아봐요 · '+caught.size+' / '+current.targets+'마리';
    action.textContent=combo+' COMBO · '+(current.targets-caught.size)+'마리 남음';
    if(caught.size===current.targets) {
      stopTimer();clearHaunts();phase='impact';paint();find('clock').textContent='';
      action.textContent='전부 명중!';setMessage('살아남은 뿔 유령들이 겁먹었어요!');
      after(config.transition.impact*1000,()=>{
        effects.replaceChildren();phase='tremble';paint();shotSound('shiver');
        find('phase').textContent='전부 명중! 뿔 유령들이 덜덜…';
        find('room-caption').textContent='휴… 우리 차례는 아니었네!';
        action.textContent='덜덜덜… 다음 유령이 온다!';
        after(config.transition.tremble*1000,()=>{cycle++;beginCycle();});
      });
    } else { curse();summonHaunt(); }
  }
  function endRun(reason,i=null,hitPoint=null) {
    if(phase!=='hunt') return;
    stopTimer();clearHaunts();
    effects.replaceChildren();room.dataset.failure=reason;
    phase=reason==='empty'?'laugh':reason==='decoy'?'scare-reveal':'over';
    spooked=reason==='decoy'?i:null;
    saveResult(reason);paint();
    find('clock').textContent='';find('time-fill').style.width='0%';
    find('phase').textContent='게임 종료 · '+score+'마리 명중';
    action.disabled=true;
    if(reason==='empty') {
      find('room-caption').textContent='으하하핫! 거긴 빈자리야~';
      setMessage('으하하핫! 유령들이 비웃어요!');action.textContent='유령들이 비웃는 중…';
      shotSound('laugh');after(1350,showResult);
    } else if(reason==='decoy') {
      if(hitPoint) {
        const mark=document.createElement('span');mark.className='cj-danger-mark';mark.innerHTML=ghost('decoy')+'<b>×</b>';mark.style.left=hitPoint.x+'px';mark.style.top=hitPoint.y+'px';find('fail-splash').append(mark);
      }
      find('room-caption').textContent='킥킥킥! 나를 쐈네?';setMessage('킥킥킥! 뿔 유령이 다가와요!');action.textContent='앗! 뿔 유령이다!';
      shotSound('snicker');
      after(350,()=>{
        find('fail-splash').replaceChildren();
        phase='scare-pop';paint();
        const bounds=room.getBoundingClientRect(),cell=i===null?null:buttons[i].getBoundingClientRect();
        const x=hitPoint?hitPoint.x:cell.left-bounds.left+cell.width/2,y=hitPoint?hitPoint.y:cell.top-bounds.top+cell.height/2;
        const actor=document.createElement('div');actor.className='cj-pop-actor';
        actor.style.left=x+'px';actor.style.top=y+'px';
        actor.style.setProperty('--tx',(bounds.width/2-x)+'px');actor.style.setProperty('--ty',(bounds.height*.44-y)+'px');
        actor.innerHTML=ghost('decoy');find('fail-splash').append(actor);
        const caption=document.createElement('div');caption.className='cj-pop-caption';caption.innerHTML='<b>킥킥킥!</b><span>나를 쏘면 안 되지~</span>';find('fail-splash').append(caption);
        shotSound('boo');after(1100,showResult);
      });
    } else showResult();
    function showResult() {
      phase='over';paint();
      find('banner-kicker').textContent='GAME OVER';
      find('banner-title').textContent=({empty:'헛발! 유령들의 승리!',decoy:'뿔 유령을 맞혔어요!',timeout:'시간이 다 됐어요!'})[reason];
      find('room-caption').textContent=reason==='empty'?'으하하핫! 다음엔 잘 조준해봐~':reason==='decoy'?'다음에는 하얀 유령만!':'기억한 유령을 놓쳤어요';
      action.disabled=false;action.textContent='다시 도전 →';
      setMessage(score+'마리 명중 · 최고 기록 '+best+'마리');
    }
  }
  action.addEventListener('click',()=>{
    if(!['ready','over'].includes(phase)||balanceDialog.open) return;
    config=structuredClone(pendingConfig);
    stopTimer();clearEffects();enableAudio();cycle=0;score=0;runStarted=performance.now();
    beginCycle();
  });
  function readySettings() {
    if(phase==='ready') {
      find('clock').textContent=pendingConfig.difficulty.memoryStart.toFixed(2)+'초 기억';
      find('feedback').textContent=(pendingConfig.haunt.enabled?'움직이는 뿔 유령도 피하세요! ':'')+pendingConfig.combo.window.toFixed(2)+'초 연속 명중.';
    }
    find('rules').textContent='콤보 +'+pendingConfig.combo.bonusStart.toFixed(2)+'~'+pendingConfig.combo.bonusMax.toFixed(2)+'초 · 한 번의 오발이면 끝!';
  }
  const editor=createBalanceEditor({
    getConfig:()=>pendingConfig,
    onOpen:()=>['ready','over'].includes(phase),
    onSave:value=>{
      pendingConfig=validateConfig(value);
      writeStorage(BALANCE_KEY,JSON.stringify(pendingConfig)===JSON.stringify(DEFAULT_CONFIG)?null:pendingConfig);
      readySettings();
    }
  });
  balanceButton.addEventListener('click',()=>editor.open());
  readySettings();paint();action.disabled=false;action.textContent='유령 사냥 시작 →';
})();
