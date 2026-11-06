// Entry point untuk cPanel / CloudLinux Node.js Selector.
// PORT disediakan otomatis oleh hosting. Build standalone mengatur cwd dan
// menjalankan server Next.js produksi dari .next/standalone.
process.env.NODE_ENV = "production";
process.env.HOSTNAME ||= "0.0.0.0";

await import("./.next/standalone/server.js");
