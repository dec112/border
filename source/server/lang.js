/// <reference path="../../typings/index.d.ts"/>
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

var path = require('path'),
    Localize = require('localize');


// ============================================================================
// Methods

var Lang = function Lang(default_lang) {
    var self = this;

    self.available = ['en', 'de'];
    self.path = path.join(__dirname, 'lang/default');
    self.service_path = path.join(__dirname, 'lang/services');
    self.lang = new Localize(self.path, undefined, 'xx');

    if(default_lang) {
        if(_.indexOf(self.available, default_lang) < 0) {
            if(self.available.length < 1) {
                tools.logError('Unable to determine default language');
                self.default_lang = null;
            }
            else
                self.default_lang = self.available[0];
        }
        else
            self.default_lang = default_lang;
    }
    else
        self.default_lang = self.available[0];

    if(default_lang)
        self.lang.setLocale(default_lang);
}

Lang.prototype.get_localized = function get_localized(message_id,
        language_code, default_lang) {
    var self = this;

    if(self.available.length < 1) {
        tools.logError(`Unable to translate message id (${message_id}) ` +
            `to language (${language_code})`);
        return '';
    }

    var lc = language_code;
    if(_.indexOf(self.available, language_code) < 0) {
        if(_.indexOf(self.available, default_lang) < 0)
            lc = default_lang;
        else
            lc = self.available[0];

        tools.logWarning(`Unable to translate message id (${message_id}) ` +
            `to language (${language_code}) - used (${lc}) instead`);
    }

    self.lang.setLocale(lc);
    return self.lang.translate(message_id);
}


// ============================================================================
// Exports

module.exports = {
    Lang: Lang
};
