import {DEFAULTS,settings} from './hunt-core.mjs?v=20261011-upgrade1';
import {cleanEconomy} from './upgrades.mjs?v=20261011-upgrade1';

export const STORAGE_KEY='catjump-wave-score-v1';
export const PROGRESS_VERSION=2;

export function readProgress(getItem){
  const read=key=>{
    try{const value=JSON.parse(getItem(key));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
  };
  const current=read(STORAGE_KEY);
  if(current)return {
    config:settings({...current.config,...(current.progressVersion!==PROGRESS_VERSION&&current.config?.goldInterval===4?{goldInterval:DEFAULTS.goldInterval}:{})}),
    best:Number.isSafeInteger(current.best)&&current.best>=0?current.best:0,
    lastResult:current.lastResult??null,
    soundOn:current.soundOn!==false,
    economy:cleanEconomy(current.economy),
  };
  const previous=read('catjump-wave-hunt-v1')??read('catjump-bounty-hunt-v1')??{};
  // Retain preferences, apply the new spawn rate, and keep old coin records separate.
  return {config:settings({...previous.config,spawn:DEFAULTS.spawn,goldInterval:DEFAULTS.goldInterval}),best:0,lastResult:null,soundOn:previous.soundOn!==false,economy:cleanEconomy()};
}
