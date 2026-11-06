
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} phase @returns {import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    // Pisahkan cache live preview dari build produksi. Menjalankan `next build`
    // tidak lagi merusak hydration server `next dev` yang sedang aktif.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    output: "standalone",
    reactStrictMode: true,
    experimental: {
      cpus: 1,
      workerThreads: false,
    },
    outputFileTracingRoot: __dirname,

    async redirects() {
      return [
      { source: "/index.html", destination: "/", permanent: false },
      { source: "/katalog.html", destination: "/katalog", permanent: false },
      { source: "/login.html", destination: "/login", permanent: false },
      {
        source: "/detail-postingan.html",
        destination: "/detail-postingan",
        permanent: false,
      },
      {
        source: "/buat-postingan.html",
        destination: "/buat-postingan",
        permanent: false,
      },
      {
        source: "/sukses-postingan.html",
        destination: "/sukses-postingan",
        permanent: false,
      },
      { source: "/aktivitas.html", destination: "/aktivitas", permanent: false },
      { source: "/chat.html", destination: "/chat", permanent: false },
      { source: "/rating.html", destination: "/rating", permanent: false },
      {
        source: "/notifikasi.html",
        destination: "/notifikasi",
        permanent: false,
      },
      {
        source: "/formbantuan.html",
        destination: "/formbantuan",
        permanent: false,
      },
      { source: "/formeror.html", destination: "/formeror", permanent: false },
      ];
    },
  };
}
