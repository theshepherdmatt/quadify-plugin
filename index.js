'use strict';

const libQ = require('kew'),
      { exec } = require('child_process'),
      http = require('http');

module.exports = QuadifyPlugin;

function QuadifyPlugin(context) {
    this.context = context;
    this.commandRouter = this.context.coreCommand;
    this.logger = this.context.logger;
    this.configManager = this.context.configManager;
}

QuadifyPlugin.prototype.getI18nFile = function (langCode) {
    const dir = __dirname + '/i18n/',
        files = fs.readdirSync(dir),
        targetFile = 'strings_' + langCode + '.json';
    if (files.some(x => x === targetFile)) return dir + targetFile;
    return dir + 'strings_en.json';
};

QuadifyPlugin.prototype.onVolumioStart = function() {
    const configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');
    this.config = new (require('v-conf'))();
    this.config.loadFile(configFile);
    return libQ.resolve();
};

QuadifyPlugin.prototype.onStart = function() {
    const defer = libQ.defer();
    this.logger.info("Quadify: Starting Plugin");

    this.commandRouter.loadI18nStrings();

    // Create symbolic links for OLED scripts to access the configuration file
    this.configSoftLinks([`${__dirname}/apps/oled`])
        .then(() => this.systemctl('daemon-reload')) // Reload the systemd configuration
        .then(() => this.startServiceIfActive("oled_active", "oled")) // Start the OLED service if enabled
        .then(() => this.setRemoteActive(this.config.get("remote_active"))) // Handle remote configuration if applicable
        .then(() => defer.resolve())
        .fail(err => this.logger.error("Quadify Error: " + err));
    return defer.promise;
};

QuadifyPlugin.prototype.onStop = function() {
    const defer = libQ.defer();
    this.systemctl('stop oled.service')
        .then(() => this.systemctl('stop lircd.service'))
        .then(() => this.systemctl('stop irexec.service'))
        .then(() => defer.resolve())
        .fail(err => defer.reject(err));
    return defer.promise;
};

QuadifyPlugin.prototype.onRestart = function() {
    const defer = libQ.defer();
    this.commandRouter.loadI18nStrings();
    this.systemctl('restart oled.service')
        .then(() => this.systemctl('restart lircd.service'))
        .then(() => this.systemctl('restart irexec.service'))
        .then(() => defer.resolve())
        .fail(err => defer.reject());
    return defer.promise;
};

QuadifyPlugin.prototype.restartOled = function() {
    const defer = libQ.defer();
    this.systemctl('restart oled.service')
        .then(() => defer.resolve())
        .fail(err => defer.reject());
    return defer.promise;
};

// Configuration Methods
QuadifyPlugin.prototype.startServiceIfActive = function(config, service) {
    const defer = libQ.defer();
    if (this.config.get(config)) {
        this.systemctl(`restart ${service}.service`).then(() => defer.resolve()).fail(err => defer.reject(err));
    } else {
        return libQ.resolve();
    }
    return defer.promise;
};

QuadifyPlugin.prototype.getUIConfig = function() {
    const defer = libQ.defer(),
          lang_code = this.commandRouter.sharedVars.get('language_code'),
          target_lang_path = `${__dirname}/i18n/strings_${lang_code}.json`,
          fallback_lang_path = `${__dirname}/i18n/strings_en.json`,
          config_template_path = `${__dirname}/UIConfig.json`;

    this.commandRouter.i18nJson(target_lang_path, fallback_lang_path, config_template_path)
        .then(uiconf => {
            uiconf.sections[1].content[0].value = this.config.get('oled_active');
            uiconf.sections[1].content[1].value = parseInt(this.config.get('contrast'));
            uiconf.sections[1].content[1].attributes = [{ min: 1, max: 254 }];
            uiconf.sections[1].content[2].value = parseInt(this.config.get('sleep_after'));
            uiconf.sections[1].content[2].attributes = [{ min: 1 }];
            uiconf.sections[1].content[3].value = parseInt(this.config.get('deep_sleep_after'));
            uiconf.sections[1].content[3].attributes = [{ min: 1 }];

            uiconf.sections[2].content[0].value = this.config.get('remote_active');
            defer.resolve(uiconf);
        })
        .fail(err => defer.reject());
    return defer.promise;
};

