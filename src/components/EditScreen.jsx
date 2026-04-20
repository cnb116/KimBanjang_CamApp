import { useRef, useEffect, useState, useCallback } from "react";

// ━━━ 점멸 애니메이션 + 토글 스위치 CSS ━━━
if (typeof document !== "undefined" && !document.getElementById("mic-blink-style")) {
  const el = document.createElement("style");
  el.id = "mic-blink-style";
  el.textContent = `
    @keyframes micBlink {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,59,59,0.8); }
      50%       { opacity: 0.5; box-shadow: 0 0 0 10px rgba(255,59,59,0); }
    }
    .mic-blinking { animation: micBlink 0.85s ease-in-out infinite; }

    /* ── 토글 스위치 ── */
    .wm-toggle-wrap { display: flex; align-items: center; gap: 6px; }
    .wm-toggle-label { font-size: 12px; font-weight: 700; color: #FEE12B; user-select: none; cursor: pointer; }
    .wm-toggle {
      position: relative; display: inline-block;
      width: 42px; height: 24px; flex-shrink: 0;
    }
    .wm-toggle input { opacity: 0; width: 0; height: 0; }
    .wm-toggle-slider {
      position: absolute; inset: 0;
      background: #444; border-radius: 24px;
      transition: background 0.25s;
      cursor: pointer;
    }
    .wm-toggle-slider::before {
      content: '';
      position: absolute; left: 3px; top: 3px;
      width: 18px; height: 18px;
      border-radius: 50%; background: #fff;
      transition: transform 0.25s;
    }
    .wm-toggle input:checked + .wm-toggle-slider { background: #FEE12B; }
    .wm-toggle input:checked + .wm-toggle-slider::before { transform: translateX(18px); }
  `;
  document.head.appendChild(el);
}

// 브러시 설정
const BRUSH_COLOR = "#FF0000";

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

