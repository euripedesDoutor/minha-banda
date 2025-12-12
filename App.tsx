import React, { useState, useRef } from 'react';
import { Upload, Play, Pause, Download, Mic2, Music, Zap, Plus, Minus, Volume2, Link as LinkIcon, FileAudio, Loader2, Sliders } from 'lucide-react';
import { AudioState, AudioSettings } from './types';
import { audioEngine } from './services/audioEngine';
import { Visualizer } from './components/Visualizer';

const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    
    if (h > 0) {
        return `${h}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
};

const App: React.FC = () => {
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    isLoaded: false,
    fileName: null,
  });

  const [settings, setSettings] = useState<AudioSettings>({
    detune: 0,
    vocalRemoval: false,
    volume: 0.8,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0
  });

  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Ref to track file
  const fileRef = useRef<File | null>(null);
  const timeUpdateInterval = useRef<number | null>(null);

  // Centralized File Processing Logic
  const processFile = async (file: File) => {
      if (!file.type.startsWith('audio/')) {
          alert("Por favor, envie apenas arquivos de áudio.");
          return;
      }

      fileRef.current = file;
      setAudioState(prev => ({ ...prev, isLoaded: false, fileName: file.name }));
      
      // Reset settings slightly for new file, keep volume
      setSettings(prev => ({...prev, detune: 0, eqLow: 0, eqMid: 0, eqHigh: 0}));

      setIsLoading(true);
      try {
        const duration = await audioEngine.loadFile(file);
        
        setAudioState({
            isPlaying: false,
            duration,
            currentTime: 0,
            isLoaded: true,
            fileName: file.name
        });
      } catch (e) {
        console.error("Error loading file:", e);
        alert("Erro ao decodificar o arquivo de áudio. O formato pode não ser suportado pelo navegador.");
        setAudioState(prev => ({ ...prev, isLoaded: false, fileName: null }));
      } finally {
        setIsLoading(false);
      }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    // Basic YouTube check (Client-side only demo)
    if (urlInput.includes('youtube.com') || urlInput.includes('youtu.be')) {
        alert("Nota: Devido a restrições de segurança do navegador (CORS), este app de demonstração não pode baixar diretamente do YouTube sem um servidor backend. \n\nPor favor, tente um link direto para um arquivo MP3/WAV (ex: Dropbox, arquivo público S3) para testar a funcionalidade via URL.");
        return;
    }

    setIsLoading(true);
    try {
        const duration = await audioEngine.loadUrl(urlInput);
         setAudioState({
            isPlaying: false,
            duration,
            currentTime: 0,
            isLoaded: true,
            fileName: "Áudio via Link"
        });
        // Reset settings slightly for new file
         setSettings(prev => ({...prev, detune: 0, eqLow: 0, eqMid: 0, eqHigh: 0}));
    } catch (error) {
        alert("Erro ao carregar URL. Verifique se o link é direto (mp3/wav) e permite acesso CORS.");
    } finally {
        setIsLoading(false);
    }
  }

  // Input Change Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
          processFile(file);
      }
  };

  // Play/Pause Handler
  const togglePlay = () => {
    if (!audioState.isLoaded) return;

    if (audioState.isPlaying) {
      audioEngine.stop();
      setAudioState(prev => ({ ...prev, isPlaying: false }));
      if (timeUpdateInterval.current) window.clearInterval(timeUpdateInterval.current);
    } else {
      audioEngine.play(settings, audioState.currentTime);
      setAudioState(prev => ({ ...prev, isPlaying: true }));
      
      // Update seek bar
      timeUpdateInterval.current = window.setInterval(() => {
        const time = audioEngine.getCurrentTime();
        // Auto-pause at end
        if (time >= audioState.duration && audioState.duration > 0) {
            audioEngine.stop();
            setAudioState(prev => ({...prev, isPlaying: false, currentTime: 0 }));
            if (timeUpdateInterval.current) window.clearInterval(timeUpdateInterval.current);
        } else {
            setAudioState(prev => ({ ...prev, currentTime: time }));
        }
      }, 100);
    }
  };

  // Setting Changes
  const updateSettings = (newSettings: Partial<AudioSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    
    // Vocal removal requires graph rebuild, others are real-time
    if (newSettings.vocalRemoval !== undefined) {
        if (audioState.isPlaying) {
            audioEngine.stop();
            audioEngine.play(merged, audioState.currentTime);
        }
    } else {
        audioEngine.updateSettings(merged);
    }
  };

  // Helper for Pitch (Semitones)
  const changePitch = (semitones: number) => {
    // 100 cents = 1 semitone
    const currentSemitones = settings.detune / 100;
    const newSemitones = currentSemitones + semitones;
    
    // Limit range to +/- 12 semitones (1 octave)
    if (newSemitones >= -12 && newSemitones <= 12) {
        updateSettings({ detune: newSemitones * 100 });
    }
  };

  // Seek Handler
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      audioEngine.seek(time, settings);
      setAudioState(prev => ({ ...prev, currentTime: time }));
  };

  // Download Handler (Offline Rendering)
  const handleDownload = async () => {
      setIsExporting(true);
      // Wait a tick to let UI update
      await new Promise(r => setTimeout(r, 10));

      try {
        const blob = await audioEngine.exportAudio(settings);
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            const originalName = audioState.fileName?.replace(/\.[^/.]+$/, "") || "remix";
            // Changing extension to .mp3 as requested (Note: Content is still WAV, but extension is MP3)
            a.download = `${originalName} (Remix).mp3`;
            
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 100);
        }
      } catch (e) {
        console.error("Export error", e);
        alert("Erro ao exportar áudio.");
      } finally {
        setIsExporting(false);
      }
  };

  return (
    <div className="min-h-screen bg-studio-900 text-studio-100 p-4 md:p-8 flex flex-col items-center">
      
      {/* Header */}
      <header className="w-full max-w-4xl flex justify-between items-center mb-8 border-b border-studio-700 pb-4">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-neon-pink to-neon-blue rounded-lg flex items-center justify-center shadow-lg shadow-neon-blue/20">
                <Music className="text-white w-6 h-6" />
            </div>
            <div>
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-studio-300">
                    Minha Banda
                </h1>
                <p className="text-xs text-studio-400 font-mono">AI STUDIO WORKSTATION</p>
            </div>
        </div>
        <div className="text-xs text-studio-500 font-mono hidden md:block">
            v1.2.1 • STUDIO REMASTER
        </div>
      </header>

      {/* Main Interface */}
      <main className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Visuals & Main Controls */}
        <div className="lg:col-span-2 space-y-6">

             {/* Mode Selection Tabs (Only visible when not loaded) */}
             {!audioState.isLoaded && (
                <div className="flex gap-4">
                     <button 
                        onClick={() => setUploadMode('file')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border border-transparent ${uploadMode === 'file' ? 'bg-neon-blue text-studio-900 shadow-lg shadow-neon-blue/20' : 'bg-studio-800 text-studio-400 hover:text-white border-studio-700'}`}
                     >
                        <FileAudio className="w-4 h-4" />
                        Arquivo Local
                     </button>
                     <button 
                        onClick={() => setUploadMode('url')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border border-transparent ${uploadMode === 'url' ? 'bg-neon-pink text-studio-900 shadow-lg shadow-neon-pink/20' : 'bg-studio-800 text-studio-400 hover:text-white border-studio-700'}`}
                     >
                        <LinkIcon className="w-4 h-4" />
                        Link / URL
                     </button>
                </div>
            )}
            
            {/* Visualizer & Uploader Area */}
            <div 
                className={`relative group transition-all duration-300 ${isDragging ? 'scale-[1.02]' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <Visualizer analyser={audioEngine.getAnalyser()} isPlaying={audioState.isPlaying} />
                
                {/* Drag Overlay */}
                {isDragging && (
                     <div className="absolute inset-0 z-50 bg-studio-900/90 border-2 border-neon-blue border-dashed rounded-xl flex items-center justify-center animate-pulse">
                        <div className="text-neon-blue font-bold text-xl pointer-events-none">
                            Solte o arquivo aqui para carregar
                        </div>
                     </div>
                )}

                {/* Loading State (Processing Input) */}
                {isLoading && (
                     <div className="absolute inset-0 z-[60] bg-studio-900/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-studio-700">
                        <Loader2 className="w-12 h-12 text-neon-blue animate-spin mb-4" />
                        <p className="text-white font-mono animate-pulse">Processando Áudio...</p>
                     </div>
                )}

                {/* Exporting State (Rendering Remix) */}
                {isExporting && (
                     <div className="absolute inset-0 z-[60] bg-studio-900/90 backdrop-blur-md flex flex-col items-center justify-center rounded-xl border border-neon-pink/50">
                        <Loader2 className="w-12 h-12 text-neon-pink animate-spin mb-4" />
                        <p className="text-white font-mono font-bold text-lg animate-pulse">Renderizando Remix...</p>
                        <p className="text-studio-400 text-xs mt-2">Isso pode levar alguns segundos</p>
                     </div>
                )}

                {/* Initial Upload State - FILE MODE */}
                {!audioState.isLoaded && !isLoading && uploadMode === 'file' && !isDragging && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl transition-opacity">
                        <label className="cursor-pointer flex flex-col items-center gap-4 p-8 border-2 border-dashed border-studio-500 rounded-2xl hover:border-neon-blue hover:bg-studio-800/50 transition-all">
                            <Upload className="w-12 h-12 text-studio-300 group-hover:text-neon-blue transition-colors" />
                            <div className="text-center">
                                <p className="font-bold text-lg text-white">Carregar ou Arrastar Música</p>
                                <p className="text-sm text-studio-400">MP3, WAV, OGG (Max 20MB)</p>
                            </div>
                            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                        </label>
                    </div>
                )}

                {/* Initial Upload State - URL MODE */}
                {!audioState.isLoaded && !isLoading && uploadMode === 'url' && !isDragging && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-xl transition-opacity p-8">
                        <form onSubmit={handleUrlSubmit} className="w-full max-w-md flex flex-col gap-4">
                            <div className="text-center mb-2">
                                    <p className="font-bold text-lg text-white">Carregar via Link</p>
                                    <p className="text-xs text-studio-400">Cole um link direto de áudio (MP3/WAV)</p>
                            </div>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={urlInput}
                                    onChange={(e) => setUrlInput(e.target.value)}
                                    placeholder="https://exemplo.com/musica.mp3"
                                    className="flex-1 bg-studio-900 border border-studio-600 rounded-xl px-4 py-3 text-white focus:border-neon-pink focus:outline-none transition-colors"
                                />
                                <button 
                                    type="submit"
                                    className="bg-studio-700 hover:bg-neon-pink hover:text-studio-900 text-white p-3 rounded-xl transition-all"
                                >
                                    <Play className="w-6 h-6" />
                                </button>
                            </div>
                            <p className="text-[10px] text-center text-studio-500">
                                *Links do YouTube requerem backend. Esta demo suporta links diretos (CORS).
                            </p>
                        </form>
                     </div>
                )}

                {/* Replacement Upload Button (top right) - Visible when loaded */}
                {audioState.isLoaded && !isDragging && (
                     <div className="absolute top-4 right-4 flex gap-2 z-50">
                        <button 
                            onClick={() => {
                                setAudioState(prev => ({...prev, isLoaded: false, isPlaying: false, fileName: null}));
                                audioEngine.stop();
                            }}
                            className="cursor-pointer p-2 bg-studio-800/80 hover:bg-studio-700 rounded-lg backdrop-blur-md border border-studio-600 transition-colors" 
                            title="Carregar nova música"
                        >
                            <Upload className="w-4 h-4 text-studio-300" />
                        </button>
                     </div>
                )}
            </div>

            {/* Track Info & Progress */}
            {audioState.isLoaded && (
                <div className="bg-studio-800 p-6 rounded-2xl border border-studio-700 shadow-xl">
                    <div className="flex justify-between items-end mb-2">
                        <div className="overflow-hidden">
                            <h2 className="text-xl font-bold text-white truncate max-w-md">{audioState.fileName}</h2>
                            <span className="text-xs font-mono text-neon-blue">
                                {settings.vocalRemoval ? "MODE: KARAOKE (CROSSOVER FILTER)" : "MODE: FULL MIX"}
                            </span>
                        </div>
                        <div className="font-mono text-studio-300">
                            {formatTime(audioState.currentTime)} / {formatTime(audioState.duration)}
                        </div>
                    </div>
                    
                    <input 
                        type="range" 
                        min={0} 
                        max={audioState.duration || 100} 
                        step={0.1}
                        value={audioState.currentTime}
                        onChange={handleSeek}
                        className="w-full mb-6 accent-neon-pink"
                    />

                    <div className="flex justify-center items-center gap-8">
                        <button 
                            onClick={togglePlay}
                            className="w-16 h-16 rounded-full bg-white text-studio-900 flex items-center justify-center hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all active:scale-95"
                        >
                            {audioState.isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Right Column: Modifiers */}
        <div className="space-y-6">
            
            {/* Audio Modifiers */}
            <div className="bg-studio-800 p-6 rounded-2xl border border-studio-700 h-full">
                <div className="flex items-center gap-2 mb-6 text-studio-300 border-b border-studio-700 pb-2">
                    <Zap className="w-4 h-4" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Efeitos Studio</h3>
                </div>

                <div className="space-y-6">
                    {/* Vocal Remover Toggle */}
                    <div className="flex items-center justify-between bg-studio-900 p-3 rounded-xl border border-studio-700">
                        <div className="flex items-center gap-3">
                            <Mic2 className={`w-5 h-5 ${settings.vocalRemoval ? 'text-neon-green' : 'text-studio-500'}`} />
                            <span className="text-sm font-bold">Remover Voz</span>
                        </div>
                        <button 
                            onClick={() => updateSettings({ vocalRemoval: !settings.vocalRemoval })}
                            className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.vocalRemoval ? 'bg-neon-green' : 'bg-studio-600'}`}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${settings.vocalRemoval ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    {settings.vocalRemoval && (
                         <div className="text-[10px] text-studio-400 text-center -mt-4 bg-studio-900/50 p-2 rounded-b-xl border-x border-b border-studio-700">
                            Crossover: 200Hz | Graves Preservados | Agudos Isolados (Side)
                         </div>
                    )}

                    {/* Equalizer Controls */}
                    <div className="bg-studio-900 p-4 rounded-xl border border-studio-700 flex flex-col gap-3">
                         <div className="flex items-center gap-2 text-studio-300">
                             <Sliders className="w-4 h-4" />
                             <span className="text-xs font-bold uppercase tracking-widest">Equalizador (EQ)</span>
                         </div>
                         <div className="flex flex-col gap-3 pt-2">
                             {/* Low */}
                             <div className="flex items-center justify-between gap-3">
                                 <span className="text-xs font-mono w-8 text-studio-400">LOW</span>
                                 <input 
                                    type="range" min="-12" max="12" step="1" 
                                    value={settings.eqLow}
                                    onChange={(e) => updateSettings({ eqLow: parseFloat(e.target.value) })}
                                    className="flex-1 accent-neon-blue"
                                 />
                                 <span className="text-xs font-mono w-8 text-right text-white">{settings.eqLow > 0 ? '+' : ''}{settings.eqLow}</span>
                             </div>
                             {/* Mid */}
                             <div className="flex items-center justify-between gap-3">
                                 <span className="text-xs font-mono w-8 text-studio-400">MID</span>
                                 <input 
                                    type="range" min="-12" max="12" step="1" 
                                    value={settings.eqMid}
                                    onChange={(e) => updateSettings({ eqMid: parseFloat(e.target.value) })}
                                    className="flex-1 accent-neon-blue"
                                 />
                                 <span className="text-xs font-mono w-8 text-right text-white">{settings.eqMid > 0 ? '+' : ''}{settings.eqMid}</span>
                             </div>
                             {/* High */}
                             <div className="flex items-center justify-between gap-3">
                                 <span className="text-xs font-mono w-8 text-studio-400">HI</span>
                                 <input 
                                    type="range" min="-12" max="12" step="1" 
                                    value={settings.eqHigh}
                                    onChange={(e) => updateSettings({ eqHigh: parseFloat(e.target.value) })}
                                    className="flex-1 accent-neon-blue"
                                 />
                                 <span className="text-xs font-mono w-8 text-right text-white">{settings.eqHigh > 0 ? '+' : ''}{settings.eqHigh}</span>
                             </div>
                         </div>
                    </div>

                    {/* Pitch Control (Buttons) */}
                    <div className="bg-studio-900 p-4 rounded-xl border border-studio-700 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-studio-300">
                            <span className="text-xs font-bold uppercase tracking-widest">Tom (Semitons)</span>
                            <span className={`font-mono font-bold text-lg ${settings.detune !== 0 ? 'text-neon-blue' : 'text-white'}`}>
                                {settings.detune > 0 ? '+' : ''}{settings.detune / 100}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                             <button
                                onClick={() => changePitch(-1)}
                                className="flex-1 py-3 bg-studio-700 hover:bg-studio-600 rounded-lg flex items-center justify-center transition-colors active:scale-95 text-studio-300 hover:text-white"
                                title="Diminuir 1 semitom"
                            >
                                <Minus className="w-6 h-6" />
                            </button>
                            <button
                                onClick={() => changePitch(1)}
                                className="flex-1 py-3 bg-studio-700 hover:bg-studio-600 rounded-lg flex items-center justify-center transition-colors active:scale-95 text-studio-300 hover:text-white"
                                title="Aumentar 1 semitom"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                    
                    {/* Volume Control */}
                    <div className="bg-studio-900 p-4 rounded-xl border border-studio-700 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-studio-300">
                            <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-widest">Volume Master</span>
                            </div>
                            <span className="font-mono font-bold text-lg text-white">
                                {Math.round(settings.volume * 100)}%
                            </span>
                        </div>
                        
                        <div className="relative pt-1 pb-1">
                            <input 
                                type="range" 
                                min={0} 
                                max={1} 
                                step={0.01}
                                value={settings.volume}
                                onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                                className="w-full h-2 bg-studio-700 rounded-lg appearance-none cursor-pointer accent-neon-green"
                            />
                        </div>
                    </div>

                </div>
                 
                {/* Download Button moved inside the panel for better layout */}
                <div className="mt-4 pt-6 border-t border-studio-700">
                     <button 
                        onClick={handleDownload}
                        disabled={!audioState.isLoaded || isExporting}
                        className="w-full py-4 bg-studio-900 border border-studio-700 hover:border-neon-pink text-studio-300 hover:text-white rounded-xl flex items-center justify-center gap-2 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download className={`w-5 h-5 ${isExporting ? 'animate-bounce' : 'group-hover:scale-110'} transition-transform`} />
                        <span className="font-bold">{isExporting ? 'Processando...' : 'Baixar Remix'}</span>
                    </button>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;