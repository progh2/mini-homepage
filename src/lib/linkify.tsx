import { Fragment, type ReactNode } from "react";
import { mentionLinkBase } from "@/config/linktree";

/* 글 안의 주소를 링크로 바꿉니다.

   프로필 소개 글은 주인장이 화면에서 자유롭게 적습니다. 거기 적은 주소가
   그냥 글자로만 남으면 누를 수가 없습니다. http 를 안 붙이고 적는 편이
   읽기 좋으므로 도메인처럼 보이는 것도 링크로 만듭니다.

   @아이디는 linktree.ts 의 mentionLinkBase 가 가리키는 곳으로 보냅니다.
   영문 아이디만입니다. 한글 아이디는 조사가 붙어 어디까지가 아이디인지
   알 수 없고(@평온나날로 처럼), 다른 서비스의 아이디일 수도 있습니다.

   메일 주소의 도메인만 링크가 되는 일이 없도록, 앞에 @ 나 글자가 붙어
   있으면 지나칩니다. */
const URL_PATTERN =
  /(https?:\/\/[^\s<>()]+|(?<![@\w.-])(?:[\w-]+\.)+(?:com|net|org|io|kr|dev|app|school|me|co)(?:\/[^\s<>()]*)?|(?<![\w.@-])@[A-Za-z0-9._]{2,30}\b)/gu;

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
    const mention = link.startsWith("@");
    if (link && (!mention || mentionLinkBase)) {
      const href = mention
        ? `${mentionLinkBase}${link.slice(1)}`
        : link.startsWith("http")
          ? link
          : `https://${link}`;
      out.push(
        <a key={`l${key++}`} href={href} target="_blank" rel="noopener noreferrer">
          {link}
        </a>
      );
    } else if (link) {
      out.push(<Fragment key={`p${key++}`}>{link}</Fragment>);
    }
    if (tail) out.push(<Fragment key={`t${key++}`}>{tail}</Fragment>);
    last = start + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
