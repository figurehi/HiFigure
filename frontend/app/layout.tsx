import "./globals.css";
import "svgedit/dist/editor/svgedit.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { ReactNode } from "react";
import { AppShell } from "../components/app-shell";

/**
 * Every face is self-hosted from its Fontsource package rather than fetched
 * through `next/font/google`. Google Fonts is unreachable from parts of the
 * network this runs on, and a failed fetch silently swaps in a system fallback,
 * which flattens the Edit font picker into identical-looking options.
 * Resolving from node_modules keeps builds offline-safe and reproducible.
 */
const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const sourceSerif = localFont({
  src: "../node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
  weight: "200 900",
  style: "normal",
  variable: "--font-serif",
  display: "swap",
});

const plexSans = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
});

const plexSansCondensed = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-condensed",
  display: "swap",
  preload: false,
});

const jetBrainsMono = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  preload: false,
});

const atkinson = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-atkinson",
  display: "swap",
  preload: false,
});

/**
 * Figure typefaces. Every entry in `figureFontReferences` points at one of
 * these, so each option in the Edit font picker renders as a visibly
 * different face. They are never used for chrome, so none of them preload.
 */
const karla = localFont({
  src: [
    { path: "../node_modules/@fontsource/karla/files/karla-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/karla/files/karla-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-karla",
  display: "swap",
  preload: false,
});

const ebGaramond = localFont({
  src: [
    { path: "../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-garamond",
  display: "swap",
  preload: false,
});

const archivoBlack = localFont({
  src: "../node_modules/@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-archivo-black",
  display: "swap",
  preload: false,
});

const libreBaskerville = localFont({
  src: [
    { path: "../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-baskerville",
  display: "swap",
  preload: false,
});

const spaceGrotesk = localFont({
  src: [
    { path: "../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

const barlowCondensed = localFont({
  src: [
    { path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
  preload: false,
});

const lora = localFont({
  src: [
    { path: "../node_modules/@fontsource/lora/files/lora-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/lora/files/lora-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-lora",
  display: "swap",
  preload: false,
});

const robotoCondensed = localFont({
  src: [
    { path: "../node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-roboto-condensed",
  display: "swap",
  preload: false,
});

const publicSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-public-sans",
  display: "swap",
  preload: false,
});

const zillaSlab = localFont({
  src: [
    { path: "../node_modules/@fontsource/zilla-slab/files/zilla-slab-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/zilla-slab/files/zilla-slab-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-zilla-slab",
  display: "swap",
  preload: false,
});

const manrope = localFont({
  src: [
    { path: "../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});

const plexMono = localFont({
  src: [
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

const roboto = localFont({
  src: [
    { path: "../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/roboto/files/roboto-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
  preload: false,
});

const nunitoSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/nunito-sans/files/nunito-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/nunito-sans/files/nunito-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-nunito-sans",
  display: "swap",
  preload: false,
});

const dmSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});

const workSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/work-sans/files/work-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/work-sans/files/work-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-work-sans",
  display: "swap",
  preload: false,
});

const firaSans = localFont({
  src: [
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/fira-sans/files/fira-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fira-sans",
  display: "swap",
  preload: false,
});

const firaCode = localFont({
  src: [
    { path: "../node_modules/@fontsource/fira-code/files/fira-code-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/fira-code/files/fira-code-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fira-code",
  display: "swap",
  preload: false,
});

const merriweather = localFont({
  src: [
    { path: "../node_modules/@fontsource/merriweather/files/merriweather-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/merriweather/files/merriweather-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-merriweather",
  display: "swap",
  preload: false,
});

const crimsonPro = localFont({
  src: [
    { path: "../node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-crimson-pro",
  display: "swap",
  preload: false,
});

const montserrat = localFont({
  src: [
    { path: "../node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
  preload: false,
});

const oswald = localFont({
  src: [
    { path: "../node_modules/@fontsource/oswald/files/oswald-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-oswald",
  display: "swap",
  preload: false,
});

const raleway = localFont({
  src: [
    { path: "../node_modules/@fontsource/raleway/files/raleway-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/raleway/files/raleway-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-raleway",
  display: "swap",
  preload: false,
});

const vollkorn = localFont({
  src: [
    { path: "../node_modules/@fontsource/vollkorn/files/vollkorn-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/vollkorn/files/vollkorn-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vollkorn",
  display: "swap",
  preload: false,
});

const notoSans = localFont({
  src: "../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2",
  variable: "--font-noto-sans",
  display: "swap",
  preload: false,
});

const notoSerif = localFont({
  src: "../node_modules/@fontsource/noto-serif/files/noto-serif-latin-400-normal.woff2",
  variable: "--font-noto-serif",
  display: "swap",
  preload: false,
});

const openSans = localFont({
  src: "../node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2",
  variable: "--font-open-sans",
  display: "swap",
  preload: false,
});

const sourceSans3 = localFont({
  src: "../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2",
  variable: "--font-source-sans-3",
  display: "swap",
  preload: false,
});

const robotoSlab = localFont({
  src: "../node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2",
  variable: "--font-roboto-slab",
  display: "swap",
  preload: false,
});

const ptSans = localFont({
  src: "../node_modules/@fontsource/pt-sans/files/pt-sans-latin-400-normal.woff2",
  variable: "--font-pt-sans",
  display: "swap",
  preload: false,
});

const ptSerif = localFont({
  src: "../node_modules/@fontsource/pt-serif/files/pt-serif-latin-400-normal.woff2",
  variable: "--font-pt-serif",
  display: "swap",
  preload: false,
});

const ubuntu = localFont({
  src: "../node_modules/@fontsource/ubuntu/files/ubuntu-latin-400-normal.woff2",
  variable: "--font-ubuntu",
  display: "swap",
  preload: false,
});

const mulish = localFont({
  src: "../node_modules/@fontsource/mulish/files/mulish-latin-400-normal.woff2",
  variable: "--font-mulish",
  display: "swap",
  preload: false,
});

const rubik = localFont({
  src: "../node_modules/@fontsource/rubik/files/rubik-latin-400-normal.woff2",
  variable: "--font-rubik",
  display: "swap",
  preload: false,
});

const poppins = localFont({
  src: "../node_modules/@fontsource/poppins/files/poppins-latin-400-normal.woff2",
  variable: "--font-poppins",
  display: "swap",
  preload: false,
});

const lexend = localFont({
  src: "../node_modules/@fontsource/lexend/files/lexend-latin-400-normal.woff2",
  variable: "--font-lexend",
  display: "swap",
  preload: false,
});

const inconsolata = localFont({
  src: "../node_modules/@fontsource/inconsolata/files/inconsolata-latin-400-normal.woff2",
  variable: "--font-inconsolata",
  display: "swap",
  preload: false,
});

const sourceCodePro = localFont({
  src: "../node_modules/@fontsource/source-code-pro/files/source-code-pro-latin-400-normal.woff2",
  variable: "--font-source-code-pro",
  display: "swap",
  preload: false,
});

const alegreya = localFont({
  src: "../node_modules/@fontsource/alegreya/files/alegreya-latin-400-normal.woff2",
  variable: "--font-alegreya",
  display: "swap",
  preload: false,
});

const cabin = localFont({
  src: "../node_modules/@fontsource/cabin/files/cabin-latin-400-normal.woff2",
  variable: "--font-cabin",
  display: "swap",
  preload: false,
});

const exo2 = localFont({
  src: "../node_modules/@fontsource/exo-2/files/exo-2-latin-400-normal.woff2",
  variable: "--font-exo-2",
  display: "swap",
  preload: false,
});

const titilliumWeb = localFont({
  src: "../node_modules/@fontsource/titillium-web/files/titillium-web-latin-400-normal.woff2",
  variable: "--font-titillium-web",
  display: "swap",
  preload: false,
});

const spectral = localFont({
  src: "../node_modules/@fontsource/spectral/files/spectral-latin-400-normal.woff2",
  variable: "--font-spectral",
  display: "swap",
  preload: false,
});

const cormorantGaramond = localFont({
  src: "../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2",
  variable: "--font-cormorant-garamond",
  display: "swap",
  preload: false,
});

const figureFontClassNames = [
  karla,
  ebGaramond,
  archivoBlack,
  libreBaskerville,
  spaceGrotesk,
  barlowCondensed,
  lora,
  robotoCondensed,
  publicSans,
  zillaSlab,
  manrope,
  plexMono,
  roboto,
  nunitoSans,
  dmSans,
  workSans,
  firaSans,
  firaCode,
  merriweather,
  crimsonPro,
  montserrat,
  oswald,
  raleway,
  vollkorn,
  notoSans,
  notoSerif,
  openSans,
  sourceSans3,
  robotoSlab,
  ptSans,
  ptSerif,
  ubuntu,
  mulish,
  rubik,
  poppins,
  lexend,
  inconsolata,
  sourceCodePro,
  alegreya,
  cabin,
  exo2,
  titilliumWeb,
  spectral,
  cormorantGaramond,
]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "HiFigure — intent-led figures for papers",
  description:
    "Express paper figure intent through content, layout, and style references before generating publication-ready variants.",
  icons: {
    icon: "/hifigure-icon.png",
    apple: "/hifigure-icon.png",
  },
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${sourceSerif.variable} ${plexSans.variable} ${plexSansCondensed.variable} ${jetBrainsMono.variable} ${atkinson.variable} ${figureFontClassNames}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
