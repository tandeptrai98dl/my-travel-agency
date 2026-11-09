/**
 * Uploads generated placeholder images for the seed's sample media rows (local development).
 *
 *   npm run seed:media                                   # local Supabase
 *   npm run seed:media -- --allow-remote=<project-host>  # e.g. staging
 *
 * `supabase/seed.sql` inserts `public.media` rows (credit `Sample image`) for the tour heroes and
 * journal covers, but SQL cannot upload files, so those images are empty frames until this runs.
 * For every such row whose object is missing from the `media` bucket it renders an SVG scene with
 * sharp (sky, layered landscape, sun or moon, in the brand palette; no text, no network), uploads
 * the JPEG at the row's path with `upsert: false`, then sets the row's real `size_bytes` and a
 * 16 px WebP `blur_data_url` made the way the media service makes it. Objects that already exist
 * are skipped, so re-running is safe and never overwrites an image someone uploaded. Rows with
 * any other credit are never read or touched.
 *
 * Same guard as `seed:users`: a non-local NEXT_PUBLIC_SUPABASE_URL needs
 * `--allow-remote=<exact host>`, and the script refuses outright when VERCEL_ENV=production.
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (`.env.local` is loaded when present).
 * Prints counts only. The images are placeholders: real photos go in through /admin/media.
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

sharp.cache(false);

export const SAMPLE_CREDIT = "Sample image";
const BUCKET = "media";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "host.docker.internal"]);
/** `media_path_format` in `20261106145000_media_uploads_bucket.sql`. */
const PATH_FORMAT =
  /^[0-9]{4}\/[0-9]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/;
const DEFAULT_WIDTH = 2400;
const DEFAULT_HEIGHT = 1600;
/** Larger than any seeded row; keeps a bad row from rendering a gigantic image. */
const MAX_EDGE = 6000;

// ---------------------------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------------------------

export type TargetCheck = { ok: true; host: string } | { ok: false; message: string };

