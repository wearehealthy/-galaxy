import * as THREE from 'three';
import { GameConfig, GameState } from '../types';

export class GameEngine {
    config: GameConfig;
    container: HTMLElement;
    clock: THREE.Clock;
    isDisposed: boolean;
    paused: boolean = false;
    // Increased hard cap
    MAX_DRONES = 5000000; 
    // Increased render cap slightly so small swarms are always smooth
    OPTIMIZED_RENDER_CAP = 40000;
    
    // Performance optimization: Hard cap on visual laser lines drawn
    // Dynamic based on graphics settings
    MAX_VISUAL_LASERS = 1000;
    
    STATE_MINING_SEEK = 0;
    STATE_RETURNING = 2;
    STATE_ATTACKING = 3;

    state: GameState;
    gameTime = 0;
    lastEnemySpawn = 0;
    isGameOver = false;
    commands: any[] = [];
    nextCommandId = 0;
    enemies: any[] = [];
    asteroids: any[] = [];
    missiles: any[] = [];
    explosions: any[] = [];
    critRings: any[] = [];

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    isDrawing = false;
    isPanning = false;
    lastMousePos = new THREE.Vector2();
    pendingPath: THREE.Vector3[] = [];
    panDistance = 0;

    cameraTarget = new THREE.Vector3(0, 0, 0);
    cameraZoom = 400;
    cameraAngle = Math.PI / 2 - 0.1;

    // THREE Objects
    scene!: THREE.Scene;
    camera!: THREE.PerspectiveCamera;
    renderer!: THREE.WebGLRenderer;
    droneMesh!: THREE.InstancedMesh;
    miningLines!: THREE.LineSegments;
    miningLaserGeo!: THREE.BufferGeometry;
    pendingLine!: THREE.Line;
    pendingLineGeo!: THREE.BufferGeometry;
    cursorRing!: THREE.Mesh;
    mothershipGroup!: THREE.Group;
    msRing?: THREE.Object3D;
    msRingTop?: THREE.Object3D;
    shieldSphere!: THREE.Mesh;
    missileGroup!: THREE.Group;
    starField?: THREE.Points;

    // Arrays
    dronePos!: Float32Array;
    droneTargetId!: Int32Array;
    droneCommandId!: Int32Array;
    droneState!: Int8Array;
    droneLoad!: Float32Array;
    droneHP!: Float32Array;

    // Temps
    _dummy = new THREE.Object3D();
    _matrix = new THREE.Matrix4(); // Temp matrix
    _pos = new THREE.Vector3();
    _target = new THREE.Vector3();
    _dir = new THREE.Vector3();
    _color = new THREE.Color();
    _diff = new THREE.Vector3();

    constructor(config: GameConfig) {
        this.config = config;
        this.container = config.container;
        this.clock = new THREE.Clock();
        this.isDisposed = false;

        this.state = {
            resources: 0,
            droneCount: 1,
            droneSpeed: 1.0,
            miningSpeed: 1.0,
            cargoCapacity: 1,
            critChance: 0.05,
            shieldMax: 0,
            shieldCurrent: 0,
            shieldRegen: 0,
            hullIntegrity: 100,
            hullRegen: 0,
            damageMultiplier: 1,
            wallHP: 1, 
            attackMode: 'SWARM',
            deploymentRatio: 0.5,
            activeSquads: 0,
            tutorialStep: config.isTutorial ? 1 : 0,
            enemiesDefeated: 0,
            squads: [],
            lagOptimization: false,
            softMaxDrones: 2500000,
            customMaxDronesEnabled: false,
            graphicsQuality: 'HIGH'
        };

        // LOAD SETTINGS (Audio/Video prefs)
        try {
            const saved = localStorage.getItem('neon_swarm_config');
            if (saved) {
                const p = JSON.parse(saved);
                if(p.lag !== undefined) this.state.lagOptimization = p.lag;
                if(p.limit !== undefined) this.state.softMaxDrones = p.limit;
                if(p.custom !== undefined) this.state.customMaxDronesEnabled = p.custom;
                if(p.quality !== undefined) this.state.graphicsQuality = p.quality;
            }
        } catch(e) { console.error("Failed to load settings", e); }

        // LOAD GAME STATE if not tutorial
        if (!config.isTutorial) {
            this.loadGame();
        } else {
            this.state.resources = 50000;
            this.state.droneCount = 5000;
        }

        this.init();
    }

    saveSettings() {
        try {
            localStorage.setItem('neon_swarm_config', JSON.stringify({
                lag: this.state.lagOptimization,
                limit: this.state.softMaxDrones,
                custom: this.state.customMaxDronesEnabled,
                quality: this.state.graphicsQuality
            }));
        } catch(e) {}
    }

    saveGame() {
        if (this.config.isTutorial || this.isGameOver) return;
        try {
            const s = { ...this.state };
            // We don't save full squad paths/drones positions as it's too heavy.
            // Reset squads on load.
            s.squads = [];
            s.activeSquads = 0;
            localStorage.setItem('neon_swarm_save', JSON.stringify(s));
            console.log("Game Saved");
        } catch(e) { console.error("Save failed", e); }
    }

    loadGame() {
        try {
            const saved = localStorage.getItem('neon_swarm_save');
            if (saved) {
                const s = JSON.parse(saved);
                // Merge valid props
                this.state = { ...this.state, ...s };
                // Reset session specific stuff
                this.state.squads = [];
                this.state.activeSquads = 0;
                this.state.tutorialStep = 0; 
                console.log("Game Loaded");
            }
        } catch(e) { console.error("Load failed", e); }
    }

    init() {
        this.dronePos = new Float32Array(this.MAX_DRONES * 3);
        this.droneTargetId = new Int32Array(this.MAX_DRONES).fill(-1);
        this.droneCommandId = new Int32Array(this.MAX_DRONES).fill(-1);
        this.droneState = new Int8Array(this.MAX_DRONES).fill(this.STATE_MINING_SEEK);
        this.droneLoad = new Float32Array(this.MAX_DRONES).fill(0);
        this.droneHP = new Float32Array(this.MAX_DRONES).fill(1);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000510);
        this.scene.fog = new THREE.FogExp2(0x000510, 0.0008);

