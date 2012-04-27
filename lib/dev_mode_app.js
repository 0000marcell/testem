var Server = require('./server').Server
  , fs = require('fs')
  , log = require('winston')
  , child_process = require('child_process')
  , AppView = require('./appview')
  , Path = require('path')
  , yaml = require('js-yaml')
  , FileWatcher = require('./filewatcher')
  , Config = require('./config')

function App(progOptions){
    this.config = new Config(progOptions)

    this.fileWatcher = new FileWatcher
    this.fileWatcher.on('change', this.onFileChanged.bind(this))
    this.fileWatcher.add(this.config.get('file'))

    this.config.read(function(){
        this.server = new Server(this)
        this.server.on('browsers-changed', this.onBrowsersChanged.bind(this))
        this.server.on('test-result', this.onTestResult.bind(this))
        this.server.on('all-test-results', this.onAllTestResults.bind(this))
        this.server.on('server-start', this.initView.bind(this))
        this.server.on('file-requested', this.onFileRequested.bind(this))
    }.bind(this))
}

App.prototype = {
    onFileRequested: function(filepath){
        this.fileWatcher.add(filepath)
    },
    onFileChanged: function(filepath){
        if (filepath === Path.resolve(this.config.get('file'))){
            // config changed
            this.config.read(this.startTests.bind(this))
        }else{
            this.startTests()
        }
    },
    startPhantomJS: function(){
        var path = Path.dirname(__dirname) + '/assets/phantom.js'
        this.phantomProcess = child_process.spawn('phantomjs', [path,
            this.config.get('port')])
        log.info('Spawning PhantomJS')
    },
    initView: function(){
        this.view = new AppView(this)
        if (this.view.on)
            this.view.on('inputChar', this.onInputChar.bind(this))
        this.startPhantomJS()
    },
    quit: function(code){
        if (this.phantomProcess)
            this.phantomProcess.kill('SIGTERM')
        setTimeout(function(){
            this.view.cleanup()
            process.exit(code)
        }.bind(this), 100)
    }, 
    onInputChar: function(chr, i) {
        if (chr === 'q')
            this.quit()
        else if (i === 13) // ENTER
            this.startTests()
    },
    startTests: function(){
        this.view.onStartTests()
        this.server.startTests()
    },
    onBrowsersChanged: function(){
        this.view.onBrowsersChanged()
    },
    onTestResult: function(result, browser){
        this.view.onTestResult(result, browser)
    },
    testsAllDone: function(){
        return this.server.browsers.every(function(b){
            return b.results && b.results.all})
    },
    onAllTestResults: function(results){
        this.view.onAllTestResults(results)
    }
}

module.exports = App