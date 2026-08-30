"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OEKAKI_LIMITS,
  addOekaki,
  addOekakiReply,
  canDeleteEntry,
  deleteOekaki,
  deleteOekakiReply,
  isGuestbookEnabled,
  isOwner,
  setOekakiHidden,
  signInWithGoogle,
  subscribeOekaki,
  subscribeOekakiReplies,
  subscribeUser,
  type OekakiEntry,
  type OekakiReply,
  type SignedInUser
} from "@/lib/firebase";

/* 캔버스 한 변입니다. 휴대폰에서 그림 영역이 약 300px 이라 360 이면 0.83배로
   거의 1:1 로 줄어듭니다. 더 키우면 손가락 하나가 덮는 캔버스 픽셀이 늘어
   선이 의도보다 굵고 거칠어집니다. 데스크톱 우측 패널(644px)에서는 1:1 입니다. */
const SIZE = 360;

/* 옛날 오에카키 팔레트처럼 회색 한 줄에 색상 세 줄입니다. */
const COLORS = [
  "#000000", "#444444", "#888888", "#bbbbbb", "#e5e5e5", "#ffffff",
  "#7f1d1d", "#dc2626", "#f87171", "#ea580c", "#f59e0b", "#fcd34d",
  "#14532d", "#16a34a", "#4ade80", "#0e7490", "#06b6d4", "#67e8f9",
  "#1e3a8a", "#2563eb", "#60a5fa", "#6d28d9", "#a855f7", "#ec4899"
];
/* 캔버스 기준 굵기라 화면이 줄어도 비율이 같습니다. */
const WIDTHS = [3, 7, 16];
const BACKGROUND = "#ffffff";
/* 좁은 화면에서 목록이 감당이 안 되므로 제한합니다. */
const MAX_LAYERS = 4;
/* 한 쪽에 보이는 그림 수입니다. 항목마다 덧글 구독이 붙으므로 작게 둡니다. */
const PAGE_SIZE = 5;
/* 되돌리기 한 단계가 360x360 RGBA 로 518KB 입니다. 15단계면 약 7.8MB 입니다. */
const MAX_UNDO = 15;
/* 채우기 허용 오차입니다. 선 가장자리가 부드럽게 처리돼 있어 0 이면
   경계에 흰 테가 남습니다. */
const FILL_TOLERANCE = 48;

type Tool = "pen" | "eraser" | "fill" | "pick";
type LayerMeta = { id: number; visible: boolean };

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

/* 화면에 보이는 그림(합쳐진 결과)에서 누른 지점과 이어진 영역을 찾습니다.
   찾은 영역만 1 로 표시한 배열을 돌려주고, 실제 색칠은 선택한 레이어에 합니다.
   그래야 선이 다른 레이어에 있어도 그 안쪽이 칠해집니다. */
function floodMask(src: ImageData, startX: number, startY: number) {
  const { width: w, height: h, data } = src;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const s = at(startX, startY);
  const sr = data[s], sg = data[s + 1], sb = data[s + 2];

  const mask = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [startY * w + startX];
  seen[startY * w + startX] = 1;

  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % w;
    const y = (idx - x) / w;
    const p = idx * 4;
    /* 세 채널 차이의 합으로 견줍니다. 사람 눈에 충분하고 계산이 쌉니다. */
    const diff =
      Math.abs(data[p] - sr) + Math.abs(data[p + 1] - sg) + Math.abs(data[p + 2] - sb);
    if (diff > FILL_TOLERANCE) continue;

    mask[idx] = 1;

    if (x > 0 && !seen[idx - 1]) { seen[idx - 1] = 1; stack.push(idx - 1); }
    if (x < w - 1 && !seen[idx + 1]) { seen[idx + 1] = 1; stack.push(idx + 1); }
    if (y > 0 && !seen[idx - w]) { seen[idx - w] = 1; stack.push(idx - w); }
    if (y < h - 1 && !seen[idx + w]) { seen[idx + w] = 1; stack.push(idx + w); }
  }
  return mask;
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19h8" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 20H21" />
      <path d="M15.5 4.5 5 15a2.1 2.1 0 0 0 0 3l3 3h5l7.5-7.5a2.1 2.1 0 0 0 0-3l-2-2a2.1 2.1 0 0 0-3 0Z" />
    </svg>
  );
}
function BucketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5 3.8 7.7a2 2 0 0 0 0 2.8l5.7 5.7a2 2 0 0 0 2.8 0l4.2-4.2Z" />
      <path d="M6 5.5 12.5 12" />
      <path d="M20 13.5s2 2.6 2 4a2 2 0 1 1-4 0c0-1.4 2-4 2-4Z" />
    </svg>
  );
}
function PickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19 3-1.5 1.5" />
      <path d="M17.5 4.5 20 7l-8.5 8.5-3.5 1 1-3.5Z" />
      <path d="M6 16.5 3.5 19 5 20.5 7.5 18" />
    </svg>
  );
}
function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.3-6.4L3 9" />
    </svg>
  );
}

