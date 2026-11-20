#!/usr/bin/env node
/**
 * Builds Augenmaß's (match-scale) category files offline, while curating — never in the build.
 *
 * Countries, from Natural Earth admin-0 (1:50m):
 *
 *   GeoJSON ─► parts: the largest polygon ─► Lambert azimuthal ─► normalise ─► Douglas-Peucker
 *              plus what lies near it        equal-area around      to 1000     in normalised units
 *                                            its centre                              │
 *   YAML entry ◄─ path (integers, relative) ◄─ round ◄─ re-normalise to 1000 ◄───────┘
 *
 * Simplifying in normalised units stops the point count from scaling with the real size: the path
 * travels with every round's payload and must not betray the factor, the round's secret. A small
 * country still stays coarse, because the source has a fixed ground resolution; accepted, since
 * its name is public and gives away more than the coarseness.
 *
 * Animals, from PhyloPic silhouettes and a hand list with one measure per drawing:
 *
 *   image uuid ─► metadata + vector.svg ─► every filled shape, ─► rings nested ─► the countries'
 *   (input)       (cached, fetched once)    transforms applied,    into outers     normalise …
 *                                           curves flattened       and holes       round, path
 *
 *   metresPerUnit = metres / the drawn width (axis "length") or height, whichever the hand list
 *   measured — or, with a span, / the stretch of that axis the measure covers. The measure
 *   itself (axis, metres, source, span) is written alongside, to be shown in the reveal and
 *   researched again.
 *
 *         from              to        a length span: nose tip to tail base, in normalised x
 *          ├────────────────┤          (a height span: ground to withers, in normalised y, y down)
 *         ▄█▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█▄▄▄▄
 *          █ █          █ █     tail outside the span
 *
 * Usage:
 *   node scripts/match-scale-dataset.mts countries --source <ne_50m_admin_0_countries.geojson>
 *     --input <countries.yaml> --out <countries.yaml> --review <countries.html>
 *   node scripts/match-scale-dataset.mts animals --input <animals.yaml> --cache <raw/phylopic>
 *     --out <animals.yaml> --review <animals.html>
 *   node scripts/match-scale-dataset.mts selftest
 *
 * The countries input holds JSON (valid YAML): {"exclude": ["<ADM0_A3>", …]}. The animals input
 * too: {"category", "displayName", "entries": [{"name", "phylopic": "<image uuid>",
 * "axis": "length" | "height", "metres", "source", "span"?: [from, to], "kind"?}]}; the span is in
 * the generated path's units (0…1000, y down) along the measured axis, "kind" a note on what was
 * measured (e.g. "Kopf-Rumpf-Länge", "Schulterhöhe") that the script ignores. Input, output and
 * review page are plaintext game content: they live in the main checkout's
 * .local/games/match-scale/ (input/, categories/, raw/), never in the repo.
 *
 * Node 24, no dependencies: types are stripped by Node, the YAML and SVG are handled by hand.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A part is kept if its bbox centre lies in the largest polygon's bbox, grown by this × its longest side… */
const PART_REACH = 0.5;
/** …and its area is at least this share of the largest polygon's. */
const MIN_PART_SHARE = 0.002;
/** Douglas-Peucker tolerance, in units of the normalised 1000 side. */
const SIMPLIFY_UNITS = 1.5;

const SIDE = 1000;
const EARTH_RADIUS = 6_371_008.8;
/**
 * Errs on inclusion: the input can only exclude. Natural Earth types some states "Sovereignty"
 * or "Disputed"; odd entries are struck on the review page.
 */
const COUNTRY_TYPES = new Set([
  "Sovereign country",
  "Country",
  "Sovereignty",
  "Disputed",
]);
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

/**
 * The real size one axis of the drawing stands for, and where that size was looked up. [span]: the
 * stretch of that axis it covers, in normalised units; absent, the whole bbox side.
 */
type Measure = {
  axis: "length" | "height";
  metres: number;
  source: string;
  span?: [number, number];
};

/** What every category writes and the review page pairs: a named, drawn silhouette. */
type Drawn = Shape & { name: string; attribution?: string; measure?: Measure };

