import test from "node:test";
import assert from "node:assert/strict";

import { getSafeInternalPath } from "../src/lib/navigation.js";

test("getSafeInternalPath menerima path lokal lengkap", () => {
  assert.equal(
    getSafeInternalPath("/katalog?q=teman#hasil"),
    "/katalog?q=teman#hasil",
  );
});

test("getSafeInternalPath menolak redirect keluar aplikasi", () => {
  assert.equal(getSafeInternalPath("https://evil.example"), "/");
  assert.equal(getSafeInternalPath("//evil.example/path"), "/");
  assert.equal(getSafeInternalPath("/\\evil.example"), "/");
  assert.equal(getSafeInternalPath("javascript:alert(1)"), "/");
});

test("getSafeInternalPath memakai fallback yang diberikan", () => {
  assert.equal(getSafeInternalPath(null, "/katalog"), "/katalog");
});
