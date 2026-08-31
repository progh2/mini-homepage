export const profile = {
  teacherName: "함쌤",
  title: "함쌤 작업실",
  introTitle: "함쌤 작업실",
  introDescription: "미림마이스터고등학교 정보·컴퓨터 교사. 도름스에서 수업·업무용 앱을 만들고 나눕니다.",
  catalogTitle: "함쌤 작업실",
  catalogDescription: "미림마이스터고등학교 정보·컴퓨터 교사",
  /* 왼쪽 프로필 사진입니다. public/assets/ 안에 파일을 넣고 경로를 적으세요. */
  photo: { src: "/assets/profile.webp", alt: "함쌤" },
  /* 홈 탭 위쪽 미니룸 이미지입니다. public/assets/ 안에 파일을 넣고 경로를 적으세요. */
  miniroom: { src: "/assets/miniroom.webp", alt: "함쌤 작업실 미니룸" },
  /* 아래는 탭 이름표입니다. 나만의 이름으로 바꿔도 되고, 안 바꾸면 기본값 그대로 나옵니다. */
  storyLabel: "연재물",
  boardLabel: "게시판",
  boardSubtitle: "앱과 게시글",
  boardEmptyText: "아직 올린 글이 없습니다.",
  photoLabel: "낙서장",
  photoSubtitlePrefix: "사진",
  /* 오른쪽 위, 옛날 싸이월드 주소창을 흉내 낸 문구입니다. */
  displayUrl: "progh2.github.io/mini-homepage"
};

/* 프로필 탭에 들어가는 소개 글입니다. 문구만 바꿔서 쓰세요. */
export type ProfileBlock =
  | { kind: "text"; lines: string[] }
  | { kind: "list"; heading: string; items: string[] }
  | { kind: "contact"; items: { label: string; value: string; href: string }[] };

export type ProfileSection = {
  id: string;
  title: string;
  /* 제목 옆 작은 글씨입니다. 생략하면 제목만 나옵니다. */
  subtitle?: string;
  blocks: ProfileBlock[];
};

export const profileSections: ProfileSection[] = [
  {
    id: "intro",
    title: "소개",
    subtitle: "도름스 @평온나날",
    blocks: [
      {
        kind: "text",
        lines: [
          "미림마이스터고등학교 정보·컴퓨터 교사입니다. 지루한 것에서 벗어나 재미난 것 속으로 풍덩~☆",
          "도름스에서는 교사 인증을 마친 @평온나날로 활동합니다. 서울 · 고등학교 · 정보·컴퓨터."
        ]
      },
      {
        kind: "list",
        heading: "제작한 프로그램",
        items: [
          "깃허브 레포 매니저",
          "기초 통계량 실험실",
          "급식쪽지",
          "직업계고 AI 면접 모의고사 시뮬레이터",
          "급식 식단 업로드 양식 생성기",
          "캣모아",
          "인터넷 랙 줄여주는 팁"
        ]
      },
      {
        kind: "contact",
        items: [
          {
            label: "도름스",
            value: "dorms.school/u/평온나날",
            href: "https://dorms.school/u/17074aa0-a3a8-44f8-b40a-d7c044c5ade6"
          },
          {
            label: "Instagram",
            value: "@gihunham",
            href: "https://www.instagram.com/gihunham/"
          },
          {
            label: "GitHub",
            value: "github.com/progh2",
            href: "https://github.com/progh2"
          }
        ]
      }
    ]
  }
];

/* 연재물 회차는 src/config/miyotoon.ts 에 있습니다. */
export { episodes, type Episode } from "./miyotoon";

/* 게시판 탭입니다. 앱과 게시글 링크를 여기에 추가하세요.
   preview 는 화면 미리보기 이미지입니다. public/assets/apps 에 넣고 경로를 적으세요.
   생략하면 썸네일 없이 제목만 나옵니다. */
export type BoardPost = {
  id: string;
  category: "앱" | "글";
  title: string;
  summary?: string;
  date: string;
  href: string;
  preview?: { src: string; alt: string };
};

