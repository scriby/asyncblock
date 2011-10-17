var mongodb    = require('mongodb');
var greenlight = require('../greenlight');
var server     = new mongodb.Server('localhost', mongodb.Connection.DEFAULT_PORT, {});
var database   = new mongodb.Db('test', server, {});

greenlight(function(red, green) {
	database.open(green);
	var client = red();

	client.collection('test_collection', green);
	var collection = red();

	collection.insert({hello: 'world'}, {safe:true}, green);
	red('!');

	client.close(green);
	red('!');

	console.log('all finished');
});

