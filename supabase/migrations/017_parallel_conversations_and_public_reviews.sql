-- =============================================================================
-- Migration 017: percakapan kandidat paralel + reputasi publik
-- =============================================================================
-- - Pengajuan baru tetap boleh masuk saat satu partner sudah diterima atau
--   aktivitas sebelumnya sudah selesai.
-- - Menerima satu kandidat tidak lagi menolak kandidat pending lainnya.
-- - Kandidat pending tetap dapat memakai chat NeedHelp.
-- - Nomor WhatsApp tetap memakai persetujuan dua pihak dari migration 016.
-- - Rating/ulasan dapat dibaca sebagai reputasi publik tanpa membuka email atau
--   nomor kontak.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.help_applications') IS NULL
     OR to_regclass('public.activities') IS NULL
     OR to_regclass('public.activity_reviews') IS NULL
     OR to_regclass('public.conversations') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'PRASYARAT GAGAL: jalankan migration 003, 012, 015, dan 016 terlebih dahulu.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'avatar_key'
  ) THEN
    RAISE EXCEPTION 'PRASYARAT GAGAL: kolom profiles.avatar_key belum ada. Jalankan migration 015 terlebih dahulu.';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Pengajuan paralel
-- -----------------------------------------------------------------------------

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
        -- Status berlangsung/selesai tetap menerima kandidat dan pesan paralel.
        -- Selesai adalah penanda pernah match, bukan penutupan postingan.
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

    RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_help_application(UUID, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;

-- Menerima satu partner resmi tanpa menolak kandidat lain. Kandidat lain tetap
-- pending dan percakapannya tetap aktif. Satu post tetap hanya memiliki satu
-- partner resmi karena activities menyimpan satu partner_id.
CREATE OR REPLACE FUNCTION public.accept_help_application(
    p_application_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := (SELECT auth.uid());
    v_post_id UUID;
    v_post_author UUID;
    v_applicant UUID;
    v_app_status TEXT;
    v_activity public.activities%ROWTYPE;
BEGIN
    IF p_application_id IS NULL THEN
        RAISE EXCEPTION 'application_id wajib diisi.';
    END IF;
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    SELECT ha.post_id, ha.applicant_id, ha.status
    INTO v_post_id, v_applicant, v_app_status
    FROM public.help_applications ha
    WHERE ha.id = p_application_id
    FOR UPDATE;

    IF v_post_id IS NULL THEN
        RAISE EXCEPTION 'Pengajuan tidak ditemukan.';
    END IF;

    SELECT p.author_id INTO v_post_author
    FROM public.posts p
    WHERE p.id = v_post_id
    FOR UPDATE;

    IF v_post_author IS NULL THEN
        RAISE EXCEPTION 'Postingan tidak ditemukan.';
    END IF;
    IF v_post_author <> v_caller THEN
        RAISE EXCEPTION 'Hanya pemilik postingan yang dapat menerima pengajuan.';
    END IF;
    IF v_app_status <> 'pending' THEN
        IF v_app_status = 'accepted' THEN
            RAISE EXCEPTION 'Pengajuan ini sudah diterima sebelumnya.';
        ELSIF v_app_status = 'rejected' THEN
            RAISE EXCEPTION 'Pengajuan ini sudah ditolak.';
        ELSIF v_app_status = 'withdrawn' THEN
            RAISE EXCEPTION 'Pengajuan ini sudah ditarik oleh pelamar.';
        END IF;
        RAISE EXCEPTION 'Status pengajuan ini tidak dapat diterima.';
    END IF;

    SELECT a.* INTO v_activity
    FROM public.activities a
    WHERE a.post_id = v_post_id
      AND a.user_id = v_post_author
    FOR UPDATE;

    IF v_activity.id IS NOT NULL THEN
        IF v_activity.status = 'batal' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah dibatalkan.';
        ELSIF v_activity.status = 'selesai' THEN
            RAISE EXCEPTION 'Aktivitas ini sudah selesai.';
        ELSIF v_activity.status = 'berlangsung' AND v_activity.partner_id IS NOT NULL THEN
            RAISE EXCEPTION 'Postingan ini sudah memiliki partner resmi. Kandidat lain tetap dapat melanjutkan chat.';
        END IF;
    END IF;

    -- Proteksi tambahan bila data lama memiliki accepted tetapi aktivitas belum
    -- sinkron. Lock berurutan mencegah dua penerimaan bersamaan.
    PERFORM ha.id
    FROM public.help_applications ha
    WHERE ha.post_id = v_post_id
      AND ha.status = 'accepted'
      AND ha.id <> p_application_id
    ORDER BY ha.id
    FOR UPDATE;

    IF FOUND THEN
        RAISE EXCEPTION 'Postingan ini sudah memiliki partner resmi. Kandidat lain tetap dapat melanjutkan chat.';
    END IF;

    UPDATE public.help_applications
    SET status = 'accepted'
    WHERE id = p_application_id;

    IF v_activity.id IS NULL THEN
        INSERT INTO public.activities (
            post_id, user_id, status, partner_id, partner_name, note
        ) VALUES (
            v_post_id,
            v_post_author,
            'berlangsung',
            v_applicant,
            COALESCE((SELECT p.name FROM public.profiles p WHERE p.id = v_applicant), ''),
            'Aktivitas dimulai setelah pengajuan diterima.'
        );
    ELSE
        UPDATE public.activities
        SET status = 'berlangsung',
            partner_id = v_applicant,
            partner_name = COALESCE(
                (SELECT p.name FROM public.profiles p WHERE p.id = v_applicant),
                ''
            )
        WHERE id = v_activity.id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_help_application(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_help_application(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Reputasi publik
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    bio TEXT,
    avatar_url TEXT,
    initial TEXT,
    avatar_class TEXT,
    avatar_key TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        p.id,
        COALESCE(p.name, 'Pengguna NeedHelp'),
        COALESCE(p.bio, ''),
        p.avatar_url,
        COALESCE(p.initial, 'N'),
        COALESCE(p.avatar_class, ''),
        p.avatar_key
    FROM public.profiles p
    WHERE p.id = p_user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_profile_reviews(p_user_id UUID)
RETURNS TABLE (
    review_id UUID,
    rating SMALLINT,
    comment TEXT,
    created_at TIMESTAMPTZ,
    reviewer_id UUID,
    reviewer_name TEXT,
    reviewer_initial TEXT,
    reviewer_avatar_key TEXT,
    post_id UUID,
    post_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.reviewer_id,
        COALESCE(reviewer.name, 'Pengguna NeedHelp'),
        COALESCE(reviewer.initial, 'N'),
        reviewer.avatar_key,
        p.id,
        p.title
    FROM public.activity_reviews r
    JOIN public.activities a ON a.id = r.activity_id
    JOIN public.posts p ON p.id = a.post_id
    LEFT JOIN public.profiles reviewer ON reviewer.id = r.reviewer_id
    WHERE r.reviewee_id = p_user_id
    ORDER BY r.created_at DESC, r.id DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_profile_reviews(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_profile_reviews(UUID) TO anon, authenticated;

COMMIT;
