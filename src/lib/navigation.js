const APP_ORIGIN = "https://needhelpjogja.my.id";

/**
 * Mengembalikan path internal yang aman untuk redirect/navigasi klien.
 * URL absolut, protocol-relative URL, dan backslash selalu ditolak.
 */
export function getSafeInternalPath(value, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;

  try {
    const url = new URL(value, APP_ORIGIN);
    if (url.origin !== APP_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
