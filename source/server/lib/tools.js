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

var	os = require('os'),
	util = require('util'),
	fs = require('fs'),
	http = require('http'),
	sprintf = require('sprintf-js').sprintf,
	colors = require('colors'),
	basicAuth = require('basic-auth'),
	X2JS = require('x2js');

var LOG_DEBUG = 0;
var LOG_INFO = 1;
var LOG_OK = 2;
var LOG_WARNING = 3;
var LOG_ERROR = 4;

//var logMode = 0;

var errorTypes = {
	locationValidationUnavailable: 300,

	badRequest: 500,
	internalError: 501,
	serviceSubstitution: 502,
	defaultMappingReturned: 503,
	forbidden: 504,
	notFound: 505,
	loop: 506,
	serviceNotImplemented: 507,
	serverTimeout: 508,
	serverError: 509,
	locationInvalid: 510,
	locationProfileUnrecognized: 511
};

var errorNumbers = {};

// ============================================================================
// Public Methods

function quoteXML(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
};

/**
 * Simple basic auth middleware for use with Express 4.x.
 *
 * @example
 * app.use('/api-requiring-auth', utils.basicAuth('username', 'password'));
 *
 * @param   {string}   username Expected username
 * @param   {string}   password Expected password
 * @returns {function()} Express 4 middleware requiring the given credentials
 */
exports.basicAuth = function(username, password) {
  return function(req, res, next) {
    var user = basicAuth(req);

    if (!user || user.name !== username || user.pass !== password) {
      res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
      return res.sendStatus(401);
    }

    next();
  };
};

/*
exports.setLogMode = function(mode) {
	var self = this;

	// 0 - normal, 1 - debug, 2 - quiet
	self.logMode = (mode ? mode : 0);
	if(!self.isInt(self.logMode))
		self.logMode = 0;
	self.logMode = Math.abs(self.logMode);
	if(self.logMode < 0 || self.logMode > 2)
		self.logMode = 0;
};
*/

exports.callOrThrow = function(message, tag, callback) {
	var error = new Error(message);
	error.tag = tag;
	if(callback)
		callback(error);
	else
		throw error;
};

exports.get = function(obj, key) {
    return key.split('.').reduce(function(o, x) {
        return (typeof o == 'undefined' || o === null) ? o : o[x];
    }, obj);
};

exports.has = function(obj, key) {
    return key.split('.').every(function(x) {
        if(typeof obj != 'object' || obj === null || !(x in obj))
            return false;
        obj = obj[x];
        return true;
    });
};

exports.inspect = function(obj, depth) {
	if(!exports.isInt(depth))
		depth = 2;
	console.log(util.inspect(obj, { showHidden: true, depth: depth, colors: true }));
};

// list all available network interfaces on console
exports.listIPs = function() {
	var ifaces = os.networkInterfaces();

	Object.keys(ifaces).forEach(function(ifname) {
		var alias = 0;

		ifaces[ifname].forEach(function(iface) {
			console.log(sprintf('%-40s %6s   %s',
				sprintf('%s:%d%s', ifname, alias, (iface.internal ? '*' : '')),
				iface.family, iface.address.cyan));

			alias++;
		});
	});
};

exports.getHrTime = function() {
	return process.hrtime();
};

exports.elapsedHrTime = function(startedAt) {
    var diff = process.hrtime(startedAt);
	var elapsedMs = (diff[0] * 1e9 + diff[1]) / 1000000;

	return elapsedMs.toFixed(5);
};

/**
 * Downloads content via http request
 *
 * @param {String} url The url of the resource to download.
 * @param {String} dest The destination where to write the content to.
 * @param {Integer} timeOut Timeout in milliseconds after which to abort the
 *        download in case of inactivity.
 * @param {Function} cb Callback in case of error or success. Parameter are:
 *        error: undefined if success otherwise contains additional
 *        error informations.
 *        duration: the duration in seconds it took to download the resource.
 *        contentLength: the length of the downloaded content in bytes.
 */
