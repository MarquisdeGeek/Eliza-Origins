// This is my original transformation. I am unlikely to have time to keep
// every change in sync with the main code in src/ ... but PRs are welcome!
const parseArgs = require('node:util').parseArgs;
const fs = require('node:fs');
const lisp = require('./lisp');
const prompt = require('prompt-sync')({
    sigint: true
});


const {
    values: {
        trace,
        file
    },
} = parseArgs({
    options: {
        'file': {
            type: 'string',
            short: 'f',
        },
        'trace': {
            type: 'boolean',
            short: 'c',
        },
    },
});


const settings = {
    useInputFile: file,
    //
    traceComments: trace ?? false,
    traceDebug: false,
    traceRecap: false,
};


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


class Slip {

    constructor(mad /*backptr*/ ) {
        this.mad = mad;
    }

    // VIBE:=
    // Given an array of [0 I 0 YOU 2], each number represents a specific number of words (0 = any number, 1 = one word, etc), and a string of text, write a javascript function to determine if the text matches the array, and return an array of arrays with  the matched text. The array should have the same number of elements as the original pattern.
    // in the javascript code, (0) should return the whole input - it doesn't. also the final check should be against the pattern length
    #matchPattern(pattern, words) {
        let wordIndex = 0;
        const result = [];

        for (let i = 0; i < pattern.length; i++) {
            const token = pattern[i];

            // Literal word
            if (typeof token === 'string') {
                if (words[wordIndex] !== token) return null;
                result.push([words[wordIndex]]);
                wordIndex++;
                continue;
            }

            // Numeric token
            if (typeof token === 'number') {
                // 0 = any number of words
                if (token === 0) {
                    const captured = [];

                    // If this is the LAST pattern element, consume everything
                    if (i === pattern.length - 1) {
                        while (wordIndex < words.length) {
                            captured.push(words[wordIndex++]);
                        }
                    } else {
                        // Otherwise, consume until the next literal can match
                        const nextLiteral = pattern
                            .slice(i + 1)
                            .find(v => typeof v === 'string');

                        if (!nextLiteral) {
                            // No future literal → consume remaining words conservatively
                            while (wordIndex < words.length) {
                                captured.push(words[wordIndex++]);
                            }
                        } else {
                            while (wordIndex < words.length && words[wordIndex] !== nextLiteral) {
                                captured.push(words[wordIndex++]);
                            }
                        }
                    }

                    result.push(captured);
                    continue;
                }

                // token > 0 → exact word count
                if (wordIndex + token > words.length) return null;

                result.push(words.slice(wordIndex, wordIndex + token));
                wordIndex += token;
            }
        }

        // Correct final check:
        // We must have produced exactly one capture per pattern element
        if (result.length !== pattern.length) return null;

        // If words remain unmatched, it's not a full match
        if (wordIndex !== words.length) return null;

        return result;
    }

    ymatch(decompositionVar, inputVarName, outputVarName) {
        const decomposition = decompositionVar ? decompositionVar.value() : [];
        const inputVar = this.mad.lvalue(inputVarName);
        const outputVar = this.mad.lvar(outputVarName);

        const result = this.#matchPattern(decomposition, inputVar);

        if (result) {
            result.forEach((v) => {
                outputVar.appendElement(v);
            });
            return MadInterpreter.TRUE;
        }

        return MadInterpreter.FALSE;
    }


    /*
    TRY                 Whenever YMATCH.(TOP.(ES),INPUT,MTLIST.(TEST)) = 0,Transfer To MATCH
    ;

    ;
    ; If it doesn't match (YMATCH returns 0), goto MATCH to try the next
    ; decomposition rule in the current transformation rule set.
    ;

    ;
    ; The YMATCH function is part of the SLIP system.
    ;
    // Q. Is LSPNTR === LPNTR (SLIP,22) - NO.#

                        ESRDR=SEQRDR.(ES)
                        SEQLR.(ESRDR,ESF)
                        POINT=SEQLR.(ESRDR,ESF)
                        POINTR=LSPNTR.(ESRDR)
                        Whenever ESF = 0
                            NEWBOT.(1,POINTR)
                            TRANS=POINT
                            Transfer To HIT
                        Otherwise
                            Through FNDHIT,FOR I=0,1, I > POINT
    FNDHIT                  TRANS=SEQLR.(ESRDR,ESF)
                            Whenever ESF > 0
                                SEQLR.(ESRDR,ESF)
                                SEQLR.(ESRDR,ESF)
                                TRANS=SEQLR.(ESRDR,ESF)
                                SUBST.(1,POINTR)
                                Transfer To HIT
                            Otherwise
                                SUBST.(POINT+1,POINTR)
                                Transfer To HIT
                            End Conditional
                        End Conditional
    */
    assmbl(sourceVarName, replacementVarName, outputVarName) {
        const sourceVar = this.mad.lvar(sourceVarName);
        const replacementVar = this.mad.lvar(replacementVarName);
        const outputVar = this.mad.lvar(outputVarName);

        for (let i = 0; i < sourceVar.length(); ++i) {
            const cell = sourceVar.at(i);

            // Replace the indices
            if (typeof cell === 'number') {
                // This replacements should be an array-of-arrays, created by ymatch
                // (-1 because the tape scripts have 1-indexed)
                const replaceWith = replacementVar.at(cell - 1);

                if (replaceWith ?? replaceWith instanceof LList) {
                    outputVar.appendElement(replaceWith.value().join(` `));
                } else {
                    outputVar.appendElement('?????');
                }

            } else {
                // assumed literal string
                outputVar.appendElement(cell);
            }
        }
    }

    hash(txt, n) {
        const hashText = txt.toUpperCase();
        const maj = hashText.split('').reduce(function(a, b) {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);

        return maj & ((2 ** n) - 1);
    }

    seqrdr(varname) {
        return new SlipSequencerReader(this.mad.lvar(varname));
    }

}


class LType {
    constructor(scope, name) {
        this.scope = scope;
        this.name = name;
        this.contents = undefined;
    }

    value() {
        return this.contents;
    }

    typename() {
        return '???';
    }

    assign(value) {
        this.contents = value;
        return this;
    }

    dump(marker) {
        if (typeof marker !== typeof undefined) {
            console.log(marker);
        }
        return this.value();
    }
}

class LInteger extends LType {

    typename() {
        return 'int';
    }

}

class LFloat extends LType {

    typename() {
        return 'float';
    }
}

class LString extends LType {

    typename() {
        return 'string';
    }
}

class LWrapper extends LType {
    constructor(scope, name, initialValue) {
        super(scope, name);

        this.contents = initialValue;
    }

    typename() {
        return 'wrapper';
    }

}

class LArray extends LType {
    constructor(scope, name, size) {
        super(scope, name);
        // Note that MAD assumes a 0th element is always present.
        // (handy for us, as JS indexes from 0, but MAD starts at 1)
        this.contents = new Array(size ? size + 1 : 1);
    }

    typename() {
        return 'array';
    }

    at(idx) {
        // TODO: Did MAD have exceptions? If so, we should check range.
        return this.contents[idx];
    }

    atAssign(idx, value) {
        // TODO: Did MAD have exceptions? If so, we should check range.
        this.contents[idx] = value;
    }

    value() {
        return this.contents.map((e) => e.value()).join('');
    }

    dump(marker) {
        if (typeof marker !== typeof undefined) {
            console.log(marker);
        }
        //
        const arrayDump = this.contents.map((v, idx) => {
            const item = `[${idx}] = (${v.typename()}): ${v.dump()}`;
            return item;
        });
        return `<< ${arrayDump.join(' , ')} >>`;
    }
}


class LList extends LType {
    constructor(scope, name) {
        super(scope, name);

        this.contents = [];
    }

    typename() {
        return 'list';
    }

    value() {
        return this.contents;
    }

    dump(marker) {
        if (typeof marker !== typeof undefined) {
            console.log(marker);
        }
        //
        return `<< ${this.contents.map((v)=>`< ${v} >`).join(' , ')} >>`;
    }

    // The LSSCPY function copies the first list in {sourceList} into this target list
    // (according to the annotation in REF:E.SRC(000140))
    // TODO: Check this, as REF:E.SLIP(62L9) suggests
    lsscpy(sourceList) {
        const sourceAsArray = this.scope.lvalue(sourceList);
        const valueOfFirstElement = sourceAsArray[0].value();
        this.contents = JSON.parse(JSON.stringify(valueOfFirstElement));
        return this;
    }

    append(sourceList) {
        const allElements = this.scope.lvalue(sourceList);
        this.contents.push(allElements);
        return this;
    }

    appendElement(sourceElement) {
        if (Array.isArray(sourceElement)) {
            const idx = this.contents.length;
            const elementEntry = mad.declareList(mad.mkArrayVar(this.name, idx));

            sourceElement.forEach((e) => {
                elementEntry.appendElement(e);
            });
            this.contents.push(elementEntry);
            return this;
        }

        if (sourceElement instanceof LList) {
            return this.appendElement(sourceElement.contents);
        }

        this.contents.push(sourceElement);
        return this;
    }

    assign(sourceList) {
        this.contents = [];

        if (Array.isArray(sourceList)) {
            sourceList.forEach((e) => {
                this.appendElement(e);
            });
            return this;
        }

        if (sourceList.typename && sourceList.typename() === 'list') {
            sourceList.contents.forEach((e) => {
                this.appendElement(e);
            });
            return this;
        }

        // TODO: Makes a copy of the sourceList [ TODO: check that it does, I think it's just a ref]
        const allElements = this.scope.lvalue(sourceList);
        this.contents.push(allElements);
        return this;
    }

