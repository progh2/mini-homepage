/* Firestore 한줄평 저장소입니다.
   설정값은 빌드 시 NEXT_PUBLIC_FIREBASE_* 환경변수로 주입됩니다.
   Firebase 웹 설정값은 비밀키가 아니라 프로젝트 식별자이며, 배포된 JS 에 그대로 들어가는 것이
   정상적인 사용법입니다. 실제 접근 제어는 firestore.rules 가 담당합니다.

   SDK 는 처음부터 받지 않고 필요할 때 불러옵니다. 인트로 화면에서는 쓸 일이 없는데
   Firebase 와 Firestore 만으로 634KB 라 첫 화면이 그만큼 무거워집니다.
   타입은 빌드할 때 지워지므로 정적으로 가져와도 값이 딸려오지 않습니다. */
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore, QueryConstraint, Timestamp } from "firebase/firestore";
import { ownerUid, siteTimezone } from "@/config/linktree";

type Sdk = {
  app: typeof import("firebase/app");
  auth: typeof import("firebase/auth");
  store: typeof import("firebase/firestore");
};

let sdkPromise: Promise<Sdk> | null = null;

/* 한 번만 불러오고 결과를 담아 두었다가 재사용합니다. */
function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore")
    ]).then(([app, auth, store]) => ({ app, auth, store }));
    /* 실패하면 다음에 다시 시도할 수 있게 비웁니다. */
    sdkPromise.catch(() => {
      sdkPromise = null;
    });
  }
  return sdkPromise;
}

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
  /* 글쓴이의 계정 uid 입니다. 수정·삭제 권한을 판단하는 데 씁니다. */
  uid: string;
  /* 주인장만 보는 글인지. 두 컬렉션을 합칠 때 정렬과 표시에 씁니다. */
  secret: boolean;
  /* 한 번이라도 고친 글인지. 화면에 "(수정됨)" 을 붙입니다. */
  edited: boolean;
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

function getApp(sdk: Sdk) {
  if (!app) app = sdk.app.getApps()[0] ?? sdk.app.initializeApp(config as Record<string, string>);
  return app;
}

async function getDb() {
  if (!isGuestbookEnabled) return null;
  const sdk = await loadSdk();
  if (!db) db = sdk.store.getFirestore(getApp(sdk));
  return db;
}

async function getAuthOrNull() {
  if (!isGuestbookEnabled) return null;
  const sdk = await loadSdk();
  if (!auth) auth = sdk.auth.getAuth(getApp(sdk));
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
  if (!isGuestbookEnabled) {
    onChange(null);
    return () => {};
  }
  /* SDK 를 불러오는 사이에 화면이 사라질 수 있습니다. 정리 함수는 곧바로
     돌려주고, 늦게 붙은 구독은 뒤늦게 끊습니다. */
  let stop: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const { auth: authSdk } = await loadSdk();
    const instance = await getAuthOrNull();
    if (!instance || cancelled) return;
    const un = authSdk.onAuthStateChanged(instance, user => onChange(toSignedInUser(user)));
    if (cancelled) un();
    else stop = un;
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}

export async function signInWithGoogle() {
  const { auth: authSdk } = await loadSdk();
  const instance = await getAuthOrNull();
  if (!instance) throw new Error("로그인 기능이 설정되지 않았습니다.");

  try {
    await authSdk.signInWithPopup(instance, new authSdk.GoogleAuthProvider());
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
  const { auth: authSdk } = await loadSdk();
  const instance = await getAuthOrNull();
  if (instance) await authSdk.signOut(instance);
}

/* ---------------------------------------------------------------
   미니홈피 왼쪽 위 TODAY / TOTAL 방문 수입니다.
   counters/site 문서 하나에 total, today, day 를 담아 둡니다.
   --------------------------------------------------------------- */

/* 한줄평과 같은 Firebase 설정을 씁니다. */
export const isCounterEnabled = isGuestbookEnabled;

export type VisitCounts = { total: number; today: number };

/* 하루 경계를 방문자의 시간대가 아니라 미니홈피 기준 시간대로 맞춥니다.
   방문자마다 자정이 다르면 TODAY 숫자가 사람마다 다르게 보입니다.
   en-CA 로 포맷하면 2026-08-14 형태가 나옵니다. */
function localDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: siteTimezone }).format(new Date());
}

