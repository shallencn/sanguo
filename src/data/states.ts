// 州与城池、关卡。地图形状是示意性的，不追求真实地理。
// dir：这个州相对洛阳的方向（x 向东为正，y 向南为正）；司隶在正中，没有方向。

export interface StateDef {
  id: number;
  name: string;
  dir: [number, number] | null;
  /** 州府（大城） */
  capital: string;
  /** 郡城（小城） */
  town: string;
}

// 外围 8 个州的顺序按方位角排列：东、东南、南、西南、西、西北、北、东北。
export const STATES: StateDef[] = [
  { id: 0, name: '司隶', dir: null, capital: '洛阳', town: '长安' },
  { id: 1, name: '徐州', dir: [1, 0], capital: '下邳', town: '琅琊' },
  { id: 2, name: '扬州', dir: [1, 1], capital: '建业', town: '柴桑' },
  { id: 3, name: '荆州', dir: [0, 1], capital: '襄阳', town: '江陵' },
  { id: 4, name: '益州', dir: [-1, 1], capital: '成都', town: '汉中' },
  { id: 5, name: '凉州', dir: [-1, 0], capital: '武威', town: '天水' },
  { id: 6, name: '并州', dir: [-1, -1], capital: '晋阳', town: '上党' },
  { id: 7, name: '冀州', dir: [0, -1], capital: '邺城', town: '南皮' },
  { id: 8, name: '幽州', dir: [1, -1], capital: '蓟城', town: '北平' },
];

/** 环绕司隶的四座关卡，dir 是关卡相对洛阳的方向 */
export const PASSES: { name: string; dir: [number, number] }[] = [
  { name: '虎牢关', dir: [1, 0] },
  { name: '伊阙关', dir: [0, 1] },
  { name: '函谷关', dir: [-1, 0] },
  { name: '孟津关', dir: [0, -1] },
];

/** 两条大河的名字（北、南） */
export const RIVER_NAMES = ['黄河', '长江'];
