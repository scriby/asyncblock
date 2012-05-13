var Fiber = require('fibers');
var Flow = require('./flow.js').Flow;
var EventEmitter = require('events').EventEmitter;

var Enumerator = function(exec){
    this.exec = exec;
    this.curr = null;
    this.events = new EventEmitter();
};

Enumerator.prototype.__defineGetter__('current', function(){
    return this.curr;
});

var undef = (function(){})();
Enumerator.prototype.moveNext = function(){
    this.curr = this.exec();

    var hasMore = this.curr !== undef;

    if(!hasMore){
        this.end();
    }

    return hasMore;
};

Flow.prototype.yield = function(value){
    if(!this._isGenerator){
        throw new Error("flow.yield may only be called from an asyncblock.generator");
    }

    if(this.listeners('yield').length > 0){
        this.emit('yield', value);
    } else {
        Fiber.yield(value);
    }
};

exports.getEnumerator = function(flow, fiber){
    //THe generator is initially stopped
    flow._light = false;

    var enumerator = function(){
        //Async generator support
        if(Fiber.current != null){
            var outerFlow = Fiber.current._asyncblock_flow;

            var key = flow._getNextTaskId();

            var resume = outerFlow.add({key: key, dontWait: true});
            var callback = function(value){
                resume(null, value);
            };

            flow.on('yield', callback);
            //Clean up and return control when the generator returns
            flow.on('end', callback);

            //We need to delay the running of the generator in case it returns results without blocking
            process.nextTick(function(){
                if(flow && !flow._light){
                    fiber.run();
                }
            });

            var result = outerFlow.wait(key);

            outerFlow = null;
            flow.removeListener('end', callback);
            flow.removeListener('yield', callback);

            return result;
        } else {
            return fiber.run();
        }
    };

    enumerator.__proto__ = new Enumerator(enumerator);
    enumerator.end = function(){
        enumerator.events.emit('end');

        try { fiber.reset(); } catch(e) {}

        enumerator = null;
        fiber = null;
        flow = null;
    };

    return enumerator;
};
