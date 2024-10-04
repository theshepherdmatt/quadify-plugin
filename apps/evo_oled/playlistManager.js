// playlistManager.js

const axios = require('axios');
const fonts = require('./fonts.js'); // Ensure fonts.js is correctly referenced

class PlaylistManager {
    /**
     * Creates an instance of PlaylistManager.
     * @param {Object} oled - Instance of the OLED controller.
     */
    constructor(oled) {
        this.oled = oled;
        this.playlists = [];
        this.currentSelection = 0;
        console.log('PlaylistManager initialized.');
    }

    /**
     * Fetches playlists from Volumio's API.
     * @returns {Promise<Array>} Resolves with an array of playlist objects.
     */
    async fetchPlaylists() {
        const apiUrl = 'http://volumio.local:3000/api/v1/listplaylists'; // Correct API endpoint

        try {
            console.log(`Fetching playlists from: ${apiUrl}`);
            const response = await axios.get(apiUrl);

            // Verify that the response is an array
            if (Array.isArray(response.data)) {
                // Map each playlist name to an object with 'name' and 'uri'
                this.playlists = response.data.map(playlistName => ({
                    name: playlistName,
                    uri: `volumio://playlist/${encodeURIComponent(playlistName)}`
                }));
                console.log(`Fetched Playlists:`, this.playlists);
                return this.playlists;
            } else {
                throw new Error('API response is not an array of playlist names.');
            }
        } catch (error) {
            throw new Error(`Error fetching playlists: ${error.message}`);
        }
    }

    /**
     * Displays playlists on the OLED.
     */
    displayPlaylists() {
        if (this.playlists.length === 0) {
            console.log('No playlists to display.');
            return;
        }

        this.oled.page = 'playlist';
        this.oled.playlists = this.playlists;
        this.oled.selectedPlaylistIndex = this.currentSelection;

        // Define refresh action to display the list
        this.oled.refresh_action = () => {
            this.oled.driver.buffer.fill(0x00);
            const itemHeight = 10; // Adjust as needed based on font size
            const maxVisibleItems = Math.floor(this.oled.height / itemHeight);
            const startIndex = Math.max(0, this.currentSelection - Math.floor(maxVisibleItems / 2));
            const endIndex = Math.min(this.playlists.length, startIndex + maxVisibleItems);

            for (let i = startIndex; i < endIndex; i++) {
                const y = (i - startIndex) * itemHeight;
                const playlist = this.playlists[i];
                if (i === this.currentSelection) {
                    // Highlighted item
                    this.oled.driver.fillRect(0, y, this.oled.width, itemHeight, 1); // Fill background with black
                    this.oled.driver.setCursor(0, y);
                    this.oled.driver.writeString(fonts.monospace, 1, playlist.name, 0); // Write text in white
                } else {
                    // Normal item
                    this.oled.driver.setCursor(0, y);
                    this.oled.driver.writeString(fonts.monospace, 1, playlist.name, 1); // Write text in white
                }
            }

            this.oled.driver.update();
            console.log('Playlists displayed on OLED.');
        }

        // Start refreshing
        if (this.oled.update_interval) clearInterval(this.oled.update_interval);
        this.oled.update_interval = setInterval(() => { this.oled.refresh_action() }, this.oled.main_rate);
        this.oled.refresh_action();
    }

    /**
     * Moves the playlist selection up or down.
     * @param {number} direction - 1 for down, -1 for up.
     */
    moveSelection(direction) {
        this.currentSelection += direction;
        if (this.currentSelection < 0) this.currentSelection = 0;
        if (this.currentSelection >= this.playlists.length) this.currentSelection = this.playlists.length - 1;
        console.log(`Moved selection by direction: ${direction}. Current selection index: ${this.currentSelection}`);
        this.displayPlaylists();
    }

    /**
     * Retrieves the currently selected playlist.
     * @returns {Object} Selected playlist object.
     */
    getSelectedPlaylist() {
        return this.playlists[this.currentSelection];
    }
}

module.exports = PlaylistManager;

