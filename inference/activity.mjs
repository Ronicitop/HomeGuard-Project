import { randomUUID } from "node:crypto";

// Sample luminance on a 64 x 48 grid. Subtract the median brightness shift
// so an exposure adjustment alone doesn't start a movement episode.
export function movement(frame, state) {
  const pixels = new Uint8Array(64 * 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++) {
      const i = ((10 * y + 5) * 640 + 10 * x + 5) * 3;
      pixels[y * 64 + x] =
        (frame[i] * 3 + frame[i + 1] * 6 + frame[i + 2]) / 10;
    }
  const previous = state.background;
  if (!previous) {
    state.background = Float32Array.from(pixels);
    return [];
  }
  const shifts = Array.from(pixels, (v, i) => v - previous[i]).sort(
    (a, b) => a - b,
  );
  const median = shifts[1536];
  let count = 0,
    left = 64,
    right = 0,
    top = 48,
    bottom = 0;
  for (let i = 0; i < pixels.length; i++) {
    const delta = pixels[i] - previous[i] - median;
    if (Math.abs(delta) > 28) {
      count++;
      left = Math.min(left, i % 64);
      right = Math.max(right, i % 64);
      top = Math.min(top, Math.floor(i / 64));
      bottom = Math.max(bottom, Math.floor(i / 64));
    }
    previous[i] += median + delta * 0.18;
  }
  return count >= 48 && count < pixels.length * 0.8
    ? [
        {
          category: "motion",
          label: "Movimiento",
          score: Math.min(1, count / 160),
          box: [
            left / 64,
            top / 48,
            (right - left + 1) / 64,
            (bottom - top + 1) / 48,
          ],
        },
      ]
    : [];
}

function posture(body) {
  const points = new Map(body.keypoints.map((p) => [p.part, p]));
  const votes = [];
  for (const side of ["left", "right"]) {
    const joints = ["Shoulder", "Hip", "Knee", "Ankle"].map((k) =>
      points.get(side + k),
    );
    if (joints.some((p) => !p || p.score < 0.35)) continue;
    const [shoulder, hip, knee, ankle] = joints.map((p) => p.position);
    const thigh = [hip[0] - knee[0], hip[1] - knee[1]];
    const shin = [ankle[0] - knee[0], ankle[1] - knee[1]];
    const length = Math.hypot(...thigh) * Math.hypot(...shin);
    if (length < 20 || shoulder[1] >= hip[1] || ankle[1] <= knee[1]) continue;
    const cosine = (thigh[0] * shin[0] + thigh[1] * shin[1]) / length;
    if (cosine < -0.82 && knee[1] - hip[1] > Math.abs(thigh[0]))
      votes.push("standing");
    else if (cosine > -0.55 && Math.abs(thigh[1]) < Math.abs(thigh[0]) * 0.9)
      votes.push("sitting");
  }
  return votes.length && votes.every((v) => v === votes[0])
    ? votes[0]
    : "indeterminate";
}

export function postures(bodies, state, now, gap) {
  state.tracks = (state.tracks || []).filter((t) => now - t.last < gap);
  const used = new Set();
  return bodies
    .filter((b) => b.score >= 0.3)
    .map((body) => {
      const [x, y, w, h] = body.box;
      const cx = x + w / 2,
        cy = y + h / 2;
      let nearest,
        distance = Infinity;
      for (const t of state.tracks) {
        const d = Math.hypot(cx - t.x, cy - t.y);
        if (
          !used.has(t) &&
          d < Math.max(35, Math.min(w, h) * 0.75) &&
          d < distance
        ) {
          nearest = t;
          distance = d;
        }
      }
      if (!nearest) {
        nearest = { id: randomUUID() };
        state.tracks.push(nearest);
      }
      used.add(nearest);
      Object.assign(nearest, { x: cx, y: cy, last: now });
      const category = posture(body);
      return {
        category,
        trackKey: nearest.id,
        score: body.score,
        label: {
          standing: "Persona de pie",
          sitting: "Persona sentada",
          indeterminate: "Postura indeterminada",
        }[category],
        box: [x / 640, y / 480, w / 640, h / 480],
      };
    });
}

// Require consecutive observations. Hold a confirmed posture across uncertain
// frames and close a motion episode after three quiet frames.
export function transitions(state, detections) {
  const keys = new Set(),
    events = [];
  for (const d of detections) {
    const key = d.trackKey || "motion";
    keys.add(key);
    const entry = state.get(key) || { count: 0 };
    entry.missing = 0;
    entry.count = entry.candidate === d.category ? entry.count + 1 : 1;
    entry.candidate = d.category;
    if (
      entry.count >= 3 &&
      d.category !== "indeterminate" &&
      entry.confirmed !== d.category
    ) {
      entry.confirmed = d.category;
      events.push(d);
    }
    state.set(key, entry);
  }
  for (const [key, entry] of state)
    if (!keys.has(key)) {
      entry.count = 0;
      if (++entry.missing >= (key === "motion" ? 3 : 30)) state.delete(key);
    }
  return events;
}
