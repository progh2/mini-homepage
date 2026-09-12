"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/* 네온 스킨의 3D 무대입니다.

   두 겹으로 되어 있습니다.

     WebGL   : 격자 바닥, 지평선, 공전 고리, 입자, 먼 도형 (cy-background-pattern 안)
     CSS3D   : 탭 내용이 담긴 진짜 DOM 창 네 개가 원을 그리며 돕니다

   CSS3DRenderer 는 넘겨받은 DOM 노드를 자기 밑으로 옮기고 transform 을
   직접 씁니다. React 가 만든 노드를 넘기면 둘이 같은 노드를 두고 다툽니다.
   그래서 빈 div 를 여기서 만들어 렌더러에게 주고, 그 안으로 탭 내용을
   createPortal 로 보냅니다. 바깥 껍데기는 렌더러 것, 안쪽 내용은 React 것.

   three 와 CSS3DRenderer 는 여기서만 동적으로 불러옵니다. 클래식 스킨만
   보는 사람의 첫 화면에는 들어가지 않습니다.

   모양과 수치는 docs/design/neon-demo.html 에서 그대로 옮겼습니다. */

const FOV = 36;
/* 옆으로 밀린 창이 보는 사람 쪽으로 얼마나 돌아설지입니다. 1 이면 늘
   정면을 보고, 0 이면 원의 접선을 향합니다. */
const K_YAW = 0.42;

type Stage = {
  hosts: HTMLDivElement[];
  dispose: () => void;
};

type Layout = {
  W: number;
  H: number;
  mobile: boolean;
  pw: number;
  ph: number;
  R: number;
  Rz: number;
  cx: number;
  cy: number;
  floorY: number;
};