/* 방문 한 번을 기록하고 갱신된 값을 돌려줍니다.
   읽기와 쓰기를 한 트랜잭션으로 처리해서 동시에 들어와도 숫자가 어긋나지 않습니다. */
export async function recordVisit(): Promise<VisitCounts> {
  const { doc, runTransaction } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) throw new Error("방문 수 기능이 설정되지 않았습니다.");

  const ref = doc(store, "counters", "site");
  const day = localDay();

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

   비밀글은 보는 사람에 따라 질의를 달리합니다. Firestore 규칙은 목록 질의의
   필터가 아니라서, 문서마다 달라지는 조건(resource.data.uid == 내 uid)으로는
   컬렉션 전체를 훑는 질의가 통째로 거부됩니다. 질의 쪽에서 조건을 맞춰 줘야
   규칙이 통과시킵니다.

     주인장            orderBy(createdAt) + limit   (주인장 조건은 문서와 무관하게 참)
     로그인한 다른 사람  where(uid == 내 uid) + limit  (규칙 조건과 필터가 일치)
     로그아웃           질의하지 않음

   where 에 orderBy 를 붙이면 복합 색인을 배포해야 해서, 본인 글은 정렬 없이
   가져와 아래에서 시각순으로 정렬합니다. 본인이 남긴 비밀글 수는 적으므로
   limit 안에서 충분히 담깁니다. */
export function subscribeGuestbook(
  count: number,
  viewer: SignedInUser | null,
  onData: (entries: RemoteEntry[]) => void,
  onError: (error: Error) => void
) {
  if (!isGuestbookEnabled) return () => {};

  /* SDK 를 불러오는 사이에 화면이 사라질 수 있습니다. 정리 함수는 곧바로
     돌려주고, 늦게 붙은 구독은 뒤늦게 끊습니다. */
  let stop: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const { collection, limit: fsLimit, onSnapshot, orderBy, query, where } = (await loadSdk()).store;
    const store = await getDb();
    if (!store || cancelled) return;

    /* 두 컬렉션이 각자 따로 도착하므로 마지막 결과를 들고 있다가 합칩니다. */
    const latest: Record<string, RemoteEntry[]> = {};

    const publish = () => {
      const merged = [...(latest[GUESTBOOK_OPEN] ?? []), ...(latest[GUESTBOOK_SECRET] ?? [])]
        .sort((a, b) => b.at - a.at)
        .slice(0, count);
      onData(merged);
    };

    const toEntry = (id: string, data: Record<string, unknown>, secret: boolean): RemoteEntry => ({
      id,
      uid: String(data.uid ?? ""),
      edited: Boolean(data.editedAt),
      author: String(data.author ?? ""),
      text: String(data.text ?? ""),
      date: formatDate(data.createdAt),
      time: formatTime(data.createdAt),
      secret,
      at: toDate(data.createdAt).getTime()
    });

    const watch = (name: string, secret: boolean, constraints: QueryConstraint[]) => {
      const q = query(collection(store, name), ...constraints, fsLimit(count));
      return onSnapshot(
        q,
        snapshot => {
          latest[name] = snapshot.docs.map(doc => toEntry(doc.id, doc.data(), secret));
          publish();
        },
        error => onError(error as Error)
      );
    };

    const stops = [watch(GUESTBOOK_OPEN, false, [orderBy("createdAt", "desc")])];

    if (viewer && isSecretGuestbookEnabled) {
      stops.push(
        isOwner(viewer)
          ? watch(GUESTBOOK_SECRET, true, [orderBy("createdAt", "desc")])
          : watch(GUESTBOOK_SECRET, true, [where("uid", "==", viewer.uid)])
      );
    }

    const un = () => stops.forEach(stop => stop());
      if (cancelled) un();
      else stop = un;
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}

