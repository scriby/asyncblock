var dns  = require('dns');
var util = require('util');
var greenlight = require('../greenlight');

greenlight(function(red, green) {
	dns.lookup('nodejs.org', null, green);
	var asw = red('!', 'address', 'family');
	console.log(util.inspect(asw));
});

