import * as THREE from "three";
import { CarConfig } from "../types";

export interface IntegratedCarModel {
  group: THREE.Group;
  wheelsFrontLeft: THREE.Group;
  wheelsFrontRight: THREE.Group;
  wheelsRearLeft: THREE.Group;
  wheelsRearRight: THREE.Group;
  bodyMesh: THREE.Mesh;
}

export function build3DCar(config?: Partial<CarConfig>): IntegratedCarModel {
  const group = new THREE.Group();

  const safeConfig = {
    paint: config?.paint || "#ff3366",
    wheelType: config?.wheelType || "sport",
    spoilerType: config?.spoilerType || "none",
    bodyStyle: config?.bodyStyle || "coupe",
    engineLevel: config?.engineLevel ?? 1,
    weightLevel: config?.weightLevel ?? 3,
    gripLevel: config?.gripLevel ?? 3,
  };

  // Primary Material (shiny car paint)
  const paintColor = new THREE.Color(safeConfig.paint);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: paintColor,
    roughness: 0.1,
    metalness: 0.8,
  });

  // Trim/Underbody Material (dark gray)
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.5,
  });

  // Windows Material
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x112233,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.7
  });

  // Wheel Material
  let wheelMatColor = 0x222222;
  let rimMatColor = 0x888888;
  if (safeConfig.wheelType === 'retro') {
    rimMatColor = 0xd4af37; // Gold
  } else if (safeConfig.wheelType === 'offroad') {
    wheelMatColor = 0x332211; // Muddy/Dark
    rimMatColor = 0x444444; // Industrial
  }
  
  const tireMat = new THREE.MeshStandardMaterial({
    color: wheelMatColor,
    roughness: 0.9
  });
  
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimMatColor,
    roughness: 0.2,
    metalness: 0.9
  });

  // --- CAR BODY GEOMETRIES ACCORDING TO BODYSTYLE ---
  let mainBodyGeo!: THREE.BufferGeometry;
  let cabinGeo!: THREE.BufferGeometry;
  let cabinOffset = new THREE.Vector3(0, 0.45, -0.2);
  let cabinScale = new THREE.Vector3(0.9, 0.4, 1.2);

  if (safeConfig.bodyStyle === 'f1') {
    // Formula 1: low profile, sleek center pod, side pods
    mainBodyGeo = new THREE.BoxGeometry(0.7, 0.25, 2.6);
    cabinGeo = new THREE.BoxGeometry(0.5, 0.35, 0.6);
    cabinScale.set(1, 1, 1);
    cabinOffset.set(0, 0.25, -0.1);
  } else if (safeConfig.bodyStyle === 'muscle') {
    // Muscle car: boxy, aggressive front
    mainBodyGeo = new THREE.BoxGeometry(1.2, 0.5, 2.3);
    cabinGeo = new THREE.BoxGeometry(1.1, 0.45, 1.1);
    cabinOffset.set(0, 0.47, -0.3);
  } else {
    // Coupe GT (default): classic sports car
    mainBodyGeo = new THREE.BoxGeometry(1.1, 0.4, 2.4);
    cabinGeo = new THREE.BoxGeometry(0.9, 0.4, 1.3);
    cabinOffset.set(0, 0.4, -0.2);
  }

  // 1. Core Chassis
  const bodyMesh = new THREE.Mesh(mainBodyGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Cockpit/Cabin
  const cabinMesh = new THREE.Mesh(cabinGeo, windowMat);
  cabinMesh.position.copy(cabinOffset);
  cabinMesh.scale.copy(cabinScale);
  cabinMesh.castShadow = true;
  group.add(cabinMesh);

  // 3. Nose wing or bumper trim
  if (safeConfig.bodyStyle === 'f1') {
    // F1 Front Wing plate
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.3), trimMat);
    frontWing.position.set(0, -0.08, 1.3);
    group.add(frontWing);

    // Front Wing Endplates
    const leftEndplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.4), bodyMat);
    leftEndplate.position.set(-0.8, 0, 1.3);
    const rightEndplate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.4), bodyMat);
    rightEndplate.position.set(0.8, 0, 1.3);
    group.add(leftEndplate, rightEndplate);
  } else {
    // Standard front bumper grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.1), trimMat);
    grille.position.set(0, -0.1, 1.18);
    group.add(grille);
  }

  // 4. Spoiler wing (尾翼)
  if (safeConfig.spoilerType !== 'none') {
    const spoilerHeight = safeConfig.spoilerType === 'super' ? 0.6 : 0.4;
    const spoilerWidth = safeConfig.spoilerType === 'super' ? 1.5 : 1.25;
    const spoilerDepth = safeConfig.spoilerType === 'super' ? 0.35 : 0.25;

    // Struts (supporting pillars)
    const strutLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, spoilerHeight, 0.08), trimMat);
    strutLeft.position.set(-0.35, spoilerHeight / 2, -1.0);
    const strutRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, spoilerHeight, 0.08), trimMat);
    strutRight.position.set(0.35, spoilerHeight / 2, -1.0);
    group.add(strutLeft, strutRight);

    // Main Wing Board
    const wingBoardMat = safeConfig.spoilerType === 'super' ? new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.9 }) : bodyMat;
    const wingBoard = new THREE.Mesh(new THREE.BoxGeometry(spoilerWidth, 0.05, spoilerDepth), wingBoardMat);
    wingBoard.position.set(0, spoilerHeight, -1.0);
    wingBoard.castShadow = true;
    group.add(wingBoard);

    // Endplates
    const endFinsGeo = new THREE.BoxGeometry(0.02, 0.2, spoilerDepth + 0.1);
    const endFinLeft = new THREE.Mesh(endFinsGeo, wingBoardMat);
    endFinLeft.position.set(-spoilerWidth / 2, spoilerHeight, -1.0);
    const endFinRight = new THREE.Mesh(endFinsGeo, wingBoardMat);
    endFinRight.position.set(spoilerWidth / 2, spoilerHeight, -1.0);
    group.add(endFinLeft, endFinRight);
  }

  // 5. Headlights
  const headlightGeo = new THREE.BoxGeometry(0.18, 0.08, 0.08);
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  
  const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  leftHeadlight.position.set(-0.4, 0.1, 1.15);
  const rightHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  rightHeadlight.position.set(0.4, 0.1, 1.15);
  group.add(leftHeadlight, rightHeadlight);

  // 6. Taillights (Red)
  const taillightGeo = new THREE.BoxGeometry(0.2, 0.06, 0.05);
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const leftTaillight = new THREE.Mesh(taillightGeo, taillightMat);
  leftTaillight.position.set(-0.4, 0.1, -1.18);
  const rightTaillight = new THREE.Mesh(taillightGeo, taillightMat);
  rightTaillight.position.set(0.4, 0.1, -1.18);
  group.add(leftTaillight, rightTaillight);

  // 7. Exhaust pipe
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), trimMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(-0.3, -0.18, -1.15);
  group.add(pipe);

  // --- WHEELS BUILDING SECTION (Separated pivot groups for Front steering) ---
  const wheelRadius = safeConfig.wheelType === 'offroad' ? 0.42 : 0.35;
  const wheelWidth = safeConfig.wheelType === 'offroad' ? 0.45 : 0.3;

  function createWheelMesh(): THREE.Group {
    const wheelGroup = new THREE.Group();
    // Tire cylinder
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim inner hub
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelWidth + 0.02, 12), rimMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    // Simple visual spokes
    const spokeGeo = new THREE.BoxGeometry(wheelRadius * 1.1, 0.02, wheelWidth + 0.03);
    const spoke1 = new THREE.Mesh(spokeGeo, rimMat);
    const spoke2 = new THREE.Mesh(spokeGeo, rimMat);
    spoke2.rotation.y = Math.PI / 2;
    const spoke3 = new THREE.Mesh(spokeGeo, rimMat);
    spoke3.rotation.y = Math.PI / 4;
    const spoke4 = new THREE.Mesh(spokeGeo, rimMat);
    spoke4.rotation.y = -Math.PI / 4;

    wheelGroup.add(spoke1, spoke2, spoke3, spoke4);
    return wheelGroup;
  }

  // Rear axle offset / Front axle offset
  const trackWidth = 0.62; // offset from center X
  const wheelbaseFront = 0.8; // front Z offset
  const wheelbaseRear = -0.8; // rear Z offset
  const wheelY = -0.15; // Y height

  // Front Left Steering Pivot
  const wlPivot = new THREE.Group();
  wlPivot.position.set(-trackWidth, wheelY, wheelbaseFront);
  const wlMesh = createWheelMesh();
  wlPivot.add(wlMesh);
  group.add(wlPivot);

  // Front Right Steering Pivot
  const wrPivot = new THREE.Group();
  wrPivot.position.set(trackWidth, wheelY, wheelbaseFront);
  const wrMesh = createWheelMesh();
  wrPivot.add(wrMesh);
  group.add(wrPivot);

  // Rear Left (rigid pivot)
  const rlPivot = new THREE.Group();
  rlPivot.position.set(-trackWidth, wheelY, wheelbaseRear);
  const rlMesh = createWheelMesh();
  rlPivot.add(rlMesh);
  group.add(rlPivot);

  // Rear Right (rigid pivot)
  const rrPivot = new THREE.Group();
  rrPivot.position.set(trackWidth, wheelY, wheelbaseRear);
  const rrMesh = createWheelMesh();
  rrPivot.add(rrMesh);
  group.add(rrPivot);

  return {
    group,
    wheelsFrontLeft: wlPivot,
    wheelsFrontRight: wrPivot,
    wheelsRearLeft: rlPivot,
    wheelsRearRight: rrPivot,
    bodyMesh
  };
}
