import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../config/supabaseClient";
import type { Database } from "../../types/database.generated";

export type ResolvedIdentity = {
  id:string; email:string; name:string; role:string; roleLabel?:string; schoolId:string|null;
  schoolCode?:string; schoolName?:string; schoolLogo?:string|null; status:string;
  membershipStatus?:string; profilePhotoPath?:string|null; profilePhotoUrl?:string|null;
  mustChangePassword:boolean; permissions:string[];
};

export type IdentityResolution = { user:ResolvedIdentity|null; error:string; code:string };

export async function resolveCurrentIdentity(client: SupabaseClient<Database> | null = supabase):Promise<IdentityResolution>{
  if(!client)return {user:null,error:"Supabase is not configured for this deployment.",code:"NOT_CONFIGURED"};
  const {data,error}=await client.functions.invoke("resolve-current-user",{body:{}});
  if(error||!data?.user)return {user:null,error:data?.message??"Your authenticated account is not authorised for this workspace.",code:data?.error??"IDENTITY_RESOLUTION_FAILED"};
  return {user:data.user as ResolvedIdentity,error:"",code:""};
}

export async function clearAuthenticatedSession(){
  if(supabase)await supabase.auth.signOut({scope:"local"});
}
