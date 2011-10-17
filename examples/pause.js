var greenlight = require('../greenlight');
greenlight(function(pause, resume) {
	console.log('starting timer');
	setTimeout(resume, 2000); 
	pause();
	console.log('two seconds passed');
});
console.log('the main context does not pause');
