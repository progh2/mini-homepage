"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/* 루멘 스킨의 3D 무대입니다.

   두 겹입니다.

     WebGL : 하늘, 해와 달, 오로라, 호수, 반딧불이 (cy-background-pattern 안).
             색은 이 기기의 시각을 따라 새벽, 낮, 저녁, 밤으로 바뀝니다.
     CSS3D : 탭 내용이 담긴 종이. 고르지 않은 장은 아래 뭉치에 있고,
             고른 장만 뭉치에서 빼서 위로 올려 읽습니다.

   네온이 창을 한 바퀴 돌리는 것과 다릅니다. 각도로 펼치지 않고,
   읽는 장만 정면으로 올려 둡니다.

   CSS3DRenderer 는 넘겨받은 DOM 의 transform 을 직접 씁니다. React 가
   만든 노드를 넘기면 둘이 같은 노드를 두고 다툽니다. 빈 div 를 만들어
   렌더러에게 주고, 내용은 createPortal 로 넣습니다.

   앞 페이지는 글자가 선명해야 합니다. 카메라를 흔들면 소수 픽셀이 생겨
   글자가 번지므로 카메라는 고정하고, 달과 불빛만 마우스를 따라갑니다.

   3D 안에 있는 요소에 filter 나 backdrop-filter 를 주면 브라우저가
   그 요소를 평평하게 다시 그립니다. 페이지 유리에는 쓰지 않습니다.

   three 는 이 파일이 불릴 때만 따라옵니다. 다른 스킨의 첫 화면에는
   들어가지 않습니다. */

const FOV = 46;

type Stage = {
  dispose: () => void;
};

