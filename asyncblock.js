require('fibers');
var events = require('events');
var util = require('util');

var cachedFiber;

var Flow = function(fiber) {
    this._parallelCount = 0; //The number of currently active tasks
    this._parallelFinished = 0; //The number of finished tasks since the last call to wait

    this._fiber = fiber; //A reference to the fiber

    this._taskQueue = []; //A placeholder for queued tasks
    this._forceWait = false; //Internal state that indicates that the fiber should yield until doneAdding is called

    this._light = true; //Determines whether the fiber is currently running or not. true = running
    this._finishedTasks = {}; //Buffers information about finished tasks until results are requested

    this._errorCallbackCalled = false; //Internal state keeping track of whether we've called the error callback or not. We don't want to call it twice.
    this.errorCallback = null; //Call this function when an error occurs

    this.taskTimeout = null; //Number of milliseconds the task may run for. Null means no limit.
    this.timeoutIsError = null; //If a timeout should be treated as an error, or if the task should simply be aborted and flow continue.

    this._originalStack = null; //Used to store the stack at the time of asyncblock creation

    this.maxParallel = 0; // max number of parallel tasks. maxParallel <= 0 means no limit
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

        if(!task.dontWait) {
            self._parallelFinished++;
        }

        if(self._parallelCount === 1 && task.key == null){
            task.key = '__defaultkey__';
        }

        task.result = args;
        var val = resultHandler(self, task);

        if(task.key != null){
            task.formattedResult = val;
        }

        if(task.key != null){
            self._finishedTasks[task.key] = task;
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

    if(!task.dontWait){
        self._parallelCount++;
    }

    return callbackHandler(self, task);
};

var parseAddArgs = function(key, responseFormat){
    var timeout;
    var timeoutIsError;
    var dontWait = false;
    var ignoreError = false;

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
        dontWait = obj.dontWait;
        ignoreError = obj.ignoreError;
    }

    return {
        key: key,
        responseFormat: responseFormat,
        timeout: timeout,
        timeoutIsError: timeoutIsError,
        dontWait: dontWait,
        ignoreError: ignoreError
    };
};

Flow.prototype.add = Flow.prototype.callback = function(key, responseFormat){
    var task = parseAddArgs(key, responseFormat);

    return addTask(this, task);
};

Flow.prototype.set = function(key, responseFormat) {
    var task = parseAddArgs(key, responseFormat);
    task.dontWait = true; //Don't include in results in flow.wait() is called

    if(task.key == null){
        throw new Error('Key is missing');
    }

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
        var task = self._taskQueue.splice(0, 1)[0];

        if(typeof task.toApply !== 'undefined') {
            var toApply = task.toApply.concat(addTask(self, task));
            task.toExecute.apply(task.self, toApply);
        } else {
            task.toExecute(addTask(self, task));
        }
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
            //If ignoring the error, make sure it has a key so the return value (the error) gets stored
            if(task.key == null){
                task.key = '_!_error_!_';
            }
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
    var ignoreError = false;

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
        ignoreError = obj.ignoreError;
    }

    return {
        key: key,
        responseFormat: responseFormat,
        toExecute: toExecute,
        timeout: timeout,
        timeoutIsError: timeoutIsError,
        ignoreError: ignoreError
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
    if(self._parallelCount === 1 && '__defaultkey__' in self._finishedTasks) {
        toReturn = self._finishedTasks.__defaultkey__.formattedResult;

        delete self._finishedTasks.__defaultkey__;
    } else {
        delete self._finishedTasks.__defaultkey__;

        toReturn = {};

        Object.keys(self._finishedTasks).forEach(function(key){
            var task = self._finishedTasks[key];

            if(!task.dontWait) {
                toReturn[key] = task.formattedResult;
                delete self._finishedTasks[key];
            }
        });
    }

    if(toReturn != null && toReturn['_!_error_!_'] != null){
        toReturn = toReturn['_!_error_!_'];
    }

    //Prepare for the next run
    self._parallelFinished = 0;
    self._parallelCount = 0;

    return toReturn;
};

