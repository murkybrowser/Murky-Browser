(()=>{
  const $=s=>document.querySelector(s), box=$("#box"), detected=$("#detected"), target=$("#translate");
  let offer=null;
  window.murkyTranslate.onOffer(d=>{
  offer=d;
  detected.textContent=d.detectedName;
  target.textContent=d.targetName;
  const translated = !!d.translated;
  const translating = !!d.translating;
  [detected,target].forEach(b=>{
    b.classList.remove('busy','loading','translating');
    b.style.pointerEvents='';
    b.style.cursor='';
  });
  detected.disabled = translating || !translated;
  target.disabled = translating || translated;
  detected.classList.toggle('enabled', !translating && translated);
  target.classList.toggle('enabled', false);
  target.classList.toggle('busy', translating);
  target.classList.toggle('active', translated && !translating);
  detected.classList.toggle('active', !translated && !translating);
  if (translating) {
    target.textContent = 'Translating…';
    target.style.cursor = 'wait';
    target.setAttribute('aria-busy', 'true');
  } else {
    target.style.cursor = '';
    target.removeAttribute('aria-busy');
  }
});
  window.murkyTranslate.onTheme(s=>{
    const root=document.documentElement;
    const bg=s?.background||"#0A1412", surface=s?.surface||"#10201D", surface2=s?.surface2||surface, accent=s?.accent||"#E3A857";
    root.style.setProperty("--bg",bg); root.style.setProperty("--surface",surface); root.style.setProperty("--surface2",surface2); root.style.setProperty("--accent",accent); root.style.setProperty("--border",s?.border||"rgba(255,255,255,.11)");
  });
  window.murkyTranslate.onAnimate(mode=>{document.body.classList.remove("open","close");void document.body.offsetWidth;document.body.classList.add(mode);});
  $("#close").onclick=()=>window.murkyTranslate.close();
  target.onclick=async()=>{
    if(!offer || target.disabled)return;
    target.disabled=true; target.classList.add("busy"); target.textContent="Translating…";
    const ok=await window.murkyTranslate.translate();
    if(ok){
      offer.translated=true;

      target.textContent=offer.targetName;
      target.classList.remove("busy","loading","translating","is-translating");
      target.removeAttribute("aria-busy");
      target.style.cursor="default";
      target.style.pointerEvents="";
      target.disabled=true;
      target.classList.add("active");
      target.removeAttribute("aria-busy");
      target.style.pointerEvents="";
      target.style.cursor="";

      detected.disabled=false;
      detected.removeAttribute("disabled");
      detected.classList.remove("busy","loading","translating","is-translating","active","disabled","is-disabled");
      detected.removeAttribute("aria-busy");
      detected.setAttribute("aria-disabled","false");
      detected.style.pointerEvents="auto";
      detected.style.cursor="pointer";
      detected.style.opacity="";
      detected.style.filter="";
      detected.style.transform="";
      void detected.offsetWidth;
      detected.classList.add("enabled");
    }else{
      target.disabled=false;target.classList.remove("busy");target.textContent=offer.targetName;
    }
  };
  detected.onclick=async()=>{
    if(!offer || detected.disabled)return;
    detected.disabled=true;
    detected.classList.add("busy");
    detected.style.cursor="wait";
    const ok=await window.murkyTranslate.restore();
    if(ok){
      offer.translated=false;
      detected.classList.remove("busy","loading","translating","is-translating","active");
      detected.disabled=true;
      detected.style.cursor="default";
      target.disabled=false;
      target.classList.remove("busy","loading","translating","is-translating","active");
      target.style.cursor="";
      target.style.pointerEvents="";
    }else{
      detected.disabled=false;
      detected.classList.remove("busy");
      detected.style.cursor="";
    }
  };

})();
