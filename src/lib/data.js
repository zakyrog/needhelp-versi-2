import INITIAL_POSTS from "../data/posts.js";
import { isSupabaseConfigured, getSupabase } from "./supabase.js";

export const CURRENT_USER = {
  id: "demo-user",
  name: "Pengguna Demo",
  email: "demo@needhelp.test",
};

export const CATEGORY_LABELS = {
  ditemani: "Ditemani",
  bantuan: "Bantuan Fisik",
  pendampingan: "Pendampingan",
  explore: "Explore",
};

/** Key kategori resmi, urutannya sama dengan CATEGORY_LABELS (urutan stabil untuk seri). */
export const CATEGORY_KEYS = Object.freeze(Object.keys(CATEGORY_LABELS));

/**
 * Menghitung kategori populer dari postingan aktif yang aktual.
 *
 * - Hanya key di CATEGORY_KEYS yang dihitung; key lain diabaikan.
 * - Post dengan status siklus hidup "selesai"/"batal" (lihat getPostLifecycleStatus,
 *   sumbernya post.activity) tidak dihitung. Status yang tidak diketahui juga tidak
 *   dihitung, mengikuti isPostActive (fail-closed).
 * - Urut: jumlah terbanyak dulu; bila seri, urutan CATEGORY_KEYS (stabil).
 * - Kategori yang tersedia selalu dikembalikan semua (count 0 bila kosong),
 *   kecuali `includeEmpty: false`.
 *
 * @param {Object[]} posts
 * @param {{limit?: number, includeEmpty?: boolean}} [options]
 * @returns {{key: string, label: string, count: number}[]}
 */
export function computeCategoryCounts(posts, options = {}) {
  const { limit = CATEGORY_KEYS.length, includeEmpty = true } = options;
  const counts = new Map(CATEGORY_KEYS.map((key) => [key, 0]));

  for (const post of Array.isArray(posts) ? posts : []) {
    const key = post ? post.category : null;
    if (!counts.has(key)) continue;
    if (!isPostActive(post)) continue;
    counts.set(key, counts.get(key) + 1);
  }

  const order = new Map(CATEGORY_KEYS.map((key, index) => [key, index]));
  const rows = CATEGORY_KEYS.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    count: counts.get(key),
  }))
    .filter((row) => includeEmpty || row.count > 0)
    .sort((a, b) => b.count - a.count || order.get(a.key) - order.get(b.key));

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : rows.length;
  return rows.slice(0, safeLimit);
}

export const REGION_LABELS = {
  sleman: "Sleman",
  kota: "Kota Yogyakarta",
  bantul: "Bantul",
  kulonprogo: "Kulon Progo",
  gunungkidul: "Gunungkidul",
};

export const COMPENSATION_LABELS = {
  tarif: "Tarif Pasti",
  nego: "Nego di Chat",
  patungan: "Patungan",
  traktir: "Traktir",
  sukarela: "Sukarela",
};

export const PEOPLE = {
  "sari-wijaya": {
    id: "sari-wijaya",
    name: "Sari Wijaya",
    bio: "Mahasiswi perantau di Pogung, Sleman",
    avatar: "/assets/images/avatar-sari.svg",
    initial: "S",
    avatarClass: "avatar-teal",
    rating: "4.9 / 5.0 (dari 8 ulasan)",
    verification: "Identitas Kampus Terverifikasi",
  },
  "budi-pratama": {
    id: "budi-pratama",
    name: "Budi Pratama",
    bio: "Mahasiswa dan relawan bantuan fisik di Sleman",
    avatar: "/assets/images/avatar-budi.svg",
    initial: "B",
    avatarClass: "avatar-green",
    rating: "4.8 / 5.0 (dari 12 ulasan)",
    verification: "Identitas Kampus Terverifikasi",
  },
  "rina-putri": {
    id: "rina-putri",
    name: "Rina Putri",
    bio: "Mahasiswa dan partner belajar di Kota Yogyakarta",
    avatar: "/assets/images/avatar-rina.svg",
    initial: "R",
    avatarClass: "avatar-blue",
    rating: "4.9 / 5.0 (dari 10 ulasan)",
    verification: "Identitas Kampus Terverifikasi",
  },
};

// Seed posts diekspor untuk kompatibilitas mundur
export const DEMO_POSTS = INITIAL_POSTS;

// ---------------------------------------------------------------------------
// Supabase → App Mapping Helpers
// ---------------------------------------------------------------------------

/**
 * Menghitung label waktu relatif dari timestamp ISO.
 * @param {string} isoString - Timestamp ISO 8601
 * @returns {string} Label waktu relatif dalam bahasa Indonesia
 */
function computeTimeLabel(isoString) {
  if (!isoString) return "Baru saja";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Baru saja";

  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return "Kemarin";
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return formatDate(isoString);
}

/**
 * Memetakan baris hasil query Supabase (snake_case + JOIN profiles)
 * ke format objek post yang diharapkan aplikasi (camelCase).
 *
 * @param {Object} row - Baris dari Supabase query
 * @param {string|null} currentUserId - UUID user yang sedang login via Supabase Auth
 * @returns {Object} Objek post dalam format aplikasi
 */
export function mapSupabasePostToApp(row, currentUserId) {
  if (!row) return null;

  // Handle profiles yang mungkin null (user dihapus atau JOIN gagal)
  const profile = row.profiles || {};

  return {
    id: String(row.id),
    nature: row.nature,
    title: row.title,
    summary: row.summary || (row.description ? row.description.slice(0, 150) : ""),
    description: row.description || "",
    category: row.category,
    region: row.region,
    address: row.address || "",
    destination: row.destination || "",
    date: row.date ? String(row.date) : "",
    time: row.time ? String(row.time).slice(0, 5) : "",
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : "",
    compensation: row.compensation,
    amount: row.amount != null ? Number(row.amount) : null,
    compensationNote: row.compensation_note || "",
    authorId: String(row.author_id),
    authorName: profile.name || row.author_name || "Pengguna NeedHelp",
    authorBio: profile.bio || "Pengguna komunitas NeedHelp",
    authorAvatar: profile.avatar_url || "/assets/images/avatar-user.svg",
    authorInitial: profile.initial || (profile.name ? profile.name.charAt(0).toUpperCase() : "N"),
    // Identifier avatar ilustrasi pilihan penulis (mode Supabase). null bila
    // belum memilih → pemanggil mem-fallback ke inisial/aset lama.
    authorAvatarKey: profile.avatar_key || null,
    avatarClass: profile.avatar_class || "avatar-blue",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    timeLabel: computeTimeLabel(row.created_at),
    owned: currentUserId ? String(row.author_id) === String(currentUserId) : false,
    isDemo: Boolean(row.is_demo),
  };
}

/**
 * Cache terakhir dari fetchPosts untuk lookup sync getPost().
 * @type {Object[]}
 */
let _lastFetchedPosts = [];

/**
 * Mengambil data profiles untuk sekumpulan author_id dari Supabase.
 * Mengembalikan Map<authorId, profileData>.
 * Dilakukan sebagai query terpisah untuk menghindari ketergantungan
 * pada FK langsung antara posts dan profiles (yang mungkin belum ada
 * di schema cache Supabase).
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} authorIds - Daftar UUID penulis
 * @returns {Promise<Map<string, Object>>}
 */
async function fetchProfilesForAuthors(supabase, authorIds) {
  const uniqueIds = [...new Set(authorIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  let { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_COLUMNS_WITH_AVATAR)
    .in("id", uniqueIds);

  if (error && isMissingAvatarKeyColumn(error)) {
    ({ data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_COLUMNS)
      .in("id", uniqueIds));
  }

  if (error || !data) return new Map();

  const map = new Map();
  for (const profile of data) {
    map.set(profile.id, profile);
  }
  return map;
}

let cachedSeedPosts = null;

export const DEMO_ACTIVITIES = [
  {
    id: "act-pindahan",
    postId: "post-pindahan",
    status: "berlangsung",
    partner: "Budi Pratama",
    partnerId: "budi-pratama",
    note: "Jadwal temu disepakati pada Sabtu, 24 Oktober 2026 pukul 09.00 WIB di Pogung Baru.",
  },
  {
    id: "act-ngopi",
    postId: "post-ngopi",
    status: "menunggu",
    note: "Postingan aktif di katalog publik dan menunggu calon partner yang cocok.",
  },
  {
    id: "act-belajar",
    postId: "post-belajar",
    status: "selesai",
    partner: "Rina Putri",
    partnerId: "rina-putri",
    note: "Aktivitas selesai pada 12 Oktober 2026.",
    review: {
      rating: 5,
      comment: "Sangat ramah, komunikatif, dan penjelasannya mudah dipahami!",
    },
  },
];

export const SEED_CONVERSATIONS = {
  "budi-pratama": {
    userId: "budi-pratama",
    topic: "Bantuan Pindahan Kos & Angkat Lemari",
    messages: [
      {
        from: "me",
        text: "Halo mas Budi, untuk pindahan kos hari Sabtu jam 09.00 apakah bisa bantu angkat lemari?",
        at: "2026-10-18T14:10:00+07:00",
      },
      {
        from: "them",
        text: "Halo! Bisa banget, kebetulan saya free dari pagi sampai siang. Lokasi titik kumpul tepatnya di mana?",
        at: "2026-10-18T14:12:00+07:00",
      },
      {
        from: "me",
        text: "Di Pogung Baru Blok D, pindahnya ke kos dekat Palagan. Nanti kompensasinya Rp50.000 plus makan siang ya mas.",
        at: "2026-10-18T14:15:00+07:00",
      },
      {
        from: "them",
        text: "Siap, sepakat ya. Sampai ketemu hari Sabtu pukul 09.00 pagi!",
        at: "2026-10-18T14:18:00+07:00",
      },
    ],
  },
  "rina-putri": {
    userId: "rina-putri",
    topic: "Diskusi tugas akhir",
    messages: [
      {
        from: "me",
        text: "Rina, masih sempat diskusi bab pembahasan minggu ini?",
        at: "2026-10-17T19:40:00+07:00",
      },
      {
        from: "them",
        text: "Sempat! Kita bisa ketemu sore di Cosan Palagan. Nanti aku kabari lagi ya.",
        at: "2026-10-17T19:44:00+07:00",
      },
    ],
  },
};

// Data notifikasi simulasi (DEMO_NOTIFICATIONS) dihapus: notifikasi kini
// berasal dari tabel public.notifications (migration 014) dan dibaca lewat
// src/lib/notifications.js. Menyisakan daftar statis akan menampilkan
// notifikasi palsu bila fungsinya dipakai lagi.

export const POSTS_KEY = "needhelp.demo-posts.v1";
export const CHATS_KEY = "needhelp.demo-chats.v1";
export const ACTIVITY_STATE_KEY = "needhelp.demo-activity-state.v1";
export const STORAGE_SYNC_EVENT = "needhelp:storage-sync";

export function readJson(key, fallback) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return fallback;
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Penyimpanan browser tidak tersedia.");
  }
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(STORAGE_SYNC_EVENT, { detail: { key } }));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getPerson(id) {
  return (
    PEOPLE[id] || {
      id,
      name: "Pengguna NeedHelp",
      bio: "Pengguna komunitas NeedHelp",
      avatar: "/assets/images/avatar-user.svg",
      initial: "N",
      avatarClass: "avatar-blue",
      rating: "Belum ada rating",
      verification: "Belum diverifikasi",
    }
  );
}

