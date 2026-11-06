"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getPostWithStatus,
  fetchPosts,
  fetchPostById,
  getPostAuthor,
  CATEGORY_LABELS,
  REGION_LABELS,
  formatDate,
  formatTimeRange,
  formatCompensation,
  formatDateTime,
  deletePostSupabase,
  getPostLifecycleStatus,
  getMyActiveApplicationForPost,
} from "../../lib/data.js";
import { isSupabaseConfigured, getSupabase } from "../../lib/supabase.js";
import { resolveAvatarSrc } from "../../lib/avatars.js";
import { getSafeInternalPath } from "../../lib/navigation.js";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { SvgIcon } from "../../components/Icons.jsx";

function DetailPostContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const id = searchParams.get("id");
  const backUrl = getSafeInternalPath(searchParams.get("back"), "/katalog");

  // Di mode Supabase, jangan inisialisasi dari getPost sync (cache bisa kosong).
  // Set loading=true agar tidak flash "tidak ditemukan" sebelum async fetch selesai.
  const supabaseMode = isSupabaseConfigured();
  const [post, setPost] = useState(() => {
    if (!id) return null;
    if (supabaseMode) return null;
    return getPostWithStatus(id);
  });
  const [loading, setLoading] = useState(() => supabaseMode && Boolean(id));
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Keanggotaan Supabase Auth yang sudah diverifikasi server. `post.owned` bisa
  // salah bila sesi belum terbaca saat fetch, jadi CTA pengajuan memakai ini.
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    if (!supabaseMode) return;
    let isCancelled = false;
    getSupabase()
      .auth.getUser()
      .then(({ data, error: authError }) => {
        if (isCancelled) return;
        setUserId(authError ? null : data?.user?.id || null);
      })
      .catch(() => {
        if (!isCancelled) setUserId(null);
      });
    return () => {
      isCancelled = true;
    };
  }, [supabaseMode]);

  // Pengajuan aktif (pending/accepted) milik user untuk postingan ini, agar tombol
  // formulir tidak menawarkan pengajuan kedua. null = belum diketahui / tidak ada.
  const [myApplication, setMyApplication] = useState(null);

  useEffect(() => {
    if (!supabaseMode || !userId || !id) {
      setMyApplication(null);
      return;
    }
    let isCancelled = false;
    getMyActiveApplicationForPost(id)
      .then((app) => {
        if (!isCancelled) setMyApplication(app);
      })
      .catch(() => {
        if (!isCancelled) setMyApplication(null);
      });
    return () => {
      isCancelled = true;
    };
  }, [supabaseMode, userId, id]);

  useEffect(() => {
    if (!id) return;

    let isCancelled = false;

    if (supabaseMode) {
      // Jalur Supabase: fetch langsung dari database
      setLoading(true);
      setError(null);

      fetchPostById(id)
        .then((data) => {
          if (!isCancelled) {
            setPost(data);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            setError(err.message || "Gagal mengambil detail postingan.");
            setLoading(false);
          }
        });
    } else {
      // Jalur demo: sync lookup + refresh dari seed/localStorage
      setPost(getPostWithStatus(id));
      fetchPosts()
        .then(() => {
          if (!isCancelled) {
            setPost(getPostWithStatus(id));
          }
        })
        .catch(() => {
          // Mode demo: silent fallback ke data yang sudah ada
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [id, supabaseMode]);

  const handleDelete = async () => {
    if (!post) return;
    if (!window.confirm("Apakah Anda yakin ingin menghapus postingan ini? Tindakan ini tidak dapat dibatalkan.")) return;

    setDeleting(true);
    try {
      await deletePostSupabase(post.id);
      showToast("Postingan berhasil dihapus.", "success");
      router.push("/");
    } catch (err) {
      showToast(err.message || "Gagal menghapus postingan.", "error");
      setDeleting(false);
    }
  };

  // State loading
  if (loading) {
    return (
      <main className="detail-main-layout">
        <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <p>Memuat detail postingan...</p>
        </div>
      </main>
    );
  }

  // State error (Supabase terkonfigurasi tapi query gagal)
  if (error) {
    return (
      <main className="detail-main-layout">
        <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <EmptyState
            icon="⚠️"
            title="Gagal Memuat Postingan"
            description={error}
            actionText="Kembali ke Katalog"
            onAction={() => router.push(backUrl)}
          />
        </div>
      </main>
    );
  }

  if (!id || !post) {
    return (
      <main className="detail-main-layout">
        <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <EmptyState
            icon="🔎"
            title="Postingan tidak ditemukan"
            description="Postingan yang kamu cari tidak tersedia atau mungkin sudah dihapus."
            actionText="Kembali ke Katalog"
            onAction={() => router.push(backUrl)}
          />
        </div>
      </main>
    );
  }

  const author = getPostAuthor(post);
  const isNeed = post.nature === "butuh";
  const authorAvatar = resolveAvatarSrc({ key: author.avatarKey, url: author.avatar });
  const authorInitial = (author.initial || author.name || "N").charAt(0).toUpperCase();

  // Status efektif diambil dari activities.status (lihat getPostLifecycleStatus).
  // Hanya "aktif" yang boleh menerima pengajuan baru atau memulai chat.
  const lifecycle = getPostLifecycleStatus(post);
  const isActive = lifecycle === "aktif";
  // Pemilik pasti tidak boleh membuka formulir pengajuan; bila sesi belum
  // terverifikasi, mengklik link hanya akan diarahkan ke /login.
  const ownsThisPost = Boolean(
    supabaseMode && userId && post.authorId === userId,
  );
  const isOwner = Boolean(post.owned || ownsThisPost);
  const applicationHref = ownsThisPost
    ? "/pengajuan"
    : supabaseMode && !userId
      ? `/login?next=${encodeURIComponent(`/formbantuan?id=${post.id}`)}`
      : `/formbantuan?id=${encodeURIComponent(post.id)}`;
  // Sudah punya pengajuan pending/accepted untuk post ini: tombol diganti status
  // non-aktif, tidak bisa diklik untuk mengajukan ulang. RPC 010 tetap menolak.
  const closedMessage =
    lifecycle === "selesai"
      ? "Aktivitas bantuan untuk postingan ini sudah selesai. Pengajuan bantuan baru tidak lagi dibuka."
      : lifecycle === "batal"
        ? "Aktivitas untuk postingan ini sudah dibatalkan. Pengajuan bantuan baru tidak lagi dibuka."
        : "Status postingan ini tidak dikenali, sehingga pengajuan bantuan baru tidak dibuka.";
  const typeLabel = isNeed ? "Saya Butuh" : "Saya Bisa";
  const categoryLabel = CATEGORY_LABELS[post.category] || post.category;
  // Tautan chat membawa post_id + user_id asli (UUID Supabase), bukan id seed.
  // Halaman /chat memakai keduanya untuk memanggil RPC
  // get_or_create_conversation(p_post_id, p_partner_id) — idempoten, jadi
  // percakapan yang sudah ada dipakai ulang. Aturan siapa boleh memulai
  // percakapan tetap divalidasi server.
  const chatUrl = `/chat?user=${encodeURIComponent(author.id)}&post=${encodeURIComponent(post.id)}`;

  return (
    <main className="detail-main-layout">
      <nav aria-label="Jejak Navigasi" className="breadcrumb-nav">
        <p className="breadcrumb-back">
          <Link href={backUrl} data-detail-back>
            &larr; Kembali ke Feed
          </Link>
        </p>
        <div className="breadcrumb-status">
          <span className="status-title">Detail Postingan #{post.id}</span>
          <span className="status-badge">
            <mark>{typeLabel}</mark> &bull; Kategori: {categoryLabel}
          </span>
        </div>
      </nav>

      <article className={`detail-article${isNeed ? " detail-article-need" : " detail-article-offer"}`}>
        <section className="requester-section">
          {authorAvatar ? (
            <img
              src={authorAvatar}
              alt=""
              width={48}
              height={48}
              className="requester-img"
            />
          ) : (
            <span className="requester-img-initial" aria-hidden="true">
              {authorInitial}
            </span>
          )}
          <div>
            <h3 className="requester-name">{author.name}</h3>
            <p className="requester-info">
              {author.bio}
              {author.verification ? (
                <span className="requester-verified">
                  <SvgIcon name="shield" size={13} strokeWidth={2} /> {author.verification}
                </span>
              ) : null}
            </p>
          </div>
          <div className="requester-rating">
            <SvgIcon name="star" size={13} strokeWidth={2} />
            <span>{author.rating ? author.rating.split(" ")[0] : "4.9"}</span>
          </div>
        </section>

        <header className="article-header">
          <div className="detail-kickers">
            <span className={`nature-badge nature-badge-${post.nature}`}>
              <SvgIcon name={isNeed ? "hand" : "wave"} size={13} strokeWidth={2.2} />
              {typeLabel}
            </span>
            <span className={`lifecycle-badge lifecycle-${lifecycle}`}>
              {lifecycle === "aktif"
                ? "Aktif"
                : lifecycle === "selesai"
                  ? "Selesai"
                  : lifecycle === "batal"
                    ? "Dibatalkan"
                    : "Status tidak dikenal"}
            </span>
          </div>
          <h1>{post.title}</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "14px", margin: "8px 0 16px 0" }}>
            Dipublikasikan oleh <strong>{author.name}</strong> pada{" "}
            <time dateTime={post.createdAt}>{formatDateTime(post.createdAt)}</time>
          </p>
          <div className="article-body">
            <h2>{isNeed ? "Deskripsi Kebutuhan" : "Deskripsi Penawaran"}</h2>
            {post.description.split(/\n{2,}/).map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        </header>

        <section className="info-grid-section">
          <div className="info-card">
            <SvgIcon name="tag" size={18} strokeWidth={2} className="info-card-icon" />
            <div>
              <div className="info-label">Kategori</div>
              <div className="info-value">{categoryLabel}</div>
            </div>
          </div>

          <div className="info-card">
            <SvgIcon name="wallet" size={18} strokeWidth={2} className="info-card-icon" />
            <div>
              <div className="info-label">{isNeed ? "Kompensasi" : "Imbalan"}</div>
              <div className="info-value">{formatCompensation(post)}</div>
            </div>
          </div>

          <div className="info-card">
            <SvgIcon name="calendar" size={18} strokeWidth={2} className="info-card-icon" />
            <div>
              <div className="info-label">Waktu</div>
              <div className="info-value">
                {formatDate(post.date)} ({formatTimeRange(post)})
              </div>
            </div>
          </div>

          <div className="info-card">
            <SvgIcon name="pin" size={18} strokeWidth={2} className="info-card-icon" />
            <div>
              <div className="info-label">Lokasi</div>
              <div className="info-value">
                {post.destination ? `${post.address} → ${post.destination}` : post.address}
              </div>
              {(REGION_LABELS[post.region] || post.region) && (
                <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "4px" }}>
                  {REGION_LABELS[post.region] || post.region}
                </div>
              )}
            </div>
          </div>
        </section>
      </article>

      <div className="detail-sidebar">
        {!isActive ? (
          /* Read-only: post selesai/batal hanya boleh dilihat, termasuk oleh pemiliknya */
          <section className="action-box" data-post-closed>
            <h2>
              {lifecycle === "selesai" ? "Postingan Sudah Selesai" : "Postingan Tidak Aktif"}
            </h2>
            <p>{closedMessage}</p>
            {isOwner && (
              <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                Anda dapat melihat riwayat aktivitas dan ulasan di halaman Aktivitas.
              </p>
            )}
            <Link href="/aktivitas" className="btn-chat">
              Lihat Aktivitas
            </Link>
          </section>
        ) : isOwner ? (
          /* Pemilik tidak boleh mengajukan bantuan ke postingannya sendiri */
          <section className="action-box" data-post-owner>
            <h2>Postingan Anda</h2>
            <p>
              Kelola pengajuan bantuan yang masuk untuk postingan ini. Anda tidak
              dapat mengajukan bantuan ke postingan sendiri.
            </p>
            <Link href="/pengajuan" className="btn-bantu">
              <SvgIcon name="clipboard" size={16} strokeWidth={2} /> Kelola Pengajuan Bantuan
            </Link>
          </section>
        ) : (
          <section className="action-box" data-post-apply>
            <h2>
              {isNeed ? "Ajukan Penawaran Bantuan" : "Tertarik dengan Tawaran Ini?"}
            </h2>
            <p>
              {isNeed
                ? `Tertarik membantu ${author.name} menyelesaikan kebutuhan ini?`
                : `Hubungi ${author.name} untuk menanyakan detail tawaran bantuan ini.`}
            </p>

            {myApplication?.status === "accepted" ? (
              <Link href={chatUrl} className="btn-bantu" data-chat-authorized>
                <SvgIcon name="chat" size={16} strokeWidth={2} />
                {isNeed ? "Chat dengan Pemilik Kebutuhan" : "Chat dengan Pemberi Bantuan"}
              </Link>
            ) : myApplication?.status === "pending" ? (
              <span
                className="btn-bantu app-status"
                aria-disabled="true"
                data-application-exists={myApplication.status}
              >
                <SvgIcon name="clock" size={16} strokeWidth={2} /> Pengajuan Sedang Ditinjau
              </span>
            ) : (
              <Link href={applicationHref} className="btn-bantu app-apply">
                <SvgIcon name="clipboard" size={16} strokeWidth={2} />
                {isNeed ? "Ajukan Penawaran Bantuan" : "Ajukan Permintaan Bantuan"}
              </Link>
            )}

            <p className="action-box-note">
              <SvgIcon name="shield" size={14} strokeWidth={2} />
              Chat terbuka setelah pengajuan diterima. Nomor WhatsApp tetap privat.
            </p>
          </section>
        )}

        {/* Tombol Hapus — hanya untuk pemilik postingan */}
        {post.owned && (
          <section className="action-box action-box-danger">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="btn-delete"
            >
              <SvgIcon name="trash" size={16} strokeWidth={2} />
              {deleting ? "Menghapus..." : "Hapus Postingan"}
            </button>
          </section>
        )}

        {/* Kotak Tips Aman */}
        <section className="safety-box">
          <h3 style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <SvgIcon name="shield" size={18} strokeWidth={2} /> Tips aman
          </h3>
          <p>
            Selalu ketemu di tempat ramai pertama kali. Jangan transfer uang
            muka sebelum ketemu langsung.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function DetailPostPage() {
  return (
    <Suspense fallback={<div className="detail-main-layout"><p>Memuat detail postingan...</p></div>}>
      <DetailPostContent />
    </Suspense>
  );
}
