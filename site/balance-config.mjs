const field=(path,label,min,max,step=.01,unit='초')=>({path,label,min,max,step,unit});
export const FIELD_GROUPS=[
  {title:'기억과 사격 시간',note:'플레이 경과 시간에 따라 시작값에서 최솟값까지 줄어듭니다. 각 배치를 시작할 때 정한 시간은 해당 배치에서 유지합니다.',fields:[
    field('difficulty.rampSeconds','최고 난이도까지 걸리는 시간',1,600,.1),
    field('difficulty.memoryStart','처음 유령을 보여주는 시간',.05,10),
    field('difficulty.memoryMin','최소 노출 시간',.05,10),
    field('difficulty.huntStart','처음 사격 제한 시간',.1,60),
    field('difficulty.huntMin','최소 사격 제한 시간',.1,60)
  ]},
  {title:'유령 수',note:'배치를 통과할 때마다 한 마리씩 늘어납니다. 하얀 유령과 뿔 유령의 최대 합은 12마리입니다.',fields:[
    field('difficulty.targetsStart','처음 하얀 유령 수',1,11,1,'마리'),
    field('difficulty.targetsMax','최대 하얀 유령 수',1,11,1,'마리'),
    field('difficulty.decoysStart','처음 뿔 유령 수',0,11,1,'마리'),
    field('difficulty.decoysMax','최대 뿔 유령 수',0,11,1,'마리')
  ]},
  {title:'연속 명중',note:'첫 명중에는 시간 보너스가 없습니다. 두 번째 명중부터 기본 보너스와 증가량을 적용하며 최대값을 넘지 않습니다.',fields:[
    field('combo.window','콤보를 이어갈 수 있는 간격',.05,5),
    field('combo.bonusStart','2연속 명중 시간 보너스',0,5),
    field('combo.bonusStep','추가 연속 명중마다 늘어나는 보너스',0,5),
    field('combo.bonusMax','한 번에 얻는 최대 시간 보너스',0,5)
  ]},
  {title:'돌진하는 뿔 유령 분신',note:'분신은 서로 다른 행을 지나갑니다. 콤보 또는 난이도 비율 조건을 채우면 여러 분신이 함께 나타날 수 있습니다.',fields:[
    field('haunt.enabled','분신 사용 · 0 끄기 / 1 켜기',0,1,1,''),
    field('haunt.warning','돌진 전 경고 시간',0,3),
    field('haunt.travelStart','처음 가로지르는 시간',.1,10),
    field('haunt.travelMin','최소 가로지르는 시간',.1,10),
    field('haunt.max','동시에 나타나는 최대 분신 수',1,4,1,'마리'),
    field('haunt.extraAtCombo','추가 분신이 가능한 콤보',1,12,1,'연속'),
    field('haunt.extraAtProgress','추가 분신이 가능한 난이도 비율',0,1,.01,'0~1')
  ]},
  {title:'배치 전환',fields:[
    field('transition.firstPrepare','첫 배치 준비 시간',0,5),
    field('transition.prepare','다음 배치 준비 시간',0,5),
    field('transition.blackout','암전 후 사격까지',0,3),
    field('transition.impact','전부 명중 후 어두운 연출',0,3),
    field('transition.tremble','뿔 유령이 떠는 시간',0,5)
  ]},
  {title:'명중 안개와 긴박한 효과음',fields:[
    field('effects.fogEnabled','명중 안개 · 0 끄기 / 1 켜기',0,1,1,''),
    field('effects.fogDuration','안개 유지 시간',.05,5),
    field('effects.heartbeatBelow','박동음을 시작하는 남은 시간',0,10),
    field('effects.heartbeatInterval','박동음 간격',.05,3)
  ]}
];

export const getValue=(config,path)=>path.split('.').reduce((value,key)=>value?.[key],config);
export function setValue(config,path,value){const keys=path.split('.'),last=keys.pop();keys.reduce((obj,key)=>obj[key],config)[last]=value;}
export function validateConfig(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1||input.game!=='memory-room')
    throw new Error('기억력 게임용 memory-room v1 DB가 필요합니다. 이전 사격장 v6 DB는 사용할 수 없습니다.');
  const result={version:1,game:'memory-room',difficulty:{},combo:{},haunt:{},transition:{},effects:{}};
  for(const group of FIELD_GROUPS)for(const f of group.fields){
    const value=getValue(input,f.path);
    if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.step===1&&!Number.isInteger(value)))
      throw new Error(`${f.label}: ${f.min}~${f.max} 범위${f.step===1?'의 정수':''}로 입력해 주세요.`);
    setValue(result,f.path,value);
  }
  for(const [lower,upper,label] of [
    ['difficulty.memoryMin','difficulty.memoryStart','최소 노출 시간'],
    ['difficulty.huntMin','difficulty.huntStart','최소 사격 제한 시간'],
    ['difficulty.targetsStart','difficulty.targetsMax','처음 하얀 유령 수'],
    ['difficulty.decoysStart','difficulty.decoysMax','처음 뿔 유령 수'],
    ['combo.bonusStart','combo.bonusMax','2연속 명중 보너스'],
    ['haunt.travelMin','haunt.travelStart','분신 최소 이동 시간']
  ])if(getValue(result,lower)>getValue(result,upper))throw new Error(`${label}이 대응하는 시작값 또는 최대값보다 클 수 없습니다.`);
  if(result.difficulty.targetsMax+result.difficulty.decoysMax>12)throw new Error('하얀 유령과 뿔 유령의 최대 합은 12마리 이하여야 합니다.');
  return result;
}
export function parseBalanceDB(text){let input;try{input=JSON.parse(text);}catch{throw new Error('올바른 JSON 파일을 선택해 주세요.');}return validateConfig(input);}
export const serializeBalanceDB=config=>JSON.stringify(validateConfig(config),null,2)+'\n';

async function loadDefaults(){
  const url=new URL('./balance-default.json',import.meta.url);
  if(url.protocol==='file:'){
    const {readFile}=await import('node:fs/promises');
    return parseBalanceDB(await readFile(url,'utf8'));
  }
  const response=await fetch(url,{cache:'no-cache'});
  if(!response.ok)throw new Error('기본 밸런스 DB를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
  return validateConfig(await response.json());
}
function freeze(value){for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value);}
export const DEFAULT_CONFIG=freeze(await loadDefaults());
