import pasync from 'pasync';
import benchmark from 'benchmark';
const { Suite } = benchmark;
import beautify from 'beautify-benchmark';
import { readdir } from 'fs/promises';

// Queue of functions to run.
let runQueue = [];

// If inside of a compare block, the current suite it corresponds to
let currentSuite = null;

// Stack of name components
let nameStack = [];

function runSuite(suite, name) {
	return new Promise<void>(function(resolve) {
		suite.on('cycle', function(event) {
			beautify.add(event.target);
		});
		suite.on('start', function() {
			if (name) {
				console.log('Running ' + name + ' ...');
			} else {
				console.log('Running ...');
			}
		});
		suite.on('complete', function() {
			beautify.log();
			beautify.reset();
			resolve();
		});
		suite.run();
	});
}

export function benchset(name, fn) {
	nameStack.push(name);
	let fullName = nameStack.join(' -> ');
	runQueue.push(function() {
		console.log('\n\nBenchmark set: ' + fullName + '\n');
	});
	fn();
	nameStack.pop();
}

export function compare(name, fn) {
	nameStack.push(name);
	let fullName = nameStack.join(' -> ');
	runQueue.push(function() {
		if (currentSuite) {
			throw new Error('Cannot nest compare blocks');
		}
		console.log('\n\nComparing: ' + fullName + '\n');
		currentSuite = new Suite();
	});
	fn();
	runQueue.push(function() {
		return runSuite(currentSuite, fullName).then(function() {
			currentSuite = null;
		});
	});
	nameStack.pop();
}

export function bench(name, fn, options = {}) {
	let isAsync = fn.length >= 1;
	nameStack.push(name);
	let fullName = nameStack.join(' -> ');
	runQueue.push(function() {
		let isStandalone = !currentSuite;
		if (isStandalone) {
			currentSuite = new Suite();
		}
		// Add to the current compare block
		if (isAsync) {
			currentSuite.add(name, function(deferred) {
				fn(function(err) {
					if (err) {
						setImmediate(function() {
							throw err;
						});
					} else {
						deferred.resolve();
					}
				});
			}, {
				defer: true
			});
		} else {
			currentSuite.add(name, fn);
		}
		if (isStandalone) {
			return runSuite(currentSuite, fullName).then(function() {
				currentSuite = null;
			});
		}
	});
	nameStack.pop();
}

export function run(): Promise<void> {
	return pasync.whilst(function() {
		return !!runQueue.length;
	}, function() {
		let job = runQueue.shift();
		return job();
	}).then(function() {
		console.log('\nBenchmarks complete.');
	}).catch(pasync.abort);
}

export async function runDir(path: string): Promise<void> {
	let files = await readdir(path);
	for (let file of files) {
		if (file.slice(-3) === '.js' && file !== 'index.js') {
			await import(path + '/' + file);
		}
	}
	await run();
}


