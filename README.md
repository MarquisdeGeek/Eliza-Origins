# About

This is an attempt to recreate the original Eliza project, created by Joseph Weizenbaum, using his original source and contents of the January 1966 CACM paper. The aim is to have a JavaScript equivalent that can run anywhere.

It was first released on 1st January 2026 to celebrate the 60th anniversary of the first chatbot. Or, as I say, 60 years BC (Before ChatGPT!

# Why?

There are several approaches one could have taken. A full interpreter, emulation of the original machine, or this: a line-by-line rewrite of the original. My reasonings were:

1. An interpreter needs a lot of deep knowledge about the three languages used. Any omissions would, potentially, have a knock-on effect requiring a very complete implementation before any results would be visible
1. An emulator already exists (https://github.com/rupertl/eliza-ctss/) and I'd already built the Dockerfile for it, so I consider this a solved problem
1. This would give a native feel on modern machines. An inner loop or edit-change-debug would let anyone step through the code in a language that was less alient to them. I also only needed to implement the methods which the original Eliza used.

So, I chose JavaScript, and set to work...

# Running it

```
npm start
```
And type `100` when asked for `Which script...`

Disclaimer: This is still a work in progress, with lots of responses missing and/or broken.


# The files

* unfold - see how the project unfolded, starting with the original source file, to added comments, to JavaScript
* refs - documents referenced by REF:E below, and in the code
* tapes - the files loaded into Eliza. 100 is DOCTOR


# Help on the Eliza program

Some commentary on the code:


## Dictionary of functions

Name | Meaning | Equivalence
---- | ---- | ---- 
MTLIST.(var) | Empty items from the list | var.clearList() { return this; }
LISTMT.(var) | Is the list empty? | var.isEmpty()
TREAD.(var,n) | Read text from the user. n=unknown=0 | var = prompt()
SEQRDR | Sequencer reader | S=SEQRDR.(INPUT) |     let s = new SlipSequencerReader(mad.lvar("INPUT"));
outvar=POPTOP.(invar) | Remove and return first item from list | outvar = invar.pop()
TOP.(var) | Peek first item in list, without remove it | inputlist.top()
NEWTOP.(datum,var) | Add item to top of list | inputlist.unshift(datum)
NEWBOT.(datum,var) | Add item to bottom of list | inputlist.push(datum)
SEQLL (sequencer reader) | sequence look left => rewind ptr, and return previous entry and set EOF flag (which you must retrieve separately). LL formally means "linear-left" | previous = reader.seqll(); f = reader.f()
SEQLR (sequencer reader) | sequence look right => forward ptr, and return next entry.  LR formally means "linear-right" | next = reader.seqlr(); f = reader.f()
IRALST.(OUT) | Flush text to output stream? |
HASH.(var,n) | Generate a hash from 0 to 2^n-1 | outvalue=hashWith(inword,n) 

## Variable list

Although all variables are global in MAD, we use 'scope' to indicate where, in our interpretation, the variable is (primarily) used.

Name | Scope | Meaning | Comments
---- | ---- | ---- | ---- 
SCRIPT | init | script to load, 100
JUNK | init | temp, holds intro text at start, before being cleared
IT | global | the sequence reader for the selected transformation rule, or it will be 0 meaning no keyword |
S | global | The sequence reader for the user input
INPUT | global | text from user
OUTPUT | hit | Response sentance
KEY | global | 32 lists, each holding a list of keywords. 32nd is special, and holds the default responses and called the "NONE list"
MYTRAN | global | MRU list of things the user says about /nouns
KEYWRD | seek_keyword | This will be the keyword found to have the highest precedence
PREDNC | seek_keyword | precedence of the keyword
ES | try | list of reassembly options | might be initialised to KEY32 (the NONE list) or a more general response list
F | various | flag to indicate if reader is empty (for user input only?)
FR | various | flag to indicate if reader is empty (for rules only?)
MYLIST | global | list of memories given by the user
MEMORY | global | list of 4 possible machine prompts, that utilise users' memories
TEST | try | decomposed matching parts
TRANS | try | reassembly rule


## Some outstanding questions

* REF:E.SRC(001190) - this doesn't appear to re-order the list (it uses top/bot instead of pop/newbot), so how does it produce alternate answers in NONE?
* The purpose of the code 'Whenever LSTNAM.(CAND) <> 0 '
* Correct function of lsscpy
* What is REGEL?
* Why did tape.200 have a bare keyword, START, in it (I removed it in this version)


# Appendices

Some notes on the underlaying languages, needed to follow through the transliteration process.

## MAD language cheat sheet

Mapping between abbreivations, original, and modern statements. More information in REF:E.MAD listed below.

Abbrv | Original | Modern
--|--|--
W'R | Whenever | IF
OR W'R | Or whenever | Else if
O'E | Otherwise | Else
E'L | End of conditional (i.e. Whenever/if)
T'H | Through | FOR
T'O | Transfer to | GOTO (if available)

In the raw code, maths symbols are similarly terse

Abbrv | Modern
--|--
.E. | ==
.G.| >
.L. | <
.N. | neg

## SLIP cheat sheet

This is were the list handling instruction extensions are. See REF:E.SLIP below.

## FORTRAN assembly program - FAP

This is were the optimized methods are. See REF:E.FAP below.


# References

All internal Eliza references begin "REF:E." followed by an ID, and page.

Reference | Local filepath | Description | Param meanings | Source URL
--|----|-----|-----|--
MAD | refs/MAD_Primer.pdf | Modern manual || 
SLIP | refs/SLIPManual.pdf | SLIP manual || https://drive.google.com/file/d/1XtF7EM1KhwMPKsp5t6F0gwN-8LsNDPOl/edit
SRC | unfold/0-eliza.mad | Eliza source code, in MAD-Slip | Line number, at right of text| https://github.com/rupertl/eliza-ctss/blob/main/eliza/src/ELIZA/eliza.mad
T100 | tapes/tape.100 | Tape 100, the DOCTOR script | Line number | https://github.com/rupertl/eliza-ctss/blob/main/eliza/src/ELIZA/tape.100
FAP | refs/FAP-102663110.05.01.acc.pdf | FORTRAN assembly program | relative path, under eliza/src/SLIP | https://github.com/rupertl/eliza-ctss
PAPER | refs/eliza-365153.365168.pdf | The original CACM paper | | https://dl.acm.org/doi/pdf/10.1145/365153.365168

# Deep dives

By way of an example, from MAD:
(line 000940)
```
NEWTOP.(DL,LSPNTR.(S))
```
uses SLIP code, which goes to FAP:
```
NEWTOP CLA*    2,4
       STA     *+1
       CLA    **
       STA     AA 
       STA     AB  
       TRA     START  
```

LPNTR references to sequential readers, whereas LSPNTR applies to advance readers.

# Omissions and fixes

I only worked on the code to get the basics of `tape.100` working, and only with a restricted input.

* Support stdin as source of prompts
* Input starting with * and + changes code dynamically. Possible with interpreted languages MAD and JS
* Ensure all code/comments has line numbers/reference in
* Better clarity in types to determine if var is meant to be a string, int, list, or other
* mkArrayVar is smelly! (and probably unnecessary, outside of testing)

# For fun

Why not rewrite Tape.100 as a series of regexes? e.g.

```
(0 I 0 YOU 0)
```
Could be:
```
^((?:\w+\s+)*)\b(I)\b\s+((?:\w+\s+)*)\b(YOU)\b\s+((?:\w+\s+){2})$

```

# Other links

* https://github.com/jeffshrager/elizagen.org
* https://wg.criticalcodestudies.com/index.php?p=/discussion/108/the-original-eliza-in-mad-slip-2022-code-critique
* https://github.com/rupertl/eliza-ctss/
* https://fosdem.org/2026/schedule/event/eliza_rewriting_the_original_ai_chatbot_from_60_years_bc_before_chatgpt/
