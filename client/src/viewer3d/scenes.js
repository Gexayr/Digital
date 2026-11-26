// 3D product scenes for the live viewer on product pages (same scenes as the
// product cover renders). Each builder fills `ctx` with { scene, camera, target, style }.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const W = 720, H = 960;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise2(seed) {
  const r = rng(seed);
  const P = new Uint8Array(512);
  const p = [...Array(256).keys()].sort(() => r() - 0.5);
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const G = [...Array(256)].map(() => { const a = r() * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; });
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (ix, iy, x, y) => { const gr = G[P[P[ix & 255] + (iy & 255)]]; return gr[0] * (x - ix) + gr[1] * (y - iy); };
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = fade(x - x0), sy = fade(y - y0);
    const n0 = dot(x0, y0, x, y) * (1 - sx) + dot(x0 + 1, y0, x, y) * sx;
    const n1 = dot(x0, y0 + 1, x, y) * (1 - sx) + dot(x0 + 1, y0 + 1, x, y) * sx;
    return n0 * (1 - sy) + n1 * sy;
  };
}
function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2; }
  return s;
}

// ctx = { renderer, style } -> setup() adds scene, camera, target, exposure
function setup(ctx, { bg, bg2, ortho = false, fov = 35, env = true, exposure = 1 }) {
  const { renderer } = ctx;
  ctx.style.background = bg2 ? `linear-gradient(180deg, ${bg}, ${bg2})` : bg;
  ctx.exposure = exposure;
  const scene = new THREE.Scene();
  if (env) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    pm.dispose();
  }
  const camera = ortho
    ? new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 5000)
    : new THREE.PerspectiveCamera(fov, W / H, 0.1, 500);
  const lookAt = camera.lookAt.bind(camera);
  camera.lookAt = (x, y, z) => { ctx.target = new THREE.Vector3(x, y, z); lookAt(x, y, z); };
  Object.assign(ctx, { scene, camera, ortho, target: new THREE.Vector3() });
  return { renderer, scene, camera, render: () => {} };
}

function sun(scene, pos = [6, 10, 6], intensity = 2.6, size = 14, color = 0xffffff) {
  const d = new THREE.DirectionalLight(color, intensity);
  d.position.set(...pos);
  d.castShadow = true;
  d.shadow.mapSize.set(2048, 2048);
  Object.assign(d.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 80 });
  d.shadow.bias = -0.0004;
  d.shadow.radius = 6;
  scene.add(d);
  return d;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o });
const add = (scene, geo, m, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos); mesh.rotation.set(...rot);
  typeof scale === 'number' ? mesh.scale.setScalar(scale) : mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};
const shadowFloor = (scene, y = 0, opacity = 0.25, size = 60) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m);
};

