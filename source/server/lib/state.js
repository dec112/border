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

var moment = require('moment');

var new_call_watcher = {};
var active_calls = {};
var call_stale_timeout_ms = _.get(config, 'sip.call_stale_timeout_ms', 1000);
var call_close_timeout_ms = _.get(config, 'sip.call_close_timeout_ms', 1000);
var state_interval = setInterval(check_interval, 1000);

const UNDEFINED = 0;
const NEW_CALL = 1;
const IN_CALL = 2;
const STALE = 3;
const CLOSED_BY_CALLER = 4;
const CLOSED_BY_CENTER = 5;
const CLOSED_BY_SYSTEM = 6;
const CLOSED = 7;
const ERROR = 8;

const CALL_STATE_NAMES = [
    'undefined', 'new call', 'in call', 'stale',
    'closed by caller', 'closed by center', 'closed by system',
    'closed', 'error'
]

// ============================================================================
// Methods

function check_interval() {
    _.forOwn(active_calls, function(active_call, call_id) {
        var now = moment();
        var duration = moment.duration(now.diff(active_call.state_ts)).asMilliseconds();

        switch(active_call.state) {
            case NEW_CALL:
            case IN_CALL:
                if(duration > call_stale_timeout_ms)
                    set_state_stale(active_call);
                break;

            case STALE:
                if(duration > call_close_timeout_ms)
                    remove_call(active_call, CLOSED_BY_SYSTEM);
                break;
        }
    });
}

function add_call(call) {
    if(active_calls[call.call_id])
        return;

    var active_call = {
        created_ts: call.created_ts,
        caller_uri: call.caller_uri,
        caller_name: call.caller_name,
        call_id: call.call_id,
        call_id_alt: call.call_id_alt,
        lang: call.lang,
        is_test: call.is_test,
        service: call.service,
        call_db_id: call.db_id,
        state: NEW_CALL,
        state_ts: moment(),
        tx_msg_cnt: 0,
        watcher: {}
    }

    active_calls[call.call_id] = active_call;
}

function get_state_name(state) {
    return _.get(CALL_STATE_NAMES, state, CALL_STATE_NAMES[0]);
}

function _set_state(call_id, state, svcName) {
    tools.logDebug(`${call_id}: ` +
        `Call entered (${get_state_name(state)}) state`)
    var active_call = get_call(call_id, svcName);
    if(!active_call)
        return;
    if(active_call.state == state)
        return;
    active_call.state = state;
    active_call.state_ts = moment();
    _notify_call_state_change(call_id, svcName);
}
function set_state_undefined(call) {
    _set_state(call, UNDEFINED, call.service);
}
function set_state_new_call(call) {
    _set_state(call.call_id, NEW_CALL, call.service);
}
function set_state_in_call(call) {
    _set_state(call.call_id, IN_CALL, call.service);
}
function set_state_stale(call) {
    _set_state(call.call_id, STALE, call.service);
}
function set_state_closed_by_caller(call) {
    _set_state(call.call_id, CLOSED_BY_CALLER, call.service);
}
function set_state_closed_by_center(call) {
    _set_state(call.call_id, CLOSED_BY_CENTER, call.service);
}
function set_state_closed_by_system(call) {
    _set_state(call.call_id, CLOSED_BY_SYSTEM, call.service);
}
function set_state_error(call) {
    _set_state(call.call_id, ERROR, call.service);
}

function get_call(call_id, svcName, stripped) {
    var call = _.get(active_calls, call_id, null);
    if(call && call.service == svcName) {
        if(stripped)
            return _.omit(call, [
                'call_db_id', 'state_ts',
                'watcher', 'is_test',
                'service',
                'tx_msg_cnt']);
        else
            return call;
    }

    return null;
}

function get_call_only_by_id(call_id) {
    var call = _.get(active_calls, call_id, null);
    if(call)
        return call;

    return null;
}

function get_calls(svcName) {
    var result = _.compact(_.map(active_calls, function(call) {
        if(call.service == svcName)
            return _.omit(call, [
                'call_db_id', 'state_ts',
                'watcher', 'is_test',
                'service',
                'tx_msg_cnt']);
        else
            return null;
        }));

    return result;
}

function _get_calls() {
    var result = _.compact(_.map(active_calls, function(call) {
            return _.omit(call, [
                'call_db_id', 'state_ts',
                'watcher', 'is_test',
                'tx_msg_cnt']);
        }));

    return result;
}

function get_calls_count(svcName) {
    return get_calls(svcName).length;
}

function remove_call(call, remove_state) {
    tools.logInfo(`${call.call_id}: Remove call (${get_state_name(remove_state)})`);
    var active_call = get_call(call.call_id, call.service);
    if(!active_call)
        return;
    if(remove_state != CLOSED_BY_CALLER && remove_state != CLOSED_BY_CENTER)
        remove_state = CLOSED_BY_SYSTEM;

    _set_state(active_call.call_id, remove_state, active_call.service);
    _remove_all_watcher_from_call(active_call);
    active_calls = _.omit(active_calls, active_call.call_id);
}

