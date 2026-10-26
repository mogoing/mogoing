/* eco.js — 省流模式核心：浏览器实时转码管道
 * HLS(m3u8) → TS demux → AES-128 解密 → VideoDecoder
 * → 720p 缩放+增强 → VideoEncoder(VP9 1500kbps) → webm-muxer → MSE → video
 * 音频：TS 内 AAC(ADTS) → AudioDecoder → Opus → muxer
 * 全局对象: window.Eco
 */
(function(){
'use strict';

function fetchBuf(url){
  return fetch(url).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.arrayBuffer();
  });
}
function concatArr(arr){
  var n=arr.filter(function(x){return x&&x.length>0;});
  if(n.length===0) return new Uint8Array(0);
  var total=0; for(var i=0;i<n.length;i++) total+=n[i].length;
  var r=new Uint8Array(total),p=0;
  for(var j=0;j<n.length;j++){r.set(n[j],p);p+=n[j].length;}
  return r;
}

// ---------- m3u8 解析 ----------
function parseM3U8(text){
  var segs=[], key=null, lines=text.split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var l=lines[i].trim();
    if(l.indexOf('#EXT-X-KEY:')===0){
      var m=l.match(/METHOD=([^,]+)/), u=l.match(/URI="([^"]+)"/), iv=l.match(/IV=(0x[0-9A-Fa-f]+)/);
      key={method:m?m[1]:'NONE', uri:u?u[1]:null, iv:iv?iv[1]:null};
    }else if(l && l.charAt(0)!=='#'){
      segs.push({uri:l});
    }
  }
  return {segs:segs, key:key};
}
function hexToBuf(hex){
  if(!hex) return null;
  hex=hex.replace(/^0x/i,'');
  var out=new Uint8Array(hex.length/2);
  for(var i=0;i<out.length;i++) out[i]=parseInt(hex.substr(i*2,2),16);
  return out;
}
function decryptAES(data,keyBuf,ivBuf){
  return crypto.subtle.importKey('raw',keyBuf,{name:'AES-CBC'},false,['decrypt'])
    .then(function(k){ return crypto.subtle.decrypt({name:'AES-CBC',iv:ivBuf},k,data); })
    .then(function(b){ return new Uint8Array(b); });
}

