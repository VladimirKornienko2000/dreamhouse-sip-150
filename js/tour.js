import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const rootEl = document.getElementById('tour-root');
const canvas = document.getElementById('tour-canvas');
const loadingEl = document.getElementById('tour-loading');
const startEl = document.getElementById('tour-start');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const joyEl = document.getElementById('joy');
const knobEl = document.getElementById('joy-knob');

const isTouch = matchMedia('(pointer: coarse)').matches;
const EYE = 1.65, RADIUS = 0.22, WALK = 2.0, RUN = 3.8;

let data = null;               // house_data.json
let level = 1;
const pos = new THREE.Vector2(4.0, -6.0);   // x, z (план: x на восток, z на юг)
let yaw = Math.PI, pitch = 0;
let camY = EYE;
let started = false, visible = false, ready = false;

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.6 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfe4f2');
scene.fog = new THREE.Fog('#dbe9f2', 45, 180);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight('#ffffff', '#dcd9cf', isTouch ? 1.5 : 1.15));
const sun = new THREE.DirectionalLight('#fff4e0', isTouch ? 1.5 : 2.2);
sun.position.set(22, 30, 26);
sun.target.position.set(4, 1, 5);
if (!isTouch) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera; c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 5; c.far = 90;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
}
scene.add(sun, sun.target);

// участок
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: '#8fae78' }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const path = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 7.2), new THREE.MeshLambertMaterial({ color: '#b9bab6' }));
path.position.set(4.0, 0.01, -5.4); path.receiveShadow = true; scene.add(path);

// деревья
function tree(x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.6 * s, 8), new THREE.MeshLambertMaterial({ color: '#6b4a2b' }));
  trunk.position.y = 0.8 * s;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 3.2 * s, 10), new THREE.MeshLambertMaterial({ color: '#3f7a4a' }));
  crown.position.y = 2.9 * s;
  trunk.castShadow = crown.castShadow = true;
  g.add(trunk, crown); g.position.set(x, 0, z); scene.add(g);
}
[[-7, -4, 1.2], [14, -3, 1.0], [-9, 7, 1.4], [16, 9, 1.3], [-5, 16, 1.1], [13, 17, 1.2], [20, 2, 1.5], [-12, -10, 1.3], [8, -14, 1.1], [-3, 21, 1.0]].forEach(t => tree(...t));

// ---------- загрузка ----------
const loader = new GLTFLoader();
loader.load('assets/dreamhouse_150.glb', gltf => {
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    if (o.name.includes('door_leaf')) { o.visible = false; return; }
    const glass = o.name.startsWith('glass');
    o.castShadow = !glass; o.receiveShadow = true;
    if (glass) { o.material.depthWrite = false; o.renderOrder = 2; }
  });
  scene.add(gltf.scene);
  fetch('assets/house_data.json').then(r => r.json()).then(d => { data = d; ready = true; loadingEl.style.display = 'none'; resize(); });
}, undefined, err => { loadingEl.textContent = 'Не удалось загрузить модель'; console.error(err); });

