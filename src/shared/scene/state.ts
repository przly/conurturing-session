/**
 * Shared state model. Plant and orb read exactly these values;
 * only the visuals differ.
 */
export interface TwinState {
  /** 0–1: the object's energy. Never below `healthFloor`. */
  health: number
  /** 0–1: jumps to 1 on a partner signal, eases back to 0. */
  pulse: number
  /** Mic currently hears speech. */
  listening: boolean
  /**
   * 0–1: how loud the person is speaking right now, relative to their
   * calibration (normal speech ≈ 0.6). Drives visuals only, not health.
   */
  voice: number
}
