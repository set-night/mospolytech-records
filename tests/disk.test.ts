import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { freeSpace } from '../src/main/recordings/disk';

describe('freeSpace', () => {
  it('measures an existing folder', async () => {
    const free = await freeSpace(mkdtempSync(join(tmpdir(), 'mpr-disk-')));
    expect(free).toBeGreaterThan(0);
  });

  it('falls back to the nearest existing parent for a folder not created yet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mpr-disk-'));
    const free = await freeSpace(join(dir, 'not', 'yet', 'here'));
    expect(free).toBeGreaterThan(0);
  });
});
