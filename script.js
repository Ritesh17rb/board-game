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
const CFG_KEY = "bootstrapLLMProvider_openaiConfig";

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
    this.domain = "";
    this.tiles = [];
    this.isRolling = false;
    this.boardSize = 20;
    this.currency = "Credits";
    this.streak = 0; // New: Streak tracking
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

  renderSetup() {
    this.container.innerHTML = `
      <div class="h-100 d-flex flex-column justify-content-center align-items-center text-white text-center p-5 font-monospace">
        <h1 class="display-4 mb-4"><i class="bi bi-joystick"></i> Game Generator</h1>
        <p class="lead mb-4">Turn any subject into a playable strategy board game in seconds.</p>
        
        <div class="card bg-dark border-light w-100" style="max-width: 500px">
          <div class="card-body p-4">
            <h5 class="card-title mb-3">Choose your Challenge</h5>
            <div class="mb-3 text-start">
              <label class="form-label text-warning mb-1">What do you want to master?</label>
              <input type="text" id="domain-input" class="form-control form-control-lg bg-black text-white border-secondary" placeholder="e.g. Quantum Physics, Startup Law, Indian History...">
            </div>

            <div class="d-grid">
              <button id="start-game-btn" class="btn btn-success btn-lg">
                <i class="bi bi-stars"></i> Generate Game Board
              </button>
            </div>
          </div>
        </div>
        
        <div class="mt-4 text-white-50 small">
          <i class="bi bi-cpu"></i> Powered by your LLM Advisor
        </div>
      </div>
    `;

    this.container.querySelector('#start-game-btn').onclick = () => {
      const input = this.container.querySelector('#domain-input').value.trim();
      if (!input) return;
      this.domain = input;
      this.startGameGeneration();
    };
  }

  async startGameGeneration() {
    this.renderLayout(true); // Show layout with loading state
    await this.generateBoardContent(this.domain);
  }

  renderLayout(isLoading = false) {
    this.container.innerHTML = `
      <div class="score-panel justify-content-center gap-3">
        <div class="score-item border border-warning text-warning"><i class="bi bi-coin"></i> <span id="game-score">${this.score}</span></div>
        <div class="score-item border border-info text-info"><i class="bi bi-mortarboard-fill"></i> <span id="game-knowledge">${this.xp}</span> XP</div>
        
        <!-- Streak Panel -->
        <div class="score-item border border-danger text-danger" id="streak-panel" style="opacity: ${this.streak > 1 ? '1' : '0.5'}">
            <i class="bi bi-fire"></i> <span id="game-streak">${this.streak}</span> Streak
        </div>

        <div class="score-item border border-secondary text-white small">${this.domain ? this.domain.toUpperCase() : 'LOADING...'}</div>
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
            <p id="modal-question" class="fs-5 mb-4">...</p>
            <div id="modal-options" class="modal-options w-100"></div>
            <div id="modal-feedback" class="mt-3 d-none"></div>
          </div>
          <div class="modal-footer mt-4 text-end">
            <button class="btn btn-light px-4 d-none" id="modal-close-btn">Continue</button>
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
             <div class="small text-white-50 mb-4">STRATEGY EDITION</div>
             <div id="dice-display" class="mb-3"><i class="bi bi-dice-6"></i></div>
             <button id="roll-btn" class="btn btn-primary btn-lg px-5 shadow-lg">ROLL DICE</button>
             <p class="mt-3 text-white-50 small" id="game-log">Press Roll to start!</p>
      `;
      this.attachEvents();

      // Trigger Iconify to render the new icons
      if (window.Iconify) {
          setTimeout(() => window.Iconify.scan(), 100);
      }

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

setTile(index, name, icon, type, metadata = null) {
    const t = this.tiles[index];
    t.name = name;
    t.type = type;
    t.metadata = metadata;
    
    // Clear previous classes
    t.element.className = 'tile'; 

    let innerHTML = '';

    if (type === 'corner') {
      // Keep using Bootstrap Icons for corners (consistent UI)
      t.element.classList.add('corner');
      innerHTML = `<i class="bi bi-${icon} tile-icon"></i><div style="line-height:1.1">${name}</div>`;
    } else {
      // Use Iconify for properties
      t.element.classList.add('property');
      
      // CSS to make the icon look like a graphical background
      const iconStyle = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 3.5rem;
          opacity: 0.25;
          z-index: 0;
          pointer-events: none;
      `;
      
      const textStyle = `
          position: relative; 
          z-index: 1; 
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
      `;

      innerHTML = `
          <span class="iconify" data-icon="${icon}" style="${iconStyle}"></span>
          <div style="${textStyle}">${name}</div>
      `;
    }

    t.element.innerHTML = innerHTML;
  }

  async handleRoll() {
    if (this.isRolling) return;
    this.isRolling = true;
    
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
        await new Promise(r => setTimeout(r, 250));
    }
    
    setTimeout(() => this.handleLanding(), 300);
    
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
  }

  async askQuestion(topic) {
    this.openModal(`Topic: ${topic}`);
    const qEl = this.container.querySelector('#modal-question');
    const optsEl = this.container.querySelector('#modal-options');
    
    // UI Loading State
    qEl.innerHTML = `<div class="d-flex align-items-center justify-content-center gap-3">
        <div class="spinner-border text-primary"></div> 
        <div>Consulting the ${this.domain} Expert...</div>
    </div>`;
    optsEl.innerHTML = '';
    
    // 1. Stricter Prompt
    const prompt = `You are a game engine.
    Topic: "${topic}" inside Domain: "${this.domain}".
    Task: Generate a multiple-choice question.
    
    CRITICAL: Output valid JSON only. Do not stutter. Do not use Markdown.
    
    Format:
    {
      "question": "The question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
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
        
        // 3. Render
        this.container.querySelector('#modal-reward').textContent = `Reward: ${data.reward || 100}`;
        qEl.textContent = data.question;
        optsEl.innerHTML = '';
        
        if (!data.options || !Array.isArray(data.options)) throw new Error("Invalid options format");
        
        data.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = "btn btn-outline-light w-100 text-start mb-2 p-3 position-relative";
            btn.textContent = opt;
            btn.onclick = () => this.handleAnswer(idx, btn);
            optsEl.appendChild(btn);
        });
        
    } catch(e) {
        console.error(e);
        qEl.innerHTML = `<div class="alert alert-danger">
          <strong>Generation Error:</strong> ${e.message}<br>
          <small class="d-block mt-2 text-muted">Try rolling again.</small>
        </div>`;
    }
  }

  handleAnswer(selectedIdx, btn) {
      const data = this.currentQuestionData;
      const feedback = this.container.querySelector('#modal-feedback');
      const allBtns = this.container.querySelectorAll('#modal-options button');
      
      allBtns.forEach(b => b.disabled = true);
      
      if (selectedIdx === data.correctIndex) {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-success');
          
          // Streak Logic
          this.streak++;
          const streakBonus = Math.max(1, 1 + (this.streak * 0.1)); // 1.1x, 1.2x...
          
          // Mastery Logic
          const currentTile = this.tiles[this.playerPosition];
          if (!currentTile.mastered) {
              currentTile.mastered = true;
              currentTile.element.classList.add('mastered-tile');
              // Add gold border or effect
              currentTile.element.style.borderColor = "#ffd700";
              currentTile.element.style.boxShadow = "0 0 15px #ffd700";
          }

          const baseReward = data.reward || 100;
          const totalReward = Math.floor(baseReward * streakBonus);
          
          this.score += totalReward;
          this.xp += 50;

          let msg = `<div class="text-success fs-4 fw-bold"><i class="bi bi-check-circle-fill"></i> Correct! +${totalReward}</div>`;
          if (this.streak > 1) msg += `<div class="text-warning fw-bold animate-pulse">🔥 ${this.streak}x Streak! (x${streakBonus.toFixed(1)})</div>`;
          if (!currentTile.mastered) msg += `<div class="text-info mt-1"><i class="bi bi-trophy-fill"></i> Tile Mastered!</div>`;
          
          feedback.innerHTML = `${msg}<div class="small text-white-50 mt-2">${data.explanation}</div>`;

      } else {
          btn.classList.remove('btn-outline-light');
          btn.classList.add('btn-danger');
          allBtns[data.correctIndex].classList.remove('btn-outline-light');
          allBtns[data.correctIndex].classList.add('btn-success'); // Show right answer
          
          this.streak = 0; // Reset streak
          
          this.score = Math.max(0, this.score - 50);
          feedback.innerHTML = `<div class="text-danger"><i class="bi bi-x-circle-fill"></i> Incorrect. -50</div><div class="small text-white-50 mt-1">${data.explanation}</div>`;
      }
      
      feedback.classList.remove('d-none');
      this.updateUI();
      
      const closeBtn = this.container.querySelector('#modal-close-btn');
      closeBtn.classList.remove('d-none');
      closeBtn.focus();
  }

  updateUI() {
      const s = this.container.querySelector('#game-score');
      if(s) s.textContent = this.score;
      
      const x = this.container.querySelector('#game-knowledge');
      if(x) x.textContent = this.xp;

      const st = this.container.querySelector('#game-streak');
      const stPanel = this.container.querySelector('#streak-panel');
      if(st) st.textContent = this.streak;
      if(stPanel) stPanel.style.opacity = this.streak > 0 ? '1' : '0.5';
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
