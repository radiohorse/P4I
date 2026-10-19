import { CONFIG } from './config.js';

const COLORS = [[184, 208, 225], [225, 223, 204]];

export class Renderer {
  constructor(p, state) {
    this.p = p;
    this.state = state;
    this.background = null;
    this.paths = new WeakMap();
  }

  resize() { this.background = null; this.paths = new WeakMap(); }

  draw(now = performance.now()) {
    const p = this.p;
    const ctx = p.drawingContext;
    if (!this.background) {
      this.background = ctx.createRadialGradient(p.width * 0.5, p.height * 0.47, 0, p.width * 0.5, p.height * 0.47, Math.max(p.width, p.height) * 0.7);
      this.background.addColorStop(0, '#172330');
      this.background.addColorStop(0.6, '#101b28');
      this.background.addColorStop(1, '#0d1621');
    }
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, p.width, p.height);

    // Removing faded display paths never deletes the archived musical phrases.
    this.state.visiblePhrases = this.state.visiblePhrases.filter(phrase => {
      const age = phrase.endedAt === null ? 0 : now - phrase.endedAt;
      const progress = Math.max(0, (age - CONFIG.fadeDelayMs) / CONFIG.fadeDurationMs);
      if (progress >= 1) return false;
      const eased = progress * progress * (3 - 2 * progress);
      this.drawPhrase(phrase, (1 - eased) ** 1.3, now, progress);
      return true;
    });
    this.drawCursor();
  }

  geometry(phrase) {
    const p = this.p;
    const cached = this.paths.get(phrase);
    if (cached && phrase.endedAt !== null) return cached;
    let points = phrase.points;
    if (!points.length) return null;
    if (phrase.kind === 'reply') {
      if (phrase.reveal <= 0) return null;
      // Interpolate the growing tip instead of revealing whole points in jumps.
      const tip = phrase.reveal * (points.length - 1);
      const index = Math.floor(tip);
      const fraction = tip - index;
      const before = points[index];
      const after = points[Math.min(index + 1, points.length - 1)];
      points = points.slice(0, index + 1);
      if (fraction > 0) points.push({
        nx: before.nx + (after.nx - before.nx) * fraction,
        ny: before.ny + (after.ny - before.ny) * fraction,
      });
    }
    const x = point => point.nx * p.width;
    const y = point => point.ny * p.height;
    const path = new Path2D();
    path.moveTo(x(points[0]), y(points[0]));
    // Midpoint quadratics smooth irregular mouse samples without Catmull-Rom
    // overshoot at tight corners. The live endpoint still reaches the pointer.
    for (let i = 1; i < points.length - 1; i++) {
      path.quadraticCurveTo(x(points[i]), y(points[i]),
        (x(points[i]) + x(points[i + 1])) / 2, (y(points[i]) + y(points[i + 1])) / 2);
    }
    const last = points.at(-1);
    path.lineTo(x(last), y(last));
    const geometry = { path, first: [x(points[0]), y(points[0])], last: [x(last), y(last)] };
    if (phrase.endedAt !== null) this.paths.set(phrase, geometry);
    return geometry;
  }

  drawPhrase(phrase, opacity, now, fadeProgress) {
    const p = this.p;
    const geometry = this.geometry(phrase);
    if (!geometry) return;
    const isReply = phrase.kind === 'reply';
    if (isReply) opacity *= 0.6;
    const [r, g, b] = isReply ? [175, 162, 204] : COLORS[(phrase.id - 1) % COLORS.length];
    // Completed lines breathe by less than a pixel; the live line stays exact.
    const drift = this.state.reducedMotion || phrase.endedAt === null ? 0 : Math.sin(now * 0.0005 + (phrase.phase ?? phrase.id)) * Math.min(1, fadeProgress * 4);
    p.push();
    p.translate(0, drift);
    p.noFill();
    p.stroke(r, g, b, 195 * opacity);
    p.strokeWeight((isReply ? 0.8 : 1.05) * Math.max(1, Math.min(1.5, p.width / 1440)));
    p.strokeCap(p.ROUND);
    const ctx = p.drawingContext;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.24 * opacity})`;
    ctx.shadowBlur = 5;
    ctx.stroke(geometry.path);
    p.noStroke();
    p.fill(r, g, b, 155 * opacity);
    p.circle(...geometry.first, 1.8);
    if (phrase.endedAt !== null || isReply) p.circle(...geometry.last, 1.8);
    p.pop();
  }

  drawCursor() {
    const p = this.p;
    const cursor = this.state.cursor;
    if (!cursor.visible) return;
    p.push();
    p.noFill();
    p.stroke(203, 217, 232, cursor.pressed ? 105 : 55);
    p.strokeWeight(0.7);
    p.circle(cursor.x, cursor.y, cursor.pressed ? 17 : 10);
    if (cursor.pressed) {
      p.noStroke();
      p.fill(220, 229, 236, 210);
      p.circle(cursor.x, cursor.y, 2.5);
    }
    p.pop();
  }
}
