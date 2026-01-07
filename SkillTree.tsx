import React, { useState } from 'react';
import { GameState } from './types';
import { Rocket, Box, Wrench, Sword, Crosshair, Shield, Heart, Hammer, Globe, RefreshCw, X, Zap } from 'lucide-react';

interface SkillTreeProps {
  stats: GameState;
  actions: any;
  onClose: () => void;
}

const SkillNode = ({ icon: Icon, label, level, cost, onClick, disabled, maxed }: any) => (
  <button onClick={onClick} disabled={disabled || maxed} className={`relative flex flex-col items-center p-3 rounded-md border-2 transition-all w-24 h-32 justify-between ${maxed ? 'bg-cyan-900/40 border-cyan-500 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : disabled ? 'bg-slate-900 border-slate-700 text-slate-600 grayscale' : 'bg-slate-800 border-slate-500 text-slate-200 hover:border-cyan-400 hover:bg-slate-700'}`}>
    <div className="absolute top-1 right-1 text-[9px] font-mono opacity-60">Lvl {level}</div>
    <Icon size={24} className="mb-2" />
    <div className="text-[10px] font-bold text-center leading-tight h-8 flex items-center justify-center">{label}</div>
    <div className="text-xs font-mono text-amber-400">{maxed ? 'MAX' : cost.toLocaleString()}</div>
  </button>
);

