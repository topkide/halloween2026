export const FIXED_MODE='fast';
export const COLLECTIONS=[
  {id:'textbook',name:'교과서'},{id:'slippers',name:'실내화'},{id:'basketball',name:'농구공'},
  {id:'badminton',name:'배드민턴채'},{id:'backpack',name:'책가방'},{id:'football',name:'축구공'},
  {id:'pencilcase',name:'필통'},{id:'recorder',name:'리코더'},{id:'homework',name:'숙제종이'}
];
export const DEFAULT_CONFIG={
  version:6,
  round:{startTime:30,health:5,missDamage:1,countdown:3},
  movement:{normal:18,bomb:14,boss:16},
  normalTable:[
    {at:0,interval:.45,life:2.2,points:100,penalty:.5},
    {at:20,interval:.36,life:1.8,points:120,penalty:.65},
    {at:40,interval:.28,life:1.4,points:140,penalty:.8},
    {at:60,interval:.22,life:1.05,points:160,penalty:1}
  ],
  bombTable:[{at:0,interval:4,life:2.4},{at:20,interval:3.3,life:2},{at:40,interval:2.7,life:1.6},{at:60,interval:2.2,life:1.3}],
  boss:{firstAt:5,respawn:6,hp:5,points:500,timeBonus:8,abilityInterval:5,warning:3,abilityDuration:2,opacity:35,size:85},
  items:{flashlight:{duration:3},talisman:{duration:5,grace:.5}},
  talismanTable:[{at:0,interval:.09},{at:20,interval:.08},{at:40,interval:.06},{at:60,interval:.05}],
  continue:{rewind:30},
  collectionTable:COLLECTIONS.map((x,i)=>({id:x.id,at:[15,25,35,45,55,65,75,90,105][i],chance:[20,20,18,18,15,15,12,10,8][i]}))
};
const field=(path,label,min,max,step=1,unit='')=>({path,label,min,max,step,unit});
export const FIELD_GROUPS=[
  {title:'한 판의 기본 규칙',fields:[field('round.startTime','시작·이어하기 제한 시간',5,300,.1,'초'),field('round.health','최대 체력',1,20,1,'칸'),field('round.missDamage','허공 터치 체력 감소',0,5,1,'칸'),field('round.countdown','시작 준비 시간',0,5,1,'초')]},
  {title:'이동 · 빠르게 기본값',note:'좌우·고정 대각선 등속 이동. 곡선 이동은 사용하지 않습니다.',fields:[field('movement.normal','일반 유령 이동 속도',0,30,.1,'%/초'),field('movement.bomb','폭탄 유령 이동 속도',0,30,.1,'%/초'),field('movement.boss','보스 이동 속도',0,30,.1,'%/초')]},
  {title:'보스 · 최대 1마리',note:'첫 등장은 플레이 경과 시간 기준, 이후에는 처치 후 대기 시간 기준입니다. 피격 시 순간이동하며 손전등에는 즉시 처치됩니다.',fields:[field('boss.firstAt','첫 등장 시간',0,600,.1,'초'),field('boss.respawn','처치 후 다음 등장까지',.1,120,.1,'초'),field('boss.hp','처치에 필요한 터치 수',1,30,1,'회'),field('boss.points','처치 점수',0,100000,1,'점'),field('boss.timeBonus','처치 시 추가 제한 시간',0,60,.1,'초')]},
  {title:'보스 · 얼굴 방해',note:'능력 간격은 등장·직전 능력 종료·부적 종료부터 계산합니다. 예고는 발동 직전에 시작합니다. 얼굴 뒤의 대상도 터치할 수 있습니다.',fields:[field('boss.abilityInterval','능력 사용 간격',.1,60,.1,'초'),field('boss.warning','발동 전 예고 시간',0,10,.1,'초'),field('boss.abilityDuration','얼굴 유지 시간',.1,10,.1,'초'),field('boss.opacity','얼굴 불투명도',10,70,1,'%'),field('boss.size','얼굴 크기',50,100,1,'%')]},
  {title:'아이템 · 각각 1개 보유 / 한 판에 각 1회',note:'미사용 아이템은 다음 판으로 이월됩니다. 두 효과는 동시에 적용할 수 있습니다.',fields:[field('items.flashlight.duration','손전등 자동 처치 유지 시간',.1,20,.1,'초'),field('items.talisman.duration','부적 지속 시간',.1,30,.1,'초'),field('items.talisman.grace','부적 종료 후 허공 터치 보호',0,5,.1,'초')]},
  {title:'광고 이어하기 · 한 판에 1회',note:'체력·제한 시간 완전 회복, 보유분을 소모하지 않는 부적 자동 발동. 기존 필드는 보상 없이 정리하고 다음 보스는 대기 시간 후 등장합니다.',fields:[field('continue.rewind','난이도 플레이 타임 되감기',0,300,.1,'초')]}
];
const col=(key,label,min,max,step=1)=>({key,label,min,max,step});
export const TABLE_GROUPS=[
  {key:'normalTable',title:'일반 유령 · 시간대별 테이블',note:'시작 시간 이상부터 다음 행 직전까지 적용. 생성 시 체류·점수·놓침 페널티를 고정합니다.',columns:[col('at','시작(초)',0,3600,.1),col('interval','소환 간격(초)',.05,30,.01),col('life','체류(초)',.1,15,.1),col('points','처치 점수',0,100000),col('penalty','놓침 시간 감소(초)',0,30,.1)]},
  {key:'bombTable',title:'폭탄 유령 · 시간대별 테이블',note:'자연 소멸·손전등 처치 시 생성 시점의 일반 유령 점수 지급. 터치하면 체력 −1, 점수 없음. 별도 최대 마릿수 제한 없음.',columns:[col('at','시작(초)',0,3600,.1),col('interval','소환 간격(초)',.1,60,.1),col('life','체류(초)',.1,15,.1)]},
  {key:'talismanTable',title:'부적 · 시간대별 소환 간격',note:'일반 유령 생성 간격만 교체합니다. 별도 유령을 즉시 쏟아내지 않으며 체류·점수는 일반 테이블을 따릅니다. 폭탄 생성 중단, 보스 능력 중단.',columns:[col('at','시작(초)',0,3600,.1),col('interval','소환 간격(초)',.05,5,.01)]},
  {key:'collectionTable',title:'컬렉션 · 결과창 일괄 추첨',fixed:true,note:'최고 도달 플레이 타임이 조건을 충족한 미보유 물품을 각각 1회 추첨합니다. 확률은 퍼센트(0.05 = 0.05%). 최대 2종 지급, 3종 이상 당첨 시 무작위 2종. 아래 수치는 테스트용 임시값입니다.',columns:[col('at','필요 도달 시간(초)',0,3600,.1),col('chance','획득 확률(%)',0,100,.01)]}
];
export const getValue=(c,p)=>p.split('.').reduce((o,k)=>o?.[k],c);
export function setValue(c,p,v){const a=p.split('.'),k=a.pop();a.reduce((o,k)=>o[k],c)[k]=v;}
export function rowAt(rows,time){let row=rows[0];for(const r of rows){if(r.at>time)break;row=r;}return row;}
function number(value,f,label){if(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max||(f.step===1&&!Number.isInteger(value)))throw new Error(`${label}: ${f.min}~${f.max} 범위로 입력해 주세요.`);return value;}
export function validateConfig(input){
  if(!input||input.version!==6)throw new Error('시간대별 테이블을 사용하는 v6 DB가 필요합니다. 구버전 DB는 그대로 보관하고 최신 기본값으로 시작해 주세요.');
  const out=structuredClone(DEFAULT_CONFIG);
  for(const group of FIELD_GROUPS)for(const f of group.fields)setValue(out,f.path,number(getValue(input,f.path),f,f.label));
  for(const group of TABLE_GROUPS){
    const rows=input[group.key];if(!Array.isArray(rows)||!rows.length||rows.length>50)throw new Error(`${group.title}: 1~50행이 필요합니다.`);
    if(group.fixed&&(rows.length!==9||new Set(rows.map(r=>r.id)).size!==9||rows.some(r=>!COLLECTIONS.some(c=>c.id===r.id))))throw new Error('컬렉션은 지정된 9종이 모두 필요합니다.');
    out[group.key]=rows.map((r,i)=>{const v=group.fixed?{id:r.id}:{};for(const f of group.columns)v[f.key]=number(r[f.key],f,`${group.title} ${i+1}행 ${f.label}`);return v;});
    if(!group.fixed){out[group.key].sort((a,b)=>a.at-b.at);if(out[group.key][0].at!==0||new Set(out[group.key].map(r=>r.at)).size!==rows.length)throw new Error(`${group.title}: 0초 행이 필요하며 시작 시간이 중복되면 안 됩니다.`);}
  }
  if(out.boss.warning>out.boss.abilityInterval)throw new Error('보스 예고 시간은 능력 사용 간격 이하여야 합니다.');
  return out;
}
export function parseBalanceDB(text){let v;try{v=JSON.parse(text);}catch{throw new Error('올바른 JSON 파일을 선택해 주세요.');}return validateConfig(v);}
export const serializeBalanceDB=c=>JSON.stringify(validateConfig(c),null,2)+'\n';
function freeze(v){Object.values(v).forEach(x=>{if(x&&typeof x==='object')freeze(x);});return Object.freeze(v);}freeze(DEFAULT_CONFIG);
