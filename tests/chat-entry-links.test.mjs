// Test LOKAL (tanpa Supabase, tanpa browser) untuk pintu masuk chat.
//
// Yang diuji:
// 1. Semua tautan `/chat?...` di src/ membawa `user` DAN `post`, karena
//    halaman chat memanggil RPC get_or_create_conversation(p_post_id,
//    p_partner_id) dan tidak boleh mengarang postingan.
// 2. Tidak ada id seed demo (mis. "budi-pratama") yang dipakai sebagai partner.
// 3. Helper realtime aman dipanggil tanpa konfigurasi Supabase.
//
// PENTING: ini TIDAK membuktikan perilaku runtime terhadap database nyata.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

/** Mengumpulkan file .js/.jsx di src/ secara rekursif. */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = collectSourceFiles(SRC);
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

/** Semua literal string yang merupakan URL /chat?... */
function chatLinkLiterals() {
  const links = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const re = /`(\/chat\?[^`]*)`|"(\/chat\?[^"]*)"|'(\/chat\?[^']*)'/g;
    let match;
    while ((match = re.exec(text))) {
      links.push({ file: rel(file), href: match[1] ?? match[2] ?? match[3] });
    }
  }
  return links;
}

test("setiap tautan /chat? yang dibuat aplikasi membawa param user dan post", () => {
  const links = chatLinkLiterals();
  assert.ok(links.length > 0, "harus ada tautan chat untuk diperiksa");

  const offenders = links.filter(({ href }) => {
    const query = href.slice("/chat?".length);
    const hasUser = /(^|&)user=/.test(query);
    const hasPost = /(^|&)post=/.test(query);
    const isConversationLink = /(^|&)c=/.test(query);
    // Tautan notifikasi memakai ?c=<id> (percakapan sudah ada).
    return isConversationLink ? false : !(hasUser && hasPost);
  });

  assert.deepEqual(
    offenders.map((o) => `${o.file}: ${o.href}`),
    [],
    "tautan /chat?user= tanpa post= tidak bisa membuka percakapan",
  );
});

test("tidak ada tautan chat yang memakai id seed demo sebagai lawan bicara", () => {
  const seedIds = [
    "budi-pratama",
    "sari-wijaya",
    "post-pindahan",
    "user-demo",
  ];
  const offenders = chatLinkLiterals().filter(({ href }) =>
    seedIds.some((id) => href.includes(id)),
  );
  assert.deepEqual(
    offenders.map((o) => `${o.file}: ${o.href}`),
    [],
    "partner/post harus UUID Supabase, bukan id seed",
  );
});

test("halaman detail membuka chat setelah pengajuan dikirim", () => {
  const detailPage = fs.readFileSync(
    path.join(SRC, "app", "detail-postingan", "page.js"),
    "utf8",
  );

  assert.match(
    detailPage,
    /\["pending", "accepted"\]\.includes\(myApplication\?\.status\)[\s\S]*?<Link href=\{chatUrl\}/,
    "tautan chat detail harus tersedia untuk pengajuan pending atau accepted",
  );
  assert.match(
    detailPage,
    /Chat NeedHelp terbuka setelah pengajuan dikirim/,
    "pengguna perlu diberi penjelasan kapan chat akan terbuka",
  );
});

test("subscribeToPostChanges aman tanpa konfigurasi Supabase", async () => {
  const mod = await import("../src/lib/notification-realtime.js");
  assert.equal(typeof mod.subscribeToPostChanges, "function");

  const stopNull = mod.subscribeToPostChanges(null, () => {});
  const stopId = mod.subscribeToPostChanges("00000000-0000-0000-0000-000000000000", () => {});
  assert.equal(typeof stopNull, "function");
  assert.equal(typeof stopId, "function");
  // Tidak boleh melempar saat berhenti dipanggil.
  stopNull();
  stopId();
});
