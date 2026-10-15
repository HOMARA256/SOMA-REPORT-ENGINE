type ErrorPayload = { error?: unknown };

export async function edgeFunctionErrorCode(data: unknown, error: unknown): Promise<string> {
  const directCode = (data as ErrorPayload | null)?.error;
  if (typeof directCode === "string") return directCode;

  // Supabase returns non-2xx Edge Function bodies on error.context, not data.
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof (context as Response).clone !== "function") return "";
  try {
    const payload = await (context as Response).clone().json() as ErrorPayload;
    return typeof payload?.error === "string" ? payload.error : "";
  } catch {
    return "";
  }
}
