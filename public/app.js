import { FORMS,WORLDS,LAWS,TALENTS,ARTIFACTS,GROUPS,STAT_NAMES,ACHIEVEMENTS } from './content.js';
import { emptyCampaign,draft,startLife,currentForm,simulate,parseSave,hash,ENDINGS,inclination } from './engine.js';
import { EN,GROUP_EN,STAT_EN,END_EN } from './english.js';
import { writeSave } from './persistence.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='between-lives.v1';
let campaign=emptyCampaign(),view='home',filter='all',audio=null,animation=0,toastTimer,setup=null,pendingImport=null,exportURL=null,storageProblem='',locale='zh-Hant',paused=false,speed=12000,timer=0;
let lastSaved=null,saving=false,historyQuery='',historyPage=0,dialogRevision=0;
try{locale=localStorage.getItem('between-lives.language')==='en'?'en':'zh-Hant';lastSaved=localStorage.getItem(KEY);if(lastSaved)campaign=parseSave(lastSaved);}
catch{storageProblem='unreadable';}
try{const prefs=JSON.parse(localStorage.getItem('between-lives.playback')||'{}');if([6000,12000,24000].includes(prefs.speed))speed=prefs.speed;paused=prefs.paused===true;}catch{}
if(!navigator.locks&&!storageProblem)storageProblem='session';
const T=(zh,en)=>locale==='en'?en:zh;
const byId=(list,id)=>list.find(x=>x.id===id);
const local=(item,prefix='')=>locale==='en'?{...item,...EN[prefix+item.id]}:item;
const named=(name,list,prefix='')=>{const item=list.find(x=>x.name===name);return item?local(item,prefix).name:name;};
const statName=k=>locale==='en'?STAT_EN[k]:STAT_NAMES[k];
const groupName=id=>locale==='en'?GROUP_EN[id]:GROUPS[id].name;
const padded=n=>String(n).padStart(2,'0');
const active=()=>campaign.current&&campaign.current.phase!=='ended';
const button=(action,label,cls='text-button',extra='')=>`<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const story=log=>locale==='en'&&log.en?{...log,...log.en}:log;
const artifact=id=>local(byId(ARTIFACTS,id));
const endingName=name=>locale==='en'?(END_EN[Object.keys(ENDINGS).find(key=>ENDINGS[key][0]===name)]?.[0]||name):name;
async function save(){
  if(saving)return false;
  if(storageProblem==='session')return true;
  if(['unreadable','conflict'].includes(storageProblem)){paused=true;return false;}
  saving=true;clearTimeout(timer);
  const value=JSON.stringify(campaign);
  try{await writeSave(localStorage,navigator.locks,KEY,lastSaved,value);lastSaved=value;storageProblem='';return true;}
  catch(error){storageProblem=error.message==='conflict'?'conflict':'failed';paused=true;return false;}
  finally{saving=false;}
}
function savePlayback(){try{localStorage.setItem('between-lives.playback',JSON.stringify({speed,paused}));}catch{}}
function storageWarning(){
  if(!storageProblem)return '';
  const messages={
    unreadable:T('原存檔無法讀取，已保留原始資料。請先到設定備份。','The original save could not be read and has been preserved. Back it up in settings.'),
    conflict:T('另一個分頁已更新存檔。已暫停，這裡的故事仍保留；可先匯出，再載入最新進度。','Another tab updated the save. Playback is paused and this story is kept here. Export it before loading the latest progress.'),
    failed:T('儲存失敗，已暫停。最新故事仍在此頁，請重試或匯出備份後再離開。','Saving failed and playback is paused. The latest story is still here. Retry or export a backup before leaving.'),
    session:T('此瀏覽器無法安全協調自動存檔，進度只保留在目前頁面。離開前請匯出備份。','This browser cannot coordinate automatic saves. Progress stays in this page only. Export a backup before leaving.'),
  };
  return `<aside class="storage-warning" role="status"><p>${messages[storageProblem]}</p>${button('export',T('匯出目前進度','Export this progress'),'outline-button')}${storageProblem==='conflict'?button('load-latest',T('載入最新進度','Load latest progress'),'outline-button'):storageProblem==='failed'?button('retry-save',T('重試儲存','Retry save'),'outline-button'):storageProblem==='unreadable'?button('settings',T('存檔設定','Save settings'),'outline-button'):''}</aside>`;
}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function schedule(){
  clearTimeout(timer);
  const suspended=paused||saving||['failed','conflict','unreadable'].includes(storageProblem)||document.hidden||$('#dialog').open||$('.journal-inline[open]');
  if($('.simulation-status'))$('.simulation-status').textContent=T(suspended?'已暫停閱讀':'自動模擬中',suspended?'Paused for reading':'Simulation running');
  if(view!=='game'||!active()||suspended)return;
  timer=setTimeout(async()=>{simulate(campaign);await save();render();},speed);
}
function render(focus=false){
  const focused=document.activeElement;
  const focusKey=focused?.id?`#${CSS.escape(focused.id)}`:focused?.dataset.action?`[data-action="${focused.dataset.action}"]${focused.dataset.id?`[data-id="${CSS.escape(focused.dataset.id)}"]`:''}${focused.dataset.index!==undefined?`[data-index="${focused.dataset.index}"]`:''}`:focused?.matches('summary')?`details.${focused.parentElement.classList[0]}${focused.parentElement.dataset.index!==undefined?`[data-index="${focused.parentElement.dataset.index}"]`:''} > summary`:null;
  const openDetails=[...document.querySelectorAll('#main details[open]')].map(x=>x.dataset.index!==undefined?`details[data-index="${x.dataset.index}"]`:`details.${x.classList[0]}`);
  cancelAnimationFrame(animation);
  if(view==='game'&&!campaign.current)view='home';
  document.documentElement.lang=locale;
  document.title=T('萬象之間 · 自動生命模擬','Between Lives · Automatic life simulator');
  $('.skip-link').textContent=T('跳至主要內容','Skip to content');
  $('.brand').setAttribute('aria-label',T('萬象之間，首頁','Between Lives, home'));
  $('.brand>span:last-child').innerHTML=T('萬象之間<small>BETWEEN LIVES</small>','BETWEEN LIVES<small>A LIFE SIMULATOR</small>');
  $('nav').setAttribute('aria-label',T('主要導覽','Main navigation'));
  $('#nav-home').textContent=T('開始','Start');
  $('#nav-archive').innerHTML=T('圖鑑','Atlas')+` <span id="archive-count">${campaign.forms.length}</span>`;
  $('#nav-history').textContent=T('歷代紀錄','Past lives');
  $('#language').value=locale;
  $('#language').setAttribute('aria-label',T('語言','Language'));
  $('#sound-button').setAttribute('aria-label',T(audio?'關閉環境音':'開啟環境音',audio?'Turn sound off':'Turn sound on'));
  $('[data-action="settings"]').setAttribute('aria-label',T('存檔與設定','Saves and settings'));
  for(const item of ['home','archive','history'])$('#nav-'+item).classList.toggle('active',view===item||(item==='home'&&view==='game'));
  $('#main').innerHTML=storageWarning()+(view==='home'?home():view==='game'?game():view==='archive'?archive()+discoveryAtlas():history());
  $('.site-footer').innerHTML=`<span><i class="status-dot"></i>${T('自動模擬 · 進度保存在此瀏覽器','Automatic simulation · Saved in this browser')}</span><div>${button('help',T('遊玩說明','How to play'))}<a href="https://github.com/Honguan/between-lives" target="_blank" rel="noopener noreferrer">${T('公開原始碼','Source code')} ↗</a><span>v2.1</span></div>`;
  if($('#universe'))drawUniverse($('#universe'));
  if(storageProblem)$('.site-footer > span').textContent=T('目前進度尚未儲存 · 請保留此頁並匯出','Current progress is not saved · Keep this page open and export');
  if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
  else{
    for(const selector of openDetails){const detail=$(selector);if(detail)detail.open=true;}
    if(focusKey)$(focusKey)?.focus({preventScroll:true});
  }
  schedule();
}
function home(){
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="little-line"></span> BETWEEN LIVES <span class="edition">${T('自動生命模擬','AUTOMATIC LIFE SIMULATOR')}</span></div><h1>${T('下一生，<br>你會<span class="serif-em">是什麼？</span>','What will<br>your next <span class="serif-em">life be?</span>')}</h1><p class="hero-intro">${T('選一個世界、一種形態，<br>看它自己走完一生。','Choose a world and a form.<br>Watch a life unfold on its own.')}</p><p class="hero-note">${T('天賦、行動、相遇與結局由系統決定。<br>可能成為別的物種，也可能走到另一個宇宙。','Traits, actions, encounters and endings emerge from the simulation.<br>A life may change its shape or cross into another world.')}</p><div class="hero-actions">${button(active()?'resume':'begin',T(active()?'繼續觀看 ↗':'選擇世界與形態 ↗',active()?'Continue watching ↗':'Choose a world and form ↗'),'primary-button')}${button('help',T('怎麼玩','How it works'),'subtle-button')}</div><div class="hero-footnote">${T('免登入 · 每世約 5 分鐘 · 可暫停閱讀','No sign-in · About 5 minutes per life · Pause to read')}</div></div><div class="universe-art"><div class="art-corner top-left">FIELD NOTES / ${String(campaign.total+1).padStart(4,'0')}</div><canvas id="universe" role="img" aria-label="${T('星塵與軌道組成的球體','An orb of stardust and orbits')}"></canvas><div class="art-caption"><span class="crosshair">＋</span><span>${T('可以是一頭鯨，<br>也可以是一個還沒被履行的承諾。','A whale, perhaps.<br>Or a promise still waiting to be kept.')}</span></div></div></section><section class="possibilities"><div class="section-line"><div><span class="eyebrow">POSSIBLE SELVES</span><h2>${T('從這裡開始','Some places to begin')}</h2></div><span>${FORMS.length} ${T('種形態','forms')} · ${WORLDS.length} ${T('個世界','worlds')} · ${Object.keys(ENDINGS).length} ${T('種結局','endings')}</span></div><div class="form-previews">${['animal-0','cosmic-0','matter-8','concept-8'].map((id,i)=>{const f=local(byId(FORMS,id));return `<button class="form-preview" data-action="try-form" data-id="${id}"><div class="preview-top"><span>${padded(i+1)} / ${groupName(f.group)}</span><span>↗</span></div><div class="specimen specimen-${f.group}" aria-hidden="true">${GROUPS[f.group].symbol}</div><h3>${esc(f.name)}</h3><p>${esc(f.description)}</p></button>`;}).join('')}</div></section><section class="home-bottom"><span class="orbit-symbol">◎</span><p>${T('上一世留下的遺物，會影響下一世的起點。','A relic from your last life shapes the start of the next.')}<br><span>${T('紀錄保留最近 120 世，圖鑑持續累積。','Keep the latest 120 life stories and a growing atlas.')}</span></p><div class="home-count"><strong>${padded(campaign.total)}</strong><span>${T('已完成的人生','completed lives')}</span></div>${button('history',T('閱讀紀錄 ↗','Read past lives ↗'))}</section>`;
}
function statBars(life){return Object.entries(life.stats).map(([k,v])=>`<div class="stat"><div><span><i class="stat-dot stat-${k}"></i>${statName(k)}</span><strong>${v}<small> / 100</small></strong></div><div class="stat-track" role="meter" aria-label="${statName(k)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><span class="stat-${k}" style="width:${v}%"></span></div></div>`).join('');}
function playback(){return `<div class="playback"><span class="simulation-status" role="status">${T(paused?'已暫停閱讀':'自動模擬中',paused?'Paused for reading':'Simulation running')}</span><div>${button('pause',T(paused?'繼續播放':'暫停閱讀',paused?'Resume':'Pause to read'),'outline-button',`aria-pressed="${paused}"`)}<label>${T('每章停留','Time per chapter')} <select id="speed">${[6000,12000,24000].map(n=>`<option value="${n}" ${speed===n?'selected':''}>${n/1000} ${T('秒','sec')}</option>`).join('')}</select></label></div><small>${T('播放速度只影響閱讀時間，不會改變經歷。','Playback speed changes reading time only, never the outcome.')}</small></div>`;}
function game(){
  const life=campaign.current;
  if(life.phase==='ended')return ending(life);
  const form=local(currentForm(life)),world=local(byId(WORLDS,life.worldId)),law=local(byId(LAWS,life.lawId),'law:');
  const log=life.phase==='result'?life.logs.at(-1):null,entry=log?story(log):null;
  return `<div class="game-topline"><span class="eyebrow">${T('第','LIFE')} ${life.number} ${T('世 · 自動模擬','· AUTOMATIC')}</span><span>${esc(form.name)} · ${esc(world.name)}</span></div>${playback()}<div class="game-layout"><aside class="identity-panel"><div class="identity-top"><span class="eyebrow">${T('目前形態','CURRENT FORM')}</span><span class="small-symbol">${GROUPS[form.group].symbol}</span></div><h1>${esc(form.name)}</h1><p class="identity-desc">${esc(form.description)}</p><div class="tags"><span class="tag">${groupName(form.group)}</span><span class="tag">${T('行動傾向：','Inclination: ')}${T({e:'求穩',w:'探索',b:'連結',c:'冒險'}[inclination(life)],{e:'cautious',w:'curious',b:'caring',c:'daring'}[inclination(life)])}</span><span class="tag">${life.shifts} ${T('次蛻變','transformations')}</span></div><div class="stat-list">${statBars(life)}</div><p class="stat-note">${T('存在歸零會結束這一世。感知偏向探索，共鳴偏向連結，偏離偏向突破規則。','A life ends at zero vitality. Awareness favors discovery, connection favors others, and deviation favors breaking rules.')}</p><div class="talent-list"><span class="eyebrow">${T('隨機天賦','RANDOM TRAITS')}</span>${life.talents.map(id=>{const t=local(byId(TALENTS,id),'talent:');return `<div>✧ ${t.name}<small>${t.description}</small></div>`;}).join('')}</div>${life.inherited?`<div class="inherited"><span class="eyebrow">${T('前世遺物','INHERITED RELIC')}</span><p>◇ ${artifact(life.inherited.artifact).name}</p></div>`:''}</aside><section class="story-panel" aria-label="${T('本世故事','This life’s story')}"><div class="chapter-line"><span class="chapter-number">${padded(life.turn)}</span><div><span class="eyebrow">${T('生命片段','CHAPTER')}</span><div class="chapter-track"><span style="width:${life.turn/life.limit*100}%"></span></div></div><span class="chapter-limit">/ ${life.limit}</span></div><article class="event-card resolved" aria-live="polite" aria-atomic="true">${entry?`<div class="event-kicker"><span>${T('已發生的經歷','WHAT HAPPENED')}</span></div><h2>${esc(entry.title)}</h2><p class="story-text">${esc(entry.body)}</p><div class="auto-action"><span>${T('角色的行動','THE CHARACTER’S ACTION')}</span><strong>${esc(entry.choice)}</strong></div><div class="result-block"><span class="result-caption">${T('結果','OUTCOME')}</span><p>${esc(entry.text)}</p>${entry.details.map(d=>`<p class="result-detail">✧ ${esc(d)}</p>`).join('')}<div class="deltas">${Object.entries(life.result?.delta||{}).filter(([,n])=>n).map(([k,n])=>`<span class="delta ${n<0?'negative':''}">${statName(k)} ${n>0?'+':''}${n}</span>`).join('')}</div></div>`:`<h2>${T('這一生正要開始','This life is about to begin')}</h2><p>${T('第一段經歷即將出現。','The first chapter will appear shortly.')}</p>`}</article>${life.logs.length?`<details class="journal-inline"><summary>${T('閱讀先前經歷（展開時暫停）','Read earlier chapters (pauses playback)')} · ${life.logs.length}</summary>${life.logs.slice().reverse().map(logHTML).join('')}</details>`:''}</section><aside class="world-panel"><div class="world-orbit" aria-hidden="true">◎</div><span class="eyebrow">${T('目前世界','CURRENT WORLD')}</span><h2>${world.name}</h2><p>${world.description}</p><div class="law-card"><span class="eyebrow">${T('宇宙法則','WORLD LAW')}</span><h3>${law.name}</h3><p>${law.description}</p></div><div class="world-memo"><p>${T('行動受天生傾向、當前能力與機率影響。事件可能留下後續影響。','Innate tendencies, current abilities and chance guide actions. Earlier acts can return as later encounters.')}</p><strong>${life.pending.length} ${T('個因果尚未回應','consequences pending')}</strong></div></aside></div>`;
}
function logHTML(log){const l=story(log);return `<div class="log-entry"><span>${padded(log.turn)}</span><div><h4>${esc(l.title)}</h4>${locale==='en'&&!log.en?'<small>Original-language record from an earlier version.</small>':''}<p>${esc(l.body)}</p><p class="log-choice">${T('行動：','Action: ')}${esc(l.choice)}</p><p>${esc(l.text)}</p>${l.details.map(d=>`<small>${esc(d)}</small>`).join('')}</div></div>`;}
function ending(life){
  const form=local(currentForm(life)),[title,text]=locale==='en'?END_EN[life.ending.key]:[life.ending.title,life.ending.text],a=artifact(life.ending.artifact);
  return `<section class="ending"><div class="eyebrow">${T('第','LIFE')} ${life.number} ${T('世 · 已完成','· COMPLETE')}</div><div class="ending-symbol">✳</div><p class="ending-pretitle">${esc(form.name)}</p><h1>${esc(title)}</h1><p class="ending-text">${esc(text)}</p><div class="ending-stats"><div><strong>${life.turn}</strong><span>${T('章經歷','chapters')}</span></div><div><strong>${life.shifts}</strong><span>${T('次蛻變','transformations')}</span></div><div><strong>${life.callbacks}</strong><span>${T('次因果回響','returning consequences')}</span></div></div><div class="memory-card"><span class="memory-icon">◇</span><div><span class="eyebrow">${T('留給下一世','FOR THE NEXT LIFE')}</span><h2>${a.name}</h2><p>${a.description}</p></div></div><div class="ending-actions">${button('begin',T('開始下一世 ↗','Start the next life ↗'),'primary-button')}${button('export-life',T('匯出這一生','Export this story'),'subtle-button')}</div><details class="ending-journal"><summary>${T('閱讀完整經歷','Read the complete story')} · ${life.logs.length}</summary>${life.logs.map(logHTML).join('')}</details></section>`;
}
function archive(){
  return `<section class="collection"><div class="collection-heading"><div><span class="eyebrow">ATLAS</span><h1>${T('形態圖鑑','Atlas of forms')}<span>${campaign.forms.length} / ${FORMS.length}</span></h1><p>${T('每種形態都能作為起點；亮起的卡片是你經歷過的形態。','Every form is available from the start. Highlighted cards mark forms you have experienced.')}</p></div></div><div class="filter-row">${[['all',T('全部','All')],...Object.keys(GROUPS).map(id=>[id,groupName(id)])].map(([id,name])=>button('filter',name,`filter-button ${filter===id?'selected':''}`,`data-id="${id}" aria-pressed="${filter===id}"`)).join('')}</div><div class="atlas-grid">${FORMS.filter(f=>filter==='all'||f.group===filter).map(raw=>{const f=local(raw);return `<button class="atlas-card ${campaign.forms.includes(f.id)?'discovered':''}" data-action="try-form" data-id="${f.id}"><div><span class="atlas-symbol">${GROUPS[f.group].symbol}</span><span class="discovery-label">${T(campaign.forms.includes(f.id)?'已經歷':'未經歷',campaign.forms.includes(f.id)?'Experienced':'Unexplored')}</span></div><h2>${esc(f.name)}</h2><p>${esc(f.description)}</p><small>${groupName(f.group)} ↗</small></button>`;}).join('')}</div><div class="section-line achievement-heading"><h2>${T('成就','Milestones')}</h2><span>${campaign.achievements.length} / ${ACHIEVEMENTS.length}</span></div><div class="achievement-grid">${ACHIEVEMENTS.map(raw=>{const a=local(raw,'achievement:');return `<div class="achievement ${campaign.achievements.includes(a.id)?'earned':''}"><span>✧</span><div><h3>${a.name}</h3><p>${a.description}</p></div></div>`;}).join('')}</div></section>`;
}
function discoveryAtlas(){
  return `<section class="collection discovery-atlas"><div class="section-line"><h2>${T('世界圖鑑','World atlas')}</h2><span>${campaign.worlds.length} / ${WORLDS.length}</span></div><div class="atlas-grid">${WORLDS.map(raw=>{const world=local(raw),seen=campaign.worlds.includes(raw.id);return `<article class="atlas-card ${seen?'discovered':''}"><span class="discovery-label">${T(seen?'已抵達':'未抵達',seen?'Visited':'Unvisited')}</span><h3>${esc(world.name)}</h3><p>${esc(world.description)}</p></article>`;}).join('')}</div><div class="section-line achievement-heading"><h2>${T('結局圖鑑','Ending atlas')}</h2><span>${campaign.endings.length} / ${Object.keys(ENDINGS).length}</span></div><div class="atlas-grid">${Object.entries(ENDINGS).map(([key,value],index)=>{const seen=campaign.endings.includes(key),[title,text]=locale==='en'?END_EN[key]:value;return `<article class="atlas-card ${seen?'discovered':''}"><span class="discovery-label">${padded(index+1)} · ${T(seen?'已達成':'尚未發現',seen?'Discovered':'Undiscovered')}</span><h3>${seen?esc(title):T('未讀的最後一頁','An unread final page')}</h3><p>${seen?esc(text):T('讓不同的生命走完旅程，收集新的結局。','Let different lives complete their journeys to discover new endings.')}</p></article>`;}).join('')}</div></section>`;
}
function history(){
  const query=historyQuery.trim().toLocaleLowerCase();
  const matches=campaign.history.map((item,index)=>({item,index})).filter(({item:h})=>[h.number,h.form,h.origin,h.world,h.ending,named(h.form,FORMS),named(h.origin,FORMS),named(h.world,WORLDS),endingName(h.ending)].join(' ').toLocaleLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(matches.length/12));historyPage=Math.min(historyPage,pages-1);
  return `<section class="collection"><div class="collection-heading"><div><span class="eyebrow">PAST LIVES</span><h1>${T('歷代紀錄','Past lives')}<span>${campaign.total}</span></h1><p>${T('保存最近 120 世完整故事；總世數與圖鑑持續累積。','The latest 120 stories are kept. Total lives and atlas discoveries continue accumulating.')}</p></div>${button(active()?'resume':'begin',T(active()?'繼續觀看':'開始一生',active()?'Continue watching':'Start a life'),'outline-button')}</div><form id="history-search-form" class="history-search"><label for="history-query">${T('搜尋形態、世界、結局或世數','Search form, world, ending or life number')}</label><div><input id="history-query" type="search" value="${esc(historyQuery)}"><button class="outline-button" type="submit">${T('搜尋','Search')}</button></div></form><p role="status">${matches.length} ${T('筆紀錄','stories')}</p>${matches.length?`<div class="history-list">${matches.slice(historyPage*12,(historyPage+1)*12).map(({item:h,index})=>`<details class="history-card" data-index="${index}"><summary><span class="history-number">${padded(h.number)}</span><div><span class="eyebrow">${esc(named(h.world,WORLDS))} · ${h.turns} ${T('章','chapters')}</span><h2>${esc(named(h.form,FORMS))}</h2><p>${esc(endingName(h.ending))}</p></div><div class="history-artifact">◇ ${artifact(h.artifact).name}</div><span>＋</span></summary><div class="history-details"></div></details>`).join('')}</div><div class="history-pagination">${button('history-prev',T('上一頁','Previous'),'outline-button',historyPage===0?'disabled':'')}<span>${historyPage+1} / ${pages}</span>${button('history-next',T('下一頁','Next'),'outline-button',historyPage===pages-1?'disabled':'')}</div>`:`<div class="empty-state"><span>◌</span><h2>${T(campaign.history.length?'沒有符合的紀錄':'還沒有完成的人生',campaign.history.length?'No matching stories':'No completed lives yet')}</h2><p>${T('一世結束後，故事與遺物會留在這裡。','When a life ends, its story and relic appear here.')}</p></div>`}</section>`;
}
function openDialog(title,body,wide=false){
  dialogRevision++;
  clearTimeout(timer);
  if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}
  const d=$('#dialog');d.classList.toggle('wide',wide);
  $('#dialog-content').innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${title}</h2>${button('close','×','close-button',`aria-label="${T('關閉','Close')}"`)}</div>${body}`;
  if(!d.open)d.showModal();
}
function begin(formId){
  if(active()){$('#dialog').close();view='game';render(true);return;}
  const seed=Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(36)).join('-'),offer=draft(seed);
  setup={seed,formId:byId(FORMS,formId)?formId:offer.formId,worldId:offer.worldId,auto:true};
  setupDialog();
}
function setupDialog(){
  const f=local(byId(FORMS,setup.formId)),w=local(byId(WORLDS,setup.worldId));
  openDialog(T('選擇這一生的起點','Choose this life’s beginning'),`<p class="dialog-intro">${T('你只需要選擇世界與物種／形態，再按開始。天賦與後續行動由系統決定。','Choose a world and a species or form, then start. Traits and every later action are automatic.')}</p><div class="setup-fields"><label>${T('世界','World')}<select id="world-select">${WORLDS.map(raw=>{const x=local(raw);return `<option value="${x.id}" ${setup.worldId===x.id?'selected':''}>${x.name}</option>`;}).join('')}</select></label><label>${T('物種／形態','Species / form')}<select id="form-select">${Object.keys(GROUPS).map(group=>`<optgroup label="${groupName(group)}">${FORMS.filter(x=>x.group===group).map(raw=>{const x=local(raw);return `<option value="${x.id}" ${setup.formId===x.id?'selected':''}>${x.name}</option>`;}).join('')}</optgroup>`).join('')}</select></label></div><div class="world-preview"><span>◎</span><div><strong>${w.name}</strong><p>${w.description}</p></div></div><div class="world-preview"><span>${GROUPS[f.group].symbol}</span><div><strong>${f.name}</strong><p>${f.description}</p></div></div>${campaign.memories.length?`<p class="inherit-preview">◇ ${T('繼承遺物：','Inherited relic: ')}${artifact(campaign.memories.at(-1).artifact).name}</p>`:''}${button('birth',T('開始這一生 ↗','Start this life ↗'),'primary-button birth-button')}`);
}
function help(){
  openDialog(T('怎麼玩','How to play'),`<div class="help-steps">${[
    [T('選世界與形態','Choose a world and form'),T('按開始後，角色會自己經歷一生。沒有天賦配點或事件選項。','After starting, the character lives automatically. There are no trait allocations or event choices.')],
    [T('看行動帶來什麼結果','Follow actions and their results'),T('每章依序顯示事件、角色採取的行動、結果與能力變化。行動受天生傾向、能力與機率影響；存在低時較傾向保全自己。','Each chapter shows the event, action, outcome and ability changes. Innate tendencies, abilities and chance guide actions; low vitality favors self-preservation.')],
    [T('隨時停下來閱讀','Take time to read'),T('可暫停、調整每章秒數，或展開先前經歷。離開遊玩頁、開啟設定、切換到背景時會暫停。這些操作不改變故事結果。','Pause, change the reading interval or open earlier chapters. Playback stops in other views, dialogs and background tabs. These controls do not change the story.')],
    [T('結束後，再開始一世','Begin again after the ending'),T('存在歸零或到達 24 章時結束，特定天賦延長至 29 章。蛻變、跨世界與改寫法則可能自行發生；最後留下遺物，增加下一世一項能力。','A life ends at zero vitality or chapter 24; a trait can extend it to 29. Transformations, world crossings and new laws may happen automatically. A relic boosts one ability in the next life.')],
  ].map(([title,text],i)=>`<div><span>${padded(i+1)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}</div><p>${T('繁體中文與 English 都包含介面、事件與結局。舊版紀錄保留原文。空白鍵可暫停或繼續。','Traditional Chinese and English include the interface, events and endings. Older records retain their original text. Space pauses or resumes.')}</p>${button('close',T('開始閱讀','Got it'),'primary-button birth-button')}`);
}
function settings(){
  openDialog(T('存檔與設定','Saves and settings'),`<p>${T('進度只存在目前瀏覽器。換裝置或清除網站資料前，請匯出備份。','Progress stays in this browser. Export a backup before changing devices or clearing site data.')}</p><div class="settings-info"><span>${campaign.total} ${T('世','lives')}</span><span>${campaign.forms.length} ${T('種已經歷形態','experienced forms')}</span></div><div class="settings-actions">${button('export',T('匯出完整存檔','Export save'),'outline-button')}${button('import',T('匯入存檔','Import save'),'outline-button')}</div>${storageProblem==='unreadable'?`<div class="storage-warning"><p>${T('舊存檔無法讀取。原始資料已保留，自動儲存暫停。','The old save could not be read. It is preserved; automatic saving is disabled.')}</p>${button('raw-backup',T('備份原始資料','Back up original data'),'outline-button')}${button('enable-save',T('改存目前進度','Save current progress instead'),'outline-button')}</div>`:''}<div class="settings-section"><h3>${T('內容與隱私','Content and privacy')}</h3><p>${T('故事來自手寫內容與程序組合，可持續輪迴；不是即時 AI 生成。遊戲沒有帳號、廣告、分析追蹤或外部字型。','Stories combine authored scenes and procedural variations. You can keep reincarnating. There is no live AI service, account, advertising, analytics or external font.')}</p><p>${T('聲音預設關閉；動畫遵循系統的減少動態效果設定。','Sound starts off. Animation respects your reduced-motion setting.')}</p></div><div class="settings-section danger-section"><h3>${T('清除紀錄','Clear progress')}</h3><p>${T('刪除此瀏覽器的全部紀錄與目前人生，無法復原。','Delete all lives, discoveries and current progress from this browser. This cannot be undone.')}</p>${button('reset-confirm',T('清除所有進度','Clear all progress'),'danger-button')}</div>`);
}
function download(name,text,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));
  openDialog(T('匯出內容','Export'),`<p>${T('下載檔案，或複製全文保存。存檔文字可直接貼回匯入視窗。','Download the file or copy its full text. Save text can be pasted into the import dialog.')}</p><div class="settings-actions export-actions"><a class="outline-button" href="${esc(url)}" download="${esc(name)}">${T('下載檔案','Download file')}</a>${button('copy-export',T('複製全文','Copy full text'),'outline-button')}</div><label>${T('完整內容','Full content')}<textarea id="export-data" readonly rows="7" spellcheck="false">${esc(text)}</textarea></label>`);
  exportURL=url;
}
function exportStory(item){
  const text=`${T('萬象之間 · 第','Between Lives · Life')} ${item.number}\n${named(item.form,FORMS)}\n${endingName(item.ending)}\n${named(item.world,WORLDS)}\n\n`+item.logs.map(raw=>{const l=story(raw);return `${l.turn} | ${l.title}\n${l.body}\n${l.choice}\n${l.text}\n${l.details.join('\n')}`;}).join('\n\n');
  download(`between-lives-${item.number}-${locale}.txt`,text,'text/plain;charset=utf-8');
}
function importError(error){return locale==='en'?'Invalid or incompatible save. Existing progress was not changed.':error.message;}
function reviewImport(text){
  try{pendingImport=parseSave(text);openDialog(T('取代目前進度？','Replace current progress?'),`<p>${T(`這份存檔有 ${pendingImport.total} 世紀錄。確認後會取代目前進度。可先返回設定匯出備份。`,`This save contains ${pendingImport.total} completed lives. Importing replaces current progress. You can return to settings to export a backup first.`)}</p><div class="dialog-actions">${button('settings',T('返回設定','Back to settings'),'outline-button')}${button('import-confirm',T('確認匯入','Confirm import'),'primary-button')}</div>`);}
  catch(error){pendingImport=null;notify(importError(error));}
}
async function toggleSound(){
  const control=$('#sound-button');if(control.disabled)return;control.disabled=true;
  try{
    if(audio){await audio.close();audio=null;}
    else{const Context=window.AudioContext||window.webkitAudioContext;audio=new Context();const gain=audio.createGain();gain.gain.value=.017;gain.connect(audio.destination);for(const [i,frequency] of [130.81,196,261.63].entries()){const osc=audio.createOscillator();osc.type='sine';osc.frequency.value=frequency;osc.detune.value=(i-1)*3;osc.connect(gain);osc.start();}await audio.resume();}
    $('#sound-button').setAttribute('aria-pressed',String(!!audio));render();
  }catch{if(audio)audio.close().catch(()=>{});audio=null;control.setAttribute('aria-pressed','false');notify(T('此瀏覽器無法播放環境音。','Sound is unavailable in this browser.'));}
  finally{control.disabled=false;}
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(saving&&['birth','import-confirm','reset','enable-save-confirm','load-latest','retry-save'].includes(action))return;
  if(storageProblem==='conflict'&&['import-confirm','reset','enable-save-confirm'].includes(action)){notify(T('請先關閉視窗，匯出需要保留的故事，再載入最新進度。','Close this dialog, export any story you want to keep, then load the latest progress.'));return;}
  if(['home','archive','history'].includes(action)){view=action;render(true);}
  else if(action==='resume'){view='game';render(true);}
  else if(action==='begin'||action==='try-form')begin(target.dataset.id);
  else if(action==='close')$('#dialog').close();
  else if(action==='help')help();
  else if(action==='settings')settings();
  else if(action==='sound')await toggleSound();
  else if(action==='filter'){filter=target.dataset.id;render();}
  else if(action==='history-prev'||action==='history-next'){historyPage+=action==='history-next'?1:-1;render(true);}
  else if(action==='pause'){paused=!paused;savePlayback();render();}
  else if(action==='birth'){if(active()||!setup)return;startLife(campaign,setup);simulate(campaign);paused=false;await save();savePlayback();$('#dialog').close();view='game';render(true);}
  else if(action==='export')download('between-lives-save.json',JSON.stringify(campaign,null,2));
  else if(action==='export-life')exportStory(campaign.history[0]);
  else if(action==='export-history')exportStory(campaign.history[Number(target.dataset.index)]);
  else if(action==='import')openDialog(T('匯入存檔','Import a save'),`<p>${T('選擇 JSON 檔案，或貼上完整存檔文字。','Choose a JSON file or paste the full save text.')}</p>${button('import-file',T('選擇存檔檔案','Choose save file'),'outline-button export-actions')}<label>${T('完整存檔文字','Full save text')}<textarea id="import-data" rows="7" spellcheck="false"></textarea></label>${button('import-text',T('檢查存檔','Validate save'),'primary-button birth-button')}`);
  else if(action==='import-file')$('#import-file').click();
  else if(action==='import-text')reviewImport($('#import-data').value);
  else if(action==='copy-export'){const field=$('#export-data');try{await navigator.clipboard.writeText(field.value);notify(T('全文已複製，請貼到文字檔保存。','Full text copied. Paste it into a file to keep it.'));}catch{if(field.isConnected){field.focus();field.select();notify(T('已選取全文，請使用系統複製功能。','Full text selected. Use your system’s copy command.'));}}}
  else if(action==='import-confirm'){if(!pendingImport||storageProblem==='conflict')return;campaign=pendingImport;pendingImport=null;storageProblem=navigator.locks?'':'session';await save();paused=true;savePlayback();$('#dialog').close();view=campaign.current?'game':'home';render(true);}
  else if(action==='raw-backup'){try{download('between-lives-original-save.json',localStorage.getItem(KEY)||'');}catch{notify(T('無法讀取原始存檔。','Cannot read the original save.'));}}
  else if(action==='enable-save')openDialog(T('覆寫原始資料？','Overwrite original data?'),`<p>${T('請先備份原始資料。確認後會用目前進度覆寫，無法復原。','Back up the original data first. This permanently replaces it with current progress.')}</p>${button('enable-save-confirm',T('確認覆寫','Confirm overwrite'),'danger-button')}`);
  else if(action==='enable-save-confirm'){storageProblem=navigator.locks?'':'session';await save();render();settings();}
  else if(action==='retry-save'){await save();render();}
  else if(action==='load-latest'){
    try{const raw=localStorage.getItem(KEY),latest=raw?parseSave(raw):emptyCampaign();campaign=latest;lastSaved=raw;storageProblem=navigator.locks?'':'session';paused=true;savePlayback();view=campaign.current?'game':'home';render(true);}
    catch{notify(T('最新存檔無法讀取；此頁進度仍保留。','The latest save could not be read. This page’s progress is preserved.'));}
  }
  else if(action==='reset-confirm')openDialog(T('確定清除全部進度？','Clear all progress?'),`<p>${T('包含尚未結束的人生，刪除後無法復原。請先匯出需要保留的紀錄。','This includes the unfinished life and cannot be undone. Export anything you want to keep first.')}</p><div class="dialog-actions">${button('settings',T('返回設定','Back to settings'),'outline-button')}${button('reset',T('確認刪除','Confirm deletion'),'danger-button')}</div>`);
  else if(action==='reset'){if(storageProblem==='conflict')return;campaign=emptyCampaign();storageProblem=navigator.locks?'':'session';await save();$('#dialog').close();view='home';render(true);}
});
document.addEventListener('change',event=>{
  if(event.target.id==='language'){locale=event.target.value==='en'?'en':'zh-Hant';try{localStorage.setItem('between-lives.language',locale);}catch{}render();}
  else if(['world-select','form-select'].includes(event.target.id)){const id=event.target.id;setup.worldId=$('#world-select').value;setup.formId=$('#form-select').value;setupDialog();$('#'+id).focus();}
  else if(event.target.id==='speed'){speed=Number(event.target.value);savePlayback();schedule();}
});
document.addEventListener('submit',event=>{
  if(event.target.id!=='history-search-form')return;
  event.preventDefault();historyQuery=$('#history-query').value;historyPage=0;render();$('#history-query').focus();
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const revision=dialogRevision;
  try{if(file.size>8_000_000)throw new Error('存檔過大，請使用 8 MB 以下的檔案。');const text=await file.text();if(revision===dialogRevision&&$('#dialog').open)reviewImport(text);}
  catch(error){notify(importError(error));}finally{event.target.value='';}
});
$('#dialog').addEventListener('close',()=>{dialogRevision++;if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}schedule();});
window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==null)return;
  try{if(localStorage.getItem(KEY)===lastSaved)return;}catch{}
  storageProblem='conflict';paused=true;clearTimeout(timer);render();
});
document.addEventListener('visibilitychange',schedule);
document.addEventListener('toggle',event=>{
  const detail=event.target;
  if(detail.matches?.('.journal-inline'))schedule();
  if(detail.matches?.('.history-card')&&detail.open){
    const body=detail.querySelector('.history-details'),index=Number(detail.dataset.index),h=campaign.history[index];
    if(!body.hasChildNodes()&&h)body.innerHTML=`<p>${T('起始形態：','Original form: ')}${esc(named(h.origin,FORMS))}</p>${h.logs.map(logHTML).join('')}${button('export-history',T('匯出故事','Export story'),'outline-button',`data-index="${index}"`)}`;
  }
},true);
document.addEventListener('keydown',event=>{
  if(event.code!=='Space'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||$('#dialog').open||/INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test(document.activeElement.tagName)||view!=='game'||!active())return;
  event.preventDefault();paused=!paused;savePlayback();render();
});
$('.brand').addEventListener('click',event=>{event.preventDefault();view='home';render(true);});
render();
if(storageProblem==='unreadable')notify(T('原存檔無法載入，已保留原始資料。請到設定備份。','The old save could not load. Original data is preserved. Back it up in settings.'));

