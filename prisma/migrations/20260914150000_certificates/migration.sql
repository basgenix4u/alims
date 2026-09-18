-- Public QR verification (api_specification.md §8, PRD §6.4/§8).
--
-- The anonymous verification endpoint must answer for ANY certificate —
-- including certificates on records whose access level is not public —
-- because the opaque QR token is the capability and the answer carries
-- only the ten approved fields. Row-level security correctly hides such
-- records from the anonymous context, so the read goes through this
-- deliberately privileged function whose SELECT list IS the projection:
-- nothing else can leak because nothing else is selected.
--
-- The QR token carries no embedded data (PRD §8): it is an opaque random
-- identifier resolved here.

-- to_iso8601 helper: timestamptz -> ISO 8601 UTC string.
CREATE OR REPLACE FUNCTION to_iso8601(ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

CREATE OR REPLACE FUNCTION public_verification_by_qr(
    p_qr_token text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'status', c.status::text,
        'certificateNo', c.certificate_no,
        'nxrId', c.nxr_id,
        'title', r.title,
        'researcherNames', COALESCE(
            (SELECT jsonb_agg(x.name ORDER BY x.ord, x.name)
             FROM (
                 SELECT u.display_name AS name, 0 AS ord
                 FROM contributor cv
                 JOIN user_account u ON u.id = cv.user_id
                 WHERE cv.record_id = r.id AND cv.ack_status = 'acknowledged'
                 UNION ALL
                 SELECT cv.external_name AS name, 1 AS ord
                 FROM contributor cv
                 WHERE cv.record_id = r.id
                   AND cv.user_id IS NULL
                   AND cv.ack_status = 'acknowledged'
                   AND cv.external_name IS NOT NULL
             ) x),
            jsonb_build_array(o.display_name)
        ),
        'institutionName', COALESCE(i.display_name, ''),
        'outputType', r.output_type::text,
        'issueDate', to_iso8601(c.issued_at),
        'verificationLevel', r.verification_level::text,
        'supersededBy', (
            SELECT c2.certificate_no
            FROM certificate c2
            WHERE c2.id = c.superseded_by_id
        ),
        'disclaimer', 'Confirms an ALIMS verification record. Not a legal determination of copyright ownership, originality, or degree award.'
    )
    FROM certificate c
    JOIN research_record r ON r.id = c.record_id
    LEFT JOIN institution i ON i.id = r.institution_id
    LEFT JOIN user_account o ON o.id = r.owner_user_id
    WHERE c.qr_token = p_qr_token;
$$;

REVOKE ALL ON FUNCTION public_verification_by_qr(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_verification_by_qr(text) TO alims_app;

-- Referential integrity for the issuer (column existed without a key).
ALTER TABLE "certificate"
  ADD CONSTRAINT "certificate_issued_by_id_fkey"
  FOREIGN KEY ("issued_by_id") REFERENCES "user_account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
