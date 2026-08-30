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

/* 옛날 오에카키 팔레트 느낌으로 적게 둡니다. 고를 것이 많으면 오히려 안 그립니다. */
const COLORS = [
  "#222222", "#e8342b", "#f4a11c", "#3aa757",
  "#2b5ce6", "#8b5cf6", "#e8659b", "#8a6e4b"
];
/* 캔버스 기준 굵기라 화면이 줄어도 비율이 같습니다. */
const WIDTHS = [3, 7, 16];
const BACKGROUND = "#ffffff";

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };

/* ---------------------------------------------------------------
   그림판
   되돌리기는 획 목록을 다시 그리는 방식입니다. 캔버스 스냅샷을 쌓으면
   360x360 한 장이 500KB 라 몇 번만 눌러도 메모리를 크게 씁니다.
   --------------------------------------------------------------- */
function OekakiPad({
  onDone,
  onCancel
}: {
  onDone: (dataUrl: string, comment: string) => Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [erasing, setErasing] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const drawStroke = useCallback((c: CanvasRenderingContext2D, s: Stroke) => {
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

  const redraw = useCallback(
    (list: Stroke[]) => {
      const c = ctx();
      if (!c) return;
      c.fillStyle = BACKGROUND;
      c.fillRect(0, 0, SIZE, SIZE);
      list.forEach(s => drawStroke(c, s));
    },
    [drawStroke]
  );

  /* 획이 확정될 때(그리기 끝, 되돌리기, 전체 지우기)만 다시 그립니다.
     그리는 도중에는 아래 onMove 가 선분만 덧그려 반응이 즉각적입니다. */
  useEffect(() => {
    redraw(strokes);
  }, [strokes, redraw]);

  /* 화면에서 줄어든 만큼 좌표를 캔버스 기준으로 되돌립니다. */
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    liveRef.current = {
      color: erasing ? BACKGROUND : color,
      width: erasing ? width * 2 : width,
      points: [toCanvas(e)]
    };
    const c = ctx();
    if (c) drawStroke(c, liveRef.current);
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

  const onUp = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live) setStrokes(prev => [...prev, live]);
  };

  const submit = async () => {
    if (sending) return;
    if (strokes.length === 0) {
      setError("그림을 그려 주세요.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSending(true);
    setError(null);
    try {
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
            className={"cy-oe-btn" + (erasing ? " is-on" : "")}
            onClick={() => setErasing(v => !v)}
            aria-pressed={erasing}
          >
            지우개
          </button>
          <button
            type="button"
            className="cy-oe-btn"
            onClick={() => setStrokes(prev => prev.slice(0, -1))}
            disabled={strokes.length === 0}
          >
            되돌리기
          </button>
          <button
            type="button"
            className="cy-oe-btn"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0}
          >
            전체 지우기
          </button>
        </div>

        <div className="cy-oe-row">
          <input
            className="cy-oe-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="그림에 한마디 (안 써도 됩니다)"
            maxLength={OEKAKI_LIMITS.comment}
            aria-label="그림에 붙일 한마디"
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
   그림 한 장을 크게 보고 댓글을 다는 화면
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

  const toggleHidden = () =>
    run(async () => {
      await setOekakiHidden(item.id, !item.hidden);
    });

  return (
    <div className="cy-oe-detail">
      <div className="cy-oe-detail-head">
        <button type="button" className="cy-oe-btn" onClick={onClose}>
          목록으로
        </button>
        {isOwner(viewer) ? (
          <button type="button" className="cy-oe-btn" onClick={toggleHidden} disabled={busy}>
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

      {/* data URL 이라 next/image 를 쓸 수 없고 최적화 대상도 아닙니다. */}
      <img className="cy-oe-big" src={item.image} alt={item.comment || `${item.author} 님의 그림`} />

      <div className="cy-oe-detail-meta">
        <span className="cy-oe-author">{item.author}</span>
        {item.comment ? <span className="cy-oe-comment-text">{item.comment}</span> : null}
        <span className="cy-oe-date">
          {item.date} {item.time}
        </span>
      </div>

      <div className="cy-oe-replies">
        {replies === null ? (
          <div className="cy-gb-loading">댓글을 불러오는 중…</div>
        ) : replies.length === 0 ? (
          <div className="cy-gb-loading">아직 댓글이 없어요.</div>
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
            placeholder={`${viewer.name} 님으로 댓글 남기기`}
            maxLength={OEKAKI_LIMITS.reply}
            aria-label="댓글"
          />
          <button type="button" className="cy-gb-submit" onClick={send} disabled={busy}>
            {busy ? "다는 중" : "댓글"}
          </button>
        </div>
      ) : (
        <div className="cy-gb-signin">
          <button type="button" className="cy-gb-google" onClick={() => signInWithGoogle()}>
            구글 로그인
          </button>
          <span className="cy-gb-signin-text">하면 댓글을 남길 수 있어요.</span>
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
    setNotice("그림을 남겼어요. 고맙습니다!");
  };

  if (!isGuestbookEnabled || failed) return null;

  const viewing = items?.find(i => i.id === openId) ?? null;

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
          ) : items.length === 0 ? (
            <div className="cy-gb-loading">아직 그림이 없어요.</div>
          ) : (
            <ul className="cy-oe-grid">
              {items.map(item => (
                <li key={item.id} className="cy-oe-item">
                  <button
                    type="button"
                    className="cy-oe-thumb"
                    onClick={() => setOpenId(item.id)}
                    aria-label={`${item.author} 님의 그림 열기`}
                  >
                    <img src={item.image} alt={item.comment || `${item.author} 님의 그림`} loading="lazy" />
                    {item.hidden ? <span className="cy-oe-badge">가림</span> : null}
                    <span className="cy-oe-meta">
                      <span className="cy-oe-author">{item.author}</span>
                      {item.comment ? (
                        <span className="cy-oe-comment-text">{item.comment}</span>
                      ) : null}
                      <span className="cy-oe-date">{item.date}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
