# Handoff Teknis NeedHelp Versi 2

Dokumen ini adalah sumber konteks utama untuk developer dan AI yang mengambil
alih pengembangan, debugging, serta deployment NeedHelp Versi 2.

## 1. Identitas dan kondisi proyek

- Repository produksi: `https://github.com/zakyrog/needhelp-versi-2`
- Branch produksi: `main`
- Domain produksi: `https://needhelpjogja.my.id`
- Root aplikasi cPanel: `/home/oswlqfxx/needhelp-v2`
- Node.js produksi: `22.23.4` (minimum proyek `22.12.0`)
- Startup file cPanel/LiteSpeed: `server.cjs`
- Backend, Auth, Realtime, dan database: Supabase
- Supabase Project URL: `https://gyqvwpsqzyrqxrhzstgb.supabase.co`
- Framework: Next.js 15 App Router, React 19, output `standalone`

Snapshot terakhir saat handoff:

- Commit produksi terbaru: `d100512`
- Fitur utama terakhir: pengajuan paralel, chat setelah mengajukan, profil dan
  ulasan publik, serta persetujuan WhatsApp dua arah.
- GitHub Actions build `42378931167` berhasil.
- Release artefak: `deploy-d100512`.
- Build ID artefak tersebut: `5kT6P3scLv4241naWR0WV`.
- SHA-256 artefak: `bbf724208793bd69552c9f106ca4ce3936549af5ac77b0c52e96ddf349813823`.
- Pada saat dokumen dibuat, pemasangan artefak terbaru ke cPanel belum selesai.
  Produksi masih dapat mengirim HTML yang menunjuk campuran aset build lama dan
  baru. Akibatnya browser dengan cache lama kadang terlihat normal, sedangkan
  Incognito mengalami client-side exception.

## 2. Tujuan dan aturan produk

NeedHelp adalah platform untuk mencari partner bantuan atau aktivitas di area
Yogyakarta. Aktivitas dapat menggunakan imbalan uang, negosiasi, patungan,
traktir, atau sukarela; ini bukan platform bantuan gratis saja.

Aturan produk yang sudah disepakati:

1. Pengguna dapat membuat postingan `butuh bantuan` atau `menawarkan bantuan`.
   Kedua jenis postingan harus memiliki form dan bahasa yang berbeda.
2. Beberapa pengguna boleh mengajukan dan mengobrol secara paralel pada satu
   postingan. Satu match tidak mengunci postingan bagi pengguna lain.
3. Chat di dalam NeedHelp dapat dibuka setelah pengguna mengirim pengajuan;
   tidak perlu menunggu pengajuan diterima.
4. Nomor WhatsApp tidak boleh tampil publik. Kontak baru muncul setelah kedua
   pihak menyetujui berbagi WhatsApp.
5. Postingan yang sudah menghasilkan match/aktivitas selesai diberi penanda,
   tetapi tetap menerima pengajuan baru.
6. Rating dan ulasan dapat dilihat pengguna lain melalui profil publik.
7. Jangan menampilkan alamat lengkap, nomor telepon, token, atau data pribadi
   pada kartu/postingan publik.

## 3. Struktur penting

- `src/app/`: halaman App Router.
- `src/lib/data.js`: akses data postingan, pengajuan, aktivitas, rating, dan RPC.
- `src/lib/chat.js`: percakapan, pesan, dan Realtime.
- `src/lib/contact-sharing.js`: persetujuan WhatsApp dua arah.
- `src/lib/notifications.js`: notifikasi.
- `src/lib/auth.js`: sesi pengguna pada browser.
- `src/lib/supabase.js`: client Supabase berbasis public environment variables.
- `src/styles/`: CSS global, tema, responsivitas, dan komponen.
- `supabase/migrations/`: sumber kebenaran perubahan schema/RLS/RPC.
- `tests/`: pengujian Node (`node --test`).
- `scripts/prepare-standalone.mjs`: menyalin aset yang diperlukan ke output
  standalone setelah build.
- `server.cjs`: entry point CommonJS untuk CloudLinux/LiteSpeed.
- `.github/workflows/build-cpanel.yml`: build Linux dan artefak deployment.

Halaman utama antara lain `/`, `/katalog`, `/buat-postingan`,
`/detail-postingan`, `/formbantuan`, `/pengajuan`, `/chat`, `/aktivitas`,
`/rating`, `/pengguna/[id]`, `/profil`, `/login`, dan `/register`.

