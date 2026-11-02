import { describe, expect, it } from 'vitest';
import { chatText, CHAT_LIMIT } from '@shared/live';
import { chatScript } from '../src/main/recorder/chat';

describe('chatText', () => {
  it('trims the message', () => {
    expect(chatText('  Здравствуйте!  ')).toBe('Здравствуйте!');
  });

  it('rejects empty and non-text input', () => {
    expect(() => chatText('   ')).toThrow('Сообщение пустое');
    expect(() => chatText(42)).toThrow('Сообщение пустое');
  });

  it('caps the length', () => {
    expect(chatText('я'.repeat(CHAT_LIMIT))).toHaveLength(CHAT_LIMIT);
    expect(() => chatText('я'.repeat(CHAT_LIMIT + 1))).toThrow(String(CHAT_LIMIT));
  });
});

describe('chatScript', () => {
  it('is a self-contained expression for executeJavaScript', () => {
    // Parsing proves the probe survives serialization; it runs in the room, not here.
    expect(() => new Function(`return ${chatScript()}`)).not.toThrow();
  });
});
