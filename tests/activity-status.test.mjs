// Unit test klasifikasi status aktivitas (src/lib/data.js).
// Jalankan: node --test tests/
//
// Fokus: memastikan kondisi "tidak ada aktivitas", "aktif", "selesai/batal",
// "tidak diketahui", dan "RPC gagal" TIDAK saling tertukar, dan bahwa hanya
// kondisi yang benar-benar aktif yang lolos ke beranda/katalog/form.

import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyActivityStatus,
  getPostLifecycleStatus,
  isPostActive,
  attachDemoActivityStatus,
} from "../src/lib/data.js";

const active = (status) => ({ kind: "active", status, ambiguous: false });
const closed = (status) => ({ kind: "closed", status, ambiguous: false });
const none = { kind: "none", status: null, ambiguous: false };
const failed = { kind: "error", error: new Error("rpc down") };

test("tanpa aktivitas -> none -> aktif", () => {
  assert.equal(classifyActivityStatus(none).kind, "none");
  assert.equal(getPostLifecycleStatus({ activity: none }), "aktif");
  assert.equal(isPostActive({ activity: none }), true);
});

test("menunggu/berlangsung -> aktif", () => {
  for (const status of ["menunggu", "berlangsung"]) {
    assert.equal(classifyActivityStatus(active(status)).kind, "active");
    assert.equal(getPostLifecycleStatus({ activity: active(status) }), "aktif");
    assert.equal(isPostActive({ activity: active(status) }), true);
  }
});

test("selesai/batal -> closed -> tidak aktif", () => {
  assert.equal(getPostLifecycleStatus({ activity: closed("selesai") }), "selesai");
  assert.equal(getPostLifecycleStatus({ activity: closed("batal") }), "batal");
  assert.equal(isPostActive({ activity: closed("selesai") }), false);
  assert.equal(isPostActive({ activity: closed("batal") }), false);
});

test("status tak dikenal tidak pernah dianggap aktif", () => {
  const odd = { kind: "active", status: "ditunda", ambiguous: false };
  assert.equal(classifyActivityStatus(odd).kind, "unknown");
  assert.equal(isPostActive({ activity: odd }), false);
  assert.equal(getPostLifecycleStatus({ activity: odd }), "tidakDikenal");
});

test("hasil ambigu (>1 aktivitas) tidak memilih status secara sembarang", () => {
  const ambiguous = { kind: "unknown", status: null, ambiguous: true };
  assert.equal(classifyActivityStatus(ambiguous).kind, "unknown");
  assert.equal(isPostActive({ activity: ambiguous }), false);
});

test("kegagalan RPC tidak pernah dianggap aktif", () => {
  assert.equal(classifyActivityStatus(failed).kind, "error");
  assert.equal(isPostActive({ activity: failed }), false);
  assert.equal(getPostLifecycleStatus({ activity: failed }), "tidakDikenal");
});

test("post tanpa data activity / post kosong tidak otomatis aktif", () => {
  assert.equal(classifyActivityStatus(undefined).kind, "unknown");
  assert.equal(isPostActive({}), false);
  assert.equal(isPostActive(null), false);
  assert.equal(getPostLifecycleStatus(null), "tidakDikenal");
});

test("isDemo atau activityStatus kosong bukan alasan otomatis aktif", () => {
  assert.equal(isPostActive({ isDemo: true }), false);
  assert.equal(isPostActive({ isDemo: true, activityStatus: "" }), false);
  assert.equal(isPostActive({ activityStatus: null }), false);
});

test("jalur demo: status dari getActivities mengikuti aturan yang sama", () => {
  const posts = [
    { id: "p-none" },
    { id: "p-wait", isDemo: true },
    { id: "p-done", isDemo: true },
    { id: "p-cancel" },
    { id: "p-odd" },
  ];
  const activities = [
    { postId: "p-wait", status: "menunggu" },
    { postId: "p-done", status: "selesai" },
    { postId: "p-cancel", status: "batal" },
    { postId: "p-odd", status: "entah" },
  ];

  const withStatus = attachDemoActivityStatus(posts, activities);
  const visible = withStatus.filter(isPostActive).map((post) => post.id);

  assert.deepEqual(visible, ["p-none", "p-wait"]);
  assert.equal(isPostActive({ isDemo: true, activity: none }), true);
});
