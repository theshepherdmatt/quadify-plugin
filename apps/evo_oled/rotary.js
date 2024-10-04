const { Gpio } = require('onoff');
const { exec } = require('child_process');
const queue = require('async/queue');
const axios = require('axios');

// GPIO setup
const clk = new Gpio(13, 'in', 'both');
const dt = new Gpio(5, 'in', 'both');
const sw = new Gpio(6, 'in', 'falling', { debounceTimeout: 10 });

let clkLastState = clk.readSync();
let lastDirection = null;
let stepCounter = 0;
const stepsPerAction = 4; // Adjust based on desired sensitivity
let playlistIndex = 0;
let playlists = [];
let platform = '';
let currentMode = 'volume'; // 'volume' or 'playlist'

// Timing for long press detection
let buttonPressStart = null;
const longPressDuration = 2000; // 2 seconds for a long press

// Command execution queue
const execQueue = queue((task, completed) => {
    exec(task.command, (error, stdout, stderr) => {
        if (error) console.error(`exec error: ${error}`);
        if (stdout) console.log(`stdout: ${stdout}`);
        if (stderr) console.error(`stderr: ${stderr}`);
        completed();
    });
}, 1);

// Detect platform (Volumio or Moode)
exec("volumio status", (error, stdout, stderr) => {
    if (!error) {
        platform = 'volumio';
    } else {
        platform = 'moode';
    }
    console.log(`Detected platform: ${platform}`);

    // Fetch playlists after determining platform
    if (platform === 'volumio') {
        fetchPlaylists();
    }
});

// Fetch playlists from Volumio
async function fetchPlaylists() {
    const socket = require('socket.io-client')('http://localhost:3000');
    socket.emit('listPlaylists');
    
    socket.on('pushListPlaylist', (data) => {
        if (data && data.length) {
            playlists = data;
            console.log('Playlists fetched:', playlists.map(p => p.name));
        } else {
            console.error('Error: Unexpected response format when fetching playlists.');
        }
        socket.disconnect();
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err);
        socket.disconnect();
    });
}

const handleRotation = () => {
    const clkState = clk.readSync();
    const dtState = dt.readSync();

    if (clkState !== clkLastState) {
        const direction = clkState !== dtState ? 'Clockwise' : 'Counter-Clockwise';

        if (lastDirection && direction !== lastDirection) {
            stepCounter = 1;  // Reset counter if direction changed
        } else {
            stepCounter++;
        }

        lastDirection = direction;

        if (stepCounter >= stepsPerAction) {
            if (currentMode === 'playlist' && playlists.length > 0) {
                if (direction === 'Clockwise') {
                    playlistIndex = (playlistIndex + 1) % playlists.length;
                } else {
                    playlistIndex = (playlistIndex - 1 + playlists.length) % playlists.length;
                }
                console.log(`Selected Playlist: ${playlists[playlistIndex].name}`);
                if (DRIVER && DRIVER.refresh_action) {
                    DRIVER.playlist_mode();  // Update display to show selected playlist
                }
            } else {
                const command = direction === 'Clockwise' ? (platform === 'volumio' ? 'volumio volume plus' : 'mpc volume +5') : (platform === 'volumio' ? 'volumio volume minus' : 'mpc volume -5');
                console.log(`${direction}: ${command}`);
                execQueue.push({ command });
            }
            stepCounter = 0;
        }
    }
    clkLastState = clkState;
};


const handleButtonPress = () => {
    const currentTime = Date.now();
    
    if (!buttonPressStart) {
        // Start timing the button press
        buttonPressStart = currentTime;
    } else {
        const pressDuration = currentTime - buttonPressStart;

        if (pressDuration >= longPressDuration) {
            // Long press detected - switch modes
            if (currentMode === 'volume') {
                switchToPlaylistMode();
            } else {
                switchToVolumeMode();
            }
        } else {
            // Short press - execute the action for the current mode
            if (currentMode === 'playlist' && playlists.length > 0) {
                const selectedPlaylist = playlists[playlistIndex].name;
                console.log(`Playing playlist: ${selectedPlaylist}`);
                const command = `volumio playplaylist ${selectedPlaylist}`;
                execQueue.push({ command });
            } else if (currentMode === 'volume') {
                const command = platform === 'volumio' ? 'volumio toggle' : 'mpc toggle';
                execQueue.push({ command });
            }
        }

        // Reset button press start time
        buttonPressStart = null;
    }
};

// Example: Switch to playlist mode
function switchToPlaylistMode() {
    currentMode = 'playlist';
    console.log('Switched to playlist mode');
    // Optionally, update the OLED display here
}

// Example: Switch to volume mode
function switchToVolumeMode() {
    currentMode = 'volume';
    console.log('Switched to volume mode');
    // Optionally, update the OLED display here
}

// Event watchers setup
clk.watch((err) => {
    if (err) {
        console.error('Error', err);
        return;
    }
    handleRotation();
});

sw.watch((err) => {
    if (err) {
        console.error('Error', err);
        return;
    }
    handleButtonPress();
});

process.on('SIGINT', () => {
    clk.unexport();
    dt.unexport();
    sw.unexport();
    process.exit();
});
