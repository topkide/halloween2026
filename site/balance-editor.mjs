import {DEFAULT_CONFIG,FIELD_GROUPS,getValue,setValue,validateConfig,parseBalanceDB,serializeBalanceDB} from './balance-config.mjs';

export function createBalanceEditor({getConfig,onSave,onOpen}){
  const $=id=>document.getElementById(id),dialog=$('balance-dialog'),form=$('balance-form'),container=$('balance-fields');
  let draft=structuredClone(DEFAULT_CONFIG),request=0;
  const report=(text,error=false)=>{$('balance-message').textContent=text;$('balance-message').classList.toggle('error',error);};
  function render(){
    container.replaceChildren();
    for(const group of FIELD_GROUPS){
      const section=document.createElement('details');section.className='balance-group';section.open=true;
      const summary=document.createElement('summary');summary.textContent=group.title;section.append(summary);
      if(group.note){const note=document.createElement('p');note.className='group-note';note.textContent=group.note;section.append(note);}
      const grid=document.createElement('div');grid.className='balance-grid';
      for(const f of group.fields){
        const label=document.createElement('label');label.className='balance-field';
        const title=document.createElement('span');title.textContent=f.label;
        const control=document.createElement('span');control.className='field-control';
        const input=document.createElement('input');input.type='number';input.min=f.min;input.max=f.max;input.step=f.step;
        input.value=getValue(draft,f.path);input.required=true;input.inputMode=f.step===1?'numeric':'decimal';input.setAttribute('aria-label',f.label);
        input.addEventListener('input',()=>{setValue(draft,f.path,input.value===''?NaN:Number(input.value));report('적용하면 다음 게임부터 사용합니다.');});
        const unit=document.createElement('span');unit.textContent=f.unit;
        control.append(input,unit);label.append(title,control);grid.append(label);
      }
      section.append(grid);container.append(section);
    }
  }
  function open(){
    if(onOpen?.()===false)return false;
    request++;draft=structuredClone(getConfig());render();
    $('balance-db-file').textContent='memory-room v1 · 모든 시간 단위는 초입니다.';
    report('변경 사항은 다음 게임부터 적용됩니다.');dialog.showModal();return true;
  }
  $('balance-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>request++);
  form.onsubmit=event=>{event.preventDefault();try{onSave(validateConfig(draft));dialog.close();}catch(error){report(error.message,true);}};
  $('balance-reset').onclick=()=>{request++;draft=structuredClone(DEFAULT_CONFIG);render();report('최신 기획 기본값을 불러왔습니다. 적용하면 다음 게임부터 사용합니다.');};
  $('balance-export').onclick=()=>{
    try{
      const config=validateConfig(draft),blob=new Blob([serializeBalanceDB(config)],{type:'application/json'}),url=URL.createObjectURL(blob);
      onSave(config);
      const anchor=document.createElement('a');anchor.href=url;anchor.download='catjump-memory-balance-v1.json';anchor.hidden=true;
      document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      report('DB 파일을 저장하고 다음 게임에 적용했습니다.');
    }catch(error){report(error.message,true);}
  };
  $('balance-import').onclick=()=>$('balance-file').click();
  $('balance-file').onchange=async()=>{
    const currentRequest=++request;
    try{
      const file=$('balance-file').files[0];$('balance-file').value='';if(!file)return;
      if(file.size>200000)throw new Error('200KB 이하 JSON 파일을 선택해 주세요.');
      const value=parseBalanceDB(await file.text());
      if(currentRequest!==request||!dialog.open)return;
      draft=value;render();$('balance-db-file').textContent=file.name;report('불러왔습니다. 확인 후 적용해 주세요.');
    }catch(error){if(currentRequest===request)report(error.message,true);}
  };
  return {open};
}
