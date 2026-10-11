export const COMBAT_SAMPLES=Object.freeze({
  shot:{file:'assets/audio/pistol.wav',level:1.7},
  shotgun:{file:'assets/audio/shotgun.wav',level:2.05},
  hit:{file:'assets/audio/ghost-hit.wav',level:.85},
  'gold-hit':{file:'assets/audio/ghost-hit.wav',level:1.05}
});

// Short broadband muzzle blasts, rather than falling-pitch percussion, also
// cover the first shot on a slow connection or an unavailable audio download.
function fallback(context,kind){
  const shotgun=kind==='shotgun',hit=kind==='hit';
  const duration=hit?.14:shotgun?.48:.3,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);
  const samples=buffer.getChannelData(0);let seed=73621,low=0,last=0;
  for(let i=0;i<samples.length;i++){
    const t=i/context.sampleRate;
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=seed/2147483648-1;
    low+=.075*(noise-low);
    const crack=(noise-last*.6)*Math.exp(-t/(hit?.009:.012));last=noise;
    const blast=low*Math.exp(-t/(hit?.035:shotgun?.095:.047));
    const body=Math.sin(2*Math.PI*(shotgun?62:hit?190:104)*t)*Math.exp(-t/(hit?.018:shotgun?.065:.036));
    const echo=shotgun&&t>.055?low*.27*Math.exp(-(t-.055)/.11):0;
    const attack=Math.min(1,i/Math.max(1,context.sampleRate*.0003));
    samples[i]=Math.tanh((crack*.65+blast*2.8+body*.38+echo)*1.5)*.75*attack;
  }
  return buffer;
}

export class CombatAudio{
  constructor(context,output,{fetcher=globalThis.fetch?.bind(globalThis),maxVoices=24,random=Math.random}={}){
    this.context=context;this.output=output;this.maxVoices=Math.max(1,maxVoices);this.random=random;
    this.voices=new Map();this.buffers=new Map();this.fallbacks=new Map();
    const loads=new Map();
    this.ready=Promise.all(Object.entries(COMBAT_SAMPLES).map(async([kind,spec])=>{
      if(!loads.has(spec.file))loads.set(spec.file,(async()=>{
        const response=await fetcher(spec.file);if(!response.ok)throw new Error('Audio unavailable');
        return context.decodeAudioData(await response.arrayBuffer());
      })());
      try{this.buffers.set(kind,await loads.get(spec.file));}catch{/* Gameplay keeps its immediate fallback. */}
    }));
  }
  play(kind,power=1){
    const spec=COMBAT_SAMPLES[kind];if(!spec)return false;
    const base=kind==='gold-hit'?'hit':kind;
    if(!this.buffers.has(kind)&&!this.fallbacks.has(base))this.fallbacks.set(base,fallback(this.context,base));
    const buffer=this.buffers.get(kind)??this.fallbacks.get(base);
    const source=this.context.createBufferSource(),gain=this.context.createGain(),at=this.context.currentTime;
    const rate=1+(this.random()-.5)*.045,duration=buffer.duration/rate;
    source.buffer=buffer;source.playbackRate.value=rate;
    const level=spec.level*Math.min(1.25,Math.max(.5,power));
    gain.gain.setValueAtTime(level,at);
    // The sample supplies the attack; this small end fade avoids clipped tails.
    gain.gain.setValueAtTime(level,at+Math.max(0,duration-.025));
    gain.gain.linearRampToValueAtTime(0,at+duration);
    source.connect(gain);gain.connect(this.output);
    const release=()=>{source.disconnect();gain.disconnect();this.voices.delete(source);};
    while(this.voices.size>=this.maxVoices){const [old,cleanup]=this.voices.entries().next().value;old.stop();cleanup();}
    this.voices.set(source,release);source.onended=release;source.start(at);source.stop(at+duration);
    return true;
  }
}
