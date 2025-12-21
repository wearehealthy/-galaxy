import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GameEngine } from './game/GameEngine';
import { SkillTree } from './SkillTree';
import { ArrowLeft, Settings, X, Target, Skull, Menu, Pause, Play } from 'lucide-react';

const SettingsModal = ({ stats, actions, onClose }: any) => {
    const [maxDronesInput, setMaxDronesInput] = useState(stats.softMaxDrones ? stats.softMaxDrones.toLocaleString() : "2,500,000");

    const handleMaxDronesChange = (e: any) => {
        const raw = e.target.value.replace(/,/g, '');
        if (!isNaN(Number(raw))) {
            const val = Number(raw);
            setMaxDronesInput(val.toLocaleString());
            actions.setSoftMaxDrones(val);
        }
    };

    return (
        <div className="absolute inset-0 bg-black/95 z-50 flex flex-col p-4 animate-in fade-in slide-in-from-left duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-cyan-900/50 pb-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold tracking-widest text-lg">
                    <Settings size={20} className="animate-spin-slow" />
                    SYSTEM CONFIG
                </div>
                <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"><X size={20}/></button>
            </div>

            <div className="space-y-6">
                <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-cyan-300">LAG OPTIMIZATION</span>
                        <button onClick={actions.toggleLagOptimization} className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${stats.lagOptimization ? 'bg-cyan-600' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${stats.lagOptimization ? 'left-6' : 'left-1'}`}></div>
                        </button>
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">Limits rendering to increase performance. Squads remain high-fidelity.</div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-cyan-300">GRAPHICS QUALITY</span>
                        <button onClick={actions.toggleGraphicsQuality} className={`w-16 h-5 rounded-sm relative transition-colors duration-300 flex items-center justify-center text-[10px] font-bold ${stats.graphicsQuality === 'HIGH' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                            {stats.graphicsQuality || 'HIGH'}
                        </button>
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">Lowering quality reduces resolution and particles for better performance.</div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-cyan-300">CUSTOM CAP LIMIT</span>
                        <button onClick={actions.toggleCustomMaxDrones} className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${stats.customMaxDronesEnabled ? 'bg-cyan-600' : 'bg-slate-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${stats.customMaxDronesEnabled ? 'left-6' : 'left-1'}`}></div>
                        </button>
                    </div>
                    
                    <div className={`mt-2 transition-opacity duration-300 ${stats.customMaxDronesEnabled ? 'opacity-100' : 'opacity-50'}`}>
                        <input type="text" value={maxDronesInput} onChange={handleMaxDronesChange} className="w-full bg-black/40 border border-slate-600 text-cyan-400 text-center text-sm py-2 rounded focus:outline-none focus:border-cyan-500 font-mono mb-1"/>
                        <div className="text-[10px] text-slate-500 text-center">Max Drones (Active when toggled on)</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActionButton = ({ onClick, disabled, label, cost, icon: Icon, subLabel, formatNum, className, highlight }: any) => (
    <button onClick={onClick} disabled={disabled} className={`w-full flex justify-between items-center px-3 py-2 mb-1.5 rounded-sm border transition-all duration-300 group font-bold text-sm uppercase relative overflow-hidden ${highlight ? 'ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.6)] animate-pulse' : ''} ${disabled ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-cyan-900/50 text-cyan-100 hover:border-cyan-400 hover:shadow-[0_0_8px_rgba(34,211,238,0.2)]'} ${className||''}`}>
        <div className="flex items-center gap-2 z-10">
            {Icon && <Icon size={14} className={disabled ? 'text-slate-600' : 'text-cyan-400'} />}
            <div className="flex flex-col items-start leading-none"><span>{label}</span>{subLabel && <span className="text-[9px] text-cyan-600 mt-0.5">{subLabel}</span>}</div>
        </div>
        <span className={`z-10 font-mono text-xs ${disabled ? 'text-slate-600' : 'text-amber-400'}`}>{formatNum(cost)}</span>
    </button>
);

export const GameCanvas = ({ onExit }: any) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const engine = useRef<GameEngine | null>(null);
    const observerRef = useRef<ResizeObserver | null>(null);

    const [stats, setStats] = useState<any>({});
    const [enemyInd, setEnemyInd] = useState<any[]>([]);
    const [squadInd, setSquadInd] = useState<any[]>([]);
    const [msg, setMsg] = useState<string | null>(null);
    const [gameOver, setGameOver] = useState(false);
    const [victory, setVictory] = useState(false);
    const [bossHp, setBossHp] = useState<any>(null);
    const [showSkillTree, setShowSkillTree] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [customAmount, setCustomAmount] = useState("100");
    const [isPaused, setIsPaused] = useState(false);

    const init = useCallback(() => {
        if(!mountRef.current) return;
        
        // 1. CLEANUP PREVIOUS INSTANCE
        if (engine.current) {
            (engine.current as any).dispose();
            engine.current = null;
        }
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        
        // Clear DOM
        while(mountRef.current.firstChild) {
            mountRef.current.removeChild(mountRef.current.firstChild);
        }

        // 2. RESET STATE
        setGameOver(false);
        setVictory(false);
        setBossHp(null);
        setEnemyInd([]);
        setSquadInd([]);
        setMsg(null);
        setStats({}); // Clear visuals
        setIsPaused(false);

        // 3. CREATE NEW ENGINE
        engine.current = new GameEngine({
            container: mountRef.current,
            isTutorial: false,
            onStatsUpdate: (s) => {
                setStats({...s});
                updateIndicators(s.squads || []);
            },
            onBossSpawn: (active, hp, max, isFinal) => setBossHp(active ? {hp, max, isFinal} : null),
            onMessage: (m) => { setMsg(m); setTimeout(()=>setMsg(null), 3000); },
            onGameOver: () => setGameOver(true),
            onGameWon: () => setVictory(true)
        });

        // 4. SETUP RESIZE OBSERVER
        const obs = new ResizeObserver(() => {
             window.requestAnimationFrame(() => {
                if (engine.current && mountRef.current) engine.current.onWindowResize();
             });
        });
        obs.observe(mountRef.current);
        observerRef.current = obs;

    }, []);

    useEffect(() => {
        init();
        return () => {
             if (engine.current) (engine.current as any).dispose();
             if (observerRef.current) observerRef.current.disconnect();
        }
    }, [init]);

    const togglePause = () => {
        const newVal = !isPaused;
        setIsPaused(newVal);
        if (engine.current) {
            engine.current.paused = newVal;
        }
    };

    const updateIndicators = (squads: any[]) => {
        if(!engine.current || !mountRef.current) return;
        const width = mountRef.current.clientWidth;
        const height = mountRef.current.clientHeight;
        const camera = engine.current.camera;

        const eInds = [];
        for(let e of engine.current.enemies) {
            const p = e.position.clone().project(camera);
            if(Math.abs(p.x)>1 || Math.abs(p.y)>1 || p.z>1) {
                let x = (p.x * 0.5 + 0.5) * width;
                let y = (-(p.y * 0.5) + 0.5) * height;
                const cx = width/2, cy = height/2;
                const ang = Math.atan2(y-cy, x-cx);
                const pad = 40;
                let tx = x, ty = y;
                const slope = (y-cy)/(x-cx);
                if(Math.abs(x-cx) > Math.abs(y-cy)) {
                    tx = x > cx ? width-pad : pad;
                    ty = cy + (tx-cx)*slope;
                } else {
                    ty = y > cy ? height-pad : pad;
                    tx = cx + (ty-cy)/slope;
                }
                tx = Math.max(pad, Math.min(width-pad, tx));
                ty = Math.max(pad, Math.min(height-pad, ty));
                eInds.push({ x: tx, y: ty, ang: ang * (180/Math.PI) });
            }
        }
        setEnemyInd(eInds);

        const sInds = [];
        for(const sq of squads) {
            if(sq.type === 'WALL') {
                const pos = new THREE.Vector3(sq.center.x, sq.center.y, sq.center.z);
                pos.project(camera);
                if(pos.z < 1 && Math.abs(pos.x) < 1 && Math.abs(pos.y) < 1) {
                    sInds.push({
                        x: (pos.x * 0.5 + 0.5) * width,
                        y: (-(pos.y * 0.5) + 0.5) * height,
                        count: sq.count
                    });
                }
            }
        }
        setSquadInd(sInds);
    };

    const buy = (fn: string, ...args: any[]) => {
        if (!engine.current) {
            console.error("Engine not ready");
            return;
        }
        const func = (engine.current as any)[fn];
        if (typeof func === 'function') {
            func.call(engine.current, ...args);
        } else {
            console.warn(`Attempted to call non-existent method: ${fn}`);
        }
    };

    const setMode = (m: string) => { 
        if(engine.current) {
            engine.current.state.attackMode = m as any;
        } 
    };
    const deploy = (r: number) => { if(engine.current) engine.current.state.deploymentRatio = r; };
    
    const formatNum = (num: number) => {
        if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return Math.floor(num).toLocaleString();
    };

    const actions = {
        buyDrones: (a: number, c: number) => buy('buyDrones',a,c),
        buySpeed: (m: number) => buy('buySpeed',m),
        buyMining: (m: number) => buy('buyMining',m),
        buyCargo: (m: number) => buy('buyCargo',m),
        buyCrit: (m: number) => buy('buyCrit',m),
        buyShield: (m: number) => buy('buyShield',m),
        buyShieldRegen: (m: number) => buy('buyShieldRegen',m),
        buyRegen: (m: number) => buy('buyRegen',m),
        buyDamage: (m: number) => buy('buyDamage',m),
        buyWallHP: (m: number) => buy('buyWallHP',m),
        repairHull: () => buy('repairHull'),
        buyAsteroid: (m: number) => buy('buyAsteroid',m),
        spawnBoss: () => buy('spawnBoss'),
        spawnFinalBoss: () => buy('spawnBoss', true),
        toggleLagOptimization: () => buy('toggleLagOptimization'),
        setSoftMaxDrones: (l: number) => buy('setSoftMaxDrones', l),
        toggleCustomMaxDrones: () => buy('toggleCustomMaxDrones'),
        toggleGraphicsQuality: () => buy('toggleGraphicsQuality'),
        exitToMenu: onExit
    };

    const handleSettingsClick = () => {
        setShowSettings(true);
        setShowSkillTree(false);
    };

    const customVal = parseInt(customAmount) || 0;
    const discountSteps = Math.floor(customVal / 200);
    let discount = discountSteps * 0.05; if (discount > 1.0) discount = 1.0;
    const customCost = Math.floor(customVal * Math.max(1.0, 2.0 - discount));

    return (
        <div className="flex w-full h-full relative">
            <div className="w-[300px] h-full bg-slate-950/90 border-r border-cyan-900/30 flex flex-col p-3 z-10 overflow-y-auto overflow-x-hidden">
                <div className="flex justify-start gap-2 items-center mb-4 pb-2 border-b border-cyan-900/30">
                    <button onClick={onExit} className="text-slate-500 hover:text-white transition-colors flex items-center gap-1 bg-black/40 hover:bg-slate-800 rounded px-2 py-1 border border-transparent hover:border-slate-600">
                        <ArrowLeft size={14} /><span className="text-[10px] font-bold tracking-wider">BACK</span>
                    </button>
                    <button onClick={togglePause} className={`text-cyan-600 hover:text-cyan-300 transition-colors flex items-center gap-1 bg-black/40 hover:bg-cyan-900/30 rounded px-2 py-1 border border-transparent hover:border-cyan-700 group ${isPaused ? 'border-yellow-500 text-yellow-400 bg-yellow-900/20' : ''}`}>
                         <span className="text-[10px] font-bold tracking-wider group-hover:text-cyan-200">{isPaused ? 'RESUME' : 'PAUSE'}</span>
                         {isPaused ? <Play size={14} /> : <Pause size={14} />}
                    </button>
                    <button onClick={handleSettingsClick} className="text-cyan-600 hover:text-cyan-300 transition-colors flex items-center gap-1 bg-black/40 hover:bg-cyan-900/30 rounded px-2 py-1 border border-transparent hover:border-cyan-700 group">
                        <span className="text-[10px] font-bold tracking-wider group-hover:text-cyan-200">SETTINGS</span><Settings size={14} className="group-hover:rotate-45 transition-transform" />
                    </button>
                </div>
                
                {showSettings && <SettingsModal stats={stats} actions={actions} onClose={() => setShowSettings(false)} />}

                <div className="bg-slate-900/60 border border-cyan-900/30 rounded p-3 mb-4 flex justify-between items-center">
                    <div>
                        <div className="text-[10px] text-cyan-300 font-bold">ENERGY</div>
                        <div className="text-2xl font-black text-white drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{formatNum(stats.resources||0)}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-cyan-300 font-bold">SWARM</div>
                        <div className="text-2xl font-bold text-cyan-200">{formatNum(stats.droneCount||0)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-1 mb-4">
                    {[
                      { label: 'DMG', val: Math.round((stats.damageMultiplier||1) * 100) + '%', col: 'text-red-400' },
                      { label: 'MINE SPD', val: (stats.miningSpeed||1).toFixed(1) + 'x', col: 'text-green-400' },
                      { label: 'CRIT', val: Math.round((stats.critChance||0) * 100) + '%', col: 'text-purple-400' },
                      { label: 'SPD', val: (stats.droneSpeed||1).toFixed(1), col: 'text-yellow-400' },
                      { label: 'UNIT HP', val: (stats.wallHP||1).toString(), col: 'text-blue-400' },
                      { label: 'REGEN', val: (stats.hullRegen||0).toFixed(1), col: 'text-emerald-400' },
                    ].map((s, i) => (
                      <div key={i} className="bg-slate-900/40 border border-slate-800 rounded p-1 text-center">
                        <div className="text-[9px] text-slate-400 font-bold">{s.label}</div>
                        <div className={`text-xs font-bold ${s.col}`}>{s.val}</div>
                      </div>
                    ))}
                </div>

                <div className="mb-4">
                    <div className="text-xs font-bold text-cyan-500 border-b border-cyan-900/30 pb-1 mb-2">COMBAT PROTOCOLS</div>
                    <div className="flex gap-2 mb-2">
                        <button onClick={()=>setMode('SWARM')} className={`flex-1 py-2 text-xs font-bold border rounded-sm ${stats.attackMode==='SWARM'?'bg-red-900/50 border-red-500 text-red-100':'bg-slate-900 border-slate-700 text-slate-500'}`}>SWARM</button>
                        <button onClick={()=>setMode('WALL')} className={`flex-1 py-2 text-xs font-bold border rounded-sm ${stats.attackMode==='WALL'?'bg-blue-900/50 border-blue-500 text-blue-100':'bg-slate-900 border-slate-700 text-slate-500'}`}>WALL</button>
                    </div>
                    <input type="range" min="0.01" max="0.99" step="0.01" value={stats.deploymentRatio||0.5} onChange={e=>deploy(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"/>
                    <div className="text-right text-[10px] text-cyan-500 mt-1">DEPLOY {Math.round((stats.deploymentRatio||0.5)*100)}%</div>
                </div>

                <div className="mb-6">
                    <div className="text-xs font-bold text-cyan-500 border-b border-cyan-900/30 pb-1 mb-2">FABRICATION</div>
                    <div className="grid grid-cols-2 gap-1 mb-2">
                        <ActionButton onClick={()=>buy('buyDrones',1,2)} disabled={(stats.resources||0)<2} label="+1" cost={2} formatNum={formatNum}/>
                        <ActionButton onClick={()=>buy('buyDrones',10,20)} disabled={(stats.resources||0)<20} label="+10" cost={20} formatNum={formatNum}/>
                    </div>
                    <ActionButton onClick={()=>buy('buyDrones',100,200)} disabled={(stats.resources||0)<200} label="+100" cost={200} formatNum={formatNum}/>
                    <ActionButton onClick={()=>buy('buyDrones',10000,15000)} disabled={(stats.resources||0)<15000} label="+10k SWARM" cost={15000} formatNum={formatNum} className="mt-1"/>
                    <div className="flex items-center gap-1 mt-2">
                      <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="w-16 bg-black/40 border border-cyan-900/50 text-cyan-400 text-center text-sm py-1.5 rounded focus:outline-none"/>
                      <button onClick={() => buy('buyDrones', customVal, customCost)} disabled={(stats.resources||0) < customCost || customVal <= 0} className={`flex-1 flex justify-between items-center px-3 py-1.5 border text-sm font-bold uppercase transition-all duration-300 ${(stats.resources||0) < customCost ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-cyan-900/30 border-cyan-900/50 text-cyan-100 hover:bg-cyan-800/40'}`}>
                        <div className="flex flex-col items-start leading-none"><span>FABRICATE</span></div>
                        <span className="text-amber-400 text-xs">{formatNum(customCost)}</span>
                      </button>
                    </div>
                </div>

                <div className="mb-4">
                    <button onClick={() => setShowSkillTree(!showSkillTree)} className="w-full py-4 bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border border-cyan-500 text-cyan-100 font-bold tracking-widest text-lg hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2 group">
                        <Menu size={20} className="group-hover:rotate-90 transition-transform"/> UPGRADES
                    </button>
                </div>
                
                <div className="mt-auto flex flex-col gap-2">
                    <button onClick={()=>buy('spawnBoss',false)} className="w-full py-3 bg-red-950/30 border border-red-600/30 text-red-200 font-bold hover:bg-red-900/50 flex items-center justify-center gap-2"><Skull size={16}/> BOSS</button>
                    <button onClick={()=>buy('spawnBoss',true)} className="w-full py-3 bg-black border border-red-500 text-red-100 font-black hover:shadow-[0_0_15px_red] flex items-center justify-center gap-2"><Skull size={16}/> FINAL BOSS</button>
                </div>
            </div>

            <div className="flex-grow relative bg-black cursor-crosshair overflow-hidden">
                <div ref={mountRef} className="w-full h-full" onContextMenu={e=>e.preventDefault()} />
                
                <div className="absolute bottom-4 left-4 w-64 pointer-events-none select-none">
                    <div className="text-[10px] text-blue-300 font-bold mb-1">SHIELD {(stats.shieldCurrent||0).toFixed(0)}</div>
                    <div className="h-1.5 w-full bg-slate-900 mb-2"><div className="h-full bg-blue-500" style={{width: `${Math.min(100, ((stats.shieldCurrent||0)/(stats.shieldMax||1))*100)}%`}}></div></div>
                    <div className="text-[10px] text-green-300 font-bold mb-1">HULL {(stats.hullIntegrity||0).toFixed(0)}%</div>
                    <div className="h-1.5 w-full bg-slate-900"><div className={`h-full ${(stats.hullIntegrity||0)<30?'bg-red-500 animate-pulse':'bg-green-500'}`} style={{width: `${stats.hullIntegrity||0}%`}}></div></div>
                </div>

                {enemyInd.map((ind, i) => (
                    <div key={i} className="absolute flex items-center text-red-500 font-bold text-xs pointer-events-none" style={{left: ind.x, top: ind.y, transform: `translate(-50%, -50%) rotate(${ind.ang}deg)`}}>
                         <div className="animate-point flex items-center gap-1"><span>ENEMY</span> <Target size={14}/></div>
                    </div>
                ))}

                {squadInd.map((sq, i) => (
                    <div key={i} className="absolute pointer-events-none flex flex-col items-center justify-center transform -translate-x-1/2 -translate-y-full mb-8" style={{ left: sq.x, top: sq.y }}>
                        <div className="bg-black/50 px-2 py-1 rounded text-[10px] font-bold text-blue-300 border border-blue-500/50 mb-1">{sq.count}</div>
                        <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: '100%' }}></div></div>
                    </div>
                ))}

                {bossHp && (
                    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-96 h-4 bg-slate-900 border border-red-500">
                        <div className="h-full bg-red-600 transition-all duration-200" style={{width: `${(bossHp.hp/bossHp.max)*100}%`}}></div>
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white tracking-widest">{bossHp.isFinal ? "OMEGA THREAT" : "HOSTILE"}</div>
                    </div>
                )}

                {msg && <div className="absolute top-1/4 left-0 w-full text-center text-4xl font-black text-red-500 animate-pulse tracking-widest pointer-events-none drop-shadow-[0_0_10px_red]">{msg}</div>}

                {isPaused && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in duration-200">
                        <h1 className="text-6xl text-cyan-400 font-black mb-8 tracking-widest italic">PAUSED</h1>
                        <div className="flex flex-col gap-4 w-64">
                            <button onClick={togglePause} className="px-8 py-3 bg-cyan-900 border border-cyan-500 text-white font-bold hover:bg-cyan-800 transition-colors">CONTINUE</button>
                            <button onClick={()=>init()} className="px-8 py-3 bg-slate-900 border border-slate-500 text-slate-300 font-bold hover:bg-slate-800 transition-colors">RESTART</button>
                            <button onClick={onExit} className="px-8 py-3 bg-slate-900 border border-slate-500 text-slate-300 font-bold hover:bg-slate-800 transition-colors">MAIN MENU</button>
                        </div>
                    </div>
                )}

                {gameOver && (
                    <div className="absolute inset-0 bg-red-950/90 flex flex-col items-center justify-center z-50">
                        <h1 className="text-6xl text-red-500 font-black mb-4">CRITICAL FAILURE</h1>
                        <div className="flex gap-4">
                            <button onClick={()=>init()} className="px-8 py-3 bg-red-900 border border-red-500 text-white font-bold hover:bg-red-800 transition-colors">REBOOT SYSTEM</button>
                            <button onClick={onExit} className="px-8 py-3 bg-black border border-red-900 text-red-400 font-bold hover:text-white hover:border-red-500 transition-colors">MAIN MENU</button>
                        </div>
                    </div>
                )}
                
                {victory && (
                    <div className="absolute inset-0 bg-cyan-950/90 flex flex-col items-center justify-center z-50">
                        <h1 className="text-6xl text-yellow-400 font-black mb-4">SECTOR SECURED</h1>
                        <div className="flex gap-4">
                            <button onClick={()=>setVictory(false)} className="px-8 py-3 bg-cyan-900 border border-cyan-500 text-white font-bold hover:bg-cyan-800 transition-colors">CONTINUE</button>
                            <button onClick={()=>init()} className="px-8 py-3 bg-slate-900 border border-slate-500 text-slate-300 font-bold hover:bg-slate-800 transition-colors">RESTART</button>
                            <button onClick={onExit} className="px-8 py-3 bg-slate-900 border border-slate-500 text-slate-300 font-bold hover:bg-slate-800 transition-colors">MAIN MENU</button>
                        </div>
                    </div>
                )}

                {showSkillTree && <SkillTree stats={stats} actions={actions} onClose={() => setShowSkillTree(false)} />}
            </div>
        </div>
    );
};