/// <reference path='../../../typings/index.d.ts'/>
'use strict';

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

var url = require('url'),
	express = require('express'),
	bodyParser = require('body-parser'),
	swagger = require('swagger-node-express'),
	models = require('./models');



// ======================================================================
// Private Functions



// ======================================================================
// Module Functions

function init(app, apiPath) {
	var api = app;

	if(!apiPath)
		return;

	api = express();
	app.use(apiPath, api);

	// setup body parser
	api.use(bodyParser.json());
	api.use(bodyParser.urlencoded({
	  extended: true
	}));

	// remove express specific headers
	api.set('etag', false);
	api.use(function (req, res, next) {
		res.removeHeader('X-Powered-By');
		next();
	});

	// CORS
	// This allows client applications from other domains use the API
	if(config.server.CORS) {
		api.use(function(req, res, next) {
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Headers',
				'Origin, X-Requested-With, Content-Type, Accept');
			res.header('Access-Control-Allow-Methods', '*');
			next();
		});
	}
	else {
		api.use(function(req, res, next) {
			res.removeHeader('Access-Control-Allow-Origin');
			res.removeHeader('access-Control-Allow-Headers');
			res.removeHeader('Access-Control-Allow-Methods');
			next();
		});
	}

	// configure swagger
	swagger.setAppHandler(api);
	swagger.addModels(models);
	swagger.configureSwaggerPaths('', '/api-docs', '');
	swagger.setApiInfo({
		title: 'DEC112-BORDER',
		description: 'Border gateway for the Deaf Emergency Call 112 service. ' +
			'It uses node.js as platform. Requests and responses use HTTP REST '+
			'and are formated as JSON.',
		termsOfServiceUrl: '',
		contact: 'richard.prinz@min.at',
		license: 'GPLv3',
		licenseUrl: 'https://www.gnu.org/licenses/gpl-3.0.en.html'
	});

	// add API methods
	swagger.addGet(v1_active_calls);
	swagger.addGet(v1_active_calls_count);
	swagger.addGet(v1_call_get);
	swagger.addGet(v1_call_get_alt);
	swagger.addPut(v1_call_send);
	swagger.addDelete(v1_call_close);

	swagger.configureDeclaration('call', {
	    description: 'DEC112 call actions',
		authorizations : ['none'],
		protocols : ['http', 'https'],
		consumes: ['application/json'],
		produces: ['application/json']
	});

	swagger.configureDeclaration('calls', {
	    description: 'DEC112 call registry',
		authorizations : ['none'],
		protocols : ['http', 'https'],
		consumes: ['application/json'],
		produces: ['application/json']
	});

	// API api_key validator
	swagger.addValidator(
		function validate(req, path, httpMethod) {
			var apiKey = req.headers['api_key'];

			if (!apiKey)
				apiKey = url.parse(req.url, true).query['api_key'];

			if (!apiKey) {
				tools.logWarning('missing API key');
				return false;
			}

			var apkConfig = _.get(config, ['api', 'keys', apiKey], {});
			if (_.get(apkConfig, 'enabled', false)) {
				if (_.get(apkConfig, 'service', null)) {
					apkConfig['id'] = apiKey;
					req['_api'] = apkConfig;
					return true;
				}
			}

			tools.logWarning('API key (' + apiKey + ') rejected');
			return false;
		}
	);

	// must be last swagger config action
	swagger.configure(apiPath, '1.0');

	// configure API error handler
	app.use(apiPath, function(error, req, res, next) {
		if(error) {
			//res.status(500).send('error').end();

			// create response error object
			var e = {};
			if(error.message)
				e.msg = error.message;
			if(config.debug) {
				if(error.stack)
					e.stack = error.stack;
				e.obj = error
			}
			if(error.tag)
				e.tag = error.tag;
			if(error.errorType)
				e.errorType = error.errorType;
			if(error.errorLanguage)
				e.errorLanguage = error.errorLanguage;

			tools.logError(e.msg);

			// send back as JSON
			//res.send(JSON.stringify({error: e}));
			//res.json({error: e});

			res.status(500).json({
				'message': e.msg,
				'code': 500
			});

			// send back as XML
			//res.set('Content-Type', 'text/xml');
			//res.send(tools.createError(e.errorType,
			//	e.msg, e.errorLanguage, false, 0));
		}
		else
			next();
	});
};



// ======================================================================
// Swagger API Metadata

var v1_active_calls = {
	spec: {
		method: 'GET',
		path: '/calls/active',
		description: 'Get active calls',
		summary: 'Returns a list with current active calls',
		parameters: [ ],
		produces: ['application/json'],
		type: 'ActiveCallList',
		nickname: 'v1_active_calls'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'get_active_calls'
		};
		var start = tools.getHrTime();

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, `Service: ${svcName}`);

		result.calls = calls.get_active(svcName);
		result.code = 200;
		if(config.debug)
			result.runtime_ms = tools.elapsedHrTime(start);
		res.status(200)
			.json(result);
	}
};

var v1_active_calls_count = {
	spec: {
		method: 'GET',
		path: '/calls/active/count',
		description: 'Get active calls count',
		summary: 'Returns the number of current active calls',
		parameters: [ ],
		produces: ['application/json'],
		type: 'ActiveCallCount',
		nickname: 'v1_active_calls_count'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'get_active_calls_count'
		};
		var start = tools.getHrTime();

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, `Service: ${svcName}`);

		result.calls = calls.get_active_count(svcName);
		result.code = 200;
		if(config.debug)
			result.runtime_ms = tools.elapsedHrTime(start);
		res.status(200)
			.json(result);
	}
};

