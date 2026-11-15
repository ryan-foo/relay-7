import * as THREE from 'three';

// ================= utilities =================
const $ = (id) => document.getElementById(id);
let seed = 7007;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const d2 = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; };
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// ================= renderer / scene =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
$('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x5d6288);
scene.fog = new THREE.Fog(FOG, 45, 230);
scene.background = FOG;
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 900);
scene.add(camera);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x141a3c) }, mid: { value: new THREE.Color(0xc8603a) }, bot: { value: new THREE.Color(0x5d6288) }, sunDir: { value: new THREE.Vector3(0.75, 0.1, 0.65).normalize() } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.0, 0.45, h)); c = mix(bot, c, smoothstep(-0.03, 0.09, h));
      float s = max(dot(normalize(vP), sunDir), 0.0); c += vec3(1.0,0.45,0.2)*pow(s, 60.0)*1.6 + vec3(1.0,0.4,0.15)*pow(s,5.0)*0.3;
      gl_FragColor = vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);
// a gas giant hanging in the sky
const planet = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0x8a6aa0, fog: false, transparent: true, opacity: 0.55 }));
planet.position.set(-250, 170, -380); scene.add(planet);

scene.add(new THREE.HemisphereLight(0x8a9ae0, 0x7a4030, 1.05));
const sun = new THREE.DirectionalLight(0xff9a5a, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 260 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const matCache = new Map();
const M = (c) => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

// ================= world =================
const R_WALL = 22, GAP_HALF = 0.17, BOUND = 92, TOWER_R = 3.2;
const ENTR = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
const PAD = new THREE.Vector3(-9, 0, 9);
const circles = []; // extra round colliders {x,z,r}
function inGap(a, margin = 0) { for (const e of ENTR) if (Math.abs(angDiff(a, e)) < GAP_HALF - margin) return e; return null; }

// ground with gentle dunes
{
  const g = new THREE.PlaneGeometry(600, 600, 120, 120); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const h = r < 32 ? 0 : (Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.8 + Math.sin(x * 0.021 + z * 0.03) * 1.2) * Math.min(1, (r - 32) / 30);
    p.setY(i, h - 0.05);
    c.setHex(0xa0502e).lerp(new THREE.Color(0xc2763e), (Math.sin(x * 0.13 + z * 0.09) * 0.5 + 0.5) * 0.5);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; scene.add(ground);
}
// compound floor
mesh(new THREE.CircleGeometry(R_WALL + 1, 64).rotateX(-Math.PI / 2), 0x6f5a50, 0, 0.02, 0).castShadow = false;
mesh(new THREE.CircleGeometry(5, 32).rotateX(-Math.PI / 2), 0x3a3f48, PAD.x, 0.04, PAD.z).castShadow = false;
mesh(new THREE.RingGeometry(4.2, 4.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc040 }), PAD.x, 0.06, PAD.z).castShadow = false;

// wall ring (instanced segments), gaps at the canyon entrances
{
  const segs = [];
  for (let a = -Math.PI; a < Math.PI; a += 0.1) if (inGap(a + 0.05, -0.02) === null) segs.push(a + 0.05);
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 2.4, 1.2), M(0x8d8a86), segs.length);
  const stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(2.32, 0.25, 1.24), M(0xd8a030), segs.length);
  const o = new THREE.Object3D();
  segs.forEach((a, i) => {
    o.position.set(Math.cos(a) * R_WALL, 1.2, Math.sin(a) * R_WALL); o.rotation.set(0, -a - Math.PI / 2, 0); o.updateMatrix(); wall.setMatrixAt(i, o.matrix);
    o.position.y = 1.9; o.updateMatrix(); stripe.setMatrixAt(i, o.matrix);
  });
  wall.castShadow = wall.receiveShadow = true; scene.add(wall, stripe);
  // gate pylons
  for (const e of ENTR) for (const s of [-1, 1]) {
    const a = e + s * (GAP_HALF + 0.02);
    mesh(new THREE.BoxGeometry(1.6, 3.6, 1.6), 0x6c6a68, Math.cos(a) * R_WALL, 1.8, Math.sin(a) * R_WALL);
    mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xff5030 }), Math.cos(a) * R_WALL, 3.8, Math.sin(a) * R_WALL);
  }
}
// uplink tower
const towerGroup = new THREE.Group(); scene.add(towerGroup);
{
  mesh(new THREE.CylinderGeometry(3, 3.4, 1.6, 8), 0x50555e, 0, 0.8, 0, towerGroup);
  mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 6), 0x9aa0a8, 0, 9, 0, towerGroup);
  for (let y = 3; y < 17; y += 3) mesh(new THREE.TorusGeometry(1.25 - y * 0.02, 0.1, 6, 12).rotateX(Math.PI / 2), 0xd8a030, 0, y, 0, towerGroup);
  const dish = mesh(new THREE.SphereGeometry(3, 20, 10, 0, Math.PI * 2, 0, 1.0), new THREE.MeshLambertMaterial({ color: 0xd8dde4, side: THREE.DoubleSide }), 0, 18, 0, towerGroup);
  dish.rotation.x = 2.3;
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 4), 0xcccccc, 0, 20, 0, towerGroup);
}
const beacon = mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 23, 0, towerGroup);
const towerSmoke = [];
// buildings inside the compound
for (const [a, r, w, d, h, c] of [[0.6, 13, 7, 4, 3, 0x6a7078], [2.6, 13, 6, 4, 3.2, 0x707680], [-2.2, 14, 6, 4, 2.6, 0x5f656e], [-1.0, 12, 3, 3, 2, 0x7a6a50], [1.6, 16, 3, 3, 1.6, 0x7a6a50]]) {
  const b = mesh(new THREE.BoxGeometry(w, h, d), c, Math.cos(a) * r, h / 2, Math.sin(a) * r);
  b.rotation.y = -a + Math.PI / 2;
  circles.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: Math.max(w, d) / 2 - 0.3 });
}
// floodlights aimed out of each gate
const floodHeads = [];
for (const e of ENTR) {
  const a = e + 0.45, x = Math.cos(a) * 17, z = Math.sin(a) * 17;
  mesh(new THREE.CylinderGeometry(0.15, 0.2, 10, 6), 0x444a52, x, 5, z);
  const head = mesh(new THREE.BoxGeometry(1.4, 0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xf4fbff }), x, 10, z);
  const sp = new THREE.SpotLight(0xe8f4ff, 260, 80, 0.36, 0.6, 1.6);
  sp.position.set(x, 10, z); sp.target.position.set(Math.cos(e) * 46, 0, Math.sin(e) * 46);
  head.lookAt(sp.target.position);
  scene.add(sp, sp.target);
  // faint light cone
  const len = Math.hypot(sp.target.position.x - x, 10, sp.target.position.z - z);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(len * 0.36, len, 20, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  cone.position.set(x, 10, z); cone.lookAt(sp.target.position); scene.add(cone);
  circles.push({ x, z, r: 0.4 }); floodHeads.push(head);
}
// canyon mesas: a ring of rock with three corridors
{
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = [];
  for (let a = -Math.PI; a < Math.PI; a += 0.07) {
    const g = ENTR.reduce((m, e) => Math.min(m, Math.abs(angDiff(a, e))), 9);
    if (g < 0.2) continue;
    for (let k = 0; k < 2; k++) rocks.push([a + rr(-0.03, 0.03), rr(98, 135) + k * 18, rr(10, 22), rr(18, 40)]);
  }
  // corridor walls
  for (const e of ENTR) for (const s of [-1, 1]) for (let r = 55; r < 140; r += 9) {
    const w = 8 + r * 0.12;
    rocks.push([e + s * Math.atan2(w, r), r, rr(6, 10), rr(8, 22) * Math.min(1, r / 75)]);
  }
  const inst = new THREE.InstancedMesh(rockGeo, M(0x8a3a24), rocks.length);
  const o = new THREE.Object3D();
  rocks.forEach(([a, r, s, h], i) => {
    o.position.set(Math.cos(a) * r, h * 0.35, Math.sin(a) * r); o.rotation.set(rr(0, 3), rr(0, 3), rr(0, 3)); o.scale.set(s, h, s); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
  });
  inst.castShadow = inst.receiveShadow = true; scene.add(inst);
  // scattered boulders in the basin
  const b = new THREE.InstancedMesh(rockGeo, M(0x7a3220), 60);
  for (let i = 0; i < 60; i++) {
    const a = rr(-Math.PI, Math.PI), r = rr(32, 88);
    if (inGap(a, -0.25) !== null && r < 80) { o.scale.set(0, 0, 0); } else { const s = rr(0.8, 2.6); o.scale.set(s, s * rr(0.6, 1.2), s); }
    o.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r); o.rotation.set(rr(0, 3), rr(0, 3), 0); o.updateMatrix(); b.setMatrixAt(i, o.matrix);
  }
  b.castShadow = true; scene.add(b);
}

