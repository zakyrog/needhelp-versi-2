-- =============================================================================
-- Migration 016: Persetujuan WhatsApp dua pihak + ulasan timbal balik
-- =============================================================================
-- 1. Nomor WhatsApp tidak lagi disimpan pada pengajuan bantuan.
-- 2. Setiap peserta percakapan membagikan nomornya sendiri lewat RPC.
-- 3. Nomor lawan bicara baru dikembalikan bila KEDUA pihak sudah setuju.
-- 4. Pemilik postingan dan partner dapat saling memberi satu ulasan setelah
--    aktivitas selesai.
-- =============================================================================

BEGIN;

DO $$
BEGIN
    IF to_regclass('public.conversations') IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: public.conversations belum ada. Jalankan migration 012.';
    END IF;
    IF to_regclass('public.activities') IS NULL THEN
        RAISE EXCEPTION 'PRASYARAT GAGAL: public.activities belum ada. Jalankan migration 002.';
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Kontak WhatsApp dengan persetujuan dua pihak
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_contact_shares (
    conversation_id UUID NOT NULL
        REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    whatsapp_number TEXT NOT NULL
        CHECK (whatsapp_number ~ '^62[0-9]{9,13}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_contact_shares ENABLE ROW LEVEL SECURITY;

-- Nomor tidak boleh dibaca langsung dari REST. Semua pembacaan melalui RPC yang
-- hanya membuka nomor pasangan setelah dua baris persetujuan tersedia.
REVOKE ALL ON TABLE public.conversation_contact_shares FROM PUBLIC;
REVOKE ALL ON TABLE public.conversation_contact_shares FROM anon;
REVOKE ALL ON TABLE public.conversation_contact_shares FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_whatsapp_share_status(
    p_conversation_id UUID
)
RETURNS TABLE (
    my_consented BOOLEAN,
    partner_consented BOOLEAN,
    partner_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := (SELECT auth.uid());
    v_partner UUID;
    v_my_phone TEXT;
    v_partner_phone TEXT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    SELECT CASE
        WHEN c.owner_id = v_caller THEN c.partner_id
        WHEN c.partner_id = v_caller THEN c.owner_id
        ELSE NULL
    END
    INTO v_partner
    FROM public.conversations c
    WHERE c.id = p_conversation_id;

    IF v_partner IS NULL THEN
        RAISE EXCEPTION 'Anda bukan peserta percakapan ini.';
    END IF;

    SELECT s.whatsapp_number INTO v_my_phone
    FROM public.conversation_contact_shares s
    WHERE s.conversation_id = p_conversation_id
      AND s.user_id = v_caller;

    SELECT s.whatsapp_number INTO v_partner_phone
    FROM public.conversation_contact_shares s
    WHERE s.conversation_id = p_conversation_id
      AND s.user_id = v_partner;

    RETURN QUERY SELECT
        v_my_phone IS NOT NULL,
        v_partner_phone IS NOT NULL,
        CASE
            WHEN v_my_phone IS NOT NULL AND v_partner_phone IS NOT NULL
                THEN v_partner_phone
            ELSE NULL
        END;
END;
$$;

CREATE OR REPLACE FUNCTION public.share_whatsapp_contact(
    p_conversation_id UUID,
    p_whatsapp_number TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := (SELECT auth.uid());
    v_phone TEXT;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = p_conversation_id
          AND (c.owner_id = v_caller OR c.partner_id = v_caller)
    ) THEN
        RAISE EXCEPTION 'Anda bukan peserta percakapan ini.';
    END IF;

    v_phone := regexp_replace(COALESCE(p_whatsapp_number, ''), '[^0-9+]', '', 'g');
    IF v_phone LIKE '+62%' THEN
        v_phone := substring(v_phone FROM 2);
    ELSIF v_phone LIKE '08%' THEN
        v_phone := '62' || substring(v_phone FROM 2);
    END IF;

    IF v_phone !~ '^62[0-9]{9,13}$' THEN
        RAISE EXCEPTION 'Format nomor WhatsApp tidak valid.';
    END IF;

    INSERT INTO public.conversation_contact_shares (
        conversation_id, user_id, whatsapp_number
    ) VALUES (
        p_conversation_id, v_caller, v_phone
    )
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
        whatsapp_number = EXCLUDED.whatsapp_number,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_whatsapp_contact(
    p_conversation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller UUID := (SELECT auth.uid());
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;

    DELETE FROM public.conversation_contact_shares
    WHERE conversation_id = p_conversation_id
      AND user_id = v_caller;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_whatsapp_share_status(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.share_whatsapp_contact(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_whatsapp_contact(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_share_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_whatsapp_contact(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_whatsapp_contact(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Ulasan timbal balik
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL
        REFERENCES public.activities(id) ON DELETE RESTRICT,
    reviewer_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT activity_reviews_distinct_people CHECK (reviewer_id <> reviewee_id),
    CONSTRAINT activity_reviews_one_per_reviewer UNIQUE (activity_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_reviews_reviewee
    ON public.activity_reviews(reviewee_id, created_at DESC);

ALTER TABLE public.activity_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_reviews_select_participants
    ON public.activity_reviews;
CREATE POLICY activity_reviews_select_participants
    ON public.activity_reviews
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.activities a
            WHERE a.id = activity_id
              AND (a.user_id = (SELECT auth.uid()) OR a.partner_id = (SELECT auth.uid()))
        )
    );

-- Tidak ada policy INSERT/UPDATE/DELETE. Penulisan hanya lewat RPC.

-- Pertahankan ulasan lama milik pembuat postingan.
INSERT INTO public.activity_reviews (
    activity_id, reviewer_id, reviewee_id, rating, comment, created_at
)
SELECT
    a.id, a.user_id, a.partner_id, a.review_rating,
    COALESCE(a.review_comment, ''), COALESCE(a.updated_at, now())
FROM public.activities a
WHERE a.review_rating IS NOT NULL
  AND a.partner_id IS NOT NULL
  AND a.user_id <> a.partner_id
ON CONFLICT (activity_id, reviewer_id) DO NOTHING;

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
    v_caller UUID := (SELECT auth.uid());
    v_activity public.activities%ROWTYPE;
    v_reviewee UUID;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Anda harus masuk terlebih dahulu.';
    END IF;
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating harus berupa bilangan bulat 1 sampai 5.';
    END IF;
    IF char_length(COALESCE(p_comment, '')) > 500 THEN
        RAISE EXCEPTION 'Ulasan maksimal 500 karakter.';
    END IF;

    SELECT a.* INTO v_activity
    FROM public.activities a
    WHERE a.post_id = p_post_id
    FOR UPDATE;

    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION 'Aktivitas tidak ditemukan untuk postingan ini.';
    END IF;
    IF v_activity.status <> 'selesai' THEN
        RAISE EXCEPTION 'Aktivitas belum selesai. Selesaikan aktivitas terlebih dahulu sebelum memberi ulasan.';
    END IF;
    IF v_activity.partner_id IS NULL THEN
        RAISE EXCEPTION 'Aktivitas ini belum memiliki partner. Tidak dapat memberi ulasan.';
    END IF;

    IF v_caller = v_activity.user_id THEN
        v_reviewee := v_activity.partner_id;
    ELSIF v_caller = v_activity.partner_id THEN
        v_reviewee := v_activity.user_id;
    ELSE
        RAISE EXCEPTION 'Anda bukan peserta aktivitas ini.';
    END IF;

    INSERT INTO public.activity_reviews (
        activity_id, reviewer_id, reviewee_id, rating, comment
    ) VALUES (
        v_activity.id, v_caller, v_reviewee, p_rating, COALESCE(trim(p_comment), '')
    );

    -- Kompatibilitas untuk kode lama: ulasan pembuat postingan tetap dicerminkan
    -- ke kolom review_* pada activities.
    IF v_caller = v_activity.user_id THEN
        UPDATE public.activities
        SET review_rating = p_rating,
            review_comment = COALESCE(trim(p_comment), '')
        WHERE id = v_activity.id;
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Anda sudah memberikan ulasan untuk aktivitas ini.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_activity_rating(UUID, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_activity_rating(UUID, SMALLINT, TEXT) TO authenticated;

COMMIT;
