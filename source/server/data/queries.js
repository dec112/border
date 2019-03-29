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

var promise = require('bluebird');

var pg_options = {
    // Initialization Options
    promiseLib: promise
};

var pgp = require('pg-promise')(pg_options);
// ensure that postgres timestamps without TZ information
// are correctly handled
pgp.pg.types.setTypeParser(1114, function (stringValue) {
    return new Date(Date.parse(stringValue + "+0000"));
});

var db = pgp(config.database);
var SCHEMA = (config.database.schema ? config.database.schema + '.' : '');
var GIS_SCHEMA = (config.database.gis_schema ? config.database.gis_schema + '.' : '');


// ======================================================================
// Query Functions

function open_call(ctx, origin, call,
        message_raw, message_parsed) {
    var method = 'open_call';

    return ctx.one('INSERT INTO ' + SCHEMA + 'calls ' +
            '(call_id, call_id_alt, device_id, caller_sip, caller_id, ' +
                'called_sip, requested_service, is_test)' +
            'VALUES (${call_id}, ${call_id_alt}, ${device_id}, ' +
                '${caller_uri}, ${caller_id}, ${called_uri}, ' +
                '${service}, ${is_test}) ' +
            'RETURNING ID, created_ts, call_id, call_id_alt', call)
        .then(function (result) {
            return ctx.task(function(task) {
                return store_entry(task, origin, result.id, message_raw, message_parsed)
                    .then(function() {
                        return Promise.resolve({
                                created_ts: result.created_ts,
                                id: result.call_id,
                                id_alt: result.call_id_alt,
                                db_id: result.id
                            });
                    });
            });
        })
        .catch(function(error) {
            tools.logError(method + ' error: ' + error, error);
        });
}

function close_call() {
}

function get_call(ctx, call_db_id) {
    var method = 'get_call';
    var result = {};
    var start = tools.getHrTime();

    return ctx.one('SELECT * FROM ' + SCHEMA + 'calls ' +
            'WHERE id = $1', call_db_id)
        .then(function(call) {
            result = {
                created_ts: call.created_ts,
                call_id: call.call_id,
                call_id_alt: call.call_id_alt,
                device_id: call.device_id,
                caller_id: call.caller_id,
                caller: call.caller_sip,
                length: 0,
                chat: []
            };
            return ctx.any('SELECT * FROM ' + SCHEMA + 'entries ' +
                'WHERE call_db_id = $1', call.id);
        })
        .then(function(entries) {
            var b = [];

            result.length = entries.length;
            entries.forEach(function(entry) {
                var e = {
                    created_ts: entry.created_ts,
                    origin: entry.origin,
                    message_id: entry.message_id
                };
                result.chat.push(e);

                b.push(ctx.batch([
                    // texts
                    ctx.any('SELECT * FROM ' + SCHEMA + 'texts ' +
                            'WHERE entry_db_id = $1', entry.id),
                    // locations
                    ctx.any('SELECT * FROM ' + SCHEMA + 'locations ' +
                            'WHERE entry_db_id = $1', entry.id),
                    // data
                    ctx.any('SELECT * FROM ' + SCHEMA + 'data ' +
                            'WHERE entry_db_id = $1', entry.id)
                ])
                .then(function(entry_details) {
                    //tools.logDebug(method + ' entry_details', entry_details);

                    var texts = entry_details[0];
                    //tools.logDebug(method + ' texts', texts);
                    e.texts = [];
                    texts.forEach(function(text) {
                        e.texts.push(text.content);
                    });

                    var locations = entry_details[1];
                    //tools.logDebug(method + ' locations', locations);
                    e.locations = [];
                    locations.forEach(function(location) {
                        e.locations.push({
                            lon: location.longitude,
                            lat: location.latitude,
                            alt: location.altitude,
                            rad: location.radius,
                            method: location.method
                        });
                    });

                    var data = entry_details[2];
                    //tools.logDebug(method + ' data', data);
                    e.data = [];
                    data.forEach(function(d) {
                        e.data.push({
                            name: d.name,
                            value: d.value
                        });
                    });

                    return e;
                }));
            });

            return ctx.batch(b);
        })
        .then(function(all_entry_details) {
            return result;
        });
}

function get_call_by_call_id(call_id, svcName) {
    var method = 'get_call_by_call_id';

    return db.task(function(t) {
        return t.one('SELECT id FROM ' + SCHEMA + 'calls ' +
                'WHERE call_id = $1 ' +
                'AND requested_service = $2',
                    [call_id, svcName])
            .then(function(call) {
                return get_call(t, call.id);
            })
            .catch(function(error) {
				if(error.code == 0)
                    throw new Error('call_id (' + call_id + ') ' +
                        'not found');
                else
                    throw error;
            });
    });
}