exports.download = function(url, dest, timeOut, cb) {
	var timing = new Date();
	var contentLength = 0;

	var req = http.get(url, function(res) {
		if(res.headers['transfer-encoding'] === 'chunked') {
			res.on('data', function(chunk) {
				contentLength += chunk.length;
			})
		}
		else
			contentLength = res.headers['content-length'];

		if(res.statusCode === 200) {
			var file = fs.createWriteStream(dest);
			res.pipe(file);
			file
				.on('finish', function() {
					file.close();

					var duration = (new Date() - timing) / 1000;

					if(cb)
						cb(undefined, duration, contentLength)
				})
				.on('error', function(error) {
					if(cb)
						cb(error);
				});
		}
		else {
			if(cb)
				cb(res.statusCode);
		}
	})
	.on('error', function(error) {
		fs.unlink(dest);
		if(cb)
			cb(error);
	});

    // timeout.
	if(timeOut === undefined)
		timeOut = 12000;
	if(timeOut > 0)
		req.setTimeout(timeOut, function() {
			req.abort();
		});
};

/**
 * Logs text to the console using a selectable prefix and colour and
 * optionally an objects properties
 *
 * @param {Integer} severity Selects how a message should be displayed.
 *        See also the LOG_* constants.
 *              LOG_DEBUG = 0
 *              LOG_INFO = 1
 *              LOG_OK = 2
 *              LOG_WARNING = 3
 *              LOG_ERROR = 4
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Integer} eolMode Specifies the end of line type after printing
 *        the message.
 *              0 - normal, new line
 *              1 - stay on same line, no new line
 *              2 - stay on same line, go back to beginning of line
 */
exports.log = function(severity, logTime, message, object, eolMode) {
	var ts = '';
	var w;
	var eol;

	switch(eolMode) {
		case 1:
			eol = '';
			break;
		case 2:
			eol = (process.platform == 'win32' || process.platform == 'win64' ?
					'\u001B[0G' : '\r');
			break;
		default:
			eol = os.EOL;
			break;
	}

	if(config.quiet)
		return;

	if(logTime === true) {
		var now = new Date();
		ts = sprintf(' %04d%02d%02d %02d%02d%02d.%-4d',
			now.getFullYear(),
			now.getMonth() + 1,
			now.getDate(),
			now.getHours(),
			now.getMinutes(),
			now.getSeconds(),
			now.getMilliseconds());
	}

	switch(severity) {
		case LOG_DEBUG:
			if(config.debug) {
				w = '[DBG' + ts + '] ';
				process.stdout.write(w.grey + message + eol);
			}
			break;
		case LOG_OK:
			w = '[OK ' + ts + '] ';
			process.stdout.write(w.green + message + eol);
			break;
		case LOG_WARNING:
			w = '[WRN' + ts + '] ';
			process.stdout.write(w.yellow + message + eol);
			break;
		case LOG_ERROR:
			w = '[ERR' + ts + '] ';
			process.stdout.write(w.red + message + eol);
			break;
		default:
			w = '[INF' + ts + '] ';
			process.stdout.write(w.white + message + eol);
			break;
	}

	if(object && (severity != LOG_DEBUG || (severity == LOG_DEBUG && config.debug))) {
		var obj;
		if(typeof object == 'string' || object instanceof String) {
			obj = '     ' + object;
		}
		else {
			//obj = '     ' + JSON.stringify(object, null, 2);

			// Use a custom replacer to handle circular references
			// Note: cache should not be re-used by repeated calls to
			// JSON.stringify.
			var cache = [];
			obj = '     ' + JSON.stringify(object, function(key, value) {
				if (typeof value === 'object' && value !== null) {
					if (cache.indexOf(value) !== -1) {
						// Circular reference found, discard key
						return;
					}
					// Store value in our collection
					cache.push(value);
				}
				return value;
			}, 2);
			// Enable garbage collection
			cache = null;
		}
		obj = obj.replace(/\n/g, '\n     ');

		//process.stdout.write(object);
		console.log(obj);
	}
}

