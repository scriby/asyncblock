var vows = require('vows');
var assert = require('assert');

var asyncblock = require('asyncblock');
asyncblock.enableTransform();

Error.stackTraceLimit = 100;

var suite = vows.describe('transform');
var defer = require('../test_data/transform/defer.js');
var sync = require('../test_data/transform/sync.js');
var future = require('../test_data/transform/future.js');
var parse = require('../test_data/transform/parse.js');

var makeTests = function(file, name, count){
    var tests = {};

    for(var i = 1; i <= count; i++){
        (function(i){
            tests[name + i] = {
                topic: function(){
                    file['test' + i](this.callback);
                },

                'Correct result': function(result){
                    assert.equal(result, 'test');
                }
            };
        })(i);
    }

    return tests;
};

suite.addBatch(makeTests(defer, 'defer', 7));
suite.addBatch(makeTests(sync, 'sync', 6));
suite.addBatch(makeTests(future, 'future', 7));

suite.addBatch({
    'Parser maintains line numbers correctly': {
        topic: function(){
            parse.test(this.callback);
        },

        'Line numbers correct': function(result){
            assert.isTrue(parse.lineCountMaintained);
            assert.equal(result, 'test');
        }
    }
});

suite.export(module);