function get_call_by_call_id_alt(call_id_alt, svcName) {
    var method = 'get_call_by_call_id_alt';

    return db.task(function(t) {
        return t.one('SELECT id FROM ' + SCHEMA + 'calls ' +
                'WHERE call_id_alt = $1 ' +
                'AND requested_service = $2',
                    [call_id_alt, svcName])
            .then(function(call) {
                return get_call(t, call.id);
            })
            .catch(function(error) {
				if(error.code == 0)
                    throw new Error('call_id_alt (' + call_id_alt + ') ' +
                        'not found');
                else
                    throw error;
            });
    });
}

function store_entry(ctx, origin, call_db_id, message_raw, message_parsed) {
    var method = 'store_entry';

    var entry_db_id;

    // -------------------------------------------------------------------------
    // save call entry
    return ctx.one('INSERT INTO ' + SCHEMA + 'entries ' +
        '(call_db_id, origin, message_raw, ' +
            'message_parsed, message_id) ' +
        'VALUES (${call_db_id}, ${origin}, ${message_raw}, ' +
            '${message_parsed}, ${message_id}) ' +
        'RETURNING ID, id', {
            call_db_id: call_db_id,
            origin: origin,
            message_raw: message_raw,
            message_parsed: message_parsed,
            message_id: _.get(message_parsed, 'message_id', 0)
        })
        .then(function(result) {
            entry_db_id = result.id;
            var queries = [];

            // -----------------------------------------------------------------
            // save text blocks
            if(message_parsed.texts.length > 0) {
                var values = _.map(message_parsed.texts, function(text) {
                    return {
                        'entry_db_id': entry_db_id,
                        'content': text
                    }
                });

                // create multi value sql insert statement
                // the @@ part is a hack as it is not possible to
                // create a preformated table name without quotes
                var columns = new pgp.helpers.ColumnSet(
                    ['entry_db_id', 'content'],
                    { table: '@@TABLE@@' });
                var sql = pgp.helpers.insert(values, columns);
                sql = sql.replace('"@@TABLE@@"', SCHEMA + 'texts');

                queries.push(ctx.none(sql));
            }

            // -----------------------------------------------------------------
            // save locations
            if(message_parsed.locations.length > 0) {
                var values = _.map(message_parsed.locations, function(location) {
                    return {
                        'entry_db_id': entry_db_id,
                        'latitude': location.lat,
                        'longitude': location.lon,
                        'altitude': location.alt,
                        'radius': location.rad,
                        'method': location.method
                    }
                });

                // create multi value sql insert statement
                // the @@ part is a hack as it is not possible to
                // create a preformatted table name without quotes
                var columns = new pgp.helpers.ColumnSet(
                    [
                        'entry_db_id', 'latitude', 'longitude',
                        'altitude', 'radius', 'method'
                    ],
                    { table: '@@TABLE@@' });
                var sql = pgp.helpers.insert(values, columns);
                sql = sql.replace('"@@TABLE@@"', SCHEMA + 'locations');

                queries.push(ctx.none(sql));
            }

            // ----------
            // save data
            if(message_parsed.data.length > 0) {
                var values = _.flattenDeep(
                        _.map(message_parsed.data, function(data) {
                    return _.map(tools.flattenObject(data), function(value, key) {
                        return {
                            'entry_db_id': entry_db_id,
                            'name': key,
                            'value': value
                        }
                    })
                }));

                // create multi value sql insert statement
                // the @@ part is a hack as it is not possible to
                // create a preformatted table name without quotes
                var columns = new pgp.helpers.ColumnSet(
                    ['entry_db_id', 'name', 'value'],
                    { table: '@@TABLE@@' });
                var sql = pgp.helpers.insert(values, columns);
                sql = sql.replace('"@@TABLE@@"', SCHEMA + 'data');

                queries.push(ctx.none(sql));
            }

            return ctx.batch(queries);
        })
        .catch(function(error) {
            tools.logError(method + ' error: ' + error, error);
        });
}

function get_country_from_location(ctx, location) {
    return ctx.one('SELECT ' +
            'cntr_id, cntr_name, name_engl, iso3_code ' +
        'FROM ' + GIS_SCHEMA + 'country_regions ' +
        'WHERE ST_Contains(geom, ' +
            'ST_GeomFromText(\'POINT (${lon} ${lat})\'));',
                location);
}



// ======================================================================
// Exports

module.exports = {
    db: db,
    open_call: open_call,
    close_call: close_call,
    get_call_by_call_id: get_call_by_call_id,
    get_call_by_call_id_alt: get_call_by_call_id_alt,
    store_entry: store_entry,
    get_country_from_location: get_country_from_location,
};
