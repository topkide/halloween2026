import {ghostFrame} from './pixel-art.mjs?v=20261011-hud1';

// One canvas and one existing RAF. Each shot has a fixed particle budget and lifetime.
export const SHOT_LIMITS=Object.freeze({bursts:8,particles:12,lifetime:700,pixelRatio:2});
const colors={wisp:'#c7acff',pudge:'#c7e798',skitter:'#ff987a',stilt:'#9bf0ec',grasp:'#f2b0d5',gold:'#ffd271'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class ShotEffects {
  constructor(canvas,{reducedMotion=()=>false}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.reducedMotion=reducedMotion;this.bursts=[];this.width=1;this.height=1;this.dirty=false;this.silhouettes=new Map();
    this.atlas=new Image();this.atlas.src='assets/refined-ghost-atlas.webp';
  }
  resize(width,height){
    if(width===this.width&&height===this.height)return;
    this.width=width;this.height=height;this.ratio=Math.min(SHOT_LIMITS.pixelRatio,window.devicePixelRatio||1);
    this.canvas.width=Math.max(1,Math.round(width*this.ratio));this.canvas.height=Math.max(1,Math.round(height*this.ratio));this.clear();
  }
  clear(){this.bursts.length=0;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.dirty=false;}
  silhouette(type){
    if(this.silhouettes.has(type))return this.silhouettes.get(type);
    if(!this.atlas.complete||!this.atlas.naturalWidth)return null;
    const [x,y,w,h]=ghostFrame(type),canvas=document.createElement('canvas');canvas.width=Math.round(w*.35);canvas.height=Math.round(h*.35);
    const ctx=canvas.getContext('2d');ctx.drawImage(this.atlas,x,y,w,h,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#fff7df';ctx.fillRect(0,0,canvas.width,canvas.height);this.silhouettes.set(type,canvas);return canvas;
  }
  shoot(hit,x,y,ghostBox,now=performance.now()){
    const miss=hit.kind==='miss',gold=hit.kind==='gold',still=this.reducedMotion(),count=still?0:miss?5:gold?12:9;
    const particles=Array.from({length:count},(_,i)=>{
      const angle=i/count*Math.PI*2+(Math.random()-.5)*.5,speed=(miss?35:65)+Math.random()*(gold?130:90);
      return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-25,size:miss?2:2+Math.random()*3,spin:Math.random()*10-5,angle:angle,light:i%3===0};
    });
    this.bursts.push({x:clamp(x,4,this.width-4),y:clamp(y,4,this.height-4),born:now,miss,gold,still,color:miss?'#b6b0be':colors[hit.kind],particles,ghostBox,silhouette:miss?null:this.silhouette(hit.kind),label:miss?'빗나감  −'+hit.penalty+'초':gold?'황금 +'+hit.bonusCoins:'명중  +'+hit.upgradeCoins});
    if(this.bursts.length>SHOT_LIMITS.bursts)this.bursts.shift();this.render(now);
  }
  render(now){
    this.bursts=this.bursts.filter(b=>now-b.born<SHOT_LIMITS.lifetime);
    if(!this.bursts.length&&!this.dirty)return;
    const ctx=this.ctx;ctx.setTransform(this.ratio||1,0,0,this.ratio||1,0,0);ctx.clearRect(0,0,this.width,this.height);this.dirty=this.bursts.length>0;
    for(const b of this.bursts){
      const t=(now-b.born)/1000,fade=clamp((.7-t)/.23,0,1),mx=this.width*.5,my=this.height+8;
      ctx.save();ctx.lineCap='round';
      // A sharp muzzle flash and tracer link the shot to the clicked point.
      if(t<.09&&!b.still){
        ctx.globalAlpha=(1-t/.09)*.95;ctx.strokeStyle=b.miss?'#cbd1dc':'#ffe9b5';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(b.x,b.y);ctx.stroke();
        ctx.fillStyle='#fff2c5';ctx.beginPath();ctx.moveTo(mx-12,my);ctx.lineTo(mx-5,my-18);ctx.lineTo(mx,my-7);ctx.lineTo(mx+6,my-23);ctx.lineTo(mx+13,my);ctx.fill();
      }
      // The target flashes in place; no moving hitbox or interruption to spawning.
      if(!b.miss&&t<.1&&b.silhouette&&b.ghostBox){
        const q=b.ghostBox,k=b.still?1:1+t*.4;ctx.globalAlpha=(1-t/.1)*.85;
        ctx.save();ctx.translate(q.x,q.y);ctx.scale(q.facing??1,1);ctx.drawImage(b.silhouette,-q.width*k/2,-q.height*k/2,q.width*k,q.height*k);ctx.restore();
      }
      ctx.globalAlpha=fade;
      if(b.miss){
        // Empty shots leave a dark bullet mark, a dust puff and an open red sight.
        ctx.fillStyle='#150e2399';ctx.beginPath();ctx.ellipse(b.x,b.y,5,3.5,0,0,Math.PI*2);ctx.fill();
        if(!b.still&&t<.45){ctx.globalAlpha=(1-t/.45)*.3;ctx.fillStyle='#c8becb';ctx.beginPath();ctx.ellipse(b.x,b.y-t*20,9+t*26,5+t*18,-.3,0,Math.PI*2);ctx.fill();}
        ctx.globalAlpha=fade;ctx.strokeStyle='#f3a198';ctx.lineWidth=1.8;const r=b.still?14:12+Math.min(t,.16)*32;
        ctx.setLineDash([7,5]);ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      }else{
        const r=b.still?16:9+Math.min(t,.3)*(b.gold?125:90);
        if(t<.32){ctx.globalAlpha=(1-t/.32)*.9;ctx.strokeStyle=b.color;ctx.lineWidth=b.gold?3:2;ctx.beginPath();ctx.arc(b.x,b.y,r,0,Math.PI*2);ctx.stroke();}
        if(t<.12){ctx.globalAlpha=(1-t/.12);ctx.fillStyle='#fffbe8';ctx.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?5:24;const px=b.x+Math.cos(a)*r,py=b.y+Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fill();}
        // Four hit-marker strokes remain readable after the short flash.
        ctx.globalAlpha=fade;ctx.strokeStyle=b.gold?'#ffe1a1':'#fff6db';ctx.lineWidth=b.gold?3:2.5;
        const gap=6+Math.min(t,.15)*12,len=7;for(const [dx,dy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){ctx.beginPath();ctx.moveTo(b.x+dx*gap,b.y+dy*gap);ctx.lineTo(b.x+dx*(gap+len),b.y+dy*(gap+len));ctx.stroke();}
      }
      // Colored angular spirit fragments fall away from the impact.
      ctx.globalAlpha=fade;
      for(const p of b.particles){
        const x=b.x+p.vx*t,y=b.y+p.vy*t+100*t*t;
        ctx.save();ctx.translate(x,y);ctx.rotate(p.angle+p.spin*t);ctx.fillStyle=p.light&&!b.miss?'#fff0c7':b.color;
        if(b.miss)ctx.fillRect(-p.size,-p.size/2,p.size*2,p.size);else{ctx.beginPath();ctx.moveTo(-p.size,-p.size);ctx.lineTo(p.size*1.6,-p.size*.5);ctx.lineTo(p.size*.4,p.size*1.4);ctx.lineTo(-p.size,p.size*.5);ctx.closePath();ctx.fill();}ctx.restore();
      }
      // One small brass casing per shot, separate from the target's fragments.
      if(!b.still&&t<.4){ctx.save();ctx.globalAlpha=(1-t/.4)*.9;ctx.translate(mx+24+t*75,this.height-13-t*65+180*t*t);ctx.rotate(t*13);ctx.fillStyle='#d4ae67';ctx.fillRect(-3,-1.5,7,3);ctx.restore();}
      const tx=clamp(b.x,70,this.width-70),ty=clamp(b.y-31-(b.still?0:t*22),22,this.height-17);
      ctx.globalAlpha=fade;ctx.font='700 '+(b.gold?15:13)+'px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#1b1027e6';ctx.strokeText(b.label,tx,ty);ctx.fillStyle=b.miss?'#ffb0a4':b.gold?'#ffdb80':'#fff4da';ctx.fillText(b.label,tx,ty);
      ctx.restore();
    }
  }
}
