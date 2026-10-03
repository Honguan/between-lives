import test from 'node:test';
import assert from 'node:assert/strict';
import {writeSave} from '../public/persistence.js';

test('concurrent tabs cannot overwrite a newer save; failures preserve the original',async()=>{
  let value='original',queue=Promise.resolve();
  const storage={getItem:()=>value,setItem:(_,next)=>{value=next;}};
  const locks={request:(_,callback)=>{const next=queue.then(callback);queue=next.catch(()=>{});return next;}};
  const results=await Promise.allSettled([
    writeSave(storage,locks,'save','original','first'),
    writeSave(storage,locks,'save','original','second'),
  ]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].reason.message,'conflict');
  assert.equal(value,'first');
  await assert.rejects(writeSave(storage,null,'save','first','unsupported'),/unsupported/);
  storage.setItem=()=>{throw new Error('quota');};
  await assert.rejects(writeSave(storage,locks,'save','first','lost'),/quota/);
  assert.equal(value,'first');
});
