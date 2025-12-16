# Strategy Board Game

An AI-powered educational board game that turns any subject into an interactive learning experience. Generate custom game boards with LLM-created questions and challenges.

## Features
- **Dynamic Board Generation**: Turn any topic (Quantum Physics, History, Business, etc.) into a playable board game
- **AI-Generated Questions**: LLM creates contextual multiple-choice questions for each tile
- **Iconify Integration**: Visual icons automatically matched to each game concept
- **Streak System**: Build combos for bonus rewards
- **Mastery Tracking**: Mark tiles as mastered with visual indicators
- **Score & XP System**: Track your progress with credits and experience points

## Architecture
- **index.html**: Minimal UI shell with navbar and game container
- **script.js**: Complete board game logic including:
  - Board generation and rendering
  - LLM integration for questions
  - Game mechanics (dice rolling, movement, scoring)
  - Modal-based question system
- **boardgame.css**: Complete styling for the board, tiles, modals, and animations

## Getting Started

### 1. Configure LLM
Click "Configure" in the navbar and set:
- **Base URL**: Your OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`)
- **API Key**: Your API key
- **Model**: e.g., `gpt-4o-mini`

### 2. Generate a Game
1. Enter any topic you want to learn about (e.g., "Ancient Rome", "Machine Learning", "Financial Markets")
2. Click "Generate Game Board"
3. Wait for the AI to create 20 unique tile concepts with matching icons

### 3. Play
1. Click "ROLL DICE" to move around the board
2. Answer questions when you land on tiles
3. Build streaks for bonus rewards
4. Master tiles by answering correctly

## Game Mechanics

### Board Layout
- **20 tiles** arranged in a square path
- **4 corner tiles**: START, BREAK, BONUS, RISK
- **16 property tiles**: Topic-specific challenges

### Scoring
- **Correct Answer**: +reward (base 100-150) × streak multiplier
- **Wrong Answer**: -50 credits
- **Streak Bonus**: 1.1x, 1.2x, 1.3x... (increases with consecutive correct answers)
- **Mastery Bonus**: First correct answer on a tile marks it as mastered

### Corner Tiles
- **START**: +200 credits when passing
- **BONUS**: Random bonus 100-400 credits
- **RISK**: Random penalty 50-250 credits
- **BREAK**: Rest tile (no effect)

## Technical Details

### LLM Integration
The game uses two types of LLM calls:

1. **Board Generation**:
   ```javascript
   // Generates 20 tile concepts with visual keywords
   [{"name": "Concept Name", "keyword": "search-term"}, ...]
   ```

2. **Question Generation**:
   ```javascript
   {
     "question": "Question text?",
     "options": ["A", "B", "C", "D"],
     "correctIndex": 0,
     "explanation": "Why correct",
     "reward": 150
   }
   ```

### Icon System
- Uses **Iconify API** to search and fetch icons based on keywords
- Fallback icons provided if search fails
- Bootstrap Icons used for corner tiles

### State Management
The `BoardGame` class manages:
- Player position and movement
- Score, XP, and streak tracking
- Tile states and mastery
- Question/answer flow

## Libraries Used
- **Bootstrap 5.3.8**: UI framework
- **Bootstrap Icons 1.13.1**: Icon library for UI elements
- **Iconify 3.1.1**: Dynamic icon loading for game tiles
- **asyncllm v2**: Streaming LLM responses
- **bootstrap-llm-provider v1**: LLM configuration UI
- **@gramex/ui v0.3.1**: Dark theme support

## Development Notes
- Pure client-side application (no server required)
- All game state stored in memory (resets on refresh)
- LLM responses parsed with robust JSON recovery
- Responsive design works on desktop and tablet

## Run & Deploy
- **Run locally**: Open `index.html` in a modern browser
- **Deploy**: Host on any static server (GitHub Pages, Netlify, Vercel, etc.)

## Customization
You can modify:
- **Board size**: Change `this.boardSize` in the BoardGame class
- **Starting credits**: Modify `this.score` initial value
- **Reward amounts**: Adjust in question generation prompt
- **Streak multiplier**: Change formula in `handleAnswer()`

## License
MIT
