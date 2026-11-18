"use strict";

window.BeachWalker = (() => {
  const TILE = 128;
  const COLUMNS = 8;
  const ROWS = 3;
  const WALK_FRAMES = 20;
  const IDLE = WALK_FRAMES;
  const SHADOW = IDLE + 1;
  const PRINT = SHADOW + 1;
  const GROUND = 116;
  const TAU = 2 * Math.PI;
  const STANCE = 0.62;
  const HALF_STEP = 12.8;
  const STRIDE = (2 * HALF_STEP) / (TILE * STANCE);
  const PRINT_LIFE = 7;
  const MAX_PRINTS = 15;
  const MAX_INSTANCES = MAX_PRINTS + 2;
  const states = new WeakMap();
  const artwork = new Image();
  artwork.src = "assets/beach-straw-hat-walker.png?v=0.3.7";
  let last = {
    enabled: false,
    visible: false,
    valid: false,
    pace: 0,
    phase: 0,
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - t * 2);
  const mod = (n, m) => ((n % m) + m) % m;

  function brush(ctx, points, width, fill, edge) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    ctx.quadraticCurveTo(...points[1], ...points[2]);
    ctx.lineCap = "round";
    ctx.strokeStyle = edge;
    ctx.lineWidth = width + 1.35;
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function oval(ctx, x, y, rx, ry, color, angle = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function shoeStep(cycle, offset) {
    const t = mod(cycle + offset, 1);
    if (t < STANCE) {
      return { x: lerp(HALF_STEP, -HALF_STEP, t / STANCE), lift: 0, pitch: 0 };
    }
    const swing = (t - STANCE) / (1 - STANCE);
    return {
      x: lerp(-HALF_STEP, HALF_STEP, smooth(swing)),
      lift: 8 * Math.sin(swing * Math.PI) ** 1.25,
      pitch: -0.42 * Math.sin(swing * TAU),
    };
  }

  function paintSandal(ctx, x, y, pitch, far) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pitch);
    ctx.beginPath();
    ctx.moveTo(-2.8, -3.7);
    ctx.quadraticCurveTo(0, -4.5, 2.1, -2.4);
    ctx.quadraticCurveTo(7.3, -2.5, 7.5, 0);
    ctx.quadraticCurveTo(6.7, 1.7, 4.8, 1.7);
    ctx.lineTo(-2.4, 1.7);
    ctx.quadraticCurveTo(-4, 0, -2.8, -3.7);
    ctx.closePath();
    ctx.fillStyle = far ? "#b07552" : "#dfa87b";
    ctx.fill();
    ctx.strokeStyle = "#77513b";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2.7, 1);
    ctx.lineTo(6.4, 1);
    ctx.moveTo(1.9, -2.4);
    ctx.lineTo(3.4, 0.6);
    ctx.strokeStyle = far ? "#755946" : "#856249";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();
  }

  function paintLeg(ctx, hip, hipY, step, far) {
    const x = hip + step.x;
    const y = GROUND - 2.2 - step.lift - (far ? 0.75 : 0);
    const dx = x - hip,
      dy = y - hipY;
    const distance = Math.hypot(dx, dy);
    // Bend the knee forward while keeping the ankle on the planted foot.
    const bend = Math.sqrt(Math.max(0, 15.8 ** 2 - (distance / 2) ** 2));
    const knee = (hip + x) / 2 + (dy / distance) * bend;
    const kneeY = (hipY + y) / 2 - (dx / distance) * bend;
    const skin = ctx.createLinearGradient(knee - 4, 0, knee + 4, 0);
    skin.addColorStop(0, far ? "#af7354" : "#bd825c");
    skin.addColorStop(0.68, far ? "#d1936b" : "#efb98c");
    skin.addColorStop(1, far ? "#b48061" : "#d49d74");
    brush(
      ctx,
      [
        [knee, kneeY],
        [lerp(knee, x, 0.38), y - 5],
        [x, y - 1.7],
      ],
      far ? 5.3 : 6.1,
      skin,
      "#825942",
    );
    paintSandal(ctx, x, y, step.pitch, far);

    const cuff = kneeY + 1.6;
    const fabric = ctx.createLinearGradient(knee - 7, hipY, knee + 5, cuff);
    fabric.addColorStop(0, far ? "#8d7356" : "#aa8a63");
    fabric.addColorStop(0.57, far ? "#b2946c" : "#e3c396");
    fabric.addColorStop(1, far ? "#9b805d" : "#c4a272");
    ctx.beginPath();
    ctx.moveTo(hip - 7.7, hipY - 2.5);
    ctx.quadraticCurveTo(hip - 7.3, hipY + 5, knee - 5.7, cuff - 1.5);
    ctx.quadraticCurveTo(knee, cuff + 1, knee + 5.5, cuff - 0.6);
    ctx.quadraticCurveTo(hip + 6.7, hipY + 5, hip + 7.4, hipY - 2.5);
    ctx.closePath();
    ctx.fillStyle = fabric;
    ctx.fill();
    ctx.strokeStyle = "#80654c";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(knee - 4.5, cuff - 2.7);
    ctx.quadraticCurveTo(knee, cuff - 1.3, knee + 4.2, cuff - 2.5);
    ctx.strokeStyle = far ? "#e3c49877" : "#f8dfb9bb";
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  function paintArm(ctx, x, y, swing, far) {
    const elbowX = x + swing * 0.48 - 1.7;
    const elbowY = y + 8.2 - Math.abs(swing) * 0.12;
    const wristX = elbowX + 2.8 + swing * 0.55;
    const wristY = elbowY + 8.3 - Math.abs(swing) * 0.22;
    const skin = ctx.createLinearGradient(
      wristX - 4,
      wristY,
      wristX + 4,
      wristY - 3,
    );
    skin.addColorStop(0, far ? "#b8815b" : "#d29972");
    skin.addColorStop(0.72, far ? "#dfa77a" : "#f8c491");
    skin.addColorStop(1, far ? "#cc9067" : "#e1aa7a");
    brush(
      ctx,
      [
        [x, y],
        [lerp(x, elbowX, 0.45), y + 4.4],
        [elbowX, elbowY],
      ],
      far ? 6.1 : 7.1,
      skin,
      "#8a5e45",
    );
    brush(
      ctx,
      [
        [elbowX, elbowY],
        [lerp(elbowX, wristX, 0.45), elbowY + 5],
        [wristX, wristY],
      ],
      far ? 4.8 : 5.7,
      skin,
      "#8a5e45",
    );
    oval(ctx, elbowX, elbowY, far ? 2.4 : 2.8, 3.1, skin);
    ctx.save();
    ctx.translate(wristX, wristY - 0.6);
    ctx.rotate(-swing * 0.049);
    ctx.beginPath();
    ctx.moveTo(-2.5, -1.9);
    ctx.quadraticCurveTo(0.4, -3, 2.4, -0.6);
    ctx.quadraticCurveTo(4.4, 0.5, 3.5, 1.8);
    ctx.lineTo(2.6, 1.6);
    ctx.quadraticCurveTo(2.2, 5, -0.5, 4.7);
    ctx.quadraticCurveTo(-3.1, 3.9, -2.5, -1.9);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = "#8a5e45";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function paintPose(ctx, step) {
    const idle = step === IDLE;
    const cycle = idle ? 0 : step / WALK_FRAMES;
    const far = idle ? { x: 2.4, lift: 0, pitch: 0 } : shoeStep(cycle, 0.5);
    const near = idle ? { x: -1.3, lift: 0, pitch: 0 } : shoeStep(cycle, 0);
    const swing = idle ? 0 : -6.8 * Math.cos(cycle * TAU);
    const bob = idle ? 0 : 0.9 * Math.cos(cycle * TAU * 2);
    const tilt = idle ? 0 : 0.015 + Math.sin(cycle * TAU) * 0.018;
    paintLeg(ctx, 68, 84 + bob, far, true);
    paintLeg(ctx, 58, 84.5 + bob, near, false);
    ctx.save();
    ctx.translate(64, 84 + bob);
    ctx.rotate(tilt);
    ctx.translate(-64, -84);
    paintArm(ctx, 83, 70.5, -swing * 0.73, true);
    paintArm(ctx, 46, 73, swing, false);
    // Sleeve openings cover the roots of the arms and the overlapping hip seam.
    ctx.drawImage(artwork, 171, 15, 908, 1234, 34, 8, 60.3, 79);
    ctx.restore();
  }

  function makeAtlas() {
    const canvas = document.createElement("canvas");
    canvas.width = COLUMNS * TILE;
    canvas.height = ROWS * TILE;
    const ctx = canvas.getContext("2d");
    for (let frame = 0; frame <= PRINT; frame++) {
      ctx.save();
      ctx.translate(
        (frame % COLUMNS) * TILE,
        Math.floor(frame / COLUMNS) * TILE,
      );
      if (frame <= IDLE) paintPose(ctx, frame);
      if (frame === SHADOW) {
        ctx.translate(64, 64);
        ctx.scale(1, 0.46);
        const shade = ctx.createRadialGradient(0, 0, 2, 0, 0, 60);
        shade.addColorStop(0, "#504d4b81");
        shade.addColorStop(0.49, "#67625643");
        shade.addColorStop(1, "#67625600");
        oval(ctx, 0, 0, 60, 60, shade);
      }
      if (frame === PRINT) {
        oval(ctx, 62, 68, 44, 26, "#ffedc283", 0.06);
        oval(ctx, 51, 61, 30, 17, "#9e795d91", -0.17);
        oval(ctx, 80, 57, 19, 21, "#90765b9c", 0.03);
      }
      ctx.restore();
    }
    return canvas;
  }

  function makeRenderer(gl) {
    const program = gl.createProgram();
    const sources = [
      [
        gl.VERTEX_SHADER,
        `#version 300 es
        precision highp float;
        uniform vec2 resolution;
        uniform vec4 poses[${MAX_INSTANCES}];
        uniform vec4 tiles[${MAX_INSTANCES}];
        out vec2 uv, nextUv;
        flat out float opacity, poseMix;
        void main(){
          vec4 pose=poses[gl_InstanceID],tile=tiles[gl_InstanceID];
          vec2 corner=vec2(float(gl_VertexID&1),float(gl_VertexID>>1));
          vec2 offset=(corner-.5)*pose.zw;
          float c=cos(tile.y),s=sin(tile.y);
          vec2 position=pose.xy+mat2(c,s,-s,c)*offset;
          gl_Position=vec4(position/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
          uv=(vec2(mod(tile.x,${COLUMNS}.),floor(tile.x/${COLUMNS}.))+corner)/vec2(${COLUMNS}.,${ROWS}.);
          float nextTile=floor(tile.w);
          nextUv=(vec2(mod(nextTile,${COLUMNS}.),floor(nextTile/${COLUMNS}.))+corner)/vec2(${COLUMNS}.,${ROWS}.);
          opacity=tile.z;
          poseMix=fract(tile.w);
        }`,
      ],
      [
        gl.FRAGMENT_SHADER,
        `#version 300 es
        precision mediump float;
        uniform sampler2D atlas;
        uniform vec2 light;
        in vec2 uv, nextUv;
        flat in float opacity, poseMix;
        out vec4 color;
        void main(){
          vec4 paint=texture(atlas,uv);
          vec2 dx=dFdx(uv),dy=dFdy(uv);
          if(poseMix>.002)paint=mix(paint,textureGrad(atlas,nextUv,dx,dy),poseMix);
          vec3 dusk=paint.rgb*vec3(1.015,.92,.87)+vec3(.048,.013,.040)*paint.a;
          vec3 night=paint.rgb*vec3(.43,.59,.74)+vec3(.025,.043,.079)*paint.a;
          paint.rgb+=(dusk-paint.rgb)*light.x+(night-paint.rgb)*light.y;
          color=paint*opacity;
        }`,
      ],
    ];
    const shaders = sources.map(([type, source]) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      return shader;
    });
    gl.linkProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));

    const canvas = makeAtlas();
    const texture = gl.createTexture();
    const premultiplied = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplied);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.activeTexture(gl.TEXTURE0);
    return {
      program,
      texture,
      poses: new Float32Array(MAX_INSTANCES * 4),
      tiles: new Float32Array(MAX_INSTANCES * 4),
      poseUniform: gl.getUniformLocation(program, "poses[0]"),
      tileUniform: gl.getUniformLocation(program, "tiles[0]"),
      resolution: gl.getUniformLocation(program, "resolution"),
      light: gl.getUniformLocation(program, "light"),
      atlas: gl.getUniformLocation(program, "atlas"),
    };
  }

  function clearOfIcons(env, x, y, w, h) {
    return env.icons.every(
      (icon) =>
        x + w < icon.x ||
        x - w > icon.x + icon.w ||
        y + 5 < icon.y ||
        y - h > icon.y + icon.h,
    );
  }

  function spaceClear(env, x, y, size) {
    const width = size * 0.27 + 5,
      height = size * 0.86 + 4;
    return (
      x > width &&
      x < env.width - width &&
      y > height &&
      y < env.height - 12 &&
      clearOfIcons(env, x, y, width, height) &&
      !env.tallAvoid?.some(
        (palm) =>
          Math.hypot(x - palm.x, y - palm.y) <
          Math.min(21, palm.radius * 0.6) + 5,
      )
    );
  }

  function onSand(field, x, y) {
    return field(x, y) < -12;
  }

  function normal(field, x, y) {
    const dx = field(x + 10, y) - field(x - 10, y);
    const dy = field(x, y + 10) - field(x, y - 10);
    const length = Math.hypot(dx, dy);
    return length > 0.05 ? [dx / length, dy / length] : null;
  }

  function choosePosition(env, a, size) {
    const step = clamp(size * 0.39, 18, 30);
    const wantedX =
      a.position?.x ?? env.width * (0.43 + 0.14 * mod(env.seed * 0.138, 1));
    const wantedY =
      a.position?.y ?? env.height * (0.63 + 0.12 * mod(env.seed * 0.468, 1));
    let best = Infinity,
      chosen = null;
    for (let y = size + 6; y < env.height - 12; y += step) {
      for (let x = step; x < env.width - step; x += step) {
        const depth = env.targetField(x, y);
        if (depth >= -12 || !spaceClear(env, x, y, size)) continue;
        if (a.relocating && Math.hypot(x - wantedX, y - wantedY) < size * 0.7)
          continue;
        const score =
          Math.abs(depth + 32) +
          Math.hypot(x - wantedX, y - wantedY) * 0.075 +
          (onSand(env.field, x, y) ? 0 : 42);
        if (score >= best) continue;
        let turn = a.turn;
        let heading = direction(env, a, size, x, y, turn, true);
        if (heading === null) {
          turn = -turn;
          heading = direction(env, a, size, x, y, turn, true);
        }
        if (heading === null) continue;
        best = score;
        chosen = { x, y, turn, heading };
      }
    }
    return chosen;
  }

  function direction(env, a, size, x, y, turn, targetOnly = false) {
    const n = normal(env.targetField, x, y);
    const depth = env.targetField(x, y);
    const wanted = -32 + Math.sin(a.time * 0.24 + a.seed) * 5;
    const drift = clamp((wanted - depth) / 25, -0.8, 0.8);
    const desired = n
      ? Math.atan2(n[0] * turn + n[1] * drift, -n[1] * turn + n[0] * drift)
      : a.angle;
    const lookAhead = size * 0.31;
    let best = Infinity,
      choice = null;
    for (const offset of [0, 0.35, -0.35, 0.8, -0.8, 1.37, -1.37]) {
      const angle = desired + offset;
      const px = x + Math.cos(angle) * lookAhead,
        py = y + Math.sin(angle) * lookAhead;
      if (
        !spaceClear(env, px, py, size) ||
        (!targetOnly && !onSand(env.field, px, py)) ||
        !onSand(env.targetField, px, py)
      )
        continue;
      const score =
        Math.abs(offset) +
        0.44 * (1 - Math.cos(angle - a.angle)) +
        Math.abs(env.targetField(px, py) - wanted) * 0.013;
      if (score >= best) continue;
      best = score;
      choice = angle;
    }
    return choice;
  }

  function addFootprint(env, a, size) {
    const side = (a.strideIndex & 1 ? -1 : 1) * size * 0.046;
    const c = Math.cos(a.angle),
      s = Math.sin(a.angle);
    const x = a.position.x - c * size * 0.11 - s * side;
    const y = a.position.y - s * size * 0.11 + c * side;
    if (!onSand(env.field, x, y) || !onSand(env.targetField, x, y)) return;
    if (!clearOfIcons(env, x, y, 5, 3)) return;
    if (a.prints.length >= MAX_PRINTS) a.prints.shift();
    a.prints.push({
      x,
      y,
      angle: a.angle - Math.sign(side) * 0.14,
      born: a.time,
      ink: 1,
    });
  }

  function advance(env, a, size) {
    const dt = clamp((env.now - a.now) / 1000, 0, 0.1);
    a.now = env.now;
    a.time += dt;
    const changed =
      a.geometry !== env.fieldToken ||
      a.width !== env.width ||
      a.height !== env.height ||
      a.seed !== env.seed;
    a.geometry = env.fieldToken;
    a.width = env.width;
    a.height = env.height;
    a.seed = env.seed;
    if (changed) a.nextPlacement = 0;

    let current = false,
      future = false;
    if (a.position) {
      const { x, y } = a.position;
      const hasSpace = spaceClear(env, x, y, size);
      current = hasSpace && onSand(env.field, x, y);
      future = hasSpace && onSand(env.targetField, x, y);
      // Hide at once if a newly arrived icon covers the torso. For a
      // shoreline moving away, fade on the old island before reappearing.
      if (!clearOfIcons(env, x, y, size * 0.27 + 5, size * 0.86 + 4))
        a.alpha = 0;
    }
    if (
      (!a.position || !future || a.relocating) &&
      a.alpha < 0.045 &&
      a.time >= a.nextPlacement
    ) {
      const choice = choosePosition(env, a, size);
      a.position = choice && { x: choice.x, y: choice.y };
      a.relocating = false;
      a.stalled = 0;
      a.nextPlacement = a.time + 0.36;
      a.pace = 0;
      a.step = 0;
      a.strideIndex = 0;
      if (choice) {
        a.turn = choice.turn;
        a.angle = choice.heading;
        a.face = Math.cos(a.angle) < 0 ? -1 : 1;
        current = onSand(env.field, a.position.x, a.position.y);
        future = true;
      }
    }
    const valid = !!a.position && current && future && !a.relocating;
    a.alpha +=
      ((valid ? 1 : 0) - a.alpha) * (1 - Math.exp(-dt * (valid ? 5 : 11)));

    const pause = mod(a.time + mod(env.seed * 0.154, 1) * 6, 16.8);
    let speed = 0;
    if (valid && pause < 13.6) {
      const course = direction(
        env,
        a,
        size,
        a.position.x,
        a.position.y,
        a.turn,
      );
      if (course !== null) {
        const delta = Math.atan2(
          Math.sin(course - a.angle),
          Math.cos(course - a.angle),
        );
        a.angle += clamp(delta, -dt * 3.4, dt * 3.4);
        speed = size * 0.32 * clamp(1.2 - Math.abs(delta) * 0.62, 0, 1);
      } else if (a.time >= a.nextTurn) {
        a.turn *= -1;
        a.nextTurn = a.time + 0.85;
      }
    }
    a.pace = lerp(a.pace, speed, 1 - Math.exp(-dt * (speed ? 4.7 : 8.5)));
    let walked = false;
    if (valid && a.pace > 0.12 && dt > 0) {
      const distance = a.pace * dt;
      const x = a.position.x + Math.cos(a.angle) * distance;
      const y = a.position.y + Math.sin(a.angle) * distance;
      if (
        spaceClear(env, x, y, size) &&
        onSand(env.field, x, y) &&
        onSand(env.targetField, x, y)
      ) {
        a.position = { x, y };
        walked = true;
        a.step += distance / (size * STRIDE);
        const strideIndex = Math.floor(a.step * 2);
        if (strideIndex !== a.strideIndex) {
          a.strideIndex = strideIndex;
          if (a.alpha > 0.65) addFootprint(env, a, size);
        }
      } else a.pace = 0;
    } else if (a.pace <= 0.12) a.pace = 0;
    const facing = Math.cos(a.angle);
    if (valid && Math.abs(facing) > 0.22) {
      a.face = lerp(a.face, Math.sign(facing), 1 - Math.exp(-dt * 6.5));
    }

    if (valid && pause < 13.6) a.stalled = walked ? 0 : (a.stalled ?? 0) + dt;
    if (a.stalled > 2.1) a.relocating = true;

    for (let i = a.prints.length - 1; i >= 0; i--) {
      const mark = a.prints[i];
      const covered = env.swashAt?.(mark.x, mark.y) ?? 0;
      mark.ink *= Math.exp(-dt * 6 * covered);
      if (
        a.time - mark.born > PRINT_LIFE ||
        mark.ink < 0.025 ||
        (changed &&
          (!onSand(env.targetField, mark.x, mark.y) ||
            !clearOfIcons(env, mark.x, mark.y, 5, 3)))
      ) {
        a.prints.splice(i, 1);
      }
    }
    return valid;
  }

  function paint(gl, env, a, size) {
    const g = (a.renderer ??= makeRenderer(gl));
    let count = 0;
    const add = (x, y, w, h, frame, angle, opacity, follow = 0) => {
      const index = count++ * 4;
      g.poses[index] = x;
      g.poses[index + 1] = y;
      g.poses[index + 2] = w;
      g.poses[index + 3] = h;
      g.tiles[index] = frame;
      g.tiles[index + 1] = angle;
      g.tiles[index + 2] = opacity;
      g.tiles[index + 3] = follow;
    };
    for (const mark of a.prints) {
      const remaining = 1 - (a.time - mark.born) / PRINT_LIFE;
      add(
        mark.x,
        mark.y,
        size * 0.149,
        size * 0.101,
        PRINT,
        mark.angle,
        0.91 * mark.ink * remaining ** 1.7,
      );
    }
    if (a.position && a.alpha > 0.008) {
      const { x, y } = a.position;
      const { dusk, night } = env.lighting;
      add(
        x + size * (0.15 + dusk * 0.15),
        y - size * (0.055 - dusk * 0.02),
        size * (0.65 + dusk * 0.1),
        size * 0.42,
        SHADOW,
        -0.32 + dusk * 0.79,
        a.alpha * (0.76 - night * 0.21),
      );
      const width =
        (a.face < 0 ? -1 : 1) * (0.7 + 0.3 * Math.abs(a.face)) * size;
      const pose = mod(a.step, 1) * WALK_FRAMES;
      const frame = Math.floor(pose);
      const motion = smooth(clamp(a.pace / (size * 0.15), 0, 1));
      const follow =
        motion < 0.98
          ? IDLE + Math.min(0.9999, 1 - motion)
          : ((frame + 1) % WALK_FRAMES) + Math.min(0.9999, pose - frame);
      add(
        x,
        y - (size * (GROUND - TILE / 2)) / TILE,
        width,
        size,
        motion < 0.002 ? IDLE : frame,
        0,
        a.alpha,
        follow,
      );
    }
    if (!count) return;

    gl.useProgram(g.program);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, g.texture);
    gl.uniform1i(g.atlas, 10);
    gl.uniform2f(g.resolution, env.width, env.height + (env.bottom || 0));
    gl.uniform2f(g.light, env.lighting.dusk, env.lighting.night);
    gl.uniform4fv(g.poseUniform, g.poses, 0, count * 4);
    gl.uniform4fv(g.tileUniform, g.tiles, 0, count * 4);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
  }

  function render(gl, env) {
    let a = states.get(gl);
    if (!env.enabled) {
      if (a) {
        a.now = env.now;
        a.alpha = 0;
        a.pace = 0;
        a.prints.length = 0;
      }
      last = {
        enabled: false,
        visible: false,
        valid: false,
        pace: 0,
        phase: 0,
        prints: 0,
      };
      return null;
    }
    if (!a) {
      a = {
        now: env.now,
        time: 0,
        nextPlacement: 0,
        nextTurn: 0,
        pace: 0,
        alpha: 0,
        position: null,
        face: 1,
        turn: env.seed % 2 ? 1 : -1,
        angle: 0,
        step: 0,
        strideIndex: 0,
        prints: [],
      };
      states.set(gl, a);
    }
    const size = clamp(Math.min(env.width, env.height) * 0.068, 39, 65);
    const valid = advance(env, a, size);
    const ready = artwork.complete && artwork.naturalWidth > 0;
    if (ready && (a.alpha > 0.008 || a.prints.length)) paint(gl, env, a, size);
    const visible = ready && a.alpha > 0.06;
    last = {
      enabled: true,
      visible,
      valid,
      x: a.position?.x,
      y: a.position?.y,
      pace: a.pace,
      phase: mod(a.step, 1),
      prints: a.prints.length,
    };
    return visible
      ? { x: a.position.x, y: a.position.y, radius: size * 0.27 }
      : null;
  }

  return { render, inspect: () => ({ ...last }) };
})();
