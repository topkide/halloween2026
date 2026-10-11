import {DEFAULTS,settings} from './hunt-core.mjs?v=20261012-shared-balance';
import {cleanEconomy} from './upgrades.mjs?v=20261012-shared-balance';
import {missionState} from './missions.mjs?v=20261012-shared-balance';

export const STORAGE_KEY='catjump-wave-score-v1';
export const PROGRESS_VERSION=9;
const balanceDefaults=Object.fromEntries(['duration','missPenalty','waveRecoveryPercent','recoveryLimit','spawn','goldInterval','goldLimit','ghostCoins'].map(key=>[key,DEFAULTS[key]]));

export function readProgress(getItem){
  const read=key=>{
    try{const value=JSON.parse(getItem(key));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
  };
  const current=read(STORAGE_KEY);
  if(current){
    const version=Number.isSafeInteger(current.progressVersion)&&current.progressVersion>=0?current.progressVersion:0;
    // Version 9 applies the agreed twelve visible settings to existing browsers once.
    const resetBalanceDefaults=version<9;
    // Refund the retired upgrade at its original prices, independent of future balance changes.
    const level=current.economy?.levels?.reload;
    const retiredLevel=version<3&&Number.isSafeInteger(level)&&level>0?Math.min(10,level):0;
    const refundedReloadCoins=retiredLevel*20+10*retiredLevel*(retiredLevel-1)/2;
    const rewardLevel=current.economy?.levels?.reward;
    const retiredRewardLevel=version<6&&Number.isSafeInteger(rewardLevel)&&rewardLevel>0?Math.min(10,rewardLevel):0;
    const refundedRewardCoins=retiredRewardLevel*20+10*retiredRewardLevel*(retiredRewardLevel-1)/2;
    const economy=cleanEconomy(current.economy);
    economy.upgradeCoins+=refundedReloadCoins+refundedRewardCoins;
    return {
      config:settings({...current.config,...(resetBalanceDefaults?balanceDefaults:{})}),
      best:Number.isSafeInteger(current.best)&&current.best>=0?current.best:0,
      lastResult:current.lastResult??null,
      soundOn:current.soundOn!==false,
      economy,refundedReloadCoins,refundedRewardCoins,resetBalanceDefaults,
      bestWave:Number.isSafeInteger(current.bestWave)&&current.bestWave>=0?current.bestWave:0,eventState:current.eventState,missions:missionState(current.missions),
    };
  }
  const previous=read('catjump-wave-hunt-v1')??read('catjump-bounty-hunt-v1');
  // Retain preferences, establish the common balance, and keep old coin records separate.
  return {config:settings({...previous?.config,...balanceDefaults}),best:0,lastResult:null,soundOn:previous?.soundOn!==false,economy:cleanEconomy(),refundedReloadCoins:0,refundedRewardCoins:0,resetBalanceDefaults:previous!==null,bestWave:0,eventState:null,missions:missionState()};
}
