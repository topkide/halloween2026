const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Pin a representative balance for timing regressions, independent of live tuning.
(async()=>{
const {validateConfig,parseBalanceDB,DEFAULT_CONFIG:LIVE_DEFAULTS}=await import('../balance-config.mjs');
const {difficultyAt,createBoard,comboBonus,hitSlot}=await import('../game-core.mjs');
const {COLLECTIONS}=await import('../collections.mjs');
const DEFAULT_CONFIG=validateConfig({"version": 1, "game": "memory-room", "difficulty": {"rampRounds": 12, "memoryStart": 0.5, "memoryMin": 0.32, "huntStart": 1.6, "huntMin": 0.7, "targetsStart": 4, "targetsMax": 6, "decoysStart": 3, "decoysMax": 5}, "combo": {"window": 0.45, "bonusStart": 0.12, "bonusStep": 0.04, "bonusMax": 0.2}, "transition": {"firstPrepare": 0.25, "prepare": 0.12, "blackout": 0.04, "impact": 0.08, "tremble": 0.28}, "effects": {"fogEnabled": 1, "fogDuration": 0.48, "heartbeatBelow": 0.7, "heartbeatInterval": 0.22}});
const script=fs.readFileSync(require('node:path').join(__dirname,'../app.mjs'),'utf8').replace(/^import .*;$/gm,'');
const EVENT_KEY='catjump-event-lobby-v1';
const PROGRESS_KEY='catjump-event-progress-v1';
function game(options={}) {
  let now = 0, serial = 0;
  const timers = new Map(), nodes = new Map(), created = [], saved = [],progressSaved=[],storage=new Map();let editor;
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
    let overrideRect;
    return { dataset:{}, style:{setProperty(key,value){this[key]=value;}}, attrs:{}, children:[], handlers:{}, innerHTML:'', textContent:'', parent:null,open:false,
      get rect(){
        if(overrideRect)return overrideRect;
        if(this.parent===nodes.get('spots')){
          const grid=Math.round(Math.sqrt(this.parent.children.length)),index=this.parent.children.indexOf(this),step=330/grid;
          return {left:30+(index%grid)*step,top:66+Math.floor(index/grid)*step,width:step-10,height:step-10};
        }
        return {left:10,top:20,width:360,height:480};
      },
      set rect(value){overrideRect=value;},
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
  if(options.lobby!==undefined)storage.set(EVENT_KEY,JSON.stringify(options.lobby));
  if(options.progress!==undefined)storage.set(PROGRESS_KEY,JSON.stringify(options.progress));
  const controlledMath=Object.create(Math);controlledMath.random=options.random||(()=>.5);
  vm.runInNewContext(script, {
    DEFAULT_CONFIG:options.defaults||DEFAULT_CONFIG,validateConfig,parseBalanceDB,difficultyAt,createBoard,comboBonus,hitSlot,COLLECTIONS,structuredClone,Math:controlledMath,
    createBalanceEditor(callbacks){editor=callbacks;return {open(){if(callbacks.onOpen()===false)return;get('balance-dialog').open=true;}};},
    localStorage:{getItem:key=>options.corruptStorage?'broken json':storage.get(key)??null,
      setItem(key,value){if(options.blockStorage)throw Error('Storage denied');storage.set(key,value);if(key==='catjump-memory-room-state-v1')saved.push(JSON.parse(value));if(key===PROGRESS_KEY)progressSaved.push(JSON.parse(value));},
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
  return {
    get, root, nodes, created, saved, progressSaved, timers, audioLog, storage, editor,now:()=>now,
    phase:() => get('room').dataset.phase,
    slots:() => get('spots').children,
    types(type) { return this.slots().flatMap((s,i)=>{
      const collector=s.innerHTML.includes(' collector');
      return (type==='empty'?!s.innerHTML:type==='collection'?collector:s.innerHTML.includes('cj-ghost '+type)&&!collector)?[i]:[];
    }); },
    click(i,event) { return this.slots()[i].click(event); },
    start() { get(this.phase()==='ready'?'lobby-start':get('result-dialog').open?'result-retry':'action').click();if(get('rules-dialog').open)get('rules-start').click(); },
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
function enterCycle(g,cycle=0,continued=false){
  const {difficulty:d,transition:t}=g.editor.getConfig(),ramp=Math.min(1,cycle/(d.rampRounds-1));
  const grid=cycle<3?3:cycle<7?4:cycle<11?5:6,cells=grid*grid;
  const count=Math.min(d.targetsMax,d.targetsStart+Math.floor(cycle/3),cells-2);
  const decoys=Math.min(d.decoysMax,d.decoysStart+Math.floor(cycle/2),cells-count-1);
  const memory=Math.round(Math.round((d.memoryStart-(d.memoryStart-d.memoryMin)*ramp)*1000)*(continued?1.15:1));
  const hunt=Math.round(Math.round((d.huntStart-(d.huntStart-d.huntMin)*ramp)*1000)*(continued?1.15:1)),prepare=(cycle===0?t.firstPrepare:t.prepare)*1000;
  assert.equal(g.phase(),'prepare');assertHidden(g);assertLocked(g);
  for(const id of ['effects','fail-splash'])assert.equal(g.get(id).children.length,0);
  assert.ok(g.slots().every(s=>s.attrs['aria-label'].includes('숨겨진 자리')));
  g.advance(prepare-1);assert.equal(g.phase(),'prepare');g.advance(1);assert.equal(g.phase(),'memory');
  const b={target:g.types('target'),decoy:g.types('decoy'),collection:g.types('collection'),empty:g.types('empty'),memory,hunt,ramp,grid};
  assert.equal(g.slots().length,cells);
  assert.deepEqual([b.target.length,b.decoy.length,b.empty.length],[count,decoys,cells-count-decoys-b.collection.length]);
  assertLocked(g);g.advance(memory-.1);assert.equal(g.phase(),'memory');
  g.advance(.1);assert.equal(g.phase(),'hide');assertHidden(g);assertLocked(g);
  g.advance(t.blackout*1000-.1);assert.equal(g.phase(),'hide');g.advance(.1);assert.equal(g.phase(),'hunt');
  assert.equal(g.get('clock').textContent,(hunt/1000).toFixed(2)+'초');assertHidden(g);
  assert.equal(g.nodes.has('haunts'),false);
  return b;
}
function startRun(g=game()){g.start();return {g,b:enterCycle(g)};}
function decline(g){
  if(g.phase()==='continue')g.get('continue-back').click();
  assert.equal(g.phase(),'over');
}
function resolveImpact(g,decoys=3){
  assert.equal(g.phase(),'impact');assertHidden(g);assertLocked(g);
  g.advance(79.9);assert.equal(g.phase(),'impact');g.advance(.1);assert.equal(g.phase(),'tremble');assertLocked(g);
  assert.equal(g.types('target').length,0);assert.equal(g.types('decoy').length,decoys);
  assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-fear')&&s.innerHTML.includes('cj-sweat')).length,decoys);
  assert.equal(g.get('effects').children.length,0);
  g.advance(279.9);assert.equal(g.phase(),'tremble');g.advance(.1);assert.equal(g.phase(),'prepare');assert.equal(g.timers.size,1);
}
const newest=g=>g.get('effects').children.filter(e=>e.className?.startsWith('cj-impact ')).at(-1);
const impactText=g=>newest(g).innerHTML.replace(/<[^>]*>/g,'');
const tickets=g=>parseInt(g.get('lobby-tickets').textContent,10);
const wallet=g=>Number(g.get('lobby-currency').textContent.replaceAll(',',''));
const progress=g=>JSON.parse(g.storage.get(PROGRESS_KEY));
function cancelDialog(g,id){const event={preventDefault(){this.defaultPrevented=true;}};g.get(id).emit('cancel',event);assert.equal(event.defaultPrevented,true);}
function continueAd(g,cycle){
  const beforeTickets=tickets(g),beforeScore=g.get('score').textContent;
  assert.equal(g.phase(),'continue');assert.equal(g.get('continue-dialog').open,true);
  assert.equal(g.timers.size,0);g.advance(120000);
  g.get('continue-watch').click();g.get('continue-watch').click();g.advance(2999.9);
  assert.equal(g.phase(),'continue');g.advance(.1);
  assert.equal(g.get('continue-dialog').open,false);assert.equal(g.phase(),'prepare');
  assert.equal(tickets(g),beforeTickets);assert.equal(g.get('score').textContent,beforeScore);
  return enterCycle(g,Math.max(0,cycle-3),true);
}

// The ad is explicit and completes once; only active play contributes to the result time.
const {g:continuing,b:ctb}=startRun();continuing.advance(400);continuing.click(ctb.target[0]);
pauseAndWait(continuing);resume(continuing);continuing.advance(400);continuing.click(ctb.empty[0]);
assert.equal(wallet(continuing),0);continuing.advance(1350);assert.equal(continuing.phase(),'continue');
const continuedBoard=continueAd(continuing,0);assert.equal(wallet(continuing),0);
continuing.advance(400);continuing.click(continuedBoard.target[0]);continuing.click(continuedBoard.empty[0]);continuing.advance(1350);
assert.equal(continuing.phase(),'over');assert.equal(continuing.get('result-dialog').open,true);
assert.equal(continuing.get('continue-dialog').open,false);assert.equal(progress(continuing).wallet,2);
assert.equal(continuing.saved.at(-1).result.playTime,2);assert.equal(continuing.saved.at(-1).result.caught,2);
continuing.get('continue-watch').click();continuing.get('continue-back').click();continuing.advance(5000);
assert.equal(continuing.phase(),'over');assert.equal(progress(continuing).wallet,2);assert.equal(continuing.progressSaved.length,1);
continuing.get('result-retry').click();assert.equal(continuing.get('rules-dialog').open,true);assert.equal(tickets(continuing),2);
continuing.get('rules-close').click();assert.equal(continuing.get('result-dialog').open,true);assert.equal(tickets(continuing),2);
continuing.get('result-back').click();assert.equal(continuing.phase(),'ready');assert.equal(progress(continuing).wallet,2);

const {g:larger,b:largerBoard}=sampleCycle(7);assert.equal(largerBoard.grid,5);
larger.click(largerBoard.target[0]);larger.advance(largerBoard.hunt);
const smaller=continueAd(larger,7);assert.equal(smaller.grid,4);
larger.advance(smaller.hunt);assert.equal(larger.phase(),'over');assert.equal(larger.get('result-dialog').open,true);

const {g:cancelAd,b:cancelBoard}=startRun();cancelAd.click(cancelBoard.target[0]);cancelAd.get('room').click();cancelAd.advance(1350);
cancelAd.get('continue-watch').click();cancelAd.advance(2999);cancelDialog(cancelAd,'continue-dialog');
assert.equal(cancelAd.phase(),'over');assert.equal(wallet(cancelAd),1);cancelAd.advance(5000);
assert.equal(cancelAd.phase(),'over');assert.equal(cancelAd.timers.size,0);assert.equal(cancelAd.progressSaved.length,1);
cancelAd.get('result-double').click();cancelAd.advance(1000);cancelDialog(cancelAd,'result-dialog');cancelAd.advance(5000);
assert.equal(cancelAd.phase(),'ready');assert.equal(wallet(cancelAd),1);assert.equal(cancelAd.progressSaved.length,1);
assert.equal(wallet(game({progress:progress(cancelAd)})),1);

const {g:doubleAd,b:doubleBoard}=startRun(game({progress:{wallet:10,collection:[],characterClaimed:false}}));
doubleAd.click(doubleBoard.target[0]);doubleAd.get('room').click();doubleAd.advance(1350);decline(doubleAd);
assert.equal(wallet(doubleAd),11);doubleAd.get('result-double').click();doubleAd.get('result-double').click();
doubleAd.advance(2999.9);assert.equal(wallet(doubleAd),11);doubleAd.advance(.1);assert.equal(wallet(doubleAd),12);
assert.equal(doubleAd.get('result-double').disabled,true);assert.equal(doubleAd.saved.at(-1).result.reward,2);
doubleAd.get('result-double').click();doubleAd.advance(5000);assert.equal(wallet(doubleAd),12);assert.equal(doubleAd.progressSaved.length,2);

// Force rare spawns without changing the real game RNG; optional ghosts never gate a clear.
const rare=game({random:()=>0});rare.start();rare.advance(250);
const rareTargets=rare.types('target'),rareSlot=rare.types('collection')[0];assert.notEqual(rareSlot,undefined);
rare.advance(125);pauseAndWait(rare);resume(rare);rare.advance(124.9);
assert.equal(rare.slots()[rareSlot].className.includes('optional-faded'),false);
rare.advance(.1);assert.equal(rare.slots()[rareSlot].className.includes('optional-faded'),true);
rare.advance(250+40);assert.equal(rare.phase(),'hunt');rare.advance(1200);rare.click(rareSlot);
assert.deepEqual(progress(rare).collection,[COLLECTIONS[0].id]);assert.equal(wallet(rare),0);
assert.equal(rare.phase(),'hunt');rareTargets.forEach(i=>rare.click(i));assert.equal(rare.phase(),'impact');
assert.equal(rare.get('score').textContent,'명중 5');resolveImpact(rare);
const secondRare=enterCycle(rare,1);assert.equal(secondRare.collection.length,1);rare.click(secondRare.collection[0]);
assert.deepEqual(progress(rare).collection,COLLECTIONS.slice(0,2).map(item=>item.id));
rare.click(secondRare.empty[0]);rare.advance(1350);const afterRareContinue=continueAd(rare,1);
assert.equal(afterRareContinue.collection.length,0);assert.equal(rare.get('collection-count').textContent,'수집 2 / 2');
afterRareContinue.target.forEach(i=>rare.click(i));resolveImpact(rare);
assert.equal(enterCycle(rare,1,true).collection.length,0);rare.get('room').click();rare.advance(1350);
assert.equal(rare.phase(),'over');assert.equal(progress(rare).wallet,10);assert.equal(rare.saved.at(-1).result.collections.length,2);
rare.get('result-back').click();const newRareBoard=startRun(rare).b;assert.equal(newRareBoard.collection.length,1);
rare.click(newRareBoard.collection[0]);assert.deepEqual(progress(rare).collection,COLLECTIONS.slice(0,3).map(item=>item.id));
rare.get('room').click();rare.advance(1350);assert.equal(rare.phase(),'continue');decline(rare);
assert.equal(wallet(rare),11);assert.equal(tickets(rare),1);

const {g:ignoredRare,b:irb}=startRun(game({random:()=>0}));assert.equal(irb.collection.length,1);
irb.target.forEach(i=>ignoredRare.click(i));assert.equal(ignoredRare.phase(),'impact');assert.equal(wallet(ignoredRare),0);
assert.equal(ignoredRare.progressSaved.length,0);resolveImpact(ignoredRare);
assert.equal(enterCycle(ignoredRare,1).collection.length,1);
for(const [random,count] of [[.049,1],[.05,0]])assert.equal(startRun(game({random:()=>random})).b.collection.length,count);
const {b:alreadyOwned}=startRun(game({random:()=>0,progress:{wallet:0,collection:COLLECTIONS.map(item=>item.id),characterClaimed:true}}));
assert.equal(alreadyOwned.collection.length,0);

for(const value of [NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1,'4'])assert.equal(wallet(game({progress:{wallet:value}})),0);
const profileUI=game({progress:{wallet:-1,collection:[COLLECTIONS[0].id,COLLECTIONS[0].id,'unknown'],characterClaimed:true}});
assert.equal(wallet(profileUI),0);profileUI.get('lobby-collection').click();assert.equal(profileUI.get('collection-dialog').open,true);
assert.equal(profileUI.get('collection-progress').textContent,'1 / '+COLLECTIONS.length);assert.equal(profileUI.get('collection-claim').disabled,true);
profileUI.get('collection-claim').click();assert.equal(profileUI.progressSaved.length,0);
profileUI.get('lobby-start').click();profileUI.get('lobby-settings').click();
assert.equal(profileUI.get('rules-dialog').open,false);assert.equal(profileUI.get('balance-dialog').open,false);
const fullCollection=game({progress:{wallet:7,collection:COLLECTIONS.map(item=>item.id),characterClaimed:false}});
fullCollection.get('lobby-collection').click();fullCollection.get('collection-claim').click();fullCollection.get('collection-claim').click();
assert.equal(progress(fullCollection).characterClaimed,true);assert.equal(wallet(fullCollection),7);assert.equal(fullCollection.progressSaved.length,1);

for(const gap of [220,230]){
  const {g:quick,b}=startRun(game({defaults:LIVE_DEFAULTS}));quick.click(b.target[0]);quick.advance(gap);quick.click(b.target[1]);
  assert.match(impactText(quick),gap===220?/2 COMBO!/:/PERFECT!/);
}

for(const [lobby,want] of [
  [undefined,3],[null,3],[{},3],[[],3],[{tickets:0},0],[{tickets:8},8],[{tickets:30},30],
  [{tickets:-1},3],[{tickets:31},3],[{tickets:1.5},3],[{tickets:'8'},3],[{tickets:Infinity},3]
])assert.equal(tickets(game({lobby})),want);
assert.equal(tickets(game({corruptStorage:true})),3);

const emptyLobby=game({lobby:{tickets:0}});
emptyLobby.get('lobby-start').click();assert.equal(emptyLobby.get('event-dialog').open,true);
assert.equal(emptyLobby.get('rules-dialog').open,false);assert.match(emptyLobby.get('event-confirm').textContent,/\+3/);
emptyLobby.get('rules-start').click();assert.equal(emptyLobby.phase(),'ready');assert.equal(emptyLobby.timers.size,0);
emptyLobby.get('event-close').click();assert.equal(tickets(emptyLobby),0);
emptyLobby.get('lobby-start').click();emptyLobby.get('event-confirm').click();
assert.equal(tickets(emptyLobby),3);assert.deepEqual(JSON.parse(emptyLobby.storage.get(EVENT_KEY)),{tickets:3});
assert.equal(emptyLobby.phase(),'ready');assert.equal(emptyLobby.get('rules-dialog').open,false);assert.equal(emptyLobby.timers.size,0);
emptyLobby.get('event-confirm').click();assert.equal(tickets(emptyLobby),3);
emptyLobby.start();assert.equal(tickets(emptyLobby),2);enterCycle(emptyLobby);
emptyLobby.get('lobby-start').click();emptyLobby.get('lobby-bonus').click();emptyLobby.get('lobby-settings').click();
assert.equal(emptyLobby.get('rules-dialog').open,false);assert.equal(emptyLobby.get('event-dialog').open,false);
assert.equal(emptyLobby.get('balance-dialog').open,false);assert.equal(emptyLobby.phase(),'hunt');

const {g:lastTicket}=startRun(game({lobby:{tickets:1}}));assert.equal(tickets(lastTicket),0);
lastTicket.advance(1600);decline(lastTicket);lastTicket.get('result-retry').click();
assert.equal(lastTicket.get('rules-dialog').open,false);assert.equal(lastTicket.get('event-dialog').open,true);
lastTicket.get('event-close').click();lastTicket.get('home').click();
assert.equal(lastTicket.phase(),'ready');assert.equal(tickets(lastTicket),0);assert.equal(lastTicket.timers.size,0);
lastTicket.advance(120000);assert.equal(lastTicket.phase(),'ready');assert.equal(tickets(lastTicket),0);

const bonusLobby=game({lobby:{tickets:28}});
bonusLobby.get('lobby-bonus').click();assert.equal(tickets(bonusLobby),28);
bonusLobby.get('event-close').click();bonusLobby.get('event-confirm').click();assert.equal(tickets(bonusLobby),28);
bonusLobby.get('lobby-bonus').click();bonusLobby.get('event-confirm').click();
assert.equal(tickets(bonusLobby),30);assert.deepEqual(JSON.parse(bonusLobby.storage.get(EVENT_KEY)),{tickets:30});
bonusLobby.get('lobby-bonus').click();assert.equal(bonusLobby.get('event-dialog').open,true);
assert.equal(bonusLobby.get('event-confirm').hidden,true);bonusLobby.get('event-confirm').click();assert.equal(tickets(bonusLobby),30);
assert.equal(tickets(game({lobby:JSON.parse(bonusLobby.storage.get(EVENT_KEY))})),30);

const previewLobby=game();
for(const id of ['lobby-package','lobby-shop','lobby-close']){
  const before=[...previewLobby.storage.entries()];
  previewLobby.get(id).click();assert.equal(previewLobby.get('event-dialog').open,true);
  previewLobby.get('lobby-start').click();previewLobby.get('rules-start').click();previewLobby.get('lobby-settings').click();
  assert.equal(previewLobby.get('rules-dialog').open,false);assert.equal(previewLobby.get('balance-dialog').open,false);
  previewLobby.advance(120000);assert.equal(previewLobby.phase(),'ready');assert.equal(previewLobby.timers.size,0);
  previewLobby.get('event-close').click();assert.equal(tickets(previewLobby),3);assert.deepEqual([...previewLobby.storage.entries()],before);
}
previewLobby.get('lobby-settings').click();assert.equal(previewLobby.get('balance-dialog').open,true);
previewLobby.get('lobby-bonus').click();previewLobby.get('lobby-start').click();
assert.equal(previewLobby.get('event-dialog').open,false);assert.equal(previewLobby.get('rules-dialog').open,false);
previewLobby.get('balance-dialog').close();previewLobby.get('lobby-start').click();previewLobby.get('lobby-bonus').click();
assert.equal(previewLobby.get('rules-dialog').open,true);assert.equal(previewLobby.get('event-dialog').open,false);

// Reading or dismissing the rules must never start the clock, audio, or a new run.
const guide=game({audio:true,saved:{best:42}}),rulesDialog=guide.get('rules-dialog');
assert.equal(tickets(guide),3);
guide.get('rules-start').click();assert.equal(guide.phase(),'ready');
guide.get('action').click();assert.equal(rulesDialog.open,true);assert.equal(guide.phase(),'ready');
guide.get('action').click();guide.advance(120000);
assert.equal(rulesDialog.open,true);assert.equal(guide.phase(),'ready');assert.equal(guide.timers.size,0);
assert.equal(guide.get('score').textContent,'명중 0');assert.equal(guide.get('best').textContent,'최고 42');
assert.equal(guide.saved.length,0);assert.equal(guide.audioLog.contexts,0);
guide.get('rules-close').click();assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'ready');
guide.advance(120000);assert.equal(guide.timers.size,0);assert.equal(guide.audioLog.contexts,0);
assert.equal(tickets(guide),3);assert.equal(guide.storage.has(EVENT_KEY),false);
guide.get('action').click();guide.get('rules-start').click();
assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'prepare');assert.equal(guide.timers.size,1);
assert.equal(tickets(guide),2);assert.deepEqual(JSON.parse(guide.storage.get(EVENT_KEY)),{tickets:2});
assert.equal(guide.audioLog.contexts,1);
const guideBoard=enterCycle(guide);guide.click(guideBoard.target[0]);guide.click(guideBoard.empty[0]);guide.advance(1350);
decline(guide);assert.equal(guide.saved.length,1);
guide.get('result-retry').click();assert.equal(rulesDialog.open,true);guide.advance(120000);
decline(guide);assert.equal(guide.get('score').textContent,'명중 1');assert.equal(guide.timers.size,0);
guide.get('rules-close').click();assert.equal(rulesDialog.open,false);assert.equal(guide.get('score').textContent,'명중 1');
assert.equal(tickets(guide),2);
guide.get('result-retry').click();guide.get('rules-start').click();
assert.equal(rulesDialog.open,false);assert.equal(guide.phase(),'prepare');assert.equal(guide.get('score').textContent,'명중 0');
assert.equal(tickets(guide),1);
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
assert.equal(tickets(chainPause),2);
assert.match(impactText(chainPause),/2 COMBO!.*\+0\.12초/);
assert.equal(chainPause.get('clock').textContent,'1.27초');
chainPause.advance(1269.9);assert.equal(chainPause.phase(),'hunt');chainPause.advance(.1);
decline(chainPause);assert.equal(chainPause.saved[0].result.caught,2);assert.equal(chainPause.timers.size,0);

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
assert.equal(tickets(quitPause),2);
quitPause.start();enterCycle(quitPause);assert.equal(quitPause.get('score').textContent,'명중 0');
assert.equal(tickets(quitPause),1);

function assertPauseUnavailable(g){
  const phase=g.phase();assert.equal(g.get('pause').disabled,true);g.get('pause').click();
  assert.equal(g.get('pause-dialog').open,false);assert.equal(g.phase(),phase);
}
const failPause=game();assertPauseUnavailable(failPause);
let failureBoard=startRun(failPause).b;failPause.click(failureBoard.empty[0]);assertPauseUnavailable(failPause);
failPause.advance(1350);assertPauseUnavailable(failPause);decline(failPause);
failureBoard=startRun(failPause).b;failPause.click(failureBoard.decoy[0]);assertPauseUnavailable(failPause);
failPause.advance(80);assertPauseUnavailable(failPause);failPause.advance(900);assertPauseUnavailable(failPause);

// A pause click queued at the deadline must finish exactly once, not revive expired time.
const duePrepare=game({audio:true});duePrepare.start();duePrepare.jump(duePrepare.now()+250);duePrepare.get('pause').click();
assert.equal(duePrepare.get('pause-dialog').open,false);assert.equal(duePrepare.phase(),'memory');assert.equal(duePrepare.timers.size,2);
duePrepare.advance(0);assert.equal(duePrepare.audioLog.tones.length,2);
duePrepare.advance(500);assert.equal(duePrepare.phase(),'hide');
const {g:dueHunt}=startRun();dueHunt.jump(dueHunt.now()+1600);dueHunt.get('pause').click();
assert.equal(dueHunt.get('pause-dialog').open,false);decline(dueHunt);assert.equal(dueHunt.timers.size,0);
dueHunt.get('pause-resume').click();dueHunt.advance(120000);
decline(dueHunt);assert.equal(dueHunt.saved.length,1);assert.equal(dueHunt.saved[0].result.reason,'시간 초과');

const g=game();g.start();let total=0;
for(let cycle=0;cycle<30;cycle++){
  const b=enterCycle(g,cycle);
  b.target.forEach((i,n)=>{g.click(i);total++;assert.equal(g.get('score').textContent,'명중 '+total);assert.match(impactText(g),n===0?/PERFECT!/:new RegExp((n+1)+' COMBO!'));});
  assert.equal(g.saved.length,0);resolveImpact(g,b.decoy.length);
}
assert.equal(total,171);assert.equal(g.get('best').textContent,'최고 '+total);
assert.equal(tickets(g),2);
const finalBoard=enterCycle(g,30);g.click(finalBoard.empty[0]);assert.equal(g.phase(),'laugh');assertLocked(g);
assert.equal(g.saved.length,0);assert.equal(g.slots().filter(s=>s.innerHTML.includes('cj-ha')).length,11);
g.advance(1349);assert.equal(g.phase(),'laugh');g.advance(1);decline(g);assert.equal(g.timers.size,0);
assert.equal(g.saved.length,1);assert.equal(g.saved[0].best,total);assert.equal(g.saved[0].result.caught,total);
g.start();const reset=enterCycle(g);assert.deepEqual([reset.memory,reset.hunt],[500,1600]);assert.equal(g.get('score').textContent,'명중 0');
g.advance(1600);decline(g);assert.equal(g.timers.size,0);assert.equal(g.saved.length,2);

const {g:repeat,b:rb}=startRun();repeat.click(rb.target[0]);repeat.click(rb.target[0]);
assert.equal(repeat.phase(),'laugh');assertLocked(repeat);repeat.advance(1350);decline(repeat);
assert.equal(repeat.saved[0].result.caught,1);assert.equal(repeat.saved[0].result.reason,'허공 사격');
const {g:background}=startRun();background.get('room').click();assert.equal(background.phase(),'laugh');assert.equal(background.saved.length,0);
background.advance(1350);decline(background);assert.equal(background.saved.length,1);

for(const keyboard of [false,true]){
  const {g:scare,b}=startRun(),index=b.decoy[0],cell=scare.slots()[index].rect;
  const event=keyboard?{}:{detail:1,clientX:cell.left+8,clientY:cell.top+16};
  assert.ok(scare.click(index,event).stopped);
  assert.equal(scare.phase(),'scare-reveal');assert.equal(scare.saved.length,0);
  assert.deepEqual([scare.types('target').length,scare.types('decoy').length],[4,3]);
  assertLocked(scare);scare.click(index,event);assert.equal(scare.saved.length,0);
  assert.equal(scare.get('fail-splash').children.length,0);
  scare.advance(79.9);assert.equal(scare.phase(),'scare-reveal');scare.advance(.1);assert.equal(scare.phase(),'scare-pop');
  assert.equal(scare.get('fail-splash').children.length,2);
  const actor=scare.get('fail-splash').children.find(c=>c.className==='cj-pop-actor');
  const x=cell.left+cell.width/2,y=cell.top+cell.height/2;
  assert.equal(actor.style.left,x+'px');assert.equal(actor.style.top,y+'px');
  assert.equal(actor.style['--tx'],195-x+'px');assert.equal(actor.style['--ty'],844*.44-y+'px');assertLocked(scare);
  assert.equal(scare.slots().filter(s=>s.className.includes('is-spooked')).length,1);
  scare.advance(899.9);assert.equal(scare.phase(),'scare-pop');scare.advance(.1);decline(scare);assert.equal(scare.timers.size,0);assert.equal(scare.saved.length,1);
  assert.equal(scare.saved[0].result.reason,'금지 유령 명중');
  scare.start();assert.equal(scare.get('fail-splash').children.length,0);
  enterCycle(scare);scare.advance(500);assert.equal(scare.phase(),'hunt');assert.equal(scare.timers.size,2);
}
const {g:deadlineDecoy,b:db}=startRun();
deadlineDecoy.jump(deadlineDecoy.now()+1600);deadlineDecoy.click(db.decoy[0]);
decline(deadlineDecoy);assert.equal(deadlineDecoy.saved[0].result.reason,'시간 초과');assert.equal(deadlineDecoy.timers.size,0);

for(const [gap,label] of [[450,'2 COMBO!'],[451,'PERFECT!']]){
  const {g:c,b}=startRun();c.click(b.target[0]);c.advance(gap);c.click(b.target[1]);assert.ok(impactText(c).includes(label));
}
const {g:extension,b:xb}=startRun();extension.advance(1100);extension.click(xb.target[0]);extension.advance(450);extension.click(xb.target[1]);
assert.match(impactText(extension),/\+0\.12초/);extension.advance(50);assert.equal(extension.phase(),'hunt');
extension.advance(119.9);assert.equal(extension.phase(),'hunt');extension.advance(.1);decline(extension);assert.equal(extension.saved[0].result.caught,2);
for(const [offset,expected] of [[-.1,'impact'],[0,'over']]){
  const {g:edge,b}=startRun();b.target.slice(0,3).forEach(i=>edge.click(i));
  edge.jump(edge.now()+1600+120+160+offset);edge.click(b.target[3]);if(expected==='over')decline(edge);assert.equal(edge.phase(),expected);
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
  s.advance(hunt-.1);assert.equal(s.phase(),'hunt');s.advance(.1);decline(s);assert.equal(s.timers.size,0);
}
// A delayed READY callback and a long session cannot accelerate a low-numbered stage.
const delayed=game();delayed.start();delayed.jump(120000);delayed.advance(0);
assert.equal(delayed.phase(),'memory');assert.equal(delayed.get('clock').textContent,'0.50초');
const delayedTargets=delayed.types('target');delayed.advance(499.9);assert.equal(delayed.phase(),'memory');
delayed.advance(.1+40);assert.equal(delayed.phase(),'hunt');assert.equal(delayed.get('clock').textContent,'1.60초');
delayedTargets.forEach(i=>delayed.click(i));resolveImpact(delayed);
const delayedNext=enterCycle(delayed,1);assert.deepEqual([delayedNext.memory,delayedNext.hunt],[484,1518]);
delayed.advance(1518);decline(delayed);delayed.start();
assert.deepEqual([enterCycle(delayed).memory,parseFloat(delayed.get('clock').textContent)],[500,1.6]);
for(const [cycle,memory,hunt,grid,targets] of [[0,1600,2800,3,3],[11,1050,1867,6,6],[23,450,850,6,10]]){
  const {b}=sampleCycle(cycle,{defaults:LIVE_DEFAULTS});assert.deepEqual([b.memory,b.hunt,b.grid,b.target.length],[memory,hunt,grid,targets]);
}
const {g:rapid,b:rapidBoard}=sampleCycle(11),rapidStart=rapid.now();
for(const [index,at] of [180,570,760,930,1110,1300].entries()){
  rapid.advance(rapidStart+at-rapid.now());assert.equal(rapid.phase(),'hunt');rapid.click(rapidBoard.target[index]);
  const bonus=[0,120,160,200,200,200][index];if(bonus)assert.ok(impactText(rapid).includes('+'+(bonus/1000).toFixed(2)+'초'));
}
assert.equal(rapid.phase(),'impact');assert.equal(rapid.saved.length,0);resolveImpact(rapid,5);assert.equal(enterCycle(rapid,12).hunt,700);
const {g:noChain,b:nc}=sampleCycle(11);noChain.advance(180);noChain.click(nc.target[0]);noChain.advance(460);noChain.click(nc.target[1]);
noChain.advance(60);decline(noChain);

const {g:shot,b:sb}=startRun(),cell=shot.slots()[sb.target[0]].rect,point={detail:1,clientX:cell.left+13,clientY:cell.top+19};
assert.ok(shot.click(sb.target[0],point).stopped);let effect=newest(shot);
assert.equal(parseFloat(effect.style.left),(point.clientX-10)/360*100);assert.equal(parseFloat(effect.style.top),(point.clientY-20)/480*100);assertHidden(shot);
const curse=shot.get('effects').children.find(e=>e.className==='cj-curse');assert.ok(curse);curse.emit('animationend',{target:curse});assert.equal(curse.parent,null);
effect.emit('animationend',{target:{}});assert.ok(effect.parent);effect.emit('animationend',{target:effect});assert.equal(effect.parent,null);
shot.click(sb.target[1]);assert.match(impactText(shot),/2 COMBO!/);

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
  assert.equal(aim.phase(),'laugh');aim.advance(1350);decline(aim);assert.equal(aim.saved[0].result.caught,1);
}
const {g:farMiss}=startRun();farMiss.get('room').click({detail:1,clientX:-100,clientY:-100});
assert.equal(farMiss.phase(),'laugh');farMiss.advance(1350);decline(farMiss);assert.equal(farMiss.saved[0].result.reason,'허공 사격');

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
assert.match(impactText(settings),/2 COMBO!.*\+0\.30초/);assert.equal(settings.get('effects').children.filter(e=>e.className==='cj-curse').length,0);
settings.get('room').click();settings.advance(1350);decline(settings);assert.equal(settings.get('balance-open').disabled,false);
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
assert.deepEqual([migrated.difficulty.rampRounds,migrated.difficulty.memoryStart,migrated.difficulty.huntStart],[24,1.6,2.8]);
assert.equal('rampSeconds' in migrated.difficulty,false);assert.equal(migrated.combo.window,.6);
assert.equal(migrated.transition.firstPrepare,.8);assert.equal(migrated.transition.prepare,.65);
assert.deepEqual([startRun(migratedGame).b.memory,parseFloat(migratedGame.get('clock').textContent)],[1600,2.8]);
const customTimes=structuredClone(timedLegacy);customTimes.difficulty.memoryStart=.9;customTimes.difficulty.huntStart=3;
const preserved=game({config:customTimes,defaults:LIVE_DEFAULTS}).editor.getConfig();
assert.deepEqual([preserved.difficulty.rampRounds,preserved.difficulty.memoryStart,preserved.difficulty.huntStart],[24,.9,3]);
assert.equal(restored.editor.getConfig().combo.window,.6);assert.equal('haunt' in restored.editor.getConfig(),false);
const restoredBoard=startRun(restored).b,originalButtons=[...restored.slots()];
restoredBoard.target.forEach((index,n)=>{
  restored.advance(n===0?400:100);
  const rect=restored.slots()[index].rect;
  restored.click(index,{detail:1,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});
  assert.equal(restored.get('score').textContent,'명중 '+(n+1));
  assert.match(impactText(restored),n===0?/PERFECT!/:new RegExp((n+1)+' COMBO!'));
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
console.log('PASS: 3-second continue/reward ads and cancellation; one-time settlement/doubling; rare 5% optional collection, half-memory fade, per-run cap and persistence; 3x3 to 6x6 grids and further difficulty growth; 30 cycles/171 fixture score; 220ms live combo boundary; lobby tickets/modals, pause/deadline preservation, failure effects, migration and sound regressions.');

})().catch(error=>{console.error(error);process.exitCode=1;});
