// 关卡：按节点装配题目与玩法、计时计分、评级。引擎只负责结算与点亮
// 玩法模板：quiz 知识问答 / blitz 纪元快速战 / court 真伪法庭 / timeline 时间线修复
(function () {
  'use strict';

  const GRADE_STEPS = [['S', 1], ['A', 0.8], ['B', 0.6]];
  const GRADE_RANK = { S: 3, A: 2, B: 1 };
  const MODE_NAMES = { quiz: '知识问答', blitz: '纪元快速战', court: '真伪法庭', timeline: '时间线修复' };

  const gradeOf = r => { const g = GRADE_STEPS.find(([, t]) => r >= t - 1e-9); return g ? g[0] : null; };
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── 题目装配 ──────────────────────────────────────────────────────────
  // 选项一律在出题时打乱，正确答案的位置不再固定
  function finalize(q) {
    const order = shuffle(q.options.map((_, i) => i));
    return Object.assign({}, q, { options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) });
  }

  function pool(node, planet) {
    return planet.nodes.filter(n => n.id !== node.id && n.desc && n.desc !== node.desc && n.type !== 'secret' && n.type !== 'challenge');
  }

  function pickDistinct(list, n, key) {
    const seen = new Set(), out = [];
    for (const it of shuffle(list)) {
      const k = key(it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
      if (out.length >= n) break;
    }
    return out;
  }

  function authored(n) {
    const q = n.quiz;
    return { stem: q.stem, options: q.options.slice(), answer: q.answer, rationale: q.rationale, nodeId: n.id, shotRef: q.shotRef };
  }

  // 「名字 → 描述」
  function describe(n, planet, name) {
    const ds = pickDistinct(pool(n, planet), 3, d => d.desc).map(d => d.desc);
    if (ds.length < 2) return null;
    return {
      stem: `哪一项最准确地描述了「${name(n)}」？`,
      options: [n.desc].concat(ds), answer: 0,
      rationale: `「${name(n)}」：${n.desc}`, nodeId: n.id
    };
  }

  // 「描述 → 名字」
  function which(n, planet, name) {
    const own = name(n);
    const ds = pickDistinct(pool(n, planet).filter(d => name(d) !== own), 3, d => name(d)).map(d => name(d));
    if (ds.length < 2) return null;
    return {
      stem: `下面这段说的是哪个知识点？\n「${n.desc}」`,
      options: [own].concat(ds), answer: 0,
      rationale: `这段描述的是「${own}」。`, nodeId: n.id
    };
  }

  function buildQuestions(targets, count, planet, name) {
    const out = [], stems = new Set();
    const push = q => { if (q && !stems.has(q.stem) && out.length < count) { stems.add(q.stem); out.push(finalize(q)); } };
    shuffle(targets.filter(n => n.quiz)).forEach(n => push(authored(n)));
    const gens = [describe, which];
    for (let round = 0; out.length < count && round < 3; round++) {
      shuffle(targets).forEach((n, i) => push(gens[(i + round) % 2](n, planet, name)));
    }
    return out;
  }

  function buildStatements(node, planet, count, name) {
    const targets = [node].concat(shuffle(pool(node, planet).filter(n => n.epoch === node.epoch || n.epoch === node.epoch - 1)));
    const all = pool(node, planet);
    const out = [];
    for (const t of targets) {
      if (out.length >= count) break;
      const truthy = out.length === 0 ? Math.random() < 0.5 : Math.random() < 0.5;
      if (truthy) {
        out.push({ text: `「${name(t)}」：${t.desc}`, truth: true, rationale: '描述与知识点一致。', nodeId: t.id });
      } else {
        const wrong = all.find(o => o.id !== t.id && o.desc !== t.desc && name(o) !== name(t));
        if (!wrong) continue;
        out.push({ text: `「${name(t)}」：${wrong.desc}`, truth: false, rationale: `这段其实描述的是「${name(wrong)}」。`, nodeId: t.id });
      }
    }
    // 至少各有一真一伪，避免全选同一个答案也能过关
    if (out.length >= 2 && out.every(s => s.truth === out[0].truth)) {
      const t = planet.nodes.find(n => n.id === out[1].nodeId);
      if (out[0].truth) {
        const wrong = all.find(o => o.id !== t.id && o.desc !== t.desc);
        if (wrong) out[1] = { text: `「${name(t)}」：${wrong.desc}`, truth: false, rationale: `这段其实描述的是「${name(wrong)}」。`, nodeId: t.id };
      } else {
        out[1] = { text: `「${name(t)}」：${t.desc}`, truth: true, rationale: '描述与知识点一致。', nodeId: t.id };
      }
    }
    return shuffle(out);
  }

  // 演化枝够 3 个就按真实里程碑排序；不够则每个纪元取一个节点，按由浅入深排序
  function buildTimeline(node, planet, name) {
    const evo = planet.nodes.filter(n => n.epoch > 0 && (n.branch === 'evolution' || n.type === 'milestone'))
      .sort((a, b) => a.epoch - b.epoch || a.id.localeCompare(b.id));
    if (evo.length >= 3) {
      const picked = evo.length > 4 ? evo.filter(n => n.id === node.id).concat(shuffle(evo.filter(n => n.id !== node.id)).slice(0, 3)) : evo;
      const items = picked.sort((a, b) => a.epoch - b.epoch || a.id.localeCompare(b.id));
      return { stem: '把这些里程碑按出现的先后排好', items: items.map(n => ({ id: n.id, label: name(n), hint: n.desc })) };
    }
    const byEpoch = [0, 1, 2, 3, 4].map(e => {
      const list = planet.nodes.filter(n => n.epoch === e && n.type !== 'challenge' && n.type !== 'secret' && n.type !== 'boost');
      if (!list.length) return null;
      return list.find(n => n.id === node.id) || list.find(n => n.branch === 'evolution') || list.find(n => n.branch === 'mechanism') || list[0];
    }).filter(Boolean);
    if (byEpoch.length < 3) return null;
    return {
      stem: '按从基础到前沿的顺序，把这些知识点排好',
      items: byEpoch.map(n => ({ id: n.id, label: name(n), hint: n.desc }))
    };
  }

  function modeFor(node) {
    if (node.type === 'challenge') return 'blitz';
    if (node.epoch > 0 && node.branch === 'boundary') return 'court';
    if (node.epoch > 0 && (node.branch === 'evolution' || node.type === 'milestone')) return 'timeline';
    if (node.type === 'core' || node.quiz) return 'quiz';
    return null;
  }

  // opts：{ name, relight, episode }
  function plan(node, planet, opts) {
    const name = opts.name;
    const relight = !!opts.relight;
    let mode = modeFor(node);
    if (!mode && !relight) return null;
    if (!mode) mode = 'quiz';
    const gate = node.type === 'core' || node.type === 'challenge';
    const p = {
      mode, node, relight,
      kind: relight ? `快速复训 · ${MODE_NAMES[mode]}` : MODE_NAMES[mode],
      rewards: relight ? { S: 10, A: 10, B: 10 } : (gate ? { S: 50, A: 30, B: 20 } : { S: 20, A: 15, B: 10 }),
      time: 0,
      episode: opts.episode || null
    };

    if (mode === 'timeline') {
      const tl = buildTimeline(node, planet, name);
      if (tl) return Object.assign(p, tl, { lives: 2 });
      p.mode = mode = 'quiz';
      p.kind = relight ? '快速复训 · 知识问答' : MODE_NAMES.quiz;
    }
    if (mode === 'court') {
      const st = buildStatements(node, planet, relight ? 3 : 4, name);
      if (st.length >= 3) return Object.assign(p, { statements: st, time: relight ? 0 : 75 });
      p.mode = mode = 'quiz';
      p.kind = relight ? '快速复训 · 知识问答' : MODE_NAMES.quiz;
    }
    if (mode === 'blitz') {
      const peers = planet.nodes.filter(n => n.id !== node.id && n.type !== 'secret' && n.type !== 'challenge' &&
        (n.epoch === node.epoch || (node.prereqs || []).includes(n.id)));
      const qs = buildQuestions(peers.length ? peers : [node], relight ? 2 : 5, planet, name);
      return Object.assign(p, { questions: qs, time: relight ? 0 : 90 });
    }
    const targets = [node];
    const qs = buildQuestions(targets, relight ? 1 : 3, planet, name);
    if (qs.length < (relight ? 1 : 2)) {
      (node.prereqs || []).forEach(id => { const pn = planet.nodes.find(n => n.id === id); if (pn) targets.push(pn); });
      return Object.assign(p, { questions: buildQuestions(targets, relight ? 1 : 3, planet, name) });
    }
    return Object.assign(p, { questions: qs });
  }

  function describePlan(node) {
    const mode = modeFor(node);
    if (!mode) return null;
    const text = {
      quiz: '2–3 道知识问答，全对得 S',
      blitz: '90 秒 · 5 题快速战，连对有加时',
      court: '75 秒 · 判断 4 条陈述的真伪',
      timeline: '把 3–4 张卡片排出正确顺序，2 次机会'
    }[mode];
    const gate = node.type === 'core' || node.type === 'challenge';
    return { mode, name: MODE_NAMES[mode], text, rewardText: gate ? 'S / A / B 评级奖励 50 / 30 / 20 洞见' : 'S / A / B 评级奖励 20 / 15 / 10 洞见' };
  }

  // ── 运行器 ────────────────────────────────────────────────────────────
  class LevelRunner {
    constructor(root, hooks) {
      this.root = root;
      this.hooks = hooks;
      this.$ = sel => root.querySelector(sel);
      this.timer = null;
    }

    start(p) {
      this.stop();
      this.p = p;
      this.idx = 0;
      this.correct = 0;
      this.combo = 0;
      this.bestCombo = 0;
      this.missed = [];
      this.done = false;
      this.judged = false;
      this.slots = null;
      this.locked = null;
      this.bank = null;
      this.result = null;
      this.timeLeft = p.time;
      this.timeMax = p.time;
      this.attempt = 1;
      this.$('.lv-kind').textContent = p.kind;
      this.$('.lv-target').textContent = this.hooks.name(p.node);
      this.root.dataset.mode = p.mode;
      this.$('.lv-timer').hidden = !p.time;
      this.$('.lv-timebar').hidden = !p.time;
      if (p.time) {
        let last = performance.now();
        this.timer = setInterval(() => {
          const now = performance.now();
          this.timeLeft -= (now - last) / 1000;
          last = now;
          this.paintMeta();
          if (this.timeLeft <= 0) this.timeout();
        }, 100);
      }
      this.render();
    }

    stop() {
      clearInterval(this.timer);
      this.timer = null;
    }

    total() {
      const p = this.p;
      if (p.mode === 'court') return p.statements.length;
      if (p.mode === 'timeline') return p.items.length;
      return p.questions.length;
    }

    paintMeta() {
      const p = this.p;
      let step = '';
      if (this.done) step = '结算';
      else if (p.mode === 'court') step = `${p.statements.length} 条陈述`;
      else if (p.mode === 'timeline') step = this.attempt === 1 ? '第 1 次排序' : '最后 1 次机会';
      else step = `第 ${Math.min(this.idx + 1, this.total())} / ${this.total()} 题`;
      this.$('.lv-step').textContent = step;
      const combo = this.$('.lv-combo');
      combo.textContent = this.combo >= 2 ? `连对 ×${this.combo}` : '';
      combo.classList.toggle('is-hot', this.combo >= 3);
      if (p.time) {
        const t = Math.max(0, this.timeLeft);
        this.$('.lv-timer').textContent = `${Math.ceil(t)} 秒`;
        this.$('.lv-timer').classList.toggle('is-low', t <= 15);
        this.$('.lv-timebar i').style.width = `${(t / this.timeMax) * 100}%`;
      }
    }

    render() {
      this.paintMeta();
      const body = this.$('.lv-body');
      body.innerHTML = '';
      const m = this.p.mode;
      if (m === 'court') this.renderCourt(body);
      else if (m === 'timeline') this.renderTimeline(body);
      else this.renderQuestion(body);
    }

    // ── 问答 / 快速战 ──
    renderQuestion(body) {
      const q = this.p.questions[this.idx];
      if (!q) { this.finish(); return; }
      body.innerHTML = `<p class="lv-reward">${this.rewardLine()}</p><h4 class="lv-stem"></h4><div class="options-list"></div>
        <div class="feedback-banner"></div><button type="button" class="btn-primary lv-next" hidden>下一题</button>`;
      body.querySelector('.lv-stem').textContent = q.stem;
      const list = body.querySelector('.options-list');
      q.options.forEach((txt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'option-btn';
        b.innerHTML = `<span class="option-key">${i + 1}</span><span class="option-text"></span>`;
        b.querySelector('.option-text').textContent = txt;
        b.addEventListener('click', () => this.answer(i, b));
        list.appendChild(b);
      });
      body.querySelector('.lv-next').addEventListener('click', () => this.next());
      setTimeout(() => { const f = list.querySelector('button'); if (f) f.focus(); }, 40);
    }

    answer(i, btn) {
      const q = this.p.questions[this.idx];
      if (!q || q.picked !== undefined || this.done) return;
      q.picked = i;
      const body = this.$('.lv-body');
      const btns = body.querySelectorAll('.option-btn');
      btns.forEach(b => { b.disabled = true; });
      btns[q.answer].classList.add('is-correct');
      const fb = body.querySelector('.feedback-banner');
      if (i === q.answer) {
        this.correct++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        fb.className = 'feedback-banner correct';
        fb.innerHTML = '<strong>答对了</strong><span></span>';
        fb.querySelector('span').textContent = q.rationale || '';
        if (this.p.mode === 'blitz' && this.combo >= 3 && this.combo % 3 === 0) {
          this.timeLeft = Math.min(this.timeMax, this.timeLeft + 6);
          this.hooks.sound('combo');
          fb.querySelector('strong').textContent = `连对 ${this.combo} 题 · 加时 6 秒`;
        } else {
          this.hooks.sound('correct');
        }
      } else {
        this.combo = 0;
        btn.classList.add('is-wrong');
        this.missed.push({ stem: q.stem, answer: q.options[q.answer], rationale: q.rationale, shotRef: q.shotRef });
        fb.className = 'feedback-banner wrong';
        fb.innerHTML = '<strong>不对</strong><span></span>';
        fb.querySelector('span').textContent = `正确答案是「${q.options[q.answer]}」。${q.rationale || ''}`;
        this.hooks.sound('wrong');
        this.shake();
      }
      this.paintMeta();
      const nextBtn = body.querySelector('.lv-next');
      nextBtn.textContent = this.idx + 1 >= this.total() ? '查看结果' : '下一题';
      nextBtn.hidden = false;
      if (this.p.mode === 'blitz' && i === q.answer) {
        this._auto = setTimeout(() => this.next(), 650);
      } else {
        nextBtn.focus();
      }
    }

    next() {
      clearTimeout(this._auto);
      if (this.done) return;
      this.idx++;
      if (this.idx >= this.total()) this.finish();
      else this.render();
    }

    // ── 真伪法庭 ──
    renderCourt(body) {
      body.innerHTML = `<p class="lv-reward">${this.rewardLine()}</p><h4 class="lv-stem">这份 AI 交付件里混进了错误陈述，逐条判定真伪</h4>
        <ol class="court-list"></ol><div class="feedback-banner"></div><button type="button" class="btn-primary lv-submit" disabled>提交判定</button>`;
      const list = body.querySelector('.court-list');
      this.p.statements.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'court-item';
        li.innerHTML = `<p class="court-text"></p><div class="court-actions">
          <button type="button" class="court-btn" data-v="1">属实</button><button type="button" class="court-btn" data-v="0">有误</button></div>
          <p class="court-why" hidden></p>`;
        li.querySelector('.court-text').textContent = s.text;
        li.querySelectorAll('.court-btn').forEach(b => b.addEventListener('click', () => {
          if (this.done) return;
          s.verdict = b.dataset.v === '1';
          li.querySelectorAll('.court-btn').forEach(x => x.classList.toggle('is-picked', x === b));
          this.hooks.sound('select');
          body.querySelector('.lv-submit').disabled = this.p.statements.some(x => x.verdict === undefined);
        }));
        list.appendChild(li);
      });
      body.querySelector('.lv-submit').addEventListener('click', () => this.judgeCourt());
    }

    judgeCourt() {
      if (this.done || this.judged) return;
      this.judged = true;
      const items = this.$('.lv-body').querySelectorAll('.court-item');
      this.correct = 0;
      this.p.statements.forEach((s, i) => {
        const ok = s.verdict === s.truth;
        if (ok) this.correct++;
        else this.missed.push({ stem: s.text, answer: s.truth ? '属实' : '有误', rationale: s.rationale });
        const li = items[i];
        li.classList.add(ok ? 'is-right' : 'is-wrong');
        li.querySelectorAll('.court-btn').forEach(b => { b.disabled = true; });
        const why = li.querySelector('.court-why');
        why.hidden = false;
        why.textContent = `${s.truth ? '属实' : '有误'}。${s.truth ? '' : s.rationale}`;
      });
      this.hooks.sound(this.correct === this.p.statements.length ? 'correct' : 'wrong');
      const btn = this.$('.lv-submit');
      btn.textContent = '查看结果';
      btn.disabled = false;
      btn.onclick = () => this.finish();
      this.stop();
    }

    // ── 时间线修复 ──
    renderTimeline(body) {
      const p = this.p;
      if (!this.slots) {
        this.slots = new Array(p.items.length).fill(null);
        this.locked = new Array(p.items.length).fill(false);
        this.bank = shuffle(p.items.map((_, i) => i));
        if (this.bank.every((v, i) => v === i)) this.bank.reverse();
      }
      body.innerHTML = `<p class="lv-reward">${this.rewardLine()}</p><h4 class="lv-stem"></h4>
        <ol class="tl-slots"></ol><div class="tl-bank"></div><div class="feedback-banner"></div>
        <button type="button" class="btn-primary lv-submit" disabled>确认顺序</button>`;
      body.querySelector('.lv-stem').textContent = `${p.stem}（依次点选，点已放入的卡片可以撤回）`;
      const slots = body.querySelector('.tl-slots');
      this.slots.forEach((itemIdx, i) => {
        const li = document.createElement('li');
        li.className = `tl-slot${itemIdx === null ? ' is-empty' : ''}${this.locked[i] ? ' is-locked' : ''}`;
        li.innerHTML = `<span class="tl-no">${i + 1}</span><span class="tl-card-text"></span>`;
        if (itemIdx !== null) {
          li.querySelector('.tl-card-text').textContent = p.items[itemIdx].label;
          if (!this.locked[i]) li.addEventListener('click', () => { this.bank.push(itemIdx); this.slots[i] = null; this.hooks.sound('select'); this.render(); });
        } else {
          li.querySelector('.tl-card-text').textContent = '—';
        }
        slots.appendChild(li);
      });
      const bank = body.querySelector('.tl-bank');
      this.bank.forEach(itemIdx => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tl-card';
        b.textContent = p.items[itemIdx].label;
        b.title = p.items[itemIdx].hint || '';
        b.addEventListener('click', () => {
          const free = this.slots.indexOf(null);
          if (free < 0) return;
          this.slots[free] = itemIdx;
          this.bank = this.bank.filter(x => x !== itemIdx);
          this.hooks.sound('select');
          this.render();
        });
        bank.appendChild(b);
      });
      const submit = body.querySelector('.lv-submit');
      submit.disabled = this.slots.includes(null);
      submit.addEventListener('click', () => this.judgeTimeline());
    }

    judgeTimeline() {
      if (this.done) return;
      const n = this.p.items.length;
      let right = 0;
      this.slots.forEach((itemIdx, i) => { if (itemIdx === i) { right++; this.locked[i] = true; } });
      if (right === n) {
        this.correct = this.attempt === 1 ? n : Math.ceil(n * 0.6);
        this.hooks.sound('correct');
        this.finish();
        return;
      }
      if (this.attempt === 1) {
        this.attempt = 2;
        this.slots.forEach((itemIdx, i) => { if (!this.locked[i]) { this.bank.push(itemIdx); this.slots[i] = null; } });
        this.hooks.sound('wrong');
        this.shake();
        this.render();
        const fb = this.$('.lv-body .feedback-banner');
        fb.className = 'feedback-banner wrong';
        fb.innerHTML = `<strong>还差一点</strong><span>排对的 ${right} 张已经锁定，剩下的再排一次。</span>`;
        return;
      }
      this.correct = Math.min(right, Math.ceil(n * 0.6) - 1);
      this.missed.push({ stem: this.p.stem, answer: this.p.items.map(it => it.label).join(' → '), rationale: '正确顺序如上。' });
      this.hooks.sound('wrong');
      this.finish();
    }

    // ── 结算 ──
    timeout() {
      if (this.done) return;
      this.stop();
      const p = this.p;
      if (p.mode === 'court') {
        p.statements.forEach(s => { if (s.verdict === undefined) s.verdict = null; });
        this.judgeCourt();
        this.finish();
        return;
      }
      for (let i = this.idx; i < p.questions.length; i++) {
        const q = p.questions[i];
        if (q.picked === undefined) this.missed.push({ stem: q.stem, answer: q.options[q.answer], rationale: q.rationale, shotRef: q.shotRef });
      }
      this.hooks.sound('wrong');
      this.finish(true);
    }

    finish(timedOut) {
      if (this.done) return;
      clearTimeout(this._auto);
      this.stop();
      this.done = true;
      const total = this.total();
      const ratio = total ? this.correct / total : 0;
      const grade = gradeOf(ratio);
      this.result = {
        pass: !!grade, grade, correct: this.correct, total, ratio, timedOut: !!timedOut,
        bestCombo: this.bestCombo, missed: this.missed,
        reward: grade ? this.p.rewards[grade] : 0
      };
      this.paintMeta();
      this.renderResult();
      this.hooks.onFinish(this.result, this.p);
    }

    renderResult() {
      const r = this.result, p = this.p;
      const body = this.$('.lv-body');
      const unit = p.mode === 'court' ? '条判对' : (p.mode === 'timeline' ? '' : '题答对');
      const scoreLine = p.mode === 'timeline'
        ? (r.pass ? (r.grade === 'S' ? '一次排对' : '第二次排对') : '两次都没有排对')
        : `${r.correct} / ${r.total} ${unit}${r.timedOut ? ' · 时间到' : ''}${r.bestCombo >= 3 ? ` · 最高连对 ${r.bestCombo}` : ''}`;
      const missed = r.missed.length ? `<details class="lv-missed" ${r.pass ? '' : 'open'}><summary>复盘 ${r.missed.length} 处失误</summary><ul>${
        r.missed.map(m => `<li><b>${esc(m.stem)}</b><span>正确：${esc(m.answer)}</span><em>${esc(m.rationale)}</em></li>`).join('')}</ul></details>` : '';
      body.innerHTML = `
        <div class="lv-result ${r.pass ? 'is-pass' : 'is-fail'}">
          <div class="lv-grade" data-grade="${r.grade || 'F'}">${r.grade || '未通过'}</div>
          <div class="lv-result-text">
            <b>${r.pass ? (p.relight ? '复训通过' : '关卡通过') : '这次没过'}</b>
            <span>${scoreLine}</span>
            <span>${r.pass ? `获得 ${r.reward} 洞见` : '失败不扣进度，也不扣洞见；重来会换一批题'}</span>
          </div>
        </div>
        ${missed}
        <div class="lv-actions"></div>`;
      const actions = body.querySelector('.lv-actions');
      const add = (label, cls, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        actions.appendChild(b);
        return b;
      };
      if (!r.pass && p.episode) {
        add('回看正片相关片段', 'btn-cancel', () => this.hooks.onReplay(r, p));
      }
      if (!r.pass) add('再试一次', 'btn-primary', () => this.hooks.onRetry(p));
      else {
        const c = add(this.hooks.confirmLabel(p), 'btn-primary', () => this.hooks.onConfirm(r, p));
        setTimeout(() => c.focus(), 40);
      }
    }

    rewardLine() {
      const rw = this.p.rewards;
      return this.p.relight ? '通过即唤醒，不消耗资源 · +10 洞见' : `评级 S / A / B 奖励 ${rw.S} / ${rw.A} / ${rw.B} 洞见`;
    }

    shake() {
      const box = this.root;
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    }

    handleKey(e) {
      if (!this.p || this.done) return false;
      if (this.p.mode === 'quiz' || this.p.mode === 'blitz') {
        const n = parseInt(e.key, 10);
        if (n >= 1) {
          const btn = this.$('.lv-body').querySelectorAll('.option-btn')[n - 1];
          if (btn && !btn.disabled) { btn.click(); return true; }
        }
        if (e.key === 'Enter') {
          const nx = this.$('.lv-next');
          if (nx && !nx.hidden) { nx.click(); return true; }
        }
      }
      return false;
    }
  }

  window.Levels = { plan, describePlan, modeFor, gradeOf, GRADE_RANK, MODE_NAMES, LevelRunner };
})();
