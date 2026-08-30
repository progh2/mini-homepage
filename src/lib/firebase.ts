/* Firestore 한줄평 저장소입니다.
   설정값은 빌드 시 NEXT_PUBLIC_FIREBASE_* 환경변수로 주입됩니다.
   Firebase 웹 설정값은 비밀키가 아니라 프로젝트 식별자이며, 배포된 JS 에 그대로 들어가는 것이
   정상적인 사용법입니다. 실제 접근 제어는 firestore.rules 가 담당합니다. */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { ownerUid } from "@/config/linktree";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Timestamp
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

/* 설정이 없으면 Firestore 를 쓰지 않고, 화면은 linktree.ts 의 예시 한줄평으로 대체됩니다. */
export const isGuestbookEnabled = Boolean(config.apiKey && config.projectId);

/* author 는 사람이 직접 적는 값이 아니라 구글 프로필 이름이라 여유를 둡니다.
   text 만 입력 칸의 maxLength 로 쓰입니다. */
export const GUESTBOOK_LIMITS = { author: 50, text: 100 } as const;

export type RemoteEntry = {
  id: string;
  author: string;
  text: string;
  /* "2026.08.30" */
  date: string;
  /* "17:42" */
  time: string;
  /* 주인장만 보는 글인지. 두 컬렉션을 합칠 때 정렬과 표시에 씁니다. */
  secret: boolean;
  /* 정렬용 밀리초. 화면에는 쓰지 않습니다. */
  at: number;
};

/* 공개글과 비밀글은 컬렉션을 나눕니다. 한 컬렉션에 secret 필드를 두면
   공개 목록 질의에 복합 색인이 필요하고, 규칙을 조금만 잘못 써도 비밀글이
   새어 나갑니다. 컬렉션을 나누면 경계가 규칙 한 줄로 끝납니다. */
export const GUESTBOOK_OPEN = "guestbook";
export const GUESTBOOK_SECRET = "guestbookSecret";

/* linktree.ts 의 ownerUid 가 비어 있으면 비밀글 기능을 쓰지 않습니다. */
export const isSecretGuestbookEnabled = Boolean(ownerUid);

