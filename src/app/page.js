"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fetchPublicPosts, getPublicPosts, DEMO_POSTS, computeCategoryCounts } from "../lib/data.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { PostCard } from "../components/PostCard";
import { SvgIcon } from "../components/Icons.jsx";

// Data seed statis untuk initial state yang konsisten antara server dan client
// Hanya digunakan di mode demo; mode Supabase mulai dari kosong agar tidak flash data lama
const supabaseActive = isSupabaseConfigured();
const INITIAL_SEED_POSTS = supabaseActive ? [] : DEMO_POSTS.slice(0, 3);

// Ikon per kategori resmi memakai SvgIcon (SVG inline, terracotta) — bukan emoji
// maupun aset ikon hijau/teal lama di /assets/images.
const CATEGORY_ICON_NAMES = {
  ditemani: "users",
  bantuan: "hand",
  pendampingan: "chat",
  explore: "search",
};

// Bukti sosial di hero dihitung dari postingan aktif yang benar-benar dimuat
// (lihat `proofStats` di dalam komponen), bukan angka statis/dummy.

export default function HomePage() {
  const [posts, setPosts] = useState(INITIAL_SEED_POSTS);
  const [allActivePosts, setAllActivePosts] = useState(
    supabaseActive ? null : () => getPublicPosts(),
  );
  const [loading, setLoading] = useState(supabaseActive);
  const [feedError, setFeedError] = useState(null);

  const popularCategories = useMemo(
    () => (allActivePosts === null ? null : computeCategoryCounts(allActivePosts)),
    [allActivePosts],
  );

  // Bukti sosial di hero dihitung dari postingan aktif yang benar-benar termuat
  // (bukan angka statis/dummy): jumlah permintaan/penawaran aktif, jumlah warga
  // yang berbagi, dan fakta "gratis bergabung" yang memang berlaku di produk ini.
  const proofStats = useMemo(() => {
    const active = Array.isArray(allActivePosts) ? allActivePosts : posts;
    const contributors = new Set(
      active.map((p) => p.authorId).filter(Boolean),
    ).size;
    const stillLoading = supabaseActive && loading;
    return [
      { value: stillLoading ? "…" : String(active.length), label: "Permintaan aktif" },
      { value: stillLoading ? "…" : String(contributors), label: "Warga berbagi" },
      { value: "Gratis", label: "Untuk bergabung" },
    ];
  }, [allActivePosts, posts, loading]);

  useEffect(() => {
    let isCancelled = false;

    if (supabaseActive) {
      setLoading(true);
      setFeedError(null);
    }

    fetchPublicPosts()
      .then((data) => {
        if (!isCancelled) {
          setPosts(data.slice(0, 3));
          setAllActivePosts(data);
          setFeedError(null);
          if (supabaseActive) setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          if (supabaseActive) {
            setFeedError(err.message || "Gagal memuat postingan dari server.");
            setPosts([]);
            setAllActivePosts(null);
            setLoading(false);
          } else {
            const fallbackPosts = getPublicPosts();
            setPosts(fallbackPosts.slice(0, 3));
            setAllActivePosts(fallbackPosts);
          }
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Scroll reveal: section ber-anotasi [data-reveal] muncul halus saat masuk viewport.
  // Hormati prefers-reduced-motion (observer tidak menambah kelas, elemen langsung terlihat).
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }
    const targets = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window) || targets.length === 0) {
      targets.forEach((el) => el.classList.add("is-revealed"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      {/* ============ HERO ============ */}
      <section className="hero-section">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <span className="dot" aria-hidden="true" /> Komunitas saling bantu — Yogyakarta
          </span>
          <h1>
            Butuh bantuan atau teman <em>hari ini</em>&#8201;?
          </h1>
          <p className="hero-lede">
            Temukan orang di sekitar yang siap membantu, atau tawarkan
            keahlian dan waktumu kepada mereka yang membutuhkan — bukan lewat
            aplikasi, tapi lewat koneksi antar manusia.
          </p>
          <div className="hero-actions">
            <Link href="/buat-postingan" className="button button-primary">
              Buat Permintaan
              <SvgIcon name="arrowRight" size={16} strokeWidth={2} />
            </Link>
            <Link href="/katalog" className="button button-outline">
              Tawarkan Bantuan
            </Link>
          </div>
          <div className="hero-proof" aria-label="Statistik komunitas">
            {proofStats.map((s) => (
              <div className="hero-proof-item" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ilustrasi signature: dua sisi komunitas yang saling terhubung */}
        <div className="hero-visual" aria-hidden="true">
          {/* Garis koneksi melengkung: hub avatar di tengah terhubung ke
              tiap kartu, bukan lingkaran dekoratif. */}
          <svg
            className="hero-connector"
            viewBox="0 0 480 452"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            {/* hub (avatar cluster) → kartu kebutuhan (kiri atas).
                Koordinat mengikuti viewBox 480×452 dan dihitung dari
                tepi nyata tiap elemen, jadi garis benar-benar menyentuh
                hub dan kartu — bukan ornamen di ruang kosong. */}
            <path
              className="hero-connector-path"
              d="M206 197 C 190 178, 166 162, 150 147"
              strokeLinecap="round"
            />
            {/* hub → kartu penawaran (kanan bawah) */}
            <path
              className="hero-connector-path"
              d="M278 256 C 296 274, 316 292, 332 310"
              strokeLinecap="round"
            />
            {/* hub → chip Teman ngopi (kanan atas) */}
            <path
              className="hero-connector-path"
              d="M302 210 C 330 168, 350 110, 372 50"
              strokeLinecap="round"
            />
            {/* hub → chip Angkut barang (kiri bawah) */}
            <path
              className="hero-connector-path"
              d="M180 246 C 154 288, 142 344, 128 400"
              strokeLinecap="round"
            />
          </svg>
          <span className="visual-dot visual-dot-1" aria-hidden="true" />
          <span className="visual-dot visual-dot-2" aria-hidden="true" />
          <span className="visual-dot visual-dot-3" aria-hidden="true" />
          <span className="visual-dot visual-dot-4" aria-hidden="true" />

          {/* Kartu utama: kebutuhan */}
          <div className="visual-card visual-card-need">
            <span className="vc-person vc-person-a">
              <SvgIcon name="person" size={26} strokeWidth={1.6} />
            </span>
            <span className="vc-kicker vc-badge-need">Butuh bantuan</span>
            <span className="vc-title">Teman pindahan kos</span>
            <span className="vc-meta">Pogung Baru · Sabtu 09.00</span>
          </div>

          {/* Kartu utama: penawaran */}
          <div className="visual-card visual-card-offer">
            <span className="vc-person vc-person-b">
              <SvgIcon name="wave" size={26} strokeWidth={1.6} />
            </span>
            <span className="vc-kicker vc-badge-offer">Saya bisa</span>
            <span className="vc-title">Belajar bahasa Inggris</span>
            <span className="vc-meta">Sleman · Fleksibel</span>
          </div>

          {/* Kartu kecil pendukung (ilustrasi saja, bukan data nyata) */}
          <div className="visual-card visual-card-sm visual-card-sm-1">
            <SvgIcon name="package" size={15} strokeWidth={1.8} />
            <span>Angkut barang</span>
          </div>
          <div className="visual-card visual-card-sm visual-card-sm-2">
            <SvgIcon name="chat" size={15} strokeWidth={1.8} />
            <span>Teman ngopi</span>
          </div>

          {/* Koneksi manusia: avatar kecil */}
          <span className="visual-avatar-cluster" aria-hidden="true">
            <span className="mini-avatar mini-avatar-1">
              <SvgIcon name="person" size={13} strokeWidth={1.8} />
            </span>
            <span className="mini-avatar mini-avatar-2">
              <SvgIcon name="person" size={13} strokeWidth={1.8} />
            </span>
            <span className="mini-avatar mini-avatar-3" aria-hidden="true">+2</span>
          </span>

          <span className="visual-link-chip" aria-hidden="true">
            <SvgIcon name="chat" size={14} strokeWidth={2} /> terhubung
          </span>
        </div>
      </section>

      {/* ============ KATEGORI ============ */}
      <section className="container category-section">
        <h2>Mulai dari kebutuhanmu</h2>
        <div className="category-grid">
          {popularCategories === null ? (
            <p className="empty-state" style={{ color: "var(--color-text-muted)" }}>
              Memuat kategori...
            </p>
          ) : popularCategories.length > 0 ? (
            <>
              {popularCategories.map((category) => (
                <Link
                  key={category.key}
                  href={`/katalog?category=${encodeURIComponent(category.key)}`}
                  className="category-card"
                >
                  <div className="category-icon">
                    <SvgIcon
                      name={CATEGORY_ICON_NAMES[category.key] || "tag"}
                      size={24}
                      strokeWidth={1.75}
                    />
                  </div>
                  <h3>{category.label}</h3>
                  <p>{category.count} aktif</p>
                </Link>
              ))}

              {/* Kartu kelima: pintasan ke seluruh katalog, bukan kategori palsu */}
              <Link href="/katalog" className="category-card category-card-all">
                <div className="category-icon">
                  <SvgIcon name="arrowRight" size={24} strokeWidth={1.75} />
                </div>
                <h3>Lihat Semua</h3>
                <p>Jelajahi semua bantuan</p>
              </Link>
            </>
          ) : (
            <p className="empty-state">Belum ada postingan aktif saat ini.</p>
          )}
        </div>
      </section>

      {/* ============ CARA KERJA ============ */}
      <section className="container how-section" data-reveal>
        <div className="section-header">
          <p className="section-eyebrow">Cara kerja</p>
          <h2>Kebaikan dimulai dari tiga langkah sederhana</h2>
        </div>
        <div className="how-grid">
          <div className="how-step">
            <span className="how-num">1</span>
            <h3>Ceritakan kebutuhanmu</h3>
            <p>
              Minta bantuan fisik, teman ngopi, atau tawarkan keahlianmu dalam
              satu postingan singkat.
            </p>
          </div>
          <div className="how-step">
            <span className="how-num">2</span>
            <h3>Temukan orang yang tepat</h3>
            <p>
              Komunitas di sekitar melihat postinganmu dan mengajukan diri
              lewat chat.
            </p>
          </div>
          <div className="how-step">
            <span className="how-num">3</span>
            <h3>Bantu &amp; bangun reputasi</h3>
            <p>
              Bertemu langsung, selesaikan, lalu saling memberi ulasan untuk
              komunitas yang lebih aman.
            </p>
          </div>
        </div>
      </section>

      {/* ============ PERMINTAAN TERBARU ============ */}
      <section className="container request-section" data-reveal>
        <div className="section-header">
          <div>
            <p className="section-eyebrow">Permintaan terbaru</p>
            <h2>Di sekitar kamu saat ini</h2>
          </div>
          <Link href="/katalog" className="see-all">
            Lihat semua <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <div className="cards-grid">
          {feedError ? (
            <p className="empty-state" role="alert" style={{ color: "var(--color-error)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <SvgIcon name="warning" size={18} strokeWidth={2} /> {feedError}
            </p>
          ) : loading ? (
            <p className="empty-state" style={{ color: "var(--color-text-muted)" }}>
              Memuat postingan terbaru...
            </p>
          ) : posts.length > 0 ? (
            posts.map((post, idx) => (
              <PostCard key={post.id} post={post} index={idx} />
            ))
          ) : (
            <p className="empty-state">Belum ada postingan aktif saat ini.</p>
          )}
        </div>
      </section>
    </main>
  );
}
