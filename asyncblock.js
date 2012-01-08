require('fibers');
var events = require('events');
var util = require('util');

var cachedFiber;

var Flow = function(fiber) {
    this._parallelCount = 0;
    this._parallelFinished = 0;

    this._fiber = fiber;

    this._taskQueue = [];
    this._forceWait = false;

    this._light = true;
    this._returnValue = {};

    this._errorCallbackCalled = false;
    this.errorCallback = null;

    this.taskTimeout = null;
    this.timeoutIsError = null;

    this._originalStack = null;

    // max number of parallel tasks. maxParallel <= 0 means no limit
    this.maxParallel = 0;
};

util.inherits(Flow, events.EventEmitter);

// returns the number of currently running fibers
Flow.prototype.__defineGetter__("unfinishedCount", function(){
    return this._parallelCount - this._parallelFinished;
});

var callbackHandler = function(self, task){
    if(self.taskTimeout != null && task.timeout == null){
        task.timeout = self.taskTimeout;
    }

    if(self.timeoutIsError != null && task.timeoutIsError == null){
        task.timeoutIsError = self.timeoutIsError;
    }

    var callbackCalled = false;

    task.callback = function taskCallback(){
        var args = Array.prototype.slice.call(arguments);

        if(callbackCalled){
            if(task.timedOut) {
                return; //If the task timed out, it's likely the callback will be called twice. Once by the timeout code, and once by the task when it eventually finishes
            } else {
                throw new Error('Task (' + task.key + ') callback called twice!');
            }
        }

        callbackCalled = true; //Prevent this callback from getting called again

        if(task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        self._parallelFinished++;

        if(self._parallelCount === 1 && task.key == null){
            task.key = '__defaultkey__';
        }

        task.result = args;
        var val = resultHandler(self, task);

        if(task.key != null){
            self._returnValue[task.key] = val;
        }

        if(self._light === false) {
            task.resultWasAsync = true;

            self._light = true;
            self._fiber.run(task);
        } else {
            task.resultWasAsync = false;

            errorHandler(self, task);
        }
    };

    if(task.timeout != null){
        task.timeoutId = setTimeout(
            function(){
                var runtime = (new Date()) - task.startTime;

                task.timedOut = true;
                var timeoutError = new Error('Timeout exceeded for task (' + task.key + ') after ' + runtime + 'ms');
                timeoutError.taskTimedOut = true;
                timeoutError.taskRunTime = runtime;

                task._flow.emit('taskTimeout', { key: task.key, runtime: runtime });

                if(task.timeoutIsError == null || task.timeoutIsError === true) {
                    task.callback(timeoutError);
                } else {
                    task.callback();
                }
            },

            task.timeout
        );
    }

    task.startTime = new Date();

    return task.callback;
};

var addTask = function(self, task){
    task._flow = self;

    while (self.maxParallel > 0 && self.unfinishedCount >= self.maxParallel) {
        // too many fibers running.  Yield until the fiber count goes down.
        yieldFiber(self);
    }

    self._parallelCount++;

    return callbackHandler(self, task);
};

var parseAddArgs = function(key, responseFormat){
    var timeout;
    var timeoutIsError;

    //Support single argument of responseFormat
    if(key instanceof Array){
        responseFormat = key;
        key = null;
    } else if(Object.prototype.toString.call(key) === '[object Object]') {
        //Support single argument object property bag
        var obj = key;
        key = obj.key;
        responseFormat = obj.responseFormat;
        timeout = obj.timeout;
        timeoutIsError = obj.timeoutIsError;
    }

    return {
        key: key,
        responseFormat: responseFormat,
        timeout: timeout,
        timeoutIsError: timeoutIsError
    };
};

Flow.prototype.add = Flow.prototype.callback = function(key, responseFormat){
    var task = parseAddArgs(key, responseFormat);
    task.ignoreError = false;

    return addTask(this, task);
};

Flow.prototype.addIgnoreError = Flow.prototype.callbackIgnoreError = function(key, responseFormat) {
    var task = parseAddArgs(key, responseFormat);
    task.ignoreError = true;

    return addTask(this, task);
};

var runTaskQueue = function(self){
    //Check if there are any new queued tasks to add
    while(self._taskQueue.length > 0) {
        var firstTask = self._taskQueue.splice(0, 1)[0];

        firstTask.toExecute(addTask(self, firstTask));
    }
};

// Yields the current fiber and adds the result to the resultValue object
var yieldFiber = function(self) {
    self._light = false;
    var task = Fiber.yield();

    errorHandler(self, task);
};

var errorHandler = function(self, task){
    if(task != null && task.result && task.result[0]){
         if(!task.ignoreError) {
            if(!self._errorCallbackCalled){
                self._errorCallbackCalled = true;

                if(task.resultWasAsync) {
                    var err = new Error();
                    Error.captureStackTrace(err, self.wait);

                    //Append the stack from the fiber, which indicates which wait call failed
                    task.error.stack += '\n=== Pre-async stack ===\n' + err.stack;
                }

                if(self._originalStack != null){
                    task.error.stack += '\n=== Pre-asyncblock stack ===\n' + self._originalStack;
                }

                //If the errorCallback property was set, report the error
                if(self.errorCallback){
                    self.errorCallback(task.error);
                }

                fn = null;
                fiber = null;

                //Prevent the rest of the code in the fiber from running
                throw task.error;
            }
        }
    }
};

var errorParser = function(self, task) {
    if(task.result && task.result[0]){
        //Make sure we don't call the error callback more than once
        var err;

        if(!(task.result[0] instanceof Error)){
            err = new Error(task.result[0]);
            Error.captureStackTrace(err, task.callback);
        } else {
            err = task.result[0];
        }

        task.error = err;

        if(task.ignoreError){
            //If ignoring the error, return it so it may be dealt with
            if(task.key == null){
                task.key = '_!_error_!_';
            }

            return err;
        }

        return err;
    }
};

var resultHandler = function(self, task){
    if(task == null){
        return null;
    }

    //If the task is ignoring errors, we return the error
    var error = errorParser(self, task);

    if(error != null){
        return error;
    }

    if(task.responseFormat instanceof Array) {
        return convertResult(task.result, task.responseFormat);
    } else {
        return task.result[1];
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

var shouldYield = function(self) {
    return self._parallelFinished < self._parallelCount || self._forceWait || self._taskQueue.length > 0;
};

var parseQueueArgs = function(key, responseFormat, toExecute){
    var timeout;
    var timeoutIsError;

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

    if(Object.prototype.toString.call(key) === '[object Object]'){
        var obj = key;

        key = obj.key;
        responseFormat = obj.responseFormat;
        //toExecute would be set from if block above
        timeout = obj.timeout;
        timeoutIsError = obj.timeoutIsError;
    }

    return {
        key: key,
        responseFormat: responseFormat,
        toExecute: toExecute,
        timeout: timeout,
        timeoutIsError: timeoutIsError
    };
};

var queue = function(self, task){
    self._taskQueue.push(task);

    if(!self._light){
        self._light = true;
        self._fiber.run();
    }
};

Flow.prototype.queue = function(key, responseFormat, toExecute) {
    var task = parseQueueArgs(key, responseFormat, toExecute);
    task.ignoreError = false;

    queue(this, task);
};

Flow.prototype.queueIgnoreError = function(key, responseFormat, toExecute){
    var task = parseQueueArgs(key, responseFormat, toExecute);
    task.ignoreError = true;

    queue(this, task);
};

var wait = function(self) {
    //The task queue needs to be drained before checking if we should yield, in the case that all the tasks in the queue finish without going async
    runTaskQueue(self);

    while(shouldYield(self)){
        yieldFiber(self);

        //The task queue needs to be drained again incase something else was added after the yield
        runTaskQueue(self);
    }

    var toReturn;

    //If add was called once and no parameter name was set, just return the value as is
    if(self._parallelCount === 1 && '__defaultkey__' in self._returnValue) {
        toReturn = self._returnValue.__defaultkey__;
    } else {
        delete self._returnValue.__defaultkey__;

        toReturn = self._returnValue;
    }

    if(toReturn != null && toReturn['_!_error_!_'] != null){
        toReturn = toReturn['_!_error_!_'];
    }

    //Prepare for the next run
    self._parallelFinished = 0;
    self._parallelCount = 0;
    self._returnValue = {};

    return toReturn;
};

var parseSyncArgs = function(args){
    var applyBegin, toExecute, options;

    if(typeof args[0] === 'function'){
        toExecute = args[0];
        applyBegin = 1;
    } else if(typeof args[1] === 'function'){
        options = args[0];
        toExecute = args[1];
        applyBegin = 2;
    }

    return {
        toExecute: toExecute,
        options: options,
        toApply: Array.prototype.slice.call(args, applyBegin)
    };
};

Flow.prototype.sync = function(options, toExecute/*, apply*/){
    var task = parseSyncArgs(arguments);
    task.key = Math.random();

    var callback = this.add(task);
    task.toApply.push(callback);

    task.toExecute.apply(task.self, task.toApply);

    return this.wait(task.key);
};

var waitForKey = function(self, key){
    while(!self._returnValue.hasOwnProperty(key)) {
        yieldFiber(self);
    }

    var result = self._returnValue[key];

    //Clean up
    delete self._returnValue[key];
    self._parallelCount--;
    self._parallelFinished--;

    return result;
};

Flow.prototype.wait = function(key) {
    if(key != null){
        return waitForKey(this, key);
    } else {
        return wait(this);
    }
};

Flow.prototype.forceWait = function() {
    this._forceWait = true;

    return wait(this);
};

Flow.prototype.doneAdding = function(){
    if(!this._forceWait) {
        throw new Error('doneAdding should only be called in conjunction with forceWait');
    }

    this._forceWait = false;

    //If currently yielding, need to run again
    if(!this._light) {
        this._light = true;
        this._fiber.run();
    }
};

//Chained syntax
var FuncChain = function(flow){
    this._flow = flow;

    this._toExecute = null;
    this._args = [];
    this._self = null;
    this._options = {};
};

FuncChain.prototype.sync = function(){
    var future = this.future();

    return future.result;
};

FuncChain.prototype.future = function(){
    var key = Math.random();
    this._options.key = key;
    if(this._options.self == null){
        this._options.self = this._self;
    }

    var args = this._args;
    args.push(this._flow.add(this._options));

    //If func is specified as a string, lookup the actual function
    if(typeof this._toExecute === 'string' && this._options.self != null){
        this._toExecute = this._options.self[this._toExecute];
    }

    this._toExecute.apply(this._options.self, args);

    return new Future(this._flow, key);
};

FuncChain.prototype.self = function(self){
    this._self = self;

    return this;
};

FuncChain.prototype.options = function(options){
    this._options = options;

    return this;
};

FuncChain.prototype.args = function(){
    this._args = Array.prototype.slice.call(arguments);

    return this;
};

Flow.prototype.func = function(toExecute){
    var chain = new FuncChain(this);
    chain._toExecute = toExecute;

    return chain;
};

var asyncblock = function(fn, options) {
    var fiber = Fiber.current;

    var originalStack;
    if(options != null && options.stack != null){
        originalStack = options.stack;
    }

    var fiberContents = function() {
        var flow = new Flow(fiber);
        if(originalStack != null){
            flow._originalStack = originalStack;
        }

        var originalFlow = fiber._asyncblock_flow;
        fiber._asyncblock_flow = flow;

        try {
            fn(flow);
        } catch(e) {
            if(flow.errorCallback){
                if(!flow._errorCallbackCalled){
                    flow._errorCallbackCalled = true;

                    flow.errorCallback(e);
                }
            } else {
                process.nextTick(function(){
                    throw e; //If the error is thrown outside of the nextTick, it doesn't seem to have any effect
                });
            }
        } finally {
            fiber._asyncblock_flow = originalFlow;//Reset this value incase this is a nested fiber

            //Prevent memory leak
            fn = null;
            fiber = null;
        }
    };

    if(fiber != null){
        //If this code is already running in a fiber, we don't need to make a new one
        fiberContents();
    } else {
        fiber = Fiber(fiberContents);
        fiber.run();
    }
};

module.exports = function(fn){
    asyncblock(fn);
};

module.exports.fullstack = function(fn){
    var err = new Error();
    Error.captureStackTrace(err, this.fullstack);

    asyncblock(fn, { stack: err.stack });
};

var Future = function(flow, key){
    this._flow = flow;
    this._key = key;

    this._result = null;
    this._resultObtained = false;
};

Future.prototype.__defineGetter__("result", function(){
    if(this._resultObtained === false){
        this._result = this._flow.wait(this._key);
        this._resultObtained = true;
    }

    return this._result;
});

module.exports.wrap = function(obj){
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

                    var key = Math.random();
                    var callback;
                    if(wrapper._options != null){
                        wrapper._options.key = key;

                        callback = flow.add(wrapper._options);
                        wrapper._options = null;
                    } else {
                        callback = flow.add(key);
                    }

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