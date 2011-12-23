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

    var taskQueue = [];

    var parallelCount = 0;
    var parallelFinished = 0;

    // max number of parallel fibers. maxParallel <= 0 means no limit
    flow.maxParallel = 0;

    // returns the number of currently running fibers
    Object.defineProperty(flow, 'unfinishedCount', {
        get: function() {
            return parallelCount - parallelFinished;
        }
    });

    var forceWait = false;

    var shouldYield = function() {
        return parallelFinished < parallelCount || forceWait || taskQueue.length > 0;
    };

    flow.add = flow.callback = function(key, responseFormat){
        //Support single argument of responseFormat
        if(key instanceof Array){
            responseFormat = key;
            key = null;
        }

        while (flow.maxParallel > 0 && flow.unfinishedCount >= flow.maxParallel) {
            // too many fibers running.  Yield until the fiber count goes down.
            yieldFiber();
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

    flow.queue = function(key, responseFormat, toExecute) {
        //Support single argument of responseFormat
        if(key instanceof Array){
            responseFormat = key;
            key = null;
        }

        if(typeof key === 'function') {
            toExecute = key;
            key = null;
        } else if(typeof responseFormat === 'function') {
            toExecute = responseFormat;
            responseFormat = null;
        }

        taskQueue.push({
            key: key,
            responseFormat: responseFormat,
            toExecute: toExecute
        });

        if(!light){
            light = true;
            fiber.run();
        }
    };

    var errorHandler = function(ret){
        if(ret && ret[0]){
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
        if(ret == null){
            return ret;
        }

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

    var runTaskQueue = function(){
        //Check if there are any new queued tasks to add
        while(taskQueue.length > 0) {
            var firstTask = taskQueue.splice(0, 1)[0];

            firstTask.toExecute(flow.add(firstTask.key, firstTask.responseFormat));
        }
    };

    // Yields the current fiber and adds the result to the resultValue object
    var yieldFiber = function() {
        runTaskQueue();

        light = false;
        var ret = Fiber.yield();

        if(ret != null) {
            var val = resultHandler(ret);
            if(ret.key != null){
                returnValue[ret.key] = val;
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

    var wait = function() {
        while(shouldYield()){
            yieldFiber();
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
    };

    flow.wait = function() {
        return wait();
    };
    
    flow.forceWait = function() {
        forceWait = true;

        return wait();
    };

    flow.doneAdding = function(){
        if(!forceWait) {
            throw new Error('doneAdding should only be called in conjunction with forceWait');
        }

        forceWait = false;

        //If currently yielding, need to run again
        if(!light) {
            light = true;
            fiber.run();
        }
    };

    fiber.run();
};
