"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { writeSession, signInWithPassword, CURRENT_USER } from "../../lib/auth.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { validateLogin } from "../../lib/validation.js";
import { getSafeInternalPath } from "../../lib/navigation.js";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { SvgIcon } from "../../components/Icons.jsx";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const nextParam = getSafeInternalPath(searchParams.get("next"), "/");
  const supabaseMode = isSupabaseConfigured();

  const [email, setEmail] = useState(supabaseMode ? "" : "demo@needhelp.test");
  const [password, setPassword] = useState(supabaseMode ? "" : "NeedHelp123!");
  const [rememberMe, setRememberMe] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [modalContent, setModalContent] = useState(null);

  const infoTexts = {
    forgot: {
      title: "Lupa password",
      body: supabaseMode
        ? "Gunakan fitur 'Reset Password' di dashboard Supabase atau hubungi administrator."
        : "Pemulihan password belum tersedia pada prototipe ini. Gunakan akun demo demo@needhelp.test dengan password NeedHelp123!.",
    },
    google: {
      title: "Login dengan Google",
      body: "Login Google belum diaktifkan. Silakan masuk dengan email dan password.",
    },
    register: {
      title: "Daftar akun",
      body: supabaseMode
        ? "Pendaftaran akun baru dapat dilakukan melalui halaman registrasi terpisah atau dashboard Supabase."
        : "Pendaftaran akun belum tersedia pada prototipe ini. Gunakan akun demo untuk mencoba alur utama.",
    },
  };

  const handleOpenInfo = (type) => {
    if (infoTexts[type]) {
      setModalContent(infoTexts[type]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const validationErrors = validateLogin(email, password);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      if (supabaseMode) {
        // --- Jalur Supabase Auth ---
        const { user, error } = await signInWithPassword(email, password);

        if (error || !user) {
          setErrors({
            general: error || "Email atau password salah.",
          });
          setSubmitting(false);
          return;
        }

        showToast("Berhasil masuk!", "success");
      } else {
        // --- Jalur Demo ---
        writeSession(rememberMe, {
          id: CURRENT_USER.id,
          email: CURRENT_USER.email,
          name: CURRENT_USER.name,
          at: new Date().toISOString(),
        });
        showToast("Berhasil masuk ke akun demo!", "success");
      }

      router.push(nextParam);
    } catch (err) {
      setErrors({
        general: err.message || "Gagal menyimpan sesi.",
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
            Platform yang mempertemukan niat baik dengan kebutuhan nyata — di
            sekitarmu.
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
        </div>
      </aside>

      <section className="login-card" aria-labelledby="login-title">
        <header>
          <h1 id="login-title">Selamat datang kembali</h1>
          <p>Masuk untuk mulai meminta atau menawarkan bantuan.</p>
        </header>

        {errors.general && (
          <p className="error-banner" role="alert">
            {errors.general}
          </p>
        )}

        <form id="login-form" onSubmit={handleSubmit} noValidate>
          <div className="fields">
            <div className="field">
              <label htmlFor="user-email">Email</label>
              <input
                id="user-email"
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
                placeholder={supabaseMode ? "Contoh: nama@email.com" : "Contoh: demo@needhelp.test"}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "user-email-error" : undefined}
                disabled={submitting}
              />
              {errors.email && (
                <small id="user-email-error" className="field-error" role="alert">
                  {errors.email}
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="user-password">Password</label>
              <input
                id="user-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) {
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                placeholder="Contoh: Masukkan kata sandi"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "user-password-error" : undefined
                }
                disabled={submitting}
              />
              {errors.password && (
                <small
                  id="user-password-error"
                  className="field-error"
                  role="alert"
                >
                  {errors.password}
                </small>
              )}
            </div>
          </div>

          <div className="meta-row">
            <label className="remember">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={submitting}
              />
              Ingat saya
            </label>
            <button
              className="text-button"
              type="button"
              onClick={() => handleOpenInfo("forgot")}
            >
              Lupa password?
            </button>
          </div>

          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? "Masuk..." : "Masuk"}
          </button>

          <div className="divider">
            <span>atau</span>
          </div>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => handleOpenInfo("google")}
            disabled={submitting}
          >
            Lanjutkan dengan Google
          </button>

          <p className="register">
            Belum punya akun?{" "}
            {supabaseMode ? (
              <Link href="/register" className="text-button">
                Daftar sekarang
              </Link>
            ) : (
              <button
                className="text-button"
                type="button"
                onClick={() => handleOpenInfo("register")}
              >
                Daftar sekarang
              </button>
            )}
          </p>

          {!supabaseMode && (
            <p style={{ marginTop: "16px", fontSize: "11px", color: "var(--color-text-muted)", textAlign: "center", display: "inline-flex", alignItems: "center", gap: "6px", justifyContent: "center", width: "100%" }}>
              <SvgIcon name="idea" size={14} strokeWidth={2} /> Mode Demo: Gunakan akun <code>demo@needhelp.test</code> / <code>NeedHelp123!</code>
            </p>
          )}
        </form>
      </section>

      <Modal
        isOpen={Boolean(modalContent)}
        onClose={() => setModalContent(null)}
        title={modalContent?.title || ""}
      >
        <p>{modalContent?.body}</p>
      </Modal>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-main"><p>Memuat formulir masuk...</p></div>}>
      <LoginForm />
    </Suspense>
  );
}
