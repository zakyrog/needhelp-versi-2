// Unit test LOKAL modul notifikasi (src/lib/notifications.js) dan pekerjaan
// SQL statis migration 014. Jalankan: node --test tests/
//
// PENTING: PostgreSQL TIDAK tersedia di lingkungan ini. Test ini TIDAK
// mengeksekusi SQL database dan tidak membuktikan migration 014 valid. Yang
// diuji: logika merge/baca/waktu di klien, pemetaan error, dan keberadaan
// aturan penting di file SQL (RLS, recipient check, trigger, hak akses).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SQL_014 = path.join(ROOT, "supabase", "migrations", "014_notifications.sql");

let modulesPromise = null;
function loadLib() {
  if (!modulesPromise) {
    modulesPromise = import("../src/lib/notifications.js");
  }
  return modulesPromise;
}

// ---------------------------------------------------------------------------
// Klien
// ---------------------------------------------------------------------------

test("safePreview melipat spasi dan memotong ke 100 karakter", async () => {
  const { safePreview } = await loadLib();
  assert.equal(safePreview("Halo\n\n  dunia "), "Halo dunia");
  const long = "a".repeat(300);
  const preview = safePreview(long);
  assert.equal(preview.length, 100);
  assert.ok(preview.endsWith("…"));
});

test("mapNotificationRow membatasi tautan ke path internal", async () => {
  const { mapNotificationRow } = await loadLib();
  const internal = mapNotificationRow({
    id: "1", kind: "chat", title: "T", body: "B", href: "/chat?c=x",
    payload: { conversation_id: "x" }, read_at: null, created_at: "2026-10-29T00:00:00Z",
  });
  assert.equal(internal.href, "/chat?c=x");
  assert.equal(internal.read, false);
  assert.equal(internal.kind, "chat");

  const external = mapNotificationRow({
    id: "2", kind: "chat", title: "T", body: "B", href: "javascript:alert(1)",
  });
  assert.equal(external.href, "/notifikasi");

  const protocolRelative = mapNotificationRow({
    id: "2b", kind: "chat", title: "T", body: "B", href: "//evil.example/chat",
  });
  assert.equal(protocolRelative.href, "/notifikasi");

  const unknownKind = mapNotificationRow({ id: "3", kind: "hacked", title: "T", body: "B", href: "/x" });
  assert.equal(unknownKind.kind, "other");
});

test("mergeIncomingNotifications tidak menduplikasi dan tidak menghidupkan kembali status baca", async () => {
  const { mergeIncomingNotifications, applyReadLocally } = await loadLib();
  const first = mergeIncomingNotifications([], [
    { id: "a", kind: "chat", title: "A", body: "x", href: "/chat?c=1", read_at: null, created_at: "2026-10-29T01:00:00Z" },
    { id: "b", kind: "application", title: "B", body: "y", href: "/pengajuan", read_at: null, created_at: "2026-10-29T00:00:00Z" },
  ]);
  assert.deepEqual(first.map((n) => n.id), ["a", "b"], "terbaru di atas");

  const read = applyReadLocally(first, ["a"]);
  assert.equal(read.find((n) => n.id === "a").read, true);

  // Event realtime/refresh untuk baris yang sama dengan read_at null tidak boleh
  // mengembalikan "sudah dibaca" menjadi "belum dibaca".
  const again = mergeIncomingNotifications(read, {
    id: "a", kind: "chat", title: "A", body: "x", href: "/chat?c=1", read_at: null, created_at: "2026-10-29T01:00:00Z",
  });
  assert.equal(again.length, 2, "tidak ada duplikat");
  assert.equal(again.find((n) => n.id === "a").read, true);

  // Baris yang datang sudah dibaca tetap dibaca.
  const confirmed = mergeIncomingNotifications(again, {
    id: "b", kind: "application", title: "B", body: "y", href: "/pengajuan", read_at: "2026-10-29T03:00:00Z", created_at: "2026-10-29T00:00:00Z",
  });
  assert.equal(confirmed.find((n) => n.id === "b").read, true);
});

