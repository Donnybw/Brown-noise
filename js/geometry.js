// Pure geometry, polygon, and 2D affine matrix helpers.
// Extracted from app.js during the modular refactor (no behavior changes).

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function pointSegmentDistance(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const denom = abx * abx + aby * aby;
    if (denom === 0) return Math.hypot(apx, apy);
    const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    return Math.hypot(p.x - cx, p.y - cy);
}

export function segmentsIntersect(a, b, c, d) {
    const eps = 1e-9;
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSegment = (p, q, r) =>
        Math.min(p.x, q.x) - eps <= r.x && r.x <= Math.max(p.x, q.x) + eps &&
        Math.min(p.y, q.y) - eps <= r.y && r.y <= Math.max(p.y, q.y) + eps &&
        Math.abs(orient(p, q, r)) <= eps;

    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);

    if ((o1 > eps && o2 < -eps || o1 < -eps && o2 > eps) && (o3 > eps && o4 < -eps || o3 < -eps && o4 > eps)) return true;
    if (Math.abs(o1) <= eps && onSegment(a, b, c)) return true;
    if (Math.abs(o2) <= eps && onSegment(a, b, d)) return true;
    if (Math.abs(o3) <= eps && onSegment(c, d, a)) return true;
    if (Math.abs(o4) <= eps && onSegment(c, d, b)) return true;
    return false;
}

export function segmentSegmentDistance(a, b, c, d) {
    if (segmentsIntersect(a, b, c, d)) return 0;
    return Math.min(
        pointSegmentDistance(a, c, d),
        pointSegmentDistance(b, c, d),
        pointSegmentDistance(c, a, b),
        pointSegmentDistance(d, a, b)
    );
}

export function polygonToSegmentDistance(polygon, a, b) {
    if (!polygon || polygon.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        min = Math.min(min, segmentSegmentDistance(polygon[i], polygon[j], a, b));
    }
    return min;
}

export function polygonToPolygonDistance(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < polyA.length; i++) {
        const j = (i + 1) % polyA.length;
        for (let k = 0; k < polyB.length; k++) {
            const l = (k + 1) % polyB.length;
            min = Math.min(min, segmentSegmentDistance(polyA[i], polyA[j], polyB[k], polyB[l]));
        }
    }
    return min;
}

export function closestPointOnSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const denom = abx * abx + aby * aby;
    if (denom === 0) return { x: a.x, y: a.y };

    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const t = clamp((apx * abx + apy * aby) / denom, 0, 1);
    return { x: a.x + t * abx, y: a.y + t * aby };
}

export function getPolygonSeparationDirection(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return null;

    let bestDist = Infinity;
    let bestA = null;
    let bestB = null;

    for (let i = 0; i < polyA.length; i++) {
        const j = (i + 1) % polyA.length;
        const a1 = polyA[i];
        const a2 = polyA[j];

        for (let k = 0; k < polyB.length; k++) {
            const l = (k + 1) % polyB.length;
            const b1 = polyB[k];
            const b2 = polyB[l];

            if (segmentsIntersect(a1, a2, b1, b2)) {
                bestDist = 0;
                bestA = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
                bestB = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
                break;
            }

            const bClose1 = closestPointOnSegment(a1, b1, b2);
            const d1 = Math.hypot(a1.x - bClose1.x, a1.y - bClose1.y);
            if (d1 < bestDist) {
                bestDist = d1;
                bestA = a1;
                bestB = bClose1;
            }

            const bClose2 = closestPointOnSegment(a2, b1, b2);
            const d2 = Math.hypot(a2.x - bClose2.x, a2.y - bClose2.y);
            if (d2 < bestDist) {
                bestDist = d2;
                bestA = a2;
                bestB = bClose2;
            }

            const aClose1 = closestPointOnSegment(b1, a1, a2);
            const d3 = Math.hypot(b1.x - aClose1.x, b1.y - aClose1.y);
            if (d3 < bestDist) {
                bestDist = d3;
                bestA = aClose1;
                bestB = b1;
            }

            const aClose2 = closestPointOnSegment(b2, a1, a2);
            const d4 = Math.hypot(b2.x - aClose2.x, b2.y - aClose2.y);
            if (d4 < bestDist) {
                bestDist = d4;
                bestA = aClose2;
                bestB = b2;
            }
        }

        if (bestDist === 0) break;
    }

    if (!bestA || !bestB) return null;
    const vx = bestA.x - bestB.x;
    const vy = bestA.y - bestB.y;
    const len = Math.hypot(vx, vy);
    if (!Number.isFinite(len) || len === 0) return { x: 1, y: 0, dist: bestDist };
    return { x: vx / len, y: vy / len, dist: bestDist };
}