// ---------------- p7 Terra: low-poly environment kit ----------------
function terra(stage, v) {
  const P = [
    { bg: '#bfe6f5', bg2: '#f3f7e8', grass: 0x8cc06b, grass2: 0x6aa154, rock: 0x9a9a92, tree: 0x3f8a4f, water: 0x4fb3d9, snow: false },
    { bg: '#ffb88a', bg2: '#ffe2b8', grass: 0xc9a25a, grass2: 0xa77e3e, rock: 0x8a6a58, tree: 0xd06a2f, water: 0x5f88c9, snow: false },
    { bg: '#cfe0f2', bg2: '#f4f8fc', grass: 0xf2f5f8, grass2: 0xd9e3ea, rock: 0x7f8a96, tree: 0x2f5f55, water: 0x7fb8d6, snow: true },
    { bg: '#1d2b4f', bg2: '#4a5a8a', grass: 0x4d7a5a, grass2: 0x3a5f47, rock: 0x6b6f80, tree: 0x24493a, water: 0x3a6fb0, snow: false },
  ][v];
  const { scene, camera, render } = setup(stage, { bg: P.bg, bg2: P.bg2, exposure: v === 3 ? 0.8 : 1.05 });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, v === 3 ? 0.7 : 1.3));
  sun(scene, v === 1 ? [-8, 5, 6] : [6, 12, 5], v === 3 ? 1.2 : 2.6, 10, v === 1 ? 0xffc690 : v === 3 ? 0xaac4ff : 0xffffff);
  const n = noise2(21 + v), r = rng(5 + v);
  const geo = new THREE.CylinderGeometry(6, 6.3, 1.4, 48, 1);
  add(scene, geo, mat(0x6b4a35, { flatShading: true }), [0, -0.7, 0]);
  const top = new THREE.CircleGeometry(6, 48, 0, Math.PI * 2);
  const plane = new THREE.PlaneGeometry(12, 12, 36, 36);
  const pos = plane.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const d = Math.hypot(x, y);
    let h = d > 5.9 ? 0 : Math.max(0, fbm(n, x / 4, y / 4) * 3.2 + 0.4) * Math.min(1, (6 - d) / 1.5);
    if (x > 1 && y < -0.5 && x < 4.5 && y > -4) h = Math.min(h, 0.05);
    pos.setZ(i, h);
    const c = new THREE.Color(h > 1.6 ? (P.snow ? 0xffffff : P.rock) : r() > 0.5 ? P.grass : P.grass2);
    colors.push(c.r, c.g, c.b);
  }
  plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ng = plane.toNonIndexed(); ng.computeVertexNormals();
  const land = add(scene, ng, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
  // clip to the round base: hide outer area with a mask ring
  land.material.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('void main() {', 'void main() {\nif (length(vW.xz) > 6.0) discard;');
  };
  add(scene, new THREE.CircleGeometry(1.9, 24), mat(P.water, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }), [2.8, 0.12, 2.2], [-Math.PI / 2, 0, 0]);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 1 + r() * 4.6;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x - 2.8, z - 2.2) < 2.2) continue;
    const s = 0.6 + r() * 0.6;
    if (r() > 0.25) {
      add(scene, new THREE.CylinderGeometry(0.08, 0.1, 0.5, 5), mat(0x6b4a35, { flatShading: true }), [x, 0.4 * s, z], [0, 0, 0], s);
      add(scene, new THREE.ConeGeometry(0.45, 1.1, 6), mat(P.snow && r() > 0.4 ? 0xe9f1f5 : P.tree, { flatShading: true }), [x, 1.05 * s, z], [0, r(), 0], s);
      add(scene, new THREE.ConeGeometry(0.35, 0.8, 6), mat(P.tree, { flatShading: true }), [x, 1.5 * s, z], [0, r(), 0], s);
    } else {
      add(scene, new THREE.IcosahedronGeometry(0.4, 0), mat(P.rock, { flatShading: true }), [x, 0.25, z], [r(), r(), r()], [s, s * 0.7, s]);
    }
  }
  if (v === 3) for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffc46b, 3, 3); l.position.set((r() - 0.5) * 7, 0.6, (r() - 0.5) * 7); scene.add(l);
    add(scene, new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), [l.position.x, 0.6, l.position.z]);
  }
  const ang = [0.6, 2.2, -0.9, 1.4][v], dist = 29;
  camera.position.set(Math.cos(ang) * dist, [14, 11, 16, 13][v], Math.sin(ang) * dist);
  camera.lookAt(0, 3.2, 0);
  camera.fov = 30; camera.updateProjectionMatrix();
  render();
}

