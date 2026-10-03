import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCampaign,draft,startLife,currentEvent,choose,advance,finish,parseSave,chance,simulate,ENDINGS } from '../public/engine.js';
import { FORMS,WORLDS,LAWS,TALENTS,ARTIFACTS,ACHIEVEMENTS } from '../public/content.js';
import { EVENTS } from '../public/events.js';
import { CURIOS,CONDITIONS,SCENE_COUNT } from '../public/fragments.js';
import { EN,END_EN,CURIOS_EN,CONDITIONS_EN,eventEnglish } from '../public/english.js';

function born(seed='test',formId,mode='classic'){
  const campaign=emptyCampaign();const offer=draft(seed);
  startLife(campaign,{seed,formId,talents:offer.talents.slice(0,2),mode});return campaign;
}

test('ending discoveries migrate old saves and outlive retained stories',()=>{
  const campaign=born('ending-collection');play(campaign);
  const key=campaign.current.ending.key;
  assert.deepEqual(campaign.endings,[key]);
  const old=structuredClone(campaign);delete old.endings;
  assert.deepEqual(parseSave(JSON.stringify(old)).endings,[key]);
  campaign.history=[];campaign.current=null;
  assert.deepEqual(parseSave(JSON.stringify(campaign)).endings,[key]);
  campaign.endings=['unknown'];
  assert.throws(()=>parseSave(JSON.stringify(campaign)),/存檔格式/);
});
function play(campaign,policy=()=>2){
  let count=0;
  while(campaign.current.phase!=='ended'){
    const life=campaign.current;
    assert.ok(++count<65,'A life must terminate within its turn limit');
    if(life.phase==='choice')choose(campaign,policy(life));else advance(campaign);
    for(const value of Object.values(life.stats))assert.ok(Number.isFinite(value)&&value>=0&&value<=100);
  }
  return campaign;
}
test('identical origins and choices reproduce a whole life, even across save/reload',()=>{
  let a=born('共同的夢','concept-6'),b=born('共同的夢','concept-6');
  for(let i=0;i<29&&a.current.phase!=='ended';i++){
    assert.deepEqual(currentEvent(a.current),currentEvent(b.current));
    choose(a,i%3);choose(b,i%3);b=parseSave(JSON.stringify(b));
    advance(a);advance(b);assert.deepEqual(a,b);
  }
  assert.equal(a.current.phase,'ended');assert.equal(a.total,1);
});
test('2,400 simulated lives cover all forms, laws, choices and maintain valid saves',()=>{
  const endings=new Set(),events=new Set(),laws=new Set();let callbacks=0,shifts=0;
  for(let i=0;i<2400;i++){
    const campaign=born(`universe-${i}`,FORMS[i%FORMS.length].id,i%2?'classic':'drift');
    laws.add(campaign.current.lawId);
    play(campaign,life=>{events.add(life.eventId);return i%4===0?2:(life.turn+i)%3;});
    const life=campaign.current;
    assert.equal(campaign.total,1);assert.equal(campaign.history.length,1);
    assert.equal(life.logs.length,life.turn);
    if(i%24===0)assert.deepEqual(parseSave(JSON.stringify(campaign)),campaign);
    endings.add(life.ending.key);callbacks+=life.callbacks;shifts+=life.shifts;
    finish(campaign);advance(campaign);choose(campaign,0);assert.equal(campaign.total,1,'Ending is recorded only once');
  }
  assert.equal(laws.size,12);assert.ok(endings.size>=6);assert.ok(callbacks>100);assert.ok(shifts>100);
  for(const event of EVENTS)assert.ok(events.has(event.id),`Missing reachable event: ${event.id}`);
  console.log(`Simulation: 2,400 lives, ${endings.size} endings, ${events.size} event types, ${callbacks} callbacks, ${shifts} transformations.`);
});
test('consequences remember the original witness when the player changes worlds',()=>{
  const c=born('因果');const life=c.current;
  life.pending=[{id:'garden',due:2,witness:'第一個世界的朋友'}];
  choose(c,2);advance(c);
  assert.equal(life.eventId,'chain-garden');assert.equal(life.eventWitness,'第一個世界的朋友');
  choose(c,0);assert.equal(life.callbacks,1);assert.ok(c.achievements.includes('callback'));
});
test('crossings change identity; rewritten laws affect subsequent play',()=>{
  const c=born('edge');const life=c.current;
  life.eventId='crossing';life.stats.c=100;life.rng=0;
  const target=life.otherId;
  let attempts=0;
  while(life.formId!==target&&attempts++<20){life.phase='choice';life.eventId='crossing';choose(c,0);}
  assert.equal(life.formId,target);assert.ok(life.shifts>0);assert.ok(c.forms.includes(target));
  const risky=EVENTS[0].choices[0];life.lawId='wild';const boosted=chance(life,risky);life.lawId='memory';assert.ok(boosted>chance(life,risky));
  life.eventId='rewrite';life.phase='choice';life.stats.c=100;const old=life.lawId;
  for(let i=0;i<20&&life.lawId===old;i++){life.phase='choice';choose(c,0);}
  assert.notEqual(life.lawId,old);
});
test('existence death and one-time revival both terminate and are idempotent',()=>{
  const c=born('phoenix');const life=c.current;life.talents=['phoenix'];life.stats.e=1;life.eventId='garden';life.stats.b=100;
  choose(c,0);assert.equal(life.revived,true);assert.equal(life.stats.e,28);
  advance(c);life.stats.e=1;life.eventId='garden';choose(c,0);advance(c);
  assert.equal(life.phase,'ended');assert.equal(c.total,1);assert.equal(life.ending.key,'quiet');
});
test('reincarnation preserves discoveries and applies exactly the latest artifact',()=>{
  const c=play(born('past'));const memory=c.memories.at(-1);const discovered=[...c.forms];
  const baseline=born('next');startLife(c,{seed:'next',talents:draft('next').talents.slice(0,2)});
  assert.equal(c.current.number,2);assert.deepEqual(c.current.inherited,memory);
  for(const id of discovered)assert.ok(c.forms.includes(id));
  const changes=Object.keys(c.current.stats).filter(k=>c.current.stats[k]!==baseline.current.stats[k]);assert.ok(changes.length<=1);
  assert.throws(()=>startLife(c,{seed:'overwrite'}),/尚未結束/);
  assert.deepEqual(parseSave(JSON.stringify(c)),c);
});
test('untrusted or incomplete imports cannot silently replace a valid save',()=>{
  for(const value of ['null','[]','{}','not json','x'.repeat(8_000_001)])assert.throws(()=>parseSave(value));
  const mutations=[c=>c.version=999,c=>c.current.stats.e='100',c=>c.current.stats.e=Infinity,c=>c.current.formId='missing',c=>c.current.eventId='execute-code',c=>c.current.phase='result',c=>c.current.talents=['unknown'],c=>c.current.otherId='missing',c=>c.current.turn=200,c=>c.current.pending=[{id:'__proto__',due:2,witness:'x'}]];
  for(const change of mutations){const c=born();change(c);assert.throws(()=>parseSave(JSON.stringify(c)));}
  const c=born();c.current.customName='<img src=x onerror=x>';
  assert.equal(parseSave(JSON.stringify(c)).current.customName,c.current.customName,'Plain text remains plain text; the renderer must escape it');
});
test('every choice has complete outcome text and no unresolved placeholders',()=>{
  for(const form of FORMS){const c=born('content',form.id);for(const e of EVENTS.filter(e=>e.group==='any'||e.group===form.group)){
    c.current.eventId=e.id;const rendered=currentEvent(c.current);
    assert.equal(rendered.choices.length,3);assert.doesNotMatch(rendered.body,/\{\w+\}/);
    for(const choice of rendered.choices){assert.doesNotMatch(choice.label,/\{\w+\}/);assert.ok(choice.success);if(choice.difficulty)assert.ok(choice.failure);}
  }}
});
test('seeded talent offerings stay unique and valid across varied Unicode seeds',()=>{
  for(const seed of ['','宇宙','🐋','星期八','a'.repeat(80),'42']){const d=draft(seed);assert.deepEqual(d,draft(seed));assert.equal(new Set(d.talents).size,5);for(const id of d.talents)assert.ok(TALENTS.some(t=>t.id===id));assert.ok(LAWS.some(l=>l.id===d.lawId));}
});
test('the rare seventh ending is reachable through normal choices without mutating game state',()=>{
  let found=false;
  for(let i=0;i<100&&!found;i++){
    const c=born(`balance-${i}`,undefined,'drift');
    play(c,life=>{
      const score=q=>Object.entries(q.effects).reduce((n,[k,v])=>n+v*(k==='e'?(life.stats.e<30?3:.08):Math.max(0,(75-life.stats[k])/20)),0)*q.chance/100+(q.chain?2:0);
      return currentEvent(life).choices.map((q,i)=>({i,s:score(q)})).sort((a,b)=>b.s-a.s)[0].i;
    });found=c.current.ending.key==='impossible';
  }
  assert.equal(found,true);
});
test('long campaigns retain 120 complete histories and remain exportable and importable',()=>{
  const c=emptyCampaign();
  for(let i=0;i<125;i++){startLife(c,{seed:`long-${i}`,talents:draft(`long-${i}`).talents.slice(0,2)});play(c);}
  assert.equal(c.total,125);assert.equal(c.history.length,120);assert.equal(c.memories.length,6);
  const save=JSON.stringify(c,null,2);assert.ok(Buffer.byteLength(save)<8_000_000);
  assert.deepEqual(parseSave(save),c);
});
test('imports reject result screens with missing journal context',()=>{
  const c=born();choose(c,0);c.current.logs=[];
  assert.throws(()=>parseSave(JSON.stringify(c)),/格式或版本/);
});

