/* 왕실 스킨 3D 무대(렌더러, 카메라, 방 바꾸기). React 와 떨어진 순수 코드입니다.

   - 방마다 고정 카메라 하나. 끌면 좌우/위아래로 ±10° 만 둘러봅니다.
   - 문(또는 문패)을 누르면 600ms 앞으로 걸어가며 어두워졌다가 다음 방이 열립니다.
   - 지금 방과 이웃 방만 미리 만들고, 나머지는 들어갈 때 만듭니다.
   - 픽셀 비율 1.5 이하, 휴대폰은 30fps, 화면이 안 보이면 그리지 않습니다. */

import type * as T from "three";
import { ROOMS, ROOM_BY_ID, type Room } from "./rooms";
import { buildRoom, createKit, type BuildCtx, type BuiltRoom, type Hit, type Kit } from "./manorBuild";

type Three = typeof import("three");

export type StageEvents = {
  onRoom: (id: string) => void;
  onCharacter: () => void;
  onHead: (x: number, y: number, visible: boolean) => void;
  onFade: (opacity: number) => void;
  onFail: () => void;
};

export type ViewRect = { w: number; h: number; offsetX: number };

export type ManorStage = {
  goTo: (id: string, animate: boolean) => void;
  resize: (rect: ViewRect) => void;
  dispose: () => void;
};

const DEG = Math.PI / 180;
const LOOK_LIMIT = 10 * DEG;

export function neighbours(room: Room) {
  return room.doors.map(d => d.to).filter((id, i, a) => a.indexOf(id) === i && ROOM_BY_ID[id]);
}

