require('fibers');

module.exports = function(fn) {
    var flow = {};

    var buffers = {};
    var lights = {};

    // the fiber
	var fiber = Fiber(function() {
		try {
			fn(flow);
		} catch(e) {
			// throw in next tick so the context matches again if yielded.
			process.nextTick(function() {
				throw e;
			});
		}
	});

    var parallelCount = 0;
    var parallelFinished = 0;
    
    flow.add = function(key){
        parallelCount++;
        lights[key] = true;

        return function(){
            parallelFinished++;

            var args = Array.prototype.slice.call(arguments);

            args.key = key;

            if(key == null){
                //If no key is set, we don't care about tracking the result
                fiber.run(args);
            } else if (lights[key]) {
                // green called on green.
                // an async functions might call its callback before red() was called.
                // so buffer its answer for call of red.
                if (buffers[key] != null) {
                    throw new Error('Key ' + key + ' is in use');
                }
                buffers[key] = args;
            } else {
                lights[key] = true;

                fiber.run(args);
            }
        };
    };
    
	flow.wait = function() {
        var greenArgs = {};

        if(parallelCount > 0){
            while(parallelFinished < parallelCount){
                //Reset lights every time through the loop such that new async callbacks can be added
                lights = {};
                
                var ret = Fiber.yield();
                greenArgs[ret.key] = ret;
            }

            Object.keys(buffers).forEach(function(bufferKey){
                greenArgs[bufferKey] = buffers[bufferKey];
            });

            //Not supporting the fancy red args for now
            var returnValue = {};

            Object.keys(greenArgs).forEach(function(key){
                var greenArg = greenArgs[key];

                if(greenArg[0]){
                    throw new Error(greenArg[0]);
                }

                if(greenArg.length > 2){
                    returnValue[key] = greenArg.slice(1);
                } else {
                    returnValue[key] = greenArg[1];
                }
            });

            //Prepare for the next run
            parallelFinished = 0;
            parallelCount = 0;
            buffers = {};
            lights = {};

            return returnValue;
        } else {
            return;
        }
	};

	fiber.run();
}