/** The local-only rule of `seed:users`, plus a hard refusal on Vercel production. */
export function checkTarget(input: {
  url: string | undefined;
  allowRemote: string | undefined;
  vercelEnv: string | undefined;
}): TargetCheck {
  if (input.vercelEnv === "production") {
    return { ok: false, message: "refusing to run with VERCEL_ENV=production." };
  }
  if (!input.url) return { ok: false, message: "NEXT_PUBLIC_SUPABASE_URL is not set." };
  let host: string;
  try {
    host = new URL(input.url).hostname;
  } catch {
    return { ok: false, message: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  }
  if (!LOCAL_HOSTS.has(host) && input.allowRemote !== host) {
    return {
      ok: false,
      message:
        `refusing to seed media on non-local host "${host}". ` +
        `Pass --allow-remote=${host} if this really is a development or staging project.`,
    };
  }
  return { ok: true, host };
}

// ---------------------------------------------------------------------------------------------
// Scene and palette selection (pure, deterministic from the media id)
// ---------------------------------------------------------------------------------------------

export const SCENES = ["water", "hills", "city", "fields"] as const;
export type Scene = (typeof SCENES)[number];

type Palette = {
  name: string;
  /** Sky gradient, top to horizon. */
  sky: [string, string, string];
  body: "sun" | "moon";
  bodyColor: string;
  glow: string;
  /** Landscape layers are mixed from `far` (hazy, near the sky) to `near` (the darkest). */
  far: string;
  near: string;
  stars: boolean;
};

/** Brand palette (`DESIGN_SYSTEM.md`): Deep Navy, Warm Ivory, Champagne Gold, Warm Gray. */
export const PALETTES: readonly Palette[] = [
  {
    name: "dawn",
    sky: ["#E4DACA", "#EFE6D6", "#F7F3EC"],
    body: "sun",
    bodyColor: "#F3E3BF",
    glow: "#C9A96E",
    far: "#C9C1B3",
    near: "#16253B",
    stars: false,
  },
  {
    name: "golden",
    sky: ["#2A3A52", "#8D7756", "#E6CB94"],
    body: "sun",
    bodyColor: "#F7E7C2",
    glow: "#C9A96E",
    far: "#8E7D66",
    near: "#0F1B2D",
    stars: false,
  },
  {
    name: "dusk",
    sky: ["#0F1B2D", "#3B4A60", "#C9A96E"],
    body: "sun",
    bodyColor: "#E9CF98",
    glow: "#C9A96E",
    far: "#55606E",
    near: "#0A1320",
    stars: false,
  },
  {
    name: "night",
    sky: ["#0A1320", "#16253B", "#2A3A52"],
    body: "moon",
    bodyColor: "#F7F3EC",
    glow: "#B9B4AA",
    far: "#33445C",
    near: "#070E19",
    stars: true,
  },
  {
    name: "mist",
    sky: ["#F7F3EC", "#EEE8DE", "#E2DBCF"],
    body: "sun",
    bodyColor: "#FBF8F3",
    glow: "#C9A96E",
    far: "#CFC7BA",
    near: "#2A3A52",
    stars: false,
  },
];

const SCENE_KEYWORDS: ReadonlyArray<readonly [Scene, RegExp]> = [
  // First match wins: "terraced fields" are hills, "lavender fields" are fields.
  [
    "hills",
    /\b(mountain|mountains|nui|sa ?pa|terrace|terraces|terraced|bac thang|ruong|rice|highland|vung cao|hill|hills|trail|trails|inthanon|forest|forests|rung)\b/,
  ],
  ["fields", /\b(lavender|oai huong|provence|field|fields|canh dong|vineyard|vuon nho)\b/],
  [
    "water",
    /\b(sea|bay|vinh|beach|bien|island|islands|dao|coast|river|song|rhone|cruise|du thuyen|boat|thuyen|lake|ho|phu quoc|ha long|lan ha)\b/,
  ],
  [
    "city",
    /\b(city|kyoto|tokyo|osaka|temple|temples|chua|den|pagoda|paris|versailles|avignon|bangkok|ayutthaya|hoi an|hue|ha noi|hanoi|heritage|di san|museum|museums|bao tang|market|markets|cho|old town|pho co)\b/,
  ],
];

const TEMPLE_WORDS =
  /\b(kyoto|tokyo|osaka|japan|nhat ban|temple|temples|chua|den|pagoda|hoi an|hue|bangkok|ayutthaya|chiang mai|thai|ha noi|hanoi)\b/;
const SKYLINE_WORDS = /\b(paris|versailles|avignon|france|phap|museum|museums|bao tang)\b/;
const KARST_WORDS = /\b(bay|vinh|ha long|lan ha|limestone|da voi|islands)\b/;

/** Lower case, diacritics removed (đ → d), so Vietnamese and English alt texts match the same words. */
export function normaliseText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/** Both alt texts of a row as one normalised string. */
export function altText(alt: unknown): string {
  if (!alt || typeof alt !== "object") return "";
  return normaliseText(
    Object.values(alt as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string")
      .join(" "),
  );
}

/** A 32-bit PRNG (mulberry32), seeded from the SHA-256 of the media id. */
export function rngFor(id: string, salt = ""): () => number {
  let state = createHash("sha256").update(`${salt}${id}`).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SceneChoice = {
  scene: Scene;
  /** Scene variant: karst islands on water, temple or European roofline in the city. */
  variant: "karst" | "open" | "temple" | "skyline" | "plain";
  palette: Palette;
};

/** The scene from keywords in the alt text (else from the id), the palette from the id. */
export function chooseScene(id: string, alt: unknown): SceneChoice {
  const text = altText(alt);
  const rand = rngFor(id, "scene:");
  const keyword = SCENE_KEYWORDS.find(([, pattern]) => pattern.test(text))?.[0];
  const scene = keyword ?? SCENES[Math.floor(rand() * SCENES.length)];
  const palette = PALETTES[Math.floor(rngFor(id, "palette:")() * PALETTES.length)];
  let variant: SceneChoice["variant"] = "plain";
  if (scene === "water") variant = KARST_WORDS.test(text) || rand() < 0.5 ? "karst" : "open";
  if (scene === "city") {
    variant = TEMPLE_WORDS.test(text)
      ? "temple"
      : SKYLINE_WORDS.test(text)
        ? "skyline"
        : rand() < 0.5
          ? "temple"
          : "skyline";
  }
  return { scene, variant, palette };
}

// ---------------------------------------------------------------------------------------------
// SVG drawing
// ---------------------------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`.toUpperCase();
}

const f = (n: number) => Number(n.toFixed(1));

type Ctx = { w: number; h: number; rand: () => number; pal: Palette };

/** A ridge line as a closed silhouette: sum of sines with random phases plus fine jitter. */
function ridgePath(ctx: Ctx, baseY: number, amp: number, roughness: number, offset = 0): string {
  const { w, h, rand } = ctx;
  const waves = Array.from({ length: 4 }, (_, i) => ({
    freq: (0.6 + rand() * 1.4) * (i + 1),
    phase: rand() * Math.PI * 2,
    weight: 1 / (i + 1) ** (1.3 - roughness * 0.6),
  }));
  const total = waves.reduce((sum, wave) => sum + wave.weight, 0);
  const steps = 160;
  const points: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * w;
    const u = (i / steps) * Math.PI * 2;
    const y =
      waves.reduce((sum, wave) => sum + Math.sin(u * wave.freq + wave.phase) * wave.weight, 0) / total;
    const jitter = (rand() - 0.5) * roughness * amp * 0.12;
    points.push(`${f(x)},${f(baseY + offset - (y * 0.5 + 0.5) * amp + jitter)}`);
  }
  return `M0,${h} L${points.join(" L")} L${w},${h} Z`;
}

function haze(ctx: Ctx, id: string, top: number, opacity: number): string {
  const { w, h, pal } = ctx;
  return (
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${pal.sky[2]}" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="${pal.sky[2]}" stop-opacity="${opacity}"/></linearGradient>` +
    `<rect x="0" y="${f(top)}" width="${w}" height="${f(h - top)}" fill="url(#${id})"/>`
  );
}

function skyAndBody(ctx: Ctx, horizon: number): { defs: string; body: string; sunX: number } {
  const { w, h, rand, pal } = ctx;
  const r = h * (0.045 + rand() * 0.03);
  const cx = w * (0.18 + rand() * 0.64);
  const cy = horizon - h * (0.08 + rand() * 0.2);
  const defs =
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="0.55" stop-color="${pal.sky[1]}"/>` +
    `<stop offset="1" stop-color="${pal.sky[2]}"/></linearGradient>` +
    `<radialGradient id="glow"><stop offset="0" stop-color="${pal.glow}" stop-opacity="0.45"/>` +
    `<stop offset="1" stop-color="${pal.glow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">` +
    `<stop offset="0.6" stop-color="#0F1B2D" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#0F1B2D" stop-opacity="0.32"/></radialGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  if (pal.stars) {
    for (let i = 0; i < 70; i += 1) {
      body +=
        `<circle cx="${f(rand() * w)}" cy="${f(rand() * horizon * 0.7)}" r="${f(h * (0.0008 + rand() * 0.0016))}" ` +
        `fill="#F7F3EC" opacity="${f(0.25 + rand() * 0.55)}"/>`;
    }
  }
  body += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 5)}" fill="url(#glow)"/>`;
  if (pal.body === "moon") {
    // A crescent: the disc with an offset circle masked out, so the sky shows through.
    body +=
      `<mask id="crescent"><rect width="${w}" height="${h}" fill="#FFFFFF"/>` +
      `<circle cx="${f(cx + r * 0.42)}" cy="${f(cy - r * 0.18)}" r="${f(r * 0.86)}" fill="#000000"/></mask>` +
      `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${pal.bodyColor}" mask="url(#crescent)"/>`;
  } else {
    body += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${pal.bodyColor}"/>`;
  }
  return { defs, body, sunX: cx };
}

