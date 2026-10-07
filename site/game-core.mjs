// Gameplay calculations use seconds in the balance DB and milliseconds for deadlines.
export function difficultyAt(config, cycle) {
  const d=config.difficulty, round=Math.max(0,cycle), pressure=Math.min(1,round/(d.rampRounds-1));
  const time=(start,min)=>Math.round((start-(start-min)*pressure)*1000)/1000;
  return {
    targets:Math.min(d.targetsMax,d.targetsStart+round),
    decoys:Math.min(d.decoysMax,d.decoysStart+round),
    memory:time(d.memoryStart,d.memoryMin),
    hunt:time(d.huntStart,d.huntMin),
    pressure
  };
}

export function comboBonus(config, combo) {
  const c=config.combo;
  return combo<2?0:Math.round(Math.min(c.bonusMax,c.bonusStart+(combo-2)*c.bonusStep)*1000);
}

// A small aim margin helps rapid taps without overriding a forbidden/caught slot.
export function hitSlot(rects, board, caught, x, y, padding=16) {
  if(!Number.isFinite(x)||!Number.isFinite(y)) return null;
  const contains=(rect,extra=0)=>x>=rect.left-extra&&x<=rect.left+rect.width+extra&&y>=rect.top-extra&&y<=rect.top+rect.height+extra;
  const direct=rects.findIndex(rect=>contains(rect));
  if(direct!==-1&&(board[direct]!=='empty'||caught.has(direct))) return direct;
  function closest(eligible) {
    let best=null,distance=Infinity;
    rects.forEach((rect,i)=>{
      if(!eligible(i)||!contains(rect,padding)) return;
      const d=(x-rect.left-rect.width/2)**2+(y-rect.top-rect.height/2)**2;
      if(d<distance) { best=i;distance=d; }
    });
    return best;
  }
  const target=closest(i=>board[i]==='target'&&!caught.has(i));
  if(target!==null) return target;
  return direct!==-1?direct:closest(()=>true);
}