// ================= effects =================
// particles (one pooled Points system)
const PN = 2400;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PN * 3).fill(-999), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pGrav = new Float32Array(PN);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
let pHead = 0;
const _c = new THREE.Color();
function burst(p, n, color, speed = 6, up = 3, life = 0.7, grav = 14, spread = 0.2) {
  _c.setHex(color);
  for (let k = 0; k < n; k++) {
    const i = pHead; pHead = (pHead + 1) % PN;
    pPos[i * 3] = p.x + rr(-spread, spread); pPos[i * 3 + 1] = p.y + rr(-spread, spread); pPos[i * 3 + 2] = p.z + rr(-spread, spread);
    const a = rr(0, Math.PI * 2), s = rr(0.3, 1) * speed;
    pVel[i * 3] = Math.cos(a) * s; pVel[i * 3 + 1] = rr(0.3, 1) * up; pVel[i * 3 + 2] = Math.sin(a) * s;
    pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b; pLife[i] = life * rr(0.6, 1.2); pGrav[i] = grav;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; pVel[i * 3] *= 0.5; pVel[i * 3 + 2] *= 0.5; pVel[i * 3 + 1] = 0; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
// tracers (pooled line segments)
const TN = 300;
const tGeo = new THREE.BufferGeometry();
const tPos = new Float32Array(TN * 6), tCol = new Float32Array(TN * 6), tLife = new Float32Array(TN), tMax = new Float32Array(TN), tBase = new Float32Array(TN * 3);
tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3)); tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
tracers.frustumCulled = false; scene.add(tracers);
let tHead = 0;
function tracer(a, b, color, life = 0.07) {
  const i = tHead; tHead = (tHead + 1) % TN; _c.setHex(color);
  tPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); tBase.set([_c.r, _c.g, _c.b], i * 3); tLife[i] = tMax[i] = life;
}
function updateTracers(dt) {
  for (let i = 0; i < TN; i++) {
    if (tLife[i] > 0) tLife[i] -= dt;
    const k = Math.max(0, tLife[i] / (tMax[i] || 1));
    for (let v = 0; v < 2; v++) { tCol[i * 6 + v * 3] = tBase[i * 3] * k; tCol[i * 6 + v * 3 + 1] = tBase[i * 3 + 1] * k; tCol[i * 6 + v * 3 + 2] = tBase[i * 3 + 2] * k; }
  }
  tGeo.attributes.position.needsUpdate = true; tGeo.attributes.color.needsUpdate = true;
}
// explosion flashes
const flashes = [];
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; scene.add(m); flashes.push({ m, t: 0, r: 1 });
}
let flashHead = 0;
const boomLight = new THREE.PointLight(0xff8030, 0, 40, 2); scene.add(boomLight);
function flash(p, r, color = 0xffa040) {
  const f = flashes[flashHead]; flashHead = (flashHead + 1) % flashes.length;
  f.m.position.copy(p); f.m.material.color.setHex(color); f.t = 0.45; f.r = r; f.m.visible = true;
  boomLight.position.set(p.x, p.y + 2, p.z); boomLight.intensity = 900;
}
function updateFlashes(dt) {
  for (const f of flashes) {
    if (f.t <= 0) continue; f.t -= dt;
    const k = 1 - f.t / 0.45; f.m.scale.setScalar(f.r * (0.4 + k)); f.m.material.opacity = Math.max(0, 1 - k) * 0.9;
    if (f.t <= 0) f.m.visible = false;
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 4000);
}
// ground decals: splatter + scorch
const DN = 160;
const decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), DN);
decals.frustumCulled = false; scene.add(decals);
{ const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < DN; i++) { decals.setMatrixAt(i, z); decals.setColorAt(i, _c.setHex(0x000000)); } }
let dHead = 0; const _o = new THREE.Object3D();
function decal(p, s, color) {
  _o.position.set(p.x, 0.05 + dHead * 0.0002, p.z); _o.rotation.set(0, rr(0, 6), 0); _o.scale.set(s * rr(0.8, 1.3), 1, s * rr(0.6, 1)); _o.updateMatrix();
  decals.setMatrixAt(dHead, _o.matrix); decals.setColorAt(dHead, _c.setHex(color)); dHead = (dHead + 1) % DN;
  decals.instanceMatrix.needsUpdate = true; decals.instanceColor.needsUpdate = true;
}
// burrow dirt mounds
const MN = 260;
const mounds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M(0x7a3a20), MN);
mounds.frustumCulled = false; mounds.castShadow = true; scene.add(mounds);
const moundT = new Float32Array(MN), moundP = new Float32Array(MN * 3), moundS = new Float32Array(MN);
let mHead = 0;
function mound(p, s = 0.7) { moundT[mHead] = 5; moundS[mHead] = s * rr(0.8, 1.2); moundP.set([p.x, 0, p.z], mHead * 3); mHead = (mHead + 1) % MN; }
function updateMounds(dt) {
  for (let i = 0; i < MN; i++) {
    if (moundT[i] > 0) moundT[i] -= dt;
    const k = Math.max(0, Math.min(1, moundT[i] / 2)) * moundS[i];
    _o.position.set(moundP[i * 3], 0, moundP[i * 3 + 2]); _o.rotation.set(0, 0, 0); _o.scale.set(k, k * 0.5, k); _o.updateMatrix(); mounds.setMatrixAt(i, _o.matrix);
  }
  mounds.instanceMatrix.needsUpdate = true;
}

// ================= audio =================
let actx = null, muted = false, noiseBuf = null, master = null;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.6; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = actx.createGain(); g.gain.value = 0.05; src.connect(lp).connect(g).connect(master); src.start();
  } catch (e) { actx = null; }
}
const lastSnd = {};
function canPlay(key, gap) { if (!actx || muted) return false; const t = actx.currentTime; if (t - (lastSnd[key] || 0) < gap) return false; lastSnd[key] = t; return true; }
function noise(dur, type, freq, vol, q = 1) {
  const t = actx.currentTime, n = actx.createBufferSource(); n.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f).connect(g).connect(master); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.02);
}
function tone(type, f0, f1, dur, vol) {
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  rifle: () => { if (canPlay('rifle', 0.03)) { noise(0.09, 'bandpass', 1800, 0.5, 0.8); tone('square', 180, 60, 0.06, 0.12); } },
  squad: (v) => { if (canPlay('squad', 0.07)) noise(0.06, 'bandpass', 2400, 0.08 * v, 1); },
  turret: () => { if (canPlay('turret', 0.09)) noise(0.05, 'bandpass', 1300, 0.12, 1); },
  boom: (v = 1) => { if (canPlay('boom', 0.05)) { noise(0.9, 'lowpass', 400, 0.9 * v, 0.7); tone('sine', 90, 30, 0.6, 0.6 * v); } },
  chitter: (v) => { if (canPlay('chit', 0.12)) { const f = 2600 + Math.random() * 1600; tone('square', f, f * 0.7, 0.05, 0.05 * v); setTimeout(() => actx && tone('square', f * 1.1, f * 0.8, 0.04, 0.04 * v), 60); } },
  squish: () => { if (canPlay('squish', 0.05)) noise(0.12, 'lowpass', 900, 0.25, 2); },
  acid: () => { if (canPlay('acid', 0.1)) noise(0.25, 'highpass', 1500, 0.12, 1); },
  reload: () => { if (canPlay('reload', 0.2)) { tone('square', 900, 700, 0.03, 0.08); setTimeout(() => actx && tone('square', 1200, 900, 0.04, 0.08), 900); } },
  hurt: () => { if (canPlay('hurt', 0.25)) tone('sawtooth', 220, 110, 0.18, 0.15); },
  click: () => { if (canPlay('click', 0.15)) tone('square', 1500, 1400, 0.02, 0.06); },
  siren: () => { if (!actx || muted) return; const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = 'sawtooth';
    for (let k = 0; k < 3; k++) { o.frequency.setValueAtTime(520, t + k * 0.7); o.frequency.linearRampToValueAtTime(880, t + k * 0.7 + 0.5); }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.1); g.gain.setValueAtTime(0.09, t + 1.9); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + 2.3); },
  thud: () => { if (canPlay('thud', 0.1)) { tone('sine', 120, 40, 0.4, 0.5); noise(0.4, 'lowpass', 300, 0.4); } },
  engine: () => { if (canPlay('engine', 1)) { noise(1.8, 'bandpass', 600, 0.3, 0.6); tone('sawtooth', 70, 110, 1.6, 0.08); } },
};

// ================= game state =================
const EVAC_T = 480, DESCENT_T = 60;
const G = { state: 'title', time: 0, cp: 10, kills: 0, wave: 0, towerHp: 4000, towerMax: 4000, selected: 0, callMode: null,
  cds: { reinforce: 0, supply: 0, strike: 0 }, msgs: {}, nextWaveT: 4, firing: false, lost: 0, cpEarned: 0 };
const TOWER = { isTower: true, pos: new THREE.Vector3(0, 0, 0), alive: true };
const CALLINS = {
  reinforce: { name: 'Reinforce pod', cost: 15, cd: 25 },
  supply: { name: 'Supply pod + turret', cost: 20, cd: 30 },
  strike: { name: 'Air strike', cost: 30, cd: 40 },
};
let toastT = 0;
function toast(msg, dur = 2.6) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; toastT = dur; }

// ================= navigation / collision =================
function crossAngle(p, t) {
  const dx = t.x - p.x, dz = t.z - p.z, a = dx * dx + dz * dz, b = 2 * (p.x * dx + p.z * dz), c = p.x * p.x + p.z * p.z - R_WALL * R_WALL;
  const disc = b * b - 4 * a * c; if (disc < 0 || a < 1e-6) return Math.atan2(p.z, p.x);
  const sq = Math.sqrt(disc); let s = (-b - sq) / (2 * a); if (s < 0 || s > 1) s = (-b + sq) / (2 * a); s = clamp(s, 0, 1);
  return Math.atan2(p.z + dz * s, p.x + dx * s);
}
function navTarget(p, t, out) {
  const rp = Math.hypot(p.x, p.z), rt = Math.hypot(t.x, t.z);
  const outside = rp > R_WALL;
  const crossing = (outside && rt < R_WALL - 0.3) || (!outside && rt > R_WALL + 0.3);
  if (crossing && inGap(crossAngle(p, t), 0.04) === null) {
    const ap = Math.atan2(p.z, p.x);
    let best = ENTR[0], bd = 9; for (const e of ENTR) { const d = Math.abs(angDiff(e, ap)); if (d < bd) { bd = d; best = e; } }
    const da = angDiff(best, ap);
    const ring = outside ? Math.max(rp, R_WALL + 4) : Math.min(rp, R_WALL - 4);
    if (Math.abs(da) > 0.4) { const a2 = ap + Math.sign(da) * 0.35; return out.set(Math.cos(a2) * ring, 0, Math.sin(a2) * ring); }
    const mouth = outside ? R_WALL + 3 : R_WALL - 3, mx = Math.cos(best) * mouth, mz = Math.sin(best) * mouth;
    if ((p.x - mx) ** 2 + (p.z - mz) ** 2 < 6) { const o = outside ? R_WALL - 4 : R_WALL + 4; return out.set(Math.cos(best) * o, 0, Math.sin(best) * o); }
    return out.set(mx, 0, mz);
  }
  return out.set(t.x, 0, t.z);
}
function collide(p, r, bound = BOUND) {
  let d = Math.hypot(p.x, p.z);
  if (d > bound) { p.x *= bound / d; p.z *= bound / d; d = bound; }
  if (Math.abs(d - R_WALL) < 0.6 + r && inGap(Math.atan2(p.z, p.x), r / R_WALL) === null) {
    const nd = d < R_WALL ? R_WALL - 0.6 - r : R_WALL + 0.6 + r; p.x *= nd / d; p.z *= nd / d; d = nd;
  }
  if (d < TOWER_R + r) { const k = (TOWER_R + r) / (d || 1); p.x *= k; p.z *= k; }
  for (const c of circles) {
    const dx = p.x - c.x, dz = p.z - c.z, dd = Math.hypot(dx, dz), m = c.r + r;
    if (dd < m && dd > 1e-4) { p.x = c.x + (dx / dd) * m; p.z = c.z + (dz / dd) * m; }
  }
}