type Entry = Drawn & {
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
    let drawn: Shape;
    try {
      drawn = shape(kept);
    } catch (error) {
      fail(`${code}: ${(error as Error).message}`);
    }
    entries.push({
      name,
      code,
      ...drawn,
      partsKept: kept.length,
      partsDropped: dropped,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "de"));

  // The name is what players see, so a clash is resolved by hand, never by decorating it.
  const shared = entries.filter((e) =>
    entries.some((o) => o !== e && o.name === e.name),
  );
  if (shared.length > 0) {
    fail(
      `entries share a name: ${shared.map((e) => e.code).join(", ")} — add one code to "exclude"`,
    );
  }

  const yaml = categoryYaml(
    "countries",
    "Länder",
    "Umrisse: Natural Earth",
    entries,
  );
  write(args.out, yaml);
  write(
    args.review,
    reviewPage(
      "Länder",
      entries,
      card,
      `winzig (längste Seite &lt; ${TINY_METRES / 1000} km): ${entries.filter(isTiny).length}
· mehr als ${MANY_POINTS} Punkte: ${entries.filter(hasManyPoints).length}
· Konstanten: PART_REACH ${PART_REACH}, MIN_PART_SHARE ${MIN_PART_SHARE}, SIMPLIFY_UNITS ${SIMPLIFY_UNITS}`,
    ),
  );

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
  entries: Drawn[],
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
    if (e.measure)
      lines.push(
        "    measure:",
        `      axis: ${e.measure.axis}`,
        `      metres: ${e.measure.metres}`,
        `      source: ${JSON.stringify(e.measure.source)}`,
        ...(e.measure.span
          ? [`      span: [${e.measure.span.join(", ")}]`]
          : []),
      );
    if (e.attribution)
      lines.push(`    attribution: ${JSON.stringify(e.attribution)}`);
  }
  return `${lines.join("\n")}\n`;
}

function report(
  considered: number,
  left: number,
  entries: Entry[],
  bytes: number,
) {
  console.log(
    `countries: ${considered} considered, ${left} left out, ${entries.length} written`,
  );
  sizeReport(entries, bytes);
  console.log(
    `flags: ${entries.filter(isTiny).length} tiny (< ${TINY_METRES / 1000} km), ` +
      `${entries.filter(hasManyPoints).length} > ${MANY_POINTS} points, ` +
      `${entries.reduce((sum, e) => sum + e.partsDropped, 0)} parts dropped`,
  );
}

