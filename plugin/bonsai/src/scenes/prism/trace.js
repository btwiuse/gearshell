// 2D ray-tracing helpers used by the prism scene: refraction, reflection,
// segment casts against the triangle, and full multi-bounce traces.

export const cross2 = (ax, ay, bx, by) => ax * by - ay * bx;

// 2D refraction at the interface (ix,iy) -> (nx,ny) with refractive ratio eta.
// Returns false when total internal reflection occurs; out gets the refracted ray.
export function refract2(ix, iy, nx, ny, eta, out) {
  let d = ix * nx + iy * ny;
  if (d > 0) {
    nx = -nx;
    ny = -ny;
    d = -d;
  }
  const cosi = -d;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return false;
  const f = eta * cosi - Math.sqrt(k);
  out.x = eta * ix + f * nx;
  out.y = eta * iy + f * ny;
  return true;
}

// 2D reflection of (ix,iy) at a surface normal (nx,ny), into out.
export function reflect2(ix, iy, nx, ny, out) {
  const d = ix * nx + iy * ny;
  out.x = ix - 2 * d * nx;
  out.y = iy - 2 * d * ny;
}

// Polyline of fixed length that a trace fills as it advances through the prism.
export const MAX_TRACE_PTS = 5;
export const makeTraceRec = () => ({
  pts: Array.from({ length: MAX_TRACE_PTS }, () => ({ x: 0, y: 0 })),
  count: 0,
  ex: 0,
  ey: 0,
  dx: 0,
  dy: 0,
  len: 0,
  valid: false,
});
