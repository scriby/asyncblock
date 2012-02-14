var asyncblock = require('asyncblock');
var utility = require('./utility.js');

exports.test1 = function(callback){
    asyncblock(function(flow){
        var future = utility.echo('test').future();

        callback(null, future.result);
    });
};

exports.test2 = function(callback){
    asyncblock(function(flow){
        var future;
        future = utility.echo('test').future();

        callback(null, future.result);
    });
};

exports.test3 = function(callback){
    asyncblock(function(flow){
        var future;
        future = ((utility.echo('asdf'))).future();

        future.result = 'test';

        callback(null, future.result);
    });
};

exports.test4 = function(callback){
    asyncblock(function(flow){
        var future = utility.echo('test').future();

        var test = function(result){
            return result;
        };

        callback(null, test(future.result));
    });
};

exports.test5 = function(callback){
    asyncblock(function(flow){
        var future;

        var test = function(){
            future = utility.echo('test').future();
        };

        test();

        callback(null, future.result);
    });
};

exports.test6 = function(callback){
    asyncblock(function(flow){
        var future = utility.echoImmed('test').future(['message']);

        callback(null, future.result.message);
    });
};

exports.test7 = function(callback){
    asyncblock(function(flow){
        var test = function(){
            return utility.echo('test').future();
        };

        callback(null, test().result);
    });
};