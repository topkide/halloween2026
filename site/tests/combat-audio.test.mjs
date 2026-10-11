import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CombatAudio,COMBAT_SAMPLES} from '../combat-audio.mjs';

function audioContext(){
  const sources=[],gains=[],decoded=[];
  const context={sampleRate:44100,currentTime:2,
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,getChannelData:()=>data};},
    createBufferSource(){const source={buffer:null,playbackRate:{value:1},connect(){},disconnect(){this.disconnected=true;},start(at){this.started=at;},stop(at){this.stopped=at??true;}};sources.push(source);return source;},
    createGain(){const gain={gain:{value:1,values:[],setValueAtTime(v,t){this.value=v;this.values.push([v,t]);},linearRampToValueAtTime(v,t){this.values.push([v,t]);}},connect(){},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;},
    async decodeAudioData(data){const buffer={duration:.4,data};decoded.push(buffer);return buffer;}
  };
  return {context,sources,gains,decoded};
}

test('weapon samples are cached, distinct and ready before playback; gold hits reuse the hit download',async()=>{
  const fake=audioContext(),downloads=[];
  const audio=new CombatAudio(fake.context,{}, {random:()=>.5,fetcher:async url=>{downloads.push(url);return {ok:true,arrayBuffer:async()=>url};}});
  await audio.ready;assert.equal(downloads.length,3);assert.equal(fake.decoded.length,3);
  assert.equal(fake.sources.length,0); // Loading alone must never emit stale shots.
  audio.play('shot');audio.play('shotgun');audio.play('hit');audio.play('gold-hit');
  const [pistol,shotgun,hit,gold]=fake.sources;
  assert.equal(pistol.buffer.data,COMBAT_SAMPLES.shot.file);
  assert.equal(shotgun.buffer.data,COMBAT_SAMPLES.shotgun.file);
  assert.notEqual(pistol.buffer,shotgun.buffer);assert.equal(hit.buffer,gold.buffer);
  assert.equal(pistol.started,2);assert.equal(pistol.playbackRate.value,1);
  assert.ok(fake.gains[1].gain.values[0][0]>fake.gains[0].gain.values[0][0]);
  assert.equal(audio.play('wave'),false);assert.equal(fake.sources.length,4);
});

test('slow or failed downloads still give immediate finite gunshots without delayed playback',async()=>{
  const fake=audioContext();let finish;
  const loading=new Promise(resolve=>{finish=resolve;});
  const audio=new CombatAudio(fake.context,{}, {fetcher:()=>loading,random:()=>.5});
  for(const kind of ['shot','shotgun','hit'])assert.equal(audio.play(kind),true);
  for(const source of fake.sources){
    assert.equal(source.started,2);
    const samples=source.buffer.getChannelData(0);
    assert.ok(samples.some(v=>Math.abs(v)>.1));
    assert.ok(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
  }
  assert.ok(fake.sources[1].buffer.duration>fake.sources[0].buffer.duration);
  finish({ok:false});await audio.ready;assert.equal(fake.sources.length,3);
  audio.play('shot');assert.equal(fake.sources[0].buffer,fake.sources[3].buffer);
});

test('rapid fire bounds active voices, releases nodes, caps hit strength and fades every sample tail',async()=>{
  const fake=audioContext();
  const audio=new CombatAudio(fake.context,{}, {maxVoices:4,random:()=>.5,fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});
  await audio.ready;
  for(let i=0;i<40;i++)audio.play('hit',10);
  assert.equal(audio.voices.size,4);
  assert.equal(fake.sources[0].stopped,true);assert.equal(fake.sources[0].disconnected,true);assert.equal(fake.gains[0].disconnected,true);
  const tail=fake.gains.at(-1).gain.values;
  assert.equal(tail[0][0],COMBAT_SAMPLES.hit.level*1.25);
  assert.deepEqual(tail.at(-1),[0,2.4]);
  for(const source of fake.sources.slice(-4))source.onended();
  assert.equal(audio.voices.size,0);
});

test('deployed gunshot assets are short mono PCM clips with intact attacks and clean endings',()=>{
  const durations={shot:.34,shotgun:.58,hit:.16};
  const clips=[];
  for(const kind of ['shot','shotgun','hit']){
    const wav=fs.readFileSync(new URL('../'+COMBAT_SAMPLES[kind].file,import.meta.url));
    assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
    assert.equal(wav.readUInt16LE(20),1);assert.equal(wav.readUInt16LE(22),1);
    assert.equal(wav.readUInt32LE(24),44100);assert.equal(wav.readUInt16LE(34),16);
    assert.ok(Math.abs(wav.readUInt32LE(40)/88200-durations[kind])<.001);
    const data=wav.subarray(44),values=[];
    for(let i=0;i<data.length;i+=2)values.push(data.readInt16LE(i));
    assert.ok(Math.max(...values.map(Math.abs))<30000);
    assert.ok(values.slice(0,1323).some(v=>Math.abs(v)>10000));
    assert.equal(values.at(-1),0);clips.push(wav);
  }
  assert.notDeepEqual(clips[0],clips[1]);
});