function layerColor(pal: Palette, t: number): string {
  return mix(pal.far, pal.near, t);
}

function drawHills(ctx: Ctx): { defs: string; body: string } {
  const { h, rand, pal } = ctx;
  const horizon = h * (0.5 + rand() * 0.08);
  const { defs, body: sky } = skyAndBody(ctx, horizon);
  let body = sky;
  let extraDefs = "";
  const layers = 5;
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const baseY = horizon + h * (0.02 + t * 0.3);
    const amp = h * (0.2 - t * 0.1) * (0.8 + rand() * 0.4);
    const d = ridgePath(ctx, baseY, amp, 1 - t * 0.7);
    const color = layerColor(pal, 0.15 + t * 0.85);
    body += `<path d="${d}" fill="${color}"/>`;
    if (i >= layers - 2) {
      // Rice terraces: contour lines following the ridge, clipped to the hill.
      extraDefs += `<clipPath id="hill${i}"><path d="${d}"/></clipPath>`;
      const lines: string[] = [];
      const gap = h * 0.018;
      for (let k = 1; k < 14; k += 1) {
        lines.push(`<path d="${ridgePath(ctx, baseY, amp * 0.9, 0.1, k * gap)}" fill="none"/>`);
      }
      body +=
        `<g clip-path="url(#hill${i})" stroke="${mix(color, pal.sky[2], 0.35)}" stroke-width="${f(h * 0.0022)}" ` +
        `stroke-opacity="0.35">${lines.join("")}</g>`;
    }
    if (i < layers - 1) body += haze(ctx, `haze${i}`, baseY - amp * 0.3, 0.45 - t * 0.2);
  }
  return { defs: defs + extraDefs, body };
}

