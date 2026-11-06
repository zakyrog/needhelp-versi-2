// Unit test alur Rating di lapisan data (src/lib/data.js).
// Jalankan: node --test tests/
//
// Supabase DIPALSUKAN lewat env dummy + stub SupabaseClient. Tidak ada request
// jaringan dan tidak ada akses database.
//
// Fokus:
// - tanpa sesi → error NOT_AUTHENTICATED (bukan daftar kosong / "tidak ditemukan")
// - resolveRateableActivity membedakan ID aktivitas vs postId tanpa menyamakannya
// - aktivitas tidak ditemukan / belum selesai / batal tetap dibedakan
// - penolakan RPC diterjemahkan, rating berhasil mengirim p_post_id (posts.id)

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import test from "node:test";
import assert from "node:assert/strict";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POST_A = "11111111-1111-4111-8111-111111111111";
const ACT_A = "99999999-9999-4999-8999-999999999999";
const POST_B = "22222222-2222-4222-8222-222222222222"; // post tanpa record activities

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

/** Stub PostgREST minimal untuk fetchActivities: posts (author_id) + activities (user_id). */
async function stubSupabase({ user = { id: ME }, rpcImpl } = {}) {
  const { getSupabase } = await loadModules();
  const client = getSupabase();
  const calls = { rpc: [], from: [] };

  client.auth.getUser = async () =>
    user ? { data: { user }, error: null } : { data: { user: null }, error: null };

  client.rpc = async (fn, args) => {
    calls.rpc.push({ fn, args });
    if (rpcImpl) return rpcImpl(fn, args);
    return { data: null, error: null };
  };

  client.from = (table) => {
    calls.from.push(table);
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      then: (onFulfilled, onRejected) => {
        const rows =
          table === "posts"
            ? [
                { id: POST_A, title: "Pindahan", author_id: ME },
                { id: POST_B, title: "Ngopi", author_id: ME },
              ]
            : table === "activities"
              ? [
                {
                  id: ACT_A,
                  post_id: POST_A,
                  user_id: ME,
                  status: "selesai",
                  partner_name: "Rina",
                  partner_id: null,
                },
              ]
              : [];
        return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  return { client, calls };
}


// ---------------------------------------------------------------------------
// fetchActivities: sesi & bentuk data
// ---------------------------------------------------------------------------

test("tanpa sesi fetchActivities melempar NOT_AUTHENTICATED, bukan array kosong", async () => {
  await stubSupabase({ user: null });
  const { data } = await loadModules();
  await assert.rejects(
    () => data.fetchActivities(),
    (err) => err.code === data.RATING_ERROR_CODES.NOT_AUTHENTICATED,
  );
});

test("dengan sesi, id aktivitas dan postId tetap berbeda; placeholder ditandai", async () => {
  await stubSupabase();
  const { data } = await loadModules();
  const rows = await data.fetchActivities();

  const real = rows.find((row) => row.id === ACT_A);
  assert.ok(real);
  assert.equal(real.postId, POST_A);
  // mapSupabaseActivityToApp tidak menulis _defaultActivity untuk record nyata;
  // yang penting adalah flag itu TIDAK bernilai true.
  assert.notEqual(real._defaultActivity, true);

  // Post tanpa record activities memakai post.id sebagai id sementara.
  // Karena id placeholder === postId, postId tidak bisa dibedakan dari id di sini.
  const placeholder = rows.find((row) => row.postId === POST_B);
  assert.equal(placeholder._defaultActivity, true);
  assert.equal(placeholder.id, POST_B);
  assert.equal(placeholder.status, "menunggu");
});

// ---------------------------------------------------------------------------
// resolveRateableActivity
// ---------------------------------------------------------------------------

const ROWS = [
  { id: ACT_A, postId: POST_A, status: "selesai", _defaultActivity: false },
  { id: POST_B, postId: POST_B, status: "menunggu", _defaultActivity: true },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", postId: "pc", status: "batal" },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", postId: "px", status: "entah" },
];

test("tanpa id maupun postId -> missing", async () => {
  const { data } = await loadModules();
  assert.equal(data.resolveRateableActivity(ROWS, {}).reason, "missing");
});

test("aktivitas tidak ditemukan -> not-found", async () => {
  const { data } = await loadModules();
  const result = data.resolveRateableActivity(ROWS, {
    activityId: "00000000-0000-4000-8000-000000000000",
  });
  assert.equal(result.reason, "not-found");
  assert.equal(result.activity, null);
});

test("aktivitas belum selesai -> pending (dibedakan dari not-found)", async () => {
  const { data } = await loadModules();
  const result = data.resolveRateableActivity(ROWS, { postId: POST_B });
  assert.equal(result.reason, "pending");
});

test("postId dicocokkan ke activities.post_id, bukan activities.id", async () => {
  const { data } = await loadModules();
  const result = data.resolveRateableActivity(ROWS, { postId: POST_A });
  assert.equal(result.reason, null);
  assert.equal(result.activity.id, ACT_A);
  assert.equal(result.postId, POST_A);
});

test("?id=<postId> hanya jatuh ke aktivitas nyata; placeholder menunggu tidak lolos", async () => {
  const { data } = await loadModules();
  // URL lama tanpa postId: matching by id gagal, fallback ke activities.post_id.
  assert.equal(data.resolveRateableActivity(ROWS, { activityId: POST_A }).activity?.id, ACT_A);
  // POST_B adalah placeholder _defaultActivity: tidak dianggap aktivitas nyata,
  // jadi dianggap tidak ditemukan (bukan "pending"/"siap dinilai").
  const result = data.resolveRateableActivity(ROWS, { activityId: POST_B });
  assert.equal(result.activity, null);
  assert.equal(result.reason, "not-found");
});

test("placeholder _defaultActivity yang terlihat selesai tidak dipakai sebagai activity", async () => {
  const { data } = await loadModules();
  const rows = [{ id: POST_B, postId: POST_B, status: "selesai", _defaultActivity: true }];
  assert.equal(data.resolveRateableActivity(rows, { activityId: POST_B }).reason, "not-found");
});

test("batal dan status tak dikenal dipisah", async () => {
  const { data } = await loadModules();
  assert.equal(
    data.resolveRateableActivity(ROWS, { activityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }).reason,
    "cancelled",
  );
  assert.equal(
    data.resolveRateableActivity(ROWS, { activityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }).reason,
    "invalid-status",
  );
});

// ---------------------------------------------------------------------------
// Helper URL & klasifikasi error
// ---------------------------------------------------------------------------

test("buildRatingUrl mempertahankan id dan postId sebagai parameter berbeda", async () => {
  const { data } = await loadModules();
  assert.equal(
    data.buildRatingUrl(ACT_A, POST_A),
    `/rating?id=${ACT_A}&postId=${POST_A}`,
  );
  assert.equal(data.buildRatingUrl(ACT_A, null), `/rating?id=${ACT_A}`);
  assert.equal(data.buildRatingUrl(null, null), "/rating");
});

test("isNotOwnerError hanya mengenali pesan kepemilikan dari RPC", async () => {
  const { data } = await loadModules();
  assert.equal(data.isNotOwnerError("Anda bukan pemilik postingan ini."), true);
  assert.equal(data.isNotOwnerError("Aktivitas belum selesai."), false);
  assert.equal(data.isNotOwnerError(undefined), false);
});

// ---------------------------------------------------------------------------
// saveRatingSupabase
// ---------------------------------------------------------------------------

const RATING = { rating: 5, comment: "Sangat membantu sekali" };

test("tanpa sesi -> NOT_AUTHENTICATED dan RPC tidak dipanggil", async () => {
  const { calls } = await stubSupabase({ user: null });
  const { data } = await loadModules();
  await assert.rejects(
    () => data.saveRatingSupabase(POST_A, RATING),
    (err) => err.code === data.RATING_ERROR_CODES.NOT_AUTHENTICATED,
  );
  assert.equal(calls.rpc.length, 0);
});

test("berhasil mengirim p_post_id = posts.id (bukan activities.id)", async () => {
  const { calls } = await stubSupabase();
  const { data } = await loadModules();
  await data.saveRatingSupabase(POST_A, RATING);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].fn, "save_activity_rating");
  assert.deepEqual(calls.rpc[0].args, {
    p_post_id: POST_A,
    p_rating: 5,
    p_comment: "Sangat membantu sekali",
  });
});

