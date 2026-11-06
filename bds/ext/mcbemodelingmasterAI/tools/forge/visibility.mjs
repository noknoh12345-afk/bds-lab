// The kart forge's visibility pass, in JavaScript for speed (the Python loop
// over half a million little triangles took two minutes; this takes seconds).
// Called by visibility.py: reads {pxPerUnit, directions, poses: [{quads, centres}]}
// on stdin - quads are the four corners of every face in model space, centres
// the centre of the box each face belongs to - and writes the indices of the
// faces some view shows.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const { pxPerUnit, directions, poses } = input;
const faceCount = poses[0].quads.length;
const seen = new Uint8Array(faceCount);

function basis(d) {
  const len = Math.hypot(d[0], d[1], d[2]);
  const f = [d[0] / len, d[1] / len, d[2] / len];
  const helper = Math.abs(f[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let r = [helper[1] * f[2] - helper[2] * f[1], helper[2] * f[0] - helper[0] * f[2], helper[0] * f[1] - helper[1] * f[0]];
  const rl = Math.hypot(r[0], r[1], r[2]);
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return [r, u, f];
}

for (const pose of poses) {
  const { quads, centres } = pose;
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const q of quads) for (const p of q) { cx += p[0]; cy += p[1]; cz += p[2]; n += 1; }
  cx /= n; cy /= n; cz /= n;
  let radius = 0;
  for (const q of quads) for (const p of q) radius = Math.max(radius, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
  const size = Math.floor(2 * radius * pxPerUnit) + 8;
  const zbuf = new Float32Array(size * size);
  const ids = new Int32Array(size * size);
  const sx = new Float64Array(4), sy = new Float64Array(4), sz = new Float64Array(4);
  // each face's outward normal (from its box's centre)
  const normals = quads.map((q, i) => {
    const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const mid = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2];
    const out = (mid[0] - centres[i][0]) * nn[0] + (mid[1] - centres[i][1]) * nn[1] + (mid[2] - centres[i][2]) * nn[2];
    return out < 0 ? [-nn[0], -nn[1], -nn[2]] : nn;
  });
  for (const d of directions) {
    const [r, u, f] = basis(d);
    zbuf.fill(Infinity);
    ids.fill(-1);
    for (let i = 0; i < faceCount; i += 1) {
      const nn = normals[i];
      // every part is a closed box: a face turned away is behind its own box's front
      if (nn[0] * f[0] + nn[1] * f[1] + nn[2] * f[2] <= 1e-9) continue;
      const q = quads[i];
      for (let k = 0; k < 4; k += 1) {
        const x = q[k][0] - cx, y = q[k][1] - cy, z = q[k][2] - cz;
        sx[k] = (x * r[0] + y * r[1] + z * r[2]) * pxPerUnit + size / 2;
        sy[k] = size / 2 - (x * u[0] + y * u[1] + z * u[2]) * pxPerUnit;
        sz[k] = -(x * f[0] + y * f[1] + z * f[2]);
      }
      for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
        const minx = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c])));
        const maxx = Math.min(size - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
        const miny = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c])));
        const maxy = Math.min(size - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
        if (minx > maxx || miny > maxy) continue;
        const v0x = sx[b] - sx[a], v0y = sy[b] - sy[a], v1x = sx[c] - sx[a], v1y = sy[c] - sy[a];
        const d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y;
        const den = d00 * d11 - d01 * d01;
        if (Math.abs(den) < 1e-12) continue;
        for (let py = miny; py <= maxy; py += 1) {
          const qy = py + 0.5 - sy[a];
          for (let px = minx; px <= maxx; px += 1) {
            const qx = px + 0.5 - sx[a];
            const d20 = qx * v0x + qy * v0y, d21 = qx * v1x + qy * v1y;
            const wb = (d11 * d20 - d01 * d21) / den;
            const wc = (d00 * d21 - d01 * d20) / den;
            const wa = 1 - wb - wc;
            if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
            const depth = wa * sz[a] + wb * sz[b] + wc * sz[c];
            const at = py * size + px;
            if (depth < zbuf[at] - 1e-5) { zbuf[at] = depth; ids[at] = i; }
          }
        }
      }
    }
    for (let at = 0; at < ids.length; at += 1) if (ids[at] >= 0) seen[ids[at]] = 1;
  }
}
const out = [];
for (let i = 0; i < faceCount; i += 1) if (seen[i]) out.push(i);
process.stdout.write(JSON.stringify(out));