    top() {
        return this.contents[0];
    }

    bot() {
        return this.contents[this.contents.length - 1];
    }

    // REF:E.FAP(SLIP-core/newtop.mad)
    // REF:E.SLIP(62L9)
    newtop(datum, _unused_params) {
        this.contents.unshift(datum);
        // Return address of new cell
        return new MadAddress(this, {
            cell: 0
        })
    }

    // REF:E.FAP(SLIP-duplicates/put.fap)
    // REF:E.SLIP(62L9)
    newbot(datum, _unused_params) {
        this.contents.push(datum);
        // Return address of new cell
        return new MadAddress(this, {
            cell: this.contents.length - 1
        })
    }

    // REF:E.SLIP(62L11)
    subst(datum, params) {
        let index = params.cell;
        let originalDatum = this.at(index - 1); // -1 for 1-indexed

        this.lvar.replaceAt(index, datum);

        return originalDatum;
    }

    many() {
        // TODO: call newbot on every argument
    }

    at(idx) {
        if (idx < 0 || idx >= this.contents.length) {
            mad.error(`Attemping to access at(${idx} of ${this.name})`);
        }
        return this.contents[idx];
    }

    length() {
        return this.contents.length;
    }

    pop(items = 0) {
        if (items === 0) {
            const poppedElement = this.contents.shift();
            return poppedElement;
        }
        // If the caller specifies a number of items, we return
        // then all as an array
        let poppedList = [];
        for (let i = 0; i < items; ++i) {
            poppedList.push(pop());
        }
        return poppedList;
    }

    truncateFrom(idx) {
        this.contents.splice(idx);
    }

    tread(tape_unit) {
        const inputLine = this.scope.operatingSystem.getInput(tape_unit);
        const inputAsList = inputLine.toUpperCase().split(' ');
        this.contents = inputLine ? inputAsList : []; // ensures an empty line is an empty array, and not an array of one element (which is the empty line)
    }

    mtlist() {
        this.contents = [];
    }

    listmt() {
        return this.contents.length == 0 ? true : false;
    }

    nodlst() {
        // TODO: Remove the description list
        // (used in Eliza, but can't currently see what difference is caused)
    }

    // synonyms
    mt() {
        return this.mtlist();
    }
    lempty() {
        return this.listmt();
    }
    copy(sourceList) {
        return this.lsscpy(sourceList);
    }

}


// Sequencer reader mechanism for linear lists
// REF:E.SLIP(62L15)
class SlipSequencerReader {
    IDTYPE = { // describes second word, of original SLIP storage cell
        DATUM_IS_NOT_LIST_NAME: 0,
        DATUM_IS_LIST_NAME: 1,
        WORD_PAIR_IS_HEADER_OF_LIST: 2,
        WORD_PAIR_IS_READER: 3
    }

    constructor(lvar) {
        this.lvar = lvar;
        this.lvalue = lvar.value();

        // We need to Eliza.start from -1, which is our fake 'header' node
        // This ensure that loops (like 'Whenever SF > 0, Transfer To NOTYET')
        // can work, and not exit.
        this.indexFrom = -1;

        // TODO: Current implementation ignores sublists (i.e. "structure mode")
        // so future implementations may need a reading heirarchy here
    }

    // List name
    // REF:E.SLIP(62L26)
    lstnam() {
        return this.lvar.name;
    }

    // REF:E.SLIP(62L16)
    // Rewind pointer to previous entry
    seqll() {
        let ch = this.lvalue.at(this.indexFrom);
        this.indexFrom--;
        return ch;
    }

    // REF:E.SLIP(62L16)
    seqlr() {
        this.indexFrom++;
        let ch = this.lvalue.at(this.indexFrom);
        return ch;
    }

    // return address of the cell currently pointed to
    lspntr() {
        return new MadAddress(this.lvar, {
            cell: this.indexFrom
        });
    }

    f() { // aka FLAG aka EOF
        // return -1 if the cell contains a list name
        // (which it does when pointing to the list header)
        if (this.indexFrom === -1) {
            return -1;
        }
        // REF:E.SLIP(62L16)
        return this.indexFrom >= this.lvalue.length ? 1 : 0;
    }
}


class MadAddress {
    constructor(lvar, params) {
        this.lvar = lvar;
        this.params = params;
    }

    // REF:E.SLIP(62L9)
    newtop(datum) {
        return this.lvar.newtop(datum, this.params);
    }

    // REF:E.SLIP(62L9)
    newbot(datum) {
        return this.lvar.newbot(datum, this.params);
    }

    // REF:E.SLIP(62L11)
    subst(datum) {
        return this.lvar.subst(datum, this.params);
    }

}


// Q. to class? so mad = new MadSlip(codeSetup, codeState)
// i.e. new MadSlip(eliza class/object, gEliza)
class MadInterpreter {

    static TRUE = 1
    static FALSE = 0

    static MODE = {
        INTEGER: 10,
        BOOLEAN: 11,
        STATEMENT_LABEL: 12,
        FUNCTION_NAME: 13,
        FLOATING_POINT: 14,
        // or MODE NUMBER n (0-7),
    }

    constructor(operatingSystem) {
        // OS vars
        this.operatingSystem = operatingSystem;

        // MAD state variables
        this.mode = 0;
        this.varList = new Map();
        this.execList = new Map();
        this.nextLabel = undefined;
        this.slip = new Slip(this);

        this.initializeLanguage();
    }

    // NOTE: Remember to bind to a MADslip object before calling these methods
    _scope = {
        operatingSystem: operatingSystem,

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
        return `${varName}[${idx}]`;
    }

    // TODO: Err/exception on re-declare?
    declareList(varName) {
        const uvn = varName.toLowerCase();
        const lvar = new LList(this._scope, uvn);
        this.varList.set(uvn, lvar)
        return lvar;
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
        const sourceContents = this.operatingSystem.readFile(`tape.${sourceFilename}`);
        const sourceList = lisp.parseList(sourceContents);

        this._scope.lassign(targetList, sourceList);
    }

