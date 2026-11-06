import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/016_trusted_contact_and_reciprocal_reviews.sql", import.meta.url),
  "utf8",
);

test("WhatsApp hanya dikembalikan setelah kedua pihak setuju", () => {
  assert.match(migration, /v_my_phone IS NOT NULL AND v_partner_phone IS NOT NULL/);
  assert.match(migration, /THEN v_partner_phone/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.conversation_contact_shares FROM authenticated/);
});

test("nomor kontak ditulis hanya oleh pemilik nomor melalui auth.uid", () => {
  assert.match(migration, /v_caller UUID := \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /conversation_id, user_id, whatsapp_number/);
  assert.match(migration, /p_conversation_id, v_caller, v_phone/);
});

test("ulasan timbal balik menentukan penerima dari peran peserta", () => {
  assert.match(migration, /IF v_caller = v_activity\.user_id THEN[\s\S]*v_reviewee := v_activity\.partner_id/);
  assert.match(migration, /ELSIF v_caller = v_activity\.partner_id THEN[\s\S]*v_reviewee := v_activity\.user_id/);
  assert.match(migration, /UNIQUE \(activity_id, reviewer_id\)/);
});
