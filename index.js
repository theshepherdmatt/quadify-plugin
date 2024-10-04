'use strict';

const  libQ         = require('kew'),
        { exec }     = require('child_process'),
        http         = require('http');
        
module.exports = quadify;

function quadify(context) {
    this.context         = context;
    this.commandRouter   = this.context.coreCommand;
    this.logger          = this.context.logger;
    this.configManager   = this.context.configManager;
}

quadify.prototype.getI18nFile = function (langCode) {
    const dir = __dirname + '/i18n/',
    files = fs.readdirSync(dir),
    targetFile = 'strings_' + langCode + '.json';
    if ( files.some(x=>x === targetFile) ) return dir + targetFile;
    return dir + 'strings_en.json';
} 

quadify.prototype.onVolumioStart = function(){
    const     configFile = this.commandRouter.pluginManager.getConfigurationFile( this.context, 'config.json' );
    this.config = new (require('v-conf'))();
    this.config.loadFile(configFile);
    return libQ.resolve();
}

quadify.prototype.onStart = function(){
    const     defer = libQ.defer();
    this.logger.info( "QUADIFY : Starting Plugin" );    

    this.commandRouter.loadI18nStrings();
    
    this.configSoftLinks([`${__dirname}/apps/oled`])
        .then( x=> this.systemctl('daemon-reload')  )
        .then( x=> this.startServiceIfActive("oled_active","oled2")  )
        .then( x=> this.setRemoteActive( this.config.get("remote_active") )  )
        .then( x=> defer.resolve() )
        .fail( x=> this.logger.error("QUADIFY ERROR " + x) )
    return defer.promise;
};

quadify.prototype.onStop = function (){
    const defer = libQ.defer();
    this.systemctl('stop oled2.service')
    .then( x=> this.systemctl('stop lircd.service') )
    .then( x=> this.systemctl('stop irexec.service') )
    .then( x=> defer.resolve() )
    .fail( x=> defer.reject() );
    return defer.promise;
};

quadify.prototype.onRestart = function(){
    const defer = libQ.defer();
    this.commandRouter.loadI18nStrings();
    this.systemctl('restart oled2.service')
    .then( x=> this.systemctl('restart lircd.service') )
    .then( x=> this.systemctl('restart irexec.service') )
    .then( x=> defer.resolve() )
    .fail( x=> defer.reject() );
    return defer.promise;
}

quadify.prototype.restartOled = function(){
    const defer = libQ.defer();
    this.systemctl('restart oled2.service')
    .then( x=> defer.resolve() )
    .fail( x=> defer.reject() );
    return defer.promise;
};

// Configuration Methods -----------------------------------------------------------------------------

quadify.prototype.startServiceIfActive = function(config,service){
    const     defer = libQ.defer();
    if( this.config.get(config) ) this.systemctl(`restart ${service}.service`).then( x=>defer.resolve() ).fail( x=> defer.reject() );
    else{ return libQ.resolve(); }
    return defer.promise;
};

quadify.prototype.getUIConfig = function(){
    const     defer                     = libQ.defer(), 
            lang_code                 = this.commandRouter.sharedVars.get('language_code'),
            target_lang_path         = `${__dirname}/i18n/strings_${lang_code}.json`, 
            fallback_lang_path        = `${__dirname}/i18n/strings_en.json`, 
            config_template_path     = `${__dirname}/UIConfig.json`;
            
    this.commandRouter.i18nJson( target_lang_path, fallback_lang_path, config_template_path )
        .then( (uiconf )=>{
            uiconf.sections[1].content[0].value = this.config.get('oled_active');        
            
            uiconf.sections[1].content[1].value = parseInt(this.config.get('contrast'));
            uiconf.sections[1].content[1].attributes  = [{min:1, max:254}]; 
            
            uiconf.sections[1].content[2].value = parseInt(this.config.get('sleep_after'));
            uiconf.sections[1].content[2].attributes  = [{min:1}]; 
            
            uiconf.sections[1].content[3].value = parseInt(this.config.get('deep_sleep_after'));
            uiconf.sections[1].content[3].attributes  = [{min:1}]; 

            uiconf.sections[2].content[0].value = this.config.get('remote_active');

            defer.resolve(uiconf);
        })
       .fail( x=> defer.reject() );
    return defer.promise;
};

quadify.prototype.getConfigurationFiles = function(){ return ['config.json']; }

