exports.echo = function(message, callback){
    process.nextTick(function(){
        callback(null, message);
    });
};