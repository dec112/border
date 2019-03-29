"use strict";

module.exports = {
    quite: false,
    debug: true,
    server: {
        listen: "0.0.0.0",
        port: 8080,
        CORS: true,
        log_directory: "logs",
        // https: {
        //     port: 443,
        //     key: "certs/dec112.at.key",
        //     ca: "certs/dec112.at.intermediate.crt",
        //     cert: "certs/dec112.at.primary.crt"
        // }
    },
    sip: {
        debug: false,
        // human readable SIP name of the border gateway
        display_name: "Development Center",
        // SIP credential to use to register
        uri: "sip:xyz@service.dec112.at",
        password: "xyz",
        stun_servers: ["stun:stun.l.google.com:19302"],
        // language which should be used for automatic generated
        // messages by the border gateway
        default_lang: "en",
        // specify in which languages error messages should be
        // sent. multiple language codes are sent as a single
        // message with multiple separated text blocks in
        // the languages specified
        default_error_languages: ["de", "en"],
        call_stale_timeout_ms: 100000,
        call_close_timeout_ms: 200000
    },
    api: {
        // At the moment only a handful api keys are required so this
        // configuration is enough. Later place them into the db
        keys: {
            "i_am_a_test_key": {
                enabled: true,
                description: "DEC112 development key",
                service: "chat"
            }
        }
    },
    services: {
        chat: {
            // type of service. needs an accompanying javascript implementation
            // in services folder with that basename.
            type: "chat",
            // enable or disable this service
            enabled: true,
            // description text is used as sender name for this service
            // in messages sent to caller
            description: "DEC112 demo chat service",
            // if false, border gateway will not send automatic
            // generated messages (e.g. in case of system errors)
            automatic_messages: true,
            // relative path to base language resource path which contains
            // specific language resources for this service in addition
            // to the system wide available language resources
            lang_path: "chat",
            // default language for this service
            default_lang: "en",
            // in case of automatically generated error messages by the border
            // gateway and when no language information from caller is available
            // in which languages to send error messages back
            default_error_languages: ["de", "en"],
            registration_api: {
                // if false dont call the DEC112 registration service
                // and ignore this configuration
                enabled: true,
                // url (host and port) of DEC112 registration service
                url: "http://server.domain.tld",
                // base path of registration service
                base_path: "/api/v1",
                // api key to use when calling the service
                api_key: "i_a,_the_reg_api_key",
                request_timeout: 1000,
                response_timeout: 2000
            },
            triggers: {
                t1: {
                    // define which trigger type to use
                    type: "dec112",
                    // if false this trigger configuration will be ignored
                    enabled: true,
                    request_timeout: 1000,
                    response_timeout: 5000,
                    // dont call trigger if call is a test call
                    ignore_test_calls: false,
                    // provide url for sending a http post trigger about received
                    // newly opened calls by border gateway
                    // allows placeholders in the form <%= name %> where name could be:
                    // (call_id, device_id, caller_id, caller_uri, caller_name, lang)
                    open_url: "http://localhost:7777",
                    // if enabled parse json response from open trigger for call_id_alt
                    parse_open_response: true,
                    // which https response codes are considered valid
                    // this could be an array of integer numbers or a
                    // string which includes a regular expression. if not
                    // specified defaults to [ 200 ]
                    valid_open_response_codes: [ 201 ],
                    // requires a valid alternate call id received with open trigger
                    // otherwise reject caller
                    require_open_response: true,
                    // provide url where client can view call indicated by trigger
                    // allows placeholders in the form <%= name %> where name could be:
                    // (call_id, device_id, caller_id, caller_uri, caller_name, lang)
                    web_view_url: "http://localhost:8080/viewer/?call_id=<%= call_id %>&api_key=i_am_a_test_key",
                    // provide url to border gateway api for control center systems
                    // to request call data for a call
                    api_url: "http://server.domain.tld:8080/api/v1/call/<%= call_id %>?api_key=i_am_a_test_key"
                }
            }
        },
        default: "chat"
    },
    // See also:
    // https://github.com/vitaly-t/pg-promise/wiki/Connection-Syntax
    // use postgres local domain socket (normally "/var/run/postgresql/")
    // for local connections
    database: {
        host: "localhost",
        port: 5432,
        database: "postgres",
        user: "user",
        password: "password",
        schema: "dec112_border"
    },
    kamailio: {
        ws: "ws://server.domain.tld:8088"
    }
}

