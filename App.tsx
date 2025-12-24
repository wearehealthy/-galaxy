import React, { useState, useEffect } from 'react';
import { GameCanvas } from './GameCanvas';
import { Play, HelpCircle, Wifi, Save } from 'lucide-react';

const App = () => {
    const [view, setView] = useState('start'); // start, game, tutorial
    const [hasSave, setHasSave] = useState(false);

    useEffect(() => {
        const checkSave = () => {
            const save = localStorage.getItem('neon_swarm_save');
            setHasSave(!!save);
        };
        checkSave();
        // Check every time we return to start
        const interval = setInterval(checkSave, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleStart = (mode: string) => {
        if (mode === 'new') {
            localStorage.removeItem('neon_swarm_save');
        }
        setView(mode === 'tutorial' ? 'tutorial' : 'game');
    };

    return (
        <div className="w-full h-screen bg-black overflow-hidden font-sans select-none">
            {view === 'start' && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black">
                    {/* Background Grid Effect */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
                    
                    {/* Top Right Status Bar */}
                    <div className="absolute top-6 right-6 flex items-center gap-4 text-cyan-500/60 font-mono text-xs tracking-widest animate-in fade-in slide-in-from-top duration-1000">
                        <div className="flex items-center gap-2">
                            <Wifi size={14} className="animate-pulse" />
                            <span>NET: ONLINE</span>
                        </div>
                        <div className="h-4 w-px bg-cyan-900"></div>
                        <span>V.1.1.0</span>
                    </div>

                    <div className="text-center p-12 border border-cyan-500/20 bg-slate-950/80 backdrop-blur-md rounded-sm shadow-[0_0_100px_rgba(6,182,212,0.1)] relative overflow-hidden group max-w-2xl w-full mx-4">
                        {/* Scanning Line Animation */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50 animate-[scan_4s_ease-in-out_infinite]"></div>
                        
                        <div className="mb-12 relative">
                            <h1 className="text-6xl md:text-8xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-cyan-100 via-cyan-400 to-blue-600 drop-shadow-[0_0_25px_rgba(34,211,238,0.4)] tracking-tighter">
                                NEON SWARM
                            </h1>
                            <div className="flex items-center justify-center gap-4 mt-2">
                                <div className="h-px w-12 bg-gradient-to-r from-transparent to-cyan-500"></div>
                                <p className="text-lg text-cyan-400 tracking-[0.5em] font-light uppercase text-shadow-glow">Galaxy Miner</p>
                                <div className="h-px w-12 bg-gradient-to-l from-transparent to-cyan-500"></div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 items-center w-full max-w-sm mx-auto z-10 relative">
                            {hasSave && (
                                <button onClick={() => handleStart('continue')} className="group w-full relative px-8 py-5 bg-cyan-900/60 border border-cyan-400/50 hover:bg-cyan-800/60 transition-all duration-300 clip-corners mb-4">
                                    <div className="flex items-center justify-center gap-3 text-cyan-100 font-bold text-xl tracking-widest uppercase group-hover:scale-105 transition-transform duration-200">
                                        <Save className="w-5 h-5" />
                                        <span>RESUME</span>
                                    </div>
                                </button>
                            )}

                            <button onClick={() => handleStart('new')} className="group w-full relative px-8 py-4 bg-cyan-950/40 border border-cyan-500/30 hover:bg-cyan-900/40 hover:border-cyan-400/80 transition-all duration-300 clip-corners">
                                <div className="absolute inset-0 bg-cyan-400/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-center justify-center gap-3 text-cyan-100 font-bold text-lg tracking-widest uppercase group-hover:text-white group-hover:scale-105 transition-transform duration-200">
                                    <Play className="w-5 h-5 fill-current" />
                                    <span>INITIALIZE</span>
                                </div>
                            </button>
                        </div>
                    </div>
                    
                    <div className="absolute bottom-8 text-[10px] text-slate-600 font-mono">
                        SYSTEM READY // WAITING FOR PILOT INPUT
                    </div>
                </div>
            )}
            {view !== 'start' && <GameCanvas isTutorial={view==='tutorial'} onExit={()=>setView('start')} />}
        </div>
    );
};

export default App;