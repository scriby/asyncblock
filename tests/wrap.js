var vows = require('vows');
var assert = require('assert');

var asyncblock = require('../asyncblock.js');

var path = require('path');
var fs = asyncblock.wrap(require('fs'));

var suite = vows.describe('wrap');

suite.addBatch({
    'When using the sync version of readFile': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                var runTestsContents = fs.sync.readFile(path.join(__dirname, '../test_data/test_file.txt'), 'utf8');
                self.callback(null, runTestsContents);
            });
        },

        'The file contents are as expected': function(contents){
            assert.equal(contents, 'Just a test.');
        }
    },

    'When using the original version of readFile': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                fs.readFile(path.join(__dirname, '../test_data/test_file.txt'), 'utf8', flow.add());
                self.callback(null, flow.wait());
            });
        },

        'The file contents are as expected': function(contents){
            assert.equal(contents, 'Just a test.');
        }
    },

    'When returning multiple arguments': {
        topic: function(){
            var self = this;

            var obj = {
                test: function(callback){
                    process.nextTick(function(){
                        callback(null, 1, 2, 3);
                    });
                }
            };

            var wrapped = asyncblock.wrap(obj);

            asyncblock(function(flow){
                var result = wrapped.syncOptions({responseFormat: ['a', 'b', 'c']}).test();

                self.callback(null, result);
            });
        },

        'The results are as expected': function(result){
            assert.deepEqual(result, {a: 1, b: 2, c: 3});
        }
    },

    'When using futures': {
        topic: function(){
            var self = this;

            var obj = {
                test: function(callback){
                    process.nextTick(function(){
                        callback(null, 1, 2, 3);
                    });
                }
            };

            var wrapped = asyncblock.wrap(obj);

            asyncblock(function(flow){
                var future1 = wrapped.futureOptions({responseFormat: ['a', 'b', 'c']}).test();
                var future2 = wrapped.future.test();

                self.callback(null, {first: future1.result, second: future2.result});
            });
        },

        'The results are as expected': function(result){
            assert.deepEqual(result.first, {a: 1, b: 2, c: 3});
            assert.equal(result.second, 1);
        }
    },

    'When calling a function that calls its callback immdiately': {
        topic: function(){
            var self = this;

            var obj = {
                test: function(callback){
                    callback(null, 1, 2, 3);
                }
            };

            var wrapped = asyncblock.wrap(obj);

            asyncblock(function(flow){
                wrapped.sync.test();

                self.callback();
            });
        },

        'The results are as expected': function(result){
            //As long as no errors occur above, this test passed
        }
    }
});

suite.export(module);
