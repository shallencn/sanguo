// 画布上用到的颜色和字体（网页元素的样式在 styles.css 里）。

export const FONT_BRUSH =
  '"STXingkai","华文行楷","Xingkai SC","STKaiti","华文楷体","KaiTi","楷体","Kaiti SC","AR PL UKai CN",serif';
export const FONT_TEXT = '"PingFang SC","Microsoft YaHei","微软雅黑","Noto Sans SC","WenQuanYi Zen Hei",sans-serif';

export const COLORS = {
  void: '#0f0c0a',
  gold: '#e3c27a',
  paper: '#efe3c6',
  ink: '#14100d',
  mountain: '#3f352c',
  mountainPeak: '#5d4f41',
  mountainSnow: '#8e8170',
  river: '#2f5766',
  riverWave: '#4f7f8f',
  plank: '#8a6a45',
  wall: '#7d6f5d',
  wallDark: '#4d4337',
  roof: '#8f2f22',
};

/** 资源地的底色：色相表示资源种类，等级越高颜色越深 */
export function landColor(res: number, level: number): string {
  const t = (level - 1) / 8;
  switch (res) {
    case 0: // 林地：橄榄绿
      return `hsl(90, ${20 + t * 6}%, ${41 - t * 14}%)`;
    case 1: // 铁矿：青灰
      return `hsl(205, ${6 + t * 4}%, ${45 - t * 15}%)`;
    case 2: // 石场：米灰
      return `hsl(36, ${13 + t * 3}%, ${60 - t * 18}%)`;
    default: // 农田：麦黄
      return `hsl(42, ${36 + t * 6}%, ${54 - t * 16}%)`;
  }
}