// ---------- TS demux ----------
/* 逐包处理，PES 跨包累积 */
function tsDemux(ts){
  var vAcc=[], aAcc=[];
  var pmtPid=-1, vPid=-1, aPid=-1;
  var inVes=false, inAes=false;
  for(var off=0; off+188<=ts.length; off+=188){
    if(ts[off]!==0x47) continue;
    var hdr=(ts[off+1]<<8)|ts[off+2];
    var pid=hdr&0x1FFF;
    var afc=(ts[off+3]>>4)&0x3;
    var ptr=off+4;
    if(afc===2){ ptr+=ts[off+4]+1; }
    else if(afc===3){ ptr+=ts[off+4]+1; }
    if(ptr>=off+188) continue;
    var payload=ts.subarray(ptr,off+188);
    var startCode=(payload[0]===0&&payload[1]===0&&payload[2]===1);
    if(pid===0){
      var s=skipPointer(payload);
      if(s&&s.length>=12){
        if(pmtPid<0){
          var patEnd=3+(((s[1]&0x0F)<<8)|s[2]);
          for(var i=8;i+4<=s.length&&i+4<=patEnd;i+=4){
            var pnum=((s[i]&0xFF)<<8)|s[i+1];
            if(pnum!==0&&pnum!==0xFFFF){ pmtPid=((s[i+2]&0x1F)<<8)|s[i+3]; break; }
          }
        }
      }
    }else if(pid===pmtPid){
      var s2=skipPointer(payload);
      if(s2&&s2.length>=12&&vPid<0&&aPid<0){
        var secLen2=(((s2[1]&0x0F)<<8)|s2[2]);
        var pos=12+(((s2[10]&0x0F)<<8)|s2[11]);
        var pmtEnd=3+secLen2;
        while(pos+5<=s2.length&&pos+5<=pmtEnd){
          var st=s2[pos];
          var spid=((s2[pos+1]&0x1F)<<8)|s2[pos+2];
          var epl=((s2[pos+3]&0x0F)<<8)|s2[pos+4];
          if((st===0x1B||st===0x24)&&vPid<0) vPid=spid;
          else if(st===0x0F&&aPid<0) aPid=spid;
          pos+=5+epl;
        }
      }
    }else if(pid===vPid){
      if(startCode){
        // PES 头: 00 00 01 [stream] [len] [flags] [hdrlen]
        var hlen=payload[8];
        var dataStart=9+hlen;
        if(dataStart<payload.length){ vAcc.push(payload.subarray(dataStart)); inVes=true; }
      }else if(inVes){
        vAcc.push(payload);
      }
    }else if(pid===aPid){
      if(startCode){
        var hlen2=payload[8];
        var ds2=9+hlen2;
        if(ds2<payload.length){ aAcc.push(payload.subarray(ds2)); inAes=true; }
      }else if(inAes){
        aAcc.push(payload);
      }
    }
  }
  var v=concatArr(vAcc), a=concatArr(aAcc);
  return {v:cleanAnnexb(v), a:cutADTS(a)};
}
function skipPointer(p){
  if(p.length>0 && p[0]===0) return p.subarray(1);
  return p;
}
function cleanAnnexb(b){
  // 归一化 start code 为 4 字节前缀，丢弃前导垃圾
  var nals=[], i=0;
  while(i<b.length){
    var sc3=(b[i]===0&&b[i+1]===0&&b[i+2]===1);
    var sc4=(b[i]===0&&b[i+1]===0&&b[i+2]===0&&b[i+3]===1);
    if(!sc3&&!sc4){ i++; continue; }
    var st=i+(sc4?4:3), j=st;
    while(j<b.length){
      var c3=(b[j]===0&&b[j+1]===0&&b[j+2]===1);
      var c4=(b[j]===0&&b[j+1]===0&&b[j+2]===0&&b[j+3]===1);
      if(c3||c4) break;
      j++;
    }
    nals.push(b.subarray(st,j));
    i=j;
  }
  var total=0; for(var k=0;k<nals.length;k++) total+=nals[k].length+4;
  var r=new Uint8Array(total),p=0;
  for(var m=0;m<nals.length;m++){
    r[p]=0;r[p+1]=0;r[p+2]=0;r[p+3]=1;
    r.set(nals[m],p+4);
    p+=nals[m].length+4;
  }
  return r;
}
/* 切 NAL 帧：SPS/PPS/SEI 归入下一 slice 帧；IDR→key */
function splitFrames(v){
  var frames=[], i=0, cur=[];
  while(i<v.length){
    var sc3=(v[i]===0&&v[i+1]===0&&v[i+2]===1);
    var sc4=(v[i]===0&&v[i+1]===0&&v[i+2]===0&&v[i+3]===1);
    if(!sc3&&!sc4){ i++; continue; }
    var st=i+(sc4?4:3), j=st;
    while(j<v.length){
      var c3=(v[j]===0&&v[j+1]===0&&v[j+2]===1);
      var c4=(v[j]===0&&v[j+1]===0&&v[j+2]===0&&v[j+3]===1);
      if(c3||c4) break;
      j++;
    }
    var nal=v.subarray(st,j);
    var type=nal[0]&0x1F;
    if(type===5||type===1){ // IDR / slice
      cur.push(nal);
      frames.push({data:concatArr(cur), key:(type===5)});
      cur=[];
    }else{
      cur.push(nal); // SPS/PPS/SEI/AUD
    }
    i=j;
  }
  if(cur.length) frames.push({data:concatArr(cur), key:false});
  return frames;
}
function cutADTS(b){
  var frames=[],i=0;
  while(i<b.length-6){
    if(b[i]===0xFF && (b[i+1]&0xF0)===0xF0){
      var fl=(b[i+3]&0x03)<<11 | b[i+4]<<3 | ((b[i+5]>>5)&0x07);
      if(fl<7||i+fl>b.length){i++;continue;}
      frames.push(b.subarray(i,i+fl));
      i+=fl;
    }else i++;
  }
  return concatArr(frames);
}
/* 从 ADTS 帧头解析信息 + 生成 AudioSpecificConfig */
function adtsInfo(b){
  for(var i=0;i<b.length-6;i++){
    if(b[i]===0xFF && (b[i+1]&0xF0)===0xF0){
      var sfIdx=(b[i+2]>>2)&0x0F;
      var chan=((b[i+2]&0x01)<<2)|((b[i+3]>>6)&0x03);
      var rates=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
      var sampleRate=rates[sfIdx]||44100;
      // AudioSpecificConfig: AAC-LC(obj 2)
      var asc=new Uint8Array([((2)<<3)|(sfIdx>>1), ((sfIdx&1)<<7)|((chan||2)<<3)]);
      return {sampleRate:sampleRate, channels:chan||2, asc:asc.buffer, sfIdx:sfIdx};
    }
  }
  return {sampleRate:44100,channels:2,asc:new Uint8Array([0x11,0x90]).buffer,sfIdx:4};
}

