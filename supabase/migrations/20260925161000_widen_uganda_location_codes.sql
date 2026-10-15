-- Verified parish identifiers can exceed the original 60-character limit.
-- Preserve them losslessly because they provide stable source traceability.
alter table public.uganda_locations
  alter column code type varchar(120);
