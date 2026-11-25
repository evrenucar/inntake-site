/* getItem(button) returns its ID. drop(id, clientX, clientY) and nudge(id, direction)
 * update slot positions and return the grabbed item's rest-box displacement in CSS
 * pixels. render(pose) draws that item about the grip inside its current rest box;
 * render(null) restores the normal scene. */
window.createShelfDrag = function createShelfDrag({root, getItem, drop, nudge, render, fullMotionPreview = false}) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const options = {signal: listeners.signal};
  const directions = {ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'};
  let hand = null;
  let body = null;
  let frame = 0;
  let lastTime = 0;
  let suppressClickUntil = 0;

  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

  function itemFor(target) {
    const button = target.closest?.('button');
    if (!button || !root.contains(button)) return null;
    const id = getItem(button);
    return id == null ? null : {button, id};
  }

  function show() {
    if (!body) return render(null);
    const {id, x, y, angle, pivotX, pivotY, dragging} = body;
    render({id, x, y, angle, pivotX, pivotY, dragging});
  }

  function tick(time) {
    frame = 0;
    if (!body) return;
    const b = body;
    const elapsed = clamp((time - lastTime) / 1000, 0, .04);
    lastTime = time;
    // Small steps keep the same spring feel on a phone or a high-refresh display.
    const steps = Math.max(1, Math.ceil(elapsed * 144));
    const dt = elapsed / steps;
    const speed = b.dragging ? 42 : 22;
    const damping = b.dragging ? 1 : .82;
    let targetAngle;
    for (let i = 0; i < steps; i++) {
      b.vx += ((b.targetX - b.x) * speed ** 2 - 2 * damping * speed * b.vx) * dt;
      b.vy += ((b.targetY - b.y) * speed ** 2 - 2 * damping * speed * b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // An off-centre grip tilts under weight; the trailing corner lags on a flick.
      targetAngle = b.dragging ? clamp(b.leverX * .20 +
        (b.leverY * b.vx - b.leverX * b.vy) * .00067, -.42, .42) : 0;
      b.angularVelocity += ((targetAngle - b.angle) * 200 - b.angularVelocity * 16) * dt;
      b.angle += b.angularVelocity * dt;
    }
    const quiet = Math.abs(b.targetX - b.x) + Math.abs(b.targetY - b.y) < .15 &&
      Math.abs(b.vx) + Math.abs(b.vy) < 2 &&
      Math.abs(targetAngle - b.angle) < .002 && Math.abs(b.angularVelocity) < .035;
    if (quiet) {
      if (b.dragging) {
        b.x = b.targetX; b.y = b.targetY; b.angle = targetAngle;
        b.vx = b.vy = b.angularVelocity = 0;
      } else body = null;
    } else frame = requestAnimationFrame(tick);
    show();
  }

  function schedule() {
    if (reducedMotion.matches && !fullMotionPreview) {
      if (body?.dragging) {
        body.x = body.targetX; body.y = body.targetY; body.angle = 0;
      } else body = null;
      show();
    } else if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function makeBody(grip) {
    const halfDiagonal = Math.max(1, Math.hypot(grip.rect.width, grip.rect.height) / 2);
    const pivotX = grip.startX - grip.rect.left;
    const pivotY = grip.startY - grip.rect.top;
    body = {
      id: grip.id, pivotX, pivotY, dragging: true,
      leverX: (grip.rect.width / 2 - pivotX) / halfDiagonal,
      leverY: (grip.rect.height / 2 - pivotY) / halfDiagonal,
      x: 0, y: 0, vx: 0, vy: 0, angle: 0, angularVelocity: 0, targetX: 0, targetY: 0,
    };
    grip.button.dataset.dragging = '';
    show();
  }

  function releaseCapture() {
    const grip = hand;
    hand = null;
    if (!grip) return;
    delete grip.button.dataset.dragging;
    if (grip.pointerId != null && grip.button.hasPointerCapture(grip.pointerId))
      grip.button.releasePointerCapture(grip.pointerId);
  }

  function reset() {
    if (hand?.pointerId != null && body?.dragging) suppressClickUntil = performance.now() + 600;
    releaseCapture();
    cancelAnimationFrame(frame);
    frame = 0;
    if (body) { body = null; show(); }
  }

  function settle(travel) {
    if (!body) return;
    if (travel?.stored) { reset(); return; }
    // The destination is already at rest in the DOM. Counter its displacement
    // so the first frame after drop retains the sprite's onscreen position.
    body.x -= travel?.x || 0;
    body.y -= travel?.y || 0;
    body.targetX = body.targetY = 0;
    body.dragging = false;
    if (!reducedMotion.matches) show();
    schedule();
  }

  function pointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    // A fresh press on a drawer or rail is a real click, even right after a drop.
    suppressClickUntil = 0;
    const item = itemFor(event.target);
    if (!item) return;
    reset();
    suppressClickUntil = 0;
    hand = {...item, rect: item.button.getBoundingClientRect(), startX: event.clientX,
      startY: event.clientY, pointerId: event.pointerId};
    item.button.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (!hand || event.pointerId !== hand.pointerId) return;
    const dx = event.clientX - hand.startX;
    const dy = event.clientY - hand.startY;
    if (!body) {
      if (Math.hypot(dx, dy) < (event.pointerType === 'touch' ? 8 : 4)) return;
      makeBody(hand);
    }
    body.targetX = dx;
    body.targetY = dy;
    schedule();
    event.preventDefault();
  }

  function pointerEnd(event) {
    if (!hand || event.pointerId !== hand.pointerId) return;
    const id = hand.id;
    releaseCapture();
    if (!body) return; // Let a normal click or tap reach the item.
    suppressClickUntil = performance.now() + 600;
    const travel = event.type === 'pointerup' ? drop(id, event.clientX, event.clientY) : null;
    settle(travel);
  }

  function center(button) {
    const rect = button.getBoundingClientRect();
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
  }

  function neighbor(button, direction) {
    const origin = center(button);
    const horizontal = direction === 'left' || direction === 'right';
    const sign = direction === 'left' || direction === 'up' ? -1 : 1;
    let best = null, bestScore = Infinity;
    for (const candidate of root.querySelectorAll('button')) {
      if (candidate === button || getItem(candidate) == null) continue;
      const position = center(candidate);
      const dx = position.x - origin.x, dy = position.y - origin.y;
      const forward = sign * (horizontal ? dx : dy);
      const across = Math.abs(horizontal ? dy : dx);
      if (forward <= 0 || across > forward) continue;
      const score = forward + 3 * across;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    return best;
  }

  function keyDown(event) {
    const item = itemFor(event.target);
    if (!item || hand?.pointerId != null) return;
    const direction = directions[event.key];
    if (direction && event.altKey && !hand) {
      event.preventDefault();
      reset();
      const {x, y} = center(item.button);
      makeBody({...item, rect: item.button.getBoundingClientRect(), startX: x, startY: y});
      delete item.button.dataset.dragging;
      settle(nudge(item.id, direction));
      return;
    }
    if (event.key === ' ' || (hand && event.key === 'Enter')) {
      event.preventDefault();
      if (event.repeat) return;
      if (hand) {
        const destination = hand.destination;
        const {x, y} = center(destination);
        releaseCapture();
        settle(drop(item.id, x, y, getItem(destination)));
      } else {
        reset();
        const {x, y} = center(item.button);
        hand = {...item, rect: item.button.getBoundingClientRect(),
          startX: x, startY: y, destination: item.button};
        makeBody(hand);
        schedule();
      }
    } else if (hand && direction) {
      event.preventDefault();
      const next = neighbor(hand.destination, direction);
      if (next) {
        hand.destination = next;
        const {x, y} = center(next);
        body.targetX = x - hand.startX;
        body.targetY = y - hand.startY;
        schedule();
      }
    } else if (hand && event.key === 'Escape') {
      event.preventDefault();
      releaseCapture();
      settle(null);
    }
  }

  root.addEventListener('pointerdown', pointerDown, options);
  root.addEventListener('pointermove', pointerMove, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    root.addEventListener(type, pointerEnd, options);
  root.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, {...options, capture: true});
  root.addEventListener('keydown', keyDown, options);
  root.addEventListener('focusout', () => { if (hand && hand.pointerId == null) reset(); }, options);
  window.addEventListener('blur', reset, options);
  window.addEventListener('resize', reset, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); }, options);
  reducedMotion.addEventListener('change', reset, options);
  return {reset, destroy() { reset(); listeners.abort(); }};
};
