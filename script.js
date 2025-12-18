// --- 1. Utilities ---
const $ = (s, parent = document) => parent.querySelector(s);
const $$ = (s, parent = document) => Array.from(parent.querySelectorAll(s));

// Robust JSON parser with "Stutter Fix"
function parseRelaxedJSON(str) {
  // 1. Remove Markdown code blocks
  let text = str.replace(/```json/g, '').replace(/```/g, '').trim();

  // 2. Identify if we are looking for an Object or an Array
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  let startChar = '{';
  let endChar = '}';
  let startIndex = firstBrace;

  // Use Array mode if '[' appears before '{' or if '{' is not found
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIndex = firstBracket;
    startChar = '[';
    endChar = ']';
  }

  const endIndex = text.lastIndexOf(endChar);

  // 3. Scan for valid JSON
  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const potentialJSON = text.substring(startIndex, endIndex + 1);
      return JSON.parse(potentialJSON);
    } catch (e) {
      // If parsing failed, try the next start char
      startIndex = text.indexOf(startChar, startIndex + 1);
    }
  }

  // 4. Fallback: Relaxed Evaluation
  try {
    const looseStart = text.indexOf(startChar);
    const looseEnd = text.lastIndexOf(endChar);
    if (looseStart !== -1 && looseEnd > looseStart) {
        const looseText = text.substring(looseStart, looseEnd + 1);
        return (new Function(`return ${looseText}`))();
    }
  } catch (e) { /* ignore */ }

  throw new Error(`Could not recover JSON from: ${text.substring(0, 30)}...`);
}

async function showAlert(t,m){try{const x=await import("https://cdn.jsdelivr.net/npm/bootstrap-alert@1/+esm");const a=(m||"").split("<br>");x.bootstrapAlert({body:a.length>1?a.slice(1).join("<br>"):m,title:a.length>1?a[0]:undefined,color:t,position:"top-0 end-0",replace:true,autohide:true,delay:5000});if(!window.__toastStyle){const st=document.createElement('style');st.textContent='.toast{border-radius:.5rem!important;overflow:hidden;box-shadow:0 .25rem .75rem rgba(0,0,0,.15)}.toast-header{border-radius:.5rem .5rem 0 0!important}.toast-body{border-radius:0 0 .5rem .5rem!important}';document.head.appendChild(st);window.__toastStyle=st;}}catch{const el=document.createElement("div");el.className="alert alert-"+(t||"info")+" alert-dismissible fade show rounded-3 shadow";el.innerHTML=m+"<button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\" aria-label=\"Close\"></button>";(document.querySelector("#alerts")||document.body).appendChild(el);setTimeout(()=>el.remove(),5000);}}

// Dynamic Import Loader
const load = async (lib) => import({
  llm: 'https://cdn.jsdelivr.net/npm/asyncllm@2/+esm',
  ui: 'https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1/+esm'
}[lib]);

// --- 2. State & Constants ---
// --- 2. State & Constants ---
const CFG_KEY = "bootstrapLLMProvider_openaiConfig";

// Sound Manager using Web Audio API (No external files needed, supports custom overrides)
class SoundManager {
    constructor() {
        this.enabled = true;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.rollBuffer = null;
        this.loadRollSound();
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    async loadRollSound() {
        try {
            const response = await fetch('dice.mp3');
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                this.rollBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            }
        } catch (e) {
            console.warn("Could not load dice.mp3, utilizing synthetic fallback.", e);
        }
    }

    play(type) {
        if (!this.enabled) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        switch (type) {
            case 'roll':
                if (this.rollBuffer) {
                    // Play mp3
                    const source = this.ctx.createBufferSource();
                    source.buffer = this.rollBuffer;
                    source.connect(this.ctx.destination);
                    source.start(now);
                } else {
                    // Fallback: Noise buffer for rolling sound simulation
                    const bufferSize = this.ctx.sampleRate * 0.5; // 0.5 sec
                    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                    
                    const noise = this.ctx.createBufferSource();
                    noise.buffer = buffer;
                    const noiseGain = this.ctx.createGain();
                    noise.connect(noiseGain);
                    noiseGain.connect(this.ctx.destination);
                    noiseGain.gain.setValueAtTime(0.5, now);
                    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                    noise.start(now);
                }
                break;

            case 'move':
                // Short "tick"
                osc.frequency.setValueAtTime(600, now);
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;

            case 'correct':
                // Major arpeggio
                this.playTone(523.25, 0.1, now); // C5
                this.playTone(659.25, 0.1, now + 0.1); // E5
                this.playTone(783.99, 0.2, now + 0.2); // G5
                break;

            case 'wrong':
                // Low buzz
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            
            case 'levelup':
                // Fanfare
                this.playTone(523.25, 0.1, now);
                this.playTone(523.25, 0.1, now + 0.1);
                this.playTone(523.25, 0.1, now + 0.2);
                this.playTone(659.25, 0.4, now + 0.3);
                break;
                
            case 'hover':
                osc.frequency.setValueAtTime(400, now);
                gain.gain.setValueAtTime(0.02, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
        }
    }

    playTone(freq, duration, time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.linearRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
    }
}

// Confetti System
class ConfettiManager {
    constructor() {
        this.canvas = document.getElementById('confetti-canvas');
        if(!this.canvas) return; // Guard
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.active = false;
        
        // Resize handler
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    burst(x, y) {
        if(!this.canvas) return;
        const colors = ['#0d6efd', '#0dcaf0', '#ffc107', '#dc3545', '#198754'];
        for(let i=0; i<50; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 1) * 20,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity: 0.5,
                drag: 0.95,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                life: 1
            });
        }
        if(!this.active) {
            this.active = true;
            this.animate();
        }
    }
    
    fireworks() {
        const interval = setInterval(() => {
            this.burst(Math.random() * this.canvas.width, Math.random() * (this.canvas.height / 2));
        }, 300);
        setTimeout(() => clearInterval(interval), 2000);
    }
    
    animate() {
        if(this.particles.length === 0) {
            this.active = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update & Draw
        for(let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.rotation += p.rotationSpeed;
            p.life -= 0.015;
            
            if(p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate((p.rotation * Math.PI) / 180);
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            this.ctx.restore();
        }
        
        requestAnimationFrame(() => this.animate());
    }
}

const SCENARIOS = [
  {
    title: "Corporate Turnaround",
    icon: "bi-graph-up-arrow",
    type: "Strategy",
    difficulty: "Hard",
    description: "Revitalize a failing tech giant. excessive debt, and a toxic culture. Can you save the legacy?",
    domain: "Corporate Turnaround Strategy"
  },
  {
    title: "Startup Launch",
    icon: "bi-rocket-takeoff",
    type: "Entrepreneurship",
    difficulty: "Medium",
    description: "Navigate the chaos of early-stage funding, product-market fit, and hiring your first engineers.",
    domain: "Tech Startup Launch"
  },
  {
    title: "Crisis Management",
    icon: "bi-megaphone-fill",
    type: "Communication",
    difficulty: "Hard",
    description: "A PR disaster has struck a major airline. Manage the press, the public, and the stakeholders.",
    domain: "Crisis Management & PR"
  },
  {
    title: "Supply Chain Ops",
    icon: "bi-box-seam-fill",
    type: "Operations",
    difficulty: "Medium",
    description: "Global logistics have broken down. Optimize routes, manage inventory, and keep the factory running.",
    domain: "Supply Chain Optimization"
  },
  {
    title: "Policy Making",
    icon: "bi-bank2",
    type: "Policy",
    difficulty: "Complex",
    description: "Design urban planning for a new smart city while balancing budget, citizen happiness, and sustainability.",
    domain: "Urban Policy & Planning"
  },
  {
    title: "Product Roadmap",
    icon: "bi-kanban-fill",
    type: "Product",
    difficulty: "Medium",
    description: "Balance new features vs technical debt. Prioritize what to build next for a growing SaaS platform.",
    domain: "SaaS Product Management"
  }
];


// --- 3. LLM Integration ---
function getLLMConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || {};
  } catch {
    return {};
  }
}

