// 资源定义：四种基础资源 + 铜币。

export type ResourceId = 'wood' | 'iron' | 'stone' | 'grain' | 'copper';
export type Resources = Record<ResourceId, number>;

export interface ResourceDef {
  id: ResourceId;
  /** 显示名称 */
  name: string;
  /** 徽记上的单字 */
  glyph: string;
  /** 徽记颜色 */
  color: string;
  /** 这种资源地的名称（铜币没有资源地） */
  landName?: string;
}

export const RESOURCES: ResourceDef[] = [
  { id: 'wood', name: '木材', glyph: '木', color: '#6f8f52', landName: '林地' },
  { id: 'iron', name: '铁矿', glyph: '铁', color: '#7d8590', landName: '铁矿' },
  { id: 'stone', name: '石料', glyph: '石', color: '#a89f8c', landName: '石场' },
  { id: 'grain', name: '粮草', glyph: '粮', color: '#c9a544', landName: '农田' },
  { id: 'copper', name: '铜币', glyph: '铜', color: '#c07a3e' },
];

/** 资源地的四种类型，顺序即地图数据里的编号 0~3 */
export const LAND_RESOURCES: ResourceId[] = ['wood', 'iron', 'stone', 'grain'];
export const ALL_RESOURCES: ResourceId[] = ['wood', 'iron', 'stone', 'grain', 'copper'];

export function resourceDef(id: ResourceId): ResourceDef {
  return RESOURCES.find((r) => r.id === id)!;
}

export function emptyResources(): Resources {
  return { wood: 0, iron: 0, stone: 0, grain: 0, copper: 0 };
}
