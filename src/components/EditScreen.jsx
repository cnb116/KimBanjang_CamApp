import { useRef, useEffect, useState, useCallback } from "react";

// ——— 아이콘 SVG ———
function MicIcon({ isRecording }) {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke={isRecording ? "#000" : "#000"} strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={isRecording ? "#FF3B3B" : "#000"} stroke="none" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  );
}

function SendIcon() {
  // 공유 아이콘 (위로 올리는 화살표 — Share의 보편적 상징)
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#FEE12B" strokeWidth="2" strokeLinecap="round">
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#FF4444" strokeWidth="2" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" /><path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ——— Web Speech API STT 훅 ———
function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니더. Chrome을 사용하이소.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        }
      }
      if (final.trim()) {
        setTranscript((prev) => {
          // 중복 방지
          const newText = final.trim();
          if (prev.trim().endsWith(newText)) return prev;
          return (prev + " " + newText).trim();
        });
      }
    };

    recognition.onerror = (e) => {
      console.warn("STT 오류:", e.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return { transcript, setTranscript, isRecording, startRecording, stopRecording, clearTranscript };
}

// ——— 캔버스 드로잉 훅 ———
function useCanvasDrawing(imageDataUrl, canvasRef) {
  const isDrawing = useRef(false);
  const strokesRef = useRef([]); // undo 히스토리
  const currentStrokeRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageDataUrl) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      // 캔버스 크기를 이미지에 맞게 설정
      canvas.width = img.naturalWidth;
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
      // 모든 스트로크 재그리기
      strokesRef.current.forEach((stroke) => {
        if (stroke.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = Math.max(canvas.width / 80, 8);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.forEach((pt) => ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  // 터치 좌표를 캔버스 좌표로 변환
  const getTouchPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  }, [canvasRef]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    isDrawing.current = true;
    currentStrokeRef.current = [];
    const pos = getTouchPos(e);
    currentStrokeRef.current.push(pos);
  }, [getTouchPos]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getTouchPos(e);
    currentStrokeRef.current.push(pos);

    // 실시간 드로잉
    const stroke = currentStrokeRef.current;
    if (stroke.length >= 2) {
      const prev = stroke[stroke.length - 2];
      ctx.beginPath();
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth = Math.max(canvas.width / 80, 8);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }, [canvasRef, getTouchPos]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentStrokeRef.current.length > 0) {
      strokesRef.current.push([...currentStrokeRef.current]);
      currentStrokeRef.current = [];
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

// ——— 메인 EditScreen ———
export default function EditScreen({ imageDataUrl, onRetake, onSend, isSending, sendResult }) {
  const canvasRef = useRef(null);
  const { transcript, setTranscript, isRecording, startRecording, stopRecording, clearTranscript } =
    useSpeechRecognition();
  const { handleTouchStart, handleTouchMove, handleTouchEnd, undo, clearAll } =
    useCanvasDrawing(imageDataUrl, canvasRef);

  const handleSend = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const compositeImageDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    onSend({ compositeImageDataUrl, transcript });
  }, [onSend, transcript]);

  const handleMicPress = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* 상단 툴바 */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "rgba(0,0,0,0.85)", minHeight: 56 }}
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
          }}
          aria-label="다시 찍기"
        >
          ← 다시
        </button>

        <span className="text-white font-bold text-sm tracking-wider opacity-60">
          마킹 & 전송
        </span>

        {/* 그리기 도구 버튼들 */}
        <div className="flex gap-2">
          <button
            onTouchStart={undo}
            onClick={undo}
            className="w-11 h-11 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", touchAction: "manipulation" }}
            aria-label="되돌리기"
          >
            <UndoIcon />
          </button>
          <button
            onTouchStart={clearAll}
            onClick={clearAll}
            className="w-11 h-11 flex items-center justify-center rounded-xl"
            style={{ background: "rgba(255,255,255,0.08)", touchAction: "manipulation" }}
            aria-label="전체 지우기"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* 캔버스 영역 — 사진 + 드로잉 */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ touchAction: "none", cursor: "crosshair", display: "block" }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        {/* 마킹 안내 */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold pointer-events-none"
          style={{
            background: "rgba(255,0,0,0.75)",
            color: "#fff",
            letterSpacing: "0.05em",
          }}
        >
          손가락으로 문제 부위 표시하이소
        </div>
      </div>

      {/* STT 텍스트 — 수정 가능한 textarea (하자 보수 완료) */}
      <div
        style={{ background: "rgba(0,0,0,0.92)", borderTop: "2px solid rgba(254,225,43,0.35)" }}
      >
        {/* 레이블 바 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="text-red-400 text-base animate-pulse">●</span>
            )}
            <span
              className="text-xs font-black tracking-wider"
              style={{ color: "#FEE12B" }}
            >
              {isRecording ? "듣고 있심더... (말씀하이소)" : "음성 메모 (직접 수정 가능)"}
            </span>
          </div>
          {transcript && (
            <button
              onTouchStart={clearTranscript}
              onClick={clearTranscript}
              className="text-xs font-bold px-3 py-1 rounded-lg"
              style={{
                color: "#FF4444",
                background: "rgba(255,68,68,0.12)",
                touchAction: "manipulation",
                minHeight: 32,
              }}
            >
              전체 지우기
            </button>
          )}
        </div>

        {/* ★ 핵심 하자 보수: <p> → <textarea> 수정 가능한 텍스트박스 ★ */}
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={isRecording ? "" : "마이크 버튼을 눌러 음성 메모를 추가하거나\n여기를 직접 터치해서 입력하이소"}
          rows={3}
          style={{
            display: "block",
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            color: "#FFFFFF",
            fontSize: 20,           // 현장 어르신 기준 큰 폰트
            fontWeight: 700,
            lineHeight: 1.55,
            padding: "10px 16px 14px",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: "inherit",
            caretColor: "#FEE12B",
            // 장갑 벗고 수정할 때 선택 허용
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
          // textarea 터치 시 canvas 드로잉 이벤트와 충돌하지 않도록
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        />
      </div>

      {/* 전송 결과 메시지 */}
      {sendResult && (
        <div
          className="px-4 py-2 text-center font-bold text-base"
          style={{
            background: sendResult.ok ? "rgba(0,180,80,0.85)" : "rgba(200,30,30,0.85)",
            color: "#fff",
          }}
        >
          {sendResult.message}
        </div>
      )}

      {/* 하단 버튼 바 */}
      <div
        className="flex items-center justify-around px-4 pb-8 pt-3 gap-4"
        style={{ background: "rgba(0,0,0,0.9)", minHeight: 110 }}
      >
        {/* 마이크 버튼 — press to toggle */}
        <button
          onTouchStart={handleMicPress}
          onClick={handleMicPress}
          className="flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-95"
          style={{
            width: 100,
            height: 80,
            background: isRecording ? "#FF3B3B" : "#FEE12B",
            touchAction: "manipulation",
            gap: 4,
          }}
          aria-label={isRecording ? "녹음 중지" : "음성 메모 시작"}
        >
          <MicIcon isRecording={isRecording} />
          <span className="text-xs font-black" style={{ color: "#000" }}>
            {isRecording ? "중지" : "음성메모"}
          </span>
        </button>

        {/* 전송 버튼 */}
        <button
          onTouchStart={!isSending ? handleSend : undefined}
          onClick={!isSending ? handleSend : undefined}
          disabled={isSending}
          className="flex flex-col items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:opacity-50"
          style={{
            flex: 1,
            height: 80,
            background: "#FEE12B",
            touchAction: "manipulation",
            gap: 4,
            maxWidth: 200,
          }}
          aria-label="전송"
        >
          {isSending ? (
            <span className="text-black font-black text-lg animate-pulse">처리 중...</span>
          ) : (
            <>
              <SendIcon />
              <span className="text-base font-black" style={{ color: "#000" }}>
                공유 / 저장
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
