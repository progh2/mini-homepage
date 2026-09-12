"use client";

import { Component, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Spiral, type SpiralProps } from "@paper-design/shaders-react";
import { asset } from "@/lib/asset";
import { setDraw } from "@/lib/drawParam";
import { applyRemoteSettings, skinStore } from "@/lib/skin";
import { linkify } from "@/lib/linkify";
import BgmPlayer, { type BgmHandle } from "@/components/BgmPlayer";
import Oekaki from "@/components/Oekaki";
import SiteSettings from "@/components/SiteSettings";
import {
  GUESTBOOK_LIMITS,
  addGuestbookEntry,
  isCounterEnabled,
  isGuestbookEnabled,
  canDeleteEntry,
  canEditEntry,
  deleteGuestbookEntry,
  isOwner,
  isSecretGuestbookEnabled,
  PROFILE_LIMITS,
  saveProfile,
  subscribeProfile,
  updateGuestbookEntry,
  recordVisit,
  signInWithGoogle,
  signOutOfGoogle,
  subscribeGuestbook,
  subscribeUser,
  type ProfileOverride,
  type RemoteEntry,
  type SignedInUser,
  type VisitCounts
} from "@/lib/firebase";
import {
  boardPosts,
  episodes,
  guestbook,
  photos,
  profile,
  profileSections,
  waveLinks
} from "@/config/linktree";
import { theme, themes, skinFonts, type SkinName } from "@/config/theme";
import { UNKNOWN_WEATHER, fetchWeather, formatTodayWeather } from "@/lib/weather";

/* 네온 무대는 스킨을 고른 사람만 받습니다. 셰이더와 3D 코드가
   25KB 남짓이라, 클래식만 보는 사람의 첫 화면에 얹을 이유가 없습니다.
   three 자체는 NeonStage 안에서 한 겹 더 늦게 불러옵니다.

   ssr: false 인 이유: 정적 export 라 서버에는 스킨 정보가 없고,
   3D 는 브라우저에서만 뜻이 있습니다. */
const NeonStage = dynamic(() => import("@/components/NeonStage"), { ssr: false });

/* 네온 무대를 못 불러와도 미니홈피가 통째로 사라지지 않게 막습니다.

   next/dynamic 은 청크를 못 받으면 렌더 도중에 예외를 던집니다. 안
   잡으면 흰 화면만 남습니다. 3D 하나 못 쓰는 일로 사이트 전체가 죽는
   것은 맞바꿀 만한 거래가 아닙니다. 2D 로 내려가 그대로 보여 줍니다. */
class NeonBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[neon] 3D 무대를 불러오지 못해 2D 로 보여 줍니다.", error);
    this.props.onError();
  }

  render() {
    /* 실패한 뒤에도 자식을 계속 그리면 같은 예외가 다시 나고, React 는
       반복을 끊으려고 트리 전체를 버립니다. 결국 흰 화면입니다.
       한 번 실패하면 그리지 않습니다. 부모가 곧 2D 쪽으로 갈아탑니다. */
    return this.state.failed ? null : this.props.children;
  }
}

const ALL_TABS = ["home", "profile", "story", "board", "photo"] as const;
type TabName = (typeof ALL_TABS)[number];

/* 연재물이 하나도 없으면 탭 자체를 숨깁니다. */
const TABS: TabName[] = ALL_TABS.filter(tab => tab !== "story" || episodes.length > 0);

/* 탭 버튼과 오른쪽 위 제목에 쓰는 이름표입니다. profile.ts 값을 따릅니다. */
const NAV_LABELS: Record<TabName, string> = {
  home: "홈",
  profile: "프로필",
  story: profile.storyLabel,
  board: profile.boardLabel,
  photo: profile.photoLabel
};

/* 진입 화면 셰이더 배경 설정입니다. 색은 theme.ts 를 따릅니다. */
const spiralProps = {
  fit: "none",
  scale: 1.3,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  originX: 0.5,
  originY: 0.5,
  worldWidth: 0,
  worldHeight: 0,
  density: 0.5,
  colorBack: theme.colors.paper,
  colorFront: theme.colors.spiralFront,
  distortion: 0,
  strokeWidth: 0.5,
  strokeTaper: 0,
  strokeCap: 0,
  noise: 1,
  noiseFrequency: 0.25,
  softness: 0,
  speed: 0.75,
  frame: 0,
  maxPixelCount: 1_500_000
} satisfies Partial<SpiralProps>;

/* 스킨의 색을 CSS 변수로 만들어 최상위 요소에 심습니다. globals.css 가
   var(--이름) 으로 받습니다. 진입 화면도 이 안에 있으므로 같은 변수를 씁니다.
   새 색을 더하려면 theme.ts, 이 목록, globals.css 를 함께 고치세요.

   스킨마다 한 번만 만들어 두고 돌려씁니다. 매 렌더마다 새 객체를 만들면
   style 이 늘 달라 보여 React 가 18개 변수를 계속 다시 심습니다. */
