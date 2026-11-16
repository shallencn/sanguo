// 土地等级表：1~9 级。
// yieldPerMin：占领后每分钟产出（产出的资源种类由地块自己的类型决定）
// fame：第一次占领这块地时获得的声望
// 守军强度在第二阶段加入。

export interface LandLevelDef {
  level: number;
  name: string;
  yieldPerMin: number;
  fame: number;
}

export const LAND_LEVELS: LandLevelDef[] = [
  { level: 1, name: '一级', yieldPerMin: 6, fame: 10 },
  { level: 2, name: '二级', yieldPerMin: 10, fame: 20 },
  { level: 3, name: '三级', yieldPerMin: 16, fame: 30 },
  { level: 4, name: '四级', yieldPerMin: 24, fame: 40 },
  { level: 5, name: '五级', yieldPerMin: 34, fame: 50 },
  { level: 6, name: '六级', yieldPerMin: 46, fame: 60 },
  { level: 7, name: '七级', yieldPerMin: 60, fame: 70 },
  { level: 8, name: '八级', yieldPerMin: 76, fame: 80 },
  { level: 9, name: '九级', yieldPerMin: 95, fame: 90 },
];

export function landLevel(level: number): LandLevelDef {
  return LAND_LEVELS[Math.max(1, Math.min(9, level)) - 1];
}
