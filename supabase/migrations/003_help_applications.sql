-- =============================================================================
-- Migration 003: Tabel help_applications + RPC submit_help_application
-- =============================================================================
-- Membuat sistem pengajuan bantuan untuk postingan NeedHelp.
-- Pengajuan disimpan di tabel terpisah dari activities.
-- Status aktivitas hanya berubah setelah pengajuan diterima (via migration 004).
--
-- PRASYARAT:
-- - Migration 001 (public read access) sudah dijalankan
-- - Migration 002 (activities table) sudah dijalankan
-- - Tabel posts, profiles, activities sudah ada dengan struktur yang benar
-- - Fungsi update_updated_at() sudah tersedia
--
-- CATATAN KEAMANAN:
-- - Tidak ada policy INSERT/UPDATE/DELETE pada help_applications.
--   Semua operasi dilakukan via RPC functions.
-- - Trigger validate_application_update mencegah modifikasi kolom selain status.
-- - REVOKE EXECUTE FROM PUBLIC pada semua fungsi baru.
-- =============================================================================

BEGIN;

-- =========================================================
-- 1. Prasyarat: Verifikasi skema existing
-- =========================================================

DO $$
BEGIN
    -- Tabel posts harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'posts'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.posts tidak ditemukan. Jalankan schema.sql terlebih dahulu.';
    END IF;

    -- Kolom posts.author_id harus UUID NOT NULL
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'posts'
          AND column_name = 'author_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom posts.author_id (UUID NOT NULL) tidak ditemukan.';
    END IF;

    -- Tabel profiles harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.profiles tidak ditemukan. Jalankan schema.sql terlebih dahulu.';
    END IF;

    -- Kolom profiles.name harus ada
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'name'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom profiles.name tidak ditemukan.';
    END IF;

    -- Tabel activities harus ada (diperlukan oleh submit_help_application)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'activities'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Tabel public.activities tidak ditemukan. Jalankan migration 002 terlebih dahulu.';
    END IF;

    -- Kolom activities.post_id (UUID NOT NULL)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'activities'
          AND column_name = 'post_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.post_id (UUID NOT NULL) tidak ditemukan.';
    END IF;

    -- Kolom activities.user_id (UUID NOT NULL)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'activities'
          AND column_name = 'user_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.user_id (UUID NOT NULL) tidak ditemukan.';
    END IF;

    -- Kolom activities.status (TEXT NOT NULL)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'activities'
          AND column_name = 'status'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Kolom activities.status (TEXT NOT NULL) tidak ditemukan.';
    END IF;

    -- Fungsi update_updated_at() harus ada
    IF to_regprocedure('public.update_updated_at()') IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: Fungsi public.update_updated_at() tidak ditemukan. Periksa schema.sql.';
    END IF;
END
$$;

-- =========================================================
-- 2. Tabel help_applications
-- =========================================================

CREATE TABLE IF NOT EXISTS public.help_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL DEFAULT '',
    contact_info TEXT NOT NULL DEFAULT '',
    available_time TEXT NOT NULL DEFAULT '',
    extra_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 3. Foreign Key: post_id → posts(id) ON DELETE RESTRICT
-- =========================================================
-- Idempoten: periksa apakah FK yang benar sudah ada sebelum menambah/mengubah.
-- Jika ditemukan FK yang tidak sesuai, migration dihentikan dengan diagnostik lengkap.
-- FK tidak dihapus secara otomatis untuk mencegah kehilangan constraint yang penting.

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

        -- FK komposit: hentikan migration dengan diagnostik
        IF v_nkeys > 1 THEN
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: Ditemukan FK komposit "%" pada help_applications yang melibatkan post_id dengan % kolom. Migration tidak dapat menangani FK komposit secara otomatis. Tindakan manual diperlukan: periksa constraint ini dan tentukan apakah perlu dipertahankan, diubah, atau dihapus.', v_rec.conname, v_nkeys;
        END IF;

        -- Verifikasi pasangan kolom berdasarkan posisi
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
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada help_applications menunjuk ke public.posts(id) dengan aturan ON DELETE %, diharapkan RESTRICT. Tindakan manual diperlukan: ubah constraint ini menjadi ON DELETE RESTRICT atau konfirmasi bahwa aturan saat ini memang diinginkan.', v_rec.conname, v_deltype_text;
        ELSE
            -- FK tidak sesuai target (tabel/kolom berbeda)
            -- Hentikan migration dengan diagnostik lengkap
            RAISE EXCEPTION 'MIGRASI DIHENTIKAN: FK "%" pada help_applications tidak sesuai kriteria. Detail: kolom_lokal=%, tabel_referensi=%.%, kolom_referensi=%, on_delete=%. Diharapkan: post_id → public.posts(id) ON DELETE RESTRICT. Tindakan manual diperlukan: periksa constraint ini dan tentukan tindakan yang tepat.', v_rec.conname, v_local_col, v_rec.ref_schema, v_rec.ref_table, v_ref_col, v_deltype_text;
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
-- 4. Indeks
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_help_applications_post_id
    ON public.help_applications(post_id);