## 4. Environment variables dan keamanan

Environment minimum:

```ini
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://gyqvwpsqzyrqxrhzstgb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable/anon key proyek>
```

Aturan:

- Nilai public Supabase harus tersedia saat `next build`, karena
  `NEXT_PUBLIC_*` ditanam ke bundle browser.
- Simpan nilainya di GitHub Actions Secrets dan environment variables cPanel.
- Jangan pernah memasukkan `service_role` key ke browser, repository,
  `NEXT_PUBLIC_*`, screenshot, atau percakapan AI.
- Jangan menambahkan `PORT` di cPanel. Hosting mengelolanya otomatis.
- `.env.local` tidak boleh di-commit.
- `NEXT_PUBLIC_CHAT_DEBUG=1` hanya untuk debugging sementara dan jangan
  digunakan untuk mencetak token atau isi pesan sensitif.

Supabase Auth URL Configuration:

- Site URL: `https://needhelpjogja.my.id`
- Redirect URL produksi: `https://needhelpjogja.my.id/**`
- Redirect lokal: `http://localhost:3000/**`

## 5. Pengembangan lokal

Gunakan Node.js 22 dan jalankan:

```bash
npm ci
npm run dev
```

Preview lokal berada di `http://127.0.0.1:3000` atau alamat yang ditampilkan
Next.js. Development memakai `.next-dev`, sedangkan production build memakai
`.next`, sehingga build tidak seharusnya merusak cache `next dev`.

Sebelum push:

```bash
npm test
npm run build -- --no-lint
```

Jika build selesai, `postbuild` otomatis menjalankan
`scripts/prepare-standalone.mjs`. Verifikasi:

```bash
test -f .next/standalone/server.js \
  && test -d .next/standalone/.next/static \
  && test -d .next/standalone/public \
  && echo BUILD_SIAP
```

## 6. Database dan migration Supabase

- Jalankan file migration secara berurutan berdasarkan nama.
- Migration terbaru adalah
  `017_parallel_conversations_and_public_reviews.sql`.
- SQL dijalankan melalui Supabase SQL Editor sebagai query SQL biasa, bukan
  ditempel ke halaman Schema Visualizer.
- Setelah menjalankan migration, baca hasil/error; jangan mengulang migration
  secara membabi buta jika tidak dirancang idempotent.
- Jangan menghapus project Supabase, akun, tabel, data, atau riwayat untuk
  memperbaiki masalah frontend/build. Itu tidak mengatasi chunk atau CSS yang
  hilang.
- Sebelum perubahan schema, buat backup dan audit RLS/RPC yang terdampak.

RPC yang penting mencakup pengajuan bantuan, penerimaan/penolakan/penarikan,
status aktivitas, penyelesaian aktivitas, rating, percakapan/pesan, profil
publik, notifikasi, serta persetujuan WhatsApp. Cari pemakaiannya di `src/lib`
sebelum mengubah signature RPC.

## 7. Deployment yang direkomendasikan

Jangan build aplikasi di cPanel jika artefak GitHub Actions tersedia. Hosting
shared memiliki batas RAM/proses dan build yang terputus dapat menghasilkan
folder `.next` campuran.

Alur utama:

1. Merge/push perubahan yang sudah diuji ke `main`.
2. Workflow `Build cPanel deployment` berjalan otomatis.
3. Pastikan seluruh step hijau, termasuk test, build, verifikasi Build ID, dan
   upload artefak `needhelp-cpanel-linux`.
4. Unduh artefak dari Actions atau release yang disiapkan.
5. Upload atau download arsip ke `/home/oswlqfxx/needhelp-v2`.
6. Verifikasi checksum sebelum ekstraksi.
7. Hentikan aplikasi pada **Setup Node.js App**.
8. Ekstrak ke folder staging, verifikasi isinya, lalu tukar seluruh direktori
   `.next/standalone`. Jangan ekstrak menimpa direktori lama karena chunk lama
   dapat tertinggal.
9. Pastikan startup file adalah `server.cjs`, kemudian start/restart aplikasi.
10. Verifikasi halaman dan seluruh aset CSS/JS dari browser tanpa cache.
11. Hapus backup lama hanya setelah produksi dinyatakan sehat.

Contoh untuk release `d100512`:

```bash
cd /home/oswlqfxx/needhelp-v2

curl -L --fail \
  -o needhelp-cpanel-linux.tar.gz \
  https://github.com/zakyrog/needhelp-versi-2/releases/download/deploy-d100512/needhelp-cpanel-linux.tar.gz

sha256sum needhelp-cpanel-linux.tar.gz
```

