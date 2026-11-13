/**
 * 芝士AI吃鱼 · 知识宇宙 (AI Universe) 3D核心交互引擎 v3
 * 同一场景内尺度穿梭：宇宙 → 星系 → 星球 → 生命树（从星球北极生长）
 */

(function () {
  'use strict';

  const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const EPOCH_NAMES = ['星核', '萌芽纪', '繁衍纪', '文明纪', '奇点纪'];
  const EPOCH_ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const BRANCH_NAMES = {
    core: '星核', mechanism: '机理枝', evolution: '演化枝', application: '应用枝',
    boundary: '边界枝', boost: '增益设施', challenge: '纪元考核', secret: '隐秘档案'
  };
  const BRANCH_COLORS = {
    core: 0xbff8ea, mechanism: 0x5fe3f0, evolution: 0xf2cb73, application: 0x06d6a0,
    boundary: 0xff8a7a, boost: 0xffb347, challenge: 0xfff0c2, secret: 0xb57bff
  };
  const EPISODE_META = {
    1: { title: '什么是 AI？从识别一张图到生成一段话', sec: 97 },
    2: { title: 'AI 是怎么学会一件事的？', sec: 156 },
    3: { title: '神经网络里的“参数”，到底是什么？', sec: 163 },
    4: { title: 'Token 是什么？AI 为什么这样切分文字？', sec: 159 },
    5: { title: '文字变成数字以后，意思怎样表示？', sec: 166 },
    6: { title: '大模型怎样一步一步写出一句话？', sec: 162 },
    7: { title: 'AI 怎样联系前后文？看懂注意力机制', sec: 172 },
    8: { title: '大模型读了那么多文字，究竟在学什么？', sec: 177 },
    9: { title: '会接着写，怎么变成会按要求回答？', sec: 179 },
    10: { title: '聊过的内容，AI 为什么有时会忘？', sec: 183 },
    11: { title: '同一个问题，AI 为什么会给出不同回答？', sec: 187 },
    12: { title: 'AI 为什么会把错误说得很像真的？', sec: 186 },
    13: { title: '为什么大模型需要这么多算力？', sec: 187 },
    14: { title: '显存里装着什么？为什么长对话也会占空间？', sec: 194 },
    15: { title: 'AI 的“多想一会儿”，究竟多做了什么？', sec: 174 },
    16: { title: 'RAG 是什么？AI 怎样查资料再回答？', sec: 187 },
    17: { title: 'AI 怎样使用计算器、搜索和其他工具？', sec: 184 },
    18: { title: 'Agent 是什么？AI 怎样从回答问题到完成任务？', sec: 185 },
    19: { title: 'AI 怎么看懂一张图片？', sec: 190 },
    20: { title: 'MTP 是什么？大模型怎样更快地生成文字？', sec: 185 }
  };
  window.EPISODE_META = EPISODE_META;

  const ease = {
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e4) return (num / 1e3).toFixed(1) + 'K';
    return Math.floor(num).toString();
  }

  // 地图上用短名，详情里保留全名
  function shortName(node) {
    if (!node || !node.name) return '';
    let name = node.name.replace(/^星核\s*·\s*/, '');
    const parts = name.split(/[：:]/);
    if (parts.length > 1) {
      const head = parts[0].trim();
      name = /^\d+$/.test(head) ? `${head} · ${parts[1].trim().split(/\s+/)[0]}` : head;
    }
    return name.replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim();
  }

  function nodeSubtitle(node) {
    if (!node || !node.name) return '';
    const name = node.name.replace(/^星核\s*·\s*/, '');
    const parts = name.split(/[：:]/);
    const m = name.match(/[（(]([^)）]*)[)）]\s*$/);
    if (parts.length > 1 && !/^\d+$/.test(parts[0].trim())) return parts.slice(1).join('：').trim();
    if (m) return m[1];
    return '';
  }

  function makeGlowTexture(size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  function makeRingTexture(size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, r * 0.62, r, r, r);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  function makeSprite(tex, color, scale, opacity = 1) {
    const mat = new THREE.SpriteMaterial({
      map: tex, color: new THREE.Color(color), transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(scale, scale, 1);
    return s;
  }

  function disposeTree(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map && !m.map.isSharedTex) m.map.dispose();
          m.dispose();
        });
      }
    });
  }

  function gaussian() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  // =========================================================================
  // 1. Web Audio 声音合成器（离线、无依赖）
  // =========================================================================
  class SoundSynth {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.master = null;
      this.droneNodes = null;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }

    toggle() {
      this.enabled = !this.enabled;
      if (this.master) this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0, this.ctx.currentTime, 0.05);
      if (this.enabled) this.startDrone();
      return this.enabled;
    }

    startDrone() {
      if (!this.enabled || !this.ctx || this.droneNodes) return;
      try {
        const t = this.ctx.currentTime;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.022, t + 3);
        const oscs = [55, 82.4, 110.3].map((f, i) => {
          const o = this.ctx.createOscillator();
          o.type = i === 2 ? 'triangle' : 'sine';
          o.frequency.value = f;
          o.detune.value = (i - 1) * 6;
          o.connect(filter);
          o.start();
          return o;
        });
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.07;
        lfoGain.gain.value = 160;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start();
        filter.connect(gain);
        gain.connect(this.master);
        this.droneNodes = { oscs, gain, lfo };
      } catch (e) { /* 音频不可用时静默 */ }
    }

    _tone(freq, type, dur, vol, slideTo, delay = 0) {
      if (!this.enabled || !this.ctx) return;
      try {
        const t = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch (e) { /* ignore */ }
    }

    playTap(crit) {
      const base = 300 + Math.random() * 60;
      this._tone(base, 'triangle', 0.09, 0.07, base * 1.9);
      if (crit) {
        this._tone(880, 'sine', 0.35, 0.06, 1320, 0.03);
        this._tone(1320, 'sine', 0.4, 0.04, null, 0.08);
      }
    }
    playSelect() { this._tone(660, 'sine', 0.12, 0.045, 990); }
    playHover() { this._tone(1200, 'sine', 0.05, 0.012); }
    playUnlock() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tone(f, 'sine', 0.5, 0.07, null, i * 0.07));
    }
    playGrow() {
      this._tone(140, 'sine', 0.9, 0.09, 520);
      this._tone(280, 'triangle', 0.7, 0.03, 1040, 0.1);
    }
    playEpoch() {
      [261.6, 329.6, 392, 523.3, 659.3, 784, 1046.5].forEach((f, i) => this._tone(f, 'sine', 1.4, 0.06, null, i * 0.09));
      this._tone(65, 'sine', 2.2, 0.12, 98);
    }
    playCorrect() { [880, 1318.51].forEach((f, i) => this._tone(f, 'sine', 0.28, 0.1, null, i * 0.08)); }
    playWrong() { this._tone(160, 'sawtooth', 0.28, 0.06, 90); }
    playWarp() {
      this._tone(90, 'sine', 1.1, 0.12, 900);
      this._tone(1800, 'sine', 0.9, 0.025, 200, 0.05);
    }
  }

  // =========================================================================
  // 2. 演化状态
  // =========================================================================
  const OFFLINE_CAP_SEC = 8 * 3600;
  const OFFLINE_EFFICIENCY = 0.5;
  const REVIEW_DAYS = [1, 3, 7, 15, 30];
  const DAY_MS = 86400000;
  const planetIdOf = node => node.id.split('.').slice(1, 3).join('.');

  class EvolutionState {
    constructor(universeData) {
      this.data = universeData;
      this.storageKey = 'cheese.universe.save.v2';
      this.resources = { data: 120, compute: 0, insight: 30, paradigmFragments: 0, multiplier: 1.0 };
      this.currentGalaxyId = 'G04';
      this.currentPlanetId = 'G04.P02';
      this.unlockedNodes = new Set(['AI.G04.P02.CORE']);
      this.dormantNodes = new Set();
      this.planetProgress = {};
      this.lastSelected = {};
      this.tapCount = 0;
      // nodeId → { g 最佳评级, last 最近评级, at, step 复习档位, due 下次复训时间 }
      this.mastery = {};
      // planetId → 本轮跃迁的复训进度 { total, relit, perfect }
      this.prestigeRuns = {};
      this.lastSeen = 0;
      this.offlineReport = null;
      this.runComplete = null;
      this._nodeIndex = new Map();
      for (const pid in this.data.planets) {
        for (const n of this.data.planets[pid].nodes) this._nodeIndex.set(n.id, n);
      }
      this.load();
      this.settleOffline();
    }

    load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed.resources) Object.assign(this.resources, parsed.resources);
        if (parsed.currentGalaxyId) this.currentGalaxyId = parsed.currentGalaxyId;
        if (parsed.currentPlanetId && this.data.planets[parsed.currentPlanetId]) this.currentPlanetId = parsed.currentPlanetId;
        if (Array.isArray(parsed.unlockedNodes)) this.unlockedNodes = new Set(parsed.unlockedNodes);
        if (Array.isArray(parsed.dormantNodes)) this.dormantNodes = new Set(parsed.dormantNodes);
        if (parsed.planetProgress) this.planetProgress = parsed.planetProgress;
        if (parsed.lastSelected) this.lastSelected = parsed.lastSelected;
        if (parsed.tapCount) this.tapCount = parsed.tapCount;
        if (parsed.mastery) this.mastery = parsed.mastery;
        if (parsed.prestigeRuns) this.prestigeRuns = parsed.prestigeRuns;
        if (parsed.lastSeen) this.lastSeen = parsed.lastSeen;
      } catch (e) {
        console.warn('Load save error', e);
      }
    }

    settleOffline() {
      if (!this.lastSeen) return;
      const away = (Date.now() - this.lastSeen) / 1000;
      if (away < 120) return;
      const secs = Math.min(away, OFFLINE_CAP_SEC);
      const rates = this.getRates();
      const data = rates.dataPerSec * secs * OFFLINE_EFFICIENCY;
      const compute = rates.computePerSec * secs * OFFLINE_EFFICIENCY;
      this.resources.data += data;
      this.resources.compute += compute;
      this.offlineReport = { away, capped: away > OFFLINE_CAP_SEC, data, compute };
    }

    save() {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({
          resources: this.resources,
          currentGalaxyId: this.currentGalaxyId,
          currentPlanetId: this.currentPlanetId,
          unlockedNodes: Array.from(this.unlockedNodes),
          dormantNodes: Array.from(this.dormantNodes),
          planetProgress: this.planetProgress,
          lastSelected: this.lastSelected,
          tapCount: this.tapCount,
          mastery: this.mastery,
          prestigeRuns: this.prestigeRuns,
          lastSeen: Date.now()
        }));
      } catch (e) { /* ignore */ }
    }

    getNode(id) { return this._nodeIndex.get(id); }

    getCurrentPlanet() {
      return this.data.planets[this.currentPlanetId] || this.data.planets['G04.P02'];
    }

    getCurrentGalaxy() {
      return this.data.galaxies.find(g => g.id === this.currentGalaxyId) || this.data.galaxies[3];
    }

    // 对数增长：碎片越多边际越小，避免跃迁几次后经济失控
    getMultiplier(fragments = this.resources.paradigmFragments) { return 1 + 0.5 * Math.log(1 + fragments); }

    getPlanet(node) { return this.data.planets[planetIdOf(node)]; }

    // 增益节点：优先读注册表的 effect 字段，没有时从描述里的百分比推断
    effectOf(node) {
      if (node.effect) return node.effect;
      if (node.type !== 'boost') return null;
      const m = (node.desc || '').match(/(\d+)\s*%/);
      if (!m) return null;
      return { target: 'planet', stat: /算力/.test(node.desc) ? 'compute' : 'data', mult: 1 + Number(m[1]) / 100 };
    }

    planetBoosts(pid) {
      const b = { data: 1, compute: 1 };
      const p = this.data.planets[pid];
      if (!p) return b;
      p.nodes.forEach(n => {
        const eff = this.unlockedNodes.has(n.id) && this.effectOf(n);
        if (eff && eff.target === 'planet') b[eff.stat] *= eff.mult;
      });
      return b;
    }

    getRates() {
      const per = {};
      for (const id of this.unlockedNodes) {
        const node = this._nodeIndex.get(id);
        if (!node) continue;
        const pid = planetIdOf(node);
        const acc = per[pid] || (per[pid] = { d: 0, c: 0 });
        acc.d += node.prodData || 0;
        acc.c += node.prodCompute || 0;
      }
      let dataPerSec = 0, computePerSec = 0;
      for (const pid in per) {
        const b = this.planetBoosts(pid);
        dataPerSec += per[pid].d * b.data;
        computePerSec += per[pid].c * b.compute;
      }
      const mult = this.getMultiplier();
      return { dataPerSec: dataPerSec * mult, computePerSec: computePerSec * mult };
    }

    recordMastery(node, grade) {
      const prev = this.mastery[node.id];
      const step = prev ? Math.min(REVIEW_DAYS.length - 1, prev.step + 1) : 0;
      const best = prev && window.Levels.GRADE_RANK[prev.g] > window.Levels.GRADE_RANK[grade] ? prev.g : grade;
      const now = Date.now();
      this.mastery[node.id] = { g: best, last: grade, at: now, step, due: now + REVIEW_DAYS[step] * DAY_MS };
      this.save();
    }

    isDue(node) {
      const m = this.mastery[node.id];
      return !!m && this.unlockedNodes.has(node.id) && Date.now() >= m.due;
    }

    dueNodes(planet) {
      const all = planet ? planet.nodes : Array.from(this._nodeIndex.values());
      return all.filter(n => this.isDue(n)).sort((a, b) => this.mastery[a.id].due - this.mastery[b.id].due);
    }

    tick(dt) {
      const rates = this.getRates();
      this.resources.data += rates.dataPerSec * dt;
      this.resources.compute += rates.computePerSec * dt;
    }

    tapPlanet(crit = false) {
      const gain = Math.round((crit ? 50 : 10) * this.getMultiplier());
      this.resources.data += gain;
      this.tapCount += 1;
      return gain;
    }

    // 前置与资源分开判断，让界面能说清楚到底缺什么
    nodeStatus(node) {
      if (this.unlockedNodes.has(node.id)) return { state: 'unlocked', missing: [], short: null };
      const missing = (node.prereqs || []).filter(id => !this.unlockedNodes.has(id));
      if (this.dormantNodes.has(node.id)) return { state: 'dormant', missing, short: null };
      // 内容状态优先于玩家状态：建设中的星球只能预览，已点亮的进度保留
      const planet = this.getPlanet(node);
      if (planet && planet.status !== 'open') return { state: 'building', missing, short: null };
      if (missing.length) return { state: 'needPrereq', missing, short: null };
      const r = this.resources;
      const short = {
        data: Math.max(0, (node.costData || 0) - r.data),
        compute: Math.max(0, (node.costCompute || 0) - r.compute),
        insight: Math.max(0, (node.costInsight || 0) - r.insight)
      };
      if (short.data > 0 || short.compute > 0 || short.insight > 0) return { state: 'needRes', missing, short };
      return { state: 'available', missing, short };
    }

    canUnlockNode(node) { return this.nodeStatus(node).state === 'available'; }

    recommendNode(planet) {
      const order = planet.nodes.slice().sort((a, b) => (a.epoch - b.epoch));
      const pick = s => order.find(n => this.nodeStatus(n).state === s);
      return pick('available') || pick('dormant') || pick('needRes') || null;
    }

    unlockNode(node) {
      if (!this.canUnlockNode(node)) return false;
      this.resources.data -= node.costData || 0;
      this.resources.compute -= node.costCompute || 0;
      this.resources.insight -= node.costInsight || 0;
      this.unlockedNodes.add(node.id);
      this.dormantNodes.delete(node.id);
      this.save();
      return true;
    }

    // 跃迁后的残影：复训关卡通过即可无消耗重新点亮；整轮全 S 额外奖励 1 枚碎片
    relightNode(node, grade) {
      if (!this.dormantNodes.has(node.id)) return false;
      if ((node.prereqs || []).some(id => !this.unlockedNodes.has(id))) return false;
      this.dormantNodes.delete(node.id);
      this.unlockedNodes.add(node.id);
      const pid = planetIdOf(node);
      const run = this.prestigeRuns[pid];
      this.runComplete = null;
      if (run) {
        run.relit += 1;
        if (grade === 'S') run.perfect += 1;
        if (run.relit >= run.total) {
          const bonus = run.perfect >= run.total ? 1 : 0;
          this.resources.paradigmFragments += bonus;
          this.runComplete = { planetId: pid, bonus, perfect: run.perfect, total: run.total };
          delete this.prestigeRuns[pid];
        }
      }
      this.save();
      return true;
    }

    unlockedCount(planet) { return planet.nodes.filter(n => this.unlockedNodes.has(n.id)).length; }

    dormantCount(planet) { return planet.nodes.filter(n => this.dormantNodes.has(n.id)).length; }

    // 只把本星球的节点化为残影，全局资源不清空；跃迁的代价是一轮真正的复训
    doPrestige() {
      const p = this.getCurrentPlanet();
      if (this.unlockedCount(p) < 10 || this.dormantCount(p) > 0) return false;
      this.resources.paradigmFragments += 1;
      let total = 0;
      for (const node of p.nodes) {
        if (node.epoch > 0 && this.unlockedNodes.has(node.id)) {
          this.unlockedNodes.delete(node.id);
          this.dormantNodes.add(node.id);
          total += 1;
        }
      }
      this.prestigeRuns[p.id] = { total, relit: 0, perfect: 0 };
      this.save();
      return true;
    }
  }

  // =========================================================================
  // 3. Three.js 场景：宇宙 / 星系 / 星球共用一套相机与渲染器
  // =========================================================================
  class Universe3DRenderer {
    constructor(container, state, sound, hooks) {
      this.container = container;
      this.state = state;
      this.sound = sound;
      this.hooks = hooks || {};
      this.viewMode = 'planet';

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.galaxyMeshes = [];
      this.galaxyHits = [];
      this.bridges = [];
      this.cosmicLinks = [];
      this.planetOrbs = [];
      this.spaceLabels = [];
      this.structures = new Map();
      this.growing = [];
      this.fx = [];
      this.camFlight = null;
      this.viewOffset = { x: 0, y: 0 };
      this.viewOffsetTarget = { x: 0, y: 0 };
      this.treeCam = { dist: 35, focusY: 14 };
      this.spring = { x: 0, v: 0 };
      this.shake = 0;
      this.spinScale = 1;
      this.pointer = null;
      this.hoverPlanet = false;
      this.clock = new THREE.Clock();

      this.init();
    }

    init() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
      this.camera.position.set(0, 6, 46);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x03060a, 1);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.container.appendChild(this.renderer.domElement);

      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.enablePan = false;
      this.controls.rotateSpeed = 0.5;
      this.controls.zoomSpeed = 0.7;
      this.controls.minDistance = 12;
      this.controls.maxDistance = 900;

      this.scene.add(new THREE.AmbientLight(0x1d2c3a, 0.6));
      this.sunLight = new THREE.DirectionalLight(0xfff1dc, 2.5);
      this.sunLight.position.set(-30, 14, 9);
      this.scene.add(this.sunLight);
      this.rimLight = new THREE.DirectionalLight(0x5fe3f0, 0.9);
      this.rimLight.position.set(28, 2, -18);
      this.scene.add(this.rimLight);

      this.glowTex = makeGlowTexture();
      this.glowTex.isSharedTex = true;
      this.ringTex = makeRingTexture();
      this.ringTex.isSharedTex = true;

      this.labelLayer = document.getElementById('space-labels');

      this.cosmos = new THREE.Group();
      this.scene.add(this.cosmos);
      this.createStarfield();
      this.createAGICore();
      this.createGalaxies();
      this.createKnowledgeBridges();

      this.galaxySystem = new THREE.Group();
      this.scene.add(this.galaxySystem);

      this.planetSystemGroup = new THREE.Group();
      this.scene.add(this.planetSystemGroup);
      this.buildCurrentPlanet();

      window.addEventListener('resize', () => this.onResize());
      const el = this.renderer.domElement;
      el.addEventListener('pointerdown', e => this.onPointerDown(e));
      window.addEventListener('pointermove', e => this.onPointerMove(e));
      window.addEventListener('pointerup', e => this.onPointerUp(e));
      el.addEventListener('wheel', e => this.onWheel(e), { passive: false });

      this.applyModeVisibility('planet');
      this.controls.target.set(0, -0.9, 0);
      this.flyTo(this.planetCamPos(), new THREE.Vector3(0, -0.9, 0), 2.4);
      this.animate();
    }

    onResize() {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    // ── 深空：两层星点 + 远处星云 ────────────────────────────────────────
    createStarfield() {
      this.starfield = new THREE.Group();
      const palette = [0xffffff, 0xffffff, 0xdfe9ff, 0x9fdcf0, 0xffe7b8, 0xc9b6ff].map(c => new THREE.Color(c));
      const layer = (count, rMin, rMax, size, opacity) => {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const r = rMin + Math.random() * (rMax - rMin);
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
          pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
          pos[i * 3 + 2] = r * Math.cos(ph);
          const c = palette[(Math.random() * palette.length) | 0];
          const b = 0.35 + Math.random() * 0.65;
          col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return new THREE.Points(geom, new THREE.PointsMaterial({
          size, map: this.glowTex, vertexColors: true, transparent: true, opacity,
          depthWrite: false, blending: THREE.AdditiveBlending
        }));
      };
      this.starfield.add(layer(6000, 700, 2200, 5.5, 0.9));
      this.starfield.add(layer(500, 700, 2000, 14, 1));

      const nebulae = [[0x0f4a52, -0.6, 0.25], [0x3b1f66, 2.2, -0.2], [0x0d3b2f, 3.6, 0.4], [0x4a2a12, 5.0, -0.35], [0x16304f, 1.0, 0.6]];
      nebulae.forEach(([c, th, el]) => {
        const s = makeSprite(this.glowTex, c, 1400 + Math.random() * 600, 0.32);
        s.position.set(Math.cos(th) * 2100, el * 900, Math.sin(th) * 2100);
        this.starfield.add(s);
      });
      this.scene.add(this.starfield);
    }

    // ── 通用之核 ─────────────────────────────────────────────────────────
    createAGICore() {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(5, 2), new THREE.MeshBasicMaterial({ color: 0xfff4d0 })));
      g.add(makeSprite(this.glowTex, 0xffd98a, 60, 0.9));
      g.add(makeSprite(this.glowTex, 0xf2cb73, 170, 0.22));

      const count = 3200;
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const gold = new THREE.Color(0xf2cb73), cyan = new THREE.Color(0x5fe3f0), tmp = new THREE.Color();
      for (let i = 0; i < count; i++) {
        const t = Math.pow(Math.random(), 1.6);
        const r = 9 + t * 30;
        const a = Math.random() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = gaussian() * (1.2 + t * 2);
        pos[i * 3 + 2] = Math.sin(a) * r;
        tmp.copy(gold).lerp(cyan, t * 0.8).multiplyScalar(1 - t * 0.55);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.agiDisk = new THREE.Points(geom, new THREE.PointsMaterial({
        size: 3.2, map: this.glowTex, vertexColors: true, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      g.add(this.agiDisk);
      g.rotation.x = 0.18;
      g.position.y = 150;
      this.agiCore = g;
      this.cosmos.add(g);
      this.addSpaceLabel(g, new THREE.Vector3(0, 14, 0), '<b>通用之核</b><small>所有星系共同指向的终点</small>', ['universe'], null, 'core');
    }

    // ── 14 星系：旋臂星尘 + 星核辉光 + 可点击标签 ─────────────────────────
    createGalaxies() {
      const planetsByGalaxy = {};
      Object.values(this.state.data.planets).forEach(p => {
        planetsByGalaxy[p.galaxyId] = (planetsByGalaxy[p.galaxyId] || 0) + 1;
      });
      this.state.data.galaxies.forEach((g, gi) => {
        const group = new THREE.Group();
        group.position.set(g.x, 0, g.z);
        const tilt = new THREE.Group();
        tilt.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
        group.add(tilt);

        const col = new THREE.Color(g.color);
        tilt.add(makeSprite(this.glowTex, col, g.radius * 3.6, 0.85));
        tilt.add(makeSprite(this.glowTex, 0xffffff, g.radius * 1.1, 0.95));

        const arms = 2 + (gi % 2);
        const count = 1800;
        const pos = new Float32Array(count * 3);
        const cols = new Float32Array(count * 3);
        const white = new THREE.Color(0xffffff), tmp = new THREE.Color();
        for (let i = 0; i < count; i++) {
          const t = Math.pow(Math.random(), 0.75);
          const r = 1.5 + t * g.radius * 2.4;
          const arm = i % arms;
          const th = t * Math.PI * 3.1 + arm * (Math.PI * 2 / arms) + gaussian() * 0.32;
          const spread = gaussian() * (0.5 + t * 1.8);
          pos[i * 3] = Math.cos(th) * r + spread;
          pos[i * 3 + 1] = gaussian() * 0.9 * (1 - t * 0.6);
          pos[i * 3 + 2] = Math.sin(th) * r + spread;
          tmp.copy(white).lerp(col, Math.min(1, t * 1.5)).multiplyScalar(1 - t * 0.45);
          cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        const armsMesh = new THREE.Points(geom, new THREE.PointsMaterial({
          size: 2.4, map: this.glowTex, vertexColors: true, transparent: true, opacity: 0.95,
          depthWrite: false, blending: THREE.AdditiveBlending
        }));
        tilt.add(armsMesh);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(g.radius * 2.4, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData.galaxyId = g.id;
        group.add(hit);
        this.galaxyHits.push(hit);

        group.userData = { galaxyId: g.id, name: g.name };
        this.galaxyMeshes.push({ group, tilt, arms: armsMesh, g, spin: 0.05 * (gi % 2 ? 1 : -1) });
        this.cosmos.add(group);

        const tether = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(g.x, 0, g.z), new THREE.Vector3(g.x * 0.08, 142, g.z * 0.08)
        ]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.cosmos.add(tether);
        this.cosmicLinks.push(tether);

        const label = this.addSpaceLabel(group, new THREE.Vector3(0, -g.radius * 1.4, 0),
          `<b>${g.name}</b><small>${g.english} · ${planetsByGalaxy[g.id] || 0} 颗星球</small>`,
          ['universe'], () => this.hooks.onGalaxyPick && this.hooks.onGalaxyPick(g.id), 'galaxy');
        label.el.style.setProperty('--accent', g.color);
        label.galaxyId = g.id;
      });
    }

    // ── 星系之间的知识桥：一道光沿桥流动 ────────────────────────────────
    createKnowledgeBridges() {
      const pairs = [
        ['G01', 'G02'], ['G02', 'G03'], ['G03', 'G04'], ['G04', 'G09'],
        ['G09', 'G10'], ['G04', 'G13'], ['G03', 'G12'], ['G04', 'G07']
      ];
      pairs.forEach(([a, b], i) => {
        const gA = this.state.data.galaxies.find(g => g.id === a);
        const gB = this.state.data.galaxies.find(g => g.id === b);
        if (!gA || !gB) return;
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(gA.x, 0, gA.z),
          new THREE.Vector3((gA.x + gB.x) / 2, 34, (gA.z + gB.z) / 2),
          new THREE.Vector3(gB.x, 0, gB.z)
        );
        const geom = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
        const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
          color: 0x5fe3f0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        this.cosmos.add(line);
        this.cosmicLinks.push(line);
        const pulse = makeSprite(this.glowTex, 0x9ff3ff, 9, 0.9);
        this.cosmos.add(pulse);
        this.bridges.push({ curve, pulse, t: i / pairs.length, speed: 0.08 + (i % 3) * 0.02 });
      });
    }

    // ── 通用的 3D→屏幕标签 ──────────────────────────────────────────────
    addSpaceLabel(obj, offset, html, modes, onClick, kind) {
      const el = document.createElement(onClick ? 'button' : 'div');
      el.className = `space-label kind-${kind || 'info'}`;
      el.innerHTML = html;
      if (onClick) {
        el.type = 'button';
        el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      }
      this.labelLayer.appendChild(el);
      const label = { el, obj, offset, modes, kind };
      this.spaceLabels.push(label);
      return label;
    }

    removeSpaceLabels(kind) {
      this.spaceLabels = this.spaceLabels.filter(l => {
        if (l.kind !== kind) return true;
        l.el.remove();
        return false;
      });
    }

    updateSpaceLabels() {
      const w = this.container.clientWidth, h = this.container.clientHeight;
      const v = new THREE.Vector3();
      const cands = [];
      for (const l of this.spaceLabels) {
        if (l.galaxyId) l.el.classList.toggle('is-current', l.galaxyId === this.state.currentGalaxyId);
        let visible = l.modes.includes(this.viewMode) && !this.camFlight;
        if (visible) {
          let o = l.obj, shown = true;
          while (o) { if (!o.visible) { shown = false; break; } o = o.parent; }
          visible = shown;
        }
        if (visible) {
          l.obj.getWorldPosition(v);
          v.add(l.offset).project(this.camera);
          visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
          if (visible) {
            l.x = (v.x * 0.5 + 0.5) * w;
            l.y = (-v.y * 0.5 + 0.5) * h;
            const pri = (l.kind === 'core' ? -3 : 0) + (l.el.classList.contains('is-current') ? -2 : 0) + v.z;
            cands.push({ l, pri });
          }
        }
        if (!visible) l.el.classList.remove('is-visible');
      }
      cands.sort((a, b) => a.pri - b.pri);
      const placed = [];
      const hit = r => placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0);
      for (const { l } of cands) {
        if (!l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; l.hCompact = Math.min(l.h, 36); }
        l.x = Math.max(l.w / 2 + 6, Math.min(w - l.w / 2 - 6, l.x));
        const up = l.kind === 'core';
        const rect = hh => ({ x0: l.x - l.w / 2 - 4, x1: l.x + l.w / 2 + 4, y0: (up ? l.y - hh : l.y) - 2, y1: (up ? l.y : l.y + hh) + 2 });
        let r = rect(l.h), compact = false, show = true;
        if (hit(r)) { compact = true; r = rect(l.hCompact); }
        if (hit(r) && !up) {
          const lift = l.kind === 'galaxy' ? 64 : 46;
          const alt = { x0: r.x0, x1: r.x1, y0: l.y - lift - l.hCompact, y1: l.y - lift + 4 };
          if (!hit(alt)) { r = alt; l.y = alt.y0 + 2; }
        }
        if (hit(r)) show = false;
        l.el.classList.toggle('is-compact', compact);
        l.el.classList.toggle('is-visible', show);
        if (show) {
          placed.push(r);
          l.el.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px) translate(-50%, ${up ? '-100%' : '0'})`;
        }
      }
    }


    // -------------------------------------------------------------------------
    // BIOME_CONFIG: 14 galaxies → unique biome types
    // -------------------------------------------------------------------------
    static get BIOME_CONFIG() {
      return {
        G01: { biome: 'ancient_ruins',       atmoOpacity: 0.20, hasRing: false },
        G02: { biome: 'data_plains',         atmoOpacity: 0.15, hasRing: false },
        G03: { biome: 'crystal_lattice',     atmoOpacity: 0.25, hasRing: true  },
        G04: { biome: 'text_ocean',          atmoOpacity: 0.18, hasRing: false },
        G05: { biome: 'prism_forest',        atmoOpacity: 0.22, hasRing: true  },
        G06: { biome: 'nebula_garden',       atmoOpacity: 0.30, hasRing: false },
        G07: { biome: 'twin_biome',          atmoOpacity: 0.18, hasRing: false },
        G08: { biome: 'lava_field',          atmoOpacity: 0.12, hasRing: false },
        G09: { biome: 'library_spire',       atmoOpacity: 0.20, hasRing: false },
        G10: { biome: 'circuit_grid',        atmoOpacity: 0.15, hasRing: true  },
        G11: { biome: 'mech_terrain',        atmoOpacity: 0.17, hasRing: false },
        G12: { biome: 'datacenter_mountain', atmoOpacity: 0.13, hasRing: false },
        G13: { biome: 'ice_shield',          atmoOpacity: 0.28, hasRing: true  },
        G14: { biome: 'station_cluster',     atmoOpacity: 0.22, hasRing: true  },
      };
    }

    // -------------------------------------------------------------------------
    // generateBiomeTexture — 14 种独特程序化纹理
    // -------------------------------------------------------------------------
    generateBiomeTexture(galaxyId, colorHex, seed = 1) {
      const cfg = Universe3DRenderer.BIOME_CONFIG[galaxyId];
      const biome = cfg ? cfg.biome : 'ancient_ruins';

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;

      // seeded pseudo-random helper
      let _s = seed * 9301 + 49297;
      const rng = () => { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; };

      switch (biome) {

        // ── G01 起源系: 金白沙漠 + 废墟石块剪影 + 远古符文裂纹 ──────────────
        case 'ancient_ruins': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#c8a86b'); g.addColorStop(0.5, '#e8d090'); g.addColorStop(1, '#9c7a3a');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // sand dune ripples
          ctx.strokeStyle = 'rgba(255,245,180,0.25)'; ctx.lineWidth = 1;
          for (let y = 10; y < H; y += 14) {
            ctx.beginPath();
            for (let x = 0; x <= W; x += 4) {
              const wy = y + Math.sin((x + seed * 20) * 0.025) * 6;
              x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
            }
            ctx.stroke();
          }
          // ruin block silhouettes
          ctx.fillStyle = 'rgba(60,40,10,0.55)';
          for (let i = 0; i < 18; i++) {
            const bx = (rng() * W * 1.1) % W;
            const by = H * 0.3 + rng() * H * 0.5;
            const bw = 18 + rng() * 40, bh = 20 + rng() * 60;
            ctx.fillRect(bx, by - bh, bw, bh);
          }
          // rune crack lines
          ctx.strokeStyle = 'rgba(255,200,80,0.45)'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 12; i++) {
            const sx = rng() * W, sy = rng() * H;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            let cx2 = sx, cy2 = sy;
            for (let s = 0; s < 6; s++) {
              cx2 += (rng() - 0.5) * 60; cy2 += (rng() - 0.5) * 40;
              ctx.lineTo(cx2, cy2);
            }
            ctx.stroke();
          }
          break;
        }

        // ── G02 ML系: 黄色平原 + 决策树网格线 + 数据流河川 ─────────────────
        case 'data_plains': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#6b5a00'); g.addColorStop(0.5, '#c8a800'); g.addColorStop(1, '#4a3f00');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // grid lines (decision tree feel)
          ctx.strokeStyle = 'rgba(255,230,80,0.3)'; ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          // branching tree lines
          ctx.strokeStyle = 'rgba(255,255,120,0.5)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 8; i++) {
            const tx = rng() * W;
            const drawBranch = (x, y, angle, depth, len) => {
              if (depth === 0 || len < 3) return;
              const ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
              drawBranch(ex, ey, angle - 0.4, depth - 1, len * 0.65);
              drawBranch(ex, ey, angle + 0.4, depth - 1, len * 0.65);
            };
            drawBranch(tx, H, -Math.PI / 2, 5, 55 + rng() * 30);
          }
          // data-stream rivers (sinuous cyan lines)
          ctx.strokeStyle = 'rgba(100,230,255,0.4)'; ctx.lineWidth = 2;
          for (let r = 0; r < 4; r++) {
            const ry = H * 0.2 + rng() * H * 0.6;
            ctx.beginPath(); ctx.moveTo(0, ry);
            for (let x = 0; x <= W; x += 8) ctx.lineTo(x, ry + Math.sin((x + r * 200) * 0.03) * 18);
            ctx.stroke();
          }
          break;
        }

        // ── G03 深度学习: 蓝色六边形晶格 + 神经纤维光网 + 水晶折射 ─────────
        case 'crystal_lattice': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#040e2a'); g.addColorStop(0.5, '#0a1f5c'); g.addColorStop(1, '#030b1e');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // hex grid
          const hex = (cx, cy, r) => {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = Math.PI / 180 * (60 * k - 30);
              k === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
                      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
            }
            ctx.closePath();
          };
          const hr = 24, hh = hr * Math.sqrt(3);
          ctx.strokeStyle = 'rgba(80,160,255,0.45)'; ctx.lineWidth = 1;
          for (let row = 0; row < Math.ceil(H / hh) + 1; row++) {
            for (let col = 0; col < Math.ceil(W / (hr * 1.5)) + 1; col++) {
              const hx = col * hr * 3 + (row % 2) * hr * 1.5;
              const hy = row * hh * 0.5;
              hex(hx, hy, hr); ctx.stroke();
              // crystal glint
              if (rng() < 0.15) {
                ctx.fillStyle = 'rgba(140,200,255,0.3)';
                hex(hx, hy, hr); ctx.fill();
              }
            }
          }
          // neural fiber web
          ctx.strokeStyle = 'rgba(60,220,255,0.3)'; ctx.lineWidth = 1;
          const nodes = Array.from({length: 20}, () => [rng() * W, rng() * H]);
          nodes.forEach(([nx, ny]) => {
            nodes.forEach(([mx, my]) => {
              const d = Math.hypot(nx - mx, ny - my);
              if (d < 180 && d > 10) { ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(mx, my); ctx.stroke(); }
            });
          });
          break;
        }

        // ── G04 语言智能: 青绿波纹线(文字行) + token珊瑚礁 + 光流 ───────────
        case 'text_ocean': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#003c3c'); g.addColorStop(0.5, '#006666'); g.addColorStop(1, '#002828');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // text-like wavy lines
          ctx.strokeStyle = 'rgba(0,220,180,0.35)'; ctx.lineWidth = 1;
          for (let y = 8; y < H; y += 10) {
            ctx.beginPath();
            for (let x = 0; x <= W; x += 3) {
              const wy = y + Math.sin((x * 0.04) + (y * 0.08) + seed) * 4;
              x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
            }
            ctx.stroke();
          }
          // token coral clusters
          ctx.fillStyle = 'rgba(0,255,180,0.2)';
          for (let i = 0; i < 20; i++) {
            const tx = rng() * W, ty = rng() * H;
            for (let b = 0; b < 6; b++) {
              const bx = tx + (rng() - 0.5) * 60, by = ty + (rng() - 0.5) * 40;
              ctx.beginPath(); ctx.arc(bx, by, 4 + rng() * 10, 0, Math.PI * 2); ctx.fill();
            }
          }
          // light flow streaks
          ctx.strokeStyle = 'rgba(180,255,255,0.2)'; ctx.lineWidth = 2;
          for (let i = 0; i < 10; i++) {
            const lx = rng() * W;
            ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx + (rng() - 0.5) * 100, H); ctx.stroke();
          }
          break;
        }

        // ── G05 视觉感知: 品红/紫色棱镜森林 + 光折射彩虹条带 ───────────────
        case 'prism_forest': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#1a003a'); g.addColorStop(0.5, '#3d007a'); g.addColorStop(1, '#12002a');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // rainbow refraction bands (diagonal)
          const bands = ['rgba(255,0,180,0.12)', 'rgba(200,0,255,0.12)', 'rgba(80,0,255,0.12)',
                         'rgba(0,120,255,0.12)', 'rgba(0,220,255,0.12)'];
          bands.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            const bx = (i * 200 + seed * 40) % W;
            ctx.fillRect(bx, 0, 120, H);
          });
          // prism triangles (forest)
          ctx.strokeStyle = 'rgba(255,100,220,0.5)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 30; i++) {
            const px = rng() * W, py = H * 0.3 + rng() * H * 0.65;
            const ph = 40 + rng() * 90, pw = 20 + rng() * 30;
            ctx.beginPath();
            ctx.moveTo(px, py - ph);
            ctx.lineTo(px - pw / 2, py);
            ctx.lineTo(px + pw / 2, py);
            ctx.closePath(); ctx.stroke();
            if (rng() < 0.4) { ctx.fillStyle = 'rgba(220,0,255,0.1)'; ctx.fill(); }
          }
          break;
        }

        // ── G06 生成创造: 紫色星云斑块 + 气泡形气团 ─────────────────────────
        case 'nebula_garden': {
          ctx.fillStyle = '#0a001a'; ctx.fillRect(0, 0, W, H);
          // nebula blobs (radial gradients)
          for (let i = 0; i < 12; i++) {
            const nx = rng() * W, ny = rng() * H;
            const nr = 60 + rng() * 120;
            const hue = 260 + rng() * 60;
            const gr = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
            gr.addColorStop(0, `hsla(${hue},80%,60%,0.35)`);
            gr.addColorStop(0.5, `hsla(${hue + 20},70%,40%,0.15)`);
            gr.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gr; ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
          }
          // gas bubble outlines
          ctx.strokeStyle = 'rgba(200,120,255,0.3)'; ctx.lineWidth = 1;
          for (let i = 0; i < 20; i++) {
            const bx = rng() * W, by = rng() * H, br = 20 + rng() * 60;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
          }
          // star specks
          ctx.fillStyle = 'rgba(255,200,255,0.8)';
          for (let i = 0; i < 200; i++) {
            const sx = rng() * W, sy = rng() * H;
            ctx.fillRect(sx, sy, 1, 1);
          }
          break;
        }

        // ── G07 多模态: 左右半球不同颜色 + 双色分界线 ───────────────────────
        case 'twin_biome': {
          // left half: warm amber
          const gl = ctx.createLinearGradient(0, 0, W / 2, 0);
          gl.addColorStop(0, '#5a2000'); gl.addColorStop(1, '#c06000');
          ctx.fillStyle = gl; ctx.fillRect(0, 0, W / 2, H);
          // right half: cool teal
          const gr = ctx.createLinearGradient(W / 2, 0, W, 0);
          gr.addColorStop(0, '#004466'); gr.addColorStop(1, '#0088aa');
          ctx.fillStyle = gr; ctx.fillRect(W / 2, 0, W / 2, H);
          // dividing line glow
          const dg = ctx.createLinearGradient(W / 2 - 20, 0, W / 2 + 20, 0);
          dg.addColorStop(0, 'rgba(255,180,80,0)');
          dg.addColorStop(0.5, 'rgba(255,255,255,0.7)');
          dg.addColorStop(1, 'rgba(80,220,255,0)');
          ctx.fillStyle = dg; ctx.fillRect(W / 2 - 20, 0, 40, H);
          // surface texture on each side
          ctx.strokeStyle = 'rgba(255,200,100,0.2)'; ctx.lineWidth = 1;
          for (let y = 15; y < H; y += 20) {
            ctx.beginPath(); ctx.moveTo(0, y);
            for (let x = 0; x < W / 2; x += 4) ctx.lineTo(x, y + Math.sin(x * 0.05 + seed) * 5);
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(80,220,255,0.2)'; ctx.lineWidth = 1;
          for (let y = 15; y < H; y += 20) {
            ctx.beginPath(); ctx.moveTo(W / 2, y);
            for (let x = W / 2; x <= W; x += 4) ctx.lineTo(x, y + Math.sin(x * 0.05 + seed) * 5);
            ctx.stroke();
          }
          break;
        }

        // ── G08 强化学习: 深色地表 + 橙色熔岩裂缝网 + 爆炸坑 ───────────────
        case 'lava_field': {
          ctx.fillStyle = '#0a0400'; ctx.fillRect(0, 0, W, H);
          // lava crack network
          ctx.strokeStyle = 'rgba(255,100,0,0.7)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 25; i++) {
            const sx = rng() * W, sy = rng() * H;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            let cx2 = sx, cy2 = sy;
            for (let s = 0; s < 8; s++) {
              cx2 += (rng() - 0.5) * 80; cy2 += (rng() - 0.5) * 50;
              ctx.lineTo(cx2, cy2);
            }
            ctx.stroke();
          }
          // glow along cracks
          ctx.strokeStyle = 'rgba(255,160,0,0.25)'; ctx.lineWidth = 5;
          for (let i = 0; i < 12; i++) {
            const sx = rng() * W, sy = rng() * H;
            ctx.beginPath(); ctx.moveTo(sx, sy);
            let cx2 = sx, cy2 = sy;
            for (let s = 0; s < 5; s++) {
              cx2 += (rng() - 0.5) * 100; cy2 += (rng() - 0.5) * 60;
              ctx.lineTo(cx2, cy2);
            }
            ctx.stroke();
          }
          // impact craters
          for (let i = 0; i < 10; i++) {
            const kx = rng() * W, ky = rng() * H, kr = 15 + rng() * 35;
            const cg = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
            cg.addColorStop(0, 'rgba(80,20,0,0.8)');
            cg.addColorStop(0.6, 'rgba(200,60,0,0.3)');
            cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }

        // ── G09 知识检索: 绿色 + 垂直细条纹(书架) + 穹顶光晕 ───────────────
        case 'library_spire': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#001a00'); g.addColorStop(0.5, '#004400'); g.addColorStop(1, '#001200');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // bookshelf vertical stripes
          for (let x = 0; x < W; x += 8) {
            const brightness = 0.1 + rng() * 0.2;
            ctx.fillStyle = `rgba(0,${Math.floor(180 + rng() * 75)},0,${brightness})`;
            ctx.fillRect(x, 0, 4, H);
          }
          // horizontal shelf lines
          ctx.strokeStyle = 'rgba(0,180,60,0.3)'; ctx.lineWidth = 1;
          for (let y = 32; y < H; y += 32) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
          }
          // dome halo at top
          const dg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.7);
          dg.addColorStop(0, 'rgba(80,255,120,0.18)');
          dg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
          break;
        }

        // ── G10 智能体: 琥珀色 + 密集电路板正交网格线 ───────────────────────
        case 'circuit_grid': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#1a0a00'); g.addColorStop(0.5, '#3a1800'); g.addColorStop(1, '#120600');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // main orthogonal circuit traces
          ctx.strokeStyle = 'rgba(255,160,0,0.4)'; ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          // brighter trace highlights
          ctx.strokeStyle = 'rgba(255,200,80,0.6)'; ctx.lineWidth = 1.5;
          for (let i = 0; i < 20; i++) {
            const isH = rng() < 0.5;
            if (isH) {
              const y = Math.floor(rng() * (H / 16)) * 16;
              ctx.beginPath(); ctx.moveTo(rng() * W * 0.5, y); ctx.lineTo(W * 0.5 + rng() * W * 0.5, y); ctx.stroke();
            } else {
              const x = Math.floor(rng() * (W / 16)) * 16;
              ctx.beginPath(); ctx.moveTo(x, rng() * H * 0.5); ctx.lineTo(x, H * 0.5 + rng() * H * 0.5); ctx.stroke();
            }
          }
          // solder pads
          ctx.fillStyle = 'rgba(255,220,100,0.6)';
          for (let i = 0; i < 60; i++) {
            const px = Math.floor(rng() * (W / 16)) * 16;
            const py = Math.floor(rng() * (H / 16)) * 16;
            ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }

        // ── G11 具身智能: 钢蓝色 + 机械齿轮轮廓 + 金属光泽纹 ───────────────
        case 'mech_terrain': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#060e18'); g.addColorStop(0.5, '#0d2035'); g.addColorStop(1, '#040c14');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // metal sheen bands
          for (let y = 0; y < H; y += 4) {
            const v = 0.03 + Math.sin(y * 0.3 + seed) * 0.03;
            ctx.fillStyle = `rgba(100,160,220,${v})`;
            ctx.fillRect(0, y, W, 2);
          }
          // gear outlines
          const drawGear = (gx, gy, r, teeth) => {
            ctx.beginPath();
            for (let t = 0; t < teeth * 2; t++) {
              const a = (t / (teeth * 2)) * Math.PI * 2;
              const rad = t % 2 === 0 ? r : r * 0.75;
              const px2 = gx + Math.cos(a) * rad, py2 = gy + Math.sin(a) * rad;
              t === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
            }
            ctx.closePath();
          };
          ctx.strokeStyle = 'rgba(100,180,255,0.4)'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 8; i++) {
            const gx = rng() * W, gy = rng() * H;
            const gr2 = 20 + rng() * 50, teeth = 8 + Math.floor(rng() * 8);
            drawGear(gx, gy, gr2, teeth); ctx.stroke();
            ctx.beginPath(); ctx.arc(gx, gy, gr2 * 0.3, 0, Math.PI * 2); ctx.stroke();
          }
          break;
        }

        // ── G12 算力基建: 红色 + 散热片平行横纹 + 数据中心山脉轮廓 ──────────
        case 'datacenter_mountain': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#1a0000'); g.addColorStop(0.5, '#440000'); g.addColorStop(1, '#0e0000');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // heat-sink fin stripes
          for (let y = 0; y < H; y += 6) {
            const v = y % 12 === 0 ? 0.25 : 0.1;
            ctx.fillStyle = `rgba(255,80,0,${v})`;
            ctx.fillRect(0, y, W, 3);
          }
          // datacenter mountain silhouettes
          ctx.fillStyle = 'rgba(255,40,0,0.35)';
          for (let i = 0; i < 6; i++) {
            const mx = (i / 6) * W + rng() * (W / 8);
            const mh = H * 0.3 + rng() * H * 0.4;
            const mw = 60 + rng() * 100;
            // flat-topped mountain = datacenter block
            ctx.fillRect(mx - mw / 2, H - mh, mw, mh);
          }
          // vent glow dots
          ctx.fillStyle = 'rgba(255,120,0,0.6)';
          for (let i = 0; i < 80; i++) {
            const vx = rng() * W, vy = H * 0.4 + rng() * H * 0.5;
            ctx.fillRect(vx, vy, 2, 2);
          }
          break;
        }

        // ── G13 安全对齐: 银白色 + 放射状冰晶裂纹 + 穹顶折射 ───────────────
        case 'ice_shield': {
          const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
          g.addColorStop(0, '#d0e8ff'); g.addColorStop(0.5, '#8ab8e0'); g.addColorStop(1, '#2a4a6a');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // radial ice crack lines from multiple centers
          ctx.strokeStyle = 'rgba(200,230,255,0.5)'; ctx.lineWidth = 1;
          const centers = [[W / 2, H / 2], [W * 0.25, H * 0.3], [W * 0.75, H * 0.7]];
          centers.forEach(([cx2, cy2]) => {
            for (let a = 0; a < Math.PI * 2; a += Math.PI / (8 + rng() * 8)) {
              const len = 80 + rng() * 180;
              ctx.beginPath(); ctx.moveTo(cx2, cy2);
              ctx.lineTo(cx2 + Math.cos(a) * len, cy2 + Math.sin(a) * len);
              ctx.stroke();
            }
          });
          // dome refraction shimmer
          const dg = ctx.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.1, H * 0.9);
          dg.addColorStop(0, 'rgba(255,255,255,0.25)');
          dg.addColorStop(0.4, 'rgba(180,220,255,0.1)');
          dg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
          // frost sparkles
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          for (let i = 0; i < 150; i++) {
            const sx = rng() * W, sy = rng() * H;
            ctx.fillRect(sx, sy, 1.5, 1.5);
          }
          break;
        }

        // ── G14 社会影响: 紫色 + 星形空间站骨架网格 ─────────────────────────
        case 'station_cluster': {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#0d0022'); g.addColorStop(0.5, '#220044'); g.addColorStop(1, '#080016');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // star-shaped station skeleton grids
          const drawStar = (sx, sy, r, pts) => {
            ctx.beginPath();
            for (let p = 0; p < pts * 2; p++) {
              const a = (p / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
              const rad = p % 2 === 0 ? r : r * 0.45;
              const px2 = sx + Math.cos(a) * rad, py2 = sy + Math.sin(a) * rad;
              p === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
            }
            ctx.closePath();
          };
          ctx.strokeStyle = 'rgba(200,100,255,0.5)'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 12; i++) {
            const sx = rng() * W, sy = rng() * H;
            const sr = 25 + rng() * 55, pts = 4 + Math.floor(rng() * 4);
            drawStar(sx, sy, sr, pts); ctx.stroke();
            // hub
            ctx.beginPath(); ctx.arc(sx, sy, sr * 0.15, 0, Math.PI * 2); ctx.stroke();
          }
          // connecting grid lines
          ctx.strokeStyle = 'rgba(160,60,220,0.25)'; ctx.lineWidth = 1;
          for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
          for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
          // nebula glow
          const ng = ctx.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, W * 0.4);
          ng.addColorStop(0, 'rgba(180,0,255,0.12)');
          ng.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
          break;
        }

        default:
          return this.generatePlanetTexture(colorHex, seed);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    }

    // 5. 程序化纹理生成器 (高保真大陆、夜面灯光与云层) — 保留作为 fallback
    generatePlanetTexture(colorHex, seed = 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      const baseCol = new THREE.Color(colorHex);
      const darkCol = baseCol.clone().multiplyScalar(0.35);

      // 底色海洋/地质层
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, darkCol.getStyle());
      grad.addColorStop(0.5, baseCol.getStyle());
      grad.addColorStop(1, darkCol.getStyle());
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 大陆板块群
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      for (let i = 0; i < 28; i++) {
        const cx = ((i * 137.5 + seed * 31) % canvas.width);
        const cy = 100 + ((i * 79 + seed * 17) % (canvas.height - 200));
        const rad = 40 + (i % 7) * 25;

        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // 夜面城市灯光光点 (科技感节点)
      ctx.fillStyle = '#ffeedd';
      for (let j = 0; j < 300; j++) {
        const lx = Math.random() * canvas.width;
        const ly = Math.random() * canvas.height;
        ctx.fillRect(lx, ly, 1.5, 1.5);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    }

    generateCloudTexture(seed = 3) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      let s = seed * 7919;
      const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let band = 0; band < 7; band++) {
        const cy = 60 + band * 62 + rng() * 30;
        for (let i = 0; i < 26; i++) {
          const cx = rng() * 1024;
          const rx = 30 + rng() * 90;
          const ry = 6 + rng() * 16;
          const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
          const a = 0.18 + rng() * 0.3;
          grd.addColorStop(0, `rgba(255,255,255,${a})`);
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grd;
          ctx.save();
          ctx.translate(cx, cy + (rng() - 0.5) * 20);
          ctx.scale(1, ry / rx);
          ctx.translate(-cx, -cy);
          ctx.beginPath();
          ctx.arc(cx, cy, rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    }

    makeAtmosphere(radius, color, opts) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uPower: { value: opts.power },
          uBias: { value: opts.bias || 0 },
          uIntensity: { value: opts.intensity }
        },
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: opts.halo ? `
          uniform vec3 uColor; uniform float uPower; uniform float uBias; uniform float uIntensity;
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(max(0.0, uBias - dot(vN, vV)), uPower) * uIntensity;
            gl_FragColor = vec4(uColor * f, f);
          }` : `
          uniform vec3 uColor; uniform float uPower; uniform float uIntensity;
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower) * uIntensity;
            gl_FragColor = vec4(uColor * f, f);
          }`,
        side: opts.halo ? THREE.BackSide : THREE.FrontSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
    }

    // ── 星系视图：恒星 + 沿轨道运行的星球 ──────────────────────────────
    buildGalaxySystem() {
      disposeTree(this.galaxySystem);
      while (this.galaxySystem.children.length) this.galaxySystem.remove(this.galaxySystem.children[0]);
      this.removeSpaceLabels('planet');
      this.planetOrbs = [];

      const g = this.state.getCurrentGalaxy();
      this.galaxySystem.position.set(g.x, 0, g.z);
      const gc = new THREE.Color(g.color);

      this.galaxySystem.add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 24),
        new THREE.MeshBasicMaterial({ color: gc.clone().lerp(new THREE.Color(0xffffff), 0.55) })));
      this.galaxySystem.add(makeSprite(this.glowTex, gc, 30, 0.85));
      this.galaxySystem.add(makeSprite(this.glowTex, 0xffffff, 9, 0.9));

      const planets = Object.values(this.state.data.planets).filter(p => p.galaxyId === g.id);
      planets.forEach((p, i) => {
        const orbitR = 12 + (p.orbitRadius || (30 + i * 14)) * 0.36;
        const ringPts = [];
        for (let k = 0; k <= 128; k++) {
          const a = (k / 128) * Math.PI * 2;
          ringPts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR));
        }
        const isCurrent = p.id === this.state.currentPlanetId;
        this.galaxySystem.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts),
          new THREE.LineBasicMaterial({
            color: isCurrent ? 0xf2cb73 : gc, transparent: true, opacity: isCurrent ? 0.4 : 0.14,
            depthWrite: false, blending: THREE.AdditiveBlending
          })));

        const pivot = new THREE.Group();
        pivot.rotation.y = i * 2.15 + 0.6;
        const size = 0.8 + (p.size || 3) * 0.32;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 40, 28), new THREE.MeshStandardMaterial({
          map: this.generatePlanetTexture(p.color, i + 2),
          emissive: new THREE.Color(p.color), emissiveIntensity: 0.12, roughness: 0.8, metalness: 0.05
        }));
        mesh.position.set(orbitR, 0, 0);
        mesh.userData.planetId = p.id;
        mesh.add(makeSprite(this.glowTex, p.color, size * 3.4, 0.4));
        if (p.status !== 'open') {
          const scaffold = new THREE.Mesh(new THREE.TorusGeometry(size * 1.5, 0.03, 4, 48),
            new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.7 }));
          scaffold.rotation.x = Math.PI / 2.4;
          mesh.add(scaffold);
        }
        if (isCurrent) {
          const sel = makeSprite(this.ringTex, 0xf2cb73, size * 3.2, 0.9);
          mesh.add(sel);
        }
        pivot.add(mesh);
        this.galaxySystem.add(pivot);
        this.planetOrbs.push({ pivot, mesh, p, speed: (p.orbitSpeed || 0.001) * 50 });

        const unlocked = this.state.unlockedCount(p);
        const status = p.status === 'open' ? '已开放' : '建设中';
        const label = this.addSpaceLabel(mesh, new THREE.Vector3(0, -size - 0.8, 0),
          `<b>${p.name.split('·')[0].trim()}</b><small>${status} · 点亮 ${unlocked}/${p.nodes.length}</small>`,
          ['galaxy'], () => this.hooks.onPlanetPick && this.hooks.onPlanetPick(p.id), 'planet');
        label.el.style.setProperty('--accent', p.color);
        if (isCurrent) label.el.classList.add('is-current');
      });
    }

    planetCamPos() {
      const portrait = this.camera.aspect < 0.85;
      return new THREE.Vector3(0, 1.4, portrait ? 33 : 25);
    }

    treeTarget() { return new THREE.Vector3(0, this.treeCam.focusY, 0); }

    treeCamPos() {
      const portrait = this.camera.aspect < 0.85;
      const d = this.treeCam.dist * (portrait ? 1.95 : 1);
      return new THREE.Vector3(0, this.treeCam.focusY + 5.5, d);
    }

    // ── 星球：程序化地表 + 菲涅尔大气 + 云层 + 数据流星环 + 地表构造物 ──
    buildCurrentPlanet() {
      disposeTree(this.planetSystemGroup);
      while (this.planetSystemGroup.children.length) this.planetSystemGroup.remove(this.planetSystemGroup.children[0]);
      this.structures.clear();
      this.growing = [];
      if (this.structMats) Object.values(this.structMats).forEach(m => m.dispose());
      this.structMats = {};

      const p = this.state.getCurrentPlanet();
      const R = 6.0;
      this.planetRadius = R;
      const cfg = Universe3DRenderer.BIOME_CONFIG[p.galaxyId] || { biome: 'text_ocean', atmoOpacity: 0.18, hasRing: false };
      const pc = new THREE.Color(p.color);
      const atmoColor = pc.clone().lerp(new THREE.Color(0x5fe3f0), 0.35);

      const backdrop = makeSprite(this.glowTex, pc, 260, 0.16);
      backdrop.position.set(-70, 30, -190);
      this.planetSystemGroup.add(backdrop);

      this.activePlanetMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshStandardMaterial({
        map: this.generateBiomeTexture(p.galaxyId, p.color, 1),
        roughness: 0.72, metalness: 0.1
      }));
      this.planetSystemGroup.add(this.activePlanetMesh);

      this.activeCloudMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.016, 64, 48), new THREE.MeshStandardMaterial({
        map: this.generateCloudTexture(), transparent: true,
        opacity: Math.min(0.75, 0.35 + (cfg.atmoOpacity || 0.2) * 1.4), depthWrite: false
      }));
      this.activeCloudMesh.rotation.z = 0.12;
      this.planetSystemGroup.add(this.activeCloudMesh);

      this.planetSystemGroup.add(this.makeAtmosphere(R * 1.015, atmoColor, { power: 3.6, intensity: 0.75 }));
      this.planetSystemGroup.add(this.makeAtmosphere(R * 1.12, atmoColor, { halo: true, power: 4.2, bias: 0.46, intensity: 0.85 + (cfg.atmoOpacity || 0.2) }));

      if (cfg.hasRing) {
        const ringGeom = new THREE.RingGeometry(R * 1.42, R * 2.1, 128);
        const rc = document.createElement('canvas');
        rc.width = 512; rc.height = 8;
        const rx = rc.getContext('2d');
        for (let i = 0; i < 512; i++) {
          const a = (0.25 + 0.6 * Math.abs(Math.sin(i * 0.11) * Math.sin(i * 0.037))) * (i < 30 || i > 490 ? 0.2 : 1);
          rx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          rx.fillRect(i, 0, 1, 8);
        }
        // RingGeometry 的 UV 按 x/y 映射，这里改成按半径采样
        const pos = ringGeom.attributes.position, uv = ringGeom.attributes.uv, v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i);
          uv.setXY(i, (v3.length() - R * 1.42) / (R * 0.68), 0.5);
        }
        this.activeRingMesh = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(rc), color: pc.clone().lerp(new THREE.Color(0xffffff), 0.5),
          side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false
        }));
        this.activeRingMesh.rotation.x = Math.PI / 2.25;
        this.activeRingMesh.rotation.y = 0.18;
        this.planetSystemGroup.add(this.activeRingMesh);
      } else {
        this.activeRingMesh = null;
      }

      this.scaffoldMesh = null;
      if (p.status === 'construction' || p.status === 'planning') {
        this.scaffoldMesh = new THREE.Mesh(new THREE.TorusGeometry(R * 1.32, 0.04, 6, 96),
          new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.55, wireframe: true }));
        this.scaffoldMesh.rotation.x = Math.PI / 2.5;
        this.planetSystemGroup.add(this.scaffoldMesh);
      }

      // 已解锁节点的持续产出，用环绕星球的数据流光点表现
      const moteCount = 160;
      const mpos = new Float32Array(moteCount * 3);
      for (let i = 0; i < moteCount; i++) {
        const a = (i / moteCount) * Math.PI * 2 + Math.random() * 0.04;
        const r = R * (1.45 + Math.random() * 0.25);
        mpos[i * 3] = Math.cos(a) * r;
        mpos[i * 3 + 1] = gaussian() * 0.15;
        mpos[i * 3 + 2] = Math.sin(a) * r;
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
      this.moteRing = new THREE.Points(mg, new THREE.PointsMaterial({
        size: 0.22, map: this.glowTex, color: atmoColor.clone().lerp(new THREE.Color(0xffffff), 0.4),
        transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      this.moteRing.rotation.x = 0.42;
      this.moteRing.rotation.z = -0.18;
      this.planetSystemGroup.add(this.moteRing);

      this.structuresGroup = new THREE.Group();
      this.veinsGroup = new THREE.Group();
      this.activePlanetMesh.add(this.structuresGroup);
      this.activePlanetMesh.add(this.veinsGroup);
      this.updateSurfaceStructures(null);

      if (this.hooks.onPlanetBuilt) this.hooks.onPlanetBuilt();
    }

    structureDir(i, n) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / n) * 0.92;
      const theta = i * 2.399963;
      return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    }

    structureMaterial(branch, ghost) {
      const key = ghost ? 'ghost' : branch;
      if (!this.structMats[key]) {
        const c = new THREE.Color(BRANCH_COLORS[branch] || 0x5fe3f0);
        this.structMats[key] = ghost
          ? new THREE.MeshBasicMaterial({ color: 0xb57bff, wireframe: true, transparent: true, opacity: 0.5 })
          : new THREE.MeshStandardMaterial({
            color: c.clone().lerp(new THREE.Color(0xffffff), 0.25), emissive: c,
            emissiveIntensity: 0.8, metalness: 0.55, roughness: 0.3
          });
      }
      return this.structMats[key];
    }

    // 每类节点在地表对应一种构造物：核心尖塔、扩展楼栋、里程碑拱门、增益穹顶、考核方尖碑、隐秘浮晶
    buildStructureMesh(node, ghost) {
      const g = new THREE.Group();
      const mat = this.structureMaterial(node.branch, ghost);
      const add = (geom, y, rx) => {
        const m = new THREE.Mesh(geom, mat);
        m.position.y = y;
        if (rx) m.rotation.y = rx;
        g.add(m);
        return m;
      };
      if (node.epoch === 0) {
        add(new THREE.CylinderGeometry(0.12, 0.42, 0.5, 8), 0.25);
        add(new THREE.OctahedronGeometry(0.42, 0), 0.95);
      } else if (node.type === 'core') {
        add(new THREE.CylinderGeometry(0.04, 0.2, 1.4, 6), 0.7);
        add(new THREE.OctahedronGeometry(0.15, 0), 1.55);
      } else if (node.type === 'milestone') {
        add(new THREE.TorusGeometry(0.34, 0.07, 6, 18, Math.PI), 0, 0);
      } else if (node.type === 'boost') {
        add(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0);
      } else if (node.type === 'challenge') {
        add(new THREE.ConeGeometry(0.22, 1.25, 4), 0.62, Math.PI / 4);
      } else if (node.type === 'secret') {
        add(new THREE.OctahedronGeometry(0.22, 0), 0.9);
      } else {
        add(new THREE.BoxGeometry(0.24, 0.62, 0.24), 0.31, 0.4);
        add(new THREE.BoxGeometry(0.16, 0.36, 0.16), 0.18, 0).position.x = 0.22;
      }
      if (!ghost) {
        const tip = makeSprite(this.glowTex, BRANCH_COLORS[node.branch] || 0x5fe3f0, node.epoch === 0 ? 2.6 : 1.1, 0.7);
        tip.position.y = node.epoch === 0 ? 1.0 : (node.type === 'core' ? 1.55 : 0.6);
        g.add(tip);
      }
      g.scale.setScalar(0.85);
      return g;
    }

    updateSurfaceStructures(animateId) {
      if (!this.structuresGroup) return;
      const p = this.state.getCurrentPlanet();
      const R = this.planetRadius;
      const n = p.nodes.length;
      const pole = new THREE.Vector3(0, 1, 0);
      const UP = new THREE.Vector3(0, 1, 0);

      p.nodes.forEach((node, i) => {
        const want = this.state.unlockedNodes.has(node.id) ? 'on' : (this.state.dormantNodes.has(node.id) ? 'ghost' : null);
        const cur = this.structures.get(node.id);
        if (cur && cur.kind === want) return;
        if (cur) {
          this.structuresGroup.remove(cur.mesh);
          cur.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) o.material.dispose(); });
          if (cur.vein) { this.veinsGroup.remove(cur.vein); cur.vein.geometry.dispose(); cur.vein.material.dispose(); }
          this.structures.delete(node.id);
        }
        if (!want) return;

        const dir = this.structureDir(i, n);
        const mesh = this.buildStructureMesh(node, want === 'ghost');
        mesh.position.copy(dir).multiplyScalar(R * 0.995);
        mesh.quaternion.setFromUnitVectors(UP, dir);
        this.structuresGroup.add(mesh);

        let vein = null;
        if (want === 'on' && i > 0) {
          const pts = [];
          const q = new THREE.Quaternion();
          const qTarget = new THREE.Quaternion().setFromUnitVectors(pole, dir);
          for (let k = 0; k <= 32; k++) {
            q.copy(new THREE.Quaternion()).slerp(qTarget, k / 32);
            pts.push(pole.clone().applyQuaternion(q).multiplyScalar(R * 1.004));
          }
          vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({
            color: BRANCH_COLORS[node.branch] || 0x5fe3f0, transparent: true, opacity: 0.32,
            depthWrite: false, blending: THREE.AdditiveBlending
          }));
          this.veinsGroup.add(vein);
        }
        this.structures.set(node.id, { mesh, vein, kind: want });

        if (animateId === node.id) {
          if (!REDUCED_MOTION) {
            mesh.scale.setScalar(0.001);
            this.growing.push({ mesh, start: this.clock.elapsedTime, dur: 1.3, to: 0.85 });
          }
          this.activePlanetMesh.updateMatrixWorld(true);
          const world = new THREE.Vector3();
          mesh.getWorldPosition(world);
          const normal = world.clone().normalize();
          this.spawnBeam(mesh, BRANCH_COLORS[node.branch] || 0x5fe3f0);
          this.spawnRipple(world, normal, BRANCH_COLORS[node.branch] || 0x5fe3f0, 1.4);
          this.spawnBurst(world, normal, BRANCH_COLORS[node.branch] || 0x5fe3f0, 18, 3);
        }
      });

      const unlocked = this.state.unlockedCount(p);
      if (this.moteRing) this.moteRing.geometry.setDrawRange(0, Math.min(160, 10 + unlocked * 12));
    }

    // ── 特效：光柱、涟漪、粒子迸发 ─────────────────────────────────────
    spawnBeam(parent, color) {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 7, 16, 1, true), mat);
      beam.position.y = 3.5;
      parent.add(beam);
      let age = 0;
      this.fx.push({
        update: dt => {
          age += dt;
          const k = age / 1.4;
          if (k >= 1) { parent.remove(beam); beam.geometry.dispose(); mat.dispose(); return false; }
          mat.opacity = 0.7 * (1 - k);
          beam.scale.set(1 + k * 0.6, 0.4 + ease.outCubic(Math.min(1, k * 3)) * 0.6, 1 + k * 0.6);
          return true;
        }
      });
    }

    spawnRipple(point, normal, color, size = 1, parent) {
      const host = parent || this.scene;
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 64), mat);
      m.position.copy(point).addScaledVector(normal, 0.04);
      m.lookAt(point.clone().add(normal));
      host.add(m);
      let age = 0;
      const life = 0.9;
      this.fx.push({
        update: dt => {
          age += dt;
          const k = age / life;
          if (k >= 1) { host.remove(m); m.geometry.dispose(); mat.dispose(); return false; }
          m.scale.setScalar(0.4 + ease.outCubic(k) * 2.6 * size);
          mat.opacity = 0.6 * (1 - k) * (1 - k);
          return true;
        }
      });
    }

    spawnBurst(point, normal, color, count, speed, parent) {
      const host = parent || this.scene;
      for (let i = 0; i < count; i++) {
        const base = 0.35 + Math.random() * 0.45;
        const s = makeSprite(this.glowTex, color, base, 1);
        s.position.copy(point);
        host.add(s);
        const rnd = new THREE.Vector3(gaussian(), gaussian(), gaussian()).normalize();
        const v = normal.clone().multiplyScalar(speed * (0.4 + Math.random())).addScaledVector(rnd, speed * 0.75);
        const life = 0.45 + Math.random() * 0.45;
        let age = 0;
        this.fx.push({
          update: dt => {
            age += dt;
            if (age >= life) { host.remove(s); s.material.dispose(); return false; }
            v.multiplyScalar(Math.pow(0.06, dt));
            s.position.addScaledVector(v, dt);
            const k = age / life;
            s.material.opacity = 1 - k;
            s.scale.setScalar(base * (1 - k * 0.5));
            return true;
          }
        });
      }
    }

    // ── 交互 ─────────────────────────────────────────────────────────────
    setMouse(e) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
    }

    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pointer = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, onCanvas: true };
      if (this.viewMode === 'tree' && this.hooks.onTreeDragStart) this.hooks.onTreeDragStart();
    }

    onPointerMove(e) {
      if (this.pointer) {
        const dx = e.clientX - this.pointer.lastX;
        const dy = e.clientY - this.pointer.lastY;
        this.pointer.lastX = e.clientX;
        this.pointer.lastY = e.clientY;
        if (this.viewMode === 'tree' && this.hooks.onTreeDrag) this.hooks.onTreeDrag(dx, dy);
        return;
      }
      if (e.target !== this.renderer.domElement || this.camFlight) return;
      this.setMouse(e);
      let hover = false;
      if (this.viewMode === 'planet') {
        hover = this.raycaster.intersectObject(this.activePlanetMesh).length > 0;
      } else if (this.viewMode === 'universe') {
        hover = this.raycaster.intersectObjects(this.galaxyHits).length > 0;
      } else if (this.viewMode === 'galaxy') {
        const hit = this.raycaster.intersectObjects(this.planetOrbs.map(o => o.mesh))[0];
        hover = !!hit;
        this.spaceLabels.forEach(l => l.el.classList.toggle('is-hover', !!hit && l.obj === hit.object));
      } else if (this.viewMode === 'tree' && this.hooks.onTreeHover) {
        hover = this.hooks.onTreeHover(this.raycaster);
      }
      this.renderer.domElement.style.cursor = hover ? 'pointer' : (this.viewMode === 'tree' ? 'grab' : '');
    }

    onPointerUp(e) {
      if (!this.pointer) return;
      const p = this.pointer;
      this.pointer = null;
      if (this.viewMode === 'tree' && this.hooks.onTreeDragEnd) this.hooks.onTreeDragEnd();
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (dist < 6 && e.target === this.renderer.domElement && !this.camFlight) this.handleClick(e);
    }

    onWheel(e) {
      if (this.viewMode !== 'tree') return;
      e.preventDefault();
      this.treeCam.dist = Math.max(24, Math.min(62, this.treeCam.dist * (1 + e.deltaY * 0.0012)));
    }

    handleClick(e) {
      this.setMouse(e);
      if (this.viewMode === 'planet') {
        const hit = this.raycaster.intersectObject(this.activePlanetMesh)[0];
        if (hit) this.tapPlanet(hit, e);
      } else if (this.viewMode === 'universe') {
        const hit = this.raycaster.intersectObjects(this.galaxyHits)[0];
        if (hit && this.hooks.onGalaxyPick) this.hooks.onGalaxyPick(hit.object.userData.galaxyId);
      } else if (this.viewMode === 'galaxy') {
        const hit = this.raycaster.intersectObjects(this.planetOrbs.map(o => o.mesh))[0];
        if (hit && this.hooks.onPlanetPick) this.hooks.onPlanetPick(hit.object.userData.planetId);
      } else if (this.viewMode === 'tree' && this.hooks.onTreeClick) {
        this.hooks.onTreeClick(this.raycaster);
      }
    }

    tapPlanet(hit, e) {
      const crit = Math.random() < 0.12;
      const gain = this.state.tapPlanet(crit);
      this.sound.playTap(crit);
      const p = this.state.getCurrentPlanet();
      const normal = hit.point.clone().normalize();
      const color = crit ? 0xf2cb73 : new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.45);
      this.spawnBurst(hit.point, normal, color, crit ? 30 : 12, crit ? 8 : 4.5);
      this.spawnRipple(hit.point, normal, color, crit ? 1.7 : 0.9);
      this.spring.v -= crit ? 1.6 : 0.8;
      if (crit) this.shake = 0.5;
      if (this.hooks.onTap) this.hooks.onTap(gain, crit, e.clientX, e.clientY);
    }

    // ── 镜头飞行 ─────────────────────────────────────────────────────────
    flyTo(pos, target, dur = 1.4, onDone, arc = 0) {
      this.camFlight = {
        p0: this.camera.position.clone(), p1: pos.clone(),
        t0: this.controls.target.clone(), t1: target.clone(),
        start: this.clock.elapsedTime, dur: REDUCED_MOTION ? 0.01 : dur, onDone, arc
      };
      this.controls.enabled = false;
    }

    warp() {
      this.sound.playWarp();
      if (this.hooks.onWarp) this.hooks.onWarp();
    }

    applyModeVisibility(mode) {
      const cosmic = mode === 'universe' || mode === 'galaxy';
      this.cosmos.visible = cosmic;
      this.galaxySystem.visible = mode === 'galaxy';
      this.planetSystemGroup.visible = mode === 'planet' || mode === 'tree';
      const cur = this.state.currentGalaxyId;
      this.galaxyMeshes.forEach(m => {
        const focus = mode === 'galaxy' && m.g.id === cur;
        const backdrop = mode === 'galaxy' && !focus;
        m.tilt.children[0].visible = !focus;
        m.tilt.children[1].visible = !focus;
        m.tilt.children[0].material.opacity = backdrop ? 0.12 : 0.85;
        m.tilt.children[1].material.opacity = backdrop ? 0.15 : 0.95;
        m.arms.material.opacity = focus ? 0.3 : (backdrop ? 0.07 : 0.95);
      });
      this.cosmicLinks.forEach(l => { l.visible = mode === 'universe'; });
      this.bridges.forEach(b => { b.pulse.visible = mode === 'universe'; });
      if (mode === 'universe') { this.controls.minDistance = 160; this.controls.maxDistance = 2400; }
      else if (mode === 'galaxy') { this.controls.minDistance = 30; this.controls.maxDistance = 420; }
      else { this.controls.minDistance = 12; this.controls.maxDistance = 70; }
    }

    orbFor(planetId) { return this.planetOrbs.find(o => o.p.id === planetId); }

    setViewMode(mode) {
      const prev = this.viewMode;
      if (prev === mode) return;
      this.viewMode = mode;
      const g = this.state.getCurrentGalaxy();
      const gPos = new THREE.Vector3(g.x, 0, g.z);
      const fromNear = prev === 'planet' || prev === 'tree';
      const planetTarget = new THREE.Vector3(0, -0.9, 0);

      if (mode === 'universe') {
        if (fromNear) {
          this.warp();
          this.camera.position.set(g.x + 6, 14, g.z + 46);
          this.controls.target.copy(gPos);
        }
        this.applyModeVisibility('universe');
        const far = this.camera.aspect < 0.85 ? 2.1 : 1;
        this.flyTo(new THREE.Vector3(10 * far, 420 * far, 600 * far), new THREE.Vector3(0, 30, 20), 2.4);
      } else if (mode === 'galaxy') {
        this.buildGalaxySystem();
        if (fromNear) {
          this.warp();
          this.planetOrbs.forEach(o => o.pivot.updateMatrixWorld(true));
          const orb = this.orbFor(this.state.currentPlanetId);
          const at = orb ? orb.mesh.getWorldPosition(new THREE.Vector3()) : gPos;
          this.camera.position.copy(at).add(new THREE.Vector3(0, 1.5, 7));
          this.controls.target.copy(at);
        }
        this.applyModeVisibility('galaxy');
        const far = this.camera.aspect < 0.85 ? 1.8 : 1;
        this.flyTo(gPos.clone().add(new THREE.Vector3(0, 62 * far, 100 * far)), gPos.clone().add(new THREE.Vector3(0, -6, 0)), 2.0);
      } else if (mode === 'planet' || mode === 'tree') {
        const finalPos = mode === 'tree' ? this.treeCamPos() : this.planetCamPos();
        const finalTarget = mode === 'tree' ? this.treeTarget() : planetTarget;
        const arrive = () => {
          this.warp();
          this.applyModeVisibility(mode);
          this.camera.position.set(0, 9, 70);
          this.controls.target.copy(finalTarget);
          this.flyTo(finalPos, finalTarget, 1.6);
        };
        if (prev === 'galaxy') {
          const orb = this.orbFor(this.state.currentPlanetId);
          if (orb) {
            const at = orb.mesh.getWorldPosition(new THREE.Vector3());
            this.flyTo(at.clone().add(new THREE.Vector3(0, 1.2, 6.5)), at, 1.0, arrive);
            return;
          }
          arrive();
        } else if (prev === 'universe') {
          arrive();
        } else {
          this.applyModeVisibility(mode);
          this.flyTo(finalPos, finalTarget, mode === 'tree' ? 1.5 : 1.3, null, mode === 'tree' ? 3 : 0);
        }
      }
    }

    // ── 主循环 ───────────────────────────────────────────────────────────
    animate() {
      requestAnimationFrame(() => this.animate());
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;

      if (this.camFlight) {
        const f = this.camFlight;
        const k = clamp01((t - f.start) / f.dur);
        const e = ease.inOutCubic(k);
        this.camera.position.lerpVectors(f.p0, f.p1, e);
        if (f.arc) this.camera.position.y += Math.sin(Math.PI * e) * f.arc;
        this.controls.target.lerpVectors(f.t0, f.t1, e);
        this.camera.lookAt(this.controls.target);
        if (k >= 1) {
          this.camFlight = null;
          this.controls.enabled = this.viewMode !== 'tree';
          if (f.onDone) f.onDone();
        }
      } else if (this.viewMode === 'tree') {
        const s = 1 - Math.pow(0.02, dt);
        this.camera.position.lerp(this.treeCamPos(), s);
        this.controls.target.lerp(this.treeTarget(), s);
        this.camera.lookAt(this.controls.target);
      } else {
        this.controls.update();
      }

      const vo = this.viewOffset, vt = this.viewOffsetTarget;
      vo.x += (vt.x - vo.x) * Math.min(1, dt * 6);
      vo.y += (vt.y - vo.y) * Math.min(1, dt * 6);
      const w = this.container.clientWidth, h = this.container.clientHeight;
      if (Math.abs(vo.x) > 0.5 || Math.abs(vo.y) > 0.5) this.camera.setViewOffset(w, h, vo.x, vo.y, w, h);
      else if (this.camera.view && this.camera.view.enabled) this.camera.clearViewOffset();

      this.starfield.rotation.y += dt * 0.004;

      if (this.cosmos.visible) {
        this.agiDisk.rotation.y += dt * 0.08;
        this.galaxyMeshes.forEach(m => { m.tilt.rotation.y += dt * m.spin; });
        this.bridges.forEach(b => {
          b.t = (b.t + dt * b.speed) % 1;
          b.pulse.position.copy(b.curve.getPoint(b.t));
          b.pulse.material.opacity = Math.sin(b.t * Math.PI) * 0.9;
        });
      }
      if (this.galaxySystem.visible) {
        this.planetOrbs.forEach(o => {
          o.pivot.rotation.y += dt * o.speed;
          o.mesh.rotation.y += dt * 0.25;
        });
      }
      if (this.planetSystemGroup.visible && this.activePlanetMesh) {
        const spinTarget = this.viewMode === 'tree' ? 0.12 : 1;
        this.spinScale += (spinTarget - this.spinScale) * Math.min(1, dt * 1.5);
        this.activePlanetMesh.rotation.y += dt * 0.07 * this.spinScale;
        this.activeCloudMesh.rotation.y += dt * 0.1 * this.spinScale;
        if (this.scaffoldMesh) this.scaffoldMesh.rotation.z += dt * 0.25;
        if (this.activeRingMesh) this.activeRingMesh.rotation.z += dt * 0.03;
        const rates = this.state.getRates();
        if (this.moteRing) this.moteRing.rotation.y += dt * (0.1 + Math.min(0.8, rates.dataPerSec / 60));

        const sp = this.spring;
        sp.v += (-200 * sp.x - 15 * sp.v) * dt;
        sp.x += sp.v * dt;
        this.activePlanetMesh.scale.setScalar(1 + sp.x * 0.05);

        this.growing = this.growing.filter(gw => {
          const k = clamp01((t - gw.start) / gw.dur);
          gw.mesh.scale.setScalar(Math.max(0.001, ease.outBack(k) * gw.to));
          return k < 1;
        });
      }

      const running = this.fx;
      this.fx = [];
      this.fx = running.filter(f => f.update(dt) !== false).concat(this.fx);
      if (this.hooks.onFrame) this.hooks.onFrame(dt, t);

      let shakeOff = null;
      if (this.shake > 0.01) {
        shakeOff = new THREE.Vector3(gaussian(), gaussian(), 0).multiplyScalar(this.shake * 0.25);
        this.camera.position.add(shakeOff);
        this.shake *= Math.pow(0.004, dt);
      }
      this.renderer.render(this.scene, this.camera);
      if (shakeOff) this.camera.position.sub(shakeOff);
      this.updateSpaceLabels();
    }
  }

  // =========================================================================
  // 4. 3D 生命树：从星球北极的星核向上生长，四个纪元环层层展开
  // =========================================================================
  const TIER_Y = [7.6, 11.0, 14.8, 18.6, 22.2];
  const TIER_R = [0, 5.5, 7.0, 8.0, 8.6];
  const BRANCH_DEG = { core: 0, mechanism: 0, application: 58, boost: 108, evolution: 160, secret: 212, boundary: 270, challenge: 322 };
  const TYPE_LIFT = { challenge: 0.85, boost: -0.55, milestone: 0.35, secret: 0.6 };
  const NODE_LOOK = {
    unlocked: { color: 0x06d6a0, emissive: 0x06d6a0, ei: 0.85, halo: 0x06d6a0, ha: 0.5, op: 1 },
    available: { color: 0xf2cb73, emissive: 0xf2cb73, ei: 0.95, halo: 0xf2cb73, ha: 0.62, op: 1 },
    needRes: { color: 0x7d6a45, emissive: 0xf2cb73, ei: 0.2, halo: 0xf2cb73, ha: 0.16, op: 0.95 },
    dormant: { color: 0x8f6cd9, emissive: 0xb57bff, ei: 0.55, halo: 0xb57bff, ha: 0.32, op: 0.9 },
    needPrereq: { color: 0x3a5566, emissive: 0x5fe3f0, ei: 0.16, halo: 0x5fe3f0, ha: 0.08, op: 0.88 },
    building: { color: 0x4a4232, emissive: 0xffb347, ei: 0.12, halo: 0xffb347, ha: 0.06, op: 0.7 }
  };
  const TWO_PI = Math.PI * 2;
  const wrapAngle = a => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

  class LifeTree3D {
    constructor(r3d, state, sound, labelLayer, hooks) {
      this.r3d = r3d;
      this.state = state;
      this.sound = sound;
      this.layer = labelLayer;
      this.hooks = hooks || {};
      this.group = new THREE.Group();
      this.group.visible = false;
      r3d.scene.add(this.group);

      this.entries = new Map();
      this.edges = [];
      this.tiers = [];
      this.rot = 0;
      this.rotTarget = 0;
      this.rotVel = 0;
      this.selectedId = null;
      this.hoverId = null;
      this.recommendedId = null;
      this.revealStart = -10;
      this.hideStart = null;
      this.lastStatus = -1;
      this.statusDirty = true;
      this._v = new THREE.Vector3();
    }

    clear() {
      disposeTree(this.group);
      while (this.group.children.length) this.group.remove(this.group.children[0]);
      this.layer.innerHTML = '';
      this.entries.clear();
      this.edges = [];
      this.tiers = [];
      this.flow = null;
    }

    build(planet) {
      this.clear();
      this.planet = planet;
      this.selectedId = null;
      this.hoverId = null;

      const byTier = [[], [], [], [], []];
      planet.nodes.forEach(n => byTier[Math.min(4, n.epoch || 0)].push(n));

      byTier[0].forEach(n => this.place(n, 0, 0, TIER_Y[0], 0));
      for (let e = 1; e <= 4; e++) {
        const nodes = byTier[e];
        if (!nodes.length) continue;
        const r = TIER_R[e];
        const groups = {};
        nodes.forEach(n => { (groups[n.branch] = groups[n.branch] || []).push(n); });
        const items = [];
        Object.keys(groups).forEach(br => {
          const list = groups[br];
          const c = (BRANCH_DEG[br] !== undefined ? BRANCH_DEG[br] : 0) * Math.PI / 180;
          list.forEach((n, k) => items.push({ n, a: c + (k - (list.length - 1) / 2) * 0.46 }));
        });
        // 同环节点按最小弧长互相推开，保证标签与点击区不重叠
        const minGap = Math.min(3.2 / r, TWO_PI / items.length * 0.97);
        for (let iter = 0; iter < 120; iter++) {
          items.forEach(it => { it.a = ((it.a % TWO_PI) + TWO_PI) % TWO_PI; });
          items.sort((x, y) => x.a - y.a);
          let moved = false;
          for (let i = 0; i < items.length; i++) {
            const a = items[i], b = items[(i + 1) % items.length];
            let gap = b.a - a.a;
            if (i === items.length - 1) gap += TWO_PI;
            if (items.length > 1 && gap < minGap) {
              const push = (minGap - gap) / 2;
              a.a -= push;
              b.a += push;
              moved = true;
            }
          }
          if (!moved) break;
        }
        items.forEach(({ n, a }) => this.place(n, wrapAngle(a), r, TIER_Y[e] + (TYPE_LIFT[n.type] || 0), e));
      }

      this.buildTiers(byTier);
      this.buildEdges();
      this.statusDirty = true;
      this.refreshStatus(true);

      const remembered = this.state.lastSelected[planet.id];
      const rec = this.state.recommendNode(planet);
      const startId = (remembered && this.entries.has(remembered)) ? remembered : (rec ? rec.id : planet.nodes[0].id);
      const start = this.entries.get(startId);
      this.rot = this.rotTarget = start && start.r ? -start.angle : 0;
      this.group.rotation.y = this.rot;
      this.pendingSelect = startId;
    }

    nodeGeometry(n) {
      if (n.epoch === 0) return new THREE.IcosahedronGeometry(1.05, 1);
      switch (n.type) {
        case 'core': return new THREE.IcosahedronGeometry(0.6, 0);
        case 'milestone': return new THREE.BoxGeometry(0.5, 0.8, 0.5);
        case 'boost': return new THREE.CylinderGeometry(0.44, 0.44, 0.2, 6);
        case 'challenge': return new THREE.TorusGeometry(0.66, 0.1, 10, 40);
        case 'secret': return new THREE.DodecahedronGeometry(0.5, 0);
        default: return new THREE.OctahedronGeometry(0.46, 0);
      }
    }

    place(n, angle, r, y, tier) {
      const holder = new THREE.Group();
      holder.position.set(Math.sin(angle) * r, y, Math.cos(angle) * r);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2b3c4a, emissive: 0x5fe3f0, emissiveIntensity: 0.05,
        metalness: 0.45, roughness: 0.28, flatShading: true, transparent: true
      });
      const body = new THREE.Mesh(this.nodeGeometry(n), mat);
      if (n.type === 'boost') body.rotation.x = Math.PI / 2;
      if (n.type === 'milestone') body.rotation.y = Math.PI / 4;
      holder.add(body);
      if (n.type === 'challenge') {
        const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat);
        body.add(inner);
      }
      const halo = makeSprite(this.r3d.glowTex, 0x5fe3f0, n.epoch === 0 ? 6 : 2.8, 0.05);
      holder.add(halo);
      const ring = makeSprite(this.r3d.ringTex, 0xffffff, n.epoch === 0 ? 3.8 : 2.3, 0);
      holder.add(ring);
      const beacon = makeSprite(this.r3d.ringTex, 0xf2cb73, 2.3, 0);
      holder.add(beacon);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(n.epoch === 0 ? 1.6 : 1.05, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.nodeId = n.id;
      holder.add(hit);
      this.group.add(holder);

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'tl-node';
      label.dataset.id = n.id;
      label.innerHTML = '<span class="tl-name"></span><span class="tl-sub"></span>';
      label.addEventListener('click', ev => {
        ev.stopPropagation();
        this.select(n.id, { focus: true, sound: true });
      });
      label.addEventListener('pointerenter', () => { this.hoverId = n.id; });
      label.addEventListener('pointerleave', () => { if (this.hoverId === n.id) this.hoverId = null; });
      label.addEventListener('focus', () => this.select(n.id, { focus: true }));
      this.layer.appendChild(label);

      this.entries.set(n.id, {
        node: n, holder, body, mat, halo, ring, beacon, hit, label,
        angle, r, y, tier, status: null, look: null,
        delay: tier === 0 ? 0 : 0.18 + tier * 0.16 + (angle + Math.PI) / TWO_PI * 0.12,
        pulseAt: -10, lw: 0, lh: 0
      });
    }

    buildTiers(byTier) {
      this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, TIER_Y[4] + 1 - 6, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x5fe3f0, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.trunk.position.y = 6 + (TIER_Y[4] + 1 - 6) / 2;
      this.group.add(this.trunk);
      this.trunkGlow = makeSprite(this.r3d.glowTex, 0x5fe3f0, 1, 0.25);
      this.trunkGlow.scale.set(1.6, TIER_Y[4] - 4, 1);
      this.trunkGlow.position.y = this.trunk.position.y;
      this.group.add(this.trunkGlow);

      for (let e = 1; e <= 4; e++) {
        if (!byTier[e].length) continue;
        const r = TIER_R[e], y = TIER_Y[e];
        const pts = [];
        for (let k = 0; k <= 180; k++) {
          const a = (k / 180) * TWO_PI;
          pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
        }
        const ringMat = new THREE.LineBasicMaterial({ color: 0x5fe3f0, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending });
        const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
        this.group.add(ring);
        const disc = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r + 0.6, 128, 1),
          new THREE.MeshBasicMaterial({ color: 0x5fe3f0, transparent: true, opacity: 0.025, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = y;
        this.group.add(disc);
        const hub = makeSprite(this.r3d.glowTex, 0x5fe3f0, 1.4, 0.3);
        hub.position.y = y;
        this.group.add(hub);

        const el = document.createElement('div');
        el.className = 'tl-tier';
        el.innerHTML = `<b>${EPOCH_NAMES[e]}</b><span class="tl-tier-meta"></span>`;
        this.layer.appendChild(el);
        this.tiers.push({ e, r, y, ring, ringMat, disc, hub, el, nodes: byTier[e], flashAt: -10 });
      }
    }

    edgeCurve(A, B) {
      const pts = [];
      const a1 = B.angle;
      const a0 = A.r === 0 ? a1 : A.angle;
      const d = wrapAngle(a1 - a0);
      const sameTier = A.tier === B.tier;
      for (let k = 0; k <= 28; k++) {
        const t = k / 28;
        const ang = a0 + d * t;
        const s = t * t * (3 - 2 * t);
        const r = A.r + (B.r - A.r) * (A.r === 0 ? Math.sqrt(t) : t) + Math.sin(Math.PI * t) * (sameTier ? 0.85 : 0.45);
        const y = A.y + (B.y - A.y) * s + (sameTier ? Math.sin(Math.PI * t) * 0.3 : 0);
        pts.push(new THREE.Vector3(Math.sin(ang) * r, y, Math.cos(ang) * r));
      }
      return new THREE.CatmullRomCurve3(pts);
    }

    buildEdges() {
      this.entries.forEach(B => {
        (B.node.prereqs || []).forEach(pid => {
          const A = this.entries.get(pid);
          if (!A) return;
          const curve = this.edgeCurve(A, B);
          const mat = new THREE.MeshBasicMaterial({ color: 0x3c5563, transparent: true, opacity: 0.3, depthWrite: false });
          const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.045, 6, false), mat);
          this.group.add(mesh);
          this.edges.push({ A, B, curve, mesh, mat, state: 'dim' });
        });
      });
      const n = this.edges.length * 3;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.flow = new THREE.Points(geom, new THREE.PointsMaterial({
        size: 0.55, map: this.r3d.glowTex, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      this.flow.frustumCulled = false;
      this.group.add(this.flow);
    }

    statusText(e) {
      const st = e.status;
      const n = e.node;
      if (st.state === 'unlocked') {
        const m = this.state.mastery[n.id];
        if (this.state.isDue(n)) return '该复训了';
        return m ? `已点亮 · ${m.g}` : '已点亮';
      }
      if (st.state === 'dormant') return '待复训';
      if (st.state === 'building') return '建设中';
      if (st.state === 'available') return window.Levels.modeFor(n) ? `可挑战 · ${window.Levels.MODE_NAMES[window.Levels.modeFor(n)]}` : '可点亮';
      if (st.state === 'needRes') {
        const s = st.short;
        if (s.data > 0) return `还差 ${formatNumber(Math.ceil(s.data))} 数据`;
        if (s.insight > 0) return `还差 ${Math.ceil(s.insight)} 洞见`;
        return `还差 ${formatNumber(Math.ceil(s.compute))} 算力`;
      }
      return '待前置';
    }

    displayName(e) {
      const n = e.node;
      if (n.type === 'secret' && e.status && e.status.state !== 'unlocked') return '未揭示档案';
      return shortName(n);
    }

    refreshStatus(force) {
      const t = this.r3d.clock.elapsedTime;
      const rec = this.state.recommendNode(this.planet);
      this.recommendedId = rec ? rec.id : null;

      this.entries.forEach(e => {
        const st = this.state.nodeStatus(e.node);
        const prev = e.status ? e.status.state : null;
        const text = this.statusTextFor(e, st);
        if (!force && prev === st.state && e.subText === text) return;
        e.status = st;
        const look = NODE_LOOK[st.state];
        e.look = look;
        e.mat.color.setHex(look.color);
        e.mat.emissive.setHex(look.emissive);
        e.mat.emissiveIntensity = look.ei;
        e.mat.opacity = look.op;
        e.mat.wireframe = e.node.type === 'secret' && st.state !== 'unlocked';
        e.halo.material.color.setHex(look.halo);
        e.label.className = `tl-node st-${st.state} type-${e.node.type}${e.node.epoch === 0 ? ' is-core' : ''}`;
        e.label.querySelector('.tl-name').textContent = this.displayName(e);
        e.label.querySelector('.tl-sub').textContent = text;
        e.subText = text;
        e.label.setAttribute('aria-label', `${this.displayName(e)}，${EPOCH_NAMES[e.node.epoch || 0]}，${text}`);
        e.lw = 0;
        if (prev && prev !== st.state && st.state === 'available') e.pulseAt = t;
      });

      this.edges.forEach(ed => {
        const a = ed.A.status.state, b = ed.B.status.state;
        let s = 'dim';
        if (a === 'unlocked' && b === 'unlocked') s = 'lit';
        else if (a === 'unlocked' && (b === 'available' || b === 'needRes')) s = 'path';
        else if (a === 'dormant' || b === 'dormant') s = 'dormant';
        ed.state = s;
        const c = { lit: 0x06d6a0, path: 0xf2cb73, dormant: 0xb57bff, dim: 0x56798a }[s];
        ed.mat.color.setHex(c);
        ed.baseOpacity = { lit: 0.85, path: 0.75, dormant: 0.45, dim: 0.36 }[s];
      });

      const col = this.flow ? this.flow.geometry.attributes.color : null;
      if (col) {
        this.edges.forEach((ed, i) => {
          const c = new THREE.Color(ed.state === 'lit' ? 0x8ff5ff : (ed.state === 'path' ? 0xffe39a : 0x000000));
          for (let k = 0; k < 3; k++) col.setXYZ(i * 3 + k, c.r, c.g, c.b);
        });
        col.needsUpdate = true;
      }

      let frontier = 1;
      this.tiers.forEach(tr => {
        const done = tr.nodes.filter(n => this.state.unlockedNodes.has(n.id)).length;
        tr.done = done;
        tr.el.querySelector('.tl-tier-meta').textContent = `${EPOCH_ROMAN[tr.e]} · ${done}/${tr.nodes.length}`;
        if (done > 0) frontier = Math.max(frontier, tr.e);
      });
      this.tiers.forEach(tr => {
        const lit = tr.done > 0;
        const isFrontier = tr.e === frontier;
        tr.ringMat.color.setHex(tr.done === tr.nodes.length ? 0x06d6a0 : (isFrontier ? 0xf2cb73 : 0x5fe3f0));
        tr.baseOpacity = lit || isFrontier ? 0.42 : 0.14;
        tr.el.classList.toggle('is-frontier', isFrontier);
        tr.el.classList.toggle('is-done', tr.done === tr.nodes.length);
      });
      this.frontier = frontier;
      this.lastStatus = t;
      this.statusDirty = false;
    }

    statusTextFor(e, st) {
      const saved = e.status;
      e.status = st;
      const txt = this.statusText(e);
      e.status = saved;
      return txt;
    }

    // ── 交互 ─────────────────────────────────────────────────────────────
    pick(raycaster) {
      if (!this.group.visible) return null;
      const hits = raycaster.intersectObjects(Array.from(this.entries.values()).map(e => e.hit));
      return hits.length ? hits[0].object.userData.nodeId : null;
    }

    handleHover(raycaster) {
      const id = this.pick(raycaster);
      if (id !== this.hoverId) {
        this.hoverId = id;
        if (id) this.sound.playHover();
      }
      return !!id;
    }

    handleClick(raycaster) {
      const id = this.pick(raycaster);
      if (id) this.select(id, { focus: true, sound: true });
    }

    dragStart() { this.rotVel = 0; this.dragging = true; }
    drag(dx, dy) {
      this.rotTarget += dx * 0.0065;
      this.rotVel = dx * 0.0065;
      const cam = this.r3d.treeCam;
      cam.focusY = Math.max(11, Math.min(19.5, cam.focusY + dy * 0.035));
    }
    dragEnd() {
      this.dragging = false;
      this.rotTarget += this.rotVel * 7;
    }

    select(id, opts = {}) {
      const e = this.entries.get(id);
      if (!e) return;
      const changed = this.selectedId !== id;
      this.selectedId = id;
      if (opts.focus) {
        if (e.r > 0) this.rotTarget += wrapAngle(-e.angle - this.rotTarget);
        this.r3d.treeCam.focusY = Math.max(12, Math.min(18.5, 13.5 + (e.y - 13.5) * 0.55));
      }
      if (opts.sound && changed) this.sound.playSelect();
      this.state.lastSelected[this.planet.id] = id;
      this.state.save();
      if (this.hooks.onSelect) this.hooks.onSelect(e.node);
    }

    // 键盘：← → 在同一纪元内按方位切换，↑ ↓ 跨纪元
    neighbor(dir) {
      const cur = this.entries.get(this.selectedId);
      if (!cur) return;
      const list = Array.from(this.entries.values());
      const facing = e => wrapAngle(e.angle + this.rotTarget);
      if (dir === 'left' || dir === 'right') {
        const same = list.filter(e => e.tier === cur.tier && e !== cur && e.r > 0);
        if (!same.length) return;
        const base = facing(cur);
        const sign = dir === 'right' ? 1 : -1;
        let best = null, bestD = Infinity;
        same.forEach(e => {
          let d = wrapAngle(facing(e) - base) * sign;
          if (d <= 0) d += TWO_PI;
          if (d < bestD) { bestD = d; best = e; }
        });
        if (best) this.select(best.node.id, { focus: true, sound: true });
      } else {
        const tier = cur.tier + (dir === 'up' ? 1 : -1);
        const cands = list.filter(e => e.tier === tier);
        if (!cands.length) return;
        let best = cands[0], bestD = Infinity;
        cands.forEach(e => {
          const d = Math.abs(wrapAngle(facing(e) - (cur.r ? facing(cur) : 0)));
          if (d < bestD) { bestD = d; best = e; }
        });
        this.select(best.node.id, { focus: true, sound: true });
      }
    }

    show() {
      this.group.visible = true;
      this.group.scale.setScalar(1);
      this.hideStart = null;
      this.revealStart = this.r3d.clock.elapsedTime + 0.35;
      this.layer.classList.add('is-active');
      this.statusDirty = true;
      if (this.pendingSelect) {
        const id = this.pendingSelect;
        this.pendingSelect = null;
        this.select(id, { focus: true });
      } else if (this.selectedId) {
        this.select(this.selectedId, { focus: false });
      }
    }

    hide() {
      if (!this.group.visible || this.hideStart !== null) return;
      this.hideStart = this.r3d.clock.elapsedTime;
      this.layer.classList.remove('is-active');
    }

    // ── 点亮仪式：节点迸发 → 能量沿树干回流星球 → 地表长出构造物 ─────────
    celebrate(id, onArrive) {
      const e = this.entries.get(id);
      if (!e) { if (onArrive) onArrive(); return; }
      const r3d = this.r3d;
      const local = e.holder.position.clone();
      const up = new THREE.Vector3(0, 1, 0);
      const teal = 0x06d6a0;

      const wave = makeSprite(r3d.ringTex, teal, 1, 1);
      wave.position.copy(local);
      this.group.add(wave);
      let age = 0;
      r3d.fx.push({
        update: dt => {
          age += dt;
          const k = age / 1.1;
          if (k >= 1) { this.group.remove(wave); wave.material.dispose(); return false; }
          wave.scale.setScalar(1 + ease.outCubic(k) * (e.tier === 0 ? 12 : 8));
          wave.material.opacity = 1 - k;
          return true;
        }
      });
      r3d.spawnBurst(local, up, 0x9ff8e0, 26, 5.5, this.group);
      r3d.shake = Math.max(r3d.shake, 0.35);

      if (e.node.type === 'challenge') {
        const tier = this.tiers.find(tr => tr.e === e.tier);
        if (tier) tier.flashAt = r3d.clock.elapsedTime;
      }

      const path = new THREE.CatmullRomCurve3([
        local.clone(),
        new THREE.Vector3(local.x * 0.35, local.y - 0.4, local.z * 0.35),
        new THREE.Vector3(0, Math.max(6.4, local.y - 2.5), 0),
        new THREE.Vector3(0, 6.05, 0)
      ]);
      const mote = makeSprite(r3d.glowTex, 0xbffcef, 1.6, 1);
      this.group.add(mote);
      const trail = [];
      let mAge = 0;
      const dur = REDUCED_MOTION ? 0.01 : 1.0;
      r3d.fx.push({
        update: dt => {
          mAge += dt;
          const k = clamp01((mAge - 0.25) / dur);
          mote.position.copy(path.getPoint(ease.inOutCubic(k)));
          if (k > 0 && k < 1 && Math.random() < 0.8) {
            const s = makeSprite(r3d.glowTex, 0x5fe3f0, 0.7, 0.8);
            s.position.copy(mote.position);
            this.group.add(s);
            trail.push({ s, age: 0 });
          }
          for (let i = trail.length - 1; i >= 0; i--) {
            const tr = trail[i];
            tr.age += dt;
            tr.s.material.opacity = 0.8 * (1 - tr.age / 0.5);
            if (tr.age >= 0.5) { this.group.remove(tr.s); tr.s.material.dispose(); trail.splice(i, 1); }
          }
          if (k >= 1 && trail.length === 0) {
            this.group.remove(mote);
            mote.material.dispose();
            return false;
          }
          if (k >= 1 && !mote.userData.arrived) {
            mote.userData.arrived = true;
            mote.visible = false;
            r3d.spawnRipple(new THREE.Vector3(0, 6.02, 0), up, teal, 2.2);
            r3d.spring.v += 1.2;
            this.sound.playGrow();
            if (onArrive) onArrive();
          }
          return true;
        }
      });
    }

    // ── 每帧 ─────────────────────────────────────────────────────────────
    update(dt, t) {
      if (!this.group.visible) return;
      if (this.hideStart !== null) {
        const k = clamp01((t - this.hideStart) / 0.35);
        this.group.scale.setScalar(Math.max(0.001, 1 - ease.outCubic(k)));
        if (k >= 1) { this.group.visible = false; this.hideStart = null; }
        return;
      }
      if (!this.dragging) this.rotVel *= Math.pow(0.02, dt);
      this.rot += (this.rotTarget - this.rot) * (1 - Math.pow(0.004, dt));
      this.group.rotation.y = this.rot;

      if (this.statusDirty || t - this.lastStatus > 0.4) this.refreshStatus(false);

      const rv = t - this.revealStart;
      const trunkK = ease.outCubic(clamp01(rv / 0.9));
      this.trunk.scale.set(1, Math.max(0.001, trunkK), 1);
      this.trunk.position.y = 6 + (TIER_Y[4] + 1 - 6) * trunkK / 2;
      this.trunkGlow.material.opacity = 0.22 * trunkK;

      this.tiers.forEach(tr => {
        const k = ease.outCubic(clamp01((rv - 0.1 - tr.e * 0.14) / 0.7));
        const s = Math.max(0.001, 0.3 + 0.7 * k);
        tr.ring.scale.set(s, 1, s);
        tr.disc.scale.set(s, s, 1);
        const flash = clamp01(1 - (t - tr.flashAt) / 2.2);
        tr.ringMat.opacity = (tr.baseOpacity || 0.15) * k + flash * 0.9;
        if (flash > 0) tr.ringMat.color.lerp(new THREE.Color(0xfff0c2), flash * 0.5);
        tr.disc.material.opacity = 0.025 + flash * 0.18;
      });

      this.entries.forEach(e => {
        const k = clamp01((rv - e.delay) / 0.55);
        e.appear = k;
        const s = Math.max(0.001, ease.outBack(k));
        const st = e.status ? e.status.state : 'needPrereq';
        const selected = e.node.id === this.selectedId;
        const hovered = e.node.id === this.hoverId;
        const grow = (selected ? 1.18 : 1) * (hovered ? 1.12 : 1);
        e.holder.scale.setScalar(s * grow);
        e.body.rotation.y += dt * (st === 'needPrereq' ? 0.15 : 0.55);
        if (e.node.type === 'challenge') e.body.rotation.z = Math.sin(t * 0.6 + e.angle) * 0.15;

        let ha = e.look ? e.look.ha : 0.05;
        let hs = e.node.epoch === 0 ? 6 : 2.8;
        if (st === 'available') { const p = 0.5 + 0.5 * Math.sin(t * 3.2 + e.angle); ha *= 0.65 + 0.5 * p; hs *= 0.9 + 0.25 * p; }
        if (st === 'dormant') ha *= 0.7 + 0.3 * Math.sin(t * 2.4 + e.angle * 3);
        const pulse = clamp01(1 - (t - e.pulseAt) / 1.4);
        ha += pulse * 0.6;
        hs *= 1 + pulse * 1.2;
        e.halo.material.opacity = ha * k;
        e.halo.scale.setScalar(hs);

        e.ring.material.opacity = selected ? 0.85 : (hovered ? 0.35 : 0);
        e.ring.material.rotation += dt * 0.6;
        const isRec = e.node.id === this.recommendedId && !selected;
        if (isRec) {
          const cyc = (t * 0.7) % 1;
          e.beacon.material.opacity = (1 - cyc) * 0.8 * k;
          e.beacon.scale.setScalar(2 + cyc * 2.6);
        } else {
          e.beacon.material.opacity = 0;
        }
      });

      if (this.flow) {
        const pos = this.flow.geometry.attributes.position;
        this.edges.forEach((ed, i) => {
          const active = ed.state === 'lit' || ed.state === 'path';
          const reveal = clamp01((rv - ed.B.delay) / 0.6);
          ed.mat.opacity = (ed.baseOpacity || 0.3) * reveal;
          for (let k = 0; k < 3; k++) {
            if (active && reveal > 0.9) {
              const u = ((t * (ed.state === 'path' ? 0.42 : 0.28)) + k / 3 + i * 0.137) % 1;
              const p = ed.curve.getPoint(u);
              pos.setXYZ(i * 3 + k, p.x, p.y, p.z);
            } else {
              pos.setXYZ(i * 3 + k, 0, -999, 0);
            }
          }
        });
        pos.needsUpdate = true;
      }

      this.updateLabels(t);
    }

    updateLabels() {
      const r3d = this.r3d;
      const w = r3d.container.clientWidth, h = r3d.container.clientHeight;
      const v = this._v;
      const items = [];
      const flying = !!r3d.camFlight;

      this.entries.forEach(e => {
        e.holder.getWorldPosition(v);
        const front = e.r > 0 ? v.z / e.r : 1;
        v.project(r3d.camera);
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;
        const st = e.status ? e.status.state : 'needPrereq';
        const selected = e.node.id === this.selectedId;
        const hovered = e.node.id === this.hoverId;
        let pri = { available: 500, dormant: 320, needRes: 300, unlocked: 260, needPrereq: 100 }[st] || 0;
        if (e.node.id === this.recommendedId) pri += 300;
        if (e.node.epoch === 0) pri += 200;
        if (hovered) pri = 2000;
        if (selected) pri = 3000;
        pri += front * 120;
        items.push({ e, sx, sy, front, pri, forced: selected || hovered, ok: v.z < 1 && e.appear > 0.6 && !flying });
      });
      items.sort((a, b) => b.pri - a.pri);

      const placed = [];
      const overlaps = (a, b) => a.x < b.x + b.w + 6 && a.x + a.w + 6 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y;
      items.forEach(it => {
        const e = it.e;
        const el = e.label;
        if (!e.lw) { e.lw = el.offsetWidth || 90; e.lh = el.offsetHeight || 36; }
        const dy = e.node.epoch === 0 ? 30 : 17;
        const rect = { x: Math.max(6, Math.min(w - e.lw - 6, it.sx - e.lw / 2)), y: it.sy + dy, w: e.lw, h: e.lh };
        let show = it.ok && (it.front > -0.2 || it.forced);
        if (show && !it.forced) {
          for (const p of placed) { if (overlaps(rect, p)) { show = false; break; } }
        }
        // 节点本身的位置也要避让，防止标签盖住别的节点
        if (show) placed.push(rect);
        el.style.transform = `translate(${rect.x.toFixed(1)}px, ${rect.y.toFixed(1)}px)`;
        el.style.setProperty('--front', clamp01(0.45 + it.front * 0.55).toFixed(2));
        el.classList.toggle('is-visible', show);
        el.classList.toggle('is-selected', e.node.id === this.selectedId);
        el.classList.toggle('is-recommended', e.node.id === this.recommendedId);
        el.tabIndex = it.ok ? 0 : -1;
      });

      this.tiers.forEach(tr => {
        v.set(-(tr.r + 1.1), tr.y, 0).project(r3d.camera);
        if (!tr.lw) tr.lw = tr.el.offsetWidth;
        const sx = Math.max(tr.lw + 8, (v.x * 0.5 + 0.5) * w);
        const sy = (-v.y * 0.5 + 0.5) * h;
        tr.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-100%, -50%)`;
        tr.el.classList.toggle('is-visible', !flying && v.z < 1);
      });
    }
  }

  // =========================================================================
  // 5. 主控制器
  // =========================================================================
  class EngineApp {
    constructor() {
      this.data = window.UNIVERSE_DATA;
      this.sound = new SoundSynth();
      this.state = new EvolutionState(this.data);
      this.mode = 'planet';
      this.selectedNode = null;
      this.activeQuizNode = null;
      // intent：unlock 首次点亮 / relight 跃迁复训 / improve 已点亮节点再挑战
      this.quiz = { result: null, applied: false, intent: 'unlock' };
      this.$ = id => document.getElementById(id);
    }

    start() {
      this.r3d = new Universe3DRenderer(this.$('canvas-container'), this.state, this.sound, {
        onGalaxyPick: gid => this.enterGalaxy(gid),
        onPlanetPick: pid => this.selectPlanet(pid),
        onTap: (gain, crit, x, y) => this.onTap(gain, crit, x, y),
        onWarp: () => this.warpFlash(),
        onTreeClick: rc => this.tree && this.tree.handleClick(rc),
        onTreeHover: rc => (this.tree ? this.tree.handleHover(rc) : false),
        onTreeDragStart: () => this.tree && this.tree.dragStart(),
        onTreeDrag: (dx, dy) => this.tree && this.tree.drag(dx, dy),
        onTreeDragEnd: () => this.tree && this.tree.dragEnd(),
        onFrame: (dt, t) => this.tree && this.tree.update(dt, t)
      });
      this.tree = new LifeTree3D(this.r3d, this.state, this.sound, this.$('tree-labels'), {
        onSelect: node => this.showNodeDetail(node)
      });
      this.tree.build(this.state.getCurrentPlanet());

      const sfx = {
        correct: () => this.sound.playCorrect(),
        wrong: () => this.sound.playWrong(),
        combo: () => this.sound.playEpoch(),
        select: () => this.sound.playSelect()
      };
      this.runner = new window.Levels.LevelRunner(this.$('assessment-modal').querySelector('.terminal-box'), {
        name: n => shortName(n),
        sound: k => sfx[k] && sfx[k](),
        onFinish: r => { this.quiz.result = r; },
        onConfirm: () => this.closeAssessmentModal(),
        onRetry: p => this.openLevel(p.node, this.quiz.intent),
        onReplay: (r, p) => this.replayForLevel(r, p),
        confirmLabel: () => ({ relight: '唤醒', improve: '记录评级' }[this.quiz.intent] || '点亮') + `「${shortName(this.activeQuizNode)}」`
      });

      this.initUI();
      this.setModeClass('planet');
      this.updateBreadcrumb();
      this.updateHUD(true);
      if (this.state.offlineReport) setTimeout(() => this.openOfflineReport(), 900);

      let last = performance.now();
      let hudAcc = 0;
      const loop = now => {
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        this.state.tick(dt);
        hudAcc += dt;
        if (hudAcc > 0.12) { hudAcc = 0; this.updateHUD(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      setInterval(() => this.state.save(), 5000);

      const wakeAudio = () => { this.sound.init(); this.sound.startDrone(); };
      window.addEventListener('pointerdown', wakeAudio, { once: true });
      window.addEventListener('keydown', wakeAudio, { once: true });
      if (this.state.tapCount >= 6) this.$('tap-prompt').classList.add('is-done');
    }

    initUI() {
      this.renderSidePlanetList();
      document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.setViewMode(b.dataset.go)));
      this.$('btn-toggle-side').addEventListener('click', () => this.toggleSidePanel());
      this.$('btn-toggle-sound').addEventListener('click', () => this.toggleSound());
      this.$('quest-chip').addEventListener('click', () => this.followQuest());
      this.$('dock-action').addEventListener('click', () => this.handleNodeAction());
      this.$('dock-episode').addEventListener('click', () => {
        const n = this.selectedNode;
        if (n && n.episode) this.openEpisode(n.episode, n);
      });
      this.$('dock-conditions').addEventListener('click', e => {
        const b = e.target.closest('[data-jump]');
        if (b) this.tree.select(b.dataset.jump, { focus: true, sound: true });
      });
      this.$('btn-prestige-trigger').addEventListener('click', () => this.openPrestigeModal());
      this.$('quiz-close').addEventListener('click', () => this.closeAssessmentModal());
      this.$('offline-close').addEventListener('click', () => this.closeOfflineReport());
      this.$('offline-reviews').addEventListener('click', e => {
        const b = e.target.closest('[data-review]');
        if (b) this.jumpToNode(b.dataset.review);
      });
      this.$('prestige-cancel').addEventListener('click', () => this.closePrestigeModal());
      this.$('prestige-confirm').addEventListener('click', () => this.confirmPrestige());
      this.$('ep-close').addEventListener('click', () => this.closeEpisode());
      this.$('ep-btn-rate').addEventListener('click', () => window.EpisodeBridge && window.EpisodeBridge.cycleRate());
      this.$('ep-pause').addEventListener('click', () => window.EpisodeBridge && window.EpisodeBridge.episodeCmd('pause'));
      this.$('ep-play').addEventListener('click', () => window.EpisodeBridge && window.EpisodeBridge.episodeCmd('play'));

      window.addEventListener('resize', () => this.updateViewOffset());
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); this.goBack(); return; }
        const modal = this.$('assessment-modal').classList.contains('active');
        if (modal) {
          if (this.runner.handleKey(e)) e.preventDefault();
          return;
        }
        if (this.isOverlayOpen()) return;
        if (this.mode === 'tree') {
          const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
          if (dir) { e.preventDefault(); this.tree.neighbor(dir); return; }
          if (e.key === 'Enter' && !(document.activeElement && document.activeElement.closest('button'))) {
            e.preventDefault();
            this.handleNodeAction();
            return;
          }
        }
        if ((e.key === 't' || e.key === 'T') && (this.mode === 'planet' || this.mode === 'tree')) {
          this.setViewMode(this.mode === 'tree' ? 'planet' : 'tree');
        }
      });
    }

    isOverlayOpen() {
      return ['assessment-modal', 'prestige-modal', 'episode-player-overlay', 'offline-modal'].some(id => this.$(id).classList.contains('active'));
    }

    // Esc 每次只退一层
    goBack() {
      if (this.$('episode-player-overlay').classList.contains('active')) return this.closeEpisode();
      if (this.$('assessment-modal').classList.contains('active')) return this.closeAssessmentModal();
      if (this.$('offline-modal').classList.contains('active')) return this.closeOfflineReport();
      if (this.$('prestige-modal').classList.contains('active')) return this.closePrestigeModal();
      if (!this.$('side-panel').classList.contains('collapsed')) return this.toggleSidePanel(false);
      const up = { tree: 'planet', planet: 'galaxy', galaxy: 'universe' }[this.mode];
      if (up) this.setViewMode(up);
    }

    setModeClass(mode) {
      document.body.dataset.mode = mode;
      document.querySelectorAll('.scale-ladder [data-go]').forEach(b => {
        if (b.dataset.go === mode) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    setViewMode(mode) {
      if (mode === this.mode) return;
      if (this.r3d.camFlight && this.r3d.camFlight.onDone) return;
      this.mode = mode;
      this.setModeClass(mode);
      if (mode === 'tree') {
        this.tree.show();
        this.toggleSidePanel(false);
      } else {
        this.tree.hide();
      }
      this.r3d.setViewMode(mode);
      this.updateViewOffset();
      this.updateBreadcrumb();
      this.updateQuest(true);
    }

    updateViewOffset() {
      const wide = window.innerWidth > 760;
      if (this.mode === 'tree') {
        this.r3d.viewOffsetTarget = wide
          ? { x: Math.min(220, (this.$('node-dock').offsetWidth || 380) / 2 + 12), y: 0 }
          : { x: 0, y: Math.round(window.innerHeight * 0.2) };
      } else {
        this.r3d.viewOffsetTarget = { x: 0, y: 0 };
      }
    }

    enterGalaxy(gid) {
      this.state.currentGalaxyId = gid;
      this.renderSidePlanetList();
      if (this.mode === 'galaxy') return;
      this.setViewMode('galaxy');
    }

    selectPlanet(planetId) {
      const p = this.data.planets[planetId];
      if (!p) return;
      const changed = planetId !== this.state.currentPlanetId;
      this.state.currentPlanetId = planetId;
      this.state.currentGalaxyId = p.galaxyId;
      this.state.save();
      if (changed) {
        this.r3d.buildCurrentPlanet();
        this.tree.build(p);
        if (this.mode === 'planet' || this.mode === 'tree') this.warpFlash();
        if (p.status !== 'open') this.notify(`${p.name.split('·')[0].trim()} 建设中`, '可以预览生命树，内容上线后开放闯关；已点亮的进度会保留', 'warn');
      }
      this.renderSidePlanetList();
      this.updateBreadcrumb();
      this.updateHUD(true);
      if (this.mode === 'tree') this.tree.show();
      if (this.mode !== 'planet' && this.mode !== 'tree') this.setViewMode('planet');
      this.sound.playSelect();
    }

    toggleSidePanel(force) {
      const panel = this.$('side-panel');
      const open = force !== undefined ? force : panel.classList.contains('collapsed');
      panel.classList.toggle('collapsed', !open);
      this.$('btn-toggle-side').setAttribute('aria-expanded', String(open));
    }

    toggleSound() {
      const on = this.sound.toggle();
      const btn = this.$('btn-toggle-sound');
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-mute');
      btn.querySelector('.ctrl-label').textContent = on ? '声音' : '静音';
    }

    renderSidePlanetList() {
      const list = this.$('side-planet-list');
      list.innerHTML = '';
      const g = this.state.getCurrentGalaxy();
      this.$('side-galaxy-name').textContent = g.name;
      const ids = Object.keys(this.data.planets).filter(pid => this.data.planets[pid].galaxyId === g.id);
      this.$('side-planet-count').textContent = `${ids.length} 颗星球`;
      ids.forEach(pid => {
        const p = this.data.planets[pid];
        const done = this.state.unlockedCount(p);
        const total = p.nodes.length;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `planet-card-item${pid === this.state.currentPlanetId ? ' active' : ''}`;
        card.style.setProperty('--accent', p.color);
        const [nm, sub] = p.name.split('·').map(s => s.trim());
        card.innerHTML = `
          <span class="p-card-top"><span class="p-card-name"><i class="p-dot"></i>${nm}</span>
            <span class="p-status-tag ${p.status}">${p.status === 'open' ? '已开放' : '建设中 · 可预览'}</span></span>
          <span class="p-card-sub">${sub || ''}</span>
          <span class="p-card-meta"><span class="p-bar"><i style="width:${(done / total * 100).toFixed(1)}%"></i></span>
            <span>${done}/${total}</span><span>${p.episodeRef ? '含正片' : '知识卡'}</span></span>`;
        card.addEventListener('click', () => this.selectPlanet(pid));
        list.appendChild(card);
      });
    }

    updateBreadcrumb() {
      const g = this.state.getCurrentGalaxy();
      const p = this.state.getCurrentPlanet();
      this.$('crumb-galaxy').textContent = g.name;
      this.$('crumb-planet').textContent = p.name.split('·')[0].trim();
      this.$('dock-planet').textContent = p.name.split('·')[0].trim();
    }

    // ── HUD ──────────────────────────────────────────────────────────────
    updateHUD(force) {
      const res = this.state.resources;
      const rates = this.state.getRates();
      this.$('val-data').textContent = formatNumber(res.data);
      this.$('rate-data').textContent = `+${formatNumber(rates.dataPerSec)}/秒`;
      this.$('val-compute').textContent = formatNumber(res.compute);
      this.$('rate-compute').textContent = `+${formatNumber(rates.computePerSec)}/秒`;
      this.$('val-insight').textContent = Math.floor(res.insight);
      this.$('val-paradigm').textContent = res.paradigmFragments;

      const p = this.state.getCurrentPlanet();
      const done = this.state.unlockedCount(p);
      const total = p.nodes.length;
      this.$('txt-progress').textContent = `${done} / ${total}`;
      this.$('bar-progress').style.width = `${Math.min(100, (done / total) * 100).toFixed(1)}%`;
      const maxEpoch = p.nodes.filter(n => this.state.unlockedNodes.has(n.id)).reduce((m, n) => Math.max(m, n.epoch || 0), 0);
      const exploring = Math.min(4, Math.max(1, this.tree && this.tree.frontier ? this.tree.frontier : maxEpoch || 1));
      this.$('current-epoch-badge').textContent = EPOCH_NAMES[exploring];
      this.$('current-epoch-roman').textContent = EPOCH_ROMAN[exploring];

      const pr = this.$('btn-prestige-trigger');
      const dormant = this.state.dormantCount(p);
      const ready = done >= 10 && dormant === 0;
      pr.classList.toggle('is-ready', ready);
      pr.title = dormant ? `还有 ${dormant} 个残影待复训` : (ready ? '发起范式跃迁' : `再点亮 ${10 - done} 个节点即可跃迁`);

      this.updateQuest(force);
      if (this.mode === 'tree' && this.selectedNode) {
        const st = this.state.nodeStatus(this.selectedNode);
        const sig = st.state + JSON.stringify(st.short && {
          d: Math.ceil(st.short.data), c: Math.ceil(st.short.compute), i: Math.ceil(st.short.insight)
        });
        if (sig !== this.dockSig) this.showNodeDetail(this.selectedNode, true);
      }
    }

    updateQuest(force) {
      const chip = this.$('quest-chip');
      const p = this.state.getCurrentPlanet();
      const rec = this.state.recommendNode(p);
      if (!rec) {
        const due = this.state.dueNodes(p)[0];
        this.questNode = due || null;
        this.$('q-bar').style.width = '100%';
        if (due) {
          chip.dataset.state = 'dormant';
          this.$('q-main').textContent = `复训「${shortName(due)}」`;
          this.$('q-sub').textContent = '到了复习时间 · 巩固后 +10 洞见';
        } else if (p.status !== 'open') {
          chip.dataset.state = 'needPrereq';
          this.$('q-main').textContent = '这颗星球还在建设中';
          this.$('q-sub').textContent = '生命树可以预览 · 去已开放的星球继续闯关';
          this.$('q-bar').style.width = '0%';
        } else {
          chip.dataset.state = 'done';
          this.$('q-main').textContent = '生命树已全部点亮';
          this.$('q-sub').textContent = '可以发起范式跃迁，或前往下一颗星球';
        }
        return;
      }
      const st = this.state.nodeStatus(rec);
      const res = this.state.resources;
      let sub = '', pct = 1;
      const recMode = window.Levels.modeFor(rec);
      if (st.state === 'available') sub = recMode ? `可以挑战「${window.Levels.MODE_NAMES[recMode]}」了` : '可以点亮了';
      else if (st.state === 'dormant') sub = '跃迁残影 · 复训即可唤醒';
      else if (st.short.data > 0) { pct = res.data / rec.costData; sub = `采集数据 ${formatNumber(res.data)} / ${formatNumber(rec.costData)}`; }
      else if (st.short.insight > 0) { pct = res.insight / rec.costInsight; sub = `洞见 ${Math.floor(res.insight)} / ${rec.costInsight} · 看正片或闯关获取`; }
      else { pct = res.compute / rec.costCompute; sub = `算力 ${formatNumber(res.compute)} / ${formatNumber(rec.costCompute)}`; }
      chip.dataset.state = st.state;
      const name = shortName(rec);
      if (force || this.$('q-main').textContent !== name) this.$('q-main').textContent = name;
      this.$('q-sub').textContent = sub;
      this.$('q-bar').style.width = `${(clamp01(pct) * 100).toFixed(1)}%`;
      this.questNode = rec;
    }

    followQuest() {
      const p = this.state.getCurrentPlanet();
      const rec = this.questNode || this.state.recommendNode(p);
      if (!rec && p.status !== 'open') { this.toggleSidePanel(true); return; }
      if (this.mode !== 'tree') {
        if (rec) this.tree.pendingSelect = rec.id;
        this.setViewMode('tree');
      } else if (rec) {
        this.tree.select(rec.id, { focus: true, sound: true });
      }
    }

    // ── 点按反馈：数字 + 光点飞入数据计数 ────────────────────────────────
    onTap(gain, crit, x, y) {
      const num = document.createElement('div');
      num.className = `floating-num${crit ? ' crit' : ''}`;
      num.textContent = crit ? `+${gain} 暴击` : `+${gain}`;
      num.style.left = `${x}px`;
      num.style.top = `${y}px`;
      document.body.appendChild(num);
      setTimeout(() => num.remove(), 900);

      const target = this.$('res-data').getBoundingClientRect();
      const tx = target.left + 18, ty = target.top + target.height / 2;
      const count = crit ? 7 : 3;
      for (let i = 0; i < count; i++) {
        const m = document.createElement('i');
        m.className = `data-mote${crit ? ' crit' : ''}`;
        const ox = (Math.random() - 0.5) * 50, oy = (Math.random() - 0.5) * 50;
        m.style.transform = `translate(${x + ox}px, ${y + oy}px)`;
        document.body.appendChild(m);
        const delay = REDUCED_MOTION ? 0 : 60 + i * 45;
        setTimeout(() => {
          m.style.transform = `translate(${tx}px, ${ty}px) scale(0.4)`;
          m.style.opacity = '0.2';
        }, delay);
        setTimeout(() => {
          m.remove();
          if (i === count - 1) {
            const el = this.$('res-data');
            el.classList.remove('bump');
            void el.offsetWidth;
            el.classList.add('bump');
          }
        }, delay + 620);
      }
      if (this.state.tapCount >= 6) this.$('tap-prompt').classList.add('is-done');
      this.updateHUD();
    }

    warpFlash() {
      const el = this.$('warp-flash');
      el.classList.remove('go');
      void el.offsetWidth;
      el.classList.add('go');
    }

    notify(title, body, tone = 'info') {
      const box = this.$('toasts');
      const el = document.createElement('div');
      el.className = `toast tone-${tone}`;
      el.innerHTML = `<b></b><span></span>`;
      el.querySelector('b').textContent = title;
      el.querySelector('span').textContent = body || '';
      box.appendChild(el);
      while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => el.classList.add('out'), 3400);
      setTimeout(() => el.remove(), 3900);
    }

    epochBanner(epoch) {
      const el = this.$('epoch-banner');
      const next = EPOCH_NAMES[epoch + 1];
      this.$('eb-title').textContent = EPOCH_NAMES[epoch];
      this.$('eb-sub').textContent = next ? `${next}已开启 · 星球生态进入下一阶段` : '这颗星球的生命树已走到奇点';
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
      this.sound.playEpoch();
      clearTimeout(this._ebTimer);
      this._ebTimer = setTimeout(() => el.classList.remove('show'), 3600);
    }

    // ── 节点详情栏 ───────────────────────────────────────────────────────
    showNodeDetail(node, quiet) {
      const changed = this.selectedNode !== node;
      this.selectedNode = node;
      const st = this.state.nodeStatus(node);
      const res = this.state.resources;
      const hidden = node.type === 'secret' && st.state !== 'unlocked';
      const lv = window.Levels.describePlan(node);
      const mastery = this.state.mastery[node.id];
      const due = this.state.isDue(node);
      this.dockSig = st.state + JSON.stringify(st.short && {
        d: Math.ceil(st.short.data), c: Math.ceil(st.short.compute), i: Math.ceil(st.short.insight)
      }) + (due ? ':due' : '');

      const dock = this.$('node-dock');
      if (changed && !quiet) {
        dock.classList.remove('swap');
        void dock.offsetWidth;
        dock.classList.add('swap');
      }
      dock.dataset.state = st.state;
      this.$('dock-epoch').textContent = node.epoch ? `${EPOCH_NAMES[node.epoch]} ${EPOCH_ROMAN[node.epoch]}` : '星核';
      this.$('dock-branch').textContent = BRANCH_NAMES[node.branch] || '';
      const pillText = {
        unlocked: due ? '该复训了' : (mastery ? `已点亮 · ${mastery.g}` : '已点亮'),
        available: lv ? '可挑战' : '可点亮',
        needRes: '资源不足', needPrereq: '待前置', dormant: '待复训', building: '建设中'
      }[st.state];
      const pill = this.$('dock-state');
      pill.textContent = pillText;
      pill.dataset.state = st.state;

      this.$('dock-title').textContent = hidden ? '未揭示档案' : shortName(node);
      this.$('dock-english').textContent = hidden ? '' : [nodeSubtitle(node), node.english].filter(Boolean).join(' · ');
      const firstPre = (node.prereqs || []).map(id => this.state.getNode(id)).filter(Boolean)[0];
      this.$('dock-desc').textContent = hidden
        ? `点亮「${firstPre ? shortName(firstPre) : '前置节点'}」后揭示这份档案。`
        : (node.desc || '');

      const epBtn = this.$('dock-episode');
      const meta = node.episode ? EPISODE_META[node.episode] : null;
      if (meta && !hidden) {
        const watched = window.EpisodeBridge && window.EpisodeBridge.watchedEpisodes.includes(node.episode);
        const m = Math.floor(meta.sec / 60), s = meta.sec % 60;
        epBtn.hidden = false;
        this.$('ep-card-no').textContent = `EP${String(node.episode).padStart(2, '0')}`;
        this.$('ep-card-title').textContent = meta.title;
        this.$('ep-card-meta').textContent = `约 ${m} 分 ${s} 秒 · ${watched ? '已看完' : '看完 +20 洞见'}`;
        epBtn.classList.toggle('is-watched', !!watched);
        const thumb = this.$('ep-card-thumb');
        thumb.style.setProperty('--accent', BRANCH_COLORS[node.branch] ? '#' + BRANCH_COLORS[node.branch].toString(16).padStart(6, '0') : '#5fe3f0');
      } else {
        epBtn.hidden = true;
      }

      const li = [];
      if (st.state === 'building') {
        li.push('<li class="cond gate"><i class="ck"></i><span>状态</span><span class="cond-text">星球建设中：内容制作完成后开放闯关</span></li>');
      }
      (node.prereqs || []).forEach(pid => {
        const pn = this.state.getNode(pid);
        if (!pn) return;
        const ok = this.state.unlockedNodes.has(pid);
        li.push(`<li class="cond ${ok ? 'ok' : 'miss'}"><i class="ck"></i><span>前置</span>
          <button type="button" class="cond-link" data-jump="${pid}">${shortName(pn)}</button><em>${ok ? '已点亮' : (this.state.dormantNodes.has(pid) ? '待复训' : '未点亮')}</em></li>`);
      });
      const costs = [];
      const costChip = (need, have, label) => `<span class="cost ${have < need ? 'short' : ''}">${formatNumber(need)} ${label}</span>`;
      if (node.costData) costs.push(costChip(node.costData, res.data, '数据'));
      if (node.costCompute) costs.push(costChip(node.costCompute, res.compute, '算力'));
      if (node.costInsight) costs.push(costChip(node.costInsight, res.insight, '洞见'));
      if (costs.length && st.state !== 'unlocked' && st.state !== 'dormant') {
        const afford = res.data >= (node.costData || 0) && res.compute >= (node.costCompute || 0) && res.insight >= (node.costInsight || 0);
        li.push(`<li class="cond ${afford ? 'ok' : 'miss'}"><i class="ck"></i><span>消耗</span><span class="costs">${costs.join('')}</span></li>`);
      }
      if (st.state === 'dormant') {
        li.push(`<li class="cond gate"><i class="ck"></i><span>复训</span><span class="cond-text">${lv ? lv.name : '知识问答'} · 通过即唤醒，不消耗资源 · +10 洞见</span></li>`);
      } else if (lv && st.state !== 'unlocked') {
        li.push(`<li class="cond gate"><i class="ck"></i><span>关卡</span><span class="cond-text">${lv.name} · ${lv.text}<small>${lv.rewardText}</small></span></li>`);
      }
      if (mastery && st.state === 'unlocked') {
        const days = Math.max(1, Math.ceil((mastery.due - Date.now()) / DAY_MS));
        li.push(`<li class="cond ${due ? 'miss' : 'ok'}"><i class="ck"></i><span>评级</span><span class="cond-text">最佳 ${mastery.g} · 最近 ${mastery.last}</span><em>${due ? '已到复训时间' : `${days} 天后复训`}</em></li>`);
      }
      const eff = this.state.effectOf(node);
      if (eff) {
        li.push(`<li class="cond yield"><i class="ck"></i><span>效果</span><span class="cond-text">本星球${eff.stat === 'compute' ? '算力' : '数据'}产出 ×${eff.mult}</span><em>${st.state === 'unlocked' ? '生效中' : '点亮后生效'}</em></li>`);
      }
      const prod = [];
      if (node.prodData) prod.push(`+${node.prodData} 数据/秒`);
      if (node.prodCompute) prod.push(`+${node.prodCompute} 算力/秒`);
      if (prod.length) li.push(`<li class="cond yield"><i class="ck"></i><span>${st.state === 'unlocked' ? '产出' : '点亮后'}</span><span class="cond-text">${prod.join(' · ')}</span></li>`);
      this.$('dock-conditions').innerHTML = li.join('');

      const btn = this.$('dock-action');
      let intent = 'none', label = '', target = '';
      const missingNode = st.missing && st.missing.length ? this.state.getNode(st.missing[0]) : null;
      if (st.state === 'unlocked') {
        if (lv) {
          intent = 'improve';
          label = due ? '复训巩固 · +10 洞见' : (mastery && mastery.g === 'S' ? '再挑战一次' : '挑战更高评级');
        } else if (meta) { intent = 'replay'; label = '回看正片'; } else { label = '已点亮'; }
      } else if (st.state === 'available') {
        intent = lv ? 'quiz' : 'unlock';
        label = lv ? `挑战「${lv.name}」` : `点亮「${shortName(node)}」`;
      } else if (st.state === 'needRes') {
        intent = 'collect';
        const s = st.short;
        label = s.data > 0 ? `回星球采集 · 还差 ${formatNumber(Math.ceil(s.data))} 数据`
          : (s.insight > 0 ? `还差 ${Math.ceil(s.insight)} 洞见 · 看正片或闯关获得` : `还差 ${formatNumber(Math.ceil(s.compute))} 算力`);
        if (s.data <= 0 && s.insight > 0 && meta) intent = 'replay';
      } else if (st.state === 'needPrereq') {
        intent = 'jump';
        target = missingNode ? missingNode.id : '';
        label = `先去「${missingNode ? shortName(missingNode) : '前置节点'}」`;
      } else if (st.state === 'dormant') {
        if (missingNode) { intent = 'jump'; target = missingNode.id; label = `先唤醒「${shortName(missingNode)}」`; }
        else { intent = 'relight'; label = '快速复训'; }
      } else if (st.state === 'building') {
        label = '星球建设中 · 敬请期待';
      }
      btn.dataset.intent = intent;
      btn.dataset.target = target;
      btn.textContent = label;
      btn.disabled = intent === 'none';
      btn.className = `btn-primary intent-${intent}`;
    }

    handleNodeAction() {
      const node = this.selectedNode;
      if (!node) return;
      const btn = this.$('dock-action');
      switch (btn.dataset.intent) {
        case 'quiz': this.openLevel(node, 'unlock'); break;
        case 'improve': this.openLevel(node, 'improve'); break;
        case 'relight': this.openLevel(node, 'relight'); break;
        case 'unlock': this.performUnlock(node, false); break;
        case 'collect': this.setViewMode('planet'); break;
        case 'jump': if (btn.dataset.target) this.tree.select(btn.dataset.target, { focus: true, sound: true }); break;
        case 'replay': if (node.episode) this.openEpisode(node.episode, node); break;
        default: break;
      }
    }

    performUnlock(node, relight, grade) {
      const ok = relight ? this.state.relightNode(node, grade) : this.state.unlockNode(node);
      if (!ok) {
        this.notify('暂时无法点亮', '前置或资源条件发生了变化，请查看节点详情', 'warn');
        this.showNodeDetail(node, true);
        return false;
      }
      this.sound.playUnlock();
      this.tree.refreshStatus(true);
      const grow = () => {
        this.r3d.updateSurfaceStructures(node.id);
        this.updateHUD(true);
      };
      if (this.mode === 'tree') this.tree.celebrate(node.id, grow);
      else grow();
      if (relight) {
        this.notify(`「${shortName(node)}」已唤醒`, '残影重新点亮，产出恢复', 'success');
        const done = this.state.runComplete;
        if (done) {
          this.state.runComplete = null;
          setTimeout(() => this.notify('本轮复训完成',
            done.bonus ? `全部 ${done.total} 个节点都拿到 S，额外获得 1 枚范式碎片` : `${done.perfect} / ${done.total} 个节点拿到 S；全部 S 可额外获得碎片`, 'success'), 900);
        }
      } else {
        const yieldText = node.prodData ? `产出 +${node.prodData} 数据/秒，` : '';
        this.notify(`「${shortName(node)}」已点亮`, `${yieldText}星球地表长出了新的构造物`, 'success');
      }
      if (node.type === 'challenge' && !relight) setTimeout(() => this.epochBanner(node.epoch), 1100);
      this.showNodeDetail(node, true);
      this.updateQuest(true);
      this.renderSidePlanetList();
      return true;
    }

    // ── 关卡：通过后只结算一次 ──────────────────────────────────────────
    episodeFor(node) {
      if (node.episode) return node.episode;
      const p = this.state.getPlanet(node);
      const core = p && p.nodes.find(n => n.epoch === 0 && n.episode);
      return core ? core.episode : null;
    }

    openLevel(node, intent) {
      const planet = this.state.getPlanet(node);
      const plan = window.Levels.plan(node, planet, { name: shortName, relight: intent === 'relight', episode: this.episodeFor(node) });
      if (!plan) { this.performUnlock(node, false); return; }
      this.activeQuizNode = node;
      this.quiz = { result: null, applied: false, intent, plan };
      this.$('assessment-modal').classList.add('active');
      this.runner.start(plan);
      this.sound.playSelect();
    }

    closeAssessmentModal() {
      const modal = this.$('assessment-modal');
      if (!modal.classList.contains('active')) return;
      modal.classList.remove('active');
      this.runner.stop();
      const node = this.activeQuizNode, q = this.quiz;
      this.activeQuizNode = null;
      if (node && q.result && q.result.pass && !q.applied) {
        q.applied = true;
        this.applyLevelResult(node, q.result, q);
      }
    }

    applyLevelResult(node, r, q) {
      const grade = r.grade;
      const res = this.state.resources;
      if (q.intent === 'relight') {
        res.insight += r.reward;
        if (window.Levels.modeFor(node)) this.state.recordMastery(node, grade);
        this.performUnlock(node, true, grade);
        return;
      }
      if (q.intent === 'improve') {
        const prev = this.state.mastery[node.id];
        const wasDue = this.state.isDue(node);
        const rank = window.Levels.GRADE_RANK;
        let gain = 0;
        if (!prev || rank[grade] > rank[prev.g]) gain = q.plan.rewards[grade] - (prev ? q.plan.rewards[prev.g] : 0);
        if (wasDue) gain += 10;
        this.state.recordMastery(node, grade);
        res.insight += gain;
        this.state.save();
        this.sound.playUnlock();
        this.notify(`「${shortName(node)}」评级 ${grade}`, gain ? `获得 ${gain} 洞见${wasDue ? '，复习间隔已延长' : ''}` : '评级已记录；更高评级或到期复训才有洞见', 'success');
        this.tree.refreshStatus(true);
        this.updateHUD(true);
        this.updateQuest(true);
        this.showNodeDetail(node, true);
        return;
      }
      res.insight += r.reward;
      this.state.recordMastery(node, grade);
      this.performUnlock(node, false);
    }

    replayForLevel(r, p) {
      if (!p.episode) return;
      const focus = r.missed.map(m => `${m.stem} ${m.answer} ${m.rationale}`).join(' ');
      const node = p.node;
      this.closeAssessmentModal();
      if (this.selectedNode !== node) this.showNodeDetail(node, true);
      window.EpisodeBridge.open(p.episode, node, EPISODE_META[p.episode], { focus });
      this.sound.playSelect();
    }

    // ── 离线演化报告 ─────────────────────────────────────────────────────
    openOfflineReport() {
      const r = this.state.offlineReport;
      if (!r) return;
      const h = Math.floor(r.away / 3600), m = Math.floor((r.away % 3600) / 60);
      this.$('offline-away').textContent = h ? `${h} 小时 ${m} 分` : `${m} 分钟`;
      this.$('offline-data').textContent = `+${formatNumber(r.data)}`;
      this.$('offline-compute').textContent = `+${formatNumber(r.compute)}`;
      this.$('offline-note').textContent = r.capped ? '离线收益按 50% 效率结算，最多 8 小时' : '离线收益按 50% 效率结算';
      const due = this.state.dueNodes().slice(0, 3);
      this.$('offline-reviews').innerHTML = due.length
        ? due.map(n => `<li><button type="button" data-review="${n.id}"><span>复训「${shortName(n)}」</span><em>${this.state.getPlanet(n).name.split('·')[0].trim()} · 最佳 ${this.state.mastery[n.id].g}</em></button></li>`).join('')
        : '<li class="empty">暂时没有到期的复训，继续探索吧</li>';
      this.$('offline-modal').classList.add('active');
    }

    closeOfflineReport() {
      this.$('offline-modal').classList.remove('active');
      this.state.offlineReport = null;
    }

    jumpToNode(id) {
      const node = this.state.getNode(id);
      if (!node) return;
      this.closeOfflineReport();
      const pid = planetIdOf(node);
      if (pid !== this.state.currentPlanetId) this.selectPlanet(pid);
      if (this.mode !== 'tree') {
        this.tree.pendingSelect = id;
        this.setViewMode('tree');
      } else {
        this.tree.select(id, { focus: true, sound: true });
      }
    }

    // ── 范式跃迁 ─────────────────────────────────────────────────────────
    openPrestigeModal() {
      const p = this.state.getCurrentPlanet();
      const done = this.state.unlockedCount(p);
      const dormant = this.state.dormantCount(p);
      if (dormant) {
        this.notify('还不能跃迁', `这颗星还有 ${dormant} 个残影待复训，完成本轮复训后才能再次跃迁`, 'warn');
        return;
      }
      if (done < 10) {
        this.notify('还不能跃迁', `在这颗星球再点亮 ${10 - done} 个节点，就能发起范式跃迁`, 'warn');
        return;
      }
      const f = this.state.resources.paradigmFragments;
      this.$('prestige-cur-mult').textContent = `×${this.state.getMultiplier(f).toFixed(2)}`;
      this.$('prestige-new-mult').textContent = `×${this.state.getMultiplier(f + 1).toFixed(2)}`;
      this.$('prestige-node-count').textContent = p.nodes.filter(n => n.epoch > 0 && this.state.unlockedNodes.has(n.id)).length;
      this.$('prestige-modal').classList.add('active');
      this.sound.playSelect();
    }

    closePrestigeModal() { this.$('prestige-modal').classList.remove('active'); }

    confirmPrestige() {
      this.closePrestigeModal();
      if (!this.state.doPrestige()) return;
      this.r3d.warp();
      this.r3d.updateSurfaceStructures(null);
      this.tree.refreshStatus(true);
      this.updateHUD(true);
      this.renderSidePlanetList();
      this.notify('范式跃迁完成', `全局产出倍率 ×${this.state.getMultiplier().toFixed(2)}；逐个通过复训关卡唤醒残影，全部 S 再得 1 枚碎片`, 'success');
    }

    // ── 正片 ─────────────────────────────────────────────────────────────
    openEpisode(ep, node) {
      if (!window.EpisodeBridge) return;
      window.EpisodeBridge.open(ep, node, EPISODE_META[ep]);
      this.sound.playSelect();
    }

    closeEpisode() {
      if (!window.EpisodeBridge) return;
      window.EpisodeBridge.close();
      if (this.selectedNode) this.showNodeDetail(this.selectedNode, true);
    }

    episodeCompleteUnlock(node, firstTime) {
      if (firstTime) {
        this.state.resources.insight += 20;
        this.state.save();
        this.sound.playCorrect();
        this.notify('正片看完了', `获得 20 洞见${node && window.Levels.modeFor(node) ? '，可以去闯关了' : ''}`, 'success');
      }
      this.updateHUD(true);
      if (this.selectedNode) this.showNodeDetail(this.selectedNode, true);
      this.tree.statusDirty = true;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.Engine = new EngineApp();
    window.Engine.start();
  });
})();