// ================= troopers & player =================
const TG = {
  legs: new THREE.CylinderGeometry(0.2, 0.24, 0.8, 8).translate(0, 0.4, 0),
  torso: new THREE.BoxGeometry(0.62, 0.66, 0.4).translate(0, 1.13, 0),
  pad: new THREE.BoxGeometry(0.24, 0.2, 0.44),
  helm: new THREE.SphereGeometry(0.23, 12, 8).scale(1, 0.92, 1.1).translate(0, 1.66, 0),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.06).translate(0, 1.67, 0.23),
  rifle: new THREE.BoxGeometry(0.08, 0.11, 0.85).translate(0.26, 1.15, 0.38),
  ring: new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2),
  disc: new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2),
};
const TEAL = M(0x2fb3a6), TEAL_D = M(0x1b6f68), VISOR = new THREE.MeshBasicMaterial({ color: 0x9ff8ff }), GUN = M(0x2a2e33);
function trooperMesh(shoulder) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  add(TG.legs, TEAL_D); add(TG.torso, TEAL); add(TG.helm, TEAL); add(TG.visor, VISOR); add(TG.rifle, GUN);
  for (const s of [-1, 1]) { const p = add(TG.pad, M(shoulder)); p.position.set(s * 0.42, 1.42, 0); }
  const disc = new THREE.Mesh(TG.disc, new THREE.MeshBasicMaterial({ color: shoulder, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
  disc.position.y = 0.06; disc.visible = false; g.add(disc);
  const ring = new THREE.Mesh(TG.ring, new THREE.MeshBasicMaterial({ color: 0x9ff8ff, fog: false, depthWrite: false }));
  ring.position.y = 0.08; ring.visible = false; g.add(ring);
  scene.add(g); return { g, disc, ring };
}
const squads = [
  { id: 0, name: 'Alpha', color: 0xe0452e, css: '#e0452e' },
  { id: 1, name: 'Bravo', color: 0xf0c030, css: '#f0c030' },
  { id: 2, name: 'Charlie', color: 0xb070ff, css: '#b070ff' },
];
const SQN = 6;
const troopers = [];
function makeTrooper(sq, slot, x, z) {
  const { g, disc, ring } = trooperMesh(sq.color);
  g.position.set(x, 0, z);
  const t = { squad: sq, slot, pos: g.position, face: Math.atan2(x, z), hp: 100, maxHp: 100, alive: true, dead: 0, fire: rnd() * 0.5, target: null, retgt: rnd() * 0.3, mesh: g, disc, ring, walk: 0, moving: false };
  troopers.push(t); sq.units.push(t); return t;
}
for (const sq of squads) {
  sq.units = []; sq.order = 'hold';
  const e = ENTR[sq.id];
  sq.point = new THREE.Vector3(Math.cos(e) * 15, 0, Math.sin(e) * 15);
  for (let i = 0; i < SQN; i++) { const o = slotOffset(i, new THREE.Vector3()); makeTrooper(sq, i, sq.point.x + o.x, sq.point.z + o.z); }
  const mk = new THREE.Group();
  mk.add(new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: sq.color, transparent: true, opacity: 0.9, fog: false, depthWrite: false, side: THREE.DoubleSide })));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 4), new THREE.MeshBasicMaterial({ color: sq.color, fog: false })); cone.rotation.x = Math.PI; cone.position.y = 2.4; mk.add(cone);
  mk.visible = false; scene.add(mk); sq.marker = mk; sq.cone = cone;
  sq.label = numberSprite(sq.id + 1, sq.css);
}
function slotOffset(i, out) { const col = i % 3, row = Math.floor(i / 3); return out.set((col - 1) * 1.7, 0, (row - 0.5) * 1.7); }
function numberSprite(n, css) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = css; x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2); x.fill(); x.lineWidth = 8; x.strokeStyle = '#e6fffb'; x.stroke();
  x.fillStyle = '#10161c'; x.font = 'bold 74px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 68);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthTest: false, transparent: true }));
  s.renderOrder = 10; s.visible = false; scene.add(s); return s;
}

const player = { isPlayer: true, pos: new THREE.Vector3(0, 0, 9), hp: 100, maxHp: 100, alive: true, respawns: 1, mag: 32, reserve: 300, reload: 0, fireCd: 0, grenades: 3, lastHit: -99, dead: 0, face: 0, sprint: false };
const playerBody = trooperMesh(0xf4f8f8);
const MAG = 32, RES_MAX = 300;
let yaw = Math.PI, pitch = -0.05;

// ================= bugs =================
const SHELL = 0x3a1650, LEGC = 0x120818, GLOW = 0x7dff4a;
const SPH = new THREE.SphereGeometry(1, 12, 8), BOXG = new THREE.BoxGeometry(1, 1, 1);
const P = (geo, color, pos, scl, opt = {}) => ({ geo, color, basic: !!opt.basic, body: !!opt.body, leg: opt.leg || 0,
  local: new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(opt.rx || 0, opt.ry || 0, 0)), new THREE.Vector3(...scl)) });
