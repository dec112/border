# Deaf Emergency Call 112 (DEC112) Border Gateway
Providing emergency 112 calling functions for the deaf.
This project implements the backend border gateway services.
These services allows integration of DEC112 into emergency call centers (PSAP).

## Installation
To install ensure you have the following dependencies installed:

1. node.js
   Download and install node from https://nodejs.org/en/
2. If you install from distribution ZIP file:
    * A zip unpacker
    * Unzip the dec112-border.zip archive somewhere on your server
3. If you install from distribution GIT repository
    * Execute `git checkout`
4. Change into `dist` folder
5. Install needed node.js modules
    * Execute `npm install`
6. Change configuration in `config/env` according to your needs
6. Change `start_server` script in root directory to match your   configuration

## Documentation
The following links provide additional information about various aspects of the DEC112 Border Gateway:

* [DEC112](https://www.dec112.at)
* [Overview](docs/readme.md)
* [Database](docs/database.md)
* [Rest and Websocket API](docs/api.md)

## Development
To start development ensure you have the following dependencies installed:

### Prerequisites
1. To install (**node.js**) and (**npm**)
   * download and install node from
     https://nodejs.org/en/
2. Grunt command line utility (**grunt-cli**)
   * install using `npm install -g grunt-cli`
3. Gulp command line utility (**gulp-cli**)
   * install using `npm install -g gulp-cli`
3. Bower package manager (**bower**)
   * install using `npm install -g bower`
4. **typings**
   install using `npm install -g typings`
5. Visual Studio Code (**vscode**)
   Download and install from https://code.visualstudio.com/

Then clone the repository with `git clone` and inside the dec112-border project root folder issue the following commands:

1. To init the submodules (if any):
   * `git submodule init`
   * `git submodule update`
2. To fetch all dependency modules:
   * `npm install`
3. To fetch all client modules:
   * `bower install`
4. To install code informations:
   * `typings install`
5. Open dec112-border folder with vscode and start coding
6. `CTRL+SHIFT+B` in vscode builds project - or -
   to build project from command line enter `grunt build`
7. After build, `dist` folder contains redistributable built
   project (also available in compressed `dec112-border.zip` archive in
   project root folder)

## Contributing
1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## Notes
This prototype implementation was funded by [NetIdee](https://www.netidee.at). See [project blog](https://www.netidee.at/dec112) and [DEC112 homepage](https://www.dec112.at) for more informations.

## History
Developed 2018-2019

## Credits
Thanks to NetIdee and all our supporters !!

## Waranty
---

This software is a prototypically implementation of a lightweight, web based, integrated solution for handling deaf emergency communications in a text based
chat. There is **ABSOLUTELY NO GUARANTY** that it works as expected! As emergency communication is critical, use this software at your own risk! The authors accept no liability for any incidents resulting from using this software!

---

## License
This project is under GNU GPLv3.
See file gpl-3.0.txt in this project or http://www.gnu.org/licenses/gpl-3.0.html

**COMMERCIAL USAGE PROHIBITED**
