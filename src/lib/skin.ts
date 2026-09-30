/* 홈피 설정(스킨과 인트로 건너뛰기)을 한 곳에서 풉니다.

   저장된 값은 Firestore 의 site/profile 문서에 있고 주인장만 고칩니다.
   그냥 들어오면 그 스킨이 보입니다.

   보는 순서:

     이번 화면에서 고른 스킨  >  ?skin= 주소  >  Firestore  >  캐시  >  기본값

   왼쪽 프로필 밑의 선택기는 이번 화면만 바꿉니다. 저장하지 않고 캐시에도
   적지 않아서, 새로고침하면 주인장이 저장한 스킨으로 돌아옵니다.

   캐시가 왜 필요한가: 이 사이트는 정적 파일로 배포되어 서버가 스킨을
   모릅니다. Firestore 응답을 기다렸다가 그리면 그 사이에 기본 화면이
   한 번 번쩍입니다. 인트로를 꺼 둔 사람에게는 안 보여야 할 인트로가
   잠깐 보이는 셈입니다. 그래서 지난번에 받은 값을 캐시에 적어 두고
   첫 그림에 씁니다.

   ?skin= 도 미리보기 전용입니다. 저장하지 않고, 캐시에도 적지 않습니다.
   캐시는 언제나 Firestore 에 실제로 저장된 값만 비춥니다. */
import { type SkinName } from "@/config/theme";

export type SiteSettings = {
  skin: SkinName;
  skipIntro: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = { skin: "classic", skipIntro: false };

/* 주인장 설정과 방문자 선택기가 같은 이름과 설명을 씁니다. */
export const SKIN_CHOICES: { value: SkinName; label: string; hint: string }[] = [
  { value: "classic", label: "클래식", hint: "하늘색 다이어리. 처음 모습입니다." },
  { value: "neon", label: "네온", hint: "사이버 콘솔. 탭이 3D 로 돕니다." },
  { value: "lumen", label: "루멘", hint: "달빛 호수. 유리 페이지가 물 위에 떠오릅니다." }
];

const CACHE_KEY = "mini-homepage:site-settings";

export function isSkinName(value: unknown): value is SkinName {
  return value === "classic" || value === "neon" || value === "lumen";
}

/* 저장된 값이 무엇이든 쓸 수 있는 모양으로 바꿉니다. 예전 버전이 남긴
   엉뚱한 값이나 손으로 고친 문서가 화면을 깨뜨리지 않게 합니다. */
export function toSettings(raw: { skin?: unknown; skipIntro?: unknown } | null | undefined): SiteSettings {
  return {
    skin: isSkinName(raw?.skin) ? raw.skin : DEFAULT_SETTINGS.skin,
    skipIntro: raw?.skipIntro === true
  };
}

function sameSettings(a: SiteSettings, b: SiteSettings) {
  return a.skin === b.skin && a.skipIntro === b.skipIntro;
}

/* ---------------- 미리보기 주소 ---------------- */

/* ?skin=classic, neon, lumen. 그 밖의 값은 없는 것으로 봅니다. */
function readPreview(): SkinName | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("skin");
  return isSkinName(value) ? value : null;
}

/* ---------------- 캐시 ---------------- */

function readCache(): SiteSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return toSettings(JSON.parse(raw));
  } catch {
    /* 사생활 보호 모드처럼 localStorage 를 막아 둔 브라우저가 있습니다.
       캐시는 편의일 뿐이라 못 읽으면 그냥 기본값으로 갑니다. */
    return null;
  }
}

function writeCache(value: SiteSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* 위와 같습니다. */
  }
}

/* ---------------- 저장소 ---------------- */

const previewSkin = readPreview();

/* 왼쪽 선택기로 이번 화면만 바꿔 본 스킨입니다. 새로고침하면 비웁니다. */
let visitorSkin: SkinName | null = null;

/* 주인장이 저장한 값입니다. 화면에 보이는 current 와 따로 둡니다.
   방문자가 스킨을 바꿔 보는 동안 Firestore 가 다시 와도 그 선택을
   지우지 않기 위해서입니다. */
let saved: SiteSettings = readCache() ?? DEFAULT_SETTINGS;

/* 모듈을 읽을 때 바로 캐시를 반영합니다. 첫 렌더 시각에 값이 이미 있어야
   React 가 하이드레이션 직후, 화면에 그리기 전에 고쳐 그립니다. 이걸
   useEffect 로 미루면 한 프레임 동안 기본 화면이 보입니다. */
let current: SiteSettings = compose(saved);

function compose(base: SiteSettings): SiteSettings {
  const skin = visitorSkin ?? previewSkin ?? base.skin;
  if (skin === base.skin) return base;
  return { ...base, skin };
}

function publish(next: SiteSettings) {
  if (sameSettings(current, next)) return;
  current = next;
  listeners.forEach(cb => cb());
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* useSyncExternalStore 는 이 값을 그대로 비교합니다. 바뀌지 않았는데
   새 객체를 돌려주면 무한히 다시 그립니다. 같으면 같은 객체를 줍니다. */
function getSnapshot(): SiteSettings {
  return current;
}

/* 서버는 주소도 캐시도 모릅니다. 늘 기본값을 줘야 하이드레이션이 맞습니다. */
function getServerSnapshot(): SiteSettings {
  return DEFAULT_SETTINGS;
}

/* Firestore 스냅샷이 올 때마다 부릅니다. 실제로 저장된 값이므로 캐시에
   적습니다. 화면에는 이번 선택이나 주소 미리보기가 있으면 그 스킨을
   얹어 보여 줍니다. */
export function applyRemoteSettings(raw: { skin?: unknown; skipIntro?: unknown } | null | undefined) {
  const remote = toSettings(raw);
  writeCache(remote);
  /* 주인장이 저장한 스킨이 바뀌면 그 값을 화면에 올립니다.
     소개 글만 바뀐 경우에는 방문자가 고른 화면을 유지합니다. */
  if (remote.skin !== saved.skin) visitorSkin = null;
  saved = remote;
  publish(compose(saved));
}

/* 왼쪽 프로필 밑의 선택기입니다. 이번 화면만 바꾸고 저장하지 않습니다. */
export function setVisitorSkin(skin: SkinName) {
  if (visitorSkin === skin) return;
  if (visitorSkin === null && previewSkin === null && current.skin === skin) return;
  visitorSkin = skin;
  publish(compose(saved));
}

export const skinStore = { subscribe, getSnapshot, getServerSnapshot };

/* 주소의 ?skin= 입니다. 이번 화면에서 선택기로 덮어쓰면 null 입니다.
   설정 화면이 "저장된 값과 보고 있는 값이 다르다" 를 가릴 때 씁니다. */
export function previewSkinName(): SkinName | null {
  if (visitorSkin) return null;
  return previewSkin;
}
