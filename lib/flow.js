var Fiber = require('fibers');
var events = require('events');
var util = require('util');

var Flow = function(fiber) {
    this._parallelCount = 0; //The number of currently active tasks
    this._parallelFinished = 0; //The number of finished tasks since the last call to wait

    this._fiber = fiber; //A reference to the fiber

    this._taskQueue = []; //A placeholder for queued tasks
    this._forceWait = false; //Internal state that indicates that the fiber should yield until doneAdding is called

    this._light = true; //Determines whether the fiber is currently running or not. true = running
    this._finishedTasks = {}; //Buffers information about finished tasks until results are requested

    this.errorCallback = null; //Call this function when an error occurs

    this.taskTimeout = null; //Number of milliseconds the task may run for. Null means no limit.
    this.timeoutIsError = null; //If a timeout should be treated as an error, or if the task should simply be aborted and flow continue.

    this._originalError = null; //Used to store the stack at the time of asyncblock creation

    this._parentFlow = null; //In the case of nested asyncblocks, a reference to the outer block. Used to tie together stack traces

    this._isGenerator = false; //Tracks whether the current asyncblock was created as an enumerator or not

    this.maxParallel = 0; // max number of parallel tasks. maxParallel <= 0 means no limit

    this.firstArgIsError = true; //The first argument to the callback is treated as data instead of as an error

    this._lastAddedTask = null; //A stack of last added tasks, used to keep track of which task to wait on for flow.sync calls
};

util.inherits(Flow, events.EventEmitter);

Flow.prototype._getNextTaskId = (function(){
    var taskId = 1;

    return function(){
        ++taskId;

        return '_ab_' + taskId;
    };
})();


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

        //Allow the error to be thrown again from an outer asyncblock, even if callbackCalled is true
        if(task.error){
            task.error.__asyncblock_handled = false;
        }

        if(callbackCalled){
            return;
        }

        callbackCalled = true; //Prevent this callback from getting called again

        if(task.timeoutId) {
            clearTimeout(task.timeoutId);
        }

        if(!task.dontWait) {
            self._parallelFinished++;
        }

        task.result = args;
        task.completed = true;
        var val = resultHandler(self, task);

        if(task.key != null){
            task.formattedResult = val;
            self._finishedTasks[task.key] = task;
        }

        //Allow the error to be thrown again from an outer asyncblock (task.error may not be set until resultHandler is called)
        if(task.error){
            task.error.__asyncblock_handled = false;
        }

        if(self._light === false) {
            task.resultWasAsync = true;

            self._light = true;
            self._fiber.run(task);
        } else {
            task.resultWasAsync = false;
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

    if(self._lastAddedTask) {
        self._lastAddedTask._nextTask = task;
        task._previousTask = self._lastAddedTask;
    }

    self._lastAddedTask = task;

    if(task.key == null) {
        if(self._parallelCount === 0){
            task.key = '__defaultkey__';
        } else {
            task.key = self._getNextTaskId();
            task.dontIncludeInResult = true;
        }
    }

    if(task.firstArgIsError == null){
        task.firstArgIsError = self.firstArgIsError;
    }

    while (self.maxParallel > 0 && self.unfinishedCount >= self.maxParallel) {
        // too many fibers running.  Yield until the fiber count goes down.
        yieldFiber(self);
    }

    if(!task.dontWait){
        self._parallelCount++;
    }

    self._fiber._asyncblock_reuseFiber = task.reuseFiber;

    return callbackHandler(self, task);
};

Flow.prototype._addTask = function(task){
    addTask(this, task);
};

var parseAddArgs = Flow.prototype._parseAddArgs = function(key, responseFormat){
    var timeout;
    var timeoutIsError;
    var dontWait = false;
    var ignoreError = false;
    var firstArgIsError;
    var reuseFiber = false;

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
        firstArgIsError = obj.firstArgIsError;
        reuseFiber = obj.reuseFiber;
    }

    return {
        key: key,
        responseFormat: responseFormat,
        timeout: timeout,
        timeoutIsError: timeoutIsError,
        dontWait: dontWait,
        ignoreError: ignoreError,
        firstArgIsError: firstArgIsError,
        reuseFiber: reuseFiber
    };
};

Flow.prototype.add = Flow.prototype.callback = function(key, responseFormat){
    var task = parseAddArgs(key, responseFormat);

    return addTask(this, task);
};

