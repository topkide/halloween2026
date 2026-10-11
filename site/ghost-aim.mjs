import {ghostFrame} from './pixel-art.mjs?v=20261011-recovery1';

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
