/**
| Tests various return types for red.
*/
var greenlight = require('../greenlight');
var util = require('util');

greenlight(function(red, green, cancel) {
	var r; 

	// return array test
	green(1, 2, 3);
	r = red('#');
	console.log(util.inspect(r));

	// return table test
	green(1, 2, 3);
	r = red('a', 'b', 'c');
	console.log(util.inspect(r));

	// return table value
	green(1, 2, 3);
	r = red(null, null, '<');
	console.log(util.inspect(r));
	
	// throw error test
	var didErr = false;
	green(new Error('test'), 2);
	try {
		r = red();
	} catch(err) {
		didErr = true;
	}
	if (!didErr) { console.log('Fail: no exception on exception test') };
});