/**
 * Logs text to the console using a [DBG] prefix in dark grey colour and
 * optionally an objects properties
 *
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 */
exports.logDebug = function(message, object, logTime, eolMode) {
	if(typeof logTime === 'undefined')
		logTime = true;
	exports.log(LOG_DEBUG, logTime, message, object, eolMode);
}

/**
 * Logs text to the console using a [INF] prefix in white and
 * optionally an objects properties
 *
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 */
exports.logInfo = function(message, object, logTime, eolMode) {
	if(typeof logTime === 'undefined')
		logTime = true;
	exports.log(LOG_INFO, logTime, message, object, eolMode);
}

/**
 * Logs text to the console using a [OK ] prefix in green colour and
 * optionally an objects properties
 *
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 */
exports.logOK = function(message, object, logTime, eolMode) {
	if(typeof logTime === 'undefined')
		logTime = true;
	exports.log(LOG_OK, logTime, message, object, eolMode);
}

/**
 * Logs text to the console using a [WRN] prefix in yellow and
 * optionally an objects properties
 *
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 */
exports.logWarning = function(message, object, logTime, eolMode) {
	if(typeof logTime === 'undefined')
		logTime = true;
	exports.log(LOG_WARNING, logTime, message, object, eolMode);
}

/**
 * Logs text to the console using a [ERR] prefix in red colour and
 * optionally an objects properties
 *
 * @param {String} message Optional message to display on console
 * @param {Object} object Optional object who's properties should be
 *        displayed under the message text
 * @param {Boolean} logTime Optional Whether or not to display a time stamp
 *        in the log entry
 */
exports.logError = function(message, object, logTime, eolMode) {
	if(typeof logTime === 'undefined')
		logTime = true;
	exports.log(LOG_ERROR, logTime, message, object, eolMode);
}

exports.isInt = function(i_int) {
	var i = parseInt(i_int);
	if (isNaN(i))
		return false;
	return i_int == i && i_int.toString() == i.toString();
}

/**
 * Returns the javascript object type of the given object as string.
 *
 * @param {object} obj The object to get the typeinfo from.
 * @return {string} Objects type as string.
 */
exports.realTypeOf = function(obj) {
	return Object.prototype.toString.call(obj).slice(8, -1);
}

/**
 * Returns the class name of the argument or undefined if
 * it's not a valid JavaScript object.
 *
 * @param {object} obj The object to get the classname from.
 * @return {string} Objects class name as string.
*/
exports.getObjectClass = function(obj) {
	if (obj && obj.constructor && obj.constructor.toString) {
		var arr = obj.constructor.toString().match(/function\s*(\w+)/);

		if (arr && arr.length == 2) {
			return arr[1];
		}
	}

	return undefined;
}

/**
 * Checks if the given string is null/undefined or empty ''.
 *
 * @param {string} s_str String to check.
 * @return {boolean} True if string is undefined or has length 0
 */
exports.isNullOrEmpty = function(s_str) {
	return !s_str || s_str == '';
}

/**
 * Checks if the given object is empty ie. {}
 *
 * @param {object} obj The object to check.
 * @return {boolean} True if object is {} has no own properties
 */
exports.isEmptyObject = function(obj) {
    return Object.keys(obj).length === 0;
}

/**
 * Checks if the given object is of type string.
 *
 * @param {object} o_str Object to check.
 * @return {boolean} True if object was a string object.
 */
exports.isString = function(o_str) {
	return (o_str instanceof String || typeof o_str == 'string');
}

/**
 * Check if the given object is an integer.
 *
 * @param {number} i_int Object to check.
 * @return {boolean} True if object was an integer object.
 */
exports.isInt = function(i_int) {
	var i = parseInt(i_int);
	if(isNaN(i))
		return false;
	return i_int == i && i_int.toString() == i.toString();
}

/**
 * Finds a string inside another string before a given position and returns
 * the position where it was found or -1 otherwise.
 *
 * @param {string} s_str String which should be searched inside.
 * @param {number} i_len Position after which schould not be searched.
 * @param {string} s_substr String which should be found.
 * @return {number} Character Position of found string or -1 if not found.
 */