// ---------- 主管道 ----------
function Eco(){
  this.running=false;
  this.vDec=null; this.vEnc=null;
  this.aDec=null; this.aEnc=null;
  this.muxer=null; this.ms=null; this.sb=null;
  this.frameIndex=0; this.audioFrames=0;
  this.audioRaw=new Uint8Array(0);
  this.aInfo=null;
  this.onstat=null; this.onerror=null;
  this.onend=null;
}

Eco.isSupported=function(){
  return !!(window.VideoEncoder&&window.VideoDecoder&&window.AudioEncoder&&window.AudioDecoder
    && window.MediaSource && window.MediaSource.isTypeSupported('video/webm;codecs="vp9"'));
};

Eco.prototype.start=function(m3u8Url,video){
  var self=this;
  if(this.running) return Promise.reject(new Error('already running'));
  this.running=true;
  this.m3u8Url=m3u8Url; this.video=video;
  this.ms=new MediaSource();
  video.src=URL.createObjectURL(this.ms);
  var msReady=new Promise(function(res,rej){
    self.ms.addEventListener('sourceopen',function(){
      try{
        self.sb=self.ms.addSourceBuffer('video/webm;codecs="vp9,opus"');
        self.sb.mode='segments';
        res();
      }catch(e){ rej(e); }
    });
    self.ms.addEventListener('error',function(){ self.fail('MSE error'); });
  });
  // 解码/编码器
  this.vDec=new VideoDecoder({
    output:function(f){ self.onVideoFrame(f); },
    error:function(e){ self.fail('vDec: '+e.message); }
  });
  try{ this.vDec.configure({codec:'avc1.64001f'}); }catch(e){ this.fail('vDec cfg: '+e.message); }
  this.vEnc=new VideoEncoder({
    output:function(c,m){ self.onVideoEncoded(c,m); },
    error:function(e){ self.fail('vEnc: '+e.message); }
  });
  this.vEnc.configure({codec:'vp09.00.10.08',width:1280,height:720,bitrate:1500*1000,framerate:30});
  this.aDec=new AudioDecoder({
    output:function(ad){ self.onAudioFrame(ad); },
    error:function(e){ self.fail('aDec: '+e.message); }
  });
  this.aEnc=new AudioEncoder({
    output:function(c,m){ self.onAudioEncoded(c,m); },
    error:function(e){ self.fail('aEnc: '+e.message); }
  });
  return msReady.then(function(){ return self.loadAndLoop(); })
    .catch(function(e){ self.running=false; if(self.onerror) self.onerror(e); throw e; });
};

Eco.prototype.stop=function(){
  this.running=false;
  try{ if(this.vEnc) this.vEnc.close(); }catch(e){}
  try{ if(this.vDec) this.vDec.close(); }catch(e){}
  try{ if(this.aEnc) this.aEnc.close(); }catch(e){}
  try{ if(this.aDec) this.aDec.close(); }catch(e){}
  this.vEnc=this.vDec=this.aEnc=this.aDec=null;
  try{ if(this.ms&&this.ms.readyState==='open') this.ms.endOfStream(); }catch(e){}
  this.muxer=null; this.sb=null; this.ms=null;
  this.audioRaw=new Uint8Array(0);
};

Eco.prototype.fail=function(msg){
  if(this.onerror && this.running){ this.running=false; this.onerror(new Error(msg)); }
};

Eco.prototype.loadAndLoop=function(){
  var self=this;
  return fetchBuf(this.m3u8Url).then(function(buf){
    var pl=parseM3U8(new TextDecoder().decode(buf));
    if(!pl.segs.length) throw new Error('no segments');
    self.pl=pl;
    if(pl.key && pl.key.method==='AES-128'){
      return fetchBuf(pl.key.uri).then(function(kb){
        self.key={kb:new Uint8Array(kb), iv:hexToBuf(pl.key.iv)||new Uint8Array(16)};
      });
    }
  }).then(function(){
    self.curSeg=0;
    self.pullLoop();
  });
};

Eco.prototype.pullLoop=function(){
  var self=this;
  if(!self.running) return;
  var seg=self.pl.segs[self.curSeg];
  if(!seg){ self.finish(); return; }
  var t0=performance.now();
  fetchBuf(seg.uri).then(function(buf){
    var data=new Uint8Array(buf);
    var p= self.key ? decryptAES(data,self.key.kb,self.key.iv) : Promise.resolve(data);
    return p.then(function(d){ self.processSegment(d); });
  }).then(function(){
    if(self.onstat) self.onstat({seg:self.curSeg+1,total:self.pl.segs.length,ms:Math.round(performance.now()-t0)});
    self.curSeg++;
    self.pullLoop();
  }).catch(function(e){
    self.fail('seg '+(self.curSeg+1)+': '+e.message);
  });
};

