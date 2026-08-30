export type PillColor = {
  bg: string;
  fg: string;
};

/* 색 이름은 "무슨 색인지"가 아니라 "어디에 쓰는지"로 짓습니다.
   rose 나 brown 처럼 색 자체를 가리키는 이름은 팔레트를 바꾸는 순간
   이름이 거짓말이 됩니다. 실제로 이 파일은 크림/브라운 이름을 그대로 둔 채
   값만 파란 교실톤으로 바뀌어 있어서, brown 을 고쳐야 파란색이 바뀌는
   상태였습니다. */
export type LinkTreeTheme = {
  colors: {
    /* 밝은 바탕색. 인트로 배경과 강조 버튼의 글자색으로 씁니다. */
    paper: string;
    /* 본문 글자색. */
    ink: string;
    /* 흐린 보조 글자색. */
    dim: string;
    /* 눈에 띄어야 하는 배경(형광펜 자리). */
    highlight: string;
    /* 주 강조색. 버튼 배경 등. */
    accent: string;
    /* 주 강조색의 연한 짝. */
    accentSoft: string;
    /* 아주 옅은 바탕. 카드 안쪽 등. */
    tint: string;
    border: string;
    scrollTrack: string;
    scrollThumb: string;
    scrollThumbHover: string;
    /* 진입 화면 스파이럴 셰이더의 선 색. */
    spiralFront: string;
  };
  pillColors: PillColor[];
};

/* 주의: 지금 화면에 실제로 반영되는 값은 paper, ink, accent, spiralFront 네 개뿐이고
   그마저도 진입 화면에만 적용됩니다. 미니홈피 본문 색은 src/app/globals.css 에
   직접 박혀 있어서 여기를 고쳐도 바뀌지 않습니다. 이 구조 문제는 별도 이슈에서
   다룹니다. */
export const theme: LinkTreeTheme = {
  colors: {
    paper: "#FFFDF5",
    ink: "#2E4057",
    dim: "#7FA8C9",
    highlight: "#FFF1B8",
    accent: "#3E7CB1",
    accentSoft: "#A8D0E6",
    tint: "#EAF6FB",
    border: "rgba(62,124,177,0.25)",
    scrollTrack: "rgba(234,246,251,0.5)",
    scrollThumb: "linear-gradient(180deg, rgba(62,124,177,0.68), rgba(168,208,230,0.58))",
    scrollThumbHover: "linear-gradient(180deg, rgba(46,64,87,0.78), rgba(168,208,230,0.74))",
    spiralFront: "#FFC93C"
  },
  pillColors: [
    { bg: "#FFF1B8", fg: "#2E4057" },
    { bg: "#3E7CB1", fg: "#FFFDF5" },
    { bg: "#A8D0E6", fg: "#2E4057" },
    { bg: "#EAF6FB", fg: "#2E4057" }
  ]
};