export function normalizeAngleRad(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function getNearestBoundaryEdgeAngle(point, corners) {
    if (!point || !corners || corners.length < 2) return 0;
    let bestAngle = 0;
    let bestDist = Infinity;
    for (let i = 0; i < corners.length; i++) {
        const j = (i + 1) % corners.length;
        const a = corners[i];
        const b = corners[j];
        const d = pointSegmentDistance(point, a, b);
        if (d < bestDist) {
            bestDist = d;
            bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
        }
    }
    return bestAngle;
}

export function snapAngleToFenceLines(angle, fenceAngle) {
    const candidates = [0, 1, 2, 3].map((k) => fenceAngle + k * (Math.PI / 2));
    let best = candidates[0];
    let bestDiff = Infinity;
    for (const candidate of candidates) {
        const diff = Math.abs(normalizeAngleRad(angle - candidate));
        if (diff < bestDiff) {
            bestDiff = diff;
            best = candidate;
        }
    }
    return best;
}

// Helper: Point in Polygon (Ray Casting)
export function isPointInPolygon(p, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let isInside = false;

    // Calculate bounding box first for optimization
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;

    for (let i = 1; i < polygon.length; i++) {
        minX = Math.min(polygon[i].x, minX);
        maxX = Math.max(polygon[i].x, maxX);
        minY = Math.min(polygon[i].y, minY);
        maxY = Math.max(polygon[i].y, maxY);
    }

    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        return false;
    }

    // Ray casting
    let j = polygon.length - 1;
    for (let i = 0; i < polygon.length; i++) {
        if ((polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
            p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x) {
            isInside = !isInside;
        }
        j = i;
    }
    return isInside;
}

export function getRotatedRectCorners(rect) {
    if (!rect) return [];
    const angle = rect.rotation || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    const local = [
        { x: -halfW, y: halfH },  // front-left (bottom-left)
        { x: halfW, y: halfH },   // front-right (bottom-right)
        { x: halfW, y: -halfH },  // back-right (top-right)
        { x: -halfW, y: -halfH }  // back-left (top-left)
    ];

    return local.map((p) => ({
        x: rect.x + p.x * cos - p.y * sin,
        y: rect.y + p.x * sin + p.y * cos
    }));
}

// Check if point is inside shed
export function isPointInRotatedRect(pos, rect) {
    if (!rect) return false;
    const angle = rect.rotation || 0;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = pos.x - rect.x;
    const dy = pos.y - rect.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    return localX >= -halfW && localX <= halfW && localY >= -halfH && localY <= halfH;
}

// Calculate distance between two points in pixels, then convert to feet
export function calculateDistance(p1, p2, feetPerPixel) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    return pixelDistance * feetPerPixel;
}

// Calculate polygon area using Shoelace formula
export function calculatePolygonArea(corners, feetPerPixel) {
    let area = 0;
    const n = corners.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += corners[i].x * corners[j].y;
        area -= corners[j].x * corners[i].y;
    }

    area = Math.abs(area) / 2;
    // Convert from square pixels to square feet
    return area * feetPerPixel * feetPerPixel;
}

// Find the closest points between a polygon and a line segment
// Returns { polyPoint, segPoint, distance } or null if poly is empty
export function getClosestPointsBetweenPolygonAndSegment(poly, a, b) {
    if (!poly || poly.length < 2) return null;

    let bestDist = Infinity;
    let bestPolyPoint = null;
    let bestSegPoint = null;

    // Check each edge of the polygon
    for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];

        // Check all 4 combinations of endpoints and closest points
        // 1. Poly vertex to closest point on segment
        const seg1 = closestPointOnSegment(p1, a, b);
        const d1 = Math.hypot(p1.x - seg1.x, p1.y - seg1.y);
        if (d1 < bestDist) {
            bestDist = d1;
            bestPolyPoint = p1;
            bestSegPoint = seg1;
        }

        // 2. Segment endpoint to closest point on poly edge
        const poly1 = closestPointOnSegment(a, p1, p2);
        const d2 = Math.hypot(a.x - poly1.x, a.y - poly1.y);
        if (d2 < bestDist) {
            bestDist = d2;
            bestPolyPoint = poly1;
            bestSegPoint = a;
        }

        const poly2 = closestPointOnSegment(b, p1, p2);
        const d3 = Math.hypot(b.x - poly2.x, b.y - poly2.y);
        if (d3 < bestDist) {
            bestDist = d3;
            bestPolyPoint = poly2;
            bestSegPoint = b;
        }
    }

    return bestPolyPoint && bestSegPoint
        ? { polyPoint: bestPolyPoint, segPoint: bestSegPoint, distance: bestDist }
        : null;
}

