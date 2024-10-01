## Quadify Plugin Uninstallation Script
echo "Uninstalling Quadify and its dependencies..."
UNINSTALLING="/home/volumio/quadify-plugin.uninstalling"

if [ ! -f $UNINSTALLING ]; then
    touch $UNINSTALLING

    # Perform any additional cleanup if necessary
    # Example: Remove specific configuration files or dependencies

    # Remove the uninstallation flag
    rm $UNINSTALLING

    # Required to signal the end of the plugin uninstall to Volumio
    echo "pluginuninstallend"
else
    echo "Quadify Plugin is already uninstalling! Not continuing..."
fi