const BT = {
  skit: { name: 'Skitterer', hp: 36, speed: 7.6, dmg: 5, cd: 0.9, r: 0.45, scale: 0.85, cap: 150, cp: 1, aggro: 11, weak: [0, 0.6, -0.35], weakR: 0.2,
    parts: [P(SPH, SHELL, [0, 0.42, 0], [0.36, 0.26, 0.55], { body: 1 }), P(SPH, LEGC, [0, 0.42, 0.55], [0.2, 0.18, 0.22]),
      P(BOXG, LEGC, [0, 0.28, 0.15], [1.4, 0.05, 0.07], { ry: 0.35, leg: 1 }), P(BOXG, LEGC, [0, 0.28, -0.15], [1.4, 0.05, 0.07], { ry: -0.35, leg: -1 }),
      P(SPH, GLOW, [0, 0.6, -0.35], [0.14, 0.1, 0.17], { basic: 1 })] },
  spitter: { name: 'Spitter', hp: 120, speed: 3.6, dmg: 0, cd: 3.0, r: 0.8, scale: 1.5, cap: 30, cp: 4, aggro: 30, range: 30, weak: [0, 1.05, -0.5], weakR: 0.42,
    parts: [P(SPH, SHELL, [0, 0.62, 0.1], [0.45, 0.36, 0.55], { body: 1 }), P(SPH, LEGC, [0, 0.7, 0.62], [0.22, 0.22, 0.25]),
      P(BOXG, LEGC, [0, 0.4, 0.15], [1.6, 0.06, 0.08], { ry: 0.4, leg: 1 }), P(BOXG, LEGC, [0, 0.4, -0.1], [1.6, 0.06, 0.08], { ry: -0.4, leg: -1 }),
      P(SPH, GLOW, [0, 1.05, -0.5], [0.4, 0.5, 0.4], { basic: 1 })] },
  burrower: { name: 'Burrower', hp: 140, speed: 5.2, dmg: 12, cd: 1.1, r: 0.75, scale: 1.3, cap: 30, cp: 5, aggro: 13, weak: [0, 0.62, 0.15], weakR: 0.3,
    parts: [P(SPH, SHELL, [0, 0.38, -0.1], [0.36, 0.32, 1.0], { body: 1 }), P(SPH, LEGC, [0, 0.4, 0.95], [0.3, 0.26, 0.3]),
      P(BOXG, LEGC, [0, 0.25, 0.4], [1.3, 0.06, 0.08], { ry: 0.3, leg: 1 }), P(BOXG, LEGC, [0, 0.25, -0.4], [1.3, 0.06, 0.08], { ry: -0.3, leg: -1 }),
      P(SPH, GLOW, [0, 0.62, 0.15], [0.16, 0.1, 0.4], { basic: 1 })] },
  brute: { name: 'Carapace Brute', hp: 1700, speed: 2.5, dmg: 70, cd: 2.2, r: 2.1, scale: 3.1, cap: 6, cp: 30, aggro: 7, weak: [0, 1.0, -0.7], weakR: 0.3,
    parts: [P(SPH, SHELL, [0, 0.6, -0.1], [0.6, 0.45, 0.8], { body: 1 }), P(BOXG, 0x4a2a5e, [0, 0.72, 0.68], [1.5, 1.0, 0.22], { rx: -0.35 }),
      P(BOXG, LEGC, [0, 0.35, 0.25], [1.7, 0.1, 0.12], { ry: 0.35, leg: 1 }), P(BOXG, LEGC, [0, 0.35, -0.3], [1.7, 0.1, 0.12], { ry: -0.35, leg: -1 }),
      P(SPH, GLOW, [0, 1.0, -0.7], [0.3, 0.22, 0.25], { basic: 1 })] },
};
const bugs = [];
for (const [key, T] of Object.entries(BT)) {
  T.key = key; T.inst = T.parts.map((p) => {
    const mat = p.basic ? new THREE.MeshBasicMaterial({ color: p.color }) : new THREE.MeshLambertMaterial({ color: p.body ? 0xffffff : p.color });
    const im = new THREE.InstancedMesh(p.geo, mat, T.cap); im.frustumCulled = false; im.castShadow = !p.basic;
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < T.cap; i++) { im.setMatrixAt(i, z); if (p.body) im.setColorAt(i, _c.setHex(SHELL)); }
    scene.add(im); return im;
  });
  T.pool = [];
  for (let i = 0; i < T.cap; i++) T.pool.push({ T, slot: i, alive: false, dying: 0, used: false, pos: new THREE.Vector3(), face: 0, hp: 0, target: null, retgt: 0, atk: 0, under: false, surf: new THREE.Vector3(), trail: 0, flash: 0, phase: rnd() * 6 });
}
let bugCount = 0;
function spawnBug(key, x, z, opts = {}) {
  const T = BT[key]; const b = T.pool.find((o) => !o.alive && o.dying <= 0);
  if (!b || bugCount >= 150) return null;
  b.alive = true; b.used = true; b.dying = 0; b.hp = T.hp; b.pos.set(x, 0, z); b.face = Math.atan2(-x, -z); b.target = null; b.retgt = 0; b.atk = rnd(); b.flash = 0;
  b.under = !!opts.under; if (opts.surf) b.surf.copy(opts.surf);
  bugs.push(b); bugCount++; return b;
}
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function weakWorld(b, out) {
  const T = b.T, s = T.scale, c = Math.cos(b.face), sn = Math.sin(b.face);
  const lx = T.weak[0] * s, ly = T.weak[1] * s, lz = T.weak[2] * s;
  return out.set(b.pos.x + lx * c + lz * sn, ly, b.pos.z - lx * sn + lz * c);
}
const bugMarks = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3aa0, transparent: true, opacity: 0.8, depthWrite: false, fog: false }), 240);
bugMarks.frustumCulled = false; bugMarks.renderOrder = 2; scene.add(bugMarks);
let camE = 0;
function renderBugs(dt) {
  let mk = 0;
  if (camE > 0.15) for (const b of bugs) {
    if (!b.alive || mk >= 240) continue;
    const s = b.under ? 0.6 : b.T.r * 1.3 + 0.35; _m.compose(_v.set(b.pos.x, 0.09, b.pos.z), _q.identity(), _s.set(s, 1, s)); bugMarks.setMatrixAt(mk++, _m);
  }
  bugMarks.count = mk; bugMarks.instanceMatrix.needsUpdate = true;
  for (const T of Object.values(BT)) {
    let dirtyC = false;
    for (const b of T.pool) {
      if (!b.used) continue;
      if (!b.alive && b.dying <= 0) {
        _m.makeScale(0, 0, 0); for (const im of T.inst) im.setMatrixAt(b.slot, _m); b.used = false; continue;
      }
      if (b.under) { _m.makeScale(0, 0, 0); for (const im of T.inst) im.setMatrixAt(b.slot, _m); continue; }
      b.phase += dt * (b.moving ? 14 : 3);
      let sy = 1, sink = 0;
      if (!b.alive) { b.dying -= dt; const k = 1 - Math.max(0, b.dying) / 0.6; sy = 1 - k * 0.8; sink = -k * 0.2; }
      const bob = b.moving ? Math.abs(Math.sin(b.phase)) * 0.05 * T.scale : 0;
      _q.setFromEuler(_e.set(0, b.face, b.alive ? 0 : 0.4));
      _m.compose(_v.set(b.pos.x, bob + sink, b.pos.z), _q, _s.set(T.scale, T.scale * sy, T.scale));
      T.parts.forEach((p, k) => {
        if (p.leg) { _m2.makeRotationY(Math.sin(b.phase) * 0.35 * p.leg).premultiply(p.local); _m2.premultiply(_m); }
        else _m2.multiplyMatrices(_m, p.local);
        T.inst[k].setMatrixAt(b.slot, _m2);
        if (p.body) { T.inst[k].setColorAt(b.slot, _c.setHex(b.flash > 0 ? 0xffffff : (b.alive ? SHELL : 0x1a0a14))); dirtyC = true; }
      });
      if (b.flash > 0) b.flash -= dt;
    }
    for (const im of T.inst) { im.instanceMatrix.needsUpdate = true; if (dirtyC && im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
}

// ================= combat helpers =================
const friendlies = () => { const a = troopers.filter((t) => t.alive); if (player.alive) a.push(player); return a; };
function nearestBug(p, maxD) {
  let best = null, bd = maxD * maxD;
  for (const b of bugs) { if (!b.alive || b.under) continue; const d = d2(b.pos, p); if (d < bd) { bd = d; best = b; } }
  return best;
}
function damageBug(b, amt, src, kind) {
  if (!b.alive || b.under) return 0;
  let mult = 1;
  if (b.T.key === 'brute') {
    if (kind === 'air') mult = 3;
    else if (src) {
      const fx = Math.sin(b.face), fz = Math.cos(b.face), dx = src.x - b.pos.x, dz = src.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
      const dot = (dx * fx + dz * fz) / l; mult = dot > 0.35 ? 0.15 : dot < -0.35 ? 2.2 : 0.7;
    }
  }
  b.hp -= amt * mult; b.flash = 0.07;
  if (b.hp <= 0) killBug(b);
  return mult;
}
function killBug(b) {
  b.alive = false; b.dying = 0.6; bugCount--; G.kills++; G.cp += b.T.cp; G.cpEarned += b.T.cp;
  const s = b.T.scale;
  decal(b.pos, 0.5 * s + 0.4, rnd() < 0.5 ? 0x3c8a22 : 0x3a1a4a);
  burst(_v.set(b.pos.x, 0.5 * s, b.pos.z), 8 + s * 6, 0x7dff4a, 4 + s, 4, 0.6);
  burst(_v, 4 + s * 3, 0x3a1a4a, 3 + s, 3, 0.6);
  if (d2(b.pos, player.pos) < 1600) sfx.squish();
  if (b.T.key === 'brute') { sfx.boom(0.5); toast('Brute down!', 1.6); }
}
function damageFriend(u, amt) {
  if (u.isTower) {
    if (G.towerHp <= 0) return;
    G.towerHp -= amt;
    if (rnd() < 0.3) burst(_v.set(rr(-1, 1), rr(1, 5), rr(-1, 1)), 3, 0xffd080, 4, 3, 0.4);
    if (!G.msgs.tower && G.towerHp < G.towerMax * 0.5) { G.msgs.tower = 1; toast('Uplink tower at half strength!'); }
    return;
  }
  if (!u.alive) return;
  u.hp -= amt;
  if (u.isPlayer) { player.lastHit = G.time; $('flash').style.opacity = 1; setTimeout(() => ($('flash').style.opacity = 0), 140); sfx.hurt(); }
  if (u.hp <= 0) {
    u.hp = 0; u.alive = false;
    if (u.isPlayer) playerDown(); else { u.dead = 0; u.ring.visible = false; u.disc.visible = false; G.lost++; }
  }
}
function explode(p, radius, dmg, kind, ff = 0.5) {
  for (const b of bugs) {
    if (!b.alive || b.under) continue; const d = Math.sqrt(d2(b.pos, p)) - b.T.r;
    if (d < radius) damageBug(b, dmg * (1 - 0.5 * Math.max(0, d) / radius), p, kind);
  }
  for (const u of friendlies()) { const d = Math.sqrt(d2(u.pos, p)); if (d < radius) damageFriend(u, dmg * ff * (1 - d / radius)); }
  flash(_v.set(p.x, 1, p.z), radius * 0.8);
  burst(_v.set(p.x, 0.4, p.z), 26, 0xffa040, radius * 1.4, 7, 0.6);
  burst(_v, 14, 0x4a4040, radius * 0.7, 4, 1.4, 2, 1);
  decal(p, radius * 0.45, 0x1c120e);
  const near = Math.sqrt(d2(p, player.pos)); sfx.boom(clamp(1.2 - near / 80, 0.15, 1));
  if (near < 25) shake = Math.max(shake, 0.4 * (1 - near / 25));
}
let shake = 0;

// ================= bugs AI =================
const _w = new THREE.Vector3();
function pickBugTarget(b, fr) {
  const T = b.T; let best = null, bd = T.aggro * T.aggro;
  for (const u of fr) {
    const d = d2(u.pos, b.pos); if (d >= bd) continue;
    if (T.key === 'brute') { const fx = Math.sin(b.face), fz = Math.cos(b.face); if ((u.pos.x - b.pos.x) * fx + (u.pos.z - b.pos.z) * fz < 0) continue; }
    bd = d; best = u;
  }
  return best || TOWER;
}
function turn(a, b, k) { return a + angDiff(b, a) * Math.min(1, k); }
function moveBug(b, tp, dt) {
  navTarget(b.pos, tp, _w);
  const dx = _w.x - b.pos.x, dz = _w.z - b.pos.z, d = Math.hypot(dx, dz) || 1, m = Math.min(d, b.T.speed * dt);
  b.pos.x += (dx / d) * m; b.pos.z += (dz / d) * m; b.face = turn(b.face, Math.atan2(dx, dz), dt * 8); b.moving = true;
}
function updateBugs(dt) {
  const fr = friendlies();
  for (const b of bugs) {
    if (!b.alive) continue;
    const T = b.T; b.moving = false;
    if (b.under) {
      const dx = b.surf.x - b.pos.x, dz = b.surf.z - b.pos.z, d = Math.hypot(dx, dz) || 1, m = Math.min(d, T.speed * dt);
      b.pos.x += (dx / d) * m; b.pos.z += (dz / d) * m; b.face = Math.atan2(dx, dz);
      b.trail += m; if (b.trail > 0.6) { b.trail = 0; mound(b.pos, 0.75); if (rnd() < 0.5) burst(_v.set(b.pos.x, 0.2, b.pos.z), 2, 0x8a4a28, 1.5, 2.5, 0.5); }
      if (d < 0.35) {
        b.under = false; mound(b.pos, 1.7); burst(_v.set(b.pos.x, 0.3, b.pos.z), 30, 0x9a5a30, 5, 6, 0.9);
        if (d2(b.pos, player.pos) < 2500) sfx.thud();
        if (!G.msgs.surf) { G.msgs.surf = 1; toast('Burrowers surfacing inside the walls!'); }
      }
      continue;
    }
    b.atk -= dt; b.retgt -= dt;
    if (b.retgt <= 0 || (b.target && !b.target.isTower && !b.target.alive)) { b.retgt = 0.35 + rnd() * 0.25; b.target = pickBugTarget(b, fr); }
    const tg = b.target || TOWER, tp = tg.pos;
    const dx = tp.x - b.pos.x, dz = tp.z - b.pos.z, d = Math.hypot(dx, dz);
    if (T.key === 'spitter') {
      const want = tg.isTower ? T.range * 0.85 : T.range * 0.8;
      if (d > want) moveBug(b, tp, dt);
      else { b.face = turn(b.face, Math.atan2(dx, dz), dt * 5); if (b.atk <= 0) { b.atk = T.cd * (0.8 + rnd() * 0.4); spit(b, tg); } }
    } else {
      const reach = T.r + (tg.isTower ? TOWER_R : 0.4) + 0.5;
      if (d > reach) moveBug(b, tp, dt);
      else {
        b.face = turn(b.face, Math.atan2(dx, dz), dt * 6);
        if (b.atk <= 0) { b.atk = T.cd * (0.8 + rnd() * 0.4); damageFriend(tg, T.dmg * (0.8 + rnd() * 0.4)); if (T.key === 'brute') { shake = Math.max(shake, d2(b.pos, player.pos) < 400 ? 0.3 : 0); sfx.thud(); } }
      }
    }
    if (b.moving && T.key === 'skit' && rnd() < 0.02) { const nd = d2(b.pos, player.pos); if (nd < 900) sfx.chitter(1 - nd / 900); }
  }
  // separation between bugs (and friendlies pushing through)
  const n = bugs.length;
  for (let i = 0; i < n; i++) {
    const a = bugs[i]; if (!a.alive || a.under) continue;
    for (let j = i + 1; j < n; j++) {
      const c = bugs[j]; if (!c.alive || c.under) continue;
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z, m = (a.T.r + c.T.r) * 0.85, dd = dx * dx + dz * dz;
      if (dd < m * m && dd > 1e-6) {
        const d = Math.sqrt(dd), push = (m - d) * 0.5, nx = dx / d, nz = dz / d;
        const wa = a.T.key === 'brute' ? 0.1 : 1, wc = c.T.key === 'brute' ? 0.1 : 1;
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa; c.pos.x += nx * push * wc; c.pos.z += nz * push * wc;
      }
    }
    for (const u of fr) {
      const dx = u.pos.x - a.pos.x, dz = u.pos.z - a.pos.z, m = a.T.r + 0.4, dd = dx * dx + dz * dz;
      if (dd < m * m && dd > 1e-6) { const d = Math.sqrt(dd), push = m - d; a.pos.x -= (dx / d) * push * 0.7; a.pos.z -= (dz / d) * push * 0.7; u.pos.x += (dx / d) * push * 0.3; u.pos.z += (dz / d) * push * 0.3; }
    }
    collide(a.pos, a.T.r * 0.8, 140);
  }
  // compact list
  let k = 0; for (const b of bugs) if (b.alive) bugs[k++] = b; bugs.length = k;
}

// acid
const acids = [], puddles = [];
const acidGeo = new THREE.SphereGeometry(0.3, 8, 6), acidMat = new THREE.MeshBasicMaterial({ color: 0x9dff3a });
function spit(b, tg) {
  const from = new THREE.Vector3(b.pos.x, 1.6 * b.T.scale * 0.7, b.pos.z);
  const to = new THREE.Vector3(tg.pos.x + rr(-1.2, 1.2), 0, tg.pos.z + rr(-1.2, 1.2));
  if (tg.isTower) { const a = Math.atan2(b.pos.z, b.pos.x); to.set(Math.cos(a) * (TOWER_R + 0.5), 0, Math.sin(a) * (TOWER_R + 0.5)); }
  let a = acids.find((o) => !o.active);
  if (!a) { a = { m: new THREE.Mesh(acidGeo, acidMat) }; scene.add(a.m); acids.push(a); }
  const dist = Math.sqrt(d2(from, to));
  Object.assign(a, { active: true, from, to, t: 0, dur: 0.9 + dist / 30, h: 3 + dist * 0.25, tower: tg.isTower }); a.m.visible = true;
  if (d2(b.pos, player.pos) < 1600) sfx.acid();
}
const puddleGeo = new THREE.CircleGeometry(2.2, 16).rotateX(-Math.PI / 2);
function updateAcid(dt) {
  for (const a of acids) {
    if (!a.active) continue;
    a.t += dt; const k = Math.min(1, a.t / a.dur);
    a.m.position.lerpVectors(a.from, a.to, k); a.m.position.y = lerp(a.from.y, 0.2, k) + Math.sin(k * Math.PI) * a.h;
    if (rnd() < 0.5) burst(a.m.position, 1, 0x9dff3a, 0.3, 0, 0.3, 2, 0.05);
    if (k >= 1) {
      a.active = false; a.m.visible = false;
      burst(_v.set(a.to.x, 0.3, a.to.z), 14, 0x9dff3a, 3, 3, 0.5);
      if (a.tower) damageFriend(TOWER, 30);
      for (const u of friendlies()) if (d2(u.pos, a.to) < 4) damageFriend(u, 14);
      let p = puddles.find((o) => o.t <= 0);
      if (!p) { p = { m: new THREE.Mesh(puddleGeo, new THREE.MeshBasicMaterial({ color: 0x7dff2a, transparent: true, opacity: 0.6, depthWrite: false })), t: 0, pos: new THREE.Vector3() }; scene.add(p.m); puddles.push(p); }
      p.t = 6; p.pos.copy(a.to); p.m.position.set(a.to.x, 0.07, a.to.z); p.m.visible = true;
    }
  }
  for (const p of puddles) {
    if (p.t <= 0) continue; p.t -= dt;
    p.m.material.opacity = 0.6 * Math.min(1, p.t / 1.5); p.m.scale.setScalar(0.7 + 0.3 * Math.min(1, (6 - p.t) * 3));
    if (p.t <= 0) { p.m.visible = false; continue; }
    for (const u of friendlies()) if (d2(u.pos, p.pos) < 4.4) damageFriend(u, 12 * dt);
    if (rnd() < 0.15) burst(_v.set(p.pos.x + rr(-1.5, 1.5), 0.1, p.pos.z + rr(-1.5, 1.5)), 1, 0xb0ff60, 0.2, 1.2, 0.5, 0);
  }
}

// ================= troopers AI =================
const T_RANGE = 26;
function centroid(sq, out) { out.set(0, 0, 0); let n = 0; for (const u of sq.units) if (u.alive) { out.add(u.pos); n++; } return n ? out.multiplyScalar(1 / n) : null; }
function desired(t, out) {
  const sq = t.squad;
  if (sq.order === 'follow') {
    const col = t.slot % 3, row = Math.floor(t.slot / 3);
    const lx = (sq.id - 1) * 5.5 + (col - 1) * 1.6, lz = -3 - row * 1.6 - (sq.id === 1 ? 2.5 : 0);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return out.set(player.pos.x + s * lz - c * lx, 0, player.pos.z + c * lz + s * lx);
  }
  slotOffset(t.slot, out); return out.add(sq.point);
}
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
function gunTip(u, out) { const c = Math.cos(u.face), s = Math.sin(u.face); return out.set(u.pos.x + 0.26 * c + 0.85 * s, 1.18, u.pos.z - 0.26 * s + 0.85 * c); }
function updateTroopers(dt) {
  for (const sq of squads) if (sq.order === 'charge') { const c = centroid(sq, _t1); const e = c && nearestBug(c, 999); if (e) sq.point.copy(e.pos); }
  for (const t of troopers) {
    if (!t.alive) { t.dead += dt; continue; }
    t.fire -= dt; t.retgt -= dt;
    if (t.retgt <= 0 || (t.target && (!t.target.alive || t.target.under))) { t.retgt = 0.3 + rnd() * 0.2; t.target = nearestBug(t.pos, T_RANGE); }
    const sq = t.squad;
    let dest = desired(t, _t1);
    if (sq.order === 'charge' && t.target) dest = Math.sqrt(d2(t.target.pos, t.pos)) > 11 ? _t1.copy(t.target.pos) : _t1.copy(t.pos);
    navTarget(t.pos, dest, _t2);
    const dx = _t2.x - t.pos.x, dz = _t2.z - t.pos.z, d = Math.hypot(dx, dz);
    t.moving = d > 0.3;
    if (t.moving) { const sp = sq.order === 'follow' && d > 5 ? 8 : 5.2, m = Math.min(d, sp * dt); t.pos.x += (dx / d) * m; t.pos.z += (dz / d) * m; }
    if (t.target) t.face = turn(t.face, Math.atan2(t.target.pos.x - t.pos.x, t.target.pos.z - t.pos.z), dt * 10);
    else if (t.moving) t.face = turn(t.face, Math.atan2(dx, dz), dt * 8);
    if (t.target && t.fire <= 0) {
      t.fire = 0.42 * (0.8 + rnd() * 0.4);
      const b = t.target, hit = rnd() < 0.62;
      gunTip(t, _t2); _v.set(b.pos.x + (hit ? 0 : rr(-1.5, 1.5)), b.T.scale * 0.45 + (hit ? 0 : rr(-0.5, 0.8)), b.pos.z + (hit ? 0 : rr(-1.5, 1.5)));
      tracer(_t2, _v, 0x80f0ff, 0.06);
      burst(_t2, 1, 0xfff0a0, 0.5, 0.5, 0.05, 0, 0.02);
      if (hit) damageBug(b, 9, t.pos, 'gun');
      const nd = d2(t.pos, player.pos); if (nd < 2500) sfx.squad(1 - nd / 2500);
    }
  }
  const fr = friendlies();
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const a = fr[i], c = fr[j], dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z, dd = dx * dx + dz * dz;
    if (dd < 0.81 && dd > 1e-6) { const d = Math.sqrt(dd), p = (0.9 - d) * 0.5, wa = a.isPlayer ? 0.2 : 1, wc = c.isPlayer ? 0.2 : 1; a.pos.x -= (dx / d) * p * wa; a.pos.z -= (dz / d) * p * wa; c.pos.x += (dx / d) * p * wc; c.pos.z += (dz / d) * p * wc; }
  }
  for (const t of troopers) if (t.alive) collide(t.pos, 0.4);
}
function setOrder(i, type, point) {
  const sq = squads[i]; if (!sq) return;
  if (!sq.units.some((u) => u.alive)) { toast(`${sq.name} squad is down. Reinforce with Z`); return; }
  sq.order = type;
  if (type === 'move' && point) sq.point.copy(point);
  if (type === 'hold') { const c = centroid(sq, _t1); if (c) sq.point.copy(c); }
  for (const u of sq.units) u.retgt = 0;
  toast(`${sq.name}: ${{ move: 'Moving', hold: 'Holding', charge: 'Charge!', follow: 'On you' }[type]}`, 1.4);
  sfx.click();
}
function selectSquad(i) {
  if (!squads[i]) return; G.selected = i;
  for (const sq of squads) for (const u of sq.units) u.ring.visible = sq.id === i && u.alive;
}

// ================= player =================
let camT = 0, camTarget = 0;
const keys = {};
const aimDir = (out, y = yaw, p = pitch) => out.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
const eye = (out) => out.set(player.pos.x, 1.65, player.pos.z);
// first-person viewmodel
const vm = new THREE.Group(); camera.add(vm); vm.position.set(0.24, -0.24, -0.5);
{
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); vm.add(m); return m; };
  add(new THREE.BoxGeometry(0.09, 0.12, 0.55), GUN, 0, 0, 0);
  add(new THREE.BoxGeometry(0.1, 0.08, 0.3), TEAL, 0, -0.02, -0.25);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6).rotateX(Math.PI / 2), GUN, 0, 0.02, -0.5);
  add(new THREE.BoxGeometry(0.05, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: 0x40e0d0 }), 0, 0.09, 0.05);
  add(new THREE.BoxGeometry(0.06, 0.16, 0.08), GUN, 0, -0.12, 0.05);
  add(new THREE.BoxGeometry(0.11, 0.1, 0.18), TEAL_D, 0.0, -0.06, 0.25);
}
const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
muzzle.position.set(0, 0.02, -0.72); muzzle.visible = false; vm.add(muzzle);
const muzzleLight = new THREE.PointLight(0xffb060, 0, 12, 2); muzzleLight.position.set(0, 0, -0.8); vm.add(muzzleLight);
let vmKick = 0, muzzleT = 0;

