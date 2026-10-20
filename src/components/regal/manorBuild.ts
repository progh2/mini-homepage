/* 왕실 스킨(영국 대저택)의 3D 조립 코드입니다.

   방 설정(rooms.ts)을 읽어 방 하나를 THREE.Group 으로 만듭니다.
   소품은 이 파일에서 기본 도형으로 직접 만듭니다(외부 3D 모델 없음).
   인물은 배경을 오린 전신 그림을 세운 판(스탠디)입니다.
   재질 사진은 Poly Haven CC0, 그림은 퍼블릭 도메인입니다. CREDITS.md 참고.

   성능 규칙(디자이너 지침):
   - 방마다 실시간 조명 1개 + 환경광. 그림자 계산은 끄고 바닥에 둥근 그림자 판을 깝니다.
   - 벽 모서리/바닥 가장자리의 어두움은 그라데이션 판으로 미리 칠해 둡니다(베이크).
   - 텍스처는 URL 하나에 한 장만 올리고, 반복 크기와 회전은 UV 로 바꿉니다.
   - 방 하나 3만 삼각형 이하. 인물 판은 삼각형 2개입니다. */

import type * as T from "three";
import type { Character, Door, Painting, Prop, Room, Side, Window } from "./rooms";

type Three = typeof import("three");

export type AlbumImage = { src: string; label: string };

export type BuildCtx = {
  ownerPhoto: string;
  ownerLabel: string;
  album: AlbumImage[];
  /* 문 너머로 보일 이웃 방 색 */
  roomColor: (id: string) => string;
  roomName: (id: string) => string;
  roomEn: (id: string) => string;
};

export type Hit =
  | { type: "door"; to: string; reveal?: boolean }
  | { type: "character" };

export type BuiltRoom = {
  room: Room;
  group: T.Group;
  hits: T.Object3D[];
  head: T.Vector3;
  animate: (t: number) => void;
  dispose: () => void;
  triangles: number;
  /* 서재의 비밀 책장을 0(닫힘)~1(활짝) 사이로 엽니다. 없으면 undefined. */
  openSecret?: (u: number) => void;
};

export type Kit = ReturnType<typeof createKit>;

const DEG = Math.PI / 180;
/* 뾰족 아치 높이 / 폭 (반지름 0.62W 인 두 원호) */
const GOTHIC_RISE = 0.62 * Math.sin(Math.acos((0.5 - 0.62) / 0.62));
/* 모리스 벽지 한 반복의 실제 크기(m). 폭은 21인치(53cm) 롤 기준, 높이는 스캔 비율에서. */
const PAPER_REPEAT: Record<string, [number, number]> = {
  "morris_pimpernel.webp": [0.53, 0.53 * (1024 / 606)],
  "morris_pinkrose.webp": [0.53, 0.53 * (1024 / 956)],
  "morris_willowbough.webp": [0.53, 0.53 * (1024 / 602)]
};
const TEX = "/assets/regal/tex/";

export function createKit(THREE: Three, url: (p: string) => string, aniso: number) {
  const loader = new THREE.TextureLoader();
  const cache = new Map<string, T.Texture>();
  const images = new Map<string, Promise<HTMLImageElement>>();
  const listeners = new Set<() => void>();
  let pending = 0;

  function changed() {
    listeners.forEach(cb => cb());
  }

  function texture(path: string, srgb = true) {
    const key = path + (srgb ? "" : "#lin");
    const hit = cache.get(key);
    if (hit) return hit;
    pending += 1;
    const t = loader.load(
      url(path),
      () => {
        pending -= 1;
        changed();
      },
      undefined,
      () => {
        pending -= 1;
        changed();
      }
    );
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    cache.set(key, t);
    return t;
  }

  function image(path: string) {
    let p = images.get(path);
    if (!p) {
      pending += 1;
      p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          pending -= 1;
          resolve(img);
        };
        img.onerror = () => {
          pending -= 1;
          reject(new Error("image " + path));
        };
        img.src = url(path);
      });
      images.set(path, p);
    }
    return p;
  }

  /* 캔버스 텍스처. draw 가 Promise 를 돌려주면 끝난 뒤 다시 올립니다. */
  function canvas(
    key: string,
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, c: HTMLCanvasElement) => void | Promise<void>,
    opts: { srgb?: boolean; repeat?: boolean } = {}
  ) {
    const hit = cache.get("cv:" + key);
    if (hit) return hit as T.CanvasTexture;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    cache.set("cv:" + key, t);
    const r = draw(g, c);
    if (r && typeof (r as Promise<void>).then === "function") {
      pending += 1;
      (r as Promise<void>)
        .then(() => {
          t.needsUpdate = true;
        })
        .catch(() => undefined)
        .finally(() => {
          pending -= 1;
          changed();
        });
    }
    return t;
  }

  return {
    THREE,
    url,
    texture,
    image,
    canvas,
    onChange(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get pending() {
      return pending;
    },
    dispose() {
      cache.forEach(t => t.dispose());
      cache.clear();
      listeners.clear();
    }
  };
}

/* ------------------------------------------------------------------ */
/* 캔버스 무늬                                                          */
/* ------------------------------------------------------------------ */

const SERIF = '"Cormorant Garamond", "Noto Serif KR", "Nanum Myeongjo", serif';
const SERIF_KR = '"Noto Serif KR", "Cormorant Garamond", "Nanum Myeongjo", serif';

function hex(c: string, k = 1) {
  const n = parseInt(c.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 다마스크 한 무늬(좌우 대칭). 512 반복 판에 4개가 엇갈려 들어갑니다. */
function damaskMotif(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = fill;
  for (const flip of [1, -1]) {
    g.save();
    g.scale(flip, 1);
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.35, -s * 0.8, s * 0.55, -s * 0.45, s * 0.25, -s * 0.15);
    g.bezierCurveTo(s * 0.7, -s * 0.3, s * 0.85, s * 0.2, s * 0.4, s * 0.35);
    g.bezierCurveTo(s * 0.55, s * 0.6, s * 0.3, s * 0.85, 0, s);
    g.lineTo(0, -s);
    g.fill();
    g.beginPath();
    g.ellipse(s * 0.62, -s * 0.62, s * 0.12, s * 0.2, 0.6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(s * 0.66, s * 0.66, s * 0.1, s * 0.16, -0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();
}

function wallpaper(kit: Kit, kind: string, base: string, ink: string) {
  return kit.canvas(`wp:${kind}:${base}:${ink}`, 512, 512, async g => {
    const paint = (jac: HTMLImageElement | null) => {
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.fillStyle = base;
      g.fillRect(0, 0, 512, 512);
      if (kind === "damask") {
        g.globalAlpha = 0.5;
        for (const [x, y] of [[128, 128], [384, 384], [384, -128], [128, 640], [-128, 384], [640, 128]]) {
          damaskMotif(g, x, y, 110, ink);
        }
        g.globalAlpha = 1;
      } else if (kind === "chintz") {
        const rnd = mulberry(7);
        for (let i = 0; i < 46; i++) {
          const x = rnd() * 512;
          const y = rnd() * 512;
          for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
            const px = x + dx;
            const py = y + dy;
            g.fillStyle = "rgba(92,110,78,0.55)";
            g.beginPath();
            g.ellipse(px - 9, py + 4, 9, 4, -0.5, 0, Math.PI * 2);
            g.ellipse(px + 9, py + 5, 9, 4, 0.5, 0, Math.PI * 2);
            g.fill();
            const hue = i % 3 === 0 ? "rgba(196,120,120,0.85)" : i % 3 === 1 ? "rgba(236,214,190,0.95)" : "rgba(214,160,120,0.85)";
            g.fillStyle = hue;
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2;
              g.beginPath();
              g.arc(px + Math.cos(a) * 5, py - 2 + Math.sin(a) * 5, 4.2, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = "rgba(200,160,70,0.9)";
            g.beginPath();
            g.arc(px, py - 2, 2.4, 0, Math.PI * 2);
            g.fill();
          }
        }
        /* 세로 줄무늬를 아주 옅게 */
        g.fillStyle = "rgba(255,255,255,0.08)";
        for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 6, 512);
      } else if (kind === "wash" || kind === "ashlar") {
        /* 석회 물칠(워시) 마감 */
        const rnd = mulberry(11);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = `rgba(${rnd() > 0.5 ? "255,250,240" : "90,70,50"},${0.02 + rnd() * 0.035})`;
          g.beginPath();
          g.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
          g.fill();
        }
        if (kind === "ashlar") {
          /* 마름돌 쌓기 줄눈: 한 판에 4단, 단마다 엇갈립니다. */
          for (let row = 0; row < 4; row++) {
            const y = row * 128;
            g.fillStyle = "rgba(70,52,36,0.35)";
            g.fillRect(0, y, 512, 3);
            g.fillStyle = "rgba(255,250,240,0.35)";
            g.fillRect(0, y + 3, 512, 2);
            for (let x = (row % 2) * 128; x < 512; x += 256) {
              g.fillStyle = "rgba(70,52,36,0.35)";
              g.fillRect(x, y, 3, 128);
              g.fillStyle = "rgba(0,0,0,0.05)";
              g.fillRect(x + 3, y + 5, 30, 123);
            }
          }
        }
      }
      if (jac) {
        g.globalCompositeOperation = "overlay";
        g.globalAlpha = kind === "velvet" ? 0.55 : 0.28;
        g.drawImage(jac, 0, 0, 512, 512);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
    };
    paint(null);
    const src = kind === "velvet" ? `${TEX}velour_velvet_diff.webp` : kind === "wash" || kind === "ashlar" ? `${TEX}plastered_wall_diff.webp` : `${TEX}floral_jacquard_diff.webp`;
    try {
      paint(await kit.image(src));
    } catch {
      /* 무늬만으로도 충분합니다. */
    }
  });
}

/* 대리석 체크 바닥. 한 장(1024)에 4x4 칸, 칸 사이 금줄. */
function checkerFloor(kit: Kit, light: string, dark: string) {
  return kit.canvas(`checker:${light}:${dark}`, 1024, 1024, async g => {
    const draw = (marble: HTMLImageElement | null) => {
      const n = 4;
      const s = 1024 / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const on = (i + j) % 2 === 0;
          g.fillStyle = on ? light : dark;
          g.fillRect(i * s, j * s, s, s);
          if (marble) {
            g.save();
            g.beginPath();
            g.rect(i * s, j * s, s, s);
            g.clip();
            g.globalCompositeOperation = on ? "multiply" : "screen";
            g.globalAlpha = on ? 0.55 : 0.16;
            g.translate(i * s + s / 2, j * s + s / 2);
            g.rotate(((i * 3 + j * 5) % 4) * (Math.PI / 2));
            g.drawImage(marble, ((i * 37) % 3) * -60 - s / 2, ((j * 53) % 3) * -60 - s / 2, s * 2, s * 2);
            g.restore();
          }
        }
      }
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(60,48,36,0.55)";
      g.lineWidth = 2;
      for (let k = 0; k <= n; k++) {
        g.beginPath();
        g.moveTo(k * s, 0);
        g.lineTo(k * s, 1024);
        g.moveTo(0, k * s);
        g.lineTo(1024, k * s);
        g.stroke();
      }
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}marble_01_diff.webp`));
    } catch {
      /* 단색 체크로 둡니다. */
    }
  });
}

/* ---------- 바닥 무늬(방마다 다르게) ---------- */

/* 나뭇결 사진을 잘라 붙이는 도우미. 잎 하나(rect)를 grain 각도로 채웁니다. */
function woodPiece(g: CanvasRenderingContext2D, img: HTMLImageElement | null, pts: [number, number][], angle: number, tint: string, seed: number) {
  g.save();
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.clip();
  const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
  const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  g.fillStyle = tint;
  g.fillRect(cx - 400, cy - 400, 800, 800);
  if (img) {
    g.translate(cx, cy);
    g.rotate(angle);
    g.globalCompositeOperation = "multiply";
    const o = (seed * 97) % 300;
    g.drawImage(img, o, o * 0.7, 420, 420, -260, -260, 520, 520);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
  g.strokeStyle = "rgba(30,18,10,0.55)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.stroke();
}

/* 밤하늘(비밀 서재 천장, 별 창문). 남색 바탕에 금빛 별. */
function starSky(kit: Kit) {
  return kit.canvas("starsky", 1024, 1024, g => {
    const grd = g.createRadialGradient(512, 420, 60, 512, 512, 720);
    grd.addColorStop(0, "#2a2a5a");
    grd.addColorStop(1, "#0c0c22");
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 1024);
    const r = mulberry(77);
    for (let i = 0; i < 420; i++) {
      const x = r() * 1024;
      const y = r() * 1024;
      const big = r() > 0.93;
      g.fillStyle = big ? "#f2d98e" : `rgba(255,248,230,${0.35 + r() * 0.6})`;
      if (big) {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 === 0 ? 9 : 3.5;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      } else {
        g.fillRect(x, y, 1.6, 1.6);
      }
    }
    /* 초승달 */
    g.fillStyle = "#f6e8b8";
    g.beginPath();
    g.arc(780, 240, 48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#1a1a40";
    g.beginPath();
    g.arc(800, 226, 44, 0, Math.PI * 2);
    g.fill();
  }, { repeat: false });
}

/* 베르사유 파케: 정사각 테 안에 대각선 격자가 엮인 판. 한 장 = 판 1개. */
function versaillesFloor(kit: Kit) {
  /* 베르사유 판 하나 = 캔버스 한 장: 바깥 테 + 안쪽 45° 엮은 띠 + 띠 사이 마름모 칸. 나뭇결은 가는 선으로 그립니다. */
  return kit.canvas("floor:versailles", 1024, 1024, g => {
    const S = 1024;
    const b = 64;
    const r = mulberry(31);
    const grain = (x0: number, y0: number, x1: number, y1: number, ang: number, base: string) => {
      g.save();
      g.beginPath();
      g.rect(x0, y0, x1 - x0, y1 - y0);
      g.clip();
      g.fillStyle = base;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2);
      g.rotate(ang);
      for (let i = -700; i < 700; i += 5 + r() * 5) {
        g.strokeStyle = `rgba(${r() > 0.5 ? "60,34,16" : "255,230,190"},${0.05 + r() * 0.1})`;
        g.lineWidth = 1 + r() * 2;
        g.beginPath();
        g.moveTo(-700, i);
        g.bezierCurveTo(-200, i + r() * 8 - 4, 200, i + r() * 8 - 4, 700, i);
        g.stroke();
      }
      g.restore();
    };
    /* 칸(어두운 참나무), 방향은 바둑판처럼 번갈아 */
    const n = 4;
    const step = (S - 2 * b) / n;
    for (let i = 0; i < n * 2; i++) {
      for (let j = 0; j < n * 2; j++) {
        const x0 = b + (i * step) / 2;
        const y0 = b + (j * step) / 2;
        grain(x0, y0, x0 + step / 2, y0 + step / 2, (i + j) % 2 ? 0 : Math.PI / 2, (i + j) % 3 === 0 ? "#9a6438" : "#a86e3e");
      }
    }
    /* 엮은 띠: +45°, -45° */
    g.save();
    g.beginPath();
    g.rect(b, b, S - 2 * b, S - 2 * b);
    g.clip();
    const sw = 34;
    for (const dir of [1, -1]) {
      for (let k = -n; k <= n * 2; k++) {
        g.save();
        g.translate(b + k * step, b);
        g.rotate((dir * Math.PI) / 4);
        if (dir < 0) g.translate(-step * 0, 0);
        grain(-sw / 2, -200, sw / 2, 1600, Math.PI / 2, "#c89258");
        g.strokeStyle = "rgba(40,22,10,0.7)";
        g.lineWidth = 2;
        g.strokeRect(-sw / 2, -200, sw, 1800);
        g.restore();
      }
    }
    g.restore();
    /* 바깥 테 */
    grain(0, 0, S, b, 0, "#b8804a");
    grain(0, S - b, S, S, 0, "#b8804a");
    grain(0, b, b, S - b, Math.PI / 2, "#a87442");
    grain(S - b, b, S, S - b, Math.PI / 2, "#a87442");
    g.strokeStyle = "rgba(30,18,10,0.75)";
    g.lineWidth = 3;
    g.strokeRect(b, b, S - 2 * b, S - 2 * b);
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    for (const [x, y] of [[0, 0], [S - b, 0], [0, S - b], [S - b, S - b]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + b, y + b);
      g.stroke();
    }
    const grd = g.createRadialGradient(512, 512, 40, 512, 512, 760);
    grd.addColorStop(0, "rgba(255,240,210,0.08)");
    grd.addColorStop(1, "rgba(0,0,0,0.14)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  });
}

/* 입체 큐브(텀블링 블록) 쪽매. 세 가지 나무 색으로 정육면체가 쌓인 듯 보입니다. */
function cubeFloor(kit: Kit) {
  return kit.canvas("floor:cube", 1024, 1024, async g => {
    const draw = (img: HTMLImageElement | null) => {
      const tones = ["#e2b884", "#b4804c", "#6e4426"];
      const s = 128;
      const h = s * Math.sqrt(3) / 2;
      let seed = 0;
      for (let row = -1; row < 1024 / (s * 1.5) + 1; row++) {
        for (let col = -1; col < 1024 / (h * 2) + 1; col++) {
          const cx = col * h * 2 + (row % 2 ? h : 0);
          const cy = row * s * 1.5;
          const top: [number, number][] = [[cx, cy - s], [cx + h, cy - s / 2], [cx, cy], [cx - h, cy - s / 2]];
          const left: [number, number][] = [[cx - h, cy - s / 2], [cx, cy], [cx, cy + s], [cx - h, cy + s / 2]];
          const right: [number, number][] = [[cx + h, cy - s / 2], [cx, cy], [cx, cy + s], [cx + h, cy + s / 2]];
          woodPiece(g, img, top, 0, tones[0], seed++);
          woodPiece(g, img, left, Math.PI / 3, tones[1], seed++);
          woodPiece(g, img, right, -Math.PI / 3, tones[2], seed++);
        }
      }
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}oak_veneer_01_diff.webp`));
    } catch {
      /* 단색 */
    }
  });
}

/* 빅토리아(민턴)식 인카우스틱 타일. 한 장에 2x2 칸이 들어가 반복됩니다. */
function encausticFloor(kit: Kit) {
  return kit.canvas("floor:encaustic", 1024, 1024, async g => {
    const draw = (wear: HTMLImageElement | null) => {
      const T = 512;
      const terra = "#9a3a24";
      const buff = "#d8b47a";
      const black = "#26201c";
      const cream = "#efe2c4";
      const slate = "#4b5a6e";
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const x = i * T;
          const y = j * T;
          const alt = (i + j) % 2 === 1;
          g.save();
          g.translate(x + T / 2, y + T / 2);
          g.fillStyle = alt ? black : terra;
          g.fillRect(-T / 2, -T / 2, T, T);
          /* 모서리 사분원(이웃 타일과 이어져 원이 됨) */
          g.fillStyle = buff;
          for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            g.beginPath();
            g.arc((cx * T) / 2, (cy * T) / 2, T * 0.2, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = alt ? terra : black;
          for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            g.beginPath();
            g.arc((cx * T) / 2, (cy * T) / 2, T * 0.11, 0, Math.PI * 2);
            g.fill();
          }
          /* 가운데 사엽(쿼터포일) */
          g.fillStyle = cream;
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            g.moveTo(Math.cos(a) * T * 0.17 + T * 0.13, Math.sin(a) * T * 0.17);
            g.arc(Math.cos(a) * T * 0.17, Math.sin(a) * T * 0.17, T * 0.13, 0, Math.PI * 2);
          }
          g.fill();
          g.fillStyle = alt ? buff : slate;
          g.beginPath();
          g.arc(0, 0, T * 0.12, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = alt ? terra : buff;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            g.beginPath();
            g.ellipse(Math.cos(a) * T * 0.06, Math.sin(a) * T * 0.06, T * 0.045, T * 0.018, a, 0, Math.PI * 2);
            g.fill();
          }
          /* 테두리 띠 */
          g.strokeStyle = buff;
          g.lineWidth = 10;
          g.strokeRect(-T / 2 + 26, -T / 2 + 26, T - 52, T - 52);
          g.restore();
          /* 줄눈 */
          g.strokeStyle = "rgba(20,14,10,0.8)";
          g.lineWidth = 5;
          g.strokeRect(x + 2, y + 2, T - 4, T - 4);
        }
      }
      if (wear) {
        g.globalCompositeOperation = "multiply";
        g.globalAlpha = 0.35;
        g.drawImage(wear, 0, 0, 1024, 1024);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}terracotta_floor_tiles_diff.webp`));
    } catch {
      /* 무늬만 */
    }
  });
}

/* ---------- 1880~90년대 마감재 캔버스 ---------- */

/* 돋을무늬(엠보싱) 칠: 같은 모양을 그림자(오른쪽 아래), 하이라이트(왼쪽 위), 바탕 순서로 겹칩니다.
   링크러스타(1877, 프레더릭 월턴)와 아나글립타(1887) 같은 돋을 벽지의 느낌을 냅니다. */
function relief(g: CanvasRenderingContext2D, path: () => void, fill: string, depth = 2.5, shade = 0.38, light = 0.3) {
  g.save();
  g.translate(depth, depth);
  g.fillStyle = `rgba(0,0,0,${shade})`;
  path();
  g.fill();
  g.translate(-depth * 1.8, -depth * 1.8);
  g.fillStyle = `rgba(255,248,230,${light})`;
  path();
  g.fill();
  g.translate(depth * 0.8, depth * 0.8);
  g.fillStyle = fill;
  path();
  g.fill();
  g.restore();
}

/* 해바라기(에스테틱 운동이 즐겨 쓴 꽃) 한 송이 경로 */
function sunflowerPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, petals = 14) {
  g.beginPath();
  for (let k = 0; k <= petals * 2; k++) {
    const a = (k / (petals * 2)) * Math.PI * 2;
    const rr = k % 2 === 0 ? r : r * 0.72;
    if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function linenNoise(g: CanvasRenderingContext2D, W: number, H: number, seed: number, n = 1400, a = 0.035) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? "255,248,230" : "30,20,10"},${a * (0.4 + r())})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 4, 1 + r() * 2);
  }
}

/* 링크러스타 징두리: 마름모 격자 안에 해바라기와 잎 소용돌이. tone 은 칠한 색. */
function lincrustaTex(kit: Kit, tone: string, gilt = false) {
  return kit.canvas(`lincrusta:${tone}:${gilt}`, 512, 512, g => {
    g.fillStyle = tone;
    g.fillRect(0, 0, 512, 512);
    linenNoise(g, 512, 512, 21, 900, 0.03);
    const fill = gilt ? "#b8934a" : hex(tone, 1.18);
    const S = 256;
    for (const [cx, cy] of [[128, 128], [384, 384], [384, 128], [128, 384]]) {
      const major = (cx === 128 && cy === 128) || (cx === 384 && cy === 384);
      if (major) {
        relief(g, () => sunflowerPath(g, cx, cy, 46), fill);
        relief(g, () => {
          g.beginPath();
          g.arc(cx, cy, 20, 0, Math.PI * 2);
        }, gilt ? "#8a6a2a" : hex(tone, 0.92));
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          relief(g, () => {
            g.beginPath();
            g.ellipse(cx + Math.cos(a) * 82, cy + Math.sin(a) * 82, 30, 11, a + Math.PI / 2, 0, Math.PI * 2);
          }, fill, 2);
        }
      } else {
        relief(g, () => {
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            g.moveTo(cx + Math.cos(a) * 18 + 16, cy + Math.sin(a) * 18);
            g.arc(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 16, 0, Math.PI * 2);
          }
        }, fill, 2);
      }
    }
    /* 마름모 격자(볼록한 띠) */
    g.save();
    g.lineWidth = 7;
    for (const [dx, sgn] of [[0, 1], [0, -1]] as [number, number][]) {
      for (let t = -2; t <= 2; t++) {
        const draw = (off: number, col: string) => {
          g.strokeStyle = col;
          g.beginPath();
          g.moveTo(t * S + dx + off, sgn > 0 ? off : 512 + off);
          g.lineTo(t * S + 512 + dx + off, sgn > 0 ? 512 + off : off);
          g.stroke();
        };
        draw(2.5, "rgba(0,0,0,0.3)");
        draw(-2, "rgba(255,248,230,0.26)");
        draw(0, fill);
      }
    }
    g.restore();
    void S;
  });
}

/* 아나글립타 천장: 크림색 바탕에 작은 꽃 격자 돋을무늬 */
function anaglyptaTex(kit: Kit) {
  return kit.canvas("anaglypta", 512, 512, g => {
    g.fillStyle = "#e6dac2";
    g.fillRect(0, 0, 512, 512);
    linenNoise(g, 512, 512, 33, 700, 0.025);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cx = x * 128 + 64 + (y % 2) * 64;
        const cy = y * 128 + 64;
        for (const ox of [0, -512]) {
          relief(g, () => sunflowerPath(g, cx + ox, cy, 22, 10), "#efe4cf", 2.2, 0.32, 0.45);
        }
        relief(g, () => {
          g.beginPath();
          g.arc(cx - 64 + (y % 2 ? 0 : 0), cy - 64, 6, 0, Math.PI * 2);
        }, "#f4ecdc", 1.4, 0.2, 0.4);
      }
    }
    g.save();
    g.lineWidth = 3;
    for (let t = 0; t <= 512; t += 128) {
      for (const [col, off] of [["rgba(0,0,0,0.12)", 1.5], ["rgba(255,255,255,0.35)", -1], ["#f2eadb", 0]] as [string, number][]) {
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(t + off, 0);
        g.lineTo(t + off, 512);
        g.moveTo(0, t + off);
        g.lineTo(512, t + off);
        g.stroke();
      }
    }
    g.restore();
  });
}

/* 대홀 위쪽 벽: 디스템퍼(석회 물감) 위에 스텐실로 찍은 고딕 꽃무늬(파우더링).
   크레이스(Crace) 공방의 스텐실 벽 장식을 단순화한 것입니다(무늬 자체는 추정). */
function stencilTex(kit: Kit, base: string, ink: string) {
  return kit.canvas(`stencil:${base}:${ink}`, 512, 512, g => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    const r = mulberry(17);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? "255,246,226" : "80,56,30"},${0.02 + r() * 0.03})`;
      g.beginPath();
      g.ellipse(r() * 512, r() * 512, 18 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const motif = (cx: number, cy: number, s: number) => {
      g.fillStyle = ink;
      /* 백합(플뢰르 드 리스) 세 잎 */
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.quadraticCurveTo(cx + s * 0.32, cy - s * 0.45, cx, cy + s * 0.1);
      g.quadraticCurveTo(cx - s * 0.32, cy - s * 0.45, cx, cy - s);
      g.fill();
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + sx * s * 0.9, cy - s * 0.7, cx + sx * s * 0.72, cy - s * 0.05);
        g.quadraticCurveTo(cx + sx * s * 0.55, cy + s * 0.12, cx, cy + s * 0.05);
        g.fill();
      }
      g.fillRect(cx - s * 0.42, cy + s * 0.08, s * 0.84, s * 0.12);
      g.beginPath();
      g.moveTo(cx - s * 0.12, cy + s * 0.2);
      g.lineTo(cx, cy + s * 0.62);
      g.lineTo(cx + s * 0.12, cy + s * 0.2);
      g.fill();
      g.fillStyle = "rgba(200,160,80,0.85)";
      g.beginPath();
      g.arc(cx, cy + s * 0.14, s * 0.07, 0, Math.PI * 2);
      g.fill();
    };
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = col * 128 + 64 + (row % 2) * 64;
        const cy = row * 128 + 64;
        motif(cx, cy, 30);
        if (cx + 64 > 512) motif(cx - 512, cy, 30);
      }
    }
    /* 작은 점 사엽 */
    g.fillStyle = ink;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = col * 128 + (row % 2) * 64;
        const cy = row * 128;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          g.beginPath();
          g.arc(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  });
}

/* 서재 위쪽 벽: 금박 돋을 가죽 벽지(일본식 가죽 종이, 1870~80년대 유행) */
function leatherPaperTex(kit: Kit) {
  return kit.canvas("leatherpaper", 512, 512, g => {
    g.fillStyle = "#4a3220";
    g.fillRect(0, 0, 512, 512);
    linenNoise(g, 512, 512, 41, 1600, 0.05);
    const gilt = "#a8823e";
    for (const [cx, cy] of [[128, 128], [384, 384], [384, -128], [128, 640], [-128, 384], [640, 128]]) {
      /* 석류: 몸통 + 왕관 + 잎 두 장 */
      relief(g, () => {
        g.beginPath();
        g.ellipse(cx, cy + 10, 44, 52, 0, 0, Math.PI * 2);
      }, gilt, 3);
      relief(g, () => {
        g.beginPath();
        g.ellipse(cx, cy + 14, 22, 30, 0, 0, Math.PI * 2);
      }, "#7a2a20", 1.6);
      relief(g, () => {
        g.beginPath();
        g.moveTo(cx - 20, cy - 38);
        g.lineTo(cx - 12, cy - 62);
        g.lineTo(cx, cy - 46);
        g.lineTo(cx + 12, cy - 62);
        g.lineTo(cx + 20, cy - 38);
        g.closePath();
      }, gilt, 2);
      for (const sx of [-1, 1]) {
        relief(g, () => {
          g.beginPath();
          g.ellipse(cx + sx * 70, cy + 30, 34, 12, sx * 0.7, 0, Math.PI * 2);
        }, "#6a6a34", 2);
      }
      /* 넝쿨 줄기 */
      g.strokeStyle = gilt;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, cy + 62);
      g.bezierCurveTo(cx + 40, cy + 120, cx + 120, cy + 90, cx + 128, cy + 128);
      g.stroke();
    }
  });
}

/* 모리스 방 프리즈(그림 레일과 코니스 사이 띠): 백합과 해바라기를 번갈아 */
function friezeTex(kit: Kit, base: string, ink: string) {
  return kit.canvas(`frieze:${base}:${ink}`, 1024, 128, g => {
    g.fillStyle = base;
    g.fillRect(0, 0, 1024, 128);
    linenNoise(g, 1024, 128, 9, 700, 0.03);
    g.fillStyle = ink;
    g.fillRect(0, 8, 1024, 4);
    g.fillRect(0, 116, 1024, 4);
    for (let i = 0; i < 8; i++) {
      const x = i * 128 + 64;
      if (i % 2 === 0) {
        sunflowerPath(g, x, 64, 30, 16);
        g.fill();
        g.fillStyle = hex(base, 0.7);
        g.beginPath();
        g.arc(x, 64, 13, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
      } else {
        g.beginPath();
        g.moveTo(x, 22);
        g.quadraticCurveTo(x + 16, 48, x, 70);
        g.quadraticCurveTo(x - 16, 48, x, 22);
        g.fill();
        g.fillRect(x - 2, 66, 4, 40);
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.ellipse(x + sx * 18, 86, 18, 6, sx * -0.6, 0, Math.PI * 2);
          g.fill();
        }
      }
      /* 사이를 잇는 줄기 */
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + 34, 64);
      g.quadraticCurveTo(x + 64, 40, x + 94, 64);
      g.stroke();
    }
  });
}