// Find closest points between two polygons
// Returns { pointA, pointB, distance } or null
export function getClosestPointsBetweenPolygons(polyA, polyB) {
    if (!polyA || polyA.length < 2 || !polyB || polyB.length < 2) return null;

    let bestDist = Infinity;
    let bestA = null;
    let bestB = null;

    for (let i = 0; i < polyA.length; i++) {
        const a1 = polyA[i];
        const a2 = polyA[(i + 1) % polyA.length];

        for (let j = 0; j < polyB.length; j++) {
            const b1 = polyB[j];
            const b2 = polyB[(j + 1) % polyB.length];

            // Check segments crossing
            if (segmentsIntersect(a1, a2, b1, b2)) {
                return { pointA: a1, pointB: b1, distance: 0 };
            }

            // Check all point-to-segment combinations
            const tests = [
                { poly: closestPointOnSegment(a1, b1, b2), other: a1, isA: false },
                { poly: closestPointOnSegment(a2, b1, b2), other: a2, isA: false },
                { poly: closestPointOnSegment(b1, a1, a2), other: b1, isA: true },
                { poly: closestPointOnSegment(b2, a1, a2), other: b2, isA: true },
            ];

            for (const t of tests) {
                const d = Math.hypot(t.poly.x - t.other.x, t.poly.y - t.other.y);
                if (d < bestDist) {
                    bestDist = d;
                    if (t.isA) {
                        bestA = t.poly;
                        bestB = t.other;
                    } else {
                        bestA = t.other;
                        bestB = t.poly;
                    }
                }
            }
        }
    }

    return bestA && bestB ? { pointA: bestA, pointB: bestB, distance: bestDist } : null;
}

// Helper to find if a point is close to a line segment
export function isPointOnLine(pos, p1, p2, threshold = 20) {
    const dist = Math.abs((p2.y - p1.y) * pos.x - (p2.x - p1.x) * pos.y + p2.x * p1.y - p2.y * p1.x) /
        Math.sqrt(Math.pow(p2.y - p1.y, 2) + Math.pow(p2.x - p1.x, 2));

    if (dist > threshold) return false;

    // Check if point is within the segment bounds
    const minX = Math.min(p1.x, p2.x) - threshold;
    const maxX = Math.max(p1.x, p2.x) + threshold;
    const minY = Math.min(p1.y, p2.y) - threshold;
    const maxY = Math.max(p1.y, p2.y) + threshold;

    return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
}

// 2D affine matrix helpers (Canvas-style: a,b,c,d,e,f).
export function matMul(m1, m2) {
    return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d,
        e: m1.a * m2.e + m1.c * m2.f + m1.e,
        f: m1.b * m2.e + m1.d * m2.f + m1.f
    };
}

export function matTranslate(tx, ty) {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

export function matScale(sx, sy) {
    return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

export function matRotate(rad) {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function matApply(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export function matApplyVec(m, x, y) {
    return { x: m.a * x + m.c * y, y: m.b * x + m.d * y };
}

export function getTransformScale(m) {
    const sx = Math.hypot(m?.a ?? 0, m?.b ?? 0);
    const sy = Math.hypot(m?.c ?? 0, m?.d ?? 0);
    const v = (sx + sy) / 2;
    return Number.isFinite(v) && v > 0 ? v : 1;
}

export function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectIntersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
}

export function unionRect(a, b) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function expandRect(r, pad) {
    return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

export function getRectFromPoints(points) {
    if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function getCentroid(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

export function matInverse(m) {
    if (!m) return null;
    const det = m.a * m.d - m.b * m.c;
    if (!Number.isFinite(det) || det === 0) return null;
    const ia = m.d / det;
    const ib = -m.b / det;
    const ic = -m.c / det;
    const id = m.a / det;
    return {
        a: ia,
        b: ib,
        c: ic,
        d: id,
        e: -(ia * m.e + ic * m.f),
        f: -(ib * m.e + id * m.f)
    };
}