/** A closed path through the points, smoothed with Catmull-Rom curves. */
function smoothPath(points: Array<[number, number]>): string {
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    d +=
      ` C${f(x1 + (x2 - x0) / 6)},${f(y1 + (y2 - y0) / 6)} ` +
      `${f(x2 - (x3 - x1) / 6)},${f(y2 - (y3 - y1) / 6)} ${f(x2)},${f(y2)}`;
  }
  return `${d} Z`;
}

/** A limestone tower: steep, slightly overhanging sides tapering to an uneven, wooded top. */
function karst(rand: () => number, x: number, base: number, width: number, height: number): string {
  const lean = (rand() - 0.5) * width * 0.3;
  const points: Array<[number, number]> = [
    [x, base],
    [x + width * (0.04 + rand() * 0.08), base - height * 0.3],
    [x + width * (0.02 + rand() * 0.1) + lean * 0.4, base - height * 0.55],
    [x + width * (0.12 + rand() * 0.1) + lean * 0.8, base - height * (0.78 + rand() * 0.1)],
  ];
  const bumps = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < bumps; i += 1) {
    const u = 0.3 + (i / Math.max(1, bumps - 1)) * 0.4;
    points.push([x + width * u + lean, base - height * (0.82 + rand() * 0.18)]);
  }
  points.push(
    [x + width * (0.8 + rand() * 0.1) + lean * 0.7, base - height * (0.6 + rand() * 0.2)],
    [x + width * (0.9 + rand() * 0.1) + lean * 0.3, base - height * (0.35 + rand() * 0.15)],
    [x + width, base],
  );
  return smoothPath(points);
}

function drawWater(ctx: Ctx, variant: SceneChoice["variant"]): { defs: string; body: string } {
  const { w, h, rand, pal } = ctx;
  const horizon = h * (0.58 + rand() * 0.08);
  const { defs, body: sky, sunX } = skyAndBody(ctx, horizon);
  let body = sky;
  // A low far shore along the horizon.
  body += `<path d="${ridgePath(ctx, horizon, h * 0.05, 0.4)}" fill="${layerColor(pal, 0.12)}"/>`;
  const islands: string[] = [];
  if (variant === "karst") {
    const groups = 3 + Math.floor(rand() * 3);
    for (let g = 0; g < groups; g += 1) {
      const depth = g / Math.max(1, groups - 1);
      const color = layerColor(pal, 0.25 + depth * 0.65);
      let x = rand() * w * 0.9 - w * 0.05;
      const count = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < count; i += 1) {
        const width = w * (0.025 + rand() * 0.05) * (0.7 + depth * 0.6);
        const height = Math.min(h * 0.32, width * (1.1 + rand() * 1.2) * (h / w) * 1.5);
        islands.push(`<path d="${karst(rand, x, horizon, width, height)}" fill="${color}"/>`);
        x += width * (0.4 + rand() * 0.8);
      }
    }
  } else {
    islands.push(`<path d="${ridgePath(ctx, horizon, h * 0.09, 0.6)}" fill="${layerColor(pal, 0.35)}"/>`);
  }
  body += islands.join("");
  const water = mix(pal.sky[2], pal.near, 0.35);
  const extraDefs =
    `<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${water}"/>` +
    `<stop offset="1" stop-color="${mix(pal.near, pal.far, 0.1)}"/></linearGradient>` +
    `<clipPath id="sea"><rect x="0" y="${f(horizon)}" width="${w}" height="${f(h - horizon)}"/></clipPath>`;
  body += `<rect x="0" y="${f(horizon)}" width="${w}" height="${f(h - horizon)}" fill="url(#water)"/>`;
  // Reflections of the islands, mirrored at the horizon and faded.
  body +=
    `<g clip-path="url(#sea)" opacity="0.28" transform="translate(0 ${f(horizon * 2)}) scale(1 -1)">` +
    `${islands.join("")}</g>`;
  // Light on the water below the sun or moon, and faint swell lines.
  let shimmer = "";
  for (let i = 0; i < 46; i += 1) {
    const t = rand();
    const y = horizon + (h - horizon) * (0.03 + t * 0.95);
    const len = w * (0.01 + rand() * 0.06) * (0.4 + t);
    const x = sunX + (rand() - 0.5) * w * 0.12 * (0.5 + t) - len / 2;
    shimmer += `<rect x="${f(x)}" y="${f(y)}" width="${f(len)}" height="${f(h * 0.0025 * (0.6 + t))}" fill="${pal.bodyColor}" opacity="${f(0.55 - t * 0.4)}"/>`;
  }
  for (let i = 0; i < 18; i += 1) {
    const y = horizon + (h - horizon) * rand();
    const len = w * (0.05 + rand() * 0.2);
    shimmer += `<rect x="${f(rand() * w)}" y="${f(y)}" width="${f(len)}" height="${f(h * 0.0015)}" fill="${pal.sky[2]}" opacity="0.08"/>`;
  }
  body += shimmer;
  if (rand() < 0.7) {
    // A small junk boat with a curved sail.
    const s = h * (0.05 + rand() * 0.03);
    const bx = w * (0.15 + rand() * 0.7);
    const by = horizon + (h - horizon) * (0.35 + rand() * 0.25);
    const color = pal.near;
    body +=
      `<g fill="${color}">` +
      `<path d="M${f(bx - s)},${f(by)} Q${f(bx)},${f(by + s * 0.35)} ${f(bx + s * 1.1)},${f(by - s * 0.1)} L${f(bx + s * 0.9)},${f(by)} Z"/>` +
      `<path d="M${f(bx - s * 0.15)},${f(by - s * 0.05)} L${f(bx - s * 0.1)},${f(by - s * 1.5)} Q${f(bx + s * 0.6)},${f(by - s * 1.1)} ${f(bx + s * 0.55)},${f(by - s * 0.1)} Z" opacity="0.92"/>` +
      `</g>` +
      `<rect x="${f(bx - s)}" y="${f(by + s * 0.12)}" width="${f(s * 2)}" height="${f(h * 0.002)}" fill="${color}" opacity="0.3"/>`;
  }
  return { defs: defs + extraDefs, body };
}

