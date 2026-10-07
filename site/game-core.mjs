// Gameplay calculations use seconds in the balance DB and milliseconds for deadlines.
export function difficultyAt(config, elapsedMs, cycle) {
  const d=config.difficulty, pressure=Math.min(1,Math.max(0,elapsedMs)/(d.rampSeconds*1000));
  const time=(start,min)=>Math.round((start-(start-min)*pressure)*1000)/1000;
  return {
    targets:Math.min(d.targetsMax,d.targetsStart+cycle),
    decoys:Math.min(d.decoysMax,d.decoysStart+cycle),
    memory:time(d.memoryStart,d.memoryMin),
    hunt:time(d.huntStart,d.huntMin),
    pressure
  };
}

export function comboBonus(config, combo) {
  const c=config.combo;
  return combo<2?0:Math.round(Math.min(c.bonusMax,c.bonusStart+(combo-2)*c.bonusStep)*1000);
}
