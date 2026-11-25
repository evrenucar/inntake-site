(() => {
  // Paint on the same coarse grid as the sun and dust. All randomness is tied
  // to room coordinates so neither the plaster nor the masonry shimmers.
  function hash(x, y, salt = 0) {
    let h = Math.imul(x + salt * 51, 1597334677) ^ Math.imul(y + salt * 7, 3812015801);
    h = Math.imul(h ^ h >>> 16, 2246822519);
    return ((h ^ h >>> 13) >>> 0) / 4294967296;
  }

  function noise(x, y, size, salt) {
    const cx = Math.floor(x / size), cy = Math.floor(y / size);
    let u = x / size - cx, v = y / size - cy;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const top = hash(cx, cy, salt) * (1 - u) + hash(cx + 1, cy, salt) * u;
    const bottom = hash(cx, cy + 1, salt) * (1 - u) + hash(cx + 1, cy + 1, salt) * u;
    return top * (1 - v) + bottom * v;
  }

  function color(hex) {
    const n = parseInt(hex, 16);
    return (0xff000000 | (n & 255) << 16 | n & 0xff00 | n >>> 16) >>> 0;
  }

  const plaster = ['261f1c','2c231e','33271f','3a2c23','412f25','47352a','4e3b2e','554034','614938'].map(color);
  const stone = ['302c2b','393332','413a37','49403b','504740','5a5047','64594e','706455','7d705f','8c7a64'].map(color);
  const silt = ['332d28','3b332c','453a30'].map(color);
  const rawClay = ['50392d','5a4233','674c39','745741','82664b'].map(color);
  const chairWood = ['31251f','423026','51392a','634531','785539','8a6443','9b7952'].map(color);
  const rush = ['65513b','796347','8d7653','a28b5e','b49b6a'].map(color);
  const moss = ['373b2d','454936','50553c','626446','75744f'].map(color);
  const floorRows = [0, .076, .175, .307, .492, .754, 1.115];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  window.paintInnSurfaces = function paintInnSurfaces(ctx, {width, height, seamY, cabinet}) {
    const w = Math.round(width), h = Math.round(height);
    if (w < 1 || h < 1) return;
    const seam = clamp(Math.round(seamY), 0, h);
    const depth = h - seam;
    const raster = ctx.createImageData(w, h);
    const pixels = new Uint32Array(raster.data.buffer);
    const unit = clamp(Math.min(w / 295, h / 190), .73, 1.8);
    function dot(x, y, ink) {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && y >= 0 && x < w && y < h) pixels[y * w + x] = ink;
    }
    function line(a, b, ink) {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0]-a[0]), Math.abs(b[1]-a[1]))));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        dot(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ink);
      }
    }
    function polygon(points, ink, shade) {
      const first = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
      const last = Math.min(h - 1, Math.ceil(Math.max(...points.map(p => p[1]))));
      for (let y = first; y <= last; y++) {
        const row = y + .5, cuts = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          if ((a[1] <= row && b[1] > row) || (b[1] <= row && a[1] > row)) {
            cuts.push(a[0] + (row - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
          }
        }
        cuts.sort((a, b) => a - b);
        for (let j = 0; j + 1 < cuts.length; j += 2) {
          const left = Math.max(0, Math.ceil(cuts[j] - .5));
          const right = Math.min(w - 1, Math.floor(cuts[j+1] - .5));
          for (let x = left; x <= right; x++) pixels[y * w + x] = shade ? shade(x, y) : ink;
        }
      }
    }

    function darken(i, amount) {
      const value = pixels[i];
      const r = Math.round((value & 255) * (1-amount) + 19*amount);
      const g = Math.round((value >>> 8 & 255) * (1-amount) + 16*amount);
      const b = Math.round((value >>> 16 & 255) * (1-amount) + 17*amount);
      pixels[i] = (0xff000000 | b<<16 | g<<8 | r) >>> 0;
    }

    const repairs = [
      [.1*w, .7*seam, .087*w, .07*seam],
      [.77*w, .22*seam, .058*w, .048*seam],
    ];
    // Knifed lime plaster: broad uneven trowel passes, patchy undercoat and a
    // small number of mineral flecks. Keep most texture down in the half-tones.
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const speck = hash(x, y, 9);
        if (y >= seam) {
          pixels[i] = silt[speck < .12 ? 0 : speck > .9 ? 2 : 1];
          continue;
        }
        const wide = noise(x / unit, y / unit, 43, 12);
        const trowel = noise((x + .43*y) / unit, y * 1.7 / unit, 13, 5);
        const fine = noise(x / unit, y / unit, 4, 11);
        const falloff = .70 - Math.abs(x / w - .34) * .93 - Math.abs(y / Math.max(1,seam) - .44) * .42;
        let band = 1.65 + falloff + wide * 2.8 + trowel * 1.44 + fine * .79 + speck * .58;
        if (trowel < .29 && wide < .51) band -= 1;
        for (const [cx,cy,rx,ry] of repairs) {
          if (Math.abs(x-cx) > rx*1.16 || Math.abs(y-cy) > ry*1.16) continue;
          const edge = ((x-cx)/rx)**2 + ((y-cy)/ry)**2 + (fine-.5)*.48 + (trowel-.5)*.64;
          if (edge < .84) band += .63 + fine*.48;
          else if (edge < .98 && y > cy && speck > .36) band -= .78;
        }
        if (speck > .986 && fine > .56) band += 1.05;
        if (speck < .012) band -= 1.10;
        pixels[i] = plaster[clamp(Math.floor(band),0,plaster.length-1)];
      }
    }
    // Short fractures in the plaster, with small flakes still holding one edge.
    function hairline(x, y, length, salt) {
      let position = [x, y];
      for (let i = 0; i < length; i++) {
        const dx = (.45 + hash(i, salt, 5) * 2.7) * unit;
        const dy = (.55 + hash(i, salt, 2) * 1.4) * unit;
        const next = [position[0] + (i % 7 === 4 ? -dx * .42 : dx), position[1] + dy];
        line(position, next, plaster[i % 5 < 2 ? 2 : 3]);
        if (i % 5 === 1) dot(position[0], position[1] + 1, plaster[6]);
        if (i === 5) line(position, [position[0] - 3 * unit, position[1] + 2 * unit], plaster[3]);
        position = next;
      }
    }
    hairline(w*.045, seam*.55, Math.round(clamp(w/40,4,11)), 5);
    hairline(w*.84, seam*.17, Math.round(clamp(w/48,4,10)), 13);

    // A few ragged losses in the top coat reveal a warmer sandy layer.
    function plasterLoss(cx, cy, size, salt) {
      const outline = [[-8,1],[-6,-1],[-4,-1],[-3,-3],[1,-2],[3,-3],
        [5,-2],[4,0],[2,1],[1,3],[-2,3],[-3,4],[-5,3]];
      const flip = salt % 2 ? 1 : -1;
      const shear = .44-hash(salt,1)*.85;
      const points = outline.map(([x,y],i) => [
        cx+(flip*x+shear*y)*size,
        cy+(y+(hash(i,salt)-.5)*1.7)*size
      ]);
      polygon(points,0,(x,y) => rawClay[Math.floor(noise(x,y,2.5,salt)*2.5)]);
      for (const [a,b] of [[0,1],[2,3],[9,10],[11,12]]) {
        line(points[a],points[b],a<5?rawClay[3]:plaster[3]);
      }
      dot(cx+6*size,cy-3*size,rawClay[2]);
      dot(cx-7*size,cy+4*size,rawClay[1]);
    }
    plasterLoss(w*.185,seam*.82,unit*.88,7);
    plasterLoss(w*.049,seam*.35,unit*.61,21);
    plasterLoss(w*.947,seam*.21,unit*.80,16);

    const gap = cabinet
      ? w >= h ? cabinet.x+cabinet.width*.05 : w-cabinet.x-cabinet.width*.953
      : w*.24;
    const radius = Math.max(1.3,Math.min(7.5*unit,gap*.40));
    const mousehole = {
      x: w >= h ? Math.min(w*.263,gap*.69) : w-Math.max(radius+1,gap*.46),
      y: seam, radius
    };

    if (depth > 0) {
      // Masonry in courses projected from a common vanishing point. Each
      // course has its own widths, and shares its uneven bed with its neighbor.
      const vanishingX = w * .34;
      const horizonDistance = h * .27;
      const module = Math.max(20 * unit, Math.min(w * .175, h * .225));
      function projectX(x, t) { return vanishingX + (x - vanishingX) * (1 + depth * t / horizonDistance); }
      function bed(x, row) {
        const t = floorRows[row];
        return seam + t * depth + (noise(x / unit, row * 41, 47, 4) - .5) * (2.2 + 5.1*t) * unit;
      }
      for (let row = 0; row < floorRows.length - 1; row++) {
        const far = floorRows[row], near = floorRows[row+1];
        const lefts = [];
        let pos = -module * (row % 2 ? .3 : .8);
        for (let tile = 0; pos < w + module; tile++) {
          lefts.push(pos);
          pos += module * (.7 + .69 * hash(tile,row,26));
        }
        for (let tile = 0; tile < lefts.length - 1; tile++) {
          const af = projectX(lefts[tile],far), bf = projectX(lefts[tile+1],far);
          const an = projectX(lefts[tile],near), bn = projectX(lefts[tile+1],near);
          if (Math.max(bf,bn)<0 || Math.min(af,an)>w) continue;
          const gap = Math.max(.5,unit*(.47 + near*.47));
          const a = [af+gap,bed(af,row)+gap*.38], b = [bf-gap,bed(bf,row)+gap*.40];
          const c = [bn-gap,bed(bn,row+1)-gap], d = [an+gap,bed(an,row+1)-gap];
          const bevel = (.8 + hash(tile,row,2)*1.8 + near*1.6)*unit;
          const mid = (p,q,t) => [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
          const corner = (p,q) => mid(p,q,Math.min(.22,bevel / Math.max(1,Math.hypot(q[0]-p[0],q[1]-p[1]))));
          const top = [corner(a,d),corner(a,b),corner(b,a),corner(b,c),corner(c,b),corner(c,d),corner(d,c),corner(d,a)];
          const slabTone = 2.58 + hash(tile,row,17)*2.46 + near*.72;
          polygon(top, 0, (x,y) => {
            const grain = hash(x,y,29);
            const face = noise((x*.68-y*.36)/unit,y*1.38/unit,8,10);
            const broad = noise(x/unit,y/unit,35,36);
            let band = slabTone + (face-.5)*1.65 + (broad-.5)*1.3 + grain*.64;
            if (grain > .974 && face > .42) band += 1.0;
            if (grain < .018) band -= 1;
            return stone[clamp(Math.floor(band),0,9)];
          });
          // Broken bevels and mineral chips catch light from the upper left.
          const highlight = stone[Math.min(8,Math.floor(slabTone)+1)];
          line(top[0],top[1],highlight);
          if (hash(tile,row,31)>.18) line(top[1],mid(top[1],top[2],.24+.48*hash(tile,row,32)),highlight);
          line(top[3],mid(top[3],top[4],.5),stone[clamp(Math.floor(slabTone)-1,0,9)]);
          if (row >= 1 && hash(tile,row,63) < .42) {
            // The higher end of a few flags stands proud of the course below.
            const right = mid(top[5],top[6],.06);
            const ledge = mid(top[5],top[6],.37);
            const left = mid(top[5],top[6],.69);
            const lift = Math.max(1,unit * (1.45 + near*3) * (.55 + hash(tile,row,46)*.84));
            const step = [[right[0],right[1]-lift], [ledge[0],ledge[1]-lift],
              [ledge[0]-unit,ledge[1]-lift*.48], [left[0],left[1]-lift*.48]];
            polygon([...step, left, right], stone[Math.max(0,Math.floor(slabTone)-2)]);
            line(step[0],mid(step[0],step[1],.58),stone[Math.floor(slabTone)+1]);
          }
          // These fractures start at a bed and taper into one stone.
          const fractureX = [-Infinity, w*.19, w*.53, w*.135, w*.79, w*.38][row];
          if (af < fractureX && bf > fractureX && c[1]-b[1] > 4) {
            const origin = mid(top[1],top[2],.43);
            const sx = Math.min((bf-af)*.38,(15+row)*unit), sy = Math.min((d[1]-a[1])*.77,12*unit);
            const join = [origin[0]+sx*.48,origin[1]+sy*.35];
            const tip = [origin[0]+sx,origin[1]+sy];
            const path = [origin,[origin[0]+sx*.18,origin[1]+sy*.29],join,
              [origin[0]+sx*.57,origin[1]+sy*.68],[origin[0]+sx*.84,origin[1]+sy*.74],tip];
            for (let j=1;j<path.length;j++) {
              const tone = clamp(Math.floor(slabTone) - (j < 4 ? 2 : 1), 0, 9);
              line(path[j-1],path[j],stone[tone]);
            }
            line(join,[join[0]+sx*.22, join[1]-.5*unit],stone[Math.max(1,Math.floor(slabTone)-1)]);
          }
          if (row > 1 && hash(tile,row,6)>.55) {
            const spot = mid(top[5],top[6],.27+.46*hash(tile,row,7));
            const chip = [[spot[0]-2*unit,spot[1]], [spot[0]-.3,spot[1]-unit], [spot[0]+3*unit,spot[1]+.3]];
            polygon(chip,stone[2]);
          }
        }
      }

      // A worn, low stone skirting at the plaster-floor joint.
      for (let x = 0; x < w; x++) {
        const rise = Math.round((noise(x/unit,1,15,8)*1.5 + .4)*unit);
        for (let y = seam-rise-1; y < seam; y++) dot(x,y, plaster[y===seam-1 ? 1 : 3]);
        if (hash(x,9,8)>.48) dot(x,seam-rise-1,plaster[5]);
      }

      // Moss grows in damp, sheltered stretches of mortar. Each broken tuft
      // follows its own course, with just a few brighter tips on the lit edge.
      function mossInJoint(cx, halfWidth, row, seed) {
        for (let x=Math.max(0,Math.ceil(cx-halfWidth)); x<Math.min(w,cx+halfWidth); x++) {
          const fringe = 1-Math.abs(x-cx)/halfWidth;
          const clump = noise(x/unit,seed,3.4,71)*.8 + fringe*.55;
          if (clump < .48) continue;
          const y = row===0 ? seam-1 : bed(x,row)-.25*unit;
          dot(x,y,moss[clump>.78 ? 2 : 1]);
          if (clump>.81) dot(x,y-1,moss[hash(x,row,75)>.62 ? 3 : 1]);
          if (clump>.90 && hash(x,row,76)>.42) dot(x,y-2,moss[3]);
          if (clump>.83 && hash(x,row,175)>.53) dot(x,y+1,moss[1]);
          if (clump>.9 && hash(x,row,77)>.8) dot(x,y-1,moss[4]);
        }
      }
      mossInJoint(w*.068,Math.max(3,w*.038),0,3);
      mossInJoint(w*.23,Math.max(3,w*.031),2,9);
      mossInJoint(w*.904,Math.max(3,w*.046),4,2);
      mossInJoint(w*.138,Math.max(3,w*.031),5,33);
      mossInJoint(w*.646,Math.max(3,w*.035),1,16);

      // The jambs have been gnawed wider at the floor; plaster still overhangs
      // the dark hollow. Coordinates are returned to the room's wildlife layer.
      const mouth = [[-1,0],[-.94,-.24],[-.85,-.50],[-.86,-.83],[-.69,-1.12],
        [-.45,-1.31],[-.05,-1.38],[.32,-1.31],[.65,-1.13],[.83,-.9],
        [.8,-.53],[.87,-.25],[1,0]];
      const local = ([px,py], factor=1) => [mousehole.x+px*radius*factor,seam+py*radius*factor];
      polygon(mouth.map(p=>local(p,1.18)),rawClay[2]);
      polygon(mouth.map(p=>local(p)),color('30261f'));
      const hollow = mouth.map(([px,py]) => local([px*.87+.015,py*.92]));
      polygon(hollow,color('191815'));
      line(local([-.93,-.48]),local([-.77,-.83]),rawClay[3]);
      line(local([.31,-1.32]),local([.62,-1.16]),rawClay[4]);
      line(local([-.89,.04]),local([.88,.04]),silt[0]);
      // Fine crumbs on the sill, and two tiny scuffs trailing into the room.
      const inward = mousehole.x < w/2 ? 1 : -1;
      for (const [dx,dy] of [[.94,.27],[1.3,.17],[1.79,.65],[2.31,1.17]]) {
        const seedX = mousehole.x+radius*dx*inward, seedY=seam+radius*dy;
        dot(seedX,seedY,stone[2]); dot(seedX,seedY-1,stone[5]);
      }
    }

    if (cabinet && cabinet.width > 0 && cabinet.height > 0) {
      const {x, y, width:cw, height:ch} = cabinet;
      const foot = y + ch*.97;
      const wallTop = y+ch*.041, castX = cw*.044, castY = ch*.038;
      const softness = Math.max(2.5,unit*2.3);
      const shadowCell = Math.max(2,Math.round(unit*1.7));
      const coarse = value => (Math.floor(value/shadowCell)+.5)*shadowCell;
      const banded = value => Math.round(clamp(value,0,1)*5)/5;
      const inside = distance => clamp(.5 + distance/(2*softness),0,1);
      // The cornice, case and plinth cast a single silhouette onto the wall.
      for (let sy = Math.max(0,Math.floor(wallTop+castY-softness)); sy < Math.min(h,seam); sy++) {
        const py = coarse(sy);
        const cornice = py < y+ch*.102+castY;
        const plinth = py > y+ch*.742+castY;
        const left = x+cw*(cornice ? .034 : .059)+castX;
        const right = x+cw*(cornice ? .968 : plinth ? .949 : .938)+castX;
        const top = inside(py-wallTop-castY);
        for (let sx=Math.max(0,Math.floor(left-softness)); sx<Math.min(w,right+softness); sx++) {
          const px = coarse(sx);
          const cover = banded(top*inside(Math.min(px-left,right-px)));
          if (cover) darken(sy*w+sx, .65*cover);
        }
      }

      // At the wall foot the shadow bends across the paving. The apron masks
      // skylight directly beneath the case, even between the two front legs.
      const castEnd = foot+ch*.048;
      const occlusion = (dx,dy) => Math.max(0,1-dx*dx-dy*dy);
      for (let sy=Math.max(0,seam); sy<Math.min(h,castEnd+softness*2); sy++) {
        const py = coarse(sy);
        const t = clamp((py-seam)/Math.max(1,castEnd-seam),0,1);
        const left = x+cw*(.059+.071*t), right = x+cw*(.949+.059*t);
        const apronY = (py-foot+ch*.009)/Math.max(1,ch*.040);
        for (let sx=Math.max(0,Math.floor(x)); sx<Math.min(w,right+softness*2); sx++) {
          const px = coarse(sx);
          const cast = .67*inside(Math.min(px-left,right-px,castEnd-py));
          const apron = .92*occlusion((px-x-cw*.50)/(cw*.447),apronY);
          let contact = 0;
          for (const center of [.086,.911]) {
            const dx = (sx-x-cw*center)/(cw*.056);
            const dy = (sy-foot)/Math.max(1,ch*.013);
            contact = Math.max(contact,.94*occlusion(dx,dy));
          }
          const shade = 1 - (1-cast)*(1-apron)*(1-contact);
          if (shade>0) darken(sy*w+sx,banded(shade));
        }
      }
    }
    if (depth>8 && w>24) {
      // The foreground chair keeps its height relative to the cabinet. Its seat
      // occupies the lower left corner below the guidebook on portrait screens.
      const narrow = w<h;
      const size = narrow
        ? Math.min((cabinet?.width || w)/145, w*.122/21, depth/40)
        : Math.min(unit*1.16,w*.092/21,depth*.76/47);
      let chairLeft=narrow ? -size*1.5 : 0;
      let seatY=seam+depth*.42-25*size;
      if(narrow) {
        const roomBox=ctx.canvas.getBoundingClientRect();
        const guideBox=document.querySelector('.guide-opener')?.getBoundingClientRect();
        const guideEnd=guideBox && roomBox.height ? (guideBox.bottom-roomBox.top)*h/roomBox.height : seam+depth*.56;
        const lowestSeat=h-27*size-2;
        seatY=Math.min(lowestSeat,Math.max(guideEnd+9*size,seam+depth*.67));
        if(guideEnd+9*size>lowestSeat) {
          // On a short phone the caption and the chair are at the same depth.
          // Tuck the chair against the jamb, reserving the lettering's full width.
          const caption=document.querySelector('.guide-opener span')?.getBoundingClientRect();
          const spare=caption && Number.isFinite(caption.left) && roomBox.width
            ? (caption.left-roomBox.left)*w/roomBox.width : w*.081;
          chairLeft=Math.min(chairLeft,Math.max(-10*size,spare-2-20*size));
        }
      }
      const point = ([px,py]) => [chairLeft+px*size,seatY+py*size];
      const face = (points,ink,shade) => polygon(points.map(point),ink,shade);
      const edge = (a,b,ink) => line(point(a),point(b),ink);
      const timber = (points,base,salt) => face(points,0,(x,y)=>{
        const grain = noise(x/size,y/size*.22,2.7,salt);
        return chairWood[clamp(base+(grain>.77?1:grain<.28?-1:0),0,6)];
      });
      const leg = (x,y,length,flare) => {
        timber([[x-2,y],[x+2,y],[x+1,y+length*.58],[x+flare+1.15,y+length],
          [x+flare-1.3,y+length],[x-2,y+length*.58]],3,10);
        edge([x-1,y+1],[x-1,y+length*.47],chairWood[5]);
        edge([x+flare-1,y+length],[x+flare+1,y+length],chairWood[0]);
      };
      // Darken the actual flagstones so the rush seat and legs share their grout.
      const cast=(points,amount) => face(points,0,(x,y)=>{
        const i=y*w+x;
        darken(i,amount);
        return pixels[i];
      });
      cast([[-10,18],[11,17],[24,21],[35,25],[31,28],[9,26],[-7,25]],.21);
      cast([[7,18],[12,18],[22,21],[20,23],[10,21]],.37);
      cast([[15,24],[19,24],[30,27],[26,28],[17,26]],.48);
      cast([[15,24],[18,24],[21,25],[20,26],[16,26]],.52);
      leg(8,-7,27,1);
      timber([[-10,11],[9,9],[10,11],[-10,14]],3,21);
      // The ladder back leans away from the sitter.
      timber([[-14,-37],[6,-37],[6,-33],[-1,-32],[-7,-32],[-14,-31]],4,13);
      edge([-12,-37],[5,-37],chairWood[6]);
      timber([[-12,-26],[6,-27],[7,-24],[-12,-22]],3,19);
      edge([-11,-26],[5,-27],chairWood[5]);
      timber([[2,-39],[5,-40],[7,-36],[9,-6],[5,-4]],4,7);
      edge([3,-38],[6,-7],chairWood[5]);
      edge([3,-39],[5,-39],chairWood[6]);
      // Pegged front stretcher follows the slight turn of the chair.
      timber([[-12,15],[15,12],[15,15],[-12,18]],3,32);
      edge([-10,15],[14,12],chairWood[5]);
      leg(16,0,25,1);
      timber([[-18,-10],[8,-11],[20,-5],[19,-1],[-9,5],[-20,0]],3,46);
      // Four fan-shaped bundles of rush converge at the center of the seat.
      const seat = [[-17,-9],[7,-10],[17,-5],[-9,1],[-17,-2]];
      face(seat,0,(x,y)=>{
        const lx=(x-chairLeft)/size, ly=(y-seatY)/size;
        const forward = lx*.70+ly*1.11, back = lx*.55-ly*1.45;
        const strand = Math.floor(lx+ly*.6<0 ? forward : back);
        const tone = (strand%4+4)%4;
        return rush[tone===0?1:tone===1?3:tone===2?2:3];
      });
      edge([-16,-9],[7,-10],rush[4]);
      edge([7,-10],[16,-5],chairWood[5]);
      edge([17,-4],[-8,2],chairWood[5]);
      edge([-7,3],[18,-2],chairWood[1]);
      edge([14,0],[16,-.4],chairWood[6]);
      // One broken strand curls over the front, beside a tiny joint peg.
      edge([5,-1],[7,1],rush[3]);
      edge([7,1],[7,2],rush[2]);
      dot(...point([16,2]),chairWood[1]);
    }
    ctx.putImageData(raster,0,0);
    return {mousehole};
  };
})();
