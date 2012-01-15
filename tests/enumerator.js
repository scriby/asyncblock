var vows = require('vows');
var assert = require('assert');

var asyncblock = require('../asyncblock.js');

var suite = vows.describe('generator');

var echo = function(message, callback){
    process.nextTick(
        function(){
            callback(null, message);
        }
    );
};

suite.addBatch({
    'When executing a generator': {
        topic: function(){
            var self = this;
            var result = [];

            var inc = asyncblock.enumerator(function(flow){
                for(var i = 1; i <= 10; i++){
                    flow.yield(i);
                }
            });

            var i;
            while((i = inc())){
                result.push(i);
            }

            self.callback(null, result);
        },

        'The results are as expected': function(result){
            assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }
    },

    'When executing an async generator': {
        topic: function(){
            var self = this;
            var result = [];

            var inc = asyncblock.enumerator(function(flow){
                for(var i = 1; i <= 10; i++){
                    var num;
                    if(Math.random() < .5) {
                        echo(i, flow.add());
                        num = flow.wait();
                    } else {
                        num = i;
                    }

                    flow.yield(num);
                }
            });

            asyncblock(function(flow){
                while(inc.moveNext()){
                    result.push(inc.current);
                }

                self.callback(null, result);
            });

        },

        'The results are as expected': function(result){
            assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }
    }
});

suite.export(module);