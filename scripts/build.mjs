import { mkdir,readFile,writeFile,copyFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
// No compilation: ship exactly the static files, never the source repository or local saves.
const dest=resolve('.artifacts/site');
await mkdir(`${dest}/public`,{recursive:true});await mkdir(`${dest}/.openai`,{recursive:true});
const files=(await readdir('public')).filter(name=>/\.(html|css|js|svg)$/.test(name));
for(const name of files)await copyFile(`public/${name}`,`${dest}/public/${name}`);
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));
await writeFile(`${dest}/.openai/hosting.json`,JSON.stringify(hosting,null,2));
const archive=resolve('.artifacts/site.tar.gz');
execFileSync('tar',['-czf',archive,'-C',dest,'.openai','public']);
console.log(`Static build: ${files.length} assets → ${archive}`);