test("applyReadLocally hanya mengubah id yang diminta", async () => {
  const { applyReadLocally } = await loadLib();
  const list = [
    { id: "1", read: false, readAt: null },
    { id: "2", read: false, readAt: null },
  ];
  const out = applyReadLocally(list, "1");
  assert.equal(out[0].read, true);
  assert.equal(out[1].read, false);
});

test("formatNotificationTime menghasilkan label relatif", async () => {
  const { formatNotificationTime } = await loadLib();
  const now = Date.now();
  assert.equal(formatNotificationTime(new Date(now - 10_000).toISOString()), "Baru saja");
  assert.equal(formatNotificationTime(new Date(now - 5 * 60_000).toISOString()), "5 menit lalu");
  assert.equal(formatNotificationTime(new Date(now - 2 * 3_600_000).toISOString()), "2 jam lalu");
  assert.equal(formatNotificationTime(null), "");
});

test("mapNotificationError menerjemahkan sesi habis dan migrasi belum diterapkan", async () => {
  const { mapNotificationError, NOTIFICATION_ERROR_CODES } = await loadLib();
  assert.equal(
    mapNotificationError("JWT expired").code,
    NOTIFICATION_ERROR_CODES.NOT_AUTHENTICATED,
  );
  assert.equal(
    mapNotificationError("Could not find the function public.mark_notification_read").code,
    NOTIFICATION_ERROR_CODES.NOT_CONFIGURED,
  );
  assert.equal(mapNotificationError("boom").message, "boom");
});

// ---------------------------------------------------------------------------
// Pekerjaan SQL statis migration 014 (bukan eksekusi!)
// ---------------------------------------------------------------------------

const sql = fs.readFileSync(SQL_014, "utf8");

test("014 membuat tabel notifications dengan recipient/actor/kind yang dibatasi", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.notifications/);
  assert.match(sql, /recipient_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /actor_id\s+UUID REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  assert.match(sql, /kind\s+TEXT NOT NULL\s+CHECK \(kind IN \('chat', 'application', 'application_status'\)\)/);
  assert.match(sql, /CHECK \(actor_id IS NULL OR actor_id <> recipient_id\)/);
});

test("014 mengaktifkan RLS dan hanya memberi policy SELECT milik sendiri", () => {
  assert.match(sql, /ALTER TABLE public\.notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY notifications_select_own[\s\S]*?USING \(recipient_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.doesNotMatch(sql, /CREATE POLICY [^;]*FOR INSERT/);
  assert.doesNotMatch(sql, /CREATE POLICY [^;]*FOR UPDATE/);
  assert.doesNotMatch(sql, /CREATE POLICY [^;]*FOR DELETE/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/);
});

test("014: RPC tanda baca dibatasi recipient_id pemanggil dan dicabut dari anon", () => {
  assert.match(sql, /WHERE id = p_notification_id\s+AND recipient_id = v_caller_id/);
  assert.match(sql, /WHERE recipient_id = v_caller_id\s+AND read_at IS NULL/);
  for (const fn of ["mark_notification_read\\(UUID\\)", "mark_all_notifications_read\\(\\)", "mark_conversation_read\\(UUID\\)"]) {
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn} FROM PUBLIC;`));
    assert.match(sql, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn} FROM anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn} TO authenticated;`));
  }
  assert.match(sql, /SET search_path = ''/);
  // Penanda baca tidak boleh diubah menjadi belum dibaca
  assert.doesNotMatch(sql, /SET read_at = NULL/);
});

test("014: notifikasi chat dikirim ke lawan bicara, bukan pengirim", () => {
  assert.match(sql, /CREATE TRIGGER messages_notify_recipient\s+AFTER INSERT ON public\.messages/);
  assert.match(sql, /IF NEW\.sender_id = v_owner_id THEN\s+v_recipient_id := v_partner_id;/);
  assert.match(sql, /ELSIF NEW\.sender_id = v_partner_id THEN\s+v_recipient_id := v_owner_id;/);
  assert.match(sql, /v_recipient_id = NEW\.sender_id/);
  assert.match(sql, /'\/chat\?c=' \|\| NEW\.conversation_id::TEXT/);
});

