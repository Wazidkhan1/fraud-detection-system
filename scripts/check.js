import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let count = 0;
for (const directory of ['src', 'scripts', 'public', 'tests']) {
  for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
    if (!file.endsWith('.js') && !file.endsWith('.cjs')) continue;
    const result = spawnSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log(`Syntax checks passed for ${count} JavaScript files.`);
