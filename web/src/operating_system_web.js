
class OperatingSystem {
#cbOutput = undefined;

    constructor() {
        this.inputList = [];
    }


    addInput(txt) {
        this.inputList.push(txt);
    }

    registerCallbackOutput(cbfn) {
        this.#cbOutput = cbfn;
    }


    getInputAsync(tape_unit /*=0 for keyboard, assumed*/ ) {
        const self = this;

        return new Promise((resolve, reject) => {
            // To fit with the node code structure, this is a bit of a kludge
            const ival = setInterval(() => {
                if (self.inputList.length) {
                    const inputMessage = self.inputList.shift();

                    self.output(inputMessage);

                    clearInterval(ival);

                    resolve(inputMessage);
                }
            }, 100)
        });
    }


    registerOutput(txt) {
        return txt;
    }


    output(msg) {
        if (this.#cbOutput) {
            this.#cbOutput(msg);
        }
    }


    error(msg) {
        if (this.#cbOutput) {
            this.#cbOutput(`ERROR: ${msg}`);
        }
    }


    async readFileAsync(filename) {
        let contents;

        await fetch(filename)
        .then(res => res.text())
        .then(data => contents=data)

        return contents;
    }

}


module.exports = OperatingSystem;