Eco.prototype.processSegment=function(tsData){
  var self=this;
  var dem=tsDemux(tsData);
  if(dem.a.length>0 && self.aEnc.state==='unconfigured'){
    self.aInfo=adtsInfo(dem.a);
    try{
      self.aDec.configure({codec:'mp4a.40.2',sampleRate:self.aInfo.sampleRate,numberOfChannels:self.aInfo.channels,description:self.aInfo.asc});
      self.aEnc.configure({codec:'opus',sampleRate:48000,numberOfChannels:self.aInfo.channels,bitrate:96*1000});
    }catch(e){ self.fail('audio cfg: '+e.message); }
  }
  // 视频：切帧喂解码器
  var frames=splitFrames(dem.v);
  for(var i=0;i<frames.length;i++){
    var f=frames[i];
    var ts=self.frameIndex*1000000/30;
    try{
      self.vDec.decode(new EncodedVideoChunk({type:f.key?'key':'delta',timestamp:ts,duration:1000000/30,data:f.data}));
    }catch(e){ self.fail('vDec.decode: '+e.message); }
    self.frameIndex++;
  }
  // 音频：去 ADTS 头喂解码器（raw AAC）
  self.audioRaw=concatArr([self.audioRaw,dem.a]);
  self.drainAudio();
};

Eco.prototype.drainAudio=function(){
  var self=this;
  if(!self.aInfo){ return; }
  var raw=self.audioRaw, i=0, consumed=0;
  while(i+7<=raw.length){
    if(raw[i]===0xFF && (raw[i+1]&0xF0)===0xF0){
      var fl=(raw[i+3]&0x03)<<11 | raw[i+4]<<3 | ((raw[i+5]>>5)&0x07);
      if(fl<7||i+fl>raw.length) break;
      var hdrLen=(raw[i+1]&0x01)?7:9;
      var sr=self.aInfo.sampleRate;
      self.aDec.decode(new EncodedAudioChunk({
        type:'key',
        timestamp:self.audioFrames*1024/sr*1000000,
        duration:1024/sr*1000000,
        data:raw.subarray(i+hdrLen,i+fl) // raw AAC
      }));
      self.audioFrames++;
      i+=fl; consumed=i;
    }else i++;
  }
  self.audioRaw=raw.subarray(consumed);
};

Eco.prototype.onVideoFrame=function(frame){
  var self=this;
  if(!self.running || !self.vEnc){ frame.close(); return; }
  var c=self._cv;
  if(!c){
    c=self._cv=document.createElement('canvas');
    c.width=1280; c.height=720;
    self._ctx=c.getContext('2d');
  }
  var ctx=self._ctx;
  try{ ctx.filter='contrast(1.06) saturate(1.08)'; }catch(e){}
  ctx.drawImage(frame,0,0,1280,720);
  try{ ctx.filter='none'; }catch(e){}
  var ts=frame.timestamp;
  frame.close();
  var nf=new VideoFrame(c,{timestamp:ts,duration:1000000/30});
  self.vEnc.encode(nf,{keyFrame:(self.frameIndex%30===0)});
  nf.close();
};

Eco.prototype.onVideoEncoded=function(chunk,meta){
  var self=this;
  if(!self.muxer){
    try{
      self.muxer=new WebMMuxer({
        target:'media-source',
        video:{codec:'V_VP9',width:1280,height:720,frameRate:30},
        audio:{codec:'A_OPUS',sampleRate:48000,numberOfChannels:(self.aInfo?self.aInfo.channels:2)},
        firstTimestampBehavior:'offset'
      });
      self.muxer.onReady=function(e){ try{ self.sb.appendBuffer(e); }catch(err){} };
      self.video.play().catch(function(){});
    }catch(e){ self.fail('muxer: '+e.message); return; }
  }
  self.muxer.addVideoChunk(chunk,meta);
};

Eco.prototype.onAudioFrame=function(ad){
  var self=this;
  if(!self.running){ ad.close(); return; }
  try{ self.aEnc.encode(ad); }catch(e){ self.fail('aEnc.encode: '+e.message); }
  ad.close();
};

Eco.prototype.onAudioEncoded=function(chunk,meta){
  var self=this;
  if(self.muxer) self.muxer.addAudioChunk(chunk,meta);
};

Eco.prototype.finish=function(){
  var self=this;
  self.running=false;
  var pending=2, done=false;
  var fin=function(){ if(--pending<=0){ try{ if(self.ms&&self.ms.readyState==='open') self.ms.endOfStream(); }catch(e){} if(self.onend) self.onend(); } };
  if(self.vEnc && self.vEnc.state==='configured') self.vEnc.flush().then(fin,fin); else fin();
  if(self.aEnc && self.aEnc.state==='configured') self.aEnc.flush().then(fin,fin); else fin();
};

window.Eco=Eco;
})();
