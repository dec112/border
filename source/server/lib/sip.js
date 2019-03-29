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

var call_state = require('./state'),
    calls = require('./calls'),
    moment = require('moment'),
    JsSIP = require('jssip'),
    mime = require('./mime'),
    data = require('../data/queries'),
    NodeWebSocket = require('jssip-node-websocket');

var ua = null;
var _messageEventHandlers = {
    'succeeded': _messageSucceeded,
    'failed': _messageFailed
}
var _messageOptions = {
    'eventHandlers': _messageEventHandlers,
    'extraHeaders': [
        'Reply-To: ' + config.sip.uri
    ]
};

// prepare Call-Info parsing regular expressions
var call_id_re = /<urn:dec112:uid:callid:(.*):service.dec112.at>/;
var device_id_re = /<urn:dec112:uid:deviceid:(.*):service.dec112.at>/;
var msg_id_re = /<urn:dec112:uid:msgid:(\d+):service.dec112.at>/;
var msg_type_re = /<urn:dec112:uid:msgtype:(\d+):service.dec112.at>/;
var msg_lang_re = /<urn:dec112:uid:language:(.*):service.dec112.at>/;
var svc_id_re = /<urn:dec112:endpoint:(.*):service.dec112.at>/;
var client_ver_re = /<urn:dec112:clientversion:(\d+\.\d+\.\d+):service.dec112.at>/;

const MT_HAS_LOCATION = 4;
const MT_HAS_DATA = 8;
const MT_HAS_TEXT = 16;
const MT_ROAMING_CALL = 32;

// ignore or accept test calls
const X_DEC112_TEST_HEADER = 'X-Dec112-Test';

// DEC112 service header
//const X_DEC112_SERVICE_HEADER = 'X-Dec112-Service';

const SIP_HISTORY_INFO_HEADER = 'History-Info';


// ======================================================================
// Private Functions

function _connecting(evt) {
    tools.logDebug('connecting');
}

function _connected(evt) {
    tools.logDebug('connected');
}

function _registered(evt) {
    tools.logDebug('registered');
}

function _unregistered(evt) {
    tools.logDebug('unregistered');
}

function _registrationFailed(evt) {
    tools.logError('registrationFailed', evt);
}

function _messageSucceeded(evt) {
    tools.logDebug('message succeeded');
}

function _messageFailed(evt) {
    var origin = _.get(evt, 'originator', null);
    if(!origin) {
        tools.logError('Message failed:', evt);
        return;
    }

    switch(origin) {
        case 'system':
            tools.logError('System message failed:', evt);
            break;
        case 'local':
            var to = _.get(evt, 'response.headers.To[0].parsed._uri.user', '-');
            tools.logError('Local message to (' +
                `${to}@` +
                `${_.get(evt, 'response.headers.To[0].parsed._uri.host', '-')}) failed (` +
                `${_.get(evt, 'response.status_code', '-')}:` +
                `${_.get(evt, 'response.reason_phrase', '-')})`);
            if(to === '-')
                tools.logError('evt', evt);
            break;
        case 'remote':
            tools.logError('Remote message failed:', evt);
            break;
        default:
            tools.logError(`Message (${origin}) failed:`, evt);
            break;
    }
}

