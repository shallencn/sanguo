// 建筑规则：花费、耗时、前置条件、效果汇总。

import { BUILDINGS, EFFECTS, HALL_ID, buildingDef, type BuildingDef, type EffectKey } from '../data/buildings';
import { CONFIG } from '../data/config';
import { ALL_RESOURCES, resourceDef, type ResourceId, type Resources } from '../data/resources';
import { addLog } from './log';
import type { GameState } from './types';

/** 升到 toLevel 级的花费 */
export function upgradeCost(def: BuildingDef, toLevel: number): Partial<Resources> {
  const mult = Math.pow(def.costGrowth, toLevel - 1);
  const cost: Partial<Resources> = {};
  for (const id of ALL_RESOURCES) {
    const base = def.baseCost[id];
    if (base) cost[id] = Math.round((base * mult) / 10) * 10;
  }
  return cost;
}

/** 升到 toLevel 级的耗时（秒） */
export function upgradeTime(def: BuildingDef, toLevel: number): number {
  return Math.round(def.baseTime * Math.pow(def.timeGrowth, toLevel - 1));
}

/** 升到 toLevel 级需要的议政厅等级 */
export function requiredHall(def: BuildingDef, toLevel: number): number {
  if (def.id === HALL_ID) return 0;
  if (def.hallLevels) return def.hallLevels[toLevel - 1] ?? toLevel;
  return toLevel;
}

/** 某个建筑在指定等级时，某项效果的数值 */
export function effectAt(def: BuildingDef, key: EffectKey, lv: number): number {
  let total = 0;
  for (const e of def.effects) {
    if (e.key !== key || lv <= 0) continue;
    if (e.values) total += e.values[Math.min(lv, e.values.length) - 1];
    else total += (e.perLevel ?? 0) * lv;
  }
  return total;
}

/** 所有建筑加起来的某项效果（含基础值） */
export function effectTotal(state: GameState, key: EffectKey): number {
  let total = EFFECTS[key].base;
  for (const def of BUILDINGS) total += effectAt(def, key, state.buildings[def.id] ?? 0);
  return total;
}

/** 建筑当前等级；如果正在升级，pending 是升级完成后的等级 */
export function buildingLevel(state: GameState, id: string): number {
  return state.buildings[id] ?? 0;
}

export function isUpgrading(state: GameState, id: string): boolean {
  return state.buildQueue.some((t) => t.building === id);
}

export function canAfford(res: Resources, cost: Partial<Resources>): boolean {
  return ALL_RESOURCES.every((id) => res[id] >= (cost[id] ?? 0));
}

export function lackingResources(res: Resources, cost: Partial<Resources>): ResourceId[] {
  return ALL_RESOURCES.filter((id) => res[id] < (cost[id] ?? 0));
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export function checkUpgrade(state: GameState, id: string): Check {
  const def = buildingDef(id);
  const lv = buildingLevel(state, id);
  if (lv >= def.maxLevel) return { ok: false, reason: '已满级' };
  if (isUpgrading(state, id)) return { ok: false, reason: '升级中' };
  const need = requiredHall(def, lv + 1);
  if (buildingLevel(state, HALL_ID) < need) return { ok: false, reason: `需要议政厅 ${need} 级` };
  if (state.buildQueue.length >= CONFIG.buildQueueSize) return { ok: false, reason: '建造队列已满' };
  const cost = upgradeCost(def, lv + 1);
  const lack = lackingResources(state.resources, cost);
  if (lack.length > 0) return { ok: false, reason: `${lack.map((r) => resourceDef(r).name).join('、')}不足` };
  return { ok: true };
}

export function startUpgrade(state: GameState, id: string): Check {
  const check = checkUpgrade(state, id);
  if (!check.ok) return check;
  const def = buildingDef(id);
  const toLevel = buildingLevel(state, id) + 1;
  const cost = upgradeCost(def, toLevel);
  for (const r of ALL_RESOURCES) state.resources[r] -= cost[r] ?? 0;
  state.buildQueue.push({
    building: id,
    toLevel,
    start: state.time,
    end: state.time + upgradeTime(def, toLevel),
  });
  return { ok: true };
}

/** 完成已经到时间的建造 */
export function finishBuilds(state: GameState): void {
  const done = state.buildQueue.filter((t) => t.end <= state.time);
  if (done.length === 0) return;
  state.buildQueue = state.buildQueue.filter((t) => t.end > state.time);
  for (const t of done) {
    state.buildings[t.building] = t.toLevel;
    addLog(state, `${buildingDef(t.building).name}升到 ${t.toLevel} 级`, 'good');
  }
}