function eaveRoof(cx: number, y: number, width: number, height: number): string {
  const half = width / 2;
  return (
    `M${f(cx - half)},${f(y - height * 0.35)} Q${f(cx - half * 0.75)},${f(y)} ${f(cx - half * 0.55)},${f(y)} ` +
    `L${f(cx + half * 0.55)},${f(y)} Q${f(cx + half * 0.75)},${f(y)} ${f(cx + half)},${f(y - height * 0.35)} ` +
    `L${f(cx + half * 0.25)},${f(y - height)} L${f(cx - half * 0.25)},${f(y - height)} Z`
  );
}

function templeBuilding(ctx: Ctx, x: number, base: number, width: number): string {
  const { h, rand } = ctx;
  const cx = x + width / 2;
  let d = "";
  if (rand() < 0.3) {
    // Pagoda: three to five tiers narrowing upwards, with a finial.
    const tiers = 3 + Math.floor(rand() * 3);
    const tier = h * (0.035 + rand() * 0.012);
    let y = base;
    for (let i = 0; i < tiers; i += 1) {
      const tw = width * (1 - i * 0.14);
      d += `M${f(cx - tw * 0.3)},${f(y)} h${f(tw * 0.6)} v${f(-tier * 0.6)} h${f(-tw * 0.6)} Z `;
      y -= tier * 0.6;
      d += `${eaveRoof(cx, y, tw * 1.1, tier * 0.55)} `;
      y -= tier * 0.55;
    }
    d += `M${f(cx - width * 0.012)},${f(y)} h${f(width * 0.024)} v${f(-tier * 1.2)} h${f(-width * 0.024)} Z`;
    return d;
  }
  const bodyHeight = h * (0.03 + rand() * 0.05);
  d += `M${f(x + width * 0.1)},${f(base)} h${f(width * 0.8)} v${f(-bodyHeight)} h${f(-width * 0.8)} Z `;
  d += eaveRoof(cx, base - bodyHeight, width * 1.08, h * (0.025 + rand() * 0.025));
  return d;
}

