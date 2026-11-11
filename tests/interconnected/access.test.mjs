import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// The isolated test database supplies the roles and verified claims that Supabase normally installs.
const { PGlite } = await import(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
test('private records, host-only rosters, access approval and directory field withdrawal', async () => {
  const db = new PGlite(),
    host = '00000000-0000-4000-8000-000000000001',
    alice = '00000000-0000-4000-8000-000000000002',
    bob = '00000000-0000-4000-8000-000000000003',
    event = '10000000-0000-4000-8000-000000000001',
    p = '20000000-0000-4000-8000-000000000001',
    note = '30000000-0000-4000-8000-000000000001';
  const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
  async function login(user) {
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('ic_test.uid',$1,false)", [user]);
  }
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select current_setting('ic_test.uid',true)::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',auth.uid()::text || '@example.com')$$;
      grant usage on schema auth to authenticated,anon;`);
    await db.exec(
      await readFile(
        new URL('../../supabase/migrations/202611110001_interconnected.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../../supabase/migrations/202611110002_connection_drafts.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.query('insert into auth.users values($1),($2),($3)', [host, alice, bob]);
    await db.query('insert into ic_organizers values($1)', [host]);
    await login(host);
    await db.query("insert into ic_events(id,title,day) values($1,'Pilot','2026-10-20')", [event]);
    await db.query("insert into ic_rosters(event_id,source,guests) values($1,'partiful','[]')", [event]);
    await login(alice);
    assert.equal((await rows('select * from ic_events')).length, 0);
    await assert.rejects(
      db.query("insert into ic_events(title,day) values('Other','2026-10-20')"),
      /row-level security/,
    );
    await db.query('select ic_request_access($1)', [event]);
    await assert.rejects(db.query('select * from ic_directory($1)', [event]), /membership required/);
    await db.query('insert into ic_profiles(details) values($1)', [
      { name: 'Alice', role: 'Founder', phone: '555-0100' },
    ]);
    const capture = 'select ic_capture($1,$2,null,$3)',
      args = [
        p,
        { name: 'Sam', tags: 'private' },
        { id: note, event_name: 'Pilot', note: 'Private prototype note', met: true },
      ];
    await db.query(capture, args);
    await db.query(capture, args);
    assert.equal((await rows('select * from ic_encounters')).length, 1);
    await db.query('update ic_connections set email_draft=$1 where id=$2', [
      { to: 'person@example.com', subject: 'Private follow-up', body: 'One private draft' },
      p,
    ]);
    assert.equal(
      (await rows('select email_draft from ic_connections where id=$1', [p]))[0].email_draft.subject,
      'Private follow-up',
    );
    await login(bob);
    await db.query('select ic_request_access($1)', [event]);
    await assert.rejects(db.query("select ic_set_access($1,$2,'approved')", [event, bob]), /denied/);
    assert.equal((await rows('select * from ic_connections')).length, 0);
    assert.equal((await rows('select * from ic_profiles')).length, 0);
    assert.equal((await rows('select * from ic_encounters')).length, 0);
    assert.equal((await rows('select * from ic_rosters')).length, 0);
    assert.equal(
      (await rows('update ic_connections set follow_up=true where id=$1 returning id', [p])).length,
      0,
    );
    await login(host);
    assert.equal((await rows('select * from ic_encounters')).length, 0);
    for (const uid of [alice, bob]) await db.query("select ic_set_access($1,$2,'approved')", [event, uid]);
    await login(alice);
    await db.query('select ic_share($1,$2)', [event, ['name', 'role']]);
    await login(bob);
    assert.deepEqual((await rows('select details from ic_directory($1)', [event]))[0].details, {
      name: 'Alice',
      role: 'Founder',
    });
    await login(alice);
    await db.query('select ic_share($1,$2)', [event, []]);
    await login(bob);
    assert.equal((await rows('select * from ic_directory($1)', [event])).length, 0);
    await login(host);
    await db.query("select ic_set_access($1,$2,'removed')", [event, bob]);
    await login(bob);
    await assert.rejects(db.query('select * from ic_directory($1)', [event]), /membership required/);
    await login(alice);
    await db.query('delete from ic_connections where id=$1', [p]);
    assert.equal((await rows('select * from ic_encounters')).length, 0);
  } finally {
    await db.close();
  }
});
