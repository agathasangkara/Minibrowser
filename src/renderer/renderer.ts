// Renderer process — tab management, navigation, menu, shortcuts
const api = (window as any).electronAPI;

interface Tab {
  id: number;
  el: HTMLElement;
  webview: any;
  title: string;
  url: string;
  loading: boolean;
  favicon: string;
  muted: boolean;
  devToolsOpen: boolean;
  devToolsWidth: number;
}

let tabs: Tab[] = [];
let activeTabId = -1;
let tabIdCounter = 0;
let cachedPartition = 'persist:default';
let mirrorActive = false;
let windowCount = 1;

const $tabsContainer = document.getElementById('tabs-container')!;
const $btnNewTab = document.getElementById('btn-new-tab')!;
const $btnBack = document.getElementById('btn-back')!;
const $btnForward = document.getElementById('btn-forward')!;
const $btnReload = document.getElementById('btn-reload')!;
const $urlBar = document.getElementById('url-bar') as HTMLInputElement;
const $btnBookmark = document.getElementById('btn-bookmark')!;
const $btnProxyAction = document.getElementById('btn-proxy-action')!;
const $btnUaAction = document.getElementById('btn-ua-action')!;
const $btnDnsAction = document.getElementById('btn-dns-action')!;
const $btnHistoryAction = document.getElementById('btn-history-action')!;
const $loadingBar = document.getElementById('loading-bar')!;
const $bookmarkBar = document.getElementById('bookmark-bar')!;
const $webviewContainer = document.getElementById('webview-container')!;
const $btnMin = document.getElementById('btn-min')!;
const $btnMax = document.getElementById('btn-max')!;
const $btnClose = document.getElementById('btn-close')!;
const $overlay = document.getElementById('overlay')!;
const $overlayBackdrop = document.getElementById('overlay-backdrop')!;
const $btnMirror = document.getElementById('btn-mirror')!;
const $btnCookiesAction = document.getElementById('btn-cookies-action')!;
const $btnDevtoolsAction = document.getElementById('btn-devtools-action')!;
const $btnModheadersAction = document.getElementById('btn-modheaders-action')!;
const $btnClearData = document.getElementById('btn-clear-data')!;
const $proxyDot = document.getElementById('proxy-dot')!;
const $modheadersDot = document.getElementById('modheaders-dot')!;
const $uaDot = document.getElementById('ua-dot')!;

const reloadSvg = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M13.65 2.35A7.96 7.96 0 008 0C3.58 0 .01 3.58.01 8S3.58 16 8 16c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 018 14 6 6 0 012 8a6 6 0 016-6c1.66 0 3.14.69 4.22 1.78L9 7h7V0l-2.35 2.35z" transform="scale(0.9) translate(1,1)" fill="currentColor"/></svg>';
const stopSvg = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" fill="currentColor"/></svg>';


let loadingInterval: number | undefined;
let loadingTimeout: number | undefined;
let loadingProgress = 0;

function startLoadingBar() {
  if (loadingTimeout) { clearTimeout(loadingTimeout); loadingTimeout = undefined; }
  if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = undefined; }
  loadingProgress = 0;
  loadingTimeout = window.setTimeout(() => {
    loadingTimeout = undefined;
    loadingProgress = 5;
    $loadingBar.style.transition = 'none';
    $loadingBar.style.transform = 'scaleX(0.05)';
    $loadingBar.style.opacity = '1';
    requestAnimationFrame(() => {
      $loadingBar.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      loadingInterval = window.setInterval(() => {
        if (loadingProgress < 25) loadingProgress += 3;
        else if (loadingProgress < 50) loadingProgress += 1.5;
        else if (loadingProgress < 80) loadingProgress += 0.4;
        else if (loadingProgress < 95) loadingProgress += 0.08;
        $loadingBar.style.transform = 'scaleX(' + (loadingProgress / 100) + ')';
      }, 80);
    });
  }, 150);
}

function stopLoadingBar() {
  if (loadingTimeout) { clearTimeout(loadingTimeout); loadingTimeout = undefined; }
  if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = undefined; }
  if (loadingProgress > 0) {
    $loadingBar.style.transition = 'transform 0.15s ease-out';
    $loadingBar.style.transform = 'scaleX(1)';
    loadingProgress = 100;
    setTimeout(() => {
      $loadingBar.style.transition = 'opacity 0.3s ease';
      $loadingBar.style.opacity = '0';
      setTimeout(() => { $loadingBar.style.transition = 'none'; $loadingBar.style.transform = 'scaleX(0)'; loadingProgress = 0; }, 300);
    }, 150);
  } else {
    $loadingBar.style.transition = 'none'; $loadingBar.style.transform = 'scaleX(0)'; $loadingBar.style.opacity = '0'; loadingProgress = 0;
  }
}

function resetLoadingBar() {
  if (loadingTimeout) { clearTimeout(loadingTimeout); loadingTimeout = undefined; }
  if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = undefined; }
  $loadingBar.style.transition = 'none'; $loadingBar.style.transform = 'scaleX(0)'; $loadingBar.style.opacity = '0'; loadingProgress = 0;
}


function showContextMenu(x: number, y: number, items: { label: string; action: () => void }[]) {
  closeContextMenu();
  // Full-page transparent backdrop to capture clicks (including over webview)
  const backdrop = document.createElement('div');
  backdrop.id = 'context-menu-backdrop';
  backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:399;';
  backdrop.addEventListener('click', () => closeContextMenu());
  backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); closeContextMenu(); });
  document.body.appendChild(backdrop);

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'ctx-item';
    div.textContent = item.label;
    div.addEventListener('click', (e) => { e.stopPropagation(); item.action(); closeContextMenu(); });
    menu.appendChild(div);
  });
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - items.length * 36 - 20) + 'px';
  document.body.appendChild(menu);
}

function closeContextMenu() {
  const existing = document.getElementById('context-menu');
  if (existing) existing.remove();
  const backdrop = document.getElementById('context-menu-backdrop');
  if (backdrop) backdrop.remove();
}


const HOMEPAGE_DATA_PREFIX = 'data:text/html';