function skylineBuilding(ctx: Ctx, x: number, base: number, width: number): string {
  const { h, rand } = ctx;
  const cx = x + width / 2;
  const roll = rand();
  const bodyHeight = h * (0.05 + rand() * 0.08);
  const top = base - bodyHeight;
  let d = `M${f(x)},${f(base)} h${f(width)} v${f(-bodyHeight)} h${f(-width)} Z `;
  if (roll < 0.12) {
    // A dome on a drum, with a lantern.
    const r = width * 0.32;
    d += `M${f(cx - r * 1.1)},${f(top)} h${f(r * 2.2)} v${f(-r * 0.6)} h${f(-r * 2.2)} Z `;
    d += `M${f(cx - r)},${f(top - r * 0.6)} A${f(r)},${f(r * 1.1)} 0 0 1 ${f(cx + r)},${f(top - r * 0.6)} Z `;
    d += `M${f(cx - r * 0.12)},${f(top - r * 1.6)} h${f(r * 0.24)} v${f(-r * 0.6)} h${f(-r * 0.24)} Z`;
  } else if (roll < 0.22) {
    // A church spire.
    d += `M${f(cx - width * 0.2)},${f(top)} L${f(cx)},${f(top - h * 0.14)} L${f(cx + width * 0.2)},${f(top)} Z`;
  } else {
    // A mansard roof with chimneys.
    const roof = h * (0.018 + rand() * 0.02);
    d += `M${f(x)},${f(top)} L${f(x + width * 0.1)},${f(top - roof)} L${f(x + width * 0.9)},${f(top - roof)} L${f(x + width)},${f(top)} Z `;
    const chimneys = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < chimneys; i += 1) {
      const chx = x + width * (0.18 + rand() * 0.6);
      d += `M${f(chx)},${f(top - roof)} h${f(width * 0.05)} v${f(-roof * 0.8)} h${f(-width * 0.05)} Z `;
    }
  }
  return d;
}

function drawCity(ctx: Ctx, variant: SceneChoice["variant"]): { defs: string; body: string } {
  const { w, h, rand, pal } = ctx;
  const base = h * (0.78 + rand() * 0.05);
  const { defs, body: sky } = skyAndBody(ctx, base - h * 0.12);
  let body = sky;
  body += `<path d="${ridgePath(ctx, base - h * 0.14, h * 0.12, 0.5)}" fill="${layerColor(pal, 0.12)}"/>`;
  body += haze(ctx, "haze0", base - h * 0.24, 0.4);
  body += `<path d="${ridgePath(ctx, base - h * 0.06, h * 0.08, 0.3)}" fill="${layerColor(pal, 0.35)}"/>`;
  body += haze(ctx, "haze1", base - h * 0.12, 0.3);
  // Two rows of rooftops: a paler row behind, the darkest in front.
  for (const [row, t, scale] of [
    [0, 0.62, 0.8],
    [1, 1, 1],
  ] as const) {
    let x = -w * 0.02 - rand() * w * 0.04;
    let d = "";
    const rowBase = base - (1 - row) * h * 0.03;
    while (x < w) {
      const width = w * (0.035 + rand() * 0.075) * scale;
      d +=
        variant === "temple"
          ? templeBuilding({ ...ctx, h: h * scale }, x, rowBase, width)
          : skylineBuilding({ ...ctx, h: h * scale }, x, rowBase, width);
      x += width * (0.85 + rand() * 0.35);
    }
    body += `<path d="${d}" fill="${layerColor(pal, t)}"/>`;
  }
  // Ground and a few tree canopies.
  body += `<rect x="0" y="${f(base - 1)}" width="${w}" height="${f(h - base + 1)}" fill="${pal.near}"/>`;
  let trees = "";
  for (let i = 0; i < 7; i += 1) {
    const tx = rand() * w;
    const r = h * (0.02 + rand() * 0.03);
    for (let k = 0; k < 3; k += 1) {
      trees += `<circle cx="${f(tx + (k - 1) * r * 0.8)}" cy="${f(base - r * (0.6 + (k % 2) * 0.5))}" r="${f(r)}"/>`;
    }
  }
  body += `<g fill="${pal.near}">${trees}</g>`;
  return { defs, body };
}

