/** Readable text of an error; IPC wraps them as "Error invoking remote method 'x': Error: text". */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
}
