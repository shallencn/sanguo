// 全局数值配置。改这里的数字就能调整游戏节奏，改完记得同步 docs/设计.md。

export const CONFIG = {
  /** 地图边长（格） */
  mapSize: 80,

  /** 开局资源 */
  initialResources: { wood: 1500, iron: 1500, stone: 1500, grain: 1500, copper: 500 },
  /** 主城自带的基础产量（每分钟） */
  baseYieldPerMin: { wood: 30, iron: 30, stone: 30, grain: 30, copper: 10 },
  /** 没有府库时的资源上限（铜币不设上限） */
  baseStorage: 5000,

  /** 行军：每格耗时（秒）与最短耗时（秒）。去程和回程各算一次。 */
  marchSecondsPerTile: 1.5,
  marchMinSeconds: 3,

  /** 领地上限 = 基础值 + 声望 ÷ famePerCap（向下取整），不超过 territoryCapMax */
  territoryCapBase: 8,
  famePerCap: 60,
  territoryCapMax: 300,

  /** 同时进行的建造数量 */
  buildQueueSize: 2,
  /** 没有点将台时的队伍数 */
  baseTeams: 1,

  /** 时间倍速档位（0 = 暂停） */
  speeds: [0, 1, 5, 20],
  /** 自动存档间隔（现实秒） */
  autosaveSeconds: 10,
} as const;
