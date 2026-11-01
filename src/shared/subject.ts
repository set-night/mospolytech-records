/** Comparison key for a subject name: case, `ё` and spacing do not matter. */
export function subjectKey(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
}
