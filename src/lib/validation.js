import {
  CATEGORY_LABELS,
  REGION_LABELS,
  COMPENSATION_LABELS,
  CURRENT_USER,
} from "./data.js";
import { isSupabaseConfigured } from "./supabase.js";
import { isValidAvatarKey } from "./avatars.js";

/**
 * Sanitasi string sederhana untuk mencegah injeksi tag/skrip (XSS)
 */
export function sanitizeString(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/[<>]/g, ""); // Hapus tanda < dan > berbahaya
}

/**
 * Validasi form /buat-postingan
 * Memastikan trim, kelengkapan, rentang karakter, tanggal masa depan, dan syarat terpenuhi.
 */
export function validatePost(values) {
  const errors = {};
  const localToday = new Date().toLocaleDateString("en-CA"); // Format YYYY-MM-DD zona waktu lokal

  const nature = (values?.nature || "").trim();
  const title = (values?.title || "").trim();
  const category = (values?.category || "").trim();
  const description = (values?.description || "").trim();
  const date = (values?.date || "").trim();
  const time = (values?.time || "").trim();
  const region = (values?.region || "").trim();
  const address = (values?.address || "").trim();
  const destination = (values?.destination || "").trim();
  const compensation = (values?.compensation || "").trim();

  // 1. Jenis Postingan (butuh / bisa)
  if (!["butuh", "bisa"].includes(nature)) {
    errors.nature = "Pilih jenis postingan (Saya Butuh atau Saya Bisa).";
  }

  // 2. Judul
  if (!title) {
    errors.title = "Judul singkat postingan wajib diisi.";
  } else if (title.length < 5) {
    errors.title = "Judul minimal 5 karakter.";
  } else if (title.length > 100) {
    errors.title = "Judul maksimal 100 karakter.";
  }

  // 3. Kategori Aktivitas
  if (!category || !CATEGORY_LABELS[category]) {
    errors.category = "Pilih kategori aktivitas yang sesuai.";
  }

  // 4. Deskripsi
  if (!description) {
    errors.description = "Deskripsi kebutuhan atau keahlian wajib diisi.";
  } else if (description.length < 20) {
    errors.description = "Deskripsi minimal 20 karakter agar jelas bagi calon partner.";
  } else if (description.length > 1000) {
    errors.description = "Deskripsi maksimal 1000 karakter.";
  }

  // 5. Tanggal Rencana
  if (!date) {
    errors.date = "Tanggal rencana wajib diisi.";
  } else if (date < localToday) {
    errors.date = "Tanggal rencana tidak boleh di masa lalu.";
  }

  // 6. Waktu / Jam
  if (!time) {
    errors.time = "Waktu mulai aktivitas wajib diisi.";
  }

  // 7. Wilayah
  if (!region || !REGION_LABELS[region]) {
    errors.region = "Pilih wilayah pelaksanaan di Daerah Istimewa Yogyakarta.";
  }

  // 8. Titik Lokasi
  if (!address) {
    errors.address = "Titik lokasi atau tempat bertemu wajib diisi.";
  } else if (address.length < 5) {
    errors.address = "Titik lokasi minimal 5 karakter.";
  } else if (address.length > 150) {
    errors.address = "Titik lokasi maksimal 150 karakter.";
  }

  if (destination && destination.length > 150) {
    errors.destination = "Titik tujuan maksimal 150 karakter.";
  }

  // 9. Kompensasi
  if (!compensation || !COMPENSATION_LABELS[compensation]) {
    errors.compensation = "Pilih sistem kompensasi atau imbalan.";
  } else if (compensation === "tarif") {
    const rawAmount = String(values.amount ?? "").trim();
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Nominal tarif harus berupa angka lebih dari 0.";
    }
  }

  // 10. Persetujuan Syarat Komunitas
  if (!values.terms) {
    errors.terms = "Kamu harus menyetujui pedoman keamanan dan kesopanan komunitas NeedHelp.";
  }

  return errors;
}

/**
 * Validasi form Login.
 * - Mode Supabase: hanya validasi format email dan password (biarkan Supabase Auth yang verifikasi kredensial).
 * - Mode demo: validasi format + cek hardcoded demo credentials.
 */
export function validateLogin(email, password) {
  const errors = {};
  const emailValue = (email || "").trim().toLowerCase();
  const passwordValue = password || "";

  if (!emailValue) {
    errors.email = "Email wajib diisi.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    errors.email = "Format email tidak valid (contoh: nama@domain.com).";
  }

  if (!passwordValue) {
    errors.password = "Password wajib diisi.";
  } else if (passwordValue.length < 8) {
    errors.password = "Password minimal 8 karakter.";
  }

  // Hardcoded credential check hanya untuk mode demo
  if (!isSupabaseConfigured() && Object.keys(errors).length === 0) {
    if (emailValue !== CURRENT_USER.email || passwordValue !== "NeedHelp123!") {
      errors.general = "Email atau password salah. Gunakan akun demo: demo@needhelp.test / NeedHelp123!";
    }
  }

  return errors;
}

