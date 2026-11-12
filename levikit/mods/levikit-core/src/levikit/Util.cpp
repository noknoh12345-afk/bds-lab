#include "levikit/Common.h"
#include "levikit/Core.h"

#include "ll/api/io/FileUtils.h"
#include "ll/api/io/Logger.h"
#include "ll/api/service/Bedrock.h"
#include "ll/api/service/ServerInfo.h"

#include "mc/deps/core/utility/MCRESULT.h"
#include "mc/server/ServerLevel.h"
#include "mc/server/commands/CommandContext.h"
#include "mc/server/commands/CommandPermissionLevel.h"
#include "mc/server/commands/CurrentCmdVersion.h"
#include "mc/server/commands/MinecraftCommands.h"
#include "mc/server/commands/ServerCommandOrigin.h"
#include "mc/world/Minecraft.h"
#include "mc/world/actor/player/Player.h"
#include "mc/world/level/Level.h"

#include <algorithm>
#include <ctime>

namespace levikit {

Config&         cfg() { return Core::getInstance().config(); }
ll::io::Logger& logger() { return Core::getInstance().getSelf().getLogger(); }
bool            reloadConfigNow() { return Core::getInstance().reloadConfig(); }
bool            saveConfigNow() { return Core::getInstance().saveConfig(); }

// パネルはこの接頭辞の行を機械的に読む
void emitMachine(std::string const& kind, Json const& data) {
    logger().info("@@LEVIKIT {} {}", kind, data.dump(-1, ' ', false, Json::error_handler_t::replace));
}

bool runCommand(std::string const& cmd) {
    auto level     = ll::service::getLevel();
    auto minecraft = ll::service::getMinecraft();
    if (!level || !minecraft) return false;
    CommandContext ctx{
        cmd,
        std::make_unique<ServerCommandOrigin>("LeviKit", level->asServer(), CommandPermissionLevel::Owner, DimensionType{0}),
        static_cast<int>(CurrentCmdVersion::Latest)
    };
    try {
        return minecraft->mCommands->executeCommand(ctx, true).mSuccess;
    } catch (...) {
        return false;
    }
}

std::string quoteName(std::string const& name) {
    std::string out = "\"";
    for (char c : name) {
        if (c == '"' || c == '\\') continue;
        out.push_back(c);
    }
    out.push_back('"');
    return out;
}

std::string replaceAll(std::string s, std::string const& from, std::string const& to) {
    if (from.empty()) return s;
    size_t pos = 0;
    while ((pos = s.find(from, pos)) != std::string::npos) {
        s.replace(pos, from.size(), to);
        pos += to.size();
    }
    return s;
}

std::string fmtNum(double v) { return fmt::format("{:.2f}", v); }

long long nowUnix() { return static_cast<long long>(std::time(nullptr)); }

// ワールドに紐づくデータはワールドフォルダ内に置く（バックアップ/復元と一緒に動くように）
std::filesystem::path worldData() {
    if (auto w = ll::getWorldPath()) return *w / u8"levikit";
    return Core::getInstance().getSelf().getDataDir();
}

void writeJson(std::filesystem::path const& path, Json const& j) {
    std::error_code ec;
    std::filesystem::create_directories(path.parent_path(), ec);
    ll::file_utils::writeFile(path, j.dump());
}

std::optional<Json> readJson(std::filesystem::path const& path) {
    auto content = ll::file_utils::readFile(path);
    if (!content || content->empty()) return std::nullopt;
    try {
        return Json::parse(*content);
    } catch (...) {
        return std::nullopt;
    }
}

static std::string oneLine(std::string s) {
    std::replace(s.begin(), s.end(), '\n', ' ');
    std::replace(s.begin(), s.end(), '\r', ' ');
    return s;
}

void actionbar(Player& p, std::string const& text) {
    runCommand(fmt::format("title {} actionbar {}", quoteName(p.getRealName()), oneLine(text)));
}

void title(Player& p, std::string const& main, std::string const& sub) {
    auto q = quoteName(p.getRealName());
    if (!sub.empty()) runCommand(fmt::format("title {} subtitle {}", q, oneLine(sub)));
    if (!main.empty()) runCommand(fmt::format("title {} title {}", q, oneLine(main)));
}

bool containsName(std::vector<std::string> const& list, Player& p) {
    auto name = p.getRealName();
    auto xuid = p.getXuid();
    auto match = [&](std::string const& s) { return s == name || (!xuid.empty() && s == xuid); };
    for (auto const& item : list) {
        if (!item.empty() && item[0] == '@') {
            // 権限グループ "@名前"
            for (auto const& role : cfg().roles) {
                if (role.name == item.substr(1) && std::any_of(role.members.begin(), role.members.end(), match)) return true;
            }
        } else if (match(item)) {
            return true;
        }
    }
    return false;
}

} // namespace levikit
