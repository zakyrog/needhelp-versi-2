-- =============================================================================
-- Migration 018: ruang chat langsung dibuat saat pengajuan dikirim
-- =============================================================================
-- Pengajuan tetap berstatus pending dan tidak otomatis diterima. Migration ini
-- hanya membuat conversation milik pemilik post + pengaju dalam transaksi yang
-- sama. Persetujuan WhatsApp dari migration 016 tidak diubah.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.help_applications') IS NULL
     OR to_regclass('public.conversations') IS NULL
     OR to_regclass('public.posts') IS NULL
     OR to_regclass('public.activities') IS NULL THEN
    RAISE EXCEPTION 'PRASYARAT GAGAL: jalankan migration 003, 012, dan 017 terlebih dahulu.';
  END IF;
END
$$;

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
    v_applicant_id UUID := (SELECT auth.uid());
    v_post_author UUID;
    v_activity_count BIGINT;
    v_activity_status TEXT;
    v_new_id UUID;
BEGIN
    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'post_id wajib diisi.';
    END IF;
    IF v_applicant_id IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    SELECT author_id INTO v_post_author
    FROM public.posts
    WHERE id = p_post_id
    FOR UPDATE;

    IF v_post_author IS NULL THEN
        RAISE EXCEPTION 'Postingan tidak ditemukan.';
    END IF;
    IF v_post_author = v_applicant_id THEN
        RAISE EXCEPTION 'Anda tidak dapat mengajukan bantuan ke postingan sendiri.';
    END IF;

    PERFORM a.id
    FROM public.activities a
    WHERE a.post_id = p_post_id
      AND a.user_id = v_post_author
    FOR UPDATE;

    SELECT COUNT(*), MIN(a.status)
    INTO v_activity_count, v_activity_status
    FROM public.activities a
    WHERE a.post_id = p_post_id
      AND a.user_id = v_post_author;

    IF v_activity_count > 1 THEN
        RAISE EXCEPTION 'Pengajuan ditolak: ditemukan lebih dari satu aktivitas untuk postingan ini.';
    END IF;

    IF v_activity_count = 1 THEN
        IF v_activity_status = 'batal' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah dibatalkan. Buat postingan baru jika masih membutuhkan bantuan.';
        ELSIF v_activity_status NOT IN ('menunggu', 'berlangsung', 'selesai') THEN
            RAISE EXCEPTION 'Postingan tidak menerima pengajuan: status aktivitas "%" tidak dikenali.', v_activity_status;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.help_applications ha
        WHERE ha.post_id = p_post_id
          AND ha.applicant_id = v_applicant_id
          AND ha.status IN ('pending', 'accepted')
    ) THEN
        RAISE EXCEPTION 'Anda sudah memiliki pengajuan pending atau diterima untuk postingan ini.';
    END IF;

    INSERT INTO public.help_applications (
        post_id, applicant_id, message, contact_info,
        available_time, extra_note, status
    ) VALUES (
        p_post_id, v_applicant_id, COALESCE(p_message, ''), '',
        COALESCE(p_available_time, ''), COALESCE(p_extra_note, ''), 'pending'
    )
    RETURNING id INTO v_new_id;

    -- Conversation dibuat segera setelah pengajuan. Constraint unik dari
    -- migration 012 membuat operasi ini aman bila percakapan sudah pernah ada.
    INSERT INTO public.conversations (post_id, owner_id, partner_id)
    VALUES (p_post_id, v_post_author, v_applicant_id)
    ON CONFLICT (post_id, owner_id, partner_id) DO NOTHING;

    RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

COMMIT;
