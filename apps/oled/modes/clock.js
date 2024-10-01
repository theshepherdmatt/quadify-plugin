// modes/clock_mode.js
const date = require('date-and-time');
const fs = require('fs');
const path = require('path');

// Load unifont.hex file from the oled folder
const unifontFilePath = path.join(__dirname, '../unifont.hex');
const unifontData = fs.readFileSync(unifontFilePath, 'utf8');

// Parse unifont.hex data into a usable map
function parseUnifont(hexData) {
    const fontMap = {};
    const lines = hexData.split('\n');

    lines.forEach(line => {
        if (line.trim() === '' || line[0] === '#') return; // Ignore empty lines or comments
        const [code, hexValues] = line.split(':');
        const charCode = parseInt(code, 16);

        // Convert hex string into an array of binary rows
        const rows = [];
        for (let i = 0; i < hexValues.length; i += 2) {
            const hexByte = hexValues.substring(i, i + 2);
            rows.push(parseInt(hexByte, 16));
        }
        fontMap[charCode] = rows;
    });

    return fontMap;
}

const unifontMap = parseUnifont(unifontData);

// Function to draw a scaled character with anti-aliasing
function drawScaledCharWithAA(char, x, y, scale, driver) {
    const charCode = char.charCodeAt(0);
    const charData = unifontMap[charCode];

    if (!charData) return; // If no data for this char, skip it

    charData.forEach((row, rowIndex) => {
        for (let bit = 0; bit < 8; bit++) {
            if (row & (1 << (7 - bit))) {
                // Draw the primary pixel
                for (let dy = 0; dy < scale; dy++) {
                    for (let dx = 0; dx < scale; dx++) {
                        driver.drawPixel(x + bit * scale + dx, y + rowIndex * scale + dy, 1);
                    }
                }

                // Anti-aliasing: draw surrounding pixels at half intensity
                // Top-left
                if (rowIndex > 0 && !(charData[rowIndex - 1] & (1 << (7 - bit)))) {
                    driver.drawPixel(x + bit * scale - 1, y + rowIndex * scale - 1, 0.5);
                }
                // Top
                if (rowIndex > 0 && !(charData[rowIndex - 1] & (1 << (7 - bit)))) {
                    driver.drawPixel(x + bit * scale, y + rowIndex * scale - 1, 0.5);
                }
                // Top-right
                if (rowIndex > 0 && bit < 7 && !(charData[rowIndex - 1] & (1 << (6 - bit)))) {
                    driver.drawPixel(x + (bit + 1) * scale, y + rowIndex * scale - 1, 0.5);
                }
                // Left
                if (bit > 0 && !(row & (1 << (8 - bit)))) {
                    driver.drawPixel(x + bit * scale - 1, y + rowIndex * scale, 0.5);
                }
                // Right
                if (bit < 7 && !(row & (1 << (6 - bit)))) {
                    driver.drawPixel(x + (bit + 1) * scale, y + rowIndex * scale, 0.5);
                }
                // Bottom-left
                if (rowIndex < charData.length - 1 && !(charData[rowIndex + 1] & (1 << (7 - bit)))) {
                    driver.drawPixel(x + bit * scale - 1, y + (rowIndex + 1) * scale, 0.5);
                }
                // Bottom
                if (rowIndex < charData.length - 1 && !(charData[rowIndex + 1] & (1 << (7 - bit)))) {
                    driver.drawPixel(x + bit * scale, y + (rowIndex + 1) * scale, 0.5);
                }
                // Bottom-right
                if (rowIndex < charData.length - 1 && bit < 7 && !(charData[rowIndex + 1] & (1 << (6 - bit)))) {
                    driver.drawPixel(x + (bit + 1) * scale, y + (rowIndex + 1) * scale, 0.5);
                }
            }
        }
    });
}

// Function to draw a string using scaled unifont with anti-aliasing
function drawScaledStringWithAA(string, x, y, scale, driver) {
    for (let i = 0; i < string.length; i++) {
        drawScaledCharWithAA(string[i], x + (i * 8 * scale), y, scale, driver);
    }
}

// Function to calculate the total width and height of a string with scaling
function getStringDimensions(string, scale) {
    const width = string.length * 8 * scale; // Each character is 8 pixels wide
    const height = 16 * scale; // Height of unifont is typically 16 pixels
    return { width, height };
}

module.exports = function clock_mode() {
    if (this.page === "clock") return;
    clearInterval(this.update_interval);
    this.page = "clock";

    this.refresh_action = () => {
        this.driver.buffer.fill(0x00);
        const ftime = date.format(new Date(), 'HH:mm');

        // Define the scale factor
        const scale = 3;

        // Calculate the dimensions of the scaled string
        const { width, height } = getStringDimensions(ftime, scale);

        // Calculate the top-left corner to center the string
        const screenWidth = this.driver.WIDTH; // Adjust based on your actual screen width
        const screenHeight = this.driver.HEIGHT; // Adjust based on your actual screen height
        const startX = Math.floor((screenWidth - width) / 2);
        const startY = Math.floor((screenHeight - height) / 2);

        // Draw the scaled and centered time string with anti-aliasing
        drawScaledStringWithAA(ftime, startX, startY, scale, this.driver);

        this.driver.update(true);
    }

    this.refresh_action();
    this.update_interval = setInterval(() => { this.refresh_action() }, 1000);
}
