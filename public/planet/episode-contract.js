/*cheese-contract v1*/
// 正片 ⇄ 知识宇宙外壳的 postMessage 契约：只上报播放事件、接受播放控制，不管通关
(function(){'use strict';
if(window.__cheeseContract||window.parent===window)return;window.__cheeseContract=1;
const audio=document.getElementById('audio'),D=JSON.parse(document.getElementById('episode-data').textContent),scenes=D.scenes;
if(!audio||!scenes)return;
const sceneAt=t=>Math.max(0,scenes.findLastIndex(s=>t>=s.start_seconds));
const dur=()=>Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:D.duration;
const post=(type,extra)=>{try{window.parent.postMessage(Object.assign({channel:'cheese-episode',type,episode:D.episodeNumber},extra||{}),location.origin)}catch(e){}};
let last=audio.currentTime,listened=0;
audio.addEventListener('timeupdate',()=>{const t=audio.currentTime,d=t-last;last=t;if(!audio.paused&&d>0&&d<1.5)listened+=d;const i=sceneAt(t);post('progress',{t,duration:dur(),scene:i,shotId:scenes[i].id,playing:!audio.paused,listened})});
audio.addEventListener('seeked',()=>{last=audio.currentTime});
audio.addEventListener('play',()=>post('state',{playing:true}));
audio.addEventListener('pause',()=>post('state',{playing:false}));
audio.addEventListener('ended',()=>post('ended',{listened,duration:dur()}));
window.addEventListener('message',e=>{const m=e.data;if(e.origin!==location.origin||e.source!==window.parent||!m||m.channel!=='cheese-shell')return;const P=window.EpisodePlayer;if(!P)return;
if(m.type==='play')P.play();else if(m.type==='pause')P.pause();
else if(m.type==='rate')audio.playbackRate=Number(m.rate)||1;
else if(m.type==='seek'){let i=typeof m.shot==='number'?m.shot:scenes.findIndex(s=>s.id===m.shot);if(i>=0)P.chapter(i);else if(m.t!=null)P.seek(m.t);if(m.autoplay)P.play();}});
post('ready',{title:D.title,duration:dur(),shots:scenes.map(s=>({id:s.id,act:s.act,start:s.start_seconds,text:s.text}))});
})();
