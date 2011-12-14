require('fibers');

module.exports = function(fn) {
    var flow = {};

    var returnValue = {};
    var light = true;
    var errorCallbackCalled = false;

    // the fiber
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
    
    flow.add = function(key){
        parallelCount++;
        
        return function(){
            parallelFinished++;

            var args = Array.prototype.slice.call(arguments);

            if(parallelCount === 1 && key == null){
                key = '__defaultkey__';
            }

            args.key = key;

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
                //If the errorCallback property was set, report the error
                if(flow.errorCallback){
                    process.nextTick(function(){
                        flow.errorCallback(ret[0]);
                    })
                }
            }

            throw new Error(ret[0]);
        }
    };

    var resultHandler = function(ret){
        errorHandler(ret);

        if(ret.length > 2){
            return ret.slice(1);
        } else {
            return ret[1];
        }
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