/** What the file costs on the wire: size, points per path, the largest entry. */
function sizeReport(entries: Drawn[], bytes: number) {
  const points = entries.map((e) => e.points);
  const largest = entries.reduce((a, b) =>
    b.path.length > a.path.length ? b : a,
  );
  const kb = (bytes / 1000).toFixed(1);

  console.log(
    `file: ${kb} KB${bytes >= SIZE_BUDGET ? `  WARNING: ≥ ${SIZE_BUDGET / 1000} KB` : ""}`,
  );
  console.log(
    `points per path: mean ${(points.reduce((a, b) => a + b, 0) / points.length).toFixed(1)}, max ${Math.max(...points)}`,
  );
  console.log(
    `largest entry: ${largest.name} (${largest.path.length} B path, ${largest.points} points)`,
  );
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

/** `[a b c d e f]` maps (x, y) to (a·x + c·y + e, b·x + d·y + f), as in SVG's matrix(). */
type Matrix = [number, number, number, number, number, number];

/** A line or a cubic, its points already in the root's coordinates. */
type Segment = { to: Point; c1?: Point; c2?: Point };
type Subpath = { start: Point; segments: Segment[] };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** One flattened cubic segment per this many units of its control polygon, at the 1000 side. */
const FLATTEN_UNITS = 4;
const MAX_CURVE_STEPS = 64;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
/** Containers whose children are never painted as they stand. */
const NOT_RENDERED = new Set([
  "defs",
  "clipPath",
  "mask",
  "metadata",
  "title",
  "desc",
  "symbol",
  "marker",
  "pattern",
  "style",
  "script",
]);

/** m · n: n applies first. */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const applyMatrix = (m: Matrix, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

const numbersIn = (text: string) =>
  [...text.matchAll(new RegExp(NUMBER.source, "g"))].map((m) => Number(m[0]));

/** `translate(10 20) scale(2)` → one matrix; the list applies right to left, like nesting. */
function parseTransform(text: string): Matrix {
  let m = IDENTITY;
  for (const [, name, args] of text.matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g,
  )) {
    const v = numbersIn(args);
    const cos = Math.cos(rad(v[0]));
    const sin = Math.sin(rad(v[0]));
    let t: Matrix;
    if (name === "matrix") t = [v[0], v[1], v[2], v[3], v[4], v[5]];
    else if (name === "translate") t = [1, 0, 0, 1, v[0], v[1] ?? 0];
    else if (name === "scale") t = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else if (name === "skewX") t = [1, 0, Math.tan(rad(v[0])), 1, 0, 0];
    else if (name === "skewY") t = [1, Math.tan(rad(v[0])), 0, 1, 0, 0];
    else {
      t = [cos, sin, -sin, cos, 0, 0];
      if (v.length >= 3) {
        t = multiply(multiply([1, 0, 0, 1, v[1], v[2]], t), [
          1,
          0,
          0,
          1,
          -v[1],
          -v[2],
        ]);
      }
    }
    m = multiply(m, t);
  }
  return m;
}

/** Endpoint arc → centre form → cubics of at most 90° each (SVG 1.1, appendix F.6). */
function arcToCubics(
  from: Point,
  rxIn: number,
  ryIn: number,
  angle: number,
  large: boolean,
  sweep: boolean,
  to: Point,
): Segment[] {
  if (from[0] === to[0] && from[1] === to[1]) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ to }];

  const cos = Math.cos(rad(angle));
  const sin = Math.sin(rad(angle));
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;

  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coefficient =
    (large === sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (coefficient * rx * y1) / ry;
  const cy1 = (-coefficient * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;

  const between = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = between(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = between(
    (x1 - cx1) / rx,
    (y1 - cy1) / ry,
    (-x1 - cx1) / rx,
    (-y1 - cy1) / ry,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / steps;
  const k = (4 / 3) * Math.tan(step / 4);
  const onEllipse = ([ux, uy]: Point): Point => [
    cx + rx * ux * cos - ry * uy * sin,
    cy + rx * ux * sin + ry * uy * cos,
  ];

  const segments: Segment[] = [];
  for (let i = 0; i < steps; i++) {
    const a1 = start + i * step;
    const a2 = a1 + step;
    segments.push({
      c1: onEllipse([
        Math.cos(a1) - k * Math.sin(a1),
        Math.sin(a1) + k * Math.cos(a1),
      ]),
      c2: onEllipse([
        Math.cos(a2) + k * Math.sin(a2),
        Math.sin(a2) - k * Math.cos(a2),
      ]),
      to: i === steps - 1 ? to : onEllipse([Math.cos(a2), Math.sin(a2)]),
    });
  }
  return segments;
}

/**
 * Path data → subpaths of lines and cubics, every command absolute or relative (M L H V C S Q T A
 * Z), implicit repeats included. Quadratics become cubics, arcs become cubics; [matrix] then maps
 * the control points, which is exact for Béziers under an affine map.
 */
function parsePathData(d: string, matrix: Matrix): Subpath[] {
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const number = () => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) throw new Error(`path data: number expected at ${i}`);
    i = NUMBER.lastIndex;
    return Number(match[0]);
  };
  const flag = () => {
    skip();
    const c = d[i++];
    if (c !== "0" && c !== "1")
      throw new Error(`path data: flag expected at ${i - 1}`);
    return c === "1";
  };

  const local: { start: Point; segments: Segment[] }[] = [];
  let current: Segment[] | null = null;
  let cursor: Point = [0, 0];
  let start: Point = [0, 0];
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;
  let command = "";

  const begin = (p: Point) => {
    current = [];
    local.push({ start: p, segments: current });
    start = cursor = p;
  };
  const add = (segment: Segment) => {
    if (current === null) begin(cursor);
    current!.push(segment);
    cursor = segment.to;
  };
  const reflect = (p: Point | null): Point =>
    p === null ? cursor : [2 * cursor[0] - p[0], 2 * cursor[1] - p[1]];

  for (;;) {
    skip();
    if (i >= d.length) break;
    if (/[a-zA-Z]/.test(d[i])) command = d[i++];
    else if (command === "")
      throw new Error("path data: starts without a command");

    const relative = command === command.toLowerCase();
    const point = (): Point => {
      const x = number();
      const y = number();
      return relative ? [cursor[0] + x, cursor[1] + y] : [x, y];
    };

    let cubic: Point | null = null;
    let quad: Point | null = null;
    switch (command.toUpperCase()) {
      case "M":
        begin(point());
        command = relative ? "l" : "L";
        break;
      case "Z":
        cursor = start;
        current = null;
        command = "";
        break;
      case "L":
        add({ to: point() });
        break;
      case "H": {
        const x = number();
        add({ to: [relative ? cursor[0] + x : x, cursor[1]] });
        break;
      }
      case "V": {
        const y = number();
        add({ to: [cursor[0], relative ? cursor[1] + y : y] });
        break;
      }
      case "C": {
        const c1 = point();
        const c2 = point();
        add({ c1, c2, to: point() });
        cubic = c2;
        break;
      }
      case "S": {
        const c1 = reflect(lastCubic);
        const c2 = point();
        add({ c1, c2, to: point() });
        cubic = c2;
        break;
      }
      case "Q":
      case "T": {
        const from = cursor;
        const q = command.toUpperCase() === "Q" ? point() : reflect(lastQuad);
        const to = point();
        add({
          c1: [
            from[0] + (2 / 3) * (q[0] - from[0]),
            from[1] + (2 / 3) * (q[1] - from[1]),
          ],
          c2: [
            to[0] + (2 / 3) * (q[0] - to[0]),
            to[1] + (2 / 3) * (q[1] - to[1]),
          ],
          to,
        });
        quad = q;
        break;
      }
      case "A": {
        const rx = number();
        const ry = number();
        const angle = number();
        const large = flag();
        const sweep = flag();
        const to = point();
        for (const segment of arcToCubics(
          cursor,
          rx,
          ry,
          angle,
          large,
          sweep,
          to,
        ))
          add(segment);
        cursor = to;
        break;
      }
      default:
        throw new Error(`path data: unknown command ${command}`);
    }
    lastCubic = cubic;
    lastQuad = quad;
  }

  return local.map(({ start, segments }) => ({
    start: applyMatrix(matrix, start),
    segments: segments.map(({ c1, c2, to }) => ({
      c1: c1 && applyMatrix(matrix, c1),
      c2: c2 && applyMatrix(matrix, c2),
      to: applyMatrix(matrix, to),
    })),
  }));
}

/** The basic shapes, as path data; only reached if a file has them. */
function shapeData(tag: string, a: Record<string, string>): string | null {
  const n = (key: string) => Number(a[key] ?? 0);
  if (tag === "path") return a.d ?? null;
  if (tag === "rect")
    return `M${n("x")} ${n("y")}h${n("width")}v${n("height")}h${-n("width")}z`;
  if (tag === "circle" || tag === "ellipse") {
    const rx = tag === "circle" ? n("r") : n("rx");
    const ry = tag === "circle" ? n("r") : n("ry");
    const [cx, cy] = [n("cx"), n("cy")];
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}z`;
  }
  if (tag === "polygon" || tag === "polyline") {
    const v = numbersIn(a.points ?? "");
    if (v.length < 6) return null;
    let d = `M${v[0]} ${v[1]}`;
    for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
    return `${d}z`;
  }
  return null;
}

/** Paint that shows on a white page: no fill, or white, draws nothing of the silhouette. */
function isInk(fill: string): boolean {
  const f = fill.replace(/\s+/g, "").toLowerCase();
  return ![
    "none",
    "transparent",
    "white",
    "#fff",
    "#ffffff",
    "rgb(255,255,255)",
  ].includes(f);
}

/**
 * Every filled shape of an SVG as subpaths in root coordinates: ancestors' and own transforms
 * applied, invisible containers and white or unfilled shapes skipped. Text only, no evaluation:
 * the file comes from the internet.
 */
function svgSubpaths(svg: string): Subpath[] {
  type Context = { matrix: Matrix; fill: string; hidden: boolean };
  const stack: Context[] = [{ matrix: IDENTITY, fill: "black", hidden: false }];
  const subpaths: Subpath[] = [];

  const text = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const [, closing, tag, attributeText, selfClosing] of text.matchAll(
    /<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g,
  )) {
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    const a: Record<string, string> = {};
    for (const [, key, double, single] of attributeText.matchAll(
      /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    ))
      a[key] = double ?? single;
    const style: Record<string, string> = {};
    for (const declaration of (a.style ?? "").split(";")) {
      const [key, value] = declaration.split(":").map((s) => s?.trim());
      if (key && value) style[key] = value;
    }

    const parent = stack[stack.length - 1];
    const context: Context = {
      matrix: a.transform
        ? multiply(parent.matrix, parseTransform(a.transform))
        : parent.matrix,
      fill: style.fill ?? a.fill ?? parent.fill,
      hidden:
        parent.hidden ||
        NOT_RENDERED.has(tag) ||
        (style.display ?? a.display) === "none" ||
        (style.visibility ?? a.visibility) === "hidden",
    };

    const data =
      context.hidden || !isInk(context.fill) ? null : shapeData(tag, a);
    if (data) subpaths.push(...parsePathData(data, context.matrix));

    if (!selfClosing) stack.push(context);
  }

  return subpaths;
}

/**
 * Subpaths → closed rings of points. Curves get more steps the longer they are at the final
 * 1000 side, so a long sweep stays round and a hair stays a few points; Douglas-Peucker then
 * thins both alike.
 */
function flatten(subpaths: Subpath[]): Point[][] {
  const all = subpaths.flatMap(({ start, segments }) => [
    start,
    ...segments.flatMap((s) => [s.to, ...(s.c1 ? [s.c1, s.c2!] : [])]),
  ]);
  const box = bbox(all);
  const scale = SIDE / Math.max(box.w, box.h);

  return subpaths.map(({ start, segments }) => {
    const ring: Point[] = [start];
    let from = start;
    for (const { c1, c2, to } of segments) {
      if (c1 && c2) {
        const length =
          Math.hypot(c1[0] - from[0], c1[1] - from[1]) +
          Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) +
          Math.hypot(to[0] - c2[0], to[1] - c2[1]);
        const steps = Math.min(
          MAX_CURVE_STEPS,
          Math.max(2, Math.ceil((length * scale) / FLATTEN_UNITS)),
        );
        for (let j = 1; j < steps; j++) {
          const t = j / steps;
          const u = 1 - t;
          ring.push([
            u * u * u * from[0] +
              3 * u * u * t * c1[0] +
              3 * u * t * t * c2[0] +
              t * t * t * to[0],
            u * u * u * from[1] +
              3 * u * u * t * c1[1] +
              3 * u * t * t * c2[1] +
              t * t * t * to[1],
          ]);
        }
      }
      ring.push(to);
      from = to;
    }
    return dedupe(ring);
  });
}

/** Even-odd on a ray to the right: is [point] inside [ring]? */
function inside([px, py]: Point, ring: Point[]): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      result = !result;
  }
  return result;
}

/**
 * Loose rings → polygons, by how deeply each lies in the others: even depth is an outer ring,
 * odd depth a hole in the smallest ring around it. The source's own winding is not trusted.
 *
 *   ┌──────────┐  depth 0: outer
 *   │ ┌──────┐ │  depth 1: hole
 *   │ │ ┌──┐ │ │  depth 2: an island in the hole, outer again
 */
function nest(rings: Point[][]): Polygon[] {
  const usable = rings.filter(
    (ring) => ring.length >= 3 && signedArea(ring) !== 0,
  );
  const area = usable.map((ring) => Math.abs(signedArea(ring)));
  const around = usable.map((ring, i) =>
    usable
      .map((_, j) => j)
      .filter(
        (j) => j !== i && area[j] > area[i] && inside(ring[0], usable[j]),
      ),
  );

  const polygons = new Map<number, Polygon>();
  usable.forEach((ring, i) => {
    if (around[i].length % 2 === 0) polygons.set(i, [ring]);
  });
  usable.forEach((ring, i) => {
    if (around[i].length % 2 === 0) return;
    const parent = around[i].reduce((a, b) => (area[b] < area[a] ? b : a));
    polygons.get(parent)?.push(ring);
  });
  return [...polygons.values()];
}

/** An SVG silhouette as the countries' pipeline wants it: polygons, y pointing north. */
function svgPolygons(svg: string): Polygon[] {
  return nest(flatten(svgSubpaths(svg))).map((polygon) =>
    polygon.map((ring) => ring.map(([x, y]): Point => [x, -y])),
  );
}

// ─── animals ─────────────────────────────────────────────────────────────────

const PHYLOPIC_API = "https://api.phylopic.org";
const PHYLOPIC_IMAGES = "https://images.phylopic.org/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Shorter side below this share of the longer one: a sliver the player can hardly grab. */
const THIN_ASPECT = 0.2;

type AnimalInput = {
  name: string;
  phylopic: string;
  axis: Measure["axis"];
  metres: number;
  source: string;
  span?: [number, number];
};

type Animal = Drawn & {
  attribution: string;
  measure: Measure;
  licence: string;
  contributor: string;
  uuid: string;
  partners: number;
};

/**
 * Usable licences only: public domain, CC BY, CC BY-NC (countdown is non-commercial, the
 * attribution is shown). Share-alike would bind the dataset, anything else is unknown.
 */
function licenceOf(href: string): { label: string; byline: boolean } | null {
  const m =
    /^https?:\/\/creativecommons\.org\/(?:publicdomain\/(zero|mark)\/1\.0|licenses\/(by|by-nc)\/(\d\.\d))\/?$/.exec(
      href,
    );
  if (!m) return null;
  if (m[1] === "zero") return { label: "CC0 1.0", byline: false };
  if (m[1] === "mark") return { label: "Public Domain Mark", byline: false };
  return { label: `CC ${m[2].toUpperCase()} ${m[3]}`, byline: true };
}

/** Metadata and vector file of one image, from [cache] or fetched into it once. */
async function phylopic(uuid: string, cache: string) {
  const metaPath = join(cache, `${uuid}.json`);
  const svgPath = join(cache, `${uuid}.svg`);

  if (!existsSync(metaPath)) {
    const response = await fetch(`${PHYLOPIC_API}/images/${uuid}`);
    if (!response.ok) throw new Error(`metadata: HTTP ${response.status}`);
    writeFileSync(metaPath, await response.text());
    console.log(`fetched ${metaPath}`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));

  // Only ever follow links onto PhyloPic's own image host: the metadata is someone else's data.
  if (!existsSync(svgPath)) {
    const links = meta?._links ?? {};
    const href = String(links.vectorFile?.href ?? links.sourceFile?.href ?? "");
    if (!href.startsWith(PHYLOPIC_IMAGES) || !href.endsWith(".svg"))
      throw new Error(`no SVG on ${PHYLOPIC_IMAGES}: "${href}"`);
    const response = await fetch(href);
    if (!response.ok) throw new Error(`vector file: HTTP ${response.status}`);
    writeFileSync(svgPath, await response.text());
    console.log(`fetched ${svgPath}`);
  }

  return { meta, svg: readFileSync(svgPath, "utf8") };
}

function readAnimalInput(path: string) {
  const input = JSON.parse(readFileSync(path, "utf8"));
  const valid =
    /^[a-z0-9-]+$/.test(input?.category ?? "") &&
    typeof input.displayName === "string" &&
    input.displayName.trim() !== "" &&
    Array.isArray(input.entries);
  if (!valid)
    fail(`${path}: expected {"category", "displayName", "entries": […]}`);

  (input.entries as unknown[]).forEach((raw, index) => {
    const e = raw as Partial<AnimalInput>;
    const ok =
      typeof e.name === "string" &&
      e.name.trim() !== "" &&
      UUID.test(e.phylopic ?? "") &&
      (e.axis === "length" || e.axis === "height") &&
      typeof e.metres === "number" &&
      Number.isFinite(e.metres) &&
      e.metres > 0 &&
      typeof e.source === "string" &&
      e.source.startsWith("https://") &&
      (e.span === undefined || isSpan(e.span));
    if (!ok)
      fail(
        `${path} entry #${index}: expected {"name", "phylopic": "<uuid>", "axis": "length"|"height", "metres": > 0, "source": "https://…", "span"?: [from, to] with 0 <= from < to <= ${SIDE}}`,
      );
  });

  return input as {
    category: string;
    displayName: string;
    entries: AnimalInput[];
  };
}

