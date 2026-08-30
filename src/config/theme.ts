export type PillColor = {
  bg: string;
  fg: string;
};

export type LinkTreeTheme = {
  colors: {
    cream: string;
    ink: string;
    dim: string;
    rose: string;
    brown: string;
    denim: string;
    latte: string;
    border: string;
    scrollTrack: string;
    scrollThumb: string;
    scrollThumbHover: string;
    spiralFront: string;
  };
  pillColors: PillColor[];
};

export const theme: LinkTreeTheme = {
  colors: {
    cream: "#FFFDF5",
    ink: "#2E4057",
    dim: "#7FA8C9",
    rose: "#FFF1B8",
    brown: "#3E7CB1",
    denim: "#A8D0E6",
    latte: "#EAF6FB",
    border: "rgba(62,124,177,0.25)",
    scrollTrack: "rgba(234,246,251,0.5)",
    scrollThumb: "linear-gradient(180deg, rgba(62,124,177,0.68), rgba(168,208,230,0.58))",
    scrollThumbHover: "linear-gradient(180deg, rgba(46,64,87,0.78), rgba(168,208,230,0.74))",
    spiralFront: "#FFC93C"
  },
  pillColors: [
    { bg: "#FFF1B8", fg: "#2E4057" },
    { bg: "#3E7CB1", fg: "#FFFDF5" },
    { bg: "#A8D0E6", fg: "#2E4057" },
    { bg: "#EAF6FB", fg: "#2E4057" }
  ]
};
