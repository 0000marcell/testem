var Launcher = require('../lib/launcher')
var template = require('../lib/strutils').template
var Config = require('../lib/config')
var expect = require('chai').expect
var assert = require('chai').assert
var stub = require('sinon').stub
var spy = require('sinon').spy

describe('Launcher', function(){
  var settings, launcher, config

  describe('via command', function(){
    beforeEach(function(){
      settings = {command: 'echo hello'}
      config = new Config(null, {port: '7357', url: 'http://blah.com'})
      launcher = new Launcher('say hello', settings, config)
    })
    it('should instantiate', function(){
      expect(launcher.name).to.equal('say hello')
      expect(launcher.settings).to.equal(settings)
    })
    it('should launch something, and also kill it', function(done){
      launcher.launch()
      var data = ''
      launcher.process.stdout.on('data', function(chunk){
        data += String(chunk)
      })
      setTimeout(function(){
        expect(data).to.equal('hello\n')
        done()
      }, 10)
    })
    it('should be process iff protocol is not browser', function(){
      settings.protocol = 'browser'
      expect(launcher.isProcess()).not.to.be.ok
      settings.protocol = 'tap'
      expect(launcher.isProcess()).to.be.ok
      delete settings.protocol
      expect(launcher.isProcess()).to.be.ok
    })
    it('should launch if not a process and started', function(){
      stub(launcher, 'isProcess').returns(false)
      spy(launcher, 'launch')
      launcher.start()
      expect(launcher.launch.called).to.be.ok
    })
    it('substitutes variables', function(done){
      settings.command = 'echo <url>:<port>'
      launcher.start()
      var data = ''
      launcher.process.stdout.on('data', function(chunk){
        data += String(chunk)
      })
      setTimeout(function(){
        expect(data).to.equal('http://blah.com:7357\n')
        done()
      }, 10)
    })
    it('executes setup', function(done){
      settings.setup = function(_config, _done){
        assert.strictEqual(_config, config)
        done()
      }
      launcher.start()
    })
  })

  describe('via exe', function(){

    it('should launch and also kill it', function(done){
      settings = {exe: 'echo', args: ['hello']}
      config = new Config(null, {port: '7357', url: 'http://blah.com'})
      launcher = new Launcher('say hello', settings, config)
      launcher.launch()
      var data = ''
      launcher.process.stdout.on('data', function(chunk){
        data += String(chunk)
      })
      setTimeout(function(){
        expect(data).to.equal('hello http://blah.com\n')
        launcher.kill('SIGKILL', function(){
          done()
        })
      }, 10)
    })
    it('should substitute variables for args', function(done){
      settings = {exe: 'echo', args: ['<port>', '<url>']}
      config = new Config(null, {port: '7357', url: 'http://blah.com'})
      launcher = new Launcher('say url', settings, config)
      launcher.launch()
      var data = ''
      launcher.process.stdout.on('data', function(chunk){
        data += String(chunk)
      })
      setTimeout(function(){
        expect(data).to.equal('7357 http://blah.com http://blah.com\n')
        launcher.kill('SIGKILL', function(){
          done()
        })
      }, 10)
    })
    it('calls args as function with config', function(done){
      settings = {exe: 'echo'}
      settings.args = function(_config){
        assert.strictEqual(_config, config)
        return ['hello']
      }
      config = new Config
      launcher = new Launcher('say hello', settings, config)
      launcher.launch()
      setTimeout(function(){
        done()
      }, 10)
    })
  })
})
