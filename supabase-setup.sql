-- ============================================
-- 찍고 긋고 말하기 — Supabase 초기 설정 SQL
-- Supabase Dashboard > SQL Editor 에서 실행하이소
-- ============================================

-- 1. Storage 버킷 생성 (public 공개 버킷)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', true)
ON CONFLICT DO NOTHING;

-- 2. Storage 정책 — 익명 업로드 허용
CREATE POLICY "Allow anonymous uploads"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "Allow public reads"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'reports');

-- 3. field_reports 테이블 생성
CREATE TABLE IF NOT EXISTS field_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_url    TEXT NOT NULL,
  transcript   TEXT DEFAULT '',
  raw_content  TEXT DEFAULT '',   -- Make.com 1공정 구글 시트 저장용 필드
  sent_to_make BOOLEAN DEFAULT FALSE
);

-- 4. 익명 Insert 허용 (RLS 정책)
ALTER TABLE field_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert"
  ON field_reports
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anonymous select"
  ON field_reports
  FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- 설정 완료! 이제 앱에서 .env 파일에
-- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
-- 를 입력하면 됩니더.
-- ============================================
