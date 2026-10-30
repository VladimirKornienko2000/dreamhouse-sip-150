import * as THREE from 'three';

/* ===========================================================
   3D-модель беседки 3×3 м — только облёт камеры (без хождения).
   Единицы — метры. x — на восток, z — на юг, y — вверх.
   Размеры совпадают с чертежами на странице.
   =========================================================== */

const rootEl = document.getElementById('g-root');
const canvas = document.getElementById('g-canvas');
const mini = document.getElementById('g-compass');
const mctx = mini.getContext('2d');
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- параметры конструкции ----------
const W = 3.0;                 // габарит по внешним граням стоек
const POST = 0.10;             // брус 100×100 (по смете)
const DECK = 0.30;             // отметка настила: пирог пола 225 мм + ~75 мм на опоры
const CLEAR = 2.2;             // настил → низ обвязочной балки
const BEAM_H = 0.10, BEAM_B = 0.10;   // обвязка — брус 100×100
const EAVE = 0.6;              // свес кровли (даёт ≈21–22 м² черепицы со сметы)
const PITCH = 25 * Math.PI / 180;
const T = Math.tan(PITCH);
const Y_BEAM_BOT = DECK + CLEAR;            // 2.35
const Y_BEAM_TOP = Y_BEAM_BOT + BEAM_H;     // 2.55
const Y_ROOF_AT_WALL = Y_BEAM_TOP + 0.19;   // стропило 150 + обрешётка 25 + черепица
const R_OUT = W / 2 + EAVE;                 // 1.9
const Y_EAVE = Y_ROOF_AT_WALL - EAVE * T;   // ~2.463
const Y_APEX = Y_EAVE + R_OUT * T;          // ~3.349
const HALF_WALL = 1.0;                      // низ проёма над настилом
const MID_X = -0.45;                        // промежуточная стойка северной стены
const SLAT = 0.096, SLAT_T = 0.02;       // планкен 20×96
const PC = W / 2 - POST / 2;                // 1.45 — ось угловых стоек

// ---------- three ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('g-fail').hidden = false;
  document.getElementById('g-hud').hidden = true;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color('#c3dccf');
scene.fog = new THREE.Fog(FOG, 20, 70);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);

// ---------- детерминированный random ----------
let seed = 20261030;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

// ---------- процедурные текстуры ----------
function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}
function woodTex(base, dark, vertical) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const a = rr(0.05, 0.28);
      g.strokeStyle = `rgba(${dark},${a})`;
      g.lineWidth = rr(0.6, 2.4);
      g.beginPath();
      if (vertical) { const x = rr(0, w); g.moveTo(x, 0); g.bezierCurveTo(x + rr(-6, 6), h * .3, x + rr(-6, 6), h * .7, x + rr(-4, 4), h); }
      else { const y = rr(0, h); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rr(-5, 5), w * .7, y + rr(-5, 5), w, y + rr(-3, 3)); }
      g.stroke();
    }
    for (let i = 0; i < 3; i++) { // сучки
      const x = rr(20, w - 20), y = rr(20, h - 20);
      g.fillStyle = `rgba(${dark},0.35)`; g.beginPath(); g.ellipse(x, y, rr(3, 6), rr(2, 4), 0, 0, 7); g.fill();
    }
  });
}
const texH = woodTex('#80512f', '36,18,8', false);
const texV = woodTex('#74492a', '36,18,8', true);
const texDeck = woodTex('#8a5a36', '40,20,8', false);
const texFrame = woodTex('#5e3a22', '24,12,6', false);

const shingleTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#3c2f2a'; g.fillRect(0, 0, w, h);
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const n = 8, cw = w / n, off = (r % 2) * cw / 2;
    for (let i = -1; i <= n; i++) {
      const tone = rr(-10, 12);
      g.fillStyle = `rgb(${72 + tone},${57 + tone},${50 + tone})`;
      g.fillRect(i * cw + off + 1, r * rh + 1, cw - 2, rh - 2);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, r * rh + rh - 3, w, 3);
  }
}, [6, 7]);

const lawnTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#5f9a3c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const t = rr(-18, 18);
    g.fillStyle = `rgba(${70 + t},${135 + t * 1.5},${45 + t},${rr(.25, .6)})`;
    g.fillRect(rr(0, w), rr(0, h), rr(1, 3), rr(2, 7));
  }
}, [26, 26]);

