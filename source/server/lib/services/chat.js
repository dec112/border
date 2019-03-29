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

var ServiceBase = require('./base').Service;

const ID = 'CHAT';
const DESC = 'Emergency Chat Service';


// ============================================================================
// Methods

var Service = function Service(service_config, svcName) {
    var self = this;

    ServiceBase.call(self, service_config, svcName);
    self.ID = ID;
    self.DESC = DESC;
}
Service.prototype = _.create(ServiceBase.prototype, {
    'constructor': Service
});

Service.prototype.open = function open(call, msg_parsed) {
    var self = this;
    tools.logDebug(`${call.call_id}: Open service ${self.ID}`);
    self.lang.lang.setLocale(call.lang);

    // send automatic message back to user
    var automatic_messages = _.get(config.services,
        [call.service, '_service', 'automatic_messages'], true);

    if(automatic_messages) {
        return calls.send(call.call_id,
            self.lang.lang.translate('auto_answer_new_call'),
            call.service)
        .catch(function(error) {
            tools.logError(error);
        })
    }
    else
        return Promise.resolve(null);
}

Service.prototype.process = function process(call, msg_parsed) {
    // do nothing
    var self = this;
    tools.logDebug(`${call.call_id}: Process service ${self.ID}`);
    return Promise.resolve(null);
}

Service.prototype.close = function close(call, msg_parsed) {
    var self = this;
    tools.logDebug(`${call.call_id}: Close service ${self.ID}`);

    var main_text = _.get(msg_parsed, 'texts[0]', null);
    if(main_text == '//SILENT' || !main_text)
        return Promise.resolve(null);
    else
        return calls.send(call.call_id, main_text, call.service, true)
            .catch(function(err) {
                tools.logError(`${call.call_id}: Failed SIP send (${err})`);
                return Promise.resolve(null);
            })
}


// ============================================================================
// Exports

module.exports = {
    ID: ID,
    DESC: DESC,
    Service: Service
};
