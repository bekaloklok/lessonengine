'use strict';
const $=id=>document.getElementById(id);
const configs={kmj:['Загрузить КМЖ','Загрузите свой план, проверьте текст и доработайте его с ИИ.','Доработать с ИИ →'],assessment:['Создать СОР / СОЧ','Задания, ответы и дескрипторы по вашим учебным целям.','Создать работу →'],homework:['Домашнее задание','Задания по теме урока с ответами для учителя.','Создать ДЗ →'],cards:['Создать карточки','Вопросы и ответы для повторения, работы в парах и печати.','Создать карточки →']};
const query=new URLSearchParams(location.search);const tool=Object.hasOwn(configs,query.get('tool'))?query.get('tool'):'assessment';
const config=configs[tool];$('tool-title').textContent=config[0];$('crumb').textContent=config[0];$('tool-description').textContent=config[1];$('generate').textContent=config[2];document.title=config[0]+' · Lesson Engine';
document.querySelectorAll('[data-tool]').forEach(a=>{if(a.dataset.tool===tool){a.setAttribute('aria-current','page');a.classList.add('active');}});
$('upload-area').hidden=tool!=='kmj';$('kind-wrap').hidden=tool!=='assessment';$('count-wrap').hidden=tool==='kmj';$('duration-wrap').hidden=tool==='cards';$('difficulty-wrap').hidden=tool==='kmj';$('source-label').textContent=tool==='kmj'?'Текст загруженного КМЖ':'Материалы и пожелания';if(tool==='cards')$('count-label').textContent='Количество карточек';if(tool==='kmj')$('duration').value='45';
['subject','grade','topic','goal'].forEach(k=>$(k).required=tool!=='kmj');$('source').required=tool==='kmj';
let lessons=[],history=[],current=null,controller=null,uploadController=null,locked=[];
const storageKey='lesson-engine-resources-v1';
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function readStorage(key){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
lessons=readStorage('lesson-engine-lessons-v1');history=readStorage(storageKey);
lessons.forEach(l=>{const option=document.createElement('option');option.value=l.id;option.textContent=[l.subject,l.grade?l.grade+' класс':'',l.topic].filter(Boolean).join(' · ');$('lesson-select').append(option);});
$('lesson-select').addEventListener('change',()=>{const l=lessons.find(x=>x.id===$('lesson-select').value);if(!l)return;['subject','grade','topic','goal'].forEach(k=>$(k).value=l[k]||'');$('source').value=[l.materials,l.assessment,l.homework,...(l.stages||[]).map(x=>x.title+' · '+x.minutes+' мин: '+x.notes)].filter(Boolean).join('\n\n');status('Данные урока добавлены. Уточните условия и запустите ИИ.');});
function lock(busy){if(busy){locked=[...$('tool-form').querySelectorAll('input,textarea,select,button')].filter(n=>n.id!=='cancel').map(n=>[n,n.disabled]);locked.forEach(([n])=>n.disabled=true);}else{locked.forEach(([n,d])=>n.disabled=d);locked=[];}$('cancel').hidden=!busy;$('tool-form').setAttribute('aria-busy',String(busy));}
function textNode(tag,text,parent){const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
function editable(tag,text,parent,onChange,label){const n=textNode(tag,text,parent);n.contentEditable='true';n.setAttribute('role','textbox');n.setAttribute('aria-label',label);n.setAttribute('aria-multiline','true');n.addEventListener('input',()=>onChange(n.innerText));return n;}
function show(result,id=null){
 current={id:id||crypto.randomUUID(),tool,result:JSON.parse(JSON.stringify(result)),updatedAt:Date.now()};const out=$('result-content');out.replaceChildren();$('result-actions').hidden=false;
 editable('h2',current.result.title,out,t=>current.result.title=t,'Название материала');
 current.result.sections.forEach(section=>{const node=document.createElement('section');node.className='result-section';editable('h3',section.heading,node,t=>section.heading=t,'Заголовок раздела');editable('p',section.body,node,t=>section.body=t,'Текст раздела');out.append(node);});
 if(current.result.cards.length){const grid=document.createElement('div');grid.className='flashcards';current.result.cards.forEach((card,i)=>{const node=document.createElement('article');node.className='flashcard';textNode('b',String(i+1).padStart(2,'0'),node);editable('p',card.question,node,t=>card.question=t,'Вопрос карточки '+(i+1));const details=document.createElement('details');textNode('summary','Показать ответ',details);editable('p',card.answer,details,t=>card.answer=t,'Ответ карточки '+(i+1));node.append(details);grid.append(node);});out.append(grid);}
}
function renderHistory(){const out=$('history');out.replaceChildren();const items=history.filter(x=>x.tool===tool).sort((a,b)=>b.updatedAt-a.updatedAt);if(!items.length){textNode('p','Здесь появятся сохранённые материалы этой вкладки.',out).className='empty';return;}items.forEach(item=>{const b=textNode('button',item.result.title+' · '+new Date(item.updatedAt).toLocaleDateString('ru-RU'),out);b.type='button';b.className='history-row';b.addEventListener('click',()=>{if(controller||uploadController){status('Сначала остановите текущую операцию.',true);return;}show(item.result,item.id);status('Материал открыт для редактирования.');});});}
renderHistory();
$('document-file').addEventListener('change',async()=>{
 const file=$('document-file').files[0];if(!file)return;if(file.size>3*1024*1024){status('Выберите файл до 3 МБ.',true);return;}
 if(location.protocol==='file:'){status('Откройте сайт через localhost, чтобы прочитать документ.',true);return;}
 uploadController=new AbortController();lock(true);status('Читаем документ локально…');
 try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));uploadController.signal.throwIfAborted();const response=await fetch('/api/document-text',{method:'POST',signal:uploadController.signal,headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,data:btoa(binary)})});const data=await response.json();if(!response.ok)throw new Error(data.error);$('source').value=data.text;status(data.truncated?'Текст извлечён; документ сокращён до 24 000 символов. Проверьте его перед отправкой.':'Текст извлечён. Проверьте его; в ИИ-сервис он отправится только по кнопке «Доработать с ИИ».');}
 catch(e){status(e.name==='AbortError'?'Загрузка остановлена.':e.message,true);}finally{uploadController=null;lock(false);}
});
$('tool-form').addEventListener('submit',async event=>{
 event.preventDefault();if(controller||uploadController||!$('tool-form').reportValidity())return;
 if(location.protocol==='file:'){status('Откройте http://localhost:4173/tools.html для работы ИИ.',true);return;}
 const payload={tool,...Object.fromEntries(['subject','grade','topic','goal','source','kind','language','difficulty'].map(k=>[k,$(k).value.trim()])),count:Number($('count').value),duration:Number($('duration').value)};
 controller=new AbortController();lock(true);status(tool==='kmj'?'Методист дорабатывает ваш КМЖ…':'ИИ готовит '+({assessment:'работу и критерии',homework:'задания и ответы',cards:'карточки'})[tool]+'…');$('cancel').focus();
 try{const response=await fetch('/api/teaching-tool',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось создать материал.');show(data.result);status('Готово. Проверьте материал, отредактируйте и сохраните.');}
 catch(e){status(e.name==='AbortError'?'Генерация остановлена.':e.message||'Сервер недоступен.',true);}finally{controller=null;lock(false);}
});
$('cancel').addEventListener('click',()=>{controller?.abort();uploadController?.abort();});
function plainText(){if(!current)return '';const r=current.result;return r.title+'\n\n'+r.sections.map(s=>s.heading+'\n'+s.body).join('\n\n')+(r.cards.length?'\n\n'+r.cards.map((c,i)=>(i+1)+'. '+c.question+'\nОтвет: '+c.answer).join('\n\n'):'');}
$('save-resource').addEventListener('click',()=>{if(!current)return;current.updatedAt=Date.now();const next=[...history.filter(x=>x.id!==current.id),JSON.parse(JSON.stringify(current))];try{localStorage.setItem(storageKey,JSON.stringify(next));history=next;renderHistory();status('Материал сохранён в этом браузере.');}catch{status('Не удалось сохранить: хранилище браузера недоступно или заполнено. Скачайте TXT.',true);}});
$('copy-resource').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(plainText());status('Текст скопирован.');}catch{status('Копирование недоступно. Используйте «Скачать TXT».',true);}});
$('download-resource').addEventListener('click',()=>{if(!current)return;const url=URL.createObjectURL(new Blob([plainText()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=current.result.title.replace(/[<>:"/\\|?*]/g,'').slice(0,80)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('print-resource').addEventListener('click',()=>{const details=[...$('result-content').querySelectorAll('details')];const states=details.map(n=>n.open);details.forEach(n=>n.open=true);window.addEventListener('afterprint',()=>details.forEach((n,i)=>n.open=states[i]),{once:true});window.print();});
