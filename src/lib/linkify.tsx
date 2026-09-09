import { Fragment, type ReactNode } from "react";

/* 글 안의 주소를 링크로 바꿉니다.

   프로필 소개 글은 주인장이 화면에서 자유롭게 적습니다. 거기 적은 주소가
   그냥 글자로만 남으면 누를 수가 없습니다. http 를 안 붙이고 적는 편이
   읽기 좋으므로 도메인처럼 보이는 것도 링크로 만듭니다.

   @아이디 같은 것은 건드리지 않습니다. 어느 서비스인지 알 수 없어서
   엉뚱한 곳으로 보내는 것보다 그대로 두는 편이 낫습니다.

   메일 주소의 도메인만 링크가 되는 일이 없도록, 앞에 @ 나 글자가 붙어
   있으면 지나칩니다. */
const URL_PATTERN =
  /(https?:\/\/[^\s<>()]+|(?<![@\w.-])(?:[\w-]+\.)+(?:com|net|org|io|kr|dev|app|school|me|co)(?:\/[^\s<>()]*)?)/gu;

/* 문장 끝의 마침표나 쉼표까지 주소로 빨려 들어가지 않게 잘라 냅니다. */
function trimTail(text: string) {
  const m = /[.,!?;:)\]]+$/.exec(text);
  return m ? { link: text.slice(0, -m[0].length), tail: m[0] } : { link: text, tail: "" };
}

export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of text.matchAll(URL_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));

    const { link, tail } = trimTail(m[0]);
    if (link) {
      const href = link.startsWith("http") ? link : `https://${link}`;
      out.push(
        <a key={`l${key++}`} href={href} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
      );
    }
    if (tail) out.push(<Fragment key={`t${key++}`}>{tail}</Fragment>);
    last = start + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
