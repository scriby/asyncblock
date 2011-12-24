var vows = require('vows');
var assert = require('assert');

var asyncblock = require('../asyncblock.js');

var suite = vows.describe('errors');

var asyncError = function(callback){
    callback('asyncError');
};

var asyncTickError = function(callback){
    process.nextTick(function(){
        callback('asyncTickError');
    });
};

var asyncTickErrorPreserveCallstack = function(callback){
    process.nextTick(function(){
        callback(new Error('asyncTickError'));
    });
};

suite.addBatch({
    'Error after async call': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.errorCallback = self.callback;

                asyncTickError(flow.add());
                flow.wait();

                throw new Error("This line shouldn't execute");
            });
        },

        'Error is trapped': function(err, result){
            assert.equal(err, 'asyncTickError');
        }
    }
});

suite.addBatch({
    'Error before async call': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.errorCallback = self.callback;

                asyncError(flow.add());
                flow.wait();

                throw new Error("This line shouldn't execute");
            });
        },

        'Error is trapped': function(err, result){
            assert.equal(err, 'asyncError');
        }
    }
});

suite.addBatch({
    'Error thrown from callback': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                var callback = flow.errorCallback = function(err){
                    if(err) {
                        self.callback(err);
                    } else {
                        throw new Error('error thrown from callback');
                    }
                };

                callback();

                throw new Error("This line shouldn't execute");
            });
        },

        'Error is trapped': function(err, result){
            assert.instanceOf(err, Error);
            assert.equal(err.message, 'error thrown from callback');
        }
    }
});

suite.addBatch({
    'Error after async call': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.errorCallback = self.callback;

                asyncTickErrorPreserveCallstack(flow.add());
                flow.wait();

                throw new Error("This line shouldn't execute");
            });
        },

        'Call stack is preserved': function(err, result){
            var index = err.stack.indexOf('Pre-async stack');
            assert.greater(index, 0);
        }
    }
});

suite.addBatch({
    'When ignoring errors': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.errorCallback = self.callback;

                asyncTickError(flow.addIgnoreError());
                asyncError(flow.callbackIgnoreError());
                flow.wait();

                flow.queueIgnoreError(function(callback){
                    asyncTickError(callback);
                });
                flow.queueIgnoreError(function(callback){
                    asyncError(callback);
                });
                flow.wait();

                self.callback();
            });
        },

        'Error is ignored': function(err, result){
            assert.isNull(err);
        }
    }
});

suite.export(module);