import { formsFor, isOrder, ROUND_CONFIG, SPEED, URL_PARAMS, type Form, type Order } from '@/config'
import { openParticipantChannel, type Command, type Phase } from '@/data/live'
import { SessionLogger, type AnswerRow } from '@/data/logger'
import { MicDetector, type Calibration } from './MicDetector'
import { RoundRunner, type TwinState } from './RoundRunner'

const IDLE_STATE: TwinState = { health: ROUND_CONFIG.startHealth, pulse: 0, listening: false }

/**
 * One participant session: owns the mic, the logger, the live link to
 * the admin panel and the current round. React drives it through the
 * phase transitions; it never touches the DOM.
 */
export class StudySession {
  readonly id: string
  readonly code: string | null
  order: Order
  imaginedPerson: string | null = null
  phase: Phase = 'start'
  /** 1 or 2 while in or after a round. */
  round = 0
  runner: RoundRunner | null = null

  readonly mic = new MicDetector(ROUND_CONFIG.minTalkSec)
  readonly logger: SessionLogger
  private live: ReturnType<typeof openParticipantChannel> = null
  private statusTimer = 0
  private wakeLock: WakeLockSentinel | null = null
  private simulatedTalk = false
  private simulatedStart = 0
  private onRoundEnd: (() => void) | null = null

  constructor() {
    this.id = URL_PARAMS.session ?? crypto.randomUUID()
    this.code = URL_PARAMS.code
    this.order = URL_PARAMS.order ?? (Math.random() < 0.5 ? 'plant-orb' : 'orb-plant')
    this.logger = new SessionLogger(this.id)

    this.mic.onListening = () => this.syncListening()
    this.mic.onTalk = ({ startMs, durationSec }) => this.runner?.logTalk(startMs, durationSec)
  }

  get forms(): [Form, Form] {
    return formsFor(this.order)
  }

  get form(): Form | null {
    return this.round ? this.forms[this.round - 1] : null
  }

  /** State the scene renders (idle defaults outside a round). */
  get state(): TwinState {
    return this.runner?.state ?? IDLE_STATE
  }

  /** Start pressed: register the session and learn the order. */
  async begin(imaginedPerson: string) {
    this.imaginedPerson = imaginedPerson.trim() || null
    const order = await this.logger.startSession({
      p_id: this.id,
      p_code: this.code,
      p_order: URL_PARAMS.order,
      p_imagined: this.imaginedPerson,
    })
    if (isOrder(order)) this.order = order
    this.connect()
  }

  /**
   * Open the live link to the admin panel (safe to call more than once).
   * Called as soon as the page opens, so the researcher sees the start screen too.
   */
  connect() {
    if (this.live) return
    this.live = openParticipantChannel(this.id, this.handleCommand)
    this.statusTimer = window.setInterval(() => this.sendStatus(), 1000)
  }

  saveCalibration(calibration: Calibration) {
    this.logger.event({
      session_id: this.id,
      round: 0,
      form: null,
      type: 'calibration',
      t_sec: null,
      meta: { ...calibration },
    })
  }

  startRound(round: 1 | 2, onEnd: () => void) {
    this.round = round
    this.onRoundEnd = onEnd
    const form = this.forms[round - 1]
    this.runner?.stop()
    this.runner = new RoundRunner({
      config: ROUND_CONFIG,
      speed: SPEED,
      onEvent: (event) => {
        this.logger.event({ session_id: this.id, round, form, ...event })
        if (event.type !== 'health') this.live?.event({ round, ...event })
        if (event.type === 'round_end') this.logger.flushSoon()
      },
      onEnd: () => {
        this.releaseWakeLock()
        this.onRoundEnd?.()
      },
    })
    this.runner.start()
    this.syncListening()
    void this.requestWakeLock()
  }

  submitAnswers(round: number, form: Form | null, values: Record<string, string>) {
    const rows: AnswerRow[] = Object.entries(values).map(([question_id, value]) => ({
      session_id: this.id,
      round,
      form,
      question_id,
      value,
    }))
    this.logger.answers(rows)
  }

  setPhase(phase: Phase) {
    this.phase = phase
    this.sendStatus()
  }

  /** Debug only: hold Space to "talk" without a microphone. */
  simulateTalk(down: boolean) {
    if (down === this.simulatedTalk) return
    this.simulatedTalk = down
    const now = performance.now()
    if (down) this.simulatedStart = now
    else this.runner?.logTalk(this.simulatedStart, (now - this.simulatedStart) / 1000)
    this.syncListening()
  }

  dispose() {
    clearInterval(this.statusTimer)
    this.runner?.stop()
    this.mic.stop()
    this.live?.close()
    this.logger.dispose()
    this.releaseWakeLock()
  }

  /** Stop the mic once the rounds are done. */
  stopMic() {
    this.mic.stop()
  }

  private syncListening() {
    this.runner?.setListening(this.mic.listening || this.simulatedTalk)
  }

  private handleCommand = (command: Command) => {
    const runner = this.runner
    if (!runner || this.phase !== 'round') return
    if (command === 'pulse') runner.triggerPulse('manual')
    if (command === 'wither') runner.triggerWither('manual')
    if (command === 'skip') runner.skip()
    if (command === 'restart') runner.restart()
  }

  private sendStatus() {
    const inRound = this.phase === 'round' && this.runner
    this.live?.status({
      phase: this.phase,
      round: this.round || null,
      form: this.form,
      t: inRound ? Math.round(this.runner!.t) : null,
      health: inRound ? Math.round(this.runner!.state.health * 1000) / 1000 : null,
      pulse: inRound ? Math.round(this.runner!.state.pulse * 1000) / 1000 : null,
      listening: inRound ? this.runner!.state.listening : false,
      pending: this.logger.pending,
    })
  }

  /** Keep the screen awake during a round with no input. */
  private async requestWakeLock() {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Not supported or denied: the researcher should disable sleep instead.
    }
  }

  private releaseWakeLock() {
    void this.wakeLock?.release().catch(() => {})
    this.wakeLock = null
  }
}
