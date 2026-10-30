// Line based TCP REPL on 127.0.0.1 (default port 25599).
//
//   nc 127.0.0.1 25599         (or tools/scripteval-repl.py for multi-line input)
#pragma once

namespace se::repl {

bool start(const char* bindAddr, int port);

}  // namespace se::repl
