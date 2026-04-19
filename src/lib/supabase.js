import { createClient } from "@supabase/supabase-js";

// ——— Supabase 클라이언트 초기화 ———
// .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 세팅 필요
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * dataURL을 Blob으로 변환
 */
function dataURLToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

/**
 * 현장 보고서 전송
 * @param {Object} params
 * @param {string} params.compositeImageDataUrl - 마킹 포함 이미지 DataURL
 * @param {string} params.transcript - STT 변환 텍스트
 * @returns {Promise<{ imageUrl: string, dbRecord: object }>}
 */
export async function uploadReport({ compositeImageDataUrl, transcript }) {
  // ——— 1단계: 이미지 Supabase Storage 업로드 ———
  const blob = dataURLToBlob(compositeImageDataUrl);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `report_${timestamp}.jpg`;
  const filePath = `field-reports/${fileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("reports") // 버킷 이름: "reports"
    .upload(filePath, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`이미지 업로드 실패: ${uploadError.message}`);
  }

  // ——— Public URL 추출 ———
  const { data: urlData } = supabase.storage
    .from("reports")
    .getPublicUrl(filePath);
  const imageUrl = urlData?.publicUrl || "";

  // ——— 2단계: DB 레코드 Insert ———
  // 테이블: field_reports (id, created_at, image_url, transcript, raw_content)
  const record = {
    image_url: imageUrl,
    transcript: transcript || "",
    raw_content: transcript || "", // Make.com 1공정 구글 시트 저장용
    created_at: new Date().toISOString(),
  };

  const { data: dbData, error: dbError } = await supabase
    .from("field_reports") // 테이블 이름: "field_reports"
    .insert([record])
    .select()
    .single();

  if (dbError) {
    throw new Error(`DB 저장 실패: ${dbError.message}`);
  }

  return { imageUrl, dbRecord: dbData };
}

/**
 * Make.com Webhook 전송 (Supabase 없이 직접 전송할 경우 대체 사용)
 * 전송 API 구조만 뚫어둠 — 프론트엔드 기획서 명시 사항
 * @param {string} webhookUrl - Make.com Webhook URL
 * @param {Object} payload - { imageBase64, transcript, timestamp }
 */
export async function sendToMakeWebhook(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: payload.imageBase64,
      transcript: payload.transcript,
      raw_content: payload.transcript,
      timestamp: payload.timestamp || new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Make.com 전송 실패: ${response.status}`);
  }
  return response.json();
}
