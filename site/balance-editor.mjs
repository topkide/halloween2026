import {DEFAULT_CONFIG,FIELD_GROUPS,getValue,setValue,validateConfig,parseBalanceDB,serializeBalanceDB} from './balance-config.mjs';

export function createBalanceEditor({getConfig,onSave,onOpen}){
  const dialog=document.getElementById('balance-dialog'),form=document.getElementById('balance-form');
  const container=document.getElementById('balance-fields'),message=document.getElementById('balance-message');
  const inputs=new Map(),dbFile=document.getElementById('balance-db-file');
  let loadRequest=0;
  for(const group of FIELD_GROUPS){
    const section=document.createElement('details');section.className='balance-group';section.open=true;
    const summary=document.createElement('summary');summary.textContent=group.title;section.append(summary);
    if(group.note){const p=document.createElement('p');p.className='group-note';p.textContent=group.note;section.append(p);}
    const grid=document.createElement('div');grid.className='balance-grid';
    for(const f of group.fields){
      const label=document.createElement('label');label.className='balance-field';
      const title=document.createElement('span');title.textContent=f.label;label.append(title);
      const control=document.createElement('span');control.className='field-control';
      const input=document.createElement('input');input.dataset.path=f.path;input.name=f.path;
      if(f.type==='boolean'){input.type='checkbox';label.classList.add('toggle-field');}
      else{input.type='number';input.min=String(f.min);input.max=String(f.max);input.step=String(f.step);input.inputMode='decimal';input.required=true;}
      control.append(input);
      if(f.unit){const unit=document.createElement('span');unit.textContent=f.unit;control.append(unit);}
      label.append(control);grid.append(label);inputs.set(f.path,{input,field:f});
    }
    section.append(grid);container.append(section);
  }
  function fill(config){for(const [path,{input,field}] of inputs){if(field.type==='boolean')input.checked=getValue(config,path);else input.value=String(getValue(config,path));}}
  function read(){
    const draft=structuredClone(DEFAULT_CONFIG);
    for(const [path,{input,field}] of inputs){
      if(field.type==='boolean')setValue(draft,path,input.checked);
      else{if(input.value.trim()==='')throw new Error(`${field.label} 값을 입력해 주세요.`);setValue(draft,path,Number(input.value));}
    }
    return validateConfig(draft);
  }
  function report(text,error=false){message.textContent=text;message.classList.toggle('error',error);}
  function open(){loadRequest++;onOpen();fill(getConfig());dbFile.textContent='현재 적용된 밸런스 · DB 파일로 저장해 보관하세요.';report('변경한 값은 적용 후 다음 판부터 사용합니다.');dialog.showModal();}
  document.getElementById('balance-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>loadRequest++);
  form.addEventListener('input',()=>{loadRequest++;dbFile.textContent='수치 변경됨 · DB 파일 저장 시 현재 입력값을 담아요.';report('변경한 값은 적용 후 다음 판부터 사용합니다.');});
  form.addEventListener('submit',event=>{event.preventDefault();try{onSave(read());dialog.close();}catch(error){report(error.message,true);}});
  document.getElementById('balance-reset').addEventListener('click',()=>{loadRequest++;fill(DEFAULT_CONFIG);dbFile.textContent='빠르게 기본값 · 아직 적용하지 않았어요.';report('기본값을 불러왔어요. 적용하면 다음 판에 사용합니다.');});
  document.getElementById('balance-export').addEventListener('click',()=>{
    try{
      const config=read(),json=serializeBalanceDB(config),now=new Date(),pad=n=>String(n).padStart(2,'0');
      const stamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const name=`catjump-balance-${stamp}.json`,url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
      try{
        const saved=onSave(config),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();
        dbFile.textContent=`저장한 DB: ${name}`;
        report(`DB 파일을 내보냈어요. 현재 입력값은 다음 판에도 적용됩니다.${saved?.persisted===false?' 브라우저 보관이 제한되어 있으니 파일을 보관해 주세요.':''}`);
      }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(error){report(error.message,true);}
  });
  const file=document.getElementById('balance-file');document.getElementById('balance-import').addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
    const request=++loadRequest;
    try{
      const selected=file.files?.[0];file.value='';if(!selected)return;if(selected.size>200000)throw new Error('200KB 이하의 밸런스 DB JSON 파일을 선택해 주세요.');
      const config=parseBalanceDB(await selected.text());if(request!==loadRequest||!dialog.open)return;
      fill(config);dbFile.textContent=`불러온 DB: ${selected.name}`;report('DB를 불러왔어요. 수치를 확인하고 적용하고 닫기를 눌러주세요.');
    }catch(error){if(request===loadRequest&&dialog.open)report(error.message,true);}
  });
  return {open};
}
