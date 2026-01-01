const MadInterpreter = require('./mad').MadInterpreter;


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

        // We don't really do anything with these instructions, but it makes
        // searching for the 'PROGRAM' start easier
        mad.comment('R CHANGE MADE DEC 2024 TO SATISFY COMMON AREA REQS');
        mad.exec('PROGRAM', 'COMMON AVSL,W');
        mad.exec('DIMENSION', 'W(100)');
        mad.comment('R END OF CHANGE ')

        // Basic declarations
        mad.exec('DIMENSION', 'KEY(32),MYTRAN(4)');
        mad.exec('INITAS', '(0)');

        mad.exec('PRINT COMMENT', 'WHICH SCRIPT DO YOU WISH TO PLAY');
        // About the formats:
        // https://pages.mtu.edu/~shene/COURSES/cs201/NOTES/chap05/format.html
        mad.exec('READ FORMAT', 'SNUMB,SCRIPT');

        /*
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
                //     HASH.(TOP.(INPUT),5)
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

                /*
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
                  REF:E.SRC(000780)
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
                    mad.traceDebug(`fnTests: rule found ${reader.dump()}`);
                }

                // Whenever LSTNAM.(CAND) <> 0
                // REF:E.SRC(000880)
                // TODO: Is this candidate or reader?!??!
                // TODO: Needs more study
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

        // TRY                 Whenever YMATCH.(TOP.(ES),INPUT,MTLIST.(TEST)) = 0,Transfer To MATCH
        // ;
        // ; If it doesn't match (YMATCH returns 0), goto MATCH to try the next
        // ; decomposition rule in the current transformation rule set.
        // ;

        // Clear TEST to hold the decomposed matching parts
        mad.lvar('TEST').mtlist();

        // Attempt to match the current decomposition rule (TOP.(ES)) to the user's INPUT.
        // ymatch = REF:E.SLIP(L28)
        // NOTE: THe docs say success returns 0, the code does not
        // TODO: Can ES ever be empty? (i.e. undefined)
        // This pattern is an LList with the contents of a rule, e.g. [0 YOUR 0 etc]
        const pattern = mad.llist('ES').top();
        
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
    static hit(mad) {

        mad.lvar('OUTPUT').mtlist();

        mad.slip.assmbl('TRANS', 'TEST', 'OUTPUT');

        mad.txtprt('OUTPUT', 0);

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
    static newlst(mad) {
        mad.comment('R* * * * * * * * * * INSERT NEW KEYWORD LIST');

        mad.error('INPUT starting with * is not currently supported')

        // TODO
        // REF:E.SRC(001770)
        return mad.transferTo(Eliza.start);
    }


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

module.exports = Eliza;