test("014: pengajuan baru dikirim ke pemilik, bukan pengaju", () => {
  assert.match(sql, /CREATE TRIGGER help_applications_notify_owner\s+AFTER INSERT OR UPDATE OF status ON public\.help_applications/);
  assert.match(sql, /IF TG_OP = 'INSERT' THEN/);
  assert.match(sql, /IF NEW\.applicant_id = v_post_author THEN\s+RETURN NEW;/);
  assert.match(sql, /v_post_author,\s+NEW\.applicant_id,\s+'application'/);
});

test("014: perubahan status hanya memberi notifikasi pada transisi nyata ke pihak terdampak", () => {
  assert.match(sql, /IF NEW\.status IS NOT DISTINCT FROM OLD\.status THEN\s+RETURN NEW;/);
  assert.match(sql, /NEW\.status = 'withdrawn' AND OLD\.status = 'pending'[\s\S]*?v_recipient_id := v_post_author;/);
  assert.match(sql, /NEW\.status IN \('accepted', 'rejected'\) AND OLD\.status = 'pending'[\s\S]*?v_recipient_id := NEW\.applicant_id;/);
  assert.match(sql, /v_recipient_id = v_actor/);
  // actor_id + nama yang ditampilkan adalah PELAKU (pemilik yang menerima/
  // menolak, pelamar yang menarik), bukan pengaju.
  assert.match(sql, /v_actor := v_post_author;[\s\S]*?SELECT COALESCE\(NULLIF\(btrim\(p\.name\), ''\), 'Pengguna NeedHelp'\)\s+INTO v_actor_name\s+FROM public\.profiles p\s+WHERE p\.id = v_actor;/);
  assert.match(sql, /v_actor_name \|\| ' ' \|\| v_status_label/);
  // Tidak ada variabel/set yang tidak dideklarasikan
  assert.doesNotMatch(sql, /v_other_name/);
});

test("014 menambahkan notifications ke realtime secara idempoten", () => {
  assert.match(sql, /pg_publication_tables[\s\S]*?tablename = 'notifications'/);
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notifications;/);
});
test("014: tabel notifications yang sudah ada diverifikasi terhadap skema asumsi", () => {
  // CREATE TABLE IF NOT EXISTS tidak membandingkan skema, jadi blok 2b wajib
  // memastikan kolom yang dipakai RPC/trigger benar-benar ada.
  assert.match(sql, /2b\. Verifikasi tabel yang SUDAH ADA/);
  assert.match(
    sql,
    /FOREACH v_column IN ARRAY ARRAY\[\s*'id', 'recipient_id', 'actor_id', 'kind',\s*'title', 'body', 'href', 'payload', 'read_at', 'created_at'\s*\]/,
    "daftar kolom wajib lengkap",
  );
  assert.match(sql, /FROM information_schema\.columns/, "kolom dicek lewat information_schema");
  assert.match(sql, /data_type = 'text'/, "kind harus text");
  assert.match(sql, /data_type = 'jsonb'/, "payload harus jsonb");
  assert.match(sql, /''chat''[\s\S]*?''application''[\s\S]*?''application_status''/, "nilai kind dibutuhkan frontend/trigger");
  assert.match(sql, /relrowsecurity/, "RLS pada tabel lama diperiksa");
});

test("014 mendokumentasikan batas perilaku yang tidak diverifikasi otomatis", () => {
  // Bagian ini penting untuk penerapan manual: menjelaskan efek berantai
  // accept_help_application (auto-reject pelamar lain), ketergantungan realtime,
  // dan notifikasi lama setelah postingan dihapus.
  assert.match(sql, /BATASAN YANG TIDAK DIJAMIN OLEH MIGRATION INI/);
  assert.match(sql, /accept_help_application \(004\) ikut MENGUBAH pengajuan pending lain/);
  assert.match(sql, /Notifikasi TIDAK dihapus saat postingan dihapus/);
});

test("014 menambahkan posts ke realtime untuk pembaruan kartu Topik Percakapan", () => {
  assert.match(sql, /tablename = 'posts'[\s\S]*?ALTER PUBLICATION supabase_realtime ADD TABLE public\.posts;/);
  // Keduanya harus tetap bersyarat pada keberadaan publikasi.
  const adds = sql.match(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.\w+;/g) || [];
  assert.deepEqual(adds, [
    "ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;",
    "ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;",
  ]);
});
