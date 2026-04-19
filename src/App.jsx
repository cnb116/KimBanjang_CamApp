import { useState, useRef, useEffect, useCallback } from "react";
import CaptureScreen from "./components/CaptureScreen";
import EditScreen from "./components/EditScreen";
import { uploadReport } from "./lib/supabase";

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

export default function App() {
  const [phase, setPhase] = useState("capture"); // "capture" | "edit"
  const [capturedImage, setCapturedImage] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // { ok, message }
  const wakeLockRef = useRef(null);

  useEffect(() => {
    requestWakeLock().then((lock) => {
      wakeLockRef.current = lock;
    });
    // 화면 재활성 시 Wakelock 재요청
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        requestWakeLock().then((lock) => {
          wakeLockRef.current = lock;
        });
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

  const handleSend = useCallback(async ({ compositeImageDataUrl, transcript }) => {
    setIsSending(true);
    setSendResult(null);
    try {
      const result = await uploadReport({ compositeImageDataUrl, transcript });
      setSendResult({ ok: true, message: "전송 완료됐심더!" });
    } catch (err) {
      console.error("전송 실패:", err);
      setSendResult({ ok: false, message: "전송 실패. 다시 시도하이소." });
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
