const Slip = require('./slip');
const Types = require('./types');
const lisp = require('./lisp');

const LArray   = Types.LArray;
const LInteger = Types.LInteger;
const LList    = Types.LList;


class MadInterpreter {

    static TRUE = 1;
    static FALSE = 0;

    static MODE = {
        INTEGER: 10,
        BOOLEAN: 11,
        STATEMENT_LABEL: 12,
        FUNCTION_NAME: 13,
        FLOATING_POINT: 14,
        // or MODE NUMBER n (0-7),
    }

    constructor(settings, operatingSystem) {
        // OS vars
        this.settings = settings;
        this.operatingSystem = operatingSystem;

        // MAD state variables
        this.mode = 0;
        this.varList = new Map();
        this.execList = new Map();
        this.nextLabel = undefined;
        this.slip = new Slip(this);

        this.initializeLanguage();
        this.initializeScope();
    }


    initializeScope() {
        // NOTE: Remember to bind to a MADslip object before calling these methods
        this._scope = {
            operatingSystem: this.operatingSystem,

            lvalue: (varName) => {
                const varObject = this._scope.lvar(varName);
                if (varObject) {
                    return varObject.value();
                }
                return undefined;
            },

            lassign: (varName, value) => {
                const varObject = this._scope.lvar(varName);
                if (varObject) {
                    return varObject.assign(value);
                }
                return undefined;
            },

            lvar: (varName) => {
                if (typeof varName === typeof undefined) {
                    return undefined;
                }
                //
                const uvn = varName.toLowerCase();
                let varObject = this.varList.get(uvn);
                return varObject;
            },

            iralst: (varName) => {
                if (typeof varName === typeof undefined) {
                    return undefined;
                }
                //
                const uvn = varName.toLowerCase();
                delete this.varList[uvn];
            },
            //
            declareList: (varName) => {
                const uvn = varName.toLowerCase();
                const lvar = new LList(this._scope, uvn);
                this.varList.set(uvn, lvar)
                return lvar;
            },

            mkArrayVar: (varName, idx) => {
                return `${varName}[${idx}]`;
            }
        }
    }


    initializeLanguage() {
        //
        this._addInstruction('normal mode is', (mode) => {
            // INTEGER, BOOLEAN, STATEMENT LABEL, FUNCTION NAME, FLOATING POINT, or MODE NUMBER n (0-7),
            this.mode = mode;
        });

        this._addInstruction('dimension', (params) => {
            const var_list = params.split(','); // 1d only
            var_list.forEach((var_declaration) => {
                const declaration = var_declaration.match(/^(.*)\((\d+)\)$/);
                const varName = declaration[1];
                const size = parseInt(declaration[2]);

                this.declareArray(varName, size);
            });
        });

        this._addInstruction('PRINT COMMENT', (params) => {
            const written = this.operatingSystem.registerOutput(params);
            this.writeOutput(written);
        });

        this._addInstruction('READ FORMAT', (params) => {
            const param_list = params.split(',');
            const varName = param_list[1]

            const value = this.operatingSystem.getInput();

            this.declareVariable(varName);
            this.lvar(varName).assign(value);
        });

        this._addInstruction('x', (params) => {
            const var_list = params.split(',');
        });

    }


    // Variable handlers
    // (This should move into _scope, when we have a need)
    declareVariable(varName) {
        const uvn = varName.toLowerCase();
        // TODO: Mode check, and switch to LInteger, even if Eliza doesn't use it
        const lvar = new LInteger(this._scope, uvn);
        this.varList.set(uvn, lvar);
        return lvar;
    }


    declareArray(varName, size) {
        const uvn = varName.toLowerCase();
        const lvar = new LArray(this._scope, uvn, size);
        this.varList.set(uvn, lvar);
        return lvar;
    }


    mkArrayVar(varName, idx) {
        return this._scope.mkArrayVar(varName, idx);
    }


    // TODO: Err/exception on re-declare?
    declareList(varName) {
        return this._scope.declareList(varName);
    }


    ltype(varName, factoryMethod) {
        const uvn = varName.toLowerCase();
        let varObject = this.varList.get(uvn);
        if (typeof varObject === typeof undefined) {
            varObject = factoryMethod.bind(this)(uvn);
        }
        return varObject;
    }


    // Return the var object, creating it if it didn't already exist
    lvar(varName) {
        const varObject = this._scope.lvar(varName) || this.ltype(varName, this.declareVariable);
        return varObject;
    }


    larray(varName) {
        const varObject = this._scope.lvar(varName) || this.ltype(varName, this.declareArray);
        return varObject;
    }


