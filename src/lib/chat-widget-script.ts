/**
 * Generates the chat widget JavaScript to inject into company sites.
 * Similar pattern to analytics-tracking-script.ts — vanilla JS, self-contained.
 */
export function buildChatWidgetScript(slug: string, apiBase: string): string {
  return `(function(){
  var API="${apiBase}/api/site/${slug}/chat";
  var VID=localStorage.getItem("artha_vid")||("v_"+Math.random().toString(36).slice(2));
  localStorage.setItem("artha_vid",VID);
  var CID=null;var msgs=[];var open=false;var loading=false;
  var msgCount=0;var emailShown=false;
  var storedEmail=localStorage.getItem("artha_email")||"";

  function el(tag,attrs,children){
    var e=document.createElement(tag);
    if(attrs)Object.keys(attrs).forEach(function(k){
      if(k==="style"&&typeof attrs[k]==="object"){Object.assign(e.style,attrs[k])}
      else if(k.startsWith("on")){e.addEventListener(k.slice(2),attrs[k])}
      else{e.setAttribute(k,attrs[k])}
    });
    if(children){
      if(typeof children==="string")e.textContent=children;
      else children.forEach(function(c){if(c)e.appendChild(c)});
    }
    return e;
  }

  var COLORS={bg:"#ffffff",primary:"#2563eb",text:"#1f2937",muted:"#6b7280",bubble:"#f3f4f6"};

  function createWidget(){
    // Toggle button
    var btn=el("button",{style:{
      position:"fixed",bottom:"20px",right:"20px",width:"56px",height:"56px",
      borderRadius:"50%",background:COLORS.primary,color:"#fff",border:"none",
      cursor:"pointer",zIndex:"99999",display:"flex",alignItems:"center",
      justifyContent:"center",boxShadow:"0 4px 12px rgba(0,0,0,0.15)",fontSize:"24px"
    },onclick:toggle},"💬");

    // Chat panel
    var panel=el("div",{id:"artha-chat-panel",style:{
      position:"fixed",bottom:"88px",right:"20px",width:"380px",maxHeight:"520px",
      background:COLORS.bg,borderRadius:"16px",boxShadow:"0 8px 30px rgba(0,0,0,0.12)",
      zIndex:"99998",display:"none",flexDirection:"column",overflow:"hidden",
      border:"1px solid #e5e7eb",fontFamily:"-apple-system,BlinkMacSystemFont,sans-serif"
    }});

    var header=el("div",{style:{
      padding:"16px 20px",background:COLORS.primary,color:"#fff",fontSize:"15px",fontWeight:"600"
    }},"Chat with us");

    var msgBox=el("div",{id:"artha-chat-msgs",style:{
      flex:"1",overflowY:"auto",padding:"16px",minHeight:"300px",maxHeight:"380px"
    }});

    var inputRow=el("div",{style:{
      display:"flex",padding:"12px",borderTop:"1px solid #e5e7eb",gap:"8px"
    }});
    var input=el("input",{type:"text",placeholder:"Type a message...",style:{
      flex:"1",padding:"10px 14px",borderRadius:"8px",border:"1px solid #d1d5db",
      fontSize:"14px",outline:"none"
    }});
    input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!loading)send()});
    var sendBtn=el("button",{style:{
      padding:"10px 16px",borderRadius:"8px",background:COLORS.primary,color:"#fff",
      border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"500"
    },onclick:send},"Send");
    inputRow.appendChild(input);inputRow.appendChild(sendBtn);

    // Email capture form (hidden initially)
    var emailRow=el("div",{id:"artha-email-row",style:{
      display:"none",padding:"10px 12px",borderTop:"1px solid #e5e7eb",
      background:"#f9fafb",fontSize:"13px",color:COLORS.muted
    }});
    var emailLabel=el("div",{style:{marginBottom:"6px"}},"Want us to follow up? Leave your email:");
    var emailInner=el("div",{style:{display:"flex",gap:"6px"}});
    var emailInput=el("input",{type:"email",placeholder:"you@example.com",style:{
      flex:"1",padding:"8px 10px",borderRadius:"6px",border:"1px solid #d1d5db",
      fontSize:"13px",outline:"none"
    }});
    var emailBtn=el("button",{style:{
      padding:"8px 12px",borderRadius:"6px",background:COLORS.primary,color:"#fff",
      border:"none",cursor:"pointer",fontSize:"13px",fontWeight:"500"
    },onclick:submitEmail},"Submit");
    var emailDismiss=el("button",{style:{
      padding:"8px",borderRadius:"6px",background:"transparent",color:COLORS.muted,
      border:"none",cursor:"pointer",fontSize:"12px"
    },onclick:function(){emailRow.style.display="none";}},"✕");
    emailInner.appendChild(emailInput);emailInner.appendChild(emailBtn);emailInner.appendChild(emailDismiss);
    emailRow.appendChild(emailLabel);emailRow.appendChild(emailInner);

    function submitEmail(){
      var em=emailInput.value.trim();
      if(!em||em.indexOf("@")<1)return;
      storedEmail=em;
      localStorage.setItem("artha_email",em);
      emailRow.style.display="none";
      addMsg("ai","Thanks! We\\'ll follow up at "+em+".");
      // Notify backend about the email
      fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({visitorId:VID,conversationId:CID,message:"[email_provided]",email:em})
      }).then(function(r){return r.json()}).then(function(d){
        if(d.conversationId)CID=d.conversationId;
      }).catch(function(){});
    }

    function maybeShowEmail(){
      if(!emailShown&&!storedEmail&&msgCount>=3){
        emailShown=true;
        emailRow.style.display="block";
      }
    }

    // Footer
    var footer=el("div",{style:{
      padding:"6px 12px",textAlign:"center",fontSize:"11px",color:COLORS.muted,
      borderTop:"1px solid #e5e7eb",background:"#f9fafb"
    }},"Powered by Artha");

    panel.appendChild(header);panel.appendChild(msgBox);panel.appendChild(emailRow);panel.appendChild(inputRow);panel.appendChild(footer);
    document.body.appendChild(btn);document.body.appendChild(panel);

    function toggle(){
      open=!open;
      panel.style.display=open?"flex":"none";
      if(open)input.focus();
    }

    function addMsg(role,text){
      var isAi=role==="ai";
      var bubble=el("div",{style:{
        padding:"10px 14px",borderRadius:"12px",marginBottom:"8px",maxWidth:"85%",
        fontSize:"14px",lineHeight:"1.5",wordWrap:"break-word",
        background:isAi?COLORS.bubble:COLORS.primary,
        color:isAi?COLORS.text:"#fff",
        marginLeft:isAi?"0":"auto",marginRight:isAi?"auto":"0"
      }},text);
      msgBox.appendChild(bubble);
      msgBox.scrollTop=msgBox.scrollHeight;
    }

    function send(){
      var text=input.value.trim();
      if(!text||loading)return;
      input.value="";
      addMsg("visitor",text);
      msgCount++;
      loading=true;

      var payload={visitorId:VID,conversationId:CID,message:text};
      if(storedEmail)payload.email=storedEmail;

      fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      }).then(function(r){return r.json()}).then(function(d){
        loading=false;
        if(d.conversationId)CID=d.conversationId;
        addMsg("ai",d.reply||"Sorry, I could not process that.");
        msgCount++;
        maybeShowEmail();
      }).catch(function(){
        loading=false;
        addMsg("ai","Connection error. Please try again.");
      });
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",createWidget);
  }else{createWidget()}
})();`;
}
