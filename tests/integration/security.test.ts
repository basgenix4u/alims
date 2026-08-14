import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Database security guarantees — executable proof, not documentation.
 *
 * These tests connect as the real application role (`alims_app`, which is
 * NOSUPERUSER and NOT BYPASSRLS) and assert that the database itself
 * refuses to break PRD rules, even when the application layer is wrong.
 *
 *   PRD §6.1  cross-institution isolation
 *   PRD §6.3  approved versions are never silently overwritten
 *   PRD §9.1  tamper-evident audit history
 *
 * Requires a running PostgreSQL with migrations applied.
 * Skipped automatically when DATABASE_URL is not set.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const FUW = '11111111-1111-1111-1111-111111111111';
const ABU = '22222222-2222-2222-2222-222222222222';

/** Runs SQL as the least-privileged application role. */
function asApp(sql: string): string {
  return execFileSync(
    'psql',
    ['-h', 'localhost', '-U', 'alims_app', '-d', 'alims', '-qtA', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'alims_dev_password' } },
  ).trim();
}

/**
 * Runs SQL with elevated rights — used only to establish ground truth and
 * to seed fixtures. Two paths so the suite runs both locally (sudo to the
 * postgres OS user) and in CI (DSN for the migration/owner role).
 */
function asSuper(sql: string): string {
  const dsn = process.env.CI_SUPERUSER_DSN ?? process.env.DATABASE_MIGRATION_URL;
  if (dsn) {
    return execFileSync('psql', [dsn, '-qtA', '-c', sql], { encoding: 'utf8' }).trim();
  }
  return execFileSync('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'alims', '-qtA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

function expectSqlError(sql: string, fragment: string): void {
  let threw = false;
  try {
    asSuper(sql);
  } catch (err) {
    threw = true;
    expect(String(err)).toContain(fragment);
  }
  expect(threw, `expected SQL to be rejected: ${sql}`).toBe(true);
}

d('PRD §6.1 — cross-institution isolation is enforced by the database', () => {
  beforeAll(() => {
    asSuper(`
      INSERT INTO institution (id,legal_name,display_name,slug,country_code,category,
        official_domain,status,representative_email,privacy_contact_email,updated_at)
      VALUES
       ('${FUW}','Federal University Wukari','FUW','fuw','NG','university','fuw.edu.ng',
        'verified','rep@fuw.edu.ng','dpo@fuw.edu.ng',now()),
       ('${ABU}','Ahmadu Bello University','ABU','abu','NG','university','abu.edu.ng',
        'verified','rep@abu.edu.ng','dpo@abu.edu.ng',now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO department (id,institution_id,name,status) VALUES
       ('aaaaaaaa-0000-0000-0000-000000000001','${FUW}','FUW Computer Science','active'),
       ('bbbbbbbb-0000-0000-0000-000000000002','${ABU}','ABU Secret Research Unit','active')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  it('the application role cannot bypass row-level security', () => {
    const row = asSuper(
      `SELECT rolsuper::text || ',' || rolbypassrls::text FROM pg_roles WHERE rolname='alims_app';`,
    );
    // Both must be false, or RLS is silently bypassed for the app.
    expect(row).toBe('false,false');
  });

  it('ground truth: both departments exist', () => {
    expect(Number(asSuper('SELECT count(*) FROM department;'))).toBeGreaterThanOrEqual(2);
  });

  it('an institution sees only its own departments', () => {
    const fuw = asApp(`SET alims.current_institution='${FUW}'; SELECT name FROM department;`);
    expect(fuw).toContain('FUW Computer Science');
    expect(fuw).not.toContain('ABU Secret Research Unit');
  });

  it('the rival institution sees only its own', () => {
    const abu = asApp(`SET alims.current_institution='${ABU}'; SELECT name FROM department;`);
    expect(abu).toContain('ABU Secret Research Unit');
    expect(abu).not.toContain('FUW Computer Science');
  });

  it('no tenant context returns zero rows (deny by default)', () => {
    expect(asApp('SELECT count(*) FROM department;')).toBe('0');
  });

  it('a forgotten WHERE clause still cannot leak across tenants', () => {
    // Deliberately unscoped query — RLS is the backstop.
    const leaked = asApp(
      `SET alims.current_institution='${FUW}'; SELECT count(*) FROM department WHERE name LIKE 'ABU%';`,
    );
    expect(leaked).toBe('0');
  });
});

d('PRD §6.3 — submitted versions are immutable', () => {
  const RECORD = 'dddddddd-0000-0000-0000-000000000001';

  beforeAll(() => {
    asSuper(`
      INSERT INTO user_account (id,email,password_hash,display_name,updated_at)
      VALUES ('99999999-0000-0000-0000-000000000001','student@fuw.edu.ng','x','Test Student',now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO research_record (id,institution_id,owner_user_id,output_type,title,
        disciplines,keywords,licence,updated_at)
      VALUES ('${RECORD}','${FUW}','99999999-0000-0000-0000-000000000001','thesis',
        'Soil Degradation Study in Northern Nigeria','{Agriculture}','{soil}','CC-BY-4.0',now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO record_version (id,record_id,version_no,change_summary,state,file_key,sha256)
      VALUES ('eeeeeeee-0000-0000-0000-000000000001','${RECORD}',1,
        'Initial submission of thesis','submitted','orig.pdf',repeat('a',64))
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  it('a version is sealed automatically when submitted', () => {
    expect(asSuper(`SELECT is_immutable FROM record_version WHERE record_id='${RECORD}';`)).toBe('t');
  });

  it('the submitted file cannot be overwritten — even by a superuser', () => {
    expectSqlError(
      `UPDATE record_version SET file_key='sneaky.pdf' WHERE record_id='${RECORD}';`,
      'immutable',
    );
    expect(asSuper(`SELECT file_key FROM record_version WHERE record_id='${RECORD}';`)).toBe(
      'orig.pdf',
    );
  });

  it('deposit evidence cannot be deleted', () => {
    expectSqlError(`DELETE FROM record_version WHERE record_id='${RECORD}';`, 'immutable');
    expect(asSuper(`SELECT count(*) FROM record_version WHERE record_id='${RECORD}';`)).toBe('1');
  });

  it('the legitimate supersede transition is still permitted', () => {
    asSuper(`UPDATE record_version SET state='superseded' WHERE record_id='${RECORD}';`);
    expect(asSuper(`SELECT state FROM record_version WHERE record_id='${RECORD}';`)).toBe(
      'superseded',
    );
  });
});

d('PRD §9.1 — the audit trail is tamper-evident', () => {
  beforeAll(() => {
    // Start from a known-good chain. TRUNCATE requires disabling the
    // append-only trigger, which is exactly why that trigger exists:
    // clearing the audit log is a deliberate, privileged act.
    asSuper(`
      ALTER TABLE audit_event DISABLE TRIGGER trg_audit_event_append_only;
      TRUNCATE audit_event RESTART IDENTITY;
      ALTER TABLE audit_event ENABLE TRIGGER trg_audit_event_append_only;
      INSERT INTO audit_event (action,subject_type,payload,hash) VALUES
       ('record.created','research_record','{"t":"a"}',''),
       ('record.submitted','research_record','{"v":1}',''),
       ('certificate.issued','certificate','{"c":"CERT-1"}','');
    `);
  });

  it('builds a hash chain automatically on insert', () => {
    const rows = asSuper(
      `SELECT count(*) FROM audit_event WHERE hash <> '' AND length(hash)=64;`,
    );
    expect(Number(rows)).toBeGreaterThanOrEqual(3);
  });

  it('reports an intact chain when nothing has been altered', () => {
    expect(asSuper('SELECT count(*) FROM verify_audit_chain();')).toBe('0');
  });

  it('rejects UPDATE on an audit event', () => {
    expectSqlError(
      `UPDATE audit_event SET action='forged' WHERE seq=(SELECT min(seq) FROM audit_event);`,
      'append-only',
    );
  });

  it('rejects DELETE on an audit event', () => {
    expectSqlError(
      `DELETE FROM audit_event WHERE seq=(SELECT min(seq) FROM audit_event);`,
      'append-only',
    );
  });

  it('detects tampering performed with triggers disabled', () => {
    const target = asSuper('SELECT min(seq) FROM audit_event;');
    // Capture the exact original payload so restoration is byte-accurate
    // and the test does not depend on prior database state.
    const original = asSuper(`SELECT payload::text FROM audit_event WHERE seq=${target};`);

    asSuper(`
      ALTER TABLE audit_event DISABLE TRIGGER trg_audit_event_append_only;
      UPDATE audit_event SET payload='{"FORGED":true}' WHERE seq=${target};
      ALTER TABLE audit_event ENABLE TRIGGER trg_audit_event_append_only;
    `);
    expect(asSuper('SELECT broken_seq FROM verify_audit_chain();')).toBe(target);

    asSuper(`
      ALTER TABLE audit_event DISABLE TRIGGER trg_audit_event_append_only;
      UPDATE audit_event SET payload='${original.replace(/'/g, "''")}'::jsonb WHERE seq=${target};
      ALTER TABLE audit_event ENABLE TRIGGER trg_audit_event_append_only;
    `);
    // Verifier must now agree the chain is intact again — accurate, not noisy.
    expect(asSuper('SELECT count(*) FROM verify_audit_chain();')).toBe('0');
  });
});

d('PRD §1.5, §6.7, §6.8 — forbidden score columns do not exist', () => {
  it('no table has a contribution, integrity, or quality score column', () => {
    const found = asSuper(`
      SELECT COALESCE(string_agg(table_name || '.' || column_name, ', '), '')
      FROM information_schema.columns
      WHERE table_schema='public'
        AND (column_name LIKE '%score%'
          OR column_name LIKE '%rating%'
          OR column_name LIKE '%integrity_percent%'
          OR column_name LIKE '%quality%');
    `);
    // `similarity_assessment.score` is the one permitted numeric: it is an
    // advisory provider signal, private to authorised reviewers (PRD §6.5).
    const offenders = found
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'similarity_assessment.score');
    expect(offenders).toEqual([]);
  });

  it('the contributor ledger has no score column', () => {
    const cols = asSuper(`
      SELECT string_agg(column_name, ',') FROM information_schema.columns
      WHERE table_schema='public' AND table_name='contributor';
    `);
    expect(cols).not.toContain('score');
    expect(cols).toContain('is_supervision');
  });

  it('the passport has no global score column', () => {
    const cols = asSuper(`
      SELECT string_agg(column_name, ',') FROM information_schema.columns
      WHERE table_schema='public' AND table_name='passport_profile';
    `);
    expect(cols).not.toContain('score');
    expect(cols).not.toContain('rank');
  });
});