function getHomepageUrl(bookmarks: any[] = []): string {
  let bmHtml = '';
  bookmarks.forEach((b: any) => {
    const domain = (() => { try { return new URL(b.url).hostname; } catch { return ''; } })();
    const letter = (b.title || domain || '?')[0].toUpperCase();
    const esc = b.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const titleEsc = (b.title || domain).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    bmHtml += `<a class="bm" href="${esc}" title="${titleEsc}"><span class="bm-icon">${letter}</span><span class="bm-name">${titleEsc}</span></a>`;
  });
  const bmSection = bookmarks.length > 0 ? `<div class="bm-bar">${bmHtml}</div>` : '';
  const html = `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#202124;color:#e8eaed;font-family:'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:32px}h1{font-size:26px;font-weight:300;color:#9aa0a6;letter-spacing:2px}.links{display:grid;grid-template-columns:repeat(4,80px);gap:12px 20px;justify-content:center}.link{display:flex;flex-direction:column;align-items:center;gap:10px;width:80px;padding:14px 8px;border-radius:12px;cursor:pointer;text-decoration:none;color:#e8eaed;transition:background .15s}.link:hover{background:rgba(255,255,255,.06)}.icon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;transition:transform .15s}.link:hover .icon{transform:scale(1.06)}.icon svg{width:28px;height:28px}.label{font-size:11px;color:#9aa0a6}.bm-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:700px;margin-top:8px}.bm{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:#35363a;text-decoration:none;color:#e8eaed;font-size:12px;transition:background .15s}.bm:hover{background:#44454a}.bm-icon{width:18px;height:18px;border-radius:50%;background:#5f6368;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff;flex-shrink:0}.bm-name{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style></head><body>
<h1>Minibrowser</h1><div class="links">
<a class="link" href="https://www.facebook.com"><div class="icon" style="background:#c9a96e"><svg viewBox="0 0 24 24" fill="white"><path d="M9.198 21.5h4v-8.01h3.604l.396-3.98h-4V7.5a1 1 0 011-1h3v-4h-3a5 5 0 00-5 5v2.01h-2l-.396 3.98h2.396v8.01z"/></svg></div><span class="label">Facebook</span></a>
<a class="link" href="https://mail.google.com"><div class="icon" style="background:#b8956a"><svg viewBox="0 0 24 24" fill="white"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></div><span class="label">Gmail</span></a>
<a class="link" href="https://www.netflix.com"><div class="icon" style="background:#a6845e"><svg viewBox="0 0 24 24" fill="white"><path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24h-4.715zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95l-4.715-.001zm-8.487 0l-.002 14.373c0 2.673-.004 5.665 0 8.368l4.674.086v-8.28c-.003-4.828-.003-9.86 0-14.547h-4.672z"/></svg></div><span class="label">Netflix</span></a>
<a class="link" href="https://www.google.com"><div class="icon" style="background:#d4b87a"><svg viewBox="0 0 24 24" fill="white"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg></div><span class="label">Google</span></a>
<a class="link" href="https://www.youtube.com"><div class="icon" style="background:#9b7b52"><svg viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></div><span class="label">YouTube</span></a>
<a class="link" href="https://github.com/agathasangkara/Mirror-Browser"><div class="icon" style="background:#8c6e45"><svg viewBox="0 0 24 24" fill="white"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></div><span class="label">GitHub</span></a>
<a class="link" href="https://x.com/agathasangkara"><div class="icon" style="background:#c9a96e"><svg viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></div><span class="label">X</span></a>
<a class="link" href="https://t.me/herewegoagainzzzz"><div class="icon" style="background:#b8956a"><svg viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></div><span class="label">Telegram</span></a>
</div>${bmSection}</body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function isHomepageUrl(url: string): boolean {
  return !url || url === 'about:blank' || url.startsWith(HOMEPAGE_DATA_PREFIX);
}


function normalizeUrl(text: string): string {
  const t = (text || '').trim();
  if (!t) return 'about:blank';
  if (t.startsWith('about:')) return t;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(t)) return t;
  if (t.startsWith('localhost') || t.startsWith('127.0.0.1')) return 'http://' + t;
  if (/^[\w.-]+\.\w{2,}/.test(t)) return 'https://' + t;
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);
}


let cachedBookmarks: any[] = [];

async function loadBookmarks() {
  if (!api) return;
  try { cachedBookmarks = await api.getBookmarks(); } catch { cachedBookmarks = []; }
  renderBookmarkBar();
}

function renderBookmarkBar() {
  $bookmarkBar.innerHTML = '';
  cachedBookmarks.forEach((b: any) => {
    const el = document.createElement('div');
    el.className = 'bm-item';
    const domain = (() => { try { return new URL(b.url).hostname; } catch { return ''; } })();
    const letter = (b.title || domain || '?')[0].toUpperCase();
    el.innerHTML = `<span class="bm-favicon">${letter}</span><span>${b.title || domain}</span>`;
    el.title = b.url;
    el.addEventListener('click', () => {
      const tab = getActiveTab();
      if (tab) { tab.url = b.url; tab.webview.src = b.url; }
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Open in new tab', action: () => createTab(b.url) },
        { label: 'Copy link', action: () => { navigator.clipboard.writeText(b.url); showToast('Copied!'); } },
        { label: 'Delete bookmark', action: async () => { if (api) { await api.removeBookmark(b.url); await loadBookmarks(); updateBookmarkIcon(); showToast('Bookmark removed'); } } },
      ]);
    });
    $bookmarkBar.appendChild(el);
  });
}

function updateBookmarkBarVisibility() {
  const tab = getActiveTab();
  const isHome = !tab || isHomepageUrl(tab.url);
  $bookmarkBar.classList.toggle('bm-hidden', !isHome);
}

async function updateBookmarkIcon() {
  if (!api) return;
  const tab = getActiveTab();
  if (!tab || isHomepageUrl(tab.url)) { $btnBookmark.classList.remove('bookmarked'); return; }
  const is = await api.isBookmarked(tab.url);
  $btnBookmark.classList.toggle('bookmarked', is);
}

$btnBookmark.addEventListener('click', async () => {
  if (!api) return;
  const tab = getActiveTab();
  if (!tab || isHomepageUrl(tab.url)) return;
  const is = await api.isBookmarked(tab.url);
  if (is) { await api.removeBookmark(tab.url); showToast('Bookmark removed'); }
  else { await api.addBookmark(tab.url, tab.title || tab.url); showToast('Bookmarked!'); }
  await loadBookmarks();
  updateBookmarkIcon();
});


const JSON_VIEWER_SCRIPT = `
(function(){try{
if(!document.contentType||document.contentType.indexOf('json')===-1)return;
var raw='';
try{raw=document.body?(document.body.innerText||document.body.textContent||''):'';}catch(ex){}
function doFetch(){
  fetch(window.location.href,{credentials:'include'}).then(function(r){return r.text();}).then(function(t){
    var p;try{p=JSON.parse(t);}catch(e){return;}doRender(p);
  }).catch(function(){});
}
if(!raw||!raw.trim()){doFetch();return;}
var parsed;try{parsed=JSON.parse(raw);}catch(e){doFetch();return;}
doRender(parsed);
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cp(text){
  try{navigator.clipboard.writeText(text);}catch(e){
    var ta=document.createElement('textarea');ta.value=text;
    ta.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
  }
}
function doRender(obj){
  var mode='tree';
  function typeLabel(v){
    if(v===null)return 'null';if(Array.isArray(v))return 'array';return typeof v;
  }
  function treeNode(v,path,key,isLast,depth){
    var type=typeLabel(v);
    var isObj=type==='object';var isArr=type==='array';
    var compound=isObj||isArr;
    var h='<div class="tl" style="padding-left:'+(depth*16)+'px">';
    if(compound){
      var count=isArr?v.length:Object.keys(v).length;
      var label=isArr?'array':'object';
      h+='<span class="tt" data-jt="1">';
      if(key!==undefined)h+='<span class="tk">'+esc(String(key))+'</span><span class="tp"> : </span>';
      h+='<span class="tc">'+label+' {'+count+'}</span></span>';
      h+='<div class="tb">';
      if(isArr){
        for(var i=0;i<v.length;i++){
          var cp2=path+'['+i+']';
          h+=treeNode(v[i],cp2,i,i===v.length-1,depth+1);
        }
      }else{
        var keys=Object.keys(v);
        for(var i=0;i<keys.length;i++){
          var kp=path+"['"+keys[i].replace(/'/g,"\\\\'")+"']";
          h+=treeNode(v[keys[i]],kp,keys[i],i===keys.length-1,depth+1);
        }
      }
      h+='</div>';
    }else{
      if(key!==undefined)h+='<span class="tk" data-jp="'+esc(path)+'">'+esc(String(key))+'</span><span class="tp"> : </span>';
      if(type==='string')h+='<span class="tv ts" data-jp="'+esc(path)+'">&quot;'+esc(v)+'&quot;</span>';
      else if(type==='number')h+='<span class="tv tnum" data-jp="'+esc(path)+'">'+v+'</span>';
      else if(type==='boolean')h+='<span class="tv tbool" data-jp="'+esc(path)+'">'+v+'</span>';
      else h+='<span class="tv tn" data-jp="'+esc(path)+'">null</span>';
    }
    h+='</div>';
    return h;
  }
  function prettyNode(v,path,indent){
    if(v===null)return '<span class="jn" data-jp="'+esc(path)+'">null</span>';
    if(typeof v==='boolean')return '<span class="jb" data-jp="'+esc(path)+'">'+v+'</span>';
    if(typeof v==='number')return '<span class="jnum" data-jp="'+esc(path)+'">'+v+'</span>';
    if(typeof v==='string')return '<span class="js" data-jp="'+esc(path)+'">&quot;'+esc(v)+'&quot;</span>';
    var pad='  ';var sp='';for(var p=0;p<indent;p++)sp+=pad;var sp1=sp+pad;
    if(Array.isArray(v)){
      if(!v.length)return '<span class="jp" data-jp="'+esc(path)+'">[]</span>';
      var h='<span class="jnode"><span class="jt jp" data-jt="1">[</span><span class="jc"> '+v.length+' items ]</span><div class="jblk">';
      for(var i=0;i<v.length;i++){h+='<div class="jl">'+prettyNode(v[i],path+'['+i+']',indent+1)+(i<v.length-1?'<span class="jp">,</span>':'')+'</div>';}
      h+='</div><div class="jclose"><span class="jp">]</span></div></span>';
      return h;
    }
    if(typeof v==='object'){
      var k=Object.keys(v);
      if(!k.length)return '<span class="jp" data-jp="'+esc(path)+'">{}</span>';
      var h='<span class="jnode"><span class="jt jp" data-jt="1">{</span><span class="jc"> '+k.length+' keys }</span><div class="jblk">';
      for(var i=0;i<k.length;i++){
        var kp=path+"['"+k[i].replace(/'/g,"\\\\'")+"']";
        h+='<div class="jl"><span class="jk" data-jp="'+esc(kp)+'">&quot;'+esc(k[i])+'&quot;</span><span class="jp">: </span>'+prettyNode(v[k[i]],kp,indent+1)+(i<k.length-1?'<span class="jp">,</span>':'')+'</div>';
      }
      h+='</div><div class="jclose"><span class="jp">}</span></div></span>';
      return h;
    }
    return esc(String(v));
  }
  var css='*{margin:0;padding:0;box-sizing:border-box}body{background:#1e1e1e;color:#d4d4d4;font-family:Consolas,monospace;font-size:13px;line-height:1.6;padding:0;overflow-x:hidden}'+
  '.jtbar{position:sticky;top:0;z-index:10;background:#252526;border-bottom:1px solid #3c3c3c;padding:6px 16px;display:flex;gap:8px;align-items:center}'+
  '.jtbar button{background:#3c3c3c;color:#ccc;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;transition:background .15s}'+
  '.jtbar button:hover{background:#505050}.jtbar button.active{background:#c9a96e;color:#1a1a1a}'+
  '.jroot{padding:8px 16px;display:none}.jroot.active{display:block}'+
  '.jk{color:#9cdcfe}.js{color:#ce9178}.jnum{color:#b5cea8}.jb{color:#569cd6}.jn{color:#569cd6;font-style:italic}.jp{color:#d4d4d4}'+
  '.jt{cursor:pointer;user-select:none}.jt:hover{opacity:0.7}'+
  '.jt::before{content:"\\u25BC";display:inline-block;width:14px;font-size:9px;transition:transform .15s;color:#888}'+
  '.jnode.collapsed>.jt::before{transform:rotate(-90deg)}'+
  '.jc{color:#6a9955;font-style:italic;display:none;margin-left:4px}'+
  '.jnode.collapsed>.jblk,.jnode.collapsed>.jclose{display:none}'+
  '.jnode.collapsed>.jc{display:inline}'+
  '.jl{padding-left:20px}.jclose{padding-left:0}'+
  '.troot{padding:8px 0;display:none}.troot.active{display:block}'+
  '.tl{padding:2px 0;padding-right:8px;white-space:nowrap}'+
  '.tt{cursor:pointer;user-select:none}'+
  '.tt::before{content:"\\u25BC";display:inline-block;width:14px;font-size:9px;transition:transform .15s;color:#888;margin-right:2px}'+
  '.tl.collapsed>.tt::before{transform:rotate(-90deg)}'+
  '.tl.collapsed>.tb{display:none}'+
  '.tk{color:#9cdcfe}.tp{color:#888}'+
  '.tc{color:#6a9955;font-style:italic}'+
  '.ts{color:#ce9178}.tnum{color:#b5cea8}.tbool{color:#569cd6}.tn{color:#569cd6;font-style:italic}'+
  '.tv{user-select:text}'+
  '#jctx{position:fixed;background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:4px 0;z-index:100;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.5)}'+
  '.ctx-i{padding:6px 16px;cursor:pointer;color:#e8eaed;font-size:13px;transition:background .1s}.ctx-i:hover{background:#3c3d41}';
  var treeHtml=treeNode(obj,'',undefined,true,0);
  var prettyHtml=prettyNode(obj,'',0);
  document.documentElement.innerHTML='<head><style>'+css+'</style></head><body>'+
    '<div class="jtbar">'+
    '<button data-ja="tree" class="active">Tree</button>'+
    '<button data-ja="pretty">Pretty</button>'+
    '<button data-ja="copy">Copy</button>'+
    '<button data-ja="expand">Expand All</button>'+
    '<button data-ja="collapse">Collapse All</button>'+
    '</div>'+
    '<div class="troot active">'+treeHtml+'</div>'+
    '<div class="jroot">'+prettyHtml+'</div>'+
    '</body>';
  document.addEventListener('click',function(e){
    var t=e.target;
    if(!t||!t.dataset)return;
    if(t.dataset.jt){var p=t.closest?t.closest('.jnode,.tl'):t.parentNode;if(p)p.classList.toggle('collapsed');return;}
    if(t.dataset.ja==='tree'){mode='tree';document.querySelector('.troot').classList.add('active');document.querySelector('.jroot').classList.remove('active');document.querySelectorAll('.jtbar button[data-ja=tree],.jtbar button[data-ja=pretty]').forEach(function(b){b.classList.toggle('active',b.dataset.ja==='tree');});return;}
    if(t.dataset.ja==='pretty'){mode='pretty';document.querySelector('.jroot').classList.add('active');document.querySelector('.troot').classList.remove('active');document.querySelectorAll('.jtbar button[data-ja=tree],.jtbar button[data-ja=pretty]').forEach(function(b){b.classList.toggle('active',b.dataset.ja==='pretty');});return;}
    if(t.dataset.ja==='copy'){cp(JSON.stringify(obj,null,2));t.textContent='Copied!';setTimeout(function(){t.textContent='Copy';},1500);}
    if(t.dataset.ja==='expand'){var sel=mode==='tree'?'.tl.collapsed':'.jnode.collapsed';document.querySelectorAll(sel).forEach(function(n){n.classList.remove('collapsed');});}
    if(t.dataset.ja==='collapse'){var sel=mode==='tree'?'.tl:not(.collapsed)':'.jnode:not(.collapsed)';document.querySelectorAll(sel).forEach(function(n){if(n.querySelector('.tb,.jblk'))n.classList.add('collapsed');});}
  });
  document.addEventListener('contextmenu',function(e){
    var t=e.target;if(!t||!t.dataset)return;
    var jp=t.dataset.jp;if(!jp&&t.closest){var c=t.closest('[data-jp]');if(c)jp=c.dataset.jp;}
    if(jp){
      e.preventDefault();
      var old=document.getElementById('jctx');if(old)old.remove();
      var m=document.createElement('div');m.id='jctx';
      m.style.left=e.clientX+'px';m.style.top=e.clientY+'px';
      var val=t.textContent||'';if(val.startsWith('"')&&val.endsWith('"'))val=val.slice(1,-1);
      [{l:'Copy path',a:function(){cp(jp);}},{l:'Copy value',a:function(){cp(val);}}].forEach(function(it){
        var d=document.createElement('div');d.className='ctx-i';d.textContent=it.l;
        d.addEventListener('click',function(ev){ev.stopPropagation();it.a();m.remove();});
        m.appendChild(d);
      });
      document.body.appendChild(m);
      setTimeout(function(){document.addEventListener('click',function rm(){m.remove();document.removeEventListener('click',rm);});},0);
    }
  });
}
}catch(e){}}
)();
`;


let dragTabId: number | null = null;

function createTab(url?: string, noMirror?: boolean) {
  const id = ++tabIdCounter;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.tabId = String(id);
  tabEl.draggable = true;
  tabEl.innerHTML = '<img class="tab-favicon" src="" style="display:none"><span class="tab-title">New Tab</span><button class="tab-close">\u00d7</button>';
  tabEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('tab-close')) closeTab(id);
    else switchTab(id);
  });

  // Tab drag reordering
  tabEl.addEventListener('dragstart', (e) => {
    dragTabId = id;
    tabEl.classList.add('tab-dragging');
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); }
  });
  tabEl.addEventListener('dragend', () => {
    dragTabId = null;
    tabEl.classList.remove('tab-dragging');
    document.querySelectorAll('.tab-dragover').forEach((el) => el.classList.remove('tab-dragover'));
  });
  tabEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragTabId === null || dragTabId === id) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    tabEl.classList.add('tab-dragover');
  });
  tabEl.addEventListener('dragleave', () => { tabEl.classList.remove('tab-dragover'); });
  tabEl.addEventListener('drop', (e) => {
    e.preventDefault();
    tabEl.classList.remove('tab-dragover');
    if (dragTabId === null || dragTabId === id) return;
    const fromIdx = tabs.findIndex((t) => t.id === dragTabId);
    const toIdx = tabs.findIndex((t) => t.id === id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = tabs.splice(fromIdx, 1);
    tabs.splice(toIdx, 0, moved);
    tabs.forEach((t) => $tabsContainer.appendChild(t.el));
  });

  const webview = document.createElement('webview') as any;
  webview.setAttribute('partition', cachedPartition);
  webview.setAttribute('allowpopups', 'true');
  if (api && api.webviewPreloadPath) { webview.setAttribute('preload', api.webviewPreloadPath); }
  webview.classList.add('hidden-tab');

  const initialUrl = url ? normalizeUrl(url) : getHomepageUrl(cachedBookmarks);
  $webviewContainer.appendChild(webview);
  webview.src = initialUrl;
  const tab: Tab = { id, el: tabEl, webview, title: 'New Tab', url: initialUrl, loading: false, favicon: '', muted: false, devToolsOpen: false, devToolsWidth: 0 };

  // Set default browser icon for homepage tabs
  if (!url || isHomepageUrl(initialUrl)) {
    const img = tabEl.querySelector('.tab-favicon') as HTMLImageElement;
    if (img) { img.src = '../../assets/icon.png'; img.style.display = ''; }
  }

  webview.addEventListener('page-title-updated', (e: any) => {
    tab.title = e.title || 'New Tab';
    updateTabTitle(tab);
    if (tab.id === activeTabId) document.title = tab.title + ' \u2014 Minibrowser';
    if (api && !isHomepageUrl(tab.url)) { api.addHistory(tab.url, tab.title).catch(() => {}); }
  });

  webview.addEventListener('page-favicon-updated', (e: any) => {
    if (e.favicons && e.favicons.length > 0) {
      tab.favicon = e.favicons[0];
      const img = tab.el.querySelector('.tab-favicon') as HTMLImageElement;
      if (img) { img.src = e.favicons[0]; img.style.display = ''; }
    }
  });

  webview.addEventListener('did-navigate', (e: any) => {
    tab.url = e.url;
    if (tab.id === activeTabId) {
      $urlBar.value = isHomepageUrl(e.url) ? '' : e.url;
      updateBookmarkIcon();
      updateBookmarkBarVisibility();
    }
  });

  webview.addEventListener('did-navigate-in-page', (e: any) => {
    tab.url = e.url;
    if (tab.id === activeTabId) { $urlBar.value = isHomepageUrl(e.url) ? '' : e.url; }
  });

  webview.addEventListener('did-start-loading', () => {
    tab.loading = true;
    if (tab.id === activeTabId) { startLoadingBar(); $btnReload.innerHTML = stopSvg; $btnReload.title = 'Stop'; }
  });

  webview.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    if (tab.id === activeTabId) { stopLoadingBar(); $btnReload.innerHTML = reloadSvg; $btnReload.title = 'Reload (Ctrl+R)'; }
  });

  webview.addEventListener('did-fail-load', (e: any) => {
    if (e.errorCode === -3) return;
    tab.loading = false;
    if (tab.id === activeTabId) { stopLoadingBar(); $btnReload.innerHTML = reloadSvg; $btnReload.title = 'Reload (Ctrl+R)'; }
  });

  // Brown selection + JSON viewer + mirror
  webview.addEventListener('dom-ready', () => {
    webview.insertCSS('::selection{background:#c9a96e!important;color:#1a1a1a!important}::-moz-selection{background:#c9a96e!important;color:#1a1a1a!important}').catch(() => {});
    webview.executeJavaScript(JSON_VIEWER_SCRIPT).catch(() => {});
    if (mirrorActive) { webview.executeJavaScript(MIRROR_CAPTURE_SCRIPT).catch(() => {}); }
  });

  webview.addEventListener('console-message', (e: any) => {
    if (mirrorActive && e.message && e.message.startsWith('__MIRROR__:')) {
      const data = e.message.substring(11);
      if (api) api.sendMirrorEvent(data, mirrorTargetIds.length > 0 ? mirrorTargetIds : undefined);
    }
  });

  // Webview context menu (right-click on links, images, selection)
  webview.addEventListener('context-menu', (e: any) => {
    const params = e.params || {};
    const items: { label: string; action: () => void }[] = [];
    if (params.linkURL) {
      items.push({ label: 'Open link in new tab', action: () => createTab(params.linkURL) });
      items.push({ label: 'Copy link address', action: () => { navigator.clipboard.writeText(params.linkURL); showToast('Copied!'); } });
    }
    if (params.selectionText) {
      items.push({ label: 'Copy', action: () => { navigator.clipboard.writeText(params.selectionText); } });
    }
    items.push({ label: 'Inspect', action: () => { toggleDevTools(webview); } });
    showContextMenu(params.x || 0, params.y || 0, items);
  });

  tabs.push(tab);
  $tabsContainer.appendChild(tabEl);
  switchTab(id, true); // noMirror=true: newTab event already covers this switch
  // Auto-focus URL bar on new blank tab so user can type immediately
  if (!url) { setTimeout(() => { $urlBar.focus(); $urlBar.select(); }, 50); }
  if (!noMirror) sendChromeMirror('newTab', { url: isHomepageUrl(initialUrl) ? null : initialUrl });
}

function updateTabTitle(tab: Tab) {
  const titleEl = tab.el.querySelector('.tab-title');
  if (titleEl) {
    let display = tab.title || 'New Tab';
    if (display.length > 28) display = display.substring(0, 28) + '...';
    titleEl.textContent = display;
  }
}

function switchTab(id: number, noMirror?: boolean) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  // Tell main process to hide old tab's DevTools view and show new tab's (no destroy)
  if (api) {
    const prevTab = getActiveTab();
    const oldWcId = (prevTab && prevTab.id !== id) ? (() => { try { return prevTab.webview.getWebContentsId(); } catch { return null; } })() : null;
    const newWcId = (() => { try { return tab.webview.getWebContentsId(); } catch { return null; } })();
    api.switchDevToolsTab(oldWcId, newWcId, getContainerRect());
  }

  activeTabId = id;
  tabs.forEach((t) => {
    t.el.classList.toggle('active', t.id === id);
    t.webview.classList.toggle('hidden-tab', t.id !== id);
  });
  $urlBar.value = isHomepageUrl(tab.url) ? '' : (tab.url || '');
  document.title = (tab.title || 'New Tab') + ' \u2014 Minibrowser';
  if (tab.loading) { startLoadingBar(); $btnReload.innerHTML = stopSvg; }
  else { resetLoadingBar(); $btnReload.innerHTML = reloadSvg; }
  updateBookmarkIcon();
  updateBookmarkBarVisibility();
  try { currentZoom = tab.webview.getZoomFactor(); } catch (_) { currentZoom = 1.0; }
  $zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
  $toggleSound.checked = !tab.muted;
  if (!noMirror) sendChromeMirror('switchTab', { index: tabs.findIndex((t) => t.id === id) });
}

function closeTab(id: number) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  // Destroy this tab's DevTools before removing the webview
  if (api) { try { const wcId = tab.webview.getWebContentsId(); if (wcId) api.closeDevToolsForTab(wcId); } catch {} }
  if (tabs.length === 1) {
    tab.el.remove(); tab.webview.remove(); tabs.splice(0, 1);
    sendChromeMirror('closeTab');
    activeTabId = -1; createTab(undefined, true); return; // noMirror=true: target handles its own replacement
  }
  tab.el.remove(); tab.webview.remove(); tabs.splice(idx, 1);
  if (activeTabId === id) {
    sendChromeMirror('closeTab');
    const nextIdx = Math.min(idx, tabs.length - 1); switchTab(tabs[nextIdx].id, true); // noMirror=true: closeTab event covers this
  }
}

function getActiveTab(): Tab | undefined { return tabs.find((t) => t.id === activeTabId); }


let devToolsOpen = false;
let devToolsWidth = 0;

const $devtoolsDivider = document.createElement('div');
$devtoolsDivider.id = 'devtools-divider';
$devtoolsDivider.style.cssText = 'display:none;position:absolute;top:0;width:5px;height:100%;cursor:col-resize;z-index:50;background:transparent;';
$devtoolsDivider.addEventListener('mouseenter', () => { $devtoolsDivider.style.background = 'var(--accent)'; });
$devtoolsDivider.addEventListener('mouseleave', () => { if (!draggingDivider) $devtoolsDivider.style.background = 'transparent'; });
$webviewContainer.parentElement!.appendChild($devtoolsDivider);

let draggingDivider = false;
let $dragOverlay: HTMLElement | null = null;

$devtoolsDivider.addEventListener('mousedown', (e: MouseEvent) => {
  e.preventDefault();
  draggingDivider = true;
  $devtoolsDivider.style.background = 'var(--accent)';
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  // Transparent overlay captures mouse events over webview (prevents auto-move bug)
  $dragOverlay = document.createElement('div');
  $dragOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:49;cursor:col-resize;';
  document.body.appendChild($dragOverlay);
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!draggingDivider || !devToolsOpen) return;
  const parentRect = $webviewContainer.parentElement!.getBoundingClientRect();
  const newDevWidth = Math.max(200, Math.min(parentRect.width - 300, parentRect.right - e.clientX));
  devToolsWidth = Math.round(newDevWidth);
  $webviewContainer.style.marginRight = devToolsWidth + 'px';
  $devtoolsDivider.style.right = devToolsWidth + 'px';
  if (api) {
    const fullRect = getFullContainerRect();
    api.resizeDevTools(fullRect, devToolsWidth);
  }
});

document.addEventListener('mouseup', () => {
  if (draggingDivider) {
    draggingDivider = false;
    $devtoolsDivider.style.background = 'transparent';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if ($dragOverlay) { $dragOverlay.remove(); $dragOverlay = null; }
  }
});

function getFullContainerRect(): { x: number; y: number; w: number; h: number } {
  // Get the FULL container rect (before margin applied) for positioning the WebContentsView
  const r = $webviewContainer.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width + devToolsWidth), h: Math.round(r.height) };
}

function getContainerRect(): { x: number; y: number; w: number; h: number } {
  const parent = $webviewContainer.parentElement!.getBoundingClientRect();
  return { x: Math.round($webviewContainer.getBoundingClientRect().x), y: Math.round($webviewContainer.getBoundingClientRect().y), w: Math.round(parent.width), h: Math.round($webviewContainer.getBoundingClientRect().height) };
}

let lastDevToolsToggle = 0;
function toggleDevTools(webview: any) {
  const now = Date.now();
  if (now - lastDevToolsToggle < 200) return; // debounce double-fire from document + webview shortcut
  lastDevToolsToggle = now;
  if (!api || !webview) return;
  api.openDevTools(webview.getWebContentsId(), getContainerRect());
}

function showDevToolsDivider(dw: number) {
  $devtoolsDivider.style.display = 'block';
  $devtoolsDivider.style.right = dw + 'px';
  const cr = $webviewContainer.getBoundingClientRect();
  $devtoolsDivider.style.top = cr.top + 'px';
  $devtoolsDivider.style.height = cr.height + 'px';
}

function hideDevToolsDivider() {
  $devtoolsDivider.style.display = 'none';
}

if (api) {
  api.onDevToolsState((open: boolean, dw: number) => {
    devToolsOpen = open;
    const activeTab = getActiveTab();
    if (activeTab) { activeTab.devToolsOpen = open; activeTab.devToolsWidth = dw; }
    if (open) {
      devToolsWidth = dw;
      $webviewContainer.style.marginRight = dw + 'px';
      showDevToolsDivider(dw);
    } else {
      devToolsWidth = 0;
      $webviewContainer.style.marginRight = '0';
      hideDevToolsDivider();
    }
  });
}

window.addEventListener('resize', () => {
  if (devToolsOpen && api) {
    showDevToolsDivider(devToolsWidth);
    const fullRect = getFullContainerRect();
    api.resizeDevTools(fullRect, devToolsWidth);
  }
});


function navigateUrl() {
  const tab = getActiveTab();
  if (!tab) return;
  const url = normalizeUrl($urlBar.value);
  tab.url = url; tab.webview.src = url;
  sendChromeMirror('navigate', { url });
}

$btnBack.addEventListener('click', () => { const t = getActiveTab(); if (t) { try { if (t.webview.canGoBack()) { t.webview.goBack(); } else { t.webview.loadURL(getHomepageUrl()); } } catch (_) {} sendChromeMirror('back'); } });
$btnForward.addEventListener('click', () => { const t = getActiveTab(); if (t) try { t.webview.goForward(); } catch (_) {} sendChromeMirror('forward'); });
$btnReload.addEventListener('click', () => {
  const t = getActiveTab(); if (!t) return;
  try { if (t.loading) t.webview.stop(); else t.webview.reload(); } catch (_) {}
  sendChromeMirror('reload');
});
$btnNewTab.addEventListener('click', () => { createTab(); });


let notifBlocked = false;

const $btnWvSettings = document.getElementById('btn-wv-settings')!;
const $wvSettingsDD = document.getElementById('wv-settings-dropdown')!;
const $toggleSound = document.getElementById('toggle-sound') as HTMLInputElement;
const $toggleNotif = document.getElementById('toggle-notif') as HTMLInputElement;

function closeWvSettings() { $wvSettingsDD.classList.add('hidden'); }

function syncSoundToggle() {
  const t = tabs.find(t => t.id === activeTabId);
  $toggleSound.checked = t ? !t.muted : true;
}

$btnWvSettings.addEventListener('click', (e) => {
  e.stopPropagation();
  syncSoundToggle();
  $wvSettingsDD.classList.toggle('hidden');
});

// Close dropdown when clicking outside (document) or on webview (mousedown catches before webview steals focus)
document.addEventListener('mousedown', (e) => {
  if (!$wvSettingsDD.classList.contains('hidden') && !(e.target as HTMLElement).closest('#wv-settings-wrap')) {
    closeWvSettings();
  }
});
// Also close when window/webview steals focus away
window.addEventListener('blur', closeWvSettings);

$toggleSound.addEventListener('change', () => {
  const t = tabs.find(t => t.id === activeTabId);
  if (!t) return;
  t.muted = !$toggleSound.checked;
  try { t.webview.setAudioMuted(t.muted); } catch (_) {}
  showToast(t.muted ? 'Tab muted' : 'Tab unmuted');
});

$toggleNotif.addEventListener('change', () => {
  notifBlocked = !$toggleNotif.checked;
  if (api) api.setNotifications(!notifBlocked);
  showToast(notifBlocked ? 'Notifications disabled' : 'Notifications enabled');
});


if (api) {
  $btnMin.addEventListener('click', () => api.minimizeWindow());
  $btnMax.addEventListener('click', () => api.maximizeWindow());
  $btnClose.addEventListener('click', () => api.closeWindow());
  try { api.onMaximizeChange((m: boolean) => { $btnMax.innerHTML = m ? '&#xE923;' : '&#xE922;'; $btnMax.title = m ? 'Restore' : 'Maximize'; }); } catch (_) {}
}


const $zoomLevel = document.getElementById('zoom-level')!;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
let currentZoom = 1.0;

function applyZoom(factor: number) {
  currentZoom = Math.max(ZOOM_STEPS[0], Math.min(ZOOM_STEPS[ZOOM_STEPS.length - 1], factor));
  let closest = ZOOM_STEPS[0];
  for (const s of ZOOM_STEPS) { if (Math.abs(s - currentZoom) < Math.abs(closest - currentZoom)) closest = s; }
  currentZoom = closest;
  const t = getActiveTab();
  if (t) { t.webview.setZoomFactor(currentZoom); }
  $zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
}

function zoomIn() {
  const idx = ZOOM_STEPS.indexOf(currentZoom);
  if (idx < ZOOM_STEPS.length - 1) applyZoom(ZOOM_STEPS[idx + 1]);
}

function zoomOut() {
  const idx = ZOOM_STEPS.indexOf(currentZoom);
  if (idx > 0) applyZoom(ZOOM_STEPS[idx - 1]);
}

function zoomReset() { applyZoom(1.0); }

document.getElementById('zoom-in')!.addEventListener('click', zoomIn);
document.getElementById('zoom-out')!.addEventListener('click', zoomOut);
$zoomLevel.addEventListener('click', zoomReset);

$webviewContainer.addEventListener('wheel', (e: WheelEvent) => {
  if (e.ctrlKey) { e.preventDefault(); if (e.deltaY < 0) zoomIn(); else zoomOut(); }
}, { passive: false });


document.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') { closeOverlay(); closeContextMenu(); } });

$btnCookiesAction.addEventListener('click', () => openCookiePanel());
$btnDevtoolsAction.addEventListener('click', () => { const t = getActiveTab(); if (t) toggleDevTools(t.webview); });
$btnModheadersAction.addEventListener('click', () => openModHeadersPanel());
$btnProxyAction.addEventListener('click', () => openPanel('proxy'));
$btnUaAction.addEventListener('click', () => openUaPanel());
$btnDnsAction.addEventListener('click', () => openDnsPanel());
$btnHistoryAction.addEventListener('click', () => openHistoryPanel());
document.getElementById('btn-clone-action')!.addEventListener('click', () => openClonePanel());
const $clearConfirm = document.getElementById('clear-confirm')!;

function showClearConfirm() {
  $clearConfirm.classList.remove('hidden');
  const backdrop = document.createElement('div');
  backdrop.id = 'clear-confirm-backdrop';
  backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:199;';
  backdrop.addEventListener('click', () => hideClearConfirm());
  document.body.appendChild(backdrop);
}

function hideClearConfirm() {
  $clearConfirm.classList.add('hidden');
  const backdrop = document.getElementById('clear-confirm-backdrop');
  if (backdrop) backdrop.remove();
}

$btnClearData.addEventListener('click', (e: Event) => {
  e.stopPropagation();
  if ($clearConfirm.classList.contains('hidden')) showClearConfirm();
  else hideClearConfirm();
});
document.getElementById('clear-yes')!.addEventListener('click', () => {
  hideClearConfirm();
  doClearData();
});
document.getElementById('clear-no')!.addEventListener('click', () => {
  hideClearConfirm();
});


function openPanel(name: string) {
  document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.remove('hidden');
  // Constrain overlay to webview area (left of DevTools) so DevTools stays visible
  $overlay.style.right = devToolsOpen ? devToolsWidth + 'px' : '0';
  $overlay.classList.remove('hidden');
}
function closeOverlay() {
  $overlay.classList.add('hidden');
}

$overlayBackdrop.addEventListener('click', closeOverlay);


const $proxyInput = document.getElementById('proxy-input') as HTMLInputElement;
const $proxyResult = document.getElementById('proxy-result')!;

let proxyActive = false;
let uaActive = false;

function updateProxyStatus(on: boolean) {
  proxyActive = on;
  $proxyDot.classList.toggle('active', on);
}

function updateUAStatus(ua: string) {
  uaActive = !!ua;
  $uaDot.classList.toggle('active', uaActive);

}

if (api) {
  api.getProxy().then((r: any) => { $proxyInput.value = r.proxy || ''; updateProxyStatus(r.active); }).catch(() => {});
  api.getUserAgent().then((r: any) => { updateUAStatus(r.custom ? r.ua : ''); }).catch(() => {});
}

document.getElementById('proxy-check')!.addEventListener('click', async () => {
  if (!api) return;
  const raw = $proxyInput.value.trim();
  if (!raw) { $proxyResult.textContent = 'No proxy set'; return; }
  $proxyResult.textContent = 'Checking...';
  try {
    const r = await api.checkProxy(raw);
    $proxyResult.textContent = r.ok ? 'Connected!\nIP: ' + r.ip + '\nCountry: ' + r.country : 'Failed: ' + r.error;
  } catch (e: any) { $proxyResult.textContent = 'Error: ' + e.message; }
});

document.getElementById('proxy-off')!.addEventListener('click', async () => {
  if (!api) return;
  // Disable proxy session but keep saved string for next On
  await api.proxyOff();
  updateProxyStatus(false);
  $proxyResult.textContent = '';
  closeOverlay();
  showToast('Proxy off');
});

document.getElementById('proxy-save')!.addEventListener('click', async () => {
  if (!api) return;
  const raw = $proxyInput.value.trim();
  if (!raw) { showToast('Enter proxy address'); return; }
  $proxyResult.textContent = 'Checking proxy...';
  try {
    const r = await api.checkProxy(raw);
    if (!r.ok) {
      $proxyResult.textContent = 'Proxy not active: ' + r.error;
      showToast('Proxy not active');
      return;
    }
    $proxyResult.textContent = 'Connected!\nIP: ' + r.ip + '\nCountry: ' + r.country;
    const ok = await api.setProxy(raw);
    updateProxyStatus(!!raw && ok);
    closeOverlay();
    showToast('Proxy on — ' + r.ip);
  } catch (e: any) {
    $proxyResult.textContent = 'Error: ' + e.message;
    showToast('Proxy not active');
  }
});


const $cookieFilter = document.getElementById('cookie-filter') as HTMLInputElement;
const $cookieTbody = document.getElementById('cookie-tbody')!;
const $cookieSelectAll = document.getElementById('cookie-select-all') as HTMLInputElement;
let currentCookies: { name: string; value: string; domain: string; path: string }[] = [];
let editCookieDomain = '';

async function openCookiePanel() {
  if (!api) return;
  const tab = getActiveTab();
  if (!tab) return;
  try { currentCookies = await api.getCookies(tab.url || '', cachedPartition); } catch { currentCookies = []; }
  renderCookieTable();
  openPanel('cookie');
}

function renderCookieTable() {
  const filter = ($cookieFilter.value || '').toLowerCase();
  const filtered = currentCookies.filter((c) => !filter || c.name.toLowerCase().includes(filter));
  $cookieTbody.innerHTML = '';
  filtered.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="checkbox" class="cookie-cb" data-idx="${i}"></td><td title="${c.name}">${c.name}</td><td title="${c.value}">${c.value}</td><td title="${c.domain}">${c.domain}</td>`;
    tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      (document.getElementById('cookie-edit-name') as HTMLInputElement).value = c.name;
      (document.getElementById('cookie-edit-value') as HTMLInputElement).value = c.value;
      editCookieDomain = c.domain;
    });
    $cookieTbody.appendChild(tr);
  });
}

