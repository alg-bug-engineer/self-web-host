export type ActiveReadingState = {
  accumulatedMs: number
  activeSinceMs: number | null
}

export function createActiveReadingState(active: boolean, nowMs: number): ActiveReadingState
export function transitionActiveReading(
  state: ActiveReadingState,
  active: boolean,
  nowMs: number,
): ActiveReadingState
export function activeReadingSeconds(state: ActiveReadingState, nowMs: number): number
