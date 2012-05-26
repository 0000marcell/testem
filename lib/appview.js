require('./patchcharm.js')
var charm = require('charm')(process)
  , spawn = require('child_process').spawn
  , tty = require('tty')
  , log = require('winston')
  , getTermSize = require('./gettermsize.js')
  , EventEmitter = require('events').EventEmitter
  , Backbone = require('backbone')
  , _ = require('underscore')
  , assert = require('assert')

var Chars = {
    horizontal: '\u2501'
    , vertical: '\u2503'
    , topLeft: '\u250f'
    , topRight: '\u2513'
    , bottomLeft: '\u251b'
    , bottomRight: '\u2517'
    , fail: '\u2718'
    , success: '\u2714'
    , cross: '\u2718'
}

if (process.platform === 'win32'){
    // Windows doesn't support the cool unicode characters
    Chars = {
        horizontal: '-'
        , vertical: '|'
        , topLeft: '+'
        , topRight: '+'
        , bottomLeft: '+'
        , bottomRight: '+'
        , fail: ' '
        , success: ' '
        , cross: 'x'
    }
}

exports.Chars = Chars

// A wrapper around charm (gives the same API) that automatically parks the cursor
// to the bottom right corner when not in use
charm = function(charm){
    var timeoutID
    function parkCursor(){
        getTermSize(function(cols, lines){
            charm.position(cols, lines)
        })
    }
    function wrapFunc(func){
        return function(){
            if (timeoutID) clearTimeout(timeoutID)
            var retval = func.apply(charm, arguments)
            timeoutID = setTimeout(parkCursor, 100)
            return retval
        }
    }
    var cursorParker = {}
    for (var prop in charm){
        var value = charm[prop]
        if (typeof value === 'function'){
            cursorParker[prop] = wrapFunc(value)
        }
    }
    return cursorParker
}(charm)

// String padding function from <http://jsfromhell.com/string/pad>
function pad(str, l, s, t){
    return s || (s = " "), (l -= str.length) > 0 ? (s = new Array(Math.ceil(l / s.length)
        + 1).join(s)).substr(0, t = !t ? l : t == 1 ? 0 : Math.ceil(l / 2))
        + str + s.substr(0, l - t) : str;
}

function indent(text){
    return text.split('\n').map(function(line){
        return '    ' + line
    }).join('\n')
}

// View is the base class for our view models
var View = exports.View = Backbone.Model.extend({
    charm: charm
    , observe: function(model, thing){
        var eventMap
        if (typeof thing === 'string' && arguments.length === 3){
            eventMap = {}
            eventMap[thing] = arguments[2]
        }else{
            eventMap = thing
        }
        for (var event in eventMap){
            model.on(event, eventMap[event])
        }
        if (!this.observers)
            this.observers = []
        this.observers.push([model, eventMap])
    }
    , destroy: function(){
        this.removeObservers()
    }
    , removeObservers: function(){
        if (!this.observers) return
        this.observers.forEach(function(observer){
            var model = observer[0]
              , eventMap = observer[1]
            for (var event in eventMap){
                model.off(event, eventMap[event])
            }
        })
    }
})

