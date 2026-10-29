/**
 * A manifest validation error a human can act on: which file, which JSON path,
 * what is wrong and what to do about it. The message carries all of them.
 */
export class ManifestError extends Error {
  override readonly name = "ManifestError";

  constructor(
    readonly file: string,
    readonly path: string,
    readonly reason: string,
    readonly hint: string,
  ) {
    super(`${file}: invalid manifest at "${path}": ${reason}. ${hint}`);
  }
}