/* ---------------------------------------------------------------
   그림판

   레이어마다 투명한 오프스크린 캔버스를 하나씩 두고, 화면 캔버스에는
   흰 바탕 위로 보이는 레이어를 순서대로 합쳐 올립니다.

   앞서는 획 목록을 다시 그리는 방식이었는데, 채우기는 이미 칠해진 픽셀을
   보고 번져 나가는 연산이라 "획"으로 적어 둘 수가 없어 바꿨습니다.
   되돌리기는 연산 직전 레이어 픽셀을 저장해 두었다가 복원합니다.
   --------------------------------------------------------------- */
function OekakiPad({
  onDone,
  onCancel
}: {
  onDone: (dataUrl: string, comment: string) => Promise<void>;
  onCancel: () => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const undoRef = useRef<{ layerId: number; data: ImageData }[]>([]);
  const redoRef = useRef<{ layerId: number; data: ImageData }[]>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const [layers, setLayers] = useState<LayerMeta[]>([{ id: 1, visible: true }]);
  const [activeId, setActiveId] = useState(1);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  /* 되돌리기 버튼 활성 상태를 다시 그리게 하려고 둡니다. */
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });

  const layerCanvas = useCallback((id: number) => {
    let c = layerRef.current.get(id);
    if (!c) {
      c = document.createElement("canvas");
      c.width = SIZE;
      c.height = SIZE;
      layerRef.current.set(id, c);
    }
    return c;
  }, []);

  /* 흰 바탕 위에 보이는 레이어를 순서대로 얹습니다. 그리는 동안에도 매번
     불러서, 아래쪽 레이어에 그려도 위 레이어에 가려지는 순서가 지켜집니다. */
  const composite = useCallback(() => {
    const view = viewRef.current?.getContext("2d");
    if (!view) return;
    view.globalCompositeOperation = "source-over";
    view.fillStyle = BACKGROUND;
    view.fillRect(0, 0, SIZE, SIZE);
    layers.forEach(l => {
      if (l.visible) view.drawImage(layerCanvas(l.id), 0, 0);
    });
  }, [layers, layerCanvas]);

  useEffect(() => {
    composite();
  }, [composite]);

  const pushUndo = () => {
    const c = layerCanvas(activeId).getContext("2d");
    if (!c) return;
    undoRef.current.push({ layerId: activeId, data: c.getImageData(0, 0, SIZE, SIZE) });
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
    setSteps({ undo: undoRef.current.length, redo: 0 });
  };

  const restore = (from: typeof undoRef, to: typeof redoRef) => {
    const step = from.current.pop();
    if (!step) return;
    const c = layerCanvas(step.layerId).getContext("2d");
    if (!c) return;
    to.current.push({ layerId: step.layerId, data: c.getImageData(0, 0, SIZE, SIZE) });
    c.putImageData(step.data, 0, 0);
    setSteps({ undo: undoRef.current.length, redo: redoRef.current.length });
    composite();
  };

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * SIZE),
      y: Math.floor(((e.clientY - r.top) / r.height) * SIZE)
    };
  };

  const strokeTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = layerCanvas(activeId).getContext("2d");
    if (!c) return;
    /* 지우개는 흰색 덧칠이 아니라 투명 지우기입니다. 흰색으로 칠하면
       아래 레이어까지 가려집니다. */
    c.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.lineWidth = tool === "eraser" ? width * 2 : width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    c.globalCompositeOperation = "source-over";
    composite();
  };

  const doFill = (p: { x: number; y: number }) => {
    const view = viewRef.current?.getContext("2d");
    const c = layerCanvas(activeId).getContext("2d");
    if (!view || !c) return;

    const mask = floodMask(view.getImageData(0, 0, SIZE, SIZE), p.x, p.y);
    const target = c.getImageData(0, 0, SIZE, SIZE);
    const { r, g, b } = hexToRgb(color);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const q = i * 4;
      target.data[q] = r;
      target.data[q + 1] = g;
      target.data[q + 2] = b;
      target.data[q + 3] = 255;
    }
    c.putImageData(target, 0, 0);
    composite();
  };

  const doPick = (p: { x: number; y: number }) => {
    const view = viewRef.current?.getContext("2d");
    if (!view) return;
    const d = view.getImageData(p.x, p.y, 1, 1).data;
    const hex =
      "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    setColor(hex);
    setTool("pen");
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const layer = layers.find(l => l.id === activeId);
    if (!layer?.visible) return;
    const p = toCanvas(e);

    if (tool === "pick") {
      doPick(p);
      return;
    }

    pushUndo();
    setDirty(true);

    if (tool === "fill") {
      doFill(p);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = p;
    strokeTo(p, p);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const from = lastRef.current;
    if (!from) return;
    const p = toCanvas(e);
    strokeTo(from, p);
    lastRef.current = p;
  };

  const onUp = () => {
    lastRef.current = null;
  };

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const id = Math.max(...layers.map(l => l.id)) + 1;
    setLayers(prev => [...prev, { id, visible: true }]);
    setActiveId(id);
  };

  const removeLayer = (id: number) => {
    if (layers.length <= 1) return;
    layerRef.current.delete(id);
    undoRef.current = undoRef.current.filter(s => s.layerId !== id);
    redoRef.current = redoRef.current.filter(s => s.layerId !== id);
    setSteps({ undo: undoRef.current.length, redo: redoRef.current.length });
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeId === id) setActiveId(layers.find(l => l.id !== id)!.id);
  };

  const submit = async () => {
    if (sending) return;
    if (!dirty) {
      setError("그림을 그려 주세요.");
      return;
    }
    const canvas = viewRef.current;
    if (!canvas) return;

    setSending(true);
    setError(null);
    try {
      /* 화면에 보이는 그대로, 즉 켜져 있는 레이어를 합친 결과가 저장됩니다. */
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > OEKAKI_LIMITS.image) {
        throw new Error("그림이 너무 복잡해요. 조금 지우고 다시 남겨 주세요.");
      }
      await onDone(dataUrl, comment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "남기지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  const activeVisible = layers.find(l => l.id === activeId)?.visible ?? true;
  const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: "pen", label: "펜", icon: <PenIcon /> },
    { id: "eraser", label: "지우개", icon: <EraserIcon /> },
    { id: "fill", label: "채우기", icon: <BucketIcon /> },
    { id: "pick", label: "스포이드", icon: <PickIcon /> }
  ];

  return (
    <div className="cy-oe-pad">
      <canvas
        ref={viewRef}
        width={SIZE}
        height={SIZE}
        className="cy-oe-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="그림판"
      />

      <div className="cy-oe-tools">
        <div className="cy-oe-colors">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={"cy-oe-color" + (c === color ? " is-on" : "")}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`색 ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>

        <div className="cy-oe-row">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={"cy-oe-icon" + (tool === t.id ? " is-on" : "")}
              onClick={() => setTool(t.id)}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}

          {WIDTHS.map(w => (
            <button
              key={w}
              type="button"
              className={"cy-oe-width" + (w === width ? " is-on" : "")}
              onClick={() => setWidth(w)}
              aria-label={`굵기 ${w}`}
              aria-pressed={w === width}
            >
              <span style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}

          <button
            type="button"
            className="cy-oe-icon"
            onClick={() => restore(undoRef, redoRef)}
            disabled={steps.undo === 0}
            aria-label="되돌리기"
            title="되돌리기"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="cy-oe-icon"
            onClick={() => restore(redoRef, undoRef)}
            disabled={steps.redo === 0}
            aria-label="다시하기"
            title="다시하기"
          >
            <UndoIcon flip />
          </button>
        </div>

        <div className="cy-oe-row">
          <span className="cy-oe-layers">
            {layers.map((l, i) => (
              <span key={l.id} className="cy-oe-layer">
                <button
                  type="button"
                  className={"cy-oe-layer-pick" + (l.id === activeId ? " is-on" : "")}
                  onClick={() => setActiveId(l.id)}
                  aria-pressed={l.id === activeId}
                  title={`레이어 ${i + 1} 선택`}
                >
                  {i + 1}
                </button>
                <button
                  type="button"
                  className={"cy-oe-layer-eye" + (l.visible ? "" : " is-off")}
                  onClick={() =>
                    setLayers(prev =>
                      prev.map(x => (x.id === l.id ? { ...x, visible: !x.visible } : x))
                    )
                  }
                  aria-label={`레이어 ${i + 1} ${l.visible ? "숨기기" : "보이기"}`}
                  title={l.visible ? "숨기기" : "보이기"}
                >
                  {l.visible ? "◉" : "○"}
                </button>
                {layers.length > 1 ? (
                  <button
                    type="button"
                    className="cy-oe-layer-del"
                    onClick={() => removeLayer(l.id)}
                    aria-label={`레이어 ${i + 1} 지우기`}
                    title="이 레이어 지우기"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {layers.length < MAX_LAYERS ? (
              <button type="button" className="cy-oe-icon" onClick={addLayer} title="레이어 추가">
                +
              </button>
            ) : null}
          </span>
        </div>

        {!activeVisible ? (
          <p className="cy-oe-hidden-note">선택한 레이어가 숨겨져 있어 그릴 수 없어요.</p>
        ) : null}

        <div className="cy-oe-row">
          <input
            className="cy-oe-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="제목 (안 써도 됩니다)"
            maxLength={OEKAKI_LIMITS.comment}
            aria-label="그림 제목"
          />
          <button type="button" className="cy-gb-submit" onClick={submit} disabled={sending}>
            {sending ? "올리는 중" : "남기기"}
          </button>
          <button type="button" className="cy-oe-btn" onClick={onCancel} disabled={sending}>
            닫기
          </button>
        </div>

        {error ? <span className="cy-gb-message is-error">{error}</span> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   목록 한 줄. 그림 옆에 글쓴이, 제목, 덧글이 붙습니다.
   --------------------------------------------------------------- */
function OekakiRow({
  item,
  viewer,
  onOpen
}: {
  item: OekakiEntry;
  viewer: SignedInUser | null;
  onOpen: () => void;
}) {
  const [replies, setReplies] = useState<OekakiReply[]>([]);

  useEffect(
    () => subscribeOekakiReplies(item.id, setReplies, () => setReplies([])),
    [item.id]
  );

  return (
    <li className="cy-oe-item">
      <button
        type="button"
        className="cy-oe-thumb"
        onClick={onOpen}
        aria-label={`${item.author} 님의 그림 열기`}
      >
        {/* data URL 이라 next/image 를 쓸 수 없고 최적화 대상도 아닙니다. */}
        <img src={item.image} alt={item.comment || `${item.author} 님의 그림`} loading="lazy" />
        {item.hidden ? <span className="cy-oe-badge">가림</span> : null}
      </button>

      <div className="cy-oe-side">
        <div className="cy-oe-side-head">
          {item.comment ? (
            <button type="button" className="cy-oe-title" onClick={onOpen}>
              {item.comment}
            </button>
          ) : (
            <button type="button" className="cy-oe-title is-empty" onClick={onOpen}>
              제목 없음
            </button>
          )}
          <span className="cy-oe-author">{item.author}</span>
          <span className="cy-oe-date">
            {item.date} {item.time}
          </span>
        </div>

        {replies.length > 0 ? (
          <ul className="cy-oe-reply-preview">
            {replies.slice(-3).map(r => (
              <li key={r.id}>
                <span className="cy-oe-reply-author">{r.author}</span>
                <span className="cy-oe-reply-text">{r.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button type="button" className="cy-oe-more" onClick={onOpen}>
          {replies.length > 0 ? `덧글 ${replies.length}개 보기` : "덧글 남기기"}
        </button>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------
   그림 한 장을 크게 보고 덧글을 다는 화면
   --------------------------------------------------------------- */
function OekakiDetail({
  item,
  viewer,
  onClose,
  onDeleted
}: {
  item: OekakiEntry;
  viewer: SignedInUser | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [replies, setReplies] = useState<OekakiReply[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOekakiReplies(item.id, setReplies, () => setReplies([])), [item.id]);

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await addOekakiReply(item.id, text);
      setText("");
    });

  const removeDrawing = () => {
    if (!window.confirm("이 그림을 지울까요? 되돌릴 수 없어요.")) return;
    run(async () => {
      await deleteOekaki(item.id);
      onDeleted();
    });
  };

  return (
    <div className="cy-oe-detail">
      <div className="cy-oe-detail-head">
        <button type="button" className="cy-oe-btn" onClick={onClose}>
          목록으로
        </button>
        {isOwner(viewer) ? (
          <button
            type="button"
            className="cy-oe-btn"
            onClick={() => run(() => setOekakiHidden(item.id, !item.hidden))}
            disabled={busy}
          >
            {item.hidden ? "가림 풀기" : "가림 처리"}
          </button>
        ) : null}
        {canDeleteEntry(viewer, item.uid) ? (
          <button type="button" className="cy-oe-btn" onClick={removeDrawing} disabled={busy}>
            그림 삭제
          </button>
        ) : null}
      </div>

      {item.hidden ? (
        <p className="cy-oe-hidden-note">가림 처리된 그림입니다. 주인장에게만 보입니다.</p>
      ) : null}

      <img className="cy-oe-big" src={item.image} alt={item.comment || `${item.author} 님의 그림`} />

      <div className="cy-oe-detail-meta">
        {item.comment ? <span className="cy-oe-title-text">{item.comment}</span> : null}
        <span className="cy-oe-author">{item.author}</span>
        <span className="cy-oe-date">
          {item.date} {item.time}
        </span>
      </div>

      <div className="cy-oe-replies">
        {replies === null ? (
          <div className="cy-gb-loading">덧글을 불러오는 중…</div>
        ) : replies.length === 0 ? (
          <div className="cy-gb-loading">아직 덧글이 없어요.</div>
        ) : (
          replies.map(r => (
            <div key={r.id} className="cy-oe-reply">
              <span className="cy-oe-reply-author">{r.author}</span>
              <span className="cy-oe-reply-text">{r.text}</span>
              <span className="cy-oe-date">
                {r.date} {r.time}
                {canDeleteEntry(viewer, r.uid) ? (
                  <button
                    type="button"
                    className="cg-act"
                    onClick={() => run(() => deleteOekakiReply(item.id, r.id))}
                  >
                    삭제
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>

      {viewer ? (
        <div className="cy-oe-row">
          <input
            className="cy-oe-comment"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`${viewer.name} 님으로 덧글 남기기`}
            maxLength={OEKAKI_LIMITS.reply}
            aria-label="덧글"
          />
          <button type="button" className="cy-gb-submit" onClick={send} disabled={busy}>
            {busy ? "다는 중" : "덧글"}
          </button>
        </div>
      ) : (
        <div className="cy-gb-signin">
          <button type="button" className="cy-gb-google" onClick={() => signInWithGoogle()}>
            구글 로그인
          </button>
          <span className="cy-gb-signin-text">하면 덧글을 남길 수 있어요.</span>
        </div>
      )}

      {error ? <span className="cy-gb-message is-error">{error}</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------
   목록
   --------------------------------------------------------------- */
export default function Oekaki() {
  const [items, setItems] = useState<OekakiEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<SignedInUser | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const viewer = me ?? null;

  useEffect(() => {
    if (!isGuestbookEnabled) return;
    return subscribeUser(setMe);
  }, []);

  /* 주인장인지에 따라 질의가 달라지므로 로그인 상태가 바뀌면 다시 겁니다. */
  useEffect(() => {
    if (!isGuestbookEnabled || me === undefined) return;
    return subscribeOekaki(60, viewer, setItems, () => setFailed(true));
  }, [viewer, me]);

  const save = async (dataUrl: string, comment: string) => {
    await addOekaki(dataUrl, comment);
    setOpen(false);
    setPage(0);
    setNotice("그림을 남겼어요. 고맙습니다!");
  };

  if (!isGuestbookEnabled || failed) return null;

  const viewing = items?.find(i => i.id === openId) ?? null;
  const list = items ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = list.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="cy-content-box">
      <div className="cy-section-title">
        오에카키
        <span className="cy-sub-text">그림으로 남기는 방명록</span>
        <button
          type="button"
          className="cy-oe-help-btn"
          onClick={() => setHelp(v => !v)}
          aria-expanded={help}
          aria-label="오에카키가 무엇인지 보기"
          title="이게 뭔가요?"
        >
          ?
        </button>
      </div>

      {help ? (
        <div className="cy-oe-help">
          <p>
            <b>오에카키(お絵かき)</b>는 2000년대 초 게시판에서 유행하던 그림 방명록입니다.
            따로 프로그램을 깔지 않고 웹페이지에서 바로 그려 올리고, 서로 덧글을 달았습니다.
          </p>
          <p>
            잘 그릴 필요 없습니다. 낙서가 제 맛입니다. 지나간 자리에 그림 한 장 남겨 주세요.
          </p>
          <p className="cy-oe-help-tip">
            펜으로 그리고, 채우기로 안쪽을 칠하고, 스포이드로 이미 쓴 색을 다시 집습니다.
            레이어를 나누면 밑그림 위에 덧그렸다가 밑그림만 끌 수 있어요.
          </p>
        </div>
      ) : null}

      {viewing ? (
        <OekakiDetail
          item={viewing}
          viewer={viewer}
          onClose={() => setOpenId(null)}
          onDeleted={() => setOpenId(null)}
        />
      ) : (
        <>
          {open ? (
            <OekakiPad onDone={save} onCancel={() => setOpen(false)} />
          ) : me === undefined ? null : me ? (
            <div className="cy-oe-start">
              <button
                type="button"
                className="cy-gb-submit"
                onClick={() => {
                  setNotice(null);
                  setOpen(true);
                }}
              >
                그림 그리기
              </button>
              {notice ? <span className="cy-gb-message">{notice}</span> : null}
            </div>
          ) : (
            <div className="cy-gb-signin">
              <button type="button" className="cy-gb-google" onClick={() => signInWithGoogle()}>
                구글 로그인
              </button>
              <span className="cy-gb-signin-text">하면 그림을 남길 수 있어요.</span>
            </div>
          )}

          {items === null ? (
            <div className="cy-gb-loading">그림을 불러오는 중…</div>
          ) : list.length === 0 ? (
            <div className="cy-gb-loading">아직 그림이 없어요.</div>
          ) : (
            <>
              <ul className="cy-oe-list">
                {shown.map(item => (
                  <OekakiRow
                    key={item.id}
                    item={item}
                    viewer={viewer}
                    onOpen={() => setOpenId(item.id)}
                  />
                ))}
              </ul>

              {pageCount > 1 ? (
                <div className="cy-gb-pagination">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`cy-gb-page${i === current ? " is-active" : ""}`}
                      onClick={() => setPage(i)}
                      aria-current={i === current ? "page" : undefined}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
