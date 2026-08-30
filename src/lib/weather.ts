/* 서울 미림마이스터고 근처 날씨입니다. Open-Meteo 는 키 없이 브라우저에서 호출할 수 있습니다. */
const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=37.478&longitude=126.936&current=temperature_2m,weather_code&timezone=Asia%2FSeoul";

/* 아직 못 불러왔거나 실패했을 때 쓰는 중립 표시입니다.
   여기서 특정 날씨(예: 맑음)를 기본값으로 두면, 비 오는 날 API 가 죽었을 때
   화면이 거짓 정보를 보여 주게 됩니다. 모르면 모른다고 둡니다. */
export const UNKNOWN_WEATHER = "…";

export type WeatherNow = {
  label: string;
  emoji: string;
  temperature: number | null;
};

/* WMO weather_code 를 싸이월드식 짧은 날씨 말로 바꿉니다.
   목록에 없는 코드면 지어내지 않고 null 을 돌려줍니다. */
export function labelWeatherCode(code: number): { label: string; emoji: string } | null {
  if (code === 0 || code === 1) return { label: "맑음", emoji: "☀️" };
  if (code === 2 || code === 3) return { label: "흐림", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "안개", emoji: "🌫️" };
  if (code >= 51 && code <= 67) return { label: "비", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "눈", emoji: "❄️" };
  if (code >= 80 && code <= 82) return { label: "소나기", emoji: "🌦️" };
  if (code === 85 || code === 86) return { label: "눈", emoji: "❄️" };
  if (code >= 95 && code <= 99) return { label: "뇌우", emoji: "⛈️" };
  return null;
}

export async function fetchSeoulWeather(): Promise<WeatherNow> {
  const response = await fetch(WEATHER_URL);
  if (!response.ok) throw new Error(`날씨를 불러오지 못했어요 (${response.status}).`);

  const data = (await response.json()) as {
    current?: { weather_code?: number; temperature_2m?: number };
  };
  const code = data.current?.weather_code;
  if (typeof code !== "number") throw new Error("날씨 코드가 없습니다.");

  const named = labelWeatherCode(code);
  if (!named) throw new Error(`처음 보는 날씨 코드입니다 (${code}).`);

  const temperature =
    typeof data.current?.temperature_2m === "number" ? data.current.temperature_2m : null;

  return { ...named, temperature };
}

export function formatTodayWeather(weather: WeatherNow) {
  const temp =
    typeof weather.temperature === "number" ? ` ${Math.round(weather.temperature)}°` : "";
  return `${weather.label} ${weather.emoji}${temp}`;
}
