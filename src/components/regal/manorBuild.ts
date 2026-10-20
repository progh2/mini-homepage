/* 왕실 스킨(영국 대저택)의 3D 조립 코드입니다.

   방 설정(rooms.ts)을 읽어 방 하나를 THREE.Group 으로 만듭니다.
   소품과 인물은 모두 이 파일에서 기본 도형으로 직접 만듭니다(외부 3D 모델 없음).
   재질 사진은 Poly Haven CC0, 그림은 퍼블릭 도메인입니다. CREDITS.md 참고.

   성능 규칙(디자이너 지침):
   - 방마다 실시간 조명 1개 + 환경광. 그림자 계산은 끄고 바닥에 둥근 그림자 판을 깝니다.
   - 벽 모서리/바닥 가장자리의 어두움은 그라데이션 판으로 미리 칠해 둡니다(베이크).
   - 텍스처는 URL 하나에 한 장만 올리고, 반복 크기와 회전은 UV 로 바꿉니다.
   - 방 하나 3만 삼각형, 인물 3천 삼각형 이하. */

import type * as T from "three";
import type { Character, Door, FigureLook, Painting, Prop, Room, Side, Window } from "./rooms";

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
  | { type: "door"; to: string }
  | { type: "character" };

export type BuiltRoom = {
  room: Room;
  group: T.Group;
  hits: T.Object3D[];
  head: T.Vector3;
  animate: (t: number) => void;
  dispose: () => void;
  triangles: number;
};

export type Kit = ReturnType<typeof createKit>;