Checksum yang diharapkan tercantum pada bagian snapshot. Setelah aplikasi
dihentikan dari Node.js App:

```bash
cd /home/oswlqfxx/needhelp-v2
rm -rf deploy-staging
mkdir deploy-staging
tar -xzf needhelp-cpanel-linux.tar.gz -C deploy-staging

test -f deploy-staging/.next/standalone/server.js
test -d deploy-staging/.next/standalone/.next/static
test -d deploy-staging/.next/standalone/public
cat deploy-staging/deployment-manifest.txt
cat deploy-staging/.next/standalone/.next/BUILD_ID
```

Jika verifikasi berhasil, tukar direktori secara utuh. Jangan hapus rollback
sebelum website lolos pemeriksaan:

```bash
cd /home/oswlqfxx/needhelp-v2
mv .next/standalone .next/standalone.rollback
mv deploy-staging/.next/standalone .next/standalone
cp deploy-staging/server.cjs ./server.cjs
cp deploy-staging/package.json ./package.json
cp deploy-staging/deployment-manifest.txt ./deployment-manifest.txt

find .next/standalone -type d -exec chmod 755 {} \;
find .next/standalone -type f -exec chmod 644 {} \;
chmod 644 server.cjs
```

Lalu start/restart melalui **Setup Node.js App**. Rollback jika produksi gagal:

```bash
cd /home/oswlqfxx/needhelp-v2
mv .next/standalone .next/standalone.failed
mv .next/standalone.rollback .next/standalone
```

## 8. Build manual di cPanel (hanya cadangan)

`npm ci` dan `npm run build` adalah perintah berbeda. Jangan memilih tombol
**Run NPM Install** di UI Node.js App untuk pekerjaan berat karena proses sulit
dipantau dan sebelumnya memicu batas proses CloudLinux.

Aktifkan environment Node aplikasi:

```bash
source /home/oswlqfxx/nodevenv/needhelp-v2/22/bin/activate
cd /home/oswlqfxx/needhelp-v2
```

Instalasi dependency yang terkunci:

```bash
nice -n 10 npm ci --no-audit --no-fund
```

Build dengan satu worker dan batas heap sesuai paket hosting:

```bash
nice -n 10 env \
  NODE_OPTIONS=--max-old-space-size=768 \
  UV_THREADPOOL_SIZE=1 \
  NEXT_TELEMETRY_DISABLED=1 \
  npm run build -- --no-lint
```

Jangan menghentikan build hanya karena beberapa menit berada di `Generating
static pages`. Hentikan hanya jika ada error nyata, proses hilang, atau resource
fault bertambah. Setelah selesai, wajib melihat `Standalone deployment assets
are ready` dan menjalankan verifikasi `BUILD_SIAP`.

Jangan menjalankan `node` sebelum environment diaktifkan; pesan
`node: command not found` berarti venv belum di-source.

## 9. Konfigurasi cPanel/LiteSpeed

Node.js Application:

- Mode: `production`
- Application root: `needhelp-v2`
- Application URL: `needhelpjogja.my.id`
- Startup file: `server.cjs`
- Node: `22.23.4`

`.htaccess` yang dibuat Node Selector harus menunjuk:

```apache
PassengerAppRoot "/home/oswlqfxx/needhelp-v2"
PassengerBaseURI "/"
PassengerStartupFile server.cjs
```

`server.cjs` sengaja CommonJS. CloudLinux/LiteSpeed `lsnode.js` memuat startup
dengan `require()`. Menggunakan startup ESM dengan top-level `await` menyebabkan
`ERR_REQUIRE_ASYNC_MODULE` dan 503.

Jangan menjalankan `PORT=3001 node server.js` sebagai cara produksi. Port
Passenger dikelola hosting; `EADDRINUSE` hanya berarti port manual sudah dipakai
dan bukan bukti bahwa aplikasi Passenger sehat.

## 10. Debugging produksi

Urutan diagnosis:

1. Buka website pada Incognito atau dengan cache dinonaktifkan. Ini membedakan
   cache browser lama dari kerusakan server; bukan untuk menghapus akun.
2. Buka DevTools Network/Console dan catat file CSS/JS yang 404/500.
3. Ambil HTML produksi dan bandingkan nama chunk yang dirujuk dengan file di
   `.next/standalone/.next/static`.