    isFileOpen(fn) {
        return this.openFileStream ? true : false
    }
    openFile(filename) {
        const sourceContents = this.operatingSystem.readFile(filename);

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
        if (settings.traceComments) {
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
        if (settings.traceDebug) {
            this.writeOutput(msg);
        }

    }

    // All output via these methods, please!
    writeOutput(msg) {
        this.operatingSystem.output(msg);
    }

    writeError(msg) {
        this.operatingSystem.error(msg);
    }

}



/*
            EXTERNAL FUNCTION (KEY,MYTRAN)
            NORMAL MODE IS INTEGER
            ENTRY TO CHANGE.
            LIST.(INPUT)
            Vector Values G(1)="TYPE","SUBST","APPEND","ADD","START","RANK","DISPLA"
            Vector Values SNUMB = " I3 *"
            FIT=0
CHANGE      PRINT COMMENT "PLEASE INSTRUCT ME"
            LISTRD.(MTLIST.(INPUT),0)
            JOB=POPTOP.(INPUT)
            Through IDENT, FOR J=1,1, J> 7
IDENT       Whenever G(J) = JOB, Transfer To THEMA
            PRINT COMMENT "CHANGE NOT RECOGNIZED"
            Transfer To CHANGE
THEMA       Whenever J = 5, Function Return IRALST.(INPUT)
            Whenever J = 7
                Through DISPLA, FOR I=0,1, I  > 32
                Whenever LISTMT.(KEY(I)) = 0, Transfer To DISPLA
                S=SEQRDR.(KEY(I))
READ(7)         NEXT=SEQLR.(S,F)
                Whenever F > 0, Transfer To DISPLA
                PRINT COMMENT "*"
                TPRINT.(NEXT,0)
                PRINT FORMAT SNUMB,I
                PRINT COMENT " "
                Transfer To READ(7)
DISPLA          CONTINUE
                PRINT COMMENT " "
                PRINT COMMENT "MEMORY LIST FOLLOWS"
                PRINT COMMENT " "
                Through MEMLIST, FOR I=1 , 1, I > 4
MEMLST          TXTPRT.(MYTRAN(I),0)
                Transfer To CHANGE
            End Conditional
            THEME=POPTOP.(INPUT)
            SUBJECT=KEY(HASH.(THEME,5))
            S=SEQRDR.(SUBJECT)
LOOK        TERM=SEQLR.(S,F)
            Whenever F > 0, Transfer To FAIL
            Whenever TOP.(TERM) = THEME, Transfer To FOUND
            Transfer To LOOK
FOUND       Transfer To DELTA(J)
DELTA(1)    TPRINT.(TERM,0)
            Transfer To CHANGE
FAIL        PRINT COMMENT "LIST NOT FOUND"
            Transfer To CHANGE
DELTA(2)    S=SEQRDR.(TERM)
            OLD=POPTOP.(INPUT)
READ(1)     OBJCT=SEQLR.(S,F)
            Whenever F > 0, Transfer To FAIL
            Whenever F <> 0, Transfer To READ(1)
            INSIDE=SEQRDR.(OBJECT)
READ(2)     IT=SEQLR.(INSIDE,F)
            Whenever F > 0, Transfer To READ(1)
            SIT=SEQRDR.(IT)
            SOLD=SEQRDR.(OLD)
ITOLD       TOLD=SEQLR.(SOLD,FOLD)
            DIT=SEQLR.(SIT,FIT)
            Whenever TOLD = DIT AND FOLD <= 0,Transfer To ITOLD
            Whenever FOLD > 0, Transfer To OK(J)
            Transfer To READ(2)
OK(2)       SUBST.(POPTOP.(INPUT),LSPNTR.(INSIDE))
            Transfer To CHANGE
OK(3)       NEWBOT.(POPTOP.(INPUT),OBJCT)
            Transfer To CHANGE
DELTA(3)    Transfer To DELTA(2)
DELTA(4)    Whenever NAMTST.(BOT.(TERM)) = 0
                BOTTOM=POPBOT.(TERM)
                NEWBOT.(POPTOP.(INPUT),TERM)
                NEWBOT.(BOTTOM,TERM)
            Otherwise
                NEWBOT.(POPTOP.(INPUT),TERM)
            End Conditional
            Transfer To CHANGE
DELTA(6)    S=SEQRDR.(TERM)
READ(6)     OBJCT=SEQLR.(S,F)
            Whenever F > 0, Transfer To FAIL
            Whenever F <> 0, Transfer To READ(6)
            OBJCT=SEQLL.(S,F)
            Whenever LNKLL.(OBJECT) = 0
                SUBST.(POPTOP.(INPUT),LSPNTR.(S))
            Otherwise
                NEWTOP.(POPTOP.(INPUT),LSPNTR.(S))
            End Conditional
            Transfer To CHANGE
            End Function

           R* * * * * * * * * * END OF MODIFICATION ROUTINE

        TPRIN
            EXTERNAL FUNCTION (LST)
            NORMAL MODE IS INTEGER
            ENTRY TO TPRINT.
            SA=SEQRDR.(LST)
            LIST.(OUT)
READ        NEXT=SEQLR.(SA,FA)
            Whenever FA > 0, Transfer To P
            Whenever FA = 0, Transfer To B
            POINT=NEWBOT.(NEXT,OUT)
            Whenever SA < 0, MRKNEG.(POINT)
            Transfer To READ
B           TXTPRT.(OUT,0)
            SEQLL.(SA,FA)
MORE        NEXT=SEQLR.(SA,FA)
            Whenever TOP.(NEXT) = "="
                TXTPRT.(NEXT,0)
                Transfer To MORE
            End Conditional
            Whenever FA > 0, Transfer To DONE
            PRINT COMMENT " "
            SB=SEQRDR.(NEXT)
MEHR        TERM=SEQLR.(SB,FB)
            Whenever FB <0
                PRINT ON LINE FORMAT NUMBER, TERM
                Vector Values NUMBER = "I3 *"
                Transfer To MEHR
            End Conditional
            Whenever FB > 0, Transfer To MORE
            TXTPRT.(TERM,0)
            Transfer To MEHR
P           TXTPRT.(OUT,0)
DONE        IRALST.(OUT)
            Function Return
            End Function

        LPRIN
            EXTERNAL FUNCTION (LST,TAPE)
            NORMAL MODE IS INTEGER
            ENTRY TO LPRINT.
            BLANK = "      "
            EXECUTE PLACE.(TAPE,0)
            LEFTP = 606074606060K
            RIGHTP= 606034606060K
            BOTH  = 607460603460K
            EXECUTE NEWTOP.(SEQRDR.(LST),LIST.(STACK))
            S=POPTOP.(STACK)
BEGIN       EXECUTE PLACE.(LEFTP,1)
NEXT        WORD=SEQLR.(S,FLAG)
            Whenever FLAG < 0
            EXECUTE PLACE.(WORD,1)
            Whenever S > 0, PLACE.(BLANK,1)
            Transfer To NEXT
            OR Whenever FLAG > 0
            EXECUTE PLACE.(RIGHTP,1)
            Whenever LISTMT.(STACK) = 0, Transfer To DONE
            S=POPTOP.(STACK)
            Transfer To NEXT
            OTHERWISE
            Whenever LISTMT.(WORD) = 0
            EXECUTE PLACE.(BOTH,1)
            Transfer To NEXT
            OTHERWISE
            EXECUTE NEWTOP.(S,STACK)
            S=SEQRDR.(WORD)
            Transfer To BEGIN
            End Conditional
            End Conditional
DONE        EXECUTE PLACE.(0,-1)
            EXECUTE IRALST.(STACK)
            FUNCTION RETURN LST
            END OF FUNCTION
*/


/*
;
; Copy all 6-character chunks of the candidate keyword to the FIRST array.
;
; [As the loop termination condition is I .G. 100 (000070), this code will
; write past the end of the FIRST array if the keyword is longer than 36
; characters (because the first 36 characters will be copied to
; FIRST(0) .. FIRST(5), and any further characters will be written to
; machine words past FIRST(5)).]
;

ONE         Whenever READER > 0, Transfer To ENDONE
ENDONE      SEQLL.(S,F)
            Through TWO, FOR J=0,1, J > 100
            SECOND(J)=SEQLR.(S,F)
TWO         Whenever S > 0, Transfer To ENDTWO

;
; Copy all 6-character chunks of the user input word to the SECOND array.
; [May write past the end of SECOND.]
;

ENDTWO      Whenever I <> J, Function Return 0
;
; If the keyword in FIRST has a different number of 6-character chunks to
; the word in SECOND the two words cannot be the same, so return the value 0,
; signifying no match.
;
; W'R is an abbreviation of WHENEVER
; .NE. means not equal
; F'N is an abbreviation of FUNCTION RETURN
;
            Through LOOK, FOR K=0,1, K> J

LOOK        Whenever FIRST(K) <> SECOND(K), Function Return 0
;
; Compare each 6-character chunk of the keyword with the corresponding chunk
; of the user input word. If any are different, return 0, signifying no match.
;
            EQL=SEQLR.(READER,FR)
            Whenever EQL <> "="
            SEQLL.(READER,FR)
            Function Return READER
            Otherwise
;
; At this point we know that the keyword matches the user's word.
; Check whether the transformation rules specify a simple word substitution,
; signified by the presence of an "=".
;
; If it is not an "=", reposition the reader back before the element and
; return the reader, signifying a successful match.
;
            POINT=LNKL.(STORE)
            Through DELETE , FOR K=0,1, K > J
            REMOVE.(LSPNTR.(STORE))
DELETE      SEQLR.(STORE,F)
INSRT       NEW=SEQLR.(READER,FR)
            POINT=NEWTOP.(NEW,POINT)
            MRKNEG.(POINT)
            Whenever READER < 0, Transfer To INSRT
            MRKPOS.(POINT)
            Function Return READER
            End Conditional
            End Function
;
; An "=" was present in the transformation rule. E.g. a script
; transformation rule may begin
;
;           (YOUR = MY
;               ((0 MY 0)
;                   (WHY ARE YOU CONCERNED OVER MY 3)
;                   (WHAT ABOUT YOUR OWN 3)
;                   :
;
; Say at this point the keyword YOUR has been found in the user's input text
; and we know that in the transformation rule the keyword (YOUR) is followed
; by an "=". So we're now going to replace the YOUR in the input text with
; the word following the "=" in the transformation rule (MY, in this case).
;
; First delete all the 6-character chunks that comprise this word, then
; insert all the 6-character chunks that comprise the replacement word.
;
; Finally, return the reader, signifying a successful match.
;
        DOCBC
            EXTERNAL FUNCTION (A,B)
            NORMAL MODE IS INTEGER
            ENTRY TO FRBCD.
            Whenever LNKL.(A) = 0, Transfer To NUMBER
            B=A
            Function Return 0
NUMBER      K=A*262144
            B=BCDIT.(K)
            Function Return 0

            End Function

;
; ELIZA entry point.
;
*/
class Eliza {

