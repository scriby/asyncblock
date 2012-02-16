var asyncblock = require('asyncblock');
var utility = require('./utility.js');

exports.test1 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo('test').sync();

        callback(null, result);
    });
};

exports.test2 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo('test').sync();

        callback(null, result);
    });
};

exports.test3 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo('asdf').sync();

        result = 'test';

        callback(null, result);
    });
};

exports.test4 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo('test').sync();

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
            result = utility.echo('test').sync(['message']);
        };

        test();

        callback(null, result.message);
    });
};

exports.test6 = function(callback){
    asyncblock(function(flow){
        var result = utility.echoImmed('test').sync();

        callback(null, result);
    });
};

exports.test7 = function(callback){
    asyncblock(function(flow){
        flow.errorCallback = function(err){
            callback(null, err.message);
        };

        var result = utility.error('test').sync();

        callback(null, result);
    });
};

exports.test8 = function(callback){
    asyncblock(function(flow){
        flow.errorCallback = function(err){
            callback(null, err.message);
        };

        var result = utility.errorImmed('test').sync();

        callback(null, result);
    });
};