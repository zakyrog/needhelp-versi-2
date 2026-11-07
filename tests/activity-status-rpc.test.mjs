// Unit test kontrak RPC get_post_activity_status (migration 011) ↔ frontend.
// Jalankan: node --test tests/
//
// Supabase DIPALSUKAN lewat env dummy + stub SupabaseClient. Tidak ada request
// jaringan dan tidak ada akses database.
//
// Fokus:
// - baris RPC dengan activity_count hilang/NULL/bukan 1 → gagal-tertutup ("unknown")
// - post tanpa baris RPC → "none" (tidak ada aktivitas), BUKAN sama dengan gagal
// - error RPC → dilempar (tidak diperlakukan sama dengan "tidak ada aktivitas")

// `node --test` mengisolasi process.env per file test, dan import statis di-hoist
// SEBELUM baris process.env di atas dijalankan. Karena itu modul dimuat dinamis di
// dalam test (setelah env dummy diset) dan di-cache agar semua test berbagi
// instance SupabaseClient yang sama (yang kemudian di-stub).
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import test from "node:test";
import assert from "node:assert/strict";

let modulesPromise = null;
function loadModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../src/lib/supabase.js"),
      import("../src/lib/data.js"),
    ]).then(([supabase, data]) => ({ getSupabase: supabase.getSupabase, data }));
  }
  return modulesPromise;
}


// Fixture memiliki 2 post. RPC hanya mengembalikan baris untuk post yang diuji,
// jadi post lain selalu "none" (tampil). Helper ini memeriksa post yang diuji.
const visibleIds = (posts) => posts.map((p) => p.id);
const fetchPosts = async () => (await loadModules()).data.fetchPublicPosts();

const POST_IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

async function stubSupabase({ rpcResult }) {
  const { getSupabase } = await loadModules();
  const client = getSupabase();
  client.rpc = async (fn, args) => {
    assert.equal(fn, "get_post_activity_status");
    // Pastikan semua id yang diminta dikirim dalam satu batch (< batas 100).
    assert.ok(Array.isArray(args.p_post_ids) && args.p_post_ids.length > 0);
    return rpcResult;
  };
  client.auth.getUser = async () => ({ data: { user: null }, error: null });
  // Stub minimal: tabel posts (select → order) dan profiles (select → in).
  client.from = (table) => ({
    select: () => {
      if (table === "profiles") {
        return { in: async () => ({ data: [], error: null }) };
      }
      return {
        order: async () => ({
          data: POST_IDS.map((id, i) => ({
            id,
            nature: "butuh",
            title: `Postingan uji ${i}`,
            summary: "",
            description: "Deskripsi uji.",
            category: "bantuan",
            region: "sleman",
            address: "Jalan Uji 1",
            destination: "",
            date: "2026-11-01",
            time: "10:00",
            end_time: null,
            compensation: "sukarela",
            amount: null,
            compensation_note: "",
            author_id: "33333333-3333-4333-8333-333333333333",
            is_demo: false,
            created_at: "2026-10-01T00:00:00Z",
          })),
          error: null,
        }),
      };
    },
  });
  return client;
}

test("activity_count = 1 dan status menunggu → postingan tampil (aktif)", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: "menunggu", activity_count: 1, ambiguous: false }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  // post[0] aktif → tampil; post[1] tanpa baris RPC → "none" → juga tampil.
  assert.ok(visibleIds(posts).includes(POST_IDS[0]));
});

