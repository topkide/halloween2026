import test from 'node:test';
import assert from 'node:assert/strict';
import {difficultyAt, createBoard, comboBonus, coinsPerGhost, comboCoinMultiplier, hitSlot} from '../game-core.mjs';
import {DEFAULT_CONFIG} from '../balance-config.mjs';

const roundedSeconds = value => Math.round(value * 1000) / 1000;

test('default difficulty starts at configured values and stops changing at the cap', () => {
  const d = DEFAULT_CONFIG.difficulty;
  const start = difficultyAt(DEFAULT_CONFIG, 0);
  assert.deepEqual(start, {
    gridSize: 3, targets: d.targetsStart, decoys: d.decoysStart,
    memory: roundedSeconds(d.memoryStart), hunt: roundedSeconds(d.huntStart), pressure: 0
  });
  assert.deepEqual(difficultyAt(DEFAULT_CONFIG, -1), start);
  const atCap = difficultyAt(DEFAULT_CONFIG, d.rampRounds-1);
  assert.deepEqual(atCap, {
    gridSize: 5, targets: d.targetsMax, decoys: d.decoysMax,
    memory: roundedSeconds(d.memoryMin), hunt: roundedSeconds(d.huntMin), pressure: 1
  });
  assert.deepEqual(difficultyAt(DEFAULT_CONFIG, 1000), atCap);
  let previous=start;
  for(let cycle=1;cycle<d.rampRounds;cycle++) {
    const current=difficultyAt(DEFAULT_CONFIG,cycle);
    assert.ok(current.memory<=previous.memory&&current.hunt<=previous.hunt);
    assert.equal(current.pressure,cycle/(d.rampRounds-1));
    previous=current;
  }
});

test('timing advances every wave while targets and decoys increase more gradually', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.difficulty = {
    rampRounds: 5, memoryStart: 1.2, memoryMin: 0.4, huntStart: 3.2, huntMin: 1.2,
    targetsStart: 2, targetsMax: 7, decoysStart: 1, decoysMax: 3
  };
  const before = structuredClone(config);
  assert.deepEqual(difficultyAt(config, 1), {
    gridSize: 3, targets: 2, decoys: 1, memory: 1, hunt: 2.7, pressure: 0.25
  });
  assert.deepEqual(difficultyAt(config, 2), {
    gridSize: 3, targets: 2, decoys: 2, memory: 0.8, hunt: 2.2, pressure: 0.5
  });
  assert.deepEqual(difficultyAt(config, 100), {
    gridSize: 5, targets: 7, decoys: 3, memory: 0.4, hunt: 1.2, pressure: 1
  });
  assert.deepEqual(difficultyAt(config, 4), {
    gridSize: 3, targets: 3, decoys: 3, memory: 0.4, hunt: 1.2, pressure: 1
  });
  assert.deepEqual(config, before, 'difficulty calculation must not change the balance DB');
});

test('rooms grow from 3×3 to 5×5, then only count and timing difficulty continue growing', () => {
  for (const [cycle, size] of [[0,3],[2,3],[4,3],[5,4],[7,4],[11,4],[12,5],[13,5],[23,5],[1000,5]]) {
    assert.equal(difficultyAt(DEFAULT_CONFIG, cycle).gridSize, size, `wave ${cycle+1}`);
  }
  const firstFullRoom=difficultyAt(DEFAULT_CONFIG,12), late=difficultyAt(DEFAULT_CONFIG,23);
  assert.equal(firstFullRoom.targets,7);
  assert.equal(firstFullRoom.decoys,7);
  assert.equal(late.targets,10);
  assert.equal(late.decoys,9);
  assert.ok(late.memory<firstFullRoom.memory&&late.hunt<firstFullRoom.hunt);
});

const seededRandom=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);

test('random boards preserve every ghost count and reserve an empty collection slot at all room sizes', () => {
  const crowded=structuredClone(DEFAULT_CONFIG);
  Object.assign(crowded.difficulty,{targetsStart:23,targetsMax:23,decoysStart:1,decoysMax:1});
  for(const config of [DEFAULT_CONFIG,crowded]) for(const cycle of [0,4,5,11,12,23,1000]) {
    const current=difficultyAt(config,cycle), before=structuredClone(current);
    const board=createBoard(current,cycle,seededRandom(cycle+1));
    assert.equal(board.length,current.gridSize**2);
    assert.equal(board.filter(type=>type==='target').length,current.targets);
    assert.equal(board.filter(type=>type==='decoy').length,current.decoys);
    assert.ok(board.filter(type=>type==='empty').length>=1);
    assert.ok(board.every(type=>['target','decoy','empty'].includes(type)));
    assert.deepEqual(current,before,'layout generation must not alter difficulty settings');
    assert.deepEqual(createBoard(current,cycle,seededRandom(cycle+1)),board,'same seed reproduces the layout');
  }
  const current=difficultyAt(DEFAULT_CONFIG,12);
  assert.notDeepEqual(createBoard(current,12,seededRandom(1)),createBoard(current,12,seededRandom(2)));
});

test('late 5×5 rooms spread targets further apart without shrinking the room', () => {
  const current={gridSize:5,targets:6,decoys:5};
  const spacing=board=>{
    const targets=board.flatMap((type,i)=>type==='target'?[i]:[]);
    return targets.reduce((sum,a)=>sum+Math.min(...targets.filter(b=>b!==a).map(b=>
      Math.abs(a%5-b%5)+Math.abs(Math.floor(a/5)-Math.floor(b/5)))),0)/targets.length;
  };
  let earlySpacing=0,lateSpacing=0;
  for(let seed=1;seed<=24;seed++) {
    earlySpacing+=spacing(createBoard(current,12,seededRandom(seed)));
    lateSpacing+=spacing(createBoard(current,23,seededRandom(seed)));
  }
  assert.ok(lateSpacing>earlySpacing*1.25,'later layouts should noticeably separate the same number of targets');
});