quadify.prototype.updateOledConfig = function(data){
    const defer = libQ.defer();
    this.config_changes = {};
    this.config_errors = [];
    
    this.validateAndUpdateConfigItem( data, "oled_active" );
    this.validateAndUpdateConfigItem( data, "contrast" ,             x=> x>0 && x<255 );
    this.validateAndUpdateConfigItem( data,    "sleep_after" ,         x=> x>=0          );
    this.validateAndUpdateConfigItem( data,    "deep_sleep_after" ,     x=> x>=0          );
    
    if(!Object.keys(this.config_changes).length) this.commandRouter.pushToastMessage('info', "QUADIFY : ",  this.commandRouter.getI18nString('UI.CONFIG_NOCHANGE') );
    else this.commandRouter.pushToastMessage('success', "QUADIFY : ", this.commandRouter.getI18nString('UI.CONFIG_UPDATE') );
    
    let returnValue = null;
    // sync tasks needed ? 
    if( "oled_active" in this.config_changes ){
        returnValue = defer;
        if(this.config.get("oled_active") ){
            this.systemctl("restart oled2.service")
            .then( x=> defer.resolve() )
            .fail( x=> defer.reject() );
        }
        else{
            this.systemctl("stop oled2.service")
            .then( x=> defer.resolve() )
            .fail( x=> defer.reject() );
        }
        delete this.config_changes["lcd_active"];
    }
    else returnValue = defer.resolve();

    for( let err of this.config_errors  ) this.commandRouter.pushToastMessage('error', "QUADIFY : ", err);
    for( let key in this.config_changes ){  // some configs options can be updated in real time without restarting oled script with a basic http call.
        if (key in ["contrast","sleep_after","deep_sleep_after" ]){ 
            try{http.get(`http://127.0.0.1:4153/${key}=${this.config_changes[key]}`)}
            catch(e){}
        }
    } 
    this.logger.info('QUADIFY : OLED#2 configuration updated from UI.');
    return returnValue;
}

quadify.prototype.updateRemoteConfig = function(data){
    const     defer     = libQ.defer();
    
    this.config_changes = {};
    this.config_errors = [];
    this.validateAndUpdateConfigItem( data, "remote_active" );

    for( let err of this.config_errors  ) this.commandRouter.pushToastMessage('error', "QUADIFY : ", err);
    
    if(!Object.keys(this.config_changes).length){
        this.commandRouter.pushToastMessage('info', "QUADIFY : ", this.commandRouter.getI18nString('UI.CONFIG_NOCHANGE'));
        return defer.resolve();
    }
    else{
        let returnValue = null;
        // sync tasks needed ? 
        if( "remote_active" in this.config_changes ){
            returnValue = defer;
            this.setRemoteActive( this.config.get("remote_active"))
            .then( x=> defer.resolve() )
            .fail( x=> defer.reject() ); 
        }
        else returnValue = defer.resolve();
        this.logger.info('QUADIFY : Remote configuration updated from UI.');
        this.commandRouter.pushToastMessage('success', "QUADIFY : ",  this.commandRouter.getI18nString('UI.CONFIG_UPDATE') );
        return returnValue;
    }
    return defer.promise;
}

quadify.prototype.validateAndUpdateConfigItem = function(obj, key, validation_rule){
    // check dataset, key, value exists and that it is different from current value.
    if ( obj && key && obj[key] !== undefined && obj[key] != this.config.get(key) ) {
        // also make sure new value is valid according to the provided validation method (if any)
        if ( !validation_rule || validation_rule( obj[key] ) ){
            this.config.set(key, obj[key]);
            this.config_changes[key] = obj[key];
        }
        else{
            this.config_errors.push(`QUADIFY : invalid config value ${key} ${obj[key]}. `)
        }
    };
}

quadify.prototype.configSoftLinks = function(targets){
        
        // Display app needs to read from config.json when starting.
        // This creates a symlink of the config.json file into __dirname/apps/evo dir. 
        // config.filePath seems dynamically attributed and using its data to 
        // renew the link every time volumio starts sounds like the most robust solution at this time.
        
    // targets is an array of destination paths where the config should be symlinked 
    if(!targets || !targets.length) return libQ.resolve();    
    
    const     defer = libQ.defer(),
            todo = [];
            
    for(let target of targets){
        todo.push(
            new Promise((resolve, reject) => { 
                exec(`/bin/ln -s -f ${this.config.filePath} ${target}`, { uid: 1000, gid: 1000 }, (err)=>{ err && reject(err) || resolve() } );
            })
        );
    }
    Promise.all(todo).then(x=>defer.resolve()).catch(x=>defer.reject());
    return defer.promise;
}

quadify.prototype.diagnoseRemote = function(){
    const     defer = libQ.defer();
    this.checkRemoteService()
    .then(  remote_status=>{
        this.commandRouter.broadcastMessage("openModal",{
            title: 'System Information',
            message: remote_status,
            size: 'lg',
            buttons: [{
                name: 'Close',
                class: 'btn btn-warning',
                emit: 'closeModals',
                payload: ''
            }]
        });    
        return defer.resolve();
    })
    .fail(x=>defer.reject());
    
    ;
    
};

