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

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };
type Layer = { id: number; visible: boolean; strokes: Stroke[] };

function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.3-6.4L3 9" />
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

/* ---------------------------------------------------------------
   그림판

   획 목록을 레이어별로 나눠 들고 있다가, 보이는 레이어를 순서대로 한 캔버스에
   그립니다. 캔버스를 여러 장 겹치지 않아도 되고, 되돌리기도 목록에서 하나 빼면
   끝입니다. 캔버스 스냅샷을 쌓는 방식은 한 장이 500KB 라 금세 메모리를 씁니다.
   --------------------------------------------------------------- */
function OekakiPad({
  onDone,
  onCancel
}: {
  onDone: (dataUrl: string, comment: string) => Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<Layer[]>([{ id: 1, visible: true, strokes: [] }]);
  const [activeId, setActiveId] = useState(1);
  const liveRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [erasing, setErasing] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;
  const active = layers.find(l => l.id === activeId) ?? layers[0];

  const paint = useCallback((c: CanvasRenderingContext2D, s: Stroke) => {
    c.strokeStyle = s.color;
    c.lineWidth = s.width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    s.points.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
    /* 점 하나만 찍은 경우에도 보이도록 같은 자리를 한 번 더 잇습니다. */
    if (s.points.length === 1) c.lineTo(s.points[0].x + 0.01, s.points[0].y);
    c.stroke();
  }, []);

  /* 레이어가 확정될 때(그리기 끝, 되돌리기, 켜고 끄기)만 전체를 다시 그립니다.
     그리는 도중에는 아래 onMove 가 선분만 덧그려 반응이 즉각적입니다. */
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = BACKGROUND;
    c.fillRect(0, 0, SIZE, SIZE);
    layers.forEach(layer => {
      if (layer.visible) layer.strokes.forEach(s => paint(c, s));
    });
  }, [layers, paint]);

  /* 화면에서 줄어든 만큼 좌표를 캔버스 기준으로 되돌립니다. */
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.visible) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    liveRef.current = {
      color: erasing ? BACKGROUND : color,
      width: erasing ? width * 2 : width,
      points: [toCanvas(e)]
    };
    const c = ctx();
    if (c) paint(c, liveRef.current);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    const c = ctx();
    if (!live || !c) return;
    const p = toCanvas(e);
    const last = live.points[live.points.length - 1];
    live.points.push(p);
    c.strokeStyle = live.color;
    c.lineWidth = live.width;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(last.x, last.y);
    c.lineTo(p.x, p.y);
    c.stroke();
  };

  /* 손을 떼면 선택한 레이어에 획을 넣습니다. 이때 전체가 다시 그려지므로
     아래쪽 레이어에 그린 획이 제 순서(위 레이어 밑)로 돌아갑니다. */
  const onUp = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live) return;
    setLayers(prev =>
      prev.map(l => (l.id === activeId ? { ...l, strokes: [...l.strokes, live] } : l))
    );
  };

  const undo = () =>
    setLayers(prev =>
      prev.map(l => (l.id === activeId ? { ...l, strokes: l.strokes.slice(0, -1) } : l))
    );

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const id = Math.max(...layers.map(l => l.id)) + 1;
    setLayers(prev => [...prev, { id, visible: true, strokes: [] }]);
    setActiveId(id);
  };

  const removeLayer = (id: number) => {
    if (layers.length <= 1) return;
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeId === id) setActiveId(layers.find(l => l.id !== id)!.id);
  };

  const hasDrawing = layers.some(l => l.strokes.length > 0);

  const submit = async () => {
    if (sending) return;
    if (!hasDrawing) {
      setError("그림을 그려 주세요.");
      return;
    }
    const canvas = canvasRef.current;
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

  return (
    <div className="cy-oe-pad">
      <canvas
        ref={canvasRef}
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
              className={"cy-oe-color" + (!erasing && c === color ? " is-on" : "")}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setErasing(false);
              }}
              aria-label={`색 ${c}`}
              aria-pressed={!erasing && c === color}
            />
          ))}
        </div>

        <div className="cy-oe-row">
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
            className={"cy-oe-icon" + (erasing ? " is-on" : "")}
            onClick={() => setErasing(v => !v)}
            aria-pressed={erasing}
            aria-label="지우개"
            title="지우개"
          >
            <EraserIcon />
          </button>
          <button
            type="button"
            className="cy-oe-icon"
            onClick={undo}
            disabled={active.strokes.length === 0}
            aria-label="되돌리기"
            title="되돌리기 (선택한 레이어)"
          >
            <UndoIcon />
          </button>

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

        {!active.visible ? (
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
        <span className="cy-sub-text">그림 남기기</span>
      </div>

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
