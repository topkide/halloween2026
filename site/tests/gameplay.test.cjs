const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Pin a representative balance for timing regressions, independent of live tuning.
(async()=>{
const {validateConfig,parseBalanceDB,DEFAULT_CONFIG:LIVE_DEFAULTS}=await import('../balance-config.mjs');
const {difficultyAt,comboBonus,hitSlot}=await import('../game-core.mjs');
const DEFAULT_CONFIG=validateConfig({"version": 1, "game": "memory-room", "difficulty": {"rampRounds": 12, "memoryStart": 0.5, "memoryMin": 0.32, "huntStart": 1.6, "huntMin": 0.7, "targetsStart": 4, "targetsMax": 6, "decoysStart": 3, "decoysMax": 5}, "combo": {"window": 0.45, "bonusStart": 0.12, "bonusStep": 0.04, "bonusMax": 0.2}, "transition": {"firstPrepare": 0.25, "prepare": 0.12, "blackout": 0.04, "impact": 0.08, "tremble": 0.28}, "effects": {"fogEnabled": 1, "fogDuration": 0.48, "heartbeatBelow": 0.7, "heartbeatInterval": 0.22}});
const script=fs.readFileSync(require('node:path').join(__dirname,'../app.mjs'),'utf8').replace(/^import .*;$/gm,'');
function game(options={}) {
  let now = 0, serial = 0;
  const timers = new Map(), nodes = new Map(), created = [], saved = [],storage=new Map();let editor;
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
    return { dataset:{}, style:{setProperty(key,value){this[key]=value;}}, attrs:{}, children:[], handlers:{}, innerHTML:'', textContent:'', parent:null,open:false,
      rect:{left:10,top:20,width:360,height:480},
      get firstElementChild() { return this.children[0]; },
      getBoundingClientRect() { return this.rect; },
      append(child) { child.parent=this; this.children.push(child); },
      replaceChildren() { this.children.forEach(child=>child.parent=null); this.children=[]; },
      remove() { if(this.parent) this.parent.children.splice(this.parent.children.indexOf(this),1); this.parent=null; },
      setAttribute(key, value) { this.attrs[key] = value; },
      showModal() { this.open=true; },
      close() { if(this.open){this.open=false;this.emit('close',{target:this});} },
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
    DEFAULT_CONFIG:options.defaults||DEFAULT_CONFIG,validateConfig,parseBalanceDB,difficultyAt,comboBonus,hitSlot,structuredClone,
    createBalanceEditor(callbacks){editor=callbacks;return {open(){if(callbacks.onOpen()===false)return;get('balance-dialog').open=true;}};},
    localStorage:{getItem:key=>options.corruptStorage?'broken json':storage.get(key)??null,
      setItem(key,value){if(options.blockStorage)throw Error('Storage denied');storage.set(key,value);if(key==='catjump-memory-room-state-v1')saved.push(JSON.parse(value));},
      removeItem(key){if(options.blockStorage)throw Error('Storage denied');storage.delete(key);}},
    document:{ getElementById:id => id==='cj-ghost-room'?root:get(id), createElement(tag){const node=element();node.tag=tag;created.push(node);return node;} },
    window:{ AudioContext:options.audio?FakeAudioContext:undefined,innerWidth:390,innerHeight:844 },
    performance:{ now:() => now },
    setInterval(fn, ms) { const id = ++serial; timers.set(id, {fn, ms, next:now + ms}); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn,ms) { const id=++serial;timers.set(id,{fn,ms:0,next:now+ms});return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  get('spots').parent=get('room');
  get('spots').children.forEach((button,i)=>button.rect={left:30+(i%3)*110,top:66+Math.floor(i/3)*90,width:100,height:80});
  return {
    get, root, nodes, created, saved, timers, audioLog, storage, editor,now:()=>now,
    phase:() => get('room').dataset.phase,
    slots:() => get('spots').children,
    types(type) { return this.slots().flatMap((s, i) => (type === 'empty' ? !s.innerHTML : s.innerHTML.includes('cj-ghost ' + type)) ? [i] : []); },
    click(i,event) { return this.slots()[i].click(event); },
    start() { get('action').click();if(get('rules-dialog').open)get('rules-start').click(); },
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
  const {difficulty:d,transition:t}=g.editor.getConfig(),ramp=Math.min(1,cycle/(d.rampRounds-1));
  const count=Math.min(d.targetsMax,cycle+d.targetsStart),decoys=Math.min(d.decoysMax,cycle+d.decoysStart);
  const memory=Math.round((d.memoryStart-(d.memoryStart-d.memoryMin)*ramp)*1000);
  const hunt=Math.round((d.huntStart-(d.huntStart-d.huntMin)*ramp)*1000),prepare=(cycle===0?t.firstPrepare:t.prepare)*1000;
  assert.equal(g.phase(),'prepare');assertHidden(g);assertLocked(g);
  for(const id of ['effects','fail-splash'])assert.equal(g.get(id).children.length,0);
  assert.ok(g.slots().every(s=>s.attrs['aria-label'].includes('숨겨진 자리')));
  g.advance(prepare-1);assert.equal(g.phase(),'prepare');g.advance(1);assert.equal(g.phase(),'memory');
  const b={target:g.types('target'),decoy:g.types('decoy'),empty:g.types('empty'),memory,hunt,ramp};
  assert.deepEqual([b.target.length,b.decoy.length,b.empty.length],[count,decoys,12-count-decoys]);
  assertLocked(g);g.advance(memory-.1);assert.equal(g.phase(),'memory');
  g.advance(.1);assert.equal(g.phase(),'hide');assertHidden(g);assertLocked(g);
  g.advance(t.blackout*1000-.1);assert.equal(g.phase(),'hide');g.advance(.1);assert.equal(g.phase(),'hunt');
  assert.equal(g.get('clock').textContent,(hunt/1000).toFixed(2)+'초');assertHidden(g);
  assert.equal(g.nodes.has('haunts'),false);
  return b;
}
function startRun(g=game()){g.start();return {g,b:enterCycle(g)};}
function resolveImpact(g,decoys=3){
  assert.equal(g.phase(),'impact');assertHidden(g);assertLocked(g);
  g.advance(79.9);assert.equal(g.phase(),'impact');g.advance(.1);assert.equal(g.phase(),'tremble');assertLocked(g);
  assert.equal(g.types('target').length,0);assert.equal(g.types('decoy').length,decoys);
  assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-fear')&&s.innerHTML.includes('cj-sweat')).length,decoys);
  assert.equal(g.get('effects').children.length,0);
  g.advance(279.9);assert.equal(g.phase(),'tremble');g.advance(.1);assert.equal(g.phase(),'prepare');assert.equal(g.timers.size,1);
}
const newest=g=>g.get('effects').children.filter(e=>e.className?.startsWith('cj-impact ')).at(-1);

// Reading or dismissing the rules must never start the clock, audio, or a new run.
const guide=game({audio:true,saved:{best:42}}),rulesDialog=guide.get('rules-dialog');
guide.get('rules-start').click();assert.equal(guide.phase(),'ready');
guide.get('action').click();assert.equal(rulesDialog.open,true);assert.equal(guide.phase(),'ready');
guide.get('action').click();guide.advance(120000);
assert.equal(rulesDialog.open,true);assert.equal(guide.phase(),'ready');assert.equal(guide.timers.size,0);
assert.equal(guide.get('score').textContent,'명중 0');assert.equal(guide.get('best').textContent,'최고 42');
assert.equal(guide.saved.length,0);assert.equal(guide.audioLog.contexts,0);
guide.get('rules-close').click();assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'ready');
guide.advance(120000);assert.equal(guide.timers.size,0);assert.equal(guide.audioLog.contexts,0);
guide.get('action').click();guide.get('rules-start').click();
assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'prepare');assert.equal(guide.timers.size,1);
assert.equal(guide.audioLog.contexts,1);
const guideBoard=enterCycle(guide);guide.click(guideBoard.target[0]);guide.click(guideBoard.empty[0]);guide.advance(1350);
assert.equal(guide.phase(),'over');assert.equal(guide.saved.length,1);
guide.get('action').click();assert.equal(rulesDialog.open,true);guide.advance(120000);
assert.equal(guide.phase(),'over');assert.equal(guide.get('score').textContent,'명중 1');assert.equal(guide.timers.size,0);
guide.get('rules-close').click();assert.equal(rulesDialog.open,false);assert.equal(guide.get('score').textContent,'명중 1');
guide.get('action').click();guide.get('rules-start').click();
assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'prepare');assert.equal(guide.get('score').textContent,'명중 0');
assert.equal(guide.saved.length,1);enterCycle(guide);

const exclusive=game();exclusive.get('action').click();exclusive.get('balance-open').click();
assert.equal(exclusive.get('rules-dialog').open,true);assert.equal(exclusive.get('balance-dialog').open,false);
assert.equal(exclusive.editor.onOpen(),false);
exclusive.get('rules-close').click();exclusive.get('balance-open').click();
assert.equal(exclusive.get('balance-dialog').open,true);
exclusive.get('action').click();exclusive.get('rules-start').click();
assert.equal(exclusive.get('rules-dialog').open,false);assert.equal(exclusive.get('balance-dialog').open,true);
assert.equal(exclusive.phase(),'ready');assert.equal(exclusive.timers.size,0);
exclusive.get('balance-dialog').close();exclusive.start();enterCycle(exclusive);
exclusive.get('action').click();exclusive.get('rules-start').click();
assert.equal(exclusive.get('rules-dialog').open,false);assert.equal(exclusive.phase(),'hunt');

function pauseAndWait(g){
  const phase=g.phase(),score=g.get('score').textContent,saves=g.saved.length;
  g.get('pause').click();assert.equal(g.get('pause-dialog').open,true);
  assert.equal(g.get('room').dataset.paused,'true');assert.equal(g.root.dataset.paused,'true');
  assert.equal(g.timers.size,0);g.advance(120000);
  g.slots().forEach((_,i)=>g.click(i));g.get('room').click();g.start();
  assert.equal(g.phase(),phase);assert.equal(g.get('score').textContent,score);assert.equal(g.saved.length,saves);
  assert.equal(g.timers.size,0);assert.equal(g.get('pause-dialog').open,true);
}
function resume(g,cancel=false){
  if(cancel){
    const event={preventDefault(){this.defaultPrevented=true;}};
    g.get('pause-dialog').emit('cancel',event);assert.equal(event.defaultPrevented,true);
  }else g.get('pause-resume').click();
  assert.equal(g.get('pause-dialog').open,false);
  assert.equal(g.get('room').dataset.paused,'false');assert.equal(g.root.dataset.paused,'false');
}

const memoryPause=game();memoryPause.start();memoryPause.advance(250+120);
assert.equal(memoryPause.phase(),'memory');const remembered=memoryPause.slots().map(slot=>slot.innerHTML);
pauseAndWait(memoryPause);assert.deepEqual(memoryPause.slots().map(slot=>slot.innerHTML),remembered);
resume(memoryPause);memoryPause.advance(379.9);assert.equal(memoryPause.phase(),'memory');
memoryPause.advance(.1);assert.equal(memoryPause.phase(),'hide');
memoryPause.advance(40);assert.equal(memoryPause.phase(),'hunt');

const {g:chainPause,b:cpb}=startRun();chainPause.click(cpb.target[0]);chainPause.advance(100);
pauseAndWait(chainPause);resume(chainPause,true);chainPause.advance(350);chainPause.click(cpb.target[1]);
assert.match(newest(chainPause).innerHTML,/2 COMBO!.*\+0\.12초/);
assert.equal(chainPause.get('clock').textContent,'1.27초');
chainPause.advance(1269.9);assert.equal(chainPause.phase(),'hunt');chainPause.advance(.1);
assert.equal(chainPause.phase(),'over');assert.equal(chainPause.saved[0].result.caught,2);assert.equal(chainPause.timers.size,0);

for(const [phase,elapsed,remaining,next] of [
  ['prepare',100,150,'memory'],['hide',250+500+10,30,'hunt'],
  ['impact',30,50,'tremble'],['tremble',80+100,180,'prepare']
]){
  const transitionPause=game();transitionPause.start();
  if(['impact','tremble'].includes(phase))enterCycle(transitionPause).target.forEach(i=>transitionPause.click(i));
  transitionPause.advance(elapsed);assert.equal(transitionPause.phase(),phase);
  pauseAndWait(transitionPause);resume(transitionPause);
  transitionPause.advance(remaining-.1);assert.equal(transitionPause.phase(),phase);
  transitionPause.advance(.1);assert.equal(transitionPause.phase(),next);
}

const {g:quitPause,b:qpb}=startRun();quitPause.click(qpb.target[0]);pauseAndWait(quitPause);
quitPause.get('pause-quit').click();assert.equal(quitPause.get('pause-dialog').open,false);
assert.equal(quitPause.phase(),'ready');assert.equal(quitPause.timers.size,0);
const quitSaves=quitPause.saved.length;
quitPause.advance(120000);assert.equal(quitPause.phase(),'ready');assert.equal(quitPause.saved.length,quitSaves);
quitPause.start();enterCycle(quitPause);assert.equal(quitPause.get('score').textContent,'명중 0');

function assertPauseUnavailable(g){
  const phase=g.phase();assert.equal(g.get('pause').disabled,true);g.get('pause').click();
  assert.equal(g.get('pause-dialog').open,false);assert.equal(g.phase(),phase);
}
const failPause=game();assertPauseUnavailable(failPause);
let failureBoard=startRun(failPause).b;failPause.click(failureBoard.empty[0]);assertPauseUnavailable(failPause);
failPause.advance(1350);assertPauseUnavailable(failPause);
failureBoard=startRun(failPause).b;failPause.click(failureBoard.decoy[0]);assertPauseUnavailable(failPause);
failPause.advance(80);assertPauseUnavailable(failPause);failPause.advance(900);assertPauseUnavailable(failPause);

// A pause click queued at the deadline must finish exactly once, not revive expired time.
const duePrepare=game({audio:true});duePrepare.start();duePrepare.jump(duePrepare.now()+250);duePrepare.get('pause').click();
assert.equal(duePrepare.get('pause-dialog').open,false);assert.equal(duePrepare.phase(),'memory');assert.equal(duePrepare.timers.size,2);
duePrepare.advance(0);assert.equal(duePrepare.audioLog.tones.length,2);
duePrepare.advance(500);assert.equal(duePrepare.phase(),'hide');
const {g:dueHunt}=startRun();dueHunt.jump(dueHunt.now()+1600);dueHunt.get('pause').click();
assert.equal(dueHunt.get('pause-dialog').open,false);assert.equal(dueHunt.phase(),'over');assert.equal(dueHunt.timers.size,0);
dueHunt.get('pause-resume').click();dueHunt.advance(120000);
assert.equal(dueHunt.phase(),'over');assert.equal(dueHunt.saved.length,1);assert.equal(dueHunt.saved[0].result.reason,'시간 초과');

const g=game();g.start();let total=0;
for(let cycle=0;cycle<30;cycle++){
  const b=enterCycle(g,cycle);
  b.target.forEach((i,n)=>{g.click(i);total++;assert.equal(g.get('score').textContent,'명중 '+total);assert.match(newest(g).innerHTML,n===0?/PERFECT!/:new RegExp((n+1)+' COMBO!'));});
  assert.equal(g.saved.length,0);resolveImpact(g,b.decoy.length);
}
assert.equal(total,177);assert.equal(g.get('best').textContent,'최고 177');
const finalBoard=enterCycle(g,30);g.click(finalBoard.empty[0]);assert.equal(g.phase(),'laugh');assertLocked(g);
assert.equal(g.saved.length,1);assert.equal(g.saved[0].best,177);
assert.equal(g.saved[0].result.caught,177);assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-ha')).length,11);
g.advance(1349);assert.equal(g.phase(),'laugh');g.advance(1);assert.equal(g.phase(),'over');assert.equal(g.timers.size,0);
g.start();const reset=enterCycle(g);assert.deepEqual([reset.memory,reset.hunt],[500,1600]);assert.equal(g.get('score').textContent,'명중 0');
g.advance(1600);assert.equal(g.phase(),'over');assert.equal(g.timers.size,0);assert.equal(g.saved.length,2);

const {g:repeat,b:rb}=startRun();repeat.click(rb.target[0]);repeat.click(rb.target[0]);
assert.equal(repeat.phase(),'laugh');assert.equal(repeat.saved[0].result.caught,1);assert.equal(repeat.saved[0].result.reason,'허공 사격');
assertLocked(repeat);
const {g:background}=startRun();background.get('room').click();assert.equal(background.phase(),'laugh');assert.equal(background.saved.length,1);

for(const keyboard of [false,true]){
  const {g:scare,b}=startRun(),index=b.decoy[0],cell=scare.slots()[index].rect;
  const event=keyboard?{}:{detail:1,clientX:cell.left+8,clientY:cell.top+16};
  assert.ok(scare.click(index,event).stopped);
  assert.equal(scare.phase(),'scare-reveal');assert.equal(scare.saved.length,1);assert.equal(scare.saved[0].result.reason,'금지 유령 명중');
  assert.deepEqual([scare.types('target').length,scare.types('decoy').length],[4,3]);
  assertLocked(scare);scare.click(index,event);assert.equal(scare.saved.length,1);
  assert.equal(scare.get('fail-splash').children.length,0);
  scare.advance(79.9);assert.equal(scare.phase(),'scare-reveal');scare.advance(.1);assert.equal(scare.phase(),'scare-pop');
  assert.equal(scare.get('fail-splash').children.length,2);
  const actor=scare.get('fail-splash').children.find(c=>c.className==='cj-pop-actor');
  const x=cell.left+cell.width/2,y=cell.top+cell.height/2;
  assert.equal(actor.style.left,x+'px');assert.equal(actor.style.top,y+'px');
  assert.equal(actor.style['--tx'],195-x+'px');assert.equal(actor.style['--ty'],844*.44-y+'px');assertLocked(scare);
  assert.equal(scare.slots().filter(s=>s.className.includes('is-spooked')).length,1);
  scare.advance(899.9);assert.equal(scare.phase(),'scare-pop');scare.advance(.1);assert.equal(scare.phase(),'over');assert.equal(scare.timers.size,0);assert.equal(scare.saved.length,1);
  scare.start();assert.equal(scare.get('fail-splash').children.length,0);
  enterCycle(scare);scare.advance(500);assert.equal(scare.phase(),'hunt');assert.equal(scare.timers.size,2);
}
const {g:deadlineDecoy,b:db}=startRun();
deadlineDecoy.jump(deadlineDecoy.now()+1600);deadlineDecoy.click(db.decoy[0]);
assert.equal(deadlineDecoy.phase(),'over');assert.equal(deadlineDecoy.saved[0].result.reason,'시간 초과');assert.equal(deadlineDecoy.timers.size,0);

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

function sampleCycle(cycle,options){
  const sample=game(options);sample.start();
  for(let n=0;n<cycle;n++){
    const board=enterCycle(sample,n);board.target.forEach(i=>sample.click(i));resolveImpact(sample,board.decoy.length);
  }
  return {g:sample,b:enterCycle(sample,cycle)};
}
for(const [cycle,memory,hunt] of [[1,484,1518],[5,418,1191],[10,336,782],[11,320,700],[12,320,700]]){
  const {g:s,b}=sampleCycle(cycle);assert.deepEqual([b.memory,b.hunt],[memory,hunt]);
  s.advance(hunt-.1);assert.equal(s.phase(),'hunt');s.advance(.1);assert.equal(s.phase(),'over');assert.equal(s.timers.size,0);
}
// A delayed READY callback and a long session cannot accelerate a low-numbered stage.
const delayed=game();delayed.start();delayed.jump(120000);delayed.advance(0);
assert.equal(delayed.phase(),'memory');assert.equal(delayed.get('clock').textContent,'0.50초');
const delayedTargets=delayed.types('target');delayed.advance(499.9);assert.equal(delayed.phase(),'memory');
delayed.advance(.1+40);assert.equal(delayed.phase(),'hunt');assert.equal(delayed.get('clock').textContent,'1.60초');
delayedTargets.forEach(i=>delayed.click(i));resolveImpact(delayed);
const delayedNext=enterCycle(delayed,1);assert.deepEqual([delayedNext.memory,delayedNext.hunt],[484,1518]);
delayed.advance(1518);assert.equal(delayed.phase(),'over');delayed.start();
assert.deepEqual([enterCycle(delayed).memory,parseFloat(delayed.get('clock').textContent)],[500,1.6]);
for(const [cycle,memory,hunt] of [[0,1200,2400],[11,320,700]]){
  const {b}=sampleCycle(cycle,{defaults:LIVE_DEFAULTS});assert.deepEqual([b.memory,b.hunt],[memory,hunt]);
}
const {g:rapid,b:rapidBoard}=sampleCycle(11),rapidStart=rapid.now();
for(const [index,at] of [180,570,760,930,1110,1300].entries()){
  rapid.advance(rapidStart+at-rapid.now());assert.equal(rapid.phase(),'hunt');rapid.click(rapidBoard.target[index]);
  const bonus=[0,120,160,200,200,200][index];if(bonus)assert.ok(newest(rapid).innerHTML.includes('+'+(bonus/1000).toFixed(2)+'초'));
}
assert.equal(rapid.phase(),'impact');assert.equal(rapid.saved.length,0);resolveImpact(rapid,5);assert.equal(enterCycle(rapid,12).hunt,700);
const {g:noChain,b:nc}=sampleCycle(11);noChain.advance(180);noChain.click(nc.target[0]);noChain.advance(460);noChain.click(nc.target[1]);
noChain.advance(60);assert.equal(noChain.phase(),'over');

const {g:shot,b:sb}=startRun(),cell=shot.slots()[sb.target[0]].rect,point={detail:1,clientX:cell.left+13,clientY:cell.top+19};
assert.ok(shot.click(sb.target[0],point).stopped);let effect=newest(shot);
assert.equal(parseFloat(effect.style.left),(point.clientX-10)/360*100);assert.equal(parseFloat(effect.style.top),(point.clientY-20)/480*100);assertHidden(shot);
const curse=shot.get('effects').children.find(e=>e.className==='cj-curse');assert.ok(curse);curse.emit('animationend',{target:curse});assert.equal(curse.parent,null);
effect.emit('animationend',{target:{}});assert.ok(effect.parent);effect.emit('animationend',{target:effect});assert.equal(effect.parent,null);
shot.click(sb.target[1]);assert.match(newest(shot).innerHTML,/2 COMBO!/);

// Pointer aiming resolves from coordinates, including taps arriving on an empty button or the room.
for(const onEmptyButton of [false,true]){
  const {g:aim,b}=startRun(),target=b.target[0],empty=b.empty[0];
  aim.slots().forEach((button,i)=>button.rect={left:1000+i*100,top:1000,width:80,height:80});
  aim.slots()[target].rect={left:100,top:100,width:80,height:80};
  aim.slots()[empty].rect={left:190,top:100,width:80,height:80};
  const tap={detail:1,clientX:onEmptyButton?191:85,clientY:140};
  if(onEmptyButton)aim.click(empty,tap);else aim.get('room').click(tap);
  assert.equal(aim.phase(),'hunt');assert.equal(aim.get('score').textContent,'명중 1');
  assert.ok(aim.slots()[target].className.includes('is-caught'));assertHidden(aim);
  // The forgiving margin does not forgive tapping the already caught slot itself.
  aim.click(target,{detail:1,clientX:140,clientY:140});
  assert.equal(aim.phase(),'laugh');assert.equal(aim.saved[0].result.caught,1);
}
const {g:farMiss}=startRun();farMiss.get('room').click({detail:1,clientX:-100,clientY:-100});
assert.equal(farMiss.phase(),'laugh');assert.equal(farMiss.saved[0].result.reason,'허공 사격');

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
custom.transition.firstPrepare=.1;custom.transition.blackout=.2;custom.effects.fogEnabled=0;
custom.combo.window=.6;custom.combo.bonusStart=.3;custom.combo.bonusMax=.5;
settings.editor.onSave(custom);assert.ok(settings.storage.has('catjump-memory-room-balance-v1'));
assert.equal(settings.get('clock').textContent,'0.80초 기억');
settings.get('balance-dialog').open=false;settings.start();assert.equal(settings.get('balance-open').disabled,true);
assert.equal(settings.editor.onOpen(),false);
settings.advance(100);assert.equal(settings.phase(),'memory');const customTargets=settings.types('target');
settings.advance(800);assert.equal(settings.phase(),'hide');settings.advance(200);assert.equal(settings.phase(),'hunt');
assert.equal(settings.get('clock').textContent,'3.00초');
settings.click(customTargets[0]);settings.advance(550);settings.click(customTargets[1]);
assert.match(newest(settings).innerHTML,/2 COMBO!.*\+0\.30초/);assert.equal(settings.get('effects').children.filter(e=>e.className==='cj-curse').length,0);
settings.get('room').click();settings.advance(1350);assert.equal(settings.get('balance-open').disabled,false);
settings.editor.onSave(structuredClone(DEFAULT_CONFIG));assert.equal(settings.storage.has('catjump-memory-room-balance-v1'),false);

// Older balance files must preserve tuning while losing the moving obstruction entirely.
const legacy=structuredClone(DEFAULT_CONFIG);legacy.combo.window=.6;
legacy.haunt={enabled:1,warning:.12,travelStart:.68,travelMin:.52,max:2,extraAtCombo:2,extraAtProgress:.5};
const restored=game({config:legacy});
const upgradedReady=game({config:legacy,defaults:LIVE_DEFAULTS}).editor.getConfig();
assert.equal(upgradedReady.transition.firstPrepare,LIVE_DEFAULTS.transition.firstPrepare);
assert.equal(upgradedReady.transition.prepare,LIVE_DEFAULTS.transition.prepare);
assert.equal(upgradedReady.combo.window,legacy.combo.window);
const customReady=structuredClone(legacy);customReady.transition.prepare=1.2;
assert.equal(game({config:customReady,defaults:LIVE_DEFAULTS}).editor.getConfig().transition.prepare,1.2);
const timedLegacy=structuredClone(legacy);delete timedLegacy.difficulty.rampRounds;timedLegacy.difficulty.rampSeconds=30;
const migratedGame=game({config:timedLegacy,defaults:LIVE_DEFAULTS}),migrated=migratedGame.editor.getConfig();
assert.deepEqual([migrated.difficulty.rampRounds,migrated.difficulty.memoryStart,migrated.difficulty.huntStart],[12,1.2,2.4]);
assert.equal('rampSeconds' in migrated.difficulty,false);assert.equal(migrated.combo.window,.6);
assert.equal(migrated.transition.firstPrepare,.8);assert.equal(migrated.transition.prepare,.65);
assert.deepEqual([startRun(migratedGame).b.memory,parseFloat(migratedGame.get('clock').textContent)],[1200,2.4]);
const customTimes=structuredClone(timedLegacy);customTimes.difficulty.memoryStart=.9;customTimes.difficulty.huntStart=3;
const preserved=game({config:customTimes,defaults:LIVE_DEFAULTS}).editor.getConfig();
assert.deepEqual([preserved.difficulty.rampRounds,preserved.difficulty.memoryStart,preserved.difficulty.huntStart],[12,.9,3]);
assert.equal(restored.editor.getConfig().combo.window,.6);assert.equal('haunt' in restored.editor.getConfig(),false);
const restoredBoard=startRun(restored).b,originalButtons=[...restored.slots()];
restoredBoard.target.forEach((index,n)=>{
  restored.advance(n===0?400:100);
  const rect=restored.slots()[index].rect;
  restored.click(index,{detail:1,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});
  assert.equal(restored.get('score').textContent,'명중 '+(n+1));
  assert.match(newest(restored).innerHTML,n===0?/PERFECT!/:new RegExp((n+1)+' COMBO!'));
});
assert.equal(restored.phase(),'impact');assert.equal(restored.saved.length,0);
assert.equal(restored.nodes.has('haunts'),false);
assert.deepEqual(restored.created.filter(node=>node.tag==='button'),originalButtons);
resolveImpact(restored);

for(const noFilter of [false,true]){
  const aGame=game({audio:true,noFilter}),b=startRun(aGame).b,a=aGame.audioLog;
  assert.equal(a.contexts,1);assert.equal(a.resumes,1);assert.equal(a.tones.length,2);assert.equal(a.noise.length,0);
  aGame.click(b.target[0]);assert.equal(a.tones.length,7);assert.equal(a.noise.length,1);
  aGame.click(b.empty[0]);assert.equal(a.tones.length,19);assert.equal(a.noise.length,2);
  assert.equal(a.filters.filter(f=>f.frequency.value===850).length,noFilter?0:5);
}
const audioScare=game({audio:true}),asd=startRun(audioScare).b,sa=audioScare.audioLog;
audioScare.click(asd.decoy[0]);assert.equal(sa.tones.length,12);assert.equal(sa.noise.length,1);
assert.deepEqual(sa.filters.map(f=>f.frequency.value),[2200,1750,2200,1750,2200,1750]);
audioScare.advance(80);assert.equal(sa.tones.length,15);
const pulse=game({audio:true});startRun(pulse);pulse.advance(899);assert.equal(pulse.audioLog.tones.filter(t=>t.frequency.start.value===90).length,0);
pulse.advance(1);assert.equal(pulse.audioLog.tones.filter(t=>t.frequency.start.value===90).length,1);pulse.advance(500);
const pulses=pulse.audioLog.tones.filter(t=>t.frequency.start.value===90);assert.equal(pulses.length,3);
assert.ok(pulses.slice(1).every((t,i)=>t.createdNow-pulses[i].createdNow>=220));
const muted=game({audio:true}),mb=startRun(muted).b,ma=muted.audioLog;muted.get('sound').click();const before=ma.tones.length;
muted.click(mb.target[0]);muted.advance(1000);assert.equal(ma.tones.length,before);assert.equal(ma.noise.length,0);
const shiver=game({audio:true}),shb=startRun(shiver).b;shb.target.forEach(i=>shiver.click(i));const tonesBefore=shiver.audioLog.tones.length;
shiver.advance(80);assert.equal(shiver.audioLog.tones.length,tonesBefore+7);assert.ok(shiver.audioLog.tones.slice(-7).every(t=>t.stoppedAt<=.28));
console.log('PASS: pause/resume preserves memory, combo, deadlines and phase transitions; pause quit cleanup and failure lockout; rules confirmation/cancel/retry and exclusive settings; 30 cycles/177 score; stage-12 difficulty cap independent of elapsed time; slower opening and legacy balance migration; sub-ms phase/deadline boundaries; 450ms combo rearming and six-hit survival; static decoys without moving ghosts; failures, records, curse, snicker/pulse/shiver and mute.');

})().catch(error=>{console.error(error);process.exitCode=1;});
