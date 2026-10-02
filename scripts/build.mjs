import { mkdir,copyFile,readdir,rm } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { execFileSync } from 'node:child_process';
// No compilation: ship exactly the static files, never the source repository or local saves.
const root=resolve('.'),dest=resolve(root,'dist');
if(!dest.startsWith(root+sep))throw new Error('Build output must remain inside the project.');
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});await mkdir('.artifacts',{recursive:true});
const files=(await readdir('public')).filter(name=>/\.(html|css|js|svg)$/.test(name));
for(const name of files)await copyFile(`public/${name}`,`${dest}/${name}`);
const archive=resolve('.artifacts/site.tar.gz');
execFileSync('tar',['-czf',archive,'-C',root,'.openai','dist']);
console.log(`Static build: ${files.length} assets → ${archive}`);
