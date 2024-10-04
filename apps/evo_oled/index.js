// index.js

const os = require("os");
const date = require('date-and-time');
const oled = require('./oled.js');
const fonts = require('./fonts.js');
const fs = require("fs");
const http = require("http");
const { volumio_listener } = require("./volumiolistener.js");
const axios = require('axios');
const { exec } = require('child_process');
const RotaryEncoder = require('./rotary.js');
const PlaylistManager = require('./playlistManager.js');

var DRIVER;

var TIME_BEFORE_CLOCK = 6000; // in ms
var TIME_BEFORE_SCREENSAVER = 60000; // in ms
var TIME_BEFORE_DEEPSLEEP = 120000; // in ms
var LOGO_DURATION = 0; // in ms
var CONTRAST = 254; // range 1-254
var extn_exit_sleep_mode = false;

const opts = {
    width: 256,
    height: 64,
    dcPin: 24,
    rstPin: 25,
    contrast: CONTRAST,
    divisor: 0xf1,
    main_rate: 
};

http.createServer(server).listen(4153);
function server(req, res) {
    let cmd = req.url.split("\/")[1];
    value = cmd.split("=");
    cmd = value[0];
    value = value[1];
    extn_exit_sleep_mode = true;

    switch (cmd) {
        case 'exit':
            res.end("1");
            process.exit(0);
            break;
        case 'contrast':
            if (value < 255 && value > 0) {
                res.end("1");
                let temp = DRIVER.refresh_action;
                CONTRAST = value;
                DRIVER.refresh_action = function () {
                    DRIVER.refresh_action = function () { };
                    DRIVER.driver.setContrast(value, () => {
                        DRIVER.refresh_action = temp;
                        DRIVER.refresh_action();
                    })
                };
            }
            else { res.end("0") }
            break;
        case 'sleep_after':
            TIME_BEFORE_SCREENSAVER = value;
            res.end("1");
            break;
        case 'deep_sleep_after':
            TIME_BEFORE_DEEPSLEEP = value;
            res.end("1");
            break;
        default:
            res.end("0");
            break;
    }
}

const REFRESH_TRACK = 20;
var api_state_waiting = false;

function ap_oled(opts) {
    this.scroller_x = 0;
    this.scrollX = 0; // Initialize scrollX for text scrolling
    this.ip = null;
    this.height = opts.height;
    this.width = opts.width;
    this.page = null;
    this.data = {
        title: null,
        artist: null,
        album: null,
        volume: null,
        samplerate: null,
        bitdepth: null,
        bitrate: null,
        seek: null,
        duration: null,
        status: null,
    };
    this.raw_seek_value = 0;
    this.footertext = "";
    this.update_interval = null;
    this.refresh_track = REFRESH_TRACK;
    this.refresh_action = null;
    this.driver = new oled(opts);
    this.text_to_display = "";
    this.plotting = false;
}

ap_oled.prototype.listen_to = function (api, frequency) {
    frequency = frequency || 1000;
    let api_caller = null;

    console.log(`Listening to ${api} with frequency ${frequency}ms`);

    if (api === "volumio") {
        var io = require('socket.io-client');
        var socket = io.connect('http://localhost:3000');

        api_caller = setInterval(() => {
            if (api_state_waiting) return;
            api_state_waiting = true;
            socket.emit("getState");
        }, frequency);
        let first = true;

        socket.emit("getState"); // Initial state request
        socket.on("pushState", (data) => {
            let exit_sleep = false;
            if (extn_exit_sleep_mode) {
                extn_exit_sleep_mode = false;
                exit_sleep = true;
            }
            if (first) {
                first = false;
                socket.emit("getState");
                return;
            }
            api_state_waiting = false;

            // Update track info (title and artist)
            let title = data.title ? data.title.toString() : '';
            let artist = data.artist ? data.artist.toString() : '';

            if (this.data.title !== data.title ||
                this.data.artist !== data.artist ||
                this.data.album !== data.album) {
                this.text_to_display = title + (artist ? " - " + artist : "");
                this.driver.CacheGlyphsData(this.text_to_display);
                this.text_width = this.driver.getStringWidthUnifont(this.text_to_display + " - ");
                this.scroller_x = 0;
                this.refresh_track = REFRESH_TRACK;
                this.footertext = "";
                exit_sleep = true;
            }

            // Update volume
            if (this.data.volume !== data.volume) {
                exit_sleep = true;
            }

            let seek_data = this.volumio_seek_format(data.seek, data.duration);

            if (data.status !== "play" && this.raw_seek_value !== data.seek) {
                exit_sleep = true;
            }
            this.raw_seek_value = data.seek;

            if (data.status === "play") {
                exit_sleep = true;
            }

            this.footertext = "";
            if (!data.samplerate && !data.bitdepth && !data.bitrate) {
                socket.emit("getQueue");
            } else {
                // Combine samplerate, bitdepth, and bitrate for the footertext
                if (data.samplerate) this.footertext += data.samplerate.toString().replace(/\s/gi, "") + " ";
                if (data.bitdepth) this.footertext += data.bitdepth.toString().replace(/\s/gi, "") + " ";
                if (data.bitrate) this.footertext += data.bitrate.toString().replace(/\s/gi, "") + " ";

                // If encoded data exists (e.g., FLAC), format the track type accordingly
                if (data.trackType && data.trackType.toLowerCase().includes("flac")) {
                    let flacInfo = `FLAC ${data.bitdepth}/${data.samplerate}`;
                    this.footertext = flacInfo + " " + this.footertext; // Add FLAC encoding details to the footer
                }
            }

            this.data = data;
            this.data.seek_string = seek_data.seek_string;
            this.data.ratiobar = seek_data.ratiobar;

            this.handle_sleep(exit_sleep);
        });

        socket.on("pushQueue", (resdata) => {
            let data = resdata[0];
            if (!this.footertext && data) {
                if (data.samplerate) this.footertext += data.samplerate.toString().replace(/\s/gi, "") + " ";
                if (data.bitdepth) this.footertext += data.bitdepth.toString().replace(/\s/gi, "") + " ";
                if (data.bitrate) this.footertext += data.bitrate.toString().replace(/\s/gi, "") + " ";
            }
        });
    } else if (api === "ip") {
        api_caller = setInterval(() => { this.get_ip(); }, frequency);
        return api_caller;
    }
};

