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
test('cross-field limits protect timers and the 12 positions',()=>{
  for(const [path,value] of [
    ['difficulty.memoryMin',1],['difficulty.huntMin',2],
    ['difficulty.targetsStart',7],['difficulty.decoysStart',6],
    ['difficulty.targetsMax',8],['combo.bonusStart',.3]
  ]){const config=structuredClone(DEFAULT_CONFIG);setValue(config,path,value);assert.throws(()=>validateConfig(config),path);}
  const full=structuredClone(DEFAULT_CONFIG);full.difficulty.targetsMax=7;
  assert.equal(validateConfig(full).difficulty.targetsMax+full.difficulty.decoysMax,12);
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