exports.indexOf = function(s_str, i_len, s_substr) {
	var i_ret = -1;

	if(s_str && s_substr)
		i_ret = s_str.indexOf(s_substr);

	return i_ret < i_len ? i_ret : -1;
}

/**
 * Check if a given string ends with another string.
 *
 * @param {string} s_str String to test.
 * @param {string} s_suffix String with other string must end.
 * @return {boolean} True if s_str ends with s_suffix.
 */
exports.endsWith = function(s_str, s_suffix) {
	return s_str.indexOf(s_suffix, s_str.length - s_suffix.length) !== -1;
}

/**
 * Removes html tags from string.
 *
 * @param {string} s_str String to clear.
 */
exports.clearHtml = function(s_str) {
	if(exports.isNullOrEmpty(s_str))
		return '';
	//return $(s_str).text();
	return s_str.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>?/gi, '');
}

/**
 * Check if a string contains another string.
 *
 * @param {string} s_str
 * @param {number} i_len
 * @param {string} s_substr
 * @return {boolean}
 */
exports.contains = function(s_str, i_len, s_substr) {
	return exports.indexOf(s_str, i_len, s_substr) >= 0;
}

/**
 * @param {string} s_str
 * @param {string} c_lquote
 * @param {string} c_rquote
 * @return {string}
 */
exports.unquote = function(s_str, c_lquote, c_rquote) {
	var s_ret = s_str;

	if(s_ret) {
		var i_len = s_ret.length;

		if(i_len >= 2 && s_ret[0] == c_lquote && s_ret[i_len - 1] == c_rquote)
			s_ret = s_str.substring(1, i_len - 1);
	}

	return s_ret;
}

/**
 * @param {string} s_str
 * @return {string}
 */
exports.unquote2 = function(s_str) {
	return exports.unquote(s_str, "\"", "\"");
}

/**
 * @param {string} s_str
 * @return {string}
 */
exports.strdup = function(s_str) {
	if(s_str)
		return new String(s_str).toString();

	return s_str;
}

// this.strformat(s_format, ...)
/**
 * @param {string} s_str
 * @param {object=} o_params
 * @return {string}
 */
exports.strformat = function(s_str) {
	for(var i = 1; i < arguments.length; i++) {
		var regexp = new RegExp('\\{' + (i - 1) + '\\}', 'gi');
		s_str = s_str.replace(regexp, arguments[i]);
	}

	return s_str;
}

/**
 * @param {string} template A template string containing zero or more <%=xyz%>
						placeholders.
 * @param {object=} values An optional object providing values for placeholders.
 * @param {boolean=} keepUnknown True to keep unknown placeholders,
 *						False to replace them with the empty string ''
 * @return {string} A string in which all placeholders are replaced with their
						corresponding values from the values object.
 */
exports.strTemplate = function(template, values, keepUnknown) {
	if(exports.isNullOrEmpty(template))
		return '';

	if(values) {
		template = template.replace(/<%\s*=\s*(\w[\w\d]*)\s*%>/g, function(g0, g1) {
			return values[g1] || (keepUnknown == true ? g0 : '');
		});
	}

	return template;
}

/**
 * @param {string} s_1
 * @param {string} s_2
 * @return {boolean}
 */
exports.streq = function(s_1, s_2) {
	return (s_1 == s_2);
}

/**
 * @param {string} s_1
 * @param {string} s_2
 * @return {boolean}
 */
exports.strieq = function(s_1, s_2) {
	if (s_1 && s_2)
		return s_1.toLowerCase() == s_2.toLowerCase();

	return (s_1 == s_2);
}

/**
 * @param {number} i_length
 * @param {string} s_dict
 * @return {string}
 */
exports.strRandomFromDict = function(i_length, s_dict) {
	var s_ret = "";

	for (var i = 0; i < i_length; i++)
		s_ret += s_dict[Math.floor(Math.random() * s_dict.length)];

	return s_ret;
}

/**
 * @param {number} i_length
 * @return {string}
 */
exports.strRandom = function(i_length) {
	var s_dict = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

	return exports.strRandomFromDict(i_length, s_dict);
}

/**
 * @return {string}
 */
