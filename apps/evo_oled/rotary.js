// rotary.js

const { Gpio } = require('onoff');
const { EventEmitter } = require('events');
const { exec } = require('child_process');
const asyncQueue = require('async/queue');

class RotaryEncoder extends EventEmitter {
    /**
     * Creates an instance of RotaryEncoder.
     * @param {Object} options - Configuration options.
     * @param {number} options.clkPin - GPIO pin number for CLK.
     * @param {number} options.dtPin - GPIO pin number for DT.
     * @param {number} options.swPin - GPIO pin number for Switch.
     * @param {number} [options.stepsPerAction=4] - Steps required to trigger an action.
     * @param {number} [options.debounceDelay=5] - Debounce delay in milliseconds.
     */
    constructor(options) {
        super();

        if (!options || typeof options !== 'object') {
            throw new Error('RotaryEncoder requires an options object');
        }

        const { clkPin, dtPin, swPin, stepsPerAction = 4, debounceDelay = 5 } = options;

        if (typeof clkPin !== 'number' || typeof dtPin !== 'number' || typeof swPin !== 'number') {
            throw new Error('clkPin, dtPin, and swPin must be numbers');
        }

        this.clkPin = clkPin;
        this.dtPin = dtPin;
        this.swPin = swPin;
        this.stepsPerAction = stepsPerAction;
        this.debounceDelay = debounceDelay;

        // Initialize GPIO
        this.clk = new Gpio(this.clkPin, 'in', 'both');
        this.dt = new Gpio(this.dtPin, 'in', 'both');
        this.sw = new Gpio(this.swPin, 'in', 'falling', { debounceTimeout: 10 });

        // Internal state
        this.clkLastState = this.clk.readSync();
        this.lastDirection = null;
        this.stepCounter = 0;

        // Platform detection
        this.platform = 'unknown';
        exec("volumio status", (error, stdout, stderr) => {
            if (!error) {
                this.platform = 'volumio';
            } else {
                this.platform = 'moode';
            }
            console.log(`Detected platform: ${this.platform}`);
        });

        // Command execution queue
        this.execQueue = asyncQueue((task, callback) => {
            exec(task.command, (error, stdout, stderr) => {
                if (error) console.error(`exec error: ${error}`);
                if (stdout) console.log(`stdout: ${stdout}`);
                if (stderr) console.error(`stderr: ${stderr}`);
                callback();
            });
        }, 1); // Concurrency of 1

        // Bind event handlers
        this.clk.watch(this.handleRotation.bind(this));
        this.sw.watch(this.handleButtonPress.bind(this));

        // Clean up on exit
        process.on('SIGINT', () => {
            this.unexport();
            process.exit();
        });
    }

    /**
     * Handles rotation events.
     */
    handleRotation() {
        const clkState = this.clk.readSync();
        const dtState = this.dt.readSync();

        if (clkState !== this.clkLastState) {
            const direction = clkState !== dtState ? 'Clockwise' : 'Counter-Clockwise';

            // Check if direction changed
            if (this.lastDirection && direction !== this.lastDirection) {
                // Reset counter if direction changed
                this.stepCounter = 1;
            } else {
                // Increment counter if direction is consistent
                this.stepCounter++;
            }

            // Update last direction
            this.lastDirection = direction;

            // Execute command if enough steps in the same direction are accumulated
            if (this.stepCounter >= this.stepsPerAction) {
                const command = direction === 'Clockwise'
                    ? (this.platform === 'volumio' ? 'volumio volume plus' : 'mpc volume +5')
                    : (this.platform === 'volumio' ? 'volumio volume minus' : 'mpc volume -5');

                console.log(`${direction}: ${command}`);
                this.execQueue.push({ command });

                // Emit rotate event
                this.emit('rotate', direction);

                // Reset counter
                this.stepCounter = 0;
            }
        }

        this.clkLastState = clkState;
    }

    /**
     * Handles button press events.
     */
    handleButtonPress() {
        console.log('Button Pressed');
        const command = this.platform === 'volumio' ? 'volumio toggle' : 'mpc toggle';
        this.execQueue.push({ command });

        // Emit buttonPress event
        this.emit('buttonPress');
    }

    /**
     * Cleans up GPIO resources.
     */
    unexport() {
        this.clk.unexport();
        this.dt.unexport();
        this.sw.unexport();
    }
}

module.exports = RotaryEncoder;

