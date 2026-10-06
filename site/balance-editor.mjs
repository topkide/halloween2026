import {DEFAULT_CONFIG,FIELD_GROUPS,TABLE_GROUPS,COLLECTIONS,getValue,setValue,validateConfig,parseBalanceDB,serializeBalanceDB} from './balance-config.mjs';
export function createBalanceEditor({getConfig,onSave,onOpen}){
  const $=id=>document.getElementById(id),dialog=$('balance-dialog'),form=$('balance-form'),container=$('balance-fields');
  let draft=structuredClone(DEFAULT_CONFIG),request=0;
  const report=(text,error=false)=>{$('balance-message').textContent=text;$('balance-message').classList.toggle('error',error);};
  function input(value,f,onChange){const n=document.createElement('input');n.type='number';n.min=f.min;n.max=f.max;n.step=f.step;n.value=value;n.required=true;n.inputMode='decimal';n.setAttribute('aria-label',f.label);n.addEventListener('input',()=>{onChange(n.value===''?NaN:Number(n.value));report('적용하면 다음 판부터 사용합니다.');});return n;}
  function section(title,note){const d=document.createElement('details');d.className='balance-group';d.open=true;const s=document.createElement('summary');s.textContent=title;d.append(s);if(note){const p=document.createElement('p');p.className='group-note';p.textContent=note;d.append(p);}container.append(d);return d;}
  function render(){
    container.replaceChildren();
    for(const group of TABLE_GROUPS){
      const d=section(group.title,group.note),wrap=document.createElement('div');wrap.className='balance-table-scroll';
      const table=document.createElement('table');table.className='balance-table';const thead=table.createTHead(),tr=thead.insertRow();
      for(const label of [...(group.fixed?['물품']:[]),...group.columns.map(c=>c.label),...(!group.fixed?['']:[])]){const th=document.createElement('th');th.textContent=label;tr.append(th);}
      const body=table.createTBody();
      draft[group.key].forEach((r,i)=>{const row=body.insertRow();if(group.fixed){row.insertCell().textContent=COLLECTIONS.find(c=>c.id===r.id).name;}
        for(const f of group.columns)row.insertCell().append(input(r[f.key],f,v=>r[f.key]=v));
        if(!group.fixed){const del=document.createElement('button');del.type='button';del.textContent='삭제';del.disabled=draft[group.key].length===1;del.setAttribute('aria-label',`${group.title} ${i+1}행 삭제`);del.onclick=()=>{draft[group.key].splice(i,1);render();};row.insertCell().append(del);}
      });wrap.append(table);d.append(wrap);
      if(!group.fixed){const add=document.createElement('button');add.type='button';add.className='quiet-button';add.textContent='시간 구간 추가';add.onclick=()=>{if(draft[group.key].length>=50)return;const last=draft[group.key].at(-1);draft[group.key].push({...last,at:last.at+30});render();};d.append(add);}
    }
    for(const group of FIELD_GROUPS){const d=section(group.title,group.note),grid=document.createElement('div');grid.className='balance-grid';
      for(const f of group.fields){const label=document.createElement('label');label.className='balance-field';const title=document.createElement('span');title.textContent=f.label;const control=document.createElement('span');control.className='field-control';control.append(input(getValue(draft,f.path),f,v=>setValue(draft,f.path,v)));const unit=document.createElement('span');unit.textContent=f.unit;control.append(unit);label.append(title,control);grid.append(label);}d.append(grid);
    }
  }
  function open(){request++;onOpen();draft=structuredClone(getConfig());render();$('balance-db-file').textContent='v6 · 시간대별 테이블과 컬렉션 확률을 함께 보관합니다.';report('모든 초기 수치는 테스트용입니다. 변경 사항은 다음 판부터 적용됩니다.');dialog.showModal();}
  $('balance-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>request++);
  form.onsubmit=e=>{e.preventDefault();try{onSave(validateConfig(draft));dialog.close();}catch(e){report(e.message,true);}};
  $('balance-reset').onclick=()=>{draft=structuredClone(DEFAULT_CONFIG);render();report('최신 기획 기본값을 불러왔습니다. 적용 후 다음 판부터 사용합니다.');};
  $('balance-export').onclick=()=>{try{const config=validateConfig(draft),blob=new Blob([serializeBalanceDB(config)],{type:'application/json'}),url=URL.createObjectURL(blob);onSave(config);const a=document.createElement('a');a.href=url;a.download='catjump-balance-v6.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);report('DB 파일을 저장하고 다음 판에 적용했습니다.');}catch(e){report(e.message,true);}};
  $('balance-import').onclick=()=>$('balance-file').click();
  $('balance-file').onchange=async()=>{const n=++request;try{const file=$('balance-file').files[0];$('balance-file').value='';if(!file)return;if(file.size>200000)throw new Error('200KB 이하 JSON 파일을 선택해 주세요.');const value=parseBalanceDB(await file.text());if(n!==request||!dialog.open)return;draft=value;render();$('balance-db-file').textContent=file.name;report('불러왔습니다. 확인 후 적용해 주세요.');}catch(e){if(n===request)report(e.message,true);}};
  return {open};
}