function _newMessage(evt) {
    if(evt.originator == 'local') {
        //tools.logDebug('local sent message ignored');
	}
    else {
        //tools.logDebug('newMessage received');

        // acknowledge to sender that message was received
        evt.message.accept();


        // ---------------------------------------------------------------------
        // Get message base attributes like sender,
        // content type and length of whole message
        var caller_uri = _.get(evt, 'request.from.uri', '').toString();
        var caller_name = _.get(evt, 'request.from.display_name', '') +
            ` <${caller_uri}>`;
        var called_uri = _.get(evt, 'request.to.uri', '').toString();
        var content_type = mime.MimeHeader.parse('Content-Type: ' +
            _.get(evt, 'request.headers.Content-Type[0].raw', 'text/plain'));
        var sip_call_id = _.get(evt, 'request.call_id', null);
        var sip_cseq = _.get(evt, 'request.cseq', null);
        var msg_raw = _.get(evt, 'request.body', '').toString();
        var content_length = _.get(evt,
            'request.headers.Content-Length[0].parsed', 0);
        if(content_length < 1)
            content_length = 0;

        tools.logInfo('New SIP ' +
            `(${content_type.value} - ${content_length} bytes) ` +
            `message from (${caller_name})`,
            (config.debug ? msg_raw : null));
        tools.logInfo(`Sip message from (${caller_name}), sip call id (${sip_call_id}), sip cseq (${sip_cseq})`);
        if(content_length < 1)
            tools.logWarning('Content-Length header missing or <= 0');
        else
            if(content_length != msg_raw.length)
                tools.logWarning(`Specified Content-Length (${content_length}) ` +
                    `not equal message content length (${msg_raw.length})`);

        // ---------------------------------------------------------------------
        // get some DEC112 specific attributes from message
        //tools.logDebug('Request', evt.request);

        var match, call_info
        var call_id = null;
        var call_id_alt = null;
        var device_id = null;
        var msg_id = null;
        var msg_type = 0;
        var msg_lang = null;
        var msg_type_type = 0;
        var msg_type_has_location = false;
        var msg_type_has_data = false;
        var msg_type_has_text = false;
        var msg_type_roaming_call = false;
        var msg_is_test = false;
        var msg_service = null;
        var msg_client_version = null;

        //tools.logDebug('Message headers', evt.request.headers);
        if(evt.request.headers['Call-Info']) {
            call_info = evt.request.headers['Call-Info'];

            //tools.logDebug('Call-Info headers ' +
            //    `len=(${call_info.length.toString()})`,
            //    call_info);

            for(var i=0; i < call_info.length; i++) {
                var header = call_info[i].raw;
                tools.logDebug("Check Call-Info headers", header);

                // try to match call_id
                match = call_id_re.exec(header);
                if(match && !call_id)
                    call_id = match[1];

                // try to match device_id
                match = device_id_re.exec(header);
                if(match && !device_id)
                    device_id = match[1];

                // try to match message id
                match = msg_id_re.exec(header);
                if(match && !msg_type)
                    msg_id = parseInt(match[1]);

                // try to match message type
                match = msg_type_re.exec(header);
                if(match && !msg_type)
                    msg_type = parseInt(match[1]);
                    msg_type_type = msg_type & 3;
                    msg_type_has_location = !!((msg_type & MT_HAS_LOCATION) >> 2);
                    msg_type_has_data = !!((msg_type & MT_HAS_DATA) >> 3);
                    msg_type_has_text = !!((msg_type & MT_HAS_TEXT) >> 4);
                    msg_type_roaming_call = !!((msg_type & MT_ROAMING_CALL) >> 5);

                // try to match message language
                match = msg_lang_re.exec(header);
                if(match && !msg_lang)
                    msg_lang = match[1];

                // try to match service type
                match = svc_id_re.exec(header);
                if(match && !msg_service)
                    msg_service = match[1];

                // try to match client version
                match = client_ver_re.exec(header);
                if(match && !msg_client_version)
                    msg_client_version = match[1];
            }
        }

        if(!msg_lang)
            msg_lang = lang.default_lang;
        lang.lang.setLocale(msg_lang);

        // check test header
        if(evt.request.headers[X_DEC112_TEST_HEADER]) {
            var x_test = evt.request.headers[X_DEC112_TEST_HEADER];
            if(x_test.length > 0) {
                msg_is_test = (x_test[0].raw.toLowerCase() == 'true');
            }
        }

        // get history info header(s)
        var sip_history = [];
        var history_headers = _.get(evt,
            [ 'request', 'headers', SIP_HISTORY_INFO_HEADER], []);
        for(var i=0; i < history_headers.length; i++) {
            var h = _.get(history_headers[i], 'raw', null);
            if(h)
                sip_history.push(h);
        }

        // if no service provided use configured default service
        if(!msg_service)
            msg_service = 'default';

        // get service & resolve service
        var service = _.get(config.services,
            `${msg_service}._service`, null);
        if(!service) {
            _reject(call_id,
                `Unsupported service ` +
                `(${msg_service}) - call rejected`,
                null,
                caller_uri, 'invalid_message',
                msg_service, msg_lang);
            return;
        }
        msg_service = _.get(service, 'id', msg_service);

        // reject if not a DEC112 message

        // ===================================================================
        // ########## just for debugging
        // @@@
        ////call_id = tools.strRandom(16);
        //call_id = '4711';
        //device_id = '5b80637fdf3bfe13de276791a5178028e8e7b3a0';
        //msg_type = 29;

        //msg_type_type = msg_type & 3;
        //msg_type_has_location = !!((msg_type & 4) >> 2);
        //msg_type_has_data = !!((msg_type & 8) >> 3);
        //msg_type_has_text = !!((msg_type & 16) >> 4);

        tools.logDebug(`call_id (${call_id})`);
        tools.logDebug(`device_id (${device_id})`);
        tools.logDebug(`lang (${msg_lang})`);
        tools.logDebug(`msg_id (${msg_id})`);
        tools.logDebug(`msg_type_type (${msg_type_type})`);
        tools.logDebug(`msg_type_has_location (${msg_type_has_location})`);
        tools.logDebug(`msg_type_has_data (${msg_type_has_data})`);
        tools.logDebug(`msg_type_has_text (${msg_type_has_text})`);
        tools.logDebug(`msg_type_roaming_call (${msg_type_roaming_call})`);
        tools.logDebug(`msg_is_test (${msg_is_test})`);
        tools.logDebug(`msg_service (${msg_service})`);
        tools.logDebug(`msg_client_version (${msg_client_version})`);
        // ##########
        // ===================================================================

        var reject_msg = null;

        // if call is a roaming call dont process it any further
        // but reject it
        if(msg_type_roaming_call) {
            _reject(call_id,
                'Roaming call - rejected', {
                    call_id: call_id,
                    device_id: device_id,
                    lang: msg_lang,
                    msg_type_type: msg_type_type,
                    msg_type_has_location: msg_type_has_location,
                    msg_type_has_data: msg_type_has_data,
                    msg_type_has_text: msg_type_has_text,
                    msg_type_roaming_call: msg_type_roaming_call
                },
                caller_uri, 'invalid_roaming_call',
                msg_service, msg_lang);
            return;
        }

        // if some data missing reject message
        if(!call_id)
            reject_msg = "callid";
        if(!device_id)
            reject_msg = "deviceid";
        // optional until supported by app
        if(!msg_id)
            msg_id = 0;
            //reject_msg = "msgid";
        if(!msg_type)
            reject_msg = "msgtype";

        if(reject_msg) {
            _reject(call_id,
                `DEC112 (${reject_msg}) Call-Info header missing; ` +
                `message received from (${caller_name}) ` +
                '- rejected', {
                    call_id: call_id,
                    device_id: device_id,
                    lang: msg_lang,
                    msg_type_type: msg_type_type,
                    msg_type_has_location: msg_type_has_location,
                    msg_type_has_data: msg_type_has_data,
                    msg_type_has_text: msg_type_has_text,
                    msg_type_roaming_call: msg_type_roaming_call
                },
                caller_uri, 'invalid_message',
                msg_service, msg_lang);
            return;
        }

        tools.logInfo(`${call_id}: New DEC112 ` +
            `message from (${caller_name})`,
                `device_id (${device_id}), ` +
                `lang (${msg_lang}), type (${msg_type_type}), ` +
                `msg_id (${msg_id}), type (${msg_id}), ` +
                `has_text (${msg_type_has_text}), ` +
                `has_location (${msg_type_has_location}), ` +
                `has_data (${msg_type_has_data}), ` +
                `roaming_call (${msg_type_roaming_call}), ` +
                `is_test (${msg_is_test}), ` +
                `msg_service (${msg_service}), ` +
                `version (${msg_client_version})`);

        var call = {
            call_id: call_id,
            call_id_alt: null,
            device_id: device_id,
            caller_uri: caller_uri,
            caller_name: caller_name,
            caller_id: null,
            called_uri: called_uri,
            lang: msg_lang,
            is_test: msg_is_test,
            service: msg_service,
            sip_history: sip_history,
            client_version: msg_client_version
        }

        var locations = [];
        var texts = [];
        var call_data = [];

        // analyse message further if content-length > 0. otherwise
        // ignore content type and handle message as valid but empty
        // DEC112 message
        if(content_length > 0) {

            // message is multipart so try to parse it
            if(content_type.value == 'multipart/mixed') {
                var msg_mime;
                try {
                    msg_mime = mime.MultipartMime.parse(msg_raw);
                }
                catch(error) {
                    _reject(call.call_id,
                        `parsing multipart message: ${error}`,
                        error,
                        call.caller_uri, 'invalid_message',
                        call.service, call.lang);
                    return;
                }
                //tools.logDebug('Parsed multipart mime message', msg_mime);

                for(var i = 0; i < msg_mime.parts.length; i++) {
                    var entry = msg_mime.parts[i];

                    switch(entry.contentType) {
                        case 'text/plain':
                            if(entry.value)
                                texts.push(_.toString(entry.value));
                            break;
                        case 'application/pidf+xml':
                            var location = tools.parsePidf(entry.value);
                            if(tools.isLocationValid(location))
                                locations.push(location);
                            break;
                        case 'application/addCallSub+xml':
                            var infos = tools.parseAddCallSub(entry.value);
                            if(infos)
                                call_data.push(infos)
                            break;
                        default:
                            tools.logWarning(`${call.call_id}: ` +
                                `Message from (${call.caller_name}) ` +
                                `contains invalid mime-type (${entry.contentType}) ` +
                                '- ignored!')
                            break;
                    }
                }
            }
            // a simple text/plain message is added as text
            else if(content_type.value == 'text/plain') {
                texts.push(_.toString(msg_raw));
            }
            // if message is of wrong type reject it
            else {
                _reject(call.call_id,
                    'Unsupported mime-type ' +
                    `(${content_type.valueToString()}); ` +
                    `message received from (${call.caller_name}) ` +
                    '- rejected', null,
                    call.caller_uri, 'invalid_message',
                    call.service, call.lang);
            }
        }

        // ensure DEC112 message call-info header match content
        reject_msg = null;

        if(msg_type_has_location && locations.length <= 0)
            reject_msg = "locations";
        if(msg_type_has_data && call_data.length <= 0)
            reject_msg = "data";
        if(msg_type_has_text && texts.length <= 0)
            reject_msg = "texts";

        if(reject_msg) {
            _reject(call.call_id,
                `DEC112 msgtype Call-Info header indicates (${reject_msg}) ` +
                `but none found in message; `+
                `message received from (${call.caller_name}) ` +
                '- rejected', {
                    call_id: call_id,
                    device_id: device_id,
                    lang: msg_lang,
                    msg_type_type: msg_type_type,
                    msg_type_has_location: msg_type_has_location,
                    msg_type_has_data: msg_type_has_data,
                    msg_type_has_text: msg_type_has_text
                },
                call.caller_uri, 'invalid_message',
                call.service, call.lang);
            return;
        }

        var msg_parsed = {
            received_ts: moment.utc(),
            origin: "remote",
            message_id: msg_id,
            texts: texts,
            locations: locations,
            data: call_data
        };

        tools.logDebug(`${call.call_id}: Parsed message`,
            msg_parsed);


        // ---------------------------------------------------------------------
        // check if message belongs to an active call
        var active_call = call_state.get_call_only_by_id(call.call_id);
        if(active_call) {
            // get service
            service = _.get(config.services,
                `${active_call.service}._service`, null);
            if(!service) {
                _reject(active_call.call_id,
                    `Unsupported service type (${active_call.service}) - ` +
                    `call rejected`,
                    null,
                    active_call.caller_uri, 'invalid_message',
                    active_call.service, active_call.lang);
                return;
            }

            // belongs to active call so just store chat entry
            return data.db.tx(function(tx) {
                return data.store_entry(tx, 'remote',
                    active_call.call_db_id,
                    msg_raw, msg_parsed);
            })
            .then(function(db_result) {
                // notify possible subscribers about new message
                tools.logDebug(`${active_call.call_id}: ` +
                    `Notify subscribers about new message`);
                call_state.notify_new_message(active_call, msg_parsed);

                // check if close call message
                if(msg_type_type == 3) {
                    tools.logDebug(`${active_call.call_id}: ` +
                        `Close call message type detected`);
                    return calls.close_call(active_call.call_id, null,
                        active_call.service, call_state.CLOSED_BY_CALLER);
                }
                else {
                    // set call state to 'in_call'
                    call_state.set_state_in_call(active_call);
                    return service.process(active_call, msg_parsed);
                }
            })
            .then(function() {
                // done with call processing
                tools.logOK(`${active_call.call_id}: ` +
                    `Message for ACTIVE call successfully processed`,
                    `from (${active_call.caller_name}), call_id_alt ` +
                    `(${active_call.call_id_alt})`);
                tools.logDebug(`${active_call.call_id}: ` +
                    `Active call:`,
                    _.omit(active_call, ['watcher']));
                return;
            });
        }
        else {
            // get service
            service = _.get(config.services,
                `${call.service}._service`, null);
            if(!service) {
                _reject(call.call_id,
                    `Unsupported service type ` +
                    `(${call.service}) - call rejected`,
                    null,
                    call.caller_uri, 'invalid_message',
                    call.service, call.lang);
                return;
            }

            // get service triggers
            var triggers = _.get(config.services,
                `${call.service}._triggers`, {});

            // check if user is registered for service
            service.check_registration(call)
                .then(function(call) {
                    // call emergency center api (if configured) to indicate
                    // a new call has arrived and to acquire an alternate
                    // call id to match this dec112 call with emergency
                    // center call
                    var pendingTriggers = [];
                    _.forOwn(triggers, function(trigger) {
                        if(!trigger.enabled)
                            return;

                        if(msg_is_test && trigger.ignore_test_calls)
                            return

                        pendingTriggers.push(
                                trigger.open(call, msg_parsed));
                    });
                    return Promise.all(pendingTriggers);
                })
                .then(function(trigger_results) {
                    // alternate call id from first trigger result which
                    // provides one will be used
                    _.forEach(trigger_results, function(result) {
                        var call_id_alt = _.get(result, 'call_id_alt', null);
                        if(call_id_alt) {
                            call.call_id_alt = call_id_alt;
                            return false;
                        }
                    });

                    // store into database
                    return data.db.tx(function(tx) {
                        return data.open_call(tx, 'remote', call,
                            msg_raw, msg_parsed)
                    });
                })
                .then(function(db_result) {
                    if(!db_result)
                        throw new Error('Storing new call in DB failed ' +
                            `call_id=(${call.call_id}), ` +
                            `call_id_alt=(${call.call_id_alt}), ` +
                            `caller=(${call.caller_uri})`);

                    call.created_ts = db_result.created_ts;
                    call.db_id = db_result.db_id;

                    // final actions - add to call state
                    call_state.add_call(call);

                    // notify possible subscribers about new call
                    tools.logDebug(`${call.call_id}: Notify subscribers about new call`);
                    call_state.notify_new_call(call);

                    // set call state from 'unknown' to 'new'
                    call_state.set_state_new_call(call);

                    // process new call message by services
                    service.open(call, msg_parsed);

                    // done with call processing
                    tools.logOK(`${call.call_id}: Message for NEW ` +
                        `call successfully processed`,
                        `from (${call.caller_name}), ` +
                        `call_id_alt (${db_result.id_alt})`);
                    tools.logDebug(`${call_id}: New call:`,
                        call);
                    return;
                })
                .catch(function(error) {
                    _reject(call.call_id, error.toString(),
                        null,
                        call.caller_uri, 'invalid_caller',
                        call.service, call.lang);

                    return;
                });
        }
    }
}


