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

var path = require('path'),
    fs = require('fs'),
    localize = require('../../lang'),
    RestClient = require('node-rest-client-promise').Client;

// timeout defaults
const DEFAULT_REG_API_REQ_TMOUT = 500;
const DEFAULT_REG_API_RES_TMOUT = 1000;

const DEFAULT_REG_API_URL = 'http://service.dec112.at';
const DEFAULT_REG_API_BASE = '/api/v1';
const REG_API_CHECK_PATH = '/devices/check/';


// ============================================================================
// Methods

var Service = function Service(service_config, svcName) {
    var self = this;

    self.id = svcName;
    self.description = _.get(service_config,
        'description', 'DEC112 border service');
    self.automatic_messages = _.get(service_config,
        'automatic_messages', true);
    self.reg_api_enabled = false;

    self.reg_api_req_tmout = DEFAULT_REG_API_REQ_TMOUT;
    self.reg_api_res_tmout = DEFAULT_REG_API_RES_TMOUT;

    self.reg_api_base_url = DEFAULT_REG_API_URL + DEFAULT_REG_API_BASE;
    self.reg_api_key = null;

    // registration api enabled?
    self.reg_api_enabled = !!_.get(service_config,
        'registration_api.enabled', false);

    // service request timeout
    self.reg_api_req_tmout = _.get(service_config,
        'registration_api.request_timeout',
            DEFAULT_REG_API_REQ_TMOUT);
    if(tools.isInt(self.reg_api_req_tmout))
        self.reg_api_req_tmout = (self.reg_api_req_tmout < 1 ?
            DEFAULT_service_REQ_TMOUT : self.reg_api_req_tmout)
    else
        self.reg_api_req_tmout = DEFAULT_REG_API_REQ_TMOUT;

    // service response timeout
    self.reg_api_res_tmout = _.get(service_config,
        'registration_api.response_timeout',
            DEFAULT_REG_API_RES_TMOUT);
    if(tools.isInt(self.reg_api_res_tmout))
        self.reg_api_res_tmout = (self.reg_api_res_tmout < 1 ?
            DEFAULT_REG_API_RES_TMOUT : self.reg_api_res_tmout);
    else
        self.reg_api_res_tmout = DEFAULT_REG_API_RES_TMOUT;

    // registration api base url
    self.reg_api_base_url = _.get(service_config,
            'registration_api.url',
                DEFAULT_REG_API_URL) +
        _.get(config,
            'registration_api.base_path',
                DEFAULT_REG_API_BASE);

    // api key
    self.reg_api_key = _.get(service_config,
        'registration_api.api_key',
            null);
    if(!tools.isString(self.reg_api_key))
        self.reg_api_key = null;

    // service specific language resources available ?
    var default_lang = _.get(service_config, 'default_lang', 'en');
    self.lang = new localize.Lang(default_lang);

    var svc_lang_path = _.get(service_config, 'lang_path', null);

    //tools.logDebug(`Service language path: ${svc_lang_path}`, svc_lang_path);

    if(svc_lang_path) {
        var lang_path = path.join(self.lang.service_path, svc_lang_path);

        tools.logDebug(`Service (${self.id}), language resources path (${lang_path})`);

        if(fs.existsSync(lang_path))
            self.lang.lang.loadTranslations(lang_path);
    }
    else
        tools.logDebug(`Service (${self.id}), no language resources (lang_path) configured`);

    self.error_languages = _.get(service_config, 'default_error_languages',
        [ self.lang.default_lang ]);
}

Service.prototype.open = function open(call, msg_parsed) {
    throw new Error('Abstract method (open) needs to be implemented');
}

Service.prototype.process = function process(call, msg_parsed) {
    throw new Error('Abstract method (process) needs to be implemented');
}

Service.prototype.close = function close(call, msg_parsed) {
    throw new Error('Abstract method (close) need to be implemented');
}

// check DEC112 registration service
Service.prototype.check_registration = function check_registration(call) {
    var self = this;

    if(self.reg_api_enabled) {
        var reg_api_client = RestClient();
        var reg_api_url = self.reg_api_base_url +
            REG_API_CHECK_PATH +
            encodeURIComponent(call.device_id);
        if(self.reg_api_key)
            reg_api_url = reg_api_url +
                '?api_key=' +
                encodeURIComponent(self.reg_api_key);

        var reg_api_args = {
            headers: { "Content-Type": "application/json" },
            requestConfig: {
                timeout: self.reg_api_req_tmout,
                noDelay: true,
                keepAlive: false
            },
            responseConfig: {
                timeout: self.reg_api_res_tmout
            }
        };

        tools.logDebug(`${call.call_id}: ` +
            `calling registration API @ ${reg_api_url}`);
        var reg_api_tmr = tools.getHrTime();
        return reg_api_client.getPromise(reg_api_url, reg_api_args)
            .then(function(reg_api_result) {
                tools.logDebug(`${call.call_id}: ` +
                    `response received from registration API in ` +
                    `(${tools.elapsedHrTime(reg_api_tmr)}) ms`);

                // api call technically failed
                if(reg_api_result.response.statusCode != 200)
                    throw new Error(`${call.call_id}: ` +
                        `Registration API call failed for ` +
                        `caller=(${call.caller_name}); ` +
                        `code=(${reg_api_result.response.statusCode}), ` +
                        `reason=(${reg_api_result.response.statusMessage}');` +
                        ' - ignored');

                // api call technically succeeded but response is invalid
                if(reg_api_result.data.state != 10 || reg_api_result.data.code != 200)
                    throw new Error('Unable to verify ' +
                        `caller=(${call.caller_name}) ` +
                        'via registration service API; ' +
                        `state=(${reg_api_result.data.state}), ` +
                        `code=(${reg_api_result.data.code});` +
                        ' - ignored');

                // store db id from api call in call db
                call.caller_id = _.get(reg_api_result,
                    'data.device_did',
                        null);
                return Promise.resolve(call);
            })
    }
    else
        return Promise.resolve(call);
}


// ============================================================================
// Exports

module.exports = {
    Service: Service
};
