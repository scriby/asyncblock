var vows = require('vows');
var assert = require('assert');
var util = require('util');
var asyncblock = require('../asyncblock.js');

var suite = vows.describe('functionality');

var immed = function(callback){
    callback(null, 'immed');
};

var immedArray = function(callback) {
    callback(null, [1, 2, 3]);
};

var immedMultiple = function(callback) {
    callback(null, 1, 2, 3);
};

var delayed = function(callback){
    process.nextTick(
        function(){
            callback(null, 'delayed');
        }
    );
};

// sleeps for the specified amount of time and then calls the
// callback with the number of milliseconds since Jan 1, 1970
var sleepTest = function(sleepTime, callback) {
    setTimeout(
        function() {
            var d=new Date();
            var t = d.getTime();
            callback(null, t);
        },
        sleepTime
    );
};

var delayedAdd = function(flow, callback){
    process.nextTick(
        function(){
            delayed(flow.add('t2'));

            callback(null, 'delayedAdd');
        }
    );
};

suite.addBatch({
    'A single result, immediately': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                immed(flow.add());

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.equal(result, 'immed');
        }
    },

    'A single result, with event loop': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                delayed(flow.add());

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.equal(result, 'delayed');
        }
    },

    'A single result, an array': {
        topic: function() {
            var self = this;

            asyncblock(function(flow){
                immedArray(flow.add());

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.deepEqual(result, [1, 2, 3]);
        }
    },

    'A single result, multiple values': {
        topic: function() {
            var self = this;

            asyncblock(function(flow){
                immedMultiple(flow.add());

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.deepEqual(result, [1, 2, 3]);
        }
    },

    'Two results': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                delayed(flow.add(1));
                immed(flow.add(2));

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.deepEqual(result, {
                1: 'delayed',
                2: 'immed'
            });
        }
    },

    'A timed test...': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                var startTime = new Date();

                setTimeout(flow.add(), 100);

                flow.wait();

                setTimeout(flow.add(), 110);

                flow.wait();

                self.callback(null, new Date() - startTime);
            });
        },

        'Should take more than 200 ms': function(time){
            assert.greater(time, 200);
        }
    },

    'Callbacks that fire immediately': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                immed(flow.add());

                flow.wait();

                immed(flow.add());

                flow.wait();

                self.callback();
            });
        },

        'Should not error': function(){
            assert.ok(true);
        }
    },

    "A mixture of callbacks that wait and don't": {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                immed(flow.add());

                flow.wait();

                immed(flow.add());

                flow.wait();

                delayed(flow.add());
                immed(flow.add());

                flow.wait();

                delayed(flow.add());

                flow.wait();

                immed(flow.add('b'));

                var endResult = flow.wait();

                self.callback(null, endResult);
            });
        },

        'Returns the right result': function(result){
            assert.equal(result.b, 'immed');
        }
    },

    "Three in parallel": {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                delayed(flow.add());
                delayed(flow.add('t2'));
                delayed(flow.add('t3'));

                var first = flow.wait();

                immed(flow.add());
                immed(flow.add());
                delayed(flow.add('t3'));

                var second = flow.wait();

                self.callback(null, {first: first, second: second});
            });
        },

        'Returns the right result': function(result) {
            assert.deepEqual(result.first, {
                t2: 'delayed',
                t3: 'delayed'
            });

            assert.deepEqual(result.second, {
                t3: 'delayed'
            });
        }
    },

    'Add a new task while waiting': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                delayedAdd(flow, flow.add('t5'));

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.deepEqual(result, {
                t5: 'delayedAdd',
                t2: 'delayed'
            });
        }
    },

    'When using a formatted result': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                delayed(flow.add(null, ['first']));

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Returns the right result': function(result){
            assert.deepEqual(result, {
                 first: 'delayed'
            });
        }
    },

    'When using formatted results': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                immedArray(flow.add(1, ['first']));
                delayed(flow.add(2, ['second']));
                var first = flow.wait();

                immedMultiple(flow.add(['one', 'two', 'three']));
                var second = flow.wait();

                self.callback(null, {first: first, second: second});
            });
        },

        'Returns the right result': function(result){

            assert.deepEqual(result.first, {
                1: {
                    first: [1, 2, 3]
                },
                2: {
                    second: 'delayed'
                }
            });

            assert.deepEqual(result.second, {
                one: 1,
                two: 2,
                three: 3
            });
        }
    },

    'Calling flow.wait when nothing has been added': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.wait();

                self.callback();
            });
        },

        'Should not error': function(){

        }
    },

    'maxParallel property limits the number of active fibers': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.maxParallel = 2; // limit to 2 parallel fibers

                sleepTest(350, flow.add('t350')); // adds first fiber and return immediately (fiber should sleep 350ms)
                sleepTest(200, flow.add('t200')); // adds second fiber and return immediately (fiber should sleep 200ms)
                sleepTest(100, flow.add('t100')); // should wait here until t200 finishes (fiber should sleep 100ms)

                var result = flow.wait();

                self.callback(null, result);
            });
        },

        'Should limit fibers': function(result){
            // t200 < t100 < t350
            assert.greater(result.t100, result.t200);
            assert.greater(result.t350, result.t100);
        }
    },

    'When running maxParallel in a loop': {
        topic: function(){
            var self = this;

            asyncblock(function(flow){
                flow.maxParallel = 10;

                for(var i = 0; i < 105; i++){
                    if(Math.random() > .5){
                        immed(flow.add(i));
                    } else {
                        delayed(flow.add(i));
                    }
                }

                var results = flow.wait();
                self.callback(null, results);
            });
        },

        'All tasks execute': function(results){
            for(var i = 0; i < 105; i++){
                if(!(i in results)) {
                    assert.fail();
                }
            }
        }
    }
});



suite.export(module);