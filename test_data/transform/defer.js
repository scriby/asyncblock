var asyncblock = require('asyncblock');
var utility = require('./utility.js');

exports.test1 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo('test').defer();

        callback(null, result);
    });
};

exports.test2 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo('test').defer();

        callback(null, result);
    });
};

exports.test3 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo('asdf').defer();

        result = 'test';

        callback(null, result);
    });
};

exports.test4 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo('test').defer();

        var test = function(result){
            return result;
        };

        callback(null, test(result));
    });
};

exports.test5 = function(callback){
    asyncblock(function(flow){
        var result;

        var test = function(){
            result = utility.echo('test').defer();
        };

        test();

        callback(null, result);
    });
};

exports.test6 = function(callback){
    asyncblock(function(flow){
        var result = utility.echoImmed('test').defer();

        callback(null, result);
    });
};

exports.test7 = function(callback){
    asyncblock(function(flow){
        var test = function(){
            return utility.echo('test').defer();
        };

        callback(null, test());
    });
};