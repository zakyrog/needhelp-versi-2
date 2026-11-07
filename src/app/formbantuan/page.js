"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getPostWithStatus,
  getPostAuthor,
  saveMessage,
  submitHelpApplication,
  fetchPostById,
  fetchCurrentProfile,
  getPostLifecycleStatus,
  canPostReceiveApplications,
  classifyActivityStatus,
  getMyActiveApplicationForPost,
} from "../../lib/data";
import { EmptyState } from "../../components/EmptyState";
import { validateHelpProposal } from "../../lib/validation";
import { FormField } from "../../components/FormField";
import { useToast } from "../../components/Toast";
import { SimulationBanner } from "../../components/SimulationBanner";
import { isSupabaseConfigured, getSupabase } from "../../lib/supabase";
import { SvgIcon } from "../../components/Icons.jsx";

function FormBantuanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const postId = searchParams.get("id") || "post-pindahan";

  // Halaman yang dituju setelah login: kembali ke formulir ini untuk postingan
  // yang sama dan langsung ke langkah isian (bukan konfirmasi sukses).
  const loginHref = `/login?next=${encodeURIComponent(`/formbantuan?id=${postId}`)}`;

  const supabaseMode = isSupabaseConfigured();

  // Identitas yang SUDAH diverifikasi Supabase Auth. `post.owned` hanya turunan
  // dari cache user saat fetch dan bisa salah (misalnya sesi belum terbaca),
  // jadi keputusan "postingan sendiri" memakai id ini.
  const [verifiedUserId, setVerifiedUserId] = useState(null);
  const [authChecked, setAuthChecked] = useState(!supabaseMode);

  // Di mode Supabase, status post harus diambil segar (bukan dari cache). Post
  // selesai tetap terbuka; post batal harus tetap diblokir lewat URL langsung.
  const [post, setPost] = useState(() =>
    supabaseMode ? null : getPostWithStatus(postId),
  );
  const [postLoading, setPostLoading] = useState(supabaseMode);
  const [postError, setPostError] = useState(null);

  const author = post ? getPostAuthor(post) : { name: "Sari Wijaya", initial: "S" };
  const isNeedPost = post?.nature !== "bisa";
  const proposalLabel = isNeedPost ? "Tawaran Bantuan" : "Permintaan Bantuan";

  useEffect(() => {
    if (!supabaseMode) {
      setVerifiedUserId(null);
      setAuthChecked(true);
      return;
    }

    let isCancelled = false;
    setAuthChecked(false);

    // getUser() memverifikasi token ke server; berbeda dengan readSession()
    // yang hanya membaca cache metadata lokal.
    getSupabase()
      .auth.getUser()
      .then(({ data, error: authError }) => {
        if (isCancelled) return;
        setVerifiedUserId(authError ? null : data?.user?.id || null);
        setAuthChecked(true);
      })
      .catch(() => {
        if (isCancelled) return;
        setVerifiedUserId(null);
        setAuthChecked(true);
      });

    return () => {
      isCancelled = true;
    };
  }, [supabaseMode]);

  useEffect(() => {
    if (!supabaseMode) return;

    let isCancelled = false;
    setPostLoading(true);
    setPostError(null);

    fetchPostById(postId)
      .then((data) => {
        if (isCancelled) return;
        setPost(data);
        setPostLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        setPostError(err.message || "Gagal mengambil detail postingan.");
        setPostLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [postId, supabaseMode]);

  const [step, setStep] = useState(1);
  // Pesan sengaja kosong: placeholder hanya contoh dan tidak pernah ikut terkirim
  // bila pengguna tidak mengetik apa pun.
  const [formData, setFormData] = useState({
    helper_name: "",
    helper_message: "",
    helper_time: "",
    helper_note: "",
  });

  const [errors, setErrors] = useState({});

  const [submitting, setSubmitting] = useState(false);
  // Jalur mana yang benar-benar dipakai saat submit. Mode demo TIDAK menulis
  // ke Supabase: tidak ada baris help_applications, tidak ada trigger
  // notifikasi, dan pemilik postingan tidak diberi tahu. Langkah 3 harus
  // menyatakannya, bukan mengklaim pengajuan/notifikasi berhasil.
  const [submittedVia, setSubmittedVia] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleNextToReview = (e) => {
    e.preventDefault();
    const valErrors = validateHelpProposal(formData);
    if (Object.keys(valErrors).length > 0) {
      setErrors(valErrors);
      showToast("Terdapat kesalahan isian formulir. Mohon periksa kembali.", "error");
      return;
    }
    setErrors({});
    setStep(2);
  };

  // Post "aktif" dan "selesai" boleh diajukan. Selesai hanya menjadi penanda
  // bahwa post pernah mendapat match, bukan penutupan pengajuan baru.
  // Status "tidak diketahui" (RPC gagal, status tak dikenal, atau hasil ambigu)
  // TIDAK dianggap aktif sehingga form tidak pernah ditampilkan.
  const lifecycle = getPostLifecycleStatus(post);
  const isActive = canPostReceiveApplications(post);
  const activityKind = classifyActivityStatus(post?.activity).kind;
  const isOwnPost = Boolean(
    supabaseMode && verifiedUserId && post?.authorId === verifiedUserId,
  );
  // Di mode Supabase, jangan tampilkan form sebelum identitas terverifikasi:
  // tanpa itu kita tidak bisa memastikan ini bukan postingan sendiri.
  const identityBlocked = supabaseMode && (!authChecked || !verifiedUserId);

  // Isi nama dari profil pengguna yang login (profiles.name, sumber yang sama
  // dengan halaman /profil). Hanya diisi bila field masih kosong agar ketikan
  // pengguna tidak tertimpa. Kontak pribadi tidak diminta pada tahap pengajuan;
  // WhatsApp dibagikan kemudian dari chat dengan persetujuan kedua pihak.
  const [profileName, setProfileName] = useState(null);
  useEffect(() => {
    if (!supabaseMode || !verifiedUserId) return;
    let isCancelled = false;

    fetchCurrentProfile()
      .then((profile) => {
        if (isCancelled || !profile) return;
        setProfileName(profile.name || null);
        const name = (profile.name || "").trim();
        if (name) {
          setFormData((prev) =>
            prev.helper_name.trim() ? prev : { ...prev, helper_name: name },
          );
        }
      })
      .catch(() => {
        // Profil tidak terbaca: field tetap kosong dan dilengkapi manual.
      });

    return () => {
      isCancelled = true;
    };
  }, [supabaseMode, verifiedUserId]);
  const profileNameMissing = Boolean(verifiedUserId) && !(profileName || "").trim();

  // Cegah pengajuan ganda untuk post yang sama. Aturan proyek: satu user hanya
  // boleh punya satu pengajuan 'pending'/'accepted' per post (migration 003 +
  // partial unique index, ditegakkan RPC 010). Status 'rejected'/'withdrawn'
  // tidak memblokir pengajuan baru.
  // `appCheckPostId` memastikan hasil null dihitung sebagai "sudah diperiksa"
  // hanya untuk post yang hasilnya memang kembali.
  const [myApplication, setMyApplication] = useState(null);
  const [appCheckPostId, setAppCheckPostId] = useState(null);
  const applicationChecked =
    Boolean(verifiedUserId) && Boolean(post) && appCheckPostId === postId;
  useEffect(() => {
    if (!supabaseMode || !verifiedUserId || !post) return;
    let isCancelled = false;

    getMyActiveApplicationForPost(postId)
      .then((app) => {
        if (isCancelled) return;
        setMyApplication(app);
        setAppCheckPostId(postId);
      })
      .catch(() => {
        if (isCancelled) return;
        setMyApplication(null);
        setAppCheckPostId(postId);
      });

    return () => {
      isCancelled = true;
    };
  }, [supabaseMode, verifiedUserId, post, postId]);
  // Bila query gagal kita tidak memblokir: RPC 010 tetap menolak duplikat.
  const hasActiveApplication = Boolean(myApplication);

  // Belum login (mode Supabase): redirect langsung ke /login, lalu kembali ke
  // formulir ini setelah berhasil masuk (login mendukung ?next=).
  // Hook ini WAJIB berada sebelum conditional return mana pun, agar jumlah dan
  // urutan Hook sama di setiap render (sebelumnya hook ini ada setelah
  // `if (postLoading || !authChecked) return ...` sehingga memicu
  // "Rendered more hooks than during the previous render").
  useEffect(() => {
    if (supabaseMode && authChecked && !verifiedUserId) {
      router.replace(loginHref);
    }
  }, [supabaseMode, authChecked, verifiedUserId, router, loginHref]);

  const handleFinalSubmit = async () => {
    if (submitting) return;

    // Jangan kirim apa pun bila status post tidak memungkinkan (proteksi UI).
    // Validasi sebenarnya tetap di RPC submit_help_application.
    if (hasActiveApplication) {
      showToast("Anda sudah mengajukan bantuan untuk postingan ini.", "info");
      return;
    }
    if (identityBlocked || !isActive || isOwnPost) {
      if (identityBlocked && !isOwnPost) {
        showToast("Anda harus masuk terlebih dahulu.", "info");
        router.push(loginHref);
        return;
      }
      showToast(
        isOwnPost
          ? "Anda tidak dapat mengajukan bantuan ke postingan sendiri."
          : "Postingan ini sudah tidak menerima pengajuan bantuan.",
        "error",
      );
      return;
    }

    setSubmitting(true);

    try {
      if (supabaseMode) {
        // Verifikasi ulang identitas tepat sebelum mengirim.
        const { data: authData, error: authError } = await getSupabase().auth.getUser();
        if (authError || !authData?.user?.id) {
          setSubmitting(false);
          showToast("Silakan masuk terlebih dahulu untuk mengirim pengajuan.", "info");
          router.push(loginHref);
          return;
        }
        if (post?.authorId === authData.user.id) {
          showToast("Anda tidak dapat mengajukan bantuan ke postingan sendiri.", "error");
          setSubmitting(false);
          return;
        }

        // Satu RPC = satu baris help_applications. Notifikasi ke pemilik
        // postingan dibuat oleh TRIGGER database (migration 014), bukan di sini,
        // sehingga tidak ada notifikasi ganda dari frontend.
        await submitHelpApplication(postId, {
          message: formData.helper_message.trim(),
          contactInfo: "",
          availableTime: formData.helper_time.trim(),
          extraNote: formData.helper_note.trim(),
        });
        setSubmittedVia("supabase");
      } else {
        // Mode demo: hanya localStorage. Tidak ada record Supabase, jadi tidak
        // ada notifikasi ke pemilik postingan. Simpan pesan demo supaya alur
        // simulasi tetap bisa dilihat, dan katakan terus terang di langkah 3.
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (post && post.authorId) {
          saveMessage(
            post.authorId,
            `[${proposalLabel} Baru] ${formData.helper_message.trim()} (Waktu: ${formData.helper_time.trim()})`,
            post.title,
          );
        }
        setSubmittedVia("demo");
      }

      setSubmitting(false);
      setStep(3);
      showToast(
        supabaseMode
          ? `${proposalLabel} berhasil dikirimkan!`
          : "Tersimpan di perangkat ini (mode simulasi).",
        "success",
      );
    } catch (err) {
      setSubmitting(false);
      showToast(err.message || "Gagal menyimpan tawaran bantuan.", "error");
    }
  };

  if (postLoading || !authChecked) {
    return (
      <main className="form-page-wrapper">
        <p style={{ textAlign: "center", padding: "40px 0" }}>
          Memeriksa status postingan...
        </p>
      </main>
    );
  }

  if (postError) {
    return (
      <main className="form-page-wrapper">
        <EmptyState
          icon="⚠️"
          title="Gagal Memeriksa Postingan"
          description={postError}
          actionText="Kembali ke Katalog"
          onAction={() => router.push("/katalog")}
        />
      </main>
    );
  }

  // Pemeriksaan pengajuan ganda belum selesai untuk post ini: jangan render
  // formulir dulu agar tidak ada kedipan form sebelum blokir "sudah mengajukan".
  if (supabaseMode && verifiedUserId && !applicationChecked) {
    return (
      <main className="form-page-wrapper">
        <p style={{ textAlign: "center", padding: "40px 0" }}>
          Memeriksa pengajuan Anda...
        </p>
      </main>
    );
  }

  // Buka URL formulir langsung padahal sudah ada pengajuan pending/accepted untuk
  // post ini: jangan tampilkan formulir, arahkan ke halaman yang relevan.
  if (hasActiveApplication) {
    const isAccepted = myApplication.status === "accepted";
    return (
      <main className="form-page-wrapper">
        <EmptyState
          icon="📨"
          title="Anda Sudah Mengajukan Bantuan"
          description={
            isAccepted
              ? `Pengajuan Anda untuk postingan "${post?.title || ""}" sudah diterima. Anda tidak perlu mengajukan lagi untuk postingan ini.`
              : `Pengajuan Anda untuk postingan "${post?.title || ""}" masih menunggu tanggapan pemilik postingan. Satu pengajuan sudah cukup — Anda tidak dapat mengajukan dua kali untuk postingan yang sama.`
          }
          actionText="Lihat Detail Postingan"
          onAction={() =>
            router.push(`/detail-postingan?id=${encodeURIComponent(postId)}`)
          }
        />
        <div style={{ textAlign: "center", marginTop: "12px" }}>
          <Link href="/pengajuan" className="button button-primary">
            Buka Halaman Pengajuan Saya
          </Link>
        </div>
      </main>
    );
  }

  // Belum login (mode Supabase): halaman redirect sedang berjalan. Link tetap
  // dirender sebagai cadangan bila navigasi gagal.
  if (supabaseMode && authChecked && !verifiedUserId) {
    return (
      <main className="form-page-wrapper">
        <p style={{ textAlign: "center", padding: "40px 0" }}>
          Mengarahkan ke halaman masuk...
        </p>
        <div style={{ textAlign: "center" }}>
          <Link href={loginHref} className="button button-primary">
            Masuk Sekarang
          </Link>
        </div>
      </main>
    );
  }

  // Post dibatalkan, milik sendiri, atau status tak diketahui tidak boleh
  // membuka form pengajuan. Post selesai tetap boleh menerima pengajuan.
  if (!post || !isActive || isOwnPost) {
    const blockedReason = isOwnPost
      ? "own"
      : activityKind === "error"
        ? "error"
        : activityKind === "unknown"
          ? "unknown"
          : lifecycle;
    return (
      <main className="form-page-wrapper">
        <EmptyState
          icon={blockedReason === "own" ? "🙋" : "🔒"}
          title={
            blockedReason === "own"
              ? "Tidak Bisa Mengajukan ke Postingan Sendiri"
              : "Postingan Tidak Menerima Pengajuan"
          }
          description={
            blockedReason === "own"
              ? "Anda adalah pemilik postingan ini, jadi tidak dapat mengajukan bantuan untuknya."
              : blockedReason === "batal"
                ? "Aktivitas untuk postingan ini sudah dibatalkan, sehingga pengajuan baru ditutup."
                : blockedReason === "error"
                  ? "Status postingan tidak dapat diperiksa saat ini, sehingga pengajuan tidak dibuka untuk sementara. Coba muat ulang halaman."
                  : "Status postingan ini tidak dikenali dengan pasti, sehingga pengajuan baru tidak dibuka."
          }
          actionText="Kembali ke Katalog"
          onAction={() => router.push("/katalog")}
        />
      </main>
    );
  }

  return (
    <main className="form-page-wrapper">
      {!supabaseMode && (
        <SimulationBanner text="Mode Simulasi: pengajuan ini hanya disimpan di browser lokal. Pemilik postingan tidak menerima pengajuan atau notifikasi." />
      )}
      <div className="form-container-box">
        {/* Step Indicator */}
        <div className="step-indicator">
          <div className={`step-item${step >= 1 ? " active" : ""}`}>
            <span className="step-num">1</span>
            <span>Isi Form</span>
          </div>
          <span className="step-line" />
          <div className={`step-item${step >= 2 ? " active" : ""}`}>
            <span className="step-num">2</span>
            <span>Review</span>
          </div>
          <span className="step-line" />
          <div className={`step-item${step >= 3 ? " active" : ""}`}>
            <span className="step-num">3</span>
            <span>Konfirmasi</span>
          </div>
        </div>

        {/* Target Request Info */}
        <div className="target-request-info">
          <span className="requester-avatar-sm">{author.initial || "S"}</span>
          <div className="target-text">
            <small>{isNeedPost ? "Menawarkan bantuan kepada" : "Meminta bantuan dari"}</small>
            <strong>
              {author.name} &bull; {post ? post.title : "Butuh bantuan"}
            </strong>
          </div>
        </div>

        {/* STEP 1: FORM INPUT */}
        {step === 1 && (
          <form onSubmit={handleNextToReview} className="bantu-form" noValidate>
            <FormField
              id="helper-name"
              label="Nama Lengkap"
              required
              error={errors.helper_name}
            >
              <input
                type="text"
                id="helper-name"
                name="helper_name"
                value={formData.helper_name}
                onChange={handleChange}
                placeholder="Nama lengkapmu"
                aria-invalid={Boolean(errors.helper_name)}
              />
              {profileNameMissing && (
                <small className="field-hint">
                  Profil Anda belum memiliki nama. Lengkapi di halaman profil atau
                  isi kolom ini secara manual.
                </small>
              )}
            </FormField>

            <FormField
              id="helper-message"
              label={isNeedPost ? `Cara kamu dapat membantu ${author.name}` : `Bantuan yang kamu perlukan dari ${author.name}`}
              required
              error={errors.helper_message}
            >
              <textarea
                id="helper-message"
                name="helper_message"
                rows={3}
                value={formData.helper_message}
                onChange={handleChange}
                placeholder={
                  isNeedPost
                    ? "Jelaskan cara kamu dapat membantu dan pengalaman yang relevan."
                    : "Jelaskan bantuan yang kamu perlukan dari tawaran ini."
                }
                aria-invalid={Boolean(errors.helper_message)}
              />
            </FormField>

            <FormField
              id="helper-time"
              label={isNeedPost ? "Waktu kamu bisa membantu" : "Waktu yang kamu butuhkan"}
              required
              error={errors.helper_time}
            >
              <input
                type="text"
                id="helper-time"
                name="helper_time"
                value={formData.helper_time}
                onChange={handleChange}
                placeholder="Contoh: Sabtu, 10.00 – 13.00"
                aria-invalid={Boolean(errors.helper_time)}
              />
            </FormField>

            <FormField
              id="helper-note"
              label="Catatan tambahan (opsional)"
            >
              <input
                type="text"
                id="helper-note"
                name="helper_note"
                value={formData.helper_note}
                onChange={handleChange}
                placeholder={isNeedPost ? "Keahlian, alat, atau catatan khusus..." : "Kondisi, lokasi, atau catatan khusus..."}
              />
            </FormField>

            <div className="form-actions">
              <Link
                href={`/detail-postingan?id=${encodeURIComponent(postId)}`}
                className="btn-cancel"
              >
                Batal
              </Link>
              <button type="submit" className="btn-submit">
                Lanjut ke Review &rarr;
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: REVIEW */}
        {step === 2 && (
          <div className="review-section" style={{ padding: "16px 0" }}>
            <h2 style={{ fontSize: "18px", margin: "0 0 16px 0", fontWeight: 700 }}>
              Tinjau {proposalLabel}
            </h2>
            <div
              style={{
                background: "var(--color-bg-default)",
                padding: "20px",
                borderRadius: "12px",
                lineHeight: "1.8",
                fontSize: "14px",
              }}
            >
              <p>
                <strong>Nama Pengaju:</strong> {formData.helper_name}
              </p>
              <p className="proposal-privacy-note">
                <SvgIcon name="shield" size={15} strokeWidth={2} />
                Nomor WhatsApp tidak dikirim bersama pengajuan. Kamu tetap bisa
                chat di NeedHelp; kontak baru terbuka bila kedua pihak setuju.
              </p>
              <p>
                <strong>{isNeedPost ? "Waktu Tersedia" : "Waktu Dibutuhkan"}:</strong> {formData.helper_time}
              </p>
              <p>
                <strong>Pesan untuk {author.name}:</strong> {formData.helper_message}
              </p>
              {formData.helper_note && (
                <p>
                  <strong>Catatan Tambahan:</strong> {formData.helper_note}
                </p>
              )}
            </div>

            <div className="form-actions" style={{ marginTop: "24px" }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                &larr; Ubah Isian
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={handleFinalSubmit}
                disabled={submitting}
              >
                {submitting ? `Mengirimkan ${proposalLabel}...` : `Kirim ${proposalLabel} Sekarang`}<SvgIcon name="check" size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS CONFIRMATION */}
        {step === 3 && (
          <div className="success-box text-center" style={{ padding: "24px 0" }}>
            <div className="success-icon-wrapper">
              <SvgIcon name="check" size={28} strokeWidth={2.5} />
            </div>
            <h2 className="success-title">
              {submittedVia === "demo"
                ? `${proposalLabel} Tersimpan (Mode Simulasi)`
                : `${proposalLabel} Terkirim!`}
            </h2>
            {submittedVia === "demo" ? (
              <>
                <p className="success-desc">
                  Ini mode simulasi: tawaran bantuanmu hanya disimpan di browser
                  perangkat ini, <strong>tidak</strong> masuk ke database NeedHelp.
                  Pemilik postingan tidak menerima pengajuan maupun notifikasi.
                </p>
                <div className="success-actions">
                  <Link href="/katalog" className="btn-secondary-custom">
                    Kembali ke Katalog
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="success-desc">
                  {author.name} akan menerima {proposalLabel.toLowerCase()}mu dan notifikasi
                  pengajuan baru. Chat NeedHelp sudah dapat dipakai untuk bertanya
                  dan menyepakati detail. WhatsApp bersifat opsional dan baru
                  terbuka jika kalian berdua menyetujuinya di ruang chat.
                </p>
                <ol className="proposal-next-steps">
                  <li><strong>Pengajuan terkirim</strong><span>Status awal: menunggu keputusan.</span></li>
                  <li><strong>Mulai chat di NeedHelp</strong><span>Kamu tetap dapat mengirim pesan selama menunggu.</span></li>
                  <li><strong>Pengajuan diterima</strong><span>Aktivitas muncul untuk kedua pihak.</span></li>
                  <li><strong>Selesai &amp; beri ulasan</strong><span>Kedua pihak dapat saling menilai setelah aktivitas selesai.</span></li>
                </ol>
                <div className="success-actions">
                  <Link
                    href={`/chat?user=${encodeURIComponent(post?.authorId || "")}&post=${encodeURIComponent(postId)}`}
                    className="btn-primary-custom"
                  >
                    Chat di NeedHelp dengan {author.name}
                  </Link>
                  <Link href="/pengajuan" className="btn-secondary-custom">
                    Lihat Status Pengajuan
                  </Link>
                  <Link href="/katalog" className="btn-secondary-custom">
                    Kembali ke Katalog
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function FormBantuanPage() {
  return (
    <Suspense fallback={<div className="form-page-wrapper"><p>Memuat formulir bantuan...</p></div>}>
      <FormBantuanContent />
    </Suspense>
  );
}
