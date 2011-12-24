require('fibers');

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

    // max number of parallel tasks. maxParallel <= 0 means no limit
    this.maxParallel = 0;
};

// returns the number of currently running fibers
Flow.prototype.__defineGetter__("unfinishedCount", function(){
    return this._parallelCount - this._parallelFinished;
});

var callbackHandler = function(self, task){
    return function(){
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
    }
};

var addTask = function(self, task){
    while (self.maxParallel > 0 && self.unfinishedCount >= self.maxParallel) {
        // too many fibers running.  Yield until the fiber count goes down.
        yieldFiber(self);
    }

    self._parallelCount++;

    return callbackHandler(self, task);
};

var parseAddArgs = function(key, responseFormat){
    //Support single argument of responseFormat
    if(key instanceof Array){
        responseFormat = key;
        key = null;
    }

    return {
        key: key,
        responseFormat: responseFormat
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

            if(typeof task.result[0] === 'string'){
                err = task.result[0];
            } else if(task.result[0] instanceof Error) {
                //Append the stack
                err = task.result[0];
                err.stack += '\n=== Pre-async stack ===\n' + (new Error()).stack;
            }

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

    return {
        key: key,
        responseFormat: responseFormat,
        toExecute: toExecute
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

Flow.prototype.wait = function() {
    return wait(this);
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
