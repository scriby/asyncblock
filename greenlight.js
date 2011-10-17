require('fibers');

module.exports = function(fn) {
	var red, green;
	// current status: false .. red, true .. green	
	var light = false; 

	// the fiber
	var fiber  = Fiber(function() {
		try {
			fn(red, green);
		} catch(e) {
			// throw in next tick so the context matches again if yielded.
			process.nextTick(function() {
				throw e;
			});
		}
	});

	// in case green gets called before red, its arguments are buffered here.
	var buffer = null;

	red = function() {
		if (!light) {
			process.nextTick(function() {
				throw new Error('greenlight: red called on red light');
			});
		}
		var greenArgs;
		if (buffer) {
			greenArgs = buffer;
			buffer = null;
		} else {
			light = false;
			greenArgs = yield();
		}
		var asw;
		var aswType = null;
		if (arguments.length === 0) {
			// default behaviour ('!', '<')
			if (greenArgs[0]) throw greenArgs[0];
			return greenArgs[1];
		}
		for (var ai = 0; ai < arguments.length; ai++) {
			var a = arguments[ai];
			if(typeof(a) !== 'string' && !a instanceof String) {
				throw new Error('greenlight: invalid parameter to red "'+a+'"');
			}
			// ignore nulls, '', false etc
			if (!a || !a[0]) continue;
			switch(a[0]) {
			case '!' : 
				// error test
				if (greenArgs[ai]) throw greenArgs[ai];
				break;
			case '<' : 
				// return value
				if (aswType) throw new Error('greenlight: multiple return types to red');
				asw = greenArgs[ai];
				aswType = 'argument'; 
				break;
			case '#' : 
				// return array
				if (aswType) throw new Error('greenlight: multiple return types to red');
				asw = greenArgs;
				aswType = 'array'; 
				break;
			case (/[A-z]/.test(a[0]) && a[0]) : 
				// return a table
				if (aswType && aswType !== 'table') {
					throw new Error('greenlight: multiple return types to red');
				} 
				asw = asw || {};
				aswType = 'table';
				asw[a] = greenArgs[ai];
				break;
			default :
				throw new Error('greenlight: unknown parameter to red: ' + a);
			}
		}
		return asw;
	};

	green = function() {
		if (light) {
			// green called on green.
			// an async functions might call its callback before red() was called.
			// so buffer its answer for call of red.
			if (buffer !== null) {
				throw new Error('greenlight: green called twice on green light');
			}
			buffer = Array.prototype.slice.call(arguments);
		} else {
			light = true;
			fiber.run(Array.prototype.slice.call(arguments));
		}
	};

	light = true;
	fiber.run();
}
