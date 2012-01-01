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
            assert.equal(err.message, 'asyncTickError');
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
            assert.equal(err.message, 'asyncError');
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
                var first = flow.wait();

                flow.queueIgnoreError(function(callback){
                    asyncTickError(callback);
                });
                var second = flow.wait();

                flow.queueIgnoreError(function(callback){
                    asyncError(callback);
                });
                var third = flow.wait();

                self.callback(null, { first: first, second: second, third: third });
            });
        },

        'Error is ignored': function(err, result){
            assert.isNull(err);

            assert.instanceOf(result.first, Error);
            assert.instanceOf(result.second, Error);
            assert.instanceOf(result.third, Error);
        }
    }
});

suite.addBatch({
    "When calling a task's callback more than once": {
        topic: function(){
            var self = this;

            var doubleCallback = function(callback){
                process.nextTick(function(){
                    try {
                        callback();
                    } catch(e){
                        self.callback();
                    }
                });

                process.nextTick(function(){
                    try {
                        callback();
                    } catch(e){
                        self.callback();
                    }
                });
            };

            asyncblock(function(flow){
                doubleCallback(flow.add());
                flow.wait();
            });
        },

        'Error is thrown': function(err, result){

        }
    }
});



suite.export(module);