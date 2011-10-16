var mongodb = require('mongodb');
var server    = new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {});
var connector = new mongodb.Db('test', server, {});
var greenlight = require('./green-light');

greenlight(function(red, green, cancel) {
	// comfort routine for the return values of almost all mongodb functions.
	var myRed = function() {
		var a = red();
		if (a[0]) { throw new Error('dberror '+a[0].message); };
		return a[1];
	}
	connector.open(green);
	var client = myRed();
	client.collection('test_collection', green);
	var collection = myRed();
	collection.insert({hello: 'world'}, {safe:true}, green);
	myRed();
	client.close(green);
	myRed();
	console.log('all finished');
});

