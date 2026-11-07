// Unit test pencarian postingan tunggal (src/lib/data.js).
// Jalankan: node --test tests/
//
// REGRESI yang dijaga di sini:
//   getPostWithStatus(id) dan getPublicPost(id) sebelumnya saling memanggil:
//     getPostWithStatus -> getPost(id) || getPublicPost(id)
//     getPublicPost     -> getPostWithStatus(id)
//   Akibatnya id yang TIDAK ditemukan memicu RangeError: Maximum call stack
//   size exceeded, bukan not-found biasa (null). Test ini memastikan:
//     1. id tak dikenal -> null, dan tidak melempar error.
//     2. postingan valid -> tetap ditemukan & status aktivitas melekat benar.
//     3. getPublicPost meloloskan post aktif/selesai, tetapi bukan post batal.
//
// Catatan: modul ini dijalankan tanpa `window`, jadi getPosts() = seed lokal
// (src/data/posts.js), dan getUserPosts()/getActivityState() kosong.
// Status dari DEMO_ACTIVITIES: post-pindahan = berlangsung (aktif),
// post-belajar = selesai (closed/tidak aktif).

import test from "node:test";
import assert from "node:assert/strict";

import {
  getPost,
  getPostWithStatus,
  getPublicPost,
  isPostActive,
  getPostLifecycleStatus,
} from "../src/lib/data.js";

// Id yang dijamin ada di seed lokal src/data/posts.js.
const ACTIVE_SEED_ID = "post-pindahan"; // DEMO_ACTIVITIES: "berlangsung"
const CLOSED_SEED_ID = "post-belajar"; // DEMO_ACTIVITIES: "selesai"
const MISSING_ID = "post-tidak-ada-sama-sekali";

test("regresi: id tidak ditemukan -> null (bukan stack overflow)", () => {
  // Inti perbaikan: ketiga fungsi harus selesai normal, bukan rekursi tak
  // berujung. assert.doesNotThrow menjaga pesan kegagalan tetap jelas bila bug
  // saling-panggil muncul lagi.
  assert.doesNotThrow(() => getPostWithStatus(MISSING_ID));
  assert.equal(getPostWithStatus(MISSING_ID), null);

  assert.doesNotThrow(() => getPublicPost(MISSING_ID));
  assert.equal(getPublicPost(MISSING_ID), null);

  assert.equal(getPost(MISSING_ID), null);
});

test("regresi: id kosong/absen tetap null tanpa melempar", () => {
  for (const id of ["", null, undefined, "   ", "POST-PINDAHAN"]) {
    assert.equal(getPostWithStatus(id), null, `getPostWithStatus(${String(id)})`);
    assert.equal(getPublicPost(id), null, `getPublicPost(${String(id)})`);
  }
});

test("postingan valid ditemukan getPost dan getPostWithStatus", () => {
  const raw = getPost(ACTIVE_SEED_ID);
  assert.ok(raw, "seed post aktif harus ada di mode demo");
  assert.equal(raw.id, ACTIVE_SEED_ID);

  const withStatus = getPostWithStatus(ACTIVE_SEED_ID);
  assert.ok(withStatus, "postingan valid tidak boleh null");
  assert.equal(withStatus.id, ACTIVE_SEED_ID);
  // status aktivitas benar-benar ditempelkan (bukan objek kosong)
  assert.ok(withStatus.activity, "activity harus melekat");
  assert.equal(withStatus.activity.kind, "active");
});

test("postingan valid tetap lolos getPublicPost (perilaku tidak berubah)", () => {
  const post = getPublicPost(ACTIVE_SEED_ID);
  assert.ok(post, "post aktif harus lolos ke katalog publik");
  assert.equal(post.id, ACTIVE_SEED_ID);
  assert.equal(isPostActive(post), true);
  // Data inti tidak hilang / berubah bentuk.
  assert.equal(post.category, getPost(ACTIVE_SEED_ID).category);
  assert.equal(post.title, getPost(ACTIVE_SEED_ID).title);
});

test("getPublicPost tetap menampilkan postingan selesai sebagai penanda match", () => {
  // post-belajar ada di seed dan aktivitasnya selesai, tetapi tetap publik agar
  // pengguna lain dapat melihat penanda match dan mengajukan bantuan baru.
  assert.ok(getPost(CLOSED_SEED_ID), "post tertutup tetap ada di data");
  const withStatus = getPostWithStatus(CLOSED_SEED_ID);
  assert.equal(
    getPostLifecycleStatus(withStatus),
    "selesai",
    "postingan selesai harus terbaca sebagai selesai lewat getPostWithStatus",
  );
  const publicPost = getPublicPost(CLOSED_SEED_ID);
  assert.ok(publicPost, "postingan selesai tetap boleh lolos getPublicPost");
  assert.equal(publicPost.id, CLOSED_SEED_ID);
});

test("perilaku getPostWithStatus tidak bergantung pada getPublicPost", () => {
  // Fungsi tetap tidak boleh kembali saling memanggil walaupun post selesai kini
  // juga boleh tampil ke publik.
  const post = getPostWithStatus(CLOSED_SEED_ID);
  assert.ok(post, "getPostWithStatus harus mengembalikan post tertutup");
  assert.equal(post.id, CLOSED_SEED_ID);
});
