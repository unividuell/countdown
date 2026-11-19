#!/usr/bin/env node
/**
 * Builds Augenmessung's (match-scale) category files offline, while curating — never in the build.
 *
 * Countries, from Natural Earth admin-0 (1:50m):
 *
 *   GeoJSON ─► parts: the largest polygon ─► Lambert azimuthal ─► normalise ─► Douglas-Peucker
 *              plus what lies near it        equal-area around      to 1000     in normalised units
 *                                            its centre                              │
 *   YAML entry ◄─ path (integers, relative) ◄─ round ◄─ re-normalise to 1000 ◄───────┘
 *
 * Simplifying in normalised units keeps the point count independent of the real size: the path
 * travels with every round's payload and must not betray the factor, the round's secret.
 *
 * Usage:
 *   node scripts/match-scale-dataset.mts countries --source <ne_50m_admin_0_countries.geojson>
 *     --input <countries.yaml> --out <countries.yaml> --review <countries.html>
 *   node scripts/match-scale-dataset.mts selftest
 *
 * The input holds JSON (valid YAML): {"exclude": ["<ADM0_A3>", …]}. Input, output and review page
 * are plaintext game content: they live in the main checkout's .local/, never in the repo.
 *
 * Node 24, no dependencies: types are stripped by Node, the YAML is written by hand.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** A part is kept if its bbox centre lies in the largest polygon's bbox, grown by this × its longest side… */
const PART_REACH = 0.5;
/** …and its area is at least this share of the largest polygon's. */
const MIN_PART_SHARE = 0.002;
/** Douglas-Peucker tolerance, in units of the normalised 1000 side. */
const SIMPLIFY_UNITS = 1.5;

const SIDE = 1000;
const EARTH_RADIUS = 6_371_008.8;
const COUNTRY_TYPES = new Set(["Sovereign country", "Country"]);
const MAX_FACTOR = 10;

const SIZE_BUDGET = 500_000;
const TINY_METRES = 50_000;
const MANY_POINTS = 400;
const REVIEW_PAIRS = 12;

type LonLat = [number, number];
type Point = [number, number];
type Polygon = Point[][];

type Shape = {
  path: string;
  width: number;
  height: number;
  metresPerUnit: number;
  points: number;
};

type Entry = Shape & {
  name: string;
  code: string;
  partsKept: number;
  partsDropped: number;
};

// ─── geometry ────────────────────────────────────────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Drops a ring's closing duplicate: GeoJSON repeats the first point at the end. */
function openRing<T extends number[]>(ring: T[]): T[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  return closed ? ring.slice(0, -1) : ring;
}

/** Shoelace; positive is clockwise on screen (y down). */
function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function polygonArea([outer, ...holes]: Polygon): number {
  return (
    Math.abs(signedArea(outer)) -
    holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)
  );
}

function bbox(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ─── projection ──────────────────────────────────────────────────────────────

type Centre = { lat: number; lon: number };

/**
 * The mean of the points' unit vectors: safe across the antimeridian, where the mean of the
 * longitudes (179, −179 → 0) would land on the far side of the earth.
 */
function centreOf(points: LonLat[]): Centre {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const [lon, lat] of points) {
    const phi = rad(lat);
    const lambda = rad(lon);
    x += Math.cos(phi) * Math.cos(lambda);
    y += Math.cos(phi) * Math.sin(lambda);
    z += Math.sin(phi);
  }
  return { lat: Math.atan2(z, Math.hypot(x, y)), lon: Math.atan2(y, x) };
}

