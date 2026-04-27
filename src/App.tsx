/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play } from 'lucide-react';

const MONETAG_ZONE_ID = '10933544';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 800;
const GROUND_HEIGHT = 150;

const BIRD_X = 100;
const BIRD_RAD = 16;
const GRAVITY = 0.45;
const JUMP_FORCE = -7.5;

const PIPE_SPEED = 2.8;
const PIPE_WIDTH = 70;
const PIPE_GAP = 210;

type GameState = 'menu' | 'playing' | 'gameover';

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

interface Coin {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  text: string;
}

interface TrailNode {
  x: number;
  y: number;
  life: number;
}

// ==== AUDIO ENGINE ====
class AudioEngine {
   ctx: AudioContext | null = null;
   noiseBuffer: AudioBuffer | null = null;
   unlocked = false;
   currentBgmNote = 0;
   
   // Dreamy, relaxing pentatonic scale
   bgmNotes = [
      261.63, // C4
      392.00, // G4
      329.63, // E4
      523.25, // C5
      392.00, // G4
      440.00, // A4
      329.63, // E4
      293.66, // D4
   ];
   
   async init() {
      try {
         if (!this.ctx) {
            const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtor) {
               this.ctx = new AudioCtor();
            }
         }
         if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
         }
         if (this.ctx && !this.unlocked) {
            // Play a silent buffer to fully unlock audio on mobile webviews/APKs
            const buffer = this.ctx.createBuffer(1, 1, 22050);
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.ctx.destination);
            source.start(0);
            this.unlocked = true;
         }
      } catch (e) {
         console.warn("Audio init warning", e);
      }
   }

   playBGMNote() {
      try {
         if (!this.ctx || this.ctx.state === 'suspended') return;
         const freq = this.bgmNotes[this.currentBgmNote % this.bgmNotes.length];
         this.currentBgmNote++;
         
         const osc = this.ctx.createOscillator();
         const gain = this.ctx.createGain();
         
         // Subtle stereo/chorus depth for a dreamy feel
         const osc2 = this.ctx.createOscillator();
         osc2.frequency.setValueAtTime(freq * 1.005, this.ctx.currentTime);
         osc2.type = 'sine';
         osc2.connect(gain);
         osc2.start();
         osc2.stop(this.ctx.currentTime + 2.0);

         osc.connect(gain);
         gain.connect(this.ctx.destination);
         
         osc.type = 'sine'; // Sleepy, smooth sine wave
         osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
         
         // Attack and long release for a dreamy echoing bell effect
         gain.gain.setValueAtTime(0, this.ctx.currentTime);
         gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.1); // Much louder and audible
         gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.0); // Slow, lingering fade out
         
         osc.start();
         osc.stop(this.ctx.currentTime + 2.0);
      } catch (e) {}
   }
   
   playFlap() {
      try {
         if (!this.ctx) return;
         const osc = this.ctx.createOscillator();
         const gain = this.ctx.createGain();
         osc.connect(gain);
         gain.connect(this.ctx.destination);
         osc.type = 'square';
         osc.frequency.setValueAtTime(150, this.ctx.currentTime);
         osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.1);
         gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
         gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
         osc.start();
         osc.stop(this.ctx.currentTime + 0.1);
      } catch (e) { }
   }

   playCoin() {
      try {
         if (!this.ctx) return;
         const osc = this.ctx.createOscillator();
         const gain = this.ctx.createGain();
         osc.connect(gain);
         gain.connect(this.ctx.destination);
         osc.type = 'sine';
         osc.frequency.setValueAtTime(1046.50, this.ctx.currentTime); // C6
         osc.frequency.setValueAtTime(1567.98, this.ctx.currentTime + 0.1); // G6
         gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
         gain.gain.setValueAtTime(0.1, this.ctx.currentTime + 0.1);
         gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
         osc.start();
         osc.stop(this.ctx.currentTime + 0.4);
      } catch (e) { }
   }

   playScore() {
      try {
         if (!this.ctx) return;
         const osc = this.ctx.createOscillator();
         const gain = this.ctx.createGain();
         osc.connect(gain);
         gain.connect(this.ctx.destination);
         osc.type = 'sine';
         osc.frequency.setValueAtTime(880, this.ctx.currentTime); // A5
         gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
         gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
         osc.start();
         osc.stop(this.ctx.currentTime + 0.3);
      } catch (e) { }
   }

   playHit() {
      try {
         if (!this.ctx) return;
         
         const osc = this.ctx.createOscillator();
         const gain = this.ctx.createGain();
         osc.connect(gain);
         gain.connect(this.ctx.destination);
         osc.type = 'sawtooth';
         osc.frequency.setValueAtTime(150, this.ctx.currentTime);
         osc.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.4);
         gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
         gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
         osc.start();
         osc.stop(this.ctx.currentTime + 0.4);

         if (!this.noiseBuffer) {
            const bufferSize = this.ctx.sampleRate * 0.4;
            this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
               data[i] = Math.random() * 2 - 1;
            }
         }
         
         const noiseSource = this.ctx.createBufferSource();
         noiseSource.buffer = this.noiseBuffer;
         const noiseFilter = this.ctx.createBiquadFilter();
         noiseFilter.type = 'lowpass';
         noiseFilter.frequency.setValueAtTime(1000, this.ctx.currentTime);
         noiseFilter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.4);
         const noiseGain = this.ctx.createGain();
         noiseGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
         noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
         
         noiseSource.connect(noiseFilter);
         noiseFilter.connect(noiseGain);
         noiseGain.connect(this.ctx.destination);
         noiseSource.start();
      } catch (e) { }
   }
}