$cookieFilter.addEventListener('input', renderCookieTable);
$cookieSelectAll.addEventListener('change', () => {
  const checked = $cookieSelectAll.checked;
  $cookieTbody.querySelectorAll('.cookie-cb').forEach((cb: any) => { cb.checked = checked; });
});

function getSelectedCookieObjects(): typeof currentCookies {
  const filter = ($cookieFilter.value || '').toLowerCase();
  const filtered = currentCookies.filter((c) => !filter || c.name.toLowerCase().includes(filter));
  const checkedIdxs = new Set<number>();
  $cookieTbody.querySelectorAll('.cookie-cb:checked').forEach((cb: any) => { checkedIdxs.add(parseInt(cb.dataset.idx)); });
  return filtered.filter((_, i) => checkedIdxs.has(i));
}

function cookiesToSemicolon(cookies: typeof currentCookies): string {
  return cookies.map((c) => c.name + '=' + c.value).join('; ');
}

function cookiesToObject(cookies: typeof currentCookies): string {
  const obj: Record<string, string> = {};
  cookies.forEach((c) => { obj[c.name] = c.value; });
  return JSON.stringify(obj, null, 2);
}

document.getElementById('cookie-copy')!.addEventListener('click', () => {
  const selected = getSelectedCookieObjects();
  if (!selected.length) { showToast('No cookies selected'); return; }
  const text = cookiesToSemicolon(selected);
  navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => {});
});

