export async function edgeFunctionErrorCode(data, error) {
    const directCode = data?.error;
    if (typeof directCode === "string")
        return directCode;
    // Supabase returns non-2xx Edge Function bodies on error.context, not data.
    const context = error?.context;
    if (!context || typeof context.clone !== "function")
        return "";
    try {
        const payload = await context.clone().json();
        return typeof payload?.error === "string" ? payload.error : "";
    }
    catch {
        return "";
    }
}
