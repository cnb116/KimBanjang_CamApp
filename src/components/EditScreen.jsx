import { useRef, useEffect, useState, useCallback } from "react";

// ━━━ 점멸 애니메이션 CSS 전역 주입 (1회만) ━━━
if (typeof document !== "undefined" && !document.getElementById("mic-blink-style")) {
  const el = document.createElement("style");
  el.id = "mic-blink-style";
  el.textContent = `
    @keyframes micBlink {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,59,59,0.8); }
      50%       { opacity: 0.5; box-shadow: 0 0 0 10px rgba(255,59,59,0); }
    }
    .mic-blinking { animation: micBlink 0.85s ease-in-out infinite; }
  `;
  document.head.appendChild(el);
}

// ━━━ 아이콘 SVG ━━━
function MicIcon({ recording, size = 24 }) {
  const c = recording ? "#fff" : "#000";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={c} stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" stroke={c} />
      <line x1="12" y1="17" x2="12" y2="21" stroke={c} />
      <line x1="8"  y1="21" x2="16" y2="21" stroke={c} />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FEE12B" strokeWidth="2" strokeLinecap="round">
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FF5555" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

// ━━━ 워터마크 합성 헬퍼 → 오프스크린 캔버스 반환 ━━━
function buildComposite(srcCanvas, text) {
  const off = document.createElement("canvas");
  off.width  = srcCanvas.width;
  off.height = srcCanvas.height;
  const ctx = off.getContext("2d");

  // 드로잉 캔버스 복사
  ctx.drawImage(srcCanvas, 0, 0);

  // 날짜 문자열
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 워터마크 텍스트
  const hasText = text.trim() !== "";
  const label = hasText ? `${dateStr}  |  ${text.trim()}` : dateStr;

  // 폰트 (캔버스 너비 기준, 최소 28px)
  const fontSize = Math.max(Math.round(off.width * 0.030), 28);
  ctx.font = `bold ${fontSize}px 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`;
  ctx.textBaseline = "middle";

  // 배경: 하단 전체 너비 100%
  const padY = Math.round(fontSize * 0.6);
  const boxH = fontSize + padY * 2;
  const boxY = off.height - boxH;

  ctx.fillStyle = "rgba(254, 225, 43, 0.82)";
  ctx.fillRect(0, boxY, off.width, boxH);

  // 텍스트 (왼쪽 여백)
  const padX = Math.round(off.width * 0.022);
  ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
  ctx.fillText(label, padX, boxY + boxH / 2);

  return off;
}

// 파일명 생성
function makeFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `현장사진_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.jpg`;
}

// ━━━ Web Speech API STT 훅 ━━━
function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const isSpeechSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // 토글: 녹음 중이면 중지, 아니면 시작
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      // ── 명확한 중지 ──
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // ── 시작 ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("지원하지 않는 브라우저입니다. Chrome 또는 Samsung Internet을 사용해 주세요.");
      return;
    }

    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (event) => {
      let finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText.trim()) {
        setTranscript((prev) => {
          const t = prev.trim();
          return t ? t + " " + finalText.trim() : finalText.trim();
        });
      }
    };

    rec.onerror = (e) => {
      console.warn("STT 오류:", e.error);
      setIsRecording(false);
    };

    rec.onend = () => {
      // 인식 종료 → 반드시 점멸 해제
      setIsRecording(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [isRecording]);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return { transcript, setTranscript, isRecording, isSpeechSupported, toggleRecording, clearTranscript };
}