    static initialize(mad) {
        /*
                ELIZA
                    NORMAL MODE IS INTEGER
                    DIMENSION KEY(32),MYTRAN(4)
        ;
        ; KEY     - A hashmap used to record keywords.
        ;           KEY(0)..KEY(31)  is the keyword->transformation rule hashmap
        ;           KEY(32)          is the "NONE" transformation rule
        ;
        ; MYTRAN  - A hashmap used to record the MEMORY rules.
        ;           MYTRAN(1)..MYTRAN(4) contain the four MEMORY rules.
        ;
        ; A note on MAD arrays: DIMENSION D(N) allocates N+1 machine-words of
        ; core memory, which are accessed using indexes 0..N.
        ;
        */
        mad.exec('NORMAL MODE IS', MadInterpreter.MODE.INTEGER);

        mad.comment('R CHANGE MADE DEC 2024 TO SATISFY COMMON AREA REQS');
        mad.exec('PROGRAM', 'COMMON AVSL,W');
        mad.exec('DIMENSION', 'W(100)');
        mad.comment('R END OF CHANGE ')

        mad.exec('DIMENSION', 'KEY(32),MYTRAN(4)');

        /*
    INITAS.(0)
;
; INITAS must be the first executable statement in any program using SLIP.
; Its purpose is to create the List of Available Space from all unused
; core memory. It does not require an argument, but here is given 0.
;

            PRINT COMMENT "WHICH SCRIPT DO YOU WISH TO PLAY"
            READ FORMAT SNUMB,SCRIPT
;
; Display the message "WHICH SCRIPT DO YOU WISH TO PLAY".
;
; Note that the IBM 7090/7094 character set doesn't include a question
; mark glyph. Also $ is used to delimit character strings.
;
; SNUMB is the FORTRAN format string " I3 *", defined previously, which
; expects the user to enter up to 3 decimal digits. This number is assigned
; to the variable SCRIPT and will be used as the tape drive unit number
; where the ELIZA script is expected to reside.
;
*/
        mad.exec('PRINT COMMENT', 'WHICH SCRIPT DO YOU WISH TO PLAY');
        // About the formats:
        // https://pages.mtu.edu/~shene/COURSES/cs201/NOTES/chap05/format.html
        mad.exec('READ FORMAT', 'SNUMB,SCRIPT');

        /*
                    LIST.(TEST)
                    LIST.(INPUT)
                    LIST.(OUTPUT)
                    LIST.(JUNK)

        ;
        ; Initialise four lists. These are:
        ; TEST    - Used to store the parts of the user's text matching a
        ;           decomposition rule.
        ; INPUT   - During ELIZA Eliza.startup the selected script is read into this list,
        ;           one round-bracketed list at a time.
        ;           During the conversation phase the text entered by the user is
        ;           read into this list.
        ; OUTPUT  - ELIZA's response sentence is constructed in this list.
        ; JUNK    - A list used for temporary storage for several different purposes.
        ;
        */

        // REF:E.SRC(000080)
        mad.declareList('TEST');
        mad.declareList('INPUT');
        mad.declareList('OUTPUT');
        mad.declareList('JUNK');


        /*
                    LIMIT=1
        ;
        ; When Weizenbaum talks in the January 1966 CACM paper of a "certain counting
        ; mechanism", it is this to which he is referring. LIMIT has the value 1..4,
        ; in order, and then reEliza.starts at 1. The value changes to the next in the
        ; sequence at each user input. More on LIMIT below.
        ;
        */
        mad.lassign('LIMIT', 1);

        /*
                    LSSCPY.(THREAD.(INPUT,SCRIPT),JUNK)
                    MTLIST.(INPUT)
        ;
        ; The THREAD function reads text from the tape unit specified by the integer
        ; SCRIPT into the INPUT list. The LSSCPY function copies the first list in
        ; that INPUT to the list named JUNK.
        ;
        ; The first list in an ELIZA script must be the hello message, e.g.
        ; (HOW DO YOU DO.  PLEASE TELL ME YOUR PROBLEM).)
        ;
        */
        // The nesting of:
        //             LSSCPY.(THREAD.(INPUT,SCRIPT),JUNK)
        // is:
        //                     THREAD.(INPUT,SCRIPT)
        //             LSSCPY.(  "       "     "   ",JUNK)

        // QQQ. This appears to claim that the whole script is loaded into INPUT, and the first
        // list written to JUNK. Yet, later we re-load SCRIPT line-by-line.
        // Plus, JUNK is never written between here and there. So what am I missing???
        // Q. Is this part of the reader?
        mad.threadReadText('input', mad.lvalue('SCRIPT'));
        mad.lvar('JUNK').lsscpy('INPUT'); // ????  check I copy, not reference, the other list
        mad.lvar('input').mtlist();

        /*
                    Through MLST, FOR I=1,1, I > 4
        MLST        LIST.(MYTRAN(I))
        ;
        ; Initialise each of the four MYTRAN array entries as a new list.
        ;
        ; T'H is an abbreviation for THROUGH
        ; .G. is the Boolean grater than operator
        ;
        ; Set I to 1, if I is greater than 4 stop looping, otherwise execute the code
        ; up to and including the statement labelled MLST. Then add 1 to I and return
        ; to the top of the loop at the point of the test to see if I is greater than
        ; 4 and repeat.
        ;
        ;   for I in 1..4 {
        ;     call function LIST with argument a reference
        ;       to the Ith entry in the MYTRAN array
        ;   }
        ;
        */
        // With Through, we execute a statement block called S. Here, S is the instruction
        // at MLST. So we use this (slightly odd) JS construct to iterate with a local block
        // instead of for
        // Note: the logic used here is 'stop if {this is true}', not themodern 'continue while {this is true}'
        // REF:E.SRC(000150)
        Array.from({
            length: 4
        }, (_, i_less_1) => {
            const i = i_less_1 + 1;
            // REF:E.SRC(000160)
            // LIST.(MYTRAN(I))
            mad.lvar('MYTRAN').atAssign(i, mad.llist(mad.mkArrayVar('MYTRAN', i)));
        });

        /*
                    MINE=0
                    LIST.(MYLIST)
        ;
        ; MINE    - Set to 0 and is never changed. It's referenced once below. ???
        ; MYLIST  - As memories are made using the MYTRAN MEMORY rules they are
        ;           recorded in MYLIST. Here MYLIST is being initialised as a new
        ;           empty list.
        ;
        */
        mad.lassign('MINE', 0);
        mad.declareList('MYLIST');

        /*
                    Through KEYLST, FOR I=0,1, 1 > 32
        KEYLST      LIST.(KEY(I))
        ;
        ; Initialise each of KEY(0) .. KEY(32) array entries as a new list.
        ;   for I in 0..32 {
        ;     call function LIST with argument a reference
        ;       to the Ith entry in the KEY array
        ;   }
        ;
        */
        for (let i = 0; i <= 32; ++i) {
            mad.lvar('KEY').atAssign(i, mad.llist(mad.mkArrayVar('KEY', i)));
        }

        // REF:E.SRC(000240)
        mad.comment("R* * * * * * * * * * READ NEW SCRIPT");

        /*
        BEGIN       MTLIST.(INPUT) ""
                    NODLST.(INPUT)
                    LISTRD.(INPUT,SCRIPT)
        ;
        ; Empty the INPUT list. Remove the description list??? from INPUT (NODLST).
        ; Read the next round-bracket-delimited list from tape unit id SCRIPT.
        ;

        */
        // REF:E.SRC(000250)
        ML_BEGIN:
            while (true) {
                mad.lvar('INPUT').mtlist();
                mad.lvar('INPUT').nodlst();

                mad.lassign('INPUT', mad.readList(mad.lvalue('script')));

                /*
                            Whenever LISTMT.(INPUT) = 0
                                TXTPRT.(JUNK,0)
                                MTLIST.(JUNK)
                                Transfer To START
                            End Conditional


                ;
                ; An empty list signals the end of the ELIZA script. (Which is presumably
                ; why there is () on the last line of the published DOCTOR script.)
                ;
                ;   if INPUT is the empty list {
                ;     (the whole ELIZA script has now been read and processed)
                ;     print the value of JUNK, e.g. "HOW DO YOU DO.  PLEASE TELL ME YOUR PROBLEM"
                ;     clear the JUNK list
                ;     goto the START label
                ;   }
                ;
                */
                if (mad.lvar('INPUT').listmt()) {
                    mad.txtprt('JUNK', 0);
                    mad.lvar('JUNK').mtlist();
                    return mad.transferTo(Eliza.start);
                }
                /*
                            Whenever TOP.(INPUT) = "NONE"
                                NEWTOP.(LSSCPY.(INPUT,LIST.(9)),KEY(32))
                                Transfer To BEGIN
                ;
                ; If this list is the special "NONE" list, just copy it unchanged into KEY(32)
                ; and then goto BEGIN to read the next list in the script.
                */
                if (mad.lvar('INPUT').top() == 'NONE') {
                    // QQQ We are copying the special word 'NONE' as well. Is this right???
                    // key[32] (list) : << < NONE > , < [object Object] > >>
                    mad.lassign(mad.mkArrayVar('KEY', 32), mad.lvalue('INPUT'));
                    continue ML_BEGIN;
                }
                /*
                ;
                ; Recall that the NONE list in the DOCTOR script is:
                ;       (NONE
                ;           ((0)
                ;               (I AM NOT SURE I UNDERSTAND YOU FULLY)
                ;               (PLEASE GO ON)
                ;               (WHAT DOES THAT SUGGEST TO YOU)
                ;               (DO YOU FEEL STRONGLY ABOUT DISCUSSING SUCH THINGS)))
                ;
                /*

                /*
                               OR Whenever TOP.(INPUT) = "MEMORY"
                                POPTOP.(INPUT)
                                MEMORY=POPTOP.(INPUT)
                                Through MEM, FOR I=1,1, I > 4
                MEM             LSSCPY.(POPTOP.(INPUT),MYTRAN(I))
                                Transfer To BEGIN
                */
                if (mad.lvar('INPUT').top() == 'MEMORY') {
                    mad.lvar('INPUT').pop()
                    mad.lassign('MEMORY', mad.lvar('INPUT').pop()); // assign the memory keyword (e.g. "MY") to the MEMORY variable
                    for (let i = 1; i <= 4; ++i) {
                        const nextList = mad.lvar('INPUT').pop();
                        mad.lassign(mad.mkArrayVar('MYTRAN', i), nextList);
                    }
                    continue ML_BEGIN;
                }

                /*
                                ;
                ; Otherwise, if this list is the special "MEMORY" list, process it into the
                ; four MYTRAN lists. Recall that the MEMORY list looks like this and is
                ; required to have exactly four transformation patterns:
                ;       (MEMORY MY
                ;           (0 YOUR 0 = LETS DISCUSS FURTHER WHY YOUR 3)
                ;           (0 YOUR 0 = EARLIER YOU SAID YOUR 3)
                ;           (0 YOUR 0 = BUT YOUR 3)
                ;           (0 YOUR 0 = DOES THAT HAVE ANYTHING TO DO WITH THE FACT THAT YOUR 3))
                ;
                ;   else if the first word in INPUT is "MEMORY" {
                ;     assign the memory keyword (e.g. "MY") to the MEMORY variable
                ;     for I in 1..4 {
                ;       copy the Ith MEMORY pattern/reconstruction to MYTRAN(I)
                ;     }
                ;     goto the BEGIN label (continue reading the ELIZA script)
                ;   }
                ;
                */

                // implicit otherwise
                // REF:E.SRC(000420)

                // This is a deeply nested thing:
                //                                     HASH.(TOP.(INPUT),5)
                const keyword = mad.lvar('input').top();
                const hashed = mad.slip.hash(keyword, 5);

                // AFAICT, the "   " strings are to pad the entries which we don't need/use
                //         LSSCPY.(INPUT,LIST.(9)),KEY(   "     "         ))
                mad.larray(mad.mkArrayVar('KEY', hashed)).append('input');
                //         LSSCPY.(INPUT,LIST.(9))
                // mad.listAppend('input', hashed)
                // NEWBOT.(    "        "         ,   "          "         )

                /*
                               Otherwise
                                NEWBOT.(LSSCPY.(INPUT,LIST.(9)),KEY(HASH.(TOP.(INPUT),5)))
                                Transfer To BEGIN
                            End Conditional
                ;
                ; Otherwise, the first word in the INPUT list is expected to be a keyword.
                ; Insert this keyword into the KEY hashtable, so that
                ;   KEY(HASH(keyword)) -> list of transformation rules for keywords
                ;                         that hash to this entry in KEY (i.e. more than
                ;                         one keyword may hash to the same entry in KEY,
                ;                         so each entry in KEY may have zero, one or many
                ;                         keyword transformation rules associated with it.)
                ;
                ; (1 in column 11 signifies a continuation of the previous line.)
                ;
                ; The HASH function takes a word and a number (N) and returns a deterministic
                ; value between 0 and (2 to the power N)-1, in this case 0..31.
                ;
                ;   else {
                ;     HASH the keyword and append this transformation rule to the
                ;       entry in KEY with that index
                ;     goto the BEGIN label (continue reading the ELIZA script)
                ;   }
                ;
                ; This is the end of the script reading code. When the script has been
                ; read and processed the script reader explicitly jumps to the START label
                ; to begin the user conversation.
                ;
                           R* * * * * * * * * * BEGIN MAJOR LOOP
                */

                // Implicit "Transfer To BEGIN"

            } // ML_BEGIN label

        // Implicitly continue to Eliza.start, although the reader ^^^ does this
        mad.transferTo(Eliza.start);
    }

