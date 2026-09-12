/* 홈피 설정(스킨과 인트로 건너뛰기)을 한 곳에서 풉니다.

   값은 Firestore 의 site/profile 문서에 있고 주인장만 고칩니다. 고른
   결과는 모든 방문자에게 적용됩니다.

   보는 순서:

     ?skin= 주소  >  Firestore  >  localStorage 캐시  >  기본값

   캐시가 왜 필요한가: 이 사이트는 정적 파일로 배포되어 서버가 스킨을
   모릅니다. Firestore 응답을 기다렸다가 그리면 그 사이에 기본 화면이
   한 번 번쩍입니다. 인트로를 꺼 둔 사람에게는 안 보여야 할 인트로가
   잠깐 보이는 셈입니다. 그래서 지난번에 받은 값을 캐시에 적어 두고
   첫 그림에 씁니다.

   ?skin= 은 미리보기 전용입니다. 저장하지 않고, 캐시에도 적지 않습니다.
   캐시는 언제나 Firestore 에 실제로 저장된 값만 비춥니다. */
import { type SkinName } from "@/config/theme";

export type SiteSettings = {
  skin: SkinName;
  skipIntro: boolean;
};

export const DEFAULT_SETTINGS: SiteSettings = { skin: "classic", skipIntro: false };

const CACHE_KEY = "mini-homepage:site-settings";

export function isSkinName(value: unknown): value is SkinName {
  return value === "classic" || value === "neon";
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

/* ?skin=neon 또는 ?skin=classic. 그 밖의 값은 없는 것으로 봅니다. */
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

/* 모듈을 읽을 때 바로 캐시를 반영합니다. 첫 렌더 시각에 값이 이미 있어야
   React 가 하이드레이션 직후, 화면에 그리기 전에 고쳐 그립니다. 이걸
   useEffect 로 미루면 한 프레임 동안 기본 화면이 보입니다. */
let current: SiteSettings = applyPreview(readCache() ?? DEFAULT_SETTINGS);

function applyPreview(value: SiteSettings): SiteSettings {
  if (!previewSkin || previewSkin === value.skin) return value;
  return { ...value, skin: previewSkin };
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
   적습니다. 화면에는 미리보기가 있으면 미리보기를 얹어 보여 줍니다. */
export function applyRemoteSettings(raw: { skin?: unknown; skipIntro?: unknown } | null | undefined) {
  const remote = toSettings(raw);
  writeCache(remote);

  const next = applyPreview(remote);
  if (sameSettings(current, next)) return;
  current = next;
  listeners.forEach(cb => cb());
}

export const skinStore = { subscribe, getSnapshot, getServerSnapshot };

/* 지금 미리보기 중인지 알려 줍니다. 설정 화면에서 "보고 있는 것과
   저장된 것이 다르다" 고 알리는 데 씁니다. */
export function previewSkinName(): SkinName | null {
  return previewSkin;
}
