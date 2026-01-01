const fs = require('node:fs');

// The system
const OperatingSystem = require('./operating_system');
const MadInterpreter = require('./mad').MadInterpreter;

// The software
const Eliza = require('./eliza.mad');

// Our tweaks
const Settings = require('./settings');

// Let's go!
const settings = new Settings();
const operatingSystem = new OperatingSystem();
const mad = new MadInterpreter(settings, operatingSystem);

// Sanity!
if (settings.traceDebug) {
    operatingSystem.output(`Debug mode: ON`);
}

// Load in sample input
if (settings.useInputFile) {
    const testFileContents = fs.readFileSync(settings.useInputFile, 'utf8');
    testFileContents.split('\n').forEach((line) => {
        operatingSystem.addInput(line);
    });
}

// Processing loop
mad.transferTo(Eliza.initialize);
while (mad.callNextLabel()) {
    // NOP
}

// Dump all interactions (with > and < annotations)
if (settings.traceRecap) {
    mad.writeOutput(`Eliza Recap:`);

    operatingSystem.historyList.forEach((r) => {
        mad.writeOutput(r);
    });
}
