#pragma once

#include "levikit/Config.h"

#include "ll/api/mod/NativeMod.h"

namespace levikit {

class Core {
public:
    static Core& getInstance();

    Core() : mSelf(*ll::mod::NativeMod::current()) {}

    [[nodiscard]] ll::mod::NativeMod& getSelf() const { return mSelf; }
    [[nodiscard]] Config&             config() { return mConfig; }

    bool load();
    bool enable();
    bool disable();

    /// config.json を読み直す（欠けたキーは既定値で補完、旧形式は移行）
    bool reloadConfig();
    /// 現在の設定を config.json に書き出す
    bool saveConfig();

private:
    ll::mod::NativeMod& mSelf;
    Config              mConfig;
};

} // namespace levikit