4. Bandingkan `.next/BUILD_ID` dengan
   `.next/standalone/.next/BUILD_ID`/manifest artefak.
5. Baca `/home/oswlqfxx/needhelp-v2/stderr.log`.
6. Periksa CloudLinux Resource Usage: RAM, proses, entry process, CPU, dan
   faults.
7. Periksa environment variables dan Supabase Auth redirect.

Gejala yang sudah pernah terjadi:

- `cagefs_enter: Unable to fork`: batas process/PMEM hosting tercapai. Menunggu
  semalaman tidak otomatis memperbaiki penyebab; hentikan proses liar, cek LVE,
  dan gunakan artefak build.
- `ERR_REQUIRE_ASYNC_MODULE`: startup ESM dipanggil melalui `require()`; gunakan
  `server.cjs`.
- Client-side exception dengan tampilan HTML tanpa CSS: HTML dan static chunks
  berasal dari build berbeda atau file aset hilang. Ganti seluruh standalone
  secara atomik, restart, dan jangan menghapus database.
- `Anda tidak berhak memulai percakapan`: biasanya migration/RPC/policy atau
  parameter user/post tidak cocok. Uji dengan dua akun berbeda dan pastikan
  migration `017` sudah terpasang.
- `EADDRINUSE`: pengujian manual menggunakan port yang sudah dipakai; bukan
  masalah Supabase.

Saat snapshot ini dibuat, HTML produksi diketahui pernah menunjuk file lama
seperti `557-93a206e08e298b22.js`, sementara build lain di disk berisi
`557-03c92cad2befeb01.js`. Beberapa CSS/chunk produksi merespons HTTP 500. Ini
adalah bukti build campuran dan harus diselesaikan lewat penggantian artefak
standalone secara utuh.

## 11. Git dan cara kerja tim

- Jangan bekerja langsung di `main`; buat branch fitur/fix dan Pull Request.
- Repository harus public jika kolaborator belum diberi akses khusus, tetapi
  public repo tetap tidak boleh memuat secret.
- Sebelum pull di cPanel, cek `git status --short`. Jangan menghapus perubahan
  yang bukan milik sendiri.
- Folder hasil runtime seperti `node_modules`, `tmp`, `.next`, dan `.env.local`
  jangan di-commit.
- Perubahan GitHub tidak otomatis muncul di website. Actions hanya membangun
  artefak; deployment ke cPanel dan restart tetap perlu dilakukan sampai ada
  pipeline deploy terautentikasi yang sengaja dibuat.
- Gunakan commit kecil, tulis migration bersama perubahan kode yang bergantung
  padanya, dan sertakan langkah uji pada PR.

## 12. Checklist setelah deploy

- `/` tampil lengkap dengan CSS dan tanpa console error.
- Semua URL CSS/JS pada HTML merespons 200.
- Register, login, logout, konfirmasi email, dan reset password.
- Buat kedua jenis postingan.
- Ajukan bantuan dari dua akun berbeda pada satu postingan.
- Kedua pengaju dapat membuka chat tanpa menunggu diterima.
- Pemilik postingan dapat menerima/menolak masing-masing pengajuan tanpa
  mengunci pengajuan lain.
- Realtime chat dan notifikasi berjalan.
- WhatsApp tidak terlihat sebelum persetujuan kedua pihak.
- Aktivitas dapat diselesaikan dan diberi rating/ulasan.
- Profil publik memperlihatkan rating dan ulasan.
- Postingan yang match/selesai tetap menerima pengajuan baru.
- Uji desktop dan mobile, khususnya overflow horizontal, ukuran font, navbar,
  form, kartu, dialog, dan tombol fixed/sticky.

## 13. Instruksi singkat untuk AI penerus

Gunakan seluruh dokumen ini sebagai konteks. Sebelum mengubah kode, baca
`package.json`, `next.config.mjs`, `server.cjs`, migration terbaru, dan file yang
terkait. Jangan menghapus database/akun atau membangun ulang deployment dari
nol hanya karena error frontend. Reproduksi masalah, cari bukti pada console,
network, log, Build ID, dan test. Pertahankan pengajuan paralel, chat setelah
pengajuan, privasi WhatsApp dua arah, serta ulasan publik. Untuk produksi,
utamakan artefak Linux dari GitHub Actions dan penggantian seluruh folder
standalone; build manual di cPanel adalah pilihan terakhir.
