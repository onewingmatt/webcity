import { CityData, TILE_TYPES } from './CityData';
import { audioManager } from '../game/AudioManager';

export class Simulation {
    private cityData: CityData;

    constructor(data: CityData) {
        this.cityData = data;
    }

    public tick() {
        // Advance time (1 tick = 1 week approx, 4 ticks = 1 month)
        // For simplicity in MVP, 1 tick = 1 month
        this.cityData.dateMonth++;
        if (this.cityData.dateMonth > 12) {
            this.cityData.dateMonth = 1;
            this.cityData.dateYear++;
            this.processYearEndBudget();
        }

        audioManager.updatePopulationTier(this.cityData.population);

        this.checkGiftUnlocks();

        this.calculatePowerGrid();

        // Decay traffic, pollution, and crime slightly every tick
        this.decayGrids();

        // Calculate service coverage (Police/Fire auras)
        this.calculateCityServices();

        // Calculate terrain/park land value modifiers
        this.calculateTerrainAuras();

        // Process Disasters
        this.processFires();
        this.rollRandomDisasters();

        let popCount = 0;
        let builtR = 0;
        let builtC = 0;
        let builtI = 0;

        // Track Ports globally once per tick
        let hasAirport = false;
        let hasSeaport = false;
        for(let py=0; py<this.cityData.height; py++) {
            for(let px=0; px<this.cityData.width; px++) {
                const pType = this.cityData.getTile(px, py);
                if (pType === TILE_TYPES.AIRPORT && this.cityData.powerGrid[py][px]) hasAirport = true;
                if (pType === TILE_TYPES.SEAPORT && this.cityData.powerGrid[py][px]) hasSeaport = true;
            }
        }

        // Growth and evaluation logic
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                
                // Generate crime in dense populated areas
                const isIndustry = type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH;
                const isResidential = type >= TILE_TYPES.RES_EMPTY && type <= TILE_TYPES.RES_HIGH;
                const isCommercial = type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH;

                if (isResidential || isCommercial) {
                    if (type === TILE_TYPES.RES_MED || type === TILE_TYPES.COM_MED) {
                        this.cityData.crimeGrid[y][x] += 2;
                    } else if (type === TILE_TYPES.RES_HIGH || type === TILE_TYPES.COM_HIGH) {
                        this.cityData.crimeGrid[y][x] += 5;
                    }
                }

                // Calculate local land value (simplified)
                // High pollution and crime drastically reduces land value.
                // Natural features (from the aura calculation) will boost it.
                const pollution = this.cityData.pollutionGrid[y][x];
                const crime = this.cityData.crimeGrid[y][x];

                // Base land value depends on distance from center (simplified "downtown" effect)
                const distToCenter = Math.abs(x - this.cityData.width/2) + Math.abs(y - this.cityData.height/2);
                let landValue = 60 - (distToCenter * 0.5) - pollution - crime + this.cityData.landValueGrid[y][x]; // Add aura boosts

                this.cityData.landValueGrid[y][x] = landValue;

                // Traffic and Pollution generation
                if ((isIndustry && type !== TILE_TYPES.IND_EMPTY) || type === TILE_TYPES.POWER_PLANT) {
                    this.cityData.pollutionGrid[y][x] += 10;
                }

                // Tally existing buildings (based on density)
                if (isResidential) {
                    if (type === TILE_TYPES.RES_LOW) { popCount += 10; builtR++; }
                    if (type === TILE_TYPES.RES_MED) { popCount += 20; builtR += 2; }
                    if (type === TILE_TYPES.RES_HIGH) { popCount += 40; builtR += 4; }
                }
                if (isCommercial) {
                    if (type === TILE_TYPES.COM_LOW) { popCount += 10; builtC++; }
                    if (type === TILE_TYPES.COM_MED) { popCount += 20; builtC += 2; }
                    if (type === TILE_TYPES.COM_HIGH) { popCount += 40; builtC += 4; }
                }
                if (isIndustry && type !== TILE_TYPES.IND_EMPTY) {
                     // Industry doesn't directly add population
                     builtI += (type === TILE_TYPES.IND_LOW ? 1 : type === TILE_TYPES.IND_MED ? 2 : 4);
                }

                // Built zones generate traffic by commuting
                if (isResidential && type !== TILE_TYPES.RES_EMPTY) {
                    if (Math.random() < 0.5) { // Run commute logic for some homes every tick to save perf
                         this.calculateCommute(x, y);
                    }
                }

                // Incremental Growth/Decay Logic
                if (isResidential || isCommercial || isIndustry) {
                    // Find root of 3x3 to only process the block once (when we are on the top-left tile)
                    const frame = this.cityData.getFrame(x, y);
                    const offset = frame - type;
                    const dy = Math.floor(offset / 16);
                    const dx = offset % 16;

                    if (dx === 0 && dy === 0) { // Top-left tile of the 3x3
                        const demandValue = this.getDemandForZoneType(type);
                        const demandFactor = Math.max(0, demandValue);
                        const hasDemand = demandValue > 0.08;

                        // Check environment (needs power, road access, and acceptable land value)
                        const hasPower = this.cityData.powerGrid[y][x];
                        const hasRoad = this.isAdjacentToTransit(x, y) || this.isAdjacentToTransit(x+1, y) || this.isAdjacentToTransit(x+2, y) ||
                                        this.isAdjacentToTransit(x, y+1) || this.isAdjacentToTransit(x+2, y+1) ||
                                        this.isAdjacentToTransit(x, y+2) || this.isAdjacentToTransit(x+1, y+2) || this.isAdjacentToTransit(x+2, y+2);
                        const congestion = this.getTransitCongestionAround(x, y);
                        const needsScore = this.calculateZoneNeedsScore(x, y, type, landValue, hasPower, hasRoad, congestion, hasAirport, hasSeaport);

                        // Res/Com need decent land value to grow/maintain high density
                        const canGrowEnv = isIndustry || landValue > 10;
                        const happinessModifier = (this.cityData.happiness - 50) / 100;

                        let nextType = type;

                        // Evaluate Growth
                        if (hasPower && hasRoad && canGrowEnv && hasDemand) {
                            // Empty zones grow faster to establish the city, upgrading takes longer
                            let growthChance = 0.1 + happinessModifier * 0.06 + (demandFactor * 0.14) + ((needsScore - 50) / 240);
                            if (type === TILE_TYPES.RES_EMPTY || type === TILE_TYPES.COM_EMPTY || type === TILE_TYPES.IND_EMPTY) {
                                growthChance = 0.22 + happinessModifier * 0.1 + (demandFactor * 0.18) + ((needsScore - 50) / 160);
                            }

                            if (type === TILE_TYPES.RES_EMPTY || type === TILE_TYPES.COM_EMPTY || type === TILE_TYPES.IND_EMPTY) {
                                growthChance *= demandValue > 0.12 ? 1 : 0.45;
                            }

                            // Heavy nearby traffic should make growth more difficult, especially for housing and commerce.
                            growthChance -= congestion * (isResidential ? 0.0035 : isCommercial ? 0.0025 : 0.0015);

                            growthChance = this.clamp(growthChance, 0.03, 0.44);

                            if (Math.random() < growthChance && needsScore >= 42) {
                                if (type === TILE_TYPES.RES_EMPTY) nextType = TILE_TYPES.RES_LOW;
                                else if (type === TILE_TYPES.RES_LOW && landValue > 20 && needsScore > 55 && demandValue > 0.12) nextType = TILE_TYPES.RES_MED;
                                else if (type === TILE_TYPES.RES_MED && landValue > 35 && needsScore > 68 && demandValue > 0.24) nextType = TILE_TYPES.RES_HIGH;

                                else if (type === TILE_TYPES.COM_EMPTY) nextType = TILE_TYPES.COM_LOW;
                                else if (type === TILE_TYPES.COM_LOW && landValue > 20 && needsScore > 54 && demandValue > 0.14) nextType = TILE_TYPES.COM_MED;
                                else if (type === TILE_TYPES.COM_MED && landValue > 35 && hasAirport && needsScore > 66 && demandValue > 0.26) nextType = TILE_TYPES.COM_HIGH;

                                else if (type === TILE_TYPES.IND_EMPTY) nextType = TILE_TYPES.IND_LOW;
                                else if (type === TILE_TYPES.IND_LOW && needsScore > 50 && demandValue > 0.12) nextType = TILE_TYPES.IND_MED;
                                else if (type === TILE_TYPES.IND_MED && hasSeaport && needsScore > 62 && demandValue > 0.26) nextType = TILE_TYPES.IND_HIGH;
                            }
                        }

                        // Evaluate Decay (if power, demand, or resident needs collapse)
                        const failingNeeds = needsScore < 38;
                        const strongNegativeDemand = demandValue < -0.35;
                        if ((!hasPower || landValue < -10 || failingNeeds || strongNegativeDemand) && type !== TILE_TYPES.RES_EMPTY && type !== TILE_TYPES.COM_EMPTY && type !== TILE_TYPES.IND_EMPTY) {
                            const needsPenalty = Math.max(0, (45 - needsScore) / 120);
                            const demandPenalty = demandValue < 0 ? (-demandValue) * 0.24 : 0;
                            const congestionPenalty = Math.max(0, (congestion - 30) * 0.004);
                            const decayChance = this.clamp(0.16 + Math.max(0, (50 - this.cityData.happiness) / 260) + congestionPenalty + needsPenalty + demandPenalty, 0.08, 0.58);
                            if (Math.random() < decayChance) {
                                if (isResidential) {
                                    if (type === TILE_TYPES.RES_HIGH) nextType = TILE_TYPES.RES_MED;
                                    else if (type === TILE_TYPES.RES_MED) nextType = TILE_TYPES.RES_LOW;
                                    else if (type === TILE_TYPES.RES_LOW) nextType = TILE_TYPES.RES_EMPTY;
                                }
                                if (isCommercial) {
                                    if (type === TILE_TYPES.COM_HIGH) nextType = TILE_TYPES.COM_MED;
                                    else if (type === TILE_TYPES.COM_MED) nextType = TILE_TYPES.COM_LOW;
                                    else if (type === TILE_TYPES.COM_LOW) nextType = TILE_TYPES.COM_EMPTY;
                                }
                                if (isIndustry) {
                                    if (type === TILE_TYPES.IND_HIGH) nextType = TILE_TYPES.IND_MED;
                                    else if (type === TILE_TYPES.IND_MED) nextType = TILE_TYPES.IND_LOW;
                                    else if (type === TILE_TYPES.IND_LOW) nextType = TILE_TYPES.IND_EMPTY;
                                }
                            }
                        }

                        // Apply new type to the 3x3 block if it changed
                        if (nextType !== type) {
                            for (let cy = 0; cy < 3; cy++) {
                                for (let cx = 0; cx < 3; cx++) {
                                    if (this.cityData.isValid(x+cx, y+cy)) {
                                        this.cityData.typeGrid[y+cy][x+cx] = nextType;
                                        this.cityData.frameGrid[y+cy][x+cx] = this.cityData.getFrameBase(nextType) + (cy * 16) + cx;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Diffuse pollution
        this.diffusePollution();

        // Update city happiness so the next tick can react to current conditions.
        this.cityData.happiness = this.calculateCityHappiness();

        // Disaster recovery pressure naturally decays over time.
        this.cityData.disasterRecovery = Math.max(0, this.cityData.disasterRecovery - 1);

        // Randomly start a fire (disaster mechanic)
        // Happens rarely, but more likely if crime/pollution is high and no police/fire coverage.
        if (Math.random() < 0.05) {
            const rx = Math.floor(Math.random() * this.cityData.width);
            const ry = Math.floor(Math.random() * this.cityData.height);
            const type = this.cityData.getTile(rx, ry);
            if (this.isFlammable(type)) {
                this.cityData.setTile(rx, ry, TILE_TYPES.FIRE, true);

                // Dispatch advisor event for disaster
                const e = new CustomEvent('advisorEvent', { detail: {
                    disaster: 'FIRE',
                    x: rx, y: ry
                }});
                window.dispatchEvent(e);
            }
        }

        // Finalize Population (divided by 9 since a 3x3 block is 9 tiles, we counted each tile)
        this.cityData.population = Math.floor(popCount / 9);
        builtR = Math.floor(builtR / 9);
        builtC = Math.floor(builtC / 9);
        builtI = Math.floor(builtI / 9);
        
        this.updateRCI(builtR, builtC, builtI, hasAirport, hasSeaport);
        this.updateScenarioProgression(hasAirport, hasSeaport);

        // Trigger Advisor events
        this.evaluateAdvisorEvents();
    }

    private checkGiftUnlocks() {
        // Mayor's House (Pop 2,000)
        if (this.cityData.population >= 2000 && !this.cityData.unlockedGifts.has(TILE_TYPES.MAYOR_HOUSE)) {
            this.cityData.unlockedGifts.add(TILE_TYPES.MAYOR_HOUSE);
            window.dispatchEvent(new CustomEvent('advisorEvent', { detail: { message: "Congratulations! You've reached a population of 2,000! The citizens have built you a Mayor's House." }}));
        }

        // Casino (Funds < $5,000)
        if (this.cityData.funds < 5000 && !this.cityData.unlockedGifts.has(TILE_TYPES.CASINO)) {
            this.cityData.unlockedGifts.add(TILE_TYPES.CASINO);
            window.dispatchEvent(new CustomEvent('advisorEvent', { detail: { message: "Funds are running low. A private investor has offered to build a Casino to generate revenue, but beware the crime!" }}));
        }

        // Amusement Park (Pop 10,000)
        if (this.cityData.population >= 10000 && !this.cityData.unlockedGifts.has(TILE_TYPES.AMUSEMENT_PARK)) {
            this.cityData.unlockedGifts.add(TILE_TYPES.AMUSEMENT_PARK);
            window.dispatchEvent(new CustomEvent('advisorEvent', { detail: { message: "Our city is booming! You can now build an Amusement Park to entertain the citizens." }}));
        }
    }

    private processYearEndBudget() {
        // Calculate taxes (population * basic revenue rate * taxRate)
        const revenuePerCitizen = 15; // Slightly increased for early game balance
        let taxes = Math.floor(this.cityData.population * revenuePerCitizen * this.cityData.taxRate);

        // Add Casino revenue
        let casinoCount = 0;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.CASINO) casinoCount++;
            }
        }
        taxes += (casinoCount * 300); // 300 extra revenue per year per casino

        // Calculate upkeep (roads cost money)
        let roadCount = 0;
        let policeCount = 0;
        let fireCount = 0;
        let trainDepotCount = 0;
        let airportCount = 0;
        let seaportCount = 0;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const tile = this.cityData.getTile(x, y);
                if (tile === TILE_TYPES.ROAD_BASE || tile === TILE_TYPES.BRIDGE_ROAD) {
                    roadCount++;
                } else if (tile === TILE_TYPES.POLICE_STATION) {
                    policeCount++;
                } else if (tile === TILE_TYPES.FIRE_STATION) {
                    fireCount++;
                } else if (tile === TILE_TYPES.TRAIN_DEPOT) {
                    trainDepotCount++;
                } else if (tile === TILE_TYPES.AIRPORT) {
                    airportCount++;
                } else if (tile === TILE_TYPES.SEAPORT) {
                    seaportCount++;
                }
            }
        }
        const upkeep = (roadCount * 1) + (policeCount * 40) + (fireCount * 35) + (trainDepotCount * 20) + (airportCount * 120) + (seaportCount * 80);

        this.cityData.lastTaxesCollected = taxes;
        this.cityData.lastUpkeepPaid = upkeep;

        this.cityData.funds += (taxes - upkeep);

        // Ensure funds don't go negative, or handle bankruptcy
        if (this.cityData.funds < 0) this.cityData.funds = 0;

        // Record history for graphs
        const historyMetrics = this.getMetrics();
        this.cityData.history.push({
            year: this.cityData.dateYear,
            pop: this.cityData.population,
            funds: this.cityData.funds,
            crime: historyMetrics.totalCrime,
            pollution: historyMetrics.totalPollution,
            happiness: this.cityData.happiness
        });

        // Keep history bounded to 120 years
        if (this.cityData.history.length > 120) {
             this.cityData.history.shift();
        }

        // Dispatch budget event
        const metrics = this.getMetrics();
        const e = new CustomEvent('advisorEvent', { detail: {
            budgetReport: true,
            taxes,
            upkeep,
            net: taxes - upkeep,
            funds: this.cityData.funds,
            population: this.cityData.population,
            happiness: this.cityData.happiness,
            roads: roadCount,
            police: policeCount,
            fire: fireCount,
            depots: trainDepotCount,
            airports: airportCount,
            seaports: seaportCount,
            totalPollution: metrics.totalPollution,
            totalCrime: metrics.totalCrime
        }});
        window.dispatchEvent(e);

        // Dispatch newspaper event at year-end
        const newspaper = this.generateNewspaperHeadline(metrics);
        if (newspaper) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            const issueDate = `${monthNames[this.cityData.dateMonth - 1]} ${this.cityData.dateYear}`;
            this.cityData.latestNewspaper = {
                ...newspaper,
                date: issueDate
            };
            window.dispatchEvent(new CustomEvent('newspaperEvent', { detail: this.cityData.latestNewspaper }));
        }
    }