ap_oled.prototype.volumio_seek_format = function (seek, duration) {
    let seek_string = '';
    let ratiobar = 0;

    if (duration > 0) {
        let seekMinutes = Math.floor(seek / 60);
        let seekSeconds = seek % 60;
        let durationMinutes = Math.floor(duration / 60);
        let durationSeconds = duration % 60;
        seek_string = `${seekMinutes}:${seekSeconds < 10 ? '0' : ''}${seekSeconds} / ${durationMinutes}:${durationSeconds < 10 ? '0' : ''}${durationSeconds}`;
        ratiobar = (seek / duration) * (this.width - 6);
    }

    return {
        seek_string: seek_string,
        ratiobar: ratiobar
    };
};

ap_oled.prototype.get_ip = function () {
    try {
        let ips = os.networkInterfaces();
        let ip = "No network.";
        for (let iface in ips) {
            for (let i = 0; i < ips[iface].length; i++) {
                const addressInfo = ips[iface][i];
                if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
                    ip = addressInfo.address;
                    break;
                }
            }
        }
        this.ip = ip;
        // Optionally, you can log the IP address
        // console.log(`Current IP: ${this.ip}`);
    } catch (e) {
        this.ip = null;
        console.error('Error obtaining IP address:', e);
    }
};

ap_oled.prototype.playback_mode = function () {
    if (this.page === "playback") return;
    clearInterval(this.update_interval);

    this.scroller_x = 0;
    this.scrollX = 0; // Reset scrollX for text scrolling
    this.page = "playback";
    this.text_to_display = this.text_to_display || "";
    this.refresh_track = REFRESH_TRACK;

    this.refresh_action = () => {
        if (this.plotting) return; // Skip plotting if the previous frame hasn't finished
        this.plotting = true;

        this.driver.buffer.fill(0x00); // Clear the display buffer

        if (this.data) {
            // Volume display
            if (this.data.volume !== null) {
                let volstring = this.data.volume.toString();
                if (this.data.mute === true || volstring === "0") volstring = "X";

                this.driver.setCursor(4, this.height - 20); // Move volume display to the bottom
                this.driver.writeString(fonts.icons, 1, "0", 5); // Volume icon
                this.driver.setCursor(14, this.height - 19); // Adjust volume text position
                this.driver.writeString(fonts.monospace, 1, volstring, 5); // Volume level
            }

            // Repeat symbols (single repeat or all repeat)
            if (this.data.repeatSingle) {
                this.driver.setCursor(232, this.height - 20); // Position for repeat single
                this.driver.writeString(fonts.icons, 1, "5", 5); // Repeat single icon
            } else if (this.data.repeat) {
                this.driver.setCursor(232, this.height - 20); // Position for repeat all
                this.driver.writeString(fonts.icons, 1, "4", 5); // Repeat all icon
            }

            // Track title and artist display (scroll or center based on text width)
            if (this.text_to_display.length) {
                let splitIndex = this.text_to_display.indexOf(" - ");
                let title = "", artist = "";
                if (splitIndex !== -1) {
                    title = this.text_to_display.substring(0, splitIndex);
                    artist = this.text_to_display.substring(splitIndex + 3);
                } else {
                    title = this.text_to_display;
                    artist = "";
                }

                // Function to handle scrolling or centering text
                const handleTextDisplay = (text, initialY) => {
                    let textWidth = this.driver.getStringWidthUnifont(text);
                    if (textWidth > this.width) {
                        // Scroll text if it's too long to fit
                        if (!this.scrollX) this.scrollX = 0;
                        this.driver.cursor_x = this.scrollX;
                        this.scrollX = this.scrollX - 1 < -textWidth ? this.width : this.scrollX - 1;
                    } else {
                        // Center text if it fits within the width
                        this.driver.cursor_x = (this.width - textWidth) / 2;
                    }
                    this.driver.cursor_y = initialY;
                    this.driver.writeStringUnifont(text, 1); // Use color 1 for white text
                };

                // Display the title and artist
                handleTextDisplay(title, 0);    // Title at the top
                handleTextDisplay(artist, 18);  // Artist below the title
            }

            // Play/Pause/Stop logo
            if (this.data.status) {
                let status_symbol = "";
                switch (this.data.status) {
                    case ("play"):
                        status_symbol = "1";
                        break;
                    case ("pause"):
                        status_symbol = "2";
                        break;
                    case ("stop"):
                        status_symbol = "3";
                        break;
                }
                this.driver.setCursor(246, this.height - 20); // Bottom right for status logo
                this.driver.writeString(fonts.icons, 1, status_symbol, 6);
            }

            // Seek bar and progress
            if (this.data.seek_string) {
                let border_right = this.width - 5;
                let bottomY = this.height - 7; // Position near the bottom

                // Draw the seek bar
                this.driver.drawLine(3, bottomY, border_right, bottomY, 3);
                this.driver.drawLine(border_right, bottomY, border_right, this.height - 4, 3);
                this.driver.drawLine(3, this.height - 4, border_right, this.height - 4, 3);
                this.driver.drawLine(3, this.height - 4, 3, bottomY, 3);

                // Draw the filled progress bar
                this.driver.fillRect(3, bottomY, this.data.ratiobar, 4, 4);

                // Display the seek time
                this.driver.cursor_y = 43;
                this.driver.cursor_x = 93;
                this.driver.writeString(fonts.monospace, 0, this.data.seek_string, 5);
            }
        }

        this.driver.update();
        this.plotting = false;

        // Update scroll cursor after the static frames
        if (this.refresh_track) return this.refresh_track--;
        this.scroller_x--;
    }

    this.update_interval = setInterval(() => { this.refresh_action() }, opts.main_rate);
    this.refresh_action();
}

