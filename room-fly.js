'use strict';

window.createInnFly = function createInnFly() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const explicitMotion = window.inntakeFullMotion;
  const between = (min, max) => min + Math.random() * (max - min);
  const clamp = value => Math.max(0, Math.min(1, value));
  const nextVisit = () => between(6500, 19000);
  const bodyTones = ['#302a22','#60543e','#96815a','#c2aa78','#e5cc96','#ffebbe'];
  const dark = () => 0;
  let remaining = nextVisit();
  let previous = null;
  let visit = null;
  let origins = [];

  function pause() {
    previous = null;
    visit = null;
  }

  function edgePoint(edge) {
    const along = between(.09, .91);
    switch (edge) {
      case 0: return {x: -.04, y: along};
      case 1: return {x: 1.04, y: along};
      case 2: return {x: along, y: -.04};
      default: return {x: along, y: 1.04};
    }
  }

  function choosePerch(perches, intensity, except) {
    // Weighted reservoir sampling keeps shaded perches possible without
    // allocating a list on every visit. Sunlit objects get a slight preference.
    let perch = null, total = 0;
    for (const spot of perches) {
      if (!spot || spot === except || !Number.isFinite(spot.x) || !Number.isFinite(spot.y) ||
          spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1) continue;
      const weight = .55 + 1.35 * clamp(intensity(spot.x, spot.y));
      total += weight;
      if (Math.random() * total < weight) perch = spot;
    }
    return perch;
  }

  function begin(perches, intensity) {
    const perch = choosePerch(perches, intensity);
    if (!perch) return;
    // A shuffle bag brings the fly through every edge, plus one flight that
    // emerges from an object inside the room, in an unpredictable order.
    if (!origins.length) origins = [0, 1, 2, 3, 4];
    const entry = origins.splice(Math.floor(Math.random()*origins.length), 1)[0];
    const indoor = entry === 4 ? choosePerch(perches, intensity, perch) : null;
    const start = indoor || edgePoint(entry === 4 ? Math.floor(Math.random()*4) : entry);
    const exit = entry < 4 ? (entry + 1 + Math.floor(Math.random()*3)) % 4 : Math.floor(Math.random()*4);
    const arrival = between(2100, 4400);
    visit = {
      id: perch.id,
      perchX: perch.x, perchY: perch.y,
      x: start.x, y: start.y,
      start: {x:start.x, y:start.y}, end:edgePoint(exit),
      indoor: Boolean(indoor),
      arrival, departure: arrival + between(1350, 5800), exitDuration: between(1650, 3900),
      phase: between(0, Math.PI*2), bendIn: between(-.17, .17), bendOut: between(-.17, .17),
      age: 0
    };
    remaining = nextVisit();
  }

  function leg(fly, ax, ay, bx, by, t, bend, w, h) {
    const u = t*t*(3-2*t);
    const arc = Math.sin(t*Math.PI);
    const dx = (bx-ax)*w, dy = (by-ay)*h;
    const length = Math.max(1, Math.hypot(dx,dy));
    const sideways = Math.min(w,h)*arc*(bend + .014*Math.sin(t*15 + fly.phase));
    const buzz = arc * Math.min(w,h) * .012;
    fly.x = ax + (bx-ax)*u + (-dy/length*sideways + buzz*Math.sin(t*24 + fly.phase))/w;
    fly.y = ay + (by-ay)*u + ( dx/length*sideways + buzz*Math.cos(t*19 + fly.phase))/h;
  }

  function draw(ctx, time, {perches = [], intensity = dark} = {}) {
    if (!Number.isFinite(time) || document.hidden || (motion.matches && !explicitMotion)) {
      pause();
      return;
    }
    const elapsed = previous === null ? 0 : Math.max(0,time-previous);
    previous = time;
    remaining -= elapsed;
    if (visit) visit.age += elapsed;
    if (remaining <= 0 && !visit) begin(perches,intensity);
    if (!visit) return;
    const fly = visit, w = ctx.canvas.width, h = ctx.canvas.height;
    if (!w || !h) return;
    if (fly.age >= fly.departure + fly.exitDuration) { visit = null; return; }

    // Walk with a gently moved perch. A quick displacement or an object put
    // away startles the fly into the air from its last visible position.
    if (fly.age < fly.departure && fly.id != null) {
      const current = perches.find(spot => spot?.id === fly.id);
      if (current && Math.hypot(current.x-fly.perchX, current.y-fly.perchY) < .085) {
        fly.perchX = current.x; fly.perchY = current.y;
      } else {
        fly.perchX = fly.x; fly.perchY = fly.y;
        fly.arrival = fly.departure = fly.age;
      }
    }

    let perched = false;
    if (fly.age < fly.arrival) {
      leg(fly,fly.start.x,fly.start.y,fly.perchX,fly.perchY,fly.age/fly.arrival,fly.bendIn,w,h);
    } else if (fly.age < fly.departure) {
      fly.x = fly.perchX; fly.y = fly.perchY;
      perched = true;
    } else {
      leg(fly,fly.perchX,fly.perchY,fly.end.x,fly.end.y,(fly.age-fly.departure)/fly.exitDuration,fly.bendOut,w,h);
    }

    const x = Math.round(fly.x*w), y = Math.round(fly.y*h);
    const light = clamp(intensity(clamp(fly.x),clamp(fly.y)));
    const emerge = fly.indoor ? clamp(fly.age/170) : 1;
    const wingUp = !perched && Math.floor(fly.age/94)%2 === 0;
    const facing = fly.age < fly.departure ? fly.perchX-fly.start.x : fly.end.x-fly.perchX;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha = emerge*(.54+.44*light);
    ctx.fillStyle = bodyTones[Math.round(Math.sqrt(light)*(bodyTones.length-1))];
    ctx.fillRect(x,y,3,2);
    ctx.globalAlpha = emerge*(.28+.68*light);
    ctx.fillStyle = light > .25 ? '#ffedbe' : '#ab9e7d';
    ctx.fillRect(x+(facing<0?1:0),y+(wingUp?-1:perched?0:2),2,1);
    ctx.restore();
  }

  return {draw,pause};
};
