// 领地规则：相邻才能出征、领地上限、行军、占领、放弃。

import { CONFIG } from '../data/config';
import { landLevel } from '../data/lands';
import { LAND_RESOURCES, resourceDef } from '../data/resources';
import { STATES } from '../data/states';
import { effectTotal, type Check } from './buildings';
import { addLog } from './log';
import { PLAYER, Terrain, type GameMap, type GameState, type March } from './types';

const DIRS4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function tileIndex(map: GameMap, x: number, y: number): number {
  return y * map.size + x;
}

export function inMap(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.size && y < map.size;
}

/** 这种地形现在能不能被占领（城池、关卡要到第四阶段） */
export function isOccupiable(terrain: number): boolean {
  return terrain === Terrain.Plain || terrain === Terrain.Ferry;
}

/** 地块的名字，例如"三级农田""渡口""虎牢关" */
export function tileName(map: GameMap, x: number, y: number): string {
  const i = tileIndex(map, x, y);
  const t = map.terrain[i];
  if (t === Terrain.Mountain) return '山地';
  if (t === Terrain.River) return '河流';
  if (t === Terrain.Ferry) return `${landLevel(map.level[i]).name}渡口`;
  if (t === Terrain.Base) return '主城';
  if (t === Terrain.City || t === Terrain.Pass) {
    return map.places.find((p) => p.x === x && p.y === y)?.name ?? '城池';
  }
  return `${landLevel(map.level[i]).name}${resourceDef(LAND_RESOURCES[map.res[i]]).landName}`;
}

/** 带州名和坐标的完整称呼，写日志用 */
export function tileFullName(map: GameMap, x: number, y: number): string {
  return `${STATES[map.state[tileIndex(map, x, y)]].name}${tileName(map, x, y)}(${x},${y})`;
}

/** (x,y) 的上下左右是否有 owner 的领地 */
export function isAdjacentTo(map: GameMap, x: number, y: number, owner: number): boolean {
  for (const [ox, oy] of DIRS4) {
    const nx = x + ox;
    const ny = y + oy;
    if (inMap(map, nx, ny) && map.owner[tileIndex(map, nx, ny)] === owner) return true;
  }
  return false;
}

/** 玩家的领地数量（不含主城） */
export function territoryCount(state: GameState): number {
  const { owner, terrain } = state.map;
  let n = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] === PLAYER && terrain[i] !== Terrain.Base) n++;
  }
  return n;
}

/** 领地上限 = 基础值 + 声望 ÷ famePerCap */
export function territoryCap(state: GameState): number {
  return Math.min(CONFIG.territoryCapMax, CONFIG.territoryCapBase + Math.floor(state.fame / CONFIG.famePerCap));
}

/** 队伍数量（同时能派出几路行军） */
export function teamCount(state: GameState): number {
  return CONFIG.baseTeams + effectTotal(state, 'teams');
}

export function idleTeams(state: GameState): number {
  return teamCount(state) - state.marches.length;
}

/** 从主城到 (x,y) 的单程行军时间（秒） */
export function marchSeconds(state: GameState, x: number, y: number): number {
  const base = state.factions[PLAYER];
  const d = Math.hypot(x - base.baseX, y - base.baseY);
  return Math.max(CONFIG.marchMinSeconds, Math.round(d * CONFIG.marchSecondsPerTile));
}

/** 能不能对 (x,y) 出征 */
export function checkAttack(state: GameState, x: number, y: number): Check {
  const map = state.map;
  if (!inMap(map, x, y)) return { ok: false, reason: '超出地图' };
  const i = tileIndex(map, x, y);
  const t = map.terrain[i];
  if (map.owner[i] === PLAYER) return { ok: false, reason: '已是我方领地' };
  if (t === Terrain.Mountain || t === Terrain.River) return { ok: false, reason: '此地无法通行' };
  if (t === Terrain.City || t === Terrain.Pass) return { ok: false, reason: '城池与关卡将在第四阶段开放' };
  if (map.owner[i] !== -1) return { ok: false, reason: '其他势力的领地将在第四阶段开放' };
  if (!isAdjacentTo(map, x, y, PLAYER)) return { ok: false, reason: '不与我方领地相邻' };
  if (state.marches.some((m) => m.phase === 'go' && m.x === x && m.y === y)) {
    return { ok: false, reason: '已有队伍正在前往' };
  }
  if (idleTeams(state) <= 0) return { ok: false, reason: '没有空闲队伍' };
  const pending = state.marches.filter((m) => m.phase === 'go').length;
  if (territoryCount(state) + pending >= territoryCap(state)) {
    return { ok: false, reason: '领地已达上限（提升声望或放弃低级地）' };
  }
  return { ok: true };
}

/** 派一支队伍出征 */
export function dispatch(state: GameState, x: number, y: number): Check {
  const check = checkAttack(state, x, y);
  if (!check.ok) return check;
  const secs = marchSeconds(state, x, y);
  const march: March = {
    id: state.nextMarchId++,
    x,
    y,
    start: state.time,
    arrive: state.time + secs,
    back: state.time + secs * 2,
    phase: 'go',
  };
  state.marches.push(march);
  return { ok: true };
}

/** 处理已经到时间的行军：到达目的地 → 占领；回到主城 → 队伍空闲 */
export function updateMarches(state: GameState): void {
  const map = state.map;
  for (const m of state.marches) {
    if (m.phase !== 'go' || m.arrive > state.time) continue;
    m.phase = 'back';
    const i = tileIndex(map, m.x, m.y);
    const name = tileFullName(map, m.x, m.y);
    // 第一阶段的临时规则：到达即占领。第二阶段起这里改为与守军战斗。
    if (map.owner[i] !== -1 || !isOccupiable(map.terrain[i])) {
      m.result = 'fail';
      addLog(state, `出征${name}失败：此地已被占领`, 'bad');
    } else if (!isAdjacentTo(map, m.x, m.y, PLAYER)) {
      m.result = 'fail';
      addLog(state, `出征${name}失败：已不与我方领地相邻`, 'bad');
    } else if (territoryCount(state) >= territoryCap(state)) {
      m.result = 'fail';
      addLog(state, `出征${name}失败：领地已达上限`, 'bad');
    } else {
      m.result = 'ok';
      map.owner[i] = PLAYER;
      let text = `占领${name}`;
      if (!map.famed[i]) {
        map.famed[i] = 1;
        const fame = landLevel(map.level[i]).fame;
        state.fame += fame;
        text += `，声望 +${fame}`;
      }
      addLog(state, text, 'good');
    }
  }
  state.marches = state.marches.filter((m) => m.back > state.time);
}

export function checkAbandon(state: GameState, x: number, y: number): Check {
  const map = state.map;
  const i = tileIndex(map, x, y);
  if (map.owner[i] !== PLAYER) return { ok: false, reason: '不是我方领地' };
  if (map.terrain[i] === Terrain.Base) return { ok: false, reason: '主城不能放弃' };
  return { ok: true };
}

/** 放弃一块地（立即生效，声望不退） */
export function abandon(state: GameState, x: number, y: number): Check {
  const check = checkAbandon(state, x, y);
  if (!check.ok) return check;
  const map = state.map;
  map.owner[tileIndex(map, x, y)] = -1;
  addLog(state, `放弃${tileFullName(map, x, y)}`, 'info');
  return { ok: true };
}
