export const DOC_BUCKET = "bot-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;
export const ALLOWED_EXT = ["pdf", "txt", "md", "csv"] as const;
export const TEXT_EXT = ["txt", "md", "csv"];

export function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
