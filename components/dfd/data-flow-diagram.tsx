'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { DFD_LEVELS, type DfdLevel, type DfdNode } from '@/lib/dfd/graphs';
import styles from './data-flow-diagram.module.css';

type Particle = { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; phase: number; speed: number };
type NodeDimensions = { width: number; height: number; depth: number };

const NODE_COLORS: Record<string, { body: number; glow: number; border: number }> = {
  external: { body: 0x16314a, glow: 0x245d84, border: 0x6ca8dc },
  process: { body: 0x123a39, glow: 0x1f9b82, border: 0x69e6ca },
  store: { body: 0x2c2349, glow: 0x8865db, border: 0xbca4ff },
  system: { body: 0x173b47, glow: 0x42d9c1, border: 0x8cf5e4 },
};

function dimensionsFor(kind: string): NodeDimensions {
  if (kind === 'system') return { width: 2.75, height: 1.48, depth: 0.52 };
  if (kind === 'store') return { width: 2.28, height: 1.0, depth: 0.42 };
  if (kind === 'external') return { width: 2.0, height: 1.12, depth: 0.44 };
  return { width: 2.14, height: 1.12, depth: 0.46 };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function nodeLabelSprite(label: string, subtitle: string, width: number, height: number, tint: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(4, 11, 22, 0.36)';
  roundedRect(context, 8, 8, 624, 176, 26);
  context.fill();
  context.strokeStyle = tint;
  context.globalAlpha = 0.76;
  context.lineWidth = 3;
  context.stroke();
  context.globalAlpha = 1;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f3f7ff';
  context.font = '600 30px Inter, Arial, sans-serif';
  const maxLength = 27;
  let title = label;
  if (title.length > maxLength) title = title.slice(0, maxLength - 1) + '…';
  context.fillText(title, 320, 72, 590);
  context.fillStyle = '#a9bed7';
  context.font = '500 21px Inter, Arial, sans-serif';
  context.fillText(subtitle, 320, 128, 590);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width * 0.94, height * 0.78, 1);
  sprite.position.set(0, 0, height > 1.2 ? 0.31 : 0.28);
  sprite.renderOrder = 8;
  return sprite;
}

function flowLabelSprite(label: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(6, 13, 27, 0.93)';
  roundedRect(context, 4, 4, 504, 88, 24);
  context.fill();
  context.strokeStyle = 'rgba(118, 159, 196, 0.65)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = '#dceaff';
  context.font = '600 23px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  let text = label;
  if (text.length > 34) text = text.slice(0, 33) + '…';
  context.fillText(text, 256, 48, 472);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  const labelWidth = Math.min(2.2, Math.max(0.96, text.length * 0.047));
  sprite.scale.set(labelWidth, 0.22, 1);
  sprite.renderOrder = 7;
  return sprite;
}

function buildBackdrop(scene: THREE.Scene) {
  const positions: number[] = [];
  for (let x = -11; x <= 11; x += 1) {
    positions.push(x, -5.8, -2.1, x, 5.8, -2.1);
  }
  for (let y = -5; y <= 5; y += 1) {
    positions.push(-11, y, -2.1, 11, y, -2.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const grid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x1a2a41, transparent: true, opacity: 0.55 }));
  grid.renderOrder = -2;
  scene.add(grid);

  const starPositions: number[] = [];
  for (let index = 0; index < 105; index += 1) {
    const x = ((index * 37) % 219) / 10 - 10.9;
    const y = ((index * 61) % 113) / 10 - 5.6;
    starPositions.push(x, y, -1.8);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0x6b83a1, size: 0.035, transparent: true, opacity: 0.45 })));
}

