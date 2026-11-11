-- Existing owner-only connection policies also protect the editable follow-up.
alter table public.ic_connections add column email_draft jsonb
  check (email_draft is null or (
    jsonb_typeof(email_draft) = 'object' and email_draft ?& array['to','subject','body']
    and jsonb_typeof(email_draft->'to') = 'string' and char_length(email_draft->>'to') <= 254
    and jsonb_typeof(email_draft->'subject') = 'string' and char_length(email_draft->>'subject') <= 300
    and jsonb_typeof(email_draft->'body') = 'string' and char_length(email_draft->>'body') <= 5000
  ));
