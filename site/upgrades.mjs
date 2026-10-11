// Prototype balance values live here so costs, caps and rewards can be tuned together.
export const BALANCE=Object.freeze({maxLevel:10,firstCost:20,costStep:10,goldStartPercent:50,goldStepPercent:5,coinStepPerKill:1,coinsPerKill:1,shopStepPercent:10,waveBase:10,waveStep:5});
export const UPGRADES=Object.freeze({gold:{name:'황금 유령 등장 확률'},reward:{name:'강화 코인 획득량'},shop:{name:'웨이브 상점 코인'}});
const whole=(n,max=1_000_000_000)=>Number.isSafeInteger(n)&&n>=0?Math.min(n,max):0;
export function upgradeLevels(value={}){
  return Object.fromEntries(Object.keys(UPGRADES).map(key=>[key,whole(value?.[key],BALANCE.maxLevel)]));
}
export function upgradeEffects(value={}){
  const levels=upgradeLevels(value);
  return Object.freeze({goldChance:(BALANCE.goldStartPercent+levels.gold*BALANCE.goldStepPercent)/100,coinsPerKill:BALANCE.coinsPerKill+levels.reward*BALANCE.coinStepPerKill,extraCoinsPerGhost:levels.reward*BALANCE.coinStepPerKill,shopBonusPercent:levels.shop*BALANCE.shopStepPercent});
}
export function cleanEconomy(value={}){
  return {upgradeCoins:whole(value?.upgradeCoins),eventCoins:whole(value?.eventCoins),levels:upgradeLevels(value?.levels),claimedRuns:Array.isArray(value?.claimedRuns)?value.claimedRuns.filter(id=>typeof id==='string'&&id.length>0&&id.length<120).slice(-32):[]};
}
export function upgradeCost(level){return level>=BALANCE.maxLevel?null:BALANCE.firstCost+whole(level,BALANCE.maxLevel)*BALANCE.costStep;}
export function buyUpgrade(value,key){
  const economy=cleanEconomy(value);
  if(!Object.hasOwn(UPGRADES,key))return {ok:false,reason:'unknown',economy};
  const cost=upgradeCost(economy.levels[key]);
  if(cost===null)return {ok:false,reason:'max',economy};
  if(economy.upgradeCoins<cost)return {ok:false,reason:'funds',economy};
  return {ok:true,cost,economy:{...economy,upgradeCoins:economy.upgradeCoins-cost,levels:{...economy.levels,[key]:economy.levels[key]+1}}};
}
export const GHOST_COINS=Object.freeze({pudge:1,grasp:2,wisp:3,stilt:4,skitter:5});
export function waveReward(wave,levels){
  const base=BALANCE.waveBase+Math.max(0,whole(wave)-1)*BALANCE.waveStep;
  return Math.floor(base*(100+upgradeEffects(levels).shopBonusPercent)/100);
}
export function runRewards(result){
  return {upgradeCoins:whole(result?.earnedUpgradeCoins),eventCoins:whole(result?.earnedEventCoins)};
}
export function settleRun(value,result,levels){
  const economy=cleanEconomy(value),rewards=runRewards(result,levels),id=result?.runId;
  if(typeof id!=='string'||!id||id.length>=120||economy.claimedRuns.includes(id))return {awarded:false,economy,rewards};
  return {awarded:true,rewards,economy:{...economy,upgradeCoins:whole(economy.upgradeCoins+rewards.upgradeCoins),eventCoins:whole(economy.eventCoins+rewards.eventCoins),claimedRuns:[...economy.claimedRuns,id].slice(-32)}};
}