function add_watcher_to_call(ws_connection, svcName, call_id) {
    if(!ws_connection || !call_id)
        return;
    var call = get_call(call_id, svcName);
    if(!call)
        return;
    var service_watcher = _.get(call, ['watcher', svcName], []);
    if(_.indexOf(service_watcher, ws_connection) >= 0)
        return;
    service_watcher.push(ws_connection);
    call.watcher[svcName] = service_watcher;
}

function remove_watcher_from_call(ws_connection, svcName, call_id) {
    if(!ws_connection || !call_id)
        return;
    var call = get_call(call_id, svcName);
    if(!call)
        return;
    if(_.indexOf(_.get(call, ['watcher', svcName], []), ws_connection) < 0)
        return;
    _.pull(call.watcher[svcName], ws_connection);
}

function _remove_all_watcher_from_call(call) {
    var active_call = get_call(call.call_id, call.service);
    if(!active_call)
        return;
    active_call.watcher = {};
}

function add_new_call_watcher(ws_connection, svcName) {
    if(!ws_connection)
        return;
    var service_watcher = _.get(new_call_watcher, [svcName], []);
    if(_.indexOf(service_watcher, ws_connection) >= 0)
        return;
    service_watcher.push(ws_connection);
    new_call_watcher[svcName] = service_watcher;
}

function remove_new_call_watcher(ws_connection, svcName) {
    if(!ws_connection)
        return;
    if(_.indexOf(_.get(new_call_watcher, [svcName], []), ws_connection) < 0)
        return;
    _.pull(new_call_watcher[svcName], ws_connection);
}

function _remove_all_new_call_watcher() {
    new_call_watcher = {};
}

function notify_new_call(call) {
    if(!call.call_id)
        return;

    var result = {
        event: 'new_call',
        created_ts: call.created_ts,
        call_id: call.call_id,
        call_id_alt: call.call_id_alt,
        caller_uri: call.caller_uri,
        code: 200
    }

    var service_watcher = _.get(new_call_watcher, [call.service], []);
    service_watcher.forEach(function(watcher) {
        watcher.sendUTF(JSON.stringify(result));
    });
}

function notify_new_message(call, message) {
    if(!call.call_id)
        return;
    if(!message)
        return;
    var active_call = get_call(call.call_id, call.service);
    if(!active_call)
        return;

    var result = {
        event: 'new_message',
        created_ts: active_call.created_ts,
        call_id: active_call.call_id,
        call_id_alt: active_call.call_id_alt,
        caller_uri: active_call.caller_uri,
        message: message,
        code: 200
    }

    var service_watcher = _.get(active_call, ['watcher', active_call.service], []);
    service_watcher.forEach(function(watcher) {
        watcher.sendUTF(JSON.stringify(result));
    });
}

function _notify_call_state_change(call_id, svcName) {
    if(!call_id)
        return;
    var call = get_call(call_id, svcName);
    if(!call)
        return;

    var result = {
        event: 'state_change',
        created_ts: call.created_ts,
        call_id: call.call_id,
        call_id_alt: call.call_id_alt,
        caller_uri: call.caller_uri,
        state: call.state,
        code: 200
    }

    var service_watcher = _.get(call, ['watcher', svcName], []);
    service_watcher.forEach(function(watcher) {
        watcher.sendUTF(JSON.stringify(result));
    });
}



// ============================================================================
// Exports

module.exports = {
    UNDEFINED: UNDEFINED,
    NEW_CALL: NEW_CALL,
    IN_CALL: IN_CALL,
    STALE: STALE,
    CLOSED_BY_CALLER: CLOSED_BY_CALLER,
    CLOSED_BY_CENTER: CLOSED_BY_CENTER,
    CLOSED_BY_SYSTEM: CLOSED_BY_SYSTEM,
    CLOSED: CLOSED,
    ERROR: ERROR,

    set_state_undefined: set_state_undefined,
    set_state_new_call: set_state_new_call,
    set_state_in_call: set_state_in_call,
    set_state_stale: set_state_stale,
    set_state_closed_by_caller: set_state_closed_by_caller,
    set_state_closed_by_center: set_state_closed_by_center,
    set_state_closed_by_system: set_state_closed_by_system,
    set_state_error: set_state_error,

    add_call: add_call,
    get_call: get_call,
    get_call_only_by_id: get_call_only_by_id,
    remove_call: remove_call,

    get_calls: get_calls,
    _get_calls: _get_calls,
    get_calls_count: get_calls_count,

    add_watcher_to_call: add_watcher_to_call,
    remove_watcher_from_call: remove_watcher_from_call,

    add_new_call_watcher: add_new_call_watcher,
    remove_new_call_watcher: remove_new_call_watcher,

    notify_new_call: notify_new_call,
    notify_new_message: notify_new_message
};
