import { getSupabase, isSupabaseConfigured } from "./supabase.js";
import { getSafeInternalPath } from "./navigation.js";

/**
 * Data layer notifikasi nyata (tabel public.notifications, migration 014).
 *
 * Pola sama dengan src/lib/chat.js: error dilempar sebagai Error dengan `code`
 * bila jenisnya perlu dibedakan UI, selain itu pesan Indonesia apa adanya.
 *
 * Notifikasi DIBUAT SERVER (trigger). Modul ini hanya membaca dan menandai babaca
 * lewat RPC. Jangan menambah insert dari klien: itu akan menduplikasi notifikasi.
 */

export const NOTIFICATION_ERROR_CODES = Object.freeze({
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_CONFIGURED: "NOT_CONFIGURED",
});

export const NOTIFICATIONS_PAGE_SIZE = 30;
export const NOTIFICATION_PREVIEW_LENGTH = 100;
export const NOTIFICATION_KINDS = Object.freeze(["chat", "application", "application_status"]);

function withCode(error, code) {
  if (error && typeof error === "object") error.code = code;
  return error;
}

/** Memetakan pesan error server ke Error berbahasa Indonesia + kode. */
export function mapNotificationError(message, fallback = "Gagal memproses notifikasi.") {
  const text = String(message || "");
  if (/masuk terlebih dahulu|JWT|not authenticated/i.test(text)) {
    return withCode(new Error("Anda harus masuk terlebih dahulu."), NOTIFICATION_ERROR_CODES.NOT_AUTHENTICATED);
  }
  if (/could not find the function|PGRST202|relation .* does not exist/i.test(text)) {
    return withCode(
      new Error("Fitur notifikasi belum diterapkan pada database. Jalankan migration 014."),
      NOTIFICATION_ERROR_CODES.NOT_CONFIGURED,
    );
  }
  return new Error(text || fallback);
}

async function requireClient() {
  if (!isSupabaseConfigured()) {
    throw withCode(
      new Error("Notifikasi membutuhkan konfigurasi Supabase."),
      NOTIFICATION_ERROR_CODES.NOT_CONFIGURED,
    );
  }
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw withCode(
      new Error("Anda harus masuk terlebih dahulu untuk melihat notifikasi."),
      NOTIFICATION_ERROR_CODES.NOT_AUTHENTICATED,
    );
  }
  return { supabase, user };
}

/**
 * Cuplikan aman untuk teks notifikasi yang ditampilkan di UI.
 * Server sudah memotong ke 100 karakter; ini pengaman kedua untuk data lama.
 * @param {string} text
 * @returns {string}
 */
export function safePreview(text, max = NOTIFICATION_PREVIEW_LENGTH) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

/** Label waktu relatif singkat (mis. "Baru saja", "3 menit lalu"). */
export function formatNotificationTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "Baru saja";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} menit lalu`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} jam lalu`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} hari lalu`;
  return new Date(then).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

/**
 * Menormalisasi baris Supabase menjadi objek notifikasi UI.
 * Tautan dibatasi ke path internal agar payload server tidak bisa menjadi URL
 * eksternal bila suatu saat berubah.
 *
 * @param {Object} row
 * @returns {Object}
 */
export function mapNotificationRow(row) {
  const kind = NOTIFICATION_KINDS.includes(row.kind) ? row.kind : "other";
  const href = getSafeInternalPath(row.href, "/notifikasi");
  return {
    id: String(row.id),
    kind,
    title: row.title || "Notifikasi",
    body: safePreview(row.body || ""),
    href,
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    read: Boolean(row.read_at),
    readAt: row.read_at || null,
    createdAt: row.created_at,
    actorId: row.actor_id ? String(row.actor_id) : null,
  };
}

/**
 * Mengambil notifikasi milik pengguna yang sedang login, terbaru di atas.
 * RLS membatasi ke recipient_id = auth.uid(); filter eksplisit ditulis agar
 * tidak hanya bergantung pada RLS.
 *
 * @param {{limit?: number, unreadOnly?: boolean}} [options]
 * @returns {Promise<Array<Object>>}
 */
export async function fetchNotifications(options = {}) {
  const { limit = NOTIFICATIONS_PAGE_SIZE, unreadOnly = false } = options;
  const { supabase, user } = await requireClient();

  let query = supabase
    .from("notifications")
    .select("id, kind, title, body, href, payload, read_at, created_at, actor_id")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.is("read_at", null);

  const { data, error } = await query;
  if (error) throw mapNotificationError(error.message, "Gagal mengambil notifikasi.");
  return (data || []).map(mapNotificationRow);
}

/** Jumlah notifikasi belum dibaca milik pengguna (untuk badge lonceng). */
export async function fetchUnreadNotificationCount() {
  const { supabase, user } = await requireClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) throw mapNotificationError(error.message, "Gagal menghitung notifikasi.");
  return typeof count === "number" ? count : 0;
}

/**
 * Menandai satu notifikasi sudah dibaca.
 * Server mengembalikan false bila baris bukan milik pemanggil; tidak melempar
 * error agar UI tidak memecah alur navigasi.
 *
 * @param {string} notificationId
 * @returns {Promise<boolean>}
 */
export async function markNotificationRead(notificationId) {
  if (!notificationId) throw new Error("notification_id wajib diisi.");
  const { supabase } = await requireClient();
  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw mapNotificationError(error.message, "Gagal menandai notifikasi.");
  return data === true;
}

/** Menandai semua notifikasi milik pengguna sebagai dibaca. Mengembalikan jumlah. */
export async function markAllNotificationsRead() {
  const { supabase } = await requireClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw mapNotificationError(error.message, "Gagal menandai notifikasi.");
  return typeof data === "number" ? data : 0;
}

/**
 * Menggabungkan notifikasi realtime/lokal ke daftar tanpa duplikasi.
 * Notifikasi hanya boleh "belum dibaca -> dibaca", tidak pernah sebaliknya,
 * sehingga refresh tidak membuat status baca kembali.
 *
 * @param {Object[]} list
 * @param {Object|Object[]} incoming - baris mentah Supabase atau objek hasil map
 * @returns {Object[]}
 */
export function mergeIncomingNotifications(list, incoming) {
  const current = Array.isArray(list) ? list : [];
  const incomingRows = Array.isArray(incoming) ? incoming : [incoming];
  const next = current.slice();

  for (const item of incomingRows) {
    if (!item?.id) continue;
    const mapped = item.kind && item.title !== undefined && item.read === undefined
      ? mapNotificationRow(item)
      : item;
    const index = next.findIndex((n) => String(n.id) === String(mapped.id));
    if (index === -1) {
      next.push(mapped);
    } else {
      next[index] = {
        ...next[index],
        ...mapped,
        read: next[index].read || mapped.read,
      };
    }
  }

  next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return next;
}

/** Menandai notifikasi tertentu sebagai dibaca di state lokal (setelah RPC sukses). */
export function applyReadLocally(list, ids) {
  const set = new Set(Array.isArray(ids) ? ids.map(String) : [String(ids)]);
  const now = new Date().toISOString();
  return (Array.isArray(list) ? list : []).map((item) =>
    set.has(String(item.id)) && !item.read
      ? { ...item, read: true, readAt: item.readAt || now }
      : item,
  );
}
