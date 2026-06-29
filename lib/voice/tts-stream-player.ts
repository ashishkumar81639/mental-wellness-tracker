/**
 * Plays a stream of text chunks as continuous speech with minimal latency.
 *
 * Sentences are enqueued as they become available. The player synthesizes them
 * one at a time (serially, to preserve order) but schedules playback on the
 * AudioContext timeline — so while sentence N is playing, sentence N+1 is
 * already being synthesized. Clips are scheduled back-to-back via a running
 * `nextStartTime` cursor, giving gapless playback.
 *
 * The pipeline: LLM tokens → sentences → synthesize → schedule. The user hears
 * the first sentence within ~1–2s instead of waiting for the entire reply to
 * generate and synthesize.
 */
export interface TtsStreamPlayerOptions {
  context: AudioContext;
  /** Synthesize one chunk to encoded audio bytes. Return null to skip it. */
  synthesize: (text: string) => Promise<ArrayBuffer | null>;
}

export class TtsStreamPlayer {
  private readonly context: AudioContext;
  private readonly synthesize: (text: string) => Promise<ArrayBuffer | null>;

  private queue: string[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private pumping = false;
  private cancelled = false;
  private ended = false;
  private finished = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;

  private readonly idle: Promise<void>;
  private resolveIdle!: () => void;

  constructor(opts: TtsStreamPlayerOptions) {
    this.context = opts.context;
    this.synthesize = opts.synthesize;
    this.idle = new Promise<void>((resolve) => {
      this.resolveIdle = resolve;
    });
  }

  /** Queue a chunk for synthesis + playback. */
  enqueue(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.cancelled || this.ended) return;
    this.queue.push(trimmed);
    void this.pump();
  }

  /**
   * Signal that no more chunks will be enqueued. Resolves once every queued
   * chunk has finished synthesizing and playing.
   */
  end(): Promise<void> {
    this.ended = true;
    void this.pump();
    this.armWatchdog();
    this.maybeResolveIdle();
    return this.idle;
  }

  /** Stop immediately: drop the queue and kill any playing audio. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.queue = [];
    for (const src of this.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.finish();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.cancelled) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const text = this.queue.shift() as string;
        const bytes = await this.synthesize(text);
        if (this.cancelled) return;
        if (!bytes) continue;
        let buffer: AudioBuffer;
        try {
          buffer = await this.context.decodeAudioData(bytes);
        } catch {
          continue; // skip an undecodable clip rather than stalling the stream
        }
        if (this.cancelled) return;
        this.schedule(buffer);
      }
    } finally {
      this.pumping = false;
    }
    this.maybeResolveIdle();
  }

  private schedule(buffer: AudioBuffer): void {
    const startAt = Math.max(this.context.currentTime, this.nextStartTime);
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    src.connect(this.context.destination);
    src.onended = () => {
      this.sources.delete(src);
      this.maybeResolveIdle();
    };
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(src);
    this.armWatchdog();
  }

  private maybeResolveIdle(): void {
    if (
      this.ended &&
      !this.pumping &&
      this.queue.length === 0 &&
      this.sources.size === 0
    ) {
      this.finish();
    }
  }

  /**
   * Safety net: resolve when playback *should* be done, even if an `onended`
   * event is dropped — otherwise the caller could hang in "speaking" forever.
   * Re-armed on every scheduled clip and on end(); the normal onended path
   * (maybeResolveIdle) usually wins the race.
   */
  private armWatchdog(): void {
    if (this.finished) return;
    if (this.watchdog) clearTimeout(this.watchdog);
    const remainingMs = Math.max(0, this.nextStartTime - this.context.currentTime) * 1000;
    this.watchdog = setTimeout(() => {
      // Only fire once nothing more is pending; otherwise let it be re-armed.
      if (this.ended && !this.pumping && this.queue.length === 0) this.finish();
    }, remainingMs + 1_000);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    this.resolveIdle();
  }
}