function drawUniverse(canvas){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const W=760,H=650,dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;ctx.scale(dpr,dpr);
  const stars=Array.from({length:190},(_,i)=>({x:hash(`star-x-${i}`)%W,y:hash(`star-y-${i}`)%H,r:(hash(`star-r-${i}`)%9)/10+.2}));
  let frame=0;
  function paint(time){
    if(document.hidden){animation=requestAnimationFrame(paint);return;}
    if(!reduced.matches&&time-frame<40){animation=requestAnimationFrame(paint);return;}frame=time;
    const t=reduced.matches?0:time*0.00006,cx=390,cy=307,r=174;
    ctx.clearRect(0,0,W,H);
    for(const s of stars){ctx.fillStyle=`rgba(232,220,198,${s.r*.35})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}
    const glow=ctx.createRadialGradient(cx,cy,50,cx,cy,295);glow.addColorStop(0,'rgba(180,125,82,0.11)');glow.addColorStop(.55,'rgba(116,147,139,0.06)');glow.addColorStop(1,'rgba(16,24,25,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.translate(cx,cy);ctx.rotate(-.43);ctx.strokeStyle='rgba(204,172,134,0.30)';ctx.lineWidth=.7;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(0,0,276+i*4,78+i*3,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
    for(let lat=-85;lat<=85;lat+=3){
      const phi=lat*Math.PI/180,y=Math.sin(phi)*r,rr=Math.cos(phi)*r;
      for(let lon=0;lon<360;lon+=3){
        const theta=lon*Math.PI/180+t,z=Math.cos(theta)*rr,x=Math.sin(theta)*rr;
        if(z<0)continue;
        const wave=Math.sin(lon*.12+lat*.1+t*3)*2.5;
        const xx=cx+x+Math.sin(phi*3)*wave,yy=cy+y+Math.sin(theta*5+phi*2)*3;
        const light=(z/r)*.64+.12;
        ctx.fillStyle=x<-25?`rgba(230,171,117,${light})`:`rgba(153,185,169,${light*.85})`;
        ctx.beginPath();ctx.arc(xx,yy,Math.max(.4,(z/r)*.72),0,Math.PI*2);ctx.fill();
      }
    }
    ctx.strokeStyle='rgba(223,202,172,.15)';ctx.lineWidth=.6;ctx.beginPath();ctx.arc(cx,cy,r+10,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([2,7]);ctx.beginPath();ctx.arc(cx,cy,r+56,-2,.95);ctx.stroke();ctx.setLineDash([]);
    for(const [angle,rad,size]of [[t+3,244,5],[-t+.5,286,3],[t*2-1,203,2]]){const x=cx+Math.cos(angle)*rad,y=cy+Math.sin(angle)*rad*.7;ctx.fillStyle='#d2b28b';ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(210,178,139,.25)';ctx.beginPath();ctx.arc(x,y,size+5,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='rgba(219,216,199,.25)';ctx.beginPath();ctx.moveTo(72,cy);ctx.lineTo(145,cy);ctx.moveTo(cx,82);ctx.lineTo(cx,103);ctx.moveTo(640,440);ctx.lineTo(690,463);ctx.lineTo(714,463);ctx.stroke();
    ctx.font='10px monospace';ctx.fillStyle='rgba(204,206,193,.55)';ctx.fillText('POTENTIAL / ∞',68,cy-12);ctx.fillText('YOU ARE HERE',585,484);
    if(!reduced.matches)animation=requestAnimationFrame(paint);
  }
  animation=requestAnimationFrame(paint);
}