/**
 * Validasi form Edit Profil.
 * Memvalidasi nama, bio, dan pilihan avatar (opsional — null = pakai inisial).
 *
 * @param {string} name
 * @param {string} bio
 * @param {string|null} [avatarKey] - identifier avatar ilustrasi, atau null
 * @returns {Object} peta error per field (kosong bila valid)
 */
export function validateProfile(name, bio, avatarKey = null) {
  const errors = {};
  const nameValue = (name || "").trim();
  const bioValue = (bio || "").trim();

  if (!nameValue) {
    errors.name = "Nama lengkap wajib diisi.";
  } else if (nameValue.length < 3) {
    errors.name = "Nama minimal 3 karakter.";
  } else if (nameValue.length > 60) {
    errors.name = "Nama maksimal 60 karakter.";
  }

  if (bioValue && bioValue.length > 200) {
    errors.bio = "Bio maksimal 200 karakter.";
  }

  // avatar_key opsional: hanya divalidasi bila diisi (null = inisial default).
  if (avatarKey !== null && avatarKey !== undefined && !isValidAvatarKey(avatarKey)) {
    errors.avatarKey = "Pilihan avatar tidak dikenali.";
  }

  return errors;
}

/**
 * Validasi form Registrasi.
 * Memvalidasi nama, email, password, dan konfirmasi password.
 * Mode Supabase: hanya validasi format (Supabase Auth yang verifikasi).
 * Mode demo: tidak berlaku (registrasi hanya tersedia saat Supabase aktif).
 */
export function validateRegistration(name, email, password, confirmPassword) {
  const errors = {};
  const nameValue = (name || "").trim();
  const emailValue = (email || "").trim().toLowerCase();
  const passwordValue = password || "";
  const confirmValue = confirmPassword || "";

  // 1. Nama lengkap
  if (!nameValue) {
    errors.name = "Nama lengkap wajib diisi.";
  } else if (nameValue.length < 3) {
    errors.name = "Nama minimal 3 karakter.";
  } else if (nameValue.length > 60) {
    errors.name = "Nama maksimal 60 karakter.";
  }

  // 2. Email
  if (!emailValue) {
    errors.email = "Email wajib diisi.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    errors.email = "Format email tidak valid (contoh: nama@domain.com).";
  }

  // 3. Password
  if (!passwordValue) {
    errors.password = "Password wajib diisi.";
  } else if (passwordValue.length < 8) {
    errors.password = "Password minimal 8 karakter.";
  }

  // 4. Konfirmasi password
  if (!confirmValue) {
    errors.confirmPassword = "Konfirmasi password wajib diisi.";
  } else if (passwordValue && confirmValue !== passwordValue) {
    errors.confirmPassword = "Konfirmasi password tidak cocok dengan password.";
  }

  return errors;
}

/**
 * Validasi form Rating & Ulasan
 */
export function validateRating(stars, comment) {
  const errors = {};
  const numStars = Number(stars);
  const cleanComment = (comment || "").trim();

  if (!Number.isInteger(numStars) || numStars < 1 || numStars > 5) {
    errors.rating = "Pilih rating 1 sampai 5 bintang.";
  }
  if (!cleanComment) {
    errors.comment = "Ulasan wajib diisi minimal 10 karakter.";
  } else if (cleanComment.length < 10) {
    errors.comment = "Ulasan minimal 10 karakter.";
  } else if (cleanComment.length > 500) {
    errors.comment = "Ulasan maksimal 500 karakter.";
  }

  return errors;
}

/**
 * Validasi form Penawaran Bantuan (/formbantuan)
 */
export function validateHelpProposal(values) {
  const errors = {};
  const name = (values?.helper_name || "").trim();
  const message = (values?.helper_message || "").trim();
  const time = (values?.helper_time || "").trim();

  if (!name) {
    errors.helper_name = "Nama lengkap wajib diisi.";
  } else if (name.length < 3) {
    errors.helper_name = "Nama wajib diisi minimal 3 karakter.";
  } else if (name.length > 60) {
    errors.helper_name = "Nama maksimal 60 karakter.";
  }

  if (!message) {
    errors.helper_message = "Pesan bantuan wajib diisi.";
  } else if (message.length < 10) {
    errors.helper_message = "Pesan bantuan minimal 10 karakter.";
  } else if (message.length > 500) {
    errors.helper_message = "Pesan bantuan maksimal 500 karakter.";
  }

  if (!time) {
    errors.helper_time = "Waktu kesiapan bantuan wajib diisi.";
  }

  return errors;
}
