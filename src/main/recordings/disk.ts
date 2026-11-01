import { statfs } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Free bytes on the drive holding `folder`, which may not exist yet. */
export async function freeSpace(folder: string): Promise<number | null> {
  let path = folder;
  for (;;) {
    try {
      const stats = await statfs(path);
      return stats.bavail * stats.bsize;
    } catch {
      const parent = dirname(path);
      if (parent === path) return null;
      path = parent;
    }
  }
}
