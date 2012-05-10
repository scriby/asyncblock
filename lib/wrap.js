var asyncblock = require('./asyncblock.js');
var Future = require('./future.js').Future;
var Fiber = require('fibers');

asyncblock.wrap = function(obj){
    if(!obj.__asyncblock_wrapper){
        //Add a non-enumerable cache property as creating the wrapper takes some time
        Object.defineProperty(obj, '__asyncblock_wrapper', {
            get: function(){
                return wrapper;
            },

            enumerable: false //This is currently the default, but set it just incase
        });
    } else {
        return obj.__asyncblock_wrapper;
    }

    var wrapper = { sync: {}, future: {} };

    for(var key in obj){
        (function(key){
            var func = obj[key];

            if(typeof func === 'function'){
                wrapper.future[key] = function(){
                    var args = Array.prototype.slice.call(arguments);

                    var fiber = Fiber.current;
                    var flow = fiber._asyncblock_flow;

                    if(flow == null){
                        fiber = null;

                        throw new Error('Asyncblock sync methods must be called from within an asyncblock.');
                    }

                    var key = flow._getNextTaskId();
                    var callback;

                    var options = wrapper._options || {};

                    options.key = key;
                    options.dontWait = true;

                    callback = flow.add(options);
                    wrapper._options = null;

                    args.push(function(){
                        callback.apply(null, arguments);

                        //This is in a textTick to handle the case where an async function calls its callback immediately.
                        process.nextTick(function(){
                            fiber = null;
                            flow = null;
                        });
                    });

                    func.apply(obj, args);

                    var future = new Future(flow, key);

                    return future;
                };

                wrapper.sync[key] = function(){
                    var future = wrapper.future[key].apply(null, arguments);

                    return future.result;
                };

                //Copy all functions to the wrapper so they're available
                wrapper[key] = function(){
                    return func.apply(obj, arguments);
                };
            } else {
                //Copy non-functions so they're available also
                wrapper[key] = obj[key];
            }
        })(key);
    }

    wrapper.syncOptions = function(opts){
        wrapper._options = opts;

        return wrapper.sync;
    };

    wrapper.futureOptions = function(opts){
        wrapper._options = opts;

        return wrapper.future;
    };

    return wrapper;
};
