"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getActivity,
  getPost,
  fetchActivities,
  fetchPosts,
  fetchMyHelpApplications,
  formatDate,
  formatTimeRange,
  formatCompensation,
  REGION_LABELS,
  CATEGORY_LABELS,
} from "../../../lib/data.js";
import { readSession } from "../../../lib/auth.js";
import { isSupabaseConfigured } from "../../../lib/supabase.js";
import { EmptyState } from "../../../components/EmptyState";
import { SvgIcon } from "../../../components/Icons.jsx";

// Label jenis postingan — sama dengan yang dipakai katalog & detail postingan.
const NATURE_LABELS = { butuh: "Saya Butuh", bisa: "Saya Bisa" };

/**
 * Detail satu aktivitas.
 *
 * Halaman ini HANYA menampilkan data yang sudah tersedia lewat helper data
 * yang ada (aktivitas, postingan terkait, partner, pengajuan, ulasan). Tidak
 * ada data baru yang dibuat dan tidak ada aturan status yang diubah: CTA yang
 * tampil mengikuti aturan yang sama dengan halaman /aktivitas dan /pengajuan.
 */
export default function DetailAktivitasPage() {
  const router = useRouter();
  const params = useParams();
  const activityId = decodeURIComponent(
    Array.isArray(params?.id) ? params.id[0] : params?.id || "",
  );

  const supabaseMode = isSupabaseConfigured();

  const [session, setSession] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  // Ringkasan pengajuan (hanya di mode Supabase dan bila data tersedia).
  const [applications, setApplications] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    const currentSession = readSession();
    setSession(currentSession);

    if (!currentSession) {
      setLoading(false);
      return () => { isCancelled = true; };
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    const applyActivity = (found) => {
      if (!found) {
        // Aktivitas milik user lain / tidak ada: jangan tampilkan data apa pun.
        setActivity(null);
        setNotFound(true);
        return;
      }
      setActivity(found);
    };

    if (supabaseMode) {
      // Cache post dibutuhkan getPost() untuk judul & detail postingan.
      fetchPosts()
        .then(() => fetchActivities())
        .then((list) => {
          if (isCancelled) return;
          const found = (list || []).find(
            (item) =>
              String(item.id) === activityId || String(item.postId) === activityId,
          );
          applyActivity(found || null);
          setLoading(false);

          // Ringkasan pengajuan: hanya untuk postingan sendiri, dan kegagalan
          // di sini tidak boleh menggagalkan halaman detail.
          if (found?.postId) {
            fetchMyHelpApplications()
              .then((result) => {
                if (isCancelled) return;
                const all = [
                  ...(result?.applications || []),
                  ...(result?.myApplications || []),
                ].filter((app) => String(app.postId) === String(found.postId));
                setApplications(all);
              })
              .catch(() => {
                if (!isCancelled) setApplications(null);
              });
          }
        })
        .catch((err) => {
          if (isCancelled) return;
          setError(err.message || "Gagal memuat detail aktivitas.");
          setLoading(false);
        });
    } else {
      // Mode demo: pencarian sync dari seed + state localStorage.
      const found =
        getActivity(activityId) ||
        null;
      applyActivity(found);
      setLoading(false);
    }

    return () => { isCancelled = true; };
  }, [activityId, supabaseMode]);

  // --- Loading ---
  if (loading) {
    return (
      <main>
        <div className="activity-detail-wrap">
          <p className="activity-detail-loading" role="status">
            Memuat detail aktivitas...
          </p>
        </div>
      </main>
    );
  }

  // --- Belum login ---
  if (!session) {
    return (
      <main>
        <div className="activity-detail-wrap">
          <EmptyState
            icon="🔒"
            title="Masuk untuk Melihat Detail Aktivitas"
            description="Silakan masuk terlebih dahulu untuk melihat detail aktivitas bantuan Anda."
            actionText="Masuk Sekarang"
            onAction={() =>
              router.push(
                `/login?next=${encodeURIComponent(`/aktivitas/${activityId}`)}`,
              )
            }
          />
        </div>
      </main>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <main>
        <div className="activity-detail-wrap">
          <EmptyState
            icon="⚠️"
            title="Gagal Memuat Detail Aktivitas"
            description={error}
            actionText="Coba Lagi"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  // --- Tidak ditemukan / bukan milik user ---
  if (notFound || !activity) {
    return (
      <main>
        <div className="activity-detail-wrap">
          <EmptyState
            icon="📋"
            title="Aktivitas Tidak Ditemukan"
            description="Aktivitas ini tidak ada atau bukan milik akunmu. Buka daftar aktivitas untuk melihat yang tersedia."
            actionText="Buka Daftar Aktivitas"
            onAction={() => router.push("/aktivitas")}
          />
        </div>
      </main>
    );
  }

  const post = getPost(activity.postId);
  const isCancelled = activity.status === "batal";
  // Aturan sama dengan halaman /aktivitas: aktivitas batal tidak membuka
  // detail postingan.
  const canOpenPost = Boolean(post && !isCancelled);

  const statusMeta = {
    menunggu: { label: "Menunggu", icon: "hourglass" },
    berlangsung: { label: "Sedang Berjalan", icon: "clock" },
    selesai: { label: "Selesai", icon: "check" },
    batal: { label: "Dibatalkan", icon: "cross" },
  };
  const status = statusMeta[activity.status] || {
    label: activity.status,
    icon: "tag",
  };

  const partnerName = activity.partner || null;
  const pendingApplications = Array.isArray(applications)
    ? applications.filter((app) => app.status === "pending").length
    : 0;

  const chatHref =
    activity.partnerId && activity.postId
      ? `/chat?user=${encodeURIComponent(activity.partnerId)}&post=${encodeURIComponent(activity.postId)}`
      : null;

  const ratingHref = `/rating?id=${encodeURIComponent(activity.id)}&postId=${encodeURIComponent(activity.postId)}`;

  return (
    <main>
      <div className="activity-detail-wrap">
        <nav className="activity-detail-back" aria-label="Navigasi kembali">
          <Link href="/aktivitas">
            <SvgIcon name="reply" size={15} strokeWidth={2} />
            Kembali ke Aktivitas
          </Link>
        </nav>

        <header className="activity-detail-header">
        <span className="activity-detail-eyebrow">
          <SvgIcon name="clipboard" size={14} strokeWidth={2} />
          Detail Aktivitas
        </span>
        <h1>{post?.title || "Aktivitas NeedHelp"}</h1>
        <div className="activity-detail-header-meta">
          <span className={`activity-status-tag tag-${statusKey(activity.status)}`}>
            <SvgIcon name={status.icon} size={13} strokeWidth={2} />
            {status.label}
          </span>
          {post && (
            <span className="activity-detail-pill">
              {NATURE_LABELS[post.nature] || "Bantuan"}
            </span>
          )}
          {post && CATEGORY_LABELS[post.category] && (
            <span className="activity-detail-pill">
              {CATEGORY_LABELS[post.category]}
            </span>
          )}
        </div>
      </header>

      <div className="activity-detail-grid">
        {/* ---------- Kolom utama ---------- */}
        <div className="activity-detail-main">
          {activity.note && (
            <section className="activity-detail-card">
              <h2>Catatan aktivitas</h2>
              <p className="activity-detail-note">{activity.note}</p>
            </section>
          )}

          {post && (
            <section className="activity-detail-card">
              <h2>Postingan terkait</h2>
              <p className="activity-detail-post-title">{post.title}</p>
              {post.summary && (
                <p className="activity-detail-post-summary">{post.summary}</p>
              )}
              <dl className="activity-detail-dl">
                <div>
                  <dt>Jadwal</dt>
                  <dd>
                    {formatDate(post.date)} · {formatTimeRange(post)}
                  </dd>
                </div>
                <div>
                  <dt>Lokasi</dt>
                  <dd>
                    {post.address}
                    {post.destination ? ` → ${post.destination}` : ""}
                    {REGION_LABELS[post.region] ? ` (${REGION_LABELS[post.region]})` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Kompensasi</dt>
                  <dd>{formatCompensation(post)}</dd>
                </div>
              </dl>
            </section>
          )}

          {isCancelled && (
            <p className="activity-detail-alert" role="status">
              <SvgIcon name="warning" size={16} strokeWidth={2} />
              Aktivitas ini sudah dibatalkan. Detail postingan tidak lagi tersedia.
            </p>
          )}

          {activity.review && (
            <section className="activity-detail-card">
              <h2>Ulasan yang kamu berikan</h2>
              <div className="activity-detail-review">
                <span className="activity-detail-stars" aria-hidden="true">
                  {"★".repeat(Math.max(0, Math.min(5, Number(activity.review.rating) || 0)))}
                </span>
                <span className="activity-detail-review-rating">
                  {activity.review.rating}.0 / 5.0
                </span>
              </div>
              {activity.review.comment && (
                <p className="activity-detail-review-comment">
                  &ldquo;{activity.review.comment}&rdquo;
                </p>
              )}
            </section>
          )}

          {activity.reviewReceived && (
            <section className="activity-detail-card">
              <h2>Ulasan yang kamu terima</h2>
              <div className="activity-detail-review">
                <span className="activity-detail-stars" aria-hidden="true">
                  {"★".repeat(Math.max(0, Math.min(5, Number(activity.reviewReceived.rating) || 0)))}
                </span>
                <span className="activity-detail-review-rating">
                  {activity.reviewReceived.rating}.0 / 5.0
                </span>
              </div>
              {activity.reviewReceived.comment && (
                <p className="activity-detail-review-comment">
                  &ldquo;{activity.reviewReceived.comment}&rdquo;
                </p>
              )}
            </section>
          )}
        </div>

        {/* ---------- Sidebar ---------- */}
        <aside className="activity-detail-side">
          <section className="activity-detail-card">
            <h2>Pihak terlibat</h2>
            <div className="activity-detail-partner">
              <span className="activity-detail-avatar" aria-hidden="true">
                {partnerName ? partnerName.charAt(0).toUpperCase() : "—"}
              </span>
              <div>
                <strong>{partnerName || "Belum ada partner"}</strong>
                <span>
                  {partnerName
                    ? "Partner bantuan"
                    : "Menunggu pengajuan yang diterima"}
                </span>
              </div>
            </div>

            {applications !== null && (
              <p className="activity-detail-apps">
                {applications.length > 0
                  ? `${applications.length} pengajuan bantuan · ${pendingApplications} menunggu keputusan`
                  : "Belum ada pengajuan bantuan untuk postingan ini."}
              </p>
            )}
          </section>

          <section className="activity-detail-card activity-detail-actions">
            <h2>Tindakan</h2>

            {canOpenPost && (
              <Link
                href={`/detail-postingan?id=${encodeURIComponent(post.id)}`}
                className="button button-outline"
              >
                <SvgIcon name="search" size={15} strokeWidth={2} />
                Lihat Postingan
              </Link>
            )}

            {activity.status === "berlangsung" && chatHref && (
              <Link href={chatHref} className="button button-primary">
                <SvgIcon name="chat" size={15} strokeWidth={2} />
                Buka Obrolan
              </Link>
            )}

            {activity.status === "selesai" && !activity.review && (
              <Link href={ratingHref} className="button button-primary">
                <SvgIcon name="star" size={15} strokeWidth={2} />
                Beri Ulasan
              </Link>
            )}

            {supabaseMode && (
              <Link href="/pengajuan" className="button button-outline">
                <SvgIcon name="clipboard" size={15} strokeWidth={2} />
                Kelola Pengajuan
              </Link>
            )}

            {!canOpenPost && !(activity.status === "berlangsung" && chatHref) && !(activity.status === "selesai" && !activity.review) && !supabaseMode && (
              <p className="activity-detail-actions-empty">
                Tidak ada tindakan lanjutan untuk aktivitas dengan status ini.
              </p>
            )}
          </section>
        </aside>
      </div>
      </div>
    </main>
  );
}

/** Memetakan status aktivitas ke sufiks kelas tag yang sudah dipakai app. */
function statusKey(status) {
  switch (status) {
    case "menunggu":
      return "waiting";
    case "berlangsung":
      return "confirmed";
    case "selesai":
      return "completed";
    case "batal":
      return "cancelled";
    default:
      return "waiting";
  }
}
