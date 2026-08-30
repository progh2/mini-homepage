import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/* Next.js 기본 규칙과 접근성 규칙만 켭니다.
   이 저장소는 여러 사람이 AI 도구로 각자 고쳐 쓰는 제작 키트라,
   취향에 가까운 규칙은 넣지 않고 실수를 잡는 것만 남깁니다. */
const config = [
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  {
    rules: {
      /* output: "export" 라 next/image 최적화를 쓸 수 없고 컴포넌트도 순수 img 를
         씁니다. 이미지 용량은 public/assets 를 미리 줄여서 관리합니다. */
      "@next/next/no-img-element": "off"
    }
  }
];

export default config;
