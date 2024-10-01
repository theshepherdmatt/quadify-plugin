Quadify OLED & Remote Plugin for Volumio 3
This plugin enhances the functionality of Volumio by providing:

OLED Display integration to show playback status and system information.
Remote control support, allowing you to manage Volumio's playback features with an IR remote.
Features
1. OLED Display Integration
The Quadify plugin enables a secondary OLED display to work with Volumio, providing real-time feedback on playback status and system activity. The display works seamlessly with Volumio's internal state and enhances your overall experience by showing details such as:

Currently playing track information
Volume level
System status and IP address
Screensaver and deep sleep mode
2. Remote Control Integration
The plugin also allows your IR remote control to interact with Volumio's playback features, offering a convenient way to manage music playback, volume control, and navigation.

Installation Guide
A step-by-step installation guide is available here. Follow the instructions to correctly set up the Quadify OLED & Remote plugin on your Volumio system.

Quick Installation Steps
Download the plugin from the Volumio Plugins store or from the GitHub repository.
Upload and install the plugin via Volumio's Web UI or via the terminal.
Reboot your Volumio device to activate the plugin and its features.
OLED Display Integration Details
The OLED display layer is a separate Node.js application that runs when the plugin starts. It communicates with Volumio using the WebSocket API to fetch the current playback state and displays it on the screen.

WebSocket API: Utilizes Volumio’s WebSocket API for real-time playback updates.
Micro HTTP Server: The plugin includes a micro HTTP server to listen for events, enabling it to automatically exit sleep mode when the remote is used or when other activities are detected.
SPI Communication: The display uses the SPI interface for efficient data transfer, powered by the RPIO package for better performance compared to standard GPIO/ONOFF packages.
OLED Configuration
The OLED display configuration is accessible via the Volumio UI settings page under the Quadify plugin section.
You can adjust contrast, screensaver timeout, and deep sleep settings directly from the UI.
Remote Control Integration Details
The remote control layer uses LIRC and IREXEC to translate IR inputs into system commands, allowing you to control Volumio playback with your IR remote.

Custom Service: The plugin sets up its own services (quadify_remote.service and quadify_irexec.service) to avoid conflicts with other remote control plugins.
Configuration: During installation, the plugin writes to /boot/userconfig.txt to expose the correct GPIO IR device tree. A reboot is necessary for the remote to be fully functional after the initial setup.
Important Notes
Ensure SPI is enabled on your Volumio device by adding dtparam=spi=on to /boot/userconfig.txt.
The plugin will require access to GPIO pins; please ensure no other services conflict with these pins.
Translation & Documentation
The Quadify plugin settings page includes documentation and tips in English. Contributions for translations in other languages are welcome. You can assist by providing translations or improving the documentation to help users worldwide.

How to Access the Plugin Settings
Navigate to Settings > Plugins > Installed Plugins > Quadify.
Adjust settings for OLED display and remote control as per your preferences.
Troubleshooting & Support
If you encounter any issues, please refer to the plugin logs located at /var/log/quadify for detailed error messages and status updates. Feel free to raise an issue on our GitHub repository for assistance.

Credits & Acknowledgements
Thanks to the Volumio community and contributors for providing invaluable resources and support.
Special thanks to all testers who provided feedback during the plugin's development and beta stages.
