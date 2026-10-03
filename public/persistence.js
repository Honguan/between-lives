// Cooperating tabs compare and write while holding the same origin-scoped lock.
export async function writeSave(storage,locks,key,expected,value){
  if(!locks)throw new Error('unsupported');
  await locks.request(key,()=>{
    if(storage.getItem(key)!==expected)throw new Error('conflict');
    storage.setItem(key,value);
  });
}
