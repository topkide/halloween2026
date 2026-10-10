import {BOUNTY_TIMING} from './hunt-core.mjs?v=20261011-freefire1';

const VALUES=[2,3,5,8,10];
export function createBountyReel(multiplier,wave){
  // Presentation only: never consume the gameplay RNG or change its weighted result.
  const rows=Array.from({length:24},(_,i)=>VALUES[(i*3+wave)%VALUES.length]);
  if(rows.at(-1)===multiplier)rows[rows.length-1]=VALUES[(VALUES.indexOf(multiplier)+1)%VALUES.length];
  return [...rows,multiplier];
}
export function reelOffset(elapsed,steps){
  const t=Math.max(0,Math.min(1,elapsed/BOUNTY_TIMING.spin));
  return steps*(1-(1-t)**2);
}
export function visibleBounty(engine){
  return engine.bountyRevealed?engine.bounty:{multiplier:null,points:null};
}
