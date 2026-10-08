import {DEFAULT_CONFIG,validateConfig,parseBalanceDB} from './balance-config.mjs?v=20261008-bomb-combo';
import {createBalanceEditor} from './balance-editor.mjs?v=20261008-bomb-combo';
import {difficultyAt,comboBonus,hitSlot,createBoard,coinsPerGhost,comboCoinMultiplier,MAX_COMBO} from './game-core.mjs?v=20261008-combo50';
import {COLLECTIONS} from './collections.mjs';

(() => {
  const root = document.getElementById('cj-ghost-room');
  const uiNodes=new Map();
  const find = id => {
    if(!uiNodes.has(id)) uiNodes.set(id,root.querySelector('#cj-' + id));
    return uiNodes.get(id);
  };
  const room = find('room'), spots = find('spots'), action = find('action'), effects = find('effects');
  const pointerInput=typeof window.PointerEvent==='function';
  const STATE_KEY='catjump-memory-room-state-v1', BALANCE_KEY='catjump-memory-room-balance-v1', LOBBY_KEY='catjump-event-lobby-v1';
  const balanceButton=document.getElementById('balance-open'), balanceDialog=document.getElementById('balance-dialog');
  const rulesDialog=document.getElementById('rules-dialog');
  const pauseDialog=document.getElementById('pause-dialog');
  const eventDialog=document.getElementById('event-dialog');
  const continueDialog=document.getElementById('continue-dialog'), resultDialog=document.getElementById('result-dialog'), collectionDialog=document.getElementById('collection-dialog');
  const PROGRESS_KEY='catjump-event-progress-v1';
  const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
  function writeStorage(key,value) {
    try { if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,JSON.stringify(value)); }
    catch { root.dataset.storageFailed='true';find('storage-note').textContent='저장이 제한되어 새로고침하면 기록·보상·수집품이 사라질 수 있어요.'; }
  }
  let pendingConfig=structuredClone(DEFAULT_CONFIG);
  try {
    const saved=readStorage(BALANCE_KEY);
    if(saved) {
      pendingConfig=parseBalanceDB(JSON.stringify(saved));
      if(pendingConfig.combo.window===.45) pendingConfig.combo.window=DEFAULT_CONFIG.combo.window;
      // Upgrade the former default READY times without losing other saved tuning.
      if(saved.haunt) {
        if(pendingConfig.transition.firstPrepare===.25) pendingConfig.transition.firstPrepare=DEFAULT_CONFIG.transition.firstPrepare;
        if(pendingConfig.transition.prepare===.12) pendingConfig.transition.prepare=DEFAULT_CONFIG.transition.prepare;
      }
      // Refresh former transition defaults while preserving custom timing.
      for(const [key,oldValue] of [['prepare',.65],['impact',.08],['tremble',.28]]) {
        if(pendingConfig.transition[key]===oldValue) pendingConfig.transition[key]=DEFAULT_CONFIG.transition[key];
      }
    }
  } catch { /* Ignore obsolete or invalid local settings. */ }
  let config=structuredClone(pendingConfig);
  const savedLobby=readStorage(LOBBY_KEY);
  let tickets=Number.isInteger(savedLobby?.tickets)&&savedLobby.tickets>=0&&savedLobby.tickets<=30?savedLobby.tickets:3;
  let eventConfirm=null;
  const storedProgress=readStorage(PROGRESS_KEY);
  const profile={wallet:Number.isSafeInteger(storedProgress?.wallet)&&storedProgress.wallet>=0?storedProgress.wallet:0,
    collection:COLLECTIONS.filter(item=>Array.isArray(storedProgress?.collection)&&storedProgress.collection.includes(item.id)).map(item=>item.id),
    characterClaimed:storedProgress?.characterClaimed===true};
  if(profile.collection.length!==COLLECTIONS.length) profile.characterClaimed=false;
  let runItems=[],roundItem=null,continueUsed=false,settled=false,doubled=false,runElapsed=0,legStarted=null,adTimer=null,adRunning=false;
  let failureReason=null,selectedItem=COLLECTIONS[0].id;
  let runCoins=0,highestCycle=0;
  const itemIcon=id=>'<img class="collection-icon" src="assets/collection-'+id+'.svg" alt="">';
  const ghost = type => '<span class="cj-ghost '+(type==='collection'?'target collector':type)+'" aria-hidden="true">'+(type==='collection'&&roundItem?'<img class="collection-carry" src="assets/collection-'+roundItem+'.svg" alt="">':'')+'</span>';
  let buttons=[];
  function resizeGrid(size) {
    spots.style.setProperty('--grid-size',String(size));root.dataset.gridSize=String(size);
    room.setAttribute('aria-label','유령이 나타나는 '+size+'행 '+size+'열의 방');
    if(buttons.length===size**2) return;
    spots.replaceChildren();
    buttons=Array.from({length:size**2},(_,i)=>{
      const button=document.createElement('button');button.type='button';button.className='cj-spot cursor-interaction';
      button.addEventListener('pointerdown',event=>pointerShot(i,event));
      button.addEventListener('click',event=>clickShot(i,event));spots.append(button);return button;
    });
  }
  const previewBoard=['target','empty','decoy','empty','target','empty','empty','empty','target'];
  let phase='ready', cycle=0, score=0, current=difficultyAt(config,0), spooked=null, board=previewBoard.slice();
  let caught=new Set(), tried=new Set(), timer=null, phaseTimer=null, phaseCallback=null, paused=null, deadline=0, duration=0, best=0;
  let soundOn=true, audio=null, audioMaster=null, lastSummary=null, shotNoise=null;
  let combo=0, roundCombo=0, lastHit=-Infinity, lastPulse=-Infinity;
  const activeImpacts=[];
  let activeFog=null,shotGeometry=null;
  const invalidateGeometry=()=>{shotGeometry=null;};
  window.addEventListener?.('resize',invalidateGeometry,{passive:true});
  window.addEventListener?.('scroll',invalidateGeometry,{passive:true,capture:true});
  window.visualViewport?.addEventListener('resize',invalidateGeometry,{passive:true});
  window.visualViewport?.addEventListener('scroll',invalidateGeometry,{passive:true});
  function geometry() {
    if(!shotGeometry) shotGeometry={room:room.getBoundingClientRect(),cells:buttons.map(button=>button.getBoundingClientRect())};
    return shotGeometry;
  }
  // Preserve the reward chain across waves, but keep time recovery local to a wave.
  const comboWindow=()=>Math.max(config.combo.window,roundCombo===0 ? .8 : 0)*1000;
  const comboTier=()=>combo>=MAX_COMBO?3:combo>=25?2:combo>=10?1:0;
  function resetCombo() { combo=0;roundCombo=0;lastHit=-Infinity; }
  resizeGrid(3);
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
    lastSummary={game:'캣점프 유령이 숨은 밤',mode:'무한 사냥 · 판당 이어하기 1회',result:'게임 종료',reason:({decoy:'폭탄 유령 명중',timeout:'시간 초과',quit:'도전 종료'})[reason],caught:score,best,collections:runItems.slice(),reward:runCoins*(doubled?2:1),playTime:Math.floor(runElapsed/1000)};
    saveState();
  }
  function saveState() {
    writeStorage(STATE_KEY,{best,soundOn,result:lastSummary});
  }
  function updateSoundButton() {
    find('sound').textContent=soundOn?'♪ ON':'♪ OFF';
    find('sound').setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');
    find('sound').setAttribute('aria-pressed',String(soundOn));
    const lobbySound=document.getElementById('lobby-sound');
    lobbySound.textContent=soundOn?'♪ ON':'♪ OFF';
    lobbySound.setAttribute('aria-label',soundOn?'사운드 켜짐':'사운드 꺼짐');
    lobbySound.setAttribute('aria-pressed',String(soundOn));
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
    if(type==='reveal') { tone(150,760,0,.11,.16,'triangle');tone(360,1120,.025,.09,.08,'sine');return; }
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
    if(type==='target'||type==='collection') {
      const pitch=1+Math.min(chain-1,4)*.13;
      tone(880*pitch,520*pitch,.025,.09,.34);
      tone(1320*pitch,990*pitch,.075,.15,.22);
      tone(1760*pitch,1320*pitch,.12,.19,.13,'triangle');
    } else if(type==='decoy') { tone(210,65,.02,.26,.45); tone(160,55,.07,.18,.28); }
    else tone(95,48,.02,.08,.3,'triangle');
  }
  function fire(i,event,type,bonus=0,coinReward=0) {
    const rects=geometry(),bounds=rects.room,cell=i===null?bounds:rects.cells[i];
    const pointer=event&&(event.type==='pointerdown'||event.detail>0)&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY);
    const x=pointer?event.clientX-bounds.left:cell.left-bounds.left+cell.width/2;
    const y=pointer?event.clientY-bounds.top:cell.top-bounds.top+cell.height/2;
    const effect=document.createElement('div'); effect.className='cj-impact '+type;
    effect.dataset.comboTier=String(comboTier());
    effect.style.setProperty('--combo-scale',String(1+Math.min(8,Math.max(0,combo-2))*.1));
    effect.style.setProperty('--label-x',(Math.max(104,Math.min(bounds.width-104,x))-x)+'px');
    effect.style.left=(x/bounds.width*100)+'%'; effect.style.top=(y/bounds.height*100)+'%';
    let markup='<i class="cj-burst"></i><i class="cj-hit-cross"></i>';
    if(type==='target'||type==='collection') {
      markup+='<i class="cj-pixel-ring"></i><i class="cj-impact-star"></i><span class="cj-hit-spirit" style="--gx:'+(cell.left-bounds.left+cell.width/2-32-x)+'px;--gy:'+(cell.top-bounds.top+cell.height/2-36-y)+'px">'+ghost(type)+'</span>';
      // Keep the animation budget fixed even during long MAX chains.
      const fragments=12;
      for(let n=0;n<fragments;n++) {
        const angle=n*Math.PI*2/fragments, distance=65+Math.random()*Math.min(150,85+combo*8);
        markup+='<i class="cj-fragment" style="--dx:'+Math.round(Math.cos(angle)*distance)+'px;--dy:'+Math.round(Math.sin(angle)*distance)+'px"></i>';
      }
      for(let n=0;n<2;n++) {
        const angle=n*Math.PI;
        markup+='<i class="cj-smoke" style="--dx:'+Math.round(Math.cos(angle)*94)+'px;--dy:'+Math.round(Math.sin(angle)*80-18)+'px"></i>';
      }
      markup+='<span class="cj-hit-text">'+(type==='collection'?'컬렉션 획득!':combo>1?'<b class="cj-combo-number">'+combo+'</b> COMBO!':'PERFECT!')+(bonus?'<small>+'+(bonus/1000).toFixed(2)+'초</small>':'')+'<small class="cj-hit-coins">+'+coinReward+' 코인'+(comboCoinMultiplier(combo)>1?' · ×'+comboCoinMultiplier(combo):'')+'</small></span>';
    } else {
      markup+='<span class="cj-hit-text">'+(type==='decoy'?'앗!':'MISS<small>−'+config.difficulty.missPenalty.toFixed(2)+'초</small><em>으하하!</em>')+'</span>';
    }
    effect.innerHTML=markup;
    if(activeImpacts.length>=4) activeImpacts.shift().remove();
    activeImpacts.push(effect);effects.append(effect);
    effect.addEventListener('animationend',e=>{
      if(e.target!==effect) return;
      effect.remove();const index=activeImpacts.indexOf(effect);
      if(index!==-1) activeImpacts.splice(index,1);
    });
    shotSound(type,combo);
  }
  function clearVisualEffects() {
    effects.replaceChildren();
    activeImpacts.length=0;activeFog=null;
  }
  function clearEffects() {
    clearVisualEffects();
    silence();
  }
  function silence() {
    voices.forEach(voice=>{try{voice.stop();}catch{}});
    voices.clear();
  }
  function curse() {
    if(!config.effects.fogEnabled||activeFog) return;
    const veil=document.createElement('div');veil.className='cj-curse';veil.dataset.side=caught.size%2?'left':'right';
    veil.style.setProperty('--fog',config.effects.fogDuration+'s');
    activeFog=veil;effects.append(veil);
    veil.addEventListener('animationend',event=>{
      if(event.target!==veil) return;
      veil.remove();if(activeFog===veil)activeFog=null;
    });
  }
  function toggleSound() { soundOn=!soundOn;updateSoundButton();if(soundOn)enableAudio();saveState(); }
  find('sound').addEventListener('click',toggleSound);
  document.getElementById('lobby-sound').addEventListener('click',toggleSound);
  function pointerShot(i,event) {
    if(event.button!==0) return;
    event.preventDefault();event.stopPropagation();
    // Every contact fires on arrival, including overlapping non-primary fingers.
    choose(i,event);
  }
  function clickShot(i,event) {
    event.stopPropagation();
    // Keep keyboard/assistive activation, but never fire again on pointer release.
    if(!pointerInput||(event.detail===0&&!event.pointerType)) choose(i,event);
  }
  room.addEventListener('pointerdown',event=>pointerShot(null,event));
  room.addEventListener('click',event=>clickShot(null,event));
  room.addEventListener('contextmenu',event=>{if(phase==='hunt')event.preventDefault();});
  function stopTimer() { clearInterval(timer);clearTimeout(phaseTimer);timer=null;phaseTimer=null;phaseCallback=null; }
  function after(ms,callback) {
    stopTimer(); deadline=performance.now()+ms;
    phaseCallback=()=>{phaseTimer=null;phaseCallback=null;callback();};
    phaseTimer=setTimeout(phaseCallback,ms);
  }
  function setMessage(message) { find('feedback').textContent=message; }
  function paint() {
    if(room.dataset.phase!==phase) room.dataset.phase=phase;
    if(root.dataset.phase!==phase) root.dataset.phase=phase;
    find('pause').disabled=!['prepare','memory','hide','hunt','impact','tremble'].includes(phase);
    balanceButton.disabled=!['ready','over'].includes(phase);
    if(phase!=='hunt') { root.dataset.urgent='false';action.dataset.combo=''; }
    updateComboDisplay();
    find('score').textContent='명중 '+score;
    find('best').textContent='최고 '+Math.max(best,score);
    find('collection-count').textContent='수집 '+runItems.length+' / 2';
    find('coin-rate').textContent='기본 '+coinsPerGhost(highestCycle)+' 코인';
    find('run-coins').textContent=runCoins.toLocaleString('ko-KR');
    const revealed=['ready','memory','scare-reveal','scare-pop','continue','over'].includes(phase);
    buttons.forEach((button,i)=>{
      const show=phase==='tremble'?board[i]==='decoy':revealed;
      const wrong=tried.has(i)&&!caught.has(i);
      if(button.disabled!==(phase!=='hunt')) button.disabled=phase!=='hunt';
      const className='cj-spot cursor-interaction'+(caught.has(i)?' is-caught':wrong?' is-mistake':'')+(i===spooked?' is-spooked':'');
      if(button.className!==className) button.className=className;
      const markup=(show&&board[i]!=='empty'?ghost(board[i]):'')+(caught.has(i)?'<span class="cj-mark" aria-hidden="true">✓</span>':wrong?'<span class="cj-mark" aria-hidden="true">×</span>':'')+(phase==='tremble'&&board[i]==='decoy'?'<span class="cj-fear" aria-hidden="true">덜덜…</span><i class="cj-sweat" aria-hidden="true"></i>':'');
      if(button.innerHTML!==markup) button.innerHTML=markup;
      const visibleName=caught.has(i)?'명중 완료':wrong?'이미 확인한 자리':show?({target:'하얀 고양이 유령',collection:'컬렉션을 든 유령 · 선택 목표',decoy:'폭탄 유령',empty:'빈자리'}[board[i]]):'숨겨진 자리';
      const label=(Math.floor(i/current.gridSize)+1)+'행 '+(i%current.gridSize+1)+'열, '+visibleName;
      if(button.getAttribute('aria-label')!==label) button.setAttribute('aria-label',label);
    });
    find('banner').hidden=phase!=='over';
    find('ready').hidden=phase!=='prepare';
  }
  function clockValue(remaining) {
    find('clock').textContent=remaining.toFixed(2)+'초';
    find('time-fill').style.transform='scaleX('+Math.min(1,Math.max(0,remaining/duration))+')';
    const urgent=String(phase==='hunt'&&remaining<=1);
    if(root.dataset.urgent!==urgent) root.dataset.urgent=urgent;
    if(phase==='memory'&&roundItem&&remaining<=duration*.5) {
      const optional=buttons[board.indexOf('collection')];
      if(optional) { optional.className='cj-spot cursor-interaction optional-faded';optional.setAttribute('aria-label','컬렉션 유령이 숨은 자리'); }
    }
    if(phase==='hunt'&&combo>0) {
      const gap=performance.now()-lastHit;
      const progress=String(Math.max(0,1-gap/comboWindow()));
      action.style.setProperty('--chain',progress);
      find('combo-display').style.setProperty('--chain',progress);
      if(gap>comboWindow()) {
        resetCombo();action.dataset.combo='';
        updateComboDisplay();
        action.textContent='다시 2연속 → 시간 회복';
        setMessage('콤보 끊김! 빠르게 이어 맞혀요.');
      }
    }
    if(phase==='hunt'&&remaining>0&&remaining<=config.effects.heartbeatBelow&&performance.now()-lastPulse>=config.effects.heartbeatInterval*1000) { lastPulse=performance.now();shotSound('pulse'); }
  }
  function updateComboDisplay() {
    const display=find('combo-display');
    display.hidden=combo<2||!['hunt','impact'].includes(phase);display.textContent=combo+(combo===MAX_COMBO?' MAX':' COMBO');
    display.dataset.tier=String(comboTier());
    display.dataset.beat=String(score%2);
    display.style.setProperty('--combo-scale',String(1+Math.min(8,Math.max(0,combo-2))*.09));
    const multiplier=['prepare','memory','hide','hunt','impact','tremble'].includes(phase)?comboCoinMultiplier(combo):1;
    find('coin-multiplier').textContent='코인 ×'+multiplier;
    find('coin-multiplier').dataset.tier=String(multiplier>1?comboTier():0);
  }
  function armExpiry(onEnd) {
    clearTimeout(phaseTimer);
    phaseCallback=()=>{stopTimer();clockValue(0);onEnd();};
    phaseTimer=setTimeout(phaseCallback,Math.max(0,deadline-performance.now()));
  }
  function tickClock() {
    clockValue(Math.max(0,(deadline-performance.now())/1000));
  }
  function startClock(seconds,onEnd) {
    stopTimer(); duration=seconds; deadline=performance.now()+seconds*1000;
    clockValue(seconds);
    timer=setInterval(tickClock,25);
    armExpiry(onEnd);
  }
  find('pause').addEventListener('click',()=>{
    if(paused||find('pause').disabled||!phaseCallback) return;
    const now=performance.now();
    if(now>=deadline) { const finish=phaseCallback;stopTimer();finish();return; }
    if(timer!==null) tickClock();
    paused={at:now,callback:phaseCallback,clock:timer!==null};
    stopTimer();silence();
    root.dataset.paused=room.dataset.paused='true';
    pauseDialog.showModal();
  });
  function resume() {
    if(!paused) return;
    const saved=paused,elapsed=performance.now()-saved.at;
    deadline+=elapsed;lastHit+=elapsed;lastPulse+=elapsed;
    if(legStarted!==null) legStarted+=elapsed;
    paused=null;root.dataset.paused=room.dataset.paused='false';
    pauseDialog.close();enableAudio();
    phaseCallback=saved.callback;
    if(saved.clock) { tickClock();timer=setInterval(tickClock,25); }
    phaseTimer=setTimeout(phaseCallback,Math.max(0,deadline-performance.now()));
  }
  document.getElementById('pause-resume').addEventListener('click',resume);
  pauseDialog.addEventListener('cancel',event=>{event.preventDefault();resume();});
  function returnToLobby() {
    if(!paused&&phase!=='over') return;
    if(paused) { legStarted+=performance.now()-paused.at;stopRunClock();failureReason='quit';settleRun(); }
    abortAd();resultDialog.close();continueDialog.close();
    stopTimer();clearEffects();paused=null;
    root.dataset.paused=room.dataset.paused='false';pauseDialog.close();
    best=Math.max(best,score);saveState();
    phase='ready';cycle=0;score=0;resetCombo();lastPulse=-Infinity;
    current=difficultyAt(pendingConfig,0);resizeGrid(3);roundItem=null;runItems=[];
    board=previewBoard.slice();caught.clear();tried.clear();spooked=null;
    find('fail-splash').replaceChildren();room.dataset.failure='';
    paint();readySettings();
    find('phase').textContent='찰나를 기억하고, 명중!';find('time-fill').style.transform='scaleX(1)';
    find('room-caption').textContent='9개의 자리 · 유령의 위치를 기억해요';
    action.disabled=false;action.textContent='도전하기 →';
  }
  document.getElementById('pause-quit').addEventListener('click',returnToLobby);
  find('home').addEventListener('click',returnToLobby);
  function beginCycle() {
    invalidateGeometry();
    stopTimer(); clearEffects(); caught=new Set(); tried=new Set(); roundCombo=0;lastHit=-Infinity;lastPulse=-Infinity;
    spooked=null;find('fail-splash').replaceChildren();room.dataset.failure='';
    current=difficultyAt(config,cycle);
    highestCycle=Math.max(highestCycle,cycle);
    if(continueUsed) { current.memory=Math.round(current.memory*1.15*1000)/1000;current.hunt=Math.round(current.hunt*1.15*1000)/1000; }
    resizeGrid(current.gridSize);
    const ramp=current.pressure;
    room.dataset.pace=ramp===1?'max':'rising';
    find('rules').textContent='배치 '+(cycle+1)+' · 기억 '+current.memory.toFixed(2)+'초 · 사격 '+current.hunt.toFixed(2)+'초';
    board=createBoard(current,cycle,Math.random);
    roundItem=null;
    const missing=COLLECTIONS.filter(item=>!profile.collection.includes(item.id));
    if(runItems.length<2&&missing.length&&Math.random()<.05) {
      const empty=board.map((type,i)=>type==='empty'?i:-1).filter(i=>i>=0);
      roundItem=missing[Math.floor(Math.random()*missing.length)].id;
      board[empty[Math.floor(Math.random()*empty.length)]]='collection';
    }
    phase='prepare'; paint();
    find('phase').textContent=current.gridSize+'×'+current.gridSize+' · 흰색 '+current.targets+'마리';
    find('clock').textContent=current.memory.toFixed(2)+'초 노출';
    find('time-fill').style.transform='scaleX(1)';
    find('room-caption').textContent='찰나를 놓치지 마세요';
    setMessage('눈 깜짝할 사이! 하얀 유령만 기억하세요.');
    action.disabled=true; action.textContent='집중! 곧 나타나요';
    after((cycle===0?config.transition.firstPrepare:config.transition.prepare)*1000,()=>{
      phase='memory';paint();shotSound('reveal');
      find('phase').textContent='사라지기까지';
      action.textContent='기억해!';
      startClock(current.memory,()=>{
        phase='hide';paint();find('phase').textContent='암전!';find('clock').textContent='';
        after(config.transition.blackout*1000,beginHunt);
      });
    });
  }
  function beginHunt() {
    if(combo>0) lastHit=performance.now();
    phase='hunt'; paint();
    find('phase').textContent='찾는 시간 · 0 / '+current.targets;
    find('room-caption').textContent='기억한 자리 그대로, 빠르게 연속 명중!';
    setMessage(config.combo.window.toFixed(2)+'초 안에 연속 명중!');
    action.textContent='빠르게 2연속 → 시간 회복';
    startClock(current.hunt,()=>endRun('timeout'));
  }
  function choose(i,event) {
    if(phase!=='hunt'||paused) return;
    if(event&&(event.type==='pointerdown'||event.detail>0)) i=hitSlot(geometry().cells,board,tried,event.clientX,event.clientY);
    const now=performance.now();
    if(now>=deadline) { endRun('timeout'); return; }
    if(i!==null&&tried.has(i)) return;
    const type=i===null?'empty':board[i];
    let bonus=0,coinReward=0;
    if(type==='target'||type==='collection') {
      const linked=combo>0&&now-lastHit<=comboWindow();
      combo=linked?Math.min(MAX_COMBO,combo+1):1;
      roundCombo=linked?roundCombo+1:1;lastHit=now;
      coinReward=coinsPerGhost(highestCycle)*comboCoinMultiplier(combo);
      if(roundCombo>=2) {
        bonus=comboBonus(config,roundCombo);
        deadline+=bonus;armExpiry(()=>endRun('timeout'));
      }
      action.dataset.combo='active';action.style.setProperty('--chain','1');
      clockValue((deadline-now)/1000);
    } else { resetCombo();action.dataset.combo='';action.style.setProperty('--chain','0'); }
    fire(i,event,type,bonus,coinReward);
    if(i!==null) tried.add(i);
    if(type==='target'||type==='collection') {
      caught.add(i);
      score++;
      runCoins+=coinReward;
      if(type==='collection'&&roundItem&&runItems.length<2) {
        runItems.push(roundItem);profile.collection.push(roundItem);saveProgress();
      }
      setMessage(bonus?combo+' COMBO! +'+(bonus/1000).toFixed(2)+'초 회복!':'명중! '+config.combo.window.toFixed(2)+'초 안에 다음 유령!');
    } else if(type==='empty') {
      deadline-=Math.round(config.difficulty.missPenalty*1000);
      paint();clockValue(Math.max(0,(deadline-now)/1000));
      if(now>=deadline) { endRun('timeout');return; }
      armExpiry(()=>endRun('timeout'));
      shotSound('laugh');
      setMessage('빈자리! −'+config.difficulty.missPenalty.toFixed(2)+'초 · 콤보로 만회하세요!');
      action.textContent='다시 2연속 → 시간 회복';
      return;
    } else { endRun(type,i);return; }
    paint();
    const requiredCaught=[...caught].filter(index=>board[index]==='target').length;
    find('phase').textContent='찾는 시간 · '+requiredCaught+' / '+current.targets;
    action.textContent=combo+' COMBO · '+(current.targets-requiredCaught)+'마리 남음';
    if(requiredCaught===current.targets) {
      stopTimer();phase='impact';paint();find('clock').textContent='';
      action.textContent='전부 명중!';setMessage('살아남은 폭탄 유령들이 겁먹었어요!');
      after(config.transition.impact*1000,()=>{
        clearVisualEffects();phase='tremble';paint();shotSound('shiver');
        find('phase').textContent='전부 명중! 폭탄 유령들이 덜덜…';
        find('room-caption').textContent='휴… 우리 차례는 아니었네!';
        action.textContent='덜덜덜… 다음 유령이 온다!';
        after(config.transition.tremble*1000,()=>{cycle++;beginCycle();});
      });
    } else { curse(); }
  }
  function endRun(reason,i=null) {
    if(phase!=='hunt') return;
    stopTimer();
    stopRunClock();failureReason=reason;
    clearVisualEffects();room.dataset.failure=reason;
    phase=reason==='decoy'?'scare-reveal':'over';
    spooked=reason==='decoy'?i:null;
    paint();
    find('clock').textContent='';find('time-fill').style.transform='scaleX(0)';
    find('phase').textContent='게임 종료 · '+score+'마리 명중';
    action.disabled=true;
    if(reason==='decoy') {
      find('room-caption').textContent='킥킥킥! 나를 쐈네?';setMessage('킥킥킥! 폭탄 유령이 다가와요!');action.textContent='앗! 폭탄 유령이다!';
      shotSound('snicker');
      after(80,()=>{
        find('fail-splash').replaceChildren();
        phase='scare-pop';paint();
        const cell=buttons[i].getBoundingClientRect();
        const x=cell.left+cell.width/2,y=cell.top+cell.height/2;
        const actor=document.createElement('div');actor.className='cj-pop-actor';
        actor.style.left=x+'px';actor.style.top=y+'px';
        actor.style.setProperty('--tx',(window.innerWidth/2-x)+'px');actor.style.setProperty('--ty',(window.innerHeight*.44-y)+'px');
        actor.style.setProperty('--pop-scale',Math.min(window.innerWidth*.92,window.innerHeight*.78,520)/64);
        actor.innerHTML=ghost('decoy');find('fail-splash').append(actor);
        const caption=document.createElement('div');caption.className='cj-pop-caption';caption.innerHTML='<b>킥킥킥!</b><span>나를 쏘면 안 되지~</span>';find('fail-splash').append(caption);
        shotSound('boo');after(900,showResult);
      });
    } else showResult();
    function showResult() {
      find('fail-splash').replaceChildren();silence();
      if(continueUsed) showFinalResult();
      else {
        phase='continue';paint();
        document.getElementById('continue-watch').disabled=false;
        document.getElementById('continue-watch').textContent='▷ 광고 보고 이어하기';
        document.getElementById('continue-status').textContent='프로토타입에서는 3초 광고 체험 후 이어집니다.';
        continueDialog.showModal();
      }
    }
  }
  function saveProgress() {
    writeStorage(PROGRESS_KEY,profile);
    document.getElementById('lobby-currency').textContent=profile.wallet.toLocaleString('ko-KR');
  }
  function stopRunClock() {
    if(legStarted!==null) { runElapsed+=Math.max(0,performance.now()-legStarted);legStarted=null; }
  }
  function settleRun() {
    if(settled) return;
    settled=true;profile.wallet=Math.min(Number.MAX_SAFE_INTEGER,profile.wallet+runCoins);
    saveProgress();saveResult(failureReason);
  }
  function renderResult() {
    const seconds=Math.floor(runElapsed/1000);
    document.getElementById('result-time').textContent=Math.floor(seconds/60)+'분 '+seconds%60+'초';
    document.getElementById('result-caught').textContent=score+'마리';
    document.getElementById('result-collections').innerHTML=runItems.length?runItems.map(id=>'<span class="result-collection">'+itemIcon(id)+'<span>'+COLLECTIONS.find(item=>item.id===id).name+'</span></span>').join(''):'<span class="result-empty">이번 판에는 획득하지 못했어요</span>';
    document.getElementById('result-reward').textContent='+'+runCoins*(doubled?2:1);
    document.getElementById('result-double').disabled=doubled||runCoins===0||adRunning;
    document.getElementById('result-double').textContent=doubled?'2배 보상 받음':'▷ 광고 보고 보상 2배';
    document.getElementById('result-retry').textContent='재도전 ('+tickets+'/30)';
  }
  function showFinalResult() {
    abortAd();continueDialog.close();phase='over';paint();settleRun();renderResult();
    action.disabled=false;action.textContent='다시 도전 →';
    document.getElementById('result-status').textContent='';
    if(!resultDialog.open) resultDialog.showModal();
  }
  function abortAd() { clearTimeout(adTimer);adTimer=null;adRunning=false; }
  // Prototype only: replace this timed preview with an SDK's rewarded completion callback.
  function previewAd(button,status,complete) {
    if(adRunning) return;
    adRunning=true;button.disabled=true;let remaining=3;
    const tick=()=>{
      button.textContent='광고 체험 중 · '+remaining+'초';
      status.textContent='실제 광고가 아닌 3초 체험입니다. 끝까지 기다리면 적용돼요.';
      adTimer=setTimeout(()=>{
        if(--remaining>0) tick();
        else { adTimer=null;adRunning=false;complete(); }
      },1000);
    };
    tick();
  }
  document.getElementById('continue-back').addEventListener('click',()=>{if(phase==='continue')showFinalResult();});
  continueDialog.addEventListener('cancel',event=>{event.preventDefault();if(phase==='continue')showFinalResult();});
  document.getElementById('continue-watch').addEventListener('click',()=>{
    if(phase!=='continue'||!continueDialog.open||continueUsed) return;
    previewAd(document.getElementById('continue-watch'),document.getElementById('continue-status'),()=>{
      continueUsed=true;continueDialog.close();cycle=Math.max(0,cycle-3);legStarted=performance.now();resetCombo();enableAudio();beginCycle();
    });
  });
  document.getElementById('result-double').addEventListener('click',()=>{
    if(phase!=='over'||!resultDialog.open||doubled||runCoins===0) return;
    previewAd(document.getElementById('result-double'),document.getElementById('result-status'),()=>{
      doubled=true;profile.wallet=Math.min(Number.MAX_SAFE_INTEGER,profile.wallet+runCoins);saveProgress();saveResult(failureReason);renderResult();
      document.getElementById('result-status').textContent='2배 보상이 지급되었어요!';
    });
  });
  document.getElementById('result-back').addEventListener('click',returnToLobby);
  resultDialog.addEventListener('cancel',event=>{event.preventDefault();returnToLobby();});
  document.getElementById('result-retry').addEventListener('click',()=>{
    if(phase!=='over'||!resultDialog.open) return;
    abortAd();resultDialog.close();
    if(tickets===0) { returnToLobby();offerTickets(); } else openRules();
  });
  function renderCollection() {
    const grid=document.getElementById('collection-grid');grid.replaceChildren();
    COLLECTIONS.forEach((item,index)=>{
      const owned=profile.collection.includes(item.id),button=document.createElement('button');
      button.type='button';button.className='collection-tile'+(selectedItem===item.id?' selected':'')+(owned?'':' locked');
      button.innerHTML=itemIcon(item.id)+(owned?'':'<span class="collection-lock" aria-hidden="true">잠김</span>');
      button.setAttribute('aria-label',item.name+(owned?' · 수집 완료':' · 미수집'));
      button.setAttribute('aria-pressed',String(selectedItem===item.id));
      button.addEventListener('click',()=>{selectedItem=item.id;renderCollection();grid.children[index].focus?.();});grid.append(button);
    });
    document.getElementById('collection-name').textContent=profile.collection.includes(selectedItem)?COLLECTIONS.find(item=>item.id===selectedItem).name:'???';
    document.getElementById('collection-progress').textContent=profile.collection.length+' / '+COLLECTIONS.length;
    const claim=document.getElementById('collection-claim');
    claim.disabled=profile.collection.length!==COLLECTIONS.length||profile.characterClaimed;
    claim.textContent=profile.characterClaimed?'받기 완료':'받기';
    document.getElementById('collection-status').textContent=profile.characterClaimed?'유령 고양이를 획득했어요!': '아이템을 든 희귀 유령을 잡아 모아요. 한 판에 최대 2개!';
  }
  document.getElementById('collection-close').addEventListener('click',()=>collectionDialog.close());
  document.getElementById('collection-claim').addEventListener('click',()=>{
    if(!collectionDialog.open||profile.collection.length!==COLLECTIONS.length||profile.characterClaimed) return;
    profile.characterClaimed=true;saveProgress();renderCollection();
  });
  function updateTickets() {
    document.getElementById('lobby-tickets').textContent=tickets+' / 30';
  }
  function saveTickets() {
    updateTickets();writeStorage(LOBBY_KEY,{tickets});
  }
  function openEvent(title,body,label='',confirm=null) {
    if(!['ready','over'].includes(phase)||balanceDialog.open||rulesDialog.open||eventDialog.open||resultDialog.open||collectionDialog.open) return;
    document.getElementById('event-title').textContent=title;
    document.getElementById('event-body').innerHTML=body;
    const button=document.getElementById('event-confirm');
    button.textContent=label;button.hidden=!label;eventConfirm=confirm;
    eventDialog.showModal();
  }
  function offerTickets() {
    if(tickets===30) {
      openEvent('플레이 기회가 가득 찼어요','<p>최대 30회까지 보관할 수 있어요.<br>유령 소탕에 도전해 보세요!</p>');
      return;
    }
    openEvent(tickets===0?'플레이 기회가 없어요':'플레이 기회 +3',
      '<p>기회 3회를 받아 다시 도전해요.</p><p class="event-note">광고 없이 기회를 받는 체험 기능입니다.<br>일반게임의 300m 기록은 아직 연결되지 않았어요.</p>',
      '기회 +3 받기',()=>{
        const added=Math.min(3,30-tickets);tickets+=added;saveTickets();
        document.getElementById('lobby-status').textContent='플레이 기회 '+added+'회 획득! 현재 '+tickets+'회';
      });
  }
  document.getElementById('event-close').addEventListener('click',()=>eventDialog.close());
  eventDialog.addEventListener('close',()=>{eventConfirm=null;});
  document.getElementById('event-confirm').addEventListener('click',()=>{
    if(!eventDialog.open) return;
    const confirm=eventConfirm;eventDialog.close();if(confirm)confirm();
  });
  document.getElementById('lobby-bonus').addEventListener('click',offerTickets);
  document.getElementById('lobby-package').addEventListener('click',()=>openEvent('특별 패키지','<p>할로윈 특별 패키지를 준비하고 있어요.</p><p class="event-note">구성과 가격은 추후 정해집니다.</p>'));
  document.getElementById('lobby-shop').addEventListener('click',()=>openEvent('상품 교환소','<p>모은 유령 구슬로 이벤트 상품을 교환해요.</p><p class="event-note">교환 상품은 준비 중이에요.</p>'));
  document.getElementById('lobby-collection').addEventListener('click',()=>{
    if(phase!=='ready'||balanceDialog.open||rulesDialog.open||eventDialog.open||collectionDialog.open) return;
    renderCollection();collectionDialog.showModal();
  });
  document.getElementById('lobby-close').addEventListener('click',()=>openEvent('캣점프 할로윈','<p>유령들이 다시 찾아오길 기다리고 있어요.</p>','이벤트 다시 열기'));
  function openRules() {
    if(!['ready','over'].includes(phase)||balanceDialog.open||rulesDialog.open||eventDialog.open||resultDialog.open||collectionDialog.open) return;
    if(tickets===0) { offerTickets();return; }
    rulesDialog.showModal();
  }
  action.addEventListener('click',openRules);
  document.getElementById('lobby-start').addEventListener('click',()=>{if(phase==='ready')openRules();});
  function closeRules() { rulesDialog.close();if(phase==='over') { renderResult();resultDialog.showModal(); } }
  document.getElementById('rules-close').addEventListener('click',closeRules);
  rulesDialog.addEventListener('cancel',event=>{event.preventDefault();closeRules();});
  document.getElementById('rules-start').addEventListener('click',()=>{
    if(!rulesDialog.open||!['ready','over'].includes(phase)||balanceDialog.open||eventDialog.open||collectionDialog.open||resultDialog.open||tickets<1) return;
    rulesDialog.close();
    tickets--;saveTickets();
    config=structuredClone(pendingConfig);
    stopTimer();clearEffects();enableAudio();cycle=0;score=0;resetCombo();
    runItems=[];continueUsed=false;settled=false;doubled=false;runElapsed=0;legStarted=performance.now();failureReason=null;runCoins=0;highestCycle=0;
    beginCycle();
  });
  function readySettings() {
    if(phase==='ready') {
      find('clock').textContent=pendingConfig.difficulty.memoryStart.toFixed(2)+'초 기억';
      find('feedback').textContent='하얀 유령의 위치를 기억하고 '+pendingConfig.combo.window.toFixed(2)+'초 연속 명중.';
    }
    find('rules').textContent='빈자리 −'+pendingConfig.difficulty.missPenalty.toFixed(2)+'초 · 폭탄 유령은 즉시 종료!';
  }
  const editor=createBalanceEditor({
    getConfig:()=>pendingConfig,
    onOpen:()=>['ready','over'].includes(phase)&&!rulesDialog.open&&!eventDialog.open&&!collectionDialog.open&&!resultDialog.open,
    onSave:value=>{
      pendingConfig=validateConfig(value);
      writeStorage(BALANCE_KEY,JSON.stringify(pendingConfig)===JSON.stringify(DEFAULT_CONFIG)?null:pendingConfig);
      readySettings();
    }
  });
  balanceButton.addEventListener('click',()=>editor.open());
  document.getElementById('lobby-settings').addEventListener('click',()=>editor.open());
  updateTickets();document.getElementById('lobby-start').disabled=false;
  document.getElementById('lobby-currency').textContent=profile.wallet.toLocaleString('ko-KR');
  readySettings();paint();action.disabled=false;action.textContent='도전하기 →';
})();