// ---------- размеры ----------
function resize() {
  const w = rootEl.clientWidth, h = rootEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? 80 : 72;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(rootEl);
addEventListener('resize', resize);

// ---------- физика ----------
function hitsRect(x, z, r) {
  const [x1, z1, x2, z2] = r;
  const cx = Math.max(x1, Math.min(x, x2)), cz = Math.max(z1, Math.min(z, z2));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < RADIUS * RADIUS;
}
function blocked(x, z) {
  if (Math.abs(x) > 25 || Math.abs(z) > 25) return true;
  const rs = data.collision[String(level)];
  for (let i = 0; i < rs.length; i++) if (hitsRect(x, z, rs[i])) return true;
  return false;
}
function floorY(x, z) {
  const c = data.const, st = c.STAIR, p = c.PORCH;
  const inStair = x > st.x1 - 0.01 && x < st.x2 && z > st.y_top && z < st.y_bottom;
  if (inStair) {
    const k = Math.max(0, Math.min(1, (st.y_bottom - z) / (st.y_bottom - st.y_top)));
    const h = c.Z_F1 + k * (c.Z_F2 - c.Z_F1);
    level = h >= 2.0 ? 2 : 1;
    return h;
  }
  if (x >= 0 && x <= c.W && z >= 0 && z <= c.L) return level === 1 ? c.Z_F1 : c.Z_F2;
  if (x >= p.x1 && x <= p.x2 && z >= -1.8 && z <= 0) {
    if (z >= p.y1) return c.Z_F1;
    return Math.max(0, c.Z_F1 * (z + 1.8) / (p.y1 + 1.8));
  }
  return 0;
}

// ---------- ввод ----------
const keys = new Set();
addEventListener('keydown', e => {
  if (!started) return;
  const k = e.code;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) { keys.add(k); e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

let locked = false;
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && !isTouch && started) { setStarted(false); }
});
document.addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.0022));
});

// касания: левая часть — джойстик, правая — осмотр
const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
let lookId = null, lookX = 0, lookY = 0;
function joyBase() { const r = joyEl.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 }; }
rootEl.addEventListener('touchstart', e => {
  if (!started) return;
  for (const t of e.changedTouches) {
    if (e.target.closest('.places') || e.target.closest('.icon-btn')) continue;
    const rect = rootEl.getBoundingClientRect();
    const left = (t.clientX - rect.left) < rect.width * 0.42 && (t.clientY - rect.top) > rect.height * 0.35;
    if (left && joy.id === null) { joy.id = t.identifier; const b = joyBase(); joy.cx = b.cx; joy.cy = b.cy; updJoy(t); }
    else if (lookId === null) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
function updJoy(t) {
  const b = joyBase();
  let dx = t.clientX - b.cx, dy = t.clientY - b.cy;
  const d = Math.hypot(dx, dy), m = b.rad;
  if (d > m) { dx = dx / d * m; dy = dy / d * m; }
  joy.x = dx / m; joy.y = dy / m;
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}
rootEl.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) updJoy(t);
    else if (t.identifier === lookId) {
      yaw -= (t.clientX - lookX) * 0.0055;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - (t.clientY - lookY) * 0.0055));
      lookX = t.clientX; lookY = t.clientY;
    }
  }
  if (started) e.preventDefault();
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knobEl.style.transform = ''; }
    if (t.identifier === lookId) lookId = null;
  }
}
rootEl.addEventListener('touchend', endTouch);
rootEl.addEventListener('touchcancel', endTouch);

// перетаскивание мышью, если захват курсора недоступен
let dragging = false;
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && started && !locked) { dragging = true; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  yaw -= e.movementX * 0.003; pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY * 0.003));
});
canvas.addEventListener('pointerup', () => { dragging = false; });

function setStarted(v) {
  started = v;
  rootEl.classList.toggle('started', v);
  startEl.hidden = v;
  if (!v) { keys.clear(); }
}
function begin() {
  if (!ready) return;
  setStarted(true);
  if (!isTouch && canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
}
startEl.addEventListener('click', begin);
document.getElementById('tour-go').addEventListener('click', e => { e.stopPropagation(); begin(); });

// ---------- точки ----------
const PLACES = {
  out:     { x: 4.0, z: -12.5, lv: 1, yaw: Math.PI },
  tambour: { x: 4.0, z: 1.4,  lv: 1, yaw: Math.PI },
  living:  { x: 4.0, z: 4.6,  lv: 1, yaw: Math.PI },
  kitchen: { x: 6.7, z: 8.9,  lv: 1, yaw: Math.PI / 2 + 0.4 },
  bed1:    { x: 6.6, z: 4.3,  lv: 1, yaw: 0.25 },
  gallery: { x: 3.0, z: 6.5,  lv: 2, yaw: Math.PI },
  bed2:    { x: 6.6, z: 4.4,  lv: 2, yaw: 0.3 },
};
function go(name) {
  if (!ready) return;
  const p = PLACES[name]; if (!p) return;
  level = p.lv; pos.set(p.x, p.z); yaw = p.yaw; pitch = 0;
  camY = floorY(pos.x, pos.y) + EYE;
  document.querySelectorAll('#tour-places button').forEach(b => b.classList.toggle('on', b.dataset.p === name));
}
document.getElementById('tour-places').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  e.stopPropagation(); go(b.dataset.p);
  if (!started) begin();
});

