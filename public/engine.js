import { FORMS, WORLDS, LAWS, TALENTS, ARTIFACTS, GROUPS } from './content.js';
import { EVENTS, CHAINS, chainEvent, CROSSING, REWRITE } from './events.js';
import { CURIOS,CONDITIONS,SCENE_COUNT,wovenEvent } from './fragments.js';
import { eventEnglish,detailEnglish,EN } from './english.js';

export const SAVE_VERSION = 1;
const clamp = (n, low = 0, high = 100) => Math.min(high, Math.max(low, n));
export function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}
function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let n = state.rng;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}
const pick = (state, items) => items[Math.floor(random(state) * items.length)];
const has = (life, id) => life.talents.includes(id);
const remember = (list, value) => { if (!list.includes(value)) list.push(value); };
export function emptyCampaign() {
  return {version:SAVE_VERSION,total:0,forms:[],worlds:[],endings:[],achievements:[],history:[],memories:[],current:null};
}
export function draft(seed) {
  const state = {rng:hash(seed)};
  const talents = [...TALENTS];
  for (let i=talents.length-1;i>0;i--) { const j=Math.floor(random(state)*(i+1)); [talents[i],talents[j]]=[talents[j],talents[i]]; }
  return {formId:pick(state,FORMS).id,worldId:pick(state,WORLDS).id,lawId:pick(state,LAWS).id,talents:talents.slice(0,5).map(t=>t.id)};
}
export function startLife(campaign, options) {
  if (campaign.current && campaign.current.phase !== 'ended') throw new Error('這一世尚未結束。');
  const seed = String(options.seed || '萬象初始').trim().slice(0,80) || '萬象初始';
  const offer = draft(seed);
  const form = FORMS.find(f=>f.id===options.formId) || FORMS.find(f=>f.id===offer.formId);
  const talents = [...new Set(options.auto ? offer.talents.slice(0,2) : options.talents || [])].filter(id=>offer.talents.includes(id)).slice(0,2);
  const mode = options.mode === 'drift' ? 'drift' : 'classic';
  const life = {
    seed,rng:hash(`${seed}:life`),number:campaign.total+1,formId:form.id,
    customName:String(options.customName || '').trim().slice(0,24),originFormId:form.id,
    worldId:WORLDS.some(w=>w.id===options.worldId)?options.worldId:offer.worldId,lawId:offer.lawId,talents,mode,
    stats:{e:76,w:28,b:28,c:22},turn:1,limit:24,phase:'choice',
    eventId:'',otherId:'',eventWitness:'',weave:null,seen:[],pending:[],logs:[],shifts:0,callbacks:0,
    revived:false,artifact:'',ending:null,result:null,
  };
  life.stats[{animal:'b',life:'e',matter:'w',cosmic:'c',digital:'w',concept:'b'}[form.group]] += 10;
  for (const id of talents) {
    const t = TALENTS.find(t=>t.id===id);
    if (t.stat in life.stats) life.stats[t.stat] += t.amount;
    else if (t.stat==='dual') {life.stats.w+=8;life.stats.c+=8;}
    else if (t.stat==='dream') {life.stats.w+=10;life.stats.b+=6;}
    else if (t.stat==='outsider') {life.stats.c+=20;life.stats.e-=5;}
    else if (t.stat==='soft') {life.stats.b+=10;life.stats.e+=6;}
    else if (t.stat==='bold') {life.stats.c+=10;life.stats.w+=6;}
    else if (t.stat==='anchor') {life.stats.e+=10;life.stats.b+=8;}
    else if (t.stat==='all') for (const key in life.stats) life.stats[key]+=5;
    else if (t.stat==='long') life.limit+=5;
  }
  const inherited = campaign.memories.at(-1);
  if (inherited) life.stats[ARTIFACTS.find(a=>a.id===inherited.artifact).stat]+=8;
  for (const key in life.stats) life.stats[key]=clamp(life.stats[key]);
  life.inherited = inherited ? {...inherited} : null;
  campaign.current=life;
  remember(campaign.forms,form.id);
  remember(campaign.worlds,life.worldId);
  nextEvent(life);
  checkAchievements(campaign);
  return life;
}
export function currentForm(life) {
  const form = FORMS.find(f=>f.id===life.formId);
  return {...form,name:life.customName || form.name};
}
function template(life) {
  if (life.eventId==='woven') return wovenEvent(life);
  if (life.eventId==='crossing') return CROSSING;
  if (life.eventId==='rewrite') return REWRITE;
  if (life.eventId.startsWith('chain-')) return chainEvent(life.eventId.slice(6));
  return EVENTS.find(e=>e.id===life.eventId);
}
export function fill(text, life) {
  const world = WORLDS.find(w=>w.id===life.worldId);
  const form = currentForm(life);
  const values = {form:form.name,world:world.name,place:world.place,witness:life.eventWitness||world.witness,other:FORMS.find(f=>f.id===life.otherId)?.name,...GROUPS[form.group]};
  return text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??'未知');
}
export function chance(life, choice) {
  if (!choice.difficulty) return 100;
  let value = 64 + (life.stats[choice.stat]-choice.difficulty)*0.65;
  if(has(life,'lucky'))value+=8;
  if(life.lawId==='wild')value+=8;
  if(life.lawId==='dream' && life.stats.e<25)value+=15;
  if(choice.stat==='c' && life.stats.c>=65)value+=8;
  if(life.mode==='drift')value+=12;
  return Math.round(clamp(value,18,95));
}
export function currentEvent(life) {
  const base=template(life);
  return {...base,title:fill(base.title,life),body:fill(base.body,life),choices:base.choices.map(c=>({...c,label:fill(c.label,life),chance:chance(life,c)}))};
}
function nextEvent(life) {
  life.otherId=pick(life,FORMS.filter(f=>f.id!==life.formId)).id;
  life.eventWitness='';
  if(life.turn===7 || life.turn===21){life.eventId='crossing';return;}
  if(life.turn===14){life.eventId='rewrite';return;}
  const due=life.pending.find(p=>p.due<=life.turn);
  if(due){
    life.eventId=`chain-${due.id}`;
    life.eventWitness=due.witness;
    life.pending=life.pending.filter(p=>p!==due);
    return;
  }
  if(life.eventId!=='woven' && random(life)<0.4){
    life.eventId='woven';
    life.weave={scene:Math.floor(random(life)*SCENE_COUNT),curio:Math.floor(random(life)*CURIOS.length),visitor:pick(life,FORMS.filter(f=>f.id!==life.formId)).id,condition:Math.floor(random(life)*CONDITIONS.length)};
    return;
  }
  const own=currentForm(life).group;
  let pool=EVENTS.filter(e=>(e.group==='any'||e.group===own)&&!life.seen.includes(e.id));
  if(!pool.length){life.seen=[];pool=EVENTS.filter(e=>e.group==='any'||e.group===own);}
  const personal=pool.filter(e=>e.group===own);
  const selected=pick(life,personal.length && random(life)<0.48?personal:pool);
  life.eventId=selected.id;
  life.seen.push(selected.id);
}
export function choose(campaign, index) {
  const life=campaign.current;
  if(!life || life.phase!=='choice')return null;
  const event=currentEvent(life), choice=event.choices[index];
  if(!choice)return null;
  const english=eventEnglish(life),englishChoice=english.choices[index];
  const before={...life.stats};
  const success=random(life)*100<choice.chance;
  const effects=success?{...choice.effects}:{e:-8,[choice.stat]:3};
  const details=[];
  if(success && life.lawId==='kindness' && effects.b>0)effects.b+=2;
  if(life.lawId==='memory' && effects.w>0)effects.e=(effects.e||0)-1;
  if(life.lawId==='fragile' && effects.w>0)effects.w+=3;
  if(life.lawId==='silence' && choice.difficulty===0)effects.w=(effects.w||0)+3;
  if(life.lawId==='exchange' && !success)effects.w=(effects.w||0)+5;
  if(has(life,'gentle') && success && choice.stat==='b')effects.e=(effects.e||0)+3;
  if(has(life,'mirror') && !success && choice.stat==='w')effects.w=(effects.w||0)+4;
  for(const [key,value] of Object.entries(effects))life.stats[key]+=value;
  life.stats.e-=life.mode==='drift'?2:4;
  if(life.lawId==='fragile')life.stats.e--;
  if(life.lawId==='entropy')life.stats.c+=2;
  if(life.lawId==='shared'&&life.stats.b>=65)life.stats.e+=2;
  if(life.lawId==='reverse'&&life.turn%5===0){life.stats.e+=8;details.push('時間倒流，存在 +8。');}
  if(life.lawId==='echo'&&life.turn%4===0){life.stats.b+=4;details.push('相遇重演，共鳴 +4。');}
  if(has(life,'rooted')&&life.turn%4===0)life.stats.e+=5;
  // Capture prose before transformations so the choice and outcome share a viewpoint.
  let text=fill(success?choice.success:choice.failure||'邊界沒有開啟。你仍帶回了一點新的理解。',life);
  if(success && choice.chain && !life.pending.some(p=>p.id===choice.chain)){
    life.pending.push({id:choice.chain,due:life.turn+3+Math.floor(random(life)*3),witness:WORLDS.find(w=>w.id===life.worldId).witness});
    details.push('一個因果已被種下，或許會在未來回應你。');
  }
  if(life.eventId.startsWith('chain-')){life.callbacks++;remember(campaign.achievements,'callback');}
  if(success&&choice.shift){
    life.formId=life.otherId;life.customName='';life.shifts++;
    remember(campaign.forms,life.formId);
    if(life.lawId==='names')life.stats.w+=10;
    if(has(life,'shifter'))life.stats.e+=12;
    details.push(`你蛻變為「${currentForm(life).name}」。`);
  }
  if(success&&choice.warp){
    life.worldId=pick(life,WORLDS.filter(w=>w.id!==life.worldId)).id;
    remember(campaign.worlds,life.worldId);
    details.push(`你抵達「${WORLDS.find(w=>w.id===life.worldId).name}」。`);
  }
  if(success&&choice.rewrite){
    life.lawId=pick(life,LAWS.filter(l=>l.id!==life.lawId)).id;
    details.push(`新法則：${LAWS.find(l=>l.id===life.lawId).name}。`);
  }
  if(success&&choice.artifact){life.artifact=choice.artifact;details.push(`獲得遺物：${ARTIFACTS.find(a=>a.id===choice.artifact).name}。`);}
  if(life.stats.e<=0&&has(life,'phoenix')&&!life.revived){
    life.stats.e=28;life.revived=true;details.push('餘燼不熄：你的存在重新燃起。');remember(campaign.achievements,'revive');
  }
  for(const key in life.stats)life.stats[key]=clamp(life.stats[key]);
  const delta=Object.fromEntries(Object.keys(before).map(k=>[k,life.stats[k]-before[k]]));
  life.result={success,text,details,delta,label:choice.label,title:event.title};
  life.logs.push({turn:life.turn,title:event.title,body:event.body,choice:choice.label,text,details:[...details],success,form:currentForm(life).name,en:{title:english.title,body:english.body,choice:englishChoice.label,text:success?englishChoice.success:englishChoice.failure,details:details.map(detailEnglish),form:EN[life.formId].name}});
  life.phase='result';
  checkAchievements(campaign);
  return life.result;
}
export function advance(campaign) {
  const life=campaign.current;
  if(!life || life.phase!=='result')return;
  if(life.stats.e<=0 || life.turn>=life.limit){finish(campaign);return;}
  life.turn++;life.phase='choice';life.result=null;nextEvent(life);
}
// One automatic chapter per tick. Reading speed and language never consume randomness.
export const inclination=life=>['e','w','b','c'][hash(`${life.seed}:${life.originFormId}:instinct`)%4];
export function simulate(campaign) {
  const life=campaign.current;
  if(!life || life.phase==='ended')return;
  if(life.phase==='result')advance(campaign);
  if(life.phase!=='choice')return;
  const choices=currentEvent(life).choices;
  const instinct=inclination(life);
  const weights=choices.map(c=>3+life.stats[c.stat]*0.08+(c.stat===instinct?100:0)+(c.stat==='e'?Math.max(0,35-life.stats.e)*3:0));
  let roll=random(life)*weights.reduce((a,b)=>a+b,0),index=weights.length-1;
  for(let i=0;i<weights.length;i++){roll-=weights[i];if(roll<0){index=i;break;}}
  choose(campaign,index);
}
function checkAchievements(campaign) {
  const life=campaign.current;
  if(campaign.total>=1)remember(campaign.achievements,'first');
  if(campaign.total>=10)remember(campaign.achievements,'ten');
  if(new Set(campaign.forms.map(id=>FORMS.find(f=>f.id===id).group)).size===6)remember(campaign.achievements,'six');
  if(campaign.worlds.length===WORLDS.length)remember(campaign.achievements,'allworlds');
  if(!life)return;
  if(life.shifts)remember(campaign.achievements,'shift');
  for(const [stat,id]of [['b','bond'],['w','wisdom'],['c','chaos']])if(life.stats[stat]>=90)remember(campaign.achievements,id);
}
export const ENDINGS = {
  quiet:['靜靜回到萬物之中','你的輪廓慢慢鬆開。不再是一個明確的自己，卻成為了許多事物的可能。'],
  bond:['成為別人的遠方','你不在原地了，仍有許多生命，因為曾與你相遇而繼續向前。'],
  wisdom:['宇宙借過你的眼睛','你看見的事物已無法被完整說明。它們變成下一個世界裡，一點不知從何而來的靈感。'],
  chaos:['在世界之外開了一扇窗','你的存在讓某條規則永遠多了一個例外。後來的人，把那個例外叫作自由。'],
  wander:['沒有終點的旅人','你沒有找到唯一的答案。你讓許多原本孤立的地方，多了一條相通的路。'],
  keeper:['微小而完整的一生','你照顧好了一小片宇宙。那一片不大，卻足夠讓某個存在第一次安心。'],
  impossible:['萬物之間的第七種存在','你同時理解了孤單、未知與不可能。宇宙無法再替你分類，只好留下一個空白的新章節。'],
  returner:['最後一頁以後的一生','你記得存在歸零的那一刻。重新醒來後，每一天都超出了原先的預計。'],
  courier:['替宇宙保管回信','那些以為寄丟的訊息，經過你抵達了收件者。你離開以後，這條路仍有人走。'],
  solitary:['獨自畫完的地圖','一路上很少有人同行。你仔細留下的記錄，會讓下一位旅人少迷路幾次。'],
  survivor:['一直亮著的避難所','最後一章到了，你仍有餘力。留下的溫度，足以讓後來的生命避過一場寒冬。'],
  twin:['三種形狀，共用一段記憶','你先後住過三種形狀。每一次換過身體，都留下了別的生命教不會你的習慣。'],
};
export function finish(campaign, voluntary=false) {
  const life=campaign.current;
  if(!life || life.phase==='ended')return;
  const {e,w,b,c}=life.stats;
  let key=e<=0?'quiet':b>=75&&b>=w&&b>=c?'bond':w>=75&&w>=c?'wisdom':c>=75?'chaos':life.shifts>0?'wander':'keeper';
  if(e>0){
    if(e>=80)key='survivor';
    if(life.shifts===0&&life.callbacks===1&&e>=50)key='keeper';
    if(life.shifts===1&&life.callbacks<4&&c>=65)key='wander';
    if(life.callbacks===0&&w>=60)key='solitary';
    if(life.shifts===2)key='twin';
    if(life.callbacks>=4)key='courier';
    if(c>=90&&c>=w&&c>=b&&inclination(life)==='c')key='chaos';
    if(life.revived)key='returner';
  }
  if(e>0&&b>=95&&w>=95&&c>=95&&life.callbacks>=4)key='impossible';
  if(voluntary)key='quiet';
  const [title,text]=ENDINGS[key];
  const maxStat=Object.entries(life.stats).sort((a,b)=>b[1]-a[1])[0][0];
  const artifact=life.artifact||ARTIFACTS.find(a=>a.stat===maxStat).id;
  const memory={form:currentForm(life).name,artifact,ending:title};
  life.ending={key,title,text,artifact,voluntary};life.phase='ended';
  campaign.total++;
  remember(campaign.endings,key);
  campaign.memories=[...campaign.memories,memory].slice(-6);
  campaign.history=[{number:life.number,form:currentForm(life).name,group:currentForm(life).group,origin:FORMS.find(f=>f.id===life.originFormId).name,seed:life.seed,world:WORLDS.find(w=>w.id===life.worldId).name,ending:title,turns:life.turn,artifact,stats:{...life.stats},logs:structuredClone(life.logs)},...campaign.history].slice(0,120);
  checkAchievements(campaign);
}

