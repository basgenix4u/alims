import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * T-103 — cross-tenant isolation on EVERY tenant table.
 *
 * Complements security.test.ts (which proves the mechanism on one table) by
 * iterating over every RLS-fenced tenant table and asserting that, with the
 * tenant context set to institution A, a query for institution B's rows
 * returns zero.
 *
 * The application connects as `alims_app` (NOSUPERUSER, NOT BYPASSRLS); the
 * per-request context is set by TenantGuard → TenantContextService →
 * PrismaService.withTenant() (transaction-local set_config, never a plain
 * SET that would leak across pooled connections).
 *
 * Requires PostgreSQL with migrations applied. Skipped without DATABASE_URL.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const FUW = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const ABU = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const PENDING = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const U_FUW = '0a000000-0000-0000-0000-000000000001';
const U_ABU = '0b000000-0000-0000-0000-000000000001';
const D_FUW = '0d000000-0000-0000-0000-000000000001';
const D_ABU = '0d000000-0000-0000-0000-000000000002';
const P_FUW = '0d000000-0000-0000-0000-000000000011';
const P_ABU = '0d000000-0000-0000-0000-000000000012';
const S_FUW = '0d000000-0000-0000-0000-000000000021';
const S_ABU = '0d000000-0000-0000-0000-000000000022';
const M_FUW = '0d000000-0000-0000-0000-000000000031';
const M_ABU = '0d000000-0000-0000-0000-000000000032';
const W_FUW = '0d000000-0000-0000-0000-000000000041';
const W_ABU = '0d000000-0000-0000-0000-000000000042';
const H_FUW = '0d000000-0000-0000-0000-000000000051';
const H_ABU = '0d000000-0000-0000-0000-000000000052';
const R_FUW = '0d000000-0000-0000-0000-000000000061';
const R_ABU = '0d000000-0000-0000-0000-000000000062';

function asApp(sql: string): string {
  return execFileSync(
    'psql',
    ['-h', 'localhost', '-U', 'alims_app', '-d', 'alims', '-qtA', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'alims_dev_password' } },
  ).trim();
}

function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

/**
 * Every table whose rows RLS scopes by institution. `institution` is handled
 * separately because verified institutions are a public directory by design
 * (PRD §6.1).
 */
const STRICT_TENANT_TABLES = [
  { table: 'department', column: 'institution_id' },
  { table: 'programme', column: 'institution_id' },
  { table: 'academic_session', column: 'institution_id' },
  { table: 'membership', column: 'institution_id' },
  { table: 'workflow_template', column: 'institution_id' },
  { table: 'institution_name_history', column: 'institution_id' },
  { table: 'research_record', column: 'institution_id' },
] as const;

d('T-103 — every tenant table denies cross-tenant reads', () => {
  beforeAll(() => {
    asSuper(`
      INSERT INTO institution (id,legal_name,display_name,slug,country_code,category,
        official_domain,status,representative_email,privacy_contact_email,updated_at)
      VALUES
       ('${FUW}','Federal University Wukari','FUW','fuw-t103','NG','university','fuw.edu.ng',
        'verified','rep@fuw.edu.ng','dpo@fuw.edu.ng',now()),
       ('${ABU}','Ahmadu Bello University','ABU','abu-t103','NG','university','abu.edu.ng',
        'verified','rep@abu.edu.ng','dpo@abu.edu.ng',now()),
       ('${PENDING}','Pending Private Institute','PPI','ppi-t103','NG','college','ppi.edu.ng',
        'pending_verification','rep@ppi.edu.ng','dpo@ppi.edu.ng',now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO user_account (id,email,password_hash,display_name,updated_at) VALUES
       ('${U_FUW}','t103-stu@fuw.edu.ng','x','T103 FUW Student',now()),
       ('${U_ABU}','t103-stu@abu.edu.ng','x','T103 ABU Student',now())
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO department (id,institution_id,name) VALUES
       ('${D_FUW}','${FUW}','FUW T103 Dept'),
       ('${D_ABU}','${ABU}','ABU T103 Dept')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO programme (id,institution_id,department_id,name,degree_type) VALUES
       ('${P_FUW}','${FUW}','${D_FUW}','FUW MSc CS','MSc'),
       ('${P_ABU}','${ABU}','${D_ABU}','ABU MSc Physics','MSc')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO academic_session (id,institution_id,label,starts_on,ends_on) VALUES
       ('${S_FUW}','${FUW}','2025/2026 FUW','2025-09-01','2026-08-31'),
       ('${S_ABU}','${ABU}','2025/2026 ABU','2025-09-01','2026-08-31')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO membership (id,user_id,institution_id,role,status) VALUES
       ('${M_FUW}','${U_FUW}','${FUW}','student','active'),
       ('${M_ABU}','${U_ABU}','${ABU}','student','active')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO workflow_template (id,institution_id,name,output_type,stages) VALUES
       ('${W_FUW}','${FUW}','FUW Thesis Flow','thesis','[]'::jsonb),
       ('${W_ABU}','${ABU}','ABU Thesis Flow','thesis','[]'::jsonb)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO institution_name_history (id,institution_id,previous_name) VALUES
       ('${H_FUW}','${FUW}','Old FUW Name'),
       ('${H_ABU}','${ABU}','Old ABU Name')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO research_record (id,institution_id,owner_user_id,output_type,title,
        disciplines,keywords,licence,status,updated_at) VALUES
       ('${R_FUW}','${FUW}','${U_FUW}',
        'thesis','FUW T103 Record','{Agriculture}','{soil}','CC-BY-4.0','draft',now()),
       ('${R_ABU}','${ABU}','${U_ABU}',
        'thesis','ABU T103 Record','{Physics}','{laser}','CC-BY-4.0','draft',now())
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  for (const { table, column } of STRICT_TENANT_TABLES) {
    it(`${table}: a FUW-scoped read returns zero ABU rows`, () => {
      const leaked = asApp(
        `SET alims.current_institution='${FUW}'; SELECT count(*) FROM "${table}" WHERE "${column}"='${ABU}';`,
      );
      expect(leaked, `cross-tenant leak in ${table}`).toBe('0');
    });

    it(`${table}: the tenant still sees its own row`, () => {
      const own = asApp(
        `SET alims.current_institution='${FUW}'; SELECT count(*) FROM "${table}" WHERE "${column}"='${FUW}';`,
      );
      expect(Number(own), `own row missing from ${table}`).toBeGreaterThanOrEqual(1);
    });
  }

  it('institution: a non-verified institution is invisible to another tenant', () => {
    const hidden = asApp(
      `SET alims.current_institution='${FUW}'; SELECT count(*) FROM institution WHERE id='${PENDING}';`,
    );
    expect(hidden).toBe('0');
  });

  it('institution: verified institutions remain a public directory (PRD §6.1)', () => {
    const visible = asApp(
      `SET alims.current_institution='${FUW}'; SELECT count(*) FROM institution WHERE id='${ABU}';`,
    );
    expect(visible).toBe('1');
  });

  it('no tenant context denies tenant data across the board (deny by default)', () => {
    for (const { table, column } of STRICT_TENANT_TABLES) {
      const count = asApp(`SELECT count(*) FROM "${table}" WHERE "${column}"='${FUW}';`);
      expect(count, `no-context leak in ${table}`).toBe('0');
    }
  });
});
