var Flow = require('./flow.js').Flow;
var Future = require('./future.js').Future;

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
    var flow = this;
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

        flow._queueTask(task);
    };

    func.sync = function(){
        if(chain._args === chain._unsetArgs){
            func.args.apply(func, arguments); //If args not specified, use current
        }

        var future = func.future();

        return future.result;
    };

    func.future = function(){
        var key = flow._getNextTaskId();
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