var LogPanel = exports.LogPanel = View.extend({
    initialize: function(line, col, browser, appview){
        this.browser = browser
        this.appview = appview
        this.set({
            line: line
            , col: col
            , vertScrollOffset: 0
            , visible: false
            , textLines: []
        })
        var self = this
          , results = browser.get('results')
          , tests = results.get('tests')

        self.on('change:lines change:cols change:visible change:textLines', function(){
            self.render()
        })

        this.observe(results, 'change', function(){
            self.updateText()
        })

        this.observe(tests, 'change add remove', function(){
            self.updateText()
        })
        this.observe(appview, 'change:lines change:cols', function(){
            self.updateDimensions()
            self.render()
        })
        self.updateDimensions()
    }
    , updateDimensions: function(){
        var lines = this.appview.get('lines')
          , cols = this.appview.get('cols')
        this.set({
            height: lines - 8
            , width: cols
        })
    }
    , scrollUp: function(){
        var vertScrollOffset = this.get('vertScrollOffset')
        if (vertScrollOffset > 0){
            vertScrollOffset--
            this.set('vertScrollOffset', vertScrollOffset, {silent: true})
            this.render()
        }
    }
    , scrollDown: function(){
        var vertScrollOffset = this.get('vertScrollOffset')
        if (vertScrollOffset + this.get('height') < this.get('textLines').length - 1){
            vertScrollOffset++
            this.set('vertScrollOffset', vertScrollOffset, {silent: true})
            this.render()
        }
    }
    , updateText: function(){
        this.set('textLines', this.getLogText().split('\n'))
    }
    , getLogText: function(){
        var idx = this.appview.get('currentTab')
        var browser = this.browser
          , results = browser.get('results')
          , topLevelError = browser.get('topLevelError')
          , tests = null
        if (!results && !topLevelError){
            return 'Waiting...'
        }
        if (topLevelError){
            return browser.topLevelError
        }else if (results && (tests = results.get('tests'))){
            var failedTests = tests.filter(function(test){
                return test.get('failed') > 0
            })
            
            var out = failedTests.map(function(test){
                var failedItems = test.get('items').filter(function(item){
                    return !item.passed
                })
                return test.get('name') + '\n' + 
                    indent(failedItems.map(function(item){
                        var extra = ''
                        var stacktrace = item.stacktrace
                        if (stacktrace){
                            var stacklines = stacktrace.split('\n')
                            if (stacklines[0] === item.message)
                                stacktrace = stacklines.slice(1).map(function(line){
                                    return line.trim()
                                }).join('\n')
                            extra = stacktrace
                        }else{
                            if (item.file)
                                extra += item.file
                            if (item.line)
                                extra += ' ' + item.line
                        }
                        return Chars.cross + ' ' + (item.message || 'failed') + 
                            (extra ? '\n' + indent(extra) : '')
                    }.bind(this)).join('\n'))
            }.bind(this)).join('\n') || (
                results.get('all') ? Chars.success + ' ' + results.get('total') + ' tests complete.' : 'Looking good...'
            )
            return out
        }
    }
    , render: function(){
        if (!this.get('visible')) return
        var charm = this.charm
          , line = this.get('line')
          , col = this.get('col')
          , lines = this.get('textLines')
          , height = this.get('height')
          , width = this.get('width')
          , vertScrollOffset = this.get('vertScrollOffset')
        if (!height) return
        charm.foreground('yellow')
        for (var i = 0; i < height; i++){
            var textLine = (lines[i + vertScrollOffset] || '').substring(0, width)
            charm
                .position(col, line + i)
                .write(pad(textLine, width, ' ', 1))
        }
        charm.display('reset')
    }
})

var Spinner = exports.Spinner = View.extend({
    initialize: function(line, col){
        this.set({
            line: line
            , col: col
        })
        this.spinnerChars = '-\\|/'
        this.spinnerIdx = 0
    }
    , start: function(){
        this.set('running', true)
        this.trigger('start')
        var update = function(){
            this.render()
            this.timeoutID = setTimeout(update, 150)
        }.bind(this)
        update()
    }
    , stop: function(){
        this.set('running', false)
        this.trigger('stop')
        clearTimeout(this.timeoutID)
    }
    , render: function(){
        var charm = this.charm
          , chr = this.spinnerChars[this.spinnerIdx++]
          , color = this.get('color')
        if (this.spinnerIdx >= this.spinnerChars.length){
            this.spinnerIdx = 0
        }
        if (color)
            charm.foreground(color)
        charm.position(this.get('col'), this.get('line'))
        charm.write(chr)
        if (color) charm.display('reset')
    }
})

