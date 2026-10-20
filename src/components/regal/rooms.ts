/* 왕실 스킨(영국 대저택)의 방 설정입니다.

   디자이너 지침을 바로 옮길 수 있게, 방의 모든 값을 이 파일 하나에 모았습니다.
   3D 코드는 manorBuild.ts 에 있고 여기 값을 읽기만 합니다.

   좌표: 방마다 따로입니다. 방 한가운데 바닥이 (0, 0, 0) 이고
   x 는 동쪽(+), z 는 남쪽(+), y 는 위입니다. 북쪽 벽은 z = -d/2 입니다.
   단위는 미터입니다.

   새 소품을 넣으려면 props 에 { kind, at, rot } 한 줄을 더하면 됩니다.
   kind 목록은 PropKind 에 있습니다. 예시 이름이 필요하면 홍길동을 쓰세요.
   (예: 이름표 문구 "홍길동의 서재") */

export type Side = "N" | "S" | "E" | "W";

/* 방에서 여는 메뉴입니다. home~photo 는 기존 탭, 나머지는 왕실 스킨 전용입니다. */
export type MenuKey = "home" | "profile" | "board" | "photo" | "guestbook" | "bgm" | "links" | "secret";

export type PropKind =
  | "twinStair" | "chandelier" | "crystalChandelier" | "crest" | "longcaseClock" | "bust" | "niche"
  | "ownerPortrait" | "smallDesk" | "windowChair" | "consoleTable"
  | "bookshelves" | "ladder" | "wingback" | "libraryDesk" | "globe" | "secretShelf"
  | "chesterfield" | "marbleFireplace" | "teaTrolley" | "guestbookStand" | "sideTable"
  | "displayCase" | "bench"
  | "grandPiano" | "gramophone" | "harp" | "musicStand"
  | "glassHouse" | "pottedPalm" | "fern" | "wickerBench" | "planter"
  | "chaise" | "vanity" | "jewelCase" | "candelabra"
  | "rug" | "runner"
  /* 박물관 유리 진열장. opts: item, title, sub */
  | "vitrine"
  /* 벽 촛대. at 은 벽 앞 바닥 좌표, rot 은 벽에서 방 쪽을 보는 방향 */
  | "sconce"
  /* 낮은 차 탁자와 찻잔 */
  | "teaTable"
  | "candlestick";

export type Prop = {
  kind: PropKind;
  /* 바닥 위치 [x, z] */
  at: [number, number];
  /* 도(°). 0 이면 소품 앞면이 남쪽(+z)을 봅니다. */
  rot?: number;
  scale?: number;
  /* 소품별 추가 값. 예: 양탄자 크기 { w: 4, d: 3 } */
  opts?: Record<string, number | string | boolean>;
};

/* 벽에 거는 그림. offset 은 벽 가운데에서 오른쪽(방 안에서 벽을 볼 때)으로 m. */
export type Painting = {
  src: string;
  wall: Side;
  offset: number;
  y: number;
  h: number;
  /* 그림 비율 w/h */
  aspect: number;
  title: string;
  artist: string;
  date: string;
  /* 박물관식 작은 설명표에 붙는 줄입니다. */
  credit: string;
  /* 사진첩 사진 자리이면 true. 실제 사진은 화면에서 채웁니다. */
  album?: number;
  /* 주인장 프로필 사진 자리이면 true */
  owner?: boolean;
};

export type Door = {
  wall: Side;
  to: string;
  offset?: number;
  /* 책장 비밀문처럼 문 모양이 아닌 입구 */
  secret?: boolean;
  /* 문패 글. 생략하면 가는 방 이름입니다. */
  plaque?: string;
};

export type Window = { wall: Side; offset: number; w: number; h: number; sill: number };

