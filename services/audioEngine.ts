import { AudioSettings } from '../types';

/**
 * Helper: Convert AudioBuffer to Real MP3 Blob using lamejs
 */
function audioBufferToMp3(buffer: AudioBuffer): Blob {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const kbps = 128; // Standard MP3 quality
    
    // Access global lamejs (loaded via script tag in index.html)
    const lamejs = (window as any).lamejs;
    if (!lamejs) {
        throw new Error("Biblioteca de codificação MP3 não carregada. Verifique sua conexão com a internet.");
    }

    // Safe access to Mp3Encoder constructor
    const Mp3Encoder = lamejs.Mp3Encoder;
    if (!Mp3Encoder) {
         throw new Error("Erro interno na biblioteca MP3 (Mp3Encoder não encontrado).");
    }

    const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
    
    const mp3Data = [];
    
    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    
    const length = left.length;
    const leftInt16 = new Int16Array(length);
    const rightInt16 = new Int16Array(length);
    
    // Convert Float32 to Int16 (required for lamejs)
    for (let i = 0; i < length; i++) {
        // Clamp values between -1 and 1
        let l = left[i];
        let r = right[i];
        
        l = l < -1 ? -1 : l > 1 ? 1 : l;
        r = r < -1 ? -1 : r > 1 ? 1 : r;
        
        // Scale to 16-bit signed integer
        leftInt16[i] = l < 0 ? l * 32768 : l * 32767;
        rightInt16[i] = r < 0 ? r * 32768 : r * 32767;
    }
    
    // Encode in chunks to prevent stack overflow on large files
    const sampleBlockSize = 11520; // 10 mp3 frames approx
    
    for (let i = 0; i < length; i += sampleBlockSize) {
        const end = Math.min(i + sampleBlockSize, length);
        const leftChunk = leftInt16.subarray(i, end);
        const rightChunk = rightInt16.subarray(i, end);
        
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    
    // Flush the last remaining data
    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) {
        mp3Data.push(endBuf);
    }
    
    return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Improved Jungle Pitch Shifter Implementation
 * Uses dual-delay line with synchronized cross-fading to eliminate clicks/artifacts.
 */
class JunglePitchShifter {
    private context: BaseAudioContext;
    public input: GainNode;
    public output: GainNode;
    
    private delay1: DelayNode;
    private delay2: DelayNode;
    
    private fade1: GainNode;
    private fade2: GainNode;
    
    private mod1: GainNode;
    private mod2: GainNode;
    
    private bufferTime: number = 0.100; // Increased to 100ms for smoother grains (less tremolo)
    
    // LFO Sources
    private fadeBuffer: AudioBuffer;
    private delayModBuffer: AudioBuffer;
    
    private lfoNode1: AudioBufferSourceNode | null = null;
    private lfoNode2: AudioBufferSourceNode | null = null;
    
    private isConnected: boolean = false;

    constructor(context: BaseAudioContext) {
        this.context = context;
        
        // Create Buffers for LFO (Sawtooth for delay, Sine for gain)
        this.fadeBuffer = this.createFadeBuffer(this.bufferTime, context.sampleRate);
        this.delayModBuffer = this.createDelayBuffer(this.bufferTime, context.sampleRate);

        // Input/Output
        this.input = context.createGain();
        this.output = context.createGain();

        // 1. Delays
        this.delay1 = context.createDelay(this.bufferTime * 2);
        this.delay2 = context.createDelay(this.bufferTime * 2);
        
        // 2. Modulation Gains (Control delay time depth)
        this.mod1 = context.createGain();
        this.mod2 = context.createGain();
        
        // 3. Fade Gains (Control volume for crossfading)
        this.fade1 = context.createGain();
        this.fade2 = context.createGain();
        
        // Wiring Audio Path
        // Input -> Delays
        this.input.connect(this.delay1);
        this.input.connect(this.delay2);

        // Delays -> Fades
        this.delay1.connect(this.fade1);
        this.delay2.connect(this.fade2);

        // Fades -> Output
        this.fade1.connect(this.output);
        this.fade2.connect(this.output);
        
        // Modulation Wiring
        // mod -> delay.delayTime
        this.mod1.connect(this.delay1.delayTime);
        this.mod2.connect(this.delay2.delayTime);
        
        // Defaults
        this.delay1.delayTime.value = this.bufferTime / 2;
        this.delay2.delayTime.value = this.bufferTime / 2;
        
        this.isConnected = true;
    }

    private createFadeBuffer(time: number, sampleRate: number): AudioBuffer {
        const length = time * sampleRate;
        const buffer = this.context.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Smoother Sine Window for Crossfading
        // Reduces the "tremolo" effect compared to linear triangle
        for (let i = 0; i < length; i++) {
            let x = i / length;
            // Half-sine wave: 0 -> 1 -> 0
            data[i] = Math.sin(Math.PI * x);
        }
        return buffer;
    }

    private createDelayBuffer(time: number, sampleRate: number): AudioBuffer {
        const length = time * sampleRate;
        const buffer = this.context.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Sawtooth (Falling): 1 -> 0
        // This simulates the tape head moving closer/further
        for (let i = 0; i < length; i++) {
            data[i] = 1 - (i / length);
        }
        return buffer;
    }

    public setPitch(semitones: number) {
        // Stop previous LFOs if running to reset phase
        if (this.lfoNode1) { try { this.lfoNode1.stop(); } catch(e){} }
        if (this.lfoNode2) { try { this.lfoNode2.stop(); } catch(e){} }

        if (Math.abs(semitones) < 0.01) {
            // Bypass logic: No modulation, just pass through one line
            this.fade1.gain.value = 1;
            this.fade2.gain.value = 0;
            this.mod1.gain.value = 0;
            this.mod2.gain.value = 0;
            this.delay1.delayTime.value = 0.05; // Fixed small latency
            return;
        }

        // Calculate Modulation Depth (Fixed Inversion Logic)
        const pitchRatio = Math.pow(2, semitones / 12);
        const modGainValue = (pitchRatio - 1) * this.bufferTime;

        this.mod1.gain.value = modGainValue;
        this.mod2.gain.value = modGainValue;

        // Reset Delay Centers
        this.delay1.delayTime.value = this.bufferTime;
        this.delay2.delayTime.value = this.bufferTime;

        // Start LFOs (BufferSources)
        this.lfoNode1 = this.context.createBufferSource();
        this.lfoNode1.buffer = this.delayModBuffer;
        this.lfoNode1.loop = true;

        this.lfoNode2 = this.context.createBufferSource();
        this.lfoNode2.buffer = this.delayModBuffer;
        this.lfoNode2.loop = true;

        // Connect LFOs to Delay Modulation
        this.lfoNode1.connect(this.mod1);
        this.lfoNode2.connect(this.mod2);

        // Connect LFOs to Fade Gains
        const fadeLfo1 = this.context.createBufferSource();
        fadeLfo1.buffer = this.fadeBuffer;
        fadeLfo1.loop = true;
        
        const fadeLfo2 = this.context.createBufferSource();
        fadeLfo2.buffer = this.fadeBuffer;
        fadeLfo2.loop = true;

        fadeLfo1.connect(this.fade1.gain);
        fadeLfo2.connect(this.fade2.gain);

        const startTime = this.context.currentTime;
        
        // Start everything
        // Crucial: LFO2 starts at 50% offset (bufferTime / 2)
        this.lfoNode1.start(startTime);
        fadeLfo1.start(startTime);
        
        this.lfoNode2.start(startTime + (this.bufferTime / 2));
        fadeLfo2.start(startTime + (this.bufferTime / 2));
        
        // Keep references to stop them later
        const oldStop1 = this.lfoNode1.stop.bind(this.lfoNode1);
        this.lfoNode1.stop = () => { oldStop1(); try { fadeLfo1.stop(); } catch(e){} };
        
        const oldStop2 = this.lfoNode2.stop.bind(this.lfoNode2);
        this.lfoNode2.stop = () => { oldStop2(); try { fadeLfo2.stop(); } catch(e){} };
    }
    
    public disconnect() {
         this.input.disconnect();
         this.output.disconnect();
         
         this.lfoNode1?.stop();
         this.lfoNode2?.stop();
         
         this.mod1.disconnect();
         this.mod2.disconnect();
         this.fade1.disconnect();
         this.fade2.disconnect();
    }
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  
  // Effects
  private pitchShifter: JunglePitchShifter | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  
  // EQ Nodes
  private eqLowNode: BiquadFilterNode | null = null;
  private eqMidNode: BiquadFilterNode | null = null;
  private eqHighNode: BiquadFilterNode | null = null;

  // Vocal Removal Nodes
  private lowPassNode: BiquadFilterNode | null = null;
  private highPassNode: BiquadFilterNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  private artifactLpfNode: BiquadFilterNode | null = null;
  
  // Phase Cancellation Specifics
  private phaseInverterLeft: GainNode | null = null;
  private phaseInverterRight: GainNode | null = null;
  private sideGain: GainNode | null = null;
  private bypassSplitter: ChannelSplitterNode | null = null;
  
  private startTime: number = 0;
  private pausedAt: number = 0;
  private isPlaying: boolean = false;
  private currentSpeed: number = 1.0;

  constructor() {
     // Lazy initialization in getContext()
  }

  public getContext(): AudioContext {
    if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            this.audioContext = new AudioContext();
        } else {
             throw new Error("Seu navegador não suporta Web Audio API.");
        }
    }
    return this.audioContext;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public async loadFile(file: File): Promise<number> {
    const ctx = this.getContext();

    this.stop();
    this.pausedAt = 0;
    this.startTime = 0;
    this.isPlaying = false;
    this.currentSpeed = 1.0;

    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return this.audioBuffer.duration;
  }

  public async loadUrl(url: string): Promise<number> {
    const ctx = this.getContext();

    this.stop();
    this.pausedAt = 0;
    this.startTime = 0;
    this.isPlaying = false;
    this.currentSpeed = 1.0;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        this.audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        return this.audioBuffer.duration;
    } catch (error) {
        console.error("Error loading URL:", error);
        throw error;
    }
  }

  /**
   * Export Logic
   * Must mirror createProcessingChain logic EXACTLY.
   */
  public async exportAudio(settings: AudioSettings): Promise<Blob | null> {
      if (!this.audioBuffer) return null;

      const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!OfflineContextClass) {
          throw new Error("Seu navegador não suporta exportação de áudio (OfflineAudioContext).");
      }

      // Calculate output length based on speed
      const newDuration = this.audioBuffer.duration / settings.speed;
      const lengthFrames = Math.ceil(newDuration * this.audioBuffer.sampleRate);

      const offlineCtx = new OfflineContextClass(
          2, 
          lengthFrames,
          this.audioBuffer.sampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = this.audioBuffer;
      source.playbackRate.value = settings.speed;

      // Pitch Shifter with Speed Compensation
      const pitchShifter = new JunglePitchShifter(offlineCtx);
      // Speed change naturally shifts pitch by: 12 * log2(speed)
      // To preserve pitch (Time Stretch), we subtract this natural shift.
      const naturalPitchShift = 12 * Math.log2(settings.speed);
      const userDetuneSemis = settings.detune / 100;
      const finalPitchShift = userDetuneSemis - naturalPitchShift;
      
      pitchShifter.setPitch(finalPitchShift);

      source.connect(pitchShifter.input);
      let nextSource: AudioNode = pitchShifter.output;

      const mainMerger = offlineCtx.createChannelMerger(2);

      if (settings.vocalRemoval) {
          const CROSSOVER_FREQ = 200; 

          // 1. Filters
          const lowPass = offlineCtx.createBiquadFilter();
          lowPass.type = 'lowpass';
          lowPass.frequency.value = CROSSOVER_FREQ;
          lowPass.Q.value = 0.707;

          const highPass = offlineCtx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = CROSSOVER_FREQ;
          highPass.Q.value = 0.707;

          // Connect Source to Filters
          nextSource.connect(lowPass);
          nextSource.connect(highPass);

          // 2. Bass Path (Mono downmix usually, we route to both outputs)
          lowPass.connect(mainMerger, 0, 0); 
          lowPass.connect(mainMerger, 0, 1);

          // 3. High Path (O.O.P.S)
          const highSplitter = offlineCtx.createChannelSplitter(2);
          highPass.connect(highSplitter);

          const leftGain = offlineCtx.createGain(); // L - R
          const rightGain = offlineCtx.createGain(); // R - L
          
          // Calculate L - R
          highSplitter.connect(leftGain, 0); // +L
          const invR = offlineCtx.createGain();
          invR.gain.value = -1;
          highSplitter.connect(invR, 1); // R
          invR.connect(leftGain); // -R

          // Calculate R - L = -(L - R)
          const invLLR = offlineCtx.createGain();
          invLLR.gain.value = -1;
          leftGain.connect(invLLR);
          invLLR.connect(rightGain);

          // Phase Artifact Smoothing
          const artifactLpf = offlineCtx.createBiquadFilter();
          artifactLpf.type = 'lowpass';
          artifactLpf.frequency.value = 12000; 
          artifactLpf.Q.value = 0.5;
          
          leftGain.connect(artifactLpf);

          // Route to sides
          const sideL = offlineCtx.createGain();
          sideL.gain.value = 1.8; 
          artifactLpf.connect(sideL); 

          const sideR = offlineCtx.createGain();
          sideR.gain.value = 1.8;
          
          const invFilter = offlineCtx.createGain();
          invFilter.gain.value = -1;
          artifactLpf.connect(invFilter);
          invFilter.connect(sideR);

          sideL.connect(mainMerger, 0, 0); 
          sideR.connect(mainMerger, 0, 1); 

      } else {
          // Bypass
          const bypassSplitter = offlineCtx.createChannelSplitter(2);
          nextSource.connect(bypassSplitter);
          bypassSplitter.connect(mainMerger, 0, 0); // L -> L
          bypassSplitter.connect(mainMerger, 1, 1); // R -> R
      }

      // EQ Chain
      const eqLow = offlineCtx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 100;
      eqLow.gain.value = settings.eqLow;

      const eqMid = offlineCtx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1;
      eqMid.gain.value = settings.eqMid;

      const eqHigh = offlineCtx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 8000;
      eqHigh.gain.value = settings.eqHigh;

      const masterGain = offlineCtx.createGain();
      masterGain.gain.value = settings.volume;
      
      // Wiring
      mainMerger.connect(eqLow);
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(masterGain);
      
      masterGain.connect(offlineCtx.destination);

      source.start();
      const renderedBuffer = await offlineCtx.startRendering();
      return audioBufferToMp3(renderedBuffer);
  }

  private createProcessingChain(settings: AudioSettings) {
    const ctx = this.getContext();
    if (!this.audioBuffer) return;

    this.disconnect();

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.currentSpeed = settings.speed;
    this.sourceNode.playbackRate.value = this.currentSpeed;
    this.sourceNode.detune.value = 0; 

    this.pitchShifter = new JunglePitchShifter(ctx);
    
    // Pitch Compensation Logic
    const naturalPitchShift = 12 * Math.log2(settings.speed);
    const userDetuneSemis = settings.detune / 100;
    const finalPitchShift = userDetuneSemis - naturalPitchShift;
    
    this.pitchShifter.setPitch(finalPitchShift); 
    
    this.sourceNode.connect(this.pitchShifter.input);
    let nextSource: AudioNode = this.pitchShifter.output;

    // Final recombination point
    this.mergerNode = ctx.createChannelMerger(2);

    if (settings.vocalRemoval) {
        // Improved Algorithm: "Bass-Preserving OOPS" + Artifact Smoothing
        const CROSSOVER_FREQ = 200;

        // 1. Frequency Split
        this.lowPassNode = ctx.createBiquadFilter();
        this.lowPassNode.type = 'lowpass';
        this.lowPassNode.frequency.value = CROSSOVER_FREQ;
        this.lowPassNode.Q.value = 0.707;

        this.highPassNode = ctx.createBiquadFilter();
        this.highPassNode.type = 'highpass';
        this.highPassNode.frequency.value = CROSSOVER_FREQ;
        this.highPassNode.Q.value = 0.707;

        nextSource.connect(this.lowPassNode);
        nextSource.connect(this.highPassNode);

        // 2. Bass Path
        this.lowPassNode.connect(this.mergerNode, 0, 0);
        this.lowPassNode.connect(this.mergerNode, 0, 1);

        // 3. High/Mid Path
        this.splitterNode = ctx.createChannelSplitter(2);
        this.highPassNode.connect(this.splitterNode);

        const L = ctx.createGain(); 
        const negR = ctx.createGain(); 
        negR.gain.value = -1;

        const sideSignal = ctx.createGain();
        this.splitterNode.connect(L, 0);
        L.connect(sideSignal);
        this.splitterNode.connect(negR, 1);
        negR.connect(sideSignal);

        // 4. Artifact Smoothing (New)
        this.artifactLpfNode = ctx.createBiquadFilter();
        this.artifactLpfNode.type = 'lowpass';
        this.artifactLpfNode.frequency.value = 12000; 
        this.artifactLpfNode.Q.value = 0.5;

        sideSignal.connect(this.artifactLpfNode);

        // 5. Gain Compensation
        this.sideGain = ctx.createGain();
        this.sideGain.gain.value = 1.8; 
        this.artifactLpfNode.connect(this.sideGain);

        this.sideGain.connect(this.mergerNode, 0, 0);

        const inverter = ctx.createGain();
        inverter.gain.value = -1;
        this.sideGain.connect(inverter);
        inverter.connect(this.mergerNode, 0, 1);

        this.phaseInverterLeft = L;
        this.phaseInverterRight = negR;

    } else {
        // Bypass Mode
        this.bypassSplitter = ctx.createChannelSplitter(2);
        nextSource.connect(this.bypassSplitter);
        this.bypassSplitter.connect(this.mergerNode, 0, 0);
        this.bypassSplitter.connect(this.mergerNode, 1, 1);
    }

    // EQ Initialization
    this.eqLowNode = ctx.createBiquadFilter();
    this.eqLowNode.type = 'lowshelf';
    this.eqLowNode.frequency.value = 100;
    this.eqLowNode.gain.value = settings.eqLow;

    this.eqMidNode = ctx.createBiquadFilter();
    this.eqMidNode.type = 'peaking';
    this.eqMidNode.frequency.value = 1000;
    this.eqMidNode.Q.value = 1;
    this.eqMidNode.gain.value = settings.eqMid;

    this.eqHighNode = ctx.createBiquadFilter();
    this.eqHighNode.type = 'highshelf';
    this.eqHighNode.frequency.value = 8000;
    this.eqHighNode.gain.value = settings.eqHigh;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = settings.volume;

    // Connect: Merger -> EQ Low -> EQ Mid -> EQ High -> Master Gain
    this.mergerNode.connect(this.eqLowNode);
    this.eqLowNode.connect(this.eqMidNode);
    this.eqMidNode.connect(this.eqHighNode);
    this.eqHighNode.connect(this.masterGain);

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);
  }

  public play(settings: AudioSettings, offset?: number) {
    const ctx = this.getContext();
    if (!this.audioBuffer) return;
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    this.createProcessingChain(settings);

    // Calculate time based on speed
    const startOffset = offset !== undefined ? offset : this.pausedAt;
    this.startTime = ctx.currentTime - (startOffset / this.currentSpeed);
    
    if (this.sourceNode) {
        this.sourceNode.start(0, startOffset);
        this.isPlaying = true;
    }
  }

  public stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) { }
      this.isPlaying = false;
      if (this.audioContext) {
        // Calculate where we paused, accounting for speed
        const elapsedRealTime = this.audioContext.currentTime - this.startTime;
        this.pausedAt = elapsedRealTime * this.currentSpeed;
      }
    }
  }

  public seek(time: number, settings: AudioSettings) {
      if (this.isPlaying) {
          this.stop();
          this.pausedAt = time;
          this.play(settings);
      } else {
          this.pausedAt = time;
      }
  }

  public updateSettings(settings: AudioSettings) {
      if (!this.audioContext) return;
      
      if (this.sourceNode && this.isPlaying) {
          // Update Pitch (Compensated for speed)
          const naturalPitchShift = 12 * Math.log2(settings.speed);
          const userDetuneSemis = settings.detune / 100;
          const finalPitchShift = userDetuneSemis - naturalPitchShift;

          if (this.pitchShifter) {
              this.pitchShifter.setPitch(finalPitchShift);
          }

          // Update Speed dynamically
          if (settings.speed !== this.currentSpeed) {
              const now = this.audioContext.currentTime;
              // Current track position
              const currentOffset = (now - this.startTime) * this.currentSpeed;
              
              this.currentSpeed = settings.speed;
              this.sourceNode.playbackRate.value = this.currentSpeed;
              
              // Adjust startTime to prevent jump in position
              // newStartTime = now - (currentOffset / newSpeed)
              this.startTime = now - (currentOffset / this.currentSpeed);
          }
      }
      
      // Real-time EQ updates
      if (this.eqLowNode) this.eqLowNode.gain.setTargetAtTime(settings.eqLow, this.audioContext.currentTime, 0.1);
      if (this.eqMidNode) this.eqMidNode.gain.setTargetAtTime(settings.eqMid, this.audioContext.currentTime, 0.1);
      if (this.eqHighNode) this.eqHighNode.gain.setTargetAtTime(settings.eqHigh, this.audioContext.currentTime, 0.1);

      if (this.masterGain) {
          this.masterGain.gain.setTargetAtTime(settings.volume, this.audioContext.currentTime, 0.02);
      }
  }

  public getCurrentTime(): number {
    if (!this.audioContext) return 0;
    if (!this.isPlaying) return this.pausedAt;
    
    const realTimeElapsed = this.audioContext.currentTime - this.startTime;
    const trackTime = realTimeElapsed * this.currentSpeed;
    
    return Math.max(0, trackTime);
  }

  private disconnect() {
     this.sourceNode?.disconnect();
     this.masterGain?.disconnect();
     this.analyserNode?.disconnect();
     this.pitchShifter?.disconnect();
     
     this.lowPassNode?.disconnect();
     this.highPassNode?.disconnect();
     this.splitterNode?.disconnect();
     this.mergerNode?.disconnect();
     this.phaseInverterLeft?.disconnect();
     this.phaseInverterRight?.disconnect();
     this.sideGain?.disconnect();
     this.bypassSplitter?.disconnect();
     this.artifactLpfNode?.disconnect();
     
     this.eqLowNode?.disconnect();
     this.eqMidNode?.disconnect();
     this.eqHighNode?.disconnect();
  }
}

export const audioEngine = new AudioEngine();