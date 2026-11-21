"use strict";
window.CapeFlight.createParents = function(saves,$) {
  const overlay=$("parents"), hud=$("hud"), saved=saves.initial;
  const parts=["parentNotice","parentPin","parentRecovery","parentConfirmation","parentSettings"];
  const originalMode=saved.learningMode!==false;
  let digits="",busy=false,submitPIN,cancelFlow,recoveryOptions,active=true;
  function clearSecret(){digits="";$("parentAnswer").value="";}
  function page(id,title){
    overlay.classList?.toggle("settingsOpen",id==="parentSettings");
    $("parentLabel").hidden=id==="parentSettings";
    active=true; overlay.hidden=false; hud.inert=true;
    for(const part of parts)$(part).hidden=part!==id;
    $("parentError").textContent=""; $("parentHeading").textContent=title;
    $("parentHeading").focus?.();
    overlay.scrollTop=0;
  }
  function dismiss(){
    if((saved.learningMode!==false)!==originalMode && window.location?.reload){window.location.reload();return;}
    clearSecret(); active=false; overlay.hidden=true; hud.inert=false; $("start").focus?.();
  }
  function notice(){
    clearSecret();page("parentNotice","New planes and courses are earned with math.");
  }
  async function parent(action,fields={}){
    const handler=window.webkit?.messageHandlers?.flightParent;
    if(!handler)throw Error("Parent authentication is available in the iOS app.");
    return handler.postMessage({action,...fields});
  }
  async function set(key,value){
    const record=await saves.set(key,value);
    if(record?.[key]!==value)throw Error("The change could not be saved. Please try again.");
    saved[key]=value;
  }
  function action(fn){
    return async (...args)=>{
      if(busy)return;
      busy=true;
      try{await fn(...args);}
      catch(error){$("parentError").textContent=error.message || "Unable to complete the parent request.";}
      finally{busy=false;}
    };
  }
  function pinCount(){
    const label=digits.length+" of 4 digits entered";
    $("pinCount").textContent="●".repeat(digits.length)+"○".repeat(4-digits.length);
    $("pinCount").setAttribute("aria-label",label);
    $("pinSubmit").disabled=digits.length!==4;
  }
  function key(value){
    if(busy)return;
    digits=value==="Delete"?digits.slice(0,-1):(digits+value).slice(0,4);
    pinCount();
  }
  for(const value of ["1","2","3","4","5","6","7","8","9","Delete","0"]){
    const button=document.createElement("button");button.type="button";button.textContent=value;
    button.addEventListener("click",()=>key(value));$("pinKeys").appendChild(button);
  }
  function pin(title,buttonText,submit,cancel,forgot){
    digits="";submitPIN=submit;cancelFlow=cancel;
    $("pinSubmit").textContent=buttonText;$("pinForgot").hidden=!forgot;
    // The note explains a new PIN; it is not shown when a parent is only entering one.
    $("pinNote").hidden=buttonText!=="Save PIN";
    $("pinForgot").onclick=forgot?action(forgot):null;
    page("parentPin",title);pinCount();
  }
  function recovery(info,reset,submit,cancel){
    recoveryOptions=submit;cancelFlow=cancel;$("parentAnswer").value="";
    const select=$("parentQuestion");select.replaceChildren();
    info.questions.forEach((q,i)=>{
      const option=document.createElement("option");option.textContent=q;option.value=String(i);select.appendChild(option);
    });
    select.value=String(reset?info.question:0);select.disabled=reset;
    page("parentRecovery",reset?"Answer your reset question":"Choose a reset question");
  }
  function createPIN(info,done,cancel){
    pin("Create a 4-digit parent PIN","Save PIN",value=>{
      recovery(info,false,async(question,answer)=>{
        if(!await parent("pinSet",{pin:value,question,answer}))throw Error("Could not save the PIN. Please try again.");
        await done();
      },cancel);
    },cancel);
  }
  async function finish(enabled){
    await set("learningMode",enabled);await set("parentNoticeSeen",true);
    clearSecret();submitPIN=null;recoveryOptions=null;page("parentConfirmation",enabled?"Math rings unlock new planes and courses":"Every plane and course is unlocked.");
  }
  async function authenticate(purpose,done,cancel,info){
    info ??= await parent("pinIsSet");
    if(!info.isSet){
      createPIN(info,async()=>{
        if(purpose==="learningMode" || purpose==="pinSet")await done(true);
        else await authenticate(purpose,done,cancel);
      },cancel);
      return;
    }
    if(saved.biometricUnlock){
      try{
        if(await parent("biometricVerify",{purpose})){await done(false);return;}
      }catch { /* A cancelled device prompt returns to the parent PIN. */ }
    }
    const retry=async()=>authenticate(purpose,done,cancel);
    const forgot=()=>recovery(info,true,(_question,answer)=>{
      pin("Choose a new 4-digit PIN","Save PIN",async value=>{
        if(!await parent("pinReset",{answer,pin:value}))throw Error("Reset answer not accepted. Try again when the PIN is available.");
        await retry();
      },cancel);
    },cancel);
    pin("Enter your parent PIN","Continue",async value=>{
      if(!await parent("pinVerify",{pin:value,purpose})){
        const current=await parent("pinIsSet");
        throw Error(current.remaining?"Try again in "+current.remaining+" seconds.":"PIN not accepted. Please try again.");
      }
      await done(false);
    },cancel,forgot);
    if(info.remaining)$("parentError").textContent="Try again in "+info.remaining+" seconds.";
  }
  function switchState(id,on){
    $(id).setAttribute("aria-checked",String(on));$(id).textContent=on?"On":"Off";
  }
  function settings(){
    clearSecret();submitPIN=null;recoveryOptions=null;
    page("parentSettings","Settings");
    switchState("learningSwitch",saved.learningMode!==false);
    switchState("biometricSwitch",saved.biometricUnlock===true);
  }
  $("parentSettingsOpen").onclick=settings;
  $("settingsClose").onclick=()=>{dismiss();$("parentSettingsOpen").focus?.();};
  $("showNotice").onclick=notice;
  $("learningSwitch").onclick=action(()=>authenticate("learningMode",async()=>{
    await set("learningMode",saved.learningMode===false);settings();
  },settings));
  $("changePIN").onclick=action(()=>authenticate("pinSet",async created=>{
    if(created){settings();return;}
    createPIN(await parent("pinIsSet"),settings,settings);
  },settings));
  $("biometricSwitch").onclick=action(async()=>{
    if(!saved.biometricUnlock && !await parent("biometricAvailable"))
      throw Error("Set a device passcode to use device authentication.");
    await authenticate("biometricUnlock",async()=>{
      await set("biometricUnlock",!saved.biometricUnlock);settings();
    },settings);
  });
  $("keepLearning").onclick=action(()=>saved.learningMode===false?
    authenticate("learningMode",()=>finish(true),notice):finish(true));
  $("olderPilot").onclick=action(async()=>{
    const info=await parent("pinIsSet");
    await authenticate("learningMode",()=>finish(false),notice,info);
  });
  $("pinSubmit").onclick=action(async()=>{
    if(digits.length!==4)return;
    const value=digits;digits="";pinCount();await submitPIN(value);
  });
  $("recoverySave").onclick=action(async()=>{
    const answer=$("parentAnswer").value;
    if(!answer.trim())throw Error("Enter your reset answer.");
    await recoveryOptions(Number($("parentQuestion").value),answer);
    $("parentAnswer").value="";
  });
  $("pinCancel").onclick=$("recoveryCancel").onclick=()=>{if(!busy){clearSecret();cancelFlow();recoveryOptions=null;}};
  $("parentStart").onclick=dismiss;
  overlay.addEventListener("keydown",event=>{
    if($("parentPin").hidden || event.metaKey || event.ctrlKey || event.altKey)return;
    if(/^[0-9]$/.test(event.key) || ["Delete","Backspace"].includes(event.key)){
      event.preventDefault();key(event.key.length===1?event.key:"Delete");
    }
  });
  if(saved.parentNoticeSeen)dismiss();else notice();
  return {get active(){return active;}};
};