document.getElementById('cookie-copy-all')!.addEventListener('click', () => {
  const text = cookiesToObject(currentCookies);
  navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => {});
});

document.getElementById('cookie-delete')!.addEventListener('click', async () => {
  if (!api) return;
  const tab = getActiveTab();
  if (!tab) return;
  const selected = getSelectedCookieObjects();
  if (!selected.length) { showToast('No cookies selected'); return; }
  const ok = await api.removeCookies(cachedPartition, tab.url || '', selected.map((c) => ({ name: c.name, domain: c.domain })));
  if (ok) { showToast(selected.length + ' cookie(s) deleted'); await openCookiePanel(); }
  else showToast('Failed to delete cookies');
});

document.getElementById('cookie-set')!.addEventListener('click', async () => {
  if (!api) return;
  const tab = getActiveTab();
  if (!tab) return;
  const name = (document.getElementById('cookie-edit-name') as HTMLInputElement).value.trim();
  const value = (document.getElementById('cookie-edit-value') as HTMLInputElement).value;
  if (!name) { showToast('Enter cookie name'); return; }
  const domain = editCookieDomain || (() => { try { return new URL(tab.url).hostname; } catch { return ''; } })();
  const ok = await api.setCookie(cachedPartition, tab.url, name, value, domain, '/');
  if (ok) { showToast('Cookie set'); await openCookiePanel(); }
  else showToast('Failed to set cookie');
});