var TabWidth = 15
  , TabStartLine = 4
  , TabHeight = 4
  , TabStartCol = 1
var BrowserTab = exports.BrowserTab = View.extend({
    col: TabStartCol
    , line: TabStartLine
    , height: TabHeight
    , width: TabWidth
    , initialize: function(browser, index, appview){
        this.browser = browser
        this.logPanel = new LogPanel(8, 1, browser, appview)
        var tab = this
          , results = browser.get('results')

        tab.spinner = new Spinner(TabStartLine + 2, this.col + (index + 1) * this.width - 2)

        this.observe(appview, {
            'change:currentTab': function(){
                tab.set('selected', appview.get('currentTab') === tab.get('index'))
            }
        })
        this.observe(browser, {
            'change:name': function(){
                tab.renderBrowserName()
            }
            , 'tests-start': function(){
                tab.spinner.start()
            }
        })
        this.observe(results, {
            'change': function(){
                tab.renderBrowserName()
                tab.renderResults()

                var results = tab.browser.get('results')
                tab.set('allPassed', results.get('passed') === results.get('total'))
            }
            , 'change:all': function(){
                tab.spinner.stop()
                tab.renderCheckOrX()
            }
        })
        this.observe(this, {
            'change:selected': function(){
                tab.logPanel.set('visible', tab.get('selected'))
            }
            , 'change:index change:selected': function(){
                tab.render()
            }
            , 'change:allPassed': function(){
                tab.renderBrowserName()
                tab.renderResults()
                tab.spinner.set('color', tab.color())
            }
        })

        this.set({
            browser: browser
            , index: index
            , selected: false
            , allPassed: true
        })
    }
    , color: function(){
        return this.get('allPassed') ? 'green' : 'red'
    }
    , renderCheckOrX: function(){
        var spinner = this.spinner
          , charm = this.charm
        charm
            .foreground(this.color())
            .position(spinner.get('col'), spinner.get('line'))
            .write(this.get('allPassed') ? Chars.success : Chars.fail)
            .display('reset')
    }
    , render: function(){
        this.renderTab()
        this.renderBrowserName()
        this.renderResults()
    }
    , renderBrowserName: function(){
        var charm = this.charm
          , index = this.get('index')
          , line = this.line
          , width = this.width
          , col = this.col + index * width
          , browser = this.get('browser')
          , browserName = browser.get('name')
        // write line 1
        charm
            .foreground(this.color())

        if (this.get('selected'))
            charm.display('bright')

        charm
            .position(col + 1, line + 1)
            .write(pad(browserName || '', width - 2, ' ', 2))
            .display('reset')
    }
    , renderResults: function(){
        var charm = this.charm
          , index = this.get('index')
          , line = this.line
          , width = this.width
          , col = this.col + index * width
          , browser = this.get('browser')
          , results = browser.get('results')
          , resultsDisplay = results.get('passed') + '/' + results.get('total')


        resultsDisplay = pad(resultsDisplay, width - 4, ' ', 2)
        // write line 1
        charm
            .foreground(this.color())

        if (this.get('selected'))
            charm.display('bright')

        charm
            .position(col + 1, line + 2)
            .write(resultsDisplay)
            .display('reset')
    }
    , renderTab: function(){
        if (this.get('selected'))
            this.renderSelected()
        else
            this.renderUnselected()
    }
    , renderUnselected: function(){
        var charm = this.charm
          , index = this.get('index')
          , width = this.width
          , height = this.height
          , line = this.line
          , col = this.col + index * width
          , firstCol = index === 0
        charm.position(col, line)

        charm.write(Array(width + 1).join(' '))
        for (var i = 1; i < height - 1; i++){
            if (!firstCol){
                charm.position(col, line + i)
                charm.write(' ')
            }
            charm.position(col + width - 1, line + i)
            charm.write(' ')
        }

        var bottomLine = Array(width + 1).join(Chars.horizontal)
        charm.position(col, line + height - 1)
        charm.write(bottomLine)
    }
    , renderSelected: function(){
        var charm = this.charm
          , index = this.get('index')
          , width = this.width
          , height = this.height
          , line = this.line
          , col = this.col + index * width
          , firstCol = index === 0
        charm.position(col, line)

        charm.write((firstCol ? Chars.horizontal : Chars.topLeft) +
            Array(width - 1).join(Chars.horizontal) + 
                Chars.topRight)
        for (var i = 1; i < height - 1; i++){
            if (!firstCol){
                charm.position(col, line + i)
                charm.write(Chars.vertical)
            }
            charm.position(col + width - 1, line + i)
            charm.write(Chars.vertical)
        }

        var bottomLine = (firstCol ? ' ' : Chars.bottomLeft) +
            Array(width - 1).join(' ') + Chars.bottomRight
        charm.position(col, line + height - 1)
        charm.write(bottomLine)
    }
    , destroy: function(){
        this.logPanel.destroy()
        View.prototype.destroy.call(this)
    }
})