export async function addGuestbookEntry(text: string, secret = false) {
  const { addDoc, collection, serverTimestamp } = (await loadSdk()).store;
  const store = await getDb();
  const instance = await getAuthOrNull();
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

/* ---------------------------------------------------------------
   한줄평 수정과 삭제입니다.

     수정  작성자 본인만. 바꿀 수 있는 건 본문뿐입니다.
     삭제  작성자 본인과 주인장.

   주인장에게 수정 권한을 주지 않은 이유는, 남이 한 말의 내용을 바꾸면 그
   사람이 하지 않은 말이 그 사람 이름으로 남기 때문입니다. 부적절한 글은
   지우는 것으로 충분합니다. firestore.rules 도 같은 선을 긋습니다.
   --------------------------------------------------------------- */

async function entryRef(id: string, secret: boolean) {
  const { doc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) throw new Error("한줄평 기능이 설정되지 않았습니다.");
  return doc(store, secret ? GUESTBOOK_SECRET : GUESTBOOK_OPEN, id);
}

export function canEditEntry(viewer: SignedInUser | null | undefined, entryUid: string) {
  return Boolean(viewer && entryUid && viewer.uid === entryUid);
}

export function canDeleteEntry(viewer: SignedInUser | null | undefined, entryUid: string) {
  return canEditEntry(viewer, entryUid) || isOwner(viewer);
}

export async function updateGuestbookEntry(id: string, secret: boolean, text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error("한줄평을 적어 주세요.");
  if (trimmedText.length > GUESTBOOK_LIMITS.text) {
    throw new Error(`한줄평은 ${GUESTBOOK_LIMITS.text}자까지 쓸 수 있어요.`);
  }

  const { serverTimestamp, updateDoc } = (await loadSdk()).store;
  /* uid, author, createdAt 은 손대지 않습니다. 규칙도 이 셋의 변경을 막습니다. */
  await updateDoc(await entryRef(id, secret), { text: trimmedText, editedAt: serverTimestamp() });
}

export async function deleteGuestbookEntry(id: string, secret: boolean) {
  const { deleteDoc } = (await loadSdk()).store;
  await deleteDoc(await entryRef(id, secret));
}

/* ---------------------------------------------------------------
   오에카키(그림 남기기)입니다.

   그림은 Firebase Storage 가 아니라 Firestore 문서에 data URL 문자열로
   담습니다. 이 프로젝트에서는 Storage 가 켜져 있지 않고(새로 켜려면 요금제를
   올려야 하는 경우가 있습니다), 360x360 선 그림 한 장이 base64 로 12KB 라
   문서 한도 1MiB 의 1.2% 밖에 안 됩니다. 컬렉션 하나만 늘리면 끝이라
   설정 절차도 늘지 않습니다.

   대신 규칙에서 문자열 길이를 반드시 막아야 합니다. 안 그러면 1MiB 짜리
   문서를 계속 밀어 넣을 수 있습니다.
   --------------------------------------------------------------- */

export const OEKAKI = "oekaki";

/* image 는 data URL 문자열 길이 상한입니다. 300000자면 실제 이미지로는
   약 220KB 이고, 웬만큼 복잡한 그림도 여유 있게 들어갑니다. */
export const OEKAKI_LIMITS = { comment: 60, image: 300000, reply: 100, replay: 400000 } as const;

export type OekakiEntry = {
  id: string;
  uid: string;
  author: string;
  comment: string;
  /* data:image/png;base64,... 입니다.

     예전 그림은 문서 안에 들어 있고, 새 그림은 oekaki/{id}/image/data 하위
     문서에 있습니다. 목록을 받을 때 이미지까지 딸려오면 화면에 5장만 보여도
     수십 장을 통째로 받게 되어 옮겼습니다. Firestore JS SDK 에는 필드를 골라
     받는 기능이 없어서 문서를 나누는 수밖에 없습니다.

     그래서 목록에서는 비어 있을 수 있습니다. 보이는 것만 따로 가져옵니다. */
  image?: string;
  /* 주인장이 가린 그림인지. 가려지면 주인장 외에는 규칙이 읽기를 막습니다. */
  hidden: boolean;
  date: string;
  time: string;
  at: number;
};

/* 그림에 달리는 댓글입니다. oekaki/{id}/comments 하위 컬렉션에 들어갑니다. */
export type OekakiReply = {
  id: string;
  uid: string;
  author: string;
  text: string;
  date: string;
  time: string;
  at: number;
};

export function subscribeOekaki(
  count: number,
  viewer: SignedInUser | null,
  onData: (items: OekakiEntry[]) => void,
  onError: (error: Error) => void
) {
  if (!isGuestbookEnabled) return () => {};

  /* SDK 를 불러오는 사이에 화면이 사라질 수 있습니다. 정리 함수는 곧바로
     돌려주고, 늦게 붙은 구독은 뒤늦게 끊습니다. */
  let stop: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const { collection, limit: fsLimit, onSnapshot, orderBy, query, where } = (await loadSdk()).store;
    const store = await getDb();
    if (!store || cancelled) return;

    /* 한줄평 비밀글과 같은 이유로 보는 사람에 따라 질의가 다릅니다.
       규칙은 목록 질의를 걸러 주지 않으므로, 주인장이 아니면 질의에
       where("hidden","==",false) 를 붙여야 규칙이 통과시킵니다.
       orderBy 를 함께 쓰면 복합 색인이 필요해서, 정렬은 아래에서 합니다. */
    const owner = isOwner(viewer);
    const q = owner
      ? query(collection(store, OEKAKI), orderBy("createdAt", "desc"), fsLimit(count))
      : query(collection(store, OEKAKI), where("hidden", "==", false), fsLimit(count));

    const un = onSnapshot(
      q,
      snapshot => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            uid: String(data.uid ?? ""),
            author: String(data.author ?? ""),
            comment: String(data.comment ?? ""),
            image: String(data.image ?? ""),
            hidden: Boolean(data.hidden),
            date: formatDate(data.createdAt),
            time: formatTime(data.createdAt),
            at: toDate(data.createdAt).getTime()
          };
        });
        items.sort((a, b) => b.at - a.at);
        onData(items);
      },
      error => onError(error as Error)
    );
    if (cancelled) un();
    else stop = un;
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}