    /*
    ;
    ; TESTS(CAND, S) return a sequence reader if the keyword matches the user's
    ;                input text, otherwise return 0.
    ;
    ; CAND  is the keyword candidate transformation rule
    ; S     is the sequence reader for the user INPUT text
    ;
    ; This function has 3 tasks
    ;
    ;  1. Test whether the whole candidate keyword matches the whole word
    ;     in the user's input text.
    ;  2. If the words do match, make any keyword substitution specified
    ;     in the candidate transformation rule.
    ;  3. Position the candidate reader past the substitution keyword, if any.
    ;
    ; SLIP packs 6 6-bit characters into each 36-bit IBM 7094 machine word.
    ; If a word has more than 6 characters it is continued into the next SLIP
    ; cell, with the first cell having its sign bit set. ???
    ;
    ; This code abstracts this full-word matching and has the side-effect
    ; of modifying the user's input text with the substitution word, if
    ; specified.
    ;

            TESTS
                EXTERNAL FUNCTION(CAND,S)
                NORMAL MODE IS INTEGER
                DIMENSION FIRST(5),SECOND(5)
                ENTRY TO TESTS.
                STORE=S
                READER=SEQRDR.(CAND)
                Through ONE, FOR I=0,1, I > 100
                FIRST(I)=SEQLR.(READER,FR)
    */
    static fnTests(mad, candidate, s) {
        // TESTS checks that the whole keyword matches the whole user INPUT word.
        // TODO: Properly handle this in a way idiomatic for MAD
        const keyword = candidate[0];
        const userword = s.seqll(); // rolls the pointer back to get the previous input

        s.seqlr(); // restore the ptr

        if (!mad.strEq(keyword, userword)) {
            return MadInterpreter.FALSE;
        }

        const candidateVar = mad.llist(`dummy`).assign(candidate);
        const reader = mad.slip.seqrdr(candidateVar.name);

        reader.seqlr(); // skip keyword

        // It also performs any keyword substitution in the user INPUT. (e.g. (MY = YOUR))
        const eql = reader.seqlr();
        if (eql != '=') {
            reader.seqll();
            return reader;
        }

        const replacement = reader.seqlr();

        let words = s.lvalue;

        // TODO: use std methods to rewrite list references
        for (let i = 0; i < words.length; ++i) {
            if (mad.strEq(words[i], keyword)) {
                mad.traceDebug(`fnTests: replacing [${i}] ${words[i]} with ${replacement}`);

                words[i] = replacement;
            }
        }

        return reader;
    }

    static start(mad) {
        // REF:E.SRC(000470)
        mad.comment('R* * * * * * * * * * BEGIN MAJOR LOOP');

        /*
        START       TREAD.(MTLIST.(INPUT),0)
        ;
        ; Wait for the user to type a sentence and read it into the INPUT list,
        ; which is first cleared. Presumably, tape unit 0 is the console.
        ;
        ; TREAD is the SLIP system text read function.
        ;
        */
        mad.lvar('INPUT').mtlist();
        mad.lvar('INPUT').tread(0);

        mad.transferTo(Eliza.seek_keyword);
    }

