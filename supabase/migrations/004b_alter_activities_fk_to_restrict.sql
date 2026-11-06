-- =============================================================================
-- Migration 004b: Ubah FK activities.post_id dari CASCADE ke RESTRICT
-- =============================================================================
-- Migration ini menyelesaikan konflik antara:
-- - Migration 002 yang membuat FK activities.post_id dengan ON DELETE CASCADE
-- - Migration 005 yang mengharapkan ON DELETE RESTRICT dan akan gagal jika
--   menemukan FK dengan aturan selain RESTRICT
--
-- URUTAN EKSEKUSI:
-- Migration ini HARUS dijalankan SETELAH migration 004 dan SEBELUM migration 005.
-- Urutan lengkap: 001 → 002 → 003 → 004 → 004b → 005 → 006 → 007
--
-- ALASAN PERUBAHAN:
-- ON DELETE RESTRICT melindungi history transaksi. Jika post dihapus, activity
-- terkait TIDAK terhapus otomatis. Ini mencegah kehilangan data rating, ulasan,
-- dan riwayat bantuan yang bernilai bagi sistem reputasi.
--
-- DAMPAK TERHADAP APLIKASI:
-- Setelah migration ini, menghapus post yang memiliki activity terkait akan GAGAL
-- dengan error foreign key violation. Aplikasi harus handle error ini dengan
-- pesan yang jelas (lihat deletePostSupabase di src/lib/data.js).
--
-- CATATAN KEAMANAN:
-- - Migration ini menggunakan katalog PostgreSQL (pg_constraint) untuk menemukan
--   FK berdasarkan relasi, BUKAN berdasarkan nama constraint.
-- - Nama FK auto-generated oleh PostgreSQL bisa berbeda antar environment.
-- - Migration ini menolak jika menemukan kondisi ambigu (multiple FK, komposit, dll).
-- - Semua operasi dalam transaction (BEGIN/COMMIT) untuk atomicity.
-- =============================================================================

BEGIN;

-- =========================================================
-- 1. Prasyarat: Verifikasi tabel dan kolom
-- =========================================================

DO $$
DECLARE
    v_col_record RECORD;
BEGIN
    -- Tabel activities harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'activities'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.activities tidak ditemukan. Jalankan migration 002 terlebih dahulu.';
    END IF;

    -- Tabel posts harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'posts'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.posts tidak ditemukan.';
    END IF;

    -- Kolom activities.post_id harus ada
    SELECT data_type, is_nullable INTO v_col_record
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'post_id';

    IF v_col_record.data_type IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.post_id tidak ditemukan.';
    END IF;
    IF v_col_record.data_type != 'uuid' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.post_id harus bertipe UUID, ditemukan %.', v_col_record.data_type;
    END IF;
END
$$;

-- =========================================================
-- 2. Temukan dan ubah FK activities.post_id → posts(id)
-- =========================================================
-- Strategi:
-- 1. Query pg_constraint untuk menemukan semua FK pada activities yang melibatkan post_id
-- 2. Validasi: tepat 1 FK, bukan komposit, menunjuk ke posts(id)
-- 3. Jika sudah RESTRICT, skip (idempotent)
-- 4. Jika CASCADE/NO ACTION/SET NULL/SET DEFAULT, DROP lalu ADD dengan RESTRICT
-- 5. Jika tidak ada FK sama sekali, ADD baru dengan RESTRICT
-- 6. Verifikasi hasil akhir

DO $$
DECLARE
    v_rec RECORD;
    v_fk_count INT := 0;
    v_found_correct BOOLEAN := FALSE;
    v_constraint_name TEXT;
    v_local_col TEXT;
    v_ref_col TEXT;
    v_nkeys INT;
    v_deltype_text TEXT;
