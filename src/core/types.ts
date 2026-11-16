// 游戏状态的数据结构（纯数据，不含任何界面内容）。

import type { Resources } from '../data/resources';

/** 地形编号 */
export const Terrain = {
  Plain: 0, // 平原（可占领的资源地）
  Mountain: 1, // 山地（不可通行）
  River: 2, // 河流（不可通行）
  Ferry: 3, // 渡口（可占领，用来过河）
  Pass: 4, // 关卡
  City: 5, // 城池
  Base: 6, // 势力主城
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export interface Place {
  kind: 'capital' | 'city' | 'town' | 'pass';
  name: string;
  x: number;
  y: number;
  state: number;
}

/** 地图：每个数组长度都是 size×size，下标 = y×size + x */
export interface GameMap {
  size: number;
  terrain: number[];
  /** 土地等级 1~9（山、河为 0） */
  level: number[];
  /** 资源类型 0~3，对应 LAND_RESOURCES */
  res: number[];
  /** 所属州的编号 */
  state: number[];
  /** 占领者的势力编号，-1 为无主 */
  owner: number[];
  /** 玩家是否曾经占领过（声望只在第一次占领时给） */
  famed: number[];
  places: Place[];
}

export interface Faction {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  baseX: number;
  baseY: number;
  /** 出生州 */
  state: number;
}

export interface BuildTask {
  building: string;
  toLevel: number;
  start: number;
  end: number;
}

export interface March {
  id: number;
  x: number;
  y: number;
  /** 出发时刻、到达时刻、回到主城时刻（游戏秒） */
  start: number;
  arrive: number;
  back: number;
  phase: 'go' | 'back';
  /** 到达后的结果 */
  result?: 'ok' | 'fail';
}

export interface LogEntry {
  time: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export interface GameState {
  version: number;
  seed: number;
  /** 游戏内已经过去的秒数 */
  time: number;
  /** 当前倍速（0 = 暂停） */
  speed: number;
  map: GameMap;
  /** 下标即势力编号，0 号是玩家 */
  factions: Faction[];
  resources: Resources;
  fame: number;
  /** 建筑 id → 等级 */
  buildings: Record<string, number>;
  buildQueue: BuildTask[];
  marches: March[];
  nextMarchId: number;
  log: LogEntry[];
}

export const PLAYER = 0;