    static seek_keyword(mad) {

        /*
                    KEYWRD=0
                    PREDNC=0
        ;
        ; KEYWRD  - This will be the keyword found to have the highest precedence.
        ; PREDNC  - The precedence of the keyword. Precedence is specified in the
        ;           ELIZA script. E.g. (DREAMS = DREAM 3 (=DREAM)), the keyword
        ;           DREAMS is given the precedence value 3.
        ;
        */
        mad.lassign('KEYWRD', 0);
        mad.lassign('PREDNC', 0);
        /*
                    LIMIT=LIMIT+1
                    Whenever LIMIT = 5, LIMIT=1
        */
        let limit = mad.lvalue('LIMIT');
        if (++limit == 5) {
            limit = 1;
        }
        mad.lassign('LIMIT', limit);

        /*
        ;
        ; Increment the value of LIMIT. If it then equals 5, set it back to 1.
        ; If we just read the very first user input, LIMIT will now have the value 2.
        ;
                    Whenever LISTMT.(INPUT) = 0, Transfer To ENDPLA
        */
        if (mad.lvar('input').listmt()) {
            return mad.transferTo(Eliza.endpla);
        }
        /*
        ;
        ; If the user input is a blank line, goto the ENDPLA label.
        ; A blank user input tells ELIZA the conversation is over.
        ;
                    IT=0
        */
        mad.lassign('IT', 0);
        /*
        ;
        ; IT      - On exit from the scanning loop IT will either be the sequence
        ;           reader for the selected transformation rule, or it will be 0
        ;           indicating that no keyword was detected in the user's INPUT.
        ;
                    Whenever TOP.(INPUT) = "+"
                        CHANGE.(KEY,MYTRAN)
                        Transfer To START
                    End Conditional

        ;
        ; If first word of the user input is a "+" character, call the CHANGE
        ; function defined higher up in this code. This function allows the user
        ; to modify the current ELIZA script with the commands TYPE, SUBST,
        ; APPEND, ADD, START, RANK and DISPLA.
        ; After making any changes, return to the START label and carry on the
        ; conversation.
        ;
        */
        if (mad.lvar('INPUT').top() === '+') {
            mad.error('INPUT starting with + is not currently supported');
            // CHANGE.(KEY,MYTRAN)
            // REF:E.SRC(000560)
            return mad.transferTo(Eliza.start);
        }
        /*
                    Whenever TOP.(INPUT) = "*", Transfer To NEWLST
        ;
        ; If first word of the user input is a "*" character, goto the NEWLST label.
        ; NEWLST is defined later in this code. It inserts a new transformation rule,
        ; which the user will have given after the "*", into the current in-memory
        ; script and then returns to the START label to carry on the conversation.
        ;
        */
        if (mad.lvar('INPUT').top() === '*') {
            return mad.transferTo(Eliza.newlst);
        }

        /*
        S=SEQRDR.(INPUT)
        REF:E.SRC(000600)

        Create the Slip sequence reader, S, for the user's INPUT list.
        */
        const s = mad.slip.seqrdr('INPUT');

        // Our handlers to avoid GOTO
        const ML_ENDTXT = 'ML_ENDTXT';
        const ML_KEYFND = 'ML_KEYFND';
        let localTransferTo = undefined;

        ML_NOTYET:
            while (!localTransferTo) {

                /*
                NOTYET      Whenever S < 0
                                SEQLR.(S,F)
                                Transfer To NOTYET
                */
                // SEQLR etc can be found in eliza-ctss/eliza/src/SLIP/SLIP-duplicates/seq.fap
                // SEQLR.(READER,FLAG)
                // F is set to 1 (or, specifically, > 0) when there is no more input

                // ??? This is a guess!
                // Below it reads:
                // ; In this case WORD=SEQLR.(S,F) is assigning the first six characters of
                // ; the next word in the user's INPUT text to the integer variable WORD.
                // So this version, without WORD= would be discarding the first six characters
                // But why?

                // SEQLR
                // TODO???
                // while (s.seqlr() === ' ') {
                //     s.lvar.pop();
                // }
                // QQQ??? Trick to know - what's SEQLR etc? Do we stop at 6? If so, what delimiter is used? "BUT HE" would not give WORD
                // as "BUT", unless we stop at space.
                // if (s.length < )
                /*
                ;
                ; ???
                ;
                            Otherwise
                                WORD=SEQLR.(S,F)
                                Whenever WORD = "." OR WORD = "," OR WORD = "BUT"
                                    Whenever IT = 0
                                        NULSTL.(INPUT,LSPNTR.(S),JUNK)
                                        MTLIST.(JUNK)
                                        Transfer To NOTYET
                                    Otherwise
                                        NULSTR.(INPUT,LSPNTR.(S),JUNK)
                                        MTLIST.(JUNK)
                                        Transfer To ENDTXT
                                    End Conditional
                                    End Conditional
                                End Conditional
                ;
                ; Set the variable WORD to the next word in the user's INPUT list. Then
                ; test that word to see if it's a delimiter.
                */
                const delimiters = [' ', '.', ',', 'but'];
                const word = s.seqlr();

                if (delimiters.includes(word)) {
                    if (mad.lvalue('IT') === 0) {
                        // no keywords in list
                        // (NULSTL is only used here, so inline the methods, specifically for this)
                        // Official: discard all words in INPUT to the left of, and including, this delimiter

                        // 1. Where is the delim? (mimic LSPNTR)
                        const deleteNEntries = s.indexFrom + 1;

                        // 2. Remove N items from INPUT
                        const removed = mad.lvar('INPUT').pop(deleteNEntries);

                        // 3. (Presumably) write these N items into JUNK var
                        // (but we clear it immediately afterwards, so ignore for now)
                        // TODO: Re-instate it?

                        // Then clear the thing we didn't fill!
                        mad.lvar('JUNK').mtlist();
                        continue ML_NOTYET;
                    } else {
                        // discard all words in INPUT to the right of, and including, this delimiter
                        // (NULSTR also only used once)

                        // 1. Where is the delim? (mimic LSPNTR)
                        const removeFromIndex = s.indexFrom;

                        // 2. Remove N items from INPUT
                        const removed = mad.lvar('INPUT').truncateFrom(removeFromIndex);

                        // 3. Ignore the writing to JUNK

                        // Clear JUNK
                        mad.lvar('JUNK').mtlist();
                        // ML_ENDTXT, because scanning of the user INPUT is now complete
                        localTransferTo = ML_ENDTXT;
                        break;
                    }
                }


                /*
                ;
                ; Note that in Weizenbaum's 1966 CACM paper, only comma and period were
                ; listed as delimiters. And yet the example conversation given in that
                ; paper could not be reproduced unless BUT is also a delimiter.
                ;
                ; Note that WORD is a 36-bit integer. Weizenbaum developed ELIZA between
                ; 1964 and 1966 on an IBM 7094, which has a 36-bit word and uses a 6-bit
                ; character encoding. Characters were packed 6 to a word. In Slip, character
                ; strings longer than six characters are stored in successive list cells.
                ; In this case WORD=SEQLR.(S,F) is assigning the first six characters of
                ; the next word in the user's INPUT text to the integer variable WORD.
                ; If the word had fewer than six characters they would be left justified
                ; with space characters padding to the right.
                ;
                ;
                ;   else {
                ;     if WORD is one of the delimiters ".", "," or "BUT" {
                ;       if we have found no keywords in the INPUT so far (IT .E. 0) {
                ;         discard all words in INPUT to the left of, and including, this
                ;           delimiter
                ;         goto NOTYET and continue scanning the rest of the user INPUT
                ;           for keywords
                ;       }
                ;       else {
                ;         discard all words in INPUT to the right of, and including, this
                ;           delimiter
                ;         goto ENDTXT; scanning of the user INPUT is now complete
                ;       }
                ;     }
                ;   }
                ;
                */



                /*
                                Whenever F > 0, Transfer To ENDTXT
                */
                if (s.f() > 0) {
                    localTransferTo = ML_KEYFND;

                    return mad.transferTo(Eliza.endtxt)
                }
                /*
                ;
                ; If there were no more words to read in the user INPUT list, goto the
                ; ENDTXT label; scanning of the user INPUT is now complete.
                ; (F will be 1 when the sequence reader has traversed the whole INPUT
                ; list and is back at the list header.)
                ;
                                I=HASH.(WORD,5)
                                SCANER=SEQRDR.(KEY(I))
                                SF=0
                                Through SEARCH, FOR J=0,0, SF > 0
                                CAND= SEQLR.(SCANRE,SF)
                                Whenever SF > 0, Transfer To NOTYET
                SEARCH          Whenever TOP.(CAND) = WORD, Transfer To KEYFND
                */
                const i = mad.slip.hash(word, 5);
                const scanner = mad.slip.seqrdr(mad.mkArrayVar('KEY', i));

                let candidate; // possible rule set (d&r)
                let sf = 0;
                for (; sf <= 0;) {
                    candidate = scanner.seqlr();
                    sf = scanner.f();
                    if (sf > 0) {
                        continue ML_NOTYET;
                    }
                    // Since candidate is an array, we can't use top() here
                    if (mad.strEq(candidate[0], word)) {
                        localTransferTo = ML_KEYFND;
                        break;
                    }
                }

                /*
                ;
                ; Is WORD a keyword? Try to locate it in the KEY hashmap.
                ;
                ; Recall that more than one keyword may hash to the same entry in KEY,
                ; so each entry in KEY is a list that may have zero, one or many keyword
                ; transformation rules associated with it. We need to look through this
                ; list to see if it contains a keyword that exactly matches WORD.
                ;
                ;   HASH the WORD to get the index I in the KEY table where this word
                ;     would have been stored, if it is a keyword
                ;   loop {
                ;     try to read the next candidate list from the hashmap entry KEY(I)
                ;     if there isn't another candidate list {
                ;       WORD didn't match any entries so it's not a keyword
                ;       goto NOTYET to continue scanning the user's input text
                ;     }
                ;     if WORD is the same as the first entry in this candidate list {
                ;       WORD is a keyword and CAND is the transformation rule for
                ;       this keyword, so goto KEYFND
                ;     }
                ;   }
                ;
                KEYFND          READER=TESTS.(CAND, S)
                                Whenever READER = 0, Transfer To NOTYET
                ;
                ; Call the TESTS function, defined higher up in this code.
                ;
                ; TESTS checks that the whole keyword matches the whole user INPUT word. It
                ; also performs any keyword substitution in the user INPUT. (e.g. (MY = YOUR))
                ;
                ; If TESTS returns 0 it means the keyword is not identical to the word in
                ; the user input, so goto NOTYET to continue scanning the user INPUT.
                ;
                ; [This suggests that keywords must differ in the first six characters.
                ; (Because TESTS is called only for the first keyword candidate in
                ; the KEY hashmap that matches the first six characters of the user's
                ; input word).]
                ;
                */
                let reader;

                if (localTransferTo == ML_KEYFND) {
                    localTransferTo = undefined; // we hit the GOTO, so clear that state
                    reader = Eliza.fnTests(mad, candidate, s);
                    if (!reader) {
                        // localTransferTo = ML_NOTYET;
                        continue ML_NOTYET;
                    }
                }

                // Whenever LSTNAM.(CAND) <> 0
                // TODO: Is this candidate or reader?!??!
                if (false && candidate.length) {
                    let dl = candidate.lstnam(); // description list, because candidate is a reader
                    ML_SEQ:
                        while (true) {
                            if (s.f() < 0) {
                                // SEQLR.(S,F)
                                s = reader.seqlr();
                                f = reader.f();
                                // Transfer To SEQ
                                // continue ML_SEQ;
                            } else {
                                // NEWTOP.(DL,LSPNTR.(S))
                                const addr = s.lspntr();
                                addr.newtop(dl);
                                break;
                            }
                        }
                }

                // NEXT=SEQLR.(READER,FR)
                // REF:E.SRC(000980)
                const next = reader.seqlr();
                const fr = reader.f();
                mad.lassign('NEXT', next);
                mad.lassign('FR', fr);

                // Whenever FR > 0, Transfer To NOTYET
                // REF:E.SRC(000990)
                if (fr > 0) {
                    continue ML_NOTYET;
                }
                /*
                                Whenever LSTNAM.(CAND) <> 0
                                    DL=LSTNAM.(CAND)
                SEQ                 Whenever S < 0
                                        SEQLR.(S,F)
                                        Transfer To SEQ
                                    Otherwise
                                        NEWTOP.(DL,LSPNTR.(S))
                                    End Conditional
                                Otherwise
                                End Conditional

                                NEXT=SEQLR.(READER,FR)
                                Whenever FR > 0, Transfer To NOTYET
                ;
                ; Read the next element in the rules associated with this keyword.
                ; If we are back at the rules header, the rules list was empty, so goto
                ; NOTYET to continue scanning the user INPUT.
                ;
                */
                if (mad.lvalue('IT') == 0 && mad.lvalue('FR') == 0) {
                    ML_PLCKEY: mad.lassign('IT', reader);
                    mad.lassign('KEYWRD', word);
                }

                /*
                                Whenever IT = 0 AND FR = 0
                PLCKEY              IT=READER
                                    KEYWRD=WORD
                ;
                ; 001000 If this is the first keyword we've encountered in the user's INPUT
                ; (IT .E. 0), and the first entry in the associated rules is a list
                ; rather than a value (FR .E. 0)???, i.e. there is no precedence associated
                ; with this keyword, then record the associated rules reader in IT and
                ; the found keyword in KEYWRD. Then goto NOTYET (001100) to continue
                ; scanning the user's input.
                ;
                */

                // Q. Found a better match?
                // OR Whenever FR < 0 AND NEXT > PREDNC
                // TODO: I can't see a second entry for any keyword, so add something special to test
                else if (mad.lvalue('FR') < 0 && mad.lvalue('NEXT') > mad.lvalue('PREDNC')) {
                    // PREDNC=NEXT
                    mad.lvar('NEXT').assign(mad.lvalue('PREDNC'));
                    // NEXT=SEQLR.(READER,FR)
                    mad.lassign('NEXT', reader.seqlr());
                    mad.lassign('FR', reader.f());

                    //mad.transferTo(plckey)
                    // ...instead, just copy the code here
                    mad.lassign('IT', reader);
                    mad.lassign('KEYWRD', word);

                    continue ML_NOTYET;
                } else {
                    // Otherwise
                    // Transfer To NOTYET
                    continue ML_NOTYET;
                } // end conditional

                if (localTransferTo == ML_ENDTXT) {
                    return mad.transferTo(Eliza.endtxt);
                }

                // Transfer To NOTYET , which is the top of our loop
                mad.comment('R* * * * * * * * * * END OF MAJOR LOOP ');
            } // while we don't have another location to transfer to

        // implicit
        return mad.transferTo(Eliza.endtxt);
    }
    /*
    ;
    ; 001030 Otherwise, if the first entry in the associated rules is a value???
    ; (FR .L. 0), i.e. the precedence of this keyword, and that value is greater
    ; than the precedence of the previously found highest precedence keyword
    ; (NEXT .G. PREDNC), then record the new highest precedence value in PREDNC
    ; and move the rule reader past the precedence value, then goto PLCKEY to
    ; also record the reader in IT and the found keyword in KEYWRD. Finally, goto
    ; NOTYET (001100) to continue scanning the user's input.
    ;
    ; Note that this differs from Weizenbaum's CACM paper, where it says that
    ; keywords of higher precedence are added to the top of a keyword stack and
    ; keywords of lower precedence are added to the bottom of this stack. This
    ; also means this code does not support the "NEWKEY" functionality he
    ; describes.
    ;
    ; [Note that this code implies that keywords in the script should never
    ; specify a precedence value of 0. If they do they would never be used
    ; (because NEXT .G. PREDNC will never be true).]
    ;
    ; 001080 Otherwise, ignore this keyword and return to NOTYET to continue
    ; scanning the user's INPUT.
    ;
    ENDTXT          Whenever IT = 0
                        Whenever LIMIT = 4 AND LISTMT.(MYLIST) <> 0
                            OUT=POPTOP.(MYLIST)
                            TXTPRT.(OUT,0)
                            IRALST.(OUT)
                            Transfer To START
                           Otherwise
                            ES=BOT.(TOP.(KEY(32)))
                            Transfer To TRY
                        End Conditional
    */
    static endtxt(mad) {

        // 001120 If IT is 0 it means we did not find any keywords in the user's
        // input, so we cannot construct a response from the user's input combined
        // with any of the transformation rules in the script.
        if (mad.lvalue('IT') == 0) {
            // ; 001130 This is the mysterious "when a certain counting mechanism is in a
            // ; particular state": recall a memory only if the memory list (MYLIST) isn't
            // ; empty and LIMIT happens to have the value 4.
            if (mad.lvalue('LIMIT') == 4 && !mad.lvar('MYLIST').listmt()) {
                // REF:E.INT(0001)
                // print one of the memories we previously recorded in MYLIST
                const out = mad.lvar('MYLIST').pop();
                mad.lassignList("OUT", out);
                mad.txtprt("OUT", 0);

                // IRALST.(OUT) is an erase list (with some reference counting)
                // REF:E.FAP(SLIP-core/iralst.mad)
                mad.iralst("OUT");
                // Since we never stored the output anywhere else, we can avoid
                // the ref counting in our implementation of iralst.
                return mad.transferTo(Eliza.start);

            } else {
                // ; Instead we do one of two things: either print one of the memories we
                // ; previously recorded in MYLIST, if any, or we use one of the messages
                // ; from the NONE list (which is recorded in KEY(32)).
                // ES=BOT.(TOP.(KEY(32)))
                // REF:E.SRC(001190)
                const es = mad.lvar(mad.mkArrayVar('KEY', 32)).bot();
                mad.lassignList('ES', es);

                return mad.transferTo(Eliza.try_match);
            }

        } else {
            // ; Otherwise, we did find a keyword (IT .E. 0 is false). If the keyword is
            if (mad.lvalue('KEYWRD') == mad.lvalue('MEMORY')) {
                // This selects an arbitrary (but not random) response from
                // the list of 4 memory options
                // I=HASH.(BOT.(INPUT),2)+1
                // REF:E.SRC(001230)
                const i = mad.slip.hash(mad.lvar('INPUT').bot(), 2) + 1;

                // NEWBOT.(  REGEL.(MYTRAN(I),INPUT, LIST.(MINE)  ), MYLIST)

                // MYTRAN is something like (0 YOUR 0 = BUT YOUR 3)
                // INPUT is a phrase beginning "MY" (i.e. the memory word)

                // We expect MY to have become YOUR, so we probably want to
                // grab all the text after YOUR in the input, and everything
                // after = in MYTRAN
                // This is something like ymatch & assmbl, but with REGEL

                // Given the inputs are all equivalent, we can hack a temporary
                // version for now. TODO: Determine what REGEL does, and make
                // this more general.
                const mytran = mad.lvar(mad.mkArrayVar('MYTRAN', i)).value(); // JS array
                const inputText = mad.lvalue('INPUT'); // JS array
                const regelResult = mytran.slice(4) // remove "0 YOUR 0 ="
                    .slice(0, -1) // remove the 3 a the end
                    .concat(
                        inputText.slice(1) // everything after the "MY" initial word (which is now YOUR)
                    );

                // We store the whole text we want output as a memory.
                // No processing is done later on this.
                // (See output routine at REF:E.INT(0001))
                mad.lvar("MYLIST").newbot(regelResult);

                // SEQLL.(IT,FR)
                const it_reader = mad.lvalue('IT');
                it_reader.seqll();
                const fr = it_reader.f();
                mad.lassign('FR', fr);

                // Transfer To MATCH
                return mad.transferTo(Eliza.match);

            } else {
                // Otherwise
                // ; Otherwise, the keyword we found isn't the MEMORY keyword, so just position
                // ; the transformation rule sequence reader past the keyword and fall through
                // ; to the matching code.

                // Prepare to do the reassembly rule, in try()
                // SEQLL.(IT,FR)
                const it_reader = mad.lvalue('IT');
                it_reader.seqll();
                const fr = it_reader.f();
                mad.lassign('FR', fr);
                //
                return mad.transferTo(Eliza.match);
            }

            // Never gets here, because of transferTo above
        }

    }

