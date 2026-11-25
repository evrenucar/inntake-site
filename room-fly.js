'use strict';

window.createInnFly = function createInnFly() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const explicitMotion = new URLSearchParams(window.location.search).get('motion') === 'on';
  const between = (min, max) => min + Math.random() * (max - min);
  const nextVisit = () => between(45000, 100000);
  let remaining = nextVisit();
  let previous = null;
  let flight = null;
  let age = 0;

  function pause() {
    // Time spent out of view never contributes to the next visit. If the fly
    // was on screen when the visitor left, it has gone by the time they return.
    previous = null;
    flight = null;
  }

  function draw(ctx, time) {
    if (!Number.isFinite(time) || document.hidden || (motion.matches && !explicitMotion)) {
      pause();
      return;
    }
    const elapsed = previous === null ? 0 : Math.max(0, time - previous);
    previous = time;
    remaining -= elapsed;
    if (remaining <= 0) {
      flight = {
        duration: between(4300, 7900),
        fromRight: Math.random() < .5,
        startY: between(.13, .63),
        endY: between(.10, .67),
        arcY: between(-.18, .24),
        phase: between(0, Math.PI * 2),
      };
      remaining = nextVisit();
      age = 0;
    } else if (flight) {
      age += elapsed;
    }
    if (!flight) return;
    if (age >= flight.duration) {
      flight = null;
      return;
    }

    const w = ctx.canvas.width, h = ctx.canvas.height;
    const t = age / flight.duration, seconds = age / 1000;
    const arch = Math.sin(Math.PI * t);
    const phase = flight.phase;
    // Two modest darts break up the broad arc. Their amplitude tapers at the
    // edges, so the fly enters and leaves cleanly even on a narrow screen.
    const drift = t + .058 * Math.sin(4 * Math.PI * t);
    const buzz = arch * Math.min(w, h) * .017;
    const forward = -4 + drift * (w + 8) + Math.sin(seconds * 5.3 + phase) * buzz;
    const x = Math.round(flight.fromRight ? w - forward : forward);
    const y = Math.round(h * (flight.startY + (flight.endY - flight.startY) * t + flight.arcY * arch)
      + buzz * (Math.sin(seconds * 7.4 + phase) + .45 * Math.sin(seconds * 10.1)));

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2b241e';
    ctx.fillRect(x, y, 2, 1);
    ctx.fillStyle = '#b9ab87';
    const wingUp = Math.floor(age / 91) % 2 === 0;
    ctx.fillRect(x + (flight.fromRight ? 1 : 0), y + (wingUp ? -1 : 1), 1, 1);
    ctx.restore();
  }

  return {draw, pause};
};