function _reject(call_id, log_message, log_object,
        receiver_uri, message_id, svcName, use_lang) {

    if(log_message) {
        if(call_id)
            log_message = `${call_id}: Error - ${log_message}`;
        else
            log_message = `Error - ${log_message}`;
        tools.logError(log_message,
            (config.debug ? log_object : null));
    }

    var messageOptions = {
        'eventHandlers': _messageEventHandlers,
        'extraHeaders': [
            'Reply-To: ' + config.sip.uri,
            'Call-Info: <urn:dec112:uid:callid:' + call_id + ':service.dec112.at>; purpose=dec112-CallId',
            'Call-Info: <urn:dec112:uid:msgtype:19:service.dec112.at>; purpose=dec112-MsgType'
        ]
    };

    var service = _.get(config.services, [svcName, '_service'], null);
    send_error(receiver_uri, message_id, null, messageOptions,
        call_id, service, use_lang);
}



// ======================================================================
// Module Functions

function init() {
    //tools.logDebug('SIP init');

    if(ua)
        return;

    var socket = new NodeWebSocket(config.kamailio.ws);
    var configuration = {
      sockets: [ socket ],
      display_name: _.get(config, 'sip.display_name', 'DEC112'),
      uri: config.sip.uri,
      password: config.sip.password,
      stun_servers: config.sip.stun_servers,
      register_expires: 30
    };

    ua = new JsSIP.UA(configuration);
    // no need to capture this event as it fires
    // a million times per second when not connected
    //ua.on('connecting', _connecting);
    ua.on('connected', _connected);
    ua.on('registered', _registered);
    ua.on('unregistered', _unregistered);
    ua.on('registrationFailed', _registrationFailed);
    ua.on('newMessage', _newMessage);
    ua.start();

    if(_.get(config, 'sip.debug', false) === true)
        JsSIP.debug.enable('JsSIP:*');

    return ua;
}