var BrowserTabs = exports.BrowserTabs = Backbone.Collection.extend({
    charm: charm
    , initialize: function(tabs, options){
        this.appview = options.appview
        var self = this
        this.appview.browsers().on('remove', function(removed, browsers, options){
            var idx = options.index
            var tab = self.at(idx)
            assert.strictEqual(tab.get('browser'), removed)
            self.remove(tab)
        })
        this.on('remove', function(removed, tabs, options){
            var currentTab = self.appview.get('currentTab')
            if (currentTab >= self.length){
                currentTab--
                self.appview.set('currentTab', currentTab, {silent: true})
            }
            self.forEach(function(browser, idx){
                browser.set({
                    index: idx
                    , selected: idx === currentTab
                })
            })
            self.eraseLast()
            removed.destroy()
        })
        this.appview.on('change:lines change:cols', function(){
            self.blankOutBackground()
            self.render()
        })
    }
    , blankOutBackground: function(){
        var charm = this.charm
          , cols = this.appview.get('cols')
        for (var i = 0; i < TabHeight; i++){
            charm
                .position(0, TabStartLine + i)
                .write(pad('', cols, ' ', 1))
        }
    }
    , render: function(){
        this.invoke('render')
        if (this.length > 0)
            this.renderLine()
    }
    , renderLine: function(){
        var startCol = this.length * TabWidth
        this.charm
            .position(startCol + 1, TabStartLine + TabHeight - 1)
            .write(Array(this.appview.get('cols') - startCol + 1).join(Chars.horizontal))
    }
    , eraseLast: function(){
        var charm = this.charm
          , index = this.length
          , width = TabWidth
          , height = TabHeight
          , line = TabStartLine
          , col = TabStartCol + index * width

        for (var i = 0; i < height - 1; i++){
            charm
                .position(col, line + i)
                .write(Array(width + 1).join(' '))
        }

        var bottomLine = Array(width + 1).join(Chars.horizontal)
        charm.position(col, line + height - 1)
        charm.write(bottomLine)
    }
})

