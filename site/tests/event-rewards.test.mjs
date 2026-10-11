import test from 'node:test';
import assert from 'node:assert/strict';
import {Hunt,BOUNTY_TIMING} from '../hunt-core.mjs';
import {GHOST_COINS,waveReward,cleanEconomy} from '../upgrades.mjs';
import {eventState,addTickets,addDistance,useTicket,exchange} from '../event-core.mjs';
import {STORAGE_KEY,PROGRESS_VERSION,readProgress} from '../progress.mjs';
const playing=(levels={})=>{const h=new Hunt({random:()=>.2,upgrades:levels});h.start();h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];return h;};
const catchGhost=(h,type)=>{const g=h.spawn(type);g.age=type==='gold'?0:g.life*.3;return h.shoot(g.id);};
const advance=h=>{h.tick(BOUNTY_TIMING.spin);h.tick(BOUNTY_TIMING.hold);h.ghosts=[];};

test('ordinary species keep fixed upgrade coins regardless of all upgrade levels',()=>{
  for(const level of [0,15,30]){
    const h=playing({time:level,gold:level,shop:level});let total=0;
    for(const [type,base] of Object.entries(GHOST_COINS)){const hit=catchGhost(h,type);assert.equal(hit.upgradeCoins,base);assert.equal(hit.bonusCoins,0);total+=base;}
    assert.equal(h.earnedUpgradeCoins,total);assert.equal(h.earnedEventCoins,0);
    const gold=catchGhost(h,'gold');assert.equal(gold.upgradeCoins,0);assert.equal(h.earnedUpgradeCoins,total);
  }
});
test('later waves and shop upgrades raise the base and golden bounty together',()=>{
  assert.deepEqual([1,2,3].map(w=>waveReward(w,{})),[10,15,20]);
  assert.deepEqual([1,2,3].map(w=>waveReward(w,{shop:15})),[20,30,40]);
  const h=playing({shop:30});assert.equal(h.waveBaseReward,30);assert.equal(h.bounty.coins,30*h.bounty.multiplier);
});
test('gold bonuses are pending until clear, include a golden final kill, and cannot be paid twice',()=>{
  const h=playing();const bounty=h.bounty.coins;
  catchGhost(h,'gold');assert.equal(h.wavePendingBonus,bounty);assert.equal(h.earnedEventCoins,0);
  for(let i=0;i<6;i++)catchGhost(h,'pudge');
  const hit=catchGhost(h,'gold');assert.equal(hit.bonusCoins,bounty);assert.equal(h.clearedWaves,1);
  assert.equal(h.earnedEventCoins,10+2*bounty);assert.deepEqual(h.waveRewards,[{wave:1,base:10,bonus:2*bounty,total:10+2*bounty}]);
  assert.equal(h.wavePendingBonus,0);assert.equal(h.waveGold,0);assert.equal(h.shoot(hit.ghost.id),null);
  assert.equal(h.earnedEventCoins,10+2*bounty);
});
test('ending an incomplete wave retains earlier completed rewards and ordinary coins only',()=>{
  const h=playing();for(let i=0;i<8;i++)catchGhost(h,'pudge');advance(h);
  catchGhost(h,'gold');catchGhost(h,'skitter');assert.ok(h.wavePendingBonus>0);h.end('quit');
  assert.equal(h.earnedEventCoins,10);assert.equal(h.earnedUpgradeCoins,58);assert.equal(h.waveRewards.length,1);
  assert.equal(h.shoot(),null);assert.equal(h.earnedEventCoins,10);
});
test('tickets consume exactly one on entry, cap at 30, and distance carries through reload',()=>{
  assert.deepEqual(eventState(),{tickets:5,distance:20,owned:[],shotgunReady:false,ghostsX2Ready:false});
  const entry=useTicket({tickets:1,distance:299});assert.equal(entry.ok,true);assert.equal(entry.state.tickets,0);
  assert.equal(useTicket(entry.state).ok,false);assert.equal(useTicket(entry.state).state.tickets,0);
  assert.equal(addTickets({tickets:29},3).tickets,30);
  assert.deepEqual(addDistance({tickets:2,distance:290},620),{tickets:5,distance:10,owned:[],shotgunReady:false,ghostsX2Ready:false});
  assert.deepEqual(addDistance({tickets:30,distance:20},300),{tickets:30,distance:20,owned:[],shotgunReady:false,ghostsX2Ready:false});
  const data={progressVersion:PROGRESS_VERSION,bestWave:7,eventState:{tickets:4,distance:199,owned:['badge']},economy:cleanEconomy({upgradeCoins:30,eventCoins:40,levels:{shop:2}})};
  const loaded=readProgress(key=>key===STORAGE_KEY?JSON.stringify(data):null);
  assert.equal(loaded.bestWave,7);assert.deepEqual(eventState(loaded.eventState),{...data.eventState,shotgunReady:false,ghostsX2Ready:false});assert.deepEqual(loaded.economy,data.economy);
});
test('exchange spends only pumpkin coins and rejects duplicates and insufficient balances',()=>{
  const e=cleanEconomy({upgradeCoins:900,eventCoins:100});const purchase=exchange({},e,'badge');
  assert.equal(purchase.ok,true);assert.equal(purchase.economy.eventCoins,60);assert.equal(purchase.economy.upgradeCoins,900);
  assert.deepEqual(purchase.state.owned,['badge']);assert.equal(e.eventCoins,100);
  assert.equal(exchange(purchase.state,purchase.economy,'badge').ok,false);
  assert.equal(exchange(purchase.state,purchase.economy,'friend').ok,false);assert.equal(exchange({},e,'unknown').ok,false);
});
