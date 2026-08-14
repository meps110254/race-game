import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Trophy, Sparkles, Star, Volume2, RotateCw, Crown, X } from "lucide-react";
import { build3DCar } from "../utils/carBuilder";
import { CarConfig } from "../types";
import { t } from "../utils/i18n";

interface PodiumRacer {
  name: string;
  bestTime: number;
  finished: boolean;
  carConfig?: Partial<CarConfig>;
  color?: string;
}

interface PodiumCeremonyProps {
  leaderboard: PodiumRacer[];
  onClose: () => void;
}

export const PodiumCeremony: React.FC<PodiumCeremonyProps> = ({ leaderboard, onClose }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"3d" | "list">("3d");
  const [isRotating, setIsRotating] = useState(true);
  const [synthesizedSoundPlayed, setSynthesizedSoundPlayed] = useState(false);

  // Filter top 3 drivers from sorted leaderboard
  const top3 = leaderboard.slice(0, 3).map((r, index) => ({
    ...r,
    place: index + 1,
    // Fallback configurations if not defined
    carConfig: r.carConfig || {
      paint: r.color || (index === 0 ? "#eab308" : index === 1 ? "#94a3b8" : "#d97706"),
      bodyStyle: "coupe",
      spoilerType: index === 0 ? "super" : "none",
      wheelType: "sport"
    }
  }));

  // Procedural Synth Winner Fanfare
  const playVictoryFanfare = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Chord progression for ultimate classic racing victory
      // C Major -> F Major -> G Major -> C Major (high octaves)
      const playTone = (freq: number, start: number, dur: number, type: OscillatorType = "sine", volume = 0.15) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        
        // Add dynamic pitch vibrato on higher notes
        if (freq > 500) {
          osc.frequency.linearRampToValueAtTime(freq * 1.01, start + dur * 0.5);
          osc.frequency.linearRampToValueAtTime(freq * 0.99, start + dur);
        }

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.1);
      };

      // 1. Upward brassy sweep
      playTone(261.63, now, 0.45, "sawtooth", 0.06); // C4
      playTone(329.63, now + 0.1, 0.45, "sawtooth", 0.06); // E4
      playTone(392.00, now + 0.2, 0.45, "sawtooth", 0.06); // G4
      playTone(523.25, now + 0.3, 0.8, "sawtooth", 0.07); // C5 (Hold)

      // Double octave sparkles
      playTone(1046.50, now + 0.3, 0.8, "sine", 0.08); // C6 (Sparkle)

      // 2. Rising Fanfare chimes
      const chords = [
        [523.25, 659.25, 783.99], // C5, E5, G5
        [587.33, 739.99, 880.00], // D5, F#5, A5
        [659.25, 830.61, 987.77], // E5, G#5, B5
        [783.99, 987.77, 1174.66], // G5, B5, D6
        [1046.50, 1318.51, 1567.98], // C6, E6, G6 (Grand Champion!)
      ];

      chords.forEach((chord, step) => {
        const timeDelay = 0.5 + step * 0.18;
        const noteDuration = step === chords.length - 1 ? 1.6 : 0.25;
        const volumeFactor = step === chords.length - 1 ? 0.09 : 0.05;
        chord.forEach((freq) => {
          playTone(freq, now + timeDelay, noteDuration, "triangle", volumeFactor);
          // High pitch gloss overlay
          if (step === chords.length - 1) {
            playTone(freq * 2, now + timeDelay, noteDuration, "sine", 0.05);
          }
        });
      });

      // 3. Cheering white noise crowd murmur emulation
      const bufferSize = ctx.sampleRate * 2.5; // 2.5 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;
      
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(350, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(1000, now + 0.8);
      noiseFilter.frequency.exponentialRampToValueAtTime(600, now + 2.5);
      noiseFilter.Q.setValueAtTime(1.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, now);
      noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.4);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

      noiseNode.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseNode.start(now);
      noiseNode.stop(now + 2.6);

    } catch (e) {
      console.warn("Speech/Synth audio failed to compile:", e);
    }
  };

  useEffect(() => {
    // Automatically play on active mount
    if (!synthesizedSoundPlayed) {
      playVictoryFanfare();
      setSynthesizedSoundPlayed(true);
    }
  }, [synthesizedSoundPlayed]);


  useEffect(() => {
    if (activeTab !== "3d" || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 340;

    // 1. Create Scene & Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.035);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3, 14);
    camera.lookAt(new THREE.Vector3(0, 1.2, 0));

    // 2. Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 3. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 12, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Spotlights for 1st, 2nd, 3rd places
    const createSpotlight = (x: number, targetX: number, color: number) => {
      const spot = new THREE.SpotLight(color, 25, 22, Math.PI / 6, 0.3, 1);
      spot.position.set(x, 9, 3);
      spot.castShadow = true;
      const target = new THREE.Object3D();
      target.position.set(targetX, 1, 0);
      scene.add(target);
      spot.target = target;
      scene.add(spot);

      // Spotlight helper cones/beams for immersive neon atmosphere
      const coneGeo = new THREE.CylinderGeometry(0.01, 1.2, 8.5, 32, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const beam = new THREE.Mesh(coneGeo, coneMat);
      beam.position.set((x + targetX) / 2, 5, 1.5);
      // Angular rotation to match the light path
      const angle = Math.atan2(targetX - x, -9);
      beam.rotation.z = angle;
      scene.add(beam);

      return { spot, beam };
    };

    const spot1 = createSpotlight(0, 0, 0xfbbf24);     // Yellow/Gold Spotlight
    const spot2 = createSpotlight(-3.2, -3.2, 0x06b6d4); // Cyan/Silver Spotlight
    const spot3 = createSpotlight(3.2, 3.2, 0xf97316);   // Orange/Bronze Spotlight

    // 4. Create Stadium Platform/Podium Structures
    const podiumGroup = new THREE.Group();

    const buildPodiumStand = (x: number, h: number, baseColor: number, neonColor: number) => {
      const standGroup = new THREE.Group();
      standGroup.position.set(x, h / 2, 0);

      // Main column
      const standGeo = new THREE.BoxGeometry(2.4, h, 2.4);
      const standMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.4,
        metalness: 0.8
      });
      const standMesh = new THREE.Mesh(standGeo, standMat);
      standMesh.receiveShadow = true;
      standMesh.castShadow = true;
      standGroup.add(standMesh);

      // Holographic Neon frame border
      const neonGeo = new THREE.BoxGeometry(2.48, 0.08, 2.48);
      const neonMat = new THREE.MeshBasicMaterial({
        color: neonColor,
        transparent: true,
        opacity: 0.85
      });
      
      // Top Edge Rim
      const neonTop = new THREE.Mesh(neonGeo, neonMat);
      neonTop.position.y = h / 2;
      standGroup.add(neonTop);

      // Bottom Edge Rim
      const neonBottom = new THREE.Mesh(neonGeo, neonMat);
      neonBottom.position.y = -h / 2;
      standGroup.add(neonBottom);

      return standGroup;
    };

    // Gold (1st)
    const stand1 = buildPodiumStand(0, 2.2, 0x18181b, 0xfbbf24);
    podiumGroup.add(stand1);

    // Silver (2nd)
    const stand2 = buildPodiumStand(-3.2, 1.5, 0x0f172a, 0x06b6d4);
    podiumGroup.add(stand2);

    // Bronze (3rd)
    const stand3 = buildPodiumStand(3.2, 1.0, 0x020617, 0xf97316);
    podiumGroup.add(stand3);

    scene.add(podiumGroup);

    // 5. Build and Load 3D Cars for Winners
    const carsGroup = new THREE.Group();
    const loadedCars: THREE.Group[] = [];

    top3.forEach((r) => {
      const carModel = build3DCar(r.carConfig);
      const carGroup = carModel.group;

      // Position car on top of the corresponding stand
      if (r.place === 1) {
        carGroup.position.set(0, 2.2 + 0.22, 0);
        carGroup.scale.set(1.0, 1.0, 1.0);
      } else if (r.place === 2) {
        carGroup.position.set(-3.2, 1.5 + 0.22, 0);
        carGroup.scale.set(0.85, 0.85, 0.85);
        carGroup.rotation.y = -0.3; // Slight default angle
      } else if (r.place === 3) {
        carGroup.position.set(3.2, 1.0 + 0.22, 0);
        carGroup.scale.set(0.8, 0.8, 0.8);
        carGroup.rotation.y = 0.3; // Slight default angle
      }

      carsGroup.add(carGroup);
      loadedCars.push(carGroup);
    });

    scene.add(carsGroup);

    // 6. Celebration Particle Fireworks and Confetti Stream System
    const particleCount = 180;
    const confettiGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];

    const palette = [
      new THREE.Color(0xfbbf24), // Gold
      new THREE.Color(0x38bdf8), // Light Blue
      new THREE.Color(0xf43f5e), // Pink/Red
      new THREE.Color(0x34d399), // Emerald
      new THREE.Color(0xa855f7)  // Purple
    ];

    for (let i = 0; i < particleCount; i++) {
      // Scattered on top
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = 6 + Math.random() * 5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      const randomColor = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = randomColor.r;
      colors[i * 3 + 1] = randomColor.g;
      colors[i * 3 + 2] = randomColor.b;

      // Random slow fall speed with flutter rotation
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        -1.5 - Math.random() * 1.8,
        (Math.random() - 0.5) * 1.5
      ));
    }

    confettiGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    confettiGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const confettiMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const confettiParticles = new THREE.Points(confettiGeo, confettiMat);
    scene.add(confettiParticles);

    // 7. Golden Winner Fountain Sparkles shooting from Gold Podium
    const winnerSparkleCount = 100;
    const sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(winnerSparkleCount * 3);
    const sparkVelocities: THREE.Vector3[] = [];

    for (let i = 0; i < winnerSparkleCount; i++) {
      // Start exactly at the top of Gold stand Y=2.2
      sparkPos[i * 3] = (Math.random() - 0.5) * 1.6;
      sparkPos[i * 3 + 1] = 2.22 + Math.random() * 0.1;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 1.6;

      // Burst upwards and outwards
      sparkVelocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 1.8,
        2.5 + Math.random() * 3.5,
        (Math.random() - 0.5) * 1.8
      ));
    }

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 0.12,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparkParticles = new THREE.Points(sparkGeo, sparkMat);
    scene.add(sparkParticles);

    // 8. Ground Reflection Grid / Backdrop Neon Loop
    const mirrorGrid = new THREE.GridHelper(26, 26, 0x06b6d4, 0x1e293b);
    mirrorGrid.position.y = -0.01;
    (mirrorGrid.material as THREE.Material).opacity = 0.25;
    (mirrorGrid.material as THREE.Material).transparent = true;
    scene.add(mirrorGrid);

    // 9. Animation Tick Loop
    let animationId: number;
    let clock = new THREE.Clock();

    const tick = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Slow dynamic rotating camera view
      if (isRotating) {
        camera.position.x = Math.sin(elapsed * 0.25) * 12;
        camera.position.z = Math.cos(elapsed * 0.25) * 12;
        camera.lookAt(new THREE.Vector3(0, 1.4, 0));
      } else {
        // Minor idle sway
        camera.position.x = Math.sin(elapsed * 0.1) * 1.5;
        camera.position.z = 13 + Math.cos(elapsed * 0.1) * 0.5;
        camera.lookAt(new THREE.Vector3(0, 1.2, 0));
      }

      // Rotate podium spotlight helper beams
      spot1.beam.rotation.y = elapsed * 0.5;
      spot2.beam.rotation.y = elapsed * -0.4;
      spot3.beam.rotation.y = elapsed * 0.3;

      // Slowly rotate cars for beautiful presentation
      loadedCars.forEach((car, index) => {
        if (index === 0) {
          // Winner's gold GT car spins with supreme honor
          car.rotation.y = elapsed * 0.75;
          // Float up/down hover effect
          car.position.y = 2.22 + 0.22 + Math.sin(elapsed * 2.0) * 0.08;
        } else if (index === 1) {
          // Silver sports car minor floating
          car.position.y = 1.5 + 0.22 + Math.cos(elapsed * 1.5) * 0.03;
        } else if (index === 2) {
          // Bronze model slow float
          car.position.y = 1.0 + 0.22 + Math.sin(elapsed * 1.2) * 0.025;
        }
      });

      // Update falling Confetti
      const confettiArray = confettiGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        confettiArray[i * 3] += velocities[i].x * delta;
        confettiArray[i * 3 + 1] += velocities[i].y * delta;
        confettiArray[i * 3 + 2] += velocities[i].z * delta;

        // Reset if goes below platform
        if (confettiArray[i * 3 + 1] < 0) {
          confettiArray[i * 3] = (Math.random() - 0.5) * 12;
          confettiArray[i * 3 + 1] = 9 + Math.random() * 3;
          confettiArray[i * 3 + 2] = (Math.random() - 0.5) * 6;
        }
      }
      confettiGeo.attributes.position.needsUpdate = true;

      // Update Golden Fireworks spray fountain (Gravity & launch reset)
      const sparksArray = sparkGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < winnerSparkleCount; i++) {
        // Apply velocity with acceleration (gravity)
        sparkVelocities[i].y -= 4.5 * delta; // Gravity pull

        sparksArray[i * 3] += sparkVelocities[i].x * delta;
        sparksArray[i * 3 + 1] += sparkVelocities[i].y * delta;
        sparksArray[i * 3 + 2] += sparkVelocities[i].z * delta;

        // Reset when spark burns out or falls below gold stand height
        if (sparksArray[i * 3 + 1] < 2.0 || Math.random() < 0.015) {
          sparksArray[i * 3] = (Math.random() - 0.5) * 1.5;
          sparksArray[i * 3 + 1] = 2.22;
          sparksArray[i * 3 + 2] = (Math.random() - 0.5) * 1.5;

          sparkVelocities[i].set(
            (Math.random() - 0.5) * 1.8,
            3.5 + Math.random() * 3.5,
            (Math.random() - 0.5) * 1.8
          );
        }
      }
      sparkGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
      animationId = requestAnimationFrame(tick);
    };

    tick();

    // 10. Handler resize
    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      try {
        container.removeChild(renderer.domElement);
      } catch (e) {}

      // Dispose resources
      scene.clear();
      renderer.dispose();
      confettiGeo.dispose();
      confettiMat.dispose();
      sparkGeo.dispose();
      sparkMat.dispose();
    };
  }, [activeTab, isRotating]);

  return (
    <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-3xl p-5 mb-6 text-left flex flex-col space-y-4 shadow-2xl relative select-none">
      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
        <div className="flex items-center space-x-2.5">
          <Crown className="w-5 h-5 text-yellow-400 animate-bounce" />
          <div className="flex flex-col">
            <span className="text-[10px] text-yellow-400 font-mono tracking-wider uppercase font-bold">
              🏆 {t("podiumTitle")}
            </span>
            <span className="text-xs text-slate-100 font-black font-sans">
              CONGRATULATIONS CHAMPIONS!
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Tab Switcher */}
          <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex">
            <button
              onClick={() => {
                setActiveTab("3d");
              }}
              className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase rounded transition cursor-pointer ${
                activeTab === "3d"
                  ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t("tab3d")}
            </button>
            <button
              onClick={() => {
                setActiveTab("list");
              }}
              className={`px-2.5 py-1 text-[9px] font-mono font-black uppercase rounded transition cursor-pointer ${
                activeTab === "list"
                  ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t("tabList")}
            </button>
          </div>

          <button
            onClick={playVictoryFanfare}
            className="p-1 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-100 transition cursor-pointer"
            title={t("fanfareTitle")}
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {activeTab === "3d" ? (
        <div className="relative">
          {/* ThreeJS Container Canvas block */}
          <div 
            ref={mountRef}
            className="w-full h-[320px] bg-gradient-to-b from-slate-950 to-slate-900/60 rounded-2xl relative overflow-hidden border border-slate-900/80 shadow-inner"
          />

          {/* Controls UI overlayed on the 3D canvas */}
          <button
            onClick={() => {
              setIsRotating(!isRotating);
            }}
            className="absolute bottom-3 left-3 bg-slate-950/90 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase transition flex items-center space-x-1.5 cursor-pointer shadow-md select-none pointer-events-auto"
          >
            <RotateCw className={`w-2.5 h-2.5 ${isRotating ? "animate-spin" : ""}`} />
            <span>{isRotating ? t("cameraRotateOn") : t("cameraLockOff")}</span>
          </button>

          {/* HTML Driver Tag labels over 3D coordinates */}
          <div className="absolute top-3 left-3 right-3 flex justify-between pointer-events-none select-none">
            {/* 2nd Place Driver Tag */}
            <div className="flex flex-col items-center bg-slate-950/85 backdrop-blur-xs border border-slate-800 rounded-xl py-1.5 px-2.5 shadow-md">
              <span className="text-[8px] font-mono font-bold text-cyan-400">🥈 2ND PLACE</span>
              <span className="text-xs font-black text-slate-200 truncate max-w-[80px]">
                {top3[1]?.name || t("racer")}
              </span>
            </div>

            {/* 1st Place Champion Tag */}
            <div className="flex flex-col items-center bg-yellow-500/10 backdrop-blur-xs border border-yellow-500/30 rounded-xl py-2 px-3.5 shadow-lg shadow-yellow-500/5 pulse">
              <div className="flex items-center space-x-1">
                <Crown className="w-3 h-3 text-yellow-400 animate-pulse" />
                <span className="text-[8px] font-mono font-bold text-yellow-400">🏆 CHAMPION</span>
              </div>
              <span className="text-sm font-black text-yellow-100 truncate max-w-[100px] animate-pulse">
                {top3[0]?.name || t("championRacer")}
              </span>
            </div>

            {/* 3rd Place Driver Tag */}
            <div className="flex flex-col items-center bg-slate-950/85 backdrop-blur-xs border border-slate-800 rounded-xl py-1.5 px-2.5 shadow-md">
              <span className="text-[8px] font-mono font-bold text-amber-600">🥉 3RD PLACE</span>
              <span className="text-xs font-black text-slate-300 truncate max-w-[80px]">
                {top3[2]?.name || t("racer")}
              </span>
            </div>
          </div>

          <div className="absolute bottom-3 right-3 text-[9px] text-slate-500 font-mono text-right flex items-center space-x-1 pointer-events-none select-none">
            <Sparkles className="w-2.5 h-2.5 text-yellow-400 animate-pulse" />
            <span>{t("podiumCompiled")}</span>
          </div>
        </div>
      ) : (
        /* Detailed scoreboard list content */
        <div className="bg-slate-900/40 p-4 border border-slate-800/60 rounded-2xl flex flex-col space-y-2">
          <div className="grid grid-cols-12 text-[9px] text-slate-500 uppercase font-mono border-b border-slate-800 pb-1.5 px-2">
            <span className="col-span-2">{t("rank")}</span>
            <span className="col-span-4">{t("driverName")}</span>
            <span className="col-span-3">{t("carBodyStyle")}</span>
            <span className="col-span-3 text-right">{t("lapTime")}</span>
          </div>
          <div className="space-y-1.5 max-h-[290px] overflow-y-auto">
            {top3.map((r, i) => {
              const bgClass =
                i === 0
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-200"
                  : i === 1
                  ? "bg-slate-900/60 border-cyan-500/20 text-slate-200"
                  : "bg-slate-900/40 border-slate-800 text-slate-300";

              return (
                <div key={i} className={`grid grid-cols-12 items-center p-2.5 rounded-xl border text-xs font-mono font-bold ${bgClass}`}>
                  <span className="col-span-2 text-sm">
                    {i === 0 ? "🥇 #1" : i === 1 ? "🥈 #2" : "🥉 #3"}
                  </span>
                  <span className="col-span-4 truncate">{r.name}</span>
                  <span className="col-span-3 flex items-center space-x-1">
                    <span 
                      style={{ backgroundColor: r.carConfig?.paint || r.color }} 
                      className="w-3.5 h-3.5 rounded-md border border-slate-900 flex-shrink-0" 
                    />
                    <span className="text-[10px] text-slate-400 capitalize truncate">{r.carConfig?.bodyStyle || "Coupe"}</span>
                  </span>
                  <span className="col-span-3 text-right font-extrabold text-cyan-400">
                    {r.bestTime > 0 ? `${(r.bestTime / 1000).toFixed(3)}s` : t("didNotFinish")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ribbon note */}
      <div className="text-[10px] text-slate-400 bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl leading-relaxed text-center font-sans">
        🏁 <span className="text-yellow-400 font-extrabold">{t("championTeam")}</span>
      </div>
    </div>
  );
};