BEGIN
    -- Hitung berapa banyak FK pada activities yang melibatkan post_id
    SELECT COUNT(*) INTO v_fk_count
    FROM pg_constraint con
    INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.activities'::regclass
      AND con.contype = 'f'
      AND att.attname = 'post_id';

    -- Kasus 1: Tidak ada FK sama sekali
    IF v_fk_count = 0 THEN
        RAISE NOTICE 'Tidak ditemukan FK pada activities.post_id. Membuat FK baru dengan ON DELETE RESTRICT.';
        ALTER TABLE public.activities
            ADD CONSTRAINT activities_post_id_restrict_fkey
            FOREIGN KEY (post_id)
            REFERENCES public.posts(id)
            ON DELETE RESTRICT;

        -- Verifikasi
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.activities'::regclass
              AND contype = 'f'
              AND conname = 'activities_post_id_restrict_fkey'
              AND confdeltype = 'r'
        ) THEN
            RAISE EXCEPTION 'VERIFIKASI GAGAL: FK activities_post_id_restrict_fkey dengan RESTRICT tidak berhasil dibuat.';
        END IF;

        RETURN;
    END IF;

    -- Kasus 2: Multiple FK melibatkan post_id — ambigu, hentikan
    IF v_fk_count > 1 THEN
        RAISE EXCEPTION 'MIGRASI DIHENTIKAN: Ditemukan % FK pada activities yang melibatkan post_id. Kondisi ambigu, tindakan manual diperlukan. Query pg_constraint untuk detail.', v_fk_count;
    END IF;

    -- Kasus 3: Tepat 1 FK, proses lebih lanjut
    FOR v_rec IN
        SELECT
            con.conname,
            con.confdeltype,
            con.conkey,
            con.confkey,
            con.confrelid,
            conf.relname AS ref_table,
            confnsp.nspname AS ref_schema
        FROM pg_constraint con
        INNER JOIN pg_class conf ON conf.oid = con.confrelid
        INNER JOIN pg_namespace confnsp ON confnsp.oid = conf.relnamespace
        WHERE con.conrelid = 'public.activities'::regclass
          AND con.contype = 'f'
          AND 'post_id' = ANY(
              SELECT attname FROM pg_attribute
              WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)
          )
    LOOP
        v_constraint_name := v_rec.conname;
        v_nkeys := array_length(v_rec.conkey, 1);

        -- Cek apakah FK komposit
        IF v_nkeys > 1 THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities adalah komposit (% kolom). Migration ini hanya menangani FK single-column. Tindakan manual diperlukan.', v_constraint_name, v_nkeys;
        END IF;

        -- Verifikasi kolom lokal dan referensi
        SELECT attname INTO v_local_col
        FROM pg_attribute
        WHERE attrelid = 'public.activities'::regclass
          AND attnum = v_rec.conkey[1];

        SELECT attname INTO v_ref_col
        FROM pg_attribute
        WHERE attrelid = v_rec.confrelid
          AND attnum = v_rec.confkey[1];

        -- Decode confdeltype
        v_deltype_text := CASE v_rec.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE 'UNKNOWN (' || v_rec.confdeltype::TEXT || ')'
        END;

        -- Validasi target FK
        IF v_rec.ref_schema != 'public' OR v_rec.ref_table != 'posts' THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities menunjuk ke %.%, diharapkan public.posts. Tindakan manual diperlukan.', v_constraint_name, v_rec.ref_schema, v_rec.ref_table;
        END IF;

        IF v_local_col != 'post_id' THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities menggunakan kolom lokal "%", diharapkan "post_id". Tindakan manual diperlukan.', v_constraint_name, v_local_col;
        END IF;

        IF v_ref_col != 'id' THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities menunjuk ke kolom referensi "%", diharapkan "id". Tindakan manual diperlukan.', v_constraint_name, v_ref_col;
        END IF;

        -- Cek apakah sudah RESTRICT
        IF v_rec.confdeltype = 'r' THEN
            RAISE NOTICE 'FK "%" sudah menggunakan ON DELETE RESTRICT. Tidak ada perubahan diperlukan.', v_constraint_name;
            v_found_correct := TRUE;
        ELSE
            -- FK perlu diubah dari aturan saat ini ke RESTRICT
            RAISE NOTICE 'Mengubah FK "%" dari ON DELETE % menjadi ON DELETE RESTRICT.', v_constraint_name, v_deltype_text;

            -- DROP constraint lama
            EXECUTE format('ALTER TABLE public.activities DROP CONSTRAINT %I', v_constraint_name);

            -- ADD constraint baru dengan RESTRICT
            ALTER TABLE public.activities
                ADD CONSTRAINT activities_post_id_restrict_fkey
                FOREIGN KEY (post_id)
                REFERENCES public.posts(id)
                ON DELETE RESTRICT;

            v_found_correct := TRUE;
        END IF;
    END LOOP;

    -- Verifikasi hasil akhir
    IF NOT v_found_correct THEN
        RAISE EXCEPTION 'VERIFIKASI GAGAL: Tidak ada FK yang sesuai setelah pemrosesan.';
    END IF;

    -- Pastikan tepat 1 FK RESTRICT pada activities.post_id
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE con.conrelid = 'public.activities'::regclass
          AND con.contype = 'f'
          AND con.confdeltype = 'r'
          AND att.attname = 'post_id'
    ) THEN
        RAISE EXCEPTION 'VERIFIKASI GAGAL: Tidak ditemukan FK RESTRICT pada activities.post_id setelah perubahan.';
    END IF;

    RAISE NOTICE 'FK activities.post_id berhasil diubah menjadi ON DELETE RESTRICT.';
END
$$;

COMMIT;

-- =============================================================================
-- DOKUMENTASI
-- =============================================================================
--
-- Setelah migration ini:
-- - activities.post_id → posts(id) ON DELETE RESTRICT
-- - Menghapus post yang memiliki activity akan GAGAL dengan FK violation
-- - Migration 005 akan menemukan FK sudah RESTRICT dan skip audit block
--
-- Urutan migration yang benar:
-- 001 → 002 → 003 → 004 → 004b (INI) → 005 → 006 → 007
--
-- =============================================================================
