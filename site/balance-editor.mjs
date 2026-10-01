import {DEFAULT_CONFIG,FIELD_GROUPS,getValue,setValue,validateConfig} from './balance-config.mjs';

export function createBalanceEditor({getConfig,onSave,onOpen}){
  const dialog=document.getElementById('balance-dialog'),form=document.getElementById('balance-form');
  const container=document.getElementById('balance-fields'),message=document.getElementById('balance-message');
  const inputs=new Map();
  for(const group of FIELD_GROUPS){
    const section=document.createElement('details');section.className='balance-group';section.open=!group.mode||group.mode==='normal';
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
  function open(){onOpen();fill(getConfig());report('변경한 값은 저장 후 다음 판부터 적용됩니다.');dialog.showModal();}
  document.getElementById('balance-close').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',event=>{event.preventDefault();try{onSave(read());dialog.close();}catch(error){report(error.message,true);}});
  document.getElementById('balance-reset').addEventListener('click',()=>{fill(DEFAULT_CONFIG);report('기본값을 불러왔어요. 저장하면 다음 판에 적용됩니다.');});
  document.getElementById('balance-export').addEventListener('click',()=>{
    try{const json=JSON.stringify(read(),null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='catjump-ghost-balance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);report('입력한 설정을 JSON 파일로 내보냈어요.');}catch(error){report(error.message,true);}
  });
  const file=document.getElementById('balance-file');document.getElementById('balance-import').addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
    try{const selected=file.files?.[0];if(!selected)return;if(selected.size>200000)throw new Error('200KB 이하의 설정 JSON 파일을 선택해 주세요.');const config=validateConfig(JSON.parse(await selected.text()));fill(config);report('설정을 불러왔어요. 저장하면 다음 판에 적용됩니다.');}
    catch(error){report(error instanceof SyntaxError?'올바른 JSON 설정 파일이 아니에요.':error.message,true);}finally{file.value='';}
  });
  return {open};
}
