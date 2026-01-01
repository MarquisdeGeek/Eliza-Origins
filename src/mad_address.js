// Used by LSPNTR to get the memory address of specific cells
// Since we don't emulate/simulate the machine to such a degree
// we must wrap all methods that use a pointer, like newtop, with
// a version here.

// Currently, only LLists have this functionality.

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


module.exports = MadAddress;