// ━━━ 워터마크 합성 헬퍼 ━━━
// showDateTime: 날짜/시간 표시 여부, showSpeech: 음성 텍스트 표시 여부
function buildComposite(srcCanvas, text, showDateTime = true, showSpeech = true) {
  const off = document.createElement("canvas");
  off.width  = srcCanvas.width;
  off.height = srcCanvas.height;
  const ctx = off.getContext("2d");

  ctx.drawImage(srcCanvas, 0, 0);

  // 표시할 항목이 하나도 없으면 워터마크 생략
  if (!showDateTime && !showSpeech) return off;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const hasText = showSpeech && text.trim() !== "";

  let label = "";
  if (showDateTime && hasText)  label = `${dateStr}  |  ${text.trim()}`;
  else if (showDateTime)        label = dateStr;
  else if (hasText)             label = text.trim();
  else return off; // 토글이 켜져 있어도 내용이 없으면 생략

  const fontSize = Math.max(Math.round(off.width * 0.030), 28);
  ctx.font = `bold ${fontSize}px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;
  ctx.textBaseline = "middle";

  const padY = Math.round(fontSize * 0.6);
  const boxH = fontSize + padY * 2;
  const boxY = off.height - boxH;

  // ① 배경: 노란색 15% 투명 (배경 사진이 잘 비치도록)
  ctx.fillStyle = "rgba(255, 235, 59, 0.15)";
  ctx.fillRect(0, boxY, off.width, boxH);

  const padX = Math.round(off.width * 0.022);

  // ② 텍스트: 흰색 외곽선(stroke) + 검은 글씨(fill) 순으로 가독성 확보
  ctx.lineWidth = Math.max(Math.round(fontSize * 0.07), 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.90)";
  ctx.lineJoin = "round";
  ctx.strokeText(label, padX, boxY + boxH / 2);

  ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
  ctx.fillText(label, padX, boxY + boxH / 2);

  return off;
}

function makeFilename() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `현장사진_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.jpg`;
}

// ━━━ STT 훅 ━━━
function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const isSpeechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("지원하지 않는 브라우저입니다.");
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = false;
    rec.onresult = (event) => {
      const result = event.results[0][0].transcript;
      if (result) setTranscript(prev => prev.trim() ? prev.trim() + " " + result.trim() : result.trim());
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [isRecording]);

  return { transcript, setTranscript, isRecording, isSpeechSupported, toggleRecording };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 EditScreen
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function EditScreen({ imageDataUrl, onBack }) {
  const canvasRef = useRef(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // ── 워터마크 표시 항목 토글 (기본값: 둘 다 켜짐) ──
  const [showDateTime, setShowDateTime] = useState(true);
  const [showSpeech,   setShowSpeech]   = useState(true);

  // 드로잉 관련 상태
  const isDrawing = useRef(false);
  const lastPos = useRef(null);
  const strokesRef = useRef([]); // 스트로크 히스토리
  const currentStroke = useRef([]);

  const { transcript, setTranscript, isRecording, isSpeechSupported, toggleRecording } = useSpeechRecognition();

  // 초기 이미지 로드
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageDataUrl) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // 좌표 계산
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  };

  const BRUSH_WIDTH = Math.max((canvasRef.current?.width || 1920) / 80, 8);

  // 드로잉 핸들러
  const startDraw = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getPos(e);
    currentStroke.current = [];
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    currentStroke.current.push({ ...lastPos.current });
    ctx.beginPath();
    ctx.strokeStyle = BRUSH_COLOR;
    ctx.lineWidth = BRUSH_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = (e) => {
    e.preventDefault();
    if (isDrawing.current) {
      strokesRef.current.push([...currentStroke.current, lastPos.current]);
    }
    isDrawing.current = false;
    lastPos.current = null;
  };

  // ↩ 되돌리기
  const handleUndo = useCallback(() => {
    if (!strokesRef.current.length) return;
    strokesRef.current.pop();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      ctx.strokeStyle = BRUSH_COLOR;
      ctx.lineWidth = BRUSH_WIDTH;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      strokesRef.current.forEach((stroke) => {
        if (stroke.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, BRUSH_WIDTH]);

  // 🗑 전체 삭제
  const handleClear = useCallback(() => {
    strokesRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const combined = buildComposite(canvas, transcript, showDateTime, showSpeech);
    const url = combined.toDataURL("image/jpeg", 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFilename();
    a.click();
    setStatusMsg("📁 저장 완료!");
  };

  const handleShare = useCallback(async () => {
    if (busy || !canvasRef.current) return;
    setBusy(true);
    const compositeCanvas = buildComposite(canvasRef.current, transcript, showDateTime, showSpeech);
    const fileName = makeFilename();

    compositeCanvas.toBlob(async (blob) => {
      if (!blob) { setBusy(false); return; }

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: "현장 사진",
              text: transcript.trim() || "현장 사진 공유",
              files: [file],
            });
            setStatusMsg("📤 공유 완료됐심더!");
            setBusy(false);
            return;
          } catch (err) {
            if (err.name === "AbortError") { setBusy(false); return; }
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg("📥 공유 미지원 → 자동 저장됐심더!");
      setBusy(false);
    }, "image/jpeg", 0.92);
  }, [busy, transcript, showDateTime, showSpeech]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      
      {/* ── 상단 헤더 ── */}
      <div className="flex items-center px-4 py-3 bg-black border-b border-neutral-800 shrink-0">
        <button
          onTouchStart={(e) => { e.preventDefault(); onBack(); }}
          onClick={onBack}
          className="bg-neutral-800 text-yellow-300 text-base font-extrabold px-4 h-12 rounded-xl mr-3 flex items-center gap-1 active:scale-95 transition-transform"
        >
          ← 다시
        </button>

        <span className="text-yellow-300 text-lg font-bold tracking-wide flex-1">
          찍고 긋고 말하기
        </span>

        {statusMsg && (
          <span className="text-sm text-yellow-200 bg-neutral-800 px-3 py-1 rounded-full animate-pulse mr-2">
            {statusMsg}
          </span>
        )}

        {/* ↩ 되돌리기 */}
        <button
          onTouchStart={(e) => { e.preventDefault(); handleUndo(); }}
          onClick={handleUndo}
          className="bg-neutral-800 text-yellow-300 text-xl font-bold w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 transition-transform mr-2"
          aria-label="되돌리기"
        >
          ↩
        </button>

        {/* 🗑 전체 마킹 삭제 */}
        <button
          onTouchStart={(e) => { e.preventDefault(); handleClear(); }}
          onClick={handleClear}
          className="bg-red-700 text-white text-xl w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 transition-transform"
          aria-label="마킹 전체 삭제"
        >
          🗑
        </button>
      </div>

      {/* 캔버스 영역 */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain touch-none"
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <div className="absolute top-3 px-3 py-1 bg-red-600/80 text-white text-xs font-bold rounded-full pointer-events-none">
          문제 부위 마킹하이소
        </div>
      </div>

      {/* STT 구역 */}
      <div className="bg-black/95 border-t border-[#FEE12B]/30">
        {/* ── 워터마크 표시 항목 토글 ── */}
        <div className="flex items-center gap-4 px-4 pt-2 pb-1">
          <label className="wm-toggle-wrap">
            <span className="wm-toggle-label">날짜/시간</span>
            <span className="wm-toggle">
              <input
                type="checkbox"
                checked={showDateTime}
                onChange={e => setShowDateTime(e.target.checked)}
              />
              <span className="wm-toggle-slider" />
            </span>
          </label>
          <label className="wm-toggle-wrap">
            <span className="wm-toggle-label">음성 텍스트</span>
            <span className="wm-toggle">
              <input
                type="checkbox"
                checked={showSpeech}
                onChange={e => setShowSpeech(e.target.checked)}
              />
              <span className="wm-toggle-slider" />
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 text-[#FEE12B] text-xs font-black">
          {isRecording && <span className="text-red-500 animate-pulse">●</span>}
          {isRecording ? "듣고 있심더..." : "음성 메모 (수정 가능)"}
        </div>
        <div className="relative">
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="마이크 눌러 말하거나 직접 치이소"
            rows={3}
            className="w-full bg-white/5 text-white text-xl font-bold p-4 pr-16 outline-none resize-none"
          />
          {isSpeechSupported && (
            <button
              onClick={toggleRecording}
              className={`absolute right-3 bottom-3 w-12 h-12 rounded-full flex items-center justify-center ${isRecording ? "bg-red-600 mic-blinking" : "bg-[#FEE12B]"}`}
            >
              <MicIcon recording={isRecording} />
            </button>
          )}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex px-4 py-4 pb-8 gap-3 bg-black/95 min-h-[100px]">
        <button onClick={handleSave} className="flex-1 h-20 bg-[#FEE12B]/90 rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform">
          <SaveIcon /><span className="text-sm font-black text-black">보관함 저장</span>
        </button>
        <button onClick={handleShare} disabled={busy} className="flex-1 h-20 bg-[#FEE12B] rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform">
          {busy ? <span className="text-black font-black animate-pulse">처리 중...</span> : <><ShareIcon /><span className="text-sm font-black text-black">즉시 공유</span></>}
        </button>
      </div>
    </div>
  );
}