const SKY_VERT = `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/* 한 장의 사각형에 밤을 그립니다. 지오메트리를 많이 두지 않으려고
   달, 별, 오로라, 수면은 전부 이 셰이더 안에 있습니다. */
const SKY_FRAG = `
  precision highp float;
  uniform float uTime;
  uniform float uMotion;
  uniform float uTurn;
  uniform float uWater;
  uniform vec2 uRes;
  uniform vec2 uMouse;
  uniform vec2 uMoon;
  /* 0 이면 가로 화면의 달, 1 이면 세로 화면의 달입니다. 세로에서는
     같은 상수가 화면을 하얗게 덮어서, 달의 크기와 빛만 줄입니다. */
  uniform float uPhone;
  /* 시각입니다. uNight 이 1 이면 지금의 달밤이고, uDay 가 1 이면 한낮입니다.
     uGlow 는 해가 지평선 근처에 있을 때, uMorning 은 그때가 아침인지입니다. */
  uniform float uHour;
  uniform float uDay;
  uniform float uNight;
  uniform float uGlow;
  uniform float uMorning;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float t = uTime * uMotion;
    vec2 m = uMouse * 0.035 * max(uMotion, 0.35);

    vec3 zenith = vec3(0.025, 0.02, 0.07);
    vec3 midSky = vec3(0.09, 0.05, 0.18);
    vec3 horizon = vec3(0.55, 0.32, 0.38);
    /* 종이 위로 보이는 띠가 천정입니다. 한낮과 노을은 여기서 바로 달라져야 합니다. */
    vec3 zenithD = vec3(0.40, 0.70, 0.96);
    vec3 midD = vec3(0.62, 0.84, 0.98);
    vec3 horD = vec3(0.90, 0.95, 0.99);
    vec3 zenithG = mix(vec3(0.90, 0.46, 0.40), vec3(0.84, 0.66, 0.76), uMorning);
    vec3 midG = mix(vec3(0.96, 0.42, 0.30), vec3(0.98, 0.74, 0.62), uMorning);
    vec3 horG = mix(vec3(0.99, 0.55, 0.28), vec3(1.0, 0.82, 0.55), uMorning);
    float g = clamp(uGlow * (1.0 - uDay * 0.85), 0.0, 1.0);
    zenith = mix(mix(zenith, zenithD, uDay), zenithG, g);
    midSky = mix(mix(midSky, midD, uDay), midG, g);
    horizon = mix(mix(horizon, horD, uDay), horG, g);
    vec3 col = mix(horizon, midSky, smoothstep(0.22, 0.58, uv.y));
    col = mix(col, zenith, smoothstep(0.5, 1.0, uv.y));

    vec2 drift = m + vec2(sin(t * 0.05), cos(t * 0.04)) * 0.01;
    vec2 suv = uv + drift * 0.4;
    vec2 grid = uRes / 2.7;
    vec2 id = floor(suv * grid);
    vec2 gv = fract(suv * grid) - 0.5;
    float nstar = hash(id);
    float tw = 0.55 + 0.45 * sin(t * 1.7 + nstar * 40.0);
    float star = step(0.988, nstar) * smoothstep(0.22, 0.0, length(gv));
    star *= tw * smoothstep(uWater + 0.02, uWater + 0.22, uv.y);
    col += vec3(0.92, 0.94, 1.0) * star * uNight;

    float band = exp(-pow((uv.y - (0.78 + drift.y)) * 3.2, 2.0));
    float milk = fbm(vec2(uv.x * 2.0 + t * 0.01, uv.y * 3.0));
    col += vec3(0.45, 0.4, 0.7) * band * milk * 0.18 * uNight;

    vec2 moon = uMoon + drift;
    vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
    vec2 mp = (uv - moon) * aspect;
    float md = length(mp);
    float rad = mix(0.074, 0.034, uPhone);
    float disc = smoothstep(rad, mix(0.058, 0.026, uPhone), md);
    float limb = smoothstep(mix(0.015, 0.008, uPhone), mix(0.07, 0.03, uPhone), md);
    float cr = noise(mp * 22.0 + 4.0);
    vec3 moonCol = vec3(1.0, 0.96, 0.88) * (0.9 + 0.1 * cr) * (1.0 - limb * 0.22);
    float halo = exp(-md * mix(8.5, 20.0, uPhone)) * mix(0.38, 0.14, uPhone);
    float glow = exp(-md * mix(2.6, 9.0, uPhone)) * mix(0.14, 0.04, uPhone);
    col += (moonCol * disc + vec3(1.0, 0.94, 0.82) * (halo + glow) * (1.0 + uTurn * 0.25)) * uNight;
    /* 달에서 호수까지 이어지는 빛기둥. 세로 화면은 가로 비율이 1보다
       작아서, 그대로 두면 기둥이 화면 너비로 퍼집니다. */
    float span = max(aspect.x, 1.0);
    float ray = exp(-pow((uv.x - moon.x) * span * 2.6, 2.0));
    col += vec3(1.0, 0.9, 0.72) * ray * smoothstep(0.0, 0.9, moon.y - uv.y) * mix(0.2, 0.08, uPhone) * uNight;

    /* 해는 종이 위 하늘에 둡니다. uv 위쪽이 화면 위라서, 물 높이에서 올리면
       한낮의 해가 화면 밖으로 나갑니다. JS 의 skyClock 과 같은 elev 입니다. */
    float elev = sin((uHour - 6.0) * 0.2617994);
    float sunVis = smoothstep(-0.04, 0.16, elev);
    float sunT = clamp((uHour - 6.0) / 12.0, 0.0, 1.0);
    float arc = sin(sunT * 3.14159265);
    float sunX = mix(0.66, 0.78, sunT);
    float sunY = mix(mix(0.932, 0.962, arc), mix(0.955, 0.976, arc), uPhone);
    vec2 sun = vec2(sunX, sunY) + drift;
    float sdist = length((uv - sun) * aspect);
    float srad = mix(0.042, 0.022, uPhone);
    float sdisc = smoothstep(srad, srad * 0.62, sdist);
    float sunglow = exp(-sdist * mix(3.4, 8.0, uPhone));
    col += vec3(1.0, 0.98, 0.90) * sdisc * sunVis;
    col += vec3(1.0, 0.78, 0.42) * sunglow * sunVis * max(uDay * 0.38, uGlow * 0.72);

    float ax = uv.x + drift.x + t * 0.02;
    float n = fbm(vec2(ax * 2.4, uv.y * 1.6 - t * 0.03));
    float y1 = 0.8 + sin(ax * 5.0 + t * 0.3) * 0.04 + n * 0.04;
    float y2 = 0.88 + sin(ax * 9.0 - t * 0.22) * 0.025;
    float y3 = 0.73 + sin(ax * 3.2 + t * 0.16) * 0.035;
    float fiber = 0.72 + 0.28 * sin(uv.y * 70.0 + n * 8.0);
    float b1 = exp(-pow((uv.y - y1) * 9.0, 2.0)) * fiber;
    float b2 = exp(-pow((uv.y - y2) * 13.0, 2.0));
    float b3 = exp(-pow((uv.y - y3) * 7.0, 2.0));
    float above = smoothstep(uWater + 0.02, uWater + 0.2, uv.y);
    float aurora = mix(uGlow * 0.4, 1.0, uNight);
    col += vec3(0.35, 0.85, 0.78) * b1 * (0.28 + n * 0.45) * above * aurora;
    col += vec3(0.55, 0.4, 0.95) * b2 * 0.32 * above * aurora;
    col += vec3(0.95, 0.55, 0.7) * b3 * 0.16 * above * aurora;
    col += vec3(0.5, 0.85, 0.8) * uTurn * b1 * 0.25 * uNight;

    float cloudN = fbm(vec2(uv.x * 2.6 + t * 0.015, uv.y * 1.8 + 3.0));
    float clouds = smoothstep(0.52, 0.8, cloudN) * smoothstep(uWater + 0.08, 0.55, uv.y);
    col = mix(col, vec3(0.97, 0.98, 0.99), clouds * uDay * 0.5);
    col = mix(col, mix(vec3(0.98, 0.58, 0.40), vec3(0.99, 0.78, 0.58), uMorning), clouds * uGlow * 0.4);

    if (uv.y < uWater + 0.06) {
      float rip = sin(uv.x * 38.0 + t * 1.15 + fbm(uv * 5.0 + t * 0.08) * 2.4) * 0.004;
      rip += sin(uv.x * 14.0 - t * 0.7) * 0.003;
      float wet = smoothstep(uWater + 0.045, uWater - 0.02, uv.y);
      float depth = smoothstep(uWater, 0.0, uv.y);
      vec3 waterN = mix(vec3(0.2, 0.17, 0.3), vec3(0.06, 0.08, 0.14), depth);
      vec3 waterD = mix(vec3(0.62, 0.84, 0.96), vec3(0.22, 0.50, 0.74), depth);
      vec3 waterGm = mix(vec3(0.90, 0.66, 0.60), vec3(0.40, 0.26, 0.34), depth);
      vec3 waterGe = mix(vec3(0.82, 0.40, 0.32), vec3(0.32, 0.16, 0.22), depth);
      vec3 waterG = mix(waterGe, waterGm, uMorning);
      vec3 water = mix(mix(waterN, waterD, uDay), waterG, g);
      float shimmer = 0.55 + 0.45 * sin(uv.y * 22.0 - t * 1.4 + uv.x * 6.0);
      float moonPath = exp(-pow((uv.x - moon.x + rip * 1.6) * span * 2.4, 2.0));
      float sunPath = exp(-pow((uv.x - sun.x + rip * 1.6) * span * 2.2, 2.0));
      water += vec3(1.0, 0.94, 0.8) * moonPath * shimmer * mix(1.15, 0.42, uPhone) * wet * uNight;
      water += vec3(1.0, 0.86, 0.55) * sunPath * shimmer * mix(1.05, 0.4, uPhone) * wet * sunVis;
      float cau = fbm(vec2(uv.x * 7.0 + t * 0.12, uv.y * 12.0 - t * 0.25));
      water += vec3(0.45, 0.75, 0.72) * pow(cau, 3.0) * 0.22 * wet * mix(0.35, 1.0, max(uNight, g));
      water += vec3(0.35, 0.22, 0.4) * exp(-pow((uv.y - uWater) * 10.0, 2.0)) * 0.35 * max(uNight, g * 0.65);
      col = mix(col, water, wet);
    }

    float mist = exp(-pow((uv.y - uWater) * 16.0, 2.0));
    col += vec3(0.9, 0.82, 0.95) * mist * mix(0.1, 0.28, max(uNight, g));

    float fly = fract(t * 0.055 + 0.2);
    vec2 s0 = vec2(-0.08 + fly * 0.95, 0.9 - fly * 0.22);
    vec2 dir = normalize(vec2(0.86, -0.34));
    vec2 sp = uv - s0;
    float along = dot(sp, dir);
    float side = length(sp - dir * along);
    float head = smoothstep(0.0, 0.02, along) * smoothstep(0.2, 0.0, along);
    float shoot = head * exp(-side * side * 9000.0);
    shoot *= smoothstep(0.02, 0.12, fly) * smoothstep(0.92, 0.55, fly);
    shoot *= step(uWater + 0.08, uv.y) * uMotion * uNight;
    col += vec3(1.0, 0.96, 0.88) * shoot;

    vec2 vg = uv - 0.5;
    col *= 1.0 - dot(vg, vg) * mix(0.34, 0.08, max(uDay, g * 0.55));
    col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export default function LumenStage({
  tabs,
  labels,
  active,
  onSelect,
  renderPanel,
  backgroundRef,
  locked,
  onFallback
}: {
  tabs: readonly string[];
  labels: Record<string, string>;
  active: string;
  onSelect: (tab: string) => void;
  renderPanel: (tab: string) => ReactNode;
  backgroundRef: RefObject<HTMLDivElement | null>;
  locked: boolean;
  onFallback: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<HTMLDivElement[]>([]);

  const activeRef = useRef(active);
  const lockedRef = useRef(locked);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    activeRef.current = active;
    lockedRef.current = locked;
    selectRef.current = onSelect;
  }, [active, locked, onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const made = tabs.map(tab => {
      const el = document.createElement("div");
      el.className = "cy-right-content";
      el.setAttribute("role", "tabpanel");
      el.id = `cy-panel-${tab}`;
      el.setAttribute("aria-labelledby", `cy-tab-${tab}`);
      mount.appendChild(el);
      return el;
    });
    setHosts(made);

    return () => {
      made.forEach(el => el.remove());
      setHosts([]);
    };
  }, [tabs]);

  useEffect(() => {
    hosts.forEach((el, i) => {
      const on = tabs[i] === active;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-hidden", on ? "false" : "true");
      el.tabIndex = on ? 0 : -1;
      if (!on) el.scrollTop = 0;
    });
  }, [hosts, tabs, active]);

  useEffect(() => {
    if (hosts.length === 0) return;
    const background = backgroundRef.current;

    let stage: Stage | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const THREE = await import("three");
        const { CSS3DObject, CSS3DRenderer } = await import(
          "three/examples/jsm/renderers/CSS3DRenderer.js"
        );
        if (cancelled) return;

        stage = buildStage({
          THREE,
          CSS3DObject,
          CSS3DRenderer,
          hosts,
          mount: mountRef.current,
          background,
          getActive: () => tabs.indexOf(activeRef.current),
          isLocked: () => lockedRef.current,
          select: i => selectRef.current(tabs[i])
        });
        if (cancelled) {
          stage.dispose();
          stage = null;
        }
      } catch (e) {
        console.warn("[lumen] 3D 무대를 세우지 못해 2D 로 보여 줍니다.", e);
        if (!cancelled) onFallback();
      }
    })();

    return () => {
      cancelled = true;
      stage?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts, tabs, backgroundRef]);

  useEffect(() => {
    const offs = hosts.map((el, i) => {
      const onClick = (e: MouseEvent) => {
        if (tabs[i] === activeRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        selectRef.current(tabs[i]);
      };
      el.addEventListener("click", onClick, true);
      return () => el.removeEventListener("click", onClick, true);
    });
    return () => offs.forEach(off => off());
  }, [hosts, tabs]);

  return (
    <div ref={mountRef} className="cy-lumen-mount">
      {hosts.map((host, i) =>
        createPortal(
          /* 3D 변환이 걸린 칸은 넘친 글을 자르지 못합니다. 안쪽에 면을
             하나 더 두어 모서리와 글이 카드 안에 머물게 합니다. */
          <div className="cy-page-face">
            <div className="cy-panel-label" aria-hidden="true">
              <span>{labels[tabs[i]]}</span>
            </div>
            <div className="cy-panel-body" inert={tabs[i] !== active}>
              {renderPanel(tabs[i])}
            </div>
          </div>,
          host,
          tabs[i]
        )
      )}
    </div>
  );
}

