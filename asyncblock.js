require('fibers');
var events = require('events');
var util = require('util');

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

    task.callback = function(){
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

        var args = Array.prototype.slice.call(arguments);

        self._parallelFinished++;

        if(self._parallelCount === 1 && task.key == null){
            task.key = '__defaultkey__';
        }

        task.result = args;

        if (self._light) {
            if(task.key != null){
                self._returnValue[task.key] = resultHandler(self, task);
            }
        } else {
            self._light = true;
            self._fiber.run(task);
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
    runTaskQueue(self);

    self._light = false;
    var task = Fiber.yield();

    if(task != null) {
        var val = resultHandler(self, task);
        if(task.key != null){
            self._returnValue[task.key] = val;
        }
    }
};

var errorHandler = function(self, task){
    if(task.ignoreError){
        return;
    }

    if(task.result && task.result[0]){
        //Make sure we don't call the error callback more than once
        if(!self._errorCallbackCalled){
            self._errorCallbackCalled = true;
            var err;

            if(!(task.result[0] instanceof Error)){
                err = new Error(task.result[0]);
            } else {
                err = task.result[0];
            }

            //Append the stack
            err.stack += '\n=== Pre-async stack ===\n' + (new Error()).stack;

            //If the errorCallback property was set, report the error
            if(self.errorCallback){
                self.errorCallback(err);

                fn = null;
                fiber = null;
            }

            //Prevent the rest of the code in the fiber from running
            throw err;
        }
    }
};

var resultHandler = function(self, task){
    if(task == null){
        return null;
    }

    errorHandler(self, task);

    if(task.responseFormat instanceof Array) {
        return convertResult(task.result, task.responseFormat);
    } else {
        if(task.result.length > 2){
            return task.result.slice(1);
        } else {
            return task.result[1];
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
    while(shouldYield(self)){
        yieldFiber(self);
    }

    var toReturn;

    //If add was called once and no parameter name was set, just return the value as is
    if(self._parallelCount === 1 && '__defaultkey__' in self._returnValue) {
        toReturn = self._returnValue.__defaultkey__;
    } else {
        delete self._returnValue.__defaultkey__;

        toReturn = self._returnValue;
    }

    //Prepare for the next run
    self._parallelFinished = 0;
    self._parallelCount = 0;
    self._returnValue = {};

    return toReturn;
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

module.exports = function(fn) {
    var fiber = Fiber(function() {
        var flow = new Flow(fiber);

        try {
            fn(flow);
        } catch(e) {
            if(flow.errorCallback){
                if(!flow._errorCallbackCalled){
                    flow._errorCallbackCalled = true;

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

    fiber.run();
};
