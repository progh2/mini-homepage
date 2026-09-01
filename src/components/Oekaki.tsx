"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  OEKAKI_LIMITS,
  addOekaki,
  addOekakiReply,
  canDeleteEntry,
  deleteOekaki,
  deleteOekakiReply,
  getOekakiImage,
  getOekakiReplay,
  isGuestbookEnabled,
  isOwner,
  moveOekakiImage,
  setOekakiHidden,
  signInWithGoogle,
  subscribeOekaki,
  subscribeOekakiReplies,
  subscribeUser,
  type OekakiEntry,
  type OekakiReplay,
  type OekakiReply,
  type SignedInUser
} from "@/lib/firebase";

/* 캔버스 한 변입니다. 휴대폰에서 그림 영역이 약 300px 이라 360 이면 0.83배로
   거의 1:1 로 줄어듭니다. 더 키우면 손가락 하나가 덮는 캔버스 픽셀이 늘어
   선이 의도보다 굵고 거칠어집니다. 데스크톱 우측 패널(644px)에서는 1:1 입니다. */
const SIZE = 360;

/* 옛날 오에카키 팔레트처럼 회색 한 줄에 색상 세 줄입니다. */
const COLORS = [
  "#000000", "#444444", "#888888", "#bbbbbb", "#e5e5e5", "#ffffff",
  "#7f1d1d", "#dc2626", "#f87171", "#ea580c", "#f59e0b", "#fcd34d",
  "#14532d", "#16a34a", "#4ade80", "#0e7490", "#06b6d4", "#67e8f9",
  "#1e3a8a", "#2563eb", "#60a5fa", "#6d28d9", "#a855f7", "#ec4899"
];
/* 캔버스 기준 굵기라 화면이 줄어도 비율이 같습니다. */
const WIDTHS = [3, 7, 16];
const BACKGROUND = "#ffffff";
/* 좁은 화면에서 목록이 감당이 안 되므로 제한합니다. */
const MAX_LAYERS = 4;
/* 한 쪽에 보이는 그림 수입니다. 항목마다 덧글 구독이 붙으므로 작게 둡니다. */
const PAGE_SIZE = 5;
/* 되돌리기 한 단계가 360x360 RGBA 로 518KB 입니다. 15단계면 약 7.8MB 입니다. */
const MAX_UNDO = 15;
/* 채우기 허용 오차입니다. 선 가장자리가 부드럽게 처리돼 있어 0 이면
   경계에 흰 테가 남습니다. */
const FILL_TOLERANCE = 48;

type Tool = "pen" | "eraser" | "fill" | "pick" | "line" | "rect" | "ellipse" | "blur";
type LayerMeta = { id: number; visible: boolean };

/* 흐리게 붓의 반지름입니다. 캔버스 기준이라 화면이 줄어도 비율이 같습니다. */
const BLUR_RADIUS = 18;
const BLUR_STRENGTH = 4;

/* 그리는 과정 기록입니다. 도구마다 번호를 붙여 짧게 적습니다.
   흐리게(6)는 자리만 남기고 재생 때 건너뜁니다. 위치를 다 적어야 하고
   브라우저마다 결과가 미묘하게 달라서, 값에 비해 비쌉니다.
   대신 재생이 끝나면 저장된 그림으로 바꿔서 마지막 장면은 늘 정확합니다. */
const OP = { pen: 0, line: 1, rect: 2, ellipse: 3, eraser: 4, fill: 5, blur: 6 } as const;
type ReplayOp = {
  k: number;
  l: number;
  c?: string;
  w?: number;
  o?: number;
  /* 펜과 지우개는 첫 점만 절대좌표이고 나머지는 차분입니다. 값이 작아
     그대로 적을 때보다 절반으로 줄어듭니다. 도형은 [x1,y1,x2,y2] 입니다. */
  p?: number[];
  /* 도형을 속까지 칠했는지. 테두리만이면 없습니다. */
  f?: 1;
};

/* 3px 넘게 움직였을 때만 점을 남깁니다. 이보다 촘촘하면 기록만 커집니다. */
const POINT_GAP = 3;

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

/* 화면에 보이는 그림(합쳐진 결과)에서 누른 지점과 이어진 영역을 찾습니다.
   찾은 영역만 1 로 표시한 배열을 돌려주고, 실제 색칠은 선택한 레이어에 합니다.
   그래야 선이 다른 레이어에 있어도 그 안쪽이 칠해집니다. */
function floodMask(src: ImageData, startX: number, startY: number) {
  const { width: w, height: h, data } = src;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const s = at(startX, startY);
  const sr = data[s], sg = data[s + 1], sb = data[s + 2];

  const mask = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const stack: number[] = [startY * w + startX];
  seen[startY * w + startX] = 1;

  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % w;
    const y = (idx - x) / w;
    const p = idx * 4;
    /* 세 채널 차이의 합으로 견줍니다. 사람 눈에 충분하고 계산이 쌉니다. */
    const diff =
      Math.abs(data[p] - sr) + Math.abs(data[p + 1] - sg) + Math.abs(data[p + 2] - sb);
    if (diff > FILL_TOLERANCE) continue;

    mask[idx] = 1;

    if (x > 0 && !seen[idx - 1]) { seen[idx - 1] = 1; stack.push(idx - 1); }
    if (x < w - 1 && !seen[idx + 1]) { seen[idx + 1] = 1; stack.push(idx + 1); }
    if (y > 0 && !seen[idx - w]) { seen[idx - w] = 1; stack.push(idx - w); }
    if (y < h - 1 && !seen[idx + w]) { seen[idx + w] = 1; stack.push(idx + w); }
  }
  return mask;
}

