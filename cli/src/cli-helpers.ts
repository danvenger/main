/**
 * Small, pure helpers shared by CLI command handlers.
 */

/** Error carrying the process exit code the CLI should use. */
export class CliExitError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode: number) {
    super(message)
    this.name = 'CliExitError'
    this.exitCode = exitCode
  }
}

/**
 * Render the `hash` command's stdout.
 *
 * - `text`: the bare lowercase hex digest.
 * - `json`: `{ algorithm, digest, bytes }`. The input path is never included,
 *   so local file names do not leak into logs or CI output.
 *
 * Any other format throws a {@link CliExitError} with exit code 2 (usage).
 */
export function resolveHashOutput(
  algorithm: string,
  bytes: number,
  digest: string,
  format: string,
): string {
  if (format === 'text') return digest
  if (format === 'json') return JSON.stringify({ algorithm, digest, bytes }, null, 2)
  throw new CliExitError('invalid --output value: expected "text" or "json"', 2)
}
