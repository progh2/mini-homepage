"use client";

import { useState } from "react";
import { isOwner, saveProfile, type ProfileOverride, type SignedInUser } from "@/lib/firebase";
import { type SkinName } from "@/config/theme";
import { previewSkinName, toSettings } from "@/lib/skin";

/* 주인장만 보는 홈피 설정입니다. 고른 결과는 모든 방문자에게 적용됩니다.

   주인장이 아니면 아무것도 그리지 않습니다. 화면에서 숨기는 것만으로는
   페이지 소스에 남아 "여기 설정이 있구나" 가 보입니다. 어차피 쓰기는
   firestore.rules 가 막지만, 없는 편이 깔끔합니다.

   저장은 누르는 즉시 합니다. 고르는 칸이 둘뿐이라 저장 버튼을 따로 두면
   누르는 수만 늘어납니다. */

const SKIN_CHOICES: { value: SkinName; label: string; hint: string }[] = [
  { value: "classic", label: "클래식", hint: "하늘색 다이어리. 처음 모습입니다." },
  { value: "neon", label: "네온", hint: "사이버 콘솔. 탭이 3D 로 돕니다." }
];

export default function SiteSettings({
  viewer,
  over
}: {
  viewer: SignedInUser | null;
  over: ProfileOverride;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  if (!isOwner(viewer)) return null;

  /* 화면에 보이는 값은 저장된 값입니다. 미리보기(?skin=)로 다르게 보고
     있더라도 여기서는 진짜 저장된 것을 보여 줘야 헷갈리지 않습니다. */
  const saved = toSettings(over);
  const preview = previewSkinName();

  const apply = async (patch: ProfileOverride) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      /* over 를 함께 넘겨야 같은 문서에 있는 소개 글이 살아남습니다. */
      await saveProfile(patch, over);
      setMessage({ text: "저장했어요.", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "저장하지 못했어요.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cy-content-box">
      <div className="cy-section-title">
        홈피 설정
        <span className="cy-sub-text">주인장만 보여요</span>
      </div>

      <fieldset className="cy-settings-group" disabled={busy}>
        <legend className="cy-settings-legend">스킨</legend>
        {SKIN_CHOICES.map(choice => (
          <label key={choice.value} className="cy-settings-choice">
            <input
              type="radio"
              name="cy-skin"
              value={choice.value}
              checked={saved.skin === choice.value}
              onChange={() => apply({ skin: choice.value })}
            />
            <span className="cy-settings-choice-label">{choice.label}</span>
            <span className="cy-settings-hint">{choice.hint}</span>
          </label>
        ))}
        {preview && preview !== saved.skin ? (
          <p className="cy-settings-note">
            지금 주소의 ?skin={preview} 으로 미리보는 중입니다. 저장된 값은 그대로예요.
          </p>
        ) : null}
      </fieldset>

      <div className="cy-settings-group">
        <span className="cy-settings-legend">랜딩(인트로)</span>
        <div className="cy-settings-choice">
          {/* checkbox 가 아니라 switch 입니다. 켜고 끄는 것이지 목록에서
              고르는 것이 아니라는 뜻이 스크린리더에 그대로 전해집니다. */}
          <button
            type="button"
            role="switch"
            aria-checked={saved.skipIntro}
            className={`cy-switch${saved.skipIntro ? " is-on" : ""}`}
            disabled={busy}
            onClick={() => apply({ skipIntro: !saved.skipIntro })}
          >
            <span className="cy-switch-knob" />
          </button>
          <span className="cy-settings-choice-label">랜딩 없이 바로 입장</span>
          <span className="cy-settings-hint">
            켜면 소용돌이 첫 화면을 건너뛰고 바로 미니홈피가 열립니다.
          </span>
        </div>
      </div>

      {message ? (
        <span className={`cy-gb-message${message.error ? " is-error" : ""}`}>{message.text}</span>
      ) : null}
    </div>
  );
}
