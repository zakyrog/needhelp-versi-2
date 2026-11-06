// Entry point untuk cPanel / CloudLinux Node.js Selector.
// PORT disediakan otomatis oleh hosting. Build standalone mengatur cwd dan
// menjalankan server Next.js produksi dari .next/standalone.
process.env.NODE_ENV = "production";
// Shell Linux biasanya sudah mengisi HOSTNAME dengan nama mesin hosting.
// Paksa bind ke semua interface supaya reverse proxy cPanel/Passenger dapat
// menjangkau proses aplikasi melalui port yang disediakan hosting.
process.env.HOSTNAME = "0.0.0.0";

await import("./.next/standalone/server.js");
