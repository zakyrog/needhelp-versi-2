import { getSupabase, isSupabaseConfigured } from "./supabase.js";

export const CONTACT_SHARE_ERROR_CODES = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_AVAILABLE: "NOT_AVAILABLE",
  INVALID_PHONE: "INVALID_PHONE",
});

function withCode(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function normalizeWhatsAppNumber(value) {
  let phone = String(value || "").replace(/[^0-9+]/g, "");
  if (phone.startsWith("+62")) phone = phone.slice(1);
  else if (phone.startsWith("08")) phone = `62${phone.slice(1)}`;
  return /^62[0-9]{9,13}$/.test(phone) ? phone : null;
}

function mapContactError(error, fallback) {
  const message = String(error?.message || "");
  if (/harus masuk|jwt/i.test(message)) {
    return withCode("Sesi Anda telah berakhir. Silakan masuk kembali.", CONTACT_SHARE_ERROR_CODES.NOT_AUTHENTICATED);
  }
  if (/format nomor/i.test(message)) {
    return withCode("Format nomor WhatsApp belum valid. Gunakan contoh 081234567890.", CONTACT_SHARE_ERROR_CODES.INVALID_PHONE);
  }
  if (/could not find the function|PGRST202|does not exist/i.test(message)) {
    return withCode(
      "Fitur persetujuan WhatsApp belum diaktifkan di database. Jalankan migration 016.",
      CONTACT_SHARE_ERROR_CODES.NOT_AVAILABLE,
    );
  }
  return new Error(message || fallback);
}

async function requireClient() {
  if (!isSupabaseConfigured()) {
    throw withCode("Supabase belum dikonfigurasi.", CONTACT_SHARE_ERROR_CODES.NOT_CONFIGURED);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw withCode("Anda harus masuk terlebih dahulu.", CONTACT_SHARE_ERROR_CODES.NOT_AUTHENTICATED);
  }
  return supabase;
}

export async function fetchWhatsAppShareStatus(conversationId) {
  if (!conversationId) return null;
  const supabase = await requireClient();
  const { data, error } = await supabase.rpc("get_whatsapp_share_status", {
    p_conversation_id: conversationId,
  });
  if (error) throw mapContactError(error, "Gagal memeriksa persetujuan WhatsApp.");

  const row = Array.isArray(data) ? data[0] : data;
  return {
    myConsented: Boolean(row?.my_consented),
    partnerConsented: Boolean(row?.partner_consented),
    partnerPhone: row?.partner_phone || null,
  };
}

export async function shareWhatsAppContact(conversationId, rawPhone) {
  const phone = normalizeWhatsAppNumber(rawPhone);
  if (!phone) {
    throw withCode(
      "Format nomor WhatsApp belum valid. Gunakan contoh 081234567890.",
      CONTACT_SHARE_ERROR_CODES.INVALID_PHONE,
    );
  }

  const supabase = await requireClient();
  const { error } = await supabase.rpc("share_whatsapp_contact", {
    p_conversation_id: conversationId,
    p_whatsapp_number: phone,
  });
  if (error) throw mapContactError(error, "Gagal membagikan nomor WhatsApp.");
  return fetchWhatsAppShareStatus(conversationId);
}

export async function revokeWhatsAppContact(conversationId) {
  const supabase = await requireClient();
  const { error } = await supabase.rpc("revoke_whatsapp_contact", {
    p_conversation_id: conversationId,
  });
  if (error) throw mapContactError(error, "Gagal membatalkan persetujuan WhatsApp.");
  return fetchWhatsAppShareStatus(conversationId);
}

export function buildWhatsAppUrl(phone) {
  const normalized = normalizeWhatsAppNumber(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}