/* 그림 하나에 달린 댓글을 구독합니다. */
export function subscribeOekakiReplies(
  drawingId: string,
  onData: (items: OekakiReply[]) => void,
  onError: (error: Error) => void
) {
  if (!isGuestbookEnabled) return () => {};

  /* SDK 를 불러오는 사이에 화면이 사라질 수 있습니다. 정리 함수는 곧바로
     돌려주고, 늦게 붙은 구독은 뒤늦게 끊습니다. */
  let stop: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const { collection, limit: fsLimit, onSnapshot, orderBy, query } = (await loadSdk()).store;
    const store = await getDb();
    if (!store || cancelled) return;

    const q = query(
      collection(store, OEKAKI, drawingId, "comments"),
      orderBy("createdAt", "asc"),
      fsLimit(100)
    );
    const un = onSnapshot(
      q,
      snapshot => {
        onData(
          snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              uid: String(data.uid ?? ""),
              author: String(data.author ?? ""),
              text: String(data.text ?? ""),
              date: formatDate(data.createdAt),
              time: formatTime(data.createdAt),
              at: toDate(data.createdAt).getTime()
            };
          })
        );
      },
      error => onError(error as Error)
    );
    if (cancelled) un();
    else stop = un;
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}

export async function addOekakiReply(drawingId: string, text: string) {
  const { addDoc, collection, serverTimestamp } = (await loadSdk()).store;
  const store = await getDb();
  const instance = await getAuthOrNull();
  if (!store || !instance) throw new Error("댓글 기능이 설정되지 않았습니다.");

  const me = toSignedInUser(instance.currentUser);
  if (!me) throw new Error("구글 로그인 후 남길 수 있어요.");

  const trimmed = text.trim();
  if (!trimmed) throw new Error("댓글을 적어 주세요.");
  if (trimmed.length > OEKAKI_LIMITS.reply) {
    throw new Error(`댓글은 ${OEKAKI_LIMITS.reply}자까지 쓸 수 있어요.`);
  }

  await addDoc(collection(store, OEKAKI, drawingId, "comments"), {
    uid: me.uid,
    author: me.name,
    text: trimmed,
    createdAt: serverTimestamp()
  });
}

export async function deleteOekakiReply(drawingId: string, replyId: string) {
  const { deleteDoc, doc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) throw new Error("댓글 기능이 설정되지 않았습니다.");
  await deleteDoc(doc(store, OEKAKI, drawingId, "comments", replyId));
}

/* 주인장이 그림을 가리거나 다시 보이게 합니다. 규칙은 주인장에게만,
   그리고 hidden 한 칸만 바꾸도록 허용합니다. */
export async function setOekakiHidden(id: string, hidden: boolean) {
  const { doc, updateDoc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) throw new Error("그림 기능이 설정되지 않았습니다.");
  await updateDoc(doc(store, OEKAKI, id), { hidden });
}

/* 그리는 과정 기록입니다. 그림 문서가 아니라 하위 문서에 따로 둡니다.
   같은 문서에 넣으면 목록을 볼 때마다 딸려와서, 재생을 안 눌러도 매번
   받게 됩니다. 하위 문서면 재생을 누른 사람만 받습니다. */