function edgeCurve(from: DfdNode, to: DfdNode, bend: number, index: number): THREE.QuadraticBezierCurve3 {
  const startNodeDims = dimensionsFor(from.kind);
  const endNodeDims = dimensionsFor(to.kind);
  const delta = new THREE.Vector2(to.position[0] - from.position[0], to.position[1] - from.position[1]);
  const length = Math.max(0.001, delta.length());
  const direction = delta.clone().normalize();
  const sourceClip = Math.min(
    (startNodeDims.width * 0.48) / Math.max(Math.abs(direction.x), 0.15),
    (startNodeDims.height * 0.42) / Math.max(Math.abs(direction.y), 0.15),
  );
  const targetClip = Math.min(
    (endNodeDims.width * 0.48) / Math.max(Math.abs(direction.x), 0.15),
    (endNodeDims.height * 0.42) / Math.max(Math.abs(direction.y), 0.15),
  );
  const start = new THREE.Vector3(from.position[0] + direction.x * sourceClip, from.position[1] + direction.y * sourceClip, 0.43);
  const end = new THREE.Vector3(to.position[0] - direction.x * targetClip, to.position[1] - direction.y * targetClip, 0.43);
  const perpendicular = new THREE.Vector2(-direction.y, direction.x);
  const offset = bend || (index % 2 === 0 ? 0.22 : -0.22);
  const control = new THREE.Vector3(
    (start.x + end.x) / 2 + perpendicular.x * offset,
    (start.y + end.y) / 2 + perpendicular.y * offset,
    0.5 + ((index % 3) - 1) * 0.07,
  );
  if (length < sourceClip + targetClip + 0.25) control.z += 0.12;
  return new THREE.QuadraticBezierCurve3(start, control, end);
}