CREATE INDEX IF NOT EXISTS idx_help_applications_applicant_id
    ON public.help_applications(applicant_id);

CREATE INDEX IF NOT EXISTS idx_help_applications_status
    ON public.help_applications(status);

-- Partial unique index: satu user hanya boleh punya 1 pengajuan pending/accepted per post
CREATE UNIQUE INDEX IF NOT EXISTS uq_help_applications_pending_accepted
    ON public.help_applications(applicant_id, post_id)
    WHERE status IN ('pending', 'accepted');

-- =========================================================
-- 5. Trigger updated_at
-- =========================================================

DROP TRIGGER IF EXISTS help_applications_updated_at
    ON public.help_applications;

CREATE TRIGGER help_applications_updated_at
    BEFORE UPDATE ON public.help_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- =========================================================
-- 6. Trigger validate_application_update
-- Mencegah modifikasi kolom selain status dan updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION public.validate_application_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Kolom yang boleh berubah: status, updated_at
    -- Semua kolom lain harus tetap sama
    IF OLD.id IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'Kolom id tidak dapat diubah.';
    END IF;
    IF OLD.post_id IS DISTINCT FROM NEW.post_id THEN
        RAISE EXCEPTION 'Kolom post_id tidak dapat diubah.';
    END IF;
    IF OLD.applicant_id IS DISTINCT FROM NEW.applicant_id THEN
        RAISE EXCEPTION 'Kolom applicant_id tidak dapat diubah.';
    END IF;
    IF OLD.message IS DISTINCT FROM NEW.message THEN
        RAISE EXCEPTION 'Kolom message tidak dapat diubah.';
    END IF;
    IF OLD.contact_info IS DISTINCT FROM NEW.contact_info THEN
        RAISE EXCEPTION 'Kolom contact_info tidak dapat diubah.';
    END IF;
    IF OLD.available_time IS DISTINCT FROM NEW.available_time THEN
        RAISE EXCEPTION 'Kolom available_time tidak dapat diubah.';
    END IF;
    IF OLD.extra_note IS DISTINCT FROM NEW.extra_note THEN
        RAISE EXCEPTION 'Kolom extra_note tidak dapat diubah.';
    END IF;
    IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'Kolom created_at tidak dapat diubah.';
    END IF;

    RETURN NEW;
END;
$$;

-- REVOKE EXECUTE FROM PUBLIC: trigger function tidak boleh dipanggil sebagai RPC
REVOKE EXECUTE ON FUNCTION public.validate_application_update() FROM PUBLIC;

DROP TRIGGER IF EXISTS help_applications_validate_update
    ON public.help_applications;

CREATE TRIGGER help_applications_validate_update
    BEFORE UPDATE ON public.help_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_application_update();

-- =========================================================
-- 7. Row Level Security
-- =========================================================

ALTER TABLE public.help_applications ENABLE ROW LEVEL SECURITY;

-- SELECT: pelamar bisa melihat pengajuannya sendiri
DROP POLICY IF EXISTS help_applications_select_own
    ON public.help_applications;

CREATE POLICY help_applications_select_own
    ON public.help_applications
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = applicant_id);