// ━━━ 캔버스 드로잉 훅 ━━━
function useCanvasDrawing(imageDataUrl, canvasRef) {
  const isDrawing   = useRef(false);
  const strokesRef  = useRef([]);
  const currentRef  = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageDataUrl) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      strokesRef.current.forEach((stroke) => {
        if (stroke.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth   = Math.max(canvas.width / 80, 8);
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const touch  = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left)  * (canvas.width  / rect.width),
      y: (touch.clientY - rect.top)   * (canvas.height / rect.height),
    };
  }, [canvasRef]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    isDrawing.current = true;
    currentRef.current = [getPos(e)];
  }, [getPos]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e);
    currentRef.current.push(pos);
    const stroke = currentRef.current;
    if (stroke.length >= 2) {
      const prev = stroke[stroke.length - 2];
      ctx.beginPath();
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth   = Math.max(canvas.width / 80, 8);
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x,  pos.y);
      ctx.stroke();
    }
  }, [canvasRef, getPos]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentRef.current.length > 0) {
      strokesRef.current.push([...currentRef.current]);
      currentRef.current = [];
    }
  }, []);

  const undo = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();
    redrawAll();
  }, [redrawAll]);

  const clearAll = useCallback(() => {
    strokesRef.current = [];
    redrawAll();
  }, [redrawAll]);

  return { handleTouchStart, handleTouchMove, handleTouchEnd, undo, clearAll };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 EditScreen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function EditScreen({ imageDataUrl, onRetake, sendResult }) {
  const canvasRef = useRef(null);
  const [actionResult, setActionResult] = useState(null); // { ok, message }
  const [isBusy, setIsBusy] = useState(false);

  const {
    transcript, setTranscript,
    isRecording, isSpeechSupported,
    toggleRecording, clearTranscript,
  } = useSpeechRecognition();

  const { handleTouchStart, handleTouchMove, handleTouchEnd, undo, clearAll } =
    useCanvasDrawing(imageDataUrl, canvasRef);

  // ── 공통: 워터마크 합성 후 DataURL 반환 ──
  const getCompositeUrl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const off = buildComposite(canvas, transcript);
    return off.toDataURL("image/jpeg", 0.92);
  }, [transcript]);

  // ── 보관함 저장 (갤러리 다운로드) ──
  const handleSave = useCallback(() => {
    const dataUrl = getCompositeUrl();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href     = dataUrl;
    a.download = makeFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setActionResult({ ok: true, message: "📁 보관함에 저장됐심더!" });
  }, [getCompositeUrl]);

  // ── 즉시 공유 (navigator.share) ──
  const handleShare = useCallback(async () => {
    if (isBusy) return;
    const dataUrl = getCompositeUrl();
    if (!dataUrl) return;

    setIsBusy(true);
    setActionResult(null);
    try {
      // DataURL → File
      const [header, b64] = dataUrl.split(",");
      const mime   = header.match(/:(.*?);/)[1];
      const binary = atob(b64);
      const buf    = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const file = new File([buf], makeFilename(), { type: mime });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "현장 보고서",
          text:  transcript || "",
        });
        setActionResult({ ok: true, message: "✅ 공유 완료됐심더!" });
      } else {
        // Share API 미지원 → 다운로드 폴백
        const url = URL.createObjectURL(file);
        const a   = document.createElement("a");
        a.href     = url;
        a.download = makeFilename();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        setActionResult({ ok: true, message: "⬇️ 다운로드 완료됐심더!" });
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setActionResult({ ok: false, message: "전송 실패. 다시 시도하이소." });
      }
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, getCompositeUrl, transcript]);

  // sendResult prop이 내려올 경우 표시 (App.jsx 연동용)
  const displayResult = actionResult || sendResult;

  return (
    <div className="fixed inset-0 bg-black flex flex-col">

      {/* ── 상단 툴바 ── */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ background: "rgba(0,0,0,0.88)", minHeight: 54 }}
      >
        {/* 다시 찍기 */}
        <button
          onTouchStart={onRetake}
          onClick={onRetake}
          className="flex items-center gap-1 px-4 py-2 rounded-xl"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "#FEE12B",
            fontSize: 15,
            fontWeight: 700,
            touchAction: "manipulation",
            minHeight: 44,
            border: "none",
            cursor: "pointer",
          }}
          aria-label="다시 찍기"
        >
          ← 다시
        </button>

        <span className="text-white font-bold text-sm tracking-wider" style={{ opacity: 0.55 }}>
          마킹 &amp; 전송
        </span>

        {/* 되돌리기 / 전체 지우기 */}
        <div className="flex gap-2">
          <button
            onTouchStart={undo} onClick={undo}
            className="w-11 h-11 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", touchAction: "manipulation", border: "none", cursor: "pointer" }}
            aria-label="되돌리기"
          >
            <UndoIcon />
          </button>
          <button
            onTouchStart={clearAll} onClick={clearAll}
            className="w-11 h-11 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", touchAction: "manipulation", border: "none", cursor: "pointer" }}
            aria-label="드로잉 전체 지우기"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* ── 캔버스 영역 ── */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ touchAction: "none", cursor: "crosshair", display: "block" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {/* 마킹 안내 배지 */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold pointer-events-none"
          style={{ background: "rgba(220,0,0,0.78)", color: "#fff", letterSpacing: "0.05em", whiteSpace: "nowrap" }}
        >
          손가락으로 문제 부위 표시하이소
        </div>
      </div>

      {/* ── STT 텍스트 입력 영역 ── */}
      <div
        className="flex-shrink-0"
        style={{ background: "rgba(0,0,0,0.93)", borderTop: "2px solid rgba(254,225,43,0.30)" }}
      >
        {/* 레이블 바 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div className="flex items-center gap-2">
            {isRecording && (
              <span style={{ color: "#FF3B3B", fontSize: 15, animation: "micBlink 0.85s ease-in-out infinite" }}>
                ●
              </span>
            )}
            <span className="text-xs font-black tracking-wider" style={{ color: "#FEE12B" }}>
              {isRecording ? "듣고 있심더... (말씀하이소)" : "음성 메모 (직접 수정 가능)"}
            </span>
          </div>
          {transcript && (
            <button
              onTouchStart={clearTranscript} onClick={clearTranscript}
              className="text-xs font-bold px-3 py-1 rounded-lg"
              style={{
                color: "#FF5555",
                background: "rgba(255,68,68,0.12)",
                touchAction: "manipulation",
                minHeight: 30,
                border: "none",
                cursor: "pointer",
              }}
            >
              지우기
            </button>
          )}
        </div>

        {/* textarea + 마이크 버튼 (1개, 우측 하단) */}
        <div style={{ position: "relative" }}>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={
              isRecording
                ? ""
                : isSpeechSupported
                ? "마이크 버튼을 눌러 음성 메모를 추가하거나\n여기를 직접 터치해서 입력하이소"
                : "여기를 직접 터치해서 입력하이소"
            }
            rows={3}
            style={{
              display: "block",
              width: "100%",
              background: "rgba(255,255,255,0.05)",
              color: "#FFFFFF",
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.55,
              padding: isSpeechSupported ? "10px 60px 14px 16px" : "10px 16px 14px 16px",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
              caretColor: "#FEE12B",
              boxSizing: "border-box",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e)  => e.stopPropagation()}
          />

          {/* ★ 마이크 버튼 — 딱 1개 ★ */}
          {isSpeechSupported && (
            <button
              onTouchStart={(e) => { e.stopPropagation(); toggleRecording(); }}
              onClick={toggleRecording}
              aria-label={isRecording ? "녹음 중지" : "음성 입력 시작"}
              className={isRecording ? "mic-blinking" : ""}
              style={{
                position: "absolute",
                right: 10,
                bottom: 10,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isRecording ? "#FF3B3B" : "rgba(254,225,43,0.92)",
                boxShadow: isRecording
                  ? "0 0 0 3px rgba(255,59,59,0.45)"
                  : "0 2px 8px rgba(0,0,0,0.45)",
                touchAction: "manipulation",
                transition: "background 0.18s",
              }}
            >
              <MicIcon recording={isRecording} size={22} />
            </button>
          )}
        </div>
      </div>

      {/* ── 액션 결과 메시지 ── */}
      {displayResult && (
        <div
          className="px-4 py-2 text-center font-bold text-base flex-shrink-0"
          style={{
            background: displayResult.ok ? "rgba(0,170,75,0.88)" : "rgba(200,30,30,0.88)",
            color: "#fff",
          }}
        >
          {displayResult.message}
        </div>
      )}

      {/* ── 하단 액션 바: [보관함 저장] [즉시 공유] — 딱 2개 ── */}
      <div
        className="flex items-center justify-between px-4 pb-8 pt-3 gap-3 flex-shrink-0"
        style={{ background: "rgba(0,0,0,0.92)", minHeight: 108 }}
      >
        {/* 보관함 저장 */}
        <button
          onTouchStart={handleSave}
          onClick={handleSave}
          className="flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-95"
          style={{
            flex: 1,
            height: 80,
            background: "rgba(254,225,43,0.88)",
            touchAction: "manipulation",
            gap: 5,
            border: "none",
            cursor: "pointer",
          }}
          aria-label="보관함 저장"
        >
          <SaveIcon />
          <span style={{ fontSize: 13, fontWeight: 900, color: "#000" }}>보관함 저장</span>
        </button>

        {/* 즉시 공유 */}
        <button
          onTouchStart={!isBusy ? handleShare : undefined}
          onClick={!isBusy ? handleShare : undefined}
          disabled={isBusy}
          className="flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:opacity-50"
          style={{
            flex: 1,
            height: 80,
            background: "#FEE12B",
            touchAction: "manipulation",
            gap: 5,
            border: "none",
            cursor: isBusy ? "not-allowed" : "pointer",
          }}
          aria-label="즉시 공유"
        >
          {isBusy ? (
            <span className="text-black font-black text-base animate-pulse">처리 중...</span>
          ) : (
            <>
              <ShareIcon />
              <span style={{ fontSize: 13, fontWeight: 900, color: "#000" }}>즉시 공유</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
