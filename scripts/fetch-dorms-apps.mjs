/* 도름스 프로필에서 만든 앱 목록을 가져와 정적 파일로 굽습니다.

   왜 빌드할 때 하나
     dorms.school 은 CORS 헤더를 주지 않고 공개 API 도 없습니다. 브라우저에서
     직접 가져올 수 없습니다. 빌드할 때 한 번 가져와 JSON 으로 만들어 두면
     방문자는 추가 요청 없이 봅니다.

   실패해도 빌드를 멈추지 않습니다
     도름스가 잠깐 안 되거나 페이지 구조가 바뀌어도, 저장소에 담긴 지난
     결과를 그대로 씁니다. 미니홈피 배포가 남의 서비스 사정에 발목 잡히면
     안 됩니다.

   쓰는 법
     node scripts/fetch-dorms-apps.mjs
   package.json 의 prebuild 에서 자동으로 돕니다. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PROFILE = process.env.DORMS_PROFILE_URL
  ?? "https://dorms.school/u/17074aa0-a3a8-44f8-b40a-d7c044c5ade6";
const OUT_JSON = "src/config/dorms-apps.json";
const IMG_DIR = "public/assets/dorms";
/* 게시판 썸네일이 96px 이라 레티나 2배로 잡습니다. 다른 이미지와 같은 규격입니다. */
const THUMB = 256;

function log(...a) { console.log("[dorms]", ...a); }

/* 페이지에 박혀 있는 RSC 데이터에서 앱 객체를 꺼냅니다. */
function extractApps(html) {
  const u = html.replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\u002F/g, "/");
  const apps = [];
  for (const m of u.matchAll(/\{"appId":"/g)) {
    let depth = 0;
    for (let j = m.index; j < Math.min(m.index + 6000, u.length); j++) {
      if (u[j] === "{") depth++;
      else if (u[j] === "}") {
        depth--;
        if (depth === 0) {
          try { apps.push(JSON.parse(u.slice(m.index, j + 1))); } catch { /* 조각이면 버립니다 */ }
          break;
        }
      } else if (u[j] === "\n") break;
    }
  }
  const seen = new Set();
  return apps.filter(a => a.appId && !seen.has(a.appId) && seen.add(a.appId));
}

/* 업로드 파일명에 밀리초 시각이 들어 있어 올린 날짜를 알 수 있습니다. */
function uploadedOn(url) {
  const m = /\/(\d{13})_/.exec(url ?? "");
  if (!m) return null;
  return new Date(Number(m[1])).toISOString().slice(0, 10);
}

async function thumbnail(app) {
  const src = app.logo && app.logo.startsWith("http") ? app.logo : app.image;
  if (!src) return null;
  const file = `${app.appId}.webp`;
  const dest = path.join(IMG_DIR, file);
  /* 이미 있으면 다시 받지 않습니다. 저장소에 담아 두므로 새 앱만 받습니다. */
  if (existsSync(dest)) return `/assets/dorms/${file}`;

  const res = await fetch(src, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .resize({ width: THUMB, height: THUMB, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(dest);
  log(`받음 ${file} (${(buf.length / 1024).toFixed(0)}KB 원본)`);
  return `/assets/dorms/${file}`;
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });

  let html;
  try {
    const res = await fetch(PROFILE, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    log(`가져오지 못했습니다 (${e.message}). 저장소에 담긴 지난 결과를 씁니다.`);
    return;
  }

  const apps = extractApps(html);
  if (apps.length === 0) {
    log("앱을 찾지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다. 지난 결과를 씁니다.");
    return;
  }

  const out = [];
  for (const a of apps) {
    let preview = null;
    try {
      preview = await thumbnail(a);
    } catch (e) {
      log(`썸네일 실패 ${a.title}: ${e.message}`);
    }
    out.push({
      id: a.appId,
      title: (a.title ?? "").trim(),
      summary: (a.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      category: a.category ?? "기타",
      date: uploadedOn(a.image) ?? "",
      /* 앱 주소가 아니라 도름스의 앱 페이지로 보냅니다. 거기서 도름과
         댓글을 볼 수 있고, 앱으로 가는 길도 있습니다. */
      href: `https://dorms.school/apps/${a.appId}`,
      appUrl: a.appUrl ?? "",
      dorms: a.dorms ?? 0,
      comments: a.comments ?? 0,
      preview
    });
  }
  out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const json = JSON.stringify(out, null, 2) + "\n";
  const before = await readFile(OUT_JSON, "utf8").catch(() => "");
  await writeFile(OUT_JSON, json);
  log(`앱 ${out.length}개 ${before === json ? "변화 없음" : "갱신"}`);
}

await main();
