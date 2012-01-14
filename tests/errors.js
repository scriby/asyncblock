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

            var index = err.stack.indexOf('Pre-asyncblock stack');
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
                    callback();
                });

                process.nextTick(function(){
                    callback();
                });
            };

            asyncblock(function(flow){
                doubleCallback(flow.add());
                flow.wait();

                self.callback();
            });
        },

        'Error is not thrown': function(err, result){

        }
    }
});

suite.addBatch({
    'When an asyncblock is within an asyncblock': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.errorCallback = function(err){
                    self.callback(null, 'outer');
                };

                var outerCont = flow.add();

                asyncblock(function(innerFlow){
                    innerFlow.errorCallback = function(err){
                        self.callback('This error handler should not be called');
                    };

                    var cont = innerFlow.add();
                    process.nextTick(function(){
                        cont();
                    });

                    innerFlow.wait();

                    outerCont();
                });

                flow.wait();

                var wrapped = asyncblock.wrap({
                    async: function(callback){
                        process.nextTick(function(){
                            return callback('err');
                        });
                    }
                });

                wrapped.sync.async();
            });
        },

        'The error is handled by the correct asyncblock': function(result){
            assert.equal(result, 'outer');
        }
    }

});

suite.addBatch({
    'When trying to use flow.sync incorrectly': {
        topic: function(){
            var self = this;
            var errors = {};

            var testFunc = function(flow, callback){
                flow.add();

                callback();
            };

            asyncblock(function(flow){
                try{
                    flow.sync(testFunc(flow, flow.add()));
                } catch(e){
                    errors.first = e;
                }

                try{
                    flow.sync(null);
                } catch(e){
                    errors.second = e;
                }

                self.callback(null, errors);
            });
        },

        'The correct errors occurred': function(errors){
            assert.instanceOf(errors.first, Error);
            assert.instanceOf(errors.second, Error);
        }
    }
});

suite.export(module);