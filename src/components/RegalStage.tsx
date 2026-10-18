"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { asset } from "@/lib/asset";

/* 왕실 스킨의 3D 복도입니다.

   WebGL 은 석회암 벽, 참나무 바닥, 진홍 양탄자, 고딕 아치와 창입니다.
   재질 사진은 Poly Haven CC0 입니다.
   plastered_stone_wall, wood_floor_worn, fabric_leather_02(진홍으로 물들임).
   https://polyhaven.com
   콘텐츠 양옆의 인물 그림은 이 사이트를 위해 만든 성당 벽화입니다.
   실제 인물이나 특정 명화를 베끼지 않았고, 글자는 없습니다.

   CSS3D 는 탭 내용입니다. 칸마다 금테 액자가 있고, 메뉴를 고르면
   그 액자 앞까지 복도를 걸어갑니다. 멈추면 글을 정수 픽셀에 붙여
   한글이 번지지 않게 합니다.

   카메라가 방 안에 있으므로 벽은 DoubleSide 입니다. 상자 면은
   바깥을 보지만 두께가 있어 복도에서는 안쪽 면이 보입니다.
   왼쪽 벽은 rotation.y = +PI/2 라서 평면의 +Z 가 방 안(+X)을 봅니다.

   걷는 높낮이는 시간에 대한 sin 입니다. 방향은 카메라에서만 읽습니다.
   three 는 이 파일이 불릴 때만 따라옵니다. */

/* 시선은 수평이라 5m 천장은 화면에 안 들어옵니다.
   복도 폭과 천장 높이는 이 시야 안에 벽, 창, 아치가 보이게 잡았습니다. */
const BAY = 7.2;
const EYE = 1.55;
const HALL_X = 2.2;
const HALL_Y = 3.28;
const OPEN = 1.72;
const SPRING = 1.86;
const APEX = 3.04;

type Stage = { dispose: () => void };

const STONE_DIFF = asset("/assets/regal/stone_diff.jpg");
const STONE_NOR = asset("/assets/regal/stone_nor.jpg");
const WOOD_DIFF = asset("/assets/regal/wood_diff.jpg");
const WOOD_NOR = asset("/assets/regal/wood_nor.jpg");
const VELVET_DIFF = asset("/assets/regal/velvet_diff.jpg");
const VELVET_NOR = asset("/assets/regal/velvet_nor.jpg");
const FIGURE_LEFT = asset("/assets/regal/figure_left.jpg");
const FIGURE_RIGHT = asset("/assets/regal/figure_right.jpg");