const $historyFilter = document.getElementById('history-filter') as HTMLInputElement;
const $historyList = document.getElementById('history-list')!;

async function openHistoryPanel() { if (!api) return; await renderHistoryList(); openPanel('history'); }

function getDateGroup(ts: number): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;
  const monthAgo = today - 30 * 86400000;
  if (ts >= today) return 'Today';
  if (ts >= yesterday) return 'Yesterday';
  if (ts >= weekAgo) return 'This Week';
  if (ts >= monthAgo) return 'This Month';
  return 'Older';
}

async function renderHistoryList() {
  if (!api) return;
  const entries = await api.getHistory();
  const filter = ($historyFilter.value || '').toLowerCase();
  const filtered = entries.filter((e: any) => !filter || e.url.toLowerCase().includes(filter) || (e.title || '').toLowerCase().includes(filter));
  $historyList.innerHTML = '';

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
  const groups: Record<string, any[]> = {};
  groupOrder.forEach((g) => { groups[g] = []; });
  filtered.slice(0, 500).forEach((e: any) => {
    const group = getDateGroup(e.visitedAt);
    groups[group].push(e);
  });

  let hasAny = false;
  groupOrder.forEach((groupName) => {
    const items = groups[groupName];
    if (items.length === 0) return;
    hasAny = true;

    const header = document.createElement('div');
    header.className = 'history-group-header';
    header.innerHTML = `<span>${groupName}</span><span class="history-group-count">${items.length}</span>`;
    $historyList.appendChild(header);

    items.forEach((e: any) => {
      const div = document.createElement('div');
      div.className = 'history-entry';
      const time = new Date(e.visitedAt);
      const timeStr = (groupName === 'Today' || groupName === 'Yesterday')
        ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : time.toLocaleDateString() + ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<span class="history-time">${timeStr}</span><span class="history-title">${(e.title || '').replace(/</g, '&lt;')}</span><span class="history-url">${e.url.replace(/</g, '&lt;')}</span><button class="history-del" data-ts="${e.visitedAt}" title="Delete"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg></button>`;
      div.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).closest('.history-del')) return;
        const tab = getActiveTab();
        if (tab) { tab.url = e.url; tab.webview.src = e.url; }
        closeOverlay();
      });
      $historyList.appendChild(div);
    });
  });

  if (!hasAny) $historyList.innerHTML = '<div style="padding:12px;color:var(--menu-text2);text-align:center">No history</div>';
}

$historyFilter.addEventListener('input', () => { renderHistoryList(); });
document.getElementById('history-clear')!.addEventListener('click', async () => { if (!api) return; await api.clearHistory(); await renderHistoryList(); showToast('History cleared'); });
$historyList.addEventListener('click', async (e: Event) => {
  const btn = (e.target as HTMLElement).closest('.history-del') as HTMLElement;
  if (!btn) return; e.stopPropagation();
  const ts = parseInt(btn.dataset.ts || '0');
  if (api && ts) { await api.deleteHistory(ts); await renderHistoryList(); }
});


const $modheadersList = document.getElementById('modheaders-list')!;
let modHeaderRules: { key: string; value: string; enabled: boolean }[] = [];

async function openModHeadersPanel() {
  if (!api) return;
  try { modHeaderRules = await api.getModHeaders(); } catch { modHeaderRules = []; }
  renderModHeaders();
  openPanel('modheaders');
}

function renderModHeaders() {
  $modheadersList.innerHTML = '';
  modHeaderRules.forEach((rule, i) => {
    const div = document.createElement('div');
    div.className = 'mh-rule';
    div.innerHTML = `<label class="toggle-switch"><input type="checkbox" ${rule.enabled ? 'checked' : ''} class="mh-toggle" data-idx="${i}"><span class="toggle-slider"></span></label><input type="text" value="${rule.key.replace(/"/g, '&quot;')}" placeholder="Header key" class="mh-key" data-idx="${i}"><input type="text" value="${rule.value.replace(/"/g, '&quot;')}" placeholder="Header value" class="mh-val" data-idx="${i}"><button class="mh-remove" data-idx="${i}" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg></button>`;
    $modheadersList.appendChild(div);
  });
}

function updateModHeadersStatus() {
  $modheadersDot.classList.toggle('active', modHeaderRules.some((r) => r.enabled && r.key));

}

document.getElementById('modheaders-add')!.addEventListener('click', () => { modHeaderRules.push({ key: '', value: '', enabled: true }); renderModHeaders(); });

document.getElementById('modheaders-save')!.addEventListener('click', async () => {
  if (!api) return;
  $modheadersList.querySelectorAll('.mh-rule').forEach((row, i) => {
    if (modHeaderRules[i]) {
      modHeaderRules[i].enabled = (row.querySelector('.mh-toggle') as HTMLInputElement).checked;
      modHeaderRules[i].key = (row.querySelector('.mh-key') as HTMLInputElement).value.trim();
      modHeaderRules[i].value = (row.querySelector('.mh-val') as HTMLInputElement).value;
    }
  });
  modHeaderRules = modHeaderRules.filter((r) => r.key);
  await api.setModHeaders(modHeaderRules);
  updateModHeadersStatus();
  closeOverlay();
  showToast('Headers saved');
});

$modheadersList.addEventListener('click', (e: Event) => {
  const btn = (e.target as HTMLElement).closest('.mh-remove') as HTMLElement;
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx || '-1');
  if (idx >= 0) { modHeaderRules.splice(idx, 1); renderModHeaders(); }
});

if (api) { api.getModHeaders().then((rules: any) => { modHeaderRules = rules || []; updateModHeadersStatus(); }).catch(() => {}); }


async function doClearData() {
  if (!api) return;
  try { await api.clearData(cachedPartition); const t = getActiveTab(); if (t) t.webview.reload(); showToast('Data cleared'); }
  catch (_) { showToast('Clear failed'); }
}


const $profileList = document.getElementById('profile-list')!;
const $newProfileName = document.getElementById('new-profile-name') as HTMLInputElement;
let selectedProfile = '';

async function openClonePanel() {
  if (!api) return;
  try {
    const profiles = await api.getProfiles();
    let running: string[] = [];
    try { running = await api.getRunningProfiles(); } catch {}
    $profileList.innerHTML = ''; selectedProfile = '';
    profiles.forEach((p: any) => {
      const isRunning = running.includes(p.name);
      const item = document.createElement('div');
      item.className = 'profile-item';
      item.innerHTML = `<span>${p.name}</span>${isRunning ? '<span class="profile-badge">running</span>' : ''}<button class="profile-del" data-name="${p.name.replace(/"/g, '&quot;')}" title="Delete profile"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg></button>`;
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.profile-del')) return;
        document.querySelectorAll('.profile-item').forEach((el) => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedProfile = p.name;
      });
      $profileList.appendChild(item);
    });
  } catch (_) {}
  openPanel('clone');
}

$profileList.addEventListener('click', async (e: Event) => {
  const btn = (e.target as HTMLElement).closest('.profile-del') as HTMLElement;
  if (!btn || !api) return;
  e.stopPropagation();
  const name = btn.dataset.name;
  if (!name) return;
  await api.deleteProfile(name);
  showToast('Profile deleted');
  openClonePanel();
});

document.getElementById('profile-create')!.addEventListener('click', async () => {
  if (!api) return; const raw = $newProfileName.value.trim(); if (!raw) return;
  const name = raw.startsWith('Minibrowser - ') ? raw : 'Minibrowser - ' + raw;
  const ok = await api.createProfile(name);
  if (ok) { $newProfileName.value = ''; showToast('Profile created'); openClonePanel(); }
  else showToast('Profile already exists');
});

document.getElementById('profile-launch')!.addEventListener('click', () => {
  if (!api || !selectedProfile) { showToast('Select a profile first'); return; }
  api.cloneWindow(selectedProfile); closeOverlay(); showToast('Launched: ' + selectedProfile);
});