export type OekakiReplay = { ops: string; count: number };

export async function getOekakiReplay(drawingId: string): Promise<OekakiReplay | null> {
  const { doc, getDoc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) return null;
  const snap = await getDoc(doc(store, OEKAKI, drawingId, "replay", "data"));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { ops: String(data.ops ?? ""), count: Number(data.count ?? 0) };
}

export async function addOekaki(image: string, comment: string, replay?: OekakiReplay) {
  const { addDoc, collection, doc, setDoc, serverTimestamp } = (await loadSdk()).store;
  const store = await getDb();
  const instance = await getAuthOrNull();
  if (!store || !instance) throw new Error("그림 기능이 설정되지 않았습니다.");

  const me = toSignedInUser(instance.currentUser);
  if (!me) throw new Error("구글 로그인 후 남길 수 있어요.");

  if (!image.startsWith("data:image/png;base64,")) throw new Error("그림을 만들지 못했어요.");
  if (image.length > OEKAKI_LIMITS.image) {
    throw new Error("그림이 너무 복잡해요. 조금 지우고 다시 남겨 주세요.");
  }

  const trimmed = comment.trim().slice(0, OEKAKI_LIMITS.comment);

  /* 이미지는 문서에 넣지 않습니다. 목록이 무거워집니다. */
  const created = await addDoc(collection(store, OEKAKI), {
    uid: me.uid,
    author: me.name,
    comment: trimmed,
    hidden: false,
    createdAt: serverTimestamp()
  });

  await setDoc(doc(store, OEKAKI, created.id, "image", "data"), {
    uid: me.uid,
    image
  });

  /* 기록이 상한을 넘으면 재생만 포기합니다. 그림은 이미 저장됐습니다. */
  if (replay && replay.ops.length <= OEKAKI_LIMITS.replay && replay.count > 0) {
    try {
      await setDoc(doc(store, OEKAKI, created.id, "replay", "data"), {
        uid: me.uid,
        ops: replay.ops,
        count: replay.count,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      /* 재생은 덤입니다. 실패해도 그림 남기기를 실패로 만들지 않습니다.
         다만 조용히 삼키면 왜 재생이 안 되는지 알 길이 없어서 남깁니다. */
      console.warn("[오에카키] 그리는 과정을 저장하지 못했습니다.", error);
    }
  } else if (replay && replay.count === 0) {
    console.warn("[오에카키] 기록된 획이 없어 재생을 저장하지 않았습니다.");
  } else if (replay) {
    console.warn(
      `[오에카키] 기록이 너무 커서 재생을 저장하지 않았습니다. ${replay.ops.length}자`
    );
  }
}

/* 삭제 권한은 한줄평과 같습니다. 작성자 본인과 주인장. */
export async function deleteOekaki(id: string) {
  const { deleteDoc, doc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) throw new Error("그림 기능이 설정되지 않았습니다.");
  await deleteDoc(doc(store, OEKAKI, id));
}

/* 그림 한 장을 가져옵니다. 목록에는 없으므로 보이는 것만 이걸로 채웁니다. */
export async function getOekakiImage(drawingId: string): Promise<string | null> {
  const { doc, getDoc } = (await loadSdk()).store;
  const store = await getDb();
  if (!store) return null;
  const snap = await getDoc(doc(store, OEKAKI, drawingId, "image", "data"));
  if (!snap.exists()) return null;
  return String(snap.data().image ?? "") || null;
}

/* 문서 안에 이미지가 남아 있는 예전 그림을 하위 문서로 옮깁니다.
   주인장만 할 수 있고, 규칙은 이미지를 빼는 것만 허용하고 바꾸는 것은 막습니다.
   남의 그림을 바꿔치울 수 있으면 안 됩니다. */
export async function moveOekakiImage(drawingId: string, image: string) {
  const { deleteField, doc, setDoc, updateDoc } = (await loadSdk()).store;
  const store = await getDb();
  const instance = await getAuthOrNull();
  if (!store || !instance) throw new Error("그림 기능이 설정되지 않았습니다.");
  const me = toSignedInUser(instance.currentUser);
  if (!isOwner(me)) throw new Error("주인장만 정리할 수 있어요.");

  await setDoc(doc(store, OEKAKI, drawingId, "image", "data"), {
    uid: me!.uid,
    image
  });
  await updateDoc(doc(store, OEKAKI, drawingId), { image: deleteField() });
}
