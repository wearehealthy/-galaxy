export interface GameState {
  resources: number;
  droneCount: number;
  droneSpeed: number;
  miningSpeed: number;
  cargoCapacity: number;
  critChance: number;
  shieldMax: number;
  shieldCurrent: number;
  shieldRegen: number;
  hullIntegrity: number;
  hullRegen: number;
  damageMultiplier: number;
  wallHP: number;
  attackMode: 'SWARM' | 'WALL';
  deploymentRatio: number;
  activeSquads: number;
  tutorialStep: number;
  enemiesDefeated: number;
  squads: { id: number; center: {x:number, y:number, z:number}; count: number; type: string }[];
  lagOptimization: boolean;
  softMaxDrones: number;
  customMaxDronesEnabled: boolean;
  graphicsQuality: 'HIGH' | 'LOW';
}

export interface GameConfig {
  container: HTMLElement;
  isTutorial: boolean;
  onStatsUpdate: (stats: GameState) => void;
  onBossSpawn: (active: boolean, hp: number, max: number, isFinal: boolean) => void;
  onMessage: (msg: string) => void;
  onGameOver: () => void;
  onGameWon: () => void;
}