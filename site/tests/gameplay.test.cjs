const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Pin a representative balance for timing regressions, independent of live tuning.
(async()=>{
const {validateConfig}=await import('../balance-config.mjs');
const {difficultyAt,comboBonus}=await import('../game-core.mjs');
const DEFAULT_CONFIG=validateConfig({"version": 1, "game": "memory-room", "difficulty": {"rampSeconds": 30, "memoryStart": 0.5, "memoryMin": 0.32, "huntStart": 1.6, "huntMin": 0.7, "targetsStart": 4, "targetsMax": 6, "decoysStart": 3, "decoysMax": 5}, "combo": {"window": 0.45, "bonusStart": 0.12, "bonusStep": 0.04, "bonusMax": 0.2}, "haunt": {"enabled": 1, "warning": 0.12, "travelStart": 0.68, "travelMin": 0.52, "max": 2, "extraAtCombo": 2, "extraAtProgress": 0.5}, "transition": {"firstPrepare": 0.25, "prepare": 0.12, "blackout": 0.04, "impact": 0.08, "tremble": 0.28}, "effects": {"fogEnabled": 1, "fogDuration": 0.48, "heartbeatBelow": 0.7, "heartbeatInterval": 0.22}});
const script=fs.readFileSync(require('node:path').join(__dirname,'../app.mjs'),'utf8').replace(/^import .*;$/gm,'');
function game(options={}) {
  let now = 0, serial = 0;
  const timers = new Map(), nodes = new Map(), saved = [],storage=new Map();let editor;
  const audioLog={contexts:0,resumes:0,tones:[],gains:[],buffers:[],noise:[],filters:[]};
  const audioParam=()=>({value:0,setValueAtTime(value,time){this.start={value,time};},exponentialRampToValueAtTime(value,time){this.end={value,time};}});
  class FakeAudioContext {
    constructor(){audioLog.contexts++;this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination={};}
    resume(){audioLog.resumes++;this.state='running';return Promise.resolve();}
    createGain(){const gain={gain:audioParam(),connect(){},disconnect(){}};audioLog.gains.push(gain);return gain;}
    createOscillator(){
      const oscillator={createdNow:now,frequency:audioParam(),connect(){},disconnect(){},start(time){this.startedAt=time;},stop(time){this.stoppedAt=time;}};
      audioLog.tones.push(oscillator);return oscillator;
    }
    createBuffer(channels,length,rate){const data=new Float32Array(length);const buffer={channels,length,rate,getChannelData:()=>data};audioLog.buffers.push(buffer);return buffer;}
    createBufferSource(){const source={connect(){},disconnect(){},start(time){this.startedAt=time;},stop(time){this.stoppedAt=time;}};audioLog.noise.push(source);return source;}
    createBiquadFilter(){const filter={frequency:{value:0},Q:{value:0},connect(){},disconnect(){}};audioLog.filters.push(filter);return filter;}
  }
  if(options.noFilter) FakeAudioContext.prototype.createBiquadFilter=undefined;
  function element() {
    return { dataset:{}, style:{setProperty(key,value){this[key]=value;}}, attrs:{}, children:[], handlers:{}, innerHTML:'', textContent:'', parent:null,
      rect:{left:10,top:20,width:360,height:480},
      get firstElementChild() { return this.children[0]; },
      getBoundingClientRect() { return this.rect; },
      append(child) { child.parent=this; this.children.push(child); },
      replaceChildren() { this.children.forEach(child=>child.parent=null); this.children=[]; },
      remove() { if(this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); this.parent=null; },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      emit(name,event) { this.handlers[name]?.(event); if(name==='click'&&!event.stopped) this.parent?.emit(name,event); },
      click(props={}) { const event={detail:0,clientX:0,clientY:0,target:this,stopPropagation(){this.stopped=true;},...props}; this.emit('click',event); return event; }
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const root = { dataset:{},querySelector:selector => get(selector.slice(4)) };
  if(options.saved!==undefined)storage.set('catjump-memory-room-state-v1',JSON.stringify(options.saved));
  if(options.config!==undefined)storage.set('catjump-memory-room-balance-v1',JSON.stringify(options.config));
  vm.runInNewContext(script, {
    DEFAULT_CONFIG,validateConfig,difficultyAt,comboBonus,structuredClone,
    createBalanceEditor(callbacks){editor=callbacks;return {open(){if(callbacks.onOpen()===false)return;get('balance-dialog').open=true;}};},
    localStorage:{getItem:key=>options.corruptStorage?'broken json':storage.get(key)??null,
      setItem(key,value){if(options.blockStorage)throw Error('Storage denied');storage.set(key,value);if(key==='catjump-memory-room-state-v1')saved.push(JSON.parse(value));},
      removeItem(key){if(options.blockStorage)throw Error('Storage denied');storage.delete(key);}},
    document:{ getElementById:id => id==='cj-ghost-room'?root:get(id), createElement:element },
    window:{ AudioContext:options.audio?FakeAudioContext:undefined },
    performance:{ now:() => now },
    setInterval(fn, ms) { const id = ++serial; timers.set(id, {fn, ms, next:now + ms}); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn,ms) { const id=++serial;timers.set(id,{fn,ms:0,next:now+ms});return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  get('spots').parent=get('room');
  get('haunts').parent=get('room');
  get('spots').children.forEach((button,i)=>button.rect={left:30+(i%3)*110,top:66+Math.floor(i/3)*90,width:100,height:80});
  return {
    get, root, saved, timers, audioLog, storage, editor,runStart:0,now:()=>now,
    phase:() => get('room').dataset.phase,
    slots:() => get('spots').children,
    types(type) { return this.slots().flatMap((s, i) => (type === 'empty' ? !s.innerHTML : s.innerHTML.includes('cj-ghost ' + type)) ? [i] : []); },
    click(i,event) { return this.slots()[i].click(event); },
    start() { if(['ready','over'].includes(this.phase()))this.runStart=now;get('action').click(); },
    jump(time) { now = time; },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a,b) => a[1].next - b[1].next)[0];
        if (!next || next[1].next > until) break;
        now = Math.max(now,next[1].next);
        if(next[1].ms)next[1].next=now+next[1].ms;else timers.delete(next[0]);
        next[1].fn();
      }
      now = until;
    }
  };
}

function assertHidden(g){assert.ok(g.slots().every(s=>!s.innerHTML.includes('cj-ghost')));}
function assertLocked(g){
  assert.ok(g.slots().every(s=>s.disabled));
  const score=g.get('score').textContent,phase=g.phase(),saves=g.saved.length;
  g.slots().forEach((_,i)=>g.click(i));g.start();g.get('room').click();
  assert.equal(g.get('score').textContent,score);assert.equal(g.phase(),phase);assert.equal(g.saved.length,saves);
}
function enterCycle(g,cycle=0){
  const elapsed=Math.max(0,g.now()-g.runStart),ramp=Math.min(1,elapsed/30000);
  const count=Math.min(6,cycle+4),decoys=Math.min(5,cycle+3);
  const memory=Math.round(500-180*ramp),hunt=Math.round(1600-900*ramp),prepare=cycle===0?250:120;
  assert.equal(g.phase(),'prepare');assertHidden(g);assertLocked(g);
  for(const id of ['effects','fail-splash','haunts'])assert.equal(g.get(id).children.length,0);
  assert.ok(g.slots().every(s=>s.attrs['aria-label'].includes('숨겨진 자리')));
  g.advance(prepare-1);assert.equal(g.phase(),'prepare');g.advance(1);assert.equal(g.phase(),'memory');
  const b={target:g.types('target'),decoy:g.types('decoy'),empty:g.types('empty'),memory,hunt,ramp};
  assert.deepEqual([b.target.length,b.decoy.length,b.empty.length],[count,decoys,12-count-decoys]);
  assertLocked(g);g.advance(memory-.1);assert.equal(g.phase(),'memory');
  g.advance(.1);assert.equal(g.phase(),'hide');assertHidden(g);assertLocked(g);
  g.advance(39.9);assert.equal(g.phase(),'hide');g.advance(.1);assert.equal(g.phase(),'hunt');
  assert.equal(g.get('clock').textContent,(hunt/1000).toFixed(2)+'초');assertHidden(g);
  assert.equal(g.get('haunts').children.length,1);
  return b;
}
function startRun(g=game()){g.start();return {g,b:enterCycle(g)};}
function resolveImpact(g,decoys=3){
  assert.equal(g.phase(),'impact');assertHidden(g);assertLocked(g);assert.equal(g.get('haunts').children.length,0);
  g.advance(79.9);assert.equal(g.phase(),'impact');g.advance(.1);assert.equal(g.phase(),'tremble');assertLocked(g);
  assert.equal(g.types('target').length,0);assert.equal(g.types('decoy').length,decoys);
  assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-fear')&&s.innerHTML.includes('cj-sweat')).length,decoys);
  assert.equal(g.get('effects').children.length,0);
  g.advance(279.9);assert.equal(g.phase(),'tremble');g.advance(.1);assert.equal(g.phase(),'prepare');assert.equal(g.timers.size,1);
}
const newest=g=>g.get('effects').children.filter(e=>e.className?.startsWith('cj-impact ')).at(-1);
const runners=g=>g.get('haunts').children.map(lane=>lane.children[1]);
function assertHaunts(g,b,hit=[]){
  const lanes=g.get('haunts').children;
  assert.ok(lanes.length<=2);
  assert.equal(new Set(lanes.map(l=>l.dataset.row)).size,lanes.length);
  for(const lane of lanes){
    assert.equal(lane.children.length,2);assert.equal(lane.children[0].textContent,'!');
    assert.equal(lane.style['--travel'],Math.round(680-160*b.ramp)+'ms');
  }
}
const g=game();g.start();let total=0;
for(let cycle=0;cycle<30;cycle++){
  const b=enterCycle(g,cycle);assertHaunts(g,b);
  b.target.forEach((i,n)=>{g.click(i);total++;assert.equal(g.get('score').textContent,'명중 '+total);assert.match(newest(g).innerHTML,n===0?/PERFECT!/:new RegExp((n+1)+' COMBO!'));assertHaunts(g,b);});
  assert.equal(g.saved.length,0);resolveImpact(g,b.decoy.length);
}
assert.equal(total,177);assert.equal(g.get('best').textContent,'최고 177');
const finalBoard=enterCycle(g,30);g.click(finalBoard.empty[0]);assert.equal(g.phase(),'laugh');assertLocked(g);
assert.equal(g.get('haunts').children.length,0);assert.equal(g.saved.length,1);assert.equal(g.saved[0].best,177);
assert.equal(g.saved[0].result.caught,177);assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-ha')).length,11);
g.advance(1349);assert.equal(g.phase(),'laugh');g.advance(1);assert.equal(g.phase(),'over');assert.equal(g.timers.size,0);
g.start();const reset=enterCycle(g);assert.deepEqual([reset.memory,reset.hunt],[500,1600]);assert.equal(g.get('score').textContent,'명중 0');
g.advance(1600);assert.equal(g.phase(),'over');assert.equal(g.timers.size,0);assert.equal(g.saved.length,2);

const {g:repeat,b:rb}=startRun();repeat.click(rb.target[0]);repeat.click(rb.target[0]);
assert.equal(repeat.phase(),'laugh');assert.equal(repeat.saved[0].result.caught,1);assert.equal(repeat.saved[0].result.reason,'허공 사격');
assert.equal(repeat.get('haunts').children.length,0);assertLocked(repeat);
const {g:background}=startRun();background.get('room').click();assert.equal(background.phase(),'laugh');assert.equal(background.saved.length,1);

for(const keyboard of [false,true]){
  const {g:scare}=startRun(),runner=runners(scare)[0];
  runner.rect={left:100,top:150,width:40,height:50};
  const event=keyboard?{}:{detail:1,clientX:118,clientY:166};
  assert.ok(runner.click(event).stopped);
  assert.equal(scare.phase(),'scare-reveal');assert.equal(scare.saved.length,1);assert.equal(scare.saved[0].result.reason,'금지 유령 명중');
  assert.equal(scare.get('haunts').children.length,0);assert.deepEqual([scare.types('target').length,scare.types('decoy').length],[4,3]);
  assertLocked(scare);runner.click(event);assert.equal(scare.saved.length,1);
  const point=keyboard?{x:110,y:155}:{x:108,y:146};
  const mark=scare.get('fail-splash').firstElementChild;assert.equal(mark.style.left,point.x+'px');assert.equal(mark.style.top,point.y+'px');
  scare.advance(349.9);assert.equal(scare.phase(),'scare-reveal');scare.advance(.1);assert.equal(scare.phase(),'scare-pop');
  assert.equal(mark.parent,null);assert.equal(scare.get('fail-splash').children.length,2);
  const actor=scare.get('fail-splash').children.find(c=>c.className==='cj-pop-actor');
  assert.equal(actor.style.left,point.x+'px');assert.equal(actor.style.top,point.y+'px');assertLocked(scare);
  scare.advance(1100);assert.equal(scare.phase(),'over');assert.equal(scare.timers.size,0);assert.equal(scare.saved.length,1);
  scare.start();assert.equal(scare.get('fail-splash').children.length,0);assert.equal(scare.get('haunts').children.length,0);
  enterCycle(scare);scare.advance(500);assert.equal(scare.phase(),'hunt');assert.equal(scare.get('haunts').children.length,1);
}
const {g:staticScare,b:ss}=startRun();staticScare.click(ss.decoy[0]);staticScare.advance(350);assert.equal(staticScare.phase(),'scare-pop');
assert.equal(staticScare.slots().filter(s=>s.className.includes('is-spooked')).length,1);

const {g:renew,b:nb}=startRun(),firstLane=renew.get('haunts').firstElementChild;
assert.ok(nb.target.some(i=>Math.floor(i/3)===Number(firstLane.dataset.row)));
renew.advance(799.9);assert.equal(renew.get('haunts').firstElementChild,firstLane);
renew.advance(.1);assert.notEqual(renew.get('haunts').firstElementChild,firstLane);assert.equal(firstLane.parent,null);assertHaunts(renew,nb);
renew.advance(800);assert.equal(renew.phase(),'over');assert.equal(renew.get('haunts').children.length,0);assert.equal(renew.timers.size,0);
const {g:deadlineRunner}=startRun(),expiredRunner=runners(deadlineRunner)[0];
deadlineRunner.jump(deadlineRunner.now()+1600);expiredRunner.click({detail:1,clientX:100,clientY:100});
assert.equal(deadlineRunner.phase(),'over');assert.equal(deadlineRunner.saved[0].result.reason,'시간 초과');assert.equal(deadlineRunner.timers.size,0);

for(const [gap,label] of [[450,'2 COMBO!'],[451,'PERFECT!']]){
  const {g:c,b}=startRun();c.click(b.target[0]);c.advance(gap);c.click(b.target[1]);assert.ok(newest(c).innerHTML.includes(label));
}
const {g:extension,b:xb}=startRun();extension.advance(1100);extension.click(xb.target[0]);extension.advance(450);extension.click(xb.target[1]);
assert.match(newest(extension).innerHTML,/\+0\.12초/);extension.advance(50);assert.equal(extension.phase(),'hunt');
extension.advance(119.9);assert.equal(extension.phase(),'hunt');extension.advance(.1);assert.equal(extension.phase(),'over');assert.equal(extension.saved[0].result.caught,2);
for(const [offset,expected] of [[-.1,'impact'],[0,'over']]){
  const {g:edge,b}=startRun();b.target.slice(0,3).forEach(i=>edge.click(i));
  edge.jump(edge.now()+1600+120+160+offset);edge.click(b.target[3]);assert.equal(edge.phase(),expected);
  if(expected==='impact')resolveImpact(edge);else assert.equal(edge.saved[0].result.caught,3);
}
const {g:gauge,b:gb}=startRun();gauge.click(gb.target[0]);gauge.click(gb.target[1]);assert.ok(parseFloat(gauge.get('time-fill').style.width)<=100);
gauge.advance(475);assert.equal(gauge.get('action').dataset.combo,'');assert.equal(gauge.get('action').style['--chain'],'0%');
const {g:urgent,b:ub}=startRun();urgent.advance(400);urgent.click(ub.target[0]);assert.equal(urgent.get('clock').textContent,'1.20초');
urgent.advance(199);assert.equal(urgent.root.dataset.urgent,'false');urgent.advance(1);assert.equal(urgent.root.dataset.urgent,'true');
urgent.advance(10);urgent.click(ub.target[1]);assert.equal(urgent.get('clock').textContent,'1.11초');assert.equal(urgent.root.dataset.urgent,'false');

function sampleAt(elapsed,cycle=1){
  const {g:sample,b}=startRun();b.target.forEach(i=>sample.click(i));
  if(cycle===2){resolveImpact(sample);enterCycle(sample,1).target.forEach(i=>sample.click(i));}
  sample.advance(80);sample.jump(elapsed);sample.advance(0);return {g:sample,b:enterCycle(sample,cycle)};
}
for(const [elapsed,memory,hunt] of [[15000,410,1150],[30000,320,700],[60000,320,700]]){
  const {g:s,b}=sampleAt(elapsed);assert.deepEqual([b.memory,b.hunt],[memory,hunt]);
  s.advance(hunt-.1);assert.equal(s.phase(),'hunt');s.advance(.1);assert.equal(s.phase(),'over');assert.equal(s.timers.size,0);
}
const {g:cross,b:cb}=sampleAt(29000);assert.deepEqual([cb.memory,cb.hunt],[326,730]);
const crossStart=cross.now(),crossRules=cross.get('rules').textContent;cross.advance(30001-crossStart);
assert.equal(cross.phase(),'hunt');assert.equal(cross.get('rules').textContent,crossRules);cross.advance(crossStart+730-cross.now());assert.equal(cross.phase(),'over');
cross.start();assert.deepEqual([enterCycle(cross).memory,parseFloat(cross.get('clock').textContent)],[500,1.6]);
const {g:hauntCap,b:hcb}=sampleAt(30000,2);
hauntCap.click(hcb.target[0]);assert.equal(hauntCap.get('haunts').children.length,2);assertHaunts(hauntCap,hcb);
const oldLanes=[...hauntCap.get('haunts').children];
hauntCap.advance(639.9);assert.ok(oldLanes.every(l=>l.parent));hauntCap.advance(.1);
assert.ok(oldLanes.every(l=>l.parent===null));assert.equal(hauntCap.get('haunts').children.length,2);assertHaunts(hauntCap,hcb);
hauntCap.advance(60);assert.equal(hauntCap.phase(),'over');assert.equal(hauntCap.get('haunts').children.length,0);assert.equal(hauntCap.timers.size,0);
const {g:rapid,b:rapidBoard}=sampleAt(30000,2),rapidStart=rapid.now();
for(const [index,at] of [180,570,760,930,1110,1300].entries()){
  rapid.advance(rapidStart+at-rapid.now());assert.equal(rapid.phase(),'hunt');rapid.click(rapidBoard.target[index]);
  const bonus=[0,120,160,200,200,200][index];if(bonus)assert.ok(newest(rapid).innerHTML.includes('+'+(bonus/1000).toFixed(2)+'초'));assertHaunts(rapid,rapidBoard);
}
assert.equal(rapid.phase(),'impact');assert.equal(rapid.saved.length,0);resolveImpact(rapid,5);assert.equal(enterCycle(rapid,3).hunt,700);
const {g:noChain,b:nc}=sampleAt(30000,2);noChain.advance(180);noChain.click(nc.target[0]);noChain.advance(460);noChain.click(nc.target[1]);
noChain.advance(60);assert.equal(noChain.phase(),'over');

const {g:shot,b:sb}=startRun(),cell=shot.slots()[sb.target[0]].rect,point={detail:1,clientX:cell.left+13,clientY:cell.top+19};
assert.ok(shot.click(sb.target[0],point).stopped);let effect=newest(shot);
assert.equal(parseFloat(effect.style.left),(point.clientX-10)/360*100);assert.equal(parseFloat(effect.style.top),(point.clientY-20)/480*100);assertHidden(shot);
const curse=shot.get('effects').children.find(e=>e.className==='cj-curse');assert.ok(curse);curse.emit('animationend',{target:curse});assert.equal(curse.parent,null);
effect.emit('animationend',{target:{}});assert.ok(effect.parent);effect.emit('animationend',{target:effect});assert.equal(effect.parent,null);
shot.click(sb.target[1]);assertHaunts(shot,sb);
assert.ok(shot.get('haunts').children.length<=2); // Existing lanes finish naturally even if their last target was hit.

for(const [state,want] of [[{},0],[{best:200},200],[{best:-1},0],[{best:Infinity},0],[{best:2.5},0],[{best:Number.MAX_SAFE_INTEGER+1},0]]){
  assert.equal(game({saved:state}).get('best').textContent,'최고 '+want);
}
assert.equal(game({corruptStorage:true}).phase(),'ready');
assert.equal(game({config:{version:6}}).phase(),'ready');
const blocked=game({blockStorage:true});startRun(blocked);blocked.get('room').click();assert.ok(blocked.get('storage-note').textContent);
const loaded=game({saved:{best:250,soundOn:false}});assert.equal(loaded.get('best').textContent,'최고 250');assert.equal(loaded.get('sound').textContent,'♪ OFF');
loaded.get('sound').click();assert.equal(loaded.saved[0].soundOn,true);assert.equal(loaded.saved[0].best,250);

const settings=game();settings.get('balance-open').click();assert.equal(settings.get('balance-dialog').open,true);
settings.start();assert.equal(settings.phase(),'ready');
const custom=structuredClone(DEFAULT_CONFIG);custom.difficulty.memoryStart=.8;custom.difficulty.huntStart=3;
custom.transition.firstPrepare=.1;custom.transition.blackout=.2;custom.haunt.enabled=0;custom.effects.fogEnabled=0;
custom.combo.window=.6;custom.combo.bonusStart=.3;custom.combo.bonusMax=.5;
settings.editor.onSave(custom);assert.ok(settings.storage.has('catjump-memory-room-balance-v1'));
assert.equal(settings.get('clock').textContent,'0.80초 기억');
settings.get('balance-dialog').open=false;settings.start();assert.equal(settings.get('balance-open').disabled,true);
assert.equal(settings.editor.onOpen(),false);
settings.advance(100);assert.equal(settings.phase(),'memory');const customTargets=settings.types('target');
settings.advance(800);assert.equal(settings.phase(),'hide');settings.advance(200);assert.equal(settings.phase(),'hunt');
assert.equal(settings.get('clock').textContent,'3.00초');assert.equal(settings.get('haunts').children.length,0);
settings.click(customTargets[0]);settings.advance(550);settings.click(customTargets[1]);
assert.match(newest(settings).innerHTML,/2 COMBO!.*\+0\.30초/);assert.equal(settings.get('effects').children.filter(e=>e.className==='cj-curse').length,0);
settings.get('room').click();settings.advance(1350);assert.equal(settings.get('balance-open').disabled,false);
settings.editor.onSave(structuredClone(DEFAULT_CONFIG));assert.equal(settings.storage.has('catjump-memory-room-balance-v1'),false);

for(const noFilter of [false,true]){
  const aGame=game({audio:true,noFilter}),b=startRun(aGame).b,a=aGame.audioLog;
  assert.equal(a.contexts,1);assert.equal(a.resumes,1);assert.equal(a.tones.length,3);assert.equal(a.noise.length,0);
  aGame.click(b.target[0]);assert.equal(a.tones.length,8);assert.equal(a.noise.length,1);
  aGame.click(b.empty[0]);assert.equal(a.tones.length,20);assert.equal(a.noise.length,2);
  assert.equal(a.filters.filter(f=>f.frequency.value===850).length,noFilter?0:5);
}
const audioScare=game({audio:true}),asd=startRun(audioScare).b,sa=audioScare.audioLog;
audioScare.click(asd.decoy[0]);assert.equal(sa.tones.length,13);assert.equal(sa.noise.length,1);
assert.deepEqual(sa.filters.filter(f=>f.frequency.value!==1500).map(f=>f.frequency.value),[2200,1750,2200,1750,2200,1750]);
audioScare.advance(350);assert.equal(sa.tones.length,16);
const pulse=game({audio:true});startRun(pulse);pulse.advance(899);assert.equal(pulse.audioLog.tones.filter(t=>t.frequency.start.value===90).length,0);
pulse.advance(1);assert.equal(pulse.audioLog.tones.filter(t=>t.frequency.start.value===90).length,1);pulse.advance(500);
const pulses=pulse.audioLog.tones.filter(t=>t.frequency.start.value===90);assert.equal(pulses.length,3);
assert.ok(pulses.slice(1).every((t,i)=>t.createdNow-pulses[i].createdNow>=220));
const muted=game({audio:true}),mb=startRun(muted).b,ma=muted.audioLog;muted.get('sound').click();const before=ma.tones.length;
muted.click(mb.target[0]);muted.advance(1000);assert.equal(ma.tones.length,before);assert.equal(ma.noise.length,0);
const shiver=game({audio:true}),shb=startRun(shiver).b;shb.target.forEach(i=>shiver.click(i));const tonesBefore=shiver.audioLog.tones.length;
shiver.advance(80);assert.equal(shiver.audioLog.tones.length,tonesBefore+7);assert.ok(shiver.audioLog.tones.slice(-7).every(t=>t.stoppedAt<=.28));
console.log('PASS: 30 cycles/177 score; 30s difficulty cap; sub-ms phase/deadline boundaries; 450ms combo rearming and six-hit survival; haunt limit/rows/renewal/click coordinates/cleanup; failures, records, curse, snicker/pulse/shiver and mute.');

})().catch(error=>{console.error(error);process.exitCode=1;});