exports.strRandomUUID = function() {
	// e.g. 6ba7b810-9dad-11d1-80b4-00c04fd430c8
	var s_dict = "0123456789abcdef";
	return exports.strformat("{0}-{1}-{2}-{3}-{4}",
		exports.strRandomFromDict(8, s_dict),
		exports.strRandomFromDict(4, s_dict),
		exports.strRandomFromDict(4, s_dict),
		exports.strRandomFromDict(4, s_dict),
		exports.strRandomFromDict(12, s_dict));
}

/**
 * s_url: <scheme>://<host>:<port>/<dir>
 * <dir> is optional
 * s_url: udp://192.168.0.10:8545/ws
 * @param {string} s_url
 * @return {?array} array is succeed or null otherwise
 */
exports.strParseUrl = function(s_url) {
	if (!s_url)
		return null;

	var i_0 = s_url.indexOf("://");
	var i_1 = s_url.lastIndexOf(":");
	if (i_0 == -1 || i_1 == -1)
		return null;

	var ao_params = new Array();
	ao_params.push(s_url.substring(0, i_0));
	ao_params.push(s_url.substring((i_0 + 3), i_1));

	try {
		var i_3 = s_url.substring(i_0 + 3).indexOf("/");
		if (i_3 == -1) {
			ao_params.push(parseInt(s_url.substring(i_1 + 1), 10));
		}
		else {
			ao_params.push(parseInt(s_url.substring(i_1 + 1, i_3 + i_0 + 3), 10));
			ao_params.push(s_url.substring(i_3 + i_0 + 3 + 1));
		}
	}
	catch (e) {
		return null;
	}

	return ao_params;
}

exports.isLocationValid = function isLocationValid(location) {
    if (!location ||
        !_.isNumber(location.lat) || _.isNaN(location.lat) ||
        !_.isNumber(location.lon) || _.isNaN(location.lon))
        return false;

    if (location.lat > 90 || location.lat < -90)
        return false;

    if (location.lon > 180 || location.lon < -180)
        return false;

    return true;
};

/*
   Extracts locations information from PIDF/LO XML document string.
   Returns null in case of error. Only extracts the first available
   location (in case more locations are present) and only supports
   Point and Circle geometries. Also only device or tuple PIDF types
   are supported at the moment.
   See https://tools.ietf.org/html/rfc5491 for more infos.
*/
exports.parsePidf = function parsePidf(pidf) {
	var x2js = new X2JS();
    var location_regex = /\s*([\+\-]?\d+(?:\.\d+)?)\s+([\+\-]?\d+(?:\.\d+)?)(?:\s*([\+\-]?\d+(?:\.\d+)?))?/;
    var geopriv = null;
    var location_info = null;
    var geom = null;
    var method = null;
    var location = null;

    // try to get node value direct or with XML namespace prefix
    function getAttr(node, path) {
        var result = _.get(node, path + '.__text', null);
        if(!result)
            result = _.get(node, path, null);
        return result;
    }

    // tries to parse a lat,lon,alt location from raw string value
    function parse_location(raw, method) {
        if(!_.isString(raw))
            return null;
        var match = location_regex.exec(raw);
        if(!match)
            return null;

        location = {
            lat: parseFloat(match[1]),
            lon: parseFloat(match[2]),
            alt: null,
            rad: null,
            method: method
        };
        if(match[3])
            location.alt = parseFloat(match[3]);

        return location;
    }

    // convert XML to JSON
    var pidfJson = x2js.xml2js(pidf);

    // get geopriv node
    geopriv = getAttr(pidfJson, 'presence.device.geopriv');
    if(!geopriv)
        geopriv = getAttr(pidfJson, 'presence.tuple.status.geopriv');
    // only device and tuple supported at the moment
    if(!geopriv)
        return null;

    // get method how location was determined
    method = getAttr(geopriv, 'method');

    // try to get location-info
    location_info = getAttr(geopriv, 'location-info.location');
    if(!location_info)
        location_info = getAttr(geopriv, 'location-info');
    if(!location_info)
        return null;

    // try to get geometry from location-info
    // Point (2D and 3D)
    geom = _.get(location_info, 'Point', null);
    if(geom) {
        return parse_location(getAttr(geom, 'pos'), method);
    }
    else
        geom = _.get(location_info, 'Circle', null);
    // Circle
    if(geom) {
        location = parse_location(getAttr(geom, 'pos'), method);
        if(!location)
            return null;

        var radius = getAttr(geom, 'radius');
        if(radius)
            location.rad = radius;

        return location
    }

    return null;
};

