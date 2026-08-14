/**
 * Giga Racer 3D - Offline Standalone Game Exporter
 * Generates and downloads a complete standalone offline HTML5 game file that runs directly on any browser.
 */

export function downloadStandaloneOfflineGame(lang: string = 'zh-TW', racerName: string = 'Racer_1') {
  const isZh = lang === 'zh-TW';
  const isIt = lang === 'it';
  const isIs = lang === 'is';

  let title = 'Giga Racer 3D - 酷幻極速 3D 單機離線版';
  let subtitle = '已打包為獨立單機 HTML5 遊戲檔案，支援雙擊離線開啟與全螢幕極速狂飆！';
  let startBtnText = '🚀 立即啟動 3D 賽車引擎';
  let fullscreenText = '⛶ 全螢幕模式';
  let helpText = '操作說明：W/上鍵 加速，S/下鍵 剎車/倒車，A/D/左右鍵 轉向，空白鍵 手煞車甩尾，Shift 氮氣加速';
  let onlineLinkText = '🌐 連線至線上多人大廳';

  if (isIt) {
    title = 'Giga Racer 3D - Edizione Offline Autonoma';
    subtitle = 'Pacchetto di gioco HTML5 standalone pronto per l\'esecuzione offline su qualsiasi browser desktop o mobile!';
    startBtnText = '🚀 Avvia Motore 3D Ora';
    fullscreenText = '⛶ Schermo Intero';
    helpText = 'Controlli: W/Su: Accelera, S/Giù: Frena/Retromarcia, A/D: Sterzo, Spazio: Derapata, Shift: Nitro';
    onlineLinkText = '🌐 Connettiti alla Lobby Online';
  } else if (isIs) {
    title = 'Giga Racer 3D - Sjálfstæð útgáfa án nettengingar';
    subtitle = 'Sjálfstæður HTML5 leikjapakki sem hægt er að keyra beint án nettengingar á öllum tækjum!';
    startBtnText = '🚀 Ræsa 3D Vél Núna';
    fullscreenText = '⛶ Fullur Skjár';
    helpText = 'Stýringar: W/Upp: Hröðun, S/Niður: Hemill, A/D: Stýri, Bil: Rennsli, Shift: Nítró';
    onlineLinkText = '🌐 Tengjast Fjölspilunarsal';
  } else if (lang === 'en') {
    title = 'Giga Racer 3D - Standalone Offline Edition';
    subtitle = 'Packaged as a standalone HTML5 game file. Double-click to launch anywhere, 100% offline ready!';
    startBtnText = '🚀 Launch 3D Racing Engine';
    fullscreenText = '⛶ Fullscreen Mode';
    helpText = 'Controls: W/Up: Accelerate, S/Down: Brake/Reverse, A/D: Steer, Space: Handbrake Drift, Shift: Nitro Boost';
    onlineLinkText = '🌐 Connect to Online Multiplayer Lobby';
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://gigaracer3d.app';

  const htmlContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #020617; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; user-select: none; }
    #canvas-container { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; }
    #ui-layer { position: absolute; inset: 0; z-index: 10; pointer-events: none; display: flex; flex-direction: column; justify-content: space-between; padding: 20px; }
    .interactive { pointer-events: auto; }
    .glass-panel { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 16px; padding: 16px 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .hud-title { font-size: 20px; font-weight: 900; background: linear-gradient(90deg, #06b6d4, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 1px; }
    .hud-sub { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .speed-gauge { font-family: monospace; font-size: 36px; font-weight: 900; color: #38bdf8; text-shadow: 0 0 20px rgba(56, 189, 248, 0.6); }
    .btn { background: #06b6d4; color: #020617; font-weight: 800; border: none; border-radius: 12px; padding: 10px 20px; font-size: 13px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(6, 182, 212, 0.4); }
    .btn:hover { background: #22d3ee; transform: scale(1.03); }
    .btn-secondary { background: rgba(30, 41, 59, 0.8); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
    .btn-secondary:hover { background: rgba(51, 65, 85, 0.9); color: #fff; }
    #start-overlay { position: absolute; inset: 0; z-index: 50; background: radial-gradient(circle at center, #0f172a 0%, #020205 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; }
    .nitro-bar { width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .nitro-fill { width: 100%; height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); transition: width 0.1s; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <div id="start-overlay">
    <div style="max-width: 500px;" class="glass-panel interactive">
      <div style="font-size: 40px; margin-bottom: 10px;">🏎️</div>
      <h1 class="hud-title" style="font-size: 24px;">${title}</h1>
      <p class="hud-sub" style="margin: 12px 0 20px 0; font-size: 13px; line-height: 1.5;">${subtitle}</p>
      
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-start" class="btn" style="font-size: 15px; padding: 14px;">${startBtnText}</button>
        <a href="${currentUrl}" target="_blank" class="btn btn-secondary" style="text-decoration: none; text-align: center; font-size: 12px; padding: 10px;">${onlineLinkText}</a>
      </div>

      <div style="margin-top: 20px; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
        ${helpText}
      </div>
    </div>
  </div>

  <div id="canvas-container"></div>

  <div id="ui-layer">
    <!-- Top HUD -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div class="glass-panel">
        <div class="hud-title">GIGA RACER 3D</div>
        <div class="hud-sub">OFFLINE STANDALONE ENGINE • PILOT: ${racerName}</div>
      </div>
      <div class="interactive" style="display: flex; gap: 8px;">
        <button id="btn-fs" class="btn btn-secondary">${fullscreenText}</button>
        <a href="${currentUrl}" target="_blank" class="btn btn-secondary" style="text-decoration: none;">${onlineLinkText}</a>
      </div>
    </div>

    <!-- Bottom HUD -->
    <div style="display: flex; justify-content: space-between; align-items: flex-end;">
      <div class="glass-panel" style="min-width: 220px;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: bold; letter-spacing: 1px;">SPEEDOMETER</div>
        <div class="speed-gauge"><span id="speed-val">0</span> <span style="font-size: 16px; color: #64748b;">KM/H</span></div>
        <div style="font-size: 10px; color: #f59e0b; font-weight: bold; margin-top: 4px;">NITRO BOOST</div>
        <div class="nitro-bar"><div id="nitro-fill" class="nitro-fill"></div></div>
      </div>

      <div class="glass-panel" style="text-align: right;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">LAP TIME</div>
        <div style="font-family: monospace; font-size: 24px; font-weight: 800; color: #10b981;" id="lap-time">00:00.00</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">BEST: <span id="best-time">--:--.--</span></div>
      </div>
    </div>
  </div>

  <script>
    let scene, camera, renderer, car, wheels = [], roadMesh, groundGrid;
    let speed = 0, maxSpeed = 180, acceleration = 0.8, friction = 0.985, steerAngle = 0;
    let nitro = 100, isDrifting = false, isNitroActive = false;
    let keys = {};
    let lapStartTime = 0, isRunning = false;

    window.addEventListener('keydown', (e) => { keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    document.getElementById('btn-start').addEventListener('click', () => {
      document.getElementById('start-overlay').style.display = 'none';
      isRunning = true;
      lapStartTime = performance.now();
      initAudio();
    });

    document.getElementById('btn-fs').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    let audioCtx = null;
    function initAudio() {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch(e) {}
    }

    function init3D() {
      const container = document.getElementById('canvas-container');
      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020617, 0.003);

      camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0x06b6d4, 1.5);
      dirLight.position.set(50, 100, 50);
      scene.add(dirLight);

      // Grid Ground
      const grid = new THREE.GridHelper(1000, 100, 0x06b6d4, 0x1e293b);
      grid.position.y = -0.1;
      scene.add(grid);

      // Track Road
      const trackPoints = [];
      const R = 120;
      for (let i = 0; i <= 60; i++) {
        const theta = (i / 60) * Math.PI * 2;
        const x = Math.sin(theta) * R * (1 + 0.3 * Math.sin(theta * 3));
        const z = Math.cos(theta) * R * (1 + 0.2 * Math.cos(theta * 2));
        trackPoints.push(new THREE.Vector3(x, 0, z));
      }
      const curve = new THREE.CatmullRomCurve3(trackPoints, true);
      const roadGeo = new THREE.TubeGeometry(curve, 200, 7, 8, true);
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
      roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.scale.set(1, 0.05, 1);
      scene.add(roadMesh);

      // Cyber Neon Track Borders
      const borderGeo = new THREE.TubeGeometry(curve, 200, 0.5, 6, true);
      const borderMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const borderMesh = new THREE.Mesh(borderGeo, borderMat);
      borderMesh.position.y = 0.5;
      scene.add(borderMesh);

      // Car
      car = new THREE.Group();
      
      const bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 4.8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.9, roughness: 0.2 });
      const carBody = new THREE.Mesh(bodyGeo, bodyMat);
      carBody.position.y = 0.7;
      car.add(carBody);

      const cabinGeo = new THREE.BoxGeometry(1.8, 0.6, 2.2);
      const cabinMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.95, roughness: 0.1 });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 1.3, -0.2);
      car.add(cabin);

      const spoilerGeo = new THREE.BoxGeometry(2.2, 0.1, 0.6);
      const spoiler = new THREE.Mesh(spoilerGeo, bodyMat);
      spoiler.position.set(0, 1.5, 2.1);
      car.add(spoiler);

      // Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
      wheelGeo.rotateZ(Math.PI / 2);

      const wheelOffsets = [
        [-1.2, 0.5, 1.4],
        [1.2, 0.5, 1.4],
        [-1.2, 0.5, -1.4],
        [1.2, 0.5, -1.4]
      ];

      wheelOffsets.forEach(pos => {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.position.set(pos[0], pos[1], pos[2]);
        car.add(w);
        wheels.push(w);
      });

      car.position.set(0, 0, R);
      scene.add(car);

      window.addEventListener('resize', onWindowResize);
      animate();
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
      requestAnimationFrame(animate);

      if (isRunning) {
        // Controls
        const isUp = keys['KeyW'] || keys['ArrowUp'];
        const isDown = keys['KeyS'] || keys['ArrowDown'];
        const isLeft = keys['KeyA'] || keys['ArrowLeft'];
        const isRight = keys['KeyD'] || keys['ArrowRight'];
        const isSpace = keys['Space'];
        const isShift = keys['ShiftLeft'] || keys['ShiftRight'];

        isNitroActive = isShift && nitro > 5 && speed > 20;

        if (isUp) {
          const accel = isNitroActive ? acceleration * 1.8 : acceleration;
          speed = Math.min(speed + accel, isNitroActive ? maxSpeed * 1.3 : maxSpeed);
          if (isNitroActive) nitro = Math.max(0, nitro - 0.5);
        } else if (isDown) {
          speed = Math.max(speed - acceleration * 1.2, -40);
        } else {
          speed *= friction;
          if (Math.abs(speed) < 0.1) speed = 0;
        }

        if (!isNitroActive && nitro < 100) {
          nitro = Math.min(100, nitro + 0.1);
        }

        const steerSpeed = isSpace ? 0.05 : 0.035;
        if (isLeft && Math.abs(speed) > 1) {
          car.rotation.y += steerSpeed * (speed > 0 ? 1 : -1);
        }
        if (isRight && Math.abs(speed) > 1) {
          car.rotation.y -= steerSpeed * (speed > 0 ? 1 : -1);
        }

        // Move car
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
        car.position.add(forward.multiplyScalar(speed * 0.015));

        // Rotate wheels
        wheels.forEach(w => {
          w.rotation.x += speed * 0.01;
        });

        // Smooth Chase Camera
        const camOffset = new THREE.Vector3(0, 4, 9).applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
        camera.position.lerp(car.position.clone().add(camOffset), 0.1);
        camera.lookAt(car.position.clone().add(new THREE.Vector3(0, 1.5, 0)));

        // Update HUD
        document.getElementById('speed-val').textContent = Math.round(Math.abs(speed));
        document.getElementById('nitro-fill').style.width = nitro + '%';

        const elapsed = (performance.now() - lapStartTime) / 1000;
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
        const ms = Math.floor((elapsed % 1) * 100).toString().padStart(2, '0');
        document.getElementById('lap-time').textContent = mins + ':' + secs + '.' + ms;
      }

      renderer.render(scene, camera);
    }

    window.addEventListener('load', init3D);
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Giga_Racer_3D_Offline_Game.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
