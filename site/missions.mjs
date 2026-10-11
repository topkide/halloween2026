import {upgradeLevels} from './upgrades.mjs?v=20261012-shared-balance';

export const MISSIONS=Object.freeze([
  {id:'pudge',kind:'capture',goal:500,title:'뚱보 유령 500마리 잡기'},
  {id:'wisp',kind:'capture',goal:500,title:'길쭉이 유령 500마리 잡기'},
  {id:'stilt',kind:'capture',goal:500,title:'성큼이 유령 500마리 잡기'},
  {id:'grasp',kind:'capture',goal:500,title:'주렁이 유령 500마리 잡기'},
  {id:'skitter',kind:'capture',goal:500,title:'납작이 유령 500마리 잡기'},
  {id:'gold',kind:'capture',goal:100,title:'황금 유령 100마리 잡기'},
  {id:'time',kind:'upgrade',goal:30,title:'시간 회복 30레벨 달성하기'},
  {id:'gold-level',key:'gold',kind:'upgrade',goal:30,title:'황금 유령 확률 30레벨 달성하기'},
  {id:'shop',kind:'upgrade',goal:30,title:'웨이브 보상 증가 30레벨 달성하기'}
].map(mission=>Object.freeze(mission)));
export const MISSION_REWARD=Object.freeze({id:'halloween-special-cat',name:'특별 고양이'});
const captures=MISSIONS.filter(mission=>mission.kind==='capture');

export function missionState(value){
  return {
    kills:Object.fromEntries(captures.map(({id,goal})=>{
      const count=value?.kills?.[id];
      return [id,Number.isSafeInteger(count)&&count>=0?Math.min(goal,count):0];
    })),
    rewardClaimed:value?.rewardClaimed===true
  };
}

// Only successful targets returned by the engine enter this function. A
// shotgun's whole target list counts, including its final wave-clear blast.
export function addMissionCaptures(value,targets=[]){
  const state=missionState(value),seen=new Set();
  if(!Array.isArray(targets))return state;
  for(const target of targets){
    const ghost=target?.ghost,definition=captures.find(mission=>mission.id===ghost?.type);
    if(!definition||!Number.isSafeInteger(ghost.id)||seen.has(ghost.id))continue;
    seen.add(ghost.id);
    state.kills[definition.id]=Math.min(definition.goal,state.kills[definition.id]+1);
  }
  return state;
}

export function missionSummary(value,levels={}){
  const state=missionState(value),upgrades=upgradeLevels(levels);
  const rows=MISSIONS.map(mission=>{
    const current=mission.kind==='capture'?state.kills[mission.id]:upgrades[mission.key??mission.id];
    return {...mission,current,complete:current>=mission.goal,ratio:current/mission.goal};
  });
  const completed=rows.filter(row=>row.complete).length,total=rows.length;
  return {rows,completed,total,rewardClaimed:state.rewardClaimed,canClaim:completed===total&&!state.rewardClaimed};
}

export function claimMissionReward(value,levels){
  const state=missionState(value);
  if(!missionSummary(state,levels).canClaim)return {awarded:false,state};
  return {awarded:true,state:{...state,rewardClaimed:true},reward:MISSION_REWARD};
}