    private getMetrics() {
        let totalPollution = 0;
        let highTrafficTiles = 0;
        let roadTiles = 0;
        let totalCrime = 0;

        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                totalPollution += this.cityData.pollutionGrid[y][x];
                totalCrime += this.cityData.crimeGrid[y][x];
                if (this.cityData.getTile(x, y) === TILE_TYPES.ROAD_BASE) {
                    roadTiles++;
                    if (this.cityData.trafficGrid[y][x] > 30) {
                        highTrafficTiles++;
                    }
                }
            }
        }
        return { totalPollution, highTrafficTiles, roadTiles, totalCrime };
    }

    private decayGrids() {
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.trafficGrid[y][x] > 0) {
                    this.cityData.trafficGrid[y][x] = Math.max(0, this.cityData.trafficGrid[y][x] - 2);
                }
                if (this.cityData.pollutionGrid[y][x] > 0) {
                    let decay = 1;
                    // Parks and trees naturally scrub a little extra pollution
                    const type = this.cityData.getTile(x, y);
                    if (type === TILE_TYPES.PARK || type === TILE_TYPES.TREE) decay = 3;

                    this.cityData.pollutionGrid[y][x] = Math.max(0, this.cityData.pollutionGrid[y][x] - decay);
                }
                if (this.cityData.crimeGrid[y][x] > 0) {
                     this.cityData.crimeGrid[y][x] = Math.max(0, this.cityData.crimeGrid[y][x] - 1);
                }
            }
        }
    }

    private calculateTerrainAuras() {
        // Reset base land value modifiers
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                this.cityData.landValueGrid[y][x] = 0;
            }
        }

        const radius = 3;
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                if (type === TILE_TYPES.WATER || type === TILE_TYPES.PARK || type === TILE_TYPES.TREE || type === TILE_TYPES.MAYOR_HOUSE || type === TILE_TYPES.AMUSEMENT_PARK) {
                    let boost = 0;
                    let effectRadius = radius;
                    if (type === TILE_TYPES.WATER) boost = 5;
                    else if (type === TILE_TYPES.PARK || type === TILE_TYPES.TREE) boost = 3;
                    else if (type === TILE_TYPES.MAYOR_HOUSE) { boost = 10; effectRadius = 5; }
                    else if (type === TILE_TYPES.AMUSEMENT_PARK) { boost = 8; effectRadius = 8; }

                    for (let dy = -effectRadius; dy <= effectRadius; dy++) {
                        for (let dx = -effectRadius; dx <= effectRadius; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (this.cityData.isValid(nx, ny)) {
                                this.cityData.landValueGrid[ny][nx] += boost;
                            }
                        }
                    }
                }
            }
        }
    }

    private processFires() {
        // Collect fire stations for coverage checks
        const fireStations: {x: number, y: number}[] = [];
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.FIRE_STATION && this.cityData.powerGrid[y][x]) {
                    fireStations.push({x, y});
                }
            }
        }

        const fireRadius = 15;
        const currentFires: {x: number, y: number}[] = [];

        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.FIRE) {
                    // Check if fire is within coverage
                    let covered = false;
                    for(const st of fireStations) {
                        const dist = Math.sqrt(Math.pow(st.x - x, 2) + Math.pow(st.y - y, 2));
                        if (dist <= fireRadius) {
                            covered = true;
                            break;
                        }
                    }

                    if (covered) {
                        // Fire station puts it out immediately
                        this.cityData.setTile(x, y, TILE_TYPES.DIRT, true);
                    } else {
                        // Fire burns
                        if (Math.random() < 0.2) {
                            // Burns out
                            this.cityData.setTile(x, y, TILE_TYPES.DIRT, true);
                        } else {
                            currentFires.push({x, y}); // Will attempt to spread
                        }
                    }
                }
            }
        }

        // Spread fires
        for (const f of currentFires) {
            const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
            for(const n of neighbors) {
                const nx = f.x + n.dx;
                const ny = f.y + n.dy;
                if (this.cityData.isValid(nx, ny)) {
                    if (this.isFlammable(this.cityData.getTile(nx, ny))) {
                        if (Math.random() < 0.1) { // 10% chance to spread per tick
                            this.cityData.setTile(nx, ny, TILE_TYPES.FIRE, true);
                        }
                    }
                }
            }
        }
    }

    private rollRandomDisasters() {
        const metrics = this.getMetrics();
        const pollutionFactor = Math.min(0.04, metrics.totalPollution / 200000);
        const crimeFactor = Math.min(0.03, metrics.totalCrime / 250000);
        const populationFactor = Math.min(0.03, this.cityData.population / 200000);

        const fireChance = 0.02 + pollutionFactor + crimeFactor;
        if (Math.random() < fireChance) {
            const target = this.findRandomFlammableTile();
            if (target) {
                this.startFireDisaster(target.x, target.y);
            }
        }

        const monsterChance = this.cityData.population >= 5000 ? 0.005 + pollutionFactor + populationFactor : 0;
        if (monsterChance > 0 && Math.random() < monsterChance) {
            const target = this.findRandomDisasterTarget();
            if (target) {
                this.startMonsterDisaster(target.x, target.y);
            }
        }

        const ufoChance = this.cityData.population >= 10000 ? 0.003 + populationFactor * 0.8 : 0;
        if (ufoChance > 0 && Math.random() < ufoChance) {
            const target = this.findRandomDisasterTarget(true);
            if (target) {
                this.startUfoDisaster(target.x, target.y);
            }
        }
    }

    private findRandomFlammableTile(): {x: number, y: number} | null {
        for (let attempt = 0; attempt < 40; attempt++) {
            const x = Math.floor(Math.random() * this.cityData.width);
            const y = Math.floor(Math.random() * this.cityData.height);
            if (this.isFlammable(this.cityData.getTile(x, y))) {
                return { x, y };
            }
        }
        return null;
    }

    private findRandomDisasterTarget(preferStructures: boolean = false): {x: number, y: number} | null {
        for (let attempt = 0; attempt < 60; attempt++) {
            const x = Math.floor(Math.random() * this.cityData.width);
            const y = Math.floor(Math.random() * this.cityData.height);
            const type = this.cityData.getTile(x, y);

            if (type === TILE_TYPES.WATER || type === TILE_TYPES.GRASS || type === TILE_TYPES.DIRT || type === TILE_TYPES.FIRE) {
                continue;
            }

            if (preferStructures) {
                const isStructure = type >= TILE_TYPES.RES_EMPTY || type === TILE_TYPES.POWER_PLANT || type === TILE_TYPES.POLICE_STATION ||
                    type === TILE_TYPES.FIRE_STATION || type === TILE_TYPES.TRAIN_DEPOT || type === TILE_TYPES.SEAPORT ||
                    type === TILE_TYPES.AIRPORT || type === TILE_TYPES.MAYOR_HOUSE || type === TILE_TYPES.CASINO ||
                    type === TILE_TYPES.AMUSEMENT_PARK;
                if (!isStructure) {
                    continue;
                }
            }

            return { x, y };
        }

        return null;
    }

    private startFireDisaster(x: number, y: number) {
        this.cityData.setTile(x, y, TILE_TYPES.FIRE, true);
        this.cityData.pollutionGrid[y][x] += 5;
        this.cityData.crimeGrid[y][x] += 2;
        this.cityData.disasterRecovery += 4;

        window.dispatchEvent(new CustomEvent('advisorEvent', { detail: {
            disaster: 'FIRE',
            x,
            y
        }}));
    }

    private startMonsterDisaster(x: number, y: number) {
        const path: {x: number, y: number}[] = [{ x, y }];
        const directions = [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}];

        for (let step = 0; step < 8; step++) {
            const current = path[path.length - 1];
            const direction = directions[Math.floor(Math.random() * directions.length)];
            const nextX = Math.max(0, Math.min(this.cityData.width - 1, current.x + direction.dx));
            const nextY = Math.max(0, Math.min(this.cityData.height - 1, current.y + direction.dy));
            path.push({ x: nextX, y: nextY });
        }

        for (const step of path) {
            const type = this.cityData.getTile(step.x, step.y);
            if (type !== TILE_TYPES.WATER && type !== TILE_TYPES.GRASS && type !== TILE_TYPES.DIRT) {
                this.cityData.setTile(step.x, step.y, TILE_TYPES.FIRE, true);
            }
        }

        this.cityData.disasterRecovery += 8;

        window.dispatchEvent(new CustomEvent('advisorEvent', { detail: {
            disaster: 'MONSTER',
            x,
            y,
            damage: path.length
        }}));
    }

    private startUfoDisaster(x: number, y: number) {
        const affectedTiles: {x: number, y: number}[] = [];

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (!this.cityData.isValid(nx, ny)) {
                    continue;
                }
                const type = this.cityData.getTile(nx, ny);
                if (type !== TILE_TYPES.WATER && type !== TILE_TYPES.GRASS) {
                    this.cityData.setTile(nx, ny, TILE_TYPES.DIRT, true);
                    this.cityData.pollutionGrid[ny][nx] += 2;
                    affectedTiles.push({ x: nx, y: ny });
                }
            }
        }

        this.cityData.disasterRecovery += 6;

        window.dispatchEvent(new CustomEvent('advisorEvent', { detail: {
            disaster: 'UFO',
            x,
            y,
            damage: affectedTiles.length
        }}));
    }

    private isFlammable(type: number): boolean {
        if (type === TILE_TYPES.WATER || type === TILE_TYPES.DIRT || type === TILE_TYPES.GRASS ||
            type === TILE_TYPES.FIRE || type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.BRIDGE_ROAD ||
            type === TILE_TYPES.RAIL_BASE || type === TILE_TYPES.BRIDGE_RAIL || type === TILE_TYPES.POWER_LINE_BASE) {
            return false;
        }
        return true; // Trees, Parks, Zones, Plants, Stations are flammable
    }

    private calculateCityServices() {
        const policeRadius = 15;
        const fireRadius = 15;

        // Find police stations and casinos
        const stations: {x: number, y: number}[] = [];
        const fireStations: {x: number, y: number}[] = [];
        const casinos: {x: number, y: number}[] = [];
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                const tile = this.cityData.getTile(x, y);
                if (tile === TILE_TYPES.POLICE_STATION) {
                    if (this.cityData.powerGrid[y][x]) { // Must be powered to work!
                         stations.push({x, y});
                    }
                } else if (tile === TILE_TYPES.FIRE_STATION) {
                    if (this.cityData.powerGrid[y][x]) {
                        fireStations.push({x, y});
                    }
                } else if (tile === TILE_TYPES.CASINO) {
                     casinos.push({x, y});
                }
            }
        }

        // Apply police aura (reduces crime heavily)
        for (const st of stations) {
            for (let dy = -policeRadius; dy <= policeRadius; dy++) {
                for (let dx = -policeRadius; dx <= policeRadius; dx++) {
                    const nx = st.x + dx;
                    const ny = st.y + dy;
                    if (this.cityData.isValid(nx, ny)) {
                        // The closer to the station, the stronger the crime reduction
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist <= policeRadius) {
                            const strength = Math.floor((policeRadius - dist) / 2);
                            this.cityData.crimeGrid[ny][nx] = Math.max(0, this.cityData.crimeGrid[ny][nx] - strength);
                            this.cityData.landValueGrid[ny][nx] += Math.max(0, Math.floor((policeRadius - dist) / 4));
                        }
                    }
                }
            }
        }

        // Fire stations also slightly improve land value by reducing disaster pressure around them.
        for (const st of fireStations) {
            for (let dy = -fireRadius; dy <= fireRadius; dy++) {
                for (let dx = -fireRadius; dx <= fireRadius; dx++) {
                    const nx = st.x + dx;
                    const ny = st.y + dy;
                    if (this.cityData.isValid(nx, ny)) {
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if (dist <= fireRadius) {
                            const strength = Math.floor((fireRadius - dist) / 3);
                            this.cityData.landValueGrid[ny][nx] += strength;
                        }
                    }
                }
            }
        }
    }

    private diffusePollution() {
        const newPollution: number[][] = [];
        for(let y=0; y<this.cityData.height; y++) {
            newPollution[y] = [];
            for(let x=0; x<this.cityData.width; x++) {
                newPollution[y][x] = this.cityData.pollutionGrid[y][x];
            }
        }

        // Simple convolution for diffusion
        for(let y=1; y<this.cityData.height-1; y++) {
            for(let x=1; x<this.cityData.width-1; x++) {
                const p = this.cityData.pollutionGrid[y][x];
                if (p > 5) {
                    const spread = Math.floor(p * 0.1);
                    newPollution[y-1][x] += spread;
                    newPollution[y+1][x] += spread;
                    newPollution[y][x-1] += spread;
                    newPollution[y][x+1] += spread;
                    newPollution[y][x] -= spread * 4;
                }
            }
        }

        this.cityData.pollutionGrid = newPollution;
    }

    private calculateCommute(startX: number, startY: number) {
        // BFS to find nearest Commercial or Industrial zone along roads/rails
        const MAX_DISTANCE = 40; // Limit search for performance (slightly higher for rails)

        // Instead of tracking full paths (which creates exponential memory and lag),
        // we use a standard BFS and track the parent of each node to reconstruct the path later.
        const queue: {x: number, y: number, dist: number}[] = [];
        const visited = new Map<string, {x: number, y: number} | null>();

        // Find an adjacent transit tile to start the commute
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
        for(const n of neighbors) {
            const nx = startX + n.dx;
            const ny = startY + n.dy;
            if (this.cityData.isValid(nx, ny)) {
                const type = this.cityData.getTile(nx, ny);
                if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE || type === TILE_TYPES.BRIDGE_ROAD || type === TILE_TYPES.BRIDGE_RAIL) {
                    queue.push({x: nx, y: ny, dist: 0});
                    visited.set(`${nx},${ny}`, null); // null parent means start node
                }
            }
        }

        let head = 0;
        let destinationFound = false;
        let destNode: {x: number, y: number} | null = null;

        while (head < queue.length) {
            const current = queue[head++];

            if (current.dist > MAX_DISTANCE) break;

            // Check if adjacent to a destination (Commercial or Industrial)
            for(const n of neighbors) {
                const adjX = current.x + n.dx;
                const adjY = current.y + n.dy;
                if (this.cityData.isValid(adjX, adjY)) {
                    const type = this.cityData.getTile(adjX, adjY);
                    if ((type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH && type !== TILE_TYPES.COM_EMPTY) ||
                        (type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH && type !== TILE_TYPES.IND_EMPTY)) {
                        destinationFound = true;
                        destNode = current;
                        break;
                    }
                }
            }

            if (destinationFound) break;

            // Continue along transit
            for(const n of neighbors) {
                const nx = current.x + n.dx;
                const ny = current.y + n.dy;
                const key = `${nx},${ny}`;

                if (this.cityData.isValid(nx, ny) && !visited.has(key)) {
                    const type = this.cityData.getTile(nx, ny);
                    if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE || type === TILE_TYPES.BRIDGE_ROAD || type === TILE_TYPES.BRIDGE_RAIL) {
                        visited.set(key, {x: current.x, y: current.y}); // store parent
                        queue.push({x: nx, y: ny, dist: current.dist + 1});
                    }
                }
            }
        }

        // Reconstruct path if destination found
        if (destinationFound && destNode) {
            let curr: {x: number, y: number} | null = destNode;
            while (curr !== null) {
                const stepType = this.cityData.getTile(curr.x, curr.y);
                if (stepType === TILE_TYPES.ROAD_BASE || stepType === TILE_TYPES.BRIDGE_ROAD) {
                    this.cityData.trafficGrid[curr.y][curr.x] += 6;
                    if (this.cityData.trafficGrid[curr.y][curr.x] > 20) {
                        this.cityData.pollutionGrid[curr.y][curr.x] += 2;
                    }
                } else if (stepType === TILE_TYPES.RAIL_BASE || stepType === TILE_TYPES.BRIDGE_RAIL) {
                    this.cityData.trafficGrid[curr.y][curr.x] += 3;
                    if (this.cityData.trafficGrid[curr.y][curr.x] > 15) {
                        this.cityData.pollutionGrid[curr.y][curr.x] += 1;
                    }
                }

                // Get parent
                curr = visited.get(`${curr.x},${curr.y}`) || null;
            }
        }
    }

    private evaluateAdvisorEvents() {
        const metrics = this.getMetrics();
        const e = new CustomEvent('advisorEvent', { detail: {
            totalPollution: metrics.totalPollution,
            highTrafficTiles: metrics.highTrafficTiles,
            roadTiles: metrics.roadTiles,
            population: this.cityData.population,
            totalCrime: metrics.totalCrime,
            happiness: this.cityData.happiness
        }});
        window.dispatchEvent(e);
    }

    private calculateCityHappiness(): number {
        let totalLandValue = 0;
        let landTiles = 0;
        let totalTraffic = 0;
        let roadTiles = 0;
        let serviceCoverage = 0;

        for (let y = 0; y < this.cityData.height; y++) {
            for (let x = 0; x < this.cityData.width; x++) {
                const type = this.cityData.getTile(x, y);
                const landValue = this.cityData.landValueGrid[y][x];

                if (type >= TILE_TYPES.RES_EMPTY && type < TILE_TYPES.BRIDGE_ROAD) {
                    totalLandValue += landValue;
                    landTiles++;
                }

                if (type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.BRIDGE_ROAD) {
                    totalTraffic += this.cityData.trafficGrid[y][x];
                    roadTiles++;
                }

                if (type === TILE_TYPES.POLICE_STATION || type === TILE_TYPES.FIRE_STATION || type === TILE_TYPES.PARK || type === TILE_TYPES.TREE) {
                    serviceCoverage++;
                }
            }
        }

        const avgLandValue = landTiles > 0 ? totalLandValue / landTiles : 0;
        const avgTraffic = roadTiles > 0 ? totalTraffic / roadTiles : 0;
        const serviceFactor = Math.min(12, serviceCoverage * 0.4);
        const pollutionPenalty = Math.min(30, this.getMetrics().totalPollution / 300);
        const crimePenalty = Math.min(25, this.getMetrics().totalCrime / 200);
        const trafficPenalty = Math.min(20, avgTraffic / 2);
        const economyBonus = Math.min(10, (this.cityData.funds / 50000) * 10);
        const recoveryPenalty = Math.min(20, this.cityData.disasterRecovery * 0.6);

        const happiness = 50 + (avgLandValue * 0.35) + serviceFactor + economyBonus - pollutionPenalty - crimePenalty - trafficPenalty - recoveryPenalty;
        return this.clamp(happiness, 0, 100);
    }

    private getTransitCongestionAround(x: number, y: number): number {
        let trafficTotal = 0;
        let transitTiles = 0;

        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (!this.cityData.isValid(nx, ny)) {
                    continue;
                }

                const type = this.cityData.getTile(nx, ny);
                const isTransit = type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.BRIDGE_ROAD ||
                    type === TILE_TYPES.RAIL_BASE || type === TILE_TYPES.BRIDGE_RAIL;
                if (!isTransit) {
                    continue;
                }

                trafficTotal += this.cityData.trafficGrid[ny][nx];
                transitTiles++;
            }
        }

        return transitTiles > 0 ? trafficTotal / transitTiles : 0;
    }

    private getDemandForZoneType(type: number): number {
        if (type >= TILE_TYPES.RES_EMPTY && type <= TILE_TYPES.RES_HIGH) return this.cityData.demandR;
        if (type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH) return this.cityData.demandC;
        if (type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH) return this.cityData.demandI;
        return 0;
    }

    private calculateZoneNeedsScore(
        x: number,
        y: number,
        type: number,
        landValue: number,
        hasPower: boolean,
        hasRoad: boolean,
        congestion: number,
        hasAirport: boolean,
        hasSeaport: boolean
    ): number {
        const isResidential = type >= TILE_TYPES.RES_EMPTY && type <= TILE_TYPES.RES_HIGH;
        const isCommercial = type >= TILE_TYPES.COM_EMPTY && type <= TILE_TYPES.COM_HIGH;
        const isIndustry = type >= TILE_TYPES.IND_EMPTY && type <= TILE_TYPES.IND_HIGH;
        const demand = this.getDemandForZoneType(type);

        let totalPollution = 0;
        let totalCrime = 0;
        let samples = 0;
        for (let cy = 0; cy < 3; cy++) {
            for (let cx = 0; cx < 3; cx++) {
                const nx = x + cx;
                const ny = y + cy;
                if (!this.cityData.isValid(nx, ny)) continue;
                totalPollution += this.cityData.pollutionGrid[ny][nx];
                totalCrime += this.cityData.crimeGrid[ny][nx];
                samples++;
            }
        }

        const avgPollution = samples > 0 ? totalPollution / samples : 0;
        const avgCrime = samples > 0 ? totalCrime / samples : 0;

        let amenityCount = 0;
        let serviceCount = 0;
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = x + 1 + dx;
                const ny = y + 1 + dy;
                if (!this.cityData.isValid(nx, ny)) continue;
                const nearby = this.cityData.getTile(nx, ny);
                if (nearby === TILE_TYPES.PARK || nearby === TILE_TYPES.TREE || nearby === TILE_TYPES.WATER || nearby === TILE_TYPES.MAYOR_HOUSE) {
                    amenityCount++;
                }
                if (nearby === TILE_TYPES.POLICE_STATION || nearby === TILE_TYPES.FIRE_STATION) {
                    serviceCount += 2;
                }
            }
        }

        let score = 50;
        score += demand * 22;
        score += (landValue - 20) * 0.45;
        score += (this.cityData.happiness - 50) * 0.35;

        if (!hasPower) score -= 25;
        if (!hasRoad) score -= 20;

        score -= avgPollution * (isIndustry ? 0.2 : 0.75);
        score -= avgCrime * (isIndustry ? 0.35 : 0.8);
        score -= congestion * (isResidential ? 0.9 : isCommercial ? 0.7 : 0.45);
        score -= this.cityData.disasterRecovery * 0.4;

        if (isResidential || isCommercial) {
            score += Math.min(12, amenityCount * 0.8);
        }
        if (serviceCount > 0) {
            score += Math.min(14, serviceCount * 0.7);
        }
        if (isIndustry) {
            score += Math.min(8, avgPollution * 0.15);
        }

        if (isCommercial && type >= TILE_TYPES.COM_MED && !hasAirport) score -= 10;
        if (isIndustry && type >= TILE_TYPES.IND_MED && !hasSeaport) score -= 8;

        return this.clamp(score, 0, 100);
    }

    private updateRCI(r: number, c: number, i: number, hasAirport: boolean, hasSeaport: boolean) {
        // Classic SimCity heuristic: Ratio of R:C:I should be roughly 3:1:1
        // If R is high but jobs (C/I) are low, demand for C/I goes up, R goes down.
        const total = r + c + i;

        // Tax rate modifier (7% is neutral. Higher tax = lower demand)
        const taxModifier = (0.07 - this.cityData.taxRate) * 10;

        if (total === 0) {
            this.cityData.demandR = this.clamp(0.8 + taxModifier, -1, 1);
            this.cityData.demandC = this.clamp(0.5 + taxModifier, -1, 1);
            this.cityData.demandI = this.clamp(0.5 + taxModifier, -1, 1);
            return;
        }

        const currentRatioR = r / total;
        const currentRatioC = c / total;
        const currentRatioI = i / total;

        const targetR = 0.50; // 50% Housing
        const targetC = 0.20; // 20% Commercial
        const targetI = 0.30; // 30% Industry

        this.cityData.demandR = this.clamp(((targetR - currentRatioR) * 2) + taxModifier, -1, 1);
        this.cityData.demandC = this.clamp(((targetC - currentRatioC) * 2) + taxModifier, -1, 1);
        this.cityData.demandI = this.clamp(((targetI - currentRatioI) * 2) + taxModifier, -1, 1);
        
        // Without an airport, commercial demand is artificially capped
        // Without a seaport, industrial demand is artificially capped
        if (!hasAirport) this.cityData.demandC = Math.min(this.cityData.demandC, 0.5);
        if (!hasSeaport) this.cityData.demandI = Math.min(this.cityData.demandI, 0.5);

        // Small baseline demand so city doesn't totally stall
        if (this.cityData.demandR < 0.1 && Math.random() < 0.3) this.cityData.demandR += 0.2;
    }

    private updateScenarioProgression(hasAirport: boolean, hasSeaport: boolean) {
        if (this.cityData.scenarioCompleted || this.cityData.scenarioFailed) {
            return;
        }

        if (this.cityData.dateYear >= 1915 && this.cityData.scenarioTier < 3) {
            this.cityData.scenarioFailed = true;
            this.pushScenarioUpdate(
                'Scenario deadline missed. Keep building to recover, then start a fresh run for a perfect rating.',
                'GROWTH TARGET MISSED',
                'The regional planning board says development fell short of timeline goals, but rebuilding can continue.'
            );
            return;
        }

        const poweredServices = this.getPoweredServiceCounts();
        const hasRailHub = poweredServices.trainDepots > 0;

        if (this.cityData.scenarioTier === 0) {
            if (this.cityData.population >= 500 && this.cityData.funds >= 8000) {
                this.cityData.scenarioTier = 1;
                this.cityData.funds += 1000;
                this.pushScenarioUpdate(
                    'Settlement charter approved! Your first milestone is complete. A $1,000 development grant has been awarded.',
                    'SETTLEMENT CHARTER SIGNED',
                    'City hall confirms the mayor has reached the first planning target and secured a small regional grant.'
                );
            }
            return;
        }

        if (this.cityData.scenarioTier === 1) {
            if (this.cityData.population >= 2000 && this.cityData.happiness >= 55 && poweredServices.police > 0 && poweredServices.fire > 0) {
                this.cityData.scenarioTier = 2;
                this.cityData.funds += 2500;
                this.pushScenarioUpdate(
                    'Civic services established! The city now has reliable emergency coverage. Bonus budget: $2,500.',
                    'CIVIC EXPANSION ACHIEVED',
                    'Officials praise investments in public safety as the town transitions into a stable city district.'
                );
            }
            return;
        }

        if (this.cityData.scenarioTier === 2) {
            const transportReady = hasAirport || hasSeaport || hasRailHub;
            if (this.cityData.population >= 8000 && this.cityData.happiness >= 60 && this.cityData.funds >= 15000 && transportReady) {
                this.cityData.scenarioTier = 3;
                this.cityData.scenarioCompleted = true;
                this.cityData.funds += 5000;
                this.pushScenarioUpdate(
                    'Scenario complete! You built a thriving regional city. Treasury bonus awarded: $5,000.',
                    'REGIONAL CAPITAL RISES',
                    'The city has met all growth targets and is now recognized as a model regional capital.'
                );
            }
            return;
        }
    }

    private getPoweredServiceCounts(): { police: number, fire: number, trainDepots: number } {
        let police = 0;
        let fire = 0;
        let trainDepots = 0;

        for (let y = 0; y < this.cityData.height; y++) {
            for (let x = 0; x < this.cityData.width; x++) {
                if (!this.cityData.powerGrid[y][x]) {
                    continue;
                }
                const type = this.cityData.getTile(x, y);
                if (type === TILE_TYPES.POLICE_STATION) police++;
                else if (type === TILE_TYPES.FIRE_STATION) fire++;
                else if (type === TILE_TYPES.TRAIN_DEPOT) trainDepots++;
            }
        }

        return { police, fire, trainDepots };
    }

    private pushScenarioUpdate(message: string, headline: string, body: string) {
        window.dispatchEvent(new CustomEvent('advisorEvent', { detail: { message } }));

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const issueDate = `${monthNames[this.cityData.dateMonth - 1]} ${this.cityData.dateYear}`;
        this.cityData.latestNewspaper = { headline, body, date: issueDate };
        window.dispatchEvent(new CustomEvent('newspaperEvent', { detail: this.cityData.latestNewspaper }));
    }
    
    private clamp(val: number, min: number, max: number) {
        return Math.max(min, Math.min(max, val));
    }

    private calculatePowerGrid() {
        // Reset power grid
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                this.cityData.powerGrid[y][x] = false;
            }
        }

        const queue: {x: number, y: number}[] = [];

        // Find power sources
        for(let y=0; y<this.cityData.height; y++) {
            for(let x=0; x<this.cityData.width; x++) {
                if (this.cityData.getTile(x, y) === TILE_TYPES.POWER_PLANT) {
                    this.cityData.powerGrid[y][x] = true;
                    queue.push({x, y});
                }
            }
        }

        // BFS flood fill power
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
        let head = 0;
        
        // Use a head index instead of shift() which is O(N) in JS arrays and causes massive lag
        while(head < queue.length) {
            const current = queue[head++];
            
            for(const n of neighbors) {
                const nx = current.x + n.dx;
                const ny = current.y + n.dy;
                
                if (this.cityData.isValid(nx, ny) && !this.cityData.powerGrid[ny][nx]) {
                    const targetType = this.cityData.getTile(nx, ny);
                    // Power conducts through: Power Lines, Power Plants, 3x3 Zones (Res/Com/Ind), and Roads
                    const isZone = targetType >= TILE_TYPES.RES_EMPTY && targetType <= TILE_TYPES.IND_HIGH;
                    if (targetType === TILE_TYPES.POWER_LINE_BASE || targetType === TILE_TYPES.POWER_PLANT || 
                        targetType === TILE_TYPES.ROAD_BASE || targetType === TILE_TYPES.BRIDGE_ROAD || isZone) {
                        this.cityData.powerGrid[ny][nx] = true;
                        queue.push({x: nx, y: ny});
                    }
                }
            }
        }
    }

    private generateNewspaperHeadline(metrics: any): { headline: string, body: string } | null {
        const isFirstYear = this.cityData.dateYear === 1901;
        const pop = this.cityData.population;
        const funds = this.cityData.funds;
        const crime = metrics.totalCrime;
        const pollution = metrics.totalPollution;
        const highTraffic = metrics.highTrafficTiles;

        // First year special
        if (isFirstYear) {
            return {
                headline: 'NEW MAYOR TAKES OFFICE',
                body: 'The city welcomes its new mayor! Citizens are hopeful for a prosperous future under new leadership.'
            };
        }

        // Population milestones
        if (pop >= 50000 && pop < 51000) {
            return {
                headline: 'CITY REACHES 50,000 POPULATION!',
                body: 'Our city has grown into a major metropolis! The citizens celebrate this historic milestone with parades and festivities.'
            };
        }
        if (pop >= 25000 && pop < 25500) {
            return {
                headline: 'QUARTER CENTURY POPULATION!',
                body: 'With 25,000 citizens, our city has officially become a major urban center. Commercial development is booming!'
            };
        }
        if (pop >= 10000 && pop < 10500) {
            return {
                headline: 'POPULATION BOOM CONTINUES!',
                body: 'Our city has surpassed 10,000 residents! The housing market cannot keep up with the incredible demand for new homes.'
            };
        }
        if (pop >= 5000 && pop < 5100) {
            return {
                headline: 'TOWN BECOMES A CITY!',
                body: 'With 5,000 residents, our town has officially become a city. Local businesses are expanding rapidly.'
            };
        }
        if (pop >= 2000 && pop < 2100) {
            return {
                headline: 'GROWTH SPURT!',
                body: 'Our community has grown to 2,000 residents! The rapid expansion is bringing new opportunities and challenges.'
            };
        }

        // Crisis headlines (higher priority)
        if (funds < 1000) {
            return {
                headline: 'CITY BUDGET CRISIS!',
                body: 'City finances are in dire straits! The treasury is nearly empty. Immediate action is needed to avoid bankruptcy!'
            };
        }
        if (funds < 5000) {
            return {
                headline: 'BUDGET WORRIES MOUNT',
                body: 'City officials express concern over dwindling funds. Residents are calling for better fiscal management.'
            };
        }
        if (crime > 5000) {
            return {
                headline: 'CRIME WAVE HITS DOWNTOWN!',
                body: 'Crime rates have reached alarming levels! Citizens are demanding more police protection. Tourism is declining.'
            };
        }
        if (crime > 3000) {
            return {
                headline: 'CRIME CONCERNS RISE',
                body: 'Police report increasing criminal activity. Residents are advised to be cautious after dark.'
            };
        }
        if (pollution > 10000) {
            return {
                headline: 'SMOG COVERS THE CITY',
                body: 'Air quality has reached dangerous levels! Health officials warn of respiratory issues. Environmentalists demand action!'
            };
        }
        if (pollution > 6000) {
            return {
                headline: 'POLLUTION PROBLEMS WORSEN',
                body: 'Industrial expansion has led to increased pollution. Environmental groups call for stricter regulations.'
            };
        }
        if (highTraffic > 100) {
            return {
                headline: 'TRAFFIC NIGHTMARE!',
                body: 'Roads are gridlocked with vehicles! Commuters report hours-long delays. Traffic experts call for better public transit.'
            };
        }
        if (highTraffic > 50) {
            return {
                headline: 'TRAFFIC CONGESTION INCREASES',
                body: 'Traffic congestion has reached concerning levels. City planners are considering infrastructure improvements.'
            };
        }

        // Good news headlines
        if (crime < 500 && pollution < 1000 && pop > 10000) {
            return {
                headline: 'MODEL CITY AWARD!',
                body: 'Our city has been recognized as one of the safest and cleanest in the region! Quality of life ratings are at an all-time high!'
            };
        }
        if (funds > 50000) {
            return {
                headline: 'TREASURY OVERFLOWS!',
                body: 'The city treasury is flush with cash! Residents are discussing how to best use the surplus funds.'
            };
        }
        if (funds > 30000) {
            return {
                headline: 'STRONG ECONOMY REPORTED',
                body: 'Economic indicators show strong growth across all sectors. Business confidence is at an all-time high!'
            };
        }
        if (pop > 100000) {
            return {
                headline: 'MEGALOPOLIS STATUS REACHED!',
                body: 'Our city has exceeded 100,000 residents! We have joined the ranks of the world\'s great metropolises!'
            };
        }

        // Random variety headlines
        const varietyHeadlines = [
            {
                headline: 'DEVELOPERS ANNOUNCE NEW PROJECT',
                body: 'Major construction projects are underway. Developers promise new jobs and housing.'
            },
            {
                headline: 'TOURISTS FLOCK TO CITY',
                body: 'Our city has become a popular tourist destination! Local businesses report record profits.'
            },
            {
                headline: 'SCHOOL OPENING CELEBRATED',
                body: 'A new school has opened its doors. Parents and students celebrate the improved education opportunities.'
            },
            {
                headline: 'PARK RENOVATION COMPLETED',
                body: 'The city\'s beloved park has been renovated. Families enjoy the improved recreational facilities.'
            },
            {
                headline: 'LOCAL BUSINESS EXPANSION',
                body: 'Several local businesses are expanding operations, creating new jobs and stimulating economic growth.'
            },
            {
                headline: 'CITY CELEBRATES ANNIVERSARY',
                body: 'Citizens gather to celebrate our city\'s anniversary. The festivities draw visitors from across the region.'
            },
            {
                headline: 'NEW FACTORY OPENS',
                body: 'A major new factory has opened, bringing hundreds of new jobs. Local officials welcome the economic boost.'
            },
            {
                headline: 'RESIDENTS HAPPY WITH PROGRESS',
                body: 'Recent polls show high satisfaction with city development. Residents appreciate the improvements.'
            },
            {
                headline: 'PUBLIC TRANSIT EXPANSION PLANNED',
                body: 'City officials announce plans to expand public transit options to ease traffic congestion.'
            }
        ];

        // Return a random variety headline
        return varietyHeadlines[Math.floor(Math.random() * varietyHeadlines.length)];
    }

    private isAdjacentToTransit(x: number, y: number): boolean {
        // Check 4 directions for road or rail base
        const neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];

        for(const n of neighbors) {
            const type = this.cityData.getTile(x + n.dx, y + n.dy);
            if(type === TILE_TYPES.ROAD_BASE || type === TILE_TYPES.RAIL_BASE || type === TILE_TYPES.BRIDGE_ROAD || type === TILE_TYPES.BRIDGE_RAIL) {
                return true;
            }
        }
        return false;
    }
}
