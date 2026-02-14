// The system
const OperatingSystem = require('./operating_system_web');
const MadInterpreter = require('../../src/mad').MadInterpreter;

// The software
const Eliza = require('../../src/eliza.mad');

// Let's go!
const operatingSystem = new OperatingSystem();
const mad = new MadInterpreter({traceStates:""}, operatingSystem);

window.eliza = {
    mad: mad,
    Eliza: Eliza,
    os: operatingSystem
};
