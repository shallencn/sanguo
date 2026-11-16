import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/data/config';
import { generateMap, isOccupiableTerrain } from '../src/core/mapgen';
import { Terrain, type GameMap } from '../src/core/types';

const SEEDS = [1, 2, 3, 7, 42, 99, 2024, 31337, 555555, 987654321];
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 从 start 出发，只走 canWalk 允许的格子，返回能到达的所有格子 */
function flood(map: GameMap, start: number, canWalk: (i: number) => boolean): Set<number> {
  const N = map.size;
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let h = 0; h < queue.length; h++) {
    const x = queue[h] % N;
    const y = Math.floor(queue[h] / N);
    for (const [ox, oy] of DIRS) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (seen.has(j) || !canWalk(j)) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  return seen;
}

describe('地图生成', () => {
  test('同一个种子生成同一张地图', () => {
    expect(generateMap(123)).toEqual(generateMap(123));
    expect(generateMap(123).map.terrain).not.toEqual(generateMap(124).map.terrain);
  });

  test.each(SEEDS)('种子 %i：尺寸、洛阳、城池、关卡、出生点都齐全', (seed) => {
    const { map, starts } = generateMap(seed);
    const N = CONFIG.mapSize;
    expect(map.size).toBe(N);
    expect(map.terrain.length).toBe(N * N);
    const luoyang = map.places.find((p) => p.name === '洛阳')!;
    expect([luoyang.x, luoyang.y]).toEqual([N / 2, N / 2]);
    expect(map.places.filter((p) => p.kind === 'pass').length).toBe(4);
    expect(map.places.filter((p) => p.kind !== 'pass').length).toBe(18);
    expect(starts.length).toBe(8);
    expect(new Set(starts.map((s) => s.state)).size).toBe(8);
    for (const s of starts) {
      expect(map.terrain[s.y * N + s.x]).toBe(Terrain.Plain);
      expect(map.state[s.y * N + s.x]).toBe(s.state);
    }
    // 两条河都至少有 4 个渡口
    expect(map.terrain.filter((t) => t === Terrain.Ferry).length).toBeGreaterThanOrEqual(8);
  });

  test.each(SEEDS)('种子 %i：司隶以外所有可占领的地连成一片，出生点都在其中', (seed) => {
    const { map, starts } = generateMap(seed);
    const N = map.size;
    const outside = (i: number) => map.state[i] !== 0 && isOccupiableTerrain(map.terrain[i]);
    const reach = flood(map, starts[0].y * N + starts[0].x, outside);
    const total = map.terrain.filter((_, i) => outside(i)).length;
    expect(reach.size).toBe(total);
    for (const s of starts) expect(reach.has(s.y * N + s.x)).toBe(true);
  });

  test.each(SEEDS)('种子 %i：不经过关卡进不了司隶', (seed) => {
    const { map, starts } = generateMap(seed);
    const N = map.size;
    const walkable = (i: number) => isOccupiableTerrain(map.terrain[i]) || map.terrain[i] === Terrain.City;
    const reach = flood(map, starts[0].y * N + starts[0].x, walkable);
    for (const i of reach) expect(map.state[i]).not.toBe(0);
    // 经过关卡则可以到达洛阳旁边
    const withPass = flood(map, starts[0].y * N + starts[0].x, (i) => walkable(i) || map.terrain[i] === Terrain.Pass);
    expect(withPass.has((N / 2) * N + N / 2 + 1)).toBe(true);
  });

  test.each(SEEDS)('种子 %i：越靠近洛阳土地等级越高', (seed) => {
    const { map } = generateMap(seed);
    const N = map.size;
    const sum = [0, 0, 0];
    const cnt = [0, 0, 0];
    for (let i = 0; i < N * N; i++) {
      if (map.terrain[i] !== Terrain.Plain) continue;
      const d = Math.hypot((i % N) - N / 2, Math.floor(i / N) - N / 2);
      const band = d < 12 ? 0 : d < 26 ? 1 : 2;
      sum[band] += map.level[i];
      cnt[band]++;
      expect(map.level[i]).toBeGreaterThanOrEqual(1);
      expect(map.level[i]).toBeLessThanOrEqual(9);
    }
    const avg = sum.map((s, k) => s / cnt[k]);
    expect(avg[0]).toBeGreaterThan(avg[1]);
    expect(avg[1]).toBeGreaterThan(avg[2]);
    // 九级地只出现在司隶
    for (let i = 0; i < N * N; i++) {
      if (map.terrain[i] === Terrain.Plain && map.level[i] >= 8) expect(map.state[i]).toBe(0);
    }
  });

  test('出生点周围一圈是 1~2 级地', () => {
    const { map, starts } = generateMap(5);
    const N = map.size;
    for (const s of starts) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const i = (s.y + oy) * N + s.x + ox;
          expect(map.terrain[i]).toBe(Terrain.Plain);
          expect(map.level[i]).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});