export const boardPosts: BoardPost[] = [
  {
    id: "catmoa",
    category: "앱",
    title: "캣모아",
    summary: "교사 일정 수집 고양이. 한글·PDF·스크린샷에서 일정 추출",
    date: "2026-08-29",
    href: "https://progh2.github.io/catmoa/",
    preview: { src: "/assets/apps/catmoa.webp", alt: "캣모아" }
  },
  {
    id: "schoollunchmemo",
    category: "앱",
    title: "급식쪽지",
    summary: "학교 급식·학사일정을 포스트잇처럼 바탕화면에",
    date: "2026-08-27",
    href: "https://progh2.github.io/schoollunchmemo/",
    preview: { src: "/assets/apps/schoollunchmemo.webp", alt: "급식쪽지" }
  },
  {
    id: "stat-lab",
    category: "앱",
    title: "기초 통계량 실험실",
    summary: "숫자로 데이터 읽기",
    date: "2026-08-26",
    href: "https://progh2.github.io/stat-lab/",
    preview: { src: "/assets/apps/stat-lab.webp", alt: "기초 통계량 실험실" }
  },
  {
    id: "meal-converter",
    category: "앱",
    title: "급식 식단 업로드 양식 생성기",
    summary: "서울시교육청 연구정보원 학교 홈페이지 mlsvTmplat",
    date: "2026-08-25",
    href: "https://progh2.github.io/mirim-meal-converter/",
    preview: { src: "/assets/apps/meal-converter.webp", alt: "급식 식단 업로드 양식 생성기" }
  },
  {
    id: "ai-interview",
    category: "앱",
    title: "직업계고 AI 면접 모의고사 시뮬레이터",
    summary: "학과·면접 유형 선택 후 AI 면접관 질문/피드백",
    date: "2026-08-24",
    href: "https://partyrock.aws/u/hamteacher/ksGF_z3I_3/AI",
    preview: { src: "/assets/apps/ai-interview.webp", alt: "직업계고 AI 면접 모의고사 시뮬레이터" }
  },
  {
    id: "internet-lag-tips",
    category: "앱",
    title: "인터넷 랙 줄여주는 팁",
    summary: "클릭 한 번으로 랙 설정 적용 GUI",
    date: "2026-08-24",
    href: "https://github.com/progh2/internet-lag-tips",
    preview: { src: "/assets/apps/internet-lag-tips.webp", alt: "인터넷 랙 줄여주는 팁" }
  },
  {
    id: "repo-manager",
    category: "앱",
    title: "깃허브 레포 매니저",
    summary: "깃허브 저장소 관리 프로그램",
    date: "2026-08-24",
    href: "https://github.com/progh2/repomanager",
    preview: { src: "/assets/apps/repo-manager.webp", alt: "깃허브 레포 매니저" }
  }
];

/* 사진첩 탭입니다. */
export type PhotoItem = {
  id: string;
  name: string;
  src: string;
};

/* 비워 두면 사진 구역이 통째로 사라지고 오에카키만 남습니다. */
export const photos: PhotoItem[] = [];

/* 왼쪽 아래 파도타기 목록입니다.
   고정 규칙: 첫 번째 항목은 반드시 "도름스 커뮤니티 나의 활동" 링크입니다. 지우지 마세요. */
export type WaveLink = {
  id: string;
  label: string;
  href: string;
};

export const waveLinks: WaveLink[] = [
  {
    id: "dorms-activity",
    label: "도름스 커뮤니티 나의 활동",
    href: "https://dorms.school/u/17074aa0-a3a8-44f8-b40a-d7c044c5ade6"
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/gihunham/"
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/progh2"
  },
  {
    id: "meyo-lab",
    label: "미요Lab 미요앱 실험실",
    href: "https://pcallpang.github.io/meyo-lab/"
  }
];

/* 미니홈피 BGM 입니다. 유튜브 영상을 음원으로 씁니다.
   videoId 는 https://www.youtube.com/watch?v=abcd1234XYZ 에서 v= 뒤에 오는 값입니다.
   배열을 비우면 플레이어가 아예 표시되지 않습니다.

   여러 곡이 이어진 플레이리스트 영상이라면, 같은 videoId 를 쓰면서 startAt 에
   각 곡이 시작하는 지점을 초 단위로 적으세요. 제목을 누르면 그 지점부터 재생됩니다.
   startAt 은 secondsAt("3:21") 처럼 적으면 편합니다. */
