/* 미니홈피 색상입니다. 여기 값을 바꾸면 화면이 실제로 바뀝니다.

   이름은 "무슨 색인지"가 아니라 "어디에 쓰는지"로 지었습니다. rose 나 brown 처럼
   색 자체를 가리키는 이름은 팔레트를 바꾸는 순간 이름이 거짓말이 됩니다.

   구조: LinkTree 가 이 값들을 CSS 변수로 만들어 최상위 요소에 심고,
   globals.css 가 var(--이름) 으로 받아 씁니다. 새 색을 추가하려면 아래 타입,
   각 스킨 값, LinkTree 의 rootStyle, globals.css 네 곳을 함께 고쳐야 합니다.

   스킨이 둘입니다. 아래 theme(= classic) 은 기본 하늘색 다이어리이고,
   neonTheme 은 주인장이 화면에서 고를 수 있는 사이버 콘솔입니다. 색을
   바꾸고 싶으면 theme 을 고치세요. neonTheme 은 별도 디자인이라 함께
   손보지 않아도 됩니다.

   회색 계열(#333, #888, #ddd 같은 것)은 여기 없습니다. 팔레트가 바뀌어도
   그대로 두는 편이 자연스러운 구조색이라 globals.css 에 두었습니다. */
export type LinkTreeTheme = {
  colors: {
    /* --- 진입 화면 (스파이럴 인트로) --- */
    /* 밝은 바탕색. 인트로 배경과 강조 버튼의 글자색. */
    paper: string;
    /* 인트로 제목과 설명 글자. */
    ink: string;
    /* 주 강조색. 인트로 버튼 배경, 포커스 테두리. */
    accent: string;
    /* 스파이럴 셰이더의 선 색. */
    spiralFront: string;

    /* --- 미니홈피 바탕 (위에서 아래로 흐르는 그라데이션) --- */
    pageTop: string;
    pageMid: string;
    pageBottom: string;

    /* --- 다이어리 테두리와 탭 --- */
    /* 탭 배경과 다이어리 점선 테두리. */
    frame: string;
    /* 탭 테두리처럼 한 톤 진한 자리. */
    frameStrong: string;
    /* 탭과 버튼에 마우스를 올렸을 때. */
    frameHover: string;

    /* --- 글자 --- */
    /* 섹션 제목과 방명록 이름처럼 힘을 주는 글자. */
    heading: string;
    /* 미니룸 안내, 분류 표시 같은 보조 글자. */
    subInk: string;
    /* 작은 포인트 글자. */
    leaf: string;

    /* --- 강조 --- */
    /* TODAY 숫자, 지금 재생 중인 곡처럼 눈에 띄어야 하는 것. */
    point: string;
    /* 위 강조색의 연한 짝. */
    pointSoft: string;

    /* --- 옅은 바탕 --- */
    /* 프로필·미니룸 사진 뒤 바탕. */
    mint: string;
    /* 분류 배지 바탕. */
    mintTint: string;
    /* 파도타기 목록에 마우스를 올렸을 때. */
    blueTint: string;

    /* --- 상태 --- */
    /* 오류 문구. */
    danger: string;
  };
};

export const theme: LinkTreeTheme = {
  colors: {
    paper: "#FFFDF5",
    ink: "#2E4057",
    accent: "#3E7CB1",
    spiralFront: "#93C4E8",

    pageTop: "#DCEEFA",
    pageMid: "#BEDDF3",
    pageBottom: "#93C4E8",

    frame: "#A8CDE6",
    frameStrong: "#6E9EC4",
    frameHover: "#93C4E8",

    heading: "#24405C",
    subInk: "#4A6E92",
    leaf: "#3E7CB1",

    point: "#F4A11C",
    pointSoft: "#F8C878",

    mint: "#F2F7FB",
    mintTint: "#E9F2F9",
    blueTint: "#E6F1F8",

    danger: "#C0392B"
  }
};

/* 사이버 콘솔 스킨입니다. 주인장이 프로필 탭의 "홈피 설정" 에서 고릅니다.
   색과 글꼴만 여기서 오고, 3D 무대와 배치는 globals.css 의
   .cy-root[data-skin="neon"] 규칙과 NeonStage 가 맡습니다.

   frame 만 반투명입니다. 어두운 바탕 위에서 테두리가 배경빛을 머금어야
   네온 유리처럼 보입니다. */
export const neonTheme: LinkTreeTheme = {
  colors: {
    paper: "#03040D",
    ink: "#D8F6FF",
    accent: "#2BF0FF",
    spiralFront: "#2BF0FF",

    pageTop: "#070B24",
    pageMid: "#0A1034",
    pageBottom: "#03040D",

    frame: "rgba(43, 240, 255, .35)",
    frameStrong: "#2BF0FF",
    frameHover: "#FF2BD6",

    heading: "#F2FDFF",
    subInk: "#7C8DC0",
    leaf: "#9B72FF",

    point: "#FF2BD6",
    pointSoft: "#FF8CEB",

    mint: "#0A1034",
    mintTint: "#0C1440",
    blueTint: "#0E1848",

    danger: "#FF4D6D"
  }
};

/* 스킨 이름입니다. 저장된 값이 이 둘 중 하나가 아니면 classic 으로 봅니다.
   src/lib/skin.ts 가 그 판정을 합니다. */
export type SkinName = "classic" | "neon";

export const themes: Record<SkinName, LinkTreeTheme> = {
  classic: theme,
  neon: neonTheme
};

/* 스킨별 글꼴입니다. classic 은 이미 불러와 둔 본문 글꼴을 쓰고,
   neon 은 NeonStage 가 구글 폰트를 붙인 뒤에야 제 모습이 납니다.
   폰트가 아직 없으면 뒤의 대체 글꼴로 그려지고, 도착하면 바뀝니다. */
export const skinFonts: Record<SkinName, { display: string; body: string }> = {
  classic: {
    display: "'Pretendard', 'Noto Sans KR', system-ui, sans-serif",
    body: "'Pretendard', 'Noto Sans KR', system-ui, sans-serif"
  },
  neon: {
    display: "'Orbitron', 'Do Hyeon', system-ui, sans-serif",
    body: "'Share Tech Mono', 'Nanum Gothic Coding', ui-monospace, monospace"
  }
};