test('automatic lives honor world and species, and resume deterministically without player choices',()=>{
  for(let i=0;i<FORMS.length;i++){
    let a=emptyCampaign();startLife(a,{seed:`automatic-${i}`,formId:FORMS[i].id,worldId:WORLDS[i%WORLDS.length].id,auto:true});
    assert.equal(a.current.formId,FORMS[i].id);assert.equal(a.current.worldId,WORLDS[i%WORLDS.length].id);
    assert.equal(a.current.talents.length,2);
    const b=structuredClone(a);let ticks=0;
    while(a.current.phase!=='ended'){
      assert.ok(++ticks<=30);
      simulate(a);a=parseSave(JSON.stringify(a));
      // Rendering another language may happen any number of times between ticks.
      const before=JSON.stringify(b);eventEnglish(b.current);assert.equal(JSON.stringify(b),before);
      simulate(b);assert.deepEqual(a,b);
    }
    simulate(a);assert.equal(a.total,1);
  }
});
test('6,000 automatic lives reach every ending without altering game state',()=>{
  const counts={};const scenes=new Set();
  for(let i=0;i<6000;i++){
    const c=emptyCampaign();startLife(c,{seed:`auto-${i}`,auto:true});let ticks=0;
    while(c.current.phase!=='ended'){
      assert.ok(++ticks<=30);simulate(c);
      if(c.current.eventId==='woven')scenes.add(c.current.weave.scene);
      for(const value of Object.values(c.current.stats))assert.ok(value>=0&&value<=100);
    }
    const key=c.current.ending.key;counts[key]=(counts[key]||0)+1;
    if(i%100===0)assert.deepEqual(parseSave(JSON.stringify(c)),c);
  }
  assert.deepEqual(Object.keys(counts).sort(),Object.keys(ENDINGS).sort());
  assert.equal(scenes.size,SCENE_COUNT);
  console.log('Automatic endings:',JSON.stringify(counts));
});
test('both languages cover all catalog entries and procedural scenes without unresolved placeholders',()=>{
  for(const [list,prefix] of [[FORMS,''],[WORLDS,''],[LAWS,'law:'],[TALENTS,'talent:'],[ARTIFACTS,''],[ACHIEVEMENTS,'achievement:']])for(const item of list){
    const en=EN[prefix+item.id];assert.ok(en?.name&&en.description,`Missing translation: ${prefix+item.id}`);
    assert.doesNotMatch(en.name+en.description,/[\u3400-\u9fff]|undefined/);
  }
  assert.deepEqual(Object.keys(END_EN).sort(),Object.keys(ENDINGS).sort());
  assert.equal(CURIOS_EN.length,CURIOS.length);assert.equal(CONDITIONS_EN.length,CONDITIONS.length);
  const c=born();c.current.eventId='woven';
  for(let scene=0;scene<SCENE_COUNT;scene++)for(let curio=0;curio<CURIOS.length;curio++)for(let condition=0;condition<CONDITIONS.length;condition++){
    c.current.weave={scene,curio,condition,visitor:'concept-9'};
    const zh=currentEvent(c.current),en=eventEnglish(c.current);
    assert.doesNotMatch(JSON.stringify(en),/[\u3400-\u9fff]|undefined|\{\w+\}/);
    assert.equal(en.choices.length,zh.choices.length);
    for(let i=0;i<3;i++){assert.ok(en.choices[i].label&&en.choices[i].success);if(zh.choices[i].difficulty)assert.ok(en.choices[i].failure);}
  }
});
test('English outcome records remain complete after transformation, travel and law changes',()=>{
  for(const e of [...EVENTS.map(x=>x.id),'crossing','rewrite',...['garden','letter','friend','door','star','name','mirror','signal'].map(x=>'chain-'+x)])for(let index=0;index<3;index++){
    const c=born('translation');c.current.eventId=e;const en=eventEnglish(c.current);choose(c,index);
    const log=c.current.logs.at(-1);assert.equal(log.en.title,en.title);assert.equal(log.en.body,en.body);
    assert.ok(log.en.text);assert.doesNotMatch(JSON.stringify(log.en),/[\u3400-\u9fff]|undefined|\{\w+\}/);
  }
});
test('old logs without translations load intact and untrusted bilingual records are bounded',()=>{
  const c=play(born());for(const l of [...c.current.logs,...c.history[0].logs])delete l.en;
  assert.deepEqual(parseSave(JSON.stringify(c)),c);
  const d=born();simulate(d);d.current.logs[0].en.body='x'.repeat(2001);assert.throws(()=>parseSave(JSON.stringify(d)));
});
