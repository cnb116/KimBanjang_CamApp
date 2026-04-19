import { useState, useRef, useEffect, useCallback } from "react";
import CaptureScreen from "./components/CaptureScreen";
import EditScreen from "./components/EditScreen";
// ※ Supabase 철거 완료 — import 없음. 나중에 필요하면 lib/supabase.js 재연결하이소.

// 현장 철학: Wakelock — 장갑 낀 손으로 화면 다시 켜는 불편함 금지
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      const lock = await navigator.wakeLock.request("screen");
      return lock;
    }
  } catch (err) {
    console.warn("Wakelock 불가:", err);
  }
  return null;
}

// DataURL → File 객체 변환 (Share API용)
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return new File([buffer], filename, { type: mime });
}

// 파일명 생성: 현장보고서_YYYY-MM-DD_HH-MM.jpg
function makeFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `현장보고서_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.jpg`;
}

export default function App() {
  const [phase, setPhase] = useState("capture");
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { ok, message }
  const wakeLockRef = useRef(null);

  useEffect(() => {
    requestWakeLock().then((lock) => { wakeLockRef.current = lock; });
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        requestWakeLock().then((lock) => { wakeLockRef.current = lock; });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release?.();
    };
  }, []);

  const handleCapture = useCallback((imageDataUrl) => {
    setCapturedImage(imageDataUrl);
    setSendResult(null);
    setPhase("edit");
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setSendResult(null);
    setPhase("capture");
  }, []);

  // ── 핵심 전송 로직: Share API 우선 → 폴백으로 직접 다운로드 ──
  const handleSend = useCallback(async ({ compositeImageDataUrl, transcript }) => {
    setIsSending(true);
    setSendResult(null);
    const filename = makeFilename();

    try {
      const file = dataUrlToFile(compositeImageDataUrl, filename);

      // 1순위: 모바일 Share API (카톡, 메일, 메시지 등)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "현장 보고서",
          text: transcript || "",
        });
        setSendResult({ ok: true, message: "공유 완료됐심더!" });
      } else {
        // 2순위: PC/구형 브라우저 — <a> 태그 다운로드 폴백
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setSendResult({ ok: true, message: "다운로드 완료됐심더!" });
      }
    } catch (err) {
      // 사용자가 공유 취소한 경우(AbortError)는 에러 아님
      if (err?.name === "AbortError") {
        setSendResult(null);
      } else {
        console.error("전송 실패:", err);
        setSendResult({ ok: false, message: "전송 실패. 다시 시도하이소." });
      }
    } finally {
      setIsSending(false);
    }
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {phase === "capture" && (
        <CaptureScreen onCapture={handleCapture} />
      )}
      {phase === "edit" && capturedImage && (
        <EditScreen
          imageDataUrl={capturedImage}
          onRetake={handleRetake}
          onSend={handleSend}
          isSending={isSending}
          sendResult={sendResult}
        />
      )}
    </div>
  );
}
