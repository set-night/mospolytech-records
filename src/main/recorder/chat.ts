/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Finds the room's chat controls. Like the join probe it only reports
 * positions; the main process types and clicks with trusted input events.
 */
export interface Point {
  x: number;
  y: number;
}

export interface ChatProbe {
  /** The message field and what is typed in it now. */
  input: (Point & { text: string }) | null;
  /** The button that shows or hides the chat panel. */
  toggle: Point | null;
  /** The send button, only while it is enabled. */
  send: Point | null;
}

const PATTERNS = {
  input: /сообщени|message/i,
  toggle: /^(Чат|Chat)$/i,
  send: /^(Отправить|Send)$/i,
};

export function chatScript(): string {
  const source = (patterns: Record<keyof typeof PATTERNS, string>): ChatProbe => {
    const re = (key: keyof typeof PATTERNS): RegExp => new RegExp(patterns[key], 'i');
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const point = (element: Element): Point => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    const label = (element: Element): string => (element.getAttribute('aria-label') || element.getAttribute('title')
      || element.getAttribute('placeholder') || element.getAttribute('data-placeholder') || '').trim();
    const field = [...document.querySelectorAll<HTMLElement>('[contenteditable="true"],textarea')]
      .find((element) => visible(element) && re('input').test(label(element)));
    const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
    const toggle = buttons.find((element) => re('toggle').test(label(element) || (element as HTMLElement).innerText.trim()));
    // The room keeps the send button in the DOM and marks it disabled with a class while the field is empty.
    const send = field && buttons.find((element) => re('send').test(label(element))
      && !(element as HTMLButtonElement).disabled && element.getAttribute('aria-disabled') !== 'true'
      && !/disabled/i.test(element.className.toString()));
    return {
      input: field ? { ...point(field), text: (field instanceof HTMLTextAreaElement ? field.value : field.innerText).trim() } : null,
      toggle: toggle ? point(toggle) : null,
      send: send ? point(send) : null,
    };
  };
  const patterns = Object.fromEntries(Object.entries(PATTERNS).map(([key, value]) => [key, value.source]));
  return `(${source.toString()})(${JSON.stringify(patterns)})`;
}
