import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/017_parallel_conversations_and_public_reviews.sql",
  import.meta.url,
);

const migration = await readFile(migrationUrl, "utf8");

function functionBody(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} harus tersedia di migration 017`);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return migration.slice(start, next === -1 ? migration.length : next);
}

test("pengajuan baru tetap dibuka saat berlangsung maupun selesai", () => {
  const submit = functionBody("submit_help_application");
  assert.match(submit, /v_activity_status\s+NOT IN\s*\('menunggu',\s*'berlangsung',\s*'selesai'\)/i);
  assert.match(submit, /v_activity_status\s*=\s*'batal'/i);
  assert.doesNotMatch(submit, /sudah ada pengajuan yang diterima/i);
});

test("menerima satu kandidat tidak otomatis menolak kandidat pending lain", () => {
  const accept = functionBody("accept_help_application");
  assert.doesNotMatch(accept, /SET\s+status\s*=\s*'rejected'[\s\S]*status\s*=\s*'pending'/i);
  assert.match(accept, /Kandidat lain tetap dapat melanjutkan chat/i);
});

test("rating publik hanya diekspos lewat RPC aman dan dapat dibaca pengguna", () => {
  const profile = functionBody("get_public_profile");
  const reviews = functionBody("get_public_profile_reviews");
  assert.match(profile, /SECURITY DEFINER/i);
  assert.doesNotMatch(profile, /email|phone|contact_info/i);
  assert.match(reviews, /SECURITY DEFINER/i);
  assert.match(reviews, /WHERE\s+r\.reviewee_id\s*=\s*p_user_id/i);
  assert.doesNotMatch(reviews, /email|phone|contact_info/i);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_public_profile\(UUID\) TO anon, authenticated/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_public_profile_reviews\(UUID\) TO anon, authenticated/i,
  );
});