    // try the next decomposition rule in the current transformation rule set (stored in IT).
    static match(mad) {
        mad.comment('R* * * * * * * * * * MATCHING ROUTINE');

        // MATCH:
        const it_reader = mad.lvalue('IT');
        const es = it_reader.seqlr();
        const fr = it_reader.f();

        // ES=SEQLR.(IT,FR)
        mad.lassignList('ES', es ?? []);
        mad.lassign('FR', fr);

        // Whenever TOP.(ES) = "="
        // (we manually check that the flag hasn't triggered, the original
        // probably returned a list object, allow top() to be called on it)
        if (es && mad.llist('ES').top() == '=') {
            // S=SEQRDR.(ES)
            const s = mad.slip.seqrdr('ES');

            // SEQLR.(S,F)
            // (skips right over the =)
            s.seqlr();
            // WORD=SEQLR.(S,F)
            const word = s.seqlr();
            let f = s.f();

            // I=HASH.(WORD,5)
            const i = mad.slip.hash(word, 5);

            // SCANER=SEQRDR.(KEY(I))
            // (keeping the typo!)
            const scaner = mad.slip.seqrdr(mad.mkArrayVar('KEY', i));
            // ML_SCAN:
            while (true) {
                // ITS=SEQLR.(SCANER,F)
                const its = scaner.seqlr();
                f = scaner.f(); // overwrites above 'f'

                // Whenever F > 0, Transfer To NOMATCH(LIMIT)
                // (since f is a boolean flag, we can change this later to `if(f)`)
                if (f > 0) {
                    const limit = mad.lvalue('LIMIT');
                    return mad.transferTo(Eliza.nomatch, limit);
                }

                // Whenever WORD = TOP.(ITS)
                if (word == its.top()) {
                    // Note that this initialises with a list, not a variable name
                    const s = mad.slip.seqrdr(its.name);
                    // SCANI
                    do {
                        const es = s.seqlr();
                        mad.lassignList('ES', es);

                        f = s.f();
                    } while (f); // Whenever F <> 0, Transfer To SCANI

                    // IT=S
                    mad.lassignList('IT', s);

                    // Transfer To TRY
                    return mad.transferTo(Eliza.try_match);

                } else {
                    // Transfer To SCAN
                    // (which is the top of this loop)
                }
            }
        } // end of `if ES.top='='`


        // Whenever FR > 0, Transfer To NOMATCH(LIMIT)
        if (fr > 0) {
            // limit should be between 1 and 4, since we don't 0-index
            const limit = mad.lvalue('LIMIT');
            return mad.transferTo(Eliza.nomatch, limit);
        }

        // fall through
        return mad.transferTo(Eliza.try_match);
    }




