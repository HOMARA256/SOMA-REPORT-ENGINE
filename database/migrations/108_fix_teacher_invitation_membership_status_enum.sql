-- Keep the missing-membership display state as text, not a membership_status enum value.
begin;

do $migration$
declare
  v_function regprocedure := 'public.list_school_teacher_invitations(uuid)'::regprocedure;
  v_definition text;
  v_repaired text;
begin
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'coalesce(m.status,''NONE'')',
    'coalesce(m.status::text,''NONE'')');

  if v_repaired = v_definition and v_definition not like '%m.status::text,''NONE''%' then
    raise exception 'Could not safely repair missing teacher membership status fallback';
  end if;

  if v_repaired <> v_definition then
    execute v_repaired;
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
