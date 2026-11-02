/** IPC between the lesson viewer window and the recording session. */
export const LIVE_CHANNELS = {
  chat: 'live:chat',
  fullscreen: 'live:fullscreen',
} as const;

/** Longest chat message the app sends. */
export const CHAT_LIMIT = 500;

/** A chat message as it may cross from a window into the room. */
export function chatText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error('Сообщение пустое');
  if (text.length > CHAT_LIMIT) throw new Error(`Сообщение длиннее ${CHAT_LIMIT} символов`);
  return text;
}

export interface LiveBridge {
  /** Posts to the room's chat under the recorder's name. */
  sendChat(text: string): Promise<void>;
  /** Toggles fullscreen, or sets it when `on` is given. */
  fullscreen(on?: boolean): void;
}
