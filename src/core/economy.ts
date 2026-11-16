// 资源规则：产量、上限、随时间增长。

import { CONFIG } from '../data/config';
import { landLevel } from '../data/lands';
import { ALL_RESOURCES, LAND_RESOURCES, emptyResources, type ResourceId, type Resources } from '../data/resources';
import { effectTotal } from './buildings';
import { PLAYER, Terrain, type GameState } from './types';

/** 玩家领地的资源地每分钟总产量 */
export function landYields(state: GameState): Resources {
  const out = emptyResources();
  const { terrain, owner, level, res } = state.map;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== PLAYER || terrain[i] !== Terrain.Plain) continue;
    out[LAND_RESOURCES[res[i]]] += landLevel(level[i]).yieldPerMin;
  }
  return out;
}

/** 每分钟总产量 = 主城基础 + 建筑加成 + 领地 */
export function yieldRates(state: GameState): Resources {
  const lands = landYields(state);
  const out = emptyResources();
  for (const id of ALL_RESOURCES) {
    out[id] = CONFIG.baseYieldPerMin[id] + effectTotal(state, `yield.${id}`) + lands[id];
  }
  return out;
}

/** 资源上限（铜币没有上限） */
export function storageCap(state: GameState, id: ResourceId): number {
  if (id === 'copper') return Infinity;
  return CONFIG.baseStorage + effectTotal(state, 'storage');
}

/** 过了 seconds 秒，按产量增加资源，不超过上限。已经超出上限的部分（比如奖励）不会被扣掉。 */
export function produce(state: GameState, seconds: number): void {
  if (seconds <= 0) return;
  const rates = yieldRates(state);
  for (const id of ALL_RESOURCES) {
    const cap = storageCap(state, id);
    const cur = state.resources[id];
    if (cur >= cap) continue;
    state.resources[id] = Math.min(cap, cur + (rates[id] * seconds) / 60);
  }
}