-- SELECT: pemilik postingan bisa melihat semua pengajuan untuk postingannya
DROP POLICY IF EXISTS help_applications_select_post_owner
    ON public.help_applications;

CREATE POLICY help_applications_select_post_owner
    ON public.help_applications
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts p
            WHERE p.id = help_applications.post_id
              AND p.author_id = (SELECT auth.uid())
        )
    );

-- TIDAK ADA policy INSERT, UPDATE, DELETE.
-- Semua operasi dilakukan via RPC functions.

-- =========================================================
-- 8. RPC: submit_help_application
-- =========================================================

CREATE OR REPLACE FUNCTION public.submit_help_application(
    p_post_id UUID,
    p_message TEXT DEFAULT '',
    p_contact_info TEXT DEFAULT '',
    p_available_time TEXT DEFAULT '',
    p_extra_note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_applicant_id UUID;
    v_post_author UUID;
    v_activity_status TEXT;
    v_has_accepted BOOLEAN;
    v_new_id UUID;
BEGIN
    -- Validasi input
    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'post_id wajib diisi.';
    END IF;

    -- Ambil ID pelamar dari session
    v_applicant_id := (SELECT auth.uid());
    IF v_applicant_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    -- TAHAP 1: Lock post untuk mencegah race condition
    SELECT author_id INTO v_post_author
    FROM public.posts
    WHERE id = p_post_id
    FOR UPDATE;

    IF v_post_author IS NULL THEN
        RAISE EXCEPTION 'Postingan tidak ditemukan.';
    END IF;

    -- Pelamar tidak boleh mengajukan ke postingannya sendiri
    IF v_post_author = v_applicant_id THEN
        RAISE EXCEPTION 'Anda tidak dapat mengajukan bantuan ke postingan sendiri.';
    END IF;

    -- TAHAP 2: Lock dan cek status aktivitas (jika ada)
    -- Lock activity untuk mencegah race condition dengan accept_help_application
    SELECT a.status INTO v_activity_status
    FROM public.activities a
    WHERE a.post_id = p_post_id
      AND a.user_id = v_post_author
    FOR UPDATE;

    -- Jika aktivitas sudah berlangsung/selesai/batal, tolak
    IF v_activity_status IN ('berlangsung', 'selesai', 'batal') THEN
        IF v_activity_status = 'batal' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah dibatalkan. Buat postingan baru jika masih membutuhkan bantuan.';
        ELSIF v_activity_status = 'selesai' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah selesai. Pengajuan tidak dapat dilakukan.';
        ELSE
            RAISE EXCEPTION 'Aktivitas ini sudah berlangsung. Pengajuan tidak dapat dilakukan.';
        END IF;
    END IF;

    -- TAHAP 3: Cek apakah sudah ada pengajuan yang diterima
    SELECT EXISTS (
        SELECT 1
        FROM public.help_applications ha
        WHERE ha.post_id = p_post_id
          AND ha.status = 'accepted'
    ) INTO v_has_accepted;

    IF v_has_accepted THEN
        RAISE EXCEPTION 'Sudah ada pengajuan yang diterima untuk postingan ini.';
    END IF;

    -- TAHAP 4: Cek duplikat (pending atau accepted dari pelamar yang sama)
    -- Partial unique index akan menangani ini, tapi kita beri pesan error yang jelas
    IF EXISTS (
        SELECT 1
        FROM public.help_applications ha
        WHERE ha.post_id = p_post_id
          AND ha.applicant_id = v_applicant_id
          AND ha.status IN ('pending', 'accepted')
    ) THEN
        RAISE EXCEPTION 'Anda sudah memiliki pengajuan pending atau diterima untuk postingan ini.';
    END IF;

    -- TAHAP 5: Insert pengajuan baru
    INSERT INTO public.help_applications (
        post_id,
        applicant_id,
        message,
        contact_info,
        available_time,
        extra_note,
        status
    ) VALUES (
        p_post_id,
        v_applicant_id,
        COALESCE(p_message, ''),
        COALESCE(p_contact_info, ''),
        COALESCE(p_available_time, ''),
        COALESCE(p_extra_note, ''),
        'pending'
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Keamanan: revoke dari public, grant ke authenticated
REVOKE EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
