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

      {/* ============ DUA CARA BERPARTISIPASI ============ */}
      <section className="container role-section" data-reveal>
        <div className="section-header role-section-heading">
          <div>
            <p className="section-eyebrow">Satu komunitas, dua cara bergerak</p>
            <h2>Pilih peranmu sesuai keadaan hari ini</h2>
          </div>
          <p className="section-supporting-copy">
            Akun yang sama dapat dipakai untuk meminta bantuan maupun membantu
            warga lain. Tidak ada peran yang mengikat.
          </p>
        </div>

        <div className="role-grid">
          <article className="role-card role-card-need">
            <div className="role-card-icon" aria-hidden="true">
              <SvgIcon name="person" size={26} strokeWidth={1.7} />
            </div>
            <p className="role-card-label">Saat kamu membutuhkan</p>
            <h3>Ceritakan bantuan yang kamu cari</h3>
            <p>
              Jelaskan aktivitas, lokasi, waktu, dan bentuk kompensasi agar
              warga yang tepat dapat mengajukan bantuan.
            </p>
            <ul className="role-benefits">
              <li><SvgIcon name="check" size={16} /> Detail kebutuhan terstruktur</li>
              <li><SvgIcon name="check" size={16} /> Pilih pengajuan yang paling cocok</li>
              <li><SvgIcon name="check" size={16} /> Koordinasi langsung lewat chat</li>
            </ul>
            <Link href="/buat-postingan" className="role-card-link">
              Buat postingan <SvgIcon name="arrowRight" size={16} />
            </Link>
          </article>

          <article className="role-card role-card-offer">
            <div className="role-card-icon" aria-hidden="true">
              <SvgIcon name="hand" size={26} strokeWidth={1.7} />
            </div>
            <p className="role-card-label">Saat kamu punya waktu</p>
            <h3>Temukan orang yang bisa kamu bantu</h3>
            <p>
              Saring kebutuhan berdasarkan kategori dan wilayah, lalu ajukan
              bantuan dengan jadwal serta pesan yang jelas.
            </p>
            <ul className="role-benefits">
              <li><SvgIcon name="check" size={16} /> Jelajahi kebutuhan aktif</li>
              <li><SvgIcon name="check" size={16} /> Pantau status pengajuan</li>
              <li><SvgIcon name="check" size={16} /> Bangun reputasi lewat ulasan</li>
            </ul>
            <Link href="/katalog?type=butuh" className="role-card-link">
              Cari yang bisa dibantu <SvgIcon name="arrowRight" size={16} />
            </Link>
          </article>
        </div>

        <nav className="region-shortcuts" aria-label="Jelajahi bantuan berdasarkan wilayah">
          <span><SvgIcon name="pin" size={17} /> Jelajahi wilayah:</span>
          <Link href="/katalog?location=kota">Kota Yogyakarta</Link>
          <Link href="/katalog?location=sleman">Sleman</Link>
          <Link href="/katalog?location=bantul">Bantul</Link>
          <Link href="/katalog?location=kulonprogo">Kulon Progo</Link>
          <Link href="/katalog?location=gunungkidul">Gunungkidul</Link>
        </nav>
      </section>

      {/* ============ CARA KERJA ============ */}
      <section className="container how-section" data-reveal>
        <div className="section-header">
          <p className="section-eyebrow">Cara kerja</p>
          <h2>Dari postingan sampai bantuan selesai</h2>
        </div>
        <div className="how-grid">
          <div className="how-step">
            <span className="how-num">01</span>
            <h3>Posting atau jelajahi</h3>
            <p>
              Buat kebutuhan atau penawaranmu sendiri, atau cari postingan
              aktif di wilayah DIY.
            </p>
          </div>
          <div className="how-step">
            <span className="how-num">02</span>
            <h3>Ajukan &amp; pilih partner</h3>
            <p>
              Kirim pengajuan yang jelas. Pemilik postingan memilih partner
              yang paling sesuai.
            </p>
          </div>
          <div className="how-step">
            <span className="how-num">03</span>
            <h3>Sepakati detail di chat</h3>
            <p>
              Pastikan waktu, titik temu, kegiatan, dan kompensasi dipahami
              kedua pihak sebelum mulai.
            </p>
          </div>
          <div className="how-step">
            <span className="how-num">04</span>
            <h3>Selesaikan &amp; beri ulasan</h3>
            <p>
              Tandai aktivitas selesai lalu bagikan pengalamanmu untuk membantu
              komunitas memilih dengan lebih yakin.
            </p>
          </div>
        </div>
      </section>

      {/* ============ AMAN & TRANSPARAN ============ */}
      <section className="container trust-section" data-reveal>
        <div className="trust-panel trust-panel-primary">
          <div className="trust-icon"><SvgIcon name="shield" size={28} /></div>
          <p className="section-eyebrow">Bertemu dengan lebih tenang</p>
          <h2>Kesepakatan jelas sebelum beraktivitas</h2>
          <p>
            NeedHelp membantu kedua pihak menyimpan konteks penting—postingan,
            pengajuan, percakapan, dan status aktivitas—dalam satu alur.
          </p>
          <div className="trust-checks">
            <span><SvgIcon name="chat" size={17} /> Sepakati detail lewat chat</span>
            <span><SvgIcon name="pin" size={17} /> Pilih titik temu yang aman</span>
            <span><SvgIcon name="clock" size={17} /> Beri kabar bila jadwal berubah</span>
          </div>
        </div>
        <div className="trust-panel compensation-panel">
          <p className="section-eyebrow">Kompensasi transparan</p>
          <h3>Tentukan dari awal, bukan setelah bertemu</h3>
          <p>Pilih bentuk apresiasi yang paling cocok untuk aktivitasmu.</p>
          <div className="compensation-options" aria-label="Pilihan kompensasi NeedHelp">
            <span>Tarif pasti</span>
            <span>Nego di chat</span>
            <span>Patungan</span>
            <span>Traktir</span>
            <span>Sukarela</span>
          </div>
          <Link href="/buat-postingan" className="text-link">
            Atur detail postingan <SvgIcon name="arrowRight" size={15} />
          </Link>
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

      {/* ============ FAQ ============ */}
      <section className="container home-faq-section" data-reveal>
        <div className="home-faq-intro">
          <p className="section-eyebrow">Sebelum mulai</p>
          <h2>Hal yang sering ditanyakan</h2>
          <p>
            Jawaban singkat tentang cara memakai NeedHelp dengan nyaman dan
            bertanggung jawab.
          </p>
          <Link href="/katalog" className="button button-outline">Lihat kebutuhan aktif</Link>
        </div>
        <div className="home-faq-list">
          <details>
            <summary>Apakah satu akun bisa meminta sekaligus membantu?</summary>
            <p>Ya. Kamu dapat membuat postingan “Saya Butuh” maupun “Saya Bisa”, serta mengajukan bantuan pada postingan warga lain.</p>
          </details>
          <details>
            <summary>Apakah setiap aktivitas harus berbayar?</summary>
            <p>Tidak. Pemilik postingan dapat memilih tarif pasti, negosiasi di chat, patungan, traktir, atau bantuan sukarela.</p>
          </details>
          <details>
            <summary>Bagaimana menentukan partner yang tepat?</summary>
            <p>Baca pesan pengajuan, sepakati jadwal dan lokasi lewat chat, lalu pilih partner yang komunikasinya paling jelas dan sesuai kebutuhan.</p>
          </details>
          <details>
            <summary>Apa yang perlu dilakukan sebelum bertemu?</summary>
            <p>Pilih tempat yang aman, beri tahu orang terdekat, jangan membagikan data sensitif, dan pastikan semua detail aktivitas sudah disepakati.</p>
          </details>
        </div>
      </section>
    </main>
  );
}