var AppView = exports.AppView = View.extend({
    initialize: function(app){
        this.name = 'Testem'
        this.app = app
        this.initCharm()
        var browserTabs = this.browserTabs = new BrowserTabs([], {appview: this})
        this.set({
            currentTab: -1
            , browserTabs: browserTabs
            , atLeastOneBrowser: false
        })
        var self = this
        var browsers = this.browsers()
        browsers.on('add', function(browser, options){
            var idx = options.index || browsers.length - 1
            browserTabs.push(new BrowserTab(browser, idx, self))
        })
        browsers.on('add remove', function(){
            self.set('atLeastOneBrowser', browsers.length > 0)
        })
        browserTabs.on('add', function(){
            browserTabs.render()
        })
        this.on('change:atLeastOneBrowser', function(){
            if (self.get('atLeastOneBrowser')) self.set('currentTab', 0)
            self.renderBottom()
        })
        this.on('change:lines change:cols', function(){
            self.render()
        })
        this.startMonitorTermSize()
    }
    , initCharm: function(){
        var charm = this.charm
        charm.reset()
        charm.erase('screen')
        charm.on('data', this.onInputChar.bind(this))
        charm.on('^C', function(buf){
            this.cleanup(function(){
                process.exit()
            })
        }.bind(this))
    }
    , startMonitorTermSize: function(){
        var self = this
        ;(function checkTermSize(){
            getTermSize(function(cols, lines){
                if (cols !== self.get('cols') || lines !== self.get('lines')){
                    charm.enableScroll(self.logPanelUnusedLines, lines - 1)
                    self.set({
                        cols: cols
                        , lines: lines
                    })
                }
                setTimeout(checkTermSize, 500)
            })
        }())
    }
    , render: function(){
        this.renderTop()
        this.renderMiddle()
        this.renderBottom()
    }
    , renderTop: function(){
        var charm = this.charm
          , url = 'http://localhost:' + this.app.config.get('port')
          , cols = this.get('cols')
        charm
            .position(0, 1)
            .write(pad('TEST\u0027EM \u0027SCRIPTS!', cols, ' ', 1))
            .position(0, 2)
            .write(pad('Open the URL below in a browser to connect.', cols, ' ', 1))
            .position(0, 3)
            .display('underscore')
            .write(url, cols, ' ', 1)
            .display('reset')
            .position(url.length + 1, 3)
            .write(pad('', cols - url.length, ' ', 1))

    }
    , renderMiddle: function(){
        if (this.browsers.length > 0) return
        var lines = this.get('lines')
          , cols = this.get('cols')
        charm
            .position(0, lines / 2 + 2)
            .write(pad('Waiting for browsers...', cols, ' ', 2))
    }
    , renderBottom: function(){
        var charm = this.charm
          , cols = this.get('cols')
          , msg = (
            !this.get('atLeastOneBrowser') ? 
            '[q to quit]' :
            '[Press ENTER to run tests; q to quit]'
            )
        charm
            .position(0, this.get('lines'))
            .write(pad(msg, cols, ' ', 1))
    }
    , browsers: function(){
        return this.app.server.browsers
    }
    , currentBrowserTab: function(){
        var idx = this.get('currentTab')
        return this.browserTabs.at(idx)
    }
    , onInputChar: function(buf){
        try{
            var chr = String(buf).charAt(0)
              , i = chr.charCodeAt(0)
              , key = (buf[0] === 27 && buf[1] === 91) ? buf[2] : null
            if (buf[0] === 27 && buf[1] === 98)
                this.scrollLeft()
            else if (buf[0] === 27 && buf[1] === 102)
                this.scrollRight()
            else if (key === 67) // right arrow
                this.nextTab()
            else if (key === 68) // left arrow
                this.prevTab()
            else if (key === 66) // down arrow
                this.currentBrowserTab().logPanel.scrollDown()
            else if (key === 65) // up arrow
                this.currentBrowserTab().logPanel.scrollUp()
            this.trigger('inputChar', chr, i)
        }catch(e){
            log.error('In onInputChar: ' + e + '\n' + e.stack)
        }
    }
    , nextTab: function(){
        var currentTab = this.get('currentTab')
        currentTab++
        if (currentTab >= this.browsers().length)
            currentTab = 0
        this.set('currentTab', currentTab)
    }
    , prevTab: function(){
        var currentTab = this.get('currentTab')
        currentTab--
        if (currentTab < 0)
            currentTab = this.browsers().length - 1
        this.set('currentTab', currentTab)
    }
    , cleanup: function(cb){
        charm.display('reset')
        charm.erase('screen')
        charm.position(0, 0)
        charm.enableScroll()
        tty.setRawMode(false)
        charm.destroy()
        if (cb) cb()
    }
})
