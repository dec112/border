/// <reference path="../../typings/index.d.ts"/>
"use strict";

/*
	DEC112-border, Deaf Emergency Call 112 Border Gateway
	Provides services and APIs between DEC112-mobile phone app and control
	center systems.

	Copyright (C) 2015-2019  richard.prinz@min.at

    COMMERCIAL USAGE PROHIBITED!

    ----------------------------------------------------------------------------
    Important Note:

	This software is a prototypically implementation of a lightweight, modern,
	standards based text chat based emergency call framework. mobile
	There is ABSOLUTELY NO GUARANTY that all components works as expected!
	As emergency communication is critical use this software at your own risk!
	The authors accept no liability for any incidents resulting from using any
	component of this framework.
    ----------------------------------------------------------------------------

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
	along with this program (see file gpl-3.0.txt).
	If not, see <http://www.gnu.org/licenses/>.
*/

// ======================================================================
// Variables

// these modules are global as they are required
// in every module
global._ = require('lodash');
global.config = require("./config/config");
global.tools = require('./lib/tools');
global.sip = require('./lib/sip');
global.calls = require('./lib/calls');

var	path = require('path'),
	fs = require('fs'),
	mkdirp = require('mkdirp'),
	localize = require('./lang'),
	http = require('http'),
	https = require('https'),
    express = require('express'),
	favicon = require('serve-favicon'),
	cons = require('consolidate'),
	serveIndex = require('serve-index'),
	FileStreamRotator = require('file-stream-rotator'),
	logger = require('morgan'),
	rest_api_v1 = require('./api-v1/rest'),
	ws_api_v1 = require('./api-v1/websocket');

tools.logInfo('-'.repeat(79));
try {
	var pjson = require('./package.json');
	global.APPLICATION = {
		name: pjson.name,
		description: pjson.description,
		version: pjson.version,
		copyright: `Copyright ${pjson.author} 2016-2019`
	}

	tools.logInfo(`${APPLICATION.description} started`);
	tools.logInfo(`${APPLICATION.name}, version ${APPLICATION.version}`);
	tools.logInfo(`${APPLICATION.copyright}`)
}
catch (err) {
	tools.logInfo('DEC112 Border Gateway started');
}

global.lang = new localize.Lang(_.get(config, 'sip.default_lang', 'en'));

var server;
var app = express();
var sip_ua = null;


// ======================================================================
// Methods

// configure service
function configure() {
	configureServices();
	configureServer();
	configureDownloads();
	configureAPI();
	configureContent();
}

// initialize service/data (if any)
function initialize() {
}

// configure server parameters
function configureServer() {
	// in case of debug, pretty print json
	if(config.debug)
		app.set('json spaces', 2);

	// listen address
	if(!config.server.listen)
		app.set('bind', process.env.LISTEN || '0.0.0.0');
	else
		app.set('bind', config.server.listen);

	// listen TCP port
	if(!config.server.port)
		app.set('port', process.env.PORT || 8080);
	else
		app.set('port', config.server.port);

	// configure logging
	// ensure log directory exists
	var logDirectory = config.server.log_directory;
	if(!logDirectory)
		logDirectory = path.join(__dirname, 'logs');
	else
		if(!path.isAbsolute(logDirectory))
			logDirectory = path.join(__dirname, logDirectory);
	fs.existsSync(logDirectory) || mkdirp.sync(logDirectory);

	// create a rotating write stream
	var accessLogStream = FileStreamRotator.getStream({
		date_format: 'YYYYMM',
		filename: path.join(logDirectory, '/access-%DATE%.log'),
		frequency: 'daily',
		verbose: true
	});

	app.use(logger('combined', {stream: accessLogStream}));

	// define favicon for this service/app
	app.use(favicon('favicon.ico'));

    // configure https
    var https = _.get(config, 'server.https', null);
    if(https) {
        if(https.key && https.cert) {
            if(!path.isAbsolute(https.key))
                https.key = path.join(__dirname, https.key);
            if(!fs.existsSync(https.key)) {
                tools.logError('https key ' +
                    https.key.toString().cyan +
                    ' not found');
                https.key = null;
            }

            if(https.ca) {
                if(!path.isAbsolute(https.ca))
                    https.ca = path.join(__dirname, https.ca);
                if(!fs.existsSync(https.ca)) {
                    tools.logError('https ca certificate ' +
                        https.ca.toString().cyan +
                        ' not found');
                    https.ca = null;
                }
            }

            if(!path.isAbsolute(https.cert))
                https.cert = path.join(__dirname, https.cert);
            if(!fs.existsSync(https.cert)) {
                tools.logError('https certificate ' +
                    https.cert.toString().cyan +
                    ' not found');
                https.cert = null;
            }
        }

        if(https.key && https.cert) {
            https.options = {}
            https.options.key = fs.readFileSync(https.key);
            if(https.ca)
                https.options.ca = fs.readFileSync(https.ca);
            https.options.cert = fs.readFileSync(https.cert);

            // listen SSL TCP port
            if(!config.server.https.port)
                app.set('https_port', process.env.HTTPS_PORT || 443);
            else
                app.set('https_port', config.server.https.port);

            tools.logInfo('https configured - ' +
                'enabled'.green);
        }
        else {
            tools.logError('https configuration invalid - ' +
                'disabled'.red);
        }
    }
    else {
        tools.logInfo('https not configured - ' +
            'disabled'.red);
    }
}

