import path from "path";
import type { NextConfig } from "next";

/* GitHub Pages 프로젝트 페이지는 https://<계정>.github.io/<저장소>/ 하위에 서비스됩니다.
   빌드할 때 NEXT_PUBLIC_BASE_PATH=/저장소이름 을 넣어 주세요. 로컬 개발에서는 비워 둡니다. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  /* 홈 폴더에도 package-lock.json 이 있으면 Next 가 저장소 밖을 루트로
     잡고, 개발 서버가 페이지를 못 넘깁니다. 이 폴더를 루트로 고정합니다. */
  turbopack: {
    root: path.join(__dirname)
  }
};

export default nextConfig;
