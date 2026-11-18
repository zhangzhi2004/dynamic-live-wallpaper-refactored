"use strict";
// Extra inhabitants for the two upstream landscapes. Cached illustrated sprites
// are drawn as one instanced batch; all placements use the original terrain field.
window.SceneElements = (() => {
  const TAU = Math.PI * 2;
  const definitions = {
    meadow: [
      ["flowers", "鲜花", 30, 12],
      ["mushrooms", "蘑菇", 20, 6],
      ["butterflies", "蝴蝶", 20, 7],
      ["fireflies", "萤火虫", 30, 10],
      ["rabbits", "兔子", 6, 2],
      ["windmills", "风车", 3, 1],
    ],
    beach: [
      ["umbrellas", "遮阳伞", 8, 2],
      ["shells", "贝壳", 30, 10],
      ["starfish", "海星", 20, 5],
      ["crabs", "螃蟹", 12, 3],
      ["sailboats", "帆船", 6, 2],
      ["turtles", "海龟", 8, 2],
    ],
  };
  const rules = {
    flowers: { size: 53, clear: 23, zone: "grass" },
    mushrooms: { size: 42, clear: 20, zone: "grass" },
    butterflies: { size: 32, clear: 17, zone: "grass", speed: 10 },
    fireflies: { size: 23, clear: 10, zone: "grass", speed: 5 },
    rabbits: { size: 50, clear: 27, zone: "grass", speed: 11 },
    windmills: { size: 106, clear: 50, zone: "grass" },
    umbrellas: { size: 91, clear: 48, zone: "sand", avoidCanopy: true },
    shells: { size: 27, clear: 15, zone: "sand" },
    starfish: { size: 29, clear: 17, zone: "shore" },
    crabs: { size: 35, clear: 22, zone: "shore", speed: 9 },
    sailboats: { size: 81, clear: 48, zone: "water", speed: 8 },
    turtles: { size: 54, clear: 31, zone: "water", minWater: 59, speed: 6 },
  };
  const traceRules = {
    rabbits: { ink: "bentGrass", life: 1.55, clear: 7, zone: "grass" },
    crabs: { ink: "sandPrints", life: 8, step: 7, clear: 6, zone: "sand" },
    sailboats: {
      ink: "wake",
      life: 4.4,
      step: 4.5,
      clear: 9,
      zone: "water",
      minWater: 10,
    },
    turtles: {
      ink: "wake",
      life: 2.7,
      step: 4.5,
      clear: 7,
      zone: "water",
      minWater: 10,
    },
  };
  const states = new WeakMap();
  const INSTANCE_FLOATS = 12;
  const steeringOffsets = [0, 0.35, -0.35, 0.8, -0.8, 1.4, -1.4, Math.PI];
  let lastState;
  let lightMix, lightTime;
  function lighting(now, preset) {
    const dusk = preset === 1 ? 1 : 0;
    const night = preset === 2 ? 1 : 0;
    if (!lightMix) lightMix = { dusk, night };
    const dt = Math.max(0, Math.min(now - (lightTime ?? now), 100));
    const blend = 1 - Math.exp(-dt / 475);
    lightMix.dusk += (dusk - lightMix.dusk) * blend;
    lightMix.night += (night - lightMix.night) * blend;
    lightTime = now;
    return lightMix;
  }
  function random(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(text) {
    let n = 2166136261;
    for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function defaults(theme) {
    return Object.fromEntries(
      definitions[theme].map(([key, label, max, value]) => [key, value]),
    );
  }
  function sliders(theme) {
    return definitions[theme].map(([key, label, max]) => ({
      key,
      label,
      min: 0,
      max,
      step: 1,
      fmt: (v) => String(v),
    }));
  }
  function normalize(theme, values) {
    const out = values && typeof values === "object" ? { ...values } : {};
    for (const [key, label, max] of definitions[theme])
      if (key in out) {
        if (typeof out[key] !== "number" || !Number.isFinite(out[key]))
          delete out[key];
        else out[key] = clamp(Math.round(out[key]), 0, max);
      }
    return out;
  }
  const animatedFrames = {
    flowers: 8,
    butterflies: 12,
    crabs: 12,
    sailboats: 8,
    turtles: 12,
  };
  const thumbnails = new Map();

  function paint(ctx, kind, phase, variant) {
    SceneArt.paint(
      ctx,
      kind,
      phase,
      variant,
      random(hash(kind) + variant * 171),
    );
  }
  function thumbnail(kind) {
    if (!rules[kind]) return "";
    if (!thumbnails.has(kind)) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      paint(ctx, kind, 0, 0);
      if (kind === "windmills") {
        ctx.save();
        ctx.translate(0, -11);
        paint(ctx, "blades", 0, 0);
        ctx.restore();
      }
      thumbnails.set(kind, canvas.toDataURL("image/png"));
    }
    return thumbnails.get(kind);
  }
  function makeAtlas(theme) {
    // Only build the active theme's tiles. Common effects have a single tile.
    const kinds = definitions[theme].map(([kind]) => kind);
    const effects =
      theme === "meadow"
        ? ["blades", "contact", "bentGrass", "lantern", "lightSpill"]
        : [
            "contact",
            "wake",
            "sandPrints",
            "reflection",
            "surfaceRing",
            "lantern",
            "lightSpill",
          ];
    const columns = 8;
    const entries = {};
    let total = 0;
    for (const kind of [...kinds, ...effects]) {
      const frames = animatedFrames[kind] || 1;
      const variants = effects.includes(kind) ? 1 : 3;
      entries[kind] = { first: total, frames, variants };
      total += frames * variants;
    }
    const rows = Math.ceil(total / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * 128;
    canvas.height = rows * 128;
    const ctx = canvas.getContext("2d");
    for (const [kind, { first, frames, variants }] of Object.entries(entries)) {
      for (let variant = 0; variant < variants; variant++) {
        for (let frame = 0; frame < frames; frame++) {
          const tile = first + variant * frames + frame;
          ctx.save();
          ctx.translate(
            (tile % columns) * 128,
            Math.floor(tile / columns) * 128,
          );
          paint(ctx, kind, (frame / frames) * TAU, variant);
          ctx.restore();
        }
      }
    }
    return { canvas, columns, rows, entries, artReady: SceneArt.ready(theme) };
  }
  function shader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function create(gl, theme) {
    const atlas = makeAtlas(theme),
      program = gl.createProgram();
    gl.attachShader(
      program,
      shader(
        gl,
        gl.VERTEX_SHADER,
        `#version 300 es
    precision highp float;
    layout(location=0) in vec4 pose;
    layout(location=1) in vec4 tile;
    layout(location=2) in vec4 surface;
    uniform vec2 resolution, atlasGrid;
    out vec2 uv, nextUv, world;
    flat out float poseMix;
    flat out vec4 material;
    void main() {
      vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
      vec2 local = (corner - 0.5) * pose.zw;
      float c = cos(tile.w), s = sin(tile.w);
      world = pose.xy + mat2(c, s, -s, c) * local;
      gl_Position = vec4(world.x / resolution.x * 2. - 1., 1. - world.y / resolution.y * 2., 0., 1.);
      uv = (tile.xy + corner) / atlasGrid;
      material = vec4(tile.z, surface.xyz);
      float nextTile = floor(surface.w);
      nextUv = (vec2(mod(nextTile, atlasGrid.x), floor(nextTile / atlasGrid.x)) + corner) / atlasGrid;
      poseMix = fract(surface.w);
    }`,
      ),
    );
    gl.attachShader(
      program,
      shader(
        gl,
        gl.FRAGMENT_SHADER,
        `#version 300 es
    precision highp float;
    uniform sampler2D atlas;
    uniform vec2 lighting;
    uniform float time;
    in vec2 uv, nextUv, world;
    flat in float poseMix;
    flat in vec4 material; // opacity, receives light, wet sand, immersion
    out vec4 color;
    void main() {
      vec4 s = texture(atlas, uv);
      vec2 dx = dFdx(uv), dy = dFdy(uv);
      if (poseMix > 0.002) s = mix(s, textureGrad(atlas, nextUv, dx, dy), poseMix);
      if (s.a < 0.003) discard;
      vec3 dusk = s.rgb * vec3(1.015, 0.92, 0.87) + vec3(0.048, 0.013, 0.040) * s.a;
      vec3 night = s.rgb * vec3(0.43, 0.59, 0.74) + vec3(0.025, 0.043, 0.079) * s.a;
      vec3 rgb = s.rgb + material.y * ((dusk - s.rgb) * lighting.x + (night - s.rgb) * lighting.y);
      rgb *= mix(vec3(1.), vec3(0.82, 0.88, 0.91), material.z);
      if (material.w > 0.) {
        float caustic = sin(world.x * 0.17 + world.y * 0.22 + sin(world.x * 0.092 - time * 0.5) - time * 1.4);
        float shimmer = smoothstep(0.76, 0.99, caustic) * (1.0 - lighting.y * 0.6);
        vec3 submerged = rgb * vec3(0.65, 0.88, 0.93) + s.a * vec3(0.054, 0.222, 0.251) * (0.54 + shimmer * 0.28);
        rgb = mix(rgb, submerged, material.w);
      }
      color = vec4(rgb, s.a) * material.x;
    }`,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
    const vao = gl.createVertexArray(),
      buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(
        i,
        4,
        gl.FLOAT,
        false,
        INSTANCE_FLOATS * 4,
        i * 16,
      );
      gl.vertexAttribDivisor(i, 1);
    }
    const texture = gl.createTexture();
    uploadAtlas(gl, texture, atlas);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return {
      program,
      vao,
      buffer,
      texture,
      atlas,
      instances: new Float32Array(256 * INSTANCE_FLOATS),
      uniforms: Object.fromEntries(
        ["resolution", "atlasGrid", "atlas", "lighting", "time"].map((n) => [
          n,
          gl.getUniformLocation(program, n),
        ]),
      ),
      lists: {},
      previous: 0,
      time: 0,
      retry: 0,
      geometry: null,
    };
  }
  function uploadAtlas(gl, texture, atlas) {
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const premultiplied = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.canvas,
    );
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplied);
    // Tiles have transparent margins at all three levels, avoiding colour
    // bleed and flicker when the settings preview shrinks the sprites.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
    gl.generateMipmap(gl.TEXTURE_2D);
  }
  function snapshot(gl) {
    return {
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      buffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      active: gl.getParameter(gl.ACTIVE_TEXTURE),
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
      viewport: gl.getParameter(gl.VIEWPORT),
      blend: gl.isEnabled(gl.BLEND),
      src: gl.getParameter(gl.BLEND_SRC_RGB),
      dst: gl.getParameter(gl.BLEND_DST_RGB),
      srcA: gl.getParameter(gl.BLEND_SRC_ALPHA),
      dstA: gl.getParameter(gl.BLEND_DST_ALPHA),
      scissor: gl.isEnabled(gl.SCISSOR_TEST),
      clear: gl.getParameter(gl.COLOR_CLEAR_VALUE),
    };
  }
  function restore(gl, s) {
    gl.useProgram(s.program);
    gl.bindVertexArray(s.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, s.buffer);
    gl.activeTexture(s.active);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.viewport(...s.viewport);
    gl.blendFuncSeparate(s.src, s.dst, s.srcA, s.dstA);
    s.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);
    s.scissor ? gl.enable(gl.SCISSOR_TEST) : gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(...s.clear);
  }
  function iconClear(env, x, y, radius) {
    const clearance = (radius + 10) ** 2;
    for (const ic of env.icons) {
      const dx = Math.max(ic.x - x, 0, x - ic.x - ic.w);
      const dy = Math.max(ic.y - y, 0, y - ic.y - ic.h);
      if (dx * dx + dy * dy <= clearance) return false;
    }
    return true;
  }
  function terrainFits(rule, s) {
    const pad = rule.clear;
    if (rule.zone === "grass") return s > pad * 0.8 + 12;
    if (rule.zone === "sand") return s < -Math.max(12, pad * 0.45);
    if (rule.zone === "shore") return s < -9 && s > -125;
    return s > (rule.minWater ?? 90) + pad;
  }
  function permitted(env, rule, x, y, targetOnly = false) {
    const pad = rule.clear;
    if (
      x < pad + 4 ||
      y < pad + 4 ||
      x > env.width - pad - 4 ||
      y > env.height - pad - 4 ||
      !iconClear(env, x, y, pad)
    )
      return false;
    if (env.avoid?.some((a) => Math.hypot(a.x - x, a.y - y) < a.radius + pad))
      return false;
    if (
      rule.avoidCanopy &&
      env.tallAvoid?.some(
        (a) => Math.hypot(a.x - x, a.y - y) < a.radius + pad * 0.6,
      )
    )
      return false;
    return (
      terrainFits(rule, env.targetField(x, y)) &&
      (targetOnly || terrainFits(rule, env.field(x, y)))
    );
  }
  function choose(env, kind, id, occupied) {
    const rule = rules[kind],
      r = random(env.seed ^ hash(kind) ^ Math.imul(id + 1, 48611));
    for (let k = 0; k < 800; k++) {
      const x = rule.clear + r() * (env.width - rule.clear * 2),
        y = rule.clear + r() * (env.height - rule.clear * 2);
      if (
        !permitted(env, rule, x, y, true) ||
        occupied.some(
          (a) =>
            Math.hypot(a.x - x, a.y - y) <
            (rules[a.kind].clear + rule.clear) * 0.8,
        )
      )
        continue;
      const angle = r() * TAU;
      return {
        kind,
        id,
        x,
        y,
        angle,
        turn: Math.cos(angle) < 0 ? -1 : 1,
        phase: r() * TAU,
        variant: id % 3,
        opacity: 0,
        size: rule.size * (0.9 + r() * 0.2),
      };
    }
    return null;
  }
  function rabbitPose(a, time) {
    const cycle = 4.75 + a.phase * 0.19;
    const beat = (time + a.phase * 1.07) % cycle;
    const second = beat >= 1.17;
    const hop = (beat - (second ? 1.35 : 0.18)) / (second ? 0.66 : 0.77);
    const flight = clamp(hop, 0, 1);
    const lift = 4 * flight * (1 - flight) * (second ? 0.75 : 1);
    const crouch = Math.max(0, 1 - Math.abs(hop + 0.085) / 0.138);
    const spring = Math.max(0, 1 - Math.abs(hop - 1.05) / 0.19);
    const breath = 0.012 * Math.sin(time * 3.1 + a.phase);
    return {
      lift,
      pace: Math.sin(flight * Math.PI) * (second ? 1.32 : 1.6),
      stretch: 1 + lift * 0.055 + breath - crouch * 0.1 - spring * 0.12,
    };
  }
  function updateTraces(a, env, time, dt, terrainChanged, moving, landed) {
    const rule = traceRules[a.kind];
    const traces = (a.traces ??= []);
    for (let i = traces.length - 1; i >= 0; i--) {
      const mark = traces[i];
      if (a.kind === "crabs")
        mark.strength *= Math.exp(-env.swashAt(mark.x, mark.y) * dt * 6);
      if (
        time - mark.born > rule.life ||
        mark.strength < 0.035 ||
        (terrainChanged && !permitted(env, rule, mark.x, mark.y, true))
      )
        traces.splice(i, 1);
    }
    if (a.opacity < 0.34 || !(moving || landed)) return;
    const previous = (a.lastStep ??= { x: a.x, y: a.y });
    const dx = a.x - previous.x,
      dy = a.y - previous.y;
    if (rule.step ? Math.hypot(dx, dy) < rule.step : !landed) return;
    const angle = rule.step ? Math.atan2(dy, dx) : a.angle;
    a.lastStep = { x: a.x, y: a.y };
    const boat = a.kind === "sailboats",
      rabbit = a.kind === "rabbits";
    const back = rabbit ? 0.09 : boat ? 0.26 : 0.19;
    const x = a.x - Math.cos(angle) * a.size * back;
    const y =
      a.y -
      Math.sin(angle) * a.size * back +
      a.size * (rabbit ? 0.27 : boat ? 0.22 : 0);
    if (permitted(env, rule, x, y)) {
      traces.push({ x, y, angle, born: time, strength: a.opacity });
    }
  }
  function seekHeading(a, scene, env, rule) {
    let flowerHeading = null;
    if (a.kind === "butterflies") {
      let nearest = 145;
      for (const flower of scene.lists.flowers) {
        if (flower.opacity < 0.4) continue;
        const dx = flower.x - a.x,
          dy = flower.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= nearest) continue;
        nearest = distance;
        const tangent =
          Math.PI / 2 + clamp((28 - distance) * 0.034, -1.28, 0.65);
        flowerHeading = Math.atan2(dy, dx) + tangent * (a.id % 2 ? -1 : 1);
      }
      a.desiredPace = clamp(nearest / 70, 0.38, 1);
    }
    const crab = a.kind === "crabs";
    const shore = crab
      ? -19 - 6 * env.tide + 10 * Math.sin(a.phase + scene.time * 0.28)
      : 0;
    let heading = a.angle,
      best = -Infinity;
    for (const offset of steeringOffsets) {
      const angle = a.angle + offset;
      const x = a.x + Math.cos(angle) * rule.clear * 2;
      const y = a.y + Math.sin(angle) * rule.clear * 2;
      let score = -Math.abs(offset);
      if (permitted(env, rule, x, y)) {
        score += 10;
        if (flowerHeading !== null)
          score += 1.8 * Math.cos(angle - flowerHeading);
        if (crab)
          score -= Math.min(3, Math.abs(shore - env.field(x, y)) * 0.038);
      }
      if (score > best) {
        best = score;
        heading = angle;
      }
    }
    return heading;
  }
  function advance(scene, env) {
    const dt = scene.previous
      ? clamp((env.now - scene.previous) / 1000, 0, 0.1)
      : 0;
    scene.previous = env.now;
    scene.time += dt;
    if (
      scene.seed !== env.seed ||
      scene.width !== env.width ||
      scene.height !== env.height
    ) {
      scene.lists = {};
      scene.seed = env.seed;
      scene.width = env.width;
      scene.height = env.height;
      scene.retry = 0;
    }
    const terrainChanged =
      scene.geometry !== env.fieldToken || scene.tallAvoid !== env.tallAvoid;
    scene.geometry = env.fieldToken;
    scene.tallAvoid = env.tallAvoid;
    const retry = terrainChanged || scene.time > scene.retry;
    if (retry) scene.retry = scene.time + 0.6;
    const occupied = [];
    for (const [kind, label, max, defaultValue] of definitions[env.theme]) {
      const want = clamp(Math.round(env.params[kind] ?? defaultValue), 0, max),
        rule = rules[kind];
      const list = (scene.lists[kind] || []).filter((a) => a.id < want);
      if (list.length < want && (retry || scene.counts?.[kind] !== want)) {
        const ids = new Set(list.map((a) => a.id));
        for (let i = 0; i < want; i++) {
          if (ids.has(i)) continue;
          const created = choose(env, kind, i, [...occupied, ...list]);
          if (created) list.push(created);
        }
      }
      scene.lists[kind] = list;
      for (let i = 0; i < list.length; i++) {
        let a = list[i];
        const goodTarget = permitted(env, rule, a.x, a.y, true);
        if (!goodTarget && retry) {
          const next = choose(env, kind, a.id, [
            ...occupied,
            ...list.filter((q) => q !== a),
          ]);
          if (next) {
            a = next;
            list[i] = next;
          }
        }
        const good = permitted(env, rule, a.x, a.y);
        a.opacity += ((good ? 1 : 0) - a.opacity) * (1 - Math.exp(-dt * 6));
        const previousLift = a.rabbit?.lift ?? 0;
        if (kind === "rabbits") a.rabbit = rabbitPose(a, scene.time);
        const landed = previousLift > 0 && !a.rabbit?.lift;
        let moving = false;
        if (rule.speed && good) {
          // Look ahead at a lower cadence, but validate every actual step.
          if (terrainChanged || scene.time >= (a.nextSteer ?? 0)) {
            a.heading = seekHeading(a, scene, env, rule);
            a.nextSteer = scene.time + 0.12 + (a.id % 4) * 0.017;
          }
          let pace = a.rabbit?.pace ?? 1;
          if (kind === "butterflies") {
            const previousPace = a.hover ?? 1;
            a.hover =
              previousPace +
              (a.desiredPace - previousPace) * (1 - Math.exp(-dt * 4));
            pace = a.hover;
            const flutter =
              (0.5 + 0.5 * Math.sin(scene.time * 2.35 + a.phase)) ** 2;
            a.wings =
              (a.wings ?? a.phase) +
              dt * (5.2 + 14.3 * flutter) * (0.8 + pace * 0.2);
          }
          if (kind === "turtles")
            pace = 1 + 0.26 * Math.sin(a.stroke ?? a.phase);
          const turn = Math.atan2(
            Math.sin(a.heading - a.angle),
            Math.cos(a.heading - a.angle),
          );
          if (kind === "butterflies") {
            const bank = a.bank ?? 0;
            a.bank =
              bank +
              (clamp(turn, -0.65, 0.65) - bank) * (1 - Math.exp(-dt * 5));
          }
          a.angle +=
            clamp(turn, -dt * 1.9, dt * 1.9) +
            Math.sin(scene.time * 0.4 + a.phase) * dt * 0.08;
          const speed = rule.speed * dt * pace,
            nx = a.x + Math.cos(a.angle) * speed,
            ny = a.y + Math.sin(a.angle) * speed;
          if (
            speed > 0.0001 &&
            permitted(env, rule, nx, ny) &&
            occupied.every(
              (q) => Math.hypot(q.x - nx, q.y - ny) > rule.clear * 0.65,
            )
          ) {
            a.x = nx;
            a.y = ny;
            moving = true;
          } else if (speed > 0.0001) a.nextSteer = scene.time;
        }
        if (kind === "crabs" || kind === "turtles") {
          const rate = kind === "crabs" ? 8 : 3.2;
          const drive = a.drive ?? 0;
          a.drive = drive + (Number(moving) - drive) * (1 - Math.exp(-dt * 5));
          a.stroke =
            (a.stroke ?? a.phase) + dt * rate * (0.12 + 0.88 * a.drive);
        }
        if (traceRules[kind]) {
          updateTraces(
            a,
            env,
            scene.time,
            dt,
            terrainChanged,
            good && moving,
            good && landed,
          );
        }
        if (
          kind === "rabbits" &&
          moving &&
          Math.abs(Math.cos(a.angle)) > 0.28
        ) {
          a.turn = Math.sign(Math.cos(a.angle));
        }
        if (kind === "sailboats") {
          const heading = Math.cos(a.angle);
          if (Math.abs(heading) > 0.15)
            a.turn += (Math.sign(heading) - a.turn) * (1 - Math.exp(-dt * 5));
        }
        occupied.push(a);
      }
    }
    scene.counts = Object.fromEntries(
      definitions[env.theme].map(([key, label, max, value]) => [
        key,
        clamp(Math.round(env.params[key] ?? value), 0, max),
      ]),
    );
    scene.env = env;
  }
  function drawBatch(gl, scene, env) {
    let instances = scene.instances,
      length = 0;
    const add = (
      kind,
      actor,
      {
        x = actor.x,
        y = actor.y,
        angle = 0,
        size = actor.size,
        alpha = actor.opacity,
        phase = 0,
        aspect = 1,
        width = 1,
        mirror = false,
        emissive = false,
        wet = 0,
        immersion = 0,
      } = {},
    ) => {
      const { first, frames, variants } = scene.atlas.entries[kind];
      const position = ((((phase / TAU) % 1) + 1) % 1) * frames;
      const frame = Math.floor(position);
      const variant = first + (actor.variant % variants) * frames;
      const tile = variant + frame;
      // Pack the adjacent tile and fractional pose into the unused instance slot.
      const follow =
        frames > 1
          ? variant +
            ((frame + 1) % frames) +
            Math.min(0.9999, position - frame)
          : 0;
      if (length === instances.length) {
        const grown = new Float32Array(instances.length * 2);
        grown.set(instances);
        instances = scene.instances = grown;
      }
      instances[length++] = x;
      instances[length++] = y;
      instances[length++] = size * width * (mirror ? -1 : 1);
      instances[length++] = size * aspect;
      instances[length++] = tile % scene.atlas.columns;
      instances[length++] = Math.floor(tile / scene.atlas.columns);
      instances[length++] = alpha;
      instances[length++] = angle;
      instances[length++] = emissive ? 0 : 1;
      instances[length++] = wet;
      instances[length++] = immersion;
      instances[length++] = follow;
    };
    // Sort by the projected ground contact. Small props under a canopy
    // must remain below its fabric even when their centres coincide.
    const depth = (a) =>
      a.y +
      a.size * (a.kind === "windmills" || a.kind === "umbrellas" ? 0.34 : 0.21);
    const actors = Object.values(scene.lists)
      .flat()
      .filter((a) => a.opacity >= 0.005)
      .sort((a, b) => depth(a) - depth(b));
    const { dusk: light, night } = env.lighting;
    const time = scene.time;
    // Previous footprints and surface ripples stay at the point of contact.
    for (const a of actors) {
      if (!a.traces?.length) continue;
      const rule = traceRules[a.kind];
      for (const mark of a.traces) {
        const age = (time - mark.born) / rule.life;
        const fade = mark.strength * (1 - age) ** 1.35;
        switch (rule.ink) {
          case "wake": {
            const boat = a.kind === "sailboats";
            add(rule.ink, a, {
              ...mark,
              size: a.size * (boat ? 0.49 : 0.43),
              width: 0.27 + 0.18 * age,
              aspect: 0.27 + age * 0.92,
              alpha: fade * (boat ? 0.84 : 0.64),
            });
            break;
          }
          case "sandPrints":
            add(rule.ink, a, {
              ...mark,
              size: a.size * 0.52,
              alpha: fade * 0.88,
            });
            break;
          case "bentGrass":
            add(rule.ink, a, {
              ...mark,
              size: a.size * (0.46 + 0.24 * age),
              alpha: fade * 0.88,
            });
            break;
        }
      }
    }
    // Paint contact, reflections and wakes below every solid object.
    for (const a of actors) {
      const { kind, size, opacity } = a;
      if (kind === "fireflies") {
        if (night > 0.005) {
          const pulse = (0.5 + 0.5 * Math.sin(time * 1.8 + a.phase)) ** 3;
          add("lightSpill", a, {
            y: a.y + 3,
            size: size * (1.9 + 0.5 * pulse),
            aspect: 0.55,
            alpha: opacity * night * pulse * 0.32,
            emissive: true,
          });
        }
        continue;
      }
      if (kind === "sailboats" || kind === "turtles") {
        const boat = kind === "sailboats";
        const surfaceY =
          a.y +
          (boat ? size * 0.22 + 0.65 * Math.cos(time * 1.4 + a.phase) : 0);
        if (boat) {
          add("reflection", a, {
            x: a.x + Math.sin(time * 1.4 + a.phase) * 2.4,
            y: surfaceY + size * 0.11,
            size: size * 0.9,
            width: 0.42 + 0.58 * Math.abs(a.turn),
            aspect: 0.84,
            alpha: opacity * (0.35 + light * 0.17 + night * 0.14),
          });
          if (night > 0.005)
            add("lightSpill", a, {
              x: a.x + Math.sin(time * 1.4 + a.phase) * 2,
              y: surfaceY + size * 0.15,
              size: size * 0.58,
              aspect: 0.66,
              alpha: opacity * night * 0.52,
              emissive: true,
            });
        } else if (a.drive > 0.05) {
          const paddling = a.stroke ?? a.phase;
          const ripple = (((paddling / Math.PI) % 1) + 1) % 1;
          const depth = clamp((env.field(a.x, a.y) - 70) / 265, 0.13, 0.88);
          add("surfaceRing", a, {
            angle: a.angle,
            size: size * (0.66 + 0.3 * ripple),
            aspect: 0.78,
            alpha:
              opacity *
              a.drive *
              (1 - depth) *
              Math.sin(Math.PI * ripple) *
              0.67,
          });
        }
        continue;
      }
      const airborne = kind === "butterflies";
      const hop = a.rabbit?.lift ?? 0;
      const tall = kind === "windmills" || kind === "umbrellas";
      const footY = a.rabbit
        ? 34 / 128
        : kind === "windmills"
          ? 0.31
          : tall
            ? 0.25
            : 0.19;
      add("contact", a, {
        x:
          a.x +
          size *
            (tall ? 0.18 + 0.08 * light : airborne ? 0.24 : 0.05 + hop * 0.04),
        y: a.y + size * (footY + (tall ? light * 0.06 : 0)),
        size:
          size *
          (tall ? 0.83 + light * 0.08 : airborne ? 0.57 : 0.74 - hop * 0.12),
        aspect: tall ? 0.4 : 0.3,
        angle: tall ? 0.56 : 0.12,
        alpha:
          opacity *
          (airborne ? 0.26 + (1 - (a.hover ?? 1)) * 0.24 : 0.92 - hop * 0.36),
      });
    }
    for (const a of actors) {
      const { kind, opacity, size } = a;
      let angle = 0,
        phase = 0,
        alpha = opacity,
        y = a.y,
        mirror = false,
        width = 1,
        aspect = 1,
        wet = 0,
        immersion = 0;
      switch (kind) {
        case "flowers":
          phase = env.windPhase(a.x, a.y) + Math.sin(a.phase) * 0.22;
          break;
        case "butterflies":
          phase = a.wings ?? a.phase;
          angle = a.angle + Math.PI / 2;
          width = 1 - Math.abs(a.bank ?? 0) * 0.23;
          y += Math.sin(time * 2.2 + a.phase) * 1.8 + (1 - (a.hover ?? 1)) * 5;
          break;
        case "fireflies":
          alpha *=
            0.23 +
            light * 0.15 +
            0.7 * Math.pow(0.5 + 0.5 * Math.sin(time * 1.8 + a.phase), 3);
          break;
        case "rabbits":
          aspect = a.rabbit.stretch;
          width = 1 + (1 - aspect) * 0.35;
          y += size * ((34 / 128) * (1 - aspect) - a.rabbit.lift * 0.165);
          mirror = a.turn < 0;
          break;
        case "shells":
        case "starfish":
          angle = a.phase - Math.PI;
          wet = clamp((env.field(a.x, a.y) + 58) / 51, 0, 1);
          break;
        case "crabs":
          phase = a.stroke ?? a.phase;
          angle = a.angle;
          wet = clamp((env.field(a.x, a.y) + 41) / 45, 0, 0.65);
          break;
        case "turtles":
          angle = a.angle + Math.PI / 2;
          phase = a.stroke ?? a.phase;
          immersion = clamp((env.field(a.x, a.y) - 70) / 265, 0.13, 0.88);
          alpha *=
            0.96 - immersion * 0.22 + 0.025 * Math.sin(time * 0.85 + a.phase);
          break;
        case "sailboats":
          phase = time * 2.4 + a.phase;
          angle = Math.sin(time * 1.1 + a.phase) * 0.058;
          y += Math.cos(time * 1.4 + a.phase) * 1.45;
          mirror = a.turn < 0;
          width = 0.18 + 0.82 * Math.abs(a.turn);
          break;
      }
      add(kind, a, {
        angle,
        phase,
        alpha,
        y,
        mirror,
        width,
        aspect,
        wet,
        immersion,
        emissive: kind === "fireflies",
      });
      if (night > 0.005 && (kind === "windmills" || kind === "sailboats")) {
        const mill = kind === "windmills";
        const flicker =
          Math.sin(2.7 * time + a.phase) * 0.045 +
          Math.sin(5.1 * time + a.phase) * 0.025;
        add("lantern", a, {
          x: a.x + size * (mill ? 0.018 : a.turn * 0.054),
          y: y + size * (mill ? -0.026 : 0.124),
          size: size * (mill ? 0.75 : 0.65),
          alpha: opacity * night * (0.95 + flicker),
          emissive: true,
        });
      }
      if (kind === "windmills") {
        const breeze = Math.sin(env.windPhase(a.x, a.y)) * 0.19;
        add("blades", a, {
          y: a.y - size * 0.085,
          angle: time * 0.42 + a.phase + breeze,
        });
      }
    }
    if (!length) return;
    gl.useProgram(scene.program);
    gl.bindVertexArray(scene.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, scene.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW, 0, length);
    gl.uniform2f(
      scene.uniforms.resolution,
      env.width,
      env.height + (env.bottom || 0),
    );
    gl.uniform2f(
      scene.uniforms.atlasGrid,
      scene.atlas.columns,
      scene.atlas.rows,
    );
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(scene.uniforms.atlas, 9);
    gl.uniform1f(scene.uniforms.time, time);
    gl.uniform2f(
      scene.uniforms.lighting,
      env.theme === "beach" ? light : 0,
      night,
    );
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.disable(gl.SCISSOR_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, length / INSTANCE_FLOATS);
  }
  function render(gl, env, layer = false) {
    // The full-screen wallpaper passes configure their own programs and textures.
    const previous = env.ownedPass ? null : snapshot(gl);
    try {
      let scene = states.get(gl);
      if (!scene) {
        SceneArt.load(env.theme);
        scene = create(gl, env.theme);
        states.set(gl, scene);
      } else if (!scene.atlas.artReady && SceneArt.ready(env.theme)) {
        scene.atlas = makeAtlas(env.theme);
        uploadAtlas(gl, scene.texture, scene.atlas);
      }
      lastState = scene;
      advance(scene, env);
      if (layer) {
        if (!scene.layer) scene.layer = gl.createTexture();
        if (!scene.fbo) scene.fbo = gl.createFramebuffer();
        const w = gl.canvas.width,
          h = gl.canvas.height;
        gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
        if (scene.layerWidth !== w || scene.layerHeight !== h) {
          gl.activeTexture(gl.TEXTURE9);
          gl.bindTexture(gl.TEXTURE_2D, scene.layer);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            w,
            h,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          scene.layerWidth = w;
          scene.layerHeight = h;
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            scene.layer,
            0,
          );
        }
        gl.viewport(0, 0, w, h);
        gl.disable(gl.SCISSOR_TEST);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (scene.atlas.artReady) drawBatch(gl, scene, env);
      return layer ? scene.layer : null;
    } finally {
      if (previous) restore(gl, previous);
      else {
        if (layer) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }
    }
  }
  function inspect() {
    if (!lastState) return null;
    const s = lastState;
    return {
      requested: { ...s.counts },
      visible: Object.fromEntries(
        Object.entries(s.lists).map(([key, list]) => [
          key,
          list.filter((a) => a.opacity > 0.05).length,
        ]),
      ),
      actors: Object.values(s.lists)
        .flat()
        .map((a) => ({
          kind: a.kind,
          id: a.id,
          x: a.x,
          y: a.y,
          opacity: a.opacity,
          lift: a.rabbit?.lift,
          valid: permitted(s.env, rules[a.kind], a.x, a.y),
        })),
      traces: Object.values(s.lists).flatMap((list) =>
        list.flatMap((a) =>
          (a.traces ?? []).map((mark) => ({ ...mark, kind: a.kind, id: a.id })),
        ),
      ),
      time: s.time,
    };
  }
  return { defaults, sliders, normalize, render, inspect, thumbnail, lighting };
})();
