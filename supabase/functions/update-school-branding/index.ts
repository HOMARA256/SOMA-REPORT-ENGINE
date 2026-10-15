import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:cors}); if(request.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!url||!key)return reply({error:"SERVER_CONFIGURATION_ERROR"},500);
 const service=createClient(url,key,{auth:{persistSession:false}}),token=(request.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
 const {data:identity}=await service.auth.getUser(token); if(!identity.user)return reply({error:"AUTHENTICATION_REQUIRED"},401);
 const input=await request.json().catch(()=>null) as {schoolId?:unknown;logoPath?:unknown}|null;
 const schoolId=typeof input?.schoolId==="string"?input.schoolId.trim():"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(schoolId))return reply({error:"SCHOOL_ID_REQUIRED"},400);
 const {data:user}=await service.from("users").select("id,full_name").eq("auth_user_id",identity.user.id).eq("is_active",true).maybeSingle(); if(!user)return reply({error:"PROFILE_NOT_FOUND"},403);
 const {data:membership}=await service.from("school_memberships").select("school_id,role_id,status").eq("user_id",user.id).eq("school_id",schoolId).eq("status","ACTIVE").maybeSingle(); if(!membership)return reply({error:"ACTIVE_SCHOOL_MEMBERSHIP_REQUIRED"},403);
 const {data:role}=await service.from("roles").select("code").eq("id",membership.role_id).maybeSingle(); if(role?.code!=="SCHOOL_ADMIN")return reply({error:"SCHOOL_ADMIN_REQUIRED"},403);
 const path=typeof input?.logoPath==="string"?input.logoPath.trim():"";
 if(path&&!new RegExp(`^${schoolId}/logo\\.(png|jpg|webp)$`,`i`).test(path))return reply({error:"INVALID_BRANDING_PATH"},400);
 const logoUrl=path?`${url}/storage/v1/object/public/school-branding/${path}`:null;
 const {data:oldSchool,error:readError}=await service.from("schools").select("logo_url").eq("id",schoolId).maybeSingle(); if(readError||!oldSchool)return reply({error:"SCHOOL_NOT_FOUND"},404);
 const {error}=await service.from("schools").update({logo_url:logoUrl}).eq("id",schoolId); if(error)return reply({error:"BRANDING_UPDATE_FAILED"},500);
 const {error:profileError}=await service.from("school_profiles").update({logo_url:logoUrl,updated_at:new Date().toISOString()}).eq("school_id",schoolId); if(profileError){await service.from("schools").update({logo_url:oldSchool.logo_url}).eq("id",schoolId);return reply({error:"SCHOOL_PROFILE_BRANDING_UPDATE_FAILED"},500);}
 await service.from("school_profile_events").insert({school_id:schoolId,actor_user_id:user.id,event_type:"SCHOOL_LOGO_CHANGED",field_key:"logo_url",new_value:{configured:Boolean(path)}});
 await service.from("audit_logs").insert({user_name:user.full_name,user_role:"SCHOOL_ADMIN",action:"SCHOOL_LOGO_CHANGED",entity_type:"school",entity_id:schoolId,new_value:{configured:Boolean(path)}});
 return reply({logoUrl});
});
