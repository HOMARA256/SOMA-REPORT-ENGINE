export function safeInternalReturnTo(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) return fallback;
  return value;
}
