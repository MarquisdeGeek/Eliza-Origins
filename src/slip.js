const SlipSequenceReader = require('./slip_sequence_reader');
const Types = require('./types');
const LList = Types.LList;


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


    /*
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
    ymatch(decompositionVar, inputVarName, outputVarName) {
        const decomposition = decompositionVar ? decompositionVar.value() : [];
        const inputVar = this.mad.lvalue(inputVarName);
        const outputVar = this.mad.lvar(outputVarName);

        const result = this.#matchPattern(decomposition, inputVar);

        if (result) {
            result.forEach((v) => {
                outputVar.appendElement(v);
            });
            // JS trick to access static members from an instance var
            return this.mad.constructor.TRUE;
        }

        return this.mad.constructor.FALSE;
    }


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
        return new SlipSequenceReader(this.mad.lvar(varname));
    }

}


module.exports = Slip;
