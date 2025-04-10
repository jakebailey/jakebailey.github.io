#!/usr/bin/env sh

cd $(dirname "$0")/..

out=./assets/css/extended/code.css

light=github
dark=github-dark

echo "/* Generated by codecss.sh */" > $out
echo >> $out

echo ".post-content > .highlight:not(.dark *) {" >> $out
hugo gen chromastyles --style $light >> $out
echo "}" >> $out
echo >> $out

echo "body.dark#top .post-content > .highlight {" >> $out
hugo gen chromastyles --style $dark >> $out
echo "}" >> $out
echo >> $out

dprint fmt $out