exports.parseAddCallSub = function addCallSub(data) {
	var x2js = new X2JS();


	// convert from xml to json
	var dataJson = x2js.xml2js(data);


	// Try to convert notes from text to json. If not
	// possible keep notes as they are
	var vcard = _.get(dataJson, [
			'EmergencyCallData.SubscriberInfo',
			'SubscriberData',
			'vcards',
			'vcard'
		], null);

	if(vcard) {
		try {
			var note = _.get(vcard, 'note.text.__text', null);
			if(note) {
				note = JSON.parse(note);
				//exports.logDebug('note new', note);
				vcard.note = note;
			}
		}
		catch(error) {}
	}


	// clean up not needed XML artifacts
	var w = JSON.stringify(dataJson, function(key, value) {
			if(key === '__prefix')
				return undefined;
			else if (key.startsWith('_xmlns:'))
				return undefined;
			else if (key === '_privacyRequested')
				return undefined;
			else
				return value;
		}).replace(new RegExp('\"_+(.*?)\":', 'gm'), '\"\$1\":');

	w = JSON.parse(w);
	vcard = _.get(w, [
		'EmergencyCallData.SubscriberInfo',
		'SubscriberData',
		'vcards',
		'vcard'
	], null);

	//exports.logDebug('vcard', vcard);


	// condense very verbose vcard json into something more dense
	var result = {};

	// extract well known elements

	// user name
	result.name = _.get(vcard, 'fn.text.text', undefined);

	// phone
	result.tel = _.get(vcard, 'tel.text.text', undefined);

	// email
	result.email = _.get(vcard, 'email.text.text', undefined);

	// address
	result.adr = {}
	result.adr.street = _.get(vcard, 'adr.street.text', undefined);
	result.adr.locality = _.get(vcard, 'adr.locality.text', undefined);
	result.adr.region = _.get(vcard, 'adr.region.text', undefined);
	result.adr.code = _.get(vcard, 'adr.code.text', undefined);
	result.adr.country = _.get(vcard, 'adr.country.text', undefined);

	// notes
	result.notes = _.get(vcard, 'note', undefined);

	return result;
};

/*
 * Flatten Object @gdibble: Inspired by https://gist.github.com/penguinboy/762197
 *   input:  { 'a':{ 'b':{ 'b2':2 }, 'c':{ 'c2':2, 'c3':3 } } }
 *   output: { 'a.b.b2':2, 'a.c.c2':2, 'a.c.c3':3 }
 */
exports.flattenObject = function flattenObject(obj) {
	var result = {};
	var flatObject;

	for (var i in obj) {
		if (!obj.hasOwnProperty(i))
			continue;

		if ((typeof obj[i]) === 'object' && obj[i] !== null) {
			flatObject = flattenObject(obj[i]);
			for (var x in flatObject) {
				if (!flatObject.hasOwnProperty(x))
					continue;

				result[i + (!!isNaN(x) ? '.' + x : '')] = flatObject[x];
			}
		}
		else
			result[i] = obj[i];
	}

	return result;
};

/*
exports.flattenObject = function flattenObject(obj) {
	return Object.keys(obj).reduce(function(result, key) {
		if (Object.prototype.toString.call(obj[key]) === '[object Date]')
			result[key] = obj[key].toString();
		else if ((typeof obj[key]) === 'object' && obj[key]) {
			var flatObject = flattenObject(obj[key]);
			Object.keys(flatObject).forEach(function(k2) {
				result[key + '.' + k2] = flatObject[k2];
			});
		}
		else
			result[key] = ob[key];

		return result;
	}, {});
}
*/
