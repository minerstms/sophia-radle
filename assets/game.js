(() => {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const overlayBtn = document.getElementById("overlay-btn");
  const levelEl = document.getElementById("level-num");
  const scoreEl = document.getElementById("score-num");
  const escapeEl = document.getElementById("escape-timer");
  const dangerSlot = document.querySelector(".danger-slot");
  const flashLayer = document.getElementById("flash-layer");
  const confettiLayer = document.getElementById("confetti-layer");
  const pond = document.getElementById("pond");

  const FLOWER_COLORS = ["#ff6bb5", "#ffd700", "#ff9f43", "#a55eea", "#ff4757", "#7dffb0", "#fff8e7"];
  const NOTE = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.0,
    A4: 440.0,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    F5: 698.46,
    G5: 783.99,
    A5: 880.0,
    C6: 1046.5,
  };

  const state = {
    mode: "title",
    level: 1,
    score: 0,
    pads: [],
    frog: null,
    escapeUntil: 0,
    onDangerPad: false,
    anim: 0,
    lastTs: 0,
    jump: null,
    falling: null,
    goalPadIndex: 0,
    audio: null,
    confettiBusy: false,
  };

  function resizeCanvas() {
    const rect = pond.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(280, Math.floor(rect.width));
    const h = Math.max(360, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.viewW = w;
    state.viewH = h;
  }

  function ensureAudio() {
    if (state.audio) return state.audio;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    state.audio = new AC();
    return state.audio;
  }

  function tone(freq, dur, type, gain, when) {
    const ac = ensureAudio();
    if (!ac) return;
    const t0 = (when || 0) + ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function chime(freqs, step) {
    freqs.forEach((f, i) => tone(f, 0.18, "triangle", 0.1, i * (step || 0.07)));
  }

  function sfxJump() {
    tone(NOTE.C5, 0.08, "square", 0.09, 0);
    tone(NOTE.E5, 0.1, "square", 0.08, 0.05);
    tone(NOTE.G5, 0.14, "triangle", 0.1, 0.1);
  }

  function sfxLand() {
    tone(NOTE.G4, 0.06, "square", 0.08, 0);
    tone(NOTE.C5, 0.12, "triangle", 0.1, 0.04);
  }

  function sfxDanger() {
    tone(NOTE.A4, 0.08, "sawtooth", 0.07, 0);
    tone(NOTE.E4, 0.1, "sawtooth", 0.08, 0.08);
  }

  function sfxCoin() {
    tone(NOTE.E5, 0.07, "square", 0.09, 0);
    tone(NOTE.G5, 0.08, "square", 0.09, 0.06);
    tone(NOTE.C6, 0.16, "triangle", 0.11, 0.12);
  }

  function sfxDie() {
    tone(NOTE.G4, 0.12, "sawtooth", 0.1, 0);
    tone(NOTE.E4, 0.14, "sawtooth", 0.1, 0.1);
    tone(NOTE.C4, 0.28, "triangle", 0.12, 0.22);
  }

  function sfxJackpot() {
    const cascade = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6];
    cascade.forEach((f, i) => {
      tone(f, 0.14, i % 2 ? "triangle" : "square", 0.11, i * 0.08);
    });
    setTimeout(() => chime([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.09), 700);
  }

  function playWinSong() {
    const melody = [
      [NOTE.C5, 0.18],
      [NOTE.E5, 0.18],
      [NOTE.G5, 0.18],
      [NOTE.C6, 0.28],
      [NOTE.G5, 0.14],
      [NOTE.C6, 0.14],
      [NOTE.E5, 0.18],
      [NOTE.G5, 0.18],
      [NOTE.C6, 0.4],
      [NOTE.G5, 0.16],
      [NOTE.E5, 0.16],
      [NOTE.C5, 0.35],
    ];
    let t = 0;
    melody.forEach(([f, d]) => {
      tone(f, d, "square", 0.11, t);
      tone(f / 2, d, "triangle", 0.06, t);
      t += d * 0.92;
    });
  }

  function flash(kind) {
    flashLayer.className = "flash-layer is-on" + (kind ? ` is-${kind}` : "");
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      flashLayer.className = "flash-layer";
    }, 140);
  }

  function spawnConfetti() {
    confettiLayer.innerHTML = "";
    const colors = FLOWER_COLORS;
    for (let i = 0; i < 48; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.color = colors[i % colors.length];
      piece.style.animationDuration = `${1.4 + Math.random() * 1.6}s`;
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiLayer.appendChild(piece);
    }
    state.confettiBusy = true;
    setTimeout(() => {
      confettiLayer.innerHTML = "";
      state.confettiBusy = false;
    }, 3200);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function levelConfig(level) {
    const padCount = Math.min(5 + level, 12);
    const singleChance = Math.min(0.18 + level * 0.06, 0.62);
    const sway = Math.min(0.35 + level * 0.08, 1.4);
    const jumpWindow = Math.max(0.55, 1.15 - level * 0.04);
    return { padCount, singleChance, sway, jumpWindow };
  }

  function buildLevel(level) {
    const cfg = levelConfig(level);
    const pads = [];
    const marginX = 36;
    const topY = 70;
    const bottomY = state.viewH - 90;
    const span = bottomY - topY;

    for (let i = 0; i < cfg.padCount; i++) {
      const t = i / (cfg.padCount - 1);
      const y = bottomY - t * span;
      const zig = (i % 2 === 0 ? -1 : 1) * rand(18, 70);
      const x = state.viewW / 2 + zig * (0.55 + Math.min(level, 8) * 0.05);
      const clampedX = Math.max(marginX, Math.min(state.viewW - marginX, x));
      const isGoal = i === cfg.padCount - 1;
      const isStart = i === 0;
      let flowerCount;
      if (isStart || isGoal) {
        flowerCount = 3;
      } else if (Math.random() < cfg.singleChance) {
        flowerCount = 1;
      } else {
        flowerCount = 2 + Math.floor(Math.random() * 3);
      }
      const flowers = [];
      for (let f = 0; f < flowerCount; f++) {
        flowers.push({
          color: pick(FLOWER_COLORS),
          angle: (Math.PI * 2 * f) / flowerCount + rand(-0.2, 0.2),
          radius: flowerCount === 1 ? 0 : 10 + flowerCount * 1.5,
          spin: rand(0.8, 2.2) * (Math.random() < 0.5 ? 1 : -1),
          pulse: rand(0, Math.PI * 2),
        });
      }
      pads.push({
        x: clampedX,
        y,
        baseX: clampedX,
        r: isGoal ? 34 : 28,
        flowers,
        swayAmp: isStart || isGoal ? 0 : rand(6, 14) * cfg.sway,
        swaySpeed: rand(0.7, 1.6) * cfg.sway,
        swayPhase: rand(0, Math.PI * 2),
        bobPhase: rand(0, Math.PI * 2),
        glowPhase: rand(0, Math.PI * 2),
        isGoal,
        isStart,
        dangerous: flowerCount === 1,
      });
    }

    state.pads = pads;
    state.goalPadIndex = pads.length - 1;
    state.frog = {
      padIndex: 0,
      x: pads[0].x,
      y: pads[0].y - 18,
      hop: 0,
      blink: 0,
      leg: 0,
    };
    state.jump = null;
    state.falling = null;
    state.escapeUntil = 0;
    state.onDangerPad = false;
    updateHud();
  }

  function updateHud() {
    levelEl.textContent = String(state.level);
    scoreEl.textContent = String(state.score);
    if (state.onDangerPad && state.mode === "play") {
      const left = Math.max(0, state.escapeUntil - performance.now()) / 1000;
      escapeEl.textContent = left.toFixed(2) + "s";
      escapeEl.classList.remove("escape-off");
      dangerSlot.classList.add("is-hot");
    } else {
      escapeEl.textContent = "—";
      escapeEl.classList.add("escape-off");
      dangerSlot.classList.remove("is-hot");
    }
  }

  function showOverlay(title, text, btnLabel) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel;
    overlay.classList.add("is-open");
  }

  function hideOverlay() {
    overlay.classList.remove("is-open");
  }

  function landOnPad(index) {
    const pad = state.pads[index];
    state.frog.padIndex = index;
    state.frog.x = pad.x;
    state.frog.y = pad.y - 18;
    state.jump = null;
    sfxLand();
    flash();

    if (pad.isGoal) {
      completeLevel();
      return;
    }

    if (pad.dangerous) {
      state.onDangerPad = true;
      state.escapeUntil = performance.now() + 1000;
      sfxDanger();
      flash("danger");
    } else {
      state.onDangerPad = false;
      state.escapeUntil = 0;
      state.score += pad.flowers.length;
      sfxCoin();
      if (pad.flowers.length >= 4) {
        flash("jackpot");
        sfxJackpot();
        state.score += 5;
      }
    }
    updateHud();
  }

  function startJump(targetIndex) {
    if (state.mode !== "play" || state.jump || state.falling) return;
    const from = state.frog.padIndex;
    if (targetIndex === from) return;
    if (Math.abs(targetIndex - from) > 2) return;

    const start = state.pads[from];
    const end = state.pads[targetIndex];
    state.jump = {
      from,
      to: targetIndex,
      t0: performance.now(),
      dur: 320 + Math.abs(targetIndex - from) * 40,
      x0: start.x,
      y0: start.y - 18,
      x1: end.x,
      y1: end.y - 18,
    };
    state.onDangerPad = false;
    state.escapeUntil = 0;
    dangerSlot.classList.remove("is-hot");
    sfxJump();
    flash();
  }

  function killFrog() {
    if (state.mode !== "play") return;
    state.mode = "dead";
    state.onDangerPad = false;
    state.falling = {
      t0: performance.now(),
      x: state.frog.x,
      y: state.frog.y,
    };
    sfxDie();
    flash("danger");
    setTimeout(() => {
      showOverlay(
        "Splash!",
        `The flower claimed you on level ${state.level}. Score: ${state.score}`,
        "Try Again"
      );
    }, 700);
  }

  function completeLevel() {
    state.mode = "win";
    state.onDangerPad = false;
    state.score += 20 + state.level * 10;
    updateHud();
    spawnConfetti();
    playWinSong();
    flash("jackpot");
    showOverlay(
      `Congratulations!`,
      `You finished level ${state.level}! Keep hopping — it gets harder.`,
      `Play Level ${state.level + 1}`
    );
  }

  function startGame(resetScore) {
    ensureAudio();
    if (state.audio && state.audio.state === "suspended") state.audio.resume();
    if (resetScore) {
      state.level = 1;
      state.score = 0;
    }
    resizeCanvas();
    buildLevel(state.level);
    state.mode = "play";
    hideOverlay();
    chime([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08);
  }

  function nextLevel() {
    state.level += 1;
    startGame(false);
  }

  function drawWater(t) {
    const w = state.viewW;
    const h = state.viewH;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#7ec8f5");
    g.addColorStop(0.45, "#4aa8e8");
    g.addColorStop(1, "#2f8fc4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 6; i++) {
      const y = ((t * 20 + i * 90) % (h + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + t * 2 + i) * 6);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + (i % 2) * 0.05})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const sparkleN = 10;
    for (let i = 0; i < sparkleN; i++) {
      const sx = (Math.sin(t * 0.7 + i * 1.7) * 0.5 + 0.5) * w;
      const sy = (Math.cos(t * 0.5 + i * 2.1) * 0.5 + 0.5) * h;
      const a = 0.25 + 0.25 * Math.sin(t * 6 + i);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlower(fx, fy, flower, t, dangerous) {
    const pulse = 1 + Math.sin(t * 4 + flower.pulse) * 0.12;
    const petals = 6;
    const pr = 7 * pulse;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(t * flower.spin * 0.4);
    if (dangerous) {
      ctx.shadowColor = "#ff4757";
      ctx.shadowBlur = 14 + Math.sin(t * 10) * 6;
    } else {
      ctx.shadowColor = flower.color;
      ctx.shadowBlur = 10 + Math.sin(t * 5 + flower.pulse) * 4;
    }
    for (let i = 0; i < petals; i++) {
      const a = (Math.PI * 2 * i) / petals;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, pr * 0.55, pr, a, 0, Math.PI * 2);
      ctx.fillStyle = flower.color;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 4 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = dangerous ? "#fff200" : "#fff8e7";
    ctx.fill();
    ctx.restore();
  }

  function drawPad(pad, t) {
    const bob = Math.sin(t * 2.2 + pad.bobPhase) * 3;
    const x = pad.x;
    const y = pad.y + bob;
    const glow = 0.5 + 0.5 * Math.sin(t * 3 + pad.glowPhase);

    ctx.save();
    ctx.shadowColor = pad.dangerous ? "#ff4757" : pad.isGoal ? "#ffd700" : "#7dffb0";
    ctx.shadowBlur = 12 + glow * 14;

    ctx.beginPath();
    ctx.ellipse(x, y + 4, pad.r * 1.05, pad.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 70, 110, 0.25)";
    ctx.shadowBlur = 0;
    ctx.fill();

    ctx.shadowBlur = 12 + glow * 14;
    ctx.beginPath();
    ctx.ellipse(x, y, pad.r, pad.r * 0.62, 0, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(x - 8, y - 6, 4, x, y, pad.r);
    pg.addColorStop(0, "#4ad67a");
    pg.addColorStop(0.55, "#2d8a4e");
    pg.addColorStop(1, "#1f6b3a");
    ctx.fillStyle = pg;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(x, y, pad.r * 0.72, pad.r * 0.42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + glow * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (pad.isGoal) {
      ctx.fillStyle = `rgba(255, 215, 0, ${0.35 + glow * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, 8 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    pad.flowers.forEach((flower) => {
      const ang = flower.angle + t * flower.spin * 0.15;
      const fx = x + Math.cos(ang) * flower.radius;
      const fy = y - 4 + Math.sin(ang) * flower.radius * 0.45;
      drawFlower(fx, fy, flower, t, pad.dangerous);
    });

    ctx.restore();
  }

  function drawFrog(t) {
    const frog = state.frog;
    let x = frog.x;
    let y = frog.y;
    let squash = 1;
    let stretch = 1;

    if (state.jump) {
      const p = Math.min(1, (performance.now() - state.jump.t0) / state.jump.dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      x = state.jump.x0 + (state.jump.x1 - state.jump.x0) * ease;
      const arc = Math.sin(Math.PI * p) * 70;
      y = state.jump.y0 + (state.jump.y1 - state.jump.y0) * ease - arc;
      stretch = 1 + Math.sin(Math.PI * p) * 0.25;
      squash = 1 - Math.sin(Math.PI * p) * 0.15;
      frog.leg = Math.sin(p * Math.PI * 2) * 0.4;
    } else if (state.falling) {
      const p = (performance.now() - state.falling.t0) / 700;
      x = state.falling.x + Math.sin(p * 20) * 8;
      y = state.falling.y + p * p * 220;
      stretch = 1.2;
      squash = 0.7;
    } else {
      const pad = state.pads[frog.padIndex];
      if (pad) {
        x = pad.x;
        y = pad.y - 18 + Math.sin(t * 2.2 + pad.bobPhase) * 3;
        frog.x = x;
        frog.y = y;
      }
      frog.hop = Math.sin(t * 5) * 2;
      y += frog.hop;
      frog.leg = Math.sin(t * 6) * 0.15;
    }

    const blink = Math.sin(t * 3) > 0.92;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(squash, stretch);
    ctx.shadowColor = "#7dffb0";
    ctx.shadowBlur = 16 + Math.sin(t * 8) * 6;

    ctx.fillStyle = "#1e9e4f";
    ctx.beginPath();
    ctx.ellipse(-14, 10, 8, 5, -0.4 + frog.leg, 0, Math.PI * 2);
    ctx.ellipse(14, 10, 8, 5, 0.4 - frog.leg, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 4, 18, 14, 0, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(-4, -2, 2, 0, 4, 18);
    body.addColorStop(0, "#7dffb0");
    body.addColorStop(0.45, "#2ecc71");
    body.addColorStop(1, "#1e9e4f");
    ctx.fillStyle = body;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(-8, -10, 7, 0, Math.PI * 2);
    ctx.arc(8, -10, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#2ecc71";
    ctx.fill();

    ctx.fillStyle = "#fff8e7";
    ctx.beginPath();
    ctx.arc(-8, -11, 3.2, 0, Math.PI * 2);
    ctx.arc(8, -11, 3.2, 0, Math.PI * 2);
    ctx.fill();

    if (!blink) {
      ctx.fillStyle = "#0d3a5c";
      ctx.beginPath();
      ctx.arc(-8, -11, 1.6, 0, Math.PI * 2);
      ctx.arc(8, -11, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#0d3a5c";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, -11);
      ctx.lineTo(-5, -11);
      ctx.moveTo(5, -11);
      ctx.lineTo(11, -11);
      ctx.stroke();
    }

    ctx.strokeStyle = "#1e9e4f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 6, 5, 0.15, Math.PI - 0.15);
    ctx.stroke();

    if (Math.floor(t * 8) % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.ellipse(-6, 0, 4, 2, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function updatePads(t) {
    state.pads.forEach((pad) => {
      if (pad.swayAmp > 0) {
        pad.x = pad.baseX + Math.sin(t * pad.swaySpeed + pad.swayPhase) * pad.swayAmp;
      }
    });
  }

  function updateJump() {
    if (!state.jump) return;
    const p = (performance.now() - state.jump.t0) / state.jump.dur;
    if (p >= 1) {
      landOnPad(state.jump.to);
    }
  }

  function updateDanger() {
    if (state.mode !== "play" || !state.onDangerPad || state.jump) return;
    updateHud();
    if (performance.now() >= state.escapeUntil) {
      killFrog();
    }
  }

  function hitTestPad(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * state.viewW;
    const y = ((clientY - rect.top) / rect.height) * state.viewH;
    let best = -1;
    let bestDist = 48;
    state.pads.forEach((pad, i) => {
      const dx = pad.x - x;
      const dy = pad.y - y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function onPointer(e) {
    if (state.mode !== "play") return;
    e.preventDefault();
    const point = e.changedTouches ? e.changedTouches[0] : e;
    const idx = hitTestPad(point.clientX, point.clientY);
    if (idx >= 0) startJump(idx);
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    state.lastTs = ts;
    const t = ts / 1000;
    state.anim = t;

    if (!state.viewW) resizeCanvas();

    updatePads(t);
    updateJump();
    updateDanger();

    drawWater(t);
    state.pads.forEach((pad) => drawPad(pad, t));
    if (state.frog) drawFrog(t);

    requestAnimationFrame(frame);
  }

  overlayBtn.addEventListener("click", () => {
    ensureAudio();
    if (state.mode === "win") {
      nextLevel();
    } else {
      startGame(true);
    }
  });

  canvas.addEventListener("pointerdown", onPointer, { passive: false });
  canvas.addEventListener("touchstart", onPointer, { passive: false });

  window.addEventListener("resize", () => {
    resizeCanvas();
    if (state.mode === "play" || state.mode === "win" || state.mode === "dead") {
      const keepLevel = state.level;
      const keepScore = state.score;
      const keepPad = state.frog ? state.frog.padIndex : 0;
      buildLevel(keepLevel);
      state.level = keepLevel;
      state.score = keepScore;
      if (state.pads[keepPad]) {
        state.frog.padIndex = keepPad;
        state.frog.x = state.pads[keepPad].x;
        state.frog.y = state.pads[keepPad].y - 18;
      }
      updateHud();
    }
  });

  resizeCanvas();
  buildLevel(1);
  state.mode = "title";
  requestAnimationFrame(frame);
})();
