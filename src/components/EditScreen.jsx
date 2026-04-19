import { useRef, useEffect, useState, useCallback } from "react";

// ━━━ 점멸 애니메이션 CSS 전역 주입 ━━━
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

// ━━━ 워터마크 합성 헬퍼 ━━━
function buildComposite(srcCanvas, text) {
  const off = document.createElement("canvas");
  off.width  = srcCanvas.width;
  off.height = srcCanvas.height;
  const ctx = off.getContext("2d");

  // 원본 드로잉 내용 복사
  ctx.drawImage(srcCanvas, 0, 0);

  // 날짜 생성
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 최종 라벨
  const hasText = text.trim() !== "";
  const label = hasText ? `${dateStr}  |  ${text.trim()}` : dateStr;

  // 폰트 설정
  const fontSize = Math.max(Math.round(off.width * 0.030), 28);
  ctx.font = `bold ${fontSize}px 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`;
  ctx.textBaseline = "middle";

  // 배경: 하단 전체 너비 100%
  const padY = Math.round(fontSize * 0.6);
  const boxH = fontSize + padY * 2;
  const boxY = off.height - boxH;

  ctx.fillStyle = "rgba(254, 225, 43, 0.85)";
  ctx.fillRect(0, boxY, off.width, boxH);

  // 텍스트 출력
  const padX = Math.round(off.width * 0.022);
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
      if (result) {
        setTranscript(prev => prev.trim() ? prev.trim() + " " + result.trim() : result.trim());
      }
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);

    recognitionRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, [isRecording]);

  return { transcript, setTranscript, isRecording, isSpeechSupported, toggleRecording };
}

// ━━━ 드로잉 훅 ━━━
function useCanvasDrawing(imageDataUrl, canvasRef) {
  const isDrawing = useRef(false);
  const strokesRef = useRef([]);
  const currentRef = useRef([]);

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
  }, [imageDataUrl, canvasRef]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      strokesRef.current.forEach(s => {
        ctx.beginPath();
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = Math.max(canvas.width / 80, 8);
        ctx.lineCap = "round";
        ctx.moveTo(s[0].x, s[0].y);
        s.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (touch.clientY - rect.top)  * (canvasRef.current.height / rect.height)
    };
  };

  const onStart = (e) => { e.preventDefault(); isDrawing.current = true; currentRef.current = [getPos(e)]; };
  const onMove = (e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    const prev = currentRef.current[currentRef.current.length - 1];
    ctx.beginPath();
    ctx.strokeStyle = "#FF0000";
    ctx.lineWidth = Math.max(canvasRef.current.width / 80, 8);
    ctx.lineCap = "round";
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    currentRef.current.push(pos);
  };
  const onEnd = () => { if (isDrawing.current) { strokesRef.current.push(currentRef.current); isDrawing.current = false; } };

  return { onStart, onMove, onEnd, undo: () => { strokesRef.current.pop(); redraw(); }, clear: () => { strokesRef.current = []; redraw(); } };
}

// ━━━ 메인 컴포넌트 ━━━
export default function EditScreen({ imageDataUrl, onRetake }) {
  const canvasRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const { transcript, setTranscript, isRecording, isSpeechSupported, toggleRecording } = useSpeechRecognition();
  const { onStart, onMove, onEnd, undo, clear } = useCanvasDrawing(imageDataUrl, canvasRef);

  const getUrl = () => canvasRef.current ? buildComposite(canvasRef.current, transcript).toDataURL("image/jpeg", 0.92) : null;

  const handleSave = () => {
    const url = getUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFilename();
    a.click();
    setMsg({ ok: true, text: "📁 저장 완료!" });
  };

  const handleShare = async () => {
    if (busy) return;
    const url = getUrl();
    if (!url) return;
    setBusy(true);
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], makeFilename(), { type: "image/jpeg" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "현장 보고" });
        setMsg({ ok: true, text: "✅ 공유 완료!" });
      } else {
        handleSave();
      }
    } catch {
      setMsg({ ok: false, text: "❌ 실패" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">
      {/* 툴바 */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/90 min-h-[54px]">
        <button onClick={onRetake} className="px-4 py-2 bg-white/10 text-[#FEE12B] font-bold rounded-xl">← 다시</button>
        <div className="flex gap-2">
          <button onClick={undo} className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center"><UndoIcon /></button>
          <button onClick={clear} className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center"><TrashIcon /></button>
        </div>
      </div>

      {/* 캔버스 */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain touch-none" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} />
        <div className="absolute top-3 px-3 py-1 bg-red-600/80 text-white text-xs font-bold rounded-full">문제 부위 마킹하이소</div>
      </div>

      {/* STT 구역 */}
      <div className="bg-black/95 border-t border-[#FEE12B]/30">
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
              className={`absolute right-3 bottom-3 w-11 h-11 rounded-full flex items-center justify-center ${isRecording ? "bg-red-600 mic-blinking" : "bg-[#FEE12B]"}`}
            >
              <MicIcon recording={isRecording} />
            </button>
          )}
        </div>
      </div>

      {/* 결과 메시지 */}
      {msg && <div className={`py-2 text-center font-bold text-white ${msg.ok ? "bg-green-600/90" : "bg-red-600/90"}`}>{msg.text}</div>}

      {/* 하단 버튼 */}
      <div className="flex px-4 py-4 pb-8 gap-3 bg-black/95 min-h-[100px]">
        <button onClick={handleSave} className="flex-1 h-20 bg-[#FEE12B]/90 rounded-2xl flex flex-col items-center justify-center gap-1">
          <SaveIcon /><span className="text-sm font-black text-black">보관함 저장</span>
        </button>
        <button onClick={handleShare} disabled={busy} className="flex-1 h-20 bg-[#FEE12B] rounded-2xl flex flex-col items-center justify-center gap-1">
          {busy ? <span className="text-black font-black animate-pulse">처리 중...</span> : <><ShareIcon /><span className="text-sm font-black text-black">즉시 공유</span></>}
        </button>
      </div>
    </div>
  );
}
