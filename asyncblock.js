require('fibers');

module.exports = function(fn) {
    var flow = {};

    var returnValue = {};
    var light = true;
    var errorCallbackCalled = false;

	var fiber = Fiber(function() {
		try {
			fn(flow);
		} catch(e) {
            if(flow.errorCallback){
                if(!errorCallbackCalled){
                    errorCallbackCalled = true;

                    flow.errorCallback(e);
                }
            } else {
                throw e;
            }
		} finally {
            //Prevent memory leak
            fn = null;
            fiber = null;
        }
	});

    var parallelCount = 0;
    var parallelFinished = 0;
    
    flow.add = function(key, responseFormat){
        //Support single argument of responseFormat
        if(key instanceof Array){
            responseFormat = key;
            key = null;
        }

        parallelCount++;
        
        return function(){
            parallelFinished++;

            var args = Array.prototype.slice.call(arguments);

            if(parallelCount === 1 && key == null){
                key = '__defaultkey__';
            }

            args.key = key;
            args.responseFormat = responseFormat;

            if (light) {
                if(key != null){
                    returnValue[key] = resultHandler(args);
                }
            } else {
                light = true;

                fiber.run(args);
            }
        };
    };

    var errorHandler = function(ret){
        if(ret[0]){
            //Make sure we don't call the error callback more than once
            if(!errorCallbackCalled){
                errorCallbackCalled = true;
                var err;

                if(typeof ret[0] === 'string'){
                    err = ret[0];
                } else if(ret[0] instanceof Error) {
                    //Append the stack
                    err = ret[0];
                    err.stack += '\n=== Pre-async stack ===\n' + (new Error()).stack;
                }

                //If the errorCallback property was set, report the error
                if(flow.errorCallback){
                    flow.errorCallback(err);

                    fn = null;
                    fiber = null;
                }

                //Prevent the rest of the code in the fiber from running
                throw err;
            }
        }
    };

    var resultHandler = function(ret){
        errorHandler(ret);

        var responseFormat = ret.responseFormat;
        if(responseFormat instanceof Array) {
            return convertResult(ret, responseFormat);
        } else {
            if(ret.length > 2){
                return ret.slice(1);
            } else {
                return ret[1];
            }
        }
    };

    var convertResult = function(ret, responseFormat){
        var formatted = {};

        if(ret instanceof Array){
            var min = Math.min(ret.length - 1, responseFormat.length);

            for(var i = 0; i < min; i++) {
                formatted[responseFormat[i]] = ret[i + 1];
            }
        } else {
            formatted[responseFormat[0]] = ret;
        }

        return formatted;
    };

	flow.wait = function() {
        if(parallelCount > 0){
            //Not supporting the fancy red args for now

            while(parallelFinished < parallelCount){
                //Reset lights every time through the loop such that new async callbacks can be added
                light = false;

                var ret = Fiber.yield();

                var val = resultHandler(ret);
                if(ret.key != null){
                    returnValue[ret.key] = val;
                }
            }

            var toReturn;

            //If add was called once and no parameter name was set, just return the value as is
            if(parallelCount === 1 && '__defaultkey__' in returnValue) {
                toReturn = returnValue.__defaultkey__;
            } else {
                delete returnValue.__defaultkey__;

                toReturn = returnValue;
            }

            //Prepare for the next run
            parallelFinished = 0;
            parallelCount = 0;
            returnValue = {};

            return toReturn;
        }
	};

	fiber.run();
};
