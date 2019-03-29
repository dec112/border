/// <binding BeforeBuild='debug' />
/* global module:false */

module.exports = function(grunt) {

    // Project configuration
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        // see https://github.com/gruntjs/grunt-contrib-clean
        clean: {
            debug: ['dist'],
            release: ['dist']
        },

        // see https://github.com/gruntjs/grunt-contrib-uglify
        uglify: {
            debug_server: {
                options: {
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                        '(c) Copyright <%= pkg.author %> - ' +
                        '<%= grunt.template.today("yyyy-mm-dd") %> */\n',
                    mangle: false,
                    compress: false,
                    sourceMap: false,
                    report: 'min',
                    beautify: true
                },
                files: [
                    {
                        expand: true,
                        cwd: 'source/server',
                        src: [
                            '**/*.js',
                            '!config/env/development.js'
                        ],
                        dest: 'dist'
                    }
                ]
            },
            release_server: {
                options: {
                    banner: '/*! <%= pkg.name %> - v<%= pkg.version %> - ' +
                        '(c) Copyright <%= pkg.author %> - ' +
                        '<%= grunt.template.today("yyyy-mm-dd") %> */\n',
                    mangle: {
                        reserved: [
                        ]
                    },
                    compress: true,
                    sourceMap: false,
                    sourceMapName: 'dist/dec112-border-1.map',
                    report: 'min',
                    beautify: false
                },
                files: [
                    {
                        expand: true,
                        cwd: 'source/server',
                        src: [
                            '**/*.js',
                            '!config/env/development.js'
                        ],
                        dest: 'dist'
                    }
                ]
            }
        },

        // see https://github.com/gruntjs/grunt-contrib-copy
        copy: {
            debug_server: {
                files: [
                    { src: ['package.json'], dest: 'dist/package.json' },
                    { src: ['readme.md'], dest: 'dist/readme.md' },
                    {
                        cwd: 'source/server/config/env',
                        expand: true,
                        src: [
                            'development.js'
                        ],
                        dest: 'dist/config/env'
                    },
                    { src: ['source/server/favicon.ico'], dest: 'dist/favicon.ico' },
                    {
                        expand: true,
                        cwd: 'source/server/lang',
                        src: '**/*',
                        dest: 'dist/lang'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/downloads',
                        src: '**/*',
                        dest: 'dist/downloads'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/docs',
                        src: '**/*',
                        dest: 'dist/docs'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/data',
                        src: '**/*',
                        dest: 'dist/data'
                    }
                ]
            },
            release_server: {
                files: [
                    { src: ['package.json'], dest: 'dist/package.json' },
                    { src: ['readme.md'], dest: 'dist/readme.md' },
                    {
                        cwd: 'source/server/config/env',
                        expand: true,
                        src: [
                            'development.js'
                        ],
                        dest: 'dist/config/env'
                    },
                    { src: ['source/server/favicon.ico'], dest: 'dist/favicon.ico' },
                    {
                        expand: true,
                        cwd: 'source/server/lang',
                        src: '**/*',
                        dest: 'dist/lang'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/downloads',
                        src: '**/*',
                        dest: 'dist/downloads'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/docs',
                        src: '**/*',
                        dest: 'dist/docs'
                    },
                    {
                        expand: true,
                        cwd: 'source/server/data',
                        src: '**/*',
                        dest: 'dist/data'
                    }
                ]
            }
        },

        // see https://github.com/gruntjs/grunt-contrib-compress
        compress: {
            zip: {
                options: {
                    archive: './dec112-border.zip',
                    mode: 'zip'
                },
                files: [
                    { src: './gpl-3.0.txt' },
                    { src: './start_server.*' },
                    { src: './dist/**' }
                ]
            }
        }
    });

    // Load Grunt plugins.
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-uglify-es');
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-compress');

    // Tasks
    grunt.registerTask('createDirectories', function(d) {
        grunt.file.mkdir('dist');
        grunt.file.mkdir('dist/docs');
        grunt.file.mkdir('dist/downloads');
    });

    // tasks / targets
    grunt.registerTask('debug', [
        'clean:debug',
        'createDirectories',
        'copy:debug_server',
        'uglify:debug_server',
        'compress:zip'
    ]);
    grunt.registerTask('deploy_debug', [
        'deploy:debug'
    ]);

    grunt.registerTask('release', [
        'clean:release',
        'createDirectories',
        'copy:release_server',
        'uglify:release_server',
        'compress:zip'
    ]);
    grunt.registerTask('deploy_release', [
        'deploy:release'
    ]);

    grunt.registerTask('default', ['release']);
    grunt.registerTask('build', ['debug']);
};
