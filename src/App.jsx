import { useState, useRef, useEffect, useCallback } from "react";
import CaptureScreen from "./components/CaptureScreen";
import EditScreen from "./components/EditScreen";

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
  const [phase, setPhase] = useState("capture");
  const [capturedImage, setCapturedImage] = useState(null);
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
    setPhase("edit");
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setPhase("capture");
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
        />
      )}
    </div>
  );
}
