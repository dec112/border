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
    moment = require('moment'),
    data = require('../data/queries');



// ============================================================================
// Methods

function get_active(svcName) {
    return call_state.get_calls(svcName);
}

function get_active_count(svcName) {
    return call_state.get_calls_count(svcName);
}

function get_by_call_id(call_id, svcName) {
    return data.get_call_by_call_id(call_id, svcName)
        .then(function(call) {
            var active_call = call_state.get_call(call.call_id, svcName);
            if(active_call)
                call.state = active_call.state;
            else
                call.state = call_state.CLOSED;
            return Promise.resolve(call);
        });
}

function get_by_call_id_alt(call_id_alt, svcName) {
    return data.get_call_by_call_id_alt(call_id_alt, svcName)
        .then(function(call) {
            var active_call = call_state.get_call(call.call_id, svcName);
            if(active_call)
                call.state = active_call.state;
            else
                call.state = call_state.CLOSED;
            return Promise.resolve(call);
        });
}

function send(call_id, message, svcName, close_call) {
    return new Promise(function(resolve, reject) {
        var active_call = call_state.get_call(call_id, svcName);
        if(!active_call)
            reject(new Error('call not active'));
        var caller_uri = active_call.caller_uri;

        active_call.tx_msg_cnt++;

        var msg_parsed = {
            "received_ts": moment.utc(),
            "origin": "local",
            "message_id": active_call.tx_msg_cnt,
            texts: [ message ],
            locations: [],
            data: []
        }

        var msg_type = (close_call ? 19 : 18);
        var opt = {
            'eventHandlers': {
                'succeeded': function(evt) {
                    return data.db.tx(function(tx) {
                        return data.store_entry(tx, 'local',
                            active_call.call_db_id,
                            '', msg_parsed)
                            .then(function() {
                                call_state.notify_new_message(
                                    active_call, msg_parsed);
                                resolve();
                            });
                    });
                },
                'failed': function(evt) {
                    var reason = _.get(evt, 'cause', null);
                    var res_code = _.get(evt, 'response.status_code', null);
                    var res_reason = _.get(evt, 'response.reason_phrase', null);
                    var msg = 'send failed';

                    if(reason)
                        msg = msg + ': ' + reason
                    else
                        msg = msg + (res_code ? res_code : '');
                        if(res_code && res_reason)
                            msg = msg + ' / ';
                        msg = msg + (res_reason ? res_reason : '');

                    reject(new Error(msg));
                }
            },
            'extraHeaders': [
                `Reply-To: ${config.sip.uri}`,
                `Call-Info: <urn:dec112:uid:callid:${call_id}:service.dec112.at>; purpose=dec112-CallId`,
                `Call-Info: <urn:dec112:uid:msgid:${active_call.tx_msg_cnt}:service.dec112.at>; purpose=dec112-MsgId`,
                `Call-Info: <urn:dec112:uid:msgtype:${msg_type}:service.dec112.at>; purpose=dec112-MsgType`
            ]
        };

        var service_desc = _.get(config.services,
            [svcName, '_service', 'description'], '');
        sip.send(caller_uri, message, 'text/plain', opt,
            call_id, service_desc);
    });
}

function close_call(call_id, message, svcName, reason) {
    return new Promise(function(resolve, reject) {
        // get active call from registry
        var active_call = call_state.get_call(call_id, svcName);
        tools.logDebug(`${call_id}: Close call for service (${svcName})`);
        if(!active_call)
            reject(new Error('call not active'));
        var caller_uri = active_call.caller_uri;

        active_call.tx_msg_cnt++;
        var msg_id = active_call.tx_msg_cnt;

        // create message object
        var msg_parsed = message;
        if(_.isString(msg_parsed)) {
            msg_parsed = {
                "received_ts": moment.utc(),
                "origin": "local",
                "message_id": msg_id,
                texts: [ message ],
                locations: [],
                data: []
            }
        }

        // try to get service
        var service = _.get(config.services,
            [svcName, '_service'], null);

        // call service close method
        var service_call = Promise.resolve(null);
        if(service) {
            service_call = service.close(active_call, msg_parsed);
        }

        // get service triggers
        var triggers = _.get(config.services,
            [svcName, '_triggers'], {});

        resolve(service_call
            .then(function() {
                // call emergency center api (if configured) to indicate
                // an active call has closed
                var pendingTriggers = [];
                _.forOwn(triggers, function(trigger) {
                    if(!trigger.enabled)
                        return;

                    if(active_call.is_test && trigger.ignore_test_calls)
                        return

                    pendingTriggers.push(
                            trigger.close(active_call, msg_parsed));
                });
                return Promise.all(pendingTriggers);
            })
            .then(function() {
                // remove call from active call registry
                call_state.remove_call(active_call,
                    (!reason ? call_state.CLOSED_BY_SYSTEM : reason));
            }));

        // // if special 'silent' message dont send anything back
        // if(message === '//SILENT')
        //     return;

        // // send terminal message or default message if none specified
        // var opt = {
        //     'eventHandlers': {
        //         'succeeded': function(evt) {
        //             return data.db.tx(function(tx) {
        //                 return data.store_entry(tx, 'local',
        //                     active_call.call_db_id,
        //                     '', msg_parsed)
        //                     .then(function() {
        //                         call_state.notify_new_message(
        //                             active_call, msg_parsed);
        //                         resolve();
        //                     });
        //             });
        //         },
        //         'failed': function(evt) {
        //             var reason = _.get(evt, 'cause', null);
        //             var res_code = _.get(evt, 'response.status_code', null);
        //             var res_reason = _.get(evt, 'response.reason_phrase', null);
        //             var msg = 'send failed';

        //             if(reason)
        //                 msg = msg + ': ' + reason
        //             else
        //                 msg = msg + (res_code ? res_code : '');
        //                 if(res_code && res_reason)
        //                     msg = msg + ' / ';
        //                 msg = msg + (res_reason ? res_reason : '');

        //             reject(new Error(msg));
        //         }
        //     },
        //     'extraHeaders': [
        //         'Reply-To: ' + config.sip.uri,
        //         `Call-Info: <urn:dec112:uid:callid:${call_id}:service.dec112.at>; purpose=dec112-CallId`,
        //         `Call-Info: <urn:dec112:uid:msgid:${msg_id}:service.dec112.at>; purpose=dec112-MsgId`,
        //         'Call-Info: <urn:dec112:uid:msgtype:19:service.dec112.at>; purpose=dec112-MsgType'
        //     ]
        // };

        // var service_desc = _.get(config.services,
        //     [svcName, '_service', 'description'], '');
        // sip.send(caller_uri, message, 'text/plain', opt,
        //     call_id, service_desc);
    });
}

function close_all_calls(message, svcName, reason) {
    var active_calls;

    if(svcName)
        active_calls = call_state.get_calls(svcName);
    else
        active_calls = call_state._get_calls();

    var queue = [];
    if(active_calls)
        for(var i=0; i < active_calls.length; i++) {
            var call = active_calls[i];
            var msg = message;
            if(!msg)
                msg = lang.get_localized('call_closed_by_system',
                    call.lang)
            queue.push(close_call(call.call_id, msg, call.service, reason));
        }

    return Promise.all(queue);
}


// ======================================================================
// Exports

module.exports = {
    get_active: get_active,
    get_active_count: get_active_count,
    get_by_call_id: get_by_call_id,
    get_by_call_id_alt: get_by_call_id_alt,
    send: send,
    close_call: close_call,
    close_all_calls: close_all_calls
};