const isSpan = (span: unknown): span is [number, number] =>
  Array.isArray(span) &&
  span.length === 2 &&
  span.every((n) => typeof n === "number" && Number.isFinite(n)) &&
  span[0] >= 0 &&
  span[0] < span[1] &&
  span[1] <= SIDE;

/**
 * Metres per normalised unit from one measure: its metres over the stretch it covers. A 2 m
 * shoulder height spanning y 380…1000 of a 1000-high drawing → 2 / 620, not 2 / 1000.
 */
function metresPerUnitOf(drawn: Shape, measure: Measure): number {
  const side = measure.axis === "length" ? drawn.width : drawn.height;
  if (measure.span && measure.span[1] > side)
    throw new Error(
      `span ${measure.span.join("…")} reaches past the drawn ${measure.axis} ${side}`,
    );
  const extent = measure.span ? measure.span[1] - measure.span[0] : side;
  return measure.metres / extent;
}

async function animals(args: Record<string, string>) {
  for (const key of ["input", "cache", "out", "review"]) {
    if (!args[key]) fail(`animals needs --${key} <path>`);
  }

  const input = readAnimalInput(args.input);
  mkdirSync(args.cache, { recursive: true });

  const entries: Animal[] = [];
  for (const [index, e] of input.entries.entries()) {
    let fetched: Awaited<ReturnType<typeof phylopic>>;
    try {
      fetched = await phylopic(e.phylopic, args.cache);
    } catch (error) {
      fail(`entry #${index}: ${(error as Error).message}`);
    }
    const { meta, svg } = fetched;

    const licenceHref = String(meta?._links?.license?.href ?? "");
    const licence = licenceOf(licenceHref);
    if (!licence)
      fail(
        `entry #${index}: licence "${licenceHref}" is not usable (CC0, PDM, CC BY, CC BY-NC)`,
      );

    const contributor = String(
      meta?.attribution ?? meta?._links?.contributor?.title ?? "",
    ).trim();
    if (licence.byline && contributor === "")
      fail(
        `entry #${index}: ${licence.label} needs a contributor to credit, the metadata has none`,
      );
    const who = contributor || "unbekannt";

    let drawn: Shape;
    try {
      drawn = shape(svgPolygons(svg));
    } catch (error) {
      fail(`entry #${index}: ${(error as Error).message}`);
    }

    // The hand list measured one axis of this drawing; the other follows from it.
    // Seen from the side, an animal's length is the drawing's width.
    const measure: Measure = {
      axis: e.axis,
      metres: e.metres,
      source: e.source,
      ...(e.span ? { span: e.span } : {}),
    };
    let metresPerUnit: number;
    try {
      metresPerUnit = metresPerUnitOf(drawn, measure);
    } catch (error) {
      fail(`entry #${index}: ${(error as Error).message}`);
    }
    entries.push({
      ...drawn,
      metresPerUnit,
      name: e.name.trim(),
      attribution: licence.byline
        ? `Silhouette: ${who}, ${licence.label} (PhyloPic)`
        : `Silhouette: ${who} (PhyloPic)`,
      measure,
      licence: licence.label,
      contributor,
      uuid: e.phylopic,
      partners: 0,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "de"));

  const shared = entries.filter((e) =>
    entries.some((o) => o !== e && o.name === e.name),
  );
  if (shared.length > 0) {
    fail(
      `entries share a name: ${[...new Set(shared.map((e) => e.name))].join(", ")}`,
    );
  }

  // Partners as the backend counts them: real longest sides within MAX_FACTOR.
  for (const e of entries) {
    e.partners = entries.filter((o) => {
      const factor = o.metresPerUnit / e.metresPerUnit;
      return o !== e && factor >= 1 / MAX_FACTOR && factor <= MAX_FACTOR;
    }).length;
  }

  const yaml = categoryYaml(
    input.category,
    input.displayName,
    "Silhouetten: PhyloPic",
    entries,
  );
  write(args.out, yaml);
  write(
    args.review,
    reviewPage(
      input.displayName,
      entries,
      animalCard,
      `mehr als ${MANY_POINTS} Punkte: ${entries.filter(hasManyPoints).length}
· schmal (Seitenverhältnis &lt; ${THIN_ASPECT}): ${entries.filter(isThin).length}
· ohne Urheber: ${entries.filter((e) => e.contributor === "").length}
· Konstanten: SIMPLIFY_UNITS ${SIMPLIFY_UNITS}, FLATTEN_UNITS ${FLATTEN_UNITS}`,
    ),
  );

  console.log(`animals: ${entries.length} written`);
  sizeReport(entries, Buffer.byteLength(yaml));
  console.log(
    `flags: ${entries.filter(hasManyPoints).length} > ${MANY_POINTS} points, ` +
      `${entries.filter(isThin).length} thin, ` +
      `${entries.filter((e) => e.contributor === "").length} without contributor`,
  );
  console.log(`licences: ${tally(entries.map((e) => e.licence))}`);
  console.log(
    `partners within factor ${MAX_FACTOR} (partners: animals): ${tally(entries.map((e) => String(e.partners)))}`,
  );
}

/** `["a", "b", "a"]` → `a: 2, b: 1`, most frequent first. */
function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .sort(
      (a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0], "en", { numeric: true }),
    )
    .map(([v, n]) => `${v}: ${n}`)
    .join(", ");
}

