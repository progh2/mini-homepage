# Copilot Instructions

This is a public DoRms community mini-homepage (Cyworld-style) linktree kit, not the DoRms production app. Whoever is asking wants their own site, not the original author's (미요Lab).

If the current folder is still the original template (not yet the user's own copy) and they only gave the source URL, fork it yourself with `gh repo fork https://github.com/Pcallpang/meyo-lab --fork-name <name> --clone --remote` (ask for a name, default `mini-homepage`) instead of asking them to fork manually. Update `package.json`'s `name`/`homepage`/`repository.url` to match.

Before customizing, ask these one at a time in a back-and-forth conversation — not all dumped into a single message. Say once up front that there are 13 questions and unwanted ones can just be answered "skip", then go through them in order, waiting for each answer before asking the next:

Required (site can't work without these):
- Display name
- Intro sentence
- DoRms community activity link (goes into the first entry of the bottom-left "wave" quick-link list)
- Preferred color mood

Optional (skip whichever they don't want, leave the array empty):
- Left-side profile photo and mini-room image (image files, placed under `public/assets/`)
- Profile intro sections (bio text, activity list, contact)
- Board tab — its display name and app/post links with date and optional preview image
- Doodle tab (photo list plus the oekaki drawing board) — its display name and photos. Tab labels wider than four Korean characters overflow the tab button
- Additional "wave" quick-links (beyond the required DoRms one)
- Mini-homepage BGM player (YouTube video id plus per-track start times)
- Seed guestbook entries
- Real guestbook posting and live visit counting via Firebase (the user must create the Firebase project and fill `.env.local`; do not attempt to create Firebase projects or issue keys yourself)

Don't ask about the episode/webtoon tab (`src/config/miyotoon.ts`) — leave `episodes` empty by default (the tab hides itself) unless the user brings it up first.

This repo ships with the original author's real content already filled in (profile, bio, board posts, photos, wave links, BGM, guestbook). Clear all of that out before filling in the user's answers — don't leave it as a fallback.

Keep the bottom-left wave list's first entry as `도름스 커뮤니티 나의 활동`. There is no main link-card list feature in this template — don't rebuild one. Do not add private DoRms service assets, private credentials, API code, auth code, database code, or product-specific images.

Edit `src/config/linktree.ts` and `src/config/theme.ts` (and `src/config/miyotoon.ts` only if the episode tab is used). Run `npm run build` after changes, then push to the user's repo and, once GitHub Pages deploys, tell them the live URL as your final message.
