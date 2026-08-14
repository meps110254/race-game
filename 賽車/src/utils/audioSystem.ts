// ----------------------------------------------------
// WEB AUDIO SYNTHESIZED SOUND SYSTEM
// Procedural audio generation for zero-dependency real-time effects
// ----------------------------------------------------

class AudioSystem {
  private ctx: AudioContext | null = null;
  private isAllowed = false;

  // Sound nodes for looping audio
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;

  private driftOsc: OscillatorNode | null = null;
  private driftGain: GainNode | null = null;

  private scrapeOsc: OscillatorNode | null = null;
  private scrapeGain: GainNode | null = null;

  // --- Dynamic Track Ambient & Tunnel Echo Fields ---
  private ambientWindSource: AudioBufferSourceNode | null = null;
  private ambientWindGain: GainNode | null = null;
  private ambientWindFilter: BiquadFilterNode | null = null;
  private ambientWindLfo: OscillatorNode | null = null;

  private ambientCityOsc1: OscillatorNode | null = null;
  private ambientCityOsc2: OscillatorNode | null = null;
  private ambientCityGain: GainNode | null = null;

  private tunnelEchoGain: GainNode | null = null;
  private tunnelDelayNode: DelayNode | null = null;
  private tunnelFeedbackGain: GainNode | null = null;
  private tunnelFilter: BiquadFilterNode | null = null;

  private currentTrackId = "";
  private ambientIntervalId: any = null;
  private currentGear = 1;