export function getPostAuthor(post) {
  const person = getPerson(post.authorId);
  return {
    ...person,
    name: post.authorName || person.name,
    bio: post.authorBio || person.bio,
    avatar: post.authorAvatar || person.avatar,
    initial: post.authorInitial || person.initial,
    avatarClass: post.avatarClass || person.avatarClass,
    avatarKey: post.authorAvatarKey || person.avatarKey || null,
  };
}

export function getUserPosts() {
  const posts = readJson(POSTS_KEY, []);
  return Array.isArray(posts) ? posts : [];
}

/**
 * Mengambil data awal seed dari /data/posts.json secara dinamis di browser.
 * Jika berkas JSON diubah di public/data/posts.json, perubahan langsung terbaca.
 */
export async function fetchSeedPosts() {
  if (typeof window === "undefined") {
    return INITIAL_POSTS;
  }

  try {
    const res = await fetch(`/data/posts.json?_t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Gagal memuat sumber JSON (HTTP ${res.status})`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      cachedSeedPosts = data;
      return data;
    }
    return INITIAL_POSTS;
  } catch (err) {
    if (cachedSeedPosts) return cachedSeedPosts;
    console.warn("Gagal fetch /data/posts.json, menggunakan fallback data lokal:", err);
    return INITIAL_POSTS;
  }
}

export function getSeedPosts() {
  return cachedSeedPosts || INITIAL_POSTS;
}

/**
 * Mengambil seluruh postingan.
 * - Jika Supabase terkonfigurasi: query dari Supabase (termasuk JOIN profiles).
 *   Gagal → throw error (tidak fallback ke seed/localStorage).
 * - Jika Supabase tidak terkonfigurasi: localStorage user + seed JSON (mode demo).
 */
export async function fetchPosts({ simulateError = false } = {}) {
  // Simulasi error untuk QA testing (mode demo saja)
  if (!isSupabaseConfigured()) {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const hasSimulateParam =
        urlParams.get("simulate_error") === "1" || urlParams.get("error") === "1";
      if (simulateError || hasSimulateParam || window.__SIMULATE_FETCH_ERROR__) {
        throw new Error(
          "Simulasi error: Gagal mengambil data dari sumber JSON/API. Silakan periksa koneksi atau klik 'Coba Lagi'.",
        );
      }
    }

    const seed = await fetchSeedPosts();
    const posts = [...getUserPosts(), ...seed];
    _lastFetchedPosts = posts;
    return posts;
  }

  // --- Jalur Supabase ---
  try {
    const supabase = getSupabase();

    // Ambil user yang sedang login via Supabase Auth
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user ? user.id : null;

    // Query posts (tanpa embedded JOIN — menghindari error relasi schema cache)
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Gagal mengambil postingan dari Supabase: ${error.message}. ` +
        "Pastikan skema tabel sudah diterapkan dan RLS policies aktif.",
      );
    }

    // Ambil profiles secara terpisah untuk enrich data penulis
    const authorIds = (data || []).map((row) => row.author_id);
    const profilesMap = await fetchProfilesForAuthors(supabase, authorIds);

    // Gabungkan profile ke setiap row sebelum mapping
    const enrichedData = (data || []).map((row) => ({
      ...row,
      profiles: profilesMap.get(row.author_id) || null,
    }));

    const posts = enrichedData.map((row) => mapSupabasePostToApp(row, currentUserId));
    _lastFetchedPosts = posts;
    return posts;
  } catch (err) {
    // Propagasi error — jangan fallback diam-diam
    throw err;
  }
}

export function getPosts() {
  return [...getUserPosts(), ...getSeedPosts()];
}

/**
 * Menempelkan `activity` pada post jalur demo dari data localStorage/seed.
 *
 * Sama seperti jalur Supabase: tidak ada record → { kind: "none" } (aktif),
 * 'selesai'/'batal' → { kind: "closed" }, status tak dikenal → { kind: "unknown" }.
 * `isDemo` atau `activityStatus` kosong TIDAK pernah otomatis berarti aktif.
 *
 * @param {Object[]} posts
 * @param {Object[]} [activities]
 * @returns {Object[]}
 */
export function attachDemoActivityStatus(posts, activities = getActivities()) {
  const statusByPost = new Map(
    activities.map((activity) => [String(activity.postId), activity.status]),
  );

  return posts.map((post) => {
    if (!statusByPost.has(String(post.id))) {
      return { ...post, activity: { kind: "none", status: null, ambiguous: false } };
    }
    const status = statusByPost.get(String(post.id));
    const kind =
      status === "selesai" || status === "batal"
        ? "closed"
        : KNOWN_ACTIVITY_STATUSES.has(status)
          ? "active"
          : "unknown";
    return { ...post, activity: { kind, status, ambiguous: false } };
  });
}

export function getPostWithStatus(id) {
  const post = getPost(id);
  if (!post) return null;
  return attachDemoActivityStatus([post])[0];
}

export function getPublicPosts() {
  return attachDemoActivityStatus(getPosts()).filter(isPostActive);
}

/**
 * Mengambil postingan yang masih aktif untuk beranda dan katalog.
 *
 * Aturan status (lihat getPostLifecycleStatus): hanya "aktif" yang ditampilkan.
 * Post dengan aktivitas 'selesai' atau 'batal' tetap ada di database, hanya tidak
 * ditampilkan. Kegagalan mengambil status aktivitas dilempar sebagai error (tidak
 * di-fallback diam-diam), supaya post selesai tidak tiba-tiba muncul lagi.
 *
 * @param {Object} [options] - Opsi untuk fetchPosts
 * @returns {Promise<Object[]>}
 */
export async function fetchPublicPosts(options) {
  const posts = await fetchPosts(options);

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    const withStatus = await injectActivityStatus(supabase, posts);
    // Hanya post aktif yang disimpan ke cache sync getPost(). Post selesai/batal
    // tidak boleh muncul lagi lewat back-navigation dari cache ini.
    const activePosts = withStatus.filter(isPostActive);
    const byId = new Map(_lastFetchedPosts.map((post) => [post.id, post]));
    for (const post of withStatus) {
      if (isPostActive(post)) byId.set(post.id, post);
      else byId.delete(post.id);
    }
    _lastFetchedPosts = [...byId.values()];
    return activePosts;
  }

  const demoActivities = getActivities();
  return attachDemoActivityStatus(posts, demoActivities).filter(isPostActive);
}

// ---------------------------------------------------------------------------
// Profile CRUD (Supabase)
// ---------------------------------------------------------------------------

/** Kolom profil dasar (selalu ada sejak schema.sql). */
export const PROFILE_SELECT_COLUMNS = "id, name, bio, avatar_url, initial, avatar_class";

/**
 * Kolom profil + avatar_key (migration 015). Dipakai lebih dulu; bila kolom
 * belum ada (migration belum dijalankan) query otomatis diulang tanpa kolom
 * ini agar halaman tetap berjalan — lihat isMissingAvatarKeyColumn().
 */
export const PROFILE_SELECT_COLUMNS_WITH_AVATAR =
  "id, name, bio, avatar_url, initial, avatar_class, avatar_key";

/**
 * Menilai apakah error Supabase disebabkan kolom `avatar_key` yang belum ada
 * (migration 015 belum diterapkan). Dipakai untuk fallback select/update yang
 * aman, supaya fitur lama tetap hidup meski migration belum dijalankan.
 * @param {{code?: string, message?: string}|null|undefined} error
 * @returns {boolean}
 */
export function isMissingAvatarKeyColumn(error) {
  if (!error) return false;
  const message = String(error.message || "");
  // Postgres undefined_column = 42703; PostgREST schema-cache = PGRST204/205.
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /avatar_key/i.test(message)
  );
}

/**
 * Mengambil profil user yang sedang login dari Supabase.
 * @returns {Promise<Object|null>} Objek profil {id, name, bio, avatar_url, initial, avatar_class, avatar_key} atau null
 */
export async function fetchCurrentProfile() {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    let { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT_COLUMNS_WITH_AVATAR)
      .eq("id", user.id)
      .maybeSingle();

    // Fallback: kolom avatar_key belum ada (migration 015 belum dijalankan).
    if (error && isMissingAvatarKeyColumn(error)) {
      ({ data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT_COLUMNS)
        .eq("id", user.id)
        .maybeSingle());
    }

    if (error || !data) return null;
    // avatar_key boleh tidak ada di skema lama → normalkan ke null.
    return { avatar_key: null, ...data };
  } catch {
    return null;
  }
}

/**
 * Memperbarui profil user yang sedang login di Supabase.
 * Hanya kolom name, bio, avatar_url, initial, avatar_class, avatar_key yang
 * bisa diubah. RLS profiles_update_own memastikan user hanya bisa update
 * profil sendiri (termasuk avatar — tidak bisa mengubah avatar pengguna lain).
 *
 * @param {Object} updates - Objek berisi kolom yang ingin diubah
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
export async function updateProfile(updates) {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase belum dikonfigurasi." };
  }

  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: "Anda harus masuk terlebih dahulu." };
    }

    // Hanya izinkan kolom yang aman untuk diupdate
    const allowedFields = ["name", "bio", "avatar_url", "initial", "avatar_class", "avatar_key"];
    const safeUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return { data: null, error: "Tidak ada data yang diperbarui." };
    }

    const runUpdate = (payload) =>
      supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id)
        .select(PROFILE_SELECT_COLUMNS_WITH_AVATAR)
        .single();

    let { data, error } = await runUpdate(safeUpdates);

    // Fallback: DB belum punya kolom avatar_key (migration 015 belum jalan).
    // Buang avatar_key dari payload agar perubahan nama/bio tetap tersimpan,
    // dan laporkan keterbatasannya, bukan mengklaim sukses menyimpan avatar.
    let avatarKeySkipped = false;
    if (error && isMissingAvatarKeyColumn(error) && safeUpdates.avatar_key !== undefined) {
      const { avatar_key: _omit, ...rest } = safeUpdates;
      avatarKeySkipped = true;
      if (Object.keys(rest).length === 0) {
        return {
          data: null,
          error:
            "Kolom avatar belum tersedia di database. Jalankan migration 015 terlebih dahulu.",
        };
      }
      ({ data, error } = await runUpdate(rest));
    }

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? { avatar_key: null, ...data } : data, error: null, avatarKeySkipped };
  } catch (err) {
    return { data: null, error: err.message || "Gagal memperbarui profil." };
  }
}

/**
 * Mengambil satu postingan berdasarkan ID dari Supabase (async).
 * Gunakan ini untuk halaman detail/sukses ketika Supabase terkonfigurasi.
 *
 * @param {string} id - UUID postingan
 * @returns {Promise<Object|null>} Objek post atau null jika tidak ditemukan
 */
export async function fetchPostById(id) {
  return _fetchPostById(id, { includeActivityStatus: true });
}

async function _fetchPostById(id, { includeActivityStatus }) {
  if (!isSupabaseConfigured()) {
    // Jalur demo: status diambil dari getActivities() (seed + localStorage),
    // bukan diasumsikan aktif hanya karena ini data demo.
    return getPostWithStatus(id);
  }

  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user ? user.id : null;

    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Gagal mengambil detail postingan dari Supabase: ${error.message}`,
      );
    }

    if (!data) return null;

    // Enrich dengan profile penulis
    const profilesMap = await fetchProfilesForAuthors(supabase, [data.author_id]);
    const enriched = { ...data, profiles: profilesMap.get(data.author_id) || null };
    const mapped = mapSupabasePostToApp(enriched, currentUserId);

    if (!includeActivityStatus) return mapped;

    // Status diambil lewat RPC read-only (migration 011) agar tidak bergantung pada
    // visibilitas baris activities lewat RLS milik pemilik/partner saja.
    const statusMap = await fetchActivityStatusMap(supabase, [mapped.id]);
    return { ...mapped, activity: statusMap.get(mapped.id) || { kind: "none" } };
  } catch (err) {
    throw err;
  }
}

