import { LESSON_BYTES, type Quality } from '@shared/types';
import { freeSpace } from './disk';

const EVERY = 5 * 60_000;

/** Warns once when the recordings folder runs out of room while a lesson is on. */
export class SpaceWatch {
  private timer: NodeJS.Timeout | null = null;
  private warned = false;

  constructor(
    private readonly target: () => { folder: string; quality: Quality },
    private readonly warn: () => void,
    private readonly free: (folder: string) => Promise<number | null> = freeSpace,
  ) {}

  /** Checks at once and then regularly while `active`; stops otherwise. */
  watch(active: boolean): void {
    if (active && !this.timer) {
      void this.check();
      this.timer = setInterval(() => void this.check(), EVERY);
    }
    if (!active && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async check(): Promise<void> {
    const { folder, quality } = this.target();
    const free = await this.free(folder);
    if (free === null) return;
    const low = free < 2 * LESSON_BYTES[quality];
    // Once per shortage: the next warning comes only after there was room again.
    if (low && !this.warned) this.warn();
    this.warned = low;
  }
}