const MIRROR_CAPTURE_SCRIPT = `
(function() {
  if (window.__mirrorActive) return;
  window.__mirrorActive = true;
  window.__mirrorReplaying = false;
  function gs(el) {
    if (!el || el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    if (el.id) return '#' + el.id;
    var p = el.parentNode;
    if (!p || !p.children) return el.tagName ? el.tagName.toLowerCase() : '';
    var s = Array.from(p.children).filter(function(c) { return c.tagName === el.tagName; });
    var i = s.indexOf(el);
    var n = s.length > 1 ? ':nth-of-type(' + (i + 1) + ')' : '';
    return gs(p) + '>' + el.tagName.toLowerCase() + n;
  }
  function send(d) {
    if (!window.__mirrorActive || window.__mirrorReplaying) return;
    console.log('__MIRROR__:' + JSON.stringify(d));
  }
  document.addEventListener('mousedown', function(e) { send({ t: 'md', x: e.clientX, y: e.clientY, b: e.button }); }, true);
  document.addEventListener('mouseup', function(e) { send({ t: 'mu', x: e.clientX, y: e.clientY, b: e.button }); }, true);
  document.addEventListener('click', function(e) { send({ t: 'cl', x: e.clientX, y: e.clientY }); }, true);
  var st;
  window.addEventListener('scroll', function() { clearTimeout(st); st = setTimeout(function() { send({ t: 'sc', x: window.scrollX, y: window.scrollY }); }, 50); }, true);
  document.addEventListener('scroll', function(e) {
    var el = e.target;
    if (el && el !== document && el !== document.documentElement) {
      clearTimeout(el.__mst);
      el.__mst = setTimeout(function() { send({ t: 'es', s: gs(el), x: el.scrollLeft, y: el.scrollTop }); }, 50);
    }
  }, true);
  document.addEventListener('input', function(e) {
    var el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
      send({ t: 'in', s: gs(el), v: el.value });
    }
  }, true);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Dead') return;
    send({ t: 'kd', key: e.key, code: e.code, c: e.ctrlKey, s: e.shiftKey, a: e.altKey, m: e.metaKey });
  }, true);
  document.addEventListener('keyup', function(e) { send({ t: 'ku', key: e.key, code: e.code }); }, true);
  document.addEventListener('focusin', function(e) { if (e.target && e.target.tagName) send({ t: 'fo', s: gs(e.target) }); }, true);
  var selT;
  document.addEventListener('selectionchange', function() {
    clearTimeout(selT);
    selT = setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { send({ t: 'sel', empty: true }); return; }
      function np(node) {
        if (!node) return null;
        var par = node.nodeType === 3 ? node.parentNode : node;
        var s = gs(par);
        var ti = 0;
        if (node.nodeType === 3) {
          var ch = par.childNodes;
          for (var i = 0; i < ch.length; i++) { if (ch[i] === node) break; if (ch[i].nodeType === 3) ti++; }
        }
        return { s: s, ti: ti, tn: node.nodeType === 3 };
      }
      var an = np(sel.anchorNode);
      var fn = np(sel.focusNode);
      if (an && fn) send({ t: 'sel', an: an, ao: sel.anchorOffset, fn: fn, fo: sel.focusOffset });
    }, 80);
  }, true);
})();
`;

let mirrorTargetIds: number[] = [];

function sendChromeMirror(action: string, data?: any) {
  if (!mirrorActive || !api) return;
  api.sendMirrorEvent(JSON.stringify({ t: 'chrome', action, ...data }), mirrorTargetIds.length > 0 ? mirrorTargetIds : undefined);
}

const mirrorPlaySvg = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 1v8l7-4z" fill="currentColor"/></svg>';
const mirrorStopSvg = '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor"/></svg>';

function updateMirrorButton() {
  $btnMirror.innerHTML = mirrorActive ? mirrorStopSvg : mirrorPlaySvg;
  $btnMirror.title = mirrorActive ? 'Stop mirroring' : 'Start mirroring';
  $btnMirror.classList.toggle('mirror-active', mirrorActive);
}

let mirrorDropdownOpen = false;

function closeMirrorDropdown() {
  const dd = document.getElementById('mirror-dropdown');
  if (dd) dd.remove();
  mirrorDropdownOpen = false;
}

