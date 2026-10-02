import { FORMS,WORLDS,LAWS,TALENTS,ARTIFACTS,GROUPS,STAT_NAMES,ACHIEVEMENTS } from './content.js';
import { emptyCampaign,draft,startLife,currentForm,currentEvent,choose,advance,finish,parseSave,hash } from './engine.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='between-lives.v1';
let campaign=emptyCampaign(),view='home',filter='all',audio=null,animation=0,toastTimer,setup=null,pendingImport=null;
let storageProblem='',exportURL=null;
try { const saved=localStorage.getItem(KEY); if(saved)campaign=parseSave(saved); }
catch(error){storageProblem=`原存檔未被覆寫：${error.message}`;}
let savingAllowed=!storageProblem;
function save(){
  if(!savingAllowed){notify('自動存檔暫停，請先在設定中匯出或備份原存檔。');return;}
  try{localStorage.setItem(KEY,JSON.stringify(campaign));}
  catch{notify('瀏覽器無法儲存進度，請在設定中匯出存檔。');}
}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
const byId=(list,id)=>list.find(x=>x.id===id);
const padded=n=>String(n).padStart(2,'0');
const active=()=>campaign.current&&campaign.current.phase!=='ended';
const button=(action,label,className='text-button',extra='')=>`<button class="${className}" data-action="${action}" ${extra}>${label}</button>`;
const tag=text=>`<span class="tag">${esc(text)}</span>`;
const artifactName=id=>byId(ARTIFACTS,id).name;
const deltaHTML=delta=>Object.entries(delta).filter(([,n])=>n).map(([k,n])=>`<span class="delta ${n<0?'negative':''}">${STAT_NAMES[k]} ${n>0?'+':''}${n}</span>`).join('');
function render(focus=false){
  cancelAnimationFrame(animation);
  $('#archive-count').textContent=padded(campaign.forms.length);
  for(const item of ['home','archive','history'])$('#nav-'+item).classList.toggle('active',view===item||(item==='home'&&view==='game'));
  if(view==='game'&&!campaign.current)view='home';
  $('#main').innerHTML=view==='home'?home():view==='game'?game():view==='archive'?archive():history();
  if($('#universe'))drawUniverse($('#universe'));
  if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function home(){
  const examples=['animal-0','cosmic-0','matter-1','concept-0'];
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="little-line"></span> A LIFE WITHOUT EDGES <span class="edition">存在實驗 001</span></div>
    <h1>下一生，<br>不必<span class="serif-em">是人。</span></h1><p class="hero-intro">也許是一頭聽見星光的鯨，<br>一顆不再公轉的行星，<br>或是，一句始終沒有說出口的話。</p>
    <p class="hero-note">成為萬物。經歷不可能。<br class="mobile-only">在一次次選擇裡，遇見意料之外的自己。</p>
    <div class="hero-actions">${button(active()?'resume':'begin',active()?'繼續這一世 <span>↗</span>':'開啟一段存在 <span>↗</span>','primary-button')}${button('help','如何遊玩 <span>↗</span>','subtle-button')}</div>
    <div class="hero-footnote"><span class="tiny-orbit">◌</span> 無須登入 <b>·</b> 每世約 5–10 分鐘 <b>·</b> 進度自動保存在此裝置</div></div>
    <div class="universe-art"><div class="art-corner top-left">FIELD NOTES / 無限的切片</div><div class="art-corner top-right">${String(campaign.total+1).padStart(4,'0')}</div><canvas id="universe" aria-label="由星塵與軌道構成、緩慢旋轉的可能性之球" role="img"></canvas><div class="art-caption"><span class="crosshair">＋</span><span>你還沒有形狀。<br><strong>所以，你可以是任何事物。</strong></span></div><div class="art-axis">01 — ∞</div></div>
  </section>
  <section class="possibilities"><div class="section-line"><div><span class="eyebrow">POSSIBLE SELVES</span><h2>萬千存在，沒有標準人生。</h2></div><span class="section-aside">48 種形態 · 12 個世界 · 12 條宇宙法則</span></div>
    <div class="form-previews">${examples.map((id,i)=>{const f=byId(FORMS,id),g=GROUPS[f.group];return `<button class="form-preview" data-action="try-form" data-id="${id}"><div class="preview-top"><span>${padded(i+1)} / ${g.name}</span><span class="preview-arrow">↗</span></div><div class="specimen specimen-${f.group}" aria-hidden="true">${g.symbol}</div><h3>${f.name}</h3><p>${f.description}</p></button>`;}).join('')}</div>
  </section>
  <section class="home-bottom"><span class="orbit-symbol">◎</span><p>有些相遇，不會隨一生結束。<br><span>留下回聲，帶著前世的微光，再出發。</span></p><div class="home-count"><strong>${padded(campaign.total)}</strong><span>已走過的生命</span></div>${button('history','翻開輪迴手記 ↗')}</section>`;
}
function statBars(life){return Object.entries(life.stats).map(([k,v])=>`<div class="stat"><div><span><i class="stat-dot stat-${k}"></i>${STAT_NAMES[k]}</span><strong>${v}<small> / 100</small></strong></div><div class="stat-track" role="meter" aria-label="${STAT_NAMES[k]}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><span class="stat-${k}" style="width:${v}%"></span></div></div>`).join('');}
function game(){
  const life=campaign.current;
  if(life.phase==='ended')return ending(life);
  const form=currentForm(life),group=GROUPS[form.group],world=byId(WORLDS,life.worldId),law=byId(LAWS,life.lawId),event=life.phase==='result'?life.logs.at(-1):currentEvent(life);
  return `<div class="game-topline"><span class="eyebrow">LIFE ${String(life.number).padStart(4,'0')} / ${life.mode==='drift'?'漫遊模式':'命運模式'}</span><div>${button('share','分享這個世界 ↗')}${button('end-life','讓這一世落幕','text-button muted')}</div></div>
  <div class="game-layout"><aside class="identity-panel"><div class="identity-top"><span class="eyebrow">此刻，你是</span><span class="small-symbol">${group.symbol}</span></div><h1>${esc(form.name)}</h1><p class="identity-desc">${esc(form.description)}</p><div class="tags">${tag(group.name)}${tag(`${life.shifts} 次蛻變`)}</div><div class="stat-list">${statBars(life)}</div><p class="stat-note">存在歸零，這一世將化為回聲。<br>每次選擇消耗 ${life.mode==='drift'?2:4} 點存在。</p><div class="talent-list"><span class="eyebrow">與生俱來</span>${life.talents.map(id=>`<div title="${byId(TALENTS,id).description}"><span>✧</span>${byId(TALENTS,id).name}<small>${byId(TALENTS,id).description}</small></div>`).join('')||'<p>沒有預設的天賦，也能走出自己的路。</p>'}</div>${life.inherited?`<div class="inherited"><span class="eyebrow">前世的微光</span><p>◇ ${artifactName(life.inherited.artifact)}</p><small>來自「${esc(life.inherited.form)}」的一生</small></div>`:''}</aside>
  <section class="story-panel" aria-label="當前故事"><div class="chapter-line"><span class="chapter-number">${padded(life.turn)}</span><div><span class="eyebrow">CHAPTER / ${life.turn<7?'初醒':life.turn<14?'在世界裡留下痕跡':life.turn<21?'形狀之外':'走向回聲'}</span><div class="chapter-track"><span style="width:${life.turn/life.limit*100}%"></span></div></div><span class="chapter-limit">/ ${life.limit}</span></div>
    <article class="event-card ${life.phase==='result'?'resolved':''}"><div class="event-kicker"><span>${life.eventId.startsWith('chain-')?'↺ 因果回響':life.eventId==='crossing'?'◇ 邊界事件':life.eventId==='rewrite'?'✳ 宇宙奇點':'◌ 存在片段'}</span><span>${esc(world.place)}</span></div><h2>${esc(event.title)}</h2><p class="story-text">${esc(event.body)}</p>
    ${life.phase==='result'?`<div class="result-block" aria-live="polite"><span class="result-caption">${life.result.success?'你讓故事往這裡走了。':'事情走向了另一條路。'}</span><p>${esc(life.result.text)}</p>${life.result.details.map(d=>`<p class="result-detail">✧ ${esc(d)}</p>`).join('')}<div class="deltas">${deltaHTML(life.result.delta)}</div></div>${button('next',life.stats.e<=0||life.turn>=life.limit?'走向這一世的回聲 <span>↗</span>':'讓時間繼續 <span>→</span>','primary-button next-button')}`:
    `<div class="choices" aria-label="你的選擇">${event.choices.map((c,i)=>`<button class="choice" data-action="choose" data-index="${i}"><span class="choice-number">${padded(i+1)}</span><span class="choice-body"><strong>${esc(c.label)}</strong><small>${c.difficulty?`${STAT_NAMES[c.stat]}考驗 · ${c.chance}% 成功機率`:'安然行動 · 必定成功'}<span class="choice-effects">${Object.entries(c.effects).map(([k,n])=>`${STAT_NAMES[k]} ${n>0?'+':''}${n}`).join(' / ')}</span></small></span><span class="choice-arrow">↗</span></button>`).join('')}</div><p class="choice-hint">能力變化為成功時的基礎值，另計流逝與法則。<span>鍵盤 1 / 2 / 3 選擇</span></p>`}</article>
    ${life.logs.length?`<details class="journal-inline"><summary>這一世的足跡 <span>${life.logs.length} 個片段 ＋</span></summary>${life.logs.slice().reverse().map(logHTML).join('')}</details>`:''}</section>
  <aside class="world-panel"><div class="world-orbit" aria-hidden="true">◎</div><span class="eyebrow">你所在的宇宙</span><h2>${world.name}</h2><p>${world.description}</p><div class="law-card"><span class="eyebrow">此地法則 / ${law.tag}</span><h3>${law.name}</h3><p>${law.description}</p></div><div class="world-memo"><span>世界不只擲骰子。</span><p>你的能力會改變機率，<br>你的選擇會留下因果。</p>${life.pending.length?`<div class="pending-dots">${'◦ '.repeat(life.pending.length)}<small>${life.pending.length} 個因果正在醞釀</small></div>`:''}</div><div class="seed-caption">WORLD SEED <button data-action="share" title="分享世界種子">${esc(life.seed)} ↗</button></div></aside></div>`;
}
function logHTML(log){return `<div class="log-entry"><span>${padded(log.turn)}</span><div><h4>${esc(log.title)}</h4><p class="log-choice">${esc(log.choice)}</p><p>${esc(log.text)}</p>${log.details.map(d=>`<small>${esc(d)}</small>`).join('')}</div></div>`;}
function ending(life){
  const form=currentForm(life),e=life.ending,a=byId(ARTIFACTS,e.artifact);
  return `<section class="ending"><div class="eyebrow">EVERY ENDING IS AN OPENING / 第 ${life.number} 世</div><div class="ending-symbol">✳</div><p class="ending-pretitle">${esc(form.name)}的這一生，</p><h1>${esc(e.title)}</h1><p class="ending-text">${esc(e.text)}</p><div class="ending-stats"><div><strong>${life.turn}</strong><span>章生命片段</span></div><div><strong>${life.shifts}</strong><span>次形態蛻變</span></div><div><strong>${life.callbacks}</strong><span>次因果回響</span></div></div><div class="memory-card"><span class="memory-icon">◇</span><div><span class="eyebrow">帶往下一世的微光</span><h2>${a.name}</h2><p>${a.description}</p></div></div><div class="ending-actions">${button('begin','帶著回聲，再生一次 <span>↗</span>','primary-button')}${button('export-life','匯出這一生的故事 ↓','subtle-button')}</div><p class="muted">死亡只是形狀的結束。你留下的事物，還會繼續。</p><details class="ending-journal"><summary>翻閱這一生的 ${life.logs.length} 個選擇</summary>${life.logs.map(logHTML).join('')}</details></section>`;
}
function archive(){
  const displayed=FORMS.filter(f=>filter==='all'||f.group===filter);
  return `<section class="collection"><div class="collection-heading"><div><span class="eyebrow">ATLAS OF EXISTENCE</span><h1>萬象圖鑑<span>已相遇 ${campaign.forms.length} / 48</span></h1><p>你不需要收集所有人生。每一個相遇，都值得被記得。</p></div><span class="large-asterisk">✳</span></div><div class="filter-row" aria-label="篩選形態">${[['all','全部'],...Object.entries(GROUPS).map(([id,g])=>[id,g.name])].map(([id,name])=>button('filter',name,`filter-button ${filter===id?'selected':''}`,`data-id="${id}" aria-pressed="${filter===id}"`)).join('')}</div><div class="atlas-grid">${displayed.map(f=>`<button class="atlas-card ${campaign.forms.includes(f.id)?'discovered':''}" data-action="form-info" data-id="${f.id}"><div><span class="atlas-symbol">${GROUPS[f.group].symbol}</span><span class="discovery-label">${campaign.forms.includes(f.id)?'已經歷':'未經歷'}</span></div><h2>${f.name}</h2><p>${f.description}</p><small>${GROUPS[f.group].name} <span>探索此形態 ↗</span></small></button>`).join('')}</div><div class="section-line achievement-heading"><div><span class="eyebrow">SMALL IMPOSSIBILITIES</span><h2>你留下的不可能</h2></div><span>${campaign.achievements.length} / ${ACHIEVEMENTS.length}</span></div><div class="achievement-grid">${ACHIEVEMENTS.map(a=>`<div class="achievement ${campaign.achievements.includes(a.id)?'earned':''}"><span>${campaign.achievements.includes(a.id)?'✧':'◌'}</span><div><h3>${a.name}</h3><p>${a.description}</p></div></div>`).join('')}</div></section>`;
}
function history(){
  return `<section class="collection"><div class="collection-heading"><div><span class="eyebrow">THE THINGS THAT REMAIN</span><h1>輪迴手記<span>${campaign.total} 段存在</span></h1><p>曾經成為的事物，都在這裡留下了一點回聲。</p></div>${button('begin',active()?'回到這一世 ↗':'再開啟一生 ↗','outline-button')}</div>${!campaign.history.length?`<div class="empty-state"><span>◌</span><h2>故事尚未寫完。</h2><p>完成第一世後，你的經歷與遺物會留在這裡。</p>${button(active()?'resume':'begin',active()?'繼續這一世 ↗':'開始第一段存在 ↗','primary-button')}</div>`:`<div class="history-list">${campaign.history.map((h,i)=>`<details class="history-card"><summary><span class="history-number">${String(h.number).padStart(3,'0')}</span><div><span class="eyebrow">${esc(h.world)} / ${h.turns} 章</span><h2>${esc(h.form)}</h2><p>${esc(h.ending)}</p></div><div class="history-artifact">◇ ${artifactName(h.artifact)}</div><span>＋</span></summary><div class="history-details"><p>最初形態：${esc(h.origin)} · 世界種子：${esc(h.seed)}</p>${h.logs.map(logHTML).join('')}${button('export-history','匯出這一生 ↓','outline-button',`data-index="${i}"`)}</div></details>`).join('')}</div><p class="muted retention">保存最近 120 世的完整手記；總輪迴數與圖鑑持續累積。可以匯出存檔永久保留。</p>`}</section>`;
}
function openDialog(title,body,wide=false){
  if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}
  const dialog=$('#dialog');dialog.classList.toggle('wide',wide);
  $('#dialog-content').innerHTML=`<div class="dialog-header"><h2 id="dialog-title">${title}</h2>${button('close','×','close-button','aria-label="關閉視窗"')}</div>${body}`;
  if(!dialog.open)dialog.showModal();
}
function freshSeed(){return Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(36)).join('-');}
function begin(formId){
  if(active()){$('#dialog').close();view='game';render(true);return;}
  const params=new URLSearchParams(location.search);
  const seed=params.get('seed')?.slice(0,80)||freshSeed();
  const offer=draft(seed);
  setup={seed,formId:formId||params.get('form')||offer.formId,customName:params.get('name')?.slice(0,24)||'',talents:[],mode:params.get('mode')==='drift'?'drift':'classic',offer};
  if(!byId(FORMS,setup.formId))setup.formId=offer.formId;
  const requested=(params.get('talents')||'').split(',').filter(id=>offer.talents.includes(id)).slice(0,2);
  setup.talents=requested.length?requested:offer.talents.slice(0,2);
  setupDialog();
}
function setupDialog(){
  const world=byId(WORLDS,setup.offer.worldId),law=byId(LAWS,setup.offer.lawId);
  openDialog('在誕生之前',`<p class="dialog-intro">宇宙提供可能性。你決定從哪裡開始。</p><div class="setup-fields"><label>你的初始形態<select id="form-select">${Object.entries(GROUPS).map(([key,g])=>`<optgroup label="${g.name}">${FORMS.filter(f=>f.group===key).map(f=>`<option value="${f.id}" ${setup.formId===f.id?'selected':''}>${f.name}</option>`).join('')}</optgroup>`).join('')}</select></label><label>或為它取一個全新名字 <small>選填</small><input id="custom-name" maxlength="24" value="${esc(setup.customName)}" placeholder="例如：星期三的影子"></label></div><p class="field-hint">自訂名字沿用所選形態的類別與事件，任你的想像替它長出輪廓。</p><div class="seed-field"><label>世界種子<input id="seed-input" maxlength="80" value="${esc(setup.seed)}" spellcheck="false"></label>${button('reroll','↻','shuffle-button','aria-label="重新抽取世界與天賦"')}</div><div class="world-preview"><span>◌</span><div><strong>${world.name}</strong><p>${world.description}</p><small>此地法則：${law.name}</small></div></div><div class="talent-heading"><h3>帶上兩份天賦</h3><span id="talent-selected-count">${setup.talents.length} / 2</span></div><div class="talent-draft">${setup.offer.talents.map(id=>{const t=byId(TALENTS,id);return `<button class="talent-option ${setup.talents.includes(id)?'selected':''}" data-action="talent" data-id="${id}" aria-pressed="${setup.talents.includes(id)}"><span>✧</span><strong>${t.name}</strong><small>${t.description}</small><i>${setup.talents.includes(id)?'✓':'+'}</i></button>`;}).join('')}</div><div class="mode-row"><label><input type="radio" name="mode" value="classic" ${setup.mode==='classic'?'checked':''}><span><strong>命運</strong><small>有限的存在，真實的取捨</small></span></label><label><input type="radio" name="mode" value="drift" ${setup.mode==='drift'?'checked':''}><span><strong>漫遊</strong><small>較少消耗，更自在地探索</small></span></label></div>${campaign.memories.length?`<p class="inherit-preview">◇ 前世遺物：${artifactName(campaign.memories.at(-1).artifact)}，將陪你一起誕生。</p>`:''}${button('birth','我準備好成為另一種可能 <span>↗</span>','primary-button birth-button')}`,true);
}
function readSetup(){
  setup.formId=$('#form-select').value;setup.customName=$('#custom-name').value.trim();setup.mode=$('input[name="mode"]:checked').value;
}
function settings(){
  openDialog('存檔與設定',`<p class="dialog-intro">進度保存在此瀏覽器。換裝置前，請先匯出存檔。</p><div class="settings-info"><span>已走過 ${campaign.total} 世</span><span>已發現 ${campaign.forms.length} 種形態</span></div><div class="settings-actions">${button('export','匯出完整存檔 ↓','outline-button')}${button('import','匯入存檔 ↑','outline-button')}</div>${storageProblem?`<div class="storage-warning"><p>${esc(storageProblem)}</p>${button('raw-backup','下載原始存檔','outline-button')}${button('enable-save','允許儲存目前進度','outline-button')}</div>`:''}<div class="settings-section"><h3>關於這個宇宙</h3><p>以手寫故事、可重現的程序生成與因果系統交織出不同人生。沒有即時 AI、帳號、廣告或分析追蹤。你寫下的名稱與選擇只存放在自己的裝置。</p><p>聲音預設關閉；動畫會尊重系統的「減少動態效果」偏好。</p></div><div class="settings-section danger-section"><h3>重新開始</h3><p>清除這個瀏覽器裡的所有輪迴、圖鑑與當前人生。</p>${button('reset-confirm','清除本機所有進度','danger-button')}</div>`);
}
function help(){openDialog('這場存在實驗，怎麼玩？',`<div class="help-steps"><div><span>01</span><div><h3>選一個自己，帶上兩份天賦</h3><p>可以是動物、生命、物件、天體、數位意識或非實體。世界種子決定起點與天賦候選。</p></div></div><div><span>02</span><div><h3>讓你的選擇改變故事</h3><p>感知幫助理解，共鳴連結他者，偏離突破常理。冒險可能失敗；安然行動一定成功。存在是這一世的力量，每次行動都會流逝。</p></div></div><div><span>03</span><div><h3>記得，宇宙也有記憶</h3><p>你埋下的因果可能在 3–5 章後回來。第 7、21 章可以嘗試蛻變或跨越世界；第 14 章有機會改寫法則。每世通常 24 章，部分天賦會延長。</p></div></div><div><span>04</span><div><h3>帶著回聲，再活一次</h3><p>存在歸零或走到生命終點，就會留下結局與遺物。最近一世的遺物為下一世增加一項能力。同種子重現世界與候選天賦，前世遺物仍依各自存檔。</p></div></div></div><div class="help-tip">鍵盤 1 / 2 / 3 作出選擇，Enter 進入下一章。<br>沒有唯一的最佳結局，也不需要活成誰期待的樣子。</div>${button('close','知道了，去經歷吧 ↗','primary-button birth-button')}`);}
function download(name,text,type='application/json'){
  const url=URL.createObjectURL(new Blob([text],{type}));
  openDialog('帶走這段旅程',`<p>下載檔案，或複製完整內容自行保存。若瀏覽器限制下載，複製的存檔也能在匯入時直接貼上。</p><div class="settings-actions export-actions"><a class="outline-button" href="${esc(url)}" download="${esc(name)}">下載檔案 ↓</a>${button('copy-export','複製完整內容','outline-button')}</div><label>完整內容<textarea id="export-data" readonly rows="7" spellcheck="false">${esc(text)}</textarea></label>`);
  exportURL=url;
}
function exportStory(item){
  const text=`萬象之間 · 第 ${item.number} 世\n${item.form}\n${item.ending}\n世界：${item.world}\n種子：${item.seed}\n\n`+item.logs.map(l=>`第 ${l.turn} 章｜${l.title}\n${l.body}\n選擇：${l.choice}\n${l.text}\n${l.details.join('\n')}`).join('\n\n');
  download(`between-lives-${item.number}.txt`,text,'text/plain;charset=utf-8');
}
async function share(){
  const life=campaign.current;if(!life)return;
  const url=new URL(location.href);url.search='';url.hash='';
  for(const [key,value]of Object.entries({seed:life.seed,form:life.originFormId,talents:life.talents.join(','),mode:life.mode}))url.searchParams.set(key,value);
  try{await navigator.clipboard.writeText(url.href);notify('世界邀請已複製。分享同一個起點，走出不同的故事。');}
  catch{openDialog('分享這個世界',`<p>複製連結，邀請別人從同一顆世界種子出發。</p><label>分享連結<input readonly value="${esc(url.href)}" id="share-url"></label>`);$('#share-url').select();}
}
async function toggleSound(){
  try{
    if(audio){await audio.close();audio=null;}
    else{const Context=window.AudioContext||window.webkitAudioContext;audio=new Context();const gain=audio.createGain();gain.gain.value=0.017;gain.connect(audio.destination);for(const [i,frequency]of [130.81,196,261.63].entries()){const osc=audio.createOscillator();osc.type='sine';osc.frequency.value=frequency;osc.detune.value=(i-1)*3;osc.connect(gain);osc.start();}await audio.resume();}
    $('#sound-button').setAttribute('aria-pressed',String(!!audio));$('#sound-button').setAttribute('aria-label',audio?'關閉環境音':'開啟環境音');notify(audio?'環境音已開啟':'環境音已關閉');
  }catch{if(audio)audio.close().catch(()=>{});audio=null;notify('此瀏覽器暫時無法播放環境音。');}
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(['home','archive','history'].includes(action)){view=action;render(true);}
  else if(action==='resume'){view='game';render(true);}
  else if(action==='begin'||action==='try-form')begin(target.dataset.id);
  else if(action==='close')$('#dialog').close();
  else if(action==='help')help();
  else if(action==='settings')settings();
  else if(action==='sound')await toggleSound();
  else if(action==='share')await share();
  else if(action==='filter'){filter=target.dataset.id;render();}
  else if(action==='form-info'){
    const f=byId(FORMS,target.dataset.id);openDialog(f.name,`<div class="form-detail-symbol">${GROUPS[f.group].symbol}</div><p>${f.description}</p><p class="muted">${GROUPS[f.group].name} · 每次誕生，都可能遇見不同的世界與法則。</p>${button('try-form',active()?'回到當前人生 ↗':'以這個形態開啟一生 ↗','primary-button birth-button',`data-id="${f.id}"`)}`);
  }
  else if(action==='talent'){
    readSetup();const id=target.dataset.id;
    if(setup.talents.includes(id))setup.talents=setup.talents.filter(t=>t!==id);
    else if(setup.talents.length<2)setup.talents.push(id);
    else{notify('最多帶上兩份天賦，先取消其中一份再選擇。');return;}
    for(const element of document.querySelectorAll('.talent-option')){const selected=setup.talents.includes(element.dataset.id);element.classList.toggle('selected',selected);element.setAttribute('aria-pressed',String(selected));element.querySelector('i').textContent=selected?'✓':'+';}
    $('#talent-selected-count').textContent=`${setup.talents.length} / 2`;
  }
  else if(action==='reroll'){
    readSetup();setup.seed=freshSeed();setup.offer=draft(setup.seed);setup.talents=setup.offer.talents.slice(0,2);setupDialog();
  }
  else if(action==='birth'){
    readSetup();if(setup.talents.length!==2){notify('選擇兩份天賦，再開始這一生。');return;}
    startLife(campaign,setup);save();$('#dialog').close();view='game';render(true);
  }
  else if(action==='choose'){if(choose(campaign,Number(target.dataset.index))){save();render();$('#main .next-button')?.focus({preventScroll:true});}}
  else if(action==='next'){advance(campaign);save();render();$('#main .choice, #main .ending h1')?.focus({preventScroll:true});}
  else if(action==='end-life')openDialog('讓這一世輕輕落幕？',`<p>目前的選擇將保存在輪迴手記，也會留下下一世可繼承的遺物。這一世無法繼續。</p><div class="dialog-actions">${button('close','還想再經歷一些','outline-button')}${button('end-confirm','留下回聲，結束這一世','primary-button')}</div>`);
  else if(action==='end-confirm'){finish(campaign,true);save();$('#dialog').close();render(true);}
  else if(action==='export')download('between-lives-save.json',JSON.stringify(campaign,null,2));
  else if(action==='export-life')exportStory(campaign.history[0]);
  else if(action==='export-history')exportStory(campaign.history[Number(target.dataset.index)]);
  else if(action==='import')openDialog('帶回你的宇宙',`<p>選擇先前匯出的 JSON 檔案，或直接貼上完整存檔內容。</p>${button('import-file','選擇存檔檔案 ↑','outline-button export-actions')}<label>貼上存檔內容<textarea id="import-data" rows="7" spellcheck="false" placeholder="貼上完整 JSON 存檔"></textarea></label>${button('import-text','檢查這份存檔','primary-button birth-button')}`);
  else if(action==='import-file')$('#import-file').click();
  else if(action==='import-text')reviewImport($('#import-data').value);
  else if(action==='copy-export'){try{await navigator.clipboard.writeText($('#export-data').value);notify('完整內容已複製。請貼到文字檔保存。');}catch{$('#export-data').focus();$('#export-data').select();notify('已選取完整內容，請按 Ctrl+C 或使用系統的複製功能。');}}
  else if(action==='import-confirm'){campaign=pendingImport;pendingImport=null;savingAllowed=true;storageProblem='';save();$('#dialog').close();view=campaign.current?'game':'home';render(true);notify('存檔已匯入。歡迎回到你的宇宙。');}
  else if(action==='raw-backup'){try{download('between-lives-original-save.json',localStorage.getItem(KEY)||'');}catch{notify('目前無法存取原始存檔。');}}
  else if(action==='enable-save')openDialog('以目前進度取代原存檔？',`<p>這會覆寫無法載入的原始資料。請先下載原始存檔備份。</p><div class="dialog-actions">${button('settings','返回備份','outline-button')}${button('enable-save-confirm','以目前進度儲存','primary-button')}</div>`);
  else if(action==='enable-save-confirm'){savingAllowed=true;storageProblem='';save();settings();}
  else if(action==='reset-confirm')openDialog('清除所有本機進度？',`<p>所有輪迴、圖鑑與尚未結束的人生都會移除，無法復原。需要保留時，請先返回設定匯出。</p><div class="dialog-actions">${button('settings','返回設定','outline-button')}${button('reset','確認清除所有進度','danger-button')}</div>`);
  else if(action==='reset'){campaign=emptyCampaign();savingAllowed=true;storageProblem='';save();$('#dialog').close();view='home';render(true);notify('宇宙回到了最初。');}
});
document.addEventListener('change',event=>{
  if(event.target.id==='seed-input'&&setup){
    readSetup();setup.seed=event.target.value.trim().slice(0,80)||freshSeed();setup.offer=draft(setup.seed);setup.talents=setup.offer.talents.slice(0,2);
    const w=byId(WORLDS,setup.offer.worldId),l=byId(LAWS,setup.offer.lawId);
    event.target.value=setup.seed;
    $('.world-preview strong').textContent=w.name;$('.world-preview p').textContent=w.description;$('.world-preview small').textContent=`此地法則：${l.name}`;
    $('.talent-draft').innerHTML=setup.offer.talents.map(id=>{const t=byId(TALENTS,id),selected=setup.talents.includes(id);return `<button class="talent-option ${selected?'selected':''}" data-action="talent" data-id="${id}" aria-pressed="${selected}"><span>✧</span><strong>${t.name}</strong><small>${t.description}</small><i>${selected?'✓':'+'}</i></button>`;}).join('');
    $('#talent-selected-count').textContent='2 / 2';
  }
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>8_000_000)throw new Error('存檔過大，請選擇 8 MB 以下的 JSON 存檔。');reviewImport(await file.text());}catch(error){notify(error.message);}finally{event.target.value='';}
});
function reviewImport(text){
  try{pendingImport=parseSave(text);openDialog('以匯入的存檔取代目前進度？',`<p>這份存檔含有 ${pendingImport.total} 世經歷、${pendingImport.forms.length} 種已發現形態。取代前可先匯出目前進度；備份後再匯入此檔即可。</p><div class="dialog-actions">${button('export','備份目前進度 ↓','outline-button')}${button('import-confirm','確認匯入','primary-button')}</div>`);}catch(error){pendingImport=null;notify(error.message);}
}
$('#dialog').addEventListener('close',()=>{if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null;}});
document.addEventListener('keydown',event=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||$('#dialog').open||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)||view!=='game')return;
  if(['1','2','3'].includes(event.key)){$(`[data-action="choose"][data-index="${Number(event.key)-1}"]`)?.click();event.preventDefault();}
  else if(event.key==='Enter'&&campaign.current?.phase==='result'&&document.activeElement.tagName!=='BUTTON'){$('[data-action="next"]')?.click();event.preventDefault();}
});
$('.brand').addEventListener('click',event=>{event.preventDefault();view='home';render(true);});

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
render();
if(storageProblem)notify('找到無法載入的舊存檔。已保留原檔，請至設定下載備份。');
if(new URLSearchParams(location.search).has('seed')&&!active())begin();
