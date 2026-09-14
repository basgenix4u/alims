-- Institution onboarding (api_specification.md §4): any authenticated
-- account may apply to onboard an institution. The row-level security
-- SELECT policy already limits visibility (verified institutions are a
-- public directory; everything else is tenant-scoped), but INSERT had no
-- policy — denied by default. This policy admits only new institutions in
-- pending_verification, so onboarding can never self-verify.

CREATE POLICY inst_onboarding ON "institution"
  FOR INSERT
  WITH CHECK (status = 'pending_verification');
