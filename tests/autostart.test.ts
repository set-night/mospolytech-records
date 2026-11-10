import { describe, expect, it } from 'vitest';
import { desktopExec } from '../src/main/autostart';

describe('desktopExec', () => {
  it('quotes the path so spaces survive', () => {
    expect(desktopExec('/opt/MosPolytech Records/app')).toBe('"/opt/MosPolytech Records/app"');
  });

  it('escapes what the desktop entry format treats specially', () => {
    // Field codes: a lone % would be read as %f, %u…
    expect(desktopExec('/home/me/100%/app')).toBe('"/home/me/100%%/app"');
    // Quoting rules first, then the string-value escaping doubles every backslash.
    expect(desktopExec('/home/me/a"b$c`d')).toBe('"/home/me/a\\\\"b\\\\$c\\\\`d"');
    expect(desktopExec('/home/me/back\\slash')).toBe('"/home/me/back\\\\\\\\slash"');
  });
});