  private ensureResume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  // Initialize and unlock the context (must be called from a user gesture)
  public init() {
    if (this.isAllowed && this.ctx) return true;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return false;

      this.ctx = new AudioContextClass();
      this.isAllowed = true;
      
      // Resume context if suspended (common in browsers)
      this.ensureResume();

      this.playChime(); // Play high-tech startup chime on authorization
      return true;
    } catch (e) {
      console.error("Failed to initialize Web Audio system:", e);
      return false;
    }
  }

  public isUnlocked() {
    return this.isAllowed && this.ctx && this.ctx.state === "running";
  }

  // Web Audio Context reference
  public getContext() {
    return this.ctx;
  }

  // Play high-tech startup authorization power-up sound
  public playChime() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    try {
      // Powerful startup engine rev + dramatic code sweep
      const sweepOsc = this.ctx.createOscillator();
      const sweepGain = this.ctx.createGain();
      
      sweepOsc.type = "sawtooth";
      sweepOsc.frequency.setValueAtTime(80, now);
      sweepOsc.frequency.exponentialRampToValueAtTime(320, now + 0.4);
      sweepOsc.frequency.exponentialRampToValueAtTime(100, now + 0.8);

      sweepGain.gain.setValueAtTime(0.08, now);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      sweepOsc.connect(sweepGain);
      sweepGain.connect(this.ctx.destination);
      sweepOsc.start(now);
      sweepOsc.stop(now + 0.8);

      // High crisp notification synth
      const synthOsc = this.ctx.createOscillator();
      const synthGain = this.ctx.createGain();
      synthOsc.type = "sine";
      synthOsc.frequency.setValueAtTime(587.33, now + 0.2); // D5
      synthOsc.frequency.setValueAtTime(880.00, now + 0.35); // A5
      synthOsc.frequency.setValueAtTime(1174.66, now + 0.5); // D6

      synthGain.gain.setValueAtTime(0, now);
      synthGain.gain.setValueAtTime(0.12, now + 0.2);
      synthGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      synthOsc.connect(synthGain);
      synthGain.connect(this.ctx.destination);
      synthOsc.start(now + 0.2);
      synthOsc.stop(now + 1.2);
    } catch (e) {
      console.warn("Startup chime error:", e);
    }
  }

  // Play snappy high-contrast menu hover/click beep
  public playClick(pitch: "low" | "medium" | "high" = "medium") {
    if (!this.ctx || !this.isAllowed) return;
    
    // Ensure active context
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      const freq = pitch === "low" ? 220 : pitch === "high" ? 880 : 440;
      osc.frequency.setValueAtTime(freq, now);
      
      // Slight pitch sweep down for clickable satisfaction
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      // Suppress minor audio glitches
    }
  }

  // Soft high-tech UI hover sound effect
  public playHover() {
    if (!this.ctx || !this.isAllowed) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1100, now);

      gain.gain.setValueAtTime(0.012, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {}
  }

  // Nitro Boost Jet Thruster Sound Effect
  public playNitro() {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;

      // High frequency jet sweep
      const jetOsc = this.ctx.createOscillator();
      const jetGain = this.ctx.createGain();
      jetOsc.type = "sawtooth";
      jetOsc.frequency.setValueAtTime(220, now);
      jetOsc.frequency.exponentialRampToValueAtTime(950, now + 0.35);

      jetGain.gain.setValueAtTime(0.18, now);
      jetGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(2400, now + 0.35);
      filter.Q.setValueAtTime(2.5, now);

      jetOsc.connect(filter);
      filter.connect(jetGain);
      jetGain.connect(this.ctx.destination);

      jetOsc.start(now);
      jetOsc.stop(now + 0.58);

      // Low bass punch
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      bassOsc.type = "sine";
      bassOsc.frequency.setValueAtTime(130, now);
      bassOsc.frequency.exponentialRampToValueAtTime(45, now + 0.4);

      bassGain.gain.setValueAtTime(0.22, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      bassOsc.connect(bassGain);
      bassGain.connect(this.ctx.destination);

      bassOsc.start(now);
      bassOsc.stop(now + 0.45);
    } catch (e) {}
  }

  // Countdown Beep (3, 2, 1 -> GO!)
  public playCountdownBeep(val: number | string) {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;
      const isGo = val === 0 || val === "GO" || val === "GO!";

      if (!isGo) {
        // Standard countdown warning tone (3, 2, 1)
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      } else {
        // GO! Bright Dual-Chime Fanfare (C5, E5, G5, C6)
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((freq, idx) => {
          const osc = this.ctx!.createOscillator();
          const gain = this.ctx!.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.12, now + 0.02 * idx);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

          osc.connect(gain);
          gain.connect(this.ctx!.destination);
          osc.start(now);
          osc.stop(now + 0.85);
        });
      }
    } catch (e) {}
  }

  // Checkpoint Pass Sci-Fi Ring Chime
  public playCheckpoint() {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.18); // A6

      osc2.frequency.setValueAtTime(1318.51, now); // E6
      osc2.frequency.exponentialRampToValueAtTime(2637.02, now + 0.18); // E7

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.32);
      osc2.stop(now + 0.32);
    } catch (e) {}
  }

  // Lap Pass Fanfare
  public playLapFanfare(isFinalLap: boolean = false) {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;
      const notes = isFinalLap 
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5, E5, G5, C6, E6
        : [523.25, 659.25, 783.99, 1046.5];       // C5, E5, G5, C6

      notes.forEach((freq, idx) => {
        const noteTime = now + idx * 0.08;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.14, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.45);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.5);
      });
    } catch (e) {}
  }

  // Race Finish Victory Fanfare
  public playVictory() {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();

    try {
      const now = this.ctx.currentTime;
      const melody = [
        { f: 392.00, d: 0.12, delay: 0.0 },  // G4
        { f: 523.25, d: 0.12, delay: 0.12 }, // C5
        { f: 659.25, d: 0.12, delay: 0.24 }, // E5
        { f: 783.99, d: 0.25, delay: 0.36 }, // G5
        { f: 1046.50, d: 0.7, delay: 0.65 }  // C6 hold
      ];

      melody.forEach(m => {
        const startTime = now + m.delay;
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(m.f, startTime);

        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + m.d + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(startTime);
        osc.stop(startTime + m.d + 0.15);
      });
    } catch (e) {}
  }

  // Mechanical Gear Shift Clunk
  public playGearShift() {
    if (!this.ctx || !this.isAllowed) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.06);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (e) {}
  }

  // Play deep synthesized crash/damage sound based on collision intensity
  public playCrash(intensity: number) {
    if (!this.ctx || !this.isAllowed) return;
    this.ensureResume();
    try {
      const now = this.ctx.currentTime;
      const duration = Math.min(1.0, 0.15 + intensity * 0.1);
      
      // Low bass rumble
      const rumbleOsc = this.ctx.createOscillator();
      const rumbleGain = this.ctx.createGain();
      rumbleOsc.type = "triangle";
      rumbleOsc.frequency.setValueAtTime(100, now);
      rumbleOsc.frequency.linearRampToValueAtTime(35, now + duration);
      
      rumbleGain.gain.setValueAtTime(Math.min(0.40, intensity * 0.15), now);
      rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      
      rumbleOsc.connect(rumbleGain);
      rumbleGain.connect(this.ctx.destination);
      rumbleOsc.start(now);
      rumbleOsc.stop(now + duration);

      // Mid metal crunch
      const crunchOsc = this.ctx.createOscillator();
      const crunchGain = this.ctx.createGain();
      const crunchFilter = this.ctx.createBiquadFilter();
      
      crunchOsc.type = "sawtooth";
      crunchOsc.frequency.setValueAtTime(220, now);
      crunchOsc.frequency.linearRampToValueAtTime(70, now + duration * 0.8);
      
      crunchFilter.type = "bandpass";
      crunchFilter.frequency.setValueAtTime(400, now);
      crunchFilter.frequency.exponentialRampToValueAtTime(100, now + duration * 0.82);
      crunchFilter.Q.setValueAtTime(6.0, now);

      crunchGain.gain.setValueAtTime(Math.min(0.30, intensity * 0.10), now);
      crunchGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

      crunchOsc.connect(crunchFilter);
      crunchFilter.connect(crunchGain);
      crunchGain.connect(this.ctx.destination);
      crunchOsc.start(now);
      crunchOsc.stop(now + duration * 0.90);

      // High crisp crunch snap
      const snapOsc = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      snapOsc.type = "sawtooth";
      snapOsc.frequency.setValueAtTime(650, now);
      snapOsc.frequency.setValueAtTime(120, now + 0.05);

      snapGain.gain.setValueAtTime(Math.min(0.25, intensity * 0.08), now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      snapOsc.connect(snapGain);
      snapGain.connect(this.ctx.destination);
      snapOsc.start(now);
      snapOsc.stop(now + 0.08);
    } catch (e) {
      console.warn("Crash audio system error:", e);
    }
  }

  // Play metallic upgrade socket sound for custom vehicle tuning
  public playUpgrade() {
    if (!this.ctx || !this.isAllowed) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
      osc.frequency.setValueAtTime(800, now + 0.15);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  }

  // Start continuous engine noise loop
  public startEngine() {
    if (!this.ctx || !this.isAllowed) return;
    if (this.engineOsc) return; // Already running

    try {
      const now = this.ctx.currentTime;
      
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.filterNode = this.ctx.createBiquadFilter();

      // Primary sawtooth osc for raw exhaust raspiness
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.setValueAtTime(45, now);

      // Secondary triangle oscillator for sub-octave rumble & thickness
      this.engineOsc2.type = "triangle";
      this.engineOsc2.frequency.setValueAtTime(22.5, now);

      // Biquad lowpass filter to form realistic exhaust muffler resonances
      this.filterNode.type = "lowpass";
      this.filterNode.frequency.setValueAtTime(180, now);
      this.filterNode.Q.setValueAtTime(4.0, now); // Higher Q for nice throaty resonance

      this.engineGain.gain.setValueAtTime(0.02, now); // Quiet base volume

      this.engineOsc.connect(this.filterNode);
      this.engineOsc2.connect(this.filterNode);
      this.filterNode.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      // --- Initialize Acoustic Tunnel Echo Sub-network ---
      this.tunnelEchoGain = this.ctx.createGain();
      this.tunnelEchoGain.gain.setValueAtTime(0.0, now); // default off (0 feed from engine)

      this.tunnelDelayNode = this.ctx.createDelay(1.5);
      this.tunnelDelayNode.delayTime.setValueAtTime(0.12, now); // 120ms concrete echo reflection delay

      this.tunnelFeedbackGain = this.ctx.createGain();
      this.tunnelFeedbackGain.gain.setValueAtTime(0.42, now); // 42% echo loop feedback decay

      this.tunnelFilter = this.ctx.createBiquadFilter();
      this.tunnelFilter.type = "bandpass";
      this.tunnelFilter.frequency.setValueAtTime(420, now); // concrete tunnel hollow tube resonance
      this.tunnelFilter.Q.setValueAtTime(2.2, now);

      // Wire feedback loop: input -> delay -> filter -> feedbackGain -> delay
      this.tunnelEchoGain.connect(this.tunnelDelayNode);
      this.tunnelDelayNode.connect(this.tunnelFilter);
      this.tunnelFilter.connect(this.tunnelFeedbackGain);
      this.tunnelFeedbackGain.connect(this.tunnelDelayNode);

      // Connect echo path to output destination
      this.tunnelFeedbackGain.connect(this.ctx.destination);

      // Connect engine output filter to the echo path
      this.filterNode.connect(this.tunnelEchoGain);

      this.engineOsc.start(now);
      this.engineOsc2.start(now);
    } catch (e) {
      console.error("Error starting engine synthesis:", e);
    }
  }

  // Dynamically map current racer speeds/accelerations to synth engine frequency/filter
  public updateEnginePitch(speed: number, isAccelerating: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineOsc2 || !this.filterNode || !this.engineGain) return;

    try {
      const now = this.ctx.currentTime;
      const absSpeed = Math.abs(speed);
      
      // Sophisticated multi-gear transmission simulation!
      // This produces extremely realistic pitch rises, drops on shifts, and higher gear hums
      let gear = 1;
      let gearSpeed = absSpeed;
      let gearRange = 25;
      let baseFreq = 40;

      if (absSpeed < 25) {
        gear = 1;
        gearSpeed = absSpeed;
        gearRange = 25;
        baseFreq = 35;
      } else if (absSpeed < 55) {
        gear = 2;
        gearSpeed = absSpeed - 25;
        gearRange = 30;
        baseFreq = 42;
      } else if (absSpeed < 85) {
        gear = 3;
        gearSpeed = absSpeed - 55;
        gearRange = 30;
        baseFreq = 48;
      } else {
        gear = 4;
        gearSpeed = absSpeed - 85;
        gearRange = 45; // Caps out high speed
        baseFreq = 54;
      }

      if (gear !== this.currentGear && absSpeed > 3) {
        this.currentGear = gear;
        this.playGearShift();
      }

      const gearProgress = Math.min(1.0, gearSpeed / gearRange);
      // Pitch sweeps up from 1.0 to 2.4 inside each gear
      const gearPitchMultiplier = 1.0 + (gearProgress * 1.4);
      
      // Calculate final target frequencies
      let targetFreq = baseFreq * gearPitchMultiplier;
      if (isAccelerating) {
        targetFreq += 18; // Extra load frequency under acceleration
      }
      
      // Sub-harmonic tracking
      const targetFreq2 = targetFreq * 0.5;

      // Filter frequency: opens up as engine revs higher to let the high-frequency "scream" through
      const targetFilter = 150 + (targetFreq * 4.5) + (isAccelerating ? 150 : 0);
      
      // Volume increases under heavy throttle and higher speeds
      const targetGainVal = 0.015 + Math.min(0.045, absSpeed * 0.0008) + (isAccelerating ? 0.025 : 0);

      // Apply target values with tailored time constants to avoid audio popping
      this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
      this.engineOsc2.frequency.setTargetAtTime(targetFreq2, now, 0.06);
      this.filterNode.frequency.setTargetAtTime(targetFilter, now, 0.07);
      this.engineGain.gain.setTargetAtTime(targetGainVal, now, 0.04);
    } catch (e) {}
  }

  // Stop continuous engine noise loop
  public stopEngine() {
    try {
      // Also stop track-specific ambient soundscapes and timers
      this.stopTrackAmbient();

      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch (e) {}
        try { this.engineOsc.disconnect(); } catch (e) {}
        this.engineOsc = null;
      }
      if (this.engineOsc2) {
        try { this.engineOsc2.stop(); } catch (e) {}
        try { this.engineOsc2.disconnect(); } catch (e) {}
        this.engineOsc2 = null;
      }
      if (this.engineGain) {
        try { this.engineGain.disconnect(); } catch (e) {}
        this.engineGain = null;
      }
      if (this.filterNode) {
        try { this.filterNode.disconnect(); } catch (e) {}
        this.filterNode = null;
      }

      // Clean up Tunnel Echo nodes
      if (this.tunnelEchoGain) {
        try { this.tunnelEchoGain.disconnect(); } catch (e) {}
        this.tunnelEchoGain = null;
      }
      if (this.tunnelDelayNode) {
        try { this.tunnelDelayNode.disconnect(); } catch (e) {}
        this.tunnelDelayNode = null;
      }
      if (this.tunnelFeedbackGain) {
        try { this.tunnelFeedbackGain.disconnect(); } catch (e) {}
        this.tunnelFeedbackGain = null;
      }
      if (this.tunnelFilter) {
        try { this.tunnelFilter.disconnect(); } catch (e) {}
        this.tunnelFilter = null;
      }
    } catch (e) {}
  }

  // Set tires drift friction squeal active
  public setDriftSqueal(active: boolean) {
    if (!this.ctx || !this.isAllowed) return;

    if (active) {
      if (this.driftOsc) return; // already active
      try {
        const now = this.ctx.currentTime;
        this.driftOsc = this.ctx.createOscillator();
        this.driftGain = this.ctx.createGain();

        // High frequency triangle/saw for brutal screeching
        this.driftOsc.type = "triangle";
        this.driftOsc.frequency.setValueAtTime(320, now);
        
        // Add frequency modulation (vibrato) to simulate tyre slip rhythm
        const modOsc = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        modOsc.frequency.setValueAtTime(35, now); // 35Hz vibration
        modGain.gain.setValueAtTime(40, now); // swing pitch up/down by 40Hz
        
        modOsc.connect(modGain);
        modGain.connect(this.driftOsc.frequency);

        this.driftGain.gain.setValueAtTime(0.045, now);

        this.driftOsc.connect(this.driftGain);
        this.driftGain.connect(this.ctx.destination);

        modOsc.start(now);
        this.driftOsc.start(now);

        // Keep reference to modOsc nested inside driftOsc dynamically
        (this.driftOsc as any).modReference = modOsc;
      } catch (err) {}
    } else {
      if (!this.driftOsc) return;
      try {
        const now = this.ctx.currentTime;
        const currentGain = this.driftGain;
        const currentOsc = this.driftOsc;
        
        // Fade out slightly to make it smoother
        if (currentGain) {
          currentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        }
        
        setTimeout(() => {
          try {
            if (currentOsc) {
              currentOsc.stop();
              currentOsc.disconnect();
              if ((currentOsc as any).modReference) {
                (currentOsc as any).modReference.stop();
                (currentOsc as any).modReference.disconnect();
              }
            }
            if (currentGain) {
              currentGain.disconnect();
            }
          } catch (ex) {}
        }, 110);

        this.driftOsc = null;
        this.driftGain = null;
      } catch (e) {}
    }
  }

  // Set scraping metallic rattle active
  public setScrapeRattle(active: boolean, intensity: number = 1.0) {
    if (!this.ctx || !this.isAllowed) return;

    if (active) {
      if (this.scrapeOsc) {
        // Just update gain/parameters if already active
        try {
          const now = this.ctx.currentTime;
          const targetVol = 0.055 * Math.min(1.5, intensity);
          this.scrapeGain?.gain.setTargetAtTime(targetVol, now, 0.08);
          if (this.scrapeOsc) {
            const targetFreq = 580 + intensity * 80;
            this.scrapeOsc.frequency.setTargetAtTime(targetFreq, now, 0.08);
          }
        } catch (ex) {}
        return;
      }
      try {
        const now = this.ctx.currentTime;
        this.scrapeOsc = this.ctx.createOscillator();
        this.scrapeGain = this.ctx.createGain();

        // High frequency saw/square for harsh metal scraping rattle
        this.scrapeOsc.type = "sawtooth";
        this.scrapeOsc.frequency.setValueAtTime(580 + intensity * 80, now);
        
        // Add random high-frequency vibrato / rattling modulation to simulate uneven sliding surfaces
        const modOsc = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        // Dynamic rattle frequencies (140Hz-240Hz rattle rattling)
        modOsc.frequency.setValueAtTime(140, now);
        modGain.gain.setValueAtTime(120, now);
        
        modOsc.connect(modGain);
        modGain.connect(this.scrapeOsc.frequency);

        this.scrapeGain.gain.setValueAtTime(0.055 * Math.min(1.5, intensity), now);

        // Add a bandpass filter to make it sound like rattling tin/metal plates
        const metalFilter = this.ctx.createBiquadFilter();
        metalFilter.type = "bandpass";
        metalFilter.frequency.setValueAtTime(1800, now);
        metalFilter.Q.setValueAtTime(4.0, now);

        this.scrapeOsc.connect(metalFilter);
        metalFilter.connect(this.scrapeGain);
        this.scrapeGain.connect(this.ctx.destination);

        modOsc.start(now);
        this.scrapeOsc.start(now);

        (this.scrapeOsc as any).modReference = modOsc;
      } catch (err) {}
    } else {
      if (!this.scrapeOsc) return;
      try {
        const now = this.ctx.currentTime;
        const currentGain = this.scrapeGain;
        const currentOsc = this.scrapeOsc;
        
        if (currentGain) {
          currentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        }
        
        setTimeout(() => {
          try {
            if (currentOsc) {
              currentOsc.stop();
              currentOsc.disconnect();
              if ((currentOsc as any).modReference) {
                (currentOsc as any).modReference.stop();
                (currentOsc as any).modReference.disconnect();
              }
            }
            if (currentGain) {
              currentGain.disconnect();
            }
          } catch (ex) {}
        }, 130);

        this.scrapeOsc = null;
        this.scrapeGain = null;
      } catch (e) {}
    }
  }

  // --- Ambient Sound Generation Methods ---
  private createWhiteNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null;
    try {
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = 2 * sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      return noiseBuffer;
    } catch (e) {
      console.warn("Failed to generate noise buffer:", e);
      return null;
    }
  }

  public setTrackAmbient(trackId: string) {
    if (!this.ctx || !this.isAllowed) return;

    // Clear previous ambient loops
    this.stopTrackAmbient();
    this.currentTrackId = trackId;

    const now = this.ctx.currentTime;

    this.ensureResume();

    try {
      if (trackId === "desert-rally") {
        // --- 1. Soughing Country Wind / Sandy Desert Breeze ---
        const noiseBuf = this.createWhiteNoiseBuffer();
        if (noiseBuf) {
          this.ambientWindSource = this.ctx.createBufferSource();
          this.ambientWindSource.buffer = noiseBuf;
          this.ambientWindSource.loop = true;

          this.ambientWindFilter = this.ctx.createBiquadFilter();
          this.ambientWindFilter.type = "bandpass";
          this.ambientWindFilter.frequency.setValueAtTime(420, now);
          this.ambientWindFilter.Q.setValueAtTime(1.8, now);

          this.ambientWindGain = this.ctx.createGain();
          this.ambientWindGain.gain.setValueAtTime(0.045, now);

          // Connect Wind Synthesis Chain
          this.ambientWindSource.connect(this.ambientWindFilter);
          this.ambientWindFilter.connect(this.ambientWindGain);
          this.ambientWindGain.connect(this.ctx.destination);

          // Slow wind LFO sweeps cutoff frequency between 220Hz and 650Hz
          this.ambientWindLfo = this.ctx.createOscillator();
          const lfoGain = this.ctx.createGain();
          this.ambientWindLfo.type = "sine";
          this.ambientWindLfo.frequency.setValueAtTime(0.07, now); // ~14s cycle
          lfoGain.gain.setValueAtTime(220, now);

          this.ambientWindLfo.connect(lfoGain);
          lfoGain.connect(this.ambientWindFilter.frequency);

          this.ambientWindSource.start(now);
          this.ambientWindLfo.start(now);

          // Schedule random heavier wind gusts every 6-10 seconds
          this.ambientIntervalId = setInterval(() => {
            if (!this.ctx || this.currentTrackId !== "desert-rally") return;
            const t = this.ctx.currentTime;
            const gustGain = this.ambientWindGain;
            if (gustGain) {
              gustGain.gain.cancelScheduledValues(t);
              gustGain.gain.setValueAtTime(gustGain.gain.value, t);
              gustGain.gain.exponentialRampToValueAtTime(0.08, t + 1.2); // gust peaks
              gustGain.gain.exponentialRampToValueAtTime(0.04, t + 3.5); // returns to normal
            }
          }, 8000);
        }
      } 
      else if (trackId === "neon-grid") {
        // --- 2. Busy Neon City Traffic & Futuristic Background Ambient ---
        // Low city traffic rumble
        this.ambientCityOsc1 = this.ctx.createOscillator();
        this.ambientCityOsc1.type = "triangle";
        this.ambientCityOsc1.frequency.setValueAtTime(48, now); // low sub rumble

        this.ambientCityOsc2 = this.ctx.createOscillator();
        this.ambientCityOsc2.type = "sine";
        this.ambientCityOsc2.frequency.setValueAtTime(82, now); // urban background drone

        this.ambientCityGain = this.ctx.createGain();
        this.ambientCityGain.gain.setValueAtTime(0.012, now);

        this.ambientCityOsc1.connect(this.ambientCityGain);
        this.ambientCityOsc2.connect(this.ambientCityGain);
        this.ambientCityGain.connect(this.ctx.destination);

        this.ambientCityOsc1.start(now);
        this.ambientCityOsc2.start(now);

        // Random city traffic sounds: distant high-tech horns & vehicle passes
        const triggerCityPass = () => {
          if (!this.ctx || this.currentTrackId !== "neon-grid") return;
          const tNow = this.ctx.currentTime;

          if (Math.random() > 0.4) {
            // Cyber double horn beeps
            const oscH1 = this.ctx.createOscillator();
            const oscH2 = this.ctx.createOscillator();
            const hornGain = this.ctx.createGain();

            oscH1.type = "sine";
            oscH2.type = "sine";
            oscH1.frequency.setValueAtTime(587.33, tNow); // D5
            oscH2.frequency.setValueAtTime(592.00, tNow);

            hornGain.gain.setValueAtTime(0.0001, tNow);
            hornGain.gain.linearRampToValueAtTime(0.005, tNow + 0.04);
            hornGain.gain.exponentialRampToValueAtTime(0.0001, tNow + 0.35);

            oscH1.connect(hornGain);
            oscH2.connect(hornGain);
            hornGain.connect(this.ctx.destination);

            oscH1.start(tNow);
            oscH2.start(tNow);
            oscH1.stop(tNow + 0.45);
            oscH2.stop(tNow + 0.45);
          } else {
            // Passing aerodynamic neon-hover swoosh
            const swooshOsc = this.ctx.createOscillator();
            const swooshFilter = this.ctx.createBiquadFilter();
            const swooshGain = this.ctx.createGain();

            swooshOsc.type = "sawtooth";
            swooshOsc.frequency.setValueAtTime(65, tNow);
            swooshOsc.frequency.exponentialRampToValueAtTime(145, tNow + 0.95);

            swooshFilter.type = "bandpass";
            swooshFilter.frequency.setValueAtTime(120, tNow);
            swooshFilter.frequency.exponentialRampToValueAtTime(1100, tNow + 0.45);
            swooshFilter.frequency.exponentialRampToValueAtTime(180, tNow + 0.95);
            swooshFilter.Q.setValueAtTime(3.5, tNow);

            swooshGain.gain.setValueAtTime(0.0001, tNow);
            swooshGain.gain.linearRampToValueAtTime(0.01, tNow + 0.45);
            swooshGain.gain.exponentialRampToValueAtTime(0.0001, tNow + 1.0);

            swooshOsc.connect(swooshFilter);
            swooshFilter.connect(swooshGain);
            swooshGain.connect(this.ctx.destination);

            swooshOsc.start(tNow);
            swooshOsc.stop(tNow + 1.1);
          }
        };

        this.ambientIntervalId = setInterval(triggerCityPass, 4500);
      } 
      else if (trackId === "speed-test" || trackId === "space-highway") {
        // --- 3. Dynamic Real-time Echo Chamber / Tunnel Echo system & Space Wind ---
        // For Speed Test or Space Highway, we open up the physical delay-feedback network
        if (this.tunnelEchoGain) {
          this.tunnelEchoGain.gain.cancelScheduledValues(now);
          // High feedback for concrete tunnel / space structure echo
          const amount = trackId === "speed-test" ? 0.35 : 0.16;
          this.tunnelEchoGain.gain.linearRampToValueAtTime(amount, now + 1.5);
        }

        // Also synthesize a deep background cosmic sci-fi space drone / hum for Space Highway
        if (trackId === "space-highway") {
          this.ambientCityOsc1 = this.ctx.createOscillator();
          this.ambientCityOsc1.type = "sine";
          this.ambientCityOsc1.frequency.setValueAtTime(65, now);

          this.ambientCityGain = this.ctx.createGain();
          this.ambientCityGain.gain.setValueAtTime(0.012, now);

          // Slight space lfo pitch warp
          const spaceLfo = this.ctx.createOscillator();
          const spaceLfoGain = this.ctx.createGain();
          spaceLfo.frequency.setValueAtTime(0.12, now); // extremely slow space wave
          spaceLfoGain.gain.setValueAtTime(3.0, now);

          spaceLfo.connect(spaceLfoGain);
          spaceLfoGain.connect(this.ambientCityOsc1.frequency);

          this.ambientCityOsc1.connect(this.ambientCityGain);
          this.ambientCityGain.connect(this.ctx.destination);

          spaceLfo.start(now);
          this.ambientCityOsc1.start(now);

          // Connect to instance so it can be stopped
          (this.ambientCityOsc1 as any).spaceLfoRef = spaceLfo;
        }
      }
    } catch (e) {
      console.warn("Failed to set track ambient soundscape:", e);
    }
  }

  public stopTrackAmbient() {
    if (this.ambientIntervalId) {
      clearInterval(this.ambientIntervalId);
      this.ambientIntervalId = null;
    }

    const now = this.ctx ? this.ctx.currentTime : 0;

    try {
      if (this.ambientWindSource) {
        try { this.ambientWindSource.stop(); } catch (e) {}
        try { this.ambientWindSource.disconnect(); } catch (e) {}
        this.ambientWindSource = null;
      }
      if (this.ambientWindLfo) {
        try { this.ambientWindLfo.stop(); } catch (e) {}
        try { this.ambientWindLfo.disconnect(); } catch (e) {}
        this.ambientWindLfo = null;
      }
      if (this.ambientWindFilter) {
        try { this.ambientWindFilter.disconnect(); } catch (e) {}
        this.ambientWindFilter = null;
      }
      if (this.ambientWindGain) {
        try { this.ambientWindGain.disconnect(); } catch (e) {}
        this.ambientWindGain = null;
      }

      if (this.ambientCityOsc1) {
        try {
          this.ambientCityOsc1.stop();
        } catch {}
        if ((this.ambientCityOsc1 as any).spaceLfoRef) {
          try {
            (this.ambientCityOsc1 as any).spaceLfoRef.stop();
            (this.ambientCityOsc1 as any).spaceLfoRef.disconnect();
          } catch {}
        }
        this.ambientCityOsc1.disconnect();
        this.ambientCityOsc1 = null;
      }
      if (this.ambientCityOsc2) {
        try {
          this.ambientCityOsc2.stop();
        } catch {}
        this.ambientCityOsc2.disconnect();
        this.ambientCityOsc2 = null;
      }
      if (this.ambientCityGain) {
        this.ambientCityGain.disconnect();
        this.ambientCityGain = null;
      }

      // Ramp down tunnel echo to 0 when leaving
      if (this.tunnelEchoGain && this.ctx) {
        this.tunnelEchoGain.gain.cancelScheduledValues(now);
        this.tunnelEchoGain.gain.setValueAtTime(this.tunnelEchoGain.gain.value, now);
        this.tunnelEchoGain.gain.linearRampToValueAtTime(0.0, now + 0.3);
      }

      this.currentTrackId = "";
    } catch (e) {
      console.warn("Error cleaning up ambient audio:", e);
    }
  }
}

export const audioSystem = new AudioSystem();
