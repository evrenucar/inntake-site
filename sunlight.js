/* The wall and floor share a line of sunlight at their joint. On the floor,
   the window pattern widens toward the viewer around the paving's vanishing point. */
window.createInnSunlight = function createInnSunlight(canvas) {
  const context = canvas.getContext('2d');
  const windows = [
    {origin: -.19, radius: .12, strength: .68},
    {origin: -.035, radius: .054, strength: .93},
    {origin: .16, radius: .09, strength: 1},
    {origin: .4, radius: .043, strength: .68}
  ];
  const vanishingX = .34;
  const horizonDistance = .27;
  let seam = .69;
  let lean = .46;
  let drift = 0;
  let furniture;
  const dust = Array.from({length: 170}, (_, i) => ({
    x: (i * .61803399 + .07) % 1,
    y: (i * .75487767 + .21) % 1,
    speed: .0018 + (i % 7) * .00062,
    phase: i * 1.37
  }));

  function projection(beam, y) {
    const origin = beam.origin + drift;
    if (y <= seam) {
      return {x: origin + lean * y / seam, radius: beam.radius};
    }
    const depth = 1 + (y - seam) / horizonDistance;
    return {x: vanishingX + (origin + lean - vanishingX) * depth, radius: beam.radius * depth};
  }

  function intensity(x, y) {
    let total = 0;
    for (const beam of windows) {
      const section = projection(beam, y);
      const inside = Math.max(0, 1 - Math.abs(x - section.x) / section.radius);
      total += inside * inside * beam.strength;
    }
    return Math.min(1, total);
  }

  function shaft(from, to, y1, y2, spread) {
    const w = canvas.width, h = canvas.height;
    context.beginPath();
    context.moveTo(Math.round((from.x - from.radius * spread) * w), Math.round(y1 * h));
    context.lineTo(Math.round((from.x + from.radius * spread) * w), Math.round(y1 * h));
    context.lineTo(Math.round((to.x + to.radius * spread) * w), Math.round(y2 * h));
    context.lineTo(Math.round((to.x - to.radius * spread) * w), Math.round(y2 * h));
    context.closePath();
    context.fill();
  }

  function draw(time) {
    const w = canvas.width, h = canvas.height;
    context.clearRect(0, 0, w, h);
    drift = .062 * Math.sin(time * .22) + .019 * Math.sin(time * .37 + .5);
    lean = .48 + .051 * Math.sin(time * .16 + .4);
    for (const beam of windows) {
      const top = projection(beam, 0);
      const joint = projection(beam, seam);
      const near = projection(beam, 1);
      // A broad amber penumbra surrounds the brighter center of each shaft.
      for (let layer = 8; layer >= 1; layer--) {
        const spread = .13 + layer * .116;
        context.fillStyle = 'rgba(242,177,92,' + (.028 * beam.strength) + ')';
        shaft(top, joint, 0, seam, spread);
        context.fillStyle = 'rgba(247,186,104,' + (.038 * beam.strength) + ')';
        shaft(joint, near, seam, 1, spread);
      }
    }

    // The cabinet interrupts the direct light immediately behind its feet.
    // Floating motes are added afterwards because they occupy the air in front.
    const {x, y, width, height} = furniture;
    const foot = y + height * .97;
    context.save();
    // Clip away the face of the caster: its shadow belongs to the floor.
    context.beginPath();
    context.rect(0, 0, w, h);
    context.rect((x + width * .048) * w, y * h, width * .913 * w, height * .97 * h);
    context.clip('evenodd');
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'rgba(0,0,0,.69)';
    context.beginPath();
    context.moveTo((x + width * .07) * w, seam * h);
    context.lineTo((x + width * .92) * w, seam * h);
    context.lineTo((x + width * .985) * w, (foot + height * .008) * h);
    context.lineTo((x + width * .135) * w, (foot + height * .008) * h);
    context.fill();
    context.restore();

    for (let i = 0; i < dust.length; i++) {
      const mote = dust[i];
      const x = (mote.x + time * mote.speed * .42 + Math.sin(time * .19 + mote.phase) * .012 + 1) % 1;
      const y = (mote.y + time * mote.speed + Math.sin(time * .15 + mote.phase) * .006 + 1) % 1;
      const glow = intensity(x, y) * (.68 + .32 * Math.sin(time * .75 + mote.phase));
      if (glow < .11) continue;
      const size = i % 9 === 0 && glow > .4 ? 2 : 1;
      context.fillStyle = 'rgba(255,223,157,' + Math.min(.94, Math.sqrt(glow) * 1.06) + ')';
      context.fillRect(Math.floor(x * w), Math.floor(y * h), size, 1);
    }
  }

  function resize(width, height, seamY, cabinet) {
    canvas.width = width;
    canvas.height = height;
    seam = seamY / height;
    furniture = {
      x: cabinet.x / width, y: cabinet.y / height,
      width: cabinet.width / width, height: cabinet.height / height
    };
  }
  return {resize, draw, intensity};
};
