export class AudioManager {
    private ctx: AudioContext | null = null;
    private initialized = false;
    private populationTier = 0; // 0: Village, 1: Town, 2: City, 3: Metropolis
    private bgmOscillators: OscillatorNode[] = [];
    private bgmGain: GainNode | null = null;

    constructor() {
        // AudioContext cannot be fully initialized until a user gesture occurs
    }

    public init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.initialized = true;
            this.startBGM();
        } catch (e) {
            console.error("Web Audio API not supported", e);
        }
    }

    public updatePopulationTier(pop: number) {
        let newTier = 0;
        if (pop > 100000) newTier = 3;
        else if (pop > 10000) newTier = 2;
        else if (pop > 2000) newTier = 1;

        if (newTier !== this.populationTier) {
            this.populationTier = newTier;
            this.updateBGM();
        }
    }

    private startBGM() {
        if (!this.ctx) return;
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.connect(this.ctx.destination);
        this.bgmGain.gain.value = 0.05; // Low volume background drone

        this.updateBGM();
    }

    private updateBGM() {
        if (!this.ctx || !this.bgmGain) return;

        // Stop current oscillators
        this.bgmOscillators.forEach(osc => {
            osc.stop();
            osc.disconnect();
        });
        this.bgmOscillators = [];

        // Simple generative drone that gets more complex with population
        const baseFreq = 110; // A2
        const freqs = [baseFreq];

        if (this.populationTier >= 1) freqs.push(baseFreq * 1.5); // Perfect 5th
        if (this.populationTier >= 2) freqs.push(baseFreq * 2);   // Octave
        if (this.populationTier >= 3) freqs.push(baseFreq * 2.5); // Major 3rd above octave

        freqs.forEach(freq => {
            const osc = this.ctx!.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            // Add a slow LFO to volume for "breathing" drone effect
            const lfo = this.ctx!.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 0.1 + (Math.random() * 0.1);

            const lfoGain = this.ctx!.createGain();
            lfoGain.gain.value = 0.5;

            lfo.connect(lfoGain.gain);
            osc.connect(lfoGain);
            lfoGain.connect(this.bgmGain!);

            osc.start();
            lfo.start();

            this.bgmOscillators.push(osc);
            this.bgmOscillators.push(lfo); // keep track to stop later
        });
    }

    // Play a short retro beep
    private playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    public playClick() {
        this.init();
        this.playTone(880, 'square', 0.1, 0.05); // High beep
    }

    public playBuild() {
        this.init();
        this.playTone(440, 'triangle', 0.15, 0.1); // Solid thud/beep
    }

    public playBulldoze() {
        this.init();
        // simulated noise burst
        this.playTone(100, 'sawtooth', 0.2, 0.15);
    }

    public playAlert() {
        this.init();
        this.playTone(1200, 'square', 0.3, 0.1);
        setTimeout(() => this.playTone(800, 'square', 0.3, 0.1), 150);
    }

    public playError() {
         this.init();
         this.playTone(150, 'sawtooth', 0.2, 0.1);
    }
}

// Global instance
export const audioManager = new AudioManager();
