import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initLog, logError, logInfo } from '../src/main/log';

describe('log', () => {
  it('appends lines and rotates a full log', () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-log-'));
    const file = initLog(folder);
    logInfo('started');
    logError('failed', new Error('boom'));
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/INFO {2}started\n/);
    expect(text).toMatch(/ERROR failed: Error: boom/);

    writeFileSync(file, 'x'.repeat(1024 * 1024 + 1));
    logInfo('fresh');
    expect(existsSync(join(folder, 'app.old.log'))).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/^\S+ INFO {2}fresh\n$/);
  });
});
