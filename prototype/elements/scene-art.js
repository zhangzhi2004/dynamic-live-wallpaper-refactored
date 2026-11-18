"use strict";

window.SceneArt = (() => {
  const TAU = Math.PI * 2;
  const sheets = {};
  const compiled = new Map();

  // Pixel bounds on the transparent 1536 × 1024 source sheets, followed
  // by the artwork width and baseline in a centred 128 px atlas tile.
  const assets = {
    flowers: ["meadow", [28, 47, 454, 409], 88, 37],
    mushrooms: ["meadow", [535, 58, 448, 399], 87, 41],
    butterflies: ["meadow", [1032, 101, 474, 326], 91, 32],
    fireflies: ["meadow", [47, 576, 441, 351], 41, 14],
    rabbits: ["meadow", [537, 506, 448, 473], 80, 34],
    windmills: ["meadow", [1056, 502, 428, 493], 79, 46],
    umbrellas: ["beach", [49, 31, 450, 434], 88, 42],
    shells: ["beach", [551, 69, 432, 363], 83, 34],
    starfish: ["beach", [1044, 37, 446, 406], 77, 34],
    crabs: ["beach", [44, 550, 464, 408], 94, 34],
    sailboats: ["beach", [548, 492, 428, 479], 82, 35],
    turtles: ["beach", [1008, 492, 491, 483], 91, 44],
  };
  const finishes = {
    flowers: [
      "saturate(.89)",
      "hue-rotate(-39deg) saturate(.77)",
      "hue-rotate(18deg) saturate(.85)",
    ],
    mushrooms: [
      "saturate(.85)",
      "hue-rotate(21deg) saturate(.73)",
      "hue-rotate(-18deg) saturate(.70)",
    ],
    butterflies: [
      "none",
      "hue-rotate(147deg) saturate(.68)",
      "hue-rotate(-32deg) saturate(.84)",
    ],
    rabbits: [
      "none",
      "brightness(.83) saturate(1.07)",
      "grayscale(.76) brightness(.91)",
    ],
    windmills: [
      "saturate(.83)",
      "hue-rotate(-20deg) saturate(.74)",
      "saturate(.68) brightness(.92)",
    ],
    umbrellas: [
      "saturate(.86)",
      "hue-rotate(31deg) saturate(.79)",
      "hue-rotate(151deg) saturate(.63)",
    ],
    shells: [
      "none",
      "hue-rotate(18deg) saturate(.65)",
      "hue-rotate(-50deg) saturate(.65)",
    ],
    starfish: [
      "saturate(.90)",
      "hue-rotate(20deg) saturate(.84)",
      "hue-rotate(-22deg) saturate(.72)",
    ],
    crabs: [
      "saturate(.85)",
      "hue-rotate(16deg) saturate(.79)",
      "hue-rotate(-15deg) saturate(.75)",
    ],
    sailboats: [
      "saturate(.89)",
      "hue-rotate(-27deg) saturate(.76)",
      "hue-rotate(22deg) saturate(.78)",
    ],
    turtles: [
      "saturate(.75)",
      "hue-rotate(21deg) saturate(.71)",
      "hue-rotate(37deg) saturate(.65)",
    ],
  };

  function load(theme) {
    if (sheets[theme]) return sheets[theme].loading;
    const sheet = (sheets[theme] = { ready: false, image: null });
    sheet.loading = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        sheet.image = image;
        sheet.ready = true;
        resolve();
      };
      image.onerror = () => {
        console.warn("Unable to load painted Deskland elements for", theme);
        sheet.ready = true;
        resolve();
      };
      image.src = `assets/${theme}-painted-elements.png?v=0.3.4`;
    });
    return sheet.loading;
  }
  function ready(theme) {
    return !!sheets[theme]?.ready;
  }

  function gradient(ctx, x0, y0, x1, y1, ...colors) {
    const fill = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((color, i) =>
      fill.addColorStop(i / (colors.length - 1), color),
    );
    return fill;
  }
  function oval(ctx, x, y, width, height, fill, angle = 0) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, width, height, angle, 0, TAU);
    ctx.fill();
  }
  function line(ctx, trace, color, width = 1) {
    ctx.beginPath();
    trace(ctx);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function originalPaint(kind, variant) {
    const [theme, box] = assets[kind];
    const sheet = sheets[theme]?.image;
    if (!sheet) return null;
    const key = kind + variant;
    if (!compiled.has(key)) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = Math.round((canvas.width * box[3]) / box[2]);
      const ctx = canvas.getContext("2d");
      ctx.filter = finishes[kind]?.[variant] || "none";
      ctx.drawImage(sheet, ...box, 0, 0, canvas.width, canvas.height);
      compiled.set(key, canvas);
    }
    return compiled.get(key);
  }

  // Stretch the wings or claws away from a stationary centre. Keeping the
  // central strip fixed prevents the face, body and shell from pulsing.
  function hingedSides(ctx, image, x, y, w, h, centre, left, right) {
    const { width, height } = image;
    const wing = Math.floor((width * (1 - centre)) / 2);
    const side = (w * wing) / width;
    const torso = w - side * 2;
    const midX = x + side;
    ctx.drawImage(
      image,
      0,
      0,
      wing + 1,
      height,
      midX - side * left,
      y,
      side * left + 0.32,
      h,
    );
    ctx.drawImage(image, wing, 0, width - wing * 2, height, midX, y, torso, h);
    ctx.drawImage(
      image,
      width - wing - 1,
      0,
      wing + 1,
      height,
      midX + torso - 0.25,
      y,
      side * right + 0.25,
      h,
    );
  }

  // Approximate a wind bend along the vertical axis while keeping roots
  // and the lower hull lined up across animation frames.
  function bendFromBase(ctx, image, x, y, w, h, amount) {
    const { width, height } = image;
    const rows = 18;
    for (let row = 0; row < rows; row++) {
      const t = row / rows,
        end = (row + 1) / rows;
      const xShift = amount * (1 - t) ** 2;
      ctx.drawImage(
        image,
        0,
        height * t,
        width,
        height * (end - t),
        x + xShift,
        y + h * t,
        w,
        h * (end - t) + 0.22,
      );
    }
  }

  function body(ctx, kind, phase, variant) {
    const image = originalPaint(kind, variant);
    if (!image) return;
    const [, , w, baseline] = assets[kind];
    const h = (w * image.height) / image.width;
    const x = -w * 0.5;
    const y = baseline - h;
    switch (kind) {
      case "flowers":
        bendFromBase(ctx, image, x, y, w, h, Math.sin(phase) * 5.7);
        return;
      case "sailboats":
        bendFromBase(ctx, image, x, y, w, h, Math.sin(phase) * 2.8);
        return;
      case "butterflies": {
        const opening = 0.22 + 0.78 * (0.5 + 0.5 * Math.cos(phase)) ** 0.58;
        hingedSides(ctx, image, x, y, w, h, 0.16, opening, opening);
        return;
      }
      case "turtles": {
        const kick = Math.sin(phase) * 0.16;
        hingedSides(ctx, image, x, y, w, h, 0.59, 0.82 + kick, 0.82 - kick);
        return;
      }
      case "crabs": {
        const scuttle = Math.sin(phase) * 0.12;
        hingedSides(
          ctx,
          image,
          x,
          y - Math.abs(scuttle) * 8,
          w,
          h,
          0.42,
          0.85 + scuttle,
          0.85 - scuttle,
        );
        return;
      }
      case "fireflies": {
        const halo = ctx.createRadialGradient(0, 5, 2, 0, 5, 44);
        halo.addColorStop(0, "#fff6b6ab");
        halo.addColorStop(0.36, "#ffce5541");
        halo.addColorStop(1, "#ffdc3c00");
        oval(ctx, 0, 5, 44, 44, halo);
        break;
      }
    }
    ctx.drawImage(image, x, y, w, h);
  }

  function blades(ctx, phase, variant, random) {
    for (let j = 0; j < 4; j++) {
      ctx.rotate(Math.PI / 2);
      line(
        ctx,
        (c) => {
          c.moveTo(0, 0);
          c.lineTo(0, -46);
        },
        "#895a36",
        2.1,
      );
      const trace = (c) => {
        c.moveTo(1, -11);
        c.lineTo(13, -15);
        c.lineTo(10, -48);
        c.quadraticCurveTo(5, -50, 0, -47);
        c.closePath();
      };
      ctx.beginPath();
      trace(ctx);
      ctx.fillStyle = gradient(
        ctx,
        1,
        -33,
        13,
        -30,
        "#f6d8a0",
        "#ca9760",
        "#9f6b43",
      );
      ctx.fill();
      ctx.strokeStyle = "#674530";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 105; i++) {
        const x = random() * 14,
          y = -13 - random() * 36;
        line(
          ctx,
          (c) => {
            c.moveTo(x, y);
            c.lineTo(x - 0.4, y - random() * 2.9);
          },
          i % 2 ? "#fff4c67c" : "#61382755",
          0.55 + random() * 0.4,
        );
      }
      for (let k = 0; k < 6; k++) {
        const y = -18 - 5 * k;
        line(
          ctx,
          (c) => {
            c.moveTo(0, y);
            c.lineTo(13, y - 1);
          },
          "#8057399c",
          0.9,
        );
      }
      ctx.restore();
    }
    oval(ctx, 0, 0, 5.1, 4.9, "#725137");
    oval(ctx, -0.65, -0.85, 3.6, 3.5, "#d3a367");
  }

  // Effects are intentionally separate from the bitmap art. They follow
  // the scene's lighting and motion and are drawn in the same WebGL batch.
  function contact(ctx) {
    const falloff = ctx.createRadialGradient(0, 0, 2, 0, 0, 50);
    falloff.addColorStop(0, "#243b3070");
    falloff.addColorStop(0.54, "#283b3045");
    falloff.addColorStop(1, "#283b3000");
    oval(ctx, 0, 0, 50, 50, falloff);
  }
  function bentGrass(ctx) {
    const shade = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
    shade.addColorStop(0, "#33472372");
    shade.addColorStop(1, "#33472300");
    oval(ctx, 0, 1, 48, 20, shade, -0.07);
    for (const [x, y, reach, bend] of [
      [-35, 5, 22, -5],
      [-24, 13, 19, 5],
      [-25, -12, 24, -11],
      [-6, 1, 33, -7],
      [10, 13, 22, -3],
      [16, -5, 20, -7],
    ]) {
      line(
        ctx,
        (c) => {
          c.moveTo(x, y);
          c.quadraticCurveTo(x + reach * 0.38, y - 7, x + reach, y + bend);
        },
        gradient(
          ctx,
          x,
          y,
          x + reach,
          y + bend,
          "#41734c90",
          "#b2c076a2",
          "#dfe4a300",
        ),
        3.1,
      );
    }
  }
  function sandPrints(ctx) {
    for (const [x, y, tilt, size] of [
      [-31, -25, -0.62, 6],
      [-12, -33, -0.42, 7],
      [10, -32, -0.17, 7],
      [-24, 16, 0.42, 5],
      [-5, 27, 0.83, 7],
      [19, 25, 0.65, 7],
    ]) {
      oval(ctx, x + 1.6, y + 2.8, size + 2, 4.6, "#fff1cfbe", tilt);
      oval(ctx, x, y, size, 3.1, "#78583d96", tilt);
      oval(ctx, x - 0.9, y - 1.3, size * 0.62, 1.2, "#98775192", tilt);
    }
  }
  function wake(ctx) {
    for (const side of [-1, 1]) {
      const sweep = (c, shift) => {
        c.moveTo(-51, side * 32 + shift);
        c.bezierCurveTo(
          -24,
          side * 35 + shift,
          17,
          side * 14 + shift,
          49,
          side * 13 + shift,
        );
      };
      line(
        ctx,
        (c) => sweep(c, 3.5),
        gradient(ctx, -51, 0, 49, 0, "#508d9100", "#3d8e9d68", "#4d8d9600"),
        7.2,
      );
      line(
        ctx,
        (c) => sweep(c, 0),
        gradient(
          ctx,
          -51,
          0,
          49,
          0,
          "#defff500",
          "#e7fff3e6",
          "#f9f6dbac",
          "#d6fffb00",
        ),
        5.2,
      );
      oval(ctx, -18 + side * 4, side * 40, 7, 2.7, "#dcfff6a1", -side * 0.12);
    }
  }
  function reflection(ctx) {
    const water = gradient(
      ctx,
      0,
      -18,
      0,
      25,
      "#fff0c800",
      "#ffe7af9a",
      "#cce9df00",
    );
    for (const [y, width, x] of [
      [-13, 22, 2],
      [-6, 29, -6],
      [1, 26, 3],
      [7, 21, -4],
      [14, 14, 4],
      [21, 9, 1],
    ]) {
      oval(ctx, x, y, width, 1.9, water, -0.035);
    }
  }
  function surfaceRing(ctx) {
    const ripple = gradient(
      ctx,
      -49,
      0,
      49,
      0,
      "#e9f7e800",
      "#e8ffedc0",
      "#bdedec00",
    );
    line(
      ctx,
      (c) => {
        c.ellipse(0, 0, 46, 24, 0, Math.PI * 0.12, Math.PI * 0.85);
        c.moveTo(-44, -6);
        c.ellipse(0, 0, 47, 24, 0, Math.PI * 1.08, Math.PI * 1.66);
      },
      ripple,
      3.6,
    );
  }
  function lightSpill(ctx) {
    const light = ctx.createRadialGradient(0, 0, 1, 0, 0, 49);
    light.addColorStop(0, "#ffdb8888");
    light.addColorStop(0.42, "#edbf593b");
    light.addColorStop(1, "#f3ba3d00");
    oval(ctx, 0, 0, 49, 49, light);
  }
  function lantern(ctx) {
    lightSpill(ctx);
    oval(ctx, 0, 0, 6.3, 7.3, "#e8a955a8");
    oval(ctx, 0, -0.2, 3.4, 4.9, "#fff0bc");
  }
  const effects = {
    blades,
    contact,
    bentGrass,
    sandPrints,
    wake,
    reflection,
    surfaceRing,
    lantern,
    lightSpill,
  };
  function paint(ctx, kind, phase, variant, random) {
    ctx.save();
    ctx.translate(64, 64);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (effects[kind]) effects[kind](ctx, phase, variant, random);
    else body(ctx, kind, phase, variant);
    ctx.restore();
  }
  return { load, ready, paint };
})();