/** Spherical Lambert azimuthal equal-area: metres, x east, y north. */
function project(centre: Centre, [lon, lat]: LonLat): Point {
  const phi = rad(lat);
  const dLambda = rad(lon) - centre.lon;
  const cosC =
    Math.sin(centre.lat) * Math.sin(phi) +
    Math.cos(centre.lat) * Math.cos(phi) * Math.cos(dLambda);
  const k = Math.sqrt(2 / (1 + cosC));
  return [
    EARTH_RADIUS * k * Math.cos(phi) * Math.sin(dLambda),
    EARTH_RADIUS *
      k *
      (Math.cos(centre.lat) * Math.sin(phi) -
        Math.sin(centre.lat) * Math.cos(phi) * Math.cos(dLambda)),
  ];
}

const projectPolygon = (centre: Centre, rings: LonLat[][]): Polygon =>
  rings.map((ring) => ring.map((p) => project(centre, p)));

/**
 * Keeps the largest polygon and the parts near it, projected around the largest one's centre.
 * Overseas territories fall away by distance, specks by area.
 */
function selectParts(polygons: LonLat[][][]) {
  const rings = polygons.map((rs) => rs.map(openRing));

  const areas = rings.map((rs) =>
    polygonArea(projectPolygon(centreOf(rs[0]), rs)),
  );
  const largest = areas.indexOf(Math.max(...areas));

  const centre = centreOf(rings[largest][0]);
  const projected = rings.map((rs) => projectPolygon(centre, rs));

  const home = bbox(projected[largest][0]);
  const reach = PART_REACH * Math.max(home.w, home.h);

  const kept = projected.filter((polygon, i) => {
    if (i === largest) return true;
    const box = bbox(polygon[0]);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const near =
      cx >= home.minX - reach &&
      cx <= home.maxX + reach &&
      cy >= home.minY - reach &&
      cy <= home.maxY + reach;
    return near && areas[i] >= MIN_PART_SHARE * areas[largest];
  });

  return { kept, dropped: polygons.length - kept.length };
}

// ─── simplification ──────────────────────────────────────────────────────────

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker on an open polyline; keeps both ends. */
function simplifyLine(points: Point[], tolerance: number): Point[] {
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(points[i], points[from], points[to]);
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([from, worst], [worst, to]);
    }
  }

  return points.filter((_, i) => keep[i]);
}

/**
 * A closed ring is split at the point farthest from its first one, so both halves are
 * well-defined lines (a line from a point back to itself has no direction).
 */
function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length < 4) return ring;

  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDistance) {
      far = i;
      farDistance = d;
    }
  }

  const left = simplifyLine(ring.slice(0, far + 1), tolerance);
  const right = simplifyLine([...ring.slice(far), ring[0]], tolerance);
  return [...left, ...right.slice(1, -1)];
}

// ─── normalisation and path ──────────────────────────────────────────────────

/** Drops consecutive duplicates, including the last point repeating the first. */
function dedupe(ring: Point[]): Point[] {
  const out = ring.filter(
    (p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1],
  );
  while (
    out.length > 1 &&
    out[0][0] === out[out.length - 1][0] &&
    out[0][1] === out[out.length - 1][1]
  ) {
    out.pop();
  }
  return out;
}

/** Outer rings one way, holes the other: the nonzero fill rule then cuts the holes out. */
function wind(ring: Point[], sign: 1 | -1): Point[] {
  return Math.sign(signedArea(ring)) === sign ? ring : [...ring].reverse();
}

/** `M x y` + relative `l dx dy` per ring, `z`: integers, so `M0 0l1000 0l0 500l-1000 0z`. */
function ringPath(ring: Point[]): string {
  let path = `M${ring[0][0]} ${ring[0][1]}`;
  for (let i = 1; i < ring.length; i++) {
    path += `l${ring[i][0] - ring[i - 1][0]} ${ring[i][1] - ring[i - 1][1]}`;
  }
  return `${path}z`;
}

/**
 * Planar polygons (metres, y north) → the drawn silhouette. Normalised before simplifying, and
 * once more after it: Douglas-Peucker may cut an extreme point, and the side must stay exactly
 * 1000 so that metresPerUnit measures what is drawn.
 */