export const SkillTree: React.FC<SkillTreeProps> = ({ stats, actions, onClose }) => {
  const [multiplier, setMultiplier] = useState(1);
  const speedLvl = Math.round((stats.droneSpeed - 1.0) / 0.1);
  const mineLvl = Math.round((stats.miningSpeed - 1.0) / 0.2);
  const dmgLvl = Math.round((stats.damageMultiplier - 1.0) / 0.1);
  const wallLvl = stats.wallHP - 1;
  const shieldLvl = stats.shieldMax / 100;
  
  const speedCost = Math.floor(500 * (1 + speedLvl) * multiplier);
  const mineCost = Math.floor(800 * (1 + mineLvl) * multiplier);
  const cargoCost = 1000 * stats.cargoCapacity * multiplier;
  const critCost = 2000 * (1 + Math.floor(stats.critChance * 10)) * multiplier;
  const dmgCost = 5000 * Math.round(stats.damageMultiplier) * multiplier;
  const wallCost = 3000 * (stats.wallHP) * multiplier;
  const shieldCost = 5000 * (1 + (stats.shieldMax / 500)) * multiplier;
  const shieldRegenCost = 8000 * (1 + stats.shieldRegen) * multiplier;
  const regenCost = 5000 * (1 + stats.hullRegen) * multiplier;

  return (
    <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
      <div className="bg-slate-950 border border-cyan-500/50 rounded-lg w-full max-w-5xl h-[90vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)] relative">
        <div className="flex justify-between items-center p-6 border-b border-cyan-900/30 bg-black/20">
          <div className="flex items-center gap-3">
            <Zap className="text-cyan-400 animate-pulse" />
            <h2 className="text-2xl font-black text-white tracking-widest italic">SYSTEM UPGRADES</h2>
          </div>
          <div className="flex items-center gap-6">
             <div className="text-right">
                <div className="text-[10px] text-cyan-500 font-bold tracking-widest">AVAILABLE RESOURCES</div>
                <div className="text-2xl font-mono text-cyan-300">{Math.floor(stats.resources).toLocaleString()}</div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
          </div>
        </div>
        <div className="p-4 border-b border-cyan-900/30 flex gap-2 justify-center bg-black/20">
           {[1, 10, 100].map(m => (
             <button key={m} onClick={() => setMultiplier(m)} className={`px-6 py-2 rounded font-bold text-sm transition-all ${multiplier === m ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>x{m} Buy</button>
           ))}
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-10">
            
            {/* DRONE SECTION */}
            <div>
                <h3 className="text-lg font-black text-cyan-500 mb-6 border-b border-cyan-900/50 pb-2 tracking-[0.2em] flex items-center gap-2">
                    <Rocket size={20}/> DRONE UPGRADES
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* LOGISTICS */}
                    <div className="flex flex-col gap-4">
                        <div className="text-cyan-400 font-bold text-sm bg-cyan-900/20 py-1 px-3 rounded w-fit flex items-center gap-2"><Box size={14}/> LOGISTICS</div>
                        <div className="flex flex-wrap gap-4">
                            <SkillNode icon={Rocket} label="Thrusters" level={speedLvl} cost={speedCost} onClick={() => actions.buySpeed(multiplier)} disabled={stats.resources < speedCost} maxed={speedLvl >= 500} />
                            <SkillNode icon={Box} label="Cargo Hold" level={stats.cargoCapacity} cost={cargoCost} onClick={() => actions.buyCargo(multiplier)} disabled={stats.resources < cargoCost} />
                            <SkillNode icon={Wrench} label="Mining Laser" level={mineLvl} cost={mineCost} onClick={() => actions.buyMining(multiplier)} disabled={stats.resources < mineCost} />
                        </div>
                    </div>

                    {/* OFFENSE */}
                    <div className="flex flex-col gap-4">
                        <div className="text-red-400 font-bold text-sm bg-red-900/20 py-1 px-3 rounded w-fit flex items-center gap-2"><Sword size={14}/> OFFENSE</div>
                        <div className="flex flex-wrap gap-4">
                            <SkillNode icon={Sword} label="Damage Amp" level={dmgLvl} cost={dmgCost} onClick={() => actions.buyDamage(multiplier)} disabled={stats.resources < dmgCost} />
                            <SkillNode icon={Crosshair} label="Crit Lens" level={Math.floor(stats.critChance*100)} cost={critCost} onClick={() => actions.buyCrit(multiplier)} disabled={stats.resources < critCost} />
                        </div>
                    </div>

                    {/* DEFENSE */}
                    <div className="flex flex-col gap-4">
                         <div className="text-blue-400 font-bold text-sm bg-blue-900/20 py-1 px-3 rounded w-fit flex items-center gap-2"><Shield size={14}/> DURABILITY</div>
                        <div className="flex flex-wrap gap-4">
                             <SkillNode icon={Hammer} label="Drone HP" level={wallLvl} cost={wallCost} onClick={() => actions.buyWallHP(multiplier)} disabled={stats.resources < wallCost} />
                        </div>
                    </div>
                </div>
            </div>

            {/* MOTHERSHIP SECTION */}
            <div>
                <h3 className="text-lg font-black text-emerald-500 mb-6 border-b border-emerald-900/50 pb-2 tracking-[0.2em] flex items-center gap-2">
                    <Globe size={20}/> MOTHERSHIP UPGRADES
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* SYSTEMS */}
                    <div className="flex flex-col gap-4">
                        <div className="text-emerald-400 font-bold text-sm bg-emerald-900/20 py-1 px-3 rounded w-fit flex items-center gap-2"><Zap size={14}/> SYSTEMS</div>
                        <div className="flex flex-wrap gap-4">
                            <SkillNode icon={Shield} label="Shield Gen" level={shieldLvl} cost={shieldCost} onClick={() => actions.buyShield(multiplier)} disabled={stats.resources < shieldCost} />
                            <SkillNode icon={Zap} label="Shield Regen" level={Math.floor(stats.shieldRegen*5)} cost={shieldRegenCost} onClick={() => actions.buyShieldRegen(multiplier)} disabled={stats.resources < shieldRegenCost} />
                            <SkillNode icon={Heart} label="Hull Regen" level={Math.floor(stats.hullRegen*10)} cost={regenCost} onClick={() => actions.buyRegen(multiplier)} disabled={stats.resources < regenCost} />
                        </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex flex-col gap-4">
                        <div className="text-amber-400 font-bold text-sm bg-amber-900/20 py-1 px-3 rounded w-fit flex items-center gap-2"><Globe size={14}/> ACTIONS</div>
                        <div className="flex flex-col gap-3">
                             <button onClick={() => actions.buyAsteroid(multiplier)} disabled={stats.resources < 500*multiplier} className="flex items-center gap-4 px-5 py-3 bg-slate-800 rounded border border-slate-600 hover:border-emerald-400 hover:bg-slate-750 disabled:opacity-50 group transition-all">
                                <div className="p-2 bg-slate-900 rounded-md group-hover:bg-emerald-900/30 transition-colors">
                                    <Globe className="text-emerald-400" size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-sm text-white">Spawn Asteroid</div>
                                    <div className="text-xs text-amber-400 font-mono">{(500*multiplier).toLocaleString()} RES</div>
                                </div>
                            </button>
                            <button onClick={() => actions.repairHull()} disabled={stats.resources < 500 || stats.hullIntegrity >= 100} className="flex items-center gap-4 px-5 py-3 bg-slate-800 rounded border border-slate-600 hover:border-emerald-400 hover:bg-slate-750 disabled:opacity-50 group transition-all">
                                <div className="p-2 bg-slate-900 rounded-md group-hover:bg-emerald-900/30 transition-colors">
                                    <RefreshCw className="text-emerald-400" size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-sm text-white">Repair Hull</div>
                                    <div className="text-xs text-amber-400 font-mono">500 RES</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};