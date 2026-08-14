import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CarConfig } from "../types";
import { build3DCar } from "../utils/carBuilder";
import { Wrench, Palette, Disc, ShieldAlert, Zap } from "lucide-react";
import { unlockAchievement } from "../utils/achievementSystem";
import { audioSystem } from "../utils/audioSystem";
import { t } from "../utils/i18n";

interface CarGarageProps {
  config: CarConfig;
  onChange: (newConfig: CarConfig) => void;
  onConfirm: () => void;
}

export default function CarGarage({ config, onChange, onConfirm }: CarGarageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const currentModelRef = useRef<any>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Preset gorgeous colors
  const colorPresets = [
    { name: "霓虹桃紅 (Neon Pink)", hex: "#ff3366" },
    { name: "極速亮橘 (Vibrant Orange)", hex: "#ff5500" },
    { name: "法拉利紅 (Racing Red)", hex: "#dc2626" },
    { name: "曜石碳黑 (Carbon Black)", hex: "#111111" },
    { name: "極致亮黃 (Racing Yellow)", hex: "#facc15" },
    { name: "電能初藍 (Electric Cyan)", hex: "#06b6d4" },
    { name: "極地雪白 (Alpine White)", hex: "#f8fafc" },
    { name: "奢華尊金 (Racing Gold)", hex: "#d4af37" }
  ];

  // Calculate dynamic stats
  const maxSpeed = 100 + config.engineLevel * 15 - config.weightLevel * 3;
  const acceleration = 40 + (6 - config.weightLevel) * 10 + config.engineLevel * 4;
  const tractionGrip = 30 + config.gripLevel * 12 + (config.wheelType === 'offroad' ? 10 : 0);

  useEffect(() => {
    if (!mountRef.current) return;

    // 1. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    // Grid Floor
    const gridHelper = new THREE.GridHelper(15, 30, 0x00ffff, 0x221144);
    gridHelper.position.y = -0.55;
    scene.add(gridHelper);

    // Reflective surface plane
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x08080c,
      roughness: 0.4,
      metalness: 0.8
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.56;
    floor.receiveShadow = true;
    scene.add(floor);

    // 2. Setup Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(2.8, 1.4, 4.0);
    camera.lookAt(0, 0.1, 0);

    // 3. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x00ffff, 0.9);
    dirLight1.position.set(5, 8, 5);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xff00ff, 0.6);
    dirLight2.position.set(-5, 4, -5);
    scene.add(dirLight2);

    const spotlight = new THREE.SpotLight(0xffffff, 1.5, 12, Math.PI / 6, 0.5, 1);
    spotlight.position.set(0, 4, 0);
    spotlight.target.position.set(0, 0, 0);
    scene.add(spotlight);

    // 5. Initial Car building
    const carModel = build3DCar(config);
    scene.add(carModel.group);
    currentModelRef.current = carModel;

    // Rotate slowly
    let animeId: number;
    const animate = () => {
      animeId = requestAnimationFrame(animate);
      if (currentModelRef.current) {
        currentModelRef.current.group.rotation.y += 0.007;
        
        // Rotate wheels slowly on turntable
        const val = Date.now() * 0.005;
        currentModelRef.current.wheelsFrontLeft.children[0].rotation.x = val;
        currentModelRef.current.wheelsFrontRight.children[0].rotation.x = val;
        currentModelRef.current.wheelsRearLeft.children[0].rotation.x = val;
        currentModelRef.current.wheelsRearRight.children[0].rotation.x = val;
      }
      renderer.render(scene, camera);
    };
    animate();

    // 6. Handle resizing
    let resizeFrameId: number;
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        if (!mountRef.current || !rendererRef.current) return;
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
      });
    });
    resizeObserver.observe(mountRef.current);

    return () => {
      cancelAnimationFrame(animeId);
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      scene.clear();
      renderer.dispose();
    };
  }, []);

  // Update 3D Model dynamically when config attributes change
  useEffect(() => {
    if (currentModelRef.current) {
      // Find scene parent
      const parent = currentModelRef.current.group.parent;
      if (parent) {
        // Save current rotation
        const currentRot = currentModelRef.current.group.rotation.y;
        
        parent.remove(currentModelRef.current.group);
        const nextModel = build3DCar(config);
        nextModel.group.rotation.y = currentRot;
        parent.add(nextModel.group);
        currentModelRef.current = nextModel;
      }
    }
  }, [config]);

  // Helper to change config fields
  const setField = (field: keyof CarConfig, value: any) => {
    // Force numbers for levels
    if (typeof value === 'string' && !isNaN(Number(value)) && field !== 'paint') {
      value = Number(value);
    }
    onChange({
      ...config,
      [field]: value
    });

    audioSystem.playUpgrade();
    
    // Unlock garage modification achievement
    unlockAchievement("garage_mod");
  };

  return (
    <div id="car-garage-container" className="flex flex-col lg:flex-row h-full min-h-[500px] w-full text-white bg-slate-950 font-sans">
      {/* Visual Workspace Canvas */}
      <div className="relative w-full lg:w-3/5 h-[350px] lg:h-full bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div ref={mountRef} className="w-full h-full" />
        <div className="absolute top-4 left-4 bg-slate-950/80 px-4 py-2 rounded-lg border border-cyan-500/30 backdrop-blur-sm pointer-events-none">
          <div className="text-xs text-cyan-400 font-mono tracking-widest uppercase">{t("garage_preview")}</div>
          <div className="text-lg font-bold font-sans">
            {config.bodyStyle === 'f1' ? `${t("body_f1")} (Formula Prototype)` : config.bodyStyle === 'muscle' ? `${t("body_muscle")} (Muscle Charger)` : `${t("body_coupe")} (Coupe GT)`}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 bg-slate-950/80 p-4 rounded-xl border border-slate-800 backdrop-blur-sm hidden sm:block pointer-events-none w-64">
          <div className="text-xs text-slate-400 font-mono mb-2">{t("garage_perf")}</div>
          
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span>{t("garage_max_speed")}</span>
              <span className="text-cyan-400 font-mono">{maxSpeed} km/h</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${(maxSpeed - 90) * 1.5}%` }}></div>
            </div>
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span>{t("garage_accel")}</span>
              <span className="text-pink-500 font-mono">{acceleration}/100</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-pink-500 h-1.5 rounded-full" style={{ width: `${acceleration}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>{t("garage_traction")}</span>
              <span className="text-yellow-400 font-mono">{tractionGrip}/100</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-yellow-400 h-1.5 rounded-full" style={{ width: `${tractionGrip}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Configuration Panel */}
      <div id="garage-custom-menu" className="w-full lg:w-2/5 p-6 overflow-y-auto bg-slate-950 flex flex-col justify-between border-t border-slate-900 lg:border-t-0">
        <div>
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-4 mb-6">
            <Wrench className="w-6 h-6 text-cyan-400" />
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wider text-cyan-400">{t("garageTitle")}</h1>
              <p className="text-xs text-slate-400">TUNE AND CUSTOMIZE YOUR 3D RACER</p>
            </div>
          </div>

          {/* 1. Body Style Selection */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase mb-3 text-cyan-400/80">{t("garage_body_style")}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'coupe', name: t("body_coupe"), desc: t("body_coupe_desc") },
                { id: 'muscle', name: t("body_muscle"), desc: t("body_muscle_desc") },
                { id: 'f1', name: t("body_f1"), desc: t("body_f1_desc") }
              ].map(opt => (
                <button
                  key={opt.id}
                  id={`body-style-${opt.id}`}
                  onClick={() => setField('bodyStyle', opt.id)}
                  className={`p-3 rounded-lg border text-left transition ${
                    config.bodyStyle === opt.id
                      ? 'bg-cyan-500/10 border-cyan-500 text-white shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="text-sm font-bold">{opt.name}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Color selection */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase text-cyan-400/80">{t("garage_paint")}</label>
              <Palette className="w-4 h-4 text-slate-400" />
            </div>
            {/* Custom Hex input */}
            <div className="flex items-center space-x-2 mb-3">
              <input
                type="color"
                value={config.paint}
                onChange={(e) => setField('paint', e.target.value)}
                className="w-10 h-10 border border-slate-700 rounded cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={config.paint.toUpperCase()}
                onChange={(e) => {
                  if (e.target.value.startsWith("#") && e.target.value.length <= 7) {
                    setField('paint', e.target.value);
                  }
                }}
                className="flex-1 bg-slate-900 text-slate-200 px-3 py-2 border border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            {/* Color Presets */}
            <div className="grid grid-cols-4 gap-2">
              {colorPresets.map(preset => (
                <button
                  key={preset.hex}
                  id={`preset-color-${preset.hex.replace("#", "")}`}
                  onClick={() => setField('paint', preset.hex)}
                  title={preset.name}
                  className="flex flex-col items-center p-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800/80 transition"
                >
                  <div
                    className="w-full h-8 rounded"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span className="text-[9px] text-slate-400 mt-1 overflow-hidden text-ellipsis whitespace-nowrap w-full text-center">
                    {preset.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Spoiler details */}
          <div className="mb-6">
            <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase mb-3 text-cyan-400/80">{t("garage_rear_spoiler")}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'none', name: t("garage_spoiler_none") },
                { id: 'sport', name: t("garage_spoiler_sport") },
                { id: 'super', name: t("garage_spoiler_super") }
              ].map(opt => (
                <button
                  key={opt.id}
                  id={`spoiler-opt-${opt.id}`}
                  onClick={() => setField('spoilerType', opt.id)}
                  className={`p-2.5 rounded-lg border text-sm text-center transition ${
                    config.spoilerType === opt.id
                      ? 'bg-cyan-500/10 border-cyan-500 text-white'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Tires Details */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase text-cyan-400/80">{t("garage_tires")}</label>
              <Disc className="w-4 h-4 text-slate-400" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'sport', name: t("garage_tire_sport"), desc: t("garage_tire_sport_desc") },
                { id: 'offroad', name: t("garage_tire_offroad"), desc: t("garage_tire_offroad_desc") },
                { id: 'retro', name: t("garage_tire_retro"), desc: t("garage_tire_retro_desc") }
              ].map(opt => (
                <button
                  key={opt.id}
                  id={`wheel-opt-${opt.id}`}
                  onClick={() => setField('wheelType', opt.id)}
                  className={`p-2 rounded-lg border text-left transition ${
                    config.wheelType === opt.id
                      ? 'bg-cyan-500/10 border-cyan-500 text-white'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.name}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 5. Performance upgrade increments */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-4 mb-6">
            <div className="flex items-center space-x-1">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-300">{t("garage_tuning")}</span>
            </div>

            {/* Engine level */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">{t("garage_engine_level")}</div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => config.engineLevel > 1 && setField('engineLevel', config.engineLevel - 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  -
                </button>
                <span className="font-mono text-cyan-400 w-4 text-center text-sm font-bold">{config.engineLevel}</span>
                <button
                  onClick={() => config.engineLevel < 5 && setField('engineLevel', config.engineLevel + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Grip level */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">{t("garage_grip_level")}</div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => config.gripLevel > 1 && setField('gripLevel', config.gripLevel - 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  -
                </button>
                <span className="font-mono text-cyan-400 w-4 text-center text-sm font-bold">{config.gripLevel}</span>
                <button
                  onClick={() => config.gripLevel < 5 && setField('gripLevel', config.gripLevel + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Weight tuning */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">{t("garage_weight_level")}</div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => config.weightLevel > 1 && setField('weightLevel', config.weightLevel - 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  -
                </button>
                <span className="font-mono text-cyan-400 w-4 text-center text-sm font-bold">{config.weightLevel}</span>
                <button
                  onClick={() => config.weightLevel < 5 && setField('weightLevel', config.weightLevel + 1)}
                  className="w-7 h-7 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            audioSystem.playClick("high");
            onConfirm();
          }}
          id="confirm-garage-btn"
          className="w-full mt-2 py-4 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold rounded-xl shadow-[0_4px_20px_rgba(6,182,212,0.4)] transition-all transform active:scale-95 text-center flex items-center justify-center space-x-2 uppercase text-sm tracking-widest cursor-pointer"
        >
          <span>{t("garage_confirm_btn")}</span>
        </button>
      </div>
    </div>
  );
}
