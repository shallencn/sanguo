// 势力。0 号永远是玩家；其余是电脑势力（第四阶段才会行动，目前只是驻扎在地图上）。
// 电脑势力的名字跟着出生的州走：每个州有一支当地的势力，开局时从中随机挑 AI_FACTION_COUNT 支。

export interface FactionDef {
  name: string;
  color: string;
}

export const PLAYER_FACTION: FactionDef = { name: '义军', color: '#e0503c' };

/** 每局有几个电脑势力 */
export const AI_FACTION_COUNT = 4;

/** 州编号 → 在这个州起兵的电脑势力 */
export const AI_FACTION_BY_STATE: Record<number, FactionDef> = {
  1: { name: '泰山军', color: '#4fc3c7' }, // 徐州
  2: { name: '山越', color: '#7fd04f' }, // 扬州
  3: { name: '黄巾军', color: '#e8cf3a' }, // 荆州
  4: { name: '东州兵', color: '#f08a3c' }, // 益州
  5: { name: '西凉军', color: '#a56bd6' }, // 凉州
  6: { name: '白波军', color: '#eeeeee' }, // 并州
  7: { name: '黑山军', color: '#4f7fd0' }, // 冀州
  8: { name: '乌桓', color: '#e58ac0' }, // 幽州
};
