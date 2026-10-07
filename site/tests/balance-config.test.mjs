import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DEFAULT_CONFIG,FIELD_GROUPS,getValue,setValue,validateConfig,parseBalanceDB,serializeBalanceDB} from '../balance-config.mjs';
import {createBalanceEditor} from '../balance-editor.mjs';

test('the JSON file supplies every default exactly once and round-trips',async()=>{
  const raw=JSON.parse(await readFile(new URL('../balance-default.json',import.meta.url),'utf8'));
  assert.deepEqual(DEFAULT_CONFIG,raw);
  assert.deepEqual(parseBalanceDB(serializeBalanceDB(DEFAULT_CONFIG)),raw);
  assert.ok(Object.isFrozen(DEFAULT_CONFIG)&&Object.isFrozen(DEFAULT_CONFIG.difficulty));
  const paths=FIELD_GROUPS.flatMap(group=>group.fields.map(field=>field.path));
  assert.equal(paths.length,new Set(paths).size);
  const dbPaths=Object.entries(raw).filter(([,value])=>value&&typeof value==='object').flatMap(([group,values])=>Object.keys(values).map(key=>group+'.'+key));
  assert.deepEqual([...paths].sort(),dbPaths.sort());
});
test('schema rejects old DBs, wrong game and malformed JSON',()=>{
  for(const bad of [null,[],{}, {...DEFAULT_CONFIG,version:6},{...DEFAULT_CONFIG,game:'shooting-range'}])assert.throws(()=>validateConfig(bad));
  assert.throws(()=>parseBalanceDB('{broken'));
});
test('every numeric field enforces finite values, ranges and integer controls',()=>{
  for(const group of FIELD_GROUPS)for(const field of group.fields){
    for(const value of [NaN,Infinity,-Infinity,'1',null,undefined,field.min-1,field.max+1]){
      const config=structuredClone(DEFAULT_CONFIG);setValue(config,field.path,value);
      assert.throws(()=>validateConfig(config),field.path+' rejects '+value);
    }
    if(field.step===1){const config=structuredClone(DEFAULT_CONFIG);setValue(config,field.path,field.min+.5);assert.throws(()=>validateConfig(config));}
  }
});
test('cross-field limits protect timers and reserve one of the 25 positions',()=>{
  for(const [path,value] of [
    ['difficulty.memoryMin',DEFAULT_CONFIG.difficulty.memoryStart+.1],['difficulty.huntMin',DEFAULT_CONFIG.difficulty.huntStart+.1],
    ['difficulty.targetsStart',DEFAULT_CONFIG.difficulty.targetsMax+1],['difficulty.decoysStart',DEFAULT_CONFIG.difficulty.decoysMax+1],
    ['difficulty.targetsMax',16],['combo.bonusStart',.3]
  ]){const config=structuredClone(DEFAULT_CONFIG);setValue(config,path,value);assert.throws(()=>validateConfig(config),path);}
  const full=structuredClone(DEFAULT_CONFIG);full.difficulty.targetsMax=15;
  const clean=validateConfig(full);
  assert.equal(clean.difficulty.targetsMax+clean.difficulty.decoysMax,24);
  const former=structuredClone(DEFAULT_CONFIG);
  Object.assign(former.difficulty,{targetsStart:4,targetsMax:6,decoysStart:3,decoysMax:5});
  assert.deepEqual(validateConfig(former),former,'previous smaller-room configurations remain valid');
});
test('validation copies known fields and leaves caller/default data untouched',()=>{
  const input=structuredClone(DEFAULT_CONFIG);input.unknown=true;input.difficulty.hidden=99;input.combo.window=.4;
  const clean=validateConfig(input);
  assert.equal(clean.unknown,undefined);assert.equal(clean.difficulty.hidden,undefined);
  assert.equal(input.difficulty.hidden,99);assert.equal(getValue(clean,'combo.window'),.4);
  clean.combo.window=.3;assert.equal(input.combo.window,.4);assert.notEqual(DEFAULT_CONFIG.combo.window,.3);
});