const isThin = (e: Drawn) =>
  Math.min(e.width, e.height) < THIN_ASPECT * Math.max(e.width, e.height);

function animalCard(e: Animal): string {
  const flags = [
    hasManyPoints(e) ? `${e.points} Punkte` : "",
    isThin(e) ? "schmal" : "",
    e.contributor === "" ? "ohne Urheber" : "",
    e.partners < 2 ? `${e.partners} Partner` : "",
  ].filter(Boolean);
  const metres = e.measure.metres.toLocaleString("de-DE", {
    maximumFractionDigits: 3,
  });
  return `<figure class="${flags.length > 0 ? "flag" : ""}">
  <svg viewBox="0 0 ${e.width} ${e.height}"><path d="${e.path}"/></svg>
  <figcaption><b>${escape(e.name)}</b><br>
  ${e.measure.axis === "length" ? "Länge" : "Höhe"} ${metres} m · ${e.points} Punkte · ${e.partners} Partner<br>
  <a href="${escape(e.measure.source)}">Quelle</a> · <a href="https://www.phylopic.org/images/${e.uuid}">Bild</a><br>
  <small>${escape(e.attribution)}</small>
  ${flags.length > 0 ? `<br><mark>${flags.join(" · ")}</mark>` : ""}</figcaption>
</figure>`;
}

