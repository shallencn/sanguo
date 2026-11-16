// 主城建筑表。
//
// 升到第 L 级的花费 = baseCost × costGrowth^(L-1)，四舍五入到 10
// 升到第 L 级的耗时 = baseTime × timeGrowth^(L-1) 秒
// 效果：写 perLevel 表示"每级增加多少"；写 values 表示"每一级的具体数值"（第 1 个数对应 1 级）。
// 前置：默认要求 议政厅等级 ≥ 目标等级；写了 hallLevels 则按表里的数字要求。
//
// 想加新建筑：照着格式加一项即可，界面会自动显示。

import type { Resources } from './resources';

export type EffectKey =
  | 'yield.wood'
  | 'yield.iron'
  | 'yield.stone'
  | 'yield.grain'
  | 'yield.copper'
  | 'storage'
  | 'teams'
  | 'troopCap'
  | 'reserveCap'
  | 'recruitSpeed'
  | 'wallDefense'
  | 'garrison';

export interface EffectInfo {
  label: string;
  unit: string;
  /** 0 级（没有任何建筑加成）时的基础值 */
  base: number;
}

export const EFFECTS: Record<EffectKey, EffectInfo> = {
  'yield.wood': { label: '木材产量', unit: '/分', base: 0 },
  'yield.iron': { label: '铁矿产量', unit: '/分', base: 0 },
  'yield.stone': { label: '石料产量', unit: '/分', base: 0 },
  'yield.grain': { label: '粮草产量', unit: '/分', base: 0 },
  'yield.copper': { label: '铜币产量', unit: '/分', base: 0 },
  storage: { label: '资源上限', unit: '', base: 0 },
  teams: { label: '队伍数量', unit: '队', base: 0 },
  troopCap: { label: '单队带兵上限', unit: '', base: 1000 },
  reserveCap: { label: '预备兵上限', unit: '', base: 2000 },
  recruitSpeed: { label: '征兵速度', unit: '/分', base: 100 },
  wallDefense: { label: '城防值', unit: '', base: 0 },
  garrison: { label: '守军兵力', unit: '', base: 0 },
};

export interface BuildingEffect {
  key: EffectKey;
  perLevel?: number;
  values?: number[];
}

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  /** 开局等级，不写为 0 */
  initialLevel?: number;
  baseCost: Partial<Resources>;
  costGrowth: number;
  baseTime: number;
  timeGrowth: number;
  /** 升到第 n 级需要的议政厅等级（第 1 个数对应升到 1 级） */
  hallLevels?: number[];
  effects: BuildingEffect[];
  /** 效果还没接入玩法时的提示 */
  pending?: string;
}

export const HALL_ID = 'hall';

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hall',
    name: '议政厅',
    desc: '主城的核心。其他建筑的等级不能超过议政厅。',
    maxLevel: 10,
    initialLevel: 1,
    baseCost: { wood: 300, iron: 200, stone: 400, grain: 200 },
    costGrowth: 1.5,
    baseTime: 10,
    timeGrowth: 1.5,
    effects: [
      { key: 'yield.wood', perLevel: 4 },
      { key: 'yield.iron', perLevel: 4 },
      { key: 'yield.stone', perLevel: 4 },
      { key: 'yield.grain', perLevel: 4 },
    ],
  },
  {
    id: 'storehouse',
    name: '府库',
    desc: '提高木、铁、石、粮的存放上限。',
    maxLevel: 10,
    baseCost: { wood: 200, stone: 200 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [
      { key: 'storage', values: [4000, 9000, 15000, 22000, 30000, 40000, 52000, 66000, 82000, 100000] },
    ],
  },
  {
    id: 'lumber',
    name: '伐木场',
    desc: '增加木材产量。',
    maxLevel: 10,
    baseCost: { iron: 120, stone: 160, grain: 80 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [{ key: 'yield.wood', perLevel: 12 }],
  },
  {
    id: 'smelter',
    name: '冶铁坊',
    desc: '增加铁矿产量。',
    maxLevel: 10,
    baseCost: { wood: 160, stone: 120, grain: 80 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [{ key: 'yield.iron', perLevel: 12 }],
  },
  {
    id: 'quarry',
    name: '采石场',
    desc: '增加石料产量。',
    maxLevel: 10,
    baseCost: { wood: 160, iron: 120, grain: 80 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [{ key: 'yield.stone', perLevel: 12 }],
  },
  {
    id: 'farm',
    name: '屯田所',
    desc: '增加粮草产量。',
    maxLevel: 10,
    baseCost: { wood: 120, iron: 80, stone: 160 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [{ key: 'yield.grain', perLevel: 12 }],
  },
  {
    id: 'market',
    name: '集市',
    desc: '产出铜币。',
    maxLevel: 10,
    baseCost: { wood: 200, stone: 150, grain: 150 },
    costGrowth: 1.5,
    baseTime: 6,
    timeGrowth: 1.5,
    effects: [{ key: 'yield.copper', perLevel: 8 }],
  },
  {
    id: 'rally',
    name: '点将台',
    desc: '增加可同时出征的队伍数量，最多 5 队。',
    maxLevel: 4,
    baseCost: { wood: 600, iron: 600, stone: 600, grain: 600, copper: 300 },
    costGrowth: 2.2,
    baseTime: 20,
    timeGrowth: 2,
    hallLevels: [2, 4, 6, 8],
    effects: [{ key: 'teams', perLevel: 1 }],
  },
  {
    id: 'barracks',
    name: '兵营',
    desc: '提高预备兵上限和征兵速度。',
    maxLevel: 10,
    baseCost: { wood: 250, iron: 250, grain: 200 },
    costGrowth: 1.5,
    baseTime: 8,
    timeGrowth: 1.5,
    effects: [
      { key: 'reserveCap', perLevel: 1500 },
      { key: 'recruitSpeed', perLevel: 40 },
    ],
    pending: '第二阶段加入征兵后生效',
  },
  {
    id: 'drill',
    name: '演武场',
    desc: '提高每支队伍能带的兵力上限。',
    maxLevel: 10,
    baseCost: { wood: 200, iron: 300, grain: 250, copper: 50 },
    costGrowth: 1.5,
    baseTime: 8,
    timeGrowth: 1.5,
    effects: [{ key: 'troopCap', perLevel: 600 }],
    pending: '第二阶段加入战斗后生效',
  },
  {
    id: 'wall',
    name: '城墙',
    desc: '提高主城的城防值。',
    maxLevel: 10,
    baseCost: { wood: 150, stone: 400 },
    costGrowth: 1.5,
    baseTime: 8,
    timeGrowth: 1.5,
    effects: [{ key: 'wallDefense', perLevel: 500 }],
    pending: '第四阶段加入电脑势力后生效',
  },
  {
    id: 'garrison',
    name: '戍卫营',
    desc: '增加主城守军兵力。',
    maxLevel: 10,
    baseCost: { iron: 200, stone: 150, grain: 250 },
    costGrowth: 1.5,
    baseTime: 8,
    timeGrowth: 1.5,
    effects: [{ key: 'garrison', perLevel: 800 }],
    pending: '第四阶段加入电脑势力后生效',
  },
];

export function buildingDef(id: string): BuildingDef {
  const def = BUILDINGS.find((b) => b.id === id);
  if (!def) throw new Error(`未知建筑：${id}`);
  return def;
}