export function createManorStage(opts: {
  THREE: Three;
  RoomEnvironment: typeof import("three/examples/jsm/environments/RoomEnvironment.js").RoomEnvironment;
  host: HTMLElement;
  input: HTMLElement;
  url: (p: string) => string;
  ctx: BuildCtx;
  initial: string;
  rect: ViewRect;
  mobile: boolean;
  events: StageEvents;
  isLocked: () => boolean;
}): ManorStage {
  const { THREE, RoomEnvironment, host, input, events } = opts;
  let rect = opts.rect;
  const renderer = new THREE.WebGLRenderer({ antialias: !opts.mobile, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(rect.w, rect.h);
  host.appendChild(renderer.domElement);

  const kit: Kit = createKit(THREE, opts.url, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.36;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  const built = new Map<string, BuiltRoom>();
  let current: BuiltRoom | null = null;
  let alive = true;

  /* 카메라 */
  const basePos = new THREE.Vector3();
  const baseLook = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  let walk: { from: T.Vector3; to: T.Vector3; t: number; next: string } | null = null;
  /* 비밀 책장이 열리는 동안(1.3초) 기다렸다가 걸어 들어갑니다. */
  let opening: { t: number; to: string; point: T.Vector3; yaw0: number; yaw1: number } | null = null;
  let fadeIn = 0;

  function ensure(id: string) {
    let b = built.get(id);
    if (!b) {
      b = buildRoom(kit, ROOM_BY_ID[id], opts.ctx);
      built.set(id, b);
    }
    return b;
  }

  function fovFor() {
    const aspect = rect.w / Math.max(1, rect.h);
    /* 가로 화각이 너무 좁아지지 않게 세로 화각을 정합니다. */
    const hfov = aspect < 1 ? 66 : 74;
    const v = (2 * Math.atan(Math.tan((hfov * DEG) / 2) / aspect)) / DEG;
    return Math.min(78, Math.max(46, v));
  }

  function applyCamera() {
    camera.aspect = rect.w / Math.max(1, rect.h);
    camera.fov = fovFor();
    if (rect.offsetX > 0) camera.setViewOffset(rect.w + rect.offsetX, rect.h, rect.offsetX, 0, rect.w, rect.h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function enter(id: string) {
    const b = ensure(id);
    if (current) scene.remove(current.group);
    current = b;
    b.openSecret?.(0);
    scene.add(b.group);
    const r = b.room;
    scene.fog = new THREE.Fog(new THREE.Color(r.fog.color), r.fog.near, r.fog.far);
    scene.background = new THREE.Color(r.fog.color);
    renderer.toneMappingExposure = r.exposure;
    basePos.set(...r.camera.pos);
    baseLook.set(...r.camera.look);
    yaw = 0;
    pitch = 0;
    placeCamera();
    host.dataset.manorRoom = id;
    host.dataset.manorTris = String(b.triangles);
    events.onRoom(id);
    /* 이웃 방은 쉬는 틈에 미리 만듭니다. */
    const later = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 1500 });
      else window.setTimeout(cb, 300);
    };
    for (const n of neighbours(r)) {
      later(() => {
        if (alive) ensure(n);
      });
    }
  }

  const dir = new THREE.Vector3();
  const look = new THREE.Vector3();
  function placeCamera(extra?: T.Vector3) {
    dir.subVectors(baseLook, basePos).normalize();
    const baseYaw = Math.atan2(dir.x, dir.z);
    const basePitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const y2 = baseYaw + yaw;
    const p2 = basePitch + pitch;
    const pos = extra ?? basePos;
    camera.position.copy(pos);
    look.set(pos.x + Math.sin(y2) * Math.cos(p2), pos.y + Math.sin(p2), pos.z + Math.cos(y2) * Math.cos(p2));
    camera.lookAt(look);
    camera.updateMatrixWorld();
  }

  function goTo(id: string, animate: boolean, toward?: T.Vector3) {
    if (!ROOM_BY_ID[id] || walk) return;
    if (current && current.room.id === id) return;
    if (!animate || !current) {
      enter(id);
      events.onFade(0);
      return;
    }
    const target = toward ? basePos.clone().lerp(new THREE.Vector3(toward.x, basePos.y, toward.z), 0.45) : basePos.clone().add(dir.clone().multiplyScalar(1.2));
    walk = { from: camera.position.clone(), to: target, t: 0, next: id };
  }

  /* 입력: 끌어서 둘러보기, 눌러서 문/인물 */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number; yaw: number; pitch: number; t: number; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (opts.isLocked() || walk || opening) return;
    down = { x: e.clientX, y: e.clientY, yaw, pitch, t: performance.now(), id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) < 6) return;
    yaw = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, down.yaw - dx * 0.0025));
    pitch = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, down.pitch + dy * 0.0025));
    placeCamera();
  };
  const onUp = (e: PointerEvent) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
    down = null;
    if (moved > 6 || !current) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hitList = ray.intersectObjects(current.hits, true);
    for (const h of hitList) {
      const hit = h.object.userData.hit as Hit | undefined;
      if (!hit) continue;
      if (hit.type === "door" && hit.reveal && current.openSecret) {
        /* 책장 쪽으로 고개를 돌리며 열리는 모습을 보여 줍니다. */
        dir.subVectors(baseLook, basePos).normalize();
        const baseYaw = Math.atan2(dir.x, dir.z);
        let want = Math.atan2(h.point.x - basePos.x, h.point.z - basePos.z) - baseYaw;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        opening = { t: 0, to: hit.to, point: h.point.clone(), yaw0: yaw, yaw1: Math.max(-28 * DEG, Math.min(28 * DEG, want * 0.7)) };
      }
      else if (hit.type === "door") goTo(hit.to, true, h.point);
      else events.onCharacter();
      return;
    }
  };
  const onHover = (e: PointerEvent) => {
    if (down || !current || e.pointerType !== "mouse") return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const any = ray.intersectObjects(current.hits, true).some(h => h.object.userData.hit);
    input.style.cursor = any ? "pointer" : "grab";
  };
  input.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  input.addEventListener("pointermove", onHover);

  const onLost = (ev: Event) => {
    ev.preventDefault();
    if (alive) events.onFail();
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  /* 그리기 */
  const head = new THREE.Vector3();
  const minFrame = opts.mobile ? 1000 / 30 : 0;
  let last = performance.now();
  let lastDraw = 0;
  let frame = 0;
  const t0 = performance.now();
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
      last = now;
      return;
    }
    if (now - lastDraw < minFrame - 1) return;
    lastDraw = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (opening && current) {
      opening.t = Math.min(1, opening.t + dt / 1.3);
      const u = opening.t;
      current.openSecret?.(1 - Math.pow(1 - u, 3));
      const e = Math.min(1, u * 1.6);
      yaw = opening.yaw0 + (opening.yaw1 - opening.yaw0) * e * e * (3 - 2 * e);
      placeCamera();
      if (u >= 1) {
        const o = opening;
        opening = null;
        goTo(o.to, true, o.point);
      }
    }
    if (walk) {
      walk.t = Math.min(1, walk.t + dt / 0.6);
      const u = walk.t * walk.t * (3 - 2 * walk.t);
      placeCamera(walk.from.clone().lerp(walk.to, u));
      events.onFade(u);
      if (walk.t >= 1) {
        const next = walk.next;
        walk = null;
        enter(next);
        fadeIn = 1;
      }
    } else if (fadeIn > 0) {
      fadeIn = Math.max(0, fadeIn - dt / 0.35);
      events.onFade(fadeIn);
    }
    if (current) {
      current.animate(t, camera.position);
      head.copy(current.head).project(camera);
      const visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
      events.onHead(((head.x + 1) / 2) * rect.w, ((1 - head.y) / 2) * rect.h, visible);
      renderer.render(scene, camera);
    }
    host.dataset.manorReady = kit.pending === 0 ? "1" : "0";
  }

  /* 시험용: 주소에 ?manorDebug=1 이 있으면 누를 곳의 화면 좌표와 시선을 내보입니다. */
  const debug = new URLSearchParams(window.location.search).get("manorDebug") === "1";
  if (debug) {
    const box3 = new THREE.Box3();
    const v = new THREE.Vector3();
    (window as unknown as Record<string, unknown>).__regalManor = {
      state: () => ({ room: current?.room.id, yaw: yaw / DEG, pitch: pitch / DEG, walking: !!walk, opening: opening ? opening.t : null, tris: current?.triangles }),
      hits: () => {
        if (!current) return [];
        const cr = renderer.domElement.getBoundingClientRect();
        const out: { type: string; to?: string; reveal?: boolean; x: number; y: number }[] = [];
        for (const o of current.hits) {
          const hit = (o.userData.hit ?? (() => { let f: Hit | undefined; o.traverse(c => { if (!f && c.userData.hit) f = c.userData.hit as Hit; }); return f; })()) as Hit | undefined;
          if (!hit) continue;
          box3.setFromObject(o);
          let best: { x: number; y: number } | null = null;
          /* 상자 안 점들을 화면에 찍어 실제로 그 물체가 먼저 맞는 곳을 고릅니다. */
          for (let i = 1; i < 6 && !best; i++) {
            for (let j = 1; j < 6 && !best; j++) {
              v.set(box3.min.x + ((box3.max.x - box3.min.x) * i) / 6, box3.min.y + ((box3.max.y - box3.min.y) * j) / 6, (box3.min.z + box3.max.z) / 2).project(camera);
              if (Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95 || v.z > 1) continue;
              ndc.set(v.x, v.y);
              ray.setFromCamera(ndc, camera);
              const first = ray.intersectObjects(current.hits, true).find(h => h.object.userData.hit);
              if (first && first.object.userData.hit === hit) best = { x: cr.left + ((v.x + 1) / 2) * cr.width, y: cr.top + ((1 - v.y) / 2) * cr.height };
            }
          }
          if (best) out.push({ type: hit.type, to: hit.type === "door" ? hit.to : undefined, reveal: hit.type === "door" ? hit.reveal : undefined, ...best });
        }
        return out;
      },
      secret: (u: number) => current?.openSecret?.(u),
      /* 점검용: 카메라를 임의 위치에 두고 가까이 봅니다(다음 시선 조작 전까지). */
      view: (x: number, y: number, z: number, lx: number, ly: number, lz: number, fov = 40) => {
        camera.position.set(x, y, z);
        camera.fov = fov;
        camera.updateProjectionMatrix();
        camera.lookAt(lx, ly, lz);
      },
      /* 점검용: 제한 없이 시선을 돌립니다(도 단위). */
      look: (yd: number, pd: number) => {
        yaw = yd * DEG;
        pitch = pd * DEG;
        placeCamera();
      },
      tris: (only?: string) => {
        const out: Record<string, number> = {};
        const list = only ? (current?.group.getObjectByName(only)?.children ?? []) : (current?.group.children ?? []);
        list.forEach(c => {
          let n = 0;
          c.traverse(o => {
            const m = o as T.Mesh;
            if (!m.isMesh) return;
            const ix = m.geometry.index;
            n += (ix ? ix.count : m.geometry.getAttribute("position").count) / 3;
          });
          const key = only ? ((c as T.Mesh).geometry?.type ?? c.type) : c.name || c.type;
          out[key] = Math.round((out[key] ?? 0) + n);
        });
        return out;
      }
    };
  }

  applyCamera();
  enter(opts.initial);
  frame = requestAnimationFrame(tick);

  return {
    goTo: (id, animate) => goTo(id, animate),
    resize(r) {
      rect = r;
      renderer.setSize(r.w, r.h);
      applyCamera();
      placeCamera();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(frame);
      input.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      input.removeEventListener("pointermove", onHover);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      built.forEach(b => b.dispose());
      built.clear();
      kit.dispose();
      envTex.dispose();
      scene.clear();
      renderer.domElement.remove();
      renderer.dispose();
      renderer.forceContextLoss();
      delete host.dataset.manorRoom;
      delete host.dataset.manorReady;
      delete host.dataset.manorTris;
    }
  };
}

export const ROOM_ORDER = ROOMS.filter(r => !r.hidden).map(r => r.id);