function shape(polygons: Polygon[], tolerance = SIMPLIFY_UNITS): Shape {
  const first = bbox(polygons.flat(2));
  const s1 = SIDE / Math.max(first.w, first.h);

  const simplified: Polygon[] = [];
  for (const polygon of polygons) {
    const [outer, ...holes] = polygon.map((ring) =>
      simplifyRing(
        ring.map(([x, y]): Point => [
          (x - first.minX) * s1,
          (first.maxY - y) * s1,
        ]),
        tolerance,
      ),
    );
    if (outer.length < 3) continue;
    simplified.push([outer, ...holes.filter((hole) => hole.length >= 3)]);
  }

  const second = bbox(simplified.flat(2));
  const s2 = SIDE / Math.max(second.w, second.h);

  const drawn: Polygon[] = [];
  for (const polygon of simplified) {
    const [outer, ...holes] = polygon
      .map((ring) =>
        dedupe(
          ring.map(([x, y]): Point => [
            Math.round((x - second.minX) * s2),
            Math.round((y - second.minY) * s2),
          ]),
        ),
      )
      .map((ring) =>
        ring.length >= 3 && signedArea(ring) !== 0 ? ring : null,
      );
    if (outer === null) continue;
    drawn.push([
      wind(outer, 1),
      ...holes.filter((hole) => hole !== null).map((hole) => wind(hole, -1)),
    ]);
  }

  const box = bbox(drawn.flat(2));
  if (box.minX !== 0 || box.minY !== 0 || Math.max(box.w, box.h) !== SIDE) {
    throw new Error(
      `normalisation lost an extreme point: ${JSON.stringify(box)}`,
    );
  }

  const rings = drawn.flat(1);
  return {
    path: rings.map(ringPath).join(""),
    width: box.w,
    height: box.h,
    metresPerUnit: 1 / (s1 * s2),
    points: rings.reduce((sum, ring) => sum + ring.length, 0),
  };
}

// ─── countries ───────────────────────────────────────────────────────────────

type Feature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
};

function polygonsOf(geometry: Feature["geometry"]): LonLat[][][] {
  if (geometry?.type === "Polygon") return [geometry.coordinates as LonLat[][]];
  if (geometry?.type === "MultiPolygon")
    return geometry.coordinates as LonLat[][][];
  return [];
}