const _r0 = new THREE.Vector3(), _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3();
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc;
  if (h < 0) return -1; const t = -b - Math.sqrt(h); return t > 0 ? t : -1;
}
function shoot() {
  player.mag--; player.fireCd = 1 / 8.5;
  const spread = player.sprint ? 0.035 : 0.009;
  eye(_r0); aimDir(_r1, yaw + rr(-spread, spread), pitch + rr(-spread, spread));
  let best = null, bt = 140, crit = false;
  for (const b of bugs) {
    if (!b.alive || b.under) continue;
    const s = b.T.scale; _r2.set(b.pos.x, s * 0.45, b.pos.z);
    const t = raySphere(_r0, _r1, _r2, b.T.r * 1.1 + 0.12);
    if (t > 0 && t < bt) {
      bt = t; best = b;
      weakWorld(b, _r2); const w = raySphere(_r0, _r1, _r2, b.T.weakR * s * 1.4 + 0.08); crit = w > 0;
    }
  }
  if (!best && _r1.y < 0) bt = Math.min(bt, _r0.y / -_r1.y);
  const hitP = _v.copy(_r0).addScaledVector(_r1, bt);
  muzzle.getWorldPosition(_r2);
  if (camT < 0.05) tracer(_r2, hitP, 0xfff2b0, 0.05); else tracer(_t2.set(player.pos.x, 1.3, player.pos.z), hitP, 0xfff2b0, 0.05);
  if (best) {
    const m = damageBug(best, 24 * (crit ? 2 : 1), player.pos, 'gun');
    burst(hitP, crit ? 7 : 4, m < 0.5 ? 0xffe0a0 : 0x7dff4a, 3, 2, 0.3, 8, 0.05);
    const hm = $('hitm'); hm.style.borderColor = m < 0.5 ? '#888' : crit || m > 1.5 ? '#7dff4a' : '#fff'; hm.style.opacity = 1; setTimeout(() => (hm.style.opacity = 0), 80);
  } else if (_r1.y < 0 && bt < 139) burst(hitP, 3, 0xb06030, 2, 2, 0.4);
  muzzle.visible = true; muzzle.rotation.z = rnd() * 3; muzzleT = 0.04; muzzleLight.intensity = 30; vmKick = 1;
  pitch = Math.min(1.3, pitch + 0.004); yaw += rr(-0.002, 0.002);
  sfx.rifle();
}
function startReload() { if (player.reload > 0 || player.mag >= MAG || player.reserve <= 0) { if (player.reserve <= 0 && player.mag <= 0) toast('Out of ammo. Call a supply pod (X)', 1.6); return; } player.reload = 1.5; sfx.reload(); }
const grenades = []; const grenGeo = new THREE.SphereGeometry(0.12, 8, 6);
function throwGrenade() {
  if (!player.alive || player.grenades <= 0 || camTarget === 1) return;
  player.grenades--;
  const m = new THREE.Mesh(grenGeo, M(0x3a4a3a)); scene.add(m);
  aimDir(_r1); eye(_r0);
  grenades.push({ m, pos: _r0.clone().addScaledVector(_r1, 0.6), vel: new THREE.Vector3(_r1.x * 19, _r1.y * 19 + 5, _r1.z * 19), t: 1.7 });
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i]; g.vel.y -= 20 * dt; g.pos.addScaledVector(g.vel, dt);
    if (g.pos.y < 0.12) { g.pos.y = 0.12; g.vel.y *= -0.35; g.vel.x *= 0.6; g.vel.z *= 0.6; }
    g.m.position.copy(g.pos); g.t -= dt;
    if (g.t <= 0) { explode(g.pos, 6.5, 170, 'grenade', 0.4); scene.remove(g.m); grenades.splice(i, 1); }
  }
}
function updatePlayer(dt) {
  if (!player.alive) return;
  const inCmd = camTarget === 1;
  let fx = 0, fz = 0;
  if (!inCmd) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const sy = Math.sin(yaw), cy = Math.cos(yaw); fx = sy * f - cy * s; fz = cy * f + sy * s;
  }
  const l = Math.hypot(fx, fz); player.moving = l > 0;
  player.sprint = l > 0 && (keys.ShiftLeft || keys.ShiftRight);
  if (l > 0) { const sp = player.sprint ? 10 : 6.5; player.pos.x += (fx / l) * sp * dt; player.pos.z += (fz / l) * sp * dt; }
  collide(player.pos, 0.45);
  player.face = yaw;
  if (player.reload > 0) { player.reload -= dt; if (player.reload <= 0) { const take = Math.min(MAG - player.mag, player.reserve); player.mag += take; player.reserve -= take; } }
  player.fireCd -= dt;
  if (G.firing && !inCmd && player.fireCd <= 0 && player.reload <= 0) { if (player.mag > 0) shoot(); else startReload(); }
  if (G.time - player.lastHit > 5 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 6 * dt);
  for (const c of crates) if (!c.used && d2(c.pos, player.pos) < 9) {
    c.used = true; player.reserve = RES_MAX; player.grenades = 3; c.lid.material = M(0x555a60); toast('Ammo and grenades resupplied', 1.6); sfx.reload();
  }
}
function playerDown() {
  G.firing = false;
  if (player.respawns > 0) {
    player.respawns--; toast('Trooper down. Respawn pod inbound…', 3);
    if (camTarget === 0) toggleCommander(true);
    setTimeout(() => {
      if (G.state !== 'play') return;
      const p = PAD.clone().add(_v.set(rr(-2, 2), 0, rr(-2, 2)));
      dropPod(p, () => {
        Object.assign(player, { alive: true, hp: player.maxHp, mag: MAG, reserve: Math.max(player.reserve, 150), grenades: Math.max(player.grenades, 2), reload: 0, lastHit: G.time });
        player.pos.set(p.x + 1.5, 0, p.z);
        toast('Back in the fight. That was your only respawn.', 2.5);
        if (camTarget === 1) toggleCommander(true);
      });
    }, 1800);
  } else endGame(false, 'You were overrun. With no one left to hold the line, Relay 7 went dark.');
}

