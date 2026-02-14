// Use the async verion of prompt, if possible
const prompt = require("prompt");
prompt.message = prompt.delimiter = '';
prompt.start();

// The async prompt is for backcompat
const promptSync = require('prompt-sync')({
    sigint: true
});

// FS still uses the sync version
const fs = require('node:fs');
const fsAsync = require('fs/promises');


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
            inputMessage = promptSync();
        }

        this.historyList.push(`< ${inputMessage}`);
        return inputMessage;
    }


    getInputAsync(tape_unit /*=0 for keyboard, assumed*/ ) {
        const self = this;

        return new Promise((resolve, reject) => {
            if (self.inputList.length) {
                const inputMessage = self.inputList.shift();
                // because input from files isn't auto-echo'd like prompt()
                self.output(inputMessage);
                self.historyList.push(`< ${inputMessage}`);

                resolve(inputMessage);

            } else {
                prompt.get([{
                    name: "input",
                    description: " ",   // We want an empty string here, but doing so shows the property name (which is worse)
                }], function(err, res){
                    const inputMessage = res.input;
                    self.historyList.push(`< ${inputMessage}`);
                    resolve(inputMessage);
                });
            }
        });
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


    async readFileAsync(filename) {
        const contents = await fsAsync.readFile(filename, 'utf8');
        return contents;
    }

}


module.exports = OperatingSystem;
