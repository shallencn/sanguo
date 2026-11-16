import type { GameState, LogEntry } from './types';

const MAX_LOG = 60;

export function addLog(state: GameState, text: string, kind: LogEntry['kind'] = 'info'): void {
  state.log.push({ time: state.time, text, kind });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}