function countries(args: Record<string, string>) {
  for (const key of ["source", "input", "out", "review"]) {
    if (!args[key]) fail(`countries needs --${key} <path>`);
  }

  const input = JSON.parse(readFileSync(args.input, "utf8")) as {
    exclude?: unknown;
  };
  if (
    !Array.isArray(input.exclude) ||
    !input.exclude.every((c) => typeof c === "string")
  ) {
    fail(`${args.input}: expected {"exclude": ["<ADM0_A3>", …]}`);
  }
  const exclude = new Set(input.exclude as string[]);

  const features = (
    JSON.parse(readFileSync(args.source, "utf8")) as { features: Feature[] }
  ).features.filter((f) => COUNTRY_TYPES.has(String(f.properties.TYPE)));

  const unknown = [...exclude].filter(
    (code) => !features.some((f) => f.properties.ADM0_A3 === code),
  );
  if (unknown.length > 0)
    console.warn(`warning: exclude lists unknown codes: ${unknown.join(", ")}`);

  const entries: Entry[] = [];
  for (const feature of features) {
    const code = String(feature.properties.ADM0_A3);
    if (exclude.has(code)) continue;

    const polygons = polygonsOf(feature.geometry);
    if (polygons.length === 0) {
      console.warn(`warning: ${code} has no polygon, skipped`);
      continue;
    }

    const name = String(
      feature.properties.NAME_DE || feature.properties.NAME,
    ).trim();
    const { kept, dropped } = selectParts(polygons);
    entries.push({
      name,
      code,
      ...shape(kept),
      partsKept: kept.length,
      partsDropped: dropped,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "de"));

  const duplicate = entries.find(
    (e, i) => entries.findIndex((o) => o.name === e.name) !== i,
  );
  if (duplicate) fail(`duplicate name ${JSON.stringify(duplicate.name)}`);

  const yaml = categoryYaml(
    "countries",
    "Länder",
    "Umrisse: Natural Earth",
    entries,
  );
  write(args.out, yaml);
  write(args.review, reviewPage("Länder", entries));

  report(
    features.length,
    features.length - entries.length,
    entries,
    Buffer.byteLength(yaml),
  );
}

function categoryYaml(
  category: string,
  displayName: string,
  attribution: string,
  entries: Entry[],
): string {
  const lines = [
    "# Generated by scripts/match-scale-dataset.mts — plaintext game content, never commit unencrypted.",
    `category: ${JSON.stringify(category)}`,
    `displayName: ${JSON.stringify(displayName)}`,
    `attribution: ${JSON.stringify(attribution)}`,
    "entries:",
  ];
  for (const e of entries) {
    lines.push(
      `  - name: ${JSON.stringify(e.name)}`,
      `    path: ${JSON.stringify(e.path)}`,
      `    width: ${e.width}`,
      `    height: ${e.height}`,
      `    metresPerUnit: ${Number(e.metresPerUnit.toPrecision(7))}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function report(
  considered: number,
  left: number,
  entries: Entry[],
  bytes: number,
) {
  const points = entries.map((e) => e.points);
  const largest = entries.reduce((a, b) =>
    b.path.length > a.path.length ? b : a,
  );
  const kb = (bytes / 1000).toFixed(1);

  console.log(
    `countries: ${considered} considered, ${left} left out, ${entries.length} written`,
  );
  console.log(
    `file: ${kb} KB${bytes >= SIZE_BUDGET ? `  WARNING: ≥ ${SIZE_BUDGET / 1000} KB` : ""}`,
  );
  console.log(
    `points per path: mean ${(points.reduce((a, b) => a + b, 0) / points.length).toFixed(1)}, max ${Math.max(...points)}`,
  );
  console.log(
    `largest entry: ${largest.name} (${largest.path.length} B path, ${largest.points} points)`,
  );
  console.log(
    `flags: ${entries.filter(isTiny).length} tiny (< ${TINY_METRES / 1000} km), ` +
      `${entries.filter(hasManyPoints).length} > ${MANY_POINTS} points, ` +
      `${entries.reduce((sum, e) => sum + e.partsDropped, 0)} parts dropped`,
  );
}

// ─── review page ─────────────────────────────────────────────────────────────

const isTiny = (e: Entry) => SIDE * e.metresPerUnit < TINY_METRES;
const hasManyPoints = (e: Entry) => e.points > MANY_POINTS;

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

const km = (metres: number) =>
  (metres / 1000).toLocaleString("de-DE", {
    maximumFractionDigits: metres < 100_000 ? 1 : 0,
  });

/** Seeded, so the same dataset shows the same pairs on every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function card(e: Entry): string {
  const flags = [
    isTiny(e) ? "winzig" : "",
    hasManyPoints(e) ? `${e.points} Punkte` : "",
  ].filter(Boolean);
  return `<figure class="${flags.length > 0 ? "flag" : ""}">
  <svg viewBox="0 0 ${e.width} ${e.height}"><path d="${e.path}"/></svg>
  <figcaption><b>${escape(e.name)}</b> <small>${e.code}</small><br>
  ${km(SIDE * e.metresPerUnit)} km · ${e.points} Punkte · Teile ${e.partsKept}/${e.partsKept + e.partsDropped}
  ${flags.length > 0 ? `<br><mark>${flags.join(" · ")}</mark>` : ""}</figcaption>
</figure>`;
}

/** Both silhouettes in metres, standing on one ground line: the ratio the player must guess. */
function pair(a: Entry, b: Entry): string {
  const wa = a.width * a.metresPerUnit;
  const ha = a.height * a.metresPerUnit;
  const wb = b.width * b.metresPerUnit;
  const hb = b.height * b.metresPerUnit;
  const gap = 0.1 * Math.max(wa, wb);
  const h = Math.max(ha, hb);
  const factor = b.metresPerUnit / a.metresPerUnit;
  return `<figure class="pair">
  <svg viewBox="0 0 ${wa + gap + wb} ${h}">
    <path class="a" transform="translate(0 ${h - ha}) scale(${a.metresPerUnit})" d="${a.path}"/>
    <path transform="translate(${wa + gap} ${h - hb}) scale(${b.metresPerUnit})" d="${b.path}"/>
  </svg>
  <figcaption>${escape(a.name)} — ${escape(b.name)} · Faktor ${factor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</figcaption>
</figure>`;
}

function reviewPage(title: string, entries: Entry[]): string {
  const next = random(20261119);
  const pairs: string[] = [];
  for (let tries = 0; pairs.length < REVIEW_PAIRS && tries < 10_000; tries++) {
    const a = entries[Math.floor(next() * entries.length)];
    const b = entries[Math.floor(next() * entries.length)];
    const factor = b.metresPerUnit / a.metresPerUnit;
    if (a !== b && factor >= 1 / MAX_FACTOR && factor <= MAX_FACTOR)
      pairs.push(pair(a, b));
  }

  return `<!doctype html>
<html lang="de">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Augenmessung – ${escape(title)}</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fafafa; color: #222; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  figure { margin: 0; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 6px; }
  figure.flag { border: 2px solid #d33; }
  figure svg { width: 100%; height: 140px; }
  .pair svg { height: 220px; }
  path { fill: #345; }
  path.a { fill: #999; }
  mark { background: #fdd; }
</style>
<h1>Augenmessung – ${escape(title)}</h1>
<p>${entries.length} Einträge · winzig (längste Seite &lt; ${TINY_METRES / 1000} km): ${entries.filter(isTiny).length}
· mehr als ${MANY_POINTS} Punkte: ${entries.filter(hasManyPoints).length}
· Konstanten: PART_REACH ${PART_REACH}, MIN_PART_SHARE ${MIN_PART_SHARE}, SIMPLIFY_UNITS ${SIMPLIFY_UNITS}</p>
<h2>${pairs.length} gezogene Paare im wahren Verhältnis</h2>
<div class="grid">${pairs.join("\n")}</div>
<h2>Alle Einträge</h2>
<div class="grid">${entries.map(card).join("\n")}</div>
</html>
`;
}

// ─── selftest ────────────────────────────────────────────────────────────────

/** Absolute points per ring, back from the path; throws on anything but integers. */
function parsePath(path: string): Point[][] {
  return path
    .split("z")
    .filter(Boolean)
    .map((ringText) => {
      const ring: Point[] = [];
      for (const [, command, args] of ringText.matchAll(/([Ml])([^Ml]*)/g)) {
        const [a, b] = args.trim().split(" ").map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b))
          throw new Error(`not an integer in ${command}${args}`);
        const [x, y] = command === "M" ? [0, 0] : ring[ring.length - 1];
        ring.push([x + a, y + b]);
      }
      return ring;
    });
}

function selftest() {
  const check = (ok: boolean, why: string) => {
    if (!ok) fail(`selftest failed: ${why}`);
  };

  // A 1° × 1° cell at 60° N has cos 60° the area of one at the equator.
  const cell = (lat: number): LonLat[] => {
    const ring: LonLat[] = [];
    for (let i = 0; i < 10; i++) ring.push([-0.5 + i / 10, lat - 0.5]);
    for (let i = 0; i < 10; i++) ring.push([0.5, lat - 0.5 + i / 10]);
    for (let i = 0; i < 10; i++) ring.push([0.5 - i / 10, lat + 0.5]);
    for (let i = 0; i < 10; i++) ring.push([-0.5, lat + 0.5 - i / 10]);
    return ring;
  };
  const cellArea = (lat: number) =>
    Math.abs(signedArea(cell(lat).map((p) => project(centreOf(cell(lat)), p))));
  const ratio = cellArea(60) / cellArea(0);
  check(
    Math.abs(ratio / Math.cos(Math.PI / 3) - 1) < 0.01,
    `area ratio at 60° N is ${ratio}`,
  );

  // Across the antimeridian: 2° of longitude at the equator, ~222 km, not the world.
  const across: LonLat[] = [
    [179, 0],
    [180, 0],
    [-179, 0],
    [-179, 1],
    [180, 1],
    [179, 1],
  ];
  const acrossBox = bbox(across.map((p) => project(centreOf(across), p)));
  check(acrossBox.w < 300_000, `antimeridian polygon is ${acrossBox.w} m wide`);

  // Collinear points fall away, corners stay.
  const square: Point[] = [
    [0, 0],
    [5, 0],
    [10, 0],
    [10, 5],
    [10, 10],
    [5, 10],
    [0, 10],
    [0, 5],
  ];
  const corners = simplifyRing(square, 0.1)
    .map((p) => p.join(","))
    .sort();
  check(
    corners.join(" ") === "0,0 0,10 10,0 10,10",
    `square simplified to ${corners.join(" ")}`,
  );

  // A wobbly blob, in metres: enough detail for Douglas-Peucker to drop some points and keep others.
  const next = random(7);
  const blob: Point[] = [];
  for (let i = 0; i < 400; i++) {
    const angle = (2 * Math.PI * i) / 400;
    const r = 1000 + 400 * Math.sin(5 * angle) + 4 * next();
    blob.push([r * Math.cos(angle) * 1.3, r * Math.sin(angle)]);
  }
  const hole: Point[] = [
    [-100, -100],
    [100, -100],
    [100, 100],
    [-100, 100],
  ];

  // Normalised: the longest side exactly 1000, every coordinate an integer within [0, 1000].
  const small = shape([[blob, hole]]);
  const rings = parsePath(small.path);
  const all = rings.flat(1);
  check(
    Math.max(small.width, small.height) === SIDE,
    `side is ${small.width} × ${small.height}`,
  );
  check(
    all.every(([x, y]) => x >= 0 && x <= SIDE && y >= 0 && y <= SIDE),
    "a point lies outside [0, 1000]",
  );
  const drawn = bbox(all);
  check(
    drawn.w === small.width && drawn.h === small.height,
    "width/height differ from the path's bbox",
  );
  check(
    small.points < blob.length + hole.length,
    "Douglas-Peucker removed nothing",
  );

  // Holes wind against their outer ring, so the nonzero fill cuts them out.
  check(
    Math.sign(signedArea(rings[0])) === -Math.sign(signedArea(rings[1])),
    "hole winds like its outer ring",
  );

  // No leak: ten times the size draws the very same path, only metresPerUnit tells them apart.
  const scaled = (ring: Point[]) =>
    ring.map(([x, y]): Point => [x * 10, y * 10]);
  const big = shape([[scaled(blob), scaled(hole)]]);
  check(big.path === small.path, "a 10× larger polygon draws a different path");
  check(
    Math.abs(big.metresPerUnit / small.metresPerUnit - 10) < 1e-9,
    "metresPerUnit does not scale with size",
  );

  console.log("selftest ok");
}

// ─── main ────────────────────────────────────────────────────────────────────

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

function options(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) fail(`unexpected argument ${argv[i]}`);
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "selftest") selftest();
else if (command === "countries") countries(options(rest));
else
  fail(
    "usage: node scripts/match-scale-dataset.mts selftest | countries --source … --input … --out … --review …",
  );