var waitForKey = function(self, key){
    runTaskQueue(self); //Task queue must be run here first in case the task calls the callback immediately

    while(!self._finishedTasks.hasOwnProperty(key)) {
        yieldFiber(self);

        runTaskQueue(self); //Run queued tasks in case we're waiting on any of them
    }

    var task = self._finishedTasks[key];

    if(task && !task.dontWait) {
        self._parallelCount--;
        self._parallelFinished--;
    }

    return task.formattedResult;
};

Flow.prototype.wait = function(key) {
    if(key != null){
        var result =  waitForKey(this, key);

        //Clean up
        delete this._finishedTasks[key];

        return result;
    } else {
        return wait(this);
    }
};

Flow.prototype.get = function(key){
    if(key == null){
        throw new Error('key is missing');
    }

    return waitForKey(this, key);
};

Flow.prototype.del = function(key){
    delete this._finishedTasks[key];
};

Flow.prototype.forceWait = function() {
    this._forceWait = true;

    return wait(this);
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
    this._args = this._unsetArgs =  [];
    this._self = null;
    this._options = {};
    this._key = null;
};

Flow.prototype.func = function(toExecute){
    var chain = new FuncChain(this);
    chain._toExecute = toExecute;

    var func = function(){
        //Persist the "this" context in case this is getting called through .call or .apply
        if(chain._self == null) {
            func.self(this);
        }

        //If args were never set, use the args passed to the current call
        if(chain._args === chain._unsetArgs){
            func.args.apply(func, arguments);
        }

        return func.sync();
    };

    func.self = function(self){
        chain._self = self;

        return func;
    };

    func.options = function(options){
        chain._options = options;

        return func;
    };

    func.args = function(){
        chain._args = Array.prototype.slice.call(arguments);

        return func;
    };

    func.key = function(key){
        chain._key = key;

        return func;
    };

    func.queue = function(){
        if(chain._args === chain._unsetArgs){
            func.args.apply(func, arguments); //If args not specified, use current
        }

        var task = {};
        task.key = chain._key;
        task.self = chain._options.self = chain._self;
        task.toApply = chain._args;
        task.timeout = chain._options.timeout;
        task.timeoutIsError = chain._options.timeoutIsError;
        task.responseFormat = chain._options.responseFormat;
        task.ignoreError = chain._options.ignoreError;
        task.dontWait = chain._options.dontWait;

        //If func is specified as a string, lookup the actual function
        if(typeof chain._toExecute === 'string' && chain._options.self != null){
            chain._toExecute = chain._options.self[chain._toExecute];
        }

        task.toExecute = chain._toExecute;

        queue(chain._flow, task);
    };

    func.sync = function(){
        if(chain._args === chain._unsetArgs){
            func.args.apply(func, arguments); //If args not specified, use current
        }

        var future = func.future();

        return future.result;
    };

    func.future = function(){
        var key = Math.random();
        chain._options.key = key;
        if(chain._options.self == null){
            chain._options.self = chain._self;
        }
        chain._options.dontWait = true;

        if(chain._args === chain._unsetArgs){
            func.args.apply(func, arguments); //If args not specified, use current
        }

        chain._args.push(chain._flow.add(chain._options));

        //If func is specified as a string, lookup the actual function
        if(typeof chain._toExecute === 'string' && chain._options.self != null){
            chain._toExecute = chain._options.self[chain._toExecute];
        }

        chain._toExecute.apply(chain._options.self, chain._args);

        return new Future(chain._flow, key);
    };

    return func;
};

var asyncblock = function(fn, options) {
    var originalStack;
    if(options != null && options.stack != null){
        originalStack = options.stack;
    }

    var fiberContents = function() {
        var flow = new Flow(fiber);
        if(originalStack != null){
            flow._originalStack = originalStack;
        }

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
            //Prevent memory leak
            fn = null;
            fiber = null;
        }
    };

    fiber = Fiber(fiberContents);
    fiber.run();
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