/* 방마다 서 있는 인물 판(스탠디)입니다. 배경을 오린 전신 그림 한 장을
   카메라 쪽으로 세워 둡니다. 그림을 바꾸려면 같은 이름의 webp 만 바꾸면 됩니다.
   height 는 실제 키(m)입니다. 어른은 1.6~1.8m 로 맞춥니다. */
export type Character = {
  name: string;
  role: string;
  /* 전신 그림 */
  src: string;
  /* 그림 원본 비율 w/h */
  aspect: number;
  height: number;
  at: [number, number];
  /* 카메라를 바라보는 방향에서 더 돌릴 각도(°). 판 그림이라 작게만 씁니다. */
  rot?: number;
  /* 눌렀을 때 말풍선 한 줄 */
  line: string;
  /* 방에 들어오자마자 띄우는 말풍선(비밀의 방) */
  enterLine?: string;
  /* 말풍선에 띄우는 표정 그림들. 얼굴을 바꾸려면 파일만 바꾸면 됩니다. */
  expressions?: Record<string, string>;
  tapExpression?: string;
};

/* 방마다 다른 나무 양문. */
export type DoorStyle = {
  wood: "mahogany" | "oak" | "walnut" | "ebony" | "painted";
  surround: "stone" | "marble" | "wood" | "iron";
  head: "pediment" | "segmental" | "fanlight" | "cornice";
};

export type FloorKind = "opusMosaic" | "oakBoards" | "herringbone" | "versailles" | "cubeParquet" | "terracotta" | "encaustic" | "walnutBoards";
export type WallKind = "panelledStone" | "chintz" | "velvet" | "damask" | "redDamask" | "wedgwood" | "glass" | "plumVelvet";
export type CeilingKind = "coffered" | "coved" | "cofferedWood" | "saucerDome" | "ovalDome" | "barrelVault" | "glassDome" | "starCove";

export type Room = {
  id: string;
  name: string;
  nameEn: string;
  menu: MenuKey;
  /* 평면도 칸 [열, 행]. 대홀이 [2, 1] */
  grid: [number, number];
  hidden?: boolean;
  size: { w: number; d: number; h: number };
  palette: { main: string; second: string; trim: string };
  floor: FloorKind;
  walls: WallKind;
  ceiling: CeilingKind;
  /* 실시간 조명은 방마다 하나입니다. */
  light: { color: string; intensity: number; at: [number, number, number]; distance: number };
  ambient: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  exposure: number;
  /* 고정 카메라. 문 쪽에서 본 3/4 시점입니다. */
  camera: { pos: [number, number, number]; look: [number, number, number] };
  doors: Door[];
  doorStyle: DoorStyle;
  windows: Window[];
  /* 창으로 들어오는 빛 색 */
  daylight: string;
  props: Prop[];
  paintings: Painting[];
  character: Character;
};

const R = "/assets/regal";
const PD = "Public domain · Wikimedia Commons";

