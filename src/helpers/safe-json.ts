export function parseSafeJSON<T>(json?: string | null): T | null {
  if (!json) return null;

  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