// ---------------- p33 Clay characters ----------------
function clay(stage, v) {
  const P = [
    { bg: '#ffd9cf', bg2: '#ffeee6', cols: [0xff7a59, 0x5bc0be, 0xffc145, 0x9b8cff] },
    { bg: '#cfe8ff', bg2: '#eef6ff', cols: [0x4d96ff, 0xff6b9a, 0x6bcb77, 0xffd93d] },
    { bg: '#e7ffd9', bg2: '#f6fff0', cols: [0x6bcb77, 0xff8fab, 0x7aa2ff, 0xffb347] },
    { bg: '#2b2340', bg2: '#4b3d6e', cols: [0xff9f68, 0x7ee8fa, 0xf9f871, 0xc77dff] },
  ][v];
  const { scene, camera, render } = setup(stage, { bg: P.bg, bg2: P.bg2, exposure: 1.1 });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 1.4));
  sun(scene, [4, 9, 7], 2.2, 8);
  shadowFloor(scene, 0, 0.18);
  const clayM = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.6, sheen: 0.4 });
  const white = mat(0xffffff, { roughness: 0.3 }), black = mat(0x1a1a1a, { roughness: 0.2 });
  const figure = (x, z, c, h, ry, kind) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const body = kind === 1 ? new THREE.SphereGeometry(0.9, 48, 32) : new THREE.CapsuleGeometry(0.7, h, 16, 48);
    const b = new THREE.Mesh(body, clayM(c)); b.position.y = kind === 1 ? 0.9 : h / 2 + 0.7; b.castShadow = b.receiveShadow = true; g.add(b);
    const ey = kind === 1 ? 1.05 : h + 0.55;
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), white); e.position.set(s * 0.26, ey, 0.62); e.scale.z = 0.6; g.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), black); p.position.set(s * 0.26, ey, 0.75); g.add(p);
      if (kind !== 1) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 8, 16), clayM(c)); arm.position.set(s * 0.82, h * 0.45 + 0.5, 0.05); arm.rotation.z = s * 0.5; arm.castShadow = true; g.add(arm); }
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 24, Math.PI), black); mouth.position.set(0, ey - 0.3, 0.66); mouth.rotation.z = Math.PI; g.add(mouth);
    if (kind === 2) { const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 32), clayM(P.cols[(P.cols.indexOf(c) + 2) % 4])); hat.position.y = h + 1.65; hat.castShadow = true; g.add(hat); }
    if (kind === 3) for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), clayM(c)); ear.position.set(s * 0.5, h + 1.25, 0); ear.castShadow = true; g.add(ear); }
  };
  if (v === 1) { figure(0, 0, P.cols[0], 1.4, 0.2, 2); camera.position.set(1.5, 2.6, 7); camera.lookAt(0, 1.4, 0); }
  else {
    figure(-1.9, 0.2, P.cols[0], 1.2, 0.35, (v + 0) % 4);
    figure(0, -0.5, P.cols[1], 1.9, 0, (v + 2) % 4 || 2);
    figure(1.9, 0.3, P.cols[2], 0.9, -0.35, (v + 3) % 4);
    figure(0.7, 1.9, P.cols[3], 0, -0.1, 1);
    camera.position.set(0, 4.6, 14.5); camera.lookAt(0, 1.2, 0);
  }
  render();
}