const audio = new AudioEngine();

export default function App() {
  const [uiState, setUiState] = useState<GameState>('menu');
  const [shake, setShake] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const stateRef = useRef<GameState>('menu');
  const birdRef = useRef({ y: CANVAS_HEIGHT / 2, velocity: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const textsRef = useRef<FloatingText[]>([]);
  const trailRef = useRef<TrailNode[]>([]);
  const scoreRef = useRef(0);
  const coinScoreRef = useRef(0);
  const deathCountRef = useRef(0);
  const bgOffsetRef = useRef(0);
  const frameCountRef = useRef(0);

  const finalScoreRef = useRef(0);
  const finalCoinRef = useRef(0);
  const highScoreRef = useRef(0);
  const entityIdCounter = useRef(0);

  useEffect(() => {
    try {
       const saved = localStorage.getItem('birdyHighScorePlus');
       if (saved) {
         highScoreRef.current = parseInt(saved, 10);
       }
    } catch (e) {
       console.warn("Storage access denied:", e);
    }

    // Auto-Script Loader for Monetag Ads
    if (!document.querySelector(`script[data-zone="${MONETAG_ZONE_ID}"]`)) {
      const script = document.createElement('script');
      script.src = 'https://a.realsrv.com/vignette.min.js';
      script.dataset.zone = MONETAG_ZONE_ID;10933544
      script.dataset.sdk = `show_${MONETAG_ZONE_ID}`;
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const spawnParticles = (x: number, y: number, color: string | string[], count: number, speedMult = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 4 + 2) * speedMult;
      const c = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
      particlesRef.current.push({
        id: entityIdCounter.current++,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 20 + 20,
        color: c,
        size: Math.random() * 4 + 2
      });
    }
  };

  const spawnFloatingText = (x: number, y: number, text: string) => {
     textsRef.current.push({
       id: entityIdCounter.current++,
       x,
       y,
       life: 0,
       maxLife: 40,
       text
     });
  };

  const triggerGameOver = useCallback(() => {
    if (stateRef.current === 'gameover') return;
    stateRef.current = 'gameover';
    audio.playHit();
    
    // Screen shake
    setShake(true);
    setTimeout(() => setShake(false), 400);

    // Compute total score (distance + coins * 5)
    const totalCurrentScore = scoreRef.current + (coinScoreRef.current * 5);
    finalScoreRef.current = totalCurrentScore;
    finalCoinRef.current = coinScoreRef.current;
    
    try {
       if (totalCurrentScore > highScoreRef.current) {
         highScoreRef.current = totalCurrentScore;
         localStorage.setItem('birdyHighScorePlus', totalCurrentScore.toString());
       }
    } catch (e) {
       console.warn("Storage save denied:", e);
    }
    
    // Spawn feathers
    spawnParticles(BIRD_X, birdRef.current.y, '#facc15', 15);
    spawnParticles(BIRD_X, birdRef.current.y, '#white', 10);

    setUiState('gameover');
    
    // Smart Frequency: Only show ad every 3rd death
    deathCountRef.current += 1;
    if (deathCountRef.current % 3 === 0) {
        try {
            const showAdFunc = (window as any)[`show_${MONETAG_ZONE_ID}`];
            if (typeof showAdFunc === 'function') {
                showAdFunc().then(() => {
                    console.log('Ad displayed');
                }).catch((err: any) => {
                    console.log('Ad triggered but failed/blocked', err);
                });
            } else {
                console.log('Ad script not ready or blocked');
            }
        } catch (e) {
            console.log('Ad trigger error', e);
        }
    }
  }, []);

  const resetGame = useCallback(() => {
    birdRef.current = { y: CANVAS_HEIGHT / 2.5, velocity: 0 };
    pipesRef.current = [];
    coinsRef.current = [];
    particlesRef.current = [];
    textsRef.current = [];
    trailRef.current = [];
    scoreRef.current = 0;
    coinScoreRef.current = 0;
    bgOffsetRef.current = 0;
    frameCountRef.current = 0;
  }, []);

  const startGame = useCallback(() => {
    audio.init();
    resetGame();
    stateRef.current = 'playing';
    setUiState('playing');
    birdRef.current.velocity = JUMP_FORCE;
    audio.playFlap();
    spawnParticles(BIRD_X, birdRef.current.y, '#fef08a', 5);
  }, [resetGame]);

  const handleInput = useCallback(() => {
    audio.init();
    if (stateRef.current === 'menu') {
      startGame();
    } else if (stateRef.current === 'playing') {
      birdRef.current.velocity = JUMP_FORCE;
      audio.playFlap();
      spawnParticles(BIRD_X, birdRef.current.y, '#fef08a', 5);
    }
  }, [startGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleInput();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const drawCuteBird = (y: number, velocity: number) => {
      ctx.save();
      ctx.translate(BIRD_X, y);
      
      let rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, velocity * 0.1));
      if (velocity > 12) rotation = Math.PI / 2;
      ctx.rotate(rotation);

      // Tail feathers
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.moveTo(-BIRD_RAD + 2, 0);
      ctx.lineTo(-BIRD_RAD - 10, -8);
      ctx.lineTo(-BIRD_RAD - 12, 0);
      ctx.lineTo(-BIRD_RAD - 10, 8);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#27272a';
      ctx.stroke();

      // Body 
      ctx.fillStyle = '#facc15'; 
      ctx.beginPath();
      ctx.ellipse(0, 0, BIRD_RAD + 2, BIRD_RAD - 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Wing (Flapping)
      let flap = 0;
      if (stateRef.current !== 'gameover') {
         flap = Math.sin(frameCountRef.current * 0.5) * 8;
      }
      ctx.fillStyle = 'white'; 
      ctx.beginPath();
      ctx.ellipse(-6, 2, 11, 7 + flap / 2, -Math.PI/10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eye background
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(8, -5, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pupil
      ctx.fillStyle = 'black';
      ctx.beginPath();
      // look slightly up or down based on velocity unless dead
      const lookY = stateRef.current === 'gameover' ? -5 : (velocity < 0 ? -6 : -4);
      ctx.arc(10, lookY, 3.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Eye shine
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(9, lookY - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      if (velocity < -1 && stateRef.current !== 'gameover') {
          // Open beak
          ctx.moveTo(12, 0);
          ctx.lineTo(26, -5);
          ctx.lineTo(14, 3);
          ctx.lineTo(24, 9);
          ctx.lineTo(12, 7);
      } else {
          // Closed beak
          ctx.moveTo(14, 0);
          ctx.lineTo(26, 3);
          ctx.lineTo(14, 7);
      }
      ctx.fill();
      ctx.stroke();

      // Head tufts
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(0, -BIRD_RAD + 2);
      ctx.lineTo(4, -BIRD_RAD - 6);
      ctx.lineTo(8, -BIRD_RAD + 2);
      ctx.fill();

      // Dead X over eye if dead
      if (stateRef.current === 'gameover') {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(7, -8); ctx.lineTo(13, -2);
        ctx.moveTo(13, -8); ctx.lineTo(7, -2);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawCoin = (x: number, y: number, frame: number) => {
      const scaleX = Math.max(0.1, Math.abs(Math.sin(frame * 0.05)));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scaleX, 1);
      
      ctx.fillStyle = '#fbbf24'; 
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#b45309'; 
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
      
      // inner slot
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-2, -6, 4, 12);

      ctx.restore();
    };

    const drawPipe = (x: number, topHeight: number) => {
      const capHeight = 32;
      const capExcess = 4;

      // Pipe colors
      const pipeColor = '#74BF2E';
      const pipeHighlight = '#9DE052';
      const pipeBorder = '#27272a';

      // TOP PIPE
      ctx.fillStyle = pipeColor;
      ctx.fillRect(x, 0, PIPE_WIDTH, topHeight);
      ctx.lineWidth = 3;
      ctx.strokeStyle = pipeBorder;
      ctx.strokeRect(x, 0, PIPE_WIDTH, topHeight);
      
      // Top Cap
      ctx.fillStyle = pipeColor;
      ctx.fillRect(x - capExcess, topHeight - capHeight, PIPE_WIDTH + capExcess * 2, capHeight);
      ctx.strokeRect(x - capExcess, topHeight - capHeight, PIPE_WIDTH + capExcess * 2, capHeight);
      
      // Bottom Y and Height
      const bottomY = topHeight + PIPE_GAP;
      const bottomH = CANVAS_HEIGHT - GROUND_HEIGHT - bottomY;
      
      // BOTTOM PIPE
      ctx.fillStyle = pipeColor;
      ctx.fillRect(x, bottomY, PIPE_WIDTH, bottomH);
      ctx.strokeRect(x, bottomY, PIPE_WIDTH, bottomH);
      
      // Bottom Cap
      ctx.fillStyle = pipeColor;
      ctx.fillRect(x - capExcess, bottomY, PIPE_WIDTH + capExcess * 2, capHeight);
      ctx.strokeRect(x - capExcess, bottomY, PIPE_WIDTH + capExcess * 2, capHeight);

      // Details (Highlights)
      ctx.fillStyle = pipeHighlight;
      ctx.fillRect(x + 5, 0, 6, topHeight - capHeight);
      ctx.fillRect(x + PIPE_WIDTH - capExcess + 1, topHeight - capHeight + 3, 6, capHeight - 6);
      
      ctx.fillRect(x + 5, bottomY + capHeight, 6, bottomH - capHeight);
      ctx.fillRect(x + PIPE_WIDTH - capExcess + 1, bottomY + 3, 6, capHeight - 6);
    };

    const loop = () => {
      const state = stateRef.current;
      frameCountRef.current++;

      // === UPDATE LOGIC ===
      if (state === 'playing') {
        const _bird = birdRef.current;
        _bird.velocity += GRAVITY;
        _bird.y += _bird.velocity;

        // Play BGM note based on frame (slower pace for relaxing feel)
        if (frameCountRef.current % 45 === 0) {
           audio.playBGMNote();
        }

        // Bird Trail
        if (frameCountRef.current % 3 === 0) {
           trailRef.current.push({ x: BIRD_X, y: _bird.y, life: 1.0 });
        }

        // Pipe spawning
        const _pipes = pipesRef.current;
        if (_pipes.length === 0 || _pipes[_pipes.length - 1].x < CANVAS_WIDTH - 280) {
          const minH = 80;
          const maxH = CANVAS_HEIGHT - GROUND_HEIGHT - PIPE_GAP - 80;
          const h = minH + Math.random() * (maxH - minH);
          _pipes.push({ x: CANVAS_WIDTH, topHeight: h, passed: false });
          
          // 50% chance to spawn a coin in the gap
          if (Math.random() > 0.3) {
             coinsRef.current.push({
                id: entityIdCounter.current++,
                x: CANVAS_WIDTH + PIPE_WIDTH / 2,
                y: h + PIPE_GAP / 2,
                collected: false
             });
          }
        }

        // Object movement
        for (let i = 0; i < _pipes.length; i++) {
          const p = _pipes[i];
          p.x -= PIPE_SPEED;

          if (!p.passed && BIRD_X - BIRD_RAD > p.x + PIPE_WIDTH) {
            p.passed = true;
            scoreRef.current++;
            audio.playScore();
            spawnFloatingText(p.x + PIPE_WIDTH/2, _bird.y - 40, '+1');

            // Confetti milestone
            if (scoreRef.current > 0 && scoreRef.current % 5 === 0) {
              const confettiColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff'];
              for(let i=0; i<3; i++) {
                spawnParticles(CANVAS_WIDTH/2 + (Math.random()*100-50), CANVAS_HEIGHT/3 + (Math.random()*100-50), confettiColors, 15, 1.5);
              }
            }
          }

          // Collision
          const hitRadius = BIRD_RAD - 7; 
          if (BIRD_X + hitRadius > p.x && BIRD_X - hitRadius < p.x + PIPE_WIDTH) {
             if (_bird.y - hitRadius < p.topHeight || _bird.y + hitRadius > p.topHeight + PIPE_GAP) {
                triggerGameOver();
             }
          }
        }

        for (let i = 0; i < coinsRef.current.length; i++) {
           const c = coinsRef.current[i];
           if (!c.collected) {
              c.x -= PIPE_SPEED;
              const dist = Math.hypot(BIRD_X - c.x, _bird.y - c.y);
              if (dist < BIRD_RAD + 20) {
                 c.collected = true;
                 coinScoreRef.current++;
                 audio.playCoin();
                 spawnParticles(c.x, c.y, '#fbbf24', 20);
                 spawnFloatingText(c.x, c.y - 20, '+500');
              }
           }
        }

        // Cleanups
        while (_pipes.length > 0 && _pipes[0].x < -PIPE_WIDTH - 10) _pipes.shift();
        coinsRef.current = coinsRef.current.filter(c => !c.collected && c.x > -50);

        // Ground / Ceil
        if (_bird.y + BIRD_RAD >= CANVAS_HEIGHT - GROUND_HEIGHT) {
           _bird.y = CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_RAD;
           triggerGameOver();
        }
        if (_bird.y < -BIRD_RAD * 2) {
           _bird.y = -BIRD_RAD * 2;
           _bird.velocity = 0;
        }

      } else if (state === 'menu') {
        birdRef.current.y = CANVAS_HEIGHT / 2.5 + Math.sin(frameCountRef.current * 0.08) * 15;
      } else if (state === 'gameover') {
        const _bird = birdRef.current;
        if (_bird.y + BIRD_RAD < CANVAS_HEIGHT - GROUND_HEIGHT) {
           _bird.velocity += GRAVITY;
           _bird.y += _bird.velocity;
        } else {
           _bird.y = CANVAS_HEIGHT - GROUND_HEIGHT - BIRD_RAD;
        }
      }

      // Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
         const p = particlesRef.current[i];
         p.x += p.vx;
         p.y += p.vy;
         p.vy += GRAVITY * 0.5; // particles fall
         p.life++;
         if (p.life >= p.maxLife) particlesRef.current.splice(i, 1);
      }

      // Update Texts
      for (let i = textsRef.current.length - 1; i >= 0; i--) {
        const t = textsRef.current[i];
        t.y -= 1.5;
        t.life++;
        if (t.life >= t.maxLife) textsRef.current.splice(i, 1);
      }

      // Update Trails
      for (let i = trailRef.current.length - 1; i >= 0; i--) {
        const t = trailRef.current[i];
        t.life -= 0.05;
        t.x -= PIPE_SPEED * 0.5; // Slow drift backwards relative to camera
        if (t.life <= 0) trailRef.current.splice(i, 1);
      }

      // === RENDER LOGIC ===
      // Dynamic Sky Gradient based on score
      const skyHue1 = 200 + scoreRef.current * 10;
      const skyHue2 = 140 + scoreRef.current * 10;
      const dynSkyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT - GROUND_HEIGHT);
      dynSkyGrad.addColorStop(0, `hsl(${skyHue1 % 360}, 50%, 50%)`);
      dynSkyGrad.addColorStop(1, `hsl(${skyHue2 % 360}, 50%, 80%)`);
      ctx.fillStyle = dynSkyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Clouds (Parallax background)
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 3; i++) {
         const cloudX = ((CANVAS_WIDTH + 100) - (frameCountRef.current * 0.5 + i * 200) % (CANVAS_WIDTH + 200)) - 50;
         const cloudY = 100 + i * 80;
         ctx.beginPath();
         ctx.arc(cloudX, cloudY, 30, 0, Math.PI*2);
         ctx.arc(cloudX+25, cloudY-10, 40, 0, Math.PI*2);
         ctx.arc(cloudX+50, cloudY, 30, 0, Math.PI*2);
         ctx.fill();
      }

      // City Skyline (Parallax background layer 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      for (let i = 0; i < 10; i++) {
         const bX = ((CANVAS_WIDTH + 300) - (frameCountRef.current * 0.2 + i * 110) % (CANVAS_WIDTH + 300)) - 100;
         const bH = 60 + (i % 3) * 40 + (i % 2) * 50;
         ctx.fillRect(bX, CANVAS_HEIGHT - GROUND_HEIGHT - bH, 70, bH);
      }

      // Pipes
      for (const p of pipesRef.current) {
        drawPipe(p.x, p.topHeight);
      }
      
      // Coins
      for (const c of coinsRef.current) {
         if (!c.collected) drawCoin(c.x, c.y, frameCountRef.current);
      }

      // Ground 
      if (state !== 'gameover') {
        bgOffsetRef.current = (bgOffsetRef.current - PIPE_SPEED * 0.9) % 40;
      }
      
      const gY = CANVAS_HEIGHT - GROUND_HEIGHT;
      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, gY, CANVAS_WIDTH, GROUND_HEIGHT);

      ctx.fillStyle = '#74BF2E';
      ctx.fillRect(0, gY, CANVAS_WIDTH, 18);
      ctx.fillStyle = '#51A310';
      ctx.fillRect(0, gY + 18, CANVAS_WIDTH, 6);

      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c2b280';
      ctx.beginPath();
      for (let x = bgOffsetRef.current - 40; x < CANVAS_WIDTH; x += 40) {
        ctx.moveTo(x + 24, gY + 40);
        ctx.lineTo(x + 4, CANVAS_HEIGHT);
      }
      ctx.stroke();
      
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#27272a';
      ctx.beginPath();
      ctx.moveTo(0, gY);
      ctx.lineTo(CANVAS_WIDTH, gY);
      ctx.stroke();

      // Particles
      for (const p of particlesRef.current) {
         ctx.fillStyle = p.color;
         ctx.globalAlpha = 1 - (p.life / p.maxLife);
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
         ctx.fill();
         ctx.globalAlpha = 1.0;
      }

      // Trails
      for (const t of trailRef.current) {
        ctx.fillStyle = `rgba(250, 204, 21, ${t.life * 0.4})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, BIRD_RAD * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bird
      drawCuteBird(birdRef.current.y, birdRef.current.velocity);

      // Floating Texts
      ctx.font = '900 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      for (const t of textsRef.current) {
         ctx.globalAlpha = 1 - (t.life / t.maxLife);
         ctx.strokeStyle = 'black';
         ctx.strokeText(t.text, t.x, t.y);
         ctx.fillStyle = '#fef08a'; // light yellow highlight
         if (t.text === '+1') ctx.fillStyle = '#bbf7d0'; // green for pipes
         ctx.fillText(t.text, t.x, t.y);
         ctx.globalAlpha = 1.0;
      }

      // Score UI Display
      if (state === 'playing' || state === 'menu') {
         // Title or Score
         ctx.font = '900 68px sans-serif';
         ctx.textAlign = 'center';
         ctx.lineWidth = 10;
         ctx.strokeStyle = '#27272a';
         
         const isPlay = state === 'playing';
         const drawY = isPlay ? 120 : 220;

         if (isPlay) {
            // Draw Score
            ctx.fillStyle = 'white';
            ctx.strokeText(scoreRef.current.toString(), CANVAS_WIDTH / 2, drawY);
            ctx.fillText(scoreRef.current.toString(), CANVAS_WIDTH / 2, drawY);

            // Draw Coins collected
            ctx.font = '900 32px sans-serif';
            ctx.fillStyle = '#fbbf24';
            ctx.lineWidth = 6;
            ctx.strokeText(`💰 ${coinScoreRef.current}`, CANVAS_WIDTH / 2, drawY + 45);
            ctx.fillText(`💰 ${coinScoreRef.current}`, CANVAS_WIDTH / 2, drawY + 45);
         } else {
            ctx.fillStyle = '#facc15';
            ctx.strokeText('BIRDY', CANVAS_WIDTH / 2, drawY);
            ctx.fillText('BIRDY', CANVAS_WIDTH / 2, drawY);
         }
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [triggerGameOver]);

  return (
    <div className="flex bg-neutral-900 justify-center h-[100dvh] w-full items-center font-sans overflow-hidden">
      <div 
         className={`relative w-full max-w-md h-[100dvh] shadow-2xl overflow-hidden bg-black touch-none select-none cursor-pointer transition-transform ${shake ? 'animate-shake' : ''}`}
         onPointerDown={(e) => {
            // Prevent default touch behaviors like scrolling or zooming
            if (e.pointerType === 'touch') {
                e.preventDefault();
            }
            handleInput();
         }}
      >
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          className="w-full h-full object-cover sm:object-contain object-top"
        />

        {/* Start Overlay */}
        {uiState === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-20">
            <div className="mt-60 bg-white/10 p-6 rounded-3xl flex flex-col items-center border-[3px] border-white/50 shadow-2xl">
              <Play size={48} className="text-white drop-shadow-md mb-2 fill-white"/>
              <span className="text-2xl text-white font-extrabold tracking-widest drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">TAP TO FLY</span>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {uiState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 bg-black/70 transition-all pb-10">
            <div className="bg-[#ded895] p-6 rounded-3xl flex flex-col items-center border-[8px] border-[#74BF2E] shadow-[0_12px_0_#51A310] pointer-events-auto w-11/12 max-w-[350px] animate-in fade-in zoom-in duration-300">
              
              <h2 className="text-4xl font-black text-[#ea580c] mb-6 drop-shadow-[3px_4px_0_black] tracking-wider italic text-center leading-none">
                GAME OVER
              </h2>
              
              <div className="bg-[#c2b280] w-full p-4 rounded-xl mb-8 shadow-inner border-4 border-black/20 flex flex-col gap-4">
                 
                 <div className="flex justify-between items-center px-2">
                    <span className="text-[#a08f51] font-black uppercase text-xl tracking-widest">Score</span>
                    <span className="text-4xl font-black text-white drop-shadow-[2px_3px_0_rgba(0,0,0,0.8)]">{finalScoreRef.current}</span>
                 </div>
                 
                 <div className="h-1 w-full bg-black/10 rounded-full"></div>
                 
                 <div className="flex justify-between items-center px-2">
                    <span className="text-[#a08f51] font-black uppercase text-xl tracking-widest">Best</span>
                    <span className="text-4xl font-black text-[#facc15] drop-shadow-[2px_3px_0_rgba(0,0,0,0.8)]">{highScoreRef.current}</span>
                 </div>
              </div>

              <button
                onPointerDown={(e) => {
                   e.stopPropagation();
                   e.preventDefault();
                   startGame();
                }}
                className="bg-[#facc15] hover:bg-[#eab308] border-4 border-[#27272a] active:translate-y-2 active:shadow-[0_0px_0_#27272a] transition-all flex items-center gap-3 px-8 py-4 rounded-full text-[#27272a] font-extrabold text-2xl shadow-[0_8px_0_#27272a]"
              >
                <Play className="fill-[#27272a]" size={28} /> PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