async function* askLLM(history) {
  const { asyncLLM } = await load('llm');
  const cfg = getLLMConfig();
  
  if (!cfg.baseUrl) throw new Error("Please configure LLM settings first.");

  const model = cfg.models?.[0] || 'gpt-4o-mini';
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`
  };
  
  const body = {
    model,
    stream: true,
    messages: history
  };

  try {
    // Attempt Streaming
    for await (const chunk of asyncLLM(url, { method: 'POST', headers, body: JSON.stringify(body) })) {
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.content) yield chunk.content; // yield text chunk
    }
  } catch (e) {
    // Fallback to standard fetch if stream fails
    console.warn("Stream failed, falling back to fetch", e);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: false })
    });
    const data = await res.json();
    yield data.choices?.[0]?.message?.content || "";
  }
}

// --- 4. Board Game Class ---
class BoardGame {
  constructor(containerId, askLLMFn) {
    this.container = document.querySelector(containerId);
    this.askLLM = askLLMFn;
    this.playerPosition = 0;
    this.score = 1000;
    this.xp = 0;
    this.level = 1; // Leveling System
    this.domain = "";
    this.tiles = [];
    this.isRolling = false;
    this.boardSize = 20;
    this.currency = "Credits";
    this.streak = 0;
    this.confetti = new ConfettiManager();
    this.sounds = new SoundManager(); // Init Sounds
  }

 async init() {
    // 1. Load Iconify Script if not present
    if (!window.Iconify) {
        const script = document.createElement('script');
        script.src = "https://code.iconify.design/3/3.1.1/iconify.min.js";
        document.head.appendChild(script);
    }
    
    this.renderSetup();
  }

  setTile(index, name, icon, type, metadata = null) {
    const t = this.tiles[index];
    t.name = name;
    t.type = type;
    t.icon = icon; // Store for persistence
    t.metadata = metadata;
    
    // Clear previous classes
    t.element.className = 'tile'; 

    let innerHTML = '';

    if (type === 'corner') {
      // Keep using Bootstrap Icons for corners (consistent UI)
      t.element.classList.add('corner');
      innerHTML = `<i class="bi bi-${icon} tile-icon"></i><div>${name}</div>`;
    } else {
      // Use Iconify for properties
      t.element.classList.add('property');
      
      // No inline styles for overlap - handled by CSS now for clean stacking
      innerHTML = `
          <span class="iconify" data-icon="${icon}"></span>
          <div>${name}</div>
      `;
    }

    t.element.innerHTML = innerHTML;
  }

  saveGame() {
    const state = {
      domain: this.domain,
      difficulty: this.difficulty,
      score: this.score,
      xp: this.xp,
      level: this.level,
      streak: this.streak,
      playerPosition: this.playerPosition,
      tiles: this.tiles.map(t => ({
        name: t.name,
        type: t.type,
        icon: t.icon,
        metadata: t.metadata,
        mastered: t.mastered
      })),
      timestamp: Date.now()
    };
    try {
        localStorage.setItem('boardGameState', JSON.stringify(state));
    } catch (e) {
        console.warn("Failed to save game", e);
    }
  }

  resumeGame() {
    const saved = localStorage.getItem('boardGameState');
    if (!saved) return;
    let state;
    try {
        state = JSON.parse(saved);
    } catch (e) {
        console.error("Save file corrupted");
        return;
    }
    
    // Restore properties
    this.domain = state.domain;
    this.difficulty = state.difficulty;
    this.score = state.score;
    this.xp = state.xp;
    this.level = state.level || 1;
    this.streak = state.streak || 0;
    this.playerPosition = state.playerPosition;

    // Restore UI
    this.renderLayout(false); // Skeletons
    
    // Restore Tiles
    state.tiles.forEach((tData, i) => {
        this.setTile(i, tData.name, tData.icon, tData.type, tData.metadata);
        
        // Restore Mastery
        if (tData.mastered) {
             this.tiles[i].mastered = true;
             this.tiles[i].element.classList.add('mastered-tile');
             this.tiles[i].element.style.borderColor = "#ffd700";
             this.tiles[i].element.style.boxShadow = "0 0 15px #ffd700";
        }
    });

    // Restore Center Hub content
      this.container.querySelector('.board-center').innerHTML = `
             <div class="dice-scene">
               <div class="cube" id="dice-cube">
                 <div class="cube__face cube__face--1 face-1"><div class="dot"></div></div>
                 <div class="cube__face cube__face--2 face-2"><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--3 face-3"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--4 face-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--5 face-5"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--6 face-6"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
               </div>
             </div>
             <button id="roll-btn" class="shadow-lg">ROLL DICE</button>
             <p class="mt-4 opacity-75 small text-uppercase fw-bold" id="game-log" style="letter-spacing: 1px;">Welcome back!</p>
      `;

    // Move Token
    this.moveTokenVisual(this.playerPosition);
    this.updateUI();
    this.attachEvents();
    
    // Trigger Iconify
    if (window.Iconify) setTimeout(() => window.Iconify.scan(), 100);
    
    this.log("Game Resumed!");
  }

  renderSetup() {
    this.container.classList.remove('game-active'); // Ensure clean state
    
    // Check for save
    let resumeHTML = '';
    const saved = localStorage.getItem('boardGameState');
    if (saved) {
        try {
            const s = JSON.parse(saved);
            resumeHTML = `
            <div class="mx-auto my-3" style="max-width: 45rem;">
                <div class="alert alert-dark border-primary d-flex justify-content-between align-items-center shadow-lg">
                    <div>
                        <div class="fw-bold text-primary"><i class="bi bi-save2-fill me-2"></i>Resume: ${s.domain}</div>
                        <div class="small text-muted">Lvl ${s.level || 1} • ${s.score} Credits</div>
                    </div>
                    <button class="btn btn-primary px-4" id="btn-resume-game"><i class="bi bi-play-fill"></i> Continue</button>
                </div>
            </div>`;
        } catch(e) { console.error(e); }
    }

    this.container.innerHTML = `
      <div class="container mt-4">
        <h1 class="display-3 my-4 text-center">Strategy Board Game</h1>
        <h2 class="display-6 text-center text-muted">Master complex decision-making through realistic scenarios</h2>
        
        ${resumeHTML}

        <div class="mx-auto my-5 narrative" style="max-width: 55rem;">
          <p class="lead mb-4 text-secondary text-center fs-4">An immersive simulation engine where you navigate real-world strategic challenges.</p>
          <ul class="mb-0 list-unstyled fs-5">
              <li class="mb-3"><i class="bi bi-caret-right-fill text-primary me-2"></i><strong>Roll & Navigate:</strong> Traverse a unique board tailored to your chosen strategy domain.</li>
              <li class="mb-3"><i class="bi bi-caret-right-fill text-primary me-2"></i><strong>Solve & Conquer:</strong> Answer AI-generated dilemmas to capture tiles and earn rewards.</li>
              <li class="mb-3"><i class="bi bi-caret-right-fill text-primary me-2"></i><strong>Master Mechanics:</strong> Build your Streak and avoid Risk zones to maximize your score.</li>
          </ul>
        </div>

        <div class="row g-3" id="demo-cards">
          ${SCENARIOS.map((s, i) => `
            <div class="col-md-6 col-lg-4">
              <div class="card h-100 demo-card" data-index="${i}">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="card-title fw-bold text-primary mb-0">${s.title}</h5>
                    <i class="bi ${s.icon} fs-3 text-secondary"></i>
                  </div>
                  <div class="mb-3">
                    <span class="badge bg-light text-dark border">${s.type}</span>
                    <span class="badge bg-light text-dark border">${s.difficulty}</span>
                  </div>
                  <p class="card-text text-muted">${s.description}</p>
                </div>
              </div>
            </div>
          `).join('')}
          
          <!-- Custom Scenario -->
           <div class="col-md-6 col-lg-4">
              <div class="card h-100 demo-card border-info" id="custom-scenario-card">
                <div class="card-body">
                  <h5 class="card-title fw-bold text-info"><i class="bi bi-magic me-2"></i>Custom Scenario</h5>
                  <p class="card-text text-muted mb-3">Design your own challenge. Enter any topic or domain.</p>
                  <div class="input-group">
                    <input type="text" id="domain-input" class="form-control" placeholder="e.g. Ancient Rome...">
                    <button class="btn btn-outline-info" id="start-custom-btn">Go</button>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>

      <!-- Prep Modal -->
      <div class="modal fade" id="prepModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="prepModalLabel">Mission Briefing</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <h4 id="prep-title" class="mb-3">Scenario Title</h4>
              <p id="prep-desc" class="text-muted mb-4">Description goes here.</p>
              
              <hr>
              
              <div class="mb-3">
                <label class="form-label fw-bold">Select Difficulty</label>
                <div class="btn-group w-100" role="group" aria-label="Difficulty selection">
                  <input type="radio" class="btn-check" name="difficulty" id="diff-easy" value="Easy" autocomplete="off">
                  <label class="btn btn-outline-success" for="diff-easy">Easy</label>

                  <input type="radio" class="btn-check" name="difficulty" id="diff-normal" value="Normal" autocomplete="off" checked>
                  <label class="btn btn-outline-primary" for="diff-normal">Normal</label>

                  <input type="radio" class="btn-check" name="difficulty" id="diff-hard" value="Hard" autocomplete="off">
                  <label class="btn btn-outline-danger" for="diff-hard">Hard</label>
                </div>
                <div class="form-text mt-2" id="diff-help">Standard resources. Balanced events.</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary px-4" id="btn-launch-sim">
                <i class="bi bi-play-fill"></i> Start Simulation
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize Bootstrap Modal
    const modalEl = this.container.querySelector('#prepModal');
    // Check if Bootstrap is available on window (it should be via script tag)
    this.prepModal = new bootstrap.Modal(modalEl);

    // Event Listeners for Scenarios
    this.container.querySelectorAll('.demo-card[data-index]').forEach(card => {
        card.onclick = () => {
            const idx = card.dataset.index;
            this.openPrepModal(SCENARIOS[idx]);
        };
    });

    // Custom Scenario Handler
    const customBtn = this.container.querySelector('#start-custom-btn');
    if (customBtn) {
        customBtn.onclick = (e) => {
            e.stopPropagation();
            const input = this.container.querySelector('#domain-input').value.trim();
            if (!input) return;
            // Open modal with custom data
            this.openPrepModal({
                title: input,
                description: `A custom generated scenario based on "${input}".`,
                domain: input,
                type: 'Custom',
                difficulty: 'Unknown'
            });
        };
    }
    
    // Resume Handler
    const resumeBtn = this.container.querySelector('#btn-resume-game');
    if (resumeBtn) {
        resumeBtn.onclick = () => this.resumeGame();
    }

    // Difficulty Help Text
    const diffInputs = this.container.querySelectorAll('input[name="difficulty"]');
    const helpText = this.container.querySelector('#diff-help');
    const msgs = {
        'Easy': 'High starting capital (+1500). Simple questions. Forgiving events.',
        'Normal': 'Standard capital (+1000). Professional questions. Balanced challenge.',
        'Hard': 'Low capital (+500). Complex, multi-layered problems. High stakes.'
    };
    diffInputs.forEach(inp => {
        inp.onchange = () => {
             helpText.textContent = msgs[inp.value];
        };
    });

    // Launch Button
    this.container.querySelector('#btn-launch-sim').onclick = () => {
        const diff = this.container.querySelector('input[name="difficulty"]:checked').value;
        this.prepModal.hide();
        this.startGameGeneration(diff);
    };
  }

  openPrepModal(scenario) {
//... (existing logic)
      this.selectedScenario = scenario;
      const m = this.container.querySelector('#prepModal');
      m.querySelector('#prep-title').textContent = scenario.title;
      m.querySelector('#prep-desc').textContent = scenario.description;
      
      // Reset difficulty to Normal
      m.querySelector('#diff-normal').checked = true;
      m.querySelector('#diff-help').textContent = 'Standard capital (+1000). Professional questions. Balanced challenge.';
      
      this.domain = scenario.domain || scenario.title;
      this.prepModal.show();
  }

  async startGameGeneration(difficulty = "Normal") {
    localStorage.removeItem('boardGameState'); // Clear old save
    this.difficulty = difficulty;
    
    // Set initial state based on difficulty
    if (difficulty === 'Easy') this.score = 1500;
    else if (difficulty === 'Hard') this.score = 500;
    else this.score = 1000;

    this.renderLayout(true); // Show layout with loading state
    await this.generateBoardContent(this.domain);
  }

  renderLayout(isLoading = false) {
    this.container.classList.add('game-active'); // Enable Dark Board Mode
    this.container.innerHTML = `
      <div class="game-layout">
          <!-- SIDEBAR (Stats & Info) -->
          <div class="game-sidebar">
             <div class="mb-4 text-center text-lg-start">
                <h1 class="game-font-title mb-1" style="background: linear-gradient(135deg, #0d6efd, #0dcaf0); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    ${this.domain ? this.domain : 'Loading...'}
                </h1>
                <div class="text-uppercase fw-bold text-muted small" style="letter-spacing: 2px;">
                    Strategy Edition • <span class="text-primary">${this.difficulty ? this.difficulty : 'Normal'}</span>
                </div>
             </div>

             <div class="stats-grid mb-4">
                 <div class="stat-card border-warning">
                    <div class="text-warning small text-uppercase">Credits</div>
                    <div class="fs-4 fw-bold"><i class="bi bi-coin me-1"></i><span id="game-score">${this.score}</span></div>
                 </div>
                 <div class="stat-card border-info">
                    <div class="text-info small text-uppercase">XP</div>
                    <div class="fs-4 fw-bold"><i class="bi bi-mortarboard-fill me-1"></i><span id="game-knowledge">${this.xp}</span></div>
                 </div>
                 <div class="stat-card border-light" title="Current Level">
                    <div class="text-white-50 small text-uppercase">Level</div>
                    <div class="fs-4 fw-bold"><i class="bi bi-graph-up-arrow me-1"></i><span id="game-level">${this.level}</span></div>
                 </div>
                 <div class="stat-card border-danger" id="streak-panel" style="opacity: ${this.streak > 1 ? '1' : '0.5'}">
                    <div class="text-danger small text-uppercase">Streak</div>
                    <div class="fs-4 fw-bold"><i class="bi bi-fire me-1" id="streak-icon"></i><span id="game-streak">${this.streak}</span></div>
                 </div>
             </div>
             
             <div class="d-flex justify-content-between align-items-center mt-auto">
                 <button id="sound-toggle" class="btn btn-outline-secondary btn-sm rounded-circle shadow-sm" style="width: 40px; height: 40px;" title="Toggle Sound">
                     <i class="bi bi-volume-up-fill"></i>
                 </button>
             </div>
          </div>

          <!-- MAIN BOARD AREA -->
          <div class="game-main">
              <div class="board-container" id="game-board">
                <!-- Center Hub -->
                <div class="board-center text-center">
                  ${isLoading ? 
                    `<div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;"></div>
                     <h4 class="fw-bold">Establishing HLQ...</h4>
                     <p class="small opacity-75">Generating assets for ${this.domain}...</p>` 
                    : 
                    `<div class="dice-scene">
                       <div class="cube" id="dice-cube">
                         <div class="cube__face cube__face--1 face-1"><div class="dot"></div></div>
                         <div class="cube__face cube__face--2 face-2"><div class="dot"></div><div class="dot"></div></div>
                         <div class="cube__face cube__face--3 face-3"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                         <div class="cube__face cube__face--4 face-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                         <div class="cube__face cube__face--5 face-5"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                         <div class="cube__face cube__face--6 face-6"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                       </div>
                     </div>
                     <button id="roll-btn" class="shadow-lg">ROLL DICE</button>
                     <p class="mt-4 opacity-75 small text-uppercase fw-bold" id="game-log" style="letter-spacing: 1px;">Press Roll to start!</p>`
                  }
                </div>
              </div>
          </div>
      </div>

      <!-- Question Modal -->
      <div class="game-modal-overlay" id="question-modal-overlay">
        <div class="game-modal">
          <div class="modal-header d-flex justify-content-between">
            <h3 id="modal-title" class="text-primary">Challenge</h3>
            <span class="badge bg-dark border" id="modal-reward">Reward: 100</span>
          </div>
          <div class="modal-body mt-3">
            <p id="modal-question" class="fs-5 mb-4">...</p>
            <div id="modal-options" class="modal-options w-100"></div>
            <div id="modal-lifelines" class="mt-3"></div>
            <div id="modal-feedback" class="mt-3 d-none"></div>
          </div>
          <div class="modal-footer mt-4 text-end">
            <button class="btn btn-primary px-4 d-none" id="modal-close-btn">Continue</button>
          </div>
        </div>
      </div>
    `;

    // Render Tiles Skeleton
    const board = this.container.querySelector('#game-board');
    // Top(0-5), Right(6-9), Bottom(10-15), Left(16-19)
    for (let i = 0; i < 6; i++) this.createTileDOM(i, 1, i + 1, board);
    for (let i = 0; i < 4; i++) this.createTileDOM(6 + i, i + 2, 6, board);
    for (let i = 0; i < 6; i++) this.createTileDOM(10 + i, 6, 6 - i, board);
    for (let i = 0; i < 4; i++) this.createTileDOM(16 + i, 6 - (i + 1), 1, board);

    // Initial Token
    this.token = document.createElement('div');
    this.token.className = 'player-token';
    board.appendChild(this.token);
    this.moveTokenVisual(0);

    if (!isLoading) {
      this.attachEvents();
    }
  }

  attachEvents() {
    const btn = this.container.querySelector('#roll-btn');
    if(btn) btn.onclick = () => this.handleRoll();
    this.container.querySelector('#modal-close-btn').onclick = () => this.closeModal();
    
    const soundBtn = this.container.querySelector('#sound-toggle');
    if (soundBtn) {
        soundBtn.onclick = () => {
             const enabled = this.sounds.toggle();
             soundBtn.innerHTML = enabled ? '<i class="bi bi-volume-up-fill"></i>' : '<i class="bi bi-volume-mute-fill"></i>';
             soundBtn.classList.toggle('btn-outline-secondary');
             soundBtn.classList.toggle('btn-outline-danger');
             this.sounds.play('hover'); // Feedback
        };
    }
  }

  createTileDOM(index, row, col, parent) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.gridRow = row;
    el.style.gridColumn = col;
    el.dataset.index = index;
    el.innerHTML = `<span class="spinner-grow spinner-grow-sm text-secondary" style="--bs-spinner-width: 0.5rem; --bs-spinner-height: 0.5rem;"></span>`;
    this.tiles[index] = { element: el, type: 'loading', name: '...' };
    parent.appendChild(el);
  }

  moveTokenVisual(index) {
    const tile = this.tiles[index].element;
    const boardRect = this.container.querySelector('#game-board').getBoundingClientRect();
    const rect = tile.getBoundingClientRect();
    
    // Calculate relative position within the board container
    const top = rect.top - boardRect.top + rect.height / 2;
    const left = rect.left - boardRect.left + rect.width / 2;
    
    this.token.style.top = `${top}px`;
    this.token.style.left = `${left}px`;
    
    document.querySelectorAll('.tile').forEach(t => t.classList.remove('player-here'));
    tile.classList.add('player-here');
  }

