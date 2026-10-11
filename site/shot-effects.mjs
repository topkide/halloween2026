import {ghostFrame} from './pixel-art.mjs?v=20261011-mission-peek';

// All effects share the gameplay RAF and a fixed budget, including a full 16-target blast.
export const SHOT_LIMITS=Object.freeze({bursts:24,particles:16,lifetime:560,pixelRatio:2,labels:32,labelLifetime:760,spreads:4,spreadLifetime:220});
const colors={wisp:'#c7acff',pudge:'#c7e798',skitter:'#ff987a',stilt:'#9bf0ec',grasp:'#f2b0d5',gold:'#ffd271'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const easeOut=t=>1-(1-clamp(t,0,1))**3;
export class ShotEffects {
  constructor(canvas,{reducedMotion=()=>false,enabled=()=>true}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.reducedMotion=reducedMotion;this.enabled=enabled;
    this.bursts=[];this.spreads=[];this.labels=[];this.width=1;this.height=1;this.dirty=false;this.silhouettes=new Map();
    this.atlas=new Image();this.atlas.src='assets/refined-ghost-atlas.webp';
  }
  resize(width,height){
    if(width===this.width&&height===this.height)return;
    this.width=width;this.height=height;this.ratio=Math.min(SHOT_LIMITS.pixelRatio,window.devicePixelRatio||1);
    this.canvas.width=Math.max(1,Math.round(width*this.ratio));this.canvas.height=Math.max(1,Math.round(height*this.ratio));this.clear();
  }
  clear(){this.bursts.length=0;this.spreads.length=0;this.labels.length=0;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.dirty=false;}
  silhouette(type){
    if(this.silhouettes.has(type))return this.silhouettes.get(type);
    if(!this.atlas.complete||!this.atlas.naturalWidth)return null;
    const [x,y,w,h]=ghostFrame(type),canvas=document.createElement('canvas');canvas.width=Math.round(w*.35);canvas.height=Math.round(h*.35);
    const ctx=canvas.getContext('2d');ctx.drawImage(this.atlas,x,y,w,h,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='source-in';ctx.fillStyle='#fffbe9';ctx.fillRect(0,0,canvas.width,canvas.height);this.silhouettes.set(type,canvas);return canvas;
  }
  shoot(hit,x,y,ghostBox,now=performance.now(),{impactOnly=false,renderNow=true}={}){
    if(!this.enabled()){this.clear();return;}
    const miss=hit.kind==='miss',gold=hit.kind==='gold',still=this.reducedMotion();
    // The explosion and payout belong to the captured ghost, including edge taps.
    if(!miss&&ghostBox){x=ghostBox.x;y=ghostBox.y;}
    const scale=clamp(this.width/400,.55,1.4),count=still?0:miss?5:gold?SHOT_LIMITS.particles:14;
    const particles=Array.from({length:count},(_,i)=>{
      const angle=i/count*Math.PI*2+(Math.random()-.5)*.28,speed=((miss?40:150)+Math.random()*(gold?240:160))*scale;
      return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-30*scale,size:(miss?1.5:2+Math.random()*3.5)*scale,spin:Math.random()*12-6,angle,light:i%3!==0};
    });
    const shards=still||miss||!ghostBox?[]:Array.from({length:6},(_,i)=>{
      const col=i%3,row=Math.floor(i/3),angle=Math.atan2(row-.5,col-1);
      return {col,row,vx:Math.cos(angle)*(90+Math.random()*100)*scale,vy:Math.sin(angle)*(90+Math.random()*100)*scale,spin:(Math.random()-.5)*3};
    });
    const burst={x:clamp(x,2,this.width-2),y:clamp(y,2,this.height-2),born:now,miss,gold,still,impactOnly,scale,color:miss?'#b6b0be':colors[hit.kind]??'#e4d8ff',particles,shards,ghostBox,silhouette:miss?null:this.silhouette(hit.kind),frame:ghostFrame(hit.kind)};
    this.bursts.push(burst);if(this.bursts.length>SHOT_LIMITS.bursts)this.bursts.shift();
    const amount=gold?hit.bonusCoins:hit.upgradeCoins;
    if(!miss&&amount>0){
      this.labels.push({x:burst.x,y:burst.y,born:now,gold,still,scale,text:'+'+Math.round(amount).toLocaleString('ko-KR')});
      if(this.labels.length>SHOT_LIMITS.labels)this.labels.shift();
    }
    if(renderNow)this.render(now);
  }
  shotgun(hit,x,y,radius,boxes,now=performance.now()){
    if(!this.enabled()){this.clear();return;}
    for(const target of hit.targets){
      const box=boxes.get(target.ghost.id);
      if(box)this.shoot(target,box.x,box.y,box,now,{impactOnly:true,renderNow:false});
    }
    if(!hit.hitCount)this.shoot(hit,x,y,null,now,{impactOnly:true,renderNow:false});
    this.spreads.push({x,y,radius,born:now,still:this.reducedMotion(),miss:hit.kind==='miss',pellets:Array.from({length:12},(_,i)=>({angle:i*Math.PI/6,reach:.65+Math.random()*.35}))});
    if(this.spreads.length>SHOT_LIMITS.spreads)this.spreads.shift();this.render(now);
  }
  renderSpreads(ctx,now){
    for(const b of this.spreads){
      const t=(now-b.born)/1000,fade=clamp(1-t/.22,0,1),color=b.miss?'#f4a497':'#ffe2a0';
      ctx.save();ctx.lineCap='round';ctx.strokeStyle=color;
      if(t<.14){ctx.globalAlpha=(1-t/.14)*.55;ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.stroke();}
      if(!b.still){
        const reach=easeOut(t/.12);ctx.globalAlpha=fade;ctx.lineWidth=2.5;
        for(const pellet of b.pellets){
          const end=b.radius*reach*pellet.reach,start=Math.max(0,end-22*(1-reach*.6));
          ctx.beginPath();ctx.moveTo(b.x+Math.cos(pellet.angle)*start,b.y+Math.sin(pellet.angle)*start);ctx.lineTo(b.x+Math.cos(pellet.angle)*end,b.y+Math.sin(pellet.angle)*end);ctx.stroke();
        }
        if(t<.045){ctx.globalAlpha=(1-t/.045)*.9;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(this.width/2,this.height);ctx.lineTo(b.x,b.y);ctx.stroke();}
      }
      if(t<.07){ctx.globalAlpha=1-t/.07;ctx.fillStyle='#fff8df';ctx.beginPath();ctx.arc(b.x,b.y,b.still?4:Math.max(2,11-t*100),0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
  }
  renderBurst(ctx,b,now){
    const t=(now-b.born)/1000,fade=clamp((.56-t)/.22,0,1),s=b.scale;
    ctx.save();ctx.lineCap='round';
    // A very short, heavy crack links the weapon to the impact.
    if(t<.055&&!b.still&&!b.impactOnly){
      ctx.globalAlpha=(1-t/.055)*.85;ctx.strokeStyle=b.miss?'#cbd1dc':'#ffe9b5';ctx.lineWidth=3*s;
      ctx.beginPath();ctx.moveTo(this.width/2,this.height+2);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    if(b.miss){
      ctx.globalAlpha=fade;ctx.fillStyle='#150e23b0';ctx.beginPath();ctx.ellipse(b.x,b.y,5*s,3.5*s,0,0,Math.PI*2);ctx.fill();
      if(!b.still&&t<.25){ctx.globalAlpha=(1-t/.25)*.3;ctx.fillStyle='#c8becb';ctx.beginPath();ctx.ellipse(b.x,b.y-t*20,8*s+t*26,5*s+t*18,-.3,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=fade;ctx.strokeStyle='#f3a198';ctx.lineWidth=1.8*s;ctx.setLineDash([6*s,5*s]);
      ctx.beginPath();ctx.arc(b.x,b.y,14*s,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }else{
      // The sprite blooms white for 55 ms, then breaks into six short-lived pieces.
      if(t<.055&&b.silhouette&&b.ghostBox){
        const q=b.ghostBox,k=b.still?1:1+easeOut(t/.055)*.2;ctx.globalAlpha=(1-t/.055)*.95;
        ctx.save();ctx.translate(q.x,q.y);ctx.scale(q.facing??1,1);ctx.drawImage(b.silhouette,-q.width*k/2,-q.height*k/2,q.width*k,q.height*k);ctx.restore();
      }
      if(t>=.025&&t<.2&&this.atlas.complete&&this.atlas.naturalWidth&&b.ghostBox){
        const q=b.ghostBox,[fx,fy,fw,fh]=b.frame,w=Math.min(q.width,q.height*fw/fh),h=w*fh/fw,u=t-.025;
        ctx.globalAlpha=(1-t/.2)*.8;
        for(const shard of b.shards){
          const sw=fw/3,sh=fh/2,pw=w/3,ph=h/2;
          ctx.save();ctx.translate(q.x,q.y);ctx.scale(q.facing??1,1);
          ctx.translate(-w/2+(shard.col+.5)*pw+shard.vx*u,-h/2+(shard.row+.5)*ph+shard.vy*u);
          ctx.rotate(shard.spin*u);ctx.drawImage(this.atlas,fx+shard.col*sw,fy+shard.row*sh,sw,sh,-pw/2,-ph/2,pw,ph);ctx.restore();
        }
      }
      if(!b.still&&t<.22){
        const progress=easeOut(t/.22),radius=(10+progress*(b.gold?64:46))*s;
        ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-t/.22)*.48;
        const glow=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,radius);
        glow.addColorStop(0,'#fff4d9');glow.addColorStop(.35,b.color);glow.addColorStop(1,'#00000000');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(b.x,b.y,radius,0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=(1-t/.22)*.9;ctx.strokeStyle=b.color;ctx.lineWidth=(1+(1-progress)*4)*s;
        ctx.beginPath();ctx.arc(b.x,b.y,radius,0,Math.PI*2);ctx.stroke();ctx.globalCompositeOperation='source-over';
      }
      if(t<.09){
        const radius=b.still?15*s:(18+easeOut(t/.09)*18)*s;
        ctx.globalAlpha=1-t/.09;ctx.fillStyle='#fffae8';ctx.beginPath();
        for(let i=0;i<20;i++){const a=i*Math.PI/10,r=i%2?radius*.28:radius*(i%4===0?1:.75),px=b.x+Math.cos(a)*r,py=b.y+Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
        ctx.closePath();ctx.fill();
      }
      // A tight pressure cloud dissipates quickly instead of lingering confetti.
      if(!b.still&&t>.045&&t<.3){
        ctx.globalAlpha=(1-t/.3)*.18;ctx.fillStyle=b.color;
        for(let i=0;i<3;i++){const a=i*Math.PI*2/3,r=(11+t*34)*s;ctx.beginPath();ctx.arc(b.x+Math.cos(a)*t*55*s,b.y+Math.sin(a)*t*45*s,r,0,Math.PI*2);ctx.fill();}
      }
    }
    for(const p of b.particles){
      const drag=1-Math.exp(-t*6),x=b.x+p.vx*drag/6,y=b.y+p.vy*drag/6+100*t*t;
      ctx.globalAlpha=fade*(1-t/.56);ctx.strokeStyle=p.light&&!b.miss?'#fff6d8':b.color;ctx.lineWidth=p.size*.8;
      if(!b.miss&&t<.2){
        const trail=(1-t/.2)*.035;ctx.beginPath();ctx.moveTo(x-p.vx*trail,y-p.vy*trail);ctx.lineTo(x,y);ctx.stroke();
      }
      ctx.save();ctx.translate(x,y);ctx.rotate(p.angle+p.spin*t);ctx.fillStyle=p.light&&!b.miss?'#fff0c7':b.color;
      if(b.miss)ctx.fillRect(-p.size,-p.size/2,p.size*2,p.size);
      else{ctx.beginPath();ctx.moveTo(-p.size,-p.size*.5);ctx.lineTo(p.size*1.8,0);ctx.lineTo(-p.size,p.size*.5);ctx.closePath();ctx.fill();}
      ctx.restore();
    }
    ctx.restore();
  }
  renderLabels(ctx,now){
    for(const label of this.labels){
      const t=(now-label.born)/SHOT_LIMITS.labelLifetime,fade=t<.65?1:(1-t)/.35;
      const pop=label.still?1:t<.12?1+.35*(1-t/.12):1,size=(label.gold?24:21)*label.scale;
      ctx.save();ctx.font='900 '+size+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      const half=ctx.measureText(label.text).width*pop/2+5;
      const x=clamp(label.x,half,this.width-half),y=clamp(label.y-9-(label.still?0:easeOut(t)*30*label.scale),size,this.height-size);
      ctx.translate(x,y);ctx.scale(pop,pop);ctx.globalAlpha=clamp(fade,0,1);ctx.lineJoin='round';ctx.lineWidth=4*label.scale;
      ctx.strokeStyle='#170f24';ctx.strokeText(label.text,0,0);ctx.fillStyle=label.gold?'#ffdb73':'#fff7e7';ctx.fillText(label.text,0,0);ctx.restore();
    }
  }
  render(now){
    if(!this.enabled()){this.clear();return;}
    this.bursts=this.bursts.filter(b=>now-b.born<SHOT_LIMITS.lifetime);
    this.spreads=this.spreads.filter(b=>now-b.born<SHOT_LIMITS.spreadLifetime);
    this.labels=this.labels.filter(b=>now-b.born<SHOT_LIMITS.labelLifetime);
    if(!this.bursts.length&&!this.spreads.length&&!this.labels.length&&!this.dirty)return;
    const ctx=this.ctx;ctx.setTransform(this.ratio||1,0,0,this.ratio||1,0,0);ctx.clearRect(0,0,this.width,this.height);
    this.dirty=this.bursts.length>0||this.spreads.length>0||this.labels.length>0;
    this.renderSpreads(ctx,now);for(const b of this.bursts)this.renderBurst(ctx,b,now);this.renderLabels(ctx,now);
  }
}
