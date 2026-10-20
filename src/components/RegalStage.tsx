"use client";

/* 왕실 스킨: 영국 대저택 3D 무대입니다.

   화면 구성
   - 위(세로 화면 60%) 또는 전체(가로 화면)에 지금 방의 3D 장면.
   - 아래 40%(세로) 또는 오른쪽(가로)에 그 방 메뉴 카드. 메뉴 내용은 3D 안에 넣지 않습니다.
   - 오른쪽 위 평면도(지금 방은 금색, 누르면 그 방으로), 왼쪽 위 '대홀로' 버튼.
   - 인물을 누르면 한 줄 말풍선이 뜨고 그 방 메뉴 카드가 열립니다.

   방 구성은 regal/rooms.ts 의 ROOMS 배열 하나만 고치면 됩니다.
   움직임 줄이기 설정이거나 WebGL 이 없으면 방마다 정지 그림 + 평면도로 보여 줍니다. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { asset } from "@/lib/asset";
import { boardPosts, photos, profile } from "@/config/linktree";
import { ENTRANCE_CELL, PLAN_COLS, PLAN_ROWS, ROOMS, ROOM_BY_ID, stillFor, type MenuKey, type Room } from "./regal/rooms";
import type { ManorStage } from "./regal/manorStage";
import type { AlbumImage } from "./regal/manorBuild";

export type RegalExtra = "guestbook" | "bgm" | "links";

const SECRET_KEY = "regal-secret-found";
const HALL = "hall";

function roomForTab(tab: string, tabs: readonly string[]) {
  if (tab === "story" && tabs.includes("story")) return "library";
  const r = ROOMS.find(x => x.menu === tab);
  return r ? r.id : HALL;
}

function initialRoom(active: string, tabs: readonly string[]) {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("room");
    if (q && ROOM_BY_ID[q]) return q;
  }
  return roomForTab(active, tabs);
}

function albumImages(): AlbumImage[] {
  if (photos.length > 0) return photos.map(p => ({ src: p.src, label: p.name }));
  const list: AlbumImage[] = [{ src: profile.miniroom.src, label: "미니룸" }];
  for (const p of boardPosts) if (p.preview) list.push({ src: p.preview.src, label: p.title });
  return list.slice(0, 7);
}

function useLayout() {
  const get = () => {
    if (typeof window === "undefined") return { w: 1280, h: 800, portrait: false };
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { w, h, portrait: w <= 900 && h >= w };
  };
  const [lay, setLay] = useState(get);
  useEffect(() => {
    const on = () => setLay(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return lay;
}

const CARD_W = 420;

export default function RegalStage({
  tabs,
  labels,
  active,
  onSelect,
  renderPanel,
  renderExtra,
  locked,
  onFallback,
  onToggleHud
}: {
  tabs: readonly string[];
  labels: Record<string, string>;
  active: string;
  onSelect: (tab: string) => void;
  renderPanel: (tab: string) => ReactNode;
  renderExtra: (menu: RegalExtra) => ReactNode;
  backgroundRef: RefObject<HTMLDivElement | null>;
  locked: boolean;
  onFallback: () => void;
  hudOpen?: boolean;
  onToggleHud?: () => void;
}) {
  const [room, setRoom] = useState(() => initialRoom(active, tabs));
  const [found, setFound] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; img?: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [still, setStill] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const lay = useLayout();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<ManorStage | null>(null);
  const lockedRef = useRef(locked);
  const roomRef = useRef(room);
  const lastTab = useRef(active);
  const fallbackRef = useRef(onFallback);

  const rect = useMemo(() => {
    if (lay.portrait) return { w: lay.w, h: Math.round(lay.h * 0.6), offsetX: 0 };
    return { w: lay.w, h: lay.h, offsetX: cardOpen ? Math.min(CARD_W, lay.w * 0.38) : 0 };
  }, [lay, cardOpen]);
  const rectRef = useRef(rect);
  /* 무대 쪽 콜백이 늘 최신 값을 읽도록 그린 뒤에 맞춥니다. */
  useLayoutEffect(() => {
    lockedRef.current = locked;
    roomRef.current = room;
    fallbackRef.current = onFallback;
    rectRef.current = rect;
  });

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (sessionStorage.getItem(SECRET_KEY) === "1") setFound(true);
    } catch {
      /* 저장소를 못 쓰면 이번 방문 동안만 기억합니다. */
    }
  }, []);

  useEffect(() => {
    if (room !== "secret" || found) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFound(true);
    try {
      sessionStorage.setItem(SECRET_KEY, "1");
    } catch {
      /* 무시 */
    }
  }, [room, found]);

  /* 방이 바뀌면 그 방 메뉴를 사이트 탭과 맞춥니다. */
  useEffect(() => {
    const r = ROOM_BY_ID[room];
    let tab: string | null = null;
    if (r.menu === "board" && tabs.includes("story") && active === "story") tab = null;
    else if (tabs.includes(r.menu)) tab = r.menu;
    if (tab && tab !== active) {
      lastTab.current = tab;
      onSelect(tab);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBubble(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  /* 밖에서 탭이 바뀌면(주소의 ?tab= 등) 그 방으로 갑니다. */
  const firstTabRun = useRef(true);
  useEffect(() => {
    /* 처음에는 주소의 ?room= 이 먼저입니다. 방 쪽에서 탭을 맞춥니다. */
    if (firstTabRun.current) {
      firstTabRun.current = false;
      return;
    }
    if (active === lastTab.current) return;
    lastTab.current = active;
    const target = roomForTab(active, tabs);
    if (ROOM_BY_ID[roomRef.current].menu === active) return;
    if (stageRef.current) stageRef.current.goTo(target, true);
    else setRoom(target);
  }, [active, tabs]);

  /* 3D 무대 */
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (reduce || !gl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStill(true);
      return;
    }
    let cancelled = false;
    let stage: ManorStage | null = null;
    (async () => {
      try {
        const [THREE, env, mod] = await Promise.all([
          import("three"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
          import("./regal/manorStage")
        ]);
        /* 문패와 박물관 이름표는 캔버스에 글씨를 그리므로 글꼴을 먼저 받습니다. */
        if (document.fonts) {
          await Promise.race([
            Promise.all([
              document.fonts.load('600 40px "Cormorant Garamond"'),
              document.fonts.load('600 40px "Noto Serif KR"', "대홀"),
              document.fonts.load('400 20px "Noto Sans KR"', "가")
            ]),
            new Promise(r => setTimeout(r, 2500))
          ]);
        }
        if (cancelled || !hostRef.current || !viewRef.current) return;
        const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 700;
        stage = mod.createManorStage({
          THREE,
          RoomEnvironment: env.RoomEnvironment,
          host: hostRef.current,
          input: viewRef.current,
          url: asset,
          ctx: {
            ownerPhoto: profile.photo.src,
            ownerLabel: profile.teacherName,
            album: albumImages(),
            roomColor: id => ROOM_BY_ID[id]?.palette.main ?? "#2a2018",
            roomName: id => ROOM_BY_ID[id]?.name ?? "",
            roomEn: id => ROOM_BY_ID[id]?.nameEn ?? ""
          },
          initial: roomRef.current,
          rect: rectRef.current,
          mobile,
          isLocked: () => lockedRef.current,
          events: {
            onRoom: id => setRoom(id),
            onCharacter: () => {
              const r = ROOM_BY_ID[roomRef.current];
              const ch = r.character;
              setBubble({
                text: ch.line,
                img: ch.kind === "cutout" ? ch.expressions[ch.tapExpression] : undefined
              });
              setCardOpen(true);
            },
            onHead: (x, y, visible) => {
              const el = bubbleRef.current;
              if (!el) return;
              el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
              el.style.visibility = visible ? "visible" : "hidden";
            },
            onFade: o => {
              if (fadeRef.current) fadeRef.current.style.opacity = String(o);
            },
            onFail: () => fallbackRef.current()
          }
        });
        stageRef.current = stage;
        setWebglReady(true);
      } catch (err) {
        console.warn("[regal] 3D 를 만들지 못해 정지 그림으로 보여 줍니다.", err);
        if (!cancelled) setStill(true);
      }
    })();
    return () => {
      cancelled = true;
      stage?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.resize(rect);
  }, [rect, webglReady]);

  const go = (id: string) => {
    if (id === room) return;
    if (stageRef.current) stageRef.current.goTo(id, true);
    else setRoom(id);
  };

  /* 방향키: 대저택을 한 바퀴 돕니다. */
  useEffect(() => {
    const order = ROOMS.filter(r => !r.hidden || found).map(r => r.id);
    const onKey = (e: KeyboardEvent) => {
      if (lockedRef.current) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = order.indexOf(roomRef.current);
      const next = order[(i + (e.key === "ArrowRight" ? 1 : order.length - 1)) % order.length];
      if (stageRef.current) stageRef.current.goTo(next, true);
      else setRoom(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [found]);

  const r = ROOM_BY_ID[room];
  const ch = r.character;

  return (
    <div
      className={"cy-manor" + (lay.portrait ? " is-portrait" : " is-wide") + (cardOpen ? " card-open" : "")}
      style={{ ["--manor-room" as string]: r.palette.main, ["--manor-trim" as string]: r.palette.trim }}
    >
      <div className="cy-manor-view" ref={viewRef} style={{ height: rect.h }}>
        <div className="cy-manor-gl" ref={hostRef} />
        {still ? (
          <div className="cy-manor-still" style={{ background: `linear-gradient(160deg, ${r.palette.main}, ${r.palette.second})` }}>
            <img src={asset(stillFor(room))} alt={`${r.name} 그림`} onError={e => (e.currentTarget.style.display = "none")} />
            <button type="button" className="cy-manor-still-who" onClick={() => setBubble({ text: ch.line })}>
              {ch.name}에게 말 걸기
            </button>
          </div>
        ) : null}
        <div className="cy-manor-fade" ref={fadeRef} />
        {bubble ? (
          <div
            className={"cy-manor-bubble" + (still ? " is-still" : "")}
            ref={still ? undefined : bubbleRef}
            role="status"
            onClick={() => setBubble(null)}
          >
            <div className="cy-manor-bubble-in">
              {bubble.img ? (
                <img src={asset(bubble.img)} alt="" />
              ) : null}
              <p>
                <b>{ch.name}</b>
                {bubble.text}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="cy-manor-top">
        <button type="button" className="cy-manor-btn" onClick={() => go(HALL)} disabled={room === HALL}>
          대홀로
        </button>
        {onToggleHud ? (
          <button type="button" className="cy-manor-btn cy-manor-hud" onClick={onToggleHud}>
            주인장
          </button>
        ) : null}
      </div>

      <Minimap room={room} found={found} onGo={go} />

      <section
        className={"cy-manor-card" + (cardOpen ? "" : " is-closed")}
        aria-label={`${r.name} 메뉴`}
        style={lay.portrait ? { top: rect.h } : undefined}
      >
        <header className="cy-manor-card-head">
          <div>
            <span className="cy-manor-en">{r.nameEn}</span>
            <h2>{r.name}</h2>
          </div>
          <span className="cy-manor-menu">{menuLabel(r.menu, labels)}</span>
          {!lay.portrait ? (
            <button type="button" className="cy-manor-fold" onClick={() => setCardOpen(o => !o)} aria-expanded={cardOpen}>
              {cardOpen ? "접기" : "펼치기"}
            </button>
          ) : null}
        </header>
        {cardOpen || lay.portrait ? <div className="cy-manor-card-body">{cardBody(r, tabs, active, renderPanel, renderExtra)}</div> : null}
      </section>
    </div>
  );
}

function menuLabel(menu: MenuKey, labels: Record<string, string>) {
  const extra: Record<string, string> = { guestbook: "방명록", bgm: "BGM", links: "일촌 · 링크", secret: "비밀" };
  return labels[menu] ?? extra[menu] ?? "";
}

function cardBody(
  r: Room,
  tabs: readonly string[],
  active: string,
  renderPanel: (tab: string) => ReactNode,
  renderExtra: (menu: RegalExtra) => ReactNode
) {
  if (r.menu === "secret") return <SecretPanel />;
  if (r.menu === "guestbook" || r.menu === "bgm" || r.menu === "links") return renderExtra(r.menu);
  if (r.menu === "board" && active === "story" && tabs.includes("story")) return renderPanel("story");
  if (r.menu === "photo" && tabs.includes("photo")) {
    return (
      <>
        {photos.length === 0 ? <GalleryList /> : null}
        {renderPanel("photo")}
      </>
    );
  }
  if (tabs.includes(r.menu)) return renderPanel(r.menu);
  return <p className="cy-manor-empty">이 방은 아직 비어 있어요.</p>;
}

/* 사진이 아직 없을 때 갤러리 액자에 건 그림(미니룸, 게시글 미리보기) 목록입니다. */
function GalleryList() {
  const list = albumImages();
  return (
    <div className="cy-manor-gallery">
      <p className="cy-manor-lead">액자에 걸린 그림들입니다. 사진첩에 사진을 올리면 이 자리에 걸립니다.</p>
      <ul>
        {list.map(a => (
          <li key={a.src}>
            <img src={asset(a.src)} alt="" loading="lazy" />
            <span>{a.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SecretPanel() {
  return (
    <div className="cy-manor-secret">
      <p>책장 뒤에 숨은 작은 방입니다. 대저택 지도에는 찾은 사람에게만 보여요.</p>
      <ul>
        <li>보석함: 왕관과 별 목걸이</li>
        <li>화장대와 긴 의자, 촛대</li>
        <li>그림: 레이놀즈, 「캐롤라인 하워드 부인」(1778)</li>
      </ul>
      <p className="cy-manor-note">홍길동 님, 이 방은 비밀로 해 주세요.</p>
    </div>
  );
}

function Minimap({ room, found, onGo }: { room: string; found: boolean; onGo: (id: string) => void }) {
  const cell = (c: number, rr: number) => ({ gridColumn: c + 1, gridRow: rr + 1 });
  const lines: [number, number, number, number][] = [];
  for (const a of ROOMS) {
    if (a.hidden && !found && a.id !== room) continue;
    for (const d of a.doors) {
      const b = ROOM_BY_ID[d.to];
      if (!b || b.id < a.id || (b.hidden && !found && b.id !== room)) continue;
      if (Math.abs(a.grid[0] - b.grid[0]) + Math.abs(a.grid[1] - b.grid[1]) !== 1) continue;
      lines.push([a.grid[0], a.grid[1], b.grid[0], b.grid[1]]);
    }
  }
  lines.push([2, 2, ENTRANCE_CELL[0], ENTRANCE_CELL[1]]);
  return (
    <nav className="cy-manor-map" aria-label="대저택 평면도">
      <svg viewBox={`0 0 ${PLAN_COLS} ${PLAN_ROWS}`} preserveAspectRatio="none" aria-hidden="true">
        {lines.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1 + 0.5} y1={y1 + 0.5} x2={x2 + 0.5} y2={y2 + 0.5} />
        ))}
      </svg>
      {ROOMS.map(r =>
        r.hidden && !found && r.id !== room ? null : (
          <button
            key={r.id}
            type="button"
            style={cell(r.grid[0], r.grid[1])}
            className={"cy-manor-map-room" + (r.id === room ? " is-here" : "") + (r.hidden ? " is-secret" : "")}
            aria-current={r.id === room ? "location" : undefined}
            onClick={() => onGo(r.id)}
          >
            {r.name}
          </button>
        )
      )}
      <span className="cy-manor-map-room is-door" style={cell(ENTRANCE_CELL[0], ENTRANCE_CELL[1])}>
        현관
      </span>
    </nav>
  );
}