function smooth01(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/* 해 높이는 6시와 18시에 지평선, 한낮에 가장 높습니다.
   셰이더의 elev 와 같은 식입니다. */
function skyClock(now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const elev = Math.sin(((hour - 6) * Math.PI) / 12);
  const day = smooth01(-0.02, 0.55, elev);
  const night = smooth01(0.08, -0.45, elev);
  const glow = Math.exp(-elev * elev * 10);
  const morning = hour < 12 ? 1 : 0;
  const phase = day > 0.62 ? "day" : night > 0.62 ? "night" : morning ? "dawn" : "dusk";
  return { hour, day, night, glow, morning, phase };
}

function readPx(el: Element, name: string, fallback: number) {
  const raw = getComputedStyle(el).getPropertyValue(name);
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function buildStage({
  THREE,
  CSS3DObject,
  CSS3DRenderer,
  hosts,
  mount,
  background,
  getActive,
  isLocked,
  select
}: {
  THREE: typeof import("three");
  CSS3DObject: typeof import("three/examples/jsm/renderers/CSS3DRenderer.js").CSS3DObject;
  CSS3DRenderer: typeof import("three/examples/jsm/renderers/CSS3DRenderer.js").CSS3DRenderer;
  hosts: HTMLDivElement[];
  mount: HTMLDivElement | null;
  background: HTMLDivElement | null;
  getActive: () => number;
  isLocked: () => boolean;
  select: (i: number) => void;
}): Stage {
  const N = hosts.length;
  /* 장 사이 간격입니다. 화면 위 각도가 아니라, 뭉치에서 몇 번째인지
     세는 값입니다. */
  const STEP = 1;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mq = window.matchMedia("(max-width: 900px)");

  let mouseX = 0;
  let mouseY = 0;
  let frame = 0;
  let last = performance.now();
  let elapsed = 0;
  let rot = 0;
  let rotTarget = 0;
  let settledOn = getActive();
  /* 방금 읽던 장입니다. 이 장과 고른 장만 뭉치 밖으로 움직입니다. */
  let fromIndex = getActive();

  let layout = computeLayout();
  /* 페이지가 멈춘 뒤에는 CSS3D 를 다시 그리지 않습니다. 매 프레임 고치면
     글이 많은 칸이 계속 다시 칠해져 버벅입니다. */
  let pagesDirty = true;

  function pixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const longest = Math.max(layout.W, layout.H);
    const cap = layout.mobile ? 1.1 : longest > 1600 ? 1 : 1.2;
    return Math.min(dpr, cap);
  }

  function computeLayout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const mobile = mq.matches;
    const probe = hosts[0];
    const navH = probe ? readPx(probe, "--nav-h", 76) : 76;
    const dockH = probe ? readPx(probe, "--dock-h", 84) : 84;
    const hudW = mobile ? 0 : probe ? readPx(probe, "--hud-w", 360) : 360;
    /* 읽는 장 아래에 종이 가장자리가 겹쳐 보일 선반입니다. */
    const shelf = mobile ? 36 : 78;
    const panelRight = 22 + 312;
    const freeLeft = panelRight + 20;
    const freeRight = W - 20;
    const freeW = Math.max(420, freeRight - freeLeft);
    const side = mobile ? 14 : 40;
    const pw = Math.round(
      mobile
        ? Math.min(Math.max(240, W * 0.84), 400)
        : Math.min(Math.max(480, freeW - side * 2), 1040)
    );
    const topLimit = navH + (mobile ? 8 : 18);
    const bottomLimit = H - dockH - shelf;
    const ph = Math.round(
      Math.max(280, Math.min(bottomLimit - topLimit, mobile ? 640 : 1040))
    );
    const readScreenY = topLimit + (bottomLimit - topLimit - ph) / 2 + ph / 2;
    const cx = Math.round(mobile ? 0 : (freeLeft + freeRight) / 2 - W / 2);
    const cy = Math.round(H / 2 - readScreenY);
    const peekX = mobile ? 14 : 54;
    const peekY = mobile ? 9 : 13;
    const baseDrop = mobile ? 18 : 28;
    hosts.forEach(p => {
      p.style.width = pw + "px";
      p.style.height = ph + "px";
      p.style.setProperty("--pw", pw + "px");
      p.style.setProperty("--ph", ph + "px");
    });
    return { W, H, mobile, pw, ph, cx, cy, peekX, peekY, baseDrop, navH, dockH, hudW };
  }

  const camera = new THREE.PerspectiveCamera(FOV, layout.W / layout.H, 1, 20000);
  const glScene = new THREE.Scene();
  const cssScene = new THREE.Scene();

  function placeCamera() {
    camera.aspect = layout.W / Math.max(1, layout.H);
    camera.position.set(0, 0, layout.H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  placeCamera();

  let glRenderer: import("three").WebGLRenderer | null = null;
  let skyMat: import("three").ShaderMaterial | null = null;
  let particleMat: import("three").ShaderMaterial | null = null;
  const glowTextures: import("three").Texture[] = [];
  const orbs: {
    sprite: import("three").Sprite;
    radius: number;
    base: number;
    baseR: number;
    y: number;
    z: number;
    speed: number;
    phase: number;
  }[] = [];

  function makeGlow(inner: string, mid: string) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    if (!g) return null;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.35, mid);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    glowTextures.push(tex);
    return tex;
  }

  if (background) {
    try {
      glRenderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "high-performance"
      });
      glRenderer.setClearColor(0x000000, 0);
      glRenderer.setPixelRatio(pixelRatio());
      glRenderer.setSize(layout.W, layout.H);
      background.appendChild(glRenderer.domElement);
      buildSky();
    } catch (e) {
      console.warn("[lumen] WebGL 배경을 켜지 못했습니다. 페이지만 보여 줍니다.", e);
      glRenderer = null;
    }
  }

  function syncSky() {
    if (!glRenderer || !skyMat) return;
    const canvas = glRenderer.domElement;
    skyMat.uniforms.uRes.value.set(canvas.width, canvas.height);
    const phone = layout.mobile ? 1 : 0;
    skyMat.uniforms.uWater.value = layout.mobile ? 0.28 : 0.34;
    skyMat.uniforms.uPhone.value = phone;
    skyMat.uniforms.uMoon.value.set(layout.mobile ? 0.5 : 0.58, layout.mobile ? 0.968 : 0.945);
    orbs.forEach(orb => {
      const s = layout.mobile ? 0.4 : 1;
      orb.sprite.scale.set(orb.base * s, orb.base * s, 1);
      orb.radius = orb.baseR * s;
    });
  }

  function buildSky() {
    if (!glRenderer) return;
    skyMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: reduced ? 0 : 1 },
        uTurn: { value: 0 },
        uWater: { value: layout.mobile ? 0.28 : 0.34 },
        uRes: { value: new THREE.Vector2(layout.W, layout.H) },
        uMouse: { value: new THREE.Vector2() },
        uMoon: { value: new THREE.Vector2(layout.mobile ? 0.5 : 0.58, layout.mobile ? 0.968 : 0.945) },
        uPhone: { value: layout.mobile ? 1 : 0 },
        uHour: { value: 0 },
        uDay: { value: 0 },
        uNight: { value: 1 },
        uGlow: { value: 0 },
        uMorning: { value: 0 }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    sky.name = "sky";
    glScene.add(sky);
    syncSky();

    const washes = [
      { color: "rgba(240,215,162,0.95)", mid: "rgba(240,215,162,0.18)", r: 980, y: 180, z: -1700, speed: 0.07, phase: 0.4, size: 640 },
      { color: "rgba(150,230,214,0.9)", mid: "rgba(150,230,214,0.16)", r: 1280, y: 460, z: -2300, speed: -0.045, phase: 2.1, size: 820 },
      { color: "rgba(230,170,200,0.9)", mid: "rgba(230,170,200,0.14)", r: 860, y: -40, z: -1500, speed: 0.055, phase: 4.0, size: 520 }
    ];
    washes.forEach(w => {
      const map = makeGlow(w.color, w.mid);
      if (!map) return;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.55
        })
      );
      sprite.scale.set(w.size, w.size, 1);
      sprite.position.set(0, w.y, w.z);
      glScene.add(sprite);
      orbs.push({ sprite, radius: w.r, base: w.size, baseR: w.r, y: w.y, z: w.z, speed: w.speed, phase: w.phase });
    });
    syncSky();

    const COUNT = layout.mobile ? 48 : 110;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const palette = [
      new THREE.Color("#f3e2b0"),
      new THREE.Color("#f0c6d4"),
      new THREE.Color("#b7efe4"),
      new THREE.Color("#f7f4ee")
    ];
    for (let i = 0; i < COUNT; i++) {
      const nearMoon = i < COUNT * 0.55;
      pos[i * 3] = nearMoon ? 80 + Math.random() * 760 : (Math.random() - 0.5) * 2200;
      pos[i * 3 + 1] = nearMoon ? 40 + Math.random() * 620 : (Math.random() - 0.35) * 1400;
      pos[i * 3 + 2] = nearMoon ? -180 - Math.random() * 1100 : -Math.random() * 2600 - 80;
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      phase[i] = Math.random() * Math.PI * 2;
      size[i] = 8 + Math.random() * 22;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pg.setAttribute("pcolor", new THREE.BufferAttribute(col, 3));
    pg.setAttribute("pphase", new THREE.BufferAttribute(phase, 1));
    pg.setAttribute("psize", new THREE.BufferAttribute(size, 1));
    particleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: layout.H },
        uMotion: { value: reduced ? 0 : 1 },
        uNight: { value: 1 }
      },
      vertexShader: `
        attribute vec3 pcolor;
        attribute float pphase;
        attribute float psize;
        uniform float uTime;
        uniform float uScale;
        uniform float uMotion;
        uniform float uNight;
        varying vec3 vC;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * uMotion;
          p.x += sin(t * 0.23 + pphase) * 36.0;
          p.y += sin(t * 0.17 + pphase * 1.7) * 22.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = psize * (uScale * 0.42 / max(80.0, -mv.z));
          gl_Position = projectionMatrix * mv;
          vC = pcolor;
          vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 1.5 + pphase * 5.0))) * uNight;
        }
      `,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          a = a * a * vA;
          gl_FragColor = vec4(vC * a, a);
        }
      `
    });
    glScene.add(new THREE.Points(pg, particleMat));
  }

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(layout.W, layout.H);
  cssRenderer.domElement.classList.add("cy-css3d");
  mount?.appendChild(cssRenderer.domElement);

  const objects = hosts.map(el => {
    const obj = new CSS3DObject(el);
    cssScene.add(obj);
    return obj;
  });

  function onResize() {
    layout = computeLayout();
    placeCamera();
    glRenderer?.setPixelRatio(pixelRatio());
    glRenderer?.setSize(layout.W, layout.H);
    cssRenderer.setSize(layout.W, layout.H);
    pagesDirty = true;
    if (particleMat) particleMat.uniforms.uScale.value = layout.H;
    syncSky();
  }

  /* 고른 칸이 읽는 자리(0)에 오게 합니다. 나머지는 아래 뭉치로 내려갑니다. */
  function aimAt(i: number, instant = false) {
    rotTarget = -i * STEP;
    if (instant) rot = rotTarget;
  }
  aimAt(getActive(), true);

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    const target = getActive();
    if (target !== settledOn) {
      fromIndex = settledOn;
      settledOn = target;
      aimAt(target);
    }

    const ease = 1 - Math.pow(reduced ? 1e-8 : 0.006, dt);
    rot += (rotTarget - rot) * ease;
    if (Math.abs(rotTarget - rot) < 0.02) rot = rotTarget;
    const settled = rot === rotTarget;
    const turning = Math.min(1, Math.abs(rotTarget - rot) * 2.2);

    if (!settled) pagesDirty = true;
    if (pagesDirty) {
      const { cx, cy, peekX, peekY, baseDrop, pw, mobile } = layout;
      /* +y 가 위, 카메라는 +z 입니다. 고른 장은 뭉치에서 옆으로 빠진 뒤
         위로 올라옵니다. 내려놓는 장은 그 반대입니다.
         돌리지 않습니다. 돌리면 뭉치 모서리가 읽는 글 앞으로 나옵니다. */
      const smooth = (edge0: number, edge1: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };
      const reach = Math.min(pw * 0.56, mobile ? pw * 0.46 : 360);
      objects.forEach((o, i) => {
        const phi = i * STEP + rot;
        const slot = phi / STEP;
        const ax = Math.abs(slot);
        const dir = slot < 0 ? -1 : 1;
        const traveling = i === target || i === fromIndex;
        const u = traveling ? Math.min(1, ax) : 1;
        /* u=0 은 읽는 자리, u=1 은 뭉치. 빠지는 폭은 중간에서만 큽니다. */
        const out = traveling ? smooth(0.02, 0.28, u) * (1 - smooth(0.42, 0.92, u)) : 0;
        const into = traveling ? smooth(0.55, 1, u) : 1;
        const drop = traveling ? smooth(0.02, 0.3, u) : 1;
        const depth = Math.min(Math.max(ax, traveling ? 0 : 0.85), 3);
        const pileOffX = dir * peekX * Math.min(depth, 2.4);
        const pileOffY = -(baseDrop + peekY * depth);
        const pileZ = -(26 + 18 * depth);
        /* 손에 들린 동안은 뭉치보다 더 내려가, 다시 올릴 때 높이 차이가 보입니다. */
        const handDrop = mobile ? 70 : 150;
        let x = cx + dir * reach * out + pileOffX * into;
        let y = cy - handDrop * out + pileOffY * into;
        let z = pileZ * Math.max(drop, into);
        if (i === target) z += 56 * smooth(0.2, 0.55, out);
        const front = i === target && settled;
        if (front) {
          x = Math.round(cx);
          y = Math.round(cy);
          z = 0;
        }
        o.position.set(x, y, z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(1);
        const fade = depth < 3.2 ? 1 : Math.max(0, 1 - (depth - 3.2) / 0.45);
        const shown = fade > 0.04;
        o.visible = shown;
        o.element.style.opacity = shown ? (fade === 1 ? "1" : fade.toFixed(2)) : "0";
        const ink = 1 - smooth(0.06, 0.32, u);
        o.element.style.setProperty("--ink", ink < 0.02 ? "0" : ink > 0.98 ? "1" : ink.toFixed(2));
        /* 페이지 겹침은 8 안입니다. 서랍과 탭은 그보다 위(z-index 30)에 있습니다. */
        const zi = front || (i === target && out > 0.12) ? 8 : Math.max(1, 5 - Math.round(depth));
        o.element.style.zIndex = String(zi);
        const side = i === target ? "mid" : phi > 0.08 ? "right" : "left";
        if (o.element.dataset.side !== side) o.element.dataset.side = side;
        const edge = ax > 1.15 ? "far" : "near";
        if (o.element.dataset.edge !== edge) o.element.dataset.edge = edge;
      });
      cssRenderer.render(cssScene, camera);
      if (settled) pagesDirty = false;
    }

    if (glRenderer && skyMat) {
      const clock = skyClock();
      skyMat.uniforms.uTime.value = elapsed;
      skyMat.uniforms.uTurn.value = turning;
      skyMat.uniforms.uMouse.value.set(mouseX, -mouseY);
      skyMat.uniforms.uHour.value = clock.hour;
      skyMat.uniforms.uDay.value = clock.day;
      skyMat.uniforms.uNight.value = clock.night;
      skyMat.uniforms.uGlow.value = clock.glow;
      skyMat.uniforms.uMorning.value = clock.morning;
      if (document.body.dataset.lumenSky !== clock.phase) {
        document.body.dataset.lumenSky = clock.phase;
      }
      if (particleMat) {
        particleMat.uniforms.uTime.value = elapsed;
        particleMat.uniforms.uNight.value = clock.night;
      }
      orbs.forEach(orb => {
        const mat = orb.sprite.material as import("three").SpriteMaterial;
        mat.opacity = 0.55 * clock.night;
        const a = (reduced ? 0 : elapsed * orb.speed) + orb.phase + mouseX * 0.25;
        orb.sprite.position.set(
          Math.cos(a) * orb.radius * 0.55 + mouseX * 90,
          orb.y + Math.sin((reduced ? 0 : elapsed) * 0.2 + orb.phase) * 26 - mouseY * 50,
          orb.z
        );
      });
      glRenderer.render(glScene, camera);
    }
  }
  frame = requestAnimationFrame(tick);

  const onPointerMove = (e: PointerEvent) => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isLocked()) return;
    const el = document.activeElement;
    const tag = el?.tagName ?? "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    if (el instanceof HTMLElement && el.isContentEditable) return;
    if (e.key === "ArrowRight") select((getActive() + 1) % N);
    else if (e.key === "ArrowLeft") select((getActive() - 1 + N) % N);
  };

  let tx0: number | null = null;
  let ty0: number | null = null;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    tx0 = t.clientX;
    ty0 = t.clientY;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (tx0 === null || ty0 === null || isLocked()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tx0;
    const dy = t.clientY - ty0;
    tx0 = null;
    ty0 = null;
    if (Math.abs(dx) <= 70 || Math.abs(dx) <= Math.abs(dy) * 1.6) return;
    if (e.target instanceof Element && e.target.closest(".cy-left-panel, .cy-tabs")) return;
    select((getActive() + (dx < 0 ? 1 : -1) + N) % N);
  };

  const onBackgroundClick = (e: MouseEvent) => {
    if (isLocked()) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (
      t.closest(
        ".cy-right-content.is-active, .cy-left-panel, .cy-tabs, .cy-right-header, a, button, input, textarea, select, label, summary, details"
      )
    ) {
      return;
    }
    const i = getActive();
    const forward = e.clientX >= window.innerWidth / 2;
    select(((i + (forward ? 1 : -1)) % N + N) % N);
  };

  window.addEventListener("click", onBackgroundClick);
  window.addEventListener("resize", onResize);
  mq.addEventListener("change", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  function dispose() {
    cancelAnimationFrame(frame);
    delete document.body.dataset.lumenSky;
    window.removeEventListener("click", onBackgroundClick);
    window.removeEventListener("resize", onResize);
    mq.removeEventListener("change", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchend", onTouchEnd);

    objects.forEach(o => cssScene.remove(o));
    cssRenderer.domElement.remove();

    glScene.traverse(obj => {
      const mesh = obj as import("three").Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose?.();
    });
    glowTextures.forEach(tex => tex.dispose());
    glScene.clear();
    if (glRenderer) {
      glRenderer.domElement.remove();
      glRenderer.dispose();
      glRenderer.forceContextLoss();
    }
  }

  return { dispose };
}
