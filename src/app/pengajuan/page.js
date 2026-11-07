"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  fetchMyHelpApplications,
  acceptHelpApplication,
  rejectHelpApplication,
  fetchPosts,
} from "../../lib/data";
import { readSession } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase";
import { useToast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { SvgIcon } from "../../components/Icons.jsx";

function PengajuanContent() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  // Notifikasi pengajuan/status pengajuan menautkan ?application=<id>.
  // Catatan: pengajuan yang PELAMAR lihat ada di daftar "milik saya", sehingga
  // ID yang tidak ada di daftar yang dikelola tetap ditandai sebagai sorotan.
  const highlightedApplicationId = searchParams.get("application");

  const supabaseMode = isSupabaseConfigured();
  const [session, setSession] = useState(null);
  const [applications, setApplications] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState("all");

  // Load session dan applications
  useEffect(() => {
    const currentSession = readSession();
    setSession(currentSession);

    if (!currentSession || !supabaseMode) {
      setLoading(false);
      return;
    }

    let isCancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch posts terlebih dahulu untuk mendapatkan judul postingan
        await fetchPosts();

        // Fetch applications: incoming (boleh dikelola) dan milik sendiri (hanya lihat)
        const result = await fetchMyHelpApplications();
        if (!isCancelled) {
          setApplications(result.applications);
          setMyApplications(result.myApplications);
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err.message || "Gagal memuat daftar pengajuan.");
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [supabaseMode]);

  const handleAccept = async (applicationId) => {
    if (!window.confirm("Apakah Anda yakin ingin menerima pengajuan ini? Aktivitas akan dimulai secara otomatis.")) {
      return;
    }

    setProcessingId(applicationId);
    try {
      await acceptHelpApplication(applicationId);
      showToast("Pengajuan berhasil diterima! Aktivitas telah dimulai.", "success");

      // Refresh data
      const refreshed = await fetchMyHelpApplications();
      setApplications(refreshed.applications);
      setMyApplications(refreshed.myApplications);
    } catch (err) {
      showToast(err.message || "Gagal menerima pengajuan.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (applicationId) => {
    if (!window.confirm("Apakah Anda yakin ingin menolak pengajuan ini?")) {
      return;
    }

    setProcessingId(applicationId);
    try {
      await rejectHelpApplication(applicationId);
      showToast("Pengajuan berhasil ditolak.", "info");

      // Refresh data
      const refreshed = await fetchMyHelpApplications();
      setApplications(refreshed.applications);
      setMyApplications(refreshed.myApplications);
    } catch (err) {
      showToast(err.message || "Gagal menolak pengajuan.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return <span className="activity-status-tag tag-waiting"><SvgIcon name="hourglass" size={13} strokeWidth={2} /> Menunggu</span>;
      case "accepted":
        return <span className="activity-status-tag tag-confirmed"><SvgIcon name="check" size={13} strokeWidth={3} /> Diterima</span>;
      case "rejected":
        return <span className="activity-status-tag tag-cancelled"><SvgIcon name="cross" size={13} strokeWidth={2.5} /> Ditolak</span>;
      case "withdrawn":
        return <span className="activity-status-tag" style={{ opacity: 0.6 }}><SvgIcon name="reply" size={13} strokeWidth={2} /> Ditarik</span>;
      default:
        return <span className="activity-status-tag">{status}</span>;
    }
  };

  const filteredApplications = filter === "all"
    ? applications
    : applications.filter((app) => app.status === filter);
  const postsWithOfficialPartner = new Set(
    applications
      .filter((app) => app.status === "accepted")
      .map((app) => String(app.postId)),
  );

  // Loading state
  if (loading) {
    return (
      <main>
        <header className="page-header-section">
          <h1>Pengajuan Bantuan</h1>
          <p>Kelola pengajuan bantuan yang masuk untuk postingan Anda.</p>
        </header>
        <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
          <p>Memuat daftar pengajuan...</p>
        </div>
      </main>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <main>
        <header className="page-header-section">
          <h1>Pengajuan Bantuan</h1>
          <p>Kelola pengajuan bantuan yang masuk untuk postingan Anda.</p>
        </header>
        <div style={{ maxWidth: "600px", margin: "40px auto" }}>
          <EmptyState
            icon="🔒"
            title="Masuk untuk Melihat Pengajuan"
            description="Silakan masuk terlebih dahulu untuk melihat dan mengelola pengajuan bantuan."
            actionText="Masuk Sekarang"
            onAction={() => router.push("/login?next=/pengajuan")}
          />
        </div>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main>
        <header className="page-header-section">
          <h1>Pengajuan Bantuan</h1>
          <p>Kelola pengajuan bantuan yang masuk untuk postingan Anda.</p>
        </header>
        <div style={{ maxWidth: "600px", margin: "40px auto" }}>
          <EmptyState
            icon="⚠️"
            title="Gagal Memuat Pengajuan"
            description={error}
            actionText="Coba Lagi"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header-section">
        <h1>Pengajuan Bantuan</h1>
        <p>Pantau keputusan, lanjutkan percakapan, dan masuk ke aktivitas yang sudah disepakati.</p>
      </header>

      <section className="application-flow" aria-label="Alur bantuan NeedHelp">
        <div className="application-flow-step is-current"><span>1</span><strong>Ajukan</strong><small>Kirim konteks dan jadwal.</small></div>
        <div className="application-flow-step"><span>2</span><strong>Chat</strong><small>Diskusi tetap di NeedHelp.</small></div>
        <div className="application-flow-step"><span>3</span><strong>Sepakat</strong><small>Pemilik menerima pengajuan.</small></div>
        <div className="application-flow-step"><span>4</span><strong>Selesai &amp; ulasan</strong><small>Kedua pihak saling menilai.</small></div>
      </section>

      {/* Filter chips */}
      <div className="activity-filter-chips">
        {[
          { key: "all", label: "Semua" },
          { key: "pending", label: "Menunggu" },
          { key: "accepted", label: "Diterima" },
          { key: "rejected", label: "Ditolak" },
          { key: "withdrawn", label: "Ditarik" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`filter-chip${filter === tab.key ? " active" : ""}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Applications list */}
      <section className="activity-list-container">
        {highlightedApplicationId && (
          <p
            style={{
              maxWidth: "720px",
              margin: "0 auto 12px",
              padding: "10px 14px",
              borderRadius: "8px",
              background: "var(--color-bg-subtle, #e3fdfd)",
              color: "var(--color-text-primary, #0f2e33)",
              fontSize: "14px",
            }}
          >
            Menampilkan pengajuan yang dibuka dari notifikasi.
          </p>
        )}
        {filteredApplications.length > 0 ? (
          filteredApplications.map((app) => {
            const officialPartnerAlreadyChosen =
              app.status === "pending" && postsWithOfficialPartner.has(String(app.postId));

            return (
            <article
              key={app.id}
              id={`application-${app.id}`}
              style={
                app.id === highlightedApplicationId
                  ? { outline: "2px solid var(--color-action-primary, #4a9ba0)", outlineOffset: "2px" }
                  : undefined
              }
            >
              <header>
                <div className="article-avatar avatar-tosca">
                  {app.applicantName.charAt(0).toUpperCase()}
                </div>
                <div className="article-info">
                  <div className="article-title-row">
                    <h3>{app.applicantName}</h3>
                    {getStatusBadge(app.status)}
                  </div>
                  <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                    Mengajukan bantuan untuk postingan #{app.postId}
                  </p>
                </div>
              </header>

              <div style={{ marginTop: "12px", padding: "12px", background: "var(--color-bg-secondary, #f5f5f5)", borderRadius: "8px" }}>
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Pesan:</strong> {app.message || "(Tidak ada pesan)"}
                </p>
                <p style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
                  <strong>Waktu Tersedia:</strong> {app.availableTime || "-"}
                </p>
                {app.extraNote && (
                  <p style={{ margin: "0", fontSize: "14px" }}>
                    <strong>Catatan:</strong> {app.extraNote}
                  </p>
                )}
              </div>

              {/* Action buttons - hanya untuk status pending */}
              {app.status === "pending" && (
                <div className="application-card-actions">
                  <Link
                    href={`/chat?user=${encodeURIComponent(app.applicantId)}&post=${encodeURIComponent(app.postId)}`}
                    className="btn-detail-outline"
                  >
                    <SvgIcon name="chat" size={14} strokeWidth={2} /> Chat Dulu
                  </Link>
                  {!officialPartnerAlreadyChosen && (
                    <button
                      type="button"
                      className="btn-detail-outline"
                      onClick={() => handleAccept(app.id)}
                      disabled={processingId === app.id}
                      style={{
                        color: "var(--color-action-primary)",
                        borderColor: "var(--color-action-primary)",
                      }}
                    >
                      {processingId === app.id ? "Memproses..." : (<><SvgIcon name="check" size={14} strokeWidth={3} /> Terima</>)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-detail-outline"
                    onClick={() => handleReject(app.id)}
                    disabled={processingId === app.id}
                    style={{
                      color: "var(--color-error)",
                      borderColor: "var(--color-error)",
                    }}
                  >
                    {processingId === app.id ? "Memproses..." : (<><SvgIcon name="cross" size={14} strokeWidth={2.5} /> Tolak</>)}
                  </button>
                </div>
              )}

              {officialPartnerAlreadyChosen && (
                <p className="parallel-chat-note">
                  Partner resmi untuk postingan ini sudah dipilih. Pengajuan ini
                  tetap terbuka untuk percakapan dan tidak ditolak otomatis.
                </p>
              )}

              {/* Info untuk status lain */}
              {app.status === "accepted" && (
                <div className="application-accepted-actions">
                  <p><SvgIcon name="check" size={14} strokeWidth={3} /> Pengajuan diterima. Aktivitas sedang berlangsung.</p>
                  <Link href={`/chat?user=${encodeURIComponent(app.applicantId)}&post=${encodeURIComponent(app.postId)}`} className="btn-detail-outline">
                    <SvgIcon name="chat" size={14} strokeWidth={2} /> Buka Chat
                  </Link>
                  <Link href="/aktivitas" className="btn-detail-outline">Lihat Aktivitas</Link>
                </div>
              )}
              {app.status === "rejected" && (
                <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <SvgIcon name="cross" size={14} strokeWidth={2.5} /> Pengajuan ini telah ditolak.
                </p>
              )}
              {app.status === "withdrawn" && (
                <p style={{ marginTop: "12px", fontSize: "14px", color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <SvgIcon name="reply" size={14} strokeWidth={2} /> Pelamar telah menarik pengajuan ini.
                </p>
              )}
            </article>
            );
          })
        ) : (
          <EmptyState
            icon="📋"
            title="Belum Ada Pengajuan"
            description={
              filter === "all"
                ? "Belum ada pengajuan bantuan yang masuk untuk postingan Anda."
                : `Tidak ada pengajuan dengan status "${filter}".`
            }
            actionText="Lihat Postingan Saya"
            onAction={() => router.push("/aktivitas")}
          />
        )}
      </section>

      {/* Pengajuan yang SAYA kirim ke postingan orang lain: hanya lihat, tanpa
          tombol Terima/Tolak (itu hak pemilik postingan, dan RPC 004 menolak
          pemohon). */}
      {myApplications.length > 0 && (
        <section style={{ marginTop: "32px" }}>
          <h2 style={{ fontSize: "18px", margin: "0 0 8px 0" }}>
            Pengajuan yang Saya Kirim
          </h2>
          <p style={{ fontSize: "14px", color: "var(--color-text-muted)", marginTop: 0 }}>
            Status pengajuan Anda untuk postingan orang lain. Hanya pemilik
            postingan yang dapat menerima atau menolak.
          </p>
          <div className="activity-list-container">
            {myApplications.map((app) => (
              <article
                key={app.id}
                id={`application-${app.id}`}
                style={
                  app.id === highlightedApplicationId
                    ? { outline: "2px solid var(--color-action-primary, #4a9ba0)", outlineOffset: "2px" }
                    : undefined
                }
              >
                <header>
                  <div className="article-avatar avatar-blue">
                    {getStatusBadge(app.status)}
                  </div>
                  <div className="article-info">
                    <div className="article-title-row">
                      <h3>{app.postTitle || `Postingan #${app.postId}`}</h3>
                    </div>
                    <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                      Dikirim {app.createdAt ? new Date(app.createdAt).toLocaleDateString("id-ID") : "-"}
                    </p>
                  </div>
                </header>
                <div
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    background: "var(--color-bg-secondary, #f5f5f5)",
                    borderRadius: "8px",
                  }}
                >
                  <p style={{ margin: "0 0 8px 0" }}>
                    <strong>Pesan:</strong> {app.message || "(Tidak ada pesan)"}
                  </p>
                  <p style={{ margin: 0, fontSize: "14px" }}>
                    <strong>Status:</strong>{" "}
                    {app.status === "pending"
                      ? "Menunggu keputusan — chat NeedHelp sudah bisa digunakan."
                      : app.status === "accepted"
                        ? "Diterima — aktivitas sedang berjalan."
                        : app.status === "rejected"
                          ? "Pengajuan ditolak."
                          : "Pengajuan ditarik."}
                  </p>
                </div>
                {["pending", "accepted"].includes(app.status) && app.postAuthorId && (
                  <div className="application-card-actions">
                    <Link
                      href={`/chat?user=${encodeURIComponent(app.postAuthorId)}&post=${encodeURIComponent(app.postId)}`}
                      className="btn-detail-outline"
                    >
                      <SvgIcon name="chat" size={14} strokeWidth={2} /> Chat di NeedHelp
                    </Link>
                    {app.status === "accepted" && (
                      <Link href="/aktivitas" className="btn-detail-outline">Buka Aktivitas</Link>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default function PengajuanPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}><p>Memuat daftar pengajuan...</p></div>}>
      <PengajuanContent />
    </Suspense>
  );
}
