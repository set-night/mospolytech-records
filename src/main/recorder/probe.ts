/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The page-side half of joining an MTS Link room. It only inspects the DOM and
 * reports what it sees; clicks and typing are sent by the main process as
 * trusted input events, which the room's UI cannot tell from a real user.
 */
export type Probe =
  | { state: 'joined'; leaveVisible: boolean }
  | { state: 'ended' | 'waiting' | 'loading'; text: string }
  | { state: 'fill'; x: number; y: number }
  | { state: 'click'; x: number; y: number; submit: boolean };

const PATTERNS = {
  ended: /Event (has )?(already )?ended|Мероприятие заверш|Вебинар заверш|Трансляция заверш/i,
  waiting: /ожида(?:йте|ние|ем|ет)|ждите|скоро начн|не нача(?:т|л)|ведущий не одобрил|waiting|wait.*(?:host|admission)|not.*started/i,
  leave: /Покинуть вебинар|Покинуть мероприятие|Выйти из вебинара|Leave (the )?(webinar|event|meeting)/i,
  join: /^(Join|Присоединиться|Войти|Подключиться|Войти в вебинар|Перейти к вебинару|Продолжить|Continue)$/i,
  name: /Your name|Ваше имя|Имя|Name/i,
};

/** Builds the probe expression; `nickname` is embedded as JSON, never as code. */
export function probeScript(nickname: string): string {
  const source = (patterns: Record<keyof typeof PATTERNS, string>, nick: string): Probe => {
    const re = (key: keyof typeof PATTERNS): RegExp => new RegExp(patterns[key], 'i');
    const text = (document.body?.innerText ?? '').slice(0, 20_000);
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const center = (element: Element): { x: number; y: number } => {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      // Marked so the main process can fall back to a DOM click (see `CLICK_TARGET`).
      for (const old of document.querySelectorAll('[data-mpr-target]')) old.removeAttribute('data-mpr-target');
      element.setAttribute('data-mpr-target', '');
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    const label = (element: Element): string => (element.getAttribute('aria-label') || element.getAttribute('title')
      || (element as HTMLElement).innerText || (element as HTMLInputElement).value || '').trim();
    const buttons = [...document.querySelectorAll('button,[role="button"],a,input[type="submit"]')];
    const leave = buttons.filter((element) => re('leave').test(label(element)));
    if (leave.length) return { state: 'joined', leaveVisible: leave.some(visible) };
    const snippet = text.replace(/\s+/g, ' ').slice(0, 200);
    if (re('ended').test(text)) return { state: 'ended', text: snippet };
    const field = [...document.querySelectorAll('input')].find((input) => visible(input) && !input.disabled && !input.readOnly
      && input.type !== 'checkbox' && input.type !== 'hidden'
      && [input.placeholder, input.getAttribute('aria-label') ?? '', input.name,
        ...[...(input.labels ?? [])].map((item) => item.innerText)].some((value) => re('name').test(value)));
    const join = buttons.filter((element) => visible(element) && !(element as HTMLButtonElement).disabled
      && element.getAttribute('aria-disabled') !== 'true' && re('join').test(label(element)));
    if (field) {
      if (field.value !== nick) {
        field.focus();
        field.select();
        return { state: 'fill', ...center(field) };
      }
      // Some rooms ask to accept terms before joining.
      const consent = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((box) => !box.checked && box.required);
      if (consent) return { state: 'click', submit: false, ...center(consent.labels?.[0] ?? consent) };
      const submit = join.at(-1);
      if (submit) return { state: 'click', submit: true, ...center(submit) };
      return { state: 'loading', text: snippet };
    }
    const first = join[0];
    if (first) return { state: 'click', submit: false, ...center(first) };
    return { state: re('waiting').test(text) ? 'waiting' : 'loading', text: snippet };
  };
  const patterns = Object.fromEntries(Object.entries(PATTERNS).map(([key, value]) => [key, value.source]));
  return `(${source.toString()})(${JSON.stringify(patterns)}, ${JSON.stringify(nickname)})`;
}

/** The room without per-user query parameters: `https://my.mts-link.ru/j/<org>/<event>`. */
export function webinarRoom(link: string): string {
  const url = new URL(link);
  return `${url.origin}${/^\/j\/\d+\/\d+/.exec(url.pathname)?.[0] ?? url.pathname}`;
}

export const ENDED_TEXT = PATTERNS.ended;

/** Clicks the element the last probe pointed at, for rooms that ignore synthetic mouse input. */
export const CLICK_TARGET = `(() => { const el = document.querySelector('[data-mpr-target]'); if (el) el.click(); return !!el; })()`;
