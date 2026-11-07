"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  fetchPublicProfile,
  fetchPublicProfileReviews,
  summarizeProfileReviews,
} from "../../../lib/data.js";
import { resolveAvatarSrc } from "../../../lib/avatars.js";
import { SvgIcon } from "../../../components/Icons.jsx";

function Stars({ value }) {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="public-rating-stars" aria-label={`${Number(value || 0).toFixed(1)} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rounded ? "is-filled" : ""} aria-hidden="true">★</span>
      ))}
    </span>
  );
}
export default function PublicUserPage() {
  const params = useParams();
  const userId = String(params?.id || "");
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    Promise.all([fetchPublicProfile(userId), fetchPublicProfileReviews(userId)])
      .then(([profileData, reviewData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setReviews(reviewData);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Gagal memuat profil pengguna.");
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  const summary = useMemo(() => summarizeProfileReviews(reviews), [reviews]);

  if (loading) {
    return <main className="public-profile-page"><p className="public-profile-status">Memuat reputasi pengguna...</p></main>;
  }

  if (error || !profile) {
    return (
      <main className="public-profile-page">
        <section className="public-profile-empty">
          <SvgIcon name="warning" size={22} strokeWidth={2} />
          <h1>Profil tidak dapat dimuat</h1>
          <p>{error || "Pengguna ini tidak ditemukan."}</p>
          <Link href="/katalog" className="button button-primary">Kembali ke Katalog</Link>
        </section>
      </main>
    );
  }

  const name = profile.name || "Pengguna NeedHelp";
  const avatar = resolveAvatarSrc({ key: profile.avatar_key, url: profile.avatar_url });
  const initial = profile.initial || name.charAt(0).toUpperCase();

  return (
    <main className="public-profile-page">
      <Link href="/katalog" className="public-profile-back">← Kembali ke Katalog</Link>

      <section className="public-profile-hero">
        <div className="public-profile-avatar" aria-hidden="true">
          {avatar ? <img src={avatar} alt="" width={88} height={88} /> : <span>{initial}</span>}
        </div>
        <div className="public-profile-intro">
          <p className="public-profile-eyebrow">Profil komunitas</p>
          <h1>{name}</h1>
          <p>{profile.bio || "Pengguna komunitas NeedHelp."}</p>
        </div>
        <div className="public-rating-summary">
          {summary.count > 0 ? (
            <>
              <strong>{summary.average.toFixed(1)}</strong>
              <Stars value={summary.average} />
              <span>{summary.count} ulasan terverifikasi</span>
            </>
          ) : (
            <>
              <strong>Baru</strong>
              <span>Belum memiliki ulasan</span>
            </>
          )}
        </div>
      </section>

      <section className="public-reviews-section" aria-labelledby="public-reviews-title">
        <header>
          <div>
            <p className="public-profile-eyebrow">Pengalaman komunitas</p>
            <h2 id="public-reviews-title">Rating dan ulasan</h2>
          </div>
          <span>{summary.count} ulasan</span>
        </header>

        {reviews.length === 0 ? (
          <div className="public-profile-empty compact">
            <SvgIcon name="star" size={22} strokeWidth={2} />
            <h3>Belum ada ulasan</h3>
            <p>Ulasan akan tampil setelah aktivitas selesai dan partner memberikan penilaian.</p>
          </div>
        ) : (
          <div className="public-review-list">
            {reviews.map((review) => {
              const reviewerAvatar = resolveAvatarSrc({ key: review.reviewerAvatarKey, url: null });
              return (
                <article key={review.id} className="public-review-card">
                  <header>
                    <Link href={`/pengguna/${encodeURIComponent(review.reviewerId)}`} className="public-reviewer">
                      <span className="public-reviewer-avatar" aria-hidden="true">
                        {reviewerAvatar ? <img src={reviewerAvatar} alt="" width={38} height={38} /> : review.reviewerInitial}
                      </span>
                      <span><strong>{review.reviewerName}</strong><small>{review.postTitle}</small></span>
                    </Link>
                    <div className="public-review-score"><Stars value={review.rating} /><strong>{review.rating}.0</strong></div>
                  </header>
                  {review.comment ? <p>“{review.comment}”</p> : <p className="is-muted">Tidak ada komentar tertulis.</p>}
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  </time>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

