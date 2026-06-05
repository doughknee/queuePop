// Shared alarm-sound synthesizer, used by both the phone companion and the
// desktop Settings "Preview" button. Pure WebAudio (no files, fully offline,
// no copyright). Each preset schedules ONE play; the caller repeats it.

(function () {
  // Bell-like partial: sine fundamental + a slightly inharmonic overtone, with
  // a quick attack and an exponential decay, that's what reads as "chime".
  function bell(ctx, freq, t0, dur, peak) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o2.type = "sine";
    o2.frequency.value = freq * 2.01; // inharmonic shimmer
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + dur + 0.05);
    o2.stop(t0 + dur + 0.05);
  }

  function tone(ctx, type, freq, t0, dur, peak) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  const N = {
    C5: 523.25, E5: 659.25, G5: 783.99,
    A5: 880.0, C6: 1046.5, E6: 1318.51,
  };

  const PRESETS = {
    // Warm rising bell arpeggio, the default. Pleasant + clearly attention-getting.
    chime(ctx) {
      const t = ctx.currentTime + 0.02;
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => bell(ctx, f, t + i * 0.12, 0.9, 0.28));
      return 1.6;
    },
    // Soft two-note notification.
    ping(ctx) {
      const t = ctx.currentTime + 0.02;
      bell(ctx, N.A5, t, 0.5, 0.3);
      bell(ctx, N.E6, t + 0.16, 0.7, 0.3);
      return 1.2;
    },
    // Cheerful video-gamey ascending blip.
    arcade(ctx) {
      const t = ctx.currentTime + 0.02;
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) =>
        tone(ctx, "triangle", f, t + i * 0.07, 0.16, 0.18));
      return 1.0;
    },
    // The original loud square siren, kept for people who want maximum volume.
    siren(ctx) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      for (let i = 0; i < 4; i++) {
        o.frequency.setValueAtTime(620, t + i * 0.3);
        o.frequency.setValueAtTime(900, t + i * 0.3 + 0.15);
      }
      g.gain.setValueAtTime(0.14, t);
      g.gain.setValueAtTime(0.0001, t + 1.2);
      o.start(t);
      o.stop(t + 1.25);
      return 1.4;
    },
  };

  window.QueuePopAlarm = {
    presetIds: ["chime", "ping", "arcade", "siren"],
    labels: {
      chime: "Chime",
      ping: "Ping",
      arcade: "Arcade",
      siren: "Siren (loud)",
      custom: "Custom file…",
    },
    // Play one cycle of `preset` on `ctx`. Returns approx duration (seconds).
    play(ctx, preset) {
      const fn = PRESETS[preset] || PRESETS.chime;
      try {
        return fn(ctx) || 1.5;
      } catch (_) {
        return 1.5;
      }
    },
  };
})();