test("penolakan RPC 'bukan pemilik' diterjemahkan, bukan dilaporkan sukses", async () => {
  await stubSupabase({
    rpcImpl: () => ({ data: null, error: { message: "Anda bukan pemilik postingan ini." } }),
  });
  const { data } = await loadModules();
  await assert.rejects(() => data.saveRatingSupabase(POST_A, RATING), /bukan pemilik/i);
});

test("penolakan RPC 'belum selesai' diterjemahkan", async () => {
  await stubSupabase({
    rpcImpl: () => ({
      data: null,
      error: { message: "Aktivitas belum selesai. Selesaikan aktivitas terlebih dahulu." },
    }),
  });
  const { data } = await loadModules();
  await assert.rejects(() => data.saveRatingSupabase(POST_A, RATING), /belum selesai/i);
});

test("penolakan RPC 'tidak ditemukan' diberi kode NOT_FOUND", async () => {
  await stubSupabase({
    rpcImpl: () => ({
      data: null,
      error: { message: "Aktivitas tidak ditemukan untuk postingan ini." },
    }),
  });
  const { data } = await loadModules();
  await assert.rejects(
    () => data.saveRatingSupabase(POST_A, RATING),
    (err) => err.code === data.RATING_ERROR_CODES.NOT_FOUND,
  );
});
