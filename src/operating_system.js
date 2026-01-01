const fs = require('node:fs');
const prompt = require('prompt-sync')({
    sigint: true
});


// This has no intention of mimicking an IBM 7094
class OperatingSystem {
    constructor() {
        this.inputList = [];
        this.outputList = [];
        this.historyList = [];
    }


    addInput(txt) {
        this.inputList.push(txt);
    }


    getInput(tape_unit /*=0 for keyboard, assumed*/ ) {
        let inputMessage;

        if (this.inputList.length) {
            inputMessage = this.inputList.shift();
            // because input from files isn't auto-echo'd like prompt()
            this.output(inputMessage);
        } else {
            inputMessage = prompt();
        }

        this.historyList.push(`< ${inputMessage}`);
        return inputMessage;
    }


    registerOutput(txt) {
        if (Array.isArray(txt)) {
            txt = txt.join(' ');
        }
        //
        this.outputList.push(txt);
        this.historyList.push(`> ${txt}`);
        //
        return txt;
    }


    output(msg) {
        console.log(msg);
    }


    error(msg) {
        console.error(msg);
    }


    readFile(filename) {
        const contents = fs.readFileSync(filename, 'utf8');
        return contents;
    }

}


module.exports = OperatingSystem;