const ROOT_STYLES: Record<SkinName, React.CSSProperties> = {
  classic: skinStyle("classic"),
  neon: skinStyle("neon")
};

function skinStyle(skin: SkinName): React.CSSProperties {
  const c = themes[skin].colors;
  return {
    "--paper": c.paper,
    "--ink": c.ink,
    "--accent": c.accent,
    "--page-top": c.pageTop,
    "--page-mid": c.pageMid,
    "--page-bottom": c.pageBottom,
    "--frame": c.frame,
    "--frame-strong": c.frameStrong,
    "--frame-hover": c.frameHover,
    "--heading": c.heading,
    "--sub-ink": c.subInk,
    "--leaf": c.leaf,
    "--point": c.point,
    "--point-soft": c.pointSoft,
    "--mint": c.mint,
    "--mint-tint": c.mintTint,
    "--blue-tint": c.blueTint,
    "--danger": c.danger,
    "--display": skinFonts[skin].display,
    "--body": skinFonts[skin].body
  } as React.CSSProperties;
}

function ChevronDown({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IntroOverlay({ skin, onBrowse }: { skin: SkinName; onBrowse: () => void }) {
  const ctaRef = useRef<HTMLButtonElement>(null);

  /* 뒤쪽은 inert 로 막아 두었으므로, 들어오자마자 누를 곳에 포커스를 둡니다. */
  useEffect(() => {
    ctaRef.current?.focus();
  }, []);

  return (
    <div className="lt-intro">
      {/* classic 의 소용돌이는 셰이더로 그립니다. neon 은 같은 자리를
          CSS 원판으로 채우므로 셰이더를 띄우지 않습니다. 어두운 화면에
          하늘색 셰이더가 겹치면 어울리지도 않고, 그만큼 덜 그립니다. */}
      {skin === "neon" ? (
        <div className="lt-intro-spiral" aria-hidden="true" />
      ) : (
        <Spiral className="lt-intro-spiral" {...spiralProps} />
      )}
      <div className="lt-intro-card">
        <span className="lt-intro-title">{profile.introTitle}</span>
        <p className="lt-intro-copy">{profile.introDescription}</p>
        <button type="button" className="lt-intro-cta" onClick={onBrowse} ref={ctaRef}>
          모든 활동 구경하기
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
}

const TAB_TITLES: Record<TabName, string> = {
  home: profile.catalogTitle,
  profile: "프로필",
  story: profile.storyLabel,
  board: profile.boardLabel,
  photo: profile.photoLabel
};

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="cy-section-title">
      {title}
      {sub ? <span className="cy-sub-text">{sub}</span> : null}
    </div>
  );
}

function HomeTab() {
  return (
    <>
      <div className="cy-content-box cy-miniroom-box">
        <SectionTitle title="Mini Room" sub="미니룸" />
        <div className="cy-miniroom-inner">
          <img src={asset(profile.miniroom.src)} alt={profile.miniroom.alt} />
        </div>
      </div>

      <div className="cy-content-box">
        <SectionTitle title="What friends say" sub="한마디로 표현한다면~" />
        <GuestbookList />
      </div>
    </>
  );
}

/* 설정 파일 값을 기본으로 두고 주인장이 고친 것만 덮어씁니다.
   Firebase 를 안 붙였으면 설정 파일 값 그대로입니다.

   같은 문서에 스킨과 인트로 설정도 들어 있어 여기서 함께 넘깁니다.
   구독이 두 벌이면 읽기도 두 배가 되고 두 값이 어긋날 수 있습니다. */
function useProfileOverride() {
  const [over, setOver] = useState<ProfileOverride>({});
  useEffect(
    () =>
      subscribeProfile(value => {
        setOver(value);
        applyRemoteSettings(value);
      }),
    []
  );
  return over;
}

/* 지금 적용된 홈피 설정입니다. 자세한 규칙은 src/lib/skin.ts 에 있습니다. */
function useSiteSettings() {
  return useSyncExternalStore(skinStore.subscribe, skinStore.getSnapshot, skinStore.getServerSnapshot);
}

function ProfileEditor({ over, onClose }: { over: ProfileOverride; onClose: () => void }) {
  const fieldId = useId();
  const [name, setName] = useState(over.teacherName ?? profile.teacherName);
  const [intro, setIntro] = useState(over.introDescription ?? profile.introDescription);
  const [sub, setSub] = useState(over.catalogDescription ?? profile.catalogDescription);
  const [lines, setLines] = useState(
    (over.aboutLines ?? defaultAboutLines()).join("\n")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      /* over 를 함께 넘겨야 같은 문서에 있는 홈피 설정(스킨, 인트로)이
         살아남습니다. saveProfile 은 문서를 통째로 다시 씁니다. */
      await saveProfile(
        {
          teacherName: name,
          introDescription: intro,
          catalogDescription: sub,
          aboutLines: lines.split("\n")
        },
        over
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cy-edit">
      <label className="cy-edit-row">
        <span>이름</span>
        <input
          id={`${fieldId}-name`}
          name="profile-name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={PROFILE_LIMITS.name}
        />
      </label>
      <label className="cy-edit-row">
        <span>한 줄 소개</span>
        <input
          id={`${fieldId}-intro`}
          name="profile-intro"
          value={intro}
          onChange={e => setIntro(e.target.value)}
          maxLength={PROFILE_LIMITS.line}
        />
      </label>
      <label className="cy-edit-row">
        <span>이름 아래 한 줄</span>
        <input
          id={`${fieldId}-sub`}
          name="profile-sub"
          value={sub}
          onChange={e => setSub(e.target.value)}
          maxLength={PROFILE_LIMITS.line}
        />
      </label>
      <label className="cy-edit-row cy-edit-tall">
        <span>소개 글</span>
        <textarea
          id={`${fieldId}-about`}
          name="profile-about"
          value={lines}
          onChange={e => setLines(e.target.value)}
          rows={4}
        />
      </label>
      <p className="cy-edit-hint">
        한 줄에 하나씩 적으면 문단이 나뉩니다. 최대 {PROFILE_LIMITS.lines}줄.
        비워 두면 처음 설정한 내용으로 돌아갑니다.
      </p>
      <div className="cy-edit-buttons">
        <button type="button" className="cy-gb-submit" onClick={save} disabled={busy}>
          {busy ? "저장중" : "저장"}
        </button>
        <button type="button" className="cy-oe-btn" onClick={onClose} disabled={busy}>
          취소
        </button>
      </div>
      {error ? <span className="cy-gb-message is-error">{error}</span> : null}
    </div>
  );
}

/* 설정 파일에 적힌 소개 글의 첫 문단들입니다. 고치기 화면의 기본값으로 씁니다. */
function defaultAboutLines() {
  const block = profileSections[0]?.blocks.find(b => b.kind === "text");
  return block && block.kind === "text" ? block.lines : [];
}

function ProfileTab({ viewer }: { viewer: SignedInUser | null }) {
  const over = useProfileOverride();
  const [editing, setEditing] = useState(false);

  return (
    <>
      {profileSections.map((section, si) => (
        <div key={section.id} className="cy-content-box">
          <div className="cy-section-title">
            {section.title}
            {section.subtitle ? <span className="cy-sub-text">{section.subtitle}</span> : null}
            {/* 주인장만 고칠 수 있습니다. 파일을 고쳐 다시 배포하지 않아도
                바뀌도록 첫 구역에만 답니다. */}
            {si === 0 && isOwner(viewer) && !editing ? (
              <button type="button" className="cy-edit-btn" onClick={() => setEditing(true)}>
                수정
              </button>
            ) : null}
          </div>

          {si === 0 && editing ? (
            <ProfileEditor over={over} onClose={() => setEditing(false)} />
          ) : null}

          {section.blocks.map((block, bi) => {
            if (block.kind === "text") {
              /* 고친 소개 글이 있으면 그것을, 없으면 설정 파일 값을 씁니다. */
              const lines = si === 0 && over.aboutLines?.length ? over.aboutLines : block.lines;
              /* 적은 글이 없으면 빈 칸을 남기지 않습니다. */
              if (lines.length === 0) return null;
              return (
                <div key={bi} className="cy-text-block">
                  {/* 소개 글에 적은 주소를 눌러 갈 수 있게 링크로 바꿉니다. */}
                  {lines.map((line, i) => (
                    <p key={i}>{linkify(line)}</p>
                  ))}
                </div>
              );
            }
            if (block.kind === "list") {
              return (
                <div key={bi} className="cy-profile-list-box">
                  <div className="cy-profile-list-heading">{block.heading}</div>
                  <ul className="cy-profile-list">
                    {block.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              );
            }
            return (
              <ul key={bi} className="cy-contact-list">
                {block.items.map(item => (
                  <li key={item.href}>
                    <span className="cy-contact-label">{item.label}</span>
                    <a
                      href={item.href}
                      target={item.href.startsWith("mailto:") ? undefined : "_blank"}
                      rel="noopener noreferrer"
                    >
                      {item.value}
                    </a>
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      ))}

      {/* 주인장이 아니면 아무것도 그리지 않습니다. */}
      <SiteSettings viewer={viewer} over={over} />
    </>
  );
}

function StoryTab() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = episodes.find(e => e.id === openId);

  if (open) {
    return (
      <div className="cy-content-box">
        <SectionTitle
          title={open.title ? `${open.label} ${open.title}` : open.label}
          sub={`${open.cuts.length}컷`}
        />
        <button type="button" className="cy-back-btn" onClick={() => setOpenId(null)}>
          목록으로
        </button>
        <div className="cy-cut-list">
          {open.cuts.map((cut, i) => (
            <img key={cut} src={asset(cut)} alt={`${open.label} ${i + 1}컷`} loading="lazy" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cy-content-box">
      <SectionTitle title={profile.storyLabel} sub={`전체 ${episodes.length}화`} />
      <ul className="cy-episode-grid">
        {episodes.map(episode => (
          <li key={episode.id}>
            <button type="button" className="cy-episode-card" onClick={() => setOpenId(episode.id)}>
              <span className="cy-episode-thumb">
                <img src={asset(episode.thumb)} alt={episode.label} loading="lazy" />
              </span>
              <span className="cy-episode-label">{episode.label}</span>
              {episode.title ? (
                <span className="cy-episode-title">{episode.title}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardTab() {
  return (
    <div className="cy-content-box">
      <SectionTitle title={profile.boardLabel} sub={profile.boardSubtitle} />
      {boardPosts.length === 0 ? (
        <div className="cy-empty-box">
          {profile.boardEmptyText}
        </div>
      ) : (
        <ul className="cy-board-list">
          {boardPosts.map(post => (
            <li key={post.id} className="cy-board-item">
              <a className="cy-board-link" href={post.href} target="_blank" rel="noopener noreferrer">
                {post.preview ? (
                  <span className="cy-board-preview">
                    <img src={asset(post.preview.src)} alt={post.preview.alt} loading="lazy" />
                  </span>
                ) : null}
                <span className="cy-board-text">
                  <span className="cy-board-head">
                    <span className="cy-board-category">{post.category}</span>
                    <span className="cy-board-title">{post.title}</span>
                  </span>
                  {post.summary ? <span className="cy-board-summary">{post.summary}</span> : null}
                  <span className="cy-board-date">{post.date}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* 로그인 안 한 사람에게 보이는 줄입니다. 입력 칸 대신 안내와 로그인 버튼만 둡니다. */
function GuestbookSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cy-gb-signin">
      <button type="button" className="cy-gb-google" onClick={login} disabled={busy}>
        {busy ? "여는 중" : "구글 로그인"}
      </button>
      <span className="cy-gb-signin-text">하면 한마디를 남길 수 있어요.</span>
      {error ? <span className="cy-gb-message is-error">{error}</span> : null}
    </div>
  );
}

/* 로그인한 사람에게 보이는 입력 줄입니다. 이름 칸은 없습니다. */
function GuestbookForm({ me }: { me: SignedInUser }) {
  /* 브라우저가 입력 칸을 알아보려면 id 나 name 이 있어야 합니다. */
  const fieldId = useId();
  const [text, setText] = useState("");
  const [secret, setSecret] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setMessage(null);
    try {
      await addGuestbookEntry(text, secret);
      setText("");
      setMessage(
        secret && !isOwner(me)
          ? { kind: "ok", text: "비밀글로 남겼어요. 주인장과 나만 볼 수 있어요." }
          : { kind: "ok", text: "한줄평을 남겼어요. 고맙습니다!" }
      );
      setSecret(false);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "남기지 못했어요. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="cy-guestbook-form" onSubmit={submit}>
      <input
        id={`${fieldId}-text`}
        name="guestbook-text"
        className="cy-gb-text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`${me.name} 님으로 한마디 남기기`}
        maxLength={GUESTBOOK_LIMITS.text}
        aria-label="한줄평"
      />
      <button className="cy-gb-submit" type="submit" disabled={sending}>
        {sending ? "전송중" : "남기기"}
      </button>
      {isSecretGuestbookEnabled ? (
        <label className="cy-gb-secret">
          <input
            id={`${fieldId}-secret`}
            name="guestbook-secret"
            type="checkbox"
            checked={secret}
            onChange={e => setSecret(e.target.checked)}
          />
          비밀글
        </label>
      ) : null}
      <span className="cy-gb-who">
        {me.name} 님
        <button type="button" className="cy-gb-signout" onClick={() => signOutOfGoogle()}>
          로그아웃
        </button>
      </span>
      {message ? (
        <span className={`cy-gb-message${message.kind === "error" ? " is-error" : ""}`}>{message.text}</span>
      ) : null}
    </form>
  );
}

type ListEntry = {
  key: string;
  author: string;
  text: string;
  date: string;
  time?: string;
  secret?: boolean;
  uid?: string;
  edited?: boolean;
  /* Firestore 문서 id 입니다. 예시 글(linktree.ts)에는 없습니다. */
  id?: string;
};

/* 한줄평 한 줄입니다. 볼 수 있는 사람에게만 수정·삭제 버튼을 답니다.
   실제 권한은 firestore.rules 가 정합니다. 여기 판단은 화면 편의일 뿐입니다. */
function GuestbookItem({ entry, viewer }: { entry: ListEntry; viewer: SignedInUser | null }) {
  /* 목록에 여러 줄이 그려지므로 줄마다 다른 id 가 필요합니다. */
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stored = Boolean(entry.id);
  const mayEdit = stored && canEditEntry(viewer, entry.uid ?? "");
  const mayDelete = stored && canDeleteEntry(viewer, entry.uid ?? "");

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await job();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => updateGuestbookEntry(entry.id!, Boolean(entry.secret), draft));
  const remove = () => {
    if (!window.confirm("이 한줄평을 지울까요? 되돌릴 수 없어요.")) return;
    run(() => deleteGuestbookEntry(entry.id!, Boolean(entry.secret)));
  };

  return (
    <div className="cy-guestbook-item">
      <span className="cg-author">
        {entry.secret ? <span className="cg-lock" title="주인장과 작성자만 보이는 비밀글">🔒</span> : null}
        {entry.author} <span className="cg-colon">:</span>{" "}
      </span>

      {editing ? (
        <span className="cg-edit">
          <input
            id={`${fieldId}-edit`}
            name="guestbook-edit"
            className="cg-edit-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            maxLength={GUESTBOOK_LIMITS.text}
            aria-label="한줄평 고치기"
          />
          <button type="button" className="cg-act" onClick={save} disabled={busy}>
            {busy ? "저장중" : "저장"}
          </button>
          <button
            type="button"
            className="cg-act"
            onClick={() => {
              setDraft(entry.text);
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
          >
            취소
          </button>
        </span>
      ) : (
        <>
          <span className="cg-text">{entry.text}</span>
          <span className="cg-date">
            ({entry.time ? `${entry.date} ${entry.time}` : entry.date}
            {entry.edited ? ", 수정됨" : ""})
          </span>
          {mayEdit ? (
            <button type="button" className="cg-act" onClick={() => setEditing(true)}>
              수정
            </button>
          ) : null}
          {mayDelete ? (
            <button type="button" className="cg-act" onClick={remove} disabled={busy}>
              삭제
            </button>
          ) : null}
        </>
      )}

      {error ? <span className="cy-gb-message is-error">{error}</span> : null}
    </div>
  );
}

/* 넉넉히 가져와 클라이언트에서 나눕니다. 커서 기반 페이징이 정석이지만
   공개글과 비밀글 두 컬렉션을 실시간 구독해 합치는 구조라 커서를 둘 관리해야
   합니다. 개인 미니홈피 규모에서는 이 편이 단순하고 충분합니다. */
const GUESTBOOK_FETCH_LIMIT = 200;
const GUESTBOOK_PAGE_SIZE = 5;

function GuestbookList() {
  /* Firestore 가 설정되어 있으면 실시간 목록을, 아니면 linktree.ts 의 예시를 보여줍니다. */
  const [remote, setRemote] = useState<RemoteEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);
  /* 로그인 상태입니다. undefined 는 아직 확인 전, null 은 로그아웃입니다. */
  const [me, setMe] = useState<SignedInUser | null | undefined>(undefined);

  /* 로그인 상태가 바뀌면 구독을 다시 겁니다. 주인장은 비밀글 전체를, 그 외
     로그인한 사람은 자기가 쓴 비밀글만 받습니다. 로그아웃이면 공개글만 받습니다. */
  const viewer = me ?? null;
  useEffect(() => {
    if (!isGuestbookEnabled) return;
    return subscribeGuestbook(GUESTBOOK_FETCH_LIMIT, viewer, setRemote, () => setFailed(true));
  }, [viewer]);

  useEffect(() => {
    if (!isGuestbookEnabled) return;
    return subscribeUser(setMe);
  }, []);

  const live = isGuestbookEnabled && !failed;
  const entries: ListEntry[] = live && remote
    ? remote.map(e => ({ key: e.id, ...e }))
    : guestbook.map(e => ({ key: String(e.id), author: e.author, text: e.text, date: e.date }));

  const pageCount = Math.max(1, Math.ceil(entries.length / GUESTBOOK_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = entries.slice(
    currentPage * GUESTBOOK_PAGE_SIZE,
    currentPage * GUESTBOOK_PAGE_SIZE + GUESTBOOK_PAGE_SIZE
  );

  return (
    <>
      {live && remote === null ? <div className="cy-gb-loading">한줄평을 불러오는 중…</div> : null}

      <div className="cy-guestbook-list">
        {entries.length === 0 ? (
          /* 남기는 폼은 live 일 때만 나옵니다. 폼이 없는데 남기라고 하면 안 됩니다. */
          <div className="cy-gb-loading">
            {live ? "아직 한줄평이 없어요. 첫 줄을 남겨 주세요!" : "아직 한줄평이 없어요."}
          </div>
        ) : (
          pageEntries.map(c => (
            <GuestbookItem key={c.key} entry={c} viewer={viewer} />
          ))
        )}
      </div>

      {pageCount > 1 ? (
        <div className="cy-gb-pagination">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`cy-gb-page${i === currentPage ? " is-active" : ""}`}
              onClick={() => setPage(i)}
              aria-current={i === currentPage ? "page" : undefined}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      {/* 로그인해야 남길 수 있습니다. 확인 전(undefined)에는 아무것도 그리지 않아
          안내 문구가 잠깐 깜빡였다 사라지는 일을 막습니다. */}
      {live && me !== undefined
        ? me
          ? <GuestbookForm me={me} />
          : <GuestbookSignIn />
        : null}
    </>
  );
}

/* 미니홈피 왼쪽 위 방문 수입니다. 들어올 때마다 한 번 기록하고 그 결과를 보여 줍니다.
   Firestore 가 설정되지 않았거나 아직 못 받았으면 숫자 자리를 - 로 둡니다. */
function TodayWeather() {
  /* 불러오기 전과 실패한 경우 모두 중립 표시입니다. 특정 날씨로 단정하지 않습니다. */
  const [label, setLabel] = useState<string>(UNKNOWN_WEATHER);

  useEffect(() => {
    let cancelled = false;
    fetchWeather()
      .then(weather => {
        if (!cancelled) setLabel(formatTodayWeather(weather));
      })
      .catch(() => {
        if (!cancelled) setLabel(UNKNOWN_WEATHER);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="cy-today-is">
      TODAY IS.. <span className="text-orange">{label}</span>
    </div>
  );
}

function VisitCounter() {
  const [counts, setCounts] = useState<VisitCounts | null>(null);
  /* 개발 모드에서 효과가 두 번 실행돼 2씩 오르는 것을 막습니다. */
  const sentRef = useRef(false);

  useEffect(() => {
    if (!isCounterEnabled || sentRef.current) return;
    sentRef.current = true;
    recordVisit()
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  const show = (value: number | undefined) =>
    typeof value === "number" ? value.toLocaleString() : "-";

  return (
    <span className="cy-today-count">
      TODAY <span className="text-orange">{show(counts?.today)}</span>
      {" | "}
      TOTAL <span className="text-black">{show(counts?.total)}</span>
    </span>
  );
}

function PhotoTab() {
  return (
    <>
      {photos.length > 0 ? (
        <div className="cy-content-box">
          <SectionTitle title={profile.photoLabel} sub={`${profile.photoSubtitlePrefix} ${photos.length}컷`} />
          <ul className="cy-photo-grid">
            {photos.map(photo => (
              <li key={photo.id} className="cy-photo-item">
                <div className="cy-photo-frame">
                  <img src={asset(photo.src)} alt={photo.name} loading="lazy" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Firebase 가 연결돼 있을 때만 스스로 나타납니다. */}
      <Oekaki />
    </>
  );
}

export default function LinkTree() {
  const over = useProfileOverride();
  const [viewer, setViewer] = useState<SignedInUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("home");
  const [introSkipped, setIntroSkipped] = useState(false);
  const { skin, skipIntro } = useSiteSettings();
  const bgmRef = useRef<BgmHandle>(null);
  /* 아래 셋은 네온에서만 씁니다. 클래식에서는 늘 기본값이라
     화면에 아무 영향이 없습니다. */
  const backgroundRef = useRef<HTMLDivElement>(null);
  const [neon3dFailed, setNeon3dFailed] = useState(false);
  const [hudOpen, setHudOpen] = useState(false);
  const neon = skin === "neon";

  /* 주인장이 인트로를 꺼 두었으면 아무에게도 안 보입니다. introSkipped 는
     이번 방문에서 "구경하기" 를 눌렀거나 탭 딥링크로 들어온 경우입니다. */
  const showIntro = !skipIntro && !introSkipped;

  useEffect(() => subscribeUser(setViewer), []);

  /* ?tab=프로필 처럼 탭 딥링크로 들어오면 진입 화면을 건너뜁니다.
     정적 배포에서도 동작하도록 브라우저에서 읽습니다. */
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const found = TABS.find(t => t === tab);
    if (found) {
      /* output: "export" 라 HTML 은 홈 탭으로 미리 만들어집니다. 주소창의 ?tab= 은
         브라우저에만 있으므로 하이드레이션 뒤에 읽어 맞출 수밖에 없습니다.
         렌더 중에 읽으면 서버 HTML 과 달라져 하이드레이션이 어긋납니다. */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(found);
      setIntroSkipped(true);
    }
  }, []);

  /* 네온 글꼴입니다. 클래식은 쓰지 않으므로 스킨을 따라 붙였다 뗍니다.
     구글 폰트 서버로 요청이 한 번 나갑니다. 이 사이트는 이미 유튜브와
     날씨 서버를 부르고 있어 새로 생기는 성질의 것은 아닙니다.

     폰트가 오기 전에는 theme.ts 의 대체 글꼴로 그려지고 도착하면
     바뀝니다(display=swap). 글자가 안 보이는 구간은 없습니다.

     3D 무대가 아니라 여기 있는 이유: 무대를 못 불러온 경우에도
     글꼴은 있어야 네온답게 보입니다. */
  useEffect(() => {
    if (!neon) return;
    const links = [
      { rel: "preconnect", href: "https://fonts.googleapis.com", crossOrigin: "" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href:
          "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900" +
          "&family=Share+Tech+Mono&family=Do+Hyeon" +
          "&family=Nanum+Gothic+Coding:wght@400;700&display=swap",
        crossOrigin: ""
      }
    ].map(spec => {
      const el = document.createElement("link");
      el.rel = spec.rel;
      el.href = spec.href;
      if (spec.crossOrigin) el.crossOrigin = spec.crossOrigin;
      el.dataset.neonFont = "1";
      document.head.appendChild(el);
      return el;
    });
    return () => links.forEach(el => el.remove());
  }, [neon]);

  /* 네온은 화면 전체를 채우는 고정 레이아웃이라 body 가 스크롤되면
     안 됩니다. html, body 는 cy-root 바깥이라 스킨 선택자로 닿지
     못하므로 여기서 클래스를 붙였다 뗍니다. */
  useEffect(() => {
    if (skin !== "neon") return;
    document.body.classList.add("lt-skin-neon");
    return () => document.body.classList.remove("lt-skin-neon");
  }, [skin]);

  /* 인트로가 떠 있는 동안에는 뒤쪽이 스크롤되지 않게 막습니다. */
  useEffect(() => {
    if (!showIntro) return;
    document.body.classList.add("lt-intro-open");
    return () => document.body.classList.remove("lt-intro-open");
  }, [showIntro]);

  /* 탭 하나의 내용입니다. 클래식은 보고 있는 것 하나만, 네온은 넷을
     모두 만들어 원을 그려야 하므로 같은 함수를 두 곳에서 씁니다. */
  const panelFor = (tab: string) => {
    if (tab === "home") return <HomeTab />;
    if (tab === "profile") return <ProfileTab viewer={viewer} />;
    if (tab === "story") return <StoryTab />;
    if (tab === "board") return <BoardTab />;
    if (tab === "photo") return <PhotoTab />;
    return null;
  };

  /* 본문을 항상 그려 두고 인트로를 그 위에 덮습니다. (.lt-intro 는 position: fixed 입니다)
     BGM 플레이어가 미리 준비되어 있어야 인트로 클릭 한 번으로 재생이 시작됩니다. */
  return (
    <div
      className={"cy-root" + (neon && neon3dFailed ? " no-3d" : "")}
      data-skin={skin}
      style={ROOT_STYLES[skin]}
    >
      <div className="cy-background-pattern" ref={backgroundRef}></div>

      {/* 인트로는 fixed 로 덮기만 하므로 뒤 콘텐츠가 DOM 에 그대로 살아 있습니다.
          inert 를 걸어야 탭 포커스와 스크린리더 접근이 함께 막힙니다.
          overflow: hidden(body.lt-intro-open)은 스크롤만 막고 포커스는 못 막습니다. */}
      <div className="cy-book-wrapper" inert={showIntro}>
        <div className="cy-book-outer">

          {/* 바인더 링 */}
          <div className="cy-bindings">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="cy-ring"></div>
            ))}
          </div>

          <div className="cy-book-inner">
            {/* 좌측 패널 */}
            {/* id 는 네온에서만 답니다. 서랍 단추가 가리킬 곳이 필요한
                쪽은 네온뿐이고, 클래식 마크업은 그대로 두려는 것입니다. */}
            <div
              id={neon ? "cy-hud" : undefined}
              className={"cy-left-panel" + (neon && hudOpen ? " is-open" : "")}
            >
              <div className="cy-left-header">
                <VisitCounter />
              </div>
              <div className="cy-left-content">
                <TodayWeather />

                <div className="cy-profile-pic">
                  <img src={asset(profile.photo.src)} alt={profile.photo.alt} />
                </div>

                <div className="cy-intro-text">
                  {over.introDescription ?? profile.introDescription}
                </div>

                <BgmPlayer ref={bgmRef} />

                <div className="cy-profile-name">
                  <div className="name-bold">{over.teacherName ?? profile.teacherName}</div>
                  <div className="title-sub">
                    {over.catalogDescription ?? profile.catalogDescription}
                  </div>
                </div>

                {/* select 의 onChange 로 새 창을 열면, 키보드로 항목을 훑는 동안
                    항목마다 팝업이 열립니다. 목록이 링크이므로 실제 링크로 둡니다.
                    새 탭에서 열기, 주소 복사 같은 브라우저 기본 동작도 살아납니다. */}
                <details className="cy-left-dropdown">
                  <summary>파도타기</summary>
                  <ul>
                    {waveLinks.map(wave => (
                      <li key={wave.id}>
                        <a href={wave.href} target="_blank" rel="noopener noreferrer">
                          {wave.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>

            {/* 우측 패널 */}
            <div className="cy-right-panel">
              <div className="cy-right-header">
                <span className="cy-title">{TAB_TITLES[activeTab]}</span>
                <span className="cy-url">{profile.displayUrl}</span>
                {/* 좁은 화면에서 왼쪽 정보판을 서랍처럼 여는 단추입니다.
                    넓은 화면에서는 CSS 가 감춥니다. */}
                {neon ? (
                  <button
                    type="button"
                    className="cy-hud-toggle"
                    aria-expanded={hudOpen}
                    aria-controls="cy-hud"
                    onClick={() => setHudOpen(open => !open)}
                  >
                    STATUS
                  </button>
                ) : null}
              </div>

              {/* 네온은 탭 넷을 모두 만들어 3D 로 돌립니다. 클래식은
                  보고 있는 하나만 만듭니다. 스킨을 바꿔도 왼쪽의 BGM 과
                  방문 수는 이 갈림길 바깥에 있어 끊기지 않습니다. */}
              {neon && !neon3dFailed ? (
                <NeonBoundary onError={() => setNeon3dFailed(true)}>
                  <NeonStage
                    tabs={TABS}
                    labels={NAV_LABELS}
                    active={activeTab}
                    onSelect={tab => setActiveTab(tab as TabName)}
                    renderPanel={panelFor}
                    backgroundRef={backgroundRef}
                    locked={showIntro}
                    onFallback={() => setNeon3dFailed(true)}
                  />
                </NeonBoundary>
              ) : (
                /* 클래식이거나, 네온인데 3D 를 못 쓰는 경우입니다.
                   네온의 2D 폴백 CSS 는 is-active 인 창만 보여 주므로
                   보고 있는 탭에 그 표시를 답니다. 클래식 마크업은
                   예전 그대로입니다. */
                <div
                  className={"cy-right-content" + (neon ? " is-active" : "")}
                  role="tabpanel"
                  id={`cy-panel-${activeTab}`}
                  aria-labelledby={`cy-tab-${activeTab}`}
                >
                  {panelFor(activeTab)}
                </div>
              )}
            </div>

            {/* 탭 영역 */}
            {/* .active 는 배경색만 바꾸므로 시각 정보에만 의존합니다.
                스크린리더가 어느 탭이 열려 있는지 알 수 있게 탭 패턴을 붙입니다. */}
            <div className="cy-tabs" role="tablist" aria-label="미니홈피 메뉴">
              {TABS.map(tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`cy-tab-${tab}`}
                  aria-selected={activeTab === tab}
                  aria-controls={`cy-panel-${tab}`}
                  className={"cy-tab-btn " + (activeTab === tab ? "active" : "")}
                  onClick={() => {
                    setActiveTab(tab);
                    /* 이미 보던 탭을 다시 누르면 처음 화면으로 돌아옵니다.
                       낙서장에서 그림을 열어 둔 채 탭을 눌렀을 때
                       목록으로 가지 않으면 갇힌 느낌이 듭니다. */
                    if (tab === "photo") setDraw(null);
                  }}
                >
                  <span className="cy-tab-line">{NAV_LABELS[tab]}</span>
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>

      {neon && !neon3dFailed ? (
        <div className="cy-console-hint" aria-hidden="true">
          <kbd>◀</kbd> <kbd>▶</kbd> 방향키나 옆 창을 눌러 메뉴를 옮깁니다
        </div>
      ) : null}

      {showIntro ? (
        <IntroOverlay
          skin={skin}
          onBrowse={() => {
            /* 클릭 안에서 재생을 걸어야 브라우저가 소리를 허용합니다. */
            bgmRef.current?.start();
            setIntroSkipped(true);
          }}
        />
      ) : null}
    </div>
  );
}