function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19h8" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}
function EraserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 20H21" />
      <path d="M15.5 4.5 5 15a2.1 2.1 0 0 0 0 3l3 3h5l7.5-7.5a2.1 2.1 0 0 0 0-3l-2-2a2.1 2.1 0 0 0-3 0Z" />
    </svg>
  );
}
function BucketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3.5 3.8 7.7a2 2 0 0 0 0 2.8l5.7 5.7a2 2 0 0 0 2.8 0l4.2-4.2Z" />
      <path d="M6 5.5 12.5 12" />
      <path d="M20 13.5s2 2.6 2 4a2 2 0 1 1-4 0c0-1.4 2-4 2-4Z" />
    </svg>
  );
}
function PickIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m19 3-1.5 1.5" />
      <path d="M17.5 4.5 20 7l-8.5 8.5-3.5 1 1-3.5Z" />
      <path d="M6 16.5 3.5 19 5 20.5 7.5 18" />
    </svg>
  );
}
function LineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 20 20 4" />
    </svg>
  );
}
function RectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}
function EllipseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </svg>
  );
}
function BlurIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3.5c3.5 4 5.5 6.6 5.5 9a5.5 5.5 0 0 1-11 0c0-2.4 2-5 5.5-9Z" opacity="0.55" />
      <path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  );
}
function UndoIcon({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.3-6.4L3 9" />
    </svg>
  );
}

/* ---------------------------------------------------------------
   그림판

   레이어마다 투명한 오프스크린 캔버스를 하나씩 두고, 화면 캔버스에는
   흰 바탕 위로 보이는 레이어를 순서대로 합쳐 올립니다.

   앞서는 획 목록을 다시 그리는 방식이었는데, 채우기는 이미 칠해진 픽셀을
   보고 번져 나가는 연산이라 "획"으로 적어 둘 수가 없어 바꿨습니다.
   되돌리기는 연산 직전 레이어 픽셀을 저장해 두었다가 복원합니다.
   --------------------------------------------------------------- */
