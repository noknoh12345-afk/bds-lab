cmake_minimum_required(VERSION 3.21...3.31)

project(scripteval LANGUAGES C CXX ASM)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(SCRIPTEVAL_HOST_TEST "Build for the host (Linux, libc++) to run the mock game tests" OFF)
set(QUICKJS_DIR "" CACHE PATH "Path to a quickjs-ng checkout (downloaded with CPM when empty)")

if(NOT ANDROID AND NOT SCRIPTEVAL_HOST_TEST)
    message(WARNING "Not an Android build. Use the NDK toolchain (see README) or -DSCRIPTEVAL_HOST_TEST=ON")
endif()
if(ANDROID AND NOT CMAKE_ANDROID_ARCH_ABI MATCHES "^(x86_64|arm64-v8a)$")
    message(FATAL_ERROR "Unsupported ABI ${CMAKE_ANDROID_ARCH_ABI} (x86_64 / arm64-v8a only)")
endif()

# ---------------------------------------------------------------------------
# QuickJS-ng (MIT)
# ---------------------------------------------------------------------------
if(QUICKJS_DIR STREQUAL "")
    set(CPM_SOURCE_CACHE ${PROJECT_SOURCE_DIR}/cpm-cache CACHE PATH "")
    include(cmake/CPM.cmake)
    CPMAddPackage(NAME quickjs GITHUB_REPOSITORY quickjs-ng/quickjs GIT_TAG v0.17.0 DOWNLOAD_ONLY YES)
    set(QUICKJS_DIR ${quickjs_SOURCE_DIR})
endif()

add_library(qjs STATIC
    ${QUICKJS_DIR}/dtoa.c
    ${QUICKJS_DIR}/libregexp.c
    ${QUICKJS_DIR}/libunicode.c
    ${QUICKJS_DIR}/quickjs.c)
target_include_directories(qjs PUBLIC ${QUICKJS_DIR})
target_compile_definitions(qjs PRIVATE _GNU_SOURCE QUICKJS_NG_BUILD)
target_compile_options(qjs PRIVATE -funsigned-char -w -O2)
set_target_properties(qjs PROPERTIES C_VISIBILITY_PRESET hidden)

# ---------------------------------------------------------------------------
# prelude.js -> prelude_js.h
# ---------------------------------------------------------------------------
set(PRELUDE_JS ${PROJECT_SOURCE_DIR}/src/prelude.js)
set(PRELUDE_H ${CMAKE_CURRENT_BINARY_DIR}/generated/prelude_js.h)
add_custom_command(
    OUTPUT ${PRELUDE_H}
    COMMAND ${CMAKE_COMMAND} -DIN=${PRELUDE_JS} -DOUT=${PRELUDE_H} -DNAME=kPreludeJs -P ${PROJECT_SOURCE_DIR}/cmake/embed.cmake
    DEPENDS ${PRELUDE_JS} ${PROJECT_SOURCE_DIR}/cmake/embed.cmake
    COMMENT "Embedding prelude.js")

# ---------------------------------------------------------------------------
# studio/dist/index.html.gz -> studio_html.h (built with `npm run build` in studio/)
# ---------------------------------------------------------------------------
set(STUDIO_GZ ${PROJECT_SOURCE_DIR}/studio/dist/index.html.gz)
set(STUDIO_H ${CMAKE_CURRENT_BINARY_DIR}/generated/studio_html.h)
add_custom_command(
    OUTPUT ${STUDIO_H}
    COMMAND ${CMAKE_COMMAND} -DIN=${STUDIO_GZ} -DOUT=${STUDIO_H} -DNAME=kStudioHtmlGz -P ${PROJECT_SOURCE_DIR}/cmake/embed.cmake
    DEPENDS ${STUDIO_GZ} ${PROJECT_SOURCE_DIR}/cmake/embed.cmake
    COMMENT "Embedding the Studio page")

# ---------------------------------------------------------------------------
# the mod
# ---------------------------------------------------------------------------
set(SCRIPTEVAL_SOURCES
    src/main.cpp
    src/common.cpp
    src/platform.cpp
    src/memory.cpp
    src/module.cpp
    src/rtti.cpp
    src/heapscan.cpp
    src/cxxtypes.cpp
    src/ecs.cpp
    src/game.cpp
    src/blocks.cpp
    src/tickhook.cpp
    src/config.cpp
    src/jsengine.cpp
    src/jsnative.cpp
    src/inject_input.cpp
    src/input_backend.cpp
    src/http.cpp
    src/ziputil.cpp
    src/jsui.cpp
    src/ui.cpp
    src/repl.cpp
    src/session.cpp
    src/studio.cpp
    src/respack.cpp
    ${PRELUDE_H}
    ${STUDIO_H})
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64" OR CMAKE_ANDROID_ARCH_ABI STREQUAL "x86_64")
    list(APPEND SCRIPTEVAL_SOURCES src/stubs_x86_64.S)