const barkTex = canvasTex(128, 256, (g, w, h) => {
  g.fillStyle = '#d9d6c9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 38; i++) {
    g.fillStyle = `rgba(35,30,28,${rr(.5, .9)})`;
    const y = rr(0, h), x = rr(0, w);
    g.beginPath(); g.ellipse(x, y, rr(6, 26), rr(1.5, 4), 0, 0, 7); g.fill();
  }
}, [1, 4]);

// ---------- материалы ----------
const mat = (map, rough = 0.82, color = '#ffffff') => new THREE.MeshStandardMaterial({ map, roughness: rough, color });
const mPostV = mat(texV);
const mSlat = mat(texH);
const mBeam = mat(texFrame, 0.78);
const mDeck = mat(texDeck, 0.7);
const mFrame = new THREE.MeshStandardMaterial({ color: '#4d301c', roughness: 0.9 });
const mUnder = mat(woodTex('#9a6a44', '60,32,14', false), 0.85);
const mRoof = new THREE.MeshStandardMaterial({ map: shingleTex, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });

// ---------- сцена: небо, свет, земля ----------
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#78aee3') }, mid: { value: new THREE.Color('#cfe5ee') }, bot: { value: FOG.clone() } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; uniform vec3 top,mid,bot; void main(){ float h=p.y; vec3 c = h>0. ? mix(mid, top, pow(clamp(h*1.4,0.,1.),.7)) : mix(mid, bot, clamp(-h*6.,0.,1.)); gl_FragColor=vec4(c,1.); }'
  })
);
scene.add(sky);

