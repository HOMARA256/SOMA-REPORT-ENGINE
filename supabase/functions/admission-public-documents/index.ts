import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceKey) return response({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  const input = await request.json().catch(() => null) as { schoolCode?: unknown } | null;
  const schoolCode = typeof input?.schoolCode === "string" ? input.schoolCode.trim() : "";
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(schoolCode)) return response({ error: "SCHOOL_CODE_INVALID" }, 400);

  const service = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: school, error: schoolError } = await service.from("schools").select("id").ilike("school_code", schoolCode).eq("is_active", true).maybeSingle();
  if (schoolError || !school) return response({ documents: [] });
  const { data: rows, error } = await service.from("document_library_items")
    .select("title,file_name,storage_path")
    .eq("school_id", school.id).eq("category", "SCHOOL_FORM")
    .eq("visibility_level", "PUBLIC_ADMISSION_APPLICANT").eq("status", "ACTIVE")
    .order("uploaded_at", { ascending: false }).limit(20);
  if (error) return response({ error: "PUBLIC_DOCUMENTS_UNAVAILABLE" }, 503);

  const documents = await Promise.all((rows ?? []).map(async (item) => {
    const { data, error: signError } = await service.storage.from("school-document-library").createSignedUrl(item.storage_path, 300, { download: item.file_name });
    return signError || !data?.signedUrl ? null : { title: item.title, fileName: item.file_name, url: data.signedUrl };
  }));
  return response({ documents: documents.filter(Boolean) });
});
