-- Membership discovery for the authenticated user (api_specification.md §3).
--
-- Chicken-and-egg under RLS: a client cannot CLAIM a tenant (the
-- X-Institution-Id header) without knowing which institutions the user
-- belongs to, but the membership table is invisible without the claim —
-- `member_tenant` only shows rows where institution_id matches
-- current_institution_id().
--
-- `my_memberships` breaks the loop safely: SECURITY DEFINER, but it only
-- ever returns the caller's OWN active memberships in VERIFIED
-- institutions (unverified ones cannot run review workflows anyway, PRD
-- §6.6). No cross-user enumeration is possible — the argument is the
-- authenticated user id supplied by the API, never client input.

CREATE OR REPLACE FUNCTION my_memberships(p_user_id uuid)
RETURNS TABLE (
    institution_id   uuid,
    institution_name text,
    institution_slug text,
    department_id    uuid,
    programme_id     uuid,
    role             text,
    status           text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT m.institution_id,
           i.display_name,
           i.slug,
           m.department_id,
           m.programme_id,
           m.role::text,
           m.status::text
      FROM membership m
      JOIN institution i ON i.id = m.institution_id
     WHERE m.user_id = p_user_id
       AND m.status = 'active'
       AND i.status = 'verified'
     ORDER BY m.created_at ASC, m.institution_id ASC;
$$;

REVOKE ALL ON FUNCTION my_memberships(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_memberships(uuid) TO alims_app;