test("status selesai tetap tampil, sedangkan status batal disembunyikan", async () => {
  await stubSupabase({
    rpcResult: {
      data: [
        { post_id: POST_IDS[0], status: "selesai", activity_count: 1, ambiguous: false },
        { post_id: POST_IDS[1], status: "batal", activity_count: 1, ambiguous: false },
      ],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.deepEqual(
    visibleIds(posts),
    [POST_IDS[0]],
    "selesai adalah penanda pernah match; hanya post batal yang disembunyikan",
  );
});

test("activity_count = 2 (duplikat walau status sama) → ambiguous, tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: null, activity_count: 2, ambiguous: true }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]), "post[0] ambiguous → tersembunyi");
});

test("activity_count hilang / NULL / bukan angka → gagal-tertutup, tidak tampil", async () => {
  for (const row of [
    { post_id: POST_IDS[0], status: "menunggu", ambiguous: false },
    { post_id: POST_IDS[0], status: "menunggu", activity_count: null, ambiguous: false },
    { post_id: POST_IDS[0], status: "menunggu", activity_count: "abc", ambiguous: false },
    { post_id: POST_IDS[0], status: "menunggu", activity_count: 0, ambiguous: false },
  ]) {
    await stubSupabase({ rpcResult: { data: [row], error: null } });
    const posts = await fetchPosts();
    assert.ok(!visibleIds(posts).includes(POST_IDS[0]), JSON.stringify(row));
  }
});

test("status tak dikenal dengan count 1 → tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: "ditunda", activity_count: 1, ambiguous: false }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]));
});

test("baris tanpa activity_count tapi ambiguous=true → tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: "selesai", ambiguous: true }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]));
});

test("status non-string (angka) dengan count 1 → unknown, tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: 123, activity_count: 1, ambiguous: false }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]));
});

test("status kapitalisasi berbeda (\"SELESAI\") → unknown, tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: "SELESAI", activity_count: 1, ambiguous: false }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]));
});

test("ambiguous berupa string \"true\" → gagal-tertutup, tidak tampil", async () => {
  await stubSupabase({
    rpcResult: {
      data: [{ post_id: POST_IDS[0], status: "menunggu", activity_count: 1, ambiguous: "true" }],
      error: null,
    },
  });
  const posts = await fetchPosts();
  assert.ok(!visibleIds(posts).includes(POST_IDS[0]));
});

test("ambiguous bukan boolean literal (hilang/dll) → gagal-tertutup, tidak tampil", async () => {
  for (const row of [
    { post_id: POST_IDS[0], status: "menunggu", activity_count: 1 },
    { post_id: POST_IDS[0], status: "menunggu", activity_count: 1, ambiguous: 1 },
    { post_id: POST_IDS[0], status: "menunggu", activity_count: 1, ambiguous: "false" },
  ]) {
    await stubSupabase({ rpcResult: { data: [row], error: null } });
    const posts = await fetchPosts();
    assert.ok(!visibleIds(posts).includes(POST_IDS[0]), JSON.stringify(row));
  }
});

test("keempat status valid dengan count 1 dan ambiguous=false berperilaku benar", async () => {
  const expected = {
    menunggu: true,
    berlangsung: true,
    selesai: true,
    batal: false,
  };
  for (const [status, visible] of Object.entries(expected)) {
    await stubSupabase({
      rpcResult: {
        data: [{ post_id: POST_IDS[0], status, activity_count: 1, ambiguous: false }],
        error: null,
      },
    });
    const posts = await fetchPosts();
    assert.equal(
      visibleIds(posts).includes(POST_IDS[0]),
      visible,
      `status ${status} → visible=${visible}`,
    );
    const post = posts.find((p) => p.id === POST_IDS[0]);
    if (post) assert.equal(post.activity.status, status);
  }
});

test("post tanpa baris RPC → tidak ada aktivitas → tampil (berbeda dari gagal RPC)", async () => {
  await stubSupabase({ rpcResult: { data: [], error: null } });
  const posts = await fetchPosts();
  assert.equal(posts.length, 2);
  for (const post of posts) assert.equal(post.activity.kind, "none");
});

test("error RPC → dilempar, tidak dianggap 'tidak ada aktivitas'", async () => {
  await stubSupabase({ rpcResult: { data: null, error: { message: "koneksi gagal" } } });
  await assert.rejects(fetchPosts, /Gagal mengambil status aktivitas postingan/);
});
