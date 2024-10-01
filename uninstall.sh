#!/bin/bash

# Quadify Plugin Uninstallation Script
echo "Uninstalling Quadify and its dependencies..."
UNINSTALLING="/home/volumio/quadify-plugin.uninstalling"

if [ ! -f $UNINSTALLING ]; then
    touch $UNINSTALLING

    # Stop any services related to Quadify
    echo "Stopping related services..."
    sudo systemctl stop oled.service
    sudo systemctl disable oled.service
    sudo systemctl stop startup-indicator.service
    sudo systemctl disable startup-indicator.service

    # Remove the systemd service files
    echo "Removing systemd service files..."
    sudo rm /etc/systemd/system/oled.service
    sudo rm /etc/systemd/system/startup-indicator.service

    # Reload systemd to apply changes
    sudo systemctl daemon-reload

    # Remove the log directory if it exists
    if [ -d "/var/log/quadify" ]; then
        echo "Removing Quadify log directory..."
        sudo rm -rf /var/log/quadify
    fi

    # Remove Quadify plugin files from Volumio's plugin data directory
    echo "Cleaning up plugin files..."
    sudo rm -rf /data/plugins/miscellanea/quadify

    # Remove any symbolic links or configuration files if created
    echo "Removing any symbolic links or extra configuration files..."
    sudo rm -f /home/volumio/quadify-plugin.installing
    sudo rm -f /home/volumio/quadify-plugin.uninstalling

    # Remove the uninstallation flag
    rm $UNINSTALLING

    # Required to signal the end of the plugin uninstall to Volumio
    echo "pluginuninstallend"
else
    echo "Quadify Plugin is already uninstalling! Not continuing..."
fi
