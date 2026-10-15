-- Remove PostgreSQL default grants from provisioning-only objects.
revoke all on public.school_profiles, public.school_workspace_configurations,
  public.school_provisioning_alerts, public.platform_subject_policies from anon;

revoke all on function public.ensure_school_profile_on_insert() from public, anon, authenticated;
revoke all on function public.alert_missing_school_profile() from public, anon, authenticated;
revoke all on function public.guard_school_profile_lifecycle() from public, anon, authenticated;
revoke all on function public.preview_school_configuration_repair(uuid) from public, anon, authenticated;
revoke all on function public.repair_school_configuration(uuid) from public, anon, authenticated;
revoke all on function public.create_demo_o_level_school_data() from public, anon, authenticated;
revoke all on function public.reset_demo_school_data(uuid) from public, anon, authenticated;

grant select on public.school_profiles, public.school_workspace_configurations to authenticated;
grant select on public.school_provisioning_alerts, public.platform_subject_policies to authenticated;
grant execute on function public.preview_school_configuration_repair(uuid) to authenticated;
grant execute on function public.repair_school_configuration(uuid) to authenticated;
grant execute on function public.create_demo_o_level_school_data() to authenticated;
grant execute on function public.reset_demo_school_data(uuid) to authenticated;

;
