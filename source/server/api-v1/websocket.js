/// <reference path="../../../typings/index.d.ts"/>
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

// ============================================================================
// Variables

var call_state = require('../lib/state'),
    WebSocketServer = require('websocket').server;

var _wsServer = null;



// ======================================================================
// Private Functions



// ======================================================================
// Module Functions

function init(server) {
    if(!server)
        return;
    if(_wsServer)
        return;

    _wsServer = new WebSocketServer({
		httpServer: server,
		autoAcceptConnections: false
	});

	_wsServer.on('request', function(request) {
        var error_message;

        // check path (= api version)
        var api_path = _.trim(_.get(request, 'resourceURL.pathname', ''), '/ ');
		if (api_path != 'api/v1') {
            error_message = 'WS ' + request.remoteAddress + ': ' +
                'invalid API version requested: (' +
                api_path + ')';
			request.reject(404, error_message);
			tools.logError(error_message);
			return;
        }

        // check API key
        var apiKey = _.get(request, 'httpRequest.headers.api_key', null);

        if (!apiKey)
            apiKey = _.get(request, 'resourceURL.query.api_key', null);

        if (!apiKey) {
            error_message = `WS ${request.remoteAddress}: ` +
                `missing API key`;
			request.reject(404, error_message);
            tools.logError(error_message);
            return;
        }

        var apkConfig = _.get(config, ['api', 'keys', apiKey], {});
        if (_.get(apkConfig, 'enabled', false) &&
                _.get(apkConfig, 'service', null)) {
            apkConfig['id'] = apiKey;
        }
        else {
            error_message = `WS ${request.remoteAddress}: ` +
                `API key rejected (${apiKey})`;
			request.reject(404, error_message);
            tools.logError(error_message);
            return;
        }

		// check protocols
		if (request.requestedProtocols.indexOf('dec112') === -1) {
            error_message = 'WS ' + request.remoteAddress + ': ' +
                'invalid protocol(s) requested: (' +
                request.requestedProtocols + ')';
			request.reject(404, error_message);
			tools.logError(error_message);
			return;
		}

		// TODO: check origin
		//if (request.origin != '') {
        //  msg = 'WS: connection from origin (' + request.origin + ') ' +
		//		'rejected';
		//	request.reject(404, msg);
		//	tools.logError(msg);
		//	return;
		//}

		var connection = request.accept('dec112', request.origin);
		tools.logInfo('WS ' + connection.remoteAddress + ': connection ' +
			'accepted');

		connection.on('message', function(ws_message) {
            var start;
            var method;
            var message;
            var call_id, call_id_alt;
            var tag = null;
            var result = {};
            var svcName = apkConfig.service;

            new Promise(function(resolve, reject) {
                //try {
                    if(config.debug)
                        start = tools.getHrTime();

                    // handle text (utf-8) websocket messages
                    if (ws_message.type === 'utf8') {
                        tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                            'received Message:', ws_message.utf8Data);

                        var req = JSON.parse(ws_message.utf8Data);
                        method = _.get(req, 'method', null);
                        result.method = method;

                        tag = _.get(req, 'tag', null);
                        if(tag)
                            result.tag = tag;

                        switch(method) {

                            // get_call - request all available data for a
                            // given call_id
                            case 'get_call':
                                call_id = _.get(req, 'call_id', null);
                                if(!call_id) {
                                    result.message = 'invalid call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                call_id = call_id.toString();
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'get_call (' + call_id + ')');
                                return calls.get_by_call_id(call_id, svcName)
                                    .then(function(call) {
                                        result.call = call;
                                        result.code = 200;
                                        resolve(result);
                                    })
                                    .catch(function(error) {
                                        reject(error);
                                    });
                                break;

                            // get_call - request all available data for a
                            // given alternate call_id_alt
                            case 'get_call_alt':
                                call_id_alt = _.get(req, 'call_id_alt', null);
                                if(!call_id_alt) {
                                    result.message = 'invalid call_id_alt (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                call_id_alt = call_id_alt.toString();
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'get_call_alt (' + call_id_alt + ')');
                                return calls.get_by_call_id_alt(call_id_alt, svcName)
                                    .then(function(call) {
                                        result.call = call;
                                        result.code = 200;
                                        resolve(result);
                                    })
                                    .catch(function(error) {
                                        reject(error);
                                    });
                                break;

                            // send a message to an active call identified
                            // by call_id
                            case 'send':
                                call_id = _.get(req, 'call_id', null);
                                if(!call_id) {
                                    result.message = 'invalid call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                message = _.get(req, 'message', null);
                                if(!message) {
                                    result.message = 'invalid text (' +
                                        message + ') for call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                call_id = call_id.toString();
                                message = message.toString();
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'send', {
                                        call_id: call_id,
                                        message: message
                                    });

                                return calls.send(call_id, message, svcName)
                                    .then(function() {
                                        result.code = 200;
                                        resolve(result);
                                    })
                                    .catch(function(error) {
                                        reject(error);
                                    });
                                break;

                            // close an active call and optionally send
                            // a closing message
                            case 'close_call':
                                call_id = _.get(req, 'call_id', null);
                                if(!call_id) {
                                    result.message = 'invalid call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                message = _.get(req, 'message', null);
                                if(!message) {
                                    var call = call_state.get_call(call_id, svcName);
                                    if(call) {
                                        message = lang.get_localized(
                                            'call_closed_by_center',
                                            call.lang)
                                    }
                                }

                                call_id = call_id.toString();
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'close_call', {
                                        call_id: call_id,
                                        message: message
                                    });

                                return calls.close_call(call_id, message, svcName)
                                    .then(function() {
                                        result.code = 200;
                                        resolve(result);
                                    })
                                    .catch(function(error) {
                                        reject(error);
                                    });
                                break;

                            // get information about all currently active calls
                            case 'get_active_calls':
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'get_active_calls');
                                result.calls = calls.get_active(svcName);
                                result.code = 200;
                                break;

                            // get the count of all current active calls
                            case 'get_active_calls_count':
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'get_active_calls_count');
                                result.count = calls.get_active_count(svcName);
                                result.code = 200;
                                break;

                            // subscribe to a call (identified by call_id) to
                            // be notified about call events like new message
                            // or call state changes
                            case 'subscribe_call':
                                call_id = _.get(req, 'call_id', null);
                                if(!call_id) {
                                    result.message = 'invalid call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                call_id = call_id.toString();
                                result.call_id = call_id;
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'subscribe_call (' + call_id + ')');
                                call_state.add_watcher_to_call(
                                    connection, svcName, call_id);
                                result.code = 200;
                                break;

                            // unsubscribe a previously subscribed call to
                            // no longer be notified about call events
                            case 'unsubscribe_call':
                                call_id = _.get(req, 'call_id', null);
                                if(!call_id) {
                                    result.message = 'invalid call_id (' +
                                        call_id + ') ignored';
                                    reject(result.message);
                                }

                                call_id = call_id.toString();
                                result.call_id = call_id;
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'unsubscribe_call (' + call_id + ')');
                                call_state.remove_watcher_from_call(
                                    connection, svcName, call_id);
                                result.code = 200;
                                break;

                            // subscribe to be notified when a new call
                            // is received
                            case 'subscribe_new_calls':
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'subscribe_new_calls');
                                call_state.add_new_call_watcher(
                                    connection, svcName);
                                result.code = 200;
                                break;

                            // unsubscribe new call notification
                            case 'unsubscribe_new_calls':
                                tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                                    'unsubscribe_new_calls');
                                call_state.remove_new_call_watcher(
                                    connection, svcName);
                                result.code = 200;
                                break;

                            // unknown/invalid method in request
                            default:
                                result.message = 'WS ' + connection.remoteAddress + ': ' +
                                    'invalid method (' + method + ') ignored';
                                result.code = 404;
                                break;
                        }
                    }
                    // binary websocket messages are not supported
                    else if (ws_message.type === 'binary') {
                        error_message = 'WS ' + connection.remoteAddress + ': ' +
                            'binary Message of (' + ws_message.binaryData.length + ') ' +
                            'bytes - ignored';
                        tools.logDebug(error_message);

                        result.message = error_message;
                        result.code = 404;
                    }

                    resolve(result);
                //}
                //catch(error) {
                //    reject(error);
                //}
            })
            .then(function(result) {
                if(config.debug)
                    result.runtime_ms = tools.elapsedHrTime(start);
                connection.sendUTF(JSON.stringify(result));

                // after subscribing a call send current call
                // state event after sending method response
                if(result.method == 'subscribe_call' && result.call_id) {
                    var call = call_state.get_call(result.call_id, svcName)
                    if(call) {
                        var state = {
                            event: 'state_change',
                            created_ts: call.created_ts,
                            call_id: call.call_id,
                            call_id_alt: call.call_id_alt,
                            caller_uri: call.caller_uri,
                            state: call.state,
                            code: 200
                        }

                        connection.sendUTF(JSON.stringify(state));
                    }
                }
            })
            .catch(function(error) {
                result.message = (method ? method + ' ' : '');
                if(config.debug)
                    result.message += (error && error.toString()) || 'error';
                else
                    result.message += 'error';
                result.code = 500;
                connection.sendUTF(JSON.stringify(result));
                tools.logError('WS ' + connection.remoteAddress + ': ' +
                    result.message);
            });
        });

		connection.on('close', function(reasonCode, description) {
            tools.logDebug('WS ' + connection.remoteAddress + ': ' +
                'disconnected');
		});
	});
}

function terminate() {
    if(!_wsServer)
        return;

    _wsServer.shutDown();
    _wsServer = null;
}



// ======================================================================
// Exports

module.exports = {
    init: init,
    terminate: terminate
};
