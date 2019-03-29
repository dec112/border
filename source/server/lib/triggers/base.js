/// <reference path="../../../../typings/index.d.ts"/>
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

// timeout defaults
const DEFAULT_TRIG_REQ_TMOUT = 500;
const DEFAULT_TRIG_RES_TMOUT = 1000;
const DEFAULT_TRIG_OPEN_URL = null;
const DEFAULT_TRIG_CLOSE_URL = null;
const DEFAULT_TRIG_OPEN_CODES = [ 200 ];


// ============================================================================
// Methods

var Trigger = function Trigger(trigger_config, tgName) {
    var self = this;

    self.id = tgName;
    self.parse_open = false;
    self.valid_open_codes = DEFAULT_TRIG_OPEN_CODES;
    self.require_open = false;
    self.enabled = false;
    self.ignore_test_calls = true;

    self.req_tmout = DEFAULT_TRIG_REQ_TMOUT;
    self.res_tmout = DEFAULT_TRIG_RES_TMOUT;

    self._open_url = DEFAULT_TRIG_OPEN_URL;
    if(_.isString(self._open_url))
        self._open_url_template = _.template(self._open_url);
    else
        self._open_url = null;

    self._close_url = DEFAULT_TRIG_CLOSE_URL;
    if(_.isString(self._close_url))
        self._close_url_template = _.template(self._close_url);
    else
        self._close_url = null;

    self._view_url = null;
    self._view_url_template = null;

    self._api_url = null;
    self._api_url_template = null;

    // trigger enabled ?
    self.enabled = !!_.get(trigger_config,
        'enabled', false);

    // parse open trigger response?
    self.parse_open = !!_.get(trigger_config,
        'parse_open_response', false);

    // valid open trigger http response codes
    self.valid_open_codes = _.get(trigger_config,
        'valid_open_response_codes', DEFAULT_TRIG_OPEN_CODES);
    if(_.isString(self.valid_open_codes)) {
        try {
            self.valid_open_codes = RegExp(self.valid_open_codes);
        }
        catch(err) {
            tools.logWarning('Invalid "valid_open_response_codes" config. ' +                'Must be JSON array[int] or string containing regex.')
                self.valid_open_codes = DEFAULT_TRIG_OPEN_CODES;
        }
    }
    else if(!_.isArray(self.valid_open_codes)) {
        self.valid_open_codes = DEFAULT_TRIG_OPEN_CODES;
    }

    // require valid open trigger response?
    self.require_open = !!_.get(trigger_config,
        'require_open_response', false);

    // ignore test calls ?
    self.ignore_test_calls = _.get(trigger_config,
        'ignore_test_calls', true);

    // trigger request timeout
    self.req_tmout = _.get(trigger_config,
        'request_timeout', DEFAULT_TRIG_REQ_TMOUT);
    if(tools.isInt(self.req_tmout))
        self.req_tmout = (self.req_tmout < 1 ?
            DEFAULT_TRIG_REQ_TMOUT : self.req_tmout)
    else
        self.req_tmout = DEFAULT_TRIG_REQ_TMOUT;

    // trigger response timeout
    self.res_tmout = _.get(trigger_config, 'response_timeout',
        DEFAULT_TRIG_RES_TMOUT);
    if(tools.isInt(self.res_tmout))
        self.res_tmout = (self.res_tmout < 1 ?
            DEFAULT_TRIG_RES_TMOUT : self.res_tmout);
    else
        self.res_tmout = DEFAULT_TRIG_RES_TMOUT;

    // trigger open url
    self._open_url = _.get(trigger_config, 'open_url', DEFAULT_TRIG_OPEN_URL);
    if(_.isString(self._open_url))
        self._open_url_template = _.template(self._open_url);
    else
        self._open_url = null;

    // trigger close url
    self._close_url = _.get(trigger_config, 'close_url', DEFAULT_TRIG_CLOSE_URL);
    if(_.isString(self._close_url))
        self._close_url_template = _.template(self._close_url.toString());
    else
        self._close_url = null;

    // prepare webview url for call
    self._view_url = _.get(trigger_config, 'web_view_url', null);
    self._view_url_template = null;
    if(_.isString(self._view_url))
        self._view_url_template = _.template(self._view_url);
    else
        self._view_url = null;

    // prepare api url for call
    self._api_url = _.get(trigger_config, 'api_url', null);
    self._api_url_template = null;
    if(_.isString(self._api_url))
        self._api_url_template = _.template(self._api_url);
    else
        self._api_url = null;
}

Trigger.prototype.open = function open(call, msg_parsed) {
    throw new Error('Abstract method (open) need to be implemented');
}

Trigger.prototype.close = function close(call, msg_parsed) {
    throw new Error('Abstract method (close) need to be implemented');
}

Trigger.prototype.is_response_code_valid = function is_response_code_valid(code) {
    var self = this;
    var valid = false;

    tools.logDebug(`Check if http response code (${code}) is valid`,
        self.valid_open_codes);

    if(_.isArray(self.valid_open_codes)) {
        valid = self.valid_open_codes.includes(code);
    }
    else {
        valid = !!self.valid_open_codes.exec(code.toString());
    }

    tools.logDebug(`http response code (${code}) is ` +
        `${valid ? 'VALID' : 'INVALID'}`);
    return valid;
}



// ============================================================================
// Exports

module.exports = {
    Trigger: Trigger
};