test('constant custom limits stay constant and fractional times round to milliseconds', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  Object.assign(config.difficulty, {
    memoryStart: 0.7514, memoryMin: 0.7514, huntStart: 2.0046, huntMin: 2.0046,
    targetsStart: 3, targetsMax: 3, decoysStart: 2, decoysMax: 2
  });
  for (const cycle of [0, config.difficulty.rampRounds-1, 1000]) {
    const result = difficultyAt(config, cycle);
    assert.equal(result.memory, 0.751);
    assert.equal(result.hunt, 2.005);
    assert.equal(result.targets, 3);
    assert.equal(result.decoys, 2);
  }
});

test('default combo gives no first-hit bonus and reads the configured second-hit bonus', () => {
  assert.equal(comboBonus(DEFAULT_CONFIG, 0), 0);
  assert.equal(comboBonus(DEFAULT_CONFIG, 1), 0);
  assert.equal(comboBonus(DEFAULT_CONFIG, 2), Math.round(DEFAULT_CONFIG.combo.bonusStart * 1000));
});

test('custom combo bonuses are milliseconds, grow per hit, saturate, and can be disabled', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.combo = {window: 0.6, bonusStart: 0.035, bonusStep: 0.02, bonusMax: 0.08};
  const before = structuredClone(config);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 1000].map(combo => comboBonus(config, combo)),
    [0, 0, 35, 55, 75, 80, 80]);
  assert.deepEqual(config, before, 'combo calculation must not change the balance DB');
  Object.assign(config.combo, {bonusStart: 0, bonusStep: 0, bonusMax: 0});
  assert.equal(comboBonus(config, 1000), 0);
  Object.assign(config.combo, {bonusStart: 0.0146, bonusStep: 0, bonusMax: 0.1});
  assert.equal(comboBonus(config, 2), 15);
  assert.equal(comboBonus(config, 1000), 15);
});

test('coin reward per ghost rises by one every five waves without a late-game cap',()=>{
  for(const [cycle,coins] of [[-1,1],[0,1],[4,1],[5,2],[9,2],[10,3],[14,3],[15,4],[100,21]]) {
    assert.equal(coinsPerGhost(cycle),coins,`wave ${cycle+1}`);
  }
});

test('coin multipliers start on the third, sixth and ninth hits and cap at four',()=>{
  assert.deepEqual([0,1,2,3,5,6,8,9,10,100].map(comboCoinMultiplier),[1,1,1,2,2,3,3,4,4,4]);
});

test('aim margin accepts near edges but preserves forbidden and already caught slots', () => {
  const rects=[
    {left:100,top:100,width:80,height:72},
    {left:190,top:100,width:80,height:72},
    {left:100,top:182,width:80,height:72}
  ];
  const board=['target','empty','empty'],caught=new Set();
  for(const [x,y] of [[84,136],[196,136],[140,84],[140,188]]) {
    assert.equal(hitSlot(rects,board,caught,x,y),0,'16px near miss should count as a hit');
  }
  assert.equal(hitSlot(rects,board,caught,83,136),null,'distant empty room must remain a miss');
  assert.equal(hitSlot(rects,board,caught,197,136),1,'deep inside an empty slot must remain empty');
  assert.equal(hitSlot(rects,['target','decoy','empty'],caught,192,136),1,'do not redirect a forbidden tap');
  assert.equal(hitSlot(rects,['target','target','empty'],new Set([1]),192,136),1,'do not redirect a repeated tap');
  assert.equal(hitSlot(rects,board,new Set([0]),196,136),1,'caught targets cannot attract another hit');
  assert.equal(hitSlot(rects,board,caught,NaN,136),null);
});

test('overlapping aim margins choose the nearest live target center', () => {
  const rects=[{left:0,top:0,width:80,height:80},{left:100,top:0,width:80,height:80}];
  const board=['target','target'],caught=new Set();
  assert.equal(hitSlot(rects,board,caught,89,40),0);
  assert.equal(hitSlot(rects,board,caught,91,40),1);
  assert.equal(hitSlot(rects,['decoy','empty'],caught,81,40),0,'gap nearest a forbidden slot still fails');
});

test('collection ghosts share the aim margin without overriding forbidden or already caught slots', () => {
  const rects=[{left:100,top:100,width:60,height:60},{left:170,top:100,width:60,height:60}];
  const board=['collection','empty'];
  assert.equal(hitSlot(rects,board,new Set(),84,130),0,'collection ghost accepts the default 16px padding');
  assert.equal(hitSlot(rects,board,new Set(),83,130),null);
  assert.equal(hitSlot(rects,board,new Set(),175,130),0,'nearby empty space can count as a collection hit');
  assert.equal(hitSlot(rects,['collection','decoy'],new Set(),175,130),1);
  assert.equal(hitSlot(rects,['collection','target'],new Set([1]),175,130),1);
  assert.equal(hitSlot(rects,board,new Set([0]),175,130),1,'a caught collection cannot attract taps');
  assert.equal(hitSlot(rects,board,new Set(),166,130,4),1,'a smaller configured margin is respected');
});