quadify.prototype.setRemoteActive = function(status){
    const     defer = libQ.defer(),
            self = this;
    if(!status){
        this.systemctl('stop quadify_remote.service')
        .then( x=>this.systemctl('stop quadify_irexec.service') )
        .then( x=>defer.resolve() )
        .fail( x=>defer.reject() );
    }        
    else{
        this.systemctl('restart quadify_remote.service')
        .then( x=>this.systemctl("restart quadify_irexec.service")  )
        .then( x=>defer.resolve() ) 
        .fail( x=>defer.reject() );

    }        
    return defer.promise;
};

quadify.prototype.setUIConfig = function(data){};
quadify.prototype.getConf = function(varName){};
quadify.prototype.setConf = function(varName, varValue){};


// System Helpers -----------------------------------------------------------------------------
quadify.prototype.systemctl = function (cmd){
    const defer = libQ.defer(), 
    handle = (err, stdout, stderr)=>{
        if (err) {
            this.logger.error(`QUADIFY : systemd failed cmd ${cmd} : ${err}`);
            this.commandRouter.pushToastMessage('error', "QUADIFY :",  this.commandRouter.getI18nString('ERRORS.SYSTEMD_FAIL')+` : ${cmd} : ${err}.`);
            defer.reject();
            return;
        } 
        this.logger.info(`QUADIFY : systemd cmd ${cmd} : success`);
        defer.resolve();
    };
    exec('/usr/bin/sudo /bin/systemctl ' + cmd, { uid: 1000, gid: 1000 }, handle);
    return defer.promise;
};

quadify.prototype.checkRemoteService = function (){
    
    if( !this.config.get("remote_active") ){ 
        return libQ.resolve( this.commandRouter.getI18nString('ERRORS.REMOTE_DIAGNOSE_DISABLED') );
    }
    const defer = libQ.defer(),
    query_service_active = function(service){  
        return new Promise((resolve, reject) => {
            exec(`systemctl is-active ${service}.service`, (err,stdout,stderr)=>{
                return resolve( stdout === "active\n" );
            });
        });
    }, 
    query_lirc_remote = new Promise((resolve, reject) => {
        exec("journalctl -u evo_remote.service --no-pager _PID=`pidof lircd`", (err,stdout,stderr)=>{
            if(err) return resolve(false);
            let current_remote,
            reg_res,
            test_str = stdout.toString(),
            reg = /Info: Using remote:[\s]+(?<remote_name>.*?)\./g;
            while( reg_res = reg.exec(test_str) ) current_remote = reg_res.groups.remote_name;
            return resolve( current_remote );
        });
    });
    
    Promise.all([query_service_active("quadify_remote"), query_service_active("quadify_irexec"), query_lirc_remote])
    .then((values)=>{
        let lircd_systemd_active = values[0],
        irexec_systemd_active = values[1],
        current_remote = values[2],
        right_target_remote = (current_remote === "ApQuadify"),
        okstr = this.commandRouter.getI18nString('UI.REMOTE_DIAGNOSE_OK'),
        errorstr = this.commandRouter.getI18nString('ERRORS.REMOTE_DIAGNOSE_CONFLICT'),
        all_ok = (lircd_systemd_active && irexec_systemd_active && right_target_remote)    ?    okstr    :    errorstr;
        
        let remoteModelStr = this.commandRouter.getI18nString('UI.REMOTE_DIAGNOSE_REMOTE_DETECTED');
        
        let html = `
            <ul>
                <li>LIRC daemon : ${lircd_systemd_active?"OK":"ERROR"}</li>
                <li>IREXEC daemon : ${irexec_systemd_active?"OK":"ERROR"}</li>
                <li>${remoteModelStr} : ${right_target_remote?"OK":"ERROR"} (${current_remote})</li>
            </ul>
            <p>${all_ok}</p>
        `;
        defer.resolve(html);
    })
    .catch((error)=>{
        this.commandRouter.pushToastMessage('error', "QUADIFY : ", error);
    });

    return defer.promise;
};

quadify.prototype.getPluginDoc = function (){
    let docI18n =key=>this.commandRouter.getI18nString(`DOCUMENTATION.${key}`),
    html = `
    <p>${docI18n("intro")}</p>
    <p>
        <p>${docI18n("conf")}</p>
        <ul class='evolist'>
            <li><p>${docI18n("dac")}</p></li>
            <li><p>${docI18n("dsd")}</p></li>
            <li><p>${docI18n("vol")}</p></li>
            <li><p>${docI18n("mpd")}</p></li>
        </ul>
    </p>
    <h3>${docI18n("off_note_title")}</h3>
    <p>${docI18n("off_note")}</p>
    <hr>
    <p><em>${docI18n("moar")}</em></p>
    `;
    this.commandRouter.broadcastMessage("openModal",{
        title: docI18n("title"),
        message: html,
        size: 'lg',
        buttons: [{
            name: 'Close',
            class: 'btn btn-warning',
            emit: 'closeModals',
            payload: ''
        }]
    });    
    
    return libQ.resolve(html);
};
