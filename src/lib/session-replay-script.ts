/**
 * Generates a lightweight session replay recording script (~2KB minified).
 * Injected into company sites alongside the analytics tracking script.
 * Records DOM snapshots, mouse moves, clicks, scrolls, and input changes.
 * Batches events and sends to the replay API endpoint every 10 seconds.
 */
export function generateSessionReplayScript(slug: string): string {
  return `(function(){
var SLUG="${slug}";
var API="${getApiBase()}/api/site/"+SLUG+"/replay";
var BATCH_INTERVAL=10000;
var MOUSE_SAMPLE_MS=50;
var MAX_DURATION=300000;

var VID_KEY="_artha_vid";
var SID_KEY="_artha_sid";

var visitorId;
try{visitorId=localStorage.getItem(VID_KEY)}catch(e){}
if(!visitorId)return;

var sessionId;
try{sessionId=sessionStorage.getItem(SID_KEY)}catch(e){}
if(!sessionId)return;

var startTs=Date.now();
var events=[];
var seq=0;
var stopped=false;

function ev(type,data){
if(stopped)return;
if(Date.now()-startTs>MAX_DURATION){stop();return}
events.push({t:type,ts:Date.now()-startTs,s:seq++,d:data});
}

function serializeNode(n){
if(n.nodeType===3)return{t:3,v:n.textContent||""};
if(n.nodeType!==1)return null;
var el=n;
var tag=el.tagName.toLowerCase();
if(tag==="script"||tag==="noscript")return null;
var attrs={};
for(var i=0;i<el.attributes.length;i++){
var a=el.attributes[i];
if(a.name==="value"&&(tag==="input"||tag==="textarea"))continue;
attrs[a.name]=a.value.substring(0,200);
}
var children=[];
for(var c=el.firstChild;c;c=c.nextSibling){
var s=serializeNode(c);
if(s)children.push(s);
}
return{t:1,tag:tag,a:attrs,c:children};
}

function snapshot(){
var html=document.documentElement;
var s=serializeNode(html);
ev("snapshot",{dom:s,w:window.innerWidth,h:window.innerHeight,url:location.href,title:document.title});
}

function rle(arr){
if(arr.length===0)return[];
var out=[];
var cur=arr[0];
var cnt=1;
for(var i=1;i<arr.length;i++){
if(arr[i].ts-cur.ts<5&&arr[i].d.x===cur.d.x&&arr[i].d.y===cur.d.y){
cnt++;
}else{
if(cnt>1)cur.n=cnt;
out.push(cur);
cur=arr[i];
cnt=1;
}
}
if(cnt>1)cur.n=cnt;
out.push(cur);
return out;
}

function flush(){
if(events.length===0)return;
var mouseEvents=[];
var otherEvents=[];
for(var i=0;i<events.length;i++){
if(events[i].t==="mouse")mouseEvents.push(events[i]);
else otherEvents.push(events[i]);
}
var compressed=otherEvents.concat(rle(mouseEvents));
compressed.sort(function(a,b){return a.ts-b.ts});
var payload=JSON.stringify({
vid:visitorId,
sid:sessionId,
start:startTs,
dur:Date.now()-startTs,
page:location.pathname,
device:screen.width<=768?"mobile":screen.width<=1024?"tablet":"desktop",
events:compressed
});
try{
if(navigator.sendBeacon){
navigator.sendBeacon(API,payload);
}else{
var x=new XMLHttpRequest();
x.open("POST",API);
x.setRequestHeader("Content-Type","application/json");
x.send(payload);
}
}catch(e){}
events=[];
}

snapshot();

var lastMouseTs=0;
document.addEventListener("mousemove",function(e){
var now=Date.now();
if(now-lastMouseTs<MOUSE_SAMPLE_MS)return;
lastMouseTs=now;
ev("mouse",{x:e.clientX,y:e.clientY});
},true);

document.addEventListener("click",function(e){
var t=e.target;
var tag="";
if(t instanceof Element){tag=t.tagName.toLowerCase();var id=t.id?("#"+t.id):"";var cls=t.className&&typeof t.className==="string"?"."+t.className.split(" ")[0]:"";tag+=id+cls}
ev("click",{x:e.clientX,y:e.clientY,tag:tag});
},true);

var scrollTimer=null;
window.addEventListener("scroll",function(){
if(scrollTimer)return;
scrollTimer=setTimeout(function(){
scrollTimer=null;
ev("scroll",{x:window.scrollX,y:window.scrollY});
},100);
},true);

document.addEventListener("input",function(e){
var t=e.target;
if(!(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement||t instanceof HTMLSelectElement))return;
var tag=t.tagName.toLowerCase();
var type=t instanceof HTMLInputElement?t.type:"";
if(type==="password")return;
var val=t.value.substring(0,50);
if(type==="email"||type==="tel")val="[redacted]";
var id=t.id||t.name||"";
ev("input",{id:id,tag:tag,type:type,len:t.value.length,val:val});
},true);

var flushInterval=setInterval(flush,BATCH_INTERVAL);

function stop(){
if(stopped)return;
stopped=true;
clearInterval(flushInterval);
flush();
}

window.addEventListener("pagehide",stop);
window.addEventListener("beforeunload",stop);

setTimeout(stop,MAX_DURATION);
})();`;
}

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "https://artha.run";
}