QuadifyPlugin.prototype.getConfigurationFiles = function() {
    return ['config.json'];
};

QuadifyPlugin.prototype.updateOledConfig = function(data) {
    const defer = libQ.defer();
    this.config_changes = {};
    this.config_errors = [];

    this.validateAndUpdateConfigItem(data, "oled_active");
    this.validateAndUpdateConfigItem(data, "contrast", x => x > 0 && x < 255);
    this.validateAndUpdateConfigItem(data, "sleep_after", x => x >= 0);
    this.validateAndUpdateConfigItem(data, "deep_sleep_after", x => x >= 0);

    if (!Object.keys(this.config_changes).length) {
        this.commandRouter.pushToastMessage('info', "Quadify: ", this.commandRouter.getI18nString('UI.CONFIG_NOCHANGE'));
    } else {
        this.commandRouter.pushToastMessage('success', "Quadify: ", this.commandRouter.getI18nString('UI.CONFIG_UPDATE'));
    }

    let returnValue = null;
    if ("oled_active" in this.config_changes) {
        returnValue = defer;
        if (this.config.get("oled_active")) {
            this.systemctl("restart oled.service").then(() => defer.resolve()).fail(err => defer.reject());
        } else {
            this.systemctl("stop oled.service").then(() => defer.resolve()).fail(err => defer.reject());
        }
        delete this.config_changes["lcd_active"];
    } else returnValue = defer.resolve();

    for (let err of this.config_errors) this.commandRouter.pushToastMessage('error', "Quadify: ", err);

    for (let key in this.config_changes) {
        if (key in ["contrast", "sleep_after", "deep_sleep_after"]) {
            try {
                http.get(`http://127.0.0.1:4153/${key}=${this.config_changes[key]}`);
            } catch (e) {}
        }
    }

    this.logger.info('Quadify: OLED configuration updated from UI.');
    return returnValue;
};

QuadifyPlugin.prototype.validateAndUpdateConfigItem = function(obj, key, validation_rule) {
    if (obj && key && obj[key] !== undefined && obj[key] != this.config.get(key)) {
        if (!validation_rule || validation_rule(obj[key])) {
            this.config.set(key, obj[key]);
            this.config_changes[key] = obj[key];
        } else {
            this.config_errors.push(`Quadify: Invalid config value ${key} ${obj[key]}. `);
        }
    }
};

QuadifyPlugin.prototype.configSoftLinks = function(targets) {
    if (!targets || !targets.length) return libQ.resolve();

    const defer = libQ.defer(),
          todo = [];

    for (let target of targets) {
        todo.push(
            new Promise((resolve, reject) => {
                exec(`/bin/ln -s -f ${this.config.filePath} ${target}`, { uid: 1000, gid: 1000 }, (err) => {
                    err && reject(err) || resolve();
                });
            })
        );
    }

    Promise.all(todo).then(() => defer.resolve()).catch(err => defer.reject());
    return defer.promise;
};

QuadifyPlugin.prototype.systemctl = function(cmd) {
    const defer = libQ.defer(),
          handle = (err, stdout, stderr) => {
              if (err) {
                  this.logger.error(`Quadify: systemd failed cmd ${cmd} : ${err}`);
                  this.commandRouter.pushToastMessage('error', "Quadify:", `Systemd failed cmd: ${cmd} : ${err}.`);
                  defer.reject();
                  return;
              }
              this.logger.info(`Quadify: systemd cmd ${cmd} : success`);
              defer.resolve();
          };

    exec('/usr/bin/sudo /bin/systemctl ' + cmd, { uid: 1000, gid: 1000 }, handle);
    return defer.promise;
};
