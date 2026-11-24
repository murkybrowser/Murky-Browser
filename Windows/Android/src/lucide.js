





(function () {
  const icons = {
    'arrow-left': [['path',{d:'m12 19-7-7 7-7'}],['path',{d:'M19 12H5'}]],
    'arrow-right': [['path',{d:'M5 12h14'}],['path',{d:'m12 5 7 7-7 7'}]],
    'chevron-left': [["path",{"d":"m15 18-6-6 6-6"}]],
    'chevron-right': [["path",{"d":"m9 18 6-6-6-6"}]],
    'check': [['path',{d:'M20 6 9 17l-5-5'}]],
    'circle-plus': [['circle',{cx:'12',cy:'12',r:'10'}],['path',{d:'M8 12h8'}],['path',{d:'M12 8v8'}]],
    'download': [["path",{"d":"M12 15V3"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{"d":"m7 10 5 5 5-5"}]],
    'file': [['path',{d:'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'}],['path',{d:'M14 2v6h6'}]],
    'folder': [['path',{d:'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'}]],
    'globe-2': [['circle',{cx:'12',cy:'12',r:'10'}],['path',{d:'M2 12h20'}],['path',{d:'M12 2a15.3 15.3 0 0 1 0 20'}],['path',{d:'M12 2a15.3 15.3 0 0 0 0 20'}]],
    'grip-vertical': [['circle',{cx:'9',cy:'5',r:'1'}],['circle',{cx:'15',cy:'5',r:'1'}],['circle',{cx:'9',cy:'12',r:'1'}],['circle',{cx:'15',cy:'12',r:'1'}],['circle',{cx:'9',cy:'19',r:'1'}],['circle',{cx:'15',cy:'19',r:'1'}]],
    'history': [['path',{d:'M3 12a9 9 0 1 0 3-6.7'}],['path',{d:'M3 4v5h5'}],['path',{d:'M12 7v5l3 2'}]],
    'house': [["path",{"d":"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"}],["path",{"d":"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"}]],
    'info': [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],
    'mic': [["path",{"d":"M12 19v3"}],["path",{"d":"M19 10v2a7 7 0 0 1-14 0v-2"}],["rect",{"x":"9","y":"2","width":"6","height":"13","rx":"3"}]],
    'minus': [["path",{"d":"M5 12h14"}]],
    'more-horizontal': [['circle',{cx:'5',cy:'12',r:'1'}],['circle',{cx:'12',cy:'12',r:'1'}],['circle',{cx:'19',cy:'12',r:'1'}]],
    'panel-left': [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M9 3v18"}]],
    'pin': [['path',{d:'M12 17v5'}],['path',{d:'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'}]],
    'volume-x': [['path',{d:'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z'}],['line',{x1:'22',x2:'16',y1:'9',y2:'15'}],['line',{x1:'16',x2:'22',y1:'9',y2:'15'}]],
    'plus': [["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]],
    'puzzle': [["path",{"d":"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0-.474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"}]],
    'rotate-ccw': [['path',{d:'M3 12a9 9 0 1 0 3-6.7'}],['path',{d:'M3 4v5h5'}],['path',{d:'M12 7v5l3 2'}]],
    'search': [["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],
    'settings': [["path",{"d":"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{"cx":"12","cy":"12","r":"3"}]],
    'shield': [['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'}]],
    'shield-check': [['path',{d:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z'}],['path',{d:'m9 12 2 2 4-4'}]],
    'square': [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}]],
    'star': [["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"}]],
    'type': [['path',{d:'M4 7V4h16v3'}],['path',{d:'M9 20h6'}],['path',{d:'M12 4v16'}]],
    'upload': [['path',{d:'M12 16V4'}],['path',{d:'m7 9 5-5 5 5'}],['path',{d:'M5 14v5h14v-5'}]],
    'volume-2': [['polygon',{points:'11 5 6 9 2 9 2 15 6 15 11 19 11 5'}],['path',{d:'M19.1 9a5 5 0 0 1 0 6'}],['path',{d:'M22 6.5a9 9 0 0 1 0 11'}]],
    'x': [["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],
    'rotate-cw': [["path",{"d":"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}]],
    'rotate-ccw-clock': [["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{"d":"M3 3v5h5"}],["path",{"d":"M12 7v5l4 2"}]],
    'ellipsis': [["circle",{"cx":"12","cy":"12","r":"1"}],["circle",{"cx":"19","cy":"12","r":"1"}],["circle",{"cx":"5","cy":"12","r":"1"}]],
    'palette': [["path",{"d":"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"}],["circle",{"cx":"13.5","cy":"6.5","r":".5","fill":"currentColor"}],["circle",{"cx":"17.5","cy":"10.5","r":".5","fill":"currentColor"}],["circle",{"cx":"6.5","cy":"12.5","r":".5","fill":"currentColor"}],["circle",{"cx":"8.5","cy":"7.5","r":".5","fill":"currentColor"}]],
    'case-sensitive': [["path",{"d":"m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"}],["path",{"d":"M22 9v7"}],["path",{"d":"M3.304 13h6.392"}],["circle",{"cx":"18.5","cy":"12.5","r":"3.5"}]],
    'shield-lock': [["path",{"d":"M20 9.807V6a1 1 0 0 0-1-1c-2 0-4.49-1.19-6.24-2.72a1.17 1.17 0 0 0-1.52 0C9.5 3.8 7 5 5 5a1 1 0 0 0-1 1v7c0 3.88 2.107 6.254 5 7.796"}],["path",{"d":"M19 17v-2a2 2 0 0 0-4 0v2"}],["rect",{"x":"13","y":"17","width":"8","height":"5","rx":"1"}]],
    'languages': [["path",{"d":"m5 8 6 6"}],["path",{"d":"m4 14 6-6 2-3"}],["path",{"d":"M2 5h12"}],["path",{"d":"M7 2h1"}],["path",{"d":"m22 22-5-10-5 10"}],["path",{"d":"M14 18h6"}]],
    'monitor-cog': [["path",{"d":"M12 17v4"}],["path",{"d":"m14.305 7.53.923-.382"}],["path",{"d":"m15.228 4.852-.923-.383"}],["path",{"d":"M16.852 3.228l-.383-.924"}],["path",{"d":"M16.852 8.772l-.383.923"}],["path",{"d":"M19.148 3.228l.383-.924"}],["path",{"d":"M19.53 9.696l-.382-.924"}],["path",{"d":"m20.772 4.852.924-.383"}],["path",{"d":"m20.772 7.148.924.383"}],["path",{"d":"M22 13v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"}],["path",{"d":"M8 21h8"}],["circle",{"cx":"18","cy":"6","r":"3"}]],
  };

  function createIcon(name, source) {
    const el = document.createElement('svg');
    el.setAttribute('xmlns','http://www.w3.org/2000/svg');
    el.setAttribute('viewBox','0 0 24 24');
    el.setAttribute('fill','none');
    el.setAttribute('stroke','currentColor');
    el.setAttribute('stroke-width','2');
    el.setAttribute('stroke-linecap','round');
    el.setAttribute('stroke-linejoin','round');
    el.classList.add('lucide', `lucide-${name}-icon`, `lucide-${name}`);
    for (const [tag, attrs] of icons[name] || icons.search) {
      const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
      el.appendChild(n);
    }
    for (const attr of source.attributes) {
      if (attr.name === 'data-lucide') continue;
      if (attr.name === 'class') el.classList.add(...attr.value.split(/\s+/).filter(Boolean));
      else el.setAttribute(attr.name, attr.value);
    }
    return el;
  }

  function createIcons(options = {}) {
    const root = options.root || document;
    const nodes = root.querySelectorAll ? root.querySelectorAll('[data-lucide]') : [];
    nodes.forEach(node => {
      const name = (node.getAttribute('data-lucide') || '').trim().toLowerCase();
      if (!name || !icons[name] || !node.parentNode) return;
      node.parentNode.replaceChild(createIcon(name, node), node);
    });
  }

  function svg(name, attrs = {}) {
    name = String(name || 'search').trim().toLowerCase();
    const data = icons[name] || icons.search;
    const attrText = Object.entries(attrs).map(([k,v]) => ` ${k}="${String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`).join('');
    const body = data.map(([tag, a]) => `<${tag}${Object.entries(a).map(([k,v]) => ` ${k}="${v}"`).join('')}></${tag}>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name}-icon lucide-${name}"${attrText}>${body}</svg>`;
  }

  window.lucide = { icons, createIcons, svg };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createIcons());
  } else createIcons();

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('[data-lucide]')) {
          const name = node.getAttribute('data-lucide')?.toLowerCase();
          if (icons[name]) node.parentNode?.replaceChild(createIcon(name,node), node);
        } else if (node.querySelector?.('[data-lucide]')) createIcons({root: node});
      }
    }
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});
})();
