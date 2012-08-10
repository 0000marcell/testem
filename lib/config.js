/*

config.js
=========

This object returns all config info for the app. It handles reading the `testem.yml` 
or `testem.json` config file.

*/

var fs = require('fs')
  , yaml = require('js-yaml')
  , log = require('winston')
  , path = require('path')
  , async = require('async')
  , browser_launcher = require('./browser_launcher')
  , Launcher = require('./launcher')
  , Chars = require('./chars')
  , pad = require('./strutils').pad

require('colors')

var fileExists = fs.exists || path.exists

function Config(progOptions){
    this.progOptions = progOptions
    this.config = null
}

Config.prototype.read = function(callback){
    var configFile = this.progOptions.file
      , self = this

    if (configFile){
        this.readConfigFile(configFile, callback)
    }else{
        // Try both testem.json and testem.yml
        // testem.json gets precedence
        var files = ['testem.json', 'testem.yml']
        async.filter(files, fileExists, function(matched){
            var configFile = matched[0]
            if (configFile){
                this.readConfigFile(configFile, callback)
            }else{
                if (callback) callback.call(this)
            }
        }.bind(this))
    }
}

Config.prototype.readConfigFile = function(configFile, callback){
    if (configFile.match(/\.json$/)){
        this.readJSON(configFile, callback)
    }else if (configFile.match(/\.yml$/)){
        this.readYAML(configFile, callback)
    }else{
        log.error('Unrecognized config file format for ' + configFile)
        if (callback) callback.call(self)
    }
}

Config.prototype.readYAML = function(configFile, callback){
    log.info('readYAML')
    var self = this
    fs.readFile(configFile, function (err, data) {
        if (!err){
            var cfg = yaml.load(String(data))
            self.config = cfg
        }
        if (callback) callback.call(self)
    })
}

Config.prototype.readJSON = function(configFile, callback){
    log.info('readJSON')
    var self = this
    fs.readFile(configFile, function (err, data) {
        if (!err){
            var cfg = JSON.parse(data.toString())
            self.config = cfg
            self.progOptions.file = configFile
        }
        if (callback) callback.call(self)
    })
}

Config.prototype.get = function(key){
    if (key in this.progOptions)
        return this.progOptions[key]
    else if (this.config && key in this.config)
        return this.config[key]
    else if (key === 'port')
        // Need to default port manually, since file config
        // will be overwritten by command.js default otherwise.
        return 7357
    else
        return null
}

Config.prototype.isCwdMode = function(){
    return !this.get('src_files') && !this.get('test_page')
}

Config.prototype.getLaunchers = function(cb){
    var self = this
    browser_launcher.getAvailableBrowsers(function(availableBrowsers){
        var launchers = {}
        availableBrowsers.forEach(function(browser){
            launchers[browser.name] = new Launcher(browser.name, browser, self)
        })
        // add custom launchers
        var customLaunchers = self.get('launchers')
        if (customLaunchers){
            for (var name in customLaunchers){
                log.info('Installing custom launcher ' + name)
                launchers[name] = new Launcher(name, customLaunchers[name], self)
            }
        }
        cb(launchers)
    })
}

Config.prototype.printLauncherInfo = function(){
    this.getLaunchers(function(launchers){
        var launchers = Object.keys(launchers).map(function(k){return launchers[k]})
        var browsers = launchers.filter(function(launcher){
            return launcher.settings.protocol === 'browser'
        })
        var processes = launchers.filter(function(launcher){
            return launcher.settings.protocol !== 'browser'
        })
        console.log('Have ' + launchers.length + ' launchers available; auto-launch info displayed on the right.')
        console.log() // newline
        console.log('Launcher      Type          CI  Dev')
        console.log('------------  ------------  --  ---')
        console.log(launchers.map(function(launcher){
            var protocol = launcher.settings.protocol
            var kind = protocol === 'browser' ? 
                'browser' : (
                    protocol === 'tap' ?
                        'process(TAP)' : 'process')
            var color = protocol === 'browser' ? 'green' : 'magenta'
            var dev = launcher.settings.launch_in_dev ? 
                Chars.mark : 
                ' '
            var ci = launcher.settings.launch_in_ci !== false ? 
                Chars.mark : 
                ' '
            return (pad(launcher.name, 14, ' ', 1) +
                pad(kind, 12, ' ', 1) +
                '  ' + ci + '    ' + dev + '      ')
        }).join('\n'))
    })
}

module.exports = Config
