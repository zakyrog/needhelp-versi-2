"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getActivities,
  getPost,
  cancelActivity,
  fetchActivities,
  cancelActivitySupabase,
  completeActivitySupabase,
  fetchPosts,
} from "../../lib/data.js";
import { readSession } from "../../lib/auth.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { SvgIcon } from "../../components/Icons.jsx";

// Status badge + ikon yang dipakai di daftar maupun kartu. Konsisten dengan
// jalur detail /aktivitas/[id] agar tidak ada dua bahasa visual berbeda.
const STATUS_META = {
  menunggu: { label: "Menunggu", icon: "hourglass", className: "tag-waiting" },
  berlangsung: { label: "Sedang Berjalan", icon: "clock", className: "tag-confirmed" },
  selesai: { label: "Selesai", icon: "check", className: "tag-completed" },
  batal: { label: "Dibatalkan", icon: "cross", className: "tag-cancelled" },
};

function ActivityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  const supabaseMode = isSupabaseConfigured();

  const [session, setSession] = useState(null);
  const [activities, setActivities] = useState(() => {
    // Mode demo: sync init; mode Supabase: kosong (akan di-fetch async)
    return supabaseMode ? [] : getActivities();
  });
  const [loading, setLoading] = useState(supabaseMode);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [startingId, setStartingId] = useState(null);
  const [completingId, setCompletingId] = useState(null);

  // Load activities
  useEffect(() => {
    const currentSession = readSession();
    setSession(currentSession);

    if (!currentSession) {
      setLoading(false);
      return;
    }

    let isCancelled = false;

    if (supabaseMode) {
      setLoading(true);
      setError(null);

      // Fetch posts terlebih dahulu agar cache _lastFetchedPosts terisi
      // (diperlukan untuk getPost() saat render activity card)
      fetchPosts()
        .then(() => fetchActivities())
        .then((data) => {
          if (!isCancelled) {
            setActivities(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setError(err.message || "Gagal memuat aktivitas.");
            setLoading(false);
          }
        });
    } else {
      setActivities(getActivities());
      setLoading(false);
    }

    if (searchParams.get("rated") === "1") {
      showToast("Terima kasih! Ulasanmu berhasil disimpan.", "success");
    }

    return () => { isCancelled = true; };
  }, [searchParams, showToast, supabaseMode]);

  // Ringkasan status HANYA dari status yang benar-benar dipakai (menunggu,
  // berlangsung, selesai, batal). Tidak ada angka yang dibuat-buat.
  const statusCounts = useMemo(() => {
    const counts = { total: activities.length, menunggu: 0, berlangsung: 0, selesai: 0, batal: 0 };
    for (const act of activities) {
      if (counts[act.status] !== undefined) counts[act.status] += 1;
    }
    return counts;
  }, [activities]);

  const visibleActivities = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((act) => act.status === filter);
  }, [activities, filter]);

  const handleCancel = async (activityId, postId) => {
    if (!window.confirm("Apakah kamu yakin ingin membatalkan aktivitas ini?")) return;

    try {
      if (supabaseMode) {
        await cancelActivitySupabase(postId);
        // Refresh activities dari Supabase
        const refreshed = await fetchActivities();
        setActivities(refreshed);
      } else {
        cancelActivity(activityId);
        setActivities(getActivities());
      }
      showToast("Aktivitas berhasil dibatalkan.", "info");
    } catch (err) {
      showToast(err.message || "Gagal mengubah status aktivitas.", "error");
    }
  };

  const handleStart = async (activityId, _postId) => {
    if (!window.confirm("Mulai aktivitas ini sekarang? Status akan berubah menjadi 'Sedang Berjalan'.")) return;

    setStartingId(activityId);
    try {
      // Mode demo: gunakan setActivityState untuk mengubah status
      // Catatan: Dalam mode Supabase, tombol "Mulai Aktivitas" tidak ditampilkan
      // karena aktivitas dimulai otomatis saat pengajuan diterima via accept_help_application.
      const { setActivityState } = await import("../../lib/data.js");
      setActivityState(activityId, { status: "berlangsung" });
      setActivities(getActivities());
      showToast("Aktivitas berhasil dimulai!", "success");
    } catch (err) {
      showToast(err.message || "Gagal memulai aktivitas.", "error");
    } finally {
      setStartingId(null);
    }
  };

  const handleComplete = async (activityId, postId) => {
    if (!window.confirm("Tandai aktivitas ini sebagai selesai? Anda masih bisa memberikan ulasan setelahnya.")) return;

    setCompletingId(activityId);
    try {
      if (supabaseMode) {
        await completeActivitySupabase(postId);
        // Refresh activities dari Supabase untuk mendapatkan data terbaru
        const refreshed = await fetchActivities();
        setActivities(refreshed);
      } else {
        // Mode demo: fallback ke setActivityState
        const { setActivityState } = await import("../../lib/data.js");
        setActivityState(activityId, { status: "selesai" });
        setActivities(getActivities());
      }
      showToast("Aktivitas ditandai sebagai selesai!", "success");
    } catch (err) {
      showToast(err.message || "Gagal menyelesaikan aktivitas.", "error");
    } finally {
      setCompletingId(null);
    }
  };

  const getStatusBadge = (status) => {
    const meta = STATUS_META[status];
    if (!meta) return <span className="activity-status-tag">{status}</span>;
    return (
      <span className={`activity-status-tag ${meta.className}`}>
        <SvgIcon name={meta.icon} size={13} strokeWidth={2} />
        {meta.label}
      </span>
    );
  };

  // Loading state
  if (loading) {
    return (
      <main>
        <header className="activity-hero-header">
          <p className="activity-eyebrow">
            <SvgIcon name="clipboard" size={14} strokeWidth={2} />
            Pusat Aktivitas
          </p>
          <h1>Aktivitas Saya</h1>
          <p className="activity-lede">Memuat aktivitasmu...</p>
        </header>
        <p className="activity-loading" role="status">Memuat aktivitas...</p>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main>
        <header className="activity-hero-header">
          <p className="activity-eyebrow">
            <SvgIcon name="clipboard" size={14} strokeWidth={2} />
            Pusat Aktivitas
          </p>
          <h1>Aktivitas Saya</h1>
          <p className="activity-lede">Semua permintaan dan tawaran bantuanmu dalam satu tempat.</p>
        </header>
        <div className="activity-empty-wrap">
          <EmptyState
            icon="⚠️"
            title="Gagal Memuat Aktivitas"
            description={error}
            actionText="Coba Lagi"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <main>
        <header className="activity-hero-header">
          <p className="activity-eyebrow">
            <SvgIcon name="clipboard" size={14} strokeWidth={2} />
            Pusat Aktivitas
          </p>
          <h1>Aktivitas Saya</h1>
          <p className="activity-lede">Semua permintaan dan tawaran bantuanmu dalam satu tempat.</p>
        </header>
        <div className="activity-empty-wrap">
          <EmptyState
            icon="🔒"
            title="Masuk untuk Melihat Aktivitas"
            description="Silakan masuk terlebih dahulu untuk melihat aktivitas bantuan Anda."
            actionText="Masuk Sekarang"
            onAction={() => router.push("/login?next=/aktivitas")}
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      {/* ===== Header editorial ===== */}
      <header className="activity-hero-header">
        <p className="activity-eyebrow">
          <SvgIcon name="clipboard" size={14} strokeWidth={2} />
          Pusat Aktivitas
        </p>
        <h1>Aktivitas Saya</h1>
        <p className="activity-lede">
          Semua permintaan dan tawaran bantuanmu dalam satu tempat — pantau yang
          menunggu, sedang berjalan, atau sudah tuntas.
        </p>
        {supabaseMode && session && (
          <Link href="/pengajuan" className="activity-manage-link">
            <SvgIcon name="clipboard" size={15} strokeWidth={2} /> Kelola Pengajuan Bantuan
          </Link>
        )}
      </header>

      {/* ===== Filter (merangkap ringkasan status) ===== */}
      <div className="activity-filter-chips" role="group" aria-label="Filter status aktivitas">
        {[
          { key: "all", label: "Semua", count: statusCounts.total },
          { key: "menunggu", label: "Menunggu", count: statusCounts.menunggu },
          { key: "berlangsung", label: "Sedang Berjalan", count: statusCounts.berlangsung },
          { key: "selesai", label: "Selesai", count: statusCounts.selesai },
          { key: "batal", label: "Dibatalkan", count: statusCounts.batal },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`filter-chip${filter === tab.key ? " active" : ""}`}
            onClick={() => setFilter(tab.key)}
            aria-pressed={filter === tab.key}
          >
            {tab.label}
            <span className="filter-chip-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ===== Daftar kartu ===== */}
      <section className="activity-list-container" aria-label="Daftar aktivitas">
        {visibleActivities.length > 0 ? (
          visibleActivities.map((activity) => {
            const post = getPost(activity.postId);
            // Aktivitas batal tidak boleh membuka detail postingan dari halaman Aktivitas
            const isCancelled = activity.status === "batal";
            const canOpenPost = Boolean(post && !isCancelled);
            const detailHref = `/aktivitas/${encodeURIComponent(activity.id)}`;

            const avatarInitial = activity.partner
              ? activity.partner.charAt(0).toUpperCase()
              : post
                ? post.title.charAt(0).toUpperCase()
                : "A";

            return (
              <article key={activity.id} className={`activity-card activity-card-${activity.status}`}>
                <div className="activity-card-avatar" aria-hidden="true">
                  {avatarInitial}
                </div>

                <div className="activity-card-body">
                  <div className="activity-card-topline">
                    {getStatusBadge(activity.status)}
                    {post && (
                      <span className="activity-card-meta">
                        {post.nature === "butuh" ? "Saya Butuh" : "Saya Bisa"}
                      </span>
                    )}
                  </div>

                  <h3>
                    <Link href={detailHref}>
                      {post ? post.title : "Aktivitas NeedHelp"}
                    </Link>
                  </h3>

                  <p className="activity-card-note">
                    {activity.partner && (
                      <>
                        <span className="role-label">Partner</span>{" "}
                        <strong>{activity.partner}</strong> &bull;{" "}
                      </>
                    )}
                    {activity.note}
                  </p>

                  {isCancelled && (
                    <p className="activity-card-warning">
                      <SvgIcon name="warning" size={14} strokeWidth={2} />
                      Aktivitas ini sudah dibatalkan. Detail postingan tidak tersedia.
                    </p>
                  )}
                  {activity.review && (
                    <p className="activity-card-review">
                      Ulasan: <em>&ldquo;{activity.review.comment}&rdquo;</em> ({activity.review.rating}.0)
                    </p>
                  )}
                </div>

                <div className="activity-card-actions">
                  <Link href={detailHref} className="activity-card-detail">
                    Detail
                    <SvgIcon name="arrowRight" size={14} strokeWidth={2} />
                  </Link>

                  {canOpenPost && (
                    <Link
                      href={`/detail-postingan?id=${encodeURIComponent(post.id)}`}
                      className="btn-detail-outline"
                    >
                      Lihat Postingan
                    </Link>
                  )}

                  {activity.status === "berlangsung" && (
                    <>
                      {activity.partnerId && (
                        <Link
                          href={`/chat?user=${encodeURIComponent(activity.partnerId)}&post=${encodeURIComponent(activity.postId)}`}
                          className="btn-detail-outline activity-cta-action"
                        >
                          <SvgIcon name="chat" size={15} strokeWidth={2} /> Obrolan
                        </Link>
                      )}
                      <button
                        type="button"
                        className="btn-detail-outline activity-cta-action"
                        onClick={() => handleComplete(activity.id, activity.postId)}
                        disabled={completingId === activity.id}
                      >
                        {completingId === activity.id ? "Menyelesaikan..." : "Selesaikan"}
                      </button>
                    </>
                  )}

                  {activity.status === "selesai" && !activity.review && (
                    <Link
                      href={`/rating?id=${encodeURIComponent(activity.id)}&postId=${encodeURIComponent(activity.postId)}`}
                      className="btn-detail-outline activity-cta-action"
                    >
                      <SvgIcon name="star" size={15} strokeWidth={2} /> Beri Ulasan
                    </Link>
                  )}

                  {activity.status === "menunggu" && (
                    <>
                      {/* Tombol Mulai Aktivitas hanya untuk mode demo.
                          Dalam mode Supabase, aktivitas dimulai otomatis saat pengajuan diterima. */}
                      {!supabaseMode && (
                        <button
                          type="button"
                          className="btn-detail-outline activity-cta-action"
                          onClick={() => handleStart(activity.id, activity.postId)}
                          disabled={startingId === activity.id}
                        >
                          {startingId === activity.id ? "Memulai..." : "Mulai Aktivitas"}
                        </button>
                      )}
                      {/* Aktivitas sintetis (belum punya baris di tabel activities) tidak bisa
                          dibatalkan: RPC cancel_activity hanya mengubah record database. */}
                      {!activity._defaultActivity && (
                        <button
                          type="button"
                          className="btn-detail-outline activity-cta-danger"
                          onClick={() => handleCancel(activity.id, activity.postId)}
                          disabled={startingId === activity.id}
                        >
                          Batalkan
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            icon="📋"
            title="Belum ada aktivitas"
            description="Tidak ada aktivitas pada filter ini. Mulai dengan membuat postingan atau mencari bantuan di katalog."
            actionText="Jelajahi Katalog"
            onAction={() => router.push("/katalog")}
          />
        )}
      </section>
    </main>
  );
}

export default function AktivitasPage() {
  return (
    <Suspense fallback={<div className="activity-page"><p>Memuat aktivitas...</p></div>}>
      <ActivityContent />
    </Suspense>
  );
}
