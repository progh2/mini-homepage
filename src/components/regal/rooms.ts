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
  | "candlestick"
  /* 1880~90년대 조명: 가스 샹들리에(가솔리어), 초기 전기 샹들리에(일렉트롤리어),
     칠보 꽃병에 꽂은 스완 전구(크래그사이드 서재, 1880). opts: y, size, arms */
  | "gasolier" | "electrolier" | "vaseLamp"
  /* 현관 가구: 거울과 옷걸이가 달린 홀 스탠드, 주철 우산꽂이 */
  | "hallStand" | "umbrellaStand"
  /* 에스테틱 운동 흑단 칠 가구(고드윈풍) + 청화 자기 */
  | "aestheticCabinet"
  /* 온실: 엽란, 마졸리카 화분, 화분 선반, 벤트우드 의자 */
  | "aspidistra" | "plantStaging" | "bentwoodChair";

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
  /* 살롱식으로 빽빽이 거는 그림: 그림등과 설명표 없이 액자만 */
  bare?: boolean;
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
  /* gothic: 뾰족 아치 + 스테인드글라스, transom: 네모 스테인드글라스 채광창 */
  head: "pediment" | "segmental" | "fanlight" | "cornice" | "gothic" | "transom";
};

export type FloorKind = "opusMosaic" | "oakBoards" | "herringbone" | "versailles" | "cubeParquet" | "terracotta" | "encaustic" | "walnutBoards" | "minton";
export type WallKind = "panelledStone" | "chintz" | "velvet" | "damask" | "redDamask" | "wedgwood" | "glass" | "plumVelvet"
  /* morris: 아래는 링크러스타(돋을무늬 벽지) 징두리, 가운데는 paper 의 모리스 벽지, 위는 프리즈.
     hallOak: 참나무 판벽 + 스텐실 벽. oakLibrary: 참나무 판벽 + 돋을 가죽 벽지 */
  | "morris" | "hallOak" | "oakLibrary";
