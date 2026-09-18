-- Part bookkeeping for token-authorised uploads (api_specification.md §6).
--
-- Part PUTs are authorised by the SIGNED, short-lived part URL — not by a
-- user session — so they arrive in the system context where row-level
-- security correctly hides every upload row. Possession of a valid signed
-- token for (upload_id, part_number) has already been verified by the
-- application before this function is called; the function only records
-- the etag. It refuses sessions that are no longer in progress.

CREATE OR REPLACE FUNCTION upload_record_part(
    p_upload_id uuid,
    p_part_number int,
    p_etag text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status INTO v_status FROM file_upload WHERE id = p_upload_id;
    IF v_status IS DISTINCT FROM 'in_progress' THEN
        RETURN false;
    END IF;

    UPDATE file_upload
       SET parts = (
           SELECT COALESCE(jsonb_agg(p ORDER BY (p->>'partNumber')::int), '[]'::jsonb)
           FROM (
               SELECT p
                 FROM jsonb_array_elements(parts) p
                WHERE (p->>'partNumber')::int <> p_part_number
               UNION ALL
               SELECT jsonb_build_object(
                   'partNumber', p_part_number,
                   'etag', p_etag
               )
           ) merged
       )
     WHERE id = p_upload_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION upload_record_part(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upload_record_part(uuid, int, text) TO alims_app;