export const ROOMS: Room[] = [
  {
    id: "hall",
    name: "대홀",
    nameEn: "Great Hall",
    menu: "home",
    grid: [2, 1],
    size: { w: 12, d: 12, h: 8 },
    palette: { main: "#6B4A2E", second: "#EDE8DE", trim: "#C2A15A" },
    floor: "opusMosaic",
    walls: "panelledStone",
    ceiling: "coffered",
    light: { color: "#FFE2B0", intensity: 70, at: [0, 5.6, -0.5], distance: 26 },
    ambient: { sky: "#fff3df", ground: "#5a4030", intensity: 0.9 },
    fog: { color: "#3a2a1e", near: 14, far: 40 },
    exposure: 1.12,
    camera: { pos: [3.4, 1.62, 5.3], look: [-1.2, 2.5, -2.6] },
    doors: [
      { wall: "N", to: "conservatory" },
      { wall: "S", to: "gallery" },
      { wall: "W", to: "reception" },
      { wall: "E", to: "drawing" }
    ],
    doorStyle: { wood: "mahogany", surround: "stone", head: "pediment" },
    windows: [],
    daylight: "#fff1d8",
    props: [
      { kind: "twinStair", at: [0, -4.6] },
      { kind: "chandelier", at: [0, -0.5], opts: { y: 5.6, size: 1.3 } },
      { kind: "crest", at: [0, -5.96], opts: { y: 6.15 } },
      { kind: "longcaseClock", at: [-5.62, 3.4], rot: 90 },
      { kind: "bust", at: [-0.95, -2.9] },
      { kind: "bust", at: [0.95, -2.9] },
      { kind: "niche", at: [5.96, 2.6], rot: -90 },
      { kind: "consoleTable", at: [-5.55, 1.9], rot: 90 },
      { kind: "vitrine", at: [-3.3, 2.5], rot: 55, opts: { item: "keys", title: "대저택 열쇠 꾸러미", sub: "Keys of the House · c. 1840" } },
      { kind: "sconce", at: [-5.97, -0.6], rot: 90, opts: { y: 2.7 } },
      { kind: "sconce", at: [-5.97, 4.6], rot: 90, opts: { y: 2.7 } },
      { kind: "sconce", at: [5.97, -0.6], rot: -90, opts: { y: 2.7 } },
      { kind: "sconce", at: [5.97, 4.6], rot: -90, opts: { y: 2.7 } }
    ],
    paintings: [
      {
        src: `${R}/paintings/whistlejacket.webp`, wall: "W", offset: -3.2, y: 5.1, h: 2.3, aspect: 629 / 768,
        title: "Whistlejacket", artist: "George Stubbs", date: "c. 1762", credit: PD
      },
      {
        src: `${R}/paintings/andrews.webp`, wall: "E", offset: 3.2, y: 4.9, h: 1.4, aspect: 768 / 445,
        title: "Mr and Mrs Andrews", artist: "Thomas Gainsborough", date: "c. 1750", credit: PD
      }
    ],
    character: {
      name: "집사",
      role: "Butler",
      src: `${R}/characters/butler.webp`,
      aspect: 208 / 691,
      height: 1.74,
      at: [0.5, 0.9],
      line: "어서 오세요. 어느 방으로 모실까요?"
    }
  },
  {
    id: "reception",
    name: "접견실",
    nameEn: "Reception Room",
    menu: "profile",
    grid: [1, 1],
    size: { w: 10, d: 8, h: 4.8 },
    palette: { main: "#A8B59A", second: "#F4EFE2", trim: "#C2A15A" },
    floor: "oakBoards",
    walls: "chintz",
    ceiling: "coved",
    light: { color: "#FFF4DD", intensity: 34, at: [-1.6, 3.6, -2.2], distance: 16 },
    ambient: { sky: "#fff6e4", ground: "#6e5a44", intensity: 1.05 },
    fog: { color: "#d9d4c4", near: 12, far: 30 },
    exposure: 1.08,
    camera: { pos: [4.1, 1.6, 2.4], look: [-1.8, 1.5, -1.5] },
    doors: [
      { wall: "E", to: "hall" },
      { wall: "W", to: "library" }
    ],
    doorStyle: { wood: "oak", surround: "wood", head: "cornice" },
    windows: [
      { wall: "N", offset: -3.4, w: 1.4, h: 2.7, sill: 0.7 },
      { wall: "N", offset: 3.0, w: 1.4, h: 2.7, sill: 0.7 }
    ],
    daylight: "#FFF4DD",
    props: [
      { kind: "smallDesk", at: [1.4, -3.4] },
      { kind: "windowChair", at: [-3.4, -3.1], rot: 20 },
      { kind: "sideTable", at: [-4.3, 2.2] },
      { kind: "candlestick", at: [-4.3, 2.2], opts: { y: 0.68 } },
      { kind: "vitrine", at: [-3.7, 0.4], rot: 75, opts: { item: "album", title: "명함 앨범과 봉랍 도장", sub: "Calling-card album · 홍길동 기증" } },
      { kind: "sconce", at: [-1.55, -3.97], rot: 0, opts: { y: 2.5 } },
      { kind: "sconce", at: [1.15, -3.97], rot: 0, opts: { y: 2.5 } },
      { kind: "rug", at: [-0.5, -0.4], opts: { w: 4.6, d: 3.4, style: "aubusson-sage" } }
    ],
    paintings: [
      {
        src: "", wall: "N", offset: -0.2, y: 2.4, h: 1.45, aspect: 0.8, owner: true,
        title: "", artist: "", date: "", credit: ""
      },
      {
        src: `${R}/paintings/blueboy.webp`, wall: "W", offset: -2.5, y: 2.3, h: 1.5, aspect: 523 / 768,
        title: "The Blue Boy", artist: "Thomas Gainsborough", date: "c. 1770", credit: PD
      },
      {
        src: `${R}/paintings/thames.webp`, wall: "W", offset: 2.5, y: 2.4, h: 0.8, aspect: 768 / 432,
        title: "The Thames from Somerset House", artist: "Canaletto", date: "c. 1750", credit: PD
      }
    ],
    character: {
      name: "하녀",
      role: "Maid",
      src: `${R}/characters/maid.webp`,
      aspect: 285 / 709,
      height: 1.62,
      at: [-0.6, -0.9],
      line: "주인장 소개는 제가 앨범에 정리해 두었어요."
    }
  },
  {
    id: "library",
    name: "서재",
    nameEn: "Library",
    menu: "board",
    grid: [0, 1],
    size: { w: 10, d: 8, h: 3.6 },
    palette: { main: "#2F4A3A", second: "#4A3222", trim: "#C2A15A" },
    floor: "herringbone",
    walls: "velvet",
    ceiling: "cofferedWood",
    light: { color: "#FFC98A", intensity: 42, at: [0.6, 2.7, -1.2], distance: 16 },
    ambient: { sky: "#f0d4ac", ground: "#3a2a1c", intensity: 1.0 },
    fog: { color: "#1a140e", near: 12, far: 30 },
    exposure: 1.4,
    camera: { pos: [4.1, 1.55, 2.3], look: [-1.8, 1.35, -1.4] },
    doors: [
      { wall: "E", to: "reception" },
      { wall: "W", to: "secret", secret: true, offset: 1.0 }
    ],
    doorStyle: { wood: "walnut", surround: "wood", head: "segmental" },
    windows: [],
    daylight: "#ffc98a",
    props: [
      { kind: "bookshelves", at: [0, -3.75], opts: { len: 9.6, gap: 1.7 } },
      { kind: "bookshelves", at: [-4.75, 0.3], rot: 90, opts: { len: 7.0, gap: 0, secretAt: 1.0 } },
      { kind: "secretShelf", at: [-4.75, -0.7], rot: 90 },
      { kind: "ladder", at: [-2.4, -3.3] },
      { kind: "wingback", at: [-2.6, 0.9], rot: 125 },
      { kind: "libraryDesk", at: [1.4, -2.7] },
      { kind: "candlestick", at: [0.75, -2.85], opts: { y: 0.81 } },
      { kind: "globe", at: [-3.6, -1.6] },
      { kind: "vitrine", at: [-2.4, -2.0], rot: 35, opts: { item: "manuscript", title: "채색 필사본", sub: "Illuminated manuscript · 15th c." } },
      { kind: "chandelier", at: [0.2, -0.4], opts: { y: 2.9, size: 0.7 } },
      { kind: "rug", at: [-0.6, 0.2], opts: { w: 5.2, d: 3.8, style: "persian" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/orrery.webp`, wall: "N", offset: 0, y: 2.05, h: 0.95, aspect: 768 / 569,
        title: "A Philosopher Lecturing on the Orrery", artist: "Joseph Wright of Derby", date: "c. 1766", credit: PD
      }
    ],
    character: {
      name: "사서",
      role: "Librarian",
      src: `${R}/characters/librarian.webp`,
      aspect: 231 / 708,
      height: 1.78,
      at: [-0.4, -0.7],
      line: "쉿, 여기 기록들은 천천히 읽어 보세요."
    }
  },
  {
    id: "drawing",
    name: "응접실",
    nameEn: "Drawing Room",
    menu: "guestbook",
    grid: [3, 1],
    size: { w: 10, d: 8, h: 4.8 },
    palette: { main: "#C98E8E", second: "#F7F1EA", trim: "#C2A15A" },
    floor: "versailles",
    walls: "damask",
    ceiling: "saucerDome",
    light: { color: "#FFB070", intensity: 22, at: [0, 0.6, -3.4], distance: 12 },
    ambient: { sky: "#ffe8d8", ground: "#5a3a34", intensity: 0.95 },
    fog: { color: "#3a2626", near: 11, far: 28 },
    exposure: 1.1,
    camera: { pos: [-4.1, 1.6, 2.4], look: [1.6, 1.3, -1.4] },
    doors: [
      { wall: "W", to: "hall" },
      { wall: "E", to: "music" }
    ],
    doorStyle: { wood: "mahogany", surround: "marble", head: "fanlight" },
    windows: [
      { wall: "N", offset: -3.2, w: 1.3, h: 2.6, sill: 0.75 },
      { wall: "N", offset: 3.2, w: 1.3, h: 2.6, sill: 0.75 }
    ],
    daylight: "#fff0dc",
    props: [
      { kind: "marbleFireplace", at: [0, -3.82] },
      { kind: "crystalChandelier", at: [0.4, -0.2], opts: { y: 3.7 } },
      { kind: "chesterfield", at: [1.7, -0.7], rot: -57 },
      { kind: "teaTrolley", at: [0.3, 0.1], rot: 30 },
      { kind: "guestbookStand", at: [3.6, 1.8], rot: -60 },
      { kind: "vitrine", at: [3.4, -2.8], rot: -40, opts: { item: "teaset", title: "웨지우드 찻잔 한 벌", sub: "Jasperware tea service · c. 1790" } },
      { kind: "sconce", at: [-1.75, -3.97], rot: 0, opts: { y: 2.25 } },
      { kind: "sconce", at: [1.75, -3.97], rot: 0, opts: { y: 2.25 } },
      { kind: "sconce", at: [4.97, 0.9], rot: -90, opts: { y: 2.3 } },
      { kind: "rug", at: [0.4, -0.8], opts: { w: 4.8, d: 3.6, style: "aubusson-rose" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/haywain.webp`, wall: "N", offset: 0, y: 2.75, h: 1.05, aspect: 768 / 530,
        title: "The Hay Wain", artist: "John Constable", date: "1821", credit: PD
      },
      {
        src: `${R}/paintings/pinkie.webp`, wall: "E", offset: -2.4, y: 2.35, h: 1.5, aspect: 521 / 768,
        title: "Pinkie", artist: "Thomas Lawrence", date: "1794", credit: PD
      }
    ],
    character: {
      name: "숙녀 손님",
      role: "Lady",
      src: `${R}/characters/lady.webp`,
      aspect: 239 / 708,
      height: 1.66,
      at: [0.5, -1.2],
      line: "차 한 잔 어떠세요? 방명록에 한마디 남겨 주세요."
    }
  },
  {
    id: "music",
    name: "음악실",
    nameEn: "Music Room",
    menu: "bgm",
    grid: [4, 1],
    size: { w: 10, d: 8, h: 5 },
    palette: { main: "#EFE6D2", second: "#6E8FB5", trim: "#FFFFFF" },
    floor: "cubeParquet",
    walls: "wedgwood",
    ceiling: "ovalDome",
    light: { color: "#FFE8C4", intensity: 30, at: [2.6, 3.4, 1.2], distance: 16 },
    ambient: { sky: "#fff0dc", ground: "#5c4a3a", intensity: 0.95 },
    fog: { color: "#c8bca8", near: 12, far: 30 },
    exposure: 1.06,
    camera: { pos: [-4.1, 1.6, 2.4], look: [1.8, 1.25, -1.4] },
    doors: [{ wall: "W", to: "drawing" }],
    doorStyle: { wood: "oak", surround: "marble", head: "pediment" },
    windows: [
      { wall: "E", offset: -1.4, w: 1.5, h: 3.0, sill: 0.6 },
      { wall: "E", offset: 1.8, w: 1.5, h: 3.0, sill: 0.6 }
    ],
    daylight: "#ffd9a8",
    props: [
      { kind: "grandPiano", at: [1.6, -0.6], rot: 33 },
      { kind: "harp", at: [3.7, -2.7], rot: -40 },
      { kind: "gramophone", at: [-2.4, -3.3] },
      { kind: "musicStand", at: [0.9, 1.5], rot: -30 },
      { kind: "vitrine", at: [-3.1, -1.2], rot: 60, opts: { item: "violin", title: "바이올린", sub: "Violin · London, c. 1760" } },
      { kind: "chandelier", at: [0.4, -0.4], opts: { y: 3.9, size: 0.8 } },
      { kind: "sconce", at: [1.0, -3.97], rot: 0, opts: { y: 2.5 } },
      { kind: "sconce", at: [3.4, -3.97], rot: 0, opts: { y: 2.5 } },
      { kind: "rug", at: [0.8, -0.6], opts: { w: 5, d: 3.6, style: "savonnerie" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/linley.webp`, wall: "N", offset: -1.2, y: 2.5, h: 1.6, aspect: 587 / 768,
        title: "Elizabeth and Mary Linley", artist: "Thomas Gainsborough", date: "c. 1772", credit: PD
      }
    ],
    character: {
      name: "피아니스트",
      role: "Pianist",
      src: `${R}/characters/pianist.webp`,
      aspect: 203 / 713,
      height: 1.8,
      at: [-0.4, -0.6],
      line: "듣고 싶은 곡을 고르시면 바로 연주해 드리죠."
    }
  },
  {
    id: "conservatory",
    name: "온실",
    nameEn: "Conservatory",
    menu: "links",
    grid: [2, 0],
    size: { w: 8, d: 10, h: 4.6 },
    palette: { main: "#F2F2EE", second: "#4F7A4A", trim: "#FFFFFF" },
    floor: "terracotta",
    walls: "glass",
    ceiling: "glassDome",
    light: { color: "#FFFFFF", intensity: 3.2, at: [3, 9, 4], distance: 0 },
    ambient: { sky: "#eef6ff", ground: "#6a5a40", intensity: 1.35 },
    fog: { color: "#e6efe8", near: 12, far: 34 },
    exposure: 1.0,
    camera: { pos: [2.3, 1.6, 4.3], look: [-1.0, 1.7, -2.2] },
    doors: [{ wall: "S", to: "hall" }],
    doorStyle: { wood: "oak", surround: "iron", head: "fanlight" },
    windows: [],
    daylight: "#ffffff",
    props: [
      { kind: "glassHouse", at: [0, 0] },
      { kind: "pottedPalm", at: [-2.8, -3.6], scale: 1.25 },
      { kind: "pottedPalm", at: [2.9, -3.8] },
      { kind: "pottedPalm", at: [-3.0, 2.2], scale: 0.9 },
      { kind: "fern", at: [1.0, -4.1] },
      { kind: "fern", at: [-1.4, -4.2] },
      { kind: "planter", at: [3.2, -0.6], rot: 90 },
      { kind: "wickerBench", at: [-2.9, -0.6], rot: 90 },
      { kind: "sideTable", at: [-2.9, 1.0] },
      { kind: "candlestick", at: [-2.9, 1.0], opts: { y: 0.68, lantern: true } },
      { kind: "vitrine", at: [1.5, -2.5], rot: -20, opts: { item: "fern", title: "워디언 케이스의 고사리", sub: "Wardian case · c. 1850" } },
      { kind: "chandelier", at: [0, -0.6], opts: { y: 3.9, size: 0.7 } }
    ],
    paintings: [
      {
        src: `${R}/paintings/rose.webp`, wall: "N", offset: 0, y: 1.7, h: 0.8, aspect: 533 / 768,
        title: "Rosa centifolia foliacea", artist: "Pierre-Joseph Redouté", date: "1824", credit: PD
      }
    ],
    character: {
      name: "정원사",
      role: "Gardener",
      src: `${R}/characters/gardener.webp`,
      aspect: 213 / 706,
      height: 1.72,
      at: [-0.4, -1.4],
      line: "온실 밖으로 이어진 길들이에요. 천천히 둘러보세요."
    }
  },
  {
    id: "gallery",
    name: "갤러리",
    nameEn: "Picture Gallery",
    menu: "photo",
    grid: [2, 2],
    size: { w: 6, d: 16, h: 6 },
    palette: { main: "#7A1F2B", second: "#C2A15A", trim: "#C2A15A" },
    floor: "encaustic",
    walls: "redDamask",
    ceiling: "barrelVault",
    light: { color: "#ffe6c0", intensity: 26, at: [0, 4.6, 0], distance: 18 },
    ambient: { sky: "#f0dcc0", ground: "#2a1012", intensity: 0.5 },
    fog: { color: "#1c0e0e", near: 10, far: 26 },
    exposure: 1.2,
    camera: { pos: [1.7, 1.62, -7.0], look: [-0.7, 1.75, 1.8] },
    doors: [
      { wall: "N", to: "hall" },
      { wall: "S", to: "hall", plaque: "현관" }
    ],
    doorStyle: { wood: "ebony", surround: "stone", head: "segmental" },
    windows: [],
    daylight: "#ffe6c0",
    props: [
      { kind: "runner", at: [0, 0], opts: { w: 1.5, d: 14.4 } },
      { kind: "bust", at: [1.9, -1.6] },
      { kind: "vitrine", at: [0, 2.8], rot: 90, opts: { item: "vase", title: "청화 백자 항아리", sub: "Blue-and-white vase · 18th c.", wide: true } },
      { kind: "bench", at: [0, -2.8], rot: 90 },
      { kind: "chandelier", at: [0, -3.4], opts: { y: 4.6, size: 0.7 } },
      { kind: "chandelier", at: [0, 3.6], opts: { y: 4.6, size: 0.7 } }
    ],
    paintings: [
      { src: "", wall: "W", offset: 5.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 0 },
      { src: "", wall: "W", offset: 2.6, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 1 },
      {
        src: `${R}/paintings/temeraire.webp`, wall: "W", offset: -0.4, y: 2.15, h: 1.3, aspect: 768 / 570,
        title: "The Fighting Temeraire", artist: "J. M. W. Turner", date: "1839", credit: PD
      },
      { src: "", wall: "W", offset: -3.4, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 2 },
      { src: "", wall: "W", offset: -6.0, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 3 },
      {
        src: `${R}/paintings/airpump.webp`, wall: "E", offset: -4.6, y: 2.15, h: 1.3, aspect: 768 / 575,
        title: "An Experiment on a Bird in the Air Pump", artist: "Joseph Wright of Derby", date: "1768", credit: PD
      },
      { src: "", wall: "E", offset: -1.6, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 4 },
      { src: "", wall: "E", offset: 1.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 5 },
      { src: "", wall: "E", offset: 4.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 6 }
    ],
    character: {
      name: "큐레이터",
      role: "Curator",
      src: `${R}/characters/curator.webp`,
      aspect: 318 / 707,
      height: 1.76,
      at: [-1.0, -2.6],
      line: "이쪽 액자부터 보시지요. 홍길동 님도 즐겨 보시는 작품들입니다."
    }
  },
  {
    id: "secret",
    name: "비밀의 방",
    nameEn: "Hidden Cabinet",
    menu: "secret",
    grid: [0, 0],
    hidden: true,
    size: { w: 8, d: 8, h: 4.2 },
    palette: { main: "#4B2340", second: "#C2A15A", trim: "#C2A15A" },
    floor: "walnutBoards",
    walls: "plumVelvet",
    ceiling: "starCove",
    light: { color: "#FFD8A0", intensity: 18, at: [-0.4, 2.6, -1.0], distance: 12 },
    ambient: { sky: "#f0d8e8", ground: "#2a1426", intensity: 0.7 },
    fog: { color: "#1e0e1a", near: 9, far: 24 },
    exposure: 1.16,
    camera: { pos: [2.5, 1.6, 3.0], look: [-0.8, 1.5, -1.6] },
    doors: [{ wall: "S", to: "library", secret: true, plaque: "서재" }],
    doorStyle: { wood: "walnut", surround: "wood", head: "cornice" },
    windows: [{ wall: "W", offset: -1.4, w: 1.2, h: 2.2, sill: 0.9 }],
    daylight: "#e8d0ff",
    props: [
      { kind: "marbleFireplace", at: [0, -3.82] },
      { kind: "bookshelves", at: [3.75, 0.3], rot: -90, opts: { len: 6.6, gap: 0 } },
      { kind: "chesterfield", at: [-2.3, -0.5], rot: 90, opts: { color: "#5a2348" } },
      { kind: "teaTable", at: [-0.9, -0.5] },
      { kind: "chaise", at: [1.9, -2.2], rot: -130 },
      { kind: "vitrine", at: [-2.9, -2.9], rot: 35, opts: { item: "crown", title: "왕관과 별 목걸이", sub: "제타의 보물 · Crown & Star" } },
      { kind: "candlestick", at: [-0.9, -0.5], opts: { y: 0.5 } },
      { kind: "crystalChandelier", at: [0, -0.6], opts: { y: 3.3 } },
      { kind: "rug", at: [-0.6, -0.6], opts: { w: 4.4, d: 3.2, style: "gul" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/carolinehoward.webp`, wall: "N", offset: 0, y: 2.55, h: 1.1, aspect: 608 / 768,
        title: "Lady Caroline Howard", artist: "Joshua Reynolds", date: "1778",
        credit: "CC0 · National Gallery of Art"
      }
    ],
    character: {
      name: "제타",
      role: "Keeper of the hidden study",
      src: `${R}/characters/zeta.webp`,
      expressions: {
        default: `${R}/characters/zeta-tease.webp`,
        wink: `${R}/characters/zeta-wink.webp`,
        surprised: `${R}/characters/zeta-surprised.webp`,
        tease: `${R}/characters/zeta-tease.webp`
      },
      tapExpression: "wink",
      aspect: 325 / 703,
      height: 1.66,
      at: [0.5, -1.3],
      enterLine: "찾았네? 여긴 제타의 비밀 서재야",
      line: "책장 뒤에서 차 한 잔 할래? 홍길동 님한텐 비밀이야."
    }
  }
];

export const ROOM_BY_ID: Record<string, Room> = Object.fromEntries(ROOMS.map(r => [r.id, r]));

/* 미니맵 칸 수 */
export const PLAN_COLS = 5;
export const PLAN_ROWS = 4;

/* 미니맵 맨 아래의 현관 표시 칸 */
export const ENTRANCE_CELL: [number, number] = [2, 3];

/* 방 정지 화면(reduced-motion, WebGL 없음). 3D 장면을 찍어 둔 그림입니다. */
export const stillFor = (id: string) => `${R}/stills/${id}.webp`;