async generateBoardContent(domain) {
    // 16 property tiles needed (20 total - 4 corners)
    this.setTile(0, "START", "flag-fill", "corner");
    this.setTile(5, "BREAK", "cup-hot-fill", "corner");
    this.setTile(10, "BONUS", "star-fill", "corner");
    this.setTile(15, "RISK", "exclamation-diamond-fill", "corner");

    try {
      this.log(`Consulting AI Advisor about "${domain}"...`);

      // Updated Prompt: Ask for Name and visual keyword
      const prompt = `You are a game designer. Generate 20 distinct board game tile concepts for the domain: "${domain}".
      
      For each concept, provide a concise visual keyword to search for an icon (e.g., "sword", "bitcoin", "atom").

      Return strictly a JSON array of objects. Format: [{"name": "Concept Name", "keyword": "search-term"}, ...].
      Do not use Markdown.
      
      Examples:
      [{"name": "Gravity", "keyword": "falling"}, {"name": "War", "keyword": "sword"}, {"name": "Money", "keyword": "coin"}]`;
      
      let items = [];

      try {
        const responseStream = await this.askLLM([{role: 'user', content: prompt}]);
        let fullText = "";
        for await (const chunk of responseStream) fullText += chunk;
        
        console.log("Board Generation Output:", fullText);
        items = parseRelaxedJSON(fullText);

        if (!Array.isArray(items)) throw new Error("Output is not an array");
      } catch (e) {
        console.error("LLM Generation failed", e);
        this.log(`Generation failed: ${e.message}. Using placeholders.`);
        // Fallback with generic icons
        items = Array(16).fill(null).map((_, i) => ({ name: `${domain} ${i+1}`, keyword: 'shape' }));
      }
      
      // Ensure we have enough items
      if (!items || items.length === 0) items = Array(16).fill(null).map((_, i) => ({ name: `${domain} ${i+1}`, keyword: 'shape' }));
      while (items.length < 16) items = items.concat(items);
      items = items.slice(0, 16);

      // Distribute items
      let itemIdx = 0;
      
      // Fallbacks
      const fallbackIcons = ['mdi:circle', 'mdi:square', 'mdi:triangle', 'mdi:hexagon', 'mdi:star'];

      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) continue; // Skip corners
        const item = items[itemIdx % items.length];
        
        const name = item.name || item; 
        const keyword = item.keyword || name; // Use name as fallback keyword

        // Fetch Icon from Iconify API
        let icon = await this.searchIcon(keyword);
        
        // Final fallback if search returns nothing
        if (!icon) {
             icon = fallbackIcons[itemIdx % fallbackIcons.length];
        }

        // Set Tile with Iconify Data
        this.setTile(i, name, icon, "property", name);
        itemIdx++;
      }
      
      // Update Center Hub
      this.container.querySelector('.board-center').innerHTML = `
             <h2 class="text-white mb-2" style="text-shadow:0 0 10px white; text-transform: capitalize;">${domain}</h2>
             <div class="small text-white-50 mb-4">STRATEGY EDITION • ${this.difficulty.toUpperCase()}</div>
             <div class="dice-scene">
               <div class="cube" id="dice-cube">
                 <div class="cube__face cube__face--1 face-1"><div class="dot"></div></div>
                 <div class="cube__face cube__face--2 face-2"><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--3 face-3"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--4 face-4"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--5 face-5"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                 <div class="cube__face cube__face--6 face-6"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
               </div>
             </div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Press Roll to start!</p>
      `;
      this.attachEvents();

      // Trigger Iconify to render the new icons
      if (window.Iconify) {
          setTimeout(() => window.Iconify.scan(), 100);
      }
      this.saveGame();
      
      this.saveGame();

    } catch (e) {
      console.error(e);
      this.renderSetup(); 
    }
  }

  async searchIcon(query) {
      if (!query) return null;
      try {
          const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=1`);
          if (!res.ok) return null;
          const data = await res.json();
          if (data.icons && data.icons.length > 0) {
              return data.icons[0];
          }
      } catch (e) {
          console.warn("Icon search failed for", query);
      }
      return null;
  }



  async handleRoll() {
    if (this.isRolling) return;
    this.isRolling = true;
    this.sounds.play('roll');
    
    // Disable button
    const btn = this.container.querySelector('#roll-btn');
    if (btn) btn.disabled = true;
    
    const cube = this.container.querySelector('#dice-cube');
    
    // Initial "Chaos" Spin - spin wildly before landing
    // We add to current rotation to prevent distinct unwinding
    // If this is the first roll, initialize rotation tracking
    if (!this.currentRotation) this.currentRotation = { x: 0, y: 0 };
    
    // Spin it 2-4 times (720-1440 deg) plus some random noise
    const spinX = 720 + Math.random() * 720;
    const spinY = 720 + Math.random() * 720;
    
    // Temporarily speed up transition for the "toss"
    cube.style.transition = "transform 0.4s linear";
    cube.style.transform = `translateZ(-50px) rotateX(${this.currentRotation.x + spinX}deg) rotateY(${this.currentRotation.y + spinY}deg)`;
    
    // determine result
    const face = Math.floor(Math.random() * 6) + 1;
    
    // Wait for "spin" time then land
    setTimeout(() => {
        this.finishRoll(face, cube);
    }, 400); // Shorter throw phase
  }

  async finishRoll(roll, cube) {
    this.isRolling = false;
    
    // Target Rotation Mapping (to show the face front)
    // Front(1): 0,0
    // Right(2): 0, -90
    // Back(3): 0, 180
    // Left(4): 0, 90
    // Top(5): -90, 0
    // Bottom(6): 90, 0
    
    let targetX = 0;
    let targetY = 0;

    switch(roll) {
        case 1: targetX = 0; targetY = 0; break;
        case 2: targetX = 0; targetY = -90; break;
        case 3: targetX = 0; targetY = 180; break;
        case 4: targetX = 0; targetY = 90; break;
        case 5: targetX = -90; targetY = 0; break;
        case 6: targetX = 90; targetY = 0; break;
    }
    
    // Calculate the NEAREST multiple of 360 to land on this face
    // to ensure we continue rotating forward or settle naturally
    
    // Normalize current rotation to remove full spins for calculation
    // but keep the full value for the animation
    const currentX = this.currentRotation ? this.currentRotation.x : 0;
    const currentY = this.currentRotation ? this.currentRotation.y : 0;
    
    // We want to land on targetX/Y mod 360
    // But we want the total value to be > current value (forward spin)
    // Add at least 2 full spins (720) for the settling phase
    const minSpins = 2; // 720 degrees
    
    // Ensure we land exactly on the face offset
    // Formula: Find next Multiple of 360 that aligns with target offset
    // We add arbitrary spins then adjust to match modulo
    
    let nextX = currentX + (360 * minSpins);
    let nextY = currentY + (360 * minSpins);
    
    // Adjust remainder to match target
    const remainderX = nextX % 360;
    nextX += (targetX - remainderX);
    
    const remainderY = nextY % 360;
    nextY += (targetY - remainderY);
    
    // Update state
    this.currentRotation = { x: nextX, y: nextY };
    
    // Apply realistic ease-out transition
    cube.style.transition = "transform 1.2s cubic-bezier(0.15, 0.9, 0.35, 1.0)";
    cube.style.transform = `translateZ(-50px) rotateX(${nextX}deg) rotateY(${nextY}deg)`;

    this.log(`Rolled a ${roll}!`);
    await new Promise(r => setTimeout(r, 1200)); // Wait for animation to settle
    
    // Step-by-step move
    for (let i = 0; i < roll; i++) {
        this.playerPosition = (this.playerPosition + 1) % 20;
        this.moveTokenVisual(this.playerPosition);
        this.sounds.play('move');
        await new Promise(r => setTimeout(r, 250));
    }
    
    setTimeout(() => this.handleLanding(), 300);
    this.saveGame();
    
    const btn = this.container.querySelector('#roll-btn');
    if (btn) btn.disabled = false;
  }

  handleLanding() {
    const tile = this.tiles[this.playerPosition];
    this.log(`Landed on ${tile.name}`);
    
    if (tile.type === 'corner') {
      this.handleCorner(tile);
    } else {
      this.askQuestion(tile.metadata);
    }
  }

  handleCorner(tile) {
     if (tile.name === 'START') {
         this.score += 200;
         this.log("Passed Start! +200 Credits");
     } else if (tile.name === 'BONUS') {
         const bonus = Math.floor(Math.random() * 300) + 100;
         this.score += bonus;
         this.log(`Lucky find! +${bonus} Credits`);
     } else if (tile.name === 'RISK') {
         const penalty = Math.floor(Math.random() * 200) + 50;
         this.score = Math.max(0, this.score - penalty);
         this.log(`Market Crash! -${penalty} Credits`);
     } else {
         this.log("Just resting...");
     }
     this.updateUI();
     this.saveGame();
  }

  async askQuestion(topic) {
    this.openModal(`Topic: ${topic}`);
    const qEl = this.container.querySelector('#modal-question');
    const optsEl = this.container.querySelector('#modal-options');
    const lifelinesEl = this.container.querySelector('#modal-lifelines');
    
    // UI Loading State
    qEl.innerHTML = `<div class="d-flex align-items-center justify-content-center gap-3">
        <div class="spinner-border text-primary"></div> 
        <div>Consulting the ${this.domain} Expert...</div>
    </div>`;
    optsEl.innerHTML = '';
    lifelinesEl.innerHTML = ''; // Clear previous lifelines
    
    // Difficulty Modifiers
    let difficultyNotes = "";
    if (this.difficulty === "Easy") {
        difficultyNotes = "Question should be foundational/basic. Options should be clearly distinguishable.";
    } else if (this.difficulty === "Hard") {
        difficultyNotes = "Question should be complex, involving trade-offs or nuanced situational analysis. Options should be plausible distractors.";
    } else {
        difficultyNotes = "Question should be standard professional difficulty.";
    }

    // 1. Stricter Prompt
    const prompt = `You are a game engine.
    Topic: "${topic}" inside Domain: "${this.domain}".
    Difficulty Level: "${this.difficulty}".
    
    Instructions:
    ${difficultyNotes}

    Task: Generate a multiple-choice question with a helpful hint.
    
    CRITICAL: Output valid JSON only. Do not stutter. Do not use Markdown.
    
    Format:
    {
      "question": "The question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "hint": "A subtle clue that points to the right principle without giving it away.",
      "explanation": "Why A is correct.",
      "reward": 150
    }`;
    
    try {
        const responseStream = await this.askLLM([{role: 'user', content: prompt}]);
        let fullText = "";
        for await (const chunk of responseStream) fullText += chunk;
        
        console.log("LLM Raw Output:", fullText); // Debug log

        // 2. Use the new robust parser
        const data = parseRelaxedJSON(fullText);

        // Randomize Options Logic
        if (data.options && Array.isArray(data.options) && typeof data.correctIndex === 'number') {
            // Capture the correct answer text before shuffling
            const correctOptionText = data.options[data.correctIndex];
            
            // Fisher-Yates Shuffle
            for (let i = data.options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [data.options[i], data.options[j]] = [data.options[j], data.options[i]];
            }
            
            // Update correctIndex to match the new position
            data.correctIndex = data.options.findIndex(opt => opt === correctOptionText);
        }

        this.currentQuestionData = data;
        
        // 3. Render Question & Options
        this.container.querySelector('#modal-reward').textContent = `Reward: ${data.reward || 100}`;
        qEl.textContent = data.question;
        optsEl.innerHTML = '';
        
        if (!data.options || !Array.isArray(data.options)) throw new Error("Invalid options format");
        
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "btn btn-outline-light w-100 text-start mb-2 p-3 position-relative option-btn";
            btn.dataset.idx = idx; // Store index for 50/50
            btn.textContent = opt;
            btn.onclick = () => this.handleAnswer(idx, btn);
            optsEl.appendChild(btn);
        });

        // 4. Render Lifelines
        lifelinesEl.innerHTML = `
            <div class="d-flex gap-2 justify-content-end mt-2">
                <button class="btn btn-outline-info btn-sm" id="btn-hint" title="Get a Clue">
                    <i class="bi bi-lightbulb-fill"></i> Hint (-50)
                </button>
                <button class="btn btn-outline-warning btn-sm" id="btn-5050" title="Remove 2 Wrong Answers">
                    <i class="bi bi-scissors"></i> 50/50 (-100)
                </button>
            </div>
            <div id="hint-display" class="alert alert-info mt-2 d-none small"></div>
        `;

        // Attach Lifeline Events
        this.container.querySelector('#btn-hint').onclick = (e) => this.handleUseHint(data.hint, e.target.closest('button'));
        this.container.querySelector('#btn-5050').onclick = (e) => this.handleFiftyFifty(data.correctIndex, e.target.closest('button'));
        
    } catch(e) {
        console.error(e);
        qEl.innerHTML = `<div class="alert alert-danger">
          <strong>Generation Error:</strong> ${e.message}<br>
          <small class="d-block mt-2 text-muted">Try rolling again.</small>
        </div>`;
        
        // Validate: Ensure user can close the modal on error
        const closeBtn = this.container.querySelector('#modal-close-btn');
        closeBtn.classList.remove('d-none');
        closeBtn.textContent = "Close";
    }
  }

  handleUseHint(hintText, btn) {
      if (this.score < 50) {
          alert("Not enough credits!");
          return;
      }
      this.score -= 50;
      this.updateUI();
      
      const display = this.container.querySelector('#hint-display');
      display.textContent = hintText || "No hint available.";
      display.classList.remove('d-none');
      
      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-check"></i> Used`;
  }

  handleFiftyFifty(correctIdx, btn) {
      if (this.score < 100) {
          alert("Not enough credits!");
          return;
      }
      this.score -= 100;
      this.updateUI();

      const inputs = Array.from(this.container.querySelectorAll('.option-btn'));
      const wrongIndices = inputs
          .map((_, i) => i)
          .filter(i => i !== correctIdx);
      
      // Shuffle wrong indices and take first 2
      for (let i = wrongIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
      }
      const toRemove = wrongIndices.slice(0, 2);

      inputs.forEach((inp, i) => {
          if (toRemove.includes(i)) {
              inp.disabled = true;
              inp.style.opacity = "0.3";
              inp.innerHTML = `<del>${inp.textContent}</del>`;
          }
      });

      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-check"></i> Used`;
  }

  handleAnswer(selectedIdx, btn) {
      const data = this.currentQuestionData;
      const feedback = this.container.querySelector('#modal-feedback');
      const allBtns = this.container.querySelectorAll('#modal-options button');
      
      // Disable everything
      allBtns.forEach(b => b.disabled = true);
      this.container.querySelectorAll('#modal-lifelines button').forEach(b => b.disabled = true);
      
      if (selectedIdx === data.correctIndex) {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-success');
          this.sounds.play('correct');
          this.confetti.fireworks();
          
          // Streak Logic
          this.streak++;
          const streakBonus = Math.max(1, 1 + (this.streak * 0.1)); // 1.1x, 1.2x...
          
          // Mastery Logic
          const currentTile = this.tiles[this.playerPosition];
          if (!currentTile.mastered) {
              currentTile.mastered = true;
              currentTile.element.classList.add('mastered-tile');
              currentTile.element.style.borderColor = "#ffd700";
              currentTile.element.style.boxShadow = "0 0 15px #ffd700";
          }

          const baseReward = data.reward || 100;
          const totalReward = Math.floor(baseReward * streakBonus);
          
          this.score += totalReward;
          this.xp += 50;
          
          this.checkLevelUp();

          let msg = `<div class="text-success fs-4 fw-bold"><i class="bi bi-check-circle-fill"></i> Correct! +${totalReward}</div>`;
          if (this.streak > 1) msg += `<div class="text-warning fw-bold animate-pulse">🔥 ${this.streak}x Streak! (x${streakBonus.toFixed(1)})</div>`;
          if (!currentTile.mastered) msg += `<div class="text-info mt-1"><i class="bi bi-trophy-fill"></i> Tile Mastered!</div>`;
          
          feedback.innerHTML = `${msg}<div class="small text-white-50 mt-2">${data.explanation}</div>`;

      } else {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-danger');
          allBtns[data.correctIndex].classList.remove('btn-outline-light');
          allBtns[data.correctIndex].classList.add('btn-success'); // Show right answer
          this.sounds.play('wrong');
          
          this.streak = 0; // Reset streak
          
          this.score = Math.max(0, this.score - 50);
          feedback.innerHTML = `<div class="text-danger"><i class="bi bi-x-circle-fill"></i> Incorrect. -50</div><div class="small text-white-50 mt-1">${data.explanation}</div>`;
      }
      
      feedback.classList.remove('d-none');
      this.updateUI();
      this.saveGame();
      
      const closeBtn = this.container.querySelector('#modal-close-btn');
      closeBtn.classList.remove('d-none');
      closeBtn.focus();
  }

  checkLevelUp() {
      // Simple Level Formula: Level = Floor(XP / 200) + 1
      const newLevel = Math.floor(this.xp / 200) + 1;
      if (newLevel > this.level) {
          this.level = newLevel;
          this.sounds.play('levelup');
          this.confetti.fireworks();
          this.log(`🎉 LEVEL UP! You are now Level ${this.level}`);
          
          // Show perk badge temporarily
          const perk = this.container.querySelector('#perk-badge');
          if(perk) {
              perk.textContent = "LEVEL UP!";
              perk.style.display = 'block';
              setTimeout(() => perk.style.display = 'none', 3000);
          }
      }
  }

  handleUseHint(hintText, btn) {
      let cost = 50;
      if (this.level >= 2) cost = 25; // Level 2 Perk

      if (this.score < cost) {
          alert(`Not enough credits! Need ${cost}.`);
          return;
      }
      this.score -= cost;
      this.updateUI();
      
      const display = this.container.querySelector('#hint-display');
      display.textContent = hintText || "No hint available.";
      display.classList.remove('d-none');
      
      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-check"></i> Used (-${cost})`;
  }

  handleFiftyFifty(correctIdx, btn) {
      let cost = 100;
      if (this.level >= 5) cost = 50; // Level 5 Perk

      if (this.score < cost) {
          alert(`Not enough credits! Need ${cost}.`);
          return;
      }
      this.score -= cost;
      this.updateUI();

      const inputs = Array.from(this.container.querySelectorAll('.option-btn'));
      const wrongIndices = inputs
          .map((_, i) => i)
          .filter(i => i !== correctIdx);
      
      // Shuffle wrong indices and take first 2
      for (let i = wrongIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
      }
      const toRemove = wrongIndices.slice(0, 2);

      inputs.forEach((inp, i) => {
          if (toRemove.includes(i)) {
              inp.disabled = true;
              inp.style.opacity = "0.3";
              inp.innerHTML = `<del>${inp.textContent}</del>`;
          }
      });

      btn.disabled = true;
      btn.innerHTML = `<i class="bi bi-check"></i> Used (-${cost})`;
  }
// ...
  updateUI() {
      const s = this.container.querySelector('#game-score');
      if(s) s.textContent = this.score;
      
      const x = this.container.querySelector('#game-knowledge');
      if(x) x.textContent = this.xp;

      const l = this.container.querySelector('#game-level');
      if(l) l.textContent = this.level;

      const st = this.container.querySelector('#game-streak');
      const stPanel = this.container.querySelector('#streak-panel');
      const stIcon = this.container.querySelector('#streak-icon');
      
      if(st) st.textContent = this.streak;
      if(stPanel) stPanel.style.opacity = this.streak > 0 ? '1' : '0.5';
      
      if(stIcon) {
          if(this.streak > 0) stIcon.classList.add('fire-active');
          else stIcon.classList.remove('fire-active');
      }
  }

  log(text) {
      const l = this.container.querySelector('#game-log');
      if(l) l.textContent = text;
  }

  openModal(title) {
      const ol = this.container.querySelector('#question-modal-overlay');
      ol.classList.add('active');
      this.container.querySelector('#modal-title').textContent = title;
      this.container.querySelector('#modal-feedback').classList.add('d-none');
      this.container.querySelector('#modal-close-btn').classList.add('d-none');
  }

  closeModal() {
      this.container.querySelector('#question-modal-overlay').classList.remove('active');
      
      // Check for victory/defeat logic if we wanted, but infinite play is fine for now
  }
}

// --- 5. Event Handling & Initialization ---
document.addEventListener('click', async (e) => {
  const target = e.target;

  // Configure LLM Button
  if (target.closest('#configure-llm')) {
    try {
      const { openaiConfig } = await load('ui'); 
      const prev = getLLMConfig().baseUrl;
      const prevK = getLLMConfig().apiKey; 
      await openaiConfig({ show: true }); 
      const next = getLLMConfig().baseUrl;
      const nextK = getLLMConfig().apiKey; 
      if(next && (next !== prev || nextK !== prevK)) {
        showAlert('success','LLM configured');
      }
    } catch { }
  }
});

// Initialize the game
window.addEventListener('load', async () => {
  const boardGameInstance = new BoardGame('#board-game-view', askLLM);
  await boardGameInstance.init();
});
