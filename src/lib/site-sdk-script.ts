/**
 * Builds a client SDK script for company websites.
 * Provides artha.auth, artha.data, artha.credits, artha.payments, artha.ai, artha.files APIs.
 * Injected alongside the analytics tracking script.
 */
export function buildSiteSDKScript(slug: string, apiBaseUrl: string): string {
  return `(function(){
var S="${slug}";
var A="${apiBaseUrl}/api/site/"+S;
var TK="_artha_token";

function gt(){try{return localStorage.getItem(TK)}catch(e){return null}}
function st(t){try{if(t)localStorage.setItem(TK,t);else localStorage.removeItem(TK)}catch(e){}}

var acb=[];
function nac(u){acb.forEach(function(c){try{c(u)}catch(e){}})}

function req(p,o){
o=o||{};
var h={"Content-Type":"application/json"};
var t=gt();
if(t)h["Authorization"]="Bearer "+t;
return fetch(A+p,Object.assign({},o,{headers:Object.assign(h,o.headers||{})}))
.then(function(r){
return r.json().then(function(d){
if(!r.ok){
var e=new Error(d.error||"Request failed");
e.status=r.status;
e.data=d;
if(r.status===401){st(null);nac(null)}
throw e;
}
return d;
});
});
}

var uc=null;

window.artha={
auth:{
signup:function(e,p,n){
return req("/auth/signup",{method:"POST",body:JSON.stringify({email:e,password:p,name:n})})
.then(function(d){st(d.token);uc=d.user;nac(d.user);return d});
},
signin:function(e,p){
return req("/auth/signin",{method:"POST",body:JSON.stringify({email:e,password:p})})
.then(function(d){st(d.token);uc=d.user;nac(d.user);return d});
},
signout:function(){
return req("/auth/signout",{method:"POST"})
.then(function(){st(null);uc=null;nac(null)})
.catch(function(){st(null);uc=null;nac(null)});
},
getUser:function(){
if(!gt())return Promise.resolve(null);
if(uc)return Promise.resolve(uc);
return req("/auth/me").then(function(d){uc=d.user;return d.user}).catch(function(){st(null);return null});
},
getToken:gt,
resendVerification:function(){
return req("/auth/resend-verification",{method:"POST"});
},
onAuthChange:function(cb){
acb.push(cb);
return function(){acb=acb.filter(function(c){return c!==cb})};
}
},
data:{
list:function(t,o){
o=o||{};
var q=[];
if(o.limit)q.push("limit="+o.limit);
if(o.offset)q.push("offset="+o.offset);
if(o.sort)q.push("sort="+o.sort);
if(o.order)q.push("order="+o.order);
var qs=q.length?"?"+q.join("&"):"";
return req("/data/"+t+qs);
},
get:function(t,id){return req("/data/"+t+"/"+id)},
insert:function(t,d,o){
o=o||{};
var b={data:d};
if(o.creditCost)b.creditCost=o.creditCost;
return req("/data/"+t,{method:"POST",body:JSON.stringify(b)});
},
update:function(t,id,d){
return req("/data/"+t+"/"+id,{method:"PATCH",body:JSON.stringify({data:d})});
},
delete:function(t,id){
return req("/data/"+t+"/"+id,{method:"DELETE"});
}
},
credits:{
getBalance:function(){return req("/credits")},
use:function(a,r){
return req("/credits",{method:"POST",body:JSON.stringify({amount:a,reason:r})});
}
},
payments:{
checkout:function(pid){
return req("/payments/create-checkout",{method:"POST",body:JSON.stringify({planPublicId:pid})})
.then(function(d){if(d.checkoutUrl)window.location.href=d.checkoutUrl;return d});
}
},
ai:{
complete:function(prompt,o){
o=o||{};
var b={prompt:prompt};
if(o.system)b.system=o.system;
if(o.creditCost)b.creditCost=o.creditCost;
if(o.maxTokens)b.maxTokens=o.maxTokens;
if(o.temperature!==undefined)b.temperature=o.temperature;
if(o.imageUrl)b.imageUrl=o.imageUrl;
return req("/ai",{method:"POST",body:JSON.stringify(b)});
}
},
files:{
upload:function(file){
return new Promise(function(resolve,reject){
var reader=new FileReader();
reader.onload=function(){
var base64=reader.result;
req("/files",{method:"POST",body:JSON.stringify({data:base64,filename:file.name,contentType:file.type})})
.then(resolve).catch(reject);
};
reader.onerror=function(){reject(new Error("Failed to read file"))};
reader.readAsDataURL(file);
});
},
uploadBase64:function(base64,filename,contentType){
return req("/files",{method:"POST",body:JSON.stringify({data:base64,filename:filename||"file",contentType:contentType})});
},
list:function(){return req("/files")},
getUrl:function(id){return A+"/files/"+id}
}
};
})();`;
}
