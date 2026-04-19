/**
 * EditScreen.jsx — 현장 마킹 & 저장·공유 화면
 *
 * ✅ 자동 공유/저장 버그 없음 (useEffect 안에 공유·저장 로직 없음)
 * ✅ 마이크 버튼 1개 (textarea 우측)
 * ✅ 하단 버튼 2개: [보관함 저장] [즉시 공유]
 * ✅ 워터마크 1회 합성 (저장·공유 시점에만)
 */
import { useRef, useEffect, useState, useCallback } from "react";

/* ─── 점멸 CSS (모듈 로드 시 딱 1회 삽입) ─── */
(function injectBlinkStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("__mic_blink__")) return;
  const s = document.createElement("style");
  s.id = "__mic_blink__";
  s.textContent = `
    @keyframes micBlink {
      0%,100%{ opacity:1; box-shadow:0 0 0 0 rgba(255,50,50,.8); }
      50%    { opacity:.45; box-shadow:0 0 0 12px rgba(255,50,50,0); }
    }
    .mic-on{ animation: micBlink .8s ease-in-out infinite; }
  `;
  document.head.appendChild(s);
})();

/* ─── 아이콘 ─── */
const MicSVG = ({ on, size = 22 }) => {
  const c = on ? "#fff" : "#111";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={c} />
      <path d="M5 10a7 7 0 0 0 14 0" stroke={c} />
      <line x1="12" y1="17" x2="12" y2="21" stroke={c} />
      <line x1="8"  y1="21" x2="16" y2="21" stroke={c} />
    </svg>
  );
};

const UndoSVG = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FEE12B" strokeWidth="2" strokeLinecap="round">
    <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
  </svg>
);

const EraseSVG = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5555" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const SaveSVG = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

const ShareSVG = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);

/* ─── 파일명 유틸 ─── */
function nowFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `현장사진_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.jpg`;
}

/* ─── 날짜 문자열 ─── */
function nowDateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ─── 워터마크 합성 → DataURL 반환 (딱 1회) ─── */
function makeWatermarkedDataUrl(srcCanvas, text) {
  // 오프스크린 캔버스로 복사
  const off = document.createElement("canvas");
  off.width  = srcCanvas.width;
  off.height = srcCanvas.height;
  const ctx  = off.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0);

  // 워터마크 텍스트 구성
  const dateStr = nowDateStr();
  const label   = text.trim() ? `${dateStr}  |  ${text.trim()}` : dateStr;

  // 폰트 크기 (캔버스 너비 기준, 최소 28px)
  const fs = Math.max(Math.round(off.width * 0.028), 28);
  ctx.font = `bold ${fs}px 'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif`;
  ctx.textBaseline = "middle";

  // 배경 (하단 전체 너비 100%)
  const padY = Math.round(fs * 0.65);
  const boxH = fs + padY * 2;
  const boxY = off.height - boxH;
  ctx.fillStyle = "rgba(254,225,43,0.82)";
  ctx.fillRect(0, boxY, off.width, boxH);

  // 텍스트
  const padX = Math.round(off.width * 0.02);
  ctx.fillStyle = "rgba(0,0,0,0.93)";
  ctx.fillText(label, padX, boxY + boxH / 2);

  return off.toDataURL("image/jpeg", 0.92);
}

/* ─── STT 훅 ─── */
function useStt() {
  const recRef = useRef(null);
  const [text, setText]         = useState("");
  const [listening, setListening] = useState(false);

  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // 토글: 켜져 있으면 끄고, 꺼져 있으면 켠다
  const toggle = useCallback(() => {
    // ── 녹음 중 → 중지 ──
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    // ── 녹음 시작 ──
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다.\nChrome이나 Samsung Browser를 사용해 주세요.");
      return;
    }
    const r = new SR();
    r.lang            = "ko-KR";
    r.continuous      = false;   // 한 발화 후 자동 종료
    r.interimResults  = false;

    r.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final.trim()) {
        setText((prev) => {
          const t = prev.trim();
          return t ? t + " " + final.trim() : final.trim();
        });
      }
    };
    r.onerror = () => { setListening(false); };
    r.onend   = () => { setListening(false); }; // 인식 종료 시 반드시 점멸 해제

    recRef.current = r;
    r.start();
    setListening(true);
  }, [listening]);

  const clear = useCallback(() => setText(""), []);

  return { text, setText, listening, supported, toggle, clear };
}

