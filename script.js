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

  // 3. Scan for valid JSON (Standard)
  while (startIndex !== -1 && startIndex < endIndex) {
    try {
      const potentialJSON = text.substring(startIndex, endIndex + 1);
      return JSON.parse(potentialJSON);
    } catch (e) {
      // If parsing failed, move to next possible start
      startIndex = text.indexOf(startChar, startIndex + 1);
    }
  }

  // 4. Stutter Fix: Remove repeated opening braces (e.g. "{ { {")
  // Sometimes LLMs stutter the opening brace.
  const stutterMatch = text.match(/^[{\s]+(?=")/); // Match leading {'s and whitespace before a quote
  if (stutterMatch) {
    try {
      const clean = '{' + text.substring(stutterMatch[0].length);
      return JSON.parse(clean);
    } catch (e) { }
  }

  // 5. Fallback: Relaxed Evaluation
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

async function showAlert(t, m) { try { const x = await import("https://cdn.jsdelivr.net/npm/bootstrap-alert@1/+esm"); const a = (m || "").split("<br>"); x.bootstrapAlert({ body: a.length > 1 ? a.slice(1).join("<br>") : m, title: a.length > 1 ? a[0] : undefined, color: t, position: "top-0 end-0", replace: true, autohide: true, delay: 5000 }); if (!window.__toastStyle) { const st = document.createElement('style'); st.textContent = '.toast{border-radius:.5rem!important;overflow:hidden;box-shadow:0 .25rem .75rem rgba(0,0,0,.15)}.toast-header{border-radius:.5rem .5rem 0 0!important}.toast-body{border-radius:0 0 .5rem .5rem!important}'; document.head.appendChild(st); window.__toastStyle = st; } } catch { const el = document.createElement("div"); el.className = "alert alert-" + (t || "info") + " alert-dismissible fade show rounded-3 shadow"; el.innerHTML = m + "<button type=\"button\" class=\"btn-close\" data-bs-dismiss=\"alert\" aria-label=\"Close\"></button>"; (document.querySelector("#alerts") || document.body).appendChild(el); setTimeout(() => el.remove(), 5000); } }

// Dynamic Import Loader
const load = async (lib) => import({
  llm: 'https://cdn.jsdelivr.net/npm/asyncllm@2/+esm',
  ui: 'https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1/+esm'
}[lib]);

// --- 2. State & Constants ---
const loadConfetti = async () => (await import("canvas-confetti")).default;
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

    // Resume AudioContext if suspended (required by browsers)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

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
        const moveOsc = this.ctx.createOscillator();
        const moveGain = this.ctx.createGain();
        moveOsc.connect(moveGain);
        moveGain.connect(this.ctx.destination);
        moveOsc.frequency.setValueAtTime(600, now);
        moveOsc.type = 'sine';
        moveGain.gain.setValueAtTime(0.1, now);
        moveGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        moveOsc.start(now);
        moveOsc.stop(now + 0.1);
        break;

      case 'correct':
        // Major arpeggio
        this.playTone(523.25, 0.1, now); // C5
        this.playTone(659.25, 0.1, now + 0.1); // E5
        this.playTone(783.99, 0.2, now + 0.2); // G5
        break;

      case 'wrong':
        // Low buzz
        const wrongOsc = this.ctx.createOscillator();
        const wrongGain = this.ctx.createGain();
        wrongOsc.connect(wrongGain);
        wrongGain.connect(this.ctx.destination);
        wrongOsc.frequency.setValueAtTime(150, now);
        wrongOsc.frequency.linearRampToValueAtTime(100, now + 0.3);
        wrongOsc.type = 'sawtooth';
        wrongGain.gain.setValueAtTime(0.2, now);
        wrongGain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        wrongOsc.start(now);
        wrongOsc.stop(now + 0.3);
        break;

      case 'levelup':
        // Fanfare
        this.playTone(523.25, 0.1, now);
        this.playTone(523.25, 0.1, now + 0.1);
        this.playTone(523.25, 0.1, now + 0.2);
        this.playTone(659.25, 0.4, now + 0.3);
        break;

      case 'hover':
        const hoverOsc = this.ctx.createOscillator();
        const hoverGain = this.ctx.createGain();
        hoverOsc.connect(hoverGain);
        hoverGain.connect(this.ctx.destination);
        hoverOsc.frequency.setValueAtTime(400, now);
        hoverGain.gain.setValueAtTime(0.02, now);
        hoverGain.gain.linearRampToValueAtTime(0.001, now + 0.05);
        hoverOsc.start(now);
        hoverOsc.stop(now + 0.05);
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

function isLLMConfigured() {
  const cfg = getLLMConfig();
  return Boolean(cfg.baseUrl);
}

function requireLLMConfig() {
  if (isLLMConfigured()) return true;
  showAlert(
    'warning',
    'LLM not configured<br>Click the Configure button in the top-right to set it up before starting the game.'
  );
  const cfgBtn = document.querySelector('#configure-llm');
  if (cfgBtn) {
    cfgBtn.classList.add('btn-warning');
    setTimeout(() => cfgBtn.classList.remove('btn-warning'), 2000);
  }
  return false;
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
    this.systemPersona = ""; // Custom System Prompt
    this.questionPreferences = ""; // Custom Question/Scenario Preferences

    // Inventory / Powerups
    this.inventory = {
      shield: 0,
      xpBoost: 0
    };
    this.activeEffects = {
      xpMultiplier: 1,
      xpBoostTurns: 0
    };

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
      systemPersona: this.systemPersona,
      questionPreferences: this.questionPreferences,
      inventory: this.inventory, // Persist Inventory
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
    this.systemPersona = state.systemPersona || "";
    this.questionPreferences = state.questionPreferences || "";
    this.inventory = state.inventory || { shield: 0, xpBoost: 0, masterKey: 0 };
    this.pendingBoss = state.pendingBoss || false;
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
             <h2 class="text-white mb-2" style="text-shadow:0 0 10px white; text-transform: capitalize;">${this.domain}</h2>
             <div class="small text-white-50 mb-4">STRATEGY EDITION • ${this.difficulty.toUpperCase()}</div>
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Welcome back!</p>
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
      } catch (e) { console.error(e); }
    }

    const llmNotice = isLLMConfigured()
      ? ''
      : `
        <div class="mx-auto my-3" style="max-width: 55rem;">
          <div class="alert alert-warning border-warning shadow-sm text-center">
            <strong>Configure the LLM to start the game.</strong><br>
            Click the <span class="fw-bold">Configure</span> button in the top-right.
          </div>
        </div>`;

    this.container.innerHTML = `
      <div class="container mt-4">
        <h1 class="display-3 my-4 text-center">Strategy Board Game</h1>
        <h2 class="display-6 text-center text-muted">Master complex decision-making through realistic scenarios</h2>
        
        ${llmNotice}
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

              <hr>
              
              <div class="mb-3">
                 <label for="system-persona" class="form-label fw-bold"><i class="bi bi-robot"></i> AI Persona (System Prompt)</label>
                 <textarea class="form-control bg-dark text-light border-secondary" id="system-persona" rows="3" placeholder="Default: You are a game designer..."></textarea>
                 <div class="form-text text-muted">Override the AI's personality (e.g., 'You are a skeptical investor', 'You are a compassionate mentor').</div>
              </div>
              
              <div class="mb-3">
                 <label for="question-preferences" class="form-label fw-bold"><i class="bi bi-lightbulb-fill"></i> Question & Scenario Preferences</label>
                 <textarea class="form-control bg-dark text-light border-secondary" id="question-preferences" rows="4" placeholder="e.g., Focus on ethical dilemmas, include data-driven scenarios, emphasize risk management..."></textarea>
                 <div class="form-text text-muted">Define what types of questions and scenarios you want to see (e.g., 'ethical dilemmas', 'technical challenges', 'people management', 'financial decisions').</div>
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
        if (!requireLLMConfig()) return;
        const idx = card.dataset.index;
        this.openPrepModal(SCENARIOS[idx]);
      };
    });

    // Custom Scenario Handler
    const customBtn = this.container.querySelector('#start-custom-btn');
    if (customBtn) {
      customBtn.onclick = (e) => {
        e.stopPropagation();
        if (!requireLLMConfig()) return;
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
      resumeBtn.onclick = () => {
        if (!requireLLMConfig()) return;
        this.resumeGame();
      };
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
      if (!requireLLMConfig()) return;
      const diff = this.container.querySelector('input[name="difficulty"]:checked').value;
      const persona = this.container.querySelector('#system-persona').value.trim();
      const questionPrefs = this.container.querySelector('#question-preferences').value.trim();
      this.prepModal.hide();
      this.startGameGeneration(diff, persona, questionPrefs);
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

    // Reset Persona
    m.querySelector('#system-persona').value = "You are a strategic game AI designed to test business acumen and critical thinking. Be helpful but challenging.";

    // Reset Question Preferences
    m.querySelector('#question-preferences').value = "";

    this.domain = scenario.domain || scenario.title;
    this.prepModal.show();
  }

  async startGameGeneration(difficulty = "Normal", persona = "", questionPrefs = "") {
    if (!requireLLMConfig()) return;
    localStorage.removeItem('boardGameState'); // Clear old save
    this.difficulty = difficulty;
    this.systemPersona = persona || "You are a strategic game AI designed to test business acumen and critical thinking.";
    this.questionPreferences = questionPrefs;

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
      <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="score-panel d-flex gap-3 align-items-center m-0">
            <div class="score-item border border-warning text-warning"><i class="bi bi-coin"></i> <span id="game-score">${this.score}</span></div>
            <div class="score-item border border-info text-info"><i class="bi bi-mortarboard-fill"></i> <span id="game-knowledge">${this.xp}</span> XP</div>
            
            <!-- Level Badge with Tooltip -->
            <div class="score-item border border-light text-white position-relative" id="level-badge" title="Current Level">
                <i class="bi bi-graph-up-arrow"></i> Lvl <span id="game-level">${this.level}</span>
                <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" id="perk-badge" style="display: none; font-size: 0.6rem;">
                    PERK
                </span>
            </div>

            <!-- Streak Panel -->
            <div class="score-item border border-danger text-danger" id="streak-panel" style="opacity: ${this.streak > 1 ? '1' : '0.5'}">
                <i class="bi bi-fire"></i> <span id="game-streak">${this.streak}</span>
            </div>

            <!-- Shop & Inventory -->
            <button class="btn btn-outline-warning position-relative" id="shop-btn" title="Item Shop">
                <i class="bi bi-cart-fill"></i>
                <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" id="inventory-badge" style="display:none">0</span>
            </button>
          </div>

          <button id="sound-toggle" class="btn btn-outline-secondary btn-sm rounded-circle" style="width: 40px; height: 40px;">
             <i class="bi bi-volume-up-fill"></i>
          </button>
      </div>

      <!-- Effects Overlay -->
      <div id="active-effects" class="d-flex gap-2 justify-content-center mb-2" style="min-height: 24px;"></div>
      
      <div class="text-center text-white-50 mb-3 small">
        ${this.domain ? this.domain.toUpperCase() : 'LOADING...'} • ${this.difficulty || 'Normal'}
      </div>
      
      <div class="board-container" id="game-board">
        <!-- Center Hub -->
        <div class="board-center text-center">
          ${isLoading ?
        `<div class="spinner-border text-primary mb-3" role="status"></div>
             <h4 class="animate-pulse">Designing "${this.domain}"...</h4>
             <p class="small text-muted">Generating tiles, rules, and economy...</p>`
        :
        `<h2 class="text-white mb-2" style="text-shadow:0 0 10px white">${this.domain}</h2>
             <div class="small text-white-50 mb-4">STRATEGY EDITION</div>
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Press Roll to start!</p>`
      }
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
            <!-- GM Message Area -->
            <div id="gm-message" class="alert alert-dark border-primary d-none mb-4">
                <div class="d-flex align-items-start gap-3">
                    <i class="bi bi-robot text-primary fs-2"></i>
                    <div>
                        <strong class="text-primary d-block mb-1">Game Master</strong>
                        <span id="gm-text" class="text-light fst-italic">...</span>
                    </div>
                </div>
            </div>

            <p id="modal-question" class="fs-5 mb-4">...</p>
            <div id="modal-options" class="modal-options w-100"></div>
            <div id="modal-lifelines" class="mt-3"></div>
            <div id="modal-feedback" class="mt-3 d-none"></div>
          </div>
          <div class="modal-footer mt-4 text-end">
            <button class="btn btn-light px-4 d-none" id="modal-close-btn">Continue</button>
          </div>
        </div>
      </div>
      
      <!-- Shop Modal (New) -->
      <div class="modal fade" id="shopModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content text-dark">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="bi bi-cart4"></i> Strategy Shop</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-muted mb-3">Invest your capital to gain strategic advantages.</p>
                    <div class="list-group">
                        <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" id="buy-shield">
                            <div>
                                <h6 class="mb-1"><i class="bi bi-shield-check text-primary"></i> Streak Shield</h6>
                                <p class="mb-0 small text-muted">Protects streak from one wrong answer.</p>
                            </div>
                            <span class="badge bg-warning text-dark text-lg rounded-pill">500 Cr</span>
                        </button>
                        <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" id="buy-xp">
                            <div>
                                <h6 class="mb-1"><i class="bi bi-lightning-charge-fill text-warning"></i> XP Booster</h6>
                                <p class="mb-0 small text-muted">+50% XP for 5 turns.</p>
                            </div>
                            <span class="badge bg-warning text-dark text-lg rounded-pill">800 Cr</span>
                        </button>
                    </div>
                </div>
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
    if (btn) btn.onclick = () => this.handleRoll();
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

    // Shop
    const shopBtn = this.container.querySelector('#shop-btn');
    if (shopBtn) {
      shopBtn.onclick = () => new bootstrap.Modal(this.container.querySelector('#shopModal')).show();
    }

    this.container.querySelector('#buy-shield').onclick = () => this.buyItem('shield', 500);
    this.container.querySelector('#buy-xp').onclick = () => this.buyItem('xpBoost', 800);
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

      // Use Custom Persona if available, otherwise default
      const persona = this.systemPersona ? this.systemPersona : "You are a game designer.";

      // Updated Prompt: Ask for Title and Tiles
      const prompt = `Analyze the domain request: "${domain}".
      1. Create a short, punchy Title (max 3-5 words) that captures the essence of this domain.
      2. Generate 20 distinct board game tile concepts for this domain.
      
      For each concept, provide a concise visual keyword to search for an icon (e.g., "sword", "bitcoin", "atom").

      Return strictly a JSON object. Format:
      {
        "title": "The Generated Title",
        "tiles": [{"name": "Concept Name", "keyword": "search-term"}, ...]
      }
      Do not use Markdown.`;

      let items = [];

      try {
        const responseStream = await this.askLLM([
          { role: 'system', content: persona },
          { role: 'user', content: prompt }
        ]);
        let fullText = "";
        for await (const chunk of responseStream) fullText += chunk;

        let multiplier = 1;
        if (this.activeEffects.xpBoostTurns > 0) multiplier = 1.5;

        console.log("LLM Raw Output:", fullText); // Debug log
        const parsed = parseRelaxedJSON(fullText);

        // Handle Object format (Preferred) or Array format (Fallback)
        if (parsed && parsed.tiles && Array.isArray(parsed.tiles)) {
          items = parsed.tiles;
          if (parsed.title) {
            this.domain = parsed.title; // Update Domain with smart title
            domain = this.domain; // Update local scope for UI
          }
        } else if (Array.isArray(parsed)) {
          items = parsed;
        } else {
          throw new Error("Invalid output format");
        }

        // Fix: Robust Filtering of Invalid Items (Nulls/Empties)
        items = items.filter(i => i && (typeof i === 'string' || (typeof i === 'object' && i.name)));

        if (items.length === 0) throw new Error("No valid items generated");

      } catch (e) {
        this.log(`Generation failed: ${e.message}. Using placeholders.`);
        // Fallback with generic icons
        items = Array(16).fill(null).map((_, i) => ({ name: `${domain} ${i + 1}`, keyword: 'shape' }));
      }

      // Ensure we have enough items
      if (!items || items.length === 0) items = Array(16).fill(null).map((_, i) => ({ name: `${domain} ${i + 1}`, keyword: 'shape' }));
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
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
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

    const btn = this.container.querySelector('#roll-btn');
    if (btn) btn.disabled = true;

    const diceDisplay = this.container.querySelector('#dice-display');
    diceDisplay.classList.add('rolling');

    let rolls = 0;
    const interval = setInterval(() => {
      const face = Math.floor(Math.random() * 6) + 1;
      diceDisplay.innerHTML = `<i class="bi bi-dice-${face}"></i>`;
      rolls++;
      if (rolls > 12) {
        clearInterval(interval);
        this.finishRoll(face);
      }
    }, 80);
  }

  async finishRoll(roll) {
    const diceDisplay = this.container.querySelector('#dice-display');
    diceDisplay.classList.remove('rolling');
    this.isRolling = false;

    this.log(`Rolled a ${roll}!`);

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
    // 1. Check for Boss Battle
    if (this.pendingBoss) {
      this.triggerBossBattle();
      this.pendingBoss = false; // Reset trigger
      this.saveGame();
      return;
    }

    const tile = this.tiles[this.playerPosition];
    this.log(`Landed on ${tile.name}`);

    if (tile.type === 'corner') {
      this.handleCorner(tile);
    } else {
      // Standard Question (Always 4 Options)
      if (this.activeEffects.xpBoostTurns > 0) this.activeEffects.xpBoostTurns--;
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

  // --- Safe Generator Wrapper ---
  async safeJSONGen(promptOrMessages, fallbackType) {
    const buildMessages = (note) => {
      if (Array.isArray(promptOrMessages)) {
        const messages = promptOrMessages.map(m => ({ ...m }));
        if (note) {
          const last = messages[messages.length - 1];
          if (last && last.role === 'user') {
            last.content += `\n\n${note}`;
          } else {
            messages.push({ role: 'user', content: note });
          }
        }
        return messages;
      }
      const content = note ? `${promptOrMessages}\n\n${note}` : promptOrMessages;
      return [{ role: 'user', content }];
    };

    // Attempt 1
    try {
      const responseStream = await this.askLLM(buildMessages());
      let txt = "";
      for await (const chunk of responseStream) txt += chunk;
      return parseRelaxedJSON(txt);
    } catch (e) {
      console.warn("Attempt 1 failed:", e);
    }

    // Attempt 2 (Retry)
    try {
      console.log("Retrying generation...");
      const retryNote = "IMPORTANT: Previous attempt failed. Output STRICT VALID JSON ONLY. No markdown.";
      const responseStream = await this.askLLM(buildMessages(retryNote));
      let txt = "";
      for await (const chunk of responseStream) txt += chunk;
      return parseRelaxedJSON(txt);
    } catch (e) {
      console.warn("Attempt 2 failed:", e);
    }

    // Fallback (Safe Mode)
    console.log("Using Fallback Content");
    return this.getFallbackContent(fallbackType);
  }

  getFallbackContent(type) {
    if (type === 'question') {
      return {
        gm_comment: "The connection is static... I'll give you a standard test.",
        question: "Which of the following is a key component of logical analysis?",
        options: ["Emotion", "Data Verification", "Assumption", "Impulse"],
        correctIndex: 1,
        explanation: "Data verification is crucial for objective analysis.",
        reward: 100
      };
    } else if (type === 'event') {
      return {
        gm_comment: "A sudden twist of fate!",
        scenario: "You find a lost wallet in the boardroom.",
        options: [
          { text: "Return it", outcome: "Safe: +50 Karma/Credits", type: "safe" },
          { text: "Keep it", outcome: "Risky: High Reward or Penalty", type: "risky" }
        ]
      };
    } else if (type === 'boss') {
      return {
        gm_comment: "The Boss looks impatient.",
        scenario: "The market crashes unexpectedly. What is your immediate move?",
        options: ["Panic Sell", "Hold and Analyze", "Buy the Dip blindly", "Ignore"],
        correctIndex: 1,
        explanation: "Holding allows for level-headed assessment."
      };
    }
    return {};
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
    lifelinesEl.innerHTML = '';

    let difficultyNotes = "";
    if (this.difficulty === "Easy") {
      difficultyNotes = "Question should be foundational/basic.";
    } else if (this.difficulty === "Hard") {
      difficultyNotes = "Question should be complex.";
    }

    const persona = this.systemPersona ? this.systemPersona : "You are a Game Master.";
    const context = `Player Stats: Level: ${this.level}, Credits: ${this.score}, Streak: ${this.streak}`;

    // Build preference instructions
    let preferenceNotes = "";
    if (this.questionPreferences) {
      preferenceNotes = `\nUser Preferences: ${this.questionPreferences}\nIMPORTANT: Tailor the question to match these preferences.`;
    }

    const prompt = `${context}
    Current Topic: "${topic}" inside Domain: "${this.domain}".
    
    Instructions:
    ${difficultyNotes}${preferenceNotes}

    Task: Generate a scenario-based multiple-choice question.
    - Be dynamic.
    - Provide a short scenario setup that frames the question.
    - IMPORTANT: Randomize the correct answer position (0-3). Do NOT always put the correct answer first.
    
    Format (JSON):
    {
      "scenario": "Brief scenario context (2-4 sentences).",
      "question": "Question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctIndex": 2, // Random 0-3
      "hint": "Clue.",
      "explanation": "Why.",
      "reward": 150
    }`;

    try {
      // 2. Use the new robust parser
      const data = await this.safeJSONGen(
        [
          { role: 'system', content: persona },
          { role: 'user', content: prompt }
        ],
        'question'
      );

      // STRICT 4-OPTION ENFORCEMENT
      if (!data.options || !Array.isArray(data.options)) data.options = ["Option A", "Option B", "Option C", "Option D"];

      // Pad if too few
      const fillers = ["None of the above", "All of the above", "Not applicable", "Other"];
      let fillIdx = 0;
      while (data.options.length < 4) {
        data.options.push(fillers[fillIdx++] || `Option ${String.fromCharCode(65 + data.options.length)}`);
      }
      // Trim if too many
      if (data.options.length > 4) data.options = data.options.slice(0, 4);

      // Inject Boost Multiplier info into explanation
      if (this.activeEffects.xpBoostTurns > 0) {
        data.reward = Math.floor((data.reward || 100) * 1.5);
      }

      // Removed Randomize Options Logic to maintain A, B, C, D order

      this.currentQuestionData = data;

      // Render Question & Options
      // Removed GM Comment
      this.container.querySelector('#gm-message').classList.add('d-none');

      this.container.querySelector('#modal-reward').textContent = `Reward: ${data.reward || 100}`;
      if (data.scenario) {
        qEl.innerHTML = `<div class="small text-white-50 mb-2">${data.scenario}</div>${data.question}`;
      } else {
        qEl.textContent = data.question;
      }
      optsEl.innerHTML = '';

      if (!data.options || !Array.isArray(data.options)) throw new Error("Invalid options format");

      data.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = "btn btn-outline-light w-100 text-start mb-2 p-3 position-relative option-btn";
        btn.dataset.idx = idx;
        btn.textContent = opt;
        btn.onclick = () => this.handleAnswer(idx, btn);
        optsEl.appendChild(btn);
      });

      // Render Lifelines
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

    } catch (e) {
      console.error(e);
      // Even with fallback, if rendering fails:
      qEl.innerHTML = `<div class="alert alert-danger">
          <strong>System Failure:</strong> ${e.message}<br>
          <small>The game core is restarting...</small>
        </div>`;
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


      // Shield Check
      if (this.inventory.shield > 0) {
        this.inventory.shield--;
        // CORRECT LOGIC:
        // Don't deduct score. Don't play wrong sound (maybe shield sound).
        // Maintain streak.

        feedback.innerHTML = `<div class="text-warning"><i class="bi bi-shield-fill-check"></i> Shield Activated! Streak Saved.</div><div class="small text-white-50 mt-1">${data.explanation}</div>`;
        this.socketConfetti({ particleCount: 50, spread: 40, colors: ['#ffc107'] }); // Small poof

        this.updateUI(); // Inventory update

        this.saveGame();
        const closeBtn = this.container.querySelector('#modal-close-btn');
        closeBtn.classList.remove('d-none');
        return; // Exit early
      }

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
      this.log(`🎉 LEVEL UP! You are now Level ${this.level}`);
      this.fireConfetti();

      // Show perk badge temporarily
      const perk = this.container.querySelector('#perk-badge');
      if (perk) {
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
    if (s) s.textContent = this.score;

    const x = this.container.querySelector('#game-knowledge');
    if (x) x.textContent = this.xp;

    const l = this.container.querySelector('#game-level');
    if (l) l.textContent = this.level;

    const st = this.container.querySelector('#game-streak');
    const stPanel = this.container.querySelector('#streak-panel');
    if (st) st.textContent = this.streak;
    if (stPanel) stPanel.style.opacity = this.streak > 0 ? '1' : '0.5';

    // Update Inventory Badge
    const invBadge = this.container.querySelector('#inventory-badge');
    const totalItems = (this.inventory.shield || 0) + (this.inventory.xpBoost || 0);
    if (invBadge) {
      invBadge.textContent = totalItems;
      invBadge.style.display = totalItems > 0 ? 'block' : 'none';
    }

    // Update Effects
    const effDiv = this.container.querySelector('#active-effects');
    if (effDiv) {
      effDiv.innerHTML = '';
      if (this.activeEffects.xpBoostTurns > 0) {
        effDiv.innerHTML += `<span class="badge bg-warning text-dark"><i class="bi bi-lightning-charge"></i> XP Boost (${this.activeEffects.xpBoostTurns} turns)</span>`;
      }
    }
  }

  // --- New Features ---

  buyItem(type, cost) {
    if (this.score >= cost) {
      this.score -= cost;
      this.inventory[type]++;
      this.sounds.play('correct'); // Cha-ching
      this.log(`Bought ${type}!`);
      this.updateUI();
      this.saveGame();
    } else {
      alert("Not enough credits!");
    }
  }

  async triggerEvent(context) {
    this.openModal(`Event: ${context}`);
    // Show loading
    const qEl = this.container.querySelector('#modal-question');
    const optsEl = this.container.querySelector('#modal-options');
    qEl.innerHTML = `<div class="spinner-border text-info"></div> GM is weaving a story...`;
    optsEl.innerHTML = '';
    this.container.querySelector('#modal-lifelines').innerHTML = ''; // Hide lifelines for events
    this.container.querySelector('#gm-message').classList.add('d-none'); // Hide initially

    const prompt = `You are the Decision Master.
      Player Status: Level ${this.level}, Score ${this.score}, Streak ${this.streak}.
      
      Generate a 'Decision Logic' event for the topic: "${context}".
      Present a situational dilemma with TWO choices.
      
      Constraints:
      - Do NOT start with "Welcome to...".
      - Keep the GM Comment reacting to the current situation (e.g. "Chaos strikes!", "An opportunity arises...").
      
      Format (JSON):
      {
         "gm_comment": "Narrative intro or reaction to player status.",
         "scenario": "You found a bug in production...",
         "options": [
            {"text": "Hotfix immediately", "outcome": "Risk: High. Success: +300 Cr. Fail: -100 Cr.", "type": "risky"},
            {"text": "Wait for QA", "outcome": "Safe: +50 Cr.", "type": "safe"}
         ]
      }`;

    try {
      // USE SAFE GENERATOR
      const evt = await this.safeJSONGen(
        [
          { role: 'system', content: this.systemPersona },
          { role: 'user', content: prompt }
        ],
        'event'
      );

      // Show GM Comment
      if (evt.gm_comment) {
        const gmDiv = this.container.querySelector('#gm-message');
        gmDiv.querySelector('#gm-text').textContent = evt.gm_comment;
        gmDiv.classList.remove('d-none');
      }

      qEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill text-warning mb-2 fs-3"></i><br>${evt.scenario}`;

      evt.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = `btn w-100 mb-2 p-3 text-start ${opt.type === 'risky' ? 'btn-outline-danger' : 'btn-outline-success'}`;
        btn.innerHTML = `<strong>${opt.text}</strong><br><small>${opt.outcome}</small>`;

        btn.onclick = () => {
          // Simple Resolution Logic (can be enhanced with real RNG based on risk)
          let resultMsg = "";
          let win = true;

          if (opt.type === 'risky') {
            win = Math.random() > 0.4; // 60% success
            if (win) {
              this.score += 300;
              resultMsg = "Success! The bold move paid off. +300 Credits.";
              this.fireConfetti();
            } else {
              this.score = Math.max(0, this.score - 100);
              resultMsg = "Failure! Threads unraveled. -100 Credits.";
              this.sounds.play('wrong');
            }
          } else {
            this.score += 50;
            resultMsg = "Prudent choice. +50 Credits.";
          }

          this.container.querySelector('#modal-feedback').innerHTML = `<div class="p-3 border rounded ${win ? 'border-success text-success' : 'border-danger text-danger'}">${resultMsg}</div>`;
          this.container.querySelector('#modal-feedback').classList.remove('d-none');
          optsEl.innerHTML = ''; // Remove buttons
          this.updateUI();
          this.saveGame();

          const close = this.container.querySelector('#modal-close-btn');
          close.classList.remove('d-none');
          close.focus();
        };
        optsEl.appendChild(btn);
      });

    } catch (e) {
      console.error(e);
      this.closeModal(); // Fail silently or fallback
    }
  }

  async triggerBossBattle() {
    this.openModal(`⚠️ BOSS BATTLE: Level ${this.level}`);
    this.container.querySelector('#modal-title').className = "text-danger fw-bold animate-pulse";

    const qEl = this.container.querySelector('#modal-question');
    const optsEl = this.container.querySelector('#modal-options');
    const gmDiv = this.container.querySelector('#gm-message');

    qEl.innerHTML = `<div class="spinner-border text-danger"></div> <span class="text-danger">SUMMONING BOSS SCENARIO...</span>`;
    optsEl.innerHTML = '';
    this.container.querySelector('#modal-lifelines').innerHTML = '';
    if (gmDiv) gmDiv.classList.add('d-none');

    const prompt = `THIS IS A BOSS BATTLE.
      Domain: "${this.domain}". Level: ${this.level}.
      
      Create a high-stakes, complex strategic scenario (The Final Exam).
      It must be significantly harder than normal questions.
      
      Constraints:
      - Do NOT use generic intros like "Welcome to the Boss Level".
      - Jump straight into the crisis.
      - GM Comment should be intimidating.
      - Randomize the correct option position.
      
      Format (JSON):
      {
         "gm_comment": "Intimidating intro. Tell them what is at stake.",
         "scenario": "Your entire company is facing a hostile takeover...",
         "options": [
            "Option A", 
            "Option B", 
            "Option C", 
            "Option D"
         ],
         "correctIndex": 2, // Random 0-3
         "explanation": "Why A saved the company."
      }`;

    try {
      // USE SAFE GENERATOR
      const boss = await this.safeJSONGen(
        [
          { role: 'system', content: this.systemPersona },
          { role: 'user', content: prompt }
        ],
        'boss'
      );

      if (boss.gm_comment && gmDiv) {
        gmDiv.querySelector('#gm-text').textContent = boss.gm_comment;
        gmDiv.classList.remove('d-none');
        gmDiv.classList.remove('alert-dark');
        gmDiv.classList.add('alert-danger'); // Red alert for boss
      }

      qEl.innerHTML = `<h4 class="text-danger mb-3">CRITICAL SITUATION</h4>${boss.scenario}`;

      // Shuffle options logic
      if (boss.options && Array.isArray(boss.options)) {
        const correctText = boss.options[boss.correctIndex];
        for (let i = boss.options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [boss.options[i], boss.options[j]] = [boss.options[j], boss.options[i]];
        }
        boss.correctIndex = boss.options.findIndex(o => o === correctText);
      }

      boss.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = "btn btn-outline-danger w-100 text-start mb-2 p-4 option-btn"; // Red theme
        btn.textContent = opt;
        btn.onclick = () => {
          // Boss Resolution
          optsEl.innerHTML = ''; // Clear buttons
          const feedback = this.container.querySelector('#modal-feedback');

          if (idx === boss.correctIndex) {
            this.sounds.play('levelup');
            this.inventory.masterKey = (this.inventory.masterKey || 0) + 1;
            this.xp += 500;
            this.score += 1000;

            feedback.innerHTML = `
                       <div class="text-success text-center">
                           <h1><i class="bi bi-trophy-fill"></i> BOSS DEFEATED!</h1>
                           <p class="fs-4">You earned a MASTER KEY + 1000 Credits!</p>
                       </div>
                       <div class="mt-3 text-muted">${boss.explanation}</div>
                       `;
            this.socketConfetti({ particleCount: 200, spread: 100 });
          } else {
            this.sounds.play('wrong');
            feedback.innerHTML = `
                       <div class="text-danger text-center">
                           <h1><i class="bi bi-skull-fill"></i> DEFEATED...</h1>
                           <p class="fs-4">The board strikes back.</p>
                       </div>
                       <div class="mt-3 text-muted">${boss.explanation}</div>
                       `;
          }

          feedback.classList.remove('d-none');
          this.updateUI();
          this.saveGame();

          const close = this.container.querySelector('#modal-close-btn');
          close.classList.remove('d-none');
        };
        optsEl.appendChild(btn);
      });

    } catch (e) {
      console.error(e);
      this.closeModal();
    }
  }

  async fireConfetti() {
    const confetti = await loadConfetti();
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  async socketConfetti(opts) {
    const confetti = await loadConfetti();
    confetti(opts);
  }

  log(text) {
    const l = this.container.querySelector('#game-log');
    if (l) l.textContent = text;
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
      if (next && (next !== prev || nextK !== prevK)) {
        showAlert('success', 'LLM configured');
      }
    } catch { }
  }
});

// Initialize the game
window.addEventListener('load', async () => {
  const boardGameInstance = new BoardGame('#board-game-view', askLLM);
  await boardGameInstance.init();
});
