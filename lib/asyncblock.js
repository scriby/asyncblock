/*jshint newcap: false */
//newcap allows fiber = Fiber(fiberContents);

var Flow = require('./flow.js').Flow;
var enumerator = require('./enumerator.js');
var transform = require('./transform.js');

var asyncblock = function(fn, options) {
    if(options == null){
        options = {};
    }

    var originalError;
    if(options.stack != null){
        originalError = options.stack;
    }

    if(Fiber.current != null){
        var parentFlow = Fiber.current._asyncblock_flow;
    }

    var fiber;

    var flow = new Flow();

    var fiberContents = function() {
        flow._fiber = fiber;
        flow._parentFlow = parentFlow;

        if(options.isGenerator){
            flow._isGenerator = true;
        }

        if(originalError != null){
            flow._originalError = originalError;
        }

        fiber._asyncblock_flow = flow;

        try {
            fn(flow);
        } catch(e) {
            if(!e.__asyncblock_caught) {
                var curr = flow;
                while(curr != null){
                    if(curr._originalError){
                        e.stack += '\n=== Pre-asyncblock stack ===\n' + curr._originalError.stack;
                    }

                    curr = curr._parentFlow;
                }
            }

            e.__asyncblock_caught = true;

            if(flow.errorCallback){
                //Make sure we haven't already passed this error to the errorCallback
                if(!e.__asyncblock_handled) {
                    e.__asyncblock_handled = true;
                    flow.errorCallback(e);
                }
            } else {
                process.nextTick(function(){
                    throw e; //If the error is thrown outside of the nextTick, it doesn't seem to have any effect
                });
            }
        } finally {
            flow.emit('end');

            //Prevent memory leak
            fn = null;
            fiber = null;
            flow = null;
        }
    };

    fiber = Fiber(fiberContents);

    if(options.isGenerator){
        return enumerator.getEnumerator(flow, fiber);
    } else {
        fiber.run();
    }
};

module.exports = function(fn, options){
    //Capture stack trace by defaultrequire('./lib/transform.js');
    var err = new Error();
    //Currently not capturing stack trace as it's about 60% slower than just making the error (and just takes 1 frame off stack trace)
    //Error.captureStackTrace(err, module.exports);

    if(options == null){
        options = {};
    }

    options.stack = err;

    asyncblock(fn, options);
};

module.exports.enumerator = function(fn){
    var run = asyncblock(fn, { isGenerator: true });

    return run;
};

module.exports.enableTransform = function(mod){
    var notEnabled = transform.enableTransform();

    if(notEnabled && mod){
        delete require.cache[mod.filename];
        mod.exports = require(mod.filename);
    }

    return notEnabled;
};

module.exports.fullstack = module.exports;

module.exports.nostack = function(fn){
    asyncblock(fn);
};
