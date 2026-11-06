-- =============================================================================
-- Migration 005: Partner access, FK audit, complete_activity, save_rating
-- =============================================================================
-- Menambahkan:
-- 1. RLS policy agar partner bisa membaca aktivitas yang melibatkan mereka
-- 2. Audit FK post_id pada activities dan help_applications (ubah CASCADE → RESTRICT)
-- 3. REVOKE EXECUTE pada validate_activity_post_ownership dari PUBLIC
-- 4. RPC complete_activity: menyelesaikan aktivitas (berlangsung → selesai)
-- 5. RPC save_activity_rating: menyimpan rating/ulasan setelah aktivitas selesai
--
-- PRASYARAT:
-- - Migration 002, 003, 004 sudah dijalankan
-- - Tabel activities, help_applications, posts, profiles sudah ada
--
-- CATATAN KEAMANAN:
-- - activities_update_own policy MASIH ADA dan memungkinkan UPDATE langsung.
--   Ini adalah RISIKO YANG BELUM TERTUTUP. User authenticated bisa mengubah
--   status activity miliknya ke nilai apa pun yang valid CHECK constraint
--   via Supabase client, bypass validasi transisi di RPC.
--   Mitigasi: pindahkan semua operasi ke RPC, lalu hapus policy ini di migration terpisah.
-- - Retry 40P01 (deadlock) BELUM TERSEDIA di JavaScript wrapper.
-- - Idempotency timeout BELUM TERSEDIA. Jangan retry otomatis tanpa mekanisme idempotency key.
-- =============================================================================

BEGIN;

-- =========================================================
-- 1. Prasyarat: Verifikasi skema
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
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.activities tidak ditemukan.';
    END IF;

    -- Kolom activities.post_id (UUID NOT NULL)
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
    IF v_col_record.is_nullable != 'NO' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.post_id harus NOT NULL.';
    END IF;

    -- Kolom activities.review_rating (SMALLINT, nullable)
    SELECT data_type INTO v_col_record
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'review_rating';

    IF v_col_record.data_type IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.review_rating tidak ditemukan.';
    END IF;
    IF v_col_record.data_type != 'smallint' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.review_rating harus bertipe SMALLINT, ditemukan %.', v_col_record.data_type;
    END IF;

    -- Kolom activities.partner_id (UUID, nullable)
    SELECT data_type INTO v_col_record
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'partner_id';

    IF v_col_record.data_type IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.partner_id tidak ditemukan.';
    END IF;
    IF v_col_record.data_type != 'uuid' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.partner_id harus bertipe UUID, ditemukan %.', v_col_record.data_type;
    END IF;

    -- Kolom activities.review_comment (TEXT, nullable)
    SELECT data_type INTO v_col_record
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'review_comment';

    IF v_col_record.data_type IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.review_comment tidak ditemukan.';
    END IF;
    IF v_col_record.data_type != 'text' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.review_comment harus bertipe TEXT, ditemukan %.', v_col_record.data_type;
    END IF;

    -- Kolom activities.status (TEXT NOT NULL)
    SELECT data_type, is_nullable INTO v_col_record
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'status';

    IF v_col_record.data_type IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.status tidak ditemukan.';
    END IF;
    IF v_col_record.data_type != 'text' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.status harus bertipe TEXT, ditemukan %.', v_col_record.data_type;
    END IF;
    IF v_col_record.is_nullable != 'NO' THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.status harus NOT NULL.';
    END IF;

    -- Tabel help_applications harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'help_applications'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.help_applications tidak ditemukan.';
    END IF;

    -- Verifikasi CHECK constraint pada activities.status
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE con.conrelid = 'public.activities'::regclass
          AND con.contype = 'c'  -- 'c' = CHECK
          AND att.attname = 'status'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: CHECK constraint pada activities.status tidak ditemukan.';
    END IF;

    -- Verifikasi CHECK constraint pada activities.review_rating (1-5)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        INNER JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
        WHERE con.conrelid = 'public.activities'::regclass
          AND con.contype = 'c'  -- 'c' = CHECK
          AND att.attname = 'review_rating'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: CHECK constraint pada activities.review_rating tidak ditemukan.';
    END IF;
END
$$;

-- =========================================================
-- 2. RLS: Partner bisa membaca aktivitas yang melibatkan mereka
-- =========================================================

DROP POLICY IF EXISTS activities_select_as_partner
    ON public.activities;