// ---------------- p34 Glass & chrome abstract shapes ----------------
function shapes(stage, v) {
  const P = [
    { bg: '#e9e4ff', bg2: '#fbe3f0', cols: [0x7b61ff, 0xff7ac6, 0x58d5ff] },
    { bg: '#0d0f1a', bg2: '#23264a', cols: [0xff4ecd, 0x4ef0ff, 0xffd24e] },
    { bg: '#fff1e0', bg2: '#ffd8c2', cols: [0xff6a3d, 0xffb800, 0x1fb6a6] },
    { bg: '#dff7ef', bg2: '#f5fffb', cols: [0x00b38a, 0x3b5bfd, 0xff8a5b] },
  ][v];
  const { scene, camera, render } = setup(stage, { bg: P.bg, bg2: P.bg2, exposure: 1.1 });
  scene.environmentIntensity = 1.2;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666688, 0.8));
  sun(scene, [3, 8, 6], 1.8, 6);
  shadowFloor(scene, -2.2, 0.15);
  const glossy = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08 });
  const r = rng(90 + v);
  const layouts = [
    () => { add(scene, new THREE.TorusKnotGeometry(1.1, 0.38, 220, 40), glossy(P.cols[0]), [0, 0.6, 0], [0.4, 0.3, 0]); add(scene, new THREE.SphereGeometry(0.7, 64, 48), chrome, [-1.8, -1.5, 0.8]); add(scene, new RoundedBoxGeometry(1.1, 1.1, 1.1, 6, 0.25), glossy(P.cols[1]), [1.8, -1.6, 0.4], [0.5, 0.6, 0]); },
    () => { add(scene, new THREE.TorusGeometry(1.4, 0.5, 64, 128), glossy(P.cols[0]), [0, 0.5, 0], [1.1, 0.2, 0]); add(scene, new THREE.SphereGeometry(0.9, 64, 48), glossy(P.cols[1]), [0, 0.5, 0]); add(scene, new THREE.OctahedronGeometry(0.6, 0), chrome, [1.9, -1.3, 1], [0.3, 0.6, 0]); add(scene, new RoundedBoxGeometry(1, 1, 1, 6, 0.22), glossy(P.cols[2]), [-1.8, -1.4, 0.6], [0.6, 0.5, 0]); add(scene, new THREE.SphereGeometry(0.45, 48, 32), chrome, [-1.6, 2.4, -0.5]); },
    () => { [[0, 0.4, 0, 1.3], [-1.6, 2.2, -0.6, 0.6], [1.7, 1.6, 0.4, 0.75], [-1.3, -1.5, 0.8, 0.8], [1.4, -1.6, -0.2, 0.55], [0.2, 2.9, -1, 0.35], [-0.2, -2.6, 1.4, 0.4]].forEach(([x, y, z, s], i) => add(scene, new THREE.SphereGeometry(s, 64, 48), i % 3 === 2 ? chrome : glossy(P.cols[i % 3]), [x, y, z])); },
    () => { add(scene, new THREE.CylinderGeometry(1, 1, 0.5, 64), glossy(P.cols[0]), [0, -1.4, 0]); add(scene, new THREE.ConeGeometry(0.9, 1.7, 64), glossy(P.cols[1]), [0, 0.1, 0]); add(scene, new THREE.TorusGeometry(0.7, 0.22, 48, 96), chrome, [0, 1.6, 0], [0.4, 0.4, 0]); add(scene, new THREE.SphereGeometry(0.4, 48, 32), glossy(P.cols[2]), [1.8, 1.4, -0.5]); },
  ];
  layouts[v]();
  camera.position.set(0, 1.2, 12); camera.lookAt(0, 0, 0);
  render();
}

