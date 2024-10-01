const io = require('socket.io-client');
const http = require('http');
const EventEmitter = require('events').EventEmitter;

class VolumioListener extends EventEmitter {
    constructor(host = 'http://localhost:3000', refreshrate_ms = 1000) {
        super();
        this.host = host;
        this.refreshrate_ms = refreshrate_ms;
        this.ready = false;
        this.waiting = false;
        this.state = "stop";
        this.formatedMainString = "";
        this.data = {};
        this.firstRequestConsumed = false;
        this.listen();
    }

    compareData(data) {
        const changes = [];
        for (const d in data) {
            if (this.data[d] === data[d]) continue;
            this.data[d] = data[d];
            changes.push([d, this.data[d]]);
        }
        for (const change of changes) {
            this.processChanges(...change);
        }
    }

    processChanges(key, data) {
        switch (key) {
            case "title":
            case "artist":
            case "album":
                this.formatMainString();
                if (this.formatedMainString !== this.data.formatedMainString) {
                    this.emit("trackChange", this.formatedMainString);
                    this.data.formatedMainString = this.formatedMainString;
                }
                break;
            case "status":
                if (this.state !== data) {
                    this.state = data;
                    this.emit("stateChange", data);
                }
                break;
            case "seek":
            case "duration":
                this.seekFormat();
                if (this.formatedSeek.seek_string !== this.data.seek_string) {
                    this.emit("seekChange", this.formatedSeek);
                    this.data.seek_string = this.formatedSeek.seek_string;
                }
                break;
            case "volume":
                this.emit("volumeChange", data);
                break;
            // Other cases for other data fields as needed
        }
    }

    listen() {
        this._socket = io.connect(this.host);
        this.api_caller = setInterval(() => {
            if (this.waiting) return;
            this.waiting = true;
            this._socket.emit("getState");
        }, this.refreshrate_ms);

        this._socket.on("pushState", (data) => {
            if (!this.firstRequestConsumed) {
                this.firstRequestConsumed = true;
                this._socket.emit("getState");
                return;
            }
            this.compareData(data);
            this.waiting = false;
        });
    }

    seekFormat() {
        let ratiobar,
            seek_string,
            { seek, duration } = this.data;

        try {
            ratiobar = duration ? seek / (duration * 1000) : 0;
        } catch (e) {
            ratiobar = 0;
        }

        try {
            duration = new Date(duration * 1000).toISOString().substr(14, 5);
        } catch (e) {
            duration = "00:00";
        }

        try {
            seek = new Date(seek).toISOString().substr(14, 5);
        } catch (e) {
            seek = "";
        }

        seek_string = `${seek} / ${duration}`;
        this.formatedSeek = { seek_string, ratiobar };
        return this.formatedSeek;
    }

    formatMainString() {
        this.formatedMainString = `${this.data.title}${this.data.artist ? ` - ${this.data.artist}` : ""}${this.data.album ? ` - ${this.data.album}` : ""}`;
    }

    checkVolumioStatus(onReady) {
        const options = {
            host: 'localhost',
            port: 3000,
            path: '/api/v1/getState',
            method: 'GET'
        };

        console.log('Checking Volumio status...');

        const request = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(data);
                    console.log(`Volumio status: ${parsedData.status}`);  // Debug log
                    if (parsedData.status === 'play' || parsedData.status === 'stop' || parsedData.status === 'pause') {
                        console.log('Volumio is ready.');
                        onReady();
                    } else {
                        console.log('Volumio is not ready yet. Retrying...');
                        setTimeout(() => this.checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
                    }
                } catch (e) {
                    console.log('Error parsing Volumio status. Retrying...');
                    setTimeout(() => this.checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
                }
            });
        });

        request.on('error', (e) => {
            console.error(`Problem with request: ${e.message}`);
            setTimeout(() => this.checkVolumioStatus(onReady), 5000); // Check again after 5 seconds
        });

        request.end();
    }
}

module.exports = VolumioListener;