// ================= call-ins: pods, turrets, strikes =================
const pods = [];
const podGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.4, 10).translate(0, 1.2, 0), podNose = new THREE.ConeGeometry(0.9, 1.2, 10).rotateX(Math.PI).translate(0, -0.6, 0);
function dropPod(p, onLand) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(podGeo, M(0xd8dde2)); body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(podNose, M(0x40464e)); g.add(nose);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.3, 10).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: 0x40e0d0 })); g.add(stripe);
  scene.add(g);
  pods.push({ g, p: p.clone(), t: 0, dur: 1.5, onLand, landed: false, life: 25 });
  sfx.engine();
}
function updatePods(dt) {
  for (let i = pods.length - 1; i >= 0; i--) {
    const pd = pods[i]; pd.t += dt;
    if (!pd.landed) {
      const k = Math.min(1, pd.t / pd.dur), y = 140 * (1 - k) * (1 - k);
      pd.g.position.set(pd.p.x + (1 - k) * 25, Math.max(0, y), pd.p.z + (1 - k) * 12);
      burst(_v.set(pd.g.position.x, pd.g.position.y + 2.6, pd.g.position.z), 2, 0xffb060, 0.6, 1, 0.5, 0, 0.3);
      if (k >= 1) {
        pd.landed = true; pd.g.position.set(pd.p.x, 0, pd.p.z); pd.g.rotation.z = 0.08;
        burst(_v.set(pd.p.x, 0.3, pd.p.z), 40, 0xb87048, 7, 5, 1.0); flash(_v.set(pd.p.x, 0.5, pd.p.z), 3, 0xffd0a0); decal(pd.p, 2.2, 0x2a1a12); sfx.thud();
        for (const b of bugs) if (b.alive && !b.under && d2(b.pos, pd.p) < 9) damageBug(b, 400, pd.p, 'air');
        pd.onLand && pd.onLand();
      }
    } else { pd.life -= dt; if (pd.life <= 0) { scene.remove(pd.g); pods.splice(i, 1); } }
  }
}
const crates = [], turrets = [];
function spawnSupply(p) {
  const g = new THREE.Group(); g.position.set(p.x + 1.6, 0, p.z);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.9).translate(0, 0.4, 0), M(0x3a5a50)); box.castShadow = true; g.add(box);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.95).translate(0, 0.86, 0), M(0xd8a030)); g.add(lid);
  scene.add(g); crates.push({ pos: g.position, used: false, lid, g });
  const tg = new THREE.Group(); tg.position.set(p.x - 1.4, 0, p.z);
  tg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 1.1, 8).translate(0, 0.55, 0), M(0x50565e)));
  const head = new THREE.Group(); head.position.y = 1.25; tg.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.7), TEAL));
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9).translate(0, 0, 0.7), GUN); head.add(barrel);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05).translate(0, 0.12, 0.36), new THREE.MeshBasicMaterial({ color: 0xff4020 })));
  tg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(tg); turrets.push({ g: tg, head, pos: tg.position, t: 45, cd: 0, target: null });
  toast('Supply pod down: ammo crate and auto-turret (45s)', 2);
}
function updateTurrets(dt) {
  for (let i = turrets.length - 1; i >= 0; i--) {
    const tu = turrets[i]; tu.t -= dt; tu.cd -= dt;
    if (tu.t <= 0) { burst(_v.set(tu.pos.x, 1, tu.pos.z), 12, 0xffd080, 3, 3, 0.5); scene.remove(tu.g); turrets.splice(i, 1); continue; }
    if (!tu.target || !tu.target.alive || tu.target.under || d2(tu.target.pos, tu.pos) > 900) tu.target = nearestBug(tu.pos, 30);
    if (tu.target) {
      const a = Math.atan2(tu.target.pos.x - tu.pos.x, tu.target.pos.z - tu.pos.z); tu.head.rotation.y = turn(tu.head.rotation.y, a, dt * 12);
      if (tu.cd <= 0) {
        tu.cd = 0.12; const hit = rnd() < 0.8, b = tu.target;
        _t2.set(tu.pos.x + Math.sin(tu.head.rotation.y) * 1.1, 1.25, tu.pos.z + Math.cos(tu.head.rotation.y) * 1.1);
        _v.set(b.pos.x + (hit ? 0 : rr(-1, 1)), b.T.scale * 0.45, b.pos.z + (hit ? 0 : rr(-1, 1)));
        tracer(_t2, _v, 0xffa040, 0.05); if (hit) damageBug(b, 8, tu.pos, 'gun');
        if (d2(tu.pos, player.pos) < 2500) sfx.turret();
      }
    }
  }
}
// air strike
const strikes = [];
const stripGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const STRIKE_W = 5;
function stripMesh(color, op) { const m = new THREE.Mesh(stripGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, fog: false })); m.renderOrder = 3; scene.add(m); return m; }
function layStrip(m, a, b) { const dx = b.x - a.x, dz = b.z - a.z; m.position.set((a.x + b.x) / 2, 0.12, (a.z + b.z) / 2); m.rotation.y = Math.atan2(dx, dz); m.scale.set(STRIKE_W * 2, 1, Math.max(1, Math.hypot(dx, dz))); }
const strikePreview = stripMesh(0xff3020, 0.35); strikePreview.visible = false;
const gunship = new THREE.Group();
{
  const add = (geo, c, x, y, z) => { const m = new THREE.Mesh(geo, M(c)); m.position.set(x, y, z); m.castShadow = true; gunship.add(m); };
  add(new THREE.BoxGeometry(2.2, 1.6, 9), 0x4a5560, 0, 0, 0); add(new THREE.BoxGeometry(12, 0.3, 2.6), 0x3a444e, 0, 0.2, -0.5);
  add(new THREE.BoxGeometry(0.3, 2, 2), 0x3a444e, 0, 1.2, -4); add(new THREE.BoxGeometry(1.6, 0.8, 2), 0x9ff8ff, 0, 0.5, 3.6);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x60c0ff })); e.position.set(s * 4, 0, -1); gunship.add(e); }
  gunship.visible = false; scene.add(gunship);
}
function callStrike(a, b) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 6) { toast('Drag a longer line for the strike', 1.4); return false; }
  if (len > 50) { b = a.clone().add(_v.subVectors(b, a).setY(0).normalize().multiplyScalar(50)); }
  if (!pay('strike')) return false;
  const m = stripMesh(0xff2010, 0.45); layStrip(m, a, b);
  strikes.push({ a: a.clone(), b: b.clone(), t: 0, warn: 2, dur: 1.6, m, fired: new Set() });
  toast('Gunship inbound in 2s. Friendly fire is on!', 2);
  sfx.siren();
  return true;
}
function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i]; s.t += dt;
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    s.m.material.opacity = s.t < s.warn ? 0.25 + 0.25 * Math.abs(Math.sin(s.t * 10)) : 0.15;
    if (s.t >= s.warn) {
      const k = (s.t - s.warn) / s.dur, total = len + 60, along = k * total - 30;
      gunship.visible = k <= 1; gunship.position.set(s.a.x + ux * along, 24, s.a.z + uz * along); gunship.rotation.set(0.05, Math.atan2(ux, uz), Math.sin(k * 6) * 0.1);
      if (k <= 1 && !s.engine) { s.engine = 1; sfx.engine(); }
      const n = Math.ceil(len / 3.5);
      for (let j = 0; j <= n; j++) {
        const sj = (j / n) * len;
        if (!s.fired.has(j) && along >= sj - 6) {
          s.fired.add(j);
          const p = new THREE.Vector3(s.a.x + ux * sj + rr(-1, 1), 0, s.a.z + uz * sj + rr(-1, 1));
          tracer(gunship.position, p, 0xff6040, 0.12);
          explode(p, STRIKE_W, 230, 'air', 0.55);
        }
      }
      if (k > 1.2) { scene.remove(s.m); strikes.splice(i, 1); gunship.visible = strikes.some((o) => o.t >= o.warn); }
    }
  }
}
function pay(k) {
  const c = CALLINS[k];
  if (G.cds[k] > 0) { toast(`${c.name} on cooldown (${Math.ceil(G.cds[k])}s)`, 1.4); return false; }
  if (G.cp < c.cost) { toast(`${c.name} needs ${c.cost} CP`, 1.4); return false; }
  G.cp -= c.cost; G.cds[k] = c.cd; return true;
}
function callReinforce() {
  const sq = squads[G.selected];
  const dead = sq.units.filter((u) => !u.alive);
  if (!dead.length) { toast(`${sq.name} is at full strength`, 1.4); return false; }
  if (!pay('reinforce')) return false;
  const c = centroid(sq, new THREE.Vector3()) || sq.point.clone();
  collide(c, 1.2);
  dropPod(c, () => {
    dead.forEach((u, i) => {
      Object.assign(u, { alive: true, hp: u.maxHp, dead: 0, target: null });
      u.pos.set(c.x + Math.cos(i * 1.2) * 1.6, 0, c.z + Math.sin(i * 1.2) * 1.6); u.mesh.visible = true; u.mesh.rotation.x = 0;
    });
    selectSquad(G.selected); toast(`${sq.name} back to full strength`, 1.6);
  });
  return true;
}
function callSupply(p) { if (!pay('supply')) return false; const q = p.clone(); collide(q, 2); dropPod(q, () => spawnSupply(q)); return true; }

