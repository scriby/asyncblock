var vows = require('vows');
var assert = require('assert');

var asyncblock = require('asyncblock');
asyncblock.enableTransform();

var suite = vows.describe('transform');

suite.addBatch({
    'defer1': {
        topic: function(){
            require('../test_data/transform/defer.js').test1(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer2': {
        topic: function(){
            require('../test_data/transform/defer.js').test2(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer3': {
        topic: function(){
            require('../test_data/transform/defer.js').test3(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

    'defer4': {
        topic: function(){
            require('../test_data/transform/defer.js').test4(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    },

/*    'defer5': {
        topic: function(){
            require('../test_data/transform/defer.js').test5(this.callback);
        },

        'Correct result': function(result){
            assert.equal(result, 'test');
        }
    }*/
});

suite.export(module);