    /*

    ;;; A lot of the core work is done by the complex SLIP matching and
    ;;; rebuilding functions YMATCH and ASSMBL (see the latter at HIT)
    ;;; These are described on pages 62L28-29 of the SLIP manual:
    ;;;    https://drive.google.com/file/d/1XtF7EM1KhwMPKsp5t6F0gwN-8LsNDPOl
    ;
    ; If this keyword is a link to another keyword, switch to that keyword.
    ;
    ; An ELIZA script rule may have the form (HOW (=WHAT)). If the keyword
    ; HOW appears in the user's input and this transformation rule is selected,
    ; ELIZA will use the transformation rule associated with the keyword WHAT
    ; to generate its response.
    ;
    ;   read the next decomposition rule from the selected transformation rule
    ;   if the decomposition rule Eliza.starts with an "=" symbol {
    ;     assign the word after the "=" to WORD
    ;     lookup WORD in the KEY hashmap
    ;     if WORD doesn't exist in the KEY hashmap {
    ;       (presumably this indicates a logical inconsistency in the script)
    ;       goto one of the NOMATCH(1) .. NOMATCH(4) labels to print
    ;         a message such as "HMMM" and back to the main conversation loop
    ;       which NOMATCH label is selected is determined by the value LIMIT
    ;         happens to have at this time
    ;     }
    ;     else {
    ;       position IT at first decomposition rule for the linked keyword
    ;       goto the TRY label to try to apply the decomposition rule
    ;     }
    ;   }
    ;   else if there were no (or no more) decomposition rules (FR .G. 0) {
    ;     (does this indicate an incorrectly formed script?)
    ;     goto one of the NOMATCH(1) .. NOMATCH(4) labels
    ;   }
    ;
    */


    static try_match(mad) {
        // ML_TRY:

        // Clear TEST to hold the decomposed matching parts
        mad.lvar('TEST').mtlist();

        // Attempt to match the current decomposition rule (TOP.(ES)) to the user's INPUT.
        // ymatch = REF:E.SLIP(L28)
        // NOTE: THe docs say success returns 0, the code does not
        // TODO: Can ES ever be empty? (i.e. undefined)
        const pattern = mad.llist('ES').top();
        // This pattern is an LList with the contents of, e.g. [0 YOUR 0 etc]

        if (mad.slip.ymatch(pattern, 'INPUT', 'TEST') === 0) {
            return mad.transferTo(Eliza.match);
        }

        // ; If it does match, the list TEST will contain the decomposed matching parts
        // ; of the INPUT text ready for reassembly. E.g. ???

        const esrdr = mad.slip.seqrdr('ES');
        esrdr.seqlr();
        const point = esrdr.seqlr();
        const esf = esrdr.f();
        const pointr = esrdr.lspntr();

        if (esf === 0) {
            pointr.newbot(1);
            mad.llist('TRANS').assign(point.value());
            return mad.transferTo(Eliza.hit);
        }


        //ML_FINDHIT:
        for (let i = 0; i <= point; ++i) {
            let trans = esrdr.seqlr();
            esf = esrdr.f();
            mad.llist('TRANS').assign(trans);
        }

        if (esf > 0) {
            esrdr.seqlr();
            esrdr.seqlr();

            const trans = esrdr.seqlr();
            mad.llist('TRANS').assign(trans);
            // SUBST.(1,POINTR)
            // REF:E.SRC(001660)
            // By putting a 1 in the ES list (which holds a response) then
            // the reassembler is capable of adding the user input into that
            // response
            pointr.subst(1);

            return mad.transferTo(Eliza.hit);
        }

        pointr.subst(point + 1);

        return mad.transferTo(Eliza.hit);
    }


    static hit(mad) {

        mad.lvar('OUTPUT').mtlist();

        mad.slip.assmbl('TRANS', 'TEST', 'OUTPUT');

        mad.txtprt('OUTPUT', 0);

        return mad.transferTo(Eliza.start);
    }
    /*

                        ;
    ; Select one of the reassembly rules associated with this decomposition rule.
    ;
    ; Reassembly rules are used in turn. This code adds a counter (001560) to
    ; the rules and uses it to record which reassembly rule was used last (001690).
    ; When all reassembly rules have been used (001620) the counter is returned
    ; to 1 (001660) and the first rule is used again.
    ;
    HIT                 TXTPRT.(ASSMBL.(TRANS,TEST,MTLIST.(OUTPUT)),0)  ;; See above, re SLIP functions YMATCH and ASSMBL
                        Transfer To START
                    End Conditional
    */


    static newlst(mad) {
        mad.comment('R* * * * * * * * * * INSERT NEW KEYWORD LIST');

        mad.error('INPUT starting with * is not currently supported')

        // TODO
        // REF:E.SRC(001770)
        return mad.transferTo(Eliza.start);
    }

    /*

    ;
    ; Finally, use the selected reassembly rule (TRANS) and list of decomposition
    ; parts (TEST) to assemble a response (in the list OUTPUT) and print it. Then
    ; goto the START label to await the next user input and continue the
    ; conversation.
    ;
    ; The ASSMBL function is part of the SLIP system.
    ;
    ; The E'L (END OF CONDITIONAL) on line 001750 closes the O'E (OTHERWISE)
    ; on line 001270. ???
    ;
    NEWLST          POPTOP.(INPUT)
                    NEWBOT.(LSSCPY.(INPUT,LIST.(9)),KEY(HASH.(TOP.(INPUT),5)))
                    Transfer To START

                   R* * * * * * * * * * DUMP REVISED SCRIPT
    */
    static endpla(mad) {
        // ENDPLA          PRINT COMMENT "WHAT IS TO BE THE NUMBER OF THE NEW SCRIPT"
        // We don't bother asking to load a new script, or dump the existing one
        mad.exec('print comment', 'Eliza ends...');
    }


    static dump(mad) {
        // TODO
        // REF:E.SRC(001880)
    }

    static write(mad) {
        // TODO
        // REF:E.SRC(001950)
    }


    /*
    ENDPLA          PRINT COMMENT "WHAT IS TO BE THE NUMBER OF THE NEW SCRIPT"
                    READ FORMAT SNUMB,SCRIPT
                    LPRINT.(INPUT,SCRIPT)
                    NEWTOP.(MEMORY,MTLIST.(OUTPUT))
                    NEWTOP.('MEMORY',OUTPUT)
                    Through DUMP, FOR I=1,1 I > 4
    DUMP            NEWBOT.(MYTRAN(I),OUTPUT)
                    LPRINT.(OUTPUT,SCRIPT)
                    MTLIST.(OUTPUT)
                    Through WRITE, FOR I=0,1, I > 32
    POPMOR          Whenever LISTMT.(KEY(I)) = 0, Transfer To WRITE
                    LPRINT.(POPTOP.(KEY(I)),SCRIPT)
                    Transfer To POPMOR
    WRITE           CONTINUE
                    LPRINT.(MTLIST.(INPUT),SCRIPT)
                    EXIT.

                   R* * * * * * * * * * SCRIPT ERROR EXIT
    */

    // NOMATCH(1)
    // REF:E.SRC(002200)
    static nomatch(mad, idx) {
        mad.exec('print comment', ['PLEASE CONTINUE ', 'HMMM ', 'GO ON , PLEASE ', 'I SEE '][idx - 1]);
        mad.transferTo(Eliza.start);
    }
    /*
    NOMATCH(1)      PRINT COMMENT "PLEASE CONTINUE "
                    Transfer To START
    NOMATCH(2)      PRINT COMMENT "HMMM "
                    Transfer To START
    NOMATCH(3)      PRINT COMMENT "GO ON , PLEASE "
                    Transfer To START
    NOMATCH(4)      PRINT COMMENT "I SEE "
                    Transfer To START
                    VECTOR VALUES SNUMB= "I3 * "
                    End of Program
    */
}

const operatingSystem = new OperatingSystem();

if (settings.useInputFile) {
    const testFileContents = fs.readFileSync(settings.useInputFile, 'utf8');
    testFileContents.split('\n').forEach((line) => {
        operatingSystem.addInput(line);
    });
}

const mad = new MadInterpreter(operatingSystem);

mad.transferTo(Eliza.initialize);
while (mad.callNextLabel()) {
    // NOP
}

if (settings.traceRecap) {
    mad.writeOutput(`Eliza Recap:`);

    operatingSystem.historyList.forEach((r) => {
        mad.writeOutput(r);
    });
}