/* ─── 캔버스 드로잉 훅 ─── */
function useDrawing(imageDataUrl, canvasRef) {
  const drawing    = useRef(false);
  const strokes    = useRef([]);
  const current    = useRef([]);

  // 이미지 초기 로드
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !imageDataUrl) return;
    const img = new Image();
    img.onload = () => {
      cv.width  = img.naturalWidth;
      cv.height = img.naturalHeight;
      cv.getContext("2d").drawImage(img, 0, 0);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  // 전체 재그리기
  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
      strokes.current.forEach((s) => {
        if (s.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth   = Math.max(cv.width / 80, 8);
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.moveTo(s[0].x, s[0].y);
        s.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, canvasRef]);

  // 터치→캔버스 좌표
  const pos = useCallback((e) => {
    const cv   = canvasRef.current;
    const r    = cv.getBoundingClientRect();
    const t    = e.touches ? e.touches[0] : e;
    return {
      x: (t.clientX - r.left) * (cv.width  / r.width),
      y: (t.clientY - r.top)  * (cv.height / r.height),
    };
  }, [canvasRef]);

  const onStart = useCallback((e) => {
    e.preventDefault();
    drawing.current = true;
    current.current = [pos(e)];
  }, [pos]);

  const onMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const cv  = canvasRef.current;
    const ctx = cv.getContext("2d");
    const p   = pos(e);
    current.current.push(p);
    const s = current.current;
    if (s.length >= 2) {
      const prev = s[s.length - 2];
      ctx.beginPath();
      ctx.strokeStyle = "#FF0000";
      ctx.lineWidth   = Math.max(cv.width / 80, 8);
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, [canvasRef, pos]);

  const onEnd = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (current.current.length > 0) {
      strokes.current.push([...current.current]);
      current.current = [];
    }
  }, []);

  const undo = useCallback(() => {
    if (!strokes.current.length) return;
    strokes.current.pop();
    redraw();
  }, [redraw]);

  const erase = useCallback(() => {
    strokes.current = [];
    redraw();
  }, [redraw]);

  return { onStart, onMove, onEnd, undo, erase };
}

