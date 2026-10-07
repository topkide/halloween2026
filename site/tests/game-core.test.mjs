import test from 'node:test';
import assert from 'node:assert/strict';
import {difficultyAt, comboBonus, hitSlot} from '../game-core.mjs';
import {DEFAULT_CONFIG} from '../balance-config.mjs';

const roundedSeconds = value => Math.round(value * 1000) / 1000;

test('default difficulty starts at configured values and stops changing at the cap', () => {
  const d = DEFAULT_CONFIG.difficulty;
  const start = difficultyAt(DEFAULT_CONFIG, 0);
  assert.deepEqual(start, {
    targets: d.targetsStart, decoys: d.decoysStart,
    memory: roundedSeconds(d.memoryStart), hunt: roundedSeconds(d.huntStart), pressure: 0
  });
  assert.deepEqual(difficultyAt(DEFAULT_CONFIG, -1), start);
  const atCap = difficultyAt(DEFAULT_CONFIG, d.rampRounds-1);
  assert.deepEqual(atCap, {
    targets: d.targetsMax, decoys: d.decoysMax,
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

test('each completed wave advances timing and counts until their configured caps', () => {
  const config = structuredClone(DEFAULT_CONFIG);
  config.difficulty = {
    rampRounds: 5, memoryStart: 1.2, memoryMin: 0.4, huntStart: 3.2, huntMin: 1.2,
    targetsStart: 2, targetsMax: 7, decoysStart: 1, decoysMax: 3
  };
  const before = structuredClone(config);
  assert.deepEqual(difficultyAt(config, 1), {
    targets: 3, decoys: 2, memory: 1, hunt: 2.7, pressure: 0.25
  });
  assert.deepEqual(difficultyAt(config, 2), {
    targets: 4, decoys: 3, memory: 0.8, hunt: 2.2, pressure: 0.5
  });
  assert.deepEqual(difficultyAt(config, 100), {
    targets: 7, decoys: 3, memory: 0.4, hunt: 1.2, pressure: 1
  });
  assert.deepEqual(difficultyAt(config, 4), {
    targets: 6, decoys: 3, memory: 0.4, hunt: 1.2, pressure: 1
  });
  assert.deepEqual(config, before, 'difficulty calculation must not change the balance DB');
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