ap_oled.prototype.handle_sleep = function (exit_sleep) {
    if (!exit_sleep) { // Should the display go into sleep mode?

        if (!this.iddle_timeout) { // Check if the screen isn't already waiting to go to sleep
            let _deepsleep_ = () => { this.deep_sleep(); }
            let _screensaver_ = () => {
                this.snake_screensaver();
                this.iddle_timeout = setTimeout(_deepsleep_, TIME_BEFORE_DEEPSLEEP);
            }
            this.clock_mode();
            this.iddle_timeout = setTimeout(_screensaver_, TIME_BEFORE_SCREENSAVER);
        }
    }
    else {
        if (this.status_off) {
            this.status_off = null;
            this.driver.turnOnDisplay();
        }

        if (this.page !== "spdif") {
            this.playback_mode();
        }

        if (this.iddle_timeout) {
            clearTimeout(this.iddle_timeout);
            this.iddle_timeout = null;
        }
    }
}

ap_oled.prototype.deep_sleep = function () {
    if (this.page === "deep_sleep") return;
    this.status_off = true;
    clearInterval(this.update_interval);
    this.page = "deep_sleep";
    this.driver.turnOffDisplay();
}

ap_oled.prototype.clock_mode = function () {
    if (this.page === "clock") return;
    clearInterval(this.update_interval); // Clear previous interval
    this.page = "clock";

    this.refresh_action = () => {
        this.driver.buffer.fill(0x00); // Clear the screen buffer

        // Get the current time (hours and minutes)
        let ftime = date.format(new Date(), 'HH:mm');

        // Calculate the position for centered time
        const scale = 3; // Adjust the scale factor
        const textWidth = this.driver.getStringWidthUnifont(ftime) * scale;
        const startX = Math.floor((this.driver.WIDTH - textWidth) / 2);
        const startY = Math.floor((this.driver.HEIGHT - 16 * scale) / 2);

        // Draw the time using unifont
        this.driver.setCursor(startX, startY);
        this.driver.writeStringUnifont(ftime, scale, 1); // scale and color

        // Update the OLED display
        this.driver.update(true);
    };

    // Execute refresh immediately and set an interval to update the clock every second
    this.refresh_action();
    this.update_interval = setInterval(() => { this.refresh_action() }, 1000);
};

