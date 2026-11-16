// 数字和时间的显示格式。

/** 整数，带千位分隔：12,345 */
export function fmtInt(n: number): string {
  return Math.floor(n + 1e-6).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 时长：45秒 / 2分05秒 / 1时02分 */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
  return `${Math.floor(s / 3600)}时${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}分`;
}

/** 倒计时：0:08 / 12:30 */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
