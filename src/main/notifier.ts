import { Notification } from 'electron';
import { logInfo } from './log';

export interface NoticeOptions {
  /** Page of the app a click opens. */
  page?: string;
  silent?: boolean;
  /** Shown even when the user turned notifications off: the app cannot do its job otherwise. */
  always?: boolean;
}

/** System notifications that respect the user's setting and lead back into the app. */
export class Notifier {
  /** Without a reference a notification is collected, and a click on it is lost. */
  private readonly shown = new Set<Notification>();

  constructor(private readonly enabled: () => boolean, private readonly open: (page: string) => void) {}

  show(title: string, body: string, options: NoticeOptions = {}): void {
    logInfo(`Notification: ${title} — ${body}`);
    if (!Notification.isSupported() || (!options.always && !this.enabled())) return;
    const notification = new Notification({ title, body, silent: options.silent ?? false });
    const { page } = options;
    const forget = (): void => { this.shown.delete(notification); };
    notification.on('click', () => {
      forget();
      if (page) this.open(page);
    });
    notification.on('close', forget);
    notification.on('failed', forget);
    this.remember(notification);
    notification.show();
  }

  /** Not every system reports a closed notification: keep the latest few, not all of them. */
  private remember(notification: Notification): void {
    this.shown.add(notification);
    for (const old of this.shown) {
      if (this.shown.size <= 8) break;
      this.shown.delete(old);
    }
  }
}
