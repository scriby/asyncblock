require('fibers');

module.exports = function(fn) {
	var red, green;
	var light = false; // false .. red, true .. green
	var fiber  = Fiber(function() {
		try {
			fn(red, green);
		} catch(e) {
			process.nextTick(function() {
				throw e;
			});
		}
	});

	var buffer = null;

	red = function() {
		if (!light) {
			process.nextTick(function() {
				throw new Error('red called on red light');
			});
		}
		if (buffer) {
			var b = buffer;
			buffer = null;
			return b;
		}
		light = false;
		return yield();
	};

	green = function() {
		if (light) {
			// green called on green.
			// an async functions might call its callback before red() was called.
			// so buffer its answer for call of red.
			if (buffer !== null) {
				process.nextTick(function() {
					throw new Error('green called twice on green light');
				});
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
