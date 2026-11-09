(() => {
  for (const event of ['copy', 'cut', 'contextmenu', 'dragstart']) document.addEventListener(event, e => {
    if (!e.target.closest?.('.series-share-input')) e.preventDefault();
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c', 's', 'p', 'u'].includes(e.key.toLowerCase()) && !e.target.closest?.('.series-share-input')) e.preventDefault();
  });
  const style = document.createElement('style');
  style.textContent = `
    #series-stats{display:flex;align-items:center;gap:32px;flex-wrap:wrap;padding:18px 0;margin:0 0 20px;border-bottom:1px solid #eee;color:#9499a0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #series-stats .series-action{display:inline-flex;align-items:center;gap:9px;min-height:40px;white-space:nowrap;font:inherit;font-variant-numeric:tabular-nums}
    #series-stats button.series-action{background:transparent;border:0;border-radius:6px;padding:0 6px;color:#61666d;cursor:pointer;transition:color .15s,background .15s}
    #series-stats button.series-action:hover{color:#00aeec;background:#f1f8fc}
    #series-stats button[aria-pressed=true]{color:#00aeec}
    #series-stats button:focus-visible{outline:2px solid #00aeec;outline-offset:4px}
    #series-stats svg{width:26px;height:26px;flex:none;fill:currentColor}
    #series-stats .series-view svg{width:19px;height:19px}
    #series-stats .series-status{font-size:13px;color:#9499a0}
    .series-share-input{user-select:text!important;-webkit-user-select:text!important;width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:10px;font-size:14px;color:#61666d}
    @media(max-width:600px){#series-stats{gap:22px;padding:12px 0}#series-stats .series-action{gap:7px}#series-stats .series-status{flex-basis:100%}}
  `;
  document.head.append(style);
  const id = location.pathname.match(/\/(\d{2})\.html$/)?.[1] || 'index';
  const box = document.createElement('section');
  box.id = 'series-stats'; box.setAttribute('aria-label', '浏览与互动');
  const anchor = document.querySelector('.controls');
  if (anchor) anchor.after(box); else (document.querySelector('main') || document.body).append(box);
  const icons = {
    view: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10 7 7 5-7 5z"/>',
    like: '<path d="M8 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4Zm2 11V10l4-7c.5-.9 1.8-.6 2 .4.4 1.8-.1 3.8-1 5.6h5a2 2 0 0 1 2 2.4l-1.5 8A2 2 0 0 1 18.5 21H10Z"/>',
    share: '<path d="m14 2 9 8-9 8v-5C7 13 4 16 1 21c0-9 4-14 13-14V2Z"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
  const view = document.createElement('span'); view.className = 'series-action series-view';
  const like = document.createElement('button'); like.type = 'button'; like.className = 'series-action';
  const share = document.createElement('button'); share.type = 'button'; share.className = 'series-action';
  const status = document.createElement('span'); status.className = 'series-status'; status.setAttribute('role', 'status');
  box.append(view, like, share, status);
  let liked = false, busy = false;
  const format = n => n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : String(n);
  function render(d) {
    view.innerHTML = `${svg('view')}<span>${format(d.views)} 次观看</span>`;
    like.innerHTML = `${svg('like')}<span>${format(d.likes)}</span>`;
    like.setAttribute('aria-label', `点赞 ${d.likes}`); like.setAttribute('aria-pressed', String(liked));
    share.innerHTML = `${svg('share')}<span>分享${d.shares ? ' ' + format(d.shares) : ''}</span>`;
    share.setAttribute('aria-label', '分享：复制本期网址');
  }
  render({views:0,likes:0,shares:0});
  async function call(action) {
    if (busy) return;
    busy = true;
    try {
      const r = await fetch('/api/planet-series', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});
      if (!r.ok) throw Error();
      if (action === 'like') liked = true;
      render(await r.json());
    } catch { status.textContent = '统计暂不可用，稍后自动重试'; }
    finally { busy = false; }
  }
  like.onclick = () => call('like');
  share.onclick = async () => {
    const url = new URL(location.pathname, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = '网址已复制';
      await call('share');
    } catch {
      let input = box.querySelector('input');
      if (!input) { input = document.createElement('input'); input.className = 'series-share-input'; input.readOnly = true; input.setAttribute('aria-label', '本期分享网址'); box.append(input); }
      input.value = url; input.focus(); input.select();
      status.textContent = '请复制下方网址';
    }
  };
  call('view'); setInterval(() => call('read'), 30000);
})();