// ---------------- p35 Isometric office room kit ----------------
function room(stage, v) {
  const P = [
    { bg: '#f3e9dc', wall: 0xe8d5bf, wall2: 0xdcc3a6, floor: 0xc49a6c, acc: 0x3f7d6e, acc2: 0xe2714b },
    { bg: '#e3ecff', wall: 0xcbd8f5, wall2: 0xb4c5ec, floor: 0x8b6f5a, acc: 0x5162d9, acc2: 0xffb547 },
    { bg: '#fde7ea', wall: 0xf7cdd4, wall2: 0xefb6c1, floor: 0xe8e1d9, acc: 0x2f3a4a, acc2: 0x6fbf9a },
    { bg: '#1e2233', wall: 0x3a4160, wall2: 0x2f354f, floor: 0x5b4a3e, acc: 0x8fd3ff, acc2: 0xff7a90 },
  ][v];
  const { scene, camera, render } = setup(stage, { bg: P.bg, ortho: true, exposure: v === 3 ? 0.95 : 1.05 });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, v === 3 ? 0.8 : 1.3));
  sun(scene, [8, 12, 10], v === 3 ? 0.9 : 2.2, 8);
  const S = 1;
  add(scene, new THREE.BoxGeometry(6, 0.3, 6), mat(P.floor), [0, -0.15, 0]);
  add(scene, new THREE.BoxGeometry(6, 4, 0.25), mat(P.wall), [0, 2, -3.125]);
  add(scene, new THREE.BoxGeometry(0.25, 4, 6.25), mat(P.wall2), [-3.125, 2, -0.125]);
  add(scene, new THREE.BoxGeometry(2.2, 1.6, 0.05), mat(0xbfe3ff, { roughness: 0.1, emissive: v === 3 ? 0x335577 : 0x000000 }), [0.6, 2.6, -2.99]);
  add(scene, new THREE.BoxGeometry(2.4, 0.08, 0.15), mat(0xffffff), [0.6, 1.76, -2.95]);
  add(scene, new THREE.BoxGeometry(3.6, 0.04, 3.6), mat(P.acc2, { roughness: 1 }), [0.3, 0.02, 0.4]);
  // desk
  add(scene, new RoundedBoxGeometry(2.6, 0.12, 1.2, 2, 0.04), mat(0xf2eadf), [0.4, 1.3, -2.2]);
  for (const x of [-0.8, 1.6]) add(scene, new THREE.BoxGeometry(0.08, 1.3, 1.1), mat(0x333333), [x, 0.65, -2.2]);
  add(scene, new RoundedBoxGeometry(1.2, 0.75, 0.06, 2, 0.03), mat(0x222222), [0.4, 1.85, -2.5]);
  add(scene, new THREE.BoxGeometry(1.1, 0.65, 0.01), mat(P.acc, { emissive: P.acc, emissiveIntensity: v === 3 ? 0.8 : 0.25 }), [0.4, 1.85, -2.465]);
  add(scene, new THREE.BoxGeometry(0.7, 0.03, 0.25), mat(0xeeeeee), [0.4, 1.38, -1.85]);
  add(scene, new THREE.CylinderGeometry(0.09, 0.08, 0.18, 24), mat(P.acc2), [1.3, 1.45, -2]);
  // chair
  add(scene, new RoundedBoxGeometry(0.8, 0.12, 0.8, 2, 0.05), mat(P.acc), [0.4, 0.8, -1.2]);
  add(scene, new RoundedBoxGeometry(0.8, 0.9, 0.12, 2, 0.05), mat(P.acc), [0.4, 1.3, -0.82]);
  add(scene, new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12), mat(0x333333), [0.4, 0.4, -1.2]);
  // shelf + books
  add(scene, new THREE.BoxGeometry(0.5, 0.06, 1.8), mat(0xf2eadf), [-2.75, 2.4, -1.4]);
  const r = rng(3 + v);
  for (let i = 0; i < 7; i++) add(scene, new THREE.BoxGeometry(0.35, 0.4 + r() * 0.2, 0.12), mat([P.acc, P.acc2, 0xf6d365, 0x8e7dbe][i % 4]), [-2.75, 2.65, -2.1 + i * 0.2]);
  // plant
  add(scene, new THREE.CylinderGeometry(0.32, 0.25, 0.55, 24), mat(0xf4f1ea), [-2.3, 0.28, 1.9]);
  for (let i = 0; i < 9; i++) add(scene, new THREE.SphereGeometry(0.28, 12, 10), mat(0x4d9a5c, { flatShading: true }), [-2.3 + (r() - 0.5) * 0.6, 0.8 + r() * 0.9, 1.9 + (r() - 0.5) * 0.6], [0, 0, 0], [1, 1.4, 1]);
  // lamp
  add(scene, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 12), mat(0x222222), [2.4, 1.1, 1.8]);
  add(scene, new THREE.ConeGeometry(0.35, 0.4, 24, 1, true), mat(P.acc2, { side: THREE.DoubleSide, emissive: v === 3 ? 0xffaa55 : 0, emissiveIntensity: 0.6 }), [2.4, 2.3, 1.8], [Math.PI, 0, 0]);
  if (v === 3) { const l = new THREE.PointLight(0xffb366, 6, 6); l.position.set(2.4, 2, 1.8); scene.add(l); }
  const z = [80, 86, 83, 80][v];
  camera.zoom = z; camera.updateProjectionMatrix();
  const a = [Math.PI / 4, Math.PI / 4 + 0.3, Math.PI / 4 - 0.25, Math.PI / 4][v];
  camera.position.set(Math.sin(a) * 30, 24, Math.cos(a) * 30); camera.lookAt(0, 1.2, 0);
  render();
}

