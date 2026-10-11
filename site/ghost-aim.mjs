import {ghostFrame} from './pixel-art.mjs?v=20261011-lobby-clean';

// Radius in the arena's 400-unit coordinate space; scales with the viewport.
export const SHOTGUN=Object.freeze({radius:72});

// Small alpha masks are prepared once, never sampled from the canvas per shot.
export class GhostAim {
  constructor(){
    this.masks=new Map();
    const atlas=new Image();
    atlas.onload=()=>{
      for(const type of ['wisp','pudge','skitter','stilt','grasp','gold']){
        const [x,y,w,h]=ghostFrame(type),width=64,height=Math.max(1,Math.round(64*h/w));
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(atlas,x,y,w,h,0,0,width,height);
        const rgba=ctx.getImageData(0,0,width,height).data;
        const alpha=Uint8Array.from({length:width*height},(_,i)=>rgba[i*4+3]);
        this.masks.set(type,{width,height,aspect:w/h,alpha});
      }
    };
    atlas.src='assets/refined-ghost-atlas.webp';
  }
}

export function spriteContains(candidate,x,y,mask){
  const r=candidate.rect;
  if(x<r.left||x>=r.right||y<r.top||y>=r.bottom)return false;
  if(!mask)return true;
  // SVG preserveAspectRatio="xMidYMid meet" adds letterboxing inside the button.
  const w=Math.min(r.width,r.height*mask.aspect),h=w/mask.aspect;
  let u=(x-r.left-(r.width-w)/2)/w;
  const v=(y-r.top-(r.height-h)/2)/h;
  if(u<0||u>=1||v<0||v>=1)return false;
  if(candidate.facing<0)u=1-u;
  const col=Math.min(mask.width-1,Math.floor(u*mask.width)),row=Math.floor(v*mask.height);
  return mask.alpha[row*mask.width+col]>=32;
}

export function pickGhost(candidates,x,y,masks){
  // Last painted target wins only where its illustration actually exists.
  for(let i=candidates.length-1;i>=0;i--){
    const c=candidates[i];if(spriteContains(c,x,y,masks.get(c.type)))return c.id;
  }
  // Preserve the existing forgiving target sizes when no visible sprite is hit.
  for(let i=candidates.length-1;i>=0;i--){
    const c=candidates[i];if(spriteContains(c,x,y,null))return c.id;
  }
  return null;
}

function circleTouchesRect(x,y,radius,left,top,width,height){
  const dx=x-Math.max(left,Math.min(left+width,x)),dy=y-Math.max(top,Math.min(top+height,y));
  return dx*dx+dy*dy<=radius*radius;
}
export function spriteTouchesCircle(candidate,x,y,radius,mask){
  if(!Number.isFinite(radius)||radius<0||!Number.isFinite(x)||!Number.isFinite(y))return false;
  const r=candidate.rect;
  const touchesVisible=(left,top,width,height)=>{
    const clip=candidate.clip;if(!clip)return circleTouchesRect(x,y,radius,left,top,width,height);
    const right=Math.min(left+width,clip.right),bottom=Math.min(top+height,clip.bottom);
    left=Math.max(left,clip.left);top=Math.max(top,clip.top);
    return right>left&&bottom>top&&circleTouchesRect(x,y,radius,left,top,right-left,bottom-top);
  };
  if(!touchesVisible(r.left,r.top,r.width,r.height))return false;
  if(!mask)return true;
  const w=Math.min(r.width,r.height*mask.aspect),h=w/mask.aspect,left=r.left+(r.width-w)/2,top=r.top+(r.height-h)/2;
  const cw=w/mask.width,ch=h/mask.height;
  const col0=Math.max(0,Math.floor((x-radius-left)/cw)),col1=Math.min(mask.width-1,Math.floor((x+radius-left)/cw));
  const row0=Math.max(0,Math.floor((y-radius-top)/ch)),row1=Math.min(mask.height-1,Math.floor((y+radius-top)/ch));
  for(let row=row0;row<=row1;row++)for(let col=col0;col<=col1;col++){
    const sourceCol=candidate.facing<0?mask.width-1-col:col;
    if(mask.alpha[row*mask.width+sourceCol]>=32&&touchesVisible(left+col*cw,top+row*ch,cw,ch))return true;
  }
  return false;
}
export function pickShotgunGhosts(candidates,x,y,radius,masks){
  // The center keeps normal-shot forgiveness. The spread only hits visible sprite pixels.
  const direct=pickGhost(candidates,x,y,masks);
  return [...new Set(candidates.filter(c=>c.id===direct||spriteTouchesCircle(c,x,y,radius,masks.get(c.type))).map(c=>c.id))];
}