function terminate(terminate_calls) {
    tools.logDebug('SIP terminate');

    if(!ua)
        return Promise.reject(new Error('Sip UA not initialized'));

    if(terminate_calls) {
        tools.logWarning('Close all active calls');
        return calls.close_all_calls()
            .then(function() {
                tools.logDebug('SIP unregister UA');
                ua.unregister({
                    all: true
                });
                ua.stop();
                ua = null;
            })
    }
}

function send(receiver_uri, content, content_type, options,
        call_id, display_name) {
    var opt = options || _messageOptions;
    if(content_type)
        opt['contentType'] = content_type;
    var ci = (call_id ? `${call_id}: ` : '');
    tools.logDebug(`${ci}Send SIP message to (${receiver_uri})`,
        content);
    ua.set('display_name',
        (display_name ? display_name :
            _.get(config, 'sip.display_name', 'DEC112')));
    ua.sendMessage(receiver_uri, content, opt);
}

/*
function send_localized(receiver_uri, message_id, language_code,
        content_type, options, call_id, display_name) {
    if(_.indexOf(lang.available, language_code) < 0) {
        if(!default_lang) {
            tools.logError(`Language ${language_code} not available ` +
                'and default language not set');
            return;
        }
        else
            language_code = default_lang;
    }

    msg = lang.get_localized(message_id, language_code, default_lang);
    if(!msg)
        return;
    send(receiver_uri, msg, content_type, options,
        call_id, display_name);
    lang.lang.setLocale(default_lang);
}
*/