/**
 * Status aktivitas yang diketahui aplikasi. Nilai `status` mengikuti CHECK
 * constraint activities.status (migration 002): menunggu | berlangsung | selesai | batal.
 * @type {ReadonlySet<string>}
 */
const KNOWN_ACTIVITY_STATUSES = new Set(["menunggu", "berlangsung", "selesai", "batal"]);

/** Maksimum post_id per pemanggilan RPC get_post_activity_status (migration 011). */
export const ACTIVITY_STATUS_BATCH_SIZE = 100;

/**
 * Mengklasifikasikan hasil status aktivitas sebuah postingan menjadi kondisi yang
 * TIDAK saling dianggap sama:
 *
 * - { kind: "none" }         tidak ada baris activities (belum ada aktivitas nyata)
 * - { kind: "active", status }    status 'menunggu' / 'berlangsung'
 * - { kind: "closed", status }    status 'selesai' / 'batal'
 * - { kind: "unknown", status? }  RPC tidak mengembalikan baris untuk post ini
 *                            (tidak dapat dibaca / tidak diketahui), status tak
 *                            dikenal, atau lebih dari satu status berbeda
 * - { kind: "error", error }      RPC gagal (tidak pernah dianggap "aktif")
 *
 * Pemanggil harus memutuskan sendiri untuk "unknown" dan "error"; keduanya BUKAN
 * "aktif".
 *
 * @param {Object|null|undefined} activity
 * @returns {{kind:"none"|"active"|"closed"|"unknown"|"error", status?:string|null, error?:Error}}
 */
export function classifyActivityStatus(activity) {
  if (!activity) return { kind: "unknown" };
  if (activity.kind === "error") return { kind: "error", error: activity.error };
  if (activity.kind === "none") return { kind: "none" };

  const status = activity.status;
  if (activity.ambiguous) return { kind: "unknown", status: null };
  if (status == null) return { kind: "unknown", status: null };
  if (!KNOWN_ACTIVITY_STATUSES.has(status)) return { kind: "unknown", status };

  if (status === "selesai" || status === "batal") {
    return { kind: "closed", status };
  }
  return { kind: "active", status };
}

/**
 * Status siklus hidup postingan dari objek post.
 *
 * Status TIDAK disimpan di tabel posts. Sumbernya activities.status, dibaca lewat
 * RPC read-only get_post_activity_status (migration 011) karena RLS activities
 * hanya mengizinkan pemilik/partner membaca barisnya.
 *
 * "none" dianggap aktif karena memang belum ada aktivitas sama sekali.
 * "unknown" dan "error" TIDAK dianggap aktif.
 *
 * @returns {"aktif"|"selesai"|"batal"|"tidakDikenal"}
 */
export function getPostLifecycleStatus(post) {
  if (!post) return "tidakDikenal";
  const { kind, status } = classifyActivityStatus(post.activity);
  switch (kind) {
    case "none":
    case "active":
      return "aktif";
    case "closed":
      return status === "selesai" ? "selesai" : "batal";
    default:
      return "tidakDikenal";
  }
}

/** True bila postingan boleh muncul di beranda/katalog aktif dan menerima pengajuan baru. */
export function isPostActive(post) {
  return getPostLifecycleStatus(post) === "aktif";
}

/**
 * Mengambil peta status aktivitas lewat RPC get_post_activity_status (migration 011).
 *
 * Mengembalikan Map<postId, {kind:"active"|"closed"|"unknown", status, ambiguous}>.
 * Dua kondisi TIDAK boleh tertukar:
 * - post_id TIDAK muncul di Map → tidak ada baris activities → { kind: "none" }
 *   (diputuskan oleh pemanggil, mis. injectActivityStatus).
 * - RPC gagal (error) → dilempar sebagai Error; TIDAK di-fallback menjadi "aktif"
 *   dan tidak pernah diperlakukan sama dengan "tidak ada aktivitas".
 * Baris yang dikembalikan dengan activity_count hilang/NULL/bukan 1 → "unknown".
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} postIds
 * @returns {Promise<Map<string, {kind:string, status:string|null, ambiguous:boolean}>>}
 */