function OekakiPad({
  onDone,
  onCancel
}: {
  onDone: (dataUrl: string, comment: string, replay: OekakiReplay) => Promise<void>;
  onCancel: () => void;
}) {
  /* 브라우저가 입력 칸을 알아보려면 id 나 name 이 있어야 합니다. */
  const fieldId = useId();
  const viewRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  /* 지금 그리는 획만 담는 임시 판입니다. 획이 끝나면 한 번에 레이어로 옮깁니다.
     선분마다 반투명하게 칠하면 겹치는 자리가 짙어져 얼룩덜룩해집니다.
     임시 판에 불투명으로 그린 뒤 통째로 옅게 얹으면 농도가 고릅니다. */
  const tempRef = useRef<HTMLCanvasElement | null>(null);
  /* 도형 도구가 끌기 시작한 지점, 흐리게가 쓸 미리 흐려 둔 판입니다. */
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const blurRef = useRef<HTMLCanvasElement | null>(null);
  /* 그리는 과정 기록입니다. 되돌리기와 개수가 어긋나면 안 되므로 같이 움직입니다. */
  const opsRef = useRef<ReplayOp[]>([]);
  const redoOpsRef = useRef<ReplayOp[]>([]);
  const pointsRef = useRef<number[]>([]);
  const undoRef = useRef<{ layerId: number; data: ImageData }[]>([]);
  const redoRef = useRef<{ layerId: number; data: ImageData }[]>([]);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const [layers, setLayers] = useState<LayerMeta[]>([{ id: 1, visible: true }]);
  const [activeId, setActiveId] = useState(1);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [opacity, setOpacity] = useState(1);
  /* 사각형과 원을 속까지 칠할지입니다. 도형 도구를 고를 때만 보입니다. */
  const [filled, setFilled] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  /* 되돌리기 버튼 활성 상태를 다시 그리게 하려고 둡니다. */
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });

  const layerCanvas = useCallback((id: number) => {
    let c = layerRef.current.get(id);
    if (!c) {
      c = document.createElement("canvas");
      c.width = SIZE;
      c.height = SIZE;
      layerRef.current.set(id, c);
    }
    return c;
  }, []);

  const scratch = useCallback((ref: React.RefObject<HTMLCanvasElement | null>) => {
    if (!ref.current) {
      const c = document.createElement("canvas");
      c.width = SIZE;
      c.height = SIZE;
      ref.current = c;
    }
    return ref.current;
  }, []);

  /* 흰 바탕 위에 보이는 레이어를 순서대로 얹습니다. 그리는 동안에도 매번
     불러서, 아래쪽 레이어에 그려도 위 레이어에 가려지는 순서가 지켜집니다.
     그리는 중인 획은 선택한 레이어 바로 위에 설정한 농도로 얹습니다. */
  const composite = useCallback(() => {
    const view = viewRef.current?.getContext("2d");
    if (!view) return;
    view.globalAlpha = 1;
    view.globalCompositeOperation = "source-over";
    view.fillStyle = BACKGROUND;
    view.fillRect(0, 0, SIZE, SIZE);
    layers.forEach(l => {
      if (!l.visible) return;
      view.drawImage(layerCanvas(l.id), 0, 0);
      if (l.id === activeId && tempRef.current) {
        view.globalAlpha = opacity;
        view.drawImage(tempRef.current, 0, 0);
        view.globalAlpha = 1;
      }
    });
  }, [layers, layerCanvas, activeId, opacity]);

  useEffect(() => {
    composite();
  }, [composite]);

  const pushUndo = () => {
    const c = layerCanvas(activeId).getContext("2d");
    if (!c) return;
    undoRef.current.push({ layerId: activeId, data: c.getImageData(0, 0, SIZE, SIZE) });
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
    redoOpsRef.current = [];
    setSteps({ undo: undoRef.current.length, redo: 0 });
  };

  /* 되돌리기 한 번에 기록도 하나 빠집니다. 흐리게처럼 재현하지 않는 것도
     자리를 차지해야 개수가 어긋나지 않습니다. */
  const pushOp = (op: ReplayOp) => opsRef.current.push(op);

  const restore = (from: typeof undoRef, to: typeof redoRef) => {
    const step = from.current.pop();
    if (!step) return;
    const fromOps = from === undoRef ? opsRef : redoOpsRef;
    const toOps = from === undoRef ? redoOpsRef : opsRef;
    const movedOp = fromOps.current.pop();
    if (movedOp) toOps.current.push(movedOp);
    const c = layerCanvas(step.layerId).getContext("2d");
    if (!c) return;
    to.current.push({ layerId: step.layerId, data: c.getImageData(0, 0, SIZE, SIZE) });
    c.putImageData(step.data, 0, 0);
    setSteps({ undo: undoRef.current.length, redo: redoRef.current.length });
    composite();
  };

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * SIZE),
      y: Math.floor(((e.clientY - r.top) / r.height) * SIZE)
    };
  };

  /* 임시 판에 획을 이어 그립니다. 농도는 합칠 때 한 번에 적용합니다. */
  const drawOnTemp = (draw: (c: CanvasRenderingContext2D) => void) => {
    const c = scratch(tempRef).getContext("2d");
    if (!c) return;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.lineJoin = "round";
    draw(c);
    composite();
  };

  const clearTemp = () => {
    const c = tempRef.current?.getContext("2d");
    c?.clearRect(0, 0, SIZE, SIZE);
  };

  /* 획이 끝나면 임시 판을 레이어에 한 번에 옮깁니다. */
  const commitTemp = () => {
    const temp = tempRef.current;
    const c = layerCanvas(activeId).getContext("2d");
    if (!temp || !c) return;
    c.globalAlpha = opacity;
    c.globalCompositeOperation = "source-over";
    c.drawImage(temp, 0, 0);
    c.globalAlpha = 1;
    clearTemp();
    composite();
  };

  /* 지우개는 흰색 덧칠이 아니라 투명 지우기입니다. 흰색으로 칠하면
     아래 레이어까지 가려집니다. 임시 판을 거치지 않고 바로 지웁니다. */
  const eraseTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = layerCanvas(activeId).getContext("2d");
    if (!c) return;
    c.globalCompositeOperation = "destination-out";
    c.lineWidth = width * 2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    c.globalCompositeOperation = "source-over";
    composite();
  };

  /* 흐리게는 획을 시작할 때 레이어를 한 번 흐려 두고, 지나가는 자리에만
     그 결과를 동그랗게 찍습니다. 매번 흐리면 느리고, 같은 자리를 여러 번
     지나도 한없이 뭉개지지 않아 다루기 쉽습니다. */
  const blurAt = (p: { x: number; y: number }) => {
    const src = blurRef.current;
    const c = layerCanvas(activeId).getContext("2d");
    if (!src || !c) return;
    c.save();
    c.beginPath();
    c.arc(p.x, p.y, BLUR_RADIUS, 0, Math.PI * 2);
    c.clip();
    c.clearRect(p.x - BLUR_RADIUS, p.y - BLUR_RADIUS, BLUR_RADIUS * 2, BLUR_RADIUS * 2);
    c.drawImage(src, 0, 0);
    c.restore();
    composite();
  };

  const drawShape = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    clearTemp();
    drawOnTemp(c => {
      c.beginPath();
      if (tool === "line") {
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      } else if (tool === "rect") {
        c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      } else {
        c.ellipse(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          Math.abs(b.x - a.x) / 2,
          Math.abs(b.y - a.y) / 2,
          0,
          0,
          Math.PI * 2
        );
      }
      /* 채울 때도 같은 색으로 테두리를 한 번 더 그립니다. 가장자리가
         부드럽게 처리돼 속만 칠하면 경계가 거칠어 보입니다. */
      if (filled && tool !== "line") c.fill();
      c.stroke();
    });
  };

  const doFill = (p: { x: number; y: number }) => {
    const view = viewRef.current?.getContext("2d");
    const c = layerCanvas(activeId).getContext("2d");
    if (!view || !c) return;

    const mask = floodMask(view.getImageData(0, 0, SIZE, SIZE), p.x, p.y);
    const target = c.getImageData(0, 0, SIZE, SIZE);
    const { r, g, b } = hexToRgb(color);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const q = i * 4;
      target.data[q] = r;
      target.data[q + 1] = g;
      target.data[q + 2] = b;
      target.data[q + 3] = 255;
    }
    c.putImageData(target, 0, 0);
    composite();
  };

  const doPick = (p: { x: number; y: number }) => {
    const view = viewRef.current?.getContext("2d");
    if (!view) return;
    const d = view.getImageData(p.x, p.y, 1, 1).data;
    const hex =
      "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join("");
    setColor(hex);
    setTool("pen");
  };

  const SHAPES: Tool[] = ["line", "rect", "ellipse"];
  const layerIndex = () => layers.findIndex(l => l.id === activeId);

  /* 점을 3px 마다만 모으고 차분으로 적습니다. */
  const trackPoint = (p: { x: number; y: number }) => {
    const buf = pointsRef.current;
    if (buf.length === 0) {
      buf.push(p.x, p.y);
      return;
    }
    let ax = buf[0], ay = buf[1];
    for (let i = 2; i < buf.length; i += 2) {
      ax += buf[i];
      ay += buf[i + 1];
    }
    if (Math.abs(p.x - ax) + Math.abs(p.y - ay) < POINT_GAP) return;
    buf.push(p.x - ax, p.y - ay);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const layer = layers.find(l => l.id === activeId);
    if (!layer?.visible) return;
    const p = toCanvas(e);

    /* 스포이드는 그림을 바꾸지 않으므로 되돌리기 단계를 남기지 않습니다. */
    if (tool === "pick") {
      doPick(p);
      return;
    }

    pushUndo();
    setDirty(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "fill") {
      pushOp({ k: OP.fill, l: layerIndex(), c: color, p: [p.x, p.y] });
      doFill(p);
      return;
    }

    if (tool === "blur") {
      pushOp({ k: OP.blur, l: layerIndex() });
      /* 획을 시작할 때 한 번만 흐린 판을 만들어 둡니다. */
      const src = layerCanvas(activeId);
      const dst = scratch(blurRef).getContext("2d");
      if (dst) {
        dst.clearRect(0, 0, SIZE, SIZE);
        dst.filter = `blur(${BLUR_STRENGTH}px)`;
        dst.drawImage(src, 0, 0);
        dst.filter = "none";
      }
      lastRef.current = p;
      blurAt(p);
      return;
    }

    clearTemp();
    startRef.current = p;
    lastRef.current = p;
    pointsRef.current = [];
    trackPoint(p);

    if (SHAPES.includes(tool)) {
      drawShape(p, p);
    } else {
      drawOnTemp(c => {
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x + 0.01, p.y);
        c.stroke();
      });
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const from = lastRef.current;
    if (!from) return;
    const p = toCanvas(e);

    if (tool === "eraser") {
      trackPoint(p);
      eraseTo(from, p);
    } else if (tool === "blur") {
      blurAt(p);
    } else if (SHAPES.includes(tool)) {
      /* 도형은 끌 때마다 시작점에서 다시 그립니다. 임시 판이라 지우기 쉽습니다. */
      if (startRef.current) drawShape(startRef.current, p);
    } else {
      trackPoint(p);
      drawOnTemp(c => {
        c.beginPath();
        c.moveTo(from.x, from.y);
        c.lineTo(p.x, p.y);
        c.stroke();
      });
    }
    lastRef.current = p;
  };

  const onUp = () => {
    const start = startRef.current;
    const end = lastRef.current;
    lastRef.current = null;
    startRef.current = null;

    if (tool === "eraser") {
      pushOp({ k: OP.eraser, l: layerIndex(), w: width, p: [...pointsRef.current] });
    } else if (SHAPES.includes(tool) && start && end) {
      const k = tool === "line" ? OP.line : tool === "rect" ? OP.rect : OP.ellipse;
      pushOp({
        k,
        l: layerIndex(),
        c: color,
        w: width,
        o: Math.round(opacity * 100),
        p: [start.x, start.y, end.x, end.y],
        ...(filled && tool !== "line" ? { f: 1 as const } : {})
      });
    } else if (tool === "pen") {
      pushOp({
        k: OP.pen,
        l: layerIndex(),
        c: color,
        w: width,
        o: Math.round(opacity * 100),
        p: [...pointsRef.current]
      });
    }
    pointsRef.current = [];

    if (tool !== "eraser" && tool !== "blur" && tool !== "fill") commitTemp();
  };

  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const id = Math.max(...layers.map(l => l.id)) + 1;
    setLayers(prev => [...prev, { id, visible: true }]);
    setActiveId(id);
  };

  const removeLayer = (id: number) => {
    if (layers.length <= 1) return;
    layerRef.current.delete(id);
    undoRef.current = undoRef.current.filter(s => s.layerId !== id);
    redoRef.current = redoRef.current.filter(s => s.layerId !== id);
    setSteps({ undo: undoRef.current.length, redo: redoRef.current.length });
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeId === id) setActiveId(layers.find(l => l.id !== id)!.id);
  };

  const submit = async () => {
    if (sending) return;
    if (!dirty) {
      setError("그림을 그려 주세요.");
      return;
    }
    const canvas = viewRef.current;
    if (!canvas) return;

    setSending(true);
    setError(null);
    try {
      /* 화면에 보이는 그대로, 즉 켜져 있는 레이어를 합친 결과가 저장됩니다. */
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > OEKAKI_LIMITS.image) {
        throw new Error("그림이 너무 복잡해요. 조금 지우고 다시 남겨 주세요.");
      }
      /* 숨긴 레이어에 그린 획은 결과에 없으므로 기록에서도 뺍니다. */
      const shown = new Set(layers.map((l, i) => (l.visible ? i : -1)).filter(i => i >= 0));
      const ops = opsRef.current.filter(o => shown.has(o.l));
      await onDone(dataUrl, comment, { ops: JSON.stringify(ops), count: ops.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "남기지 못했어요.");
    } finally {
      setSending(false);
    }
  };

  const activeVisible = layers.find(l => l.id === activeId)?.visible ?? true;
  const TOOLS: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: "pen", label: "펜", icon: <PenIcon /> },
    { id: "line", label: "직선", icon: <LineIcon /> },
    { id: "rect", label: "사각형", icon: <RectIcon /> },
    { id: "ellipse", label: "원", icon: <EllipseIcon /> },
    { id: "fill", label: "채우기", icon: <BucketIcon /> },
    { id: "blur", label: "흐리게", icon: <BlurIcon /> },
    { id: "pick", label: "스포이드", icon: <PickIcon /> },
    { id: "eraser", label: "지우개", icon: <EraserIcon /> }
  ];

  return (
    <div className="cy-oe-pad">
      <canvas
        ref={viewRef}
        width={SIZE}
        height={SIZE}
        className="cy-oe-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="그림판"
      />

      <div className="cy-oe-tools">
        <div className="cy-oe-colors">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={"cy-oe-color" + (c === color ? " is-on" : "")}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`색 ${c}`}
              aria-pressed={c === color}
            />
          ))}
        </div>

        <div className="cy-oe-row">
          {TOOLS.map(t => (
            <button
              key={t.id}
              type="button"
              className={"cy-oe-icon" + (tool === t.id ? " is-on" : "")}
              onClick={() => setTool(t.id)}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}

          {WIDTHS.map(w => (
            <button
              key={w}
              type="button"
              className={"cy-oe-width" + (w === width ? " is-on" : "")}
              onClick={() => setWidth(w)}
              aria-label={`굵기 ${w}`}
              aria-pressed={w === width}
            >
              <span style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}

          {tool === "rect" || tool === "ellipse" ? (
            <button
              type="button"
              className={"cy-oe-btn" + (filled ? " is-on" : "")}
              onClick={() => setFilled(v => !v)}
              aria-pressed={filled}
              title="도형 속까지 칠하기"
            >
              채움
            </button>
          ) : null}

          <label className="cy-oe-opacity" title={`농도 ${Math.round(opacity * 100)}%`}>
            <span aria-hidden="true">농도</span>
            <input
              id={`${fieldId}-opacity`}
              name="oekaki-opacity"
              type="range"
              min={10}
              max={100}
              step={10}
              value={Math.round(opacity * 100)}
              onChange={e => setOpacity(Number(e.target.value) / 100)}
              aria-label={`농도 ${Math.round(opacity * 100)}퍼센트`}
            />
          </label>

          <button
            type="button"
            className="cy-oe-icon"
            onClick={() => restore(undoRef, redoRef)}
            disabled={steps.undo === 0}
            aria-label="되돌리기"
            title="되돌리기"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="cy-oe-icon"
            onClick={() => restore(redoRef, undoRef)}
            disabled={steps.redo === 0}
            aria-label="다시하기"
            title="다시하기"
          >
            <UndoIcon flip />
          </button>
        </div>

        <div className="cy-oe-row">
          <span className="cy-oe-layers">
            {layers.map((l, i) => (
              <span key={l.id} className="cy-oe-layer">
                <button
                  type="button"
                  className={"cy-oe-layer-pick" + (l.id === activeId ? " is-on" : "")}
                  onClick={() => setActiveId(l.id)}
                  aria-pressed={l.id === activeId}
                  title={`레이어 ${i + 1} 선택`}
                >
                  {i + 1}
                </button>
                <button
                  type="button"
                  className={"cy-oe-layer-eye" + (l.visible ? "" : " is-off")}
                  onClick={() =>
                    setLayers(prev =>
                      prev.map(x => (x.id === l.id ? { ...x, visible: !x.visible } : x))
                    )
                  }
                  aria-label={`레이어 ${i + 1} ${l.visible ? "숨기기" : "보이기"}`}
                  title={l.visible ? "숨기기" : "보이기"}
                >
                  {l.visible ? "◉" : "○"}
                </button>
                {layers.length > 1 ? (
                  <button
                    type="button"
                    className="cy-oe-layer-del"
                    onClick={() => removeLayer(l.id)}
                    aria-label={`레이어 ${i + 1} 지우기`}
                    title="이 레이어 지우기"
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
            {layers.length < MAX_LAYERS ? (
              <button type="button" className="cy-oe-icon" onClick={addLayer} title="레이어 추가">
                +
              </button>
            ) : null}
          </span>
        </div>

        {!activeVisible ? (
          <p className="cy-oe-hidden-note">선택한 레이어가 숨겨져 있어 그릴 수 없어요.</p>
        ) : null}

        <div className="cy-oe-row">
          <input
            id={`${fieldId}-title`}
            name="oekaki-title"
            className="cy-oe-comment"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="제목 (안 써도 됩니다)"
            maxLength={OEKAKI_LIMITS.comment}
            aria-label="그림 제목"
          />
          <button type="button" className="cy-gb-submit" onClick={submit} disabled={sending}>
            {sending ? "올리는 중" : "남기기"}
          </button>
          <button type="button" className="cy-oe-btn" onClick={onCancel} disabled={sending}>
            닫기
          </button>
        </div>

        {error ? <span className="cy-gb-message is-error">{error}</span> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   그리는 과정 재생

   기록에는 벡터로 되는 도구만 담겨 있습니다. 흐리게는 자리만 있고 건너뜁니다.
   그래서 도중 화면이 최종 그림과 조금 다를 수 있는데, 재생이 끝나면 저장된
   그림으로 바꿔서 마지막 장면은 늘 정확합니다.
   --------------------------------------------------------------- */
const REPLAY_SECONDS = 6;
/* 도형은 시작점과 끝점만 기록되어 있어 그대로 그리면 한 프레임에 튀어나옵니다.
   테두리를 이만큼으로 나눠 조금씩 그어 펜과 속도를 맞춥니다. */
const SHAPE_STEPS = 20;

/* 사각형 테두리를 한 줄로 편 좌표입니다. 모서리를 도는 선으로 그리면
   부분만 그리기가 쉽습니다. */
function rectPath(x1: number, y1: number, x2: number, y2: number) {
  const l = Math.min(x1, x2), r = Math.max(x1, x2);
  const t = Math.min(y1, y2), b = Math.max(y1, y2);
  return [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
    [l, t]
  ] as [number, number][];
}

/* 이어진 선을 앞에서부터 비율만큼만 그립니다. */
function partialPolyline(c: CanvasRenderingContext2D, pts: [number, number][], t: number) {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  if (total === 0) return;
  let left = total * t;

  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < lens.length && left > 0; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    if (left >= lens[i]) {
      c.lineTo(bx, by);
      left -= lens[i];
    } else {
      const k = left / lens[i];
      c.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
      left = 0;
    }
  }
  c.stroke();
}

function OekakiPlayer({ image, ops }: { image: string; ops: ReplayOp[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const view = canvasRef.current?.getContext("2d");
    if (!view) return;
    let raf = 0;
    let stopped = false;
    setDone(false);

    /* 한 획을 그리는 동안에는 그 획을 시작하기 직전 그림을 base 에 두고,
       매 프레임 base 를 깔고 그 위에 지금까지 그은 만큼을 얹습니다.
       매 프레임 덧그리기만 하면 농도가 낮을 때 겹쳐서 점점 짙어집니다. */
    const make = () => {
      const c = document.createElement("canvas");
      c.width = SIZE;
      c.height = SIZE;
      return c;
    };
    const base = make();
    const temp = make();
    const baseC = base.getContext("2d");
    const tempC = temp.getContext("2d");
    if (!baseC || !tempC) return;

    const clear = (c: CanvasRenderingContext2D) => c.clearRect(0, 0, SIZE, SIZE);

    baseC.fillStyle = BACKGROUND;
    baseC.fillRect(0, 0, SIZE, SIZE);

    const segmentsOf = (o: ReplayOp) => {
      if (o.k === OP.blur) return 0;
      if (o.k === OP.fill) return 1;
      if (o.k === OP.pen || o.k === OP.eraser) return Math.max(1, (o.p?.length ?? 2) / 2 - 1);
      return SHAPE_STEPS;
    };
    const total = ops.reduce((n, o) => n + segmentsOf(o), 0);
    const perFrame = Math.max(1, Math.ceil(total / (60 * REPLAY_SECONDS)));

    let opIdx = 0;
    let segIdx = 0;

    /* 지금 획을 임시 판에 불투명으로 그립니다. 농도는 얹을 때 한 번만 씁니다. */
    const paintTemp = (o: ReplayOp, upto: number) => {
      clear(tempC);
      tempC.strokeStyle = o.c ?? "#000000";
      tempC.fillStyle = o.c ?? "#000000";
      tempC.lineWidth = o.k === OP.eraser ? (o.w ?? 7) * 2 : o.w ?? 7;
      tempC.lineCap = "round";
      tempC.lineJoin = "round";

      const p = o.p ?? [];
      if (o.k === OP.pen || o.k === OP.eraser) {
        if (p.length < 2) return;
        let x = p[0], y = p[1];
        tempC.beginPath();
        tempC.moveTo(x, y);
        if (p.length === 2) tempC.lineTo(x + 0.01, y);
        for (let i = 2; i <= upto * 2 && i < p.length; i += 2) {
          x += p[i];
          y += p[i + 1];
          tempC.lineTo(x, y);
        }
        tempC.stroke();
        return;
      }

      if (p.length < 4) return;
      const [x1, y1, x2, y2] = p;
      const t = Math.min(1, upto / SHAPE_STEPS);

      /* 채움은 테두리를 다 두른 뒤에 칠합니다. 그리다 만 도형을 칠하면
         엉뚱한 모양이 잠깐 보입니다. */
      if (o.f && t >= 1) {
        tempC.beginPath();
        if (o.k === OP.rect) {
          tempC.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        } else {
          tempC.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
        }
        tempC.fill();
      }

      if (o.k === OP.line) {
        partialPolyline(tempC, [[x1, y1], [x2, y2]], t);
      } else if (o.k === OP.rect) {
        partialPolyline(tempC, rectPath(x1, y1, x2, y2), t);
      } else {
        /* 타원은 위에서 시작해 시계 방향으로 돌립니다. */
        tempC.beginPath();
        tempC.ellipse(
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          Math.abs(x2 - x1) / 2,
          Math.abs(y2 - y1) / 2,
          0,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * t
        );
        tempC.stroke();
      }
    };

    /* base 를 깔고 그 위에 지금 획을 농도만큼 얹어 화면을 만듭니다. */
    const show = (o: ReplayOp | null) => {
      view.globalAlpha = 1;
      view.globalCompositeOperation = "source-over";
      view.clearRect(0, 0, SIZE, SIZE);
      view.drawImage(base, 0, 0);
      if (!o) return;
      view.globalAlpha = (o.o ?? 100) / 100;
      view.globalCompositeOperation = o.k === OP.eraser ? "destination-out" : "source-over";
      view.drawImage(temp, 0, 0);
      view.globalAlpha = 1;
      view.globalCompositeOperation = "source-over";
    };

    const keep = () => {
      clear(baseC);
      baseC.drawImage(canvasRef.current as HTMLCanvasElement, 0, 0);
    };

    const step = () => {
      if (stopped) return;
      let budget = perFrame;

      while (budget > 0 && opIdx < ops.length) {
        const o = ops[opIdx];

        if (o.k === OP.blur) {
          opIdx += 1;
          continue;
        }

        if (o.k === OP.fill) {
          show(null);
          const p = o.p ?? [];
          const mask = floodMask(view.getImageData(0, 0, SIZE, SIZE), p[0], p[1]);
          const img = view.getImageData(0, 0, SIZE, SIZE);
          const { r, g, b } = hexToRgb(o.c ?? "#000000");
          for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            const q = i * 4;
            img.data[q] = r;
            img.data[q + 1] = g;
            img.data[q + 2] = b;
            img.data[q + 3] = 255;
          }
          view.putImageData(img, 0, 0);
          keep();
          opIdx += 1;
          budget -= 1;
          continue;
        }

        const segs = segmentsOf(o);
        segIdx += 1;
        paintTemp(o, segIdx);
        show(o);
        budget -= 1;

        if (segIdx >= segs) {
          keep();
          opIdx += 1;
          segIdx = 0;
        }
      }

      if (opIdx >= ops.length) {
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(step);
    };

    show(null);
    raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [ops, round]);

  return (
    <div className="cy-oe-player">
      {/* 재생이 끝나면 저장된 그림을 위에 얹습니다. 흐리게처럼 재현하지 않는
          것이 있어도 마지막 장면은 늘 정확합니다.

          캔버스를 그림으로 바꿔치우면 DOM 에서 빠져 참조가 사라집니다.
          그러면 다시 재생을 눌러도 그릴 대상이 없어 아무 일도 안 일어납니다.
          그래서 감추기만 하고 자리에 남겨 둡니다. */}
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className={"cy-oe-big" + (done ? " is-hidden" : "")}
      />
      {done ? <img className="cy-oe-big" src={image} alt="다 그려진 그림" /> : null}
      <button type="button" className="cy-oe-btn" onClick={() => setRound(r => r + 1)}>
        {done ? "다시 재생" : "처음부터"}
      </button>
    </div>
  );
}

/* 보이는 그림만 받아옵니다. 목록 문서에는 이미지가 없습니다.
   예전 그림은 문서 안에 남아 있어 그대로 씁니다. */
function useOekakiImage(item: OekakiEntry) {
  /* 문서에 이미 이미지가 있으면 그대로 씁니다. state 로 옮겨 담지 않습니다.
     받아온 것만 담아 두었다가 없을 때 씁니다. */
  const [fetched, setFetched] = useState<string | null>(null);

  useEffect(() => {
    if (item.image) return;
    let cancelled = false;
    getOekakiImage(item.id)
      .then(img => {
        if (!cancelled) setFetched(img);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.image]);

  return item.image ?? fetched;
}

/* ---------------------------------------------------------------
   목록 한 줄. 그림 옆에 글쓴이, 제목, 덧글이 붙습니다.
   --------------------------------------------------------------- */
function OekakiRow({
  item,
  viewer,
  onOpen
}: {
  item: OekakiEntry;
  viewer: SignedInUser | null;
  onOpen: () => void;
}) {
  const [replies, setReplies] = useState<OekakiReply[]>([]);
  const src = useOekakiImage(item);

  useEffect(
    () => subscribeOekakiReplies(item.id, setReplies, () => setReplies([])),
    [item.id]
  );

  return (
    <li className="cy-oe-item">
      <button
        type="button"
        className="cy-oe-thumb"
        onClick={onOpen}
        aria-label={`${item.author} 님의 그림 열기`}
      >
        {/* data URL 이라 next/image 를 쓸 수 없고 최적화 대상도 아닙니다. */}
        {src ? (
          <img src={src} alt={item.comment || `${item.author} 님의 그림`} loading="lazy" />
        ) : (
          <span className="cy-oe-loading" aria-label="그림 불러오는 중" />
        )}
        {item.hidden ? <span className="cy-oe-badge">가림</span> : null}
      </button>

      <div className="cy-oe-side">
        <div className="cy-oe-side-head">
          {item.comment ? (
            <button type="button" className="cy-oe-title" onClick={onOpen}>
              {item.comment}
            </button>
          ) : (
            <button type="button" className="cy-oe-title is-empty" onClick={onOpen}>
              제목 없음
            </button>
          )}
          <span className="cy-oe-author">{item.author}</span>
          <span className="cy-oe-date">
            {item.date} {item.time}
          </span>
        </div>

        {replies.length > 0 ? (
          <ul className="cy-oe-reply-preview">
            {replies.slice(-3).map(r => (
              <li key={r.id}>
                <span className="cy-oe-reply-author">{r.author}</span>
                <span className="cy-oe-reply-text">{r.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <button type="button" className="cy-oe-more" onClick={onOpen}>
          {replies.length > 0 ? `덧글 ${replies.length}개 보기` : "덧글 남기기"}
        </button>
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------
   그림 한 장을 크게 보고 덧글을 다는 화면
   --------------------------------------------------------------- */
function OekakiDetail({
  item,
  viewer,
  onClose,
  onDeleted
}: {
  item: OekakiEntry;
  viewer: SignedInUser | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const fieldId = useId();
  const src = useOekakiImage(item);
  const [replies, setReplies] = useState<OekakiReply[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* 재생 기록은 눌렀을 때만 받아옵니다. 목록에서는 건드리지 않습니다. */
  const [ops, setOps] = useState<ReplayOp[] | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);

  useEffect(() => subscribeOekakiReplies(item.id, setReplies, () => setReplies([])), [item.id]);

  const play = async () => {
    if (loadingOps) return;
    setLoadingOps(true);
    setError(null);
    try {
      const replay = await getOekakiReplay(item.id);
      if (!replay || !replay.ops) {
        setError("이 그림은 그리는 과정이 기록되지 않았어요.");
        return;
      }
      setOps(JSON.parse(replay.ops) as ReplayOp[]);
    } catch {
      setError("그리는 과정을 불러오지 못했어요.");
    } finally {
      setLoadingOps(false);
    }
  };

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await addOekakiReply(item.id, text);
      setText("");
    });

  const removeDrawing = () => {
    if (!window.confirm("이 그림을 지울까요? 되돌릴 수 없어요.")) return;
    run(async () => {
      await deleteOekaki(item.id);
      onDeleted();
    });
  };

  return (
    <div className="cy-oe-detail">
      <div className="cy-oe-detail-head">
        <button type="button" className="cy-oe-btn" onClick={onClose}>
          목록으로
        </button>
        {ops ? (
          <button type="button" className="cy-oe-btn" onClick={() => setOps(null)}>
            그림 보기
          </button>
        ) : (
          <button type="button" className="cy-oe-btn" onClick={play} disabled={loadingOps}>
            {loadingOps ? "여는 중" : "그리는 과정 재생"}
          </button>
        )}
        {isOwner(viewer) ? (
          <button
            type="button"
            className="cy-oe-btn"
            onClick={() => run(() => setOekakiHidden(item.id, !item.hidden))}
            disabled={busy}
          >
            {item.hidden ? "가림 풀기" : "가림 처리"}
          </button>
        ) : null}
        {canDeleteEntry(viewer, item.uid) ? (
          <button type="button" className="cy-oe-btn" onClick={removeDrawing} disabled={busy}>
            그림 삭제
          </button>
        ) : null}
      </div>

      {item.hidden ? (
        <p className="cy-oe-hidden-note">가림 처리된 그림입니다. 주인장에게만 보입니다.</p>
      ) : null}

      {ops && src ? (
        <OekakiPlayer image={src} ops={ops} />
      ) : src ? (
        <img className="cy-oe-big" src={src} alt={item.comment || `${item.author} 님의 그림`} />
      ) : (
        <div className="cy-oe-big cy-oe-loading" aria-label="그림 불러오는 중" />
      )}

      <div className="cy-oe-detail-meta">
        {item.comment ? <span className="cy-oe-title-text">{item.comment}</span> : null}
        <span className="cy-oe-author">{item.author}</span>
        <span className="cy-oe-date">
          {item.date} {item.time}
        </span>
      </div>

      <div className="cy-oe-replies">
        {replies === null ? (
          <div className="cy-gb-loading">덧글을 불러오는 중…</div>
        ) : replies.length === 0 ? (
          <div className="cy-gb-loading">아직 덧글이 없어요.</div>
        ) : (
          replies.map(r => (
            <div key={r.id} className="cy-oe-reply">
              <span className="cy-oe-reply-author">{r.author}</span>
              <span className="cy-oe-reply-text">{r.text}</span>
              <span className="cy-oe-date">
                {r.date} {r.time}
                {canDeleteEntry(viewer, r.uid) ? (
                  <button
                    type="button"
                    className="cg-act"
                    onClick={() => run(() => deleteOekakiReply(item.id, r.id))}
                  >
                    삭제
                  </button>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>

      {viewer ? (
        <div className="cy-oe-row">
          <input
            id={`${fieldId}-reply`}
            name="oekaki-reply"
            className="cy-oe-comment"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`${viewer.name} 님으로 덧글 남기기`}
            maxLength={OEKAKI_LIMITS.reply}
            aria-label="덧글"
          />
          <button type="button" className="cy-gb-submit" onClick={send} disabled={busy}>
            {busy ? "다는 중" : "덧글"}
          </button>
        </div>
      ) : (
        <div className="cy-gb-signin">
          <button type="button" className="cy-gb-google" onClick={() => signInWithGoogle()}>
            구글 로그인
          </button>
          <span className="cy-gb-signin-text">하면 덧글을 남길 수 있어요.</span>
        </div>
      )}

      {error ? <span className="cy-gb-message is-error">{error}</span> : null}
    </div>
  );
}

/* ---------------------------------------------------------------
   목록
   --------------------------------------------------------------- */
export default function Oekaki() {
  const [items, setItems] = useState<OekakiEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [me, setMe] = useState<SignedInUser | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [help, setHelp] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tidying, setTidying] = useState(false);

  const viewer = me ?? null;

  useEffect(() => {
    if (!isGuestbookEnabled) return;
    return subscribeUser(setMe);
  }, []);

  /* 주인장인지에 따라 질의가 달라지므로 로그인 상태가 바뀌면 다시 겁니다. */
  useEffect(() => {
    if (!isGuestbookEnabled || me === undefined) return;
    return subscribeOekaki(60, viewer, setItems, () => setFailed(true));
  }, [viewer, me]);

  const save = async (dataUrl: string, comment: string, replay: OekakiReplay) => {
    await addOekaki(dataUrl, comment, replay);
    setOpen(false);
    setPage(0);
    setNotice("그림을 남겼어요. 고맙습니다!");
  };

  /* 예전 그림은 문서 안에 이미지가 들어 있어 목록을 무겁게 합니다.
     주인장이 한 번 눌러 하위 문서로 옮길 수 있게 합니다. */
  const heavy = (items ?? []).filter(i => i.image);
  const tidy = async () => {
    if (tidying) return;
    setTidying(true);
    setNotice(null);
    let moved = 0;
    try {
      for (const item of heavy) {
        if (!item.image) continue;
        await moveOekakiImage(item.id, item.image);
        moved += 1;
      }
      setNotice(`옛 그림 ${moved}장을 정리했어요.`);
    } catch (e) {
      setNotice(
        `${moved}장까지 정리하고 멈췄어요. ` +
          (e instanceof Error ? e.message : "다시 눌러 주세요.")
      );
    } finally {
      setTidying(false);
    }
  };

  if (!isGuestbookEnabled || failed) return null;

  const viewing = items?.find(i => i.id === openId) ?? null;
  const list = items ?? [];
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = list.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="cy-content-box">
      <div className="cy-section-title">
        오에카키
        <span className="cy-sub-text">그림으로 남기는 방명록</span>
        <button
          type="button"
          className="cy-oe-help-btn"
          onClick={() => setHelp(v => !v)}
          aria-expanded={help}
          aria-label="오에카키가 무엇인지 보기"
          title="이게 뭔가요?"
        >
          ?
        </button>
      </div>

      {help ? (
        <div className="cy-oe-help">
          <p>
            <b>오에카키(お絵かき)</b>는 2000년대 초 게시판에서 유행하던 그림 방명록입니다.
            따로 프로그램을 깔지 않고 웹페이지에서 바로 그려 올리고, 서로 덧글을 달았습니다.
          </p>
          <p>
            잘 그릴 필요 없습니다. 낙서가 제 맛입니다. 지나간 자리에 그림 한 장 남겨 주세요.
          </p>
          <p className="cy-oe-help-tip">
            펜·직선·사각형·원으로 그리고, 채우기로 안쪽을 칠합니다. 사각형과 원은 채움을 켜면 속까지 칠해집니다. 스포이드는 이미 쓴 색을
            다시 집고, 흐리게는 지나간 자리를 부드럽게 만듭니다. 농도를 낮추면 수채처럼 겹쳐집니다.
            레이어를 나누면 밑그림 위에 덧그렸다가 밑그림만 끌 수 있어요.
          </p>
          <p className="cy-oe-help-tip">
            남긴 그림을 눌러 <b>그리는 과정 재생</b>을 누르면 선이 하나씩 그어지는 걸 볼 수 있어요.
            흐리게로 칠한 부분은 재생에서 건너뜁니다.
          </p>
        </div>
      ) : null}

      {viewing ? (
        <OekakiDetail
          key={viewing.id}
          item={viewing}
          viewer={viewer}
          onClose={() => setOpenId(null)}
          onDeleted={() => setOpenId(null)}
        />
      ) : (
        <>
          {open ? (
            <OekakiPad onDone={save} onCancel={() => setOpen(false)} />
          ) : me === undefined ? null : me ? (
            <div className="cy-oe-start">
              <button
                type="button"
                className="cy-gb-submit"
                onClick={() => {
                  setNotice(null);
                  setOpen(true);
                }}
              >
                그림 그리기
              </button>
              {isOwner(viewer) && heavy.length > 0 ? (
                <button type="button" className="cy-oe-btn" onClick={tidy} disabled={tidying}>
                  {tidying ? "정리하는 중" : `옛 그림 ${heavy.length}장 정리`}
                </button>
              ) : null}
              {notice ? <span className="cy-gb-message">{notice}</span> : null}
            </div>
          ) : (
            <div className="cy-gb-signin">
              <button type="button" className="cy-gb-google" onClick={() => signInWithGoogle()}>
                구글 로그인
              </button>
              <span className="cy-gb-signin-text">하면 그림을 남길 수 있어요.</span>
            </div>
          )}

          {items === null ? (
            <div className="cy-gb-loading">그림을 불러오는 중…</div>
          ) : list.length === 0 ? (
            <div className="cy-gb-loading">아직 그림이 없어요.</div>
          ) : (
            <>
              <ul className="cy-oe-list">
                {shown.map(item => (
                  <OekakiRow
                    key={item.id}
                    item={item}
                    viewer={viewer}
                    onOpen={() => setOpenId(item.id)}
                  />
                ))}
              </ul>

              {pageCount > 1 ? (
                <div className="cy-gb-pagination">
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`cy-gb-page${i === current ? " is-active" : ""}`}
                      onClick={() => setPage(i)}
                      aria-current={i === current ? "page" : undefined}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
