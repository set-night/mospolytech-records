import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaUrl } from '@shared/api';
import { byteRange, mediaFile } from '../src/main/media';

describe('byteRange', () => {
  it('sends the whole file without a usable Range header', () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange('bytes=-', 100)).toBeNull();
    expect(byteRange('items=0-5', 100)).toBeNull();
    expect(byteRange('bytes=0-5, 10-15', 100)).toBeNull();
    expect(byteRange('bytes=0-', 0)).toBeNull();
  });

  it('understands the forms a video player sends', () => {
    expect(byteRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    expect(byteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(byteRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange('bytes=-30', 100)).toEqual({ start: 70, end: 99 });
    expect(byteRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
  });

  it('rejects ranges outside the file', () => {
    expect(byteRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(byteRange('bytes=20-10', 100)).toBe('unsatisfiable');
    expect(byteRange('bytes=-0', 100)).toBe('unsatisfiable');
  });
});

describe('mediaFile', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mpr-media-'));
  const file = join(folder, '2026-11-02 09-00 Физика #1 (Лекция) 100%.mp4');
  writeFileSync(file, 'video');

  it('finds the recording a player URL points to', () => {
    expect(mediaFile(folder, mediaUrl(file))).toBe(file);
  });

  it('serves nothing but recordings from the folder', () => {
    expect(mediaFile(folder, mediaUrl(join(folder, '..', 'secret.mp4')))).toBeNull();
    expect(mediaFile(folder, mediaUrl('/etc/passwd'))).toBeNull();
    expect(mediaFile(folder, mediaUrl(file).replace('recording', 'other'))).toBeNull();
    expect(mediaFile(folder, 'media://recording/%E0%A4%A')).toBeNull();
    expect(mediaFile(folder, 'not a url')).toBeNull();
  });
});