scene.add(new THREE.HemisphereLight('#e4f1ff', '#6d8a50', 1.5));
const fill = new THREE.DirectionalLight('#dce8ff', 0.95);
fill.position.set(-7, 5, -9);
scene.add(fill);
const sun = new THREE.DirectionalLight('#fff0d2', 2.6);
sun.position.set(7, 11, 6);
sun.target.position.set(0, 1, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
{ const c = sun.shadow.camera; c.left = -6.5; c.right = 6.5; c.top = 6.5; c.bottom = -6.5; c.near = 2; c.far = 40; }
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// ---------- хелперы ----------
const gazebo = new THREE.Group();   // всё, что относится к беседке
const roofGroup = new THREE.Group();
scene.add(gazebo, roofGroup);

function box(w, h, d, m, x, y, z, parent = gazebo, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function beamBetween(a, b, w, h, m, parent) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.lookAt(b);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
}

// ---------- настил на лагах (по смете) ----------
// чистовой пол 50×150 → черновой 25×100 → лаги 50×150 (7 шт.) на опорах
for (let i = 0; i < 7; i++) box(0.05, 0.15, W - 0.02, mFrame, -1.45 + i * (2.9 / 6), DECK - 0.075 - 0.075, 0);
box(W - 0.04, 0.025, W - 0.04, mFrame, 0, DECK - 0.05 - 0.0125, 0);                 // черновой пол
for (const x of [-1.3, 0, 1.3]) for (const z of [-1.3, 0, 1.3]) box(0.12, DECK - 0.225, 0.12, mFrame, x, (DECK - 0.225) / 2, z);   // опоры (фундамент не в смете)
{
  const n = 20, gap = 0.003, bw = (W - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const z = -W / 2 + bw / 2 + i * (bw + gap);
    const m = mDeck.clone(); m.color.setScalar(rr(0.82, 1.05));
    box(W, 0.05, bw, m, 0, DECK - 0.025, z);
  }
}
// торцевая доска по периметру (фартук)
box(W + 0.02, 0.225, 0.025, mFrame, 0, DECK - 0.1125, W / 2 + 0.005);
box(W + 0.02, 0.225, 0.025, mFrame, 0, DECK - 0.1125, -W / 2 - 0.005);
box(0.025, 0.225, W + 0.02, mFrame, W / 2 + 0.005, DECK - 0.1125, 0);
box(0.025, 0.225, W + 0.02, mFrame, -W / 2 - 0.005, DECK - 0.1125, 0);

// ---------- стойки (5 шт.) ----------
const postH = Y_BEAM_BOT - DECK;
for (const [x, z] of [[-PC, -PC], [PC, -PC], [-PC, PC], [PC, PC], [MID_X, -PC]]) {
  box(POST, postH, POST, mPostV, x, DECK + postH / 2, z);
}

// ---------- обвязочная балка 150×200 ----------
const by = Y_BEAM_BOT + BEAM_H / 2;
box(W, BEAM_H, BEAM_B, mBeam, 0, by, -PC);
box(W, BEAM_H, BEAM_B, mBeam, 0, by, PC);
box(BEAM_B, BEAM_H, W - 2 * BEAM_B, mBeam, -PC, by, 0);
box(BEAM_B, BEAM_H, W - 2 * BEAM_B, mBeam, PC, by, 0);
// потолочные балки поперёк (запад—восток)
for (const z of [-0.75, 0, 0.75]) box(W - 2 * BEAM_B, 0.10, 0.10, mBeam, 0, Y_BEAM_TOP - 0.05, z);

// ---------- стены из реек ----------
const slatYs = [];
{ let y = DECK; while (y + SLAT <= Y_BEAM_BOT + 0.001) { slatYs.push(y); y += y >= DECK + 1.4 ? 0.15 : 0.11; } }

function slatsAlongX(x0, x1, z, ys) {      // рейки вдоль x
  const len = x1 - x0, cx = (x0 + x1) / 2;
  for (const y of ys) box(len, SLAT, SLAT_T, mSlat, cx, y + SLAT / 2, z);
}
function slatsAlongZ(z0, z1, x, ys) {      // рейки вдоль z
  const len = z1 - z0, cz = (z0 + z1) / 2;
  for (const y of ys) box(SLAT_T, SLAT, len, mSlat, x, y + SLAT / 2, cz);
}
const inner = W / 2 - POST;                // 1.35
// западная стена — глухая на всю высоту
slatsAlongZ(-inner, inner, -PC, slatYs);
// северная стена: левая часть (запад) глухая, правая — полустена + проём
slatsAlongX(-inner, MID_X - POST / 2, -PC, slatYs);
const lowYs = slatYs.filter(y => y + SLAT <= DECK + HALF_WALL + 0.001);
slatsAlongX(MID_X + POST / 2, inner, -PC, lowYs);
box(inner - (MID_X + POST / 2), 0.06, 0.06, mBeam, (MID_X + POST / 2 + inner) / 2, DECK + HALF_WALL + 0.03 + 0.005, -PC);   // верхний ригель полустены

// ---------- кровля: вальма 25° ----------
{
  const R = R_OUT * Math.SQRT2, H = Y_APEX - Y_EAVE;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R, H, 4, 1, true), mRoof);
  cone.rotation.y = Math.PI / 4;
  cone.position.y = Y_EAVE + H / 2;
  cone.castShadow = true; cone.receiveShadow = true;
  roofGroup.add(cone);

  const under = new THREE.Mesh(new THREE.ConeGeometry(R, H, 4, 1, true), mUnder);
  under.rotation.y = Math.PI / 4;
  under.position.y = Y_EAVE + H / 2 - 0.19;
  under.receiveShadow = true;
  under.material.side = THREE.DoubleSide;
  roofGroup.add(under);

  // фасадная доска по краю свеса
  const fy = Y_EAVE - 0.09, fl = R_OUT * 2 + 0.03;
  box(fl, 0.22, 0.035, mBeam, 0, fy, R_OUT - 0.005, roofGroup);
  box(fl, 0.22, 0.035, mBeam, 0, fy, -R_OUT + 0.005, roofGroup);
  box(0.035, 0.22, fl, mBeam, R_OUT - 0.005, fy, 0, roofGroup);
  box(0.035, 0.22, fl, mBeam, -R_OUT + 0.005, fy, 0, roofGroup);

  // угловые стропила снизу
  const apex = new THREE.Vector3(0, Y_APEX - 0.22, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    beamBetween(new THREE.Vector3(sx * 1.5, Y_APEX - 1.5 * T - 0.17, sz * 1.5), apex, 0.05, 0.15, mBeam, roofGroup);
  }
  // коньковый кронштейн
  box(0.12, 0.12, 0.12, mBeam, 0, Y_APEX - 0.28, 0, roofGroup);
}

