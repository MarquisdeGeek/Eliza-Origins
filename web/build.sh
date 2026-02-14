#!/bin/bash

npx esbuild ./src/index_web.js --bundle --outfile=./dist/index.js --platform=browser
cp src/index.htm dist
cp -a ../tapes dist
