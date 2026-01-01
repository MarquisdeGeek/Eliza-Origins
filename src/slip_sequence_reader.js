const MadAddress = require('./mad_address');


// Sequencer reader mechanism for linear lists
// REF:E.SLIP(62L15)
class SlipSequenceReader {
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

    dump() {
        return this.lvar.dump();
    }
}

module.exports = SlipSequenceReader;