export function DataFlowDiagram() {
  const [level, setLevel] = useState<DfdLevel>(0);
  const [selectedId, setSelectedId] = useState<string>('platform');
  const [sceneError, setSceneError] = useState(false);
  const selectedIdRef = useRef<string>(selectedId);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const graph = DFD_LEVELS[level];
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];

  const relatedFlows = useMemo(() => graph.edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id), [graph, selectedNode.id]);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    for (const [nodeId, group] of nodeGroupsRef.current) {
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.nodeId !== nodeId) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = nodeId === selectedId ? 0.55 : 0.16;
        }
      });
    }
  }, [selectedId]);

  useEffect(() => {
    if (!mountRef.current) return;
    setSceneError(false);
    const mount = mountRef.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setSceneError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x07101d, 1);
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07101d);
    scene.fog = new THREE.FogExp2(0x07101d, 0.008);
    const camera = new THREE.OrthographicCamera(-10, 10, 6.2, -6.2, 0.1, 80);
    camera.position.set(0, 1.3, 26);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.zoomSpeed = 0.7;
    controls.minZoom = 0.72;
    controls.maxZoom = 1.55;
    controlsRef.current = controls;
    controls.saveState();

    scene.add(new THREE.AmbientLight(0xa9c8eb, 1.8));
    const keyLight = new THREE.PointLight(0x73f4d9, 95, 28);
    keyLight.position.set(-5, 6, 10);
    scene.add(keyLight);
    const violetLight = new THREE.PointLight(0x8b72ff, 65, 24);
    violetLight.position.set(7, -4, 8);
    scene.add(violetLight);
    buildBackdrop(scene);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pickTargets: THREE.Object3D[] = [];
    const particles: Particle[] = [];
    const nodeGroups = new Map<string, THREE.Group>();
    const currentNodes = new Map(graph.nodes.map((node) => [node.id, node]));

    for (const edge of graph.edges) {
      const from = currentNodes.get(edge.from);
      const to = currentNodes.get(edge.to);
      if (!from || !to) continue;
      const curve = edgeCurve(from, to, edge.bend ?? 0, particles.length);
      const color = edge.from === 'ai' ? 0xb49cff : 0x57dfcd;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.018, 5, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.67 }),
      );
      tube.renderOrder = 2;
      scene.add(tube);

      const tangent = curve.getTangentAt(0.985).normalize();
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.105, 0.24, 9),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
      );
      arrow.position.copy(curve.getPointAt(0.98)).addScaledVector(tangent, -0.08);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      arrow.renderOrder = 3;
      scene.add(arrow);

      const label = flowLabelSprite(edge.label);
      const mid = curve.getPointAt(0.5);
      const chord = new THREE.Vector2(to.position[0] - from.position[0], to.position[1] - from.position[1]).normalize();
      label.position.set(mid.x - chord.y * 0.22, mid.y + chord.x * 0.22, 0.82);
      scene.add(label);

      const particleMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98 });
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), particleMaterial);
      scene.add(particle);
      particles.push({ mesh: particle, curve, phase: (particles.length * 0.137) % 1, speed: 0.055 + (particles.length % 4) * 0.009 });
    }

    for (const node of graph.nodes) {
      const dims = dimensionsFor(node.kind);
      const group = new THREE.Group();
      group.position.set(node.position[0], node.position[1], node.position[2]);
      const colors = NODE_COLORS[node.kind];
      const material = new THREE.MeshStandardMaterial({
        color: colors.body,
        roughness: 0.28,
        metalness: 0.24,
        emissive: colors.glow,
        emissiveIntensity: node.id === selectedIdRef.current ? 0.55 : 0.16,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, dims.depth), material);
      body.userData.nodeId = node.id;
      body.castShadow = false;
      body.receiveShadow = false;
      group.add(body);
      pickTargets.push(body);

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(dims.width, dims.height, dims.depth)),
        new THREE.LineBasicMaterial({ color: colors.border, transparent: true, opacity: 0.82 }),
      );
      outline.position.z = 0.006;
      group.add(outline);

      if (node.kind === 'store') {
        for (const y of [-0.33, 0.33]) {
          const points = [
            new THREE.Vector3(-dims.width * 0.43, y, dims.depth / 2 + 0.012),
            new THREE.Vector3(dims.width * 0.43, y, dims.depth / 2 + 0.012),
          ];
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
          group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: colors.border, transparent: true, opacity: 0.8 })));
        }
      }
      const title = nodeLabelSprite(node.label, node.subtitle, dims.width, dims.height, '#' + colors.border.toString(16).padStart(6, '0'));
      group.add(title);
      group.userData.nodeId = node.id;
      scene.add(group);
      nodeGroups.set(node.id, group);
    }
    nodeGroupsRef.current = nodeGroups;

    const resize = () => {
      const width = Math.max(920, mount.clientWidth || 920);
      const height = Math.max(440, mount.clientHeight || 570);
      renderer.setSize(width, height, false);
      const worldHeight = 11.7;
      const worldWidth = worldHeight * width / height;
      camera.left = -worldWidth / 2;
      camera.right = worldWidth / 2;
      camera.top = worldHeight / 2;
      camera.bottom = -worldHeight / 2;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const onClick = (event: MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(pickTargets, false)[0];
      if (hit?.object.userData.nodeId) setSelectedId(String(hit.object.userData.nodeId));
    };
    const onPointerMove = (event: MouseEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      renderer.domElement.style.cursor = raycaster.intersectObjects(pickTargets, false).length ? 'pointer' : 'grab';
    };
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onPointerMove);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      controls.update();
      const elapsed = clock.getElapsedTime();
      for (const item of particles) {
        const t = (elapsed * item.speed + item.phase) % 1;
        item.mesh.position.copy(item.curve.getPointAt(t));
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      controls.dispose();
      controlsRef.current = null;
      nodeGroupsRef.current.clear();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
        }
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line || object instanceof THREE.Points) {
          const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            const mappedMaterial = material as THREE.Material & { map?: THREE.Texture | null };
            if (mappedMaterial.map) mappedMaterial.map.dispose();
            material.dispose();
          }
        }
      });
      renderer.dispose();
      mount.replaceChildren();
    };
  }, [graph]);

  const selectLevel = (next: DfdLevel) => {
    setLevel(next);
    const nextGraph = DFD_LEVELS[next];
    setSelectedId(nextGraph.nodes.find((node) => node.kind === 'system' || node.kind === 'process')?.id ?? nextGraph.nodes[0].id);
  };

  const resetView = () => controlsRef.current?.reset();
  const zoomBy = (amount: number) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object as THREE.OrthographicCamera;
    camera.zoom = Math.max(0.72, Math.min(1.55, camera.zoom + amount));
    camera.updateProjectionMatrix();
    controls.update();
  };

  return (
    <div className={styles.visualization}>
      <div className={styles.levelToolbar} aria-label="Data flow diagram level">
        <div className={styles.levelOptions}>
          {([0, 1, 2] as const).map((item) => (
            <button key={item} type="button" className={level === item ? styles.levelActive : styles.levelButton} onClick={() => selectLevel(item)} aria-pressed={level === item}>
              <span className={styles.levelIndex}>L{item}</span>
              <span>{item === 0 ? 'Context' : item === 1 ? 'System flows' : 'Scan detail'}</span>
            </button>
          ))}
        </div>
        <div className={styles.canvasActions}>
          <span className={styles.viewHint}><Box size={14} /> Drag to orbit · scroll to zoom</span>
          <button type="button" className={styles.toolButton} onClick={resetView} title="Reset 3D camera"><RotateCcw size={15} /> Reset view</button>
          <button type="button" className={styles.toolButton} onClick={() => zoomBy(0.12)} title="Zoom in"><ZoomIn size={15} /></button>
          <button type="button" className={styles.toolButton} onClick={() => zoomBy(-0.12)} title="Zoom out"><ZoomOut size={15} /></button>
        </div>
      </div>

      <div className={styles.diagramScroller}>
        <div className={styles.sceneCanvas} ref={mountRef} aria-label={'Interactive 3D data-flow diagram, level ' + level} role="img" />
      </div>
      {sceneError ? (
        <div className={styles.webglFallback} role="status">
          <strong>3D rendering is unavailable in this browser.</strong>
          <span>The same level remains available as a text-based flow list below.</span>
          <div>{graph.nodes.map((node) => <span key={node.id}>{node.label}</span>)}</div>
        </div>
      ) : null}

      <div className={styles.legend} aria-label="DFD notation legend">
        <span><i className={styles.legendExternal} /> External entity</span>
        <span><i className={styles.legendProcess} /> Process</span>
        <span><i className={styles.legendStore} /> Data store</span>
        <span><i className={styles.legendSystem} /> System boundary</span>
        <span><i className={styles.legendFlow} /> Directional data flow</span>
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.selectedPanel} aria-live="polite">
          <div className={styles.detailKicker}>Selected element · Level {level}</div>
          <h3>{selectedNode.label}</h3>
          <p>{selectedNode.detail}</p>
          <div className={styles.selectedTag}>{selectedNode.subtitle}</div>
        </section>
        <section className={styles.flowPanel}>
          <div className={styles.flowPanelHead}>
            <div><div className={styles.detailKicker}>Connected data flows</div><h3>{relatedFlows.length} flows</h3></div>
          </div>
          {relatedFlows.length ? (
            <div className={styles.flowList}>
              {relatedFlows.map((edge, index) => {
                const outgoing = edge.from === selectedNode.id;
                const otherId = outgoing ? edge.to : edge.from;
                const other = nodeMap.get(otherId);
                return (
                  <div className={styles.flowRow} key={edge.from + ':' + edge.to + ':' + index}>
                    <span className={outgoing ? styles.flowOut : styles.flowIn}>{outgoing ? 'OUT' : 'IN'}</span>
                    <div><strong>{edge.label}</strong><small>{outgoing ? 'To ' : 'From '}{other?.label ?? otherId}</small></div>
                  </div>
                );
              })}
            </div>
          ) : <p className={styles.emptyFlows}>No connections are defined for this element.</p>}
        </section>
      </div>
    </div>
  );
}