ap_oled.prototype.snake_screensaver = function () {
    if (this.page === "snake_screensaver") return;
    clearInterval(this.update_interval);
    this.page = "snake_screensaver";

    let box_pos = [0, 0];
    let count = 0;
    let flip = false;
    let tail = [];
    let tail_max = 25;
    let t_tail_length = 1;
    let random_pickups = [];
    let screen_saver_animation_reset = () => {
        tail = [];
        count = 0;
        t_tail_length = 10;
        random_pickups = [];
        let nb = 7;
        while (nb--) {
            let _x = Math.floor(Math.random() * (this.width));
            let _y = Math.floor(Math.random() * (this.height / 3)) * 3;
            random_pickups.push([_x, _y]);
        }
    }
    screen_saver_animation_reset();
    this.refresh_action = () => {
        this.driver.buffer.fill(0x00);
        let x;
        if (count % this.width == 0) { flip = !flip }
        if (flip) x = count % this.width + 1
        else x = this.width - count % this.width
        let y = ~~(count / this.width) * 3
        tail.push([x, y]);
        if (tail.length > t_tail_length) tail.shift();
        for (let i of tail) {
            this.driver.fillRect(i[0], i[1] - 1, 2, 3, 1);
        }
        for (let r of random_pickups) {
            if (((flip && x >= r[0]) || (!flip && x <= r[0])) && y >= r[1]) {
                t_tail_length += 5;
                random_pickups.splice(random_pickups.indexOf(r), 1)
            }
            this.driver.fillRect(r[0], r[1], 1, 1, 1);
        }
        count++;
        this.driver.update(true);
        if (y > this.height) screen_saver_animation_reset();
    }
    this.update_interval = setInterval(() => { this.refresh_action() }, 40);
}

