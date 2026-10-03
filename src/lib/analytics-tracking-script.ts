/**
 * Builds a lightweight vanilla JS tracking script for website analytics.
 * The script is injected into user website <head> tags and sends events
 * to the Artha platform collection endpoint.
 */
export function buildTrackingScript(slug: string, apiBaseUrl: string): string {
  return `(function(){
var SLUG="${slug}";
var API="${apiBaseUrl}/api/site/"+SLUG+"/analytics";
var BATCH_MS=5000;
var SESSION_TIMEOUT=1800000;

var VID_KEY="_artha_vid";
var SID_KEY="_artha_sid";
var STS_KEY="_artha_sts";

var visitorId;
try{visitorId=localStorage.getItem(VID_KEY)}catch(e){}
if(!visitorId){
  visitorId="v_"+Math.random().toString(36).substr(2,12)+Date.now().toString(36);
  try{localStorage.setItem(VID_KEY,visitorId)}catch(e){}
}

var sessionId,sessionTs;
try{
  sessionId=sessionStorage.getItem(SID_KEY);
  sessionTs=parseInt(sessionStorage.getItem(STS_KEY)||"0",10);
}catch(e){}
if(!sessionId||(Date.now()-sessionTs>SESSION_TIMEOUT)){
  sessionId="s_"+Math.random().toString(36).substr(2,8)+Date.now().toString(36);
}
try{
  sessionStorage.setItem(SID_KEY,sessionId);
  sessionStorage.setItem(STS_KEY,Date.now().toString());
}catch(e){}

var queue=[];

function enqueue(event,path,meta){
  queue.push({
    e:event,
    p:path||location.pathname,
    v:visitorId,
    s:sessionId,
    r:document.referrer||null,
    sw:screen.width,
    ts:Date.now(),
    m:meta||{}
  });
}

function flush(){
  if(queue.length===0)return;
  var payload=JSON.stringify({events:queue.splice(0)});
  if(navigator.sendBeacon){
    navigator.sendBeacon(API,payload);
  }else{
    var x=new XMLHttpRequest();
    x.open("POST",API);
    x.setRequestHeader("Content-Type","application/json");
    x.send(payload);
  }
}

enqueue("pageview");

var pageStart=Date.now();
var engaged=0;
var visible=true;

document.addEventListener("visibilitychange",function(){
  if(document.hidden){
    engaged+=Date.now()-pageStart;
    visible=false;
    flush();
  }else{
    pageStart=Date.now();
    visible=true;
  }
});

function scrollDepth(){
  var st=window.pageYOffset||document.documentElement.scrollTop;
  var dh=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
  var vh=window.innerHeight;
  if(dh<=vh)return 100;
  return Math.min(100,Math.round((st+vh)/dh*100));
}

function sendEngagement(){
  if(visible)engaged+=Date.now()-pageStart;
  if(engaged<500)return;
  enqueue("pageview_end",null,{engaged_ms:engaged,scroll_depth:scrollDepth()});
  flush();
}

window.addEventListener("pagehide",sendEngagement);
window.addEventListener("beforeunload",sendEngagement);

document.addEventListener("click",function(e){
  var t=e.target;
  if(!(t instanceof Element))return;
  var el=t.closest("button,a[href],input[type=submit],[data-track-click]");
  if(!el)return;
  var meta={
    tag:el.tagName.toLowerCase(),
    text:(el.textContent||"").trim().substring(0,100)
  };
  if(el.id)meta.id=el.id;
  if(el.className&&typeof el.className==="string")meta.classes=el.className.substring(0,200);
  if(el.tagName==="A")meta.href=el.getAttribute("href");
  enqueue("click",null,meta);
},true);

setInterval(flush,BATCH_MS);
})();`;
}