async function showMirrorDropdown() {
  if (!api) return;
  closeMirrorDropdown();
  mirrorDropdownOpen = true;

  const targets = await api.getMirrorTargets();
  if (targets.length === 0) { showToast('No other windows open'); mirrorDropdownOpen = false; return; }

  const dd = document.createElement('div');
  dd.id = 'mirror-dropdown';
  dd.className = 'mirror-dropdown';
  dd.innerHTML = '<div class="mirror-dd-title">Mirror to:</div>';

  // Select All row
  const selectAllRow = document.createElement('label');
  selectAllRow.className = 'mirror-dd-item';
  selectAllRow.style.cssText = 'border-bottom:1px solid var(--border);margin-bottom:2px;padding-bottom:8px;font-weight:500';
  const selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  const selectAllLabel = document.createElement('span');
  selectAllLabel.textContent = 'Select All';
  selectAllRow.appendChild(selectAllCb);
  selectAllRow.appendChild(selectAllLabel);
  dd.appendChild(selectAllRow);

  // Individual target rows
  targets.forEach((t: { windowId: number; profile: string }) => {
    const row = document.createElement('label');
    row.className = 'mirror-dd-item';
    const checked = mirrorTargetIds.includes(t.windowId);
    row.innerHTML = `<input type="checkbox" class="mirror-cb" data-wid="${t.windowId}" ${checked ? 'checked' : ''}><span>${t.profile}</span>`;
    dd.appendChild(row);
  });

  // Sync Select All state
  function updateSelectAll() {
    const cbs = Array.from(dd.querySelectorAll('.mirror-cb')) as HTMLInputElement[];
    const n = cbs.filter((c) => c.checked).length;
    selectAllCb.checked = n === cbs.length;
    selectAllCb.indeterminate = n > 0 && n < cbs.length;
  }
  updateSelectAll();
  selectAllCb.addEventListener('change', () => {
    dd.querySelectorAll('.mirror-cb').forEach((cb: any) => { cb.checked = selectAllCb.checked; });
  });
  dd.querySelectorAll('.mirror-cb').forEach((cb: any) => { cb.addEventListener('change', updateSelectAll); });

  function getCheckedIds(): number[] {
    const ids: number[] = [];
    dd.querySelectorAll('.mirror-cb:checked').forEach((cb: any) => { ids.push(parseInt(cb.dataset.wid)); });
    return ids;
  }

  function stopMirror() {
    mirrorActive = false;
    mirrorTargetIds = [];
    tabs.forEach((t) => { t.webview.executeJavaScript('window.__mirrorActive=false;').catch(() => {}); });
    showToast('Mirror off');
    updateMirrorButton();
    closeMirrorDropdown();
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'mirror-dd-actions';

  if (mirrorActive) {
    // When ON: Stop All + Apply (to update target list or partially stop)
    const btnStopAll = document.createElement('button');
    btnStopAll.className = 'btn-secondary';
    btnStopAll.textContent = 'Stop All';
    btnStopAll.style.cssText = 'height:26px;padding:0 10px;font-size:11px;flex:1';
    btnStopAll.addEventListener('click', stopMirror);

    const btnApply = document.createElement('button');
    btnApply.className = 'btn-primary';
    btnApply.textContent = 'Apply';
    btnApply.style.cssText = 'height:26px;padding:0 10px;font-size:11px;flex:1';
    btnApply.addEventListener('click', () => {
      const ids = getCheckedIds();
      if (ids.length === 0) { stopMirror(); return; }
      mirrorTargetIds = ids;
      showToast('Mirror updated');
      updateMirrorButton();
      closeMirrorDropdown();
    });

    btnRow.appendChild(btnStopAll);
    btnRow.appendChild(btnApply);
  } else {
    // When OFF: Start
    const btnStart = document.createElement('button');
    btnStart.className = 'btn-primary';
    btnStart.textContent = 'Start';
    btnStart.style.cssText = 'height:26px;padding:0 12px;font-size:11px;flex:1';
    btnStart.addEventListener('click', () => {
      const ids = getCheckedIds();
      if (ids.length === 0) { showToast('Select at least one profile'); return; }
      mirrorTargetIds = ids;
      mirrorActive = true;
      if (api) api.activateMirror();
      tabs.forEach((t) => { t.webview.executeJavaScript(MIRROR_CAPTURE_SCRIPT).catch(() => {}); });
      showToast('Mirror on');
      updateMirrorButton();
      closeMirrorDropdown();
    });
    btnRow.appendChild(btnStart);
  }

  dd.appendChild(btnRow);
  document.body.appendChild(dd);

  const rect = $btnMirror.getBoundingClientRect();
  dd.style.top = (rect.bottom + 4) + 'px';
  dd.style.right = (window.innerWidth - rect.right) + 'px';

  setTimeout(() => {
    document.addEventListener('click', function handler(e: Event) {
      if (!(e.target as HTMLElement).closest('#mirror-dropdown') && !(e.target as HTMLElement).closest('#btn-mirror')) {
        closeMirrorDropdown();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

$btnMirror.addEventListener('click', (e: Event) => {
  e.stopPropagation();
  if (mirrorDropdownOpen) closeMirrorDropdown();
  else showMirrorDropdown();
});
updateMirrorButton();

// Handle mirror deactivation from other windows
if (api) {
  api.onMirrorDeactivate(() => {
    if (mirrorActive) {
      mirrorActive = false;
      mirrorTargetIds = [];
      updateMirrorButton();
      tabs.forEach((t) => { t.webview.executeJavaScript('window.__mirrorActive=false;').catch(() => {}); });
    }
  });
}

function replayMirrorEvent(webview: any, data: string) {
  try {
    const ev = JSON.parse(data);
    const esc = (s: string) => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    switch (ev.t) {
      case 'md':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.elementFromPoint(${ev.x},${ev.y});if(el){el.dispatchEvent(new MouseEvent('mousedown',{clientX:${ev.x},clientY:${ev.y},button:${ev.b||0},bubbles:true,cancelable:true}));if(['INPUT','TEXTAREA','SELECT'].includes(el.tagName))el.focus();}var d=document.createElement('div');d.id='__mirror_cursor';d.style.cssText='position:fixed;left:'+(${ev.x}-6)+'px;top:'+(${ev.y}-6)+'px;width:12px;height:12px;border-radius:50%;background:rgba(201,169,110,0.7);pointer-events:none;z-index:2147483647;';document.body.appendChild(d);setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        break;
      case 'mu':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.elementFromPoint(${ev.x},${ev.y});if(el)el.dispatchEvent(new MouseEvent('mouseup',{clientX:${ev.x},clientY:${ev.y},button:${ev.b||0},bubbles:true,cancelable:true}));var c=document.getElementById('__mirror_cursor');if(c)c.remove();setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        break;
      case 'cl':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.elementFromPoint(${ev.x},${ev.y});if(el){el.dispatchEvent(new MouseEvent('click',{clientX:${ev.x},clientY:${ev.y},bubbles:true,cancelable:true}));el.click();if(['INPUT','TEXTAREA','SELECT'].includes(el.tagName))el.focus();}var r=document.createElement('div');r.style.cssText='position:fixed;left:'+(${ev.x}-12)+'px;top:'+(${ev.y}-12)+'px;width:24px;height:24px;border-radius:50%;background:rgba(201,169,110,0.5);border:2px solid rgba(201,169,110,0.8);pointer-events:none;z-index:2147483647;transition:transform 0.4s,opacity 0.4s;transform:scale(0.3);opacity:1;';document.body.appendChild(r);requestAnimationFrame(function(){r.style.transform='scale(1.5)';r.style.opacity='0';});setTimeout(function(){r.remove()},500);setTimeout(function(){window.__mirrorReplaying=false},200)})();`).catch(() => {});
        break;
      case 'sc':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;window.scrollTo(${ev.x},${ev.y});setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        break;
      case 'es':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.querySelector('${esc(ev.s)}');if(el){el.scrollLeft=${ev.x};el.scrollTop=${ev.y};}setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        break;
      case 'in':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.querySelector('${esc(ev.s)}');if(el){el.value=${JSON.stringify(ev.v||'')};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}setTimeout(function(){window.__mirrorReplaying=false},200)})();`).catch(() => {});
        break;
      case 'fo':
        webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;var el=document.querySelector('${esc(ev.s)}');if(el)el.focus();setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        break;
      case 'kd': {
        // Use native sendInputEvent for real key behavior (Enter, Ctrl+C, etc)
        const modifiers: string[] = [];
        if (ev.c) modifiers.push('control');
        if (ev.s) modifiers.push('shift');
        if (ev.a) modifiers.push('alt');
        if (ev.m) modifiers.push('meta');
        const keyMap: Record<string, string> = { 'Enter': 'Return', 'Backspace': 'Backspace', 'Tab': 'Tab', 'Escape': 'Escape', 'Delete': 'Delete', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown', ' ': 'Space' };
        const keyCode = keyMap[ev.key] || ev.key;
        try {
          webview.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
          if (ev.key && ev.key.length === 1) {
            webview.sendInputEvent({ type: 'char', keyCode: ev.key, modifiers });
          }
        } catch (_) {}
        break;
      }
      case 'ku': {
        const keyMap2: Record<string, string> = { 'Enter': 'Return', 'Backspace': 'Backspace', 'Tab': 'Tab', 'Escape': 'Escape', 'Delete': 'Delete', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'Home': 'Home', 'End': 'End', 'PageUp': 'PageUp', 'PageDown': 'PageDown', ' ': 'Space' };
        const keyCode2 = keyMap2[ev.key] || ev.key;
        try { webview.sendInputEvent({ type: 'keyUp', keyCode: keyCode2 }); } catch (_) {}
        break;
      }
      case 'sel':
        if (ev.empty) {
          webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;window.getSelection().removeAllRanges();setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        } else {
          const anS = esc(ev.an.s), fnS = esc(ev.fn.s);
          webview.executeJavaScript(`(function(){window.__mirrorReplaying=true;function fn(s,ti,tn){var el=document.querySelector(s);if(!el)return null;if(!tn)return el;var idx=0;for(var i=0;i<el.childNodes.length;i++){if(el.childNodes[i].nodeType===3){if(idx===ti)return el.childNodes[i];idx++}}return el.firstChild}var a=fn('${anS}',${ev.an.ti},${ev.an.tn});var f=fn('${fnS}',${ev.fn.ti},${ev.fn.tn});if(a&&f){try{window.getSelection().setBaseAndExtent(a,${ev.ao},f,${ev.fo})}catch(e){}}setTimeout(function(){window.__mirrorReplaying=false},100)})();`).catch(() => {});
        }
        break;
    }
  } catch (_) {}
}

if (api) {
  api.onMirrorEvent((data: string) => {
    try {
      const ev = JSON.parse(data);
      if (ev.t === 'chrome') {
        const tab = getActiveTab();
        if (!tab) return;
        switch (ev.action) {
          case 'back': try { if (tab.webview.canGoBack()) tab.webview.goBack(); else tab.webview.loadURL(getHomepageUrl()); } catch (_) {} break;
          case 'forward': try { tab.webview.goForward(); } catch (_) {} break;
          case 'reload': try { tab.webview.reload(); } catch (_) {} break;
          case 'navigate': tab.url = ev.url; tab.webview.src = ev.url; $urlBar.value = ev.url; break;
          case 'urlFocus': $urlBar.focus(); break;
          case 'urlInput': $urlBar.value = ev.value || ''; break;
          case 'newTab': createTab(ev.url || undefined, true); break;
          case 'closeTab': if (activeTabId !== -1) closeTab(activeTabId); break;
          case 'switchTab': { const t = tabs[ev.index]; if (t) switchTab(t.id, true); } break;
        }
      } else {
        const tab = getActiveTab();
        if (tab) replayMirrorEvent(tab.webview, data);
      }
    } catch {
      const tab = getActiveTab();
      if (tab) replayMirrorEvent(tab.webview, data);
    }
  });
}


if (api) {
  api.getWindowCount().then((count: number) => {
    windowCount = count;
    $btnMirror.classList.toggle('mirror-visible', count > 1);
  }).catch(() => {});
  api.onWindowCount((count: number) => {
    windowCount = count;
    $btnMirror.classList.toggle('mirror-visible', count > 1);
    if (count <= 1 && mirrorActive) { mirrorActive = false; updateMirrorButton(); }
  });
}


const $uaInput = document.getElementById('ua-input') as HTMLInputElement;

async function openUaPanel() {
  if (!api) return;
  try {
    const r = await api.getUserAgent();
    $uaInput.value = r.ua;
    updateUAStatus(r.custom ? r.ua : '');
  } catch {}
  openPanel('ua');
}

function reloadAllTabsForUA() {
  // Force reload all tabs so the new UA (set on webContents from main) takes effect
  tabs.forEach((t) => {
    try {
      if (!isHomepageUrl(t.url)) {
        t.webview.reloadIgnoringCache();
      }
    } catch (_) {}
  });
}

document.getElementById('ua-save')!.addEventListener('click', async () => {
  if (!api) return;
  const ua = $uaInput.value.trim();
  if (!ua) { showToast('Enter a User-Agent'); return; }
  await api.setUserAgent(ua);
  updateUAStatus(ua);
  reloadAllTabsForUA();
  closeOverlay();
  showToast('User-Agent saved');
});

document.getElementById('ua-reset')!.addEventListener('click', async () => {
  if (!api) return;
  const effectiveUA = await api.setUserAgent('');
  $uaInput.value = effectiveUA || '';
  updateUAStatus('');
  reloadAllTabsForUA();
  closeOverlay();
  showToast('User-Agent reset to default');
});


const $dnsInput = document.getElementById('dns-input') as HTMLInputElement;
const $dnsDot = document.getElementById('dns-dot')!;
const $dnsResult = document.getElementById('dns-result')!;
let dnsActive = false;

function updateDnsStatus(dns: string) {
  dnsActive = !!dns;
  $dnsDot.classList.toggle('active', dnsActive);

}

async function openDnsPanel() {
  if (!api) return;
  try {
    const dns = await api.getDns();
    $dnsInput.value = dns || '';
    updateDnsStatus(dns);
    $dnsResult.textContent = dns ? 'Active: ' + dns : '';
  } catch {}
  openPanel('dns');
}

document.getElementById('dns-save')!.addEventListener('click', async () => {
  if (!api) return;
  const dns = $dnsInput.value.trim();
  if (!dns) { showToast('Enter a DNS server URL'); return; }
  await api.setDns(dns);
  updateDnsStatus(dns);
  $dnsResult.textContent = 'Active: ' + dns;
  closeOverlay();
  showToast('DNS saved');
});

document.getElementById('dns-off')!.addEventListener('click', async () => {
  if (!api) return;
  await api.setDns('');
  $dnsInput.value = '';
  updateDnsStatus('');
  $dnsResult.textContent = '';
  closeOverlay();
  showToast('DNS off (system default)');
});

document.querySelectorAll('.dns-preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    $dnsInput.value = (btn as HTMLElement).dataset.dns || '';
  });
});

if (api) { api.getDns().then((dns: string) => { updateDnsStatus(dns); }).catch(() => {}); }


const $xhandlerToken = document.getElementById('xhandler-token') as HTMLInputElement;
const $xhandlerList = document.getElementById('xhandler-list')!;
const $xhandlerSearch = document.getElementById('xhandler-search') as HTMLInputElement;
const $xhandlerPageInfo = document.getElementById('xhandler-page-info')!;
const $xhandlerPrev = document.getElementById('xhandler-prev')!;
const $xhandlerNext = document.getElementById('xhandler-next')!;

let xSessions: { screen_name: string; auth_token: string; ct0: string; status: string }[] = [];
let xPage = 0;
const X_PER_PAGE = 5;

function isOnXDomain(): boolean {
  const t = getActiveTab();
  if (!t) return false;
  try { const h = new URL(t.url).hostname; return h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com'); } catch { return false; }
}

function getFilteredXSessions() {
  const q = $xhandlerSearch.value.trim().toLowerCase();
  if (!q) return xSessions;
  return xSessions.filter(s => s.screen_name.toLowerCase().includes(q));
}

function renderXSessions() {
  $xhandlerList.innerHTML = '';
  const filtered = getFilteredXSessions();
  const totalPages = Math.max(1, Math.ceil(filtered.length / X_PER_PAGE));
  if (xPage >= totalPages) xPage = totalPages - 1;
  if (xPage < 0) xPage = 0;

  if (filtered.length === 0) {
    $xhandlerList.innerHTML = '<div style="padding:12px;color:var(--menu-text2);font-size:12px">No saved sessions</div>';
    $xhandlerPageInfo.textContent = '';
    $xhandlerPrev.style.display = 'none';
    $xhandlerNext.style.display = 'none';
    return;
  }

  const start = xPage * X_PER_PAGE;
  const pageItems = filtered.slice(start, start + X_PER_PAGE);

  pageItems.forEach((s) => {
    const realIdx = xSessions.indexOf(s);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;';
    const statusColor = s.status === 'Suspend' ? 'var(--danger)' : s.status === 'Active' ? 'var(--success)' : 'var(--menu-text2)';
    const statusText = s.status === 'Suspend' ? 'Suspend' : s.status === 'Active' ? 'Active' : '-';
    div.innerHTML = `<input type="checkbox" value="${realIdx}" class="xsession-cb">` +
      `<span style="color:var(--accent);font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@${s.screen_name}</span>` +
      `<span style="color:${statusColor};font-size:11px;font-weight:600;flex-shrink:0">${statusText}</span>` +
      `<button class="xsession-del" data-idx="${realIdx}" style="background:none;border:none;color:var(--menu-text2);cursor:pointer;padding:2px;display:flex;opacity:0.5;flex-shrink:0" title="Delete">` +
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z"/></svg>` +
      `</button>`;
    const cb = div.querySelector('.xsession-cb') as HTMLInputElement;
    // Single-select: uncheck all others when one is checked
    cb.addEventListener('change', () => {
      if (cb.checked) {
        $xhandlerList.querySelectorAll('.xsession-cb').forEach((other: any) => { if (other !== cb) other.checked = false; });
      }
    });
    div.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      if (target.closest('.xsession-del')) return;
      $xhandlerList.querySelectorAll('.xsession-cb').forEach((other: any) => { other.checked = false; });
      cb.checked = true;
    });
    const delBtn = div.querySelector('.xsession-del')!;
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt((delBtn as HTMLElement).dataset.idx || '0');
      xSessions.splice(idx, 1);
      await api.saveXSessions(xSessions);
      renderXSessions();
      showToast('Session deleted');
    });
    $xhandlerList.appendChild(div);
  });

  // Pagination
  $xhandlerPageInfo.textContent = `${xPage + 1} / ${totalPages}`;
  const showPag = totalPages > 1;
  $xhandlerPrev.style.display = showPag ? '' : 'none';
  $xhandlerNext.style.display = showPag ? '' : 'none';
}