export function isOwner(user: SignedInUser | null | undefined) {
  return Boolean(user && ownerUid && user.uid === ownerUid);
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

let auth: Auth | null = null;

function getApp() {
  if (!app) app = getApps()[0] ?? initializeApp(config as Record<string, string>);
  return app;
}

function getDb() {
  if (!isGuestbookEnabled) return null;
  if (!db) db = getFirestore(getApp());
  return db;
}

function getAuthOrNull() {
  if (!isGuestbookEnabled) return null;
  if (!auth) auth = getAuth(getApp());
  return auth;
}

/* serverTimestamp() 는 서버에 도달하기 전까지 null 입니다. 그 사이에는 지금 시각으로
   보여 주고, 서버 값이 오면 실시간 구독이 알아서 정확한 값으로 갈아 끼웁니다. */
function toDate(value: unknown) {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : new Date();
}

function formatDate(value: unknown) {
  const date = toDate(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function formatTime(value: unknown) {
  const date = toDate(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

/* ---------------------------------------------------------------
   구글 로그인입니다. 한줄평을 남기려면 로그인해야 합니다.
   이름을 자유 입력으로 두면 사칭을 막을 방법이 없고, 로그인하면 이름이 계정에서
   오고 문서에 uid 가 남아 문제 있는 글을 추적할 수 있습니다.
   --------------------------------------------------------------- */

export type SignedInUser = { uid: string; name: string };

function toSignedInUser(user: User | null): SignedInUser | null {
  if (!user) return null;
  /* 구글 계정에 표시 이름이 없는 드문 경우가 있어 대비합니다. */
  return { uid: user.uid, name: (user.displayName ?? "이름 없음").slice(0, GUESTBOOK_LIMITS.author) };
}

/* 로그인 상태를 구독합니다. 정리 함수를 돌려줍니다.
   아직 확인 전인지(undefined) 로그아웃 상태인지(null) 구분해서 넘깁니다. */
export function subscribeUser(onChange: (user: SignedInUser | null) => void) {
  const instance = getAuthOrNull();
  if (!instance) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(instance, user => onChange(toSignedInUser(user)));
}

export async function signInWithGoogle() {
  const instance = getAuthOrNull();
  if (!instance) throw new Error("로그인 기능이 설정되지 않았습니다.");

  try {
    await signInWithPopup(instance, new GoogleAuthProvider());
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    /* 사용자가 팝업을 그냥 닫은 경우는 오류로 알리지 않습니다. */
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/popup-blocked") throw new Error("팝업이 막혔어요. 팝업 차단을 풀고 다시 눌러 주세요.");
    if (code === "auth/unauthorized-domain") {
      throw new Error("이 주소가 Firebase 승인된 도메인에 없어요. 콘솔에서 추가해 주세요.");
    }
    throw new Error("로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }
}

export async function signOutOfGoogle() {
  const instance = getAuthOrNull();
  if (instance) await signOut(instance);
}

/* ---------------------------------------------------------------
   미니홈피 왼쪽 위 TODAY / TOTAL 방문 수입니다.
   counters/site 문서 하나에 total, today, day 를 담아 둡니다.
   --------------------------------------------------------------- */

/* 한줄평과 같은 Firebase 설정을 씁니다. */
export const isCounterEnabled = isGuestbookEnabled;

export type VisitCounts = { total: number; today: number };

/* 하루 경계를 방문자 시간대가 아니라 한국 시간으로 맞춥니다. 2026-08-14 형태입니다. */
function seoulDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/* 방문 한 번을 기록하고 갱신된 값을 돌려줍니다.
   읽기와 쓰기를 한 트랜잭션으로 처리해서 동시에 들어와도 숫자가 어긋나지 않습니다. */
export async function recordVisit(): Promise<VisitCounts> {
  const store = getDb();
  if (!store) throw new Error("방문 수 기능이 설정되지 않았습니다.");

  const ref = doc(store, "counters", "site");
  const day = seoulDay();

  return runTransaction(store, async transaction => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists()) {
      const first = { total: 1, today: 1, day };
      transaction.set(ref, first);
      return { total: first.total, today: first.today };
    }

    const data = snapshot.data();
    const total = Number(data.total ?? 0) + 1;
    /* 날짜가 바뀐 뒤 첫 방문이면 오늘 수를 다시 1부터 셉니다. */
    const today = data.day === day ? Number(data.today ?? 0) + 1 : 1;

    transaction.update(ref, { total, today, day });
    return { total, today };
  });
}

/* 한줄평을 실시간으로 구독합니다. 정리 함수를 돌려줍니다.

   includeSecret 이 참이면 비밀글 컬렉션도 함께 구독해 시각순으로 합칩니다.
   주인장이 아니면 비밀글 구독은 규칙에서 막히므로 아예 걸지 않습니다. */
export function subscribeGuestbook(
  count: number,
  includeSecret: boolean,
  onData: (entries: RemoteEntry[]) => void,
  onError: (error: Error) => void
) {
  const store = getDb();
  if (!store) return () => {};

  /* 두 컬렉션이 각자 따로 도착하므로 마지막 결과를 들고 있다가 합칩니다. */
  const latest: Record<string, RemoteEntry[]> = {};

  const publish = () => {
    const merged = [...(latest[GUESTBOOK_OPEN] ?? []), ...(latest[GUESTBOOK_SECRET] ?? [])]
      .sort((a, b) => b.at - a.at)
      .slice(0, count);
    onData(merged);
  };

  const watch = (name: string, secret: boolean) => {
    const q = query(collection(store, name), orderBy("createdAt", "desc"), fsLimit(count));
    return onSnapshot(
      q,
      snapshot => {
        latest[name] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            author: String(data.author ?? ""),
            text: String(data.text ?? ""),
            date: formatDate(data.createdAt),
            time: formatTime(data.createdAt),
            secret,
            at: toDate(data.createdAt).getTime()
          };
        });
        publish();
      },
      error => onError(error as Error)
    );
  };

  const stops = [watch(GUESTBOOK_OPEN, false)];
  if (includeSecret && isSecretGuestbookEnabled) stops.push(watch(GUESTBOOK_SECRET, true));

  return () => stops.forEach(stop => stop());
}

/* 이름은 받지 않습니다. 로그인한 구글 계정에서 가져옵니다.
   firestore.rules 도 uid 가 로그인 uid 와 같을 때만 쓰기를 허용합니다. */
export async function addGuestbookEntry(text: string, secret = false) {
  const store = getDb();
  const instance = getAuthOrNull();
  if (!store || !instance) throw new Error("한줄평 기능이 설정되지 않았습니다.");

  const me = toSignedInUser(instance.currentUser);
  if (!me) throw new Error("구글 로그인 후 남길 수 있어요.");

  const trimmedText = text.trim();
  if (!trimmedText) throw new Error("한줄평을 적어 주세요.");
  if (trimmedText.length > GUESTBOOK_LIMITS.text) throw new Error(`한줄평은 ${GUESTBOOK_LIMITS.text}자까지 쓸 수 있어요.`);

  const target = secret && isSecretGuestbookEnabled ? GUESTBOOK_SECRET : GUESTBOOK_OPEN;

  /* approved 는 지금은 항상 true 입니다. 나중에 승인제로 바꾸려면
     이 값을 false 로 두고 firestore.rules 의 read 조건만 바꾸면 됩니다. */
  await addDoc(collection(store, target), {
    uid: me.uid,
    author: me.name,
    text: trimmedText,
    approved: true,
    createdAt: serverTimestamp()
  });
}