test('v1 files discard retired moving-ghost settings and preserve other tuning',()=>{
  const legacy=structuredClone(DEFAULT_CONFIG);
  legacy.haunt={enabled:1,warning:.12,travelStart:.68,travelMin:.52,max:2,extraAtCombo:2,extraAtProgress:.5};
  legacy.difficulty.memoryStart=.8;legacy.difficulty.huntStart=2;legacy.combo.window=.6;
  const clean=parseBalanceDB(JSON.stringify(legacy));
  assert.equal(clean.version,1);assert.equal(clean.game,'memory-room');assert.equal('haunt' in clean,false);
  assert.deepEqual(clean.difficulty,legacy.difficulty);assert.deepEqual(clean.combo,legacy.combo);
  assert.equal(legacy.haunt.enabled,1);assert.equal(serializeBalanceDB(clean).includes('haunt'),false);
  assert.equal(FIELD_GROUPS.some(group=>group.fields.some(field=>field.path.startsWith('haunt.'))),false);
});

test('time-based DBs adopt round progression and refresh only former default timings',()=>{
  const legacy=structuredClone(DEFAULT_CONFIG);
  delete legacy.difficulty.rampRounds;delete legacy.difficulty.missPenalty;legacy.difficulty.rampSeconds=30;
  legacy.difficulty.memoryStart=.5;legacy.difficulty.huntStart=1.6;legacy.combo.window=.6;
  const migrated=parseBalanceDB(JSON.stringify(legacy));
  assert.equal(migrated.difficulty.rampRounds,DEFAULT_CONFIG.difficulty.rampRounds);
  assert.equal(migrated.difficulty.memoryStart,DEFAULT_CONFIG.difficulty.memoryStart);
  assert.equal(migrated.difficulty.huntStart,DEFAULT_CONFIG.difficulty.huntStart);
  assert.equal(migrated.difficulty.missPenalty,DEFAULT_CONFIG.difficulty.missPenalty);
  assert.equal('rampSeconds' in migrated.difficulty,false);assert.equal(migrated.combo.window,.6);
  legacy.difficulty.memoryStart=.9;legacy.difficulty.huntStart=3;
  const custom=parseBalanceDB(JSON.stringify(legacy));
  assert.equal(custom.difficulty.memoryStart,.9);assert.equal(custom.difficulty.huntStart,3);
  for(const invalid of [null,'30',0,-1,601]) {
    legacy.difficulty.rampSeconds=invalid;assert.throws(()=>parseBalanceDB(JSON.stringify(legacy)));
  }
});

test('older round-based DBs receive the miss penalty without changing other custom settings',()=>{
  const legacy=structuredClone(DEFAULT_CONFIG);
  delete legacy.difficulty.missPenalty;
  Object.assign(legacy.difficulty,{rampRounds:30,memoryStart:1.9,huntStart:3.4});
  legacy.combo.window=.5;
  assert.equal(DEFAULT_CONFIG.difficulty.missPenalty,.4);
  const migrated=parseBalanceDB(JSON.stringify(legacy));
  assert.deepEqual(migrated,{
    ...legacy,difficulty:{...legacy.difficulty,missPenalty:.4}
  });
  assert.deepEqual(parseBalanceDB(serializeBalanceDB(migrated)),migrated);
  assert.throws(()=>validateConfig(legacy),'direct validation still requires the complete schema');
});

test('valid legacy 6×6 counts shrink to the 5×5 capacity while preserving other tuning',()=>{
  for(const [counts,expected] of [
    [{targetsStart:30,targetsMax:34,decoysStart:1,decoysMax:1},{targetsStart:23,targetsMax:23,decoysStart:1,decoysMax:1}],
    [{targetsStart:4,targetsMax:10,decoysStart:20,decoysMax:25},{targetsStart:4,targetsMax:10,decoysStart:14,decoysMax:14}]
  ]) {
    const legacy=structuredClone(DEFAULT_CONFIG);
    delete legacy.difficulty.missPenalty;
    Object.assign(legacy.difficulty,counts,{memoryStart:2.1,huntStart:4.3});
    legacy.combo.window=.38;
    const migrated=parseBalanceDB(JSON.stringify(legacy));
    assert.deepEqual(migrated,{
      ...legacy,difficulty:{...legacy.difficulty,...expected,missPenalty:DEFAULT_CONFIG.difficulty.missPenalty}
    });
    assert.deepEqual(parseBalanceDB(serializeBalanceDB(migrated)),migrated);
    legacy.difficulty.missPenalty=.4;
    assert.throws(()=>parseBalanceDB(JSON.stringify(legacy)),'current-schema oversized counts must be rejected, not silently reduced');
  }
  for(const counts of [
    {targetsStart:30,targetsMax:25,decoysStart:1,decoysMax:1},
    {targetsStart:4,targetsMax:26,decoysStart:1,decoysMax:10},
    {targetsStart:0,targetsMax:30,decoysStart:1,decoysMax:1},
    {targetsStart:4,targetsMax:25.5,decoysStart:1,decoysMax:1}
  ]) {
    const malformed=structuredClone(DEFAULT_CONFIG);
    delete malformed.difficulty.missPenalty;
    Object.assign(malformed.difficulty,counts);
    assert.throws(()=>parseBalanceDB(JSON.stringify(malformed)),'migration must not legitimize an invalid legacy count tuple');
  }
});

