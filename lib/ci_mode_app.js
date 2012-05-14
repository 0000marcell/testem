var yaml = require('js-yaml')
  , fs = require('fs')
  , Server = require('./server').Server
  , spawn = require('child_process').spawn
  , tap = require('tap')
  , path = require('path')
  , async = require('async')
  , browser_launcher = require('./browser_launcher')
  , Config = require('./config')

function App(progOptions){
    this.config = new Config(progOptions)
    this.browsers = null
    browser_launcher.getAvailableBrowsers(function(availableBrowsers){
        if (this.config.get('list')){
            this.printBrowsers(availableBrowsers)
        }else{
            this.browsers = this.filterBrowsers(availableBrowsers)
            this.initialize()
        }
    }.bind(this))
    
}

App.prototype = {
    initialize: function(){
        var config = this.config
        this.tapProducer = new tap.Producer(true)
        this.tapProducer.pipe(process.stdout)
        this.testId = 1
        this.failed = false
        this.testsStarted = false
        this.config.read(function(){
            this.server = new Server(this)
            this.server.on('browsers-changed', this.onBrowsersChanged.bind(this))
            this.server.on('test-result', this.onTestResult.bind(this))
            this.server.on('server-start', this.onServerStart.bind(this))
        }.bind(this))
    },
    filterBrowsers: function(availableBrowsers){
        var browsers = this.config.get('browsers')
          , skip = this.config.get('skip')
        if (browsers){
            var wantedBrowsers = browsers.toLowerCase().split(',')
            availableBrowsers = availableBrowsers.filter(function(browser){
                return wantedBrowsers.indexOf(browser.name.toLowerCase()) !== -1
            })
        }
        if (skip){
            var unwantedBrowsers = skip.toLowerCase().split(',')
            availableBrowsers = availableBrowsers.filter(function(browser){
                return unwantedBrowsers.indexOf(browser.name.toLowerCase()) === -1
            })
        }
        return availableBrowsers
    },
    onBrowsersChanged: function(){
        if (!this.testsStarted){
            this.server.startTests()
            this.testsStarted = true
        }
    },
    onServerStart: function(){
        var self = this
        var url = 'http://localhost:' + this.config.get('port')
        async.forEachSeries(this.browsers, function(browser, next){
            if (Array.isArray(browser.exe)){
                async.filter(browser.exe, path.exists, function(found){
                    self.launch(browser, found[0], url, next)
                })
            }else{
                // browser.exe is a string
                self.launch(browser, browser.exe, url, next)
            }
        }, function(){
            self.quit()
        })
    },
    launch: function(browser, exe, url, callback){
        var self = this
        console.log("# Launching " + browser.name)
        process.stdout.write('# ')
        var args = [url]
        if (browser.args instanceof Array)
            args = browser.args.concat(args)
        else if (browser.args instanceof Function)
            args = browser.args(self)
        function onAllResults(results){
            self.server.removeListener('all-test-results', onAllResults)
            var doit = function(){
                self.outputTap(results, browser)
                self.browserProcess.kill('SIGKILL')
            }
            if (browser.teardown)
                browser.teardown(doit)
            else
                doit()
        }
        self.server.on('all-test-results', onAllResults)
        
        if (browser.setup){
            browser.setup(self, spawnIt)
        }else{
            spawnIt()
        }
        
        function spawnIt(){
            self.browserProcess = spawn(exe, args)
            self.browserProcess.on('exit', function(code){
                callback()
            })
        }
    },
    onTestResult: function(){
        process.stdout.write('.')
    },
    outputTap: function(results, browser){
        var producer = this.tapProducer

        console.log()
        
        results.tests.forEach(function(test){
            var testName = ' - ' + browser.name + '  ' + test.name
            if (test.failed === 0){
                producer.write({
                    id: this.testId++,
                    ok: true,
                    name: testName
                })
            }else{
                this.failed = true
                var item = test.items.filter(function(i){
                    return !i.passed
                })[0]

                producer.write({
                    id: this.testId++,
                    ok: false,
                    name: testName,
                    message: item.message
                })

                // TODO: add stacktraces and file and line number
            }
        }.bind(this))

        console.log()
    },
    printBrowsers: function(browsers){
        console.log(browsers.length + ' browsers available on this system: ')
        console.log(browsers.map(function(b){return b.name}).join('\n'))
    },
    quit: function(){
        this.tapProducer.end()
        var code = this.failed ? 1 : 0
        process.exit(code)
    }
}

module.exports = App