// modes/playback_mode.js
const fonts = require('../fonts');

module.exports = function playback_mode() {
    if (this.page === "playback") return;
    clearInterval(this.update_interval);

    this.scroller_x = 0;
    this.page = "playback";
    this.text_to_display = this.text_to_display || "";
    this.refresh_track = 20;
    this.refresh_action = () => {
        if (this.plotting) { return }; // skip plotting of this frame if the pi has not finished plotting the previous frame
        this.plotting = true;

        this.driver.buffer.fill(0x00);

        if (this.data) {
            // volume
            if (this.data.volume !== null) {
                let volstring = this.data.volume.toString();
                if (this.data.mute === true || volstring === "0") volstring = "X";

                this.driver.setCursor(4, this.height - 20); // Move volume display down
                this.driver.writeString(fonts.icons, 1, "0", 5); // Volume icon
                this.driver.setCursor(14, this.height - 19); // Adjust accordingly
                this.driver.writeString(fonts.monospace, 1, volstring, 5); // Volume level
            }

            // Repeat Single or Repeat All
            if (this.data.repeatSingle) {
                this.driver.setCursor(232, this.height - 20); // Move repeat single symbol down
                this.driver.writeString(fonts.icons, 1, "5", 5); // Repeat single symbol
            } else if (this.data.repeat) {
                this.driver.setCursor(232, this.height - 20); // Move repeat all symbol down
                this.driver.writeString(fonts.icons, 1, "4", 5); // Repeat all symbol
            }

            if (this.data) {
                // Combine trackType and footertext
                let combinedInfo = `${this.data.trackType || ''} ${this.footertext || ''}`.trim();

                // Assuming an average character width for calculation
                let combinedInfoWidth = combinedInfo.length * 6; // Adjust the multiplier based on your font and display
                let startX = (this.width - combinedInfoWidth) / 2; // Calculate X to center the combined string
                let infoYPosition = this.height - 20; // Adjust Y position as needed

                this.driver.setCursor(startX, infoYPosition);
                this.driver.writeString(fonts.monospace, 1, combinedInfo, 5);
            }

            // play pause stop logo
            if (this.data.status) {
                let status_symbol = "";
                switch (this.data.status) {
                    case ("play"):
                        status_symbol = "1";
                        break;
                    case ("pause"):
                        status_symbol = "2"
                        break;
                    case ("stop"):
                        status_symbol = "3"
                        break;
                }

                this.driver.setCursor(246, this.height - 20); // Move play/pause/stop logo down
                this.driver.writeString(fonts.icons, 1, status_symbol, 6);
            }

            if (this.text_to_display.length) {
                let splitIndex = this.text_to_display.indexOf(" - ");
                let title = this.text_to_display.substring(0, splitIndex);
                let artist = this.text_to_display.substring(splitIndex + 3);

                const handleTextDisplay = (text, initialY) => {
                    let textWidth = this.driver.getStringWidthUnifont(text);
                    if (textWidth > this.width) {
                        if (!this.scrollX) this.scrollX = 0;
                        this.driver.cursor_x = this.scrollX;
                        this.scrollX = this.scrollX - 1 < -textWidth ? this.width : this.scrollX - 1;
                    } else {
                        this.driver.cursor_x = (this.width - textWidth) / 2;
                    }
                    this.driver.cursor_y = initialY;
                    this.driver.writeStringUnifont(text, 6);
                };

                handleTextDisplay(title, 0); // For title
                handleTextDisplay(artist, 18); // For artist, placed below the title
            }

            if (this.data.seek_string) {
                let border_right = this.width - 5;
                let bottomY = this.height - 7;
                this.driver.drawLine(3, bottomY, border_right, bottomY, 3);
                this.driver.drawLine(border_right, bottomY, border_right, this.height - 4, 3);
                this.driver.drawLine(3, this.height - 4, border_right, this.height - 4, 3);
                this.driver.drawLine(3, this.height - 4, 3, bottomY, 3);
                this.driver.fillRect(3, bottomY, this.data.ratiobar, 4, 4);
                this.driver.cursor_y = 43;
                this.driver.cursor_x = 93;
                this.driver.writeString(fonts.monospace, 0, this.data.seek_string, 5);
            }
        }

        this.driver.update();
        this.plotting = false;
        if (this.refresh_track) return this.refresh_track--;
        this.scroller_x--;
    }

    this.update_interval = setInterval(() => { this.refresh_action() }, this.opts.main_rate);
    this.refresh_action();
}
