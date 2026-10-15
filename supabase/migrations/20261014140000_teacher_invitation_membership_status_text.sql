-- A missing school membership is a display state, not a membership_status enum value.
-- Cast the enum to text before falling back to NONE in the JSON returned to clients.
do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_repaired text;
begin
  foreach v_function in array array[
    'public.get_my_school_teacher_invitation(uuid)'::regprocedure,
    'public.list_school_teacher_invitations(uuid)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_repaired := replace(v_definition, 'coalesce(v_membership.status,''NONE'')', 'coalesce(v_membership.status::text,''NONE'')');
    v_repaired := replace(v_repaired, 'coalesce(m.status,''NONE'')', 'coalesce(m.status::text,''NONE'')');
    if v_repaired = v_definition then
      if v_definition not like '%status::text,''NONE''%' then
        raise exception 'Expected membership status expression not found in %', v_function;
      end if;
    else
      execute v_repaired;
    end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