// ================= waves =================
// [delay, type, count, entrance]
const WAVES = [
  { t: 5, name: 'Skitterer swarm', g: [[0, 'skit', 28, 0], [8, 'skit', 28, 1], [18, 'skit', 30, 2], [32, 'skit', 30, 0]] },
  { t: 95, name: 'Spitters in the swarm', g: [[0, 'skit', 32, 1], [4, 'spitter', 4, 0], [12, 'skit', 32, 2], [18, 'spitter', 4, 1], [26, 'skit', 32, 0], [34, 'spitter', 3, 2]] },
  { t: 190, name: 'Burrowers detected', g: [[0, 'skit', 34, 2], [3, 'spitter', 4, 0], [8, 'burrower', 4, 1], [16, 'skit', 34, 0], [22, 'burrower', 4, 2], [28, 'spitter', 4, 1], [36, 'skit', 34, 1], [44, 'burrower', 3, 0]] },
  { t: 290, name: 'Carapace Brute!', g: [[0, 'brute', 1, 0], [2, 'skit', 36, 1], [6, 'spitter', 5, 2], [14, 'burrower', 5, 0], [22, 'skit', 36, 2], [30, 'spitter', 4, 0], [38, 'skit', 34, 0], [46, 'burrower', 4, 1]] },
  { t: 385, name: 'The whole hive', g: [[0, 'skit', 40, 0], [4, 'skit', 40, 1], [6, 'brute', 1, 2], [10, 'spitter', 6, 2], [14, 'burrower', 5, 0], [22, 'skit', 40, 2], [28, 'brute', 1, 1], [32, 'spitter', 6, 0], [38, 'burrower', 5, 1], [46, 'skit', 40, 0], [52, 'brute', 1, 0], [58, 'skit', 40, 1], [64, 'spitter', 5, 1], [70, 'skit', 40, 2]] },
];
const queue = [];
function startWave(i) {
  const w = WAVES[i]; G.wave = i + 1;
  for (const [delay, key, n, e] of w.g) for (let k = 0; k < n; k++) queue.push({ at: G.time + delay + k * (key === 'skit' ? 0.14 : 0.9), key, e });
  queue.sort((a, b) => a.at - b.at);
  toast(`WAVE ${G.wave}/5: ${w.name}`, 3); sfx.siren();
}
function updateWaves() {
  const nw = WAVES[G.wave];
  if (nw && G.time >= nw.t) startWave(G.wave);
  while (queue.length && queue[0].at <= G.time && bugCount < 150) {
    const q = queue.shift(), e = ENTR[q.e];
    if (q.key === 'burrower') {
      const a = e + rr(-0.05, 0.05), r = rr(60, 72), sa = rr(-Math.PI, Math.PI), sr = rr(7, 17);
      spawnBug('burrower', Math.cos(a) * r, Math.sin(a) * r, { under: true, surf: new THREE.Vector3(Math.cos(sa) * sr, 0, Math.sin(sa) * sr) });
    } else { const a = e + rr(-0.05, 0.05), r = rr(118, 132); spawnBug(q.key, Math.cos(a) * r, Math.sin(a) * r); }
  }
}
// dropship
const dropship = new THREE.Group();
{
  const add = (geo, c, x, y, z, basic) => { const m = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color: c }) : M(c)); m.position.set(x, y, z); m.castShadow = !basic; dropship.add(m); return m; };
  add(new THREE.BoxGeometry(5, 3.2, 15), 0x6a7480, 0, 2.6, 0); add(new THREE.BoxGeometry(4, 2, 4), 0x9ff8ff, 0, 3.2, 8, true);
  add(new THREE.BoxGeometry(18, 0.5, 5), 0x56606a, 0, 3.4, -1); add(new THREE.BoxGeometry(0.5, 3, 3), 0x56606a, 0, 5.4, -6);
  for (const s of [-1, 1]) { add(new THREE.CylinderGeometry(1, 1.2, 4, 10), 0x40464e, s * 7, 2.4, -1); add(new THREE.CircleGeometry(1, 12).rotateX(Math.PI / 2), 0x60c0ff, s * 7, 0.39, -1, true); }
  for (const s of [-1, 1]) for (const z of [-5, 5]) add(new THREE.BoxGeometry(0.3, 1.2, 0.3), 0x30343a, s * 2, 0.6, z);
  add(new THREE.BoxGeometry(5.04, 0.4, 15.04), 0xd8a030, 0, 3.4, 0);
  dropship.visible = false; dropship.position.copy(PAD); dropship.rotation.y = 0.6; scene.add(dropship);
}
const dropLight = new THREE.PointLight(0x80c8ff, 0, 40, 2); scene.add(dropLight);
function updateDropship() {
  const t0 = EVAC_T - DESCENT_T;
  if (G.time < t0) return;
  if (!G.msgs.drop) { G.msgs.drop = 1; toast('Dropship descending. Hold the tower!', 3); sfx.engine(); }
  const k = clamp((G.time - t0) / DESCENT_T, 0, 1);
  dropship.visible = true; dropship.position.set(PAD.x, lerp(110, 0, ease(k)), PAD.z);
  dropLight.position.set(PAD.x, dropship.position.y, PAD.z); dropLight.intensity = 400;
  if (k > 0.85 && rnd() < 0.5) burst(_v.set(PAD.x + rr(-6, 6), 0.3, PAD.z + rr(-6, 6)), 3, 0xb87048, 6, 2, 0.8);
  if (k >= 1 && G.state === 'play') endGame(true);
}
function endGame(won, why) {
  if (G.state !== 'play') return;
  G.state = won ? 'won' : 'lost'; G.firing = false;
  document.exitPointerLock?.();
  const alive = troopers.filter((t) => t.alive).length;
  $('endTitle').textContent = won ? 'EVAC COMPLETE' : 'RELAY 7 HAS FALLEN';
  $('endText').innerHTML = won
    ? `The dropship touched down with the uplink still transmitting.<br>Tower integrity ${Math.round((G.towerHp / G.towerMax) * 100)}% · ${G.kills} Skrell killed · ${alive}/18 troopers made it out.`
    : `${why}<br>Survived ${fmt(G.time)} of ${fmt(EVAC_T)} · wave ${G.wave}/5 · ${G.kills} Skrell killed.`;
  if (!won && G.towerHp <= 0) { towerGroup.rotation.z = 0.25; flash(_v.set(0, 10, 0), 8); }
  setTimeout(() => $('end').classList.remove('hidden'), 900);
}

// ================= simulation step =================
function step(dt) {
  G.time += dt;
  for (const k in G.cds) G.cds[k] = Math.max(0, G.cds[k] - dt);
  updateWaves();
  updatePlayer(dt);
  updateTroopers(dt);
  updateBugs(dt);
  updateAcid(dt);
  updateGrenades(dt);
  updatePods(dt);
  updateTurrets(dt);
  updateStrikes(dt);
  updateDropship();
  if (G.towerHp <= 0 && G.state === 'play') endGame(false, 'The Skrell tore down the uplink tower. The evac had nowhere to land.');
}

