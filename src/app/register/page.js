"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "../../lib/auth.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { validateRegistration } from "../../lib/validation.js";
import { useToast } from "../../components/Toast";

function RegisterForm() {
  const router = useRouter();
  const { showToast } = useToast();

  const supabaseMode = isSupabaseConfigured();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Jika Supabase tidak dikonfigurasi, tampilkan pesan info
  if (!supabaseMode) {
    return (
      <main className="login-main">
        <aside className="login-banner">
          <div className="banner-content">
            <Link href="/">
              <span className="site-wordmark site-wordmark-banner">NeedHelp</span>
            </Link>
            <div className="quote-icon">"</div>
            <h1>
              Platform yang mempertemukan niat baik dengan kebutuhan nyata — di
              sekitarmu.
            </h1>
          </div>
          <div className="banner-proof" aria-label="Komunitas NeedHelp">
            <span className="banner-proof-avatars" aria-hidden="true">
              <img src="/assets/images/avatar-budi.svg" alt="" width="30" height="30" />
              <img src="/assets/images/avatar-sari.svg" alt="" width="30" height="30" />
              <img src="/assets/images/avatar-rina.svg" alt="" width="30" height="30" />
            </span>
            <span className="banner-proof-text">
              Bergabunglah dengan 850+ relawan yang siap membantu sekitar.
            </span>
          </div>
        </aside>

        <section className="login-card" aria-labelledby="register-title">
          <header>
            <h1 id="register-title">Registrasi Belum Tersedia</h1>
            <p>
              Pendaftaran akun baru hanya tersedia saat Supabase terkonfigurasi.
              Gunakan akun demo untuk mencoba alur utama aplikasi.
            </p>
          </header>

          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <Link href="/login" className="button button-primary">
              Kembali ke Halaman Masuk
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateRegistration(name, email, password, confirmPassword);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast(
        "Terdapat kesalahan isian formulir. Mohon periksa kembali kolom yang ditandai merah.",
        "error",
      );

      // Fokuskan ke field pertama yang bermasalah
      const firstErrorField = Object.keys(validationErrors)[0];
      const fieldMap = { name: "reg-name", email: "reg-email", password: "reg-password", confirmPassword: "reg-confirm" };
      const targetElement = document.getElementById(fieldMap[firstErrorField]);
      if (targetElement) {
        targetElement.focus();
      }
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const { user, error } = await signUp(email, password, name);

      if (error || !user) {
        setErrors({
          general: error || "Gagal membuat akun. Silakan coba lagi.",
        });
        setSubmitting(false);
        return;
      }

      // Periksa apakah email sudah terkonfirmasi
      // Supabase bisa mengembalikan user tanpa sesi aktif jika email confirmation aktif
      if (!user.email_confirmed_at) {
        showToast(
          "Akun berhasil dibuat! Silakan cek email Anda untuk verifikasi sebelum masuk.",
          "info",
        );
        router.push("/login");
        return;
      }

      // Email sudah terkonfirmasi → user langsung login
      showToast("Akun berhasil dibuat! Selamat datang di NeedHelp.", "success");
      router.push("/");
    } catch (err) {
      setErrors({
        general: err.message || "Terjadi kesalahan saat mendaftar.",
      });
      setSubmitting(false);
    }
  };

  return (
    <main className="login-main">
      <aside className="login-banner">
        <div className="banner-content">
          <Link href="/">
            <span className="site-wordmark site-wordmark-banner">NeedHelp</span>
          </Link>
          <div className="quote-icon">"</div>
          <h1>
            Bergabunglah dengan komunitas saling bantu — daftar gratis dan mulai
            berbagi kebaikan hari ini.
          </h1>

          <div className="banner-stats">
            <div className="stat-item">
              <h3>2.1k+</h3>
              <p>Permintaan dibantu</p>
            </div>
            <div className="stat-item">
              <h3>850+</h3>
              <p>Relawan aktif</p>
            </div>
            <div className="stat-item">
              <h3>4.8<span style={{ fontSize: "0.8em" }}>&#8201;/&#8201;5</span></h3>
              <p>Rating komunitas</p>
            </div>
          </div>
        </div>

        <div className="banner-proof" aria-label="Komunitas NeedHelp">
            <span className="banner-proof-avatars" aria-hidden="true">
              <img src="/assets/images/avatar-budi.svg" alt="" width="30" height="30" />
              <img src="/assets/images/avatar-sari.svg" alt="" width="30" height="30" />
              <img src="/assets/images/avatar-rina.svg" alt="" width="30" height="30" />
            </span>
            <span className="banner-proof-text">
              Bergabunglah dengan 850+ relawan yang siap membantu sekitar.
            </span>
          </div>
      </aside>

      <section className="login-card" aria-labelledby="register-title">
        <header>
          <h1 id="register-title">Daftar Akun Baru</h1>
          <p>Buat akun untuk mulai meminta atau menawarkan bantuan.</p>
        </header>

        {errors.general && (
          <p className="error-banner" role="alert">
            {errors.general}
          </p>
        )}

        <form id="register-form" onSubmit={handleSubmit} noValidate>
          <div className="fields">
            {/* Nama Lengkap */}
            <div className="field">
              <label htmlFor="reg-name">Nama Lengkap</label>
              <input
                id="reg-name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) {
                    setErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                placeholder="Contoh: Arif Raharjo"
                maxLength={60}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "reg-name-error" : undefined}
                disabled={submitting}
              />
              {errors.name && (
                <small id="reg-name-error" className="field-error" role="alert">
                  {errors.name}
                </small>
              )}
            </div>

            {/* Email */}
            <div className="field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) {
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="Contoh: nama@email.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "reg-email-error" : undefined}
                disabled={submitting}
              />
              {errors.email && (
                <small id="reg-email-error" className="field-error" role="alert">
                  {errors.email}
                </small>
              )}
            </div>

            {/* Password */}
            <div className="field">
              <label htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) {
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                placeholder="Contoh: Masukkan kata sandi (minimal 8 karakter)"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "reg-password-error" : undefined}
                disabled={submitting}
              />
              {errors.password && (
                <small id="reg-password-error" className="field-error" role="alert">
                  {errors.password}
                </small>
              )}
            </div>

            {/* Konfirmasi Password */}
            <div className="field">
              <label htmlFor="reg-confirm">Konfirmasi Password</label>
              <input
                id="reg-confirm"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) {
                    setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }
                }}
                placeholder="Contoh: Ulangi kata sandi"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? "reg-confirm-error" : undefined}
                disabled={submitting}
              />
              {errors.confirmPassword && (
                <small id="reg-confirm-error" className="field-error" role="alert">
                  {errors.confirmPassword}
                </small>
              )}
            </div>
          </div>

          <button
            className="button button-primary"
            type="submit"
            disabled={submitting}
            style={{ marginTop: "16px" }}
          >
            {submitting ? "Mendaftar..." : "Daftar Sekarang"}
          </button>

          <p className="register" style={{ marginTop: "16px" }}>
            Sudah punya akun?{" "}
            <Link href="/login" className="text-button">
              Masuk di sini
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="login-main"><p>Memuat formulir pendaftaran...</p></div>}>
      <RegisterForm />
    </Suspense>
  );
}