// ─── review page ─────────────────────────────────────────────────────────────

const isTiny = (e: Entry) => SIDE * e.metresPerUnit < TINY_METRES;
const hasManyPoints = (e: Drawn) => e.points > MANY_POINTS;

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
function pair(a: Drawn, b: Drawn): string {
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

/** One page per category: [summary] and [card] are the category's own, the pairs are shared. */
function reviewPage<T extends Drawn>(
  title: string,
  entries: T[],
  card: (entry: T) => string,
  summary: string,
): string {
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
<title>Augenmaß – ${escape(title)}</title>
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
<h1>Augenmaß – ${escape(title)}</h1>
<p>${entries.length} Einträge · ${summary}</p>
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

  // SVG: a transform chain on ancestors and the element, a relative cubic, an implicit lineto.
  //   (0,0) ─translate(1 1)→ (1,1) ─rotate(90)→ (−1,1) ─scale(2)→ (−2,2) ─translate(10 20)→ (8,22)
  const svg = `<svg viewBox="0 0 100 100"><!-- <path d="M0 0h999"/> -->
    <g transform="translate(10,20) scale(2)"><g transform="rotate(90)">
      <path transform="matrix(1 0 0 1 1 1)" d="m0 0c0 10 10 10 10 0l0-5 -10 0z"/>
      <path fill="#FFFFFF" d="M0 0h999v999z"/>
    </g></g></svg>`;
  const [subpath, ...others] = svgSubpaths(svg);
  check(
    others.length === 0,
    `${others.length} extra subpaths: comment or white fill leaked`,
  );
  const near = (p: Point, q: Point) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
  check(near(subpath.start, [8, 22]), `start mapped to ${subpath.start}`);
  // c's points are relative to (1,1): its end (11,1) lands on (8,42), the curve's top (6,8.5) on (−7,32).
  check(
    near(subpath.segments[0].to, [8, 42]),
    `cubic ends at ${subpath.segments[0].to}`,
  );
  check(
    near(subpath.segments[2].to, [18, 22]),
    `implicit lineto ends at ${subpath.segments[2].to}`,
  );
  const [ring] = flatten([subpath]);
  check(
    ring.some((p) => near(p, [-7, 32])),
    "the flattened cubic misses its midpoint",
  );

  // A ring inside a ring is a hole: it winds against its outer ring once drawn.
  const box = (size: number, at: number): string =>
    `M${at} ${at}h${size}v${size}h${-size}z`;
  const holed = shape(
    svgPolygons(`<svg><path d="${box(100, 0)}${box(20, 40)}"/></svg>`),
  );
  const [holedOuter, holedInner] = parsePath(holed.path);
  check(
    Math.sign(signedArea(holedOuter)) === -Math.sign(signedArea(holedInner)),
    "an inner SVG ring is not a hole",
  );

  // The measure travels into the category file, under the entry it belongs to.
  const measured = categoryYaml("example", "Beispiel", "Quelle", [
    {
      ...holed,
      name: "Beispieltier",
      measure: {
        axis: "length",
        metres: 2.3,
        source: "https://example.org/beispieltier",
      },
    },
  ]);
  check(
    measured.includes(
      '    measure:\n      axis: length\n      metres: 2.3\n      source: "https://example.org/beispieltier"\n',
    ),
    "the measure is missing from the category file",
  );

  // A span half the drawn width stands for the same metres: twice the metres per unit.
  const spanned = { width: 1000, height: 400 } as Shape;
  const whole = metresPerUnitOf(spanned, {
    axis: "length",
    metres: 2,
    source: "https://example.org/beispieltier",
  });
  const half = metresPerUnitOf(spanned, {
    axis: "length",
    metres: 2,
    source: "https://example.org/beispieltier",
    span: [250, 750],
  });
  check(Math.abs(half / whole - 2) < 1e-12, `span halves to ${half / whole}`);

  // A height span is read along y and may not reach past the drawn height.
  check(
    Math.abs(
      metresPerUnitOf(spanned, {
        axis: "height",
        metres: 1,
        source: "https://example.org/beispieltier",
        span: [200, 400],
      }) -
        1 / 200,
    ) < 1e-12,
    "a height span is not read along y",
  );
  let overreach = false;
  try {
    metresPerUnitOf(spanned, {
      axis: "height",
      metres: 1,
      source: "https://example.org/beispieltier",
      span: [200, 500],
    });
  } catch {
    overreach = true;
  }
  check(overreach, "a span past the drawn height was accepted");

  // The span travels into the category file inside the measure.
  const withSpan = categoryYaml("example", "Beispiel", "Quelle", [
    {
      ...holed,
      name: "Beispieltier",
      measure: {
        axis: "length",
        metres: 2.3,
        source: "https://example.org/beispieltier",
        span: [120, 870],
      },
    },
  ]);
  check(
    withSpan.includes(
      '      source: "https://example.org/beispieltier"\n      span: [120, 870]\n',
    ),
    "the span is missing from the category file",
  );
  check(
    !isSpan([870, 120]) && !isSpan([0, 1001]) && !isSpan([0]),
    "a bad span passed",
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
else if (command === "animals") await animals(options(rest));
else
  fail(
    "usage: node scripts/match-scale-dataset.mts selftest | countries --source … --input … --out … --review … | animals --input … --cache … --out … --review …",
  );