export type CeilingKind = "coffered" | "coved" | "cofferedWood" | "saucerDome" | "ovalDome" | "barrelVault" | "glassDome" | "starCove"
  /* papered: 평천장 + 아나글립타풍 돋을 벽지 + 석고 장미. roundel: 가운데 금박 원판 속 천장화(레이턴 하우스 응접실).
     glassCurve: 큐 팜하우스식 주철 늑재 곡면 유리 지붕 */
  | "papered" | "roundel" | "glassCurve";

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
  /* walls 가 morris 일 때 쓰는 벽지 파일(tex 폴더) */
  paper?: string;
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
    /* 민턴 상감 타일 바닥, 참나무 판벽 + 스텐실 벽, 참나무 격자 천장(틴츠필드 대홀) */
    floor: "minton",
    walls: "hallOak",
    ceiling: "cofferedWood",
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
    doorStyle: { wood: "oak", surround: "wood", head: "gothic" },
    windows: [],
    daylight: "#fff1d8",
    props: [
      { kind: "twinStair", at: [0, -4.6] },
      { kind: "gasolier", at: [0, -0.5], opts: { y: 5.4, size: 1.5, arms: 6 } },
      { kind: "crest", at: [0, -5.96], opts: { y: 6.15 } },
      { kind: "longcaseClock", at: [-5.62, 3.4], rot: 90 },
      { kind: "bust", at: [-0.95, -2.9] },
      { kind: "bust", at: [0.95, -2.9] },
      { kind: "niche", at: [5.96, 2.6], rot: -90 },
      { kind: "hallStand", at: [-5.72, -2.2], rot: 90 },
      { kind: "umbrellaStand", at: [-5.64, -3.2], rot: 90 },
      { kind: "vitrine", at: [-3.3, 2.5], rot: 55, opts: { item: "keys", title: "대저택 열쇠 꾸러미", sub: "Keys of the House · c. 1840" } },
      { kind: "sconce", at: [-5.97, 2.1], rot: 90, opts: { y: 2.75, gas: true } },
      { kind: "sconce", at: [-5.97, 5.3], rot: 90, opts: { y: 2.75, gas: true } },
      { kind: "sconce", at: [5.97, -1.9], rot: -90, opts: { y: 2.75, gas: true } },
      { kind: "sconce", at: [5.97, 4.6], rot: -90, opts: { y: 2.75, gas: true } },
      { kind: "rug", at: [0.4, 1.4], opts: { w: 3.4, d: 2.3, style: "persian" } }
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
    /* 아침방(모닝룸): 모리스 핌퍼넬(1876) 벽지, 링크러스타 징두리, 돋을 벽지 평천장 */
    floor: "oakBoards",
    walls: "morris",
    paper: "morris_pimpernel.webp",
    ceiling: "papered",
    light: { color: "#FFF4DD", intensity: 34, at: [-1.6, 3.6, -2.2], distance: 16 },
    ambient: { sky: "#fff6e4", ground: "#6e5a44", intensity: 1.05 },
    fog: { color: "#d9d4c4", near: 12, far: 30 },
    exposure: 1.08,
    camera: { pos: [4.1, 1.6, 2.4], look: [-1.8, 1.5, -1.5] },
    doors: [
      { wall: "E", to: "hall" },
      { wall: "W", to: "library" }
    ],
    doorStyle: { wood: "oak", surround: "wood", head: "transom" },
    windows: [
      { wall: "N", offset: -3.4, w: 1.4, h: 2.7, sill: 0.7 },
      { wall: "N", offset: 3.0, w: 1.4, h: 2.7, sill: 0.7 }
    ],
    daylight: "#FFF4DD",
    props: [
      { kind: "smallDesk", at: [1.4, -3.4] },
      { kind: "windowChair", at: [-3.4, -3.1], rot: 20 },
      { kind: "aestheticCabinet", at: [-4.72, 2.45], rot: 90 },
      { kind: "vitrine", at: [-3.7, 0.4], rot: 75, opts: { item: "album", title: "명함 앨범과 봉랍 도장", sub: "Calling-card album · 홍길동 기증" } },
      { kind: "sconce", at: [-1.55, -3.97], rot: 0, opts: { y: 2.5, gas: true } },
      { kind: "sconce", at: [1.15, -3.97], rot: 0, opts: { y: 2.5, gas: true } },
      { kind: "gasolier", at: [-0.5, -0.4], opts: { y: 3.55, size: 0.85, arms: 3 } },
      { kind: "rug", at: [-0.5, -0.4], opts: { w: 4.6, d: 3.4, style: "aubusson-sage" } }
    ],
    paintings: [
      {
        src: "", wall: "N", offset: -0.2, y: 2.4, h: 1.45, aspect: 0.8, owner: true,
        title: "", artist: "", date: "", credit: ""
      },
      {
        src: `${R}/paintings/blueboy.webp`, wall: "W", offset: -2.5, y: 2.95, h: 1.3, aspect: 523 / 768,
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
      aspect: 282 / 707,
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
    /* 참나무 판벽 서재(틴츠필드), 고딕 책장, 스완 전구 조명(크래그사이드 1880) */
    floor: "herringbone",
    walls: "oakLibrary",
    ceiling: "cofferedWood",
    light: { color: "#FFD6A8", intensity: 34, at: [0.6, 2.25, -1.2], distance: 16 },
    ambient: { sky: "#f0d4ac", ground: "#3a2a1c", intensity: 1.0 },
    fog: { color: "#1a140e", near: 12, far: 30 },
    exposure: 1.3,
    camera: { pos: [4.1, 1.55, 2.3], look: [-1.8, 1.35, -1.4] },
    doors: [
      { wall: "E", to: "reception" },
      { wall: "W", to: "secret", secret: true, offset: 1.0 }
    ],
    doorStyle: { wood: "walnut", surround: "wood", head: "segmental" },
    windows: [],
    daylight: "#ffc98a",
    props: [
      { kind: "bookshelves", at: [0, -3.75], opts: { len: 9.6, gap: 1.7, gothic: true } },
      { kind: "bookshelves", at: [-4.75, 0.3], rot: 90, opts: { len: 7.0, gap: 0, secretAt: 1.0, gothic: true } },
      { kind: "vaseLamp", at: [-0.62, -3.75], opts: { y: 0.94 } },
      { kind: "vaseLamp", at: [0.62, -3.75], opts: { y: 0.94 } },
      { kind: "secretShelf", at: [-4.75, -0.7], rot: 90 },
      { kind: "ladder", at: [-2.4, -3.3] },
      { kind: "wingback", at: [-2.6, 0.9], rot: 125 },
      { kind: "libraryDesk", at: [1.4, -2.7] },
      { kind: "candlestick", at: [0.75, -2.85], opts: { y: 0.81 } },
      { kind: "globe", at: [-3.6, -1.6] },
      { kind: "vitrine", at: [-2.4, -2.0], rot: 35, opts: { item: "manuscript", title: "채색 필사본", sub: "Illuminated manuscript · 15th c." } },
      { kind: "electrolier", at: [0.2, -0.4], opts: { y: 2.75, size: 0.75 } },
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
      aspect: 227 / 706,
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
    /* 응접실: 모리스 '핑크 앤 로즈'(c.1890), 금박 링크러스타 징두리, 레이턴 하우스식 금박 원판 천장화 */
    floor: "versailles",
    walls: "morris",
    paper: "morris_pinkrose.webp",
    ceiling: "roundel",
    light: { color: "#FFB070", intensity: 22, at: [0, 0.6, -3.4], distance: 12 },
    ambient: { sky: "#ffe8d8", ground: "#5a3a34", intensity: 0.95 },
    fog: { color: "#3a2626", near: 11, far: 28 },
    exposure: 1.1,
    camera: { pos: [-4.1, 1.6, 2.4], look: [1.6, 1.3, -1.4] },
    doors: [
      { wall: "W", to: "hall" },
      { wall: "E", to: "music" }
    ],
    doorStyle: { wood: "ebony", surround: "wood", head: "transom" },
    windows: [
      { wall: "N", offset: -3.2, w: 1.3, h: 2.6, sill: 0.75 },
      { wall: "N", offset: 3.2, w: 1.3, h: 2.6, sill: 0.75 }
    ],
    daylight: "#fff0dc",
    props: [
      { kind: "marbleFireplace", at: [0, -3.82], opts: { overmantel: true, tiles: "demorgan" } },
      { kind: "gasolier", at: [0.4, -0.2], opts: { y: 3.6, size: 1.0, arms: 5, crystal: true } },
      { kind: "chesterfield", at: [1.7, -0.7], rot: -57 },
      { kind: "teaTrolley", at: [0.3, 0.1], rot: 30 },
      { kind: "guestbookStand", at: [3.6, 1.8], rot: -60 },
      { kind: "vitrine", at: [3.4, -2.8], rot: -40, opts: { item: "teaset", title: "애프터눈 티 찻잔 한 벌", sub: "Bone china tea service · c. 1885" } },
      { kind: "sconce", at: [-1.75, -3.97], rot: 0, opts: { y: 2.25, gas: true } },
      { kind: "sconce", at: [1.75, -3.97], rot: 0, opts: { y: 2.25, gas: true } },
      { kind: "sconce", at: [4.97, 0.9], rot: -90, opts: { y: 2.3, gas: true } },
      { kind: "rug", at: [0.4, -0.8], opts: { w: 4.8, d: 3.6, style: "aubusson-rose" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/haywain.webp`, wall: "N", offset: 0, y: 3.5, h: 0.85, aspect: 768 / 530, bare: true,
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
      aspect: 263 / 707,
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
    /* 음악실: 모리스 '윌로 바우'(1887), 링크러스타 징두리, 돋을 벽지 평천장 */
    floor: "cubeParquet",
    walls: "morris",
    paper: "morris_willowbough.webp",
    ceiling: "papered",
    light: { color: "#FFE8C4", intensity: 30, at: [2.6, 3.4, 1.2], distance: 16 },
    ambient: { sky: "#fff0dc", ground: "#5c4a3a", intensity: 0.95 },
    fog: { color: "#c8bca8", near: 12, far: 30 },
    exposure: 1.06,
    camera: { pos: [-4.1, 1.6, 2.4], look: [1.8, 1.25, -1.4] },
    doors: [{ wall: "W", to: "drawing" }],
    doorStyle: { wood: "walnut", surround: "wood", head: "gothic" },
    windows: [
      { wall: "E", offset: -1.4, w: 1.5, h: 3.0, sill: 0.6 },
      { wall: "E", offset: 1.8, w: 1.5, h: 3.0, sill: 0.6 }
    ],
    daylight: "#ffd9a8",
    props: [
      { kind: "grandPiano", at: [1.5, -0.7], rot: -140 },
      { kind: "harp", at: [3.7, -2.7], rot: -40 },
      { kind: "gramophone", at: [-2.4, -3.3] },
      { kind: "musicStand", at: [0.9, 1.5], rot: -30 },
      { kind: "vitrine", at: [-3.1, -1.2], rot: 60, opts: { item: "violin", title: "바이올린", sub: "Violin · London, c. 1760" } },
      { kind: "gasolier", at: [0.4, -0.4], opts: { y: 3.75, size: 0.95, arms: 4 } },
      { kind: "sconce", at: [1.0, -3.97], rot: 0, opts: { y: 2.5, gas: true } },
      { kind: "sconce", at: [3.4, -3.97], rot: 0, opts: { y: 2.5, gas: true } },
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
    /* 큐 팜하우스(1844~48)식 주철·유리 온실: 곡면 유리 지붕, 주철 기둥과 늑재, 민턴 타일 바닥 */
    size: { w: 8, d: 10, h: 5.4 },
    palette: { main: "#F2F2EE", second: "#4F7A4A", trim: "#FFFFFF" },
    floor: "minton",
    walls: "glass",
    ceiling: "glassCurve",
    light: { color: "#FFFFFF", intensity: 3.2, at: [3, 9, 4], distance: 0 },
    ambient: { sky: "#eef6ff", ground: "#6a5a40", intensity: 1.35 },
    fog: { color: "#e6efe8", near: 12, far: 34 },
    exposure: 1.0,
    camera: { pos: [2.3, 1.6, 4.3], look: [-1.0, 1.7, -2.2] },
    doors: [{ wall: "S", to: "hall" }],
    doorStyle: { wood: "oak", surround: "iron", head: "transom" },
    windows: [],
    daylight: "#ffffff",
    props: [
      { kind: "glassHouse", at: [0, 0] },
      { kind: "pottedPalm", at: [-2.75, -3.75], scale: 1.45, opts: { pot: "majolica" } },
      { kind: "pottedPalm", at: [2.85, -3.8], scale: 1.15, opts: { pot: "majolica" } },
      { kind: "pottedPalm", at: [-3.05, 2.6], scale: 0.95, opts: { pot: "terracotta" } },
      { kind: "aspidistra", at: [-1.15, -4.15] },
      { kind: "aspidistra", at: [3.25, 1.9], opts: { pot: "majolica" } },
      { kind: "fern", at: [0.9, -4.15] },
      { kind: "fern", at: [-3.35, 4.1] },
      { kind: "pottedPalm", at: [3.0, 4.0], scale: 1.05, opts: { pot: "majolica" } },
      { kind: "aspidistra", at: [-3.3, -2.2], opts: { pot: "terracotta" } },
      { kind: "plantStaging", at: [3.42, -1.2], rot: -90 },
      { kind: "bentwoodChair", at: [-2.6, -0.95], rot: 70 },
      { kind: "bentwoodChair", at: [-2.45, 0.75], rot: 120 },
      { kind: "sideTable", at: [-3.05, -0.1] },
      { kind: "candlestick", at: [-3.05, -0.1], opts: { y: 0.68, lantern: true } },
      { kind: "vitrine", at: [1.5, -2.5], rot: -20, opts: { item: "fern", title: "워디언 케이스의 고사리", sub: "Wardian case · c. 1850" } }
    ],
    paintings: [],
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
    /* 벽을 높여(액자 걸 벽 5.6m) 살롱식으로 액자를 맞대어 겁니다. */
    size: { w: 6, d: 16, h: 8.6 },
    palette: { main: "#7A1F2B", second: "#C2A15A", trim: "#C2A15A" },
    floor: "encaustic",
    walls: "redDamask",
    ceiling: "barrelVault",
    light: { color: "#ffe6c0", intensity: 34, at: [0, 4.4, 0], distance: 20 },
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
      { kind: "gasolier", at: [0, -3.4], opts: { y: 4.5, size: 0.9, arms: 4 } },
      { kind: "gasolier", at: [0, 3.6], opts: { y: 4.5, size: 0.9, arms: 4 } }
    ],
    paintings: [
      { src: "", wall: "W", offset: 5.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 0 },
      { src: "", wall: "W", offset: 2.6, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 1 },
      {
        src: `${R}/paintings/temeraire.webp`, wall: "W", offset: -0.4, y: 1.95, h: 1.2, aspect: 768 / 570,
        title: "The Fighting Temeraire", artist: "J. M. W. Turner", date: "1839", credit: PD
      },
      { src: "", wall: "W", offset: -3.4, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 2 },
      { src: "", wall: "W", offset: -6.0, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 3 },
      {
        src: `${R}/paintings/airpump.webp`, wall: "E", offset: -4.6, y: 1.95, h: 1.2, aspect: 768 / 575,
        title: "An Experiment on a Bird in the Air Pump", artist: "Joseph Wright of Derby", date: "1768", credit: PD
      },
      { src: "", wall: "E", offset: -1.6, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 4 },
      { src: "", wall: "E", offset: 1.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 5 },
      { src: "", wall: "E", offset: 4.2, y: 1.9, h: 1.0, aspect: 1, title: "", artist: "", date: "", credit: "", album: 6 },
      /* 살롱식 걸기(1881 왕립 아카데미 전시 풍경처럼 액자를 맞대어): 모두 퍼블릭 도메인 */
      { src: `${R}/paintings/flamingjune.webp`, wall: "W", offset: -6.27, y: 3.87, h: 1.78, aspect: 0.9980, title: "Flaming June", artist: "Frederic Leighton", date: "1895", credit: PD, bare: true },
      { src: `${R}/paintings/carnation.webp`, wall: "W", offset: -4.20, y: 3.87, h: 1.78, aspect: 0.8848, title: "Carnation, Lily, Lily, Rose", artist: "John Singer Sargent", date: "1885–86", credit: PD, bare: true },
      { src: `${R}/paintings/agnew.webp`, wall: "W", offset: -2.31, y: 3.87, h: 1.78, aspect: 0.7871, title: "Lady Agnew of Lochnaw", artist: "John Singer Sargent", date: "1892", credit: PD, bare: true },
      { src: `${R}/paintings/battersea.webp`, wall: "W", offset: -0.54, y: 3.87, h: 1.78, aspect: 0.7578, title: "Nocturne: Blue and Gold – Old Battersea Bridge", artist: "James McNeill Whistler", date: "c. 1872–75", credit: PD, bare: true },
      { src: `${R}/paintings/ophelia.webp`, wall: "W", offset: 1.20, y: 4.40, h: 0.80, aspect: 1.7595, title: "Ophelia", artist: "John Everett Millais", date: "1851–52", credit: PD, bare: true },
      { src: `${R}/paintings/hush.webp`, wall: "W", offset: 1.20, y: 3.34, h: 0.80, aspect: 1.4066, title: "Hush! (The Concert)", artist: "James Tissot", date: "c. 1875", credit: PD, bare: true },
      { src: `${R}/paintings/lightworld.webp`, wall: "W", offset: 2.77, y: 3.87, h: 1.78, aspect: 0.5723, title: "The Light of the World", artist: "William Holman Hunt", date: "1851–53", credit: PD, bare: true },
      { src: `${R}/paintings/symphonywhite.webp`, wall: "W", offset: 4.12, y: 3.87, h: 1.78, aspect: 0.4980, title: "Symphony in White, No. 1", artist: "James McNeill Whistler", date: "1862", credit: PD, bare: true },
      { src: `${R}/paintings/heliogabalus.webp`, wall: "W", offset: 5.57, y: 4.40, h: 0.80, aspect: 1.6254, title: "The Roses of Heliogabalus", artist: "Lawrence Alma-Tadema", date: "1888", credit: PD, bare: true },
      { src: `${R}/paintings/liverpoolquay.webp`, wall: "W", offset: 5.57, y: 3.34, h: 0.80, aspect: 1.5015, title: "Liverpool Quay by Moonlight", artist: "John Atkinson Grimshaw", date: "1887", credit: PD, bare: true },
      { src: `${R}/paintings/psyche.webp`, wall: "W", offset: 6.87, y: 3.87, h: 1.78, aspect: 0.3281, title: "The Bath of Psyche", artist: "Frederic Leighton", date: "1890", credit: PD, bare: true },
      { src: `${R}/paintings/midsummer.webp`, wall: "E", offset: -6.32, y: 3.87, h: 1.78, aspect: 0.9434, title: "Midsummer", artist: "Albert Moore", date: "1887", credit: PD, bare: true },
      { src: `${R}/paintings/derbyday.webp`, wall: "E", offset: -4.22, y: 4.40, h: 0.80, aspect: 2.2358, title: "The Derby Day", artist: "William Powell Frith", date: "1856–58", credit: PD, bare: true },
      { src: `${R}/paintings/shalott.webp`, wall: "E", offset: -4.22, y: 3.34, h: 0.80, aspect: 1.3028, title: "The Lady of Shalott", artist: "John William Waterhouse", date: "1888", credit: PD, bare: true },
      { src: `${R}/paintings/railway.webp`, wall: "E", offset: -2.19, y: 4.40, h: 0.80, aspect: 2.0317, title: "The Railway Station", artist: "William Powell Frith", date: "1862", credit: PD, bare: true },
      { src: `${R}/paintings/rainsteam.webp`, wall: "E", offset: -2.19, y: 3.34, h: 0.80, aspect: 1.3403, title: "Rain, Steam and Speed", artist: "J. M. W. Turner", date: "1844", credit: PD, bare: true },
      { src: `${R}/paintings/awakening.webp`, wall: "E", offset: -0.37, y: 3.87, h: 1.78, aspect: 0.7207, title: "The Awakening Conscience", artist: "William Holman Hunt", date: "1853", credit: PD, bare: true },
      { src: `${R}/paintings/rose.webp`, wall: "E", offset: 1.29, y: 3.87, h: 1.78, aspect: 0.6940, title: "Rosa centifolia foliacea", artist: "Pierre-Joseph Redouté", date: "1824", credit: PD, bare: true },
      { src: `${R}/paintings/reflections.webp`, wall: "E", offset: 2.94, y: 4.40, h: 0.80, aspect: 1.6842, title: "Reflections on the Thames, Westminster", artist: "John Atkinson Grimshaw", date: "1880", credit: PD, bare: true },
      { src: `${R}/paintings/doctor.webp`, wall: "E", offset: 2.94, y: 3.34, h: 0.80, aspect: 1.4629, title: "The Doctor", artist: "Luke Fildes", date: "1891", credit: PD, bare: true },
      { src: `${R}/paintings/cophetua.webp`, wall: "E", offset: 4.39, y: 3.87, h: 1.78, aspect: 0.4551, title: "King Cophetua and the Beggar Maid", artist: "Edward Burne-Jones", date: "1884", credit: PD, bare: true },
      { src: `${R}/paintings/proserpine.webp`, wall: "E", offset: 5.60, y: 3.87, h: 1.78, aspect: 0.4531, title: "Proserpine", artist: "Dante Gabriel Rossetti", date: "1874", credit: PD, bare: true },
      { src: `${R}/paintings/goldenstairs.webp`, wall: "E", offset: 6.78, y: 3.87, h: 1.78, aspect: 0.4238, title: "The Golden Stairs", artist: "Edward Burne-Jones", date: "1880", credit: PD, bare: true }
    ],
    character: {
      name: "큐레이터",
      role: "Curator",
      src: `${R}/characters/curator.webp`,
      aspect: 320 / 705,
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
      { kind: "marbleFireplace", at: [0, -3.82], opts: { overmantel: true, tiles: "lustre" } },
      { kind: "bookshelves", at: [3.75, 0.3], rot: -90, opts: { len: 6.6, gap: 0 } },
      { kind: "chesterfield", at: [-2.3, -0.5], rot: 90, opts: { color: "#5a2348" } },
      { kind: "teaTable", at: [-0.9, -0.5] },
      { kind: "chaise", at: [1.9, -2.2], rot: -130 },
      { kind: "vitrine", at: [-2.9, -2.9], rot: 35, opts: { item: "crown", title: "왕관과 별 목걸이", sub: "제타의 보물 · Crown & Star" } },
      { kind: "candlestick", at: [-0.9, -0.5], opts: { y: 0.5 } },
      { kind: "gasolier", at: [0, -0.6], opts: { y: 3.25, size: 0.85, arms: 4, crystal: true } },
      { kind: "rug", at: [-0.6, -0.6], opts: { w: 4.4, d: 3.2, style: "gul" } }
    ],
    paintings: [
      {
        src: `${R}/paintings/carolinehoward.webp`, wall: "N", offset: 0, y: 3.06, h: 0.68, aspect: 608 / 768,
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
