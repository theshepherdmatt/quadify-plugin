#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log file for detailed installation messages
LOG_FILE="/var/log/quadify/install_details.log"

# Create log directory if it doesn't exist
sudo mkdir -p /var/log/quadify

log_message() {
    message=$1
    echo -e "$message" | tee -a $LOG_FILE
}

# Function to install Node.js and npm
install_node_and_npm() {
    log_message "${YELLOW}Checking Node.js and npm installation...${NC}"
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        log_message "${GREEN}Node.js and npm are already installed.${NC}"
    else
        log_message "${YELLOW}Installing Node.js and npm...${NC}"
        sudo apt-get update
        sudo apt-get install -y nodejs npm
        if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
            log_message "${GREEN}Node.js and npm installed successfully.${NC}"
            npm init -y
        else
            log_message "${RED}Failed to install Node.js and npm. Exiting.${NC}"
            exit 1
        fi
    fi
}

# Function to install dependencies
install_dependencies() {
    if apt-get -qq install build-essential > /dev/null 2>&1; then
        log_message "${GREEN}Build-essential package installed.${NC}"
    else
        log_message "${RED}Failed to install build-essential. Exiting.${NC}"
        exit 1
    fi
}

# Function to create and enable the OLED service
setup_oled_service() {
    log_message "${YELLOW}Setting up the Quadify OLED Display Service...${NC}"
    # Create the systemd service file
    sudo tee /etc/systemd/system/oled.service > /dev/null <<EOL
[Unit]
Description=Quadify OLED Display Service
After=volumio.service

[Service]
WorkingDirectory=/data/plugins/system_hardware/quadify/apps/oled
ExecStart=/usr/bin/node /data/plugins/system_hardware/quadify/apps/oled/index.js
ExecStop=/usr/bin/node /data/plugins/system_hardware/quadify/apps/oled/off.js
Restart=on-failure
User=volumio
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

    # Reload systemd to apply the new service
    sudo systemctl daemon-reload

    # Enable the service to start on boot
    sudo systemctl enable oled.service

    # Start the service
    sudo systemctl start oled.service

    log_message "${GREEN}OLED Service has been created, enabled, and started.${NC}"
}

# Function to create and enable the startup indicator service
setup_startup_indicator_service() {
    log_message "${YELLOW}Setting up the Startup Indicator LED Service...${NC}"
    # Create the systemd service file
    sudo tee /etc/systemd/system/startup-indicator.service > /dev/null <<EOL
[Unit]
Description=Startup Indicator LED Service
After=network.target

[Service]
ExecStart=/usr/bin/node /data/plugins/system_hardware/quadify/apps/startupindicator.js
Restart=no
User=volumio
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
WorkingDirectory=/data/plugins/system_hardware/quadify/apps/oled
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOL

    # Reload systemd to apply the new service
    sudo systemctl daemon-reload

    # Enable the service to start on boot
    sudo systemctl enable startup-indicator.service

    # Start the service
    sudo systemctl start startup-indicator.service

    log_message "${GREEN}Startup Indicator LED Service has been created, enabled, and started.${NC}"
}

# Function to install the remote script
install_remote_script() {
    log_message "${YELLOW}Running the remote install script...${NC}"
    if [ -f "/data/plugins/system_hardware/quadify/apps/remote/install.sh" ]; then
        (cd /data/plugins/miscellanea/quadify/apps/remote && sudo bash install.sh >> $LOG_FILE 2>> $LOG_FILE)
        log_message "${GREEN}Remote install script executed successfully.${NC}"
    else
        log_message "${RED}Remote install script not found!${NC}"
        exit 1
    fi
}

# Start the installation process
log_message "${GREEN}Quadify's installation is starting...${NC}"
install_node_and_npm

# Install dependencies
install_dependencies
npm install async i2c-bus pi-spi onoff date-and-time socket.io-client@2.1.1 spi-device >> $LOG_FILE 2>> $LOG_FILE

# Configure SPI and I2C
if ! grep -q "^dtparam=spi=on" /boot/userconfig.txt; then
    echo "dtparam=spi=on" | sudo tee -a /boot/userconfig.txt > /dev/null
fi
if ! grep -q "^dtparam=i2c_arm=on" /boot/userconfig.txt; then
    echo "dtparam=i2c_arm=on" | sudo tee -a /boot/userconfig.txt > /dev/null
fi

# Setting up the OLED service
setup_oled_service

# Setting up the Startup Indicator LED Service
setup_startup_indicator_service

# Install the remote script
install_remote_script

log_message "${GREEN}Quadify Dac setup completed successfully. Happy listening!${NC}"
