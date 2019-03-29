/// <reference path='../../../../typings/index.d.ts'/>
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

// ============================================================================
// Variables

var TriggerBase = require('./base').Trigger,
    RestClient = require('node-rest-client-promise').Client;

const ID = 'DEC112';
const DESC = 'DEC112 default trigger module';


// ============================================================================
// Methods

var Trigger = function Trigger(trigger_config) {
    var self = this;
    TriggerBase.call(self, trigger_config);
    self.ID = ID;
    self.DESC = DESC;
}
Trigger.prototype = _.create(TriggerBase.prototype, {
    'constructor': Trigger
});

Trigger.prototype.open = function open(call, msg_parsed) {
    var self = this;

    if(!self.enabled || !self._open_url)
        return Promise.resolve(null);

    var call_id_alt;

    var trig_client = RestClient();
    var trig_data = _.cloneDeep(call);
    trig_data.trigger_type = 'OPEN';
    if(self._view_url)
        trig_data.web_view_url = self._view_url_template(call);
    if(self._api_url)
         trig_data.api_url = self._api_url_template(call);
    trig_data = _.merge(trig_data, msg_parsed);
    var trig_url = self._open_url_template(call);

    function _reject(message, result_data) {
        if(self.require_open) {
            return Promise.reject(new Error(message));
        }
        else {
            tools.logWarning(`${call.call_id}: Open Trigger ${ID} - ${message}`,
                    result_data);
            return Promise.resolve(null);
        }
    }

    var trig_args = {
        headers: {
            'Content-Type': 'application/json'
        },
        requestConfig: {
            noDelay: true,
            keepAlive: false
        },
        responseConfig: {
        },
        data: trig_data
    };
    if(self.parse_open) {
        trig_args.requestConfig['timeout'] = self.req_tmout;
        trig_args.responseConfig['timeout'] = self.res_tmout;
    }

    tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
        `Sending trigger to ${trig_url}`,
            trig_data);
    tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
        `timeouts - ` +
        `request (${self.req_tmout}) ms, ` +
        `response (${self.res_tmout}) ms`);

    var trig_tmr = tools.getHrTime();
    return trig_client.postPromise(trig_url, trig_args)
        .then(function(result) {
            var result_data = _.get(result, 'data', {});

            // if not parse open - trigger was "fire and forget"
            if(!self.parse_open) {
                tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
                    `Response after ` +
                    `(${tools.elapsedHrTime(trig_tmr)}) ms " +
                    "- ignored; fire and forget`);
                return Promise.resolve(null);
            }

            tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
                `Response after ` +
                `(${tools.elapsedHrTime(trig_tmr)}) ms; ` +
                `type (${tools.realTypeOf(result_data)}) / ` +
                `(${tools.getObjectClass(result_data)})`,
                    (tools.realTypeOf(result_data) == 'Object' ?
                        result_data :
                        result_data.toString()));

            // check if trigger technically failed
            if(!self.is_response_code_valid(result.response.statusCode)) {
                return _reject(`Open Trigger call failed ` +
                    `code=(${result.response.statusCode}), ` +
                    `reason=(${result.response.statusMessage});` +
                    ' - ignored',
                        null);
            }

            // check for unexpected response
            if(tools.getObjectClass(result_data) === 'Buffer')
                return _reject('Response data (invalid) - ignored',
                    result_data.toString());

            tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
                `Response data `,
                    result_data);

            // trigger call ok
            call_id_alt = _.get(result_data, 'call_id_alt', null);
            if(!call_id_alt) {
                return _reject('Alternate call ID ' +
                    '(call_id_alt) not found in trigger response',
                        null);
            }
            else {
                tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
                    `Alternate call ID ` +
                    `from trigger (${call_id_alt})`);
                return Promise.resolve({
                    call_id_alt: call_id_alt
                });
            }
        })
        .catch(function(error) {
            if(!self.parse_open) {
                tools.logDebug(`${call.call_id}: Open Trigger ${ID} - ` +
                    `Status calling trigger (${error})`);
                return Promise.resolve(null);
            }
            else {
                return _reject(`Open Trigger ${ID} - ${error}`, null);
            }
        });
}

Trigger.prototype.close = function close(call, msg_parsed) {
    var self = this;

    if(!self.enabled || !self._close_url)
        return Promise.resolve(null);

    var trig_client = RestClient();
    var trig_data = {
        created_ts: call.created_ts,
        caller_uri: call.caller_uri,
        caller_name: call.caller_name,
        call_id: call.call_id,
        call_id_alt: call.call_id_alt,
        lang: call.lang,
        is_test: call.is_test
    }
    trig_data.trigger_type = 'CLOSE';
    if(self._view_url)
        trig_data.web_view_url = self._view_url_template(call);
    if(self._api_url)
        trig_data.api_url = self._api_url_template(call);
    //trig_data = _.merge(trig_data, msg_parsed);
    var trig_url = self._close_url_template(call);

    var trig_args = {
        headers: {
            'Content-Type': 'application/json'
        },
        requestConfig: {
            noDelay: true,
            keepAlive: false
        },
        responseConfig: {
        },
        data: trig_data
    };
    // if(self.parse_close) {
    //     trig_args.requestConfig['timeout'] = self.req_tmout;
    //     trig_args.responseConfig['timeout'] = self.res_tmout;
    // }

    tools.logDebug(`${call.call_id}: Close Trigger ${ID} - ` +
        `Sending trigger to ${trig_url}`,
            trig_data);
    tools.logDebug(`${call.call_id}: Close Trigger ${ID} - ` +
        `timeouts - ` +
        `request (${self.req_tmout}) ms, ` +
        `response (${self.res_tmout}) ms`);

    var trig_tmr = tools.getHrTime();
    return trig_client.postPromise(trig_url, trig_args)
        .then(function(result) {
            var result_data = _.get(result, 'data', {});

            // check for unexpected response
            if(tools.getObjectClass(result_data) === 'Buffer')
                result_data = `Unexpected response: (${result_data.toString()})`;

            tools.logDebug(`${call.call_id}: Close Trigger ${ID} - ` +
                `Response after ` +
                `(${tools.elapsedHrTime(trig_tmr)}) ms`,
                result_data);
            return Promise.resolve(null);
        })
        .catch(function(error) {
            tools.logDebug(`${call.call_id}: Close Trigger ${ID} - ` +
                `Status calling trigger (${error})`);
            return Promise.resolve(null);
        });
}



// ============================================================================
// Exports

module.exports = {
    ID: ID,
    DESC: DESC,
    Trigger: Trigger
};