// полноэкранный режим
const fsBtn = document.getElementById('tour-fs');
fsBtn.addEventListener('click', e => {
  e.stopPropagation();
  const on = rootEl.classList.toggle('fs');
  document.body.classList.toggle('noscroll', on);
  if (on && rootEl.requestFullscreen) rootEl.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  resize();
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && rootEl.classList.contains('fs')) { rootEl.classList.remove('fs'); document.body.classList.remove('noscroll'); resize(); }
});

// ---------- мини-карта ----------
const MS = 12, MX = 18, MY = 18;
function drawMini() {
  if (!data) return;
  mctx.clearRect(0, 0, mini.width, mini.height);
  const c = data.const;
  mctx.fillStyle = '#f4f7f3'; mctx.strokeStyle = '#2f2f2f'; mctx.lineWidth = 1;
  mctx.fillRect(MX, MY, c.W * MS, c.L * MS);
  const rs = data.collision[String(level)];
  mctx.fillStyle = '#2f2f2f';
  for (const [x1, z1, x2, z2] of rs) {
    if (Math.min(x2 - x1, z2 - z1) > 0.25) continue;
    mctx.fillRect(MX + x1 * MS, MY + z1 * MS, (x2 - x1) * MS, (z2 - z1) * MS);
  }
  if (level === 2) { mctx.fillStyle = 'rgba(0,135,58,.18)'; mctx.fillRect(MX, MY + 6.4 * MS, 5 * MS, (c.L - 6.4) * MS); }
  mctx.fillStyle = '#00873a'; mctx.font = 'bold 11px sans-serif'; mctx.textAlign = 'center';
  mctx.fillText(level + ' этаж', mini.width / 2, 12);
  const px = MX + pos.x * MS, py = MY + pos.y * MS;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  mctx.fillStyle = 'rgba(0,135,58,.25)';
  mctx.beginPath(); mctx.moveTo(px, py);
  const a0 = Math.atan2(fz, fx) - 0.6, a1 = Math.atan2(fz, fx) + 0.6;
  mctx.arc(px, py, 26, a0, a1); mctx.closePath(); mctx.fill();
  mctx.fillStyle = '#00873a'; mctx.beginPath(); mctx.arc(px, py, 4, 0, 7); mctx.fill();
}

// ---------- цикл ----------
new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(rootEl);
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!visible || !ready) return;

  if (started) {
    let f = 0, s = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD')) s += 1;
    if (keys.has('KeyA')) s -= 1;
    if (keys.has('ArrowLeft')) yaw += 1.8 * dt;
    if (keys.has('ArrowRight')) yaw -= 1.8 * dt;
    f += -joy.y; s += joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    if (len > 0.02) {
      const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK) * dt;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const dx = (fx * f + rx * s) * sp, dz = (fz * f + rz * s) * sp;
      if (!blocked(pos.x + dx, pos.y)) pos.x += dx;
      if (!blocked(pos.x, pos.y + dz)) pos.y += dz;
    }
  }
  const ty = floorY(pos.x, pos.y) + EYE;
  camY += (ty - camY) * Math.min(1, dt * 12);
  camera.position.set(pos.x, camY, pos.y);
  camera.rotation.set(pitch, yaw, 0);
  renderer.render(scene, camera);
  drawMini();
}
requestAnimationFrame(frame);

// стартовая точка: вид на дом снаружи
go('out');
