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



// ============================================================================
// Public Methods

// MIME header addons
var MimeHeaderAddon = function MimeHeaderAddOn(name, value) {
    var self = this;

    self.name = name;
    self.value = value;
};

MimeHeaderAddon.prototype.toString = function toString() {
    var self = this;

    if (self.name)
        return self.name + (self.value ? '=' + self.value : '');
    else
        return '';
};

MimeHeaderAddon.re = /(?:;\s*(.*?)\s*=\s*([^;]*))/g;
MimeHeaderAddon.parse = function parse(addOnString) {
    var self = this;
    var m;
    var result = [];

    while ((m = self.re.exec(addOnString)) !== null) {
        result.push(new MimeHeaderAddon(m[1], m[2]));
    }

    return result;
};


// MIME header
var MimeHeader = function MimeHeader(name, value, addons) {
    var self = this;

    self.name = name || 'X-unknown';
    self.value = (value || '').split(';')[0].trim();
    self.addons = MimeHeaderAddon.parse(value);
    self.addons = _.union(self.addons, addons || []);
};

MimeHeader.prototype.toString = function toString() {
    var self = this;

    var result = self.name + ': ' + self.valueToString();

    return result;
};

MimeHeader.prototype.valueToString = function valueToString() {
    var self = this;

    var result = self.value;
    if (self.addons.length > 0)
        result += ';' + self.addons.map(function (addon) {
            return addon.toString();
        }).join(';')

    return result;
};

MimeHeader.re = /^(.*?):(.*)$/;
MimeHeader.parse = function parse(headerString) {
    var self = this;
    var m;

    if ((m = self.re.exec(headerString)) !== null) {
        if (m.index === self.re.lastIndex) {
            self.re.lastIndex++;
        }

        return new MimeHeader(m[1], m[2]);
    }
    else
        return null;
};


// MIME Part
var MimePart = function MimePart(name, headers, value) {
    var self = this;

    self.name = name;
    self.headers = headers || [];
    self.value = value || '';
};

MimePart.re = /^(--)/gm;

Object.defineProperty(MimePart.prototype, "contentType", {
    get: function () {
        var self = this;
        var h = self.getHeader('Content-Type');
        return (h.length > 0 ? h[0].value : '');
    },
    set: function (type) {
        var self = this;
        self.setHeader('Content-Type', type);
    }
});

Object.defineProperty(MimePart.prototype, "contentTypeFull", {
    get: function () {
        var self = this;
        var h = self.getHeader('Content-Type');
        return (h.length > 0 ? h[0].valueToString() : '');
    },
    set: function (type) {
        var self = this;
        self.setHeader('Content-Type', type);
    }
});

Object.defineProperty(MimePart.prototype, "value", {
    get: function () {
        var self = this;
        return self._value;
    },
    set: function (value) {
        var self = this;
        // quote lines starting with '--' otherwise they would be
        // false mime boundaries
        self._value = (value) ? value.replace(MimePart.re, ' $1') : "";
    }
});

MimePart.prototype.toString = function toString() {
    var self = this;
    var CRLF = '\r\n';
    var result = '';

    result += self.headers.map(function (header) {
        return header.toString();
    }).join(CRLF);
    result += CRLF;
    result += self.value.toString();
    return result;
};

MimePart.prototype.getHeader = function getHeader(header) {
    var self = this;
    var hn;

    if (header instanceof MimeHeader)
        hn = header.name;
    else
        if (_.isString(header))
            hn = header;
        else
            throw new Error('Parameter must either be a string or a MimeHeader instance');

    var result = self.headers.filter(function (header) {
        return header.name === hn;
    })
    return result;
};

MimePart.prototype.setHeader = function setHeader(headerName, headerValue) {
    var self = this;
    var found = 0;
    var hn;

    if (headerName instanceof MimeHeader)
        hn = headerName;
    else
        if (_.isString(headerName))
            hn = new MimeHeader(headerName, headerValue);
        else
            throw new Error('Parameters must either be string,string or a single MimeHeader instance');

    for (var i = 0; i < self.headers.length; i++) {
        var header = self.headers[i];
        if (header.name === hn.name) {
            found++;
            self.headers[i] = hn;
        }
    }

    if (found < 1) {
        self.headers.push(hn);
        found = 1;
    }

    return found;
};

MimePart.prototype.addHeader = function addHeader(headerName, headerValue) {
    var self = this;
    var found = 0;
    var hn;

    if (headerName instanceof MimeHeader)
        hn = headerName;
    else
        if (_.isString(headerName))
            hn = new MimeHeader(headerName, headerValue);
        else
            throw new Error('Parameters must either be string,string or a single MimeHeader instance');

    for (var i = 0; i < self.headers.length; i++) {
        var header = self.headers[i];
        if (header.name === hn.name)
            found++;
    }

    self.headers.push(hn);
    found++;

    return found;
};

