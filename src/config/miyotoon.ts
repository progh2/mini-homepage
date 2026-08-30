/* 연재물 회차 목록입니다. 이미지는 public/assets/miyotoon 에 있습니다. */
/* title 은 비워 두면 화 번호만 보입니다. 원하는 제목을 채워 넣으세요. */

export type Episode = {
  id: string;
  label: string;
  title: string;
  thumb: string;
  cuts: string[];
};

export const episodes: Episode[] = [];
