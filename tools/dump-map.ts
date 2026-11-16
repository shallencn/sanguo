// 开发用小工具：把地图打印成字符画，检查生成结果。用法：npx vite-node tools/dump-map.ts [种子]
import { generateMap } from '../src/core/mapgen';
import { Terrain } from '../src/core/types';

const seed = Number(process.argv[2] ?? 1);
const { map, starts } = generateMap(seed);
const N = map.size;
const rows: string[] = [];
const count: Record<string, number> = {};
const levels = new Array(10).fill(0);
for (let y = 0; y < N; y++) {
  let row = '';
  for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const t = map.terrain[i];
    let ch = '?';
    if (starts.some((s) => s.x === x && s.y === y)) ch = '@';
    else if (t === Terrain.Mountain) ch = '^';
    else if (t === Terrain.River) ch = '~';
    else if (t === Terrain.Ferry) ch = '=';
    else if (t === Terrain.Pass) ch = '#';
    else if (t === Terrain.City) ch = 'C';
    else ch = process.argv[3] === 'state' ? String(map.state[i]) : String(map.level[i]);
    if (t === Terrain.Plain) levels[map.level[i]]++;
    count[t] = (count[t] ?? 0) + 1;
    row += ch;
  }
  rows.push(row);
}
console.log(rows.join('\n'));
console.log('地形统计', count, '等级分布', levels.slice(1).join(','));
console.log(map.places.map((p) => `${p.name}(${p.x},${p.y})`).join(' '));
