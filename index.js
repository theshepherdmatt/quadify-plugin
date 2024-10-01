'use strict';
var libQ = require('kew');
var libNet = require('net');
var fs = require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var Gpio = require('onoff').Gpio;

module.exports = ControllerQuadify;

function ControllerQuadify(context) {
    var self = this;

    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;
    this.configManager = this.context.configManager;
}

ControllerQuadify.prototype.onVolumioStart = function() {
    var self = this;
    self.logger.info("Quadify plugin initiated");

    this.configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
    self.getConf(this.configFile);

    return libQ.resolve();
};

ControllerQuadify.prototype.onVolumioReboot = function() {
    var self = this;
    self.softShutdown.writeSync(1);
};

ControllerQuadify.prototype.onVolumioShutdown = function() {
    var self = this;
    var defer = libQ.defer();

    self.softShutdown.writeSync(1);
    setTimeout(function() {
        self.softShutdown.writeSync(0);
        defer.resolve();
    }, 1000);

    return defer;
};

ControllerQuadify.prototype.getConfigurationFiles = function() {
    return ['config.json'];
};

// Plugin methods
ControllerQuadify.prototype.onStop = function() {
    var self = this;
    self.logger.info("Performing Quadify onStop action");

    if (self.bootOk != undefined) self.bootOk.unexport();
    if (self.softShutdown != undefined) self.softShutdown.unexport();
    if (self.shutdownButton != undefined) {
        self.shutdownButton.unwatchAll();
        self.shutdownButton.unexport();
    }

    return libQ.resolve();
};

ControllerQuadify.prototype.stop = function() {
    var self = this;
    self.logger.info("Performing Quadify stop action");

    return libQ.resolve();
};

ControllerQuadify.prototype.onStart = function() {
    var self = this;
    self.logger.info("Configuring Quadify GPIO pins");

    // Soft shutdown GPIO configuration
    if (self.tryParse(self.config.get('soft_shutdown'), 0) != 0) {
        self.softShutdown = new Gpio(parseInt(self.config.get('soft_shutdown')), 'out');
        self.logger.info('Quadify: Soft shutdown GPIO binding... OK');
    }

    // Shutdown button GPIO configuration
    if (self.tryParse(self.config.get('shutdown_button'), 0) != 0) {
        self.shutdownButton = new Gpio(parseInt(self.config.get('shutdown_button')), 'in', 'both');
        self.logger.info('Quadify: Hardware button GPIO binding... OK');
    }

    // Boot OK GPIO configuration
    if (self.tryParse(self.config.get('boot_ok'), 0) != 0) {
        self.bootOk = new Gpio(parseInt(self.config.get('boot_ok')), 'high');
        self.logger.info('Quadify: Boot OK GPIO binding... OK');
    }

    // Watch for hardware button press
    if (self.shutdownButton) {
        self.shutdownButton.watch(self.hardShutdownRequest.bind(this));
    }

    return libQ.resolve();
};

ControllerQuadify.prototype.onRestart = function() {
    var self = this;
    self.logger.info("Performing Quadify onRestart action");
};

ControllerQuadify.prototype.onInstall = function() {
    var self = this;
    self.logger.info("Performing Quadify onInstall action");
};

ControllerQuadify.prototype.onUninstall = function() {
    var self = this;
    self.logger.info("Performing Quadify onUninstall action");
};

ControllerQuadify.prototype.getUIConfig = function() {
    var self = this;
    var defer = libQ.defer();
    var lang_code = this.commandRouter.sharedVars.get('language_code');
    self.getConf(this.configFile);
    self.logger.info("Quadify: Loaded previous config.");

    self.commandRouter.i18nJson(__dirname + '/i18n/strings_' + lang_code + '.json',
        __dirname + '/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf) {
            self.logger.info("Quadify: Populating UI...");

            // GPIO configuration
            uiconf.sections[0].content[0].value = self.config.get('soft_shutdown');
            uiconf.sections[0].content[1].value = self.config.get('shutdown_button');
            uiconf.sections[0].content[2].value = self.config.get('boot_ok');

            self.logger.info("Quadify: UI configuration loaded");

            defer.resolve(uiconf);
        })
        .fail(function() {
            defer.reject(new Error());
        });

    return defer.promise;
};

ControllerQuadify.prototype.setUIConfig = function(data) {
    var self = this;
    self.logger.info("Quadify: Updating UI config");
    return libQ.resolve();
};

ControllerQuadify.prototype.getConf = function(configFile) {
    var self = this;
    this.config = new(require('v-conf'))();
    this.config.loadFile(configFile);

    return libQ.resolve();
};

ControllerQuadify.prototype.setConf = function(conf) {
    return libQ.resolve();
};

// Public Methods
ControllerQuadify.prototype.updateButtonConfig = function(data) {
    var self = this;

    self.config.set('soft_shutdown', data['soft_shutdown']);
    self.config.set('shutdown_button', data['shutdown_button']);
    self.config.set('boot_ok', data['boot_ok']);

    self.commandRouter.pushToastMessage('success', 'Quadify: Successfully saved new configuration.');
    return libQ.resolve();
};

// Button Management
ControllerQuadify.prototype.hardShutdownRequest = function(err, value) {
    var self = this;
    if (value == 1) { // Only proceed if the button press is detected (value = 1)
        self.commandRouter.shutdown();
    }
};

ControllerQuadify.prototype.tryParse = function(str, defaultValue) {
    var retValue = defaultValue;
    if (str !== null) {
        if (str.length > 0) {
            if (!isNaN(str)) {
                retValue = parseInt(str);
            }
        }
    }
    return retValue;
};
