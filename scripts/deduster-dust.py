#!/usr/bin/env python3
"""
Generates Entstauber's dust texture: a grey, seamlessly tiling square of soft clouds and fine grain.

The board lays it as one layer across the whole field (each tile shifts it by its place in the
grid), so the texture must wrap without a seam: every noise source below lives on a torus. The
defaults reproduce the committed webapp-vue/src/games/deduster/dust.jpg exactly — a fixed seed.
512 px drawn at 256 CSS px puts one texture pixel on one device pixel on a 2x screen.

Usage: ./scripts/deduster-dust.py /tmp/dust.png [--size 512] [--base 176] [--cloud 5] [--grain 9]
                                                [--fleck 0.025] [--blur 1] [--seed 7]
       sips -s format jpeg -s formatOptions 80 /tmp/dust.png --out webapp-vue/src/games/deduster/dust.jpg

Plain Python, no dependencies; it writes an 8-bit grey PNG. The JPEG step is macOS' sips — any
encoder at quality ~80 does. Noise compresses badly: lower quality saves bytes and smears the grain.
"""
import argparse
import random
import struct
import zlib

parser = argparse.ArgumentParser(description="Seamless grey dust texture for Entstauber.")
parser.add_argument("out", help="PNG file to write")
parser.add_argument("--size", type=int, default=512, help="edge in px")
parser.add_argument("--base", type=float, default=176, help="mean grey, 0–255")
parser.add_argument("--cloud", type=float, default=5, help="strength of the soft light/dark clouds")
parser.add_argument("--grain", type=float, default=9, help="strength of the fine grain")
parser.add_argument("--fleck", type=float, default=0.025, help="share of pixels lit up as specks")
parser.add_argument("--blur", type=int, default=1, help="grain softening radius in px")
parser.add_argument("--seed", type=int, default=7)
args = parser.parse_args()

N = args.size
rnd = random.Random(args.seed)


def periodic_value_noise(cells: int) -> list[list[float]]:
    """Smooth noise whose lattice wraps at the edges — e.g. 4 cells: 4 soft blobs across, tileable."""
    lattice = [[rnd.uniform(-1, 1) for _ in range(cells)] for _ in range(cells)]
    out = [[0.0] * N for _ in range(N)]
    for y in range(N):
        fy = y / N * cells
        y0 = int(fy)
        ty = fy - y0
        ty = ty * ty * (3 - 2 * ty)
        for x in range(N):
            fx = x / N * cells
            x0 = int(fx)
            tx = fx - x0
            tx = tx * tx * (3 - 2 * tx)
            a = lattice[y0 % cells][x0 % cells]
            b = lattice[y0 % cells][(x0 + 1) % cells]
            c = lattice[(y0 + 1) % cells][x0 % cells]
            d = lattice[(y0 + 1) % cells][(x0 + 1) % cells]
            top = a + (b - a) * tx
            bottom = c + (d - c) * tx
            out[y][x] = top + (bottom - top) * ty
    return out


def wrapping_box_blur(src: list[list[float]], radius: int) -> list[list[float]]:
    """Box blur that reads across the opposite edge, so the softened grain still tiles."""
    across = [[sum(src[y][(x + d) % N] for d in range(-radius, radius + 1)) for x in range(N)] for y in range(N)]
    both = [[sum(across[(y + d) % N][x] for d in range(-radius, radius + 1)) for x in range(N)] for y in range(N)]
    # A sum of k² unit-variance samples has deviation k: dividing by k keeps the grain at unit strength.
    k = 2 * radius + 1
    return [[v / k for v in row] for row in both]


# Draw order matters for reproducing the committed file: lattices, then grain, then specks per pixel.
clouds = [periodic_value_noise(4), periodic_value_noise(9)]
white = [[rnd.gauss(0, 1) for _ in range(N)] for _ in range(N)]
grain = wrapping_box_blur(white, args.blur)

rows = []
for y in range(N):
    row = bytearray([0])  # PNG filter type "none"
    for x in range(N):
        v = args.base + args.cloud * (clouds[0][y][x] + 0.5 * clouds[1][y][x]) + args.grain * grain[y][x]
        if rnd.random() < args.fleck:
            v += rnd.uniform(15, 40)
        row.append(max(0, min(255, int(round(v)))))
    rows.append(bytes(row))


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 0, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
with open(args.out, "wb") as f:
    f.write(png)
print(f"{args.out}: {N}×{N}, {len(png)} bytes")
