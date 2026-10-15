/** Return a validated browser-app origin for Supabase Auth redirects. */
export function getPublicAppOrigin() {
    const configured = Deno.env.get("PUBLIC_APP_URL")?.trim();
    if (!configured)
        return null;
    try {
        const url = new URL(configured);
        const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
        if (url.protocol !== "https:" && !localHttp)
            return null;
        if (url.username || url.password || url.pathname !== "/" || url.search || url.hash)
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
}
