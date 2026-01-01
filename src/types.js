const MadAddress = require('./mad_address');

// Types of each cell in SLIP. Note the extra (unused) types as I ponder
// the question of "how should I best do this"? Definitely bad cases of
// YAGNI in here!
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
            const elementEntry = this.scope.declareList(this.scope.mkArrayVar(this.name, idx));

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
            console.error(`Attemping to access at(${idx} of ${this.name})`);
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
    mt() { return this.mtlist(); }
    lempty() { return this.listmt(); }
    copy(sourceList) { return this.lsscpy(sourceList); }

}


module.exports = { LArray, LList, LInteger };
