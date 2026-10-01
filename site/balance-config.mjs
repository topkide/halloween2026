export const FIXED_MODE = 'fast';

// Central gameplay values. The balance editor exports this same structure as JSON.
export const DEFAULT_CONFIG = {
  version:5,
  round:{startTime:30,health:5,missDamage:1,countdown:3},
  normal:{points:100,spawnJitter:15,interval:.48,life:3.3,minLife:.9,speed:11.5,max:8,escapePenalty:1},
  difficulty:{startsAt:10,maxAt:60},
  boss:{every:8,hp:5,points:500,bonus:10,cooldown:6,speed:8.3,teleportInterval:3,teleportOnHit:true},
  friend:{enabled:true,interval:5,life:2.5,speed:5.5,damage:1},
  face:{enabled:true,firstDelay:.5,interval:6,warning:1.2,approach:.6,duration:1.2,size:85,opacity:90},
  items:{flashlight:{bossDamage:2},talisman:{duration:5,interval:.12,initialCount:8,max:10,life:2,speed:10,points:100,grace:.3}}
};
const field=(path,label,min,max,step=1,unit='')=>({path,label,min,max,step,unit});
export const FIELD_GROUPS=[
  {title:'일반 유령 · 등장 간격',note:'간격이 짧을수록 자주 등장합니다. 등장 간격을 바꿔도 이동 속도와 체류 시간은 바뀌지 않아요.',fields:[field('normal.interval','등장 간격',.15,5,.01,'초'),field('normal.max','동시 등장 최대 수',1,15,1,'마리'),field('normal.spawnJitter','등장 간격의 무작위 편차',0,40,1,'%')]},
  {title:'일반 유령 · 이동과 체류',note:'기본 동작은 빠르게 기준입니다. 이동은 좌우·고정 대각선의 등속 이동이며, 세부 수치는 여기서 조정해요.',fields:[field('normal.speed','이동 속도 / 화면 너비',0,30,.1,'%/초'),field('normal.life','초기 체류 시간',.5,10,.1,'초'),field('normal.minLife','최고 난이도 체류 시간',.3,10,.1,'초')]},
  {title:'놓친 유령 페널티',note:'일반 유령이 체류 시간을 다 채우고 사라지면 마리마다 시간을 차감해요. 부적 사용 중인 일반 유령, 친구 고양이, 부적의 추가 유령은 시간 차감에서 제외합니다. 0초로 설정하면 페널티를 꺼요.',fields:[field('normal.escapePenalty','놓친 유령 1마리당 시간 차감',0,10,.1,'초')]},
  {title:'한 판의 기본 규칙',fields:[field('round.startTime','시작 제한 시간',5,300,1,'초'),field('round.health','시작 체력',1,20,1,'칸'),field('round.missDamage','헛발 체력 감소',0,20,1,'칸'),field('round.countdown','시작 전 준비 시간',0,5,1,'초'),field('normal.points','일반 유령 점수',0,10000,10,'점')]},
  {title:'플레이 시간에 따른 난이도',note:'남은 시간이 아닌 실제 플레이 시간 기준입니다. 일시정지 중에는 진행되지 않아요.',fields:[field('difficulty.startsAt','체류 시간 감소 시작',0,300,1,'초'),field('difficulty.maxAt','최고 난이도 도달',1,600,1,'초')]},
  {title:'보스 등장과 보상',note:'처치 후 대기시간이 지나고, 일반 유령을 새로 정해진 수만큼 잡아야 다음 보스가 등장합니다.',fields:[field('boss.every','등장에 필요한 일반 유령',1,100,1,'마리'),field('boss.cooldown','처치 후 최소 대기시간',0,120,.5,'초'),field('boss.hp','보스 처치에 필요한 명중',1,30,1,'회'),field('boss.bonus','보스 처치 추가 시간',0,60,.5,'초'),field('boss.points','보스 처치 점수',0,20000,50,'점')]},
  {title:'보스 이동과 순간이동',note:'좌우·고정 대각선으로 등속 이동합니다. 자동 순간이동 간격은 마지막 순간이동부터 재며, 0초면 자동 순간이동을 꺼요. 맞았을 때의 순간이동은 별도로 설정합니다.',fields:[field('boss.speed','이동 속도 / 화면 너비',0,30,.1,'%/초'),field('boss.teleportInterval','자동 순간이동 간격',0,30,.1,'초'),{path:'boss.teleportOnHit',label:'맞았을 때 순간이동',type:'boolean'}]},
  {title:'보스의 얼굴 장난',note:'보스가 살아 있으면 예고 후 시야 가림을 반복해요. 큰 얼굴은 눌러도 사라지지 않으며, 뒤의 실제 보스를 처치하면 즉시 끝나요. 사격은 얼굴 뒤의 대상에 적용됩니다.',fields:[{path:'face.enabled',label:'얼굴 장난 사용',type:'boolean'},field('face.firstDelay','보스 등장 후 첫 예고까지',0,30,.1,'초'),field('face.interval','장난 종료 후 다음 예고까지',1,60,.5,'초'),field('face.warning','미리 알려주는 시간',.8,5,.1,'초'),field('face.approach','얼굴이 커지거나 작아지는 시간',.3,2,.1,'초'),field('face.duration','큰 얼굴 유지 시간',.3,5,.1,'초'),field('face.size','얼굴 크기 / 화면 너비',50,100,5,'%'),field('face.opacity','얼굴 불투명도',40,100,5,'%')]},
  {title:'쏘면 안 되는 친구 고양이',note:'친구는 그대로 두면 지나갑니다. 맞혀도 점수나 보스 등장에 필요한 포획 수가 오르지 않아요.',fields:[{path:'friend.enabled',label:'친구 고양이 등장',type:'boolean'},field('friend.interval','등장 간격',1,30,.5,'초'),field('friend.life','체류 시간',.5,8,.1,'초'),field('friend.speed','이동 속도 / 화면 너비',0,30,.5,'%/초'),field('friend.damage','맞혔을 때 체력 감소',0,20,1,'칸')]},
  {title:'손전등 · 화면 싹쓸이',note:'일반 유령과 부적으로 추가된 유령을 모두 포획합니다. 친구는 안전하며, 보스 피해량은 명중 횟수 기준입니다. 각 아이템은 한 판에 1회 사용할 수 있어요.',fields:[field('items.flashlight.bossDamage','보스에게 주는 피해',0,30,1,'회')]},
  {title:'부적 · 무적과 유령 무리',note:'무적 중에는 헛발과 친구 오발로 체력이 줄지 않고, 일반 유령을 놓쳐도 시간 차감이 없어요. 제한 시간은 계속 흐릅니다. 추가 유령은 보스 등장 수에 포함되지 않으며, 효과가 끝나면 남은 추가 유령만 사라집니다.',fields:[field('items.talisman.duration','무적·추가 등장 지속 시간',1,15,.5,'초'),field('items.talisman.initialCount','사용 즉시 추가 등장',1,20,1,'마리'),field('items.talisman.interval','추가 유령 등장 간격',.05,1,.01,'초'),field('items.talisman.max','추가 유령 동시 등장 최대',1,20,1,'마리'),field('items.talisman.life','추가 유령 체류 시간',.5,10,.1,'초'),field('items.talisman.speed','추가 유령 이동 속도',0,30,.1,'%/초'),field('items.talisman.points','추가 유령 포획 점수',0,10000,10,'점'),field('items.talisman.grace','효과 종료 후 헛발 보호',0,1,.1,'초')]},
];
export const getValue=(config,path)=>path.split('.').reduce((value,key)=>value?.[key],config);
export function setValue(config,path,value){const keys=path.split('.');const last=keys.pop();keys.reduce((o,k)=>o[k],config)[last]=value;}
export function validateConfig(input){
  const result=structuredClone(DEFAULT_CONFIG);
  if(!input||typeof input!=='object'||![1,2,3,4,5].includes(input.version))throw new Error('밸런스 DB 파일의 버전을 확인해 주세요.');
  // Migrate older saves without resetting the user's existing tuning.
  const addedInV2=new Set(['boss.speed','boss.teleportInterval','boss.teleportOnHit']);
  const fixedModeFields=new Set(['normal.interval','normal.max','normal.life','normal.minLife','normal.speed']);
  for(const group of FIELD_GROUPS)for(const f of group.fields){
    let value=getValue(input,f.path);
    if(input.version<4&&fixedModeFields.has(f.path))value=input.modes?.fast?.[f.path.split('.')[1]];
    if(input.version===1&&value===undefined&&addedInV2.has(f.path))value=getValue(DEFAULT_CONFIG,f.path);
    if(input.version<3&&value===undefined&&f.path.startsWith('items.'))value=getValue(DEFAULT_CONFIG,f.path);
    if(input.version<5&&value===undefined&&f.path==='normal.escapePenalty')value=DEFAULT_CONFIG.normal.escapePenalty;
    if(f.type==='boolean'){if(typeof value!=='boolean')throw new Error(`${f.label} 값을 확인해 주세요.`);}
    else if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.step===1&&!Number.isInteger(value)))throw new Error(`${f.label}: ${f.min}~${f.max}${f.unit} 범위로 입력해 주세요.`);
    setValue(result,f.path,value);
  }
  if(result.difficulty.maxAt<=result.difficulty.startsAt)throw new Error('최고 난이도 도달 시간은 체류 시간 감소 시작보다 늦어야 해요.');
  if(result.items.talisman.initialCount>result.items.talisman.max)throw new Error('부적의 즉시 등장 수는 추가 유령 동시 등장 최대 수 이하여야 해요.');
  if(result.normal.minLife>result.normal.life)throw new Error('최고 난이도의 체류 시간은 초기 체류 시간 이하여야 해요.');
  return result;
}
export function parseBalanceDB(text){
  let input;
  try{input=JSON.parse(text);}catch{throw new Error('올바른 JSON 밸런스 DB 파일이 아니에요.');}
  return validateConfig(input);
}
export const serializeBalanceDB=config=>JSON.stringify(validateConfig(config),null,2)+'\n';
function freezeDeep(value){Object.values(value).forEach(v=>{if(v&&typeof v==='object')freezeDeep(v);});return Object.freeze(value);}
freezeDeep(DEFAULT_CONFIG);