fs.readFile("config.json", (err, data) => {

    const fail_warn = () => { console.log("Cannot read config file. Using default settings instead.") };
    if (err) fail_warn();
    else {
        try {
            data = JSON.parse(data.toString());
            console.log("Config loaded :", data);
            TIME_BEFORE_SCREENSAVER = (data && data.sleep_after.value) ? data.sleep_after.value * 1000 : TIME_BEFORE_SCREENSAVER;
            TIME_BEFORE_DEEPSLEEP = (data && data.deep_sleep_after.value) ? data.deep_sleep_after.value * 1000 : TIME_BEFORE_DEEPSLEEP;
            CONTRAST = (data && data.contrast.value) ? data.contrast.value : CONTRAST;
        } catch (e) { fail_warn() }
    }

    opts.contrast = CONTRAST;

    const OLED = new ap_oled(opts);
    var logo_start_display_time = 0;

    OLED.driver.begin();

    DRIVER = OLED;
    OLED.driver.load_and_display_logo((displaylogo) => {
        console.log("logo loaded")
        if (displaylogo) logo_start_display_time = new Date();
    });
    OLED.driver.load_hex_font("unifont.hex", start_app);

    function start_app() {

        let time_remaining = 0;
        if (logo_start_display_time) {
            time_remaining = LOGO_DURATION - (new Date().getTime() - logo_start_display_time.getTime());
            time_remaining = (time_remaining <= 0) ? 0 : time_remaining;
        }
        setTimeout(() => {

            // Initialize currentMode
            let currentMode = 'volume'; // Modes: 'volume', 'playlist'

            // Initialize Playlist Manager
            const playlistManager = new PlaylistManager(OLED);

            // Detect platform
            let platform = '';
            exec("volumio status", (error, stdout, stderr) => {
                if (!error) {
                    platform = 'volumio';
                } else {
                    platform = 'moode';
                }
                console.log(`Detected platform: ${platform}`);
            });

            // Initialize Rotary Encoder
            const rotaryEncoder = new RotaryEncoder({
                clkPin: 13,
                dtPin: 5,
                swPin: 6,
                stepsPerAction: 4
            });

            // Set up event listeners for rotary encoder
            rotaryEncoder.on('rotate', function (direction) {
                console.log(`Rotary turned: ${direction}`);
                if (currentMode === 'volume') {
                    // Adjust volume
                    const command = direction === 'Clockwise'
                        ? (platform === 'volumio' ? 'volumio volume plus' : 'mpc volume +5')
                        : (platform === 'volumio' ? 'volumio volume minus' : 'mpc volume -5');
                    exec(command, (error, stdout, stderr) => {
                        if (error) console.error(`exec error: ${error}`);
                        if (stdout) console.log(`stdout: ${stdout}`);
                        if (stderr) console.error(`stderr: ${stderr}`);
                    });
                } else if (currentMode === 'playlist') {
                    // Navigate playlists
                    playlistManager.moveSelection(direction === 'Clockwise' ? 1 : -1);
                }
            });

            rotaryEncoder.on('buttonPress', function () {
                console.log('Rotary button pressed');
                if (currentMode === 'volume') {
                    // Switch to playlist mode
                    currentMode = 'playlist';
                    playlistManager.fetchPlaylists()
                        .then(playlists => {
                            if (playlists.length > 0) {
                                playlistManager.displayPlaylists();
                            } else {
                                console.log('No playlists available');
                                currentMode = 'volume'; // Return to volume mode if no playlists
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching playlists:', error.message);
                            currentMode = 'volume'; // Return to volume mode on error
                        });
                } else if (currentMode === 'playlist') {
                    // Play selected playlist
                    playlistManager.playSelectedPlaylist();
                    currentMode = 'volume';
                }
            });

            // Initialize streamer and set up event listeners
            const streamer = new volumio_listener();
            streamer.on("volumeChange", (data) => {
                OLED.data.volume = data;
            });
            streamer.on("stateChange", (data) => {
                OLED.data.status = data;
            });
            streamer.on("trackChange", (data) => {
                let title = data.title ? data.title.toString() : '';
                let artist = data.artist ? data.artist.toString() : '';
                OLED.text_to_display = title + (artist ? " - " + artist : "");
                OLED.driver.CacheGlyphsData(OLED.text_to_display);
                OLED.text_width = OLED.driver.getStringWidthUnifont(OLED.text_to_display + " - ");
                OLED.scroller_x = 0;
                OLED.refresh_track = REFRESH_TRACK;
                OLED.footertext = "";
                updatefooter();
            });
            streamer.on("seekChange", (data) => {
                OLED.data.ratiobar = data.ratiobar * (OLED.width - 6);
                OLED.data.seek_string = data.seek_string;
            });
            streamer.on("repeatChange", (data) => {
                if (streamer.data.repeat || streamer.data.repeatSingle) OLED.data.repeat = true;
                else OLED.data.repeat = null;
            });
            streamer.on("encodingChange", (data) => {
                OLED.data.trackType = data;
            });
            function updatefooter() {
                OLED.footertext = "";
                if (streamer.data.samplerate) OLED.footertext += streamer.data.samplerate.toString().replace(/\s/gi, "") + " ";
                if (streamer.data.bitdepth) OLED.footertext += streamer.data.bitdepth.toString().replace(/\s/gi, "") + " ";
                if (streamer.data.bitrate) OLED.footertext += streamer.data.bitrate.toString().replace(/\s/gi, "") + " ";
            }

            streamer.on("sampleRateChange", (data) => { updatefooter() });
            streamer.on("sampleDepthChange", (data) => { updatefooter() });
            streamer.on("bitRateChange", (data) => { updatefooter() });

            streamer.watchIdleState(TIME_BEFORE_CLOCK);
            streamer.on("iddleStart", (data) => { OLED.handle_sleep(false) });
            streamer.on("iddleStop", (data) => { OLED.handle_sleep(true) });

            OLED.playback_mode();
            OLED.listen_to("ip", 1000);

            // Ensure you clean up GPIO resources on exit
            function exitHandler(options, exitCode) {
                if (options.cleanup) {
                    rotaryEncoder.destroy();
                    // ... other cleanup code ...
                }
                if (options.exit) process.exit();
            }

            process.on('exit', exitHandler.bind(null, { cleanup: true }));
            process.on('SIGINT', exitHandler.bind(null, { exit: true }));
            process.on('SIGTERM', exitHandler.bind(null, { exit: true }));
        }, time_remaining);
    }

    function exitcatch(options) {
        if (options.cleanup) OLED.driver.turnOffDisplay();
        if (options.exit) process.exit();
    }

    process.on('exit', exitcatch.bind(null, { cleanup: true }));
    process.on('SIGINT', exitcatch.bind(null, { exit: true }));
    process.on('SIGUSR1', exitcatch.bind(null, { exit: true }));
    process.on('SIGUSR2', exitcatch.bind(null, { exit: true }));

});

