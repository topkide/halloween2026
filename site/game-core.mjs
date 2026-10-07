// Gameplay calculations use seconds in the balance DB and milliseconds for deadlines.
export function difficultyAt(config, cycle) {
  const d=config.difficulty, round=Math.max(0,cycle), pressure=Math.min(1,round/(d.rampRounds-1));
  const time=(start,min)=>Math.round((start-(start-min)*pressure)*1000)/1000;
  const gridSize=round<5?3:round<12?4:5;
  const targets=Math.min(d.targetsMax,d.targetsStart+Math.floor(round/3),gridSize**2-2);
  return {
    gridSize, targets,
    decoys:Math.min(d.decoysMax,d.decoysStart+Math.floor(round/2),gridSize**2-targets-1),
    memory:time(d.memoryStart,d.memoryMin),
    hunt:time(d.huntStart,d.huntMin),
    pressure
  };
}

// Larger rooms spread targets further apart, while retaining a fresh random layout.
export function createBoard(current,cycle,random=Math.random) {
  const size=current.gridSize, order=Array.from({length:size**2},(_,i)=>i), targets=[];
  for(let i=order.length-1;i>0;i--) { const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]]; }
  const spread=Math.min(1,Math.max(0,(cycle-12)/11));
  const distance=(a,b)=>Math.abs(a%size-b%size)+Math.abs(Math.floor(a/size)-Math.floor(b/size));
  for(let n=0;n<current.targets;n++) {
    let pick=0;
    if(targets.length&&random()<spread) {
      let furthest=-1;
      order.forEach((cell,i)=>{
        const nearest=Math.min(...targets.map(target=>distance(cell,target)));
        if(nearest>furthest) { furthest=nearest;pick=i; }
      });
    }
    targets.push(order.splice(pick,1)[0]);
  }
  const board=Array(size**2).fill('empty');
  targets.forEach(i=>board[i]='target');
  order.slice(0,current.decoys).forEach(i=>board[i]='decoy');
  return board;
}

export function comboBonus(config, combo) {
  const c=config.combo;
  return combo<2?0:Math.round(Math.min(c.bonusMax,c.bonusStart+(combo-2)*c.bonusStep)*1000);
}

export function coinsPerGhost(cycle) {
  return 1+Math.floor(Math.max(0,cycle)/5);
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
  const target=closest(i=>['target','collection'].includes(board[i])&&!caught.has(i));
  if(target!==null) return target;
  return direct!==-1?direct:closest(()=>true);
}