// ---------- щебень, дорожка из плитки ----------
{
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 1100);
  const d = new THREE.Object3D(), col = new THREE.Color();
  const pathX = z => -0.9 * (z - 1.6) / 4;          // чтобы не лезть на дорожку (ориентировочно)
  let n = 0;
  while (n < 1100) {
    // полоса вдоль южного края настила и вокруг дорожки
    const x = rr(-2.7, 2.7), z = rr(W / 2 + 0.03, W / 2 + 0.55);
    if (Math.abs(x - 0.1) < 0.55) continue;           // проход под дорожку
    const s = rr(0.025, 0.06);
    d.position.set(x, s * 0.5, z);
    d.scale.set(s, s * rr(0.55, 0.9), s * rr(0.8, 1.1));
    d.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3));
    d.updateMatrix(); inst.setMatrixAt(n, d.matrix);
    const g = rr(0.42, 0.7); col.setRGB(g, g * rr(0.95, 1), g * rr(0.88, 0.98));
    inst.setColorAt(n, col);
    n++;
  }
  inst.receiveShadow = true; inst.castShadow = false;
  scene.add(inst);

  // дорожка из плитки: от левого-переднего угла участка к центру фасада
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.2, 0, 6.2), new THREE.Vector3(-2.4, 0, 4.4),
    new THREE.Vector3(-0.8, 0, 3.0), new THREE.Vector3(0.1, 0, W / 2 + 0.02)
  ]);
  const tones = ['#9c9a94', '#aaa498', '#8b8f94', '#b3a794', '#989b9c', '#a39b8d'];
  const up = new THREE.Vector3(0, 1, 0);
  for (let t = 0; t <= 1; t += 0.014) {
    const p = curve.getPoint(t), tg = curve.getTangent(t);
    const nx = new THREE.Vector3().crossVectors(tg, up).normalize();
    for (let lane = -1; lane <= 1; lane++) {
      const w = rr(0.30, 0.42), l = rr(0.3, 0.42);
      const m = new THREE.Mesh(new THREE.BoxGeometry(l, 0.045, w), new THREE.MeshStandardMaterial({ color: tones[(rnd() * tones.length) | 0], roughness: 0.92 }));
      m.position.copy(p).addScaledVector(nx, lane * 0.36 + rr(-0.03, 0.03));
      m.position.y = 0.022;
      m.rotation.y = Math.atan2(-tg.z, tg.x) + rr(-0.06, 0.06);
      m.receiveShadow = true;
      scene.add(m);
    }
  }
}

// ---------- растения в чёрных кашпо ----------
function pot(x, z) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.22, 0.55, 20), new THREE.MeshStandardMaterial({ color: '#1c1c1e', roughness: 0.55 }));
  p.position.y = 0.275; p.castShadow = true; p.receiveShadow = true; g.add(p);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#2a1f17', roughness: 1 }));
  soil.position.y = 0.55; g.add(soil);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
{ // широколистное растение (алоказия)
  const g = pot(-1.78, 1.95);
  const leafGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2, tilt = rr(0.35, 0.95), h = rr(0.35, 0.75), len = rr(0.28, 0.4);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, h, 5), new THREE.MeshStandardMaterial({ color: '#4d7a36' }));
    stem.position.set(Math.cos(a) * h * 0.25 * tilt, 0.55 + h / 2 * 0.9, Math.sin(a) * h * 0.25 * tilt);
    stem.rotation.set(Math.sin(a) * tilt * 0.5, 0, -Math.cos(a) * tilt * 0.5);
    g.add(stem);
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rr(0.28, 0.33), 0.55, rr(0.2, 0.3)), roughness: 0.55, side: THREE.DoubleSide }));
    leaf.scale.set(len * 0.62, 0.012, len);
    leaf.position.set(Math.cos(a) * (0.1 + h * 0.5 * tilt), 0.55 + h * 0.95, Math.sin(a) * (0.1 + h * 0.5 * tilt));
    leaf.rotation.set(Math.sin(a) * tilt * 0.6, -a + Math.PI / 2, -Math.cos(a) * tilt * 0.6 + 0.0);
    leaf.rotation.order = 'YXZ'; leaf.rotation.y = -a + Math.PI / 2; leaf.rotation.x = -tilt * 0.55;
    leaf.castShadow = true;
    g.add(leaf);
  }
}
{ // юкка
  const g = pot(2.12, 1.95);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8), new THREE.MeshStandardMaterial({ color: '#6b5436', roughness: 1 }));
  trunk.position.y = 0.55 + 0.375; trunk.castShadow = true; g.add(trunk);
  const lg = new THREE.ConeGeometry(0.022, 0.85, 4); lg.translate(0, 0.425, 0);
  for (let i = 0; i < 64; i++) {
    const a = rnd() * Math.PI * 2, tilt = rr(0.15, 1.35);
    const m = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rr(0.22, 0.27), 0.45, rr(0.24, 0.34)), roughness: 0.6 }));
    m.position.set(0, 0.55 + 0.75, 0);
    m.rotation.order = 'YXZ'; m.rotation.y = a; m.rotation.x = tilt;
    m.castShadow = true;
    g.add(m);
  }
}