$xhandlerSearch.addEventListener('input', () => { xPage = 0; renderXSessions(); });
$xhandlerPrev.addEventListener('click', () => { if (xPage > 0) { xPage--; renderXSessions(); } });
$xhandlerNext.addEventListener('click', () => {
  const totalPages = Math.ceil(getFilteredXSessions().length / X_PER_PAGE);
  if (xPage < totalPages - 1) { xPage++; renderXSessions(); }
});

async function openXHandlerPanel() {
  if (!api) return;
  if (!isOnXDomain()) {
    showToast('Please open x.com first');
    return;
  }
  try { xSessions = await api.getXSessions() || []; } catch { xSessions = []; }
  xPage = 0;
  $xhandlerSearch.value = '';
  renderXSessions();
  openPanel('xhandler');
}

document.getElementById('btn-xhandler-action')!.addEventListener('click', () => openXHandlerPanel());

// Check: all-in-one — always saves if ct0 found (even if verify/status fail)
document.getElementById('xhandler-check')!.addEventListener('click', async () => {
  if (!api) return;
  const token = $xhandlerToken.value.trim();
  if (!token) { showToast('Enter auth_token'); return; }
  if (!isOnXDomain()) { showToast('Please open x.com first'); return; }
  showToast('Checking...');
  closeOverlay();
  const r = await api.checkXSession(cachedPartition, token);
  if (!r.ok) { showToast(r.error || 'Auth token not valid'); return; }
  // Save session — deduplicate by auth_token and screen_name
  xSessions = xSessions.filter((s: any) => s.auth_token !== token && s.screen_name !== r.screen_name);
  xSessions.unshift({ screen_name: r.screen_name, auth_token: token, ct0: r.ct0, status: r.status });
  await api.saveXSessions(xSessions);
  renderXSessions();
  $xhandlerToken.value = '';
  const t = getActiveTab();
  if (t) t.webview.loadURL('https://x.com');
  if (r.status === 'Suspend') {
    showToast(r.statusMsg || 'Account @' + r.screen_name + ' is suspended');
  } else if (r.status === 'Active') {
    showToast('Login as @' + r.screen_name + ' — Active');
  } else {
    showToast('Saved @' + r.screen_name);
  }
});

// Inject: re-check with saved auth_token → set cookies + reload
document.getElementById('xhandler-inject')!.addEventListener('click', async () => {
  if (!api) return;
  const cb = $xhandlerList.querySelector('.xsession-cb:checked') as HTMLInputElement | null;
  if (!cb) { showToast('Select a session'); return; }
  const idx = parseInt(cb.value);
  const s = xSessions[idx];
  if (!s) return;
  if (!isOnXDomain()) { showToast('Please open x.com first'); return; }
  showToast('Injecting @' + s.screen_name + '...');
  closeOverlay();
  const r = await api.checkXSession(cachedPartition, s.auth_token);
  if (!r.ok) {
    showToast('Token expired or invalid for @' + s.screen_name);
    return;
  }
  s.ct0 = r.ct0;
  s.status = r.status;
  s.screen_name = r.screen_name;
  await api.saveXSessions(xSessions);
  renderXSessions();
  const t = getActiveTab();
  if (t) t.webview.loadURL('https://x.com');
  if (r.status === 'Suspend') {
    showToast(r.statusMsg || 'Account @' + s.screen_name + ' is suspended');
  } else if (r.status === 'Active') {
    showToast('Login as @' + s.screen_name + ' — Active');
  } else {
    showToast('Injected @' + s.screen_name);
  }
});


let suggestionsVisible = false;
let selectedSuggestionIdx = -1;
let suggestionItems: { url: string; title: string }[] = [];
let originalUrlValue = '';

const $urlSuggestions = document.createElement('div');
$urlSuggestions.id = 'url-suggestions';
$urlSuggestions.className = 'hidden';
document.body.appendChild($urlSuggestions);

function positionSuggestions() {
  const rect = $urlBar.getBoundingClientRect();
  $urlSuggestions.style.left = rect.left + 'px';
  $urlSuggestions.style.top = (rect.bottom + 2) + 'px';
  $urlSuggestions.style.width = rect.width + 'px';
}

function getFaviconUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=16&domain=${host}`;
  } catch { return ''; }
}

function showSuggestions(items: { url: string; title: string }[]) {
  suggestionItems = items;
  selectedSuggestionIdx = -1;
  if (items.length === 0) { hideSuggestions(); return; }
  positionSuggestions();
  $urlSuggestions.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'url-suggestion-item';
    const titleEsc = (item.title || '').replace(/</g, '&lt;');
    const urlEsc = item.url.replace(/</g, '&lt;');
    const favicon = getFaviconUrl(item.url);
    const faviconHtml = favicon ? `<img class="sug-favicon" src="${favicon}" width="16" height="16" onerror="this.style.display='none'">` : '';
    div.innerHTML = `${faviconHtml}<span class="sug-title">${titleEsc}</span><span class="sug-url">${urlEsc}</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      $urlBar.value = item.url;
      hideSuggestions();
      navigateUrl();
      $urlBar.blur();
    });
    $urlSuggestions.appendChild(div);
  });
  $urlSuggestions.classList.remove('hidden');
  suggestionsVisible = true;
}

function hideSuggestions() {
  $urlSuggestions.classList.add('hidden');
  suggestionsVisible = false;
  selectedSuggestionIdx = -1;
  suggestionItems = [];
}

function highlightSuggestion(idx: number) {
  const items = $urlSuggestions.querySelectorAll('.url-suggestion-item');
  items.forEach((el, i) => { (el as HTMLElement).classList.toggle('selected', i === idx); });
  selectedSuggestionIdx = idx;
}

async function fetchSuggestions(query: string) {
  if (!api || !query || query.length < 1) { hideSuggestions(); return; }
  try {
    const history = await api.getHistory();
    const q = query.toLowerCase();
    const matches = history
      .filter((e: any) => e.url.toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q))
      .slice(0, 6);
    if (matches.length > 0 && document.activeElement === $urlBar) {
      showSuggestions(matches.map((e: any) => ({ url: e.url, title: e.title || '' })));
    } else {
      hideSuggestions();
    }
  } catch { hideSuggestions(); }
}

$urlBar.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (suggestionsVisible && selectedSuggestionIdx >= 0 && suggestionItems[selectedSuggestionIdx]) {
      $urlBar.value = suggestionItems[selectedSuggestionIdx].url;
    }
    hideSuggestions();
    navigateUrl();
    $urlBar.blur();
    return;
  }
  if (e.key === 'Escape') {
    if (suggestionsVisible) { hideSuggestions(); $urlBar.value = originalUrlValue; e.stopPropagation(); return; }
  }
  if (suggestionsVisible) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = selectedSuggestionIdx < suggestionItems.length - 1 ? selectedSuggestionIdx + 1 : 0;
      highlightSuggestion(next);
      $urlBar.value = suggestionItems[next].url;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedSuggestionIdx <= 0) {
        highlightSuggestion(-1);
        $urlBar.value = originalUrlValue;
      } else {
        const prev = selectedSuggestionIdx - 1;
        highlightSuggestion(prev);
        $urlBar.value = suggestionItems[prev].url;
      }
      return;
    }
  }
});

let suggestDebounce: number | undefined;
$urlBar.addEventListener('input', () => {
  originalUrlValue = $urlBar.value;
  sendChromeMirror('urlInput', { value: $urlBar.value });
  if (suggestDebounce) clearTimeout(suggestDebounce);
  suggestDebounce = window.setTimeout(() => fetchSuggestions($urlBar.value), 150);
});

$urlBar.addEventListener('focus', () => {
  $urlBar.select();
  originalUrlValue = $urlBar.value;
  sendChromeMirror('urlFocus');
  if ($urlBar.value) fetchSuggestions($urlBar.value);
});

$urlBar.addEventListener('blur', () => {
  // Small delay to allow mousedown on suggestion to fire first
  setTimeout(() => hideSuggestions(), 150);
});


document.addEventListener('keydown', (e: KeyboardEvent) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 't') { e.preventDefault(); createTab(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); if (activeTabId !== -1) closeTab(activeTabId); }
  if (ctrl && e.key === 'l') { e.preventDefault(); $urlBar.focus(); $urlBar.select(); }
  if ((ctrl && e.key === 'r') || e.key === 'F5') { e.preventDefault(); const t = getActiveTab(); if (t) try { t.webview.reload(); } catch (_) {} }
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); const t = getActiveTab(); if (t) try { if (t.webview.canGoBack()) t.webview.goBack(); else t.webview.loadURL(getHomepageUrl()); } catch (_) {} }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); const t = getActiveTab(); if (t) try { t.webview.goForward(); } catch (_) {} }
  if (ctrl && e.key === 'Tab' && !e.shiftKey && tabs.length > 1) { e.preventDefault(); const i = tabs.findIndex((t) => t.id === activeTabId); switchTab(tabs[(i + 1) % tabs.length].id); }
  if (ctrl && e.key === 'Tab' && e.shiftKey && tabs.length > 1) { e.preventDefault(); const i = tabs.findIndex((t) => t.id === activeTabId); switchTab(tabs[(i - 1 + tabs.length) % tabs.length].id); }
  if (ctrl && e.key === 'h') { e.preventDefault(); openHistoryPanel(); }
  if (ctrl && e.key === 'd') { e.preventDefault(); $btnBookmark.click(); }
  if (e.key === 'F12') { e.preventDefault(); const t = getActiveTab(); if (t) toggleDevTools(t.webview); }
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); }
  if (ctrl && e.key === '-') { e.preventDefault(); zoomOut(); }
  if (ctrl && e.key === '0') { e.preventDefault(); zoomReset(); }
});


let toastTimeout: number | undefined;
function showToast(msg: string) {
  let toast = document.querySelector('.toast') as HTMLElement;
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg; toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => { toast.classList.remove('show'); }, 2000);
}
if (api) {
  // Open target="_blank" / window.open from webview as new tabs
  api.onNewWindow((url: string) => { createTab(url); });

  // URL opened from protocol handler or file association (default browser)
  api.onOpenUrl((url: string) => { createTab(url); });

  // Keyboard shortcuts forwarded from focused webview (F12, Ctrl+T, etc.)
  api.onWebviewShortcut((key: string, ctrl: boolean, alt: boolean, _shift: boolean) => {
    if (key === 'F12') { const t = getActiveTab(); if (t) toggleDevTools(t.webview); }
    if (ctrl && key === 't') createTab();
    if (ctrl && key === 'w') { if (activeTabId !== -1) closeTab(activeTabId); }
    if (ctrl && key === 'l') { $urlBar.focus(); $urlBar.select(); }
    if (ctrl && key === 'r') { const t = getActiveTab(); if (t) try { t.webview.reload(); } catch (_) {} }
    if (alt && key === 'ArrowLeft') { const t = getActiveTab(); if (t) try { if (t.webview.canGoBack()) t.webview.goBack(); else t.webview.loadURL(getHomepageUrl()); } catch (_) {} }
    if (alt && key === 'ArrowRight') { const t = getActiveTab(); if (t) try { t.webview.goForward(); } catch (_) {} }
    if (ctrl && (key === '=' || key === '+')) zoomIn();
    if (ctrl && key === '-') zoomOut();
    if (ctrl && key === '0') zoomReset();
  });
}

(async function init() {
  if (api) {
    try { cachedPartition = await api.getPartition(); } catch (_) { cachedPartition = 'persist:default'; }
  }
  await loadBookmarks();
  createTab();
})();
