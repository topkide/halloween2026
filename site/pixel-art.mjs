// Detailed pixel illustration atlas; viewboxes isolate each transparent character.
const frames={wisp:[104,8,307,499],pudge:[516,41,483,465],skitter:[1024,163,492,331],stilt:[102,513,308,494],grasp:[557,516,427,480],gold:[1097,512,369,489]};
export function ghostPixel(type='wisp'){
  const [x,y,width,height]=frames[type]??frames.wisp;
  return `<svg class="character-art" viewBox="${x} ${y} ${width} ${height}" aria-hidden="true" focusable="false"><image href="assets/refined-ghost-atlas.webp" x="0" y="0" width="1536" height="1024"/></svg>`;
}
export function coinPixel(type='ghost'){
  const gold=type!=='ghost';
  const colors=gold?['#805029','#bb762e','#f3b846','#ffdf76','#fff5c0']:['#454756','#747887','#b7becb','#e5eaf1','#ffffff'];
  const face=gold?'<path d="M32 24q-1-9 5-10l3 4q-6 0-5 6" fill="#6b9a53" stroke="#415d38" stroke-width="1.6"/><path d="M32 25c-15-9-21 11-13 20 4 5 8 3 13 4 5-1 10 1 14-5 7-10-1-25-14-19" fill="#f78c28" stroke="#9b501e" stroke-width="1.8"/><path d="M29 26c-5 7-5 16-1 22m7-22c5 7 5 17 1 22" fill="none" stroke="#e86d22" stroke-width="2"/><path d="m23 34 5-4 2 6zm11 2 3-6 5 5zm-11 4q9 8 18-1l-2 7-5-1-3 3-4-3-3 1z" fill="#fff1a0" stroke="#a45321" stroke-width="1.5" stroke-linejoin="round"/>':'<path d="M21 31c0-16 22-18 23-1 0 8 0 11 4 16 2 4-4 7-8 3-2 7-7 5-9 1-5 6-9 3-9-1-5 5-10 0-6-4 5-5 5-8 5-14" fill="#f6f6f5" stroke="#575969" stroke-width="2" stroke-linejoin="round"/><ellipse cx="28" cy="31" rx="2.8" ry="4" fill="#363647"/><ellipse cx="38" cy="31" rx="2.8" ry="4" fill="#363647"/><ellipse cx="24.5" cy="38" rx="2.3" ry="1.5" fill="#b7bbc5"/><ellipse cx="41" cy="38" rx="2.3" ry="1.5" fill="#b7bbc5"/>';
  return `<svg viewBox="0 0 64 68" aria-hidden="true" focusable="false"><ellipse cx="32" cy="36" rx="29" ry="30" fill="${colors[0]}"/><circle cx="32" cy="31" r="29" fill="${colors[1]}" stroke="${colors[0]}" stroke-width="1.8"/><circle cx="31" cy="30" r="26" fill="${colors[3]}"/><circle cx="31" cy="30" r="21.5" fill="${colors[2]}" stroke="${colors[1]}" stroke-width="2"/><path d="M11 23A22 22 0 0 1 34 8" stroke="${colors[4]}" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M15 49a24 24 0 0 0 34-7" stroke="${colors[1]}" stroke-width="2" stroke-linecap="round" fill="none"/>${face}<circle cx="14" cy="17" r="2" fill="${colors[4]}"/></svg>`;
}
export function pumpkinPixel(){return coinPixel('pumpkin');}