// ================= camera =================
const cmdFocus = new THREE.Vector3(); let cmdZoom = 1;
const posA = new THREE.Vector3(), posB = new THREE.Vector3(), lookA = new THREE.Vector3(), lookB = new THREE.Vector3();
let bobT = 0;
function updateCamera(rdt) {
  if (camT !== camTarget) camT = clamp(camT + (camTarget > camT ? 1 : -1) * rdt / 0.7, 0, 1);
  const e = ease(camT);
  if (camTarget === 1 && G.state === 'play') {
    const px = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), pz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    cmdFocus.x = clamp(cmdFocus.x + px * 45 * cmdZoom * rdt, -90, 90); cmdFocus.z = clamp(cmdFocus.z + pz * 45 * cmdZoom * rdt, -90, 90);
  }
  if (player.moving) bobT += rdt * (player.sprint ? 13 : 9);
  eye(posA); posA.y += Math.sin(bobT) * 0.04;
  aimDir(lookA).add(posA);
  lookB.copy(cmdFocus); posB.set(cmdFocus.x, 70 * cmdZoom, cmdFocus.z + 42 * cmdZoom);
  camera.position.lerpVectors(posA, posB, e);
  if (shake > 0) { camera.position.x += rr(-1, 1) * shake * 0.3; camera.position.y += rr(-1, 1) * shake * 0.3; shake = Math.max(0, shake - rdt * 1.5); }
  lookA.lerp(lookB, e); camera.lookAt(lookA);
  camera.fov = lerp(75, 50, e); camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  const fx = lerp(player.pos.x, cmdFocus.x, e), fz = lerp(player.pos.z, cmdFocus.z, e);
  sun.position.set(fx + 70, 45, fz + 60); sun.target.position.set(fx, 0, fz);
  const sc = lerp(60, 110, e); Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc }); sun.shadow.camera.updateProjectionMatrix();
  scene.fog.near = lerp(45, 120, e); scene.fog.far = lerp(230, 380, e);
  return e;
}
function toggleCommander(force) {
  if (G.state !== 'play') return;
  if (!player.alive && camTarget === 1 && !force) { toast('Waiting for your respawn pod…', 1.2); return; }
  if (camTarget === 0) {
    camTarget = 1; cmdFocus.set(player.pos.x, 0, player.pos.z - 8); cmdZoom = 1; G.firing = false;
    document.exitPointerLock?.();
    $('mode').textContent = 'COMMANDER · TIME ×0.25'; $('cmdbar').classList.add('on'); $('cross').classList.add('hidden');
  } else {
    camTarget = 0; G.callMode = null; strikePreview.visible = false; dragging = null; lockPointer();
    $('mode').textContent = 'TROOPER'; $('cmdbar').classList.remove('on'); $('cross').classList.remove('hidden');
  }
}
function lockPointer() {
  if (isTouch || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
}

// ================= per-frame visuals =================
function animateTroopers(dt, e) {
  for (const t of troopers) {
    const g = t.mesh;
    if (!t.alive) {
      if (g.visible) { g.rotation.x = -Math.min(1, t.dead / 0.4) * Math.PI / 2; if (t.dead > 6) g.visible = false; }
      continue;
    }
    g.rotation.y = t.face; g.rotation.x = 0;
    if (t.moving) t.walk += dt * 11;
    g.position.y = t.moving ? Math.abs(Math.sin(t.walk)) * 0.06 : 0;
    t.disc.visible = e > 0.15;
  }
  const pb = playerBody.g;
  pb.visible = player.alive && e > 0.05;
  pb.position.set(player.pos.x, 0, player.pos.z); pb.rotation.y = yaw; playerBody.disc.visible = e > 0.15; playerBody.ring.visible = e > 0.15;
  vm.visible = player.alive && e < 0.03;
  vmKick = Math.max(0, vmKick - dt * 12);
  const rl = player.reload > 0 ? Math.sin(Math.min(1, (1.5 - player.reload) / 1.5) * Math.PI) : 0;
  vm.position.set(0.24, -0.24 - rl * 0.18 + (player.moving ? Math.sin(bobT) * 0.012 : 0), -0.5 + vmKick * 0.05);
  vm.rotation.x = rl * 0.6 + vmKick * 0.05;
  if (muzzleT > 0) { muzzleT -= dt; if (muzzleT <= 0) { muzzle.visible = false; muzzleLight.intensity = 0; } }
}
function updateSquadVisuals(e, t) {
  for (const sq of squads) {
    const c = centroid(sq, _t1);
    sq.label.visible = !!c && e > 0.2;
    if (c) { sq.label.position.set(c.x, 5 + 4 * e, c.z); const s = 2 + 3.5 * e; sq.label.scale.set(s, s, 1); }
    const show = e > 0.1 && sq.order !== 'follow' && !!c;
    sq.marker.visible = show;
    if (show) { sq.marker.position.set(sq.point.x, 0, sq.point.z); sq.cone.position.y = 2.4 + Math.sin(t * 4) * 0.3; sq.marker.scale.setScalar(sq.id === G.selected ? 1.25 : 0.85); }
  }
}

// ================= HUD =================
const sqEls = squads.map((sq) => {
  const d = document.createElement('div'); d.className = 'sq';
  d.innerHTML = `<div class="top"><span><span class="sw" style="background:${sq.css}"></span>${sq.id + 1} · ${sq.name}</span><span class="ord"></span></div><div class="bar"><i style="background:${sq.css}"></i></div>`;
  d.addEventListener('click', () => selectSquad(sq.id)); $('squads').appendChild(d); return d;
});
document.querySelectorAll('#cmdbar .ci').forEach((b) => { b.querySelector('.cost').textContent = `${CALLINS[b.dataset.ci].cost} CP · ${CALLINS[b.dataset.ci].cd}s`; });
function updateHUD() {
  $('hpFill').style.width = `${(player.hp / player.maxHp) * 100}%`;
  $('pods').textContent = player.respawns ? '· 1 respawn pod' : '· no respawns';
  $('towerFill').style.width = `${Math.max(0, G.towerHp / G.towerMax) * 100}%`;
  $('towerFill').style.background = G.towerHp / G.towerMax < 0.3 ? '#ff5040' : '#5ab0ff';
  const left = EVAC_T - G.time;
  $('evac').textContent = left > DESCENT_T ? `EVAC IN ${fmt(left)}` : `DROPSHIP LANDING ${fmt(left)}`;
  const nw = WAVES[G.wave];
  $('wave').textContent = G.wave === 0 ? `FIRST WAVE IN ${fmt(nw.t - G.time)}` : nw ? `WAVE ${G.wave}/5 · NEXT IN ${fmt(nw.t - G.time)}` : `FINAL WAVE · ${bugCount} SKRELL`;
  $('cp').innerHTML = `${Math.floor(G.cp)} <small>CP</small>`;
  $('mag').textContent = player.mag; $('res').textContent = player.reserve;
  $('gren').textContent = `GRENADES ×${player.grenades}`;
  $('reload').classList.toggle('hidden', !(player.reload > 0));
  squads.forEach((sq, i) => {
    const n = sq.units.filter((u) => u.alive).length;
    sqEls[i].querySelector('i').style.width = `${(n / SQN) * 100}%`;
    sqEls[i].querySelector('.ord').textContent = n ? `${n}/${SQN} · ${{ move: 'Move', hold: 'Hold', charge: 'Charge', follow: 'Follow' }[sq.order]}` : 'down';
    sqEls[i].classList.toggle('sel', G.selected === i);
  });
  document.querySelectorAll('#cmdbar [data-sel]').forEach((b) => b.classList.toggle('act', +b.dataset.sel === G.selected));
  document.querySelectorAll('#cmdbar [data-ord]').forEach((b) => b.classList.toggle('act', b.dataset.ord === 'move' ? G.callMode === 'move' : squads[G.selected].order === b.dataset.ord));
  document.querySelectorAll('#cmdbar .ci').forEach((b) => {
    const k = b.dataset.ci, c = CALLINS[k];
    b.classList.toggle('act', G.callMode === k); b.classList.toggle('na', G.cp < c.cost || G.cds[k] > 0);
    b.querySelector('.cdv').style.width = `${(G.cds[k] / c.cd) * 100}%`;
  });
}

// ================= input =================
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y, out) { ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(groundPlane, out); }
let dragging = null;
function callKey(k) {
  if (camTarget !== 1) { toast('Open the commander view (Tab) to call in', 1.4); return; }
  if (k === 'reinforce') { callReinforce(); return; }
  G.callMode = G.callMode === k ? null : k;
  if (G.callMode === 'supply') toast('Click the ground to drop the supply pod', 1.6);
  if (G.callMode === 'strike') toast('Drag a line on the ground for the gunship run', 1.8);
}
addEventListener('keydown', (e) => {
  if (e.code === 'Tab' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggleCommander(); return; }
  keys[e.code] = true;
  if (G.state !== 'play' || e.repeat) return;
  if (e.code.startsWith('Digit') && +e.code.slice(5) >= 1 && +e.code.slice(5) <= 3) selectSquad(+e.code.slice(5) - 1);
  if (e.code === 'KeyH') setOrder(G.selected, 'hold');
  if (e.code === 'KeyC') setOrder(G.selected, 'charge');
  if (e.code === 'KeyF') setOrder(G.selected, 'follow');
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyM') { muted = !muted; toast(muted ? 'Sound off' : 'Sound on', 1); }
  if (e.code === 'KeyZ') callKey('reinforce');
  if (e.code === 'KeyX') callKey('supply');
  if (e.code === 'KeyV') callKey('strike');
  if (e.code === 'Escape') { G.callMode = null; strikePreview.visible = false; dragging = null; }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; G.firing = false; });
document.addEventListener('mousemove', (e) => {
  if (camTarget === 0 && document.pointerLockElement === canvas) { yaw -= e.movementX * 0.0023; pitch = clamp(pitch - e.movementY * 0.0023, -1.35, 1.35); }
  if (dragging) { const p = groundAt(e.clientX, e.clientY, new THREE.Vector3()); if (p) { dragging.b.copy(p); layStrip(strikePreview, dragging.a, dragging.b); strikePreview.visible = true; } }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (G.state !== 'play') return;
  if (camTarget === 0) { if (document.pointerLockElement !== canvas) lockPointer(); if (e.button === 0) G.firing = true; return; }
  const p = groundAt(e.clientX, e.clientY, new THREE.Vector3()); if (!p) return;
  if (e.button === 2 || G.callMode === 'move') { if (e.button === 2 || e.button === 0) { setOrder(G.selected, 'move', p); if (G.callMode === 'move') G.callMode = null; } return; }
  if (e.button !== 0) return;
  if (G.callMode === 'supply') { if (callSupply(p)) G.callMode = null; return; }
  if (G.callMode === 'strike') { dragging = { a: p.clone(), b: p.clone() }; return; }
  let best = -1, bd = 25;
  for (const t of troopers) if (t.alive) { const d = d2(t.pos, p); if (d < bd) { bd = d; best = t.squad.id; } }
  if (best >= 0) selectSquad(best);
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) G.firing = false;
  if (dragging) { const d = dragging; dragging = null; strikePreview.visible = false; if (callStrike(d.a, d.b)) G.callMode = null; }
});
canvas.addEventListener('wheel', (e) => { if (camTarget === 1) cmdZoom = clamp(cmdZoom + e.deltaY * 0.001, 0.4, 1.6); }, { passive: true });
document.querySelectorAll('#cmdbar button').forEach((b) => b.addEventListener('mousedown', (ev) => ev.stopPropagation()));
document.querySelectorAll('#cmdbar button').forEach((b) => b.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (b.dataset.sel) selectSquad(+b.dataset.sel);
  else if (b.dataset.ord === 'move') G.callMode = G.callMode === 'move' ? null : 'move';
  else if (b.dataset.ord) setOrder(G.selected, b.dataset.ord);
  else if (b.dataset.ci) callKey(b.dataset.ci);
}));
function begin() {
  if (G.state !== 'title') return;
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  G.state = 'play'; initAudio(); lockPointer(); selectSquad(0);
  toast(isTouch ? 'Best on desktop with keyboard and mouse.' : 'Hold the uplink. First wave inbound.', 3);
}
$('begin').addEventListener('click', (e) => { e.stopPropagation(); begin(); });
$('title').addEventListener('click', begin);
$('restart').addEventListener('click', () => location.reload());
if (isTouch) $('mobileNote').classList.remove('hidden');

// ================= main loop =================
let last = performance.now(), smokeT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  const e = updateCamera(rdt); camE = e;
  const sdt = rdt * lerp(1, 0.25, e);
  if (G.state === 'play') step(sdt);
  renderBugs(sdt); animateTroopers(sdt, e); updateSquadVisuals(e, now / 1000);
  updateParticles(sdt); updateTracers(sdt); updateFlashes(sdt); updateMounds(sdt);
  const t = now / 1000;
  beacon.visible = Math.sin(t * 5) > 0;
  smokeT -= sdt;
  if (G.towerHp < G.towerMax * 0.6 && smokeT <= 0) { smokeT = 0.08; burst(_v.set(rr(-1, 1), rr(6, 16), rr(-1, 1)), 1, G.towerHp < G.towerMax * 0.3 ? 0xff7030 : 0x55504c, 0.6, 3, 2.2, -0.5, 0.3); }
  if (toastT > 0) { toastT -= rdt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (G.state !== 'title') { hudAcc -= rdt; if (hudAcc <= 0) { hudAcc = 0.1; updateHUD(); } }
  renderer.render(scene, camera);
}
let hudAcc = 0;
requestAnimationFrame(frame);

// test / sim hook
window.__g = {
  G, squads, troopers, bugs, player, BT, step, setOrder, selectSquad, toggleCommander, begin, callReinforce, callSupply, callStrike, throwGrenade, startReload, nearestBug, spawnBug, WAVES,
  get yaw() { return yaw; }, set yaw(v) { yaw = v; }, get pitch() { return pitch; }, set pitch(v) { pitch = v; }, get camT() { return camT; }, get bugCount() { return bugCount; },
  renderBugs, layStrip, strikePreview,
};