function wrapAngle(a: number) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export default function NeonStage({
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
  /* WebGL 캔버스를 담을 자리입니다. LinkTree 의 .cy-background-pattern 입니다. */
  backgroundRef: RefObject<HTMLDivElement | null>;
  /* 인트로가 떠 있는 동안에는 방향키와 스와이프를 받지 않습니다. */
  locked: boolean;
  /* WebGL 이나 three 를 못 쓰면 알립니다. 루트에 no-3d 가 붙어 2D 로 보입니다. */
  onFallback: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<HTMLDivElement[]>([]);

  /* 애니메이션 루프가 매번 최신 값을 봐야 합니다. 프레임마다 루프를
     다시 걸 수는 없으므로 ref 로 건네줍니다. */
  const activeRef = useRef(active);
  const lockedRef = useRef(locked);
  const selectRef = useRef(onSelect);
  useEffect(() => {
    activeRef.current = active;
    lockedRef.current = locked;
    selectRef.current = onSelect;
  }, [active, locked, onSelect]);

  /* 1단계: 창 껍데기를 만들어 둡니다. three 가 오기 전에도, 끝내 못
     오더라도 이 노드들은 있어야 내용이 보입니다. */
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

  /* 2단계: 지금 어느 창이 앞인지를 껍데기에 적습니다. 껍데기는 React 가
     아니라 우리가 만든 노드라 여기서 직접 씁니다. */
  useEffect(() => {
    hosts.forEach((el, i) => {
      const on = tabs[i] === active;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-hidden", on ? "false" : "true");
      el.tabIndex = on ? 0 : -1;
      if (!on) el.scrollTop = 0;
    });
  }, [hosts, tabs, active]);

  /* 3단계: three 를 불러 무대를 세웁니다. */
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
        /* WebGL 이 꺼져 있거나 three 를 못 받아오는 환경이 있습니다.
           조용히 실패하면 빈 화면만 남으므로 2D 로 내려갑니다. */
        console.warn("[neon] 3D 무대를 세우지 못해 2D 로 보여 줍니다.", e);
        if (!cancelled) onFallback();
      }
    })();

    return () => {
      cancelled = true;
      stage?.dispose();
    };
    /* onFallback 은 한 번 알리면 끝이라 의존성에서 뺍니다. 넣으면
       부모가 다시 그릴 때마다 무대를 헐고 다시 세웁니다. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts, tabs, backgroundRef]);

  /* 옆 창을 누르면 앞으로 옵니다. 누르기(capture)에서 잡아야 그 안의
     링크가 함께 눌리지 않습니다. */
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
    <div ref={mountRef} className="cy-neon-mount">
      {hosts.map((host, i) =>
        createPortal(
          <>
            {/* 옆으로 밀린 창 위에 크게 뜨는 이름표입니다. 앞 창에서는
                투명합니다. inert 밖에 두어야 눌러서 앞으로 부를 수 있습니다. */}
            <div className="cy-panel-label" aria-hidden="true">
              <span>{labels[tabs[i]]}</span>
            </div>
            {/* display: contents 라 레이아웃에는 없는 것과 같습니다.
                내용에만 inert 를 걸어 옆 창의 링크와 입력칸이 탭 이동과
                스크린리더에 잡히지 않게 합니다. */}
            <div className="cy-panel-body" inert={tabs[i] !== active}>
              {renderPanel(tabs[i])}
            </div>
          </>,
          host,
          tabs[i]
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* three.js 무대                                                       */
/* ------------------------------------------------------------------ */

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
  const STEP = (Math.PI * 2) / N;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mq = window.matchMedia("(max-width: 900px)");

  let layout = computeLayout();
  let rot = 0;
  let rotTarget = 0;
  let settledOn = getActive();
  let mouseX = 0;
  let mouseY = 0;
  let frame = 0;
  let last = performance.now();
  let elapsed = 0;

  function computeLayout(): Layout {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const mobile = mq.matches;
    /* --nav-h 와 --hud-w 는 네온 CSS 가 정합니다. 여기서 다시 적으면
       두 곳이 갈라지므로 실제 계산된 값을 읽습니다. */
    const cs = hosts[0] ? getComputedStyle(hosts[0]) : null;
    const navH = parseFloat(cs?.getPropertyValue("--nav-h") || "") || 84;
    const hudW = mobile ? 0 : parseFloat(cs?.getPropertyValue("--hud-w") || "") || 380;
    const regionW = W - hudW;
    const regionH = H - navH;
    const pw = Math.round(
      mobile ? Math.min(W * 0.9, 620) : Math.max(420, Math.min(regionW * 0.64, 880))
    );
    const ph = Math.round(Math.max(380, Math.min(regionH * (mobile ? 0.84 : 0.8), 1000)));
    /* 원의 반지름입니다. 깊이(Rz)를 조금 줄여 납작한 타원으로 돕니다.
       정원으로 돌리면 뒤쪽 창이 너무 멀어져 작아 보입니다. */
    const R = mobile ? pw * 1.02 : pw * 0.85;
    const Rz = mobile ? pw * 0.9 : pw * 0.8;
    const cx = hudW / 2;
    const cy = -(navH / 2) + (mobile ? 0 : -6);
    const floorY = cy - ph / 2 - 70;
    hosts.forEach(p => {
      p.style.setProperty("--pw", pw + "px");
      p.style.setProperty("--ph", ph + "px");
    });
    return { W, H, mobile, pw, ph, R, Rz, cx, cy, floorY };
  }

  const camera = new THREE.PerspectiveCamera(FOV, layout.W / layout.H, 1, 40000);
  const glScene = new THREE.Scene();
  const cssScene = new THREE.Scene();

  function placeCamera() {
    camera.aspect = layout.W / layout.H;
    /* 이 거리에 두면 z = 0 평면에서 월드 1단위가 화면 1픽셀이 됩니다.
       CSS3D 창의 픽셀 크기와 WebGL 좌표가 같은 자로 재집니다. */
    camera.position.set(0, 0, layout.H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  placeCamera();

  /* ---------------- WebGL 배경 ---------------- */

  let glRenderer: import("three").WebGLRenderer | null = null;
  let gridMat: import("three").ShaderMaterial | null = null;
  let particleMat: import("three").ShaderMaterial | null = null;
  let orbitGroup: import("three").Group | null = null;
  let orbitSpin: import("three").Group | null = null;
  let floorGlow: import("three").Mesh<
    import("three").BufferGeometry,
    import("three").MeshBasicMaterial
  > | null = null;
  const markers: import("three").LineSegments<
    import("three").BufferGeometry,
    import("three").LineBasicMaterial
  >[] = [];
  const shapes: import("three").LineSegments[] = [];
  const glowTextures: import("three").Texture[] = [];

  function makeGlowTexture(inner: string, outer: string) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.35, outer);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    glowTextures.push(t);
    return t;
  }

  if (background) {
    try {
      glRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      glRenderer.setSize(layout.W, layout.H);
      glRenderer.setClearColor(0x03040d, 0);
      background.appendChild(glRenderer.domElement);
      buildBackground();
    } catch (e) {
      /* 배경만 없을 뿐 창은 돕니다. 통째로 2D 로 내려갈 일은 아닙니다. */
      console.warn("[neon] WebGL 배경을 켜지 못했습니다. 창만 보여 줍니다.", e);
      glRenderer = null;
    }
  }

  function buildBackground() {
    const { R, cx, floorY, Rz } = layout;
    glScene.fog = new THREE.FogExp2(0x03040d, 0.00011);

    /* 보는 사람 쪽으로 흘러오는 격자 바닥입니다. fwidth 로 선 굵기를
       화면 기준으로 잡아 멀리서도 얇아지지 않고 고르게 보입니다. */
    gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: reduced ? 0 : 120 },
        uCell: { value: 110 },
        uC1: { value: new THREE.Color(0x2bf0ff) },
        uC2: { value: new THREE.Color(0x9b72ff) },
        uCenter: { value: new THREE.Vector2(cx, -900) }
      },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uSpeed, uCell; uniform vec3 uC1, uC2; uniform vec2 uCenter; varying vec3 vW;
        float gl(vec2 p, float cell, float w){ vec2 q = p / cell; vec2 g = abs(fract(q - 0.5) - 0.5) / (fwidth(q) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
        void main(){
          vec2 p = vW.xz; p.y += uTime * uSpeed;
          float minor = gl(p, uCell, 1.0);
          float major = gl(p, uCell * 5.0, 1.6);
          float d = length(vW.xz - uCenter);
          float fade = exp(-d * 0.00024);
          vec3 col = uC1 * minor * 0.55 + uC2 * major * 0.9;
          float a = (minor * 0.45 + major * 0.9) * fade;
          gl_FragColor = vec4(col * a, a);
        }`
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1), gridMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, -6000);
    floor.name = "floor";
    glScene.add(floor);

    const hz = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 5200),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; void main(){ float y = vUv.y; float band = exp(-pow((y - 0.18) * 6.0, 2.0)); vec3 c = mix(vec3(1.0,0.17,0.84), vec3(0.54,0.36,1.0), smoothstep(0.1,0.5,y)); gl_FragColor = vec4(c * band * 0.32, band * 0.32); }`
      })
    );
    hz.position.set(0, floorY + 900, -16000);
    hz.name = "horizon";
    glScene.add(hz);

    /* 창들이 도는 자리 아래 깔리는 고리입니다. */
    orbitGroup = new THREE.Group();
    orbitGroup.position.set(cx, floorY + 2, -Rz);
    orbitGroup.userData.baseR = R;
    orbitGroup.scale.set(1, 1, Rz / R);
    glScene.add(orbitGroup);
    orbitSpin = new THREE.Group();
    orbitGroup.add(orbitSpin);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(R - 2.5, R + 2.5, 160),
      new THREE.MeshBasicMaterial({
        color: 0x2bf0ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = "ring";
    orbitSpin.add(ring);

    /* 바깥 점선 고리는 반대로 아주 천천히 돕니다. */
    const dashPts: import("three").Vector3[] = [];
    const segs = 96;
    const R2 = R * 1.12;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 0.45) / segs) * Math.PI * 2;
      dashPts.push(
        new THREE.Vector3(Math.cos(a0) * R2, 0, Math.sin(a0) * R2),
        new THREE.Vector3(Math.cos(a1) * R2, 0, Math.sin(a1) * R2)
      );
    }
    const dash = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(dashPts),
      new THREE.LineBasicMaterial({
        color: 0xff2bd6,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending
      })
    );
    dash.name = "dash";
    orbitSpin.add(dash);

    const ring3 = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.55 - 1, R * 0.55 + 1, 120),
      new THREE.MeshBasicMaterial({
        color: 0x9b72ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    ring3.rotation.x = -Math.PI / 2;
    orbitSpin.add(ring3);

    /* 창마다 하나씩, 고리 위를 함께 도는 표식입니다. */
    for (let i = 0; i < N; i++) {
      const m = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.OctahedronGeometry(16)),
        new THREE.LineBasicMaterial({
          color: 0x2bf0ff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending
        })
      );
      glScene.add(m);
      markers.push(m);
    }

    floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture("rgba(43,240,255,.9)", "rgba(43,240,255,.22)"),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    glScene.add(floorGlow);

    /* 떠오르는 먼지입니다. 위치 계산을 셰이더에서 하므로 매 프레임
       자바스크립트가 건드릴 것이 uTime 하나뿐입니다. */
    const COUNT = layout.mobile ? 700 : 1600;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const spd = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const palette = [
      new THREE.Color(0x2bf0ff),
      new THREE.Color(0xff2bd6),
      new THREE.Color(0x9b72ff),
      new THREE.Color(0xd8f6ff)
    ];
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9000;
      pos[i * 3 + 1] = Math.random() * 3400;
      pos[i * 3 + 2] = -Math.random() * 9000 + 600;
      const c = palette[(Math.random() * palette.length) | 0];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      spd[i] = 18 + Math.random() * 60;
      size[i] = 3 + Math.random() * 7;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    pg.setAttribute("pcolor", new THREE.BufferAttribute(col, 3));
    pg.setAttribute("speed", new THREE.BufferAttribute(spd, 1));
    pg.setAttribute("psize", new THREE.BufferAttribute(size, 1));
    particleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFloor: { value: floorY },
        uScale: { value: layout.H },
        uMove: { value: reduced ? 0 : 1 }
      },
      vertexShader: `
        attribute vec3 pcolor; attribute float speed; attribute float psize; uniform float uTime, uFloor, uScale, uMove; varying vec3 vC; varying float vA;
        void main(){
          vec3 p = position;
          p.y = uFloor + mod(p.y + uTime * speed * uMove, 3400.0);
          p.x += sin(uTime * 0.3 + position.z * 0.01) * 30.0 * uMove;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = psize * (uScale * 0.9 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vC = pcolor; vA = smoothstep(0.0, 300.0, p.y - uFloor) * (1.0 - smoothstep(2600.0, 3400.0, p.y - uFloor));
        }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = length(d); float a = smoothstep(.5, 0.0, r); a *= a; gl_FragColor = vec4(vC * a * vA, a * vA); }`
    });
    const pts = new THREE.Points(pg, particleMat);
    pts.name = "particles";
    glScene.add(pts);

    /* 멀리 떠 있는 뼈대 도형입니다. 마우스를 따라 아주 조금 움직여
       깊이를 만듭니다. */
    const defs = [
      { g: new THREE.IcosahedronGeometry(520, 1), p: [-3600, 700, -7000], c: 0x9b72ff },
      { g: new THREE.OctahedronGeometry(640, 0), p: [4200, 1100, -8600], c: 0x2bf0ff },
      { g: new THREE.TorusKnotGeometry(360, 70, 90, 8, 2, 3), p: [900, 2300, -11000], c: 0xff2bd6 }
    ];
    defs.forEach((d, i) => {
      const m = new THREE.LineSegments(
        new THREE.EdgesGeometry(d.g, 1),
        new THREE.LineBasicMaterial({
          color: d.c,
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending
        })
      );
      m.position.set(d.p[0], d.p[1], d.p[2]);
      m.userData.spin = 0.05 + i * 0.03;
      m.userData.base = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
      glScene.add(m);
      shapes.push(m);
      /* EdgesGeometry 가 복사해 갔으므로 원본은 바로 버립니다. */
      d.g.dispose();
    });
  }

  /* ---------------- CSS3D 창 ---------------- */

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(layout.W, layout.H);
  cssRenderer.domElement.classList.add("cy-css3d");
  mount?.appendChild(cssRenderer.domElement);

  const objects = hosts.map(el => {
    const obj = new CSS3DObject(el);
    cssScene.add(obj);
    return obj;
  });

  /* ---------------- 움직임 ---------------- */

  function onResize() {
    layout = computeLayout();
    placeCamera();
    glRenderer?.setSize(layout.W, layout.H);
    cssRenderer.setSize(layout.W, layout.H);

    const { R, Rz, cx, floorY } = layout;
    const floor = glScene.getObjectByName("floor");
    if (floor) floor.position.y = floorY;
    const hz = glScene.getObjectByName("horizon");
    if (hz) hz.position.y = floorY + 900;
    if (particleMat) {
      particleMat.uniforms.uFloor.value = floorY;
      particleMat.uniforms.uScale.value = layout.H;
    }
    gridMat?.uniforms.uCenter.value.set(cx, -900);
    if (orbitGroup) {
      orbitGroup.position.set(cx, floorY + 2, -Rz);
      const base = orbitGroup.userData.baseR as number;
      orbitGroup.scale.set(R / base, 1, Rz / base);
    }
  }

  /* 고른 창이 바뀌면 가장 가까운 쪽으로 돌립니다. 각도를 그냥 빼면
     세 칸 거꾸로 도는 일이 생깁니다. */
  function aimAt(i: number, instant = false) {
    rotTarget += wrapAngle(-i * STEP - rotTarget);
    if (instant) rot = rotTarget;
  }
  aimAt(getActive(), true);

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    const target = getActive();
    if (target !== settledOn) {
      settledOn = target;
      aimAt(target);
    }

    const { R, Rz, cx, cy, floorY } = layout;

    /* 프레임이 몇 번 오든 같은 시간에 같은 만큼 따라붙습니다.
       rot += (target - rot) * 0.1 처럼 쓰면 120Hz 화면에서 두 배 빨라집니다. */
    const ease = 1 - Math.pow(reduced ? 1e-9 : 0.0025, dt);
    rot += (rotTarget - rot) * ease;
    if (Math.abs(rotTarget - rot) < 1e-4) rot = rotTarget;
    const settled = rot === rotTarget;

    objects.forEach((o, i) => {
      const phi = wrapAngle(i * STEP + rot);
      const f = (Math.cos(phi) + 1) / 2; // 1 이면 정면, 0 이면 뒤
      const isFront = i === target && settled;
      const bob = isFront ? 0 : Math.sin(elapsed * 1.1 + i * 1.7) * 10;
      o.position.set(cx + R * Math.sin(phi), cy + bob, -Rz + Rz * Math.cos(phi));
      o.rotation.y = phi * K_YAW;
      /* 앞에 선 창은 좌표를 정수로 맞추고 회전을 0 으로 둡니다.
         소수점이 남으면 글자가 흐리게 번집니다. */
      if (isFront) {
        o.position.x = Math.round(o.position.x);
        o.position.y = Math.round(o.position.y);
        o.position.z = 0;
        o.rotation.y = 0;
      }
      o.element.style.opacity = (0.1 + 0.9 * Math.pow(f, 0.85)).toFixed(3);
      o.element.style.zIndex = String(Math.round(f * 100));
      o.visible = f > 0.02;

      const mk = markers[i];
      if (mk) {
        mk.position.set(
          cx + R * Math.sin(phi),
          floorY + 34 + Math.sin(elapsed * 2 + i) * 6,
          -Rz + Rz * Math.cos(phi)
        );
        mk.rotation.y += dt * (i === target ? 2.2 : 0.6);
        mk.material.color.setHex(i === target ? 0xff2bd6 : 0x2bf0ff);
        mk.scale.setScalar(i === target ? 1.5 : 1);
      }
    });

    if (glRenderer) {
      if (gridMat) gridMat.uniforms.uTime.value = elapsed;
      if (particleMat) particleMat.uniforms.uTime.value = elapsed;
      if (orbitSpin) {
        orbitSpin.rotation.y = -rot;
        const dash = orbitSpin.getObjectByName("dash");
        if (dash && !reduced) dash.rotation.y += dt * 0.08;
      }
      if (floorGlow) {
        const w = layout.pw * 1.25;
        floorGlow.scale.set(w, w * 0.45, 1);
        floorGlow.position.set(cx, floorY + 3, 0);
        floorGlow.material.opacity = 0.55 + Math.sin(elapsed * 2.2) * 0.15;
      }
      shapes.forEach(s => {
        if (!reduced) {
          s.rotation.x += dt * (s.userData.spin as number) * 0.6;
          s.rotation.y += dt * (s.userData.spin as number);
        }
        const base = s.userData.base as import("three").Vector3;
        s.position.x = base.x - mouseX * 260;
        s.position.y = base.y + mouseY * 160;
      });
      glRenderer.render(glScene, camera);
    }
    cssRenderer.render(cssScene, camera);
  }
  frame = requestAnimationFrame(tick);

  /* ---------------- 입력 ---------------- */

  const onPointerMove = (e: PointerEvent) => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isLocked()) return;
    const el = document.activeElement;
    const tag = el?.tagName ?? "";
    /* 글을 쓰는 중이면 방향키는 글자 사이를 오가는 것입니다. */
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
    /* 가로로 확실히 그었을 때만 넘깁니다. 세로 스크롤과 헷갈리면
       글을 읽다가 화면이 돌아가 버립니다. */
    if (Math.abs(dx) <= 70 || Math.abs(dx) <= Math.abs(dy) * 1.6) return;
    if (e.target instanceof Element && e.target.closest(".cy-left-panel")) return;
    select((getActive() + (dx < 0 ? 1 : -1) + N) % N);
  };

  window.addEventListener("resize", onResize);
  mq.addEventListener("change", onResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  /* ---------------- 정리 ---------------- */

  function dispose() {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", onResize);
    mq.removeEventListener("change", onResize);
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchend", onTouchEnd);

    /* 창은 React 것입니다. cssScene 에서만 떼고 노드는 그대로 둡니다.
       CSS3DObject 의 removed 처리가 노드를 지우지 않도록 먼저 비웁니다. */
    objects.forEach(o => cssScene.remove(o));
    cssRenderer.domElement.remove();

    /* GPU 는 참조를 세지 않습니다. 안 버리면 스킨을 오갈 때마다 쌓입니다. */
    glScene.traverse(obj => {
      const mesh = obj as import("three").Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose?.();
    });
    glowTextures.forEach(t => t.dispose());
    glScene.clear();
    if (glRenderer) {
      glRenderer.domElement.remove();
      glRenderer.dispose();
      /* dispose 만으로는 컨텍스트가 바로 풀리지 않습니다. 브라우저가
         동시에 열 수 있는 WebGL 컨텍스트는 열몇 개뿐이라, 여러 번
         오가면 가장 오래된 것부터 강제로 잃습니다. */
      glRenderer.forceContextLoss();
    }
  }

  return { hosts, dispose };
}
