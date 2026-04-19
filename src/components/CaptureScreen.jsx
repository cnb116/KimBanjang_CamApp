import { useEffect, useRef, useState, useCallback } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 아이콘 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ShutterIcon() {
  return (
    <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
      <circle cx="32" cy="32" r="28" stroke="#000" strokeWidth="5" />
      <circle cx="32" cy="32" r="18" fill="#000" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#FEE12B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}

function TorchIcon({ active }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
      <path
        d="M13 2L4.5 13.5H11L10 22L19.5 10H13L13 2Z"
        fill={active ? "#000" : "#666"}
        stroke={active ? "#000" : "#555"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [신규 1] 줌 훅 — WebRTC applyConstraints 기반 원터치 줌
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useZoom(streamRef) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.5 });
  const [zoomSupported, setZoomSupported] = useState(false);

  const detectZoomCapability = useCallback((stream) => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.();
    if (caps?.zoom) {
      const min = caps.zoom.min ?? 1;
      const max = caps.zoom.max ?? 1;
      const step = caps.zoom.step ?? 0.5;
      setZoomRange({ min, max, step });
      setZoomSupported(max > min);
      setZoomLevel(min);
    } else {
      setZoomSupported(false);
    }
  }, []);

  const applyZoom = useCallback(async (level) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomSupported) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: level }] });
      setZoomLevel(level);
    } catch (err) {
      console.warn("줌 적용 실패:", err);
    }
  }, [streamRef, zoomSupported]);

  const zoomIn = useCallback(() => {
    const next = Math.min(zoomRange.max, parseFloat((zoomLevel + zoomRange.step).toFixed(2)));
    applyZoom(next);
  }, [zoomLevel, zoomRange, applyZoom]);

  const zoomOut = useCallback(() => {
    const next = Math.max(zoomRange.min, parseFloat((zoomLevel - zoomRange.step).toFixed(2)));
    applyZoom(next);
  }, [zoomLevel, zoomRange, applyZoom]);

  return { zoomLevel, zoomRange, zoomSupported, detectZoomCapability, zoomIn, zoomOut };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [신규 2] 손전등 훅 — torch constraint 제어
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useTorch(streamRef) {
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const detectTorchCapability = useCallback((stream) => {
    const track = stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.();
    setTorchSupported(!!caps?.torch);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (err) {
      console.warn("손전등 전환 실패:", err);
    }
  }, [streamRef, torchOn, torchSupported]);

  const resetTorch = useCallback(() => setTorchOn(false), []);

  return { torchOn, torchSupported, detectTorchCapability, toggleTorch, resetTorch };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [신규 3] 워터마크 각인 함수
// 우측 하단 — 반투명 노란 배경(alpha 0.55) + 검은 글씨(alpha 1.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function stampWatermark(ctx, canvasW, canvasH, locationText) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const timestampLine = `${dateStr} ${timeStr}`;

  // 1920px 기준 34px 폰트
  const fontSize = Math.round(canvasW * 0.0175);
  const fontDecl = `bold ${fontSize}px 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;

  ctx.font = fontDecl;

  const PAD_X = Math.round(canvasW * 0.012);
  const PAD_Y = Math.round(canvasH * 0.016);
  const LINE_GAP = Math.round(fontSize * 0.38);
  const EDGE = Math.round(canvasW * 0.014); // 캔버스 끄트머리에서의 여백

  const lines = [timestampLine];
  if (locationText && locationText.trim()) lines.push(locationText.trim());

  const lineWidths = lines.map((l) => ctx.measureText(l).width);
  const maxLineW = Math.max(...lineWidths);
  const boxW = maxLineW + PAD_X * 2;
  const boxH = fontSize * lines.length + LINE_GAP * (lines.length - 1) + PAD_Y * 2;

  const boxX = canvasW - boxW - EDGE;
  const boxY = canvasH - boxH - EDGE;

  // ① 반투명 노란 배경 — alpha 0.55 (현장 구조물 희미하게 비치도록)
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#FEE12B";
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.restore();

  // ② 검은 글씨 — 완전 불투명, 가독성 최우선
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = "#000000";
  ctx.font = fontDecl;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    const ty = boxY + PAD_Y + i * (fontSize + LINE_GAP);
    ctx.fillText(line, boxX + PAD_X, ty);
  });
  ctx.restore();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// [신규 3-b] Geolocation → Nominatim 역지오코딩 훅
// 렌더 재트리거 없이 ref로 보관 — 셔터 시점에만 참조
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useGeolocation() {
  const locationTextRef = useRef("");

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ko`,
            { headers: { "User-Agent": "snap-draw-speak-app" } }
          );
          const data = await res.json();
          const addr = data.address || {};
          const parts = [
            addr.road || addr.pedestrian || addr.residential || "",
            addr.suburb || addr.village || addr.town || addr.city_district || "",
            addr.city || addr.county || "",
          ].filter(Boolean);
          locationTextRef.current = parts.slice(0, 3).join(" ") || data.display_name?.split(",")[0] || "";
        } catch {
          // 좌표 fallback
          locationTextRef.current = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        }
      },
      () => { locationTextRef.current = ""; },
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  return locationTextRef;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 CaptureScreen 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function CaptureScreen({ onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const { zoomLevel, zoomRange, zoomSupported, detectZoomCapability, zoomIn, zoomOut } = useZoom(streamRef);
  const { torchOn, torchSupported, detectTorchCapability, toggleTorch, resetTorch } = useTorch(streamRef);
  const locationTextRef = useGeolocation();

  const startCamera = useCallback(async (facing) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setReady(false);
    setError(null);
    resetTorch();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      detectZoomCapability(stream);
      detectTorchCapability(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (err) {
      setError("카메라 권한이 필요합니더. 브라우저 설정을 확인하이소.");
      console.error("카메라 오류:", err);
    }
  }, [detectZoomCapability, detectTorchCapability, resetTorch]);

  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [facingMode, startCamera]);

  // ━━━ 셔터: 기존 가로 크롭 엔진 100% 보존 + 워터마크 용접 ━━━
  const handleShutter = useCallback(() => {
    if (!videoRef.current || !ready) return;
    const video = videoRef.current;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // ── 기존 가로 강제 크롭 로직 (절대 건드리지 않음) ──
    const TARGET_RATIO = 16 / 9;
    let srcX = 0, srcY = 0, srcW = vw, srcH = vh;
    if (vh > vw) {
      srcW = vw;
      srcH = Math.round(vw / TARGET_RATIO);
      srcY = Math.round((vh - srcH) / 2);
    } else if (vw / vh > TARGET_RATIO + 0.01) {
      srcH = vh;
      srcW = Math.round(vh * TARGET_RATIO);
      srcX = Math.round((vw - srcW) / 2);
    }
    if (srcW <= 0 || srcH <= 0) { srcX = 0; srcY = 0; srcW = vw; srcH = vh; }
    const OUT_W = 1920;
    const OUT_H = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H);
    // ── 기존 크롭 로직 끝 ──

    // [신규 용접] 워터마크 각인 — 크롭 직후 캔버스 위에 덮어쓰기
    stampWatermark(ctx, OUT_W, OUT_H, locationTextRef.current);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onCapture(dataUrl);
  }, [ready, onCapture, locationTextRef]);

  const handleFlip = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  return (
    <div className="relative w-full h-full bg-black flex flex-col">

      {/* ─── 뷰파인더 ─── */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
        />

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <span className="text-yellow-300 text-xl font-bold tracking-widest animate-pulse">
              카메라 연결 중...
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-8 text-center gap-4">
            <span className="text-red-400 text-2xl font-bold">⚠ 카메라 오류</span>
            <span className="text-white text-lg leading-relaxed">{error}</span>
          </div>
        )}

        {/* 좌상단: 앱 이름 */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <span className="text-sm font-black tracking-wider" style={{ color: "#FEE12B", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            찍고 긋고 말하기
          </span>
        </div>

        {/* 우상단: 카메라 전환 */}
        <button
          onTouchStart={handleFlip}
          onClick={handleFlip}
          className="absolute top-3 right-3 w-14 h-14 flex items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.45)", touchAction: "manipulation" }}
          aria-label="카메라 전환"
        >
          <FlipIcon />
        </button>

        {/* ━━━ [신규 2] 손전등 버튼 — 좌측 중앙 ━━━ */}
        {torchSupported && ready && (
          <button
            onTouchStart={toggleTorch}
            onClick={toggleTorch}
            className="absolute left-3 flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-90"
            style={{
              top: "50%",
              transform: "translateY(-50%)",
              width: 64,
              height: 72,
              background: torchOn ? "#FEE12B" : "rgba(0,0,0,0.55)",
              border: torchOn ? "2px solid #FEE12B" : "2px solid rgba(255,255,255,0.18)",
              touchAction: "manipulation",
              gap: 4,
            }}
            aria-label={torchOn ? "손전등 끄기" : "손전등 켜기"}
          >
            <TorchIcon active={torchOn} />
            <span className="text-xs font-black" style={{ color: torchOn ? "#000" : "#888", lineHeight: 1 }}>
              {torchOn ? "ON" : "OFF"}
            </span>
          </button>
        )}

        {/* 줌 레벨 배지 — 상단 중앙 */}
        {zoomSupported && ready && (
          <div
            className="absolute top-3 left-1/2 pointer-events-none"
            style={{ transform: "translateX(-50%)", background: "rgba(0,0,0,0.55)", borderRadius: 20, padding: "4px 14px" }}
          >
            <span className="font-black text-sm" style={{ color: "#FEE12B" }}>
              {zoomLevel.toFixed(1)}×
            </span>
          </div>
        )}

        {/* 가로 크롭 가이드라인 (기존 보존) */}
        {ready && (
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{
              top: "calc(50% - (100vw / 16 * 9) / 2)",
              height: "calc(100vw / 16 * 9)",
              border: "2px solid #FEE12B",
              boxSizing: "border-box",
            }}
          >
            <span className="absolute top-1 left-2 text-xs font-black" style={{ color: "#FEE12B", textShadow: "0 1px 3px #000", letterSpacing: "0.05em" }}>
              가로 촬영 범위 16:9
            </span>
          </div>
        )}

        {/* 뷰파인더 코너 마킹 (기존 보존) */}
        {ready && (
          <>
            <div className="absolute top-12 left-6 w-8 h-8 border-t-2 border-l-2" style={{ borderColor: "#FEE12B" }} />
            <div className="absolute top-12 right-6 w-8 h-8 border-t-2 border-r-2" style={{ borderColor: "#FEE12B" }} />
            <div className="absolute bottom-28 left-6 w-8 h-8 border-b-2 border-l-2" style={{ borderColor: "#FEE12B" }} />
            <div className="absolute bottom-28 right-6 w-8 h-8 border-b-2 border-r-2" style={{ borderColor: "#FEE12B" }} />
          </>
        )}
      </div>

      {/* ─── 하단 컨트롤 바: [ − ] [셔터] [ + ] ─── */}
      <div
        className="flex items-center justify-between px-5 pb-8 pt-4"
        style={{ background: "rgba(0,0,0,0.75)", minHeight: 120 }}
      >
        {/* ━━━ [신규 1] 줌 아웃 [ − ] ━━━ */}
        <button
          onTouchStart={zoomSupported && ready ? zoomOut : undefined}
          onClick={zoomSupported && ready ? zoomOut : undefined}
          disabled={!zoomSupported || !ready || zoomLevel <= zoomRange.min}
          className="flex items-center justify-center rounded-2xl transition-transform active:scale-90 disabled:opacity-25"
          style={{
            width: 72,
            height: 72,
            background: "#FEE12B",
            touchAction: "manipulation",
            flexShrink: 0,
          }}
          aria-label="줌 아웃"
        >
          <span style={{ fontSize: 40, fontWeight: 900, color: "#000", lineHeight: 1, userSelect: "none" }}>−</span>
        </button>

        {/* 셔터 버튼 (기존 88px 완전 보존) */}
        <button
          onTouchStart={handleShutter}
          onClick={handleShutter}
          disabled={!ready}
          className="flex items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
          style={{
            width: 88,
            height: 88,
            background: ready ? "#FEE12B" : "#555",
            touchAction: "manipulation",
            boxShadow: ready ? "0 0 0 5px rgba(254,225,43,0.25)" : "none",
            flexShrink: 0,
          }}
          aria-label="촬영"
        >
          <ShutterIcon />
        </button>

        {/* ━━━ [신규 1] 줌 인 [ + ] ━━━ */}
        <button
          onTouchStart={zoomSupported && ready ? zoomIn : undefined}
          onClick={zoomSupported && ready ? zoomIn : undefined}
          disabled={!zoomSupported || !ready || zoomLevel >= zoomRange.max}
          className="flex items-center justify-center rounded-2xl transition-transform active:scale-90 disabled:opacity-25"
          style={{
            width: 72,
            height: 72,
            background: "#FEE12B",
            touchAction: "manipulation",
            flexShrink: 0,
          }}
          aria-label="줌 인"
        >
          <span style={{ fontSize: 40, fontWeight: 900, color: "#000", lineHeight: 1, userSelect: "none" }}>+</span>
        </button>
      </div>

      {/* 줌 미지원 안내 */}
      {!zoomSupported && ready && (
        <div
          className="text-center text-xs pb-2"
          style={{ color: "rgba(255,255,255,0.28)", background: "rgba(0,0,0,0.75)", marginTop: -8, paddingBottom: 6 }}
        >
          이 기기는 줌을 지원하지 않습니더
        </div>
      )}
    </div>
  );
}
