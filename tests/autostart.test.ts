import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { desktopExec, leaveHiddenMark, takeHiddenMark } from '../src/main/autostart';

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

describe('the mark of a quiet restart', () => {
  const file = (): string => join(mkdtempSync(join(tmpdir(), 'mpr-mark-')), 'restart-hidden');

  it('keeps the app in the tray once, right after the update', () => {
    const mark = file();
    leaveHiddenMark(mark, 1000);
    expect(takeHiddenMark(mark, 1000 + 60_000)).toBe(true);
    expect(takeHiddenMark(mark, 1000 + 60_000)).toBe(false);
  });

  it('ignores a mark left too long ago or broken', () => {
    const old = file();
    leaveHiddenMark(old, 1000);
    expect(takeHiddenMark(old, 1000 + 60 * 60_000)).toBe(false);
    const broken = file();
    writeFileSync(broken, 'garbage');
    expect(takeHiddenMark(broken)).toBe(false);
    expect(takeHiddenMark(file())).toBe(false);
  });
});
