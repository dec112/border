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

exports.models = {
    "ActiveCallList": {
        "id": "ActiveCallList",
        "type": "array",
        "description": "All currently active calls",
        "required": ["calls", "code"],
        "properties": {
            "calls": {
                "type": "array",
                "description": "List of calls",
                "items": {
                    "$ref": "ActiveCall"
                }
            },
            "code": {
                "type": "integer",
                "description": "Result of operation"
            },
            "runtime_ms": {
                "type": "string",
                "description": "Optional; timing of operation"
            }
        }
    },

    "ActiveCallCount": {
        "id": "ActiveCallCount",
        "type": "array",
        "description": "Number of all currently active calls",
        "required": ["count", "code"],
        "properties": {
            "count": {
                "type": "integer",
                "description": "Call count"
            },
            "code": {
                "type": "integer",
                "description": "Result of operation"
            },
            "runtime_ms": {
                "type": "string",
                "description": "Optional; timing of operation"
            }
        }
    },

    "ActiveCall": {
        "id": "ActiveCall",
        "description": "Represents base informations of a currently ongoing call",
        "required": ["created_ts", "caller_uri", "call_id"],
        "properties": {
            "created_ts": {
                "type": "string",
                "description": "UTC timestamp when call started"
            },
            "caller_uri": {
                "type": "string",
                "description": "SIP URI of caller"
            },
            "call_id": {
                "type": "string",
                "description": "Unique call ID"
            },
            "call_id_alt": {
                "type": "string",
                "description": "Alternate call ID"
            }
        }
    },

    "Message": {
        "id": "Message",
        "description": "Send message",
        "required": ["call_id", "message"],
        "properties": {
            "message": {
                "type": "string",
                "description": "Message text"
            }
        }
    },

    "MessageResult": {
        "id": "MessageResult",
        "description": "Send message result",
        "required": ["code"],
        "properties": {
            "code": {
                "type": "integer",
                "description": "Result of operation"
            },
            "runtime_ms": {
                "type": "string",
                "description": "Optional; timing of operation"
            }
        }
    }
};
