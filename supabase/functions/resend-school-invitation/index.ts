import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPublicAppOrigin } from "../_shared/publicAppUrl.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const randomText=(bytes=36)=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes)))).replace(/[+/=]/g,"").slice(0,bytes);
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map((byte)=>byte.toString(16).padStart(2,"0")).join("");
Deno.serve(async(request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!url||!key)return json({error:"SERVER_CONFIGURATION_ERROR"},500);
  const appUrl=getPublicAppOrigin(); if(!appUrl)return json({error:"SERVER_CONFIGURATION_ERROR"},500);
  const service=createClient(url,key,{auth:{persistSession:false}}); const bearer=(request.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
  const {data:identity}=await service.auth.getUser(bearer); if(!identity.user)return json({error:"AUTHENTICATION_REQUIRED"},401);
  const {data:actor}=await service.from("platform_admins").select("id").eq("auth_user_id",identity.user.id).eq("is_active",true).maybeSingle(); if(!actor)return json({error:"PLATFORM_ADMIN_REQUIRED"},403);
  const body=await request.json().catch(()=>null) as {schoolId?:string}|null; if(!body?.schoolId)return json({error:"SCHOOL_REQUIRED"},400);
  const {data:invite}=await service.from("school_admin_invitations").select("id,school_id,email,invited_user_id,attempt_count").eq("school_id",body.schoolId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!invite)return json({error:"INVITATION_NOT_FOUND"},404);
  const rawToken=randomText(); const tokenHash=await sha256(rawToken); const expiresAt=new Date(Date.now()+72*60*60_000);
  const activationUrl=`${appUrl}/activate-school?token=${encodeURIComponent(rawToken)}`;
  const {error:deliveryError}=await service.auth.resetPasswordForEmail(invite.email,{redirectTo:activationUrl});
  const status=deliveryError?"FAILED":"SENT";
  await service.from("school_admin_invitations").update({token_hash:tokenHash,status,expires_at:expiresAt.toISOString(),sent_at:status==="SENT"?new Date().toISOString():null,revoked_at:null,used_at:null,attempt_count:(invite.attempt_count??0)+1,failure_category:deliveryError?"SUPABASE_AUTH_EMAIL_FAILED":null}).eq("id",invite.id);
  await service.from("school_invitation_events").insert({invitation_id:invite.id,school_id:invite.school_id,event_type:status,actor_platform_admin_id:actor.id,safe_metadata:{resend:true,expires_at:expiresAt.toISOString()}});
  if(deliveryError){console.error("Supabase invitation email failed",{message:deliveryError.message});return json({error:"INVITATION_EMAIL_FAILED"},502);}
  return json({status:"SENT",expiresAt:expiresAt.toISOString()});
});
