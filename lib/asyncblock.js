/*jshint newcap: false */
//newcap allows fiber = Fiber(fiberContents);

var Flow = require('./flow.js').Flow;
var enumerator = require('./enumerator.js');
var transform = require('./transform.js');
var Fiber = require('fibers');

var asyncblock = function(fn, done, options) {
    if(options == null){
        options = {};
    }

    var originalError;
    if(options.stack != null){
        originalError = options.stack;
    }

    var currFiber = Fiber.current;
    var parentFlow;
    if(currFiber != null){
        parentFlow = currFiber._asyncblock_flow;
    }

    var fiber;

    var flow = new Flow();
    flow.errorCallback = done;

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
            var result = fn(flow);

            if(done){
                done(null, result);
            }
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

    if(currFiber && currFiber._asyncblock_reuseFiber && !options.isGenerator){
        currFiber = null; //It's important to null out references to Fiber.current

        fiber = parentFlow._fiber;
        fiberContents();
    } else {
        currFiber = null; //It's important to null out references to Fiber.current

        fiber = Fiber(fiberContents);

        if(options.isGenerator){
            var enumer = enumerator.getEnumerator(flow, fiber);

            enumer.events.once('end', function(){
                fn = null;
                fiber = null;
                flow = null;
            });

            return enumer;
        } else {
            fiber.run();
        }
    }
};

module.exports = function(fn, done, options){
    //Capture stack trace by default
    var err = new Error();
    //Currently not capturing stack trace as it's about 60% slower than just making the error (and just takes 1 frame off stack trace)
    //Error.captureStackTrace(err, module.exports);

    if(options == null){
        options = {};
    }

    options.stack = err;

    asyncblock(fn, done, options);
};

module.exports.enumerator = function(fn){
    var run = asyncblock(fn, null, { isGenerator: true });

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

module.exports.compileContents = transform.compileContents;

module.exports.fullstack = module.exports;

module.exports.nostack = function(fn, done){
    asyncblock(fn, done);
};

module.exports.getCurrentFlow = function(){
    var currFiber = Fiber.current;
    if(currFiber){
        var currFlow = currFiber._asyncblock_flow;
        currFiber = null;

        return currFlow;
    }
};