function drawFields(ctx: Ctx): { defs: string; body: string } {
  const { w, h, rand, pal } = ctx;
  const horizon = h * (0.5 + rand() * 0.08);
  const { defs, body: sky } = skyAndBody(ctx, horizon);
  let body = sky;
  body += `<path d="${ridgePath(ctx, horizon + h * 0.01, h * 0.1, 0.4)}" fill="${layerColor(pal, 0.15)}"/>`;
  body += haze(ctx, "haze0", horizon - h * 0.08, 0.4);
  const ridge = ridgePath(ctx, horizon + h * 0.04, h * 0.06, 0.2);
  body += `<path d="${ridge}" fill="${layerColor(pal, 0.4)}"/>`;
  // Cypress trees and a farmhouse on the near ridge.
  let trees = "";
  const start = w * (0.1 + rand() * 0.6);
  for (let i = 0; i < 6; i += 1) {
    const tx = start + i * w * (0.012 + rand() * 0.01);
    const th = h * (0.05 + rand() * 0.04);
    trees += `<ellipse cx="${f(tx)}" cy="${f(horizon + h * 0.01 - th / 2)}" rx="${f(h * 0.008)}" ry="${f(th / 2)}"/>`;
  }
  const hx = start - w * 0.08;
  const hy = horizon + h * 0.015;
  trees += `<path d="M${f(hx)},${f(hy)} h${f(w * 0.05)} v${f(-h * 0.03)} l${f(-w * 0.025)},${f(-h * 0.02)} l${f(-w * 0.025)},${f(h * 0.02)} Z"/>`;
  body += `<g fill="${layerColor(pal, 0.55)}">${trees}</g>`;
  // Rows converging on a vanishing point on the horizon.
  const fieldTop = horizon + h * 0.04;
  const vx = w * (0.3 + rand() * 0.4);
  const vy = fieldTop - h * 0.05;
  const rowA = layerColor(pal, 0.82);
  const rowB = mix(layerColor(pal, 0.6), "#C9A96E", 0.18);
  const extraDefs =
    `<clipPath id="field"><rect x="0" y="${f(fieldTop)}" width="${w}" height="${f(h - fieldTop)}"/></clipPath>` +
    `<linearGradient id="fieldhaze" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${pal.sky[2]}" stop-opacity="0.55"/>` +
    `<stop offset="0.45" stop-color="${pal.sky[2]}" stop-opacity="0"/></linearGradient>`;
  let rows = `<rect x="0" y="${f(fieldTop)}" width="${w}" height="${f(h - fieldTop)}" fill="${rowA}"/>`;
  const count = 22 + Math.floor(rand() * 8);
  for (let i = 0; i < count; i += 2) {
    const x0 = -w * 1.2 + (i / count) * w * 3.4;
    const x1 = -w * 1.2 + ((i + 1) / count) * w * 3.4;
    rows += `<path d="M${f(vx)},${f(vy)} L${f(x0)},${h} L${f(x1)},${h} Z" fill="${rowB}"/>`;
  }
  rows += `<rect x="0" y="${f(fieldTop)}" width="${w}" height="${f(h - fieldTop)}" fill="url(#fieldhaze)"/>`;
  body += `<g clip-path="url(#field)">${rows}</g>`;
  return { defs: defs + extraDefs, body };
}

/** The scene as an SVG document, deterministic from the id and alt text. */
export function sampleSvg(input: { id: string; alt: unknown; width: number; height: number }): string {
  const choice = chooseScene(input.id, input.alt);
  const ctx: Ctx = { w: input.width, h: input.height, rand: rngFor(input.id, "draw:"), pal: choice.palette };
  const drawn =
    choice.scene === "water"
      ? drawWater(ctx, choice.variant)
      : choice.scene === "hills"
        ? drawHills(ctx)
        : choice.scene === "city"
          ? drawCity(ctx, choice.variant)
          : drawFields(ctx);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" ` +
    `viewBox="0 0 ${input.width} ${input.height}"><defs>${drawn.defs}</defs>${drawn.body}` +
    `<rect width="${input.width}" height="${input.height}" fill="url(#vignette)"/></svg>`
  );
}

// ---------------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------------

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/** Renders the scene at the given size and encodes it in the row's format (JPEG at quality 82). */
export async function generateSampleImage(input: {
  id: string;
  alt: unknown;
  width: number;
  height: number;
  mimeType?: ImageMime;
}): Promise<Buffer> {
  const svg = Buffer.from(sampleSvg(input));
  const image = sharp(svg, { density: 72 }).resize(input.width, input.height, { fit: "fill" }).flatten({
    background: "#0F1B2D",
  });
  switch (input.mimeType ?? "image/jpeg") {
    case "image/png":
      return image.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return image.webp({ quality: 82 }).toBuffer();
    case "image/avif":
      return image.avif({ quality: 60 }).toBuffer();
    default:
      return image.jpeg({ quality: 82, progressive: true }).toBuffer();
  }
}