CREATE POLICY activities_select_as_partner
    ON public.activities
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = partner_id);

-- Catatan: Hanya SELECT. Tidak ada UPDATE/DELETE untuk partner.

-- =========================================================
-- 3. Audit FK: activities.post_id → RESTRICT
-- =========================================================
-- Mengubah FK dari CASCADE ke RESTRICT untuk melindungi history transaksi.
-- Jika FK komposit ditemukan atau FK tidak sesuai kriteria, migration dihentikan
-- dengan diagnostik lengkap. FK tidak dihapus secara otomatis.

DO $$
DECLARE
    v_rec RECORD;
    v_found_correct BOOLEAN := FALSE;
    v_local_col TEXT;
    v_ref_col TEXT;
    v_nkeys INT;
    v_deltype_text TEXT;
BEGIN
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
        v_nkeys := array_length(v_rec.conkey, 1);

        -- FK komposit: hentikan migration dengan diagnostik
        IF v_nkeys > 1 THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: Ditemukan FK komposit "%" pada activities yang melibatkan post_id dengan % kolom. Migration tidak dapat menangani FK komposit secara otomatis. Tindakan manual diperlukan: periksa constraint ini dan tentukan apakah perlu dipertahankan, diubah, atau dihapus.', v_rec.conname, v_nkeys;
        END IF;

        -- Verifikasi pasangan kolom berdasarkan posisi
        SELECT attname INTO v_local_col
        FROM pg_attribute
        WHERE attrelid = 'public.activities'::regclass
          AND attnum = v_rec.conkey[1];

        SELECT attname INTO v_ref_col
        FROM pg_attribute
        WHERE attrelid = v_rec.confrelid
          AND attnum = v_rec.confkey[1];

        -- Decode confdeltype ke teks untuk diagnostik
        v_deltype_text := CASE v_rec.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE 'UNKNOWN (' || v_rec.confdeltype::TEXT || ')'
        END;

        -- Cek apakah FK sudah sesuai target
        IF v_rec.ref_schema = 'public'
           AND v_rec.ref_table = 'posts'
           AND v_local_col = 'post_id'
           AND v_ref_col = 'id'
           AND v_rec.confdeltype = 'r'  -- 'r' = RESTRICT
        THEN
            v_found_correct := TRUE;
        ELSIF v_rec.ref_schema = 'public'
              AND v_rec.ref_table = 'posts'
              AND v_local_col = 'post_id'
              AND v_ref_col = 'id'
              AND v_rec.confdeltype != 'r'
        THEN
            -- FK menunjuk ke target yang benar tapi ON DELETE rule berbeda
            -- Hentikan migration dengan diagnostik, jangan auto-drop
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities menunjuk ke public.posts(id) dengan aturan ON DELETE %, diharapkan RESTRICT. Tindakan manual diperlukan: ubah constraint ini menjadi ON DELETE RESTRICT atau konfirmasi bahwa aturan saat ini memang diinginkan.', v_rec.conname, v_deltype_text;
        ELSE
            -- FK tidak sesuai target (tabel/kolom berbeda)
            -- Hentikan migration dengan diagnostik lengkap
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada activities tidak sesuai kriteria. Detail: kolom_lokal=%, tabel_referensi=%.%, kolom_referensi=%, on_delete=%. Diharapkan: post_id → public.posts(id) ON DELETE RESTRICT. Tindakan manual diperlukan: periksa constraint ini dan tentukan tindakan yang tepat.', v_rec.conname, v_local_col, v_rec.ref_schema, v_rec.ref_table, v_ref_col, v_deltype_text;
        END IF;
    END LOOP;

    IF NOT v_found_correct THEN
        ALTER TABLE public.activities
            ADD CONSTRAINT activities_post_id_restrict_fkey
            FOREIGN KEY (post_id)
            REFERENCES public.posts(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

-- =========================================================
-- 4. Audit FK: help_applications.post_id → RESTRICT
-- =========================================================
-- Sama seperti di atas, untuk tabel help_applications.
-- FK tidak dihapus secara otomatis jika tidak sesuai kriteria.

DO $$
DECLARE
    v_rec RECORD;
    v_found_correct BOOLEAN := FALSE;
    v_local_col TEXT;
    v_ref_col TEXT;
    v_nkeys INT;
    v_deltype_text TEXT;
BEGIN
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
        WHERE con.conrelid = 'public.help_applications'::regclass
          AND con.contype = 'f'
          AND 'post_id' = ANY(
              SELECT attname FROM pg_attribute
              WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)
          )
    LOOP
        v_nkeys := array_length(v_rec.conkey, 1);

        IF v_nkeys > 1 THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: Ditemukan FK komposit "%" pada help_applications yang melibatkan post_id dengan % kolom. Tindakan manual diperlukan.', v_rec.conname, v_nkeys;
        END IF;

        SELECT attname INTO v_local_col
        FROM pg_attribute
        WHERE attrelid = 'public.help_applications'::regclass
          AND attnum = v_rec.conkey[1];

        SELECT attname INTO v_ref_col
        FROM pg_attribute
        WHERE attrelid = v_rec.confrelid
          AND attnum = v_rec.confkey[1];

        -- Decode confdeltype ke teks untuk diagnostik
        v_deltype_text := CASE v_rec.confdeltype
            WHEN 'a' THEN 'NO ACTION'
            WHEN 'r' THEN 'RESTRICT'
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            ELSE 'UNKNOWN (' || v_rec.confdeltype::TEXT || ')'
        END;

        IF v_rec.ref_schema = 'public'
           AND v_rec.ref_table = 'posts'
           AND v_local_col = 'post_id'
           AND v_ref_col = 'id'
           AND v_rec.confdeltype = 'r'
        THEN
            v_found_correct := TRUE;
        ELSIF v_rec.ref_schema = 'public'
              AND v_rec.ref_table = 'posts'
              AND v_local_col = 'post_id'
              AND v_ref_col = 'id'
              AND v_rec.confdeltype != 'r'
        THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada help_applications menunjuk ke public.posts(id) dengan aturan ON DELETE %, diharapkan RESTRICT. Tindakan manual diperlukan.', v_rec.conname, v_deltype_text;
        ELSE
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada help_applications tidak sesuai kriteria. Detail: kolom_lokal=%, tabel_referensi=%.%, kolom_referensi=%, on_delete=%. Diharapkan: post_id → public.posts(id) ON DELETE RESTRICT. Tindakan manual diperlukan.', v_rec.conname, v_local_col, v_rec.ref_schema, v_rec.ref_table, v_ref_col, v_deltype_text;
        END IF;
    END LOOP;

    IF NOT v_found_correct THEN
        ALTER TABLE public.help_applications
            ADD CONSTRAINT help_applications_post_id_restrict_fkey
            FOREIGN KEY (post_id)
            REFERENCES public.posts(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

-- =========================================================
-- 5. REVOKE EXECUTE pada validate_activity_post_ownership
-- =========================================================
-- Trigger function tidak boleh dipanggil sebagai RPC oleh PUBLIC.

REVOKE EXECUTE ON FUNCTION public.validate_activity_post_ownership() FROM PUBLIC;

-- =========================================================
-- 6. RPC: complete_activity
-- =========================================================
-- Menyelesaikan aktivitas (transisi berlangsung → selesai).
-- Validasi: user harus pemilik postingan, status harus 'berlangsung', partner_id harus ada.
--
-- PROTOKOL LOCK: posts → activities (konsisten dengan migration 004)
-- 1. Lock post terlebih dahulu untuk memverifikasi kepemilikan
-- 2. Lock activity record untuk mencegah race condition pada update status

CREATE OR REPLACE FUNCTION public.complete_activity(
    p_post_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_post_author UUID;
    v_activity_status TEXT;
    v_partner_id UUID;
    v_row_count INT;
BEGIN
    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'post_id wajib diisi.';
    END IF;

    v_caller_id := (SELECT auth.uid());
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    -- TAHAP 1: Lock post terlebih dahulu (konsisten dengan protokol posts → activities)
    SELECT author_id INTO v_post_author
    FROM public.posts
    WHERE id = p_post_id
    FOR UPDATE;

    IF v_post_author IS NULL THEN
        RAISE EXCEPTION 'Postingan tidak ditemukan.';
    END IF;

    -- Validasi kepemilikan postingan
    IF v_post_author != v_caller_id THEN
        RAISE EXCEPTION 'Anda bukan pemilik postingan ini.';
    END IF;

    -- TAHAP 2: Lock activity record setelah post di-lock
    SELECT a.status, a.partner_id
    INTO v_activity_status, v_partner_id
    FROM public.activities a
    WHERE a.post_id = p_post_id
      AND a.user_id = v_caller_id
    FOR UPDATE;

    IF v_activity_status IS NULL THEN
        RAISE EXCEPTION 'Aktivitas tidak ditemukan untuk postingan ini.';
    END IF;

    -- Validasi status
    IF v_activity_status != 'berlangsung' THEN
        IF v_activity_status = 'selesai' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah selesai.';
        ELSIF v_activity_status = 'menunggu' THEN
            RAISE EXCEPTION 'Aktivitas belum dimulai. Mulai aktivitas terlebih dahulu.';
        ELSIF v_activity_status = 'batal' THEN
            RAISE EXCEPTION 'Aktivitas yang dibatalkan tidak dapat diselesaikan.';
        ELSE
            RAISE EXCEPTION 'Status aktivitas saat ini (%) tidak memungkinkan untuk diselesaikan.', v_activity_status;
        END IF;
    END IF;

    -- Validasi partner_id harus ada
    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'Aktivitas ini belum memiliki partner. Terima pengajuan bantuan terlebih dahulu.';
    END IF;

    -- Update status ke 'selesai'
    UPDATE public.activities
    SET status = 'selesai'
    WHERE post_id = p_post_id
      AND user_id = v_caller_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count != 1 THEN
        RAISE EXCEPTION 'Gagal menyelesaikan aktivitas. Diharapkan 1 baris, ditemukan %.', v_row_count;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_activity(UUID) TO authenticated;

-- =========================================================
-- 7. RPC: save_activity_rating
-- =========================================================
-- Menyimpan rating/ulasan untuk aktivitas yang sudah selesai.
-- Validasi: user harus pemilik postingan, status harus 'selesai', partner_id harus ada,
--           tidak boleh menilai diri sendiri, tidak boleh double rating.
--
-- PROTOKOL LOCK: posts → activities (konsisten dengan migration 004)
-- 1. Lock post terlebih dahulu untuk memverifikasi kepemilikan
-- 2. Lock activity record untuk mencegah race condition pada update rating

CREATE OR REPLACE FUNCTION public.save_activity_rating(
    p_post_id UUID,
    p_rating SMALLINT,
    p_comment TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_post_author UUID;
    v_activity_status TEXT;
    v_partner_id UUID;
    v_existing_rating SMALLINT;
    v_row_count INT;
BEGIN
    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'post_id wajib diisi.';
    END IF;

    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating harus berupa bilangan bulat 1 sampai 5.';
    END IF;

    v_caller_id := (SELECT auth.uid());
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    -- TAHAP 1: Lock post terlebih dahulu (konsisten dengan protokol posts → activities)
    SELECT author_id INTO v_post_author
    FROM public.posts
    WHERE id = p_post_id
    FOR UPDATE;

    IF v_post_author IS NULL THEN
        RAISE EXCEPTION 'Postingan tidak ditemukan.';
    END IF;

    -- Validasi kepemilikan postingan
    IF v_post_author != v_caller_id THEN
        RAISE EXCEPTION 'Anda bukan pemilik postingan ini.';
    END IF;

    -- TAHAP 2: Lock activity record setelah post di-lock
    SELECT a.status, a.partner_id, a.review_rating
    INTO v_activity_status, v_partner_id, v_existing_rating
    FROM public.activities a
    WHERE a.post_id = p_post_id
      AND a.user_id = v_caller_id
    FOR UPDATE;

    IF v_activity_status IS NULL THEN
        RAISE EXCEPTION 'Aktivitas tidak ditemukan untuk postingan ini.';
    END IF;

    -- Validasi status harus 'selesai'
    IF v_activity_status != 'selesai' THEN
        IF v_activity_status = 'berlangsung' THEN
            RAISE EXCEPTION 'Aktivitas belum selesai. Selesaikan aktivitas terlebih dahulu sebelum memberi ulasan.';
        ELSIF v_activity_status = 'menunggu' THEN
            RAISE EXCEPTION 'Aktivitas belum dimulai. Mulai dan selesaikan aktivitas terlebih dahulu.';
        ELSIF v_activity_status = 'batal' THEN
            RAISE EXCEPTION 'Aktivitas yang dibatalkan tidak dapat diberi ulasan.';
        ELSE
            RAISE EXCEPTION 'Status aktivitas saat ini (%) tidak memungkinkan untuk diberi ulasan.', v_activity_status;
        END IF;
    END IF;

    -- Validasi partner_id harus ada
    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'Aktivitas ini belum memiliki partner. Tidak dapat memberi ulasan.';
    END IF;

    -- Validasi tidak boleh menilai diri sendiri
    IF v_partner_id = v_caller_id THEN
        RAISE EXCEPTION 'Anda tidak dapat memberikan ulasan kepada diri sendiri.';
    END IF;

    -- Validasi tidak boleh double rating
    IF v_existing_rating IS NOT NULL THEN
        RAISE EXCEPTION 'Anda sudah memberikan ulasan untuk aktivitas ini.';
    END IF;

    -- Simpan rating
    UPDATE public.activities
    SET review_rating = p_rating,
        review_comment = COALESCE(p_comment, '')
    WHERE post_id = p_post_id
      AND user_id = v_caller_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count != 1 THEN
        RAISE EXCEPTION 'Gagal menyimpan ulasan. Diharapkan 1 baris, ditemukan %.', v_row_count;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_activity_rating(UUID, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_activity_rating(UUID, SMALLINT, TEXT) TO authenticated;

COMMIT;

-- =============================================================================
-- DOKUMENTASI RISIKO DAN STATUS IMPLEMENTASI
-- =============================================================================
--
-- 1. activities_update_own policy
--    Status: MASIH ADA, BELUM TERTUTUP — RISIKO AKTIF
--    Risiko: User authenticated bisa UPDATE status activity miliknya ke nilai
--            apa pun yang valid CHECK constraint via Supabase client, bypass
--            validasi transisi di RPC functions.
--    Contoh serangan: User bisa mengubah status dari 'menunggu' langsung ke
--            'selesai' tanpa melalui alur accept → berlangsung → selesai.
--    Operasi JS yang masih menggunakan direct UPDATE (bypass RPC):
--            - cancelActivitySupabase() di src/lib/data.js
--            - startActivitySupabase() di src/lib/data.js
--            - completeActivitySupabase() di src/lib/data.js (akan digantikan oleh complete_activity RPC)
--            - saveRatingSupabase() di src/lib/data.js (akan digantikan oleh save_activity_rating RPC)
--    Mitigasi: Pindahkan SEMUA operasi ke RPC, lalu hapus policy ini di
--              migration terpisah setelah semua integrasi JS selesai.
--    JANGAN menghapus policy ini sebelum semua operasi dipindahkan ke RPC,
--    karena akan merusak fitur yang masih menggunakan direct UPDATE.
--
-- 2. Retry 40P01 (deadlock_detected)
--    Status: BELUM TERSEDIA
--    Keterangan: Wrapper retry belum diimplementasikan di JavaScript.
--                Perlu dibuat dan diuji sebelum production.
--                Urutan locking yang konsisten mengurangi kemungkinan deadlock,
--                tetapi TIDAK menjamin deadlock mustahil terjadi.
--
-- 3. Idempotency timeout
--    Status: BELUM TERSEDIA
--    Keterangan: Mekanisme idempotency key belum ada. Jangan retry otomatis
--                setelah timeout tanpa konfirmasi hasil dari server.
--
-- 4. update_updated_at() EXECUTE rights
--    Status: BELUM DIAUDIT
--    Keterangan: Fungsi utility umum ini mungkin masih bisa dipanggil oleh PUBLIC.
--                Idealnya REVOKE, tapi tidak dilakukan di migration ini karena
--                digunakan secara luas. Tandai sebagai future work.
--
-- 5. Grant existing pada validate_activity_post_ownership()
--    Status: PERLU DIPERIKSA
--    Keterangan: Migration 002 tidak REVOKE. Mungkin ada GRANT manual di
--                Supabase dashboard. Query untuk memeriksa:
--                SELECT has_function_privilege('authenticated',
--                    'public.validate_activity_post_ownership()', 'EXECUTE')
--
-- 6. Partner SELECT access
--    Status: AMAN (hanya SELECT)
--    Keterangan: Policy activities_select_as_partner hanya memberi akses SELECT.
--                Tidak ada UPDATE/DELETE untuk partner. Policy permissive SELECT
--                digabungkan dengan OR, sehingga user bisa membaca activity jika
--                mereka adalah owner ATAU partner. Ini sesuai kebutuhan bisnis.
--
-- =============================================================================