MimePart.prototype.removeHeader = function removeHeader(headerName) {
    var self = this;
    var found = 0;
    var hn;

    if (headerName instanceof MimeHeader)
        hn = headerName.name;
    else
        if (_.isString(headerName))
            hn = headerName;
        else
            throw new Error('Parameters must either be a string or a single MimeHeader instance');

    var newHeaders = self.headers.filter(function (header) {
        return header.name !== hn;
    });

    found = self.headers.length - newHeaders.length;
    self.headers = newHeaders;
    return found;
};

MimePart.parse = function parse(bodyPart) {
    var self = this;
    var CRLF = '\r\n';
    var result = [];

    var state = 0;
    var lines = bodyPart.split(CRLF);
    var line;
    var part = new MimePart();

    for (var i = 0; i < lines.length; i++) {
        line = lines[i];

        switch (state) {

            // process mime block headers
            case 0:
                if (line == '')
                    state = 1;
                else {
                    var h = MimeHeader.parse(line);
                    if (h)
                        part.addHeader(h);
                }
                break;

            // process mime block value
            case 1:
                part.value += line + CRLF;
                break;
        }
    }
};


// MultipartMime
var MultipartMime = function MultipartMime(boundary, parts) {
    var self = this;

    self.boundary = boundary || '----------' + tools.strRandom(16);
    if (self.boundary.length > 70)
        throw new Error('mime boundary must be <= 70 characters');

    self.parts = parts || [];
};

MultipartMime.prototype.addPart = function addPart(part) {
    var self = this;

    if (!(part instanceof MimePart))
        throw new Error('Parameter must be an instance of "MimePart"');

    self.parts.push(part);
};

// try to determine mime part boundary
MultipartMime.determineBoundary = function determineBoundary(body) {
    var CRLF = '\r\n';
    var b;
    var eb;
    var ebFound = false;

    var lines = body.split(CRLF);
    var line;
    var parts = 0;
    var error;

    for (var i = 0; i < lines.length; i++) {
        line = lines[i];

        if (_.startsWith(line, '--')) {
            if (line === '--') {
                error = 'Invalid boundary found (body line: ' + i + ')';
                break;
            }

            if (!b) {
                b = _.trim(line);
                eb = b + '--';
                parts++;
            }
            else {
                if (_.startsWith(line, eb)) {
                    ebFound = true;
                    break;
                }
                if (line === b)
                    parts++;
                else {
                    error = 'Different boundaries found (body line: ' + i + ')';
                    break;
                }
            }
        }
        else
            if (!b && line !== '')
                error = 'Content found before boundary';
    }

    if (b)
        b = b.substring(2);
    else
        error = 'No boundaries found';

    if (!ebFound && !error)
        error = 'No end boundary found';

    return { boundary: b, count: parts, error: error };
};

// create multipart mime string
MultipartMime.prototype.toString = function toString() {
    var self = this;
    var CRLF = '\r\n';
    var body = '';
    var boundary = '--' + self.boundary;

    self.parts.forEach(function (part) {
        body += boundary + CRLF;

        if (part.headers) {
            body += part.headers
                .map(function (header) {
                    return header.toString();
                })
                .join(CRLF)

            if (part.headers.length > 0)
                body += CRLF;
        }

        body += CRLF;

        body += _.get(part, 'value', '').toString() + CRLF;
    });

    if (self.parts.length > 0)
        body += boundary + '--' + CRLF;

    return body;
}

// parse a multipart mime body string
MultipartMime.parse = function parse(body, boundary) {
    var self = this;
    var CRLF = '\r\n';
    var b;
    var eb;

    if (boundary)
        b = boundary;
    else {
        var bt = self.determineBoundary(body);
        if (bt.error)
            throw new Error(bt.error);
        b = bt.boundary;
    }
    var result = new MultipartMime(b);

    b = '--' + b;
    eb = b + '--';

    var state = 0;
    var lines = body.split(CRLF);
    var line;
    var part;

    for (var i = 0; i < lines.length; i++) {
        line = lines[i];

        switch (state) {

            // search for start or end boundary
            case 0:
                if (line === b) {
                    state = 1
                    part = new MimePart();
                }
                else if (line === eb) {
                    state = 9;
                    i--;
                }
                break;

            // process mime block headers
            case 1:
                if (line == '')
                    state = 2;
                else {
                    var h = MimeHeader.parse(line);
                    if (h)
                        part.headers.push(h);
                }
                break;

            // process mime block value
            case 2:
                if (line !== b && line !== eb)
                    part.value += line + CRLF;
                else {
                    state = 0;
                    i--;
                    result.addPart(part);
                }
                break;

            // end processing
            case 9:
                i = lines.length + 1;
        }
    }

    return result;
};


// ======================================================================
// Exports

module.exports = {
    MimeHeaderAddon: MimeHeaderAddon,
    MimeHeader: MimeHeader,
    MimePart: MimePart,
    MultipartMime: MultipartMime
};
