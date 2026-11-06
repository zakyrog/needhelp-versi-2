"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getRateableActivity,
  getPost,
  saveRating,
  formatDate,
  fetchActivities,
  saveRatingSupabase,
  resolveRateableActivity,
  RATING_ERROR_CODES,
  buildRatingUrl,
  isNotOwnerError,
} from "../../lib/data.js";
import { readSession } from "../../lib/auth.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { validateRating } from "../../lib/validation.js";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { SvgIcon } from "../../components/Icons.jsx";

const STAR_LABELS = {
  5: "Luar Biasa",
  4: "Sangat Baik",
  3: "Cukup Baik",
  2: "Kurang Memuaskan",
  1: "Tidak Memuaskan",
};

function RatingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const id = searchParams.get("id");
  const postId = searchParams.get("postId");
  const supabaseMode = isSupabaseConfigured();

  const [activity, setActivity] = useState(null);
  const [unrateableReason, setUnrateableReason] = useState(null);
  const [loading, setLoading] = useState(true);

  const [stars, setStars] = useState(5);
  const [badges, setBadges] = useState(["tepat-waktu", "ramah", "sangat-membantu"]);
  const [comment, setComment] = useState("");
  const [recommend, setRecommend] = useState("yes");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Penolakan bisnis dari RPC yang tetap boleh ditampilkan sebagai form:
  // "not-owner" (bukan pemilik postingan) dan "not-completed" (belum selesai).
  const [businessBlock, setBusinessBlock] = useState(null);

  const applyResolved = (found, reason) => {
    if (!found) {
      setUnrateableReason(reason);
      setActivity(null);
      return;
    }
    setActivity(found);
    setUnrateableReason(null);
    if (found.review) {
      setStars(found.review.rating || 5);
      setComment(found.review.comment || "");
      if (found.review.badges) setBadges(found.review.badges);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setUnrateableReason(null);

    if (supabaseMode && !readSession()) {
      // Belum login / sesi kedaluwarsa: beri pesan login, bukan "tidak ditemukan".
      setActivity(null);
      setUnrateableReason("unauthenticated");
      setLoading(false);
      return () => { isCancelled = true; };
    }

    setBusinessBlock(null);

    if (supabaseMode) {
      // Mode Supabase: fetch activities async lalu cocokkan id aktivitas / postId
      fetchActivities()
        .then((activities) => {
          if (isCancelled) return;
          const { activity: found, reason } = resolveRateableActivity(activities, {
            activityId: id,
            postId,
          });
          applyResolved(found, reason);
          setLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          setUnrateableReason(
            err?.code === RATING_ERROR_CODES.NOT_AUTHENTICATED
              ? "unauthenticated"
              : "load-error",
          );
          setActivity(null);
          setLoading(false);
        });
    } else {
      // Mode demo: sync lookup
      const { activity: foundActivity, reason } = getRateableActivity(id);
      if (!foundActivity) {
        setUnrateableReason(reason);
        setActivity(null);
      } else {
        setActivity(foundActivity);
        setUnrateableReason(null);
        if (foundActivity.review) {
          setStars(foundActivity.review.rating || 5);
          setComment(foundActivity.review.comment || "");
          if (foundActivity.review.badges) {
            setBadges(foundActivity.review.badges);
          }
        }
      }
      setLoading(false);
    }

    return () => { isCancelled = true; };
  }, [id, postId, supabaseMode]);

  const handleBadgeToggle = (badgeKey) => {
    setBadges((prev) =>
      prev.includes(badgeKey)
        ? prev.filter((b) => b !== badgeKey)
        : [...prev, badgeKey],
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validateRating(stars, comment);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast("Periksa kembali bintang atau isi ulasan.", "error");
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const ratingData = {
        rating: Number(stars),
        comment: comment.trim(),
      };

      if (supabaseMode) {
        // RPC save_activity_rating memakai p_post_id (posts.id), BUKAN activities.id.
        // Parameter postId dari URL didahulukan karena diambil langsung dari aktivitas
        // pemilik; activity.postId adalah cadangan.
        const effectivePostId = postId || activity.postId;
        if (!effectivePostId) {
          throw new Error("Postingan untuk aktivitas ini tidak diketahui. Buka ulasan dari halaman Aktivitas.");
        }
        await saveRatingSupabase(effectivePostId, ratingData);
      } else {
        // Mode demo: tetap gunakan saveRating dengan activityId
        const fullRatingData = {
          ...ratingData,
          badges,
          recommend,
          at: new Date().toISOString(),
        };
        saveRating(activity.id, fullRatingData);
      }

      showToast("Penilaian berhasil disimpan!", "success");
      router.push("/aktivitas?rated=1");
    } catch (err) {
      setSubmitting(false);
      if (err?.code === RATING_ERROR_CODES.NOT_AUTHENTICATED) {
        setUnrateableReason("unauthenticated");
        return;
      }
      if (isNotOwnerError(err?.message) || /bukan peserta/i.test(err?.message || "")) {
        setBusinessBlock("not-owner");
        return;
      }
      if (/belum selesai|belum dimulai/i.test(err?.message || "")) {
        setBusinessBlock("not-completed");
        return;
      }
      const message =
        err?.code === RATING_ERROR_CODES.NOT_FOUND
          ? "Aktivitas tidak ditemukan lagi. Muat ulang halaman Aktivitas dan coba lagi."
          : err.message || "Gagal menyimpan ulasan.";
      setErrors({ general: message });
      showToast(message, "error");
    }
  };

  // Handle loading state
  if (loading) {
    return (
      <main className="rating-page-wrap">
        <p className="rating-status" role="status">Memuat data aktivitas...</p>
      </main>
    );
  }

  if (unrateableReason === "unauthenticated") {
    return (
      <main className="rating-page-wrap">
        <EmptyState
          icon="🔐"
          title="Silakan Masuk Terlebih Dahulu"
          description="Sesi kamu tidak ditemukan atau sudah berakhir. Masuk kembali untuk memberi penilaian."
          actionText="Masuk"
          onAction={() => {
            const next = supabaseMode
              ? buildRatingUrl(id, postId)
              : "/aktivitas";
            router.push(`/login?next=${encodeURIComponent(next)}`);
          }}
        />
      </main>
    );
  }

  if (unrateableReason) {
    const errorMessages = {
      missing: "Pilih aktivitas dari halaman Aktivitas sebelum memberi ulasan.",
      "not-found": "Aktivitas yang akan dinilai tidak ditemukan.",
      pending: "Aktivitas ini belum berlangsung, jadi belum dapat dinilai.",
      cancelled: "Aktivitas yang dibatalkan tidak dapat dinilai.",
      "invalid-status": "Aktivitas dengan status ini tidak dapat dinilai.",
      "load-error": "Gagal memuat data aktivitas. Periksa koneksi lalu coba lagi.",
    };

    return (
      <main className="rating-page-wrap">
        <EmptyState
          icon={unrateableReason === "load-error" ? "⚠️" : "⭐"}
          title={
            unrateableReason === "load-error"
              ? "Gagal Memuat Aktivitas"
              : "Tidak Dapat Memberi Penilaian"
          }
          description={
            errorMessages[unrateableReason] ||
            "Aktivitas ini tidak memenuhi syarat untuk dinilai."
          }
          actionText={
            unrateableReason === "load-error"
              ? "Muat Ulang Halaman"
              : "Buka Daftar Aktivitas"
          }
          onAction={() =>
            unrateableReason === "load-error"
              ? window.location.reload()
              : router.push("/aktivitas")
          }
        />
      </main>
    );
  }

  // Safety check: activity should not be null at this point
  if (!activity) {
    return (
      <main className="rating-page-wrap">
        <EmptyState
          icon="⚠️"
          title="Data Aktivitas Tidak Tersedia"
          description="Terjadi masalah saat memuat data aktivitas. Silakan coba lagi atau kembali ke daftar aktivitas."
          actionText="Buka Daftar Aktivitas"
          onAction={() => router.push("/aktivitas")}
        />
      </main>
    );
  }

  const post = getPost(activity.postId);
  const partnerName = activity.partner || "Rekan Bantuan";

  // Ulasan yang sudah ada: aturan server melarang penilaian ulang
  // ("sudah memberikan ulasan"), jadi form tidak ditampilkan lagi — cukup
  // tampilkan ulasan yang tersimpan (read-only) + tautan kembali.
  if (activity.review) {
    const existingStars = Math.max(0, Math.min(5, Number(activity.review.rating) || 0));
    return (
      <main className="rating-page-wrap">
        <header className="rating-header">
          <p className="rating-eyebrow">
            <SvgIcon name="star" size={14} strokeWidth={2} />
            Ulasan Komunitas
          </p>
          <h1>Ulasan Sudah Diberikan</h1>
          <p className="rating-lede">
            Kamu sudah menilai aktivitas ini. Setiap aktivitas hanya dapat dinilai
            satu kali.
          </p>
        </header>

        <article className="rating-summary">
          <header>
            <h2>Ringkasan Aktivitas</h2>
          </header>
          <div className="rating-summary-body">
            <p>
              <span className="rating-summary-label">Aktivitas</span>
              <strong>{post?.title || "Aktivitas NeedHelp"}</strong>
            </p>
            <p>
              <span className="rating-summary-label">Rekan Bantuan</span>
              <strong>{partnerName}</strong>
            </p>
          </div>
        </article>

        <section className="rating-existing" aria-label="Ulasan yang sudah diberikan">
          <h2>Ulasan Kamu</h2>
          <div className="rating-existing-stars" role="img" aria-label={`${existingStars} dari 5 bintang`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <SvgIcon
                key={value}
                name={value <= existingStars ? "starFilled" : "star"}
                size={28}
                strokeWidth={value <= existingStars ? 1.2 : 1.75}
                className={"rating-existing-star" + (value <= existingStars ? " filled" : "")}
              />
            ))}
            <span className="rating-existing-value">
              {existingStars} dari 5
            </span>
          </div>
          {activity.review.comment && (
            <p className="rating-existing-comment">
              &ldquo;{activity.review.comment}&rdquo;
            </p>
          )}
          <Link href="/aktivitas" className="button button-outline">
            Kembali ke Aktivitas
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="rating-page-wrap">
      <header className="rating-header">
        <p className="rating-eyebrow">
          <SvgIcon name="star" size={14} strokeWidth={2} />
          Ulasan Komunitas
        </p>
        <h1>Beri Ulasan dan Penilaian</h1>
        <p className="rating-lede">
          Bantu bangun reputasi komunitas dengan memberikan ulasan jujur setelah
          aktivitas bantuan selesai dilaksanakan.
        </p>
      </header>

      {/* Ringkasan Kegiatan */}
      <article className="rating-summary">
        <header>
          <h2>Ringkasan Aktivitas</h2>
        </header>
        <div className="rating-summary-body">
          <p>
            <span className="rating-summary-label">Aktivitas</span>
            <strong>{post?.title || "Aktivitas NeedHelp"}</strong>
          </p>
          <p>
            <span className="rating-summary-label">Rekan Bantuan</span>
            <strong>{partnerName}</strong>
          </p>
        </div>
        <dl className="rating-facts">
          <div>
            <dt>Tanggal Pelaksanaan</dt>
            <dd>{post ? formatDate(post.date) : activity.note}</dd>
          </div>
          <div>
            <dt>Lokasi</dt>
            <dd>
              {post
                ? `${post.address}${post.destination ? ` ke ${post.destination}` : ""}`
                : "Sesuai kesepakatan"}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="rating-status-chip">
                <SvgIcon name="check" size={13} strokeWidth={2} />
                {activity.status === "selesai" ? "Aktivitas Selesai" : "Aktivitas Berlangsung"}
              </span>
            </dd>
          </div>
        </dl>
      </article>

      {businessBlock === "not-owner" && (
        <p className="error-banner" role="alert">
          Hanya dua pihak yang terlibat dalam aktivitas ini yang dapat memberi ulasan.
        </p>
      )}

      {businessBlock === "not-completed" && (
        <p className="error-banner" role="alert">
          Aktivitas belum selesai. Selesaikan aktivitas terlebih dahulu sebelum memberi ulasan.
        </p>
      )}

      {errors.general && (
        <p className="error-banner" role="alert">
          {errors.general}
        </p>
      )}

      {/* Formulir Evaluasi & Rating */}
      <form className="rating-form" onSubmit={handleSubmit} noValidate>
        {/* 1. Bintang Kepuasan */}
        <fieldset className="rating-fieldset rating-fieldset-stars">
          <legend>
            <span className="rating-step">1</span>
            Berikan Bintang Kepuasan
          </legend>
          <p className="rating-fieldset-hint">Skala 1 sampai 5 bintang.</p>

          <div
            className="star-picker"
            role="radiogroup"
            aria-label="Rating bintang kepuasan"
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = Number(stars) >= value;
              return (
                <label
                  key={value}
                  className={`star-option${selected ? " selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="star_rating"
                    value={value}
                    checked={Number(stars) === value}
                    onChange={() => setStars(value)}
                    className="sr-only"
                  />
                  <SvgIcon
                    name={selected ? "starFilled" : "star"}
                    size={34}
                    strokeWidth={selected ? 1.2 : 1.75}
                  />
                  <span className="sr-only">
                    {value} dari 5 bintang — {STAR_LABELS[value]}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="star-picker-feedback" aria-live="polite">
            {Number(stars)} dari 5 — {STAR_LABELS[Number(stars)]}
          </p>

          {errors.rating && (
            <small className="field-error" role="alert">
              {errors.rating}
            </small>
          )}
        </fieldset>

        {/* 2. Aspek Positif */}
        <fieldset className="rating-fieldset">
          <legend>
            <span className="rating-step">2</span>
            Apa yang Paling Kamu Apresiasi dari {partnerName}?
          </legend>
          <div className="badge-options">
            {[
              { key: "tepat-waktu", label: "Tepat Waktu & Disiplin" },
              { key: "ramah", label: "Ramah & Menyenangkan" },
              { key: "sangat-membantu", label: "Tenaga Kuat & Sangat Membantu" },
              { key: "komunikatif", label: "Komunikatif & Responsif di Chat" },
            ].map((badge) => {
              const checked = badges.includes(badge.key);
              return (
                <label
                  key={badge.key}
                  className={`badge-option${checked ? " selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    name="badges"
                    value={badge.key}
                    checked={checked}
                    onChange={() => handleBadgeToggle(badge.key)}
                    className="sr-only"
                  />
                  <SvgIcon
                    name={checked ? "check" : "wave"}
                    size={15}
                    strokeWidth={2}
                  />
                  {badge.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* 3. Ulasan Terbuka */}
        <fieldset className="rating-fieldset">
          <legend>
            <span className="rating-step">3</span>
            Catatan &amp; Testimoni
          </legend>
          <div className="rating-field">
            <label htmlFor="review-comment">Ceritakan pengalamanmu</label>
            <textarea
              id="review-comment"
              name="review"
              rows={4}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (errors.comment) {
                  setErrors((prev) => ({ ...prev, comment: undefined }));
                }
              }}
              placeholder="Tulis ulasan tentang keandalan rekan bantuan untuk ditampilkan di profilnya..."
              aria-invalid={Boolean(errors.comment)}
            />
            {errors.comment && (
              <small className="field-error" role="alert">
                {errors.comment}
              </small>
            )}
          </div>

          <div className="rating-field">
            <label htmlFor="recommend-user">
              Apakah kamu merekomendasikan {partnerName} ke teman lain?
            </label>
            <select
              id="recommend-user"
              name="recommend"
              value={recommend}
              onChange={(e) => setRecommend(e.target.value)}
            >
              <option value="yes">Sangat Merekomendasikan</option>
              <option value="neutral">Netral</option>
              <option value="no">Tidak Merekomendasikan</option>
            </select>
          </div>
        </fieldset>

        {/* 4. Konfirmasi Akhir */}
        <div className="rating-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={submitting || Boolean(businessBlock)}
          >
            {submitting ? "Menyimpan..." : "Kirim Ulasan"}
          </button>
          <Link href="/aktivitas" className="button button-outline">
            Kembali ke Aktivitas
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function RatingPage() {
  return (
    <Suspense fallback={<div className="rating-page-wrap"><p className="rating-status">Memuat form penilaian...</p></div>}>
      <RatingContent />
    </Suspense>
  );
}
