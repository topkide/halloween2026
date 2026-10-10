import {DEFAULTS,settings} from './hunt-core.mjs?v=20261011-freefire1';
import {cleanEconomy} from './upgrades.mjs?v=20261011-freefire1';

export const STORAGE_KEY='catjump-wave-score-v1';
export const PROGRESS_VERSION=3;

export function readProgress(getItem){
  const read=key=>{
    try{const value=JSON.parse(getItem(key));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
  };
  const current=read(STORAGE_KEY);
  if(current){
    // Refund the retired upgrade at its original prices, independent of future balance changes.
    const level=current.economy?.levels?.reload;
    const retiredLevel=(current.progressVersion??0)<3&&Number.isSafeInteger(level)&&level>0?Math.min(10,level):0;
    const refundedReloadCoins=retiredLevel*20+10*retiredLevel*(retiredLevel-1)/2;
    const economy=cleanEconomy(current.economy);
    economy.upgradeCoins=Math.min(1_000_000_000,economy.upgradeCoins+refundedReloadCoins);
    return {
      config:settings({...current.config,...((current.progressVersion??0)<2&&current.config?.goldInterval===4?{goldInterval:DEFAULTS.goldInterval}:{})}),
      best:Number.isSafeInteger(current.best)&&current.best>=0?current.best:0,
      lastResult:current.lastResult??null,
      soundOn:current.soundOn!==false,
      economy,refundedReloadCoins,
    };
  }
  const previous=read('catjump-wave-hunt-v1')??read('catjump-bounty-hunt-v1')??{};
  // Retain preferences, apply the new spawn rate, and keep old coin records separate.
  return {config:settings({...previous.config,spawn:DEFAULTS.spawn,goldInterval:DEFAULTS.goldInterval}),best:0,lastResult:null,soundOn:previous.soundOn!==false,economy:cleanEconomy(),refundedReloadCoins:0};
}
