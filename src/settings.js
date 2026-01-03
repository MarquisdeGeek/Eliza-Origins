const parseArgs = require('node:util').parseArgs;



class Settings {
    constructor() {

        const {
            values: {
                trace,
                file,
                recap,
                debug,
                states,
            },
        } = parseArgs({
            options: {
                'file': {
                    type: 'string',
                    short: 'f',
                },
                'recap': {
                    type: 'boolean',
                    short: 'r',
                },
                'trace': {
                    type: 'boolean',
                    short: 'c',
                },
                'debug': {
                    type: 'boolean',
                    short: 'd',
                },
                'states': {
                    type: 'string',
                    short: 's',
                },
            },
        });

        this.useInputFile  = file;
        //
        this.traceComments = trace ?? false;
        this.traceDebug    = debug ?? false;
        this.traceRecap    = recap ?? false;
        this.traceStates   = states ?? "";
    }
}

module.exports = Settings;