/* ══════════════════════════════════════════════
   메인 컴포넌트
══════════════════════════════════════════════ */
export default function EditScreen({ imageDataUrl, onRetake }) {
  const canvasRef = useRef(null);

  // STT
  const { text, setText, listening, supported, toggle, clear } = useStt();

  // 드로잉
  const { onStart, onMove, onEnd, undo, erase } = useDrawing(imageDataUrl, canvasRef);

  // UI 피드백 (저장/공유 결과)
  const [result, setResult] = useState(null); // { ok, msg }
  const [busy, setBusy]     = useState(false);

  /* ── 공통: 워터마크 붙인 DataURL 얻기 ── */
  const getDataUrl = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return null;
    return makeWatermarkedDataUrl(cv, text);
  }, [text]);

  /* ── [보관함 저장] 버튼 핸들러 ── */
  const handleSave = useCallback(() => {
    const url = getDataUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href     = url;
    a.download = nowFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setResult({ ok: true, msg: "📁 갤러리에 저장됐심더!" });
  }, [getDataUrl]);

  /* ── [즉시 공유] 버튼 핸들러 ── */
  const handleShare = useCallback(async () => {
    if (busy) return;
    const dataUrl = getDataUrl();
    if (!dataUrl) return;

    setBusy(true);
    setResult(null);
    try {
      // DataURL → File
      const [head, b64] = dataUrl.split(",");
      const mime = head.match(/:(.*?);/)[1];
      const bin  = atob(b64);
      const buf  = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const file = new File([buf], nowFilename(), { type: mime });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "현장 보고서", text: text || "" });
        setResult({ ok: true, msg: "✅ 공유 완료됐심더!" });
      } else {
        // Share API 미지원 → 다운로드 폴백
        const blobUrl = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = nowFilename();
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        setResult({ ok: true, msg: "⬇️ 다운로드로 저장됐심더!" });
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setResult({ ok: false, msg: "전송 실패. 다시 눌러보이소." });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, getDataUrl, text]);

  /* ════════ JSX ════════ */
  return (
    <div style={{ position:"fixed", inset:0, background:"#000", display:"flex", flexDirection:"column" }}>

      {/* ── 상단 툴바 ── */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 12px", minHeight:54, flexShrink:0,
        background:"rgba(0,0,0,0.88)",
      }}>
        {/* 다시 찍기 */}
        <button
          onClick={onRetake} onTouchStart={onRetake}
          style={btn({ color:"#FEE12B", background:"rgba(255,255,255,0.08)", padding:"8px 16px", borderRadius:12, fontSize:15, fontWeight:700 })}
          aria-label="다시 찍기"
        >← 다시</button>

        <span style={{ color:"rgba(255,255,255,0.5)", fontSize:13, fontWeight:700, letterSpacing:2 }}>
          마킹 &amp; 전송
        </span>

        {/* 되돌리기 / 지우기 */}
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={undo}  onTouchStart={undo}  style={iconBtn()} aria-label="되돌리기"><UndoSVG /></button>
          <button onClick={erase} onTouchStart={erase} style={iconBtn()} aria-label="지우기"><EraseSVG /></button>
        </div>
      </div>

      {/* ── 캔버스 영역 ── */}
      <div style={{ flex:1, position:"relative", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", background:"#000" }}>
        <canvas
          ref={canvasRef}
          style={{ maxWidth:"100%", maxHeight:"100%", display:"block", touchAction:"none", cursor:"crosshair" }}
          onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
        />
        {/* 마킹 안내 */}
        <div style={{
          position:"absolute", top:12, left:"50%", transform:"translateX(-50%)",
          background:"rgba(210,0,0,0.8)", color:"#fff",
          padding:"4px 14px", borderRadius:99, fontSize:12, fontWeight:800,
          letterSpacing:"0.04em", whiteSpace:"nowrap", pointerEvents:"none",
        }}>손가락으로 문제 부위 표시하이소</div>
      </div>

      {/* ── STT 입력 영역 ── */}
      <div style={{ flexShrink:0, background:"rgba(0,0,0,0.93)", borderTop:"2px solid rgba(254,225,43,0.28)" }}>
        {/* 상태 레이블 */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px 4px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {listening && (
              <span style={{ color:"#FF3B3B", fontSize:14,
                animation:"micBlink .8s ease-in-out infinite" }}>●</span>
            )}
            <span style={{ color:"#FEE12B", fontSize:12, fontWeight:800, letterSpacing:"0.05em" }}>
              {listening ? "듣고 있심더... (말씀하이소)" : "음성 메모 (직접 수정 가능)"}
            </span>
          </div>
          {text && (
            <button onClick={clear} onTouchStart={clear}
              style={btn({ color:"#FF5555", background:"rgba(255,80,80,0.12)", padding:"4px 12px", borderRadius:8, fontSize:12, fontWeight:800 })}>
              지우기
            </button>
          )}
        </div>

        {/* textarea + 마이크 버튼 (1개) */}
        <div style={{ position:"relative" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              listening ? "" :
              supported ? "마이크 버튼을 눌러 음성 메모를 추가하거나\n여기를 직접 터치해서 입력하이소"
                        : "여기를 터치해서 직접 입력하이소"
            }
            rows={3}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e)  => e.stopPropagation()}
            style={{
              display:"block", width:"100%", boxSizing:"border-box",
              padding: supported ? "10px 62px 14px 16px" : "10px 16px 14px",
              background:"rgba(255,255,255,0.05)", color:"#fff",
              fontSize:20, fontWeight:700, lineHeight:1.55,
              border:"none", outline:"none", resize:"none",
              fontFamily:"inherit", caretColor:"#FEE12B",
              userSelect:"text", WebkitUserSelect:"text",
            }}
          />

          {/* ★ 마이크 버튼 — 단 1개 ★ */}
          {supported && (
            <button
              onClick={toggle}
              onTouchStart={(e) => { e.stopPropagation(); toggle(); }}
              className={listening ? "mic-on" : ""}
              aria-label={listening ? "녹음 중지" : "음성 입력 시작"}
              style={{
                position:"absolute", right:10, bottom:10,
                width:44, height:44, borderRadius:"50%",
                border:"none", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                background: listening ? "#FF3B3B" : "rgba(254,225,43,0.92)",
                boxShadow: listening ? "0 0 0 3px rgba(255,59,59,.45)" : "0 2px 8px rgba(0,0,0,.4)",
                transition:"background .18s",
                touchAction:"manipulation",
              }}
            ><MicSVG on={listening} size={22} /></button>
          )}
        </div>
      </div>

      {/* ── 피드백 메시지 ── */}
      {result && (
        <div style={{
          flexShrink:0, padding:"8px 16px", textAlign:"center",
          fontWeight:800, fontSize:15, color:"#fff",
          background: result.ok ? "rgba(0,165,70,0.9)" : "rgba(200,30,30,0.9)",
        }}>{result.msg}</div>
      )}

      {/* ── 하단 2버튼 바 ── */}
      <div style={{
        flexShrink:0, display:"flex", gap:12,
        padding:"12px 16px 32px", background:"rgba(0,0,0,0.92)",
      }}>
        {/* 보관함 저장 */}
        <button
          onClick={handleSave} onTouchStart={handleSave}
          style={actionBtn()}
          aria-label="보관함 저장"
        >
          <SaveSVG />
          <span style={{ fontSize:13, fontWeight:900, color:"#111" }}>보관함 저장</span>
        </button>

        {/* 즉시 공유 */}
        <button
          onClick={handleShare}
          onTouchStart={!busy ? handleShare : undefined}
          disabled={busy}
          style={actionBtn({ opacity: busy ? 0.55 : 1 })}
          aria-label="즉시 공유"
        >
          {busy
            ? <span style={{ fontSize:15, fontWeight:900, color:"#111" }}>처리 중...</span>
            : <><ShareSVG /><span style={{ fontSize:13, fontWeight:900, color:"#111" }}>즉시 공유</span></>
          }
        </button>
      </div>
    </div>
  );
}

/* ─── 스타일 헬퍼 (inline-style 간결화) ─── */
function btn(extra = {}) {
  return {
    border:"none", cursor:"pointer", touchAction:"manipulation",
    fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center",
    ...extra,
  };
}
function iconBtn() {
  return btn({
    width:44, height:44, borderRadius:10,
    background:"rgba(255,255,255,0.08)",
  });
}
function actionBtn(extra = {}) {
  return {
    flex:1, height:80, borderRadius:16,
    border:"none", cursor:"pointer", touchAction:"manipulation",
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    gap:6, background:"#FEE12B", fontFamily:"inherit",
    transition:"transform .12s", ...extra,
  };
}