const DEG = Math.PI / 180;
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
      } else if (kind === "wash") {
        /* 석회 물칠(워시) 마감 */
        const rnd = mulberry(11);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = `rgba(${rnd() > 0.5 ? "255,250,240" : "90,70,50"},${0.02 + rnd() * 0.035})`;
          g.beginPath();
          g.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
          g.fill();
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
    const src = kind === "velvet" ? `${TEX}velour_velvet_diff.webp` : kind === "wash" ? `${TEX}plastered_wall_diff.webp` : `${TEX}floral_jacquard_diff.webp`;
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

/* 양탄자. 가장자리 띠와 가운데 메달리온을 그린 한 장짜리(반복 없음). */
function rugTexture(kit: Kit, style: string) {
  const pal: Record<string, [string, string, string, string]> = {
    persian: ["#6e1e22", "#1f2a44", "#c9a25a", "#e8d8b8"],
    hall: ["#6a1a24", "#2a1a14", "#c2a15a", "#e6d4ae"],
    sage: ["#7e8c6c", "#e9e2cf", "#b78f5a", "#f4eedf"],
    rose: ["#a86a6e", "#efe2d6", "#c2a15a", "#f6ece4"],
    blue: ["#4e6c94", "#e8e2d2", "#c2a15a", "#f2ecdf"],
    plum: ["#3a1630", "#6a2a52", "#c2a15a", "#e8d2c8"]
  };
  const [field, border, gold, ivory] = pal[style] ?? pal.persian;
  return kit.canvas(`rug:${style}`, 512, 512, g => {
    const rnd = mulberry(style.length * 97);
    g.fillStyle = field;
    g.fillRect(0, 0, 512, 512);
    /* 섬유 결 */
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? "255,240,220" : "20,10,6"},${0.03 + rnd() * 0.04})`;
      g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1);
    }
    g.strokeStyle = border;
    g.lineWidth = 42;
    g.strokeRect(30, 30, 452, 452);
    g.strokeStyle = gold;
    g.lineWidth = 4;
    g.strokeRect(8, 8, 496, 496);
    g.strokeRect(54, 54, 404, 404);
    /* 띠 안의 작은 무늬 */
    g.fillStyle = ivory;
    for (let k = 0; k < 18; k++) {
      const t = 40 + k * 24.6;
      for (const [x, y] of [[t, 30], [t, 482], [30, t], [482, t]]) {
        g.beginPath();
        g.moveTo(x, y - 7);
        g.lineTo(x + 7, y);
        g.lineTo(x, y + 7);
        g.lineTo(x - 7, y);
        g.fill();
      }
    }
    /* 메달리온 */
    g.save();
    g.translate(256, 256);
    for (let r = 120; r > 10; r -= 22) {
      g.fillStyle = r % 44 === 32 ? border : r % 44 === 10 ? gold : ivory;
      g.beginPath();
      for (let a = 0; a <= 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const rr = r * (a % 2 === 0 ? 1 : 0.82);
        g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr * 0.75);
      }
      g.fill();
    }
    g.restore();
    for (const [x, y] of [[96, 96], [416, 96], [96, 416], [416, 416]]) {
      g.fillStyle = border;
      g.beginPath();
      g.arc(x, y, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = gold;
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
    }
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

  const wallH = room.ceiling === "barrelVault" ? h - w / 2 : room.ceiling === "glassDome" ? h - 1.4 : h;

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
  const glass = std({ color: 0xdfe8ec, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const linen = std({ color: 0xf4eee2, roughness: 0.9 });

  const trimMat =
    room.walls === "panelledStone" || room.walls === "velvet" || room.walls === "redDamask"
      ? darkWood
      : room.walls === "plumVelvet"
        ? walnut
        : paintWhite;

  /* ---------- 바닥 ---------- */

  function buildFloor() {
    const g = track(new THREE.PlaneGeometry(w, d));
    let m: T.Material;
    const rot = room.floor === "gallery" || room.floor === "walnut" ? Math.PI / 2 : 0;
    switch (room.floor) {
      case "marbleChecker":
        m = std({ map: checkerFloor(kit, "#EDE8DE", "#2B2A28"), roughness: 0.14, metalness: 0.02 });
        uvx(g, w / 3.6, d / 3.6);
        break;
      case "oak":
        m = std({ map: kit.texture(`${TEX}old_wood_floor_diff.webp`), color: 0xf6e2c4, roughness: 0.45 });
        uvx(g, w / 2.4, d / 2.4, Math.PI / 2, 0.13, 0.41);
        break;
      case "walnut":
        m = std({ map: kit.texture(`${TEX}old_wood_floor_diff.webp`), color: 0x8a6448, roughness: 0.5 });
        uvx(g, w / 2.2, d / 2.2, rot, 0.3, 0.7);
        break;
      case "parquet":
        m = std({ map: kit.texture(`${TEX}herringbone_parquet_diff.webp`), normalMap: kit.texture(`${TEX}herringbone_parquet_nor.webp`, false), roughness: 0.32 });
        uvx(g, w / 1.8, d / 1.8, 0.0, 0.2, 0.1);
        break;
      case "darkParquet":
        m = std({ map: kit.texture(`${TEX}herringbone_parquet_diff.webp`), color: 0x7a4e44, roughness: 0.34 });
        uvx(g, w / 1.6, d / 1.6, Math.PI / 4);
        break;
      case "mosaic":
        m = std({ map: kit.texture(`${TEX}marble_mosaic_tiles_diff.webp`), color: 0xf4ece4, roughness: 0.3 });
        uvx(g, w / 2.6, d / 2.6, 0, 0.37, 0.11);
        break;
      case "terracotta":
        m = std({ map: kit.texture(`${TEX}terracotta_floor_tiles_diff.webp`), normalMap: kit.texture(`${TEX}terracotta_floor_tiles_nor.webp`, false), color: 0xe8a088, roughness: 0.7 });
        uvx(g, w / 2.4, d / 2.4, 0.0, 0.5, 0.25);
        break;
      default:
        m = std({ map: kit.texture(`${TEX}old_wood_floor_diff.webp`), color: 0x7e5a40, roughness: 0.42 });
        uvx(g, w / 2.2, d / 2.2, rot, 0.6, 0.2);
    }
    const f = mesh(g, m, group);
    f.rotation.x = -Math.PI / 2;

    /* 대리석 바닥 가장자리 띠와 가운데 문양(데칼) */
    if (room.floor === "marbleChecker" || room.floor === "mosaic") {
      const band = std({ color: 0x3a2e26, roughness: 0.2, map: kit.texture(`${TEX}marble_01_diff.webp`) });
      for (const [bw, bd, x, z] of [[w, 0.35, 0, -d / 2 + 0.175], [w, 0.35, 0, d / 2 - 0.175], [0.35, d, -w / 2 + 0.175, 0], [0.35, d, w / 2 - 0.175, 0]] as [number, number, number, number][]) {
        const b = plane(bw, bd, band, group, x, 0.004, z);
        b.rotation.x = -Math.PI / 2;
      }
    }
    if (room.floor === "marbleChecker") {
      const star = kit.canvas("compass", 512, 512, gg => {
        gg.translate(256, 256);
        gg.fillStyle = "rgba(194,161,90,0.95)";
        gg.beginPath();
        gg.arc(0, 0, 250, 0, Math.PI * 2);
        gg.arc(0, 0, 236, 0, Math.PI * 2, true);
        gg.fill();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const r = k % 2 === 0 ? 228 : 150;
          gg.fillStyle = k % 4 === 0 ? "#2b2a28" : k % 2 === 0 ? "#7a1f2b" : "#c2a15a";
          gg.beginPath();
          gg.moveTo(0, 0);
          gg.lineTo(Math.cos(a - 0.12) * 40, Math.sin(a - 0.12) * 40);
          gg.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          gg.lineTo(Math.cos(a + 0.12) * 40, Math.sin(a + 0.12) * 40);
          gg.fill();
        }
        gg.fillStyle = "#ede8de";
        gg.beginPath();
        gg.arc(0, 0, 30, 0, Math.PI * 2);
        gg.fill();
      }, { repeat: false });
      floorDecal(star, 3.2, 3.2, 0, -1.6, 0.92, 0.008);
    }
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
    group.add(g);
    return { side, len, group: g };
  }

  const doorSize = (door: Door) => {
    const dw = room.id === "hall" ? 2.1 : 1.75;
    const dh = Math.min(room.id === "hall" ? 3.4 : 3.0, wallH - 0.5);
    void door;
    return { dw, dh };
  };

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

  function wallMaterial(): T.Material {
    const p = room.palette;
    switch (room.walls) {
      case "panelledStone":
        return std({ map: wallpaper(kit, "wash", "#d8c8ac", ""), roughness: 0.9 });
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

  function buildWall(wall: Wall, doors: Door[], wins: Window[]) {
    const { len, group: wg } = wall;
    const shape = new THREE.Shape();
    shape.moveTo(-len / 2, 0);
    shape.lineTo(len / 2, 0);
    shape.lineTo(len / 2, wallH);
    shape.lineTo(-len / 2, wallH);
    shape.closePath();
    const lowHoles: [number, number][] = [];
    for (const door of doors) {
      if (door.secret) continue;
      const { dw, dh } = doorSize(door);
      const p = new THREE.Path();
      archPath(p, door.offset ?? 0, dw, dh, true);
      shape.holes.push(p);
      lowHoles.push([(door.offset ?? 0) - dw / 2 - 0.14, (door.offset ?? 0) + dw / 2 + 0.14]);
    }
    for (const win of wins) {
      const p = new THREE.Path();
      p.moveTo(win.offset - win.w / 2, win.sill);
      p.lineTo(win.offset - win.w / 2, win.sill + win.h);
      p.lineTo(win.offset + win.w / 2, win.sill + win.h);
      p.lineTo(win.offset + win.w / 2, win.sill);
      p.closePath();
      shape.holes.push(p);
    }
    if (room.walls === "glass") {
      buildGlassWall(wall, doors);
      return;
    }
    const g = track(new THREE.ShapeGeometry(shape, 8));
    const tile = room.walls === "panelledStone" ? 2.4 : room.walls === "velvet" ? 1.4 : 0.9;
    uvx(g, 1 / tile, 1 / tile, 0, rnd(), rnd());
    mesh(g, wallMaterial(), wg);

    const spans = freeSpans(len, lowHoles);
    const dadoH = room.walls === "panelledStone" ? 1.5 : room.walls === "wedgwood" ? 0.9 : room.walls === "velvet" ? 0.95 : 0.92;
    const panelled = room.walls === "panelledStone" || room.walls === "velvet" || room.walls === "redDamask";
    const dadoMat = panelled ? darkWood : room.walls === "plumVelvet" ? walnut : paintWhite;

    for (const [a, b] of spans) {
      const sw = b - a;
      const cx = (a + b) / 2;
      /* 징두리 판벽 */
      const dado = box(sw, dadoH, 0.04, dadoMat, wg, cx, dadoH / 2, 0.02, panelled ? 1.2 : 0);
      void dado;
      /* 판벽 안의 몰딩 사각형 */
      const n = Math.max(1, Math.round(sw / 1.1));
      const pw = sw / n;
      for (let i = 0; i < n; i++) {
        const px = a + pw * (i + 0.5);
        const fw = pw - 0.22;
        const fh = dadoH - 0.42;
        if (fw < 0.2) continue;
        for (const [bw2, bh2, x2, y2] of [[fw, 0.025, px, 0.24 + fh], [fw, 0.025, px, 0.24], [0.025, fh, px - fw / 2, 0.24 + fh / 2], [0.025, fh, px + fw / 2, 0.24 + fh / 2]] as [number, number, number, number][]) {
          box(bw2, bh2, 0.025, panelled ? gold : trimMat, wg, x2, y2, 0.05);
        }
      }
      /* 걸레받이와 의자 몰딩 */
      box(sw, 0.2, 0.06, panelled ? darkWood : trimMat, wg, cx, 0.1, 0.03);
      box(sw, 0.05, 0.07, panelled ? gold : trimMat, wg, cx, dadoH, 0.04);
    }
    /* 코니스(3단) */
    box(len, 0.12, 0.08, trimMat === darkWood ? paintWhite : trimMat, wg, 0, wallH - 0.06, 0.04);
    box(len, 0.08, 0.16, trimMat === darkWood ? paintWhite : trimMat, wg, 0, wallH - 0.18, 0.08);
    box(len, 0.04, 0.05, gold, wg, 0, wallH - 0.27, 0.03);
    /* 그림 레일 */
    box(len, 0.03, 0.03, gold, wg, 0, wallH - 0.62, 0.02);

    /* 웨지우드 패널: 크림 벽에 파란 판 + 흰 몰딩 */
    if (room.walls === "wedgwood") {
      const blue = std({ color: new THREE.Color(room.palette.second), roughness: 0.8, map: wallpaper(kit, "wash", room.palette.second, "") });
      const top = wallH - 0.8;
      const y0 = dadoH + 0.25;
      const spansUp = freeSpans(len, [...lowHoles, ...wins.map(wn => [wn.offset - wn.w / 2 - 0.2, wn.offset + wn.w / 2 + 0.2] as [number, number])]);
      for (const [a, b] of spansUp) {
        const sw = b - a;
        if (sw < 0.9) continue;
        const n = Math.max(1, Math.round(sw / 1.6));
        const pw = sw / n;
        for (let i = 0; i < n; i++) {
          const px = a + pw * (i + 0.5);
          const fw = pw - 0.36;
          const fh = top - y0;
          plane(fw, fh, blue, wg, px, y0 + fh / 2, 0.012);
          for (const [bw2, bh2, x2, y2] of [[fw + 0.08, 0.05, px, y0 + fh], [fw + 0.08, 0.05, px, y0], [0.05, fh, px - fw / 2, y0 + fh / 2], [0.05, fh, px + fw / 2, y0 + fh / 2]] as [number, number, number, number][]) {
            box(bw2, bh2, 0.04, paintWhite, wg, x2, y2, 0.02);
          }
          /* 메달리온(카메오) */
          const cameo = sphere(0.14, paintWhite, wg, px, y0 + fh * 0.62, 0.02, 14, 8);
          cameo.scale.set(0.8, 1, 0.18);
        }
      }
    }

    /* 대홀 벽기둥(필라스터) */
    if (room.walls === "panelledStone") {
      const stone = std({ map: wallpaper(kit, "wash", "#e2d6c0", ""), roughness: 0.8 });
      for (const u of [-len / 2 + 0.4, -len / 4 - 0.3, len / 4 + 0.3, len / 2 - 0.4]) {
        if (lowHoles.some(([a, b]) => u > a - 0.3 && u < b + 0.3)) continue;
        box(0.5, wallH - 1.9, 0.14, stone, wg, u, dadoH + (wallH - 1.9) / 2 - 0.0, 0.07, 1);
        box(0.66, 0.22, 0.22, stone, wg, u, wallH - 0.5, 0.11);
        box(0.6, 0.1, 0.2, gold, wg, u, wallH - 0.36, 0.1);
      }
    }

    /* 벽 모서리 그늘(베이크): 위아래 */
    const vg = vGradient(kit);
    const shadeTop = basic({ map: vg, transparent: true, opacity: 0.35, depthWrite: false, color: 0x000000 });
    const top = plane(len, 0.9, shadeTop, wg, 0, wallH - 0.45, 0.13);
    top.rotation.z = Math.PI;
    top.renderOrder = 2;
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
      box(b - a + 0.1, 0.06, 0.06, ironWhite, wg, (a + b) / 2, 3.1, 0.02);
      const pane = plane(b - a, wallH - 3.1, glass, wg, (a + b) / 2, 3.1 + (wallH - 3.1) / 2, 0);
      pane.renderOrder = 3;
    }
  }

  /* ---------- 천장 ---------- */

  function buildCeiling() {
    const plaster = std({ map: wallpaper(kit, "wash", room.ceiling === "beamed" ? "#3e2c1e" : "#f1ebdf", ""), roughness: 0.92 });
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
    const c = plane(w, d, plaster, group, 0, h, 0);
    uvx(c.geometry, w / 2.5, d / 2.5);
    c.rotation.x = Math.PI / 2;

    if (room.ceiling === "coffered") {
      const step = 2;
      for (let x = -w / 2 + step; x < w / 2 - 0.1; x += step) box(0.32, 0.4, d, paintWhite, group, x, h - 0.2, 0);
      for (let z = -d / 2 + step; z < d / 2 - 0.1; z += step) box(w, 0.4, 0.32, paintWhite, group, 0, h - 0.2, z);
      /* 칸마다 금빛 장미 장식 */
      for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
        for (let z = -d / 2 + step / 2; z < d / 2; z += step) {
          const ros = cyl(0.16, 0.2, 0.06, 10, gold, group, x, h - 0.04, z);
          void ros;
          const inset = plane(step - 0.5, step - 0.5, std({ color: 0xc9b48c, roughness: 0.9 }), group, x, h - 0.01, z);
          inset.rotation.x = Math.PI / 2;
        }
      }
    } else if (room.ceiling === "beamed") {
      for (let x = -w / 2 + 1.0; x < w / 2; x += 1.6) box(0.24, 0.28, d, darkWood, group, x, h - 0.14, 0, 1.4);
    } else {
      /* 석고 몰딩 천장: 사각 테 + 가운데 장미 */
      const inset = 0.8;
      for (const [bw, bd, x, z] of [[w - inset * 2, 0.08, 0, -d / 2 + inset], [w - inset * 2, 0.08, 0, d / 2 - inset], [0.08, d - inset * 2, -w / 2 + inset, 0], [0.08, d - inset * 2, w / 2 - inset, 0]] as [number, number, number, number][]) {
        box(bw, 0.06, bd, paintWhite, group, x, h - 0.03, z);
        box(bw + (bw > bd ? 0 : 0.06), 0.04, bd + (bd > bw ? 0 : 0.06), gold, group, x, h - 0.07, z);
      }
      if (room.ceiling === "panelled") {
        for (let x = -w / 2 + 2.2; x < w / 2 - 1; x += 2.2) box(0.06, 0.05, d - inset * 2, paintWhite, group, x, h - 0.03, 0);
        const blue = std({ color: new THREE.Color(room.palette.second), roughness: 0.85 });
        const p2 = plane(w - inset * 2 - 0.3, d - inset * 2 - 0.3, blue, group, 0, h - 0.005, 0);
        p2.rotation.x = Math.PI / 2;
      }
      lathe([[0.02, 0], [0.55, 0], [0.5, -0.05], [0.36, -0.08], [0.2, -0.12], [0.02, -0.14]], 18, paintWhite, group, 0, h, room.id === "drawing" ? -0.2 : -0.4);
    }
  }

  /* ---------- 문 ---------- */

  function buildDoor(wall: Wall, door: Door) {
    if (door.secret) return;
    const wg = wall.group;
    const { dw, dh } = doorSize(door);
    const cx = door.offset ?? 0;
    const r = dw / 2;
    const spring = dh - r;
    const hit: Hit = { type: "door", to: door.to };
    const hitGroup = new THREE.Group();
    wg.add(hitGroup);

    /* 아키트레이브(문틀) */
    const outer = new THREE.Shape();
    archPath(outer, cx, dw + 0.36, dh + 0.18);
    const inner = new THREE.Path();
    archPath(inner, cx, dw, dh, true);
    outer.holes.push(inner);
    const frameMat = room.walls === "glass" ? ironWhite : room.id === "hall" ? marble : trimMat === darkWood ? darkWood : paintWhite;
    const fg = track(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 6 }));
    uvx(fg, 0.8, 0.8);
    mesh(fg, frameMat, wg, 0, 0, 0.0);
    box(0.22, 0.3, 0.16, frameMat === darkWood ? gold : marble, wg, cx, dh + 0.06, 0.08);

    /* 문 안쪽 두께와 너머 */
    const reveal = std({ color: 0x3a2a1e, roughness: 0.8 });
    box(0.06, dh, 0.4, reveal, wg, cx - r - 0.03, dh / 2, -0.2);
    box(0.06, dh, 0.4, reveal, wg, cx + r + 0.03, dh / 2, -0.2);
    const beyondCol = new THREE.Color(ctx.roomColor(door.to));
    const beyondTex = kit.canvas(`beyond:${door.to}`, 64, 128, g => {
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, "#fff8e8");
      grd.addColorStop(0.6, "#c8b8a0");
      grd.addColorStop(1, "#4a3a2a");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 128);
    }, { repeat: false });
    const beyond = basic({ map: beyondTex, color: beyondCol.clone().lerp(new THREE.Color(0xffffff), 0.35) });
    const bshape = new THREE.Shape();
    archPath(bshape, 0, dw + 0.1, dh + 0.05);
    const bg = track(new THREE.ShapeGeometry(bshape, 8));
    /* ShapeGeometry UV 는 위치(m) 그대로라 0..1 로 줄입니다. */
    const uv = bg.getAttribute("uv") as T.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + dw / 2) / dw, uv.getY(i) / dh);
    mesh(bg, beyond, hitGroup, cx, 0, -0.42);

    /* 반쯤 열린 두 짝 문 */
    const leafMat = room.walls === "glass" ? ironWhite : room.id === "music" || room.id === "drawing" || room.id === "reception" ? paintWhite : darkWood;
    for (const sideSign of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(cx + sideSign * r, 0, -0.06);
      hinge.rotation.y = sideSign * -0.55;
      hitGroup.add(hinge);
      const lw = r - 0.02;
      const lx = -sideSign * (lw / 2);
      box(lw, spring, 0.06, leafMat, hinge, lx, spring / 2, 0, 1);
      if (room.walls === "glass") {
        plane(lw - 0.12, spring - 0.3, glass, hinge, lx, spring / 2, 0.035);
      } else {
        for (const [ph, py] of [[spring * 0.42, spring * 0.7], [spring * 0.32, spring * 0.24]]) {
          box(lw - 0.2, ph, 0.03, leafMat, hinge, lx, py, 0.04, 1);
          box(lw - 0.14, 0.02, 0.02, gold, hinge, lx, py + ph / 2 + 0.03, 0.045);
        }
      }
      sphere(0.035, brass, hinge, lx - sideSign * (lw / 2 - 0.1), 1.05, 0.06, 8, 6);
    }
    /* 반원 채광창 */
    const fan = new THREE.Shape();
    fan.moveTo(cx - r, spring);
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI - (i / 16) * Math.PI;
      fan.lineTo(cx + Math.cos(a) * r, spring + Math.sin(a) * r);
    }
    fan.closePath();
    const fanMat = std({ color: 0xfff1d6, emissive: new THREE.Color(0xffe2b0), emissiveIntensity: 0.55, roughness: 0.2, transparent: true, opacity: 0.85 });
    mesh(track(new THREE.ShapeGeometry(fan, 8)), fanMat, hitGroup, 0, 0, -0.04);
    for (let k = 1; k < 6; k++) {
      const a = Math.PI - (k / 6) * Math.PI;
      const bar = box(0.025, r, 0.03, room.walls === "glass" ? ironWhite : gold, hitGroup, cx + (Math.cos(a) * r) / 2, spring + (Math.sin(a) * r) / 2, -0.03);
      bar.rotation.z = a - Math.PI / 2;
    }
    box(dw, 0.05, 0.06, room.walls === "glass" ? ironWhite : gold, hitGroup, cx, spring, -0.03);

    /* 황동 문패 */
    const name = door.plaque ?? ctx.roomName(door.to);
    const plaqueTex = plaqueTexture(kit, name, door.plaque ? "Entrance" : roomEn(door.to));
    const pq = new THREE.Group();
    pq.position.set(cx + r + 0.62, 1.55, 0.03);
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
    const pane = plane(ww, wh, basic({ map: skyTex }), wg, cx, sill + wh / 2, -0.08);
    void pane;
    /* 창틀, 창살(조지언 6x2 칸) */
    const fm = room.walls === "velvet" || room.walls === "plumVelvet" ? walnut : paintWhite;
    for (const [bw, bh, x, y] of [[ww + 0.2, 0.12, cx, sill + wh + 0.06], [ww + 0.3, 0.1, cx, sill - 0.05], [0.1, wh, cx - ww / 2 - 0.05, sill + wh / 2], [0.1, wh, cx + ww / 2 + 0.05, sill + wh / 2]] as [number, number, number, number][]) {
      box(bw, bh, 0.16, fm, wg, x, y, 0.0);
    }
    box(ww + 0.4, 0.06, 0.28, fm, wg, cx, sill - 0.02, 0.1);
    for (let i = 1; i < 3; i++) box(0.03, wh, 0.04, fm, wg, cx - ww / 2 + (ww / 3) * i, sill + wh / 2, -0.05);
    for (let j = 1; j < 4; j++) box(ww, 0.03, 0.04, fm, wg, cx, sill + (wh / 4) * j, -0.05);
    box(ww, 0.06, 0.06, fm, wg, cx, sill + wh / 2, -0.04);
    /* 커튼과 커튼 상자 */
    const curtain = velvetMat(room.walls === "chintz" ? "#c7a888" : room.walls === "wedgwood" ? "#8aa2c4" : room.palette.main);
    for (const s of [-1, 1]) {
      const cg = track(new THREE.CylinderGeometry(0.16, 0.24, wh + 0.5, 10, 1, true, 0, Math.PI));
      uvx(cg, 1, 2);
      const c = mesh(cg, curtain, wg, cx + s * (ww / 2 + 0.2), sill + (wh + 0.5) / 2 - 0.15, 0.14);
      c.rotation.y = Math.PI;
      c.scale.z = 0.5;
      sphere(0.04, gold, wg, cx + s * (ww / 2 + 0.33), sill + wh * 0.35, 0.2, 8, 6);
    }
    box(ww + 0.9, 0.34, 0.12, curtain, wg, cx, sill + wh + 0.32, 0.18);
    box(ww + 0.95, 0.04, 0.14, gold, wg, cx, sill + wh + 0.15, 0.19);

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

  const props = makeProps({
    THREE, kit, room, group, std, basic, box, cyl, sphere, lathe, plane, mesh, track, uvx, blob, floorDecal, setHit,
    gold, brass, darkWood, walnut, oakMat, marble, paintWhite, blackGloss, ironWhite, leatherRed, leatherBrown, velvetMat, glass, linen,
    rnd, animators, wallH, flame: flameSheet(kit), sparkle: sparkleTexture(kit), rug: rugTexture, label: labelTexture
  });
  room.props.forEach(p => props.place(p));

  /* ---------- 인물 ---------- */
  const head = new THREE.Vector3();
  const charGroup = new THREE.Group();
  group.add(charGroup);
  const ch = room.character;
  const camPos = new THREE.Vector3(...room.camera.pos);
  if (ch.kind === "figure") {
    const fig = props.figure(ch.look);
    charGroup.add(fig.root);
    let at: [number, number] = ch.at;
    let yaw = ch.rot * DEG;
    if (ch.look.pose === "sitPiano") {
      const piano = room.props.find(p => p.kind === "grandPiano");
      const pr = (piano?.rot ?? 0) * DEG;
      const [px, pz] = piano?.at ?? [0, 0];
      at = [px + Math.sin(pr) * 1.32, pz + Math.cos(pr) * 1.32];
      yaw = pr + Math.PI;
    } else if (ch.look.pose !== "sitTeacup") {
      yaw = Math.atan2(camPos.x - at[0], camPos.z - at[1]) + ch.rot * DEG;
    }
    charGroup.position.set(at[0], 0, at[1]);
    charGroup.rotation.y = yaw;
    if (ch.look.pose !== "sitTeacup" && ch.look.pose !== "sitPiano") blob(0, 0, 0.9, 0.7, 0.8, charGroup);
    animators.push(fig.animate);
    charGroup.updateMatrixWorld(true);
    fig.headAnchor.getWorldPosition(head);
  } else {
    buildCutout(ch);
  }
  setHit(charGroup, { type: "character" });

  function buildCutout(c: Extract<Character, { kind: "cutout" }>) {
    const tex = kit.texture(c.src);
    const ph = c.height;
    const pw = ph * c.aspect;
    const m = std({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.9, side: THREE.DoubleSide });
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = 0.32;
    const pivot = new THREE.Group();
    charGroup.add(pivot);
    const board = plane(pw, ph, m, pivot, 0, ph / 2, 0);
    void board;
    charGroup.position.set(c.at[0], 0, c.at[1]);
    charGroup.rotation.y = Math.atan2(camPos.x - c.at[0], camPos.z - c.at[1]);
    blob(0, 0.05, pw * 1.6, 0.6, 0.85, charGroup);
    /* 숨쉬기와 고개(판 그림이라 아주 조금 흔들림) */
    animators.push(t => {
      pivot.scale.y = 1 + Math.sin(t * 1.7) * 0.006;
      pivot.rotation.z = Math.sin(t * 0.45) * 0.008;
    });
    head.set(c.at[0], ph * 0.92, c.at[1]);
  }

  /* ---------- 조명 ---------- */
  const amb = new THREE.HemisphereLight(new THREE.Color(room.ambient.sky), new THREE.Color(room.ambient.ground), room.ambient.intensity);
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
};

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

  B.twinStair = g => {
    const back = -1.4;
    const topY = 3.2;
    const steps = 18;
    const rise = topY / steps;
    const tread = 4.0 / steps;
    const runner = velvetMat("#7a1f2b");
    for (const s of [-1, 1]) {
      for (let i = 0; i < steps; i++) {
        const x = s * (1.6 + tread * (i + 0.5));
        const y = rise * (i + 1);
        box(tread + 0.01, y, 1.4, marble, g, x, y / 2, 0.6, 1.4);
        box(tread + 0.012, 0.012, 0.9, runner, g, x, y + 0.006, 0.6);
        box(tread + 0.02, 0.03, 1.44, marble, g, x, y - 0.015, 0.6);
      }
      for (let i = 0; i < steps; i += 2) {
        const x = s * (1.6 + tread * (i + 0.5));
        lathe(baluster, 7, marble, g, x, rise * (i + 1), 1.24);
      }
      const len = Math.hypot(4.0, topY);
      const rail = box(len, 0.08, 0.1, darkWood, g, s * (1.6 + 2.0), topY / 2 + 0.88, 1.24);
      rail.rotation.z = s * Math.atan2(topY, 4.0);
      box(0.26, 1.1, 0.26, marble, g, s * 1.62, 0.55, 1.24);
      cyl(0.03, 0.03, 0.4, 6, brass, g, s * 1.62, 1.3, 1.24);
      sphere(0.12, emissive(0xffe6b8, 1.4), g, s * 1.62, 1.58, 1.24, 10, 8);
      k.blob(s * 3.6, 0.6, 4.4, 2.0, 0.5, g);
    }
    box(12, 0.32, 1.2, marble, g, 0, topY - 0.16, back + 0.6, 2);
    box(12, 0.12, 0.08, gold, g, 0, topY - 0.36, back + 1.2);
    for (let x = -5.4; x <= 5.4; x += 0.32) lathe(baluster, 7, marble, g, x, topY, back + 1.12);
    box(11, 0.08, 0.12, darkWood, g, 0, topY + 0.88, back + 1.12);
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
    const head = sphere(0.11, white, g, 0, 1.73, 0.01, 14, 10);
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
    for (const [x, z] of [[-0.5, -0.23], [0.5, -0.23], [-0.5, 0.23], [0.5, 0.23]]) cyl(0.025, 0.015, 0.62, 6, walnut, g, x, 0.31, z);
    box(0.24, 0.04, 0.3, std({ color: 0x6a1f22, roughness: 0.6 }), g, -0.2, 0.8, 0.02);
    cyl(0.03, 0.035, 0.05, 8, std({ color: 0x1a1a1a, roughness: 0.2 }), g, 0.32, 0.805, -0.1);
    k.blob(0, 0, 1.4, 0.8, 0.6, g);
  };

  B.windowChair = g => {
    const fabric = velvetMat("#cdb79a");
    box(0.56, 0.12, 0.52, fabric, g, 0, 0.46, 0);
    box(0.56, 0.6, 0.1, fabric, g, 0, 0.82, -0.23);
    box(0.6, 0.04, 0.12, walnut, g, 0, 1.13, -0.23);
    for (const [x, z] of [[-0.24, -0.22], [0.24, -0.22], [-0.24, 0.22], [0.24, 0.22]]) cyl(0.022, 0.016, 0.4, 6, walnut, g, x, 0.2, z);
    k.blob(0, 0, 0.9, 0.9, 0.6, g);
  };

  B.consoleTable = g => {
    box(1.3, 0.05, 0.45, marble, g, 0, 0.88, 0);
    box(1.24, 0.12, 0.4, gold, g, 0, 0.8, 0);
    for (const x of [-0.56, 0.56]) {
      const leg = box(0.06, 0.74, 0.06, gold, g, x, 0.37, 0.12);
      leg.rotation.z = x > 0 ? -0.06 : 0.06;
    }
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

  /* 책장 한 칸(바닥 수납장 + 선반 + 책등 띠). 앞면 +z. */
  function shelfSection(parent: T.Object3D, cx: number, sw: number, top: number, dpt: number, spineMat: T.Material) {
    box(0.05, top, dpt, walnut, parent, cx - sw / 2, top / 2, 0, 0.8);
    box(0.05, top, dpt, walnut, parent, cx + sw / 2, top / 2, 0, 0.8);
    box(sw, top, 0.02, darkWood, parent, cx, top / 2, -dpt / 2 + 0.01);
    box(sw, 0.7, dpt, walnut, parent, cx, 0.35, 0.0, 0.8);
    box(sw - 0.16, 0.5, 0.02, darkWood, parent, cx, 0.36, dpt / 2 + 0.005);
    for (let y = 0.74; y < top - 0.3; y += 0.38) {
      box(sw, 0.03, dpt, walnut, parent, cx, y, 0);
      const row = plane(sw - 0.05, 0.33, spineMat, parent, cx, y + 0.18, -dpt / 2 + 0.12);
      uvx(row.geometry, (sw - 0.05) / 2.4, 1, 0, rnd(), 0);
    }
  }

  B.bookshelves = (g, p) => {
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
    box(len + 0.1, 0.14, dpt + 0.08, walnut, g, 0, top - 0.02, 0.02, 1);
    box(len + 0.1, 0.03, 0.03, gold, g, 0, top - 0.1, dpt / 2 + 0.06);
    box(len, 0.025, 0.025, brass, g, 0, top - 0.5, dpt / 2 + 0.1);
  };

  B.secretShelf = g => {
    const top = wallH - 0.05;
    const dpt = 0.42;
    const sw = 0.95;
    /* 살짝 열린 책장 문. 틈으로 보랏빛이 샙니다. */
    const hinge = new THREE.Group();
    hinge.position.set(-sw / 2, 0, 0);
    hinge.rotation.y = -0.16;
    g.add(hinge);
    const inner = new THREE.Group();
    inner.position.set(sw / 2, 0, 0);
    hinge.add(inner);
    shelfSection(inner, 0, sw, top, dpt, spineMaterial());
    const red = std({ color: 0x9a1a22, roughness: 0.5 });
    const b = box(0.05, 0.3, 0.26, red, inner, 0.18, 0.74 + 0.38 * 2 + 0.17, 0.12);
    b.rotation.x = -0.18;
    box(0.052, 0.02, 0.2, gold, inner, 0.18, 0.74 + 0.38 * 2 + 0.24, 0.13);
    const glowTex = radialTexture(kit, "violet", "rgba(220,170,255,0.85)", "rgba(220,170,255,0)");
    const glowM = basic({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    const gl = plane(0.5, top * 0.9, glowM, g, sw / 2 + 0.02, top / 2, 0.24);
    gl.renderOrder = 4;
    animators.push(t => {
      glowM.opacity = 0.55 + Math.sin(t * 1.3) * 0.2;
    });
    setHit(g, { type: "door", to: "secret" });
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
    /* 초록 은행원 램프 */
    const lg = new THREE.Group();
    lg.position.set(0.55, 0.81, -0.2);
    g.add(lg);
    cyl(0.09, 0.1, 0.03, 12, brass, lg, 0, 0.015, 0);
    cyl(0.012, 0.012, 0.3, 6, brass, lg, 0, 0.17, 0);
    const shade = mesh(track(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 14, 1, false, 0, Math.PI)), std({ color: 0x1f6a3a, roughness: 0.15, emissive: new THREE.Color(0x1f8a4a), emissiveIntensity: 0.5, side: THREE.DoubleSide }), lg, 0, 0.34, 0.02);
    shade.rotation.set(0, Math.PI / 2, Math.PI / 2);
    shade.scale.set(1, 1, 0.55);
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

  B.chesterfield = g => {
    box(2.0, 0.3, 0.86, leatherRed, g, 0, 0.27, 0, 0.6);
    for (const x of [-0.5, 0.5]) box(0.92, 0.12, 0.66, leatherRed, g, x, 0.48, 0.07, 0.6);
    box(2.0, 0.52, 0.22, leatherRed, g, 0, 0.66, -0.33, 0.6);
    const roll = cyl(0.11, 0.11, 2.0, 12, leatherRed, g, 0, 0.92, -0.33);
    roll.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) {
      box(0.22, 0.48, 0.86, leatherRed, g, s * 0.98, 0.48, 0, 0.6);
      const arm = cyl(0.13, 0.13, 0.86, 12, leatherRed, g, s * 0.98, 0.74, 0);
      arm.rotation.x = Math.PI / 2;
    }
    const btn = std({ color: 0x4a0e0c, roughness: 0.5 });
    for (let i = 0; i < 14; i++) sphere(0.016, btn, g, -0.84 + (i % 7) * 0.28, 0.6 + Math.floor(i / 7) * 0.18, -0.215, 6, 4);
    for (const [x, z] of [[-0.9, -0.36], [0.9, -0.36], [-0.9, 0.36], [0.9, 0.36]]) sphere(0.05, walnut, g, x, 0.06, z, 8, 6);
    k.blob(0, 0, 2.6, 1.4, 0.75, g);
  };

  B.marbleFireplace = g => {
    const m2 = std({ color: 0xf6f2ea, roughness: 0.18, map: kit.texture(`${TEX}marble_01_diff.webp`) });
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
    box(0.3, 0.3, 0.14, gold, g, 0, 1.6, 0.04);
    plane(0.18, 0.18, porcelain, g, 0, 1.62, 0.115);
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
    for (const [x, z] of [[-0.68, -0.18], [0.68, -0.18], [-0.68, 0.18], [0.68, 0.18]]) cyl(0.025, 0.018, 0.3, 6, gold, g, x, 0.15, z);
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

  B.grandPiano = g => {
    const outline = new THREE.Shape();
    outline.moveTo(-0.75, 0);
    outline.lineTo(0.75, 0);
    outline.lineTo(0.75, 0.55);
    outline.bezierCurveTo(0.75, 0.9, 0.35, 1.0, 0.3, 1.35);
    outline.bezierCurveTo(0.26, 1.7, 0.1, 1.85, -0.3, 1.85);
    outline.lineTo(-0.75, 1.82);
    outline.closePath();
    const bodyG = track(new THREE.ExtrudeGeometry(outline, { depth: 0.3, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 10 }));
    bodyG.rotateX(-Math.PI / 2);
    mesh(bodyG, blackGloss, g, 0, 0.62, 0.6);
    const lidG = track(new THREE.ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: false, curveSegments: 10 }));
    lidG.rotateX(-Math.PI / 2);
    lidG.translate(0.75, 0, 0);
    const hinge = new THREE.Group();
    hinge.position.set(-0.75, 0.94, 0.6);
    hinge.rotation.z = 0.62;
    g.add(hinge);
    mesh(lidG, blackGloss, hinge);
    const stick = cyl(0.008, 0.008, 0.82, 5, blackGloss, g, 0.55, 1.25, -0.3);
    stick.rotation.z = -0.15;
    for (const [x, z] of [[-0.65, 0.5], [0.65, 0.5], [-0.4, -1.1]]) {
      lathe([[0.05, 0], [0.04, 0.05], [0.055, 0.2], [0.04, 0.58], [0.07, 0.62], [0, 0.62]], 8, blackGloss, g, x, 0, z);
      sphere(0.03, brass, g, x, 0.02, z, 6, 4);
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
    box(1.5, 0.1, 0.2, blackGloss, g, 0, 0.68, 0.7);
    for (const s of [-1, 1]) box(0.05, 0.14, 0.24, blackGloss, g, s * 0.73, 0.78, 0.68);
    const desk = box(0.7, 0.26, 0.02, blackGloss, g, 0, 1.06, 0.48);
    desk.rotation.x = -0.25;
    const sp = plane(0.5, 0.2, basic({ map: sheetMusic() }), g, 0, 1.07, 0.495);
    sp.rotation.x = -0.25;
    box(0.06, 0.38, 0.06, blackGloss, g, 0, 0.19, 0.42);
    for (const x of [-0.05, 0, 0.05]) box(0.02, 0.01, 0.08, brass, g, x, 0.04, 0.46);
    box(0.8, 0.08, 0.38, leatherBrown, g, 0, 0.5, 1.32);
    box(0.8, 0.06, 0.36, blackGloss, g, 0, 0.44, 1.32);
    for (const [x, z] of [[-0.36, 1.18], [0.36, 1.18], [-0.36, 1.46], [0.36, 1.46]]) cyl(0.025, 0.02, 0.42, 6, blackGloss, g, x, 0.21, z);
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

  B.glassHouse = g => {
    const garden = kit.canvas("garden", 1024, 256, cg => {
      const sky = cg.createLinearGradient(0, 0, 0, 256);
      sky.addColorStop(0, "#cfe4f4");
      sky.addColorStop(0.55, "#f2f6f2");
      sky.addColorStop(0.62, "#9ab88a");
      sky.addColorStop(1, "#4f7a4a");
      cg.fillStyle = sky;
      cg.fillRect(0, 0, 1024, 256);
      const r2 = mulberry(31);
      for (let i = 0; i < 70; i++) {
        const x = r2() * 1024;
        const hh = 30 + r2() * 70;
        cg.fillStyle = `rgba(${50 + r2() * 40},${90 + r2() * 50},${50 + r2() * 30},0.9)`;
        cg.beginPath();
        cg.ellipse(x, 160 - hh * 0.3, 18 + r2() * 30, hh * 0.6, 0, 0, Math.PI * 2);
        cg.fill();
      }
      cg.fillStyle = "#3e6a3a";
      cg.fillRect(0, 168, 1024, 18);
    });
    const cylG = track(new THREE.CylinderGeometry(16, 16, 12, 24, 1, true));
    uvx(cylG, 3, 1);
    mesh(cylG, basic({ map: garden, side: THREE.BackSide, fog: false }), g, 0, 4.2, 0);
    const lawn = plane(40, 40, std({ color: 0x6a9a5a, roughness: 1 }), g, 0, -0.02, 0);
    lawn.rotation.x = -Math.PI / 2;
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
    const pot = std({ color: 0xffffff, roughness: 0.25, map: potTex });
    lathe([[0, 0], [0.2, 0], [0.26, 0.1], [0.3, 0.42], [0.33, 0.46], [0.28, 0.48], [0, 0.48]].map(([r, y]) => [r * s, y * s] as [number, number]), 14, pot, g);
    cyl(0.05 * s, 0.07 * s, 1.0 * s, 7, std({ color: 0x6a5032, roughness: 0.9 }), g, 0, 0.95 * s, 0);
    const fronds: T.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const f = frond(g, 1.3 * s, 0.36 * s, 0.45 * s, 1.42 * s);
      f.rotation.y = (i / 9) * Math.PI * 2 + rnd() * 0.3;
      f.rotation.x = -0.6 - rnd() * 0.35;
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
    for (const [x, z] of [[-0.8, -0.28], [0.8, -0.28], [-0.8, 0.28], [0.8, 0.28]]) cyl(0.03, 0.02, 0.24, 6, gold, g, x, 0.12, z);
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
    g.position.set(p.at[0], 0, p.at[1]);
    g.rotation.y = (p.rot ?? 0) * DEG;
    if (p.scale && p.kind !== "pottedPalm") g.scale.setScalar(p.scale);
    group.add(g);
    fn(g, p);
  }

  /* ---------- 인물: 직접 만든 저폴리곤 (3천 삼각형 이하) ---------- */

  function figure(look: FigureLook) {
    const S = (look.height ?? 1.75) / 1.75;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.scale.setScalar(S);
    const skin = std({ color: new THREE.Color(look.skin), roughness: 0.7 });
    const hair = std({ color: new THREE.Color(look.hair), roughness: 0.6 });
    const coat = look.coatStyle === "tailcoat" ? std({ color: new THREE.Color(look.coat), roughness: 0.45, physical: true, clearcoat: 0.3 }) : velvetMat(look.coat);
    const skirtLook = look.coatStyle === "gown" || look.coatStyle === "dress";
    const lower = skirtLook ? velvetMat(look.lower) : std({ color: new THREE.Color(look.lower), roughness: 0.6 });
    const shirt = std({ color: new THREE.Color(look.shirt), roughness: 0.75 });
    const accent = std({ color: new THREE.Color(look.accent), roughness: 0.5 });
    const glove = look.gloves ? std({ color: new THREE.Color(look.gloves), roughness: 0.8 }) : skin;
    const shoe = std({ color: 0x141210, roughness: 0.25, metalness: 0.1 });
    const dark = std({ color: 0x1a1210, roughness: 0.4 });
    const seated = look.pose === "sitTeacup" || look.pose === "sitPiano";
    const hipY = seated ? 0.47 : 0.88;

    /* 다리 */
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.09, hipY, 0);
      body.add(hip);
      mesh(track(new THREE.CapsuleGeometry(0.068, 0.36, 2, 8)), lower, hip, 0, -0.22, 0);
      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0);
      hip.add(knee);
      mesh(track(new THREE.CapsuleGeometry(0.056, 0.34, 2, 8)), lower, knee, 0, -0.2, 0);
      box(0.1, 0.06, 0.25, shoe, knee, 0, -0.42, 0.05);
      if (seated) {
        hip.rotation.x = -Math.PI / 2 + 0.05;
        knee.rotation.x = Math.PI / 2 - 0.05;
      }
    }
    if (skirtLook) {
      if (seated) {
        const lap = sphere(0.3, lower, body, 0, hipY + 0.02, 0.18, 12, 8);
        lap.scale.set(0.9, 0.35, 1.0);
        lathe([[0.0, 0.48], [0.24, 0.48], [0.32, 0.25], [0.38, 0.0], [0.0, 0.0]], 14, lower, body, 0, 0.0, 0.42).scale.z = 0.7;
      } else {
        const hem = look.coatStyle === "gown" ? 0.5 : 0.4;
        lathe([[0.0, 0.95], [0.16, 0.95], [0.2, 0.75], [hem * 0.75, 0.35], [hem, 0.03], [hem * 0.98, 0.0], [0, 0.0]], 16, lower, body).scale.z = 0.85;
        if (look.coatStyle === "dress") {
          lathe([[0.0, 0.9], [0.15, 0.9], [0.2, 0.62], [0.24, 0.12], [0, 0.12]], 12, linen, body, 0, 0, 0.06).scale.set(0.8, 1, 0.5);
        }
      }
    }

    /* 몸통(숨쉬기) */
    const chest = new THREE.Group();
    chest.position.set(0, hipY, 0);
    body.add(chest);
    const torsoPts: [number, number][] = [[0.0, 0], [0.15, 0.0], [0.155, 0.1], [0.14, 0.22], [0.165, 0.38], [0.18, 0.48], [0.13, 0.55], [0.0, 0.56]];
    const torso = lathe(torsoPts, 12, coat, chest);
    torso.scale.set(1.15, 1, 0.72);
    if (!skirtLook) {
      const vee = new THREE.Shape();
      const bottom = look.coatStyle === "waistcoat" ? 0.42 : 0.2;
      vee.moveTo(-0.07, 0.54);
      vee.lineTo(0.07, 0.54);
      vee.lineTo(0.02, bottom);
      vee.lineTo(-0.02, bottom);
      vee.closePath();
      mesh(track(new THREE.ShapeGeometry(vee)), shirt, chest, 0, 0, 0.126);
      if (look.coatStyle === "tailcoat" || look.coatStyle === "jacket") {
        for (const s of [-1, 1]) {
          const lapel = box(0.05, 0.2, 0.01, coat, chest, s * 0.06, 0.43, 0.125);
          lapel.rotation.z = s * 0.35;
        }
        for (let i = 0; i < 2; i++) sphere(0.011, look.coatStyle === "tailcoat" ? gold : dark, chest, 0.035, 0.2 + i * 0.08, 0.124, 6, 4);
      }
      if (look.coatStyle === "waistcoat") {
        for (let i = 0; i < 4; i++) sphere(0.01, brass, chest, 0, 0.12 + i * 0.07, 0.125, 6, 4);
        const watch = mesh(track(new THREE.TorusGeometry(0.05, 0.003, 3, 10, Math.PI)), gold, chest, 0.04, 0.24, 0.123);
        watch.rotation.z = Math.PI;
      }
    } else {
      lathe([[0.0, 0.55], [0.08, 0.55], [0.07, 0.45], [0.0, 0.43]], 10, shirt, chest, 0, 0, 0.02).scale.set(1.1, 1, 1.4);
    }
    if (look.coatStyle === "tailcoat") {
      for (const s of [-1, 1]) {
        const tail = box(0.13, 0.55, 0.03, coat, chest, s * 0.07, -0.24, -0.1);
        tail.rotation.x = seated ? 1.3 : 0.08;
        if (seated) tail.position.set(s * 0.07, 0.0, -0.3);
      }
    }
    if (look.coatStyle === "jacket") {
      lathe([[0.0, 0.0], [0.17, 0.0], [0.16, -0.2], [0.0, -0.2]], 12, coat, chest).scale.set(1.15, 1, 0.75);
    }
    if (look.coatStyle === "dress") {
      /* 허리의 열쇠 꾸러미 */
      const ring = mesh(track(new THREE.TorusGeometry(0.03, 0.005, 4, 10)), brass, chest, 0.15, -0.02, 0.06);
      ring.rotation.y = Math.PI / 2;
      for (let i = 0; i < 3; i++) box(0.008, 0.06, 0.015, brass, chest, 0.155, -0.07 - i * 0.004, 0.05 + i * 0.012);
      box(0.34, 0.03, 0.24, accent, chest, 0, 0.02, 0.0);
    }
    if (look.bowTie) {
      const tieMat = look.accent === look.coat ? dark : accent;
      for (const s of [-1, 1]) {
        const c = mesh(track(new THREE.ConeGeometry(0.025, 0.05, 4)), tieMat, chest, s * 0.025, 0.53, 0.105);
        c.rotation.z = (s * Math.PI) / 2;
      }
    }

    /* 팔 */
    const hands: T.Group[] = [];
    const armMat = look.coatStyle === "waistcoat" ? shirt : coat;
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 0.49, 0);
      chest.add(sh);
      if (look.coatStyle === "gown") sphere(0.075, coat, sh, 0, -0.02, 0, 10, 6);
      mesh(track(new THREE.CapsuleGeometry(0.05, 0.22, 2, 8)), armMat, sh, 0, -0.15, 0);
      const el = new THREE.Group();
      el.position.set(0, -0.3, 0);
      sh.add(el);
      const foreMat = look.sleeves === "rolled" ? skin : look.coatStyle === "gown" && look.gloves ? glove : armMat;
      mesh(track(new THREE.CapsuleGeometry(0.043, 0.2, 2, 8)), foreMat, el, 0, -0.13, 0);
      if (look.sleeves === "rolled") cyl(0.052, 0.052, 0.05, 8, shirt, el, 0, -0.01, 0);
      else if (look.coatStyle !== "gown") cyl(0.046, 0.046, 0.03, 8, shirt, el, 0, -0.24, 0);
      const hand = new THREE.Group();
      hand.position.set(0, -0.28, 0);
      el.add(hand);
      sphere(0.042, glove, hand, 0, -0.01, 0, 8, 6).scale.set(0.8, 1.1, 0.6);
      hands.push(hand);
      const pose = poseFor(look.pose, s);
      sh.rotation.set(pose.sx, 0, pose.sz);
      el.rotation.set(pose.ex, 0, pose.ez);
    }

    /* 머리(고개 움직임) */
    const neckY = 0.56;
    cyl(0.045, 0.05, 0.09, 8, skin, chest, 0, neckY + 0.03, 0);
    if (!skirtLook) cyl(0.055, 0.055, 0.05, 8, shirt, chest, 0, neckY, 0);
    const head = new THREE.Group();
    head.position.set(0, neckY + 0.14, 0.01);
    chest.add(head);
    const skull = sphere(0.105, skin, head, 0, 0, 0, 14, 10);
    skull.scale.set(0.9, 1.1, 1.0);
    const eye = std({ color: 0x1a1410, roughness: 0.3 });
    for (const s of [-1, 1]) {
      sphere(0.012, eye, head, s * 0.035, 0.015, 0.093, 6, 4);
      sphere(0.022, skin, head, s * 0.094, 0.0, -0.005, 6, 4).scale.set(0.5, 1, 0.8);
      box(0.035, 0.007, 0.01, hair, head, s * 0.036, 0.042, 0.092).rotation.z = s * -0.12;
    }
    sphere(0.018, skin, head, 0, -0.01, 0.105, 6, 4).scale.set(0.8, 1, 0.9);
    box(0.04, 0.006, 0.01, std({ color: 0xa05a50, roughness: 0.6 }), head, 0, -0.055, 0.094);
    if (look.moustache) box(0.06, 0.014, 0.015, hair, head, 0, -0.035, 0.1);
    if (look.glasses) {
      for (const s of [-1, 1]) mesh(track(new THREE.TorusGeometry(0.022, 0.003, 4, 12)), gold, head, s * 0.036, 0.015, 0.105);
      box(0.02, 0.003, 0.003, gold, head, 0, 0.018, 0.106);
    }
    const cap = mesh(track(new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair, head, 0, 0.012, -0.008);
    cap.scale.set(0.93, 1.08, 1.04);
    if (look.hairStyle !== "bald") sphere(0.1, hair, head, 0, -0.02, -0.03, 12, 8).scale.set(0.95, 0.95, 0.8);
    if (look.hairStyle === "bun") sphere(0.05, hair, head, 0, 0.06, -0.11, 10, 6);
    if (look.hairStyle === "updo") {
      sphere(0.075, hair, head, 0, 0.11, -0.05, 10, 6);
      for (const s of [-1, 1]) sphere(0.03, hair, head, s * 0.08, -0.04, 0.02, 6, 4);
    }
    if (look.hairStyle === "cap") {
      const tweed = std({ color: 0x5a4a34, roughness: 0.9 });
      cyl(0.115, 0.118, 0.05, 14, tweed, head, 0, 0.08, -0.01).scale.z = 1.05;
      box(0.2, 0.012, 0.09, tweed, head, 0, 0.06, 0.1).rotation.x = 0.15;
    }
    const headAnchor = new THREE.Object3D();
    headAnchor.position.set(0, 0.12, 0);
    head.add(headAnchor);

    /* 손에 든 것 */
    const [left, right] = hands;
    if (look.pose === "holdAlbum") {
      const alb = new THREE.Group();
      box(0.3, 0.04, 0.24, std({ color: 0x5a1a22, roughness: 0.5 }), alb);
      box(0.24, 0.042, 0.03, gold, alb, 0, 0, 0.08);
      alb.rotation.x = 1.0;
      alb.position.set(0, hipY + 0.22, 0.3);
      body.add(alb);
    }
    if (look.pose === "readBook") {
      const bk = new THREE.Group();
      const cover = std({ color: 0x3a1a12, roughness: 0.6 });
      for (const s of [-1, 1]) {
        box(0.15, 0.2, 0.008, linen, bk, s * 0.075, 0, 0).rotation.y = s * 0.3;
        box(0.155, 0.205, 0.006, cover, bk, s * 0.078, 0, -0.008).rotation.y = s * 0.3;
      }
      bk.rotation.x = -0.9;
      bk.position.set(0, hipY + 0.33, 0.28);
      body.add(bk);
      head.rotation.x = 0.32;
    }
    if (look.pose === "sitTeacup") {
      cyl(0.045, 0.045, 0.006, 12, porcelain, right, 0, -0.04, 0.02);
      lathe([[0, 0], [0.02, 0], [0.035, 0.045], [0, 0.045]], 10, porcelain, right, 0, -0.035, 0.02);
      cyl(0.055, 0.055, 0.006, 12, porcelain, left, 0, -0.05, 0.02);
    }
    if (look.pose === "holdCan") {
      const can = new THREE.Group();
      can.position.set(0, -0.12, 0.05);
      right.add(can);
      const zinc = std({ color: 0x9aa6a0, roughness: 0.35, metalness: 0.8 });
      cyl(0.08, 0.09, 0.2, 12, zinc, can, 0, -0.06, 0);
      cyl(0.01, 0.018, 0.32, 6, zinc, can, 0, 0.0, 0.18).rotation.x = 1.0;
      mesh(track(new THREE.TorusGeometry(0.07, 0.01, 4, 10, Math.PI)), zinc, can, 0, 0.05, -0.02).rotation.y = Math.PI / 2;
    }

    if (look.pose === "bowHandsBehind") chest.rotation.x = 0.12;
    if (look.pose === "sitTeacup") body.position.set(-0.4, 0, 0.08);
    if (look.pose === "sitPiano") chest.rotation.x = 0.1;

    const ph = rnd() * 10;
    const baseHeadX = head.rotation.x;
    function animate(t: number) {
      const b = Math.sin(t * 1.6 + ph);
      chest.scale.set(1 + b * 0.008, 1 + b * 0.006, 1 + b * 0.014);
      head.rotation.y = Math.sin(t * 0.32 + ph) * 0.22;
      head.rotation.x = baseHeadX + Math.sin(t * 0.21 + ph * 2) * 0.05;
    }
    return { root, animate, headAnchor };
  }

  return { place, figure };
}

/* 팔 자세. s = -1 왼팔, +1 오른팔. sx<0 이면 앞으로 듭니다. */
function poseFor(pose: FigureLook["pose"], s: number) {
  switch (pose) {
    case "bowHandsBehind":
      return { sx: 0.32, sz: s * 0.06, ex: 0, ez: -s * 1.25 };
    case "holdAlbum":
      return { sx: -0.35, sz: s * -0.12, ex: -1.25, ez: -s * 0.25 };
    case "readBook":
      return { sx: -0.42, sz: s * -0.1, ex: -1.35, ez: -s * 0.28 };
    case "sitTeacup":
      return s > 0 ? { sx: -0.35, sz: 0.1, ex: -1.75, ez: -0.3 } : { sx: -0.6, sz: 0.05, ex: -0.8, ez: 0.3 };
    case "point":
      return s > 0 ? { sx: -1.35, sz: 0.55, ex: -0.1, ez: 0 } : { sx: 0.05, sz: -0.08, ex: -0.2, ez: 0 };
    case "sitPiano":
      return { sx: -0.75, sz: s * -0.05, ex: -0.55, ez: -s * 0.1 };
    case "holdCan":
      return s > 0 ? { sx: -0.18, sz: 0.12, ex: -0.25, ez: 0 } : { sx: 0.05, sz: -0.1, ex: -0.15, ez: 0 };
    default:
      return { sx: 0, sz: s * 0.08, ex: 0, ez: 0 };
  }
}