// prepare services from config
function configureServices() {
	// configure services
	var services = _.get(config, 'services', {});

	// first configure all real service configs (== objects)
	// later iterate over service again to resolve references (== strings)
	_.forOwn(services, function(svcConfig, svcName) {
		if(_.isObjectLike(svcConfig)) {
			var svcEnabled = _.get(svcConfig, 'enabled', true);
			var svcType = _.get(svcConfig, 'type', null);
			if(!svcEnabled || !svcType) {
				tools.logWarning(`Service (${svcName}) not loaded - disabled`);
				return;
			}
			try {
				var svcLib = require(`./lib/services/${svcType}`);
				var svcInstance = new svcLib.Service(svcConfig, svcName);
				config.services[svcName]._service = svcInstance;

				//if(config.debug)
				//	tools.logOK(`Service (${svcName}) loaded`, svcInstance);
				//else
					tools.logOK(`Service (${svcName}) loaded`);
			}
			catch(error) {
				tools.logError(`Service (${svcName}) loading failed - ${error}`,
					error);
				return;
			}

			// configure triggers
			var triggers = _.get(svcConfig, 'triggers', {});
			config.services[svcName]._triggers = {};
			_.forOwn(triggers, function(tgConfig, tgName) {
				var tgEnabled = _.get(tgConfig, 'enabled', true);
				var tgType = _.get(tgConfig, 'type', null);
				if(!tgEnabled || !tgType) {
					tools.logWarning(`Service (${svcName}) / Trigger (${tgName}) ` +
						`not loaded - disabled`);
					return;
				}
				try {
					var tgLib = require(`./lib/triggers/${tgType}`);
					var tgInstance = new tgLib.Trigger(tgConfig, tgName);
					config.services[svcName]._triggers[tgName] = tgInstance;
					tools.logOK(`Service (${svcName}) / Trigger (${tgName}) ` +
						`loaded`);
				}
				catch(error) {
					tools.logError(`Service (${svcName}) / Trigger (${tgName}) ` +
						`loading failed - ${error}`,
							error);
				}
			});
		}
	});

	_.forOwn(services, function(svcReferenceName, svcName) {
		if(_.isString(svcReferenceName)) {
			var svcRef = _.get(services, svcReferenceName, null);
			if(_.isObjectLike(svcRef)) {
				tools.logOK(`Resolved service reference ` +
					`(${svcName}) --> (${svcReferenceName})`);
				services[svcName] = svcRef;
			}
			else {
				tools.logError(`Unable to resolve service reference ` +
					`(${svcName}) --> (${svcReferenceName})`);
			}
		}
	});

	//tools.logDebug('resolved service configuration',
	//	config.services);
}

// download content (incl. directory indexing)
function configureDownloads() {
	app.use('/downloads', serveIndex('downloads', {'icons': true}));
	app.use('/downloads', express.static(path.join(__dirname, 'downloads')));
}

// setup service API's
function configureAPI() {
	rest_api_v1.init(app, '/api/v1');
	sip_ua = sip.init();
}

// static and generated content
function configureContent() {
	// template's
	app.engine('html', cons.lodash);
	app.set('view engine', 'html');
	app.set('views', path.join(__dirname, 'views'));

	// main template
	app.get('/main', function(req, res, next) {
		res.render('main', { });
	});

	// debug support
	if(config.debug) {
		// provides express debug infos
		require('express-debug')(app, {
			depth: 4,
			//panels: [
			//	'locals', 'request', 'session', 'template',
			//	'software_info', 'profile'
			//],
			path: '/express-debug'
		});

		// shows client http headers
		app.get('/info', generateDebugPage);
	}

	// default go to main page
	app.use('/', express.static(path.join(__dirname, 'docs')));

	// remove express specific headers
	app.use(function (req, res, next) {
		res.removeHeader("X-Powered-By");
		next();
	});
}

// start server
function startServer() {
    var port = 0;

	// create web server
    if(_.get(config, 'server.https.options', false)) {
        server = https.createServer(config.server.https.options, app);
        port = app.get('https_port');
    }
    else {
        server = http.createServer(app);
        port = app.get('port');
    }

	server.listen(port, app.get('bind'), function() {
		var addr = server.address();
		tools.logInfo('Express server listening on ' +
			(addr.address.toString() + ':' +
			addr.port).cyan);
		tools.listIPs();
	});

	// create websocket server
	ws_api_v1.init(server);
}

// generate debug helper page showing sent client http headers
// and IP address
function generateDebugPage(req, res) {
	var h = '';
	for(var header in req.headers)
		h += header + ' = <b>' + req.headers[header] + '</b><br>';

  res.send(
	'<html><head></head><body>' +
	'Your IP: <b>' + req.connection.remoteAddress + '</b><br><p>' +
	'Headers:<br>' +
	h +
	'</body></html>');
}


// ======================================================================
// Main

//so the program will not close instantly
process.stdin.resume();

function exitHandler(options, err) {

	//if(options.cleanup) {
	//}

	if(err)
		console.log(err.stack);

	if(options.exit) {
		tools.logWarning('Stopping server ...');
		sip.terminate(true)
			// TODO: finally()
			.then(function() {
				process.exit();
			})
			.catch(function(error) {
				tools.logError(error);
				process.exit();
			});
	}
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

configure();
initialize();
startServer();
