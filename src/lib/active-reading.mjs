/**
 * Keep reading-time measurement independent from wall-clock time. A background
 * tab or an unfocused window must not turn a page view into a qualified read.
 *
 * @param {boolean} active
 * @param {number} nowMs
 */
export function createActiveReadingState(active, nowMs) {
  return {
    accumulatedMs: 0,
    activeSinceMs: active ? finiteTime(nowMs) : null,
  }
}

/**
 * @param {{ accumulatedMs: number, activeSinceMs: number | null }} state
 * @param {boolean} active
 * @param {number} nowMs
 */
export function transitionActiveReading(state, active, nowMs) {
  const now = finiteTime(nowMs)
  const accumulatedMs = elapsedReadingMs(state, now)
  return {
    accumulatedMs,
    activeSinceMs: active ? now : null,
  }
}

/**
 * @param {{ accumulatedMs: number, activeSinceMs: number | null }} state
 * @param {number} nowMs
 */
export function activeReadingSeconds(state, nowMs) {
  return Math.floor(elapsedReadingMs(state, finiteTime(nowMs)) / 1_000)
}

function elapsedReadingMs(state, nowMs) {
  const accumulated = Math.max(0, finiteTime(state.accumulatedMs))
  if (state.activeSinceMs === null) return accumulated
  return accumulated + Math.max(0, nowMs - finiteTime(state.activeSinceMs))
}

function finiteTime(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0
}