/* 참나무 판벽(징두리) 한 칸 */
function oakPanelTex(kit: Kit) {
  return kit.canvas("oakpanel", 512, 512, async g => {
    const draw = (oak: HTMLImageElement | null) => {
      g.fillStyle = "#6a4426";
      g.fillRect(0, 0, 512, 512);
      if (oak) {
        g.globalAlpha = 0.85;
        g.drawImage(oak, 0, 0, 512, 512);
        g.globalAlpha = 1;
        g.fillStyle = "rgba(60,32,14,0.45)";
        g.fillRect(0, 0, 512, 512);
      }
      /* 도드라진 판(빛은 왼쪽 위) */
      const inset = 64;
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(inset, inset, 512 - inset * 2, 10);
      g.fillRect(inset, inset, 10, 512 - inset * 2);
      g.fillStyle = "rgba(255,230,190,0.18)";
      g.fillRect(inset, 512 - inset - 10, 512 - inset * 2, 10);
      g.fillRect(512 - inset - 10, inset, 10, 512 - inset * 2);
      g.fillStyle = "rgba(255,230,190,0.08)";
      g.fillRect(inset + 40, inset + 40, 512 - inset * 2 - 80, 512 - inset * 2 - 80);
      g.strokeStyle = "rgba(0,0,0,0.3)";
      g.lineWidth = 4;
      g.strokeRect(inset + 40, inset + 40, 512 - inset * 2 - 80, 512 - inset * 2 - 80);
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}oak_veneer_01_diff.webp`));
    } catch {
      /* 단색 */
    }
  });
}

/* 민턴식 기하학 타일 바닥(15cm 타일). 빨강·검정·담황 마름모와 상감 무늬 타일을 엇갈립니다. 한 장이 1.2m. */
function mintonFloor(kit: Kit) {
  return kit.canvas("floor:minton", 1024, 1024, async g => {
    const draw = (wear: HTMLImageElement | null) => {
      const red = "#9a3a26";
      const black = "#221c18";
      const buff = "#d9bd88";
      const cream = "#efe2c2";
      const blue = "#3e5068";
      const S = 256;
      g.fillStyle = buff;
      g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const x = i * S;
          const y = j * S;
          const cx = x + S / 2;
          const cy = y + S / 2;
          /* 네 귀 빨간 삼각(이웃과 이어져 마름모) */
          g.fillStyle = red;
          g.fillRect(x, y, S, S);
          /* 검은 마름모 */
          g.fillStyle = black;
          g.beginPath();
          g.moveTo(cx, y);
          g.lineTo(x + S, cy);
          g.lineTo(cx, y + S);
          g.lineTo(x, cy);
          g.closePath();
          g.fill();
          /* 가운데 상감 타일 */
          const t = S * 0.46;
          g.fillStyle = cream;
          g.fillRect(cx - t / 2, cy - t / 2, t, t);
          g.fillStyle = (i + j) % 2 ? red : blue;
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k / 4) * Math.PI * 2;
            g.moveTo(cx + Math.cos(a) * t * 0.2 + t * 0.15, cy + Math.sin(a) * t * 0.2);
            g.arc(cx + Math.cos(a) * t * 0.2, cy + Math.sin(a) * t * 0.2, t * 0.15, 0, Math.PI * 2);
          }
          g.fill();
          g.fillStyle = buff;
          g.beginPath();
          g.arc(cx, cy, t * 0.11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = black;
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            g.beginPath();
            g.moveTo(cx + sx * t * 0.5, cy + sy * t * 0.5);
            g.lineTo(cx + sx * t * 0.3, cy + sy * t * 0.5);
            g.lineTo(cx + sx * t * 0.5, cy + sy * t * 0.3);
            g.fill();
          }
          /* 작은 담황 정사각(마름모 꼭짓점) */
          g.fillStyle = buff;
          for (const [px, py] of [[cx, y], [x, cy]]) {
            g.save();
            g.translate(px, py);
            g.rotate(Math.PI / 4);
            g.fillRect(-S * 0.07, -S * 0.07, S * 0.14, S * 0.14);
            g.restore();
          }
          /* 줄눈 */
          g.strokeStyle = "rgba(30,22,16,0.7)";
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(cx, y);
          g.lineTo(x + S, cy);
          g.lineTo(cx, y + S);
          g.lineTo(x, cy);
          g.closePath();
          g.stroke();
          g.strokeRect(cx - t / 2, cy - t / 2, t, t);
        }
      }
      if (wear) {
        g.globalCompositeOperation = "multiply";
        g.globalAlpha = 0.28;
        g.drawImage(wear, 0, 0, 1024, 1024);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
      /* 왁스 광택 얼룩 */
      const r = mulberry(5);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,240,210,${0.015 + r() * 0.02})`;
        g.beginPath();
        g.ellipse(r() * 1024, r() * 1024, 60 + r() * 120, 30 + r() * 60, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}terracotta_floor_tiles_diff.webp`));
    } catch {
      /* 무늬만 */
    }
  });
}

/* 민턴 바닥 테두리(검정 바탕 + 빨강/담황 톱니). 정사각 반복이라 어느 방향으로 깔아도 됩니다. */
function mintonBorder(kit: Kit) {
  return kit.canvas("floor:mintonBorder", 256, 256, g => {
    g.fillStyle = "#221c18";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * 64;
        const y = j * 64;
        g.fillStyle = (i + j) % 2 ? "#9a3a26" : "#d9bd88";
        g.beginPath();
        g.moveTo(x + 32, y + 8);
        g.lineTo(x + 56, y + 32);
        g.lineTo(x + 32, y + 56);
        g.lineTo(x + 8, y + 32);
        g.fill();
      }
    }
    g.strokeStyle = "rgba(10,8,6,0.8)";
    g.lineWidth = 2;
    for (let t = 0; t <= 256; t += 64) {
      g.beginPath();
      g.moveTo(t, 0);
      g.lineTo(t, 256);
      g.moveTo(0, t);
      g.lineTo(256, t);
      g.stroke();
    }
  });
}

/* 스테인드글라스: 납선 마름모 칸(쿼리) + 색 테두리 + 가운데 해바라기 원판. shape: rect 또는 arch */
function stainedGlassTex(kit: Kit, key: string, w: number, h: number, palette: [string, string, string]) {
  return kit.canvas(`stained:${key}`, w, h, g => {
    const [border, accent, roundel] = palette;
    g.fillStyle = "#e9e2c4";
    g.fillRect(0, 0, w, h);
    /* 쿼리 칸마다 아주 조금 다른 유리색 */
    const r = mulberry(key.length * 7 + 3);
    const q = 34;
    for (let y = -q; y < h + q; y += q) {
      for (let x = -q; x < w + q; x += q) {
        const ox = ((y / q) % 2) * (q / 2);
        g.fillStyle = `rgba(${236 - r() * 20},${232 - r() * 18},${196 - r() * 30},1)`;
        g.beginPath();
        g.moveTo(x + ox, y - q / 2);
        g.lineTo(x + ox + q / 2, y);
        g.lineTo(x + ox, y + q / 2);
        g.lineTo(x + ox - q / 2, y);
        g.fill();
      }
    }
    g.strokeStyle = "#2a2622";
    g.lineWidth = 3;
    for (let t = -h; t < w + h; t += q) {
      g.beginPath();
      g.moveTo(t, 0);
      g.lineTo(t + h, h);
      g.moveTo(t, h);
      g.lineTo(t + h, 0);
      g.stroke();
    }
    /* 테두리 띠 */
    const bw = Math.min(w, h) * 0.12;
    g.fillStyle = border;
    g.fillRect(0, 0, w, bw);
    g.fillRect(0, h - bw, w, bw);
    g.fillRect(0, 0, bw, h);
    g.fillRect(w - bw, 0, bw, h);
    g.fillStyle = accent;
    for (let x = bw / 2; x < w; x += bw * 1.6) {
      g.beginPath();
      g.arc(x, bw / 2, bw * 0.28, 0, Math.PI * 2);
      g.arc(x, h - bw / 2, bw * 0.28, 0, Math.PI * 2);
      g.fill();
    }
    for (let y = bw / 2; y < h; y += bw * 1.6) {
      g.beginPath();
      g.arc(bw / 2, y, bw * 0.28, 0, Math.PI * 2);
      g.arc(w - bw / 2, y, bw * 0.28, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "#2a2622";
    g.lineWidth = 4;
    g.strokeRect(bw, bw, w - bw * 2, h - bw * 2);
    g.strokeRect(2, 2, w - 4, h - 4);
    /* 가운데 원판: 해바라기 */
    const cx = w / 2;
    const cy = h * (h > w ? 0.42 : 0.5);
    const rr = Math.min(w, h) * 0.26;
    g.fillStyle = roundel;
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8b83a";
    sunflowerPath(g, cx, cy, rr * 0.78, 12);
    g.fill();
    g.fillStyle = "#6a3a18";
    g.beginPath();
    g.arc(cx, cy, rr * 0.32, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#2a2622";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    sunflowerPath(g, cx, cy, rr * 0.78, 12);
    g.stroke();
  }, { repeat: false });
}

/* 온실 유리 너머: 흐릿한 정원(잔디, 자갈길, 먼 나무, 흐린 여름 하늘). 캔버스 블러로 초점이 나간 듯이. */
function gardenBlurTex(kit: Kit) {
  return kit.canvas("gardenblur", 1024, 384, g => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 384;
    const s = c.getContext("2d")!;
    const sky = s.createLinearGradient(0, 0, 0, 384);
    sky.addColorStop(0, "#c4d6e4");
    sky.addColorStop(0.45, "#e8eee8");
    sky.addColorStop(0.58, "#b8c8a8");
    sky.addColorStop(1, "#6a8a5a");
    s.fillStyle = sky;
    s.fillRect(0, 0, 1024, 384);
    const r = mulberry(77);
    /* 흰 구름 */
    for (let i = 0; i < 14; i++) {
      s.fillStyle = "rgba(255,255,255,0.5)";
      s.beginPath();
      s.ellipse(r() * 1024, 30 + r() * 90, 60 + r() * 90, 14 + r() * 18, 0, 0, Math.PI * 2);
      s.fill();
    }
    /* 먼 나무 줄(푸른 회색) + 가까운 나무 덩어리 */
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < 40; i++) {
        const x = r() * 1024;
        const hh = (layer ? 70 : 45) + r() * 60;
        const base = layer ? 226 : 214;
        s.fillStyle = layer ? `rgba(${70 + r() * 30},${98 + r() * 30},${62 + r() * 20},0.95)` : `rgba(${120 + r() * 20},${144 + r() * 20},${128 + r() * 20},0.9)`;
        s.beginPath();
        s.ellipse(x, base - hh * 0.45, 28 + r() * 40, hh * 0.55, 0, 0, Math.PI * 2);
        s.fill();
        for (const dx of [-1024, 1024]) {
          s.beginPath();
          s.ellipse(x + dx, base - hh * 0.45, 28 + r() * 40, hh * 0.55, 0, 0, Math.PI * 2);
          s.fill();
        }
      }
    }
    /* 잔디와 자갈길, 꽃밭 */
    s.fillStyle = "#7a9a5e";
    s.fillRect(0, 228, 1024, 156);
    s.fillStyle = "#d6cbb0";
    s.fillRect(0, 268, 1024, 22);
    for (let i = 0; i < 120; i++) {
      const cols = ["#e88a8a", "#f2e2a0", "#ffffff", "#c88ac0", "#e8a060"];
      s.fillStyle = cols[i % cols.length];
      s.beginPath();
      s.arc(r() * 1024, 300 + r() * 40, 3 + r() * 4, 0, Math.PI * 2);
      s.fill();
    }
    g.filter = "blur(7px)";
    g.drawImage(c, -12, 0, 1048, 384);
    g.filter = "none";
    /* 유리 너머 습기 낀 느낌 */
    g.fillStyle = "rgba(235,242,230,0.22)";
    g.fillRect(0, 0, 1024, 384);
  });
}

/* 대홀 바닥 위에 까는 한 장짜리 오푸스 섹틸레(대리석 상감) 문양: 가장자리 띠, 가운데 별 장미, 네 귀 사엽. */
function opusOverlay(kit: Kit) {
  return kit.canvas("floor:opus", 1024, 1024, async g => {
    const draw = (marble: HTMLImageElement | null) => {
      g.clearRect(0, 0, 1024, 1024);
      const band = (inset: number, wdt: number, col: string) => {
        g.fillStyle = col;
        g.fillRect(inset, inset, 1024 - inset * 2, wdt);
        g.fillRect(inset, 1024 - inset - wdt, 1024 - inset * 2, wdt);
        g.fillRect(inset, inset, wdt, 1024 - inset * 2);
        g.fillRect(1024 - inset - wdt, inset, wdt, 1024 - inset * 2);
      };
      band(0, 46, "#2b2a28");
      band(46, 8, "#c2a15a");
      band(54, 30, "#7a1f2b");
      band(84, 8, "#c2a15a");
      /* 띠 안의 기요셰(꼬임) 무늬 */
      g.strokeStyle = "#ede8de";
      g.lineWidth = 4;
      for (let t = 70; t < 954; t += 34) {
        for (const [x, y, rot] of [[t, 69, 0], [t, 955, 0], [69, t, 1], [955, t, 1]] as [number, number, number][]) {
          g.beginPath();
          if (rot) g.ellipse(x, y, 10, 15, 0, 0, Math.PI * 2);
          else g.ellipse(x, y, 15, 10, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      /* 네 귀 사엽 */
      for (const [x, y] of [[190, 190], [834, 190], [190, 834], [834, 834]]) {
        g.fillStyle = "#7a1f2b";
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          g.beginPath();
          g.arc(x + Math.cos(a) * 22, y + Math.sin(a) * 22, 20, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#c2a15a";
        g.beginPath();
        g.arc(x, y, 14, 0, Math.PI * 2);
        g.fill();
      }
      /* 가운데 큰 원과 16점 별 */
      g.save();
      g.translate(512, 470);
      for (const [r, col] of [[300, "#2b2a28"], [288, "#c2a15a"], [276, "#ede8de"], [210, "#7a1f2b"], [198, "#ede8de"]] as [number, string][]) {
        g.fillStyle = col;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
      }
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = k % 2 === 0 ? 270 : 180;
        g.fillStyle = k % 4 === 0 ? "#2b2a28" : k % 2 === 0 ? "#7a1f2b" : "#c2a15a";
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a - 0.11) * 46, Math.sin(a - 0.11) * 46);
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        g.lineTo(Math.cos(a + 0.11) * 46, Math.sin(a + 0.11) * 46);
        g.fill();
      }
      g.fillStyle = "#ede8de";
      g.beginPath();
      g.arc(0, 0, 40, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (marble) {
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = 0.4;
        g.drawImage(marble, 0, 0, 1024, 1024);
        g.globalCompositeOperation = "source-over";
        g.globalAlpha = 1;
      }
    };
    draw(null);
    try {
      draw(await kit.image(`${TEX}marble_01_diff.webp`));
    } catch {
      /* 무늬만 */
    }
  }, { repeat: false });
}

/* 양탄자. 방마다 다른 직조 양식입니다(한 장, 반복 없음).
   persian: 페르시아 메달리온 + 꽃잎 바탕, aubusson-*: 프랑스 오뷔송 꽃다발 타원,
   savonnerie: 사보느리 소용돌이와 가운데 장미, gul: 투르크멘 굴(팔각) 줄무늬. */
function rugTexture(kit: Kit, style: string) {
  return kit.canvas(`rug:${style}`, 1024, 768, g => {
    const W = 1024;
    const H = 768;
    const rnd = mulberry(style.length * 97 + style.charCodeAt(0));
    const fibre = (n: number) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = `rgba(${rnd() > 0.5 ? "255,240,220" : "20,10,6"},${0.025 + rnd() * 0.04})`;
        g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1);
      }
    };
    const frame = (inset: number, wdt: number, col: string) => {
      g.strokeStyle = col;
      g.lineWidth = wdt;
      g.strokeRect(inset + wdt / 2, inset + wdt / 2, W - inset * 2 - wdt, H - inset * 2 - wdt);
    };
    const rose = (x: number, y: number, r: number, petal: string, heart: string) => {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.fillStyle = petal;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.55, r * 0.35, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = heart;
      g.beginPath();
      g.arc(x, y, r * 0.35, 0, Math.PI * 2);
      g.fill();
    };
    const leaf = (x: number, y: number, a: number, len: number, col: string) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.5, len * 0.16, a, 0, Math.PI * 2);
      g.fill();
    };

    if (style === "persian") {
      g.fillStyle = "#7a1e22";
      g.fillRect(0, 0, W, H);
      /* 바탕의 작은 꽃(헤라티) 반복 */
      for (let y = 120; y < H - 100; y += 44) {
        for (let x = 120 + ((y / 44) % 2) * 22; x < W - 100; x += 44) {
          g.fillStyle = "#1f2a44";
          g.beginPath();
          g.moveTo(x, y - 12);
          g.lineTo(x + 12, y);
          g.lineTo(x, y + 12);
          g.lineTo(x - 12, y);
          g.fill();
          g.fillStyle = "#e0c088";
          g.beginPath();
          g.arc(x, y, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      /* 가운데 메달리온과 펜던트 */
      g.save();
      g.translate(W / 2, H / 2);
      for (const [rx, ry, col] of [[260, 200, "#e8d8b8"], [244, 186, "#1f2a44"], [200, 150, "#c9a25a"], [180, 134, "#7a1e22"], [110, 82, "#e8d8b8"], [60, 44, "#1f2a44"]] as [number, number, string][]) {
        g.fillStyle = col;
        g.beginPath();
        for (let k = 0; k <= 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          const wob = k % 2 === 0 ? 1 : 0.9;
          g.lineTo(Math.cos(a) * rx * wob, Math.sin(a) * ry * wob);
        }
        g.fill();
      }
      for (const sy of [-1, 1]) {
        g.fillStyle = "#e8d8b8";
        g.beginPath();
        g.moveTo(-40, sy * 190);
        g.lineTo(0, sy * 270);
        g.lineTo(40, sy * 190);
        g.fill();
      }
      g.restore();
      /* 네 귀 스판드럴: 상아색 바탕 + 금빛 테 + 작은 꽃(그림자로 읽히지 않게 밝게) */
      for (const [x, y, a0] of [[100, 100, 0], [W - 100, 100, Math.PI / 2], [W - 100, H - 100, Math.PI], [100, H - 100, -Math.PI / 2]] as [number, number, number][]) {
        g.fillStyle = "#e8d8b8";
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, 150, a0, a0 + Math.PI / 2);
        g.closePath();
        g.fill();
        g.strokeStyle = "#c9a25a";
        g.lineWidth = 6;
        g.beginPath();
        g.arc(x, y, 146, a0, a0 + Math.PI / 2);
        g.stroke();
        for (let k = 0; k < 3; k++) {
          const a = a0 + ((k + 0.5) / 3) * (Math.PI / 2);
          rose(x + Math.cos(a) * 92, y + Math.sin(a) * 92, 14, "#c46a4a", "#1f2a44");
          leaf(x + Math.cos(a) * 92, y + Math.sin(a) * 92, a + 0.9, 30, "#5e7450");
        }
        rose(x + Math.cos(a0 + Math.PI / 4) * 40, y + Math.sin(a0 + Math.PI / 4) * 40, 16, "#7a1e22", "#c9a25a");
      }
      frame(0, 90, "#1f2a44");
      frame(12, 6, "#c9a25a");
      frame(84, 6, "#c9a25a");
      /* 띠 안 꽃 넝쿨 */
      for (let t = 60; t < W - 40; t += 56) {
        rose(t, 45, 14, "#c46a4a", "#e8d8b8");
        rose(t, H - 45, 14, "#c46a4a", "#e8d8b8");
      }
      for (let t = 100; t < H - 60; t += 56) {
        rose(45, t, 14, "#c46a4a", "#e8d8b8");
        rose(W - 45, t, 14, "#c46a4a", "#e8d8b8");
      }
    } else if (style.startsWith("aubusson")) {
      const sage = style.endsWith("sage");
      const field = sage ? "#e9e2cc" : "#f3e6dc";
      const ground = sage ? "#8a9a76" : "#b9787c";
      const petal = sage ? "#c98a7a" : "#e6b8b0";
      const leafC = sage ? "#5e7450" : "#7a8a60";
      g.fillStyle = ground;
      g.fillRect(0, 0, W, H);
      /* 크림 바탕 타원 */
      g.fillStyle = field;
      g.beginPath();
      g.ellipse(W / 2, H / 2, W * 0.4, H * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#c2a15a";
      g.lineWidth = 8;
      g.stroke();
      /* 꽃다발 화환 */
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const x = W / 2 + Math.cos(a) * W * 0.4;
        const y = H / 2 + Math.sin(a) * H * 0.36;
        leaf(x, y, a + 1.2, 40, leafC);
        leaf(x, y, a - 1.9, 34, leafC);
        rose(x, y, 18, petal, "#a04a48");
      }
      /* 가운데 꽃다발 */
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        leaf(W / 2, H / 2, a, 90, leafC);
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        rose(W / 2 + Math.cos(a) * 46, H / 2 + Math.sin(a) * 36, 24, petal, "#a04a48");
      }
      rose(W / 2, H / 2, 32, petal, "#8a3a3a");
      /* 네 귀 꽃 */
      for (const [x, y] of [[130, 120], [W - 130, 120], [130, H - 120], [W - 130, H - 120]]) {
        leaf(x, y, 0.4, 50, leafC);
        leaf(x, y, 2.6, 50, leafC);
        rose(x, y, 22, field, "#a04a48");
      }
      frame(0, 28, sage ? "#5a6a4a" : "#8a4a52");
      frame(28, 6, "#c2a15a");
    } else if (style === "savonnerie") {
      g.fillStyle = "#2e4466";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#e8e0cc";
      g.fillRect(70, 70, W - 140, H - 140);
      g.strokeStyle = "#c2a15a";
      g.lineWidth = 6;
      /* 소용돌이(아칸서스 스크롤) */
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate(a);
        g.strokeStyle = "#4e6c94";
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(80, 0);
        g.bezierCurveTo(180, -60, 260, 40, 220, 90);
        g.bezierCurveTo(200, 120, 160, 100, 170, 70);
        g.stroke();
        g.restore();
      }
      g.fillStyle = "#4e6c94";
      g.beginPath();
      g.arc(W / 2, H / 2, 86, 0, Math.PI * 2);
      g.fill();
      rose(W / 2, H / 2, 52, "#e8c8b0", "#a04a48");
      /* 띠에 달걀과 창(에그 앤 다트) */
      for (let t = 90; t < W - 70; t += 40) {
        for (const y of [35, H - 35]) {
          g.fillStyle = "#e8e0cc";
          g.beginPath();
          g.ellipse(t, y, 12, 18, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      for (let t = 90; t < H - 70; t += 40) {
        for (const x of [35, W - 35]) {
          g.fillStyle = "#e8e0cc";
          g.beginPath();
          g.ellipse(x, t, 18, 12, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      frame(64, 6, "#c2a15a");
    } else {
      /* gul: 진한 자주 바탕에 팔각 굴이 줄지어 놓입니다. */
      g.fillStyle = "#5a1a2e";
      g.fillRect(0, 0, W, H);
      const oct = (x: number, y: number, r: number, col: string) => {
        g.fillStyle = col;
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
          g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.72);
        }
        g.fill();
      };
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const x = 220 + col * 195;
          const y = 200 + row * 184;
          oct(x, y, 78, "#e8d2c0");
          oct(x, y, 66, "#2a1428");
          oct(x, y, 50, row % 2 ? "#c2a15a" : "#b04a3a");
          g.fillStyle = "#2a1428";
          g.fillRect(x - 40, y - 3, 80, 6);
          g.fillRect(x - 3, y - 30, 6, 60);
          oct(x, y, 14, "#e8d2c0");
        }
      }
      frame(0, 64, "#2a1428");
      g.fillStyle = "#c2a15a";
      for (let t = 30; t < W; t += 36) {
        for (const y of [32, H - 32]) {
          g.beginPath();
          g.moveTo(t, y - 12);
          g.lineTo(t + 12, y);
          g.lineTo(t, y + 12);
          g.lineTo(t - 12, y);
          g.fill();
        }
      }
    }
    fibre(5200);
    /* 털이 눌린 가장자리 그늘 */
    const grd = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(0,0,0,0.25)");
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }, { repeat: false });
}

function labelTexture(kit: Kit, key: string, lines: { text: string; size: number; weight?: number; kr?: boolean; color?: string }[], w = 512, h = 192, bg = "#f3ead6", fg = "#2c2016") {
  return kit.canvas(`label:${key}`, w, h, g => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,90,40,0.55)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    const total = lines.reduce((s, l) => s + l.size * 1.25, 0);
    let y = (h - total) / 2;
    g.textAlign = "center";
    g.textBaseline = "top";
    for (const l of lines) {
      g.fillStyle = l.color ?? fg;
      g.font = `${l.weight ?? 600} ${l.size}px ${l.kr ? SERIF_KR : SERIF}`;
      g.fillText(l.text, w / 2, y, w - 30);
      y += l.size * 1.25;
    }
  }, { repeat: false });
}

/* 문패(황동). */
function plaqueTexture(kit: Kit, kr: string, en: string) {
  return kit.canvas(`plaque:${kr}:${en}`, 512, 256, g => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#e9cf86");
    grd.addColorStop(0.5, "#b88a3e");
    grd.addColorStop(1, "#d8b56a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = "#6a4a1a";
    g.lineWidth = 6;
    g.strokeRect(14, 14, 484, 228);
    g.textAlign = "center";
    g.fillStyle = "#3a2410";
    g.font = `600 92px ${SERIF_KR}`;
    g.fillText(kr, 256, 128, 460);
    g.font = `600 44px ${SERIF}`;
    g.fillText(en.toUpperCase(), 256, 200, 460);
  }, { repeat: false });
}

function radialTexture(kit: Kit, key: string, inner: string, outer: string) {
  return kit.canvas(`rad:${key}`, 128, 128, g => {
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }, { repeat: false });
}

function vGradient(kit: Kit) {
  return kit.canvas("vgrad", 4, 128, g => {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, "rgba(0,0,0,0.0)");
    grd.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
  }, { repeat: false });
}

/* 불꽃 스프라이트(8칸). offset 만 바꿔 돌립니다. */
function flameSheet(kit: Kit) {
  return kit.canvas("flame", 512, 64, g => {
    for (let f = 0; f < 8; f++) {
      const cx = f * 64 + 32;
      for (let k = 0; k < 4; k++) {
        const sway = Math.sin(f * 0.8 + k) * 5;
        const h = 44 - k * 8 + Math.sin(f * 1.7 + k * 2) * 6;
        const grd = g.createRadialGradient(cx + sway * 0.5, 58, 2, cx + sway, 58 - h * 0.5, h);
        grd.addColorStop(0, k === 3 ? "rgba(255,255,220,0.95)" : "rgba(255,210,120,0.9)");
        grd.addColorStop(0.5, "rgba(255,120,30,0.55)");
        grd.addColorStop(1, "rgba(120,20,0,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(cx - 18 + k * 3, 62);
        g.quadraticCurveTo(cx - 16 + sway, 30, cx + sway * 1.4, 60 - h);
        g.quadraticCurveTo(cx + 16 + sway, 30, cx + 18 - k * 3, 62);
        g.fill();
      }
    }
  }, { repeat: false });
}

function sparkleTexture(kit: Kit) {
  return kit.canvas("sparkle", 64, 64, g => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,240,200,0.5)");
    grd.addColorStop(1, "rgba(255,220,160,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(32, 2);
    g.lineTo(32, 62);
    g.moveTo(2, 32);
    g.lineTo(62, 32);
    g.stroke();
  }, { repeat: false });
}

/* ------------------------------------------------------------------ */
/* 방 조립                                                              */
/* ------------------------------------------------------------------ */

type Wall = { side: Side; len: number; group: T.Group };

export function buildRoom(kit: Kit, room: Room, ctx: BuildCtx): BuiltRoom {
  const THREE = kit.THREE;
  const { w, d, h } = room.size;
  const group = new THREE.Group();
  group.name = room.id;
  const geometries: T.BufferGeometry[] = [];
  const materials: T.Material[] = [];
  const hits: T.Object3D[] = [];
  const animators: ((t: number) => void)[] = [];
  const rnd = mulberry(room.id.length * 131 + room.id.charCodeAt(0));

  const wallH = room.ceiling === "barrelVault" ? h - w / 2 : room.ceiling === "glassDome" ? h - 1.4 : room.ceiling === "glassCurve" ? h - 2.2 : h;
  /* 1880~90년대 마감(모리스 벽지, 참나무 판벽)은 조지언 벽기둥과 위쪽 액자 몰딩을 쓰지 않습니다. */
  const victorian = room.walls === "morris" || room.walls === "hallOak" || room.walls === "oakLibrary";
  const legacyWall = room.walls === "chintz" || room.walls === "damask" || room.walls === "wedgwood" || room.walls === "panelledStone" || room.walls === "velvet";

  /* ---------- 작은 도구 ---------- */

  function track<G extends T.BufferGeometry>(g: G) {
    geometries.push(g);
    return g;
  }

  function std(p: T.MeshStandardMaterialParameters & { physical?: boolean; clearcoat?: number }) {
    const { physical, clearcoat, ...rest } = p;
    const m = physical
      ? new THREE.MeshPhysicalMaterial({ ...rest, clearcoat: clearcoat ?? 0, clearcoatRoughness: 0.12 })
      : new THREE.MeshStandardMaterial(rest);
    materials.push(m);
    return m;
  }

  function basic(p: T.MeshBasicMaterialParameters) {
    const m = new THREE.MeshBasicMaterial(p);
    materials.push(m);
    return m;
  }

  /* UV 를 늘리고 돌리고 밀어서 같은 사진이 반복돼 보이지 않게 합니다. */
  function uvx(g: T.BufferGeometry, su: number, sv: number, rot = 0, ou = 0, ov = 0) {
    const uv = g.getAttribute("uv") as T.BufferAttribute | undefined;
    if (!uv) return g;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) * su;
      const v = uv.getY(i) * sv;
      uv.setXY(i, u * c - v * s + ou, u * s + v * c + ov);
    }
    uv.needsUpdate = true;
    return g;
  }

  /* 상자 UV 를 면 크기(m)에 맞춰 tile 간격으로 깝니다. */
  function boxGeo(bw: number, bh: number, bd: number, tile = 0) {
    const g = track(new THREE.BoxGeometry(bw, bh, bd));
    if (tile > 0) {
      const uv = g.getAttribute("uv") as T.BufferAttribute;
      const dims: [number, number][] = [[bd, bh], [bd, bh], [bw, bd], [bw, bd], [bw, bh], [bw, bh]];
      const ou = rnd();
      const ov = rnd();
      for (let f = 0; f < 6; f++) {
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile + ou, (uv.getY(i) * dims[f][1]) / tile + ov);
        }
      }
      uv.needsUpdate = true;
    }
    return g;
  }

  function mesh(g: T.BufferGeometry, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  function box(bw: number, bh: number, bd: number, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0, tile = 0) {
    return mesh(boxGeo(bw, bh, bd, tile), m, parent, x, y, z);
  }

  function cyl(rt: number, rb: number, ch: number, seg: number, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    return mesh(track(new THREE.CylinderGeometry(rt, rb, ch, seg)), m, parent, x, y, z);
  }

  function sphere(r: number, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0, ws = 10, hs = 8) {
    return mesh(track(new THREE.SphereGeometry(r, ws, hs)), m, parent, x, y, z);
  }

  function lathe(pts: [number, number][], seg: number, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const g = track(new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), seg));
    return mesh(g, m, parent, x, y, z);
  }

  function plane(pw: number, ph: number, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    return mesh(track(new THREE.PlaneGeometry(pw, ph)), m, parent, x, y, z);
  }

  function floorDecal(tex: T.Texture, dw: number, dd: number, x: number, z: number, opacity = 1, y = 0.012, additive = false, color = 0xffffff) {
    const m = basic({ map: tex, transparent: true, opacity, depthWrite: false, color, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const o = plane(dw, dd, m, group, x, y, z);
    o.rotation.x = -Math.PI / 2;
    o.renderOrder = 1;
    return o;
  }

  const blobTex = radialTexture(kit, "blob", "rgba(0,0,0,0.6)", "rgba(0,0,0,0)");
  function blob(x: number, z: number, bw: number, bd: number, opacity = 0.75, parent: T.Object3D = group) {
    const m = basic({ map: blobTex, transparent: true, opacity, depthWrite: false });
    const o = plane(bw, bd, m, parent, x, 0.006, z);
    o.rotation.x = -Math.PI / 2;
    o.renderOrder = 1;
    return o;
  }

  function setHit(o: T.Object3D, hit: Hit) {
    o.traverse(c => {
      c.userData.hit = hit;
    });
    hits.push(o);
  }

  /* ---------- 공용 재질 ---------- */

  const gold = std({ color: 0xc9a24e, metalness: 1, roughness: 0.3 });
  const brass = std({ color: 0xb89148, metalness: 0.9, roughness: 0.38 });
  const darkWood = std({ color: 0x5a3a24, roughness: 0.55, map: kit.texture(`${TEX}dark_paneled_wood_diff.webp`) });
  const walnut = std({ color: 0x8a6a50, roughness: 0.5, map: kit.texture(`${TEX}black_walnut_veneer_01_diff.webp`) });
  const oakMat = std({ color: 0xd8b890, roughness: 0.5, map: kit.texture(`${TEX}oak_veneer_01_diff.webp`) });
  const marble = std({ color: 0xf2eee6, roughness: 0.22, map: kit.texture(`${TEX}marble_01_diff.webp`) });
  const paintWhite = std({ color: 0xf3eee4, roughness: 0.62 });
  const blackGloss = std({ color: 0x0b0b0d, roughness: 0.16, metalness: 0.1, physical: true, clearcoat: 1 });
  const ironWhite = std({ color: 0xf2f2ee, roughness: 0.5, metalness: 0.2 });
  const leatherRed = std({ color: 0x9a2a26, roughness: 0.55, map: kit.texture(`${TEX}leather_red_02_diff.webp`), normalMap: kit.texture(`${TEX}leather_red_02_nor.webp`, false) });
  const leatherBrown = std({ color: 0xa8784a, roughness: 0.6, map: kit.texture(`${TEX}brown_leather_diff.webp`), normalMap: kit.texture(`${TEX}brown_leather_nor.webp`, false) });
  const velvetMat = (color: string) =>
    std({ color: new THREE.Color(color), roughness: 0.92, map: kit.texture(`${TEX}velour_velvet_diff.webp`), normalMap: kit.texture(`${TEX}velour_velvet_nor.webp`, false) });
  /* 온실 유리는 큐 팜하우스처럼 옅은 초록빛 */
  const glass = room.walls === "glass"
    ? std({ color: 0xcfe6d4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide })
    : std({ color: 0xdfe8ec, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const linen = std({ color: 0xf4eee2, roughness: 0.9 });

  const trimMat =
    room.walls === "panelledStone" || room.walls === "velvet" || room.walls === "redDamask" || victorian
      ? darkWood
      : room.walls === "plumVelvet"
        ? walnut
        : paintWhite;

  /* ---------- 바닥 ---------- */

  function buildFloor() {
    const g = track(new THREE.PlaneGeometry(w, d));
    let m: T.Material;
    switch (room.floor) {
      case "opusMosaic":
        /* 작은 대리석 모자이크 바탕 + 한 장짜리 상감 문양 */
        m = std({ map: kit.texture(`${TEX}marble_mosaic_tiles_diff.webp`), color: 0xf2ebe2, roughness: 0.38 });
        uvx(g, w / 1.4, d / 1.4, 0, 0.37, 0.11);
        break;
      case "oakBoards":
        m = std({ map: kit.texture(`${TEX}old_wood_floor_diff.webp`), color: 0xf2dcbc, roughness: 0.42 });
        uvx(g, w / 2.4, d / 2.4, Math.PI / 2, 0.13, 0.41);
        break;
      case "herringbone":
        m = std({ map: kit.texture(`${TEX}herringbone_parquet_diff.webp`), normalMap: kit.texture(`${TEX}herringbone_parquet_nor.webp`, false), color: 0x8a5a3c, roughness: 0.52 });
        uvx(g, w / 1.5, d / 1.5, Math.PI / 2, 0.2, 0.1);
        break;
      case "versailles":
        m = std({ map: versaillesFloor(kit), roughness: 0.45 });
        uvx(g, w / 1.6, d / 1.6);
        break;
      case "cubeParquet":
        m = std({ map: cubeFloor(kit), roughness: 0.46 });
        uvx(g, w / 1.5, d / 1.5);
        break;
      case "encaustic":
        m = std({ map: encausticFloor(kit), roughness: 0.55 });
        uvx(g, w / 0.9, d / 0.9);
        break;
      case "minton":
        m = std({ map: mintonFloor(kit), roughness: 0.42 });
        uvx(g, w / (room.id === "hall" ? 1.6 : 1.3), d / (room.id === "hall" ? 1.6 : 1.3));
        break;
      case "terracotta":
        m = std({ map: kit.texture(`${TEX}terracotta_floor_tiles_diff.webp`), normalMap: kit.texture(`${TEX}terracotta_floor_tiles_nor.webp`, false), color: 0xe8a088, roughness: 0.7 });
        uvx(g, w / 2.0, d / 2.0, Math.PI / 4, 0.5, 0.25);
        break;
      default:
        m = std({ map: kit.texture(`${TEX}old_wood_floor_diff.webp`), color: 0x6e4a34, roughness: 0.4 });
        uvx(g, w / 2.6, d / 2.6, Math.PI / 2, 0.6, 0.2);
    }
    const f = mesh(g, m, group);
    f.rotation.x = -Math.PI / 2;

    /* 가장자리 상감 띠: 대리석/나무/검은 타일 */
    const bandMat =
      room.floor === "opusMosaic" ? null
      : room.floor === "minton" ? std({ map: mintonBorder(kit), roughness: 0.42 })
      : room.floor === "encaustic" || room.floor === "terracotta" ? std({ color: 0x26201c, roughness: 0.5 })
      : std({ color: 0x3a2416, roughness: 0.38, map: kit.texture(`${TEX}black_walnut_veneer_01_diff.webp`) });
    if (bandMat) {
      const bw0 = room.floor === "encaustic" || room.floor === "minton" ? 0.3 : 0.22;
      const ins = 0.18;
      for (const [bw, bd, x, z] of [[w - ins * 2, bw0, 0, -d / 2 + ins + bw0 / 2], [w - ins * 2, bw0, 0, d / 2 - ins - bw0 / 2], [bw0, d - ins * 2 - bw0 * 2, -w / 2 + ins + bw0 / 2, 0], [bw0, d - ins * 2 - bw0 * 2, w / 2 - ins - bw0 / 2, 0]] as [number, number, number, number][]) {
        const b2 = plane(bw, bd, bandMat, group, x, 0.003, z);
        b2.rotation.x = -Math.PI / 2;
        if (room.floor === "minton") uvx(b2.geometry, bw / 0.3, bd / 0.3);
        else uvx(b2.geometry, Math.max(1, bw / 1.2), Math.max(1, bd / 1.2));
      }
    }
    if (room.floor === "opusMosaic") floorDecal(opusOverlay(kit), w - 0.1, d - 0.1, 0, 0, 1, 0.004);

    /* 벽 밑 그늘(베이크) */
    const vg = vGradient(kit);
    for (const s of ["N", "S", "E", "W"] as Side[]) {
      const along = s === "N" || s === "S" ? w : d;
      const m2 = basic({ map: vg, transparent: true, opacity: 0.42, depthWrite: false, color: 0x000000 });
      const o = plane(along, 0.9, m2, group);
      o.rotation.x = -Math.PI / 2;
      o.renderOrder = 1;
      if (s === "N") o.position.set(0, 0.01, -d / 2 + 0.45);
      if (s === "S") {
        o.position.set(0, 0.01, d / 2 - 0.45);
        o.rotation.z = Math.PI;
      }
      if (s === "E") {
        o.position.set(w / 2 - 0.45, 0.01, 0);
        o.rotation.z = -Math.PI / 2;
      }
      if (s === "W") {
        o.position.set(-w / 2 + 0.45, 0.01, 0);
        o.rotation.z = Math.PI / 2;
      }
    }
  }

  /* ---------- 벽 ---------- */

  function wallFrame(side: Side): Wall {
    const g = new THREE.Group();
    const len = side === "N" || side === "S" ? w : d;
    if (side === "N") g.position.set(0, 0, -d / 2);
    if (side === "S") {
      g.position.set(0, 0, d / 2);
      g.rotation.y = Math.PI;
    }
    if (side === "E") {
      g.position.set(w / 2, 0, 0);
      g.rotation.y = -Math.PI / 2;
    }
    if (side === "W") {
      g.position.set(-w / 2, 0, 0);
      g.rotation.y = Math.PI / 2;
    }
    g.name = `wall${side}`;
    group.add(g);
    return { side, len, group: g };
  }

  /* 문 크기: 문짝 높이 dh, 폭 dw. 반원 채광창(fanlight)이면 그 위로 dw/2 만큼 더 뚫립니다. */
  const doorSize = (door: Door) => {
    /* 대홀 북쪽 문은 계단참 아래 우묵한 곳에 있어 낮게 둡니다. */
    const under = room.id === "hall" && door.wall === "N";
    const dw = room.id === "hall" ? 2.0 : 1.7;
    const fan = room.doorStyle.head === "fanlight" && !under;
    /* gothic: 뾰족 아치(두 원호, 반지름 0.62W) 높이 0.608W. transom: 문 위 네모 채광창 0.55m */
    const gothic = room.doorStyle.head === "gothic" && !under;
    const transom = room.doorStyle.head === "transom" && !under;
    const extra = fan ? dw / 2 : gothic ? dw * GOTHIC_RISE : transom ? 0.55 : 0;
    const dh = Math.min(under ? 2.55 : room.id === "hall" ? 3.0 : 2.65, wallH - (extra > 0 ? extra + 0.55 : 0.75));
    return { dw, dh, fan, gothic, transom, top: dh + extra };
  };

  /* 뾰족 아치 점들(왼쪽 아래 → 꼭대기 → 오른쪽 아래). W 폭, spring 에서 굽기 시작. */
  function gothicPts(cx: number, W: number, spring: number, n = 7): [number, number][] {
    const R = 0.62 * W;
    const ca = (W / 2 - R) / R;
    const ta = Math.acos(ca);
    const left: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - ((Math.PI - ta) * i) / n;
      left.push([cx - W / 2 + R + Math.cos(a) * R, spring + Math.sin(a) * R]);
    }
    const right = left.slice(0, -1).reverse().map(([x, y]) => [2 * cx - x, y] as [number, number]);
    return [...left, ...right];
  }

  function archPath(path: T.Path | T.Shape, cx: number, dw: number, dh: number, reverse = false) {
    const r = dw / 2;
    const spring = dh - r;
    const pts: [number, number][] = [[cx - r, 0], [cx - r, spring]];
    for (let i = 1; i < 16; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      pts.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]);
    }
    pts.push([cx + r, spring], [cx + r, 0]);
    const seq = reverse ? pts.reverse() : pts;
    path.moveTo(seq[0][0], seq[0][1]);
    for (let i = 1; i < seq.length; i++) path.lineTo(seq[i][0], seq[i][1]);
    path.closePath();
  }

  /* 문 구멍 모양: 네모, 또는 네모 위 반원(채광창) */
  function doorHole(path: T.Path | T.Shape, cx: number, door: Door, grow = 0, reverse = false) {
    const { dw, dh, fan, gothic, top } = doorSize(door);
    const W2 = dw + grow * 2;
    if (fan) {
      archPath(path, cx, W2, dh + dw / 2 + grow, reverse);
      return;
    }
    if (gothic) {
      const pts: [number, number][] = [[cx - W2 / 2, 0], ...gothicPts(cx, W2, dh), [cx + W2 / 2, 0]];
      const seq = reverse ? pts.reverse() : pts;
      path.moveTo(seq[0][0], seq[0][1]);
      for (let i = 1; i < seq.length; i++) path.lineTo(seq[i][0], seq[i][1]);
      path.closePath();
      return;
    }
    const pts: [number, number][] = [[cx - W2 / 2, 0], [cx - W2 / 2, top + grow], [cx + W2 / 2, top + grow], [cx + W2 / 2, 0]];
    const seq = reverse ? pts.reverse() : pts;
    path.moveTo(seq[0][0], seq[0][1]);
    for (let i = 1; i < seq.length; i++) path.lineTo(seq[i][0], seq[i][1]);
    path.closePath();
  }

  function wallMaterial(): T.Material {
    const p = room.palette;
    switch (room.walls) {
      case "panelledStone":
        return std({ map: wallpaper(kit, "ashlar", "#d9cab0", ""), roughness: 0.88 });
      case "chintz":
        return std({ map: wallpaper(kit, "chintz", p.main, ""), roughness: 0.88 });
      case "velvet":
        return std({ map: wallpaper(kit, "velvet", p.main, ""), roughness: 0.95 });
      case "damask":
        return std({ map: wallpaper(kit, "damask", p.main, "#e9c6c0"), roughness: 0.82 });
      case "redDamask":
        return std({ map: wallpaper(kit, "damask", p.main, "#a8323e"), roughness: 0.8 });
      case "wedgwood":
        return std({ map: wallpaper(kit, "wash", p.main, ""), roughness: 0.85 });
      case "plumVelvet":
        return std({ map: wallpaper(kit, "damask", p.main, "#6e3a60"), roughness: 0.86 });
      case "morris":
        return std({ map: kit.texture(`${TEX}${room.paper ?? "morris_pimpernel.webp"}`), roughness: 0.86 });
      case "hallOak":
        return std({ map: stencilTex(kit, "#c8b48c", "#7a3a26"), roughness: 0.9 });
      case "oakLibrary":
        return std({ map: leatherPaperTex(kit), roughness: 0.55, metalness: 0.15 });
      default:
        return glass;
    }
  }

  function freeSpans(len: number, holes: [number, number][]) {
    const spans: [number, number][] = [];
    let at = -len / 2;
    for (const [a, b] of [...holes].sort((x, y) => x[0] - y[0])) {
      if (a > at + 0.01) spans.push([at, a]);
      at = Math.max(at, b);
    }
    if (at < len / 2 - 0.01) spans.push([at, len / 2]);
    return spans;
  }

  /* 단면(profile)을 길게 밀어 만든 몰딩. 단면 점은 [앞으로 나온 깊이, 높이] 입니다.
     벽 로컬 좌표에서 cx 가운데, 길이 len, 높이 y 에 붙습니다. vertical 이면 세로로 섭니다. */
  function moulding(profile: [number, number][], len: number, mat: T.Material, parent: T.Object3D, cx: number, y: number, z = 0, vertical = false) {
    const sh = new THREE.Shape();
    sh.moveTo(0, profile[0][1]);
    for (const [pz, py] of profile) sh.lineTo(pz, py);
    sh.lineTo(0, profile[profile.length - 1][1]);
    sh.closePath();
    const geo = track(new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 2 }));
    uvx(geo, 0.6, 0.6);
    const m = new THREE.Mesh(geo, mat);
    if (vertical) {
      /* 세로: 밀어낸 방향(z)은 위(y)로, 깊이(x)는 방 쪽(z)으로, 단면 폭(y)은 벽을 따라(x) */
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)));
      m.position.set(cx - 0.02, y, z);
      parent.add(m);
      return m;
    }
    m.rotation.y = -Math.PI / 2;
    m.position.set(cx + len / 2, y, z);
    parent.add(m);
    return m;
  }

  const P_SKIRT: [number, number][] = [[0.035, 0], [0.035, 0.16], [0.026, 0.175], [0.03, 0.19], [0.018, 0.21], [0.0, 0.225]];
  const P_RAIL: [number, number][] = [[0.0, -0.045], [0.018, -0.035], [0.028, -0.012], [0.04, 0.0], [0.028, 0.014], [0.03, 0.026], [0.0, 0.045]];
  const P_CORNICE: [number, number][] = [[0.0, -0.42], [0.025, -0.4], [0.03, -0.33], [0.06, -0.3], [0.07, -0.24], [0.11, -0.2], [0.16, -0.12], [0.2, -0.1], [0.21, -0.05], [0.26, -0.03], [0.27, 0.0], [0.0, 0.0]];
  const P_FRAME: [number, number][] = [[0.0, 0.0], [0.012, 0.004], [0.022, 0.016], [0.016, 0.03], [0.008, 0.036], [0.0, 0.04]];
  const P_PIC: [number, number][] = [[0, -0.02], [0.02, -0.015], [0.025, 0.0], [0.012, 0.018], [0, 0.02]];

  /* 액자형 몰딩 사각형(테 4개) */
  function frameRect(parent: T.Object3D, cx: number, y0: number, fw: number, fh: number, mat: T.Material, z = 0.0) {
    if (fw < 0.25 || fh < 0.25) return;
    moulding(P_FRAME, fw, mat, parent, cx, y0 + fh - 0.04, z);
    moulding(P_FRAME, fw, mat, parent, cx, y0, z);
    moulding(P_FRAME, fh - 0.08, mat, parent, cx - fw / 2 + 0.02, y0 + 0.04, z, true);
    moulding(P_FRAME, fh - 0.08, mat, parent, cx + fw / 2 - 0.02, y0 + 0.04, z, true);
  }

  const vgradH = kit.canvas("hgrad", 128, 4, g => {
    const grd = g.createLinearGradient(0, 0, 128, 0);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 4);
  }, { repeat: false });

  /* 세로 홈이 파인 벽기둥(필라스터): 받침, 몸통, 주두(금박) */
  function pilaster(wg: T.Object3D, u: number, y0: number, y1: number, mat: T.Material, capMat: T.Material) {
    const pw = 0.46;
    const hgt = y1 - y0;
    box(pw + 0.12, 0.22, 0.12, mat, wg, u, y0 + 0.11, 0.06);
    moulding(P_RAIL, pw + 0.12, mat, wg, u, y0 + 0.26, 0.03);
    box(pw, hgt - 0.6, 0.08, mat, wg, u, y0 + 0.3 + (hgt - 0.6) / 2, 0.04, 1.2);
    /* 세로 홈 5줄(어두운 띠 + 밝은 모서리) */
    const flute = basic({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
    for (let k = -2; k <= 2; k++) {
      const fl = plane(0.035, hgt - 0.9, flute, wg, u + k * 0.075, y0 + 0.3 + (hgt - 0.6) / 2, 0.082);
      fl.renderOrder = 1;
    }
    /* 주두: 아바쿠스 + 소용돌이 대신 금빛 잎 띠 */
    box(pw + 0.1, 0.08, 0.13, capMat, wg, u, y1 - 0.26, 0.065);
    for (const sx of [-1, 1]) {
      const vol = mesh(track(new THREE.TorusGeometry(0.05, 0.018, 4, 8)), capMat, wg, u + sx * (pw / 2 - 0.02), y1 - 0.18, 0.12);
      void vol;
    }
    /* 잎 장식 띠: 공 대신 그린 아칸서스 잎(삼각형 수 절약) */
    const leafTex = kit.canvas("acanthus", 256, 64, c => {
      c.fillStyle = "#8a6a2a";
      c.fillRect(0, 0, 256, 64);
      for (let i = 0; i < 6; i++) {
        const x = 21 + i * 43;
        const grd = c.createLinearGradient(x - 18, 0, x + 18, 0);
        grd.addColorStop(0, "#9a7a34");
        grd.addColorStop(0.5, "#f2d98e");
        grd.addColorStop(1, "#9a7a34");
        c.fillStyle = grd;
        c.beginPath();
        c.moveTo(x - 18, 64);
        c.quadraticCurveTo(x - 20, 20, x, 4);
        c.quadraticCurveTo(x + 20, 20, x + 18, 64);
        c.fill();
        c.strokeStyle = "rgba(90,60,20,0.7)";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, 8);
        c.lineTo(x, 60);
        c.stroke();
      }
    }, { repeat: false });
    const leafM = std({ map: leafTex, roughness: 0.4, metalness: 0.6 });
    box(pw - 0.02, 0.14, 0.1, leafM, wg, u, y1 - 0.14, 0.09);
    box(pw + 0.18, 0.06, 0.16, capMat === gold ? mat : capMat, wg, u, y1 - 0.03, 0.08);
  }

  function buildWall(wall: Wall, doors: Door[], wins: Window[]) {
    const { len, group: wg, side } = wall;
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0);
    shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, wallH);
    shape.lineTo(-len / 2, wallH);
    shape.closePath();
    const lowHoles: [number, number][] = [];
    const tallHoles: [number, number][] = [];
    for (const door of doors) {
      if (door.secret) continue;
      const { dw } = doorSize(door);
      const p = new THREE.Path();
      doorHole(p, door.offset ?? 0, door, 0, true);
      shape.holes.push(p);
      lowHoles.push([(door.offset ?? 0) - dw / 2 - 0.3, (door.offset ?? 0) + dw / 2 + 0.3]);
      tallHoles.push([(door.offset ?? 0) - dw / 2 - 0.5, (door.offset ?? 0) + dw / 2 + 0.5]);
    }
    for (const win of wins) {
      const p = new THREE.Path();
      p.moveTo(win.offset - win.w / 2, win.sill);
      p.lineTo(win.offset - win.w / 2, win.sill + win.h);
      p.lineTo(win.offset + win.w / 2, win.sill + win.h);
      p.lineTo(win.offset + win.w / 2, win.sill);
      p.closePath();
      shape.holes.push(p);
      tallHoles.push([win.offset - win.w / 2 - 0.55, win.offset + win.w / 2 + 0.55]);
    }
    if (room.walls === "glass") {
      buildGlassWall(wall, doors);
      return;
    }
    /* 벽 판은 양 끝을 2cm 씩 늘려 모서리 틈을 막습니다. */
    const g = track(new THREE.ShapeGeometry(shape, 8));
    const tile = room.walls === "panelledStone" ? 2.4 : room.walls === "velvet" ? 1.4 : room.walls === "hallOak" ? 1.3 : room.walls === "oakLibrary" ? 0.75 : 0.9;
    if (room.walls === "morris") {
      const [rw, rh] = PAPER_REPEAT[room.paper ?? ""] ?? [0.53, 0.8];
      /* 벽지는 롤 이음이 벽 가운데에서 맞게 u 를 0 에서 시작합니다. */
      uvx(g, 1 / rw, 1 / rh, 0, 0, 0);
    } else uvx(g, 1 / tile, 1 / tile, 0, rnd(), rnd());
    mesh(g, wallMaterial(), wg);

    /* 이 벽에 걸린 그림 자리(벽기둥이 겹치지 않게) */
    const paintHoles: [number, number][] = room.paintings
      .filter(pt => pt.wall === side && (pt.album === undefined || ctx.album[pt.album]))
      .map(pt => {
        const pw = pt.h * (pt.owner ? 0.8 : pt.album !== undefined ? 1.25 : pt.aspect) + 0.5;
        return [pt.offset - pw / 2 - 0.25, pt.offset + pw / 2 + 0.55] as [number, number];
      });

    const spans = freeSpans(len, lowHoles);
    const style = room.walls;
    const woodRoom = style === "velvet" || style === "plumVelvet";
    const marbleDado = style === "panelledStone" || style === "redDamask";
    if (victorian) {
      buildVictorianWall(wall, spans, tallHoles);
      return;
    }
    const dadoH = style === "panelledStone" ? 1.25 : style === "redDamask" ? 1.0 : woodRoom ? 2.15 : 0.92;
    const dadoMat = marbleDado ? std({ color: style === "redDamask" ? 0x3a3530 : 0xe4dccd, roughness: 0.2, map: kit.texture(`${TEX}marble_01_diff.webp`) }) : woodRoom ? walnut : paintWhite;
    const insetMat = marbleDado ? std({ color: style === "redDamask" ? 0x6a1820 : 0xb8a888, roughness: 0.25, map: kit.texture(`${TEX}marble_01_diff.webp`) }) : woodRoom ? darkWood : paintWhite;
    const railMat = marbleDado || woodRoom ? gold : paintWhite;
    const upperFrameMat = style === "wedgwood" || style === "panelledStone" ? paintWhite : gold;

    for (const [a, b] of spans) {
      const sw = b - a;
      const cx = (a + b) / 2;
      /* 징두리(대리석 또는 나무 판벽 또는 흰 판벽) */
      box(sw + 0.02, dadoH, 0.05, dadoMat, wg, cx, dadoH / 2, 0.025, marbleDado ? 1.4 : woodRoom ? 1.1 : 0);
      const n = Math.max(1, Math.round(sw / (woodRoom ? 0.9 : 1.15)));
      const pw = sw / n;
      for (let i = 0; i < n; i++) {
        const px = a + pw * (i + 0.5);
        const fw = pw - 0.24;
        const fh = dadoH - 0.5;
        if (fw < 0.25) continue;
        /* 판 속 패널: 조금 도드라진 판 + 액자 몰딩 */
        box(fw - 0.06, fh - 0.06, 0.02, insetMat, wg, px, 0.27 + fh / 2, 0.055, marbleDado ? 1.2 : 0.9);
        frameRect(wg, px, 0.27 - 0.02, fw, fh + 0.04, marbleDado ? gold : woodRoom ? walnut : paintWhite, 0.05);
      }
      /* 걸레받이와 의자 몰딩(단면을 밀어 만든 것) */
      moulding(P_SKIRT, sw + 0.02, woodRoom ? darkWood : marbleDado ? std({ color: 0x2b2a28, roughness: 0.25 }) : paintWhite, wg, cx, 0, 0.05);
      moulding(P_RAIL, sw + 0.02, railMat, wg, cx, dadoH, 0.05);
    }

    /* 위쪽 벽: 벽지(또는 돌)를 몰딩 액자로 나눕니다. */
    const upY0 = dadoH + 0.28;
    const upY1 = wallH - 0.75;
    const upSpans = freeSpans(len, tallHoles);
    /* 벽기둥 자리: 문/창/그림을 피해 고르게 */
    const pilasterAt: number[] = [];
    /* 벽기둥(조지언)은 옛 양식 방에만. 갤러리(살롱 걸기)와 비밀 서재는 벽기둥 없이. */
    if (legacyWall) {
      const every = room.id === "hall" ? 2.6 : 2.2;
      for (const [a, b] of upSpans) {
        const n = Math.floor((b - a) / every);
        for (let i = 0; i <= n; i++) {
          const u = n === 0 ? (a + b) / 2 : a + 0.3 + ((b - a - 0.6) / Math.max(1, n)) * i;
          if (u < -len / 2 + 0.3 || u > len / 2 - 0.3) continue;
          if (paintHoles.some(([pa, pb]) => u > pa && u < pb)) continue;
          if (pilasterAt.some(v => Math.abs(v - u) < 1.2)) continue;
          pilasterAt.push(u);
        }
      }
      /* 벽 양 끝 모서리 기둥 */
      for (const u of [-len / 2 + 0.3, len / 2 - 0.3]) if (!tallHoles.some(([a, b]) => u > a && u < b) && !pilasterAt.some(v => Math.abs(v - u) < 0.8)) pilasterAt.push(u);
    }
    const pilMat = style === "panelledStone" ? std({ map: wallpaper(kit, "wash", "#e6dac4", ""), roughness: 0.6 }) : woodRoom ? walnut : style === "redDamask" ? std({ color: 0x2a2624, roughness: 0.25, map: kit.texture(`${TEX}marble_01_diff.webp`) }) : paintWhite;
    for (const u of pilasterAt) pilaster(wg, u, dadoH + 0.05, wallH - 0.42, pilMat, gold);

    if (style !== "wedgwood" && style !== "panelledStone" && style !== "redDamask") {
      const cuts = [...tallHoles, ...pilasterAt.map(u => [u - 0.35, u + 0.35] as [number, number])];
      for (const [a, b] of freeSpans(len, cuts)) {
        const sw = b - a;
        if (sw < 0.6) continue;
        frameRect(wg, (a + b) / 2, upY0, sw - 0.3, upY1 - upY0, upperFrameMat, 0.0);
      }
    }

    /* 코니스(크라운 몰딩)와 그림 레일 */
    moulding(P_CORNICE, len + 0.6, woodRoom ? walnut : paintWhite, wg, 0, wallH, 0);
    moulding([[0, -0.03], [0.012, -0.03], [0.014, 0.0], [0, 0.0]], len, gold, wg, 0, wallH - 0.43, 0.02);
    moulding(P_PIC, len, room.walls === "redDamask" ? gold : woodRoom ? walnut : paintWhite, wg, 0, wallH - 0.62, 0.0);

    /* 웨지우드 패널: 크림 벽에 파란 판 + 흰 몰딩 + 메달리온 */
    if (style === "wedgwood") {
      const blue = std({ color: new THREE.Color(room.palette.second), roughness: 0.8, map: wallpaper(kit, "wash", room.palette.second, "") });
      const cuts = [...tallHoles, ...pilasterAt.map(u => [u - 0.35, u + 0.35] as [number, number])];
      for (const [a, b] of freeSpans(len, cuts)) {
        const sw = b - a;
        if (sw < 0.9) continue;
        const fw = sw - 0.36;
        const fh = upY1 - upY0;
        const px = (a + b) / 2;
        plane(fw, fh, blue, wg, px, upY0 + fh / 2, 0.006);
        frameRect(wg, px, upY0 - 0.02, fw + 0.04, fh + 0.04, paintWhite, 0.006);
        const cameo = sphere(0.16, paintWhite, wg, px, upY0 + fh * 0.7, 0.01, 14, 8);
        cameo.scale.set(0.8, 1, 0.16);
        mesh(track(new THREE.TorusGeometry(0.17, 0.012, 4, 20)), gold, wg, px, upY0 + fh * 0.7, 0.025).scale.set(0.8, 1, 1);
      }
    }

    /* 베이크한 그늘: 천장 아래, 바닥 위, 양 모서리(세로) */
    const vg = vGradient(kit);
    const shadeTop = basic({ map: vg, transparent: true, opacity: 0.42, depthWrite: false, color: 0x000000 });
    const top = plane(len, 1.2, shadeTop, wg, 0, wallH - 0.6, 0.3);
    top.rotation.z = Math.PI;
    top.renderOrder = 2;
    const shadeLow = basic({ map: vg, transparent: true, opacity: 0.28, depthWrite: false, color: 0x000000 });
    const low = plane(len, 0.7, shadeLow, wg, 0, 0.35, 0.08);
    low.renderOrder = 2;
    for (const end of [-1, 1]) {
      const cm = basic({ map: vgradH, transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 });
      const c = plane(0.9, wallH, cm, wg, end * (len / 2 - 0.45), wallH / 2, 0.29);
      if (end > 0) c.rotation.y = Math.PI;
      c.renderOrder = 2;
      if (end > 0) c.position.z = 0.29;
    }
  }

  /* ---------- 1880~90년대 벽: 징두리(링크러스타 또는 참나무 판벽) + 벽지 + 프리즈 ---------- */
  const vicDado = (() => {
    if (room.walls === "hallOak") return { h: 1.65, mat: std({ map: oakPanelTex(kit), roughness: 0.5 }), tile: 0 };
    if (room.walls === "oakLibrary") return { h: 1.05, mat: std({ map: oakPanelTex(kit), roughness: 0.5 }), tile: 0 };
    const tone = room.id === "drawing" ? "#7a5a34" : room.id === "music" ? "#4a3a2a" : "#3e4a36";
    const gilt = room.id === "drawing";
    return { h: 0.95, mat: std({ map: lincrustaTex(kit, tone, gilt), roughness: gilt ? 0.42 : 0.6, metalness: gilt ? 0.35 : 0.05 }), tile: 0.55 };
  })();
  const friezeMat =
    room.walls === "morris"
      ? std({ map: friezeTex(kit, room.id === "drawing" ? "#5a3a22" : room.id === "music" ? "#3a3428" : "#384030", "#c9a256"), roughness: 0.7 })
      : null;

  function buildVictorianWall(wall: Wall, spans: [number, number][], tallHoles: [number, number][]) {
    const { len, group: wg } = wall;
    const dadoH = vicDado.h;
    const panelled = room.walls !== "morris";
    for (const [a, b] of spans) {
      const sw = b - a;
      const cx = (a + b) / 2;
      const dg = box(sw + 0.02, dadoH, 0.05, vicDado.mat, wg, cx, dadoH / 2, 0.025);
      if (panelled) {
        /* 판 하나 0.55m 폭: 판마다 텍스처 한 장 */
        const n = Math.max(1, Math.round(sw / 0.55));
        uvx(dg.geometry, 1, 1);
        const uv = dg.geometry.getAttribute("uv") as T.BufferAttribute;
        for (let i = 16; i < 24; i++) uv.setX(i, uv.getX(i) * n);
        uv.needsUpdate = true;
      } else {
        const uv = dg.geometry.getAttribute("uv") as T.BufferAttribute;
        for (let i = 16; i < 24; i++) uv.setXY(i, (uv.getX(i) * sw) / vicDado.tile, (uv.getY(i) * dadoH) / vicDado.tile);
        uv.needsUpdate = true;
      }
      moulding(P_SKIRT, sw + 0.02, darkWood, wg, cx, 0, 0.05);
      moulding(P_RAIL, sw + 0.02, darkWood, wg, cx, dadoH, 0.05);
      /* 의자 몰딩 위 선반 몰딩(판벽 방은 접시 선반처럼 깊게) */
      if (panelled) box(sw + 0.02, 0.04, 0.12, darkWood, wg, cx, dadoH + 0.05, 0.06);
    }
    /* 프리즈와 그림 레일, 코니스 */
    const railY = wallH - 0.72;
    if (friezeMat) {
      const fz = plane(len, 0.3, friezeMat, wg, 0, wallH - 0.57, 0.004);
      uvx(fz.geometry, len / 1.6, 1);
    }
    const cornMat = room.walls === "morris" ? std({ color: 0xe6d8bc, roughness: 0.7 }) : darkWood;
    moulding(P_CORNICE, len + 0.6, cornMat, wg, 0, wallH, 0);
    moulding(P_PIC, len, darkWood, wg, 0, railY, 0.0);
    /* 참나무 판벽 방: 위쪽 벽을 나누는 얇은 띠(벽지 아래 가장자리) */
    if (room.walls === "hallOak") {
      for (const [a, b] of freeSpans(len, tallHoles)) box(b - a, 0.06, 0.03, darkWood, wg, (a + b) / 2, wallH - 1.6, 0.015);
    }
    void tallHoles;

    /* 베이크한 그늘 */
    const vg = vGradient(kit);
    const shadeTop = basic({ map: vg, transparent: true, opacity: 0.42, depthWrite: false, color: 0x000000 });
    const top = plane(len, 1.2, shadeTop, wg, 0, wallH - 0.6, 0.3);
    top.rotation.z = Math.PI;
    top.renderOrder = 2;
    const shadeLow = basic({ map: vg, transparent: true, opacity: 0.28, depthWrite: false, color: 0x000000 });
    const low = plane(len, 0.7, shadeLow, wg, 0, 0.35, 0.08);
    low.renderOrder = 2;
    for (const end of [-1, 1]) {
      const cm = basic({ map: vgradH, transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 });
      const c = plane(0.9, wallH, cm, wg, end * (len / 2 - 0.45), wallH / 2, 0.29);
      if (end > 0) c.rotation.y = Math.PI;
      c.renderOrder = 2;
    }
  }

  function buildGlassWall(wall: Wall, doors: Door[]) {
    const { len, group: wg } = wall;
    const holes = doors.filter(dr => !dr.secret).map(dr => {
      const { dw } = doorSize(dr);
      return [(dr.offset ?? 0) - dw / 2, (dr.offset ?? 0) + dw / 2] as [number, number];
    });
    /* 낮은 벽돌 받침 + 유리 + 주철 창살 */
    const base = std({ color: 0xf0ede6, roughness: 0.8, map: wallpaper(kit, "wash", "#efeae0", "") });
    for (const [a, b] of freeSpans(len, holes)) {
      const sw = b - a;
      const cx = (a + b) / 2;
      box(sw, 0.6, 0.18, base, wg, cx, 0.3, 0.0, 1);
      const pane = plane(sw, wallH - 0.6, glass, wg, cx, 0.6 + (wallH - 0.6) / 2, 0);
      pane.renderOrder = 3;
      const n = Math.max(1, Math.round(sw / 0.8));
      for (let i = 0; i <= n; i++) box(0.05, wallH - 0.6, 0.06, ironWhite, wg, a + (sw / n) * i, 0.6 + (wallH - 0.6) / 2, 0.02);
      for (const y of [1.6, 2.6, wallH - 0.05]) box(sw, 0.05, 0.06, ironWhite, wg, cx, y, 0.02);
    }
    for (const [a, b] of holes) {
      const doorTop = doorSize(doors[0]).top + 0.08;
      if (wallH - doorTop > 0.1) {
        box(b - a + 0.1, 0.06, 0.06, ironWhite, wg, (a + b) / 2, doorTop, 0.02);
        const pane = plane(b - a, wallH - doorTop, glass, wg, (a + b) / 2, doorTop + (wallH - doorTop) / 2, 0);
        pane.renderOrder = 3;
      }
    }
    if (room.ceiling !== "glassCurve") return;
    /* 큐 팜하우스식 주철 기둥: 받침, 가는 몸통, 잎 주두, 위 처마보까지 부채꼴 까치발 */
    const colAt: number[] = [];
    const n = Math.max(2, Math.round(len / 2.0));
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + 0.12 + ((len - 0.24) / n) * i;
      if (holes.some(([a, b]) => u > a - 0.25 && u < b + 0.25)) continue;
      colAt.push(u);
    }
    for (const [a, b] of holes) colAt.push(a - 0.18, b + 0.18);
    const capProf: [number, number][] = [[0.0, 0], [0.06, 0], [0.06, 0.04], [0.09, 0.1], [0.13, 0.2], [0.14, 0.24], [0.0, 0.24]];
    const baseProf: [number, number][] = [[0.0, 0], [0.13, 0], [0.13, 0.08], [0.1, 0.12], [0.08, 0.2], [0.06, 0.24], [0.0, 0.24]];
    for (const u of colAt) {
      lathe(baseProf, 8, ironWhite, wg, u, 0, 0.17);
      cyl(0.05, 0.06, wallH - 0.5, 8, ironWhite, wg, u, 0.24 + (wallH - 0.5) / 2, 0.17);
      for (const ry2 of [0.68, wallH - 0.8]) mesh(track(new THREE.TorusGeometry(0.065, 0.014, 4, 10)), ironWhite, wg, u, ry2, 0.17).rotation.x = Math.PI / 2;
      lathe(capProf, 8, ironWhite, wg, u, wallH - 0.26, 0.17);
    }
    /* 처마보(벽 위) */
    box(len, 0.16, 0.24, ironWhite, wg, 0, wallH + 0.02, 0.1);
    /* 기둥 사이 까치발: 사분원 아치 + 작은 원 장식 */
    const sorted = [...colAt].sort((x, y) => x - y);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (b - a < 0.6 || holes.some(([ha, hb]) => (a + b) / 2 > ha && (a + b) / 2 < hb)) continue;
      const r = Math.min(0.5, (b - a) / 2 - 0.05);
      for (const [x0, sgn] of [[a, 1], [b, -1]] as [number, number][]) {
        const arc = mesh(track(new THREE.TorusGeometry(r, 0.016, 4, 8, Math.PI / 2)), ironWhite, wg, x0 + sgn * r, wallH - 0.06 - r, 0.16);
        arc.rotation.z = sgn > 0 ? Math.PI / 2 : 0;
        mesh(track(new THREE.TorusGeometry(0.06, 0.012, 4, 10)), ironWhite, wg, x0 + sgn * r * 0.42, wallH - 0.06 - r * 0.42, 0.16);
      }
    }
  }

  /* ---------- 천장 ---------- */

  function buildCeiling() {
    const plaster = std({ map: wallpaper(kit, "wash", "#f1ebdf", ""), roughness: 0.92 });
    if (room.ceiling === "barrelVault") {
      const r = w / 2;
      const vg = track(new THREE.CylinderGeometry(r, r, d, 28, 1, true, 0, Math.PI));
      uvx(vg, 6, d / 2.2);
      const vault = mesh(vg, std({ map: wallpaper(kit, "wash", "#e8dcc6", ""), roughness: 0.9, side: THREE.BackSide }), group, 0, wallH, 0);
      vault.rotation.x = Math.PI / 2;
      vault.rotation.y = Math.PI / 2;
      /* 양 끝 반달 벽(루넷) */
      const lunMat = std({ map: wallpaper(kit, "wash", "#e2d4bc", ""), roughness: 0.9 });
      for (const end of [-1, 1]) {
        const lun = mesh(track(new THREE.CircleGeometry(r, 28, 0, Math.PI)), lunMat, group, 0, wallH - 0.001, end * (d / 2 - 0.005));
        if (end > 0) lun.rotation.y = Math.PI;
        const arc = mesh(track(new THREE.TorusGeometry(r - 0.05, 0.06, 6, 28, Math.PI)), gold, group, 0, wallH, end * (d / 2 - 0.06));
        void arc;
      }
      /* 금빛 가로 늑재와 천창 */
      for (let z = -d / 2 + 1.2; z <= d / 2 - 1.1; z += 2.4) {
        const rib = mesh(track(new THREE.TorusGeometry(r - 0.04, 0.07, 6, 24, Math.PI)), gold, group, 0, wallH, z);
        void rib;
      }
      const sky = std({ color: 0xfff6e6, emissive: new THREE.Color(0xfff0d8), emissiveIntensity: 0.9, roughness: 1 });
      const lantern = plane(1.4, d - 1.2, sky, group, 0, wallH + r - 0.02, 0);
      lantern.rotation.x = Math.PI / 2;
      for (let z = -d / 2 + 0.8; z < d / 2 - 0.6; z += 0.8) box(1.5, 0.05, 0.05, ironWhite, group, 0, wallH + r - 0.05, z);
      return;
    }
    if (room.ceiling === "glassCurve") {
      /* 큐 팜하우스(1844~48)식 곡면 유리 지붕: 반타원 단면(높이 2.2), 주철 늑재, 도리, 용마루 환기창 */
      const rx = w / 2;
      const ry = h - wallH;
      const segs = 14;
      const roof = track(new THREE.CylinderGeometry(1, 1, d, segs, 1, true, -Math.PI / 2, Math.PI));
      const rm = mesh(roof, glass, group, 0, wallH, 0);
      rm.rotation.x = -Math.PI / 2;
      rm.scale.set(rx, 1, ry);
      rm.renderOrder = 3;
      /* 늑재: 갑판보처럼 굽은 철 */
      const ribPts: T.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI - (i / 16) * Math.PI;
        ribPts.push(new THREE.Vector3(Math.cos(a) * (rx - 0.03), Math.sin(a) * (ry - 0.03), 0));
      }
      const ribCurve = new THREE.CatmullRomCurve3(ribPts);
      const ribGeo = track(new THREE.TubeGeometry(ribCurve, 18, 0.035, 4));
      const thin = track(new THREE.TubeGeometry(ribCurve, 18, 0.016, 3));
      for (let z = -d / 2 + 0.06, i = 0; z <= d / 2 - 0.05; z += d / 10, i++) {
        mesh(i % 2 === 0 ? ribGeo : thin, ironWhite, group, 0, wallH, Math.min(z, d / 2 - 0.06));
      }
      mesh(ribGeo, ironWhite, group, 0, wallH, d / 2 - 0.06);
      /* 도리(가로대) */
      for (let i = 1; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        box(0.04, 0.04, d, ironWhite, group, Math.cos(a) * (rx - 0.05), wallH + Math.sin(a) * (ry - 0.05), 0);
      }
      /* 양 끝 반타원 유리 박공(루넷) + 세로 창살 */
      for (const end of [-1, 1]) {
        const lun = mesh(track(new THREE.CircleGeometry(1, 16, 0, Math.PI)), glass, group, 0, wallH, end * (d / 2 - 0.004));
        lun.scale.set(rx, ry, 1);
        lun.renderOrder = 3;
        for (let i = -3; i <= 3; i++) {
          const x = (i / 4) * rx;
          const hh = ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
          if (hh > 0.1) box(0.03, hh, 0.04, ironWhite, group, x, wallH + hh / 2, end * (d / 2 - 0.03));
        }
      }
      /* 용마루 환기창(랜턴) */
      for (const sx of [-1, 1]) {
        box(0.04, 0.04, d - 0.4, ironWhite, group, sx * 0.28, h - 0.01, 0);
        const lp = plane(d - 0.4, 0.3, glass, group, sx * 0.28, h + 0.14, 0);
        lp.rotation.y = Math.PI / 2;
        lp.renderOrder = 3;
      }
      box(0.66, 0.04, d - 0.3, ironWhite, group, 0, h + 0.3, 0);
      return;
    }
    if (room.ceiling === "glassDome") {
      const flat = plane(w, d, glass, group, 0, wallH, 0);
      flat.rotation.x = Math.PI / 2;
      flat.renderOrder = 3;
      const dome = mesh(track(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2)), glass, group, 0, wallH, 0);
      dome.scale.set(w / 2 - 0.1, 2.0, d / 2 - 0.1);
      dome.renderOrder = 3;
      /* 경선 늑재 */
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const pts: T.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const phi = (i / 10) * (Math.PI / 2);
          pts.push(new THREE.Vector3(Math.cos(a) * Math.cos(phi) * (w / 2 - 0.1), Math.sin(phi) * 2.0, Math.sin(a) * Math.cos(phi) * (d / 2 - 0.1)));
        }
        mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.035, 4)), ironWhite, group, 0, wallH, 0);
      }
      for (const phi of [0.35, 0.75, 1.15]) {
        const ring = mesh(track(new THREE.TorusGeometry(1, 0.03, 4, 32)), ironWhite, group, 0, wallH + Math.sin(phi) * 2.0, 0);
        ring.rotation.x = Math.PI / 2;
        ring.scale.set((w / 2 - 0.1) * Math.cos(phi), (d / 2 - 0.1) * Math.cos(phi), 1);
      }
      /* 처마 거터 */
      for (const [bw, bd, x, z] of [[w, 0.2, 0, -d / 2], [w, 0.2, 0, d / 2], [0.2, d, -w / 2, 0], [0.2, d, w / 2, 0]] as [number, number, number, number][]) {
        box(bw, 0.18, bd, ironWhite, group, x, wallH, z);
      }
      return;
    }
    const kind = room.ceiling;
    const woodCeil = kind === "cofferedWood";
    const rc = kind === "coved" || kind === "saucerDome" || kind === "ovalDome" || kind === "starCove" ? 0.62 : 0;
    const coveMat = std({ map: wallpaper(kit, "wash", kind === "starCove" ? "#e6d6c6" : "#f1ebdf", ""), roughness: 0.9, side: THREE.BackSide });
    if (rc > 0) {
      /* 벽과 천장 사이 둥근 코브. 벽 판(그룹) 안에서 만들어 모서리마다 맞춥니다. */
      for (const sd of ["N", "S", "E", "W"] as Side[]) {
        const wl = walls[sd];
        const cg = track(new THREE.CylinderGeometry(rc, rc, wl.len - rc * 2, 10, 1, true, Math.PI / 2, Math.PI / 2));
        uvx(cg, (wl.len - rc * 2) / 1.5, 0.5);
        const cm = mesh(cg, coveMat, wl.group, 0, h - rc, rc);
        cm.rotation.z = Math.PI / 2;
        /* 코브 아래 금박 선과 위 몰딩 */
        moulding(P_FRAME, wl.len - rc * 2, gold, wl.group, 0, h - rc - 0.02, 0.01);
      }
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const center = Math.atan2(sz, -sx);
        const sg = track(new THREE.SphereGeometry(rc, 6, 4, center - Math.PI / 4, Math.PI / 2, 0, Math.PI / 2));
        mesh(sg, coveMat, group, sx * (w / 2 - rc), h - rc, sz * (d / 2 - rc));
      }
    }

    /* 천장 장미(석고 + 금박 꽃잎) */
    const ceilingRose = (x: number, z: number, y: number, r: number) => {
      lathe([[0.02, 0], [r, 0], [r * 0.92, -0.04], [r * 0.7, -0.07], [r * 0.45, -0.1], [r * 0.2, -0.14], [0.02, -0.16]], 20, paintWhite, group, x, y, z);
      for (let k = 0; k < 12; k++) {
        const a2 = (k / 12) * Math.PI * 2;
        const leaf = sphere(r * 0.13, gold, group, x + Math.cos(a2) * r * 0.66, y - 0.06, z + Math.sin(a2) * r * 0.66, 6, 4);
        leaf.scale.set(1.6, 0.5, 0.8);
        leaf.rotation.y = -a2;
      }
      mesh(track(new THREE.TorusGeometry(r * 0.98, 0.018, 4, 28)), gold, group, x, y - 0.012, z).rotation.x = Math.PI / 2;
      sphere(r * 0.12, gold, group, x, y - 0.15, z, 8, 6);
    };

    /* 천장 위 금박 테(사각) */
    const ceilFrame = (fw: number, fd: number, y: number, mat: T.Material) => {
      for (const [bw, bd, x, z] of [[fw, 0.07, 0, -fd / 2], [fw, 0.07, 0, fd / 2], [0.07, fd, -fw / 2, 0], [0.07, fd, fw / 2, 0]] as [number, number, number, number][]) {
        box(bw, 0.05, bd, mat, group, x, y - 0.025, z);
        box(bw + (bw > bd ? 0 : 0.04), 0.02, bd + (bd > bw ? 0 : 0.04), gold, group, x, y - 0.06, z);
      }
    };

    if (kind === "saucerDome" || kind === "ovalDome") {
      /* 가운데가 둥글게 파인 접시 돔. 천장 판에 구멍을 내고 위에 반구를 얹습니다. */
      const R = Math.min(w, d) * (kind === "ovalDome" ? 0.36 : 0.3);
      const sx = kind === "ovalDome" ? 1.3 : 1;
      const cz = kind === "ovalDome" ? -0.3 : -0.2;
      const shp = new THREE.Shape();
      shp.moveTo(-w / 2, -d / 2);
      shp.lineTo(w / 2, -d / 2);
      shp.lineTo(w / 2, d / 2);
      shp.lineTo(-w / 2, d / 2);
      shp.closePath();
      const hole = new THREE.Path();
      for (let k = 0; k <= 40; k++) {
        const a2 = (k / 40) * Math.PI * 2;
        const px = Math.cos(a2) * R * sx;
        const pz = Math.sin(a2) * R + cz;
        if (k === 0) hole.moveTo(px, pz);
        else hole.lineTo(px, pz);
      }
      shp.holes.push(hole);
      const cgeo = track(new THREE.ShapeGeometry(shp, 2));
      uvx(cgeo, 1 / 2.5, 1 / 2.5);
      const ceil = mesh(cgeo, plaster, group, 0, h, 0);
      ceil.rotation.x = Math.PI / 2;
      const domeMat = kind === "ovalDome"
        ? std({ color: new THREE.Color(room.palette.second), roughness: 0.85, side: THREE.BackSide, map: wallpaper(kit, "wash", room.palette.second, "") })
        : std({ map: wallpaper(kit, "wash", "#f6eee2", ""), roughness: 0.9, side: THREE.BackSide });
      const dome = mesh(track(new THREE.SphereGeometry(R, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2)), domeMat, group, 0, h, cz);
      dome.scale.set(sx, 0.55, 1);
      /* 돔 테두리 금박 고리 두 겹과 갈비뼈 */
      for (const [rr, tt] of [[R, 0.05], [R + 0.16, 0.025]] as [number, number][]) {
        const ring = mesh(track(new THREE.TorusGeometry(rr, tt, 5, 40)), gold, group, 0, h - 0.02, cz);
        ring.rotation.x = Math.PI / 2;
        ring.scale.set(sx, 1, 1);
      }
      const ribMat = kind === "ovalDome" ? paintWhite : gold;
      for (let k = 0; k < 12; k++) {
        const a2 = (k / 12) * Math.PI * 2;
        const pts: T.Vector3[] = [];
        for (let i = 0; i <= 8; i++) {
          const ph = (i / 8) * (Math.PI / 2) * 0.96;
          pts.push(new THREE.Vector3(Math.cos(a2) * Math.cos(ph) * (R - 0.03) * sx, Math.sin(ph) * R * 0.55 - 0.02, Math.sin(a2) * Math.cos(ph) * (R - 0.03)));
        }
        mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.022, 4)), ribMat, group, 0, h, cz);
      }
      if (kind === "ovalDome") {
        /* 웨지우드 돔 아래 흰 메달리온 고리 */
        for (let k = 0; k < 8; k++) {
          const a2 = (k / 8) * Math.PI * 2 + Math.PI / 8;
          const md = sphere(0.1, paintWhite, group, Math.cos(a2) * R * 0.62 * sx, h + R * 0.55 * 0.62, Math.sin(a2) * R * 0.62 + cz, 10, 6);
          md.scale.set(1, 0.25, 0.75);
        }
      }
      ceilingRose(0, cz, h + R * 0.55 - 0.01, 0.42);
      ceilFrame(w - rc * 2 - 0.5, d - rc * 2 - 0.5, h, paintWhite);
      return;
    }

    if (kind === "papered" || kind === "roundel") {
      /* 평천장 + 아나글립타 돋을 벽지 + 테두리 띠 + 가스등 위 석고 장미(금박 없이) */
      const cp = plane(w, d, std({ map: anaglyptaTex(kit), roughness: 0.85 }), group, 0, h, 0);
      uvx(cp.geometry, w / 1.0, d / 1.0);
      cp.rotation.x = Math.PI / 2;
      const border = std({ color: 0xd8c8a4, roughness: 0.8 });
      for (const [bw, bd, x, z] of [[w - 0.7, 0.08, 0, -d / 2 + 0.35], [w - 0.7, 0.08, 0, d / 2 - 0.35], [0.08, d - 0.7, -w / 2 + 0.35, 0], [0.08, d - 0.7, w / 2 - 0.35, 0]] as [number, number, number, number][]) {
        box(bw, 0.03, bd, border, group, x, h - 0.015, z);
      }
      const lx = room.light.at[0];
      const lz = kind === "roundel" ? -0.2 : room.id === "reception" ? -0.4 : -0.4;
      if (kind === "roundel") {
        /* 레이턴 하우스 응접실처럼 가운데 금박 원판 안에 천장화(들라크루아 '평화' 의 모사) */
        const R = Math.min(w, d) * 0.3;
        const pm = basic({ map: kit.texture(`/assets/regal/paintings/lapaix.webp`), color: 0xd8d0c0 });
        const disc = mesh(track(new THREE.CircleGeometry(R, 40)), pm, group, 0.4, h - 0.008, lz);
        disc.rotation.x = Math.PI / 2;
        disc.rotation.z = Math.PI;
        for (const [rr, tt] of [[R + 0.04, 0.06], [R + 0.2, 0.03]] as [number, number][]) {
          const ring = mesh(track(new THREE.TorusGeometry(rr, tt, 5, 40)), gold, group, 0.4, h - 0.02, lz);
          ring.rotation.x = Math.PI / 2;
        }
        sphere(0.09, gold, group, 0.4, h - 0.03, lz, 10, 6).scale.y = 0.5;
        void lx;
        return;
      }
      lathe([[0.02, 0], [0.42, 0], [0.4, -0.03], [0.3, -0.05], [0.22, -0.08], [0.12, -0.1], [0.02, -0.12]], 20, paintWhite, group, room.props.find(pp => pp.kind === "gasolier")?.at[0] ?? 0, h, room.props.find(pp => pp.kind === "gasolier")?.at[1] ?? lz);
      return;
    }

    const c = plane(w, d, woodCeil ? std({ color: 0x3a2616, roughness: 0.7, map: (oakMat as T.MeshStandardMaterial).map }) : kind === "starCove" ? std({ map: starSky(kit), roughness: 0.9 }) : plaster, group, 0, h, 0);
    uvx(c.geometry, woodCeil ? w / 1.6 : kind === "starCove" ? 1 : w / 2.5, woodCeil ? d / 1.6 : kind === "starCove" ? 1 : d / 2.5);
    c.rotation.x = Math.PI / 2;

    if (kind === "coffered" || kind === "cofferedWood") {
      /* 깊은 격자 천장: 두 단으로 물러나는 보 + 칸마다 금박 장미 */
      const step = kind === "coffered" ? 2 : room.id === "hall" ? 2.0 : 1.6;
      /* 참나무 격자 천장(틴츠필드 대홀의 참나무 지붕처럼): 금박 띠 없이 참나무 보와 보스 */
      const beamMat = woodCeil ? std({ color: room.id === "library" ? 0x4a3020 : 0x6a4428, roughness: 0.62, map: (oakMat as T.MeshStandardMaterial).map }) : paintWhite;
      const nx = Math.round(w / step);
      const nz = Math.round(d / step);
      const sxp = w / nx;
      const szp = d / nz;
      for (let i = 1; i < nx; i++) {
        const x = -w / 2 + sxp * i;
        box(0.34, 0.36, d, beamMat, group, x, h - 0.18, 0, woodCeil ? 1.4 : 0);
        box(0.5, 0.08, d, beamMat, group, x, h - 0.04, 0);
        if (!woodCeil) box(0.36, 0.025, d, gold, group, x, h - 0.37, 0);
      }
      for (let j = 1; j < nz; j++) {
        const z = -d / 2 + szp * j;
        box(w, 0.36, 0.34, beamMat, group, 0, h - 0.18, z, woodCeil ? 1.4 : 0);
        box(w, 0.08, 0.5, beamMat, group, 0, h - 0.04, z);
        if (!woodCeil) box(w, 0.025, 0.36, gold, group, 0, h - 0.37, z);
      }
      const insetTex = kit.canvas(`coffer:${room.id}`, 256, 256, c => {
        /* 참나무 칸: 어두운 참나무 판 + 고딕 사엽(쿼트르포일) 조각. 분홍빛이 돌던 녹색+흰 그라데이션은 뺐습니다. */
        c.fillStyle = woodCeil ? "#3a2616" : "#d6cab0";
        c.fillRect(0, 0, 256, 256);
        const grd = c.createRadialGradient(128, 128, 20, 128, 128, 180);
        grd.addColorStop(0, woodCeil ? "rgba(255,220,170,0.08)" : "rgba(255,255,255,0.25)");
        grd.addColorStop(1, "rgba(0,0,0,0.22)");
        c.fillStyle = grd;
        c.fillRect(0, 0, 256, 256);
        if (woodCeil) {
          linenNoise(c, 256, 256, 3, 500, 0.06);
          const qf = () => {
            c.beginPath();
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * Math.PI * 2;
              c.moveTo(128 + Math.cos(a) * 34 + 30, 128 + Math.sin(a) * 34);
              c.arc(128 + Math.cos(a) * 34, 128 + Math.sin(a) * 34, 30, 0, Math.PI * 2);
            }
          };
          relief(c, qf, "#5a3a20", 3, 0.45, 0.16);
          c.strokeStyle = "rgba(0,0,0,0.35)";
          c.lineWidth = 3;
          c.strokeRect(22, 22, 212, 212);
          c.strokeStyle = "rgba(255,220,170,0.12)";
          c.strokeRect(26, 26, 204, 204);
        } else {
          c.strokeStyle = "#c9a656";
          c.lineWidth = 6;
          c.strokeRect(26, 26, 204, 204);
          c.strokeStyle = "rgba(120,90,40,0.6)";
          c.lineWidth = 2;
          c.strokeRect(36, 36, 184, 184);
        }
        /* 가장자리 그늘(깊이감) */
        const e = c.createLinearGradient(0, 0, 0, 30);
        e.addColorStop(0, "rgba(0,0,0,0.35)");
        e.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = e;
        c.fillRect(0, 0, 256, 30);
      }, { repeat: false });
      const insetMat = std({ map: insetTex, roughness: 0.85 });
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const x = -w / 2 + sxp * (i + 0.5);
          const z = -d / 2 + szp * (j + 0.5);
          const ins = plane(sxp - 0.5, szp - 0.5, insetMat, group, x, h - 0.005, z);
          ins.rotation.x = Math.PI / 2;
          const rr = Math.min(sxp, szp) * 0.16;
          lathe([[0.01, 0], [rr, 0], [rr * 0.6, -0.06], [0.01, -0.09]], woodCeil ? 6 : 8, woodCeil ? beamMat : gold, group, x, h - 0.006, z);
        }
      }
      /* 벽 위 보: 테두리 */
      ceilFrame(w - 0.2, d - 0.2, h, beamMat);
      return;
    }

    /* 코브 천장(접견실, 비밀 서재): 금박 사각 테 두 겹 + 네 귀 부채 + 가운데 장미 */
    const fw = w - rc * 2 - 0.4;
    const fd = d - rc * 2 - 0.4;
    ceilFrame(fw, fd, h, paintWhite);
    ceilFrame(fw - 0.5, fd - 0.5, h, paintWhite);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const fan = mesh(track(new THREE.CircleGeometry(0.42, 10, 0, Math.PI / 2)), gold, group, sx * (fw / 2 - 0.06), h - 0.01, sz * (fd / 2 - 0.06));
      fan.rotation.x = Math.PI / 2;
      fan.rotation.z = Math.atan2(-sz, -sx) - Math.PI / 4;
    }
    if (kind === "starCove") {
      ceilingRose(0, -0.6, h, 0.32);
      return;
    }
    ceilingRose(0, room.id === "reception" ? -0.4 : -0.3, h, 0.55);
  }

  /* ---------- 문 ---------- */

  /* 방마다 다른 오래된 나무 양문(닫힌 문). 문틀, 머리 장식, 황동 손잡이와 열쇠 구멍. */
  const doorWood = (() => {
    const st = room.doorStyle;
    if (st.wood === "oak") return std({ color: 0xb48a5a, roughness: 0.45, map: kit.texture(`${TEX}oak_veneer_01_diff.webp`) });
    if (st.wood === "walnut") return std({ color: 0x8a6448, roughness: 0.4, map: kit.texture(`${TEX}black_walnut_veneer_01_diff.webp`) });
    if (st.wood === "ebony") return std({ color: 0x3a2a24, roughness: 0.32, map: kit.texture(`${TEX}black_walnut_veneer_01_diff.webp`) });
    if (st.wood === "painted") return paintWhite;
    return std({ color: 0x8a3a24, roughness: 0.36, map: kit.texture(`${TEX}dark_paneled_wood_diff.webp`) });
  })();
  const surroundMat = (() => {
    const st = room.doorStyle.surround;
    if (st === "stone") return std({ map: wallpaper(kit, "wash", "#e4d8c0", ""), roughness: 0.7 });
    if (st === "marble") return marble;
    if (st === "iron") return ironWhite;
    return doorWood;
  })();

  function doorLeaf(parent: T.Object3D, lw: number, lh: number, hingeSide: number) {
    /* 틀(스타일과 레일) 위에 도드라진 판 3장 */
    box(lw, lh, 0.07, doorWood, parent, 0, lh / 2, 0, 1.1);
    const panels = [[0.12, lh * 0.22], [lh * 0.38, lh * 0.26], [lh * 0.7, lh * 0.24]];
    for (const [y0, ph] of panels) {
      const pw = lw - 0.2;
      const sh = new THREE.Shape();
      sh.moveTo(-pw / 2, 0);
      sh.lineTo(pw / 2, 0);
      sh.lineTo(pw / 2, ph);
      sh.lineTo(-pw / 2, ph);
      sh.closePath();
      const pg = track(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 1 }));
      uvx(pg, 0.8, 0.8);
      mesh(pg, doorWood, parent, 0, y0 + 0.03, 0.035);
      /* 판 둘레 몰딩: 금박 가는 선 */
      for (const [bw, bh, x, y] of [[pw + 0.08, 0.018, 0, y0 + 0.03 + ph + 0.045], [pw + 0.08, 0.018, 0, y0 - 0.015], [0.018, ph + 0.06, -pw / 2 - 0.04, y0 + 0.03 + ph / 2], [0.018, ph + 0.06, pw / 2 + 0.04, y0 + 0.03 + ph / 2]] as [number, number, number, number][]) {
        box(bw, bh, 0.02, room.doorStyle.wood === "ebony" || room.doorStyle.wood === "mahogany" ? gold : doorWood, parent, x, y, 0.045);
      }
    }
    /* 경첩 */
    for (const y of [0.3, lh - 0.3]) cyl(0.018, 0.018, 0.16, 6, brass, parent, hingeSide * (lw / 2), y, 0.04);
  }

  function buildDoor(wall: Wall, door: Door) {
    if (door.secret) return;
    const wg = wall.group;
    const { dw, dh, fan, gothic, transom, top } = doorSize(door);
    const cx = door.offset ?? 0;
    const st = room.doorStyle;
    const hit: Hit = { type: "door", to: door.to };
    const hitGroup = new THREE.Group();
    wg.add(hitGroup);

    /* 문틀(아키트레이브): 구멍 모양을 키운 테를 밀어 냅니다. */
    const outer = new THREE.Shape();
    doorHole(outer, cx, door, 0.2);
    const inner = new THREE.Path();
    doorHole(inner, cx, door, 0, true);
    outer.holes.push(inner);
    const fg = track(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: gothic ? 1 : 2, curveSegments: 8 }));
    uvx(fg, 0.8, 0.8);
    mesh(fg, surroundMat, wg, 0, 0, 0.0);
    /* 안쪽 테 한 겹 더(계단식 몰딩) */
    const outer2 = new THREE.Shape();
    doorHole(outer2, cx, door, 0.07);
    const inner2 = new THREE.Path();
    doorHole(inner2, cx, door, 0, true);
    outer2.holes.push(inner2);
    mesh(track(new THREE.ExtrudeGeometry(outer2, { depth: 0.16, bevelEnabled: false, curveSegments: 8 })), st.surround === "wood" ? gold : surroundMat, wg, 0, 0, 0.0);
    /* 받침돌 */
    for (const sx of [-1, 1]) box(0.3, 0.32, 0.18, surroundMat, wg, cx + sx * (dw / 2 + 0.1), 0.16, 0.09);

    /* 머리 장식 */
    const headY = top + 0.2;
    const hw = dw + 0.7;
    const underLanding = room.id === "hall" && door.wall === "N";
    if (underLanding) {
      /* 계단참 아래: 머리 장식 대신 얇은 코니스 한 줄 */
      box(hw, 0.12, 0.16, surroundMat, wg, cx, headY + 0.06, 0.08);
    } else if (gothic) {
      /* 후드 몰딩(빗물받이 테): 아치를 따라 도드라진 띠 + 양 끝 받침(라벨 스톱) */
      const hood = new THREE.Shape();
      doorHole(hood, cx, door, 0.34);
      const hoodIn = new THREE.Path();
      doorHole(hoodIn, cx, door, 0.24, true);
      hood.holes.push(hoodIn);
      const hg = track(new THREE.ExtrudeGeometry(hood, { depth: 0.14, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 4 }));
      /* 아래쪽(문설주 옆) 띠는 받침 아래로 자릅니다: 받침 위만 남기기 위해 아래로 숨깁니다. */
      const pos = hg.getAttribute("position") as T.BufferAttribute;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < dh - 0.02) pos.setY(i, dh - 0.02);
      pos.needsUpdate = true;
      hg.computeVertexNormals();
      mesh(hg, surroundMat, wg, 0, 0, 0.0);
      for (const sx of [-1, 1]) {
        box(0.14, 0.2, 0.18, surroundMat, wg, cx + sx * (dw / 2 + 0.29), dh - 0.1, 0.08);
        sphere(0.05, surroundMat, wg, cx + sx * (dw / 2 + 0.29), dh - 0.22, 0.15, 8, 6);
      }
      /* 꼭대기 꽃봉오리 장식(피니얼) */
      const apex = dh + (dw + 0.68) * GOTHIC_RISE;
      lathe([[0, 0], [0.05, 0], [0.07, 0.06], [0.04, 0.14], [0.06, 0.2], [0.0, 0.3]], 8, surroundMat, wg, cx, apex - 0.04, 0.08);
    } else if (transom) {
      /* 네모 채광창 위 단순한 코니스(이스트레이크풍 직선 몰딩) */
      box(dw + 0.62, 0.1, 0.12, surroundMat, wg, cx, headY + 0.05, 0.06);
      box(dw + 0.52, 0.06, 0.03, darkWood, wg, cx, headY + 0.14, 0.11);
      moulding(P_RAIL, dw + 0.72, surroundMat, wg, cx, headY + 0.2, 0.12);
      box(dw + 0.8, 0.06, 0.2, surroundMat, wg, cx, headY + 0.25, 0.1);
      /* 가는 홈 새김(이스트레이크 인사이즈드 라인) */
      for (const sx of [-1, 1]) box(0.012, top - 0.6, 0.012, darkWood, wg, cx + sx * (dw / 2 + 0.1), (top - 0.2) / 2 + 0.3, 0.125);
    } else if (st.head === "pediment" || st.head === "cornice" || st.head === "segmental") {
      /* 프리즈 + 코니스 */
      box(hw - 0.1, 0.28, 0.12, surroundMat, wg, cx, headY + 0.14, 0.06, 1);
      box(hw * 0.5, 0.12, 0.02, gold, wg, cx, headY + 0.14, 0.13);
      moulding(P_RAIL, hw, surroundMat, wg, cx, headY + 0.3, 0.12);
      box(hw + 0.1, 0.08, 0.24, surroundMat, wg, cx, headY + 0.36, 0.12);
    }
    if (underLanding) {
      /* 없음 */
    } else if (st.head === "pediment") {
      const tri = new THREE.Shape();
      tri.moveTo(-hw / 2 - 0.05, 0);
      tri.lineTo(hw / 2 + 0.05, 0);
      tri.lineTo(0, 0.55);
      tri.closePath();
      const hole2 = new THREE.Path();
      hole2.moveTo(-hw / 2 + 0.22, 0.08);
      hole2.lineTo(0, 0.42);
      hole2.lineTo(hw / 2 - 0.22, 0.08);
      hole2.closePath();
      tri.holes.push(hole2);
      mesh(track(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 })), surroundMat, wg, cx, headY + 0.4, 0.04);
      const tymp = mesh(track(new THREE.ShapeGeometry((() => { const t2 = new THREE.Shape(); t2.moveTo(-hw / 2 + 0.22, 0.08); t2.lineTo(hw / 2 - 0.22, 0.08); t2.lineTo(0, 0.42); t2.closePath(); return t2; })())), surroundMat, wg, cx, headY + 0.4, 0.05);
      void tymp;
      sphere(0.09, gold, wg, cx, headY + 0.58, 0.1, 10, 8).scale.set(1, 1, 0.4);
    } else if (st.head === "segmental") {
      const seg = new THREE.Shape();
      seg.moveTo(-hw / 2, 0);
      seg.absellipse(0, 0, hw / 2, 0.42, Math.PI, 0, true, 0);
      seg.lineTo(-hw / 2, 0);
      const segHole = new THREE.Path();
      segHole.absellipse(0, 0.05, hw / 2 - 0.16, 0.28, 0, Math.PI, false, 0);
      segHole.closePath();
      seg.holes.push(segHole);
      mesh(track(new THREE.ExtrudeGeometry(seg, { depth: 0.18, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 14 })), surroundMat, wg, cx, headY + 0.4, 0.04);
      /* 쐐기돌 */
      box(0.18, 0.32, 0.22, gold, wg, cx, headY + 0.6, 0.12);
    } else if (fan) {
      /* 반원 채광창: 유리 + 부챗살 + 쐐기돌 */
      box(0.24, 0.34, 0.2, surroundMat === marble ? marble : gold, wg, cx, top + 0.08, 0.1);
    }

    /* 문 안쪽 두께(문설주) */
    const reveal = std({ color: 0x3a2a1e, roughness: 0.8 });
    const postH = gothic ? dh : top;
    box(0.05, postH, 0.36, reveal, wg, cx - dw / 2 - 0.025, postH / 2, -0.18);
    box(0.05, postH, 0.36, reveal, wg, cx + dw / 2 + 0.025, postH / 2, -0.18);
    if (gothic) {
      /* 아치 안쪽 두께: 아치 점을 따라 짧은 판을 잇습니다(틈 없이 조금씩 겹침). */
      const ap = gothicPts(cx, dw + 0.1, dh, 7);
      for (let i = 0; i < ap.length - 1; i++) {
        const [x0, y0] = ap[i];
        const [x1, y1] = ap[i + 1];
        const sl = Math.hypot(x1 - x0, y1 - y0) + 0.03;
        const seg = box(sl, 0.05, 0.36, reveal, wg, (x0 + x1) / 2, (y0 + y1) / 2, -0.18);
        seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      }
    } else box(dw + 0.1, 0.05, 0.36, reveal, wg, cx, (fan ? dh : top) + 0.025, -0.18);
    /* 문지방(대리석) */
    box(dw + 0.12, 0.03, 0.4, marble, wg, cx, 0.015, -0.12);

    /* 문짝 두 개(닫힘). 가운데에 한 줄 금빛 틈. */
    const lw = dw / 2 - 0.01;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(cx + sx * (lw / 2 + 0.005), 0, -0.1);
      hitGroup.add(leaf);
      doorLeaf(leaf, lw, dh, sx);
      /* 손잡이(레버)와 열쇠 구멍 판 */
      const hx = -sx * (lw / 2 - 0.1);
      const esc = box(0.06, 0.2, 0.012, brass, leaf, hx, 1.02, 0.075);
      void esc;
      const lever = cyl(0.012, 0.012, 0.14, 6, brass, leaf, hx + sx * 0.05, 1.08, 0.11);
      lever.rotation.z = Math.PI / 2;
      sphere(0.022, brass, leaf, hx, 1.08, 0.095, 8, 6);
      plane(0.012, 0.03, basic({ color: 0x050403 }), leaf, hx, 0.98, 0.083);
    }
    box(0.012, dh, 0.08, std({ color: 0x120a06, roughness: 1 }), hitGroup, cx, dh / 2, -0.1);
    /* 문 밑 틈으로 새는 이웃 방 빛 */
    const sliver = basic({ color: new THREE.Color(ctx.roomColor(door.to)).lerp(new THREE.Color(0xffe2b0), 0.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const sl = plane(dw - 0.1, 0.02, sliver, hitGroup, cx, 0.012, -0.05);
    sl.renderOrder = 3;

    if (fan) {
      const r = dw / 2;
      const fanShape = new THREE.Shape();
      fanShape.moveTo(cx - r, dh);
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI - (i / 18) * Math.PI;
        fanShape.lineTo(cx + Math.cos(a) * r, dh + Math.sin(a) * r);
      }
      fanShape.closePath();
      const fanMat = std({ color: 0xfff1d6, emissive: new THREE.Color(0xffe2b0), emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.85 });
      mesh(track(new THREE.ShapeGeometry(fanShape, 8)), fanMat, hitGroup, 0, 0, -0.14);
      const barMat = st.surround === "iron" ? ironWhite : gold;
      for (let k = 1; k < 8; k++) {
        const a = Math.PI - (k / 8) * Math.PI;
        const bar = box(0.022, r, 0.03, barMat, hitGroup, cx + (Math.cos(a) * r) / 2, dh + (Math.sin(a) * r) / 2, -0.12);
        bar.rotation.z = a - Math.PI / 2;
      }
      const hub = mesh(track(new THREE.CircleGeometry(0.16, 12, 0, Math.PI)), barMat, hitGroup, cx, dh + 0.005, -0.11);
      void hub;
      box(dw, 0.06, 0.08, doorWood, hitGroup, cx, dh + 0.01, -0.1);
    }

    if (gothic || transom) {
      /* 스테인드글라스(빛이 비치는 듯 자기 빛) + 문 위 가로대 */
      const pal: [string, string, string] = room.id === "music" ? ["#2a5a4a", "#d8a83a", "#8a2a3a"] : room.id === "hall" ? ["#7a1f2b", "#d8a83a", "#2a3a6a"] : ["#3a4a2a", "#c8a03a", "#7a2a3a"];
      const sgMat = std({ map: stainedGlassTex(kit, `${room.id}:${gothic ? "arch" : "rect"}`, gothic ? 384 : 512, gothic ? 256 : 160, pal), emissive: new THREE.Color(0xffffff), roughness: 0.3 });
      sgMat.emissiveMap = sgMat.map;
      sgMat.emissiveIntensity = 0.55;
      const sgShape = new THREE.Shape();
      if (gothic) {
        const ap = gothicPts(cx, dw, dh, 10);
        sgShape.moveTo(ap[0][0], ap[0][1]);
        for (let i = 1; i < ap.length; i++) sgShape.lineTo(ap[i][0], ap[i][1]);
        sgShape.closePath();
      } else {
        sgShape.moveTo(cx - dw / 2, dh);
        sgShape.lineTo(cx + dw / 2, dh);
        sgShape.lineTo(cx + dw / 2, top);
        sgShape.lineTo(cx - dw / 2, top);
        sgShape.closePath();
      }
      const sgGeo = track(new THREE.ShapeGeometry(sgShape, 6));
      /* UV: 아치/채광창 경계 상자에 맞춥니다 */
      const uv = sgGeo.getAttribute("uv") as T.BufferAttribute;
      const ps = sgGeo.getAttribute("position") as T.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (ps.getX(i) - (cx - dw / 2)) / dw, (ps.getY(i) - dh) / (top - dh));
      uv.needsUpdate = true;
      mesh(sgGeo, sgMat, hitGroup, 0, 0, -0.14);
      box(dw + 0.04, 0.08, 0.1, doorWood, hitGroup, cx, dh + 0.02, -0.1);
      if (transom) for (const fx of [-dw / 6, dw / 6]) box(0.025, top - dh, 0.04, doorWood, hitGroup, cx + fx, (dh + top) / 2, -0.12);
    }

    /* 황동 문패 */
    const name = door.plaque ?? ctx.roomName(door.to);
    const plaqueTex = plaqueTexture(kit, name, door.plaque ? "Entrance" : roomEn(door.to));
    const pq = new THREE.Group();
    pq.position.set(cx + dw / 2 + 0.6, 1.55, 0.03);
    wg.add(pq);
    box(0.46, 0.25, 0.02, brass, pq);
    plane(0.42, 0.21, basic({ map: plaqueTex }), pq, 0, 0, 0.012);
    setHit(hitGroup, hit);
    setHit(pq, hit);
  }

  const roomEn = ctx.roomEn;

  /* ---------- 창 ---------- */

  function buildWindow(wall: Wall, win: Window) {
    const wg = wall.group;
    const { offset: cx, w: ww, h: wh, sill } = win;
    const skyTex = kit.canvas(`sky:${room.daylight}`, 64, 128, g => {
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, "#ffffff");
      grd.addColorStop(0.55, room.daylight);
      grd.addColorStop(1, "#cfd8c8");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 128);
    }, { repeat: false });
    /* 비밀 서재 창문은 별이 뜬 밤하늘 */
    const pane = plane(ww, wh, basic({ map: room.id === "secret" ? starSky(kit) : skyTex }), wg, cx, sill + wh / 2, -0.08);
    void pane;
    /* 창틀, 창살(빅토리아 후기 2-over-2 내리닫이창: 큰 판유리 넉 장) */
    const fm = room.walls === "velvet" || room.walls === "plumVelvet" ? walnut : paintWhite;
    for (const [bw, bh, x, y] of [[ww + 0.2, 0.12, cx, sill + wh + 0.06], [ww + 0.3, 0.1, cx, sill - 0.05], [0.1, wh, cx - ww / 2 - 0.05, sill + wh / 2], [0.1, wh, cx + ww / 2 + 0.05, sill + wh / 2]] as [number, number, number, number][]) {
      box(bw, bh, 0.16, fm, wg, x, y, 0.0);
    }
    box(ww + 0.4, 0.06, 0.28, fm, wg, cx, sill - 0.02, 0.1);
    box(0.035, wh, 0.04, fm, wg, cx, sill + wh / 2, -0.05);
    box(ww, 0.07, 0.07, fm, wg, cx, sill + wh / 2, -0.04);
    /* 커튼: 주름진 천(사인파 주름, 끈으로 묶은 허리), 레이스 속커튼, 물결 밸런스 */
    const curtain = velvetMat(room.walls === "chintz" ? "#c7a888" : room.walls === "wedgwood" ? "#8aa2c4" : room.id === "drawing" ? "#7a2a34" : room.id === "reception" ? "#4a5a3a" : room.id === "music" ? "#5a3a2a" : room.palette.main);
    (curtain as T.MeshStandardMaterial).side = THREE.DoubleSide;
    const ch = wh + 0.55;
    const cw = 0.62;
    const tie = 0.38;
    for (const s of [-1, 1]) {
      const cg = track(new THREE.PlaneGeometry(cw, ch, 14, 10));
      const pos = cg.getAttribute("position") as T.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / cw + 0.5;
        const v = pos.getY(i) / ch + 0.5;
        /* 묶은 자리(v=tie)에서 창 반대쪽으로 모이고, 아래로 갈수록 다시 퍼집니다. */
        const pinch = v > tie ? 0.35 + 0.65 * Math.pow((v - tie) / (1 - tie), 0.7) : 0.35 + 0.4 * Math.pow((tie - v) / tie, 1.2);
        /* 창 가장자리(u=0)에서 바깥쪽(s 방향)으로 펼쳐집니다. */
        const x = s * (u * cw * pinch - 0.05);
        const z = Math.sin(u * Math.PI * 7) * 0.035 * (1.2 - pinch * 0.5) + 0.04;
        pos.setXYZ(i, x, pos.getY(i), z);
      }
      pos.needsUpdate = true;
      cg.computeVertexNormals();
      uvx(cg, 1.5, 3);
      const edgeX = cx + s * (ww / 2 + 0.12);
      mesh(cg, curtain, wg, edgeX, sill + ch / 2 - 0.18, 0.12);
      /* 금빛 술 끈 */
      const tb = mesh(track(new THREE.TorusGeometry(0.1, 0.014, 4, 10)), gold, wg, edgeX + s * 0.1, sill - 0.18 + ch * tie, 0.18);
      tb.scale.set(1.1, 0.5, 1);
      sphere(0.03, gold, wg, edgeX + s * 0.22, sill - 0.24 + ch * tie, 0.2, 6, 5);
    }
    /* 레이스 속커튼 */
    const lace = std({ color: 0xf6f0e2, roughness: 0.9, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const lp = plane(ww, wh, lace, wg, cx, sill + wh / 2, 0.03);
    lp.renderOrder = 3;
    /* 밸런스: 아래 가장자리가 물결(스캘럽)인 판 + 금빛 술 띠 */
    const val = new THREE.Shape();
    const vw = ww + 0.9;
    val.moveTo(-vw / 2, 0.34);
    val.lineTo(vw / 2, 0.34);
    val.lineTo(vw / 2, 0);
    const nS = 5;
    for (let i = nS - 1; i >= 0; i--) {
      const x0 = -vw / 2 + (vw / nS) * (i + 1);
      const x1 = -vw / 2 + (vw / nS) * i;
      val.quadraticCurveTo((x0 + x1) / 2, -0.12, x1, 0);
    }
    val.closePath();
    const vg2 = track(new THREE.ExtrudeGeometry(val, { depth: 0.06, bevelEnabled: false, curveSegments: 5 }));
    uvx(vg2, 1.2, 1.2);
    mesh(vg2, curtain, wg, cx, sill + wh + 0.12, 0.16);
    box(vw + 0.05, 0.04, 0.1, gold, wg, cx, sill + wh + 0.47, 0.19);

    /* 빛줄기(가산 혼합)와 바닥의 해 그림자 */
    const shaftTex = kit.canvas("shaft", 4, 128, g => {
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, "rgba(255,255,255,0.9)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 4, 128);
    }, { repeat: false });
    const reach = 2.6;
    const geo = track(new THREE.BufferGeometry());
    const top = sill + wh;
    geo.setAttribute("position", new THREE.Float32BufferAttribute([cx - ww / 2, top, 0.05, cx + ww / 2, top, 0.05, cx - ww / 2 - 0.3, 0.02, reach + 0.8, cx + ww / 2 + 0.3, 0.02, reach + 0.8], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const shaftMat = basic({ map: shaftTex, color: new THREE.Color(room.daylight), transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = mesh(geo, shaftMat, wg);
    shaft.renderOrder = 5;
    const sun = radialTexture(kit, "sun", "rgba(255,240,210,0.9)", "rgba(255,240,210,0)");
    const patch = plane(ww + 1.0, 2.2, basic({ map: sun, color: new THREE.Color(room.daylight), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }), wg, cx, 0.015, reach);
    patch.rotation.x = -Math.PI / 2;
    patch.renderOrder = 2;
  }

  /* ---------- 그림 ---------- */

  function buildPainting(p: Painting) {
    let src = p.src;
    let title = p.title;
    let sub = `${p.artist}${p.date ? ", " + p.date : ""}`;
    let credit = p.credit;
    let aspect = p.aspect;
    if (p.owner) {
      src = ctx.ownerPhoto;
      title = "주인장 초상";
      sub = ctx.ownerLabel;
      credit = "프로필 사진";
      aspect = 0.8;
    }
    if (p.album !== undefined) {
      const a = ctx.album[p.album];
      if (!a) return;
      src = a.src;
      title = a.label;
      sub = "사진첩";
      credit = "";
      aspect = 1.25;
    }
    if (!src) return;
    const wall = walls[p.wall];
    const g = new THREE.Group();
    g.position.set(p.offset, p.y, 0.03);
    wall.group.add(g);
    const ph = p.h;
    const pw = ph * aspect;
    const tex = kit.texture(src);
    const pic = std({ map: tex, roughness: 0.62 });
    plane(pw, ph, pic, g, 0, 0, 0.05);
    const t = Math.min(0.14, 0.06 + ph * 0.05);
    if (p.bare) {
      /* 살롱식: 넓은 금박 액자(바깥 테 + 안쪽 홈 + 슬립)만, 등과 설명표 없이 */
      const deep = std({ color: 0x9a7a3a, metalness: 0.9, roughness: 0.42 });
      for (const [bw, bh, x, y] of [[pw + t * 2, t, 0, ph / 2 + t / 2], [pw + t * 2, t, 0, -ph / 2 - t / 2], [t, ph, -pw / 2 - t / 2, 0], [t, ph, pw / 2 + t / 2, 0]] as [number, number, number, number][]) {
        box(bw, bh, 0.08, gold, g, x, y, 0.04);
      }
      for (const [bw, bh, x, y] of [[pw + t, t * 0.3, 0, ph / 2 + t * 0.5], [pw + t, t * 0.3, 0, -ph / 2 - t * 0.5], [t * 0.3, ph + t, -pw / 2 - t * 0.5, 0], [t * 0.3, ph + t, pw / 2 + t * 0.5, 0]] as [number, number, number, number][]) {
        box(bw, bh, 0.012, deep, g, x, y, 0.085);
      }
      for (const [bw, bh, x, y] of [[pw + 0.03, 0.025, 0, ph / 2], [pw + 0.03, 0.025, 0, -ph / 2], [0.025, ph, -pw / 2, 0], [0.025, ph, pw / 2, 0]] as [number, number, number, number][]) {
        box(bw, bh, 0.07, brass, g, x, y, 0.04);
      }
      /* 그림 걸이 줄(그림 레일에서 내려오는 두 가닥) */
      const cord = basic({ color: 0x3a2a1a });
      const railY = victorian ? wallH - 0.72 : wallH - 0.62;
      if (p.y + ph / 2 + t < railY - 0.05) {
        for (const sx of [-1, 1]) {
          const len2 = railY - (p.y + ph / 2 + t);
          const c2 = plane(0.008, len2 + 0.02, cord, g, sx * pw * 0.3, ph / 2 + t + len2 / 2, 0.012);
          c2.rotation.z = sx * 0.04;
        }
      }
      return;
    }
    /* 금박 액자: 바깥 테 + 안쪽 슬립 */
    for (const [bw, bh, x, y] of [[pw + t * 2, t, 0, ph / 2 + t / 2], [pw + t * 2, t, 0, -ph / 2 - t / 2], [t, ph, -pw / 2 - t / 2, 0], [t, ph, pw / 2 + t / 2, 0]] as [number, number, number, number][]) {
      box(bw, bh, 0.09, gold, g, x, y, 0.045);
    }
    for (const [bw, bh, x, y] of [[pw + 0.03, 0.025, 0, ph / 2], [pw + 0.03, 0.025, 0, -ph / 2], [0.025, ph, -pw / 2, 0], [0.025, ph, pw / 2, 0]] as [number, number, number, number][]) {
      box(bw, bh, 0.1, brass, g, x, y, 0.05);
    }
    /* 그림 조명(작은 황동 등 + 은은한 빛 데칼) */
    const lamp = cyl(0.025, 0.025, Math.min(pw * 0.7, 0.9), 8, brass, g, 0, ph / 2 + t + 0.06, 0.24);
    lamp.rotation.z = Math.PI / 2;
    box(0.02, 0.02, 0.22, brass, g, 0, ph / 2 + t + 0.06, 0.12);
    const glowTex = radialTexture(kit, "pglow", "rgba(255,226,170,0.75)", "rgba(255,226,170,0)");
    const glow = plane(pw * 1.3, ph * 1.1, basic({ map: glowTex, transparent: true, opacity: room.id === "gallery" ? 0.55 : 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), g, 0, ph * 0.18, 0.06);
    glow.renderOrder = 4;
    const strip = std({ color: 0xffe9c0, emissive: new THREE.Color(0xffd890), emissiveIntensity: 1.2 });
    box(Math.min(pw * 0.66, 0.86), 0.012, 0.03, strip, g, 0, ph / 2 + t + 0.035, 0.24);
    /* 박물관식 설명표 */
    const lab = labelTexture(kit, `${title}|${sub}`, [
      { text: title, size: 40, kr: /[가-힣]/.test(title) },
      { text: sub, size: 28, weight: 500, kr: /[가-힣]/.test(sub) },
      ...(credit ? [{ text: credit, size: 22, weight: 500, color: "#6a5a44", kr: /[가-힣]/.test(credit) }] : [])
    ]);
    const lw = 0.3;
    const lx = pw / 2 + t + 0.26;
    const ly = Math.max(-ph / 2, 1.3 - p.y);
    const labelGroup = new THREE.Group();
    labelGroup.position.set(lx, ly, 0.01);
    g.add(labelGroup);
    box(lw + 0.02, lw * 0.375 + 0.02, 0.012, std({ color: 0x3a2a1a, roughness: 0.5 }), labelGroup);
    plane(lw, lw * 0.375, basic({ map: lab }), labelGroup, 0, 0, 0.008);
  }

  /* ---------- 조립 ---------- */

  buildFloor();
  const walls = {} as Record<Side, Wall>;
  for (const s of ["N", "S", "E", "W"] as Side[]) {
    walls[s] = wallFrame(s);
    const ds = room.doors.filter(dr => dr.wall === s);
    const ws = room.windows.filter(wn => wn.wall === s);
    buildWall(walls[s], ds, ws);
    ds.forEach(dr => buildDoor(walls[s], dr));
    ws.forEach(wn => buildWindow(walls[s], wn));
  }
  buildCeiling();
  room.paintings.forEach(buildPainting);

  const hooks: PropHooks = {};
  const props = makeProps({
    THREE, kit, room, group, std, basic, box, cyl, sphere, lathe, plane, mesh, track, uvx, blob, floorDecal, setHit,
    gold, brass, darkWood, walnut, oakMat, marble, paintWhite, blackGloss, ironWhite, leatherRed, leatherBrown, velvetMat, glass, linen,
    rnd, animators, wallH, flame: flameSheet(kit), sparkle: sparkleTexture(kit), rug: rugTexture, label: labelTexture, hooks
  });
  room.props.forEach(p => props.place(p));

  /* ---------- 인물(스탠디) ---------- */
  const head = new THREE.Vector3();
  const charGroup = new THREE.Group();
  group.add(charGroup);
  const camPos = new THREE.Vector3(...room.camera.pos);
  buildStandee(room.character);
  setHit(charGroup, { type: "character" });

  /* 전신 그림 한 장을 카메라 쪽으로 세웁니다. 키(height)는 실제 m 입니다.
     발밑에는 부드러운 둥근 그림자를 깔고, 숨쉬기(세로 0.6%)와
     아주 작은 기울임만 줍니다. */
  function buildStandee(c: Character) {
    const tex = kit.texture(c.src);
    const ph = c.height;
    const pw = ph * c.aspect;
    const m = std({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide });
    /* 그림의 색을 살리려고 자기 색으로 조금 밝힙니다(셀 셰이딩 그림이라 조명에 덜 묻히게). */
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = 0.38;
    const pivot = new THREE.Group();
    charGroup.add(pivot);
    plane(pw, ph, m, pivot, 0, ph / 2, 0);
    charGroup.position.set(c.at[0], 0, c.at[1]);
    charGroup.rotation.y = Math.atan2(camPos.x - c.at[0], camPos.z - c.at[1]) + (c.rot ?? 0) * DEG;
    /* 발밑 그림자: 진한 안쪽 + 넓고 옅은 바깥 */
    blob(0, 0.02, pw * 1.25, 0.42, 0.9, charGroup);
    blob(0, 0.04, pw * 2.2, 0.9, 0.45, charGroup);
    const ph0 = rnd() * 6;
    animators.push(t => {
      pivot.scale.y = 1 + Math.sin(t * 1.6 + ph0) * 0.006;
      pivot.scale.x = 1 - Math.sin(t * 1.6 + ph0) * 0.003;
      pivot.rotation.z = Math.sin(t * 0.42 + ph0) * 0.012;
    });
    head.set(c.at[0], ph * 0.95, c.at[1]);
  }

  /* ---------- 조명 ---------- */
  /* 평평한 밝기를 줄입니다: 바탕빛은 낮추고, 큰 등 아래에 따뜻한 빛웅덩이를 그려 넣습니다. */
  const amb = new THREE.HemisphereLight(new THREE.Color(room.ambient.sky), new THREE.Color(room.ambient.ground), room.ambient.intensity * 0.62);
  {
    const poolTex = radialTexture(kit, "lightpool", "rgba(255,214,150,0.55)", "rgba(255,214,150,0)");
    const span = Math.min(w, d) * 0.9;
    const lp = plane(span, span, basic({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }), group, room.light.at[0], 0.016, room.light.at[2]);
    lp.rotation.x = -Math.PI / 2;
    lp.renderOrder = 1;
  }
  group.add(amb);
  if (room.light.distance === 0) {
    const sun = new THREE.DirectionalLight(new THREE.Color(room.light.color), room.light.intensity);
    sun.position.set(...room.light.at);
    sun.target.position.set(0, 0, 0);
    group.add(sun, sun.target);
  } else {
    const pl = new THREE.PointLight(new THREE.Color(room.light.color), room.light.intensity, room.light.distance, 1.6);
    pl.position.set(...room.light.at);
    group.add(pl);
  }

  group.updateMatrixWorld(true);
  let triangles = 0;
  group.traverse(o => {
    const m = o as T.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const idx = m.geometry.index;
    const count = idx ? idx.count : m.geometry.getAttribute("position").count;
    const inst = (o as T.InstancedMesh).isInstancedMesh ? (o as T.InstancedMesh).count : 1;
    triangles += (count / 3) * inst;
  });

  return {
    room,
    group,
    hits,
    head,
    triangles: Math.round(triangles),
    animate: t => animators.forEach(a => a(t)),
    openSecret: hooks.openSecret,
    dispose: () => {
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      group.clear();
    }
  };
}

/* ------------------------------------------------------------------ */
/* 소품과 인물                                                          */
/* ------------------------------------------------------------------ */

type Tools = {
  THREE: Three;
  kit: Kit;
  room: Room;
  group: T.Group;
  std: (p: T.MeshStandardMaterialParameters & { physical?: boolean; clearcoat?: number }) => T.MeshStandardMaterial;
  basic: (p: T.MeshBasicMaterialParameters) => T.MeshBasicMaterial;
  box: (bw: number, bh: number, bd: number, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number, tile?: number) => T.Mesh;
  cyl: (rt: number, rb: number, ch: number, seg: number, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number) => T.Mesh;
  sphere: (r: number, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number, ws?: number, hs?: number) => T.Mesh;
  lathe: (pts: [number, number][], seg: number, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number) => T.Mesh;
  plane: (pw: number, ph: number, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number) => T.Mesh;
  mesh: (g: T.BufferGeometry, m: T.Material, parent: T.Object3D, x?: number, y?: number, z?: number) => T.Mesh;
  track: <G extends T.BufferGeometry>(g: G) => G;
  uvx: (g: T.BufferGeometry, su: number, sv: number, rot?: number, ou?: number, ov?: number) => T.BufferGeometry;
  blob: (x: number, z: number, bw: number, bd: number, opacity?: number, parent?: T.Object3D) => T.Mesh;
  floorDecal: (tex: T.Texture, dw: number, dd: number, x: number, z: number, opacity?: number, y?: number, additive?: boolean, color?: number) => T.Mesh;
  setHit: (o: T.Object3D, hit: Hit) => void;
  gold: T.Material;
  brass: T.Material;
  darkWood: T.Material;
  walnut: T.Material;
  oakMat: T.Material;
  marble: T.Material;
  paintWhite: T.Material;
  blackGloss: T.Material;
  ironWhite: T.Material;
  leatherRed: T.Material;
  leatherBrown: T.Material;
  velvetMat: (c: string) => T.Material;
  glass: T.Material;
  linen: T.Material;
  rnd: () => number;
  animators: ((t: number) => void)[];
  wallH: number;
  flame: T.Texture;
  sparkle: T.Texture;
  rug: typeof rugTexture;
  label: typeof labelTexture;
  hooks: PropHooks;
};

type PropHooks = { openSecret?: (u: number) => void };

type PropFn = (g: T.Group, p: Prop) => void;

function makeProps(k: Tools) {
  const { THREE, kit, room, group, std, basic, box, cyl, sphere, lathe, plane, mesh, track, uvx, setHit } = k;
  const { gold, brass, darkWood, walnut, marble, glass, linen, rnd, animators, wallH, velvetMat, leatherBrown, leatherRed } = k;
  const H = room.size.h;
  const porcelain = std({ color: 0xf8f6f0, roughness: 0.25 });
  const emissive = (c: number, i = 1) => std({ color: c, emissive: new THREE.Color(c), emissiveIntensity: i, roughness: 0.5 });
  k.flame.repeat.set(1 / 8, 1);

  function flameSprite(parent: T.Object3D, x: number, y: number, z: number, s: number) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: k.flame, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.set(s, s, 1);
    sp.position.set(x, y, z);
    parent.add(sp);
    return sp;
  }
  /* 카브리올 다리: 무릎이 밖으로 불룩, 발목에서 가늘어졌다 발끝이 살짝 나오는 S자 다리.
     굵기가 바뀌는 관을 직접 만듭니다(고리 10개 × 6각). out 방향은 다리 group 의 +x. */
  function cabriole(parent: T.Object3D, x: number, z: number, h: number, r: number, m: T.Material, toward: number) {
    const lg = new THREE.Group();
    lg.position.set(x, 0, z);
    lg.rotation.y = toward;
    parent.add(lg);
    const out = h * 0.16;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, h, 0),
      new THREE.Vector3(out * 0.85, h * 0.8, 0),
      new THREE.Vector3(out * 0.25, h * 0.45, 0),
      new THREE.Vector3(-out * 0.2, h * 0.14, 0),
      new THREE.Vector3(out * 0.25, 0.015, 0)
    ]);
    const rings = 10;
    const sides = 6;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const frames = curve.computeFrenetFrames(rings, false);
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const c = curve.getPointAt(t);
      const rr = r * (t < 0.25 ? 1 + t * 0.6 : t < 0.85 ? 1.15 - (t - 0.25) * 1.15 : 0.46 + (t - 0.85) * 2.4);
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
        pos.push(c.x + n.x * rr, c.y + n.y * rr, c.z + n.z * rr);
        uv.push(j / sides, t);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j;
        const b = a + sides + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    mesh(geo, m, lg);
    return lg;
  }
  /* 네 귀 다리를 바깥(대각선)으로 벌려 세웁니다. */
  function cabrioles(parent: T.Object3D, hx: number, hz: number, h: number, r: number, m: T.Material) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cabriole(parent, sx * hx, sz * hz, h, r, m, Math.atan2(-sz, sx));
  }
  /* 선반에 돌린 다리(공 모양 발, 고리 마디) */
  const turnedLegProfile = (h: number, r: number): [number, number][] => [[0.0, 0], [r * 1.3, 0], [r * 1.5, h * 0.05], [r * 0.9, h * 0.12], [r * 0.7, h * 0.3], [r * 1.25, h * 0.42], [r * 0.8, h * 0.52], [r * 0.9, h * 0.85], [r * 1.2, h * 0.9], [r * 1.2, h], [0, h]];
  /* 앞치마(에이프런) 가운데 조개 조각 */
  function shell(parent: T.Object3D, x: number, y: number, z: number, s: number, m: T.Material) {
    const sh = mesh(track(new THREE.CircleGeometry(s, 9, 0, Math.PI)), m, parent, x, y, z);
    sh.rotation.z = Math.PI;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + ((i + 0.5) / 5) * Math.PI;
      box(0.008, s * 0.9, 0.012, m, parent, x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45, z + 0.006).rotation.z = a - Math.PI / 2;
    }
  }

  /* 불꽃은 한 장의 텍스처 offset 을 넘겨 8칸을 돌립니다. */
  animators.push(t => {
    k.flame.offset.x = (Math.floor(t * 12) % 8) / 8;
  });

  function candle(parent: T.Object3D, x: number, y: number, z: number, hh = 0.14) {
    cyl(0.018, 0.018, hh, 6, std({ color: 0xfff6e0, roughness: 0.6, emissive: new THREE.Color(0xffe0a0), emissiveIntensity: 0.25 }), parent, x, y + hh / 2, z);
    flameSprite(parent, x, y + hh + 0.035, z, 0.07);
  }

  function sparkles(parent: T.Object3D, n: number, r: number, y: number, hh: number) {
    const mats: T.SpriteMaterial[] = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: k.sparkle, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      const sp = new THREE.Sprite(m);
      const a = rnd() * Math.PI * 2;
      const rr = r * (0.4 + rnd() * 0.6);
      sp.position.set(Math.cos(a) * rr, y - rnd() * hh, Math.sin(a) * rr);
      sp.scale.setScalar(0.09);
      parent.add(sp);
      mats.push(m);
    }
    animators.push(t => {
      mats.forEach((m, i) => {
        const v = Math.sin(t * (1.3 + (i % 5) * 0.37) + i * 2.1);
        m.opacity = v > 0.82 ? (v - 0.82) * 5 : 0;
      });
    });
  }

  function halo(parent: T.Object3D, y: number, size: number, opacity: number) {
    const tex = radialTexture(kit, "halo", "rgba(255,226,170,0.55)", "rgba(255,226,170,0)");
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    sp.scale.setScalar(size);
    sp.position.set(0, y, 0);
    parent.add(sp);
  }

  const baluster: [number, number][] = [[0.03, 0], [0.05, 0.05], [0.025, 0.2], [0.06, 0.45], [0.03, 0.7], [0.045, 0.82], [0.0, 0.84]];

  const B: Partial<Record<Prop["kind"], PropFn>> = {};

  /* 쌍둥이 계단. 한 판(옆판+밑면이 닫힌 톱니 단면)을 밀어 만들고, 그 위에 디딤판 코, 러너, 황동 막대,
     둥근 나무 난간동자와 둥근 손잡이를 얹어 위층 회랑 난간과 같은 모양으로 잇습니다. */
  B.twinStair = g => {
    const back = -1.4;
    const topY = 3.2;
    const steps = 18;
    const rise = topY / steps;
    const run = 4.0;
    const tread = run / steps;
    const z0 = -0.2;
    const z1 = 1.3;
    const fw = z1 - z0;
    const zr = z1 - 0.07;
    const runner = velvetMat("#7a1f2b");
    const turned: [number, number][] = [[0.03, 0], [0.034, 0.06], [0.02, 0.14], [0.042, 0.32], [0.02, 0.6], [0.03, 0.8], [0.0, 0.84]];
    const newel: [number, number][] = [[0.13, 0], [0.13, 0.08], [0.1, 0.12], [0.1, 0.6], [0.13, 0.66], [0.07, 0.72], [0.06, 0.9], [0.1, 0.98], [0.12, 1.06], [0.09, 1.14], [0.04, 1.2], [0.0, 1.22]];
    const body = std({ map: (marble as T.MeshStandardMaterial).map, color: 0xf2ece0, roughness: 0.4 });
    const soffitMat = std({ map: wallpaper(kit, "wash", "#e8dfcf", ""), roughness: 0.9 });
    for (const s of [-1, 1]) {
      const fg = new THREE.Group();
      fg.position.set(s * 1.6, 0, 0);
      fg.scale.x = s;
      g.add(fg);
      /* 톱니 단면 + 비스듬한 밑면(소핏) */
      const prof = new THREE.Shape();
      prof.moveTo(0, 0);
      for (let i = 0; i < steps; i++) {
        prof.lineTo(i * tread, (i + 1) * rise);
        prof.lineTo((i + 1) * tread, (i + 1) * rise);
      }
      prof.lineTo(run, topY - 0.34);
      prof.lineTo(run - (topY - 0.34) / (topY / run), 0);
      prof.closePath();
      const sg = track(new THREE.ExtrudeGeometry(prof, { depth: fw, bevelEnabled: false }));
      uvx(sg, 0.45, 0.45);
      mesh(sg, body, fg, 0, 0, z0);
      /* 옆판(스트링어) 몰딩: 바깥 면 위를 따라 금빛 띠 */
      const strLen = Math.hypot(run, topY);
      const band = box(strLen, 0.05, 0.02, gold, fg, run / 2, topY / 2 + 0.05, z1 + 0.012);
      band.rotation.z = Math.atan2(topY, run);
      for (let i = 0; i < steps; i++) {
        const u = (i + 0.5) * tread;
        const y = (i + 1) * rise;
        /* 디딤판 코(살짝 튀어나온 둥근 끝) */
        box(tread + 0.03, 0.035, fw + 0.02, body, fg, u - 0.015, y - 0.0175, (z0 + z1) / 2);
        /* 러너: 디딤판 + 챌판 */
        box(tread, 0.012, 0.92, runner, fg, u, y + 0.006, 0.55);
        box(0.012, rise, 0.92, runner, fg, i * tread - 0.03, y - rise / 2 + 0.01, 0.55);
        /* 황동 계단 막대 */
        box(0.02, 0.02, 1.02, brass, fg, i * tread - 0.01, i * rise + 0.02, 0.55);
        /* 둥근 나무 난간동자 */
        lathe(turned, 5, darkWood, fg, u, y, zr);
      }
      /* 난간 손잡이: 아래 기둥 머리에서 위 기둥까지 둥근 관 */
      const rail = track(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0.05, 1.0, zr), new THREE.Vector3(run, topY + 0.86, zr)), 1, 0.04, 8));
      mesh(rail, darkWood, fg, 0, 0, 0);
      /* 아래·위 기둥(뉴얼) */
      lathe(newel, 10, darkWood, fg, -0.02, 0, zr);
      cyl(0.03, 0.03, 0.3, 6, brass, fg, -0.02, 1.36, zr);
      sphere(0.11, emissive(0xffe6b8, 1.4), fg, -0.02, 1.6, zr, 10, 8);
      lathe(newel, 10, darkWood, fg, run + 0.05, topY, zr);
      /* 꼭대기 쉼터: 벽까지 이어지는 바닥 + 짧은 난간 */
      box(0.4, 0.34, z1 - back, body, fg, run + 0.2, topY - 0.17, (z1 + back) / 2, 1);
      const r2 = cyl(0.04, 0.04, 0.4, 8, darkWood, fg, run + 0.2, topY + 0.86, zr);
      r2.rotation.z = Math.PI / 2;
      lathe(turned, 6, darkWood, fg, run + 0.3, topY, zr);
      k.blob(s * 3.6, 0.6, 4.4, 2.0, 0.42, g);
    }
    /* 회랑(계단참): 앞면 판벽 + 금띠 + 같은 모양 난간 */
    const zf = z0;
    box(11.18, 0.34, zf - back, body, g, 0, topY - 0.17, (zf + back) / 2, 2);
    box(11.2, 0.1, 0.03, gold, g, 0, topY - 0.24, zf + 0.015);
    box(11.18, 0.08, 0.06, body, g, 0, topY - 0.38, zf + 0.03);
    /* 계단참 아래를 판벽으로 막고, 가운데는 북쪽 문으로 가는 우묵한 통로 */
    /* 계단참 아래 칸막이: 대홀 징두리와 같은 참나무 판벽(돌 쌓기 무늬가 타일처럼 보이던 것을 바꿈) */
    const screenMat = std({ map: oakPanelTex(kit), roughness: 0.5 });
    for (const s of [-1, 1]) {
      const sw = 6 - 1.25;
      const cxs = s * (1.25 + sw / 2);
      const sp = plane(sw, topY - 0.34, screenMat, g, cxs, (topY - 0.34) / 2, zf - 0.02);
      uvx(sp.geometry, sw / 0.6, 1.6);
      const side = plane(zf - back, topY - 0.34, screenMat, g, s * 1.25, (topY - 0.34) / 2, (zf + back) / 2);
      side.rotation.y = -s * Math.PI / 2;
      /* 우묵한 통로 기둥(피어) */
      box(0.3, topY - 0.34, 0.3, body, g, s * 1.25, (topY - 0.34) / 2, zf, 1);
      box(0.4, 0.12, 0.4, gold, g, s * 1.25, topY - 0.4, zf);
    }
    const alcoveCeil = plane(2.5, zf - back, soffitMat, g, 0, topY - 0.341, (zf + back) / 2);
    alcoveCeil.rotation.x = Math.PI / 2;
    const zb = zf - 0.09;
    for (let x = -5.25; x <= 5.26; x += 0.35) lathe(turned, 5, darkWood, g, x, topY, zb);
    const lr = cyl(0.04, 0.04, 11.0, 8, darkWood, g, 0, topY + 0.86, zb);
    lr.rotation.z = Math.PI / 2;
    box(11.0, 0.05, 0.1, darkWood, g, 0, topY + 0.025, zb);
    for (const x of [-5.5, 0, 5.5]) lathe(newel, 10, darkWood, g, x, topY, zb);
  };

  B.chandelier = (g, p) => {
    const y = Number(p.opts?.y ?? 4);
    const s = Number(p.opts?.size ?? 1);
    cyl(0.015, 0.015, H - y - 0.6 * s, 5, gold, g, 0, (H + y + 0.6 * s) / 2, 0);
    lathe([[0.0, 0.9], [0.06, 0.85], [0.04, 0.6], [0.12, 0.4], [0.06, 0.2], [0.16, 0.05], [0.0, -0.1]].map(([r, yy]) => [r * s, yy * s] as [number, number]), 10, gold, g, 0, y - 0.1 * s, 0);
    for (const [rr, yy, n] of [[0.75, 0, 10], [0.45, 0.45, 6]] as [number, number, number][]) {
      const ring = mesh(track(new THREE.TorusGeometry(rr * s, 0.022 * s, 5, 24)), gold, g, 0, y + yy * s, 0);
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = Math.cos(a) * rr * s;
        const cz = Math.sin(a) * rr * s;
        cyl(0.035 * s, 0.025 * s, 0.03 * s, 8, gold, g, cx, y + yy * s + 0.02, cz);
        candle(g, cx, y + yy * s + 0.035, cz, 0.12 * s);
        const drop = mesh(track(new THREE.OctahedronGeometry(0.03 * s)), glass, g, cx, y + yy * s - 0.09 * s, cz);
        drop.scale.y = 1.8;
      }
    }
    sparkles(g, 14, 0.8 * s, y + 0.5 * s, 0.7 * s);
    halo(g, y + 0.2 * s, 3.2 * s, 0.7);
  };

  B.crystalChandelier = (g, p) => {
    const y = Number(p.opts?.y ?? 3.6);
    cyl(0.012, 0.012, H - y - 0.5, 5, gold, g, 0, (H + y + 0.5) / 2, 0);
    const crystal = std({ color: 0xffffff, roughness: 0.02, metalness: 0.4, transparent: true, opacity: 0.55 });
    for (let tier = 0; tier < 3; tier++) {
      const rr = 0.55 - tier * 0.15;
      const yy = y + tier * 0.22;
      const n = 16 - tier * 4;
      const ring = mesh(track(new THREE.TorusGeometry(rr, 0.012, 4, 24)), gold, g, 0, yy, 0);
      ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const dd = mesh(track(new THREE.OctahedronGeometry(0.025)), crystal, g, Math.cos(a) * rr, yy - 0.06, Math.sin(a) * rr);
        dd.scale.y = 2.2;
        if (i % 2 === 0 && tier < 2) candle(g, Math.cos(a) * rr, yy, Math.sin(a) * rr, 0.08);
      }
    }
    const drop = mesh(track(new THREE.OctahedronGeometry(0.07)), crystal, g, 0, y - 0.18, 0);
    drop.scale.y = 1.8;
    sparkles(g, 18, 0.6, y + 0.5, 0.7);
    halo(g, y + 0.2, 2.2, 0.55);
  };

  /* ---------- 1880~90년대 조명 ---------- */

  /* 오팔 유리 튤립 갓(안에서 빛나는 젖빛 유리) */
  const opal = emissive(0xfff0d6, 1.15);
  (opal as T.MeshStandardMaterial).transparent = true;
  (opal as T.MeshStandardMaterial).opacity = 0.92;
  const tulip: [number, number][] = [[0.02, 0], [0.05, 0.005], [0.075, 0.04], [0.085, 0.09], [0.08, 0.13], [0.07, 0.16], [0.075, 0.17], [0.0, 0.17]];

  /* 가솔리어(가스 샹들리에): 황동 관 줄기에 공 마디, 굽은 가스관 팔, 끝에 위로 향한 오팔 갓.
     1859년 무렵이면 영국 도시 집 대부분이 가스로 불을 밝혔습니다(PERIOD.md 참고). */
  B.gasolier = (g, p) => {
    const y = Number(p.opts?.y ?? 3.6);
    const s = Number(p.opts?.size ?? 1);
    const arms = Number(p.opts?.arms ?? 4);
    const crystal = !!p.opts?.crystal;
    const top = (room.ceiling === "barrelVault" ? wallH + room.size.w / 2 : H) - 0.02;
    /* 천장 받침(캐노피) + 줄기 */
    lathe([[0, 0], [0.12, 0], [0.1, -0.05], [0.04, -0.1], [0, -0.1]], 10, brass, g, 0, top, 0);
    const stemTop = top - 0.1;
    const stemBot = y + 0.12 * s;
    cyl(0.016 * s, 0.016 * s, stemTop - stemBot, 6, brass, g, 0, (stemTop + stemBot) / 2, 0);
    for (const f of [0.25, 0.6]) sphere(0.035 * s, brass, g, 0, stemBot + (stemTop - stemBot) * f, 0, 8, 6);
    /* 가운데 몸통(뒤집은 꽃병 모양) */
    lathe([[0, 0.24], [0.04, 0.22], [0.03, 0.14], [0.09, 0.06], [0.1, 0.0], [0.07, -0.06], [0.03, -0.1], [0.05, -0.16], [0, -0.2]].map(([r, yy]) => [r * s, yy * s] as [number, number]), 10, brass, g, 0, y, 0);
    sphere(0.04 * s, brass, g, 0, y - 0.22 * s, 0, 8, 6);
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + 0.3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const R = 0.46 * s;
      const pts = [
        new THREE.Vector3(ca * 0.06 * s, y + 0.02 * s, sa * 0.06 * s),
        new THREE.Vector3(ca * R * 0.45, y - 0.08 * s, sa * R * 0.45),
        new THREE.Vector3(ca * R * 0.9, y - 0.02 * s, sa * R * 0.9),
        new THREE.Vector3(ca * R, y + 0.1 * s, sa * R)
      ];
      mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.012 * s, 4)), brass, g);
      /* 가스 꼭지 + 갓 받침 + 오팔 갓 */
      sphere(0.018 * s, brass, g, ca * R * 0.55, y - 0.07 * s, sa * R * 0.55, 6, 4);
      lathe([[0, 0], [0.03, 0], [0.04, 0.03], [0, 0.03]].map(([r, yy]) => [r * s, yy * s] as [number, number]), 8, brass, g, ca * R, y + 0.1 * s, sa * R);
      lathe(tulip.map(([r, yy]) => [r * s * 1.2, yy * s * 1.2] as [number, number]), 8, opal, g, ca * R, y + 0.13 * s, sa * R);
      /* 갓 속 가스 불꽃(작게) */
      flameSprite(g, ca * R, y + 0.2 * s, sa * R, 0.06 * s);
      if (crystal) {
        for (let j = 0; j < 3; j++) {
          const dd = mesh(track(new THREE.OctahedronGeometry(0.022 * s)), glass, g, ca * R * (0.6 + j * 0.15), y - 0.12 * s - j * 0.01, sa * R * (0.6 + j * 0.15));
          dd.scale.y = 2;
        }
      }
    }
    if (crystal) sparkles(g, 10, 0.5 * s, y + 0.3 * s, 0.5 * s);
    halo(g, y + 0.18 * s, 2.6 * s, 0.6);
  };

  /* 일렉트롤리어(초기 전기 샹들리에): 황동 고리에 매달린 맨 전구(스완 램프, 1880 크래그사이드 서재) */
  B.electrolier = (g, p) => {
    const y = Number(p.opts?.y ?? 2.8);
    const s = Number(p.opts?.size ?? 0.8);
    lathe([[0, 0], [0.1, 0], [0.08, -0.04], [0, -0.06]], 10, brass, g, 0, H - 0.02, 0);
    cyl(0.012, 0.012, H - y - 0.1, 6, brass, g, 0, (H + y) / 2 - 0.04, 0);
    const ring = mesh(track(new THREE.TorusGeometry(0.42 * s, 0.018 * s, 5, 28)), brass, g, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
    const ring2 = mesh(track(new THREE.TorusGeometry(0.24 * s, 0.012 * s, 4, 20)), brass, g, 0, y + 0.18 * s, 0);
    ring2.rotation.x = Math.PI / 2;
    const bulb = emissive(0xfff2cc, 1.6);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * 0.42 * s;
      const z = Math.sin(a) * 0.42 * s;
      /* 고리에서 내려오는 꼰 전선(가는 관) + 놋쇠 소켓 + 배 모양 맨 전구(꼭지 있음) */
      const sus = cyl(0.004, 0.004, 0.36 * s, 3, brass, g, x * 0.75, y + 0.09 * s, z * 0.75);
      sus.rotation.z = Math.cos(a) * 0.5;
      sus.rotation.x = -Math.sin(a) * 0.5;
      cyl(0.016 * s, 0.014 * s, 0.05 * s, 6, brass, g, x, y - 0.04 * s, z);
      lathe([[0, 0], [0.016, -0.005], [0.035, -0.04], [0.04, -0.07], [0.03, -0.1], [0.008, -0.12], [0, -0.125]].map(([r, yy]) => [r * s * 1.3, yy * s * 1.3] as [number, number]), 8, bulb, g, x, y - 0.065 * s, z);
    }
    halo(g, y - 0.05, 2.4 * s, 0.7);
  };

  /* 칠보 꽃병 램프: 크래그사이드 서재에서 스완 전구를 꽂아 쓴 칠보(클루아조네) 꽃병처럼 */
  B.vaseLamp = (g, p) => {
    const y = Number(p.opts?.y ?? 0.94);
    const vTex = kit.canvas("cloisonne", 256, 256, cg => {
      cg.fillStyle = "#1e4a6a";
      cg.fillRect(0, 0, 256, 256);
      cg.strokeStyle = "#d8b85a";
      cg.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        cg.fillStyle = i % 3 === 0 ? "#c84a3a" : i % 3 === 1 ? "#e8d8a8" : "#3a8a6a";
        cg.beginPath();
        cg.arc(16 + i * 28, 128 + Math.sin(i) * 30, 12, 0, Math.PI * 2);
        cg.fill();
        cg.stroke();
      }
      cg.fillStyle = "#d8b85a";
      cg.fillRect(0, 20, 256, 6);
      cg.fillRect(0, 230, 256, 6);
    });
    const vase = std({ map: vTex, roughness: 0.2, metalness: 0.2 });
    lathe([[0, 0], [0.06, 0], [0.09, 0.05], [0.11, 0.14], [0.09, 0.24], [0.04, 0.3], [0.035, 0.36], [0.05, 0.38], [0, 0.38]], 14, vase, g, 0, y, 0);
    cyl(0.018, 0.018, 0.05, 6, brass, g, 0, y + 0.4, 0);
    lathe([[0, 0], [0.02, -0.005], [0.04, -0.04], [0.045, -0.075], [0.035, -0.11], [0.01, -0.13], [0, -0.135]].map(([r, yy]) => [r, -yy] as [number, number]), 8, emissive(0xfff2cc, 1.5), g, 0, y + 0.42, 0);
    halo(g, y + 0.5, 0.9, 0.55);
  };

  /* ---------- 현관: 홀 스탠드와 우산꽂이 ---------- */

  /* 조각한 참나무 홀 스탠드: 고딕 꼭대기, 가운데 거울, 놋쇠 옷걸이, 양쪽 우산 칸과 물받이, 가운데 장갑 서랍.
     틴츠필드의 블랑시 깁스가 제임스 플러크넷에게 주문한 참나무 홀 스탠드, V&A 의 콜브룩데일 주철 스탠드 참고. */
  B.hallStand = g => {
    const oak = std({ color: 0x7a5232, roughness: 0.5, map: (k.oakMat as T.MeshStandardMaterial).map });
    const W = 1.15;
    const Hh = 2.25;
    for (const sx of [-1, 1]) {
      box(0.07, Hh, 0.07, oak, g, sx * (W / 2 - 0.035), Hh / 2, -0.05);
      lathe([[0, 0], [0.05, 0], [0.05, 0.04], [0.02, 0.12], [0.03, 0.16], [0, 0.22]], 6, oak, g, sx * (W / 2 - 0.035), Hh, -0.05);
      /* 우산 칸: 고리 + 물받이(주철 접시) */
      box(0.32, 0.03, 0.03, oak, g, sx * (W / 2 - 0.2), 0.62, 0.12);
      mesh(track(new THREE.TorusGeometry(0.1, 0.015, 4, 12)), brass, g, sx * (W / 2 - 0.2), 0.62, 0.12).rotation.x = Math.PI / 2;
      lathe([[0, 0], [0.14, 0], [0.15, 0.04], [0.13, 0.04], [0, 0.02]], 12, std({ color: 0x2a2826, roughness: 0.4, metalness: 0.6 }), g, sx * (W / 2 - 0.2), 0.02, 0.12);
    }
    /* 뒤판 + 거울 + 거울 테 */
    box(W - 0.07, Hh - 0.5, 0.03, oak, g, 0, 0.5 + (Hh - 0.5) / 2, -0.07);
    const mirror = std({ color: 0xc8d0d4, roughness: 0.04, metalness: 0.95 });
    plane(0.62, 0.78, mirror, g, 0, 1.55, -0.052);
    for (const [bw, bh, x, yy] of [[0.72, 0.05, 0, 1.96], [0.72, 0.05, 0, 1.14], [0.05, 0.86, -0.34, 1.55], [0.05, 0.86, 0.34, 1.55]] as [number, number, number, number][]) box(bw, bh, 0.04, oak, g, x, yy, -0.04);
    /* 고딕 꼭대기: 뾰족 아치 박공 + 세 잎 구멍 */
    const gab = new THREE.Shape();
    gab.moveTo(-W / 2, 0);
    gab.lineTo(W / 2, 0);
    gab.lineTo(0, 0.38);
    gab.closePath();
    const trefoil = new THREE.Path();
    trefoil.absarc(0, 0.14, 0.07, 0, Math.PI * 2, true);
    gab.holes.push(trefoil);
    mesh(track(new THREE.ExtrudeGeometry(gab, { depth: 0.05, bevelEnabled: false, curveSegments: 8 })), oak, g, 0, Hh - 0.02, -0.09);
    /* 장갑 서랍이 달린 대(테이블) */
    box(W - 0.4, 0.06, 0.32, oak, g, 0, 0.86, 0.06);
    box(W - 0.44, 0.12, 0.28, oak, g, 0, 0.77, 0.06);
    sphere(0.018, brass, g, 0, 0.77, 0.21, 6, 4);
    /* 옷걸이 6개 + 걸린 모자 둘, 외투 하나 */
    for (const [x, yy] of [[-0.46, 1.95], [0.46, 1.95], [-0.46, 1.55], [0.46, 1.55], [-0.46, 1.15], [0.46, 1.15]]) {
      const hook = mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.0, 0.1), new THREE.Vector3(0, 0.05, 0.15)]), 4, 0.008, 3)), brass, g, x, yy, -0.04);
      void hook;
      sphere(0.014, brass, g, x, yy + 0.05, 0.11, 5, 4);
    }
    const felt = std({ color: 0x1e1a18, roughness: 0.85 });
    /* 실크해트 */
    cyl(0.085, 0.08, 0.16, 12, felt, g, -0.46, 2.1, 0.14);
    cyl(0.14, 0.14, 0.01, 14, felt, g, -0.46, 2.02, 0.14);
    /* 볼러(중산모) */
    sphere(0.09, std({ color: 0x3a2a1e, roughness: 0.8 }), g, 0.46, 1.68, 0.14, 10, 6).scale.y = 0.8;
    cyl(0.13, 0.13, 0.01, 14, std({ color: 0x3a2a1e, roughness: 0.8 }), g, 0.46, 1.62, 0.14);
    /* 외투: 걸이에서 늘어진 천 */
    const coat = velvetMat("#2a2e3a");
    const cg = track(new THREE.CylinderGeometry(0.1, 0.2, 0.9, 8, 1, true, 0, Math.PI));
    const cm = mesh(cg, coat, g, 0.46, 1.08, 0.1);
    cm.rotation.y = Math.PI;
    cm.scale.z = 0.5;
    /* 우산 한 자루와 지팡이 */
    const umb = std({ color: 0x1a1a22, roughness: 0.7 });
    const u1 = lathe([[0, 0], [0.04, 0.12], [0.05, 0.5], [0.02, 0.78], [0, 0.82]], 6, umb, g, -0.4, 0.04, 0.12);
    u1.rotation.z = 0.06;
    const cane = cyl(0.012, 0.012, 0.86, 5, std({ color: 0x5a3a20, roughness: 0.5 }), g, 0.4, 0.47, 0.12);
    cane.rotation.z = -0.08;
    sphere(0.025, brass, g, 0.37, 0.9, 0.12, 6, 4);
    k.blob(0, 0.05, 1.6, 0.8, 0.6, g);
  };

  /* 주철 우산꽂이(콜브룩데일풍): 잎 무늬 등판 + 고리 + 물받이 */
  B.umbrellaStand = g => {
    const iron = std({ color: 0x24282a, roughness: 0.45, metalness: 0.7 });
    lathe([[0, 0], [0.22, 0], [0.23, 0.05], [0.2, 0.05], [0, 0.03]], 14, iron, g, 0, 0, 0);
    for (const sx of [-1, 1]) cyl(0.014, 0.014, 0.7, 5, iron, g, sx * 0.18, 0.37, -0.12);
    mesh(track(new THREE.TorusGeometry(0.19, 0.014, 4, 14)), iron, g, 0, 0.6, 0).rotation.x = Math.PI / 2;
    const back = new THREE.Shape();
    back.moveTo(-0.2, 0);
    back.lineTo(0.2, 0);
    back.lineTo(0.2, 0.5);
    back.quadraticCurveTo(0.2, 0.75, 0, 0.82);
    back.quadraticCurveTo(-0.2, 0.75, -0.2, 0.5);
    back.closePath();
    for (const [hx, hy] of [[0, 0.55], [-0.1, 0.3], [0.1, 0.3]]) {
      const hp = new THREE.Path();
      hp.absellipse(hx, hy, 0.05, 0.09, 0, Math.PI * 2, true, 0);
      back.holes.push(hp);
    }
    mesh(track(new THREE.ExtrudeGeometry(back, { depth: 0.02, bevelEnabled: false, curveSegments: 6 })), iron, g, 0, 0.1, -0.16);
    const cols = [0x1a1a22, 0x3a1a1a, 0x1e2a1e];
    for (let i = 0; i < 3; i++) {
      const um = lathe([[0, 0], [0.035, 0.1], [0.045, 0.45], [0.018, 0.74], [0, 0.78]], 6, std({ color: cols[i], roughness: 0.7 }), g, -0.08 + i * 0.08, 0.04, 0.02 * i);
      um.rotation.z = (i - 1) * 0.12;
      um.rotation.x = -0.08;
      /* 갈고리 손잡이 */
      const hd = mesh(track(new THREE.TorusGeometry(0.035, 0.009, 4, 8, Math.PI)), std({ color: 0x6a4020, roughness: 0.5 }), g, -0.08 + i * 0.08 + (i - 1) * 0.1, 0.86, 0.02 * i - 0.05);
      hd.rotation.y = Math.PI / 2;
    }
    k.blob(0, 0, 0.7, 0.6, 0.6, g);
  };

  /* ---------- 에스테틱 운동 흑단 칠 장식장(고드윈 사이드보드풍) + 청화 자기 ---------- */
  B.aestheticCabinet = g => {
    const ebon = std({ color: 0x141012, roughness: 0.28, metalness: 0.05, physical: true, clearcoat: 0.6 });
    const giltLine = std({ color: 0xc9a24e, metalness: 1, roughness: 0.35 });
    const W = 1.6;
    /* 아래장: 가는 다리, 가죽 종이 판 문 두 짝 */
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.86, 0.05, ebon, g, sx * (W / 2 - 0.04), 0.43, sz * 0.2);
    box(W, 0.04, 0.48, ebon, g, 0, 0.86, 0);
    box(W - 0.1, 0.5, 0.42, ebon, g, 0, 0.55, 0);
    const panel = std({ map: leatherPaperTex(kit), roughness: 0.5, metalness: 0.2 });
    for (const sx of [-1, 1]) {
      const pp = plane(W / 2 - 0.18, 0.38, panel, g, sx * (W / 4 - 0.02), 0.55, 0.212);
      uvx(pp.geometry, 0.6, 0.4);
      for (const [bw, bh, x, yy] of [[W / 2 - 0.14, 0.012, 0, 0.2], [W / 2 - 0.14, 0.012, 0, -0.2], [0.012, 0.4, -(W / 4 - 0.08), 0], [0.012, 0.4, W / 4 - 0.08, 0]] as [number, number, number, number][]) box(bw, bh, 0.008, giltLine, g, sx * (W / 4 - 0.02) + x, 0.55 + yy, 0.218);
    }
    box(W - 0.1, 0.012, 0.01, giltLine, g, 0, 0.31, 0.215);
    /* 위 선반(거울 뒤판 + 가는 기둥 + 선반 두 단) = 오버맨틀처럼 청화 자기를 늘어놓는 자리 */
    const mirror = std({ color: 0xa8b0b4, roughness: 0.05, metalness: 0.9 });
    plane(W - 0.3, 0.9, mirror, g, 0, 1.38, -0.2);
    for (const x of [-W / 2 + 0.05, -0.25, 0.25, W / 2 - 0.05]) box(0.035, 1.0, 0.035, ebon, g, x, 1.38, -0.12);
    for (const yy of [1.14, 1.56, 1.9]) {
      box(W, 0.03, 0.22, ebon, g, 0, yy, -0.11);
      box(W, 0.008, 0.005, giltLine, g, 0, yy - 0.012, 0.0);
    }
    /* 일본풍 지붕 처마 */
    box(W + 0.12, 0.04, 0.3, ebon, g, 0, 1.94, -0.1);
    /* 청화 자기: 생강 단지, 접시(세움), 꽃병 */
    const bwTex = kit.canvas("blueWhite", 256, 256, cg => {
      cg.fillStyle = "#f4f2ea";
      cg.fillRect(0, 0, 256, 256);
      cg.fillStyle = "#24408a";
      for (let i = 0; i < 40; i++) {
        cg.beginPath();
        cg.arc((i * 53) % 256, (i * 37) % 256, 6 + (i % 4) * 3, 0, Math.PI * 2);
        cg.fill();
      }
      cg.strokeStyle = "#24408a";
      cg.lineWidth = 8;
      cg.strokeRect(10, 10, 236, 236);
      cg.beginPath();
      cg.arc(128, 128, 70, 0, Math.PI * 2);
      cg.stroke();
    });
    const bw = std({ map: bwTex, roughness: 0.12 });
    lathe([[0, 0], [0.07, 0], [0.1, 0.06], [0.1, 0.14], [0.06, 0.2], [0.05, 0.22], [0, 0.22]], 12, bw, g, -0.5, 0.88, 0.0);
    sphere(0.045, bw, g, -0.5, 1.12, 0, 8, 5).scale.y = 0.5;
    lathe([[0, 0], [0.05, 0], [0.08, 0.1], [0.06, 0.2], [0.03, 0.26], [0.04, 0.3], [0, 0.3]], 12, bw, g, 0.5, 0.88, 0.02);
    for (const [x, yy, r] of [[-0.45, 1.155, 0.14], [0.1, 1.155, 0.12], [-0.15, 1.575, 0.11], [0.45, 1.575, 0.13]] as [number, number, number][]) {
      const dish = mesh(track(new THREE.CircleGeometry(r, 18)), bw, g, x, yy + r, -0.17);
      dish.rotation.x = -0.15;
    }
    for (const x of [0.45, -0.55]) lathe([[0, 0], [0.04, 0], [0.06, 0.08], [0.03, 0.16], [0.035, 0.2], [0, 0.2]], 10, bw, g, x, 1.155, -0.05);
    /* 공작 깃털 꽂은 꽃병(에스테틱 운동의 상징) */
    const feather = std({ color: 0x2a6a5a, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const f = plane(0.05, 0.45, feather, g, 0.5 + (i - 1) * 0.03, 1.4, 0.02);
      f.rotation.z = (i - 1) * 0.25;
    }
    k.blob(0, 0, 1.9, 0.8, 0.6, g);
  };

  /* ---------- 온실 식물과 가구 ---------- */

  function potMaterial(kind: string) {
    if (kind === "terracotta") return std({ color: 0xb06040, roughness: 0.85 });
    /* 마졸리카(민턴 마졸리카처럼 짙은 초록·코발트 유약에 잎 돋을무늬) */
    const tex = kit.canvas("majolica", 256, 128, cg => {
      cg.fillStyle = "#2a5a4a";
      cg.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 8; i++) {
        cg.fillStyle = i % 2 ? "#3a7a5a" : "#c8a040";
        cg.beginPath();
        cg.ellipse(i * 32 + 16, 64, 12, 34, 0, 0, Math.PI * 2);
        cg.fill();
      }
      cg.fillStyle = "#1e3a6a";
      cg.fillRect(0, 0, 256, 16);
      cg.fillRect(0, 112, 256, 16);
      cg.fillStyle = "#e8c860";
      for (let x = 8; x < 256; x += 16) {
        cg.beginPath();
        cg.arc(x, 8, 3, 0, Math.PI * 2);
        cg.fill();
      }
    });
    return std({ map: tex, roughness: 0.18 });
  }

  /* 엽란(아스피디스트라): 빅토리아 응접실과 온실의 '무쇠 식물'. 긴 칼 모양 잎이 화분에서 솟습니다. */
  B.aspidistra = (g, p) => {
    const pot = potMaterial(String(p.opts?.pot ?? "terracotta"));
    lathe([[0, 0], [0.13, 0], [0.16, 0.06], [0.18, 0.28], [0.2, 0.3], [0, 0.3]], 12, pot, g);
    const leaf = std({ color: 0x2e5a2a, roughness: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const L = 0.5 + rnd() * 0.25;
      const lg = track(new THREE.PlaneGeometry(0.09, L, 1, 5));
      const pos = lg.getAttribute("position") as T.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const yy = pos.getY(v) + L / 2;
        const t = yy / L;
        const wdt = Math.sin(Math.min(1, t * 1.1) * Math.PI) * (t < 0.15 ? 0.25 : 1);
        pos.setXYZ(v, pos.getX(v) * wdt, yy, -0.25 * t * t * L);
      }
      lg.computeVertexNormals();
      const f = mesh(lg, leaf, g, 0, 0.28, 0);
      f.rotation.order = "YXZ";
      f.rotation.y = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      f.rotation.x = -0.15 - rnd() * 0.35;
    }
    k.blob(0, 0, 0.7, 0.7, 0.6, g);
  };

  /* 화분 선반(층층 나무 단): 테라코타 화분에 고사리와 작은 꽃 */
  B.plantStaging = g => {
    const wood = std({ color: 0xe8e2d4, roughness: 0.7 });
    const steps = [[0.3, 0.32], [0.62, 0.0], [0.94, -0.32]] as [number, number][];
    for (const [yy, zz] of steps) {
      box(2.2, 0.035, 0.3, wood, g, 0, yy, zz);
      for (const sx of [-1.05, 0, 1.05]) box(0.04, yy, 0.04, wood, g, sx, yy / 2, zz + 0.12);
    }
    const terra = std({ color: 0xb06040, roughness: 0.85 });
    const leaf = std({ color: 0x3e6a32, roughness: 0.7, side: THREE.DoubleSide });
    const bloom = [0xe8a0b0, 0xf4f0e0, 0xd86a5a].map(c => std({ color: c, roughness: 0.6 }));
    for (const [yy, zz] of steps) {
      for (let i = 0; i < 5; i++) {
        const x = -0.84 + i * 0.42;
        lathe([[0, 0], [0.07, 0], [0.09, 0.14], [0.1, 0.15], [0, 0.15]], 8, terra, g, x, yy + 0.02, zz);
        if ((i + Math.round(yy * 10)) % 2 === 0) {
          for (let j = 0; j < 6; j++) {
            const fr = plane(0.05, 0.28, leaf, g, x, yy + 0.3, zz);
            fr.rotation.set(0.5 + rnd() * 0.4, (j / 6) * Math.PI * 2, 0, "YXZ");
          }
        } else {
          sphere(0.1, leaf, g, x, yy + 0.24, zz, 7, 5);
          for (let j = 0; j < 4; j++) sphere(0.028, bloom[(i + j) % 3], g, x + (rnd() - 0.5) * 0.14, yy + 0.3 + rnd() * 0.04, zz + (rnd() - 0.5) * 0.14, 5, 4);
        }
      }
    }
    k.blob(0, 0, 2.6, 1.2, 0.5, g);
  };

  /* 벤트우드 의자(토넷 14번, 1859~): 쪄서 굽힌 너도밤나무 등받이 고리 + 등나무 엮은 둥근 자리 */
  B.bentwoodChair = g => {
    const beech = std({ color: 0x4a2e1c, roughness: 0.4 });
    const cane = kit.canvas("caneSeat", 128, 128, cg => {
      cg.fillStyle = "#d8c08a";
      cg.fillRect(0, 0, 128, 128);
      cg.strokeStyle = "rgba(120,90,40,0.55)";
      cg.lineWidth = 2;
      for (let i = -128; i < 256; i += 8) {
        cg.beginPath();
        cg.moveTo(i, 0);
        cg.lineTo(i + 128, 128);
        cg.moveTo(i + 128, 0);
        cg.lineTo(i, 128);
        cg.moveTo(i, 0);
        cg.lineTo(i, 128);
        cg.stroke();
      }
    });
    const seatY = 0.46;
    mesh(track(new THREE.TorusGeometry(0.2, 0.018, 5, 18)), beech, g, 0, seatY, 0).rotation.x = Math.PI / 2;
    const seat = mesh(track(new THREE.CircleGeometry(0.2, 18)), std({ map: cane, roughness: 0.8, side: THREE.DoubleSide }), g, 0, seatY + 0.005, 0);
    seat.rotation.x = -Math.PI / 2;
    /* 다리 넷(뒷다리는 등받이까지 한 줄기로 굽어 올라감) */
    for (const [x, z] of [[-0.15, 0.13], [0.15, 0.13]]) {
      const l = cyl(0.015, 0.012, seatY, 6, beech, g, x * 1.1, seatY / 2, z * 1.15);
      l.rotation.x = 0.06;
    }
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.17, 0, -0.2),
        new THREE.Vector3(sx * 0.16, seatY, -0.16),
        new THREE.Vector3(sx * 0.15, 0.7, -0.2),
        new THREE.Vector3(sx * 0.13, 0.86, -0.22)
      ]);
      mesh(track(new THREE.TubeGeometry(curve, 8, 0.015, 5)), beech, g);
    }
    /* 등받이 고리 + 안쪽 작은 고리 + 다리 고리 */
    const hoop = mesh(track(new THREE.TorusGeometry(0.15, 0.013, 4, 16, Math.PI)), beech, g, 0, 0.72, -0.21);
    hoop.scale.y = 1.0;
    const inner = mesh(track(new THREE.TorusGeometry(0.1, 0.01, 4, 14, Math.PI)), beech, g, 0, 0.6, -0.19);
    inner.rotation.z = Math.PI;
    mesh(track(new THREE.TorusGeometry(0.17, 0.01, 4, 16)), beech, g, 0, 0.2, 0).rotation.x = Math.PI / 2;
    k.blob(0, 0, 0.7, 0.7, 0.55, g);
  };

  B.crest = (g, p) => {
    const y = Number(p.opts?.y ?? 5);
    const tex = kit.canvas("crest", 512, 640, cg => {
      cg.translate(256, 300);
      const shield = () => {
        cg.beginPath();
        cg.moveTo(-180, -200);
        cg.lineTo(180, -200);
        cg.lineTo(180, 20);
        cg.quadraticCurveTo(170, 180, 0, 260);
        cg.quadraticCurveTo(-170, 180, -180, 20);
        cg.closePath();
      };
      shield();
      cg.save();
      cg.clip();
      cg.fillStyle = "#7a1f2b";
      cg.fillRect(-200, -220, 200, 240);
      cg.fillRect(0, 20, 200, 260);
      cg.fillStyle = "#1f2a44";
      cg.fillRect(0, -220, 200, 240);
      cg.fillRect(-200, 20, 200, 260);
      cg.fillStyle = "#c2a15a";
      cg.beginPath();
      cg.moveTo(-200, 120);
      cg.lineTo(0, -40);
      cg.lineTo(200, 120);
      cg.lineTo(200, 170);
      cg.lineTo(0, 10);
      cg.lineTo(-200, 170);
      cg.fill();
      const star = (sx: number, sy: number, r: number) => {
        cg.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.45;
          cg.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
        }
        cg.fill();
      };
      cg.fillStyle = "#e9d69a";
      star(-90, -110, 38);
      star(90, -110, 38);
      star(0, 150, 42);
      cg.restore();
      shield();
      cg.lineWidth = 12;
      cg.strokeStyle = "#c2a15a";
      cg.stroke();
      cg.fillStyle = "#c2a15a";
      cg.beginPath();
      cg.moveTo(-110, -230);
      cg.lineTo(-120, -290);
      cg.lineTo(-60, -255);
      cg.lineTo(0, -300);
      cg.lineTo(60, -255);
      cg.lineTo(120, -290);
      cg.lineTo(110, -230);
      cg.closePath();
      cg.fill();
      for (const x of [-120, 0, 120]) {
        cg.beginPath();
        cg.arc(x, x === 0 ? -300 : -290, 12, 0, Math.PI * 2);
        cg.fill();
      }
      cg.fillStyle = "#f3ead6";
      cg.fillRect(-230, 270, 460, 54);
      cg.strokeStyle = "#c2a15a";
      cg.lineWidth = 4;
      cg.strokeRect(-230, 270, 460, 54);
      cg.fillStyle = "#3a2410";
      cg.font = `600 34px ${SERIF}`;
      cg.textAlign = "center";
      cg.fillText("SEMPER HOSPITES", 0, 308);
    }, { repeat: false });
    const m = std({ map: tex, transparent: true, alphaTest: 0.1, roughness: 0.4, metalness: 0.2 });
    plane(1.5, 1.875, m, g, 0, y, 0.02);
  };

  B.longcaseClock = g => {
    box(0.6, 0.4, 0.36, darkWood, g, 0, 0.2, 0, 0.8);
    box(0.46, 1.25, 0.28, darkWood, g, 0, 1.02, 0, 0.8);
    box(0.3, 0.9, 0.02, walnut, g, 0, 1.02, 0.15);
    box(0.62, 0.62, 0.38, darkWood, g, 0, 1.95, 0, 0.8);
    const arch = mesh(track(new THREE.CylinderGeometry(0.31, 0.31, 0.38, 14, 1, false, -Math.PI / 2, Math.PI)), darkWood, g, 0, 2.26, 0);
    arch.rotation.x = Math.PI / 2;
    arch.rotation.z = Math.PI / 2;
    for (const x of [-0.26, 0, 0.26]) sphere(0.04, gold, g, x, x === 0 ? 2.6 : 2.32, 0.05, 8, 6);
    const dial = kit.canvas("clockface", 256, 256, cg => {
      cg.fillStyle = "#f4ead2";
      cg.fillRect(0, 0, 256, 256);
      cg.translate(128, 128);
      cg.strokeStyle = "#3a2a1a";
      cg.lineWidth = 3;
      cg.beginPath();
      cg.arc(0, 0, 112, 0, Math.PI * 2);
      cg.stroke();
      cg.fillStyle = "#2a1c10";
      cg.font = `600 26px ${SERIF}`;
      cg.textAlign = "center";
      cg.textBaseline = "middle";
      const rn = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
      rn.forEach((n, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        cg.fillText(n, Math.cos(a) * 88, Math.sin(a) * 88);
      });
      const now = new Date();
      const hh = ((now.getHours() % 12) + now.getMinutes() / 60) / 12;
      const mm = now.getMinutes() / 60;
      for (const [v, len, wdt] of [[hh, 50, 6], [mm, 76, 3]] as [number, number, number][]) {
        const a = v * Math.PI * 2 - Math.PI / 2;
        cg.lineWidth = wdt;
        cg.beginPath();
        cg.moveTo(0, 0);
        cg.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        cg.stroke();
      }
    }, { repeat: false });
    plane(0.44, 0.44, basic({ map: dial }), g, 0, 1.97, 0.195);
    box(0.5, 0.03, 0.03, gold, g, 0, 2.2, 0.2);
    k.blob(0, 0.05, 0.9, 0.6, 0.7, g);
  };

  B.bust = g => {
    box(0.46, 0.12, 0.46, marble, g, 0, 0.06, 0);
    box(0.36, 0.95, 0.36, marble, g, 0, 0.59, 0, 0.8);
    box(0.46, 0.1, 0.46, marble, g, 0, 1.11, 0);
    const white = std({ color: 0xf6f3ec, roughness: 0.35 });
    lathe([[0.0, 0], [0.12, 0], [0.1, 0.06], [0.22, 0.14], [0.24, 0.24], [0.16, 0.34], [0.06, 0.38], [0.0, 0.38]], 14, white, g, 0, 1.16, 0).scale.z = 0.6;
    cyl(0.05, 0.055, 0.12, 8, white, g, 0, 1.6, 0);
    const head = sphere(0.11, white, g, 0, 1.73, 0.01, 10, 8);
    head.scale.set(0.9, 1.15, 1);
    sphere(0.115, white, g, 0, 1.79, -0.02, 10, 6).scale.set(0.95, 0.75, 1);
    k.blob(0, 0, 0.8, 0.8, 0.6, g);
  };

  B.niche = g => {
    mesh(track(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 14, 1, true, Math.PI / 2, Math.PI)), std({ color: 0xbfae92, roughness: 0.9, side: THREE.BackSide }), g, 0, 1.9, 0);
    mesh(track(new THREE.SphereGeometry(0.6, 14, 6, Math.PI / 2, Math.PI, 0, Math.PI / 2)), std({ color: 0xcdbb9c, roughness: 0.9, side: THREE.BackSide }), g, 0, 3.0, 0);
    box(1.4, 0.12, 0.3, marble, g, 0, 0.8, 0.12);
    lathe([[0.0, 0], [0.12, 0], [0.09, 0.08], [0.2, 0.3], [0.22, 0.45], [0.12, 0.6], [0.16, 0.66], [0.0, 0.66]], 14, std({ color: 0xf3efe8, roughness: 0.3 }), g, 0, 0.86, 0.12);
  };

  B.smallDesk = g => {
    box(1.1, 0.04, 0.55, walnut, g, 0, 0.76, 0, 0.8);
    box(1.04, 0.12, 0.5, walnut, g, 0, 0.68, 0, 0.8);
    box(0.3, 0.02, 0.02, brass, g, 0, 0.68, 0.26);
    cabrioles(g, 0.47, 0.2, 0.62, 0.026, walnut);
    shell(g, 0, 0.66, 0.252, 0.06, gold);
    box(0.24, 0.04, 0.3, std({ color: 0x6a1f22, roughness: 0.6 }), g, -0.2, 0.8, 0.02);
    cyl(0.03, 0.035, 0.05, 8, std({ color: 0x1a1a1a, roughness: 0.2 }), g, 0.32, 0.805, -0.1);
    k.blob(0, 0, 1.4, 0.8, 0.6, g);
  };

  B.windowChair = g => {
    const fabric = velvetMat("#cdb79a");
    box(0.56, 0.12, 0.52, fabric, g, 0, 0.46, 0);
    box(0.56, 0.6, 0.1, fabric, g, 0, 0.82, -0.23);
    box(0.6, 0.04, 0.12, walnut, g, 0, 1.13, -0.23);
    cabrioles(g, 0.22, 0.2, 0.4, 0.022, walnut);
    box(0.58, 0.05, 0.54, walnut, g, 0, 0.395, 0);
    k.blob(0, 0, 0.9, 0.9, 0.6, g);
  };

  B.consoleTable = g => {
    box(1.3, 0.05, 0.45, marble, g, 0, 0.88, 0);
    box(1.24, 0.12, 0.4, gold, g, 0, 0.8, 0);
    cabrioles(g, 0.54, 0.14, 0.74, 0.03, gold);
    shell(g, 0, 0.78, 0.205, 0.09, gold);
    /* 다리 사이 가로대와 가운데 꽃병 받침 */
    box(1.0, 0.02, 0.02, gold, g, 0, 0.16, 0);
    lathe([[0, 0], [0.08, 0], [0.12, 0.12], [0.1, 0.3], [0.06, 0.38], [0.09, 0.42], [0, 0.42]], 12, std({ color: 0x2c4a7a, roughness: 0.2 }), g, 0, 0.9, 0);
    const flowers = std({ color: 0xe8b8b8, roughness: 0.8 });
    const white = std({ color: 0xf2eee0, roughness: 0.8 });
    for (let i = 0; i < 6; i++) sphere(0.07, i % 2 ? flowers : white, g, (rnd() - 0.5) * 0.25, 1.4 + rnd() * 0.15, (rnd() - 0.5) * 0.2, 7, 5);
    k.blob(0, 0, 1.5, 0.7, 0.5, g);
  };

  B.sideTable = g => {
    lathe([[0, 0], [0.2, 0], [0.2, 0.03], [0.05, 0.08], [0.04, 0.5], [0.06, 0.6], [0.3, 0.64], [0.3, 0.68], [0, 0.68]], 14, walnut, g);
    lathe([[0, 0], [0.06, 0], [0.07, 0.1], [0.03, 0.28], [0, 0.28]], 10, brass, g, 0, 0.68, 0);
    lathe([[0.16, 0], [0.09, 0.18], [0, 0.18]], 12, emissive(0xf5e2c0, 0.6), g, 0, 0.96, 0);
    k.blob(0, 0, 0.8, 0.8, 0.6, g);
  };

  function spineMaterial() {
    const spines = kit.canvas("spines", 1024, 128, cg => {
      let x = 0;
      const cols = ["#5a1a18", "#1f3a2a", "#2a2440", "#6a4a24", "#3a2a1a", "#7a2a20", "#28403a", "#4a3a5a", "#8a6a3a", "#1a1a1a"];
      const r2 = mulberry(5);
      while (x < 1024) {
        const bw = 14 + r2() * 26;
        const bh = 90 + r2() * 38;
        cg.fillStyle = cols[Math.floor(r2() * cols.length)];
        cg.fillRect(x, 128 - bh, bw - 1.5, bh);
        cg.fillStyle = "rgba(220,180,90,0.8)";
        cg.fillRect(x + 2, 128 - bh + 10, bw - 5, 3);
        cg.fillRect(x + 2, 128 - bh + 18, bw - 5, 2);
        cg.fillRect(x + 2, 116, bw - 5, 2);
        cg.fillStyle = "rgba(0,0,0,0.25)";
        cg.fillRect(x + bw - 4, 128 - bh, 2.5, bh);
        x += bw;
      }
      const grd = cg.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, "rgba(0,0,0,0.55)");
      grd.addColorStop(0.35, "rgba(0,0,0,0)");
      cg.fillStyle = grd;
      cg.fillRect(0, 0, 1024, 128);
    });
    return std({ map: spines, roughness: 0.75 });
  }

  /* 고딕 리바이벌(이스트레이크) 책장: 참나무, 칸 위 뾰족 아치 테, 기둥에 모접기와 새김선 */
  let gothicShelf = false;
  const oakDark = std({ color: 0x6a4428, roughness: 0.5, map: (k.oakMat as T.MeshStandardMaterial).map });
  /* 책장 한 칸(바닥 수납장 + 선반 + 책등 띠). 앞면 +z. */
  function shelfSection(parent: T.Object3D, cx: number, sw: number, top: number, dpt: number, spineMat: T.Material) {
    const wd = gothicShelf || room.id === "library" ? oakDark : walnut;
    box(0.05, top, dpt, wd, parent, cx - sw / 2, top / 2, 0, 0.8);
    box(0.05, top, dpt, wd, parent, cx + sw / 2, top / 2, 0, 0.8);
    box(sw, top, 0.02, darkWood, parent, cx, top / 2, -dpt / 2 + 0.01);
    box(sw, 0.7, dpt, wd, parent, cx, 0.35, 0.0, 0.8);
    box(sw - 0.16, 0.5, 0.02, darkWood, parent, cx, 0.36, dpt / 2 + 0.005);
    if (gothicShelf || room.id === "library") {
      /* 수납장 문: 뾰족 아치 판(두 짝) + 놋쇠 손잡이 */
      for (const sx of [-1, 1]) {
        const pw = sw / 2 - 0.1;
        const arch = new THREE.Shape();
        arch.moveTo(-pw / 2, 0);
        arch.lineTo(pw / 2, 0);
        arch.lineTo(pw / 2, 0.3);
        arch.quadraticCurveTo(pw / 2, 0.4, 0, 0.44);
        arch.quadraticCurveTo(-pw / 2, 0.4, -pw / 2, 0.3);
        arch.closePath();
        mesh(track(new THREE.ExtrudeGeometry(arch, { depth: 0.012, bevelEnabled: false, curveSegments: 3 })), wd, parent, cx + sx * (sw / 4), 0.12, dpt / 2 + 0.006);
        sphere(0.012, brass, parent, cx + sx * 0.04, 0.4, dpt / 2 + 0.03, 5, 4);
      }
      /* 기둥 앞 새김선 + 꼭대기 아치 테(칸마다) */
      for (const sx of [-1, 1]) box(0.01, top - 0.9, 0.006, darkWood, parent, cx + sx * (sw / 2), 0.8 + (top - 0.9) / 2, dpt / 2 + 0.003);
      const ah = 0.22;
      const tr = new THREE.Shape();
      tr.moveTo(-sw / 2, 0);
      tr.lineTo(sw / 2, 0);
      tr.lineTo(sw / 2, ah);
      tr.lineTo(-sw / 2, ah);
      tr.closePath();
      const hole = new THREE.Path();
      const hw = sw / 2 - 0.06;
      hole.moveTo(-hw, 0);
      hole.quadraticCurveTo(-hw, ah * 0.75, 0, ah * 0.85);
      hole.quadraticCurveTo(hw, ah * 0.75, hw, 0);
      hole.closePath();
      tr.holes.push(hole);
      mesh(track(new THREE.ExtrudeGeometry(tr, { depth: 0.025, bevelEnabled: false, curveSegments: 5 })), wd, parent, cx, top - 0.09 - ah, dpt / 2 - 0.02);
    }
    for (let y = 0.74; y < top - 0.3; y += 0.38) {
      box(sw, 0.03, dpt, wd, parent, cx, y, 0);
      const row = plane(sw - 0.05, 0.33, spineMat, parent, cx, y + 0.18, -dpt / 2 + 0.12);
      uvx(row.geometry, (sw - 0.05) / 2.4, 1, 0, rnd(), 0);
    }
  }

  B.bookshelves = (g, p) => {
    gothicShelf = !!p.opts?.gothic;
    const len = Number(p.opts?.len ?? 4);
    const gap = Number(p.opts?.gap ?? 0);
    const secretAt = p.opts?.secretAt !== undefined ? Number(p.opts.secretAt) : null;
    const top = wallH - 0.05;
    const dpt = 0.42;
    const spineMat = spineMaterial();
    const n = Math.round(len / 0.95);
    const sw = len / n;
    const centers = Array.from({ length: n }, (_, i) => -len / 2 + sw * (i + 0.5));
    const inGap = (cx: number) => gap > 0 && Math.abs(cx) < gap / 2 + sw / 2 - 0.01;
    const skipped = centers.filter(inGap);
    if (skipped.length > 0) {
      const cw = skipped.length * sw;
      const mid = skipped.reduce((a, c) => a + c, 0) / skipped.length;
      box(cw, 0.9, dpt, walnut, g, mid, 0.45, 0, 0.8);
      box(cw + 0.06, 0.04, dpt + 0.04, marble, g, mid, 0.92, 0.01);
    }
    for (let i = 0; i < n; i++) {
      const cx = centers[i];
      if (inGap(cx)) continue;
      if (secretAt !== null && Math.abs(cx - secretAt) < sw / 2) continue;
      shelfSection(g, cx, sw, top, dpt, spineMat);
    }
    box(len + 0.1, 0.14, dpt + 0.08, gothicShelf ? oakDark : walnut, g, 0, top - 0.02, 0.02, 1);
    if (gothicShelf) {
      /* 고딕 꼭대기: 톱니(크레넬레이션) 대신 작은 사엽 띠 + 선반 위 가는 몰딩 */
      for (let x = -len / 2 + 0.12; x < len / 2 - 0.05; x += 0.24) box(0.12, 0.08, 0.05, oakDark, g, x, top + 0.09, dpt / 2 + 0.03);
      box(len + 0.1, 0.02, 0.02, oakDark, g, 0, top - 0.1, dpt / 2 + 0.06);
    } else box(len + 0.1, 0.03, 0.03, gold, g, 0, top - 0.1, dpt / 2 + 0.06);
    box(len, 0.025, 0.025, brass, g, 0, top - 0.5, dpt / 2 + 0.1);
    gothicShelf = false;
  };

  B.secretShelf = g => {
    const top = wallH - 0.05;
    const dpt = 0.42;
    const sw = 0.95;
    /* 숨은 통로: 책장이 열리면 보이는 보랏빛 문간 */
    const passTex = radialTexture(kit, "passage", "rgba(255,226,180,1)", "rgba(120,60,130,1)");
    const pass = plane(sw - 0.04, top - 0.1, basic({ map: passTex }), g, 0, (top - 0.1) / 2, -dpt / 2 + 0.004);
    void pass;
    /* 경첩은 오른쪽 끝(카메라 쪽에서 틈이 보이게). 처음에는 닫혀 있고, 빨간 책을 누르면 돌아 열립니다. */
    const hinge = new THREE.Group();
    hinge.position.set(sw / 2, 0, dpt / 2);
    g.add(hinge);
    const inner = new THREE.Group();
    inner.position.set(-sw / 2, 0, -dpt / 2);
    hinge.add(inner);
    shelfSection(inner, 0, sw, top, dpt, spineMaterial());
    const red = std({ color: 0x9a1a22, roughness: 0.5 });
    const bookY = 0.74 + 0.38 * 2 + 0.17;
    const bookG = new THREE.Group();
    inner.add(bookG);
    const b = box(0.05, 0.3, 0.26, red, bookG, 0.18, bookY, 0.12);
    b.rotation.x = -0.18;
    box(0.052, 0.02, 0.2, gold, bookG, 0.18, bookY + 0.07, 0.13);
    /* 누르기 쉽게 책 둘레에 보이지 않는 판 */
    plane(0.34, 0.5, basic({ transparent: true, opacity: 0, depthWrite: false }), bookG, 0.18, bookY, dpt / 2 + 0.02);
    const glowTex = radialTexture(kit, "violet", "rgba(220,170,255,0.85)", "rgba(220,170,255,0)");
    const glowM = basic({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 });
    const gl = plane(0.35, top * 0.9, glowM, g, sw / 2 + 0.02, top / 2, 0.24);
    gl.renderOrder = 4;
    let open = 0;
    animators.push(t => {
      glowM.opacity = 0.32 + Math.sin(t * 1.3) * 0.14 + open * 0.5;
    });
    k.hooks.openSecret = u => {
      open = u;
      hinge.rotation.y = u * 1.35;
    };
    setHit(bookG, { type: "door", to: "secret", reveal: true });
  };

  /* ---------- 박물관 진열장(유리 상자 + 이름표 카드) ---------- */
  function itemTexture(key: string, draw: (g: CanvasRenderingContext2D) => void) {
    return kit.canvas(`item:${key}`, 256, 256, draw, { repeat: false });
  }
  B.vitrine = (g, p) => {
    const wide = !!p.opts?.wide;
    const W = wide ? 1.2 : 0.86;
    const D = 0.6;
    const baseH = 0.86;
    const caseH = 0.62;
    const mah = std({ color: 0x5a2416, roughness: 0.38, map: kit.texture(`${TEX}dark_paneled_wood_diff.webp`) });
    /* 받침장: 걸레받이, 패널 두 칸, 위 몰딩 */
    box(W + 0.08, 0.1, D + 0.08, mah, g, 0, 0.05, 0);
    box(W, baseH - 0.14, D, mah, g, 0, 0.1 + (baseH - 0.14) / 2, 0, 0.8);
    for (const sx of wide ? [-0.3, 0.3] : [0]) {
      box(wide ? 0.5 : 0.62, 0.42, 0.012, mah, g, sx, 0.46, D / 2 + 0.006);
      for (const [bw, bh, ox, oy] of [[wide ? 0.52 : 0.64, 0.014, 0, 0.21], [wide ? 0.52 : 0.64, 0.014, 0, -0.21], [0.014, 0.43, (wide ? 0.26 : 0.32), 0], [0.014, 0.43, -(wide ? 0.26 : 0.32), 0]] as [number, number, number, number][]) {
        box(bw, bh, 0.012, gold, g, sx + ox, 0.46 + oy, D / 2 + 0.014);
      }
    }
    box(W + 0.06, 0.04, D + 0.06, mah, g, 0, baseH - 0.02, 0);
    /* 진열판(베이즈 천) */
    const baize = std({ color: 0x23302a, roughness: 0.95 });
    box(W - 0.04, 0.012, D - 0.04, baize, g, 0, baseH + 0.006, 0);
    /* 유리 상자 + 황동 테 */
    const y0 = baseH;
    const gb = box(W - 0.02, caseH, D - 0.02, glass, g, 0, y0 + caseH / 2, 0);
    gb.renderOrder = 3;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.018, caseH, 0.018, brass, g, (x * (W - 0.02)) / 2, y0 + caseH / 2, (z * (D - 0.02)) / 2);
    for (const z of [-1, 1]) box(W, 0.018, 0.018, brass, g, 0, y0 + caseH, (z * (D - 0.02)) / 2);
    for (const x of [-1, 1]) box(0.018, 0.018, D, brass, g, (x * (W - 0.02)) / 2, y0 + caseH, 0);
    /* 안을 비추는 작은 빛: 위 판 + 진열판 위 빛웅덩이 */
    const poolTex = radialTexture(kit, "vpool", "rgba(255,236,200,0.9)", "rgba(255,236,200,0)");
    const pool = plane(W * 0.9, D * 0.9, basic({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }), g, 0, y0 + 0.014, 0);
    pool.rotation.x = -Math.PI / 2;
    const it = new THREE.Group();
    it.position.set(0, y0 + 0.012, -0.02);
    g.add(it);
    const item = String(p.opts?.item ?? "keys");
    const pearl = std({ color: 0xf4efe6, roughness: 0.25 });
    if (item === "keys") {
      mesh(track(new THREE.TorusGeometry(0.07, 0.006, 5, 18)), brass, it, 0, 0.012, 0).rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const kg = new THREE.Group();
        kg.position.set(Math.cos(i * 1.4) * 0.07, 0.012, Math.sin(i * 1.4) * 0.07);
        kg.rotation.y = -i * 1.4 + 0.3;
        it.add(kg);
        mesh(track(new THREE.TorusGeometry(0.022, 0.005, 4, 10)), brass, kg, 0.03, 0, 0).rotation.x = Math.PI / 2;
        box(0.12, 0.008, 0.008, brass, kg, 0.11, 0, 0);
        box(0.02, 0.006, 0.03, brass, kg, 0.16, 0, 0.012);
      }
    } else if (item === "album") {
      const leather = std({ color: 0x5a1a14, roughness: 0.5 });
      const book = box(0.34, 0.04, 0.26, leather, it, -0.08, 0.02, 0);
      book.rotation.y = 0.2;
      box(0.3, 0.004, 0.22, std({ color: 0xefe6cf, roughness: 0.9 }), it, -0.08, 0.042, 0).rotation.y = 0.2;
      box(0.08, 0.06, 0.004, std({ color: 0xf6f0e0, roughness: 0.9 }), it, -0.1, 0.075, 0.02).rotation.x = -0.6;
      lathe([[0, 0], [0.025, 0], [0.02, 0.02], [0.012, 0.09], [0.022, 0.11], [0, 0.12]], 10, walnut, it, 0.2, 0, 0.02);
      cyl(0.026, 0.026, 0.008, 12, std({ color: 0x9a1a1a, roughness: 0.5 }), it, 0.2, 0.004, 0.11);
    } else if (item === "manuscript") {
      const pageTex = itemTexture("ms", c => {
        c.fillStyle = "#efe2c2";
        c.fillRect(0, 0, 256, 256);
        c.fillStyle = "#b8862a";
        c.fillRect(18, 22, 40, 44);
        c.fillStyle = "#2a3a8a";
        c.fillRect(24, 28, 28, 32);
        c.fillStyle = "#3a2a1a";
        for (let y = 26; y < 236; y += 12) c.fillRect(y < 70 ? 66 : 18, y, y < 70 ? 92 : 104, 3);
        for (let y = 26; y < 236; y += 12) c.fillRect(138, y, 100, 3);
        c.fillStyle = "#9a1a1a";
        c.fillRect(138, 120, 30, 26);
        c.strokeStyle = "#b8862a";
        c.lineWidth = 4;
        c.strokeRect(6, 6, 244, 244);
      });
      const cushion = velvetMat("#5a1a2a");
      box(0.42, 0.05, 0.3, cushion, it, 0, 0.025, 0);
      for (const sx of [-1, 1]) {
        const pg = plane(0.18, 0.24, std({ map: pageTex, roughness: 0.9 }), it, sx * 0.095, 0.064, 0);
        pg.rotation.set(-Math.PI / 2, sx * 0.12, 0);
      }
      box(0.4, 0.02, 0.26, std({ color: 0x4a2a14, roughness: 0.6 }), it, 0, 0.052, 0);
    } else if (item === "teaset") {
      const jasper = std({ color: 0x8aa2c8, roughness: 0.6 });
      lathe([[0, 0], [0.05, 0], [0.08, 0.04], [0.08, 0.1], [0.05, 0.14], [0.02, 0.16], [0.03, 0.18], [0, 0.19]], 12, jasper, it, -0.12, 0, 0);
      cyl(0.006, 0.012, 0.09, 6, jasper, it, -0.02, 0.09, 0).rotation.z = -0.9;
      for (const [x, z] of [[0.1, -0.08], [0.18, 0.08]]) {
        cyl(0.05, 0.045, 0.006, 12, pearl, it, x, 0.003, z);
        lathe([[0, 0], [0.022, 0], [0.036, 0.04], [0.038, 0.05], [0, 0.05]], 10, jasper, it, x, 0.006, z);
      }
      for (let i = 0; i < 6; i++) sphere(0.009, pearl, it, -0.12 + Math.cos(i) * 0.08, 0.07, Math.sin(i) * 0.08, 4, 3);
    } else if (item === "violin") {
      const varnish = std({ color: 0x9a4a1a, roughness: 0.25, clearcoat: 0.6, physical: true });
      const vg = new THREE.Group();
      vg.position.set(0, 0.1, 0);
      vg.rotation.set(-1.2, 0.4, 0);
      it.add(vg);
      sphere(0.1, varnish, vg, 0, -0.08, 0, 12, 8).scale.set(1, 1, 0.22);
      sphere(0.085, varnish, vg, 0, 0.08, 0, 12, 8).scale.set(1, 1.05, 0.22);
      box(0.03, 0.26, 0.02, k.blackGloss, vg, 0, 0.26, 0.012);
      sphere(0.02, varnish, vg, 0, 0.4, 0, 6, 4);
      for (const sx of [-1, 1]) box(0.006, 0.05, 0.004, k.blackGloss, vg, sx * 0.04, 0, 0.024);
      const bow = cyl(0.004, 0.004, 0.62, 4, walnut, it, 0.05, 0.02, 0.18);
      bow.rotation.z = Math.PI / 2;
      bow.rotation.y = 0.2;
    } else if (item === "fern") {
      lathe([[0, 0], [0.12, 0], [0.14, 0.12], [0, 0.12]], 12, std({ color: 0x8a4a2a, roughness: 0.9 }), it, 0, 0, 0);
      const leaf = std({ color: 0x3a6a2a, roughness: 0.8, side: THREE.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const fr = plane(0.06, 0.3, leaf, it, 0, 0.26, 0);
        fr.rotation.set(0.6 + rnd() * 0.3, (i / 9) * Math.PI * 2, 0, "YXZ");
        fr.position.set(Math.sin((i / 9) * Math.PI * 2) * 0.06, 0.24, Math.cos((i / 9) * Math.PI * 2) * 0.06);
      }
    } else if (item === "vase") {
      const vTex = itemTexture("vase", c => {
        c.fillStyle = "#f4f2ec";
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = "#1e3a8a";
        c.lineWidth = 5;
        for (let y = 20; y < 256; y += 60) {
          c.beginPath();
          for (let x = 0; x <= 256; x += 8) c.lineTo(x, y + Math.sin(x / 20) * 12);
          c.stroke();
        }
        c.fillStyle = "#2a4a9a";
        for (let i = 0; i < 14; i++) {
          c.beginPath();
          c.arc((i * 47) % 256, 50 + ((i * 71) % 180), 10, 0, Math.PI * 2);
          c.fill();
        }
      });
      lathe([[0, 0], [0.09, 0], [0.12, 0.08], [0.17, 0.2], [0.16, 0.3], [0.08, 0.42], [0.07, 0.48], [0.09, 0.52], [0, 0.52]], 16, std({ map: vTex, roughness: 0.15 }), it, 0, 0, 0);
    } else if (item === "crown") {
      /* 제타의 왕관과 별 목걸이(왕관 - 고리 - 별) */
      const band = lathe([[0.075, 0], [0.08, 0], [0.08, 0.04], [0.075, 0.045]], 16, gold, it, -0.12, 0.02, 0);
      void band;
      cyl(0.074, 0.074, 0.02, 12, velvetMat("#7a1f3a"), it, -0.12, 0.035, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sp = mesh(track(new THREE.ConeGeometry(0.018, 0.07, 4)), gold, it, -0.12 + Math.cos(a) * 0.077, 0.1, Math.sin(a) * 0.077);
        void sp;
        sphere(0.009, pearl, it, -0.12 + Math.cos(a) * 0.077, 0.14, Math.sin(a) * 0.077, 5, 4);
      }
      sphere(0.014, std({ color: 0xb01a3a, roughness: 0.1 }), it, -0.12, 0.04, 0.08, 6, 4);
      /* 사슬, 고리, 별 */
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.15 + (i / 13) * 0.7);
        sphere(0.006, gold, it, 0.15 + Math.cos(a) * 0.13, 0.008, -0.04 - Math.sin(a) * 0.1, 4, 3);
      }
      mesh(track(new THREE.TorusGeometry(0.018, 0.005, 5, 14)), gold, it, 0.15, 0.008, 0.06).rotation.x = Math.PI / 2;
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        const rr = i % 2 ? 0.02 : 0.048;
        if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      star.closePath();
      const st = mesh(track(new THREE.ExtrudeGeometry(star, { depth: 0.01, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 })), gold, it, 0.15, 0.012, 0.13);
      st.rotation.x = -Math.PI / 2;
    }
    /* 박물관 이름표: 진열판 앞쪽에 비스듬히 */
    const title = String(p.opts?.title ?? "");
    const sub = String(p.opts?.sub ?? "");
    const lab = k.label(kit, `vit:${title}`, [{ text: title, size: 40, kr: true }, { text: sub, size: 26, weight: 500 }]);
    const card = plane(0.26, 0.098, basic({ map: lab }), g, W / 2 - 0.2, y0 + 0.04, D / 2 - 0.1);
    card.rotation.x = -0.9;
    box(0.27, 0.004, 0.06, brass, g, W / 2 - 0.2, y0 + 0.015, D / 2 - 0.085).rotation.x = -0.9;
    k.blob(0, 0, W + 0.5, D + 0.5, 0.65, g);
  };

  /* ---------- 벽 촛대(스콘스): 금빛 받침판, 팔 두 개, 초, 벽 빛무리, 바닥 빛웅덩이 ---------- */
  B.sconce = (g, p) => {
    const y = Number(p.opts?.y ?? 2.4);
    if (p.opts?.gas) {
      /* 가스 벽등(브래킷): 벽 장미 판, 굽은 놋쇠 가스관, 꼭지, 젖빛 유리 갓 */
      lathe([[0, 0], [0.07, 0], [0.06, 0.02], [0.03, 0.04], [0, 0.045]], 8, brass, g, 0, y - 0.06, 0.0).rotation.x = Math.PI / 2;
      const arm = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, y - 0.06, 0.04), new THREE.Vector3(0, y - 0.12, 0.16), new THREE.Vector3(0, y - 0.06, 0.26), new THREE.Vector3(0, y + 0.02, 0.28)]), 8, 0.013, 4));
      mesh(arm, brass, g);
      sphere(0.02, brass, g, 0, y - 0.11, 0.14, 6, 4);
      cyl(0.03, 0.02, 0.04, 8, brass, g, 0, y + 0.03, 0.28);
      lathe([[0.03, 0], [0.06, 0.02], [0.085, 0.07], [0.09, 0.12], [0.075, 0.16], [0.08, 0.17], [0, 0.17]], 8, opal, g, 0, y + 0.05, 0.28);
      flameSprite(g, 0, y + 0.13, 0.28, 0.07);
    } else {
    lathe([[0, 0], [0.07, 0.0], [0.09, 0.05], [0.06, 0.16], [0.08, 0.26], [0.03, 0.32], [0, 0.34]], 8, gold, g, 0, y - 0.18, 0.02).scale.z = 0.35;
    for (const sx of [-1, 1]) {
      const arm = track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, y - 0.04, 0.04), new THREE.Vector3(sx * 0.08, y - 0.1, 0.12), new THREE.Vector3(sx * 0.17, y - 0.02, 0.17), new THREE.Vector3(sx * 0.18, y + 0.04, 0.17)]), 6, 0.011, 4));
      mesh(arm, gold, g);
      lathe([[0, 0], [0.03, 0], [0.045, 0.03], [0.02, 0.04], [0, 0.04]], 8, gold, g, sx * 0.18, y + 0.03, 0.17);
      candle(g, sx * 0.18, y + 0.07, 0.17, 0.13);
    }
    }
    const wallGlow = radialTexture(kit, "sconceglow", "rgba(255,206,140,0.75)", "rgba(255,206,140,0)");
    const wgm = basic({ map: wallGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 });
    const gl = plane(1.5, 1.5, wgm, g, 0, y + 0.18, 0.012);
    gl.renderOrder = 2;
    const pool = plane(2.2, 1.6, basic({ map: wallGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22 }), g, 0, 0.014, 0.75);
    pool.rotation.x = -Math.PI / 2;
    const ph = rnd() * 5;
    animators.push(t => {
      wgm.opacity = 0.62 + Math.sin(t * 7 + ph) * 0.04 + Math.sin(t * 3.1 + ph) * 0.04;
    });
  };

  /* ---------- 다탁(삼각 받침 원형 탁자) + 찻잔 한 벌 ---------- */
  B.teaTable = g => {
    const top = 0.5;
    lathe([[0, 0], [0.42, 0], [0.43, 0.02], [0.42, 0.04], [0.4, 0.035], [0, 0.035]], 20, walnut, g, 0, top - 0.035, 0);
    lathe([[0.04, 0], [0.06, 0.05], [0.035, 0.12], [0.07, 0.2], [0.03, 0.3], [0.045, 0.38], [0.05, 0.43], [0, 0.44]], 10, walnut, g, 0, 0.03, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cabriole(g, Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.16, 0.022, walnut, -a);
      leg.scale.set(1.8, 1, 1);
    }
    const rose = std({ color: 0xf6f1e6, roughness: 0.25 });
    const rim = std({ color: 0xc2a15a, roughness: 0.3, metalness: 0.6 });
    lathe([[0, 0], [0.05, 0], [0.08, 0.04], [0.08, 0.1], [0.05, 0.14], [0.02, 0.16], [0.03, 0.18], [0, 0.19]], 12, rose, g, -0.12, top, -0.06);
    cyl(0.006, 0.012, 0.09, 6, rose, g, -0.02, top + 0.09, -0.06).rotation.z = -0.9;
    mesh(track(new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI)), rose, g, -0.21, top + 0.09, -0.06).rotation.z = Math.PI / 2;
    for (const [x, z] of [[0.16, 0.1], [0.06, 0.24], [0.22, -0.14]]) {
      cyl(0.055, 0.05, 0.006, 12, rose, g, x, top + 0.003, z);
      lathe([[0, 0], [0.024, 0], [0.038, 0.045], [0.04, 0.055], [0, 0.055]], 10, rose, g, x, top + 0.006, z);
      mesh(track(new THREE.TorusGeometry(0.04, 0.003, 3, 14)), rim, g, x, top + 0.06, z).rotation.x = Math.PI / 2;
    }
    lathe([[0, 0], [0.12, 0], [0.13, 0.01], [0, 0.01]], 14, rose, g, -0.18, top, 0.2);
    const cake = [std({ color: 0xe8b8c0, roughness: 0.8 }), std({ color: 0xf4e0b0, roughness: 0.8 })];
    for (let j = 0; j < 5; j++) sphere(0.022, cake[j % 2], g, -0.18 + Math.cos(j * 1.25) * 0.07, top + 0.03, 0.2 + Math.sin(j * 1.25) * 0.07, 6, 4);
    k.blob(0, 0, 1.2, 1.2, 0.6, g);
  };

  /* ---------- 촛대(탁자 위) 또는 등불(온실) ---------- */
  B.candlestick = (g, p) => {
    const y = Number(p.opts?.y ?? 0.75);
    const ironBlk = std({ color: 0x1a1814, roughness: 0.6, metalness: 0.5 });
    if (p.opts?.lantern) {
      box(0.2, 0.02, 0.2, ironBlk, g, 0, y + 0.01, 0);
      const gl2 = box(0.17, 0.26, 0.17, glass, g, 0, y + 0.15, 0);
      gl2.renderOrder = 3;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.014, 0.28, 0.014, ironBlk, g, x * 0.09, y + 0.15, z * 0.09);
      lathe([[0.12, 0], [0.04, 0.08], [0.02, 0.12], [0, 0.13]], 4, ironBlk, g, 0, y + 0.29, 0).rotation.y = Math.PI / 4;
      mesh(track(new THREE.TorusGeometry(0.03, 0.005, 4, 10)), ironBlk, g, 0, y + 0.45, 0);
      candle(g, 0, y + 0.03, 0, 0.1);
      halo(g, y + 0.17, 0.9, 0.55);
      return;
    }
    lathe([[0, 0], [0.07, 0], [0.075, 0.015], [0.04, 0.03], [0.02, 0.08], [0.03, 0.12], [0.015, 0.2], [0.025, 0.26], [0.035, 0.28], [0, 0.29]], 10, brass, g, 0.1, y, 0.02);
    lathe([[0, 0], [0.06, 0], [0.065, 0.012], [0.035, 0.025], [0.018, 0.06], [0.024, 0.18], [0.03, 0.2], [0, 0.21]], 10, brass, g, -0.06, y, -0.04);
    candle(g, 0.1, y + 0.28, 0.02, 0.16);
    candle(g, -0.06, y + 0.2, -0.04, 0.12);
    halo(g, y + 0.48, 1.1, 0.6);
  };

  B.ladder = g => {
    const L = 3.05;
    const lg = new THREE.Group();
    lg.position.set(0, 0, 0.75);
    lg.rotation.x = -0.24;
    g.add(lg);
    for (const x of [-0.24, 0.24]) box(0.05, L, 0.07, walnut, lg, x, L / 2, 0);
    for (let y = 0.3; y < L - 0.1; y += 0.3) cyl(0.018, 0.018, 0.48, 6, brass, lg, 0, y, 0).rotation.z = Math.PI / 2;
    box(0.6, 0.04, 0.06, brass, lg, 0, L, 0);
  };

  B.wingback = g => {
    box(0.8, 0.2, 0.75, leatherBrown, g, 0, 0.42, 0.02, 0.6);
    box(0.66, 0.1, 0.62, leatherBrown, g, 0, 0.56, 0.06, 0.6);
    box(0.8, 0.9, 0.16, leatherBrown, g, 0, 0.96, -0.3, 0.6);
    for (const s of [-1, 1]) {
      const wing = box(0.1, 0.5, 0.36, leatherBrown, g, s * 0.38, 1.12, -0.16, 0.6);
      wing.rotation.y = s * 0.3;
      const arm = cyl(0.08, 0.08, 0.66, 10, leatherBrown, g, s * 0.37, 0.7, 0.04);
      arm.rotation.x = Math.PI / 2;
      box(0.12, 0.2, 0.66, leatherBrown, g, s * 0.37, 0.58, 0.04, 0.6);
    }
    for (const [x, z] of [[-0.34, -0.3], [0.34, -0.3], [-0.34, 0.34], [0.34, 0.34]]) cyl(0.03, 0.02, 0.32, 6, walnut, g, x, 0.16, z);
    const btn = std({ color: 0x3a2412, roughness: 0.5 });
    for (let i = 0; i < 9; i++) sphere(0.014, btn, g, -0.24 + (i % 3) * 0.24, 0.8 + Math.floor(i / 3) * 0.2, -0.215, 6, 4);
    k.blob(0, 0, 1.2, 1.2, 0.7, g);
  };

  B.libraryDesk = g => {
    box(1.8, 0.06, 0.9, walnut, g, 0, 0.78, 0, 1);
    const green = std({ color: 0x2f5a3c, roughness: 0.6, map: kit.texture(`${TEX}brown_leather_diff.webp`) });
    plane(1.5, 0.66, green, g, 0, 0.812, 0).rotation.x = -Math.PI / 2;
    for (const x of [-0.62, 0.62]) {
      box(0.5, 0.74, 0.84, walnut, g, x, 0.37, 0, 0.8);
      for (let j = 0; j < 3; j++) {
        box(0.42, 0.2, 0.02, darkWood, g, x, 0.14 + j * 0.23, 0.425);
        sphere(0.018, brass, g, x, 0.14 + j * 0.23, 0.44, 6, 4);
      }
    }
    /* 황동 학생용 기름 램프(1880년대). 초록 은행원 램프는 1909년 특허라 시대에 맞지 않아 바꿨습니다. */
    const lg = new THREE.Group();
    lg.position.set(0.55, 0.81, -0.2);
    g.add(lg);
    cyl(0.09, 0.1, 0.03, 12, brass, lg, 0, 0.015, 0);
    cyl(0.012, 0.012, 0.42, 6, brass, lg, 0, 0.22, 0);
    lathe([[0, 0], [0.05, 0], [0.06, 0.05], [0.04, 0.1], [0, 0.11]], 10, brass, lg, -0.1, 0.24, 0);
    box(0.1, 0.012, 0.012, brass, lg, -0.05, 0.3, 0);
    cyl(0.018, 0.018, 0.1, 8, std({ color: 0xfff4e0, roughness: 0.1, transparent: true, opacity: 0.6 }), lg, 0.09, 0.36, 0);
    lathe([[0.03, 0], [0.12, 0.06], [0.11, 0.08], [0.03, 0.12]], 12, std({ color: 0xf6efe2, roughness: 0.3, emissive: new THREE.Color(0xffe6b8), emissiveIntensity: 0.55, side: THREE.DoubleSide }), lg, 0.09, 0.33, 0);
    const bulbGlow = radialTexture(kit, "lamp", "rgba(255,210,140,0.95)", "rgba(255,210,140,0)");
    const gl = plane(0.9, 0.7, basic({ map: bulbGlow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }), g, 0.55, 0.818, 0.0);
    gl.rotation.x = -Math.PI / 2;
    /* 펼친 일기장 */
    const pages = kit.canvas("diary", 512, 256, cg => {
      cg.fillStyle = "#f2e8d2";
      cg.fillRect(0, 0, 512, 256);
      cg.strokeStyle = "rgba(120,100,80,0.35)";
      for (let y = 40; y < 240; y += 16) {
        cg.beginPath();
        cg.moveTo(20, y);
        cg.lineTo(240, y);
        cg.moveTo(272, y);
        cg.lineTo(492, y);
        cg.stroke();
      }
      cg.strokeStyle = "rgba(40,30,60,0.75)";
      const r2 = mulberry(3);
      for (let y = 38; y < 220; y += 16) {
        for (const x0 of [24, 276]) {
          cg.beginPath();
          let x = x0;
          cg.moveTo(x, y);
          const end = x0 + 160 + r2() * 50;
          while (x < end) {
            x += 4;
            cg.lineTo(x, y - 3 + Math.sin(x * 0.9) * 3 * r2());
          }
          cg.stroke();
        }
      }
      cg.fillStyle = "rgba(0,0,0,0.18)";
      cg.fillRect(250, 0, 12, 256);
    }, { repeat: false });
    const book = new THREE.Group();
    book.position.set(-0.25, 0.82, 0.05);
    book.rotation.y = 0.25;
    g.add(book);
    box(0.62, 0.02, 0.4, std({ color: 0x5a1a1a, roughness: 0.6 }), book, 0, 0.0, 0);
    const pg = plane(0.58, 0.38, basic({ map: pages }), book, 0, 0.012, 0);
    pg.rotation.x = -Math.PI / 2;
    const quill = cyl(0.004, 0.012, 0.32, 5, std({ color: 0xf2f0e8, roughness: 0.8 }), g, 0.22, 0.86, 0.15);
    quill.rotation.z = 1.1;
    cyl(0.035, 0.04, 0.05, 8, std({ color: 0x101018, roughness: 0.1 }), g, 0.28, 0.835, 0.12);
    const cols = [0x5a1a18, 0x1f3a2a, 0x3a2a1a, 0x2a2440];
    for (let i = 0; i < 4; i++) box(0.24, 0.05, 0.17, std({ color: cols[i], roughness: 0.6 }), g, -0.68, 0.835 + i * 0.05, -0.2).rotation.y = (rnd() - 0.5) * 0.3;
    k.blob(0, 0, 2.2, 1.3, 0.75, g);
  };

  B.globe = g => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = box(0.04, 0.6, 0.04, walnut, g, Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2);
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    }
    const ring = mesh(track(new THREE.TorusGeometry(0.4, 0.02, 5, 28)), walnut, g, 0, 0.9, 0);
    ring.rotation.x = Math.PI / 2;
    const mapTex = kit.canvas("globe", 512, 256, cg => {
      cg.fillStyle = "#c8b48a";
      cg.fillRect(0, 0, 512, 256);
      const r2 = mulberry(21);
      cg.fillStyle = "#8a6a3a";
      for (let i = 0; i < 26; i++) {
        cg.beginPath();
        cg.ellipse(r2() * 512, 40 + r2() * 176, 20 + r2() * 50, 10 + r2() * 30, r2() * 3, 0, Math.PI * 2);
        cg.fill();
      }
      cg.strokeStyle = "rgba(60,40,20,0.4)";
      for (let x = 0; x < 512; x += 32) {
        cg.beginPath();
        cg.moveTo(x, 0);
        cg.lineTo(x, 256);
        cg.stroke();
      }
      for (let y = 0; y < 256; y += 32) {
        cg.beginPath();
        cg.moveTo(0, y);
        cg.lineTo(512, y);
        cg.stroke();
      }
    }, { repeat: false });
    const gl = sphere(0.36, std({ map: mapTex, roughness: 0.45 }), g, 0, 0.98, 0, 20, 14);
    gl.rotation.z = 0.41;
    const mer = mesh(track(new THREE.TorusGeometry(0.39, 0.012, 4, 28)), brass, g, 0, 0.98, 0);
    mer.rotation.set(0.41, Math.PI / 2, 0);
    k.blob(0, 0, 0.9, 0.9, 0.6, g);
  };

  B.chesterfield = (g, p) => {
    const leather = p.opts?.color ? std({ color: new THREE.Color(String(p.opts.color)), roughness: 0.45, clearcoat: 0.3, physical: true }) : leatherRed;
    box(2.0, 0.3, 0.86, leather, g, 0, 0.27, 0, 0.6);
    for (const x of [-0.5, 0.5]) box(0.92, 0.12, 0.66, leather, g, x, 0.48, 0.07, 0.6);
    box(2.0, 0.52, 0.22, leather, g, 0, 0.66, -0.33, 0.6);
    const roll = cyl(0.11, 0.11, 2.0, 12, leather, g, 0, 0.92, -0.33);
    roll.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      box(0.22, 0.48, 0.86, leather, g, s * 0.98, 0.48, 0, 0.6);
      const arm = cyl(0.13, 0.13, 0.86, 12, leather, g, s * 0.98, 0.74, 0);
      arm.rotation.x = Math.PI / 2;
    }
    const btn = std({ color: 0x4a0e0c, roughness: 0.5 });
    for (let i = 0; i < 14; i++) sphere(0.016, btn, g, -0.84 + (i % 7) * 0.28, 0.6 + Math.floor(i / 7) * 0.18, -0.215, 6, 4);
    for (const [x, z] of [[-0.9, -0.36], [0.9, -0.36], [-0.9, 0.36], [0.9, 0.36]]) lathe([[0, 0], [0.035, 0], [0.055, 0.04], [0.04, 0.08], [0.05, 0.11], [0, 0.12]], 8, walnut, g, x, 0, z);
    k.blob(0, 0, 2.6, 1.4, 0.75, g);
  };

  B.marbleFireplace = (g, p) => {
    const tiles = p.opts?.tiles ? String(p.opts.tiles) : "";
    const m2 = tiles
      ? std({ color: room.id === "secret" ? 0x3a3034 : 0x2e2a28, roughness: 0.2, map: kit.texture(`${TEX}marble_01_diff.webp`) })
      : std({ color: 0xf6f2ea, roughness: 0.18, map: kit.texture(`${TEX}marble_01_diff.webp`) });
    box(2.2, 0.06, 0.7, m2, g, 0, 0.03, 0.25);
    for (const s of [-1, 1]) {
      box(0.32, 1.12, 0.3, m2, g, s * 0.78, 0.56, 0);
      box(0.38, 0.12, 0.34, m2, g, s * 0.78, 1.06, 0);
      sphere(0.06, gold, g, s * 0.78, 0.8, 0.16, 8, 6);
    }
    box(1.9, 0.26, 0.3, m2, g, 0, 1.25, 0);
    box(2.1, 0.07, 0.42, m2, g, 0, 1.415, 0.04);
    box(0.6, 0.12, 0.02, gold, g, 0, 1.25, 0.16);
    box(1.24, 1.0, 0.3, std({ color: 0x0c0806, roughness: 0.95 }), g, 0, 0.6, -0.08);
    box(0.8, 0.04, 0.3, std({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }), g, 0, 0.16, 0.0);
    if (tiles) {
      /* 드 모건풍 타일 옆판(양쪽 세로 5장씩) + 주철 화격자 테. 무늬는 추정(드 모건 공방풍). */
      const tileTex = kit.canvas(`fireTile:${tiles}`, 128, 640, cg => {
        for (let i = 0; i < 5; i++) {
          const y0 = i * 128;
          cg.fillStyle = tiles === "lustre" ? "#f2e6cc" : "#f4f0e4";
          cg.fillRect(0, y0, 128, 128);
          cg.save();
          cg.translate(64, y0 + 64);
          if (tiles === "lustre") {
            /* 루비 러스터: 붉은 금속빛 새와 잎 */
            cg.fillStyle = "#9a3a2a";
            cg.beginPath();
            cg.ellipse(0, 0, 34, 18, -0.4, 0, Math.PI * 2);
            cg.fill();
            cg.beginPath();
            cg.arc(26, -14, 11, 0, Math.PI * 2);
            cg.fill();
            cg.beginPath();
            cg.moveTo(-30, 6);
            cg.lineTo(-56, 26);
            cg.lineTo(-40, 0);
            cg.fill();
            cg.fillStyle = "#c87a3a";
            for (let k2 = 0; k2 < 4; k2++) {
              cg.beginPath();
              cg.ellipse(-40 + k2 * 26, 44, 12, 5, 0.5, 0, Math.PI * 2);
              cg.fill();
            }
          } else {
            /* 페르시아 색(코발트, 청록) 카네이션 */
            cg.fillStyle = "#1e4a8a";
            cg.beginPath();
            cg.moveTo(0, -48);
            cg.quadraticCurveTo(30, -20, 0, 10);
            cg.quadraticCurveTo(-30, -20, 0, -48);
            cg.fill();
            cg.fillStyle = "#2a8a8a";
            for (const sx of [-1, 1]) {
              cg.beginPath();
              cg.ellipse(sx * 24, 24, 22, 8, sx * 0.7, 0, Math.PI * 2);
              cg.fill();
            }
            cg.strokeStyle = "#1e4a8a";
            cg.lineWidth = 4;
            cg.beginPath();
            cg.moveTo(0, 10);
            cg.lineTo(0, 54);
            cg.stroke();
          }
          cg.restore();
          cg.strokeStyle = "rgba(60,50,40,0.6)";
          cg.lineWidth = 3;
          cg.strokeRect(1.5, y0 + 1.5, 125, 125);
        }
      }, { repeat: false });
      const tm = std({ map: tileTex, roughness: 0.15 });
      for (const sx of [-1, 1]) plane(0.17, 0.85, tm, g, sx * 0.53, 0.58, 0.075);
      const iron = std({ color: 0x1a1816, roughness: 0.35, metalness: 0.8 });
      /* 주철 아치 테(레지스터 그레이트) */
      const ring = new THREE.Shape();
      ring.moveTo(-0.44, 0.12);
      ring.lineTo(-0.44, 0.78);
      ring.quadraticCurveTo(-0.44, 1.0, 0, 1.02);
      ring.quadraticCurveTo(0.44, 1.0, 0.44, 0.78);
      ring.lineTo(0.44, 0.12);
      ring.lineTo(0.36, 0.12);
      ring.lineTo(0.36, 0.76);
      ring.quadraticCurveTo(0.36, 0.92, 0, 0.94);
      ring.quadraticCurveTo(-0.36, 0.92, -0.36, 0.76);
      ring.lineTo(-0.36, 0.12);
      ring.closePath();
      mesh(track(new THREE.ExtrudeGeometry(ring, { depth: 0.03, bevelEnabled: false, curveSegments: 6 })), iron, g, 0, 0, 0.06);
      for (let i = 0; i < 5; i++) box(0.62, 0.015, 0.015, iron, g, 0, 0.2 + i * 0.05, 0.12);
    }
    const logMat = std({ color: 0x3a2214, roughness: 0.9, emissive: new THREE.Color(0x6a1a00), emissiveIntensity: 0.35 });
    for (const [x, rz] of [[-0.12, 0.2], [0.14, -0.15], [0, 0]] as [number, number][]) {
      const lg = cyl(0.06, 0.06, 0.62, 8, logMat, g, x, 0.24, 0.02);
      lg.rotation.z = Math.PI / 2 + rz;
    }
    /* 불꽃 스프라이트(움직이는 그림) */
    for (const [x, s] of [[-0.18, 0.42], [0.0, 0.55], [0.2, 0.4]] as [number, number][]) {
      const sp = flameSprite(g, x, 0.42, 0.06, s);
      sp.scale.set(s * 0.8, s, 1);
    }
    const hearth = radialTexture(kit, "hearth", "rgba(255,150,60,0.9)", "rgba(255,120,40,0)");
    const glowM = basic({ map: hearth, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 });
    const hg = plane(2.4, 1.6, glowM, g, 0, 0.02, 0.6);
    hg.rotation.x = -Math.PI / 2;
    animators.push(t => {
      glowM.opacity = 0.5 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 3.1) * 0.05;
    });
    box(1.5, 0.08, 0.03, brass, g, 0, 0.1, 0.5);
    for (const x of [-0.85, 0.85]) {
      lathe([[0, 0], [0.06, 0], [0.025, 0.05], [0.02, 0.22], [0.04, 0.24], [0, 0.24]], 8, gold, g, x, 1.45, 0.05);
      candle(g, x, 1.69, 0.05, 0.12);
    }
    if (p.opts?.overmantel) {
      /* 오버맨틀: 흑단 칠(또는 금박) 틀에 거울 셋 + 작은 선반들(청화 자기와 꽃병) */
      const om = room.id === "secret" ? std({ color: 0x3a2418, roughness: 0.35, map: (walnut as T.MeshStandardMaterial).map }) : std({ color: 0x141012, roughness: 0.3, physical: true, clearcoat: 0.6 });
      const mir = std({ color: 0xb8c0c4, roughness: 0.05, metalness: 0.92 });
      /* 비밀 서재는 천장이 낮아 오버맨틀을 줄이고 그 위에 초상화를 겁니다. */
      const og = new THREE.Group();
      g.add(og);
      if (room.id === "secret") {
        og.position.y = 1.45 * (1 - 0.75);
        og.scale.y = 0.75;
      }
      const gg = og;
      box(1.9, 1.2, 0.05, om, gg, 0, 2.08, -0.06);
      plane(0.9, 0.86, mir, gg, 0, 2.06, -0.032);
      for (const sx of [-1, 1]) plane(0.34, 0.6, mir, gg, sx * 0.68, 1.98, -0.032);
      for (const x of [-0.92, -0.48, 0.48, 0.92]) box(0.04, 1.2, 0.05, om, gg, x, 2.08, -0.03);
      for (const sx of [-1, 1]) {
        box(0.42, 0.025, 0.14, om, gg, sx * 0.68, 2.32, 0.0);
        lathe([[0, 0], [0.035, 0], [0.05, 0.06], [0.025, 0.12], [0.03, 0.15], [0, 0.15]], 10, std({ color: 0x2a4a8a, roughness: 0.12 }), gg, sx * 0.68, 2.333, 0.0);
      }
      /* 위 처마 + 가운데 작은 박공 */
      box(2.0, 0.06, 0.18, om, gg, 0, 2.71, 0.0);
      const ped = new THREE.Shape();
      ped.moveTo(-0.4, 0);
      ped.lineTo(0.4, 0);
      ped.quadraticCurveTo(0.2, 0.08, 0, 0.18);
      ped.quadraticCurveTo(-0.2, 0.08, -0.4, 0);
      mesh(track(new THREE.ExtrudeGeometry(ped, { depth: 0.04, bevelEnabled: false, curveSegments: 4 })), om, gg, 0, 2.74, -0.04);
      /* 금박 가는 선 */
      if (room.id !== "secret") box(1.86, 0.008, 0.004, gold, gg, 0, 2.68, 0.092);
      /* 벽난로 선반 위 시계(놋쇠, 에스테틱풍) */
      box(0.26, 0.28, 0.12, brass, g, 0, 1.59, 0.04);
      plane(0.16, 0.16, porcelain, g, 0, 1.61, 0.101);
    } else {
      box(0.3, 0.3, 0.14, gold, g, 0, 1.6, 0.04);
      plane(0.18, 0.18, porcelain, g, 0, 1.62, 0.115);
    }
  };

  B.teaTrolley = g => {
    const tyre = std({ color: 0x1a1a1a, roughness: 0.4 });
    for (const [x, z] of [[-0.38, -0.24], [0.38, -0.24], [-0.38, 0.24], [0.38, 0.24]]) {
      cyl(0.012, 0.012, 0.78, 6, brass, g, x, 0.43, z);
      sphere(0.04, tyre, g, x, 0.04, z, 6, 4);
    }
    for (const y of [0.25, 0.72]) box(0.8, 0.025, 0.52, walnut, g, 0, y, 0);
    lathe([[0, 0], [0.07, 0], [0.11, 0.05], [0.11, 0.12], [0.06, 0.17], [0.03, 0.2], [0, 0.2]], 12, porcelain, g, -0.15, 0.735, 0);
    const spout = cyl(0.008, 0.016, 0.12, 6, porcelain, g, -0.03, 0.82, 0);
    spout.rotation.z = -0.9;
    for (const [x, z] of [[0.12, -0.1], [0.24, 0.08], [0.06, 0.14]]) {
      cyl(0.05, 0.05, 0.008, 12, porcelain, g, x, 0.74, z);
      lathe([[0, 0], [0.025, 0], [0.04, 0.05], [0, 0.05]], 10, porcelain, g, x, 0.745, z);
    }
    const cake = [std({ color: 0xe8b8c0, roughness: 0.8 }), std({ color: 0xf4e0b0, roughness: 0.8 }), std({ color: 0xc89060, roughness: 0.8 })];
    for (let i = 0; i < 3; i++) {
      cyl(0.14 - i * 0.03, 0.14 - i * 0.03, 0.01, 14, porcelain, g, 0.05, 0.3 + i * 0.13, 0);
      for (let j = 0; j < 4; j++) sphere(0.02, cake[j % 3], g, 0.05 + Math.cos(j * 1.6) * (0.08 - i * 0.02), 0.32 + i * 0.13, Math.sin(j * 1.6) * (0.08 - i * 0.02), 6, 4);
    }
    cyl(0.006, 0.006, 0.4, 4, gold, g, 0.05, 0.42, 0);
    k.blob(0, 0, 1.1, 0.8, 0.6, g);
  };

  B.guestbookStand = g => {
    lathe([[0, 0], [0.24, 0], [0.24, 0.04], [0.06, 0.1], [0.05, 0.9], [0.1, 0.95], [0, 0.95]], 12, walnut, g);
    const top = box(0.6, 0.04, 0.44, walnut, g, 0, 1.02, 0, 0.6);
    top.rotation.x = 0.35;
    const pages = kit.canvas("guestpages", 512, 256, cg => {
      cg.fillStyle = "#f4ead4";
      cg.fillRect(0, 0, 512, 256);
      cg.fillStyle = "#3a2410";
      cg.font = `600 34px ${SERIF}`;
      cg.textAlign = "center";
      cg.fillText("Guestbook", 128, 50);
      cg.font = `600 26px ${SERIF_KR}`;
      cg.fillText("방명록", 384, 50);
      cg.strokeStyle = "rgba(120,100,80,0.4)";
      for (let y = 80; y < 240; y += 20) {
        cg.beginPath();
        cg.moveTo(24, y);
        cg.lineTo(236, y);
        cg.moveTo(276, y);
        cg.lineTo(488, y);
        cg.stroke();
      }
      cg.fillStyle = "rgba(40,30,60,0.8)";
      cg.font = `500 18px ${SERIF_KR}`;
      cg.textAlign = "left";
      cg.fillText("홍길동 다녀갑니다 :)", 30, 96);
      cg.fillStyle = "rgba(0,0,0,0.15)";
      cg.fillRect(250, 0, 12, 256);
    }, { repeat: false });
    const pg = plane(0.56, 0.36, basic({ map: pages }), g, 0, 1.05, 0.0);
    pg.rotation.x = -Math.PI / 2 + 0.35;
    const quill = cyl(0.004, 0.014, 0.34, 5, std({ color: 0xfaf8f0, roughness: 0.8 }), g, 0.22, 1.12, 0.05);
    quill.rotation.set(0.3, 0, 0.9);
    k.blob(0, 0, 0.8, 0.8, 0.6, g);
  };

  B.displayCase = g => {
    box(1.6, 0.8, 0.7, darkWood, g, 0, 0.4, 0, 0.8);
    box(1.64, 0.04, 0.74, gold, g, 0, 0.81, 0);
    const gb = box(1.56, 0.6, 0.66, glass, g, 0, 1.13, 0);
    gb.renderOrder = 3;
    for (const [x, z] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]]) box(0.025, 0.6, 0.025, brass, g, x, 1.13, z);
    box(1.6, 0.03, 0.7, brass, g, 0, 1.44, 0);
    lathe([[0, 0], [0.06, 0], [0.1, 0.1], [0.08, 0.26], [0.04, 0.32], [0.06, 0.36], [0, 0.36]], 12, std({ color: 0x2a4a8a, roughness: 0.15 }), g, -0.4, 0.83, 0);
    box(0.3, 0.04, 0.22, std({ color: 0x6a1f22, roughness: 0.6 }), g, 0.25, 0.85, 0);
    const lab = k.label(kit, "case", [{ text: "Porcelain & Letters", size: 36 }, { text: "c. 1780", size: 26, weight: 500 }]);
    const lp = plane(0.22, 0.08, basic({ map: lab }), g, 0.45, 0.832, 0.15);
    lp.rotation.x = -Math.PI / 2;
    k.blob(0, 0, 2.0, 1.1, 0.7, g);
  };

  B.bench = g => {
    const red = velvetMat("#7a1f2b");
    box(1.6, 0.16, 0.5, red, g, 0, 0.42, 0);
    box(1.5, 0.08, 0.44, gold, g, 0, 0.31, 0);
    for (const [x, z] of [[-0.68, -0.18], [0.68, -0.18], [-0.68, 0.18], [0.68, 0.18]]) lathe(turnedLegProfile(0.27, 0.022), 8, gold, g, x, 0, z);
    for (let i = 0; i < 9; i++) sphere(0.012, gold, g, -0.7 + i * 0.175, 0.5, 0.255, 5, 4);
    k.blob(0, 0, 2.0, 0.9, 0.6, g);
  };

  const blackGloss = k.blackGloss;
  const ironWhite = k.ironWhite;

  function sheetMusic() {
    return kit.canvas("sheet", 256, 128, cg => {
      cg.fillStyle = "#f6efdc";
      cg.fillRect(0, 0, 256, 128);
      cg.strokeStyle = "#333";
      for (let st = 0; st < 3; st++) {
        for (let l = 0; l < 5; l++) {
          const y = 18 + st * 38 + l * 4;
          cg.beginPath();
          cg.moveTo(10, y);
          cg.lineTo(246, y);
          cg.stroke();
        }
      }
      cg.fillStyle = "#222";
      const r2 = mulberry(9);
      for (let i = 0; i < 60; i++) {
        cg.beginPath();
        cg.ellipse(14 + r2() * 228, 16 + Math.floor(r2() * 3) * 38 + r2() * 16, 2.6, 2, -0.4, 0, Math.PI * 2);
        cg.fill();
      }
    }, { repeat: false });
  }

  /* 그랜드 피아노(1880년대 장미목 케이스): 열린 뚜껑 아래로 금빛 철골과 현이 보이고,
     돌린 다리에 놋쇠 바퀴, 페달 리라, 투각 악보대. 클라크 미술관의 앨머태디마 피아노(1884~87) 참고. */
  B.grandPiano = g => {
    const rosewood = std({ color: 0x4a2216, roughness: 0.22, physical: true, clearcoat: 0.9, map: (walnut as T.MeshStandardMaterial).map });
    const outline = new THREE.Shape();
    outline.moveTo(-0.75, 0);
    outline.lineTo(0.75, 0);
    outline.lineTo(0.75, 0.55);
    outline.bezierCurveTo(0.75, 0.9, 0.35, 1.0, 0.3, 1.35);
    outline.bezierCurveTo(0.26, 1.7, 0.1, 1.85, -0.3, 1.85);
    outline.lineTo(-0.75, 1.82);
    outline.closePath();
    /* 몸통은 속이 빈 테(림)로: 바깥 윤곽에서 안쪽 윤곽을 뺍니다. */
    const rim = outline.clone();
    const innerPts = outline.getPoints(10).map(v => new THREE.Vector2(v.x * 0.94, 0.05 + v.y * 0.95));
    rim.holes.push(new THREE.Path(innerPts.reverse()));
    const bodyG = track(new THREE.ExtrudeGeometry(rim, { depth: 0.3, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 10 }));
    bodyG.rotateX(-Math.PI / 2);
    mesh(bodyG, rosewood, g, 0, 0.62, 0.6);
    /* 바닥판 */
    const floorG = track(new THREE.ShapeGeometry(outline, 10));
    floorG.rotateX(-Math.PI / 2);
    mesh(floorG, rosewood, g, 0, 0.64, 0.6);
    /* 금빛 철골(플레이트) + 현 + 핀 */
    const plateTex = kit.canvas("pianoPlate", 256, 512, cg => {
      cg.fillStyle = "#b8923e";
      cg.fillRect(0, 0, 256, 512);
      cg.fillStyle = "#6a4a1a";
      for (const [x, y, r] of [[70, 160, 26], [150, 240, 30], [90, 340, 28], [170, 400, 22]] as [number, number, number][]) {
        cg.beginPath();
        cg.arc(x, y, r, 0, Math.PI * 2);
        cg.fill();
      }
      cg.strokeStyle = "rgba(240,236,220,0.85)";
      cg.lineWidth = 1;
      for (let x = 14; x < 246; x += 4.2) {
        cg.beginPath();
        cg.moveTo(x, 40);
        cg.lineTo(x * 0.92 + 4, 500);
        cg.stroke();
      }
      cg.fillStyle = "#e8e0c8";
      for (let x = 14; x < 246; x += 8) cg.fillRect(x, 26, 3, 3);
      cg.fillStyle = "#2a1a10";
      cg.fillRect(0, 0, 256, 18);
    }, { repeat: false });
    const plateShape = new THREE.Shape(outline.getPoints(10).map(v => new THREE.Vector2(v.x * 0.9, 0.07 + v.y * 0.92)));
    const plateG = track(new THREE.ShapeGeometry(plateShape, 10));
    const puv = plateG.getAttribute("uv") as T.BufferAttribute;
    const ppos = plateG.getAttribute("position") as T.BufferAttribute;
    for (let i = 0; i < puv.count; i++) puv.setXY(i, (ppos.getX(i) + 0.75) / 1.5, 1 - ppos.getY(i) / 1.85);
    plateG.rotateX(-Math.PI / 2);
    mesh(plateG, std({ map: plateTex, roughness: 0.35, metalness: 0.7 }), g, 0, 0.86, 0.6);
    /* 뚜껑(열림) 안쪽은 밝은 무늬목 */
    const lidG = track(new THREE.ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: false, curveSegments: 10 }));
    lidG.rotateX(-Math.PI / 2);
    lidG.translate(0.75, 0, 0);
    const hinge = new THREE.Group();
    hinge.position.set(-0.75, 0.94, 0.6);
    hinge.rotation.z = 0.62;
    g.add(hinge);
    mesh(lidG, rosewood, hinge);
    const lidIn = track(new THREE.ShapeGeometry(outline, 10));
    lidIn.rotateX(-Math.PI / 2);
    lidIn.translate(0.75, -0.003, 0);
    mesh(lidIn, std({ color: 0x9a6a40, roughness: 0.3, map: (walnut as T.MeshStandardMaterial).map, side: THREE.BackSide }), hinge);
    const stick = cyl(0.008, 0.008, 0.82, 5, rosewood, g, 0.55, 1.25, -0.3);
    stick.rotation.z = -0.15;
    /* 테 둘레 금빛 가는 띠 */
    const rimLine = outline.getPoints(10).map(v => new THREE.Vector3(v.x * 1.008, 0, -v.y * 1.004));
    mesh(track(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimLine, true), 40, 0.006, 3, true)), gold, g, 0, 0.9, 0.6);
    /* 빅토리아식 돌린 다리 + 놋쇠 바퀴 */
    const legP: [number, number][] = [[0.0, 0], [0.035, 0], [0.04, 0.04], [0.05, 0.06], [0.045, 0.12], [0.06, 0.2], [0.07, 0.32], [0.055, 0.42], [0.075, 0.48], [0.06, 0.54], [0.085, 0.58], [0.085, 0.62], [0, 0.62]];
    for (const [x, z] of [[-0.65, 0.5], [0.65, 0.5], [-0.4, -1.1]]) {
      lathe(legP, 10, rosewood, g, x, 0, z);
      sphere(0.03, brass, g, x, 0.025, z, 6, 4);
      mesh(track(new THREE.TorusGeometry(0.075, 0.008, 4, 12)), gold, g, x, 0.48, z).rotation.x = Math.PI / 2;
    }
    const keys = kit.canvas("keys", 1024, 64, cg => {
      cg.fillStyle = "#f8f6ee";
      cg.fillRect(0, 0, 1024, 64);
      const n = 52;
      const kw = 1024 / n;
      cg.fillStyle = "#c8c4b8";
      for (let i = 0; i <= n; i++) cg.fillRect(i * kw, 0, 1, 64);
      cg.fillStyle = "#111";
      for (let i = 0; i < n - 1; i++) {
        const m = i % 7;
        if (m === 2 || m === 6) continue;
        cg.fillRect(i * kw + kw * 0.68, 0, kw * 0.62, 40);
      }
    }, { repeat: false });
    const kb = plane(1.42, 0.16, basic({ map: keys }), g, 0, 0.76, 0.69);
    kb.rotation.x = -Math.PI / 2;
    box(1.5, 0.1, 0.2, rosewood, g, 0, 0.68, 0.7);
    for (const s2 of [-1, 1]) {
      box(0.05, 0.14, 0.24, rosewood, g, s2 * 0.73, 0.78, 0.68);
      /* 건반 양옆 소용돌이 까치발 */
      mesh(track(new THREE.TorusGeometry(0.05, 0.015, 4, 8, Math.PI)), rosewood, g, s2 * 0.73, 0.6, 0.76).rotation.y = Math.PI / 2;
    }
    /* 건반 덮개 판(뒤쪽) */
    box(1.42, 0.06, 0.03, rosewood, g, 0, 0.8, 0.6);
    /* 투각 악보대 */
    const fret = kit.canvas("fretDesk", 256, 96, cg => {
      cg.fillStyle = "#3a1a10";
      cg.fillRect(0, 0, 256, 96);
      cg.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 8; i++) {
        const x = 16 + i * 32;
        cg.beginPath();
        cg.ellipse(x, 48, 10, 30, 0, 0, Math.PI * 2);
        cg.fill();
      }
      cg.globalCompositeOperation = "source-over";
    }, { repeat: false });
    const desk = plane(0.7, 0.26, std({ map: fret, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.3 }), g, 0, 1.06, 0.49);
    desk.rotation.x = -0.25;
    box(0.72, 0.03, 0.05, rosewood, g, 0, 0.93, 0.5);
    const sp = plane(0.42, 0.2, basic({ map: sheetMusic() }), g, 0, 1.06, 0.5);
    sp.rotation.x = -0.25;
    /* 페달 리라: 두 굽은 기둥 + 가로대 + 놋쇠 페달 */
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.07, 0.62, 0.4), new THREE.Vector3(sx * 0.11, 0.4, 0.42), new THREE.Vector3(sx * 0.06, 0.18, 0.44), new THREE.Vector3(sx * 0.08, 0.06, 0.45)]);
      mesh(track(new THREE.TubeGeometry(c, 8, 0.016, 5)), rosewood, g);
    }
    box(0.26, 0.05, 0.1, rosewood, g, 0, 0.06, 0.45);
    for (const x of [-0.06, 0, 0.06]) box(0.02, 0.01, 0.08, brass, g, x, 0.05, 0.52);
    /* 의자(피아노 스툴): 가죽 방석 + 돌린 다리 */
    box(0.8, 0.08, 0.38, leatherBrown, g, 0, 0.5, 1.32);
    box(0.8, 0.06, 0.36, rosewood, g, 0, 0.44, 1.32);
    for (const [x, z] of [[-0.36, 1.18], [0.36, 1.18], [-0.36, 1.46], [0.36, 1.46]]) lathe(turnedLegProfile(0.42, 0.02), 8, rosewood, g, x, 0, z);
    k.blob(0, -0.2, 2.2, 3.0, 0.8, g);
  };

  B.gramophone = g => {
    box(0.6, 0.8, 0.5, walnut, g, 0, 0.4, 0, 0.8);
    box(0.46, 0.14, 0.4, darkWood, g, 0, 0.87, 0, 0.6);
    cyl(0.17, 0.17, 0.02, 20, std({ color: 0x111111, roughness: 0.3 }), g, 0, 0.95, 0);
    const hornMat = std({ color: 0xb89148, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
    const horn = lathe([[0.02, 0], [0.03, 0.15], [0.06, 0.35], [0.14, 0.5], [0.3, 0.6], [0.32, 0.61]], 16, hornMat, g, 0.1, 1.0, -0.05);
    horn.rotation.z = -0.9;
    cyl(0.015, 0.015, 0.3, 6, brass, g, 0.12, 1.02, 0).rotation.z = Math.PI / 2;
    k.blob(0, 0, 0.9, 0.8, 0.6, g);
  };

  B.harp = g => {
    box(0.36, 0.14, 0.3, gold, g, 0, 0.07, 0);
    cyl(0.035, 0.04, 1.75, 10, gold, g, -0.12, 0.95, 0);
    sphere(0.06, gold, g, -0.12, 1.86, 0, 8, 6);
    const neck = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.12, 1.8, 0), new THREE.Vector3(0.12, 1.66, 0), new THREE.Vector3(0.36, 1.55, 0), new THREE.Vector3(0.52, 1.25, 0)]);
    mesh(track(new THREE.TubeGeometry(neck, 12, 0.035, 6)), gold, g);
    const board = box(0.12, 1.25, 0.1, std({ color: 0xc89a5a, roughness: 0.4 }), g, 0.27, 0.72, 0);
    board.rotation.z = -0.38;
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const top = neck.getPoint(Math.min(1, 0.12 + t * 0.88));
      pts.push(0.05 + t * 0.44, 0.14 + t * 1.1, 0, top.x, top.y - 0.03, 0);
    }
    const sg = track(new THREE.BufferGeometry());
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lm = new THREE.LineBasicMaterial({ color: 0xf6eccc, transparent: true, opacity: 0.8 });
    g.add(new THREE.LineSegments(sg, lm));
    k.blob(0, 0, 0.8, 0.6, 0.6, g);
  };

  B.musicStand = g => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.008, 0.008, 0.36, 4, brass, g, Math.cos(a) * 0.12, 0.15, Math.sin(a) * 0.12);
      leg.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    }
    cyl(0.01, 0.01, 1.0, 5, brass, g, 0, 0.75, 0);
    const desk = box(0.5, 0.34, 0.01, brass, g, 0, 1.3, 0.02);
    desk.rotation.x = -0.3;
    const sp = plane(0.44, 0.3, basic({ map: sheetMusic() }), g, 0, 1.31, 0.03);
    sp.rotation.x = -0.3;
  };

  /* 온실 유리 너머: 흐릿한 정원과 하늘(초점이 나간 듯한 배경), 잔디 바닥 */
  B.glassHouse = g => {
    const cylG = track(new THREE.CylinderGeometry(14, 14, 12, 28, 1, true));
    uvx(cylG, 3, 1);
    mesh(cylG, basic({ map: gardenBlurTex(kit), side: THREE.BackSide, fog: false, color: 0xf2f4ee }), g, 0, 3.6, 0);
    const lawn = plane(40, 40, std({ color: 0x6a8a58, roughness: 1 }), g, 0, -0.02, 0);
    lawn.rotation.x = -Math.PI / 2;
    /* 바깥 화단 띠(유리 바로 밖) */
    const bed = std({ color: 0x4e6a3e, roughness: 1 });
    for (const [bw, bd, x, z] of [[9.6, 0.8, 0, -5.6], [9.6, 0.8, 0, 5.6], [0.8, 10.4, -4.6, 0], [0.8, 10.4, 4.6, 0]] as [number, number, number, number][]) {
      box(bw, 0.3, bd, bed, g, x, 0.15, z);
    }
  };

  function leafMaterial(tint = 0xffffff) {
    const leaf = kit.canvas("palmleaf", 128, 512, cg => {
      cg.clearRect(0, 0, 128, 512);
      cg.strokeStyle = "#3e6a32";
      cg.lineWidth = 4;
      cg.beginPath();
      cg.moveTo(64, 512);
      cg.lineTo(64, 0);
      cg.stroke();
      for (let y = 20; y < 500; y += 14) {
        const len = 58 * Math.sin((y / 512) * Math.PI);
        cg.fillStyle = y % 28 ? "#4f8a3e" : "#5e9a48";
        for (const sgn of [-1, 1]) {
          cg.beginPath();
          cg.moveTo(64, y);
          cg.quadraticCurveTo(64 + sgn * len * 0.6, y - 10, 64 + sgn * len, y - 26);
          cg.quadraticCurveTo(64 + sgn * len * 0.5, y - 4, 64, y + 6);
          cg.fill();
        }
      }
    }, { repeat: false });
    return std({ map: leaf, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, color: tint });
  }

  function frond(parent: T.Object3D, len: number, wid: number, droop: number, y: number) {
    const fg = track(new THREE.PlaneGeometry(wid, len, 1, 6));
    const pos = fg.getAttribute("position") as T.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const yy = pos.getY(v) + len / 2;
      pos.setY(v, yy);
      pos.setZ(v, (-droop * (yy * yy)) / len);
    }
    fg.computeVertexNormals();
    const f = mesh(fg, leafMaterial(), parent, 0, y, 0);
    f.rotation.order = "YXZ";
    return f;
  }

  B.pottedPalm = (g, p) => {
    const s = p.scale ?? 1;
    const potTex = kit.canvas("potpat", 256, 128, cg => {
      cg.fillStyle = "#f6f2ea";
      cg.fillRect(0, 0, 256, 128);
      cg.strokeStyle = "#2c4a8a";
      cg.lineWidth = 5;
      for (let x = 0; x < 256; x += 32) {
        cg.beginPath();
        cg.arc(x + 16, 64, 12, 0, Math.PI * 2);
        cg.stroke();
      }
      cg.fillStyle = "#2c4a8a";
      cg.fillRect(0, 10, 256, 8);
      cg.fillRect(0, 110, 256, 8);
    });
    const potKind = String(p.opts?.pot ?? "");
    const pot = potKind ? potMaterial(potKind) : std({ color: 0xffffff, roughness: 0.25, map: potTex });
    /* 마졸리카 화분(자르디니에르)은 세 발 받침대 위에 */
    const lift = potKind === "majolica" ? 0.42 : 0;
    if (lift > 0) {
      const stand = std({ color: 0x2a5a4a, roughness: 0.2 });
      lathe([[0, 0], [0.22, 0], [0.2, 0.04], [0.09, 0.1], [0.07, 0.3], [0.12, 0.38], [0.24, 0.42], [0, 0.42]].map(([r, y]) => [r * s, y * s] as [number, number]), 12, stand, g);
    }
    const potProf: [number, number][] = potKind === "majolica"
      ? [[0, 0], [0.16, 0], [0.24, 0.08], [0.32, 0.3], [0.34, 0.42], [0.38, 0.46], [0.32, 0.48], [0, 0.48]]
      : [[0, 0], [0.2, 0], [0.26, 0.1], [0.3, 0.42], [0.33, 0.46], [0.28, 0.48], [0, 0.48]];
    lathe(potProf.map(([r, y]) => [r * s, y * s + lift * s] as [number, number]), 14, pot, g);
    cyl(0.05 * s, 0.07 * s, 1.0 * s, 7, std({ color: 0x6a5032, roughness: 0.9 }), g, 0, (0.95 + lift) * s, 0);
    const fronds: T.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const upper = i >= 9;
      const f = frond(g, (upper ? 1.0 : 1.4) * s, (upper ? 0.36 : 0.46) * s, (upper ? 0.3 : 0.5) * s, (1.42 + lift - (upper ? -0.04 : 0.02)) * s);
      f.rotation.y = (i / (upper ? 5 : 9)) * Math.PI * 2 + rnd() * 0.3 + (upper ? 0.3 : 0);
      f.rotation.x = upper ? -0.25 - rnd() * 0.25 : -0.6 - rnd() * 0.35;
      fronds.push(f);
    }
    const ph = rnd() * 6;
    animators.push(t => {
      fronds.forEach((f, i) => {
        f.rotation.z = Math.sin(t * 0.6 + ph + i) * 0.025;
      });
    });
    k.blob(0, 0, 1.0 * s, 1.0 * s, 0.7, g);
  };

  B.fern = g => {
    lathe([[0, 0], [0.12, 0], [0.18, 0.08], [0.2, 0.3], [0.22, 0.32], [0, 0.32]], 12, std({ color: 0xb5654a, roughness: 0.8 }), g, 0, 0.62, 0);
    for (const [x, z] of [[-0.14, 0], [0.14, 0], [0, 0.14], [0, -0.14]]) cyl(0.015, 0.015, 0.62, 5, ironWhite, g, x, 0.31, z);
    for (let i = 0; i < 12; i++) {
      const f = frond(g, 0.7, 0.2, 0.6, 0.94);
      f.rotation.y = (i / 12) * Math.PI * 2;
      f.rotation.x = -0.9 - rnd() * 0.4;
    }
  };

  B.planter = g => {
    box(2.4, 0.5, 0.6, std({ color: 0xffffff, roughness: 0.7, map: wallpaper(kit, "wash", "#efeae0", "") }), g, 0, 0.25, 0, 1);
    const leafG = std({ color: 0x4f7a4a, roughness: 0.8 });
    const cols = [0xe86a7a, 0xf2e2a0, 0xffffff, 0xc87ab8, 0xf2a070].map(c => std({ color: c, roughness: 0.7 }));
    for (let i = 0; i < 36; i++) {
      const x = -1.1 + rnd() * 2.2;
      const z = -0.22 + rnd() * 0.44;
      sphere(0.07 + rnd() * 0.05, leafG, g, x, 0.55 + rnd() * 0.1, z, 6, 4);
      if (i % 2 === 0) sphere(0.035, cols[i % cols.length], g, x, 0.66 + rnd() * 0.1, z, 6, 4);
    }
    k.blob(0, 0, 2.8, 1.0, 0.5, g);
  };

  B.wickerBench = g => {
    const weave = kit.canvas("wicker", 128, 128, cg => {
      cg.fillStyle = "#e8e2d2";
      cg.fillRect(0, 0, 128, 128);
      cg.strokeStyle = "rgba(150,130,100,0.6)";
      cg.lineWidth = 3;
      for (let i = -128; i < 256; i += 10) {
        cg.beginPath();
        cg.moveTo(i, 0);
        cg.lineTo(i + 128, 128);
        cg.moveTo(i + 128, 0);
        cg.lineTo(i, 128);
        cg.stroke();
      }
    });
    const wk = std({ map: weave, roughness: 0.85 });
    box(1.5, 0.36, 0.6, wk, g, 0, 0.26, 0, 0.3);
    box(1.5, 0.55, 0.08, wk, g, 0, 0.72, -0.26, 0.3);
    for (const s of [-1, 1]) box(0.08, 0.3, 0.6, wk, g, s * 0.73, 0.58, 0, 0.3);
    box(1.36, 0.1, 0.52, velvetMat("#4F7A4A"), g, 0, 0.49, 0.02);
    for (const x of [-0.4, 0.4]) {
      const c = box(0.36, 0.3, 0.1, linen, g, x, 0.7, -0.17);
      c.rotation.x = -0.2;
    }
    k.blob(0, 0, 1.9, 1.0, 0.6, g);
  };

  B.chaise = g => {
    const plum = velvetMat("#6a2a52");
    box(1.8, 0.24, 0.7, plum, g, 0, 0.36, 0);
    const back = box(0.5, 0.5, 0.7, plum, g, -0.72, 0.68, 0);
    back.rotation.z = 0.35;
    const roll = cyl(0.12, 0.12, 0.7, 12, plum, g, -0.88, 0.86, 0);
    roll.rotation.x = Math.PI / 2;
    box(0.9, 0.36, 0.1, plum, g, -0.3, 0.6, -0.32);
    cabrioles(g, 0.8, 0.27, 0.24, 0.026, gold);
    box(1.82, 0.05, 0.72, gold, g, 0, 0.25, 0);
    sphere(0.14, std({ color: 0xc2a15a, roughness: 0.5 }), g, 0.6, 0.55, 0.05, 8, 6).scale.set(1, 0.5, 1);
    k.blob(0, 0, 2.3, 1.1, 0.7, g);
  };

  B.vanity = g => {
    box(1.2, 0.05, 0.5, walnut, g, 0, 0.76, 0, 0.8);
    for (const x of [-0.45, 0.45]) box(0.28, 0.7, 0.46, walnut, g, x, 0.37, 0, 0.8);
    const mirrorTex = kit.canvas("mirror", 128, 256, cg => {
      const grd = cg.createLinearGradient(0, 0, 128, 256);
      grd.addColorStop(0, "#e8e0f0");
      grd.addColorStop(0.5, "#8a7a9a");
      grd.addColorStop(1, "#d8c8e0");
      cg.fillStyle = grd;
      cg.fillRect(0, 0, 128, 256);
    }, { repeat: false });
    const mir = new THREE.Shape();
    mir.absellipse(0, 0, 0.32, 0.45, 0, Math.PI * 2, false, 0);
    const mg = track(new THREE.ShapeGeometry(mir, 20));
    const uv = mg.getAttribute("uv") as T.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.64 + 0.5, uv.getY(i) / 0.9 + 0.5);
    mesh(mg, std({ map: mirrorTex, roughness: 0.05, metalness: 0.6 }), g, 0, 1.36, -0.18);
    const ring = mesh(track(new THREE.TorusGeometry(1, 0.035, 6, 32)), gold, g, 0, 1.36, -0.17);
    ring.scale.set(0.33, 0.46, 1);
    const bottleCols = [0xd8a0c8, 0xa0c8e8, 0xf0d890, 0xc8e8c0];
    for (let i = 0; i < 4; i++) {
      lathe([[0, 0], [0.03, 0], [0.035, 0.06], [0.012, 0.09], [0.014, 0.12], [0, 0.12]], 8, std({ color: bottleCols[i], roughness: 0.05, transparent: true, opacity: 0.75 }), g, -0.3 + i * 0.13, 0.785, 0.08);
    }
    box(0.18, 0.08, 0.12, gold, g, 0.38, 0.82, 0.06);
    k.blob(0, 0, 1.5, 0.8, 0.6, g);
  };

  B.jewelCase = g => {
    lathe([[0, 0], [0.25, 0], [0.25, 0.04], [0.08, 0.1], [0.07, 0.86], [0.24, 0.9], [0.24, 0.94], [0, 0.94]], 14, walnut, g);
    const dome = mesh(track(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), glass, g, 0, 0.94, 0);
    dome.renderOrder = 3;
    cyl(0.2, 0.2, 0.04, 16, velvetMat("#3a1630"), g, 0, 0.96, 0);
    /* 왕관과 별 (숨은 방 주인의 목걸이와 같은 무늬) */
    const crown = new THREE.Group();
    crown.position.set(0, 0.98, 0);
    g.add(crown);
    const goldDS = std({ color: 0xc9a24e, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
    mesh(track(new THREE.CylinderGeometry(0.075, 0.07, 0.04, 16, 1, true)), goldDS, crown, 0, 0.02, 0);
    const ruby = std({ color: 0x8a1a2a, roughness: 0.1 });
    const sapphire = std({ color: 0x2a3a9a, roughness: 0.1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mesh(track(new THREE.ConeGeometry(0.018, 0.06, 4)), gold, crown, Math.cos(a) * 0.07, 0.07, Math.sin(a) * 0.07);
      sphere(0.009, i % 2 ? ruby : sapphire, crown, Math.cos(a) * 0.074, 0.02, Math.sin(a) * 0.074, 6, 4);
    }
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.035 : 0.015;
      if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    starShape.closePath();
    const star = mesh(track(new THREE.ExtrudeGeometry(starShape, { depth: 0.008, bevelEnabled: false })), gold, g, 0.12, 1.0, 0.06);
    star.rotation.x = -1.2;
    animators.push(t => {
      crown.rotation.y = t * 0.2;
    });
    sparkles(g, 6, 0.18, 1.18, 0.2);
    k.blob(0, 0, 0.8, 0.8, 0.6, g);
  };

  B.candelabra = g => {
    lathe([[0, 0], [0.2, 0], [0.18, 0.05], [0.04, 0.12], [0.03, 1.3], [0.06, 1.34], [0, 1.34]], 12, gold, g);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const x = i === 0 ? 0 : Math.cos(a) * 0.2;
      const z = i === 0 ? 0 : Math.sin(a) * 0.2;
      if (i > 0) {
        const arm = box(0.2, 0.02, 0.02, gold, g, x / 2, 1.34, z / 2);
        arm.rotation.y = -a;
      }
      cyl(0.03, 0.025, 0.03, 8, gold, g, x, 1.36, z);
      candle(g, x, 1.37, z, 0.16);
    }
    k.blob(0, 0, 0.7, 0.7, 0.6, g);
  };

  B.rug = (g, p) => {
    const rw = Number(p.opts?.w ?? 3);
    const rd = Number(p.opts?.d ?? 2);
    const tex = k.rug(kit, String(p.opts?.style ?? "persian"));
    const r = plane(rw, rd, std({ map: tex, roughness: 0.95 }), g, 0, 0.018, 0);
    r.rotation.x = -Math.PI / 2;
    const fringe = std({ color: 0xece0c4, roughness: 1 });
    for (const s of [-1, 1]) box(rw, 0.008, 0.06, fringe, g, 0, 0.012, s * (rd / 2 + 0.03));
  };

  B.runner = (g, p) => {
    const rw = Number(p.opts?.w ?? 1.4);
    const rd = Number(p.opts?.d ?? 10);
    const tex = kit.canvas("runner", 256, 512, cg => {
      cg.fillStyle = "#6a1824";
      cg.fillRect(0, 0, 256, 512);
      cg.fillStyle = "#c2a15a";
      cg.fillRect(12, 0, 10, 512);
      cg.fillRect(234, 0, 10, 512);
      cg.fillStyle = "#2a1014";
      cg.fillRect(26, 0, 22, 512);
      cg.fillRect(208, 0, 22, 512);
      for (let y = 0; y < 512; y += 128) {
        cg.fillStyle = "#c2a15a";
        cg.beginPath();
        cg.moveTo(128, y + 20);
        cg.lineTo(170, y + 64);
        cg.lineTo(128, y + 108);
        cg.lineTo(86, y + 64);
        cg.closePath();
        cg.fill();
        cg.fillStyle = "#6a1824";
        cg.beginPath();
        cg.arc(128, y + 64, 14, 0, Math.PI * 2);
        cg.fill();
      }
    });
    const geo = track(new THREE.PlaneGeometry(rw, rd));
    uvx(geo, 1, rd / (rw * 2));
    const r = mesh(geo, std({ map: tex, roughness: 0.95 }), g, 0, 0.016, 0);
    r.rotation.x = -Math.PI / 2;
  };

  function place(p: Prop) {
    const fn = B[p.kind];
    if (!fn) return;
    const g = new THREE.Group();
    g.name = p.kind;
    g.position.set(p.at[0], 0, p.at[1]);
    g.rotation.y = (p.rot ?? 0) * DEG;
    if (p.scale && p.kind !== "pottedPalm") g.scale.setScalar(p.scale);
    group.add(g);
    fn(g, p);
  }

  return { place };
}
