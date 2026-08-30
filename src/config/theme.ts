/* 미니홈피 색상입니다. 여기 값을 바꾸면 화면이 실제로 바뀝니다.

   이름은 "무슨 색인지"가 아니라 "어디에 쓰는지"로 지었습니다. rose 나 brown 처럼
   색 자체를 가리키는 이름은 팔레트를 바꾸는 순간 이름이 거짓말이 됩니다.

   구조: LinkTree 가 이 값들을 CSS 변수로 만들어 최상위 요소에 심고,
   globals.css 가 var(--이름) 으로 받아 씁니다. 새 색을 추가하려면 아래 타입,
   theme 값, LinkTree 의 rootStyle, globals.css 네 곳을 함께 고쳐야 합니다.

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
