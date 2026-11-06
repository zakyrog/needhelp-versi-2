"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { readSession, clearSession, signOut } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import { fetchCurrentProfile } from "../lib/data.js";
import { fetchUnreadNotificationCount } from "../lib/notifications.js";
import { subscribeToNotifications } from "../lib/notification-realtime.js";
import { useToast } from "./Toast";
import { SvgIcon } from "./Icons.jsx";
import { resolveAvatarSrc, DEMO_PROFILE_KEY } from "../lib/avatars.js";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { showToast } = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState(null);
  // Profil dari tabel `profiles` (avatar_url/initial) — hanya untuk tampilan
  // avatar. Tidak pernah membuat data; null berarti pakai inisial dari nama.
  const [profile, setProfile] = useState(null);
  // Penanda perubahan profil demo (localStorage.setItem di tab yang sama tidak
  // memicu event "storage"), agar avatar pilihan langsung tampil di Header.
  const [profileRevision, setProfileRevision] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Badge dihitung dari tabel notifications (migration 014). Tanpa sesi atau
  // saat Supabase tidak dikonfigurasi, badge bernilai 0 (bukan data statis).
  const refreshUnread = useCallback(async (activeSession) => {
    if (!activeSession || !isSupabaseConfigured()) {
      setUnreadNotifCount(0);
      return;
    }
    try {
      setUnreadNotifCount(await fetchUnreadNotificationCount());
    } catch {
      // Jangan menampilkan angka palsu bila database/RLS belum siap.
      setUnreadNotifCount(0);
    }
  }, []);

  const syncAuthAndNotifs = useCallback(() => {
    const current = readSession();
    setSession(current);
    refreshUnread(current);
  }, [refreshUnread]);

  useEffect(() => {
    syncAuthAndNotifs();

    const handleStorageChange = () => {
      syncAuthAndNotifs();
      setProfileRevision((prev) => prev + 1);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [pathname, syncAuthAndNotifs]);

  // Realtime notifikasi baru -> badge dan (di halaman notifikasi) daftar ikut
  // diperbarui tanpa reload. RLS membatasi ke milik pengguna sendiri.
  useEffect(() => {
    if (!session || !isSupabaseConfigured()) return undefined;
    const stop = subscribeToNotifications((row) => {
      setUnreadNotifCount((prev) => (row.read_at ? prev : prev + 1));
    });
    return stop;
  }, [session]);

  // Ambil profil (avatar_url/initial) milik pengguna yang sedang login dari
  // tabel `profiles` lewat helper yang sudah ada. Tanpa sesi atau tanpa
  // Supabase, profil dibiarkan null sehingga avatar memakai inisial nama.
  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setProfile(null);
      return undefined;
    }
    if (!isSupabaseConfigured()) {
      // Mode demo: tidak ada tabel profiles. Baca cache profil yang disimpan
      // halaman /profil (nama/bio/avatarKey) agar avatar pilihan tetap tampil
      // setelah reload. Tidak ada data palsu — hanya memantulkan pilihan
      // pengguna sendiri di perangkat ini.
      try {
        const raw = window.localStorage.getItem(DEMO_PROFILE_KEY);
        const cached = raw ? JSON.parse(raw) : null;
        // Bentuk cache demo: { name, bio, avatarKey } — normalkan ke bentuk
        // kolom profiles agar jalur render di bawah sama untuk kedua mode.
        setProfile(
          cached
            ? { name: cached.name || null, avatar_key: cached.avatarKey || null }
            : null,
        );
      } catch {
        setProfile(null);
      }
      return undefined;
    }
    fetchCurrentProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session, profileRevision]);

  // Handle escape key to close menus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };

    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileMenuOpen]);

  const handleLogout = async (e) => {
    e.preventDefault();
    if (isSupabaseConfigured()) {
      await signOut();
    } else {
      clearSession();
    }
    setSession(null);
    setProfileMenuOpen(false);
    showToast("Berhasil keluar.", "info");
    router.push("/");
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/katalog?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/katalog");
    }
    setMenuOpen(false);
  };

  const closeMenu = () => setMenuOpen(false);

  const toggleProfileMenu = () => {
    setProfileMenuOpen((prev) => !prev);
  };

  // --- Data tampilan avatar (tidak ada data baru yang dibuat) ---
  // Nama: dari profil `profiles.name` bila ada, jika tidak dari sesi auth.
  const displayName = profile?.name || session?.name || null;
  // Avatar: ilustrasi pilihan (avatar_key) → foto (avatar_url) → null.
  // Placeholder lama (aset teal) bukan foto pengguna dan tidak ditampilkan,
  // agar tidak memunculkan aksen teal di luar design system; null berarti
  // Header menampilkan inisial nama (avatar default).
  const avatarUrl = resolveAvatarSrc({
    key: profile?.avatar_key,
    url: profile?.avatar_url,
  });
  // Inisial: pakai kolom `initial` dari DB bila ada, jika tidak huruf
  // pertama nama tampilan.
  const avatarInitial = (
    (profile?.initial || "").trim() ||
    (displayName || "").trim() ||
    "?"
  )
    .charAt(0)
    .toUpperCase();

  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  return (
    <header className="site-header">
      <Link href="/" className="site-brand" aria-label="NeedHelp - Beranda" onClick={closeMenu}>
        <span className="site-wordmark">NeedHelp</span>
      </Link>

      <button
        type="button"
        className="menu-toggle"
        aria-controls="main-nav"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        {menuOpen ? "Tutup" : "Menu"}
      </button>

      <nav
        id="main-nav"
        className="site-nav"
        aria-label="Navigasi Utama"
        data-open={String(menuOpen)}
      >
        <ul>
          <li>
            <Link
              href="/"
              aria-current={pathname === "/" ? "page" : undefined}
              onClick={closeMenu}
            >
              Beranda
            </Link>
          </li>
          <li>
            <Link
              href="/katalog"
              aria-current={pathname === "/katalog" ? "page" : undefined}
              onClick={closeMenu}
            >
              Katalog
            </Link>
          </li>
          <li>
            <Link
              href="/buat-postingan"
              aria-current={pathname === "/buat-postingan" ? "page" : undefined}
              onClick={closeMenu}
            >
              Buat Postingan
            </Link>
          </li>
          <li>
            <Link
              href="/aktivitas"
              aria-current={pathname.startsWith("/aktivitas") ? "page" : undefined}
              onClick={closeMenu}
            >
              Aktivitas
            </Link>
          </li>
          <li>
            <Link
              href="/chat"
              aria-current={pathname === "/chat" ? "page" : undefined}
              onClick={closeMenu}
            >
              Pesan
            </Link>
          </li>
        </ul>
      </nav>

      <div className="header-right-actions">
        <form
          className="search-box-wrapper"
          onSubmit={handleSearchSubmit}
          role="search"
        >
          <img
            src="/assets/images/icon-search.svg"
            alt=""
            className="search-icon"
            width="16"
            height="16"
          />
          <input
            type="search"
            name="q"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari bantuan..."
            aria-label="Cari bantuan"
          />
        </form>

        {/* Icon chat hanya jika sudah login */}
        {session && (
          <Link href="/chat" className="icon-action-btn" aria-label="Pesan" onClick={closeMenu}>
            <img src="/assets/images/icon-chat.svg" alt="" width="18" height="18" />
          </Link>
        )}

        <Link
          href="/notifikasi"
          className="icon-action-btn"
          aria-label={
            unreadNotifCount > 0
              ? `Notifikasi (${unreadNotifCount} belum dibaca)`
              : "Notifikasi"
          }
          onClick={closeMenu}
          style={{ position: "relative" }}
        >
          <img src="/assets/images/icon-bell.svg" alt="" width="18" height="18" />
          {unreadNotifCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#e53e3e",
                color: "#fff",
                fontSize: "10px",
                fontWeight: "bold",
                borderRadius: "999px",
                width: "16px",
                height: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {unreadNotifCount}
            </span>
          )}
        </Link>

        {/* Avatar profil + dropdown. Tombol dan menu memakai kelas theme.css
            (bukan inline style) agar konsisten dengan design system. */}
        <div className="profile-menu-anchor" ref={profileMenuRef}>
          <button
            type="button"
            className="user-profile-badge"
            aria-label={
              session ? `Menu profil ${displayName || "pengguna"}` : "Menu pengunjung"
            }
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-controls="profile-menu"
            title={session ? displayName || "Pengguna" : "Pengunjung"}
            onClick={toggleProfileMenu}
          >
            {session ? (
              avatarUrl ? (
                // Foto profil dari `profiles.avatar_url` (bila ada).
                <img
                  src={avatarUrl}
                  alt=""
                  className="user-profile-avatar-img"
                  width={44}
                  height={44}
                />
              ) : (
                // Tanpa foto: inisial nama di atas peach, teks terracotta.
                <span className="user-profile-initial" aria-hidden="true">
                  {avatarInitial}
                </span>
              )
            ) : (
              <SvgIcon name="person" size={20} strokeWidth={1.9} />
            )}
          </button>

          {/* Dropdown Menu — hanya route/fungsi yang memang sudah ada */}
          {profileMenuOpen && (
            <div
              className="profile-dropdown-menu"
              id="profile-menu"
              role="menu"
              aria-label={session ? "Menu profil" : "Menu pengunjung"}
            >
              {session ? (
                <>
                  <div className="profile-dropdown-header">
                    <span className="profile-dropdown-name">
                      {displayName || "Pengguna"}
                    </span>
                    {session.email && (
                      <span className="profile-dropdown-email">{session.email}</span>
                    )}
                  </div>
                  <Link
                    href="/profil"
                    role="menuitem"
                    className="profile-dropdown-item"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      closeMenu();
                    }}
                  >
                    <SvgIcon name="person" size={16} strokeWidth={1.8} />
                    Edit Profil
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    className="profile-dropdown-item profile-dropdown-item-danger"
                    onClick={handleLogout}
                  >
                    <SvgIcon name="logout" size={16} strokeWidth={1.8} />
                    Keluar
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    role="menuitem"
                    className="profile-dropdown-item profile-dropdown-item-primary"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      closeMenu();
                    }}
                  >
                    Masuk
                  </Link>
                  <Link
                    href="/register"
                    role="menuitem"
                    className="profile-dropdown-item"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      closeMenu();
                    }}
                  >
                    Daftar
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
