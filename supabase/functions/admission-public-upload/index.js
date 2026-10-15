import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (request.method !== "POST")
        return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey)
        return reply({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const input = await request.json().catch(() => null);
    const reference = typeof input?.reference === "string" ? input.reference.trim().toUpperCase() : "";
    const accessToken = typeof input?.accessToken === "string" ? input.accessToken : "";
    const fileName = typeof input?.fileName === "string" ? input.fileName.trim().slice(0, 255) : "";
    const mimeType = typeof input?.mimeType === "string" ? input.mimeType.toLowerCase() : "";
    const fileSize = Number(input?.fileSize);
    if (!/^SOMA-[0-9A-F]{12}$/.test(reference) || !/^[0-9a-f]{64}$/i.test(accessToken) || !fileName || /[\\/\0]/.test(fileName) || !allowedTypes.has(mimeType) || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > 10 * 1024 * 1024)
        return reply({ error: "ADMISSION_UPLOAD_FIELDS_INVALID" }, 400);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accessToken));
    const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: application, error } = await service.from("admission_applications").select("id,school_id,status,access_token_hash,admission_opening_id").eq("application_reference", reference).maybeSingle();
    if (error || !application || application.access_token_hash !== tokenHash || !["DRAFT", "MORE_INFORMATION_REQUIRED"].includes(application.status))
        return reply({ error: "APPLICATION_REFERENCE_OR_TOKEN_INVALID" }, 403);
    const { data: opening, error: openingError } = await service.from("admission_openings").select("status,opening_date,closing_date").eq("id", application.admission_opening_id).maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    if (openingError || !opening || opening.status !== "OPEN" || today < opening.opening_date || today > opening.closing_date)
        return reply({ error: "ADMISSION_OPENING_CLOSED" }, 409);
    const id = crypto.randomUUID();
    const path = `schools/${application.school_id}/admissions/${application.id}/documents/${id}`;
    const { data: signed, error: signedError } = await service.storage.from("school-admission-documents").createSignedUploadUrl(path, { upsert: false });
    if (signedError || !signed?.token)
        return reply({ error: "SECURE_UPLOAD_UNAVAILABLE" }, 503);
    return reply({ path, token: signed.token });
});
