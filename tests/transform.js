var vows = require('vows');
var assert = require('assert');

var asyncblock = require('asyncblock');
asyncblock.enableTransform();

Error.stackTraceLimit = 100;

var suite = vows.describe('transform');
var defer = require('../test_data/transform/defer.js');
var sync = require('../test_data/transform/sync.js');

suite.addBatch({
    'defer1': {
        topic: function(){
            defer.test1(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer2': {
        topic: function(){
            defer.test2(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer3': {
        topic: function(){
            defer.test3(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer4': {
        topic: function(){
            defer.test4(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer5': {
        topic: function(){
            defer.test5(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer6': {
        topic: function(){
            defer.test6(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer7': {
        topic: function(){
            defer.test7(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    }
});

suite.addBatch({
    'sync1': {
        topic: function(){
            sync.test1(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'sync2': {
        topic: function(){
            sync.test2(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'sync3': {
        topic: function(){
            sync.test3(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'sync4': {
        topic: function(){
            sync.test4(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'sync5': {
        topic: function(){
            sync.test5(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'sync6': {
        topic: function(){
            sync.test6(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    }
});

suite.export(module);