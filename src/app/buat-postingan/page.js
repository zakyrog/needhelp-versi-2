"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPost } from "../../lib/data.js";
import { readSession, getSupabaseUser } from "../../lib/auth.js";
import { isSupabaseConfigured } from "../../lib/supabase.js";
import { validatePost, sanitizeString } from "../../lib/validation.js";
import { useToast } from "../../components/Toast";
import { SvgIcon } from "../../components/Icons.jsx";

export default function BuatPostinganPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [session, setSession] = useState(null);

  const [formData, setFormData] = useState({
    nature: "butuh",
    title: "",
    category: "",
    description: "",
    date: "",
    time: "",
    region: "",
    address: "",
    destination: "",
    compensation: "tarif",
    amount: "50000",
    offerExperience: "cukup",
    offerIncludes: "",
    offerMode: "datang",
    offerSchedule: "",
    terms: false,
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const currentSession = readSession();
    if (!currentSession) {
      showToast(
        "Silakan masuk terlebih dahulu untuk membuat postingan.",
        "info",
      );
      router.replace("/login?next=/buat-postingan");
      return;
    }
    setSession(currentSession);

    // Verifikasi async: jika Supabase aktif, pastikan token masih valid
    if (isSupabaseConfigured()) {
      getSupabaseUser().then((user) => {
        if (!user) {
          showToast("Sesi Anda telah berakhir. Silakan masuk kembali.", "error");
          router.replace("/login?next=/buat-postingan");
        }
      });
    }
  }, [router, showToast]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === "checkbox" ? checked : value,
      };

      // Penawaran jasa memakai pilihan imbalan yang relevan. Hindari membawa
      // pilihan "patungan" atau "traktir" dari formulir kebutuhan.
      if (
        name === "nature" &&
        value === "bisa" &&
        ["patungan", "traktir"].includes(prev.compensation)
      ) {
        next.compensation = "tarif";
      }

      return next;
    });
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Pencegahan kirim ganda (double-submit prevention)
    if (submitting) return;

    // Bersihkan nilai isian dengan .trim() sebelum validasi
    const isOfferSubmission = formData.nature === "bisa";
    const offerDescription = isOfferSubmission
      ? [
          sanitizeString(formData.description),
          `Pengalaman: ${formData.offerExperience === "mahir" ? "Berpengalaman" : formData.offerExperience === "pemula" ? "Baru mulai" : "Cukup berpengalaman"}`,
          `Yang termasuk: ${sanitizeString(formData.offerIncludes)}`,
          `Cara bantuan: ${formData.offerMode === "online" ? "Online" : formData.offerMode === "fleksibel" ? "Online atau datang langsung" : "Datang langsung"}`,
          `Ketersediaan rutin: ${sanitizeString(formData.offerSchedule)}`,
        ].join("\n\n")
      : formData.description.trim();
    const sanitizedData = {
      ...formData,
      title: sanitizeString(formData.title),
      description: offerDescription,
      address: sanitizeString(formData.address),
      destination: sanitizeString(formData.destination),
      amount: String(formData.amount).trim(),
    };

    const validationErrors = validatePost(sanitizedData);
    if (isOfferSubmission && sanitizeString(formData.offerIncludes).length < 10) {
      validationErrors.offerIncludes = "Jelaskan apa saja yang termasuk dalam bantuanmu (minimal 10 karakter).";
    }
    if (isOfferSubmission && sanitizeString(formData.offerSchedule).length < 5) {
      validationErrors.offerSchedule = "Tuliskan hari atau rentang waktu kamu biasanya tersedia.";
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast(
        "Terdapat kesalahan isian formulir. Mohon periksa kembali kolom yang ditandai merah.",
        "error",
      );

      // Fokuskan peramban ke field pertama yang bermasalah
      const firstErrorField = Object.keys(validationErrors)[0];
      const targetElement = document.querySelector(`[name="${firstErrorField}"]`);
      if (targetElement) {
        targetElement.focus();
      }
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      // Simulasi delay pengiriman network/penyimpanan terstruktur (500ms)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const newPost = await createPost(sanitizedData, session);
      if (!newPost || !newPost.id) {
        throw new Error("Gagal menyimpan postingan. Silakan coba lagi.");
      }

      showToast("Postingan berhasil diterbitkan!", "success");
      router.push(`/sukses-postingan?id=${encodeURIComponent(newPost.id)}`);
    } catch (err) {
      // Saat gagal simpan: buka kunci submit dan tampilkan pesan error yang jelas (QA-06)
      setSubmitting(false);
      const errorMessage =
        err.message || "Gagal menyimpan postingan ke penyimpanan browser.";
      setErrors({
        general: errorMessage,
      });
      showToast(errorMessage, "error");
    }
  };

  const categoryLabel = {
    ditemani: "Ditemani",
    bantuan: "Bantuan fisik",
    pendampingan: "Pendampingan",
    explore: "Explore",
  }[formData.category];
  const regionLabel = {
    sleman: "Sleman",
    kota: "Kota Yogyakarta",
    bantul: "Bantul",
    kulonprogo: "Kulon Progo",
    gunungkidul: "Gunungkidul",
  }[formData.region];
  const compensationLabel = {
    tarif: `Tarif Rp${Number(formData.amount || 0).toLocaleString("id-ID")}`,
    nego: "Nego di chat",
    patungan: "Patungan",
    traktir: "Traktir",
    sukarela: "Sukarela",
  }[formData.compensation];
  const isOffer = formData.nature === "bisa";
  const compensationOptions = isOffer
    ? [
        ["tarif", "comp-fixed", "Tarif layanan", "Nominal jasa yang kamu tawarkan"],
        ["nego", "comp-nego", "Bisa dinegosiasikan", "Sesuaikan dengan lingkup bantuan"],
        ["sukarela", "comp-free", "Sukarela", "Tanpa kewajiban imbalan"],
      ]
    : [
        ["tarif", "comp-fixed", "Tarif pasti", "Nominal jelas sejak awal"],
        ["nego", "comp-nego", "Nego di chat", "Sepakati setelah berdiskusi"],
        ["patungan", "comp-split", "Patungan", "Transport, tiket, atau biaya kegiatan"],
        ["traktir", "comp-treat", "Traktir", "Makan, minum, atau bentuk sederhana"],
        ["sukarela", "comp-free", "Sukarela", "Tanpa kewajiban imbalan"],
      ];

  return (
    <main className="post-create-main">
      <section className="post-create-hero" aria-labelledby="post-create-title">
        <div>
          <span className="post-create-eyebrow">Buat postingan baru</span>
          <h1 id="post-create-title">
            {isOffer ? "Tawarkan bantuanmu dengan meyakinkan" : "Ceritakan kebutuhanmu dengan jelas"}
          </h1>
          <p>
            {isOffer
              ? "Jelaskan keahlian, cakupan bantuan, ketersediaan, dan tarif agar orang lain mudah menilai kecocokannya."
              : "Jelaskan aktivitas, waktu, lokasi umum, dan bentuk apresiasi agar kamu menemukan partner yang tepat."}
          </p>
        </div>
        <div className="post-create-promises" aria-label="Keunggulan postingan NeedHelp">
          <span><SvgIcon name="check" size={16} /> Detail terstruktur</span>
          <span><SvgIcon name="check" size={16} /> Apresiasi transparan</span>
          <span><SvgIcon name="check" size={16} /> Kontak tidak dipublikasikan</span>
        </div>
      </section>

      <div className="post-create-layout">
        <form className="post-create-form" onSubmit={handleSubmit} noValidate>
          {errors.general && (
            <div className="post-create-error" role="alert">
              <SvgIcon name="warning" size={18} strokeWidth={2} /> {errors.general}
            </div>
          )}

          <section className="post-form-section" aria-labelledby="post-step-one">
            <div className="post-form-section-head">
              <span className="post-step-number">01</span>
              <div>
                <h2 id="post-step-one">Apa yang ingin kamu lakukan?</h2>
                <p>Pilih sisi postingan yang paling sesuai saat ini.</p>
              </div>
            </div>
            <div className="post-choice-grid">
              <label className={`post-choice-card ${formData.nature === "butuh" ? "is-selected" : ""}`} htmlFor="post-need">
                <input type="radio" id="post-need" name="nature" value="butuh" checked={formData.nature === "butuh"} onChange={handleChange} disabled={submitting} />
                <span className="post-choice-mark" aria-hidden="true" />
                <span><strong>Saya butuh partner</strong><small>Untuk bantuan praktis, pendampingan, atau teman aktivitas.</small></span>
              </label>
              <label className={`post-choice-card ${formData.nature === "bisa" ? "is-selected" : ""}`} htmlFor="post-can">
                <input type="radio" id="post-can" name="nature" value="bisa" checked={formData.nature === "bisa"} onChange={handleChange} disabled={submitting} />
                <span className="post-choice-mark" aria-hidden="true" />
                <span><strong>Saya menawarkan bantuan</strong><small>Bagikan waktu, tenaga, atau keahlian kepada warga sekitar.</small></span>
              </label>
            </div>
            {errors.nature && <small className="field-error" role="alert">{errors.nature}</small>}
          </section>

          <section className="post-form-section" aria-labelledby="post-step-two">
            <div className="post-form-section-head">
              <span className="post-step-number">02</span>
              <div>
                <h2 id="post-step-two">{isOffer ? "Bantuan yang kamu tawarkan" : "Detail kebutuhan"}</h2>
                <p>{isOffer ? "Tunjukkan kemampuan dan batas layananmu dengan jelas." : "Buat orang lain langsung memahami kebutuhanmu."}</p>
              </div>
            </div>
            <div className="post-field-grid post-field-grid-split">
              <div className="post-field post-field-wide">
                <label htmlFor="post-title">{isOffer ? "Nama bantuan atau layanan" : "Judul kebutuhan"} <span>Wajib</span></label>
                <input type="text" id="post-title" name="title" value={formData.title} onChange={handleChange} disabled={submitting} placeholder={isOffer ? "Contoh: Siap bantu pindahan kos area Sleman" : "Contoh: Butuh bantuan pindahan kos di Pogung"} maxLength={100} aria-invalid={Boolean(errors.title)} />
                <div className="post-field-meta"><small>Ringkas, spesifik, dan mudah dipindai.</small><small>{formData.title.length}/100</small></div>
                {errors.title && <small className="field-error" role="alert">{errors.title}</small>}
              </div>
              <div className="post-field">
                <label htmlFor="post-category">Kategori <span>Wajib</span></label>
                <select id="post-category" name="category" value={formData.category} onChange={handleChange} disabled={submitting} aria-invalid={Boolean(errors.category)}>
                  <option value="">Pilih kategori</option>
                  <option value="ditemani">Ditemani — gym, ngopi, nonton</option>
                  <option value="bantuan">Bantuan fisik — pindahan, angkat barang</option>
                  <option value="pendampingan">Pendampingan — diskusi, memilih barang</option>
                  <option value="explore">Explore — wisata, kuliner, hidden gem</option>
                </select>
                {errors.category && <small className="field-error" role="alert">{errors.category}</small>}
              </div>
              {isOffer && (
                <div className="post-field">
                  <label htmlFor="offer-experience">Tingkat pengalaman <span>Wajib</span></label>
                  <select id="offer-experience" name="offerExperience" value={formData.offerExperience} onChange={handleChange} disabled={submitting}>
                    <option value="pemula">Baru mulai — siap membantu tugas sederhana</option>
                    <option value="cukup">Cukup berpengalaman — pernah mengerjakan</option>
                    <option value="mahir">Berpengalaman — terbiasa menangani sendiri</option>
                  </select>
                </div>
              )}
              <div className="post-field post-field-full">
                <label htmlFor="post-description">{isOffer ? "Jelaskan bantuanmu" : "Ceritakan kebutuhannya"} <span>Wajib</span></label>
                <textarea id="post-description" name="description" rows={6} value={formData.description} onChange={handleChange} disabled={submitting} maxLength={isOffer ? 500 : 1000} placeholder={isOffer ? "Jelaskan jenis bantuan yang kamu kuasai, contoh pengalaman, serta hasil yang bisa diharapkan..." : "Jelaskan aktivitas, perkiraan durasi, hal yang perlu dibawa, dan ekspektasi hasilnya..."} aria-invalid={Boolean(errors.description)} />
                <div className="post-field-meta"><small>Jangan cantumkan nomor telepon atau data pribadi.</small><small>{formData.description.length}/{isOffer ? 500 : 1000}</small></div>
                {errors.description && <small className="field-error" role="alert">{errors.description}</small>}
              </div>
              {isOffer && (
                <div className="post-field post-field-full">
                  <label htmlFor="offer-includes">Apa saja yang termasuk? <span>Wajib</span></label>
                  <textarea id="offer-includes" name="offerIncludes" rows={4} value={formData.offerIncludes} onChange={handleChange} disabled={submitting} maxLength={500} placeholder="Contoh: Membantu angkat dan menata barang, membawa tali pengikat; tidak termasuk kendaraan angkut..." aria-invalid={Boolean(errors.offerIncludes)} />
                  <div className="post-field-meta"><small>Tuliskan batas bantuan agar ekspektasi kedua pihak sama.</small><small>{formData.offerIncludes.length}/500</small></div>
                  {errors.offerIncludes && <small className="field-error" role="alert">{errors.offerIncludes}</small>}
                </div>
              )}
            </div>
          </section>

          <section className="post-form-section" aria-labelledby="post-step-three">
            <div className="post-form-section-head">
              <span className="post-step-number">03</span>
              <div>
                <h2 id="post-step-three">{isOffer ? "Ketersediaan dan area layanan" : "Waktu dan lokasi"}</h2>
                <p>{isOffer ? "Tentukan jadwal awal dan wilayah yang dapat kamu jangkau." : "Berikan gambaran awal; detail sensitif dapat dibahas di chat."}</p>
              </div>
            </div>
            <div className="post-field-grid post-field-grid-three">
              {isOffer && (
                <div className="post-field">
                  <label htmlFor="offer-mode">Cara membantu <span>Wajib</span></label>
                  <select id="offer-mode" name="offerMode" value={formData.offerMode} onChange={handleChange} disabled={submitting}>
                    <option value="datang">Datang langsung</option>
                    <option value="online">Online</option>
                    <option value="fleksibel">Online atau datang langsung</option>
                  </select>
                </div>
              )}
              {isOffer && (
                <div className="post-field">
                  <label htmlFor="offer-schedule">Jadwal biasanya tersedia <span>Wajib</span></label>
                  <input type="text" id="offer-schedule" name="offerSchedule" value={formData.offerSchedule} onChange={handleChange} disabled={submitting} placeholder="Contoh: Senin–Sabtu setelah 17.00" aria-invalid={Boolean(errors.offerSchedule)} />
                  {errors.offerSchedule && <small className="field-error" role="alert">{errors.offerSchedule}</small>}
                </div>
              )}
              <div className="post-field">
                <label htmlFor="post-date">{isOffer ? "Mulai tersedia" : "Tanggal"} <span>Wajib</span></label>
                <input type="date" id="post-date" name="date" value={formData.date} onChange={handleChange} disabled={submitting} aria-invalid={Boolean(errors.date)} />
                {errors.date && <small className="field-error" role="alert">{errors.date}</small>}
              </div>
              <div className="post-field">
                <label htmlFor="post-time">{isOffer ? "Jam layanan" : "Jam mulai"} <span>Wajib</span></label>
                <input type="time" id="post-time" name="time" value={formData.time} onChange={handleChange} disabled={submitting} aria-invalid={Boolean(errors.time)} />
                {errors.time && <small className="field-error" role="alert">{errors.time}</small>}
              </div>
              <div className="post-field">
                <label htmlFor="post-region">{isOffer ? "Wilayah layanan" : "Wilayah"} <span>Wajib</span></label>
                <select id="post-region" name="region" value={formData.region} onChange={handleChange} disabled={submitting} aria-invalid={Boolean(errors.region)}>
                  <option value="">Pilih wilayah</option>
                  <option value="sleman">Kabupaten Sleman</option>
                  <option value="kota">Kota Yogyakarta</option>
                  <option value="bantul">Kabupaten Bantul</option>
                  <option value="kulonprogo">Kabupaten Kulon Progo</option>
                  <option value="gunungkidul">Kabupaten Gunungkidul</option>
                </select>
                {errors.region && <small className="field-error" role="alert">{errors.region}</small>}
              </div>
            </div>
            <div className="post-field-grid post-field-grid-split post-location-grid">
              <div className="post-field">
                <label htmlFor="post-address">{isOffer ? "Basis area layanan" : "Area atau titik temu"} <span>Wajib</span></label>
                <input type="text" id="post-address" name="address" value={formData.address} onChange={handleChange} disabled={submitting} placeholder="Contoh: Pogung Baru, Mlati" aria-invalid={Boolean(errors.address)} />
                <small>Gunakan area umum; alamat lengkap bisa dibagikan setelah cocok.</small>
                {errors.address && <small className="field-error" role="alert">{errors.address}</small>}
              </div>
              <div className="post-field">
                <label htmlFor="post-destination">{isOffer ? "Jangkauan tambahan" : "Tujuan"} <em>Opsional</em></label>
                <input type="text" id="post-destination" name="destination" value={formData.destination} onChange={handleChange} disabled={submitting} placeholder={isOffer ? "Contoh: Bisa datang ke Kota Yogyakarta" : "Jika aktivitas berpindah lokasi"} />
                {errors.destination && <small className="field-error" role="alert">{errors.destination}</small>}
              </div>
            </div>
          </section>

          <section className="post-form-section" aria-labelledby="post-step-four">
            <div className="post-form-section-head">
              <span className="post-step-number">04</span>
              <div>
                <h2 id="post-step-four">{isOffer ? "Tarif atau imbalan" : "Bentuk apresiasi"}</h2>
                <p>{isOffer ? "Sampaikan biaya secara transparan atau tandai bila dapat dinegosiasikan." : "Tidak harus selalu uang—pilih kesepakatan yang paling masuk akal."}</p>
              </div>
            </div>
            <div className="post-comp-grid">
              {compensationOptions.map(([value, id, title, copy]) => (
                <label className={`post-comp-card ${formData.compensation === value ? "is-selected" : ""}`} htmlFor={id} key={value}>
                  <input type="radio" id={id} name="compensation" value={value} checked={formData.compensation === value} onChange={handleChange} disabled={submitting} />
                  <strong>{title}</strong><small>{copy}</small>
                </label>
              ))}
            </div>
            {formData.compensation === "tarif" && (
              <div className="post-field post-amount-field">
                <label htmlFor="comp-amount">{isOffer ? "Tarif yang ditawarkan" : "Nominal tarif"}</label>
                <div className="post-currency-input"><span>Rp</span><input type="number" id="comp-amount" name="amount" value={formData.amount} onChange={handleChange} disabled={submitting} min="1000" step="5000" placeholder="50000" aria-invalid={Boolean(errors.amount)} /></div>
                {errors.amount && <small className="field-error" role="alert">{errors.amount}</small>}
              </div>
            )}
            {errors.compensation && <small className="field-error" role="alert">{errors.compensation}</small>}
          </section>

          <section className="post-form-section post-publish-section" aria-labelledby="post-step-five">
            <div className="post-form-section-head">
              <span className="post-step-number">05</span>
              <div><h2 id="post-step-five">Periksa lalu terbitkan</h2><p>Pastikan detail dan apresiasi sudah sesuai.</p></div>
            </div>
            <label className="post-terms" htmlFor="terms-agree">
              <input type="checkbox" id="terms-agree" name="terms" checked={formData.terms} onChange={handleChange} disabled={submitting} aria-invalid={Boolean(errors.terms)} />
              <span>Saya menyetujui pedoman keamanan dan kesopanan komunitas NeedHelp.</span>
            </label>
            {errors.terms && <small className="field-error" role="alert">{errors.terms}</small>}
            <div className="post-form-actions">
              <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Menerbitkan..." : "Terbitkan postingan"}<SvgIcon name="arrowRight" size={16} /></button>
              <Link href="/katalog" className="button button-outline">Simpan nanti</Link>
            </div>
          </section>
        </form>

        <aside className="post-create-aside" aria-label="Preview dan panduan postingan">
          <div className="post-preview-card">
            <div className="post-preview-label"><span>Preview postingan</span><i>{formData.nature === "butuh" ? "Butuh partner" : "Siap membantu"}</i></div>
            <h2>{formData.title || (isOffer ? "Nama bantuanmu akan tampil di sini" : "Judul kebutuhanmu akan tampil di sini")}</h2>
            <p>{formData.description || (isOffer ? "Jelaskan kemampuan dan cakupan layanan agar orang lain yakin menghubungimu." : "Tulis detail yang cukup agar orang lain yakin untuk menawarkan bantuan.")}</p>
            <div className="post-preview-tags">
              <span>{categoryLabel || "Kategori"}</span><span>{regionLabel || "Wilayah"}</span><span>{compensationLabel || "Apresiasi"}</span>
            </div>
          </div>
          <div className="post-guide-card">
            <span className="post-guide-icon"><SvgIcon name="shield" size={20} /></span>
            <h3>Bagikan seperlunya</h3>
            <ul><li>Jangan tulis nomor WhatsApp di postingan.</li><li>Mulai percakapan melalui chat NeedHelp.</li><li>Bagikan lokasi lengkap setelah merasa cocok.</li></ul>
          </div>
          <div className="post-quality-card">
            <strong>Postingan yang bagus biasanya memuat:</strong>
            <span>Tujuan jelas</span><span>Waktu realistis</span><span>Apresiasi transparan</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
