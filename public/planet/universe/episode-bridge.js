// 正片播放桥接
// 正片通过 postMessage 契约（contract.js）上报真实播放时长；同源时也可直接读取 <audio>。
// 两条路都走不通时只播放、不发奖励，避免暂停挂机也能拿洞见。
(function () {
  'use strict';

  const RATES = [1.0, 1.25, 1.5, 2.0];
  const $ = id => document.getElementById(id);

  // 中文按字二元组比较，找出与一段文字最相关的镜头
  function bigrams(text) {
    const s = String(text || '').replace(/[\s，。、；：？！“”‘’「」（）()《》\-—,.;:?!"']/g, '');
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }
  function bestShot(shots, focus) {
    const q = bigrams(focus);
    if (!q.size || !shots || !shots.length) return null;
    let best = null, bestScore = 0;
    shots.forEach((s, i) => {
      const b = bigrams(s.text);
      let hit = 0;
      q.forEach(g => { if (b.has(g)) hit++; });
      const score = hit / Math.sqrt(b.size + 1);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return bestScore > 0.25 ? best : null;
  }

  window.EpisodeBridge = {
    iframe: null,
    activeNode: null,
    activeEpisode: null,
    rateIndex: 0,
    listened: 0,
    duration: 0,
    contract: false,
    shots: null,
    focus: null,
    _completed: false,
    _media: null,
    _readyTimer: null,
    watchedEpisodes: JSON.parse(localStorage.getItem('cheese.watched.episodes') || '[]'),

    init() {
      window.addEventListener('message', e => this._onMessage(e));
    },

    // opts.focus：一段文字（题干 + 解析），打开后跳到最相关的镜头
    open(episodeNum, node, meta, opts) {
      this.close(true);
      this._completed = false;
      this.listened = 0;
      this.contract = false;
      this.shots = null;
      this.focus = opts && opts.focus ? opts.focus : null;
      this.activeNode = node || null;
      this.activeEpisode = episodeNum;
      this.duration = meta ? meta.sec : 180;
      this.rateIndex = 0;

      const numStr = String(episodeNum).padStart(2, '0');
      $('ep-num-badge').textContent = `EP${numStr}`;
      $('ep-title').textContent = meta ? meta.title : `第 ${numStr} 期正片`;
      $('ep-node-name').textContent = node ? node.name.replace(/^星核\s*·\s*/, '') : '—';
      $('ep-btn-rate').textContent = '1.0×';
      $('ep-loading-shield').style.display = 'flex';
      this._setProgress(0);
      this._setHint(this.focus ? '正在定位到相关镜头…'
        : (this.watchedEpisodes.includes(episodeNum) ? '已看过这期正片，可以随时回看' : '实际播放满八成即视为看完，获得 20 洞见'));

      $('episode-player-overlay').classList.add('active');
      const iframe = $('episode-iframe');
      this.iframe = iframe;
      iframe.onload = () => {
        $('ep-loading-shield').style.display = 'none';
        clearTimeout(this._readyTimer);
        // 契约消息一般在 onload 之前就到了；再等一会儿仍没有，才退回同源直读
        this._readyTimer = setTimeout(() => { if (!this.contract) this._attachSameOrigin(); }, 1500);
      };
      iframe.src = `/planet/series/${numStr}.html`;
    },

    close(silent) {
      const overlay = $('episode-player-overlay');
      if (!silent) overlay.classList.remove('active');
      clearTimeout(this._readyTimer);
      if (this._media && this._onTime) this._media.removeEventListener('timeupdate', this._onTime);
      this._media = null;
      if (this.iframe && !silent) {
        this.iframe.onload = null;
        this.iframe.src = 'about:blank';
      }
      if (!silent) this.activeNode = null;
    },

    _send(msg) {
      try {
        this.iframe.contentWindow.postMessage(Object.assign({ channel: 'cheese-shell' }, msg), location.origin);
      } catch (e) { /* ignore */ }
    },

    _onMessage(e) {
      const m = e.data;
      if (e.origin !== location.origin || !m || m.channel !== 'cheese-episode' || !this.iframe || e.source !== this.iframe.contentWindow) return;
      if (m.type === 'ready') {
        this.contract = true;
        this.shots = m.shots || null;
        if (m.duration) this.duration = m.duration;
        $('ep-loading-shield').style.display = 'none';
        if (this.focus) {
          const i = bestShot(this.shots, this.focus);
          if (i !== null) {
            this._send({ type: 'seek', shot: i, autoplay: true });
            this._setHint(`已跳到第 ${i + 1} 镜 · ${this.shots[i].act}`);
          } else {
            this._setHint('没有找到特别对应的镜头，从头回看');
          }
        }
        return;
      }
      if (m.type === 'progress') {
        if (m.duration) this.duration = m.duration;
        this.listened = Math.max(this.listened, m.listened || 0);
        this._setProgress(m.t / (this.duration || 1));
        if (this.listened >= this.duration * 0.8) this.onComplete();
        return;
      }
      if (m.type === 'ended') {
        this.listened = Math.max(this.listened, m.listened || 0);
        if (this.listened >= this.duration * 0.8) this.onComplete();
      }
    },

    _attachSameOrigin() {
      let media = null;
      try {
        const doc = this.iframe.contentDocument;
        media = doc && doc.querySelector('audio, video');
      } catch (e) {
        media = null;
      }
      if (!media) {
        this._setHint('这期正片无法回报播放进度，可以观看，但不计洞见');
        return;
      }
      this._media = media;
      if (media.duration && isFinite(media.duration)) this.duration = media.duration;
      let last = media.currentTime;
      this._onTime = () => {
        if (media.duration && isFinite(media.duration)) this.duration = media.duration;
        const d = media.currentTime - last;
        last = media.currentTime;
        if (!media.paused && d > 0 && d < 1.5) this.listened += d;
        this._setProgress(media.currentTime / (this.duration || 1));
        if (this.listened >= this.duration * 0.8) this.onComplete();
      };
      media.addEventListener('timeupdate', this._onTime);
    },

    episodeCmd(cmd) {
      if (this.contract) { this._send({ type: cmd }); return; }
      if (this._media) { if (cmd === 'play') this._media.play(); else this._media.pause(); }
    },

    cycleRate() {
      this.rateIndex = (this.rateIndex + 1) % RATES.length;
      const rate = RATES[this.rateIndex];
      $('ep-btn-rate').textContent = `${rate}×`;
      if (this.contract) this._send({ type: 'rate', rate });
      else if (this._media) this._media.playbackRate = rate;
    },

    _setProgress(r) {
      const el = $('ep-progress-fill');
      if (el) el.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`;
    },

    _setHint(text) {
      const el = $('ep-hint');
      if (el) el.querySelector('span').textContent = text;
    },

    onComplete() {
      if (this._completed) return;
      this._completed = true;
      const num = this.activeEpisode;
      const firstTime = !this.watchedEpisodes.includes(num);
      if (firstTime) {
        this.watchedEpisodes.push(num);
        localStorage.setItem('cheese.watched.episodes', JSON.stringify(this.watchedEpisodes));
      }
      this._setHint(firstTime ? '已看完，获得 20 洞见' : '已看完');
      if (window.Engine && typeof window.Engine.episodeCompleteUnlock === 'function') {
        window.Engine.episodeCompleteUnlock(this.activeNode, firstTime);
      }
    }
  };
  window.EpisodeBridge.init();
})();