export type BgmTrack = {
  id: string;
  title: string;
  artist?: string;
  videoId: string;
  /* 영상 안에서 이 곡이 시작하는 지점입니다. 초 단위이고, 생략하면 처음부터입니다. */
  startAt?: number;
};

/* "3:21" 이나 "1:02:30" 을 초로 바꿔 줍니다.

   지우지 마세요. 아래 bgmTracks 에서 startAt 을 적을 때 쓰라고 둔 도구입니다.
   지금 설정이 startAt 을 안 쓸 뿐이라 호출하는 곳이 없어 보이지만, 한 영상에
   여러 곡을 넣는 사람에게는 필요합니다. 쓰는 법:

     { id: "...", title: "...", videoId: "...", startAt: secondsAt("3:21") } */
export function secondsAt(timestamp: string): number {
  return timestamp
    .split(":")
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

/* 플레이어 아래에 작게 붙는 저작권 표기입니다.
   내 음악이거나 표기가 필요 없으면 빈 문자열로 두세요. 줄 자체가 사라집니다. */
export const bgmCredit = "Kevin MacLeod (incompetech.com), CC BY 3.0";

export const bgmTracks: BgmTrack[] = [
  { id: "suonatore-di-liuto", title: "Suonatore di Liuto", artist: "Kevin MacLeod", videoId: "ZffDOCZy_bA" },
  { id: "midnight-tale", title: "Midnight Tale", artist: "Kevin MacLeod", videoId: "qWmfZlw3EFI" },
  { id: "folk-round", title: "Folk Round", artist: "Kevin MacLeod", videoId: "VOwN8oR4Fhg" },
  { id: "village-consort", title: "Village Consort", artist: "Kevin MacLeod", videoId: "-_n0ib4fA0g" },
  { id: "pippin-the-hunchback", title: "Pippin the Hunchback", artist: "Kevin MacLeod", videoId: "W4lM5cBIj6w" }
];

/* 비밀글을 볼 수 있는 주인장의 Firebase 계정 uid 입니다.
   Firebase 콘솔의 Authentication > Users 에서 확인할 수 있습니다.
   비워 두면 비밀글 체크박스가 아예 나오지 않습니다.

   여기 적은 값은 firestore.rules 의 ownerUid() 와 반드시 같아야 합니다.
   화면만 고치고 규칙을 안 고치면 비밀글이 실제로는 공개됩니다. */
export const ownerUid = "hIWd40GYSIgauA0cCOlIea8sOvx1";

/* 왼쪽 위 "TODAY IS.." 에 보여 줄 날씨의 기준 위치입니다.
   Open-Meteo 를 키 없이 쓰므로 좌표만 있으면 됩니다.
   내 동네 좌표는 지도 앱에서 확인하거나 https://open-meteo.com 에서 찾으면 됩니다. */
export type WeatherLocation = {
  latitude: number;
  longitude: number;
  /* IANA 시간대 이름입니다. 하루 경계와 기온 시각을 이 시간대로 맞춥니다. */
  timezone: string;
};

export const weatherLocation: WeatherLocation = {
  latitude: 37.478,
  longitude: 126.936,
  timezone: "Asia/Seoul"
};

/* 이 미니홈피의 기준 시간대입니다. 왼쪽 위 TODAY 방문 수가 이 시간대의
   자정에 0으로 돌아갑니다. IANA 시간대 이름을 적으세요.

   weatherLocation.timezone 과 따로 두는 이유: 날씨는 보고 싶은 곳의 시간대를
   쓰고, 방문 수는 내가 사는 곳의 하루를 따라야 합니다. 서울에 살면서 제주
   날씨를 띄워 두는 경우처럼 둘이 갈릴 수 있습니다. 대개는 같은 값입니다. */
export const siteTimezone = "Asia/Seoul";

/* 홈 탭 아래쪽 한마디입니다. */
export type GuestbookEntry = {
  id: number;
  author: string;
  text: string;
  date: string;
};

export const guestbook: GuestbookEntry[] = [];