// ---------- лес вокруг (низкополигональный) ----------
const culls = [];   // деревья и кусты: прячем, если загораживают беседку
{
  const trunkGeo = new THREE.CylinderGeometry(1, 1.25, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.9 });
  const greens = ['#3f7a2c', '#4a8a33', '#356b27', '#58953a', '#2f5f24', '#5e9b3d'];
  function tree(x, z, h, birch) {
    const g = new THREE.Group();
    const r = h * 0.017;
    const tr = new THREE.Mesh(trunkGeo, birch ? barkMat : new THREE.MeshStandardMaterial({ color: '#5b4128', roughness: 1 }));
    tr.scale.set(r, h, r); tr.castShadow = true; g.add(tr);
    const n = 4 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const s = h * rr(0.13, 0.2);
      const c = new THREE.Mesh(crownGeo, new THREE.MeshStandardMaterial({ color: greens[(rnd() * greens.length) | 0], roughness: 0.95, flatShading: true }));
      c.scale.set(s, s * rr(0.8, 1.15), s);
      c.position.set(rr(-h * 0.1, h * 0.1), h * rr(0.62, 0.98), rr(-h * 0.1, h * 0.1));
      c.castShadow = true;
      g.add(c);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    culls.push({ o: g, x, z, rad: 3.2 });
  }
  // задний план (север) — ближе, как на референсе
  for (let i = 0; i < 12; i++) {
    const a = Math.PI + rr(-1.15, 1.15);                   // сектор на север
    const d = rr(5.5, 8.5);
    tree(Math.sin(a) * d, Math.cos(a) * d, rr(7, 11), rnd() < 0.7);
  }
  // кольцо дальше
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, d = rr(13, 30);
    tree(Math.sin(a) * d, Math.cos(a) * d, rr(8, 14), rnd() < 0.55);
  }
  // кусты
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 20; i++) {
    const a = Math.PI + rr(-1.4, 1.4), d = rr(4.2, 6.8);
    const s = rr(0.35, 0.75);
    const b = new THREE.Mesh(bushGeo, new THREE.MeshStandardMaterial({ color: greens[(rnd() * greens.length) | 0], roughness: 1, flatShading: true }));
    b.scale.set(s * 1.2, s * 0.8, s * 1.1);
    b.position.set(Math.sin(a) * d, s * 0.5, Math.cos(a) * d);
    b.castShadow = true; scene.add(b);
    culls.push({ o: b, x: b.position.x, z: b.position.z, rad: 1.8 });
  }
}

// ---------- камера: только автоматический облёт ----------
// Точка, вокруг которой летит камера, — геометрический центр беседки вместе с крышей
// (по высоте 0…3,35 м), поэтому беседка всегда остаётся в центре кадра.
const TARGET = new THREE.Vector3(0, 1.75, 0);
const SPHERE = 3.3;                       // радиус сферы, описанной вокруг беседки с кровлей
const ELEV = 0.3;                         // постоянный угол места камеры
const view = { th: 0.6, ph: ELEV, r: 12 };
let fitR = 12;                            // расстояние, при котором беседка занимает ~80% кадра

function updateFit() {
  const vf = camera.fov * Math.PI / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  fitR = SPHERE / Math.sin(Math.min(vf, hf) / 2) * 1.08;
}
function applyCamera() {
  const c = Math.cos(view.ph);
  camera.position.set(
    TARGET.x + view.r * c * Math.sin(view.th),
    TARGET.y + view.r * Math.sin(view.ph),
    TARGET.z + view.r * c * Math.cos(view.th)
  );
  camera.lookAt(TARGET);
}