// Rebuild saves from a bounded, explicit schema. Never import executable event definitions.
export function parseSave(text) {
  if(typeof text!=='string'||text.length>8_000_000)throw new Error('存檔過大，請選擇 8 MB 以下的 JSON 存檔。');
  let source;
  try{source=JSON.parse(text);}catch{throw new Error('無法讀取 JSON，請選擇從遊戲匯出的存檔。');}
  const fail=()=>{throw new Error('存檔格式或版本不相容；原有進度沒有變動。');};
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:fail();
  const str=(x,n=300)=>typeof x==='string'&&x.length<=n?x:fail();
  const num=(x,low=0,high=1e7)=>Number.isInteger(x)&&x>=low&&x<=high?x:fail();
  const bool=x=>typeof x==='boolean'?x:fail();
  const arr=(x,n)=>Array.isArray(x)&&x.length<=n?x:fail();
  const id=(x,items)=>items.some(i=>i.id===x)?x:fail();
  const stats=x=>Object.fromEntries(['e','w','b','c'].map(k=>[k,num(obj(x)[k],0,100)]));
  const memory=x=>({form:str(obj(x).form,50),artifact:id(x.artifact,ARTIFACTS),ending:str(x.ending,100)});
  const log=x=>({turn:num(obj(x).turn,1,29),title:str(x.title),body:str(x.body,2000),choice:str(x.choice),text:str(x.text,2000),details:arr(x.details,10).map(t=>str(t)),success:bool(x.success),form:str(x.form,50),...(x.en?{en:{title:str(obj(x.en).title),body:str(x.en.body,2000),choice:str(x.en.choice),text:str(x.en.text,2000),details:arr(x.en.details,10).map(t=>str(t)),form:str(x.en.form,100)}}:{})});
  obj(source);if(source.version!==SAVE_VERSION)fail();
  const output={version:SAVE_VERSION,total:num(source.total),forms:[...new Set(arr(source.forms,FORMS.length).map(v=>id(v,FORMS)))],worlds:[...new Set(arr(source.worlds,WORLDS.length).map(v=>id(v,WORLDS)))],achievements:arr(source.achievements,10).map(v=>str(v,30)),memories:arr(source.memories,6).map(memory),history:[],current:null};
  output.history=arr(source.history,120).map(x=>({number:num(obj(x).number,1),form:str(x.form,50),group:Object.hasOwn(GROUPS,x.group)?x.group:fail(),origin:str(x.origin,50),seed:str(x.seed,80),world:str(x.world,50),ending:str(x.ending,100),turns:num(x.turns,1,29),artifact:id(x.artifact,ARTIFACTS),stats:stats(x.stats),logs:arr(x.logs,29).map(log)}));
  if(source.current){
    const x=obj(source.current);
    const eventIds=[...EVENTS.map(e=>e.id),'crossing','rewrite','woven',...Object.keys(CHAINS).map(k=>`chain-${k}`)];
    const life={seed:str(x.seed,80),rng:num(x.rng,0,4294967295),number:num(x.number,1),formId:id(x.formId,FORMS),originFormId:id(x.originFormId,FORMS),customName:str(x.customName,24),worldId:id(x.worldId,WORLDS),lawId:id(x.lawId,LAWS),talents:arr(x.talents,2).map(t=>id(t,TALENTS)),mode:['drift','classic'].includes(x.mode)?x.mode:fail(),stats:stats(x.stats),turn:num(x.turn,1,29),limit:num(x.limit,24,29),phase:['choice','result','ended'].includes(x.phase)?x.phase:fail(),eventId:eventIds.includes(x.eventId)?x.eventId:fail(),otherId:id(x.otherId,FORMS),eventWitness:str(x.eventWitness,100),seen:arr(x.seen,EVENTS.length).map(v=>eventIds.includes(v)?v:fail()),pending:arr(x.pending,8).map(p=>({id:Object.hasOwn(CHAINS,obj(p).id)?p.id:fail(),due:num(p.due,1,35),witness:str(p.witness,100)})),logs:arr(x.logs,29).map(log),shifts:num(x.shifts,0,2),callbacks:num(x.callbacks,0,29),revived:bool(x.revived),artifact:x.artifact?id(x.artifact,ARTIFACTS):'',inherited:x.inherited?memory(x.inherited):null,ending:null,result:null};
    if(life.turn>life.limit)fail();
    life.weave=x.weave?{scene:num(obj(x.weave).scene,0,SCENE_COUNT-1),curio:num(x.weave.curio,0,CURIOS.length-1),visitor:id(x.weave.visitor,FORMS),condition:num(x.weave.condition,0,CONDITIONS.length-1)}:null;
    if(life.eventId==='woven'&&!life.weave)fail();
    if(x.result){const r=obj(x.result);life.result={success:bool(r.success),text:str(r.text,2000),details:arr(r.details,10).map(t=>str(t)),delta:Object.fromEntries(['e','w','b','c'].map(k=>[k,num(obj(r.delta)[k],-100,100)])),label:str(r.label),title:str(r.title)};}
    if(x.ending){const e=obj(x.ending);life.ending={key:Object.hasOwn(ENDINGS,e.key)?e.key:fail(),title:str(e.title,100),text:str(e.text,1000),artifact:id(e.artifact,ARTIFACTS),voluntary:bool(e.voluntary)};}
    if((life.phase==='result'&&!life.result)||(life.phase==='ended'&&!life.ending))fail();
    if(life.phase==='result'&&life.logs.length!==life.turn)fail();
    if(life.phase==='choice'&&life.logs.length!==life.turn-1)fail();
    if(life.phase==='ended'&&![life.turn,life.turn-1].includes(life.logs.length))fail();
    if(life.phase==='ended'?life.number!==output.total:life.number!==output.total+1)fail();
    output.current=life;
  }
  output.endings=[...new Set([
    ...arr(source.endings??[],Object.keys(ENDINGS).length).map(key=>Object.hasOwn(ENDINGS,key)?key:fail()),
    ...output.history.map(h=>Object.keys(ENDINGS).find(key=>ENDINGS[key][0]===h.ending)).filter(Boolean),
    ...(output.current?.ending?[output.current.ending.key]:[]),
  ])];
  return output;
}