// ---------------- p36 Space kit ----------------
function space(stage, v) {
  const { scene, camera, render, renderer } = setup(stage, { bg: ['#0b1026', '#120a26', '#04131c', '#170f2e'][v], bg2: ['#2a1b5e', '#3d1a4f', '#0f3b4f', '#45256b'][v], exposure: 1.1 });
  stage.style.background += ', #000';
  const r = rng(700 + v);
  const stars = new THREE.BufferGeometry(); const pts = [];
  for (let i = 0; i < 900; i++) pts.push((r() - 0.5) * 80, (r() - 0.5) * 100, -30 - r() * 20);
  stars.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 })));
  scene.add(new THREE.AmbientLight(0x6670aa, 0.5));
  const key = new THREE.DirectionalLight(0xffeedd, 3.2); key.position.set(-6, 4, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 1.2); rim.position.set(6, -2, -4); scene.add(rim);
  const planet = (pos, rad, c1, c2, ring) => {
    const n = noise2(rad * 100 + v);
    const geo = new THREE.SphereGeometry(rad, 96, 64);
    const cols = []; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (fbm(n, p.getY(i) * 2.2 / rad + p.getX(i) * 0.3, p.getZ(i) * 0.3) + 0.5); const c = new THREE.Color(c1).lerp(new THREE.Color(c2), Math.min(1, Math.max(0, t))); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = add(scene, geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), pos);
    if (ring) { const rg = add(scene, new THREE.RingGeometry(rad * 1.35, rad * 2.1, 128), new THREE.MeshStandardMaterial({ color: ring, side: THREE.DoubleSide, transparent: true, opacity: 0.75, roughness: 0.6 }), pos, [1.25, 0.25, 0]); rg.castShadow = false; }
    return m;
  };
  const rocket = (pos, rot, s, body, accent) => {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.set(...rot); g.scale.setScalar(s); scene.add(g);
    const m = (c, o) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.6, ...o });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 16, 48), m(body)); g.add(b);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 48), m(accent)); nose.position.y = 1.55; g.add(nose);
    const win = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 16, 48), m(0xdddddd, { metalness: 0.8 })); win.position.set(0, 0.45, 0.52); g.add(win);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), m(0x7fd3ff, { emissive: 0x2277aa, emissiveIntensity: 0.4 })); glass.position.set(0, 0.45, 0.53); g.add(glass);
    for (let k = 0; k < 3; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.6), m(accent)); const a = k * Math.PI * 2 / 3; fin.position.set(Math.sin(a) * 0.55, -0.9, Math.cos(a) * 0.55); fin.rotation.y = a; g.add(fin); }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 32), new THREE.MeshBasicMaterial({ color: 0xffa23e })); flame.position.y = -1.8; flame.rotation.x = Math.PI; g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a8 })); core.position.y = -1.55; core.rotation.x = Math.PI; g.add(core);
  };
  if (v === 0) { planet([1.2, -1.6, -2], 3, 0xf2a65a, 0xb24a2a, 0xe8c9a0); rocket([-1.7, 2.6, 1.5], [0, 0.4, -0.5], 0.9, 0xf4f4f4, 0xff5a5f); planet([-2.6, -4.5, 0], 0.6, 0xbfc7d5, 0x6b7280); }
  if (v === 1) { rocket([0, 0, 0], [0.2, 0.6, -0.25], 1.6, 0xf4f4f4, 0x6c5ce7); planet([2.6, 3.6, -4], 1.1, 0x7ee8fa, 0x3a7bd5); planet([-2.4, -3.8, -3], 0.8, 0xffd36e, 0xff7a59); }
  if (v === 2) { planet([0, 0.4, 0], 2.4, 0x4fd1c5, 0x1a6b8a, 0x9be7ff); planet([2.6, -3.3, 1], 0.7, 0xe0e0e0, 0x8a8a8a); for (let i = 0; i < 9; i++) add(scene, new THREE.IcosahedronGeometry(0.15 + r() * 0.25, 0), new THREE.MeshStandardMaterial({ color: 0x8a7f74, flatShading: true }), [(r() - 0.5) * 7, -3 + r() * 1.5, (r() - 0.5) * 3], [r(), r(), r()]); }
  if (v === 3) { planet([-1.2, 2.2, -1], 1.6, 0xc77dff, 0x5a189a, 0xffc8dd); planet([1.8, -2.6, 0], 1.2, 0xffb703, 0xfb5607); rocket([1.9, 1.6, 2], [0, -0.3, 0.6], 0.6, 0xf4f4f4, 0x00b4d8); }
  camera.position.set(0, 0, 16); camera.lookAt(0, 0, 0);
  render();
}

export const RENDER = { p7: terra, p33: clay, p34: shapes, p35: room, p36: space };