else()
    list(APPEND SCRIPTEVAL_SOURCES src/stubs_aarch64.S src/stubs_static_aarch64.S)
endif()

add_library(scripteval SHARED ${SCRIPTEVAL_SOURCES})
target_include_directories(scripteval PRIVATE src ${CMAKE_CURRENT_BINARY_DIR}/generated)
target_link_libraries(scripteval PRIVATE qjs)
target_compile_options(scripteval PRIVATE -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers)
set_target_properties(scripteval PROPERTIES CXX_VISIBILITY_PRESET hidden C_VISIBILITY_PRESET hidden)

if(ANDROID)
    # mcpelauncher's libc shim does not provide the FORTIFY *_chk entry points
    target_compile_options(scripteval PRIVATE -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0)
    target_compile_options(qjs PRIVATE -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0)
    target_link_libraries(scripteval PRIVATE log dl)
    target_link_options(scripteval PRIVATE
        -Wl,--version-script,${PROJECT_SOURCE_DIR}/map.txt -Wl,--no-undefined-version
        -Wl,--gc-sections -Wl,--exclude-libs,ALL)
    set_target_properties(scripteval PROPERTIES LINK_DEPENDS ${PROJECT_SOURCE_DIR}/map.txt)
    if(CMAKE_BUILD_TYPE STREQUAL "Release")
        target_link_options(scripteval PRIVATE -s)
    endif()
else()
    target_link_libraries(scripteval PRIVATE dl pthread)
endif()

install(TARGETS scripteval LIBRARY DESTINATION mods)

# ---------------------------------------------------------------------------
# host tests (mock game)
# ---------------------------------------------------------------------------
if(SCRIPTEVAL_HOST_TEST)
    set(ENTT_DIR "" CACHE PATH "Path to an EnTT v3.16 checkout (for the mock game)")
    if(ENTT_DIR STREQUAL "")
        include(cmake/CPM.cmake)
        CPMAddPackage(NAME entt GITHUB_REPOSITORY skypjack/entt GIT_TAG v3.16.0 DOWNLOAD_ONLY YES)
        set(ENTT_DIR ${entt_SOURCE_DIR})
    endif()
    # Mock libminecraftpe.so with Bedrock-like classes, RTTI and an EnTT registry
    add_library(minecraftpe SHARED test/mockgame/mockgame.cpp)
    set_target_properties(minecraftpe PROPERTIES OUTPUT_NAME minecraftpe PREFIX "lib")
    target_include_directories(minecraftpe PRIVATE ${ENTT_DIR}/src)
    target_compile_definitions(minecraftpe PRIVATE ENTT_SPARSE_PAGE=2048 ENTT_PACKED_PAGE=128 ENTT_NO_MIXIN)
    target_compile_options(minecraftpe PRIVATE -O1 -fno-omit-frame-pointer)
    target_link_libraries(minecraftpe PRIVATE pthread)
    # Same mock with a drifted memory layout (tests the self-calibration)
    add_library(minecraftpe_alt SHARED test/mockgame/mockgame.cpp)
    set_target_properties(minecraftpe_alt PROPERTIES OUTPUT_NAME minecraftpe PREFIX "lib"
        LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/alt)
    target_include_directories(minecraftpe_alt PRIVATE ${ENTT_DIR}/src)
    target_compile_definitions(minecraftpe_alt PRIVATE ENTT_SPARSE_PAGE=2048 ENTT_PACKED_PAGE=128 ENTT_NO_MIXIN MOCK_ALT)
    target_compile_options(minecraftpe_alt PRIVATE -O1 -fno-omit-frame-pointer)
    target_link_libraries(minecraftpe_alt PRIVATE pthread)
    foreach(fake menu gamewindow mod)
        string(TOUPPER ${fake} FAKE_UPPER)
        add_library(fake_${fake} SHARED test/fakelauncher.cpp)
        target_compile_definitions(fake_${fake} PRIVATE FAKE_${FAKE_UPPER})
        set_target_properties(fake_${fake} PROPERTIES OUTPUT_NAME mcpelauncher_${fake} PREFIX "lib")
        target_link_libraries(fake_${fake} PRIVATE dl pthread)
    endforeach()
    add_executable(scripteval_test test/harness.cpp)
    target_link_libraries(scripteval_test PRIVATE dl pthread)
endif()