var v1_call_get = {
	spec: {
		method: 'GET',
		path: '/call/{call_id}',
		description: 'Get call data',
		summary: 'Get call data',
		parameters: [
			swagger.pathParam("call_id", "Unique call ID", "string"),
		],
		produces: ['application/json'],
		type: 'Call',
		errorResponses: [
			swagger.errors.notFound('call_id')
		],
		nickname: 'v1_call_get'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'get_call'
		};
		var start = tools.getHrTime();

		var call_id = _.get(req, 'params.call_id', null);
		if(!call_id)
			return next(swagger.errors.notFound('call_id'));

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, `Service: ${svcName}`);

		return calls.get_by_call_id(call_id, svcName)
			.then(function(call) {
				result.call = call;
				result.code = 200;
				if(config.debug)
					result.runtime_ms = tools.elapsedHrTime(start);
				res.status(200)
					.json(result);
			})
			.catch(function(error) {
				if(config.debug)
					return next(new Error(method + ': ' + error));
				else
					return next(new Error(method + ': error'));
			});
	}
};

var v1_call_get_alt = {
	spec: {
		method: 'GET',
		path: '/call/{call_id_alt}/alt',
		description: 'Get call data (alternate)',
		summary: 'Get call data via alternate call id',
		parameters: [
			swagger.pathParam("call_id_alt", "Alternate unique call ID", "string"),
		],
		produces: ['application/json'],
		type: 'Call',
		errorResponses: [
			swagger.errors.notFound('call_id_alt')
		],
		nickname: 'v1_call_get_alt'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'get_call_alt'
		};
		var start = tools.getHrTime();

		var call_id_alt = _.get(req, 'params.call_id_alt', null);
		if(!call_id_alt)
			return next(swagger.errors.notFound('call_id_alt'));

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, `Service: ${svcName}`);

		return calls.get_by_call_id_alt(call_id_alt, svcName)
			.then(function(call) {
				result.call = call;
				result.code = 200;
				if(config.debug)
					result.runtime_ms = tools.elapsedHrTime(start);
				res.status(200)
					.json(result);
			})
			.catch(function(error) {
				if(config.debug)
					return next(new Error(method + ': ' + error));
				else
					return next(new Error(method + ': error'));
			});
	}
};

var v1_call_send = {
	spec: {
		method: 'PUT',
		path: '/call/{call_id}',
		description: 'Send message to an active call',
		summary: 'Send message to an active call',
		parameters: [
			swagger.pathParam("call_id", "Unique call ID", "string"),
			swagger.bodyParam("message", "Message object to send",
				"Message", null, true)
		],
		produces: ['application/json'],
		type: 'MessageResult',
		errorResponses: [
			swagger.errors.notFound('call_id'),
			swagger.errors.notFound('message')
		],
		nickname: 'v1_call_send'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'send'
		};
		var start = tools.getHrTime();

		var call_id = _.get(req, 'params.call_id', null);
		if(!call_id)
			return next(swagger.errors.notFound('call_id'));

		var message = _.get(req, 'body.message', null);
		if(!message)
			return next(swagger.errors.notFound('message'));

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, {
			service: svcName,
			call_id: call_id,
			message: message
		});

		return calls.send(call_id, message, svcName)
			.then(function() {
				result.code = 200;
				if(config.debug)
					result.runtime_ms = tools.elapsedHrTime(start);
				res.status(200)
					.json(result);
			})
			.catch(function(error) {
				if(config.debug)
					return next(new Error(method + ': ' + error));
				else
					return next(new Error(method + ': error'));
			});
	}
};

var v1_call_close = {
	spec: {
		method: 'DELETE',
		path: '/call/{call_id}',
		description: 'Close an active call',
		summary: 'Close an active call',
		parameters: [
			swagger.pathParam("call_id", "Unique call ID", "string"),
			swagger.bodyParam("message", "Message object to send",
				"Message", null, false)
		],
		produces: ['application/json'],
		consumes: ['application/json'],
		type: 'MessageResult',
		errorResponses: [
			swagger.errors.notFound('call_id'),
			swagger.errors.notFound('message')
		],
		nickname: 'v1_call_close'
	},
	action: function(req, res, next) {
		var method = 'REST ' + req._remoteAddress + ': '
			+ req.method + ' ' + req._parsedUrl.pathname;
		var result = {
			method: 'close_call'
		};
		var start = tools.getHrTime();

		var call_id = _.get(req, 'params.call_id', null);
		if(!call_id)
			return next(swagger.errors.notFound('call_id'));

		var message = _.get(req, 'body.message', null);

		var apkConfig = _.get(req, '_api', null);
		var svcName = _.get(apkConfig, 'service', null);
		if(!apkConfig || !svcName)
			return next(new Error(method + ': API key configuration missing'));
		tools.logDebug(method, {
			service: svcName,
			call_id: call_id,
			message: message
		});

		return calls.close_call(call_id, message, svcName)
			.then(function() {
				result.code = 200;
				if(config.debug)
					result.runtime_ms = tools.elapsedHrTime(start);
				res.status(200)
					.json(result);
			})
			.catch(function(error) {
				if(config.debug)
					return next(new Error(method + ': ' + error));
				else
					return next(new Error(method + ': error'));
			});
	}
};



// ======================================================================
// Exports

module.exports = {
    init: init
};
