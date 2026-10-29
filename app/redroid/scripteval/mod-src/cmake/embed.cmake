# Converts a file into a C++ header with an unsigned char array.
# usage: cmake -DIN=file -DOUT=header -DNAME=symbol -P embed.cmake
file(READ ${IN} content HEX)
string(LENGTH "${content}" hexlen)
math(EXPR len "${hexlen} / 2")
string(REGEX REPLACE "([0-9a-f][0-9a-f])" "0x\\1," bytes "${content}")
# wrap lines every ~32 bytes to keep compilers happy
string(REGEX REPLACE "((0x[0-9a-f][0-9a-f],){32})" "\\1\n" bytes "${bytes}")
file(WRITE ${OUT} "// generated from ${IN}\n#pragma once\n#include <cstddef>\n")
file(APPEND ${OUT} "static const unsigned char ${NAME}[] = {\n${bytes}0x00};\n")
file(APPEND ${OUT} "static const size_t ${NAME}Len = ${len};\n")
