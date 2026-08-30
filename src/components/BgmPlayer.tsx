"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { bgmCredit, bgmTracks } from "@/config/linktree";
import { PLAYER_STATE, loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube";

/* 인트로 버튼을 누르는 순간 재생을 시작하려고 부모에게 start 를 넘겨줍니다.
   브라우저는 클릭 같은 사용자 동작 안에서만 소리 나는 재생을 허용합니다. */
export type BgmHandle = { start: () => void };

const DEFAULT_VOLUME = 40;
/* 재생을 걸어 놓고 이만큼 지켜봐도 실제로 재생되지 않으면 막힌 것으로 봅니다.
   버퍼링만 하다 멈추는 경우가 있어서 한 번만 보지 않고 여러 번 확인합니다. */
const BLOCK_CHECK_MS = 900;
const BLOCK_CHECK_TRIES = 6;

/* 초를 3:21 처럼 보여 줍니다. 한 시간이 넘으면 1:02:27 처럼 시까지 붙입니다. */
function clock(seconds: number) {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const tail = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${tail}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function BgmPlayer({ ref }: { ref?: React.Ref<BgmHandle> }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  /* 좁은 화면에서는 유튜브 화면을 실제로 보여 줍니다. 아래 마운트 효과에서 정합니다. */
  const [showStage, setShowStage] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const indexRef = useRef(0);
  /* 플레이어가 준비되기 전에 인트로 버튼을 누른 경우를 기억해 둡니다. */
  const wantsPlayRef = useRef(false);
  const blockTimerRef = useRef<number | null>(null);
  /* 지금 플레이어에 올라가 있는 영상입니다. 같은 영상 안의 곡이면 다시 불러오지 않고 위치만 옮깁니다. */
  const loadedVideoRef = useRef(bgmTracks[0]?.videoId ?? "");

  useEffect(() => {
    if (bgmTracks.length === 0) return;

    let cancelled = false;
    let player: YouTubePlayer | null = null;

    /* 인스타그램 같은 앱 안의 브라우저는 다른 사이트 iframe 안의 영상을
       직접 탭해야만 재생을 허용합니다. 부모 페이지의 버튼은 인정되지 않습니다.
       그래서 좁은 화면에서는 유튜브 화면을 보여 주고 재생 버튼도 켭니다. */
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    setShowStage(narrow);

    loadYouTubeApi()
      .then(api => {
        if (cancelled || !stageRef.current) return;

        player = new api.Player(stageRef.current, {
          videoId: bgmTracks[0].videoId,
          playerVars: {
            controls: narrow ? 1 : 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1
          },
          events: {
            onReady: () => {
              player?.setVolume(DEFAULT_VOLUME);
              if (wantsPlayRef.current) player?.playVideo();
            },
            onStateChange: event => {
              if (event.data === PLAYER_STATE.playing) {
                setPlaying(true);
                setBlocked(false);
              } else if (event.data === PLAYER_STATE.paused) {
                setPlaying(false);
              } else if (event.data === PLAYER_STATE.ended) {
                /* 영상이 끝났습니다. 다음 곡으로 넘어가고, 마지막이면 처음으로 돌아갑니다. */
                const next = (indexRef.current + 1) % bgmTracks.length;
                const track = bgmTracks[next];
                setIndex(next);
                loadedVideoRef.current = track.videoId;
                playerRef.current?.loadVideoById({
                  videoId: track.videoId,
                  startSeconds: track.startAt ?? 0
                });
              }
            },
            onError: event => {
              /* 100/101/150 은 영상이 없거나 임베드가 막힌 경우입니다. 원인을 남겨 둡니다. */
              setErrorCode(event?.data ?? null);
              setFailed(true);
            }
          }
        });

        playerRef.current = player;
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (blockTimerRef.current !== null) window.clearInterval(blockTimerRef.current);
      player?.destroy();
      playerRef.current = null;
    };
  }, []);

  /* 한 영상 안에 여러 곡이 들어 있는 경우, 재생이 흘러가는 대로 현재 곡 표시를 옮깁니다.
     같은 영상의 곡들은 startAt 이 작은 것부터 차례로 적혀 있다고 봅니다. */
  useEffect(() => {
    if (!playing) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const at = player.getCurrentTime();
      let found = -1;
      bgmTracks.forEach((track, i) => {
        if (track.videoId !== loadedVideoRef.current) return;
        if ((track.startAt ?? 0) <= at + 0.5) found = i;
      });
      if (found >= 0) setIndex(current => (current === found ? current : found));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [playing]);

  /* 재생을 건 뒤 실제로 소리가 나는지 확인합니다. iOS 처럼 클릭이 있어도 막는 경우가 있습니다.
     버퍼링은 아직 소리가 나는 상태가 아니므로 성공으로 치지 않습니다. */
  const watchForBlock = useCallback(() => {
    if (blockTimerRef.current !== null) window.clearInterval(blockTimerRef.current);
    let tries = 0;
    blockTimerRef.current = window.setInterval(() => {
      tries += 1;
      if (playerRef.current?.getPlayerState() === PLAYER_STATE.playing) {
        if (blockTimerRef.current !== null) window.clearInterval(blockTimerRef.current);
        blockTimerRef.current = null;
        return;
      }
      if (tries >= BLOCK_CHECK_TRIES) {
        if (blockTimerRef.current !== null) window.clearInterval(blockTimerRef.current);
        blockTimerRef.current = null;
        setBlocked(true);
      }
    }, BLOCK_CHECK_MS);
  }, []);

  const start = useCallback(() => {
    wantsPlayRef.current = true;
    playerRef.current?.playVideo();
    watchForBlock();
  }, [watchForBlock]);

  useImperativeHandle(ref, () => ({ start }), [start]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const toggle = () => {
    const player = playerRef.current;
    if (!player) {
      /* 아직 플레이어가 준비되지 않았습니다. 준비되는 대로 재생하도록 기억해 둡니다. */
      wantsPlayRef.current = true;
      setBlocked(false);
      return;
    }
    if (playing) {
      /* 지켜보던 중에 사용자가 직접 멈춘 것이므로 차단 안내를 띄우지 않습니다. */
      if (blockTimerRef.current !== null) window.clearInterval(blockTimerRef.current);
      blockTimerRef.current = null;
      player.pauseVideo();
    } else {
      setBlocked(false);
      player.playVideo();
      watchForBlock();
    }
  };

  const selectTrack = (next: number) => {
    const track = bgmTracks[next];
    setIndex(next);
    setBlocked(false);

    const player = playerRef.current;
    if (!player) return;

    if (track.videoId === loadedVideoRef.current) {
      /* 같은 영상 안의 곡이면 다시 불러오지 않고 그 지점으로 건너뜁니다. */
      player.seekTo(track.startAt ?? 0, true);
      player.playVideo();
    } else {
      /* 다른 영상이면 곡만 바꿔 끼웁니다. 플레이어를 새로 만들지 않아야 끊기지 않습니다. */
      loadedVideoRef.current = track.videoId;
      player.loadVideoById({ videoId: track.videoId, startSeconds: track.startAt ?? 0 });
    }
    watchForBlock();
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  };

  const changeVolume = (next: number) => {
    setVolume(next);
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(next);
    if (next > 0 && muted) {
      player.unMute();
      setMuted(false);
    }
  };

  if (bgmTracks.length === 0) return null;

  const current = bgmTracks[index];

  return (
    <div className="cy-bgm">
      <div className="cy-bgm-heading">♬ MINI HOMPY BGM</div>

      <ul className="cy-bgm-list">
        {bgmTracks.map((track, i) => (
          <li key={track.id}>
            <button
              type="button"
              className={"cy-bgm-track" + (i === index ? " is-current" : "")}
              onClick={() => selectTrack(i)}
              title={track.artist ? `${track.title} / ${track.artist}` : track.title}
            >
              <span className="cy-bgm-mark">{i === index && playing ? "▶" : ""}</span>
              <span className="cy-bgm-no">{String(i + 1).padStart(2, "0")}.</span>
              <span className="cy-bgm-name">{track.title}</span>
              {track.startAt ? <span className="cy-bgm-time">{clock(track.startAt)}</span> : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="cy-bgm-controls">
        <button type="button" onClick={toggle} aria-label={playing ? "정지" : "재생"}>
          {playing ? "❚❚" : "▶"}
        </button>
        {bgmTracks.length > 1 ? (
          <button
            type="button"
            onClick={() => selectTrack((index + 1) % bgmTracks.length)}
            aria-label="다음곡"
          >
            ▶▶
          </button>
        ) : null}
        <button type="button" onClick={toggleMute} aria-label={muted ? "음소거 해제" : "음소거"}>
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={event => changeVolume(Number(event.target.value))}
          aria-label="볼륨"
        />
      </div>

      {current.artist ? <div className="cy-bgm-artist">{current.artist}</div> : null}
      {bgmCredit ? <div className="cy-bgm-credit">{bgmCredit}</div> : null}

      {failed ? (
        <div className="cy-bgm-note">
          BGM 을 불러오지 못했어요{errorCode !== null ? ` (${errorCode})` : ""}.
        </div>
      ) : blocked ? (
        <div className="cy-bgm-note">재생 버튼을 눌러 주세요.</div>
      ) : null}

      {/* 유튜브가 이 자리를 iframe 으로 바꿉니다.
          넓은 화면에서는 소리만 쓰므로 화면 밖에 두고, 좁은 화면에서는 보여 줍니다. */}
      <div className={"cy-bgm-stage" + (showStage ? " is-shown" : "")}>
        <div ref={stageRef} />
      </div>

      {showStage ? (
        <div className="cy-bgm-hint">앱 안에서 열었다면 위 화면을 눌러 주세요.</div>
      ) : null}
    </div>
  );
}