async function fetchActivityStatusMap(supabase, postIds) {
  const map = new Map();
  const uniqueIds = [...new Set(postIds.filter(Boolean).map(String))];
  if (uniqueIds.length === 0) return map;

  for (let i = 0; i < uniqueIds.length; i += ACTIVITY_STATUS_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + ACTIVITY_STATUS_BATCH_SIZE);

    const { data, error } = await supabase.rpc("get_post_activity_status", {
      p_post_ids: batch,
    });

    if (error) {
      throw new Error(
        `Gagal mengambil status aktivitas postingan: ${error.message}. ` +
        "Status postingan tidak dapat dipastikan, jadi daftar tidak ditampilkan.",
      );
    }

    for (const row of data || []) {
      // Baris yang dikembalikan RPC berarti ADA aktivitas untuk post ini.
      // Fail-closed: setiap baris dibaca sebagai aktivitas tunggal HANYA bila
      // activity_count === 1, ambiguous === false, dan status-nya tepercaya.
      // activity_count hilang/NULL/bukan 1 → "unknown" (tidak aktif).
      const rawCount = row.activity_count;
      const hasValidCount =
        rawCount !== null &&
        rawCount !== undefined &&
        rawCount !== "" &&
        Number.isFinite(Number(rawCount)) &&
        Number(rawCount) === 1;
      // `ambiguous` hanya dipercaya bila bernilai boolean literal. Nilai lain
      // (mis. string "true" dari driver/klien lain) tidak disamakan dengan true,
      // tetapi juga tidak dianggap aman: dirawat sebagai ambiguitas (fail-closed).
      const ambiguous =
        !hasValidCount || row.ambiguous !== false;
      // Hanya status string yang persis ada di daftar status yang dikenal yang
      // diterima. Angka, null, kapitalisasi berbeda ("SELESAI"), atau nilai lain
      // -> "unknown" (tidak aktif, tidak selesai).
      const status = typeof row.status === "string" ? row.status : null;
      const knownStatus = status !== null && KNOWN_ACTIVITY_STATUSES.has(status);
      const kind =
        ambiguous || !knownStatus
          ? "unknown"
          : status === "selesai" || status === "batal"
            ? "closed"
            : "active";
      map.set(String(row.post_id), {
        kind,
        status: kind === "unknown" ? null : status,
        ambiguous,
      });
    }
  }

  return map;
}

/**
 * Menempelkan `activity` (hasil klasifikasi mentah) ke sekumpulan post.
 * Satu aturan status untuk beranda, katalog, detail, dan form pengajuan.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Object[]} posts
 * @returns {Promise<Object[]>}
 */
async function injectActivityStatus(supabase, posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;

  const statusMap = await fetchActivityStatusMap(
    supabase,
    posts.map((post) => post.id),
  );

  return posts.map((post) => ({
    ...post,
    activity: statusMap.get(String(post.id)) || { kind: "none", status: null, ambiguous: false },
  }));
}

/**
 * Mengambil status aktivitas satu post (fresh, tidak dari cache).
 * Dipakai halaman detail/form agar tidak bergantung pada cache navigasi.
 *
 * @param {string} postId
 * @returns {Promise<{kind:string, status:string|null}|null>} null bila RPC gagal
 */
export async function fetchPostActivityStatus(postId) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabase();
  try {
    const statusMap = await fetchActivityStatusMap(supabase, [postId]);
    return statusMap.get(String(postId)) || { kind: "none", status: null };
  } catch (err) {
    return { kind: "error", error: err };
  }
}

/**
 * Mengambil status siklus hidup satu postingan secara ringkas untuk UI chat.
 *
 * - Postingan tidak ada (sudah dihapus) → "dihapus"
 * - Status aktivitas dari RPC 011 → aktif | selesai | batal | tidakDikenal
 * - RPC gagal → "tidakDikenal" (tidak pernah dianggap aktif)
 *
 * @param {string} postId
 * @returns {Promise<"aktif"|"selesai"|"batal"|"tidakDikenal"|"dihapus">}
 */
export async function fetchPostLifecycle(postId) {
  if (!postId) return "tidakDikenal";

  if (!isSupabaseConfigured()) {
    const post = getPostWithStatus(postId);
    if (!post) return "dihapus";
    return getPostLifecycleStatus(post);
  }

  try {
    const supabase = getSupabase();
    // Status aktivitas dan keberadaan post diperiksa sekaligus: RPC 011 hanya
    // mengembalikan baris untuk post yang masih ada di tabel posts.
    const { data, error } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .maybeSingle();
    if (error) return "tidakDikenal";
    if (!data) return "dihapus";

    const statusMap = await fetchActivityStatusMap(supabase, [postId]);
    const activity = statusMap.get(String(postId)) || { kind: "none", status: null };
    return getPostLifecycleStatus({ id: postId, activity });
  } catch {
    return "tidakDikenal";
  }
}

export function getPost(id) {
  // Coba cari di cache hasil fetch terakhir (Supabase atau demo)
  const cached = _lastFetchedPosts.find((post) => post.id === id);
  if (cached) return cached;

  // Fallback ke lookup sync lama (mode demo)
  return getPosts().find((post) => post.id === id) || null;
}

/**
 * Mengambil satu postingan yang **masih aktif**, ditempelkan status aktivitas.
 *
 * Penting: memanggil getPost(id) langsung, BUKAN getPostWithStatus(id). Kedua
 * fungsi itu sebelumnya saling memanggil sehingga id yang tidak ditemukan
 * berakhir sebagai RangeError: Maximum call stack size exceeded, alih-alih
 * not-found biasa (null). Alur sekarang satu arah:
 *   getPosts / getPublicPosts -> getPost -> getPostWithStatus -> getPublicPost
 *
 * @param {string} id
 * @returns {Object|null} postingan aktif, atau null bila tidak ada / tidak aktif
 */
export function getPublicPost(id) {
  const post = getPost(id);
  if (!post) return null;
  const [withStatus] = attachDemoActivityStatus([post]);
  if (!withStatus || !isPostActive(withStatus)) return null;
  return withStatus;
}

export function savePost(post) {
  const posts = getUserPosts();
  posts.unshift(post);
  writeJson(POSTS_KEY, posts);
  return post;
}

/**
 * Membuat postingan baru.
 * - Jika Supabase terkonfigurasi: insert ke Supabase (async, return Promise).
 *   Memerlukan user yang sudah login via Supabase Auth.
 *   Gagal → throw error.
 * - Jika Supabase tidak terkonfigurasi: simpan ke localStorage (sync, return objek langsung).
 *   Backward-compatible dengan caller yang tidak menggunakan await.
 */
export function createPost(values, user = CURRENT_USER, { simulateError = false } = {}) {
  // --- Jalur Supabase (async) ---
  if (isSupabaseConfigured()) {
    // Return Promise agar caller bisa await
    return (async () => {
      try {
        const supabase = getSupabase();

        // Verifikasi user benar-benar terautentikasi via Supabase Auth
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !authUser) {
          throw new Error(
            "Gagal membuat postingan: Anda harus masuk terlebih dahulu melalui Supabase Auth. " +
            "Autentikasi demo tidak dapat digunakan untuk menyimpan postingan ke database produksi.",
          );
        }

        const postRow = {
          nature: values.nature,
          title: values.title.trim(),
          summary: values.description.trim().slice(0, 150),
          description: values.description.trim(),
          category: values.category,
          region: values.region,
          address: values.address.trim(),
          destination: values.destination?.trim() || "",
          date: values.date,
          time: values.time,
          end_time: null,
          compensation: values.compensation,
          amount: values.compensation === "tarif" ? Number(values.amount) : null,
          compensation_note: values.compensationNote?.trim() || "",
          author_id: authUser.id,
          is_demo: false,
        };

        const { data, error } = await supabase
          .from("posts")
          .insert(postRow)
          .select("*")
          .single();

        if (error) {
          throw new Error(
            `Gagal menyimpan postingan ke Supabase: ${error.message}. ` +
            "Pastikan RLS policies mengizinkan insert dan skema tabel sudah sesuai.",
          );
        }

        if (!data) {
          throw new Error("Gagal menyimpan postingan: Supabase tidak mengembalikan data.");
        }

        // Enrich dengan profile penulis
        const profilesMap = await fetchProfilesForAuthors(supabase, [data.author_id]);
        const enriched = { ...data, profiles: profilesMap.get(data.author_id) || null };

        // Postingan baru selalu tanpa aktivitas; tandai eksplisit agar
        // getPostLifecycleStatus tidak perlu menebak.
        const mappedPost = {
          ...mapSupabasePostToApp(enriched, authUser.id),
          activity: { kind: "none", status: null, ambiguous: false },
        };

        // Tambahkan ke cache sync agar getPost() bisa menemukan postingan baru
        // tanpa harus menunggu fetchPosts() berikutnya.
        _lastFetchedPosts = [mappedPost, ..._lastFetchedPosts.filter((p) => p.id !== mappedPost.id)];

        return mappedPost;
      } catch (err) {
        // Propagasi error — jangan fallback ke localStorage, jangan laporkan sukses
        throw err;
      }
    })();
  }

  // --- Jalur Demo (sync, backward-compatible) ---
  if (typeof window !== "undefined") {
    const isSimulateTitle =
      typeof values?.title === "string" && values.title.includes("[simulasi-gagal]");
    if (simulateError || window.__SIMULATE_SAVE_ERROR__ || isSimulateTitle) {
      throw new Error(
        "Simulasi error: Gagal menyimpan data postingan ke penyimpanan lokal. Silakan coba lagi.",
      );
    }
  }

  const createdAt = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const uniqueId = `post-${Date.now()}-${randomSuffix}`;

  return savePost({
    id: uniqueId,
    nature: values.nature,
    title: values.title.trim(),
    summary: values.description.trim().slice(0, 150),
    description: values.description.trim(),
    category: values.category,
    region: values.region,
    address: values.address.trim(),
    destination: values.destination?.trim() || "",
    date: values.date,
    time: values.time,
    endTime: "",
    compensation: values.compensation,
    amount: values.compensation === "tarif" ? Number(values.amount) : null,
    compensationNote: values.compensationNote?.trim() || "",
    authorId: user.id,
    authorName: user.name,
    authorBio: "Pengguna demo NeedHelp",
    authorAvatar: "/assets/images/avatar-user.svg",
    authorInitial: (user.name || "P").charAt(0).toUpperCase(),
    avatarClass: "avatar-blue",
    createdAt,
    timeLabel: "Baru saja",
    owned: true,
  });
}

export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  if (!year || !month || !day) return isoDate;
  return `${day} ${months[month - 1]} ${year}`;
}