function send_error(receiver_uri, message_id,
        content_type, options, call_id, service, use_lang) {

    if(!(receiver_uri && message_id))
        return;

    var error_languages = [];
    // default is global lang
    var lang_ptr = lang;
    var display_name = _.get(config, 'sip.display_name', '');

    // if service is provided use service lang
    if(service) {
        error_languages = service.error_languages;
        lang_ptr = service.lang;
        display_name = service.description;
    }
    else {
        error_languages = _.get(config, 'sip.default_error_languages',
            [ lang_ptr.default_lang ]);
    }

    if(use_lang)
        error_languages = [ use_lang ];

    var msg = '';

    error_languages.forEach(function(language_code) {
        if(_.indexOf(lang_ptr.available, language_code) >= 0) {
            lang_ptr.lang.setLocale(language_code);
            msg = msg + (msg.length > 0 ? '\r\n\r\n\r\n' : '') +
                lang_ptr.lang.translate(message_id);
        }
        else {
            tools.logError(`Error language ${language_code} for message id ${message_id} ` +
                'not available text ignored');
        }
    });

    if(!msg) {
        if(!lang_ptr.default_lang) {
            tools.logError(`Error languages ${JSON.stringify(error_languages)} ` +
                'not available and default language not set');
            return;
        }
    }

    send(receiver_uri, msg, content_type, options,
        call_id, display_name);
    lang_ptr.lang.setLocale(lang_ptr.default_lang);
}


// ======================================================================
// Exports

module.exports = {
    init: init,
    terminate: terminate,
    send: send,
    //send_localized: send_localized,
    send_error: send_error
};
