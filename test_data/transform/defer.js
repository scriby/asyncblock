var asyncblock = require('asyncblock');
var utility = require('./utility.js');

exports.test1 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo.defer('test');

        callback(null, result);
    });
};

exports.test2 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo.defer('test');

        callback(null, result);
    });
};

exports.test3 = function(callback){
    asyncblock(function(flow){
        var result;
        result = utility.echo.defer('asdf');

        result = 'test';

        callback(null, result);
    });
};

exports.test4 = function(callback){
    asyncblock(function(flow){
        var result = utility.echo.defer('test');

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
            result = utility.echo.defer('test');
        };

        test();

        callback(null, result);
    });
};