test('custom miss penalties round-trip at fractional values and bounds, while invalid present values are rejected',()=>{
  for(const missPenalty of [.05,.375,5]) {
    const config=structuredClone(DEFAULT_CONFIG);
    config.difficulty.missPenalty=missPenalty;
    assert.equal(parseBalanceDB(serializeBalanceDB(config)).difficulty.missPenalty,missPenalty);
  }
  for(const missPenalty of [0,-.1,5.01,null,'0.4']) {
    const config=structuredClone(DEFAULT_CONFIG);
    config.difficulty.missPenalty=missPenalty;
    assert.throws(()=>parseBalanceDB(JSON.stringify(config)),`invalid explicit penalty ${missPenalty} must not be replaced by a default`);
  }
});

test('editor gates opening, applies/reset values, and discards stale imports',async()=>{
  const previousDocument=globalThis.document,nodes=new Map();
  function element(tag='div'){
    return {tag,children:[],handlers:{},attrs:{},open:false,classList:{toggle(){}},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      setAttribute(key,value){this.attrs[key]=value;},addEventListener(name,fn){this.handlers[name]=fn;},
      showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},click(){this.onclick?.();}
    };
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
  const huntInput=()=>descendants(get('balance-fields')).find(node=>node.attrs['aria-label']==='처음 사격 제한 시간');
  let allowed=false,pending=structuredClone(DEFAULT_CONFIG),saves=0;
  globalThis.document={getElementById:get,createElement:element};
  try{
    const editor=createBalanceEditor({getConfig:()=>pending,onSave:config=>{pending=config;saves++;},onOpen:()=>allowed});
    assert.equal(editor.open(),false);assert.equal(get('balance-dialog').open,false);
    allowed=true;assert.equal(editor.open(),true);
    assert.equal(descendants(get('balance-fields')).filter(node=>node.tag==='input').length,FIELD_GROUPS.flatMap(group=>group.fields).length);
    huntInput().value='2';huntInput().handlers.input();get('balance-form').onsubmit({preventDefault(){}});
    assert.equal(pending.difficulty.huntStart,2);assert.equal(saves,1);assert.equal(get('balance-dialog').open,false);
    editor.open();get('balance-reset').onclick();get('balance-form').onsubmit({preventDefault(){}});
    assert.deepEqual(pending,DEFAULT_CONFIG);assert.equal(saves,2);

    editor.open();let resolveRead;
    const imported=structuredClone(DEFAULT_CONFIG);imported.difficulty.huntStart=3;
    get('balance-file').files=[{size:100,name:'late.json',text:()=>new Promise(resolve=>{resolveRead=resolve;})}];
    const stale=get('balance-file').onchange();get('balance-dialog').close();editor.open();
    resolveRead(serializeBalanceDB(imported));await stale;
    assert.equal(Number(huntInput().value),DEFAULT_CONFIG.difficulty.huntStart);
    get('balance-file').files=[{size:100,name:'valid.json',text:async()=>serializeBalanceDB(imported)}];
    await get('balance-file').onchange();assert.equal(Number(huntInput().value),3);assert.equal(saves,2);
    get('balance-form').onsubmit({preventDefault(){}});assert.equal(pending.difficulty.huntStart,3);assert.equal(saves,3);
    editor.open();get('balance-file').files=[{size:200001,name:'large.json',text:()=>{throw new Error('Should not read oversized file');}}];
    await get('balance-file').onchange();assert.match(get('balance-message').textContent,/200KB/);assert.equal(saves,3);
  }finally{globalThis.document=previousDocument;}
});
