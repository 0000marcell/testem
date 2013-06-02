var App = require('../../lib/ci')
var Config = require('../../lib/config')
var path = require('path')
var assert = require('chai').assert
var log = require('winston')
var sinon = require('sinon')

log.remove(log.transports.Console)

describe('ci mode app', function(){

  it('runs them tests', function(done){
    this.timeout(20000)
    var config = new Config('ci', {
      file: 'tests/fixtures/tape/testem.json',
      port: 7359,
      cwd: 'tests/fixtures/tape/',
      launch_in_ci: ['node', 'nodeplain', 'phantomjs']
    })
    config.read(function(){
      var app = new App(config)
      app.process = {exit: sinon.spy()}
      var reporter = app.reporter = new FakeReporter(function(){
        setTimeout(checkResults, 100)
      })
      app.start()

      function checkResults(){
        var browsers = reporter.results.map(function(r){
          return r[0]
        })
        assert.include(browsers, 'Node')
        assert.include(browsers, 'NodePlain')
        assert(reporter.results.every(function(arg){
          return arg[1].passed
        }), 'all tests passed')
        assert(reporter.results.length >= 1, 'should have a few launchers') // ball park?
        assert(app.process.exit.called, 'called process.exit()')
        done()
      }
    })
  })

})

function FakeReporter(done){
  this.done = done
  this.results = []
}
FakeReporter.prototype.report = function(){
  this.results.push(Array.prototype.slice.call(arguments))
}
FakeReporter.prototype.finish = function(){
  this.done()
}