export default function RegalStage({
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
      if (!on) {
        el.scrollTop = 0;
        el.querySelector(".cy-regal-face")?.scrollTo(0, 0);
      }
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
        const { RoomEnvironment } = await import(
          "three/examples/jsm/environments/RoomEnvironment.js"
        );
        if (cancelled) return;

        stage = buildStage({
          THREE,
          CSS3DObject,
          CSS3DRenderer,
          RoomEnvironment,
          hosts,
          mount: mountRef.current,
          background,
          getActive: () => {
            const i = tabs.indexOf(activeRef.current);
            return i < 0 ? 0 : i;
          },
          isLocked: () => lockedRef.current,
          select: i => selectRef.current(tabs[i]),
          onFail: () => {
            if (!cancelled) onFallback();
          }
        });
        if (cancelled) {
          stage.dispose();
          stage = null;
        }
      } catch (e) {
        console.warn("[regal] 3D 무대를 세우지 못해 2D 로 보여 줍니다.", e);
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
    <div ref={mountRef} className="cy-regal-mount">
      {hosts.map((host, i) =>
        createPortal(
          <div className="cy-regal-face">
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

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function buildStage({
  THREE,
  CSS3DObject,
  CSS3DRenderer,
  RoomEnvironment,
  hosts,
  mount,
  background,
  getActive,
  isLocked,
  select,
  onFail
}: {
  THREE: typeof import("three");
  CSS3DObject: typeof import("three/examples/jsm/renderers/CSS3DRenderer.js").CSS3DObject;
  CSS3DRenderer: typeof import("three/examples/jsm/renderers/CSS3DRenderer.js").CSS3DRenderer;
  RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
  hosts: HTMLDivElement[];
  mount: HTMLDivElement | null;
  background: HTMLDivElement | null;
  getActive: () => number;
  isLocked: () => boolean;
  select: (i: number) => void;
  onFail: () => void;
}): Stage {
  const N = hosts.length;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mq = window.matchMedia("(max-width: 900px)");

  type View = {
    W: number;
    H: number;
    mobile: boolean;
    cssW: number;
    cssH: number;
    pageW: number;
    pageH: number;
    fov: number;
    stand: number;
  };

  function computeView(): View {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const mobile = mq.matches;
    /* 데스크톱은 페이지 좌우로 창과 벽이 남게, 휴대폰은 글이 가로를 채우게. */
    if (mobile) {
      const cssW = 330;
      const cssH = 460;
      const pageW = 1.12;
      return {
        W, H, mobile, cssW, cssH, pageW,
        pageH: cssH * (pageW / cssW),
        fov: 60,
        stand: 2.2
      };
    }
    const cssW = 520;
    const cssH = 500;
    const pageW = 1.7;
    return {
      W, H, mobile, cssW, cssH, pageW,
      pageH: cssH * (pageW / cssW),
      fov: 56,
      stand: 3.15
    };
  }

  let view = computeView();
  const station = (i: number) => -i * BAY + view.stand;

  if (!background) throw new Error("regal background missing");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, view.mobile ? 1 : 1.35));
  renderer.setSize(view.W, view.H);
  renderer.setClearColor(0xc9bfb0, 1);
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  background.appendChild(renderer.domElement);

  const glScene = new THREE.Scene();
  glScene.background = new THREE.Color(0xc9bfb0);
  glScene.fog = new THREE.Fog(0xc9bfb0, 16, 46);
  const cssScene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  glScene.environment = envTex;
  envScene.traverse(obj => {
    const mesh = obj as import("three").Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(m => m.dispose());
    else mat?.dispose?.();
  });
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(view.fov, view.W / Math.max(1, view.H), 0.08, 80);
  let camZ = station(getActive());
  camera.position.set(0, EYE, camZ);
  camera.lookAt(0, EYE, camZ - 1);

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();
  const textures: import("three").Texture[] = [envTex];
  const materials: import("three").Material[] = [];
  const geometries: import("three").BufferGeometry[] = [];
  let pending = 8;
  let wantGL = true;
  let alive = true;

  function matStd(color: number, roughness: number, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
    materials.push(m);
    return m;
  }

  const stoneMat = matStd(0xb4ab9b, 0.86);
  const archMat = matStd(0xb4ab9b, 0.86);
  const woodMat = matStd(0x734c2d, 0.55);
  const carpetMat = matStd(0x7f352c, 0.9);
  const curtainMat = matStd(0x6a2430, 0.94);
  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xd4b15e,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1
  });
  materials.push(gold);
  const paperMat = matStd(0xf4ead6, 1, 0);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xc5d2d6,
    emissive: 0x8aa4ae,
    emissiveIntensity: 0.62,
    roughness: 0.16,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  materials.push(glassMat);
  const leadMat = matStd(0x2a241c, 0.38, 0.45);
  const waxMat = new THREE.MeshStandardMaterial({
    color: 0xfff1d2,
    emissive: 0xffd99a,
    emissiveIntensity: 0.85,
    roughness: 0.45
  });
  materials.push(waxMat);

  function tile(src: import("three").Texture, rx: number, ry: number, rot = 0) {
    const t = src.clone();
    t.colorSpace = src.colorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.center.set(0.5, 0.5);
    t.rotation = rot;
    t.anisotropy = anisotropy;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  }

  function loadTex(url: string, colorSpace: import("three").ColorSpace, done: (t: import("three").Texture) => void) {
    loader.load(
      url,
      tex => {
        if (!alive) {
          tex.dispose();
          return;
        }
        tex.colorSpace = colorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = anisotropy;
        tex.needsUpdate = true;
        textures.push(tex);
        done(tex);
        pending -= 1;
        wantGL = true;
      },
      undefined,
      () => {
        if (!alive) return;
        pending -= 1;
        wantGL = true;
      }
    );
  }

  const z0 = view.stand + 4.2;
  const z1 = -(N - 1) * BAY - 2.6;
  const hallLen = z0 - z1;
  const midZ = (z0 + z1) / 2;

  function paintStone(diff: import("three").Texture, nor: import("three").Texture) {
    const rx = hallLen / 2.6;
    const ry = HALL_Y / 2.6;
    stoneMat.map = tile(diff, rx, ry);
    stoneMat.normalMap = tile(nor, rx, ry);
    stoneMat.color.set(0xffffff);
    archMat.map = tile(diff, 2.2, 2.4);
    archMat.normalMap = tile(nor, 2.2, 2.4);
    archMat.color.set(0xffffff);
    stoneMat.needsUpdate = true;
    archMat.needsUpdate = true;
  }

  function paintWood(diff: import("three").Texture, nor: import("three").Texture) {
    /* 바닥은 rotation.x = -PI/2 라서 로컬 +Y 가 세계 −Z(걷는 방향)입니다.
       사진의 널은 이미지 X 로 누워 있으므로 UV 를 90도 돌려 −Z 를 따르게 합니다. */
    const rot = Math.PI / 2;
    const rx = (HALL_X * 2) / 2.1;
    const ry = hallLen / 2.1;
    woodMat.map = tile(diff, rx, ry, rot);
    woodMat.normalMap = tile(nor, rx, ry, rot);
    woodMat.color.set(0xffffff);
    woodMat.needsUpdate = true;
  }

  function paintVelvet(diff: import("three").Texture, nor: import("three").Texture) {
    carpetMat.map = tile(diff, 2.2, hallLen / 1.5);
    carpetMat.normalMap = tile(nor, 2.2, hallLen / 1.5);
    carpetMat.color.set(0xffffff);
    curtainMat.map = tile(diff, 1, 3);
    curtainMat.normalMap = tile(nor, 1, 3);
    curtainMat.color.set(0xd8b0b0);
    carpetMat.needsUpdate = true;
    curtainMat.needsUpdate = true;
  }

  loadTex(STONE_DIFF, THREE.SRGBColorSpace, diff => {
    loadTex(STONE_NOR, THREE.NoColorSpace, nor => paintStone(diff, nor));
  });
  loadTex(WOOD_DIFF, THREE.SRGBColorSpace, diff => {
    loadTex(WOOD_NOR, THREE.NoColorSpace, nor => paintWood(diff, nor));
  });
  loadTex(VELVET_DIFF, THREE.SRGBColorSpace, diff => {
    loadTex(VELVET_NOR, THREE.NoColorSpace, nor => paintVelvet(diff, nor));
  });

  const figLMat = matStd(0xf3e6cf, 0.92);
  const figRMat = matStd(0xf3e6cf, 0.92);
  figLMat.side = THREE.FrontSide;
  figRMat.side = THREE.FrontSide;
  function paintFigure(mat: import("three").MeshStandardMaterial, tex: import("three").Texture) {
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }
  loadTex(FIGURE_LEFT, THREE.SRGBColorSpace, tex => paintFigure(figLMat, tex));
  loadTex(FIGURE_RIGHT, THREE.SRGBColorSpace, tex => paintFigure(figRMat, tex));

  function addMesh(geo: import("three").BufferGeometry, material: import("three").Material) {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    glScene.add(mesh);
    return mesh;
  }

  /* 바닥. rotation.x = -PI/2 이면 평면의 +Z 가 위(+Y)를 봅니다. */
  const floor = addMesh(new THREE.PlaneGeometry(HALL_X * 2 + 0.4, hallLen + 0.4), woodMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);

  const carpet = addMesh(new THREE.PlaneGeometry(1.16, hallLen - 0.6), carpetMat);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.02, midZ);

  const braid = addMesh(new THREE.PlaneGeometry(1.3, hallLen - 0.4), gold);
  braid.rotation.x = -Math.PI / 2;
  braid.position.set(0, 0.012, midZ);

  /* 왼쪽 벽. rotation.y = +PI/2 이면 +Z(정면)가 +X, 즉 방 안을 봅니다.
     오른쪽 벽은 −PI/2 라서 정면이 −X 를 봅니다. */
  const leftWall = addMesh(new THREE.PlaneGeometry(hallLen, HALL_Y), stoneMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-HALL_X, HALL_Y / 2, midZ);
  const rightWall = addMesh(new THREE.PlaneGeometry(hallLen, HALL_Y), stoneMat);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(HALL_X, HALL_Y / 2, midZ);

  const plasterMat = matStd(0xe4d8c4, 0.94);
  const ceiling = addMesh(new THREE.PlaneGeometry(HALL_X * 2, hallLen), plasterMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HALL_Y, midZ);

  const dadoMat = matStd(0x5c3b22, 0.58);
  const dadoH = 0.92;
  const leftDado = addMesh(new THREE.PlaneGeometry(hallLen, dadoH), dadoMat);
  leftDado.rotation.y = Math.PI / 2;
  leftDado.position.set(-HALL_X + 0.025, dadoH / 2, midZ);
  const rightDado = addMesh(new THREE.PlaneGeometry(hallLen, dadoH), dadoMat);
  rightDado.rotation.y = -Math.PI / 2;
  rightDado.position.set(HALL_X - 0.025, dadoH / 2, midZ);
  const railGeo = new THREE.BoxGeometry(0.05, 0.04, hallLen);
  geometries.push(railGeo);
  const leftRail = new THREE.Mesh(railGeo, gold);
  leftRail.position.set(-HALL_X + 0.04, dadoH, midZ);
  glScene.add(leftRail);
  const rightRail = new THREE.Mesh(railGeo, gold);
  rightRail.position.set(HALL_X - 0.04, dadoH, midZ);
  glScene.add(rightRail);

  const endWall = addMesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_Y), stoneMat);
  endWall.position.set(0, HALL_Y / 2, z1);
  const backWall = addMesh(new THREE.PlaneGeometry(HALL_X * 2, HALL_Y), stoneMat);
  backWall.rotation.y = Math.PI;
  backWall.position.set(0, HALL_Y / 2, z0);

  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x4a3024, 0.62);
  glScene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1df, 2.5);
  sun.position.set(2.2, 7.5, 6);
  sun.target.position.set(0, 2, -8);
  glScene.add(sun);
  glScene.add(sun.target);

  function archShape() {
    const a = OPEN / 2;
    const rise = APEX - SPRING;
    /* 스프링 선 위의 두 원이 꼭짓점에서 만납니다. 임포스트에서 접선은 수직입니다.
       cx 는 방향이 아니라 왼쪽 원의 중심입니다. */
    const cx = (rise * rise - a * a) / (2 * a);
    const r = cx + a;
    const ang0 = Math.PI;
    const ang1 = Math.atan2(rise, -cx);
    const shape = new THREE.Shape();
    shape.moveTo(-HALL_X, SPRING);
    shape.lineTo(-a, SPRING);
    const steps = 22;
    for (let i = 1; i <= steps; i++) {
      const ang = ang0 + ((ang1 - ang0) * i) / steps;
      shape.lineTo(cx + r * Math.cos(ang), SPRING + r * Math.sin(ang));
    }
    for (let i = steps - 1; i >= 0; i--) {
      const ang = ang0 + ((ang1 - ang0) * i) / steps;
      const x = cx + r * Math.cos(ang);
      const y = SPRING + r * Math.sin(ang);
      shape.lineTo(-x, y);
    }
    shape.lineTo(HALL_X, SPRING);
    shape.lineTo(HALL_X, HALL_Y + 0.08);
    shape.lineTo(-HALL_X, HALL_Y + 0.08);
    shape.closePath();
    return shape;
  }

  const archGeo = new THREE.ExtrudeGeometry(archShape(), {
    depth: 0.46,
    bevelEnabled: false,
    curveSegments: 10
  });
  archGeo.translate(0, 0, -0.23);
  geometries.push(archGeo);
  const pierW = HALL_X - OPEN / 2;
  const pierGeo = new THREE.BoxGeometry(pierW, SPRING, 0.46);
  geometries.push(pierGeo);
  const pierX = (HALL_X + OPEN / 2) / 2;

  for (let i = 0; i < N - 1; i++) {
    const z = -i * BAY - BAY / 2;
    const head = new THREE.Mesh(archGeo, archMat);
    head.position.set(0, 0, z);
    glScene.add(head);
    const leftPier = new THREE.Mesh(pierGeo, archMat);
    leftPier.position.set(-pierX, SPRING / 2, z);
    glScene.add(leftPier);
    const rightPier = new THREE.Mesh(pierGeo, archMat);
    rightPier.position.set(pierX, SPRING / 2, z);
    glScene.add(rightPier);
  }

  function lancet(w: number, h: number) {
    const s = new THREE.Shape();
    const hw = w / 2;
    const spring = h * 0.62;
    s.moveTo(-hw, 0);
    s.lineTo(-hw, spring);
    s.quadraticCurveTo(-hw * 0.15, h, 0, h);
    s.quadraticCurveTo(hw * 0.15, h, hw, spring);
    s.lineTo(hw, 0);
    s.closePath();
    const geo = new THREE.ShapeGeometry(s);
    geo.center();
    geometries.push(geo);
    return geo;
  }

  const winGeo = lancet(0.56, 1.38);
  const mullionV = new THREE.BoxGeometry(0.028, 0.95, 0.03);
  const mullionH = new THREE.BoxGeometry(0.52, 0.028, 0.03);
  geometries.push(mullionV, mullionH);
  const curtainGeo = new THREE.PlaneGeometry(0.34, 1.7);
  geometries.push(curtainGeo);

  function addWindow(side: number, z: number) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(winGeo, glassMat);
    g.add(glass);
    const v = new THREE.Mesh(mullionV, leadMat);
    v.position.y = -0.08;
    g.add(v);
    for (const y of [-0.32, 0.08, 0.38]) {
      const h = new THREE.Mesh(mullionH, leadMat);
      h.position.y = y;
      g.add(h);
    }
    for (const x of [-0.42, 0.42]) {
      const c = new THREE.Mesh(curtainGeo, curtainMat);
      c.position.set(x, -0.12, 0.08);
      g.add(c);
    }
    /* 그룹의 +Z 가 방 안을 보게 돌립니다. 왼쪽은 +X, 오른쪽은 −X. */
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(side * (HALL_X - 0.1), 2.05, z);
    glScene.add(g);
  }

  for (let i = 0; i < N; i++) {
    const z = -i * BAY + 0.48;
    addWindow(-1, z);
    addWindow(1, z);
    const lamp = new THREE.Group();
    const hang = -i * BAY + 0.9;
    lamp.position.set(0, HALL_Y - 0.02, hang);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 6), gold);
    chain.position.y = -0.24;
    geometries.push(chain.geometry);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 8, 18), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.5;
    geometries.push(ring.geometry);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), waxMat);
    bulb.position.y = -0.5;
    geometries.push(bulb.geometry);
    const light = new THREE.PointLight(0xffe2b0, 18, 14, 2);
    light.position.y = -0.5;
    lamp.add(chain, ring, bulb, light);
    glScene.add(lamp);
  }

  /* 콘텐츠 양옆의 성당 벽화입니다. 평면은 +Z 를 보고, 카메라가 +Z 에 있으므로
     정면이 복도 쪽입니다. 왼쪽은 가운데를 향해 조금 돕니다. */
  const figH = 1.62;
  const figW = figH * (360 / 708);
  const figGeo = new THREE.PlaneGeometry(figW, figH);
  const figBackGeo = new THREE.BoxGeometry(figW, figH, 0.028);
  const figPlinthGeo = new THREE.BoxGeometry(figW + 0.2, 0.16, 0.18);
  const figFrameT = 0.04;
  const figFrameH = new THREE.BoxGeometry(figW + figFrameT * 2, figFrameT, 0.042);
  const figFrameV = new THREE.BoxGeometry(figFrameT, figH, 0.042);
  geometries.push(figGeo, figBackGeo, figPlinthGeo, figFrameH, figFrameV);
  const figBackMat = matStd(0x4e321c, 0.66);
  const figPlinthMat = matStd(0xc9bba6, 0.86);

  const figures: { group: import("three").Group; z: number }[] = [];
  function addFigure(mat: import("three").Material, side: number, z: number) {
    const g = new THREE.Group();
    const y0 = 0.16;
    const midY = y0 + figH / 2;
    const back = new THREE.Mesh(figBackGeo, figBackMat);
    back.position.set(0, midY, -0.02);
    const face = new THREE.Mesh(figGeo, mat);
    face.position.set(0, midY, 0.014);
    const plinth = new THREE.Mesh(figPlinthGeo, figPlinthMat);
    plinth.position.set(0, 0.08, 0);
    const top = new THREE.Mesh(figFrameH, gold);
    top.position.set(0, y0 + figH + figFrameT / 2, 0.02);
    const bottom = new THREE.Mesh(figFrameH, gold);
    bottom.position.set(0, y0 - figFrameT / 2, 0.02);
    const leftBar = new THREE.Mesh(figFrameV, gold);
    leftBar.position.set(-figW / 2 - figFrameT / 2, midY, 0.02);
    const rightBar = new THREE.Mesh(figFrameV, gold);
    rightBar.position.set(figW / 2 + figFrameT / 2, midY, 0.02);
    g.add(back, face, plinth, top, bottom, leftBar, rightBar);
    g.position.set(side * 1.48, 0, z);
    g.rotation.y = side < 0 ? 0.16 : -0.16;
    glScene.add(g);
    figures.push({ group: g, z });
  }

  for (let i = 0; i < N; i++) {
    const z = -i * BAY + 0.18;
    addFigure(figLMat, -1, z);
    addFigure(figRMat, 1, z);
  }

  const frames: import("three").Group[] = [];

  function fillFrame(g: import("three").Group) {
    const pw = view.pageW;
    const ph = view.pageH;
    const t = 0.052;
    const d = 0.046;
    const bar = (w: number, h: number, x: number, y: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      geometries.push(geo);
      const m = new THREE.Mesh(geo, gold);
      m.position.set(x, y, 0);
      g.add(m);
    };
    bar(pw + t * 2, t, 0, ph / 2 + t / 2);
    bar(pw + t * 2, t, 0, -ph / 2 - t / 2);
    bar(t, ph, -pw / 2 - t / 2, 0);
    bar(t, ph, pw / 2 + t / 2, 0);
    const backGeo = new THREE.PlaneGeometry(pw + 0.02, ph + 0.02);
    geometries.push(backGeo);
    const back = new THREE.Mesh(backGeo, paperMat);
    back.position.z = -0.034;
    g.add(back);
  }

  function clearFrame(g: import("three").Group) {
    for (const child of [...g.children]) {
      g.remove(child);
      const mesh = child as import("three").Mesh;
      if (mesh.geometry) {
        const at = geometries.indexOf(mesh.geometry);
        if (at >= 0) geometries.splice(at, 1);
        mesh.geometry.dispose();
      }
    }
  }

  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    fillFrame(g);
    g.position.set(0, EYE, -i * BAY - 0.04);
    glScene.add(g);
    frames.push(g);
  }

  function applyPageSize() {
    hosts.forEach(el => {
      if (el.dataset.crisp === "1") return;
      el.style.width = view.cssW + "px";
      el.style.height = view.cssH + "px";
    });
  }
  applyPageSize();

  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(view.W, view.H);
  cssRenderer.domElement.classList.add("cy-css3d");
  mount?.appendChild(cssRenderer.domElement);

  const objects = hosts.map(el => {
    const obj = new CSS3DObject(el);
    cssScene.add(obj);
    return obj;
  });

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let frame = 0;
  let last = performance.now();
  let elapsed = 0;
  let crisp = false;
  let crispIndex = 0;
  let pagesDirty = true;
  let walkFrom = camZ;
  let walkTo = camZ;
  let walkT = 1;

  function releaseCrisp() {
    if (!crisp) return;
    const el = objects[crispIndex]?.element;
    crisp = false;
    if (!el) return;
    delete el.dataset.crisp;
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.margin = "";
    el.style.transform = "";
    el.style.transformOrigin = "";
    el.style.zIndex = "";
    el.style.width = view.cssW + "px";
    el.style.height = view.cssH + "px";
  }

  function parkCrisp() {
    const i = getActive();
    const el = objects[i]?.element;
    if (!el || !mount) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    mount.appendChild(el);
    el.dataset.crisp = "1";
    el.style.position = "fixed";
    el.style.left = Math.round(rect.left) + "px";
    el.style.top = Math.round(rect.top) + "px";
    el.style.width = Math.round(rect.width) + "px";
    el.style.height = Math.round(rect.height) + "px";
    el.style.margin = "0";
    el.style.transform = "none";
    el.style.transformOrigin = "0 0";
    el.style.zIndex = "4";
    crisp = true;
    crispIndex = i;
  }

  function placePages() {
    const active = getActive();
    const scale = view.pageW / view.cssW;
    objects.forEach((obj, i) => {
      const pageZ = -i * BAY;
      const gap = camZ - pageZ;
      const aside = 1 - smoothstep(0.7, 2.5, gap);
      const x = aside * -0.72;
      const neighbor = i === active || i === active + 1 || (i === active - 1 && aside < 0.92);
      const show = neighbor && (i === active ? gap > -0.55 : gap > -0.35 && aside < 0.9);
      obj.position.set(x, EYE, pageZ);
      obj.rotation.set(0, 0, 0);
      obj.scale.setScalar(scale);
      obj.visible = show;
      const el = obj.element;
      if (el.dataset.crisp !== "1") {
        const fade = i === active ? 1 : Math.max(0, 1 - aside * 1.05);
        el.style.opacity = fade > 0.98 ? "1" : fade.toFixed(2);
      }
      frames[i].position.set(x, EYE, pageZ - 0.04);
      frames[i].visible = show;
    });
  }

  function publish() {
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, up);
    if (!mount) return;
    const ok = !crisp ? fwd.z < -0.95 && right.x > 0.9 && Math.abs(fwd.y) < 0.08 : fwd.z < -0.95 && right.x > 0.9;
    mount.dataset.regalOk = camZ === station(getActive()) && ok ? "1" : "0";
    mount.dataset.regalZ = camZ.toFixed(3);
    mount.dataset.regalFwd = `${fwd.x.toFixed(3)},${fwd.y.toFixed(3)},${fwd.z.toFixed(3)}`;
    mount.dataset.regalBay = String(getActive());
  }

  function onResize() {
    releaseCrisp();
    view = computeView();
    camZ = station(getActive());
    camera.fov = view.fov;
    camera.aspect = view.W / Math.max(1, view.H);
    camera.position.set(0, EYE, camZ);
    camera.lookAt(0, EYE, camZ - 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, view.mobile ? 1 : 1.35));
    renderer.setSize(view.W, view.H);
    cssRenderer.setSize(view.W, view.H);
    frames.forEach(g => {
      clearFrame(g);
      fillFrame(g);
    });
    applyPageSize();
    pagesDirty = true;
    wantGL = true;
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    elapsed += dt;

    const targetZ = station(getActive());
    if (targetZ !== walkTo) {
      walkFrom = camZ;
      walkTo = targetZ;
      walkT = 0;
    }
    if (reduced) walkT = 1;
    else walkT = Math.min(1, walkT + dt / 1.7);
    const u = walkT * walkT * (3 - 2 * walkT);
    camZ = walkT >= 1 ? walkTo : walkFrom + (walkTo - walkFrom) * u;
    const moving = walkT < 1;
    if (moving) releaseCrisp();
    /* 액자 바로 앞을 지나면 벽화가 화면을 덮습니다. 그때만 감춥니다. */
    for (const fig of figures) fig.group.visible = Math.abs(camZ - fig.z) > 2.15;

    /* 높이만 흔듭니다. 시선은 항상 복도 −Z 이고, 멈추면 흔들림도 없습니다. */
    const bob = moving && !reduced ? Math.sin(elapsed * 6.2) * 0.012 : 0;
    camera.position.set(0, EYE + bob, camZ);
    camera.lookAt(0, EYE, camZ - 1);
    camera.updateMatrixWorld();

    if (moving) pagesDirty = true;
    if (pagesDirty) placePages();

    if ((pagesDirty || moving) && !crisp) {
      cssRenderer.render(cssScene, camera);
      if (!moving) {
        parkCrisp();
        if (crisp) pagesDirty = false;
      }
    }

    if (wantGL || moving) {
      renderer.render(glScene, camera);
      if (!moving && pending === 0) wantGL = false;
    }
    publish();
  }
  frame = requestAnimationFrame(tick);

  function onContextLost(ev: Event) {
    ev.preventDefault();
    if (alive) onFail();
  }

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
  let ignoreSwipe = false;
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    tx0 = t.clientX;
    ty0 = t.clientY;
    ignoreSwipe = e.target instanceof Element && !!e.target.closest(".cy-right-content, .cy-left-panel, .cy-tabs, .cy-right-header");
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (tx0 === null || ty0 === null || isLocked() || ignoreSwipe) {
      tx0 = null;
      ty0 = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - tx0;
    const dy = t.clientY - ty0;
    tx0 = null;
    ty0 = null;
    if (Math.abs(dx) <= 70 || Math.abs(dx) <= Math.abs(dy) * 1.6) return;
    select((getActive() + (dx < 0 ? 1 : -1) + N) % N);
  };

  /* 서랍이 열린 채 밖을 누르면 칸을 닫는 탭입니다. 그 클릭으로 걷지 않습니다. */
  let suppressClick = false;
  const onPointerDown = (e: PointerEvent) => {
    const open = document.querySelector(".cy-left-panel.is-open");
    const t = e.target;
    const inside = t instanceof Element && !!t.closest(".cy-left-panel, .cy-hud-toggle");
    suppressClick = !!open && !inside;
  };
  const onBackgroundClick = (e: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
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
    select((i + (forward ? 1 : -1) + N) % N);
  };

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("click", onBackgroundClick);
  window.addEventListener("resize", onResize);
  mq.addEventListener("change", onResize);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  function dispose() {
    alive = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("click", onBackgroundClick);
    window.removeEventListener("resize", onResize);
    mq.removeEventListener("change", onResize);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchend", onTouchEnd);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);

    objects.forEach(o => cssScene.remove(o));
    cssRenderer.domElement.remove();

    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    textures.forEach(t => t.dispose());
    glScene.clear();
    cssScene.clear();
    renderer.domElement.remove();
    renderer.dispose();
    renderer.forceContextLoss();
    if (mount) {
      delete mount.dataset.regalOk;
      delete mount.dataset.regalZ;
      delete mount.dataset.regalFwd;
      delete mount.dataset.regalBay;
    }
  }

  return { dispose };
}