//Undocumented - used by source transformation to optimize nested sync() calls (don't create unnecessary fibers)
Flow.prototype.addAndReuseFiber = function(key, responseFormat){
    var task = parseAddArgs(key, responseFormat);
    task.reuseFiber = true;

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
    if(task != null && task.result && task.result[0] && task.firstArgIsError){
        if(!task.ignoreError) {
            if(task.resultWasAsync) {
                var err = new Error();
                Error.captureStackTrace(err, self.wait);

                //Append the stack from the fiber, which indicates which wait call failed
                task.error.stack += '\n=== Pre-async stack ===\n' + err.stack;
            }

            var curr = self;
            while(curr != null){
                if(curr._originalError){
                    task.error.stack += '\n=== Pre-asyncblock stack ===\n' + curr._originalError.stack;
                }

                curr = curr._parentFlow;
            }

            task.error.__asyncblock_caught = true;

            //If the errorCallback property was set, report the error
            if(self.errorCallback){
                task.error.__asyncblock_handled = true;
                self.errorCallback(task.error);
            }

            throw task.error;
        }
    }
};

var errorParser = function(self, task) {
    if(task.result && task.result[0] && task.firstArgIsError){
        var err;
        var firstArg = task.result[0];

        if(firstArg instanceof Error){
            //An error object was thrown, just use it
            err = firstArg;
        } else if(typeof firstArg === 'object'){
            //Some sort of object was thrown, convert it into an error object to not lose stack info
            err = new Error(JSON.stringify(firstArg));
            Error.captureStackTrace(err, task.callback);
        } else {
            //Some primitive-ish thing was thrown, convert it into an error object to not lose stack info
            err = new Error(firstArg);
            Error.captureStackTrace(err, task.callback);
        }

        err.originalError = firstArg;

        task.error = err;

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
        return convertResult(task);
    } else {
        return task.result[task.firstArgIsError ? 1 : 0];
    }
};

var convertResult = function(task){
    var formatted = {};
    var ret = task.result;
    var responseFormat = task.responseFormat;
    var offset = task.firstArgIsError ? 1 : 0;

    var min = Math.min(ret.length - offset, responseFormat.length);

    for(var i = 0; i < min; i++) {
        formatted[responseFormat[i]] = ret[i + offset];
    }

    return formatted;
};

var shouldYield = function(self) {
    return self._parallelFinished < self._parallelCount || self._forceWait || self._taskQueue.length > 0;
};

var removeTaskFromLastAddedTasks = function(self, task){
    if(self._lastAddedTask === task){
        self._lastAddedTask = task._previousTask;
        if(self._lastAddedTask){
            self._lastAddedTask._nextTask = null;
        }
    } else {
        if(task._previousTask){
            task._previousTask._nextTask = task._nextTask;
        }

        if(task._nextTask){
            task._nextTask._previousTask = task._previousTask;
        }
    }
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
    var err;
    var ignoreError;

    //If add was called once and no parameter name was set, just return the value as is
    if(self._parallelCount === 1 && '__defaultkey__' in self._finishedTasks) {
        var task = self._finishedTasks.__defaultkey__;

        toReturn = task.formattedResult;

        removeTaskFromLastAddedTasks(self, task);

        delete self._finishedTasks.__defaultkey__;

        if(task.error){
            err = task.error;
            ignoreError = task.ignoreError;
        }
    } else {
        var defaultTask = self._finishedTasks.__defaultkey__;

        //Make sure we don't miss reporting this error
        if(defaultTask != null){
            removeTaskFromLastAddedTasks(self, defaultTask);

            if(defaultTask.error){
                err = defaultTask.error;
                ignoreError = defaultTask.ignoreError;
            }
        }

        delete self._finishedTasks.__defaultkey__;

        toReturn = {};

        Object.keys(self._finishedTasks).forEach(function(key){
            var task = self._finishedTasks[key];

            if(!task.dontWait) {
                if(task.error){
                    err = err || task.error;
                    ignoreError = ignoreError || task.ignoreError;
                }

                if(!task.dontIncludeInResult){
                    toReturn[key] = task.formattedResult;
                }

                removeTaskFromLastAddedTasks(self, task);
                delete self._finishedTasks[key];
            }
        });
    }

    //Prepare for the next run
    self._parallelFinished = 0;
    self._parallelCount = 0;

    //ignoreError was set at least once and is not false
    if(ignoreError != null && !ignoreError){
        throw err;
    }

    return err || toReturn;
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

    removeTaskFromLastAddedTasks(self, task);

    if(!task.ignoreError && task.error){
        throw task.error;
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
    if(arguments.length === 1 && typeof arguments[0] !== 'function'){
        //flow.sync(asyncFunction(..., flow.add()); usage
        var lastTask = this._lastAddedTask;

        if(lastTask == null){
            throw new Error('flow.sync usage not correct -- no task has been added');
        }

        return this.wait(lastTask.key);
    } else {
        //flow.sync(asyncfunction, ...); usage
        var task = parseSyncArgs(arguments);
        task.key = this._getNextTaskId();
        task.dontWait = true;

        var callback = this.add(task);
        task.toApply.push(callback);

        task.toExecute.apply(task.self, task.toApply);

        return this.wait(task.key);
    }
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

exports.Flow = Flow;
