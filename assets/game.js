(() => {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const overlayBtn = document.getElementById("overlay-btn");
  const helpBtn = document.getElementById("help-btn");
  const startBtn = document.getElementById("start-btn");
  const startPanel = document.getElementById("start-panel");
  const levelEl = document.getElementById("level-num");
  const scoreEl = document.getElementById("score-num");
  const escapeEl = document.getElementById("escape-timer");
  const dangerSlot = document.querySelector(".danger-slot");
  const flashLayer = document.getElementById("flash-layer");
  const confettiLayer = document.getElementById("confetti-layer");
  const pond = document.getElementById("pond");

  const DANGER_SECONDS = 1.5;
  const FLOWER_COLORS = ["#ff6bb5", "#ffd700", "#ff9f43", "#a55eea", "#ff4757", "#7dffb0", "#ff8fab"];
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

  const HELP_HTML =
    "<p>Tap lily pads to hop the green frog upward to the golden finish pad.</p>" +
    "<p><strong>Safe:</strong> green lily pads with flowers on them.</p>" +
    "<p><strong>Danger:</strong> a flower floating alone (no lily pad). You only have <strong>1.5 seconds</strong> — tap another pad fast!</p>" +
    "<p>Works with finger taps only. No space bar. No keyboard.</p>";

  const state = {
    mode: "ready",
    level: 1,
    score: 0,
    pads: [],
    frog: null,
    escapeUntil: 0,
    onDangerPad: false,
    anim: 0,
    jump: null,
    falling: null,
    goalPadIndex: 0,
    audio: null,
    viewW: 0,
    viewH: 0,
    overlayKind: "help",
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

  function resumeAudio() {
    const ac = ensureAudio();
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
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
    for (let i = 0; i < 48; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = FLOWER_COLORS[i % FLOWER_COLORS.length];
      piece.style.color = FLOWER_COLORS[i % FLOWER_COLORS.length];
      piece.style.animationDuration = `${1.4 + Math.random() * 1.6}s`;
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      confettiLayer.appendChild(piece);
    }
    setTimeout(() => {
      confettiLayer.innerHTML = "";
    }, 3200);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function levelConfig(level) {
    const padCount = Math.min(5 + level, 11);
    const dangerChance = Math.min(0.2 + level * 0.07, 0.58);
    const sway = Math.min(0.35 + level * 0.08, 1.35);
    return { padCount, dangerChance, sway };
  }

  function makeDecorFlower(color) {
    return {
      color: color || pick(FLOWER_COLORS),
      angle: rand(0, Math.PI * 2),
      radius: rand(10, 16),
      spin: rand(0.4, 1.4) * (Math.random() < 0.5 ? 1 : -1),
      pulse: rand(0, Math.PI * 2),
      scale: rand(0.85, 1.15),
    };
  }

  function buildLevel(level) {
    const cfg = levelConfig(level);
    const pads = [];
    const marginX = 48;
    const topY = 78;
    const bottomY = state.viewH - 100;
    const span = bottomY - topY;

    for (let i = 0; i < cfg.padCount; i++) {
      const t = i / (cfg.padCount - 1);
      const y = bottomY - t * span;
      const zig = (i % 2 === 0 ? -1 : 1) * rand(24, 78);
      const x = state.viewW / 2 + zig * (0.55 + Math.min(level, 8) * 0.05);
      const clampedX = Math.max(marginX, Math.min(state.viewW - marginX, x));
      const isGoal = i === cfg.padCount - 1;
      const isStart = i === 0;
      const isDanger = !isStart && !isGoal && Math.random() < cfg.dangerChance;

      let flowers = [];
      if (!isDanger) {
        const count = isGoal ? 3 : 2 + Math.floor(Math.random() * 2);
        for (let f = 0; f < count; f++) {
          const flower = makeDecorFlower();
          flower.angle = (Math.PI * 2 * f) / count + rand(-0.25, 0.25);
          flower.radius = 12 + count;
          flowers.push(flower);
        }
      } else {
        flowers = [makeDecorFlower(pick(["#ff6bb5", "#ff4757", "#ff9f43", "#a55eea"]))];
        flowers[0].scale = 1.35;
        flowers[0].radius = 0;
      }

      pads.push({
        x: clampedX,
        y,
        baseX: clampedX,
        r: isDanger ? 30 : isGoal ? 40 : 34,
        flowers,
        swayAmp: isStart || isGoal ? 0 : rand(5, 12) * cfg.sway,
        swaySpeed: rand(0.7, 1.5) * cfg.sway,
        swayPhase: rand(0, Math.PI * 2),
        bobPhase: rand(0, Math.PI * 2),
        glowPhase: rand(0, Math.PI * 2),
        notch: rand(0, Math.PI * 2),
        isGoal,
        isStart,
        dangerous: isDanger,
      });
    }

    state.pads = pads;
    state.goalPadIndex = pads.length - 1;
    state.frog = {
      padIndex: 0,
      x: pads[0].x,
      y: pads[0].y - 22,
      hop: 0,
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

  function showOverlay(title, html, btnLabel, kind) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = html;
    overlayBtn.textContent = btnLabel;
    state.overlayKind = kind || "help";
    overlay.classList.add("is-open");
  }

  function hideOverlay() {
    overlay.classList.remove("is-open");
  }

  function landOnPad(index) {
    const pad = state.pads[index];
    state.frog.padIndex = index;
    state.frog.x = pad.x;
    state.frog.y = pad.y - 22;
    state.jump = null;
    sfxLand();
    flash();

    if (pad.isGoal) {
      completeLevel();
      return;
    }

    if (pad.dangerous) {
      state.onDangerPad = true;
      state.escapeUntil = performance.now() + DANGER_SECONDS * 1000;
      sfxDanger();
      flash("danger");
    } else {
      state.onDangerPad = false;
      state.escapeUntil = 0;
      state.score += Math.max(1, pad.flowers.length);
      sfxCoin();
      if (pad.flowers.length >= 3) {
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
      dur: 300 + Math.abs(targetIndex - from) * 45,
      x0: start.x,
      y0: start.y - 22,
      x1: end.x,
      y1: end.y - 22,
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
        `<p>The floating flower claimed you on level ${state.level}.</p><p>Score: <strong>${state.score}</strong></p><p>Tap Try Again — no keyboard needed.</p>`,
        "Try Again",
        "dead"
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
      "Congratulations!",
      `<p>You finished level <strong>${state.level}</strong>!</p><p>Confetti time — next level gets harder.</p>`,
      `Play Level ${state.level + 1}`,
      "win"
    );
  }

  function startGame(resetScore) {
    resumeAudio();
    if (resetScore) {
      state.level = 1;
      state.score = 0;
    }
    startPanel.classList.add("is-hidden");
    resizeCanvas();
    buildLevel(state.level);
    state.mode = "play";
    hideOverlay();
    chime([NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.08);
    pond.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  }

  function drawRealFlower(fx, fy, flower, t, bigDanger) {
    const pulse = 1 + Math.sin(t * 4 + flower.pulse) * 0.1;
    const scale = (flower.scale || 1) * pulse * (bigDanger ? 1.25 : 1);
    const petals = 8;
    const petalLen = (bigDanger ? 18 : 12) * scale;
    const petalW = (bigDanger ? 9 : 6) * scale;

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(t * flower.spin * 0.35);

    if (bigDanger) {
      ctx.shadowColor = "#ff4757";
      ctx.shadowBlur = 18 + Math.sin(t * 10) * 8;
    } else {
      ctx.shadowColor = flower.color;
      ctx.shadowBlur = 10 + Math.sin(t * 5 + flower.pulse) * 4;
    }

    for (let i = 0; i < petals; i++) {
      const a = (Math.PI * 2 * i) / petals;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(petalW, -petalLen * 0.45, 0, -petalLen);
      ctx.quadraticCurveTo(-petalW, -petalLen * 0.45, 0, 0);
      ctx.fillStyle = flower.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, (bigDanger ? 7 : 5) * scale, 0, Math.PI * 2);
    const center = ctx.createRadialGradient(0, 0, 1, 0, 0, 7 * scale);
    center.addColorStop(0, "#fff8e7");
    center.addColorStop(0.55, "#ffd700");
    center.addColorStop(1, "#ff9f43");
    ctx.fillStyle = center;
    ctx.fill();

    if (bigDanger) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = `bold ${Math.round(11 * scale)}px Trebuchet MS, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.fillText("!", 0, 0);
    }

    ctx.restore();
  }

  function drawLilyPadShape(x, y, r, notchAngle) {
    const steps = 36;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * 2 * i) / steps;
      let radius = r;
      const notchWidth = 0.38;
      const da = Math.abs(((a - notchAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < notchWidth) {
        const cut = 1 - da / notchWidth;
        radius = r * (0.18 + 0.82 * (1 - cut * cut));
      } else {
        radius = r * (0.92 + 0.08 * Math.sin(a * 3));
      }
      const px = x + Math.cos(a) * radius;
      const py = y + Math.sin(a) * radius * 0.72;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawPad(pad, t) {
    const bob = Math.sin(t * 2.2 + pad.bobPhase) * 3;
    const x = pad.x;
    const y = pad.y + bob;
    const glow = 0.5 + 0.5 * Math.sin(t * 3 + pad.glowPhase);

    if (pad.dangerous) {
      ctx.save();
      ctx.shadowColor = "#ff4757";
      ctx.shadowBlur = 16 + glow * 10;
      drawRealFlower(x, y - 2, pad.flowers[0], t, true);
      ctx.restore();

      ctx.fillStyle = `rgba(255, 71, 87, ${0.55 + glow * 0.35})`;
      ctx.font = "bold 13px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("1.5s!", x, y + 28);
      return;
    }

    ctx.save();
    ctx.shadowColor = pad.isGoal ? "#ffd700" : "#7dffb0";
    ctx.shadowBlur = 14 + glow * 12;

    ctx.beginPath();
    ctx.ellipse(x + 3, y + 8, pad.r * 1.05, pad.r * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(15, 70, 110, 0.28)";
    ctx.shadowBlur = 0;
    ctx.fill();

    ctx.shadowBlur = 14 + glow * 12;
    drawLilyPadShape(x, y, pad.r, pad.notch);
    const pg = ctx.createRadialGradient(x - 10, y - 8, 4, x, y, pad.r);
    pg.addColorStop(0, "#6ee7a0");
    pg.addColorStop(0.4, "#2ecc71");
    pg.addColorStop(0.75, "#1f9e4f");
    pg.addColorStop(1, "#146b35");
    ctx.fillStyle = pg;
    ctx.fill();

    ctx.strokeStyle = "rgba(10, 70, 40, 0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.5;
    for (let v = 0; v < 5; v++) {
      const a = pad.notch + Math.PI + ((v - 2) * 0.35);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a) * pad.r * 0.35,
        y + Math.sin(a) * pad.r * 0.25,
        x + Math.cos(a) * pad.r * 0.78,
        y + Math.sin(a) * pad.r * 0.55
      );
      ctx.stroke();
    }

    if (pad.isGoal) {
      ctx.fillStyle = `rgba(255, 215, 0, ${0.4 + glow * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff8e7";
      ctx.font = "bold 12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("FINISH", x, y + pad.r * 0.72 + 14);
    }

    if (pad.isStart) {
      ctx.fillStyle = "rgba(255,248,231,0.9)";
      ctx.font = "bold 12px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("START", x, y + pad.r * 0.72 + 14);
    }

    pad.flowers.forEach((flower) => {
      const ang = flower.angle + t * flower.spin * 0.12;
      const fx = x + Math.cos(ang) * flower.radius;
      const fy = y - 6 + Math.sin(ang) * flower.radius * 0.4;
      drawRealFlower(fx, fy, flower, t, false);
    });

    ctx.restore();
  }

  function drawFrog(t) {
    const frog = state.frog;
    if (!frog) return;

    let x = frog.x;
    let y = frog.y;
    let squash = 1;
    let stretch = 1;
    let tilt = 0;

    if (state.jump) {
      const p = Math.min(1, (performance.now() - state.jump.t0) / state.jump.dur);
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      x = state.jump.x0 + (state.jump.x1 - state.jump.x0) * ease;
      const arc = Math.sin(Math.PI * p) * 78;
      y = state.jump.y0 + (state.jump.y1 - state.jump.y0) * ease - arc;
      stretch = 1 + Math.sin(Math.PI * p) * 0.28;
      squash = 1 - Math.sin(Math.PI * p) * 0.12;
      tilt = (state.jump.x1 - state.jump.x0) * 0.004;
      frog.leg = Math.sin(p * Math.PI * 2) * 0.5;
    } else if (state.falling) {
      const p = (performance.now() - state.falling.t0) / 700;
      x = state.falling.x + Math.sin(p * 20) * 8;
      y = state.falling.y + p * p * 240;
      stretch = 1.25;
      squash = 0.65;
      tilt = p * 1.2;
    } else {
      const pad = state.pads[frog.padIndex];
      if (pad) {
        const bob = Math.sin(t * 2.2 + pad.bobPhase) * 3;
        x = pad.x;
        y = pad.y + bob - 22;
        frog.x = x;
        frog.y = y;
      }
      frog.hop = Math.sin(t * 4.5) * 2.5;
      y += frog.hop;
      frog.leg = Math.sin(t * 5) * 0.18;
    }

    const blink = Math.sin(t * 2.8) > 0.93;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(squash, stretch);
    ctx.shadowColor = "#7dffb0";
    ctx.shadowBlur = 18 + Math.sin(t * 7) * 6;

    // back legs
    ctx.fillStyle = "#148a3f";
    ctx.beginPath();
    ctx.ellipse(-20, 16, 12, 7, -0.55 + frog.leg, 0, Math.PI * 2);
    ctx.ellipse(20, 16, 12, 7, 0.55 - frog.leg, 0, Math.PI * 2);
    ctx.fill();

    // feet
    ctx.beginPath();
    ctx.ellipse(-28, 20, 8, 4, -0.2, 0, Math.PI * 2);
    ctx.ellipse(28, 20, 8, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.ellipse(0, 6, 24, 18, 0, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(-6, -2, 3, 0, 6, 24);
    body.addColorStop(0, "#9dffc0");
    body.addColorStop(0.4, "#2ecc71");
    body.addColorStop(1, "#148a3f");
    ctx.fillStyle = body;
    ctx.fill();

    // belly
    ctx.beginPath();
    ctx.ellipse(0, 10, 14, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#d8ffe8";
    ctx.fill();

    // front arms
    ctx.fillStyle = "#1e9e4f";
    ctx.beginPath();
    ctx.ellipse(-16, 12, 7, 4, 0.5, 0, Math.PI * 2);
    ctx.ellipse(16, 12, 7, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.ellipse(0, -10, 16, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#2ecc71";
    ctx.fill();

    // eye bumps
    ctx.beginPath();
    ctx.arc(-9, -20, 8, 0, Math.PI * 2);
    ctx.arc(9, -20, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#2ecc71";
    ctx.fill();

    // eye whites
    ctx.fillStyle = "#fff8e7";
    ctx.beginPath();
    ctx.arc(-9, -21, 4.5, 0, Math.PI * 2);
    ctx.arc(9, -21, 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (!blink) {
      ctx.fillStyle = "#0d3a5c";
      ctx.beginPath();
      ctx.arc(-9, -21, 2.2, 0, Math.PI * 2);
      ctx.arc(9, -21, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-8, -22, 0.9, 0, Math.PI * 2);
      ctx.arc(10, -22, 0.9, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = "#0d3a5c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -21);
      ctx.lineTo(-5, -21);
      ctx.moveTo(5, -21);
      ctx.lineTo(13, -21);
      ctx.stroke();
    }

    // smile
    ctx.strokeStyle = "#148a3f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -6, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // cheek shine flicker
    if (Math.floor(t * 6) % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.ellipse(-8, 0, 5, 3, -0.4, 0, Math.PI * 2);
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
    if (p >= 1) landOnPad(state.jump.to);
  }

  function updateDanger() {
    if (state.mode !== "play" || !state.onDangerPad || state.jump) return;
    updateHud();
    if (performance.now() >= state.escapeUntil) killFrog();
  }

  function hitTestPad(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * state.viewW;
    const y = ((clientY - rect.top) / rect.height) * state.viewH;
    let best = -1;
    let bestDist = 56;
    state.pads.forEach((pad, i) => {
      const dx = pad.x - x;
      const dy = pad.y - y;
      const d = Math.hypot(dx, dy);
      const reach = pad.dangerous ? 52 : pad.r + 18;
      if (d < reach && d < bestDist) {
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

  function openHelp() {
    resumeAudio();
    showOverlay("How to Play", HELP_HTML, "Got it", "help");
  }

  helpBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openHelp();
  });

  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    startGame(true);
  });

  overlayBtn.addEventListener("click", (e) => {
    e.preventDefault();
    resumeAudio();
    if (state.overlayKind === "win") {
      nextLevel();
    } else if (state.overlayKind === "dead") {
      startGame(true);
    } else {
      hideOverlay();
    }
  });

  canvas.addEventListener("pointerdown", onPointer, { passive: false });

  window.addEventListener("resize", () => {
    const keepLevel = state.level;
    const keepScore = state.score;
    const keepPad = state.frog ? state.frog.padIndex : 0;
    const keepMode = state.mode;
    resizeCanvas();
    if (keepMode === "play" || keepMode === "win" || keepMode === "dead" || keepMode === "ready") {
      buildLevel(keepLevel);
      state.level = keepLevel;
      state.score = keepScore;
      state.mode = keepMode === "ready" ? "ready" : keepMode;
      if (state.pads[keepPad] && state.frog) {
        state.frog.padIndex = Math.min(keepPad, state.pads.length - 1);
        state.frog.x = state.pads[state.frog.padIndex].x;
        state.frog.y = state.pads[state.frog.padIndex].y - 22;
      }
      updateHud();
    }
  });

  resizeCanvas();
  buildLevel(1);
  state.mode = "ready";
  requestAnimationFrame(frame);
})();