    llist(varName) {
        const varObject = this._scope.lvar(varName) || this.ltype(varName, this.declareList);
        return varObject;
    }


    // Directly return the value from the variable, to avoid lvar().value() calls in the code
    // (also, create if new)
    lvalue(varName) {
        return this.lvar(varName).value();
    }


    // Directly assign a value to the variable, to avoid lvar().assign() calls in the code
    // (also, create if new)
    lassign(varName, value) {
        return this.lvar(varName).assign(value);
    }


    lassignList(varName, value) {
        return this.llist(varName).assign(value);
    }


    iralst(varName) {
        return this._scope.iralst(varName);
    }


    // SLIP functions
    namlst(varName) {
        // Returns true is varname is the name of list
        // REF:E.SLIP(62L15)
        const lvar = this._scope.lvar(varName);
        if (lvar && lvar instanceof LList) {
            return MadInterpreter.TRUE;
        }
        return MadInterpreter.FALSE;
    }


    lstseq(varname1, varname2) {
        // Returns true if contents of both lists are equal
        // REF:E.SLIP(62L15)
        // TODO
        return MadInterpreter.FALSE;
    }


    // Utils
    strEq(a, b) {
        return a.toLowerCase() === b.toLowerCase();
    }


    // IO
    // TODO: Handle ability to open multiple files at same time
    openFileStream = undefined;
    openFileStreamIndex = 0;
    threadReadText(targetList, sourceFilename) {
        const sourceContents = this.operatingSystem.readFile(`tapes/tape.${sourceFilename}`);
        const sourceList = lisp.parseList(sourceContents);

        this._scope.lassign(targetList, sourceList);
    }


    isFileOpen(fn) {
        return this.openFileStream ? true : false
    }


    openFile(filename) {
        const sourceContents = this.operatingSystem.readFile(`tapes/${filename}`);

        this.openFileStream = lisp.parseList(sourceContents);
        this.openFileStreamIndex = 0;
    }


    readList(sourceFilename) {
        const tapeFilename = `tape.${sourceFilename}`;
        if (!this.isFileOpen(tapeFilename)) {
            this.openFile(tapeFilename);
        }

        const nextLine = this.openFileStream[this.openFileStreamIndex];
        this.openFileStreamIndex++;

        return nextLine;
    }


    txtprt(varName, param) {
        const contents = this.lvalue(varName);
        const text = contents.slice(param).join(' ');
        this.exec('print comment', text);
    }


    // The MAD SLIP handlers
    _addInstruction(name, cb) {
        // Although MAD used all upper case we, in the 21st century, have more sensitive eyes :)
        // So everything internal to our MADSlip class is processed in lower case.
        this.execList.set(name.toLowerCase(), cb)
    }


    transferTo(cbfn, param) {
        this.nextLabel = cbfn;
        this.nextParam = param;
    }


    callNextLabel() {
        const gotoLabel = this.nextLabel;

        if (gotoLabel) {
            this.nextLabel = undefined;
            gotoLabel(this, this.nextParam);
            return true;
        }

        return false;
    }


    parse(instr) {
        this.error(`Parse not supported for ${instr}`);
    }


    exec(instr, params) {
        // const keywords = instr.split('.');
        const keyword = instr.toLowerCase();
        const cbfn = this.execList.get(keyword);

        if (cbfn) {
            return cbfn(params);
        }
        //
        const alt_cbfn = this.execList.get(keyword.replaceAll('.', ' '));

        if (alt_cbfn) {
            cbfn(params);
        }
    }


    comment(msg) {
        if (this.settings.traceComments) {
            this.writeOutput(msg);
        }
    }


    error(msg) {
        this.writeError(msg);
    }


    // Debug and development bits
    dump(marker) {
        if (typeof marker !== typeof undefined) {
            this.writeOutput(marker);
        }
        //
        this.varList.forEach((v) => {
            this.writeOutput(`${v.name} (${v.typename()}) : ${v.dump()}`);
        });
    }


    traceDebug(msg) {
        if (this.settings.traceDebug) {
            this.writeOutput(msg);
        }
    }


    getTraceStats() {
        const states = this.settings.traceStates;
        let prefix = "";

        if (states.includes("l")) {
            prefix += prefix ? ' ' : '';
            prefix += `limit=${this._scope.lvalue('LIMIT')}`;
        }


        return prefix ? `[${prefix}] ` : ``;
    }


    // All output via these methods, please!
    writeOutput(msg) {
        this.operatingSystem.output(`${this.getTraceStats()}${msg}`);
    }


    writeError(msg) {
        this.operatingSystem.error(`${this.getTraceStats()}${msg}`);
    }

}


module.exports = { MadInterpreter };
