/* 주소의 ?draw=<id> 를 하나의 기준으로 삼습니다.

   그림을 열고 닫는 상태를 컴포넌트 안에만 두면, 탭을 다시 눌러 목록으로
   돌아가려 해도 열려 있던 그림이 그대로 남습니다. 주소를 기준으로 두면
   딥링크와 탭 동작이 같은 길로 흐릅니다. */
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(cb => cb());
}

export function subscribeDraw(cb: () => void) {
  listeners.add(cb);
  /* 뒤로 가기로 주소가 바뀌는 경우도 따라갑니다. */
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

export function readDraw(): string | null {
  return new URLSearchParams(window.location.search).get("draw");
}

/* 서버에서 그릴 때는 주소를 알 수 없습니다. */
export function readDrawOnServer(): string | null {
  return null;
}

/* 화면을 다시 그리지 않도록 replaceState 를 씁니다. 뒤로 가기 기록이
   그림 하나하나로 쌓이면 미니홈피를 빠져나가기 번거로워집니다. */
export function setDraw(id: string | null) {
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set("tab", "photo");
    url.searchParams.set("draw", id);
  } else {
    url.searchParams.delete("draw");
  }
  window.history.replaceState(null, "", url);
  notify();
}

export function drawUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "photo");
  url.searchParams.set("draw", id);
  return url.toString();
}