export function formatTimeRange(post) {
  return post.endTime
    ? `${post.time} - ${post.endTime} WIB`
    : `${post.time} WIB`;
}

export function formatRupiah(amount) {
  return `Rp${Number(amount || 0).toLocaleString("id-ID")}`;
}

export function formatCompensation(post) {
  const base = COMPENSATION_LABELS[post.compensation] || post.compensation;
  if (post.compensation === "tarif") {
    return `${formatRupiah(post.amount)}${post.compensationNote ? ` + ${post.compensationNote}` : ""}`;
  }
  return post.compensationNote ? `${base} (${post.compensationNote})` : base;
}

export function formatDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMessageTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}.${String(date.getMinutes()).padStart(2, "0")} WIB`;
}

export function filterPosts(posts, filters = {}) {
  const query = (filters.query || "").trim().toLowerCase();
  const categories = Array.isArray(filters.categories)
    ? filters.categories
    : filters.categories
      ? [filters.categories]
      : [];
  return posts.filter((post) => {
    const author = getPostAuthor(post);
    const haystack = [
      post.title,
      post.summary,
      post.description,
      author.name,
      CATEGORY_LABELS[post.category],
      REGION_LABELS[post.region],
      COMPENSATION_LABELS[post.compensation],
      post.address,
      post.destination,
    ]
      .join(" ")
      .toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (filters.type && filters.type !== "all" && post.nature !== filters.type)
      return false;
    if (categories.length && !categories.includes(post.category)) return false;
    if (filters.location && post.region !== filters.location) return false;
    if (filters.compensation && post.compensation !== filters.compensation)
      return false;
    return true;
  });
}

export function getActivityState() {
  const state = readJson(ACTIVITY_STATE_KEY, {});
  return state && typeof state === "object" ? state : {};
}

export function setActivityState(id, patch) {
  const state = getActivityState();
  state[id] = { ...(state[id] || {}), ...patch };
  writeJson(ACTIVITY_STATE_KEY, state);
}

export function getActivities() {
  const userActivities = getUserPosts().map((post) => ({
    id: post.id,
    postId: post.id,
    status: "menunggu",
    note: "Postingan aktif di katalog publik dan menunggu calon partner.",
    owned: true,
  }));
  const state = getActivityState();
  return [...userActivities, ...DEMO_ACTIVITIES].map((activity) => ({
    ...activity,
    ...(state[activity.id] || {}),
  }));
}

export function getActivity(id) {
  return getActivities().find((activity) => activity.id === id) || null;
}

export function getActivityStats(activities = getActivities()) {
  return {
    total: activities.length,
    berlangsung: activities.filter((item) => item.status === "berlangsung")
      .length,
    selesai: activities.filter((item) => item.status === "selesai").length,
    batal: activities.filter((item) => item.status === "batal").length,
  };
}

export function getRateableActivity(id) {
  if (!id) return { activity: null, reason: "missing" };
  const activity = getActivity(id);
  if (!activity) return { activity: null, reason: "not-found" };
  if (activity.status === "menunggu")
    return { activity: null, reason: "pending" };
  if (activity.status === "batal")
    return { activity: null, reason: "cancelled" };
  if (!["berlangsung", "selesai"].includes(activity.status))
    return { activity: null, reason: "invalid-status" };
  return { activity, reason: null };
}

export function saveRating(activityId, rating) {
  const { activity, reason } = getRateableActivity(activityId);
  if (!activity) {
    throw new Error(`Aktivitas tidak dapat dinilai (${reason}).`);
  }
  const stars = Number(rating?.rating);
  const comment = String(rating?.comment || "").trim();
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating harus berupa bilangan bulat 1 sampai 5.");
  }
  if (comment.length < 10) {
    throw new Error("Ulasan minimal 10 karakter.");
  }
  setActivityState(activity.id, {
    status: "selesai",
    review: { ...rating, rating: stars, comment },
  });
}

export function cancelActivity(activityId) {
  setActivityState(activityId, { status: "batal" });
}

// ---------------------------------------------------------------------------
// Activities — Supabase Integration
// ---------------------------------------------------------------------------

/**
 * Memetakan baris tabel activities ke format yang diharapkan halaman Aktivitas.
 * @param {Object} row - Baris dari Supabase query
 * @returns {Object} Objek aktivitas dalam format aplikasi
 */
function mapSupabaseActivityToApp(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    postId: String(row.post_id),
    status: row.status,
    partner: row.partner_name || "",
    partnerId: row.partner_id ? String(row.partner_id) : null,
    note: row.note || "",
    review: row.review_rating
      ? { rating: row.review_rating, comment: row.review_comment || "" }
      : null,
    owned: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Mengambil semua aktivitas milik user yang sedang login dari Supabase.
 * Aktivitas diturunkan dari postingan user + override status di tabel activities.
 *
 * Alur:
 * 1. Ambil semua postingan milik user dari tabel posts
 * 2. Ambil semua activity records milik user dari tabel activities
 * 3. Untuk setiap post: jika ada activity record → gunakan data dari activity record;
 *    jika tidak → buat aktivitas default dengan status "menunggu"
 *
 * @returns {Promise<Object[]>} Array objek aktivitas
 */
export async function fetchActivities() {
  if (!isSupabaseConfigured()) {
    // Mode demo: fallback ke fungsi sync existing
    return getActivities();
  }

  try {
    const supabase = getSupabase();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    // Jangan kembalikan [] saat sesi tidak ada: pemanggil akan mengira
    // "tidak ada aktivitas" (mis. halaman /rating menampilkan "tidak ditemukan").
    if (userError || !user) {
      const err = new Error("Anda harus masuk terlebih dahulu untuk melihat aktivitas.");
      err.code = RATING_ERROR_CODES.NOT_AUTHENTICATED;
      throw err;
    }

    // Ambil semua postingan milik user
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, title")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false });

    if (postsError) {
      throw new Error(`Gagal mengambil postingan: ${postsError.message}`);
    }

    // Ambil semua activity records milik user
    const { data: activityRecords, error: actError } = await supabase
      .from("activities")
      .select("*")
      .eq("user_id", user.id);

    if (actError) {
      throw new Error(`Gagal mengambil aktivitas: ${actError.message}`);
    }

    // Simpan status aktivitas per post agar feed/katalog bisa memfilter post
    // selesai/batal tanpa data aktivitas basi (lihat injectActivityStatus).
    // Baris activities milik user ini memang terbaca lewat RLS (activities_select_own),
    // jadi status here sama dengan hasil RPC get_post_activity_status.
    if (posts) {
      const freshStatusByPost = new Map(
        (activityRecords || []).map((act) => [String(act.post_id), act.status]),
      );
      _lastFetchedPosts = _lastFetchedPosts.map((cached) => {
        const postId = String(cached.id);
        const status = freshStatusByPost.get(postId);
        // Tidak ada record = belum ada aktivitas nyata (post masih aktif).
        // Aturan sama dengan attachDemoActivityStatus: status tak dikenal -> unknown.
        const activity = !status
          ? { kind: "none", status: null, ambiguous: false }
          : status === "selesai" || status === "batal"
            ? { kind: "closed", status, ambiguous: false }
            : KNOWN_ACTIVITY_STATUSES.has(status)
              ? { kind: "active", status, ambiguous: false }
              : { kind: "unknown", status: null, ambiguous: false };
        return { ...cached, activity };
      });
    }

    // Index activity records by post_id untuk lookup cepat
    const activityByPostId = new Map();
    for (const act of activityRecords || []) {
      activityByPostId.set(act.post_id, act);
    }

    // Gabungkan: setiap post → aktivitas (dari record atau default)
    const activities = (posts || []).map((post) => {
      const record = activityByPostId.get(post.id);
      if (record) {
        return mapSupabaseActivityToApp(record);
      }
      // Default: aktivitas menunggu tanpa record di tabel activities
      return {
        id: post.id, // Gunakan post ID sebagai activity ID sementara
        postId: String(post.id),
        status: "menunggu",
        partner: "",
        partnerId: null,
        note: "Postingan aktif di katalog publik dan menunggu calon partner.",
        review: null,
        owned: true,
        _defaultActivity: true, // Penanda bahwa ini belum punya record di DB
      };
    });

    return activities;
  } catch (err) {
    throw err;
  }
}

/**
 * Membatalkan aktivitas di Supabase menggunakan RPC cancel_activity.
 * Hanya pemilik postingan yang dapat membatalkan.
 * Status yang boleh dibatalkan: 'menunggu', 'berlangsung'.
 *
 * @param {string} postId - ID postingan terkait
 * @returns {Promise<void>}
 */
export async function cancelActivitySupabase(postId) {
  if (!isSupabaseConfigured()) {
    // Mode demo: fallback ke cancelActivity sync
    // Caller harus menyediakan activityId untuk mode demo
    throw new Error("Mode demo tidak didukung untuk cancelActivitySupabase. Gunakan cancelActivity() untuk mode demo.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { error } = await supabase.rpc("cancel_activity", {
    p_post_id: postId,
  });

  if (error) {
    if (error.message.includes("sudah selesai")) {
      throw new Error("Aktivitas yang sudah selesai tidak dapat dibatalkan.");
    }
    if (error.message.includes("sudah dibatalkan")) {
      throw new Error("Aktivitas ini sudah dibatalkan sebelumnya.");
    }
    if (error.message.includes("bukan pemilik")) {
      throw new Error("Anda bukan pemilik postingan ini.");
    }
    if (error.message.includes("tidak ditemukan")) {
      throw new Error("Aktivitas tidak ditemukan untuk postingan ini.");
    }
    throw new Error(error.message || "Gagal membatalkan aktivitas.");
  }
}

/**
 * Menyelesaikan aktivitas di Supabase (transisi "berlangsung" → "selesai").
 * Menggunakan RPC complete_activity.
 * Ini terpisah dari rating — user bisa menyelesaikan dulu, lalu memberi rating nanti.
 *
 * @param {string} postId - ID postingan terkait
 * @returns {Promise<void>}
 */
export async function completeActivitySupabase(postId) {
  if (!isSupabaseConfigured()) {
    // Mode demo: fallback ke setActivityState
    // Untuk mode demo, kita tetap butuh activityId, tapi parameter sudah diubah
    // Caller harus menyesuaikan
    throw new Error("Mode demo tidak didukung untuk completeActivitySupabase. Gunakan completeActivity() untuk mode demo.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { error } = await supabase.rpc("complete_activity", {
    p_post_id: postId,
  });

  if (error) {
    if (error.message.includes("sudah selesai")) {
      throw new Error("Aktivitas ini sudah selesai.");
    }
    if (error.message.includes("belum dimulai")) {
      throw new Error("Aktivitas belum dimulai. Mulai aktivitas terlebih dahulu.");
    }
    if (error.message.includes("dibatalkan")) {
      throw new Error("Aktivitas yang dibatalkan tidak dapat diselesaikan.");
    }
    if (error.message.includes("bukan pemilik")) {
      throw new Error("Anda bukan pemilik postingan ini.");
    }
    if (error.message.includes("belum memiliki partner")) {
      throw new Error("Aktivitas ini belum memiliki partner. Terima pengajuan bantuan terlebih dahulu.");
    }
    if (error.message.includes("tidak ditemukan")) {
      throw new Error("Aktivitas tidak ditemukan untuk postingan ini.");
    }
    throw new Error(error.message || "Gagal menyelesaikan aktivitas.");
  }
}

/**
 * Menghapus postingan dari Supabase via RPC atomik `delete_post_with_cleanup`.
 * Dalam satu transaksi PostgreSQL:
 * - Dihapus: aktivitas 'batal' milik pemilik + pengajuan berstatus 'rejected'/'withdrawn'.
 * - Menghalangi: aktivitas 'menunggu'/'berlangsung'/'selesai' (riwayat & rating),
 *   pengajuan 'pending'/'accepted', dan aktivitas 'batal' milik pengguna lain.
 * Nilai status mengikuti CHECK constraint di migrasi 002 (activities) dan 003
 * (help_applications).
 *
 * @param {string} postId - ID postingan yang akan dihapus
 * @returns {Promise<void>}
 */
export async function deletePostSupabase(postId) {
  if (!isSupabaseConfigured()) {
    // Mode demo: hapus dari localStorage
    const posts = readJson(POSTS_KEY, []);
    const filtered = posts.filter((p) => p.id !== postId);
    writeJson(POSTS_KEY, filtered);
    // Hapus juga dari cache
    _lastFetchedPosts = _lastFetchedPosts.filter((p) => p.id !== postId);
    return;
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  // Satu RPC atomik: verifikasi kepemilikan, bersihkan children yang diizinkan, dan
  // hapus postingan dalam satu transaksi. Tidak ada request DELETE terpisah.
  const { error } = await supabase.rpc("delete_post_with_cleanup", {
    p_post_id: postId,
  });

  if (error) {
    if (error.message.includes("pengajuan bantuan yang menunggu")) {
      throw new Error(
        "Postingan ini tidak dapat dihapus karena masih ada pengajuan bantuan yang menunggu keputusan. " +
        "Tolak pengajuan tersebut terlebih dahulu, lalu hapus postingan."
      );
    }
    if (error.message.includes("pengajuan yang diterima")) {
      throw new Error(
        "Postingan ini tidak dapat dihapus karena ada pengajuan yang sudah diterima. " +
        "Selesaikan atau batalkan aktivitasnya terlebih dahulu."
      );
    }
    if (error.message.includes("memiliki riwayat aktivitas")) {
      throw new Error(
        "Postingan ini tidak dapat dihapus karena memiliki aktivitas yang sedang berlangsung atau sudah selesai. " +
        "Batalkan atau selesaikan aktivitas tersebut terlebih dahulu."
      );
    }
    if (error.message.includes("bukan pemilik")) {
      throw new Error("Anda tidak memiliki izin untuk menghapus postingan ini.");
    }
    if (error.message.includes("tidak ditemukan")) {
      throw new Error("Postingan tidak ditemukan atau sudah dihapus.");
    }
    if (error.message.includes("pengguna lain")) {
      throw new Error(
        "Postingan ini memiliki aktivitas batal milik pengguna lain sehingga tidak dapat dihapus otomatis. " +
        "Silakan hubungi admin."
      );
    }
    if (error.message.includes("status yang tidak dikenali")) {
      throw new Error(
        "Postingan ini memiliki pengajuan dengan status tidak dikenal sehingga tidak dapat dihapus. " +
        "Silakan hubungi admin."
      );
    }
    if (error.message.includes("Verifikasi gagal")) {
      throw new Error(
        "Penghapusan dibatalkan karena data berubah bersamaan. Silakan coba lagi."
      );
    }
    // PGRST202: RPC belum ada di database (migrasi 009 belum dijalankan).
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message || "")) {
      throw new Error(
        "Fitur hapus postingan belum tersedia di server. Migrasi 009 belum diterapkan pada database."
      );
    }
    // PGRST301 / 42501: RLS atau hak akses menolak — jangan disamarkan sebagai
    // "riwayat aktivitas".
    if (error.code === "PGRST301" || error.code === "42501" || /permission denied|row-level security/i.test(error.message || "")) {
      throw new Error(
        "Anda tidak memiliki izin untuk menghapus postingan ini. Pastikan Anda masih masuk dengan akun pemilik postingan."
      );
    }
    // FK violation: ada tabel lain yang merujuk posts dengan ON DELETE RESTRICT
    // dan tidak dibersihkan fungsi ini. Seluruh transaksi sudah rollback.
    if (error.code === "23503" || error.message?.includes("foreign key constraint")) {
      throw new Error(
        "Postingan ini masih terhubung dengan data lain sehingga tidak dapat dihapus. " +
        "Riwayat aktivitas dan pengajuan dipertahankan untuk sistem reputasi."
      );
    }
    throw new Error(`Gagal menghapus postingan: ${error.message}`);
  }

  // Bersihkan cache lokal
  _lastFetchedPosts = _lastFetchedPosts.filter((p) => p.id !== postId);
}

/** Kode error tambahan yang bisa dikenali UI (err.code). */
export const RATING_ERROR_CODES = Object.freeze({
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_FOUND: "NOT_FOUND",
  NOT_OWNER: "NOT_OWNER",
  NOT_COMPLETED: "NOT_COMPLETED",
});

/**
 * Menentukan aktivitas mana yang akan dinilai dari daftar aktivitas milik user.
 *
 * ID aktivitas dan postId adalah dua nilai berbeda:
 * - `activityIdParam` = activities.id (URL "id")
 * - `postIdParam` = posts.id (URL "postId")
 * Keduanya dicocokkan ke kolom YANG SESUAI, dibandingkan sebagai string (UUID).
 * Catatan struktur data: di fetchActivities(), post tanpa baris activities
 * memakai post.id sebagai id sementara (`_defaultActivity: true`) — itu bukan
 * activities.id, jadi tidak boleh dipakai sebagai p_post_id ke RPC.
 *
 * @param {Object[]} activities - Hasil fetchActivities()
 * @param {{activityId?: string|null, postId?: string|null}} params
 * @returns {{activity: Object|null, reason: string|null, postId: string|null}}
 *   reason: missing | not-found | pending | cancelled | invalid-status
 */
export function resolveRateableActivity(activities, { activityId = null, postId = null } = {}) {
  const list = Array.isArray(activities) ? activities : [];
  const activityParam = activityId ? String(activityId) : null;
  const postParam = postId ? String(postId) : null;

  if (!activityParam && !postParam) {
    return { activity: null, reason: "missing", postId: null };
  }

  let found = null;
  if (activityParam) {
    found = list.find((item) => String(item?.id) === activityParam) || null;
    if (found?._defaultActivity) {
      // Placeholder: id-nya adalah post.id, bukan activities.id.
      found = null;
    }
    if (!found) {
      // Fallback URL ?id=<postId> hanya diberikan ke aktivitas nyata;
      // placeholder menunggu (id = post.id) tidak terhitung.
      found =
        list.find(
          (item) =>
            String(item?.postId) === activityParam && !item._defaultActivity,
        ) || null;
    }
  }
  if (!found && postParam) {
    found = list.find((item) => String(item?.postId) === postParam) || null;
  }

  if (!found) return { activity: null, reason: "not-found", postId: postParam };

  const effectivePostId = found.postId ? String(found.postId) : postParam;
  if (found.status === "menunggu") return { activity: null, reason: "pending", postId: effectivePostId };
  if (found.status === "batal") return { activity: null, reason: "cancelled", postId: effectivePostId };
  if (!["berlangsung", "selesai"].includes(found.status)) {
    return { activity: null, reason: "invalid-status", postId: effectivePostId };
  }
  return { activity: found, reason: null, postId: effectivePostId };
}

/** URL halaman rating yang hanya memuat parameter yang memang ada. */
export function buildRatingUrl(activityId, postId) {
  const params = new URLSearchParams();
  if (activityId) params.set("id", String(activityId));
  if (postId) params.set("postId", String(postId));
  const query = params.toString();
  return query ? `/rating?${query}` : "/rating";
}

/** True bila RPC menolak karena pemanggil bukan pemilik postingan. */
export function isNotOwnerError(message) {
  return typeof message === "string" && /bukan pemilik|kepemilikan postingan/i.test(message);
}

/** Menandai error dengan `code` agar UI bisa membedakan jenis kegagalan. */
function withCode(error, code) {
  if (error && typeof error === "object") error.code = code;
  return error;
}

/**
 * Menyimpan rating/ulasan ke Supabase menggunakan RPC save_activity_rating.
 * Rating hanya dapat diberikan setelah aktivitas selesai (status='selesai').
 * Fungsi ini TIDAK mengubah status aktivitas — gunakan completeActivitySupabase() terlebih dahulu.
 *
 * @param {string} postId - ID postingan terkait
 * @param {Object} rating - {rating: number, comment: string}
 * @returns {Promise<void>}
 */
export async function saveRatingSupabase(postId, rating) {
  if (!isSupabaseConfigured()) {
    // Mode demo: fallback ke saveRating sync
    // Caller harus menyediakan activityId untuk mode demo
    throw new Error("Mode demo tidak didukung untuk saveRatingSupabase. Gunakan saveRating() untuk mode demo.");
  }

  const supabase = getSupabase();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw withCode(new Error("Anda harus masuk terlebih dahulu."), RATING_ERROR_CODES.NOT_AUTHENTICATED);

  const stars = Number(rating?.rating);
  const comment = String(rating?.comment || "").trim();
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating harus berupa bilangan bulat 1 sampai 5.");
  }
  if (comment.length < 10) {
    throw new Error("Ulasan minimal 10 karakter.");
  }

  const { error } = await supabase.rpc("save_activity_rating", {
    p_post_id: postId,
    p_rating: stars,
    p_comment: comment,
  });

  if (error) {
    if (error.message.includes("sudah memberikan ulasan")) {
      throw new Error("Anda sudah memberikan ulasan untuk aktivitas ini.");
    }
    if (error.message.includes("belum selesai")) {
      throw new Error("Aktivitas belum selesai. Selesaikan aktivitas terlebih dahulu sebelum memberi ulasan.");
    }
    if (error.message.includes("belum dimulai")) {
      throw new Error("Aktivitas belum dimulai. Mulai dan selesaikan aktivitas terlebih dahulu.");
    }
    if (error.message.includes("dibatalkan")) {
      throw new Error("Aktivitas yang dibatalkan tidak dapat diberi ulasan.");
    }
    if (error.message.includes("bukan pemilik")) {
      throw new Error("Anda bukan pemilik postingan ini.");
    }
    if (error.message.includes("belum memiliki partner")) {
      throw new Error("Aktivitas ini belum memiliki partner. Tidak dapat memberi ulasan.");
    }
    if (error.message.includes("tidak dapat memberikan ulasan kepada diri sendiri")) {
      throw new Error("Anda tidak dapat memberikan ulasan kepada diri sendiri.");
    }
    if (error.message.includes("tidak ditemukan")) {
      throw withCode(new Error("Aktivitas tidak ditemukan untuk postingan ini."), RATING_ERROR_CODES.NOT_FOUND);
    }
    throw new Error(error.message || "Gagal menyimpan ulasan.");
  }
}

// ---------------------------------------------------------------------------
// Help Applications — RPC Wrappers
// ---------------------------------------------------------------------------

/**
 * Mengirim pengajuan bantuan untuk sebuah postingan.
 * Menggunakan RPC submit_help_application.
 *
 * @param {string} postId - ID postingan yang dituju
 * @param {Object} data - Data pengajuan
 * @param {string} data.message - Pesan untuk pemilik postingan
 * @param {string} data.contactInfo - Informasi kontak (WhatsApp, dll)
 * @param {string} data.availableTime - Waktu ketersediaan
 * @param {string} [data.extraNote] - Catatan tambahan (opsional)
 * @returns {Promise<string>} ID pengajuan yang baru dibuat
 */
export async function submitHelpApplication(postId, data) {
  if (!isSupabaseConfigured()) {
    throw new Error("Fitur pengajuan bantuan hanya tersedia dalam mode Supabase.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { data: result, error } = await supabase.rpc("submit_help_application", {
    p_post_id: postId,
    p_message: data.message || "",
    p_contact_info: data.contactInfo || "",
    p_available_time: data.availableTime || "",
    p_extra_note: data.extraNote || "",
  });

  if (error) {
    // Terjemahkan error database ke pesan yang lebih user-friendly
    if (error.message.includes("sudah memiliki pengajuan")) {
      throw new Error("Anda sudah memiliki pengajuan pending atau diterima untuk postingan ini.");
    }
    if (error.message.includes("sudah ada pengajuan yang diterima")) {
      throw new Error("Sudah ada pengajuan yang diterima untuk postingan ini.");
    }
    if (error.message.includes("tidak dapat mengajukan bantuan ke postingan sendiri")) {
      throw new Error("Anda tidak dapat mengajukan bantuan ke postingan sendiri.");
    }
    if (error.message.includes("Postingan tidak ditemukan")) {
      throw new Error("Postingan tidak ditemukan atau sudah dihapus.");
    }
    if (error.message.includes("sudah dibatalkan")) {
      throw new Error("Aktivitas ini sudah dibatalkan. Buat postingan baru jika masih membutuhkan bantuan.");
    }
    if (error.message.includes("sudah selesai")) {
      throw new Error("Aktivitas ini sudah selesai. Pengajuan tidak dapat dilakukan.");
    }
    if (error.message.includes("sudah berlangsung")) {
      throw new Error("Aktivitas ini sudah berlangsung. Pengajuan tidak dapat dilakukan.");
    }
    if (error.message.includes("Postingan tidak menerima pengajuan")) {
      throw new Error("Postingan ini sudah selesai atau dibatalkan, sehingga tidak menerima pengajuan bantuan baru.");
    }
    if (error.message.includes("Postingan belum aktif")) {
      throw new Error("Postingan ini sedang tidak aktif. Pengajuan bantuan belum dapat dikirim.");
    }
    if (error.code === "PGRST202" || /could not find the function/i.test(error.message || "")) {
      throw new Error(
        "Fitur pengajuan bantuan belum diperbarui di server. Migrasi 010 belum diterapkan pada database.",
      );
    }
    throw new Error(error.message || "Gagal mengirim pengajuan bantuan.");
  }

  return result;
}

/**
 * Mengambil pengajuan MILIK user yang sedang login untuk satu postingan.
 *
 * Aturan bisnis proyek (migration 003 + 010, partial unique index
 * uq_help_applications_pending_accepted): user tidak boleh punya lebih dari satu
 * pengajuan berstatus 'pending' atau 'accepted' untuk postingan yang sama.
 * Status 'rejected'/'withdrawn' tidak memblokir pengajuan baru — idx parsial tidak
 * mencakupnya dan RPC hanya menolak pending/accepted.
 *
 * Digunakan frontend agar tombol formulir/profil tidak menawarkan pengajuan kedua.
 * Ini BUKAN pengaman utama: RPC 010 tetap menolak duplikat di server.
 *
 * @param {string} postId - ID postingan
 * @returns {Promise<Object|null>}
 *   null bila user belum login / mode demo / belum ada pengajuan aktif;
 *   objek { id, status } bila ada pengajuan pending atau accepted.
 */
export async function getMyActiveApplicationForPost(postId) {
  if (!isSupabaseConfigured() || !postId) return null;

  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // RLS help_applications_select_own membatasi ke pengajuan milik user ini.
    // Filter applicant_id ditulis eksplisit agar tidak bergantung pada RLS saja.
    const { data, error } = await supabase
      .from("help_applications")
      .select("id, status")
      .eq("post_id", postId)
      .eq("applicant_id", user.id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Menerima pengajuan bantuan.
 * Menggunakan RPC accept_help_application.
 * Hanya pemilik postingan yang dapat menerima.
 *
 * @param {string} applicationId - ID pengajuan yang akan diterima
 * @returns {Promise<void>}
 */
export async function acceptHelpApplication(applicationId) {
  if (!isSupabaseConfigured()) {
    throw new Error("Fitur penerimaan pengajuan hanya tersedia dalam mode Supabase.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { error } = await supabase.rpc("accept_help_application", {
    p_application_id: applicationId,
  });

  if (error) {
    if (error.message.includes("sudah diterima")) {
      throw new Error("Pengajuan ini sudah diterima sebelumnya.");
    }
    if (error.message.includes("sudah ditolak")) {
      throw new Error("Pengajuan ini sudah ditolak.");
    }
    if (error.message.includes("sudah ditarik")) {
      throw new Error("Pengajuan ini sudah ditarik oleh pelamar.");
    }
    if (error.message.includes("Hanya pemilik postingan")) {
      throw new Error("Hanya pemilik postingan yang dapat menerima pengajuan.");
    }
    if (error.message.includes("sudah berlangsung")) {
      throw new Error("Aktivitas ini sudah berlangsung. Tidak dapat menerima pengajuan baru.");
    }
    if (error.message.includes("sudah selesai")) {
      throw new Error("Aktivitas ini sudah selesai. Tidak dapat menerima pengajuan baru.");
    }
    if (error.message.includes("sudah dibatalkan")) {
      throw new Error("Aktivitas ini sudah dibatalkan. Buat postingan baru jika masih membutuhkan bantuan.");
    }
    throw new Error(error.message || "Gagal menerima pengajuan.");
  }

  // RPC 004 mengembalikan void; pastikan status benar-benar berubah sebelum UI
  // melaporkan sukses. Tidak berubah = bukan pemilik postingan / baris tak terlihat.
  const { data: acceptedRow, error: verifyError } = await supabase
    .from("help_applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("status", "accepted")
    .maybeSingle();

  if (verifyError || !acceptedRow) {
    throw new Error(
      "Pengajuan tidak berhasil diterima. Muat ulang halaman dan pastikan Anda pemilik postingan.",
    );
  }
}

/**
 * Menolak pengajuan bantuan.
 * Menggunakan RPC reject_help_application.
 * Hanya pemilik postingan yang dapat menolak.
 *
 * @param {string} applicationId - ID pengajuan yang akan ditolak
 * @returns {Promise<void>}
 */
export async function rejectHelpApplication(applicationId) {
  if (!isSupabaseConfigured()) {
    throw new Error("Fitur penolakan pengajuan hanya tersedia dalam mode Supabase.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { error } = await supabase.rpc("reject_help_application", {
    p_application_id: applicationId,
  });

  if (error) {
    if (error.message.includes("sudah ditolak")) {
      throw new Error("Pengajuan ini sudah ditolak sebelumnya.");
    }
    if (error.message.includes("sudah diterima")) {
      throw new Error("Pengajuan ini sudah diterima. Tidak dapat ditolak.");
    }
    if (error.message.includes("sudah ditarik")) {
      throw new Error("Pengajuan ini sudah ditarik oleh pelamar.");
    }
    if (error.message.includes("Hanya pemilik postingan")) {
      throw new Error("Hanya pemilik postingan yang dapat menolak pengajuan.");
    }
    throw new Error(error.message || "Gagal menolak pengajuan.");
  }

  // Sama seperti accept: pastikan status benar-benar berubah.
  const { data: rejectedRow, error: verifyError } = await supabase
    .from("help_applications")
    .select("id, status")
    .eq("id", applicationId)
    .eq("status", "rejected")
    .maybeSingle();

  if (verifyError || !rejectedRow) {
    throw new Error(
      "Pengajuan tidak berhasil ditolak. Muat ulang halaman dan pastikan Anda pemilik postingan.",
    );
  }
}

/**
 * Menarik kembali pengajuan bantuan oleh pelamar sendiri.
 * Menggunakan RPC withdraw_help_application.
 *
 * @param {string} applicationId - ID pengajuan yang akan ditarik
 * @returns {Promise<void>}
 */
export async function withdrawHelpApplication(applicationId) {
  if (!isSupabaseConfigured()) {
    throw new Error("Fitur penarikan pengajuan hanya tersedia dalam mode Supabase.");
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk terlebih dahulu.");

  const { error } = await supabase.rpc("withdraw_help_application", {
    p_application_id: applicationId,
  });

  if (error) {
    if (error.message.includes("sudah ditarik")) {
      throw new Error("Pengajuan ini sudah ditarik sebelumnya.");
    }
    if (error.message.includes("sudah diterima")) {
      throw new Error("Pengajuan ini sudah diterima. Tidak dapat ditarik.");
    }
    if (error.message.includes("sudah ditolak")) {
      throw new Error("Pengajuan ini sudah ditolak. Tidak dapat ditarik.");
    }
    if (error.message.includes("Hanya pelamar")) {
      throw new Error("Hanya pelamar yang dapat menarik pengajuannya sendiri.");
    }
    throw new Error(error.message || "Gagal menarik pengajuan.");
  }
}

/**
 * Mengambil pengajuan yang terkait user yang sedang login.
 * RLS help_applications_select_post_owner + help_applications_select_own membuat
 * query mengembalikan DUA jenis baris, lalu dipisah di sini:
 * - applications:  pengajuan MASUK ke postingan milik user (pemilik boleh kelola)
 * - myApplications: pengajuan user sendiri ke postingan orang lain (hanya lihat)
 * Setiap item membawa isOwnSubmission/isPostOwner agar UI tidak menebak.
 *
 * @returns {Promise<{applications: Object[], myApplications: Object[]}>}
 */
export async function fetchMyHelpApplications() {
  if (!isSupabaseConfigured()) {
    return { applications: [], myApplications: [] };
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { applications: [], myApplications: [] };

  // Ambil baris yang boleh dibaca user: pengajuan ke postingan miliknya (RLS
  // help_applications_select_post_owner) dan pengajuannya sendiri
  // (help_applications_select_own). Pemisahan dilakukan di bawah.
  const { data, error } = await supabase
    .from("help_applications")
    .select(`
      id,
      post_id,
      applicant_id,
      message,
      contact_info,
      available_time,
      extra_note,
      status,
      created_at,
      updated_at
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Gagal mengambil daftar pengajuan: ${error.message}`);
  }

  // Identitas pemilik postingan per post_id. RLS mengembalikan dua jenis baris:
  // pengajuan yang masuk ke postingan milik user (help_applications_select_post_owner)
  // dan pengajuan milik user sendiri di postingan orang lain
  // (help_applications_select_own). Pemilik post harus dibaca eksplisit, bukan
  // disimpulkan dari applicant_id, lalu baris dipisahkan agar pemohon tidak pernah
  // mendapat tombol Terima/Tolak. Proteksi akhirnya tetap RPC 004.
  const postIds = [...new Set((data || []).map((row) => row.post_id))];
  const postAuthorMap = new Map();
  if (postIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, author_id")
      .in("id", postIds);
    if (postsError) {
      throw new Error(`Gagal mengambil pemilik postingan: ${postsError.message}`);
    }
    for (const p of posts || []) postAuthorMap.set(String(p.id), String(p.author_id));
  }
  const isPostOwner = (row) => postAuthorMap.get(String(row.post_id)) === String(user.id);

  // `applications` = pengajuan MASUK ke postingan user (boleh dikelola).
  // `myApplications` = pengajuan user sendiri ke postingan orang lain (hanya lihat).
  const incoming = [];
  const myApplications = [];
  for (const row of data || []) {
    if (isPostOwner(row)) incoming.push(row);
    else myApplications.push(row);
  }

  // Fetch profiles untuk applicant secara terpisah untuk menghindari masalah FK naming
  const applicantIds = [...new Set((data || []).map((row) => row.applicant_id))];
  let profilesMap = {};

  if (applicantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, avatar_url")
      .in("id", applicantIds);

    if (profiles) {
      for (const p of profiles) {
        profilesMap[p.id] = p;
      }
    }
  }

  const mapRow = (row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    applicantId: String(row.applicant_id),
    applicantName: profilesMap[row.applicant_id]?.name || "Pengguna",
    applicantAvatar: profilesMap[row.applicant_id]?.avatar_url || "/assets/images/avatar-user.svg",
    message: row.message || "",
    contactInfo: row.contact_info || "",
    availableTime: row.available_time || "",
    extraNote: row.extra_note || "",
    status: row.status,
    isOwnSubmission: String(row.applicant_id) === String(user.id),
    isPostOwner: isPostOwner(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return {
    applications: incoming.map(mapRow),
    myApplications: myApplications.map(mapRow),
  };
}

/**
 * Mengambil daftar pengajuan untuk sebuah postingan spesifik.
 * Hanya pemilik postingan yang dapat mengakses.
 *
 * @param {string} postId - ID postingan
 * @returns {Promise<Object[]>} Array objek pengajuan
 */
export async function fetchHelpApplicationsForPost(postId) {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("help_applications")
    .select(`
      id,
      post_id,
      applicant_id,
      message,
      contact_info,
      available_time,
      extra_note,
      status,
      created_at,
      updated_at,
      profiles!help_applications_applicant_id_fkey(name, avatar_url)
    `)
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Gagal mengambil daftar pengajuan: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    applicantId: String(row.applicant_id),
    applicantName: row.profiles?.name || "Pengguna",
    applicantAvatar: row.profiles?.avatar_url || "/assets/images/avatar-user.svg",
    message: row.message || "",
    contactInfo: row.contact_info || "",
    availableTime: row.available_time || "",
    extraNote: row.extra_note || "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getConversations() {
  const stored = readJson(CHATS_KEY, {});
  const merged = { ...SEED_CONVERSATIONS };
  if (stored && typeof stored === "object") {
    for (const [userId, conversation] of Object.entries(stored)) {
      merged[userId] = conversation;
    }
  }
  return merged;
}

export function getConversation(userId) {
  return getConversations()[userId] || null;
}

export function ensureConversation(userId, topic) {
  const conversations = getConversations();
  if (conversations[userId]) return conversations[userId];
  const person = getPerson(userId);
  const conversation = {
    userId,
    topic: topic || "Diskusi bantuan",
    messages: [
      {
        from: "them",
        text: `Halo! Saya ${person.name}. Ada yang bisa saya bantu terkait postingan ini?`,
        at: new Date().toISOString(),
      },
    ],
  };
  conversations[userId] = conversation;
  writeJson(CHATS_KEY, conversations);
  return conversation;
}

export function saveMessage(userId, text, topic) {
  const conversations = getConversations();
  const conversation =
    conversations[userId] || ensureConversation(userId, topic);
  conversation.messages.push({
    from: "me",
    text: text.trim(),
    at: new Date().toISOString(),
  });
  if (topic) conversation.topic = topic;
  conversations[userId] = conversation;
  writeJson(CHATS_KEY, conversations);
  return conversation;
}

// getNotifications/markNotificationRead/markAllNotificationsRead versi localStorage
// dihapus bersama DEMO_NOTIFICATIONS; gunakan src/lib/notifications.js.