        this.camera = new THREE.PerspectiveCamera(60, this.container.clientWidth / this.container.clientHeight, 1, 10000);
        this.updateCamera();

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);

        this.applyGraphicsSettings();

        this.scene.add(new THREE.AmbientLight(0x404060, 2.0));
        const dirLight = new THREE.DirectionalLight(0xffffff, 3.0);
        dirLight.position.set(200, 500, 200);
        this.scene.add(dirLight);

        this.mothershipGroup = this.createMothership();
        this.scene.add(this.mothershipGroup);
        this.msRing = this.mothershipGroup.getObjectByName('ring');
        this.msRingTop = this.mothershipGroup.getObjectByName('ring2');
        
        const shieldGeo = new THREE.SphereGeometry(50, 64, 64);
        const shieldMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        this.shieldSphere = new THREE.Mesh(shieldGeo, shieldMat);
        this.shieldSphere.position.y = 30; 
        this.shieldSphere.visible = false;
        this.mothershipGroup.add(this.shieldSphere);

        this.missileGroup = new THREE.Group();
        this.scene.add(this.missileGroup);

        const droneGeo = new THREE.ConeGeometry(0.8, 2.5, 3);
        droneGeo.rotateX(Math.PI / 2);
        const droneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.droneMesh = new THREE.InstancedMesh(droneGeo, droneMat, this.MAX_DRONES);
        this.droneMesh.count = this.state.droneCount;
        this.droneMesh.frustumCulled = false;
        this.droneMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_DRONES * 3), 3);
        this.scene.add(this.droneMesh);

        // Buffer size fixed to max, but we draw less in LOW quality
        const maxVisualLasers = 1000;
        this.miningLaserGeo = new THREE.BufferGeometry();
        this.miningLaserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxVisualLasers * 2 * 3), 3));
        const miningMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthTest: false });
        this.miningLines = new THREE.LineSegments(this.miningLaserGeo, miningMat);
        this.miningLines.frustumCulled = false;
        this.scene.add(this.miningLines);

        this.pendingLineGeo = new THREE.BufferGeometry();
        this.pendingLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3000), 3));
        this.pendingLine = new THREE.Line(this.pendingLineGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
        this.pendingLine.frustumCulled = false;
        this.scene.add(this.pendingLine);

        this.cursorRing = new THREE.Mesh(
            new THREE.RingGeometry(2, 2.5, 16),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, opacity: 0.5, transparent: true, side: THREE.DoubleSide })
        );
        this.cursorRing.rotation.x = -Math.PI/2;
        this.scene.add(this.cursorRing);

        if (this.config.isTutorial) {
            for(let i=0; i<this.state.droneCount; i++) this.initDrone(i);
        } else {
            // Re-init drones based on saved count or default
            for(let i=0; i<this.state.droneCount; i++) this.initDrone(i);
        }
        this.spawnAsteroidInternal(true);

        window.addEventListener('resize', this.onWindowResize);
        this.container.addEventListener('mousedown', this.onMouseDown);
        this.container.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        this.container.addEventListener('wheel', this.onWheel, { passive: false });
        this.container.addEventListener('contextmenu', e => e.preventDefault());

        this.onWindowResize();
        this.animate();
    }

    applyGraphicsSettings() {
        const isHigh = this.state.graphicsQuality === 'HIGH';
        
        // 1. Pixel Ratio: Low = 1.0 (Crisp but fast), High = Device or 1.5
        this.renderer.setPixelRatio(isHigh ? Math.min(window.devicePixelRatio, 1.5) : 1.0);
        
        // 2. Starfield
        if (this.starField) {
            this.scene.remove(this.starField);
            this.starField.geometry.dispose();
            (this.starField.material as THREE.Material).dispose();
            this.starField = undefined;
        }
        this.createStarfield(isHigh ? 20000 : 4000);

        // 3. Laser Cap
        this.MAX_VISUAL_LASERS = isHigh ? 1000 : 200;
    }

    toggleGraphicsQuality() {
        this.state.graphicsQuality = this.state.graphicsQuality === 'HIGH' ? 'LOW' : 'HIGH';
        this.applyGraphicsSettings();
        this.saveSettings();
        this.config.onMessage(`GRAPHICS: ${this.state.graphicsQuality}`);
    }

    createStarfield(count: number = 20000) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'rgba(0,0,0,0)';
            ctx.fillRect(0, 0, 32, 32);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(16, 0);
            ctx.quadraticCurveTo(16, 16, 32, 16);
            ctx.quadraticCurveTo(16, 16, 16, 32);
            ctx.quadraticCurveTo(16, 16, 0, 16);
            ctx.quadraticCurveTo(16, 16, 16, 0);
            ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);

        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for(let i=0; i<count * 3; i++) pos[i] = (Math.random()-0.5)*15000;
        
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        
        const mat = new THREE.PointsMaterial({ 
            color: 0xffffff, 
            size: 15,
            map: texture, 
            transparent: true, 
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.starField = new THREE.Points(geo, mat);
        this.scene.add(this.starField);
    }

    createMothership() {
        const group = new THREE.Group();
        const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.3, metalness: 0.9, flatShading: true });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.9 });
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x002233, metalness: 0.8, roughness: 0.2 });
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });

        // Adjusted core: Radius 6, Height 30
        const core = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 30, 16), glowMat); 
        core.position.y = 15; // Centered vertically relative to height
        group.add(core);

        const b = new THREE.Mesh(new THREE.CylinderGeometry(15, 20, 15, 6), hullMat); b.position.y=7.5; group.add(b);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(10, 15, 20, 6), hullMat); m.position.y=25; group.add(m);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(6, 10, 25, 6), hullMat); t.position.y=47.5; group.add(t);
        const s = new THREE.Mesh(new THREE.ConeGeometry(2, 20, 8), hullMat); s.position.y=70; group.add(s);

        const r1Geo = new THREE.TorusGeometry(25, 2, 8, 64);
        const r1 = new THREE.Mesh(r1Geo, ringMat); r1.rotation.x = Math.PI/2; r1.position.y = 20; r1.name = 'ring'; r1.add(new THREE.LineSegments(new THREE.WireframeGeometry(r1Geo), lineMat)); group.add(r1);

        const r2Geo = new THREE.TorusGeometry(35, 1.5, 8, 64);
        const r2 = new THREE.Mesh(r2Geo, ringMat); r2.rotation.x = Math.PI/2.1; r2.rotation.y=0.1; r2.position.y=40; r2.name='ring2'; r2.add(new THREE.LineSegments(new THREE.WireframeGeometry(r2Geo), lineMat)); group.add(r2);

        for(let i=0; i<3; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(10, 40, 4), hullMat);
            const a = (i/3)*Math.PI*2;
            st.position.set(Math.cos(a)*12, 20, Math.sin(a)*12);
            st.rotation.y = -a; st.rotation.z = 0.2;
            group.add(st);
        }
        return group;
    }

    initDrone(i: number) {
        const ix = i * 3;
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 20;
        this.dronePos[ix] = Math.cos(a)*r;
        this.dronePos[ix+1] = 10 + Math.random()*10;
        this.dronePos[ix+2] = Math.sin(a)*r;
        this.droneState[i] = this.STATE_MINING_SEEK;
        this.droneTargetId[i] = -1;
        this.droneCommandId[i] = -1;
        this.droneLoad[i] = 0;
        this.droneHP[i] = 1;
        this._color.setHex(0x00ffaa);
        this.droneMesh.setColorAt(i, this._color);
    }

    updateCamera() {
        const y = this.cameraZoom * Math.sin(this.cameraAngle);
        const zOff = this.cameraZoom * Math.cos(this.cameraAngle);
        this.camera.position.set(this.cameraTarget.x, y, this.cameraTarget.z + zOff);
        this.camera.lookAt(this.cameraTarget);
    }

    onWindowResize = () => {
        if (!this.container) return;
        const width = this.container.clientWidth || 1;
        const height = this.container.clientHeight || 1;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    onWheel = (e: WheelEvent) => {
        if(e.ctrlKey) {
            this.cameraAngle = Math.max(0.1, Math.min(Math.PI/2 - 0.01, this.cameraAngle - e.deltaY * 0.002));
        } else {
            this.cameraZoom = Math.max(50, Math.min(2000, this.cameraZoom + e.deltaY * 0.5));
        }
        this.updateCamera();
    }

    onMouseDown = (e: MouseEvent) => {
        this.lastMousePos.set(e.clientX, e.clientY);
        if(e.button === 0) {
            this.isDrawing = true;
            this.pendingPath = [];
            this.updatePendingLine();
            this.updateMouse(e);
            this.addPathPoint();
        } else if(e.button === 2) {
            this.isPanning = true;
            this.panDistance = 0;
        }
    }

    onMouseMove = (e: MouseEvent) => {
        this.updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersect = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), this._target);
        if(intersect) {
            this.cursorRing.position.copy(intersect);
            this.cursorRing.position.y = 0.5;
        }

        if(this.isPanning) {
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.panDistance += Math.abs(dx) + Math.abs(dy);
            this.lastMousePos.set(e.clientX, e.clientY);
            const speed = this.cameraZoom * 0.002;
            this.cameraTarget.x -= dx * speed;
            this.cameraTarget.z -= dy * speed;
            this.updateCamera();
        }
        if(this.isDrawing) this.addPathPoint();
    }

    onMouseUp = (e: MouseEvent) => {
        if(e.button === 0) {
            this.isDrawing = false;
            if(this.pendingPath.length > 1) {
                this.createSquadFromPending();
                if(this.config.isTutorial && this.state.tutorialStep === 2) {
                     this.state.tutorialStep = 3;
                }
            } else { this.pendingPath = []; this.updatePendingLine(); }
        }
        if(e.button === 2) {
            if(this.panDistance < 10) this.checkSquadClick();
            this.isPanning = false;
        }
    }

    updateMouse(e: MouseEvent) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    addPathPoint() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersect = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), new THREE.Vector3());
        if(intersect) {
            if(this.pendingPath.length === 0 || this.pendingPath[this.pendingPath.length-1].distanceTo(intersect) > 5) {
                this.pendingPath.push(intersect);
                this.updatePendingLine();
            }
        }
    }

    updatePendingLine() {
        const pos = this.pendingLineGeo.attributes.position;
        const count = Math.min(this.pendingPath.length, 1000);
        for(let i=0; i<count; i++) pos.setXYZ(i, this.pendingPath[i].x, 2, this.pendingPath[i].z);
        this.pendingLineGeo.setDrawRange(0, count);
        const isWall = this.state.attackMode === 'WALL';
        (this.pendingLine.material as THREE.LineBasicMaterial).color.setHex(isWall ? 0x0088ff : 0xff0000);
        pos.needsUpdate = true;
    }

    interpolatePath(points: THREE.Vector3[], count: number) {
        if (!points || points.length < 2) return points;
        
        const newPoints = [];
        let totalLen = 0;
        const dists = [];
        for (let i = 0; i < points.length - 1; i++) {
            const d = points[i].distanceTo(points[i+1]);
            dists.push(d);
            totalLen += d;
        }

        if (totalLen <= 0.1) return points; 

        const step = totalLen / (count - 1);
        
        newPoints.push(points[0].clone());

        for (let i = 1; i < count - 1; i++) {
            const targetDist = i * step;
            let distSoFar = 0;
            let added = false;
            for (let j = 0; j < dists.length; j++) {
                const segLen = dists[j];
                if (targetDist <= distSoFar + segLen) {
                    const alpha = (targetDist - distSoFar) / segLen;
                    newPoints.push(new THREE.Vector3().lerpVectors(points[j], points[j+1], alpha));
                    added = true;
                    break;
                }
                distSoFar += segLen;
            }
            if (!added) newPoints.push(points[points.length - 1].clone());
        }
        
        newPoints.push(points[points.length - 1].clone());
        return newPoints;
    }

    createSquadFromPending() {
        if(this.pendingPath.length < 2) { this.pendingPath=[]; this.updatePendingLine(); return; }

        let avail = [];
        for(let i=0; i<this.state.droneCount; i++) {
            if(this.droneState[i] === this.STATE_MINING_SEEK || this.droneState[i] === this.STATE_RETURNING) avail.push(i);
        }

        let needed = Math.max(1, Math.floor(this.state.droneCount * this.state.deploymentRatio));
        
        if(avail.length === 0 && this.state.attackMode === 'WALL') {
            for(let i=0; i<this.state.droneCount; i++) {
                if(this.droneState[i] === this.STATE_ATTACKING) avail.push(i);
                if(avail.length >= needed) break;
            }
        }

        if(avail.length === 0) {
            this.config.onMessage("NO IDLE DRONES");
            this.pendingPath = [];
            this.updatePendingLine();
            return;
        }

        const id = ++this.nextCommandId;
        const type = this.state.attackMode;
        const color = type === 'WALL' ? 0x0088ff : 0xff0000;
        
        const lineGeo = new THREE.BufferGeometry().setFromPoints(this.pendingPath);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 }));
        line.position.y = 2;
        this.scene.add(line);

        const center = new THREE.Vector3();
        this.pendingPath.forEach(p => center.add(p));
        center.divideScalar(this.pendingPath.length);
        let maxD = 0;
        this.pendingPath.forEach(p => maxD = Math.max(maxD, center.distanceToSquared(p)));

        const spreadPoints = this.interpolatePath(this.pendingPath, 1000);

        const cmd = { 
            id, 
            type, 
            path: [...this.pendingPath], 
            spreadPoints, 
            lineMesh: line, 
            color, 
            center, 
            radius: Math.sqrt(maxD), 
            activeDroneCount: 0 
        };
        this.commands.push(cmd);
        this.state.activeSquads++;

        // Determine actual number of drones being assigned to calculate spread
        const dronesToAssign = avail.slice(0, needed);
        const totalAssigned = dronesToAssign.length;

        let assignedIndex = 0;
        for(let i of dronesToAssign) {
            this.droneState[i] = this.STATE_ATTACKING;
            this.droneCommandId[i] = id;
            this.droneHP[i] = type === 'WALL' ? this.state.wallHP : 1;
            
            // Distribute drones evenly across the entire spreadPoints array
            // even if there are fewer drones than points
            if (type === 'WALL' && totalAssigned > 1) {
                const ratio = assignedIndex / (totalAssigned - 1); // 0.0 to 1.0
                const targetIdx = Math.floor(ratio * (spreadPoints.length - 1));
                this.droneTargetId[i] = targetIdx;
            } else if (type === 'WALL') {
                this.droneTargetId[i] = 0;
            } else {
                this.droneTargetId[i] = 0;
            }
            
            assignedIndex++;
        }
        
        cmd.activeDroneCount = totalAssigned;

        this.config.onMessage(`SQUAD ALPHA-${id} DEPLOYED`);
        this.pendingPath = [];
        this.updatePendingLine();
    }

    checkSquadClick() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersect = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), 0), new THREE.Vector3());
        if(intersect) {
            for(let cmd of this.commands) {
                if(cmd.center.distanceToSquared(intersect) > (cmd.radius*cmd.radius + 2500)) continue;
                for(let i=0; i<cmd.path.length-1; i++) {
                    if(this.distToSegSq(intersect, cmd.path[i], cmd.path[i+1]) < 900) {
                        this.removeSquad(cmd.id, "SQUAD RECALLED");
                        return;
                    }
                }
            }
        }
    }

    distToSegSq(p: THREE.Vector3, v: THREE.Vector3, w: THREE.Vector3) {
        let l2 = v.distanceToSquared(w);
        if(l2 === 0) return p.distanceToSquared(v);
        let t = ((p.x - v.x)*(w.x - v.x) + (p.z - v.z)*(w.z - v.z)) / l2;
        t = Math.max(0, Math.min(1, t));
        return p.distanceToSquared(new THREE.Vector3(v.x + t*(w.x-v.x), 0, v.z + t*(w.z-v.z)));
    }

    removeSquad(id: number, reason: string) {
        const cmd = this.commands.find(c => c.id === id);
        if(cmd) {
            this.scene.remove(cmd.lineMesh);
            this.commands = this.commands.filter(c => c.id !== id);
            this.state.activeSquads = this.commands.length;
            for(let i=0; i<this.state.droneCount; i++) {
                if(this.droneCommandId[i] === id) {
                    this.droneState[i] = this.STATE_MINING_SEEK;
                    this.droneCommandId[i] = -1;
                    this.droneTargetId[i] = -1;
                }
            }
            if (this.commands.length === 0) {
                this.nextCommandId = 0;
            }
            if(reason) this.config.onMessage(reason);
        }
    }

    toggleLagOptimization() {
        this.state.lagOptimization = !this.state.lagOptimization;
        this.saveSettings();
        this.config.onMessage(`VISUAL OPTIMIZATION: ${this.state.lagOptimization ? 'ACTIVE' : 'DISABLED'}`);
    }

    toggleCustomMaxDrones() {
        this.state.customMaxDronesEnabled = !this.state.customMaxDronesEnabled;
        this.saveSettings();
    }

    setSoftMaxDrones(limit: number) {
        // Enforce hard cap but otherwise trust user input
        this.state.softMaxDrones = Math.max(100, Math.min(this.MAX_DRONES, limit));
        this.saveSettings();
    }

    spawnBoss(isFinal: boolean) {
        this.spawnEnemyInternal(isFinal);
    }

    advanceTutorial() {
        if(this.state.tutorialStep === 4) {
            this.state.tutorialStep = 5;
            this.spawnEnemyInternal(false, 'SCOUT', 0); // Spawn at specific angle
        }
    }

    createEnemyShip(type: 'SCOUT' | 'FIGHTER' | 'DREADNOUGHT' | 'FINAL') {
        const group = new THREE.Group();
        const hullMat = new THREE.MeshStandardMaterial({ color: 0x444455, metalness: 0.8, roughness: 0.2 });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        
        // Base Hull
        let coreGeo, wingGeo, scale = 1;
        if (type === 'SCOUT') {
            scale = 1;
            coreGeo = new THREE.ConeGeometry(2, 10, 4);
            coreGeo.rotateX(Math.PI/2);
        } else if (type === 'FIGHTER') {
            scale = 2;
            coreGeo = new THREE.BoxGeometry(4, 2, 12);
        } else { // Dreadnought / Final
            scale = type === 'FINAL' ? 10 : 6;
            coreGeo = new THREE.CylinderGeometry(3, 5, 15, 6);
            coreGeo.rotateX(Math.PI/2);
        }
        
        const core = new THREE.Mesh(coreGeo, hullMat);
        group.add(core);

        // Wings/Engines
        if (type === 'SCOUT') {
             const w1 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 4), hullMat);
             w1.position.z = 2;
             group.add(w1);
        } else if (type === 'FIGHTER') {
             const w1 = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 3), hullMat);
             w1.rotateZ(Math.PI/2); w1.position.x = 4;
             group.add(w1);
             const w2 = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 3), hullMat);
             w2.rotateZ(-Math.PI/2); w2.position.x = -4;
             group.add(w2);
        } else {
             const w1 = new THREE.Mesh(new THREE.BoxGeometry(15, 2, 10), hullMat);
             group.add(w1);
             const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 6), hullMat);
             bridge.position.y = 4; bridge.position.z = -2;
             group.add(bridge);
        }

        // Engine Glow
        const engine = new THREE.Mesh(new THREE.SphereGeometry(scale, 8, 8), glowMat);
        engine.position.z = scale * 2;
        group.add(engine);

        // FULL SPHERE SHIELD (Covering fully)
        // Scaled up to cover the ship completely
        const shieldGeo = new THREE.SphereGeometry(scale * 6, 32, 32); 
        const shieldMat = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.name = 'shield';
        group.add(shield);

        group.scale.setScalar(scale);
        return group;
    }

    spawnWave() {
        if(this.config.isTutorial) return;

        const diff = this.state.enemiesDefeated;
        let composition: Array<'SCOUT' | 'FIGHTER' | 'DREADNOUGHT'> = ['SCOUT'];
        
        if (diff > 5) composition = ['SCOUT', 'SCOUT'];
        if (diff > 15) composition = ['SCOUT', 'SCOUT', 'FIGHTER'];
        if (diff > 30) composition = ['FIGHTER', 'FIGHTER', 'SCOUT', 'SCOUT'];
        if (diff > 50) composition = ['DREADNOUGHT', 'FIGHTER', 'SCOUT'];

        if (this.enemies.length > 20) return; // Cap living enemies

        // Spawn cluster
        const angleBase = Math.random() * Math.PI * 2;
        
        composition.forEach((type, i) => {
            const offset = (i - composition.length/2) * 0.2;
            this.spawnEnemyInternal(false, type, angleBase + offset);
        });
        
        this.lastEnemySpawn = this.gameTime;
    }

    spawnEnemyInternal(isFinal: boolean, forcedType?: string, angleOverride?: number) {
        let type: 'SCOUT' | 'FIGHTER' | 'DREADNOUGHT' | 'FINAL' = 'SCOUT';
        let hp = 50000;
        let shield = 20000;
        
        if (isFinal) {
            type = 'FINAL';
            hp = 10000000;
            shield = 5000000;
        } else if (forcedType) {
            type = forcedType as any;
             // Scaling based on progress even for forced types
            const diff = this.state.enemiesDefeated;
            const baseHp = 50000 * Math.pow(1.5, diff);
            hp = baseHp;
            shield = hp * 0.5;
            if (type === 'SCOUT') { hp *= 0.5; shield *= 0.3; }
            if (type === 'DREADNOUGHT') { hp *= 3; shield *= 2; }
        } else {
            // Fallback (should be called via spawnWave mostly)
            const diff = this.state.enemiesDefeated;
            if (diff > 10) type = 'FIGHTER';
            if (diff > 25) type = 'DREADNOUGHT';
            hp = 50000 * Math.pow(1.5, diff);
            shield = hp * 0.5;
        }

        const group = this.createEnemyShip(type);
        
        const angle = angleOverride ?? Math.random() * Math.PI * 2;
        group.position.set(Math.cos(angle)*1200, 20, Math.sin(angle)*1200);
        group.userData = { hp, maxHp: hp, shield, maxShield: shield, isFinal, fireTimer: 0, type };
        
        this.scene.add(group);
        this.enemies.push(group);
        
        if (isFinal || this.enemies.length === 1) {
            this.config.onBossSpawn(true, hp + shield, hp + shield, isFinal);
            this.config.onMessage(isFinal ? "OMEGA THREAT DETECTED" : "HOSTILES INBOUND");
        }
    }

    spawnMissile(start: THREE.Vector3, target: THREE.Vector3, dmg=10) {
        const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(1, 4, 4), new THREE.MeshBasicMaterial({ color: 0xff4400 }));
        mesh.position.copy(start);
        mesh.lookAt(target);
        mesh.rotateX(Math.PI/2);
        this.missileGroup.add(mesh);
        const dir = new THREE.Vector3().subVectors(target, start).normalize();
        this.missiles.push({ mesh, velocity: dir.multiplyScalar(50), active: true, damage: dmg });
    }

    spawnAsteroidInternal(fromShop: boolean = false) {
        const g = new THREE.Group();
        const r = 6 + Math.random()*6;
        
        let geo;
        const type = Math.random();
        if (type < 0.33) geo = new THREE.DodecahedronGeometry(r);
        else if (type < 0.66) geo = new THREE.OctahedronGeometry(r);
        else geo = new THREE.TetrahedronGeometry(r); // Jagged

        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x888899, flatShading: true, roughness: 0.8 }));
        
        // Random shape distortion
        mesh.scale.set(0.8+Math.random()*0.4, 0.8+Math.random()*0.4, 0.8+Math.random()*0.4);
        
        g.add(mesh);
        const a = Math.random()*Math.PI*2;
        // Logic change: Shop asteroids spawn much closer (110-200), others further (250-700)
        // This includes the first tutorial asteroid which calls this with true.
        const dist = fromShop ? (110 + Math.random() * 90) : (250 + Math.random() * 450); 

        g.position.set(Math.cos(a)*dist, 0, Math.sin(a)*dist);
        g.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        
        // Start small for pop-in effect
        g.scale.setScalar(0.01);
        
        g.userData = { 
            rotSpeed: new THREE.Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2),
            spawnAnim: true // flag to animate scale
        };
        
        this.asteroids.push(g);
        this.scene.add(g);

        // Flash effect at position for shop asteroids
        if (fromShop) {
             const flash = new THREE.PointLight(0x00ffff, 2, 100);
             flash.position.copy(g.position);
             this.scene.add(flash);
             setTimeout(() => this.scene.remove(flash), 200);
        }
    }

    spawnCritRing(pos: THREE.Vector3) {
        const r = new THREE.Mesh(
            new THREE.RingGeometry(2, 2.5, 8),
            new THREE.MeshBasicMaterial({ color: 0xaa00aa, transparent: true, side: THREE.DoubleSide })
        );
        r.position.copy(pos);
        r.lookAt(this.camera.position); 
        this.scene.add(r);
        this.critRings.push({ mesh: r, age: 0 });
    }

    animate = () => {
        if(this.isDisposed) return;
        requestAnimationFrame(this.animate);
        
        // PAUSE LOGIC
        if (this.paused) {
             // Keep rendering but do not update game state
             this.renderer.render(this.scene, this.camera);
             return;
        }

        let dt = this.clock.getDelta();
        if(dt > 0.1) dt = 0.1;
        this.gameTime += dt;

        // Auto spawn wave
        if (!this.config.isTutorial && this.gameTime > this.lastEnemySpawn + 30) {
            if (this.enemies.length === 0) {
                this.spawnWave();
            }
        }

        // Animate Rings
        if(this.msRing) {
            this.msRing.rotation.z -= dt * 0.2; 
        }
        if(this.msRingTop) {
            this.msRingTop.rotation.z += dt * 0.05; 
        }

        // Animate Asteroids
        for(const ast of this.asteroids) {
            if(ast.userData.rotSpeed) {
                ast.rotation.x += ast.userData.rotSpeed.x * dt;
                ast.rotation.y += ast.userData.rotSpeed.y * dt;
                ast.rotation.z += ast.userData.rotSpeed.z * dt;
            }
             // Spawn animation (Pop-in)
            if(ast.userData.spawnAnim) {
                ast.scale.lerp(new THREE.Vector3(1,1,1), dt * 10);
                if(ast.scale.x > 0.99) {
                    ast.scale.set(1,1,1);
                    ast.userData.spawnAnim = false;
                }
            }
        }

        // Update Crit Rings
        for(let i=this.critRings.length-1; i>=0; i--) {
            const c = this.critRings[i];
            c.age += dt;
            c.mesh.scale.multiplyScalar(1.1);
            c.mesh.material.opacity = 1 - (c.age / 0.4);
            if(c.age > 0.4) {
                this.scene.remove(c.mesh);
                this.critRings.splice(i,1);
            }
        }

        this.shieldSphere.visible = this.state.shieldCurrent > 0;
        if(this.shieldSphere.visible) {
            const mat = this.shieldSphere.material;
            if (mat && !Array.isArray(mat)) {
                (mat as THREE.MeshStandardMaterial).opacity = 0.1 + (this.state.shieldCurrent/this.state.shieldMax)*0.2;
            }
        }

        // Apply Shield Regen
        if (this.state.shieldCurrent < this.state.shieldMax && this.state.shieldRegen > 0) {
            this.state.shieldCurrent = Math.min(this.state.shieldMax, this.state.shieldCurrent + this.state.shieldRegen * dt * 20);
        }

        this.updateMissiles(dt);
        this.updateDrones(dt);
        this.updateExplosions(dt);

        for(let i=this.enemies.length-1; i>=0; i--) {
            const e = this.enemies[i];
            
            // Shield Visuals
            const shieldMesh = e.getObjectByName('shield') as THREE.Mesh;
            if (shieldMesh && e.userData.shield > 0) {
                 const mat = shieldMesh.material;
                 if(!Array.isArray(mat)) {
                    const m = mat as THREE.MeshBasicMaterial;
                    m.opacity = Math.max(0, m.opacity - dt * 2);
                 }
            }

            if(e.userData.hp <= 0) {
                this.scene.remove(e);
                this.enemies.splice(i,1);
                
                // Tutorial Victory Check
                if (this.config.isTutorial && this.state.tutorialStep === 5) {
                    this.state.tutorialStep = 6;
                }

                const reward = e.userData.isFinal ? 1000000 : (this.state.enemiesDefeated === 0 ? 5000 : 50000);
                this.state.resources += reward;
                this.state.enemiesDefeated++;
                
                if (this.enemies.length === 0) {
                    this.config.onBossSpawn(false, 0, 0, false);
                }
                
                if(e.userData.isFinal) { this.isGameOver=true; this.config.onGameWon(); }
                continue;
            }
            if(e.position.length() > 80) {
                e.position.multiplyScalar(1 - dt*0.05);
                e.lookAt(0,0,0);
            } else if (this.config.isTutorial && this.state.tutorialStep === 5) {
                // TUTORIAL SCRIPTED DEATH: Enemy gets close, dies
                e.userData.hp = 0;
                this.createExplosion(e.position);
            }

            e.userData.fireTimer += dt;
            if (e.userData.fireTimer > 0.5) {
                if (Math.random() < 0.3) {
                    // DAMAGE SCALING
                    // First enemy deals 0.5 damage.
                    // Subsequent scaling: 1 + (defeated * 0.2)
                    let dmg = 1 + (this.state.enemiesDefeated * 0.2);
                    if (this.state.enemiesDefeated === 0) dmg = 0.5;

                    this.spawnMissile(e.position, new THREE.Vector3(0,0,0), dmg);
                }
                e.userData.fireTimer = 0;
            }
            if(i===0) this.config.onBossSpawn(true, e.userData.hp + e.userData.shield, e.userData.maxHp + e.userData.maxShield, e.userData.isFinal);
        }

        for(let i = this.commands.length - 1; i >= 0; i--) {
            if(this.commands[i].activeDroneCount <= 0) {
                this.removeSquad(this.commands[i].id, "");
            }
        }

        if(this.enemies.length === 0) {
            if(this.state.hullRegen > 0 && this.state.hullIntegrity < 100) this.state.hullIntegrity += dt*this.state.hullRegen;
            if(this.state.shieldCurrent < this.state.shieldMax) this.state.shieldCurrent += dt*50;
        }

        this.state.squads = this.commands.map(c => ({
            id: c.id,
            center: {x: c.center.x, y: c.center.y, z: c.center.z},
            count: c.activeDroneCount,
            type: c.type
        }));

        this.config.onStatsUpdate(this.state);
        this.renderer.render(this.scene, this.camera);
    }
    
    updateExplosions(dt: number) {
         for(let i=this.explosions.length-1; i>=0; i--) {
            const e = this.explosions[i];
            e.age += dt;
            if(e.age > e.maxAge) {
                this.scene.remove(e.mesh);
                this.explosions.splice(i,1);
            } else {
                const positions = e.mesh.geometry.attributes.position;
                for(let j=0; j<positions.count; j++) {
                    positions.setY(j, positions.getY(j) + dt * 5); 
                }
                positions.needsUpdate = true;
                const mat = e.mesh.material;
                if (!Array.isArray(mat)) {
                    const m = mat as THREE.PointsMaterial;
                    m.opacity = 1 - (e.age/e.maxAge);
                }
            }
        }
    }

    updateMissiles(dt: number) {
        // Collect damage for walls randomly
        const damageCandidates = new Map<number, number[]>(); // CommandID -> Array of Drone Indices

        for(let i=this.missiles.length-1; i>=0; i--) {
            const m = this.missiles[i];
            m.mesh.position.addScaledVector(m.velocity, dt);
            
            let hit = false;
            let hitCmdId = -1;

            for(let cmd of this.commands) {
                if(cmd.type === 'WALL' && m.mesh.position.distanceToSquared(cmd.center) < (cmd.radius*cmd.radius + 3000)) {
                    for(let k=0; k<cmd.path.length-1; k++) {
                        if(this.distToSegSq(m.mesh.position, cmd.path[k], cmd.path[k+1]) < 100) {
                            hit = true;
                            hitCmdId = cmd.id;
                            break;
                        }
                    }
                }
                if(hit) break;
            }

            if(hit) {
                const flash = new THREE.PointLight(0x0088ff, 1, 50);
                flash.position.copy(m.mesh.position);
                this.scene.add(flash);
                setTimeout(() => this.scene.remove(flash), 100);

                this.missileGroup.remove(m.mesh);
                this.missiles.splice(i, 1);
                this.createExplosion(m.mesh.position);
                
                if (!damageCandidates.has(hitCmdId)) damageCandidates.set(hitCmdId, []);
                damageCandidates.get(hitCmdId)!.push(m.damage); 

                continue;
            }

            if(m.mesh.position.lengthSq() < 900) {
                this.missileGroup.remove(m.mesh);
                this.missiles.splice(i,1);
                if(this.state.shieldCurrent > 0) this.state.shieldCurrent -= m.damage * 2;
                else {
                    this.state.hullIntegrity -= m.damage;
                    if(this.state.hullIntegrity <= 0) { this.isGameOver = true; this.config.onGameOver(); }
                }
            } else if(m.mesh.position.lengthSq() > 2000000) {
                this.missileGroup.remove(m.mesh);
                this.missiles.splice(i,1);
            }
        }

        if(damageCandidates.size > 0) {
            const squadMembers = new Map<number, number[]>();
            
            for(let i=0; i<this.state.droneCount; i++) {
                const cid = this.droneCommandId[i];
                if (damageCandidates.has(cid)) {
                    if (!squadMembers.has(cid)) squadMembers.set(cid, []);
                    squadMembers.get(cid)!.push(i);
                }
            }

            const deadIndices = new Set<number>();

            damageCandidates.forEach((damages, cid) => {
                const members = squadMembers.get(cid);
                if (members && members.length > 0) {
                    for (let h=0; h<damages.length; h++) {
                        let attempts = 0;
                        let targetIdx = -1;
                        // Try 5 times to find a living member to distribute damage
                        while(attempts < 5) {
                            const rIdx = Math.floor(Math.random() * members.length);
                            const idx = members[rIdx];
                            if (this.droneHP[idx] > 0) {
                                targetIdx = idx;
                                break;
                            }
                            attempts++;
                        }

                        if (targetIdx !== -1) {
                            this.droneHP[targetIdx] -= damages[h];
                            if(this.droneHP[targetIdx] <= 0) {
                                deadIndices.add(targetIdx);
                                const cmd = this.commands.find(c => c.id === cid);
                                if(cmd) cmd.activeDroneCount = Math.max(0, cmd.activeDroneCount - 1);
                            }
                        }
                    }
                }
            });

            // Remove all dead drones in descending order to preserve index validity during splice
            if (deadIndices.size > 0) {
                const sortedDead = Array.from(deadIndices).sort((a, b) => b - a);
                for (const idx of sortedDead) {
                    this.removeDrone(idx);
                }
            }
        }
    }

    createExplosion(pos: THREE.Vector3) {
         const count = 30;
         const geo = new THREE.BufferGeometry();
         const positions = new Float32Array(count * 3);
         for(let i=0; i<count*3; i++) positions[i] = pos.getComponent(i%3) + (Math.random()-0.5)*10;
         geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
         const mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffaa00, size: 6 }));
         this.scene.add(mesh);
         this.explosions.push({ mesh, age: 0, maxAge: 1.5 });
    }

    updateDrones(dt: number) {
        const dCount = this.state.droneCount;
        if(dCount === 0) {
            this.miningLaserGeo.setDrawRange(0, 0);
            return;
        }

        const laserPos = this.miningLaserGeo.attributes.position;
        let lIdx = 0; // Local laser index tracker
        
        // --- RENDERING STRATEGY ---
        // If Optimized: 
        //   - Render Limit = 40,000.
        //   - Drones [0 - 40,000] updated EVERY FRAME (Stride 1) for smoothness.
        //   - Drones [40,000 - dCount] updated with STRIDE for background simulation.
        // If NOT Optimized:
        //   - Render Limit = dCount (can be 10M).
        //   - All drones processed with stride to prevent browser crash.
        //   - We allow user to try rendering 10M but logic stride must throttle updates.

        // FIX: Ensure visibleCap never exceeds actual droneCount to prevent ghost drones
        const renderLimit = this.state.lagOptimization ? this.OPTIMIZED_RENDER_CAP : this.MAX_DRONES;
        const visibleCap = Math.min(dCount, renderLimit);
        
        // --- LOOP 1: VISIBLE / HIGH PRIORITY DRONES ---
        // We iterate from 0 to visibleCap.
        // If lag optimized, visibleCap is small (40k). We iterate ALL of them (stride 1).
        // If NOT optimized, visibleCap is huge (10M). We MUST stride.
        
        let fgStride = 1;
        if (!this.state.lagOptimization && visibleCap > 50000) {
             fgStride = Math.ceil(visibleCap / 50000); // Target ~50k updates/frame
        }
        
        const fgOffset = this.renderer.info.render.frame % fgStride;
        const fgMove = this.state.droneSpeed * 20 * dt * fgStride;
        
        // Main Loop for Visible Drones
        // Laser Logic: Only visible drones draw lasers.
        const asteroidCount = this.asteroids.length;
        const cmdMap = new Map<number, any>();
        this.commands.forEach(c => cmdMap.set(c.id, c));
        
        // Helper function for logic to avoid duplication
        const updateSingleDrone = (i: number, move: number, stride: number, updateVisuals: boolean) => {
             const ix = i*3;
             this._pos.set(this.dronePos[ix], this.dronePos[ix+1], this.dronePos[ix+2]);
             const state = this.droneState[i];
             
             if (state === this.STATE_ATTACKING) {
                const cid = this.droneCommandId[i];
                const cmd = cmdMap.get(cid);
                
                if(!cmd) {
                    this.droneState[i] = this.STATE_MINING_SEEK; 
                    return; 
                }
                
                if(updateVisuals) {
                    this._color.setHex(cmd.color);
                    if(dCount > 10000) this._color.multiplyScalar(0.8);
                    this.droneMesh.setColorAt(i, this._color);
                }
                
                let tIdx = this.droneTargetId[i];
                
                if(cmd.type === 'WALL') {
                    const pts = cmd.spreadPoints;
                    if(tIdx >= pts.length) tIdx = tIdx % pts.length;
                    this._target.copy(pts[tIdx]);

                    if(this._pos.distanceTo(this._target) > 1) {
                         this._dir.subVectors(this._target, this._pos).normalize();
                         this._pos.addScaledVector(this._dir, move);
                    }
                } else {
                    const pts = cmd.path;
                    if(tIdx >= pts.length) tIdx = 0;
                    this._target.copy(pts[tIdx]);

                    if(this._pos.distanceTo(this._target) < move) {
                        this._pos.copy(this._target);
                        if(tIdx < pts.length-1) this.droneTargetId[i]++;
                        else { 
                            this.droneState[i] = this.STATE_MINING_SEEK; 
                            this.droneCommandId[i] = -1; 
                            this.droneTargetId[i] = -1;
                            cmd.activeDroneCount--;
                            if(cmd.activeDroneCount <= 0) this.removeSquad(cmd.id, "PATH COMPLETE");
                            return;
                        }
                    } else {
                        this._dir.subVectors(this._target, this._pos).normalize();
                        this._pos.addScaledVector(this._dir, move);
                    }
                    
                    if(this.enemies.length > 0) {
                        const enemy = this.enemies[0];
                        if(this._pos.distanceToSquared(enemy.position) < 2500) {
                            let dmg = 2 * this.state.damageMultiplier;
                            let isCrit = Math.random() < this.state.critChance;
                            if(isCrit) dmg *= 3;
                            dmg *= stride; 
                            
                            if (isCrit && Math.random() < 0.3) {
                                this.spawnCritRing(enemy.position.clone().add(new THREE.Vector3((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10)));
                            }
                            
                            this._dir.subVectors(new THREE.Vector3(0,0,0), enemy.position).normalize();
                            this._diff.subVectors(this._pos, enemy.position).normalize();
                            const dot = this._dir.dot(this._diff);
                            
                            if (dot > -0.2 && enemy.userData.shield > 0) {
                                enemy.userData.shield -= dmg;
                                const sMesh = enemy.getObjectByName('shield') as THREE.Mesh;
                                if(sMesh) {
                                    const mat = sMesh.material;
                                    if(!Array.isArray(mat)) (mat as THREE.MeshBasicMaterial).opacity = 0.6;
                                }
                                if(enemy.userData.shield < 0) {
                                    enemy.userData.hp += enemy.userData.shield; 
                                    enemy.userData.shield = 0;
                                }
                            } else {
                                enemy.userData.hp -= dmg;
                                if (enemy.userData.shield > 0) enemy.userData.hp -= dmg * 0.5;
                            }
                        }
                    }
                }
             } else if (state === this.STATE_MINING_SEEK) {
                if(updateVisuals) {
                    this._color.setHex(0x00ffaa);
                    if(dCount > 10000) this._color.multiplyScalar(0.7);
                    this.droneMesh.setColorAt(i, this._color);
                }

                let tId = this.droneTargetId[i];
                if(tId === -1 || !this.asteroids[tId]) {
                    if(asteroidCount > 0) {
                        this.droneTargetId[i] = i % asteroidCount;
                    } else { this._target.set(0,30,0); }
                }
                if(this.asteroids[this.droneTargetId[i]]) {
                    const ast = this.asteroids[this.droneTargetId[i]];
                    this._target.copy(ast.position);
                    this._target.x += Math.sin(this.gameTime + i)*20;
                    this._target.z += Math.cos(this.gameTime + i)*20;
                    
                    if(this._pos.distanceToSquared(ast.position) < 3000) {
                        this.droneLoad[i] += dt * stride * 10 * this.state.miningSpeed;
                        if(updateVisuals && lIdx < this.MAX_VISUAL_LASERS * 2) {
                            laserPos.setXYZ(lIdx++, this._pos.x, this._pos.y, this._pos.z);
                            laserPos.setXYZ(lIdx++, ast.position.x, ast.position.y, ast.position.z);
                        }
                        if(this.droneLoad[i] >= this.state.cargoCapacity) this.droneState[i] = this.STATE_RETURNING;
                    }
                }
                this._dir.subVectors(this._target, this._pos).normalize();
                this._pos.addScaledVector(this._dir, move);
             } else if (state === this.STATE_RETURNING) {
                if(updateVisuals) {
                    this._color.setHex(0x00ffaa);
                    if(dCount > 10000) this._color.multiplyScalar(0.7);
                    this.droneMesh.setColorAt(i, this._color);
                }

                this._target.set(0,10,0);
                if(this._pos.distanceTo(this._target) < 10) {
                    this.state.resources += Math.floor(this.droneLoad[i]);
                    this.droneLoad[i] = 0;
                    this.droneState[i] = this.STATE_MINING_SEEK;
                    this.droneTargetId[i] = -1;
                } else {
                    this._dir.subVectors(this._target, this._pos).normalize();
                    this._pos.addScaledVector(this._dir, move);
                }
             }

             this.dronePos[ix] = this._pos.x;
             this.dronePos[ix+1] = this._pos.y;
             this.dronePos[ix+2] = this._pos.z;
             
             if(updateVisuals) {
                 this._dummy.position.copy(this._pos);
                 this._dummy.lookAt(this._target);
                 this._dummy.scale.set(1,1,1);
                 this._dummy.updateMatrix();
                 this.droneMesh.setMatrixAt(i, this._dummy.matrix);
             }
        };

        // LOOP 1: VISIBLE
        for(let i=fgOffset; i < visibleCap; i+=fgStride) {
             updateSingleDrone(i, fgMove, fgStride, true);
        }

        // LOOP 2: HIDDEN (Background Simulation)
        if (dCount > visibleCap) {
             // We can use a huge stride for background to save CPU.
             // Target ~10k updates per frame maximum for background.
             const bgCount = dCount - visibleCap;
             const bgStride = Math.max(1, Math.ceil(bgCount / 10000));
             const bgOffset = this.renderer.info.render.frame % bgStride;
             const bgMove = this.state.droneSpeed * 20 * dt * bgStride;

             for(let i=visibleCap + bgOffset; i < dCount; i+=bgStride) {
                  // No visual update, no lasers
                  updateSingleDrone(i, bgMove, bgStride, false);
             }
        }

        this.droneMesh.count = visibleCap;

        if (this.droneMesh.instanceMatrix) {
            this.droneMesh.instanceMatrix.needsUpdate = true;
            const matrixAttr = this.droneMesh.instanceMatrix as any;
            if (matrixAttr.updateRange) {
                matrixAttr.updateRange.offset = 0;
                matrixAttr.updateRange.count = visibleCap * 16;
            }
        }

        if (this.droneMesh.instanceColor) {
            this.droneMesh.instanceColor.needsUpdate = true;
            const colorAttr = this.droneMesh.instanceColor as any;
            if (colorAttr.updateRange) {
                colorAttr.updateRange.offset = 0;
                colorAttr.updateRange.count = visibleCap * 3;
            }
        }

        this.miningLaserGeo.setDrawRange(0, lIdx);
        if (laserPos) {
            laserPos.needsUpdate = true;
            const attr = laserPos as any;
            if (attr.updateRange) {
                attr.updateRange.offset = 0;
                attr.updateRange.count = lIdx * 3;
            }
        }
    }

    removeDrone(i: number) {
        const last = this.state.droneCount - 1;
        if(i !== last) {
            this.droneState[i] = this.droneState[last];
            this.droneTargetId[i] = this.droneTargetId[last];
            this.droneCommandId[i] = this.droneCommandId[last];
            this.droneLoad[i] = this.droneLoad[last];
            this.droneHP[i] = this.droneHP[last];
            this.dronePos[i*3] = this.dronePos[last*3];
            this.dronePos[i*3+1] = this.dronePos[last*3+1];
            this.dronePos[i*3+2] = this.dronePos[last*3+2];
            
            // VISUAL FIX: Immediately update the swapped instance to the new drone's state
            // to prevent the "ghost" of the dead drone from lingering.
            this.droneMesh.getColorAt(last, this._color);
            this.droneMesh.setColorAt(i, this._color);
            
            this.droneMesh.getMatrixAt(last, this._matrix);
            this.droneMesh.setMatrixAt(i, this._matrix);
            
            if(this.droneMesh.instanceColor) this.droneMesh.instanceColor.needsUpdate = true;
            if(this.droneMesh.instanceMatrix) this.droneMesh.instanceMatrix.needsUpdate = true;
        }
        this.state.droneCount--;
    }

    buyDrones(amt: number, cost: number) { 
        if (this.state.resources < 1) return; 

        if(this.config.isTutorial && this.state.tutorialStep === 1) {
             this.state.tutorialStep = 2;
        }

        let limit = this.MAX_DRONES;
        if (this.state.customMaxDronesEnabled) {
            limit = Math.min(this.MAX_DRONES, this.state.softMaxDrones);
        }

        const availableSpace = limit - this.state.droneCount;

        if (availableSpace <= 0) {
            this.config.onMessage(this.state.customMaxDronesEnabled ? "CUSTOM LIMIT REACHED" : "SYSTEM CAPACITY REACHED");
            return;
        }

        let actualAmount = amt;
        let actualCost = cost;

        if (actualAmount > availableSpace) {
            actualAmount = availableSpace;
            const unitCost = cost / amt;
            actualCost = Math.ceil(unitCost * actualAmount);
        }

        if (this.state.resources >= actualCost) {
            this.state.resources -= actualCost; 
            const s = this.state.droneCount; 
            const e = s + actualAmount; 
            for(let i=s; i<e; i++) this.initDrone(i); 
            this.state.droneCount = e; 
            this.droneMesh.count = e; 
            
            if (actualAmount < amt) {
                 this.config.onMessage(`PARTIAL FILL: +${actualAmount.toLocaleString()}`);
            }
        }
    }

    buySpeed(m: number) { const c = Math.floor(500 * (1+Math.round((this.state.droneSpeed-1)/0.1)) * m); if(this.state.resources >= c) { this.state.resources -= c; this.state.droneSpeed += 0.1*m; } }
    buyMining(m: number) { const c = Math.floor(800 * (1+Math.round((this.state.miningSpeed-1)/0.2)) * m); if(this.state.resources >= c) { this.state.resources -= c; this.state.miningSpeed += 0.2*m; } }
    buyCargo(m: number) { const c = 1000 * this.state.cargoCapacity * m; if(this.state.resources >= c) { this.state.resources -= c; this.state.cargoCapacity += 1*m; } }
    buyCrit(m: number) { const c = 2000 * (1 + Math.floor(this.state.critChance * 10)) * m; if (this.state.resources >= c) { this.state.resources -= c; this.state.critChance += 0.01 * m; } }
    buyShield(m: number) { const c = 5000 * (1 + (this.state.shieldMax / 500)) * m; if (this.state.resources >= c) { this.state.resources -= c; this.state.shieldMax += 100 * m; this.state.shieldCurrent = this.state.shieldMax; } }
    buyRegen(m: number) { const c = 5000 * (1 + this.state.hullRegen) * m; if (this.state.resources >= c) { this.state.resources -= c; this.state.hullRegen += 0.1 * m; } }
    buyDamage(m: number) { const c = 5000 * Math.round(this.state.damageMultiplier) * m; if(this.state.resources >= c) { this.state.resources -= c; this.state.damageMultiplier += 0.1*m; } }
    buyWallHP(m: number) { const c = 3000 * (this.state.wallHP - 1) * m; if(this.state.resources >= c) { this.state.resources -= c; this.state.wallHP += 1*m; } }
    buyAsteroid(m: number) { if(this.state.resources >= 500*m) { this.state.resources -= 500*m; for(let i=0; i<m; i++) this.spawnAsteroidInternal(true); } }
    repairHull() { if (this.state.hullIntegrity < 100 && this.state.resources >= 500) { this.state.resources -= 500; this.state.hullIntegrity = Math.min(100, this.state.hullIntegrity + 10); } }
    buyShieldRegen(m: number) { const c = 8000 * (1 + this.state.shieldRegen) * m; if (this.state.resources >= c) { this.state.resources -= c; this.state.shieldRegen += 0.2 * m; } }
    dispose() { 
        this.isDisposed = true; 
        window.removeEventListener('resize', this.onWindowResize); 
        window.removeEventListener('mouseup', this.onMouseUp); 
        if(this.container){ 
            this.container.removeEventListener('mousedown', this.onMouseDown); 
            this.container.removeEventListener('mousemove', this.onMouseMove); 
            this.container.removeEventListener('wheel', this.onWheel); 
            this.container.removeEventListener('contextmenu', e=>e.preventDefault()); 
            if(this.renderer&&this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement); 
            }
        } 
        if(this.renderer) this.renderer.dispose(); 
    }
}