// кнопки: только крыша и полный экран
const roofBtn = document.getElementById('g-roof');
roofBtn.addEventListener('click', () => {
  roofGroup.visible = !roofGroup.visible;
  roofBtn.classList.toggle('on', roofGroup.visible);
  roofBtn.textContent = roofGroup.visible ? 'Крыша: вкл' : 'Крыша: выкл';
});
document.getElementById('g-fs').addEventListener('click', () => toggleFs());
function toggleFs(force) {
  const on = force ?? !rootEl.classList.contains('fs');
  rootEl.classList.toggle('fs', on);
  document.body.classList.toggle('noscroll', on);
  resize();
}
addEventListener('keydown', e => { if (e.key === 'Escape' && rootEl.classList.contains('fs')) toggleFs(false); });

// ---------- компас-миникарта ----------
function drawCompass() {
  const w = mini.width, h = mini.height, s = 0.24, cx = w / 2, cy = h / 2;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = 'rgba(255,255,255,.9)'; mctx.fillRect(0, 0, w, h);
  mctx.strokeStyle = 'rgba(0,135,58,.35)'; mctx.lineWidth = 1;
  mctx.strokeRect(cx - W / 2 * 14, cy - W / 2 * 14, W * 14, W * 14);
  mctx.fillStyle = '#8a5a36'; mctx.fillRect(cx - W / 2 * 14, cy - W / 2 * 14, W * 14, W * 14);
  mctx.fillStyle = '#6b4226';
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mctx.fillRect(cx + x * 19.9 - 2, cy + z * 19.9 - 2, 4, 4);
  // камера
  const rx = Math.sin(view.th), rz = Math.cos(view.th);
  const px = cx + rx * 46, pz = cy + rz * 46;
  mctx.fillStyle = 'rgba(0,135,58,.18)';
  mctx.beginPath(); mctx.moveTo(px, pz);
  const a0 = Math.atan2(-rz, -rx);
  mctx.arc(px, pz, 40, a0 - 0.5, a0 + 0.5); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#00873a'; mctx.beginPath(); mctx.arc(px, pz, 5, 0, 7); mctx.fill();
  mctx.fillStyle = '#16231b'; mctx.font = '700 11px system-ui,sans-serif'; mctx.textAlign = 'center';
  mctx.fillText('С', cx, 12);
}

function updateCulls() {
  const sx = Math.sin(view.th), cz = Math.cos(view.th);
  const hd = view.r * Math.cos(view.ph);          // горизонтальная дистанция до камеры
  for (const c of culls) {
    const dot = c.x * sx + c.z * cz, perp = Math.abs(c.x * cz - c.z * sx);
    c.o.visible = !(dot > 1.0 && dot < hd + 2.5 && perp < c.rad);
  }
}

// ---------- цикл ----------
function resize() {
  const w = rootEl.clientWidth, h = rootEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // на узких экранах — шире угол, чтобы беседка помещалась
  camera.fov = w / h < 0.9 ? 52 : w / h < 1.3 ? 44 : 36;
  camera.updateProjectionMatrix();
  updateFit();
  applyCamera();
  renderer.render(scene, camera);   // сразу перерисовываем, чтобы не было пустого кадра после изменения размера
}
new ResizeObserver(resize).observe(rootEl);
resize();

let visible = true, last = performance.now();
new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(rootEl);

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!visible || document.hidden) return;
  if (!stillMode) {
    view.th += dt * 0.14;                                          // полный круг ≈ 45 с
    view.ph = ELEV;
    view.r += (fitR - view.r) * Math.min(1, dt * 3);               // плавно подстраиваем под размер экрана
  }
  applyCamera();
  updateCulls();
  renderer.render(scene, camera);
  drawCompass();
}

// режим для статичных кадров (?still) — используется при подготовке картинок
const stillMode = new URLSearchParams(location.search).has('still');
window.gazebo3d = {
  setView(th, ph, r) { view.th = th; view.ph = ph; view.r = r; applyCamera(); updateCulls(); renderer.render(scene, camera); },
  setRoof(v) { roofGroup.visible = v; },
  get view() { return { ...view }; },
  get fit() { return fitR; },
  resize
};

applyCamera();
requestAnimationFrame(frame);
rootEl.classList.add('ready');