/** The same 16 px WebP placeholder that `finalizeUpload()` in the media service stores. */
export async function blurDataUrl(image: Buffer): Promise<string> {
  const blur = await sharp(image).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${blur.toString("base64")}`;
}

// ---------------------------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------------------------

export type SampleRow = {
  id: string;
  bucket: string;
  path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  credit: string | null;
  alt: unknown;
};

export type UploadOutcome = "created" | "exists" | "failed";

/** What the seeder needs from Supabase; `createSupabaseStore()` is the real one. */
export interface SeedStore {
  listSampleRows(): Promise<SampleRow[]>;
  listExistingPaths(folders: string[]): Promise<Set<string>>;
  upload(path: string, body: Buffer, contentType: string): Promise<UploadOutcome>;
  updateRow(id: string, values: { size_bytes: number; blur_data_url: string }): Promise<boolean>;
  remove(path: string): Promise<void>;
}

export type SeedCounts = { created: number; skipped: number; failed: number };

const MIME_EXTENSION: Record<ImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function isImageMime(value: string): value is ImageMime {
  return Object.hasOwn(MIME_EXTENSION, value);
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

export async function seedSampleMedia(
  store: SeedStore,
  generate: typeof generateSampleImage = generateSampleImage,
): Promise<SeedCounts> {
  const counts: SeedCounts = { created: 0, skipped: 0, failed: 0 };
  // The query already filters; checked again so no other row is ever written.
  const rows = (await store.listSampleRows()).filter(
    (row) => row.bucket === BUCKET && row.credit === SAMPLE_CREDIT,
  );
  const existing = await store.listExistingPaths([...new Set(rows.map((row) => folderOf(row.path)))]);

  for (const row of rows) {
    if (existing.has(row.path)) {
      counts.skipped += 1;
      continue;
    }
    const width = row.width ?? DEFAULT_WIDTH;
    const height = row.height ?? DEFAULT_HEIGHT;
    if (
      !PATH_FORMAT.test(row.path) ||
      !isImageMime(row.mime_type) ||
      !row.path.endsWith(`.${MIME_EXTENSION[row.mime_type]}`) ||
      width < 16 ||
      height < 16 ||
      width > MAX_EDGE ||
      height > MAX_EDGE
    ) {
      counts.failed += 1;
      continue;
    }
    try {
      const image = await generate({ id: row.id, alt: row.alt, width, height, mimeType: row.mime_type });
      const blur = await blurDataUrl(image);
      const outcome = await store.upload(row.path, image, row.mime_type);
      if (outcome === "exists") {
        counts.skipped += 1;
        continue;
      }
      if (outcome === "failed") {
        counts.failed += 1;
        continue;
      }
      if (!(await store.updateRow(row.id, { size_bytes: image.length, blur_data_url: blur }))) {
        // Remove the file again, so the next run regenerates it with its row.
        await store.remove(row.path);
        counts.failed += 1;
        continue;
      }
      counts.created += 1;
    } catch {
      counts.failed += 1;
    }
  }
  return counts;
}

const PAGE = 1000;

export function createSupabaseStore(supabase: SupabaseClient): SeedStore {
  const bucket = supabase.storage.from(BUCKET);
  return {
    async listSampleRows() {
      const rows: SampleRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("media")
          .select("id, bucket, path, mime_type, width, height, credit, alt")
          .eq("bucket", BUCKET)
          .eq("credit", SAMPLE_CREDIT)
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`could not read the sample media rows: ${error.message}`);
        rows.push(...(data as SampleRow[]));
        if (data.length < PAGE) return rows;
      }
    },
    async listExistingPaths(folders) {
      const paths = new Set<string>();
      for (const folder of folders) {
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await bucket.list(folder, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
          if (error) throw new Error(`could not list the media bucket: ${error.message}`);
          for (const entry of data) paths.add(`${folder}/${entry.name}`);
          if (data.length < PAGE) break;
        }
      }
      return paths;
    },
    async upload(path, body, contentType) {
      const { error } = await bucket.upload(path, body, { contentType, upsert: false });
      if (!error) return "created";
      const status = (error as { statusCode?: string | number; status?: number }).statusCode ??
        (error as { status?: number }).status;
      return String(status) === "409" || /exists|duplicate/i.test(error.message) ? "exists" : "failed";
    },
    async updateRow(id, values) {
      const { error } = await supabase
        .from("media")
        .update(values)
        .eq("id", id)
        .eq("bucket", BUCKET)
        .eq("credit", SAMPLE_CREDIT);
      return !error;
    },
    async remove(path) {
      await bucket.remove([path]);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function fail(message: string): never {
  console.error(`seed:media: ${message}`);
  process.exit(1);
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on the shell environment.
  }
  const target = checkTarget({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowRemote: process.argv.find((arg) => arg.startsWith("--allow-remote="))?.slice("--allow-remote=".length),
    vercelEnv: process.env.VERCEL_ENV,
  });
  if (!target.ok) fail(target.message);
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) fail("SUPABASE_SECRET_KEY is not set.");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const counts = await seedSampleMedia(createSupabaseStore(supabase));
  console.log(`seed:media: created ${counts.created}, skipped ${counts.skipped}, failed ${counts.failed}`);
  if (counts.failed > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  });
}
